import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

// CI 门禁：全量运行 src 下单元测试（含全部游戏实现测试）
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // 与 vite.config 对齐：项目无 axios npm 包，统一走自研适配器（#715）
      axios: resolve(__dirname, 'src/utils/axios_adapter.js')
    }
  },
  test: {
    // Epic #1243：packages 下的示例 SDK 也要进 CI 门禁（此前只跑 src）
    include: ['src/**/*.spec.ts', 'packages/**/src/**/*.spec.ts'],
    exclude: ['**/node_modules/**']
  }
})
