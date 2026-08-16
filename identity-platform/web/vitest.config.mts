import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Web 测试配置：只收本工程 tests/ 下的用例（纯函数 + 服务端渲染组件测试，node 环境），
 * 避免向上误用主仓库（tauri-app/）的 vitest 配置。
 * alias '@' 与 tsconfig paths 对齐，供源码（BFF 路由等）与测试共享。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
