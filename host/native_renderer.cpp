#include "native_renderer.h"
#include "startup_trace.h"

#include <QColor>
#include <QElapsedTimer>
#include <QFont>
#include <QGuiApplication>
#include <QInputMethod>
#include <QJSValue>
#include <QJsonValue>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQmlListReference>
#include <QQuickWindow>
#include <QRegularExpression>
#include <QScopeGuard>
#include <QSet>
#include <QTimer>
#include <QTextOption>

#include <algorithm>
#include <cmath>
#include <functional>
#include <unordered_map>
#include <utility>

namespace pulsar {

namespace {

const QSet<QString> &typesFillingWidth()
{
    static const QSet<QString> types = {
        QStringLiteral("card"),        QStringLiteral("list"),      QStringLiteral("scroll"),
        QStringLiteral("wrap"),        QStringLiteral("grid"),      QStringLiteral("virtualList"),
        QStringLiteral("appBar"),      QStringLiteral("divider"),   QStringLiteral("textInput"),
        QStringLiteral("textArea"),    QStringLiteral("pager"),     QStringLiteral("tabs"),
        QStringLiteral("navRail"),     QStringLiteral("segmented"), QStringLiteral("accordion"),
        QStringLiteral("accordionSection"), QStringLiteral("radioGroup"), QStringLiteral("searchField"),
        QStringLiteral("rangeSlider"), QStringLiteral("navBar"),
    };

    return types;
}

const QSet<QString> &typesFillingHeight()
{
    static const QSet<QString> types = {
        QStringLiteral("list"),  QStringLiteral("scroll"), QStringLiteral("grid"),    QStringLiteral("virtualList"),
        QStringLiteral("pager"), QStringLiteral("navRail"),
    };

    return types;
}

// Anything outside these sets is left to QML, so an unported prop can never be silently dropped.
const QSet<QString> &commonProps()
{
    static const QSet<QString> props = {
        QStringLiteral("key"),       QStringLiteral("width"),     QStringLiteral("height"),
        QStringLiteral("fill"),      QStringLiteral("fillWidth"), QStringLiteral("fillHeight"),
        QStringLiteral("expand"),    QStringLiteral("flex"),      QStringLiteral("align"),
        QStringLiteral("minWidth"),  QStringLiteral("minHeight"), QStringLiteral("maxWidth"),
        QStringLiteral("maxHeight"), QStringLiteral("visible"),   QStringLiteral("opacity"),
        QStringLiteral("enabled"),   QStringLiteral("zIndex"),    QStringLiteral("clip"),
        QStringLiteral("rotation"),  QStringLiteral("absolute"),
    };

    return props;
}

const QSet<QString> &paddingProps()
{
    static const QSet<QString> props = {
        QStringLiteral("padding"),      QStringLiteral("paddingX"),     QStringLiteral("paddingY"),
        QStringLiteral("paddingTop"),   QStringLiteral("paddingRight"), QStringLiteral("paddingBottom"),
        QStringLiteral("paddingLeft"),
    };

    return props;
}

const QSet<QString> &textProps()
{
    static const QSet<QString> props = {
        QStringLiteral("text"),   QStringLiteral("color"),      QStringLiteral("size"),
        QStringLiteral("bold"),   QStringLiteral("italic"),     QStringLiteral("strike"),
        QStringLiteral("wrap"),   QStringLiteral("weight"),     QStringLiteral("letterSpacing"),
        QStringLiteral("family"), QStringLiteral("lineHeight"), QStringLiteral("elide"),
        QStringLiteral("maxLines"),
    };

    return props;
}

const QSet<QString> &iconProps()
{
    static const QSet<QString> props = {
        QStringLiteral("name"),
        QStringLiteral("size"),
        QStringLiteral("color"),
    };

    return props;
}

const QSet<QString> &stateProps()
{
    static const QSet<QString> props = {
        QStringLiteral("hover"),
        QStringLiteral("hoverColor"),
        QStringLiteral("pressed"),
        QStringLiteral("disabled"),
    };

    return props;
}

const QSet<QString> &transitionProp()
{
    static const QSet<QString> props = { QStringLiteral("transition") };

    return props;
}

const QSet<QString> &boxProps()
{
    static const QSet<QString> props = {
        QStringLiteral("color"),
        QStringLiteral("radius"),
        QStringLiteral("borderWidth"),
        QStringLiteral("borderColor"),
    };

    return props;
}

const QSet<QString> &stackProps()
{
    static const QSet<QString> props = {
        QStringLiteral("gap"),
        QStringLiteral("spacing"),
        QStringLiteral("alignItems"),
        QStringLiteral("itemKeys"),
    };

    return props;
}

const QSet<QString> &spacerProps()
{
    static const QSet<QString> props = { QStringLiteral("size") };

    return props;
}

const QSet<QString> &scrollProps()
{
    static const QSet<QString> props = {
        QStringLiteral("gap"),
        QStringLiteral("spacing"),
        QStringLiteral("flick"),
        QStringLiteral("overscroll"),
        QStringLiteral("scrollKey"),
        QStringLiteral("scrollController"),
        QStringLiteral("itemKeys"),
    };

    return props;
}

// Events the renderer raises itself, so a node that only has these stays native.
bool passiveEvent(const QString &event)
{
    return event == QLatin1String("visible") || event == QLatin1String("enterViewport")
        || event == QLatin1String("leaveViewport") || event == QLatin1String("contextMenu")
        || event == QLatin1String("dropFiles");
}

bool hasActiveEvents(const QJsonArray &events)
{
    return std::any_of(events.begin(), events.end(), [](const QJsonValue &event) { return !passiveEvent(event.toString()); });
}

bool propsAllowed(const QJsonObject &props, std::initializer_list<const QSet<QString> *> allowed)
{
    for (auto it = props.begin(); it != props.end(); ++it) {
        const QString key = it.key();
        const bool known = std::any_of(allowed.begin(), allowed.end(), [&](const QSet<QString> *set) {
            return set->contains(key);
        });

        if (!known)
            return false;
    }

    return true;
}

// Same truthiness as the JS the QML state code runs.
bool truthy(const QJsonValue &value)
{
    if (value.isBool())
        return value.toBool();

    if (value.isDouble())
        return value.toDouble() != 0;

    if (value.isString())
        return !value.toString().isEmpty();

    return value.isObject() || value.isArray();
}

// Only colours are native; scale, opacity and the rest of a state style are motion and stay in QML.
bool statesPortable(const QJsonObject &props)
{
    for (const char *name : { "hover", "pressed", "disabled" }) {
        const QJsonValue style = props.value(QLatin1String(name));

        if (!style.isObject() && !style.isBool() && !style.isNull() && !style.isUndefined())
            return false;

        const QJsonObject object = style.toObject();

        for (auto it = object.begin(); it != object.end(); ++it) {
            const bool colour = it.key() == QLatin1String("color") || it.key() == QLatin1String("borderColor");

            if (!colour || !it.value().isString())
                return false;
        }
    }

    const QJsonValue hoverColor = props.value(QLatin1String("hoverColor"));

    if (props.contains(QLatin1String("hoverColor")) && !hoverColor.isString())
        return false;

    const QJsonValue transition = props.value(QLatin1String("transition"));

    if (!props.contains(QLatin1String("transition")))
        return true;

    if (!transition.isObject())
        return false;

    const QJsonObject object = transition.toObject();

    for (auto it = object.begin(); it != object.end(); ++it) {
        const bool known = it.key() == QLatin1String("duration") || it.key() == QLatin1String("curve");

        if (!known || (it.key() == QLatin1String("duration") && !it.value().isDouble()))
            return false;
    }

    return true;
}

qreal number(const QJsonObject &props, QLatin1String key, qreal fallback)
{
    const QJsonValue value = props.value(key);

    return value.isDouble() ? value.toDouble() : fallback;
}

NativeStack::Edges paddingEdges(const QJsonObject &props, qreal fallback = 0)
{
    const qreal all = number(props, QLatin1String("padding"), fallback);
    const qreal x = number(props, QLatin1String("paddingX"), all);
    const qreal y = number(props, QLatin1String("paddingY"), all);

    return {
        number(props, QLatin1String("paddingTop"), y),
        number(props, QLatin1String("paddingRight"), x),
        number(props, QLatin1String("paddingBottom"), y),
        number(props, QLatin1String("paddingLeft"), x),
    };
}

int fontWeight(const QJsonValue &value)
{
    static const QHash<QString, int> names = {
        { QStringLiteral("light"), 300 },
        { QStringLiteral("medium"), 500 },
        { QStringLiteral("semibold"), 600 },
        { QStringLiteral("bold"), 700 },
    };

    if (value.isDouble())
        return value.toInt();

    return names.value(value.toString(), 400);
}

bool replaceInNodes(QJsonArray &nodes, const QString &path, const QJsonObject &node, bool shallow)
{
    const QLatin1String pathKey("path");
    const QLatin1String childrenKey("children");

    for (qsizetype index = 0; index < nodes.size(); index++) {
        QJsonObject current = nodes.at(index).toObject();
        const QString currentPath = current.value(pathKey).toString();

        if (currentPath == path) {
            QJsonObject merged = node;

            if (shallow && !merged.contains(childrenKey) && current.contains(childrenKey))
                merged.insert(childrenKey, current.value(childrenKey));

            nodes.replace(index, merged);

            return true;
        }

        if (!path.startsWith(currentPath + QLatin1Char('/')))
            continue;

        QJsonArray children = current.value(childrenKey).toArray();

        if (!replaceInNodes(children, path, node, shallow))
            continue;

        current.insert(childrenKey, children);
        nodes.replace(index, current);

        return true;
    }

    return false;
}

QString nodeLabel(const QJsonObject &node)
{
    return node.value(QLatin1String("type")).toString() + QLatin1Char('@') + node.value(QLatin1String("path")).toString();
}

QString keyedRoute(const QJsonArray &nodes, int level)
{
    if (level > 1)
        return {};

    for (const QJsonValue &value : nodes) {
        const QJsonObject node = value.toObject();

        if (node.value(QLatin1String("props")).toObject().contains(QLatin1String("key")))
            return nodeLabel(node);

        const QString nested = keyedRoute(node.value(QLatin1String("children")).toArray(), level + 1);

        if (!nested.isEmpty())
            return nested;
    }

    return {};
}

void collectShape(const QJsonArray &nodes, int level, QStringList &parts)
{
    if (level > 3)
        return;

    for (const QJsonValue &value : nodes) {
        const QJsonObject node = value.toObject();

        parts.append(nodeLabel(node));
        collectShape(node.value(QLatin1String("children")).toArray(), level + 1, parts);
    }
}

QString treeShape(const QJsonArray &tree)
{
    const QString keyed = keyedRoute(tree, 0);

    if (!keyed.isEmpty())
        return keyed;

    QStringList parts;

    collectShape(tree, 0, parts);

    return parts.join(QLatin1Char('|'));
}

QVariantMap asMap(const QVariant &value)
{
    if (value.canConvert<QJSValue>())
        return value.value<QJSValue>().toVariant().toMap();

    return value.toMap();
}

QVariant itemArg(QObject *item)
{
    return QVariant::fromValue(item);
}

bool debugging()
{
    static const bool enabled = qEnvironmentVariableIsSet("PULSAR_DEBUG");

    return enabled;
}


// Leaf nodes drawn by Qt Quick Controls items that C++ creates and drives; QML runs no JS for them.
struct ControlSpec {
    QSet<QString> props;
    QSet<QString> events;
};

const ControlSpec *controlSpec(const QString &type)
{
    static const auto set = [](std::initializer_list<const char *> names) {
        QSet<QString> out;

        for (const char *name : names)
            out.insert(QLatin1String(name));

        return out;
    };

    static const QSet<QString> fieldProps = set({ "value", "placeholder", "variant", "color", "textColor", "borderColor",
                                                   "focusBorderColor", "radius", "password", "strike", "keyboardType",
                                                   "autoFocus", "focus", "maxLength", "readOnly", "selectable", "lines", "multiline" });
    static const QSet<QString> fieldEvents = set({ "input", "submit", "focus", "blur" });

    static const QHash<QString, ControlSpec> specs = {
        { QStringLiteral("button"),
          { set({ "label", "variant", "size", "color", "textColor", "radius", "icon", "iconPosition" }), set({ "click" }) } },
        { QStringLiteral("iconButton"), { set({ "name", "color", "size" }), set({ "click" }) } },
        { QStringLiteral("checkbox"), { set({ "label", "checked" }), set({ "toggle" }) } },
        { QStringLiteral("switch"), { set({ "label", "checked" }), set({ "toggle" }) } },
        { QStringLiteral("chip"),
          { set({ "label", "variant", "color", "textColor", "selected", "selectedColor" }), set({ "click", "remove" }) } },
        { QStringLiteral("divider"), { set({ "color" }), {} } },
        { QStringLiteral("progress"), { set({ "indeterminate", "value", "color" }), {} } },
        { QStringLiteral("spinner"), { set({ "size", "color", "thickness", "value" }), {} } },
        { QStringLiteral("badge"), { set({ "label", "count", "dot", "color", "textColor" }), {} } },
        { QStringLiteral("avatar"), { set({ "src", "name", "size", "radius", "status", "statusColor" }), {} } },
        { QStringLiteral("textInput"), { fieldProps, fieldEvents } },
        { QStringLiteral("textArea"), { fieldProps, fieldEvents } },
    };

    const auto found = specs.constFind(type);

    return found == specs.constEnd() ? nullptr : &*found;
}

bool controlPortable(const ControlSpec &spec, const QJsonObject &json)
{
    const QJsonObject props = json.value(QLatin1String("props")).toObject();
    const QJsonArray events = json.value(QLatin1String("events")).toArray();

    if (!propsAllowed(props, { &commonProps(), &spec.props }))
        return false;

    // An elevated button casts a shadow, which only the QML path draws.
    if (json.value(QLatin1String("type")).toString() == QLatin1String("button")
        && props.value(QLatin1String("variant")).toString() == QLatin1String("elevated"))
        return false;

    return std::all_of(events.begin(), events.end(), [&](const QJsonValue &event) {
        return spec.events.contains(event.toString()) || passiveEvent(event.toString());
    });
}

QString textOf(const QJsonObject &props, const char *key, const QString &fallback = QString())
{
    const QJsonValue value = props.value(QLatin1String(key));

    return value.isString() ? value.toString() : fallback;
}

} // namespace

NativeStack::NativeStack(QQuickItem *parent)
    : QQuickItem(parent)
{
    connect(this, &QQuickItem::windowChanged, this, &NativeStack::windowChanged);
}

void NativeStack::hintsChanged()
{
    polish();
}

void NativeStack::windowChanged(QQuickWindow *next)
{
    if (!next)
        return;

    // The window mirrors layouts with LayoutMirroring and exposes the result as layoutMirrored.
    connect(next, SIGNAL(layoutMirroredChanged()), this, SLOT(hintsChanged()), Qt::UniqueConnection);

    polish();
}

bool NativeStack::mirrored() const
{
    return window() && window()->property("layoutMirrored").toBool();
}

QPointF NativeStack::mirroredAt(qreal x, qreal y, qreal itemWidth) const
{
    return { mirrored() ? width() - x - itemWidth : x, y };
}

void NativeStack::configure(Mode mode, qreal gap, const Edges &edges)
{
    if (mode_ == mode && gap_ == gap && edges_ == edges)
        return;

    mode_ = mode;
    gap_ = gap;
    edges_ = edges;

    polish();
}

void NativeStack::watch(const Kid &kid)
{
    connect(kid.item, &QQuickItem::implicitWidthChanged, this, &NativeStack::hintsChanged);
    connect(kid.item, &QQuickItem::implicitHeightChanged, this, &NativeStack::hintsChanged);
    connect(kid.item, &QQuickItem::visibleChanged, this, &NativeStack::hintsChanged);

    if (!kid.qml)
        return;

    for (const QQmlProperty *hint : { &kid.qml->fillWidth, &kid.qml->fillHeight, &kid.qml->preferredWidth,
                                      &kid.qml->preferredHeight, &kid.qml->minimumWidth, &kid.qml->minimumHeight,
                                      &kid.qml->maximumWidth, &kid.qml->maximumHeight })
        hint->connectNotifySignal(this, SLOT(hintsChanged()));
}

void NativeStack::setKids(const QList<Kid> &kids)
{
    QSet<QQuickItem *> known;

    known.reserve(kids_.size());

    for (const Kid &kid : std::as_const(kids_))
        known.insert(kid.item);

    kids_ = kids;

    for (const Kid &kid : std::as_const(kids_)) {
        if (!known.contains(kid.item))
            watch(kid);
    }

    mergeLeaving();
    polish();
}

void NativeStack::keepLeaving(const Kid &kid, QQuickItem *after)
{
    leaving_.append({ kid, after });
    mergeLeaving();

    connect(kid.item, &QObject::destroyed, this, [this, item = kid.item]() {
        leaving_.removeIf([item](const Leaving &entry) { return entry.kid.item == item; });
        ordered_.removeIf([item](const Kid &entry) { return entry.item == item; });

        polish();
    });
}

void NativeStack::mergeLeaving()
{
    ordered_ = kids_;

    for (const Leaving &entry : std::as_const(leaving_)) {
        const auto slot = std::find_if(ordered_.begin(), ordered_.end(), [&](const Kid &kid) {
            return kid.item == entry.after.data();
        });

        ordered_.insert(slot == ordered_.end() ? 0 : std::distance(ordered_.begin(), slot) + 1, entry.kid);
    }
}

void NativeStack::geometryChange(const QRectF &next, const QRectF &previous)
{
    QQuickItem::geometryChange(next, previous);

    if (next.size() != previous.size())
        polish();
}

void NativeStack::placeLayers()
{
    // Without it a stack that is not given a size is 0 by 0 and its children centre on its corner.
    qreal hugWidth = 0;
    qreal hugHeight = 0;

    for (const Kid &kid : std::as_const(ordered_)) {
        const Measured size = measure(kid);
        const Absolute &at = kid.absolute;

        if (!at.enabled && kid.item->isVisible()) {
            hugWidth = qMax(hugWidth, size.preferredWidth);
            hugHeight = qMax(hugHeight, size.preferredHeight);
        }

        if (at.enabled) {
            const qreal w = at.left.set && at.right.set ? width() - at.left.value - at.right.value : size.preferredWidth;
            const qreal h = at.top.set && at.bottom.set ? height() - at.top.value - at.bottom.value : size.preferredHeight;
            const qreal x = at.left.set ? at.left.value : at.right.set ? width() - at.right.value - w : 0;
            const qreal y = at.top.set ? at.top.value : at.bottom.set ? height() - at.bottom.value - h : 0;

            kid.item->setPosition(mirroredAt(x, y, w));
            kid.item->setSize({ w, h });

            continue;
        }

        if (kid.fillsLayer) {
            kid.item->setPosition({ 0, 0 });
            kid.item->setSize({ width(), height() });

            continue;
        }

        kid.item->setPosition({ (width() - size.preferredWidth) / 2, (height() - size.preferredHeight) / 2 });
        kid.item->setSize({ size.preferredWidth, size.preferredHeight });
    }

    setImplicitSize(hugWidth, hugHeight);
}

// How far a child has opened while it animates its height; its gap scales with it.
static qreal openShare(const QObject *motion)
{
    const qreal full = motion->property("fullHeight").toReal();
    const qreal limit = motion->property("heightLimit").toReal();

    if (full <= 0 || limit >= full)
        return 1;

    return qMax(0.0, limit / full);
}

NativeStack::Measured NativeStack::measure(const Kid &kid) const
{
    Measured out;

    out.kid = &kid;
    out.fillWidth = kid.fillWidth;
    out.fillHeight = kid.fillHeight;
    out.shrinks = kid.shrinks;
    out.preferredWidth = kid.preferredWidth;
    out.preferredHeight = kid.preferredHeight;
    out.minWidth = kid.minWidth;
    out.minHeight = kid.minHeight;
    out.maxWidth = kid.maxWidth;
    out.maxHeight = kid.maxHeight;

    if (kid.qml) {
        out.fillWidth = kid.qml->fillWidth.read().toBool();
        out.fillHeight = kid.qml->fillHeight.read().toBool();
        out.preferredWidth = kid.qml->preferredWidth.read().toReal();
        out.preferredHeight = kid.qml->preferredHeight.read().toReal();
        out.minWidth = kid.qml->minimumWidth.read().toReal();
        out.minHeight = kid.qml->minimumHeight.read().toReal();
        out.maxWidth = kid.qml->maximumWidth.read().toReal();
        out.maxHeight = kid.qml->maximumHeight.read().toReal();

        if (kid.qml->motion)
            out.share = openShare(kid.qml->motion);
    }

    if (out.preferredWidth < 0)
        out.preferredWidth = kid.item->implicitWidth();

    out.heightIsContent = out.preferredHeight < 0;

    if (out.preferredHeight < 0)
        out.preferredHeight = kid.item->implicitHeight();

    if (kid.flex > 0 && mode_ == Mode::Row)
        out.preferredWidth = 0;

    if (kid.flex > 0 && mode_ == Mode::Column)
        out.preferredHeight = 0;

    out.preferredWidth = qBound(out.minWidth, out.preferredWidth, qMax(out.minWidth, out.maxWidth));
    out.preferredHeight = qBound(out.minHeight, out.preferredHeight, qMax(out.minHeight, out.maxHeight));

    return out;
}

// A kid that narrows takes its height from the width it ends up with, which a wrapping text only
// knows once it has that width.
void NativeStack::narrowTo(Measured &kid, qreal width)
{
    width = qBound(kid.minWidth, width, qMax(kid.minWidth, kid.maxWidth));

    if (width == kid.preferredWidth)
        return;

    kid.preferredWidth = width;
    kid.kid->item->setWidth(width);
    kid.kid->item->ensurePolished();

    if (kid.heightIsContent)
        kid.preferredHeight = qBound(kid.minHeight, kid.kid->item->implicitHeight(), qMax(kid.minHeight, kid.maxHeight));
}

void NativeStack::shrinkInColumn(QList<Measured> &shown, qreal crossSpace) const
{
    for (Measured &kid : shown) {
        if (!kid.shrinks || kid.kid->flex > 0)
            continue;

        if (kid.fillWidth || kid.preferredWidth > crossSpace)
            narrowTo(kid, crossSpace);
    }
}

void NativeStack::shrinkAlongRow(QList<Measured> &shown, qreal mainSpace) const
{
    qreal total = 0;
    qreal narrowable = 0;

    for (const Measured &kid : std::as_const(shown)) {
        total += kid.preferredWidth;

        if (kid.shrinks && !kid.fillWidth && kid.kid->flex <= 0)
            narrowable += kid.preferredWidth;
    }

    const qreal overflow = total - mainSpace;

    if (overflow <= 0 || narrowable <= 0)
        return;

    // Each one gives up the same share of its width, so a long text does not squeeze a short one.
    const qreal keep = qMax(0.0, narrowable - overflow) / narrowable;

    for (Measured &kid : shown) {
        if (kid.shrinks && !kid.fillWidth && kid.kid->flex <= 0)
            narrowTo(kid, kid.preferredWidth * keep);
    }
}

void NativeStack::placeOverlapping()
{
    for (const Kid &kid : std::as_const(ordered_)) {
        const Measured size = measure(kid);

        kid.item->setPosition({ 0, 0 });
        kid.item->setSize({ width(), size.fillHeight ? height() : size.preferredHeight });
    }
}

void NativeStack::updatePolish()
{
    if (mode_ == Mode::Overlap) {
        placeOverlapping();
        return;
    }

    if (mode_ == Mode::Layers) {
        placeLayers();
        return;
    }

    const bool row = mode_ == Mode::Row;

    QList<Measured> shown;

    shown.reserve(ordered_.size());

    for (const Kid &kid : std::as_const(ordered_)) {
        if (kid.item->isVisible())
            shown.append(measure(kid));
    }

    const qreal mainEdges = row ? edges_.left + edges_.right : edges_.top + edges_.bottom;
    const qreal crossEdges = row ? edges_.top + edges_.bottom : edges_.left + edges_.right;
    qreal gaps = 0;
    qreal opened = 0;

    for (Measured &kid : shown) {
        // Only columns animate their gaps.
        const qreal share = row ? 1 : kid.share;

        kid.gapBefore = gap_ * share * qMin(1.0, opened);
        gaps += kid.gapBefore;
        opened += share;
    }

    const qreal mainSpace = (row ? width() : height()) - mainEdges - gaps;
    const qreal crossSpace = qMax(0.0, (row ? height() : width()) - crossEdges);

    // The widths the content wants, taken before anything narrows to fit: a hugging parent reports
    // these and not the width it has now, so it can grow back when the window does.
    qreal wantedWidth = 0;

    for (const Measured &kid : std::as_const(shown))
        wantedWidth = row ? wantedWidth + kid.preferredWidth : qMax(wantedWidth, kid.preferredWidth);

    if (row)
        shrinkAlongRow(shown, mainSpace);
    else
        shrinkInColumn(shown, crossSpace);

    qreal fixedMain = 0;
    qreal implicitMain = 0;
    qreal implicitCross = 0;
    qreal weights = 0;

    for (const Measured &kid : std::as_const(shown)) {
        const qreal preferred = row ? kid.preferredWidth : kid.preferredHeight;
        const bool fills = row ? kid.fillWidth : kid.fillHeight;

        implicitMain += preferred;
        implicitCross = qMax(implicitCross, row ? kid.preferredHeight : kid.preferredWidth);

        if (kid.kid->flex > 0)
            weights += kid.kid->flex;
        else if (fills)
            weights += 1;
        else
            fixedMain += preferred;
    }

    const qreal perWeight = weights > 0 ? qMax(0.0, mainSpace - fixedMain) / weights : 0;

    qreal cursor = row ? edges_.left : edges_.top;

    for (const Measured &kid : std::as_const(shown)) {
        cursor += kid.gapBefore;
        cursor += place(kid, perWeight, crossSpace, cursor);
    }

    if (row)
        implicitMain = wantedWidth;
    else
        implicitCross = wantedWidth;

    const qreal contentMain = implicitMain + gaps + mainEdges;
    const qreal contentCross = implicitCross + crossEdges;

    setImplicitSize(row ? contentMain : contentCross, row ? contentCross : contentMain);
}

qreal NativeStack::place(const Measured &kid, qreal perWeight, qreal crossSpace, qreal cursor)
{
    const bool row = mode_ == Mode::Row;
    const bool fillsMain = row ? kid.fillWidth : kid.fillHeight;
    const bool fillsCross = row ? kid.fillHeight : kid.fillWidth;
    const qreal preferredMain = row ? kid.preferredWidth : kid.preferredHeight;
    const qreal preferredCross = row ? kid.preferredHeight : kid.preferredWidth;
    const qreal minMain = row ? kid.minWidth : kid.minHeight;
    const qreal maxMain = row ? kid.maxWidth : kid.maxHeight;
    const qreal minCross = row ? kid.minHeight : kid.minWidth;
    const qreal maxCross = row ? kid.maxHeight : kid.maxWidth;

    qreal main = preferredMain;

    if (kid.kid->flex > 0)
        main = perWeight * kid.kid->flex;
    else if (fillsMain)
        main = qMax(preferredMain, perWeight);

    main = qBound(minMain, main, qMax(minMain, maxMain));

    qreal cross = fillsCross ? crossSpace : preferredCross;

    cross = qBound(minCross, cross, qMax(minCross, maxCross));

    const Align align = kid.kid->align != Align::Default ? kid.kid->align : row ? Align::Center : Align::Start;

    qreal crossAt = row ? edges_.top : edges_.left;

    if (align == Align::Center)
        crossAt += (crossSpace - cross) / 2;
    else if (align == Align::End)
        crossAt += crossSpace - cross;

    const QSizeF size = row ? QSizeF(main, cross) : QSizeF(cross, main);
    const QPointF at = row ? QPointF(cursor, crossAt) : QPointF(crossAt, cursor);

    kid.kid->item->setPosition(mirroredAt(at.x(), at.y(), size.width()));
    kid.kid->item->setSize(size);

    return main;
}

NativeRenderer::NativeRenderer(QObject *parent)
    : QObject(parent)
{
}

NativeRenderer::~NativeRenderer() = default;

void NativeRenderer::attach(QObject *root)
{
    const QVariant host = root ? root->property("nativeHost") : QVariant();

    if (!host.isValid() || root == root_)
        return;

    root_ = root;
    host_ = host.value<QQuickItem *>();
    flickable_ = root->property("nativeFlickable").value<QQmlComponent *>();
    clickableBox_ = root->property("nativeClickableBox").value<QQmlComponent *>();
    stateBox_ = root->property("nativeStateBox").value<QQmlComponent *>();

    const QList<std::pair<const char *, const char *>> controls = {
        { "button", "nativeButton" },   { "iconButton", "nativeIconButton" }, { "checkbox", "nativeCheckbox" },
        { "switch", "nativeSwitch" },   { "chip", "nativeChip" },             { "progress", "nativeProgress" },
        { "spinner", "nativeSpinner" }, { "badge", "nativeBadge" },           { "avatar", "nativeAvatar" },
        { "textInput", "nativeTextField" }, { "textArea", "nativeTextArea" },
    };

    controls_.clear();

    for (const auto &[type, property] : controls)
        controls_.insert(QLatin1String(type), root->property(property).value<QQmlComponent *>());

    QQmlEngine *engine = qmlEngine(root);

    rectangle_ = std::make_unique<QQmlComponent>(engine);
    rectangle_->setData("import QtQuick; Rectangle {}", QUrl());
    text_ = std::make_unique<QQmlComponent>(engine);
    text_->setData("import QtQuick; Text {}", QUrl());
    fieldTap_ = std::make_unique<QQmlComponent>(engine);
    fieldTap_->setData("import QtQuick; TapHandler {}", QUrl());

    root->setProperty("nativeRenderer", QVariant::fromValue(static_cast<QObject *>(this)));

    // Queued: the theme bindings derived from themeData have to settle first.
    connect(root, SIGNAL(themeDataChanged()), this, SLOT(refreshTheme()),
            Qt::ConnectionType(Qt::QueuedConnection | Qt::UniqueConnection));

    loadTheme();
    createRoot();

    if (!hasPendingTree_)
        return;

    const QJsonArray tree = std::exchange(pendingTree_, {});

    hasPendingTree_ = false;

    renderTree(tree);
}

void NativeRenderer::detach()
{
    if (!root_)
        return;

    pendingTree_ = snapshot();
    hasPendingTree_ = true;
    waitingForTransition_ = false;
    treeShape_.clear();

    // The window owns the items and is about to delete them.
    index_.clear();
    watched_.clear();
    hooked_.clear();
    pendingVisibility_.clear();
    tree_.reset();
    root_ = nullptr;
    host_ = nullptr;
}

void NativeRenderer::clear()
{
    hasPendingTree_ = false;
    pendingTree_ = {};
    queuedPatches_.clear();
    waitingForTransition_ = false;
    treeShape_.clear();

    if (tree_)
        syncChildren(*tree_, QJsonArray());
}

void NativeRenderer::loadTheme()
{
    theme_.colors = asMap(root_->property("themeColors"));
    theme_.text = root_->property("themeText");
    theme_.border = root_->property("themeBorder");
    theme_.surface = root_->property("themeSurface");
    theme_.primary = root_->property("themePrimary");
    theme_.onPrimary = root_->property("themeOnPrimary");
    theme_.surfaceVariant = root_->property("themeSurfaceVariant");
    theme_.textSecondary = root_->property("themeTextSecondary");
    theme_.radius = root_->property("themeRadius").toInt();
    theme_.fontFamily = root_->property("fontFamily").toString();
    theme_.iconFamily = root_->property("iconFamily").toString();
    theme_.fontScale = root_->property("fontScale").toReal();
    theme_.spacing = root_->property("themeSpacing").toInt();
}

void NativeRenderer::refreshTheme()
{
    if (!root_ || !tree_)
        return;

    loadTheme();

    for (const std::unique_ptr<Node> &child : tree_->children)
        reapplyAll(*child);
}

void NativeRenderer::reapplyAll(Node &node)
{
    if (node.kind == Kind::Island) {
        updateIsland(node, false);
        return;
    }

    if (node.kind == Kind::Shell)
        updateIsland(node, false);
    else
        applyProps(node);

    for (const std::unique_ptr<Node> &child : node.children)
        reapplyAll(*child);
}

void NativeRenderer::updateIsland(Node &node, bool shallow)
{
    QMetaObject::invokeMethod(root_, "nativeUpdate", Q_ARG(QVariant, itemArg(node.item)),
                              Q_ARG(QVariant, node.json.toVariantMap()), Q_ARG(QVariant, shallow));

    // A node gets its motion object the first time it asks for an animation.
    if (node.hints && !node.hints->motion)
        node.hints->motion = node.item->findChild<QObject *>(QStringLiteral("pulsarMotion"), Qt::FindDirectChildrenOnly);
}

void NativeRenderer::createRoot()
{
    auto root = std::make_unique<Node>();
    auto *stack = new NativeStack();
    QQuickItem *host = host_;

    adopt(stack, host);

    stack->configure(NativeStack::Mode::Overlap, 0, {});
    stack->setSize(host->size());

    connect(host, &QQuickItem::widthChanged, stack, [stack, host]() { stack->setWidth(host->width()); });
    connect(host, &QQuickItem::heightChanged, stack, [stack, host]() { stack->setHeight(host->height()); });

    root->type = QStringLiteral("root");
    root->kind = Kind::Stack;
    root->item = stack;
    root->stack = stack;

    tree_ = std::move(root);
}

void NativeRenderer::setTree(const QJsonArray &tree)
{
    if (!root_ || waitingForTransition_) {
        queuedPatches_.clear();
        pendingTree_ = tree;
        hasPendingTree_ = true;

        return;
    }

    renderTree(tree);
}

void NativeRenderer::renderTree(const QJsonArray &tree)
{
    const QString shape = treeShape(tree);
    const bool routeChanged = !treeShape_.isEmpty() && shape != treeShape_;

    treeShape_ = shape;

    root_->setProperty("errorText", QString());

    pendingTree_ = tree;
    hasPendingTree_ = true;

    if (!routeChanged) {
        commit();
        return;
    }

    QVariant waiting;

    QMetaObject::invokeMethod(root_, "nativeTransition", Q_RETURN_ARG(QVariant, waiting));

    waitingForTransition_ = waiting.toBool();
}

void NativeRenderer::commit()
{
    if (!root_ || !hasPendingTree_)
        return;

    waitingForTransition_ = false;

    const QJsonArray tree = std::exchange(pendingTree_, {});

    hasPendingTree_ = false;
    stats_ = {};

    QElapsedTimer timer;

    timer.start();
    syncChildren(*tree_, tree);

    const qint64 elapsed = timer.elapsed();

    pulsar::startupMark("ui-built");

    if (debugging())
        qInfo().noquote().nospace() << "PulsarView built " << tree.size() << " +" << stats_.created << " ~"
                                    << stats_.updated << " -" << stats_.removed << " reorder=" << stats_.reordered
                                    << " " << elapsed << "ms";

    QMetaObject::invokeMethod(root_, "nativeAfterTree", Q_ARG(QVariant, QVariant(tree.size())),
                              Q_ARG(QVariant, QVariant(elapsed)));

    for (const QJsonArray &patches : std::exchange(queuedPatches_, {}))
        applyPatchList(patches);
}

void NativeRenderer::applyPatches(const QJsonArray &patches)
{
    if (root_ && !waitingForTransition_) {
        applyPatchList(patches);
        return;
    }

    queuedPatches_.append(patches);
}

void NativeRenderer::applyPatchList(const QJsonArray &patches)
{
    stats_ = {};
    dirtyStacks_.clear();

    QElapsedTimer timer;

    timer.start();

    for (const QJsonValue &value : patches) {
        const QJsonObject patch = value.toObject();

        if (patch.contains(QLatin1String("op"))) {
            applyChildOp(patch);

            continue;
        }

        applyPatch(patch.value(QLatin1String("path")).toString(), patch.value(QLatin1String("node")).toObject(),
                   patch.value(QLatin1String("shallow")).toBool());
    }

    for (Node *stack : std::as_const(dirtyStacks_))
        refreshKids(*stack);

    dirtyStacks_.clear();

    if (debugging())
        qInfo().noquote().nospace() << "PulsarView patch " << patches.size() << " +" << stats_.created << " ~"
                                    << stats_.updated << " -" << stats_.removed << " reorder=" << stats_.reordered
                                    << " " << timer.elapsed() << "ms";
}

void NativeRenderer::applyPatch(const QString &path, const QJsonObject &json, bool shallow)
{
    Node *node = index_.value(path);

    if (!node) {
        if (!patchIsland(path, json, shallow))
            qWarning().noquote() << "pulsar: patch for an unknown node" << path;

        return;
    }

    if (node->kind == Kind::Island) {
        QJsonObject merged = json;

        if (shallow)
            merged.insert(QLatin1String("children"), node->json.value(QLatin1String("children")));

        if (kindFor(merged, node->insideScroll) != Kind::Island || node->type != json.value(QLatin1String("type")).toString()) {
            replaceNode(*node, merged);
            return;
        }

        stats_.updated++;
        syncIsland(*node, merged, shallow);

        return;
    }

    // A shallow patch has no children, and a scroll's kind can depend on them.
    const Kind kind = shallow && node->kind == Kind::Scroll ? node->kind : kindFor(json, node->insideScroll);

    if (kind != node->kind || node->type != json.value(QLatin1String("type")).toString()) {
        QJsonObject merged = json;

        if (shallow)
            merged.insert(QLatin1String("children"), snapshotNode(*node).value(QLatin1String("children")));

        replaceNode(*node, merged);

        return;
    }

    const QJsonObject before = node->props;

    stats_.updated++;
    sync(*node, json, !shallow);

    if (node->parent && node->props != before)
        dirtyStacks_.insert(node->parent);
}

bool NativeRenderer::patchIsland(const QString &path, const QJsonObject &json, bool shallow)
{
    QString prefix = path;
    Node *island = nullptr;

    while (!island) {
        const qsizetype slash = prefix.lastIndexOf(QLatin1Char('/'));

        if (slash <= 0)
            return false;

        prefix.truncate(slash);
        island = index_.value(prefix);
    }

    if (island->kind != Kind::Island)
        return false;

    QJsonArray wrapper = { island->json };

    if (!replaceInNodes(wrapper, path, json, shallow))
        return false;

    island->json = wrapper.at(0).toObject();
    island->props = island->json.value(QLatin1String("props")).toObject();

    stats_.updated++;

    QVariant patched;

    QMetaObject::invokeMethod(root_, "nativePatch", Q_RETURN_ARG(QVariant, patched), Q_ARG(QVariant, path),
                              Q_ARG(QVariant, json.toVariantMap()), Q_ARG(QVariant, shallow));

    if (!patched.toBool())
        updateIsland(*island, false);

    return true;
}

namespace {

QString parentPathOf(const QString &path)
{
    return path.left(qMax<qsizetype>(0, path.lastIndexOf(QLatin1Char('/'))));
}

QJsonObject jsonAt(const QJsonObject &node, const QString &path)
{
    const QString own = node.value(QLatin1String("path")).toString();

    if (own == path)
        return node;

    if (!path.startsWith(own + QLatin1Char('/')))
        return {};

    for (const QJsonValue &child : node.value(QLatin1String("children")).toArray()) {
        const QJsonObject found = jsonAt(child.toObject(), path);

        if (!found.isEmpty())
            return found;
    }

    return {};
}

bool editChildrenJson(QJsonArray &children, const QString &op, const QString &path, qsizetype index, const QJsonObject &json)
{
    if (op == QLatin1String("insert")) {
        children.insert(qBound<qsizetype>(0, index, children.size()), json);

        return true;
    }

    for (qsizetype at = 0; at < children.size(); at++) {
        if (children.at(at).toObject().value(QLatin1String("path")).toString() != path)
            continue;

        const QJsonValue moved = children.at(at);

        children.removeAt(at);

        if (op == QLatin1String("move"))
            children.insert(qBound<qsizetype>(0, index, children.size()), moved);

        return true;
    }

    return false;
}

} // namespace

bool NativeRenderer::editNativeChildren(Node &parent, const QString &op, const QString &path, qsizetype index,
                                        const QJsonObject &json)
{
    auto &children = parent.children;

    if (op == QLatin1String("insert")) {
        const qsizetype at = qBound<qsizetype>(0, index, qsizetype(children.size()));

        children.insert(children.begin() + at, createSynced(json, &parent));

        return true;
    }

    const auto slot = std::find_if(children.begin(), children.end(),
                                   [&](const std::unique_ptr<Node> &child) { return child->path == path; });

    if (slot == children.end())
        return false;

    if (op == QLatin1String("move")) {
        std::unique_ptr<Node> moved = std::move(*slot);

        children.erase(slot);
        children.insert(children.begin() + qBound<qsizetype>(0, index, qsizetype(children.size())), std::move(moved));

        stats_.reordered++;

        return true;
    }

    QQuickItem *after = slot == children.begin() ? nullptr : (*std::prev(slot))->item;
    std::unique_ptr<Node> removed = std::move(*slot);

    children.erase(slot);

    stats_.removed++;

    dirtyStacks_.remove(removed.get());
    discard(*removed, after);

    return true;
}

// Islands and shells re-sync their whole child list, as a full node patch does.
void NativeRenderer::editChildrenByJson(const QString &parentPath, const QString &op, const QString &path,
                                        qsizetype index, const QJsonObject &json)
{
    const Node *known = index_.value(parentPath);
    QJsonObject parent;

    if (known && known->kind == Kind::Island) {
        parent = known->json;
    } else if (known) {
        parent = snapshotNode(*known);
    } else {
        QString prefix = parentPath;

        while (parent.isEmpty()) {
            const qsizetype slash = prefix.lastIndexOf(QLatin1Char('/'));

            if (slash <= 0)
                break;

            prefix.truncate(slash);

            const Node *island = index_.value(prefix);

            if (island && island->kind == Kind::Island)
                parent = jsonAt(island->json, parentPath);
        }
    }

    QJsonArray children = parent.value(QLatin1String("children")).toArray();

    if (parent.isEmpty() || !editChildrenJson(children, op, path, index, json)) {
        qWarning().noquote() << "pulsar: child patch for an unknown node" << path;

        return;
    }

    parent.insert(QLatin1String("children"), children);

    applyPatch(parentPath, parent, false);
}

void NativeRenderer::applyChildOp(const QJsonObject &patch)
{
    const QString op = patch.value(QLatin1String("op")).toString();
    const QString path = patch.value(QLatin1String("path")).toString();
    const QJsonObject json = patch.value(QLatin1String("node")).toObject();
    const qsizetype index = patch.value(QLatin1String("index")).toInt();
    const QString parentPath = op == QLatin1String("insert") ? path : parentPathOf(path);
    Node *parent = index_.value(parentPath);

    const bool native = parent && parent->stack && parent->kind != Kind::Island && parent->kind != Kind::Shell;

    if (!native) {
        editChildrenByJson(parentPath, op, path, index, json);

        return;
    }

    if (!editNativeChildren(*parent, op, path, index, json)) {
        qWarning().noquote() << "pulsar: child patch for an unknown node" << path;

        return;
    }

    dirtyStacks_.insert(parent);
}

void NativeRenderer::replaceNode(Node &node, const QJsonObject &json)
{
    Node *parent = node.parent;

    const auto slot = std::find_if(parent->children.begin(), parent->children.end(),
                                   [&](const std::unique_ptr<Node> &child) { return child.get() == &node; });

    QQuickItem *after = slot == parent->children.begin() ? nullptr : (*std::prev(slot))->item;

    dirtyStacks_.remove(&node);
    discard(node, after);

    *slot = createSynced(json, parent);

    refreshKids(*parent);
}

// wrap and image stay islands. A native wrap needs a flow mode in NativeStack that measures its kids the way
// QML's Flow does (implicit sizes, caps, spacing on both axes), and a native image has to reproduce the
// async sized loading, the source size and the click surface of the QML one; neither is exact yet.
NativeRenderer::Kind NativeRenderer::kindFor(const QJsonObject &json, bool insideScroll) const
{
    const QString type = json.value(QLatin1String("type")).toString();
    const QJsonObject props = json.value(QLatin1String("props")).toObject();
    const QJsonArray events = json.value(QLatin1String("events")).toArray();

    if (type == QLatin1String("card") || type == QLatin1String("box")) {
        const bool plainEvents = std::all_of(events.begin(), events.end(), [](const QJsonValue &event) {
            return event.toString() == QLatin1String("click") || event.toString() == QLatin1String("longPress")
                || passiveEvent(event.toString());
        });

        if (!plainEvents)
            return Kind::Shell;

        const bool stateful = std::any_of(stateProps().begin(), stateProps().end(), [&](const QString &key) {
            return props.contains(key);
        });

        if (!stateful) {
            if (!propsAllowed(props, { &commonProps(), &paddingProps(), &boxProps() }))
                return Kind::Shell;

            return hasActiveEvents(events) ? Kind::ClickableBox : Kind::Box;
        }

        const bool known = propsAllowed(props, { &commonProps(), &paddingProps(), &boxProps(), &stateProps(), &transitionProp() });

        return known && statesPortable(props) ? Kind::StateBox : Kind::Shell;
    }

    if (const ControlSpec *spec = controlSpec(type))
        return controlPortable(*spec, json) ? Kind::Control : Kind::Island;

    if (hasActiveEvents(events))
        return Kind::Island;

    if (type == QLatin1String("text"))
        return propsAllowed(props, { &commonProps(), &textProps() }) ? Kind::Text : Kind::Island;

    if (type == QLatin1String("icon"))
        return propsAllowed(props, { &commonProps(), &iconProps() }) ? Kind::Text : Kind::Island;

    if (type == QLatin1String("spacer"))
        return propsAllowed(props, { &commonProps(), &spacerProps() }) ? Kind::Spacer : Kind::Island;

    if (type == QLatin1String("stack"))
        return propsAllowed(props, { &commonProps() }) ? Kind::Stack : Kind::Island;

    const bool flowingList = type == QLatin1String("list") && insideScroll;

    if (type == QLatin1String("column") || type == QLatin1String("row") || flowingList)
        return propsAllowed(props, { &commonProps(), &paddingProps(), &stackProps() }) ? Kind::Stack : Kind::Island;

    const bool viewport = type == QLatin1String("scroll") || type == QLatin1String("list");

    if (!viewport || insideScroll)
        return Kind::Island;

    return propsAllowed(props, { &commonProps(), &paddingProps(), &scrollProps() }) ? Kind::Scroll : Kind::Island;
}

QQuickItem *NativeRenderer::instantiate(QQmlComponent *component)
{
    QObject *object = component->create(qmlContext(root_));

    if (!object)
        qWarning().noquote() << "pulsar:" << component->errorString();

    return qobject_cast<QQuickItem *>(object);
}

void NativeRenderer::adopt(QQuickItem *item, QQuickItem *parent)
{
    // A QObject parent as well, so that closing a window frees the items.
    QQmlEngine::setObjectOwnership(item, QQmlEngine::CppOwnership);

    item->setParent(parent);
    item->setParentItem(parent);
}

std::unique_ptr<NativeRenderer::Node> NativeRenderer::create(const QJsonObject &json, Node *parent)
{
    auto node = std::make_unique<Node>();

    node->path = json.value(QLatin1String("path")).toString();
    node->type = json.value(QLatin1String("type")).toString();
    node->parent = parent;
    node->insideScroll = parent->insideScroll || parent->kind == Kind::Scroll;
    node->kind = kindFor(json, node->insideScroll);

    stats_.created++;

    index_.insert(node->path, node.get());

    QQuickItem *parentItem = parent->stack;

    if (node->kind == Kind::Island) {
        mountQml(*node, json, parentItem, creationDepth_ > 1);

        return node;
    }

    if (node->kind == Kind::Shell) {
        QJsonObject own = json;

        own.remove(QLatin1String("children"));

        mountQml(*node, own, parentItem, true);
        bindShell(*node);

        return node;
    }

    if (node->kind == Kind::Spacer) {
        node->item = new QQuickItem();
    } else if (node->kind == Kind::Stack) {
        node->stack = new NativeStack();
        node->item = node->stack;
    } else if (node->kind == Kind::Control) {
        node->item = instantiate(node->type == QLatin1String("divider") ? rectangle_.get() : controls_.value(node->type));
    } else if (node->kind == Kind::Text) {
        node->item = instantiate(text_.get());
    } else if (node->kind == Kind::Box) {
        node->item = instantiate(rectangle_.get());
    } else if (node->kind == Kind::ClickableBox) {
        node->item = instantiate(clickableBox_);
    } else if (node->kind == Kind::StateBox) {
        node->item = instantiate(stateBox_);
    } else {
        node->item = instantiate(flickable_);
    }

    adopt(node->item, parentItem);

    if (node->kind == Kind::Box || node->kind == Kind::ClickableBox || node->kind == Kind::StateBox)
        bindBox(*node);

    if (node->kind == Kind::Scroll)
        bindScroll(*node);

    if (node->kind == Kind::Control)
        bindControl(*node);

    return node;
}

// The enter animation grows a node to its full height, so a shell starts it only once its children exist.
std::unique_ptr<NativeRenderer::Node> NativeRenderer::createSynced(const QJsonObject &json, Node *parent)
{
    creationDepth_++;

    std::unique_ptr<Node> node = create(json, parent);

    sync(*node, json, true);

    creationDepth_--;

    if (creationDepth_ > 0 || node->kind != Kind::Shell || !node->props.contains(QLatin1String("enter")))
        return node;

    // Text wrapping depends on the width, and the parent has not placed this child yet.
    if (parent->type != QLatin1String("row") && parent->stack)
        node->item->setWidth(parent->stack->width());

    settle(*node);

    QMetaObject::invokeMethod(root_, "nativeEnter", Q_ARG(QVariant, itemArg(node->item)));

    return node;
}

void NativeRenderer::settle(Node &node)
{
    // Twice: widths flow down on the way in, implicit heights come back up on the way out.
    if (node.stack)
        node.stack->ensurePolished();

    for (const std::unique_ptr<Node> &child : node.children)
        settle(*child);

    if (!node.stack)
        return;

    node.stack->ensurePolished();

    if (node.kind == Kind::Shell)
        node.stack->parentItem()->ensurePolished();
}

void NativeRenderer::mountQml(Node &node, const QJsonObject &own, QQuickItem *parentItem, bool holdEnter)
{
    QVariant mounted;

    QMetaObject::invokeMethod(root_, "nativeMount", Q_RETURN_ARG(QVariant, mounted),
                              Q_ARG(QVariant, own.toVariantMap()), Q_ARG(QVariant, itemArg(parentItem)),
                              Q_ARG(QVariant, holdEnter));

    node.item = qobject_cast<QQuickItem *>(mounted.value<QObject *>());
    node.json = own;
    node.props = own.value(QLatin1String("props")).toObject();
}

void NativeRenderer::bindShell(Node &node)
{
    QVariant content;

    QMetaObject::invokeMethod(root_, "nativeShellContent", Q_RETURN_ARG(QVariant, content), Q_ARG(QVariant, itemArg(node.item)));

    auto *stack = new NativeStack();

    adopt(stack, qobject_cast<QQuickItem *>(content.value<QObject *>()));

    QQmlContext *context = qmlContext(root_);

    QQmlProperty(stack, QStringLiteral("Layout.fillWidth"), context).write(true);
    QQmlProperty(stack, QStringLiteral("Layout.fillHeight"), context).write(true);

    // QML keeps the padding on its own layout; only the card's child spacing is ours.
    stack->configure(NativeStack::Mode::Column, node.type == QLatin1String("card") ? theme_.spacing : 0, {});

    node.stack = stack;
}

void NativeRenderer::bindBox(Node &node)
{
    auto *content = new NativeStack();
    QQuickItem *box = node.item;

    adopt(content, box);

    node.stack = content;

    const auto follow = [box, content]() {
        content->setSize(box->size());
    };

    const auto report = [box, content]() {
        box->setImplicitWidth(content->implicitWidth());
        box->setImplicitHeight(content->implicitHeight());
    };

    connect(box, &QQuickItem::widthChanged, content, follow);
    connect(box, &QQuickItem::heightChanged, content, follow);
    connect(content, &QQuickItem::implicitWidthChanged, box, report);
    connect(content, &QQuickItem::implicitHeightChanged, box, report);
}

void NativeRenderer::bindScroll(Node &node)
{
    auto *content = new NativeStack();
    QQuickItem *flickable = node.item;

    adopt(content, flickable->property("contentItem").value<QQuickItem *>());

    node.stack = content;

    const auto followWidth = [flickable, content]() {
        content->setWidth(flickable->width());
    };

    const auto followContent = [flickable, content]() {
        content->setHeight(content->implicitHeight());
        flickable->setProperty("contentHeight", content->implicitHeight());
    };

    connect(flickable, &QQuickItem::widthChanged, content, followWidth);
    connect(content, &QQuickItem::implicitHeightChanged, flickable, followContent);

    followWidth();
}

void NativeRenderer::sync(Node &node, const QJsonObject &json, bool withChildren)
{
    const auto watch = qScopeGuard([&]() { refreshWatch(node); });

    if (node.kind == Kind::Island) {
        syncIsland(node, json, false);
        return;
    }

    if (node.kind == Kind::Shell) {
        QJsonObject own = json;

        own.remove(QLatin1String("children"));
        syncIsland(node, own, false);

        if (withChildren)
            syncChildren(node, json.value(QLatin1String("children")).toArray());

        return;
    }

    const QJsonObject props = json.value(QLatin1String("props")).toObject();
    const bool fresh = node.json.isEmpty();
    const bool changed = fresh || props != node.props;
    const bool identityChanged = node.json.value(QLatin1String("id")) != json.value(QLatin1String("id"))
        || node.json.value(QLatin1String("events")) != json.value(QLatin1String("events"));

    node.json = json;
    node.props = props;

    if (changed)
        applyProps(node);
    else if (node.kind == Kind::Control && (node.type == QLatin1String("textInput") || node.type == QLatin1String("textArea")))
        syncFieldText(node);

    const bool hasMeta = node.kind == Kind::ClickableBox || node.kind == Kind::StateBox
        || (node.kind == Kind::Control && !node.json.value(QLatin1String("events")).toArray().isEmpty());

    if (hasMeta && (fresh || identityChanged)) {
        const QVariantMap own = {
            { QStringLiteral("path"), node.path },
            { QStringLiteral("type"), node.type },
            { QStringLiteral("id"), json.value(QLatin1String("id")).toVariant() },
            { QStringLiteral("events"), json.value(QLatin1String("events")).toVariant() },
        };

        node.item->setProperty("pulsarMeta", QVariantMap{ { QStringLiteral("node"), own } });

        // The chip's own handlers read the node from here.
        if (node.type == QLatin1String("chip"))
            node.item->setProperty("nodeData", own);

        if (node.kind == Kind::StateBox)
            applyPointer(node);
    }

    if (withChildren)
        syncChildren(node, json.value(QLatin1String("children")).toArray());
}

void NativeRenderer::syncIsland(Node &node, const QJsonObject &json, bool shallow)
{
    if (json == node.json)
        return;

    node.json = json;
    node.props = json.value(QLatin1String("props")).toObject();

    updateIsland(node, shallow);

    if (node.parent)
        dirtyStacks_.insert(node.parent);
}

void NativeRenderer::applyCommon(Node &node)
{
    QQuickItem *item = node.item;
    const QJsonObject &props = node.props;

    item->setVisible(props.value(QLatin1String("visible")).toBool(true));
    item->setEnabled(props.value(QLatin1String("enabled")).toBool(true));

    // A control's own dimming while disabled is a binding that an explicit 1 would replace.
    if (node.kind != Kind::Control || props.contains(QLatin1String("opacity")))
        item->setOpacity(number(props, QLatin1String("opacity"), 1));

    item->setRotation(number(props, QLatin1String("rotation"), 0));
    item->setZ(number(props, QLatin1String("zIndex"), 0));

    if (node.kind != Kind::Scroll)
        item->setClip(props.value(QLatin1String("clip")).toBool(false));
}

void NativeRenderer::applyProps(Node &node)
{
    applyCommon(node);

    if (node.kind == Kind::Text) {
        if (node.type == QLatin1String("icon"))
            applyIcon(node);
        else
            applyText(node);

        return;
    }

    if (node.kind == Kind::Control) {
        applyControl(node);
        return;
    }

    if (node.kind == Kind::Scroll) {
        applyScroll(node);
        return;
    }

    if (node.kind == Kind::Box || node.kind == Kind::ClickableBox || node.kind == Kind::StateBox) {
        applyBox(node);
        return;
    }

    if (node.kind == Kind::Spacer)
        return;

    if (node.type == QLatin1String("stack")) {
        node.stack->configure(NativeStack::Mode::Layers, 0, {});
        return;
    }

    const bool horizontal = node.type == QLatin1String("row");
    const QLatin1String gapKey(node.type == QLatin1String("list") ? "spacing" : "gap");

    node.stack->configure(horizontal ? NativeStack::Mode::Row : NativeStack::Mode::Column,
                          number(node.props, gapKey, 0), paddingEdges(node.props));
}

void NativeRenderer::applyBox(Node &node)
{
    QQuickItem *item = node.item;
    const QJsonObject &props = node.props;
    const bool card = node.type == QLatin1String("card");

    item->setProperty("color", resolveColor(props.value(QLatin1String("color")), card ? theme_.surface : QVariant(QStringLiteral("transparent"))));
    item->setProperty("radius", number(props, QLatin1String("radius"), card ? theme_.radius : 0));

    if (QObject *border = item->property("border").value<QObject *>()) {
        border->setProperty("width", number(props, QLatin1String("borderWidth"), card ? 1 : 0));
        border->setProperty("color", resolveColor(props.value(QLatin1String("borderColor")), theme_.border));
    }

    node.stack->configure(NativeStack::Mode::Column, card ? theme_.spacing : 0, paddingEdges(props, card ? 16 : 0));

    if (card && debugging())
        qInfo().noquote() << "PulsarView card" << node.path
                          << "color=" + item->property("color").value<QColor>().name(QColor::HexArgb)
                          << "radius=" + QString::number(item->property("radius").toReal())
                          << "padding=" + QString::number(paddingEdges(props, 16).left);

    if (node.kind == Kind::StateBox) {
        refreshState(node);
        applyPointer(node);
    }
}

void NativeRenderer::stateInput(const QString &path)
{
    if (Node *node = index_.value(path); node && node->kind == Kind::StateBox)
        refreshState(*node);
}

// The pointing hand shows over anything that reacts to the pointer, and stays once it has.
void NativeRenderer::applyPointer(Node &node)
{
    const bool clicks = hasActiveEvents(node.json.value(QLatin1String("events")).toArray());
    const bool reacts = node.props.contains(QLatin1String("hover")) || node.props.contains(QLatin1String("hoverColor"));

    if (QObject *tap = node.item->property("tapHandler").value<QObject *>())
        tap->setProperty("enabled", clicks);

    if (debugging())
        qInfo().noquote() << "PulsarView pointer" << node.path << "tap=" + QString::number(clicks)
                          << "hand=" + QString::number(clicks || reacts);

    if (!clicks && !reacts)
        return;

    if (QObject *hover = node.item->property("hoverHandler").value<QObject *>())
        hover->setProperty("cursorShape", int(Qt::PointingHandCursor));
}

// Which of normal, hover, pressed and disabled applies, and the colours that go with it.
void NativeRenderer::refreshState(Node &node)
{
    const QJsonObject &props = node.props;
    const bool styled = truthy(props.value(QLatin1String("hover"))) || truthy(props.value(QLatin1String("pressed")))
        || truthy(props.value(QLatin1String("disabled"))) || props.contains(QLatin1String("hoverColor"));

    if (!styled && !node.styled)
        return;

    node.styled = styled;

    const QJsonValue enabled = props.value(QLatin1String("enabled"));
    const bool hovered = node.item->property("hoverHandler").value<QObject *>()->property("hovered").toBool();
    const bool holding = node.item->property("pressHandler").value<QObject *>()->property("holding").toBool();
    const bool hoverStyled = truthy(props.value(QLatin1String("hover"))) || props.contains(QLatin1String("hoverColor"));

    QString state = QStringLiteral("normal");

    if (enabled.isBool() && !enabled.toBool())
        state = QStringLiteral("disabled");
    else if (holding && truthy(props.value(QLatin1String("pressed"))))
        state = QStringLiteral("pressed");
    else if (hovered && hoverStyled)
        state = QStringLiteral("hover");

    const QJsonValue styleValue = state == QLatin1String("normal") ? QJsonValue() : props.value(state);
    const QJsonObject style = truthy(styleValue) ? styleValue.toObject() : QJsonObject();
    const QJsonValue transition = props.value(QLatin1String("transition"));
    const QJsonValue duration = transition.toObject().value(QLatin1String("duration"));

    const bool card = node.type == QLatin1String("card");
    const QVariant fallback = card ? theme_.surface : QVariant(QStringLiteral("transparent"));
    const bool hoverTint = state == QLatin1String("hover") && !style.contains(QLatin1String("color"));

    QJsonValue color = props.value(QLatin1String("color"));

    if (style.contains(QLatin1String("color")))
        color = style.value(QLatin1String("color"));
    else if (hoverTint && props.contains(QLatin1String("hoverColor")))
        color = props.value(QLatin1String("hoverColor"));

    const QJsonValue borderColor = style.contains(QLatin1String("borderColor")) ? style.value(QLatin1String("borderColor"))
                                                                                  : props.value(QLatin1String("borderColor"));

    const int ms = duration.isDouble() ? int(duration.toDouble()) : 120;
    const QString fill = resolveColor(color, fallback);
    const QString edge = resolveColor(borderColor, theme_.border);

    if (node.lastState != state) {
        node.lastState = state;

        if (debugging())
            qInfo().noquote() << "PulsarView state" << state << node.path << "color=" + fill << "border=" + edge
                              << "ms=" + QString::number(ms);
    }

    node.item->setProperty("pulsarColorMs", ms);
    node.item->setProperty("color", fill);

    if (QObject *border = node.item->property("border").value<QObject *>())
        border->setProperty("color", edge);
}

// QML leaves a little room above a form that starts with a text field, so the field's outline is not cut.
qreal NativeRenderer::scrollTopInset(const Node &node) const
{
    if (node.children.empty())
        return 0;

    const Node &content = *node.children.front();
    QString first;

    if (content.kind == Kind::Island)
        first = content.json.value(QLatin1String("children")).toArray().at(0).toObject().value(QLatin1String("type")).toString();
    else if (!content.children.empty())
        first = content.children.front()->type;

    if (first != QLatin1String("textInput") && first != QLatin1String("textArea"))
        return 0;

    return std::round(8 * theme_.fontScale);
}

void NativeRenderer::configureScroll(Node &node)
{
    const bool list = node.type == QLatin1String("list");
    const qreal gap = list ? number(node.props, QLatin1String("spacing"), 0)
                           : number(node.props, QLatin1String("gap"), theme_.spacing);
    NativeStack::Edges edges = paddingEdges(node.props);

    edges.top += scrollTopInset(node);
    node.stack->configure(NativeStack::Mode::Column, gap, edges);
}

void NativeRenderer::applyScroll(Node &node)
{
    configureScroll(node);

    // Only the node's own fields: the scroll's children are not QML's to walk.
    const QVariantMap own = {
        { QStringLiteral("type"), node.type },
        { QStringLiteral("path"), node.path },
        { QStringLiteral("props"), node.props.toVariantMap() },
    };

    QMetaObject::invokeMethod(root_, "nativeScroll", Q_ARG(QVariant, itemArg(node.item)), Q_ARG(QVariant, own));
}

// The glyph is text in the icon font, drawn as the QML icon branch does.
void NativeRenderer::applyIcon(Node &node)
{
    QQuickItem *item = node.item;
    const QJsonObject &props = node.props;
    const QString align = props.value(QLatin1String("align")).toString();
    const QString color = resolveColor(props.value(QLatin1String("color")), theme_.text);

    QFont font(theme_.iconFamily);

    font.setPixelSize(int(std::round(number(props, QLatin1String("size"), 24) * theme_.fontScale)));

    item->setProperty("text", props.value(QLatin1String("name")).toString());
    item->setProperty("font", font);
    item->setProperty("color", color);
    item->setProperty("horizontalAlignment", int(align == QLatin1String("center") ? Qt::AlignHCenter
                                                 : align == QLatin1String("right") || align == QLatin1String("end")
                                                     ? Qt::AlignRight
                                                     : Qt::AlignLeft));

    if (debugging())
        qInfo().noquote() << "PulsarView icon" << node.path << "family=" + font.family()
                          << "px=" + QString::number(font.pixelSize()) << "color=" + color;
}

void NativeRenderer::bindControl(Node &node)
{
    QQuickItem *item = node.item;

    item->setProperty("pulsarPath", node.path);

    if (node.type == QLatin1String("button") || node.type == QLatin1String("iconButton"))
        connect(item, SIGNAL(clicked()), this, SLOT(controlClicked()));

    if (node.type == QLatin1String("checkbox") || node.type == QLatin1String("switch"))
        connect(item, SIGNAL(toggled()), this, SLOT(controlToggled()));

    if (node.type != QLatin1String("textInput") && node.type != QLatin1String("textArea"))
        return;

    connect(item, SIGNAL(textChanged()), this, SLOT(fieldTextChanged()));
    connect(item, SIGNAL(activeFocusChanged(bool)), this, SLOT(fieldFocusChanged()));

    if (node.type == QLatin1String("textInput"))
        connect(item, SIGNAL(accepted()), this, SLOT(fieldAccepted()));
    else
        connect(item, SIGNAL(cursorRectangleChanged()), this, SLOT(fieldCursorMoved()));

#ifdef Q_OS_ANDROID
    // A tap alone does not always give the field the focus or raise the keyboard on a phone.
    QObject *tap = fieldTap_->create(qmlContext(root_));

    if (!tap)
        return;

    tap->setProperty("pulsarPath", node.path);
    QQmlListReference(item, "data", qmlEngine(root_)).append(tap);
    connect(tap, SIGNAL(tapped(QEventPoint, Qt::MouseButton)), this, SLOT(fieldTapped()));
#endif
}

void NativeRenderer::fieldTextChanged()
{
    Node *node = controlNode(sender());

    if (!node || node->field.syncing)
        return;

    const QString text = node->item->property("text").toString();

    node->field.typed.append(text);

    while (node->field.typed.size() > 64)
        node->field.typed.removeFirst();

    emitControl(*node, QStringLiteral("input"), text);
}

void NativeRenderer::fieldFocusChanged()
{
    Node *node = controlNode(sender());

    if (!node)
        return;

    const bool focused = node->item->hasActiveFocus();

    emitControl(*node, focused ? QStringLiteral("focus") : QStringLiteral("blur"));
    QMetaObject::invokeMethod(root_, "nativeFieldFocus", Q_ARG(QVariant, itemArg(node->item)), Q_ARG(QVariant, focused));
}

void NativeRenderer::fieldAccepted()
{
    if (const Node *node = controlNode(sender()))
        emitControl(*node, QStringLiteral("submit"), node->item->property("text"));
}

// A growing text area can push its cursor below the visible part of the page.
void NativeRenderer::fieldCursorMoved()
{
    const Node *node = controlNode(sender());

    if (node && node->item->hasActiveFocus())
        QMetaObject::invokeMethod(root_, "revealCursor", Q_ARG(QVariant, itemArg(node->item)));
}

void NativeRenderer::fieldTapped()
{
    const Node *node = controlNode(sender());

    if (!node)
        return;

    node->item->forceActiveFocus();
    QGuiApplication::inputMethod()->show();
}

NativeRenderer::Node *NativeRenderer::controlNode(QObject *item) const
{
    return item ? index_.value(item->property("pulsarPath").toString()) : nullptr;
}

void NativeRenderer::emitControl(const Node &node, const QString &event, const QVariant &value)
{
    const bool listens = node.json.value(QLatin1String("events")).toArray().contains(event);

    if (!listens)
        return;

    const QVariantMap own = {
        { QStringLiteral("path"), node.path },
        { QStringLiteral("type"), node.type },
        { QStringLiteral("id"), node.json.value(QLatin1String("id")).toVariant() },
        { QStringLiteral("events"), node.json.value(QLatin1String("events")).toVariant() },
    };

    QMetaObject::invokeMethod(root_, "emitEvent", Q_ARG(QVariant, own), Q_ARG(QVariant, event), Q_ARG(QVariant, value));
}

void NativeRenderer::controlClicked()
{
    if (const Node *node = controlNode(sender()))
        emitControl(*node, QStringLiteral("click"));
}

void NativeRenderer::controlToggled()
{
    if (const Node *node = controlNode(sender()))
        emitControl(*node, QStringLiteral("toggle"), sender()->property("checked"));
}

// The same values the QML branch of textInput and textArea assigns.
void NativeRenderer::applyField(Node &node)
{
    QQuickItem *item = node.item;
    const QJsonObject &props = node.props;
    const bool area = node.type == QLatin1String("textArea");
    const bool outlined = textOf(props, "variant", QStringLiteral("filled")) == QLatin1String("outline");

    const auto color = [&](const char *key, const QVariant &fallback) {
        return resolveColor(props.value(QLatin1String(key)), fallback);
    };

    const auto paint = [](const QString &name) {
        const QColor parsed(name);

        return QVariant::fromValue(parsed.isValid() ? parsed : QColor());
    };

    const QString keyboard = textOf(props, "keyboardType", QStringLiteral("text"));

    static const QHash<QString, int> hints = {
        { QStringLiteral("email"), Qt::ImhEmailCharactersOnly },
        { QStringLiteral("number"), Qt::ImhDigitsOnly },
        { QStringLiteral("decimal"), Qt::ImhFormattedNumbersOnly },
        { QStringLiteral("phone"), Qt::ImhDialableCharactersOnly },
        { QStringLiteral("url"), Qt::ImhUrlCharactersOnly },
        { QStringLiteral("search"), Qt::ImhNoPredictiveText },
    };

    item->setProperty("placeholderText", textOf(props, "placeholder"));
    item->setProperty("readOnly", props.value(QLatin1String("readOnly")).toBool(false));
    item->setProperty("outlined", outlined);
    item->setProperty("fieldColor", outlined ? QVariant(QStringLiteral("transparent")) : QVariant(color("color", theme_.surfaceVariant)));
    item->setProperty("fieldRadius", int(number(props, QLatin1String("radius"), 8)));
    item->setProperty("fieldBorderColor", paint(color("borderColor", theme_.border)));
    item->setProperty("fieldFocusColor", paint(color("focusBorderColor", theme_.primary)));
    item->setProperty("color", paint(color("textColor", theme_.text)));
    item->setProperty("maximumLength", props.contains(QLatin1String("maxLength")) ? props.value(QLatin1String("maxLength")).toInt() : 32767);

    QFont font = item->property("font").value<QFont>();

    font.setStrikeOut(props.value(QLatin1String("strike")).toBool(false));
    item->setProperty("font", font);

    if (props.contains(QLatin1String("selectable")))
        item->setProperty("selectByMouse", props.value(QLatin1String("selectable")).toBool());

    if (!area) {
        const bool password = props.value(QLatin1String("password")).toBool(false);
        const bool submits = node.json.value(QLatin1String("events")).toArray().contains(QStringLiteral("submit"));

        item->setProperty("echoMode", password ? 2 : 0);
        item->setProperty("inputMethodHints", hints.value(keyboard, int(Qt::ImhNone)));

        // The attached EnterKey type has no public C++ class.
        QQmlProperty(item, QStringLiteral("EnterKey.type"), qmlContext(root_)).write(submits ? int(Qt::EnterKeyDone) : int(Qt::EnterKeyDefault));
    }

    syncFieldText(node);

    const bool focusWanted = props.value(QLatin1String("focus")).toBool(false);
    const bool autoFocus = props.value(QLatin1String("autoFocus")).toBool(false);

    // Both wait a turn: the field has no window to take the focus in until it is placed.
    if (autoFocus && !node.field.autoFocused) {
        node.field.autoFocused = true;

        QTimer::singleShot(0, item, [item]() { item->forceActiveFocus(); });
    }

    if (focusWanted && !node.field.focusRequested) {
        node.field.focusRequested = true;

        QTimer::singleShot(0, item, [item]() {
            item->forceActiveFocus();
            QGuiApplication::inputMethod()->show();
        });
    }

    if (!focusWanted)
        node.field.focusRequested = false;

    if (debugging())
        qInfo().noquote() << "PulsarView" << node.type << node.path << "variant=" + QString(outlined ? "outline" : "filled")
                          << "keyboard=" + keyboard << "password=" + QString::number(props.value(QLatin1String("password")).toBool(false))
                          << "max=" + QString::number(item->property("maximumLength").toInt());
}

// A value the app echoes back while the user types does not replace the text; one it sets on its own does.
void NativeRenderer::syncFieldText(Node &node)
{
    Node::Field &field = node.field;
    const QString value = textOf(node.props, "value");
    const qsizetype echo = field.typed.lastIndexOf(value);
    const bool changed = !field.hasLastValue || value != field.lastValue;

    field.lastValue = value;
    field.hasLastValue = true;

    if (echo >= 0)
        field.typed = field.typed.mid(echo + 1);

    if (node.item->hasActiveFocus() && (echo >= 0 || !changed))
        return;

    if (node.item->property("text").toString() == value)
        return;

    field.syncing = true;
    node.item->setProperty("text", value);
    field.syncing = false;
}

// The same values the QML branch of each type assigns, so the look stays the same.
void NativeRenderer::applyControl(Node &node)
{
    QQuickItem *item = node.item;
    const QJsonObject &props = node.props;
    const QString &type = node.type;

    const auto color = [&](const char *key, const QVariant &fallback) {
        return resolveColor(props.value(QLatin1String(key)), fallback);
    };

    // A name the theme does not know is no colour; QML paints that black, so it is passed on as invalid.
    const auto paint = [](const QString &name) {
        const QColor parsed(name);

        return QVariant::fromValue(parsed.isValid() ? parsed : QColor());
    };

    const auto sized = [&](qreal px) {
        return int(std::round(px * theme_.fontScale));
    };

    if (type == QLatin1String("button")) {
        const QString variant = textOf(props, "variant", QStringLiteral("solid"));
        const QString size = textOf(props, "size", QStringLiteral("md"));
        const QString fill = color("color", theme_.primary);
        const bool tinted = variant == QLatin1String("soft") || variant == QLatin1String("outline") || variant == QLatin1String("ghost");
        const int sideInset = size == QLatin1String("sm") ? 12 : size == QLatin1String("lg") ? 20 : 16;
        const int topInset = size == QLatin1String("sm") ? 4 : size == QLatin1String("lg") ? 12 : 8;

        QFont font;

        font.setPixelSize(sized(size == QLatin1String("sm") ? 13 : size == QLatin1String("lg") ? 17 : 15));
        font.setWeight(QFont::Weight(500));
        font.setBold(false);

        const QString label = props.contains(QLatin1String("textColor"))
            ? color("textColor", item->property("labelColor"))
            : tinted ? fill : resolveColor(QJsonValue(), theme_.onPrimary);

        item->setProperty("text", textOf(props, "label"));
        item->setProperty("variant", variant);
        item->setProperty("fillColor", paint(fill));
        item->setProperty("radius", int(number(props, QLatin1String("radius"), theme_.radius)));
        item->setProperty("iconName", textOf(props, "icon"));
        item->setProperty("iconPosition", textOf(props, "iconPosition", QStringLiteral("left")));
        item->setProperty("font", font);
        item->setProperty("leftPadding", sideInset);
        item->setProperty("rightPadding", sideInset);
        item->setProperty("topPadding", topInset);
        item->setProperty("bottomPadding", topInset);
        item->setProperty("implicitHeight", size == QLatin1String("sm") ? 32 : size == QLatin1String("lg") ? 48 : 40);
        item->setProperty("labelColor", paint(label));

        if (debugging())
            qInfo().noquote() << "PulsarView button" << node.path << "variant=" + variant << "size=" + size
                              << "px=" + QString::number(font.pixelSize()) << "fill=" + fill << "label=" + label
                              << "radius=" + QString::number(item->property("radius").toInt())
                              << "icon=" + textOf(props, "icon") << "enabled=" + QString::number(item->isEnabled());

        return;
    }

    if (type == QLatin1String("iconButton")) {
        const QString tint = color("color", theme_.text);

        QFont font(theme_.iconFamily);

        font.setPixelSize(sized(number(props, QLatin1String("size"), 24)));

        item->setProperty("text", textOf(props, "name"));
        item->setProperty("font", font);
        item->setProperty("iconColor", paint(tint));

        if (debugging())
            qInfo().noquote() << "PulsarView iconButton" << node.path << "name=" + textOf(props, "name")
                              << "px=" + QString::number(font.pixelSize()) << "color=" + tint
                              << "enabled=" + QString::number(item->isEnabled());

        return;
    }

    if (type == QLatin1String("checkbox") || type == QLatin1String("switch")) {
        item->setProperty("text", textOf(props, "label"));
        item->setProperty("checked", props.value(QLatin1String("checked")).toBool(false));

        if (debugging())
            qInfo().noquote() << "PulsarView" << type << node.path << "label=" + textOf(props, "label")
                              << "checked=" + QString::number(item->property("checked").toBool())
                              << "enabled=" + QString::number(item->isEnabled());

        return;
    }

    if (type == QLatin1String("chip")) {
        const QString variant = textOf(props, "variant", QStringLiteral("solid"));
        const bool selected = props.value(QLatin1String("selected")).toBool(false);
        const QString base = color("color", theme_.surfaceVariant);
        const QString fill = selected ? resolveColor(props.value(QLatin1String("selectedColor")), base) : base;
        const bool outline = variant == QLatin1String("outline");
        const QString labelColor = props.contains(QLatin1String("textColor")) ? color("textColor", theme_.text)
            : outline                                                          ? fill
                                                                               : resolveColor(QJsonValue(), theme_.text);

        QColor tint(fill.isEmpty() || !QColor::isValidColorName(fill) ? QColor(Qt::black) : QColor(fill));

        tint.setAlphaF(0.22);

        auto *label = item->property("labelItem").value<QObject *>();
        auto *border = item->property("border").value<QObject *>();
        auto *remove = item->property("removeButton").value<QObject *>();

        label->setProperty("text", textOf(props, "label"));
        label->setProperty("color", paint(labelColor));

        QFont font = label->property("font").value<QFont>();

        font.setBold(selected);
        label->setProperty("font", font);

        item->setProperty("color", paint(outline ? (selected ? tint.name(QColor::HexArgb) : QStringLiteral("transparent")) : fill));
        border->setProperty("width", outline ? (selected ? 2 : 1) : 0);
        border->setProperty("color", paint(fill));
        remove->setProperty("visible", node.json.value(QLatin1String("events")).toArray().contains(QStringLiteral("remove")));

        if (debugging())
            qInfo().noquote() << "PulsarView chip" << node.path << "variant=" + variant << "fill=" + fill
                              << "label=" + labelColor << "selected=" + QString::number(selected)
                              << "border=" + QString::number(border->property("width").toInt());

        return;
    }

    if (type == QLatin1String("divider")) {
        item->setProperty("color", paint(color("color", theme_.border)));
        item->setProperty("implicitHeight", 1);

        if (debugging())
            qInfo().noquote() << "PulsarView divider" << node.path << "color=" + color("color", theme_.border);

        return;
    }

    if (type == QLatin1String("progress")) {
        item->setProperty("indeterminate", props.value(QLatin1String("indeterminate")).toBool(false));
        item->setProperty("value", std::clamp(number(props, QLatin1String("value"), 0), 0.0, 1.0));

        if (props.contains(QLatin1String("color"))) {
            const QString tint = color("color", theme_.primary);

            QQmlContext *context = qmlContext(root_);

            QQmlProperty(item, QStringLiteral("palette.highlight"), context).write(tint);
            QQmlProperty(item, QStringLiteral("palette.accent"), context).write(tint);
        }

        if (debugging())
            qInfo().noquote() << "PulsarView progress" << node.path
                              << "value=" + QString::number(item->property("value").toReal())
                              << "indeterminate=" + QString::number(item->property("indeterminate").toBool());

        return;
    }

    if (type == QLatin1String("spinner")) {
        const qreal size = number(props, QLatin1String("size"), 24);

        item->setProperty("spinnerSize", int(size));
        item->setProperty("spinnerColor", paint(color("color", theme_.primary)));
        item->setProperty("spinnerValue", number(props, QLatin1String("value"), -1));
        item->setProperty("thickness", number(props, QLatin1String("thickness"), std::max<qreal>(2, size * 0.1)));

        if (debugging())
            qInfo().noquote() << "PulsarView spinner" << node.path << "size=" + QString::number(size)
                              << "color=" + color("color", theme_.primary)
                              << "value=" + QString::number(item->property("spinnerValue").toReal())
                              << "thickness=" + QString::number(item->property("thickness").toReal());

        return;
    }

    if (type == QLatin1String("textInput") || type == QLatin1String("textArea")) {
        applyField(node);

        return;
    }

    if (type == QLatin1String("badge")) {
        const QJsonValue count = props.value(QLatin1String("count"));

        QString label = textOf(props, "label");

        if (!props.contains(QLatin1String("label")) && !count.isUndefined()) {
            const QString text = count.isString() ? count.toString() : QString::number(count.toDouble(), 'g', 15);
            bool numeric = false;
            const double amount = text.toDouble(&numeric);

            label = numeric && amount > 99 ? QStringLiteral("99+") : text;
        }

        item->setProperty("dot", props.value(QLatin1String("dot")).toBool(false));
        item->setProperty("label", label);
        item->setProperty("badgeColor", paint(color("color", theme_.primary)));
        item->setProperty("badgeTextColor", paint(color("textColor", theme_.onPrimary)));

        if (debugging())
            qInfo().noquote() << "PulsarView badge" << node.path << "label=" + label
                              << "dot=" + QString::number(item->property("dot").toBool())
                              << "color=" + color("color", theme_.primary)
                              << "text=" + color("textColor", theme_.onPrimary);

        return;
    }

    if (type == QLatin1String("avatar")) {
        static const QHash<QString, QString> statusColors = {
            { QStringLiteral("online"), QStringLiteral("green") },
            { QStringLiteral("away"), QStringLiteral("yellow") },
            { QStringLiteral("busy"), QStringLiteral("red") },
            { QStringLiteral("offline"), QStringLiteral("overlay") },
        };
        static const QStringList accents = { QStringLiteral("mauve"), QStringLiteral("blue"),  QStringLiteral("teal"),
                                             QStringLiteral("peach"), QStringLiteral("green"), QStringLiteral("lavender") };

        const QString name = textOf(props, "name");
        const QString status = textOf(props, "status");
        const qreal size = number(props, QLatin1String("size"), 40);
        const QStringList parts = name.trimmed().isEmpty() ? QStringList() : name.trimmed().split(QRegularExpression(QStringLiteral("\\s+")));

        int hash = 0;

        for (const QChar letter : name)
            hash = (hash * 31 + letter.unicode()) % 100000;

        QString initials = QStringLiteral("?");

        if (!parts.isEmpty())
            initials = (parts.at(0).left(1) + (parts.size() > 1 ? parts.at(1).left(1) : QString())).toUpper();

        const QString statusTint = props.contains(QLatin1String("statusColor"))
            ? color("statusColor", theme_.primary)
            : resolveColor(statusColors.contains(status) ? QJsonValue(statusColors.value(status)) : QJsonValue(), theme_.primary);

        item->setProperty("src", textOf(props, "src"));
        item->setProperty("initials", initials);
        item->setProperty("avatarSize", int(size));
        item->setProperty("avatarRadius", int(number(props, QLatin1String("radius"), size / 2)));
        item->setProperty("fallbackColor", paint(resolveColor(QJsonValue(accents.at(hash % accents.size())), theme_.surfaceVariant)));
        item->setProperty("fallbackTextColor", paint(resolveColor(QJsonValue(), theme_.onPrimary)));
        item->setProperty("status", status);
        item->setProperty("statusColor", paint(statusTint));

        if (debugging())
            qInfo().noquote() << "PulsarView avatar" << node.path << "initials=" + initials
                              << "size=" + QString::number(int(size))
                              << "fallback=" + item->property("fallbackColor").value<QColor>().name(QColor::HexArgb)
                              << "status=" + status << "statusColor=" + statusTint;
    }
}

// Text wraps at word boundaries unless the app says otherwise. An elided text without an explicit wrap
// stays on one line, and with maxLines it wraps up to that many.
static bool textWraps(const QJsonObject &props)
{
    if (props.contains(QLatin1String("wrap")))
        return props.value(QLatin1String("wrap")).toBool(false);

    const QJsonValue elide = props.value(QLatin1String("elide"));
    const bool elides = elide.isString() ? !elide.toString().isEmpty() : elide.toBool(false);

    return !elides || props.contains(QLatin1String("maxLines"));
}

static bool textElides(const QJsonObject &props)
{
    const QJsonValue elide = props.value(QLatin1String("elide"));

    return elide.isString() ? !elide.toString().isEmpty() : elide.toBool(false);
}

void NativeRenderer::applyText(Node &node)
{
    QQuickItem *item = node.item;
    const QJsonObject &props = node.props;

    const QString align = props.value(QLatin1String("align")).toString();
    const QJsonValue elide = props.value(QLatin1String("elide"));
    const QJsonValue weight = props.value(QLatin1String("weight"));

    item->setProperty("text", props.value(QLatin1String("text")).toString());
    item->setProperty("color", resolveColor(props.value(QLatin1String("color")), theme_.text));

    QFont font(props.value(QLatin1String("family")).toString(theme_.fontFamily));

    font.setPixelSize(int(std::round(number(props, QLatin1String("size"), 15) * theme_.fontScale)));
    font.setBold(props.value(QLatin1String("bold")).toBool(false));
    font.setItalic(props.value(QLatin1String("italic")).toBool(false));
    font.setStrikeOut(props.value(QLatin1String("strike")).toBool(false));

    if (!weight.isUndefined())
        font.setWeight(QFont::Weight(fontWeight(weight)));

    if (props.contains(QLatin1String("letterSpacing")))
        font.setLetterSpacing(QFont::AbsoluteSpacing, number(props, QLatin1String("letterSpacing"), 0));

    const bool wraps = textWraps(props);

    item->setProperty("font", font);
    item->setProperty("textFormat", int(Qt::PlainText));
    item->setProperty("wrapMode", int(wraps ? QTextOption::WordWrap : QTextOption::NoWrap));
    item->setProperty("horizontalAlignment", int(align == QLatin1String("center") ? Qt::AlignHCenter
                                                 : align == QLatin1String("right") ? Qt::AlignRight
                                                                                   : Qt::AlignLeft));

    if (props.contains(QLatin1String("lineHeight")))
        item->setProperty("lineHeight", number(props, QLatin1String("lineHeight"), 1));

    if (props.contains(QLatin1String("maxLines")))
        item->setProperty("maximumLineCount", props.value(QLatin1String("maxLines")).toInt());

    const QString elideName = elide.toString();

    Qt::TextElideMode mode = Qt::ElideNone;

    if (elideName == QLatin1String("left"))
        mode = Qt::ElideLeft;
    else if (elideName == QLatin1String("middle"))
        mode = Qt::ElideMiddle;
    else if (elideName == QLatin1String("right") || elide.toBool(false))
        mode = Qt::ElideRight;

    item->setProperty("elide", int(mode));
}

QString NativeRenderer::resolveColor(const QJsonValue &value, const QVariant &fallback) const
{
    const auto text = [](const QVariant &color) {
        return color.metaType().id() == QMetaType::QColor ? color.value<QColor>().name(QColor::HexArgb) : color.toString();
    };

    if (!value.isString())
        return text(fallback);

    const QString name = value.toString();
    const auto themed = theme_.colors.constFind(name);

    return themed != theme_.colors.constEnd() ? text(*themed) : name;
}

// Wrapping or eliding text narrows to the width it is given, and so does a row, column or box that
// holds one and has no width of its own.
static bool jsonNarrows(const QJsonObject &json)
{
    const QJsonObject props = json.value(QLatin1String("props")).toObject();
    const QString type = json.value(QLatin1String("type")).toString();

    if (props.contains(QLatin1String("width")))
        return false;

    if (type == QLatin1String("text"))
        return textWraps(props) || textElides(props);

    if (type != QLatin1String("row") && type != QLatin1String("column") && type != QLatin1String("card") && type != QLatin1String("box"))
        return false;

    const QJsonArray children = json.value(QLatin1String("children")).toArray();

    return std::any_of(children.begin(), children.end(), [](const QJsonValue &child) { return jsonNarrows(child.toObject()); });
}

bool NativeRenderer::narrowsToFit(const Node &node) const
{
    if (node.kind == Kind::Island)
        return jsonNarrows(node.json);

    if (node.props.contains(QLatin1String("width")))
        return false;

    if (node.kind == Kind::Text)
        return node.type == QLatin1String("text") && (textWraps(node.props) || textElides(node.props));

    const bool container = node.kind == Kind::Box || node.type == QLatin1String("row") || node.type == QLatin1String("column");

    if (!container)
        return false;

    return std::any_of(node.children.begin(), node.children.end(), [&](const std::unique_ptr<Node> &child) {
        return narrowsToFit(*child);
    });
}

NativeStack::Kid NativeRenderer::kidFor(const Node &parent, Node &child) const
{
    const QJsonObject &props = child.props;
    const bool row = parent.type == QLatin1String("row");
    const QString alignItems = parent.props.value(QLatin1String("alignItems")).toString();

    NativeStack::Kid kid;

    kid.item = child.item;
    kid.flex = number(props, QLatin1String("flex"), 0);

    if (!alignItems.isEmpty() && alignItems != QLatin1String("stretch") && !props.contains(QLatin1String("align"))) {
        kid.align = alignItems == QLatin1String("start") ? NativeStack::Align::Start
            : alignItems == QLatin1String("end")          ? NativeStack::Align::End
                                                          : NativeStack::Align::Center;
    } else if (!row && props.contains(QLatin1String("align"))) {
        const QString align = props.value(QLatin1String("align")).toString();

        kid.align = align == QLatin1String("center")                           ? NativeStack::Align::Center
            : align == QLatin1String("right") || align == QLatin1String("end") ? NativeStack::Align::End
                                                                               : NativeStack::Align::Start;
    }

    if (parent.type == QLatin1String("stack")) {
        const QJsonObject at = props.value(QLatin1String("absolute")).toObject();

        const auto inset = [&](QLatin1String key) {
            return NativeStack::Inset{ at.contains(key), at.value(key).toDouble() };
        };

        kid.absolute = { props.contains(QLatin1String("absolute")), inset(QLatin1String("top")), inset(QLatin1String("right")),
                         inset(QLatin1String("bottom")), inset(QLatin1String("left")) };
        kid.fillsLayer = !props.contains(QLatin1String("width")) && !props.contains(QLatin1String("height"))
            && !props.contains(QLatin1String("align"));
    }

    if (child.kind == Kind::Island || child.kind == Kind::Shell) {
        if (!child.hints)
            child.hints = makeHints(child.item);

        kid.qml = child.hints;
        kid.shrinks = narrowsToFit(child);

        return kid;
    }

    const bool flowsInScroll = child.kind == Kind::Stack && child.type == QLatin1String("list");

    // A size given by the app wins over the fill a type has by default.
    kid.shrinks = narrowsToFit(child);
    kid.fillWidth = typesFillingWidth().contains(child.type) && !props.contains(QLatin1String("width"));
    kid.fillHeight = typesFillingHeight().contains(child.type) && !flowsInScroll && !props.contains(QLatin1String("height"));

    if (props.contains(QLatin1String("expand")))
        kid.fillWidth = props.value(QLatin1String("expand")).toBool();

    if (props.contains(QLatin1String("fill"))) {
        kid.fillWidth = props.value(QLatin1String("fill")).toBool();
        kid.fillHeight = kid.fillWidth;
    }

    if (props.contains(QLatin1String("fillWidth")))
        kid.fillWidth = props.value(QLatin1String("fillWidth")).toBool();

    if (props.contains(QLatin1String("fillHeight")))
        kid.fillHeight = props.value(QLatin1String("fillHeight")).toBool();

    // QML gives a scroll's content that holds wrapping text the whole width, not the width of its text.
    const bool stackType = child.type == QLatin1String("column") || child.type == QLatin1String("row");

    if (parent.kind == Kind::Scroll && kid.shrinks && stackType && !props.contains(QLatin1String("fillWidth"))
        && !props.contains(QLatin1String("expand")) && !props.contains(QLatin1String("fill")))
        kid.fillWidth = true;

    if (alignItems == QLatin1String("stretch")) {
        kid.fillWidth = kid.fillWidth || !row;
        kid.fillHeight = kid.fillHeight || row;
    }

    const qreal fallbackSize = child.kind == Kind::Spacer ? number(props, QLatin1String("size"), 0) : -1;

    kid.preferredWidth = number(props, QLatin1String("width"), fallbackSize);
    kid.preferredHeight = number(props, QLatin1String("height"), fallbackSize);

    // `lines` is the starting height; the area grows with its text so the cursor never drops below it.
    if (child.type == QLatin1String("textArea") && props.contains(QLatin1String("lines")) && !props.contains(QLatin1String("height")))
        kid.minHeight = number(props, QLatin1String("lines"), 0) * 24;

    if (child.type == QLatin1String("progress"))
        kid.preferredWidth = props.value(QLatin1String("expand")).toBool(false) ? -1 : number(props, QLatin1String("width"), 160);

    if (child.type == QLatin1String("spinner")) {
        kid.preferredWidth = number(props, QLatin1String("size"), 24);
        kid.preferredHeight = kid.preferredWidth;
    }
    kid.minWidth = number(props, QLatin1String("minWidth"), 0);
    kid.minHeight = number(props, QLatin1String("minHeight"), kid.minHeight);
    kid.maxWidth = number(props, QLatin1String("maxWidth"), kid.maxWidth);
    kid.maxHeight = number(props, QLatin1String("maxHeight"), kid.maxHeight);

    return kid;
}

std::shared_ptr<NativeStack::QmlHints> NativeRenderer::makeHints(QQuickItem *item) const
{
    QQmlContext *context = qmlContext(root_);

    const auto layout = [&](const char *name) {
        return QQmlProperty(item, QString::fromLatin1(name), context);
    };

    return std::make_shared<NativeStack::QmlHints>(NativeStack::QmlHints{
        layout("Layout.fillWidth"),
        layout("Layout.fillHeight"),
        layout("Layout.preferredWidth"),
        layout("Layout.preferredHeight"),
        layout("Layout.minimumWidth"),
        layout("Layout.minimumHeight"),
        layout("Layout.maximumWidth"),
        layout("Layout.maximumHeight"),
    });
}

void NativeRenderer::refreshKids(Node &node)
{
    if (!node.stack)
        return;

    QList<NativeStack::Kid> kids;

    kids.reserve(qsizetype(node.children.size()));

    for (const std::unique_ptr<Node> &child : node.children) {
        // Overlays such as sheets and menus are mounted elsewhere and place themselves.
        if (child->item->parentItem() == node.stack)
            kids.append(kidFor(node, *child));
    }

    node.stack->setKids(kids);

    // The inset depends on the first child of the scroll's first child, so either may have changed.
    if (node.kind == Kind::Scroll)
        configureScroll(node);
    else if (node.parent && node.parent->kind == Kind::Scroll && node.parent->stack)
        configureScroll(*node.parent);
}

void NativeRenderer::syncChildren(Node &node, const QJsonArray &children)
{
    std::unordered_map<QString, std::unique_ptr<Node>> previous;
    QHash<QString, qsizetype> previousOrder;

    previous.reserve(node.children.size());
    previousOrder.reserve(qsizetype(node.children.size()));

    for (std::unique_ptr<Node> &child : node.children) {
        const QString path = child->path;

        previousOrder.insert(path, previousOrder.size());
        previous.emplace(path, std::move(child));
    }

    node.children.clear();
    node.children.reserve(size_t(children.size()));

    qsizetype lastPosition = -1;
    bool moved = false;

    for (const QJsonValue &value : children) {
        const QJsonObject json = value.toObject();
        const QString path = json.value(QLatin1String("path")).toString();

        auto found = previous.find(path);

        std::unique_ptr<Node> child;

        if (found != previous.end() && found->second->type == json.value(QLatin1String("type")).toString()
            && found->second->kind == kindFor(json, found->second->insideScroll)) {
            const qsizetype position = previousOrder.value(path);

            moved = moved || position < lastPosition;
            lastPosition = position;
            stats_.updated++;
            child = std::move(found->second);
            previous.erase(found);
            sync(*child, json, true);
        } else {
            child = createSynced(json, &node);
        }

        node.children.push_back(std::move(child));
    }

    if (moved) {
        stats_.reordered += int(node.children.size());

        if (debugging())
            qInfo().noquote() << "PulsarView reorder" << node.type << node.children.size();
    }

    for (auto &entry : previous) {
        stats_.removed++;

        dirtyStacks_.remove(entry.second.get());
        discard(*entry.second, nullptr);
    }

    refreshKids(node);
}

void NativeRenderer::forget(Node &node)
{
    index_.remove(node.path);
    unwatch(node);

    for (const std::unique_ptr<Node> &child : node.children) {
        dirtyStacks_.remove(child.get());
        forget(*child);
    }
}

bool NativeRenderer::hasQmlDescendant(const Node &node) const
{
    return std::any_of(node.children.begin(), node.children.end(), [this](const std::unique_ptr<Node> &child) {
        return child->kind == Kind::Island || child->kind == Kind::Shell || hasQmlDescendant(*child);
    });
}

void NativeRenderer::discard(Node &node, QQuickItem *after)
{
    forget(node);

    if (node.kind != Kind::Island && node.kind != Kind::Shell) {
        if (hasQmlDescendant(node))
            QMetaObject::invokeMethod(root_, "nativeForget", Q_ARG(QVariant, node.path));

        delete node.item;

        return;
    }

    QVariant animating;

    QMetaObject::invokeMethod(root_, "nativeDiscard", Q_RETURN_ARG(QVariant, animating), Q_ARG(QVariant, itemArg(node.item)));

    if (animating.toBool() && node.parent->stack && node.item->parentItem() == node.parent->stack)
        node.parent->stack->keepLeaving(kidFor(*node.parent, node), after);
}

bool wantsVisibility(const QJsonArray &events)
{
    return std::any_of(events.begin(), events.end(), [](const QJsonValue &event) {
        const QString name = event.toString();

        return name == QLatin1String("visible") || name == QLatin1String("enterViewport") || name == QLatin1String("leaveViewport");
    });
}

// A right click, or a long press on a touch screen, asks the app for its context menu.
void NativeRenderer::refreshContext(Node &node)
{
    const QJsonArray events = node.json.value(QLatin1String("events")).toArray();
    const bool wants = std::any_of(events.begin(), events.end(), [](const QJsonValue &event) {
        return event.toString() == QLatin1String("contextMenu") || event.toString() == QLatin1String("dropFiles");
    });

    if (!wants || node.context || !node.item || !root_)
        return;

    if (!contextTap_) {
        contextTap_ = std::make_unique<QQmlComponent>(qmlEngine(root_));
        contextTap_->setData(
            "import QtQuick; Item { id: overlay; width: parent ? parent.width : 0; height: parent ? parent.height : 0; z: 1000;"
            " property var renderer: null; property string path: \"\";"
            " TapHandler { acceptedButtons: Qt.RightButton; onTapped: (point) => overlay.renderer.contextRequested(overlay.path, point.scenePosition.x, point.scenePosition.y) }"
            " DropArea { anchors.fill: parent; onDropped: (drop) => { if (drop.hasUrls) overlay.renderer.filesDropped(overlay.path, drop.urls.map(String), drop.x, drop.y) } }"
            " TapHandler { acceptedDevices: PointerDevice.TouchScreen; longPressThreshold: 0.5; gesturePolicy: TapHandler.WithinBounds;"
            " onLongPressed: overlay.renderer.contextRequested(overlay.path, point.scenePosition.x, point.scenePosition.y) } }",
            QUrl());
    }

    QObject *object = contextTap_->createWithInitialProperties({ { QStringLiteral("renderer"), QVariant::fromValue(static_cast<QObject *>(this)) },
                                                                 { QStringLiteral("path"), node.path } },
                                                               qmlContext(root_));
    auto *overlay = qobject_cast<QQuickItem *>(object);

    if (!overlay) {
        qWarning().noquote() << "pulsar: context menu overlay:" << contextTap_->errorString();
        delete object;

        return;
    }

    overlay->setParentItem(node.item);
    node.context = overlay;

    if (debugging())
        qInfo().noquote() << "PulsarView context overlay" << node.path << overlay->size();
}

void NativeRenderer::filesDropped(const QString &path, const QStringList &urls, qreal x, qreal y)
{
    const Node *node = index_.value(path);

    if (!node || !root_ || !node->json.value(QLatin1String("events")).toArray().contains(QStringLiteral("dropFiles")))
        return;

    QVariantList files;

    for (const QString &url : urls) {
        const QUrl parsed(url);

        if (parsed.isLocalFile())
            files.append(parsed.toLocalFile());
    }

    if (files.isEmpty())
        return;

    const QVariantMap own = { { QStringLiteral("path"), node->path },
                              { QStringLiteral("id"), node->json.value(QLatin1String("id")).toVariant() },
                              { QStringLiteral("events"), node->json.value(QLatin1String("events")).toVariant() } };

    QVariantMap value;

    value.insert(QStringLiteral("files"), files);
    value.insert(QStringLiteral("x"), x);
    value.insert(QStringLiteral("y"), y);

    QMetaObject::invokeMethod(root_, "emitEvent", Q_ARG(QVariant, own), Q_ARG(QVariant, QStringLiteral("dropFiles")),
                              Q_ARG(QVariant, value));
}

void NativeRenderer::contextRequested(const QString &path, qreal x, qreal y)
{
    if (debugging())
        qInfo().noquote() << "PulsarView context" << path << x << y;

    const Node *node = index_.value(path);

    if (!node || !root_)
        return;

    const QVariantMap own = { { QStringLiteral("path"), node->path },
                              { QStringLiteral("id"), node->json.value(QLatin1String("id")).toVariant() },
                              { QStringLiteral("events"), node->json.value(QLatin1String("events")).toVariant() } };

    QVariantMap position;

    position.insert(QStringLiteral("x"), x);
    position.insert(QStringLiteral("y"), y);

    QMetaObject::invokeMethod(root_, "emitEvent", Q_ARG(QVariant, own), Q_ARG(QVariant, QStringLiteral("contextMenu")),
                              Q_ARG(QVariant, position));
}

void NativeRenderer::refreshWatch(Node &node)
{
    refreshContext(node);

    if (!node.item || !node.parent)
        return;

    const bool wants = wantsVisibility(node.json.value(QLatin1String("events")).toArray());

    if (!wants) {
        unwatch(node);

        return;
    }

    if (node.viewport)
        return;

    QQuickItem *viewport = host_;

    for (const Node *up = node.parent; up; up = up->parent) {
        if (up->kind == Kind::Scroll && up->item) {
            viewport = up->item;

            break;
        }
    }

    if (!viewport)
        return;

    node.viewport = viewport;
    node.visibleState = -1;
    watched_[viewport].append(&node);

    hookViewport(viewport);
    connect(node.item, &QQuickItem::yChanged, this, [this, viewport]() { scheduleVisibility(viewport); });
    connect(node.item, &QQuickItem::heightChanged, this, [this, viewport]() { scheduleVisibility(viewport); });
    scheduleVisibility(viewport);
}

void NativeRenderer::unwatch(Node &node)
{
    if (!node.viewport)
        return;

    const auto found = watched_.find(node.viewport);

    if (found != watched_.end())
        found->removeOne(&node);

    node.viewport = nullptr;
    node.visibleState = -1;
}

// One scroll feeds all the nodes watching it, so a long list costs one connection, not one per row.
void NativeRenderer::hookViewport(QQuickItem *viewport)
{
    if (hooked_.contains(viewport))
        return;

    hooked_.insert(viewport);

    const auto schedule = [this, viewport]() { scheduleVisibility(viewport); };

    if (viewport == host_) {
        connect(viewport, &QQuickItem::widthChanged, this, schedule);
        connect(viewport, &QQuickItem::heightChanged, this, schedule);
    } else {
        for (const char *signal : { SIGNAL(contentYChanged()), SIGNAL(contentHeightChanged()), SIGNAL(heightChanged()),
                                    SIGNAL(widthChanged()) }) {
            connect(viewport, signal, this, SLOT(scheduleVisibilitySlot()));
        }
    }

    connect(viewport, &QObject::destroyed, this, [this, viewport]() {
        hooked_.remove(viewport);
        pendingVisibility_.remove(viewport);
        watched_.remove(viewport);
    });
}

void NativeRenderer::scheduleVisibilitySlot()
{
    if (auto *viewport = qobject_cast<QQuickItem *>(sender()))
        scheduleVisibility(viewport);
}

// Coalesced: scrolling and layout change many things per frame, one check follows them all.
void NativeRenderer::scheduleVisibility(QQuickItem *viewport)
{
    if (pendingVisibility_.contains(viewport))
        return;

    pendingVisibility_.insert(viewport);

    QTimer::singleShot(16, this, [this, viewport = QPointer<QQuickItem>(viewport)]() {
        if (!viewport)
            return;

        pendingVisibility_.remove(viewport);
        checkVisibility(viewport);
    });
}

// An empty node still has a place: it is in view when that place is.
static bool overlaps(qreal start, qreal length, qreal extent)
{
    if (length <= 0)
        return start >= 0 && start <= extent;

    return start + length > 0 && start < extent;
}

void NativeRenderer::checkVisibility(QQuickItem *viewport)
{
    const auto found = watched_.constFind(viewport);

    if (found == watched_.constEnd() || !root_)
        return;

    QElapsedTimer timer;

    timer.start();

    const qreal width = viewport->width();
    const qreal height = viewport->height();
    const bool shown = viewport->isVisible() && width > 0 && height > 0;

    // Emitting can change the tree, so decide for all first.
    struct Change {
        QVariantMap node;
        bool visible;
        bool first;
        QStringList events;
    };

    QList<Change> changes;

    for (Node *node : *found) {
        bool visible = shown && node->item && node->item->isVisible();

        if (visible) {
            const QRectF box = node->item->mapRectToItem(viewport, QRectF(0, 0, node->item->width(), node->item->height()));

            visible = overlaps(box.left(), box.width(), width) && overlaps(box.top(), box.height(), height);
        }

        if (int(visible) == node->visibleState)
            continue;

        const bool first = node->visibleState < 0;

        node->visibleState = visible;

        QStringList events;

        for (const QJsonValue &event : node->json.value(QLatin1String("events")).toArray())
            events.append(event.toString());

        changes.append({ { { QStringLiteral("path"), node->path },
                           { QStringLiteral("id"), node->json.value(QLatin1String("id")).toVariant() },
                           { QStringLiteral("events"), node->json.value(QLatin1String("events")).toVariant() } },
                         visible, first, events });
    }

    const auto raise = [this](const Change &change, const QString &event, const QVariant &value) {
        if (!change.events.contains(event))
            return;

        QMetaObject::invokeMethod(root_, "emitEvent", Q_ARG(QVariant, change.node), Q_ARG(QVariant, event), Q_ARG(QVariant, value));
    };

    if (debugging() && !changes.isEmpty())
        qInfo().noquote() << QStringLiteral("PulsarView visibility %1 watched, %2 changed, %3 ms")
                                 .arg(found->size()).arg(changes.size()).arg(timer.nsecsElapsed() / 1e6, 0, 'f', 2);

    for (const Change &change : std::as_const(changes)) {
        raise(change, QStringLiteral("visible"), change.visible);

        if (change.visible)
            raise(change, QStringLiteral("enterViewport"), QVariant());
        else if (!change.first)
            raise(change, QStringLiteral("leaveViewport"), QVariant());
    }
}

bool NativeRenderer::command(const QJsonObject &params)
{
    if (!root_)
        return false;

    const QString name = params.value(QLatin1String("command")).toString();

    if (name != QLatin1String("scrollTo") && name != QLatin1String("scrollToEnd"))
        return false;

    const int controller = params.value(QLatin1String("controller")).toInt(-1);
    const bool toEnd = name == QLatin1String("scrollToEnd");
    const qreal position = params.value(QLatin1String("position")).toDouble(0);
    const bool animated = params.value(QLatin1String("animated")).toBool();

    bool moved = false;

    for (const auto &entry : std::as_const(index_)) {
        const Node &node = *entry;

        if (!node.item || node.props.value(QLatin1String("scrollController")).toInt(-1) != controller)
            continue;

        // A scroll that QML renders, even inside an island, is found by the QML side, below.
        if (node.kind != Kind::Scroll)
            continue;

        QVariant done;

        QMetaObject::invokeMethod(root_, "nativeScrollTo", Q_RETURN_ARG(QVariant, done), Q_ARG(QVariant, itemArg(node.item)),
                                  Q_ARG(QVariant, toEnd), Q_ARG(QVariant, position), Q_ARG(QVariant, animated));

        moved = moved || done.toBool();
    }

    QVariant inIslands;

    QMetaObject::invokeMethod(root_, "nativeScrollByController", Q_RETURN_ARG(QVariant, inIslands),
                              Q_ARG(QVariant, controller), Q_ARG(QVariant, toEnd), Q_ARG(QVariant, position),
                              Q_ARG(QVariant, animated));

    return moved || inIslands.toBool();
}

QObject *NativeRenderer::itemAt(const QString &path) const
{
    const Node *node = index_.value(path);

    return node ? node->item : nullptr;
}

QJsonObject NativeRenderer::snapshotNode(const Node &node) const
{
    if (node.kind == Kind::Island)
        return node.json;

    QJsonArray children;

    for (const std::unique_ptr<Node> &child : node.children)
        children.append(snapshotNode(*child));

    QJsonObject out = node.json;

    out.insert(QLatin1String("children"), children);

    return out;
}

QJsonArray NativeRenderer::snapshot() const
{
    if (!tree_)
        return pendingTree_;

    QJsonArray out;

    for (const std::unique_ptr<Node> &child : tree_->children)
        out.append(snapshotNode(*child));

    return out;
}

} // namespace pulsar
