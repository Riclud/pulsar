#pragma once

#include <QJsonArray>
#include <QJsonObject>
#include <QJsonValue>
#include <QNetworkAccessManager>
#include <QObject>
#include <QTimer>
#include <QUrl>
#include <QVariantList>
#include <QVector>

class EmbeddedBridge;
class QQmlPropertyMap;
class QNetworkReply;

/** Dev-only control channel: long-poll for commands, POST for logs and replies. */
class DevChannel : public QObject {
    Q_OBJECT

public:
    DevChannel(EmbeddedBridge *bridge, QQmlPropertyMap *store, const QUrl &url, QObject *parent = nullptr);

    void start();
    void sendLog(const QString &level, const QString &message, const QString &source);
    void setTree(const QVariantList &tree);
    void requestReload();

private:
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
    QJsonObject storeSnapshot() const;
    QJsonObject grabWindow() const;

    EmbeddedBridge *bridge_;
    QQmlPropertyMap *store_;
    QUrl base_;
    QNetworkAccessManager network_;
    QTimer retry_;
    QVector<QJsonObject> pendingLogs_;
    QJsonArray tree_;
    bool polling_ = false;
    bool connected_ = false;
};
