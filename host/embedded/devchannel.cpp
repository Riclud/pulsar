#include "devchannel.h"

#include "bridge.h"

#include <QBuffer>
#include <QDateTime>
#include <QGuiApplication>
#include <QImage>
#include <QJsonDocument>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QQmlPropertyMap>
#include <QQuickWindow>
#include <QVariantMap>
#include <QWindow>

namespace {

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

    for (const char *key : { "text", "title", "placeholder", "label", "value" }) {
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

DevChannel::DevChannel(EmbeddedBridge *bridge, QQmlPropertyMap *store, const QUrl &url, QObject *parent)
    : QObject(parent)
    , bridge_(bridge)
    , store_(store)
    , base_(baseUrl(url))
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

void DevChannel::setTree(const QVariantList &tree)
{
    tree_ = QJsonArray::fromVariantList(tree);
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
        reply(request, true, tree_);
        return;
    }

    if (name == QLatin1String("state")) {
        reply(request, true, storeSnapshot());
        return;
    }

    if (name == QLatin1String("reload")) {
        bridge_->devReload();
        reply(request, true, true);
        return;
    }

    if (name == QLatin1String("back")) {
        bridge_->notify(QStringLiteral("back-pressed"), QJsonObject());
        reply(request, true, true);
        return;
    }

    if (name == QLatin1String("grab")) {
        const QJsonObject image = grabWindow();

        reply(request, !image.isEmpty(), image);
        return;
    }

    if (name == QLatin1String("show-error")) {
        bridge_->setErrorText(command.value(QStringLiteral("text")).toString());
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

    data.insert(QStringLiteral("id"), node.value(QStringLiteral("id")));
    data.insert(QStringLiteral("event"), event);

    if (!value.isUndefined())
        data.insert(QStringLiteral("value"), value);

    QJsonObject params;

    params.insert(QStringLiteral("name"), QStringLiteral("ui-event"));
    params.insert(QStringLiteral("data"), data);

    bridge_->notifyMethod(QStringLiteral("__event"), params);
}

QJsonObject DevChannel::resolveNode(const QJsonObject &command, QString *event) const
{
    bool found = false;
    QJsonObject node = findNode(tree_, command, event, &found);

    if (found && !event->isEmpty())
        return node;

    return {};
}

QJsonObject DevChannel::findNode(const QJsonArray &nodes, const QJsonObject &command, QString *event, bool *found) const
{
    for (const QJsonValue &value : nodes) {
        const QJsonObject node = value.toObject();
        const QJsonObject props = node.value(QStringLiteral("props")).toObject();

        if (props.value(QStringLiteral("visible")).toBool(true) && matches(node, command)) {
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

QJsonObject DevChannel::storeSnapshot() const
{
    if (!store_)
        return {};

    QJsonObject out;

    for (const QString &key : store_->keys())
        out.insert(key, QJsonValue::fromVariant(store_->value(key)));

    return out;
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
