#include "bridge.h"

#include "net.h"
#include "quickjs_runtime.h"

#include <QClipboard>
#include <QCoreApplication>
#include <QDesktopServices>
#include <QFile>
#include <QFileInfo>
#include <QGuiApplication>

#ifdef Q_OS_ANDROID
#include <QJniObject>
#endif
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonValue>
#include <QQmlPropertyMap>
#include <QStandardPaths>
#include <QStyleHints>
#include <QUrl>

#include <cstdio>

EmbeddedBridge::EmbeddedBridge(pulsar::QuickJsRuntime *runtime, QJSEngine *engine,
                               QQmlPropertyMap *store, QObject *parent)
    : QObject(parent)
    , runtime_(runtime)
    , engine_(engine)
    , store_(store)
{
}

qint64 EmbeddedBridge::send(const QString &method, const QJsonObject &params)
{
    const qint64 id = nextId_++;

    QJsonObject body;
    body.insert(QStringLiteral("jsonrpc"), QStringLiteral("2.0"));
    body.insert(QStringLiteral("id"), id);
    body.insert(QStringLiteral("method"), method);
    body.insert(QStringLiteral("params"), params);

    runtime_->receive(body);

    return id;
}

qint64 EmbeddedBridge::invoke(const QString &method, const QJSValue &params)
{
    const QVariantMap map = params.isObject() ? params.toVariant().toMap() : QVariantMap();

    return send(method, QJsonObject::fromVariantMap(map));
}

qint64 EmbeddedBridge::emit(const QString &method, const QJSValue &params)
{
    return invoke(method, params);
}

void EmbeddedBridge::devReload()
{
    Q_EMIT reloadRequested();
}

bool EmbeddedBridge::devMode() const
{
#ifdef PULSAR_DEV
    return true;
#else
    return false;
#endif
}

void EmbeddedBridge::setErrorText(const QString &text)
{
    Q_EMIT errorText(text);
}

void EmbeddedBridge::ensurePromiseFactory()
{
    if (promiseFactory_.isCallable())
        return;

    promiseFactory_ = engine_->evaluate(QStringLiteral(
        "(function () {"
        "  var resolve, reject;"
        "  var promise = new Promise(function (res, rej) { resolve = res; reject = rej; });"
        "  return { promise: promise, resolve: resolve, reject: reject };"
        "})"));
}

QJSValue EmbeddedBridge::call(const QString &method, const QJSValue &params)
{
    ensurePromiseFactory();
    if (!promiseFactory_.isCallable())
        return engine_->evaluate(QStringLiteral("Promise.reject(new Error('pulsar: bridge not ready'))"));

    const QJSValue handle = promiseFactory_.call();

    if (!handle.isObject())
        return engine_->evaluate(QStringLiteral("Promise.reject(new Error('pulsar: cannot create promise'))"));

    const qint64 id = invoke(method, params);
    pending_.insert(id, {handle.property(QStringLiteral("resolve")), handle.property(QStringLiteral("reject"))});

    return handle.property(QStringLiteral("promise"));
}

QString EmbeddedBridge::env(const QString &name) const
{
    return qEnvironmentVariable(name.toUtf8().constData());
}

void EmbeddedBridge::clipboardWrite(const QString &text)
{
    QGuiApplication::clipboard()->setText(text);
}

QString EmbeddedBridge::clipboardText() const
{
    return QGuiApplication::clipboard()->text();
}

QString EmbeddedBridge::colorScheme() const
{
#if QT_VERSION >= QT_VERSION_CHECK(6, 5, 0)
    return QGuiApplication::styleHints()->colorScheme() == Qt::ColorScheme::Dark ? QStringLiteral("dark")
                                                                                 : QStringLiteral("light");
#else
    return QStringLiteral("light");
#endif
}

void EmbeddedBridge::setNetwork(pulsar::NetworkService *network)
{
    network_ = network;
}

void EmbeddedBridge::notifyBinary(quint32 id, const QByteArray &data)
{
    runtime_->receiveBinary(id, data);
}

void EmbeddedBridge::notifyMethod(const QString &method, const QJsonObject &params)
{
    reply(method, params);
}

void EmbeddedBridge::notify(const QString &name, const QJsonObject &data)
{
    QJsonObject params;
    params.insert(QStringLiteral("name"), name);
    params.insert(QStringLiteral("data"), data);

    reply(QStringLiteral("__event"), params);
}

void EmbeddedBridge::beginFileDialog(const QString &token)
{
    pendingFileToken_ = token;

#ifdef Q_OS_ANDROID
    const QJniObject activity = QNativeInterface::QAndroidApplication::context();

    if (activity.isValid())
        activity.callMethod<void>("pickFiles");
#endif
}

void EmbeddedBridge::beginFileExport(const QString &token, const QString &path, const QString &name)
{
    pendingExportToken_ = token;

#ifdef Q_OS_ANDROID
    QJniObject activity = QNativeInterface::QAndroidApplication::context();

    if (!activity.isValid()) {
        finishFileExport(false);
        return;
    }

    const QString fileName = name.isEmpty() ? QFileInfo(path).fileName() : name;

    activity.callMethod<void>("exportFile", "(Ljava/lang/String;Ljava/lang/String;)V",
                              QJniObject::fromString(path).object<jstring>(),
                              QJniObject::fromString(fileName).object<jstring>());
#else
    const QString target = QStandardPaths::writableLocation(QStandardPaths::DownloadLocation)
        + QLatin1Char('/') + (name.isEmpty() ? QFileInfo(path).fileName() : name);

    finishFileExport(QFile::copy(path, target));
#endif
}

void EmbeddedBridge::finishFileExport(bool ok)
{
    const QString token = pendingExportToken_;

    pendingExportToken_.clear();

    QJsonObject replyParams;
    replyParams.insert(QStringLiteral("token"), token);
    replyParams.insert(QStringLiteral("value"), ok);

    reply(QStringLiteral("__export-result"), replyParams);
}

void EmbeddedBridge::finishFileDialog(const QJsonArray &paths)
{
    const QString token = pendingFileToken_;

    pendingFileToken_.clear();

    QJsonObject replyParams;
    replyParams.insert(QStringLiteral("token"), token);
    replyParams.insert(QStringLiteral("value"), paths);

    reply(QStringLiteral("__dialog-result"), replyParams);
}

void EmbeddedBridge::reply(const QString &method, const QJsonObject &params)
{
    QJsonObject body;
    body.insert(QStringLiteral("jsonrpc"), QStringLiteral("2.0"));
    body.insert(QStringLiteral("method"), method);
    body.insert(QStringLiteral("params"), params);

    runtime_->receive(body);
}

void EmbeddedBridge::applyState(const QJsonObject &state, const QJsonArray &unset)
{
    for (auto it = state.constBegin(); it != state.constEnd(); ++it) {
        std::fprintf(stderr, "STORE %s = %s\n", qPrintable(it.key()), qPrintable(it.value().toVariant().toString()));
        store_->insert(it.key(), it.value().toVariant());
    }

    for (const QJsonValue &value : unset)
        store_->clear(value.toString());
}

void EmbeddedBridge::handleMessage(const QJsonObject &message)
{
    const bool hasId = message.contains(QStringLiteral("id"));

    if (hasId) {
        applyState(message.value(QStringLiteral("state")).toObject(),
                   message.value(QStringLiteral("unset")).toArray());

        const qint64 id = message.value(QStringLiteral("id")).toVariant().toLongLong();
        const PendingCall pending = pending_.take(id);

        if (!pending.resolve.isCallable() && !pending.reject.isCallable())
            return;

        const QJsonValue error = message.value(QStringLiteral("error"));

        if (error.isObject()) {
            const QJSValue reason = engine_->toScriptValue(error.toObject().value(QStringLiteral("message")).toString());

            if (pending.reject.isCallable())
                pending.reject.call(QJSValueList{reason});

            return;
        }

        const QJSValue value = engine_->toScriptValue(message.value(QStringLiteral("result")).toVariant());

        if (pending.resolve.isCallable())
            pending.resolve.call(QJSValueList{value});

        return;
    }

    const QString method = message.value(QStringLiteral("method")).toString();
    const QJsonObject params = message.value(QStringLiteral("params")).toObject();

    if (method == QLatin1String("__state")) {
        applyState(params.value(QStringLiteral("state")).toObject(),
                   params.value(QStringLiteral("unset")).toArray());
        return;
    }

    if (method == QLatin1String("__config")) {
        Q_EMIT config(params.value(QStringLiteral("windows")).toArray().toVariantList());
        return;
    }

    if (method == QLatin1String("__emit")) {
        Q_EMIT appEvent(params.value(QStringLiteral("event")).toString(),
                        params.value(QStringLiteral("payload")).toVariant(),
                        params.value(QStringLiteral("target")).toString());
        return;
    }

    if (method == QLatin1String("__log")) {
        Q_EMIT log(params.value(QStringLiteral("level")).toString(),
                   params.value(QStringLiteral("message")).toString(),
                   params.value(QStringLiteral("source")).toString());
        return;
    }

    if (method == QLatin1String("__error")) {
        const QString message = params.value(QStringLiteral("message")).toString();
        const QString stack = params.value(QStringLiteral("stack")).toString();

        Q_EMIT log(QStringLiteral("error"), message, QStringLiteral("app"));
        Q_EMIT errorReported(params.value(QStringLiteral("scope")).toString(), message, stack);
        return;
    }

    if (method == QLatin1String("__ui")) {
        Q_EMIT uiTree(params.value(QStringLiteral("target")).toString(),
                      params.value(QStringLiteral("tree")).toArray().toVariantList());
        return;
    }

    if (method == QLatin1String("__window")) {
        Q_EMIT windowCommand(params.toVariantMap());
        return;
    }

    if (method == QLatin1String("__quit")) {
        QCoreApplication::quit();
        return;
    }

    if (method == QLatin1String("__dialog")) {
        const QString kind = params.value(QStringLiteral("kind")).toString();

#ifdef Q_OS_ANDROID
        if (kind == QLatin1String("open-files")) {
            beginFileDialog(params.value(QStringLiteral("token")).toString());
            return;
        }
#endif

        QJsonObject replyParams;
        replyParams.insert(QStringLiteral("token"), params.value(QStringLiteral("token")));
        replyParams.insert(QStringLiteral("value"),
                           params.value(QStringLiteral("kind")).toString() == QLatin1String("message")
                               ? QJsonValue(true)
                               : QJsonValue::Null);
        reply(QStringLiteral("__dialog-result"), replyParams);
        return;
    }

    if (method == QLatin1String("__toast")) {
#ifdef Q_OS_ANDROID
        const QJniObject activity = QNativeInterface::QAndroidApplication::context();

        if (activity.isValid())
            activity.callMethod<void>("showToast", "(Ljava/lang/String;)V",
                                      QJniObject::fromString(params.value(QStringLiteral("text")).toString())
                                          .object<jstring>());
#endif
        return;
    }

    if (method == QLatin1String("__open")) {
        const QString path = params.value(QStringLiteral("path")).toString();

#ifdef Q_OS_ANDROID
        const QJniObject activity = QNativeInterface::QAndroidApplication::context();

        if (activity.isValid())
            activity.callMethod<void>("openFile", "(Ljava/lang/String;)V",
                                      QJniObject::fromString(path).object<jstring>());
#else
        QDesktopServices::openUrl(QUrl::fromLocalFile(path));
#endif
        return;
    }

    if (method == QLatin1String("__export")) {
        beginFileExport(params.value(QStringLiteral("token")).toString(),
                        params.value(QStringLiteral("path")).toString(),
                        params.value(QStringLiteral("name")).toString());
        return;
    }

    if (method == QLatin1String("__query")) {
        QJsonObject replyParams;
        replyParams.insert(QStringLiteral("token"), params.value(QStringLiteral("token")));
        replyParams.insert(QStringLiteral("value"), QJsonValue::Null);
        reply(QStringLiteral("__query-result"), replyParams);
        return;
    }

    if (method == QLatin1String("__net")) {
        qDebug().noquote() << "pulsar: net" << params.value(QStringLiteral("action")).toString()
                           << params.value(QStringLiteral("url")).toString();

        if (!network_) {
            QJsonObject replyParams;
            replyParams.insert(QStringLiteral("id"), params.value(QStringLiteral("id")));
            replyParams.insert(QStringLiteral("type"), QStringLiteral("error"));
            replyParams.insert(QStringLiteral("code"), QStringLiteral("ERR_NETWORK"));
            replyParams.insert(QStringLiteral("message"), QStringLiteral("network is not available"));
            reply(QStringLiteral("__net-event"), replyParams);
            return;
        }

        network_->handle(params.toVariantMap());
        return;
    }

    if (method == QLatin1String("__hello")) {
        Q_EMIT log(QStringLiteral("info"),
                   QStringLiteral("runtime %1 %2")
                       .arg(params.value(QStringLiteral("runtime")).toString(),
                            params.value(QStringLiteral("version")).toString()),
                   QStringLiteral("host"));
    }
}
