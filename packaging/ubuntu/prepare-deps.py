#!/usr/bin/env python3
"""Extract already downloaded Ubuntu packages into an isolated development prefix. Never compiles."""
import argparse
from pathlib import Path
import subprocess
import tarfile
import io


def overlay_host(source, target):
    """Fill only missing paths; existing extracted development files win."""
    if not source.is_dir() or target.is_symlink():
        return
    target.mkdir(parents=True, exist_ok=True)
    for path in source.iterdir():
        destination = target / path.name
        if not destination.exists() and not destination.is_symlink():
            destination.symlink_to(path, target_is_directory=path.is_dir())
        elif path.is_dir() and not path.is_symlink() and destination.is_dir() and not destination.is_symlink():
            overlay_host(path, destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archives', type=Path)
    parser.add_argument('prefix', type=Path)
    args = parser.parse_args()
    archives, prefix = args.archives.resolve(), args.prefix.resolve()
    if prefix.exists():
        raise SystemExit('Use a new prefix. Extracting through an existing host overlay is deliberately refused.')
    packages = sorted(archives.glob('*.deb'))
    if not packages:
        raise SystemExit('No downloaded .deb dependencies found.')
    prefix.mkdir(parents=True)
    shlibs = []
    for package in packages:
        subprocess.run(['dpkg-deb', '-x', str(package), str(prefix)], check=True)
        control = subprocess.check_output(['dpkg-deb', '--ctrl-tarfile', str(package)])
        with tarfile.open(fileobj=io.BytesIO(control)) as archive:
            for member in archive.getmembers():
                if member.name.removeprefix('./') == 'shlibs':
                    shlibs.append(archive.extractfile(member).read().decode())
    (prefix / 'shlibs.local').write_text('\n'.join(shlibs))
    # Absolute paths are intentional: this prefix is used only on this build host, never packaged.
    overlay_host(Path('/usr'), prefix / 'usr')
    print(f'Prepared {len(packages)} dependency packages at {prefix}. No compilation or system installation performed.')


if __name__ == '__main__':
    main()
