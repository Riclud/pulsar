#include "native_renderer.h"
#include "native_motion.h"
#include "startup_trace.h"

#include <QAccessible>
#include <QColor>
#include <QElapsedTimer>
#include <QFont>
#include <QGuiApplication>
#include <QInputMethod>
#include <QJSValue>
#include <QJsonValue>
#include <QMetaEnum>
#include <QMetaProperty>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQmlListReference>
#include <QQuickWindow>
#include <QRegularExpression>
#include <QScopeGuard>
#include <QScreen>
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
        QStringLiteral("rotation"),  QStringLiteral("absolute"),  QStringLiteral("a11yLabel"),
        QStringLiteral("a11yHint"),  QStringLiteral("a11yRole"),  QStringLiteral("a11yChecked"),
    };

    return props;
}

const QSet<QString> &a11yProps()
{
    static const QSet<QString> props = {
        QStringLiteral("a11yLabel"),
        QStringLiteral("a11yHint"),
        QStringLiteral("a11yRole"),
        QStringLiteral("a11yChecked"),
    };

    return props;
}

const QSet<QString> &motionProps()
{
    static const QSet<QString> props = {
        QStringLiteral("enter"),
        QStringLiteral("exit"),
    };

    return props;
}

const QSet<QString> &imageProps()
{
    static const QSet<QString> props = {
        QStringLiteral("src"),
        QStringLiteral("fillMode"),
    };

    return props;
}

const QSet<QString> &elevationProp()
{
    static const QSet<QString> props = { QStringLiteral("elevation") };

    return props;
}

// PULSAR_QML_SURFACES=1 sends motion, a11y props and images back to QML, to compare the two paths.
bool qmlSurfaces()
{
    static const bool enabled = qEnvironmentVariableIntValue("PULSAR_QML_SURFACES") > 0;

    return enabled;
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

bool isAbsent(const QJsonValue &value)
{
    return value.isNull() || value.isUndefined();
}

// Colours, scale and opacity of a state style are native; anything else stays in QML.
bool stylePortable(const QJsonObject &style)
{
    for (auto it = style.begin(); it != style.end(); ++it) {
        const QString key = it.key();
        const bool colour = key == QLatin1String("color") || key == QLatin1String("borderColor");
        const bool amount = key == QLatin1String("scale") || key == QLatin1String("opacity");

        if (colour && it.value().isString())
            continue;

        if (amount && it.value().isDouble())
            continue;

        return false;
    }

    return true;
}

// Where an enter starts and an exit ends: offsets, scale and opacity.
bool posePortable(const QJsonValue &pose)
{
    if (isAbsent(pose))
        return true;

    if (!pose.isObject())
        return false;

    const QJsonObject object = pose.toObject();

    for (auto it = object.begin(); it != object.end(); ++it) {
        const QString key = it.key();
        const bool known = key == QLatin1String("x") || key == QLatin1String("y") || key == QLatin1String("scale")
            || key == QLatin1String("opacity");

        if (!known || !it.value().isDouble())
            return false;
    }

    return true;
}

bool statesPortable(const QJsonObject &props)
{
    for (const char *name : { "hover", "pressed", "disabled" }) {
        const QJsonValue style = props.value(QLatin1String(name));

        if (!style.isObject() && !style.isBool() && !isAbsent(style))
            return false;

        if (!stylePortable(style.toObject()))
            return false;
    }

    if (!posePortable(props.value(QLatin1String("enter"))) || !posePortable(props.value(QLatin1String("exit"))))
        return false;

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

// What PULSAR_QML_SURFACES hands back to QML.
bool usesPortedProps(const QString &type, const QJsonObject &props)
{
    if (type == QLatin1String("image") || props.contains(QLatin1String("elevation")))
        return true;

    for (const QSet<QString> *set : { &a11yProps(), &motionProps() }) {
        const bool used = std::any_of(set->begin(), set->end(), [&](const QString &key) { return props.contains(key); });

        if (used)
            return true;
    }

    for (const char *name : { "hover", "pressed", "disabled" }) {
        const QJsonObject style = props.value(QLatin1String(name)).toObject();

        if (style.contains(QLatin1String("scale")) || style.contains(QLatin1String("opacity")))
            return true;
    }

    return false;
}

bool imagePortable(const QJsonObject &props)
{
    const QJsonValue src = props.value(QLatin1String("src"));
    const QJsonValue fillMode = props.value(QLatin1String("fillMode"));

    return (src.isString() || isAbsent(src)) && (fillMode.isString() || fillMode.isDouble() || isAbsent(fillMode));
}

NativeMotion::Pose poseOf(const QJsonValue &value)
{
    const QJsonObject object = value.toObject();

    const auto read = [&](const char *key) -> std::optional<qreal> {
        const QJsonValue found = object.value(QLatin1String(key));

        return found.isDouble() ? std::optional<qreal>(found.toDouble()) : std::nullopt;
    };

    return { read("x"), read("y"), read("scale"), read("opacity") };
}

// A press that drifted away is not held: the same 12 px rule as MotionNode.
bool pressHeld(const QObject *handler)
{
    if (!handler->property("active").toBool())
        return false;

    const QVariant point = handler->property("point");
    const QMetaObject *meta = point.metaType().metaObject();

    if (!meta)
        return false;

    const auto read = [&](const char *name) {
        return meta->property(meta->indexOfProperty(name)).readOnGadget(point.constData()).toPointF();
    };

    const QPointF moved = read("scenePosition") - read("scenePressPosition");

    return std::abs(moved.x()) < 12 && std::abs(moved.y()) < 12;
}

// The names Image.fillMode takes in QML, and the SDK's own.
int imageFillMode(const QJsonValue &value)
{
    static const QHash<QString, int> modes = {
        { QStringLiteral("contain"), 1 },
        { QStringLiteral("cover"), 2 },
        { QStringLiteral("stretch"), 0 },
        { QStringLiteral("Stretch"), 0 },
        { QStringLiteral("PreserveAspectFit"), 1 },
        { QStringLiteral("PreserveAspectCrop"), 2 },
        { QStringLiteral("Tile"), 3 },
        { QStringLiteral("Pad"), 6 },
    };

    return value.isDouble() ? value.toInt() : modes.value(value.toString(), 0);
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

// Building a big tree is cut into slices so that the window keeps answering: once an update has made
// `nodes` nodes and taken `ms`, what is left of a scroll's content waits for the next slices.
// PULSAR_SLICE_MS sets the time (negative: never slice), PULSAR_SLICE_NODES the node count.
struct SliceLimits {
    int ms = 8;
    int nodes = 300;
};

const SliceLimits &sliceLimits()
{
    static const SliceLimits limits = []() {
        SliceLimits out;
        bool ok = false;

        const int ms = qEnvironmentVariableIntValue("PULSAR_SLICE_MS", &ok);

        if (ok)
            out.ms = ms;

        const int nodes = qEnvironmentVariableIntValue("PULSAR_SLICE_NODES", &ok);

        if (ok)
            out.nodes = nodes;

        return out;
    }();

    return limits;
}

// These mount outside their parent and place themselves, so a placeholder cannot stand in for them.
bool placesItself(const QString &type)
{
    static const QSet<QString> types = {
        QStringLiteral("sheet"), QStringLiteral("snackbar"), QStringLiteral("popover"),
        QStringLiteral("menu"),  QStringLiteral("fab"),
    };

    return types.contains(type);
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
    // A unique connection scans every stack already connected to the window, so the window is remembered instead.
    if (next != mirrorSource_) {
        mirrorSource_ = next;

        connect(next, SIGNAL(layoutMirroredChanged()), this, SLOT(hintsChanged()));
    }

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
static qreal openShare(qreal full, qreal limit)
{
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
            out.share = openShare(kid.qml->motion->property("fullHeight").toReal(),
                                  kid.qml->motion->property("heightLimit").toReal());
    }

    if (kid.motion) {
        out.maxHeight = qMin(out.maxHeight, kid.motion->heightLimit());
        out.share = openShare(kid.motion->fullHeight(), kid.motion->heightLimit());
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

    const auto compile = [&](const char *code, const QUrl &base = QUrl()) {
        auto component = std::make_unique<QQmlComponent>(engine);

        component->setData(code, base);

        return component;
    };

    surface_ = compile("import QtQuick; Rectangle { property var pulsarMeta: null }");
    // The window's own URL, so a relative src resolves as it does for an image that QML makes.
    image_ = compile("import QtQuick; Image {}", qmlContext(root)->baseUrl());
    tapHandler_ = compile("import QtQuick; TapHandler { longPressThreshold: 0.5 }");
    hoverHandler_ = compile("import QtQuick; HoverHandler {}");
    pressHandler_ = compile("import QtQuick; PointHandler { target: null }");
    shift_ = compile("import QtQuick; Translate {}");

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
    pending_.clear();
    handlerNodes_.clear();
    hoverHandlers_.clear();
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
    theme_.motionFast = root_->property("motionFast").toInt();

    QVariant curveValue = root_->property("motionCurve");

    if (curveValue.canConvert<QJSValue>())
        curveValue = curveValue.value<QJSValue>().toVariant();

    const QVariantList curve = curveValue.toList();

    theme_.motionCurve = QEasingCurve(QEasingCurve::BezierSpline);

    if (curve.size() == 6)
        theme_.motionCurve.addCubicBezierSegment({ curve.at(0).toReal(), curve.at(1).toReal() },
                                                 { curve.at(2).toReal(), curve.at(3).toReal() },
                                                 { curve.at(4).toReal(), curve.at(5).toReal() });
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
    if (node.kind == Kind::Pending)
        return;

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

    sliceClock_.start();
    syncChildren(*tree_, tree);

    const qint64 elapsed = sliceClock_.elapsed();

    sliceClock_.invalidate();
    scheduleSlice();

    pulsar::startupMark("ui-built");
    logApplied("built", tree.size(), elapsed);

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

    sliceClock_.start();

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

    const qint64 elapsed = sliceClock_.elapsed();

    sliceClock_.invalidate();
    scheduleSlice();
    logApplied("patch", patches.size(), elapsed);
}

// `pending` shows only while something waits, so the line of a small update reads as it always did.
void NativeRenderer::logApplied(const char *label, qsizetype count, qint64 elapsed) const
{
    if (!debugging())
        return;

    const QString waiting = pending_.isEmpty() ? QString() : QStringLiteral(" pending=%1").arg(pending_.size());

    qInfo().noquote().nospace() << "PulsarView " << label << " " << count << " +" << stats_.created << " ~" << stats_.updated
                                << " -" << stats_.removed << " reorder=" << stats_.reordered << waiting
                                << " qml=" << stats_.mounted << " " << elapsed << "ms";
}

bool NativeRenderer::overBudget(const QJsonObject &json, const Node &parent) const
{
    const SliceLimits &limits = sliceLimits();

    if (limits.ms < 0 || !sliceClock_.isValid())
        return false;

    // Only a scroll's content: it is what grows without bound, and most of it is out of view anyway.
    if (!parent.insideScroll && parent.kind != Kind::Scroll)
        return false;

    // A slice builds until its time is up; the update that starts it also has to be a big one.
    const bool big = pendingFront_ >= 0 || stats_.created >= limits.nodes;

    if (!big || sliceClock_.elapsed() < limits.ms)
        return false;

    return !placesItself(json.value(QLatin1String("type")).toString());
}

std::unique_ptr<NativeRenderer::Node> NativeRenderer::createPending(const QJsonObject &json, Node *parent)
{
    auto node = std::make_unique<Node>();

    node->path = json.value(QLatin1String("path")).toString();
    node->type = json.value(QLatin1String("type")).toString();
    node->parent = parent;
    node->insideScroll = true;
    node->kind = Kind::Pending;
    node->json = json;
    node->props = json.value(QLatin1String("props")).toObject();
    node->heldEnter = creationDepth_ > 0;
    node->item = new QQuickItem();
    node->item->setVisible(false);

    adopt(node->item, parent->stack);

    index_.insert(node->path, node.get());
    stats_.deferred++;

    if (!sliceRun_.isValid())
        sliceRun_.start();

    if (pendingFront_ >= 0)
        pending_.insert(pendingFront_++, node.get());
    else
        pending_.append(node.get());

    return node;
}

// Puts the real node in the placeholder's slot. Its own children can be put off again when time is up.
void NativeRenderer::build(Node &node)
{
    Node *parent = node.parent;
    const QJsonObject json = node.json;
    const bool held = node.heldEnter;

    const auto slot = std::find_if(parent->children.begin(), parent->children.end(),
                                   [&](const std::unique_ptr<Node> &child) { return child.get() == &node; });

    forget(node);
    delete node.item;

    creationDepth_ += held ? 1 : 0;
    *slot = createSynced(json, parent, false);
    creationDepth_ -= held ? 1 : 0;
}

void NativeRenderer::scheduleSlice()
{
    if (pending_.isEmpty() || sliceScheduled_)
        return;

    sliceScheduled_ = true;

    // A zero timer runs after the input and paint events that are already waiting.
    QTimer::singleShot(0, this, &NativeRenderer::buildSlice);
}

void NativeRenderer::buildSlice()
{
    sliceScheduled_ = false;

    if (!root_ || pending_.isEmpty())
        return;

    stats_ = {};
    dirtyStacks_.clear();

    QSet<Node *> parents;

    sliceClock_.start();

    do {
        Node *node = pending_.takeFirst();

        parents.insert(node->parent);

        pendingFront_ = 0;
        build(*node);
    } while (!pending_.isEmpty() && sliceClock_.elapsed() < sliceLimits().ms);

    pendingFront_ = -1;

    for (Node *parent : std::as_const(parents))
        refreshKids(*parent);

    for (Node *stack : std::as_const(dirtyStacks_))
        refreshKids(*stack);

    dirtyStacks_.clear();

    const qint64 elapsed = sliceClock_.elapsed();

    sliceClock_.invalidate();
    scheduleSlice();
    logApplied("slice", parents.size(), elapsed);

    if (!pending_.isEmpty())
        return;

    if (debugging())
        qInfo().noquote() << "PulsarView slices done" << sliceRun_.elapsed() << "ms";

    sliceRun_.invalidate();
}

void NativeRenderer::applyPatch(const QString &path, const QJsonObject &json, bool shallow)
{
    Node *node = index_.value(path);

    if (!node) {
        if (!patchIsland(path, json, shallow))
            qWarning().noquote() << "pulsar: patch for an unknown node" << path;

        return;
    }

    if (node->kind == Kind::Pending) {
        QJsonObject merged = json;

        if (shallow)
            merged.insert(QLatin1String("children"), node->json.value(QLatin1String("children")));

        stats_.updated++;
        sync(*node, merged, true);

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

    if (island->kind != Kind::Island && island->kind != Kind::Pending)
        return false;

    QJsonArray wrapper = { island->json };

    if (!replaceInNodes(wrapper, path, json, shallow))
        return false;

    island->json = wrapper.at(0).toObject();
    island->props = island->json.value(QLatin1String("props")).toObject();

    stats_.updated++;

    // A subtree that is not built yet has nothing to update but its JSON.
    if (island->kind == Kind::Pending)
        return true;

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

    if (known && (known->kind == Kind::Island || known->kind == Kind::Pending)) {
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

            if (island && (island->kind == Kind::Island || island->kind == Kind::Pending))
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

// wrap stays an island: a native wrap needs a flow mode in NativeStack that measures its kids the way
// QML's Flow does (implicit sizes, caps, spacing on both axes). An image that is clicked stays one too.
NativeRenderer::Kind NativeRenderer::kindFor(const QJsonObject &json, bool insideScroll) const
{
    const QString type = json.value(QLatin1String("type")).toString();
    const QJsonObject props = json.value(QLatin1String("props")).toObject();
    const QJsonArray events = json.value(QLatin1String("events")).toArray();
    const bool surface = type == QLatin1String("card") || type == QLatin1String("box");

    if (qmlSurfaces() && usesPortedProps(type, props))
        return surface ? Kind::Shell : Kind::Island;

    if (surface) {
        const bool plainEvents = std::all_of(events.begin(), events.end(), [](const QJsonValue &event) {
            return event.toString() == QLatin1String("click") || event.toString() == QLatin1String("longPress")
                || passiveEvent(event.toString());
        });

        if (!plainEvents)
            return Kind::Shell;

        // No shadow is the same as no elevation; a shadow is drawn by the QML card and box.
        if (props.contains(QLatin1String("elevation")) && props.value(QLatin1String("elevation")).toDouble(1) != 0)
            return Kind::Shell;

        const auto used = [&](const QSet<QString> &keys) {
            return std::any_of(keys.begin(), keys.end(), [&](const QString &key) { return props.contains(key); });
        };

        if (!used(stateProps()) && !used(motionProps())) {
            if (!propsAllowed(props, { &commonProps(), &paddingProps(), &boxProps(), &elevationProp() }))
                return Kind::Shell;

            return hasActiveEvents(events) ? Kind::ClickableBox : Kind::Box;
        }

        const bool known = propsAllowed(props, { &commonProps(), &paddingProps(), &boxProps(), &elevationProp(), &stateProps(),
                                                 &motionProps(), &transitionProp() });

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

    if (type == QLatin1String("image"))
        return propsAllowed(props, { &commonProps(), &imageProps() }) && imagePortable(props) ? Kind::Image : Kind::Island;

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
    } else if (node->kind == Kind::Image) {
        node->item = instantiate(image_.get());
    } else if (node->kind == Kind::Box || node->kind == Kind::ClickableBox || node->kind == Kind::StateBox) {
        node->item = instantiate(surface_.get());
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
std::unique_ptr<NativeRenderer::Node> NativeRenderer::createSynced(const QJsonObject &json, Node *parent, bool mayDefer)
{
    if (mayDefer && overBudget(json, *parent))
        return createPending(json, parent);

    creationDepth_++;

    std::unique_ptr<Node> node = create(json, parent);

    sync(*node, json, true);

    creationDepth_--;

    const bool shell = node->kind == Kind::Shell && node->props.contains(QLatin1String("enter"));
    const bool native = node->motion && truthy(node->props.value(QLatin1String("enter"))) && motionReady()
        && node->item->isVisible();

    if (creationDepth_ > 0 || (!shell && !native))
        return node;

    // Text wrapping depends on the width, and the parent has not placed this child yet.
    if (parent->type != QLatin1String("row") && parent->stack)
        node->item->setWidth(parent->stack->width());

    settle(*node);

    if (shell)
        QMetaObject::invokeMethod(root_, "nativeEnter", Q_ARG(QVariant, itemArg(node->item)));
    else
        playEnter(*node);

    return node;
}

bool NativeRenderer::motionReady() const
{
    return root_ && root_->property("motionReady").toBool();
}

qreal NativeRenderer::restingOpacity(const Node &node) const
{
    return number(node.props, QLatin1String("opacity"), 1);
}

void NativeRenderer::playEnter(Node &node)
{
    node.motion->playEnter(poseOf(node.props.value(QLatin1String("enter"))), restingOpacity(node));

    if (debugging())
        qInfo().noquote() << "PulsarView enter" << node.path;
}

// The item outlives its node while it leaves: the motion is its child and deletes it at the end.
bool NativeRenderer::playExit(Node &node, QQuickItem *after)
{
    const QJsonValue exit = node.props.value(QLatin1String("exit"));

    if (!node.motion || !truthy(exit) || !motionReady() || !node.item->isVisible())
        return false;

    QQuickItem *item = node.item;

    item->setEnabled(false);

    if (node.parent && node.parent->stack && item->parentItem() == node.parent->stack)
        node.parent->stack->keepLeaving(kidFor(*node.parent, node), after);

    node.motion->playExit(poseOf(exit), [item, path = node.path]() {
        if (debugging())
            qInfo().noquote() << "PulsarView exit done" << path;

        item->setVisible(false);
        item->deleteLater();
    });

    return true;
}

// The same steps as applyVisible in PulsarView.qml: a node with motion fades in and out of its place.
void NativeRenderer::applyVisible(Node &node)
{
    QQuickItem *item = node.item;
    const bool next = node.props.value(QLatin1String("visible")).toBool(true);
    const int previous = std::exchange(node.lastVisible, int(next));

    if (!node.motion || previous < 0 || previous == int(next) || !motionReady()) {
        item->setVisible(next);
        return;
    }

    const QJsonValue enter = node.props.value(QLatin1String("enter"));
    const QJsonValue exit = node.props.value(QLatin1String("exit"));
    const qreal resting = restingOpacity(node);

    if (next && !truthy(enter)) {
        node.motion->settle(resting);
        item->setVisible(true);

        return;
    }

    if (next) {
        item->setVisible(true);
        playEnter(node);

        return;
    }

    if (!truthy(exit)) {
        item->setVisible(false);
        return;
    }

    node.motion->playExit(poseOf(exit), [item, motion = node.motion, resting, path = node.path]() {
        item->setVisible(false);
        motion->settle(resting);

        if (debugging())
            qInfo().noquote() << "PulsarView hide done" << path;
    });
}

void NativeRenderer::applyMotion(Node &node)
{
    if (!node.motion) {
        node.motion = new NativeMotion(node.item, [self = QPointer<NativeRenderer>(this)](QQuickItem *item) -> QObject * {
            if (!self || !self->root_)
                return nullptr;

            QObject *shift = self->shift_->create(qmlContext(self->root_));

            if (!shift)
                return nullptr;

            shift->setParent(item);
            QQmlListReference(item, "transform", qmlEngine(self->root_)).append(shift);

            return shift;
        });
    }

    const QJsonObject transition = node.props.value(QLatin1String("transition")).toObject();
    const QJsonValue duration = transition.value(QLatin1String("duration"));
    const QString curve = transition.value(QLatin1String("curve")).toString();

    const QEasingCurve easing = curve == QLatin1String("linear") ? QEasingCurve(QEasingCurve::Linear)
        : curve == QLatin1String("ease")                         ? QEasingCurve(QEasingCurve::OutCubic)
                                                                 : theme_.motionCurve;

    node.motion->configure(duration.isDouble() ? int(duration.toDouble()) : theme_.motionFast, easing,
                           node.props.value(QLatin1String("clip")).toBool(false));
}

void NativeRenderer::applyAccessible(Node &node)
{
    const QJsonObject &props = node.props;
    const bool used = std::any_of(a11yProps().begin(), a11yProps().end(), [&](const QString &key) { return props.contains(key); });

    if (!used)
        return;

    QQmlContext *context = qmlContext(root_);

    const auto write = [&](const char *name, const QVariant &value) {
        QQmlProperty(node.item, QString::fromLatin1(name), context).write(value);
    };

    const QString label = textOf(props, "a11yLabel");
    const QString hint = textOf(props, "a11yHint");

    if (!label.isEmpty())
        write("Accessible.name", label);

    if (!hint.isEmpty())
        write("Accessible.description", hint);

    // The names QML's Accessible has; a role it does not know is skipped there too.
    static const QHash<QString, QByteArray> roles = {
        { QStringLiteral("button"), "Button" },       { QStringLiteral("checkbox"), "CheckBox" },
        { QStringLiteral("radio"), "RadioButton" },   { QStringLiteral("switch"), "Switch" },
        { QStringLiteral("slider"), "Slider" },       { QStringLiteral("text"), "StaticText" },
        { QStringLiteral("image"), "Image" },         { QStringLiteral("list"), "List" },
        { QStringLiteral("listItem"), "ListItem" },   { QStringLiteral("dialog"), "Dialog" },
        { QStringLiteral("link"), "Link" },           { QStringLiteral("progress"), "ProgressBar" },
        { QStringLiteral("tab"), "PageTab" },         { QStringLiteral("tabList"), "PageTabList" },
        { QStringLiteral("menu"), "Menu" },           { QStringLiteral("menuItem"), "MenuItem" },
        { QStringLiteral("toolbar"), "ToolBar" },     { QStringLiteral("group"), "Grouping" },
        { QStringLiteral("pane"), "Pane" },
    };

    const QByteArray roleName = roles.value(props.value(QLatin1String("a11yRole")).toVariant().toString());
    const int role = roleName.isEmpty() ? -1 : QMetaEnum::fromType<QAccessible::Role>().keyToValue(roleName.constData());

    if (role >= 0)
        write("Accessible.role", role);

    if (debugging())
        qInfo().noquote() << "PulsarView a11y" << node.path
                          << "name=" + QQmlProperty(node.item, QStringLiteral("Accessible.name"), context).read().toString()
                          << "role=" + QString::number(role);

    if (!props.contains(QLatin1String("a11yChecked")))
        return;

    write("Accessible.checkable", true);
    write("Accessible.checked", props.value(QLatin1String("a11yChecked")).toBool(false));
}

// Debug only: what a test reads to see that the image loaded and how large it is drawn.
void NativeRenderer::imageStatusChanged()
{
    const QObject *image = sender();

    qInfo().noquote() << "PulsarView image status" << image->property("pulsarPath").toString()
                      << image->property("status").toInt() << image->property("paintedWidth").toReal()
                      << image->property("paintedHeight").toReal();
}

// The same loading as the QML image: off the GUI thread and at a bounded size when the box is known.
void NativeRenderer::applyImage(Node &node)
{
    QQuickItem *item = node.item;
    const QJsonObject &props = node.props;
    const bool boxed = props.contains(QLatin1String("width")) && props.contains(QLatin1String("height"));

    item->setProperty("asynchronous", boxed);

    if (boxed) {
        const auto *window = qobject_cast<QQuickWindow *>(root_.data());
        const qreal ratio = window && window->screen() ? window->screen()->devicePixelRatio() : 1;
        const qreal longest = qMax(number(props, QLatin1String("width"), 0), number(props, QLatin1String("height"), 0));
        const int side = int(std::ceil(longest * ratio * 2));

        item->setProperty("sourceSize", QSize(side, side));
    }

    item->setProperty("source", QUrl(textOf(props, "src")));

    if (props.contains(QLatin1String("fillMode")))
        item->setProperty("fillMode", imageFillMode(props.value(QLatin1String("fillMode"))));

    if (!debugging())
        return;

    qInfo().noquote() << "PulsarView image" << node.path << "async=" + QString::number(boxed)
                      << "fill=" + QString::number(item->property("fillMode").toInt());

    if (item->property("pulsarPath").isValid())
        return;

    item->setProperty("pulsarPath", node.path);
    connect(item, SIGNAL(statusChanged(QQuickImageBase::Status)), this, SLOT(imageStatusChanged()));
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

    stats_.mounted++;

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
    if (node.kind == Kind::Pending) {
        node.type = json.value(QLatin1String("type")).toString();
        node.json = json;
        node.props = json.value(QLatin1String("props")).toObject();

        return;
    }

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

        // applyBox has already done it for props that changed.
        if (!changed && (node.kind == Kind::StateBox || node.kind == Kind::ClickableBox))
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

    const bool moves = std::any_of(motionProps().begin(), motionProps().end(), [&](const QString &key) {
        return truthy(props.value(key));
    });

    if (node.kind == Kind::StateBox && (node.motion || moves))
        applyMotion(node);

    applyVisible(node);
    applyAccessible(node);
    item->setEnabled(props.value(QLatin1String("enabled")).toBool(true));

    // A control's own dimming while disabled is a binding that an explicit 1 would replace.
    // A state box sets its opacity with its state, and leaves it alone while it enters or leaves.
    const bool ownOpacity = node.kind == Kind::StateBox
        || (node.kind == Kind::Control && !props.contains(QLatin1String("opacity")));

    if (!ownOpacity)
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

    if (node.kind == Kind::Image) {
        applyImage(node);
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

    const bool stateful = node.kind == Kind::StateBox;

    // A state box paints its colours with its state, so that a change eases from the colour it shows.
    if (!stateful)
        item->setProperty("color", resolveColor(props.value(QLatin1String("color")), card ? theme_.surface : QVariant(QStringLiteral("transparent"))));

    item->setProperty("radius", number(props, QLatin1String("radius"), card ? theme_.radius : 0));

    if (QObject *border = item->property("border").value<QObject *>()) {
        border->setProperty("width", number(props, QLatin1String("borderWidth"), card ? 1 : 0));

        if (!stateful)
            border->setProperty("color", resolveColor(props.value(QLatin1String("borderColor")), theme_.border));
    }

    node.stack->configure(NativeStack::Mode::Column, card ? theme_.spacing : 0, paddingEdges(props, card ? 16 : 0));

    if (card && debugging())
        qInfo().noquote() << "PulsarView card" << node.path
                          << "color=" + item->property("color").value<QColor>().name(QColor::HexArgb)
                          << "radius=" + QString::number(item->property("radius").toReal())
                          << "padding=" + QString::number(paddingEdges(props, 16).left);

    if (node.kind == Kind::Box)
        return;

    applyPointer(node);

    if (stateful)
        refreshState(node);
}

QObject *NativeRenderer::attachHandler(Node &node, QQmlComponent *component)
{
    QObject *handler = component->beginCreate(qmlContext(root_));

    if (!handler) {
        qWarning().noquote() << "pulsar:" << component->errorString();

        return nullptr;
    }

    QQmlEngine::setObjectOwnership(handler, QQmlEngine::CppOwnership);

    // A hover handler tells its item about itself when it completes, so the item comes first.
    handler->setParent(node.item);
    QQmlListReference(node.item, "data", qmlEngine(root_)).append(handler);
    component->completeCreate();

    handlerNodes_.insert(handler, &node);

    return handler;
}

void NativeRenderer::surfaceTapped()
{
    const Node *node = handlerNodes_.value(sender());

    if (!node || !root_ || !node->json.value(QLatin1String("events")).toArray().contains(QStringLiteral("click")))
        return;

    // QML picks the deepest of the items tapped at once, its own and these alike.
    QMetaObject::invokeMethod(root_, "nativeTapped", Q_ARG(QVariant, itemArg(node->item)));
}

void NativeRenderer::surfaceLongPressed()
{
    if (const Node *node = handlerNodes_.value(sender()))
        emitControl(*node, QStringLiteral("longPress"));
}

void NativeRenderer::surfaceHoverChanged()
{
    Node *node = handlerNodes_.value(sender());

    if (node && node->kind == Kind::StateBox)
        refreshState(*node);
}

void NativeRenderer::surfacePressChanged()
{
    Node *node = handlerNodes_.value(sender());

    if (!node || !node->surface)
        return;

    const bool holding = pressHeld(sender());

    if (holding == node->surface->holding)
        return;

    node->surface->holding = holding;

    if (node->kind == Kind::StateBox)
        refreshState(*node);
}

void NativeRenderer::setHoverEnabled(bool enabled)
{
    hoverHandlers_.removeIf([](const QPointer<QObject> &handler) { return handler.isNull(); });

    for (const QPointer<QObject> &handler : std::as_const(hoverHandlers_))
        handler->setProperty("enabled", enabled);
}

void NativeRenderer::paintSurface(Node &node, const QString &fill, const QString &edge, int ms)
{
    Surface &surface = *node.surface;
    const bool eases = surface.painted && ms > 0;

    surface.painted = true;

    // What `Behavior on color` did: a new colour eases from the one shown, over the transition.
    const auto paint = [&](QPointer<QVariantAnimation> &animation, QObject *target, const QString &name) {
        const QColor to(name);

        if (!target || !to.isValid())
            return;

        const bool running = animation && animation->state() == QAbstractAnimation::Running;

        if (running && animation->endValue().value<QColor>() == to)
            return;

        const QColor from = target->property("color").value<QColor>();

        if (!eases || from == to) {
            if (animation)
                animation->stop();

            target->setProperty("color", to);

            return;
        }

        if (!animation) {
            animation = new QVariantAnimation(target);

            connect(animation, &QVariantAnimation::valueChanged, target, [target](const QVariant &value) {
                target->setProperty("color", value);
            });
        }

        animation->stop();
        animation->setDuration(ms);
        animation->setStartValue(from);
        animation->setEndValue(to);
        animation->start();
    };

    paint(surface.fill, node.item, fill);
    paint(surface.edge, node.item->property("border").value<QObject *>(), edge);
}

void NativeRenderer::fadeSurface(Node &node, qreal opacity, int ms)
{
    Surface &surface = *node.surface;
    QQuickItem *item = node.item;

    if (!surface.fade) {
        surface.fade = new QVariantAnimation(item);
        surface.fade->setEasingCurve(QEasingCurve::OutCubic);

        connect(surface.fade, &QVariantAnimation::valueChanged, item, [item](const QVariant &value) {
            item->setOpacity(value.toReal());
        });
    }

    surface.fade->stop();
    surface.fade->setDuration(ms);
    surface.fade->setStartValue(item->opacity());
    surface.fade->setEndValue(opacity);
    surface.fade->start();
}

// Handlers are made for what the node reacts to, so a plain box carries none. The pointing hand shows
// over anything that reacts to the pointer, and stays once it has.
void NativeRenderer::applyPointer(Node &node)
{
    const QJsonObject &props = node.props;
    const bool clicks = hasActiveEvents(node.json.value(QLatin1String("events")).toArray());
    const bool reacts = props.contains(QLatin1String("hover")) || props.contains(QLatin1String("hoverColor"));
    const bool presses = truthy(props.value(QLatin1String("pressed")));

    if (!node.surface)
        node.surface = std::make_unique<Surface>();

    Surface &surface = *node.surface;

    if (clicks && !surface.tap) {
        surface.tap = attachHandler(node, tapHandler_.get());

        connect(surface.tap, SIGNAL(tapped(QEventPoint, Qt::MouseButton)), this, SLOT(surfaceTapped()));
        connect(surface.tap, SIGNAL(longPressed()), this, SLOT(surfaceLongPressed()));
    }

    if (surface.tap)
        surface.tap->setProperty("enabled", clicks);

    if (presses && !surface.press) {
        surface.press = attachHandler(node, pressHandler_.get());

        connect(surface.press, SIGNAL(activeChanged()), this, SLOT(surfacePressChanged()));
        connect(surface.press, SIGNAL(pointChanged()), this, SLOT(surfacePressChanged()));
    }

    if ((clicks || reacts) && !surface.hover) {
        surface.hover = attachHandler(node, hoverHandler_.get());

        connect(surface.hover, SIGNAL(hoveredChanged()), this, SLOT(surfaceHoverChanged()));

        hoverHandlers_.append(surface.hover);

        // Hover is off while a list scrolls, also for a row made during the scroll.
        if (root_->property("scrollingLists").toInt() > 0)
            surface.hover->setProperty("enabled", false);
    }

    if (debugging() && node.kind == Kind::StateBox)
        qInfo().noquote() << "PulsarView pointer" << node.path << "tap=" + QString::number(clicks)
                          << "hand=" + QString::number(clicks || reacts);

    if (surface.hover && (clicks || reacts))
        surface.hover->setProperty("cursorShape", int(Qt::PointingHandCursor));
}

// Which of normal, hover, pressed and disabled applies, and the colours, scale and opacity that go with it.
void NativeRenderer::refreshState(Node &node)
{
    const QJsonObject &props = node.props;
    Surface &surface = *node.surface;
    const bool card = node.type == QLatin1String("card");
    const QVariant fallback = card ? theme_.surface : QVariant(QStringLiteral("transparent"));
    const bool moving = node.motion && node.motion->animating();
    const bool styled = truthy(props.value(QLatin1String("hover"))) || truthy(props.value(QLatin1String("pressed")))
        || truthy(props.value(QLatin1String("disabled"))) || props.contains(QLatin1String("hoverColor"));

    if (!styled && !node.styled) {
        paintSurface(node, resolveColor(props.value(QLatin1String("color")), fallback),
                     resolveColor(props.value(QLatin1String("borderColor")), theme_.border), 0);

        if (!moving)
            node.item->setOpacity(restingOpacity(node));

        return;
    }

    node.styled = styled;

    const QJsonValue enabled = props.value(QLatin1String("enabled"));
    const bool hovered = surface.hover && surface.hover->property("hovered").toBool();
    const bool holding = surface.holding && !moving;
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

    paintSurface(node, fill, edge, ms);

    const qreal scale = number(style, QLatin1String("scale"), 1);

    // Only a node that is ever scaled gets a motion; most pressed styles change a colour.
    if (scale != 1 && !node.motion)
        applyMotion(node);

    if (node.motion)
        node.motion->setStateScale(scale);

    if (node.motion && node.motion->animating())
        return;

    const qreal opacity = number(style, QLatin1String("opacity"), restingOpacity(node));
    const bool fading = surface.fade && surface.fade->state() == QAbstractAnimation::Running;

    if (surface.hasStateOpacity && surface.stateOpacity != opacity)
        fadeSurface(node, opacity, ms);
    else if (!fading)
        node.item->setOpacity(opacity);

    surface.hasStateOpacity = true;
    surface.stateOpacity = opacity;
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

    item->setProperty("font", font);
    item->setProperty("color", color);
    item->setProperty("horizontalAlignment", int(align == QLatin1String("center") ? Qt::AlignHCenter
                                                 : align == QLatin1String("right") || align == QLatin1String("end")
                                                     ? Qt::AlignRight
                                                     : Qt::AlignLeft));

    // Last, so the glyph is laid out once, in its final font.
    item->setProperty("text", props.value(QLatin1String("name")).toString());

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

    // Last: every property above lays the text out again, which costs nothing while it is empty.
    item->setProperty("text", props.value(QLatin1String("text")).toString());
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
    if (node.kind == Kind::Island || node.kind == Kind::Pending)
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

    kid.motion = child.motion;

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

        // A node that is not built yet takes any JSON; a built one is kept while its type and kind hold.
        const bool reusable = found != previous.end()
            && (found->second->kind == Kind::Pending
                || (found->second->type == json.value(QLatin1String("type")).toString()
                    && found->second->kind == kindFor(json, found->second->insideScroll)));

        if (reusable) {
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

    if (node.kind == Kind::Pending)
        pending_.removeOne(&node);

    if (node.surface) {
        for (const QPointer<QObject> &handler : { node.surface->hover, node.surface->press, node.surface->tap })
            handlerNodes_.remove(handler.data());
    }

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

        if (!playExit(node, after))
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
    if (node.kind == Kind::Island || node.kind == Kind::Pending)
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
