// goal-21 / T14：生成前后端字段对照表
// 后端字段从 Rust 的 json!({...}) 提取（权威来源），前端字段从 composable/View 的
// `.field` 引用提取（去噪后），上游 JSON 字段从注释与 recon 文档对照。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/wt/teacher-portal-probe-1120';
const BE = path.join(ROOT, 'apps/client/src-tauri/src/http_client/academic/teacher');
const BE_CX = path.join(ROOT, 'apps/client/src-tauri/src/modules');
const FE = path.join(ROOT, 'apps/client/src/features/teacher');

/** 模块 → { 后端文件, 前端文件, 上游接口, 说明 } */
const MODULES = [
  {
    key: 'attendance', title: '学生考勤',
    be: path.join(BE, 'attendance.rs'),
    fe: path.join(FE, 'composables/useTeacherAttendance.ts'),
    upstream: 'GET /admin/jsd/xskq/ajaxListJsJxrw',
    note: 'jqGrid JSON；cqzt1..20 为二十周考勤状态',
  },
  {
    key: 'workload', title: '教师工作量',
    be: path.join(BE, 'workload.rs'),
    fe: path.join(FE, 'composables/useTeacherWorkload.ts'),
    upstream: 'GET /twork/jsd/current-user-gzl',
    note: '同 host 微服务，{code:1} 语义，data 可能全 null',
  },
  {
    key: 'workflow', title: '只读工作流',
    be: path.join(BE, 'workflow.rs'),
    fe: path.join(FE, 'composables/useTeacherWorkflow.ts'),
    upstream: 'POST /admin/activiti/myApply/{qryMyApply,qryOperationApply} + /dbsy/listRunningProcessInstaces',
    note: '三个 jqGrid 列表；已剔除 9 个框架注入身份字段',
  },
  {
    key: 'exam_affairs', title: '考试事务',
    be: path.join(BE, 'exam_affairs.rs'),
    fe: path.join(FE, 'composables/useTeacherExamAffairs.ts'),
    upstream: 'GET /admin/kw/kwhkgl/hkmdcxjg + /jsd/sjgl/ajaxSysj + /pj/xspjxxcx/acustomList',
    note: '三个 jqGrid；allEmpty 为三项全空信号',
  },
  {
    key: 'credits', title: '学分统计',
    be: path.join(BE, 'credits.rs'),
    fe: path.join(FE, 'composables/useTeacherCredits.ts'),
    upstream: 'GET /admin/xjgl/xftj/getxftjlist + /xjgl/xftj/showBjgKcDetail',
    note: '宽表：21 个数字键为学分档位；含 PII 已过滤',
  },
  {
    key: 'adjustment', title: '调停补申请',
    be: path.join(BE, 'adjustment.rs'),
    fe: path.join(FE, 'composables/useTeacherAdjustment.ts'),
    upstream: 'GET /admin/jsd/ttbgl/queryTtbxxList?listtype=js + /queryJsPkxx',
    note: '我的申请 0 条 / 可申请课程 6 条',
  },
  {
    key: 'roster', title: '学生名册',
    be: path.join(BE, 'roster.rs'),
    fe: path.join(FE, 'composables/useTeacherRoster.ts'),
    upstream: 'GET /admin/xjgl/xsjbxx/xsxxcxListCustom',
    note: '⛔ 已禁用：接口不支持任何过滤，恒返回全校 56957 条',
  },
  {
    key: 'grade_entry', title: '成绩录入',
    be: path.join(BE, 'grade_entry.rs'),
    fe: path.join(FE, 'composables/useTeacherGradeEntry.ts'),
    upstream: 'GET /admin/jsd/jsdcjlr/queryCjlrsz/1 + /jsd/jsdcjcx/jsdQueryJxbList',
    note: 'progress 8 条 / teachingClasses 4 条，按 classId 匹配',
  },
  {
    key: 'portal_cards', title: '融合门户卡片',
    be: path.join(BE, 'portal_cards.rs'),
    fe: path.join(FE, 'composables/useTeacherPortalCards.ts'),
    upstream: 'GET /getPageView + POST /execCardMethod/{wid}/{cardId}',
    note: 'e.hbut 域；cardLayout 是嵌套 JSON 字符串',
  },
  {
    key: 'schedule_extra', title: '课表扩展',
    be: path.join(BE, 'schedule_extra.rs'),
    fe: path.join(FE, 'composables/useTeacherScheduleLists.ts'),
    upstream: 'GET /admin/pkgl/kbcx/bjkb/qryBjxx?qx=1 + /pkglcroomkb/ajaxListCustom',
    note: '班级 3315 / 教室 1741；课表本身无 JSON 接口',
  },
  {
    key: 'chaoxing_teacher', title: '学习通教师侧',
    be: path.join(BE_CX, 'chaoxing_teacher.rs'),
    fe: path.join(FE, 'composables/useTeacherChaoxingAnalytics.ts'),
    upstream: 'GET fycourse/…/getMyCourseJson + mooc1-api/…/backclazzdata + stat2/teach-data/*',
    note: 'ut=t 语义；teach-data 不需要 pEnc',
  },
];

/** 从 Rust 源码提取 json! 里的顶层键（引号后跟冒号）。 */
function extractBackendFields(file) {
  const text = fs.readFileSync(file, 'utf8');
  const keys = new Set();
  // 只扫 json!({ ... }) 块，避免把 struct 字段混进来
  // 1) json!({ "key": ... }) 字面量
  for (const block of text.matchAll(/json!\(\s*\{([\s\S]{0,4000}?)\}\s*\)/g)) {
    for (const m of block[1].matchAll(/"([a-zA-Z_][a-zA-Z0-9_]*)":/g)) {
      keys.add(m[1]);
    }
  }
  // 2) object.insert("key", ...) 动态插入的字段（如 markNumber / scheduleUrl）
  for (const m of text.matchAll(/insert\(\s*"([a-zA-Z_][a-zA-Z0-9_]*)"/g)) {
    keys.add(m[1]);
  }
  // 3) 白名单常量（如 failedCourses 的 ALLOWED 数组）
  for (const block of text.matchAll(/const ALLOWED[^=]*=\s*&\[([\s\S]{0,1500}?)\];/g)) {
    for (const m of block[1].matchAll(/"([a-zA-Z_][a-zA-Z0-9_]*)"/g)) {
      keys.add(m[1]);
    }
  }
  return [...keys].sort();
}

/** 从前端源码提取 `.field` 形式的引用（去掉常见内置属性）。 */
const NOISE = new Set([
  'value', 'length', 'map', 'filter', 'find', 'slice', 'trim', 'join', 'push', 'includes',
  'toFixed', 'replace', 'split', 'some', 'every', 'reduce', 'keys', 'values', 'entries',
  'then', 'catch', 'finally', 'toString', 'padStart', 'padEnd', 'startsWith', 'endsWith',
  'indexOf', 'sort', 'concat', 'flat', 'flatMap', 'at', 'test', 'exec', 'match',
]);
function extractFrontendFields(file) {
  const text = fs.readFileSync(file, 'utf8');
  const keys = new Set();
  // 只取「数据对象」的属性访问：item.xxx / row.xxx / record.xxx / entry.xxx /
  // payload.xxx / data.xxx / node.xxx / student.xxx / cls.xxx / cell.xxx
  const DATA_VARS = '(?:item|row|record|entry|payload|data|node|student|cls|cell|card|task|course|cellItem)';
  const re = new RegExp(`\\b${DATA_VARS}(?:\\?\\.|\\.)([a-zA-Z_][a-zA-Z0-9_]{2,})`, 'g');
  for (const m of text.matchAll(re)) {
    const name = m[1];
    if (!NOISE.has(name)) keys.add(name);
  }
  return [...keys].sort();
}

const lines = [];
lines.push('# 17 · 前后端字段对照表（goal-21 / T14）');
lines.push('');
lines.push('> **生成方式**：后端字段由脚本从 Rust 源码的 `json!({…})` 块提取（权威来源），');
lines.push('> 前端字段从 composable/View 的 `.field` 引用提取（已去噪）。');
lines.push('> 生成脚本：`tools/t14-field-contract.mjs`（可复跑）。');
lines.push('');
lines.push('## 汇总');
lines.push('');
lines.push('| 模块 | 上游接口 | 后端字段数 | 前端引用数 | 状态 |');
lines.push('| --- | --- | --- | --- | --- |');

const details = [];
for (const mod of MODULES) {
  if (!fs.existsSync(mod.be)) {
    lines.push(`| ${mod.title} | ${mod.upstream} | — | — | ⚠️ 后端文件缺失 |`);
    continue;
  }
  const beFields = extractBackendFields(mod.be);
  const feFields = fs.existsSync(mod.fe) ? extractFrontendFields(mod.fe) : [];
  // 前端引用了但后端没有的字段（真正的「对不上」）
  const feNotInBe = feFields.filter((f) => !beFields.includes(f));
  const suspicious = feNotInBe.filter((f) =>
    // 只关心看起来像业务字段的（含驼峰且长度>3），排除前端内部变量
    /^[a-z][a-zA-Z]{3,}$/.test(f)
  );
  const status = mod.key === 'roster' ? '⛔ 已禁用' : suspicious.length === 0 ? '✅' : `⚠️ ${suspicious.length} 个待核`;
  lines.push(`| ${mod.title} | \`${mod.upstream}\` | ${beFields.length} | ${feFields.length} | ${status} |`);

  details.push({ mod, beFields, feFields, suspicious });
}

lines.push('');
lines.push('## 逐模块明细');
lines.push('');
for (const { mod, beFields, feFields, suspicious } of details) {
  lines.push(`### ${mod.title}（\`${mod.key}\`）`);
  lines.push('');
  lines.push(`- **上游接口**：\`${mod.upstream}\``);
  lines.push(`- **说明**：${mod.note}`);
  lines.push(`- **后端返回字段**（${beFields.length}）：${beFields.map((f) => `\`${f}\``).join('、') || '（无 json! 块）'}`);
  if (suspicious.length) {
    lines.push(`- **前端引用但后端未返回**（${suspicious.length}，需人工确认是否误用）：${suspicious.map((f) => `\`${f}\``).join('、')}`);
  } else {
    lines.push('- **前端引用但后端未返回**：无 ✅');
  }
  lines.push('');
}

lines.push('---');
lines.push('');
lines.push('## 生成时间');
lines.push('');
lines.push(new Date().toISOString());

const out = path.join(ROOT, 'data/teacher-portal-recon-1120/17-field-contract.md');
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`写出: ${out}`);
console.log('');
console.log('=== 汇总 ===');
for (const { mod, beFields, suspicious } of details) {
  const flag = mod.key === 'roster' ? 'DISABLED' : suspicious.length === 0 ? 'OK' : `CHECK(${suspicious.length})`;
  console.log(`  ${mod.key.padEnd(20)} be=${String(beFields.length).padStart(3)}  ${flag}`);
}
