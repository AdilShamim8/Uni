#!/usr/bin/env bash
# Enter the imported OpenClaw workspace with the pinned package manager.
# Usage: ./scripts/openclaw-workspace.sh <command...>
# Example: ./scripts/openclaw-workspace.sh pnpm install --frozen-lockfile
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ROOT/engine/openclaw"

if [ ! -f "$ENGINE/package.json" ]; then
  echo "error: $ENGINE/package.json not found (import missing?)" >&2
  exit 1
fi

cd "$ENGINE"
exec "$@"
