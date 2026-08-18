# macp-host Windows 安装器（x86_64/arm64, PowerShell 5.1+）
# 用法: irm https://your-macp-server.example.com/host/install.ps1 | iex
#       （服务端部署地址可用环境变量 MACP_DOWNLOAD_BASE 覆盖）
$ErrorActionPreference = 'Stop'
$base = if ($env:MACP_DOWNLOAD_BASE) { $env:MACP_DOWNLOAD_BASE } else { 'http://your-macp-server.example.com:11000' }
Write-Host "==> macp-host 安装器（Windows x86_64）"

if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -and $env:PROCESSOR_ARCHITECTURE -ne 'ARM64') {
  Write-Error "仅支持 x86_64 与 arm64（当前 $env:PROCESSOR_ARCHITECTURE）"; exit 1
}

# 1. Node.js 检测（≥20）
$nodeOk = $false
try {
  $v = (node -v) -replace 'v','' -split '\.' | Select-Object -First 1
  if ([int]$v -ge 20) { $nodeOk = $true }
} catch {}
if (-not $nodeOk) {
  Write-Host "==> 安装 Node.js 20（winget）"
  winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
}
Write-Host "==> node $(node -v)"

# 2. 下载并安装
$dir = Join-Path $env:APPDATA 'macp-host'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Set-Location $dir
Write-Host "==> 拉取 macp-host 包"
Invoke-WebRequest -Uri "$base/host/macp-host.tar.gz" -OutFile 'macp-host.tar.gz'
tar -xzf macp-host.tar.gz
Remove-Item macp-host.tar.gz
npm install --omit=dev --no-audit --no-fund | Select-Object -Last 1
npm link | Out-Null
Write-Host "==> CLI 就绪: macp-host"

# 3. 注册计划任务（可选）
$yn = Read-Host '注册为开机自启（计划任务）? [y/N]'
if ($yn -eq 'y' -or $yn -eq 'Y') {
  node (Join-Path $dir 'scripts\register-service.js')
}

Write-Host ""
Write-Host "==> 完成。下一步:"
Write-Host "    macp-host pair     # 出二维码，手机 App 扫码绑定"
Write-Host "    macp-host daemon   # 启动守护进程"
