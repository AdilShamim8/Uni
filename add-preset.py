#!/usr/bin/env python3
"""Add one preset to the PRESETS array in ProvidersSection.tsx, commit + push.
Usage: python3 add-preset.py <commit-msg> <<preset-entry-lines>>
The preset entry (multi-line JS object) is read from the given file.
"""
import subprocess
import sys

path = 'frontend/src/features/settings/ProvidersSection.tsx'
commit_msg = sys.argv[1]
block_file = sys.argv[2]
entry = open(block_file).read().rstrip('\n')

src = open(path).read()
anchor_line = "  { label: 'LM Studio (local)', kind: 'local', endpointUrl: 'http://localhost:1234/v1', freeTier: true },"
assert anchor_line in src, 'PRESETS anchor missing'
if entry not in src:
    idx = src.index(anchor_line) + len(anchor_line)
    # find the closing bracket of the PRESETS array after the anchor
    close = src.index(']', idx)
    src = src[:close] + entry + '\n' + src[close:]
open(path, 'w').write(src)
print('preset added')
subprocess.run(['git', 'add', '-A'], check=True)
subprocess.run(['git', 'commit', '-m', commit_msg, '-q'], check=True)
r = subprocess.run(['git', 'push', 'origin', 'main'], capture_output=True, text=True, timeout=90)
print((r.stdout.strip() or r.stderr.strip())[-60:])
count = subprocess.run(['git', 'rev-list', '--count', 'HEAD'], capture_output=True, text=True)
print('COUNT:', count.stdout.strip())
