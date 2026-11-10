#pragma once

#include <QQmlEngine>
#include <QEasingCurve>
#include <QPointer>
#include <QPropertyAnimation>
#include <QQuickItem>
#include <QSequentialAnimationGroup>
#include <QVariantList>

#include <functional>
#include <vector>

namespace pulsar {

class Stretch;

/**
 * Calls back once per frame with the time since the previous frame and since the start.
 * It wraps the QML FrameAnimation, so the frames come from the same driver QML used.
 */
class FrameClock : public QObject {
    Q_OBJECT

public:
    using Tick = std::function<void(qreal frameTime, qreal elapsedTime)>;

    FrameClock(QQmlEngine *engine, QObject *parent);

    void setTick(Tick tick) { tick_ = std::move(tick); }
    bool running() const;

    void begin();
    void end();
    void restart();

signals:
    void runningChanged();

private slots:
    void fire();

private:
    QObject *animation_ = nullptr;
    Tick tick_;
};

class Inertia : public QQuickItem {
    Q_OBJECT
    Q_PROPERTY(QObject *renderer READ renderer WRITE setRenderer NOTIFY rendererChanged)
    Q_PROPERTY(QQuickItem *flick READ flick WRITE setFlick NOTIFY flickChanged)
    Q_PROPERTY(bool stretch READ stretch WRITE setStretch NOTIFY stretchChanged)
    Q_PROPERTY(qreal impulse READ impulse WRITE setImpulse NOTIFY impulseChanged)

public:
    explicit Inertia(QQuickItem *parent = nullptr);
    ~Inertia() override;

    QObject *renderer() const { return renderer_; }
    void setRenderer(QObject *renderer);

    QQuickItem *flick() const { return flick_; }
    void setFlick(QQuickItem *flick);

    bool stretch() const { return stretch_; }
    void setStretch(bool stretch);

    qreal impulse() const { return impulse_; }
    void setImpulse(qreal impulse);

    /** Moves to a content offset, clamped to the content; animated glides on the wheel spring. */
    Q_INVOKABLE void scrollTo(qreal y, bool animated);
    Q_INVOKABLE void scrollToEnd(bool animated);

    /** How far the stretch pulls the content, in pixels; the transform reads it. */
    qreal pull() const;
    bool pullsTop() const;

signals:
    void rendererChanged();
    void flickChanged();
    void stretchChanged();
    void impulseChanged();

protected:
    void componentComplete() override;
    void mousePressEvent(QMouseEvent *event) override;
    void mouseReleaseEvent(QMouseEvent *event) override;
    void mouseUngrabEvent() override;
    void wheelEvent(QWheelEvent *event) override;

private slots:
    void contentYChanged();
    void draggingChanged();
    void flickStarted();
    void movingChanged();
    void followFlick();

private:
    struct Sample {
        double time = 0;
        double y = 0;
    };

    qreal flickReal(const char *name) const;
    void setContentY(qreal value);
    qreal minY() const;
    qreal maxY() const;
    void addSample();
    qreal releaseVelocity() const;
    qreal curveAt(qreal time);
    void fling(qreal velocity);
    void scrollByWheel(QWheelEvent *event);
    void absorb(qreal velocity);
    void step(qreal elapsed);
    void spring(qreal frameTime);
    void refreshScrolling();
    void refreshPointer();
    void stopAll();
    void note(bool active);

    QPointer<QObject> renderer_;
    QPointer<QQuickItem> flick_;
    bool stretch_ = false;
    bool pressed_ = false;
    bool scrolling_ = false;
    qreal impulse_ = 0;
    int edge_ = 0;
    std::vector<Sample> samples_;
    qreal startY_ = 0;
    qreal distance_ = 0;
    qreal duration_ = 0;
    qreal target_ = 0;
    qreal velocity_ = 0;
    qreal stiffness_ = 30;
    bool followEnd_ = false;
    QVariantList curve_;
    FrameClock *frames_ = nullptr;
    FrameClock *wheeling_ = nullptr;
    QSequentialAnimationGroup *absorbing_ = nullptr;
    QPropertyAnimation *absorbPeak_ = nullptr;
    Stretch *transform_ = nullptr;

};

} // namespace pulsar
