/**
 * #615 跨端 ExamSignatureV1 复刻测试（contract-fixtures/exams-signature-v1.json 单一事实源）。
 * 验证前端 buildCrossEndExamSignature 与冻结 fixture 逐位一致（与 Android/iOS 同算法），
 * 以及前台考试变化去重的关键语义。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildCrossEndExamSignature } from './exams_signature'
import { buildLedgerEventKey } from './notification_event_ledger'

const fixturePath = fileURLToPath(
  new URL(
    '../../src-tauri/plugins/tauri-plugin-hbut-background/contract-fixtures/exams-signature-v1.json',
    import.meta.url
  )
)
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  cases: Array<{ name: string; records: unknown[]; expectedSignature: string }>
}

describe('#615 跨端 ExamSignatureV1 复刻（contract-fixtures 单一事实源）', () => {
  it('fixture 全部 case 逐位一致（算法与 #615 冻结基线对齐）', async () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(9)
    for (const item of fixture.cases) {
      const actual = await buildCrossEndExamSignature(item.records)
      expect(actual, `case ${item.name} 的 signature 必须与冻结 fixture 逐位一致`).toBe(
        item.expectedSignature
      )
    }
  })

  it('数组顺序变化不改变 signature（不误报）', async () => {
    const records = [
      { courseName: '高等数学A', examDate: '2026-06-22', examTime: '09:00-11:00', location: '教1-101', seatNo: '12', examType: '正常考试' },
      { courseName: '大学英语', examDate: '2026-06-25', examTime: '14:00-16:00', location: '教2-305', seatNo: '8', examType: '正常考试' }
    ]
    const a = await buildCrossEndExamSignature(records)
    const b = await buildCrossEndExamSignature([...records].reverse())
    expect(a).toBe(b)
  })

  it('无关字段（rawId/updatedAt）不参与签名', async () => {
    const base = [{ courseName: '高数', examDate: '2026-06-22', examTime: '09:00-11:00', location: '教1-101' }]
    const withExtra = [{ ...base[0], rawId: 'e-1', updatedAt: '2026-08-13T00:00:00Z', roomId: 'r-7' }]
    expect(await buildCrossEndExamSignature(withExtra)).toBe(await buildCrossEndExamSignature(base))
  })

  it('前端 API 字段映射（course_name/exam_date/exam_time/seat_no）与契约字段同值', async () => {
    const contract = [{ courseName: '高等数学A', examDate: '2026-06-22', examTime: '09:00-11:00', location: '教1-101', seatNo: '12', examType: '正常考试' }]
    const apiStyle = [{ course_name: '高等数学A', exam_date: '2026-06-22', exam_time: '09:00-11:00', location: '教1-101', seat_no: '12', exam_type: '正常考试' }]
    expect(await buildCrossEndExamSignature(apiStyle)).toBe(await buildCrossEndExamSignature(contract))
  })

  it('空列表 / 全空课程名返回空串（无数据语义，与 native 一致）', async () => {
    expect(await buildCrossEndExamSignature([])).toBe('')
    expect(await buildCrossEndExamSignature([{ courseName: '  ', examDate: '2026-06-22' }])).toBe('')
  })

  it('可感知变化（新增/日期/时间/地点）改变 signature（不漏报）', async () => {
    const base = [
      { courseName: '高等数学A', examDate: '2026-06-22', examTime: '09:00-11:00', location: '教1-101' }
    ]
    const baseSig = await buildCrossEndExamSignature(base)
    expect(await buildCrossEndExamSignature([...base, { courseName: '大学英语', examDate: '2026-06-25', examTime: '14:00-16:00' }]))
      .not.toBe(baseSig)
    expect(await buildCrossEndExamSignature([{ ...base[0], examDate: '2026-06-23' }])).not.toBe(baseSig)
    expect(await buildCrossEndExamSignature([{ ...base[0], examTime: '14:00-16:00' }])).not.toBe(baseSig)
    expect(await buildCrossEndExamSignature([{ ...base[0], location: '教5-502' }])).not.toBe(baseSig)
  })

  it('ledger eventKey = domain:signature（后台/前台共享去重键）', async () => {
    const signature = await buildCrossEndExamSignature(fixture.cases[0].records)
    expect(buildLedgerEventKey('exams', signature)).toBe(`exams:${signature}`)
  })
})
// #706：per-feature 开关（readBgFeatureEnabled/BG_FEATURE_KEY_*）已随独立开关体系移除，
// 检测控制统一收敛至通知类型开关；原读取测试一并删除。
