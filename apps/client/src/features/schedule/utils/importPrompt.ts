/**
 * AI 课表导入 - 提示词构建（纯函数）。
 *
 * 设计要点（#815）：
 *   - 提示词独立成模块，不硬编码在 Vue template 中；
 *   - 颜色候选**由唯一色板动态拼接**（utils/course_color.ts 的 COURSE_COLOR_PRESETS），
 *     避免提示词与 UI 色板维护两份数据而产生漂移；
 *   - 不绑定任何具体 AI 供应商品牌，统一表述为「外部 AI」。
 */
import { COURSE_COLOR_PRESETS } from '../../../utils/course_color'
import { AI_COURSE_IMPORT_FORMAT, AI_COURSE_IMPORT_VERSION } from './importTypes'

/**
 * 生成可一键复制的 AI 识别提示词。
 * 颜色候选直接来自当前色板，新增/调整色板时提示词自动同步。
 */
export const buildAiCourseImportPrompt = (): string => {
  const colorCandidates = COURSE_COLOR_PRESETS.map((preset) => `${preset.hex}(${preset.label})`).join('、')

  return [
    '你正在把大学课表截图转换成 Mini-HBUT 可以导入的数据。',
    '',
    '请严格识别截图中的真实信息，不要补充、推测或虚构任何课程。',
    '',
    '输出要求：',
    '1. 只输出 JSON，不要输出解释，不要使用 Markdown 代码块。',
    '2. 顶层格式固定为：',
    '   {',
    `     "format": "${AI_COURSE_IMPORT_FORMAT}",`,
    `     "version": ${AI_COURSE_IMPORT_VERSION},`,
    '     "courses": [ ... ]',
    '   }',
    '3. 每门课程的字段：',
    '   - name：课程名（必填）',
    '   - weekday：星期，使用「周一」到「周日」（必填）',
    '   - periods：节次，使用「3-4」这种起止格式（必填）',
    '   - weeks：周次（必填）',
    '   - teacher：任课老师（可选）',
    '   - room：上课地点（可选）',
    '   - color：颜色（可选）',
    '4. weeks 的写法：',
    '   - 连续周：1-16',
    '   - 单周：1-15单',
    '   - 双周：2-16双',
    '   - 不连续：1-4,6,8-12',
    '5. 如果同一门课在不同周的老师、地点、星期或节次不同，请拆成多条。',
    '6. 如果只是同一门课同一时间被图片重复显示，请合并成一条，不要逐周输出。',
    '7. teacher 或 room 无法确认时填空字符串，不要猜测。',
    '8. 不要输出 semester、id、source_id。',
    '9. color 只能从下面这份颜色列表中选择（必须原样使用其中的十六进制值）：',
    `   ${colorCandidates}`,
    '',
    '只输出 JSON。'
  ].join('\n')
}

/** 格式示例：用于 UI「查看格式示例」展示，与协议 v1 保持一致 */
export const buildAiCourseImportExample = (): string =>
  JSON.stringify(
    {
      format: AI_COURSE_IMPORT_FORMAT,
      version: AI_COURSE_IMPORT_VERSION,
      courses: [
        {
          name: '电路理论',
          teacher: '张老师',
          room: '实2-C301',
          weekday: '周二',
          periods: '3-4',
          weeks: '1-16',
          color: COURSE_COLOR_PRESETS[0]?.hex ?? ''
        },
        {
          name: '大学体育',
          teacher: '李老师',
          room: '西区操场',
          weekday: '周四',
          periods: '5-6',
          weeks: '1-15单'
        }
      ]
    },
    null,
    2
  )
