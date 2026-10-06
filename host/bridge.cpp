#include "bridge.h"

#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTimer>

Bridge::Bridge(QJSEngine *engine, QObject *parent)
    : QObject(parent)
    , engine_(engine)
{
    connect(&process_, &QProcess::readyReadStandardOutput,
            this, &Bridge::onReadyReadStandardOutput);
    connect(&process_, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
            this, &Bridge::onProcessFinished);
    connect(&process_, &QProcess::errorOccurred, this, [this](QProcess::ProcessError e) {
        qInfo() << "bridge proc error:" << int(e);
    });
    connect(&process_, &QProcess::stateChanged, this, [this](QProcess::ProcessState s) {
        if (s == QProcess::Running && !readyEmitted_) {
            readyEmitted_ = true;
            emit ready();
        }
    });

    QTimer *startTimer = new QTimer(this);
    startTimer->setSingleShot(true);
    QObject::connect(startTimer, &QTimer::timeout, this, &Bridge::startBridge);
    startTimer->start(0);
}

Bridge::~Bridge() = default;

void Bridge::startBridge()
{
    const QString appDir = QCoreApplication::applicationDirPath();
    QStringList candidates;
    const QString installed = appDir + QStringLiteral("/bridge");
    if (QFileInfo::exists(installed))
        candidates << installed;
    const QString rel = QDir::current().filePath(QStringLiteral("zig-out/bin/bridge"));
    if (QFileInfo::exists(rel))
        candidates << rel;

    QString chosen;
    for (const QString &c : std::as_const(candidates)) {
        if (QFileInfo::exists(c)) {
            chosen = c;
            break;
        }
    }
    if (chosen.isEmpty()) {
        emit response(-1, QJSValue(QJSValue::NullValue),
                      engine_->toScriptValue(QStringLiteral("Zig bridge binary not found")));
        return;
    }

    QString qmlRootDir;
    {
        QDir root(appDir);
        if (root.cd(QStringLiteral("../..")))
            qmlRootDir = root.absolutePath();
    }
    process_.setWorkingDirectory(qmlRootDir);
    process_.start(chosen, QStringList{ qmlRootDir });
}

QString Bridge::diagnostics() const
{
    return QStringLiteral("bridge=%1 root=%2")
        .arg(process_.state() == QProcess::Running ? QStringLiteral("running")
                                                   : QStringLiteral("not-running"))
        .arg(process_.workingDirectory());
}

qint64 Bridge::invoke(const QString &method, const QJSValue &params)
{
    const qint64 id = nextId_++;

    QVariantMap p;
    if (params.isObject())
        p = params.toVariant().toMap();

    QJsonObject body;
    body.insert(QStringLiteral("id"), id);
    body.insert(QStringLiteral("method"), method);
    body.insert(QStringLiteral("params"), QJsonObject::fromVariantMap(p));
    const QByteArray line = QJsonDocument(body).toJson(QJsonDocument::Compact) + '\n';

    if (process_.state() != QProcess::Running) {
        emit response(id, QJSValue(QJSValue::NullValue),
                      engine_->toScriptValue(QStringLiteral("bridge is not running")));
        return id;
    }

    process_.write(line);
    return id;
}

void Bridge::onReadyReadStandardOutput()
{
    stdoutBuffer_ += process_.readAllStandardOutput();
    int idx;
    while ((idx = stdoutBuffer_.indexOf('\n')) >= 0) {
        const QByteArray line = stdoutBuffer_.left(idx);
        stdoutBuffer_.remove(0, idx + 1);
        if (!line.trimmed().isEmpty())
            handleResponse(line);
    }
}

void Bridge::onProcessFinished(int exitCode, QProcess::ExitStatus status)
{
    Q_UNUSED(exitCode);
    Q_UNUSED(status);
    emit response(-1, QJSValue(QJSValue::NullValue),
                  engine_->toScriptValue(QStringLiteral("zig bridge exited unexpectedly")));
}

void Bridge::handleResponse(const QByteArray &line)
{
    const QJsonDocument doc = QJsonDocument::fromJson(line);
    if (!doc.isObject())
        return;
    const QJsonObject obj = doc.object();

    const qint64 id = qint64(obj.value(QStringLiteral("id")).toDouble());

    QJSValue result(QJSValue::NullValue);
    const QJsonValue rv = obj.value(QStringLiteral("result"));
    if (rv.isObject() || rv.isArray() || rv.isDouble() || rv.isBool() || rv.isString())
        result = engine_->toScriptValue(rv.toVariant());

    QJSValue error(QJSValue::NullValue);
    const QJsonValue ev = obj.value(QStringLiteral("error"));
    if (!ev.isUndefined())
        error = engine_->toScriptValue(ev.toVariant());

    emit response(id, result, error);
}