#include "perf_recorder.h"

#include <QCoreApplication>
#include <QDateTime>
#include <QJsonValue>
#include <QKeyEvent>
#include <QMutexLocker>
#include <QScreen>
#include <QSGRendererInterface>
#include <QTimer>
#include <QWheelEvent>

#include <memory>
#include <utility>

namespace pulsar {

namespace {

constexpr int kDragStepMs = 8;
constexpr int kSettleMs = 400;

QObject *flickableAt(QQuickItem *item, const QPointF &scenePoint)
{
    if (!item || !item->isVisible())
        return nullptr;

    if (!item->contains(item->mapFromScene(scenePoint)) && !item->clip() && item->childItems().isEmpty())
        return nullptr;

    const QList<QQuickItem *> kids = item->childItems();

    for (auto it = kids.rbegin(); it != kids.rend(); ++it) {
        if (QObject *found = flickableAt(*it, scenePoint))
            return found;
    }

    const bool inside = item->contains(item->mapFromScene(scenePoint));

    return inside && item->metaObject()->indexOfProperty("contentY") >= 0 ? item : nullptr;
}

QString graphicsApiName(QSGRendererInterface::GraphicsApi api)
{
    switch (api) {
    case QSGRendererInterface::Software:
        return QStringLiteral("software");
    case QSGRendererInterface::OpenGL:
        return QStringLiteral("opengl");
    case QSGRendererInterface::Vulkan:
        return QStringLiteral("vulkan");
    default:
        return QStringLiteral("other");
    }
}

} // namespace

PerfRecorder::PerfRecorder(QQuickWindow *window, const QJsonArray &steps, Resolve resolve, Dispatch dispatch, Done done,
                           QObject *parent)
    : QObject(parent)
    , window_(window)
    , steps_(steps)
    , resolve_(std::move(resolve))
    , dispatch_(std::move(dispatch))
    , done_(std::move(done))
{
}

qint64 PerfRecorder::now() const
{
    return clock_.nsecsElapsed() / 1000;
}

void PerfRecorder::note(const QString &kind)
{
    inputs_.append(QJsonObject{ { QStringLiteral("t"), double(now()) }, { QStringLiteral("kind"), kind } });
}

void PerfRecorder::at(int delayMs, std::function<void()> run)
{
    actions_.push_back({ delayMs, std::move(run) });
}

void PerfRecorder::fail(const QString &message)
{
    if (error_.isEmpty())
        error_ = message;

    actions_.clear();
}

bool PerfRecorder::locate(const QJsonObject &step, QPointF *point)
{
    if (resolve_(step, point))
        return true;

    fail(QStringLiteral("target not found: ") + step.value(QLatin1String("path")).toString(step.value(QLatin1String("text")).toString()));

    return false;
}

void PerfRecorder::trackFlickableAt(const QPointF &point)
{
    if (flickable_ || !window_)
        return;

    flickable_ = flickableAt(window_->contentItem(), point);
}

void PerfRecorder::sendMouse(QEvent::Type type, const QPointF &point, Qt::MouseButton button)
{
    if (type == QEvent::MouseButtonPress)
        buttons_ |= button;

    if (type == QEvent::MouseButtonRelease)
        buttons_ &= ~button;

    QMouseEvent event(type, point, point, window_->mapToGlobal(point), button, buttons_, Qt::NoModifier);

    // Pointer handlers measure taps and holds from this; a synthetic event has none of its own.
    event.setTimestamp(quint64(QDateTime::currentMSecsSinceEpoch()));

    QCoreApplication::sendEvent(window_, &event);
}

void PerfRecorder::sendKey(int key, const QString &text)
{
    QKeyEvent press(QEvent::KeyPress, key, Qt::NoModifier, text);
    QKeyEvent release(QEvent::KeyRelease, key, Qt::NoModifier, text);

    QCoreApplication::sendEvent(window_, &press);
    QCoreApplication::sendEvent(window_, &release);
}

void PerfRecorder::connectFrames()
{
    QQuickWindow *window = window_;

    const auto stamp = [this](qint64 Frame::*field) {
        QMutexLocker lock(&mutex_);

        pending_.*field = now();
    };

    connect(window, &QQuickWindow::afterAnimating, this, [this]() {
        QMutexLocker lock(&mutex_);

        guiFrame_.animating = now();
        guiFrame_.hasY = !flickable_.isNull();
        guiFrame_.y = flickable_ ? flickable_->property("contentY").toDouble() : 0;

        lock.unlock();
        checkAppeared();
    }, Qt::DirectConnection);

    // The GUI thread starts the next frame before the render thread has swapped this one,
    // so its half is held apart and joined here, when both threads are in the same frame.
    connect(window, &QQuickWindow::beforeSynchronizing, this, [this]() {
        QMutexLocker lock(&mutex_);

        pending_ = guiFrame_;
        pending_.syncStart = now();
    }, Qt::DirectConnection);

    connect(window, &QQuickWindow::afterSynchronizing, this, [stamp]() { stamp(&Frame::syncEnd); }, Qt::DirectConnection);
    connect(window, &QQuickWindow::beforeRendering, this, [stamp]() { stamp(&Frame::renderStart); }, Qt::DirectConnection);
    connect(window, &QQuickWindow::afterRendering, this, [stamp]() { stamp(&Frame::renderEnd); }, Qt::DirectConnection);

    connect(window, &QQuickWindow::frameSwapped, this, [this]() {
        QMutexLocker lock(&mutex_);

        pending_.swapped = now();
        frames_.append(std::exchange(pending_, {}));
    }, Qt::DirectConnection);
}

void PerfRecorder::watchFor(const QJsonObject &step)
{
    untilPath_ = step.value(QLatin1String("until")).toString();
}

// Runs once per frame, so the mark is at most one frame later than the UI change.
void PerfRecorder::checkAppeared()
{
    if (untilPath_.isEmpty())
        return;

    QObject *renderer = window_->property("nativeRenderer").value<QObject *>();
    QObject *item = nullptr;

    if (renderer)
        QMetaObject::invokeMethod(renderer, "itemAt", Q_RETURN_ARG(QObject *, item), Q_ARG(QString, untilPath_));

    const auto *quick = qobject_cast<QQuickItem *>(item);

    // A kept-alive screen exists before it is shown, so existing is not enough.
    if (!quick || !quick->isVisible())
        return;

    note(QStringLiteral("appeared"));
    untilPath_.clear();
}

void PerfRecorder::start()
{
    clock_.start();
    connectFrames();

    for (const QJsonValue &value : std::as_const(steps_))
        plan(value.toObject());

    at(kSettleMs, []() {});

    // Without this an idle window would produce no frames to compare against the input.
    window_->update();

    advance();
}

void PerfRecorder::plan(const QJsonObject &step)
{
    const QString kind = step.value(QLatin1String("do")).toString();

    if (kind == QLatin1String("wait")) {
        at(step.value(QLatin1String("ms")).toInt(), []() {});
        return;
    }

    if (kind == QLatin1String("hover")) {
        at(0, [this, step]() {
            QPointF point;

            if (!locate(step, &point))
                return;

            note(QStringLiteral("hover"));
            sendMouse(QEvent::MouseMove, point, Qt::NoButton);
        });

        return;
    }

    if (kind == QLatin1String("dispatch")) {
        at(0, [this, step]() {
            watchFor(step);
            note(QStringLiteral("dispatch:") + step.value(QLatin1String("label")).toString());

            if (!dispatch_(step))
                fail(QStringLiteral("cannot dispatch to: ") + step.value(QLatin1String("path")).toString());
        });

        return;
    }

    if (kind == QLatin1String("wheel")) {
        planWheel(step);
        return;
    }

    if (kind == QLatin1String("tap")) {
        planTap(step);
        return;
    }

    if (kind == QLatin1String("drag")) {
        planDrag(step);
        return;
    }

    if (kind == QLatin1String("text")) {
        planText(step);
        return;
    }

    if (kind == QLatin1String("enter")) {
        at(0, [this]() {
            note(QStringLiteral("enter"));
            sendKey(Qt::Key_Return, QStringLiteral("\r"));
        });

        return;
    }

    at(0, [this, kind]() { fail(QStringLiteral("unknown step: ") + kind); });
}

void PerfRecorder::planWheel(const QJsonObject &step)
{
    const int ticks = step.value(QLatin1String("ticks")).toInt(1);
    const int every = step.value(QLatin1String("every")).toInt(40);
    const int dy = step.value(QLatin1String("dy")).toInt(120);
    auto point = std::make_shared<QPointF>();

    at(0, [this, step, point]() {
        if (!locate(step, point.get()))
            return;

        trackFlickableAt(*point);
        sendMouse(QEvent::MouseMove, *point, Qt::NoButton);
    });

    for (int tick = 0; tick < ticks; tick++) {
        at(tick == 0 ? 0 : every, [this, point, dy]() {
            QWheelEvent event(*point, window_->mapToGlobal(*point), QPoint(), QPoint(0, -dy), buttons_, Qt::NoModifier,
                              Qt::NoScrollPhase, false);

            note(QStringLiteral("wheel"));
            QCoreApplication::sendEvent(window_, &event);
        });
    }
}

void PerfRecorder::planTap(const QJsonObject &step)
{
    const int hold = step.value(QLatin1String("hold")).toInt(60);
    auto point = std::make_shared<QPointF>();

    at(0, [this, step, point]() {
        if (!locate(step, point.get()))
            return;

        sendMouse(QEvent::MouseMove, *point, Qt::NoButton);
        watchFor(step);
        note(QStringLiteral("press"));
        sendMouse(QEvent::MouseButtonPress, *point, Qt::LeftButton);
    });

    at(hold, [this, point]() {
        note(QStringLiteral("release"));
        sendMouse(QEvent::MouseButtonRelease, *point, Qt::LeftButton);
    });
}

void PerfRecorder::planDrag(const QJsonObject &step)
{
    const QPointF delta(step.value(QLatin1String("dx")).toDouble(), step.value(QLatin1String("dy")).toDouble());
    const int duration = step.value(QLatin1String("ms")).toInt(250);
    const int moves = qMax(1, duration / kDragStepMs);
    auto point = std::make_shared<QPointF>();

    at(0, [this, step, point]() {
        if (!locate(step, point.get()))
            return;

        trackFlickableAt(*point);
        sendMouse(QEvent::MouseMove, *point, Qt::NoButton);
        note(QStringLiteral("press"));
        sendMouse(QEvent::MouseButtonPress, *point, Qt::LeftButton);
    });

    for (int move = 1; move <= moves; move++) {
        at(kDragStepMs, [this, point, delta, move, moves]() {
            note(QStringLiteral("move"));
            sendMouse(QEvent::MouseMove, *point + delta * (double(move) / moves), Qt::NoButton);
        });
    }

    at(kDragStepMs, [this, point, delta]() {
        note(QStringLiteral("release"));
        sendMouse(QEvent::MouseButtonRelease, *point + delta, Qt::LeftButton);
    });
}

void PerfRecorder::planText(const QJsonObject &step)
{
    const QString value = step.value(QLatin1String("value")).toString();
    const int every = step.value(QLatin1String("every")).toInt(50);

    for (qsizetype index = 0; index < value.size(); index++) {
        at(index == 0 ? 0 : every, [this, letter = QString(value.at(index))]() {
            note(QStringLiteral("key"));
            sendKey(0, letter);
        });
    }
}

void PerfRecorder::advance()
{
    if (actions_.empty() || !window_) {
        finish();
        return;
    }

    Action action = std::move(actions_.front());

    actions_.pop_front();

    QTimer::singleShot(action.delayMs, Qt::PreciseTimer, this, [this, run = std::move(action.run)]() {
        if (window_)
            run();

        advance();
    });
}

void PerfRecorder::finish()
{
    QJsonObject report;

    if (window_) {
        disconnect(window_, nullptr, this, nullptr);

        report.insert(QStringLiteral("api"), graphicsApiName(window_->rendererInterface()->graphicsApi()));
        report.insert(QStringLiteral("refreshHz"), window_->screen() ? window_->screen()->refreshRate() : 0);
        report.insert(QStringLiteral("width"), window_->width());
        report.insert(QStringLiteral("height"), window_->height());
    }

    QJsonArray frames;

    {
        QMutexLocker lock(&mutex_);

        for (const Frame &frame : std::as_const(frames_)) {
            frames.append(QJsonArray{ double(frame.animating), double(frame.syncStart), double(frame.syncEnd),
                                      double(frame.renderStart), double(frame.renderEnd), double(frame.swapped),
                                      frame.hasY ? QJsonValue(frame.y) : QJsonValue() });
        }
    }

    report.insert(QStringLiteral("frames"), frames);
    report.insert(QStringLiteral("inputs"), inputs_);

    if (!error_.isEmpty())
        report.insert(QStringLiteral("error"), error_);

    done_(report);
    deleteLater();
}

} // namespace pulsar
