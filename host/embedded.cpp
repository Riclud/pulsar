#include "embedded.h"

#include <QByteArray>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QStandardPaths>

#include <cstring>

// Single-file distribution format.
//
// The host executable is followed by a payload container and a 16-byte trailer:
//
//   [ host bytes ][ payload container ][ payloadOffset:u64 ][ "PLSRPAYL" ]
//
// The container is:
//
//   "PLSR" | version:u32 | buildId:u64 | count:u32
//   then `count` entries of: pathLen:u32 | path | dataLen:u64 | data
//
// All integers are little-endian, independent of the host byte order.

namespace {

constexpr char kHeaderMagic[4] = {'P', 'L', 'S', 'R'};
constexpr char kTrailerMagic[8] = {'P', 'L', 'S', 'R', 'P', 'A', 'Y', 'L'};
constexpr quint32 kFormatVersion = 1;

quint32 readU32(const uchar *p)
{
    return quint32(p[0]) | (quint32(p[1]) << 8) | (quint32(p[2]) << 16) | (quint32(p[3]) << 24);
}

quint64 readU64(const uchar *p)
{
    quint64 v = 0;
    for (int i = 7; i >= 0; --i)
        v = (v << 8) | quint64(p[i]);
    return v;
}

bool readExact(QFile &f, char *data, qint64 n)
{
    qint64 done = 0;
    while (done < n) {
        const qint64 got = f.read(data + done, n - done);
        if (got <= 0)
            return false;
        done += got;
    }
    return true;
}

// Reject absolute paths and parent traversal; entries come from our own build,
// but the extraction path must never escape the cache directory.
bool isSafeRelative(const QString &path)
{
    if (path.isEmpty() || path.startsWith(QLatin1Char('/')) || path.contains(QLatin1Char('\\')))
        return false;
    if (path.contains(QStringLiteral("..")))
        return false;
    return true;
}

void setExecutable(const QString &path)
{
    QFile::setPermissions(path,
                          QFile::ReadOwner | QFile::WriteOwner | QFile::ExeOwner | QFile::ReadGroup
                              | QFile::ExeGroup | QFile::ReadOther | QFile::ExeOther);
}

} // namespace

bool pulsarExtractEmbedded(const QString &exePath, QString *rootOut)
{
    QFile exe(exePath);
    if (!exe.open(QIODevice::ReadOnly))
        return false;

    const qint64 size = exe.size();
    if (size < 16)
        return false;

    if (!exe.seek(size - 16))
        return false;
    uchar trailer[16];
    if (exe.read(reinterpret_cast<char *>(trailer), 16) != 16)
        return false;
    if (std::memcmp(trailer + 8, kTrailerMagic, 8) != 0)
        return false;

    const quint64 payloadOffset = readU64(trailer);
    if (payloadOffset + 20 > quint64(size))
        return false;

    if (!exe.seek(qint64(payloadOffset)))
        return false;
    uchar header[20];
    if (exe.read(reinterpret_cast<char *>(header), 20) != 20)
        return false;
    if (std::memcmp(header, kHeaderMagic, 4) != 0)
        return false;

    const quint32 version = readU32(header + 4);
    if (version != kFormatVersion)
        return false;
    const quint64 buildId = readU64(header + 8);
    const quint32 count = readU32(header + 16);

    const QString cacheBase = QStandardPaths::writableLocation(QStandardPaths::CacheLocation);
    if (cacheBase.isEmpty())
        return false;
    const QString root = cacheBase + QStringLiteral("/pulsar-embed-%1")
                                       .arg(buildId, 0, 16);
    const QString marker = root + QStringLiteral("/.ok");

    if (!QFileInfo::exists(marker)) {
        // Incomplete or stale extraction: rebuild from scratch.
        QDir(root).removeRecursively();
        if (!QDir().mkpath(root))
            return false;

        for (quint32 i = 0; i < count; ++i) {
            uchar lenBuf[4];
            if (exe.read(reinterpret_cast<char *>(lenBuf), 4) != 4)
                return false;
            const quint32 pathLen = readU32(lenBuf);
            QByteArray pathBytes(pathLen, Qt::Uninitialized);
            if (exe.read(pathBytes.data(), pathLen) != qint64(pathLen))
                return false;
            const QString rel = QString::fromUtf8(pathBytes);
            if (!isSafeRelative(rel))
                return false;

            uchar dataLenBuf[8];
            if (exe.read(reinterpret_cast<char *>(dataLenBuf), 8) != 8)
                return false;
            const quint64 dataLen = readU64(dataLenBuf);

            const QString target = root + QLatin1Char('/') + rel;
            if (!QDir().mkpath(QFileInfo(target).absolutePath()))
                return false;

            QFile out(target);
            if (!out.open(QIODevice::WriteOnly | QIODevice::Truncate))
                return false;
            quint64 remaining = dataLen;
            QByteArray chunk(1 << 16, Qt::Uninitialized);
            while (remaining > 0) {
                const qint64 want = qint64(qMin<quint64>(remaining, quint64(chunk.size())));
                if (exe.read(chunk.data(), want) != want)
                    return false;
                if (out.write(chunk.constData(), want) != want)
                    return false;
                remaining -= quint64(want);
            }
            out.close();
        }

        setExecutable(root + QStringLiteral("/runtime"));
        setExecutable(root + QStringLiteral("/bridge"));

        QFile ok(marker);
        if (ok.open(QIODevice::WriteOnly))
            ok.write("ok");
    }

    if (rootOut)
        *rootOut = root;
    return true;
}
