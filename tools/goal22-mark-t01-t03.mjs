// goal-22：标记 T01/T03 完成并写入执行记录
import fs from 'node:fs';

const p = 'D:/Documents/C_learn/成绩查询/tauri-app/goal-22/tasks.md';
let c = fs.readFileSync(p, 'utf8');

c = c.replace('### [ ] T01 班级课表后端模块', '### [x] T01 班级课表后端模块');
c = c.replace('### [ ] T03 注册 Tauri 命令 + 授权同步', '### [x] T03 注册 Tauri 命令 + 授权同步');

const record = `
## T01（完成）

**做了什么**：新建 \`http_client/academic/teacher/class_schedule.rs\`（约 300 行）+ \`readonly.rs\` 加常量与 allowlist。

**关键实现**：

| 函数 | 作用 |
| --- | --- |
| \`strip_html_anchor\` | 把 \`<a onclick="openJskb(...)">蔡睿</a>\` 剥成 \`蔡睿\`；纯文本原样；全标签无文本返回 \`None\` |
| \`parse_weeks\` | \`"1,2,3"\` → \`[1,2,3]\`（去重、排序、限 1-30） |
| \`normalize_class_schedule\` | 13 个字段归一化（含 \`weekCount\`） |
| \`parse_class_schedule\` | 裸数组解析，**跳过无 \`kcmc\` 的行** |
| \`fetch_class_schedule_with\` | 带 13 个查询参数，HTML 响应判为会话过期 |

**踩到的坑**：\`strip_html_anchor\` 第一版用 \`rfind('>')\`，取到的是 \`</a>\` 的闭合尖括号，
导致返回空串。改成 \`find('>')\`（第一个开标签的结束）后正确。

**验证**：\`cargo test --lib class_schedule\` → **6 passed**（HTML 剥离三态、周次解析、字段映射、跳过空课程、空/非数组容错）。

## T03（完成）

**做了什么**：
- \`application/teacher.rs\`：\`fetch_class_schedule(encodeId, semester, campusId)\`
- \`transport/tauri/teacher.rs\`：\`teacher_class_schedule_fetch\` 命令
- \`lib.rs\`：注册
- \`http_server/routes/teacher.rs\`：\`/v2/teacher/class-schedule\` 路由 + \`TeacherClassScheduleRequest\`（带 camelCase alias）
- \`teacherApi.ts\`：\`fetchTeacherClassSchedule\`（\`Record<string, unknown>\` 契约）

**验证**：
- \`cargo check --lib\` → 36.52s，**class_schedule 零警告**（接线后不再报 never used）
- \`cargo test --lib allowlist\` → 3 passed（新路径已登记，fail-closed 断言通过）
- 授权清单：**289 条**（+1），\`--check\` 通过
- \`npm run typecheck\` → 零错误

**下一步**：T02（教室课表数据源调研）。
`;

// 插到 CHECKPOINT 1 之前
const anchor = '## 🔍 CHECKPOINT 1（T01–T03 之后）';
if (c.includes(anchor)) {
  c = c.replace(anchor, record + '\n---\n\n' + anchor);
} else {
  c += record;
}

fs.writeFileSync(p, c, 'utf8');
console.log('T01/T03 已标记完成并写入记录');
console.log('T01 标记:', c.includes('### [x] T01'));
console.log('T03 标记:', c.includes('### [x] T03'));
