import { defineConfig } from 'vitest/config'

/**
 * Core 测试配置：只收本工程 tests/ 下的用例，
 * 避免向上误用主仓库（tauri-app/apps/client/）的 vitest 配置。
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
