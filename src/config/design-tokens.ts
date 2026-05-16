// 设计令牌单一源 - 所有值严格来自 DESIGN.md 规范
// 此文件为 Tailwind 配置和 shadcn-vue 主题的唯一令牌来源

export const colors = {
  primary: '#0066cc',
  'primary-focus': '#0071e3',
  'primary-on-dark': '#2997ff',
  ink: '#1d1d1f',
  body: '#1d1d1f',
  'body-on-dark': '#ffffff',
  'body-muted': '#cccccc',
  'ink-muted-80': '#333333',
  'ink-muted-48': '#7a7a7a',
  'divider-soft': '#f0f0f0',
  hairline: '#e0e0e0',
  canvas: '#ffffff',
  'canvas-parchment': '#f5f5f7',
  'surface-pearl': '#fafafc',
  'surface-tile-1': '#272729',
  'surface-tile-2': '#2a2a2c',
  'surface-tile-3': '#252527',
  'surface-black': '#000000',
  'surface-chip-translucent': '#d2d2d7',
  'on-primary': '#ffffff',
  'on-dark': '#ffffff',
} as const

export const fontFamily = {
  display: ['SF Pro Display', 'system-ui', '-apple-system', 'Inter', 'sans-serif'],
  text: ['SF Pro Text', 'system-ui', '-apple-system', 'Inter', 'sans-serif'],
} as const

export const fontSize = {
  'hero-display': ['3.5rem', { lineHeight: '1.07', fontWeight: '600', letterSpacing: '-0.28px' }],
  'display-lg': ['2.5rem', { lineHeight: '1.1', fontWeight: '600', letterSpacing: '0' }],
  'display-md': ['2.125rem', { lineHeight: '1.47', fontWeight: '600', letterSpacing: '-0.374px' }],
  'lead': ['1.75rem', { lineHeight: '1.14', fontWeight: '400', letterSpacing: '0.196px' }],
  'lead-airy': ['1.5rem', { lineHeight: '1.5', fontWeight: '300', letterSpacing: '0' }],
  'tagline': ['1.3125rem', { lineHeight: '1.19', fontWeight: '600', letterSpacing: '0.231px' }],
  'body-strong': ['1.0625rem', { lineHeight: '1.24', fontWeight: '600', letterSpacing: '-0.374px' }],
  'body': ['1.0625rem', { lineHeight: '1.47', fontWeight: '400', letterSpacing: '-0.374px' }],
  'caption': ['0.875rem', { lineHeight: '1.43', fontWeight: '400', letterSpacing: '-0.224px' }],
  'button-large': ['1.125rem', { lineHeight: '1.0', fontWeight: '300', letterSpacing: '0' }],
  'fine-print': ['0.75rem', { lineHeight: '1.0', fontWeight: '400', letterSpacing: '-0.12px' }],
  'nav-link': ['0.75rem', { lineHeight: '1.0', fontWeight: '400', letterSpacing: '-0.12px' }],
} as const

export const spacing = {
  xxs: '0.25rem',   // 4px
  xs: '0.5rem',     // 8px
  sm: '0.75rem',    // 12px
  md: '1.0625rem',  // 17px
  lg: '1.5rem',     // 24px
  xl: '2rem',       // 32px
  xxl: '3rem',      // 48px
  section: '5rem',  // 80px
} as const

export const borderRadius = {
  none: '0px',
  xs: '5px',
  sm: '8px',
  md: '11px',
  lg: '18px',
  pill: '9999px',
  full: '9999px',
} as const

export const letterSpacing = {
  'tight-sm': '-0.12px',
  'tight-md': '-0.224px',
  'tight-lg': '-0.374px',
  'tight-display': '-0.28px',
} as const

export const boxShadow = {
  none: 'none',
  product: 'rgba(0, 0, 0, 0.22) 3px 5px 30px 0',
} as const

// 类型导出
export type DesignColors = typeof colors
export type DesignSpacing = typeof spacing
export type DesignBorderRadius = typeof borderRadius
export type DesignFontSize = typeof fontSize
