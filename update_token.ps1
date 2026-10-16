# Install a fresh Instagram token everywhere it is needed, without it ever being typed
# into a chat or a file by hand.
#
#   1. Meta app dashboard -> Instagram -> API setup with Instagram login ->
#      Generate token -> Copy
#   2. Right-click this file -> Run with PowerShell   (or: powershell -File update_token.ps1)
#
# Reads the token from the CLIPBOARD, checks it against graph.instagram.com, then writes
# it to .env (IG_ACCESS_TOKEN=) and the GitHub repo secret IG_ACCESS_TOKEN. Written 2026-09-29 after the token
# silently expired and three scheduled runs failed with code 190.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$tok = (Get-Clipboard | Out-String).Trim()
if ($tok.Length -lt 50 -or $tok -match '\s') { Write-Host "Clipboard does not look like a token. Copy it from the Meta dashboard first." -ForegroundColor Red; exit 1 }

try { $me = Invoke-RestMethod "https://graph.instagram.com/me?fields=user_id,username&access_token=$tok" }
catch { Write-Host "Instagram rejected that token: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
Write-Host "Token works for @$($me.username)" -ForegroundColor Green

$envPath = Join-Path $PSScriptRoot '.env'
$lines = Get-Content $envPath
$lines = $lines | ForEach-Object { if ($_ -match '^IG_ACCESS_TOKEN=') { "IG_ACCESS_TOKEN=$tok" } else { $_ } }
Set-Content -Path $envPath -Value $lines -Encoding ascii
Write-Host "Updated .env"

# gh must be signed in IN THIS WINDOW (first run on 2026-09-29 was not, printed "Updated"
# anyway, and the secret stayed stale) - so check the exit code of every gh call.
gh auth status *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "GitHub CLI is not signed in here. Run: gh auth login   then run this script again (the token is still on your clipboard)." -ForegroundColor Red; exit 1 }
$tok | gh secret set IG_ACCESS_TOKEN
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED to update the GitHub secret." -ForegroundColor Red; exit 1 }
Write-Host "Updated GitHub secret IG_ACCESS_TOKEN" -ForegroundColor Green
Set-Clipboard -Value ' '                     # do not leave the token sitting on the clipboard
# publish-cheat.yml has no workflow_dispatch (removed 2026-09-10 to save Actions minutes), so
# the proof is the next scheduled tick: gh run list --workflow publish-cheat.yml --limit 1
Write-Host "Done. The next scheduled 'Publish one Cheat' run will use the new token." -ForegroundColor Green
