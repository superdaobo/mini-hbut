export const UI_PRESETS = {
  sunset: {
    label: '日落',
    primary: '#f97316',
    secondary: '#ec4899',
    background: 'linear-gradient(135deg, #f97316 0%, #fb7185 45%, #ec4899 100%)',
    text: '#1f2937',
    muted: '#6b7280'
  },
  aurora: {
    label: '极光',
    primary: '#6366f1',
    secondary: '#a855f7',
    background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 45%, #22d3ee 100%)',
    text: '#0f172a',
    muted: '#475569'
  },
  cyberpunk: {
    label: '赛博朋克',
    primary: '#29c8e0',
    secondary: '#b74cc0',
    background:
      'radial-gradient(1200px at 10% 10%, rgba(41, 200, 224, 0.18), transparent 50%), radial-gradient(900px at 90% 15%, rgba(183, 76, 192, 0.18), transparent 55%), linear-gradient(135deg, #0b0f1a 0%, #11162a 45%, #1a1033 100%)',
    text: '#e8f7ff',
    muted: '#9ab1c7'
  },
  minimal: {
    label: '极简',
    primary: '#0ea5e9',
    secondary: '#38bdf8',
    background: '#ffffff',
    text: '#0f172a',
    muted: '#475569'
  },
  stone: {
    label: '石灰',
    primary: '#64748b',
    secondary: '#94a3b8',
    background: 'linear-gradient(135deg, #cbd5f5 0%, #e2e8f0 50%, #f8fafc 100%)',
    text: '#0f172a',
    muted: '#64748b'
  },
  custom: {
    label: '自定义',
    primary: '#6366f1',
    secondary: '#a855f7',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    text: '#0f172a',
    muted: '#475569'
  }
}

export const SYSTEM_UI_SETTINGS = {
  preset: 'aurora',
  primary: UI_PRESETS.aurora.primary,
  secondary: UI_PRESETS.aurora.secondary,
  background: UI_PRESETS.aurora.background,
  text: UI_PRESETS.aurora.text,
  muted: UI_PRESETS.aurora.muted,
  customCss: '',
  customJs: '',
  surfaceOpacity: 0.9,
  borderOpacity: 0.28,
  radiusScale: 1,
  fontScale: 1,
  spaceScale: 1,
  motionScale: 1,
  danger: '#ef4444',
  success: '#10b981'
}
