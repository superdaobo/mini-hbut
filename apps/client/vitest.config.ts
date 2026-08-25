import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'packages/**/src/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 5000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@mini-hbut/capacitor-plugin-mini-hbut-widget': path.resolve(
        __dirname,
        './packages/capacitor-plugin-mini-hbut-widget/src'
      ),
      // 与 vite.config 对齐：项目无 axios npm 包，统一走自研适配器
      'axios': path.resolve(__dirname, 'src/utils/axios_adapter.js'),
    },
  },
})
