#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlPropertyMap>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJSValue>
#include <QTimer>
#include <QUrl>
#include <QtQml/qqml.h>
#include <QtGlobal>

#include "bridge.h"

static QString gQtLogPath;

static void logToFile(QtMsgType, const QMessageLogContext &, const QString &msg)
{
    QFile f(gQtLogPath);
    if (f.open(QIODevice::Append)) {
        f.write(msg.toUtf8());
        f.write("\n");
        f.close();
    }
}

struct WindowConfig {
    QString ui;
    int width = 0;
    int height = 0;
    bool hasWidth = false;
    bool hasHeight = false;
    QString title;
    bool hasTitle = false;
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
    if (g_config.hasWidth)
        root->setProperty("width", g_config.width);
    if (g_config.hasHeight)
        root->setProperty("height", g_config.height);
    if (g_config.hasTitle)
        root->setProperty("title", g_config.title);
}

int main(int argc, char **argv)
{
    const QByteArray logFile = qgetenv("QT_LOG_FILE");
    if (!logFile.isEmpty()) {
        gQtLogPath = QString::fromLocal8Bit(logFile);
        qInstallMessageHandler(logToFile);
    }
    QGuiApplication app(argc, argv);
    app.setOrganizationName(QStringLiteral("Pulsar"));
    app.setApplicationName(QStringLiteral("pulsar-host"));

    QQmlApplicationEngine engine;

    // Types are owned by `app` so they outlive the engine.
    QQmlPropertyMap *store = new QQmlPropertyMap(&app);
    Bridge *bridge = new Bridge(&engine, store, &app);

    // Exposed to QML as `import Pulsar 1.0` -> Pulsar.emit(...) / Store.*
    qmlRegisterSingletonInstance("Pulsar", 1, 0, "Pulsar", bridge);
    qmlRegisterSingletonInstance("Pulsar", 1, 0, "Store", store);

    bool loaded = false;
    QUrl loadedUrl;

    auto loadUi = [&engine, &loaded, &loadedUrl](const QUrl &url) {
        if (loaded)
            return;
        loaded = true;
        loadedUrl = url;
        engine.load(url);
    };

    // The app (Bun) configures the window via a __config notification.
    QObject::connect(bridge, &Bridge::notification, &app,
                     [&engine, &loaded, &loadUi](const QString &method, const QJSValue &params) {
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
                             if (qEnvironmentVariableIsSet("PULSAR_DEBUG"))
                                 qInfo().noquote() << "CONFIG ui=" << g_config.ui
                                                   << "size=" << g_config.width << "x" << g_config.height
                                                   << "title=" << g_config.title;
                             if (!loaded)
                                 loadUi(resolveUi(g_config.ui));
                             else
                                 applyConfig(engine.rootObjects().value(0));
                         } else if (method == QLatin1String("__quit")) {
                             QCoreApplication::quit();
                         } else if (method == QLatin1String("__error")) {
                             const QVariantMap m = params.toVariant().toMap();
                             qWarning().noquote()
                                 << "app error:" << m.value(QStringLiteral("scope")).toString()
                                 << m.value(QStringLiteral("message")).toString();
                         }
                     });

    QObject::connect(&engine, &QQmlApplicationEngine::objectCreated, &app,
                     [&loadedUrl](QObject *obj, const QUrl &objUrl) {
                         if (loadedUrl.isValid() && objUrl == loadedUrl) {
                             if (!obj)
                                 QCoreApplication::exit(-1);
                             else
                                 applyConfig(obj);
                         }
                     },
                     Qt::QueuedConnection);

    // QML_MAIN forces a specific file (used by tests); otherwise wait for the
    // app config, with a fallback to <app>/ui/main.qml.
    const QByteArray qmlOverride = qgetenv("QML_MAIN");
    if (!qmlOverride.isEmpty()) {
        loadUi(QUrl::fromLocalFile(QString::fromLocal8Bit(qmlOverride)));
    } else {
        bool cfgOk = false;
        int timeout = qEnvironmentVariableIntValue("PULSAR_CONFIG_TIMEOUT_MS", &cfgOk);
        if (!cfgOk || timeout <= 0)
            timeout = 700;
        QTimer *fallback = new QTimer(&app);
        fallback->setSingleShot(true);
        QObject::connect(fallback, &QTimer::timeout, &app, [&loadUi]() { loadUi(resolveUi(QString())); });
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
