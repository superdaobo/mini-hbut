/**
 * Epic #833 视觉回归专用构建配置（仅 QA 用，不参与产品构建与 CI）。
 *
 * 目的：把 qa-visual/ 下的 harness 打成静态站点，用真实 ScheduleGrid 组件渲染 8 组场景，
 * 供 CDP 脚本逐组截图。产物输出到 qa-visual-dist/。
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname, 'qa-visual'),
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'axios': path.resolve(__dirname, 'src/utils/axios_adapter.js')
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'qa-visual-dist'),
    emptyOutDir: true,
    minify: false,
    // harness 会 import 到 root 之外的 src/，放宽即可（仅本地 QA）
    rollupOptions: { output: { manualChunks: undefined } }
  }
})
