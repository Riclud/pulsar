#pragma once

#include <QByteArray>
#include <QJSEngine>
#include <QJSValue>
#include <QList>
#include <QObject>
#include <QProcess>

class QQmlPropertyMap;

class Bridge : public QObject {
    Q_OBJECT

public:
    explicit Bridge(QJSEngine *engine, QQmlPropertyMap *store, QObject *parent = nullptr);
    ~Bridge() override;

    Q_INVOKABLE qint64 invoke(const QString &method, const QJSValue &params);
    Q_INVOKABLE qint64 emit(const QString &method, const QJSValue &params);
    Q_INVOKABLE QString diagnostics() const;

signals:
    void ready();
    void response(qint64 id, const QJSValue &result, const QJSValue &error);
    void notification(const QString &method, const QJSValue &params);
    void crashed(const QString &kind, int code);

private slots:
    void onReadyReadStandardOutput();
    void onProcessFinished(int exitCode, QProcess::ExitStatus status);

private:
    void startBridge();
    void restart();
    void handleResponse(const QByteArray &line);

    QProcess process_;
    QJSEngine *engine_;
    QQmlPropertyMap *store_ = nullptr;
    QByteArray stdoutBuffer_;
    qint64 nextId_ = 1;
    bool readyEmitted_ = false;
    bool synced_ = false;
    bool crashed_ = false;
    int restartBudget_ = 0;
    QList<QByteArray> pendingWrites_;
};
