// Windows 非管理员修复：Vercel CLI 在 .vercel/output/functions 里用 fs.symlinkSync
// 创建"多个 route 共享同一函数"的目录 symlink，非管理员会 EPERM。
//
// 根因：Node 用相对 target（如 'callback.func'）时以 process.cwd() 解析，stat 失败后
// 当作 file symlink 创建 → Windows 非管理员 EPERM。目录 symlink 在 Windows 上应使用
// junction（无需管理员/开发者模式）。
//
// 方案：把目标解析为绝对路径并 stat；若为目录 → 改用 junction 类型。
const fs = require('fs')
const path = require('path')

function resolveTarget(target, pathname) {
  if (path.isAbsolute(target)) return target
  // 相对 target 应相对 dest 所在目录解析（与 fs.symlink 语义一致）
  return path.resolve(path.dirname(pathname), target)
}

function decideType(target, pathname, type) {
  if (process.platform !== 'win32') return type
  if (type && type !== 'file') return type
  try {
    const st = fs.statSync(resolveTarget(target, pathname))
    if (st.isDirectory()) return 'junction'
  } catch {
    /* 目标不存在：交给原生逻辑 */
  }
  return type
}

const originalSymlinkSync = fs.symlinkSync
const originalSymlink = fs.symlink

fs.symlinkSync = function (target, pathname, type) {
  return originalSymlinkSync(target, pathname, decideType(target, pathname, type))
}

fs.symlink = function (target, pathname, type, callback) {
  if (typeof type === 'function') {
    callback = type
    type = undefined
  }
  return originalSymlink.call(this, target, pathname, decideType(target, pathname, type), callback)
}
