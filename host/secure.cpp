#include "secure.h"

#include <QDir>
#include <QFile>
#include <QHash>
#include <QJsonDocument>
#include <QJsonObject>
#include <QProcess>
#include <QSaveFile>
#include <QStandardPaths>
#include <QString>

#if defined(Q_OS_MACOS)
#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#elif defined(Q_OS_WIN)
#include <windows.h>
#include <wincrypt.h>
#endif

namespace pulsar {

namespace {

const QChar kStubSeparator = QChar(0x1f);

bool stubMode()
{
    const QByteArray value = qgetenv("PULSAR_SECURE_STUB");
    return !value.isEmpty() && value != "0";
}

QHash<QString, QString> &stubStore()
{
    static QHash<QString, QString> store;
    return store;
}

QString stubKey(const QString &service, const QString &key)
{
    return service + kStubSeparator + key;
}

#if defined(Q_OS_LINUX)

constexpr int kToolTimeoutMs = 3000;

QString secretTool()
{
    return QStandardPaths::findExecutable(QStringLiteral("secret-tool"));
}

bool runSecretTool(const QStringList &args, const QByteArray &input, QByteArray *output)
{
    const QString program = secretTool();
    if (program.isEmpty())
        return false;

    QProcess process;
    process.setProgram(program);
    process.setArguments(args);
    process.setProcessChannelMode(QProcess::SeparateChannels);
    process.start();
    if (!process.waitForStarted(kToolTimeoutMs))
        return false;

    if (!input.isEmpty())
        process.write(input);
    process.closeWriteChannel();

    if (!process.waitForFinished(kToolTimeoutMs)) {
        process.kill();
        process.waitForFinished(500);
        return false;
    }

    if (process.exitStatus() != QProcess::NormalExit || process.exitCode() != 0)
        return false;

    if (output)
        *output = process.readAllStandardOutput();
    return true;
}

QStringList attributeArgs(const QString &kind, const QString &service, const QString &key)
{
    return {kind, QStringLiteral("service"), service, QStringLiteral("key"), key};
}

#endif

#if defined(Q_OS_MACOS)

CFStringRef makeCFString(const QString &text)
{
    const QByteArray utf8 = text.toUtf8();
    return CFStringCreateWithBytes(kCFAllocatorDefault,
                                   reinterpret_cast<const UInt8 *>(utf8.constData()),
                                   utf8.size(),
                                   kCFStringEncodingUTF8,
                                   false);
}

CFMutableDictionaryRef makeQuery(const QString &service, const QString &key)
{
    CFMutableDictionaryRef query = CFDictionaryCreateMutable(
        kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    if (!query)
        return nullptr;

    CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);

    CFStringRef serviceRef = makeCFString(service);
    CFStringRef keyRef = makeCFString(key);
    if (serviceRef)
        CFDictionarySetValue(query, kSecAttrService, serviceRef);
    if (keyRef)
        CFDictionarySetValue(query, kSecAttrAccount, keyRef);

    if (serviceRef)
        CFRelease(serviceRef);
    if (keyRef)
        CFRelease(keyRef);
    return query;
}

#endif

#if defined(Q_OS_WIN)

QString safeName(const QString &raw)
{
    QString out;
    for (const QChar c : raw) {
        if (c.isLetterOrNumber() || c == QLatin1Char('.') || c == QLatin1Char('-') || c == QLatin1Char('_'))
            out.append(c);
        else
            out.append(QLatin1Char('-'));
    }
    return out.isEmpty() ? QStringLiteral("pulsar-app") : out;
}

QString storePath(const QString &service)
{
    const QString base = qEnvironmentVariable("APPDATA", QDir::homePath() + QStringLiteral("/AppData/Roaming"));
    const QString dir = base + QLatin1Char('/') + safeName(service);
    QDir().mkpath(dir);
    return dir + QStringLiteral("/secure.json");
}

QJsonObject readStore(const QString &service)
{
    QFile file(storePath(service));
    if (!file.open(QIODevice::ReadOnly))
        return {};

    const QJsonDocument doc = QJsonDocument::fromJson(file.readAll());
    return doc.isObject() ? doc.object() : QJsonObject();
}

bool writeStore(const QString &service, const QJsonObject &data)
{
    QSaveFile file(storePath(service));
    if (!file.open(QIODevice::WriteOnly))
        return false;

    file.write(QJsonDocument(data).toJson(QJsonDocument::Compact));
    return file.commit();
}

QByteArray protect(const QByteArray &plain)
{
    DATA_BLOB input;
    input.pbData = reinterpret_cast<BYTE *>(const_cast<char *>(plain.constData()));
    input.cbData = static_cast<DWORD>(plain.size());

    DATA_BLOB output{};
    if (!CryptProtectData(&input, L"Pulsar", nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &output))
        return {};

    QByteArray result(reinterpret_cast<const char *>(output.pbData), static_cast<int>(output.cbData));
    LocalFree(output.pbData);
    return result;
}

bool unprotect(const QByteArray &blob, QByteArray *plain)
{
    DATA_BLOB input;
    input.pbData = reinterpret_cast<BYTE *>(const_cast<char *>(blob.constData()));
    input.cbData = static_cast<DWORD>(blob.size());

    DATA_BLOB output{};
    if (!CryptUnprotectData(&input, nullptr, nullptr, nullptr, nullptr, CRYPTPROTECT_UI_FORBIDDEN, &output))
        return false;

    if (plain)
        *plain = QByteArray(reinterpret_cast<const char *>(output.pbData), static_cast<int>(output.cbData));
    LocalFree(output.pbData);
    return true;
}

#endif

} // namespace

bool secureAvailable()
{
    if (stubMode())
        return true;

#if defined(Q_OS_LINUX)
    return !secretTool().isEmpty();
#else
    return true;
#endif
}

bool secureGet(const QString &service, const QString &key, QString *value)
{
    if (stubMode()) {
        const auto it = stubStore().constFind(stubKey(service, key));
        if (it == stubStore().constEnd())
            return false;
        if (value)
            *value = it.value();
        return true;
    }

#if defined(Q_OS_LINUX)
    QByteArray output;
    if (!runSecretTool(attributeArgs(QStringLiteral("lookup"), service, key), {}, &output))
        return false;

    QByteArray text = output;
    while (text.endsWith('\n'))
        text.chop(1);

    if (value)
        *value = QString::fromUtf8(text);
    return true;
#elif defined(Q_OS_MACOS)
    CFMutableDictionaryRef query = makeQuery(service, key);
    if (!query)
        return false;

    CFDictionarySetValue(query, kSecReturnData, kCFBooleanTrue);
    CFDictionarySetValue(query, kSecMatchLimit, kSecMatchLimitOne);

    CFTypeRef result = nullptr;
    const OSStatus status = SecItemCopyMatching(query, &result);
    CFRelease(query);
    if (status != errSecSuccess || !result)
        return false;

    const CFDataRef data = static_cast<CFDataRef>(result);
    if (value) {
        *value = QString::fromUtf8(reinterpret_cast<const char *>(CFDataGetBytePtr(data)),
                                   static_cast<int>(CFDataGetLength(data)));
    }
    CFRelease(result);
    return true;
#elif defined(Q_OS_WIN)
    const QJsonObject store = readStore(service);
    if (!store.contains(key))
        return false;

    QByteArray plain;
    const QByteArray blob = QByteArray::fromBase64(store.value(key).toString().toLatin1());
    if (!unprotect(blob, &plain))
        return false;

    if (value)
        *value = QString::fromUtf8(plain);
    return true;
#else
    Q_UNUSED(service)
    Q_UNUSED(key)
    Q_UNUSED(value)
    return false;
#endif
}

bool secureSet(const QString &service, const QString &key, const QString &value)
{
    if (stubMode()) {
        stubStore().insert(stubKey(service, key), value);
        return true;
    }

#if defined(Q_OS_LINUX)
    QStringList args = attributeArgs(QStringLiteral("store"), service, key);
    args.insert(1, QStringLiteral("--label=Pulsar: ") + service);
    return runSecretTool(args, value.toUtf8(), nullptr);
#elif defined(Q_OS_MACOS)
    CFMutableDictionaryRef query = makeQuery(service, key);
    if (!query)
        return false;

    const QByteArray utf8 = value.toUtf8();
    CFDataRef data = CFDataCreate(kCFAllocatorDefault, reinterpret_cast<const UInt8 *>(utf8.constData()), utf8.size());
    if (!data) {
        CFRelease(query);
        return false;
    }

    CFDictionarySetValue(query, kSecValueData, data);
    OSStatus status = SecItemAdd(query, nullptr);
    CFRelease(data);

    if (status == errSecDuplicateItem) {
        CFMutableDictionaryRef changes = CFDictionaryCreateMutable(
            kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
        CFDataRef replacement =
            CFDataCreate(kCFAllocatorDefault, reinterpret_cast<const UInt8 *>(utf8.constData()), utf8.size());
        if (changes && replacement) {
            CFDictionarySetValue(changes, kSecValueData, replacement);
            status = SecItemUpdate(query, changes);
        } else {
            status = errSecAllocate;
        }
        if (replacement)
            CFRelease(replacement);
        if (changes)
            CFRelease(changes);
    }

    CFRelease(query);
    return status == errSecSuccess;
#elif defined(Q_OS_WIN)
    QJsonObject store = readStore(service);
    const QByteArray blob = protect(value.toUtf8());
    if (blob.isEmpty())
        return false;

    store.insert(key, QString::fromLatin1(blob.toBase64()));
    return writeStore(service, store);
#else
    Q_UNUSED(service)
    Q_UNUSED(key)
    Q_UNUSED(value)
    return false;
#endif
}

bool secureRemove(const QString &service, const QString &key)
{
    if (stubMode())
        return stubStore().remove(stubKey(service, key)) > 0;

#if defined(Q_OS_LINUX)
    return runSecretTool(attributeArgs(QStringLiteral("clear"), service, key), {}, nullptr);
#elif defined(Q_OS_MACOS)
    CFMutableDictionaryRef query = makeQuery(service, key);
    if (!query)
        return false;

    const OSStatus status = SecItemDelete(query);
    CFRelease(query);
    return status == errSecSuccess;
#elif defined(Q_OS_WIN)
    QJsonObject store = readStore(service);
    if (!store.contains(key))
        return false;

    store.remove(key);
    return writeStore(service, store);
#else
    Q_UNUSED(service)
    Q_UNUSED(key)
    return false;
#endif
}

} // namespace pulsar
