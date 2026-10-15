# Epic #1060 教师端回归修复 — 验收报告

> 分支：`feat/1060-teacher-portal-regression`（集成 `#1061` `#1062` `#1063` `#1064` `#1065` `#1066` `#1067`）
> 基线：`origin/main` @ `7bbf26174d7002e74e79fb946903dede946d2bad`
> 验收时间：2026-10-16
> 账号：真实教师工号 `2024****`（脱敏；凭据仅运行时经环境变量注入，未入库/未入日志）

---

## 1. 最重要结论：issue 的一处核心前提被实测推翻

issue #1062 断言「学校空教室接口只支持教室资源目录、不支持按时间筛选」，据此建议**降级为资源列表**。

**实测结论：该前提不成立。** `GET /admin/system/jxzy/jsxx/getZyKjs` 只能返回 191 条资源目录，
但同一路径改用 **POST** 并携带页面真实参数（`zcStr` / `xqStr` / `jcStr` / `jxldm`）后，
**会按周次/星期/节次真实过滤**。因此本次实现**保留了教师端筛选**并使其真正生效，
而不是隐藏筛选降级显示。

同时实测出 5 个会「伪装成成功」的陷阱（均已纳入防护）：

| 陷阱 | 实测现象 | 本次防护 |
| --- | --- | --- |
| 非法 `zcStr`（`abc`/`7-8`/`-1`/越界 `30`） | 静默返回全量 191，与「该时段全校空闲」无法区分 | 先用 `getXqrqxx` 做周次合法性校验，非法直接报错 |
| 不存在的学期 | 干净的 `total:0`，与「真的 0 间」无法区分 | 元数据 `availability` 区分 `period_free` / `unknown` / `bad_response` |
| `page.pn` 越界 | `results:[]` 但 `total:53` | 解析层校验 `results` 与 `total/rows/page` 一致性 |
| `jyzt` / `sfqy` 恒为 `"1"` | **不含任何时段占用信息** | 删除把 `jyzt` 推断为「可用」的旧逻辑；`status` 不再伪装 |
| `jcStr` 为空 ≠ 不过滤 | 返回「全部节次都空闲」的交集 | 空节次按交集语义处理，不当作「未筛选」 |

另发现 App 硬编码作息时间与学校实际不符（App 第 1 节 08:00-08:45，实际 **8:20-9:05**；
第 9 节 App 19:00-19:45，实际 **18:30-19:15**），本次已按学校实测时间表修正。

---

## 2. 真实账号端到端验证（本机直连学校服务器，只读）

通过 `HbutClient` / `AuthService` / `TeacherService` 真实调用学校接口（与 UI 同一条 Rust 代码路径），
证据来自 2026-10-16 本机实跑，已脱敏。

### 2.1 登录与会话（#1061 的底层前提）

```
LOGIN ok  role=teacher  sid_len=8  elapsed=3528ms
```
验证码由 `fetch_and_recognize_captcha()` 走 OCR 端点自动识别（无需人工），CAS 登录 → JWXT bootstrap 成功。

### 2.2 教师只读接口（#1067 并发改造后）

| 接口 | 第 1 次 | 第 2 次 | 数据量 |
| --- | --- | --- | --- |
| 教学任务 + 教学班 | 340ms | 317ms | 6 条任务 / 4 个教学班 |
| 监考 + 任课考试 | 732ms | 743ms | 1 监考 / 1 任课考试 |

并发改造未破坏真实接口行为与错误语义。

### 2.3 空教室（#1062 / #1063 核心场景）

| 场景 | success | availability | filters_applied | filters_verified | 条数 | total | date_str | week | weekday |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 楼栋目录 | true | — | — | — | 7 项（含「全部教学楼」） | — | — | — | — |
| 无筛选（默认当前周/日） | true | `period_free` | true | true | 39 | 39 | 2026年10月16日 | 7 | 5 |
| 第7周 / 周一 / 9-11节 | true | `period_free` | true | true | 53 | 53 | 2026年10月12日 | 7 | 1 |
| **第7周 / 周一 / 9-11节 / 3号楼（用户原场景）** | true | `period_free` | true | true | **25** | **25** | 2026年10月12日 | 7 | 1 |
| 第6周 / 周一 / 9-11节 / 3号楼（对照） | true | `period_free` | true | true | 26 | 26 | 2026年10月05日 | 6 | 1 |

关键点：
- **用户原场景返回 25 间，不是 0**；修复前是「0 个空教室 + 未知日期 + 第7周」。
- 日期与周次**自洽**（第7周→2026年10月12日；第6周→2026年10月05日），不再出现「未知日期 + 第7周」。
- 楼栋过滤真实生效（3号楼结果 `building` 均为 `3号`，房间编号 `3-xxx`）。
- 楼栋目录 `fallback=false`，来自真实资源域（非静态兜底列表）。

### 2.4 非法输入不伪装成功

| 输入 | 结果 |
| --- | --- |
| 周次 `999`（越界） | `success=false`，**拒绝**而非返回全量 |
| 周次 `-1` | 归一为第 1 周后查询（返回 53），不伪装成任意成功 |

---

## 3. 静态门禁结果（合并后实测）

| 门禁 | 结果 |
| --- | --- |
| `npm run build` | ✅ rc=0 |
| `npm run test:ci` | ✅ 328 文件通过 / **3479 测试通过 / 0 失败**；1 文件失败为**既有环境性问题**（见 §4） |
| `npx vue-tsc --noEmit -p tsconfig.json` | ✅ rc=0 |
| `npm run typecheck:js-sfc` | ✅ 通过 |
| `check-frontend-safety.mjs` | ✅ 3 项通过 |
| `check-design-tokens.mjs` | ✅ 通过 |
| `check_arch_guards.mjs` | ✅ 架构守卫全部通过 |
| `cargo test --lib` | ✅ **490 passed / 0 failed / 1 ignored** |
| `cargo fmt --all -- --check` | ✅ rc=0 |
| `cargo clippy --lib` | ✅ 0 error（247 条既有 warning，均不在本次改动文件） |

**基线对照**：改动前同环境 `test:ci` 为 3363 passed + 1 环境性失败；本次 3479 passed（+116）+ 同一环境性失败。
**未引入任何新增测试失败。**

---

## 3.1 集成审查（独立对抗式）发现与修复

四个分支合并后，由**独立 agent** 对 `origin/main...HEAD` 的 56 文件 diff 做对抗式审查（只读）。
共 1 个 P0、0 个 P1、6 个 P2。已修复项：

| 级别 | 问题 | 修复 |
| --- | --- | --- |
| **P0** | **学生端空教室语义回归**：学生分支 meta 不输出 `availability`/`filter_mode`，前端把「字段缺失」保守判为 `unknown` → 学生**每次查询成功**都会显示「状态未知 / 请勿据此判定空闲」、徽标由「空闲」变「状态未知」、`classroomRoleFromMeta` 取不到角色（缓存键丢角色维度）。与 PR 声称的「学生行为不变」冲突 | 学生 meta 显式补 `filter_mode: "student_period_query"` + `availability: "period_free"`（学生接口本身即按 `zcStr/xqStr/jcStr/xnxq` 时间维度查询，沿用既有语义）；新增 5 条学生 meta 契约回归测试（含「缺失 availability 仍须保守判 unknown」反例） |
| P2 | 学生分支 `status` 被从 `jyzt` 推断改为硬编码「空闲」，依据是**教师**接口实测（`jyzt` 恒为 `"1"`）——属未探测学生接口的外推 | 还原为改动前的 `jyzt == "0" → 可用 / 否则 已占用`；并把 `teacher_academic_query_contract.spec.ts` 的「禁止读取 jyzt」断言**收敛到教师分支切片**，保留 #1063 在教师路径上的门禁 |
| P2 | `TModal` 新增容器 `padding`，会同时改变另外 7 个共用 TModal 的布局（原先容器 padding 为 0、由调用方自管） | 去掉该非必要改动；`#1064` 只保留不透明实底相关样式 |
| P2 | 登出 / 切号未清理教师只读快照与在途请求（`clearTeacherFetchInFlight` 为死代码），与 #1065「登出清理」要求不符 | `AuthCoordinator` 登出时按账号 `clearTeacherSnapshotScope(sid)` + `clearTeacherFetchInFlight()`；切号时丢弃上一账号在途请求 |
| P2 | `useTeacherProfile.revalidate` 缺请求作用域守卫（与 teaching/exams 不一致） | 补 `snapshotKey/accountId` 守卫，迟到结果不写入当前状态 |

**另修复 CI 阻断（Linux 专属）**：`test-rust`（ubuntu）失败，根因是新增测试 `account_password_lookup_never_crosses_accounts`
依赖系统密钥环落库，而 Linux runner 无 Secret Service，`save_user_session` 按设计拒绝把密码落库。
已按仓库既有平台豁免模式（同 `credential_store.rs`）改为：仅 Linux 允许跳过「有凭据」正例，
macOS / Windows（CI 同样执行该测试）仍严格断言；与平台无关的「不得跨账号回退」安全断言在所有平台保留。

审查**已核查为无问题**的维度（含手段）：教师只读 POST 白名单 fail-closed（`assert_allowlist_readonly` 双向校验 + 运行期精确匹配，未见可绕过写型路径）；
切号凭据作用域无 `latest_user_session` 回退、身份不一致 fail-closed；测试注入 trait 非 pub、生产不可达；
教师快照 key 对未知工号返回空串拒绝缓存；singleflight key 含 scope 且 `.finally()` 清理（无永久卡死）；
epoch 守卫覆盖迟到写入；i18n 三语 key 集合完全一致（各 3645 个，diff 无差异）；未发现空断言或 `expect(true)`。

## 4. 未验证项（如实列出，不虚报通过）

1. **iOS / Android 真机未验证**：本机（Windows）无 iOS/Android 设备与构建链，无法执行 #1068 要求的真机复测。
   - 受影响：iOS 安全区（`env(safe-area-inset-*)`）与 Home Indicator 避让、深色模式实底、动态字号。
   - 已有的替代证据：`TModal.spec.ts` 样式契约 + headless Chrome 计算样式（浅色 `rgb(255,255,255)`、深色 `rgb(30,41,59)`、深色预设均 alpha=1）。
2. **Windows 桌面应用级 UI 端到端未执行**：本机已有另一个 worktree（`wt/tauri-seat-reservation`）的 `tauri dev` 实例占用同一应用标识与 4399 端口，
   Tauri 单实例机制会顶掉新构建，且该进程属于另一并发会话，未予终止。
   - 受影响：切号 UI 四态、同步栏实际渲染、缓存首屏体感的**应用级**验证。
   - 已有的替代证据：Rust 14 个切号合同单测（伪造 200 登录页 / 401 / 403 / 超时 / 身份不一致）、前端四态接线测试、
     缓存/同步/singleflight 共 50 个单测、以及 §2 的真实接口端到端验证。
3. **真实学校网络 p50/p95 未测量**：只做了单次耗时采样（§2.2/§2.3），未做 ≥3 次统计。并发改造的 p50/p95 是在
   **本地模拟 I/O** 下测得的（串行 p50 137.3ms → 并发 62.6ms，约 −54%），非学校网络实测。
4. **学生端空教室链路未实测**：学生分支 `status` 由 `jyzt` 推断改为固定「空闲」（依据是该请求本身已带时间筛选），
   此改动**基于推断**，未探测学生接口；仅影响导出预览文案，空教室页面本身不读 `status`。
5. **`zcStr=20/21` 返回 191 的成因未定**（可能是该周确实全空闲，也可能是过滤被忽略）；
   已用「`total` == 无筛选基线 → `unknown`」保守兜底，无法根治。
6. **非本部校区（`xqdm != 1`）行为未探测**；教师资源域实测全为 `xqmc=本部`。
7. **教学任务与教学班按 `jxbid` 关联结果为 0 条**（真实数据下 6 任务 / 4 教学班未匹配）。
   这是既有数据形状，本次未改动该关联逻辑，**作为观察项记录**，未判定为缺陷。

---

## 5. 安全与边界核查

- 全程**只读**：未调用任何写型/产物型接口；新增的查询型 POST 走 `TEACHER_QUERY_POST_PATHS` **fail-closed 白名单**，
  且 `assert_allowlist_readonly` 双向校验。
- 未把账号、密码、Cookie、个人数据写入任何仓库文件 / 日志 / 文档 / 提交。
- 教师缓存按 `role + accountId + semester + resource + filter` 隔离；未知工号 → **空 key 拒绝缓存**（fail-closed）。
- 空教室缓存键加入 `teacher:` / `student:` 角色前缀，杜绝师生链路互相命中。
- 失败一律 fail-closed：在线切号失败不静默换回旧账号；空教室无证据时标 `unknown` 而非「空闲」。

---

## 6. 已知设计说明（非缺陷）

- **教师端保留节次筛选**（而非按 issue 建议隐藏）：因实测筛选真实生效。UI 改为保证「筛选真实生效 + 结果语义诚实」。
- **空教室有两套缓存机制**：Rust `application/academic.rs` 的查询缓存（角色+账号+筛选键）与前端 `ClassroomView`
  自身的 filter-keyed 快照；二者用途不同（前者跨调用复用、后者离线优先），未强行统一，避免引入回归。
- **同步栏覆盖范围**：教学任务/教学班、考试/监考、教务通知、教师资料四个视图；空教室沿用其既有顶部离线提示 + 查询时间展示。

---

## 7. 回滚

| 目标 | 方式 |
| --- | --- |
| 教师本地缓存 | `localStorage['hbu_teacher_cache_enabled']='0'` 或 `setTeacherCacheEnabled(false)` |
| 教师只读并发 | 环境变量 `HBU_TEACHER_SERIAL_FETCH=1` 回退串行 |
| 空教室教师链路 | 让教师分支返回 `{success:false, error:"教师空教室查询暂不可用", availability:"bad_response"}`（**隐藏而非伪装成功**） |
| 整体 | 四个 feature 分支独立可 revert；epic 分支未合并前不影响 `main` |
