#include "inertia.h"

#include <QCoreApplication>
#include <QDateTime>
#include <QMatrix4x4>
#include <QMetaProperty>
#include <QMouseEvent>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickTransform>
#include <QTimer>
#include <QWheelEvent>
#include <QtDebug>

#include <algorithm>
#include <cmath>

namespace pulsar {

namespace {

bool debugging()
{
    static const bool enabled = qEnvironmentVariableIsSet("PULSAR_DEBUG");

    return enabled;
}

// What Math.round gives in JS: halves go up.
qint64 jsRound(qreal value)
{
    return qint64(std::floor(value + 0.5));
}

void registerTypes()
{
    qmlRegisterType<Inertia>("Pulsar.Native", 1, 0, "Inertia");
}

} // namespace

Q_COREAPP_STARTUP_FUNCTION(registerTypes)

FrameClock::FrameClock(QQmlEngine *engine, QObject *parent)
    : QObject(parent)
{
    QQmlComponent component(engine);

    component.setData("import QtQuick; FrameAnimation {}", QUrl());

    animation_ = component.create();

    if (!animation_) {
        qWarning().noquote() << "pulsar:" << component.errorString();

        return;
    }

    animation_->setParent(this);

    connect(animation_, SIGNAL(triggered()), this, SLOT(fire()));
    connect(animation_, SIGNAL(runningChanged()), this, SIGNAL(runningChanged()));
}

bool FrameClock::running() const
{
    return animation_ && animation_->property("running").toBool();
}

void FrameClock::begin()
{
    if (animation_ && !running())
        QMetaObject::invokeMethod(animation_, "start");
}

void FrameClock::end()
{
    if (animation_ && running())
        QMetaObject::invokeMethod(animation_, "stop");
}

void FrameClock::restart()
{
    if (animation_)
        QMetaObject::invokeMethod(animation_, "restart");
}

void FrameClock::fire()
{
    if (tick_)
        tick_(animation_->property("frameTime").toReal(), animation_->property("elapsedTime").toReal());
}

/**
 * Scales the content from its pulled edge and shifts it by the overshoot, as the QML Scale and
 * Translate did. Qt asks for the matrix every time it maps a point through the content item, which
 * is thousands of times per wheel event, so the numbers are worked out once per change.
 */
class Stretch : public QQuickTransform {
public:
    explicit Stretch(Inertia *owner)
        : QQuickTransform(owner)
        , owner_(owner)
    {
    }

    void refresh()
    {
        QQuickItem *flick = owner_->flick();

        if (!flick)
            return;

        const qreal height = qMax<qreal>(1, flick->height());
        const qreal originY = flick->property("originY").toReal();

        scale_ = 1 + 0.1 * (1 - std::exp(-owner_->pull() / (height * 0.4)));
        origin_ = owner_->pullsTop() ? originY : originY + flick->property("contentHeight").toReal();
        shift_ = flick->property("verticalOvershoot").toReal();

        update();
    }

    void applyTo(QMatrix4x4 *matrix) const override
    {
        matrix->translate(0, float(origin_));
        matrix->scale(1, float(scale_));
        matrix->translate(0, float(-origin_));
        matrix->translate(0, float(shift_));
    }

private:
    Inertia *owner_;
    qreal scale_ = 1;
    qreal origin_ = 0;
    qreal shift_ = 0;
};

Inertia::Inertia(QQuickItem *parent)
    : QQuickItem(parent)
{
    setZ(1);
    setAcceptedMouseButtons(Qt::NoButton);

    absorbing_ = new QSequentialAnimationGroup(this);
    absorbPeak_ = new QPropertyAnimation(this, "impulse", this);

    absorbPeak_->setDuration(90);
    absorbPeak_->setEasingCurve(QEasingCurve::OutQuad);

    auto *settle = new QPropertyAnimation(this, "impulse", this);

    settle->setEndValue(0.0);
    settle->setDuration(420);
    settle->setEasingCurve(QEasingCurve::OutCubic);

    absorbing_->addAnimation(absorbPeak_);
    absorbing_->addAnimation(settle);
}

Inertia::~Inertia()
{
    if (scrolling_)
        note(false);
}

void Inertia::setRenderer(QObject *renderer)
{
    if (renderer_ == renderer)
        return;

    renderer_ = renderer;

    Q_EMIT rendererChanged();
}

void Inertia::setFlick(QQuickItem *flick)
{
    if (flick_ == flick)
        return;

    flick_ = flick;

    Q_EMIT flickChanged();

    if (!flick)
        return;

    setParentItem(flick);
    followFlick();

    connect(flick, &QQuickItem::widthChanged, this, &Inertia::followFlick);
    connect(flick, &QQuickItem::heightChanged, this, &Inertia::followFlick);
    connect(flick, SIGNAL(contentYChanged()), this, SLOT(contentYChanged()));
    connect(flick, SIGNAL(draggingVerticallyChanged()), this, SLOT(draggingChanged()));
    connect(flick, SIGNAL(flickStarted()), this, SLOT(flickStarted()));
    connect(flick, SIGNAL(movingChanged()), this, SLOT(movingChanged()));
}

void Inertia::setStretch(bool stretch)
{
    if (stretch_ == stretch)
        return;

    stretch_ = stretch;

    Q_EMIT stretchChanged();
}

void Inertia::setImpulse(qreal impulse)
{
    if (qFuzzyCompare(impulse_, impulse))
        return;

    impulse_ = impulse;

    Q_EMIT impulseChanged();

    if (transform_)
        transform_->refresh();
}

qreal Inertia::pull() const
{
    return std::abs(flickReal("verticalOvershoot")) + impulse_;
}

bool Inertia::pullsTop() const
{
    const qreal overshoot = flickReal("verticalOvershoot");

    return overshoot < 0 || (overshoot == 0 && edge_ < 0);
}

void Inertia::componentComplete()
{
    QQuickItem::componentComplete();

    frames_ = new FrameClock(qmlEngine(this), this);
    wheeling_ = new FrameClock(qmlEngine(this), this);

    frames_->setTick([this](qreal, qreal elapsed) { step(elapsed); });
    wheeling_->setTick([this](qreal frameTime, qreal) { spring(frameTime); });

    connect(frames_, &FrameClock::runningChanged, this, &Inertia::refreshScrolling);
    connect(wheeling_, &FrameClock::runningChanged, this, &Inertia::refreshScrolling);

    if (!stretch_ || !flick_)
        return;

    QQuickItem *content = flick_->property("contentItem").value<QQuickItem *>();

    transform_ = new Stretch(this);
    transform_->refresh();
    transform_->appendToItem(content);

    connect(flick_, SIGNAL(verticalOvershootChanged()), this, SLOT(followFlick()));
    connect(flick_, SIGNAL(contentHeightChanged()), this, SLOT(followFlick()));
    connect(flick_, SIGNAL(originYChanged()), this, SLOT(followFlick()));
}

void Inertia::followFlick()
{
    if (flick_)
        setSize(flick_->size());

    if (transform_)
        transform_->refresh();
}

qreal Inertia::flickReal(const char *name) const
{
    return flick_ ? flick_->property(name).toReal() : 0;
}

void Inertia::setContentY(qreal value)
{
    flick_->setProperty("contentY", value);
}

qreal Inertia::minY() const
{
    return flickReal("originY") - flickReal("topMargin");
}

qreal Inertia::maxY() const
{
    return std::max(minY(), flickReal("originY") + flickReal("contentHeight") + flickReal("bottomMargin") - flick_->height());
}

void Inertia::scrollTo(qreal y, bool animated)
{
    if (!flick_ || !frames_)
        return;

    QMetaObject::invokeMethod(flick_, "cancelFlick");
    frames_->end();
    wheeling_->end();
    absorbing_->stop();

    followEnd_ = false;

    const qreal target = std::max(minY(), std::min(maxY(), y));

    if (!animated) {
        setContentY(target);

        if (debugging())
            qInfo().noquote() << QStringLiteral("PulsarView scrolled %1").arg(jsRound(target));

        return;
    }

    target_ = target;
    velocity_ = 0;
    stiffness_ = 18;

    wheeling_->begin();
}

void Inertia::scrollToEnd(bool animated)
{
    scrollTo(maxY(), animated);

    if (!flick_)
        return;

    // The rows added just before the command have no height until the next layout pass.
    if (animated) {
        followEnd_ = true;

        return;
    }

    QTimer::singleShot(0, this, [this]() {
        if (flick_ && !wheeling_->running())
            setContentY(maxY());
    });
}

void Inertia::note(bool active)
{
    if (!renderer_ || QCoreApplication::closingDown())
        return;

    QMetaObject::invokeMethod(renderer_, "noteScrolling", Q_ARG(QVariant, active));
}

void Inertia::refreshScrolling()
{
    if (!frames_)
        return;

    refreshPointer();

    const bool moving = flick_ && flick_->property("moving").toBool();
    const bool next = frames_->running() || wheeling_->running() || moving;

    if (next == scrolling_)
        return;

    scrolling_ = next;
    note(next);
}

// The overlay takes presses only while something moves or is held, so idle rows stay clickable.
void Inertia::refreshPointer()
{
    const bool busy = frames_->running() || wheeling_->running() || pressed_;

    setAcceptedMouseButtons(busy ? Qt::LeftButton : Qt::NoButton);
}

void Inertia::movingChanged()
{
    refreshScrolling();
}

void Inertia::mousePressEvent(QMouseEvent *event)
{
    pressed_ = true;

    frames_->end();
    wheeling_->end();
    refreshScrolling();

    event->accept();
}

void Inertia::mouseReleaseEvent(QMouseEvent *event)
{
    pressed_ = false;

    refreshPointer();
    event->accept();
}

void Inertia::mouseUngrabEvent()
{
    pressed_ = false;

    refreshPointer();
}

void Inertia::wheelEvent(QWheelEvent *event)
{
    scrollByWheel(event);
}

void Inertia::contentYChanged()
{
    if (flick_ && flick_->property("draggingVertically").toBool())
        addSample();
}

void Inertia::draggingChanged()
{
    if (!flick_ || !flick_->property("draggingVertically").toBool())
        return;

    samples_.clear();
    wheeling_->end();

    if (renderer_) {
        if (QObject *reveal = renderer_->property("revealMotion").value<QObject *>())
            QMetaObject::invokeMethod(reveal, "stop");
    }

    frames_->end();
    absorbing_->stop();
    setImpulse(0);
}

void Inertia::flickStarted()
{
    const qreal velocity = releaseVelocity();

    if (velocity == 0 || flickReal("verticalOvershoot") != 0)
        return;

    QMetaObject::invokeMethod(flick_, "cancelFlick");
    fling(velocity);
}

void Inertia::addSample()
{
    const double now = double(QDateTime::currentMSecsSinceEpoch());

    std::erase_if(samples_, [now](const Sample &sample) { return now - sample.time > 100; });
    samples_.push_back({ now, flickReal("contentY") });
}

// Least squares slope of the position over the last 100ms, in pixels per second.
qreal Inertia::releaseVelocity() const
{
    const double now = double(QDateTime::currentMSecsSinceEpoch());

    std::vector<Sample> recent;

    for (const Sample &sample : samples_) {
        if (now - sample.time <= 100)
            recent.push_back(sample);
    }

    if (recent.size() < 2)
        return 0;

    double meanTime = 0;
    double meanY = 0;

    for (const Sample &sample : recent) {
        meanTime += sample.time / double(recent.size());
        meanY += sample.y / double(recent.size());
    }

    double covariance = 0;
    double variance = 0;

    for (const Sample &sample : recent) {
        covariance += (sample.time - meanTime) * (sample.y - meanY);
        variance += (sample.time - meanTime) * (sample.time - meanTime);
    }

    if (variance == 0)
        return 0;

    return 1000 * covariance / variance;
}

qreal Inertia::curveAt(qreal time)
{
    if (curve_.isEmpty() && renderer_)
        curve_ = renderer_->property("flingCurve").toList();

    if (curve_.size() < 2)
        return time;

    const qreal position = time * qreal(curve_.size() - 1);
    const int index = int(std::min<qreal>(qreal(curve_.size() - 2), std::floor(position)));
    const qreal low = curve_.at(index).toReal();
    const qreal high = curve_.at(index + 1).toReal();

    return low + (high - low) * (position - index);
}

void Inertia::fling(qreal velocity)
{
    const qreal limit = flickReal("maximumFlickVelocity");
    const qreal speed = std::min(std::abs(velocity), limit);

    if (speed < 50)
        return;

    const qreal friction = 0.015 * 9.80665 * 39.37 * 160 * 0.84;
    const qreal deceleration = 2.358;
    const qreal base = std::log(0.35 * speed / friction);

    startY_ = flickReal("contentY");
    duration_ = std::exp(base / (deceleration - 1));
    distance_ = (velocity < 0 ? -1 : 1) * friction * std::exp(deceleration / (deceleration - 1) * base);

    if (debugging())
        qInfo().noquote() << QStringLiteral("PulsarView fling %1 %2 %3 ")
                                 .arg(jsRound(velocity))
                                 .arg(jsRound(distance_))
                                 .arg(duration_, 0, 'f', 2);

    frames_->restart();
}

void Inertia::scrollByWheel(QWheelEvent *event)
{
    if (flickReal("contentHeight") <= flick_->height()) {
        event->ignore();

        return;
    }

    frames_->end();
    followEnd_ = false;

    const bool touchpad = event->pixelDelta().y() != 0;
    const qreal distance = touchpad ? -event->pixelDelta().y() : -event->angleDelta().y();
    const qreal base = wheeling_->running() ? target_ : flickReal("contentY");

    if (!wheeling_->running())
        velocity_ = 0;

    // Both the wheel and the touchpad move a target, and a critically damped spring
    // follows it: velocity stays continuous, so a new tick cannot kick the motion.
    target_ = std::max(minY(), std::min(maxY(), base + distance));
    stiffness_ = touchpad ? 60 : 30;

    wheeling_->begin();
    event->accept();
}

void Inertia::spring(qreal frameTime)
{
    // The exact solution of the spring, so the result does not depend on frame length.
    const qreal elapsed = std::max<qreal>(frameTime, 0.001);

    if (followEnd_)
        target_ = maxY();

    const qreal offset = flickReal("contentY") - target_;
    const qreal decay = std::exp(-stiffness_ * elapsed);
    const qreal carry = (velocity_ + stiffness_ * offset) * elapsed;
    const qreal nextOffset = (offset + carry) * decay;

    velocity_ = (velocity_ - stiffness_ * carry) * decay;

    if (std::abs(nextOffset) < 0.5 && std::abs(velocity_) < 20) {
        setContentY(target_);
        wheeling_->end();
        followEnd_ = false;

        if (debugging())
            qInfo().noquote() << QStringLiteral("PulsarView scrolled %1").arg(jsRound(target_));

        return;
    }

    setContentY(std::max(minY(), std::min(maxY(), target_ + nextOffset)));
}

void Inertia::absorb(qreal velocity)
{
    // 0 is Flickable.StopAtBounds.
    if (!stretch_ || velocity < 0 || flick_->property("boundsBehavior").toInt() == 0)
        return;

    edge_ = 1;

    const qreal peak = std::min<qreal>(320, std::abs(velocity) * 0.06);

    absorbPeak_->setEndValue(peak);

    if (debugging())
        qInfo().noquote() << QStringLiteral("PulsarView absorb %1").arg(jsRound(peak));

    absorbing_->stop();
    absorbing_->start();
}

void Inertia::step(qreal elapsed)
{
    const qreal time = elapsed / duration_;
    const bool done = time >= 1;
    const qreal next = startY_ + distance_ * (done ? 1 : curveAt(time));
    const qreal low = minY();
    const qreal high = maxY();

    if (next >= low && next <= high) {
        setContentY(next);

        if (done)
            frames_->end();

        return;
    }

    const qreal ahead = std::min<qreal>(1, time + 0.01);
    const qreal velocity = distance_ * (curveAt(ahead) - curveAt(time)) / (std::max<qreal>(0.0001, ahead - time) * duration_);

    setContentY(next < low ? low : high);
    frames_->end();
    absorb(velocity);
}

} // namespace pulsar
