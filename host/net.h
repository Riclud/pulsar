#pragma once

#include <QByteArray>
#include <QHash>
#include <QList>
#include <QMap>
#include <QObject>
#include <QString>
#include <QStringConverter>
#include <QUrl>
#include <QVariantMap>

class QNetworkAccessManager;
class QNetworkReply;
class QTimer;
#ifdef PULSAR_HAS_WEBSOCKETS
class QWebSocket;
#endif

namespace pulsar {

struct NetHeader {
    QByteArray name;
    QByteArray value;
};

struct NetRequestSpec {
    quint32 id = 0;
    QUrl url;
    QByteArray method = "GET";
    QList<NetHeader> headers;
    QByteArray body;
    QString bodyFile;
    int timeoutMs = 30000;
    qint64 maxBytes = 64ll * 1024 * 1024;
    QString redirect = "follow";
    int maxRedirects = 5;
    QString responseType = "auto";
    QString tlsFingerprint;
};

/**
 * One HTTP implementation. `NativeHttpEngine` is QtNetwork; a masked engine
 * (libcurl-impersonate) can be added later and selected per request.
 */
class HttpEngine : public QObject {
    Q_OBJECT

public:
    using QObject::QObject;

    virtual void start(const NetRequestSpec &spec) = 0;
    virtual void abort(quint32 id) = 0;

signals:
    void response(quint32 id,
                  int status,
                  const QString &statusText,
                  const QUrl &url,
                  const QMap<QString, QString> &headers);
    void text(quint32 id, const QString &chunk);
    void binary(quint32 id, const QByteArray &chunk);
    void finished(quint32 id);
    void failed(quint32 id, const QString &code, const QString &message);
};

class NativeHttpEngine : public HttpEngine {
    Q_OBJECT

public:
    explicit NativeHttpEngine(QObject *parent = nullptr);

    void start(const NetRequestSpec &spec) override;
    void abort(quint32 id) override;

private:
    struct Entry {
        NetRequestSpec spec;
        QNetworkReply *reply = nullptr;
        QTimer *timer = nullptr;
        int redirects = 0;
        qint64 received = 0;
        bool responded = false;
        bool binary = false;
        bool latin1 = false;
        QStringDecoder decoder{QStringDecoder::Utf8};
    };

    void dispatch(quint32 id);
    void handleMetaData(quint32 id, QNetworkReply *reply);
    void handleReadyRead(quint32 id, QNetworkReply *reply);
    void handleFinished(quint32 id, QNetworkReply *reply);
    void fail(quint32 id, const QString &code, const QString &message);
    void release(quint32 id);

    QNetworkAccessManager *manager_;
    QHash<quint32, Entry *> entries_;
};

class NetworkService : public QObject {
    Q_OBJECT

public:
    explicit NetworkService(QObject *parent = nullptr);

    void handle(const QVariantMap &params);

signals:
    void response(quint32 id,
                  int status,
                  const QString &statusText,
                  const QUrl &url,
                  const QMap<QString, QString> &headers);
    void text(quint32 id, const QString &chunk);
    void binary(quint32 id, const QByteArray &chunk);
    void finished(quint32 id);
    void failed(quint32 id, const QString &code, const QString &message);

    void wsOpened(quint32 id, const QString &protocol);
    void wsText(quint32 id, const QString &message);
    void wsBinary(quint32 id, const QByteArray &message);
    void wsClosed(quint32 id, int code, const QString &reason, bool wasClean);

private:
    HttpEngine *engineFor(const NetRequestSpec &spec);
    void abort(quint32 id);

    void openSocket(const QVariantMap &params);
    void sendSocket(const QVariantMap &params);
    void closeSocket(const QVariantMap &params);

    NativeHttpEngine *native_;
#ifdef PULSAR_HAS_WEBSOCKETS
    QHash<quint32, QWebSocket *> sockets_;
#endif
};

} // namespace pulsar
