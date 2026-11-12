/**
 * src/features/identity/dataAuthzErrors.ts —— 【检查 6】R8：数据授权（data authz）
 * 拒绝 kind → 可读中文文案的稳定分类器。
 *
 * 背景：ocr-service P3-2 数据授权改造后，拒绝 kind 已改为
 * `app_not_whitelisted` / `domain_not_allowed` / `op_not_allowed` / `audience_missing`
 * （旧 `no_consent` / `consent_revoked` / `consent_expired` 已退役，见 ocr-service
 * 退役文档）。端点 403 body 形如 `{ "error": "<kind>" }`（或
 * `error.details.data_authz_reason`）。客户端此前 0 映射 —— 本模块补齐。
 *
 * 安全边界（必须保持）：
 *   - 面向用户的文案一律来自本表（固定简体中文），**不得**透传服务端
 *     reason 原文 / request_id / client_id / 任何 token；
 *   - **未知 kind 一律回落 `unknown` 通用文案**（fail-safe 不变：前向兼容，
 *     服务端新增 kind 时旧客户端不误分类、不泄露原文）。
 */

/** 数据授权拒绝稳定 kind（4 个新 kind + unknown 回落；旧 kind 已退役，不在此表） */
export type DataAuthzKind =
  | 'app_not_whitelisted'
  | 'domain_not_allowed'
  | 'op_not_allowed'
  | 'audience_missing'
  | 'unknown'

/** 全部 kind（固定顺序；用于遍历与测试断言） */
export const DATA_AUTHZ_KINDS: readonly DataAuthzKind[] = [
  'app_not_whitelisted',
  'domain_not_allowed',
  'op_not_allowed',
  'audience_missing',
  'unknown'
]

/**
 * 冻结表：kind → 中文文案（文案不含任何动态值；风格与既有
 * identityV2Errors / oidcErrors 错误文案表一致）。
 */
export const DATA_AUTHZ_MESSAGES: Record<DataAuthzKind, string> = {
  app_not_whitelisted: '该应用尚未获得数据访问授权，请联系管理员配置数据授权白名单',
  domain_not_allowed: '该应用没有此项数据的访问权限，请联系管理员授予对应数据授权',
  op_not_allowed: '该应用没有此操作权限，请联系管理员调整数据授权范围',
  audience_missing: '当前登录凭证缺少数据授权信息，请重新登录后再试',
  unknown: '数据授权校验失败，请稍后重试'
}

/** kind 是否为本表内的稳定 kind（对任意输入防御式判断） */
export const isDataAuthzKind = (value: unknown): value is DataAuthzKind =>
  typeof value === 'string' && (DATA_AUTHZ_KINDS as readonly string[]).includes(value)

/** 取 kind 的固定文案；未知 kind 一律回落到 `unknown` 的通用文案（绝不原样透传输入） */
export const messageForDataAuthz = (kind: unknown): string =>
  isDataAuthzKind(kind) ? DATA_AUTHZ_MESSAGES[kind] : DATA_AUTHZ_MESSAGES.unknown
