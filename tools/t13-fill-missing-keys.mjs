// goal-21 / T13 补全：动态拼接 key + 功能目录 nameKey（43 个 × 3 语言）
// 插入到 zh-CN.ts / en.ts / ja.ts 的末尾 `  }` 之前。
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'D:/wt/teacher-portal-probe-1120/apps/client/src/utils/i18n/messages';

/** [key, zh, en, ja] */
const ENTRIES = [
  // ── 门户：错误提示 + 4 张任务卡（代码用 `teacher.portal.task.${kind}` 拼接）──
  ['teacher.portal.error.sessionHint', '网关会话可能已过期，重新登录后可查看', 'Session may have expired — sign in again to view', 'セッションの有効期限が切れた可能性があります。再ログイン後に表示できます'],
  ['teacher.portal.task.todo', '待办任务', 'To-do', '未処理'],
  ['teacher.portal.task.done', '已办任务', 'Completed', '処理済み'],
  ['teacher.portal.task.mine', '我的任务', 'My tasks', '自分のタスク'],
  ['teacher.portal.task.copy', '抄送我的', 'CC to me', '自分へのCC'],

  // ── 工作流：分段标签 + 空态（代码用 `teacher.workflow.tab.${tab}` 拼接）──
  ['teacher.workflow.tab.apply', '我的申请', 'My requests', '自分の申請'],
  ['teacher.workflow.tab.todo', '我的待办', 'My to-dos', '自分の未処理'],
  ['teacher.workflow.tab.handled', '我的经办', 'My handled', '自分の処理済み'],
  ['teacher.workflow.empty.apply', '还没有提交过申请', 'No requests yet', 'まだ申請していません'],
  ['teacher.workflow.empty.todo', '暂无待办事项', 'No to-dos', '未処理はありません'],
  ['teacher.workflow.empty.handled', '暂无经办事项', 'Nothing handled yet', '処理済みはありません'],

  // ── 考试事务：缓考明细字段标签（8）──
  ['teacher.examAffairs.deferred.field.college', '开课院系', 'Offering dept.', '開講学部'],
  ['teacher.examAffairs.deferred.field.applyCollege', '申请院系', 'Applying dept.', '申請学部'],
  ['teacher.examAffairs.deferred.field.teacher', '任课教师', 'Teacher', '担当教員'],
  ['teacher.examAffairs.deferred.field.recorder', '成绩录入教师', 'Grade recorder', '成績入力教員'],
  ['teacher.examAffairs.deferred.field.startTime', '开始时间', 'Start', '開始時刻'],
  ['teacher.examAffairs.deferred.field.endTime', '结束时间', 'End', '終了時刻'],
  ['teacher.examAffairs.deferred.field.reason', '缓考原因', 'Reason', '追試理由'],
  ['teacher.examAffairs.deferred.field.limit', '修读限制', 'Enrolment limit', '履修制限'],

  // ── 考试事务：试卷明细字段标签（7）──
  ['teacher.examAffairs.papers.field.courseCode', '课程编号', 'Course code', '科目コード'],
  ['teacher.examAffairs.papers.field.paperNo', '试卷编号', 'Paper no.', '問題用紙番号'],
  ['teacher.examAffairs.papers.field.teacher', '任课教师', 'Teacher', '担当教員'],
  ['teacher.examAffairs.papers.field.class', '上课班级', 'Class', '授業クラス'],
  ['teacher.examAffairs.papers.field.total', '总人数', 'Total', '合計人数'],
  ['teacher.examAffairs.papers.field.time', '考试时长', 'Duration', '試験時間'],
  ['teacher.examAffairs.papers.field.owner', '负责人', 'Owner', '責任者'],

  // ── 考试事务：评教明细字段标签（6）──
  ['teacher.examAffairs.eval.field.class', '教学班', 'Class', 'クラス'],
  ['teacher.examAffairs.eval.field.time', '评教时间', 'Time', '評価時刻'],
  ['teacher.examAffairs.eval.field.dept', '部门', 'Department', '部門'],
  ['teacher.examAffairs.eval.field.college', '院系', 'College', '学部'],
  ['teacher.examAffairs.eval.field.place', '上课地点', 'Location', '場所'],
  ['teacher.examAffairs.eval.field.note', '备注', 'Note', '備考'],

  // ── 教师首页功能目录 nameKey（11，teacher_feature_catalog.ts 引用）──
  ['teacher.home.item.attendance', '学生考勤', 'Attendance', '学生出席'],
  ['teacher.home.item.workload', '教师工作量', 'Workload', '教員工作量'],
  ['teacher.home.item.examAffairs', '考试事务', 'Exam affairs', '試験事務'],
  ['teacher.home.item.credits', '学分统计', 'Credits', '単位統計'],
  ['teacher.home.item.adjustment', '调停补申请', 'Schedule change', '補講申請'],
  ['teacher.home.item.roster', '学生名册', 'Student roster', '学生名簿'],
  ['teacher.home.item.gradeEntry', '成绩录入', 'Grade entry', '成績入力'],
  ['teacher.home.item.chaoxingAnalytics', '学习通学情', 'Chaoxing analytics', '学習状況'],
  ['teacher.home.item.portal', '办事大厅', 'Service hall', 'サービス窓口'],
  ['teacher.home.item.classSchedule', '班级课表', 'Class schedule', 'クラス時間割'],
  ['teacher.home.item.roomSchedule', '教室课表', 'Room schedule', '教室時間割'],
];

const FILES = [
  ['zh-CN.ts', 1],
  ['en.ts', 2],
  ['ja.ts', 3],
];

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

for (const [file, index] of FILES) {
  const full = path.join(DIR, file);
  let text = fs.readFileSync(full, 'utf8');

  // 只补字典里还没有的 key（幂等，可重复执行）
  const missing = ENTRIES.filter(([key]) => !text.includes(`'${key}':`));
  if (missing.length === 0) {
    console.log(`${file}: 无需补充（全部已存在）`);
    continue;
  }

  const block = missing
    .map(([key, ...langs]) => `    '${key}': '${esc(langs[index - 1])}',`)
    .join('\n');

  // 找到最后一个 `  }`（对象收尾），在它之前插入
  const tail = /\r?\n\}\r?\n?$/.exec(text);
  if (!tail) { console.error(JSON.stringify(text.slice(-40)));
    throw new Error(`${file}: 找不到对象收尾 '  }'`);
  }
  const insertAt = tail.index;
  text = `${text.slice(0, insertAt)}\n\n    // goal-21 / T13：动态拼接 key 与功能目录 nameKey\n${block}${text.slice(insertAt)}`;
  fs.writeFileSync(full, text, 'utf8');
  console.log(`${file}: 新增 ${missing.length} 条`);
}

console.log('\n=== 校验：三语 key 集合是否一致 ===');
const keySets = FILES.map(([file]) => {
  const text = fs.readFileSync(path.join(DIR, file), 'utf8');
  const keys = new Set();
  for (const m of text.matchAll(/^\s*'([a-zA-Z0-9_.]+)':/gm)) keys.add(m[1]);
  return { file, keys };
});
const [base, ...rest] = keySets;
console.log(`${base.file}: ${base.keys.size} keys`);
for (const other of rest) {
  const missingInOther = [...base.keys].filter((k) => !other.keys.has(k));
  const extraInOther = [...other.keys].filter((k) => !base.keys.has(k));
  console.log(`${other.file}: ${other.keys.size} keys | 缺 ${missingInOther.length} | 多 ${extraInOther.length}`);
  if (missingInOther.length) console.log('   缺:', missingInOther.slice(0, 5));
  if (extraInOther.length) console.log('   多:', extraInOther.slice(0, 5));
}
