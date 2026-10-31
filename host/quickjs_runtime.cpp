#include "quickjs_runtime.h"

#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonValue>
#include <QStandardPaths>
#include <QTimer>
#include <QUrl>

namespace pulsar {

namespace {

QuickJsRuntime *self(JSContext *ctx)
{
    return static_cast<QuickJsRuntime *>(JS_GetContextOpaque(ctx));
}

QString toQString(JSContext *ctx, JSValueConst value)
{
    const char *text = JS_ToCString(ctx, value);
    if (!text)
        return {};
    const QString result = QString::fromUtf8(text);
    JS_FreeCString(ctx, text);
    return result;
}

QByteArray toBytes(JSContext *ctx, JSValueConst value)
{
    size_t length = 0;
    uint8_t *data = JS_GetArrayBuffer(ctx, &length, value);
    if (!data)
        return {};
    return QByteArray(reinterpret_cast<const char *>(data), static_cast<int>(length));
}

JSValue jsonString(JSContext *ctx, const QJsonDocument &doc)
{
    const QByteArray text = doc.toJson(QJsonDocument::Compact);
    return JS_NewStringLen(ctx, text.constData(), text.size());
}

QString sanitizeId(const QString &raw)
{
    QString out;
    for (const QChar c : raw.toLower()) {
        if (c.isLetterOrNumber() || c == QLatin1Char('.') || c == QLatin1Char('-') || c == QLatin1Char('_'))
            out.append(c);
        else
            out.append(QLatin1Char('-'));
    }
    while (out.startsWith(QLatin1Char('-')) || out.startsWith(QLatin1Char('.')))
        out.remove(0, 1);
    while (out.endsWith(QLatin1Char('-')) || out.endsWith(QLatin1Char('.')))
        out.chop(1);
    return out.isEmpty() ? QStringLiteral("pulsar-app") : out;
}

bool copyRecursive(const QString &from, const QString &to)
{
    const QFileInfo info(from);

    if (info.isDir()) {
        if (!QDir().mkpath(to))
            return false;

        const QDir dir(from);

        for (const QFileInfo &entry : dir.entryInfoList(QDir::AllEntries | QDir::NoDotAndDotDot)) {
            if (!copyRecursive(entry.absoluteFilePath(), to + QLatin1Char('/') + entry.fileName()))
                return false;
        }

        return true;
    }

    QDir().mkpath(QFileInfo(to).absolutePath());

    if (!QFile::copy(from, to))
        return false;

    QFile target(to);

    if (target.open(QIODevice::ReadWrite)) {
        if (info.lastModified().isValid())
            target.setFileTime(info.lastModified(), QFileDevice::FileModificationTime);

        if (info.birthTime().isValid())
            target.setFileTime(info.birthTime(), QFileDevice::FileBirthTime);

        target.close();
    }

    return true;
}

} // namespace

QuickJsRuntime::QuickJsRuntime(QObject *parent)
    : QObject(parent)
{
    runtime_ = JS_NewRuntime();

    if (!runtime_) {
        Q_EMIT failed(QStringLiteral("cannot create the QuickJS runtime"));
        return;
    }

    context_ = JS_NewContext(runtime_);

    if (!context_) {
        Q_EMIT failed(QStringLiteral("cannot create the QuickJS context"));
        return;
    }

    JS_SetContextOpaque(context_, this);

    installGlobals();
}

QuickJsRuntime::~QuickJsRuntime()
{
    for (auto it = timers_.begin(); it != timers_.end(); ++it) {
        if (it->timer) {
            it->timer->stop();
            it->timer->deleteLater();
        }

        JS_FreeValue(context_, it->callback);
    }

    timers_.clear();

    if (context_)
        JS_FreeContext(context_);
    if (runtime_)
        JS_FreeRuntime(runtime_);
}

void QuickJsRuntime::installGlobals()
{
    JSValue global = JS_GetGlobalObject(context_);

    JS_SetPropertyStr(context_, global, "__pulsarSend",
                      JS_NewCFunction(context_, jsPulsarSend, "__pulsarSend", 1));
    JS_SetPropertyStr(context_, global, "__pulsarSendBinary",
                      JS_NewCFunction(context_, jsPulsarSendBinary, "__pulsarSendBinary", 2));
    JS_SetPropertyStr(context_, global, "__pulsarLog",
                      JS_NewCFunction(context_, jsPulsarLog, "__pulsarLog", 2));
    JS_SetPropertyStr(context_, global, "__pulsarPlatformInfo",
                      JS_NewCFunction(context_, jsPulsarPlatformInfo, "__pulsarPlatformInfo", 0));
    JS_SetPropertyStr(context_, global, "__pulsarPaths",
                      JS_NewCFunction(context_, jsPulsarPaths, "__pulsarPaths", 0));
    JS_SetPropertyStr(context_, global, "__pulsarEnv",
                      JS_NewCFunction(context_, jsPulsarEnv, "__pulsarEnv", 1));
    JS_SetPropertyStr(context_, global, "__pulsarReadFile",
                      JS_NewCFunction(context_, jsPulsarReadFile, "__pulsarReadFile", 2));
    JS_SetPropertyStr(context_, global, "__pulsarWriteFile",
                      JS_NewCFunction(context_, jsPulsarWriteFile, "__pulsarWriteFile", 3));
    JS_SetPropertyStr(context_, global, "__pulsarAppendFile",
                      JS_NewCFunction(context_, jsPulsarAppendFile, "__pulsarAppendFile", 3));
    JS_SetPropertyStr(context_, global, "__pulsarListDir",
                      JS_NewCFunction(context_, jsPulsarListDir, "__pulsarListDir", 1));
    JS_SetPropertyStr(context_, global, "__pulsarExists",
                      JS_NewCFunction(context_, jsPulsarExists, "__pulsarExists", 1));
    JS_SetPropertyStr(context_, global, "__pulsarStat",
                      JS_NewCFunction(context_, jsPulsarStat, "__pulsarStat", 1));
    JS_SetPropertyStr(context_, global, "__pulsarMkdir",
                      JS_NewCFunction(context_, jsPulsarMkdir, "__pulsarMkdir", 2));
    JS_SetPropertyStr(context_, global, "__pulsarRemove",
                      JS_NewCFunction(context_, jsPulsarRemove, "__pulsarRemove", 2));
    JS_SetPropertyStr(context_, global, "__pulsarRename",
                      JS_NewCFunction(context_, jsPulsarRename, "__pulsarRename", 2));
    JS_SetPropertyStr(context_, global, "__pulsarCopy",
                      JS_NewCFunction(context_, jsPulsarCopy, "__pulsarCopy", 3));
    JS_SetPropertyStr(context_, global, "__pulsarMoveToTrash",
                      JS_NewCFunction(context_, jsPulsarMoveToTrash, "__pulsarMoveToTrash", 1));
    JS_SetPropertyStr(context_, global, "__pulsarOpenUrl",
                      JS_NewCFunction(context_, jsPulsarOpenUrl, "__pulsarOpenUrl", 1));
    JS_SetPropertyStr(context_, global, "setTimeout",
                      JS_NewCFunction(context_, jsPulsarSetTimeout, "setTimeout", 2));
    JS_SetPropertyStr(context_, global, "setInterval",
                      JS_NewCFunction(context_, jsPulsarSetInterval, "setInterval", 2));
    JS_SetPropertyStr(context_, global, "clearTimeout",
                      JS_NewCFunction(context_, jsPulsarClearTimer, "clearTimeout", 1));
    JS_SetPropertyStr(context_, global, "clearInterval",
                      JS_NewCFunction(context_, jsPulsarClearTimer, "clearInterval", 1));

    JS_FreeValue(context_, global);

    static const char *bootstrap =
        "globalThis.console = {"
        "  log: (...a) => __pulsarLog('log', a.map(String).join(' ')),"
        "  info: (...a) => __pulsarLog('info', a.map(String).join(' ')),"
        "  debug: (...a) => __pulsarLog('debug', a.map(String).join(' ')),"
        "  warn: (...a) => __pulsarLog('warn', a.map(String).join(' ')),"
        "  error: (...a) => __pulsarLog('error', a.map(String).join(' ')),"
        "};"
        "globalThis.queueMicrotask = globalThis.queueMicrotask || ((fn) => Promise.resolve().then(fn));";

    evaluate(QByteArray(bootstrap), QStringLiteral("<bootstrap>"));
}

bool QuickJsRuntime::start(const QString &bundlePath, const QString &manifestJson, const QString &appDir)
{
    if (!context_ || !runtime_) {
        Q_EMIT failed(QStringLiteral("QuickJS is not initialized"));
        return false;
    }

    manifest_ = QJsonDocument::fromJson(manifestJson.toUtf8()).object();
    appDir_ = appDir;

    QFile bundle(bundlePath);

    if (!bundle.open(QIODevice::ReadOnly)) {
        Q_EMIT failed(QStringLiteral("cannot open the JS bundle: %1").arg(bundlePath));
        return false;
    }

    const QByteArray code = bundle.readAll();

    if (!evaluate(code, bundlePath)) return false;

    runJobs();

    return true;
}

bool QuickJsRuntime::evaluate(const QByteArray &code, const QString &filename)
{
    JSValue global = JS_GetGlobalObject(context_);

    const QByteArray manifestText =
        manifest_.isEmpty() ? QByteArray("null") : QJsonDocument(manifest_).toJson(QJsonDocument::Compact);
    const QByteArray appDirText = appDir_.toUtf8();

    JS_SetPropertyStr(context_, global, "__pulsarManifest",
                      JS_NewStringLen(context_, manifestText.constData(), manifestText.size()));
    JS_SetPropertyStr(context_, global, "__pulsarAppDir",
                      JS_NewStringLen(context_, appDirText.constData(), appDirText.size()));

    JS_FreeValue(context_, global);

    const QByteArray name = filename.toUtf8();
    JSValue compiled = JS_Eval(context_, code.constData(), code.size(), name.constData(),
                               JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);

    if (JS_IsException(compiled)) {
        reportException(filename);
        JS_FreeValue(context_, compiled);
        return false;
    }

    JSValue result = JS_EvalFunction(context_, compiled);

    if (JS_IsException(result)) {
        reportException(filename);
        JS_FreeValue(context_, result);
        return false;
    }

    JS_FreeValue(context_, result);

    return true;
}

void QuickJsRuntime::receive(const QJsonObject &message)
{
    if (!context_)
        return;

    JSValue global = JS_GetGlobalObject(context_);
    JSValue callback = JS_GetPropertyStr(context_, global, "__pulsarReceive");

    if (JS_IsFunction(context_, callback)) {
        const QByteArray text = QJsonDocument(message).toJson(QJsonDocument::Compact);
        JSValue argument = JS_NewStringLen(context_, text.constData(), text.size());
        JSValue result = JS_Call(context_, callback, global, 1, &argument);

        JS_FreeValue(context_, argument);

        if (JS_IsException(result))
            reportException(QStringLiteral("receive"));

        JS_FreeValue(context_, result);
    }

    JS_FreeValue(context_, callback);
    JS_FreeValue(context_, global);

    runJobs();
}

void QuickJsRuntime::receiveBinary(quint32 id, const QByteArray &data)
{
    if (!context_)
        return;

    JSValue global = JS_GetGlobalObject(context_);
    JSValue callback = JS_GetPropertyStr(context_, global, "__pulsarReceiveData");

    if (JS_IsFunction(context_, callback)) {
        JSValue args[2];
        args[0] = JS_NewInt32(context_, static_cast<int32_t>(id));
        args[1] = JS_NewArrayBufferCopy(context_, reinterpret_cast<const uint8_t *>(data.constData()), data.size());

        JSValue result = JS_Call(context_, callback, global, 2, args);

        JS_FreeValue(context_, args[0]);
        JS_FreeValue(context_, args[1]);

        if (JS_IsException(result))
            reportException(QStringLiteral("receiveBinary"));

        JS_FreeValue(context_, result);
    }

    JS_FreeValue(context_, callback);
    JS_FreeValue(context_, global);

    runJobs();
}

void QuickJsRuntime::runJobs()
{
    if (!runtime_)
        return;

    JSContext *context = nullptr;
    int status = 0;

    while ((status = JS_ExecutePendingJob(runtime_, &context)) > 0) {
    }

    if (status < 0)
        reportException(QStringLiteral("job"));
}

void QuickJsRuntime::reportException(const QString &scope)
{
    JSValue exception = JS_GetException(context_);
    const char *text = JS_ToCString(context_, exception);
    const QString message = text ? QString::fromUtf8(text) : QStringLiteral("unknown exception");

    if (text)
        JS_FreeCString(context_, text);

    JSValue line = JS_GetPropertyStr(context_, exception, "lineNumber");
    int32_t lineNumber = 0;

    JS_ToInt32(context_, &lineNumber, line);

    JS_FreeValue(context_, line);
    JS_FreeValue(context_, exception);

    Q_EMIT failed(QStringLiteral("%1:%2: %3").arg(scope).arg(lineNumber).arg(message));
}

QString QuickJsRuntime::appId() const
{
    QString id = manifest_.value(QStringLiteral("id")).toString();

    if (id.isEmpty())
        id = QFileInfo(qEnvironmentVariable("PULSAR_APP", QDir::currentPath())).fileName();

    return sanitizeId(id);
}

QJsonObject QuickJsRuntime::paths() const
{
    const QString home = QDir::homePath();
    const QString id = appId();
    QString data;
    QString config;
    QString cache;

#if defined(Q_OS_ANDROID)
    data = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    config = data;
    cache = QStandardPaths::writableLocation(QStandardPaths::CacheLocation);
#elif defined(Q_OS_DARWIN)
    data = home + QStringLiteral("/Library/Application Support/") + id;
    config = data;
    cache = home + QStringLiteral("/Library/Caches/") + id;
#elif defined(Q_OS_WIN)
    const QString roaming = qEnvironmentVariable("APPDATA", home + QStringLiteral("/AppData/Roaming"));
    const QString local = qEnvironmentVariable("LOCALAPPDATA", home + QStringLiteral("/AppData/Local"));
    data = roaming + QLatin1Char('/') + id;
    config = data;
    cache = local + QLatin1Char('/') + id + QStringLiteral("/cache");
#else
    const QString dataHome = qEnvironmentVariable("XDG_DATA_HOME", home + QStringLiteral("/.local/share"));
    const QString configHome = qEnvironmentVariable("XDG_CONFIG_HOME", home + QStringLiteral("/.config"));
    const QString cacheHome = qEnvironmentVariable("XDG_CACHE_HOME", home + QStringLiteral("/.cache"));
    data = dataHome + QLatin1Char('/') + id;
    config = configHome + QLatin1Char('/') + id;
    cache = cacheHome + QLatin1Char('/') + id;
#endif

    QDir().mkpath(data);
    QDir().mkpath(config);
    QDir().mkpath(cache);

    QJsonObject out;
    out.insert(QStringLiteral("data"), data);
    out.insert(QStringLiteral("config"), config);
    out.insert(QStringLiteral("cache"), cache);
    out.insert(QStringLiteral("temp"), QDir::tempPath());
    out.insert(QStringLiteral("home"), home);

    return out;
}

QJsonObject QuickJsRuntime::platformInfo() const
{
    QJsonObject out;
    out.insert(QStringLiteral("name"), QStringLiteral("quickjs"));

#if defined(Q_OS_ANDROID)
    out.insert(QStringLiteral("kind"), QStringLiteral("mobile"));
    out.insert(QStringLiteral("os"), QStringLiteral("android"));
#else
    out.insert(QStringLiteral("kind"), QStringLiteral("desktop"));
#if defined(Q_OS_DARWIN)
    out.insert(QStringLiteral("os"), QStringLiteral("darwin"));
#elif defined(Q_OS_WIN)
    out.insert(QStringLiteral("os"), QStringLiteral("win32"));
#else
    out.insert(QStringLiteral("os"), QStringLiteral("linux"));
#endif
#endif

    out.insert(QStringLiteral("appId"), appId());
    out.insert(QStringLiteral("cwd"), QDir::currentPath());

    return out;
}

void QuickJsRuntime::fireTimer(int id)
{
    auto it = timers_.find(id);

    if (it == timers_.end())
        return;

    const bool repeating = it->repeating;
    JSValue result = JS_Call(context_, it->callback, JS_UNDEFINED, 0, nullptr);

    if (JS_IsException(result))
        reportException(QStringLiteral("timer"));

    JS_FreeValue(context_, result);

    runJobs();

    if (!repeating)
        clearTimer(id);
}

void QuickJsRuntime::clearTimer(int id)
{
    auto it = timers_.find(id);

    if (it == timers_.end())
        return;

    if (it->timer) {
        it->timer->stop();
        it->timer->deleteLater();
    }

    JS_FreeValue(context_, it->callback);

    timers_.erase(it);
}

} // namespace pulsar

namespace pulsar {

JSValue jsPulsarSend(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 1)
        return JS_UNDEFINED;

    const QString text = toQString(ctx, argv[0]);
    const QJsonDocument doc = QJsonDocument::fromJson(text.toUtf8());

    if (doc.isObject())
        Q_EMIT self(ctx)->message(doc.object());

    return JS_UNDEFINED;
}

JSValue jsPulsarSendBinary(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 2)
        return JS_UNDEFINED;

    int32_t streamId = 0;

    JS_ToInt32(ctx, &streamId, argv[0]);

    const quint32 id = static_cast<quint32>(streamId);

    Q_EMIT self(ctx)->binary(id, toBytes(ctx, argv[1]));

    return JS_UNDEFINED;
}

JSValue jsPulsarLog(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 2)
        return JS_UNDEFINED;

    const QString level = toQString(ctx, argv[0]);
    const QString message = toQString(ctx, argv[1]);

    qInfo().noquote() << QStringLiteral("[js:%1]").arg(level) << message;

    return JS_UNDEFINED;
}

JSValue jsPulsarPlatformInfo(JSContext *ctx, JSValueConst, int, JSValueConst *)
{
    return jsonString(ctx, QJsonDocument(self(ctx)->platformInfo()));
}

JSValue jsPulsarPaths(JSContext *ctx, JSValueConst, int, JSValueConst *)
{
    return jsonString(ctx, QJsonDocument(self(ctx)->paths()));
}

JSValue jsPulsarEnv(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 1)
        return JS_UNDEFINED;

    const QString name = toQString(ctx, argv[0]);
    const QByteArray key = name.toUtf8();

    if (!qEnvironmentVariableIsSet(key.constData()))
        return JS_UNDEFINED;

    const QByteArray value = qEnvironmentVariable(key.constData()).toUtf8();

    return JS_NewStringLen(ctx, value.constData(), value.size());
}

JSValue jsPulsarReadFile(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 1)
        return JS_ThrowTypeError(ctx, "readFile: path is required");

    const QString path = toQString(ctx, argv[0]);
    const QString encoding = argc > 1 ? toQString(ctx, argv[1]) : QStringLiteral("utf8");

    QFile file(path);

    if (!file.open(QIODevice::ReadOnly))
        return JS_ThrowTypeError(ctx, "ENOENT: %s", path.toUtf8().constData());

    const QByteArray data = file.readAll();

    if (encoding == QLatin1String("base64"))
        return JS_NewString(ctx, data.toBase64().constData());

    return JS_NewStringLen(ctx, data.constData(), data.size());
}

JSValue jsPulsarWriteFile(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 2)
        return JS_ThrowTypeError(ctx, "writeFile: path and content are required");

    const QString path = toQString(ctx, argv[0]);
    const QString encoding = argc > 2 ? toQString(ctx, argv[2]) : QStringLiteral("utf8");
    QByteArray data = toQString(ctx, argv[1]).toUtf8();

    if (encoding == QLatin1String("base64"))
        data = QByteArray::fromBase64(data);

    QDir().mkpath(QFileInfo(path).absolutePath());

    QFile file(path);

    if (!file.open(QIODevice::WriteOnly | QIODevice::Truncate))
        return JS_NewBool(ctx, false);

    file.write(data);

    return JS_NewBool(ctx, true);
}

JSValue jsPulsarAppendFile(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 2)
        return JS_ThrowTypeError(ctx, "appendFile: path and content are required");

    const QString path = toQString(ctx, argv[0]);
    const QString encoding = argc > 2 ? toQString(ctx, argv[2]) : QStringLiteral("utf8");
    QByteArray data = toQString(ctx, argv[1]).toUtf8();

    if (encoding == QLatin1String("base64"))
        data = QByteArray::fromBase64(data);

    QFile file(path);

    if (!file.open(QIODevice::WriteOnly | QIODevice::Append))
        return JS_NewBool(ctx, false);

    file.write(data);

    return JS_NewBool(ctx, true);
}

JSValue jsPulsarListDir(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    const QString path = argc > 0 ? toQString(ctx, argv[0]) : QStringLiteral(".");
    const QDir dir(path);
    const QFileInfoList entries = dir.entryInfoList(QDir::AllEntries | QDir::NoDotAndDotDot);

    JSValue array = JS_NewArray(ctx);
    uint32_t index = 0;

    for (const QFileInfo &entry : entries) {
        const QByteArray name =
            (entry.isDir() ? entry.fileName() + QStringLiteral("/") : entry.fileName()).toUtf8();

        JS_SetPropertyUint32(ctx, array, index++, JS_NewStringLen(ctx, name.constData(), name.size()));
    }

    return array;
}

JSValue jsPulsarExists(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 1)
        return JS_NewBool(ctx, false);
    return JS_NewBool(ctx, QFileInfo::exists(toQString(ctx, argv[0])));
}

JSValue jsPulsarStat(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 1)
        return JS_ThrowTypeError(ctx, "stat: path is required");

    const QFileInfo info(toQString(ctx, argv[0]));

    if (!info.exists())
        return JS_ThrowTypeError(ctx, "ENOENT: %s", info.filePath().toUtf8().constData());

    QJsonObject out;
    out.insert(QStringLiteral("size"), static_cast<double>(info.size()));
    out.insert(QStringLiteral("isFile"), info.isFile());
    out.insert(QStringLiteral("isDirectory"), info.isDir());
    out.insert(QStringLiteral("mtimeMs"), static_cast<double>(info.lastModified().toMSecsSinceEpoch()));
    out.insert(QStringLiteral("createdAtMs"), static_cast<double>(info.birthTime().toMSecsSinceEpoch()));

    return jsonString(ctx, QJsonDocument(out));
}

JSValue jsPulsarMkdir(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 1)
        return JS_NewBool(ctx, false);
    const QString path = toQString(ctx, argv[0]);
    const bool recursive = argc > 1 ? JS_ToBool(ctx, argv[1]) : true;

    return JS_NewBool(ctx, recursive ? QDir().mkpath(path) : QDir().mkdir(path));
}

JSValue jsPulsarRemove(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 1)
        return JS_NewBool(ctx, false);

    const QString path = toQString(ctx, argv[0]);
    const bool recursive = argc > 1 ? JS_ToBool(ctx, argv[1]) : false;
    const QFileInfo info(path);

    if (info.isDir()) {
        if (recursive) return JS_NewBool(ctx, QDir(path).removeRecursively());

        return JS_NewBool(ctx, QDir().rmdir(path));
    }

    return JS_NewBool(ctx, QFile::remove(path));
}

JSValue jsPulsarRename(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 2)
        return JS_NewBool(ctx, false);

    const QString from = toQString(ctx, argv[0]);
    const QString to = toQString(ctx, argv[1]);

    QDir().mkpath(QFileInfo(to).absolutePath());

    return JS_NewBool(ctx, QFile::rename(from, to));
}

JSValue jsPulsarCopy(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 2)
        return JS_NewBool(ctx, false);

    return JS_NewBool(ctx, copyRecursive(toQString(ctx, argv[0]),
                                                 toQString(ctx, argv[1])));
}

JSValue jsPulsarMoveToTrash(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 1)
        return JS_NewBool(ctx, false);
    return JS_NewBool(ctx, QFile::moveToTrash(toQString(ctx, argv[0])));
}

JSValue jsPulsarOpenUrl(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 1)
        return JS_NewBool(ctx, false);
    return JS_NewBool(ctx, QDesktopServices::openUrl(QUrl(toQString(ctx, argv[0]))));
}

JSValue jsPulsarSetTimeout(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 1 || !JS_IsFunction(ctx, argv[0]))
        return JS_ThrowTypeError(ctx, "setTimeout: callback is required");

    auto *runtime = self(ctx);
    const int id = runtime->nextTimer_++;
    int32_t delay = 0;

    if (argc > 1) JS_ToInt32(ctx, &delay, argv[1]);

    auto *timer = new QTimer(runtime);

    timer->setSingleShot(true);
    timer->setInterval(qMax(0, delay));
    runtime->timers_.insert(id, {timer, JS_DupValue(ctx, argv[0]), false});
    QObject::connect(timer, &QTimer::timeout, runtime, [runtime, id]() {
        runtime->fireTimer(id);
    });
    timer->start();

    return JS_NewInt32(ctx, id);
}

JSValue jsPulsarSetInterval(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 1 || !JS_IsFunction(ctx, argv[0]))
        return JS_ThrowTypeError(ctx, "setInterval: callback is required");

    auto *runtime = self(ctx);
    const int id = runtime->nextTimer_++;
    int32_t delay = 0;

    if (argc > 1) JS_ToInt32(ctx, &delay, argv[1]);

    auto *timer = new QTimer(runtime);

    timer->setSingleShot(false);
    timer->setInterval(qMax(1, delay));
    runtime->timers_.insert(id, {timer, JS_DupValue(ctx, argv[0]), true});
    QObject::connect(timer, &QTimer::timeout, runtime, [runtime, id]() {
        runtime->fireTimer(id);
    });
    timer->start();

    return JS_NewInt32(ctx, id);
}

JSValue jsPulsarClearTimer(JSContext *ctx, JSValueConst, int argc, JSValueConst *argv)
{
    if (argc < 1)
        return JS_UNDEFINED;

    int32_t id = 0;

    JS_ToInt32(ctx, &id, argv[0]);

    self(ctx)->clearTimer(id);

    return JS_UNDEFINED;
}

} // namespace pulsar
