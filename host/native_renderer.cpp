#include "native_renderer.h"

#include <QElapsedTimer>
#include <QGuiApplication>
#include <QJsonValue>
#include <QQuickWindow>
#include <QSharedPointer>
#include <QTimer>
#include <QWindow>

#include <unordered_map>
#include <utility>

namespace pulsar {

namespace {

QQuickWindow *firstQuickWindow()
{
    for (QWindow *window : QGuiApplication::topLevelWindows()) {
        if (auto *quick = qobject_cast<QQuickWindow *>(window))
            return quick;
    }

    return nullptr;
}

bool isStack(const QString &type)
{
    return type == QLatin1String("column") || type == QLatin1String("row");
}

bool isScroll(const QString &type)
{
    return type == QLatin1String("scroll") || type == QLatin1String("list");
}

NativeStack::Kid kidFor(QQuickItem *item, const QString &type, bool flowsInScroll, const QJsonObject &props)
{
    NativeStack::Kid kid;

    kid.item = item;
    kid.fillWidth = isScroll(type);
    kid.fillHeight = isScroll(type) && !flowsInScroll;

    if (props.contains(QLatin1String("fill"))) {
        kid.fillWidth = props.value(QLatin1String("fill")).toBool();
        kid.fillHeight = kid.fillWidth;
    }

    if (props.contains(QLatin1String("fillWidth")))
        kid.fillWidth = props.value(QLatin1String("fillWidth")).toBool();

    if (props.contains(QLatin1String("fillHeight")))
        kid.fillHeight = props.value(QLatin1String("fillHeight")).toBool();

    return kid;
}

} // namespace

NativeStack::NativeStack(QQuickItem *parent)
    : QQuickItem(parent)
{
}

void NativeStack::configure(bool horizontal, qreal gap, qreal padding)
{
    if (horizontal_ == horizontal && gap_ == gap && padding_ == padding)
        return;

    horizontal_ = horizontal;
    gap_ = gap;
    padding_ = padding;

    polish();
}

void NativeStack::setKids(const QList<Kid> &kids)
{
    bool same = kids.size() == kids_.size();

    for (qsizetype index = 0; same && index < kids.size(); index++) {
        const Kid &next = kids.at(index);
        const Kid &current = kids_.at(index);

        same = next.item == current.item && next.fillWidth == current.fillWidth && next.fillHeight == current.fillHeight;
    }

    if (same)
        return;

    kids_ = kids;

    for (const Kid &kid : kids_) {
        connect(kid.item, &QQuickItem::implicitWidthChanged, this, &QQuickItem::polish, Qt::UniqueConnection);
        connect(kid.item, &QQuickItem::implicitHeightChanged, this, &QQuickItem::polish, Qt::UniqueConnection);
    }

    polish();
}

void NativeStack::geometryChange(const QRectF &next, const QRectF &previous)
{
    QQuickItem::geometryChange(next, previous);

    if (next.size() != previous.size())
        polish();
}

void NativeStack::updatePolish()
{
    const qreal gaps = gap_ * qMax<qsizetype>(0, kids_.size() - 1) + 2 * padding_;
    const qreal mainSize = (horizontal_ ? width() : height()) - gaps;
    const qreal crossSize = (horizontal_ ? height() : width()) - 2 * padding_;

    qreal used = 0;
    qreal widest = 0;
    int fillers = 0;

    for (const Kid &kid : std::as_const(kids_)) {
        const bool fillsMain = horizontal_ ? kid.fillWidth : kid.fillHeight;

        widest = qMax(widest, horizontal_ ? kid.item->implicitHeight() : kid.item->implicitWidth());

        if (fillsMain)
            fillers++;
        else
            used += horizontal_ ? kid.item->implicitWidth() : kid.item->implicitHeight();
    }

    const qreal share = fillers > 0 ? qMax(0.0, mainSize - used) / fillers : 0;

    qreal cursor = padding_;

    for (const Kid &kid : std::as_const(kids_)) {
        const bool fillsMain = horizontal_ ? kid.fillWidth : kid.fillHeight;
        const bool fillsCross = horizontal_ ? kid.fillHeight : kid.fillWidth;
        const qreal implicitMain = horizontal_ ? kid.item->implicitWidth() : kid.item->implicitHeight();
        const qreal implicitCross = horizontal_ ? kid.item->implicitHeight() : kid.item->implicitWidth();
        const qreal main = fillsMain ? share : implicitMain;
        const qreal cross = fillsCross ? qMax(0.0, crossSize) : implicitCross;

        // A row centres its children across, matching RowLayout; a column keeps them at the start.
        const qreal crossAt = horizontal_ ? padding_ + (crossSize - cross) / 2 : padding_;

        kid.item->setPosition(horizontal_ ? QPointF(cursor, crossAt) : QPointF(crossAt, cursor));
        kid.item->setSize(horizontal_ ? QSizeF(main, cross) : QSizeF(cross, main));

        cursor += main + gap_;
    }

    const qreal implicitMain = used + gaps;
    const qreal implicitCross = widest + 2 * padding_;

    setImplicitSize(horizontal_ ? implicitMain : implicitCross, horizontal_ ? implicitCross : implicitMain);
}

NativeRenderer::NativeRenderer(QQmlEngine *engine, QObject *parent)
    : QObject(parent)
    , engine_(engine)
    , rectangle_(engine)
    , text_(engine)
    , flickable_(engine)
{
    rectangle_.setData("import QtQuick; Rectangle {}", QUrl());
    text_.setData("import QtQuick; Text { color: \"#e6e6e6\" }", QUrl());
    flickable_.setData("import QtQuick; Flickable { clip: true }", QUrl());
}

NativeRenderer::~NativeRenderer() = default;

bool NativeRenderer::handle(const QJsonObject &message)
{
    const QString method = message.value(QLatin1String("method")).toString();

    if (method != QLatin1String("__ui") && method != QLatin1String("__ui-patch"))
        return false;

    const QJsonObject params = message.value(QLatin1String("params")).toObject();

    if (method == QLatin1String("__ui")) {
        applyTree(params.value(QLatin1String("tree")).toArray());

        return true;
    }

    applyPatches(params.value(QLatin1String("patches")).toArray());

    return true;
}

bool NativeRenderer::attachRoot()
{
    if (root_)
        return true;

    QQuickWindow *window = firstQuickWindow();

    if (!window)
        return false;

    auto root = std::make_unique<Node>();
    auto *stack = new NativeStack(window->contentItem());
    QQuickItem *content = window->contentItem();

    stack->setZ(1000);
    stack->setSize(content->size());

    connect(content, &QQuickItem::widthChanged, stack, [stack, content]() { stack->setWidth(content->width()); });
    connect(content, &QQuickItem::heightChanged, stack, [stack, content]() { stack->setHeight(content->height()); });

    root->type = QStringLiteral("column");
    root->item = stack;
    root->stack = stack;
    root_ = std::move(root);

    return true;
}

void NativeRenderer::applyTree(const QJsonArray &tree)
{
    if (!attachRoot()) {
        pendingTree_ = tree;
        hasPendingTree_ = true;

        // The first tree can arrive before QML has created the window.
        QTimer::singleShot(16, this, [this]() {
            if (hasPendingTree_)
                applyTree(pendingTree_);
        });

        return;
    }

    hasPendingTree_ = false;
    pendingTree_ = {};

    QElapsedTimer timer;

    timer.start();
    syncChildren(*root_, tree);

    if (qEnvironmentVariableIsSet("PULSAR_DEBUG"))
        qInfo().noquote() << "[native] tree nodes" << index_.size() << timer.elapsed() << "ms";
}

void NativeRenderer::applyPatches(const QJsonArray &patches)
{
    QElapsedTimer timer;

    timer.start();

    for (const QJsonValue &value : patches) {
        const QJsonObject patch = value.toObject();
        const QString path = patch.value(QLatin1String("path")).toString();
        Node *node = index_.value(path);

        if (!node) {
            qWarning().noquote() << "[native] patch for unknown path" << path;
            continue;
        }

        sync(*node, patch.value(QLatin1String("node")).toObject(), !patch.value(QLatin1String("shallow")).toBool());
    }

    if (qEnvironmentVariableIsSet("PULSAR_DEBUG"))
        qInfo().noquote() << "[native] patches" << patches.size() << timer.elapsed() << "ms";
}

QQuickItem *NativeRenderer::instantiate(QQmlComponent &component)
{
    if (component.isError())
        qWarning().noquote() << "[native]" << component.errorString();

    return qobject_cast<QQuickItem *>(component.create());
}

QQuickItem *NativeRenderer::childParent(const Node &node) const
{
    if (node.stack || !isScroll(node.type))
        return node.item;

    return qobject_cast<QQuickItem *>(node.item->property("contentItem").value<QObject *>());
}

std::unique_ptr<NativeRenderer::Node> NativeRenderer::create(const QJsonObject &json, bool insideScroll)
{
    auto node = std::make_unique<Node>();

    node->path = json.value(QLatin1String("path")).toString();
    node->type = json.value(QLatin1String("type")).toString();

    node->insideScroll = insideScroll;

    // A list nested in a scroll is not a second viewport: it flows in the outer content.
    if (isStack(node->type) || (node->type == QLatin1String("list") && insideScroll)) {
        node->stack = new NativeStack();
        node->item = node->stack;
    } else if (isScroll(node->type)) {
        node->item = instantiate(flickable_);
    } else if (node->type == QLatin1String("box")) {
        node->item = instantiate(rectangle_);
    } else if (node->type == QLatin1String("text")) {
        node->item = instantiate(text_);
    } else {
        qWarning().noquote() << "[native] unsupported node type" << node->type;
        node->item = new QQuickItem();
    }

    QQmlEngine::setObjectOwnership(node->item, QQmlEngine::CppOwnership);
    index_.insert(node->path, node.get());

    return node;
}

void NativeRenderer::sync(Node &node, const QJsonObject &json, bool withChildren)
{
    const QJsonObject props = json.value(QLatin1String("props")).toObject();

    if (props != node.props || node.props.isEmpty())
        applyProps(node, props);

    if (!withChildren)
        return;

    syncChildren(node, json.value(QLatin1String("children")).toArray());
}

void NativeRenderer::applyProps(Node &node, const QJsonObject &props)
{
    QQuickItem *item = node.item;

    node.props = props;

    if (props.contains(QLatin1String("width")))
        item->setImplicitWidth(props.value(QLatin1String("width")).toDouble());

    if (props.contains(QLatin1String("height")))
        item->setImplicitHeight(props.value(QLatin1String("height")).toDouble());

    if (node.stack) {
        node.stack->configure(node.type == QLatin1String("row"), props.value(QLatin1String("gap")).toDouble(),
                              props.value(QLatin1String("padding")).toDouble());
        return;
    }

    if (node.type == QLatin1String("box")) {
        item->setProperty("color", props.value(QLatin1String("color")).toString(QStringLiteral("transparent")));
        item->setProperty("radius", props.value(QLatin1String("radius")).toDouble());
        return;
    }

    if (node.type != QLatin1String("text"))
        return;

    item->setProperty("text", props.value(QLatin1String("text")).toString());
}

void NativeRenderer::forget(Node &node)
{
    index_.remove(node.path);

    for (const std::unique_ptr<Node> &child : node.children)
        forget(*child);
}

void NativeRenderer::syncChildren(Node &node, const QJsonArray &children)
{
    std::unordered_map<QString, std::unique_ptr<Node>> previous;

    previous.reserve(node.children.size());

    for (std::unique_ptr<Node> &child : node.children) {
        const QString path = child->path;

        previous.emplace(path, std::move(child));
    }

    node.children.clear();
    node.children.reserve(size_t(children.size()));

    QList<NativeStack::Kid> kids;

    kids.reserve(children.size());

    QQuickItem *parent = childParent(node);

    for (const QJsonValue &value : children) {
        const QJsonObject json = value.toObject();
        const QString path = json.value(QLatin1String("path")).toString();
        const QString type = json.value(QLatin1String("type")).toString();

        std::unique_ptr<Node> child;

        auto found = previous.find(path);

        if (found != previous.end() && found->second->type == type) {
            child = std::move(found->second);
            previous.erase(found);
        } else {
            child = create(json, node.insideScroll || (isScroll(node.type) && !node.stack));
            child->item->setParentItem(parent);
        }

        sync(*child, json, true);
        kids.append(kidFor(child->item, child->type, child->stack != nullptr, child->props));
        node.children.push_back(std::move(child));
    }

    for (auto it = previous.begin(); it != previous.end(); ++it) {
        if (!it->second)
            continue;

        forget(*it->second);
        delete it->second->item;
    }

    if (node.stack) {
        node.stack->setKids(kids);
        return;
    }

    if (!isScroll(node.type) || node.children.empty() || node.contentBound)
        return;

    QQuickItem *flickable = node.item;
    QQuickItem *content = node.children.front()->item;

    const auto followWidth = [flickable, content]() {
        content->setWidth(flickable->width());
    };

    const auto followHeight = [flickable, content]() {
        content->setHeight(content->implicitHeight());
        flickable->setProperty("contentHeight", content->implicitHeight());
    };

    connect(flickable, &QQuickItem::widthChanged, content, followWidth);
    connect(content, &QQuickItem::implicitHeightChanged, flickable, followHeight);

    followWidth();
    followHeight();

    node.contentBound = true;
}

void traceNextFrame(const QString &label)
{
    QQuickWindow *window = firstQuickWindow();

    if (!window)
        return;

    auto timer = QSharedPointer<QElapsedTimer>::create();
    auto connection = QSharedPointer<QMetaObject::Connection>::create();

    timer->start();

    *connection = QObject::connect(window, &QQuickWindow::afterRendering, window, [timer, connection, label]() {
        QObject::disconnect(*connection);

        qInfo().noquote() << "[frame]" << label << timer->elapsed() << "ms";
    }, Qt::DirectConnection);
}

} // namespace pulsar
