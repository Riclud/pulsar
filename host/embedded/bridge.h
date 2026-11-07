#pragma once

#include <QByteArray>
#include <QHash>
#include <QJSEngine>
#include <QJSValue>
#include <QJsonArray>
#include <QJsonObject>
#include <QJsonValue>
#include <QObject>
#include <QString>
#include <QVariantList>
#include <QVariantMap>

class QQmlPropertyMap;
class QFileSystemWatcher;

namespace pulsar {
class NetworkService;
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
    Q_INVOKABLE void devReload();
    Q_INVOKABLE bool devMode() const;

    QString colorScheme() const;

    /** Push an unsolicited event to the JS runtime (`__event`). */
    void notify(const QString &name, const QJsonObject &data);

    /** Start the native multi-file picker and remember which dialog to resolve. */
    void beginFileDialog(const QString &token);

    void answerScanner(const QString &kind, const QString &token, const QJsonObject &params);
    void answerBiometric(const QString &kind, const QString &token, const QJsonObject &params);

    /** Resolve a host query that finished asynchronously, such as a biometric prompt. */
    void finishQuery(const QString &token, const QJsonValue &value);

    /** Resolve a native confirmation dialog by its token. */
    void finishMessageDialog(const QString &token, bool accepted);

    /** Resolve the pending file dialog with the picked local paths. */
    void finishFileDialog(const QJsonArray &paths);

    /** Send a file to the device Downloads (or a desktop download folder). */
    void beginFileExport(const QString &token, const QString &path, const QString &name, qint64 modifiedAT);

    /** Resolve the pending export with its success flag. */
    void finishFileExport(bool ok);

    /** Resolve a pending OS permission request. */
    void finishPermission(const QString &name, bool granted);

    /** Report a notification tap back to the app. */
    void finishNotificationClick(const QString &token);

    /** Deliver an ACTION_SEND / ACTION_VIEW intent to the app. */
    void finishIntent(const QJsonObject &intent);

    /** Deliver a playback state change from the Android media service. */
    void finishMediaState(const QJsonObject &state);

    /** Send a raw JSON-RPC notification to the JS runtime. */
    void notifyMethod(const QString &method, const QJsonObject &params);

    /** Forward a binary chunk to the JS transport (for streaming responses). */
    void notifyBinary(quint32 id, const QByteArray &data);

    /** HTTP engine used for `__net` requests. */
    void setNetwork(pulsar::NetworkService *network);

    /** Show the dev error overlay (called by the runtime and the dev channel). */
    void setErrorText(const QString &text);

    /** Drop calls and dialogs that belonged to the previous JS runtime. */
    void reset();

public slots:
    void handleMessage(const QJsonObject &message);

signals:
    void appEvent(const QString &event, const QVariant &payload, const QString &target);
    void log(const QString &level, const QString &message, const QString &source);
    void config(const QVariantList &windows);
    void themeApplied(const QVariantMap &theme);
    void uiTree(const QString &target, const QVariantList &tree);
    void uiPatch(const QString &target, const QVariantList &patches);
    void windowCommand(const QVariantMap &command);
    void errorReported(const QString &scope, const QString &message, const QString &stack);
    void errorText(const QString &text);
    void reloadRequested();
    void colorSchemeChanged();

private:
    struct PendingCall {
        QJSValue resolve;
        QJSValue reject;
    };

    qint64 send(const QString &method, const QJsonObject &params);
    void deliver(qint64 id, const QString &method, const QJsonObject &params);
    void ensurePromiseFactory();
    void applyState(const QJsonObject &state, const QJsonArray &unset);
    void reply(const QString &method, const QJsonObject &params);

    pulsar::QuickJsRuntime *runtime_;
    pulsar::NetworkService *network_ = nullptr;
    QJSEngine *engine_;
    QQmlPropertyMap *store_;
    qint64 nextId_ = 1;
    QHash<qint64, PendingCall> pending_;
    QJSValue promiseFactory_;
    QString pendingFileToken_;
    QString pendingExportToken_;
    QHash<QString, QString> pendingPermissionTokens_;
    QFileSystemWatcher *watcher_ = nullptr;
};
