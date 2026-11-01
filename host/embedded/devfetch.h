#pragma once

#include <QString>

namespace pulsar {

struct DevFetchResult {
    bool ok = false;
    QString dir;
};

/** Dev server URL passed to the activity, or empty when not a dev launch. */
QString devUrlFromIntent();

/** Download the dev payload into the app data dir; returns the app dir to start from. */
DevFetchResult fetchDevApp(const QString &url);

} // namespace pulsar
