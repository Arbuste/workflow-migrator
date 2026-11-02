<#
.SYNOPSIS
Validate the native UI Kit app, then deploy it with Forge.
.EXAMPLE
.\Deploy.ps1
.EXAMPLE
.\Deploy.ps1 -DryRun
.EXAMPLE
.\Deploy.ps1 -BuildOnly
.NOTES
Requires installed root dependencies and Forge CLI authentication.
Native UI Kit is bundled by Forge, so no separate frontend build is needed.
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]*$')]
    [string]$Environment = 'development',
    [switch]$ForceBuild,
    [switch]$BuildOnly,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    Write-Host "> $Command $($Arguments -join ' ')"
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE. Deployment stopped."
    }
}

Push-Location -LiteralPath $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath 'manifest.yml' -PathType Leaf)) {
        throw 'Run this script from a valid Forge app (manifest.yml is missing).'
    }

    # pwd establishes the exact app root used by every Forge command.
    Write-Host "App: $((pwd).Path)"
    Write-Host "Target environment: $Environment"
    if ($ForceBuild) {
        Write-Host 'ForceBuild is retained for compatibility; native UI Kit has no separate build cache.'
    }
    if ($DryRun) {
        Write-Host "Dry run: no tests, lint or deployment performed. BuildOnly=$BuildOnly"
        return
    }

    Invoke-Checked -Command 'npm.cmd' -Arguments @('test')
    Invoke-Checked -Command 'forge.cmd' -Arguments @('lint')

    if ($BuildOnly) {
        Write-Host 'Ready: tests and Forge lint succeeded. No deployment requested.'
    } else {
        Invoke-Checked -Command 'forge.cmd' -Arguments @('deploy', '--non-interactive', '--environment', $Environment)
        Write-Host "Deployment succeeded: $Environment."
    }
} finally {
    Pop-Location
}
