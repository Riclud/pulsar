#include "quickjs_thread.h"

#include "quickjs_runtime.h"

#include <QCoreApplication>
#include <QEvent>

#include <utility>

namespace pulsar {

namespace {

// The JS engine limits itself to 1 MB; secondary threads can default to less.
constexpr uint kStackBytes = 8 * 1024 * 1024;

constexpr int kMaxQueuedFrames = 2;

// Bounded so that JS cannot deadlock with a GUI thread that is waiting for it in reload().
constexpr int kFrameWaitMs = 100;

bool isUiFrame(const QJsonObject &message)
{
    const QString method = message.value(QStringLiteral("method")).toString();

    return method == QLatin1String("__ui") || method == QLatin1String("__ui-patch")
        || method == QLatin1String("__ui-command");
}

} // namespace

QuickJsThread::QuickJsThread(QObject *parent)
    : QThread(parent)
    , frameSlots_(kMaxQueuedFrames)
{
    setStackSize(kStackBytes);
    start();
    created_.acquire();
}

QuickJsThread::~QuickJsThread()
{
    runtime_->requestInterrupt();
    quit();
    wait();
}

// QuickJS records the stack of the thread that creates it, so the runtime must be built here.
void QuickJsThread::run()
{
    QuickJsRuntime runtime;

    connect(&runtime, &QuickJsRuntime::message, &runtime, [this](const QJsonObject &value) {
        const bool holdsFrameSlot = isUiFrame(value) && frameSlots_.tryAcquire(1, kFrameWaitMs);

        post([this, value]() { Q_EMIT message(value); }, holdsFrameSlot);
    }, Qt::DirectConnection);

    connect(&runtime, &QuickJsRuntime::binary, &runtime, [this](quint32 id, const QByteArray &bytes) {
        post([this, id, bytes]() { Q_EMIT binary(id, bytes); }, false);
    }, Qt::DirectConnection);

    connect(&runtime, &QuickJsRuntime::failed, &runtime, [this](const QString &text) {
        post([this, text]() { Q_EMIT failed(text); }, false);
    }, Qt::DirectConnection);

    runtime_ = &runtime;
    created_.release();

    exec();
}

void QuickJsThread::post(std::function<void()> deliver, bool holdsFrameSlot)
{
    QMetaObject::invokeMethod(this, [this, generation = workerGeneration_, holdsFrameSlot, deliver = std::move(deliver)]() {
        if (generation == generation_)
            deliver();

        if (holdsFrameSlot)
            frameSlots_.release();
    }, Qt::QueuedConnection);
}

void QuickJsThread::deliverPosted()
{
    QCoreApplication::sendPostedEvents(this, QEvent::MetaCall);
}

bool QuickJsThread::load(const QString &bundlePath, const QString &manifestJson, const QString &appDir)
{
    bool loaded = false;

    QMetaObject::invokeMethod(runtime_, [&]() {
        loaded = runtime_->start(bundlePath, manifestJson, appDir);
    }, Qt::BlockingQueuedConnection);

    deliverPosted();

    return loaded;
}

bool QuickJsThread::reload(const QString &bundlePath, const QString &manifestJson, const QString &appDir)
{
    const quint64 next = ++generation_;

    runtime_->requestInterrupt();

    bool loaded = false;

    QMetaObject::invokeMethod(runtime_, [&]() {
        workerGeneration_ = next;
        loaded = runtime_->restart(bundlePath, manifestJson, appDir);
    }, Qt::BlockingQueuedConnection);

    deliverPosted();

    return loaded;
}

void QuickJsThread::setRestoreState(const QJsonObject &state)
{
    QMetaObject::invokeMethod(runtime_, [runtime = runtime_, state]() {
        runtime->setRestoreState(state);
    }, Qt::QueuedConnection);
}

QJsonObject QuickJsThread::evaluateForDev(const QString &expression)
{
    QJsonObject result;

    QMetaObject::invokeMethod(runtime_, [&]() {
        result = runtime_->evaluateForDev(expression);
    }, Qt::BlockingQueuedConnection);

    deliverPosted();

    return result;
}

void QuickJsThread::receive(const QJsonObject &message)
{
    QMetaObject::invokeMethod(runtime_, [runtime = runtime_, message]() {
        runtime->receive(message);
    }, Qt::QueuedConnection);
}

void QuickJsThread::receiveBinary(quint32 id, const QByteArray &data)
{
    QMetaObject::invokeMethod(runtime_, [runtime = runtime_, id, data]() {
        runtime->receiveBinary(id, data);
    }, Qt::QueuedConnection);
}

} // namespace pulsar
