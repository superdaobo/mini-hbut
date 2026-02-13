export type UiThemeCategory = 'light' | 'dark' | 'vivid' | 'neutral'

export type CardStyle = 'glass' | 'solid' | 'outline'
export type NavStyle = 'floating' | 'pill' | 'compact'
export type DensityStyle = 'comfortable' | 'balanced' | 'compact'
export type IconStyle = 'duotone' | 'line' | 'mono'
export type DecorStyle = 'mesh' | 'grain' | 'none'

export interface UiPreset {
  label: string
  tagline: string
  category: UiThemeCategory
  primary: string
  secondary: string
  background: string
  text: string
  muted: string
  surfaceOpacity?: number
  borderOpacity?: number
  radiusScale?: number
  fontScale?: number
  spaceScale?: number
  motionScale?: number
}

export interface UiSettingsProfile {
  cardStyle: CardStyle
  navStyle: NavStyle
  density: DensityStyle
  iconStyle: IconStyle
  decor: DecorStyle
}

export const UI_PRESETS: Record<string, UiPreset> = {
  campus_blue: {
    label: '校园晴空',
    tagline: '蓝青渐变，清爽稳定，适合日常学习与导航。',
    category: 'light',
    primary: '#2563eb',
    secondary: '#06b6d4',
    background:
      'radial-gradient(980px at 12% 10%, rgba(37, 99, 235, 0.25), transparent 58%), radial-gradient(900px at 88% 84%, rgba(6, 182, 212, 0.22), transparent 56%), linear-gradient(146deg, #e8f0ff 0%, #e7f7ff 52%, #f2fbff 100%)',
    text: '#0f172a',
    muted: '#475569',
    surfaceOpacity: 0.88,
    borderOpacity: 0.26,
    radiusScale: 1.04,
    fontScale: 1,
    spaceScale: 1,
    motionScale: 1
  },
  graphite_night: {
    label: '深海石墨',
    tagline: '低亮度高对比，适合夜间长时间使用。',
    category: 'dark',
    primary: '#60a5fa',
    secondary: '#22d3ee',
    background:
      'radial-gradient(980px at 10% 10%, rgba(96, 165, 250, 0.2), transparent 56%), radial-gradient(900px at 88% 82%, rgba(34, 211, 238, 0.18), transparent 58%), linear-gradient(150deg, #0a1120 0%, #0f172a 52%, #1e293b 100%)',
    text: '#e2e8f0',
    muted: '#cbd5e1',
    surfaceOpacity: 0.76,
    borderOpacity: 0.24,
    radiusScale: 1.06,
    fontScale: 1,
    spaceScale: 1,
    motionScale: 0.95
  },
  forest_mint: {
    label: '薄荷森林',
    tagline: '柔和绿调，信息层次清晰，护眼耐看。',
    category: 'vivid',
    primary: '#059669',
    secondary: '#0ea5e9',
    background:
      'radial-gradient(980px at 12% 10%, rgba(5, 150, 105, 0.24), transparent 58%), radial-gradient(920px at 88% 84%, rgba(14, 165, 233, 0.18), transparent 58%), linear-gradient(148deg, #ecfdf5 0%, #def7f1 52%, #eef9ff 100%)',
    text: '#052e2b',
    muted: '#0f766e',
    surfaceOpacity: 0.9,
    borderOpacity: 0.24,
    radiusScale: 1.08,
    fontScale: 1,
    spaceScale: 1.02,
    motionScale: 1
  },
  sunset_orange: {
    label: '夕照暖橙',
    tagline: '高识别暖色风格，适合功能入口与通知场景。',
    category: 'vivid',
    primary: '#f97316',
    secondary: '#ec4899',
    background:
      'radial-gradient(1000px at 10% 12%, rgba(249, 115, 22, 0.24), transparent 56%), radial-gradient(920px at 86% 82%, rgba(236, 72, 153, 0.2), transparent 56%), linear-gradient(145deg, #fff7ed 0%, #ffe4e6 52%, #fff1f2 100%)',
    text: '#431407',
    muted: '#9d174d',
    surfaceOpacity: 0.9,
    borderOpacity: 0.22,
    radiusScale: 1.08,
    fontScale: 1,
    spaceScale: 1.02,
    motionScale: 1.08
  },
  minimal_slate: {
    label: '极简岩灰',
    tagline: '弱装饰高信息密度，适合高频数据操作。',
    category: 'neutral',
    primary: '#334155',
    secondary: '#0ea5e9',
    background:
      'radial-gradient(900px at 12% 10%, rgba(100, 116, 139, 0.18), transparent 58%), linear-gradient(150deg, #f8fafc 0%, #f1f5f9 52%, #e2e8f0 100%)',
    text: '#0f172a',
    muted: '#475569',
    surfaceOpacity: 0.94,
    borderOpacity: 0.22,
    radiusScale: 0.94,
    fontScale: 0.98,
    spaceScale: 0.94,
    motionScale: 0.8
  }
}

export const SYSTEM_UI_SETTINGS = {
  preset: 'campus_blue',
  primary: UI_PRESETS.campus_blue.primary,
  secondary: UI_PRESETS.campus_blue.secondary,
  background: UI_PRESETS.campus_blue.background,
  text: UI_PRESETS.campus_blue.text,
  muted: UI_PRESETS.campus_blue.muted,
  customCss: '',
  customJs: '',
  surfaceOpacity: UI_PRESETS.campus_blue.surfaceOpacity ?? 0.88,
  borderOpacity: UI_PRESETS.campus_blue.borderOpacity ?? 0.26,
  radiusScale: UI_PRESETS.campus_blue.radiusScale ?? 1,
  fontScale: UI_PRESETS.campus_blue.fontScale ?? 1,
  spaceScale: UI_PRESETS.campus_blue.spaceScale ?? 1,
  motionScale: UI_PRESETS.campus_blue.motionScale ?? 1,
  danger: '#ef4444',
  success: '#10b981',
  profile: {
    cardStyle: 'glass' as CardStyle,
    navStyle: 'floating' as NavStyle,
    density: 'balanced' as DensityStyle,
    iconStyle: 'duotone' as IconStyle,
    decor: 'mesh' as DecorStyle
  }
}
