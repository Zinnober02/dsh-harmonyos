// dsh-harmonyos compat loader: 把 dsh 树(node_modules 内)对 node:zlib / node:module 的导入
// 映射到本包 compat shim, 补齐 node v22.7 缺失的 zstd API / stripTypeScriptTypes 等。
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHIMS = {
  'node:zlib': join(HERE, 'zlib-shim.mjs'),
  'node:module': join(HERE, 'module-shim.mjs'),
};
const urls = {};
for (const [k, v] of Object.entries(SHIMS)) urls[k] = pathToFileURL(v).href;

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL ?? '';
  const shim = SHIMS[specifier];
  if (shim && parent.includes('/node_modules/') && !parent.startsWith(urls[specifier])) {
    return { url: urls[specifier], shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
