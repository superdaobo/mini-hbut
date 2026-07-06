import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('TestFlight 演示账号接入契约', () => {
  it('LoginV3 在真实门户请求前处理测试账号登录', () => {
    const source = readSource('src/components/LoginV3.vue')
    const testAccountIndex = source.indexOf('handleTestAccountLogin')
    const realLoginIndex = source.indexOf("axios.post(`${API_BASE}/v2/start_login`")

    expect(source).toContain("from '../utils/test_account.js'")
    expect(source).toContain('isTestAccountCredentials(username.value, password.value)')
    expect(source).toContain('markTestAccountSession()')
    expect(source).toContain('seedTestAccountCaches(setCachedData')
    expect(testAccountIndex).toBeGreaterThanOrEqual(0)
    expect(realLoginIndex).toBeGreaterThan(testAccountIndex)
  })

  it('App.vue 恢复测试账号会话并跳过真实后台副作用', () => {
    const source = readSource('src/App.vue')

    expect(source).toContain("from './utils/test_account.js'")
    expect(source).toContain("from './utils/test_account_fixtures.js'")
    expect(source).toContain('restoreTestAccountSession()')
    expect(source).toContain('isTestAccountSession()')
    expect(source).toContain('seedTestAccountCaches(setCachedData')
    expect(source).toContain('if (!isTestAccountSession())')
    expect(source).toContain('clearTestAccountSession()')
    expect(source).toContain('clearTestAccountRuntimeCaches()')
    expect(source).not.toContain("clearCacheByPrefix('semesters')")
    expect(source).not.toContain("clearCacheByPrefix('classroom:buildings')")
    expect(source).toMatch(/if \(!wasTestAccountSession\) \{\s*clearWidgetForLogout\(\)\.catch\(\(\) => \{\}\)\s*\}/)
  })

  it('缓存、HTTP 和 native 调用层均接入测试账号演示响应', () => {
    const apiSource = readSource('src/utils/api.js')
    const adapterSource = readSource('src/utils/axios_adapter.js')
    const nativeSource = readSource('src/platform/native.ts')

    expect(apiSource).toContain("from './test_account.js'")
    expect(apiSource).toContain("from './test_account_fixtures.js'")
    expect(apiSource).toContain('resolveTestAccountCachePayload(key)')
    expect(adapterSource).toContain("from './test_account.js'")
    expect(adapterSource).toContain('resolveTestAccountHttpResponse')
    expect(nativeSource).toContain("from '../utils/test_account.js'")
    expect(nativeSource).toContain('resolveTestAccountNativeResponse(command, args)')
  })

  it('直接 fetch 的资料分享和 AI 模块在测试账号下禁用真实网络动作', () => {
    const resourceShareSource = readSource('src/components/ResourceShareView.vue')
    const aiChatSource = readSource('src/components/AiChatView.vue')
    const forumApiSource = readSource('src/utils/forum_api.js')
    const fixtureSource = readSource('src/utils/test_account_fixtures.js')
    const remoteConfigSource = readSource('src/utils/remote_config.js')

    expect(resourceShareSource).toContain("from '../utils/test_account.js'")
    expect(resourceShareSource).toContain('buildTestAccountResourceShareItems')
    expect(resourceShareSource).toContain('if (isTestAccountSession())')
    expect(resourceShareSource).toContain('return getTestAccountResourceDirectUrl')
    expect(resourceShareSource).toContain('const buildPreviewUrlCandidates = (path, signed) => {')
    expect(resourceShareSource).toContain('if (isTestAccountSession()) return [String(signed?.url || \'\').trim()].filter(Boolean)')
    expect(resourceShareSource).toContain('const openDownload = async () => {')
    expect(resourceShareSource).toContain('演示账号不下载真实资料')
    expect(aiChatSource).toContain("from '../utils/test_account.js'")
    expect(aiChatSource).toContain('buildTestAccountAiReply')
    expect(aiChatSource).toContain('if (isTestAccountSession())')
    expect(aiChatSource).toContain('token.value = \'test-account-token\'')
    expect(aiChatSource).toMatch(/const postJson = async[\s\S]*if \(isTestAccountSession\(\)\)/)
    expect(aiChatSource).toContain('const syncRemoteHistory = async () => {')
    expect(aiChatSource).toContain('演示账号不会调用外部 AI 服务')
    expect(forumApiSource).toContain("from './test_account.js'")
    expect(forumApiSource).toContain("from './test_account_fixtures.js'")
    expect(forumApiSource).toContain('resolveTestAccountForumResponse')
    expect(forumApiSource).toContain('if (isTestAccountSession())')
    expect(fixtureSource).toContain('未知测试账号 forum 请求已拦截')
    expect(remoteConfigSource).toContain("from './test_account.js'")
    expect(remoteConfigSource).toContain('if (isTestAccountSession())')
  })

  it('测试账号未知 HTTP 和 native 调用默认拒绝，不继续真实请求', () => {
    const adapterSource = readSource('src/utils/axios_adapter.js')
    const nativeSource = readSource('src/platform/native.ts')

    expect(adapterSource).toContain('未知测试账号 HTTP 请求已拦截')
    expect(adapterSource).toContain('demo_disabled: true')
    expect(nativeSource).toContain('未知测试账号 invoke 已拦截')
    expect(nativeSource).toContain('demo_disabled: true')
  })
})
