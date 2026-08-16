// 学习通课程中心领域类型定义
// 描述：ChaoxingHubView 拆分后，课程列表/章/小节/任务点/视频/文档/成绩共用的类型。

/** 任务类型元信息（前端展示用） */
export interface ChaoxingTypeMeta {
  text: string
  type: 'info' | 'warning' | 'danger' | 'primary' | 'muted'
  kind: 'video' | 'document' | 'work' | 'knowledge' | 'unknown' | 'task'
}

/** 课程（列表项） */
export interface ChaoxingCourse {
  id: string
  courseId: string
  clazzId: string
  cpi: string
  title: string
  teacher: string
  imageUrl: string
  progressText: string
  progressRate: number
  pendingCount: number
  courseUrl: string
  semester: string
}

/** 小节（知识点） */
export interface ChaoxingKnowledge {
  id: string
  knowledgeId: string
  title: string
  completed: boolean
  courseId: string
  clazzId: string
  cpi: string
  layer: number
}

/** 章 */
export interface ChaoxingSection {
  id: string
  title: string
  knowledges: ChaoxingKnowledge[]
}

/** 任务点（小节内） */
export interface ChaoxingTask {
  id: string
  title: string
  objectId: string
  jobid: string
  completed: boolean
  status: string
  typeMeta: ChaoxingTypeMeta
  kind: ChaoxingTypeMeta['kind']
  empty_hint: boolean
}

/** 导航栈帧：list → course → section → knowledge → video | document | score */
export interface ChaoxingStackFrame {
  level: string
  course?: ChaoxingCourse
  /** 课程层展开的章列表（outline 归一化结果，模板用 current.sections 显示章数与渲染章列表） */
  sections?: ChaoxingSection[]
  section?: ChaoxingSection
  knowledge?: ChaoxingKnowledge
  tasks?: ChaoxingTask[]
  task?: ChaoxingTask
  meta?: { fid: string; reportUrl: string; userid: string }
  progress?: Record<string, unknown>
  score?: Record<string, unknown>
  src?: string
  playUrls?: string[]
  poster?: string
  filename?: string
  duration?: number
  candidates?: string[]
  fileType?: string
}

/** 成绩饼图切片 */
export interface ScoreSlice {
  name: string
  value: number
  pct: number
  color: string
  start: number
  end: number
}
