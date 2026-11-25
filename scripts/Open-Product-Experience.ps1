[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'

if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'site/product-experience.html')) {
  $bundleRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
} else {
  $repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  $bundleRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'output/product-experience-offline'))
}

$entryPage = Join-Path $bundleRoot 'site/product-experience.html'
$serverScript = Join-Path $bundleRoot 'Start-Offline-Review.ps1'
if (-not (Test-Path -LiteralPath $entryPage -PathType Leaf) -or -not (Test-Path -LiteralPath $serverScript -PathType Leaf)) {
  throw 'The offline preview is missing. Run scripts/package-offline.ps1 once, then open this launcher again.'
}

$pageMarkup = Get-Content -LiteralPath $entryPage -Raw
$requiredAssets = @([regex]::Matches($pageMarkup, 'productExperience-[A-Za-z0-9_-]+\.(?:js|css)') | ForEach-Object { $_.Value } | Select-Object -Unique)
if ($requiredAssets.Count -lt 2) { throw 'The offline page is missing its built application and style references.' }

function Test-ProductExperienceServer {
  param([int]$CandidatePort)

  $candidateUrl = "http://127.0.0.1:$CandidatePort/product-experience.html"
  $response = $null
  $reader = $null
  try {
    $request = [System.Net.HttpWebRequest]::Create($candidateUrl)
    $request.Timeout = 700
    $request.ReadWriteTimeout = 700
    $response = $request.GetResponse()
    $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
    $content = $reader.ReadToEnd()
    $missingAssets = @($requiredAssets | Where-Object { -not $content.Contains($_) })
    return $content.Contains('<title>Product Experience') -and $missingAssets.Count -eq 0
  } catch {
    return $false
  } finally {
    if ($null -ne $reader) { $reader.Dispose() }
    if ($null -ne $response) { $response.Dispose() }
  }
}

function Test-PortAvailable {
  param([int]$CandidatePort)
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $CandidatePort)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($null -ne $listener) { $listener.Stop() }
  }
}

$selectedPort = $null
$lastCandidate = [Math]::Min(65535, $Port + 30)
for ($candidate = $Port; $candidate -le $lastCandidate; $candidate += 1) {
  if (Test-ProductExperienceServer $candidate) {
    $selectedPort = $candidate
    break
  }
  if (Test-PortAvailable $candidate) {
    $selectedPort = $candidate
    break
  }
}
if ($null -eq $selectedPort) { throw "No available local preview port was found between $Port and $lastCandidate." }

$url = "http://127.0.0.1:$selectedPort/product-experience.html"
if (-not (Test-ProductExperienceServer $selectedPort)) {
  $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Port {1}' -f $serverScript, $selectedPort
  Start-Process -FilePath $powershell -ArgumentList $arguments -WorkingDirectory $bundleRoot -WindowStyle Hidden | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 50; $attempt += 1) {
    Start-Sleep -Milliseconds 160
    if (Test-ProductExperienceServer $selectedPort) { $ready = $true; break }
  }
  if (-not $ready) { throw "The local preview could not start on port $selectedPort. Check whether that port is available." }
}

Start-Process -FilePath $url
