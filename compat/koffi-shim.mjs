// koffi 兼容层(loader 拦截): dsh-subprocess-local 的 runner-launch 在**模块顶层**就构建
// Windows inspector 绑定(koffi.pointer/struct/array/load/alloc), 但真正的 Win32 调用
// 只在 Windows 路径发生(鸿蒙永不触发)。koffi 原生构建在鸿蒙不可行(cmake 不认 HarmonyOS),
// 故提供「可解析、可构造、调用即惰性」的最小 stub:
//   - pointer/struct/array/alloc → 返回占位对象(仅被存储/传递)
//   - load(dll) → Proxy: 任意属性(如 .func)取回可调用函数, 实际调用仅发生在 Windows 分支
export function pointer(t) { return { __koffi: 'pointer', of: t }; }
export function struct(name, def) { return { __koffi: 'struct', name, def }; }
export function array(t, n) { return { __koffi: 'array', of: t, length: n }; }
export function alloc(type, count) {
  try { return Buffer.alloc(count || 0); } catch { return Buffer.alloc(0); }
}
export function load(name) {
  return new Proxy({ __koffi_dll: name }, {
    get(_t, prop) {
      if (prop === 'func') return (..._a) => (() => undefined);
      return (..._a) => undefined;
    },
  });
}
export default { pointer, struct, array, alloc, load };
