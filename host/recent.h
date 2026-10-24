#pragma once

#include <QString>

namespace pulsar {

/** Add a file to the OS recent-documents list. */
void addRecentDocument(const QString &path);

/** Clear the OS recent-documents list. */
void clearRecentDocuments();

} // namespace pulsar
