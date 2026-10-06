#pragma once

#include <QByteArray>
#include <QHash>
#include <QJSEngine>
#include <QJSValue>
#include <QJsonObject>
#include <QList>
#include <QObject>
#include <QProcess>

class QQmlPropertyMap;

class Bridge : public QObject {
    Q_OBJECT

public:
    explicit Bridge(QJSEngine *engine, QQmlPropertyMap *store, QObject *parent = nullptr);
    ~Bridge() override;

    Q_INVOKABLE qint64 invoke(const QString &method, const QJSValue &params);
    Q_INVOKABLE qint64 emit(const QString &method, const QJSValue &params);
    Q_INVOKABLE QJSValue call(const QString &method, const QJSValue &params);
    Q_INVOKABLE QString diagnostics() const;

    // Called by the host to restart the whole Bun side (dev hot reload).
    Q_INVOKABLE void restart();

    // Native OS conveniences exposed to QML.
    Q_INVOKABLE void clipboardWrite(const QString &text);
    Q_INVOKABLE QString clipboardText() const;

    // Native dialogs, callable directly from QML (synchronous/modal).
    Q_INVOKABLE QString openFile(const QString &title, const QString &filter, const QString &dir);
    Q_INVOKABLE QString saveFile(const QString &title, const QString &filter, const QString &dir);
    Q_INVOKABLE void message(const QString &title, const QString &text);

    // Send an unsolicited notification to the runtime (no response expected).
    void notify(const QString &method, const QJsonObject &params);
    // Re-emit a runtime log line to QML subscribers.
    void postLog(const QString &level, const QString &message, const QString &source);

signals:
    void ready();
    void response(qint64 id, const QJSValue &result, const QJSValue &error);
    void notification(const QString &method, const QJSValue &params);
    void crashed(const QString &kind, int code);
    void log(const QString &level, const QString &message, const QString &source);

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
    void handleResponse(const QByteArray &line);

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
};
