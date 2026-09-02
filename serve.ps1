# Minimal static file server for local development.
# Windows ships with everything this needs — no Python or Node required.
#
#   powershell -ExecutionPolicy Bypass -File serve.ps1
#
# Then open http://localhost:8765

param(
  [string]$Root = $PSScriptRoot,
  [int]$Port = 8765
)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try {
  $listener.Start()
} catch {
  Write-Host "Could not listen on port $Port. Is something already using it?"
  exit 1
}

Write-Host "Serving $Root at http://localhost:$Port/  (Ctrl+C to stop)"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".md"   = "text/plain; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".png"  = "image/png"
}

$rootFull = [System.IO.Path]::GetFullPath($Root)

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }

    $reqFull = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))

    # Refuse anything that escapes the served directory.
    if (-not $reqFull.StartsWith($rootFull) -or -not (Test-Path $reqFull -PathType Leaf)) {
      $ctx.Response.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes("404 not found: $rel")
    } else {
      $ext = [System.IO.Path]::GetExtension($reqFull).ToLower()
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $ctx.Response.Headers.Add("Cache-Control", "no-store")
      $bytes = [System.IO.File]::ReadAllBytes($reqFull)
    }

    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.OutputStream.Close()
  } catch {
    Write-Host "error: $_"
  }
}
