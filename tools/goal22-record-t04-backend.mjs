// goal-22：记录 T04 后端部分（连堂合并）
import fs from 'node:fs';

const p = 'D:/Documents/C_learn/成绩查询/tauri-app/goal-22/tasks.md';
let c = fs.readFileSync(p, 'utf8');

const record = `
## T04（进行中 · 后端部分完成）

### 连堂合并（本轮完成）

**为什么需要**：实测上游把**每一节**单独返回一行：
- 「概率论与数理统计」周一 → \`djc=3\` 和 \`djc=4\` 两条
- 「建筑构造-1」周一 → \`djc=5,6,7,8\` 四条，**而且每节还有两个教室**
  （\`5B-707\` / \`5B-704\`）

直接渲染会得到一堆单节小卡片。

**实现**：\`merge_consecutive\` 按 \`课程名 + 星期 + 周次 + 教学班号\` 分组，
取最小节次为起点、\`max-min+1\` 为跨度（\`spanSections\`），同节多教室去重进 \`roomNames\`。

**实测效果（教师账号，25建筑学2）**：

\`\`\`
合并前：46 条
合并后：16 条

周一：
  概率论与数理统计  startSection=3  span=2  rooms=["2-412"]
  建筑构造-1        startSection=5  span=4  rooms=["5B-707"]
  建筑构造-1        startSection=5  span=4  rooms=["5B-704"]
\`\`\`

**注意**：建筑构造仍是两条 —— 因为它们的 \`jxbbh\`（教学班号）不同，
是两个教学班（分班上课），**不该合并**。数据如实反映，前端会按冲突处理渲染。

**新增单测（+3，共 9 个）**：
- \`merge_consecutive_collapses_multi_section_course\`：3、4 两节 → period=3 span=2
- \`merge_consecutive_collects_multiple_rooms\`：同节两教室 → roomNames 去重成 2 项
- \`merge_consecutive_keeps_different_weeks_separate\`：周次不同不合并

**验证**：\`cargo test --lib class_schedule\` → **9 passed**；\`cargo clippy\` → 零警告。

### 剩余（下轮）

- 课表 Tab 三档切换（学生 / 班级 / 教室）
- 班级/教室课表用 \`ScheduleGrid\` 渲染（\`getCoursesForDay\` 返回归一化课程）
- 移除 \`openExternal\` 外跳

**数据结构已确认**（\`features/schedule/utils/course.ts\` 的 \`normalizeCustomCourse\`）：

\`\`\`ts
{ id, name, teacher, room, room_code, building,
  weekday(1-7), period(1-11), djs(跨度), weeks[], weeks_text,
  credit, class_name, semester, source_id }
\`\`\`

映射：\`courseName→name\`、\`teacherName→teacher\`、\`roomName→room\`、
\`buildingName→building\`、\`startSection→period\`、\`spanSections→djs\`、\`weekText→weeks_text\`。
`;

const anchor = '## 🔍 CHECKPOINT 2（T04–T06 之后）';
if (c.includes(anchor)) {
  c = c.replace(anchor, record + '\n---\n\n' + anchor);
} else {
  c += record;
}
fs.writeFileSync(p, c, 'utf8');
console.log('T04 后端部分已记录');
