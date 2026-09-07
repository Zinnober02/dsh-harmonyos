#!/bin/env node
// dsh-ohos: DeepSeek Harness for HarmonyOS 启动器
//   - 定位本包 node_modules 里的官方 dsh
//   - 自动挑可用 node(带 --jitless 能力探测: v23+/受限沙箱需要)
//   - 固定必要参数: --expose-internals --experimental-sqlite --experimental-loader compat
//   - 挂载 dsh-harmonyos overlay(原生行替换/禁用)
// 用法:
//   dsh-ohos                  # 启动 web(127.0.0.1:3080)
//   dsh-ohos -- <官方dsh参数>   # 透传(如 --profile headless "任务")
//   NODE_OHOS=/path/node dsh-ohos   # 指定 node
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NM = join(ROOT, 'node_modules');
const MARKER = join(NM, '.dsh-harmonyos-ready');
const MARK = 'dsh-harmonyos-ready';
const { execFileSync } = await import('node:child_process');
if (!existsSync(join(NM, MARKER))) {
  try {
    // 首启自愈: --ignore-scripts 安装跳过 postinstall, 这里补打补丁 + 剪枝
    execFileSync(process.execPath, [join(ROOT, 'lib', 'patch.mjs'), 'patch'], { stdio: 'inherit' });
    execFileSync(process.execPath, [join(ROOT, 'lib', 'prune.mjs')], { stdio: 'inherit' });
    writeFileSync(MARKER, MARK);
  } catch (e) {
    console.error('dsh-ohos: 自愈(patch/prune)失败:', e.message);
  }
}
const DSLIB = join(NM, '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const LOADER = join(ROOT, 'compat', 'compat-loader.mjs');
const OVERLAY = join(ROOT, 'overlays', 'harmonyos.patch.yml');
const HERED = dirname(fileURLToPath(import.meta.url));

if (!existsSync(DSLIB)) {
  console.error('dsh-ohos: 未找到 ' + DSLIB + ' — 请先 npm i -g dsh-harmonyos(会拉取 @deepseek-ai/dsh)');
  process.exit(1);
}

// 挑 node: 优先 NODE_OHOS / process.execPath; v23+ 先探测裸跑, 崩则加 --jitless
function pickNode() {
  const candidates = [process.env.NODE_OHOS, process.execPath].filter(Boolean);
  return candidates[0];
}
function probe(nodeBin) {
  return new Promise((resolve) => {
    const c = spawn(nodeBin, ['-e', '0'], { stdio: 'ignore' });
    const t = setTimeout(() => { c.kill(); resolve({ jitless: false }); }, 4000);
    c.on('exit', (code, sig) => {
      clearTimeout(t);
      // 信号/非零退出(如 V8 fatal) → 需要 --jitless
      resolve({ jitless: sig !== null || code !== 0 });
    });
    c.on('error', () => { clearTimeout(t); resolve({ jitless: false }); });
  });
}

const nodeBin = pickNode();
const probeResult = await probe(nodeBin);
const nodeArgs = [];
if (probeResult.jitless) {
  console.error('dsh-ohos: 检测到当前 node 在受限沙箱无法分配可执行内存, 使用 --jitless(仅 CLI/服务可用)');
  nodeArgs.push('--jitless');
}
nodeArgs.push('--expose-internals', '--experimental-sqlite', '--experimental-loader', LOADER);

const dash = process.argv.indexOf('--');
const passthrough = dash === -1 ? [] : process.argv.slice(dash + 1);
const args = dash === -1
  ? ['--profile', 'web', '--patch', OVERLAY, '--no-open']
  : passthrough;

console.error(`dsh-ohos: node=${nodeBin}${probeResult.jitless ? ' --jitless' : ''}`);
console.error(`dsh-ohos: dsh=${DSLIB}\ndsh-ohos: overlay=${OVERLAY}`);

const child = spawn(nodeBin, [...nodeArgs, DSLIB, ...args], { stdio: 'inherit', env: process.env });
child.on('error', (e) => { console.error('dsh-ohos: 启动失败:', e.message); process.exit(1); });
child.on('exit', (code, sig) => process.exit(code === null ? (sig ? 1 : 0) : code));
