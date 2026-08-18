// 跨平台服务注册：systemd（Linux 用户级）/ launchd（macOS）/ schtasks（Windows）
// 由 install.sh / install.ps1 或 macp-host install-service 调用
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOST_DIR = join(__dirname, '..');
const OS = platform();
const NODE = process.execPath;
const DAEMON = join(HOST_DIR, 'src', 'daemon.js');

function linuxSystemd() {
  const unitDir = join(homedir(), '.config', 'systemd', 'user');
  mkdirSync(unitDir, { recursive: true });
  const unit = `[Unit]
Description=macp-host daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=${HOST_DIR}
ExecStart=${NODE} ${DAEMON}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
`;
  writeFileSync(join(unitDir, 'macp-host.service'), unit);
  execFileSync('systemctl', ['--user', 'daemon-reload']);
  execFileSync('systemctl', ['--user', 'enable', '--now', 'macp-host']);
  console.log('==> systemd 用户服务已注册并启动: macp-host.service');
}

function macLaunchd() {
  const dir = join(homedir(), 'Library', 'LaunchAgents');
  mkdirSync(dir, { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.macp.host</string>
  <key>ProgramArguments</key>
  <array><string>${NODE}</string><string>${DAEMON}</string></array>
  <key>WorkingDirectory</key><string>${HOST_DIR}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${join(homedir(), '.macp-host', 'daemon.log')}</string>
  <key>StandardErrorPath</key><string>${join(homedir(), '.macp-host', 'daemon.log')}</string>
</dict></plist>
`;
  const file = join(dir, 'com.macp.host.plist');
  writeFileSync(file, plist);
  execFileSync('launchctl', ['unload', file], { stdio: 'ignore' });
  execFileSync('launchctl', ['load', file]);
  console.log('==> launchd 服务已注册并启动: com.macp.host');
}

function winSchtasks() {
  const cmd = `schtasks /Create /TN "macp-host" /SC ONLOGON /RL LIMITED /F /TR "\"${NODE}\" \"${DAEMON}\""`;
  execFileSync('cmd.exe', ['/c', cmd]);
  execFileSync('cmd.exe', ['/c', 'schtasks /Run /TN "macp-host"']);
  console.log('==> Windows 计划任务已注册并启动: macp-host（登录时自启）');
}

switch (OS) {
  case 'linux': linuxSystemd(); break;
  case 'darwin': macLaunchd(); break;
  case 'win32': winSchtasks(); break;
  default: console.error(`不支持的平台: ${OS}`); process.exit(1);
}
