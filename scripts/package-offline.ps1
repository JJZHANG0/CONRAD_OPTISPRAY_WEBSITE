[CmdletBinding()]
param([switch]$ArchiveOnly)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'output'))
$bundleRoot = [System.IO.Path]::GetFullPath((Join-Path $outputRoot 'product-experience-offline'))
$archivePath = [System.IO.Path]::GetFullPath((Join-Path $outputRoot 'product-experience-offline.zip'))
$outputPrefix = $outputRoot.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$buildRoot = [System.IO.Path]::GetFullPath((Join-Path $outputRoot ".product-experience-build-$stamp"))
$bundleStage = [System.IO.Path]::GetFullPath((Join-Path $outputRoot ".product-experience-package-$stamp"))
$archiveStage = [System.IO.Path]::GetFullPath((Join-Path $outputRoot ".product-experience-archive-$stamp.zip"))
$backupRoot = [System.IO.Path]::GetFullPath((Join-Path $outputRoot "previous-product-experience-offline-$stamp"))

foreach ($path in @($bundleRoot, $archivePath, $buildRoot, $bundleStage, $archiveStage, $backupRoot)) {
  if (-not $path.StartsWith($outputPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Offline package paths must remain inside the repository output folder: $path"
  }
  if ($path -in @($buildRoot, $bundleStage, $archiveStage, $backupRoot) -and (Test-Path -LiteralPath $path)) {
    throw "The unique offline packaging path already exists: $path"
  }
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
Push-Location $repoRoot
try {
  & npm run build -- --outDir $buildRoot
  if ($LASTEXITCODE -ne 0) { throw "Production build failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}

$launcherPath = Join-Path $PSScriptRoot 'Start-Offline-Review.ps1'
$openLauncherPath = Join-Path $PSScriptRoot 'Open-Product-Experience.ps1'
$openShortcutPath = Join-Path $repoRoot 'Open-Product-Experience.cmd'
$readmePath = Join-Path $PSScriptRoot 'OFFLINE-REVIEW-README.txt'
foreach ($requiredPath in @($buildRoot, $launcherPath, $openLauncherPath, $openShortcutPath, $readmePath)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Required offline package input is missing: $requiredPath" }
}

$siteRoot = Join-Path $bundleStage 'site'
New-Item -ItemType Directory -Path $siteRoot -Force | Out-Null
Copy-Item -Path (Join-Path $buildRoot '*') -Destination $siteRoot -Recurse -Force
Copy-Item -LiteralPath $launcherPath -Destination $bundleStage
Copy-Item -LiteralPath $openLauncherPath -Destination $bundleStage
Copy-Item -LiteralPath $openShortcutPath -Destination $bundleStage
Copy-Item -LiteralPath $readmePath -Destination $bundleStage

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($archiveStage, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  $bundlePrefix = $bundleStage.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
  foreach ($file in Get-ChildItem -LiteralPath $bundleStage -File -Recurse) {
    $entryName = $file.FullName.Substring($bundlePrefix.Length).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive,
      $file.FullName,
      $entryName,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $archive.Dispose()
}

if ($ArchiveOnly) {
  if (Test-Path -LiteralPath $archivePath) {
    New-Item -ItemType Directory -Path $backupRoot | Out-Null
    $backupArchive = Join-Path $backupRoot 'product-experience-offline.zip'
    [System.IO.File]::Replace($archiveStage, $archivePath, $backupArchive)
  } else {
    Move-Item -LiteralPath $archiveStage -Destination $archivePath
  }
} else {
  if ((Test-Path -LiteralPath $bundleRoot) -or (Test-Path -LiteralPath $archivePath)) {
    New-Item -ItemType Directory -Path $backupRoot | Out-Null
    if (Test-Path -LiteralPath $bundleRoot) {
      Move-Item -LiteralPath $bundleRoot -Destination (Join-Path $backupRoot 'product-experience-offline')
    }
    if (Test-Path -LiteralPath $archivePath) {
      Move-Item -LiteralPath $archivePath -Destination (Join-Path $backupRoot 'product-experience-offline.zip')
    }
    Write-Host 'Previous offline files were preserved at:' -ForegroundColor Yellow
    Write-Host $backupRoot
  }
  Move-Item -LiteralPath $bundleStage -Destination $bundleRoot
  Move-Item -LiteralPath $archiveStage -Destination $archivePath
}

foreach ($directory in @($buildRoot, $bundleStage)) {
  if ((Test-Path -LiteralPath $directory) -and
      (Resolve-Path -LiteralPath $directory).Path.StartsWith($outputPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $directory -Recurse -Force
  }
}

Write-Host 'Offline review package created:' -ForegroundColor Green
Write-Host $archivePath
Write-Host 'Extract the ZIP and double-click Open-Product-Experience.cmd to open the local preview.'
