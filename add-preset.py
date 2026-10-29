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
marker = "  { label: 'LM Studio (local)', kind: 'local', endpointUrl: 'http://localhost:1234/v1', freeTier: true },\n]"
assert marker in src, 'PRESETS closing marker missing'
if entry not in src:
    src = src.replace(
        marker,
        "  { label: 'LM Studio (local)', kind: 'local', endpointUrl: 'http://localhost:1234/v1', freeTier: true },\n"
        + entry
        + '\n]',
        1,
    )
open(path, 'w').write(src)
print('preset added')
subprocess.run(['git', 'add', '-A'], check=True)
subprocess.run(['git', 'commit', '-m', commit_msg, '-q'], check=True)
r = subprocess.run(['git', 'push', 'origin', 'main'], capture_output=True, text=True, timeout=90)
print((r.stdout.strip() or r.stderr.strip())[-60:])
count = subprocess.run(['git', 'rev-list', '--count', 'HEAD'], capture_output=True, text=True)
print('COUNT:', count.stdout.strip())
