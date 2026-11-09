#pragma once

#include <QHash>
#include <QJsonArray>
#include <QJsonObject>
#include <QList>
#include <QObject>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QString>

#include <memory>
#include <vector>

class QQuickWindow;

namespace pulsar {

/** Row or column whose children are placed in list order, with no QtQuick.Layouts involved. */
class NativeStack : public QQuickItem {
    Q_OBJECT

public:
    struct Kid {
        QQuickItem *item = nullptr;
        bool fillWidth = false;
        bool fillHeight = false;
    };

    explicit NativeStack(QQuickItem *parent = nullptr);

    void configure(bool horizontal, qreal gap, qreal padding);
    void setKids(const QList<Kid> &kids);

protected:
    void updatePolish() override;
    void geometryChange(const QRectF &next, const QRectF &previous) override;

private:
    QList<Kid> kids_;
    bool horizontal_ = false;
    qreal gap_ = 0;
    qreal padding_ = 0;
};

class NativeRenderer : public QObject {
    Q_OBJECT

public:
    explicit NativeRenderer(QQmlEngine *engine, QObject *parent = nullptr);
    ~NativeRenderer() override;

    /** Takes __ui and __ui-patch messages; returns false for anything else. */
    bool handle(const QJsonObject &message);

private:
    struct Node {
        QString path;
        QString type;
        QJsonObject props;
        QQuickItem *item = nullptr;
        NativeStack *stack = nullptr;
        bool insideScroll = false;
        bool contentBound = false;
        std::vector<std::unique_ptr<Node>> children;
    };

    std::unique_ptr<Node> create(const QJsonObject &json, bool insideScroll);
    QQuickItem *instantiate(QQmlComponent &component);
    bool attachRoot();
    void applyTree(const QJsonArray &tree);
    void applyPatches(const QJsonArray &patches);
    void sync(Node &node, const QJsonObject &json, bool withChildren);
    void syncChildren(Node &node, const QJsonArray &children);
    void applyProps(Node &node, const QJsonObject &props);
    void forget(Node &node);
    QQuickItem *childParent(const Node &node) const;

    QQmlEngine *engine_;
    QQmlComponent rectangle_;
    QQmlComponent text_;
    QQmlComponent flickable_;
    std::unique_ptr<Node> root_;
    QHash<QString, Node *> index_;
    QJsonArray pendingTree_;
    bool hasPendingTree_ = false;
};

/** Logs the time from now until the next frame is rendered. */
void traceNextFrame(const QString &label);

} // namespace pulsar
