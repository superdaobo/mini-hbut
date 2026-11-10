/**
 * src/features/identity/v2/identityV2Errors.ts —— P1-2（#1213）身份 v2：稳定错误分类器。
 *
 * 规格：goal-10 `p1-2-client-flow-spec.md` §4（冻结文案；验收 ③）。
 *
 * 安全边界（必须保持）：
 *   - 面向用户的文案一律来自本表（固定简体中文），**不得**透传服务器原始 body /
 *     完整学号 / 完整签名 / 公钥材料 / URL 查询串 / request_id / 服务端 reason 原文；
 *   - 服务端 `reason` → kind 的映射表**固定**；**未知 reason 一律 `unknown`**；
 *   - 本表与 Rust 侧（`src-tauri/src/identity/v2_flow.rs` 的 `message_for_kind` /
 *     `kind_for_reason`）逐字一致：改这里必须同步改 Rust 侧。
 */

/** §4 全部稳定 kind（17 个；与 Rust 侧常量逐字一致） */
export type FlowErrorKind =
  | 'first_claim_ok'
  | 'already_registered'
  | 'student_taken'
  | 'device_taken'
  | 'no_active_device'
  | 'request_pending'
  | 'approved'
  | 'approver_mismatch'
  | 'request_expired'
  | 'request_done'
  | 'code_invalid'
  | 'not_enrolled'
  | 'not_logged_in'
  | 'secure_storage_unavailable'
  | 'network'
  | 'service_unavailable'
  | 'unknown'

/** 全部 kind（固定顺序；用于遍历与测试断言） */
export const FLOW_KINDS: readonly FlowErrorKind[] = [
  'first_claim_ok',
  'already_registered',
  'student_taken',
  'device_taken',
  'no_active_device',
  'request_pending',
  'approved',
  'approver_mismatch',
  'request_expired',
  'request_done',
  'code_invalid',
  'not_enrolled',
  'not_logged_in',
  'secure_storage_unavailable',
  'network',
  'service_unavailable',
  'unknown'
]

/**
 * §4 冻结表：kind → 中文文案（**逐字**；与 Rust `message_for_kind` 逐字一致）。
 * 注意：文案不含任何动态值（学号/签名/公钥/URL/request_id/reason 原文一律不得出现）。
 */
export const FLOW_MESSAGES: Record<FlowErrorKind, string> = {
  first_claim_ok: '设备登记成功，本机已成为该学号的受信任设备',
  already_registered: '本机已完成登记，无需重复操作',
  student_taken: '该学号已绑定其他设备：请在旧设备上批准换机，或联系管理员',
  device_taken: '本机设备已绑定到其他学号，请先在该学号下解除绑定或联系管理员',
  no_active_device: '该学号当前没有可用的旧设备，请直接完成首次登记',
  request_pending: '换机请求已提交，请用旧设备输入/扫描换机码完成批准',
  approved: '换机完成：本机已成为该学号的受信任设备',
  approver_mismatch: '只有该学号当前的活跃设备才能批准换机',
  request_expired: '换机码已过期，请在新设备上重新发起换机',
  request_done: '该换机请求已被处理，无需重复批准',
  code_invalid: '换机码无效或已损坏，请重新扫描/输入',
  not_enrolled: '本机尚未登记设备身份，请先完成首次登记',
  not_logged_in: '请先在本机登录学校账号后再操作',
  secure_storage_unavailable: '本机安全存储不可用，无法完成设备身份操作',
  network: '网络不可用或服务暂时不可达，请稍后重试',
  service_unavailable: '服务暂时不可用，请稍后重试',
  unknown: '操作失败，请稍后重试'
}

/** kind 是否为本表内的稳定 kind（对任意字符串防御式判断） */
export const isFlowErrorKind = (value: unknown): value is FlowErrorKind =>
  typeof value === 'string' && (FLOW_KINDS as readonly string[]).includes(value)

/** 取 kind 的固定文案；未知 kind 一律回落到 `unknown` 的文案（绝不原样透传输入） */
export const messageFor = (kind: unknown): string =>
  isFlowErrorKind(kind) ? FLOW_MESSAGES[kind] : FLOW_MESSAGES.unknown

/**
 * 服务端稳定 `reason` → kind 的**固定**映射表（与 Rust `kind_for_reason` 逐字一致；
 * 服务端契约见规格 §1 的失败列）。**未列出的 reason 一律 `unknown`**，原文不透传。
 */
const SERVER_REASON_TO_KIND: Record<string, FlowErrorKind> = {
  // 首次登记
  student_active_on_other_device: 'student_taken',
  device_active_for_other_student: 'device_taken',
  // 发起换绑
  rebind_no_active_device: 'no_active_device',
  rebind_new_device_taken: 'device_taken',
  // 批准换绑
  rebind_request_expired: 'request_expired',
  rebind_request_already_done: 'request_done',
  rebind_approver_mismatch: 'approver_mismatch',
  rebind_approver_not_active: 'approver_mismatch',
  rebind_request_not_found: 'code_invalid',
  rebind_pubkey_mismatch: 'code_invalid',
  // 本地/服务状态类（Rust 侧折叠后以字符串形式到达前端时同样适用）
  device_not_registered: 'not_enrolled',
  not_enrolled: 'not_enrolled',
  no_local_login: 'not_logged_in',
  keyring_unavailable: 'secure_storage_unavailable'
}

/**
 * 服务端 `reason` → kind（未知/空白/非字符串一律 `unknown`；**不透传**原文）。
 * 仅做 trim + 精确查表：不做子串猜测（子串猜测在 flow 层按「固定 token」受控进行）。
 */
export const mapServerReason = (reason: unknown): FlowErrorKind => {
  if (typeof reason !== 'string') return 'unknown'
  return SERVER_REASON_TO_KIND[reason.trim()] ?? 'unknown'
}
