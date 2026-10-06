#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlError>
#include <QQmlPropertyMap>
#include <QQuickWindow>
#include <QIcon>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QFileSystemWatcher>
#include <QJSValue>
#include <QTimer>
#include <QUrl>
#include <QtQml/qqml.h>
#include <QtGlobal>

#include "bridge.h"
#include "embedded.h"
#include "log.h"

static QStringList gQmlErrors;
static bool gErrorShown = false;
static bool gWatch = false;
static bool gLoaded = false;
static QUrl gLoadedUrl;
static QFileSystemWatcher *gWatcher = nullptr;
static Bridge *gBridge = nullptr;

struct WindowConfig {
    QString ui;
    int width = 0;
    int height = 0;
    bool hasWidth = false;
    bool hasHeight = false;
    QString title;
    bool hasTitle = false;
    int minWidth = 0;
    int minHeight = 0;
    int maxWidth = 0;
    int maxHeight = 0;
    bool hasMinWidth = false;
    bool hasMinHeight = false;
    bool hasMaxWidth = false;
    bool hasMaxHeight = false;
    bool resizable = false;
    bool hasResizable = false;
    bool frameless = false;
    bool hasFrameless = false;
    QString icon;
    bool hasIcon = false;
};

static WindowConfig g_config;

static QString appDir()
{
    const QByteArray a = qgetenv("PULSAR_APP");
    if (!a.isEmpty())
        return QString::fromLocal8Bit(a);
    // Dev convenience: running the host from the repo root loads the example.
    const QString dev = QDir::current().filePath(QStringLiteral("examples/hello"));
    if (QFileInfo::exists(dev))
        return dev;
    return QDir::currentPath();
}

static QUrl resolveUi(const QString &ui)
{
    const QString rel = ui.isEmpty() ? QStringLiteral("ui/main.qml") : ui;
    const QFileInfo fi(rel);
    const QString path = fi.isAbsolute() ? rel : QDir(appDir()).filePath(rel);
    return QUrl::fromLocalFile(path);
}

static void applyConfig(QObject *root)
{
    if (!root)
        return;
    auto *window = qobject_cast<QQuickWindow *>(root);
    if (!window) {
        // Non-window root (plain QML); fall back to generic properties.
        if (g_config.hasWidth)
            root->setProperty("width", g_config.width);
        if (g_config.hasHeight)
            root->setProperty("height", g_config.height);
        if (g_config.hasTitle)
            root->setProperty("title", g_config.title);
        return;
    }
    if (g_config.hasWidth)
        window->setWidth(g_config.width);
    if (g_config.hasHeight)
        window->setHeight(g_config.height);
    if (g_config.hasTitle)
        window->setTitle(g_config.title);
    if (g_config.hasMinWidth)
        window->setMinimumWidth(g_config.minWidth);
    if (g_config.hasMinHeight)
        window->setMinimumHeight(g_config.minHeight);
    if (g_config.hasMaxWidth)
        window->setMaximumWidth(g_config.maxWidth);
    if (g_config.hasMaxHeight)
        window->setMaximumHeight(g_config.maxHeight);
    if (g_config.hasResizable)
        window->setProperty("resizable", g_config.resizable);
    if (g_config.hasFrameless) {
        Qt::WindowFlags flags = window->flags();
        if (g_config.frameless)
            flags |= Qt::FramelessWindowHint;
        else
            flags &= ~Qt::FramelessWindowHint;
        window->setFlags(flags);
    }
    if (g_config.hasIcon && !g_config.icon.isEmpty())
        window->setIcon(QIcon(g_config.icon));
}

template <typename T>
static bool setIfPresent(const QVariantMap &map, const QString &key, T &out)
{
    if (!map.contains(key))
        return false;
    out = static_cast<T>(map.value(key).template value<T>());
    return true;
}

// Fallback window shown when the app's QML fails to load, instead of exiting
// silently.
static void showErrorView(QQmlApplicationEngine &engine, const QString &detail)
{
    if (gErrorShown)
        return;
    gErrorShown = true;

    qCritical().noquote() << "pulsar: app failed to load";
    qCritical().noquote() << detail;

    engine.rootContext()->setContextProperty(QStringLiteral("PulsarStartupError"), detail);

    const QByteArray qml = QByteArrayLiteral(
        "import QtQuick\n"
        "import QtQuick.Controls\n"
        "\n"
        "ApplicationWindow {\n"
        "    visible: true\n"
        "    width: 720\n"
        "    height: 460\n"
        "    title: \"Pulsar - app failed to start\"\n"
        "    color: \"#15121c\"\n"
        "\n"
        "    Column {\n"
        "        anchors.centerIn: parent\n"
        "        width: parent.width - 48\n"
        "        spacing: 16\n"
        "\n"
        "        Label {\n"
        "            anchors.horizontalCenter: parent.horizontalCenter\n"
        "            text: \"Pulsar could not load the app\"\n"
        "            font.pixelSize: 22\n"
        "            font.bold: true\n"
        "            color: \"#ff6b6b\"\n"
        "        }\n"
        "\n"
        "        Rectangle {\n"
        "            width: parent.width\n"
        "            height: 1\n"
        "            color: \"#3a3547\"\n"
        "        }\n"
        "\n"
        "        Text {\n"
        "            width: parent.width\n"
        "            wrapMode: Text.Wrap\n"
        "            horizontalAlignment: Text.AlignHCenter\n"
        "            font.family: \"monospace\"\n"
        "            color: \"#d8d4e8\"\n"
        "            text: PulsarStartupError\n"
        "        }\n"
        "\n"
        "        Label {\n"
        "            anchors.horizontalCenter: parent.horizontalCenter\n"
        "            text: \"Close this window to quit.\"\n"
        "            color: \"#8a8499\"\n"
        "        }\n"
        "    }\n"
        "}\n");

    QQmlComponent component(&engine);
    component.setData(qml, QUrl(QStringLiteral("qrc:/pulsar/ErrorView.qml")));
    QObject *view = component.create();
    if (!view) {
        qCritical().noquote() << "pulsar: could not create the error view:";
        for (const QQmlError &e : component.errors())
            qCritical().noquote() << e.toString();
    }
}

static bool watchMode()
{
    static const bool w = qEnvironmentVariableIsSet("PULSAR_WATCH");
    return w;
}

static void requestFullSync()
{
    if (gBridge)
        gBridge->invoke(QStringLiteral("__sync"), QJSValue());
}

static void rebaseWatcher(const QUrl &url)
{
    if (!gWatch || !gWatcher)
        return;
    const QString path = url.toLocalFile();
    if (path.isEmpty())
        return;
    gWatcher->removePaths(gWatcher->files());
    gWatcher->addPath(path);
}

static void showUi(QQmlApplicationEngine &engine, const QUrl &url)
{
    gLoaded = true;
    gLoadedUrl = url;
    engine.load(url);
    rebaseWatcher(url);
}

static void reloadUi(QQmlApplicationEngine &engine, const QUrl &url)
{
    qInfo().noquote() << "reload ui:" << url.toString();
    const QList<QObject*> roots = engine.rootObjects();
    for (QObject *root : roots)
        delete root;
    engine.clearComponentCache();
    showUi(engine, url);
    requestFullSync();
}

int main(int argc, char **argv)
{
    pulsar::initLogs();

    QGuiApplication app(argc, argv);
    app.setOrganizationName(QStringLiteral("Pulsar"));
    app.setApplicationName(QStringLiteral("pulsar-host"));

    // Single-file distribution: if this executable carries an appended payload,
    // extract it and point the runtime/bridge at the extracted tree.
    QString embeddedRoot;
    if (pulsarExtractEmbedded(QCoreApplication::applicationFilePath(), &embeddedRoot)) {
        QString runtime = embeddedRoot + QStringLiteral("/runtime");
        if (!QFileInfo::exists(runtime) && QFileInfo::exists(runtime + QStringLiteral(".exe")))
            runtime += QStringLiteral(".exe");
        qputenv("PULSAR_ROOT", embeddedRoot.toLocal8Bit());
        qputenv("PULSAR_APP", (embeddedRoot + QStringLiteral("/app")).toLocal8Bit());
        qputenv("PULSAR_RUNTIME", runtime.toLocal8Bit());
        qInfo().noquote() << "pulsar: extracted embedded app to" << embeddedRoot;
    }

    QQmlApplicationEngine engine;

    // Types are owned by `app` so they outlive the engine.
    QQmlPropertyMap *store = new QQmlPropertyMap(&app);
    Bridge *bridge = new Bridge(&engine, store, &app);

// Exposed to QML as `import Pulsar 1.0` -> Pulsar.emit(...) / Store.*
    qmlRegisterSingletonInstance("Pulsar", 1, 0, "Pulsar", bridge);
    qmlRegisterSingletonInstance("Pulsar", 1, 0, "Store", store);

    gWatch = watchMode();
    gBridge = bridge;

    gWatcher = new QFileSystemWatcher(&app);
    QObject::connect(gWatcher, &QFileSystemWatcher::fileChanged, &app, [&engine]() {
        qInfo().noquote() << "qml changed; reloading";
        reloadUi(engine, gLoadedUrl);
        applyConfig(engine.rootObjects().value(0));
    });

    // The app (Bun) configures the window via a __config notification. In
    // watch mode a repeated __config means the JS side reloaded (bun --watch),
    // so the QML view and the store snapshot are refreshed too.
    QObject::connect(bridge, &Bridge::notification, &app,
                     [&engine, bridge](const QString &method, const QJSValue &params) {
                         if (method == QLatin1String("__config")) {
                             const QVariantMap m = params.toVariant().toMap();
                             g_config.ui = m.value(QStringLiteral("ui")).toString();
                             if (m.contains(QStringLiteral("width"))) {
                                 g_config.width = m.value(QStringLiteral("width")).toInt();
                                 g_config.hasWidth = true;
                             }
                             if (m.contains(QStringLiteral("height"))) {
                                 g_config.height = m.value(QStringLiteral("height")).toInt();
                                 g_config.hasHeight = true;
                             }
                             if (m.contains(QStringLiteral("title"))) {
g_config.title = m.value(QStringLiteral("title")).toString();
                                  g_config.hasTitle = true;
                              }
                              g_config.hasMinWidth = setIfPresent(m, "minWidth", g_config.minWidth);
                              g_config.hasMinHeight = setIfPresent(m, "minHeight", g_config.minHeight);
                              g_config.hasMaxWidth = setIfPresent(m, "maxWidth", g_config.maxWidth);
                              g_config.hasMaxHeight = setIfPresent(m, "maxHeight", g_config.maxHeight);
                              g_config.hasResizable = setIfPresent(m, "resizable", g_config.resizable);
                              g_config.hasFrameless = setIfPresent(m, "frameless", g_config.frameless);
                              if (m.contains(QStringLiteral("icon"))) {
                                  g_config.icon = m.value(QStringLiteral("icon")).toString();
                                  g_config.hasIcon = true;
                              }
                              if (qEnvironmentVariableIsSet("PULSAR_DEBUG"))
                                  qInfo().noquote() << "CONFIG ui=" << g_config.ui
                                                    << "size=" << g_config.width << "x" << g_config.height
                                                    << "title=" << g_config.title
                                                    << "min=" << g_config.minWidth << "x" << g_config.minHeight
                                                    << "max=" << g_config.maxWidth << "x" << g_config.maxHeight
                                                    << "resizable=" << g_config.resizable
                                                    << "frameless=" << g_config.frameless;
                             if (!gLoaded)
                                 showUi(engine, resolveUi(g_config.ui));
                             else if (gWatch)
                                 reloadUi(engine, resolveUi(g_config.ui));
                             else
                                 applyConfig(engine.rootObjects().value(0));
                         } else if (method == QLatin1String("__quit")) {
                             QCoreApplication::quit();
                         } else if (method == QLatin1String("__reload")) {
                             // Dev hot reload: the runtime saw app changes.
                             if (gWatch)
                                 bridge->restart();
                         } else if (method == QLatin1String("__error")) {
                             const QVariantMap m = params.toVariant().toMap();
                             qCritical().noquote()
                                 << "app error in" << m.value(QStringLiteral("scope")).toString()
                                 << ":" << m.value(QStringLiteral("message")).toString();
                         }
                     });

    // Bun supervision: the bridge reports if the runtime dies.
    QObject::connect(bridge, &Bridge::crashed, &app, [](const QString &kind, int code) {
        qWarning().noquote() << "bun crashed: kind=" << kind << "code=" << code;
    });

    // Collect QML loading errors so the fallback view can explain failures.
    QObject::connect(&engine, &QQmlEngine::warnings, &app, [](const QList<QQmlError> &list) {
        for (const QQmlError &e : list)
            gQmlErrors << e.toString();
    });

    QObject::connect(&engine, &QQmlApplicationEngine::objectCreated, &app,
                     [&engine](QObject *obj, const QUrl &objUrl) {
                         if (!gLoadedUrl.isValid() || objUrl != gLoadedUrl)
                             return;
                         if (!obj) {
                             showErrorView(engine,
                                           gQmlErrors.isEmpty()
                                               ? QStringLiteral("The app UI could not be loaded.")
                                               : gQmlErrors.join(QLatin1Char('\n')));
                         } else {
                             applyConfig(obj);
                         }
                     },
                     Qt::QueuedConnection);

    // QML_MAIN forces a specific file (used by tests); otherwise wait for the
    // app config, with a fallback to <app>/ui/main.qml.
    const QByteArray qmlOverride = qgetenv("QML_MAIN");
    if (!qmlOverride.isEmpty()) {
        showUi(engine, QUrl::fromLocalFile(QString::fromLocal8Bit(qmlOverride)));
    } else {
        bool cfgOk = false;
        int timeout = qEnvironmentVariableIntValue("PULSAR_CONFIG_TIMEOUT_MS", &cfgOk);
        if (!cfgOk || timeout <= 0)
            timeout = 700;
        QTimer *fallback = new QTimer(&app);
        fallback->setSingleShot(true);
        QObject::connect(fallback, &QTimer::timeout, &app, [&engine]() {
            // The app may already have configured the UI via __config; only
            // fall back when nothing has been shown yet.
            if (!gLoaded)
                showUi(engine, resolveUi(QString()));
        });
        fallback->start(timeout);
    }

    bool ok = false;
    const int autoQuit = qEnvironmentVariableIntValue("AUTO_QUIT_MS", &ok);
    if (ok && autoQuit > 0) {
        QTimer *quitTimer = new QTimer(&app);
        quitTimer->setSingleShot(true);
        QObject::connect(quitTimer, &QTimer::timeout, &app, &QCoreApplication::quit);
        quitTimer->start(autoQuit);
    }

    const int selfTest = qEnvironmentVariableIntValue("SELFTEST", &ok);
    if (ok && selfTest > 0) {
        QObject::connect(bridge, &Bridge::response,
                         [](qint64 id, const QJSValue &result, const QJSValue &error) {
                             qInfo().noquote().nospace() << "SELFTEST resp id=" << id
                                                         << " result=" << result.toString()
                                                         << " error=" << error.toString();
                         });
        QTimer *selfTestTimer = new QTimer(&app);
        selfTestTimer->setSingleShot(true);
        QObject::connect(selfTestTimer, &QTimer::timeout, &app, [&engine, bridge]() {
            qInfo() << "SELFTEST emit greet";
            QJSValue params = engine.newObject();
            params.setProperty(QStringLiteral("name"), QJSValue(QStringLiteral("SelfTest")));
            bridge->invoke(QStringLiteral("greet"), params);
        });
        selfTestTimer->start(selfTest);
    }

    return app.exec();
}
