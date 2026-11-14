import { readFileSync } from 'node:fs'
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
  // 直接读：文件缺失/改名时抛错，避免断言静默通过
  return readFileSync(resolve(process.cwd(), path), 'utf8')
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

  it('视图里其余跨模块标识符都已导入/本地声明（#1301 复审 B1）', () => {
    const view = readSource('src/components/AiChatView.vue')
    const model = readSource('src/features/ai/chat-model.js')
    const importStart = view.indexOf('import {')
    const importEnd = view.indexOf("} from '../features/ai/chat-model.js'")
    expect(importStart).toBeGreaterThanOrEqual(0)
    expect(importEnd).toBeGreaterThan(importStart)
    const importBlock = view.slice(importStart, importEnd)
    for (const symbol of ['normalizeMathText', 'isAiUnauthorizedText', 'hasTauriRuntime']) {
      expect(importBlock).toContain(symbol)
    }
    // activeBridgeBase/Index 是视图内可变状态（ESM 导入绑定只读，不能 import 后赋值）
    expect(view).toContain('let activeBridgeIndex = 0')
    expect(view).toContain('let activeBridgeBase = AI_BRIDGE_CANDIDATES[0]')
    expect(model).not.toContain('let activeBridgeIndex')
    expect(model).not.toContain('let activeBridgeBase')
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
