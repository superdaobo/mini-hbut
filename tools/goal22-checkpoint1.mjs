// goal-22：写入 CHECKPOINT 1 结果
import fs from 'node:fs';

const p = 'D:/Documents/C_learn/成绩查询/tauri-app/goal-22/tasks.md';
let c = fs.readFileSync(p, 'utf8');

const check = `## 🔍 CHECKPOINT 1（T01–T03 之后）

- [x] \`cargo test --lib teacher\` 全绿
- [x] \`cargo clippy --lib\` 教师模块零警告
- [x] 真实教师账号调通班级课表命令（返回 46 条）
- [x] 只读红线：新增路径全部在 allowlist，写型路径零命中

**检查结果**：

| 检查项 | 方法 | 结果 |
| --- | --- | --- |
| Rust 测试 | \`cargo test --lib teacher\` | **137 passed, 0 failed** ✅ |
| clippy | \`cargo clippy --lib\` | class_schedule / schedule_extra **零警告** ✅ |
| 授权清单 | \`--check\` | **290 条**（+2）✅ |
| 前端类型 | \`npm run typecheck\` | 零错误 ✅ |
| 只读红线 | 两个新路径均登记在 allowlist | ✅ |

**真实账号端到端验证（教师 20241130）**：

\`\`\`
teacher_schedule_lists_fetch({keyword:"25建筑学2"})
  → 命中「25建筑学2」，encodeId=WGEyQ00CC679…
teacher_class_schedule_fetch({encodeId, semester, campusId})
  → count=46
  → 首条 {courseName:"概率论与数理统计", teacherName:"蔡睿", roomName:"2-412",
           weekday:1, startSection:3, weekCount:12, credits:3, hours:48,
           courseType:"通识教育必修课", buildingName:"2号", roomType:"多媒体"}
\`\`\`

**HTML 剥离已验证生效**：\`teacherName\` 是「蔡睿」而不是 \`<a onclick="openJskb…">蔡睿</a>\`。

**本轮额外发现并修的 3 个问题**（都是接线时才暴露的）：

1. **班级搜索参数用错**：\`schedule_extra\` 原来用 jqGrid 的 \`query.bjmc||\`（无效，返 3315），
   实测裸 \`bjmc=\` 才有效（total=1）。已改。
2. **教室列表根本不支持服务端搜索**：\`jsmc=篮球馆303\` → total=0（被当精确匹配且不命中），
   \`query.jsmc||\` → 1741（无效）。已改为**不传 keyword**，教室搜索交给前端本地过滤。
3. **\`normalize_room\` 没透传 \`encodeId\`**：导致教室课表命令拿不到 id 直接报
   「缺少教室参数 encodeId」。已补 \`encodeId\` + \`semester\`。

**遗留**：教室课表的端到端验证因需重启 App（Rust 变更）推到 T04 一起做。

**结论**：后端两个接口就绪，可进入 T04（课表 Tab 改造）。
`;

// 替换原 CHECKPOINT 1 段（到 "**检查结果**：（待填）" 结束）
const startMark = '## 🔍 CHECKPOINT 1（T01–T03 之后）';
const endMark = '---\n\n## 阶段二：课表 Tab 改造';
const start = c.indexOf(startMark);
const end = c.indexOf(endMark);

if (start >= 0 && end > start) {
  c = c.slice(0, start) + check + '\n' + c.slice(end);
  fs.writeFileSync(p, c, 'utf8');
  console.log('CHECKPOINT 1 已写入');
} else {
  console.log('定位失败 start=', start, 'end=', end);
}
