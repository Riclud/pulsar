#pragma once

#include <QtGlobal>
#include <QString>

// Colored, leveled console logging for the host with an optional file sink
// (QT_LOG_FILE, used by the smoke tests). Call initLogs() once in main() and
// use pulsar::forwardLine() to surface child-process stderr on the console.
namespace pulsar {
void initLogs();
void forwardLine(const QString &line);
}