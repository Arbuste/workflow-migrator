<#
.SYNOPSIS
Build the frontend only when necessary, then deploy the existing Forge app.
.EXAMPLE
.\Deploy.ps1
.EXAMPLE
.\Deploy.ps1 -DryRun
.EXAMPLE
.\Deploy.ps1 -ForceBuild -BuildOnly
.NOTES
Requires installed npm dependencies and Forge CLI authentication.
Does not install dependencies, commit, push, or install/upgrade the app on Jira.
The first run rebuilds because no trusted local fingerprint exists yet.
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
$frontend = Join-Path $PSScriptRoot 'static/workflow-migrator'
$build = Join-Path $frontend 'build'
$statePath = Join-Path $PSScriptRoot '.forge/frontend-build-state.json'

function Get-TreeFingerprint {
    param([string]$Root, [string[]]$ExcludedDirectories = @(), [string[]]$ExtraInputs = @())

    # Walk directories explicitly: do not descend into dependencies or generated
    # bundles, and refuse links to avoid accidentally hashing files outside the app.
    $entries = New-Object 'System.Collections.Generic.List[string]'
    $pending = New-Object 'System.Collections.Generic.Stack[string]'
    $pending.Push($Root)
    while ($pending.Count -gt 0) {
        foreach ($item in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            if ($item.PSIsContainer -and $item.Name -in $ExcludedDirectories) { continue }
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Linked file or directory is not supported in build inputs: $($item.FullName)"
            }
            if ($item.PSIsContainer) {
                $pending.Push($item.FullName)
            } else {
                $relative = $item.FullName.Substring($Root.Length).Replace('\', '/')
                $hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
                $entries.Add("$relative`:$hash")
            }
        }
    }
    # Paths as well as contents matter: deleting or renaming a file invalidates
    # the cache. Ordinal sorting is independent of the user's locale.
    $entries.AddRange($ExtraInputs)
    $entries.Sort([StringComparer]::Ordinal)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes([string]::Join("`n", $entries))
        return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '')
    } finally {
        $sha.Dispose()
    }
}

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    Write-Host "> $Command $($Arguments -join ' ')"
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE. Deployment stopped."
    }
}

Push-Location -LiteralPath $PSScriptRoot
$previousCI = [Environment]::GetEnvironmentVariable('CI', 'Process')
try {
    if (-not (Test-Path -LiteralPath 'manifest.yml' -PathType Leaf)) {
        throw 'Run this script from a valid Forge app (manifest.yml is missing).'
    }
    # pwd also establishes the exact app root used by Forge commands.
    Write-Host "App: $((pwd).Path)"
    Write-Host "Target environment: $Environment"
    $nodeVersion = & node --version
    if ($LASTEXITCODE -ne 0) { throw 'Unable to determine the Node.js version.' }

    # CRA embeds REACT_APP_* and selected other environment variables in its
    # bundle. File-based .env configuration is included by the directory hash.
    # Only the final digest is persisted, not potentially sensitive values.
    $inputs = @('fingerprint-version=1', "node=$nodeVersion", 'NODE_ENV=production', 'CI=true')
    $inputs += @(Get-ChildItem Env: | Where-Object {
        $_.Name -like 'REACT_APP_*' -or $_.Name -in @(
            'PUBLIC_URL', 'BUILD_PATH', 'GENERATE_SOURCEMAP', 'INLINE_RUNTIME_CHUNK',
            'IMAGE_INLINE_SIZE_LIMIT', 'DISABLE_ESLINT_PLUGIN', 'ESLINT_NO_DEV_ERRORS',
            'TSC_COMPILE_ON_ERROR', 'BROWSERSLIST', 'BROWSERSLIST_ENV',
            'BROWSERSLIST_CONFIG', 'NODE_OPTIONS'
        )
    } | ForEach-Object { "$($_.Name)=$($_.Value)" })
    if ($env:BUILD_PATH) {
        throw 'BUILD_PATH must be unset: manifest.yml expects static/workflow-migrator/build.'
    }
    $sourceHash = Get-TreeFingerprint -Root $frontend -ExcludedDirectories @('node_modules', 'build', 'coverage', '.git', '.forge') -ExtraInputs $inputs
    $state = $null
    if (Test-Path -LiteralPath $statePath -PathType Leaf) {
        try {
            $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
            if (-not $state.sourceHash -or -not $state.outputHash) { $state = $null }
        } catch {
            Write-Host 'Build cache is unreadable; a fresh build will be required.'
            $state = $null
        }
    }
    $reason = $null
    if ($ForceBuild) { $reason = 'forced rebuild' }
    elseif (-not (Test-Path -LiteralPath (Join-Path $build 'index.html') -PathType Leaf)) { $reason = 'missing build' }
    elseif ($null -eq $state) { $reason = 'no trusted build fingerprint' }
    elseif ($state.sourceHash -ne $sourceHash) { $reason = 'frontend inputs changed' }
    elseif ((Get-TreeFingerprint -Root $build) -ne $state.outputHash) { $reason = 'build files changed or missing' }

    if ($reason) { Write-Host "Frontend: rebuild required ($reason)." }
    else { Write-Host 'Frontend: unchanged; reusing the verified build.' }
    if ($DryRun) {
        Write-Host "Dry run: no tests, build, cache updates or deployment performed. BuildOnly=$BuildOnly"
        return
    }

    if ($reason) {
        # Invalidate the old marker BEFORE running commands. A failed build must
        # never leave an earlier fingerprint looking like a successful result.
        if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
        $env:CI = 'true'
        Invoke-Checked -Command 'npm.cmd' -Arguments @('--prefix', $frontend, 'test', '--', '--watchAll=false', '--runInBand')
        Invoke-Checked -Command 'npm.cmd' -Arguments @('--prefix', $frontend, 'run', 'build')
        if (-not (Test-Path -LiteralPath (Join-Path $build 'index.html') -PathType Leaf)) {
            throw 'Build command succeeded but build/index.html is missing.'
        }
        $afterHash = Get-TreeFingerprint -Root $frontend -ExcludedDirectories @('node_modules', 'build', 'coverage', '.git', '.forge') -ExtraInputs $inputs
        if ($afterHash -ne $sourceHash) { throw 'Frontend files changed during the build. Run the script again.' }
        $state = @{ sourceHash = $sourceHash; outputHash = (Get-TreeFingerprint -Root $build) }
        $null = New-Item -ItemType Directory -Path (Split-Path $statePath) -Force
        $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
        Write-Host 'Frontend tests and build succeeded; fingerprint saved locally.'
    }

    if ($BuildOnly) {
        Write-Host 'Ready: frontend build verified. No deployment requested.'
    } else {
        # Deploy already runs forge lint; do not duplicate it or bypass checks.
        Invoke-Checked -Command 'forge.cmd' -Arguments @('deploy', '--non-interactive', '--environment', $Environment)
        Write-Host "Deployment succeeded: $Environment. No Git commit or push performed."
    }
} finally {
    [Environment]::SetEnvironmentVariable('CI', $previousCI, 'Process')
    Pop-Location
}
