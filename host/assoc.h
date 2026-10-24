#pragma once

#include <QList>
#include <QString>

namespace pulsar {

struct FileAssociation {
    QString ext;
    QString mime;
    QString name;
};

/**
 * Register the app as a handler for the declared extensions. Linux writes a
 * desktop entry plus mimeapps.list defaults; Windows adds OpenWithProgids.
 * macOS needs an app bundle, so it is a no-op there.
 */
void registerFileAssociations(const QString &appId,
                              const QString &appName,
                              const QString &execPath,
                              const QList<FileAssociation> &associations);

} // namespace pulsar
