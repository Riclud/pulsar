#pragma once

#include <QObject>
#include <QVariantMap>

class PowerMonitor : public QObject {
    Q_OBJECT

public:
    explicit PowerMonitor(QObject *parent = nullptr);

    QVariantMap state();

signals:
    void suspend();
    void resume();
    void sourceChanged(bool onBattery);

private slots:
    void onPrepareForSleep(bool sleeping);
    void onPropertiesChanged(const QString &interface, const QVariantMap &changed, const QStringList &invalidated);
};
