#pragma once

#include <QEvent>
#include <QJsonArray>
#include <QJsonObject>
#include <QJsonValue>
#include <QNetworkAccessManager>
#include <QObject>
#include <QPointF>
#include <QTimer>
#include <QUrl>
#include <QVariantList>
#include <QVector>

#include <functional>

class QNetworkReply;
class QQuickWindow;

/** What a host lets the dev channel do; any hook may be empty when unsupported. */
struct DevHooks {
    /** Delivers a JSON-RPC notification (such as `__event`) to the JS runtime. */
    std::function<void(const QString &method, const QJsonObject &params)> notifyRuntime;
    /** Raises an app event such as `back-pressed`. */
    std::function<void(const QString &name)> appEvent;
    std::function<void()> reload;
    std::function<void(const QString &text)> showError;
    /** Returns `{ value }` or `{ error, stack }`. */
    std::function<QJsonObject(const QString &code)> evaluate;
    std::function<QJsonObject()> store;
    std::function<QJsonArray()> tree;
};

/** Dev-only control channel: long-poll for commands, POST for logs and replies. */
class DevChannel : public QObject {
    Q_OBJECT

public:
    DevChannel(DevHooks hooks, const QUrl &url, QObject *parent = nullptr);

    void start();
    void sendLog(const QString &level, const QString &message, const QString &source);
    void requestReload();

private:
    QJsonArray currentTree() const;
    void hello();
    void poll();
    void onPoll(QNetworkReply *reply);
    void post(const QString &path, const QJsonObject &body);
    void handle(const QJsonObject &command);
    void reply(const QJsonValue &id, bool ok, const QJsonValue &value);

    QJsonObject resolveNode(const QJsonObject &command, QString *event) const;
    QJsonObject findNode(const QJsonArray &nodes, const QJsonObject &command, QString *event, bool *found) const;
    bool matches(const QJsonObject &node, const QJsonObject &command) const;
    QString defaultEvent(const QJsonObject &node) const;
    void dispatch(const QJsonObject &node, const QString &event, const QJsonValue &value);
    QJsonObject grabWindow() const;

    // Real input, delivered to the window like a mouse or keyboard would.
    QQuickWindow *findView() const;
    bool nodeCenter(const QJsonObject &command, QPointF *point, QJsonObject *node) const;
    QJsonObject findAny(const QJsonArray &nodes, const QJsonObject &command, bool *found) const;
    void handlePointer(const QJsonValue &request, const QJsonObject &command);
    void handleWheel(const QJsonValue &request, const QJsonObject &command);
    void handleKey(const QJsonValue &request, const QJsonObject &command);
    void handleKeys(const QJsonValue &request, const QJsonObject &command);
    void sendMouse(QQuickWindow *window, QEvent::Type type, const QPointF &point, Qt::MouseButton button);

    DevHooks hooks_;
    Qt::MouseButtons buttons_ = Qt::NoButton;
    QUrl base_;
    QNetworkAccessManager network_;
    QTimer retry_;
    QVector<QJsonObject> pendingLogs_;
    bool polling_ = false;
    bool connected_ = false;
};
