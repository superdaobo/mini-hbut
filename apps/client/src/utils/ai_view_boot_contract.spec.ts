import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error 纯 JS 模块无类型声明；本用例只验证「模块可求值」（#1301 回归）
import { hasTauriRuntime } from '../features/ai/chat-model.js'

/**
 * #1301：校园助手打开空白。
 * 根因是 `chat-model.js` 在模块顶层调用未导入的 `isTauriRuntime`，
 * 导致整个 AiChatView 动态 import 失败、页面渲染为空。
 * 本用例直接 import 该模块做「顶层求值」回归（旧代码这里会抛 ReferenceError）。
 */
const readSource = (path: string) => {
  const resolved = resolve(process.cwd(), path)
  return existsSync(resolved) ? readFileSync(resolved, 'utf8') : ''
}

describe('AI view boot contract (#1301)', () => {
  it('chat-model 顶层求值不依赖未定义标识符', () => {
    expect(typeof hasTauriRuntime).toBe('boolean')
  })

  it('chat-model 显式导入 isTauriRuntime', () => {
    const model = readSource('src/features/ai/chat-model.js')
    expect(model).toContain("import { isTauriRuntime } from '../../platform/native'")
    expect(model).toContain('export const hasTauriRuntime = isTauriRuntime()')
  })

  it('AiChatView 里对 hasTauriRuntime 的引用已导入', () => {
    const view = readSource('src/components/AiChatView.vue')
    expect(view).toMatch(
      /import\s*\{[\s\S]*?hasTauriRuntime[\s\S]*?\}\s*from '\.\.\/features\/ai\/chat-model\.js'/
    )
    expect(view).toContain('if (!hasTauriRuntime) return')
  })

  it('availableModelSet 归属视图（依赖视图 ref），不再放在纯逻辑模块', () => {
    const model = readSource('src/features/ai/chat-model.js')
    const view = readSource('src/components/AiChatView.vue')
    expect(model).not.toContain('export const availableModelSet')
    expect(model).not.toContain('computed(')
    expect(view).toContain('const availableModelSet = computed(')
  })

  it('异步视图加载失败时渲染兜底页而不是空白', () => {
    const registry = readSource('src/app/viewRegistry.ts')
    expect(registry).toContain('errorComponent: AsyncViewError')
    expect(registry).toContain('页面加载失败，请返回重试')
    expect(registry).toContain("emits: ['back']")
  })
})
