#!/usr/bin/env node
// dsh-ohos: DeepSeek Harness for HarmonyOS 启动器
//   - 定位本包 node_modules 里的官方 dsh
//   - 自动挑可用 node: 优先「带原生 zstd 的」(node>=22.16, 免 wasm 兼容层)
//   - 固定必要参数: --expose-internals --experimental-sqlite --experimental-loader compat
//   - 挂载 dsh-harmonyos overlay(原生行替换/禁用)
// 用法: dsh-ohos 之后的参数就是官方 dsh 的 CLI 参数, 原样透传。
//   dsh-ohos                        # = dsh --profile web(补丁/端口走官方参数, 如 --port 3081)
//   dsh-ohos --port 3081            # web profile 换端口
//   dsh-ohos --profile headless "任务"    # 任意官方 profile/参数
//   NODE_OHOS=/path/node dsh-ohos   # 指定 node
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NM = join(ROOT, 'node_modules');
const MARKER = join(NM, '.dsh-harmonyos-ready');
const MARK = 'dsh-harmonyos-ready';

// 环境校验前置: 先确认 NODE_OHOS 可用, 再谈自愈/启动。
function pickNode() {
  const nodeBin = process.env.NODE_OHOS;
  if (!nodeBin) {
    console.error('dsh-ohos: 未配置 NODE_OHOS 环境变量。');
    console.error('  dsh 需要 node >= 22.16(带原生 zstd), 推荐 node26。请在 ~/.zshrc 配置:');
    console.error("    export NODE_OHOS=\"$HOME/.harmonybrew/opt/node/bin/node\"");
    console.error('  然后重开 shell 或 source ~/.zshrc 再运行 dsh-ohos。');
    process.exit(1);
  }
  if (!existsSync(nodeBin)) {
    console.error(`dsh-ohos: NODE_OHOS 指向的 node 不存在: ${nodeBin}`);
    console.error('  请检查路径, 或改配: export NODE_OHOS="$HOME/.harmonybrew/opt/node/bin/node"');
    process.exit(1);
  }
  return nodeBin;
}
const nodeBin = pickNode();

// marker 记录「补丁生效时的 dsh 版本」。版本不一致(升级后补丁被 npm install 冲掉,
// 或 postinstall 被 npm allowScripts 策略跳过)→ 自动重打; 只看存在性的旧方案会在
// 升级后带着未打补丁的包静默启动, 是正确性缺陷。
function installedDshVersion() {
  try { return JSON.parse(readFileSync(join(NM, '@deepseek-ai', 'dsh', 'package.json'), 'utf8')).version || ''; }
  catch { return ''; }
}
function markerVersion() {
  try { return (readFileSync(MARKER, 'utf8').split(/\r?\n/)[0].trim().split(/\s+/)[1]) || ''; }
  catch { return ''; }
}
const dshVersion = installedDshVersion();
if (!existsSync(join(NM, '@deepseek-ai', 'dsh', 'lib', 'bin.js'))) {
  console.error('dsh-ohos: 未找到 ' + join(NM, '@deepseek-ai', 'dsh', 'lib', 'bin.js') + ' — 请先在本仓库 npm install(拉取 @deepseek-ai/dsh)');
  process.exit(1);
}
if (!dshVersion || markerVersion() !== dshVersion) {
  try {
    console.error(`dsh-ohos: 补丁状态与 dsh@${dshVersion || '?'} 不一致(marker=${markerVersion() || '无'}), 重打 patch/prune…`);
    execFileSync(nodeBin, [join(ROOT, 'lib', 'patch.mjs'), 'patch'], { stdio: 'inherit' });
    execFileSync(nodeBin, [join(ROOT, 'lib', 'prune.mjs')], { stdio: 'inherit' });
    writeFileSync(MARKER, MARK + ' ' + dshVersion + '\n');
  } catch (e) {
    console.error('dsh-ohos: 自愈(patch/prune)失败:', e.message);
    process.exit(1);
  }
}
const DSLIB = join(NM, '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const LOADER = join(ROOT, 'compat', 'register.mjs');   // module.register() 引导(--import), 替代弃用的 --experimental-loader
const OVERLAY = join(ROOT, 'overlays', 'harmonyos.patch.yml');

if (!existsSync(DSLIB)) {
  console.error('dsh-ohos: 未找到 ' + DSLIB + ' — 请先在本仓库 npm install(拉取 @deepseek-ai/dsh)');
  process.exit(1);
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

const probeResult = await probe(nodeBin);
const nodeArgs = [];
if (probeResult.jitless) {
  console.error('dsh-ohos: 检测到当前 node 在受限沙箱无法分配可执行内存, 使用 --jitless(仅 CLI/服务可用)');
  nodeArgs.push('--jitless');
}
nodeArgs.push('--expose-internals', '--experimental-sqlite', '--import', LOADER);

// 参数语义: dsh-ohos 之后的参数就是 dsh 自己的 CLI 参数, 原样透传(不做任何翻译/分隔)。
// 仅注入发行版固定的适配项 --patch OVERLAY(鸿蒙 overlay, 剪原生插件)与 --no-open
// (设备无浏览器); 用户没给 --profile 时补默认 web(「装完 dsh-ohos 即用」)。
const args = (() => {
  const userArgs = process.argv.slice(2);
  const hasProfile = userArgs.some((a) => a === '--profile' || a.startsWith('--profile='));
  return [...(hasProfile ? [] : ['--profile', 'web']), '--patch', OVERLAY, '--no-open', ...userArgs];
})();

console.error(`dsh-ohos: node=${nodeBin}${probeResult.jitless ? ' --jitless' : ''}`);
console.error(`dsh-ohos: dsh=${DSLIB}\ndsh-ohos: overlay=${OVERLAY}`);

const child = spawn(nodeBin, [...nodeArgs, DSLIB, ...args], { stdio: 'inherit', env: process.env });
// 信号转发: wrapper 被杀时必须把 dsh 子进程一起带走, 否则 server 孤儿化、端口一直被占
// (node server 持有 listen fd, 父进程死了它照样活着)。SIGKILL 无法捕获, 属固有局限。
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => {
    try { child.kill(sig); } catch {}
    process.exit(sig === 'SIGINT' ? 130 : 143);
  });
}
child.on('error', (e) => { console.error('dsh-ohos: 启动失败:', e.message); process.exit(1); });
child.on('exit', (code, sig) => process.exit(code === null ? (sig ? 1 : 0) : code));
