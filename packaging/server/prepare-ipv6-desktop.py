#!/usr/bin/python3
"""Run on the server: install IPv6 enrollment mode and narrow ONE desktop key's forwarding."""
import argparse
import datetime
import os
from pathlib import Path
import pwd
import shutil
import tempfile


def restrict_key(data, public):
    fields = public.split()
    if len(fields) < 2 or fields[0] != b'ssh-ed25519':
        raise ValueError('Expected an Ed25519 public key')
    wanted = fields[1]
    result, found = [], 0
    for line in data.splitlines(keepends=True):
        tokens = line.split()
        matches = any(tokens[i] == b'ssh-ed25519' and tokens[i+1] == wanted for i in range(len(tokens)-1))
        if matches:
            found += 1
            if not line.startswith(b'restrict,port-forwarding,permitopen=') or b'command="/bin/false"' not in line:
                raise ValueError('Matching key has unexpected restrictions; refusing automatic editing')
            if b'permitopen="127.0.0.1:8096"' in line:
                line = line.replace(b'permitopen="127.0.0.1:8096"', b'permitopen="[::1]:8096"')
            elif b'permitopen="[::1]:8096"' not in line:
                raise ValueError('Matching key has an unexpected forwarding destination')
        result.append(line)
    if found != 1:
        raise ValueError('Expected exactly one matching desktop key')
    return b''.join(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--account', required=True)
    parser.add_argument('--public-key', required=True, type=Path)
    parser.add_argument('--apply', action='store_true', help='Apply after checking; otherwise dry run')
    args = parser.parse_args()
    account = pwd.getpwnam(args.account)
    target = Path(account.pw_dir)/'.ssh/authorized_keys'
    if target.is_symlink() or not target.is_file():
        raise ValueError('Unsafe or missing authorized_keys')
    previous = target.read_bytes()
    updated = restrict_key(previous, args.public_key.read_bytes())
    helper = Path('/usr/local/libexec/jellyfin-ssh-enrol.py')
    source = Path(__file__).with_name(helper.name)
    if not helper.is_file() or helper.is_symlink():
        raise ValueError('Unsafe or missing installed enrollment helper')
    if not args.apply:
        print('Dry run passed. One desktop key will permit only [::1]:8096; other keys and SSH listeners stay unchanged.')
        return
    if os.geteuid() != 0:
        raise PermissionError('Run --apply with sudo on the server')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = Path('/var/backups')/f'wallaby-desktop-ipv6-{stamp}'
    backup.mkdir(mode=0o700)
    shutil.copy2(helper, backup/'jellyfin-ssh-enrol.py')
    shutil.copy2(target, backup/'authorized_keys')
    # Preserve file ownership/permissions, and replace the key file atomically.
    fd, temp = tempfile.mkstemp(prefix='.wallaby-ipv6-', dir=target.parent)
    try:
        os.fchmod(fd, 0o600); os.fchown(fd, account.pw_uid, account.pw_gid)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(updated); stream.flush(); os.fsync(stream.fileno())
        if target.read_bytes() != previous:
            raise RuntimeError('authorized_keys changed during preparation; retry after enrollment completes')
        helper_fd, helper_temp = tempfile.mkstemp(prefix='.wallaby-enrol-', dir=helper.parent)
        try:
            os.fchmod(helper_fd, 0o755); os.fchown(helper_fd, 0, 0)
            with os.fdopen(helper_fd, 'wb') as stream:
                stream.write(source.read_bytes()); stream.flush(); os.fsync(stream.fileno())
            os.replace(helper_temp, helper)
        finally:
            if os.path.exists(helper_temp): os.unlink(helper_temp)
        os.replace(temp, target)
    finally:
        if os.path.exists(temp): os.unlink(temp)
    print(f'IPv6 desktop permission installed. Backups: {backup}. No SSH restart required.')


if __name__ == '__main__':
    main()
