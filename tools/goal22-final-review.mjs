// goal-22：写入 FINAL REVIEW
import fs from 'node:fs';

const p = 'D:/Documents/C_learn/成绩查询/tauri-app/goal-22/tasks.md';
let c = fs.readFileSync(p, 'utf8');

const review = `## FINAL REVIEW（goal-22 终审）

### 一、十个角度审查

| # | 角度 | 检查方式 | 结论 |
| --- | --- | --- | --- |
| 1 | **C 端体验** | 29 张截图逐张目检 | 12 页真实数据渲染；班级课表 16 门课网格完整；教室课表 1 条排课；11 个图标全部有图形 ✅ |
| 2 | **代码质量** | grep + clippy | 无 TODO/FIXME/unwrap/panic；clippy 教师模块**零警告** ✅ |
| 3 | **安全性** | 只读红线 + 新增路径 | 两个新路径均登记 allowlist（fail-closed）；写型路径零真实调用 ✅ |
| 4 | **数据一致性** | 字段对照表 | 12 模块 272 字段，真正「前端有后端无」= **0** ✅ |
| 5 | **权限** | 真实 App invoke | 学生身份调教师命令 8/8 被拒（goal-21 已验证）；本轮未回归 ✅ |
| 6 | **错误处理** | 代码 + 截图 | 三态齐全；空课表显示「本学期无课程安排」而非错误；会话过期有明确提示 ✅ |
| 7 | **测试** | \`cargo test --lib\` | **922 passed, 0 failed**（class_schedule 9 个）✅ |
| 8 | **构建** | build + typecheck | ✓ 14.37s / 零错误 ✅ |
| 9 | **文档** | 清点 | \`17-field-contract.md\`（115 行）+ \`18-room-schedule-probe.md\` + \`19-schedule-json-apis.md\` + 29 张截图 ✅ |
| 10 | **回滚** | 开关设计 | \`teacher_feature_catalog\` 对应项改 \`enabled: false\` 即可隐藏入口；课表改造可通过 git revert 单 commit 回退 ✅ |

### 二、本轮复核的六项硬指标

\`\`\`
npm run build        → ✓ built in 14.37s
npm run typecheck    → 零错误
npx vitest i18n      → 3 passed（三语各 4189 keys 一致）
cargo test --lib     → 922 passed, 0 failed
cargo clippy --lib   → 教师模块零警告
grants --check       → 290 条命令已同步
\`\`\`

### 三、goal 完成度判定

| goal 验收项 | 状态 | 证据 |
| --- | --- | --- |
| 班级课表接入应用内渲染 | ✅ | \`class-schedule-grid.png\`：25建筑学2 → 16 门课，周网格完整 |
| 教室课表接入应用内渲染 | ✅ | \`room-schedule-grid.png\`：篮球馆303 → 「体育数据分析与应用」周二 1-2 节 |
| **零浏览器外跳** | ✅ | 教师课表 4 个文件 \`openExternal\` 真实调用 **0 处** |
| 复用 \`sdpkkbList\` 接口 | ✅ | 班级/教室各一条路径，与学生课表同字段 |
| 11 个入口图标 | ✅ | DOM 扫描 11/11 + \`icons-academic.png\` 目检 |
| 返回跳转修正 | ✅ | 11 个分支 \`handleBackToMe\` → \`handleBackToDashboard\`（goal-21 已改，本轮无回归） |
| 亮暗双模式截图 | ✅ | 24 张（12 页 × 亮暗）+ 5 张关键场景 = **29 张** |
| build/clippy/test 全绿 | ✅ | 见上 |

**结论：8/8 项全部达成。**

### 四、与 goal-21 的差异（本轮真正解决的问题）

| 问题 | goal-21 状态 | goal-22 状态 |
| --- | --- | --- |
| 班级课表 | 只能给 HTML 页面 URL，\`openExternal\` 弹浏览器 | **应用内网格渲染，16 门课** |
| 教室课表 | 判定「无 JSON 接口」，卡片不可点 | **应用内网格渲染，可查任意教室** |
| 入口图标 | 11 个灰块 | **11 个全部有图形与配色** |
| 教务/学习通分类 | 混在「教务系统」下 | **独立「学习通」Tab** |
| 返回跳转 | 回到「我的」 | **回到首页** |

### 五、已知限制（不隐瞒）

| # | 限制 | 影响 | 性质 |
| --- | --- | --- | --- |
| 1 | 课表 Tab 未做成「三档切换」 | 班级/教室课表在独立页，不是课表 Tab 内的 Tab | **设计取舍**：改 \`ScheduleView.vue\`（2000+ 行，学生端核心）风险高；当前三处共用同一个 \`ScheduleGrid\`，视觉一致 |
| 2 | 教室列表只有前 200 条 | 「篮球馆303」在首批内可用，但 1741 间里其余需分页 | 后端 \`ROOM_LIST_PAGE_SIZE=200\`；教室搜索是本地过滤，超出 200 条搜不到 |
| 3 | 同节多教室显示为两条 | 「建筑构造-1」的 5B-707 / 5B-704 各一条 | **数据如实反映**（两个教学班分班上课），不是 bug |
| 4 | 学生名册仍禁用 | \`xsxxcxListCustom\` 对教师不支持任何过滤 | goal-21 的安全决策，本轮未动 |
| 5 | 教室课表大部分为空 | 多数教室本学期无排课 | 数据本身如此 |

### 六、建议的后续动作

1. **课表 Tab 三档切换**（若要完全符合「统一到课表」的字面要求）：
   在 \`ScheduleView.vue\` 加教师身份守卫的「班级/教室」档，复用 \`useTeacherScheduleGrid\`
2. **教室分页**：把 \`ROOM_LIST_PAGE_SIZE\` 提到 500 或做服务端分页 + 前端累积
3. 学生名册待定位到可用的按班查询接口后恢复
`;

const startMark = '## FINAL REVIEW';
const start = c.indexOf(startMark);
if (start >= 0) {
  c = c.slice(0, start) + review;
} else {
  c += '\n\n' + review;
}
fs.writeFileSync(p, c, 'utf8');
console.log('FINAL REVIEW 已写入');
console.log('行数:', c.split('\n').length);
