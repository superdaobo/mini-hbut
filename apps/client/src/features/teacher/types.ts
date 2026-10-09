// src/features/teacher/types.ts
//
// Teacher Portal V2（Epic #1018 / E0 #1019）：教师业务领域类型（契约冻结文件）。
//
// 设计约束（不可违反）：
//   1. **字段命名一律对应 `data/teacher-api-recon/` 的实测字段**（kcmc / jxbid / bjrs …），
//      不得臆造字段；recon 明确标注「命名推断、未验证」的字段一律 optional。
//   2. 教务响应每条记录被框架注入了身份字段
//      （currentUserId / userRoleId / dataAuth / dataXnxq / currentRoleId /
//       currentJsId / currentUserName / currentDepartmentId / new），
//      **这些不是业务字段**，解析时必须丢弃（见 normalizeTeacherData.ts）。
//   3. 部门名 / 职称 / 邮箱等**无真实只读来源**的字段不设为必填；
//      未验证前不展示猜测值（见 plan-teacher-portal-v2.md §3「关于教师个人资料」）。

// ────────────────────────────────────────────────────────────────
// 身份与资料
// ────────────────────────────────────────────────────────────────

/**
 * 教师个人资料（只读）。
 *
 * 来源（recon 02）：
 * - `accountId` ← `/admin/?loginType=1` 的 `.admin_name`（工号）或 getMenuList.currentUserName
 * - `name`      ← `.arrowbt`（姓名）
 * - `roleId`    ← `#roleId`（`js` = 教师）
 * - `departmentId` ← getMenuList.currentDepartmentId
 *
 * ⚠️ `departmentName` / `title` / `email` 在只读勘察中**没有真实来源**，因此全部 optional，
 * 未取得可信数据前 UI 不得展示占位/猜测值。
 */
export interface TeacherProfile {
  /** 工号（教师账号标识）。 */
  accountId: string
  /** 姓名。 */
  name: string
  /** 教务角色标识：`js` = 教师。 */
  roleId: string
  /** 部门 ID（getMenuList.currentDepartmentId，实测样例为数字字符串）。 */
  departmentId: string
  /** 部门名称（无真实只读来源，未验证，optional）。 */
  departmentName?: string
  /** 职称（无真实只读来源，未验证，optional）。 */
  title?: string
  /** 邮箱（无真实只读来源，未验证，optional）。 */
  email?: string
}

// ────────────────────────────────────────────────────────────────
// 教学（recon 04）
// ────────────────────────────────────────────────────────────────

/**
 * 教学任务（`GET /admin/jsd/jxrw/ajaxListJsJxrw`，recon 04 §1.1）。
 *
 * ⚠️ 该接口实测 total=6；recon 只给出字段清单，未给出记录级样本，
 * 因此除 `kcmc` / `name` / `jxbid` / `bjrs` / `jxbzc` / `xnxq` / `xf` 等
 * 明确标注「实测」者外，其余均按 optional 处理。
 */
export interface TeachingTask {
  /** 记录主键（实测：32 位无连字符 UUID 形态）。 */
  id: string
  /** 学期，如 `2026-2027-1`（实测）。 */
  xnxq: string
  /** 课程名称（实测）。 */
  kcmc: string
  /** 教学班名称（实测字段名即 `name`，如 `计算机制图与表达-2【理论】1183`）。 */
  name: string
  /** 教学班 id（实测：32 位无连字符 UUID）。 */
  jxbid: string
  /** 教学班组成（实测：`25建筑学2,25建筑学1`）。 */
  jxbzc?: string
  /** 班级人数（实测：数字）。 */
  bjrs?: number
  /** 学分（实测：**字符串**，如 `"1.5"`）。 */
  xf?: string
  /** 总学时（命名推断，未验证）。 */
  zongxs?: string
  /** 周学时（命名推断，未验证）。 */
  zxs?: string
  /** 上课周次（命名推断，未验证）。 */
  skzc?: string
  /** 教学周次（命名推断，未验证）。 */
  jxzc?: string
  /** 编码型考试形式字段（命名推断，未验证；展示优先用 `ksxsname`）。 */
  ksxs?: string
  /** `ksxs` 的显示名（命名推断，未验证）。 */
  ksxsname?: string
  /** 课程代码（命名推断，未验证）。 */
  kcdm?: string
  /** encodeId（`encodeId=1` 时附带，二次跳转用）。 */
  encodeId?: string
}

/**
 * 我的教学班（`GET /admin/jsd/jsdcjcx/jsdQueryJxbList`，recon 04 §1.4，有完整实测样本）。
 *
 * ⚠️ 与教学任务粒度不同（total=4 vs 6），**禁止按数组索引拼接**，必须按 `jxbid` 关联。
 */
export interface TeachingClass {
  /** 记录主键（实测：32 位无连字符 UUID）。 */
  id: string
  /** 课程名称（实测）。 */
  kcmc: string
  /** 课程编号（实测：`20605010A`）。 */
  kcbh: string
  /** 学期（实测）。 */
  xnxq: string
  /** 教学班名称（实测）。 */
  name: string
  /** 教学班 id（实测）。 */
  jxbid: string
  /** 教学班组成（实测）。 */
  jxbzc?: string
  /** 班级人数（实测：数字）。 */
  bjrs?: number
  /** 学分（实测：字符串）。 */
  xf?: string
  /** 学时（实测：字符串）。 */
  xs?: string
  /** 开课院系名称（实测：`土木建筑与环境学院`）。 */
  kkyxmc?: string
  /** 成绩发布状态（实测值 `"1"`；取值含义 recon 未记录，**不得据此做业务判断**）。 */
  cjfbzt?: string
  /** 实测值 `"1"`；语义 recon 未记录（命名推断：疑为补考标记，未验证）。 */
  bkbj?: string
  /** 编码型字段（实测值 `"1"`），含义 recon 未记录。 */
  ksxs?: string
}

/** `teacher_teaching_fetch` 的归一化载荷：教学任务 + 我的教学班（两者按 `jxbid` 关联）。 */
export interface TeacherTeachingData {
  tasks: TeachingTask[]
  classes: TeachingClass[]
}

// ────────────────────────────────────────────────────────────────
// 考试与监考（recon 05）
// ────────────────────────────────────────────────────────────────

/**
 * 我的监考安排（`GET /admin/jsd/kwglJsdJkcx/ajaxJsjkList`，recon 05 §1.1，实测 total=1）。
 */
export interface Invigilation {
  id: string
  /** 学期。 */
  xnxq?: string
  /** 批次 ID。 */
  pcid?: string
  /** 校区名称（实测：`本部`）。 */
  xqmc?: string
  /** 监考角色（实测：`主监考`）。 */
  zjk?: string
  /** 考试日期。 */
  ksrq?: string
  /** 考试场次。 */
  kscc?: string
  /** 课程名称。 */
  kcmc: string
  /** 教室名称。 */
  jsmc?: string
  /** 考试人数。 */
  ksrs?: number
  /** 考试批次名称。 */
  kspcmc?: string
  /** 考试方式。 */
  ksfs?: string
  /** 监考教师姓名。 */
  jkjsxm?: string
  /** 开课院系。 */
  kkyx?: string
  /** 考试班级。 */
  ksbj?: string
  /** 未实测（命名推断，未验证）。 */
  ypjks?: string
  /** 未实测（命名推断，未验证）。 */
  txbz?: string
  /** 未实测（命名推断，未验证）。 */
  gld?: string
}

/**
 * 任课班级考试（`GET /admin/jsd/kwglJsdJkcx/ajaxJsrkjxbksList`，recon 05 §1.2，实测 total=1）。
 */
export interface TeacherExam {
  id: string
  /** 课程名称（实测）。 */
  kcmc: string
  /** 教室名称（实测：`2-302`）。 */
  jsmc?: string
  /** 监考教师（实测：`<教师姓名>(主),<教师姓名B>`）。 */
  jkjs?: string
  /** 考试时间（实测：`2026-08-30 14:30~18:00`）。 */
  kssj?: string
  /** 考试人数（实测：数字）。 */
  ksrs?: number
  /** 开课院系。 */
  kkyx?: string
  /** 考试批次名称。 */
  kspcmc?: string
  /** 考试日期。 */
  ksrq?: string
  /** 班级名称。 */
  bjmc?: string
  /** 教学班名称。 */
  jxbmc?: string
  /** 教师姓名。 */
  jsname?: string
  /** 课程编号。 */
  kcbh?: string
  /** 监考教师 ID。 */
  jkjsid?: string
  /** 起始时间。 */
  qssj?: string
  /** 结束时间。 */
  jssj?: string
  /** encodeId（`encodeId=1` 时附带）。 */
  encodeId?: string
  /** 未实测（命名推断，未验证）。 */
  syrl?: string
  /** 未实测（命名推断，未验证）。 */
  skyx?: string
  /** 未实测（命名推断，未验证）。 */
  sjbh?: string
}

/** `teacher_exams_fetch` 的归一化载荷：监考安排 + 任课班级考试。 */
export interface TeacherExamData {
  invigilations: Invigilation[]
  exams: TeacherExam[]
}

// ────────────────────────────────────────────────────────────────
// 通知（recon 06）
// ────────────────────────────────────────────────────────────────

/**
 * 教务通知（`GET /admin/system/tzsjx/ajaxList`，recon 06 §2.1，实测 total=15）。
 *
 * ⚠️ `title` **含 HTML**（如 `<span class='label label-primary'>置顶</span>`），
 * 展示前必须经 normalizeTeacherData 清洗，**禁止 innerHTML 直出**。
 */
export interface TeacherNotice {
  id: string
  /** 标题（含 HTML，需清洗）。 */
  title: string
  /** 发布日期。 */
  releaseDate?: string
  /** 通知类型（编码）。 */
  noticeType?: string
  /** 通知类型名称。 */
  noticeTypeName?: string
  /** 正文内容（可能含 HTML，需清洗）。 */
  content?: string
  /** 未实测（命名推断：疑为读取状态，未验证）。 */
  dqstatus?: string
  /** 未实测（命名推断：疑为收藏状态，未验证）。 */
  collectstatus?: string
  /** 未实测（命名推断：疑为是否置顶，未验证）。 */
  sfzd?: string
  /** 未实测（命名推断，未验证）。 */
  sfsq?: string
  /** 未实测（命名推断，未验证）。 */
  sfxshd?: string
}

// ────────────────────────────────────────────────────────────────
// 工作流（recon 06；E7 延期，本阶段仅占位类型）
// ────────────────────────────────────────────────────────────────

/**
 * 只读工作流项（`GET /admin/activiti/myApply/qryMyApply`，recon 06 §1.1，实测 total=2）。
 *
 * ⚠️ E7（#1027）本轮不做，本类型仅供后续工作流只读视图使用。
 */
export interface WorkflowItem {
  id: string
  processInstanceId?: string
  /** 流程实例 ID 的编码形式（前端跳转用）。 */
  processInstanceIdEnc?: string
  endTime?: string
  createTime?: string
  definitionName?: string
  status?: string
  /** 业务类型。 */
  busiType?: string
  /** 业务类型编码。 */
  busiTypeCode?: string
  version?: string
  /** 未实测（命名推断：疑为处理意见，未验证）。 */
  clyj?: string
  /** 未实测（命名推断：疑为审核状态，未验证）。 */
  shzt?: string
  /** 未实测（命名推断，未验证）。 */
  queryprotype?: string
  /** 未实测（命名推断，未验证）。 */
  sproleqf?: string
}

// ────────────────────────────────────────────────────────────────
// 统一错误模型 / 加载状态（跨 Tauri 与 Web bridge 共用）
// ────────────────────────────────────────────────────────────────

/**
 * 教师数据错误类别（与 recon 02 §8「错误形态速查」一一对应）：
 *
 * - `empty`         空列表（接口可用但无数据；**不是错误**，UI 走空态）
 * - `unauthorized`  HTTP 401 / 「没有访问当前接口的权限!…[模块:子模块]」
 * - `expired`       会话过期（被重定向登录页 / 「会话已过期，请重新登录」）
 * - `errorHtml`     HTTP 200 + 错误 HTML 页（「报错啦 / 错误原因：…」）
 * - `timeout`       请求超时
 * - `notImplemented` 本阶段 stub 未实现（E0 默认，E2/E5/E6 会替换实现）
 * - `unknown`       其它未归类错误
 */
export type TeacherDataErrorKind =
  | 'empty'
  | 'unauthorized'
  | 'expired'
  | 'errorHtml'
  | 'timeout'
  | 'notImplemented'
  | 'unknown'

/** 可展示的教师数据错误（携带机器可判定的 kind + 用户可读 message）。 */
export interface TeacherDataError {
  kind: TeacherDataErrorKind
  message: string
}

/**
 * 教师数据加载状态（composable / 视图统一消费）。
 *
 * `status === 'empty'` 时 `data` 为 `null`；`status === 'error'` 时 `error` 非空。
 */
export interface TeacherLoadState<T> {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  data: T | null
  error: TeacherDataError | null
}
