// Process supervisor for the Pulsar runtime.
//
// It spawns the JS runtime (Bun, or a standalone binary via PULSAR_RUNTIME),
// proxies stdin/stdout between the host and the runtime, and reports a crash
// as a `__crash` notification if the runtime dies while the host is connected.

#include <QByteArray>
#include <QCoreApplication>
#include <QDir>
#include <QMetaObject>
#include <QProcess>
#include <QString>
#include <QStringList>

#include <atomic>
#include <cstdio>
#include <memory>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#else
#include <unistd.h>
#endif

namespace {

constexpr int kBufSize = 1 << 16;

int readStdin(char *buffer, int size)
{
#ifdef _WIN32
    return _read(0, buffer, size);
#else
    return static_cast<int>(::read(0, buffer, size));
#endif
}

void writeStdout(const QByteArray &data)
{
    if (data.isEmpty())
        return;
    std::fwrite(data.constData(), 1, static_cast<size_t>(data.size()), stdout);
    std::fflush(stdout);
}

// The host treats a `__crash` notification like a runtime failure.
void reportCrash(const QByteArray &kind, int value)
{
    QByteArray json = "{\"jsonrpc\":\"2.0\",\"method\":\"__crash\",\"params\":{\"scope\":\"bun\",\"kind\":\"";
    json += kind;
    json += "\"";
    if (value >= 0) {
        json += ",\"";
        json += kind == "exited" ? "code" : "signal";
        json += "\":";
        json += QByteArray::number(value);
    }
    json += "}}\n";
    writeStdout(json);
}

// Host -> runtime. Runs on its own thread; writes are marshalled to the
// QProcess (owned by the main thread) through the event loop.
void pumpStdin(QProcess *process, const std::shared_ptr<std::atomic<bool>> &shuttingDown)
{
    std::vector<char> buffer(kBufSize);
    for (;;) {
        const int n = readStdin(buffer.data(), static_cast<int>(buffer.size()));
        if (n <= 0)
            break;

        QByteArray chunk(buffer.data(), n);
        QMetaObject::invokeMethod(
            process,
            [process, chunk]() {
                if (process->state() == QProcess::Running)
                    process->write(chunk);
            },
            Qt::QueuedConnection);
    }

    shuttingDown->store(true);
    QMetaObject::invokeMethod(qApp, []() { QCoreApplication::exit(0); }, Qt::QueuedConnection);
}

} // namespace

int main(int argc, char **argv)
{
#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif

    // Read argv[1] before Qt processes (and possibly reorders) the arguments.
    const QString projectRoot = argc > 1 ? QString::fromLocal8Bit(argv[1]) : QStringLiteral(".");

    QCoreApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("pulsar-bridge"));

    const QString runtimeBin = qEnvironmentVariable("PULSAR_RUNTIME");
    const QString bunBin = qEnvironmentVariable("BUN_BIN", QStringLiteral("bun"));

    QString program;
    QStringList arguments;
    if (!runtimeBin.isEmpty()) {
        program = runtimeBin;
    } else {
        program = bunBin;
        arguments << QDir(projectRoot).filePath(QStringLiteral("core/runtime/main.ts"));
    }

    // Deliberately leaked: it must outlive the detached stdin thread. The
    // process is short-lived, so the leak is bounded.
    QProcess *process = new QProcess();
    process->setWorkingDirectory(projectRoot);
    process->setProcessChannelMode(QProcess::ForwardedErrorChannel);

    const auto shuttingDown = std::make_shared<std::atomic<bool>>(false);

    QObject::connect(process, &QProcess::readyReadStandardOutput, &app,
                     [process]() { writeStdout(process->readAllStandardOutput()); });

    QObject::connect(
        process, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished), &app,
        [process, shuttingDown](int exitCode, QProcess::ExitStatus status) {
            writeStdout(process->readAllStandardOutput());
            if (shuttingDown->load()) {
                QCoreApplication::exit(0);
                return;
            }
            if (status == QProcess::CrashExit) {
                // QProcess does not expose the terminating signal number.
                reportCrash("signal", -1);
                QCoreApplication::exit(1);
                return;
            }
            reportCrash("exited", exitCode);
            QCoreApplication::exit(exitCode == 0 ? 1 : exitCode);
        });

    QObject::connect(process, &QProcess::errorOccurred, &app, [shuttingDown](QProcess::ProcessError error) {
        if (shuttingDown->load() || error != QProcess::FailedToStart)
            return;
        std::fprintf(stderr, "bridge: failed to start the runtime\n");
        reportCrash("unknown", -1);
        QCoreApplication::exit(1);
    });

    process->start(program, arguments);

    std::thread(pumpStdin, process, shuttingDown).detach();

    return app.exec();
}
