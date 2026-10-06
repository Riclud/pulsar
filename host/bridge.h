#pragma once

#include <QByteArray>
#include <QHash>
#include <QJSEngine>
#include <QJSValue>
#include <QList>
#include <QObject>
#include <QProcess>

class Bridge : public QObject {
    Q_OBJECT

public:
    explicit Bridge(QJSEngine *engine, QObject *parent = nullptr);
    ~Bridge() override;

    Q_INVOKABLE qint64 invoke(const QString &method, const QJSValue &params);
    Q_INVOKABLE qint64 call(const QString &method, const QJSValue &params, const QJSValue &callback);
    Q_INVOKABLE QString diagnostics() const;

signals:
    void ready();
    void response(qint64 id, const QJSValue &result, const QJSValue &error);

private slots:
    void onReadyReadStandardOutput();
    void onProcessFinished(int exitCode, QProcess::ExitStatus status);

private:
    void startBridge();
    void handleResponse(const QByteArray &line);

    QProcess process_;
    QJSEngine *engine_;
    QByteArray stdoutBuffer_;
    qint64 nextId_ = 1;
    bool readyEmitted_ = false;
    QHash<qint64, QJSValue> callbacks_;
    QList<QByteArray> pendingWrites_;
};