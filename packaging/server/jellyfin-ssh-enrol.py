#!/usr/bin/python3
"""Enroll a Jellyfin Desktop SSH key without changing account access policy.

With no arguments this remains compatible with the ssh-tunnel-only ForceCommand.
Trusted accounts invoke this script explicitly with --trusted.
"""

import base64
import fcntl
import os
import pwd
import re
import stat
import sys
import tempfile

PROTOCOL = b"JFIN-SSH-ENROLL/1 "
HELPER = "/usr/local/libexec/jellyfin-ssh-enrol.py"
TRUSTED_COMMAND = HELPER + " --trusted"
IPV6_COMMAND = HELPER + " --trusted-ipv6"
MAX_REQUEST = 4096
KEY_PATTERN = re.compile(rb"ssh-ed25519 ([A-Za-z0-9+/]+={0,2})(?: ([^\r\n]{1,128}))?\n?$")
TRUSTED_KEY_PREFIX = (b'restrict,port-forwarding,permitopen="127.0.0.1:8096",'
                      b'command="/bin/false" ')


def _response(code, detail):
    sys.stdout.write(f"JFIN-SSH-ENROLL/1 {code} {detail}\n")
    sys.stdout.flush()


def _read_key(stream):
    data = stream.readline(MAX_REQUEST + 1)
    if len(data) > MAX_REQUEST or not data.endswith(b"\n"):
        raise ValueError("invalid request length")
    if stream.read(1):
        raise ValueError("unexpected trailing input")
    if not data.startswith(PROTOCOL):
        raise ValueError("unsupported protocol")
    match = KEY_PATTERN.fullmatch(data[len(PROTOCOL):])
    if not match:
        raise ValueError("only a valid ssh-ed25519 public key is accepted")
    encoded = match.group(1)
    blob = base64.b64decode(encoded, validate=True)
    if len(blob) != 51 or not blob.startswith(b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20"):
        raise ValueError("invalid Ed25519 key blob")
    return b"ssh-ed25519 " + encoded


def _contains_key(data, key):
    wanted = key.split()[1]
    for line in data.splitlines():
        fields = line.strip().split()
        for index, field in enumerate(fields[:-1]):
            if field == b"ssh-ed25519" and fields[index + 1] == wanted:
                return True
    return False


def _trusted_key_is_limited(data, key, prefix=TRUSTED_KEY_PREFIX):
    wanted = key.split()[1]
    for line in data.splitlines():
        fields = line.strip().split()
        for index, field in enumerate(fields[:-1]):
            if field == b"ssh-ed25519" and fields[index + 1] == wanted:
                return line.startswith(prefix + key)
    return False


def enroll(home, key, uid, gid, trusted=False, ipv6=False):
    prefix = TRUSTED_KEY_PREFIX.replace(b'127.0.0.1:8096', b'[::1]:8096') if ipv6 else TRUSTED_KEY_PREFIX
    ssh_dir = os.path.join(home, ".ssh")
    try:
        os.mkdir(ssh_dir, 0o700)
    except FileExistsError:
        pass
    info = os.lstat(ssh_dir)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_gid != gid:
        raise PermissionError("unsafe .ssh directory")
    os.chmod(ssh_dir, 0o700)

    lock_path = os.path.join(ssh_dir, ".jellyfin-enroll.lock")
    lock_fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        os.fchmod(lock_fd, 0o600)
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        auth_path = os.path.join(ssh_dir, "authorized_keys")
        try:
            auth_fd = os.open(auth_path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        except FileNotFoundError:
            auth_fd = None
        if auth_fd is not None:
            try:
                auth_info = os.fstat(auth_fd)
                if not stat.S_ISREG(auth_info.st_mode) or auth_info.st_uid != uid or auth_info.st_gid != gid:
                    raise PermissionError("unsafe authorized_keys file")
                with os.fdopen(auth_fd, "rb", closefd=False) as existing_file:
                    existing = existing_file.read(1024 * 1024 + 1)
                if len(existing) > 1024 * 1024:
                    raise ValueError("authorized_keys is too large")
            finally:
                os.close(auth_fd)
            if _contains_key(existing, key):
                if not trusted or _trusted_key_is_limited(existing, key, prefix):
                    os.chmod(auth_path, 0o600)
                    return "ALREADY_PRESENT"
                raise FileExistsError("matching trusted key lacks Jellyfin restrictions")
            if not trusted:
                raise FileExistsError("authorized_keys already contains another key")

            line = prefix + key + b" jellyfin-desktop\n"
            append_fd = os.open(auth_path, os.O_WRONLY | os.O_APPEND | getattr(os, "O_NOFOLLOW", 0))
            try:
                current = os.fstat(append_fd)
                if not stat.S_ISREG(current.st_mode) or current.st_uid != uid or current.st_gid != gid:
                    raise PermissionError("unsafe authorized_keys file")
                os.fchmod(append_fd, 0o600)
                if existing and not existing.endswith(b"\n"):
                    os.write(append_fd, b"\n")
                os.write(append_fd, line)
                os.fsync(append_fd)
            finally:
                os.close(append_fd)
            return "INSTALLED"

        line = (prefix if trusted else b"") + key + (b" jellyfin-desktop\n" if trusted else b" jellyfin-android\n")
        fd, temp_path = tempfile.mkstemp(prefix=".authorized_keys.", dir=ssh_dir)
        try:
            os.fchmod(fd, 0o600)
            os.fchown(fd, uid, gid)
            with os.fdopen(fd, "wb") as output:
                output.write(line)
                output.flush()
                os.fsync(output.fileno())
            os.link(temp_path, auth_path)
            directory_fd = os.open(ssh_dir, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
            return "INSTALLED"
        finally:
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass
    finally:
        os.close(lock_fd)


def main(home=None, uid=None, gid=None, environ=None, stdin=None, argv=None):
    env = os.environ if environ is None else environ
    args = sys.argv[1:] if argv is None else argv
    if args not in ([], ["--trusted"], ["--trusted-ipv6"]):
        _response("ERROR", "INVALID_MODE")
        return 2
    trusted = args in (["--trusted"], ["--trusted-ipv6"])
    ipv6 = args == ["--trusted-ipv6"]
    original = env.get("SSH_ORIGINAL_COMMAND", "")
    # A ForceCommand invocation defaults to restricted mode. Accepting the
    # desktop's explicit request is safe because ForceCommand still overrides
    # it and this mode is selected by the server-invoked helper arguments.
    if original and original not in (TRUSTED_COMMAND, IPV6_COMMAND):
        _response("ERROR", "COMMAND_NOT_ALLOWED")
        return 2
    if home is None:
        account = pwd.getpwuid(os.getuid())
        home, uid, gid = account.pw_dir, account.pw_uid, account.pw_gid
    try:
        key = _read_key(sys.stdin.buffer if stdin is None else stdin)
        result = enroll(home, key, uid, gid, trusted, ipv6)
        _response("OK", result)
        return 0
    except FileExistsError:
        _response("ERROR", "EXISTING_KEY_REQUIRES_ADMIN")
    except (ValueError, PermissionError, OSError):
        _response("ERROR", "INVALID_OR_UNSAFE_STATE")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
