import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'

/**
 * #1229 max-w 宽度标度契约（回归自 #1094 的 Tailwind v3→v4 迁移）。
 *
 * 根因：v4 对命名 max-w-* 的取值顺序是 --spacing 标度优先于 --container 标度，
 * 而 tailwind.config.ts 的 spacing 自定义标度恰好有 xs…xl 键（0.5rem…2rem），
 * 导致 .max-w-md 被解析成 1.0625rem（17px），`w-full max-w-md` 的弹窗
 * （首页「编辑快捷入口」、shadcn Dialog/Sheet 等）塌缩成竖条。
 * 修复：src/index.css 里用无层 CSS 显式锁定 v3 语义值（无层样式恒优先于
 * @layer tailwind 内的工具类）。
 *
 * 本契约用 PostCSS + @tailwindcss/postcss 实际生成 CSS 后断言：
 * 1. max-w-{xs,sm,md,lg,xl} 的**层叠胜出版本**是 v3 语义值（20/24/28/32/36rem）；
 * 2. max-w-2xl/3xl 仍走 --container 标度（不得被误伤）；
 * 3. 模板目录的 class 扫描仍然有效（防「content 漏掉 .html」那一类回归复发）：
 *    快捷入口编辑弹窗的关键 class（w-full / max-h-[80vh] 等）必须被生成。
 */

/** 从生成的 CSS 中取出某个 class 的全部规则文本（按出现顺序） */
function collectRules(css: string, className: string): string[] {
  const re = new RegExp(`\\.${className.replace(/[-[\]{}()+]/g, '\\$&')}(?![\\w-])\\s*\\{[^}]*\\}`, 'g')
  return [...css.matchAll(re)].map((m) => m[0].replace(/\s+/g, ' '))
}

/** 规则里 max-width 的字面值（rem 值；var 形式返回 'var'） */
function maxWidthValue(rule: string): string {
  const m = rule.match(/max-width:\s*([^;]+);/)
  return m ? m[1].trim() : ''
}

describe('max-width scale contract (#1229)', () => {
  it('生成的 CSS 中命名 max-w 的胜出版本是 v3 语义值', { timeout: 120_000 }, async () => {
    const postcss = (await import('postcss')).default
    const { default: tailwind } = await import('@tailwindcss/postcss')
    const { readFileSync } = await import('node:fs')

    const cssPath = resolve(process.cwd(), 'src/index.css')
    const out = await postcss([tailwind()]).process(readFileSync(cssPath, 'utf8'), {
      from: cssPath,
    })
    const css = out.css

    const expected: Record<string, string> = {
      'max-w-xs': '20rem',
      'max-w-sm': '24rem',
      'max-w-md': '28rem',
      'max-w-lg': '32rem',
      'max-w-xl': '36rem',
    }

    for (const [name, want] of Object.entries(expected)) {
      const rules = collectRules(css, name)
      expect(rules.length, `${name} 规则应被生成`).toBeGreaterThan(0)
      // 无层覆盖块位于层内工具类之后：最后一个出现的规则必须是期望值
      const last = maxWidthValue(rules[rules.length - 1])
      expect(last, `${name} 的层叠胜出版本应为 ${want}，实际 ${last}`).toBe(want)
      // 期望值规则必须真实存在（防止只剩错误值）
      expect(rules.some((r) => maxWidthValue(r) === want), `${name} 缺少 ${want} 规则`).toBe(true)
    }

    // max-w-2xl/3xl 不得被误伤：仍走 --container 标度（42rem/48rem）
    const rules2xl = collectRules(css, 'max-w-2xl')
    expect(rules2xl.length).toBeGreaterThan(0)
    const v2xl = maxWidthValue(rules2xl[rules2xl.length - 1])
    expect(v2xl === 'var(--container-2xl)' || v2xl === '42rem', `max-w-2xl 异常: ${v2xl}`).toBe(true)
  })

  it('模板目录 class 扫描有效（编辑弹窗关键 class 必须生成）', { timeout: 120_000 }, async () => {
    const postcss = (await import('postcss')).default
    const { default: tailwind } = await import('@tailwindcss/postcss')
    const { readFileSync } = await import('node:fs')

    const cssPath = resolve(process.cwd(), 'src/index.css')
    const out = await postcss([tailwind()]).process(readFileSync(cssPath, 'utf8'), {
      from: cssPath,
    })
    const css = out.css

    // 这些 class 只（或主要）出现在 src/templates/views/*.html 中：
    // 若 @source ./templates/views 或 content 配置失效，它们将不会生成（#1229 早期症状）。
    // 注意：任意值 class 在产物里是 CSS 转义选择器（.max-h-\[80vh\]），用 includes 精确匹配。
    for (const needle of ['.max-h-\\[80vh\\]', '.z-\\[200\\]', '.rounded-t-3xl', '.grid-cols-4']) {
      expect(css.includes(needle), `class ${needle} 未生成（模板扫描可能失效）`).toBe(true)
    }
  })
})
