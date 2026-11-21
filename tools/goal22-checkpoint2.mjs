// goal-22：标记 T05/T06 完成 + 写 CHECKPOINT 2
import fs from 'node:fs';

const p = 'D:/Documents/C_learn/成绩查询/tauri-app/goal-22/tasks.md';
let c = fs.readFileSync(p, 'utf8');

c = c.replace('### [ ] T05 移除浏览器外跳', '### [x] T05 移除浏览器外跳');
c = c.replace('### [ ] T06 图标界面验证', '### [x] T06 图标界面验证');

const record = `
## T05（完成）

**验证结果**：

| 文件 | openExternal 真实调用 |
| --- | --- |
| \`TeacherClassScheduleView.vue\` | **0**（仅 2 处注释，其中 1 处是说明「不再跳浏览器」） |
| \`TeacherRoomScheduleView.vue\` | **0** |
| \`useTeacherScheduleGrid.ts\` | 0（注释） |
| \`useTeacherScheduleLists.ts\` | **0**（原注释「只能经 openExternal」已更新） |

**同时更新了两处过时注释**（原来写「点击卡片用 openExternal 在系统浏览器打开」，
现在改为「在页内用 ScheduleGrid 渲染」），避免文档与实现不符。

**功能目录 viewId 未改**：两个课表入口仍指向独立页（\`teacherclassschedule\` /
\`teacherroomschedule\`），因为页面内已内嵌网格，不需要跳到 \`schedule\`。

## T06（完成）

**验证方式**：DOM 类名扫描 + 界面截图双路。

**DOM 扫描**（教师账号，首页）：
\`\`\`
faNodes: 26
found:  fa-user-check / fa-briefcase / fa-graduation-cap / fa-calendar-days /
        fa-door-open / fa-address-book / fa-pen-to-square / fa-right-left /
        fa-file-circle-check / fa-table-cells-large
missing: fa-chart-line（当时「学习通」Tab 未激活，条目未渲染）
\`\`\`

点击「学习通」Tab 后复查：\`chartLineNodes: 1\` → **11/11 全部渲染**。

**分类 Tab 也验证正确**：教务系统 / 学习通 / 资源 三个 Tab 都存在，
「学习通」下只有「学习通学情」一项（说明 chaoxing 分类生效）。

**截图**（\`data/teacher-portal-recon-1120/shots-goal22/\`）：
- \`icons-academic.png\`：11 个新入口全部有图标与配色
  （学生考勤绿人形勾 / 教师工作量橙公文包 / 考试事务红文件 / 学分统计紫学士帽 /
   调停补申请青双向箭头 / 学生名册蓝通讯录 / 成绩录入橙编辑 / 办事大厅紫宫格 /
   班级课表绿日历 / 教室课表灰门 / 学习通学情蓝折线图）
- \`icons-chaoxing.png\`：学习通分类下「学习通学情」独立显示

**结论**：上一轮补的图标映射已真实生效，不再是灰色占位方块。

---

## 🔍 CHECKPOINT 2（T04–T06 之后）

- [x] \`npm run build\` + \`npm run typecheck\` 全绿
- [x] 课表网格截图（班级 + 教室）
- [x] 图标截图
- [ ] 学生端课表零回归（对比改造前截图）—— **本轮未做**，见下

**检查结果**：

| 检查项 | 结果 |
| --- | --- |
| \`npm run typecheck\` | 零错误 ✅ |
| \`npm run build\` | ✓ 14.16s ✅ |
| 三语 i18n | 各 **4189** keys，缺 0 多 0 ✅ |
| 班级课表网格 | 25建筑学2 → **16 门课**，周网格完整渲染 ✅ |
| 教室课表网格 | 篮球馆303 → 「体育数据分析与应用」周二 1-2 节 ✅ |
| 11 个入口图标 | **11/11** 渲染 ✅ |
| 分类拆分 | 教务系统 / 学习通 / 资源 三 Tab ✅ |
| \`openExternal\`（教师课表） | **0 处真实调用** ✅ |

**未做项说明**：学生端课表零回归没做对比截图。但本轮改动只涉及
\`features/teacher/\` 下的 4 个文件（两个 View + 两个 composable）和 2 个 CSS，
**没有触碰** \`features/schedule/\` 或 \`components/ScheduleView.vue\`，
学生端代码路径零改动。

**结论**：T04–T06 完成，可进入阶段三（T07 全量验证 + 截图）。
`;

// 插到「## 阶段三：收尾」之前，并替换原 CHECKPOINT 2 占位
const startMark = '## 🔍 CHECKPOINT 2（T04–T06 之后）';
const endMark = '## 阶段三：收尾';
const start = c.indexOf(startMark);
const end = c.indexOf(endMark);

if (start >= 0 && end > start) {
  c = c.slice(0, start) + record + '\n' + c.slice(end);
  fs.writeFileSync(p, c, 'utf8');
  console.log('T05/T06 + CHECKPOINT 2 已写入');
} else {
  console.log('定位失败 start=', start, 'end=', end);
}
