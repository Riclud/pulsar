#pragma once

#include <QCoreApplication>
#include <QCryptographicHash>
#include <QJsonValue>
#include <QPasswordDigestor>
#include <QPointer>
#include <QRandomGenerator>
#include <QThreadPool>
#include <QVariantMap>

#include <functional>

namespace pulsar {

inline bool isCryptoQuery(const QString &kind)
{
    return kind == QLatin1String("crypto.random") || kind == QLatin1String("crypto.pbkdf2");
}

// Key derivation runs on a pool thread: a strong iteration count takes a noticeable
// time on phones, and the in-process runtime shares the GUI thread.
inline void cryptoQuery(const QString &kind, const QVariantMap &params, std::function<void(QJsonValue)> done)
{
    if (kind == QLatin1String("crypto.random")) {
        const int length = qBound(0, params.value(QStringLiteral("length")).toInt(), 1024);

        QByteArray bytes(length, Qt::Uninitialized);

        QRandomGenerator::system()->generate(bytes.begin(), bytes.end());
        done(QString::fromLatin1(bytes.toBase64()));

        return;
    }

    const QByteArray password = params.value(QStringLiteral("password")).toString().toUtf8();
    const QByteArray salt = QByteArray::fromBase64(params.value(QStringLiteral("salt")).toString().toLatin1());
    const int iterations = params.value(QStringLiteral("iterations")).toInt();
    const int length = params.value(QStringLiteral("length"), 32).toInt();

    if (salt.isEmpty() || iterations < 1 || iterations > 10000000 || length < 1 || length > 64) {
        done(QJsonValue::Null);

        return;
    }

    QPointer<QCoreApplication> app = QCoreApplication::instance();

    QThreadPool::globalInstance()->start([=]() {
        const QByteArray key =
            QPasswordDigestor::deriveKeyPbkdf2(QCryptographicHash::Sha256, password, salt, iterations, length);
        const QJsonValue value = key.isEmpty() ? QJsonValue(QJsonValue::Null) : QString::fromLatin1(key.toBase64());

        if (app)
            QMetaObject::invokeMethod(app, [=]() { done(value); }, Qt::QueuedConnection);
    });
}

} // namespace pulsar
