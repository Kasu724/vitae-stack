[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$package = Get-Content -Raw (Join-Path $root "package.json") | ConvertFrom-Json
$name = "vitae-stack-personal-$($package.version)-windows-x64"
$destinationDirectory = Join-Path $root "dist"
$archive = Join-Path $destinationDirectory "$name.zip"
$checksum = "$archive.sha256"
$releaseBuild = Join-Path $root ".release"
# Keep staging at the drive root. Next's standalone dependency paths can exceed
# Windows' legacy path limit when nested below a repository or temp directory.
$stagingRoot = Join-Path ([IO.Path]::GetPathRoot($root)) "vts-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$staging = Join-Path $stagingRoot $name
$app = Join-Path $staging "app"
$runtime = Join-Path $staging "runtime"
$nodeVersion = "24.18.0"
$nodeName = "node-v$nodeVersion-win-x64"
$downloadCache = Join-Path $root "tmp\runtime-cache"
$nodeArchive = Join-Path $downloadCache "$nodeName.zip"
$nodeChecksums = Join-Path $downloadCache "SHASUMS256-$nodeVersion.txt"

function Invoke-Tool([string]$Executable, [string[]]$Arguments) {
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Executable failed." }
}

function Copy-ReleaseFile([string]$Relative, [string]$DestinationRoot) {
  $source = Join-Path $root $Relative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Release file is missing: $Relative" }
  $target = Join-Path $DestinationRoot $Relative
  New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
  Copy-Item -LiteralPath $source -Destination $target
}

function Remove-PathIfPresent([string]$Path) {
  $resolved = [IO.Path]::GetFullPath($Path)
  if (-not $resolved.StartsWith($stagingRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a path outside the package staging root: $Path"
  }
  $longPath = "\\?\$resolved"
  if (Test-Path -LiteralPath $longPath) {
    Remove-Item -LiteralPath $longPath -Recurse -Force
  }
}

function Copy-NodePackage([string]$Source, [string]$Destination) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
    $target = Join-Path $Destination $item.Name
    if ($item.PSIsContainer) {
      Copy-NodePackage $item.FullName $target
    } else {
      Copy-Item -LiteralPath $item.FullName -Destination $target -Force
    }
  }
}

function Flatten-PnpmVirtualStore([string]$NodeModulesRoot) {
  $virtualStore = Join-Path $NodeModulesRoot ".pnpm"
  if (-not (Test-Path -LiteralPath $virtualStore -PathType Container)) { return }

  foreach ($storeEntry in Get-ChildItem -LiteralPath $virtualStore -Directory) {
    $entryNodeModules = Join-Path $storeEntry.FullName "node_modules"
    if (-not (Test-Path -LiteralPath $entryNodeModules -PathType Container)) { continue }

    foreach ($package in Get-ChildItem -LiteralPath $entryNodeModules -Directory -Force) {
      if ($package.Name.StartsWith("@", [StringComparison]::Ordinal)) {
        foreach ($scopedPackage in Get-ChildItem -LiteralPath $package.FullName -Directory -Force) {
          Copy-NodePackage $scopedPackage.FullName (Join-Path (Join-Path $NodeModulesRoot $package.Name) $scopedPackage.Name)
        }
      } else {
        Copy-NodePackage $package.FullName (Join-Path $NodeModulesRoot $package.Name)
      }
    }
  }

  Remove-PathIfPresent $virtualStore
}

function Invoke-PnpmJson([string[]]$Arguments) {
  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($pnpm) {
    $output = & $pnpm.Source @Arguments
  } else {
    $corepackArguments = @("pnpm") + $Arguments
    $output = & corepack @corepackArguments
  }
  if ($LASTEXITCODE -ne 0) { throw "pnpm $($Arguments -join ' ') failed." }
  return (($output -join "`n") | ConvertFrom-Json)
}

function Copy-ProductionDependencyClosure([string]$NodeModulesRoot) {
  $packageTrees = Invoke-PnpmJson @("list", "--prod", "--depth", "Infinity", "--json")
  $dependencyPaths = [ordered]@{}

  function Add-DependencyNode($Node) {
    if ($Node.path) {
      $dependencyPath = [IO.Path]::GetFullPath([string]$Node.path)
      if (-not $dependencyPath.Equals($root, [StringComparison]::OrdinalIgnoreCase) -and
          (Test-Path -LiteralPath (Join-Path $dependencyPath "package.json") -PathType Leaf)) {
        $dependencyPaths[$dependencyPath] = $true
      }
    }

    $dependenciesProperty = $Node.PSObject.Properties["dependencies"]
    if (-not $dependenciesProperty -or -not $dependenciesProperty.Value) { return }
    foreach ($dependency in $dependenciesProperty.Value.PSObject.Properties) {
      Add-DependencyNode $dependency.Value
    }
  }

  foreach ($tree in $packageTrees) { Add-DependencyNode $tree }

  foreach ($dependencyPath in $dependencyPaths.Keys) {
    $manifest = Get-Content -Raw -LiteralPath (Join-Path $dependencyPath "package.json") | ConvertFrom-Json
    if (-not $manifest.name) { continue }
    $name = [string]$manifest.name
    if ($name.StartsWith("@", [StringComparison]::Ordinal)) {
      $parts = $name.Split("/", 2)
      Copy-NodePackage $dependencyPath (Join-Path (Join-Path $NodeModulesRoot $parts[0]) $parts[1])
    } else {
      Copy-NodePackage $dependencyPath (Join-Path $NodeModulesRoot $name)
    }
  }
}

try {
  New-Item -ItemType Directory -Force -Path $staging, $app, $runtime, $releaseBuild, $downloadCache | Out-Null

  Remove-Item -LiteralPath (Join-Path $root ".next\standalone") -Recurse -Force -ErrorAction SilentlyContinue
  Invoke-Tool (Join-Path $root "node_modules\.bin\next.cmd") @("build")
  Invoke-Tool (Join-Path $root "node_modules\.bin\esbuild.cmd") @(
    "scripts/parser-child.ts", "--bundle", "--platform=node", "--format=esm", "--packages=external", "--outfile=.release/parser-child.mjs"
  )
  Invoke-Tool (Join-Path $root "node_modules\.bin\esbuild.cmd") @(
    "scripts/local-migrate.ts", "--bundle", "--platform=node", "--format=esm", "--outfile=.release/local-migrate.mjs"
  )

  Copy-Item -Path (Join-Path $root ".next\standalone\*") -Destination $app -Recurse -Force
  # Copy-Item follows Next standalone's pnpm symlinks for top-level packages.
  # Flatten transitive packages before removing the virtual store so normal
  # PowerShell and Windows archive tools can extract the ZIP without long paths.
  Flatten-PnpmVirtualStore (Join-Path $app "node_modules")
  Copy-ProductionDependencyClosure (Join-Path $app "node_modules")
  New-Item -ItemType Directory -Force -Path (Join-Path $app ".next\static") | Out-Null
  Copy-Item -Path (Join-Path $root ".next\static\*") -Destination (Join-Path $app ".next\static") -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $root "assets") -Destination (Join-Path $app "assets") -Recurse
  Copy-Item -LiteralPath (Join-Path $root "db") -Destination (Join-Path $app "db") -Recurse
  Copy-Item -LiteralPath (Join-Path $releaseBuild "parser-child.mjs") -Destination $app
  Copy-Item -LiteralPath (Join-Path $releaseBuild "local-migrate.mjs") -Destination $app

  if (-not (Test-Path -LiteralPath $nodeArchive)) {
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$nodeVersion/$nodeName.zip" -OutFile $nodeArchive
  }
  Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$nodeVersion/SHASUMS256.txt" -OutFile $nodeChecksums
  $expectedLine = Get-Content -LiteralPath $nodeChecksums | Where-Object { $_ -match "\s+$([regex]::Escape($nodeName)).zip$" } | Select-Object -First 1
  if (-not $expectedLine) { throw "Node.js checksum record is missing." }
  $expectedHash = ($expectedLine -split '\s+')[0].ToLowerInvariant()
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $nodeArchive).Hash.ToLowerInvariant()
  if ($actualHash -ne $expectedHash) { throw "Node.js runtime checksum verification failed." }
  $nodeExtract = Join-Path $stagingRoot "node"
  Expand-Archive -LiteralPath $nodeArchive -DestinationPath $nodeExtract
  Copy-Item -LiteralPath (Join-Path $nodeExtract "$nodeName\node.exe") -Destination $runtime
  Copy-Item -LiteralPath (Join-Path $nodeExtract "$nodeName\LICENSE") -Destination (Join-Path $runtime "NODE_LICENSE")

  foreach ($relative in @(
    "Start Vitae Stack.cmd",
    "Stop Vitae Stack.cmd",
    "PERSONAL_README.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "scripts/personal/vitae.ps1",
    "scripts/personal/vitae.sh"
  )) { Copy-ReleaseFile $relative $staging }

  [IO.File]::WriteAllText(
    (Join-Path $staging "SOURCE.md"),
    "# Source code`n`nVitae Stack is licensed under AGPL-3.0-only. The corresponding source for version $($package.version) is published with the release and at https://github.com/Kasu724/vitae-stack.`n",
    [Text.UTF8Encoding]::new($false)
  )

  foreach ($relative in @(
    "runtime/node.exe",
    "app/server.js",
    "app/local-migrate.mjs",
    "app/parser-child.mjs",
    "app/db/migrations/0001_initial.sql",
    "Start Vitae Stack.cmd",
    "PERSONAL_README.md"
  )) {
    if (-not (Test-Path -LiteralPath (Join-Path $staging $relative) -PathType Leaf)) {
      throw "Release bundle is missing required file: $relative"
    }
  }

  foreach ($forbidden in @("app/.release", "app/dist", "app/tmp", "app/var", "app/.vitae-stack")) {
    if (Test-Path -LiteralPath (Join-Path $staging $forbidden)) {
      throw "Release bundle contains a forbidden local-data path: $forbidden"
    }
  }
  if (Test-Path -LiteralPath (Join-Path $staging "app\node_modules\.pnpm")) {
    throw "Release bundle contains the pnpm virtual store."
  }

  New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
  Remove-Item -LiteralPath $archive, $checksum -Force -ErrorAction SilentlyContinue
  Invoke-Tool "tar.exe" @("-a", "-c", "-f", $archive, "-C", $stagingRoot, $name)
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText($checksum, "$hash  $name.zip`n", [Text.UTF8Encoding]::new($false))
  Write-Host "Created $archive"
  Write-Host "Created $checksum"
} finally {
  $temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetPathRoot($root))
  $resolvedStagingRoot = [IO.Path]::GetFullPath($stagingRoot)
  if ($resolvedStagingRoot.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedStagingRoot -Leaf).StartsWith("vts-", [StringComparison]::Ordinal)) {
    Remove-Item -LiteralPath $resolvedStagingRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
