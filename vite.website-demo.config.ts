/**
 * 官网 Hero 嵌入用离线演示包构建配置。
 * 输出到 website/public/app-demo，base 使用相对路径以兼容 /app-demo 与 /mini-hbut/app-demo。
 */
import { defineConfig, mergeConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import baseConfig from './vite.config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(rootDir, 'website/public/app-demo')

export default mergeConfig(
  baseConfig,
  defineConfig({
    base: './',
    define: {
      'import.meta.env.VITE_WEBSITE_DEMO': JSON.stringify('1'),
    },
    build: {
      outDir,
      emptyOutDir: true,
      // 演示包体积可略大；仍关闭 sourcemap
      sourcemap: false,
      rollupOptions: {
        input: path.resolve(rootDir, 'app-demo.html'),
      },
    },
    // 允许写入 website/public（主配置 fs.deny 了 website）
    server: {
      fs: {
        strict: true,
        deny: ['**/android/**', '**/ios/**', '**/src-tauri/target/**'],
      },
    },
  }),
)
