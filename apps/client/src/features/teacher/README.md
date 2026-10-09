# `features/teacher` — 教师门户 V2 业务边界（契约文档）

> Epic [#1018](https://github.com/superdaobo/mini-hbut/issues/1018) / E0 [#1019](https://github.com/superdaobo/mini-hbut/issues/1019)
> 上游架构：`data/plan-teacher-portal-v2.md`；并行执行：`data/plan-teacher-portal-v2-execution.md`
> 接口事实源：`data/teacher-api-recon/00~08`（**07 是写型接口禁调红线**）

本目录是教师业务的**唯一前端边界**。学生业务一律留在原学生模块；教师业务**只允许**在本目录内新增文件。

---

## 1. 目录职责

| 路径 | 职责 | 负责人 |
| --- | --- | --- |
| `types.ts` | **冻结契约**：教师领域类型 + 统一错误模型 + 加载状态 | E0（只增不改语义） |
| `api/teacherApi.ts` | **冻结契约**：双通道只读适配器（Tauri invoke / Web bridge） | E0 |
| `utils/normalizeTeacherData.ts` | HTML 清洗、字段标准化、稳定去重键 | E0（可追加纯函数） |
| `utils/teacher_scope.ts` | 缓存 / 提醒作用域键 `teacher:{accountId}:{semester}` | E0 |
| `components/TeacherPlaceholder.vue` | 未开放功能的统一「建设中」空态（**不发网络请求**） | E0 |
| `views/TeacherProfileView.vue` | 教师个人资料 | E2 #1022 |
| `views/TeacherTeachingView.vue` | 我的教学（教学任务 / 教学班） | E5 #1025 |
| `views/TeacherExamsView.vue` | 考试与监考 | E6 #1026 |
| `views/TeacherNotificationView.vue` | 教师通知（只读） | E3 #1023 |
| `views/TeacherWorkflowView.vue` | 只读工作流（本轮延期） | E7 #1027 |
| `composables/` | 各域组合函数（E1–E6 各自新增） | E1–E6 |
| `__tests__/` | 脱敏 fixture 与契约测试 | 各 Agent |

**硬规则**

- 除 E0 / 整合负责人外，**不得修改公共注册文件**（`viewRegistry.ts`、`App.vue`、`app_navigation.ts`、`role_capabilities.*`、`lib.rs`、各 `mod.rs`、三语字典）。
- **只读**：绝不调用写型 / 产物型接口（对照 `data/teacher-api-recon/07-write-endpoints-denylist.md`）。
- 教师新功能**默认关闭**（`teacher_feature_catalog.ts` 的 `flagKey` 默认 `false`），不能只靠隐藏图标承担访问控制。

---

## 2. 视图 id（已预注册，冻结）

| 视图 id | 组件 | 归属 |
| --- | --- | --- |
| `teacherprofile` | `views/TeacherProfileView.vue` | E2 |
| `teacherteaching` | `views/TeacherTeachingView.vue` | E5 |
| `teacherexams` | `views/TeacherExamsView.vue` | E6 |
| `teachernotifications` | `views/TeacherNotificationView.vue` | E3 |
| `teacherworkflow` | `views/TeacherWorkflowView.vue` | E7（延期） |

注册点（E0 已一次改到位，**后续 Agent 不要动**）：

- `src/app/viewRegistry.ts` → `VIEW_COMPONENTS` / `VIEW_PREFETCHERS`（`defineAsyncComponent` 懒加载）
- `src/App.vue` → 视图 `v-if` 分支（通知 Tab 在教师身份下渲染 `TeacherNotificationView`）
- `src/navigation/app_navigation.ts` → `HIERARCHICAL_PARENT_VIEW_MAP`（返回层级 = `me`）

---

## 3. 冻结契约：`api/teacherApi.ts`

所有函数返回 `Promise<TeacherLoadState<T>>`，**不抛异常**（错误进入 `error` 字段）。

```ts
fetchTeacherProfile(): Promise<TeacherLoadState<TeacherProfile>>
fetchTeacherTeaching(semester?: string): Promise<TeacherLoadState<TeacherTeachingData>>
fetchTeacherExams(semester?: string): Promise<TeacherLoadState<TeacherExamData>>
fetchTeacherNotices(params?: TeacherNoticeQuery): Promise<TeacherLoadState<TeacherNotice[]>>

interface TeacherNoticeQuery { page?: number; pageSize?: number; keyword?: string }
```

| 函数 | 领域载荷 | 说明 |
| --- | --- | --- |
| `fetchTeacherProfile` | `TeacherProfile` | 工号 / 姓名 / 角色 / 部门 ID |
| `fetchTeacherTeaching` | `TeacherTeachingData` = `{ tasks: TeachingTask[]; classes: TeachingClass[] }` | 任务与教学班**粒度不同**（recon 04 §1.1/§1.4，6 vs 4），必须按 `jxbid` 关联，**禁止按数组索引拼接** |
| `fetchTeacherExams` | `TeacherExamData` = `{ invigilations: Invigilation[]; exams: TeacherExam[] }` | 监考 + 任课班级考试 |
| `fetchTeacherNotices` | `TeacherNotice[]` | 只读；标记已读**仅本地** |

辅助导出：`classifyTeacherErrorKind(message)`、`toTeacherDataError(error)`、`teacherEmptyError()`。

---

## 4. 冻结契约：Rust 命令与 bridge 路由

E0 已把全部命令**预注册为 stub**（返回「未实现」，**绝不返回假数据**）。E2/E5/E6 只改实现文件，**不再动 `lib.rs`**。

| Tauri 命令 | 参数 | bridge 路由 | 实现文件（后续 Agent） |
| --- | --- | --- | --- |
| `teacher_profile_fetch()` | — | `POST /v2/teacher/profile` | `http_client/academic/teacher/profile.rs` |
| `teacher_teaching_fetch(semester?)` | `semester: Option<String>` | `POST /v2/teacher/teaching` | `http_client/academic/teacher/teaching.rs` |
| `teacher_exams_fetch(semester?)` | `semester: Option<String>` | `POST /v2/teacher/exams` | `http_client/academic/teacher/exams.rs` |
| `teacher_notices_fetch(page?, pageSize?, keyword?)` | `page: Option<i64>`、`page_size: Option<i64>`、`keyword: Option<String>` | `POST /v2/teacher/notices` | `application/teacher.rs` |

返回统一为 `Result<serde_json::Value, String>`；错误消息会被 `classifyTeacherErrorKind` 归一化。

> **`teacher_notices_fetch` 当前为保留接口（stub，返回 `notImplemented`）。**
> E3（#1023）实际改走既有 `school_inbox_fetch` 的 portal 只读链路
> （`useTeacherNotifications.ts`），因此本命令与其 bridge 路由目前无生产调用。
> 保留原因：通知域后续需要分页/关键字检索时可直接接线；**无论是否接线，教师通知都绝不写服务端**。

**Rust 只读 allowlist（唯一事实源）**：`src-tauri/src/http_client/academic/teacher/readonly.rs`。
任何教师教务路径必须登记在此，且**不得含写动词**。词根清单以 `readonly.rs` 的
`TEACHER_WRITE_VERB_ROOTS` 为准（当前为
`save|add|create|update|delete|remove|submit|confirm|import|insert|upload|export|print|report|reset|change|send|batch|collect|chehui|topping`）。
⚠️ 该清单**刻意不含** `apply|audit|approve|reject|edit|modify|record|unlock|doTrans|cxsq|reApply`：
`/admin/activiti/myApply/qryMyApply` 等**只读**路径自身就含 `apply`，若把这些词根一并纳入，
allowlist 自检会误报失败。新增路径时请对照 `data/teacher-api-recon/07-write-endpoints-denylist.md`
逐条人工确认，不要只依赖词根匹配。

---

## 5. 错误 kind 语义（`TeacherDataErrorKind`）

| kind | 触发条件 | UI 建议 |
| --- | --- | --- |
| `empty` | 接口可用但无数据 | 空态（非错误） |
| `unauthorized` | HTTP 401 / 「没有访问当前接口的权限!…[模块:子模块]」 | 隐藏入口或提示无权限 |
| `expired` | 会话过期（被重定向登录页 / 「会话已过期，请重新登录」） | 引导重新登录 |
| `errorHtml` | HTTP 200 + 错误 HTML 页（「报错啦 / 错误原因：…」） | 提示服务异常 |
| `timeout` | 请求超时 | 提示重试 |
| `notImplemented` | E0 stub 未实现 | 「功能建设中」 |
| `unknown` | 其它 | 通用失败提示 |

⚠️ **不要直接展示 `error.message`**：请按 `kind` 映射到 `teacher.error.*` i18n key。

---

## 6. i18n key 前缀约定

- 所有教师文案 key 必须以 **`teacher.`** 开头，形如 `teacher.<domain>.<element>`。
- 三份字典（`src/utils/i18n/messages/{zh-CN,en,ja}.ts`）**末尾**的
  `// --- teacher portal v2 ---` 区块内追加，**三侧 key 集合必须完全一致**
  （`src/utils/i18n_coverage.spec.ts` 强制校验）。
- E0 已预置 E1–E6 需要的 key（`teacher.common.*`、`teacher.home.*`、`teacher.profile.*`、
  `teacher.teaching.*`、`teacher.exams.*`、`teacher.notification.*`、`teacher.workflow.*`、`teacher.error.*`）。
  后续 Agent **只改值、不改 key**；确需新增 key 时三语同步追加。

---

## 7. 缓存 / 提醒作用域

```ts
buildTeacherScopeKey(accountId, semester)            // teacher:{accountId}:{semester}
buildTeacherScopedKey(kind, accountId, semester)     // teacher:{accountId}:{semester}:{kind}
parseTeacherScopeKey(key)                            // → { accountId, semester } | null
```

教师缓存、本地提醒快照、本地已读标记**必须**以此键隔离；学生域前缀为 `student:`，两者永不相等。
**严禁**使用 `Date.now()` 参与去重键（见 `normalizeTeacherData.buildStableKey`）。

---

## 8. 如何新增一个教师功能（后续 Agent 清单）

1. **不要**改公共注册文件；视图已在 §2 预注册，直接改对应的 `views/*.vue`。
2. 若需要新数据：在 `composables/` 新增组合函数，调用 `api/teacherApi.ts` 的既有函数；
   需要新接口时，**先**在 `data/teacher-api-recon/` 确认只读、**再**在 `readonly.rs` 登记路径。
3. 组合函数把 `TeacherLoadState` 映射到 UI；错误按 §5 的 `kind` 映射 i18n。
4. 文案只用 `teacher.` 前缀，三语同步。
5. 新增测试放 `__tests__/`，fixture **必须脱敏**（不得含真实工号、手机号、教学班名单、Cookie）。
6. 运行自证：
   ```bash
   cd apps/client
   npm run typecheck
   npx vitest run src/features/teacher src/config src/utils/i18n_coverage.spec.ts src/utils/teacher_readonly_allowlist_contract.spec.ts
   npm run check:architecture
   ```
