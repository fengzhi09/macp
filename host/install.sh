#!/usr/bin/env bash
# macp-host 一键安装（macOS / Ubuntu·Debian·其他 Linux, x86_64/arm64）
# 用法: curl -fsSL https://your-macp-server.example.com/host/install.sh | bash
#       （服务端部署地址可用环境变量 MACP_DOWNLOAD_BASE 覆盖）
set -euo pipefail

DOWNLOAD_BASE="${MACP_DOWNLOAD_BASE:-http://your-macp-server.example.com:11000}"

echo "==> macp-host 安装器（x86_64 $(uname -s)）"

ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ] && [ "$ARCH" != "amd64" ] && [ "$ARCH" != "arm64" ] && [ "$ARCH" != "aarch64" ]; then
  echo "错误: 仅支持 x86_64 与 arm64（当前 $ARCH）" >&2; exit 1
fi

# 1. Node.js 检测（≥20）
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 20 ]; then
  echo "==> 安装 Node.js 20"
  if [ "$(uname -s)" = "Darwin" ]; then
    command -v brew >/dev/null 2>&1 || { echo "请先安装 Homebrew: https://brew.sh" >&2; exit 1; }
    brew install node@20
  elif command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null
    sudo apt-get install -y -qq nodejs
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs
  else
    echo "请手动安装 Node.js ≥20: https://nodejs.org" >&2; exit 1
  fi
fi
echo "==> node $(node -v)"

# 2. 下载并安装 macp-host
INSTALL_DIR="${HOME}/.macp-host"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
echo "==> 拉取 macp-host 包"
curl -fsSL "$DOWNLOAD_BASE/host/macp-host.tar.gz" -o macp-host.tar.gz
tar xzf macp-host.tar.gz && rm macp-host.tar.gz
npm install --omit=dev --no-audit --no-fund 2>&1 | tail -1

# 3. 全局链接 CLI
sudo npm link 2>/dev/null || npm link
echo "==> CLI 就绪: $(command -v macp-host || echo "$INSTALL_DIR/bin/macp-host.js")"

# 4. 注册系统服务（可选）
read -r -p "注册为开机自启服务? [y/N] " yn </dev/tty || yn="n"
if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
  node "$INSTALL_DIR/scripts/register-service.js"
fi

echo ""
echo "==> 完成。下一步:"
echo "    macp-host pair     # 出二维码，手机 App 扫码绑定"
echo "    macp-host daemon   # 启动守护进程"
