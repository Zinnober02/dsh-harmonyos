# dsh-harmonyos

DeepSeek Harness (dsh) 的 HarmonyOS 适配发行版 —— 让官方 dsh 在鸿蒙(musl/受限存储)上跑起来。

> **v0.5.0**: 基于官方 `@deepseek-ai/dsh` **0.1.3-alpha.2**, 运行时 **node26**(原生 zstd,
> 建议经 [Harmonybrew](https://atomgit.com/Harmonybrew) 安装)。本版: platform=linux 归一 +
> **图片复活**(sharp 真原生) + **终端/子进程复活**, 且 koffi/node-pty 提供 **鸿蒙 PC 预编译
> 产物(prebuilt/, hmsign-release AGC 签名, 全局可信)** — 用户首启零编译零工具链。License: MIT。

## 环境要求

- **node >= 22.16**(带原生 zstd), 强烈推荐 **node26**。
- **鸿蒙 PC 建议直接用 [Harmonybrew](https://atomgit.com/Harmonybrew) 安装 node**(该源的默认 `node` 公式即 **26**, 原生 zstd 开箱可用):
  ```sh
  brew install node        # 默认即 node 26
  node --version           # v26.x
  ```
  装好后通过环境变量把 dsh 指向它:
  ```sh
  # ~/.zshrc
  export NODE_OHOS="$(brew --prefix)/opt/node/bin/node"
  # 例: ~/.harmonybrew/opt/node/bin/node
  ```
  未配置时 `dsh-ohos` / `patch.mjs` 会**直接报错**(不静默回落)。
- 官方 dsh 及其依赖由 npm 拉取(`@deepseek-ai/dsh` 0.1.3-alpha.2)。

## 安装

### ① npm 安装(推荐, 最终用户)

```sh
npm i -g dsh-harmonyos --ignore-scripts
```

> 为什么带 `--ignore-scripts`: 依赖树里的 koffi 等原生包在鸿蒙 install 脚本必失败
> (cmake 不认 HarmonyOS)。本发行包在**首启自愈**里统一处理: patch(补丁)+ prune(剪枝)
> + ensure-pty(node-pty 就地编译, 备用), 纯 JS, 可安全跳过所有 install 脚本。

启动:
```sh
dsh-ohos          # → http://127.0.0.1:3080 (token 见启动日志)
dsh-ohos -- --port 3081     # 换端口 / 透传任意官方参数
```

升级:
```sh
npm i -g dsh-harmonyos@latest --ignore-scripts
```

### ② 源码/开发模式(git clone + npm link)

```sh
git clone <本仓库> dsh-harmonyos && cd dsh-harmonyos
npm install                # postinstall 自动: patch(补丁) + prune(剪枝)
npm link                   # 暴露 dsh-ohos 命令(开发模式)
dsh-ohos                   # web UI → http://127.0.0.1:3080 (token 见启动日志)
```

> ⚠️ 开发模式下(仓库内 `npm link`)**不要**再用 `npm i -g dsh-harmonyos` 覆盖: 会把软链
> 替换成普通目录、拆掉开发环境。仓库内升级走下方「升级官方 dsh」流程。

## 启动

```sh
dsh-ohos                              # 默认 3080 (作者约定端口)
dsh-ohos -- --port 3081               # 透传官方参数, 换端口(调试推荐, 与旧实例并行)
dsh-ohos -- --profile headless "任务"  # 透传任意官方 dsh 参数
```

## 适配机制

| 层 | 机制 | 说明 |
|---|---|---|
| 平台归一 | `compat/register.mjs` | `process.platform` 归一为 `linux`(module.register 引导)。鸿蒙 node 上报 `openharmony`, 让按平台分发的原生包(sharp 的 `@img/sharp-*-arm64` 等)匹配不到; 归一到 linux 后走**真 musl 原生**(brew node26 域内 dlopen 可用) |
| 启动器 | `bin/dsh-ohos.js` | 读 `NODE_OHOS`(强制); 首启自愈(patch+prune+**ensure-pty** 就地 node-gyp 编译 node-pty); 固定 `--expose-internals --experimental-sqlite --import compat/register.mjs`; v23+ 受限沙箱自动 `--jitless` |
| compat loader | `compat/compat-loader.mjs` | 模块重定向: `node:zlib`/`node:module`(原生优先, 旧 node 回退 shim)、`fs-ext`(flock stub, 官方 browser-worker 部署同款)、`koffi`(默认走真构建; `DSH_OHOS_KOFFI=shim` 退回 stub)、`sharp`(**默认不拦截**, 真 native; 设 `DSH_OHOS_SHARP=shim` 可退回抛 `SHARP_UNAVAILABLE` 降级) |
| 源码补丁 | `lib/patch.mjs` | 幂等打官方包源码: 硬链接 EPERM→rename(session/attachment/fs-local)、chmod 600 属主检查跳过(credentials)、sandboxMode 改读 fs 沙箱(permission-presets)、回环免 token(loopback)、settings 旧 API 垫片。**npm 11 嵌套布局下同一包可能有多份实例, 全部实例都会补丁并逐一校验** |
| profile 层 | `overlays/harmonyos.patch.yml` + `lib/prune.mjs` | overlay 禁用原生行(subprocess/sandbox/bash-sandbox/open-in-app); prune 递归移除 koffi 与 sandbox 宿主包(**保留** node-pty/subprocess-local/picker-auto — ensure-pty 管线与 koffi 攻坚就绪) |

补丁锚点为精确代码片段, 失配即**报错拒绝**(绝不静默打错); 门控: node26(原生 loader)下
自动跳过 cordis-loader v0 补丁。

## 功能状态(实测)

| 能力 | 状态 |
|---|---|
| Web UI / 会话 / 附件(文字) | ✅ |
| **图片附件 / 读图**(sharp native linuxmusl) | ✅ v0.3 复活, 已实测 decode/resize/encode |
| 终端 / 子进程(subprocess) | ⏸ node-pty 可编译可加载, 但 spawn 依赖真 koffi(libc FFI); koffi.node dlopen 仍被沙箱拒, 攻坚中 |
| 沙箱隔离 | ⏸ koffi 依赖; 由系统 App 沙箱兜底 |

## 升级官方 dsh

最终用户(npm 安装):
```sh
npm i -g dsh-harmonyos@latest --ignore-scripts   # 新版自带自愈, 重启 dsh-ohos 即可
```

源码/开发模式:
```sh
# 1. 改 package.json 里 @deepseek-ai/dsh 的版本
# 2. 重装依赖 + 重打补丁
npm install && npm run patch && npm run prune
# 3. 重启 dsh-ohos
```

## 常用维护命令

```sh
npm run patch    # 重打全部补丁(幂等)
npm run check    # 检查已装版本 vs 最新
npm run prune    # 重新剪枝(幂等)
npm test         # 端到端冒烟: 起服务 → token 认证 303+cookie → / 200
```

> 启动时的自愈不是只看标记文件存在: marker 记录补丁生效时的 dsh 版本,
> 版本不一致(升级冲掉补丁 / postinstall 被 npm 策略跳过)会自动重打 patch/prune。

## 配 API key

`~/.dsh/.credentials.yaml`:
```yaml
DEEPSEEK_API_KEY: sk-...
```

## 已知取舍

- 沙箱隔离(sandbox)仍禁用; open-in-app 已随 subprocess 启用
- 预编译产物仅覆盖 koffi 3.2.1 / node-pty 1.2.0-beta.15(linux-arm64-musl, N-API); 版本升级需配套新 prebuilt 或临时走源码编译
- 预编译为 hmsign-release(AGC) 签名, 全局可信; 源码回退路径产物为机器本地自签
- session.lock 的 flock 为 stub(单进程下 in-process 写声明已排除并发写者)
- 受限沙箱(非 brew node 域)下原生 dlopen 仍可能被拒, 以实测为准

## License

MIT(见 LICENSE)。基于原 dsh-harmonyos(MIT) 改造。
