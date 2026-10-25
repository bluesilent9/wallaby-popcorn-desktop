#include <QSysInfo>
#include <QProcess>
#include <QInputDialog>
#include <QMessageBox>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <QCryptographicHash>
#include <QFileInfo>
#include <QTcpServer>
#include <QTcpSocket>
#include <QThread>
#include <QElapsedTimer>
#include <QTemporaryFile>
#include <QProcessEnvironment>
#include <QLineEdit>
#include <QHostAddress>
#include "Ipv6NetworkPolicy.h"
#include <QMap>
#include <QtNetwork/qnetworkinterface.h>
#include <QGuiApplication>
#include <QCoreApplication>
#include <QCursor>
#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QJsonObject>
#include <QJsonDocument>
#include <QNetworkRequest>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QSslConfiguration>
#include <QSslSocket>
#include <QSslCertificate>
#include <QSslError>
#include <QDebug>
#include <QRegularExpression>
#include <QPointer>
#include <functional>
#include <QUrl>

#include <QtWebEngineCore/qtwebenginecoreglobal.h>

#include "input/InputComponent.h"
#include "SystemComponent.h"
#include "Version.h"
#include "settings/SettingsComponent.h"
#include "settings/SettingsSection.h"
#include "Paths.h"
#include "Names.h"
#include "utils/Utils.h"
#include "utils/Log.h"


#define KONVERGO_PRODUCTID_DEFAULT  3
#define KONVERGO_PRODUCTID_OPENELEC 4

// Platform types map
QMap<SystemComponent::PlatformType, QString> g_platformTypeNames = { \
  { SystemComponent::platformTypeOsx, "macosx" }, \
  { SystemComponent::platformTypeWindows, "windows" },
  { SystemComponent::platformTypeLinux, "linux" },
  { SystemComponent::platformTypeOpenELEC, "openelec" },
  { SystemComponent::platformTypeFreeBSD, "freebsd" },
  { SystemComponent::platformTypeUnknown, "unknown" },
};

// platform Archictecture map
QMap<SystemComponent::PlatformArch, QString> g_platformArchNames = {
  { SystemComponent::platformArchX86_32, "i386" },
  { SystemComponent::platformArchX86_64, "x86_64" },
  { SystemComponent::platformArchRpi2, "rpi2" },
  { SystemComponent::platformArchUnknown, "unknown" }
};


///////////////////////////////////////////////////////////////////////////////////////////////////
SystemComponent::SystemComponent(QObject* parent) : ComponentBase(parent), m_platformType(platformTypeUnknown), m_platformArch(platformArchUnknown), m_doLogMessages(false), m_scale(1), m_connectivityCheckReply(nullptr), m_resolveUrlReply(nullptr)
{
  m_connectivityRetryTimer = new QTimer(this);
  m_connectivityRetryTimer->setSingleShot(true);
  connect(m_connectivityRetryTimer, &QTimer::timeout, [this]() {
    qInfo() << "Retrying connectivity check for" << m_pendingConnectivityUrl;
    checkServerConnectivity(m_pendingConnectivityUrl);
  });

  m_networkManager = new Ipv6NetworkAccessManager(this);
  connect(QCoreApplication::instance(), &QCoreApplication::aboutToQuit, this, &SystemComponent::stopSshTunnel);

// define OS Type
#if defined(Q_OS_MAC)
  m_platformType = platformTypeOsx;
#elif defined(Q_OS_WIN)
  m_platformType = platformTypeWindows;
#elif defined(KONVERGO_OPENELEC)
  m_platformType = platformTypeOpenELEC;
#elif defined(Q_OS_LINUX)
  m_platformType = platformTypeLinux;
#elif defined(Q_OS_FREEBSD)
  m_platformType = platformTypeFreeBSD;
#endif

// define target type
#ifdef TARGET_RPI
  m_platformArch = platformArchRpi2;
#elif defined(Q_PROCESSOR_X86_32)
  m_platformArch = platformArchX86_32;
#elif defined(Q_PROCESSOR_X86_64)
  m_platformArch = platformArchX86_64;
#endif

  if (auto* s = SettingsComponent::Get().getSection(SETTINGS_SECTION_AUDIO))
  {
    connect(s, &SettingsSection::valuesUpdated, [=]()
    {
      emit capabilitiesChanged(getCapabilitiesString());
    });
  }
}

/////////////////////////////////////////////////////////////////////////////////////////
bool SystemComponent::componentInitialize()
{
  QDir().mkpath(Paths::dataDir("scripts"));
  QDir().mkpath(Paths::dataDir("sounds"));

  return true;
}

/////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::crashApp()
{
  *static_cast<volatile int*>(nullptr) = 0;
}

/////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::componentPostInitialize()
{
  InputComponent::Get().registerHostCommand("crash!", this, "crashApp");
  InputComponent::Get().registerHostCommand("script", this, "runUserScript");
}

///////////////////////////////////////////////////////////////////////////////////////////////////
QString SystemComponent::getPlatformTypeString() const
{
  return g_platformTypeNames[m_platformType];
}

///////////////////////////////////////////////////////////////////////////////////////////////////
QString SystemComponent::getPlatformArchString() const
{
  return g_platformArchNames[m_platformArch];
}

///////////////////////////////////////////////////////////////////////////////////////////////////
QVariantMap SystemComponent::systemInformation() const
{
  QVariantMap info;
  QString build;
  QString dist;
  QString arch;
  int productid = KONVERGO_PRODUCTID_DEFAULT;

#ifdef Q_OS_WIN
  arch = (sizeof(void *) == 8) ? "x86_64" : "i386";
#else
  arch = QSysInfo::currentCpuArchitecture();
#endif

  build = getPlatformTypeString();
  dist = getPlatformTypeString();

#if defined(KONVERGO_OPENELEC)
  productid = KONVERGO_PRODUCTID_OPENELEC;
  dist = "openelec";

  if (m_platformArch == platformArchRpi2)
  {
    build = "rpi2";
  }
  else
  {
    build = "generic";
  }
#endif

  
  info["build"] = build + "-" + arch;
  info["dist"] = dist;
  info["version"] = Version::GetVersionString();
  info["productid"] = productid;
  
 qDebug() << QString(
                "System Information : build(%1)-arch(%2).dist(%3).version(%4).productid(%5)")
                .arg(build)
                .arg(arch)
                .arg(dist)
                .arg(Version::GetVersionString())
                .arg(productid);
 return info;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::exit()
{
  qApp->quit();
}

///////////////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::restart()
{
  qApp->quit();
  QProcess::startDetached(qApp->arguments()[0], qApp->arguments());
}

///////////////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::jsLog(int level, QString text)
{
  switch (level) {
    case 0: // Info
      qInfo() << "JS:" << qPrintable(text);
      break;
    case 1: // Warning
      qWarning() << "JS:" << qPrintable(text);
      break;
    case 2: // Error
      qCritical() << "JS:" << qPrintable(text);
      break;
    default:
      qDebug() << "JS: [uncaught level=" << level << "]" << qPrintable(text);
      break;
  }
}

///////////////////////////////////////////////////////////////////////////////////////////////////
QString SystemComponent::extractBaseUrl(const QString& url)
{
  QUrl parsedUrl(url);
  QString path = parsedUrl.path();

  // Let QUrl retain IPv6 brackets and escaping instead of concatenating a bare host.
  const int webIndex = path.toLower().lastIndexOf("/web");
  parsedUrl.setPath(webIndex >= 0 ? path.left(webIndex) : QString());
  if ((parsedUrl.scheme() == "http" && parsedUrl.port() == 80) || (parsedUrl.scheme() == "https" && parsedUrl.port() == 443)) parsedUrl.setPort(-1);
  parsedUrl.setUserInfo(QString());
  parsedUrl.setQuery(QString());
  parsedUrl.setFragment(QString());
  return parsedUrl.toString(QUrl::FullyEncoded);
}

///////////////////////////////////////////////////////////////////////////////////////////////////
QSslConfiguration SystemComponent::getSSLConfiguration()
{
  QSslConfiguration sslConfig;
  if (SettingsComponent::Get().ignoreSSLErrors()) {
    sslConfig.setPeerVerifyMode(QSslSocket::VerifyNone);
  } else if (SettingsComponent::Get().autodetectCertBundle()) {
    QString certPath = SettingsComponent::Get().detectCertBundlePath();
    if (!certPath.isEmpty()) {
      QList<QSslCertificate> certs = QSslCertificate::fromPath(certPath);
      if (!certs.isEmpty()) {
        sslConfig.setCaCertificates(certs);
      }
    }
  }
  return sslConfig;
}

///////////////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::setReplyTimeout(QNetworkReply* reply, int ms)
{
  QPointer<QNetworkReply> replyPtr(reply);
  QTimer::singleShot(ms, this, [replyPtr]() {
    if (replyPtr && !replyPtr->isFinished()) {
      replyPtr->abort();
    }
  });
}

///////////////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::resolveUrl(const QString& url, std::function<void(const QString&)> callback)
{
  // Abort any pending resolve
  if (m_resolveUrlReply) {
    m_resolveUrlReply->abort();
    m_resolveUrlReply->deleteLater();
    m_resolveUrlReply = nullptr;
  }

  QNetworkRequest request(url);
  request.setHeader(QNetworkRequest::UserAgentHeader, getUserAgent());
  request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::NoLessSafeRedirectPolicy);
  request.setSslConfiguration(getSSLConfiguration());

  m_resolveUrlReply = m_networkManager->head(request);

  QNetworkReply* reply = m_resolveUrlReply;
  setReplyTimeout(reply, NETWORK_REQUEST_TIMEOUT_MS);

  if (SettingsComponent::Get().ignoreSSLErrors()) {
    connect(reply, QOverload<const QList<QSslError>&>::of(&QNetworkReply::sslErrors),
            reply, QOverload<>::of(&QNetworkReply::ignoreSslErrors));
  }
  connect(reply, &QNetworkReply::finished, this, [this, reply, callback]() {
    if (reply->error() == QNetworkReply::OperationCanceledError) {
      reply->deleteLater();
      if (m_resolveUrlReply == reply) {
        m_resolveUrlReply = nullptr;
      }
      return;
    }

    if (reply->error() != QNetworkReply::NoError) {
      qWarning() << "resolveUrl: error:" << reply->errorString();
    }

    callback(reply->url().toString());
    reply->deleteLater();
    if (m_resolveUrlReply == reply) {
      m_resolveUrlReply = nullptr;
    }
  });
}

///////////////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::checkServerConnectivity(QString url)
{
  // Stop any pending retry
  if (m_connectivityRetryTimer->isActive()) {
    m_connectivityRetryTimer->stop();
  }

  if (m_connectivityCheckReply) {
    m_connectivityCheckReply->abort();
    m_connectivityCheckReply->deleteLater();
    m_connectivityCheckReply = nullptr;
  }

  if (QUrl(url).scheme().compare("ssh", Qt::CaseInsensitive) != 0 && !Ipv6NetworkPolicy::allows(QUrl(url)))
  {
    m_pendingConnectivityUrl.clear();
    QMessageBox::warning(nullptr, tr("IPv6 required"), tr("Use ssh://username@hostname[:port] for the built-in tunnel, or an HTTP(S) URL with a literal IPv6 address in brackets. IPv4 addresses and direct HTTP hostname fallback are disabled."));
    emit serverConnectivityResult(url, false, url);
    return;
  }

  // Store for retry
  m_pendingConnectivityUrl = url;
  const QString requestedUrl = url;

  if (QUrl(url).scheme().compare("ssh", Qt::CaseInsensitive) == 0)
  {
    QString localUrl;
    if (!ensureSshTunnel(url, localUrl))
    {
      m_pendingConnectivityUrl.clear();
      emit serverConnectivityResult(requestedUrl, false, requestedUrl);
      return;
    }
    url = localUrl;
  }

  resolveUrl(url, [this, url, requestedUrl](const QString& fullResolvedUrl) {
    QString baseUrl = extractBaseUrl(fullResolvedUrl);

    QString checkUrl = baseUrl + "/System/Info/Public";

    QNetworkRequest request(checkUrl);
    request.setHeader(QNetworkRequest::UserAgentHeader, getUserAgent());
    request.setRawHeader("Cache-Control", "no-cache");
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::NoLessSafeRedirectPolicy);
    request.setSslConfiguration(getSSLConfiguration());

    m_connectivityCheckReply = m_networkManager->get(request);

    QNetworkReply* reply = m_connectivityCheckReply;
    setReplyTimeout(reply, NETWORK_REQUEST_TIMEOUT_MS);

    if (SettingsComponent::Get().ignoreSSLErrors()) {
      connect(reply, QOverload<const QList<QSslError>&>::of(&QNetworkReply::sslErrors),
              reply, QOverload<>::of(&QNetworkReply::ignoreSslErrors));
    }

    connect(reply, &QNetworkReply::finished, this, [this, reply, requestedUrl, fullResolvedUrl]() {
      if (reply->error() == QNetworkReply::OperationCanceledError) {
        reply->deleteLater();
        if (m_connectivityCheckReply == reply) {
          m_connectivityCheckReply = nullptr;
        }
        return;
      }

      bool success = false;
      if (reply->error() == QNetworkReply::NoError) {
        QByteArray data = reply->readAll();
        QJsonDocument doc = QJsonDocument::fromJson(data);
        if (doc.isObject() && doc.object().contains("Id") && !doc.object()["Id"].toString().isEmpty()) {
          success = true;
        } else {
          qWarning() << "checkServerConnectivity: invalid response";
        }
      } else {
        qWarning() << "checkServerConnectivity: error:" << reply->errorString();
      }

      if (success) {
        m_connectivityRetryTimer->stop();
        m_pendingConnectivityUrl.clear();
        emit serverConnectivityResult(requestedUrl, success, fullResolvedUrl);
      } else {
        m_connectivityRetryTimer->start(CONNECTIVITY_RETRY_INTERVAL_MS);
      }

      reply->deleteLater();
      if (m_connectivityCheckReply == reply) {
        m_connectivityCheckReply = nullptr;
      }
    });
  });
}

bool SystemComponent::ensureSshTunnel(const QString& rawUrl, QString& localUrl)
{
  const QUrl address(rawUrl);
  const QString username = address.userName();
  const QString hostname = address.host();
  QString transportHost = hostname;
  const int port = address.port(22);
  if (address.scheme().compare("ssh", Qt::CaseInsensitive) != 0 || username.isEmpty() || hostname.isEmpty() ||
      !address.password().isEmpty() || !address.path().isEmpty() || !address.query().isEmpty() || !address.fragment().isEmpty() ||
      port < 1 || port > 65535 || username.contains(QRegularExpression("[^A-Za-z0-9_.-]")))
  {
    qWarning() << "[Wallaby Popcorn SSH] Invalid SSH URL or username";
    QMessageBox::warning(nullptr, tr("Invalid SSH server address"),
                         tr("Use ssh://username@hostname[:port] with no password or path."));
    return false;
  }
  QHostAddress numericHost(hostname);
  if (numericHost.protocol() == QAbstractSocket::IPv4Protocol || Ipv6NetworkPolicy::isMapped(numericHost))
  {
    QMessageBox::warning(nullptr, tr("IPv6 required"), tr("IPv4 SSH addresses are not supported. Use an IPv6 address or a hostname with an AAAA record."));
    return false;
  }
  if (numericHost.isNull())
  {
    // Ask the OS resolver over D-Bus. The app itself never needs an IPv4 DNS socket.
    QProcess resolver;
    resolver.start("resolvectl", {"query", "--type=AAAA", "--legend=no", "--", hostname});
    if (!resolver.waitForStarted(3000) || !resolver.waitForFinished(12000))
    {
      resolver.kill(); resolver.waitForFinished(1000);
      QMessageBox::warning(nullptr, tr("IPv6 name lookup failed"), tr("Could not query the system IPv6 resolver. Check systemd-resolved, or enter the server's IPv6 address."));
      return false;
    }
    transportHost.clear();
    for (const QString& token : QString::fromUtf8(resolver.readAllStandardOutput()).split(QRegularExpression("\\s+"), Qt::SkipEmptyParts))
    {
      QHostAddress candidate(token);
      if (candidate.protocol() == QAbstractSocket::IPv6Protocol && !Ipv6NetworkPolicy::isMapped(candidate)) { transportHost = token; break; }
    }
    if (transportHost.isEmpty())
    {
      QMessageBox::warning(nullptr, tr("IPv6 name lookup failed"), tr("No usable IPv6 address was returned for this server. Check its AAAA record and your IPv6 connection. IPv4 fallback is disabled."));
      return false;
    }
  }
  qWarning() << "[Wallaby Popcorn SSH] Starting setup for" << username << "@" << hostname << "port" << port;

  const QString sshDir = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + "/ssh-tunnel";
  if (!QDir().mkpath(sshDir))
  {
    qWarning() << "[Wallaby Popcorn SSH] Could not create app key directory:" << sshDir;
    QMessageBox::critical(nullptr, tr("SSH tunnel"), tr("Could not create the SSH key directory."));
    return false;
  }
  QFile::setPermissions(sshDir, QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner);
  const QByteArray identity = QCryptographicHash::hash(rawUrl.toUtf8(), QCryptographicHash::Sha256).toHex();
  const QString keyBase = sshDir + "/identity-" + QString::fromLatin1(identity);
  const QString privateKey = keyBase;
  const QString publicKey = keyBase + ".pub";
  const QString knownHosts = sshDir + "/known-hosts-" + QString::fromLatin1(identity);

  if (m_sshTunnelProcess && m_sshTunnelProcess->state() == QProcess::Running && m_sshTunnelAddress == rawUrl)
  {
    localUrl = m_sshTunnelLocalUrl;
    return true;
  }
  stopSshTunnel();

  if (!QFileInfo::exists(privateKey) || !QFileInfo::exists(publicKey))
  {
    qWarning() << "[Wallaby Popcorn SSH] Generating app Ed25519 key";
    QFile::remove(knownHosts + ".enrolled");
    QProcess keygen;
    keygen.start("ssh-keygen", {"-q", "-t", "ed25519", "-N", "", "-C", "jellyfin-desktop", "-f", privateKey});
    if (!keygen.waitForStarted(5000) || !keygen.waitForFinished(15000) || keygen.exitStatus() != QProcess::NormalExit || keygen.exitCode() != 0)
    {
      QMessageBox::critical(nullptr, tr("SSH tunnel"), tr("Could not create an Ed25519 SSH key. Make sure OpenSSH client tools are installed (openssh-client package)."));
      return false;
    }
    qWarning() << "[Wallaby Popcorn SSH] App key generated";
    QFile::setPermissions(privateKey, QFileDevice::ReadOwner | QFileDevice::WriteOwner);
    QFile::setPermissions(publicKey, QFileDevice::ReadOwner | QFileDevice::WriteOwner);
  }

  const QString hostKeyAlgorithm = "ssh-ed25519";
  if (!QFileInfo::exists(knownHosts))
  {
    qWarning() << "[Wallaby Popcorn SSH] Scanning SSH host key";
    QProcess scan;
    scan.start("ssh-keyscan", {"-6", "-T", "8", "-p", QString::number(port), "-t", "ed25519", transportHost});
    if (!scan.waitForStarted(5000) || !scan.waitForFinished(12000))
    {
      qWarning() << "[Wallaby Popcorn SSH] Host key scan failed:" << scan.errorString() << scan.readAllStandardError();
      QMessageBox::critical(nullptr, tr("SSH host key unavailable"), tr("Could not retrieve an Ed25519 host key from %1:%2.").arg(hostname).arg(port));
      return false;
    }
    const QByteArray scanOutput = scan.readAllStandardOutput();
    if (scan.exitStatus() != QProcess::NormalExit || scan.exitCode() != 0 || scanOutput.isEmpty())
    {
      qWarning() << "[Wallaby Popcorn SSH] Host key scan failed:" << scan.errorString() << scan.readAllStandardError();
      QMessageBox::critical(nullptr, tr("SSH host key unavailable"), tr("Could not retrieve an Ed25519 host key from %1:%2.").arg(hostname).arg(port));
      return false;
    }
    QByteArray keyLine;
    for (const QByteArray& candidate : scanOutput.split('\n'))
    {
      const QByteArray line = candidate.simplified();
      if (line.isEmpty() || line.startsWith('#')) continue;
      const QList<QByteArray> fields = line.split(' ');
      if (fields.size() >= 3 && fields.at(1) == "ssh-ed25519")
      {
        keyLine = (port == 22 ? hostname : QString("[%1]:%2").arg(hostname).arg(port)).toUtf8() + " " + fields.at(1) + " " + fields.at(2) + '\n';
        break;
      }
    }
    if (keyLine.isEmpty())
    {
      qWarning() << "[Wallaby Popcorn SSH] Host key scan returned no usable ssh-ed25519 key line";
      QMessageBox::critical(nullptr, tr("SSH host key unavailable"), tr("The SSH scan did not return a usable Ed25519 host key."));
      return false;
    }
    QTemporaryFile fingerprintFile;
    if (!fingerprintFile.open())
    {
      qWarning() << "[Wallaby Popcorn SSH] Could not create temporary host-key fingerprint file:" << fingerprintFile.errorString();
      QMessageBox::critical(nullptr, tr("SSH host key error"), tr("Could not create a temporary file to verify the SSH host key."));
      return false;
    }
    fingerprintFile.write(keyLine);
    fingerprintFile.flush();
    QProcess fingerprint;
    fingerprint.start("ssh-keygen", {"-lf", fingerprintFile.fileName(), "-E", "sha256"});
    if (!fingerprint.waitForStarted(5000) || !fingerprint.waitForFinished(5000) ||
        fingerprint.exitStatus() != QProcess::NormalExit || fingerprint.exitCode() != 0)
    {
      qWarning() << "[Wallaby Popcorn SSH] Could not calculate host-key fingerprint:" << fingerprint.errorString() << fingerprint.readAllStandardError();
      QMessageBox::critical(nullptr, tr("SSH host key error"), tr("Could not calculate the fingerprint for the SSH host key."));
      return false;
    }
    const QString fingerprintText = QString::fromLocal8Bit(fingerprint.readAllStandardOutput()).trimmed();
    qWarning() << "[Wallaby Popcorn SSH] Host key scan completed; showing fingerprint confirmation";
    if (fingerprintText.isEmpty() || QMessageBox::question(nullptr, tr("Verify SSH host key"),
        tr("Check this fingerprint with the server administrator before trusting it:\n\n%1\n\nTrust this key for %2:%3?").arg(fingerprintText).arg(hostname).arg(port),
        QMessageBox::Yes | QMessageBox::No, QMessageBox::No) != QMessageBox::Yes)
    {
      qWarning() << "[Wallaby Popcorn SSH] Host-key confirmation declined or fingerprint unavailable";
      return false;
    }
    QFile pinFile(knownHosts);
    if (!pinFile.open(QIODevice::WriteOnly | QIODevice::Truncate))
    {
      qWarning() << "[Wallaby Popcorn SSH] Could not save pinned host key:" << pinFile.errorString();
      QMessageBox::critical(nullptr, tr("SSH host key error"), tr("Could not save the verified SSH host key."));
      return false;
    }
    pinFile.write(keyLine);
    pinFile.close();
    QFile::setPermissions(knownHosts, QFileDevice::ReadOwner | QFileDevice::WriteOwner);
  }

  if (!QFileInfo::exists(knownHosts + ".enrolled"))
  {
    qWarning() << "[Wallaby Popcorn SSH] App key needs enrollment; showing password prompt";
    bool accepted = false;
    const QString password = QInputDialog::getText(nullptr, tr("Enroll this Jellyfin client"),
      tr("Enter the SSH account password for %1@%2. This installs a dedicated app key on the server.").arg(username, hostname),
      QLineEdit::Password, QString(), &accepted);
    if (!accepted)
    {
      qWarning() << "[Wallaby Popcorn SSH] Password enrollment prompt cancelled";
      return false;
    }
    if (password.isEmpty())
    {
      QMessageBox::warning(nullptr, tr("SSH enrollment"), tr("A password is required to enroll the app key."));
      return false;
    }

    QTemporaryDir askpassDir;
    if (!askpassDir.isValid())
    {
      qWarning() << "[Wallaby Popcorn SSH] Could not create temporary askpass directory:" << askpassDir.errorString();
      QMessageBox::critical(nullptr, tr("SSH enrollment error"), tr("Could not create temporary files for SSH key enrollment."));
      return false;
    }
    const QString passwordFile = askpassDir.path() + "/password";
    QFile secret(passwordFile);
    if (!secret.open(QIODevice::WriteOnly))
    {
      qWarning() << "[Wallaby Popcorn SSH] Could not write temporary password file:" << secret.errorString();
      QMessageBox::critical(nullptr, tr("SSH enrollment error"), tr("Could not prepare the SSH password prompt."));
      return false;
    }
    secret.write(password.toUtf8());
    secret.close();
    QFile::setPermissions(passwordFile, QFileDevice::ReadOwner | QFileDevice::WriteOwner);
    const QString askpassPath = askpassDir.path() + "/askpass";
    QFile askpass(askpassPath);
    if (!askpass.open(QIODevice::WriteOnly))
    {
      qWarning() << "[Wallaby Popcorn SSH] Could not write askpass helper:" << askpass.errorString();
      QMessageBox::critical(nullptr, tr("SSH enrollment error"), tr("Could not prepare the SSH password prompt."));
      return false;
    }
    askpass.write("#!/bin/sh\ncat \"" + passwordFile.toUtf8() + "\"\n");
    askpass.close();
    QFile::setPermissions(askpassPath, QFileDevice::ReadOwner | QFileDevice::WriteOwner | QFileDevice::ExeOwner);
    QProcess ssh;
    QProcessEnvironment env = QProcessEnvironment::systemEnvironment();
    env.insert("SSH_ASKPASS", askpassPath);
    env.insert("SSH_ASKPASS_REQUIRE", "force");
    if (!env.contains("DISPLAY")) env.insert("DISPLAY", ":0");
    ssh.setProcessEnvironment(env);
    QStringList enrollArgs = {"-6", "-F", "/dev/null", "-o", "HostKeyAlias=" + hostname, "-T", "-p", QString::number(port), "-o", "StrictHostKeyChecking=yes", "-o",
      "UserKnownHostsFile=" + knownHosts, "-o", "GlobalKnownHostsFile=/dev/null", "-o", "HostKeyAlgorithms=" + hostKeyAlgorithm, "-o",
      "PreferredAuthentications=password", "-o", "PubkeyAuthentication=no", "-o", "NumberOfPasswordPrompts=1",
      username + "@" + transportHost, "/usr/local/libexec/jellyfin-ssh-enrol.py", "--trusted-ipv6"};
    ssh.start("ssh", enrollArgs);
    if (!ssh.waitForStarted(5000))
    {
      qWarning() << "[Wallaby Popcorn SSH] Could not start SSH enrollment process:" << ssh.errorString();
      QMessageBox::critical(nullptr, tr("SSH enrollment error"), tr("Could not start the SSH client for key enrollment."));
      return false;
    }
    QFile pub(publicKey);
    if (!pub.open(QIODevice::ReadOnly))
    {
      qWarning() << "[Wallaby Popcorn SSH] Could not read app public key:" << pub.errorString();
      QMessageBox::critical(nullptr, tr("SSH enrollment error"), tr("Could not read the app's SSH public key."));
      return false;
    }
    const QByteArray enrollment = "JFIN-SSH-ENROLL/1 " + pub.readAll().trimmed() + "\n";
    ssh.write(enrollment);
    ssh.closeWriteChannel();
    if (!ssh.waitForFinished(30000))
    {
      ssh.kill();
      ssh.waitForFinished(2000);
    }
    const QByteArray result = ssh.readAllStandardOutput() + ssh.readAllStandardError();
    qWarning() << "[Wallaby Popcorn SSH] Enrollment process finished with code" << ssh.exitCode() << "output:" << result;
    if (!result.contains("JFIN-SSH-ENROLL/1 OK INSTALLED") && !result.contains("JFIN-SSH-ENROLL/1 OK ALREADY_PRESENT"))
    {
      QMessageBox::critical(nullptr, tr("SSH enrollment failed"), tr("The server did not accept this app's SSH key. Check that the Jellyfin SSH enrollment helper is installed and try again."));
      return false;
    }
    QFile enrolledMarker(knownHosts + ".enrolled");
    if (enrolledMarker.open(QIODevice::WriteOnly)) enrolledMarker.close();
  }

  bool portSeedOk = false;
  const uint portSeed = identity.left(8).toUInt(&portSeedOk, 16);
  if (!portSeedOk)
  {
    qWarning() << "[Wallaby Popcorn SSH] Could not derive the stable local tunnel port";
    QMessageBox::critical(nullptr, tr("SSH tunnel error"), tr("Could not select a stable local port for the Jellyfin tunnel."));
    return false;
  }
  const quint16 localPort = static_cast<quint16>(20000 + (portSeed % 10000));
  QTcpServer portProbe;
  if (!portProbe.listen(QHostAddress::LocalHostIPv6, localPort))
  {
    qWarning() << "[Wallaby Popcorn SSH] Stable local port" << localPort << "is unavailable:" << portProbe.errorString();
    QMessageBox::critical(nullptr, tr("SSH tunnel error"),
                          tr("The stable local port for this SSH server is already in use. Close the program using it and try again."));
    return false;
  }
  portProbe.close();
  m_sshTunnelProcess = new QProcess(this);
  QStringList tunnelArgs = {"-6", "-F", "/dev/null", "-o", "HostKeyAlias=" + hostname, "-N", "-L", QString("[::1]:%1:[::1]:8096").arg(localPort), "-p", QString::number(port),
    "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3", "-o",
    "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=" + knownHosts, "-o", "GlobalKnownHostsFile=/dev/null", "-o", "HostKeyAlgorithms=" + hostKeyAlgorithm,
    "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-i", privateKey, username + "@" + transportHost};
  m_sshTunnelProcess->start("ssh", tunnelArgs);
  qWarning() << "[Wallaby Popcorn SSH] Starting port-forward process";
  if (!m_sshTunnelProcess->waitForStarted(5000))
  {
    stopSshTunnel();
    QMessageBox::critical(nullptr, tr("SSH tunnel failed"), tr("Could not start OpenSSH on this computer."));
    return false;
  }
  QElapsedTimer wait;
  wait.start();
  bool listening = false;
  while (wait.elapsed() < 5000 && m_sshTunnelProcess->state() == QProcess::Running)
  {
    QTcpSocket probe;
    probe.connectToHost(QHostAddress::LocalHostIPv6, localPort);
    if (probe.waitForConnected(150)) { listening = true; probe.disconnectFromHost(); break; }
    QThread::msleep(50);
  }
  if (!listening)
  {
    const QString error = QString::fromLocal8Bit(m_sshTunnelProcess->readAllStandardError()).trimmed();
    qWarning() << "[Wallaby Popcorn SSH] Tunnel did not listen within 5 seconds:" << error;
    stopSshTunnel();
    QMessageBox::critical(nullptr, tr("SSH tunnel failed"), error.isEmpty() ? tr("The Jellyfin tunnel did not become ready.") : error);
    return false;
  }
  m_sshTunnelAddress = rawUrl;
  m_sshTunnelLocalUrl = QString("http://[::1]:%1").arg(localPort);
  localUrl = m_sshTunnelLocalUrl;
  qWarning() << "[Wallaby Popcorn SSH] Tunnel is ready on" << m_sshTunnelLocalUrl;
  return true;
}

void SystemComponent::stopSshTunnel()
{
  if (!m_sshTunnelProcess) return;
  if (m_sshTunnelProcess->state() != QProcess::NotRunning)
  {
    m_sshTunnelProcess->terminate();
    if (!m_sshTunnelProcess->waitForFinished(1500)) { m_sshTunnelProcess->kill(); m_sshTunnelProcess->waitForFinished(1000); }
  }
  m_sshTunnelProcess->deleteLater();
  m_sshTunnelProcess = nullptr;
  m_sshTunnelAddress.clear();
  m_sshTunnelLocalUrl.clear();
}

///////////////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::cancelServerConnectivity()
{
  if (m_connectivityRetryTimer->isActive()) {
    m_connectivityRetryTimer->stop();
  }

  if (m_pendingConnectivityUrl.startsWith("ssh://", Qt::CaseInsensitive))
  {
    stopSshTunnel();
  }

  // Save pointers before abort() since it synchronously triggers finished handlers
  // which may set member variables to nullptr
  if (m_resolveUrlReply) {
    QNetworkReply* reply = m_resolveUrlReply;
    m_resolveUrlReply = nullptr;
    reply->abort();
    reply->deleteLater();
  }

  if (m_connectivityCheckReply) {
    QNetworkReply* reply = m_connectivityCheckReply;
    m_connectivityCheckReply = nullptr;
    reply->abort();
    reply->deleteLater();
  }

  m_pendingConnectivityUrl.clear();
}

///////////////////////////////////////////////////////////////////////////////////////////////////
QString SystemComponent::getUserAgent()
{
  QString kernel = QSysInfo::kernelType();
  kernel[0] = kernel[0].toUpper();
  QString chromeVersion = QString(qWebEngineChromiumVersion()).split('.').first() + ".0.0.0";
  QString userAgent = QString("JellyfinDesktop/%1 (%2; %3) Chrome/%4")
    .arg(Version::GetVersionString())
    .arg(kernel)
    .arg(getPlatformArchString())
    .arg(chromeVersion);
  return userAgent;
}

/////////////////////////////////////////////////////////////////////////////////////////
QString SystemComponent::debugInformation()
{
  QString debugInfo;
  QTextStream stream(&debugInfo);

  stream << "Jellyfin\n";
  stream << "  Version: " << Version::GetVersionString() << " built: " << Version::GetBuildDate() << "\n";
  stream << "  Web Client Version: " << Version::GetWebVersion() << "\n";
  stream << "  Web Client URL: " << SettingsComponent::Get().value(SETTINGS_SECTION_PATH, "startupurl").toString() << "\n";
  stream << "  Platform: " << getPlatformTypeString() << "-" << getPlatformArchString() << "\n";
  stream << "  User-Agent: " << getUserAgent() << "\n";
  stream << "  Qt version: " << qVersion() << QString("(%1)").arg(Version::GetQtDepsVersion()) << "\n";
  stream << "  Depends version: " << Version::GetDependenciesVersion() << "\n";
  stream << "\n";

  stream << "Files\n";
  stream << "  Log file: " << Paths::logDir(Names::DataName() + ".log") << "\n";
  stream << "  Config file: " << Paths::dataDir(Names::DataName() + ".conf") << "\n";
  stream << "\n";

  stream << "Network Addresses\n";
  for(const QString& addr : networkAddresses())
  {
    stream << "  " << addr << "\n";
  }
  stream << "\n";

  stream.flush();
  return debugInfo;
}

/////////////////////////////////////////////////////////////////////////////////////////
QStringList SystemComponent::networkAddresses() const
{
  QStringList list;
  for(const QHostAddress& address : QNetworkInterface::allAddresses())
  {
    if (! address.isLoopback() && (address.protocol() == QAbstractSocket::IPv4Protocol ||
                                   address.protocol() == QAbstractSocket::IPv6Protocol))
    {
      auto s = address.toString();
      if (!s.startsWith("fe80::"))
        list << s;
    }
  }

  return list;
}

/////////////////////////////////////////////////////////////////////////////////////////
bool SystemComponent::isManagementUrl(const QString& current, const QString& candidate) const
{
  const QUrl base(current);
  const QUrl target = base.resolved(QUrl(candidate));
  const bool webScheme = target.scheme() == "http" || target.scheme() == "https";
  const auto effectivePort = [](const QUrl& url) { return url.port(url.scheme() == "https" ? 443 : 80); };
  if (!webScheme || base.scheme() != target.scheme() || base.host() != target.host() ||
      effectivePort(base) != effectivePort(target) || !target.userInfo().isEmpty()) return false;
  return QRegularExpression("^!?/(dashboard|metadata)([/ ?]|$)").match(target.fragment()).hasMatch() ||
         QRegularExpression("/(dashboard|metadata)(/|$)").match(target.path()).hasMatch();
}

void SystemComponent::openExternalUrl(const QString& url)
{
  QDesktopServices::openUrl(QUrl(url));
}

/////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::runUserScript(QString script)
{
  // We take the path the user supplied and run it through fileInfo and
  // look for the fileName() part, this is to avoid people sharing keymaps
  // that tries to execute things like ../../ etc. Note that this function
  // is still not safe, people can do nasty things with it, so users needs
  // to be careful with their keymaps.
  //
  QFileInfo fi(script);
  QString scriptPath = Paths::dataDir("scripts/" + fi.fileName());

  QFile scriptFile(scriptPath);
  if (scriptFile.exists())
  {
    if (!QFileInfo(scriptFile).isExecutable())
    {
      qWarning() << "Script:" << script << "is not executable";
      return;
    }

    qInfo() << "Running script:" << scriptPath;

    if (QProcess::startDetached(scriptPath, QStringList()))
      qDebug() << "Script started successfully";
    else
      qWarning() << "Error running script:" << scriptPath;
  }
  else
  {
    qWarning() << "Could not find script:" << scriptPath;
  }
}

/////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::hello(const QString& version)
{
  qDebug() << QString("Web-client (%1) fully inited.").arg(version);
  m_webClientVersion = version;
}

/////////////////////////////////////////////////////////////////////////////////////////
QString SystemComponent::getNativeShellScript()
{
  static QString cachedScript;
  if (!cachedScript.isEmpty()) {
    return cachedScript;
  }

  auto path = SettingsComponent::Get().getExtensionPath();
  qDebug() << QString("Using path for extension: %1").arg(path);

  QJsonObject clientData;
  clientData.insert("deviceName", QJsonValue::fromVariant(SettingsComponent::Get().getClientName()));
  clientData.insert("version", QJsonValue::fromVariant(Version::GetVersionString()));
  clientData.insert("userAgent", QJsonValue::fromVariant(getUserAgent()));
  clientData.insert("scriptPath", QJsonValue::fromVariant("file:///" + path));
  QString defaultMode = SettingsComponent::Get().value(SETTINGS_SECTION_MAIN, "layout").toString();

  QFile flatpakOsFile {"/run/host/os-release"};
  if (flatpakOsFile.exists()) {
    qDebug() << "Found flatpak os-release file";
    if (flatpakOsFile.open(QIODevice::ReadOnly)) {
      QString flatpakOsFileString = QTextStream(&flatpakOsFile).readAll();
      if (flatpakOsFileString.contains("NAME=\"SteamOS\"")) {
        qDebug() << "Detected SteamOS";
        defaultMode = "tv";
      }
    }
  }
  clientData.insert("mode", QJsonValue::fromVariant(defaultMode));

  auto assetData = [](const QString& path, const QByteArray& mime) -> QString {
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) return QString();
    return "data:" + QString::fromLatin1(mime) + ";base64," + QString::fromLatin1(file.readAll().toBase64());
  };
  QJsonObject branding;
  branding.insert("homeBackdrop", assetData(":/web-client/extension/branding/wallaby-popcorn-home-cinema.png", "image/png"));
  branding.insert("mark", assetData(":/web-client/extension/branding/wallaby-popcorn-mark.png", "image/png"));
  branding.insert("lightWordmark", assetData(":/web-client/extension/branding/wallaby-popcorn-wordmark-light.svg", "image/svg+xml"));
  branding.insert("darkWordmark", assetData(":/web-client/extension/branding/wallaby-popcorn-wordmark-dark.svg", "image/svg+xml"));
  QFile cssFile(":/web-client/extension/wallaby-popcorn.css");
  if (cssFile.open(QIODevice::ReadOnly)) {
    QString css = QString::fromUtf8(cssFile.readAll());
    css.replace("/native/branding/wallaby-popcorn-home-cinema.png", branding.value("homeBackdrop").toString());
    css.replace("/native/wallaby-popcorn-mark.png", branding.value("mark").toString());
    css.replace("/native/wallaby-popcorn-wordmark-light.svg", branding.value("lightWordmark").toString());
    branding.insert("css", css);
  }
  clientData.insert("branding", branding);

  QVariantList settingsDescriptionsList = SettingsComponent::Get().settingDescriptions();
  QVariantMap settingsDescriptions = QVariantMap();
  for (auto setting : settingsDescriptionsList) {
    QVariantMap settingMap = setting.toMap();
    settingsDescriptions.insert(settingMap["key"].toString(), settingMap["settings"]);
  }
  clientData.insert("sections", QJsonValue::fromVariant(SettingsComponent::Get().orderedSections()));
  clientData.insert("settingsDescriptions", QJsonValue::fromVariant(settingsDescriptions));
  clientData.insert("settings", QJsonValue::fromVariant(SettingsComponent::Get().allValues()));

  QString jmpInfoDeclaration = "const jmpInfo = JSON.parse(window.atob(\"" +
                                QJsonDocument(clientData).toJson(QJsonDocument::Compact).toBase64() +
                                "\"));\nwindow.jmpInfo = jmpInfo;\n";

  auto loadScript = [](const QString& scriptPath) -> QString {
    QFile file(scriptPath);
    if (!file.open(QIODevice::ReadOnly)) {
      qCritical() << "Failed to load" << scriptPath << "from qrc";
      return "";
    }
    return QTextStream(&file).readAll();
  };

  QStringList scriptPaths = {
    ":/qtwebchannel/qwebchannel.js",
    ":/web-client/extension/mpvVideoPlayer.js",
    ":/web-client/extension/mpvAudioPlayer.js",
    ":/web-client/extension/inputPlugin.js",
    ":/web-client/extension/updatePlugin.js",
    ":/web-client/extension/connectivityHelper.js",
    ":/web-client/extension/nativeshell.js",
    ":/web-client/extension/wallaby-branding.js",
    ":/web-client/extension/wallaby-desktop.js",
    ":/web-client/extension/wallaby-library-paging.js",
    ":/web-client/extension/wallaby-artwork.js",
    ":/web-client/extension/wallaby-library.js"
  };

  cachedScript = jmpInfoDeclaration;
  for (const QString& scriptPath : scriptPaths) {
    cachedScript += loadScript(scriptPath) + "\n";
  }

  return cachedScript;
}

/////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::fetchPageForCSPWorkaround(QString url)
{
  qDebug() << "fetchPageForCSPWorkaround:" << url;

  QNetworkRequest request(url);
  request.setHeader(QNetworkRequest::UserAgentHeader, getUserAgent());
  request.setRawHeader("Cache-Control", "no-cache");

  // Configure SSL settings
  QSslConfiguration sslConfig = request.sslConfiguration();
  if (SettingsComponent::Get().ignoreSSLErrors()) {
    qDebug() << "fetchPageForCSPWorkaround: ignoring SSL errors";
    sslConfig.setPeerVerifyMode(QSslSocket::VerifyNone);
  }
  request.setSslConfiguration(sslConfig);

  QNetworkReply* reply = m_networkManager->get(request);

  // Handle SSL errors if ignoreSSLErrors is enabled
  if (SettingsComponent::Get().ignoreSSLErrors()) {
    connect(reply, QOverload<const QList<QSslError>&>::of(&QNetworkReply::sslErrors),
            this, [reply](const QList<QSslError>& errors) {
      qDebug() << "fetchPageForCSPWorkaround: ignoring SSL errors:" << errors;
      reply->ignoreSslErrors();
    });
  }

  connect(reply, &QNetworkReply::finished, this, [this, reply, url]() {
    if (reply->error() == QNetworkReply::NoError) {
      QByteArray rawData = reply->readAll();
      QString html = QString::fromUtf8(rawData);
      QString finalUrl = reply->url().toString();
      bool hadCSP = false;

      // Check for CSP headers
      QList<QByteArray> headerList = reply->rawHeaderList();
      for (const QByteArray& header : headerList) {
        QString headerName = QString::fromUtf8(header);
        if (headerName.toLower() == "content-security-policy" ||
            headerName.toLower() == "content-security-policy-report-only") {
          hadCSP = true;
          QString headerValue = QString::fromUtf8(reply->rawHeader(header));
          qInfo() << "CSP header detected:" << headerName << "=" << headerValue.left(100);
        }
      }

      if (hadCSP) {
        qInfo() << "CSP workaround: applying for" << url;
      } else {
        qDebug() << "No CSP detected for" << url;
      }

      emit pageContentReady(html, finalUrl, hadCSP);
    } else {
      qCritical() << "fetchPageForCSPWorkaround: fetch failed:" << reply->errorString();
    }
    reply->deleteLater();
  });
}

/////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::checkForUpdates()
{
#ifndef DISABLE_UPDATE_CHECK
  if (SettingsComponent::Get().value(SETTINGS_SECTION_MAIN, "checkForUpdates").toBool()) {
#if !defined(Q_OS_WIN) && !defined(Q_OS_MAC)
    QNetworkAccessManager *manager = new Ipv6NetworkAccessManager(this);
    QString checkUrl = "https://github.com/jellyfin/jellyfin-desktop/releases/latest";
    QUrl qCheckUrl = QUrl(checkUrl);
    qDebug() << QString("Checking URL for updates: %1").arg(checkUrl);
    QNetworkRequest req(qCheckUrl);
    req.setHeader(QNetworkRequest::UserAgentHeader, getUserAgent());

    connect(manager, &QNetworkAccessManager::finished, this, &SystemComponent::updateInfoHandler);
    manager->get(req);
#else
    emit updateInfoEmitted("SSL_UNAVAILABLE");
#endif
  }
#endif
}

/////////////////////////////////////////////////////////////////////////////////////////
void SystemComponent::updateInfoHandler(QNetworkReply* reply)
{
  if (reply->error() == QNetworkReply::NoError) {
    int statusCode = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    if(statusCode == 302) {
      QUrl redirectUrl = reply->attribute(QNetworkRequest::RedirectionTargetAttribute).toUrl();
      emit updateInfoEmitted(redirectUrl.toString());
    }
  }
}

/////////////////////////////////////////////////////////////////////////////////////////
#define BASESTR "protocols=shoutcast,http-video;videoDecoders=h264{profile:high&resolution:2160&level:52};audioDecoders=mp3,aac,dts{bitrate:800000&channels:%1},ac3{bitrate:800000&channels:%2}"

/////////////////////////////////////////////////////////////////////////////////////////
QString SystemComponent::getCapabilitiesString()
{
  auto capstring = QString(BASESTR);
  auto channels = SettingsComponent::Get().value(SETTINGS_SECTION_AUDIO, "channels").toString();
  auto dtsenabled = SettingsComponent::Get().value(SETTINGS_SECTION_AUDIO, "passthrough.dts").toBool();
  auto ac3enabled = SettingsComponent::Get().value(SETTINGS_SECTION_AUDIO, "passthrough.ac3").toBool();

  // Assume that auto means that we want to select multi-channel tracks by default.
  // So really only disable it when 2.0 is selected.
  //
  int ac3channels = 2;
  int dtschannels = 2;

  if (channels != "2.0")
    dtschannels = ac3channels = 8;
  else if (dtsenabled)
    dtschannels = 8;
  else if (ac3enabled)
    ac3channels = 8;

  return capstring.arg(dtschannels).arg(ac3channels);
}
