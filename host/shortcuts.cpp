#include "shortcuts.h"

#include <QGuiApplication>
#include <QJsonObject>
#include <QKeyEvent>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtDebug>

namespace pulsar {

namespace {

// The modifiers a shortcut can name; keypad and group-switch state must not change a match.
constexpr Qt::KeyboardModifiers kModifiers = Qt::ShiftModifier | Qt::ControlModifier | Qt::AltModifier | Qt::MetaModifier;

bool debugging()
{
    static const bool enabled = qEnvironmentVariableIsSet("PULSAR_DEBUG");

    return enabled;
}

} // namespace

Shortcuts::Shortcuts(QObject *parent)
    : QObject(parent)
{
    qApp->installEventFilter(this);
}

void Shortcuts::set(const QJsonArray &shortcuts)
{
    entries_.clear();

    for (const QJsonValue &value : shortcuts) {
        const QJsonObject object = value.toObject();
        const QKeySequence sequence = QKeySequence::fromString(object.value(QLatin1String("keys")).toString(), QKeySequence::PortableText);

        // One key press with modifiers; chords of several presses are not supported.
        if (sequence.isEmpty() || sequence.count() != 1) {
            qWarning().noquote() << "pulsar: ignoring shortcut" << object.value(QLatin1String("keys")).toString();

            continue;
        }

        entries_.append({ object.value(QLatin1String("id")).toInt(), sequence[0], object.value(QLatin1String("window")).toString(),
                          object.value(QLatin1String("repeat")).toBool() });
    }

    if (debugging())
        qInfo().noquote() << "PulsarView shortcuts" << entries_.size();
}

// A bare key goes to the field being typed in; a shortcut with Ctrl, Alt or Meta, or a function key, does not.
bool Shortcuts::typingInto(QWindow *window, const QKeyEvent *event) const
{
    const int key = event->key();

    if (event->modifiers() & (Qt::ControlModifier | Qt::AltModifier | Qt::MetaModifier))
        return false;

    if ((key >= Qt::Key_F1 && key <= Qt::Key_F35) || key == Qt::Key_Escape)
        return false;

    const auto *quick = qobject_cast<QQuickWindow *>(window);
    const QQuickItem *focused = quick ? quick->activeFocusItem() : nullptr;

    return focused && (focused->flags() & QQuickItem::ItemAcceptsInputMethod);
}

bool Shortcuts::eventFilter(QObject *watched, QEvent *event)
{
    if (event->type() != QEvent::KeyPress || entries_.isEmpty())
        return false;

    auto *window = qobject_cast<QWindow *>(watched);

    if (!window)
        return false;

    const auto *press = static_cast<QKeyEvent *>(event);
    const QKeyCombination pressed(press->modifiers() & kModifiers, Qt::Key(press->key()));

    for (const Entry &entry : std::as_const(entries_)) {
        if (entry.combination != pressed)
            continue;

        if (!entry.window.isEmpty() && labelOf_ && labelOf_(window) != entry.window)
            continue;

        if (press->isAutoRepeat() && !entry.repeat)
            return true;

        if (typingInto(window, press))
            return false;

        if (debugging())
            qInfo().noquote() << "PulsarView shortcut" << entry.id;

        Q_EMIT triggered(entry.id);

        return true;
    }

    return false;
}

} // namespace pulsar
