import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('migration', Path(__file__).parents[1] / 'packaging/ubuntu/migrate-flatpak-data.py')
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)

class MigrationTests(unittest.TestCase):
    def test_copy_preserves_original_and_existing_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            source = home / '.var/app' / migration.LEGACY_ID / 'data/jellyfin-desktop'
            (source / 'ssh-tunnel').mkdir(parents=True)
            (source / 'ssh-tunnel/test-identity').write_text('synthetic test key; not a credential')
            (source / 'profiles.json').write_text('{"test":true}')
            (source / 'Cache').mkdir()
            (source / 'Cache/skip').write_text('cache')
            (source / 'symlink').symlink_to(source / 'profiles.json')
            data = home / 'data'
            self.assertTrue(migration.migrate(home, data, check_running=False))
            target = data / 'wallaby-popcorn'
            self.assertTrue((source / 'ssh-tunnel/test-identity').exists())
            self.assertEqual((target / 'profiles.json').read_text(), '{"test":true}')
            self.assertEqual((target / 'ssh-tunnel/test-identity').stat().st_mode & 0o777, 0o600)
            self.assertFalse((target / 'Cache').exists())
            self.assertFalse((target / 'symlink').exists())
            (target / 'profiles.json').write_text('new profile')
            self.assertFalse(migration.migrate(home, data, check_running=False))
            self.assertEqual((target / 'profiles.json').read_text(), 'new profile')

if __name__ == '__main__':
    unittest.main()
