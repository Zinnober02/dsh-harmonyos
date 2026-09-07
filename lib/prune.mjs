// dsh-harmonyos tree prune: 从本包 node_modules 剪掉「原生编译/设备上无意义」的包。
// 安全性: overlays/harmonyos.patch.yml 已在 profile 层禁用对应行, cordis 运行时绝不 import 它们。
import { rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NM = join(ROOT, 'node_modules');
const a = (name) => join(NM, name);

// 原生(或未编译残留): koffi 仅 Windows 懒加载, node-pty 行已禁用 — 删掉零影响
const NATIVES = ['koffi', 'node-pty'];
// 只服务被禁用行的宿主包(纯 JS 但设备上无意义, 连坐删除)
const HOSTS = [
  '@deepseek-ai/dsh-sandbox-local',
  '@deepseek-ai/dsh-subprocess-local',
  '@deepseek-ai/dsh-bash-sandbox',
  '@deepseek-ai/dsh-pwsh-sandbox',
  '@deepseek-ai/dsh-host-directory-picker-auto',
];

let removed = 0;
for (const p of [...NATIVES, ...HOSTS]) {
  const target = a(p);
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    removed += 1;
    console.log(`prune: 移除 ${p}`);
  }
}
console.log(`prune: 完成, 移除 ${removed} 个包`);
