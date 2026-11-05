/**
 * 「账号安全概览」样例模块解析层的类型声明（#1169 T08）。
 * 运行期实现见同目录 `parse.js`（模块包里只用 JS，不需要构建）。
 */

export interface SampleModuleRow {
  device: string
  ip: string
  place: string
  loginTime: string
  system: string
}

export interface SampleModuleFlatRow {
  label: string
  value: string
}

export interface SampleModuleParseResult {
  ok: boolean
  kind: string
  rows: SampleModuleRow[]
  flat: SampleModuleFlatRow[]
  unknownShape: boolean
  message: string
}

export function extractRows(payload: unknown): unknown[]
export function isFailurePayload(payload: unknown): boolean
export function flattenUnknown(payload: unknown, limit?: number): SampleModuleFlatRow[]
export function parseModulePayload(body: string, kind: 'online' | 'logs'): SampleModuleParseResult
