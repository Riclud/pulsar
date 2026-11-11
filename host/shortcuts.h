#pragma once

#include <QHash>
#include <QJsonArray>
#include <QKeySequence>
#include <QObject>
#include <QString>

#include <functional>

class QEvent;
class QKeyEvent;
class QWindow;

namespace pulsar {

/**
 * Window-level keyboard shortcuts the app registers. One filter on the application sees every key
 * press, so a shortcut works wherever the focus is; a plain key does not steal typing from a text field.
 */
class Shortcuts : public QObject {
    Q_OBJECT

public:
    explicit Shortcuts(QObject *parent = nullptr);

    /** Names the window a key press went to, so a shortcut can be limited to one window. */
    void setWindowLabel(std::function<QString(QWindow *)> label) { labelOf_ = std::move(label); }

    /** Replaces the whole list: `[{ id, keys, window?, repeat? }]`. */
    void set(const QJsonArray &shortcuts);

    int count() const { return entries_.size(); }

signals:
    void triggered(int id);

protected:
    bool eventFilter(QObject *watched, QEvent *event) override;

private:
    struct Entry {
        int id = 0;
        QKeyCombination combination;
        QString window;
        bool repeat = false;
    };

    bool typingInto(QWindow *window, const QKeyEvent *event) const;

    QList<Entry> entries_;
    std::function<QString(QWindow *)> labelOf_;
};

} // namespace pulsar
