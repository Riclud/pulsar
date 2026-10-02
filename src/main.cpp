#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QDir>
#include <QFile>
#include <QJSValue>
#include <QTimer>
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

int main(int argc, char **argv)
{
    const QByteArray logFile = qgetenv("QT_LOG_FILE");
    if (!logFile.isEmpty()) {
        gQtLogPath = QString::fromLocal8Bit(logFile);
        qInstallMessageHandler(logToFile);
    }
    QGuiApplication app(argc, argv);
    app.setOrganizationName(QStringLiteral("demo"));
    app.setApplicationName(QStringLiteral("qml-bun-bridge"));

    QQmlApplicationEngine engine;
    Bridge bridge(&engine);
    engine.rootContext()->setContextProperty(QStringLiteral("bridge"), &bridge);

    QByteArray qml = qgetenv("QML_MAIN");
    if (qml.isEmpty())
        qml = QDir::current().filePath("qml/main.qml").toUtf8();
    const QUrl url = QUrl::fromLocalFile(QString::fromLocal8Bit(qml));

    QObject::connect(&engine, &QQmlApplicationEngine::objectCreated,
                     &app, [url](QObject *obj, const QUrl &objUrl) {
                         if (!obj && url == objUrl)
                             QCoreApplication::exit(-1);
                     },
                     Qt::QueuedConnection);

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
        QObject::connect(&bridge, &Bridge::response,
                         [](qint64 id, const QJSValue &result, const QJSValue &error) {
                             qInfo().noquote().nospace() << "SELFTEST resp id=" << id
                                                         << " result=" << result.toString()
                                                         << " error=" << error.toString();
                         });
        QTimer *selfTestTimer = new QTimer(&app);
        selfTestTimer->setSingleShot(true);
        QObject::connect(selfTestTimer, &QTimer::timeout, &app, [&engine, &bridge]() {
            qInfo() << "SELFTEST invoke fs.readFile package.json";
            QJSValue params = engine.newObject();
            params.setProperty(QStringLiteral("path"), QJSValue(QStringLiteral("package.json")));
            bridge.invoke(QStringLiteral("fs.readFile"), params);
        });
        selfTestTimer->start(selfTest);
    }

    engine.addImportPath(QStringLiteral("qml"));
    engine.load(url);

    return app.exec();
}