#!/usr/bin/env python3
"""Add a provider block + host mappings to suggestedModels.ts, then commit+push.

Usage: python3 add-model-set.py <ConstName> <commit-msg> <block-file> [--kind K] [--hosts h1,h2]
"""
import subprocess
import sys

path = 'frontend/src/features/settings/suggestedModels.ts'

const_name = sys.argv[1]
commit_msg = sys.argv[2]
block_file = sys.argv[3]
kind = None
if '--kind' in sys.argv:
    kind = sys.argv[sys.argv.index('--kind') + 1]
hosts = []
if '--hosts' in sys.argv:
    hosts = sys.argv[sys.argv.index('--hosts') + 1].split(',')

block = open(block_file).read().rstrip('\n')

src = open(path).read()
anchor = '/** Host-specific catalogs.'
assert anchor in src, 'anchor missing'
if block not in src:
    src = src.replace(anchor, block + '\n\n' + anchor, 1)

for host in hosts:
    entry = "  '{}': {},".format(host, const_name)
    if entry not in src:
        marker = '/** Fallbacks by provider kind'
        idx = src.index(marker)
        head, tail = src[:idx], src[idx:]
        brace = head.rstrip().rfind('}')
        assert brace != -1
        head = head[:brace] + entry + '\n' + head[brace:]
        src = head + tail

if kind:
    entry = '  {}: {},'.format(kind, const_name)
    marker = '}\n\n/**\n * Resolve suggestions'
    idx = src.index(marker)
    if entry not in src[:idx]:
        src = src[:idx] + entry + '\n' + src[idx:]

open(path, 'w').write(src)
print('added', const_name)
subprocess.run(['git', 'add', '-A'], check=True)
subprocess.run(['git', 'commit', '-m', commit_msg, '-q'], check=True)
r = subprocess.run(['git', 'push', 'origin', 'main'], capture_output=True, text=True, timeout=90)
print((r.stdout.strip() or r.stderr.strip())[-60:])
count = subprocess.run(['git', 'rev-list', '--count', 'HEAD'], capture_output=True, text=True)
print('COUNT:', count.stdout.strip())
