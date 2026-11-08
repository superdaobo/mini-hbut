/**
 * T12 应用注册审核 —— 提交请求体解析/校验（路由层）。
 *
 * 职责：把不可信的 JSON 请求体解析为领域层类型（`domain/app-registry/types.js`），
 * 字段缺失/类型错误一律抛 `AppRegistryError`（路由层映射为 400）。
 * 语义级前置校验（entry 与 form 的互斥、release_seq 单调等）复用领域层
 * `assertSubmittable`（lifecycle.ts:107-157），本文件不重写任何规则。
 */
import { AppRegistryError } from '../../domain/app-registry/lifecycle.js'
import type {
  AppForm,
  CasdoorTarget,
  CompatSpec,
  DataDomainRequest,
  ModuleArtifact,
  RedirectUri,
  RedirectUriKind,
} from '../../domain/app-registry/types.js'

/** app_id 业务标识（契约 §2 L33：[a-z0-9_-]{2,48}） */
const APP_ID_RE = /^[a-z0-9_-]{2,48}$/
const REDIRECT_KINDS: readonly string[] = ['web_https', 'native_custom', 'native_loopback']
const STORE_POLICIES: readonly string[] = ['allowed', 'disabled']

/** 提交内容（= 领域 RevisionInput：revision 计算与落库的同一份数据） */
export interface SubmitContent {
  app_id: string
  form: AppForm
  entry: string
  redirect_uris: RedirectUri[]
  allowed_groups: string[]
  data_domains: DataDomainRequest[]
  compat: CompatSpec
  module: ModuleArtifact | null
  casdoor: CasdoorTarget
  owner: string
}

function asString(value: unknown, field: string, opts: { optional?: boolean } = {}): string {
  if (value === undefined || value === null) {
    if (opts.optional) {
      return ''
    }
    throw new AppRegistryError('MISSING_FIELD', `${field} 缺失`)
  }
  if (typeof value !== 'string') {
    throw new AppRegistryError('MISSING_FIELD', `${field} 必须是字符串`)
  }
  return value
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppRegistryError('MISSING_FIELD', `${field} 必须是非空字符串数组`)
  }
  return value.map((item, i) => {
    const text = asString(item, `${field}[${i}]`)
    if (text.trim().length === 0) {
      throw new AppRegistryError('MISSING_FIELD', `${field} 含空项`)
    }
    return text
  })
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AppRegistryError('MISSING_FIELD', `${field} 必须是 JSON 对象`)
  }
  return value as Record<string, unknown>
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AppRegistryError('MISSING_FIELD', `${field} 必须是数字`)
  }
  return value
}

/** 校验路径中的 app_id（格式非法 → 400，由路由层映射） */
export function assertAppId(value: string): string {
  if (!APP_ID_RE.test(value)) {
    throw new AppRegistryError('MISSING_FIELD', `app_id 必须是 [a-z0-9_-]{2,48}：${value.slice(0, 64)}`)
  }
  return value
}

/** 解析提交 body（owner 由路由层注入：提交人自己的 developer_id） */
export function parseSubmitBody(raw: unknown, appId: string, owner: string): SubmitContent {
  const body = asRecord(raw, 'body')

  const formRaw = body.form
  if (formRaw !== 'embedded' && formRaw !== 'external') {
    throw new AppRegistryError('MISSING_FIELD', "form 必须是 'embedded' 或 'external'")
  }

  const entry = asString(body.entry, 'entry', { optional: true })

  const redirectUrisRaw = body.redirect_uris
  if (!Array.isArray(redirectUrisRaw)) {
    throw new AppRegistryError('MISSING_FIELD', 'redirect_uris 必须是数组')
  }
  const redirectUris: RedirectUri[] = redirectUrisRaw.map((item, i) => {
    const rec = asRecord(item, `redirect_uris[${i}]`)
    const uri = asString(rec.uri, `redirect_uris[${i}].uri`)
    const kind = asString(rec.kind, `redirect_uris[${i}].kind`)
    if (!REDIRECT_KINDS.includes(kind)) {
      throw new AppRegistryError(
        'MISSING_FIELD',
        `redirect_uris[${i}].kind 必须是 ${REDIRECT_KINDS.join('/')}`,
      )
    }
    return { uri, kind: kind as RedirectUriKind }
  })

  const allowedGroups = asStringArray(body.allowed_groups, 'allowed_groups')

  const dataDomainsRaw = body.data_domains
  if (!Array.isArray(dataDomainsRaw)) {
    throw new AppRegistryError('MISSING_FIELD', 'data_domains 必须是数组')
  }
  const dataDomains: DataDomainRequest[] = dataDomainsRaw.map((item, i) => {
    const rec = asRecord(item, `data_domains[${i}]`)
    return {
      domain: asString(rec.domain, `data_domains[${i}].domain`),
      operations: asStringArray(rec.operations, `data_domains[${i}].operations`),
      purpose: asString(rec.purpose, `data_domains[${i}].purpose`),
    }
  })

  const compatRec = asRecord(body.compat, 'compat')
  const compat: CompatSpec = {
    min_host: asString(compatRec.min_host, 'compat.min_host'),
    platforms: asStringArray(compatRec.platforms, 'compat.platforms'),
    store_policy: asString(compatRec.store_policy, 'compat.store_policy') as CompatSpec['store_policy'],
  }
  if (!STORE_POLICIES.includes(compat.store_policy)) {
    throw new AppRegistryError('MISSING_FIELD', "compat.store_policy 必须是 'allowed' 或 'disabled'")
  }

  let module: ModuleArtifact | null = null
  if (body.module !== undefined && body.module !== null) {
    const moduleRec = asRecord(body.module, 'module')
    module = {
      manifest_url: asString(moduleRec.manifest_url, 'module.manifest_url'),
      artifact_url: asString(moduleRec.artifact_url, 'module.artifact_url'),
      publisher_key_id: asString(moduleRec.publisher_key_id, 'module.publisher_key_id'),
      release_seq: asNumber(moduleRec.release_seq, 'module.release_seq'),
    }
  }

  const casdoorRec = asRecord(body.casdoor, 'casdoor')
  const casdoor: CasdoorTarget = {
    application_name: asString(casdoorRec.application_name, 'casdoor.application_name'),
    client_id: asString(casdoorRec.client_id, 'casdoor.client_id'),
    expire_in_hours: asNumber(casdoorRec.expire_in_hours, 'casdoor.expire_in_hours'),
    refresh_expire_in_hours: asNumber(casdoorRec.refresh_expire_in_hours, 'casdoor.refresh_expire_in_hours'),
    token_format: asString(casdoorRec.token_format, 'casdoor.token_format'),
    token_fields: asStringArray(casdoorRec.token_fields, 'casdoor.token_fields'),
  }

  return {
    app_id: appId,
    form: formRaw,
    entry,
    redirect_uris: redirectUris,
    allowed_groups: allowedGroups,
    data_domains: dataDomains,
    compat,
    module,
    casdoor,
    owner,
  }
}
