/**
 * 校园网（iHBUT）本地设置（不含密码）。
 */

export type CampusCarrier = 'campus' | 'cmcc' | 'cucc' | 'ctcc'

export type CampusNetworkStatus =
  | 'authenticated'
  | 'needs_auth'
  | 'unknown'
  | 'checking'
  | 'error'

export interface CampusNetworkSettings {
  carrier: CampusCarrier
  auto_login: boolean
  remember_password: boolean
  gateway_override: string
  show_advanced: boolean
  last_status: CampusNetworkStatus | ''
  last_message: string
  last_probe_at: number
  last_login_at: number
  last_login_success: boolean
}

const STORAGE_KEY = 'campus_network_settings_v1'

export const CAMPUS_CARRIER_OPTIONS: ReadonlyArray<{
  id: CampusCarrier
  label: string
  hint: string
}> = [
  { id: 'campus', label: '校园网', hint: '默认运营商' },
  { id: 'cmcc', label: '移动', hint: 'YD / @cmcc' },
  { id: 'cucc', label: '联通', hint: 'LT / @cucc' },
  { id: 'ctcc', label: '电信', hint: 'DX / @ctcc' }
]

export const DEFAULT_CAMPUS_NETWORK_SETTINGS: CampusNetworkSettings = {
  carrier: 'campus',
  auto_login: false,
  remember_password: true,
  gateway_override: '',
  show_advanced: false,
  last_status: '',
  last_message: '',
  last_probe_at: 0,
  last_login_at: 0,
  last_login_success: false
}

export const HBUT_CAMPUS_GATEWAYS: readonly string[] = [
  'http://172.16.54.18',
  'http://202.114.177.246',
  'http://202.114.177.113',
  'http://202.114.177.114',
  'http://202.114.177.115'
]

const normalizeSettings = (raw: Partial<CampusNetworkSettings> | null | undefined): CampusNetworkSettings => ({
  ...DEFAULT_CAMPUS_NETWORK_SETTINGS,
  ...(raw || {}),
  carrier: (['campus', 'cmcc', 'cucc', 'ctcc'] as const).includes(raw?.carrier as CampusCarrier)
    ? (raw!.carrier as CampusCarrier)
    : 'campus'
})

export const readCampusNetworkSettings = (): CampusNetworkSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CAMPUS_NETWORK_SETTINGS }
    return normalizeSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_CAMPUS_NETWORK_SETTINGS }
  }
}

export const writeCampusNetworkSettings = (patch: Partial<CampusNetworkSettings>): CampusNetworkSettings => {
  const next = normalizeSettings({ ...readCampusNetworkSettings(), ...patch })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export const campusStatusLabel = (status: CampusNetworkStatus | ''): string => {
  switch (status) {
    case 'authenticated':
      return '已连接'
    case 'needs_auth':
      return '需要认证'
    case 'checking':
      return '检测中'
    case 'error':
      return '失败'
    default:
      return '未知'
  }
}
