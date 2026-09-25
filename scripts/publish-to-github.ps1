# Create the first commit and push to GitHub (Windows PowerShell).
# Usage: .\scripts\publish-to-github.ps1 https://github.com/<you>/rewoo.git
param([Parameter(Mandatory = $true)][string]$Remote)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
git config core.longpaths true
git init -q
git add -A
git add -f engines   # keep files upstream force-added past their own .gitignore
git commit -q -m "ReWoo v0.2.0 — AI teammates with private memory (merges Paperclip, Hermes Agent, OpenClaw)"
git branch -M main
git remote remove origin 2>$null
git remote add origin $Remote
git push -u origin main
Write-Host "Pushed to $Remote"
