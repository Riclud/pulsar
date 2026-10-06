#pragma once

#include <QtGlobal>
#include <QString>
#include <functional>

// Colored, leveled console logging for the host with an optional file sink
// (QT_LOG_FILE, used by the smoke tests). Call initLogs() once in main() and
// use pulsar::forwardLine() to surface child-process stderr on the console.
//
// setLogSink() installs a callback for QML-originated messages so the host can
// forward them to the runtime (two-way logging).
namespace pulsar {

using LogSink = std::function<void(const QString &level, const QString &message, const QString &file, int line)>;

void initLogs();
void setLogSink(LogSink sink);
void forwardLine(const QString &line);
} // namespace pulsar
