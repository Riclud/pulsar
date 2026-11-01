#include "bridge.h"

#include "net.h"
#include "quickjs_runtime.h"

#include <QClipboard>
#include <QCoreApplication>
#include <QDesktopServices>
#include <QFile>
#include <QFileInfo>
#include <QFileSystemWatcher>
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
    watcher_ = new QFileSystemWatcher(this);

    auto emitChange = [this](const QString &path) {
        QJsonObject data;
        data.insert(QStringLiteral("path"), path);

        notify(QStringLiteral("fs-change"), data);

        if (QFileInfo::exists(path) && !watcher_->files().contains(path)
            && !watcher_->directories().contains(path))
            watcher_->addPath(path);
    };

    connect(watcher_, &QFileSystemWatcher::fileChanged, this, emitChange);
    connect(watcher_, &QFileSystemWatcher::directoryChanged, this, emitChange);
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

void EmbeddedBridge::reset()
{
    pending_.clear();
    pendingFileToken_.clear();
    pendingExportToken_.clear();
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

void EmbeddedBridge::finishIntent(const QJsonObject &intent)
{
    const QString text = intent.value(QStringLiteral("text")).toString();
    const QString url = intent.value(QStringLiteral("url")).toString();
    const QJsonArray files = intent.value(QStringLiteral("files")).toArray();

    if (!text.isEmpty()) {
        QJsonObject data;
        data.insert(QStringLiteral("text"), text);
        data.insert(QStringLiteral("files"), files);

        notify(QStringLiteral("share"), data);
    }

    if (!url.isEmpty()) {
        QJsonObject data;
        data.insert(QStringLiteral("url"), url);

        notify(QStringLiteral("open-url"), data);
    }

    for (const QJsonValue &value : files) {
        QJsonObject data;
        data.insert(QStringLiteral("path"), value.toString());

        notify(QStringLiteral("open-file"), data);
    }
}

void EmbeddedBridge::finishNotificationClick(const QString &token)
{
    QJsonObject data;
    data.insert(QStringLiteral("token"), token);

    notify(QStringLiteral("notification-click"), data);
}

void EmbeddedBridge::finishPermission(const QString &name, bool granted)
{
    const QString token = pendingPermissionTokens_.take(name);

    if (token.isEmpty())
        return;

    QJsonObject replyParams;
    replyParams.insert(QStringLiteral("token"), token);
    replyParams.insert(QStringLiteral("value"), granted);

    reply(QStringLiteral("__query-result"), replyParams);
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

    if (method == QLatin1String("__fs-watch")) {
        const QString action = params.value(QStringLiteral("action")).toString();
        const QString path = params.value(QStringLiteral("path")).toString();

        if (watcher_ && !path.isEmpty()) {
            if (action == QLatin1String("add"))
                watcher_->addPath(path);
            else if (action == QLatin1String("remove"))
                watcher_->removePath(path);
        }

        return;
    }

    if (method == QLatin1String("__theme")) {
        Q_EMIT themeApplied(params.toVariantMap());
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

        const QString text = stack.isEmpty() ? message : message + QLatin1Char('\n') + stack;

        Q_EMIT log(QStringLiteral("error"), text, QStringLiteral("app"));
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

    if (method == QLatin1String("__notify")) {
#ifdef Q_OS_ANDROID
        const QJniObject activity = QNativeInterface::QAndroidApplication::context();

        if (activity.isValid())
            activity.callMethod<void>("showNotification", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V",
                                      QJniObject::fromString(params.value(QStringLiteral("token")).toString())
                                          .object<jstring>(),
                                      QJniObject::fromString(params.value(QStringLiteral("title")).toString())
                                          .object<jstring>(),
                                      QJniObject::fromString(params.value(QStringLiteral("body")).toString())
                                          .object<jstring>());
#endif
        return;
    }

    if (method == QLatin1String("__notify-channel")) {
#ifdef Q_OS_ANDROID
        const QJniObject activity = QNativeInterface::QAndroidApplication::context();

        if (activity.isValid())
            activity.callMethod<void>("createNotificationChannel", "(Ljava/lang/String;Ljava/lang/String;I)V",
                                      QJniObject::fromString(params.value(QStringLiteral("id")).toString())
                                          .object<jstring>(),
                                      QJniObject::fromString(params.value(QStringLiteral("name")).toString())
                                          .object<jstring>(),
                                      params.value(QStringLiteral("importance")).toInt(3));
#endif
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
        const QString kind = params.value(QStringLiteral("kind")).toString();

        QJsonObject replyParams;
        replyParams.insert(QStringLiteral("token"), params.value(QStringLiteral("token")));

        if (kind == QLatin1String("permissions.request") || kind == QLatin1String("permissions.check")) {
            const QString name = params.value(QStringLiteral("name")).toString();
#ifdef Q_OS_ANDROID
            const QJniObject activity = QNativeInterface::QAndroidApplication::context();

            if (kind == QLatin1String("permissions.check")) {
                const bool granted = activity.isValid()
                    && activity.callMethod<jboolean>("hasPermission", "(Ljava/lang/String;)Z",
                                                     QJniObject::fromString(name).object<jstring>());

                replyParams.insert(QStringLiteral("value"), granted);
            } else {
                pendingPermissionTokens_.insert(name, params.value(QStringLiteral("token")).toString());

                if (activity.isValid())
                    activity.callMethod<void>("requestPermission", "(Ljava/lang/String;)V",
                                              QJniObject::fromString(name).object<jstring>());
                else
                    finishPermission(name, false);

                return;
            }
#else
            replyParams.insert(QStringLiteral("value"), true);
#endif
        } else if (kind == QLatin1String("clipboard.read")) {
            replyParams.insert(QStringLiteral("value"), QGuiApplication::clipboard()->text());
        } else if (kind == QLatin1String("clipboard.write")) {
            QGuiApplication::clipboard()->setText(params.value(QStringLiteral("text")).toString());
            replyParams.insert(QStringLiteral("value"), true);
        } else {
            replyParams.insert(QStringLiteral("value"), QJsonValue::Null);
        }

        reply(QStringLiteral("__query-result"), replyParams);
        return;
    }

    if (method == QLatin1String("__share")) {
#ifdef Q_OS_ANDROID
        const QJniObject activity = QNativeInterface::QAndroidApplication::context();

        if (activity.isValid()) {
            const QString kind = params.value(QStringLiteral("kind")).toString();
            const QString title = params.value(QStringLiteral("title")).toString();

            if (kind == QLatin1String("file")) {
                activity.callMethod<void>("shareFile", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V",
                                          QJniObject::fromString(params.value(QStringLiteral("path")).toString())
                                              .object<jstring>(),
                                          QJniObject::fromString(params.value(QStringLiteral("mime")).toString())
                                              .object<jstring>(),
                                          QJniObject::fromString(title).object<jstring>());
            } else {
                const QString text = kind == QLatin1String("url")
                    ? params.value(QStringLiteral("url")).toString()
                    : params.value(QStringLiteral("text")).toString();

                activity.callMethod<void>("shareText", "(Ljava/lang/String;Ljava/lang/String;)V",
                                          QJniObject::fromString(text).object<jstring>(),
                                          QJniObject::fromString(title).object<jstring>());
            }
        }
#else
        const QString kind = params.value(QStringLiteral("kind")).toString();
        const QString text = kind == QLatin1String("file")
            ? params.value(QStringLiteral("path")).toString()
            : kind == QLatin1String("url")
                ? params.value(QStringLiteral("url")).toString()
                : params.value(QStringLiteral("text")).toString();

        QGuiApplication::clipboard()->setText(text);
#endif
        return;
    }

    if (method == QLatin1String("__device")) {
#ifdef Q_OS_ANDROID
        const QJniObject activity = QNativeInterface::QAndroidApplication::context();
        const QString action = params.value(QStringLiteral("action")).toString();

        if (activity.isValid() && action == QLatin1String("orientation")) {
            activity.callMethod<void>("setOrientation", "(Ljava/lang/String;)V",
                                      QJniObject::fromString(params.value(QStringLiteral("orientation")).toString())
                                          .object<jstring>());
        } else if (activity.isValid() && action == QLatin1String("keepAwake")) {
            activity.callMethod<void>("setKeepAwake", "(Z)V", params.value(QStringLiteral("enabled")).toBool());
        }
#endif
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
