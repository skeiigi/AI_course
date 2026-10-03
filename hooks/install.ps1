# install.ps1 — установщик git-хуков из этой папки в указанный репозиторий.
# Использование:
#   pwsh ./install.ps1
#   pwsh ./install.ps1 -TargetRepo "D:\path\to\repo"

[CmdletBinding()]
param(
    [string]$TargetRepo = (Get-Location).Path,
    [switch]$WithHusky
)

$ErrorActionPreference = 'Stop'

$HooksSrcDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$GitDir      = Join-Path $TargetRepo '.git'

if (-not (Test-Path $GitDir)) {
    Write-Host "[install] '$TargetRepo' не является git-репозиторием (нет .git/)" -ForegroundColor Red
    exit 1
}

$HooksDstDir = Join-Path $GitDir 'hooks'
$SharedDst   = Join-Path $HooksDstDir 'shared'
New-Item -ItemType Directory -Force -Path $SharedDst | Out-Null

$hooks = @('pre-commit', 'commit-msg', 'pre-push', 'post-merge', 'post-checkout')
foreach ($h in $hooks) {
    $src = Join-Path $HooksSrcDir $h
    $dst = Join-Path $HooksDstDir $h
    if (-not (Test-Path $src)) {
        Write-Host "[install] не найден $src — пропускаю" -ForegroundColor Yellow
        continue
    }
    Copy-Item -Force -Path $src -Destination $dst
    Write-Host "[install] установлен $dst" -ForegroundColor Green
}

$srcShared = Join-Path $HooksSrcDir 'shared\git-helpers.sh'
$dstShared = Join-Path $SharedDst 'git-helpers.sh'
Copy-Item -Force -Path $srcShared -Destination $dstShared
Write-Host "[install] установлен $dstShared" -ForegroundColor Green

if ($WithHusky) {
    $HuskyDst = Join-Path $TargetRepo '.husky'
    New-Item -ItemType Directory -Force -Path $HuskyDst | Out-Null
    foreach ($f in 'pre-commit', 'commit-msg', 'pre-push') {
        $src = Join-Path $HooksSrcDir (Join-Path 'husky' $f)
        $dst = Join-Path $HuskyDst $f
        if (Test-Path $src) {
            Copy-Item -Force -Path $src -Destination $dst
            Write-Host "[install] установлен $dst (husky)" -ForegroundColor Green
        }
    }
    Write-Host "[install] не забудьте: npm i -D husky && npx husky install" -ForegroundColor Yellow
}

Write-Host "[install] готово. (На Windows Git for сам сделает файлы исполняемыми при первом вызове.)" -ForegroundColor Green