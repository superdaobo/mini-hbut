/**
 * i18n 完整性契约测试（issue #785，epic #784 的基建）。
 *
 * 供 #784 各批次代理（A-J）使用：每迁移完一个文件（消灭其中全部硬编码中文），
 * 就把该文件追加进下方 I18N_MIGRATED_FILES 白名单，本测试随即开始看守它——
 * 一旦有人往已迁移文件里写回硬编码中文（注释除外），测试立刻失败。
 *
 * ── 如何往白名单追加文件 ──
 * 1. 将目标文件里的用户可见中文全部改为 t('域.页面.元素')；
 * 2. 在 zh-CN.ts / en.ts 两侧同步补齐 key（测试 2 强制校验集合一致）；
 * 3. 把文件相对 apps/client/src 的路径（正斜杠，如 'components/HomeView.vue'）
 *    追加进 I18N_MIGRATED_FILES，跑 npx vitest run src/utils/i18n_coverage.spec.ts 验证。
 *
 * 豁免规则（不算违规）：
 * - JS/TS 行注释（// …）、块注释（/* … *\/）与 .vue/.html 中 <!-- --> 注释里的中文；
 * - 语言名称等按惯例保留原文的 value（在字典 .ts 内，不在扫描范围）；
 * - 本 spec 及其他 *.spec.ts 测试文件（不在白名单即不检查）；
 * - 白名单外的文件完全不检查（未迁移的页面由后续批次逐个接管）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { messages } from './app_i18n'

/**
 * 已迁移文件白名单（相对 apps/client/src 的 POSIX 路径，正斜杠分隔）。
 * 初始仅含 #785 基建本批完成迁移的文件；#784 各批次迁移完成后逐批追加。
 *
 * ⚠️ 注意：SettingsView.vue / SettingsView.html / App.vue 的 #773 批次只迁移了
 * header/tab/语言 section/底部 TabBar 等部分文案，页面主体仍有大量硬编码中文，
 * 故本批暂不纳入白名单（待后续批次全量迁移后追加），避免契约测试误报。
 */
const I18N_MIGRATED_FILES: string[] = [
  // #785：toast.js 无内置中文文案（文案由调用方传入），纳入白名单防止回退
  'utils/toast.js',
  // #785：本批接入 t() 的公共组件（内置默认文案 / 无障碍标签已全部 t() 化）
  'components/templates/TEmptyState.vue',
  'components/templates/TModal.vue',
  // #790：通知消息域（页面 + utils 用户可见文案全部 t()/tf() 化；
  // background_notification.ts 的 errors 为内部诊断字段（spec 断言中文字样），
  // 不属用户可见文案，故未纳入白名单）
  'components/NotificationView.vue',
  'components/SchoolInboxView.vue',
  'components/ChaoxingInboxView.vue',
  'utils/local_reminder_scheduler.ts',
  'utils/notify_center_checks.ts',
  'utils/notify_center_electricity.ts'
]

/** CJK 统一表意文字 + 扩展A 区段（中文标点不在区段内，目标是消灭表意文字本身） */
const CJK_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf]/

const clientSrcRoot = resolve(process.cwd(), 'src')

/**
 * 剥离注释后返回逐行内容（保持行号）。
 * .vue 文件同时包含模板区（HTML 注释）与脚本区（JS 注释），两类注释都要剥离：
 * 先整段移除 <!-- --> 与 [JS 块注释]，再逐行截断 // 行注释。
 * 注意 // 截断对 "https://" 字符串的误伤：截断只会丢弃 CJK 检查范围，
 * 且 URL 中不含 CJK，不会产生假阴性/假阳性风险（URL 出现中文本身也该被查出）。
 */
const stripComments = (source: string): string[] => {
  let text = source
  // 整段移除 HTML 注释（.html 全文与 .vue 模板区）
  text = text.replace(/<!--[\s\S]*?-->/g, '')
  // 整段移除 JS 块注释（.ts/.js 全文与 .vue 脚本区）
  text = text.replace(/\/\*[\s\S]*?\*\//g, '')
  // 再逐行截断行注释
  return text.split('\n').map((line) => {
    const idx = line.indexOf('//')
    return idx >= 0 ? line.slice(0, idx) : line
  })
}

describe('i18n 完整性契约（#785，#784 各批次共同看守）', () => {
  it('测试 3：白名单内文件必须存在（防止文件改名/删除后白名单腐化）', () => {
    expect(I18N_MIGRATED_FILES.length).toBeGreaterThan(0)

    const missing = I18N_MIGRATED_FILES.filter((rel) => {
      // 统一 POSIX → 平台路径；resolve 基于 apps/client/src
      const full = resolve(clientSrcRoot, ...rel.split('/'))
      return !existsSync(full)
    })

    expect(missing).toEqual([])
  })

  it('测试 1：白名单内文件源码（注释豁免后）不得含 CJK 硬编码', () => {
    const violations: string[] = []

    for (const rel of I18N_MIGRATED_FILES) {
      const full = resolve(clientSrcRoot, ...rel.split('/'))
      const source = readFileSync(full, 'utf8')
      const codeLines = stripComments(source)

      codeLines.forEach((line, i) => {
        if (CJK_PATTERN.test(line)) {
          violations.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`)
        }
      })
    }

    expect(violations).toEqual([])
  })

  it('测试 2：zh-CN 与 en 字典 key 集合完全一致（双向 diff 为空）', () => {
    const zhKeys = Object.keys(messages['zh-CN']).sort()
    const enKeys = Object.keys(messages.en).sort()

    // 双向 diff：任一侧多出/缺失的 key 全部列出，便于批次代理一次修完
    const missingInEn = zhKeys.filter((k) => !enKeys.includes(k))
    const missingInZh = enKeys.filter((k) => !zhKeys.includes(k))

    expect({ missingInEn, missingInZh }).toEqual({ missingInEn: [], missingInZh: [] })
    expect(enKeys).toEqual(zhKeys)
  })
})
