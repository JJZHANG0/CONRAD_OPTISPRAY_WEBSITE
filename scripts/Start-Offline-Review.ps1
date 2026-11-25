[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 8765,
  [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'
$siteRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'site'))
$entryPage = Join-Path $siteRoot 'product-experience.html'
if (-not (Test-Path -LiteralPath $entryPage -PathType Leaf)) {
  throw 'The site folder is missing. Extract the complete offline package before starting it.'
}

$rootPrefix = $siteRoot.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
$mimeTypes = @{
  '.bin' = 'application/octet-stream'
  '.css' = 'text/css; charset=utf-8'
  '.gif' = 'image/gif'
  '.hdr' = 'application/octet-stream'
  '.html' = 'text/html; charset=utf-8'
  '.jpeg' = 'image/jpeg'
  '.jpg' = 'image/jpeg'
  '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.pdf' = 'application/pdf'
  '.png' = 'image/png'
  '.svg' = 'image/svg+xml'
  '.webp' = 'image/webp'
  '.woff' = 'font/woff'
  '.woff2' = 'font/woff2'
}

function Send-Response {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [string]$ContentType,
    [byte[]]$Body,
    [bool]$HeadOnly = $false
  )

  $headers = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.LongLength)`r`nConnection: close`r`nCache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if (-not $HeadOnly -and $Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
  $Stream.Flush()
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
try {
  $listener.Start()
  $url = "http://127.0.0.1:$Port/product-experience.html"
  Write-Host "Offline review is ready at $url" -ForegroundColor Green
  Write-Host 'The site is served from this folder and does not use the internet.'
  Write-Host 'Keep this window open while reviewing. Press Ctrl+C to stop the local server.'
  if ($OpenBrowser) { Start-Process $url }

  while ($listener.Server.IsBound) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }
      while ($null -ne ($header = $reader.ReadLine()) -and $header -ne '') { }

      $parts = $requestLine.Split(' ')
      $method = $parts[0].ToUpperInvariant()
      $requestTarget = if ($parts.Length -ge 2) { $parts[1] } else { '/' }
      $headOnly = $method -eq 'HEAD'
      if ($method -ne 'GET' -and -not $headOnly) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Method not allowed.')
        Send-Response $stream 405 'Method Not Allowed' 'text/plain; charset=utf-8' $body $false
        continue
      }

      $requestUri = [System.Uri]::new("http://127.0.0.1$requestTarget")
      $relativePath = [System.Uri]::UnescapeDataString($requestUri.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = 'index.html' }
      $filePath = [System.IO.Path]::GetFullPath((Join-Path $siteRoot $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)))

      if (-not $filePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden.')
        Send-Response $stream 403 'Forbidden' 'text/plain; charset=utf-8' $body $headOnly
        continue
      }
      if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Not found.')
        Send-Response $stream 404 'Not Found' 'text/plain; charset=utf-8' $body $headOnly
        continue
      }

      $body = [System.IO.File]::ReadAllBytes($filePath)
      $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
      $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }
      Send-Response $stream 200 'OK' $contentType $body $headOnly
    } catch {
      Write-Warning "Unable to serve a local request: $($_.Exception.Message)"
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
