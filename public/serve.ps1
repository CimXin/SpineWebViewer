# 仅监听 127.0.0.1 的静态文件服务。不依赖 Python / Node，也不需要管理员权限。
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Split-Path -Parent $MyInvocation.MyCommand.Path)).Path
if (-not $root.EndsWith("\")) { $root = $root + "\" }

function Get-Mime([string]$path) {
    switch ([IO.Path]::GetExtension($path).ToLowerInvariant()) {
        ".html" { return "text/html; charset=utf-8" }
        ".js"   { return "text/javascript; charset=utf-8" }
        ".mjs"  { return "text/javascript; charset=utf-8" }
        ".css"  { return "text/css; charset=utf-8" }
        ".json" { return "application/json; charset=utf-8" }
        ".png"  { return "image/png" }
        ".jpg"  { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        ".gif"  { return "image/gif" }
        ".webp" { return "image/webp" }
        ".svg"  { return "image/svg+xml" }
        ".ico"  { return "image/x-icon" }
        ".txt"  { return "text/plain; charset=utf-8" }
        ".atlas" { return "text/plain; charset=utf-8" }
        ".map"  { return "application/json" }
        ".wasm" { return "application/wasm" }
        default { return "application/octet-stream" }
    }
}

function Find-Port([int]$start) {
    for ($p = $start; $p -lt ($start + 30); $p++) {
        $probe = New-Object System.Net.Sockets.TcpListener ([Net.IPAddress]::Loopback), $p
        try {
            $probe.Start()
            $probe.Stop()
            return $p
        } catch {
            try { $probe.Stop() } catch {}
        }
    }
    throw "找不到可用端口"
}

function Read-Headers($stream) {
    $ms = New-Object System.IO.MemoryStream
    $buf = New-Object byte[] 1
    while ($ms.Length -lt 16384) {
        $n = $stream.Read($buf, 0, 1)
        if ($n -le 0) { return $null }
        $ms.Write($buf, 0, 1)
        if ($ms.Length -ge 4) {
            $arr = $ms.ToArray()
            $i = $arr.Length - 4
            if ($arr[$i] -eq 13 -and $arr[$i+1] -eq 10 -and $arr[$i+2] -eq 13 -and $arr[$i+3] -eq 10) {
                return [Text.Encoding]::ASCII.GetString($arr)
            }
        }
    }
    return $null
}

function Write-Response($stream, [string]$status, [byte[]]$body, [string]$ctype, [string]$method) {
    $head = "HTTP/1.1 $status`r`nContent-Type: $ctype`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-cache`r`n`r`n"
    $headBytes = [Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($headBytes, 0, $headBytes.Length)
    if ($method -ne "HEAD") { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
}

$port = Find-Port 4173
$listener = New-Object System.Net.Sockets.TcpListener ([Net.IPAddress]::Loopback), $port
$listener.Start()
$url = "http://127.0.0.1:$port/"
Write-Host "Spine Web Viewer"
Write-Host $url
Write-Host "关闭此窗口即可停止服务。"
Start-Process $url

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $client.ReceiveTimeout = 8000
            $client.SendTimeout = 20000
            $stream = $client.GetStream()
            $header = Read-Headers $stream
            if (-not $header) { continue }
            $line = ($header -split "`r`n", 2)[0]
            if ($line -notmatch '^(GET|HEAD)\s+(\S+)\s+HTTP/') {
                Write-Response $stream "405 Method Not Allowed" ([byte[]]@()) "text/plain" "GET"
                continue
            }
            $method = $Matches[1]
            $pathOnly = (($Matches[2] -split '\?', 2)[0])
            $rel = [Uri]::UnescapeDataString($pathOnly)
            if ([string]::IsNullOrEmpty($rel) -or $rel -eq "/") { $rel = "/index.html" }
            $rel = $rel.TrimStart("/") -replace "/", [IO.Path]::DirectorySeparatorChar
            $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
            if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
                Write-Response $stream "403 Forbidden" ([Text.Encoding]::UTF8.GetBytes("403")) "text/plain; charset=utf-8" $method
            } elseif (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
                Write-Response $stream "404 Not Found" ([Text.Encoding]::UTF8.GetBytes("404")) "text/plain; charset=utf-8" $method
            } else {
                $bytes = [IO.File]::ReadAllBytes($full)
                Write-Response $stream "200 OK" $bytes (Get-Mime $full) $method
            }
        } catch {
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
