#pragma once

#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QList>
#include <QObject>
#include <QPointer>
#include <QQmlComponent>
#include <QQmlProperty>
#include <QQuickItem>
#include <QSet>
#include <QString>
#include <QVariantMap>

#include <limits>
#include <memory>
#include <vector>

namespace pulsar {

/** Places children in list order; replaces QtQuick.Layouts for the nodes C++ owns. */
class NativeStack : public QQuickItem {
    Q_OBJECT

public:
    enum class Mode { Column, Row, Overlap, Layers };
    enum class Align { Default, Start, Center, End };

    struct Edges {
        qreal top = 0;
        qreal right = 0;
        qreal bottom = 0;
        qreal left = 0;

        bool operator==(const Edges &) const = default;
    };

    /** Live view of the Layout.* values that QML writes on a child it manages. */
    struct QmlHints {
        QQmlProperty fillWidth;
        QQmlProperty fillHeight;
        QQmlProperty preferredWidth;
        QQmlProperty preferredHeight;
        QQmlProperty minimumWidth;
        QQmlProperty minimumHeight;
        QQmlProperty maximumWidth;
        QQmlProperty maximumHeight;

        /** The child's enter/exit animation, once it has one; null for children without motion. */
        QPointer<QObject> motion;
    };

    struct Inset {
        bool set = false;
        qreal value = 0;
    };

    struct Absolute {
        bool enabled = false;
        Inset top;
        Inset right;
        Inset bottom;
        Inset left;
    };

    struct Kid {
        QQuickItem *item = nullptr;
        bool fillsLayer = true;
        Absolute absolute;
        bool fillWidth = false;
        bool fillHeight = false;
        /** Text that wraps or elides, or a container of it: it narrows to the space it is given. */
        bool shrinks = false;
        qreal flex = 0;
        qreal preferredWidth = -1;
        qreal preferredHeight = -1;
        qreal minWidth = 0;
        qreal minHeight = 0;
        qreal maxWidth = std::numeric_limits<qreal>::infinity();
        qreal maxHeight = std::numeric_limits<qreal>::infinity();
        Align align = Align::Default;
        std::shared_ptr<QmlHints> qml;
    };

    explicit NativeStack(QQuickItem *parent = nullptr);

    void configure(Mode mode, qreal gap, const Edges &edges);
    void setKids(const QList<Kid> &kids);

    /** Keeps a child in its slot while its exit animation plays. */
    void keepLeaving(const Kid &kid, QQuickItem *after);

protected:
    void updatePolish() override;
    void geometryChange(const QRectF &next, const QRectF &previous) override;

private slots:
    void hintsChanged();
    void windowChanged(QQuickWindow *next);

private:
    struct Leaving {
        Kid kid;
        QPointer<QQuickItem> after;
    };

    struct Measured {
        const Kid *kid = nullptr;
        bool fillWidth = false;
        bool fillHeight = false;
        bool shrinks = false;
        bool heightIsContent = false;
        qreal preferredWidth = 0;
        qreal preferredHeight = 0;
        qreal minWidth = 0;
        qreal minHeight = 0;
        qreal maxWidth = 0;
        qreal maxHeight = 0;
        qreal share = 1;
        qreal gapBefore = 0;
    };

    Measured measure(const Kid &kid) const;
    static void narrowTo(Measured &kid, qreal width);
    void shrinkInColumn(QList<Measured> &shown, qreal crossSpace) const;
    void shrinkAlongRow(QList<Measured> &shown, qreal mainSpace) const;
    void watch(const Kid &kid);
    void placeOverlapping();
    void placeLayers();
    qreal place(const Measured &kid, qreal perWeight, qreal crossSpace, qreal cursor);
    void mergeLeaving();
    bool mirrored() const;
    QPointF mirroredAt(qreal x, qreal y, qreal itemWidth) const;

    QList<Kid> kids_;
    QList<Kid> ordered_;
    QList<Leaving> leaving_;
    Mode mode_ = Mode::Column;
    qreal gap_ = 0;
    Edges edges_;
};

/** Owns the UI of one window: compares incoming trees and updates only what changed. */
class NativeRenderer : public QObject {
    Q_OBJECT

public:
    explicit NativeRenderer(QObject *parent = nullptr);
    ~NativeRenderer() override;

    /** A root without the renderer hooks (a hand-written QML window) is ignored. */
    void attach(QObject *root);
    void detach();
    void clear();

    void setTree(const QJsonArray &tree);
    void applyPatches(const QJsonArray &patches);

    /** A command from JS for a node, such as scrollTo on a scroll with a controller; true when a node took it. */
    bool command(const QJsonObject &params);

    QJsonArray snapshot() const;
    QObject *window() const { return root_; }

    Q_INVOKABLE QObject *itemAt(const QString &path) const;
    Q_INVOKABLE void commit();

    /** A pointer handler of a state box changed: hover or press. */
    Q_INVOKABLE void stateInput(const QString &path);

    /** A right click or long press on a node that listens for contextMenu; x and y are in window space. */
    Q_INVOKABLE void contextRequested(const QString &path, qreal x, qreal y);
    Q_INVOKABLE void filesDropped(const QString &path, const QStringList &urls, qreal x, qreal y);

private slots:
    void refreshTheme();
    void scheduleVisibilitySlot();
    void controlClicked();
    void controlToggled();
    void fieldTextChanged();
    void fieldFocusChanged();
    void fieldAccepted();
    void fieldCursorMoved();
    void fieldTapped();

private:
    enum class Kind { Island, Shell, Stack, Scroll, Box, ClickableBox, StateBox, Text, Spacer, Control };

    struct Node {
        QString path;
        QString type;
        Kind kind = Kind::Island;
        QJsonObject json;
        QJsonObject props;
        QQuickItem *item = nullptr;
        NativeStack *stack = nullptr;
        Node *parent = nullptr;
        bool insideScroll = false;
        bool styled = false;
        // The scroll (or the window) a node's visibility is measured in; null while it is not watched.
        QQuickItem *viewport = nullptr;
        QPointer<QQuickItem> context;
        int visibleState = -1;
        QString lastState;
        std::shared_ptr<NativeStack::QmlHints> hints;
        // What a text field remembers between updates.
        struct Field {
            // Texts the user typed that the app has not echoed back yet.
            QStringList typed;
            QString lastValue;
            bool hasLastValue = false;
            bool syncing = false;
            bool autoFocused = false;
            bool focusRequested = false;
        } field;
        std::vector<std::unique_ptr<Node>> children;
    };

    struct Theme {
        QVariantMap colors;
        QVariant text;
        QVariant border;
        QVariant surface;
        QVariant primary;
        QVariant onPrimary;
        QVariant surfaceVariant;
        QVariant textSecondary;
        int radius = 0;
        QString fontFamily;
        QString iconFamily;
        qreal fontScale = 1;
        int spacing = 8;
    };

    struct Stats {
        int created = 0;
        int updated = 0;
        int removed = 0;
        int reordered = 0;
    };

    void loadTheme();
    void createRoot();
    void renderTree(const QJsonArray &tree);
    void applyPatchList(const QJsonArray &patches);
    void applyPatch(const QString &path, const QJsonObject &json, bool shallow);
    bool patchIsland(const QString &path, const QJsonObject &json, bool shallow);
    void applyChildOp(const QJsonObject &patch);
    bool editNativeChildren(Node &parent, const QString &op, const QString &path, qsizetype index, const QJsonObject &json);
    void editChildrenByJson(const QString &parentPath, const QString &op, const QString &path, qsizetype index, const QJsonObject &json);
    qreal scrollTopInset(const Node &node) const;
    void configureScroll(Node &node);
    void replaceNode(Node &node, const QJsonObject &json);

    std::unique_ptr<Node> create(const QJsonObject &json, Node *parent);
    std::unique_ptr<Node> createSynced(const QJsonObject &json, Node *parent);
    void settle(Node &node);
    QQuickItem *instantiate(QQmlComponent *component);
    void adopt(QQuickItem *item, QQuickItem *parent);

    void sync(Node &node, const QJsonObject &json, bool withChildren);
    void syncIsland(Node &node, const QJsonObject &json, bool shallow);
    void updateIsland(Node &node, bool shallow);
    void syncChildren(Node &node, const QJsonArray &children);
    void applyProps(Node &node);
    void applyCommon(Node &node);
    void applyBox(Node &node);
    void applyText(Node &node);
    void applyIcon(Node &node);
    void applyControl(Node &node);
    void bindControl(Node &node);
    void applyField(Node &node);
    void syncFieldText(Node &node);
    void emitControl(const Node &node, const QString &event, const QVariant &value = QVariant());
    Node *controlNode(QObject *item) const;
    void applyScroll(Node &node);
    bool narrowsToFit(const Node &node) const;
    void refreshKids(Node &node);
    void bindScroll(Node &node);
    void bindBox(Node &node);
    void refreshState(Node &node);
    void applyPointer(Node &node);
    void refreshWatch(Node &node);
    void refreshContext(Node &node);
    void unwatch(Node &node);
    void hookViewport(QQuickItem *viewport);
    void scheduleVisibility(QQuickItem *viewport);
    void checkVisibility(QQuickItem *viewport);

    NativeStack::Kid kidFor(const Node &parent, Node &child) const;
    std::shared_ptr<NativeStack::QmlHints> makeHints(QQuickItem *item) const;
    Kind kindFor(const QJsonObject &json, bool insideScroll) const;
    QJsonObject snapshotNode(const Node &node) const;
    void forget(Node &node);
    void discard(Node &node, QQuickItem *after);
    void reapplyAll(Node &node);
    void mountQml(Node &node, const QJsonObject &own, QQuickItem *parentItem, bool holdEnter);
    void bindShell(Node &node);
    bool hasQmlDescendant(const Node &node) const;
    QString resolveColor(const QJsonValue &value, const QVariant &fallback) const;

    QPointer<QObject> root_;
    QQuickItem *host_ = nullptr;
    std::unique_ptr<QQmlComponent> rectangle_;
    std::unique_ptr<QQmlComponent> text_;
    std::unique_ptr<QQmlComponent> contextTap_;
    std::unique_ptr<QQmlComponent> fieldTap_;
    QQmlComponent *flickable_ = nullptr;
    QQmlComponent *clickableBox_ = nullptr;
    QQmlComponent *stateBox_ = nullptr;
    QHash<QString, QQmlComponent *> controls_;
    std::unique_ptr<Node> tree_;
    QHash<QString, Node *> index_;
    QSet<Node *> dirtyStacks_;
    QHash<QQuickItem *, QList<Node *>> watched_;
    QSet<QQuickItem *> hooked_;
    QSet<QQuickItem *> pendingVisibility_;
    Theme theme_;
    Stats stats_;
    QJsonArray pendingTree_;
    QList<QJsonArray> queuedPatches_;
    QString treeShape_;
    bool hasPendingTree_ = false;
    int creationDepth_ = 0;
    bool waitingForTransition_ = false;
};

} // namespace pulsar
