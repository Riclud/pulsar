#include "quickjs_runtime.h"

#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTimer>

#include <cstdio>

int main(int argc, char **argv)
{
    QCoreApplication app(argc, argv);

    const QStringList args = QCoreApplication::arguments();
    if (args.size() < 2) {
        std::fprintf(stderr, "usage: qjs-runtime <bundle.js> [manifest.json]\n");
        return 2;
    }

    QString manifestJson = QStringLiteral("null");
    if (args.size() > 2) {
        QFile manifestFile(args.at(2));
        if (!manifestFile.open(QIODevice::ReadOnly)) {
            std::fprintf(stderr, "qjs-runtime: cannot open %s\n", qPrintable(args.at(2)));
            return 1;
        }
        manifestJson = QString::fromUtf8(manifestFile.readAll());
    }

    const QString appDir = qEnvironmentVariable("PULSAR_APP", QDir::currentPath());
    pulsar::QuickJsRuntime runtime;

    QObject::connect(&runtime, &pulsar::QuickJsRuntime::message, [](const QJsonObject &message) {
        std::printf("MESSAGE %s\n", QJsonDocument(message).toJson(QJsonDocument::Compact).constData());
        std::fflush(stdout);
    });
    QObject::connect(&runtime, &pulsar::QuickJsRuntime::failed, [](const QString &message) {
        std::fprintf(stderr, "qjs-runtime: %s\n", qPrintable(message));
    });

    if (!runtime.start(args.at(1), manifestJson, appDir))
        return 1;

    int quitMs = qEnvironmentVariableIntValue("AUTO_QUIT_MS");
    if (quitMs <= 0) quitMs = 1000;
    QTimer::singleShot(quitMs, &app, &QCoreApplication::quit);

    return app.exec();
}
