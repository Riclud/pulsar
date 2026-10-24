#pragma once

#include <QString>

namespace pulsar {

/** Whether the OS secret backend (keychain/libsecret) is usable. */
bool secureAvailable();

/** Read a secret. Returns false when the key is missing or the backend fails. */
bool secureGet(const QString &service, const QString &key, QString *value);

/** Store or replace a secret. */
bool secureSet(const QString &service, const QString &key, const QString &value);

/** Remove a secret. Returns false when it was missing or the backend fails. */
bool secureRemove(const QString &service, const QString &key);

} // namespace pulsar
