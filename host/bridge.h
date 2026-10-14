#pragma once

#include <QByteArray>
#include <QHash>
#include <QJSEngine>
#include <QJSValue>
#include <QJsonObject>
#include <QList>
#include <QObject>
#include <QProcess>
#include <QVariantList>

class QQmlPropertyMap;
class QMenu;
class QSystemTrayIcon;

class Bridge : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString colorScheme READ colorScheme NOTIFY colorSchemeChanged)

public:
    explicit Bridge(QJSEngine *engine, QQmlPropertyMap *store, QObject *parent = nullptr);
    ~Bridge() override;

    Q_INVOKABLE qint64 invoke(const QString &method, const QJSValue &params);
    Q_INVOKABLE qint64 emit(const QString &method, const QJSValue &params);
    Q_INVOKABLE QJSValue call(const QString &method, const QJSValue &params);
    Q_INVOKABLE QString diagnostics() const;
    Q_INVOKABLE QString env(const QString &name) const;

    // Called by the host to restart the whole Bun side (dev hot reload).
    Q_INVOKABLE void restart();

    // Native OS conveniences exposed to QML.
    Q_INVOKABLE void clipboardWrite(const QString &text);
    Q_INVOKABLE QString clipboardText() const;

    // Native dialogs, callable directly from QML (synchronous/modal).
    Q_INVOKABLE QString openFile(const QString &title, const QString &filter, const QString &dir);
    Q_INVOKABLE QString saveFile(const QString &title, const QString &filter, const QString &dir);
    Q_INVOKABLE void message(const QString &title, const QString &text);

    // System tray, callable directly from QML.
    Q_INVOKABLE bool trayAvailable() const;
    Q_INVOKABLE void setTrayIcon(const QString &path);
    Q_INVOKABLE void setTrayTooltip(const QString &text);
    Q_INVOKABLE void setTrayMenu(const QVariantList &items);
    Q_INVOKABLE void hideTray();

    // Native notification; emits __event notification-click with the token.
    bool showNotification(const QString &title, const QString &body, const QString &token);

    // System color scheme ("light"/"dark"), reactive to QML.
    QString colorScheme() const;
    void refreshColorScheme();

    // Send an unsolicited notification to the runtime (no response expected).
    void notify(const QString &method, const QJsonObject &params);
    // Send a binary data frame on the data channel.
    void sendBinary(quint32 streamId, const QByteArray &data);
    // Re-emit a runtime log line to QML subscribers.
    void postLog(const QString &level, const QString &message, const QString &source);
    // Re-emit an app event (backend -> UI) to QML subscribers.
    void postMessage(const QString &event, const QVariant &payload, const QString &target);

signals:
    void ready();
    void response(qint64 id, const QJSValue &result, const QJSValue &error);
    void notification(const QString &method, const QJSValue &params);
    void data(quint32 streamId, const QByteArray &data);
    void crashed(const QString &kind, int code);
    void log(const QString &level, const QString &message, const QString &source);
    void appEvent(const QString &event, const QVariant &payload, const QString &target);
    void colorSchemeChanged();

private slots:
    void onReadyReadStandardOutput();
    void onReadyReadStandardError();
    void onProcessFinished(int exitCode, QProcess::ExitStatus status);

private:
    struct PendingCall {
        QJSValue resolve;
        QJSValue reject;
    };

    void startBridge();
    void ensurePromiseFactory();
    void failPending(const QString &reason);
    void handleResponse(const QByteArray &payload);
    void handleDataFrame(const QByteArray &payload);

    QProcess process_;
    QJSEngine *engine_;
    QQmlPropertyMap *store_ = nullptr;
    QByteArray stdoutBuffer_;
    QByteArray stderrBuffer_;
    qint64 nextId_ = 1;
    bool readyEmitted_ = false;
    bool synced_ = false;
    bool crashed_ = false;
    bool restarting_ = false;
    int restartBudget_ = 0;
    QJSValue promiseFactory_;
    QHash<qint64, PendingCall> pendingCalls_;
    QList<QByteArray> pendingWrites_;

    QSystemTrayIcon *tray_ = nullptr;
    QMenu *trayMenu_ = nullptr;
    QString lastNotifyToken_;

    void ensureTray();
};
