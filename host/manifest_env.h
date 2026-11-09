#pragma once

#include <QByteArray>

namespace pulsar {

// Applies the "env" object of a pulsar.json to this process. A variable that is
// already set wins, so the user's shell can override the manifest. Only QtCore
// is needed, so it is safe to call before the application object exists.
void applyManifestEnv(const QByteArray &manifestJson);

// Sets a default that neither the system nor the manifest has chosen.
void setEnvDefault(const char *name, const char *value);

} // namespace pulsar
