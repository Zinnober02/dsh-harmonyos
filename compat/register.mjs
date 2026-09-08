// module.register() 引导: node >= 20.6 的 hooks 注册方式, 替代弃用的 --experimental-loader。
// 由 dsh-ohos 以 --import 方式在应用代码之前加载, 把 compat-loader 的 resolve 钩子挂进全局。
import { register } from 'node:module';
// 平台归一: 鸿蒙 node 的 process.platform='openharmony' 会让按平台分发的原生包
// (sharp 的 @img/sharp-*-arm64、node-pty prebuilds 等)匹配不到。归一成 'linux':
// sharp 走 @img/sharp-linuxmusl-arm64(真 musl 预编译), 其余 linux 系分支也正确。
try { Object.defineProperty(process, 'platform', { value: 'linux', configurable: true }); } catch { /* ignore */ }
register('./compat-loader.mjs', import.meta.url);
