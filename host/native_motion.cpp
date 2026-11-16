#include "native_motion.h"

#include <cmath>
#include <utility>

namespace pulsar {

namespace {

const qreal kNoLimit = std::numeric_limits<qreal>::infinity();

qreal eased(QEasingCurve::Type type, qreal progress)
{
    return QEasingCurve(type).valueForProgress(progress);
}

} // namespace

NativeMotion::NativeMotion(QQuickItem *host, ShiftFactory makeShift)
    : QObject(host)
    , host_(host)
    , makeShift_(std::move(makeShift))
{
    clock_.setStartValue(0.0);
    clock_.setEndValue(1.0);

    connect(&clock_, &QVariantAnimation::valueChanged, this, [this](const QVariant &value) { step(value.toReal()); });
    connect(&clock_, &QVariantAnimation::finished, this, &NativeMotion::finish);

    press_.setEasingCurve(QEasingCurve::OutCubic);

    connect(&press_, &QVariantAnimation::valueChanged, this, [this](const QVariant &value) {
        stateScale_ = value.toReal();
        applyTransform();
    });
}

void NativeMotion::configure(int duration, const QEasingCurve &curve, bool restClip)
{
    duration_ = duration;
    curve_ = curve;
    restClip_ = restClip;
}

void NativeMotion::setHeightLimit(qreal limit)
{
    if (heightLimit_ == limit)
        return;

    heightLimit_ = limit;

    // The parent stack reads the limit when it measures this child.
    if (QQuickItem *parent = host_->parentItem())
        parent->polish();
}

// The offset is scaled like the QML transform list [Translate, Scale] scales it.
void NativeMotion::applyTransform()
{
    const qreal scale = zoom_ * stateScale_;

    host_->setScale(scale);

    if (!shift_ && offsetX_ == 0 && offsetY_ == 0)
        return;

    if (!shift_)
        shift_ = makeShift_(host_);

    if (!shift_)
        return;

    shift_->setProperty("x", offsetX_ * scale);
    shift_->setProperty("y", offsetY_ * scale);
}

void NativeMotion::start(Mode mode)
{
    mode_ = mode;

    clock_.setDuration(duration_);
    clock_.start();
}

void NativeMotion::step(qreal progress)
{
    if (mode_ == Mode::Idle)
        return;

    const qreal cubic = eased(QEasingCurve::OutCubic, progress);
    // An exit eases its offset out; an enter follows the curve of the transition.
    const qreal travel = mode_ == Mode::Enter ? curve_.valueForProgress(progress) : cubic;

    offsetX_ = moveX_.at(travel);
    offsetY_ = moveY_.at(travel);
    zoom_ = zoomTo_.at(cubic);

    host_->setOpacity(fade_.at(cubic));

    if (height_.active)
        setHeightLimit(height_.at(cubic));

    applyTransform();
}

void NativeMotion::finish()
{
    if (mode_ == Mode::Idle)
        return;

    // A zero duration ends without a tick, so the last values are set here.
    step(1);

    const Mode ended = std::exchange(mode_, Mode::Idle);

    host_->setClip(restClip_);

    if (ended == Mode::Enter) {
        setHeightLimit(kNoLimit);
        return;
    }

    if (const auto done = std::exchange(exitDone_, nullptr))
        done();

    if (QQuickItem *parent = host_->parentItem())
        parent->polish();
}

void NativeMotion::playEnter(const Pose &from, qreal restingOpacity)
{
    const bool interrupted = mode_ != Mode::Idle;

    mode_ = Mode::Idle;
    clock_.stop();
    press_.stop();
    exitDone_ = nullptr;
    stateScale_ = stateTarget_;

    const qreal limit = fullHeight_ > 0 ? fullHeight_ : host_->height() > 0 ? host_->height() : host_->implicitHeight();

    if (!interrupted) {
        offsetX_ = from.x.value_or(0);
        offsetY_ = from.y.value_or(0);
        zoom_ = from.scale.value_or(1);
        host_->setOpacity(from.opacity.value_or(restingOpacity));
        setHeightLimit(limit > 0 ? 0 : kNoLimit);
    }

    moveX_ = { offsetX_, 0, true };
    moveY_ = { offsetY_, 0, true };
    zoomTo_ = { zoom_, 1, true };
    fade_ = { host_->opacity(), restingOpacity, true };
    height_ = { heightLimit_, limit, limit > 0 && std::isfinite(heightLimit_) };

    host_->setClip(limit > 0 || restClip_);

    applyTransform();
    start(Mode::Enter);
}

void NativeMotion::playExit(const Pose &to, std::function<void()> done)
{
    const bool interrupted = mode_ == Mode::Enter;

    mode_ = Mode::Idle;
    clock_.stop();
    press_.stop();
    exitDone_ = std::move(done);
    stateScale_ = stateTarget_;

    if (!interrupted)
        fullHeight_ = host_->height();

    moveX_ = { offsetX_, to.x.value_or(offsetX_), true };
    moveY_ = { offsetY_, to.y.value_or(offsetY_), true };
    zoomTo_ = { zoom_, to.scale.value_or(zoom_), true };
    fade_ = { host_->opacity(), to.opacity.value_or(host_->opacity()), true };

    setHeightLimit(host_->height());

    height_ = { heightLimit_, 0, true };

    host_->setClip(true);

    applyTransform();
    start(Mode::Exit);
}

void NativeMotion::settle(qreal restingOpacity)
{
    mode_ = Mode::Idle;
    clock_.stop();
    exitDone_ = nullptr;

    offsetX_ = 0;
    offsetY_ = 0;
    zoom_ = 1;

    setHeightLimit(kNoLimit);
    host_->setOpacity(restingOpacity);
    host_->setClip(restClip_);

    applyTransform();
}

void NativeMotion::setStateScale(qreal value)
{
    if (value == stateTarget_)
        return;

    stateTarget_ = value;

    if (mode_ != Mode::Idle) {
        stateScale_ = value;
        applyTransform();

        return;
    }

    press_.stop();
    press_.setDuration(qMin(duration_, 120));
    press_.setStartValue(stateScale_);
    press_.setEndValue(value);
    press_.start();
}

} // namespace pulsar
