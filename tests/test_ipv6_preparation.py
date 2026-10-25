import importlib.util
from pathlib import Path
import socket
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
def load(name, relative):
    spec=importlib.util.spec_from_file_location(name,ROOT/relative)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

class PreparationTests(unittest.TestCase):
    def test_key_migration_changes_only_the_desktop_destination(self):
        tool=load('server_prepare','packaging/server/prepare-ipv6-desktop.py')
        prefix=b'restrict,port-forwarding,permitopen="127.0.0.1:8096",command="/bin/false" '
        desktop=prefix+b'ssh-ed25519 AAAADESKTOP desktop\n'
        other=prefix+b'ssh-ed25519 AAAAPHONE phone\n'
        result=tool.restrict_key(desktop+other,b'ssh-ed25519 AAAADESKTOP desktop')
        self.assertEqual(result,desktop.replace(b'127.0.0.1:8096',b'[::1]:8096')+other)
        self.assertEqual(tool.restrict_key(result,b'ssh-ed25519 AAAADESKTOP'),result)
        with self.assertRaises(ValueError):tool.restrict_key(other,b'ssh-ed25519 AAAADESKTOP')
        with self.assertRaises(ValueError):tool.restrict_key(b'ssh-ed25519 AAAADESKTOP\n',b'ssh-ed25519 AAAADESKTOP')
    def test_launcher_denies_ipv4_without_affecting_test_runner(self):
        code=f'''import importlib.util,socket,errno
s=importlib.util.spec_from_file_location('guard',{str(ROOT/'packaging/ubuntu/ipv6-launcher.py')!r})
m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.restrict_ipv4()
try:
 socket.socket(socket.AF_INET,socket.SOCK_STREAM)
 raise AssertionError('IPv4 allowed')
except OSError as e:
 assert e.errno==errno.EAFNOSUPPORT,e
with socket.socket(socket.AF_INET6,socket.SOCK_STREAM) as s:s.bind(('::1',0))
'''
        subprocess.run([sys.executable,'-c',code],check=True)

if __name__=='__main__':unittest.main()
