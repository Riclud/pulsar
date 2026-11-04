#pragma once

#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonObject>
#include <QRect>
#include <QScreen>

namespace pulsar {

inline QJsonObject screenInfo(QScreen *screen, QScreen *primary)
{
    const QRect geometry = screen->geometry();
    const QRect area = screen->availableGeometry();

    QJsonObject work;
    work.insert(QStringLiteral("x"), area.x());
    work.insert(QStringLiteral("y"), area.y());
    work.insert(QStringLiteral("width"), area.width());
    work.insert(QStringLiteral("height"), area.height());

    QJsonObject info;
    info.insert(QStringLiteral("name"), screen->name());
    info.insert(QStringLiteral("x"), geometry.x());
    info.insert(QStringLiteral("y"), geometry.y());
    info.insert(QStringLiteral("width"), geometry.width());
    info.insert(QStringLiteral("height"), geometry.height());
    info.insert(QStringLiteral("workArea"), work);
    info.insert(QStringLiteral("scale"), screen->devicePixelRatio());
    info.insert(QStringLiteral("primary"), screen == primary);

    return info;
}

inline QJsonArray screenList()
{
    QJsonArray screens;
    QScreen *primary = QGuiApplication::primaryScreen();

    for (QScreen *screen : QGuiApplication::screens())
        screens.append(screenInfo(screen, primary));

    return screens;
}

} // namespace pulsar
