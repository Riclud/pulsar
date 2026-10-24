#include "net.h"

#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QTimer>

#include <utility>

namespace pulsar {

namespace {

constexpr qint64 kMaxResponseBytes = 64ll * 1024 * 1024;
constexpr int kDefaultTimeoutMs = 30000;
constexpr int kDefaultRedirects = 5;

bool sameOrigin(const QUrl &a, const QUrl &b)
{
    return a.scheme().compare(b.scheme(), Qt::CaseInsensitive) == 0
           && a.host().compare(b.host(), Qt::CaseInsensitive) == 0 && a.port() == b.port();
}

bool isRedirectStatus(int status)
{
    return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
}

bool isTextualContentType(const QByteArray &contentType)
{
    const QByteArray raw = contentType.toLower();
    const int semicolon = raw.indexOf(';');
    const QByteArray mime = (semicolon >= 0 ? raw.left(semicolon) : raw).trimmed();

    return mime.startsWith("text/") || mime == "application/json" || mime.endsWith("+json")
           || mime == "application/xml" || mime.endsWith("+xml") || mime == "application/javascript"
           || mime == "application/x-www-form-urlencoded" || mime == "application/graphql";
}

bool isLatin1(const QByteArray &contentType)
{
    const QByteArray raw = contentType.toLower();
    const int at = raw.indexOf("charset=");
    if (at < 0)
        return false;

    const QByteArray charset = raw.mid(at + 8).split(';').first().trimmed().replace("\"", "");
    return charset == "iso-8859-1" || charset == "latin1" || charset == "us-ascii";
}

QString networkErrorCode(QNetworkReply::NetworkError error)
{
    switch (error) {
    case QNetworkReply::OperationCanceledError:
        return QStringLiteral("ERR_ABORTED");
    case QNetworkReply::TimeoutError:
        return QStringLiteral("ERR_TIMEOUT");
    case QNetworkReply::SslHandshakeFailedError:
        return QStringLiteral("ERR_TLS");
    case QNetworkReply::TooManyRedirectsError:
        return QStringLiteral("ERR_REDIRECT");
    default:
        return QStringLiteral("ERR_NETWORK");
    }
}

} // namespace

NativeHttpEngine::NativeHttpEngine(QObject *parent)
    : HttpEngine(parent)
    , manager_(new QNetworkAccessManager(this))
{
}

void NativeHttpEngine::start(const NetRequestSpec &spec)
{
    if (entries_.contains(spec.id))
        return;

    Entry *entry = new Entry;
    entry->spec = spec;
    entries_.insert(spec.id, entry);
    dispatch(spec.id);
}

void NativeHttpEngine::dispatch(quint32 id)
{
    Entry *entry = entries_.value(id);
    if (!entry)
        return;

    QNetworkRequest request(entry->spec.url);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    request.setTransferTimeout(0);

    for (const NetHeader &header : std::as_const(entry->spec.headers)) {
        const QByteArray lower = header.name.toLower();
        if (lower == "host" || lower == "content-length")
            continue;
        request.setRawHeader(header.name, header.value);
    }

    entry->timer = new QTimer(this);
    entry->timer->setSingleShot(true);
    QObject::connect(entry->timer, &QTimer::timeout, this, [this, id]() {
        fail(id, QStringLiteral("ERR_TIMEOUT"), QStringLiteral("request timed out"));
    });
    entry->timer->start(entry->spec.timeoutMs > 0 ? entry->spec.timeoutMs : kDefaultTimeoutMs);

    QNetworkReply *reply = manager_->sendCustomRequest(request, entry->spec.method, entry->spec.body);
    entry->reply = reply;
    entry->received = 0;
    entry->responded = false;

    QObject::connect(reply, &QNetworkReply::metaDataChanged, this, [this, id, reply]() {
        handleMetaData(id, reply);
    });
    QObject::connect(reply, &QNetworkReply::readyRead, this, [this, id, reply]() {
        handleReadyRead(id, reply);
    });
    QObject::connect(reply, &QNetworkReply::finished, this, [this, id, reply]() {
        handleFinished(id, reply);
    });
}

void NativeHttpEngine::handleMetaData(quint32 id, QNetworkReply *reply)
{
    Entry *entry = entries_.value(id);
    if (!entry || entry->responded || entry->reply != reply)
        return;

    const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    const QByteArray location = reply->rawHeader("Location");
    const bool redirect = isRedirectStatus(status) && !location.isEmpty();
    if (redirect && entry->spec.redirect != QLatin1String("manual"))
        return;

    entry->responded = true;

    const QByteArray contentType = reply->rawHeader("Content-Type");
    if (entry->spec.responseType == QLatin1String("text"))
        entry->binary = false;
    else if (entry->spec.responseType == QLatin1String("binary"))
        entry->binary = true;
    else
        entry->binary = !isTextualContentType(contentType);

    entry->latin1 = isLatin1(contentType);
    entry->decoder = QStringDecoder(QStringDecoder::Utf8);

    QMap<QString, QString> headers;
    for (const auto &pair : reply->rawHeaderPairs()) {
        const QString name = QString::fromLatin1(pair.first).toLower();
        const QString value = QString::fromUtf8(pair.second);

        if (!headers.contains(name))
            headers.insert(name, value);
        else
            headers[name] += (name == QLatin1String("set-cookie") ? QStringLiteral("\n") : QStringLiteral(", "))
                             + value;
    }

    Q_EMIT response(id,
                    status,
                    reply->attribute(QNetworkRequest::HttpReasonPhraseAttribute).toString(),
                    reply->url(),
                    headers);
}

void NativeHttpEngine::handleReadyRead(quint32 id, QNetworkReply *reply)
{
    Entry *entry = entries_.value(id);
    if (!entry || entry->reply != reply || !entry->responded)
        return;

    const QByteArray data = reply->readAll();
    if (data.isEmpty())
        return;

    entry->received += data.size();
    if (entry->received > kMaxResponseBytes) {
        fail(id, QStringLiteral("ERR_TOO_LARGE"), QStringLiteral("response exceeds the size limit"));
        return;
    }

    if (entry->binary) {
        Q_EMIT binary(id, data);
        return;
    }

    const QString chunk = entry->latin1 ? QString::fromLatin1(data) : entry->decoder.decode(data);
    if (!chunk.isEmpty())
        Q_EMIT text(id, chunk);
}

void NativeHttpEngine::handleFinished(quint32 id, QNetworkReply *reply)
{
    Entry *entry = entries_.value(id);
    if (!entry || entry->reply != reply) {
        reply->deleteLater();
        return;
    }

    const QVariant target = reply->attribute(QNetworkRequest::RedirectionTargetAttribute);
    const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();

    QUrl targetUrl = target.toUrl();
    if (targetUrl.isEmpty() && isRedirectStatus(status)) {
        const QByteArray location = reply->rawHeader("Location");
        if (!location.isEmpty())
            targetUrl = reply->url().resolved(QUrl::fromEncoded(location));
    }

    const bool redirect = !targetUrl.isEmpty() && isRedirectStatus(status);

    if (redirect && entry->spec.redirect != QLatin1String("manual")) {
        if (entry->spec.redirect == QLatin1String("error")) {
            fail(id, QStringLiteral("ERR_REDIRECT"), QStringLiteral("redirects are disabled"));
            return;
        }

        const int maxRedirects = entry->spec.maxRedirects > 0 ? entry->spec.maxRedirects : kDefaultRedirects;
        if (entry->redirects >= maxRedirects) {
            fail(id, QStringLiteral("ERR_REDIRECT"), QStringLiteral("too many redirects"));
            return;
        }

        const QUrl previous = entry->spec.url;
        QUrl next = targetUrl;
        if (next.scheme() != QLatin1String("http") && next.scheme() != QLatin1String("https")) {
            fail(id, QStringLiteral("ERR_REDIRECT"), QStringLiteral("redirect to an unsupported scheme"));
            return;
        }
        if (previous.scheme() == QLatin1String("https") && next.scheme() == QLatin1String("http")) {
            fail(id, QStringLiteral("ERR_REDIRECT"), QStringLiteral("redirect downgrades to http"));
            return;
        }

        QList<NetHeader> headers = entry->spec.headers;
        if (!sameOrigin(previous, next)) {
            QList<NetHeader> filtered;
            for (const NetHeader &header : std::as_const(headers)) {
                const QByteArray lower = header.name.toLower();
                if (lower == "authorization" || lower == "cookie" || lower == "proxy-authorization")
                    continue;
                filtered.append(header);
            }
            headers = filtered;
        }

        if ((status == 301 || status == 302 || status == 303)
            && entry->spec.method != "GET" && entry->spec.method != "HEAD") {
            entry->spec.method = "GET";
            entry->spec.body.clear();
            QList<NetHeader> filtered;
            for (const NetHeader &header : std::as_const(headers)) {
                const QByteArray lower = header.name.toLower();
                if (lower == "content-type" || lower == "content-encoding")
                    continue;
                filtered.append(header);
            }
            headers = filtered;
        }

        entry->spec.url = next;
        entry->spec.headers = headers;
        ++entry->redirects;

        entry->reply->disconnect(this);
        entry->reply->deleteLater();
        entry->reply = nullptr;
        dispatch(id);
        return;
    }

    if (reply->error() != QNetworkReply::NoError) {
        fail(id, networkErrorCode(reply->error()), reply->errorString());
        return;
    }

    if (!entry->responded)
        handleMetaData(id, reply);

    handleReadyRead(id, reply);

    release(id);
    Q_EMIT finished(id);
}

void NativeHttpEngine::fail(quint32 id, const QString &code, const QString &message)
{
    Entry *entry = entries_.value(id);
    if (!entry)
        return;

    release(id);
    Q_EMIT failed(id, code, message);
}

void NativeHttpEngine::release(quint32 id)
{
    Entry *entry = entries_.take(id);
    if (!entry)
        return;

    if (entry->timer) {
        entry->timer->stop();
        entry->timer->deleteLater();
    }
    if (entry->reply) {
        entry->reply->disconnect(this);
        entry->reply->abort();
        entry->reply->deleteLater();
    }

    delete entry;
}

void NativeHttpEngine::abort(quint32 id)
{
    fail(id, QStringLiteral("ERR_ABORTED"), QStringLiteral("request aborted"));
}

NetworkService::NetworkService(QObject *parent)
    : QObject(parent)
    , native_(new NativeHttpEngine(this))
{
    QObject::connect(native_, &HttpEngine::response, this, &NetworkService::response);
    QObject::connect(native_, &HttpEngine::text, this, &NetworkService::text);
    QObject::connect(native_, &HttpEngine::binary, this, &NetworkService::binary);
    QObject::connect(native_, &HttpEngine::finished, this, &NetworkService::finished);
    QObject::connect(native_, &HttpEngine::failed, this, &NetworkService::failed);
}

HttpEngine *NetworkService::engineFor(const NetRequestSpec &spec)
{
    if (!spec.tlsFingerprint.isEmpty())
        return nullptr;

    return native_;
}

void NetworkService::abort(quint32 id)
{
    native_->abort(id);
}

void NetworkService::handle(const QVariantMap &params)
{
    const quint32 id = params.value(QStringLiteral("id")).toUInt();
    if (id == 0)
        return;

    const QString action = params.value(QStringLiteral("action")).toString();
    if (action == QLatin1String("abort")) {
        abort(id);
        return;
    }

    if (action != QLatin1String("request"))
        return;

    NetRequestSpec spec;
    spec.id = id;
    spec.url = QUrl(params.value(QStringLiteral("url")).toString());
    spec.method = params.value(QStringLiteral("method"), QStringLiteral("GET")).toString().toUpper().toLatin1();

    const QString scheme = spec.url.scheme().toLower();
    if (!spec.url.isValid() || spec.url.host().isEmpty()
        || (scheme != QLatin1String("http") && scheme != QLatin1String("https"))) {
        Q_EMIT failed(id, QStringLiteral("ERR_NETWORK"), QStringLiteral("only http and https URLs are supported"));
        return;
    }

    const QVariantMap headerMap = params.value(QStringLiteral("headers")).toMap();
    for (auto it = headerMap.constBegin(); it != headerMap.constEnd(); ++it)
        spec.headers.append({it.key().toLatin1(), it.value().toString().toUtf8()});

    const QString encoding = params.value(QStringLiteral("bodyEncoding")).toString();
    const QString body = params.value(QStringLiteral("body")).toString();
    spec.body = encoding == QLatin1String("base64") ? QByteArray::fromBase64(body.toLatin1()) : body.toUtf8();

    const int timeout = params.value(QStringLiteral("timeoutMs")).toInt();
    spec.timeoutMs = timeout > 0 ? timeout : kDefaultTimeoutMs;

    const QString redirect = params.value(QStringLiteral("redirect")).toString();
    spec.redirect = (redirect == QLatin1String("manual") || redirect == QLatin1String("error")) ? redirect
                                                                                               : QStringLiteral("follow");

    const int maxRedirects = params.value(QStringLiteral("maxRedirects")).toInt();
    spec.maxRedirects = maxRedirects > 0 ? maxRedirects : kDefaultRedirects;

    const QString responseType = params.value(QStringLiteral("responseType")).toString();
    spec.responseType = (responseType == QLatin1String("text") || responseType == QLatin1String("binary"))
                            ? responseType
                            : QStringLiteral("auto");

    spec.tlsFingerprint = params.value(QStringLiteral("tlsFingerprint")).toString();

    HttpEngine *engine = engineFor(spec);
    if (!engine) {
        Q_EMIT failed(id,
                      QStringLiteral("ERR_FINGERPRINT_UNAVAILABLE"),
                      QStringLiteral("TLS fingerprinting is not available in this build"));
        return;
    }

    engine->start(spec);
}

} // namespace pulsar
