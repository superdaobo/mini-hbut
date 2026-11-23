// goal-22：标记 T08 完成
import fs from 'node:fs';

const p = 'D:/Documents/C_learn/成绩查询/tauri-app/goal-22/tasks.md';
let c = fs.readFileSync(p, 'utf8');

c = c.replace('### [ ] T08 文档与记忆更新', '### [x] T08 文档与记忆更新');

const record = `
## T08（完成）

**做了什么**：

### 1. 字段对照表补课表模块

\`tools/t14-field-contract.mjs\` 加 \`class_schedule\` 模块后重新生成：

| 模块 | 后端字段数 | 状态 |
| --- | --- | --- |
| class_schedule（新增） | **37** | ✅ OK |

脚本重新生成会覆盖「人工核对结论」，已单独补回并新增 \`class_schedule\` 的判定说明
（\`roomNames\` 数组 vs \`roomName\` 首项、\`spanSections\` 是后端合并后计算值）。

最终：**12 个模块 / 272 个后端字段 / 真正「前端有后端无」= 0**。

### 2. 新增课表接口文档

\`data/teacher-portal-recon-1120/19-schedule-json-apis.md\`，内容：
- 三处 \`sdpkkbList\` 路径（学生 / 班级 / 教室）与字段
- 怎么找到的（读页面源码里的 AJAX，而不是被「服务端渲染 HTML」误导）
- **7 条踩坑清单**（连堂合并、多教室不合并、HTML 剥离的 rfind 坑、
  \`bjmc\` 裸参数有效、教室不支持服务端搜索、\`encodeId\` 透传、空数组是正常结果）
- 前端课程对象契约与映射表
- 复现命令

### 3. 记忆已保存

\`minihbut-class-room-schedule-json-apis\`（reference）—— 把接口路径、7 个坑、
映射关系和实现落点一次性记下，下次不用重挖。

**验证**：文档 115 行（含人工核对结论）；memory 保存成功。
`;

const anchor = '## 🔍 FINAL REVIEW';
if (c.includes(anchor)) {
  c = c.replace(anchor, record + '\n---\n\n' + anchor);
} else {
  c += record;
}
fs.writeFileSync(p, c, 'utf8');
console.log('T08 已记录');
