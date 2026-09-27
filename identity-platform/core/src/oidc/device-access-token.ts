/**
 * 第一方设备换票 → JWT Access Token 签发器（#902）。
 *
 * 链路（用户拍板方案 ii）：Device Key → Identity Access Token → Game Launch Ticket → Game Session
 *
 * 「同构」是本模块的第一要求（协议 §6.4 硬性前提 1/2 + #902 任务书）：
 * 本模块**不自己拼 JWT**，而是用 oidc-provider 自己的 AccessToken 模型（`provider.AccessToken`）
 * 签发，因此与 `/oauth/token`（resource indicator 路径）产物逐字段同构：
 *   - 同一个 keystore / kid / alg（RS256，typ=at+jwt）；
 *   - 同一个 resourceServer（audience = DEFAULT_GAME_AUDIENCE，accessTokenFormat='jwt'）→ 同 aud；
 *   - 同一个 scope 语义（GAME_RESOURCE_SCOPES：game.read game.play）；
 *   - 同一个 `extraTokenClaims`（provider 配置里注入）→ 同一套受控 claim 注入规则
 *     （hbut_student_id 等只对「第一方 client + 游戏 audience」出现）；
 *   - 同一个 pairwiseIdentifier → 同一种 sub 派生（sub 绝不等/含学号）。
 * 换言之：把「谁能拿 AT」的差异收敛到本模块的入口校验，token 本体零差异。
 *
 * 安全硬约束（逐条对应任务书）：
 * 1. 只有设备签名路径能进来（见 api/app/device-token.ts），本模块不接受任何调用方传入的
 *    audience / scope / client_id —— 全部来自 resolveGameResourceConfig 的白名单配置；
 * 2. 未配置 deviceTokenClientId（或该 client 已不存在/非 active）→ 能力关闭，
 *    抛 DeviceTokenDisabledError，绝不「退而求其次」用别的 client 签发；
 * 3. V1 **不签发 Refresh Token**：本模块只构造 AccessToken 模型，不触碰 Grant/RefreshToken，
 *    响应里也没有 refresh_token 字段（到期后由客户端重新走设备签名换取）；
 * 4. AT TTL 默认 900s（见 DEVICE_TOKEN_ACCESS_TTL_SECONDS 注释）；
 * 5. 签发后做形状自检（JWT 三段 + typ=at+jwt + aud 正确 + hbut_student_id 存在），
 *    任何一条不满足即 fail closed（不返回 token），避免把「不可用的 AT」交给客户端后
 *    在资源服务器侧表现为 401 的静默故障。
 */
import type { ResolvedGameResourceConfig } from './resource-indicators.js'
import { GAME_RESOURCE_SCOPES } from './resource-indicators.js'

/**
 * 设备换票 AT 的 TTL（秒）。
 *
 * 取值理由（任务书要求给出理由）：
 * - 现有 `/oauth/token` 的 AT 是 3600s，但那条路径有 Refresh Token 可续期（rotation + 撤销），
 *   而本路径 **V1 不签发 Refresh Token**，AT 是设备签名换来的「一次性短期凭据」；
 * - 游戏链路的真实暴露面在 Launch Ticket（60–120s 一次性）与 Game Session（≤1800s 可撤销），
 *   AT 只用于 `POST /tickets` 这一跳，不需要长寿命；
 * - 900s（15 分钟）在同一局游戏的正常时长内，避免换票与开局之间过期导致体验抖动，
 *   同时把「设备已撤销但 AT 仍在窗口内」的残余风险压到 ≤15 分钟（协议 §6.6 撤销延迟上界的同量级）；
 * - 到期后由客户端重新走设备签名换取（无 refresh token，符合用户明确的 V1 范围）。
 */
export const DEVICE_TOKEN_ACCESS_TTL_SECONDS = 900

/** 配置缺失 / client 不可用：设备换票能力整体关闭（fail closed，对应 403 FEATURE_DISABLED） */
export class DeviceTokenDisabledError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeviceTokenDisabledError'
  }
}

/** 签发链路内部异常（keystore/模型不可用、形状自检失败）——对应 500 INTERNAL，绝不返回半成品 token */
export class DeviceTokenIssuanceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeviceTokenIssuanceError'
  }
}

/** oidc-provider 的签发 API（只声明本模块用到的部分；运行期仍做显式校验） */
interface OidcTokenMintingProvider {
  Client: { find(id: string): Promise<unknown> }
  AccessToken: new (input: {
    client: unknown
    accountId: string
    scope: string
    resourceServer: { audience: string; accessTokenFormat: 'jwt' }
    expiresIn: number
  }) => { save(): Promise<string> }
}

/** 运行期校验 provider 暴露了签发所需的 API（缺失即内部错误，绝不静默跳过） */
function assertTokenMintingProvider(provider: unknown): OidcTokenMintingProvider {
  const candidate = provider as Partial<OidcTokenMintingProvider> | null | undefined
  if (
    !candidate ||
    typeof candidate.Client?.find !== 'function' ||
    typeof candidate.AccessToken !== 'function'
  ) {
    throw new DeviceTokenIssuanceError('oidc-provider 未提供 AccessToken/Client 签发接口')
  }
  return candidate as OidcTokenMintingProvider
}

/** 只做 base64url JSON 解码（**不验签**）：用于签发后形状自检，不作为信任决策依据 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new DeviceTokenIssuanceError('签发的 AT 不是 JWT 形状')
  }
  const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as Record<string, unknown>
  if (header.typ !== 'at+jwt') {
    throw new DeviceTokenIssuanceError('签发的 AT 缺少 typ=at+jwt 头')
  }
  return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as Record<string, unknown>
}

export interface IssuedDeviceAccessToken {
  /** JWT Access Token（只在本次响应中出现一次；调用方不得写日志/落盘） */
  accessToken: string
  /** 有效期（秒），权威值来自服务端配置 */
  expiresIn: number
  /** 资源绑定 scope（空格分隔），与 /oauth/token 的 JWT AT 同语义 */
  scope: string
  /** audience（供客户端/日志做非敏感断言；不含学号等 PII） */
  audience: string
}

export interface DeviceAccessTokenIssuerDeps {
  /** oidc-provider 实例（装配在 app.ts / api/index.ts） */
  provider: unknown
  /** #902a 已解析的游戏 resource 配置（audience/scope/第一方 client 白名单的唯一来源） */
  gameResource: ResolvedGameResourceConfig
  /** AT TTL 覆盖（仅测试/灰度需要；缺省 DEVICE_TOKEN_ACCESS_TTL_SECONDS） */
  ttlSeconds?: number
}

/**
 * 构造签发器：`(userId) => IssuedDeviceAccessToken`。
 * userId 只允许来自服务端设备记录（device.user_id），**绝不接受请求体传入**。
 */
export function createDeviceAccessTokenIssuer(
  deps: DeviceAccessTokenIssuerDeps,
): (userId: string) => Promise<IssuedDeviceAccessToken> {
  const ttlSeconds = deps.ttlSeconds ?? DEVICE_TOKEN_ACCESS_TTL_SECONDS
  // 资源绑定 scope 一律取自资源服务器声明，绝不接受调用方传入
  const scope = deps.gameResource.scope || GAME_RESOURCE_SCOPES.join(' ')

  return async (userId: string): Promise<IssuedDeviceAccessToken> => {
    const clientId = deps.gameResource.deviceTokenClientId
    if (!clientId) {
      throw new DeviceTokenDisabledError('未配置 IDENTITY_GAME_DEVICE_TOKEN_CLIENT_ID，设备换票能力关闭')
    }
    const provider = assertTokenMintingProvider(deps.provider)

    // 只在「配置的白名单 client 存在且 active」时才签发（client 已吊销 → 能力关闭）
    const client = await provider.Client.find(clientId).catch(() => undefined)
    if (!client) {
      throw new DeviceTokenDisabledError('设备换票配置的 client 不存在或不可用')
    }

    const token = new provider.AccessToken({
      client,
      // accountId = 内部 user_id（与 /oauth/token 一致）；pairwise sub 由 provider 派生
      accountId: userId,
      scope,
      // resourceServer 决定 aud 与 AT 格式（'jwt'）；这一步与 902a 的 getResourceServerInfo 等价
      resourceServer: {
        audience: deps.gameResource.audience,
        accessTokenFormat: 'jwt',
      },
      expiresIn: ttlSeconds,
    })

    let accessToken: string
    try {
      accessToken = await token.save()
    } catch (err) {
      throw new DeviceTokenIssuanceError(`JWT AT 签发失败：${(err as Error).message}`)
    }
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new DeviceTokenIssuanceError('JWT AT 签发返回空值')
    }

    // 形状自检（防配置漂移导致生产静默签发不可用的 token）
    const payload = decodeJwtPayload(accessToken)
    if (payload.aud !== deps.gameResource.audience) {
      throw new DeviceTokenIssuanceError('签发的 AT audience 与配置不一致')
    }
    const studentId = typeof payload.hbut_student_id === 'string' ? payload.hbut_student_id : ''
    if (!studentId) {
      // 受控 claim 缺失说明身份链路异常（设备换票路径不存在「无身份」的合法设备）
      throw new DeviceTokenIssuanceError('签发的 AT 缺少受控 claim hbut_student_id')
    }

    return {
      accessToken,
      expiresIn: ttlSeconds,
      scope,
      audience: deps.gameResource.audience,
    }
  }
}
