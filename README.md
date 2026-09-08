# dsh-harmonyos

DeepSeek Harness (dsh) 的 HarmonyOS 适配发行版 —— 让官方 dsh 在鸿蒙(musl/受限存储)上跑起来。

> 本分支基于 v0.1.0 跟进官方 `@deepseek-ai/dsh` **0.1.3-alpha.2**, 运行时从 node22 切换到 **node26**(原生 zstd),
> 并将「node22 补齐」类兼容层改造为「原生优先/按需 stub」。增量说明与插件化建议见分支 commit 信息。License: MIT。

## 环境要求

- **node >= 22.16**(带原生 zstd), 强烈推荐 **node26**。
- **鸿蒙 PC 建议直接用 [Harmonybrew](https://atomgit.com/Harmonybrew) 安装 node**(该源的默认 `node` 公式即 **26**, 原生 zstd 开箱可用):
  ```sh
  brew install node        # 默认即 node 26
  node --version           # v26.x
  ```
  装好后通过环境变量把 dsh 指向它(默认 node 就是 26, 一般无需额外指定):
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

> 为什么带 `--ignore-scripts`: 依赖树里的 koffi 等原生包在鸿蒙无预编译产物、cmake 又
> 不认 HarmonyOS, 其 install 脚本必然失败。本发行包把原生包**剪出依赖树**(首启自愈自动
> 执行 `patch + prune`, 纯 JS), 因此可以安全跳过所有 install 脚本。

启动:
```sh
dsh-ohos          # → http://127.0.0.1:3080 (token 见启动日志)
dsh-ohos -- --port 3081     # 换端口 / 透传任意官方参数
```

若 PATH 里的 node 不是 26(如系统还留着旧 deveco node), 用环境变量指定:
```sh
export NODE_OHOS="$(brew --prefix)/opt/node/bin/node"   # node26
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

## 适配机制(4 层)

| 层 | 机制 | 说明 |
|---|---|---|
| 启动器 | `bin/dsh-ohos.js` | 读 `NODE_OHOS`; 首启自愈(patch+prune); 固定 `--expose-internals --experimental-sqlite --experimental-loader compat`; v23+ 受限沙箱自动 `--jitless` |
| compat loader | `compat/compat-loader.mjs` | 模块重定向: `node:zlib`/`node:module`(原生优先, 旧 node 回退 shim)、`fs-ext`(flock stub, 官方 browser-worker 部署同款方案)、`sharp`(抛 `SHARP_UNAVAILABLE`, 图片附件走 INVALID_IMAGE 降级) |
| 源码补丁 | `lib/patch.mjs` | 幂等打官方包源码: 硬链接 EPERM→rename(session/attachment/fs-local)、chmod 600 属主检查跳过(credentials)、sandboxMode 改读 fs 沙箱(permission-presets)、回环免 token(loopback)、settings 旧 API 垫片。**npm 11 嵌套布局下同一包可能有多份实例, 全部实例都会补丁并逐一校验** |
| profile 层 | `overlays/harmonyos.patch.yml` + `lib/prune.mjs` | overlay 禁用原生行(subprocess/sandbox/bash-sandbox/open-in-app)、目录选择器换纯 JS browse 变体; prune 递归移除 koffi/node-pty 及 5 个宿主包 |

补丁锚点为精确代码片段, 失配即**报错拒绝**(绝不静默打错); 门控: node26(原生 loader)下
自动跳过 cordis-loader v0 补丁。

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

- 无终端/子进程/沙箱(bash 设备上没有, 原生模块加载不了); 系统 App 沙箱兜底
- 图片处理(sharp)不可用: 图片附件报「不支持」, 普通附件/会话不受影响
- session.lock 的 flock 为 stub(单进程下 in-process 写声明已排除并发写者)
- `open-in-app` 已禁用(依赖被禁的 subprocess 服务)

## License

MIT(见 LICENSE)。基于原 dsh-harmonyos(MIT) 改造。
