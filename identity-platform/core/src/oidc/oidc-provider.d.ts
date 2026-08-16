/**
 * oidc-provider v9 类型声明（#620 生产代码 + 测试共用，唯一权威声明）。
 *
 * 说明：官方包为纯 JS 无类型。早期 #619 的 tests/types/oidc-provider.d.ts
 * 曾声明过一版最小类型；本文件（#620）接管完整声明后，tests/types 中的
 * 重复声明已移除（class 重复声明会被 skipLibCheck 吞掉且成员丢失，
 * 导致 interactionDetails/Interaction 等在生产代码中不可见）。
 *
 * 声明依据：node_modules/oidc-provider@9.11.3 源码
 * （lib/provider.js、lib/models/*.js、lib/helpers/interaction_policy/*、
 *  lib/actions/authorization/*、lib/helpers/defaults.js）。
 */

declare module 'oidc-provider' {
  /** interaction 的 result（interactionFinished 的第三参 / interactionDetails.result） */
  export interface InteractionResult {
    login?: {
      accountId: string
      remember?: boolean
      /** epoch 秒（App Approval 完成时间，作为 auth_time） */
      ts?: number
      amr?: string[]
      acr?: string
    }
    consent?: {
      grantId: string
    }
    error?: string
    error_description?: string
  }

  /** interaction session（provider.interactionDetails 返回 / Interaction.find 结果） */
  export interface InteractionDetails {
    uid: string
    returnTo: string
    prompt: {
      name: string
      reasons: string[]
      details: Record<string, unknown>
    }
    params: Record<string, string | undefined>
    session?: {
      accountId?: string
      uid?: string
      cookie?: string
      acr?: string
      amr?: string[]
    }
    result?: InteractionResult
    lastSubmission?: Record<string, unknown>
    grantId?: string
    exp: number
    save(ttl: number): Promise<string>
    persist(): Promise<string>
    destroy(): Promise<void>
  }

  /** token / code 模型实例（save 返回 jti，payload 字段直接挂在实例上） */
  export interface TokenInstance {
    jti: string
    save(ttl?: number): Promise<string>
    destroy(): Promise<void>
    [key: string]: unknown
  }

  /** Grant 模型实例（interaction 里创建授权码绑定用） */
  export interface GrantInstance extends TokenInstance {
    accountId?: string
    clientId?: string
    addOIDCScope(scope: string): void
    addOIDCClaims(claims: string[]): void
    getOIDCScopeEncountered(): string
  }

  /** 动态加载的 Client 实例（client-loader 组装 metadata 后由 provider 实例化） */
  export interface ClientInstance {
    clientId: string
    clientSecret?: string
    scope?: string
    redirectUris?: string[]
    [key: string]: unknown
  }

  export interface InteractionModel {
    find(id: string, opts?: { ignoreExpiration?: boolean }): Promise<InteractionDetails | undefined>
  }

  /** interactions.url(ctx, interaction) 的 ctx（provider 增强的 Koa context，宽松处理） */
  export type OidcInteractionContext = Record<string, unknown>

  /** custom interaction policy（interaction_policy/prompt.js + check.js） */
  export interface InteractionPolicyCheck {
    reason: string
    description: string
    error?: string
    details?: (ctx: OidcInteractionContext) => unknown
    check: (ctx: OidcInteractionContext) => boolean | Promise<boolean>
  }

  export interface InteractionPolicyPrompt {
    name: string
    requestable: boolean
    details?: (ctx: OidcInteractionContext) => unknown
    checks: InteractionPolicyCheck[]
  }

  /** interactionPolicy.base() 返回的数组（带 add/remove/clear 方法） */
  export interface InteractionPolicyArray extends Array<InteractionPolicyPrompt> {
    add(prompt: InteractionPolicyPrompt, index?: number): void
    remove(name: string): void
    clear(): void
    get(name: string): InteractionPolicyPrompt | undefined
  }

  /** ttl 配置（v9 lib/helpers/defaults.js；值可为 number 或回调） */
  export interface TtlConfiguration {
    AuthorizationCode?: number | ((ctx: unknown, code: unknown, client: unknown) => number)
    AccessToken?: number | ((ctx: unknown, token: unknown, client: unknown) => number)
    IdToken?: number | ((ctx: unknown, token: unknown, client: unknown) => number)
    RefreshToken?: number | ((ctx: unknown, token: unknown, client: unknown) => number)
    Interaction?: number | ((ctx: unknown, interaction: unknown) => number)
    Grant?: number | ((ctx: unknown, grant: unknown) => number)
    [key: string]: unknown
  }

  export interface ProviderConfiguration {
    adapter?: unknown
    clients?: Array<Record<string, unknown>>
    scopes?: string[]
    /** scope → claims 映射；顶层 null 表示不依赖 scope 的内置 claim（acr/amr/auth_time 等） */
    claims?: Record<string, string[] | null>
    subjectTypes?: string[]
    responseTypes?: string[]
    pkce?: { enabled?: boolean; required?: boolean | ((ctx: unknown) => boolean | Promise<boolean>) }
    routes?: {
      authorization?: string
      token?: string
      userinfo?: string
      jwks?: string
      revocation?: string
      end_session?: string
    }
    features?: Record<string, unknown>
    rotateRefreshToken?: boolean | ((ctx: unknown) => boolean | Promise<boolean>)
    ttl?: TtlConfiguration
    jwks?: { keys: Array<Record<string, unknown>> }
    cookies?: { keys?: string[]; long?: Record<string, unknown>; short?: Record<string, unknown> }
    findAccount?: (ctx: unknown, sub: string, token?: unknown) => Promise<unknown> | undefined
    pairwiseIdentifier?: (ctx: unknown, accountId: string, client: unknown) => Promise<string>
    interactions?: {
      url: (ctx: OidcInteractionContext, interaction: InteractionDetails) => Promise<string> | string
      policy?: InteractionPolicyArray
    }
    extraParams?: string[]
    claimsParameter?: { enabled?: boolean }
    [key: string]: unknown
  }

  class Provider {
    constructor(issuer: string, configuration?: ProviderConfiguration)
    /** v9 中 Provider 实例本身就是 Koa app，callback 可直接挂 http server */
    callback(): (req: unknown, res: unknown) => Promise<void>
    /** 动态加载 Client（走 adapter 的 Client 模型） */
    get Client(): {
      find(id: string): Promise<ClientInstance | undefined>
    }
    get AuthorizationCode(): new (payload: Record<string, unknown>) => TokenInstance
    get AccessToken(): new (payload: Record<string, unknown>) => TokenInstance
    get RefreshToken(): new (payload: Record<string, unknown>) => TokenInstance
    get Grant(): new (payload: Record<string, unknown>) => GrantInstance
    /** Interaction 静态模型（find 走 adapter；resume cookie 的值 = uid） */
    get Interaction(): InteractionModel
    /** custom interaction 详情（读取 _interaction cookie 定位 Interaction） */
    interactionDetails(req: unknown, res: unknown): Promise<InteractionDetails>
    /** 结束 interaction：把 result 写入 Interaction 记录并 303 回 returnTo */
    interactionFinished(
      req: unknown,
      res: unknown,
      result: InteractionResult,
      opts?: { mergeWithLastSubmission?: boolean },
    ): Promise<void>
    /** cookie 名（session/interaction/resume） */
    cookieName(type: 'session' | 'interaction' | 'resume'): string
    /** cookie 签名密钥（构造后赋值） */
    keys: string[]
    /** 反向代理信任（Koa 属性；production/preview 必须 true，否则 Discovery 输出 http://） */
    proxy: boolean
    on(event: string, listener: (...args: unknown[]) => void): void
    emit(event: string, ...args: unknown[]): void
  }

  /** custom interaction policy 工厂（interactionPolicy.base / Prompt / Check） */
  export const interactionPolicy: {
    base(): InteractionPolicyArray
    Check: (new (
      reason: string,
      description: string,
      error: string | ((ctx: OidcInteractionContext) => boolean | Promise<boolean>),
      check?: (ctx: OidcInteractionContext) => boolean | Promise<boolean>,
      details?: (ctx: OidcInteractionContext) => unknown,
    ) => InteractionPolicyCheck) & {
      /** check 返回 true = 需要交互（静态属性，见 interaction_policy/check.js） */
      REQUEST_PROMPT: boolean
      /** check 返回 false = 无需交互（静态属性） */
      NO_NEED_TO_PROMPT: boolean
    }
    Prompt: new (
      config: { name: string; requestable?: boolean },
      details?: ((ctx: OidcInteractionContext) => unknown) | InteractionPolicyCheck,
      ...checks: InteractionPolicyCheck[]
    ) => InteractionPolicyPrompt
  }

  export default Provider
}
