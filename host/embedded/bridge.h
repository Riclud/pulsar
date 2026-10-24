#pragma once

#include <QHash>
#include <QJSEngine>
#include <QJSValue>
#include <QJsonArray>
#include <QJsonObject>
#include <QObject>
#include <QString>
#include <QVariantList>
#include <QVariantMap>

class QQmlPropertyMap;

namespace pulsar {
class QuickJsRuntime;
}

/** QML-facing bridge backed by the in-process QuickJS runtime. */
class EmbeddedBridge : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString colorScheme READ colorScheme NOTIFY colorSchemeChanged)

public:
    EmbeddedBridge(pulsar::QuickJsRuntime *runtime, QJSEngine *engine, QQmlPropertyMap *store,
                   QObject *parent = nullptr);

    Q_INVOKABLE qint64 invoke(const QString &method, const QJSValue &params);
    Q_INVOKABLE qint64 emit(const QString &method, const QJSValue &params);
    Q_INVOKABLE QJSValue call(const QString &method, const QJSValue &params);
    Q_INVOKABLE QString env(const QString &name) const;
    Q_INVOKABLE void clipboardWrite(const QString &text);
    Q_INVOKABLE QString clipboardText() const;

    QString colorScheme() const;

public slots:
    void handleMessage(const QJsonObject &message);

signals:
    void appEvent(const QString &event, const QVariant &payload, const QString &target);
    void log(const QString &level, const QString &message, const QString &source);
    void config(const QVariantList &windows);
    void uiTree(const QString &target, const QVariantList &tree);
    void windowCommand(const QVariantMap &command);
    void colorSchemeChanged();

private:
    struct PendingCall {
        QJSValue resolve;
        QJSValue reject;
    };

    qint64 send(const QString &method, const QJsonObject &params);
    void ensurePromiseFactory();
    void applyState(const QJsonObject &state, const QJsonArray &unset);
    void reply(const QString &method, const QJsonObject &params);

    pulsar::QuickJsRuntime *runtime_;
    QJSEngine *engine_;
    QQmlPropertyMap *store_;
    qint64 nextId_ = 1;
    QHash<qint64, PendingCall> pending_;
    QJSValue promiseFactory_;
};
