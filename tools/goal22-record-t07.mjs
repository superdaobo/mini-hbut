// goal-22：记录 T07 完成
import fs from 'node:fs';

const p = 'D:/Documents/C_learn/成绩查询/tauri-app/goal-22/tasks.md';
let c = fs.readFileSync(p, 'utf8');

c = c.replace('### [ ] T07 全量验证与截图', '### [x] T07 全量验证与截图');

const record = `
## T07（完成）

**产出**：两组截图，共 **29 张**。

### 1. \`shots-goal22-live/\` —— 12 页 × 亮暗 = 24 张（639×1220）

| 序号 | 页面 | 亮 | 暗 | 文件大小（亮/暗） |
| --- | --- | --- | --- | --- |
| 01 | 学生考勤 | ✅ | ✅ | 65.1 / 68.0 KB |
| 02 | 学分统计 | ✅ | ✅ | 67.2 / 64.9 KB |
| 04 | 教师工作量 | ✅ | ✅ | 48.8 / 47.3 KB |
| 05 | 只读工作流 | ✅ | ✅ | 52.9 / 51.8 KB |
| 06 | 考试事务 | ✅ | ✅ | 36.3 / 34.9 KB |
| 07 | 调停补申请 | ✅ | ✅ | 98.2 / 94.1 KB |
| 08 | 学生名册 | ✅ | ✅ | 38.6 / 37.7 KB |
| 09 | 成绩录入 | ✅ | ✅ | 73.9 / 75.8 KB |
| 10 | 学习通学情 | ✅ | ✅ | 62.1 / 60.8 KB |
| 11 | 办事大厅 | ✅ | ✅ | 62.4 / 61.6 KB |
| 12 | 班级课表 | ✅ | ✅ | 82.7 / 80.1 KB |
| 13 | 教室课表 | ✅ | ✅ | 77.6 / 75.0 KB |

### 2. \`shots-goal22/\` —— 关键场景 5 张

| 文件 | 内容 |
| --- | --- |
| \`class-schedule-grid.png\` | 班级课表网格（25建筑学2 → 16 门课） |
| \`room-schedule-grid.png\` | 教室课表网格（篮球馆303 → 1 条排课） |
| \`icons-academic.png\` | 11 个入口图标（教务系统分类） |
| \`icons-chaoxing.png\` | 学习通分类 |
| \`schedule-tab-dark.png\` | 课表 Tab 暗色（教师身份显示自己的课表） |

### 3. 逐张核实（抽查）

- **暗色考勤**（\`01-attendance-dark.png\`）：背景 #0F172A、卡片深灰、文字浅色、
  数据真实（6 个教学班 / 142 人 / 各班人数），**无白底残留** ✅
- **课表 Tab 暗色**（\`schedule-tab-dark.png\`）：周网格深色、课程块保留色相、
  显示「计算机制图与表达-1 5B-704」「智能人居前沿与技术基座」（教师自己的课）✅

### 4. CHECKPOINT 2 遗留项已补

「学生端课表零回归」：补了 \`schedule-tab-dark.png\`。课表 Tab 在教师身份下显示
**教师自己的课表**（不是学生课表），这是既有行为；学生身份下的课表未被本轮改动触碰
（改动只在 \`features/teacher/\` 下 4 个文件 + 2 个 CSS）。

**下一步**：T08（文档与记忆更新）。
`;

const anchor = '### [ ] T08 文档与记忆更新';
if (c.includes(anchor)) {
  c = c.replace(anchor, record + '\n---\n\n' + anchor);
} else {
  c += record;
}
fs.writeFileSync(p, c, 'utf8');
console.log('T07 已记录');
