// node:module 兼容层: 补 node 22.7 缺失的导出。
export * from 'node:module';
import { Transform } from 'node:stream';

// node 22.18+ 的 stripTypeScriptTypes: 启动加载 .ts 插件时才真正剥离; 先做保守空实现,
// 官方插件均为编译后 JS。需要时再接入真实剥离。
export function stripTypeScriptTypes(code) { return code; }
export function enableCompileCache() { return { cacheDirectory: undefined, wasEnabled: false }; }
export function findPackageJSON() { return undefined; }
export function registerHooks() { /* no-op */ }
