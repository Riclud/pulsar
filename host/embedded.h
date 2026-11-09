#pragma once

#include <QByteArray>
#include <QString>

// If the executable at `exePath` carries an appended Pulsar payload (see
// `host/embedded.cpp`), extracts it into the user cache and returns true,
// writing the extraction root to `rootOut`. Returns false when no payload is
// present, so a plain (dev) host keeps working from the repository layout.
bool pulsarExtractEmbedded(const QString &exePath, QString *rootOut);

// Reads one file (such as "app/pulsar.json") from the appended payload without
// extracting it, so it works before the application object exists. Returns an
// empty array when there is no payload or no such entry.
QByteArray pulsarReadEmbeddedEntry(const QString &exePath, const QString &rel);
