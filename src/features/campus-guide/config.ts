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
  localBridgeBaseUrl: 'http://127.0.0.1:4399/campus-guide',
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

export const resolveCampusGuideBaseUrl = () => {
  const win = typeof window === 'undefined' ? null : window as Window & {
    __TAURI_INTERNALS__?: unknown
    __TAURI__?: unknown
  }
  if (win?.__TAURI_INTERNALS__ || win?.__TAURI__) return CAMPUS_GUIDE_CONFIG.localBridgeBaseUrl
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