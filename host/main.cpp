#include <QApplication>
#include <QClipboard>
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlError>
#include <QQmlPropertyMap>
#include <QQuickItem>
#include <QQuickStyle>
#include <QQuickWindow>
#include <QMouseEvent>
#include <QPointer>
#include <QIcon>
#include <QDir>
#include <QDateTime>
#include <QDesktopServices>
#include <QFile>
#include <QFileOpenEvent>
#include <QHash>
#include <QMap>
#include <QJsonArray>
#include <QNetworkAccessManager>
#include <QNetworkRequest>
#include <QJsonDocument>
#include <QJsonObject>
#include <QStandardPaths>
#include <QColorDialog>
#include <QFileDialog>
#include <QFileInfo>
#include <QFont>
#include <QFontDatabase>
#include <QFileSystemWatcher>
#include <QLocalServer>
#include <QLocalSocket>
#include <QMessageBox>
#include <QJSValue>
#include <QScreen>
#include <QSet>
#include <QStyleHints>
#include <QTimer>
#include <QUrl>
#include <QtQml/qqml.h>
#include <QtGlobal>

#ifdef PULSAR_HAS_MULTIMEDIA
#include <QAudioOutput>
#include <QMediaFormat>
#include <QMediaPlayer>
#endif

#include <utility>

#include "native_renderer.h"
#include "shortcuts.h"
#include "assoc.h"
#include "bridge.h"
#include "embedded.h"
#include "log.h"
#include "manifest_env.h"
#include "net.h"
#include "power.h"
#include "recent.h"
#include "screen_info.h"
#include "secure.h"
#include "crypto.h"
#include "devchannel.h"
#include "system_locale.h"

static bool gErrorShown = false;
static bool gWatch = false;
static QFileSystemWatcher *gWatcher = nullptr;
static QFileSystemWatcher *gAppWatcher = nullptr;
static Bridge *gBridge = nullptr;
static DevChannel *gDevChannel = nullptr;
static qint64 g_toastSeq = 0;
static pulsar::NetworkService *gNet = nullptr;
static PowerMonitor *gPower = nullptr;
// Keychain entries are scoped to the app id; set once from pulsar.json.
static QString gSecureService;

static QFileDialog::Options dialogOptions()
{
#ifdef Q_OS_LINUX
    return QFileDialog::DontUseNativeDialog;
#else
    return QFileDialog::Options();
#endif
}

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
    bool transparent = false;
    bool hasTransparent = false;
    QString icon;
    bool hasIcon = false;
};

// Windows are addressed by label; they all share the Store and QML engine.
static QHash<QString, WindowConfig> g_configs;
static QHash<QString, QObject *> g_roots;
static void reportCrash(const QString &text)
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

static void appendCrashLog(const QString &text)
{
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);

    if (dir.isEmpty()) return;

    QDir().mkpath(dir);

    QFile file(QDir(dir).filePath(QStringLiteral("crash.log")));

    if (!file.open(QIODevice::Append | QIODevice::Text)) return;

    file.write(QDateTime::currentDateTimeUtc().toString(Qt::ISODate).toUtf8());
    file.write(" ");
    file.write(text.toUtf8());
    file.write("\n");

    reportCrash(text);
}

static QHash<QString, pulsar::NativeRenderer *> g_renderers;

static pulsar::NativeRenderer *rendererFor(const QString &label)
{
    const QString key = label.isEmpty() ? QStringLiteral("main") : label;

    pulsar::NativeRenderer *&renderer = g_renderers[key];

    if (!renderer)
        renderer = new pulsar::NativeRenderer(qApp);

    return renderer;
}
static quint64 g_uiPatchSeq = 0;
static QSet<QString> g_requested;
static QString gPrimaryLabel;
static bool gShownAny = false;
static QVariantMap gTheme;

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

struct ManifestInfo {
    QString id;
    QString name;
    bool singleInstance = false;
    QList<pulsar::FileAssociation> fileAssociations;
};

// The host reads a few manifest fields directly: single-instance has to be
// known before the runtime is even started.
static ManifestInfo readManifestInfo()
{
    ManifestInfo info;

    QFile file(QDir(appDir()).filePath(QStringLiteral("pulsar.json")));

    if (!file.open(QIODevice::ReadOnly))
        return info;

    const QJsonDocument doc = QJsonDocument::fromJson(file.readAll());

    if (!doc.isObject())
        return info;

    const QJsonObject obj = doc.object();

    info.id = obj.value(QStringLiteral("id")).toString();
    info.name = obj.value(QStringLiteral("name")).toString();
    info.singleInstance = obj.value(QStringLiteral("singleInstance")).toBool();

    const QJsonArray assocs = obj.value(QStringLiteral("fileAssociations")).toArray();

    for (const QJsonValue &value : assocs) {
        const QJsonObject item = value.toObject();

        pulsar::FileAssociation assoc;
        assoc.ext = item.value(QStringLiteral("ext")).toString();
        assoc.mime = item.value(QStringLiteral("mime")).toString();
        assoc.name = item.value(QStringLiteral("name")).toString();

        if (!assoc.ext.isEmpty())
            info.fileAssociations.append(assoc);
    }

    return info;
}

// Send the command line the OS gave us to the runtime (as the __launch
// notification). The runtime turns it into open-url/open-file events; a
// forwarded launch also raises second-instance.
static void deliverLaunch(const QStringList &argv, const QString &cwd, bool first)
{
    if (!gBridge)
        return;

    QJsonArray array;

    for (const QString &arg : argv)
        array.append(arg);

    QJsonObject params;
    params.insert(QStringLiteral("argv"), array);
    params.insert(QStringLiteral("cwd"), cwd);
    params.insert(QStringLiteral("first"), first);

    gBridge->notify(QStringLiteral("__launch"), params);
}

static QString sanitizeInstanceKey(const QString &raw)
{
    QString out;

    for (const QChar c : raw) {
        if (c.isLetterOrNumber() || c == QLatin1Char('.') || c == QLatin1Char('-') || c == QLatin1Char('_'))
            out.append(c);
        else
            out.append(QLatin1Char('-'));
    }

    if (out.isEmpty())
        out = QStringLiteral("pulsar-app");

    return out;
}

// A second instance connects here, hands over its arguments and exits.
static bool forwardToInstance(const QString &serverName, const QStringList &argv, const QString &cwd)
{
    QLocalSocket socket;

    socket.connectToServer(serverName);

    if (!socket.waitForConnected(300))
        return false;

    QJsonArray array;

    for (const QString &arg : argv)
        array.append(arg);

    QJsonObject payload;
    payload.insert(QStringLiteral("argv"), array);
    payload.insert(QStringLiteral("cwd"), cwd);

    QByteArray data = QJsonDocument(payload).toJson(QJsonDocument::Compact);

    data.append('\n');
    socket.write(data);
    socket.flush();
    socket.waitForBytesWritten(1000);
    socket.disconnectFromServer();

    if (socket.state() != QLocalSocket::UnconnectedState)
        socket.waitForDisconnected(1000);

    return true;
}

static QLocalServer *gInstanceServer = nullptr;

static void startInstanceServer(const QString &serverName, QObject *parent)
{
    QLocalServer::removeServer(serverName);

    gInstanceServer = new QLocalServer(parent);

    if (!gInstanceServer->listen(serverName)) {
        qWarning().noquote() << "single-instance: listen failed:" << gInstanceServer->errorString();
        delete gInstanceServer;
        gInstanceServer = nullptr;
        return;
    }

    QObject::connect(gInstanceServer, &QLocalServer::newConnection, []() {
        while (QLocalSocket *client = gInstanceServer->nextPendingConnection()) {
            auto *buffer = new QByteArray();

            QObject::connect(client, &QLocalSocket::readyRead, client, [client, buffer]() {
                buffer->append(client->readAll());

                int idx;
                while ((idx = buffer->indexOf('\n')) >= 0) {
                    const QByteArray line = buffer->left(idx);
                    buffer->remove(0, idx + 1);

                    const QJsonDocument doc = QJsonDocument::fromJson(line);

                    if (!doc.isObject())
                        continue;

                    const QJsonObject obj = doc.object();

                    QStringList argv;
                    for (const QJsonValue &value : obj.value(QStringLiteral("argv")).toArray())
                        argv << value.toString();

                    deliverLaunch(argv, obj.value(QStringLiteral("cwd")).toString(), false);
                }
            });
            QObject::connect(client, &QLocalSocket::disconnected, client, [client, buffer]() {
                delete buffer;
                client->deleteLater();
            });
        }
    });
}

// macOS delivers files/URLs through QFileOpenEvent rather than argv.
class FileOpenFilter : public QObject {
public:
    using QObject::QObject;

protected:
    bool eventFilter(QObject *object, QEvent *event) override
    {
        if (event->type() != QEvent::FileOpen)
            return QObject::eventFilter(object, event);

        auto *openEvent = static_cast<QFileOpenEvent *>(event);

        QStringList argv;
        argv << QCoreApplication::applicationFilePath();

        if (!openEvent->url().isEmpty())
            argv << openEvent->url().toString();
        else if (!openEvent->file().isEmpty())
            argv << openEvent->file();

        deliverLaunch(argv, QDir::currentPath(), false);

        return true;
    }
};

static QUrl resolveUi(const QString &ui)
{
    // A window without a QML file is rendered from the JS tree by the built-in
    // view (see PulsarView.qml and the __ui notification).
    if (ui.isEmpty())
        return QUrl(QStringLiteral("qrc:/runtime/PulsarView.qml"));

    const QFileInfo fi(ui);
    const QString path = fi.isAbsolute() ? ui : QDir(appDir()).absoluteFilePath(ui);

    return QUrl::fromLocalFile(path);
}

class FocusDismissFilter : public QObject
{
public:
    explicit FocusDismissFilter(QObject *parent) : QObject(parent) {}

protected:
    bool eventFilter(QObject *object, QEvent *event) override
    {
        auto *window = qobject_cast<QQuickWindow *>(object);

        if (!window)
            return false;

        if (event->type() == QEvent::MouseButtonPress) {
            auto *mouse = static_cast<QMouseEvent *>(event);

            if (mouse->button() != Qt::LeftButton)
                return false;

            pressFocus_ = window->activeFocusItem();
            pressInside_ = false;

            if (pressFocus_) {
                const QPointF local = pressFocus_->mapFromScene(mouse->position());

                pressInside_ = local.x() >= 0 && local.y() >= 0
                        && local.x() <= pressFocus_->width()
                        && local.y() <= pressFocus_->height();
            }

            return false;
        }

        if (event->type() == QEvent::MouseButtonRelease) {
            auto *mouse = static_cast<QMouseEvent *>(event);

            if (mouse->button() != Qt::LeftButton)
                return false;

            QQuickItem *focused = window->activeFocusItem();

            if (focused && focused == pressFocus_ && !pressInside_)
                focused->setFocus(false);

            pressFocus_ = nullptr;
            pressInside_ = false;
        }

        return false;
    }

private:
    QPointer<QQuickItem> pressFocus_;
    bool pressInside_ = false;
};

static void applyConfig(QObject *root, const WindowConfig &cfg)
{
    if (!root)
        return;

    if (root->metaObject()->indexOfProperty("themeData") >= 0)
        root->setProperty("themeData", gTheme);

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

    if (cfg.hasTransparent) {
        Qt::WindowFlags flags = window->flags();

        if (cfg.transparent) {
            window->setColor(Qt::transparent);
            flags |= Qt::FramelessWindowHint;
        } else {
            flags &= ~Qt::FramelessWindowHint;
        }

        window->setFlags(flags);

        if (root->metaObject()->indexOfProperty("windowTransparent") >= 0)
            root->setProperty("windowTransparent", cfg.transparent);
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
    c.hasTransparent = setIfPresent(m, QStringLiteral("transparent"), c.transparent);

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
    component.setData(qml, QUrl(QStringLiteral("qrc:/runtime/ErrorView.qml")));

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

static QVariant mergedUiNode(const QVariantMap &current, const QVariant &node, bool shallow)
{
    QVariantMap merged = node.toMap();

    if (shallow && !merged.contains(QStringLiteral("children")) && current.contains(QStringLiteral("children")))
        merged.insert(QStringLiteral("children"), current.value(QStringLiteral("children")));

    return merged;
}



static void wireWindowEvents(QObject *root, const QString &label);

static void applyUiTree(const QString &label)
{
    if (QObject *root = g_roots.value(label))
        rendererFor(label)->attach(root);
}

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

    if (auto *window = qobject_cast<QQuickWindow *>(root))
        window->installEventFilter(new FocusDismissFilter(window));

    g_roots.insert(cfg.label, root);
    wireWindowEvents(root, cfg.label);
    applyUiTree(cfg.label);
}

// A kept window has been resized or tiled by now, so only what the config
// actually changed is applied to it.
static WindowConfig changesFrom(const WindowConfig &previous, const WindowConfig &next)
{
    WindowConfig change = next;

    change.hasWidth = next.hasWidth && (!previous.hasWidth || previous.width != next.width);
    change.hasHeight = next.hasHeight && (!previous.hasHeight || previous.height != next.height);
    change.hasFrameless = next.hasFrameless
        && (!previous.hasFrameless || previous.frameless != next.frameless);
    change.hasTransparent = next.hasTransparent
        && (!previous.hasTransparent || previous.transparent != next.transparent);

    return change;
}

static bool canKeepWindows(const QList<WindowConfig> &configs)
{
    if (configs.size() != g_roots.size())
        return false;

    for (const WindowConfig &cfg : configs) {
        if (!g_roots.contains(cfg.label) || resolveUi(cfg.ui).scheme() != QLatin1String("qrc"))
            return false;
    }

    return true;
}

static void destroyWindows(QQmlApplicationEngine &engine)
{
    for (pulsar::NativeRenderer *renderer : std::as_const(g_renderers))
        renderer->detach();

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
    sizeTimer->start();

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

static void handleExportRequest(const QVariantMap &m)
{
    Bridge *bridge = gBridge;

    if (!bridge)
        return;

    const QString token = m.value(QStringLiteral("token")).toString();
    const QString path = m.value(QStringLiteral("path")).toString();
    const QString name = m.value(QStringLiteral("name")).toString();
    const qint64 modifiedAT = m.value(QStringLiteral("modifiedAT")).toLongLong();
    const QString target = QStandardPaths::writableLocation(QStandardPaths::DownloadLocation)
        + QLatin1Char('/') + (name.isEmpty() ? QFileInfo(path).fileName() : name);
    const bool ok = QFile::copy(path, target);

    if (ok && modifiedAT > 0) {
        QFile file(target);

        if (file.open(QIODevice::ReadWrite)) {
            file.setFileTime(QDateTime::fromMSecsSinceEpoch(modifiedAT), QFileDevice::FileModificationTime);
            file.close();
        }
    }

    QJsonObject params;
    params.insert(QStringLiteral("token"), token);
    params.insert(QStringLiteral("value"), ok);

    bridge->notify(QStringLiteral("__export-result"), params);
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
    const QString color = m.value(QStringLiteral("color")).toString();

    // Headless/test hook: skip the modal dialog and return a stub result.
    const QByteArray stub = qgetenv("PULSAR_DIALOG_STUB");

    if (!stub.isEmpty()) {
        QJsonObject params;
        params.insert(QStringLiteral("token"), token);

        if (kind == QLatin1String("message"))
            params.insert(QStringLiteral("value"), true);
        else if (kind == QLatin1String("open-files")) {
            QJsonArray files;
            files.append(QString::fromLocal8Bit(stub));
            params.insert(QStringLiteral("value"), files);
        } else {
            params.insert(QStringLiteral("value"), QString::fromLocal8Bit(stub));
        }

        bridge->notify(QStringLiteral("__dialog-result"), params);
        return;
    }

    // Defer out of the response handler before opening a modal dialog.
    QTimer::singleShot(0, QCoreApplication::instance(), [bridge, token, kind, title, filter, dir, text, color]() {
        if (kind == QLatin1String("open-files")) {
            const QStringList files = QFileDialog::getOpenFileNames(nullptr, title, dir, filter, nullptr, dialogOptions());

            QJsonArray array;
            for (const QString &file : files)
                array.append(file);

            QJsonObject params;
            params.insert(QStringLiteral("token"), token);
            params.insert(QStringLiteral("value"), array);

            bridge->notify(QStringLiteral("__dialog-result"), params);
            return;
        }

        QString result;
        if (kind == QLatin1String("color")) {
            const QColor picked = QColorDialog::getColor(QColor(color), nullptr, title);

            result = picked.isValid() ? picked.name(QColor::HexRgb) : QString();
        } else if (kind == QLatin1String("open"))
            result = QFileDialog::getOpenFileName(nullptr, title, dir, filter, nullptr, dialogOptions());
        else if (kind == QLatin1String("open-directory"))
            result = QFileDialog::getExistingDirectory(nullptr, title, dir,
                                                       QFileDialog::ShowDirsOnly | dialogOptions());
        else if (kind == QLatin1String("save"))
            result = QFileDialog::getSaveFileName(nullptr, title, dir, filter, nullptr, dialogOptions());
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

static void handleQuery(Bridge *bridge, const QVariantMap &m)
{
    const QString token = m.value(QStringLiteral("token")).toString();
    const QString kind = m.value(QStringLiteral("kind")).toString();

    QJsonObject params;
    params.insert(QStringLiteral("token"), token);

    if (pulsar::isCryptoQuery(kind)) {
        QPointer<Bridge> target = bridge;

        pulsar::cryptoQuery(kind, m, [target, params](const QJsonValue &value) mutable {
            if (!target)
                return;

            params.insert(QStringLiteral("value"), value);
            target->notify(QStringLiteral("__query-result"), params);
        });

        return;
    }

    if (kind == QLatin1String("screen.list")) {
        params.insert(QStringLiteral("value"), pulsar::screenList());
    } else if (kind == QLatin1String("system.power")) {
        if (gPower)
            params.insert(QStringLiteral("value"), QJsonObject::fromVariantMap(gPower->state()));
        else
            params.insert(QStringLiteral("value"),
                          QJsonObject{{QStringLiteral("source"), QStringLiteral("unknown")}});
    } else if (kind == QLatin1String("host.info")) {
#ifdef PULSAR_VERSION
        const QString version = QStringLiteral(PULSAR_VERSION);
#else
        const QString version = QStringLiteral("dev");
#endif
        QJsonObject info;
        info.insert(QStringLiteral("version"), version);
        info.insert(QStringLiteral("qt"), QString::fromLatin1(qVersion()));
        info.insert(QStringLiteral("platform"), QGuiApplication::platformName());
        params.insert(QStringLiteral("value"), info);
    } else if (kind == QLatin1String("theme.get")) {
        QJsonObject value;
        value.insert(QStringLiteral("scheme"), bridge->colorScheme());
        params.insert(QStringLiteral("value"), value);
    } else if (kind == QLatin1String("clipboard.read")) {
        params.insert(QStringLiteral("value"), QGuiApplication::clipboard()->text());
    } else if (kind == QLatin1String("clipboard.write")) {
        QGuiApplication::clipboard()->setText(m.value(QStringLiteral("text")).toString());
        params.insert(QStringLiteral("value"), true);
    } else if (kind == QLatin1String("permissions.request") || kind == QLatin1String("permissions.check")) {
        // Desktop has no runtime permission model.
        params.insert(QStringLiteral("value"), true);
    } else if (kind == QLatin1String("system.locale")) {
        params.insert(QStringLiteral("value"), pulsar::systemLocale());
    } else if (kind == QLatin1String("biometric.available") || kind == QLatin1String("biometric.seal")
               || kind == QLatin1String("biometric.remove")) {
        // Desktop has no biometric unlock yet; apps fall back to their own password.
        params.insert(QStringLiteral("value"), false);
    } else if (kind == QLatin1String("biometric.open")) {
        params.insert(QStringLiteral("value"), QJsonValue::Null);
    } else if (kind == QLatin1String("scanner.available")) {
        // Scanning uses the phone camera; desktops show codes instead.
        params.insert(QStringLiteral("value"), false);
    } else if (kind == QLatin1String("scanner.scan")) {
        params.insert(QStringLiteral("value"), QJsonValue::Null);
    } else if (kind == QLatin1String("secure.available")) {
        params.insert(QStringLiteral("value"), pulsar::secureAvailable());
    } else if (kind == QLatin1String("secure.get")) {
        QString value;
        if (pulsar::secureGet(gSecureService, m.value(QStringLiteral("key")).toString(), &value))
            params.insert(QStringLiteral("value"), value);
        else
            params.insert(QStringLiteral("value"), QJsonValue::Null);
    } else if (kind == QLatin1String("secure.set")) {
        const bool ok = pulsar::secureSet(gSecureService,
                                          m.value(QStringLiteral("key")).toString(),
                                          m.value(QStringLiteral("value")).toString());
        params.insert(QStringLiteral("value"), ok);
    } else if (kind == QLatin1String("secure.remove")) {
        const bool ok = pulsar::secureRemove(gSecureService, m.value(QStringLiteral("key")).toString());
        params.insert(QStringLiteral("value"), ok);
    }

    bridge->notify(QStringLiteral("__query-result"), params);
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

static void handleRecentCommand(const QVariantMap &m)
{
    const QString action = m.value(QStringLiteral("action")).toString();
    const QString path = m.value(QStringLiteral("path")).toString();

    if (qEnvironmentVariableIsSet("PULSAR_DEBUG"))
        qInfo().noquote() << "RECENT" << action << path;

    if (action == QLatin1String("add"))
        pulsar::addRecentDocument(path);
    else if (action == QLatin1String("clear"))
        pulsar::clearRecentDocuments();
}


#ifdef PULSAR_HAS_MULTIMEDIA
static QPointer<QObject> gVideoPlayer;

static bool isVideoPath(const QString &path)
{
    static const QStringList extensions = {QStringLiteral("mp4"), QStringLiteral("m4v"), QStringLiteral("mkv"),
                                          QStringLiteral("webm"), QStringLiteral("mov"), QStringLiteral("avi"),
                                          QStringLiteral("wmv"), QStringLiteral("flv"), QStringLiteral("mpg"),
                                          QStringLiteral("mpeg"), QStringLiteral("ts"), QStringLiteral("3gp"),
                                          QStringLiteral("ogv")};

    return extensions.contains(QFileInfo(path).suffix().toLower());
}

static bool playVideo(QQmlApplicationEngine &engine, const QString &path)
{
    if (!isVideoPath(path))
        return false;

    // Apps built without FFmpeg have no decoder; the system player takes over.
    if (QMediaFormat().supportedFileFormats(QMediaFormat::Decode).isEmpty())
        return false;

    if (!gVideoPlayer) {
        QQmlComponent component(&engine, QUrl(QStringLiteral("qrc:/runtime/VideoPlayer.qml")));
        QObject *created = component.create();

        if (!created) {
            qWarning().noquote() << "Pulsar: cannot create the video player:" << component.errors();
            return false;
        }

        gVideoPlayer = created;
    }

    QMetaObject::invokeMethod(gVideoPlayer, "open", Q_ARG(QVariant, QUrl::fromLocalFile(path)));

    if (qEnvironmentVariableIsSet("PULSAR_DEBUG"))
        qInfo().noquote() << "VIDEO" << path;

    if (auto *window = qobject_cast<QQuickWindow *>(gVideoPlayer.data())) {
        window->show();
        window->raise();
        window->requestActivate();
    }

    return true;
}
#endif

#ifdef PULSAR_HAS_MULTIMEDIA
static QMediaPlayer *gMediaPlayer = nullptr;
static QAudioOutput *gMediaOutput = nullptr;
static QTimer *gMediaTimer = nullptr;
static QString gMediaTitle;
static QString gMediaArtist;

static QString mediaStateName()
{
    if (!gMediaPlayer)
        return QStringLiteral("idle");

    if (gMediaPlayer->mediaStatus() == QMediaPlayer::EndOfMedia)
        return QStringLiteral("ended");
    if (gMediaPlayer->mediaStatus() == QMediaPlayer::LoadingMedia)
        return QStringLiteral("loading");
    if (gMediaPlayer->mediaStatus() == QMediaPlayer::InvalidMedia)
        return QStringLiteral("error");

    switch (gMediaPlayer->playbackState()) {
    case QMediaPlayer::PlayingState:
        return QStringLiteral("playing");
    case QMediaPlayer::PausedState:
        return QStringLiteral("paused");
    default:
        return QStringLiteral("stopped");
    }
}

static void emitMediaState()
{
    if (!gBridge || !gMediaPlayer)
        return;

    if (gMediaPlayer->playbackState() == QMediaPlayer::PlayingState) {
        if (gMediaTimer && !gMediaTimer->isActive())
            gMediaTimer->start();
    } else if (gMediaTimer) {
        gMediaTimer->stop();
    }

    QJsonObject data;
    data.insert(QStringLiteral("state"), mediaStateName());
    data.insert(QStringLiteral("position"), qint64(gMediaPlayer->position()));
    data.insert(QStringLiteral("duration"), qint64(gMediaPlayer->duration()));
    data.insert(QStringLiteral("rate"), gMediaPlayer->playbackRate());
    data.insert(QStringLiteral("volume"), gMediaOutput ? gMediaOutput->volume() : 1.0);
    data.insert(QStringLiteral("title"), gMediaTitle);
    data.insert(QStringLiteral("artist"), gMediaArtist);

    QJsonObject params;
    params.insert(QStringLiteral("name"), QStringLiteral("media"));
    params.insert(QStringLiteral("data"), data);

    gBridge->notify(QStringLiteral("__event"), params);
}

static void ensureMedia()
{
    if (gMediaPlayer)
        return;

    gMediaPlayer = new QMediaPlayer(QCoreApplication::instance());
    gMediaOutput = new QAudioOutput(QCoreApplication::instance());
    gMediaPlayer->setAudioOutput(gMediaOutput);

    gMediaTimer = new QTimer(QCoreApplication::instance());
    gMediaTimer->setInterval(500);

    QObject::connect(gMediaTimer, &QTimer::timeout, gMediaPlayer, []() { emitMediaState(); });
    QObject::connect(gMediaPlayer, &QMediaPlayer::playbackStateChanged, gMediaPlayer,
                     [](QMediaPlayer::PlaybackState) { emitMediaState(); });
    QObject::connect(gMediaPlayer, &QMediaPlayer::mediaStatusChanged, gMediaPlayer,
                     [](QMediaPlayer::MediaStatus status) {
                         if (status == QMediaPlayer::EndOfMedia || status == QMediaPlayer::InvalidMedia)
                             emitMediaState();
                     });
    QObject::connect(gMediaPlayer, &QMediaPlayer::durationChanged, gMediaPlayer,
                     [](qint64) { emitMediaState(); });
    QObject::connect(gMediaPlayer, &QMediaPlayer::errorOccurred, gMediaPlayer,
                     [](QMediaPlayer::Error, const QString &) { emitMediaState(); });
}

static void handleMediaCommand(const QVariantMap &m)
{
    ensureMedia();

    const QString action = m.value(QStringLiteral("action")).toString();

    if (action == QLatin1String("open")) {
        gMediaTitle = m.value(QStringLiteral("title")).toString();
        gMediaArtist = m.value(QStringLiteral("artist")).toString();
        gMediaPlayer->setSource(QUrl(m.value(QStringLiteral("source")).toString()));
    } else if (action == QLatin1String("play")) {
        gMediaPlayer->play();
    } else if (action == QLatin1String("pause")) {
        gMediaPlayer->pause();
    } else if (action == QLatin1String("stop")) {
        gMediaPlayer->stop();
    } else if (action == QLatin1String("toggle")) {
        if (gMediaPlayer->playbackState() == QMediaPlayer::PlayingState)
            gMediaPlayer->pause();
        else
            gMediaPlayer->play();
    } else if (action == QLatin1String("seek")) {
        gMediaPlayer->setPosition(qint64(m.value(QStringLiteral("position")).toDouble()));
    } else if (action == QLatin1String("rate")) {
        gMediaPlayer->setPlaybackRate(m.value(QStringLiteral("rate")).toDouble());
    } else if (action == QLatin1String("volume")) {
        if (gMediaOutput)
            gMediaOutput->setVolume(qBound(0.0, m.value(QStringLiteral("volume")).toDouble(), 1.0));
    } else if (action == QLatin1String("metadata")) {
        gMediaTitle = m.value(QStringLiteral("title")).toString();
        gMediaArtist = m.value(QStringLiteral("artist")).toString();
    } else if (action == QLatin1String("release")) {
        gMediaPlayer->stop();
        gMediaPlayer->setSource(QUrl());
    }

    emitMediaState();
}
#endif

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

        rendererFor(label)->detach();

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

// The executable's path before QCoreApplication exists, which
// applicationFilePath() needs.
static QString executablePathEarly(const char *argv0)
{
#ifdef Q_OS_LINUX
    const QString self = QFileInfo(QStringLiteral("/proc/self/exe")).symLinkTarget();

    if (!self.isEmpty())
        return self;
#endif

    return QFileInfo(QString::fromLocal8Bit(argv0)).absoluteFilePath();
}

// The manifest's env has to be in place before QApplication reads Qt's own
// variables (QT_QPA_*, QSG_*, QT_SCALE_FACTOR), so find pulsar.json without the
// application object: inside an appended payload, or in the app directory.
static void applyEarlyManifestEnv(const char *argv0)
{
    QByteArray json = pulsarReadEmbeddedEntry(executablePathEarly(argv0), QStringLiteral("app/pulsar.json"));

    if (json.isEmpty()) {
        QFile file(QDir(appDir()).filePath(QStringLiteral("pulsar.json")));

        if (file.open(QIODevice::ReadOnly))
            json = file.readAll();
    }

    pulsar::applyManifestEnv(json);
}

int main(int argc, char **argv)
{
    pulsar::initLogs();
    applyEarlyManifestEnv(argc > 0 ? argv[0] : "");

    // QApplication (Widgets) so native dialogs and the tray work; QQml works
    // with it as well.
#if defined(Q_OS_LINUX) && !defined(Q_OS_ANDROID)
    if (!qEnvironmentVariableIsSet("QSG_RENDER_LOOP"))
        qputenv("QSG_RENDER_LOOP", "threaded");
#endif

    QApplication app(argc, argv);
    app.setOrganizationName(QStringLiteral("Pulsar"));

    QFontDatabase::addApplicationFont(QStringLiteral(":/runtime/fonts/NotoSans-Variable.ttf"));
    QFontDatabase::addApplicationFont(QStringLiteral(":/runtime/fonts/PaperMono-Regular.ttf"));
    QFontDatabase::addApplicationFont(QStringLiteral(":/runtime/fonts/PaperMono-Medium.ttf"));
    QFontDatabase::addApplicationFont(QStringLiteral(":/runtime/fonts/PaperMono-Bold.ttf"));

    QFont appFont = QApplication::font();
    appFont.setFamily(QStringLiteral("Noto Sans"));
    appFont.setStyleHint(QFont::SansSerif);
    QApplication::setFont(appFont);

    const QString controlsStyle = qEnvironmentVariable("PULSAR_CONTROLS_STYLE");
    QQuickStyle::setStyle(controlsStyle.isEmpty() ? QStringLiteral("Basic") : controlsStyle);
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

    auto *shortcuts = new pulsar::Shortcuts(&app);

    shortcuts->setWindowLabel([](QWindow *window) {
        for (auto it = g_roots.constBegin(); it != g_roots.constEnd(); ++it) {
            if (it.value() == window)
                return it.key();
        }

        return QString();
    });
    QObject::connect(shortcuts, &pulsar::Shortcuts::triggered, &app, [bridge](int id) {
        QJsonObject data;
        data.insert(QStringLiteral("id"), id);

        QJsonObject params;
        params.insert(QStringLiteral("name"), QStringLiteral("shortcut"));
        params.insert(QStringLiteral("data"), data);

        bridge->notify(QStringLiteral("__event"), params);
    });

    QObject::connect(bridge, &Bridge::uiMessage, &app, [shortcuts](const QString &method, const QJsonObject &params) {
        if (method == QLatin1String("__ui-command") && params.value(QLatin1String("command")).toString() == QLatin1String("shortcuts")) {
            shortcuts->set(params.value(QLatin1String("shortcuts")).toArray());

            return;
        }

        if (method == QLatin1String("__ui-command")) {
            // A command names a node by controller, not by window, so every window gets a try.
            for (pulsar::NativeRenderer *renderer : std::as_const(g_renderers))
                renderer->command(params);

            return;
        }

        const QString target = params.value(QLatin1String("target")).toString();
        pulsar::NativeRenderer *renderer = rendererFor(target);

        const bool debug = qEnvironmentVariableIsSet("PULSAR_DEBUG");

        if (method == QLatin1String("__ui")) {
            const QJsonArray tree = params.value(QLatin1String("tree")).toArray();

            renderer->setTree(tree);

            if (debug)
                qInfo().noquote() << "UI render" << target << "nodes=" << tree.size();

            return;
        }

        const QJsonArray patches = params.value(QLatin1String("patches")).toArray();

        renderer->applyPatches(patches);

        if (debug)
            qInfo().noquote() << "UI patch" << target << "ops=" << patches.size();
    });

// Exposed to QML as `import Pulsar 1.0` -> Pulsar.emit(...) / Store.*
    qmlRegisterSingletonInstance("Pulsar", 1, 0, "Pulsar", bridge);
    qmlRegisterSingletonInstance("Pulsar", 1, 0, "Store", store);
    engine.rootContext()->setContextProperty(QStringLiteral("PulsarBridge"), bridge);

    gWatch = watchMode();
    gBridge = bridge;

    // `pulsar dev` passes a control URL so `pulsar ui`, `tap`, `hover` and the MCP
    // server can drive the window with real input.
    const QString devUrl = qEnvironmentVariable("PULSAR_DEV_URL");

    if (!devUrl.isEmpty()) {
        DevHooks hooks;

        hooks.notifyRuntime = [bridge](const QString &method, const QJsonObject &params) {
            bridge->notify(method, params);
        };
        hooks.appEvent = [bridge](const QString &name) {
            QJsonObject params;

            params.insert(QStringLiteral("name"), name);
            params.insert(QStringLiteral("data"), QJsonObject());
            bridge->notify(QStringLiteral("__event"), params);
        };
        hooks.reload = [bridge]() { bridge->restart(); };
        hooks.tree = []() { return rendererFor(QStringLiteral("main"))->snapshot(); };
        hooks.evaluate = [bridge](const QString &code) { return bridge->evaluateForDev(code); };
        hooks.store = [store]() {
            QJsonObject out;

            for (const QString &key : store->keys())
                out.insert(key, QJsonValue::fromVariant(store->value(key)));

            return out;
        };

        gDevChannel = new DevChannel(std::move(hooks), QUrl(devUrl), &app);
        gDevChannel->start();
    }

    // `pulsar dev` on QuickJS or Node rebuilds the script bundle on save; restart
    // the runtime when the new bundle lands, the way Bun asks for __reload.
    const QString quickjsBundle = qEnvironmentVariable(
        "PULSAR_RELOAD_FILE", qEnvironmentVariable("PULSAR_QUICKJS_BUNDLE"));

    if (gWatch && !quickjsBundle.isEmpty()) {
        auto *bundleWatcher = new QFileSystemWatcher(QStringList{ QFileInfo(quickjsBundle).absolutePath() }, &app);
        auto *bundleTimer = new QTimer(&app);
        auto lastModified = QFileInfo(quickjsBundle).lastModified();

        bundleTimer->setSingleShot(true);
        bundleTimer->setInterval(80);

        QObject::connect(bundleWatcher, &QFileSystemWatcher::directoryChanged, bundleTimer,
                         qOverload<>(&QTimer::start));
        QObject::connect(bundleTimer, &QTimer::timeout, bridge, [bridge, quickjsBundle, lastModified]() mutable {
            const QFileInfo info(quickjsBundle);

            if (!info.exists() || info.lastModified() == lastModified)
                return;

            lastModified = info.lastModified();
            bridge->restart();
        });
    }
    gNet = new pulsar::NetworkService(&app);

    PowerMonitor *power = new PowerMonitor(&app);
    gPower = power;

    QObject::connect(power, &PowerMonitor::suspend, &app, [bridge]() {
        QJsonObject params;
        params.insert(QStringLiteral("name"), QStringLiteral("power-suspend"));
        params.insert(QStringLiteral("data"), QJsonObject());
        bridge->notify(QStringLiteral("__event"), params);
    });
    QObject::connect(power, &PowerMonitor::resume, &app, [bridge]() {
        QJsonObject params;
        params.insert(QStringLiteral("name"), QStringLiteral("power-resume"));
        params.insert(QStringLiteral("data"), QJsonObject());
        bridge->notify(QStringLiteral("__event"), params);
    });
    QObject::connect(power, &PowerMonitor::sourceChanged, &app, [bridge](bool onBattery) {
        QJsonObject data;
        data.insert(QStringLiteral("onBattery"), onBattery);

        QJsonObject params;
        params.insert(QStringLiteral("name"), QStringLiteral("power-source"));
        params.insert(QStringLiteral("data"), data);
        bridge->notify(QStringLiteral("__event"), params);
    });

    QObject::connect(gNet, &pulsar::NetworkService::response, &app,
                     [bridge](quint32 id,
                              int status,
                              const QString &statusText,
                              const QUrl &url,
                              const QMap<QString, QString> &headers) {
                         QJsonObject headerObject;

                         for (auto it = headers.constBegin(); it != headers.constEnd(); ++it)
                             headerObject.insert(it.key(), it.value());

                         QJsonObject params;
                         params.insert(QStringLiteral("id"), int(id));
                         params.insert(QStringLiteral("type"), QStringLiteral("response"));
                         params.insert(QStringLiteral("status"), status);
                         params.insert(QStringLiteral("statusText"), statusText);
                         params.insert(QStringLiteral("url"), url.toString());
                         params.insert(QStringLiteral("headers"), headerObject);
                         bridge->notify(QStringLiteral("__net-event"), params);
                     });
    QObject::connect(gNet, &pulsar::NetworkService::text, &app, [bridge](quint32 id, const QString &chunk) {
        QJsonObject params;
        params.insert(QStringLiteral("id"), int(id));
        params.insert(QStringLiteral("type"), QStringLiteral("data"));
        params.insert(QStringLiteral("text"), chunk);
        bridge->notify(QStringLiteral("__net-event"), params);
    });
    QObject::connect(gNet, &pulsar::NetworkService::binary, &app, [bridge](quint32 id, const QByteArray &chunk) {
        bridge->sendBinary(id, chunk);
    });
    QObject::connect(gNet, &pulsar::NetworkService::finished, &app, [bridge](quint32 id) {
        QJsonObject params;
        params.insert(QStringLiteral("id"), int(id));
        params.insert(QStringLiteral("type"), QStringLiteral("end"));
        bridge->notify(QStringLiteral("__net-event"), params);
    });
    QObject::connect(gNet,
                     &pulsar::NetworkService::failed,
                     &app,
                     [bridge](quint32 id, const QString &code, const QString &message) {
                         QJsonObject params;
                         params.insert(QStringLiteral("id"), int(id));
                         params.insert(QStringLiteral("type"), QStringLiteral("error"));
                         params.insert(QStringLiteral("code"), code);
                         params.insert(QStringLiteral("message"), message);
                         bridge->notify(QStringLiteral("__net-event"), params);
                     });
    QObject::connect(gNet, &pulsar::NetworkService::wsOpened, &app, [bridge](quint32 id, const QString &protocol) {
        QJsonObject params;
        params.insert(QStringLiteral("id"), int(id));
        params.insert(QStringLiteral("type"), QStringLiteral("open"));
        params.insert(QStringLiteral("protocol"), protocol);
        bridge->notify(QStringLiteral("__net-event"), params);
    });
    QObject::connect(gNet, &pulsar::NetworkService::wsText, &app, [bridge](quint32 id, const QString &message) {
        QJsonObject params;
        params.insert(QStringLiteral("id"), int(id));
        params.insert(QStringLiteral("type"), QStringLiteral("message"));
        params.insert(QStringLiteral("text"), message);
        bridge->notify(QStringLiteral("__net-event"), params);
    });
    QObject::connect(gNet, &pulsar::NetworkService::wsBinary, &app, [bridge](quint32 id, const QByteArray &message) {
        bridge->sendBinary(id, message);
    });
    QObject::connect(gNet,
                     &pulsar::NetworkService::wsClosed,
                     &app,
                     [bridge](quint32 id, int code, const QString &reason, bool wasClean) {
                         QJsonObject params;
                         params.insert(QStringLiteral("id"), int(id));
                         params.insert(QStringLiteral("type"), QStringLiteral("close"));
                         params.insert(QStringLiteral("code"), code);
                         params.insert(QStringLiteral("reason"), reason);
                         params.insert(QStringLiteral("wasClean"), wasClean);
                         bridge->notify(QStringLiteral("__net-event"), params);
                     });

    const ManifestInfo manifest = readManifestInfo();

    gSecureService =
        manifest.id.isEmpty() ? QFileInfo(appDir()).fileName() : manifest.id;

    const QStringList cliArgs = QCoreApplication::arguments();
    const QString cwd = QDir::currentPath();

    // Single instance: a second launch hands its arguments to the running one
    // and exits instead of starting another runtime.
    if (manifest.singleInstance) {
        const QByteArray keyOverride = qgetenv("PULSAR_INSTANCE_KEY");
        const QString key = !keyOverride.isEmpty()
                                ? QString::fromLocal8Bit(keyOverride)
                                : (manifest.id.isEmpty() ? QFileInfo(appDir()).fileName() : manifest.id);

        const QString serverName = QStringLiteral("pulsar-") + sanitizeInstanceKey(key);

        if (forwardToInstance(serverName, cliArgs, cwd)) {
            qInfo().noquote() << "another instance is already running; forwarded launch arguments";
            return 0;
        }

        startInstanceServer(serverName, &app);
    }

    // Declared file types become available in the OS "Open with" list. This is
    // idempotent, so it is safe to run on every launch.
    if (!manifest.fileAssociations.isEmpty()) {
        pulsar::registerFileAssociations(gSecureService,
                                         manifest.name,
                                         QCoreApplication::applicationFilePath(),
                                         manifest.fileAssociations);

        if (qEnvironmentVariableIsSet("PULSAR_DEBUG"))
            qInfo().noquote() << "ASSOC register" << manifest.fileAssociations.size() << gSecureService;
    }

    app.installEventFilter(new FileOpenFilter(&app));

    // Hand the OS-supplied launch arguments (deep links, files) to the runtime.
    deliverLaunch(cliArgs, cwd, true);

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

    gAppWatcher = new QFileSystemWatcher(&app);

    auto emitFsChange = [bridge](const QString &path) {
        QJsonObject data;
        data.insert(QStringLiteral("path"), path);

        QJsonObject params;
        params.insert(QStringLiteral("name"), QStringLiteral("fs-change"));
        params.insert(QStringLiteral("data"), data);

        bridge->notify(QStringLiteral("__event"), params);

        if (QFileInfo::exists(path) && !gAppWatcher->files().contains(path)
            && !gAppWatcher->directories().contains(path))
            gAppWatcher->addPath(path);
    };

    QObject::connect(gAppWatcher, &QFileSystemWatcher::fileChanged, &app, emitFsChange);
    QObject::connect(gAppWatcher, &QFileSystemWatcher::directoryChanged, &app, emitFsChange);

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
                             // Windows built from JS stay open and take the new tree; only QML
                             // windows have to be recreated to pick up their files.
                             if (gWatch && gShownAny && !canKeepWindows(configs))
                                 destroyWindows(engine);

                             for (const WindowConfig &cfg : std::as_const(configs)) {
                                 if (gPrimaryLabel.isEmpty())
                                     gPrimaryLabel = cfg.label;

                                 const bool kept = g_requested.contains(cfg.label);
                                 const WindowConfig change = kept
                                     ? changesFrom(g_configs.value(cfg.label), cfg)
                                     : cfg;

                                 g_configs.insert(cfg.label, cfg);
                                 logWindowConfig(cfg);

                                 if (kept)
                                     applyConfig(g_roots.value(cfg.label), change);
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
                         } else if (method == QLatin1String("__toast")) {
                             QVariantMap toast;

                             toast.insert(QStringLiteral("seq"), QVariant::fromValue(++g_toastSeq));
                             toast.insert(QStringLiteral("text"), params.toVariant().toMap().value(QStringLiteral("text")));

                             if (QObject *root = g_roots.value(QStringLiteral("main")))
                                 root->setProperty("toastRequest", toast);
                         } else if (method == QLatin1String("__query")) {
                             handleQuery(bridge, params.toVariant().toMap());
                        } else if (method == QLatin1String("__theme")) {
                            gTheme = params.toVariant().toMap();

                            // Windows rendered from the JS tree are created with
                            // QQmlComponent, so they are tracked in g_roots but
                            // are not part of engine.rootObjects().
                            for (QObject *root : std::as_const(g_roots)) {
                                if (root->metaObject()->indexOfProperty("themeData") >= 0)
                                    root->setProperty("themeData", gTheme);
                            }

                            for (QObject *root : engine.rootObjects()) {
                                if (root->metaObject()->indexOfProperty("themeData") >= 0)
                                    root->setProperty("themeData", gTheme);
                            }
                        } else if (method == QLatin1String("__share")) {
                             const QVariantMap m = params.toVariant().toMap();
                             const QString kind = m.value(QStringLiteral("kind")).toString();
                             const QString text = kind == QLatin1String("file")
                                 ? m.value(QStringLiteral("path")).toString()
                                 : kind == QLatin1String("url")
                                     ? m.value(QStringLiteral("url")).toString()
                                     : m.value(QStringLiteral("text")).toString();

                             QGuiApplication::clipboard()->setText(text);
                         } else if (method == QLatin1String("__device")) {
                             // Orientation and keep-awake are Android-only.
                         } else if (method == QLatin1String("__media")) {
#ifdef PULSAR_HAS_MULTIMEDIA
                             handleMediaCommand(params.toVariant().toMap());
#endif
                         } else if (method == QLatin1String("__fs-watch")) {
                             const QVariantMap m = params.toVariant().toMap();
                             const QString action = m.value(QStringLiteral("action")).toString();
                             const QString path = m.value(QStringLiteral("path")).toString();

                             if (gAppWatcher && !path.isEmpty()) {
                                 if (action == QLatin1String("add"))
                                     gAppWatcher->addPath(path);
                                 else if (action == QLatin1String("remove"))
                                     gAppWatcher->removePath(path);
                             }
                         } else if (method == QLatin1String("__notify")) {
                             const QVariantMap m = params.toVariant().toMap();
                             bridge->showNotification(m.value(QStringLiteral("title")).toString(),
                                                      m.value(QStringLiteral("body")).toString(),
                                                      m.value(QStringLiteral("token")).toString(),
                                                      m.value(QStringLiteral("actions")).toList());
                         } else if (method == QLatin1String("__dialog")) {
                             handleDialogRequest(params.toVariant().toMap());
                         } else if (method == QLatin1String("__export")) {
                             handleExportRequest(params.toVariant().toMap());
                         } else if (method == QLatin1String("__open")) {
                             const QString path =
                                 params.toVariant().toMap().value(QStringLiteral("path")).toString();
#ifdef PULSAR_HAS_MULTIMEDIA
                             if (playVideo(engine, path))
                                 return;
#endif
                             QDesktopServices::openUrl(QUrl::fromLocalFile(path));
                         } else if (method == QLatin1String("__tray")) {
                             handleTrayCommand(params.toVariant().toMap());
                         } else if (method == QLatin1String("__menu")) {
                             bridge->setAppMenu(
                                 params.toVariant().toMap().value(QStringLiteral("items")).toList());
                         } else if (method == QLatin1String("__recent")) {
                             handleRecentCommand(params.toVariant().toMap());
                         } else if (method == QLatin1String("__net")) {
                             if (gNet)
                                 gNet->handle(params.toVariant().toMap());
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
                             const QString scope = m.value(QStringLiteral("scope")).toString();
                             const QString message = m.value(QStringLiteral("message")).toString();
                             const QString stack = m.value(QStringLiteral("stack")).toString();
                             const QString text =
                                 stack.isEmpty() ? scope + QStringLiteral(": ") + message
                                                 : scope + QStringLiteral(": ") + message + QLatin1Char('\n') + stack;

                             qCritical().noquote() << "app error in" << scope << ":" << message;

                             appendCrashLog(text);

                             for (QObject *root : engine.rootObjects())
                                 root->setProperty("errorText", text);
                         }
                     });

    // Bun supervision: the bridge reports if the runtime dies.
    QObject::connect(bridge, &Bridge::crashed, &app, [](const QString &kind, int code) {
        qWarning().noquote() << "bun crashed: kind=" << kind << "code=" << code;
        appendCrashLog(QStringLiteral("runtime crashed: ") + kind + QStringLiteral(" code=") + QString::number(code));
    });

#if QT_VERSION >= QT_VERSION_CHECK(6, 5, 0)
    // System appearance changes: update the QML property and tell the app.
    QObject::connect(QGuiApplication::styleHints(), &QStyleHints::colorSchemeChanged, &app, [bridge]() {
        bridge->refreshColorScheme();
        QJsonObject data;
        data.insert(QStringLiteral("scheme"), bridge->colorScheme());
        QJsonObject params;
        params.insert(QStringLiteral("name"), QStringLiteral("theme-changed"));
        params.insert(QStringLiteral("data"), data);
        bridge->notify(QStringLiteral("__event"), params);
    });
#endif

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
            cfg.ui = QStringLiteral("ui/main.qml");

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
