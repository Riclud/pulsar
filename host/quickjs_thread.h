#pragma once

#include <QByteArray>
#include <QJsonObject>
#include <QSemaphore>
#include <QString>
#include <QThread>

#include <functional>

namespace pulsar {

class QuickJsRuntime;

/**
 * Runs the QuickJS runtime on its own thread. Everything here is called from
 * the GUI thread, and the signals are delivered on it.
 */
class QuickJsThread : public QThread {
    Q_OBJECT

public:
    explicit QuickJsThread(QObject *parent = nullptr);
    ~QuickJsThread() override;

    /** Both wait for the bundle to run and deliver what it sent before returning. */
    bool load(const QString &bundlePath, const QString &manifestJson, const QString &appDir);
    bool reload(const QString &bundlePath, const QString &manifestJson, const QString &appDir);

    void setRestoreState(const QJsonObject &state);
    QJsonObject evaluateForDev(const QString &expression);

    void receive(const QJsonObject &message);
    void receiveBinary(quint32 id, const QByteArray &data);

signals:
    void message(const QJsonObject &message);
    void binary(quint32 id, const QByteArray &data);
    void failed(const QString &message);

protected:
    void run() override;

private:
    void post(std::function<void()> deliver, bool holdsFrameSlot);
    void deliverPosted();

    QuickJsRuntime *runtime_ = nullptr;
    QSemaphore created_;
    QSemaphore frameSlots_;
    quint64 generation_ = 0;
    quint64 workerGeneration_ = 0;
};

} // namespace pulsar
