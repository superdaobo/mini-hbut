import { readFileSync } from 'node:fs'
import { compileScript, parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

/**
 * #1099 回归门禁：不能仅断言源码包含某段文本。
 *
 * Vue SFC 的 <script setup> 允许注释吞掉整段声明而不报编译错误，
 * 运行时模板/生命周期再访问它们就会出现 ReferenceError 和白屏。
 * 因此必须检查 Vue 编译器真正输出的 setup bindings。
 */
describe('ClassroomView setup binding regression (#1099)', () => {
  it('keeps classroom filters and request lifecycle functions in compiled setup bindings', () => {
    const filename = 'ClassroomView.vue'
    const source = readFileSync(new URL('./ClassroomView.vue', import.meta.url), 'utf8')
    const { descriptor, errors } = parse(source, { filename })

    expect(errors).toEqual([])

    const bindings = compileScript(descriptor, { id: 'classroom-binding-regression' }).bindings ?? {}
    const required = [
      'selectCurrentWeek',
      'createAbortSignal',
      'clearAbortController',
      'resolveStudentId',
      'readClassroomSnapshot',
      'writeClassroomSnapshot',
      'applyClassroomSnapshot',
      'restoreClassroomSnapshot',
      'filters',
      'weekOptions',
      'weekdayOptions',
      'periodOptions',
      'periodGroups',
      'fetchBuildings',
      'CLASS_SCHEDULE'
    ]
    const missing = required.filter((name) => !String(bindings[name] || '').startsWith('setup-'))

    expect(missing).toEqual([])
  })
})
