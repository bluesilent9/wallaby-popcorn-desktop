#!/usr/bin/python3
"""Deny IPv4 sockets for the installed desktop app and every child process."""
import ctypes
import errno
import os
import socket
import sys


def restrict_ipv4():
    # libseccomp is an Ubuntu runtime dependency; failure must never silently allow IPv4.
    lib = ctypes.CDLL('libseccomp.so.2', use_errno=True)
    class Comparison(ctypes.Structure):
        _fields_ = [('arg', ctypes.c_uint), ('op', ctypes.c_int),
                    ('datum_a', ctypes.c_uint64), ('datum_b', ctypes.c_uint64)]
    lib.seccomp_init.argtypes = [ctypes.c_uint32]
    lib.seccomp_init.restype = ctypes.c_void_p
    lib.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    lib.seccomp_syscall_resolve_name.restype = ctypes.c_int
    lib.seccomp_rule_add_array.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int,
                                         ctypes.c_uint, ctypes.POINTER(Comparison)]
    lib.seccomp_load.argtypes = [ctypes.c_void_p]
    lib.seccomp_release.argtypes = [ctypes.c_void_p]
    context = lib.seccomp_init(0x7fff0000)  # SCMP_ACT_ALLOW for unrelated operations.
    if not context:
        raise RuntimeError('Could not initialize the IPv6-only socket policy')
    try:
        syscall = lib.seccomp_syscall_resolve_name(b'socket')
        comparison = Comparison(0, 4, socket.AF_INET, 0)  # SCMP_CMP_EQ on socket domain.
        if syscall < 0 or lib.seccomp_rule_add_array(context, 0x50000 | errno.EAFNOSUPPORT,
                                                   syscall, 1, ctypes.byref(comparison)) != 0:
            raise RuntimeError('Could not create the IPv6-only socket policy')
        if lib.seccomp_load(context) != 0:
            raise RuntimeError('Could not activate the IPv6-only socket policy')
    finally:
        lib.seccomp_release(context)


def main():
    if len(sys.argv) < 2:
        raise RuntimeError('Missing application executable')
    # Never route a literal IPv6 connection through an environment-selected IPv4 proxy.
    for key in ('http_proxy', 'https_proxy', 'all_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY'):
        os.environ.pop(key, None)
    restrict_ipv4()
    os.execv(sys.argv[1], sys.argv[1:])


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError) as error:
        print(f'Wallaby Popcorn could not start with IPv6-only networking: {error}', file=sys.stderr)
        sys.exit(1)
