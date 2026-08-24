/**
 * 账户级 API Key 消费层（Web BFF → Core，issue #688）。
 *
 * 与 client.ts（#624 应用管理）平行的独立通道：
 * - 真实模式：调用 Core 的 {coreBaseUrl}/api/v1/developer/keys*，
 *   x-developer-subject 传会话推导的 sub（owner 永不出自请求体）；
 *   #626 服务令牌一并附加（Core 按前缀 /api/v1/developer/ 校验）。
 * - 桩模式（IDENTITY_CORE_STUB=1 或 IDENTITY_OIDC_STUB=1，与 client.ts 同开关）：
 *   进程内内存桩，语义与真实 Core 一致（明文只返回一次 / 列表无敏感值 / 吊销幂等）。
 */

import { coreBaseUrl } from '@/lib/core-client/index'
import { serviceTokenHeaders } from '@/lib/security/service-token'

export type EnvLike = Record<string, string | undefined>

/** Key 状态（与 core migrations/0005 CHECK 约束一致） */
export type ApiKeyStatus = 'active' | 'revoked'

/** Key 元信息 DTO（契约 v1：绝不含明文 secret_hash） */
export interface ApiKeyInfoDTO {
  id: string
  name: string
  prefix: string
  status: ApiKeyStatus
  last_used_at?: string
  created_at: string
}

/** 签发结果：key 明文仅此一次 */
export interface CreateApiKeyResult {
  key: string
  info: ApiKeyInfoDTO
}

function isStubMode(env: EnvLike): boolean {
  return env.IDENTITY_CORE_STUB === '1' || env.IDENTITY_OIDC_STUB === '1'
}

/** 真实 Core 客户端（服务端 fetch；错误码映射与 developer API 一致） */
export function createDeveloperKeysHttpClient(baseUrl: string, fetchImpl: typeof fetch = fetch): DeveloperKeysApi {
  async function request<T>(method: string, path: string, sub: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        'x-developer-subject': sub,
        // #626：BFF → Core 服务令牌（IDENTITY_SERVICE_TOKEN）
        ...serviceTokenHeaders(),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    })
    if (!res.ok) {
      let code = 'internal'
      try {
        const parsed = (await res.json()) as { error?: string }
        if (
          parsed &&
          ['unauthorized', 'forbidden', 'not_found', 'invalid_request', 'invalid_state', 'internal'].includes(parsed.error ?? '')
        ) {
          code = parsed.error as string
        }
      } catch {
        // 非 JSON 错误体：保持 internal，不向客户端回显
      }
      throw new Error(`API_KEY_${res.status}_${code}`)
    }
    if (res.status === 204) {
      return undefined as T
    }
    return (await res.json()) as T
  }

  return {
    listKeys: async (sub) => {
      const data = await request<{ keys: ApiKeyInfoDTO[] }>('GET', '/api/v1/developer/keys', sub)
      return data.keys
    },
    createKey: (sub, name) =>
      request<CreateApiKeyResult>('POST', '/api/v1/developer/keys', sub, { name }),
    revokeKey: (sub, id) =>
      request<void>('DELETE', `/api/v1/developer/keys/${encodeURIComponent(id)}`, sub),
  }
}

/**
 * 极简内存桩（仅 IDENTITY_CORE_STUB=1 本地开发用；进程级存储不持久化）。
 * 固化与真实 Core 相同的安全属性：列表只含元信息、明文只在签发响应出现。
 */
interface StubKeyRecord extends ApiKeyInfoDTO {
  userId: string
}
const stubKeys: StubKeyRecord[] = []

function createStubClient(): DeveloperKeysApi {
  return {
    listKeys: async (sub) =>
      stubKeys
        .filter((k) => k.userId === sub)
        .map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          status: k.status,
          created_at: k.created_at,
        })),
    createKey: async (sub, name) => {
      const rand = (): string => Math.random().toString(36).slice(2, 10)
      const prefix = `mhbat_stub0${rand().slice(0, 2)}`
      const full = `${prefix}_${rand()}${rand()}${rand()}${rand()}`
      const createdAt = new Date().toISOString()
      const record: StubKeyRecord = {
        userId: sub,
        id: `ak_stub_${rand()}`,
        name,
        prefix,
        status: 'active',
        created_at: createdAt,
      }
      stubKeys.push(record)
      const info: ApiKeyInfoDTO = {
        id: record.id,
        name: record.name,
        prefix: record.prefix,
        status: 'active',
        created_at: createdAt,
      }
      return { key: full, info }
    },
    revokeKey: async (sub, id) => {
      const found = stubKeys.find((k) => k.userId === sub && k.id === id)
      if (!found) {
        throw new Error('API_KEY_404_not_found')
      }
      found.status = 'revoked'
    },
  }
}

export interface DeveloperKeysApi {
  listKeys(sub: string): Promise<ApiKeyInfoDTO[]>
  /** 返回整串明文（仅此一次）；Core 侧校验名称非空 */
  createKey(sub: string, name: string): Promise<CreateApiKeyResult>
  /** 吊销（幂等；非本人 → 抛 not_found） */
  revokeKey(sub: string, id: string): Promise<void>
}

/** 按环境选择客户端（fail closed：非 stub 必须配置 IDENTITY_CORE_BASE_URL） */
export function getDeveloperKeysApi(env: EnvLike = process.env): DeveloperKeysApi {
  if (isStubMode(env)) {
    return createStubClient()
  }
  return createDeveloperKeysHttpClient(coreBaseUrl(env))
}
