#include "manifest_env.h"

#include <QJsonDocument>
#include <QJsonObject>

namespace pulsar {

void setEnvDefault(const char *name, const char *value)
{
    if (!qEnvironmentVariableIsSet(name))
        qputenv(name, value);
}

void applyManifestEnv(const QByteArray &manifestJson)
{
    const QJsonObject env = QJsonDocument::fromJson(manifestJson).object().value(QStringLiteral("env")).toObject();

    for (auto it = env.begin(); it != env.end(); ++it) {
        if (!it.value().isString())
            continue;

        const QByteArray key = it.key().toLocal8Bit();

        // A name with "=" or NUL cannot be an environment variable.
        if (key.isEmpty() || key.contains('=') || key.contains('\0'))
            continue;

        if (qEnvironmentVariableIsSet(key.constData()))
            continue;

        qputenv(key.constData(), it.value().toString().toLocal8Bit());
    }
}

} // namespace pulsar
