// compat 钩子注册引导: 由 dsh-ohos 以 --import 方式在应用代码之前加载。
// 优先 module.registerHooks()(node >= 22.15: 同步同线程, 无弃用警告)——hooks 必须
// 以同步值传入, 故先顶层 await 拿到 compat-loader 的导出再注册;
// 旧运行时无 registerHooks 时回退 module.register()(独立线程异步 hooks, node26 起 DEP0205)。
// 两种方式接受相同的 resolve 钩子形态, compat-loader.mjs 本身无需改动。
import { register, registerHooks } from 'node:module';
const hooksUrl = new URL('./compat-loader.mjs', import.meta.url).href;
if (typeof registerHooks === 'function') {
  const { resolve } = await import(hooksUrl);
  registerHooks({ resolve });
} else {
  register('./compat-loader.mjs', import.meta.url);
}
