#!/usr/bin/env python3
"""Copy legacy Flatpak profiles and app-owned keys once, without removing the old installation."""
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile

LEGACY_ID = 'org.jellyfin.JellyfinDesktopSSH'


def migrate(home=None, data_home=None, check_running=True):
    home = Path(home or Path.home())
    data_home = Path(data_home or os.environ.get('XDG_DATA_HOME', home / '.local/share'))
    target = data_home / 'wallaby-popcorn'
    source = home / '.var/app' / LEGACY_ID / 'data/jellyfin-desktop'
    if not source.is_dir() or target.exists():
        return False
    if check_running and shutil.which('flatpak'):
        result = subprocess.run(['flatpak', 'ps', '--columns=application'], capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise RuntimeError('Cannot check whether the old Flatpak is running. Close it before importing its data.')
        if LEGACY_ID in result.stdout.splitlines():
            raise RuntimeError('Close Jellyfin Desktop SSH before Wallaby Popcorn imports its saved data.')
    data_home.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='.wallaby-popcorn-import-', dir=data_home))
    try:
        for path in source.rglob('*'):
            relative = path.relative_to(source)
            if path.is_symlink() or any(part in {'logs', 'Cache', 'GPUCache', 'Code Cache'} or part.startswith('Singleton') for part in relative.parts):
                continue
            destination = temporary / relative
            if path.is_dir():
                destination.mkdir(parents=True, exist_ok=True, mode=0o700)
            elif path.is_file() and stat.S_ISREG(path.stat().st_mode):
                destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                shutil.copy2(path, destination)
                destination.chmod(0o600)
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return True


if __name__ == '__main__':
    try:
        if migrate():
            print('Wallaby Popcorn imported the existing Flatpak profiles and SSH identity. The original data is unchanged.')
    except (OSError, RuntimeError) as error:
        raise SystemExit(f'Wallaby Popcorn data import: {error}')
