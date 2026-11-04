#include "bridge.h"
#include "net.h"
#include "quickjs_runtime.h"

#include <QDir>
#include <QDateTime>
#include <QElapsedTimer>
#include <QDirIterator>
#include <QFile>
#include <QFont>
#include <QFontDatabase>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkRequest>
#include <QKeyEvent>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQmlPropertyMap>
#include <QQuickStyle>
#include <QQuickWindow>
#include <QStandardPaths>
#include <QTimer>
#include <QUrl>
#include <QWindow>
#include <QtQml/qqml.h>

#include <cstdio>
#include <memory>

#ifdef Q_OS_ANDROID
#include <QJniEnvironment>
#endif

#ifdef PULSAR_DEV
#include "devchannel.h"
#include "devfetch.h"
#endif

#ifdef Q_OS_ANDROID
class BackHandler : public QObject {
public:
    explicit BackHandler(EmbeddedBridge *bridge)
        : bridge_(bridge)
    {
    }

protected:
    bool eventFilter(QObject *watched, QEvent *event) override
    {
        Q_UNUSED(watched)

        if (event->type() == QEvent::Close) {
            if (backTimer_.isValid() && backTimer_.elapsed() < 500) {
                qInfo().noquote() << "pulsar: ignoring close caused by back";

                return true;
            }

            return false;
        }

        if (event->type() != QEvent::KeyPress && event->type() != QEvent::KeyRelease)
            return false;

        const auto *key = static_cast<QKeyEvent *>(event);

        if (key->key() != Qt::Key_Back)
            return false;

        if (event->type() == QEvent::KeyPress) {
            backTimer_.restart();
            bridge_->notify(QStringLiteral("back-pressed"), QJsonObject());
        }

        return true;
    }

private:
    EmbeddedBridge *bridge_;
    QElapsedTimer backTimer_;
};

static EmbeddedBridge *g_backBridge = nullptr;

static void pulsarNotifyBack(JNIEnv *, jclass)
{
    if (!g_backBridge)
        return;

    QMetaObject::invokeMethod(
        g_backBridge,
        [] {
            if (g_backBridge)
                g_backBridge->notify(QStringLiteral("back-pressed"), QJsonObject());
        },
        Qt::QueuedConnection);
}

static void pulsarFileExported(JNIEnv *, jclass, jboolean ok)
{
    if (!g_backBridge)
        return;

    const bool value = ok;

    QMetaObject::invokeMethod(
        g_backBridge,
        [value] {
            if (g_backBridge)
                g_backBridge->finishFileExport(value);
        },
        Qt::QueuedConnection);
}

static void pulsarFilesPicked(JNIEnv *env, jclass, jstring json)
{
    if (!g_backBridge)
        return;

    const char *chars = env->GetStringUTFChars(json, nullptr);
    const QString text = QString::fromUtf8(chars);

    env->ReleaseStringUTFChars(json, chars);

    QMetaObject::invokeMethod(
        g_backBridge,
        [text] {
            if (g_backBridge)
                g_backBridge->finishFileDialog(QJsonDocument::fromJson(text.toUtf8()).array());
        },
        Qt::QueuedConnection);
}

static void pulsarIntentReceived(JNIEnv *env, jclass, jstring json)
{
    if (!g_backBridge)
        return;

    const char *chars = env->GetStringUTFChars(json, nullptr);
    const QString text = QString::fromUtf8(chars);

    env->ReleaseStringUTFChars(json, chars);

    QMetaObject::invokeMethod(
        g_backBridge,
        [text] {
            if (g_backBridge)
                g_backBridge->finishIntent(QJsonDocument::fromJson(text.toUtf8()).object());
        },
        Qt::QueuedConnection);
}

static void pulsarMediaEvent(JNIEnv *env, jclass, jstring json)
{
    if (!g_backBridge)
        return;

    const char *chars = env->GetStringUTFChars(json, nullptr);
    const QString text = QString::fromUtf8(chars);

    env->ReleaseStringUTFChars(json, chars);

    QMetaObject::invokeMethod(
        g_backBridge,
        [text] {
            if (g_backBridge)
                g_backBridge->finishMediaState(QJsonDocument::fromJson(text.toUtf8()).object());
        },
        Qt::QueuedConnection);
}

static void pulsarNotificationClicked(JNIEnv *env, jclass, jstring token)
{
    if (!g_backBridge)
        return;

    const char *chars = env->GetStringUTFChars(token, nullptr);
    const QString text = QString::fromUtf8(chars);

    env->ReleaseStringUTFChars(token, chars);

    QMetaObject::invokeMethod(
        g_backBridge,
        [text] {
            if (g_backBridge)
                g_backBridge->finishNotificationClick(text);
        },
        Qt::QueuedConnection);
}

static void pulsarPermissionResult(JNIEnv *env, jclass, jstring name, jboolean granted)
{
    if (!g_backBridge)
        return;

    const char *chars = env->GetStringUTFChars(name, nullptr);
    const QString text = QString::fromUtf8(chars);
    const bool value = granted;

    env->ReleaseStringUTFChars(name, chars);

    QMetaObject::invokeMethod(
        g_backBridge,
        [text, value] {
            if (g_backBridge)
                g_backBridge->finishPermission(text, value);
        },
        Qt::QueuedConnection);
}
#endif

static QString appDir()
{
    const QByteArray env = qgetenv("PULSAR_APP");

    if (!env.isEmpty())
        return QFileInfo(QString::fromLocal8Bit(env)).absoluteFilePath();

    return QDir::currentPath();
}

#ifdef Q_OS_ANDROID
static QString androidAppDir()
{
    const QString root = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)
        + QStringLiteral("/app");
    QDir().mkpath(root);

    const QString markerPath = root + QStringLiteral("/.build-id");
    const QString wanted = QStringLiteral(PULSAR_ANDROID_BUILD_ID);
    QFile marker(markerPath);

    if (marker.open(QIODevice::ReadOnly) && QString::fromUtf8(marker.readAll()).trimmed() == wanted)
        return root;

    bool complete = QFile::exists(QStringLiteral(":/app/runtime.js"));

    int copied = 0;

    QDirIterator it(QStringLiteral(":/app"), QDirIterator::Subdirectories);

    while (it.hasNext()) {
        const QString source = it.next();

        if (QFileInfo(source).isDir())
            continue;

        const QString relative = source.mid(QStringLiteral(":/app/").size());
        const QString target = root + QLatin1Char('/') + relative;

        QDir().mkpath(QFileInfo(target).absolutePath());
        QFile::remove(target);

        if (!QFile::copy(source, target)) {
            complete = false;
            continue;
        }

        copied += 1;
    }

    qDebug() << "pulsar: extracted" << copied << "files to" << root;

    if (!complete)
        return root;

    QFile out(markerPath);

    if (out.open(QIODevice::WriteOnly | QIODevice::Truncate))
        out.write(wanted.toUtf8());

    return root;
}
#endif

static void reportCrashRemote(const QString &text)
{
    const QString endpoint = qEnvironmentVariable("PULSAR_CRASH_URL");

    if (endpoint.isEmpty())
        return;

    const QUrl url(endpoint);

    if (!url.isValid())
        return;

    static QNetworkAccessManager *manager = new QNetworkAccessManager();

    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));

    QJsonObject body;
    body.insert(QStringLiteral("app"), QCoreApplication::applicationName());
    body.insert(QStringLiteral("platform"), QGuiApplication::platformName());
    body.insert(QStringLiteral("qt"), QString::fromLatin1(qVersion()));
    body.insert(QStringLiteral("error"), text);

    manager->post(request, QJsonDocument(body).toJson(QJsonDocument::Compact));
}

int main(int argc, char **argv)
{
    QGuiApplication app(argc, argv);

    QFontDatabase::addApplicationFont(QStringLiteral(":/runtime/fonts/PaperMono-Regular.ttf"));
    QFontDatabase::addApplicationFont(QStringLiteral(":/runtime/fonts/PaperMono-Medium.ttf"));
    QFontDatabase::addApplicationFont(QStringLiteral(":/runtime/fonts/PaperMono-Bold.ttf"));

    QFont appFont = QGuiApplication::font();
    appFont.setFamily(QStringLiteral("Paper Mono"));
    QGuiApplication::setFont(appFont);

    const QString controlsStyle = qEnvironmentVariable("PULSAR_CONTROLS_STYLE");
    QQuickStyle::setStyle(controlsStyle.isEmpty() ? QStringLiteral("Basic") : controlsStyle);
    app.setApplicationName(QStringLiteral("pulsar-app"));

#ifdef Q_OS_ANDROID
    app.setQuitOnLastWindowClosed(false);
#endif

#ifdef PULSAR_DEV
    QString devUrl = qEnvironmentVariable("PULSAR_DEV_URL");

    if (devUrl.isEmpty())
        devUrl = pulsar::devUrlFromIntent();
#endif

    QString dir =
#ifdef Q_OS_ANDROID
        androidAppDir();
#else
        appDir();
#endif

#ifdef PULSAR_DEV
    if (!devUrl.isEmpty()) {
        const pulsar::DevFetchResult fetched = pulsar::fetchDevApp(devUrl);

        if (fetched.ok)
            dir = fetched.dir;
    }
#endif

    QString manifestJson = QStringLiteral("null");
    QString ui = QStringLiteral("ui/main.qml");
    bool jsUi = false;

    auto readManifest = [&](const QString &root) {
        manifestJson = QStringLiteral("null");
        ui = QStringLiteral("ui/main.qml");
        jsUi = false;

        QFile manifestFile(root + QStringLiteral("/pulsar.json"));

        if (!manifestFile.open(QIODevice::ReadOnly)) {
            jsUi = true;
            return;
        }

        manifestJson = QString::fromUtf8(manifestFile.readAll());

        const QJsonObject manifest = QJsonDocument::fromJson(manifestJson.toUtf8()).object();
        const QJsonArray windows = manifest.value(QStringLiteral("windows")).toArray();
        const QJsonObject window = windows.isEmpty() ? QJsonObject() : windows.first().toObject();
        const QString value = window.value(QStringLiteral("ui")).toString();

        if (!value.isEmpty())
            ui = value;
        else
            jsUi = true;
    };

    readManifest(dir);

    qputenv("PULSAR_APP", dir.toLocal8Bit());

    QQmlApplicationEngine engine;
    QQmlPropertyMap store;
    pulsar::QuickJsRuntime runtime;
    EmbeddedBridge bridge(&runtime, &engine, &store);

#ifdef PULSAR_DEV
    std::unique_ptr<DevChannel> devChannel;

    if (!devUrl.isEmpty()) {
        devChannel = std::make_unique<DevChannel>(&bridge, &runtime, &store, QUrl(devUrl));
        devChannel->start();
    }
#endif

    QVariantList pendingUiTree;
    bool hasPendingUiTree = false;
    quint64 uiPatchSeq = 0;
    QObject *uiRoot = nullptr;
    QVariantMap currentTheme;

    auto applyUiTree = [&](const QVariantList &tree) {
        if (!uiRoot) {
            pendingUiTree = tree;
            hasPendingUiTree = true;
            return;
        }

        uiRoot->setProperty("tree", tree);
    };

    QString pendingError;

    auto writeCrash = [](const QString &text) {
        const QString dir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);

        if (dir.isEmpty())
            return;

        QDir().mkpath(dir);

        QFile file(QDir(dir).filePath(QStringLiteral("crash.log")));

        if (!file.open(QIODevice::Append | QIODevice::Text))
            return;

        file.write(QDateTime::currentDateTimeUtc().toString(Qt::ISODate).toUtf8());
        file.write(" ");
        file.write(text.toUtf8());
        file.write("\n");

        reportCrashRemote(text);
    };

    auto showError = [&](const QString &text) {
        if (qEnvironmentVariableIsSet("PULSAR_DEBUG"))
            std::fprintf(stderr, "ERROR OVERLAY: %s\n", qPrintable(text));

        writeCrash(text);

        if (uiRoot)
            uiRoot->setProperty("errorText", text);
        else
            pendingError = text;
    };

    QObject::connect(&bridge, &EmbeddedBridge::errorText, &app, showError);
    QObject::connect(&bridge, &EmbeddedBridge::errorReported, &app,
                     [&](const QString &scope, const QString &message, const QString &stack) {
                         QString text = QStringLiteral("%1: %2").arg(scope, message);

                         if (!stack.isEmpty())
                             text += QLatin1Char('\n') + stack;

                         showError(text);
                     });
    QObject::connect(&bridge, &EmbeddedBridge::themeApplied, &app, [&](const QVariantMap &theme) {
        currentTheme = theme;

        for (QObject *root : engine.rootObjects()) {
            if (root->metaObject()->indexOfProperty("themeData") >= 0)
                root->setProperty("themeData", theme);
        }
    });
    QObject::connect(&bridge, &EmbeddedBridge::uiTree, &app,
                     [&](const QString &target, const QVariantList &tree) {
                         if (!jsUi)
                             return;

                         if (target == QLatin1String("main") || target == QLatin1String("*") || target.isEmpty()) {
                             applyUiTree(tree);

#ifdef PULSAR_DEV
                             if (devChannel)
                                 devChannel->setTree(tree);
#endif
                         }
                     });
    QObject::connect(&bridge, &EmbeddedBridge::uiPatch, &app,
                     [&](const QString &target, const QVariantList &patches) {
                         if (!jsUi || !uiRoot)
                             return;

                         if (target == QLatin1String("main") || target == QLatin1String("*") || target.isEmpty()) {
                             QVariantMap patch;
                             patch.insert(QStringLiteral("seq"), QVariant::fromValue(++uiPatchSeq));
                             patch.insert(QStringLiteral("patches"), patches);
                             uiRoot->setProperty("uiPatch", patch);
                         }
                     });

#ifdef Q_OS_ANDROID
    g_backBridge = &bridge;

    JNINativeMethod methods[] = {
        { const_cast<char *>("notifyBack"), const_cast<char *>("()V"),
          reinterpret_cast<void *>(pulsarNotifyBack) },
        { const_cast<char *>("filesPicked"), const_cast<char *>("(Ljava/lang/String;)V"),
          reinterpret_cast<void *>(pulsarFilesPicked) },
        { const_cast<char *>("fileExported"), const_cast<char *>("(Z)V"),
          reinterpret_cast<void *>(pulsarFileExported) },
        { const_cast<char *>("permissionResult"), const_cast<char *>("(Ljava/lang/String;Z)V"),
          reinterpret_cast<void *>(pulsarPermissionResult) },
        { const_cast<char *>("notificationClicked"), const_cast<char *>("(Ljava/lang/String;)V"),
          reinterpret_cast<void *>(pulsarNotificationClicked) },
        { const_cast<char *>("intentReceived"), const_cast<char *>("(Ljava/lang/String;)V"),
          reinterpret_cast<void *>(pulsarIntentReceived) },
    };

    JNINativeMethod mediaMethods[] = {
        { const_cast<char *>("nativeMediaEvent"), const_cast<char *>("(Ljava/lang/String;)V"),
          reinterpret_cast<void *>(pulsarMediaEvent) },
    };

    QJniEnvironment jniEnvironment;

    jniEnvironment.registerNativeMethods("com/pulsar/host/PulsarActivity", methods, 6);
    jniEnvironment.registerNativeMethods("com/pulsar/host/PulsarMediaService", mediaMethods, 1);
#endif

    pulsar::NetworkService network(&app);

    bridge.setNetwork(&network);

    QObject::connect(&network, &pulsar::NetworkService::response, &bridge,
                     [&bridge](quint32 id, int status, const QString &statusText, const QUrl &url,
                               const QMap<QString, QString> &headers) {
                         QJsonObject values;

                         for (auto it = headers.constBegin(); it != headers.constEnd(); ++it)
                             values.insert(it.key(), it.value());

                         QJsonObject data;
                         data.insert(QStringLiteral("id"), int(id));
                         data.insert(QStringLiteral("type"), QStringLiteral("response"));
                         data.insert(QStringLiteral("status"), status);
                         data.insert(QStringLiteral("statusText"), statusText);
                         data.insert(QStringLiteral("url"), url.toString());
                         data.insert(QStringLiteral("headers"), values);
                         bridge.notifyMethod(QStringLiteral("__net-event"), data);
                     });
    QObject::connect(&network, &pulsar::NetworkService::text, &bridge, [&bridge](quint32 id, const QString &chunk) {
        QJsonObject data;
        data.insert(QStringLiteral("id"), int(id));
        data.insert(QStringLiteral("type"), QStringLiteral("data"));
        data.insert(QStringLiteral("text"), chunk);
        bridge.notifyMethod(QStringLiteral("__net-event"), data);
    });
    QObject::connect(&network, &pulsar::NetworkService::binary, &bridge, [&bridge](quint32 id, const QByteArray &chunk) {
        bridge.notifyBinary(id, chunk);
    });
    QObject::connect(&network, &pulsar::NetworkService::finished, &bridge, [&bridge](quint32 id) {
        QJsonObject data;
        data.insert(QStringLiteral("id"), int(id));
        data.insert(QStringLiteral("type"), QStringLiteral("end"));
        bridge.notifyMethod(QStringLiteral("__net-event"), data);
    });
    QObject::connect(&network, &pulsar::NetworkService::failed, &bridge,
                     [&bridge](quint32 id, const QString &code, const QString &message) {
                         QJsonObject data;
                         data.insert(QStringLiteral("id"), int(id));
                         data.insert(QStringLiteral("type"), QStringLiteral("error"));
                         data.insert(QStringLiteral("code"), code);
                         data.insert(QStringLiteral("message"), message);
                         bridge.notifyMethod(QStringLiteral("__net-event"), data);
                     });
    QObject::connect(&network, &pulsar::NetworkService::wsOpened, &bridge,
                     [&bridge](quint32 id, const QString &protocol) {
                         QJsonObject data;
                         data.insert(QStringLiteral("id"), int(id));
                         data.insert(QStringLiteral("type"), QStringLiteral("open"));
                         data.insert(QStringLiteral("protocol"), protocol);
                         bridge.notifyMethod(QStringLiteral("__net-event"), data);
                     });
    QObject::connect(&network, &pulsar::NetworkService::wsText, &bridge,
                     [&bridge](quint32 id, const QString &message) {
                         QJsonObject data;
                         data.insert(QStringLiteral("id"), int(id));
                         data.insert(QStringLiteral("type"), QStringLiteral("message"));
                         data.insert(QStringLiteral("text"), message);
                         bridge.notifyMethod(QStringLiteral("__net-event"), data);
                     });
    QObject::connect(&network, &pulsar::NetworkService::wsBinary, &bridge,
                     [&bridge](quint32 id, const QByteArray &message) { bridge.notifyBinary(id, message); });
    QObject::connect(&network, &pulsar::NetworkService::wsClosed, &bridge,
                     [&bridge](quint32 id, int code, const QString &reason, bool wasClean) {
                         QJsonObject data;
                         data.insert(QStringLiteral("id"), int(id));
                         data.insert(QStringLiteral("type"), QStringLiteral("close"));
                         data.insert(QStringLiteral("code"), code);
                         data.insert(QStringLiteral("reason"), reason);
                         data.insert(QStringLiteral("wasClean"), wasClean);
                         bridge.notifyMethod(QStringLiteral("__net-event"), data);
                     });

    qmlRegisterSingletonInstance("Pulsar", 1, 0, "Pulsar", &bridge);
    qmlRegisterSingletonInstance("Pulsar", 1, 0, "Store", &store);
    engine.rootContext()->setContextProperty(QStringLiteral("PulsarBridge"), &bridge);
    engine.rootContext()->setContextProperty(QStringLiteral("PulsarWindowLabel"), QStringLiteral("main"));
    engine.rootContext()->setContextProperty(QStringLiteral("PulsarEmbedded"), true);

    QObject::connect(&runtime, &pulsar::QuickJsRuntime::message, &bridge, &EmbeddedBridge::handleMessage);
    QObject::connect(&runtime, &pulsar::QuickJsRuntime::failed, [&](const QString &message) {
        qWarning().noquote() << "pulsar: runtime failed:" << message;

        bridge.setErrorText(message);

#ifdef PULSAR_DEV
        if (devChannel)
            devChannel->sendLog(QStringLiteral("error"), message, QStringLiteral("runtime"));
#endif
    });
    QObject::connect(&bridge, &EmbeddedBridge::log, [&](const QString &level, const QString &message,
                                                        const QString &source) {
        qInfo().noquote() << QStringLiteral("LOG[%1/%2]").arg(source, level) << message;

#ifdef PULSAR_DEV
        if (devChannel)
            devChannel->sendLog(level, message, source);
#endif
    });
    QObject::connect(&engine, &QQmlEngine::warnings, [&](const QList<QQmlError> &warnings) {
        for (const QQmlError &warning : warnings) {
            const QString text = warning.toString();

            qWarning().noquote() << "QML:" << text;

#ifdef PULSAR_DEV
            if (devChannel)
                devChannel->sendLog(QStringLiteral("warn"), text, QStringLiteral("qml"));
#endif
        }
    });

    qInfo().noquote() << "pulsar: app dir" << dir;

#ifdef Q_OS_ANDROID
    auto *backHandler = new BackHandler(&bridge);
    app.installEventFilter(backHandler);

    QObject::connect(&app, &QGuiApplication::applicationStateChanged, &bridge,
                     [&bridge, last = app.applicationState()](Qt::ApplicationState state) mutable {
                         if (state == last)
                             return;

                         last = state;

                         if (state == Qt::ApplicationActive) {
                             bridge.notify(QStringLiteral("app-resume"), QJsonObject());
                             return;
                         }

                         QJsonObject data;
                         data.insert(QStringLiteral("state"),
                                     state == Qt::ApplicationSuspended ? QStringLiteral("suspended")
                                                                      : QStringLiteral("inactive"));
                         bridge.notify(QStringLiteral("app-pause"), data);

                         if (state == Qt::ApplicationSuspended)
                             bridge.notify(QStringLiteral("app-stop"), QJsonObject());
                     });
#endif

    auto snapshotStore = [&]() {
        QJsonObject state;

        for (const QString &key : store.keys())
            state.insert(key, QJsonValue::fromVariant(store.value(key)));

        return state;
    };

    auto loadUi = [&]() -> bool {
        if (jsUi) {
            if (uiRoot) {
                uiRoot->setProperty("tree", QVariantList());
                uiRoot->setProperty("errorText", QString());

                return true;
            }

            engine.load(QUrl(QStringLiteral("qrc:/runtime/PulsarView.qml")));
        } else {
            engine.load(QUrl::fromLocalFile(dir + QLatin1Char('/') + ui));
        }

        if (engine.rootObjects().isEmpty())
            return false;

        if (jsUi) {
            uiRoot = engine.rootObjects().first();

            if (hasPendingUiTree)
                uiRoot->setProperty("tree", pendingUiTree);

            if (!pendingError.isEmpty())
                uiRoot->setProperty("errorText", pendingError);

            if (!currentTheme.isEmpty())
                uiRoot->setProperty("themeData", currentTheme);
        }

        return true;
    };

    if (!runtime.start(dir + QStringLiteral("/runtime.js"), manifestJson, dir)) {
        qWarning().noquote() << "pulsar: cannot start the embedded runtime";
        return 1;
    }

    if (!loadUi()) {
        qWarning().noquote() << "pulsar: QML root is empty";
        return 1;
    }

    auto reloadApp = [&]() {
        QString nextDir = dir;

#ifdef PULSAR_DEV
        if (!devUrl.isEmpty()) {
            const pulsar::DevFetchResult fetched = pulsar::fetchDevApp(devUrl);

            if (fetched.ok)
                nextDir = fetched.dir;
        }
#endif

        const QString previousDir = dir;
        const QString previousManifest = manifestJson;
        const QString previousUi = ui;
        const bool previousJsUi = jsUi;

        readManifest(nextDir);

        if (jsUi != previousJsUi) {
            dir = previousDir;
            manifestJson = previousManifest;
            ui = previousUi;
            jsUi = previousJsUi;

            qWarning().noquote() << "pulsar: the UI kind changed; restarting the app";

#ifdef PULSAR_DEV
            if (devChannel)
                devChannel->requestReload();
#endif
            return;
        }

        const QJsonObject state = snapshotStore();

#ifdef PULSAR_DEV
        if (devChannel)
            devChannel->setTree(QVariantList());
#endif

        if (jsUi) {
            pendingUiTree.clear();
            hasPendingUiTree = false;
            pendingError.clear();

            if (uiRoot) {
                uiRoot->setProperty("tree", QVariantList());
                uiRoot->setProperty("errorText", QString());
            }
        } else {
            const QList<QObject *> roots = engine.rootObjects();

            for (QObject *root : roots)
                delete root;

            engine.clearComponentCache();
        }

        dir = nextDir;
        qputenv("PULSAR_APP", dir.toLocal8Bit());

        bridge.reset();
        runtime.setRestoreState(state);

        if (!runtime.restart(dir + QStringLiteral("/runtime.js"), manifestJson, dir)) {
            qWarning().noquote() << "pulsar: reload failed";

#ifdef PULSAR_DEV
            if (devChannel)
                devChannel->requestReload();
#endif
            return;
        }

        if (!loadUi()) {
            qWarning().noquote() << "pulsar: reload could not load the UI";

#ifdef PULSAR_DEV
            if (devChannel)
                devChannel->requestReload();
#endif
            return;
        }

#ifdef Q_OS_ANDROID
        for (QObject *root : engine.rootObjects())
            root->installEventFilter(backHandler);
#endif
    };

    QObject::connect(&bridge, &EmbeddedBridge::reloadRequested, &app, reloadApp);

#ifdef Q_OS_ANDROID
    for (QObject *root : engine.rootObjects())
        root->installEventFilter(backHandler);

    for (QWindow *window : QGuiApplication::allWindows())
        window->installEventFilter(backHandler);

    QObject::connect(&app, &QGuiApplication::focusWindowChanged, backHandler, [backHandler](QWindow *window) {
        if (window)
            window->installEventFilter(backHandler);
    });
#endif

    bridge.invoke(QStringLiteral("__sync"), QJSValue());

    int quitMs = qEnvironmentVariableIntValue("AUTO_QUIT_MS");

    if (quitMs > 0)
        QTimer::singleShot(quitMs, &app, &QGuiApplication::quit);

    return app.exec();
}
