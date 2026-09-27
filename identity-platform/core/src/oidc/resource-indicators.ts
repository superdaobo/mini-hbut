/**
 * 游戏平台 Resource Server（resource indicator → JWT AT）—— #902a。
 *
 * 对应协议 `docs/game-platform/protocol-v1.md` §6.4 推荐方案 **(b)**
 * 「resource-scoped JWT AT + extraTokenClaims 注入受控 claim」。本模块是唯一的
 * 配置/校验入口，provider.ts 只做装配。
 *
 * ⚠️ P1 决策待用户确认（协议 §12 U1）：若最终选择 (a) introspection，
 * 需要改动的清单见 `core/docs/contract.md` §8.4（本模块的 audience/resource
 * indicator 解析与 claim 注入仍可复用，`accessTokenFormat` 需回退为 opaque）。
 *
 * 已核实的 oidc-provider 9.11.3 行为（不要凭直觉改）：
 * - AT 格式按 **token 所属 resource server** 逐 token 决定：
 *   `has_format.js:5-7` → `token.resourceServer?.accessTokenFormat ?? 'opaque'`；
 *   不存在全局 `formats.AccessToken = 'jwt'` 开关。
 * - `features.resourceIndicators.getResourceServerInfo` 未提供实现时，任何带
 *   `resource` 参数的请求 100% 抛错（`defaults.js:296-300` mustChange）。
 * - JWT AT 没有 `aud` 会直接抛错（`formats/jwt.js:145-147`），因此 audience 是硬前提。
 * - `extraTokenClaims(ctx, token)` 对 opaque 与 JWT 两条路径都生效
 *   （`formats/opaque.js:41`、`formats/jwt.js:97-115` 的 `...extra` 展开）。
 *
 * 安全边界（协议 §6.4 硬性前提 1）：`hbut_student_id` 等受控 claim 只注入
 * 「第一方 client + 游戏 audience」的 AT；JWT 是 base64url 明文，任何持有者
 * 都能解码，所以必须是 audience + client 双重限定，而不是只靠 scope。
 */
import type { SqlExecutor } from '../db/types.js'
import { findIdentityByUserId } from '../db/repos/users.repo.js'
import { errors } from 'oidc-provider'

/** 游戏 audience 默认值：必须与 ocr-service `identity_auth/config.py DEFAULT_HF_AUDIENCE` 一致 */
export const DEFAULT_GAME_AUDIENCE = 'mini-hbut-hf-api'

/** 游戏资源服务器允许绑定的 scope（协议 §6.2.1：POST /tickets 要求 game.play） */
export const GAME_RESOURCE_SCOPES = ['game.read', 'game.play'] as const

/** 注入到游戏 AT 的受控 claim（opaque 时代这些 claim 只在 userinfo 出现） */
export const GAME_AT_CLAIMS = [
  'hbut_student_id',
  'hbut_student_name',
  'hbut_verification_method',
  'hbut_verified_at',
] as const

export interface GameResourceOptions {
  /** 游戏 audience（协议 §6.4 硬性前提 2 固定为 mini-hbut-hf-api；可用 env 覆盖） */
  audience?: string
  /** resource indicator（绝对 https URI）；缺省 `https://<audience>` */
  indicator?: string
  /** 允许申请游戏 resource 的第一方 client_id 白名单；**空数组 = fail closed（默认）** */
  allowedClientIds?: readonly string[]
  /**
   * #902 第一方设备换票（device-signed token exchange）所代表的 client_id。
   *
   * 设备换票签发的 JWT AT 必须与 `/oauth/token` 的产物同构：同 audience、同 scope、
   * 同 claim 规则；而 `hbut_student_id` 等受控 claim 的注入前提是 **第一方 client**
   * （见 createExtraTokenClaims）。因此换票路径必须显式声明它代表哪个第一方 client：
   * - 未配置（默认）= 该能力整体关闭（换票端点 fail closed，不签发任何 AT）；
   * - 配置时必须 ∈ allowedClientIds（否则启动期抛错，防止把 AT 签给未获准的 client）。
   * `null` 与缺省等价（能力关闭）：允许把已 resolve 的配置再次传入（幂等解析）。
   */
  deviceTokenClientId?: string | null
}

export interface ResolvedGameResourceConfig {
  audience: string
  indicator: string
  allowedClientIds: readonly string[]
  /** 设备换票代表的 client_id；null = 能力关闭（fail closed 默认值） */
  deviceTokenClientId: string | null
  /** 空格分隔的 resource server scope（v9 ResourceServer.scopes 解析用） */
  scope: string
}

/**
 * 解析并校验游戏 resource 配置（启动期 fail fast）：
 * - audience 非空；
 * - indicator 必须是绝对 https URI（oidc-provider 的 check_resource 也要求绝对 URI，
 *   这里提前失败以给出可读错误，而不是运行期 invalid_target）；
 * - 白名单去重、去空白；空 = 任何请求都不放行（灰度默认，行为零暴露）；
 * - deviceTokenClientId 若配置，必须落在白名单内（设备换票的信任边界）。
 */
export function resolveGameResourceConfig(opts: GameResourceOptions = {}): ResolvedGameResourceConfig {
  const audience = (opts.audience ?? DEFAULT_GAME_AUDIENCE).trim()
  if (!audience) {
    throw new Error('[oidc.game-resource] IDENTITY_GAME_RESOURCE_AUDIENCE 不能为空')
  }
  const indicator = (opts.indicator ?? `https://${audience}`).trim()
  let parsed: URL | null = null
  try {
    parsed = URL.parse(indicator)
  } catch {
    parsed = null
  }
  if (!parsed || parsed.protocol !== 'https:') {
    throw new Error(
      `[oidc.game-resource] resource indicator 必须是绝对 https URI（当前：${indicator}）`,
    )
  }
  const allowedClientIds = [
    ...new Set((opts.allowedClientIds ?? []).map((s) => s.trim()).filter(Boolean)),
  ]
  const deviceTokenClientId = (opts.deviceTokenClientId ?? '').trim() || null
  if (deviceTokenClientId && !allowedClientIds.includes(deviceTokenClientId)) {
    throw new Error(
      '[oidc.game-resource] IDENTITY_GAME_DEVICE_TOKEN_CLIENT_ID 必须在 IDENTITY_GAME_RESOURCE_CLIENTS 白名单内',
    )
  }
  return {
    audience,
    indicator,
    allowedClientIds,
    deviceTokenClientId,
    scope: GAME_RESOURCE_SCOPES.join(' '),
  }
}

/** 设备换票能力是否开启（未配置 client 白名单或未指定换票 client → 关闭） */
export function isDeviceTokenExchangeEnabled(config: ResolvedGameResourceConfig): boolean {
  return config.deviceTokenClientId !== null
}

/** 判断 token 是否属于游戏 resource server（按 audience 精确匹配） */
export function isGameResourceToken(
  config: ResolvedGameResourceConfig,
  token: { resourceServer?: { audience?: unknown } } | undefined,
): boolean {
  return token?.resourceServer?.audience === config.audience
}

/** 判断 client 是否为第一方（游戏 resource 白名单） */
export function isFirstPartyGameClient(
  config: ResolvedGameResourceConfig,
  clientId: unknown,
): boolean {
  return typeof clientId === 'string' && config.allowedClientIds.includes(clientId)
}

/**
 * `features.resourceIndicators.getResourceServerInfo` 的实现工厂。
 *
 * 语义（fail closed）：
 * - 只承认**唯一**配置的 indicator；其它 indicator → invalid_target；
 * - indicator 正确但 client 不在第一方白名单 → invalid_target
 *   （第三方 client 永远拿不到游戏 JWT AT，也就永远不会有学号进 AT）；
 * - 命中时返回 `{ audience, scope, accessTokenFormat: 'jwt' }`
 *   —— 只有这条路径上的 AT 才是 JWT，其余既有授权仍是 opaque（行为零变化）。
 *
 * 不使用 `accessTokenTTL` 覆盖：沿用全局 AccessToken TTL（3600s，协议 §6.1），
 * 撤销语义由 Launch Ticket（60–120s 一次性）+ Game Session（≤1800s，可撤销）承担。
 */
export function createGetResourceServerInfo(
  config: ResolvedGameResourceConfig,
): (ctx: unknown, indicator: string, client: { clientId?: unknown } | undefined) => Promise<{
  audience: string
  scope: string
  accessTokenFormat: 'jwt'
}> {
  return async (_ctx, indicator, client) => {
    if (indicator !== config.indicator) {
      throw new errors.InvalidTarget('resource indicator is unknown')
    }
    if (!isFirstPartyGameClient(config, client?.clientId)) {
      throw new errors.InvalidTarget('resource indicator is not allowed for this client')
    }
    return {
      audience: config.audience,
      scope: config.scope,
      accessTokenFormat: 'jwt',
    }
  }
}

/**
 * 在授权码 / refresh token 上解析出已授权的游戏 resource scope（交互桥用）。
 *
 * 与 v9 内建 consent 的 `missingResourceScopes` 语义一致：只授予
 * 「请求 scope ∩ resource server 声明 scope」，绝不放大到 resource server
 * 的全部 scope；indicator 非法或 client 未获准 → 抛 InvalidTarget（fail closed，
 * 调用方必须把它转成 400，绝不能静默丢弃 resource 后继续发码）。
 */
export function resolveGrantedResourceScope(
  config: ResolvedGameResourceConfig,
  indicator: string,
  clientId: string | undefined,
  requestedScopes: readonly string[],
): string {
  if (indicator !== config.indicator) {
    throw new errors.InvalidTarget('resource indicator is unknown')
  }
  if (!isFirstPartyGameClient(config, clientId)) {
    throw new errors.InvalidTarget('resource indicator is not allowed for this client')
  }
  const allowed = new Set<string>(GAME_RESOURCE_SCOPES)
  const granted = requestedScopes.filter((s) => allowed.has(s))
  if (granted.length === 0) {
    throw new errors.InvalidTarget('no requested scope belongs to the game resource server')
  }
  return granted.join(' ')
}

/**
 * `extraTokenClaims(ctx, token)` 的实现工厂（协议 §6.4 硬性前提 1）。
 *
 * 只有「游戏 audience 的 JWT AT + 第一方 client」才注入受控 claim；
 * 其余情况返回 undefined（opaque AT payload 保持零变化）。
 * 账户无绑定身份 / DB 异常 → 返回 undefined（claim 缺席），绝不让 token 签发失败：
 * 签发失败会把「可选增强 claim」升级为认证不可用，代价远大于收益。
 */
export function createExtraTokenClaims(
  sql: SqlExecutor,
  config: ResolvedGameResourceConfig,
): (ctx: unknown, token: unknown) => Promise<Record<string, unknown> | undefined> {
  return async (ctx, token) => {
    const t = token as {
      accountId?: unknown
      clientId?: unknown
      resourceServer?: { audience?: unknown }
    } | undefined
    if (!isGameResourceToken(config, t)) {
      return undefined
    }
    const clientId = typeof t?.clientId === 'string'
      ? t.clientId
      : ((ctx as { oidc?: { client?: { clientId?: unknown } } } | undefined)?.oidc?.client?.clientId)
    if (!isFirstPartyGameClient(config, clientId)) {
      // 双保险：正常情况下 getResourceServerInfo 已挡掉非第一方 client
      return undefined
    }
    const accountId = typeof t?.accountId === 'string' ? t.accountId : undefined
    if (!accountId) {
      return undefined
    }
    try {
      const identity = await findIdentityByUserId(sql, accountId)
      if (!identity) {
        return undefined
      }
      const claims: Record<string, unknown> = { hbut_student_id: identity.subject }
      if (identity.student_name_snapshot) {
        claims.hbut_student_name = identity.student_name_snapshot
      }
      claims.hbut_verification_method = identity.verification_method
      claims.hbut_verified_at = identity.verified_at.toISOString()
      return claims
    } catch {
      // DB 短暂不可用等：claim 缺席而非签发失败（与 userinfo 的可选数据姿态一致）
      return undefined
    }
  }
}
