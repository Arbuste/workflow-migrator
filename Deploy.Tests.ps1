# Standalone regression tests: no Pester, network calls or real deployments.
# Run: powershell -NoProfile -File .\Deploy.Tests.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$fixture = Join-Path $PSScriptRoot ('tmp_rovodev_deploy_' + [guid]::NewGuid().ToString('N'))
$global:tmp_rovodev_deployTest = @{
    calls = (New-Object 'System.Collections.Generic.List[string]')
    failTest = $false; failLint = $false; failDeploy = $false
}

function npm.cmd {
    $mock = $global:tmp_rovodev_deployTest
    $mock.calls.Add("npm $($args -join ' ')")
    $global:LASTEXITCODE = if ($mock.failTest) { 1 } else { 0 }
}
function forge.cmd {
    $mock = $global:tmp_rovodev_deployTest
    $mock.calls.Add("forge $($args -join ' ')")
    $isLint = $args[0] -eq 'lint'
    $global:LASTEXITCODE = if (($isLint -and $mock.failLint) -or (-not $isLint -and $mock.failDeploy)) { 1 } else { 0 }
}
function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "Assertion failed: $Message" }
}
function Run-Scenario([string]$Name, [scriptblock]$Body) {
    $global:tmp_rovodev_deployTest.calls.Clear()
    & $Body
    Write-Host "PASS: $Name"
}
function Assert-Failure([scriptblock]$Body) {
    $failed = $false
    try { & $Body } catch { $failed = $true }
    Assert-True $failed 'command must fail'
}

try {
    $null = New-Item -ItemType Directory -Path $fixture -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Deploy.ps1') -Destination $fixture
    Set-Content -LiteralPath (Join-Path $fixture 'manifest.yml') -Value 'test manifest'
    $deploy = Join-Path $fixture 'Deploy.ps1'
    $mock = $global:tmp_rovodev_deployTest

    Run-Scenario 'dry run has no side effects' {
        & $deploy -DryRun
        Assert-True ($mock.calls.Count -eq 0) 'no commands should run'
    }
    Run-Scenario 'build only validates without deployment' {
        & $deploy -BuildOnly
        Assert-True ($mock.calls.Count -eq 2) 'test and lint should run'
        Assert-True ($mock.calls[0] -eq 'npm test') 'tests should run first'
        Assert-True ($mock.calls[1] -eq 'forge lint') 'lint should run second'
    }
    Run-Scenario 'development deployment uses safe Forge flags' {
        & $deploy
        Assert-True ($mock.calls.Count -eq 3) 'test, lint and deploy should run'
        Assert-True ($mock.calls[2] -eq 'forge deploy --non-interactive --environment development') 'development target expected'
    }
    Run-Scenario 'explicit environment is retained' {
        & $deploy -Environment staging
        Assert-True ($mock.calls[2] -like '*--environment staging') 'staging target expected'
    }
    Run-Scenario 'test failure stops validation' {
        $mock.failTest = $true
        try { Assert-Failure { & $deploy } } finally { $mock.failTest = $false }
        Assert-True ($mock.calls.Count -eq 1) 'lint and deploy must not run'
    }
    Run-Scenario 'lint failure stops deployment' {
        $mock.failLint = $true
        try { Assert-Failure { & $deploy } } finally { $mock.failLint = $false }
        Assert-True ($mock.calls.Count -eq 2) 'deploy must not run'
    }
    Run-Scenario 'deployment failure propagates' {
        $mock.failDeploy = $true
        try { Assert-Failure { & $deploy } } finally { $mock.failDeploy = $false }
        Assert-True ($mock.calls.Count -eq 3) 'all expected commands should run'
    }
    Write-Host 'All 7 deployment script regression tests passed. No real deployment was performed.'
} finally {
    if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
    Remove-Variable -Name tmp_rovodev_deployTest -Scope Global
}
