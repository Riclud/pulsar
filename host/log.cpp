#include "log.h"

#include <QFile>
#include <QIODevice>
#include <QByteArray>

#include <cstdio>
#include <utility>

#ifdef Q_OS_WIN
#include <io.h>
#define PULSAR_ISATTY(fd) (_isatty(fd))
#define PULSAR_FILENO(f) (_fileno(f))
#else
#include <unistd.h>
#define PULSAR_ISATTY(fd) (::isatty(fd))
#define PULSAR_FILENO(f) (::fileno(f))
#endif

namespace pulsar {
namespace {

QFile *gLogFile = nullptr;
bool gColor = true;
pulsar::LogSink gSink;

QString levelName(QtMsgType type)
{
    switch (type) {
    case QtDebugMsg:
        return QStringLiteral("log");
    case QtInfoMsg:
        return QStringLiteral("info");
    case QtWarningMsg:
        return QStringLiteral("warn");
    case QtCriticalMsg:
        return QStringLiteral("error");
    case QtFatalMsg:
        return QStringLiteral("fatal");
    }
    return QStringLiteral("log");
}

void writeErr(const QByteArray &text)
{
    fwrite(text.constData(), 1, static_cast<size_t>(text.size()), stderr);
    fflush(stderr);
}

void messageHandler(QtMsgType type, const QMessageLogContext &ctx, const QString &message)
{
    const QString file = ctx.file ? QString::fromUtf8(ctx.file) : QString();
    const bool qml = (ctx.category && qstrcmp(ctx.category, "qml") == 0)
                     || file.endsWith(QLatin1String(".qml"));
    if (qml && gSink)
        gSink(levelName(type), message, file, ctx.line);

    if (gLogFile) {
        gLogFile->write(message.toUtf8());
        gLogFile->write("\n");
        gLogFile->flush();
        return;
    }

    if (!gColor) {
        writeErr(message.toUtf8() + "\n");
        return;
    }

    const char *tag;
    const char *color;
    switch (type) {
    case QtDebugMsg:
        tag = "[D]";
        color = "\x1b[36m";
        break;
    case QtInfoMsg:
        tag = "[I]";
        color = "\x1b[32m";
        break;
    case QtWarningMsg:
        tag = "[W]";
        color = "\x1b[33m";
        break;
    case QtCriticalMsg:
        tag = "[E]";
        color = "\x1b[31m";
        break;
    case QtFatalMsg:
        tag = "[F]";
        color = "\x1b[1;31m";
        break;
    }

    writeErr("\x1b[1;36mpulsar\x1b[0m " + QByteArray(color) + QByteArray(tag) + "\x1b[0m "
             + message.toUtf8() + "\n");
}

} // namespace

void initLogs()
{
    const QByteArray logPath = qgetenv("QT_LOG_FILE");
    if (!logPath.isEmpty()) {
        gLogFile = new QFile(QString::fromLocal8Bit(logPath));
        if (!gLogFile->open(QIODevice::WriteOnly | QIODevice::Append)) {
            delete gLogFile;
            gLogFile = nullptr;
        }
    }

    if (!gLogFile) {
        if (qEnvironmentVariableIsSet("NO_COLOR"))
            gColor = false;
        else if (qEnvironmentVariableIsSet("PULSAR_FORCE_COLOR"))
            gColor = true;
        else
            gColor = PULSAR_ISATTY(PULSAR_FILENO(stderr)) != 0;
    }

    qInstallMessageHandler(pulsar::messageHandler);
}

void setLogSink(LogSink sink)
{
    gSink = std::move(sink);
}

void forwardLine(const QString &line)
{
    if (gLogFile) {
        gLogFile->write(line.toUtf8());
        gLogFile->write("\n");
        gLogFile->flush();
        return;
    }
    if (!gColor) {
        writeErr(line.toUtf8() + "\n");
        return;
    }
    writeErr("\x1b[1;36mpulsar\x1b[0m \x1b[2m" + line.toUtf8() + "\x1b[0m\n");
}

} // namespace pulsar