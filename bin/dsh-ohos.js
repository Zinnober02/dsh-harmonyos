#!/usr/bin/env node
// dsh-ohos: DeepSeek Harness for HarmonyOS 启动器
//   - 定位本包 node_modules 里的官方 dsh
//   - 自动挑可用 node: 优先「带原生 zstd 的」(node>=22.16, 免 wasm 兼容层)
//   - 固定必要参数: --expose-internals --experimental-sqlite --experimental-loader compat
//   - 挂载 dsh-harmonyos overlay(原生行替换/禁用)
// 用法:
//   dsh-ohos                  # 启动 web(127.0.0.1:3080, 作者默认)
//   dsh-ohos -- <官方dsh参数>   # 透传(如 --profile headless "任务"、--port 3081)
//   NODE_OHOS=/path/node dsh-ohos   # 指定 node
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, renameSync, copyFileSync, cpSync, mkdirSync } from 'node:fs';
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

// node-pty 就地编译(ensure-pty): subprocess 行已启用, 需要真实 pty.node。
// npm --ignore-scripts 跳过构建, 这里用 NODE_OHOS + 同前缀 npm 的 node-gyp 补编译。
// 找 binary-sign-tool(补 .codesign 段用): hnp / home / PATH
function signTool() {
  const cands = [
    process.env.BINARY_SIGN_TOOL,
    '/data/service/hnp/bin/binary-sign-tool',
    join(process.env.HOME || '', '.local', 'bin', 'binary-sign-tool'),
  ].filter(Boolean);
  return cands.find((p) => existsSync(p)) || null;
}
function codeSign(file) {
  const tool = signTool();
  if (!tool) { console.error('dsh-ohos: 无 binary-sign-tool, 无法补 .codesign → ' + file); return false; }
  const tmp = file + '.signed';
  const r = spawnSync(tool, ['sign', '-inFile', file, '-outFile', tmp, '-selfSign', '1'], { stdio: 'ignore' });
  if (r.status !== 0 || !existsSync(tmp)) return false;
  renameSync(tmp, file);
  return true;
}

// koffi 就地构建: 补丁 cnoke(cmake 认 Linux/aarch64) + cnoke 构建 + .codesign 签名。
function ensureKoffi(nodeBin) {
  const dirs = [];
  try { for (const e of readdirSync(NM)) if (e === 'koffi') dirs.push(join(NM, e)); } catch { /* ignore */ }
  if (dirs.length === 0) { console.error('dsh-ohos: 树里没有 koffi — subprocess 需要真 koffi'); return; }
  for (const dir of dirs) {
    const cnoke = join(dir, 'cnoke.cjs');
    const loaderNode = join(dir, 'build', 'koffi', 'openharmony_arm64', 'koffi.node');
    const outNode = join(dir, 'build', 'koffi', 'openharmony_arm64', 'v26.8.1_native', 'Release', 'Output', 'koffi.node');
    // 预编译优先(AGC 签名): prebuilt/koffi-<版本>-linux-arm64-musl.node → 铺全部 triplet
    const ver = (() => { try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version || ''; } catch { return ''; } })();
    const pre = join(ROOT, 'prebuilt', 'koffi-' + ver + '-linux-arm64-musl.node');
    if (existsSync(pre)) {
      let used = false;
      for (const triplet of ['openharmony_arm64', 'linux_arm64', 'musl_arm64']) {
        const target = join(dir, 'build', 'koffi', triplet, 'koffi.node');
        if (existsSync(target)) continue;
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(pre, target);
        used = true;
      }
      if (used) console.error('dsh-ohos: 使用预编译 koffi(' + ver + ', AGC 签名)');
      continue;
    }
    if (!existsSync(outNode)) {
      if (existsSync(cnoke)) {
        let c = readFileSync(cnoke, 'utf8');
        const need = '-DCMAKE_SYSTEM_NAME=Linux';
        if (!c.includes(need)) {
          c = c.replace('args.push("--no-warn-unused-cli");',
            'args.push("-DCMAKE_SYSTEM_NAME=Linux");\n    args.push("-DCMAKE_SYSTEM_PROCESSOR=aarch64");\n    args.push("--no-warn-unused-cli");');
          writeFileSync(cnoke, c);
        }
      }
      console.error('dsh-ohos: 编译 koffi(源码, 需 clang/cmake)…');
      const r = spawnSync(nodeBin, ['cnoke.cjs', '-P', '.', '-D', 'src/koffi', '--prebuild', '--release'], { cwd: dir, stdio: 'inherit' });
      if (r.status !== 0 || !existsSync(outNode)) { console.error('dsh-ohos: koffi 编译失败(exit=' + r.status + ')'); process.exit(1); }
    }
    // 签名 + 铺路径: koffi 的 JS loader 按运行时 platform 找 build/koffi/<triplet>/koffi.node
    // (linux → linux_arm64 优先、musl_arm64 兜底); 构建期 cnoke 用的是 openharmony_arm64。
    // 把签名产物铺到所有 triplet 路径(幂等, 已存在且含 codesign 则跳过)。
    const signedOk = (f) => existsSync(f) && (() => { try { return readFileSync(f, 'utf8').includes('codesign'); } catch { return false; } })();
    if (!signedOk(outNode) && !codeSign(outNode)) { console.error('dsh-ohos: koffi 签名失败 → ' + outNode); process.exit(1); }
    for (const triplet of ['openharmony_arm64', 'linux_arm64', 'musl_arm64']) {
      const target = join(dir, 'build', 'koffi', triplet, 'koffi.node');
      if (signedOk(target)) continue;
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(outNode, target);
      if (!codeSign(target)) { console.error('dsh-ohos: koffi 签名失败 → ' + target); process.exit(1); }
    }
  }
}

// sharp 原生后端: npm 平台门控(os:linux,libc:musl)在鸿蒙(openharmony)永不安装,
// 从 prebuilt/sharp-linuxmusl-arm64-<ver>/ 物化到 node_modules/@img/sharp-linuxmusl-arm64。
function ensureSharp() {
  const src = join(ROOT, 'prebuilt', 'sharp-linuxmusl-arm64-0.35.4');
  if (!existsSync(src)) return;
  const dst = join(NM, '@img', 'sharp-linuxmusl-arm64');
  const marker = join(dst, 'lib', 'sharp-linuxmusl-arm64-0.35.4.node');
  if (existsSync(marker)) return;
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.error('dsh-ohos: 物化 sharp 原生后端(prebuilt)');
}

function ensurePty(nodeBin) {
  const dirs = [];
  try { for (const e of readdirSync(NM)) if (e === 'node-pty') dirs.push(join(NM, e)); } catch { /* ignore */ }
  if (dirs.length === 0) {
    // npm11 可能嵌套在 @deepseek-ai/dsh/node_modules 等; 浅层补扫
    try { for (const a of readdirSync(NM)) {
      const sub = join(NM, a, 'node_modules');
      try { for (const e of readdirSync(sub)) if (e === 'node-pty') dirs.push(join(sub, e)); } catch { /* ignore */ }
    } } catch { /* ignore */ }
  }
  if (dirs.length === 0) {
    console.error('dsh-ohos: 树里没有 node-pty(依赖缺失?) — subprocess 行将无法加载');
    return;
  }
  for (const dir of dirs) {
    const ptyNode = join(dir, 'build', 'Release', 'pty.node');
    if (existsSync(ptyNode)) continue;
    // 预编译优先(AGC 签名, 免工具链): prebuilt/node-pty-<版本>-linux-arm64-musl.node
    const ver = (() => { try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version || ''; } catch { return ''; } })();
    const pre = join(ROOT, 'prebuilt', 'node-pty-' + ver + '-linux-arm64-musl.node');
    if (existsSync(pre)) {
      mkdirSync(dirname(ptyNode), { recursive: true });
      copyFileSync(pre, ptyNode);
      console.error('dsh-ohos: 使用预编译 node-pty(' + ver + ', AGC 签名)');
      continue;
    }
    console.error('dsh-ohos: 无匹配预编译 node-pty(' + ver + '), 走源码编译');
    // 定位 node-gyp: 优先用与 NODE_OHOS 同前缀的 npm 查全局根(npm i -g 装的布局),
    // 再退回常见 brew/deveco 前缀布局。node-gyp 12 无 PGO 问题, 直接 rebuild。
    const npmBin = join(dirname(nodeBin), 'npm');
    let npmRoot = '';
    try { npmRoot = execFileSync(npmBin, ['root', '-g'], { encoding: 'utf8' }).trim(); } catch { /* ignore */ }
    const gypCandidates = [
      ...(npmRoot ? [join(npmRoot, 'npm', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')] : []),
      join(dirname(dirname(nodeBin)), 'lib', 'node_modules', 'npm', 'node_modules', 'node-gyp', 'bin', 'node-gyp.js'),
    ];
    const gyp = gypCandidates.find((p) => existsSync(p));
    if (!gyp) { console.error('dsh-ohos: 找不到 node-gyp(' + gypCandidates.join(', ') + ') — 无法编译 node-pty'); process.exit(1); }
    console.error('dsh-ohos: 编译 node-pty → ' + ptyNode);
    const r = spawnSync(nodeBin, [gyp, 'rebuild'], {
      cwd: dir, stdio: 'inherit',
      env: { ...process.env, CC: process.env.CC || 'clang', CXX: process.env.CXX || 'clang++' },
    });
    if (r.status !== 0 || !existsSync(ptyNode)) {
      console.error('dsh-ohos: node-pty 编译失败(exit=' + r.status + ') — subprocess 行启用但无法加载, 启动中止');
      process.exit(1);
    }
  }
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
ensureSharp();
ensurePty(nodeBin);
ensureKoffi(nodeBin);
nodeArgs.push('--expose-internals', '--experimental-sqlite', '--import', LOADER);

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
