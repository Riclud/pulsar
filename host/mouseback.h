#pragma once

#include <QEvent>
#include <QMouseEvent>
#include <QObject>
#include <QWindow>

#include <functional>
#include <utility>

namespace pulsar {

/**
 * The mouse "back" side button does what Android Back does: it raises the app's `back-pressed`
 * event. One filter on the application sees every window; the whole press/release/double-click
 * sequence is consumed so the button never clicks anything underneath.
 */
class MouseBackFilter : public QObject {
public:
    MouseBackFilter(std::function<void()> onBack, QObject *parent)
        : QObject(parent)
        , onBack_(std::move(onBack))
    {
        parent->installEventFilter(this);
    }

protected:
    bool eventFilter(QObject *watched, QEvent *event) override
    {
        const auto type = event->type();

        if (type != QEvent::MouseButtonPress && type != QEvent::MouseButtonRelease
            && type != QEvent::MouseButtonDblClick)
            return false;

        if (!qobject_cast<QWindow *>(watched))
            return false;

        if (static_cast<QMouseEvent *>(event)->button() != Qt::BackButton)
            return false;

        if (type == QEvent::MouseButtonPress)
            onBack_();

        return true;
    }

private:
    std::function<void()> onBack_;
};

} // namespace pulsar
