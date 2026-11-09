#include "native_renderer.h"

#include <QColor>
#include <QCoreApplication>
#include <QElapsedTimer>
#include <QFont>
#include <QJSValue>
#include <QJsonValue>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickWindow>
#include <QSet>
#include <QSharedPointer>
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
        QStringLiteral("pager"), QStringLiteral("tabs"),   QStringLiteral("navRail"),
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
        QStringLiteral("itemKeys"),
    };

    return props;
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

qreal number(const QJsonObject &props, QLatin1String key, qreal fallback)
{
    const QJsonValue value = props.value(key);

    return value.isDouble() ? value.toDouble() : fallback;
}

NativeStack::Edges paddingEdges(const QJsonObject &props)
{
    const qreal all = number(props, QLatin1String("padding"), 0);
    const qreal x = number(props, QLatin1String("paddingX"), all);
    const qreal y = number(props, QLatin1String("paddingY"), all);

    return {
        number(props, QLatin1String("paddingTop"), y),
        number(props, QLatin1String("paddingRight"), x),
        number(props, QLatin1String("paddingBottom"), y),
        number(props, QLatin1String("paddingLeft"), x),
    };
}

bool startsScrollWithField(const QJsonObject &json)
{
    const QJsonObject content = json.value(QLatin1String("children")).toArray().at(0).toObject();
    const QJsonObject first = content.value(QLatin1String("children")).toArray().at(0).toObject();
    const QString type = first.value(QLatin1String("type")).toString();

    return type == QLatin1String("textInput") || type == QLatin1String("textArea");
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

} // namespace

NativeStack::NativeStack(QQuickItem *parent)
    : QQuickItem(parent)
{
}

void NativeStack::hintsChanged()
{
    polish();
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
    for (const Kid &kid : std::as_const(ordered_)) {
        const Measured size = measure(kid);
        const Absolute &at = kid.absolute;

        if (at.enabled) {
            const qreal w = at.left.set && at.right.set ? width() - at.left.value - at.right.value : size.preferredWidth;
            const qreal h = at.top.set && at.bottom.set ? height() - at.top.value - at.bottom.value : size.preferredHeight;
            const qreal x = at.left.set ? at.left.value : at.right.set ? width() - at.right.value - w : 0;
            const qreal y = at.top.set ? at.top.value : at.bottom.set ? height() - at.bottom.value - h : 0;

            kid.item->setPosition({ x, y });
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
}

NativeStack::Measured NativeStack::measure(const Kid &kid) const
{
    Measured out;

    out.kid = &kid;
    out.fillWidth = kid.fillWidth;
    out.fillHeight = kid.fillHeight;
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
    }

    if (out.preferredWidth < 0)
        out.preferredWidth = kid.item->implicitWidth();

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
    const qreal gaps = gap_ * qMax<qsizetype>(0, shown.size() - 1);
    const qreal mainSpace = (row ? width() : height()) - mainEdges - gaps;
    const qreal crossSpace = qMax(0.0, (row ? height() : width()) - crossEdges);

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

    for (const Measured &kid : std::as_const(shown))
        cursor += place(kid, perWeight, crossSpace, cursor) + gap_;

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

    kid.kid->item->setPosition(row ? QPointF(cursor, crossAt) : QPointF(crossAt, cursor));
    kid.kid->item->setSize(row ? QSizeF(main, cross) : QSizeF(cross, main));

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

    QQmlEngine *engine = qmlEngine(root);

    rectangle_ = std::make_unique<QQmlComponent>(engine);
    rectangle_->setData("import QtQuick; Rectangle {}", QUrl());
    text_ = std::make_unique<QQmlComponent>(engine);
    text_->setData("import QtQuick; Text {}", QUrl());

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
    theme_.fontFamily = root_->property("fontFamily").toString();
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

void NativeRenderer::replaceNode(Node &node, const QJsonObject &json)
{
    Node *parent = node.parent;

    const auto slot = std::find_if(parent->children.begin(), parent->children.end(),
                                   [&](const std::unique_ptr<Node> &child) { return child.get() == &node; });

    QQuickItem *after = slot == parent->children.begin() ? nullptr : (*std::prev(slot))->item;

    dirtyStacks_.remove(&node);
    discard(node, after);

    *slot = create(json, parent);

    sync(**slot, json, true);
    refreshKids(*parent);
}

NativeRenderer::Kind NativeRenderer::kindFor(const QJsonObject &json, bool insideScroll) const
{
    const QString type = json.value(QLatin1String("type")).toString();
    const QJsonObject props = json.value(QLatin1String("props")).toObject();
    const QJsonArray events = json.value(QLatin1String("events")).toArray();

    if (type == QLatin1String("card"))
        return Kind::Shell;

    if (type == QLatin1String("box")) {
        const bool plainEvents = std::all_of(events.begin(), events.end(), [](const QJsonValue &event) {
            return event.toString() == QLatin1String("click") || event.toString() == QLatin1String("longPress");
        });

        if (!plainEvents || !propsAllowed(props, { &commonProps(), &paddingProps(), &boxProps() }))
            return Kind::Shell;

        return events.isEmpty() ? Kind::Box : Kind::ClickableBox;
    }

    if (!events.isEmpty())
        return Kind::Island;

    if (type == QLatin1String("text"))
        return propsAllowed(props, { &commonProps(), &textProps() }) ? Kind::Text : Kind::Island;

    if (type == QLatin1String("spacer"))
        return propsAllowed(props, { &commonProps(), &spacerProps() }) ? Kind::Spacer : Kind::Island;

    if (type == QLatin1String("stack"))
        return propsAllowed(props, { &commonProps() }) ? Kind::Stack : Kind::Island;

    const bool flowingList = type == QLatin1String("list") && insideScroll;

    if (type == QLatin1String("column") || type == QLatin1String("row") || flowingList)
        return propsAllowed(props, { &commonProps(), &paddingProps(), &stackProps() }) ? Kind::Stack : Kind::Island;

    const bool viewport = type == QLatin1String("scroll") || type == QLatin1String("list");

    if (!viewport || insideScroll || startsScrollWithField(json))
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
        mountQml(*node, json, parentItem);

        return node;
    }

    if (node->kind == Kind::Shell) {
        QJsonObject own = json;

        own.remove(QLatin1String("children"));

        mountQml(*node, own, parentItem);
        bindShell(*node);

        return node;
    }

    if (node->kind == Kind::Spacer) {
        node->item = new QQuickItem();
    } else if (node->kind == Kind::Stack) {
        node->stack = new NativeStack();
        node->item = node->stack;
    } else if (node->kind == Kind::Text) {
        node->item = instantiate(text_.get());
    } else if (node->kind == Kind::Box) {
        node->item = instantiate(rectangle_.get());
    } else if (node->kind == Kind::ClickableBox) {
        node->item = instantiate(clickableBox_);
    } else {
        node->item = instantiate(flickable_);
    }

    adopt(node->item, parentItem);

    if (node->kind == Kind::Box || node->kind == Kind::ClickableBox)
        bindBox(*node);

    if (node->kind == Kind::Scroll)
        bindScroll(*node);

    return node;
}

void NativeRenderer::mountQml(Node &node, const QJsonObject &own, QQuickItem *parentItem)
{
    QVariant mounted;

    QMetaObject::invokeMethod(root_, "nativeMount", Q_RETURN_ARG(QVariant, mounted),
                              Q_ARG(QVariant, own.toVariantMap()), Q_ARG(QVariant, itemArg(parentItem)));

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

    if (node.kind == Kind::ClickableBox && (fresh || identityChanged)) {
        const QVariantMap own = {
            { QStringLiteral("path"), node.path },
            { QStringLiteral("type"), node.type },
            { QStringLiteral("id"), json.value(QLatin1String("id")).toVariant() },
            { QStringLiteral("events"), json.value(QLatin1String("events")).toVariant() },
        };

        node.item->setProperty("pulsarMeta", QVariantMap{ { QStringLiteral("node"), own } });
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
        applyText(node);
        return;
    }

    if (node.kind == Kind::Scroll) {
        applyScroll(node);
        return;
    }

    if (node.kind == Kind::Box || node.kind == Kind::ClickableBox) {
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

    item->setProperty("color", resolveColor(props.value(QLatin1String("color")), QStringLiteral("transparent")));
    item->setProperty("radius", number(props, QLatin1String("radius"), 0));

    if (QObject *border = item->property("border").value<QObject *>()) {
        border->setProperty("width", number(props, QLatin1String("borderWidth"), 0));
        border->setProperty("color", resolveColor(props.value(QLatin1String("borderColor")), theme_.border));
    }

    node.stack->configure(NativeStack::Mode::Column, 0, paddingEdges(props));
}

void NativeRenderer::applyScroll(Node &node)
{
    const bool list = node.type == QLatin1String("list");
    const qreal gap = list ? number(node.props, QLatin1String("spacing"), 0)
                           : number(node.props, QLatin1String("gap"), theme_.spacing);

    node.stack->configure(NativeStack::Mode::Column, gap, paddingEdges(node.props));

    // Only the node's own fields: the scroll's children are not QML's to walk.
    const QVariantMap own = {
        { QStringLiteral("type"), node.type },
        { QStringLiteral("path"), node.path },
        { QStringLiteral("props"), node.props.toVariantMap() },
    };

    QMetaObject::invokeMethod(root_, "nativeScroll", Q_ARG(QVariant, itemArg(node.item)), Q_ARG(QVariant, own));
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

    const bool wraps = props.value(QLatin1String("wrap")).toBool(false);

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

        return kid;
    }

    const bool flowsInScroll = child.kind == Kind::Stack && child.type == QLatin1String("list");

    kid.fillWidth = typesFillingWidth().contains(child.type);
    kid.fillHeight = typesFillingHeight().contains(child.type) && !flowsInScroll;

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

    if (alignItems == QLatin1String("stretch")) {
        kid.fillWidth = kid.fillWidth || !row;
        kid.fillHeight = kid.fillHeight || row;
    }

    const qreal fallbackSize = child.kind == Kind::Spacer ? number(props, QLatin1String("size"), 0) : -1;

    kid.preferredWidth = number(props, QLatin1String("width"), fallbackSize);
    kid.preferredHeight = number(props, QLatin1String("height"), fallbackSize);
    kid.minWidth = number(props, QLatin1String("minWidth"), 0);
    kid.minHeight = number(props, QLatin1String("minHeight"), 0);
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
        } else {
            child = create(json, &node);
        }

        sync(*child, json, true);
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

static void startStallTrace()
{
    static bool started = false;

    if (started)
        return;

    started = true;

    auto *timer = new QTimer(qApp);
    auto *clock = new QElapsedTimer();

    clock->start();
    timer->setInterval(1);

    QObject::connect(timer, &QTimer::timeout, timer, [clock]() {
        const qint64 gap = clock->restart();

        if (gap >= 8)
            qInfo().noquote() << "[stall]" << gap << "ms";
    });

    timer->start();
}

void traceNextFrame(QObject *window, const QString &label)
{
    startStallTrace();

    auto *quick = qobject_cast<QQuickWindow *>(window);

    if (!quick)
        return;

    auto timer = QSharedPointer<QElapsedTimer>::create();
    auto connection = QSharedPointer<QMetaObject::Connection>::create();

    timer->start();

    *connection = QObject::connect(quick, &QQuickWindow::afterRendering, quick, [timer, connection, label]() {
        QObject::disconnect(*connection);

        qInfo().noquote() << "[frame]" << label << timer->elapsed() << "ms";
    }, Qt::DirectConnection);
}

} // namespace pulsar
