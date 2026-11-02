# Standalone regression tests: no Pester, network calls or real deployments.
# Run: powershell -NoProfile -File .\Deploy.Tests.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$fixture = Join-Path $PSScriptRoot ('tmp_rovodev_deploy_' + [guid]::NewGuid().ToString('N'))
$frontend = Join-Path $fixture 'static/workflow-migrator'
$global:tmp_rovodev_deployTest = @{
    calls = (New-Object 'System.Collections.Generic.List[string]')
    failTest = $false; failBuild = $false; failDeploy = $false; frontend = $frontend
}
$originalCI = [Environment]::GetEnvironmentVariable('CI', 'Process')

# Script invocation introduces a new script scope. A uniquely named global test
# state lets the command shims share state across that boundary; finally removes it.
function node { $global:LASTEXITCODE = 0; return 'v24.test' }
function npm.cmd {
    $mock = $global:tmp_rovodev_deployTest
    $mock.calls.Add(($args -join ' '))
    $isTest = $args -contains 'test'
    $global:LASTEXITCODE = 0
    if (($isTest -and $mock.failTest) -or (-not $isTest -and $mock.failBuild)) {
        $global:LASTEXITCODE = 1
        return
    }
    if (-not $isTest) {
        $null = New-Item -ItemType Directory -Path (Join-Path $mock.frontend 'build') -Force
        Set-Content -LiteralPath (Join-Path $mock.frontend 'build/index.html') -Value 'compiled html'
        Set-Content -LiteralPath (Join-Path $mock.frontend 'build/main.js') -Value 'compiled js'
    }
}
function forge.cmd {
    $mock = $global:tmp_rovodev_deployTest
    $mock.calls.Add("forge $($args -join ' ')")
    $global:LASTEXITCODE = 0
    if ($mock.failDeploy) { $global:LASTEXITCODE = 1 }
}
function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "Assertion failed: $Message" }
}
function Run-Scenario([string]$Name, [scriptblock]$Body) {
    $global:tmp_rovodev_deployTest.calls.Clear()
    & $Body
    Assert-True ([Environment]::GetEnvironmentVariable('CI', 'Process') -eq $originalCI) 'CI must be restored'
    Write-Host "PASS: $Name"
}
function Assert-Failure([scriptblock]$Body) {
    $failed = $false
    try { & $Body } catch { $failed = $true }
    Assert-True $failed 'command must fail'
}

try {
    $null = New-Item -ItemType Directory -Path (Join-Path $frontend 'src') -Force
    $null = New-Item -ItemType Directory -Path (Join-Path $fixture 'src') -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Deploy.ps1') -Destination $fixture
    Set-Content -LiteralPath (Join-Path $fixture 'manifest.yml') -Value 'test manifest'
    Set-Content -LiteralPath (Join-Path $frontend 'src/App.js') -Value 'initial source'
    Set-Content -LiteralPath (Join-Path $frontend 'package-lock.json') -Value '{}'
    $deploy = Join-Path $fixture 'Deploy.ps1'
    $cache = Join-Path $fixture '.forge/frontend-build-state.json'
    $mock = $global:tmp_rovodev_deployTest

    Run-Scenario 'dry run has no side effects' {
        & $deploy -DryRun
        Assert-True ($mock.calls.Count -eq 0) 'no external commands'
        Assert-True (-not (Test-Path $cache)) 'no cache created'
    }
    Run-Scenario 'first build tests and builds without deploying' {
        & $deploy -BuildOnly
        Assert-True ($mock.calls.Count -eq 2) 'tests and build only'
        Assert-True (Test-Path $cache) 'cache created'
    }
    Run-Scenario 'backend-only change reuses build and deploys development' {
        Set-Content -LiteralPath (Join-Path $fixture 'src/index.js') -Value 'backend change'
        & $deploy
        Assert-True ($mock.calls.Count -eq 1) 'no frontend commands'
        Assert-True ($mock.calls[0] -eq 'forge deploy --non-interactive --environment development') 'safe deploy command'
    }
    Run-Scenario 'frontend change rebuilds' {
        Set-Content -LiteralPath (Join-Path $frontend 'src/App.js') -Value 'changed source'
        & $deploy -BuildOnly
        Assert-True ($mock.calls.Count -eq 2) 'frontend rebuilt'
    }
    Run-Scenario 'dependency lock change rebuilds' {
        Set-Content -LiteralPath (Join-Path $frontend 'package-lock.json') -Value '{"changed":true}'
        & $deploy -BuildOnly
        Assert-True ($mock.calls.Count -eq 2) 'dependency changes detected'
    }
    Run-Scenario 'deleted source rebuilds' {
        Remove-Item -LiteralPath (Join-Path $frontend 'src/App.js')
        & $deploy -BuildOnly
        Assert-True ($mock.calls.Count -eq 2) 'source deletion detected'
    }
    Run-Scenario 'damaged generated file rebuilds' {
        Remove-Item -LiteralPath (Join-Path $frontend 'build/main.js')
        & $deploy -BuildOnly
        Assert-True ($mock.calls.Count -eq 2) 'missing output detected'
    }
    Run-Scenario 'missing build rebuilds' {
        Remove-Item -LiteralPath (Join-Path $frontend 'build') -Recurse
        & $deploy -BuildOnly
        Assert-True ($mock.calls.Count -eq 2) 'missing build detected'
    }
    Run-Scenario 'corrupt cache rebuilds' {
        Set-Content -LiteralPath $cache -Value 'not json'
        & $deploy -BuildOnly
        Assert-True ($mock.calls.Count -eq 2) 'invalid cache rejected'
    }
    Run-Scenario 'force build overrides cache' {
        & $deploy -ForceBuild -BuildOnly
        Assert-True ($mock.calls.Count -eq 2) 'force rebuild applied'
    }
    Run-Scenario 'test failure stops before build and deployment' {
        $mock.failTest = $true
        try { Assert-Failure { & $deploy -ForceBuild } } finally { $mock.failTest = $false }
        Assert-True ($mock.calls.Count -eq 1) 'only tests called'
        Assert-True (-not (Test-Path $cache)) 'cache invalidated'
    }
    Run-Scenario 'build failure stops before deployment' {
        $mock.failBuild = $true
        try { Assert-Failure { & $deploy } } finally { $mock.failBuild = $false }
        Assert-True ($mock.calls.Count -eq 2) 'only tests and build called'
        Assert-True (-not (Test-Path $cache)) 'failed build not cached'
    }
    Run-Scenario 'recovery after failure and explicit environment' {
        & $deploy -Environment staging
        Assert-True ($mock.calls.Count -eq 3) 'full pipeline retried'
        Assert-True ($mock.calls[2] -like '*--environment staging') 'explicit environment used'
    }
    Run-Scenario 'frontend environment changes invalidate the cache' {
        $previous = [Environment]::GetEnvironmentVariable('REACT_APP_DEPLOY_SCRIPT_TEST', 'Process')
        try {
            $env:REACT_APP_DEPLOY_SCRIPT_TEST = [guid]::NewGuid().ToString()
            & $deploy -BuildOnly
            Assert-True ($mock.calls.Count -eq 2) 'embedded environment change detected'
        } finally {
            [Environment]::SetEnvironmentVariable('REACT_APP_DEPLOY_SCRIPT_TEST', $previous, 'Process')
        }
        & $deploy -BuildOnly
    }
    Run-Scenario 'dependency directory is excluded from source fingerprint' {
        $null = New-Item -ItemType Directory -Path (Join-Path $frontend 'node_modules') -Force
        Set-Content -LiteralPath (Join-Path $frontend 'node_modules/test.txt') -Value 'ignored dependency file'
        & $deploy -BuildOnly
        Assert-True ($mock.calls.Count -eq 0) 'node_modules is not hashed'
    }
    Run-Scenario 'deployment failure propagates' {
        $mock.failDeploy = $true
        try { Assert-Failure { & $deploy } } finally { $mock.failDeploy = $false }
        Assert-True ($mock.calls.Count -eq 1) 'only deploy called'
    }
    Write-Host 'All 16 deployment script regression tests passed. No real deployment was performed.'
} finally {
    if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
    Remove-Variable -Name tmp_rovodev_deployTest -Scope Global
}
