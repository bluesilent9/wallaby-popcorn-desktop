#pragma once
#include <QHostAddress>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QTimer>
#include <QUrl>
#include <QWebEngineUrlRequestInterceptor>
#include <QWebEngineUrlRequestInfo>

namespace Ipv6NetworkPolicy {
inline bool isMapped(const QHostAddress& address) {
  if (address.protocol() != QAbstractSocket::IPv6Protocol) return false;
  const auto bytes = address.toIPv6Address();
  for (int i = 0; i < 10; ++i) if (bytes[i] != 0) return false;
  return bytes[10] == 0xff && bytes[11] == 0xff;
}
inline bool allows(const QUrl& url) {
  const auto scheme = url.scheme().toLower();
  if (scheme == "qrc" || scheme == "data" || scheme == "about" || scheme == "file") return true;
  if (scheme == "blob") return allows(QUrl(url.path()));
  if (scheme != "http" && scheme != "https" && scheme != "ws" && scheme != "wss") return false;
  const QHostAddress address(url.host());
  return address.protocol() == QAbstractSocket::IPv6Protocol && !isMapped(address);
}
}

class Ipv6RequestInterceptor : public QWebEngineUrlRequestInterceptor {
public:
  using QWebEngineUrlRequestInterceptor::QWebEngineUrlRequestInterceptor;
  void interceptRequest(QWebEngineUrlRequestInfo& info) override { info.block(!Ipv6NetworkPolicy::allows(info.requestUrl())); }
};

class Ipv6BlockedReply : public QNetworkReply {
public:
  explicit Ipv6BlockedReply(const QNetworkRequest& request, QObject* parent) : QNetworkReply(parent) {
    setRequest(request); setUrl(request.url()); open(QIODevice::ReadOnly);
    QTimer::singleShot(0, this, [this]() {
      setError(QNetworkReply::ContentAccessDenied, QStringLiteral("IPv6 required: use an SSH server or an IPv6 URL; IPv4 and hostname HTTP fallback are disabled."));
      setFinished(true); emit errorOccurred(error()); emit finished();
    });
  }
  void abort() override {}
  qint64 readData(char*, qint64) override { return -1; }
};
class Ipv6NetworkAccessManager : public QNetworkAccessManager {
public:
  using QNetworkAccessManager::QNetworkAccessManager;
protected:
  QNetworkReply* createRequest(Operation op, const QNetworkRequest& request, QIODevice* data = nullptr) override {
    if (!Ipv6NetworkPolicy::allows(request.url())) return new Ipv6BlockedReply(request, this);
    // Manual redirects ensure an IPv4 Location cannot escape createRequest's policy.
    auto safe = request; safe.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    return QNetworkAccessManager::createRequest(op, safe, data);
  }
};
