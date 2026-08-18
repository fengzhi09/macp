# macp

**多智能体控制台**（mobile acp & multi acp）——手机说一句话，主机的 agent 把活干完。MQTT 之上的四端系统：手机 App（Android/iOS/鸿蒙）、主机端（开源）、云服务端（归因引擎）、算力端（本地 GPU 推理）。

[![License: PolyForm NC](https://img.shields.io/badge/License-PolyForm--NC%201.0.0-blue.svg)](./LICENSE)

## 系统组成

| 组件 | 说明 | 状态 |
|---|---|---|
| **macp-host（本仓库）** | 开源主机端守护进程：MQTT 隧道对端 + agent 桥接 + ams 文件提供 + 感知上报 | ✅ 本仓库 |
| **macp-cli** | 开源主机端 CLI：tmux 式多项目会话 + dsh 式万物皆插件的命令行工具 | ✅ [已开源](https://github.com/fengzhi09/macp-cli) |
| 手机 App | React Native：扫码绑定 / 发消息 / 任务归因 / WebDAV 网盘 / 账单 | Android APK 已交付；iOS/鸿蒙(PWA) 就绪 |
| 云服务端 | Fastify + EMQX：账号/设备/归因/配额计费/挖掘/经验检索 | 运行中（暂不开源） |
| 算力端 | 本地 DGX Spark + Qwen3.8-27B-NVFP4（vLLM）：归因/打标/命名/脱敏 | 运行中（暂不开源） |

## 核心链路

```
手机发消息 → 服务端归因引擎（本地 27B 模型）
  → 决定：继续哪个任务 / 用哪个 agent / 什么模型
  → MQTT 隧道到主机 daemon → kimi code cli / pi / deepseek harness 执行
  → 轨迹脱敏沉淀为经验 → 下次任务自动注入，越用越快
```

- **归因引擎**：3-5 秒异步决定 agent/模型/任务命名/5W2H 标签/待办更新
- **MQTT 隧道**：SSH / WebDAV / 交互终端；大文件同网段 302 直连零带宽
- **经验反哺**：轨迹授权分级（L0/L1/L2）脱敏后挖掘为可复用经验，MCP 检索注入

## 本仓库：macp-host 主机端守护进程

运行在你的电脑上，职责：

- **配对绑定**：`macp-host pair` 生成配对码/二维码，手机 App 扫码授权后建立设备绑定
- **隧道对端**：通过 MQTT 与手机 App 建立多路复用隧道（帧协议 + 滑动窗口 + 断点续传），转发 App 流量到本机 agent
- **ams 文件提供**：`ams://` 地址空间下的文件读取/写回（冲突检测），同网段大文件直连（HMAC 一次性令牌 + 时效）
- **感知上报**：扫描本机 agent（kimi code cli / pi / dsh 等，缺失自动安装）并上报（key 只发指纹）

```
host/             守护进程（Node.js ≥20，ESM）
  bin/macp-host.js   统一 CLI：pair | daemon | status | install-service
  src/               pair / daemon / files / report / install / util
  scripts/           注册系统服务（systemd / launchd / 计划任务）
packages/tunnel/  共享隧道库 @acp/tunnel（帧格式 / 滑动窗口 / 背压 / 断点续传）
```

### 从源码运行

```bash
git clone https://github.com/fengzhi09/macp.git
cd macp/host
npm install        # 会联动安装 ../packages/tunnel
npm link           # 得到全局 macp-host 命令

macp-host pair             # 出二维码，手机 App 扫码绑定
macp-host daemon           # 启动守护进程（隧道 + agent 桥接）
macp-host status           # 查看绑定状态
macp-host install-service  # 注册为系统服务
```

### 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `SERVER_URL` | 服务端 HTTP 地址 | `http://your-macp-server.example.com:11000` |
| `ACP_MQTT_URL` / `MQTT_URL` | MQTT broker 地址 | `mqtt://your-macp-server.example.com:11200` |
| `ACP_SHARE_ROOT` | ams 白名单根目录（只暴露该目录下文件） | `~/acp-share` |

### 测试

```bash
cd host && npm test
cd packages/tunnel && npm test
```

## 在线入口

- 官网（落地页 + 注册 + 下载）：http://120.48.37.218:11000/
- 用户控制台：http://120.48.37.218:11000/console
- 开源主机端 CLI（多项目管理）：https://github.com/fengzhi09/macp-cli

## License

本仓库（macp-host 守护进程与 @acp/tunnel）以 [PolyForm Noncommercial License 1.0.0](./LICENSE) 开源：**个人学习、研究、非商业用途可自由使用与修改；商业使用需另行获得作者授权。**

macp-cli 以 MIT 开源（见 [macp-cli/LICENSE](https://github.com/fengzhi09/macp-cli/blob/main/LICENSE)）。
