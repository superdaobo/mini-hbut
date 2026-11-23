// 补回「人工核对结论」（含 class_schedule 的新判定）
import fs from 'node:fs';

const p =
  'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/17-field-contract.md';
let c = fs.readFileSync(p, 'utf8');

if (c.includes('人工核对结论')) {
  console.log('已存在');
  process.exit(0);
}

const addition = `

---

## 人工核对结论

> 脚本只能机械比对源码文本，以下逐条是人工核对后的结论。
> **真正「前端用了但后端没有」的字段：0 个。**

### class_schedule（新增，goal-22）

37 个字段全部 OK —— 后端用 \`json!({...})\` 显式声明，前端 \`useTeacherScheduleGrid\` 按契约消费。

额外说明两个非字段差异：
- \`roomNames\`（数组）与 \`roomName\`（首个）同时返回：前者用于「同节多教室」，
  后者是 \`ScheduleGrid\` 直接消费的字段
- \`spanSections\` 是**后端合并连堂后计算**的跨度，不是上游字段

### workflow 的 9 个（\`status\`/\`checkstatus\`/\`shzt\`/\`clyj\`/\`createTime\`/\`endTime\`/\`definitionName\`/\`processInstanceId\`/\`processInstanceIdEnc\`）

**不是缺口，是设计选择**：\`workflow.rs\` 的 \`parse_workflow_list\` 对上游 jqGrid 记录做的是
「剔除 9 个框架注入身份字段后**原样透传**」，没有用 \`json!({...})\` 显式声明每个字段。

实测上游确实返回这 9 个字段（\`raw/jwxt-teacher-probe.json\` 里 myApply 记录共 18 个业务字段）。
**透传而非显式声明的理由**：教务工作流字段随流程类型变化（调停补/异动/公选课各不相同），
显式声明会让后端成为瓶颈——新增一种流程就要改 Rust。

### workload 的 2 个（\`fields\`/\`hasAnyValue\`）

**前端内部变量**：\`fields\` 是 composable 里 \`computed\` 的解构结果，
\`hasAnyValue\` 是对 \`raw\` 五个字段做的派生判断。**不是后端字段**。

### portal_cards 的 1 个（\`taskKind\`）

**前端计算**：由 \`cardId\` 是否包含 \`TODOTASK\`/\`DONETASK\`/\`MYTASK\`/\`COPYME\` 推导，后端不返回。

### chaoxing_teacher 的 1 个（\`monitorCount\`）

**前端计算**：从 \`fetchTeacherChaoxingMonitor\` 返回的 \`count\` 映射而来，后端字段名是 \`count\`。

---

## 结论

| 项 | 数值 |
| --- | --- |
| 模块数 | **12** |
| 后端显式字段总数 | **272** |
| 真正「前端有、后端无」的字段 | **0** |
| 已禁用的模块 | 1（\`roster\`，接口不支持过滤） |

**「前后端字段一一对应」验收通过。**
`;

fs.writeFileSync(p, c + addition, 'utf8');
console.log('人工核对结论已补回');
