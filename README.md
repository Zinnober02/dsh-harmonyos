# dsh-harmonyos

DeepSeek Harness for HarmonyOS —— 一条命令装好、零原生模块的发行版 profile。

## 安装(HarmonyOS / 受限沙箱)

```sh
npm i -g dsh-harmonyos --ignore-scripts   # 必须: 跳过 koffi/node-pty 原生编译
# 装完补丁+剪枝(等价于 postinstall, ignore-scripts 下需手动一次):
node "$(npm root -g)/dsh-harmonyos/lib/patch.mjs" patch
node "$(npm root -g)/dsh-harmonyos/lib/prune.mjs"
```

## 启动

```sh
dsh-ohos            # web UI → http://127.0.0.1:3080 (token 见启动日志)
NODE_OHOS=/path/to/node dsh-ohos
dsh-ohos -- --profile headless "任务"   # 透传官方 dsh 参数
```

## 做了什么

| 机制 | 说明 |
|---|---|
| 原生裁剪 | postinstall 从依赖树**移除** koffi/node-pty/fs-ext 及 5 个宿主包(零 .node 残留) |
| 启动补丁 | overlays/harmonyos.patch.yml: 禁用原生行、目录选择器换纯 JS browse 变体 |
| 文件系统补丁 | 9 个官方包源码补丁(chmod 600/硬链接 EPERM/权限预设/回环认证等) |
| compat loader | node22 补 zstd 全套 + stripTypeScriptTypes(concurrent-safe) |
| node 适配 | 自动探测: v23+ 受限环境自动加 --jitless |
| 附件/读图 | sharp 走 @img/sharp-wasm32(纯 wasm), 已实测可用 |

## 配 API key

`~/.dsh/.credentials.yaml`:
```yaml
DEEPSEEK_API_KEY: sk-...
```

## 已知取舍

- 无终端/子进程/沙箱(bash 设备上没有, 且原生加载不了); 系统 App 沙箱兜底
- 鸿蒙对话预设(presets)可另从 dsh-harmonyos-pc 仓库拷贝
- dsh-harmony(dsh-harmony CLI)是另一发行线, 与本包无冲突
