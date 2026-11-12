#pragma once

#include <QByteArray>
#include <QDateTime>
#include <QDebug>

namespace pulsar {

// With PULSAR_DEBUG set, prints "ST <name> <epoch ms>" so a launcher can lay the startup phases on one clock.
inline void startupMark(const char *name)
{
    static const bool enabled = qEnvironmentVariableIsSet("PULSAR_DEBUG");

    if (enabled)
        qInfo().noquote() << "ST" << name << QDateTime::currentMSecsSinceEpoch();
}

} // namespace pulsar
