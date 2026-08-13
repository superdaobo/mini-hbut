// ExamSignatureV1 独立复算脚本（Node，无第三方依赖）
// 用途：为 contract-fixtures/exams-signature-v1.json 计算 expectedSignature。
// 与 Kotlin/Swift/前端实现使用同一算法契约：
//   normalize: 字符串 trim；nil/空串等价；courseName trim 后为空则整条记录不参与签名；
//   line:      "courseName|examDate|examTime|location|seatNo|examType"（nil/空 -> 空串）；
//   sort:      UTF-8 字节序；
//   join:      "\n"；
//   hash:      SHA-256 hex 小写（Node crypto）。
import { createHash } from 'node:crypto'

const normalize = (v) => (v == null ? '' : String(v).trim())

const compute = (records) => {
  const lines = []
  for (const raw of records) {
    const courseName = normalize(raw.courseName)
    if (!courseName) continue
    const examDate = normalize(raw.examDate)
    const examTime = normalize(raw.examTime)
    const location = normalize(raw.location)
    const seatNo = normalize(raw.seatNo)
    const examType = normalize(raw.examType)
    lines.push(`${courseName}|${examDate}|${examTime}|${location}|${seatNo}|${examType}`)
  }
  if (lines.length === 0) return ''
  lines.sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')))
  const payload = lines.join('\n')
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}

const baseline = [
  { courseName: '高等数学A', examDate: '2026-06-22', examTime: '09:00-11:00', location: '教1-101', seatNo: '12', examType: '正常考试' },
  { courseName: '大学英语', examDate: '2026-06-25', examTime: '14:00-16:00', location: '教2-305', seatNo: '8', examType: '正常考试' },
  { courseName: '体育', examDate: '2026-06-28', examTime: '09:00-10:00', location: '田径场A区', seatNo: '', examType: '重修' }
]

const cases = {
  'first-baseline': baseline,
  'identical-data': baseline,
  'array-order-changed': [...baseline].reverse(),
  'new-exam-added': [
    ...baseline,
    { courseName: '程序设计', examDate: '2026-07-01', examTime: '09:00-11:00', location: '教3-201', seatNo: '23', examType: '正常考试' }
  ],
  'exam-removed': baseline.filter((e) => e.courseName !== '体育'),
  'date-changed': baseline.map((e) =>
    e.courseName === '大学英语' ? { ...e, examDate: '2026-06-26' } : e
  ),
  'time-changed': baseline.map((e) =>
    e.courseName === '高等数学A' ? { ...e, examTime: '14:00-16:00' } : e
  ),
  'location-changed': baseline.map((e) =>
    e.courseName === '高等数学A' ? { ...e, location: '教5-502' } : e
  ),
  'unrelated-field-changed': baseline.map((e) => ({
    ...e,
    courseName: `  ${e.courseName}  `,
    examDate: ` ${e.examDate} `,
    examTime: ` ${e.examTime} `,
    location: ` ${e.location} `,
    seatNo: e.seatNo ? ` ${e.seatNo} ` : '',
    rawId: 'e-1001',
    updatedAt: '2026-08-13T12:00:00Z',
    roomId: 'r-77'
  }))
}

for (const [name, records] of Object.entries(cases)) {
  const sig = compute(records)
  const baselineSig = compute(baseline)
  const expectation =
    sig === baselineSig ? 'SAME (不触发)' : sig === '' ? 'EMPTY' : 'DIFF (触发)'
  console.log(`${name}: ${sig}  [${expectation}]`)
}
