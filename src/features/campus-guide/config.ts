import {
  isLikelyAndroidUserAgent,
  isLikelyIOSUserAgent,
  isTauriRuntime
} from '../../platform/native'

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
  /** iOS / 桌面 Tauri：本地签名代理（http_server） */
  localBridgeBaseUrl: 'http://127.0.0.1:4399/campus-guide',
  /**
   * Android Release 默认不启 loopback bridge。
   * 可通过 VITE_CAMPUS_GUIDE_HTTPS_BASE 或 localStorage `campus_guide_https_base` 覆盖。
   * 未配置时回退同源相对路径 `/campus-guide`（由宿主注入/远程网关反代时可用）。
   */
  httpsProxyBaseDefault: '',
  minZoom: 15,
  maxZoom: 20,
  defaultZoom: 16,
  useTencentGuide: true,
  enableYunyou: true,
  enablePunch: true,
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
 * - Tauri iOS / 桌面：loopback bridge（Release 已启）
 * - Tauri Android：**禁止** 127.0.0.1，优先 HTTPS 配置，否则相对路径
 */
export const resolveCampusGuideBaseUrl = () => {
  if (!isTauriRuntime()) return CAMPUS_GUIDE_CONFIG.apiBase

  // Android：绝不走 loopback（Release 不 spawn 4399）
  if (isLikelyAndroidUserAgent()) {
    const httpsBase = readConfiguredHttpsBase()
    if (httpsBase) return httpsBase.endsWith('/campus-guide') ? httpsBase : `${httpsBase}/campus-guide`
    // 相对路径：依赖 Capacitor/Tauri 资产服务器或外部网关；至少不会卡死在 127.0.0.1
    return CAMPUS_GUIDE_CONFIG.apiBase
  }

  // iOS 与桌面：loopback 签名代理
  if (isLikelyIOSUserAgent() || !isLikelyAndroidUserAgent()) {
    return CAMPUS_GUIDE_CONFIG.localBridgeBaseUrl
  }
  return CAMPUS_GUIDE_CONFIG.apiBase
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