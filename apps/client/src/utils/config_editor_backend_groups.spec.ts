/**
 * T9 配置工具「后端端点组」契约测试。
 *
 * 覆盖：
 * - ConfigEditor.vue 具备端点组编辑能力（增删/排序/启停/失败策略）与导出前校验
 * - 导出的配置结构能被 normalizeRemoteConfig + normalizeBackendConfig **无损解析**（round-trip）
 * - i18n 三语言 key 齐备（i18n_coverage 之外的最小自检）
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { normalizeBackendConfig } from './backend_endpoints'
import { normalizeRemoteConfig } from './remote_config'

const read = (relative: string): string => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8')

describe('ConfigEditor 端点组编辑（契约 §3）', () => {
  const source = read('src/components/ConfigEditor.vue')

  it('暴露端点组编辑入口与控制函数', () => {
    expect(source).toContain('config.section.backendGroups')
    expect(source).toContain('addEndpointGroup')
    expect(source).toContain('removeEndpointGroup')
    expect(source).toContain('moveEndpointGroup')
    expect(source).toContain('validateBackendGroups')
  })

  it('导出前校验：至少一个启用组 / ID 唯一 / origin 仅 https', () => {
    expect(source).toContain('config.error.noEnabledGroup')
    expect(source).toContain('config.error.groupIdDuplicate')
    expect(source).toContain('config.error.groupBaseInvalid')
  })

  it('默认配置使用契约常量（不硬编码生产域字面量）', () => {
    expect(source).toContain('PRIMARY_BACKEND_ORIGIN')
    expect(source).toContain('FALLBACK_BACKEND_ORIGIN')
    expect(source).not.toContain("'https://mini.hbut.site'")
  })

  it('三语言 key 齐备', () => {
    for (const locale of ['zh-CN', 'en', 'ja']) {
      const dict = read(`src/utils/i18n/messages/${locale}.ts`)
      for (const key of [
        'config.section.backendGroups',
        'config.hint.backendGroups',
        'config.label.groupId',
        'config.label.groupBase',
        'config.failoverTtl',
        'config.action.addGroup',
        'config.error.noEnabledGroup'
      ]) {
        // failoverTtl 的完整 key 是 config.label.failoverTtl
        const normalizedKey = key === 'config.failoverTtl' ? 'config.label.failoverTtl' : key
        expect(dict, `${locale} 缺 ${normalizedKey}`).toContain(`'${normalizedKey}'`)
      }
    }
  })
})

describe('导出配置 round-trip（契约 §3/§4）', () => {
  it('配置工具导出的 backend 块可被归一化无损解析', () => {
    const exported = {
      backend: {
        groups: [
          { id: 'mini', base: 'https://mini.hbut.site', enabled: true },
          { id: 'hf-prod', base: 'https://mini-hbut-ocr-service.hf.space', enabled: true }
        ],
        failover: { enabled: true, failure_ttl_seconds: 300, max_attempts_per_request: 2 }
      }
    }
    const parsed = normalizeBackendConfig(exported.backend)
    expect(parsed.groups.map((group) => group.id)).toEqual(['mini', 'hf-prod'])
    expect(parsed.groups[0].base).toBe('https://mini.hbut.site')
    expect(parsed.failover.failureTtlSeconds).toBe(300)
    expect(parsed.failover.maxAttemptsPerRequest).toBe(2)
  })

  it('完整远程配置（含 backend）经 normalizeRemoteConfig 后仍携带 backend', () => {
    const parsed = normalizeRemoteConfig({
      backend: {
        groups: [{ id: 'mini', base: 'https://mini.hbut.site' }],
        failover: { enabled: true }
      }
    })
    expect(parsed.backend.groups).toHaveLength(1)
    expect(parsed.backend.groups[0].base).toBe('https://mini.hbut.site')
  })

  it('非法端点组在解析层被丢弃（不静默进入候选）', () => {
    const parsed = normalizeBackendConfig({
      groups: [
        { id: 'ok', base: 'https://ok.example.com' },
        { id: 'bad', base: 'http://plain.example.com' },
        { id: 'ok', base: 'https://dup.example.com' }
      ]
    })
    expect(parsed.groups.map((group) => group.id)).toEqual(['ok'])
    expect(parsed.groups[0].base).toBe('https://ok.example.com')
  })
})
