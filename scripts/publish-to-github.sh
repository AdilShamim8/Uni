#!/usr/bin/env bash
# Create the first commit and push to GitHub.
# Usage: scripts/publish-to-github.sh https://github.com/<you>/rewoo.git
set -euo pipefail
REMOTE="${1:?Usage: $0 <git-remote-url>}"
cd "$(dirname "$0")/.."
git init -q 2>/dev/null || true
git add -A
# The vendored engines keep their upstream .gitignore files, which hide ~90 files that
# upstream force-added. Force-add engines/ so the full source is preserved.
git add -f engines
git commit -q -m "ReWoo v0.2.0 — AI teammates with private memory (merges Paperclip, Hermes Agent, OpenClaw)"
git branch -M main
git remote add origin "$REMOTE" 2>/dev/null || git remote set-url origin "$REMOTE"
git push -u origin main
echo "✅ Pushed to $REMOTE"
