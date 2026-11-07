#pragma once

#include <QJsonObject>
#include <QLocale>
#include <QTimeZone>

namespace pulsar {

// QuickJS has no Intl, so the runtime asks the host for the system locale.
inline QJsonObject systemLocale()
{
    const QLocale locale = QLocale::system();
    const QString name = locale.name().replace(QLatin1Char('_'), QLatin1Char('-'));

    QJsonObject value;
    value.insert(QStringLiteral("locale"), name);
    value.insert(QStringLiteral("language"), name.section(QLatin1Char('-'), 0, 0));
    value.insert(QStringLiteral("timezone"), QString::fromUtf8(QTimeZone::systemTimeZoneId()));

    return value;
}

} // namespace pulsar
