#include "devfetch.h"

#include <QDir>
#include <QEventLoop>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QStandardPaths>
#include <QTimer>
#include <QUrl>

#ifdef Q_OS_ANDROID
#include <QCoreApplication>
#include <QJniObject>
#endif

namespace pulsar {

namespace {

QByteArray getBytes(const QString &url, int timeoutMs)
{
    QNetworkAccessManager manager;
    QNetworkRequest request{QUrl(url)};

    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::NoLessSafeRedirectPolicy);

    QNetworkReply *reply = manager.get(request);
    QEventLoop loop;
    QTimer timer;

    timer.setSingleShot(true);

    QObject::connect(&timer, &QTimer::timeout, &loop, &QEventLoop::quit);
    QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit);

    timer.start(timeoutMs);
    loop.exec();

    QByteArray data;

    if (reply->isFinished() && reply->error() == QNetworkReply::NoError)
        data = reply->readAll();
    else
        qWarning().noquote() << "pulsar: dev fetch failed" << url << reply->errorString();

    reply->deleteLater();

    return data;
}

QString readMarker(const QString &path)
{
    QFile file(path);

    if (!file.open(QIODevice::ReadOnly))
        return {};

    return QString::fromUtf8(file.readAll()).trimmed();
}

bool writeMarker(const QString &path, const QString &value)
{
    QFile file(path);

    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate))
        return false;

    return file.write(value.toUtf8()) == value.toUtf8().size();
}

} // namespace

#ifdef Q_OS_ANDROID
QString devUrlFromIntent()
{
    QJniObject activity = QNativeInterface::QAndroidApplication::context();

    if (!activity.isValid())
        return {};

    QJniObject intent = activity.callObjectMethod("getIntent", "()Landroid/content/Intent;");

    if (!intent.isValid())
        return {};

    const QJniObject key = QJniObject::fromString(QStringLiteral("pulsar-dev-url"));
    const QJniObject value =
        intent.callObjectMethod("getStringExtra", "(Ljava/lang/String;)Ljava/lang/String;", key.object<jstring>());

    return value.isValid() ? value.toString() : QString();
}
#else
QString devUrlFromIntent()
{
    return {};
}
#endif

DevFetchResult fetchDevApp(const QString &url)
{
    QString base = url;

    if (!base.endsWith(QLatin1Char('/')))
        base += QLatin1Char('/');

    const QByteArray body = getBytes(base + QStringLiteral("__dev/payload.json"), 5000);

    if (body.isEmpty()) {
        qWarning().noquote() << "pulsar: dev server is not reachable, using the bundled app";
        return {};
    }

    QJsonParseError error;
    const QJsonDocument document = QJsonDocument::fromJson(body, &error);

    if (error.error != QJsonParseError::NoError || !document.isObject()) {
        qWarning().noquote() << "pulsar: invalid dev payload:" << error.errorString();
        return {};
    }

    const QJsonObject payload = document.object();
    const QString version = payload.value(QStringLiteral("version")).toString();
    const QJsonArray files = payload.value(QStringLiteral("files")).toArray();

    if (version.isEmpty() || files.isEmpty())
        return {};

    const QString root = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    const QString target = root + QStringLiteral("/dev-app");
    const QString marker = target + QStringLiteral("/.dev-id");

    if (readMarker(marker) == version && QFile::exists(target + QStringLiteral("/runtime.js"))) {
        qInfo().noquote() << "pulsar: dev app is up to date" << version.left(12);
        return { true, target };
    }

    const QString staging = root + QStringLiteral("/dev-app.new");
    const QString previous = root + QStringLiteral("/dev-app.old");

    QDir(staging).removeRecursively();
    QDir().mkpath(staging);

    for (const QJsonValue &value : files) {
        const QJsonObject entry = value.toObject();
        const QString path = entry.value(QStringLiteral("path")).toString();
        const QByteArray data = QByteArray::fromBase64(entry.value(QStringLiteral("data")).toString().toLatin1());

        if (path.isEmpty() || path.contains(QStringLiteral("..")) || QDir::isAbsolutePath(path))
            continue;

        const QString out = staging + QLatin1Char('/') + path;

        QDir().mkpath(QFileInfo(out).absolutePath());

        QFile file(out);

        if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate) || file.write(data) != data.size()) {
            qWarning().noquote() << "pulsar: cannot write the dev app file" << path;
            QDir(staging).removeRecursively();
            return {};
        }
    }

    if (!writeMarker(staging + QStringLiteral("/.dev-id"), version)) {
        QDir(staging).removeRecursively();
        return {};
    }

    QDir(previous).removeRecursively();

    if (QDir(target).exists() && !QDir().rename(target, previous)) {
        QDir(target).removeRecursively();
    }

    if (!QDir().rename(staging, target)) {
        qWarning().noquote() << "pulsar: cannot activate the dev app in" << target;
        QDir(staging).removeRecursively();
        return {};
    }

    QDir(previous).removeRecursively();
    qInfo().noquote() << "pulsar: dev app" << version.left(12) << "ready in" << target;

    return { true, target };
}

} // namespace pulsar
