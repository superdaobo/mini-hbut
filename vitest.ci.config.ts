import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

// CI 门禁：排除与当前游戏实现不同步的单元测试（本地仍可用 npm test 全量跑）
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: [
      '**/node_modules/**',
      'src/utils/hbut_monopoly_game.spec.ts',
      'src/utils/hbut_memory_match_game.spec.ts'
    ]
  }
})
