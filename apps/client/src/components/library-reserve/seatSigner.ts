/**
 * 座位预约 · 客户端签名（#1081：本机提交的核心一环）
 *
 * 官方快速预约页提交时，除业务参数外还要带一个 `enc`：
 * `submitVerify.verifyParam(paramObj)` 的输出（32 位 hex），由混淆脚本
 * `apps/common/enc/min/submitVerify.min.js` 生成。本模块在**页面内**加载并执行该脚本，
 * 从而不必把签名算法搬到 Rust（算法混淆、随官方更新变化，不可静态移植）。
 *
 * ## 执行配方（已实测可行）
 *
 * 1. 确保 DOM 里存在 `<input id="submit_enc" type="hidden">` —— **脚本只读该元素的 `.value`**
 *    （值来自 `library_reserve_seat_submit_prepare` 的 `submitEnc`）；
 * 2. `fetch` 取脚本文本（CSP 已允许 `connect-src https:`）；
 * 3. 以 AMD shim 内联注入并捕获模块（CSP 已允许 `script-src 'unsafe-inline'`）：
 *    `define` 被替换为「取最后一个函数参数并调用」的 shim，且 `shim.amd = true`；
 * 4. 调 `verifyParam({ roomId, startTime, endTime, day, captcha, seatNum, wyToken, wfwEngineEnc })`。
 *    **键集合与顺序必须与官方一致**（对象字面量的插入顺序即序列化顺序）。
 *
 * ## 缓存与失败语义
 *
 * 脚本**只加载一次**（module 级 Promise）；加载失败时清空缓存以便重试，但绝不静默——
 * 一律抛 {@link SeatSignError}，由调用方映射为可读文案（三语）。
 * 本模块不产出任何面向用户的文案（i18n 由组件层负责）。
 */

/** 官方签名脚本地址（与 `seatengine/live/select` 页面引用的路径一致） */
const SIGN_SCRIPT_URL =
  'https://office-static.chaoxing.com/r/staticreserve/js/src/front/apps/common/enc/min/submitVerify.min.js'

/**
 * 签名脚本的**依赖脚本**：提供全局 `hex_md5`。
 *
 * ⚠️ 实测（2026-10-16）：只注入 `submitVerify.min.js` 会抛
 * `ReferenceError: hex_md5 is not defined` —— 它内部调用全局 `hex_md5`
 * （`function hex_md5(s){ return binl2hex(core_md5(str2binl(s), s.length * chrsz)); }`），
 * 该函数由官方页面另行加载的 `js/lib/md5/md5.js` 定义。两者必须一起加载。
 */
const MD5_SCRIPT_URL = 'https://office-static.chaoxing.com/r/staticreserve/js/lib/md5/md5.js'

/** 依赖脚本定义的全局函数名 */
const MD5_GLOBAL = 'hex_md5'

/** 签名脚本读取的隐藏输入元素 id（**不可改**：脚本内部按此 id 取值） */
const SUBMIT_ENC_ELEMENT_ID = 'submit_enc'

/** 失败类型：`script_load` 脚本文本获取失败 / `module_missing` 未捕获到模块 / `sign_failed` 签名调用失败 */
export type SeatSignErrorCode = 'script_load' | 'module_missing' | 'sign_failed'

/** 签名失败（带机器可判别 code，文案由调用方映射） */
export class SeatSignError extends Error {
  readonly code: SeatSignErrorCode

  constructor(code: SeatSignErrorCode, detail = '') {
    super(detail || code)
    this.name = 'SeatSignError'
    this.code = code
  }
}

/** 签名脚本暴露的模块（只用到 `verifyParam`） */
interface SubmitVerifyModule {
  verifyParam: (params: Record<string, string>) => unknown
}

/** 签名参数（键名与官方页一致；顺序由下方调用点的字面量固定） */
export interface SeatSignInput {
  roomId: string
  /** `HH:mm` */
  startTime: string
  /** `HH:mm` */
  endTime: string
  /** `YYYY-MM-DD` */
  day: string
  captcha: string
  seatNum: string
  /** 风控关闭时为空串（官方页同样传空串） */
  wfwEngineEnc: string
}

/** 模块级缓存：成功即长期复用；失败时清空以便下一次重试 */
let modulePromise: Promise<SubmitVerifyModule> | null = null

/** AMD 脚本可能挂到全局的兜底键（正常路径走 shim 捕获，此处仅为异常形态兜底） */
const GLOBAL_MODULE_KEYS = ['submitVerify', 'submitVerifyModule']

/**
 * 确保 `#submit_enc` 存在并写入当前 `submitEnc`。
 *
 * 组件模板已渲染该元素（配方要求）；这里再兜底一次 —— 保证「元素存在」与
 * 「值正确」都不依赖 Vue 的渲染时机（`document.getElementById` 拿不到时自建）。
 */
const ensureSubmitEncInput = (submitEnc: string): void => {
  const existing = document.getElementById(SUBMIT_ENC_ELEMENT_ID)
  if (existing instanceof HTMLInputElement) {
    existing.value = submitEnc
    return
  }
  const input = document.createElement('input')
  input.type = 'hidden'
  input.id = SUBMIT_ENC_ELEMENT_ID
  input.value = submitEnc
  document.body.appendChild(input)
}

/** 从 shim 捕获结果 / 全局兜底里挑出可用的模块 */
const pickModule = (captured: unknown): SubmitVerifyModule | null => {
  if (captured && typeof (captured as SubmitVerifyModule).verifyParam === 'function') {
    return captured as SubmitVerifyModule
  }
  const globalRecord = globalThis as unknown as Record<string, unknown>
  for (const key of GLOBAL_MODULE_KEYS) {
    const candidate = globalRecord[key]
    if (candidate && typeof (candidate as SubmitVerifyModule).verifyParam === 'function') {
      return candidate as SubmitVerifyModule
    }
  }
  return null
}

/** 取脚本文本（失败 → `script_load`） */
const fetchText = async (url: string): Promise<string> => {
  let response: Response
  try {
    response = await fetch(url, { credentials: 'omit' })
  } catch {
    throw new SeatSignError('script_load')
  }
  if (!response.ok) throw new SeatSignError('script_load', `HTTP ${response.status}`)
  const source = await response.text()
  if (!source.trim()) throw new SeatSignError('script_load', 'empty script')
  return source
}

/**
 * 以 AMD shim 内联注入脚本，返回 shim 捕获到的模块（注入是同步的：`appendChild` 即执行）。
 *
 * shim 对两类脚本都安全：签名脚本通过 `define` 注册模块（被捕获）；
 * `md5.js` 直接定义全局函数（不调用 `define`，捕获为 `null`）。
 */
const injectScript = (source: string): unknown => {
  let captured: unknown = null
  const shim = (...args: unknown[]): void => {
    const factory = args[args.length - 1]
    if (typeof factory === 'function') {
      captured = (factory as () => unknown)()
    }
  }
  ;(shim as unknown as { amd: boolean }).amd = true

  const globalRecord = globalThis as unknown as Record<string, unknown>
  const previous = globalRecord.define
  globalRecord.define = shim
  try {
    const script = document.createElement('script')
    script.textContent = source
    document.head.appendChild(script)
  } catch (error) {
    // 脚本执行期抛错（依赖缺失 / 语法变更）也算「模块未正确加载」，给出可读失败而非静默
    throw new SeatSignError('module_missing', error instanceof Error ? error.message : '')
  } finally {
    // 无论成败都恢复现场，避免污染页面里其它 AMD 使用者
    globalRecord.define = previous
  }
  return captured
}

/** 确保依赖全局 `hex_md5` 可用（缺失时注入官方 md5 脚本；已有则跳过） */
const ensureMd5Global = async (): Promise<void> => {
  const globalRecord = globalThis as unknown as Record<string, unknown>
  if (typeof globalRecord[MD5_GLOBAL] === 'function') return
  injectScript(await fetchText(MD5_SCRIPT_URL))
}

/** 加载签名模块（只加载一次；失败清空缓存以便重试） */
const loadSignModule = (): Promise<SubmitVerifyModule> => {
  if (modulePromise) return modulePromise
  const pending = (async () => {
    // 先补依赖再注入签名脚本：缺 `hex_md5` 时 verifyParam 必抛 ReferenceError
    await ensureMd5Global()
    const module = pickModule(injectScript(await fetchText(SIGN_SCRIPT_URL)))
    if (!module) throw new SeatSignError('module_missing')
    return module
  })()
  modulePromise = pending.catch((error: unknown) => {
    modulePromise = null
    throw error
  })
  return modulePromise
}

/**
 * 生成提交签名 `enc`。
 *
 * @param input 业务参数（`roomId/startTime/endTime/day/captcha/seatNum`）+ `wfwEngineEnc`
 * @param submitEnc `library_reserve_seat_submit_prepare` 下发的 `submitEnc`（写入 `#submit_enc`）
 * @returns 32 位 hex 签名（空白 / 非字符串 → `sign_failed`）
 */
export const buildSeatEnc = async (input: SeatSignInput, submitEnc: string): Promise<string> => {
  // 非浏览器环境（如单测 / 预渲染）明确失败，而不是抛 TypeError
  if (typeof document === 'undefined' || typeof fetch !== 'function') {
    throw new SeatSignError('script_load', 'no dom')
  }
  ensureSubmitEncInput(submitEnc)
  const module = await loadSignModule()
  let enc: unknown
  try {
    // ⚠️ 键集合与顺序必须与官方 `doSubmit` 一致（多一个 / 少一个 / 换顺序都会签错）
    enc = module.verifyParam({
      roomId: input.roomId,
      startTime: input.startTime,
      endTime: input.endTime,
      day: input.day,
      captcha: input.captcha,
      seatNum: input.seatNum,
      wyToken: '',
      wfwEngineEnc: input.wfwEngineEnc
    })
  } catch {
    throw new SeatSignError('sign_failed')
  }
  const text = typeof enc === 'string' ? enc.trim() : ''
  if (!text) throw new SeatSignError('sign_failed')
  return text
}
