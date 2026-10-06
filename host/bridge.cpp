#include "bridge.h"
#include "log.h"

#include <QClipboard>
#include <QCoreApplication>
#include <QDir>
#include <QFileDialog>
#include <QFileInfo>
#include <QGuiApplication>
#include <QMessageBox>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQmlPropertyMap>
#include <QTimer>

Bridge::Bridge(QJSEngine *engine, QQmlPropertyMap *store, QObject *parent)
    : QObject(parent)
    , engine_(engine)
    , store_(store)
{
    bool hasRestart = false;
    const int restart = qEnvironmentVariableIntValue("PULSAR_RESTART", &hasRestart);
    restartBudget_ = (hasRestart && restart > 0) ? restart : 0;

    connect(&process_, &QProcess::readyReadStandardOutput,
            this, &Bridge::onReadyReadStandardOutput);
    connect(&process_, &QProcess::readyReadStandardError,
            this, &Bridge::onReadyReadStandardError);
    connect(&process_, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
            this, &Bridge::onProcessFinished);
    connect(&process_, &QProcess::errorOccurred, this, [this](QProcess::ProcessError e) {
        qInfo() << "bridge proc error:" << int(e);
    });
    connect(&process_, &QProcess::stateChanged, this, [this](QProcess::ProcessState s) {
        if (s == QProcess::Running) {
            for (const QByteArray &w : std::as_const(pendingWrites_))
                process_.write(w);
            pendingWrites_.clear();
            if (!synced_) {
                synced_ = true;
                invoke(QStringLiteral("__sync"), QJSValue());
            }
            if (!readyEmitted_) {
                readyEmitted_ = true;
                Q_EMIT ready();
            }
        }
    });

    QTimer *startTimer = new QTimer(this);
    startTimer->setSingleShot(true);
    QObject::connect(startTimer, &QTimer::timeout, this, &Bridge::startBridge);
    startTimer->start(0);
}

Bridge::~Bridge()
{
    pendingCalls_.clear();
    process_.blockSignals(true);
    if (process_.state() != QProcess::NotRunning) {
        process_.terminate();
        if (!process_.waitForFinished(1000))
            process_.kill();
    }
}

void Bridge::startBridge()
{
    const QString appDir = QCoreApplication::applicationDirPath();

    QString qmlRootDir;
    const QByteArray rootEnv = qgetenv("PULSAR_ROOT");
    if (!rootEnv.isEmpty()) {
        qmlRootDir = QString::fromLocal8Bit(rootEnv);
    } else {
        // Walk up from the executable until the runtime is found, so an
        // installed layout (bin/ + core/ + app/) works just like the dev one
        // (zig-out/bin/ + core/).
        QDir dir(appDir);
        for (int i = 0; i < 8; ++i) {
            if (QFileInfo::exists(dir.filePath(QStringLiteral("core/runtime/main.ts")))) {
                qmlRootDir = dir.absolutePath();
                break;
            }
            if (!dir.cdUp())
                break;
        }
        if (qmlRootDir.isEmpty()) {
            QDir root(appDir);
            if (root.cd(QStringLiteral("../..")))
                qmlRootDir = root.absolutePath();
        }
    }

    QStringList candidates;
    const auto consider = [&candidates](const QString &path) {
        if (path.isEmpty())
            return;
        const QString exe = path + QStringLiteral(".exe");
        if (QFileInfo::exists(path))
            candidates << path;
        else if (QFileInfo::exists(exe))
            candidates << exe;
    };
    consider(QString::fromLocal8Bit(qgetenv("PULSAR_BRIDGE")));
    consider(appDir + QStringLiteral("/bridge"));
    consider(qmlRootDir + QStringLiteral("/bridge"));
    consider(QDir::current().filePath(QStringLiteral("zig-out/bin/bridge")));

    QString chosen;
    for (const QString &c : std::as_const(candidates)) {
        if (QFileInfo::exists(c)) {
            chosen = c;
            break;
        }
    }
    if (chosen.isEmpty()) {
        Q_EMIT response(-1, QJSValue(QJSValue::NullValue),
                        engine_->toScriptValue(QStringLiteral("Zig bridge binary not found")));
        return;
    }

    process_.setWorkingDirectory(qmlRootDir);
    process_.start(chosen, QStringList{ qmlRootDir });
}

void Bridge::restart()
{
    restarting_ = true;
    if (process_.state() != QProcess::NotRunning) {
        process_.terminate();
        if (!process_.waitForFinished(1000))
            process_.kill();
    }
    restarting_ = false;
    stdoutBuffer_.clear();
    stderrBuffer_.clear();
    pendingWrites_.clear();
    synced_ = false;
    readyEmitted_ = false;
    crashed_ = false;
    startBridge();
}

void Bridge::clipboardWrite(const QString &text)
{
    if (QGuiApplication::clipboard())
        QGuiApplication::clipboard()->setText(text);
}

QString Bridge::clipboardText() const
{
    return QGuiApplication::clipboard() ? QGuiApplication::clipboard()->text() : QString();
}

QString Bridge::openFile(const QString &title, const QString &filter, const QString &dir)
{
    return QFileDialog::getOpenFileName(nullptr, title, dir, filter);
}

QString Bridge::saveFile(const QString &title, const QString &filter, const QString &dir)
{
    return QFileDialog::getSaveFileName(nullptr, title, dir, filter);
}

void Bridge::message(const QString &title, const QString &text)
{
    QMessageBox::information(nullptr, title, text);
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
        pendingWrites_.append(line);
        return id;
    }

    process_.write(line);
    return id;
}

qint64 Bridge::emit(const QString &method, const QJSValue &params)
{
    return invoke(method, params);
}

void Bridge::notify(const QString &method, const QJsonObject &params)
{
    QJsonObject body;
    body.insert(QStringLiteral("jsonrpc"), QStringLiteral("2.0"));
    body.insert(QStringLiteral("method"), method);
    body.insert(QStringLiteral("params"), params);
    const QByteArray line = QJsonDocument(body).toJson(QJsonDocument::Compact) + '\n';

    if (process_.state() != QProcess::Running) {
        pendingWrites_.append(line);
        return;
    }
    process_.write(line);
}

void Bridge::postLog(const QString &level, const QString &message, const QString &source)
{
    Q_EMIT log(level, message, source);
}

void Bridge::ensurePromiseFactory()
{
    if (promiseFactory_.isCallable())
        return;

    // Creates a Promise and hands back its resolve/reject callbacks; the
    // correlation with a response id is done in C++ (see handleResponse).
    const QString src = QStringLiteral(
        "(function () {"
        "  var resolve, reject;"
        "  var promise = new Promise(function (res, rej) { resolve = res; reject = rej; });"
        "  return { promise: promise, resolve: resolve, reject: reject };"
        "})");
    promiseFactory_ = engine_->evaluate(src);
    if (promiseFactory_.isError())
        qWarning().noquote() << "bridge: promise factory failed:" << promiseFactory_.toString();
}

QJSValue Bridge::call(const QString &method, const QJSValue &params)
{
    ensurePromiseFactory();
    if (!promiseFactory_.isCallable())
        return engine_->evaluate(QStringLiteral("Promise.reject(new Error('pulsar: bridge not ready'))"));

    const QJSValue handle = promiseFactory_.call();
    if (!handle.isObject())
        return engine_->evaluate(QStringLiteral("Promise.reject(new Error('pulsar: cannot create promise'))"));

    const qint64 id = invoke(method, params);
    PendingCall pending;
    pending.resolve = handle.property(QStringLiteral("resolve"));
    pending.reject = handle.property(QStringLiteral("reject"));
    pendingCalls_.insert(id, pending);
    return handle.property(QStringLiteral("promise"));
}

void Bridge::failPending(const QString &reason)
{
    if (pendingCalls_.isEmpty())
        return;
    const QJSValue reasonValue = engine_->toScriptValue(reason);
    const QList<qint64> ids = pendingCalls_.keys();
    for (const qint64 id : ids) {
        const PendingCall pending = pendingCalls_.take(id);
        if (pending.reject.isCallable())
            pending.reject.call(QJSValueList{ reasonValue });
    }
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

void Bridge::onReadyReadStandardError()
{
    stderrBuffer_ += process_.readAllStandardError();
    int idx;
    while ((idx = stderrBuffer_.indexOf('\n')) >= 0) {
        const QByteArray line = stderrBuffer_.left(idx).trimmed();
        stderrBuffer_.remove(0, idx + 1);
        if (!line.isEmpty())
            pulsar::forwardLine(QString::fromUtf8(line));
    }
}

void Bridge::onProcessFinished(int exitCode, QProcess::ExitStatus status)
{
    Q_UNUSED(exitCode);
    Q_UNUSED(status);
    if (restarting_) {
        restarting_ = false;
        return;
    }
    if (!stderrBuffer_.isEmpty()) {
        pulsar::forwardLine(QString::fromUtf8(stderrBuffer_.trimmed()));
        stderrBuffer_.clear();
    }
    failPending(QStringLiteral("zig bridge exited"));
    if (restartBudget_ > 0) {
        --restartBudget_;
        qWarning().noquote() << "bridge exited; restarting (attempts left:" << restartBudget_ << ")";
        restart();
        return;
    }
    // A Bun crash was already surfaced through the crashed() signal.
    if (crashed_)
        return;
    Q_EMIT response(-1, QJSValue(QJSValue::NullValue),
                    engine_->toScriptValue(QStringLiteral("zig bridge exited unexpectedly")));
}

void Bridge::handleResponse(const QByteArray &line)
{
    const QJsonDocument doc = QJsonDocument::fromJson(line);
    if (!doc.isObject())
        return;
    const QJsonObject obj = doc.object();

    // Responses carry an "id"; unsolicited notifications (Bun push) do not.
    const bool hasId = obj.contains(QStringLiteral("id"));

    QString notifyMethod;
    QJsonObject notifyParams;
    QJsonObject state;
    QJsonArray unset;
    if (hasId) {
        state = obj.value(QStringLiteral("state")).toObject();
        unset = obj.value(QStringLiteral("unset")).toArray();
    } else {
        notifyMethod = obj.value(QStringLiteral("method")).toString();
        notifyParams = obj.value(QStringLiteral("params")).toObject();
        state = notifyParams.value(QStringLiteral("state")).toObject();
        unset = notifyParams.value(QStringLiteral("unset")).toArray();
        if (qEnvironmentVariableIsSet("PULSAR_DEBUG"))
            qInfo().noquote() << "NOTIFY" << notifyMethod;
    }

    if (store_ && !state.isEmpty()) {
        QVariantHash values;
        for (auto it = state.begin(); it != state.end(); ++it) {
            values.insert(it.key(), it.value().toVariant());
            if (qEnvironmentVariableIsSet("PULSAR_DEBUG")) {
                const QVariant v = it.value().toVariant();
                if (v.metaType().id() == QMetaType::QVariantList)
                    qInfo().noquote() << "STORE" << it.key() << "(list size" << v.toList().size() << ")";
                else
                    qInfo().noquote() << "STORE" << it.key() << "=" << v;
            }
        }
        if (!values.isEmpty())
            store_->insert(values);
    }

    if (store_ && !unset.isEmpty()) {
        for (const QJsonValue &v : unset) {
            if (qEnvironmentVariableIsSet("PULSAR_DEBUG"))
                qInfo().noquote() << "STORE unset" << v.toString();
            store_->clear(v.toString());
        }
    }

    if (!hasId) {
        // Bun supervision: the Zig bridge reports a dead Bun runtime here.
        if (notifyMethod == QLatin1String("__crash")) {
            crashed_ = true;
            const QString kind = notifyParams.value(QStringLiteral("kind")).toString();
            const int code = notifyParams.contains(QStringLiteral("code"))
                                 ? notifyParams.value(QStringLiteral("code")).toInt()
                                 : notifyParams.value(QStringLiteral("signal")).toInt(-1);
            Q_EMIT crashed(kind, code);
            if (restartBudget_ <= 0)
                QCoreApplication::exit(70);
            return;
        }
        Q_EMIT notification(notifyMethod, engine_->toScriptValue(notifyParams.toVariantMap()));
        return;
    }

    const qint64 id = qint64(obj.value(QStringLiteral("id")).toDouble());

    QJSValue result(QJSValue::NullValue);
    const QJsonValue rv = obj.value(QStringLiteral("result"));
    if (rv.isObject() || rv.isArray() || rv.isDouble() || rv.isBool() || rv.isString())
        result = engine_->toScriptValue(rv.toVariant());

    QJSValue error(QJSValue::NullValue);
    const QJsonValue ev = obj.value(QStringLiteral("error"));
    if (!ev.isUndefined())
        error = engine_->toScriptValue(ev.toVariant());

    Q_EMIT response(id, result, error);

    if (pendingCalls_.contains(id)) {
        const PendingCall pending = pendingCalls_.take(id);
        if (error.isNull() || error.isUndefined()) {
            if (pending.resolve.isCallable())
                pending.resolve.call(QJSValueList{ result });
        } else if (pending.reject.isCallable()) {
            pending.reject.call(QJSValueList{ error });
        }
    }
}
