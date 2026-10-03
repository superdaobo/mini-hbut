// 测试 fixture：_sdk transport 模块类型声明（与 transport.js 导出对齐）
//
// 为什么需要：`_sdk_request_id.spec.ts` 以相对路径 import `transport.js`（真实源码，
// 保证测的是真实实现而非副本），tsconfig 的 `strict: true` 下 import 无声明文件的 JS
// 会触发 TS7016 —— 与 `adapters/adapter.d.ts`、`legacy/legacy-jump-out.d.ts`、
// hbut_gomoku 的 `online.d.ts` / `match_trust.d.ts` 同处理（项目既有惯例）。
//
// 类型保持宽松：被测的是运行期行为，声明只需让 typecheck 能解析符号。

export interface TransportRequestResult {
  data: Record<string, unknown>
  status: number
  /** #964：服务端响应的 request_id（服务端值优先），回退客户端生成的请求 ID */
  requestId: string
  hint: unknown
  attempts?: number
  [key: string]: any
}

export interface TransportInstance {
  requestJson(init?: Record<string, any>): Promise<TransportRequestResult>
  requestJsonWithRetry(
    init?: Record<string, any>,
    options?: Record<string, any>
  ): Promise<TransportRequestResult>
  buildHeaders(extra?: Record<string, string>): Record<string, string>
  protocolHeader: string
  correlationHeader: string
  /** #964：请求 ID 头名（requestJson 已自动注入；暴露给调用方/测试引用） */
  requestIdHeader: string
  retryDelaysMs: number[]
  defaultTimeoutMs: number
  [key: string]: any
}

export interface TransportOptions {
  fetchImpl?: (url: string, init?: Record<string, any>) => Promise<any>
  timeoutMs?: number
  retryDelaysMs?: number[]
  [key: string]: any
}

export function createTransport(deps?: TransportOptions): TransportInstance

export function buildUrl(base: string, path: string, query?: Record<string, unknown> | null): string
