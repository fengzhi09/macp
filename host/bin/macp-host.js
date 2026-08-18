#!/usr/bin/env node
// macp-host 统一 CLI（x86_64 macOS / Windows / Linux 通用）
// 用法: macp-host pair | daemon | report | status | install-service
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

const [cmd, ...rest] = process.argv.slice(2);

const credsPath = process.platform === 'win32'
  ? join(process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming'), 'macp-host', 'credentials.json')
  : join(process.env.HOME || '', '.acp-host', 'credentials.json');

function run(file, args = []) {
  const p = spawn(process.execPath, [join(SRC, file), ...args], { stdio: 'inherit', env: process.env });
  p.on('exit', (code) => process.exit(code ?? 0));
}

function status() {
  const os = `${platform()} ${process.arch}`;
  if (!existsSync(credsPath)) {
    console.log(`[macp-host] ${os} · 未绑定（执行 macp-host pair 扫码绑定）`);
    return;
  }
  const c = JSON.parse(readFileSync(credsPath, 'utf8'));
  console.log(`[macp-host] ${os} · 已绑定设备 ${c.did} (${c.hostname}) → ${c.mqttUrl}`);
}

switch (cmd) {
  case 'pair': run('pair.js', rest); break;
  case 'daemon': run('daemon.js', rest); break;
  case 'report': run('report-cli.js', rest); break;
  case 'status': status(); break;
  case 'install-service': run(join('..', 'scripts', 'register-service.js'), rest); break;
  default:
    console.log(`macp-host — 主机端守护进程（x86_64 macOS / Windows / Linux）

用法:
  macp-host pair              出二维码，手机 App 扫码绑定
  macp-host daemon            启动守护进程（隧道 + agent 桥接）
  macp-host status            查看绑定状态
  macp-host install-service   注册为系统服务（systemd / launchd / 计划任务）

环境变量:
  SERVER_URL   服务端地址（默认 http://your-macp-server.example.com:11000）
  MQTT_URL     MQTT 地址（默认 mqtt://your-macp-server.example.com:11200）
`);
    process.exit(cmd ? 1 : 0);
}
