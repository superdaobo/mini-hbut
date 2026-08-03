import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

// CI 门禁：全量运行 src 下单元测试（含全部游戏实现测试）
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['**/node_modules/**']
  }
})
