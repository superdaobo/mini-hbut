/**
 * 成绩领域测试样本（fixtures）
 *
 * 覆盖：Rust 标准响应字段（snake_case）、历史别名字段（kcmc/xf/zhcj 等）、
 * 全部 15 种 outcome、绩点三态（官方优先/数字与定性估算/特殊状态不估算）、补考标记、
 * 课程名前缀清理与边界输入。
 */
import type { GradeOutcomeValue } from './grades.js'

export interface GradeFixtureExpect {
  outcome: GradeOutcomeValue
  scoreNumber?: number | null
  gradePoint?: number | null
  gradePointEstimated?: boolean
  creditGradePoint?: string
  isPass?: boolean
  isFailed?: boolean
  isMakeup?: boolean
  isDeferred?: boolean
  isExempt?: boolean
  sortScore?: number
  tagKeys?: string[]
  term?: string
  course_name?: string
  course_credit?: string
  earned_credit?: string
  final_score?: string
  teacher?: string
  entryTeacher?: string
  courseTeacher?: string
  course_nature?: string
}

export interface GradeFixture {
  name: string
  raw: Record<string, unknown>
  expect: GradeFixtureExpect
}

/** 全部 outcome 与关键规则样本 */
export const gradeFixtures: GradeFixture[] = [
  {
    name: '数字成绩 + 官方绩点（Rust 标准字段）',
    raw: {
      term: '2024-2025-1',
      course_name: '高等数学 A',
      course_credit: '4.0',
      earned_credit: '4.0',
      final_score: '92',
      xfjd: '4.20',
      sfbk: '',
      sfsq: '',
      cjbj: '',
      teacher: '张老师'
    },
    expect: {
      outcome: 'numeric',
      scoreNumber: 92,
      gradePoint: 4.2,
      gradePointEstimated: false,
      creditGradePoint: '4.2',
      isPass: true,
      isFailed: false,
      sortScore: 92,
      term: '2024-2025-1',
      course_name: '高等数学 A',
      course_credit: '4.0',
      teacher: '张老师',
      entryTeacher: '张老师'
    }
  },
  {
    name: '数字成绩无官方绩点 → 估算并标记（旧别名字段）',
    raw: {
      xnxq: '2024-2025-2',
      kcmc: '程序设计基础',
      xf: '3.0',
      hdxf: '3.0',
      zhcj: '88',
      kcxz: '必修',
      cjlrjsxm: '李老师'
    },
    expect: {
      outcome: 'numeric',
      scoreNumber: 88,
      gradePoint: 3.8,
      gradePointEstimated: true,
      creditGradePoint: '-',
      isPass: true,
      isFailed: false,
      sortScore: 88,
      term: '2024-2025-2',
      course_name: '程序设计基础',
      course_credit: '3.0',
      course_nature: '必修',
      teacher: '李老师',
      entryTeacher: '李老师'
    }
  },
  {
    name: '数字成绩不及格（无官方绩点，估算为 0.5）',
    raw: { term: '2023-2024-1', course_name: '大学物理', course_credit: '3', final_score: '55' },
    expect: {
      outcome: 'numeric',
      scoreNumber: 55,
      gradePoint: 0.5,
      gradePointEstimated: true,
      isPass: false,
      isFailed: true,
      sortScore: 55,
      tagKeys: ['failed']
    }
  },
  {
    name: '优秀',
    raw: { term: '2024-2025-1', course_name: '英语听说', final_score: '优秀', xfjd: '4.50' },
    expect: {
      outcome: 'excellent',
      scoreNumber: null,
      gradePoint: 4.5,
      gradePointEstimated: false,
      isPass: true,
      isFailed: false,
      sortScore: 95
    }
  },
  {
    name: '良好（按 Rust 定性映射估算绩点）',
    raw: { term: '2024-2025-1', course_name: '体育', final_score: '良好' },
    expect: {
      outcome: 'good',
      scoreNumber: null,
      gradePoint: 3,
      gradePointEstimated: true,
      creditGradePoint: '-',
      isPass: true,
      isFailed: false,
      sortScore: 80
    }
  },
  {
    name: '中等',
    raw: { term: '2024-2025-1', course_name: '军事理论', final_score: '中等' },
    expect: {
      outcome: 'medium',
      scoreNumber: null,
      gradePoint: 3,
      gradePointEstimated: true,
      isPass: true,
      isFailed: false,
      sortScore: 80
    }
  },
  {
    name: '合格',
    raw: { term: '2023-2024-2', course_name: '金工实习', final_score: '合格' },
    expect: {
      outcome: 'qualified',
      scoreNumber: null,
      gradePoint: 1,
      gradePointEstimated: true,
      isPass: true,
      isFailed: false,
      sortScore: 60
    }
  },
  {
    name: '及格（兼容映射为合格）',
    raw: { term: '2023-2024-2', course_name: '金工实习', final_score: '及格' },
    expect: { outcome: 'qualified', gradePoint: 1, gradePointEstimated: true, isPass: true, isFailed: false, sortScore: 60 }
  },
  {
    name: '通过',
    raw: { term: '2023-2024-2', course_name: '创新创业实践', final_score: '通过' },
    expect: {
      outcome: 'pass',
      scoreNumber: null,
      gradePoint: 1,
      gradePointEstimated: true,
      isPass: true,
      isFailed: false,
      sortScore: 60
    }
  },
  {
    name: '不合格（不得误判为“合格”）',
    raw: { term: '2023-2024-1', course_name: '大学物理实验', final_score: '不合格' },
    expect: {
      outcome: 'unqualified',
      scoreNumber: null,
      gradePoint: 0,
      gradePointEstimated: true,
      isPass: false,
      isFailed: true,
      sortScore: 0,
      tagKeys: ['failed']
    }
  },
  {
    name: '未通过（不得误判为“通过”）',
    raw: { term: '2023-2024-1', course_name: '体育', final_score: '未通过' },
    expect: {
      outcome: 'failed',
      scoreNumber: null,
      gradePoint: 0,
      gradePointEstimated: true,
      isPass: false,
      isFailed: true,
      sortScore: 0,
      tagKeys: ['failed']
    }
  },
  {
    name: '不及格',
    raw: { term: '2023-2024-1', course_name: '工程制图', final_score: '不及格' },
    expect: { outcome: 'failed', gradePoint: 0, gradePointEstimated: true, isPass: false, isFailed: true, sortScore: 0, tagKeys: ['failed'] }
  },
  {
    name: '缺考',
    raw: { term: '2023-2024-1', course_name: '大学英语', final_score: '缺考' },
    expect: {
      outcome: 'absent',
      scoreNumber: null,
      gradePoint: null,
      isPass: false,
      isFailed: false,
      sortScore: 0,
      tagKeys: ['absent']
    }
  },
  {
    name: '缓考（文本）',
    raw: { term: '2024-2025-1', course_name: '高等数学 A', final_score: '缓考' },
    expect: {
      outcome: 'deferred',
      scoreNumber: null,
      gradePoint: null,
      isPass: false,
      isFailed: false,
      isDeferred: true,
      sortScore: -1,
      tagKeys: ['deferred']
    }
  },
  {
    name: '缓考（cjbj=2，成绩文本为空）',
    raw: { term: '2024-2025-1', course_name: '高等数学 A', final_score: '', cjbj: '2', sfsq: '' },
    expect: { outcome: 'deferred', isDeferred: true, isFailed: false, tagKeys: ['deferred'] }
  },
  {
    name: '缓考（sfsq=1）',
    raw: { term: '2024-2025-1', course_name: '线性代数', final_score: '', sfsq: '1' },
    expect: { outcome: 'deferred', isDeferred: true, isFailed: false, tagKeys: ['deferred'] }
  },
  {
    name: '免修（文本）',
    raw: { term: '2024-2025-1', course_name: '形势与政策', final_score: '免修' },
    expect: {
      outcome: 'exempt',
      scoreNumber: null,
      gradePoint: null,
      isPass: false,
      isFailed: false,
      isExempt: true,
      tagKeys: ['exempt']
    }
  },
  {
    name: '免修（cjbj=3，成绩文本为空）',
    raw: { term: '2024-2025-1', course_name: '形势与政策', final_score: '', cjbj: '3' },
    expect: { outcome: 'exempt', isExempt: true, tagKeys: ['exempt'] }
  },
  {
    name: '免考',
    raw: { term: '2024-2025-1', course_name: '大学计算机基础', final_score: '免考' },
    expect: {
      outcome: 'exempted_exam',
      scoreNumber: null,
      gradePoint: null,
      isPass: false,
      isFailed: false,
      isExempt: true,
      tagKeys: ['exempted_exam']
    }
  },
  {
    name: '待录入',
    raw: { term: '2024-2025-1', course_name: '专业导论', final_score: '待录入' },
    expect: {
      outcome: 'pending',
      scoreNumber: null,
      gradePoint: null,
      isPass: false,
      isFailed: false,
      tagKeys: ['pending']
    }
  },
  {
    name: '未知文本',
    raw: { term: '2024-2025-1', course_name: '课程', final_score: '待定' },
    expect: {
      outcome: 'unknown',
      scoreNumber: null,
      gradePoint: null,
      isPass: false,
      isFailed: false,
      tagKeys: []
    }
  },
  {
    name: '空成绩（无标记）→ 待录入',
    raw: { term: '2024-2025-1', course_name: '课程', final_score: '' },
    expect: { outcome: 'pending', scoreNumber: null, gradePoint: null, isPass: false, isFailed: false, tagKeys: ['pending'] }
  },
  {
    name: '补考标记 sfbk=1（数字成绩仍合格）',
    raw: { term: '2023-2024-2', course_name: '高等数学 A', course_credit: '4', final_score: '90', sfbk: '1' },
    expect: {
      outcome: 'retake',
      scoreNumber: 90,
      isPass: true,
      isFailed: false,
      isMakeup: true,
      tagKeys: ['makeup']
    }
  },
  {
    name: '补考标记 cjbj=1',
    raw: { term: '2023-2024-2', course_name: '高等数学 A', final_score: '78', cjbj: '1' },
    expect: { outcome: 'retake', isMakeup: true, tagKeys: ['makeup'] }
  },
  {
    name: '成绩文本含“补考”',
    raw: { term: '2023-2024-2', course_name: '高等数学 A', final_score: '补考 88' },
    expect: { outcome: 'retake', scoreNumber: 88, isMakeup: true, tagKeys: ['makeup'] }
  },
  {
    name: '课程名 [xxx] 前缀清理',
    raw: { term: '2024-2025-1', kcmc: '[TZ2024]高等数学 A', zhcj: '90', xf: '4' },
    expect: { outcome: 'numeric', course_name: '高等数学 A', scoreNumber: 90 }
  },
  {
    name: '完整 Rust 响应（含 course_teacher 与 kcbh）',
    raw: {
      term: '2024-2025-1',
      course_name: '数据结构',
      grade_id: '123',
      course_code: 'KCH001',
      course_nature: '必修',
      course_nature_code: '90',
      course_credit: '3.5',
      final_score: '86',
      earned_credit: '3.5',
      xfjd: '3.60',
      sfbk: '0',
      sfsq: '0',
      cjbj: '',
      teacher: '录入员',
      kcbh: 'KCBH001',
      course_teacher: '王教授'
    },
    expect: {
      outcome: 'numeric',
      scoreNumber: 86,
      gradePoint: 3.6,
      gradePointEstimated: false,
      course_nature: '必修',
      course_credit: '3.5',
      earned_credit: '3.5',
      teacher: '录入员',
      entryTeacher: '录入员',
      courseTeacher: '王教授'
    }
  },
  {
    name: '无录入教师时卡片教师回退课程教师',
    raw: {
      term: '2024-2025-1',
      course_name: '操作系统',
      final_score: '82',
      course_teacher: '陈老师'
    },
    expect: { outcome: 'numeric', teacher: '陈老师', courseTeacher: '陈老师', entryTeacher: '' }
  },
  {
    name: '课程性质代码映射（31 → 学科基础）',
    raw: { term: '2024-2025-1', course_name: '电路原理', final_score: '91', kcxz: '31' },
    expect: { outcome: 'numeric', course_nature: '学科基础' }
  },
  {
    name: '空对象',
    raw: {},
    expect: {
      outcome: 'unknown',
      term: '',
      course_name: '',
      course_credit: '',
      final_score: '-',
      gradePoint: null,
      gradePointEstimated: false,
      isPass: false,
      isFailed: false,
      sortScore: -1
    }
  }
]

/** 边界输入（非对象/空值等） */
export const edgeCaseFixtures: Array<{ name: string; input: unknown }> = [
  { name: 'null', input: null },
  { name: 'undefined', input: undefined },
  { name: '数字', input: 42 },
  { name: '字符串', input: 'hello' },
  { name: '数组', input: [1, 2] }
]

/** 批量归一化输入样本 */
export const batchFixtureInputs: unknown[] = [
  { term: '2024-2025-1', course_name: '甲', final_score: '95' },
  { term: '2024-2025-1', course_name: '乙', final_score: '不合格' },
  null,
  { term: '2023-2024-2', course_name: '丙', final_score: '缓考' }
]
