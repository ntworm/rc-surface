# RC Surface data migrator — PowerShell wrapper
# Copies $env:LOCALAPPDATA\Ableton\Extensions Data\worm.ableton-rc-surface
# into worm.rc-surface without moving or overwriting.
# Usage: powershell -ExecutionPolicy Bypass -File Migrate-RC-Surface-Data.ps1

$ErrorActionPreference = "Stop"

$base = Join-Path $env:LOCALAPPDATA "Ableton\Extensions Data"
$src = Join-Path $base "worm.ableton-rc-surface"
$dst = Join-Path $base "worm.rc-surface"

if (-not (Test-Path $src)) {
    Write-Host "Source folder not found: $src"
    Write-Host "No migration needed."
    exit 0
}

if (-not (Test-Path $dst)) {
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
}

Write-Host "Migrating RC Surface data..."
Write-Host "  Source: $src"
Write-Host "  Dest:   $dst"
Write-Host ""

$copied = 0
$skipped = 0

Get-ChildItem -Path $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length).TrimStart('\', '/')
    $target = Join-Path $dst $rel
    $targetDir = Split-Path $target -Parent
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }
    if (Test-Path $target) {
        $script:skipped++
    } else {
        Copy-Item -Path $_.FullName -Destination $target -Force
        $script:copied++
    }
}

Write-Host ""
Write-Host "Done. Copied $copied file(s). Skipped $skipped existing file(s)."
