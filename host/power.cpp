#include "power.h"

#include <QDir>
#include <QFile>

#ifdef PULSAR_HAS_DBUS
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusReply>
#include <QDBusVariant>
#endif

namespace {

bool readSysfs(bool *onBattery, int *percent)
{
#if defined(Q_OS_LINUX)
    QDir supplies(QStringLiteral("/sys/class/power_supply"));

    if (!supplies.exists())
        return false;

    bool found = false;
    bool discharging = false;
    int level = -1;

    for (const QString &name : supplies.entryList(QDir::Dirs | QDir::NoDotAndDotDot)) {
        QFile type(supplies.filePath(name + QStringLiteral("/type")));

        if (!type.open(QIODevice::ReadOnly))
            continue;

        const QString kind = QString::fromUtf8(type.readAll()).trimmed();

        if (kind != QLatin1String("Battery"))
            continue;

        found = true;

        QFile status(supplies.filePath(name + QStringLiteral("/status")));

        if (status.open(QIODevice::ReadOnly))
            discharging = QString::fromUtf8(status.readAll()).trimmed() == QLatin1String("Discharging");

        QFile capacity(supplies.filePath(name + QStringLiteral("/capacity")));

        if (capacity.open(QIODevice::ReadOnly)) {
            bool ok = false;
            const int value = QString::fromUtf8(capacity.readAll()).trimmed().toInt(&ok);

            if (ok)
                level = qMax(level, value);
        }
    }

    if (!found)
        return false;

    *onBattery = discharging;

    if (level >= 0)
        *percent = level;

    return true;
#else
    Q_UNUSED(onBattery)
    Q_UNUSED(percent)

    return false;
#endif
}

} // namespace

PowerMonitor::PowerMonitor(QObject *parent)
    : QObject(parent)
{
#ifdef PULSAR_HAS_DBUS
    QDBusConnection bus = QDBusConnection::systemBus();

    if (!bus.isConnected())
        return;

    bus.connect(QStringLiteral("org.freedesktop.login1"),
                QStringLiteral("/org/freedesktop/login1"),
                QStringLiteral("org.freedesktop.login1"),
                QStringLiteral("PrepareForSleep"),
                this,
                SLOT(onPrepareForSleep(bool)));

    bus.connect(QStringLiteral("org.freedesktop.UPower"),
                QStringLiteral("/org/freedesktop/UPower"),
                QStringLiteral("org.freedesktop.DBus.Properties"),
                QStringLiteral("PropertiesChanged"),
                this,
                SLOT(onPropertiesChanged(QString, QVariantMap, QStringList)));
#endif
}

void PowerMonitor::onPrepareForSleep(bool sleeping)
{
    if (sleeping)
        Q_EMIT suspend();
    else
        Q_EMIT resume();
}

void PowerMonitor::onPropertiesChanged(const QString &interface,
                                       const QVariantMap &changed,
                                       const QStringList &invalidated)
{
    Q_UNUSED(invalidated)

    if (interface != QLatin1String("org.freedesktop.UPower"))
        return;

    const auto value = changed.constFind(QStringLiteral("OnBattery"));

    if (value == changed.constEnd())
        return;

    QVariant onBattery = *value;

    if (onBattery.userType() == qMetaTypeId<QDBusVariant>())
        onBattery = onBattery.value<QDBusVariant>().variant();

    Q_EMIT sourceChanged(onBattery.toBool());
}

QVariantMap PowerMonitor::state()
{
    bool onBattery = false;
    int percent = -1;
    bool known = false;

#ifdef PULSAR_HAS_DBUS
    QDBusConnection bus = QDBusConnection::systemBus();

    if (bus.isConnected()) {
        QDBusMessage call = QDBusMessage::createMethodCall(QStringLiteral("org.freedesktop.UPower"),
                                                           QStringLiteral("/org/freedesktop/UPower"),
                                                           QStringLiteral("org.freedesktop.DBus.Properties"),
                                                           QStringLiteral("Get"));
        call.setArguments({QStringLiteral("org.freedesktop.UPower"), QStringLiteral("OnBattery")});
        const QDBusReply<QDBusVariant> reply = bus.call(call);

        if (reply.isValid()) {
            onBattery = reply.value().variant().toBool();
            known = true;
        } else if (qEnvironmentVariableIsSet("PULSAR_DEBUG")) {
            qWarning().noquote() << "POWER dbus:" << reply.error().message();
        }

        QDBusMessage level = QDBusMessage::createMethodCall(
            QStringLiteral("org.freedesktop.UPower"),
            QStringLiteral("/org/freedesktop/UPower/devices/DisplayDevice"),
            QStringLiteral("org.freedesktop.DBus.Properties"),
            QStringLiteral("Get"));
        level.setArguments({QStringLiteral("org.freedesktop.UPower.Device"), QStringLiteral("Percentage")});
        const QDBusReply<QDBusVariant> levelReply = bus.call(level);

        if (levelReply.isValid())
            percent = qRound(levelReply.value().variant().toDouble());
    }
#endif

    if (!known)
        known = readSysfs(&onBattery, &percent);

    QVariantMap out;
    out.insert(QStringLiteral("known"), known);
    out.insert(QStringLiteral("onBattery"), onBattery);
    out.insert(QStringLiteral("source"),
               !known ? QStringLiteral("unknown")
                      : (onBattery ? QStringLiteral("battery") : QStringLiteral("ac")));

    if (percent >= 0)
        out.insert(QStringLiteral("percent"), percent);

    return out;
}
