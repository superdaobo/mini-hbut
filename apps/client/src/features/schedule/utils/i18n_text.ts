/**
 * 课表域 i18n 文案辅助（issue #788）。
 *
 * app_i18n 的 t() 是纯查表（不支持插值参数），而课表域大量文案是
 * 「模板 + 数字/名称」组合（如「第 3 周」「已选 5 周」）。本 helper 统一用
 * 字典占位符 {n}/{w}/{t} 等做一次性替换，避免各组件散落字符串拼接。
 *
 * ⚠️ 响应式说明：t() 内部读模块级 currentLocale（非响应式）。在 computed /
 * 模板中使用本函数时，调用方需先建立 locale 依赖（读 useI18n() 返回的
 * locale.value，或在模板根节点绑定 :data-locale="locale"），语言切换才会
 * 触发重渲染/重算；在事件回调中使用则取词时机天然正确，无需额外处理。
 */
import { t } from '../../../utils/app_i18n'

/**
 * 取词并替换占位符：tf('schedule.week.pickerCell', { n: 3 })。
 * 字典 value 形如 '第{n}周' / 'W{n}'；占位符缺失时原样返回未替换部分。
 * 注：tf 走模块级 t()（非响应式）；响应式场景由调用方建立 locale 依赖。
 */
export const tf = (key: string, params: Record<string, string | number>): string => {
  let text = t(key)
  for (const [name, value] of Object.entries(params)) {
    text = text.replace(`{${name}}`, String(value))
  }
  return text
}
