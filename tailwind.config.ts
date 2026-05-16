import type { Config } from 'tailwindcss'
import { colors, fontFamily, fontSize, spacing, borderRadius, letterSpacing, boxShadow } from './src/config/design-tokens'

// 将 readonly 令牌转换为 Tailwind 兼容的 mutable 类型
const mutableFontFamily = Object.fromEntries(
  Object.entries(fontFamily).map(([k, v]) => [k, [...v]])
) as Record<string, string[]>

const mutableFontSize = Object.fromEntries(
  Object.entries(fontSize).map(([k, v]) => [k, [v[0], { ...v[1] }] as [string, { lineHeight: string; fontWeight: string; letterSpacing: string }]])
) as Record<string, [string, { lineHeight: string; fontWeight: string; letterSpacing: string }]>

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 静态设计令牌 - 直接来自 design-tokens.ts 的 hex 值
        ...colors,
        // 动态主题色 - 通过 CSS 变量实现运行时主题切换 (shadcn-vue)
        primary: 'hsl(var(--primary) / <alpha-value>)',
        secondary: 'hsl(var(--secondary) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        border: 'hsl(var(--border) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        input: 'hsl(var(--input) / <alpha-value>)',
      },
      fontFamily: mutableFontFamily,
      fontSize: mutableFontSize,
      spacing: { ...spacing },
      borderRadius: { ...borderRadius },
      letterSpacing: { ...letterSpacing },
      boxShadow: { ...boxShadow },
      screens: {
        mobile: '320px',
        tablet: '768px',
        desktop: '1200px',
      },
      ringColor: {
        DEFAULT: '#0071e3', // primary-focus
      },
      ringOffsetWidth: {
        DEFAULT: '2px',
      },
      ringWidth: {
        DEFAULT: '2px',
      },
    },
  },
  plugins: [],
} satisfies Config
