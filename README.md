# dsh-harmonyos

DeepSeek Harness (dsh) 的 HarmonyOS 适配发行版 —— 让官方 dsh 在鸿蒙 PC(musl arm64 / 受限存储)上完整跑起来。

> **v0.7.0**: 基于官方 `@deepseek-ai/dsh` **0.1.3-alpha.2**, 运行时 **node26**(原生 zstd,
> 建议经 [Harmonybrew](https://atomgit.com/Harmonybrew) 安装)。koffi/node-pty 为 **鸿蒙 PC 预编译**
> (prebuilt/, hmsign-release AGC 签名, 全局可信), sharp 走 **wasm32**(无原生 dlopen 依赖)。
> **真实 Agent 全链路已跑通**(deepseek-v4-flash → 思考 → bash/文件工具 → 交付, headless 与 web 均实测)。
> License: MIT。

## 环境要求

- **node >= 22.16**(带原生 zstd), 强烈推荐 **node26**。
- **鸿蒙 PC 建议直接用 [Harmonybrew](https://atomgit.com/Harmonybrew) 安装 node**(默认 `node` 即 **26**):
  ```sh
  brew install node        # 默认即 node 26
  node --version           # v26.x
  ```
  然后配置环境变量(未配置 `dsh-ohos` 会直接报错):
  ```sh
  # ~/.zshrc
  export NODE_OHOS="$(brew --prefix)/opt/node/bin/node"
  ```
- 官方 dsh 及其依赖由 npm 拉取(`@deepseek-ai/dsh` 0.1.3-alpha.2)。

## 安装与启动

```sh
# 安装(带 --ignore-scripts: 原生包 install 脚本在鸿蒙必失败, 由首启自愈接管)
npm i -g dsh-harmonyos --ignore-scripts

# 启动 web UI
dsh-ohos                    # → http://127.0.0.1:3080 (token 见启动日志; 回环直开免 token)

# 或跑一次 headless 任务(真实 agent 全循环)
dsh-ohos -- --profile headless --patch "$(npm root -g)/dsh-harmonyos/overlays/harmonyos.patch.yml" "你的任务描述"

# 透传/换端口
dsh-ohos -- --port 3081
```

升级:
```sh
npm i -g dsh-harmonyos@latest --ignore-scripts
```

> 首次启动自愈: patch(源码补丁) + prune + prebuilt 铺位(koffi/node-pty, AGC 签名) +
> sharp wasm32 后端确认 + seed 权限默认(danger-full-access)。升级/重装后 marker 版本不一致会自动重跑。

## 适配机制

| 层 | 机制 | 说明 |
|---|---|---|
| 平台归一 | `compat/register.mjs` | `process.platform` 归一为 `linux`(module.register 引导)。鸿蒙 node 上报 `openharmony`, 会让按平台分发的包匹配失败 |
| 启动器 | `bin/dsh-ohos.js` | 读 `NODE_OHOS`(强制); 首启自愈; 注入 `DSH_OHOS_FORCE_DANGER=1`(默认非沙箱); seed `permission.defaultPreset=danger-full-access`; 固定 `--expose-internals --experimental-sqlite --import compat/register.mjs`; 受限沙箱自动 `--jitless` |
| compat loader | `compat/compat-loader.mjs` | 模块重定向: `node:zlib`/`node:module`(原生优先, 旧 node 回退 shim)、`fs-ext`(flock stub)、`koffi`(默认走真构建; `DSH_OHOS_KOFFI=shim` 退回 stub)、sharp 不拦截(wasm32 后端) |
| 源码补丁 | `lib/patch.mjs` | 幂等打官方包: 硬链接 EPERM→rename、chmod 600 属主检查跳过、回环免 token、settings 旧 API 垫片、**sandbox-policy 默认 mode=danger**、**fs-search 支持 DSH_RG_PATH**。**npm 11 嵌套布局多实例全部补丁并逐一校验** |
| profile 层 | `overlays/harmonyos.patch.yml` + `lib/prune.mjs` | overlay **启用** subprocess/sandbox/bash-sandbox/open-in-app/**tool-fs-search**(走 DSH_RG_PATH); prune 仅移除 pwsh-sandbox |
| 预编译 | `prebuilt/` | koffi-3.2.1 / node-pty-1.2.0-beta.15(linux-arm64-musl, N-API) + **rg**(ripgrep, musl) — 均 **hmsign-release AGC 签名** → 免编译免工具链; 版本不匹配自动回退源码编译 |

补丁锚点为精确代码片段, 失配即**报错拒绝**(绝不静默打错)。

## 功能状态(实测)

| 能力 | 状态 |
|---|---|
| Web UI / 会话 | ✅ |
| **Agent 全循环**(模型→bash→文件→交付) | ✅ 实测(headless + web), 默认 deepseek-official / deepseek-v4-flash |
| 终端 / 子进程(node-pty + koffi, 预编译 AGC) | ✅ |
| 图片附件 / 读图(sharp **wasm32**) | ✅ 实测 decode/resize/encode |
| bash / shell 工具 | ✅ 非沙箱直跑(danger-full-access) |
| OS 级沙箱隔离 | ❌ OHOS 无后端(非 linux 内核能力) → 默认 danger 直跑, 等同本机其它 agent |
| 全局搜索 glob/grep(ripgrep) | ✅ v0.7 恢复: fs-search 走 `DSH_RG_PATH` → 预编译 musl rg(AGC 签名, prebuilt/rg), danger 下实测正常 |

## 配 API key

`~/.dsh/.credentials.yaml`:
```yaml
DEEPSEEK_API_KEY: sk-...
```

默认模型在 `~/.dsh/settings.yaml`:
```yaml
agent-default-model:
  provider: deepseek-official
  model: deepseek-v4-flash   # deepseek-chat 已弃用
```

## 开发模式(git clone + npm link)

```sh
git clone https://github.com/ystyle/dsh-harmonyos && cd dsh-harmonyos
npm install && npm link && dsh-ohos
```
> ⚠️ 开发模式下**不要**再用 `npm i -g dsh-harmonyos` 覆盖软链; 仓库内升级走
> `npm install && npm run patch && npm run prune` 后重启。

## 已知取舍

- 无 OS 沙箱: 默认 danger-full-access 非沙箱执行(个人设备语义, 同 Claude Code/pi 本机行为)
- 预编译 rg 的 exec 在受限 pi 沙箱内可能被白名单拒(本沙箱只认受信 inode), 真机无此限制; 可用 `DSH_RG_PATH` 指向本机受信 rg
- 预编译覆盖 koffi 3.2.1 / node-pty 1.2.0-beta.15 / rg(musl ripgrep); 升级需配套新 prebuilt 或走源码编译回退
- prebuilt 为 AGC 签名全局可信; 源码编译回退产物为机器本地自签
- session.lock 的 flock 为 stub(单进程语义已由 in-process 写声明保证)
- 受限沙箱(非 brew node 域)下 dlopen 仍可能被拒, 以实测为准

## License

MIT(见 LICENSE)。基于 dsh-harmonyos(MIT) 改造; 补丁逻辑部分借鉴 dsh-harmonyos-pc(MIT)。
