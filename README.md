# macp

**多智能体控制台**（mobile acp & multi acp）——手机说一句话，主机的 agent 把活干完。MQTT 之上的四端系统：手机 App（Android/iOS/鸿蒙）、主机端（开源 CLI）、云服务端（归因引擎）、算力端（本地 GPU 推理）。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/fengzhi09/macp-cli/blob/main/LICENSE)

![架构图](http://120.48.37.218:11000/img/macp-arch.png)

## 系统组成

| 组件 | 说明 | 状态 |
|---|---|---|
| **macp-cli** | 开源主机端：tmux 式多项目会话 + dsh 式万物皆插件的 CLI | ✅ [已开源](https://github.com/fengzhi09/macp-cli) |
| 手机 App | React Native：扫码绑定 / 发消息 / 任务归因 / WebDAV 网盘 / 账单 | Android APK 已交付；iOS/鸿蒙(PWA) 就绪 |
| 云服务端 | Fastify + EMQX：账号/设备/归因/配额计费/挖掘/经验检索 | 运行中 |
| 算力端 | 本地 DGX Spark + Qwen3.8-27B-NVFP4（vLLM）：归因/打标/命名/脱敏 | 运行中 |

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
- **渐进披露**：消费者（落地页+控制台）/ 管理员（运营后台）/ 投资人（成本模型）各自只看到需要的

## 在线入口

- 官网（落地页 + 注册 + 下载）：http://120.48.37.218:11000/
- 用户控制台：http://120.48.37.218:11000/console
- 开源主机端 CLI：**https://github.com/fengzhi09/macp-cli**

## 主机端快速接入

```bash
# macOS / Ubuntu / Linux（x86_64 / arm64）
curl -fsSL http://120.48.37.218:11000/host/install.sh | bash

# Windows PowerShell
irm http://120.48.37.218:11000/host/install.ps1 | iex

# 然后
macp pair    # 出二维码，手机 App 扫码绑定
macp daemon  # 启动守护进程
```

## License

主机端 macp-cli 以 MIT 开源（见 [macp-cli/LICENSE](https://github.com/fengzhi09/macp-cli/blob/main/LICENSE)）。
