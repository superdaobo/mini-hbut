// goal-22：标记 T02 完成并写入执行记录
import fs from 'node:fs';

const p = 'D:/Documents/C_learn/成绩查询/tauri-app/goal-22/tasks.md';
let c = fs.readFileSync(p, 'utf8');

c = c.replace('### [ ] T02 教室课表数据源调研', '### [x] T02 教室课表数据源调研');

const record = `
## T02（完成）

**结论：教室课表有 JSON 接口**，与班级课表同族：

\`\`\`text
GET /admin/pkgl/pkglcroomkb/sdpkkbList?xnxq=&id=<教室 encodeId>&xqdm=&…&schoolCode=
→ 200，裸数组（「篮球馆303」实测 2 条）
\`\`\`

与班级课表差异：路径前缀不同、末位参数是 \`schoolCode\`（班级版是 \`kcxz\`）、
多出 \`jsmc\`/\`bjdm\`/\`jxbrs\`/\`djs\`/\`cxrs\` 等字段。**解析逻辑可完全复用**。

**调研过程**（三步，都有实测证据）：
1. 抓 \`pkglcroomkb\` 页面 → 只有 \`ajaxListCustom\`（教室列表），没有课表数据
2. 找页面函数 → 发现 \`ckcroomkb\`（跳转到 \`/admin/pkgl/pkglcroomkb/ckcroomkb?id=&xnxq=&xqdm=\`）
3. 抓 \`ckcroomkb\` 页面 → 内部 AJAX 里有 \`/admin/pkgl/pkglcroomkb/sdpkkbList\`

**一个重要的判读**：大部分教室返回 \`[]\`（如「生工楼1-110」），这是**正常的**——
该教室本学期没排课。批量试 10 间后第 1 间就有 2 条，证明接口本身可用。

**产出**：
- \`data/teacher-portal-recon-1120/18-room-schedule-probe.md\`（完整调研记录 + 复现命令）
- \`class_schedule.rs\` 新增 \`fetch_room_schedule_with\`，并把班级/教室的重复逻辑抽成
  \`fetch_schedule_common(client, path, tail_param, label, …)\`
- \`normalize_class_schedule\` 的 \`courseName\` 改为**也剥离 HTML**（教室版的 \`kcmc\` 是
  \`<a onclick="openKckb">课程名</a>\`，班级版是纯文本；统一剥离对纯文本无副作用）

**接线**：\`fetch_room_schedule\` 服务方法 + \`teacher_room_schedule_fetch\` 命令 +
\`lib.rs\` + \`/v2/teacher/room-schedule\` 路由 + \`fetchTeacherRoomSchedule\` 前端 API。

**验证**：
- \`cargo test --lib class_schedule\` → 6 passed
- \`cargo check --lib\` → 2m14s，零错误
- \`cargo clippy --lib\` → class_schedule 零警告
- 授权清单 **290 条**（+1），\`--check\` 通过
- \`npm run typecheck\` → 零错误

**下一步**：CHECKPOINT 1（T01–T03 全量检查）。
`;

const anchor = '## 🔍 CHECKPOINT 1（T01–T03 之后）';
if (c.includes(anchor)) {
  c = c.replace(anchor, record + '\n---\n\n' + anchor);
} else {
  c += record;
}

fs.writeFileSync(p, c, 'utf8');
console.log('T02 已标记完成并写入记录');
