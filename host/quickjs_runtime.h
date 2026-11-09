#pragma once

#include <QByteArray>
#include <QHash>
#include <QJsonObject>
#include <QList>
#include <QObject>
#include <QString>

#include <quickjs.h>

#include <atomic>

class QTimer;

namespace pulsar {

JSValue jsPulsarSend(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarSendBinary(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarLog(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarPlatformInfo(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarPaths(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarEnv(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarReadFile(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarWriteFile(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarWriteFileAtomic(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarAppendFile(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarAppendBytes(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarListDir(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarExists(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarStat(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarMkdir(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarRemove(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarRename(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarCopy(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarMoveToTrash(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarOpenUrl(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarSetTimeout(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarSetInterval(JSContext *, JSValueConst, int, JSValueConst *);
JSValue jsPulsarClearTimer(JSContext *, JSValueConst, int, JSValueConst *);

/**
 * Embedded QuickJS runtime. The engine-neutral TS core runs inside it and
 * talks to the host over an in-process transport; platform calls go through
 * native globals implemented here.
 */
class QuickJsRuntime : public QObject {
    Q_OBJECT

public:
    explicit QuickJsRuntime(QObject *parent = nullptr);
    ~QuickJsRuntime() override;

    bool start(const QString &bundlePath, const QString &manifestJson, const QString &appDir);
    bool restart(const QString &bundlePath, const QString &manifestJson, const QString &appDir);
    void reset();
    void setRestoreState(const QJsonObject &state);

    /** Evaluate an expression in the JS context for the dev channel. */
    QJsonObject evaluateForDev(const QString &expression);

    /** Deliver a control message from the host to the JS transport. */
    void receive(const QJsonObject &message);
    void receiveBinary(quint32 id, const QByteArray &data);

    void runJobs();

    /** Stops running JS. Safe from any thread; the next reset() clears it. */
    void requestInterrupt();

signals:
    void message(const QJsonObject &message);
    void binary(quint32 id, const QByteArray &data);
    void failed(const QString &message);

private:
    struct TimerEntry {
        QTimer *timer = nullptr;
        JSValue callback = JS_UNDEFINED;
        bool repeating = false;
    };

    struct PendingRejection {
        JSValue promise = JS_UNDEFINED;
        JSValue reason = JS_UNDEFINED;
    };

    static void trackRejection(JSContext *context, JSValueConst promise, JSValueConst reason, bool handled,
                               void *opaque);

    bool createContext();
    void clearRejections();
    void forgetRejection(JSValueConst promise);
    void flushRejections();
    void reportValue(const QString &scope, JSValueConst value);
    void installGlobals();
    bool evaluate(const QByteArray &code, const QString &filename);
    void reportException(const QString &scope);

    QJsonObject platformInfo() const;
    QJsonObject paths() const;
    QString appId() const;

    void fireTimer(int id);
    void clearTimer(int id);

    JSRuntime *runtime_ = nullptr;
    JSContext *context_ = nullptr;
    QJsonObject manifest_;
    QJsonObject restoreState_;
    QString appDir_;
    QHash<int, TimerEntry> timers_;
    QList<PendingRejection> rejections_;
    bool rejectionFlushQueued_ = false;
    int nextTimer_ = 1;
    std::atomic_bool interrupted_ = false;

    friend JSValue jsPulsarSend(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarSendBinary(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarLog(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarPlatformInfo(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarPaths(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarEnv(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarReadFile(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarWriteFile(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarWriteFileAtomic(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarAppendFile(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarAppendBytes(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarListDir(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarExists(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarStat(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarMkdir(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarRemove(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarRename(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarCopy(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarMoveToTrash(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarOpenUrl(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarSetTimeout(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarSetInterval(JSContext *, JSValueConst, int, JSValueConst *);
    friend JSValue jsPulsarClearTimer(JSContext *, JSValueConst, int, JSValueConst *);
};

} // namespace pulsar
