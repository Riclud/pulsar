#include <QApplication>
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
#include <QHash>
#include <QJsonObject>
#include <QFileDialog>
#include <QFileInfo>
#include <QFileSystemWatcher>
#include <QMessageBox>
#include <QJSValue>
#include <QSet>
#include <QTimer>
#include <QUrl>
#include <QtQml/qqml.h>
#include <QtGlobal>

#include <utility>

#include "bridge.h"
#include "embedded.h"
#include "log.h"

static bool gErrorShown = false;
static bool gWatch = false;
static QFileSystemWatcher *gWatcher = nullptr;
static Bridge *gBridge = nullptr;

struct WindowConfig {
    QString label;
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

// Windows are addressed by label; they all share the Store and QML engine.
static QHash<QString, WindowConfig> g_configs;
static QHash<QString, QObject *> g_roots;
static QSet<QString> g_requested;
static QString gPrimaryLabel;
static bool gShownAny = false;

// Must match PROTOCOL_VERSION in core/runtime/protocol.ts.
static constexpr int kBridgeProtocolVersion = 1;

static QString appDir()
{
    const QByteArray a = qgetenv("PULSAR_APP");
    if (!a.isEmpty())
        return QFileInfo(QString::fromLocal8Bit(a)).absoluteFilePath();
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
    const QString path = fi.isAbsolute() ? rel : QDir(appDir()).absoluteFilePath(rel);
    return QUrl::fromLocalFile(path);
}

static void applyConfig(QObject *root, const WindowConfig &cfg)
{
    if (!root)
        return;
    auto *window = qobject_cast<QQuickWindow *>(root);
    if (!window) {
        // Non-window root (plain QML); fall back to generic properties.
        if (cfg.hasWidth)
            root->setProperty("width", cfg.width);
        if (cfg.hasHeight)
            root->setProperty("height", cfg.height);
        if (cfg.hasTitle)
            root->setProperty("title", cfg.title);
        return;
    }
    if (cfg.hasWidth)
        window->setWidth(cfg.width);
    if (cfg.hasHeight)
        window->setHeight(cfg.height);
    if (cfg.hasTitle)
        window->setTitle(cfg.title);
    if (cfg.hasMinWidth)
        window->setMinimumWidth(cfg.minWidth);
    if (cfg.hasMinHeight)
        window->setMinimumHeight(cfg.minHeight);
    if (cfg.hasMaxWidth)
        window->setMaximumWidth(cfg.maxWidth);
    if (cfg.hasMaxHeight)
        window->setMaximumHeight(cfg.maxHeight);
    if (cfg.hasResizable)
        window->setProperty("resizable", cfg.resizable);
    if (cfg.hasFrameless) {
        Qt::WindowFlags flags = window->flags();
        if (cfg.frameless)
            flags |= Qt::FramelessWindowHint;
        else
            flags &= ~Qt::FramelessWindowHint;
        window->setFlags(flags);
    }
    if (cfg.hasIcon && !cfg.icon.isEmpty())
        window->setIcon(QIcon(cfg.icon));
}

template <typename T>
static bool setIfPresent(const QVariantMap &map, const QString &key, T &out)
{
    if (!map.contains(key))
        return false;
    out = static_cast<T>(map.value(key).template value<T>());
    return true;
}

static WindowConfig parseWindowConfig(const QVariantMap &m, const QString &fallbackLabel)
{
    WindowConfig c;
    c.label = m.value(QStringLiteral("label")).toString();
    if (c.label.isEmpty())
        c.label = fallbackLabel;
    c.ui = m.value(QStringLiteral("ui")).toString();
    if (m.contains(QStringLiteral("width"))) {
        c.width = m.value(QStringLiteral("width")).toInt();
        c.hasWidth = true;
    }
    if (m.contains(QStringLiteral("height"))) {
        c.height = m.value(QStringLiteral("height")).toInt();
        c.hasHeight = true;
    }
    if (m.contains(QStringLiteral("title"))) {
        c.title = m.value(QStringLiteral("title")).toString();
        c.hasTitle = true;
    }
    c.hasMinWidth = setIfPresent(m, QStringLiteral("minWidth"), c.minWidth);
    c.hasMinHeight = setIfPresent(m, QStringLiteral("minHeight"), c.minHeight);
    c.hasMaxWidth = setIfPresent(m, QStringLiteral("maxWidth"), c.maxWidth);
    c.hasMaxHeight = setIfPresent(m, QStringLiteral("maxHeight"), c.maxHeight);
    c.hasResizable = setIfPresent(m, QStringLiteral("resizable"), c.resizable);
    c.hasFrameless = setIfPresent(m, QStringLiteral("frameless"), c.frameless);
    if (m.contains(QStringLiteral("icon"))) {
        c.icon = m.value(QStringLiteral("icon")).toString();
        c.hasIcon = true;
    }
    return c;
}

static void logWindowConfig(const WindowConfig &c)
{
    if (!qEnvironmentVariableIsSet("PULSAR_DEBUG"))
        return;
    qInfo().noquote() << "CONFIG window" << c.label << "ui=" << c.ui
                      << "size=" << c.width << "x" << c.height << "title=" << c.title
                      << "min=" << c.minWidth << "x" << c.minHeight
                      << "max=" << c.maxWidth << "x" << c.maxHeight
                      << "resizable=" << c.resizable << "frameless=" << c.frameless;
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

static void watchQmlFile(const QUrl &url)
{
    if (!gWatch || !gWatcher)
        return;
    const QString path = url.toLocalFile();
    if (path.isEmpty())
        return;
    if (!gWatcher->files().contains(path))
        gWatcher->addPath(path);
}

static void wireWindowEvents(QObject *root, const QString &label);

static void showWindow(QQmlApplicationEngine &engine, const WindowConfig &cfg)
{
    const QUrl url = resolveUi(cfg.ui);
    g_requested.insert(cfg.label);
    gShownAny = true;
    watchQmlFile(url);

    QQmlComponent component(&engine, url, QQmlComponent::PreferSynchronous);
    if (component.isError()) {
        QStringList errors;
        for (const QQmlError &e : component.errors())
            errors << e.toString();
        showErrorView(engine, errors.join(QLatin1Char('\n')));
        return;
    }

    // Each window gets its own context so QML can read its own label
    // (PulsarWindowLabel) and filter backend events addressed to it.
    QQmlContext *context = new QQmlContext(engine.rootContext(), &engine);
    context->setContextProperty(QStringLiteral("PulsarWindowLabel"), cfg.label);

    QObject *root = component.create(context);
    if (!root) {
        QStringList errors;
        for (const QQmlError &e : component.errors())
            errors << e.toString();
        showErrorView(engine, errors.join(QLatin1Char('\n')));
        return;
    }

    applyConfig(root, cfg);
    g_roots.insert(cfg.label, root);
    wireWindowEvents(root, cfg.label);
}

static void destroyWindows(QQmlApplicationEngine &engine)
{
    for (QObject *root : std::as_const(g_roots))
        delete root;
    g_roots.clear();
    g_requested.clear();
    engine.clearComponentCache();
    if (gWatcher)
        gWatcher->removePaths(gWatcher->files());
}

/// Send a lifecycle event to the runtime (dispatched as an App event).
static void emitWindowEvent(const QString &name, const QString &label, const QJsonObject &extra = {})
{
    if (!gBridge)
        return;
    QJsonObject data = extra;
    if (!label.isEmpty())
        data.insert(QStringLiteral("label"), label);
    QJsonObject params;
    params.insert(QStringLiteral("name"), name);
    params.insert(QStringLiteral("data"), data);
    gBridge->notify(QStringLiteral("__event"), params);
}

static QString windowStateName(Qt::WindowState state)
{
    switch (state) {
    case Qt::WindowMinimized:
        return QStringLiteral("minimized");
    case Qt::WindowMaximized:
        return QStringLiteral("maximized");
    case Qt::WindowFullScreen:
        return QStringLiteral("fullscreen");
    default:
        return QStringLiteral("normal");
    }
}

/// Connect a window's signals to window-* lifecycle events for the app.
static void wireWindowEvents(QObject *root, const QString &label)
{
    auto *window = qobject_cast<QQuickWindow *>(root);
    if (!window)
        return;

    auto *sizeTimer = new QTimer(window);
    sizeTimer->setSingleShot(true);
    sizeTimer->setInterval(50);
    QObject::connect(sizeTimer, &QTimer::timeout, window, [window, label]() {
        QJsonObject extra;
        extra.insert(QStringLiteral("width"), window->width());
        extra.insert(QStringLiteral("height"), window->height());
        emitWindowEvent(QStringLiteral("window-resize"), label, extra);
    });
    QObject::connect(window, &QQuickWindow::widthChanged, sizeTimer, qOverload<>(&QTimer::start));
    QObject::connect(window, &QQuickWindow::heightChanged, sizeTimer, qOverload<>(&QTimer::start));

    auto *moveTimer = new QTimer(window);
    moveTimer->setSingleShot(true);
    moveTimer->setInterval(50);
    QObject::connect(moveTimer, &QTimer::timeout, window, [window, label]() {
        QJsonObject extra;
        extra.insert(QStringLiteral("x"), window->x());
        extra.insert(QStringLiteral("y"), window->y());
        emitWindowEvent(QStringLiteral("window-move"), label, extra);
    });
    QObject::connect(window, &QQuickWindow::xChanged, moveTimer, qOverload<>(&QTimer::start));
    QObject::connect(window, &QQuickWindow::yChanged, moveTimer, qOverload<>(&QTimer::start));

    QObject::connect(window, &QQuickWindow::windowStateChanged, window, [label](Qt::WindowState state) {
        QJsonObject extra;
        extra.insert(QStringLiteral("state"), windowStateName(state));
        emitWindowEvent(QStringLiteral("window-state"), label, extra);
    });
    QObject::connect(window, &QQuickWindow::activeChanged, window, [window, label]() {
        emitWindowEvent(window->isActive() ? QStringLiteral("window-focus") : QStringLiteral("window-blur"), label);
    });
    QObject::connect(window, &QQuickWindow::visibleChanged, window, [window, label]() {
        emitWindowEvent(window->isVisible() ? QStringLiteral("window-show") : QStringLiteral("window-hide"), label);
    });
    QObject::connect(window, &QQuickWindow::closing, window, [label](QQuickCloseEvent *) {
        emitWindowEvent(QStringLiteral("window-close"), label);
    });
}

static void handleDialogRequest(const QVariantMap &m)
{
    Bridge *bridge = gBridge;
    if (!bridge)
        return;

    const QString token = m.value(QStringLiteral("token")).toString();
    const QString kind = m.value(QStringLiteral("kind")).toString();
    const QString title = m.value(QStringLiteral("title")).toString();
    const QString filter = m.value(QStringLiteral("filter")).toString();
    const QString dir = m.value(QStringLiteral("dir")).toString();
    const QString text = m.value(QStringLiteral("text")).toString();

    // Headless/test hook: skip the modal dialog and return a stub result.
    const QByteArray stub = qgetenv("PULSAR_DIALOG_STUB");
    if (!stub.isEmpty()) {
        QJsonObject params;
        params.insert(QStringLiteral("token"), token);
        params.insert(QStringLiteral("value"),
                      kind == QLatin1String("message") ? QJsonValue(true)
                                                       : QJsonValue(QString::fromLocal8Bit(stub)));
        bridge->notify(QStringLiteral("__dialog-result"), params);
        return;
    }

    // Defer out of the response handler before opening a modal dialog.
    QTimer::singleShot(0, QCoreApplication::instance(),
                       [bridge, token, kind, title, filter, dir, text]() {
                           QString result;
                           if (kind == QLatin1String("open"))
                               result = QFileDialog::getOpenFileName(nullptr, title, dir, filter);
                           else if (kind == QLatin1String("save"))
                               result = QFileDialog::getSaveFileName(nullptr, title, dir, filter);
                           else if (kind == QLatin1String("message"))
                               QMessageBox::information(nullptr, title, text);

                           QJsonObject params;
                           params.insert(QStringLiteral("token"), token);
                           if (kind == QLatin1String("message"))
                               params.insert(QStringLiteral("value"), true);
                           else if (result.isEmpty())
                               params.insert(QStringLiteral("value"), QJsonValue::Null);
                           else
                               params.insert(QStringLiteral("value"), result);
                           bridge->notify(QStringLiteral("__dialog-result"), params);
                       });
}

static void handleTrayCommand(const QVariantMap &m)
{
    if (!gBridge)
        return;
    const QString action = m.value(QStringLiteral("action")).toString();
    if (action == QLatin1String("setIcon"))
        gBridge->setTrayIcon(m.value(QStringLiteral("path")).toString());
    else if (action == QLatin1String("setTooltip"))
        gBridge->setTrayTooltip(m.value(QStringLiteral("text")).toString());
    else if (action == QLatin1String("setMenu"))
        gBridge->setTrayMenu(m.value(QStringLiteral("items")).toList());
    else if (action == QLatin1String("hide"))
        gBridge->hideTray();
}

static void handleWindowCommand(QQmlApplicationEngine &engine, const QVariantMap &m)
{
    QString label = m.value(QStringLiteral("label")).toString();
    const QString action = m.value(QStringLiteral("action")).toString();

    // Runtime window creation: build the window on demand (windows are no
    // longer limited to those declared in pulsar.json).
    if (action == QLatin1String("create")) {
        WindowConfig cfg = parseWindowConfig(m, label);
        if (cfg.label.isEmpty())
            return;
        if (qEnvironmentVariableIsSet("PULSAR_DEBUG"))
            qInfo().noquote() << "WINDOW" << action << cfg.label;
        if (gPrimaryLabel.isEmpty())
            gPrimaryLabel = cfg.label;
        g_configs.insert(cfg.label, cfg);
        logWindowConfig(cfg);
        if (g_roots.contains(cfg.label)) {
            applyConfig(g_roots.value(cfg.label), cfg);
            if (auto *existing = qobject_cast<QQuickWindow *>(g_roots.value(cfg.label)))
                existing->show();
        } else {
            showWindow(engine, cfg);
        }
        return;
    }

    if (label.isEmpty())
        label = gPrimaryLabel;

    if (action == QLatin1String("destroy")) {
        if (qEnvironmentVariableIsSet("PULSAR_DEBUG"))
            qInfo().noquote() << "WINDOW" << action << label;
        g_configs.remove(label);
        g_requested.remove(label);
        if (QObject *root = g_roots.take(label))
            root->deleteLater();
        return;
    }

    if (qEnvironmentVariableIsSet("PULSAR_DEBUG"))
        qInfo().noquote() << "WINDOW" << action << label;
    auto *window = qobject_cast<QQuickWindow *>(g_roots.value(label));
    if (!window)
        return;
    if (action == QLatin1String("show"))
        window->show();
    else if (action == QLatin1String("hide"))
        window->hide();
    else if (action == QLatin1String("close"))
        window->close();
    else if (action == QLatin1String("focus"))
        window->requestActivate();
    else if (action == QLatin1String("minimize"))
        window->showMinimized();
    else if (action == QLatin1String("maximize"))
        window->showMaximized();
    else if (action == QLatin1String("restore"))
        window->showNormal();
    else if (action == QLatin1String("setTitle"))
        window->setTitle(m.value(QStringLiteral("title")).toString());
    else if (action == QLatin1String("setSize")) {
        window->setWidth(m.value(QStringLiteral("width")).toInt());
        window->setHeight(m.value(QStringLiteral("height")).toInt());
    } else if (action == QLatin1String("setPosition")) {
        window->setX(m.value(QStringLiteral("x")).toInt());
        window->setY(m.value(QStringLiteral("y")).toInt());
    } else if (action == QLatin1String("fullscreen")) {
        if (m.value(QStringLiteral("value")).toBool())
            window->showFullScreen();
        else
            window->showNormal();
    } else if (action == QLatin1String("alwaysOnTop")) {
        window->setFlag(Qt::WindowStaysOnTopHint, m.value(QStringLiteral("value")).toBool());
    }
}

int main(int argc, char **argv)
{
    pulsar::initLogs();

    // QApplication (Widgets) so native dialogs and the tray work; QQml works
    // with it as well.
    QApplication app(argc, argv);
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

    // Keep the runtime's idea of the app directory in sync with the host's, so
    // it finds pulsar.json even when launched without PULSAR_APP (e.g. dev).
    if (qEnvironmentVariableIsEmpty("PULSAR_APP"))
        qputenv("PULSAR_APP", appDir().toLocal8Bit());

    QQmlApplicationEngine engine;

    // Types are owned by `app` so they outlive the engine.
    QQmlPropertyMap *store = new QQmlPropertyMap(&app);
    Bridge *bridge = new Bridge(&engine, store, &app);

// Exposed to QML as `import Pulsar 1.0` -> Pulsar.emit(...) / Store.*
    qmlRegisterSingletonInstance("Pulsar", 1, 0, "Pulsar", bridge);
    qmlRegisterSingletonInstance("Pulsar", 1, 0, "Store", store);

    gWatch = watchMode();
    gBridge = bridge;

    // Forward QML console messages to the runtime so the app can observe them.
    pulsar::setLogSink([bridge](const QString &level, const QString &message, const QString &file, int line) {
        QJsonObject params;
        params.insert(QStringLiteral("level"), level);
        params.insert(QStringLiteral("source"), QStringLiteral("qml"));
        params.insert(QStringLiteral("message"), message);
        params.insert(QStringLiteral("file"), QFileInfo(file).fileName());
        params.insert(QStringLiteral("line"), line);
        bridge->notify(QStringLiteral("__log"), params);
    });

    gWatcher = new QFileSystemWatcher(&app);
    QObject::connect(gWatcher, &QFileSystemWatcher::fileChanged, &app, [&engine]() {
        qInfo().noquote() << "qml changed; reloading";
        destroyWindows(engine);
        for (const WindowConfig &cfg : std::as_const(g_configs))
            showWindow(engine, cfg);
        requestFullSync();
    });

    // The app (Bun) configures the window via a __config notification. In
    // watch mode a repeated __config means the JS side reloaded (bun --watch),
    // so the QML view and the store snapshot are refreshed too.
    QObject::connect(bridge, &Bridge::notification, &app,
                     [&engine, bridge](const QString &method, const QJSValue &params) {
                         if (method == QLatin1String("__config")) {
                             const QVariantMap m = params.toVariant().toMap();
                             const QVariantList wins = m.value(QStringLiteral("windows")).toList();

                             QList<WindowConfig> configs;
                             if (wins.isEmpty()) {
                                 configs.append(parseWindowConfig(m, QStringLiteral("main")));
                             } else {
                                 for (int i = 0; i < wins.size(); ++i)
                                     configs.append(parseWindowConfig(
                                         wins.at(i).toMap(),
                                         i == 0 ? QStringLiteral("main")
                                                : QStringLiteral("window-%1").arg(i + 1)));
                             }

                             // In watch mode a repeated __config means the runtime restarted.
                             if (gWatch && gShownAny)
                                 destroyWindows(engine);

                             for (const WindowConfig &cfg : std::as_const(configs)) {
                                 if (gPrimaryLabel.isEmpty())
                                     gPrimaryLabel = cfg.label;
                                 g_configs.insert(cfg.label, cfg);
                                 logWindowConfig(cfg);
                                 if (g_requested.contains(cfg.label))
                                     applyConfig(g_roots.value(cfg.label), cfg);
                                 else
                                     showWindow(engine, cfg);
                             }
                         } else if (method == QLatin1String("__quit")) {
                             QCoreApplication::quit();
                         } else if (method == QLatin1String("__reload")) {
                             // Dev hot reload: the runtime saw app changes.
                             if (gWatch)
                                 bridge->restart();
                         } else if (method == QLatin1String("__log")) {
                             // Runtime log line; re-emit it as a QML signal.
                             const QVariantMap m = params.toVariant().toMap();
                             bridge->postLog(m.value(QStringLiteral("level")).toString(),
                                             m.value(QStringLiteral("message")).toString(),
                                             m.value(QStringLiteral("source")).toString());
                         } else if (method == QLatin1String("__window")) {
                             handleWindowCommand(engine, params.toVariant().toMap());
                         } else if (method == QLatin1String("__emit")) {
                             // Backend -> UI event; QML filters by PulsarWindowLabel.
                             const QVariantMap m = params.toVariant().toMap();
                             bridge->postMessage(m.value(QStringLiteral("event")).toString(),
                                                 m.value(QStringLiteral("payload")),
                                                 m.value(QStringLiteral("target")).toString());
                         } else if (method == QLatin1String("__dialog")) {
                             handleDialogRequest(params.toVariant().toMap());
                         } else if (method == QLatin1String("__tray")) {
                             handleTrayCommand(params.toVariant().toMap());
                         } else if (method == QLatin1String("__hello")) {
                             const QVariantMap m = params.toVariant().toMap();
                             const int protocol = m.value(QStringLiteral("protocol")).toInt();
                             if (qEnvironmentVariableIsSet("PULSAR_DEBUG") || protocol != kBridgeProtocolVersion)
                                 qInfo().noquote()
                                     << "HELLO runtime=" << m.value(QStringLiteral("runtime")).toString()
                                     << "protocol=" << protocol
                                     << "capabilities="
                                     << m.value(QStringLiteral("capabilities")).toStringList().size();
                             if (protocol != kBridgeProtocolVersion)
                                 qWarning().noquote() << "bridge protocol" << protocol
                                                      << "!= host protocol" << kBridgeProtocolVersion;
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

    // Lifecycle: tell the app when the last window is gone.
    QObject::connect(&app, &QGuiApplication::lastWindowClosed, &app, []() {
        emitWindowEvent(QStringLiteral("window-all-closed"), QString());
    });

    // Collect QML loading errors so the fallback view can explain failures.
    QObject::connect(&engine, &QQmlEngine::warnings, &app, [](const QList<QQmlError> &list) {
        for (const QQmlError &e : list)
            qWarning().noquote() << "qml:" << e.toString();
    });

    // QML_MAIN forces a specific file (used by tests); otherwise wait for the
    // app config, with a fallback to <app>/ui/main.qml.
    const QByteArray qmlOverride = qgetenv("QML_MAIN");
    if (!qmlOverride.isEmpty()) {
        WindowConfig cfg;
        cfg.label = QStringLiteral("main");
        cfg.ui = QString::fromLocal8Bit(qmlOverride);
        g_configs.insert(cfg.label, cfg);
        gPrimaryLabel = cfg.label;
        showWindow(engine, cfg);
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
            if (gShownAny)
                return;
            WindowConfig cfg;
            cfg.label = QStringLiteral("main");
            g_configs.insert(cfg.label, cfg);
            gPrimaryLabel = cfg.label;
            showWindow(engine, cfg);
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
