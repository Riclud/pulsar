#include "recent.h"

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QSaveFile>
#include <QUrl>

#if defined(Q_OS_WIN)
#include <windows.h>
#include <shlobj.h>
#elif defined(Q_OS_MACOS)
#import <AppKit/AppKit.h>
#endif

namespace pulsar {

namespace {

#if defined(Q_OS_LINUX)

const char *kEmptyXbel =
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
    "<xbel version=\"1.0\"\n"
    "      xmlns:bookmark=\"http://www.freedesktop.org/standards/desktop-bookmarks\"\n"
    "      xmlns:mime=\"http://www.freedesktop.org/standards/shared-mime-info\">\n"
    "</xbel>\n";

QString escapeXml(const QString &text)
{
    QString out = text;
    out.replace(QLatin1Char('&'), QStringLiteral("&amp;"));
    out.replace(QLatin1Char('<'), QStringLiteral("&lt;"));
    out.replace(QLatin1Char('>'), QStringLiteral("&gt;"));
    out.replace(QLatin1Char('"'), QStringLiteral("&quot;"));
    return out;
}

QString xbelPath()
{
    QString base = qEnvironmentVariable("XDG_DATA_HOME");
    if (base.isEmpty())
        base = QDir::homePath() + QStringLiteral("/.local/share");
    QDir().mkpath(base);
    return base + QStringLiteral("/recently-used.xbel");
}

bool writeXbel(const QString &content)
{
    QSaveFile file(xbelPath());
    if (!file.open(QIODevice::WriteOnly))
        return false;
    file.write(content.toUtf8());
    return file.commit();
}

#endif

} // namespace

void addRecentDocument(const QString &path)
{
    const QString absolute = QFileInfo(path).absoluteFilePath();

#if defined(Q_OS_LINUX)
    const QString href = QUrl::fromLocalFile(absolute).toString(QUrl::FullyEncoded);

    QString content;
    QFile file(xbelPath());
    if (file.open(QIODevice::ReadOnly))
        content = QString::fromUtf8(file.readAll());

    if (content.isEmpty())
        content = QString::fromUtf8(kEmptyXbel);

    const QString attribute = QStringLiteral("href=\"") + escapeXml(href) + QLatin1Char('"');
    if (!content.contains(attribute)) {
        const QString now = QDateTime::currentDateTimeUtc().toString(Qt::ISODate);
        const QString entry =
            QStringLiteral("  <bookmark href=\"%1\" added=\"%2\" modified=\"%2\" visited=\"%2\">\n"
                           "    <info>\n"
                           "      <metadata owner=\"http://freedesktop.org\">\n"
                           "        <bookmark:applications>\n"
                           "          <bookmark:application name=\"Pulsar\" modified=\"%2\" count=\"1\"/>\n"
                           "        </bookmark:applications>\n"
                           "      </metadata>\n"
                           "    </info>\n"
                           "  </bookmark>\n")
                .arg(escapeXml(href), now);

        int at = content.lastIndexOf(QStringLiteral("</xbel>"));
        if (at < 0) {
            content = QString::fromUtf8(kEmptyXbel);
            at = content.lastIndexOf(QStringLiteral("</xbel>"));
        }
        content.insert(at, entry);
    }

    writeXbel(content);
#elif defined(Q_OS_WIN)
    const std::wstring wide = QDir::toNativeSeparators(absolute).toStdWString();
    SHAddToRecentDocs(SHARD_PATHW, wide.c_str());
#elif defined(Q_OS_MACOS)
    @autoreleasepool {
        NSURL *url = [NSURL fileURLWithPath:absolute.toNSString()];
        if (url)
            [[NSDocumentController sharedDocumentController] noteNewRecentDocumentURL:url];
    }
#else
    Q_UNUSED(absolute)
#endif
}

void clearRecentDocuments()
{
#if defined(Q_OS_LINUX)
    writeXbel(QString::fromUtf8(kEmptyXbel));
#elif defined(Q_OS_WIN)
    SHAddToRecentDocs(SHARD_PIDL, nullptr);
#elif defined(Q_OS_MACOS)
    @autoreleasepool {
        [[NSDocumentController sharedDocumentController] clearRecentDocuments:nil];
    }
#endif
}

} // namespace pulsar
