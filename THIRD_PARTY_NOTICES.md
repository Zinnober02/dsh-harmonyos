# THIRD-PARTY NOTICES

本发行版(dsh-harmonyos)参考、改编或再分发以下第三方项目。各项目版权归其各自作者所有；
本项目在适用处保留并遵循其原始许可条款。完整许可文本见各来源仓库或下方链接。

## 直接取材/改编

### dsh-harmonyos-pc（MIT）
仓库: https://github.com/QinpanWan/dsh-harmonyos（原作者线亦可追溯到 Entity-Him/dsh-harmonyos）
本项目的以下部分**参考并改编**自 dsh-harmonyos-pc：
- `lib/patch.mjs` 的官方包源码锚点补丁逻辑（credentials chmod-600 跳过、session/attachment/fs-local
  硬链接 EPERM→rename/copy、permission-presets 改读 fs 沙箱、回环免 token、settings 旧 API 垫片、
  cordis-loader legacy 兼容等）——改编自其 `scripts/dsh-update.mjs`；
- `overlays/harmonyos.patch.yml` 的 profile 层机制（按行禁用原生插件、directory-picker 换纯 JS browse 变体）；
- node22 兼容层与"npm 在鸿蒙 arborist 卡死 → 需自装/直装"等工程结论与思路；
- 八套鸿蒙对话预设 `presets/harmony-chat*`（拷贝自其 presets/，随本仓库/用户预设目录分发）。
若需使用/再分发预设与补丁逻辑，请一并保留本项目此声明。

### dsh-harmony（MIT）
仓库: https://github.com/memorax-ai/dsh-harmony
早期为本项目提供 DeepSeek Harness 插件化思路与 node:module 兼容层（enableCompileCache/
findPackageJSON/registerHooks shim）的方法论参考；相关 shim 代码现已不随本发行版分发。

## 发行形态参考（未取代码）

- dsh-TUI（@deepseek-harness-tui/dsh-tui）— 单插件发行形态参考
- dsh-desktop（anywhere-labs）— 全产品发行形态参考

## 被适配对象

- **@deepseek-ai/dsh**（MIT）— DeepSeek Harness 官方 CLI/插件体系，本发行版是对其在
  HarmonyOS 上运行的适配（源码补丁仅改动已安装副本的运行行为，不改发布物）。
  仓库: https://github.com/deepseek-ai/dsh

## 再分发的预编译二进制与依赖

以下 npm 包以其自身许可随本项目依赖/预编译产物分发（见各自 node_modules 内 LICENSE）：

| 包 | 许可 | 说明 |
|---|---|---|
| koffi | MIT | FFI 库，prebuilt/ 内为鸿蒙 PC(linux-arm64-musl) 源码构建产物 |
| node-pty | MIT (Copyright (c) 2012-2015 Christopher Jeffrey 等) | PTY，prebuilt/ 同 |
| ripgrep | MIT (BurntSushi) | prebuilt/rg，musl 构建产物 |
| @img/sharp-wasm32 / sharp | Apache-2.0 | 图片处理(wasm 后端) |
| fzstd / zstd-codec | MIT | zstd 纯 JS/wasm |
| @vscode/ripgrep | MIT | 官方 fs-search 原用二进制(鸿蒙不适用, 已以 DSH_RG_PATH 替代) |

## 汇总

本项目主体 License 为 MIT(见 LICENSE)。若你对以上任何声明的归属/遗漏有异议，欢迎提 issue 修正。
