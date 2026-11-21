import { isTauriRuntime } from '../../platform/native'

/** 校园导览模块配置（对齐微信小程序 wx22aea6eb3fe08ad7） */
export const CAMPUS_GUIDE_CONFIG = Object.freeze({
  scenicId: '48770',
  /** 湖工大手绘地图 subkey，绑定自定义图层 */
  qqMapKey: '5KDBZ-X2ACL-JVBPV-EPTZN-HMR42-WPF62',
  mapLbsKey: 'XM4BZ-S4IKU-6GRV3-BT3XH-O27EQ-ZSF2U',
  routeLbsKey: 'ZOLBZ-PRKEJ-ZQ5FS-FUVXT-XBIDO-HEBNE',
  customLayerId: '6913dc019029',
  themeColor: '#0074CF',
  apiBase: '/campus-guide',
  /** Tauri 运行时（iOS / Android / 桌面）：本地签名代理（http_server，#1368 起全平台默认启用） */
  localBridgeBaseUrl: 'http://127.0.0.1:4399/campus-guide',
  /**
   * Tauri 下 loopback 之外的覆盖入口（排障/网关反代场景）。
   * 可通过 VITE_CAMPUS_GUIDE_HTTPS_BASE 或 localStorage `campus_guide_https_base` 配置；
   * 非空时优先于 loopback，未配置时默认走 `localBridgeBaseUrl`。
   */
  httpsProxyBaseDefault: '',
  minZoom: 15,
  maxZoom: 20,
  defaultZoom: 16,
  useTencentGuide: true,
  /** #491：产品裁剪，入口层不再暴露云游/校庆打卡 */
  enableYunyou: false,
  enablePunch: false,
  /** 桌面端屏幕更大，默认展示全部 POI；小程序仍做点避让 */
  markerDodge: false,
  cdnBase: 'https://industry.map.qq.com/cloud/hugongda/2022/09/05'
})

const readConfiguredHttpsBase = () => {
  try {
    const fromStorage = String(localStorage.getItem('campus_guide_https_base') || '').trim()
    if (fromStorage) return fromStorage.replace(/\/$/, '')
  } catch {
    // ignore
  }
  const fromEnv = String(
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_CAMPUS_GUIDE_HTTPS_BASE || ''
  ).trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const def = String(CAMPUS_GUIDE_CONFIG.httpsProxyBaseDefault || '').trim()
  return def ? def.replace(/\/$/, '') : ''
}

/**
 * 解析校园导览 API base：
 * - Web / Vite dev：相对路径 `/campus-guide`（dev server 反代）
 * - Tauri（含 Android）：loopback bridge —— #1368 起 http_server 全平台默认启用，
 *   「Android Release 不 spawn 4399」前提已失效，不再按 UA 分流；
 *   排障/网关场景可用 `campus_guide_https_base` / VITE_CAMPUS_GUIDE_HTTPS_BASE 覆盖。
 */
export const resolveCampusGuideBaseUrl = () => {
  if (!isTauriRuntime()) return CAMPUS_GUIDE_CONFIG.apiBase

  // Tauri 下显式覆盖优先于 loopback（否则默认走本地桥签名代理）
  const httpsBase = readConfiguredHttpsBase()
  if (httpsBase) return httpsBase.endsWith('/campus-guide') ? httpsBase : `${httpsBase}/campus-guide`

  return CAMPUS_GUIDE_CONFIG.localBridgeBaseUrl
}

const GUIDE_MODE_KEY = 'campus_guide_use_tencent'

export const readCampusGuideMode = () => {
  try {
    const raw = localStorage.getItem(GUIDE_MODE_KEY)
    if (raw === 'legacy') return 'legacy'
    if (raw === 'tencent') return 'tencent'
  } catch {
    // ignore
  }
  return CAMPUS_GUIDE_CONFIG.useTencentGuide ? 'tencent' : 'legacy'
}

export const writeCampusGuideMode = (mode: 'tencent' | 'legacy') => {
  try {
    localStorage.setItem(GUIDE_MODE_KEY, mode)
  } catch {
    // ignore
  }
}