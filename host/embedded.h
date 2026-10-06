#pragma once

#include <QString>

// If the executable at `exePath` carries an appended Pulsar payload (see
// `host/embedded.cpp`), extracts it into the user cache and returns true,
// writing the extraction root to `rootOut`. Returns false when no payload is
// present, so a plain (dev) host keeps working from the repository layout.
bool pulsarExtractEmbedded(const QString &exePath, QString *rootOut);
