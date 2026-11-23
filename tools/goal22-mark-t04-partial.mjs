// goal-22：诚实标注 T04 的实际完成情况（独立页内嵌 ≠ Tab 三档切换）
import fs from 'node:fs';

const p = 'D:/Documents/C_learn/成绩查询/tauri-app/goal-22/tasks.md';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(
  '### [ ] T04 课表 Tab 三档切换',
  '### [~] T04 课表 Tab 三档切换（**部分完成**：做了独立页内嵌，未做 Tab 内三档）',
);

const note = `
## T04 实际完成情况（诚实标注）

**任务原标题**：课表 Tab 三档切换（学生 / 班级 / 教室）

**实际做法**：在 \`TeacherClassScheduleView\` / \`TeacherRoomScheduleView\` **两个独立页**
内嵌 \`ScheduleGrid\`，选中班级/教室后页内渲染。

**与要求的差距**：

| 要求 | 实际 | 差距 |
| --- | --- | --- |
| 课表 Tab 内加「学生 / 班级 / 教室」三档 | 班级/教室是独立页（从首页入口进） | ❌ 未在课表 Tab 内 |
| 复用网格渲染 | ✅ 三处共用同一个 \`ScheduleGrid\` 组件 | ✅ |
| 零浏览器外跳 | ✅ \`openExternal\` 0 处 | ✅ |

**为什么没做 Tab 内三档**：

\`components/ScheduleView.vue\` 是学生端课表核心（2000+ 行，含周切换、冲突合并、
事件/考试叠加层、自定义课程、Widget 深链接）。在其中插入教师三档需要：
1. 教师身份守卫（学生端零回归）
2. 独立的班级/教室选择器状态
3. 与现有 \`grid.getCoursesForDay\` 的数据源切换

风险与工作量都显著高于独立页方案，且当前方案在功能上已满足「在应用内看班级/教室课表」
这个核心诉求（用户原话：「这个必须是在应用内完成所有操作的」）。

**如果要补做**（下一轮或后续）：
在 \`ScheduleView.vue\` 顶部加教师专属 Tab，数据源切到 \`useTeacherScheduleGrid\`，
默认档保持「学生」（教师身份下即「我的课表」），严格用 \`isTeacher\` 守卫。
`;

const anchor = '---\n\n## 🔍 CHECKPOINT 1（T01–T03 之后）';
if (c.includes(anchor)) {
  c = c.replace(anchor, note + '\n' + anchor);
} else {
  c += note;
}
fs.writeFileSync(p, c, 'utf8');
console.log('T04 已标注为部分完成');
