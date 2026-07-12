[CmdletBinding()]
param(
  [ValidateSet("Start", "Stop", "Status", "Logs")]
  [string]$Action = "Start",
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$packagedApp = Join-Path $root "app\server.js"
$packagedNode = Join-Path $root "runtime\node.exe"
$dataDirectory = if ($env:VITAE_DATA_DIR) {
  [IO.Path]::GetFullPath($env:VITAE_DATA_DIR)
} elseif ($env:LOCALAPPDATA) {
  Join-Path $env:LOCALAPPDATA "Vitae Stack"
} else {
  Join-Path $HOME ".local\share\vitae-stack"
}
$databasePath = Join-Path $dataDirectory "vitae.sqlite"
$artifactRoot = Join-Path $dataDirectory "files"
$runtimeRoot = Join-Path $dataDirectory "runtime"
$settingsFile = Join-Path $dataDirectory "settings.env"
$processFile = Join-Path $runtimeRoot "server.json"
$stdoutLog = Join-Path $runtimeRoot "server.log"
$stderrLog = Join-Path $runtimeRoot "server-error.log"
$baseUrl = "http://127.0.0.1:3000"

function New-RandomBytes([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return $bytes
}

function Protect-LocalPath([string]$Path) {
  if ($env:OS -eq "Windows_NT") {
    & icacls.exe $Path /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)(M)" *> $null
    if ($LASTEXITCODE -ne 0) { throw "Could not restrict local data permissions." }
  }
}

function Initialize-LocalData {
  New-Item -ItemType Directory -Force -Path $dataDirectory, $artifactRoot, $runtimeRoot | Out-Null
  if (-not (Test-Path -LiteralPath $settingsFile)) {
    $key = [Convert]::ToBase64String((New-RandomBytes 32))
    $temporary = "$settingsFile.tmp"
    [IO.File]::WriteAllText($temporary, "CREDENTIAL_ENCRYPTION_KEY=$key`n", [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $settingsFile
  }
  Protect-LocalPath $dataDirectory
}

function Read-CredentialKey {
  $line = (Get-Content -LiteralPath $settingsFile | Where-Object { $_ -like "CREDENTIAL_ENCRYPTION_KEY=*" } | Select-Object -First 1)
  if (-not $line) { throw "The local credential key is missing." }
  $value = $line.Substring("CREDENTIAL_ENCRYPTION_KEY=".Length)
  $bytes = [Convert]::FromBase64String($value)
  if ($bytes.Length -ne 32) { throw "The local credential key is invalid." }
  return $value
}

function Get-NodeExecutable {
  if ($env:VITAE_NODE_EXECUTABLE) { return (Resolve-Path $env:VITAE_NODE_EXECUTABLE).Path }
  if (Test-Path -LiteralPath $packagedNode -PathType Leaf) { return $packagedNode }
  $command = Get-Command node -ErrorAction SilentlyContinue
  if (-not $command) { throw "Node.js 24.15 or newer is required for a source checkout." }
  $version = (& $command.Source -p "process.versions.node").Trim()
  if ([version]$version -lt [version]"24.15.0") { throw "Node.js 24.15 or newer is required; found $version." }
  return $command.Source
}

function Set-ApplicationEnvironment([string]$CredentialKey) {
  $migrationsPath = if (Test-Path -LiteralPath $packagedApp -PathType Leaf) {
    Join-Path $root "app\db\migrations"
  } else {
    Join-Path $root "db\migrations"
  }
  if (-not (Test-Path -LiteralPath $migrationsPath -PathType Container)) {
    throw "Database migrations are missing from $migrationsPath."
  }
  $env:NODE_ENV = "production"
  $env:HOSTNAME = "127.0.0.1"
  $env:PORT = "3000"
  $env:APP_BASE_URL = $baseUrl
  $env:APP_BIND_HOST = "127.0.0.1"
  $env:DATABASE_PATH = $databasePath
  $env:MIGRATIONS_PATH = $migrationsPath
  $env:ARTIFACT_STORAGE_ROOT = $artifactRoot
  $env:PARSER_QUEUE_ROOT = (Join-Path $runtimeRoot "parser-queue")
  $env:JOB_FETCH_QUEUE_ROOT = (Join-Path $runtimeRoot "fetch-queue")
  $env:PARSER_MODE = "inline"
  $env:JOB_FETCH_MODE = "inline"
  $env:CREDENTIAL_ENCRYPTION_KEY = $CredentialKey
  $env:CREDENTIAL_KEY_VERSION = "1"
  $env:TELEMETRY_ENABLED = "false"
  if (Test-Path -LiteralPath (Join-Path $root "app\parser-child.mjs")) {
    $env:PARSER_CHILD_PATH = (Join-Path $root "app\parser-child.mjs")
  } else {
    Remove-Item Env:PARSER_CHILD_PATH -ErrorAction SilentlyContinue
  }
}

function Get-ServerState {
  if (-not (Test-Path -LiteralPath $processFile)) { return $null }
  try { return Get-Content -Raw -LiteralPath $processFile | ConvertFrom-Json } catch { return $null }
}

function Get-RunningServer {
  $state = Get-ServerState
  if (-not $state -or -not $state.pid) { return $null }
  return Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue
}

function Wait-ForReady([Diagnostics.Process]$ServerProcess) {
  for ($attempt = 0; $attempt -lt 90; $attempt += 1) {
    if ($ServerProcess.HasExited) {
      $details = if (Test-Path -LiteralPath $stderrLog) { (Get-Content -Raw -LiteralPath $stderrLog) } else { "No error log was written." }
      throw "Vitae Stack exited during startup.`n$details"
    }
    if (Test-Path -LiteralPath $stdoutLog) {
      $startupLog = Get-Content -Raw -LiteralPath $stdoutLog
      if ($null -ne $startupLog -and $startupLog -match 'Ready in \d') { return }
    }
    Start-Sleep -Milliseconds 500
  }
  $details = @()
  foreach ($log in @($stdoutLog, $stderrLog)) {
    if (Test-Path -LiteralPath $log) {
      $content = Get-Content -Raw -LiteralPath $log
      if ($null -eq $content) { $content = "" }
      $details += "--- $log`n$($content.Trim())"
    }
  }
  throw "Vitae Stack did not become ready.`n$($details -join "`n")"
}

if ($Action -eq "Start") {
  Initialize-LocalData
  $node = Get-NodeExecutable
  Set-ApplicationEnvironment (Read-CredentialKey)
  if (Get-RunningServer) {
    Write-Host "Vitae Stack is already running at $baseUrl"
    if (-not $NoBrowser) { Start-Process $baseUrl }
    exit 0
  }
  Remove-Item -LiteralPath $processFile -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $packagedApp) {
    $migrationScript = Join-Path $root "app\local-migrate.mjs"
    & $node $migrationScript
    if ($LASTEXITCODE -ne 0) { throw "SQLite migration failed." }
    $applicationArguments = @($packagedApp)
    $workingDirectory = Join-Path $root "app"
  } else {
    & $node (Join-Path $root "node_modules\tsx\dist\cli.mjs") (Join-Path $root "scripts\local-migrate.ts")
    if ($LASTEXITCODE -ne 0) { throw "SQLite migration failed." }
    $applicationArguments = @((Join-Path $root "node_modules\next\dist\bin\next"), "start", "--hostname", "127.0.0.1", "--port", "3000")
    $workingDirectory = $root
  }
  $process = Start-Process -FilePath $node -ArgumentList $applicationArguments -WorkingDirectory $workingDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
  [IO.File]::WriteAllText($processFile, ((@{ pid = $process.Id; startedAt = [DateTime]::UtcNow.ToString("o"); executable = $node } | ConvertTo-Json -Compress) + "`n"), [Text.UTF8Encoding]::new($false))
  Wait-ForReady $process
  Write-Host "Vitae Stack is ready at $baseUrl"
  Write-Host "Your data is stored in $dataDirectory"
  if (-not $NoBrowser) { Start-Process $baseUrl }
} elseif ($Action -eq "Stop") {
  $process = Get-RunningServer
  if (-not $process) {
    Remove-Item -LiteralPath $processFile -Force -ErrorAction SilentlyContinue
    Write-Host "Vitae Stack is not running. Your local data remains in $dataDirectory"
    exit 0
  }
  Stop-Process -Id $process.Id -Force
  $process.WaitForExit()
  Remove-Item -LiteralPath $processFile -Force -ErrorAction SilentlyContinue
  Write-Host "Vitae Stack stopped. Your local data was preserved in $dataDirectory"
} elseif ($Action -eq "Status") {
  if (Get-RunningServer) { Write-Host "Vitae Stack is running at $baseUrl" } else { Write-Host "Vitae Stack is stopped." }
  Write-Host "Local data: $dataDirectory"
} else {
  foreach ($log in @($stdoutLog, $stderrLog)) {
    if (Test-Path -LiteralPath $log) {
      Write-Host "--- $log"
      Get-Content -LiteralPath $log -Tail 200
    }
  }
}
