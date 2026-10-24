#include "bridge.h"
#include "quickjs_runtime.h"

#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQmlPropertyMap>
#include <QQuickWindow>
#include <QStandardPaths>
#include <QTimer>
#include <QUrl>
#include <QtQml/qqml.h>


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

int main(int argc, char **argv)
{
    QGuiApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("pulsar-app"));

    const QString dir =
#ifdef Q_OS_ANDROID
        androidAppDir();
#else
        appDir();
#endif

    QFile manifestFile(dir + QStringLiteral("/pulsar.json"));
    QString manifestJson = QStringLiteral("null");
    QString ui = QStringLiteral("ui/main.qml");

    if (manifestFile.open(QIODevice::ReadOnly)) {
        manifestJson = QString::fromUtf8(manifestFile.readAll());

        const QJsonObject manifest = QJsonDocument::fromJson(manifestJson.toUtf8()).object();
        const QJsonArray windows = manifest.value(QStringLiteral("windows")).toArray();

        const QString value = windows.isEmpty()
            ? QString()
            : windows.first().toObject().value(QStringLiteral("ui")).toString();

        if (!value.isEmpty())
            ui = value;
    }

    qputenv("PULSAR_APP", dir.toLocal8Bit());

    QQmlApplicationEngine engine;
    QQmlPropertyMap store;
    pulsar::QuickJsRuntime runtime;
    EmbeddedBridge bridge(&runtime, &engine, &store);

    qmlRegisterSingletonInstance("Pulsar", 1, 0, "Pulsar", &bridge);
    qmlRegisterSingletonInstance("Pulsar", 1, 0, "Store", &store);
    engine.rootContext()->setContextProperty(QStringLiteral("PulsarWindowLabel"), QStringLiteral("main"));

    QObject::connect(&runtime, &pulsar::QuickJsRuntime::message, &bridge, &EmbeddedBridge::handleMessage);
    QObject::connect(&runtime, &pulsar::QuickJsRuntime::failed, [](const QString &message) {
        qWarning().noquote() << "pulsar: runtime failed:" << message;
    });
    QObject::connect(&bridge, &EmbeddedBridge::log, [](const QString &level, const QString &message, const QString &source) {
        qInfo().noquote() << QStringLiteral("LOG[%1/%2]").arg(source, level) << message;
    });
    QObject::connect(&engine, &QQmlEngine::warnings, [](const QList<QQmlError> &warnings) {
        for (const QQmlError &warning : warnings)
            qWarning().noquote() << "QML:" << warning.toString();
    });

    qInfo().noquote() << "pulsar: app dir" << dir;

    if (!runtime.start(dir + QStringLiteral("/runtime.js"), manifestJson, dir)) {
        qWarning().noquote() << "pulsar: cannot start the embedded runtime";
        return 1;
    }

    engine.load(QUrl::fromLocalFile(dir + QLatin1Char('/') + ui));

    if (engine.rootObjects().isEmpty()) {
        qWarning().noquote() << "pulsar: QML root is empty";
        return 1;
    }

    bridge.invoke(QStringLiteral("__sync"), QJSValue());

    int quitMs = qEnvironmentVariableIntValue("AUTO_QUIT_MS");

    if (quitMs > 0)
        QTimer::singleShot(quitMs, &app, &QGuiApplication::quit);

    return app.exec();
}
