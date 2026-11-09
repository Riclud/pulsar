#pragma once

#include <QElapsedTimer>
#include <QJsonArray>
#include <QJsonObject>
#include <QList>
#include <QMutex>
#include <QObject>
#include <QPointF>
#include <QPointer>
#include <QQuickItem>
#include <QQuickWindow>
#include <QString>

#include <deque>
#include <functional>

namespace pulsar {

/**
 * Plays timed input into a window and records every frame it produces, so that
 * smoothness and latency can be compared between builds.
 */
class PerfRecorder : public QObject {
    Q_OBJECT

public:
    using Resolve = std::function<bool(const QJsonObject &target, QPointF *point)>;
    using Done = std::function<void(const QJsonObject &report)>;

    PerfRecorder(QQuickWindow *window, const QJsonArray &steps, Resolve resolve, Done done, QObject *parent = nullptr);

    void start();

private:
    struct Action {
        int delayMs = 0;
        std::function<void()> run;
    };

    struct Frame {
        qint64 animating = -1;
        qint64 syncStart = -1;
        qint64 syncEnd = -1;
        qint64 renderStart = -1;
        qint64 renderEnd = -1;
        qint64 swapped = -1;
        double y = 0;
        bool hasY = false;
    };

    void connectFrames();
    void plan(const QJsonObject &step);
    void planWheel(const QJsonObject &step);
    void planTap(const QJsonObject &step);
    void planDrag(const QJsonObject &step);
    void planText(const QJsonObject &step);
    void advance();
    void finish();

    void at(int delayMs, std::function<void()> run);
    void fail(const QString &message);
    qint64 now() const;
    void note(const QString &kind);
    bool locate(const QJsonObject &step, QPointF *point);
    void trackFlickableAt(const QPointF &point);
    void sendMouse(QEvent::Type type, const QPointF &point, Qt::MouseButton button);
    void sendKey(int key, const QString &text);

    QPointer<QQuickWindow> window_;
    QJsonArray steps_;
    Resolve resolve_;
    Done done_;
    std::deque<Action> actions_;
    QElapsedTimer clock_;
    QJsonArray inputs_;
    QString error_;
    QPointer<QObject> flickable_;
    Qt::MouseButtons buttons_ = Qt::NoButton;

    QMutex mutex_;
    Frame guiFrame_;
    Frame pending_;
    QList<Frame> frames_;
};

} // namespace pulsar
