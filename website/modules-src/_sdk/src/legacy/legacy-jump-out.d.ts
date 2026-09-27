// jump_out_hbut 旧协议适配层的类型声明（与 legacy-jump-out.js 导出对齐）。
//
// 为什么需要：`apps/client/src/utils/_sdk_legacy_fidelity.spec.ts` 以相对路径 import 该
// 模块来断言 jump_out 通道的 body 字段保真（`run_id` 必带、`ended_reason` 存原值），
// 而 tsconfig `strict: true` 下 import 无声明文件的 JS 会触发 TS7016。
// 与 `adapters/adapter.d.ts` 同处理（SDK 内部的声明文件惯例）。
//
// 类型保持宽松：被测的是运行期字段保真，不是内部结构。

export interface JumpOutLegacyContext {
  rank_api?: string
  gameId?: string
  student_id?: string
  player_name?: string
  class_name?: string
  [key: string]: any
}

export interface JumpOutToLegacyPayloadInput {
  /** V2 envelope（snake_case 字段由本适配层产出） */
  result?: Record<string, any>
  durationMs?: number
  /** 本局唯一 ID —— 旧协议 body 带 run_id，Legacy 表有唯一键约束 */
  runId?: string
  /** 未归一化的原始 ended_reason（归一化只属 V2 语义） */
  rawEndedReason?: string
}

export interface JumpOutLegacyAdapter {
  protocol: string
  channel: string
  trustLevel: string
  readContext(...args: any[]): JumpOutLegacyContext
  canSubmit(...args: any[]): boolean
  createRunId(...args: any[]): string
  submit(...args: any[]): Promise<any>
  leaderboard(...args: any[]): Promise<any>
  toLegacyPayload(input: JumpOutToLegacyPayloadInput): Record<string, any>
}

export function createJumpOutLegacyAdapter(): JumpOutLegacyAdapter
