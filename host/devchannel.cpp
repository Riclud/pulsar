#include "devchannel.h"

#include "perf_recorder.h"

#include <QBuffer>
#include <QCoreApplication>
#include <QHash>
#include <QKeyEvent>
#include <QKeySequence>
#include <QMetaMethod>
#include <QMouseEvent>
#include <QWheelEvent>
#include <QDateTime>
#include <QDragEnterEvent>
#include <QDropEvent>
#include <QMimeData>
#include <QUrl>
#include <QGuiApplication>
#include <QImage>
#include <QJsonDocument>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QQuickWindow>
#include <QVariantMap>
#include <QWindow>

namespace {

constexpr int kClickHoldMs = 50;

constexpr int RETRY_MS = 1000;
constexpr int POLL_TIMEOUT_MS = 30000;
constexpr int MAX_PENDING_LOGS = 200;

QUrl baseUrl(const QUrl &base)
{
    QUrl url = base;

    if (!url.path().endsWith(QLatin1Char('/')))
        url.setPath(url.path() + QLatin1Char('/'));

    url.setQuery(QString());
    url.setFragment(QString());

    return url;
}

QString nodeText(const QJsonObject &node)
{
    const QJsonObject props = node.value(QStringLiteral("props")).toObject();

    for (const char *key : { "text", "title", "placeholder", "label", "value", "a11yLabel" }) {
        const QJsonValue value = props.value(QLatin1String(key));

        if (value.isString() && !value.toString().isEmpty())
            return value.toString();
    }

    return {};
}

bool hasEvent(const QJsonObject &node, const QString &event)
{
    for (const QJsonValue &value : node.value(QStringLiteral("events")).toArray()) {
        if (value.toString() == event)
            return true;
    }

    return false;
}

QNetworkRequest jsonRequest(const QUrl &url)
{
    QNetworkRequest request(url);

    request.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));
    request.setAttribute(QNetworkRequest::CacheLoadControlAttribute, QNetworkRequest::AlwaysNetwork);
    request.setAttribute(QNetworkRequest::CacheSaveControlAttribute, false);

    return request;
}

} // namespace

DevChannel::DevChannel(DevHooks hooks, const QUrl &url, QObject *parent)
    : QObject(parent)
    , base_(baseUrl(url))
    , hooks_(std::move(hooks))
{
    retry_.setSingleShot(true);
    retry_.setInterval(RETRY_MS);

    QObject::connect(&retry_, &QTimer::timeout, this, &DevChannel::poll);
}

void DevChannel::start()
{
    hello();
}

void DevChannel::hello()
{
    QJsonObject body;

    body.insert(QStringLiteral("name"), QStringLiteral("pulsar"));
    body.insert(QStringLiteral("pid"), int(QCoreApplication::applicationPid()));

    QNetworkReply *reply = network_.post(jsonRequest(base_.resolved(QUrl(QStringLiteral("__dev/hello")))), 
                                         QJsonDocument(body).toJson(QJsonDocument::Compact));

    QObject::connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        poll();
    });
}

void DevChannel::poll()
{
    if (polling_)
        return;

    polling_ = true;

    QNetworkRequest request(base_.resolved(QUrl(QStringLiteral("__dev/events"))));

    request.setAttribute(QNetworkRequest::CacheLoadControlAttribute, QNetworkRequest::AlwaysNetwork);
    request.setAttribute(QNetworkRequest::CacheSaveControlAttribute, false);

    QNetworkReply *reply = network_.get(request);
    auto *timeout = new QTimer(reply);

    timeout->setSingleShot(true);

    QObject::connect(timeout, &QTimer::timeout, reply, &QNetworkReply::abort);
    QObject::connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        polling_ = false;
        onPoll(reply);
        reply->deleteLater();
    });

    timeout->start(POLL_TIMEOUT_MS);
}

void DevChannel::onPoll(QNetworkReply *reply)
{
    if (reply->error() != QNetworkReply::NoError) {
        retry_.start();
        return;
    }

    QJsonParseError error;
    const QJsonDocument document = QJsonDocument::fromJson(reply->readAll(), &error);

    if (error.error != QJsonParseError::NoError || !document.isObject()) {
        retry_.start();
        return;
    }

    if (!connected_) {
        connected_ = true;

        for (const QJsonObject &log : pendingLogs_)
            post(QStringLiteral("__dev/log"), log);

        pendingLogs_.clear();
    }

    for (const QJsonValue &value : document.object().value(QStringLiteral("commands")).toArray())
        handle(value.toObject());

    poll();
}

void DevChannel::post(const QString &path, const QJsonObject &body)
{
    QNetworkReply *reply = network_.post(jsonRequest(base_.resolved(QUrl(path))),
                                         QJsonDocument(body).toJson(QJsonDocument::Compact));

    QObject::connect(reply, &QNetworkReply::finished, reply, &QNetworkReply::deleteLater);
}

void DevChannel::sendLog(const QString &level, const QString &message, const QString &source)
{
    QJsonObject log;

    log.insert(QStringLiteral("type"), QStringLiteral("log"));
    log.insert(QStringLiteral("level"), level);
    log.insert(QStringLiteral("message"), message);
    log.insert(QStringLiteral("source"), source);
    log.insert(QStringLiteral("ts"), double(QDateTime::currentMSecsSinceEpoch()));

    if (connected_) {
        post(QStringLiteral("__dev/log"), log);
        return;
    }

    if (pendingLogs_.size() >= MAX_PENDING_LOGS)
        pendingLogs_.removeFirst();

    pendingLogs_.append(log);
}

QJsonArray DevChannel::currentTree() const
{
    return hooks_.tree ? hooks_.tree() : QJsonArray();
}

void DevChannel::requestReload()
{
    post(QStringLiteral("__dev/reload"), QJsonObject());
}

void DevChannel::reply(const QJsonValue &id, bool ok, const QJsonValue &value)
{
    QJsonObject out;

    out.insert(QStringLiteral("type"), QStringLiteral("reply"));
    out.insert(QStringLiteral("id"), id);
    out.insert(QStringLiteral("ok"), ok);
    out.insert(QStringLiteral("value"), value);

    post(QStringLiteral("__dev/reply"), out);
}

void DevChannel::handle(const QJsonObject &command)
{
    const QJsonValue request = command.value(QStringLiteral("request"));
    const QString name = command.value(QStringLiteral("cmd")).toString();
    const double ts = command.value(QStringLiteral("ts")).toDouble();

    if (ts > 0 && QDateTime::currentMSecsSinceEpoch() - ts > 3000) {
        reply(request, false, QStringLiteral("stale command"));
        return;
    }

    if (name == QLatin1String("ping")) {
        reply(request, true, QStringLiteral("pong"));
        return;
    }

    if (name == QLatin1String("tree")) {
        reply(request, true, currentTree());
        return;
    }

    if (name == QLatin1String("state")) {
        reply(request, true, hooks_.store ? hooks_.store() : QJsonObject());
        return;
    }

    if (name == QLatin1String("reload")) {
        if (hooks_.reload)
            hooks_.reload();

        reply(request, bool(hooks_.reload), true);
        return;
    }

    if (name == QLatin1String("back")) {
        if (hooks_.appEvent)
            hooks_.appEvent(QStringLiteral("back-pressed"));

        reply(request, true, true);
        return;
    }

    if (name == QLatin1String("pointer")) {
        handlePointer(request, command);
        return;
    }

    if (name == QLatin1String("wheel")) {
        handleWheel(request, command);
        return;
    }

    if (name == QLatin1String("perf")) {
        handlePerf(request, command);
        return;
    }

    if (name == QLatin1String("key")) {
        handleKey(request, command);
        return;
    }

    if (name == QLatin1String("keys")) {
        handleKeys(request, command);
        return;
    }

    if (name == QLatin1String("drop")) {
        handleDrop(request, command);
        return;
    }

    if (name == QLatin1String("grab")) {
        const QJsonObject image = grabWindow();

        reply(request, !image.isEmpty(), image);
        return;
    }

    if (name == QLatin1String("eval")) {
        if (!hooks_.evaluate) {
            reply(request, false, QStringLiteral("eval needs the QuickJS engine"));
            return;
        }

        const QJsonObject result = hooks_.evaluate(command.value(QStringLiteral("code")).toString());

        if (result.contains(QStringLiteral("error"))) {
            QString text = result.value(QStringLiteral("error")).toString();
            const QString stack = result.value(QStringLiteral("stack")).toString();

            if (!stack.isEmpty())
                text += QLatin1Char('\n') + stack;

            reply(request, false, text);
            return;
        }

        reply(request, true, result.value(QStringLiteral("value")));
        return;
    }

    if (name == QLatin1String("show-error")) {
        if (hooks_.showError)
            hooks_.showError(command.value(QStringLiteral("text")).toString());

        reply(request, true, true);
        return;
    }

    if (name != QLatin1String("tap") && name != QLatin1String("type") && name != QLatin1String("toggle")
        && name != QLatin1String("select")) {
        reply(request, false, QStringLiteral("unknown command: %1").arg(name));
        return;
    }

    QJsonObject selector = command;

    if (name == QLatin1String("type") && !selector.contains(QStringLiteral("event")))
        selector.insert(QStringLiteral("event"), QStringLiteral("input"));
    else if (name == QLatin1String("toggle") && !selector.contains(QStringLiteral("event")))
        selector.insert(QStringLiteral("event"), QStringLiteral("toggle"));
    else if (name == QLatin1String("select") && !selector.contains(QStringLiteral("event")))
        selector.insert(QStringLiteral("event"), QStringLiteral("change"));

    QString event;
    const QJsonObject node = resolveNode(selector, &event);

    if (node.isEmpty() || event.isEmpty()) {
        reply(request, false, QStringLiteral("node not found"));
        return;
    }

    QJsonValue value = command.value(QStringLiteral("value"));

    if (name == QLatin1String("toggle") && value.isUndefined())
        value = true;

    dispatch(node, event, value);

    QJsonObject result;

    result.insert(QStringLiteral("id"), node.value(QStringLiteral("id")));
    result.insert(QStringLiteral("path"), node.value(QStringLiteral("path")));
    result.insert(QStringLiteral("type"), node.value(QStringLiteral("type")));
    result.insert(QStringLiteral("text"), nodeText(node));
    result.insert(QStringLiteral("event"), event);

    reply(request, true, result);
}

void DevChannel::dispatch(const QJsonObject &node, const QString &event, const QJsonValue &value)
{
    QJsonObject data;

    data.insert(QStringLiteral("target"), QStringLiteral("main"));
    data.insert(QStringLiteral("path"), node.value(QStringLiteral("path")));
    data.insert(QStringLiteral("id"), node.value(QStringLiteral("id")));
    data.insert(QStringLiteral("event"), event);

    if (!value.isUndefined())
        data.insert(QStringLiteral("value"), value);

    QJsonObject params;

    params.insert(QStringLiteral("name"), QStringLiteral("ui-event"));
    params.insert(QStringLiteral("data"), data);

    if (hooks_.notifyRuntime)
        hooks_.notifyRuntime(QStringLiteral("__event"), params);
}

QJsonObject DevChannel::resolveNode(const QJsonObject &command, QString *event) const
{
    bool found = false;
    QJsonObject node = findNode(currentTree(), command, event, &found);

    if (found && !event->isEmpty())
        return node;

    return {};
}

QJsonObject DevChannel::findNode(const QJsonArray &nodes, const QJsonObject &command, QString *event, bool *found) const
{
    for (const QJsonValue &value : nodes) {
        const QJsonObject node = value.toObject();
        const QJsonObject props = node.value(QStringLiteral("props")).toObject();

        if (!props.value(QStringLiteral("visible")).toBool(true) || !props.value(QStringLiteral("open")).toBool(true))
            continue;

        if (matches(node, command)) {
            const QString candidate = command.value(QStringLiteral("event")).toString().isEmpty()
                                          ? defaultEvent(node)
                                          : command.value(QStringLiteral("event")).toString();

            if (!candidate.isEmpty() && hasEvent(node, candidate)) {
                *event = candidate;
                *found = true;

                return node;
            }
        }

        const QJsonObject child = findNode(node.value(QStringLiteral("children")).toArray(), command, event, found);

        if (*found)
            return child;
    }

    return {};
}

bool DevChannel::matches(const QJsonObject &node, const QJsonObject &command) const
{
    if (command.contains(QStringLiteral("id")))
        return node.value(QStringLiteral("id")).toInt() == command.value(QStringLiteral("id")).toInt();

    if (command.contains(QStringLiteral("path")))
        return node.value(QStringLiteral("path")).toString() == command.value(QStringLiteral("path")).toString();

    if (command.contains(QStringLiteral("type")))
        return node.value(QStringLiteral("type")).toString() == command.value(QStringLiteral("type")).toString();

    const QString text = command.value(QStringLiteral("text")).toString().isEmpty()
                             ? command.value(QStringLiteral("into")).toString()
                             : command.value(QStringLiteral("text")).toString();

    if (text.isEmpty())
        return true;

    return nodeText(node).contains(text, Qt::CaseInsensitive);
}

QString DevChannel::defaultEvent(const QJsonObject &node) const
{
    for (const char *event : { "click", "toggle", "change", "input" }) {
        if (hasEvent(node, QLatin1String(event)))
            return QLatin1String(event);
    }

    const QJsonArray events = node.value(QStringLiteral("events")).toArray();

    return events.isEmpty() ? QString() : events.first().toString();
}

QJsonObject DevChannel::grabWindow() const
{
    QQuickWindow *window = nullptr;

    for (QWindow *candidate : QGuiApplication::allWindows()) {
        if (auto *quick = qobject_cast<QQuickWindow *>(candidate)) {
            window = quick;
            break;
        }
    }

    if (!window)
        return {};

    const QImage image = window->grabWindow();

    if (image.isNull())
        return {};

    QByteArray png;
    QBuffer buffer(&png);

    if (!buffer.open(QIODevice::WriteOnly) || !image.save(&buffer, "PNG"))
        return {};

    QJsonObject out;

    out.insert(QStringLiteral("format"), QStringLiteral("png"));
    out.insert(QStringLiteral("width"), image.width());
    out.insert(QStringLiteral("height"), image.height());
    out.insert(QStringLiteral("data"), QString::fromLatin1(png.toBase64()));

    return out;
}

// PulsarView is the window itself, so the window carries devItemRect.
QQuickWindow *DevChannel::findView() const
{
    for (QWindow *candidate : QGuiApplication::allWindows()) {
        auto *window = qobject_cast<QQuickWindow *>(candidate);

        if (!window || !window->isVisible())
            continue;

        const QMetaObject *meta = window->metaObject();

        for (int index = meta->methodOffset(); index < meta->methodCount(); index++) {
            if (meta->method(index).name() == "devItemRect")
                return window;
        }
    }

    return nullptr;
}

QJsonObject DevChannel::findAny(const QJsonArray &nodes, const QJsonObject &command, bool *found) const
{
    for (const QJsonValue &value : nodes) {
        const QJsonObject node = value.toObject();
        const QJsonObject props = node.value(QStringLiteral("props")).toObject();

        if (!props.value(QStringLiteral("visible")).toBool(true) || !props.value(QStringLiteral("open")).toBool(true))
            continue;

        if (matches(node, command) && !node.value(QStringLiteral("path")).toString().isEmpty()) {
            *found = true;

            return node;
        }

        const QJsonObject child = findAny(node.value(QStringLiteral("children")).toArray(), command, found);

        if (*found)
            return child;
    }

    return {};
}

// A command names a node (text, path or id) or gives window coordinates in x and y.
bool DevChannel::nodeCenter(const QJsonObject &command, QPointF *point, QJsonObject *node) const
{
    if (command.contains(QStringLiteral("x")) && command.contains(QStringLiteral("y"))) {
        *point = QPointF(command.value(QStringLiteral("x")).toDouble(), command.value(QStringLiteral("y")).toDouble());

        return true;
    }

    bool found = false;

    *node = findAny(currentTree(), command, &found);

    QQuickWindow *view = findView();

    if (!found || !view)
        return false;

    QVariant rect;

    QMetaObject::invokeMethod(view, "devItemRect", Q_RETURN_ARG(QVariant, rect),
                              Q_ARG(QVariant, node->value(QStringLiteral("path")).toString()));

    const QVariantMap box = rect.toMap();

    if (box.isEmpty())
        return false;

    *point = QPointF(box.value(QStringLiteral("x")).toDouble() + box.value(QStringLiteral("width")).toDouble() / 2,
                     box.value(QStringLiteral("y")).toDouble() + box.value(QStringLiteral("height")).toDouble() / 2);

    return true;
}

void DevChannel::sendMouse(QQuickWindow *window, QEvent::Type type, const QPointF &point, Qt::MouseButton button)
{
    if (type == QEvent::MouseButtonPress)
        buttons_ |= button;

    if (type == QEvent::MouseButtonRelease)
        buttons_ &= ~button;

    QMouseEvent event(type, point, point, window->mapToGlobal(point), button, buttons_, Qt::NoModifier);

    // Pointer handlers measure taps and holds from this; a synthetic event has none of its own.
    event.setTimestamp(quint64(QDateTime::currentMSecsSinceEpoch()));

    QCoreApplication::sendEvent(window, &event);
}

void DevChannel::handlePointer(const QJsonValue &request, const QJsonObject &command)
{
    QQuickWindow *view = findView();
    QPointF point;
    QJsonObject node;

    if (!view) {
        reply(request, false, QStringLiteral("no window"));
        return;
    }

    if (!nodeCenter(command, &point, &node)) {
        reply(request, false, QStringLiteral("node not found"));
        return;
    }

    QQuickWindow *window = view;
    const QString action = command.value(QStringLiteral("action")).toString(QStringLiteral("click"));
    const Qt::MouseButton button = command.value(QStringLiteral("button")).toString() == QLatin1String("right")
                                       ? Qt::RightButton
                                       : Qt::LeftButton;

    if (action == QLatin1String("leave")) {
        QEvent leave(QEvent::Leave);

        QCoreApplication::sendEvent(window, &leave);
    } else {
        sendMouse(window, QEvent::MouseMove, point, Qt::NoButton);
    }

    if (action == QLatin1String("click") || action == QLatin1String("press"))
        sendMouse(window, QEvent::MouseButtonPress, point, button);

    QJsonObject result;

    result.insert(QStringLiteral("x"), point.x());
    result.insert(QStringLiteral("y"), point.y());
    result.insert(QStringLiteral("path"), node.value(QStringLiteral("path")));
    result.insert(QStringLiteral("text"), nodeText(node));

    if (action == QLatin1String("release"))
        sendMouse(window, QEvent::MouseButtonRelease, point, button);

    if (action != QLatin1String("click")) {
        reply(request, true, result);
        return;
    }

    // Pointer handlers need the button held across event loop turns, as with a real click.
    QTimer::singleShot(kClickHoldMs, this, [this, window, point, button, request, result]() {
        sendMouse(window, QEvent::MouseButtonRelease, point, button);
        reply(request, true, result);
    });
}

void DevChannel::handlePerf(const QJsonValue &request, const QJsonObject &command)
{
    QQuickWindow *view = findView();

    if (!view) {
        reply(request, false, QStringLiteral("no window"));
        return;
    }

    const auto resolve = [this](const QJsonObject &target, QPointF *point) {
        QJsonObject node;

        return nodeCenter(target, point, &node);
    };

    const auto done = [this, request](const QJsonObject &report) {
        reply(request, true, report);
    };

    const auto send = [this](const QJsonObject &step) {
        bool found = false;
        const QJsonObject node = findAny(currentTree(), step, &found);

        if (found)
            dispatch(node, step.value(QStringLiteral("event")).toString(QStringLiteral("click")), QJsonValue());

        return found;
    };

    auto *recorder = new pulsar::PerfRecorder(view, command.value(QStringLiteral("steps")).toArray(), resolve, send, done, this);

    recorder->start();
}

void DevChannel::handleWheel(const QJsonValue &request, const QJsonObject &command)
{
    QQuickWindow *view = findView();
    QPointF point;
    QJsonObject node;

    if (!view || !nodeCenter(command, &point, &node)) {
        reply(request, false, QStringLiteral("node not found"));
        return;
    }

    // Positive dy scrolls the content down, like turning a wheel towards you.
    const int dy = command.value(QStringLiteral("dy")).toInt(120);
    const int dx = command.value(QStringLiteral("dx")).toInt(0);
    QQuickWindow *window = view;

    sendMouse(window, QEvent::MouseMove, point, Qt::NoButton);

    QWheelEvent event(point, window->mapToGlobal(point), QPoint(), QPoint(-dx, -dy), buttons_, Qt::NoModifier,
                      Qt::NoScrollPhase, false);

    QCoreApplication::sendEvent(window, &event);
    reply(request, true, true);
}

namespace {

int keyCode(const QString &name)
{
    static const QHash<QString, int> keys = {
        { QStringLiteral("enter"), Qt::Key_Return },
        { QStringLiteral("return"), Qt::Key_Return },
        { QStringLiteral("tab"), Qt::Key_Tab },
        { QStringLiteral("escape"), Qt::Key_Escape },
        { QStringLiteral("backspace"), Qt::Key_Backspace },
        { QStringLiteral("delete"), Qt::Key_Delete },
        { QStringLiteral("space"), Qt::Key_Space },
        { QStringLiteral("up"), Qt::Key_Up },
        { QStringLiteral("down"), Qt::Key_Down },
        { QStringLiteral("left"), Qt::Key_Left },
        { QStringLiteral("right"), Qt::Key_Right },
        { QStringLiteral("home"), Qt::Key_Home },
        { QStringLiteral("end"), Qt::Key_End },
        { QStringLiteral("pageup"), Qt::Key_PageUp },
        { QStringLiteral("pagedown"), Qt::Key_PageDown },
    };

    const QString lower = name.toLower();

    if (keys.contains(lower))
        return keys.value(lower);

    return lower.size() == 1 ? QKeySequence(lower.toUpper())[0].key() : 0;
}

Qt::KeyboardModifiers modifiersOf(const QJsonArray &names)
{
    Qt::KeyboardModifiers modifiers;

    for (const QJsonValue &value : names) {
        const QString name = value.toString().toLower();

        if (name == QLatin1String("ctrl"))
            modifiers |= Qt::ControlModifier;
        else if (name == QLatin1String("shift"))
            modifiers |= Qt::ShiftModifier;
        else if (name == QLatin1String("alt"))
            modifiers |= Qt::AltModifier;
        else if (name == QLatin1String("meta"))
            modifiers |= Qt::MetaModifier;
    }

    return modifiers;
}

void sendKey(QWindow *window, int key, Qt::KeyboardModifiers modifiers, const QString &text)
{
    QKeyEvent press(QEvent::KeyPress, key, modifiers, text);
    QKeyEvent release(QEvent::KeyRelease, key, modifiers, text);

    QCoreApplication::sendEvent(window, &press);
    QCoreApplication::sendEvent(window, &release);
}

} // namespace

void DevChannel::handleKey(const QJsonValue &request, const QJsonObject &command)
{
    QQuickWindow *view = findView();
    const QString name = command.value(QStringLiteral("key")).toString();
    const int key = keyCode(name);

    if (!view) {
        reply(request, false, QStringLiteral("no window"));
        return;
    }

    if (key == 0) {
        reply(request, false, QStringLiteral("unknown key: %1").arg(name));
        return;
    }

    const Qt::KeyboardModifiers modifiers = modifiersOf(command.value(QStringLiteral("modifiers")).toArray());
    const QString text = key == Qt::Key_Return ? QStringLiteral("\r")
                         : key == Qt::Key_Space && !modifiers ? QStringLiteral(" ")
                                                               : QString();

    sendKey(view, key, modifiers, text);
    reply(request, true, true);
}

// Drops files on the window the way a file manager would: a drag enters, then it is released.
void DevChannel::handleDrop(const QJsonValue &request, const QJsonObject &command)
{
    QQuickWindow *view = findView();

    if (!view) {
        reply(request, false, QStringLiteral("no window"));
        return;
    }

    QList<QUrl> urls;

    for (const QJsonValue &file : command.value(QStringLiteral("files")).toArray())
        urls.append(QUrl::fromLocalFile(file.toString()));

    QMimeData data;

    data.setUrls(urls);

    const QPointF point(command.value(QStringLiteral("x")).toDouble(), command.value(QStringLiteral("y")).toDouble());

    QDragEnterEvent enter(point.toPoint(), Qt::CopyAction, &data, Qt::LeftButton, Qt::NoModifier);

    QCoreApplication::sendEvent(view, &enter);

    QDropEvent drop(point, Qt::CopyAction, &data, Qt::LeftButton, Qt::NoModifier);

    QCoreApplication::sendEvent(view, &drop);
    reply(request, true, drop.isAccepted());
}

void DevChannel::handleKeys(const QJsonValue &request, const QJsonObject &command)
{
    QQuickWindow *view = findView();

    if (!view) {
        reply(request, false, QStringLiteral("no window"));
        return;
    }

    // Typed one key at a time into whatever has focus, as a keyboard would.
    for (const QChar character : command.value(QStringLiteral("text")).toString())
        sendKey(view, 0, Qt::NoModifier, QString(character));

    reply(request, true, true);
}
