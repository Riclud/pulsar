#pragma once

#include <QEasingCurve>
#include <QObject>
#include <QPointer>
#include <QQuickItem>
#include <QVariantAnimation>

#include <functional>
#include <limits>
#include <optional>

namespace pulsar {

/**
 * Enter, exit and press motion of a node that C++ owns: the same values and timing as MotionNode.qml,
 * without a QML object per node. It is a child of the item, so an exit outlives the node that asked for it.
 */
class NativeMotion : public QObject {
    Q_OBJECT

public:
    /** The `enter` or `exit` style: where the motion starts from or ends at. */
    struct Pose {
        std::optional<qreal> x;
        std::optional<qreal> y;
        std::optional<qreal> scale;
        std::optional<qreal> opacity;
    };

    /** Makes the Translate that carries the x and y offset; only nodes that move need one. */
    using ShiftFactory = std::function<QObject *(QQuickItem *)>;

    NativeMotion(QQuickItem *host, ShiftFactory makeShift);

    void configure(int duration, const QEasingCurve &curve, bool restClip);

    void playEnter(const Pose &from, qreal restingOpacity);
    void playExit(const Pose &to, std::function<void()> done);
    void settle(qreal restingOpacity);

    /** The scale of the pressed or hovered style; it eases there unless an enter or exit is running. */
    void setStateScale(qreal value);

    bool animating() const { return mode_ != Mode::Idle; }
    qreal heightLimit() const { return heightLimit_; }
    qreal fullHeight() const { return fullHeight_; }

private:
    enum class Mode { Idle, Enter, Exit };

    struct Channel {
        qreal from = 0;
        qreal to = 0;
        bool active = false;

        qreal at(qreal progress) const { return from + (to - from) * progress; }
    };

    void start(Mode mode);
    void step(qreal progress);
    void finish();
    void setHeightLimit(qreal limit);
    void applyTransform();

    QQuickItem *host_;
    ShiftFactory makeShift_;
    QPointer<QObject> shift_;
    QVariantAnimation clock_;
    QVariantAnimation press_;
    QEasingCurve curve_;
    std::function<void()> exitDone_;
    Channel moveX_;
    Channel moveY_;
    Channel zoomTo_;
    Channel fade_;
    Channel height_;
    Mode mode_ = Mode::Idle;
    int duration_ = 300;
    bool restClip_ = false;
    qreal offsetX_ = 0;
    qreal offsetY_ = 0;
    qreal zoom_ = 1;
    qreal stateScale_ = 1;
    qreal stateTarget_ = 1;
    qreal heightLimit_ = std::numeric_limits<qreal>::infinity();
    qreal fullHeight_ = 0;
};

} // namespace pulsar
