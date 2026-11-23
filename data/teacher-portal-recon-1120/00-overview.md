# 教师端全量接口勘察 · 总览（2026-11-20）

> 目标：用**真实教师账号**，把「新融合门户 + 教务系统 + 一码通 + 学习通」四个子系统的教师身份只读接口全部探明，
> 并对照 App 现有教师端能力，产出「必须移下来的功能」缺口清单。
> 基线：`origin/main @ 1479d0fd1`，分支 `feat/teacher-portal-probe-1120`，worktree `D:\wt\teacher-portal-probe-1120`。

---

## 一、只读声明（本轮全部遵守）

- ✅ 只发 GET 与**纯查询** POST（jqGrid 列表、`getToken`、`user/info` 这类）
- ❌ 未调用任何写型/产物型接口（不提交、不保存、不删除、不申请、不审核、不发起签到、不发帖、不上传、不导出）
- ❌ 未调用语义可疑接口：`pj/xspjjgcx/checkRefresh`、`pkgl/pkgljsjyhmd/checkHmdInTime`、`cjgl/xnxqkfsz/checkAllowToUnlock`、`pkgl/sdznpk/checkThjsCtzc`
- ❌ 未生成任何一码通付款码（`virtualCard/qrcode*` 全未触碰）
- 响应中的姓名、工号、学号、手机号、身份证、卡号、二维码串、cookie、token **全部脱敏**，不落盘

---

## 二、教师会话建立（可复现）

教师账号凭据来自本机 Windows 凭据管理器（keyring `service=mini-hbut`，账号为 8 位教师工号，此处以 `<工号>` 代称），
`secret-envelope` 主密钥可离线解密 `%APPDATA%\com.hbut.mini\grades.db` 里的信封。

| 步骤 | 脚本 | 产出 |
| --- | --- | --- |
| 1. 解凭据 | `tools/portal-cred-probe`（`cargo run --release -- <工号>`） | `%TEMP%\portal_session_<工号>.json` |
| 2. CAS 登录 + 各 SP 换票 | `tools/teacher-probe/cas-login.mjs <工号>` | `%TEMP%\teacher_session_<工号>.json` |
| 3. 一码通 SSO | `tools/teacher-probe/code-sso.mjs` | session 的 `one_code`（accessToken/refreshToken） |
| 4. 学习通桥接 | `tools/teacher-probe/chaoxing-sso.mjs` | session 的 `chaoxing.com` 域 cookie |
| 5. 域探测 | `tools/teacher-probe/{probe-lib,code-lib,verify-*}.mjs` + 各子代理脚本 | `raw/*.json` |

> ⚠️ 关键坑：**不要重复登录**。CAS 单账号互踢，多个探测任务必须共用同一份 session。
> ⚠️ 一码通 `user/info` **必须 POST**（GET 返回 `{"success":false,"message":"??"}`）。
> ⚠️ 门户网关会话约 **10 分钟**过期，`errcode=999` 时重走 `GET /login` 换票。

### 教师身份实测证据

| 系统 | 证据 |
| --- | --- |
| 教务 `jwxt` | `POST /admin/getMenuList` → `currentRoleId="js"`、工号 8 位、`currentDepartmentId=205`、`dataXnxq=2026-2027-1` |
| 教务首页 | `#roleId="js"`，`.admin_name` 8 位、`.arrowbt` 3 字 |
| 融合门户 `e.hbut` | `GET /getLoginUser` → `categoryName="教师/教职工"`；`/getUserPermissionRouters` → 站点「普通教师」「行政人员」 |
| 一码通 `code` | `POST /server/user/info`（SM4 解密后）→ `positionCode="01"`、`positionName="教职工"`、有账户与余额 |
| 学习通 `chaoxing` | `backclazzdata` → 14 个班级、`content.roletype=3`（教师，学生为 1）；泛雅站点 `hbutsie1.fanya.chaoxing.com` |

---

## 三、四域关键发现（浓缩）

### 教务 `jwxt`（213 条实测：200×184 / 401×3 / 404×14 / 500×12）

1. 两个 **fe SPA 首次打通**：调停补申请走 `/admin/jsd/ttbgl/*` + `/admin/pk/pkttbgl/*`；教师端工作量走**同 host 微服务 `/twork/*`**（`{code:1,message,data}`，只接 GET）
2. **证伪 10-09 结论**：`/admin/jsd/qxzkb/querylist` GET/POST 均 **500**，正确接口是 `queryQxkbPage`
3. `queryQxkbPage` 的**周次/星期/节次过滤被服务端忽略**（total 恒 6941），周次筛选只能客户端做
4. jqGrid 真实形态是 **POST + `queryFields` + `page.pn/page.size`**；GET 是服务端兼容（3 个 `SelectUnion` 是 POST-only）
5. `getXqrqxx` 参数名必须是 **`zcStr`**（传 `zc` → 500）
6. `xsxxcxListCustom` 的 `yxdm` 过滤**不生效**，返回全校 56957 条
7. 教师卡片、工作业绩考核是**服务端渲染 HTML，无 JSON API**

### 融合门户 `e.hbut`（142 条实测：200×124 / 302×6 / 404×12）

1. 教师 3 个菜单页：首页 / **办事大厅** / **数据中台**；学生没有后两个
2. 首页 **8 张卡**（待办/已办/我的任务/抄送/热门/收藏/我的服务/全部业务系统），`execCardMethod` 的 `renderData`/`getConfig`/`getMarkNumber` 可用
3. 办事大厅 **66 项服务**（zd.hbut 表单 22、chaoxing SSO 5、oanew 4、kypt 4、内网 10、其他 21）
4. ★ **一码通 tid 的唯一合法入口**：`pcAccessUrl = code/server/auth/host/open?pc=1&org=2&host=28` → CAS 换票 → 服务端签发一次性 tid → `POST getToken`
5. 教师**没有** `STUPERSONALDATA`（学生个人数据卡），换成 4 张任务卡

### 一码通 `code`（160 条实测）

1. **必须 POST JSON**：GET 返回 `{"success":false,"message":"??"}`（不是 405）
2. 教师 `hasCard=false`（无实体卡）、`hasVirCard=true`；**余额全在补助钱包**（主账户 0.00 + 补助 2629.42），展示必须聚合 `accTypes`
3. 教师**能查本人流水**（消费 + 补贴，形态与学生一致）
4. 教师 **water/electric 未绑定**，仅 broadband 绑工号 → 只能缴网费
5. `bllt/*` 全家 `CORE10004`（服务端未实现）、`merchant/*`+`iotdevice/*` 403（角色墙）→ **都不要接**
6. 死端点：`/server/auth/getLoginUser`、`/server/auth/getUserInfo` 均 404

### 学习通 `chaoxing`（102 条实测，200×95）

1. CAS → `fysso.chaoxing.com/cassso/hbutsie` 桥接即得教师会话，**`roletype=3`** 是教师铁证
2. 教师 **9 门「我教」课程**（`getMyCourseJson`，role=1 主讲/2 协作），5 个教学班；泛雅站点 `hbutsie1`
3. **最大金矿是 `stat2`**：`teach-data/*` 16 个学情统计、`base-data/v3/*` 17 个课程画像、`score-data/scoreList` 全班 60 字段成绩、`study-monitor/v2/studyList` 学习监控
4. **Playwright 实点复核**：作业（`work/list`）与考试（`exam/test`）都是**服务端渲染 HTML，没有 JSON 列表接口**；**教师进不了课程管理页**（`tcm/course-manage` 渲染「该身份无权限」）
5. `enc` 每次进课动态生成且一次性 —— 这是盲猜 `work/list` 一直返回「提示」的真正原因
6. 路径前缀三套并存：课程列表 `/mooc-ans/`、课程页与数据 `/mooc2-ans/`、学情 `/stat2/`，混用必 404

---

## 四、文档索引

| 文件 | 内容 | 负责人 | 状态 |
| --- | --- | --- | --- |
| **00-overview.md** | 本文件 | Lead | ✅ |
| [10-jwxt-teacher-full.md](10-jwxt-teacher-full.md) | 教务 14 一级菜单 / 47 项全量（213 条实测） | 子代理 A | ✅ |
| [11-ehbut-portal-teacher.md](11-ehbut-portal-teacher.md) | 融合门户教师端（142 条实测 + 66 服务 + tid 链路） | 子代理 B | ✅ |
| [12-code-teacher.md](12-code-teacher.md) | 一码通教师端（160 条实测） | 子代理 C2 | ✅ |
| [13-chaoxing-teacher.md](13-chaoxing-teacher.md) | 学习通教师端（102 条实测 + Playwright 实点复核） | 子代理 D + Lead | ✅ |
| [14-gap-matrix.md](14-gap-matrix.md) | **学校功能 ↔ App 现状 ↔ 缺口**（交付核心） | Lead | ✅ |
| `raw/*.json` | 各域原始探测记录（已脱敏） | 各子代理 | ✅ |

---

## 五、App 教师端现状（盘点基线）

前端 `apps/client/src/features/teacher/`（39 文件，5 个视图）+ 后端 `apps/client/src-tauri/src/http_client/academic/teacher/`（4 文件）。

**已开放入口**（`config/teacher_feature_catalog.ts`，9 项全 `enabled: true`）：
我的教学 / 考试与监考 / 教务通知 / 全校课表 / 空教室 / 校历 / 图书馆 / 校园地图 / 资源共享。

**已接入的教务接口（22 条路径）**：

```
/admin/getMenuList
/admin/pkgl/pkgljskb/queryKbForJsd          /admin/pkgl/pkgljskb/getJskbByXqid
/admin/pkgl/pkglqxzkb/getJcinfo
/admin/jsd/jxrw/ajaxListJsJxrw
/admin/jsd/kwglJsdJkcx/ajaxJsjkList        /admin/jsd/kwglJsdJkcx/ajaxJsrkjxbksList
/admin/jsd/notice/ajaxList1                 /admin/system/tzsjx/ajaxList
/admin/jsd/qxzkb/queryQxkbPage
/admin/system/jxzy/jsxx/toZyKjsPage         /admin/system/jxzy/jsxx/getZyKjs
/admin/system/jxzy/jsxx/getZcByXnxq         /admin/system/jxzy/jsxx/getXqrqxx
/admin/pkgl/pkjssz/getJxlList
/admin/system/zy/xlgl/getData/{xnxq}
/admin/activiti/dbsy/listRunningProcessInstaces
/admin/activiti/myApply/qryMyApply          /admin/activiti/myApply/qryOperationApply
/admin/jsd/jsdcjcx/jsdQueryJxbList
（写：/admin/jsd/notice/create、/admin/system/tzsjx/updateState、/admin/system/zy/xlgl/updateByZc）
```

**未接的域**：融合门户 `e.hbut` 全站、一码通 `code` 全站、学习通教师侧、教务 47 项里约 26 项。
