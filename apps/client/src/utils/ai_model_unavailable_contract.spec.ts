import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { messages } from './app_i18n'
// @ts-expect-error 纯 JS 模块无类型声明
import { parseStreamEvents } from '../features/ai/chat-model.js'

/**
 * #1369：校园助手「模型不可用」修复契约。
 *
 * 上游（virtualhuman streamAnswer）会把业务错误塞进 HTTP 200 响应体的 msg 字段，
 * 例如 {"code":200,"msg":"模型名非法"}。修复要求：
 * - 后端归一化层把它转成 {event:"error", model_keyword:true}，不进正文 delta；
 * - 前端 isIllegalModelError 识别后轮换下一个候选模型；
 * - 不得再引用不存在的 i18n key（旧代码引用 ai.error.illegal / ai.error.model）。
 */
const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const T_KEY_PATTERN = /\btf?\(\s*'([^']+)'/g

const collectTKeys = (source: string): string[] => {
  const keys: string[] = []
  for (const match of source.matchAll(T_KEY_PATTERN)) {
    keys.push(match[1])
  }
  return keys
}

describe('AI 模型不可用软错误契约（#1369）', () => {
  it('AiChatView 引用的 t()/tf() key 全部存在于 zh-CN 字典', () => {
    const view = readSource('src/components/AiChatView.vue')
    const zhKeys = new Set(Object.keys(messages['zh-CN']))
    const missing = collectTKeys(view).filter((key) => !zhKeys.has(key))
    expect(missing).toEqual([])
  })

  it('不再引用死 key ai.error.illegal / ai.error.model', () => {
    const view = readSource('src/components/AiChatView.vue')
    expect(view).not.toContain("t('ai.error.illegal')")
    expect(view).not.toContain("t('ai.error.model')")
  })

  it('buildModelCandidates 不再强制回收 qwen-max/qwen-plus', () => {
    const view = readSource('src/components/AiChatView.vue')
    const start = view.indexOf('const buildModelCandidates')
    const end = view.indexOf('\n}', start)
    const body = view.slice(start, end)
    expect(body).not.toContain("push('qwen-max')")
    expect(body).not.toContain("push('qwen-plus')")
  })

  it('流式 error 事件带 model_keyword 透传（前端据它轮换模型）', () => {
    const events = parseStreamEvents(
      '{"event":"error","message":"model unavailable","model_keyword":true}'
    )
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('error')
    expect(events[0].model_keyword).toBe(true)
    expect(events[0].message).toBe('model unavailable')
  })

  it('后端归一化层把 {code,msg} 软错误转为 error 事件', () => {
    const routes = readSource('src-tauri/src/http_server/routes/ai.rs')
    expect(routes).toContain('extract_upstream_error_msg')
    expect(routes).toContain('"event": "error"')
    expect(routes).toContain('"model_keyword"')
    const modules = readSource('src-tauri/src/modules/ai.rs')
    expect(modules).toContain('pub(crate) fn extract_upstream_error_msg')
    expect(modules).toContain('pub(crate) fn is_upstream_model_error')
  })
})
