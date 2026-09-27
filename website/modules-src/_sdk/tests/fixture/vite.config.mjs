/**
 * 打包冒烟用的 vite 配置：**纯对象导出**，故意不 import 'vite'
 * （SDK 目录内没有 node_modules，bare import 无法解析）。
 * 输出目录由脚本通过 SDK_SMOKE_OUT_DIR 注入。
 */
import path from 'node:path'

export default {
  root: process.cwd(),
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: process.env.SDK_SMOKE_OUT_DIR || path.join(process.cwd(), '.smoke-out'),
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: path.join(process.cwd(), 'entry.js'),
      name: 'MiniHbutSdkSmoke',
      formats: ['es'],
      fileName: () => 'mini-hbut-game-sdk-smoke.js'
    }
  }
}
