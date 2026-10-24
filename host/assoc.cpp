#include "assoc.h"

#include <QDir>
#include <QFile>
#include <QMap>
#include <QSaveFile>
#include <QStringList>

#if defined(Q_OS_WIN)
#include <QSettings>
#endif

namespace pulsar {

namespace {

#if defined(Q_OS_LINUX)

QString dataHome()
{
    QString base = qEnvironmentVariable("XDG_DATA_HOME");
    if (base.isEmpty())
        base = QDir::homePath() + QStringLiteral("/.local/share");
    return base;
}

QString configHome()
{
    QString base = qEnvironmentVariable("XDG_CONFIG_HOME");
    if (base.isEmpty())
        base = QDir::homePath() + QStringLiteral("/.config");
    return base;
}

bool writeIfChanged(const QString &path, const QString &content)
{
    QFile existing(path);
    if (existing.open(QIODevice::ReadOnly) && QString::fromUtf8(existing.readAll()) == content)
        return true;

    QSaveFile file(path);
    if (!file.open(QIODevice::WriteOnly))
        return false;
    file.write(content.toUtf8());
    return file.commit();
}

QString mergeMimeDefaults(const QString &content, const QMap<QString, QString> &defaults)
{
    const QString section = QStringLiteral("[Default Applications]");
    QStringList lines = content.isEmpty() ? QStringList() : content.split(QLatin1Char('\n'));

    int header = -1;
    for (int i = 0; i < lines.size(); ++i) {
        if (lines.at(i).trimmed() == section) {
            header = i;
            break;
        }
    }

    if (header < 0) {
        if (!lines.isEmpty() && !lines.last().isEmpty())
            lines.append(QString());
        lines.append(section);
        header = lines.size() - 1;
    }

    int end = lines.size();
    for (int i = header + 1; i < lines.size(); ++i) {
        if (lines.at(i).trimmed().startsWith(QLatin1Char('['))) {
            end = i;
            break;
        }
    }

    int cursor = header + 1;
    for (auto it = defaults.constBegin(); it != defaults.constEnd(); ++it) {
        const QString line = it.key() + QLatin1Char('=') + it.value();
        bool replaced = false;

        for (int i = header + 1; i < end; ++i) {
            if (lines.at(i).startsWith(it.key() + QLatin1Char('='))) {
                lines[i] = line;
                replaced = true;
                break;
            }
        }

        if (replaced)
            continue;

        lines.insert(cursor, line);
        ++cursor;
        ++end;
    }

    return lines.join(QLatin1Char('\n'));
}

#endif

} // namespace

void registerFileAssociations(const QString &appId,
                              const QString &appName,
                              const QString &execPath,
                              const QList<FileAssociation> &associations)
{
    if (associations.isEmpty())
        return;

#if defined(Q_OS_LINUX)
    const QString desktopId = appId + QStringLiteral(".desktop");
    QStringList mimes;

    for (const FileAssociation &assoc : associations) {
        if (!assoc.mime.isEmpty())
            mimes.append(assoc.mime);
    }

    if (mimes.isEmpty())
        return;

    const QString applications = dataHome() + QStringLiteral("/applications");
    QDir().mkpath(applications);

    QString exec = execPath;
    exec.replace(QLatin1Char('"'), QStringLiteral("\\\""));
    exec = QLatin1Char('"') + exec + QStringLiteral("\" %f");

    QString desktop = QStringLiteral("[Desktop Entry]\n"
                                     "Type=Application\n"
                                     "Name=%1\n"
                                     "Exec=%2\n"
                                     "MimeType=%3;\n"
                                     "Terminal=false\n"
                                     "NoDisplay=false\n")
                          .arg(appName.isEmpty() ? appId : appName, exec, mimes.join(QLatin1Char(';')));

    writeIfChanged(applications + QLatin1Char('/') + desktopId, desktop);

    QMap<QString, QString> defaults;
    for (const QString &mime : mimes)
        defaults.insert(mime, desktopId);

    const QString config = configHome();
    QDir().mkpath(config);
    const QString mimeapps = config + QStringLiteral("/mimeapps.list");

    QString existing;
    QFile file(mimeapps);
    if (file.open(QIODevice::ReadOnly))
        existing = QString::fromUtf8(file.readAll());

    writeIfChanged(mimeapps, mergeMimeDefaults(existing, defaults));
#elif defined(Q_OS_WIN)
    QSettings classes(QStringLiteral("HKEY_CURRENT_USER\\Software\\Classes"), QSettings::NativeFormat);
    const QString command = QLatin1Char('"') + QDir::toNativeSeparators(execPath) + QStringLiteral("\" \"%1\"");

    for (const FileAssociation &assoc : associations) {
        QString ext = assoc.ext;
        while (ext.startsWith(QLatin1Char('.')))
            ext.remove(0, 1);
        if (ext.isEmpty())
            continue;

        const QString progId = appId + QLatin1Char('.') + ext;
        classes.setValue(progId + QStringLiteral("/shell/open/command/."), command);
        classes.setValue(QLatin1Char('.') + ext + QStringLiteral("/OpenWithProgids/") + progId, QString());
    }

    classes.sync();
#else
    Q_UNUSED(appId)
    Q_UNUSED(appName)
    Q_UNUSED(execPath)
#endif
}

} // namespace pulsar
