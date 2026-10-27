# 教师端「空教室」接口补充勘察（2026-10-16）

> 触发 Issue：#1062 / #1063（父 Epic #1060）
> 目标系统：`https://jwxt.hbut.edu.cn`（湖北工业大学综合教务，*Powered by ChaoXing*）
> 学期：`2026-2027-1`；会话角色：`currentRoleId=js`（教师，已授权测试账号）
> 基线：`origin/main @ 7bbf2617`

---

## ⛔ 只读声明

本轮补充勘察**全程只读**：

- ✅ GET：页面 HTML、静态 JS、`getZcXqJC`、`getJcinfo`、`getXnxqInformation`、`ajaxListJsJxrw`
- ✅ POST：仅 `getZyKjs` / `getZcByXnxq` / `getXqrqxx` / `getJxlList` 四个**列表/字典查询**接口
  （`getZyKjs` 已在 `07` 文件 **D 类「已确认只读」** 登记；其余三个在 `07` **C 类**被标为
  「POST + get 语义，未探测」。本轮实测确认它们**只返回查询结果、无任何写入**，
  且 `toZyKjsPage` 页面自身即以此方式调用它们）
- ❌ 未调用任何写型/产物型接口（未触碰 `07` 文件 A/B 类）
- ❌ 未调用 `checkJysjfw` / `checkHmdInTime` / `checkRefresh` 等语义可疑接口
- 响应中的姓名、工号、学号、Cookie、token **均未落盘**；本文只保留**设施类信息**
  （教学楼编号/名称、教室编号、数量、时段）

> ⚠️ 与 `00-README.md` 的「只用 GET」原则相比，本轮**新增了 4 个查询型 POST**。
> 依据：这些 POST 是学校页面自身的正式调用形态（`mtype:"post"` + jqGrid `postData`），
> 语义为纯列表查询，路径不含任何写动词。接入代码中已按**显式白名单**登记，
> 详见 `apps/client/src-tauri/src/http_client/academic/teacher/readonly.rs`。

---

## 🔑 最重要结论

**学校**（对教师账号）**确实支持按「周次 / 星期 / 节次 / 教学楼」筛选空教室。**
`getZyKjs` 不是「只有资源目录」，而是一个**会按时间维度过滤的查询接口**——
只要按学校页面的真实形态用 **POST** 发送 `zcStr/xqStr/jcStr/type/xnxq/jxldm`。

用户截图中「3 号楼 / 第 7 周 / 星期一 / 9-11 节 → 0 个」的场景，
**实测返回 25 间**（不是 0）。因此 #1062 的正解不是「降级为资源列表」，
而是**接入真实的时间维度筛选**；`filters_applied=true` 是**可以合法取得**的。

---

## 1. 来源页面与真实调用形态（实测）

来源页面：`GET /admin/system/jxzy/jsxx/toZyKjsPage`（标题「空教室列表」，HTTP 200，HTML 121,373 字节）

页面内联 JS（`toZyKjsPage.html:1222-1225`）：

```js
var settings = {
    postData: queryParams,       // queryParams 仅含 queryFields
    mtype: "post",               // ← 关键：查询是 POST，不是 GET
    url: "/admin/system/jxzy/jsxx/getZyKjs?gridtype=jqgrid",
    prmNames: { page: "page.pn", rows: "page.size", sort: "sort", order: "order" },
    rowNum: 50,
    datatype: "json",
    pager: "#pager_zyJsxx",
    ...
};
```

页面表单（`toZyKjsPage.html:293-616`）暴露的筛选字段：

| 字段 | 位置 | 含义 |
| --- | --- | --- |
| `xnxq` | select#xnxq | 学年学期 |
| `xqdm` / `xqdmStr` | select#xqdm | 校区代码 |
| `jxldm` | select#jxldm（multiple） | **教学楼 id（多选）** |
| `jsmc` | input | 教室名称 |
| `jsrlMin` / `jsrlMax` | input | 座位数区间 |
| `jslx` | select | 教室类型 |
| `pxfs` | select | 排序方式 |
| `sfqy` | select | 是否启用 |
| `syyx` | select | 使用院系 |
| `type` | select#type | **1 = 按节次；2 = 按借用时段** |
| `jsbq` / `jsglbm` / `zylx` / `gnqdm` | select | 标签 / 管理部门 / 桌椅类型 / 功能 |
| `startDate` / `endDate` | layer-date | 借用时间范围 |
| **`zcStr`** | hidden input#zcStr | **周次（逗号分隔）** |
| **`xqStr`** | hidden input#xqStr | **星期（逗号分隔）** |
| **`jcStr`** | hidden input#jcStr | **节次（逗号分隔）** |
| **`jcbmStr`** | hidden input#jcbmStr | 节次编码（逗号分隔） |
| `begintime` / `endtime` | input | 借用时段（type=2 用） |

页面自己的提示语直接证明时间维度筛选是**设计意图**（`toZyKjsPage.html:2478-2486`）：

> 「请先按校区、周次、星期、节次筛选空闲教室再进行借用操作！」

页面内置的教学楼数组（`toZyKjsPage.html:2166-2198`，`jxlArr`，全部 `xqdm:"1"`）：
`1→4号`、`2→工1`、`9→1号`、`14→5号`、`16→2号`、`17→7号`、`23→6教实训楼`、`24→3号`。
→ **「3号」的教学楼 id = `24`**（与后端 `getJxlList` 一致，见 §4）。

---

## 2. 实测证据：`POST /admin/system/jxzy/jsxx/getZyKjs?gridtype=jqgrid`

固定 `queryFields=id,jsbh,jsmc,jstp,kxjc,jslx,zdskrnrs,ksrnrs,jxlmc,szlc,gnqmc,xqmc,syyx,jyzt,jsbq,zylx,`
+ `page.pn=1&page.size=500`（除注明外）。

### 2.1 基线

| 请求 | HTTP | ret | total | results |
| --- | --- | --- | --- | --- |
| GET `?gridtype=jqgrid`（recon 08 原形态） | 200 | 0 | **191** | 20（默认页大小） |
| POST 仅 `queryFields` + 分页 | 200 | 0 | **191** | 191（size=500） |

### 2.2 时间维度筛选（决定性）

| zcStr | xqStr | jcStr | jxldm | total |
| --- | --- | --- | --- | --- |
| — | — | — | — | **191** |
| 7 | 1 | 9,10,11 | — | **53** |
| 7 | 1 | 9,10,11 | **24（3号）** | **25** ← 用户场景，非 0 |
| 6 | 1 | 9,10,11 | — | **127** |
| 7 | 3 | 9,10,11 | — | **57** |
| 7 | 1 | 1,2,3,4 | — | **25** |
| 7 | 1 | 9 | — | 53 |
| 7 | 1 | 11 | — | 124 |

**同一组参数换周次/星期/节次，`total` 全部变化 → 服务端确实按时间维度过滤。**

### 2.3 周次语义（zcStr）

| zcStr | 1 | 2 | 6 | 7 | 8 | 20 | 21 | 0 | 30 | `abc` | `7-8` | `-1` | ` 7 ` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| total | 159 | 141 | 127 | 53 | 70 | 191 | 191 | 191 | 191 | 191 | 191 | 191 | 53 |

- 合法值 = 该学期的**周次**，`zc` 字典由 `getZcByXnxq` 给出：`0..21`（22 项）。
- **`0` 与任何非法值（`abc` / `7-8` / `-1` / 越界 `30`）都等价于「不加周次过滤」→ 返回全量 191。**
  ⚠️ **这是最危险的陷阱**：前端若把非法/越界周次直接透传，会得到 191 条并被误报为「191 间空教室」。
  接入必须**客户端严格校验**（纯数字、逗号分隔、落在 `getZcByXnxq` 返回集合内）。
- `20` / `21` 返回 191 也**不能**直接判定为「该周全校教室全空闲」——与「过滤被忽略」形态**无法区分**，
  需按 §7 的差分判定处理。

### 2.4 星期语义（xqStr）

`xqStr=1 → 53`、`2 → 28`、`3 → 57`、`4 → 63`、`5 → 91`、`6 → 167`、`7 → 138`（zcStr=7, jcStr=9,10,11）。
与 `getXqrqxx` 的 `xqmc`（`xq=1 → 星期一`）一致：**`xqStr` 1..7 = 周一..周日，1=周一**。
（注意：recon `03 §B.2` 记录的 `getRqListByWeek` 里 `xqbh=2 ↔ 星期一` 是**另一套口径**，不要混用。）

### 2.5 节次语义（jcStr）——服务端按「大节」合并

`zcStr=7, xqStr=1`：

| jcStr | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 空 | 1,2,3,4 | 9,10,11 | 全部 11 节 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| total | 87 | 87 | 28 | 28 | 31 | 31 | 82 | 82 | 53 | 53 | 124 | 4 | 25 | 53 | 4 |

- `(1,2)`、`(3,4)`、`(5,6)`、`(7,8)`、`(9,10)` 两两结果相同 → 服务端按 **大节 `djs=ceil(jc/2)`** 分组。
- `total(1,2,3,4)=25 ≤ min(87,28)` → **交集（ALL）语义**：返回在所选**每个**大节都空闲的教室。
  （若为并集，应 ≥ 87。）
- `jcStr` 为空时返回 4（≈ 全部 11 节的交集），**不等于**「不过滤」。因此前端「未选节次」必须显式传
  合理集合，不能留空。
- `jcbmStr` 与 `jcStr` 同传结果一致（`jcbm` 是节次编码数组），**可省略**。

### 2.6 教学楼过滤（jxldm）

| jxldm | total | 结果中出现的楼栋 |
| --- | --- | --- |
| （空） | 53 | 1号, 2号, 3号, 5号, 7号 |
| `24` | 25 | 3号 |
| `24,9` | 26 | 1号, 3号 |
| `9` | 1 | 1号 |
| `000` | 0 | — |

**`jxldm` = 教学楼 id 的逗号分隔多值，服务端过滤。**

### 2.7 分页

`page.pn` / `page.size` 生效（`page.pn=1/2/3, size=20` → 20/20/13 条，`totalPages=3`）。
**`page.pn=99` 返回 `{total:53, results:[]}`** → ⚠️ `results` 空但 `total > 0` 是合法形态，
**不能当作「0 间空教室」**。

### 2.8 零结果与坏参数形态

| 场景 | 响应 |
| --- | --- |
| 真实 0 结果（`jxldm=000`） | `{"msg":"ok","ret":0,"page":1,"rows":500,"total":0,"totalPages":0,"results":[]}` |
| 非法学期 `xnxq=1900-1901-1` | `{"msg":"ok","ret":0,"page":1,"rows":5,"total":0,"totalPages":0}` ⚠️ **也是干净的 0** |

⚠️ **非法学期与真实 0 结果形态相同** → 必须先用学期目录校验 `xnxq`，否则会把「学期不存在」误报成
「0 间空教室」。

### 2.9 响应字段与「可用性」证据（#1063 核心）

无筛选 191 条的字段：`id, jsmc, jsbh, jslx, jxldm, jxlmc, xqmc, xqdm, zdskrnrs, szlc, sfqy, syyx, jyzt, jsglbmmc`。

| 字段 | 实测取值分布（191 条） | 结论 |
| --- | --- | --- |
| `jyzt`（借用状态） | **全部 `"1"`** | 常量，**不含任何时段占用信息** |
| `sfqy`（是否启用） | **全部 `"1"`** | 常量，**不含任何时段占用信息** |
| `jslx` | `"05"`×177, `"16"`×14 | 教室类型 |
| `xqmc` | `"本部"`×191 | 全部同校区 |
| `kxjc`（空闲节次） | **请求了但服务端不返回** | 逐房空闲节次**拿不到** |
| `jstp` / `ksrnrs` / `gnqmc` / `jsbq` / `zylx` | 请求了但未返回 | — |

**关键判定：可用性不是由行内字段表达的，而是由「服务端把不空闲的教室从列表中剔除」表达的。**
因此：

- ❌ 旧代码 `status: "可用"` 硬编码（`schedule.rs:783`）与 `jyzt=="0" → 可用`（`schedule.rs:624`）
  **均无证据支持**，必须删除。
- ✅ 只有「请求携带了**经校验的** `zcStr+xqStr+jcStr` 且服务端 `ret=0`」时，
  返回的教室才可标注为「所选时段空闲」。

教师可见资源域（191 条）只覆盖 **6 栋楼**：

| jxldm | jxlmc | 数量 |
| --- | --- | --- |
| 2 | 工1 | 4 |
| 9 | 1号 | 5 |
| 14 | 5号 | 36 |
| 16 | 2号 | 56 |
| 17 | 7号 | 39 |
| 24 | 3号 | 51 |

→ 与 `getJxlList` 的 **35 栋**相差很大。**教师楼栋候选必须从 `getZyKjs` 结果去重导出**
（或与该资源域取交集），否则会把 29 栋「明知缺席」的楼栋展示给用户。

---

## 3. 校历解析：`GET /admin/pkgl/jyjs/getZcXqJC`（新发现，权威）

来源：`toZyKjsPage.html:1925-1932`。**这是全页面唯一把「日期」映射为「周次/星期/节次」的接口。**

请求（GET，`startTime`/`endTime` 必须是完整 `YYYY-MM-DD HH:mm:ss`）：

```
GET /admin/pkgl/jyjs/getZcXqJC?xnxq=2026-2027-1&startTime=2026-10-16 19:00:00&endTime=2026-10-16 21:35:00
```

实测响应：

| 请求 | 响应 |
| --- | --- |
| `2026-10-16 19:00:00` ~ `21:35:00` | `{"type":1,"startZc":7,"startXq":5,"startJc":10,"endZc":7,"endXq":5,"endJc":11,"jcbm":["",""]}` |
| `2026-10-12 00:00:00` ~ `2026-10-18 23:59:59` | `{"type":1,"startZc":7,"startXq":1,"startJc":1,"endZc":7,"endXq":7,"endJc":11,"jcbm":[…]}` |
| `2026-08-24 08:00:00` ~ `09:40:00` | `{"type":1,"startZc":0,"startXq":1,"startJc":1,…}` |
| `2026-07-15 …`（暑假） | `{"type":0}` |
| `2026-08-20 ~ 2026-08-26`（跨校历边界） | `{"type":2,"xlksRq":"2026-08-31"}` |
| `2027-01-20 …` | `{"type":1,"startZc":21,"startXq":3,…}` |
| 仅 `xnxq`（无时间） | 空响应 |

语义（页面注释 + 实测）：

- `type=1` 校历内 / `type=0` 校历外 / `type=2` 跨校历边界（连接处，无法判定）
- `startZc/endZc` = 周次范围，`startXq/endXq` = 星期范围，`startJc/endJc` = 节次范围
- `xlksRq` = **本学期校历开始日期**（实测 `2026-08-31`，即第 1 周周一）
- ⚠️ `2026-10-16` 解析为 `zc=7` → 与用户截图「第 7 周」**一致**

### 周次口径（实测闭环）

`getXnxqInformation` 的键 = `getZcByXnxq` 的 `zc` = `getZcXqJC` 的 `startZc`，**同一空间、从 0 起**：

| key / zc | 0 | 1 | 2 | … | 7 | 21 |
| --- | --- | --- | --- | --- | --- | --- |
| 周首日（`getXqrqxx`） | 08.24 | 08.31 | 09.07 | … | 10.12 | 01.18 |

- `zc=0` ↔ 08.24-08.30 = **预备周**（`xlksRq` 之外的 1 周）
- `zc=N`（N≥1）↔ **第 N 周**，周一 = `xlksRq + 7*(N-1)`
- 教师教学任务 `skzc` 实测为 `2-13:2`、`7-14:2`、`16-18`、`19-21:16`、`20-21`、`18-18`
  → 最大 21，与 `getZcByXnxq` 的 `1..21` 吻合（**交叉验证通过**）

---

## 4. 配套字典接口（实测）

### 4.1 `POST /admin/system/jxzy/jsxx/getZcByXnxq`（周次字典）

请求 `xnxq=2026-2027-1` → 裸数组 22 项，业务字段**只有 `zc`**：`0,1,2,…,21`
（其余为注入的身份字段，须忽略）。

### 4.2 `POST /admin/system/jxzy/jsxx/getXqrqxx`（某周的 7 天日期）

请求 `xnxq=2026-2027-1&zcStr=7` →

```json
{"ret":0,"msg":"成功","data":[
 {"xq":"1","rq":"10.12","xqmc":"星期一"}, … {"xq":"7","rq":"10.18","xqmc":"星期日"}]}
```

- `rq` 为 **`MM.DD`（无年份）**，年份需由 `xnxq`/`xlksRq` 推导
- 仅接受**单个**周次（页面在 `zcArr.length > 1` 时直接放弃调用）
- ⚠️ `POST /admin/system/jxzy/jsxx/getXqrqxx` 仅传 `xnxq` 时返回 **HTTP 500** `{"ret":-1,"msg":"error"}`

### 4.3 `POST /admin/pkgl/pkjssz/getJxlList`（教学楼字典）

请求 `xqdm=1` → 裸数组 **35 项**，字段 `id, jxlbh, jxlmc, xqdm`。
实测关键映射：`24→3号`、`9→1号`、`16→2号`、`14→5号`、`17→7号`、`2→工1`、`23→6教实训楼`、
`000→无楼栋`、`99→无楼号`，另有非数字 id（`bqtyndl`、`bqwqg`、`sc001`、`scdl`）。

> 全 35 栋 ≠ 教师空教室资源域（6 栋）。**不能直接把 35 栋作为教师候选项。**

### 4.4 `GET /admin/pkgl/pkglqxzkb/getJcinfo`（真实节次时间，recon 已有）

请求 `xnxq=2026-2027-1` → `{ret:0,data:[11 项]}`，字段 `kssj,jssj,jc,jcbm,djs,sjd,sjdmc,sjdtj,sjdxh`。

| 小节 `jc` | `djs`（大节） | `sjd` | 时段 | 时间 |
| --- | --- | --- | --- | --- |
| 1 | 1 | sw | 上午 | 8:20 ~ 9:05 |
| 2 | 1 | sw | 上午 | 9:10 ~ 9:55 |
| 3 | 2 | sw | 上午 | 10:15 ~ 11:00 |
| 4 | 2 | sw | 上午 | 11:05 ~ 11:50 |
| 5 | 3 | xw | 下午 | 14:00 ~ 14:45 |
| 6 | 3 | xw | 下午 | 14:50 ~ 15:35 |
| 7 | 4 | xw | 下午 | 15:55 ~ 16:40 |
| 8 | 4 | xw | 下午 | 16:45 ~ 17:30 |
| 9 | 5 | ws | 晚上 | **18:30 ~ 19:15** |
| 10 | 5 | ws | 晚上 | 19:20 ~ 20:05 |
| 11 | 6 | ws | 晚上 | 20:10 ~ 20:55 |

⚠️ **App 前端硬编码的 `periodOptions` / `CLASS_SCHEDULE` 与本表全部不符**
（例如 App 写「第1节 08:00-08:45」，学校实际是「8:20-9:05」；App 写「第9节 19:00-19:45」，
实际「18:30-19:15」）。属于既有的**展示错误**，已在本次实现中一并纠正。

---

## 5. 未实测 / 不可推断项

1. `zcStr=20/21` 返回 191 是「该周确实全空闲」还是「过滤被忽略」——**无法区分**（§7 给出差分判定方案）。
2. 「返回在所选**每个**大节都空闲」是**交集语义的推断**（由 `total(1,2,3,4)=25 ≤ min(87,28)` 得出），
   未逐房间核验课表。
3. `kxjc`（空闲节次）为何请求了却不下发 —— 未查明；**因此不能依赖逐房节次字段**。
4. `type=2`（`begintime/endtime`）实测 `total=53` 与 `type=1 + jcStr=9,10,11` 相同，
   但**时段→节次的换算规则未细测**；接入只用 `type=1`。
5. `pxfs`（排序）、`sfqy`、`syyx`、`jslx`、`jsbq`、`jsglbm`、`zylx`、`gnqdm` 的过滤语义**未逐一实测**。
6. 非「本部」校区（`xqdm != 1`）的 `getJxlList` / `getZyKjs` 行为**未探测**
   （教师资源域实测全为 `xqmc=本部`）。
7. `getSzInfo` 返回大量开关（如 `spxqxslxfs`、`xqsfbt` 相关参数来自 `xtsz/getParam`），
   **各开关对本 App 的影响未评估**。
8. 线上真机（iOS/Android）**未验证** —— 本轮只做了接口层探测。

---

## 6. 对实现的决定性影响

| 结论 | 对 #1062 / #1063 的实现要求 |
| --- | --- |
| `getZyKjs` 支持 `zcStr/xqStr/jcStr/jxldm` 且为 **POST** | 教师分支改为 POST，发送经校验的时间维度参数；`filters_applied=true` 可合法取得 |
| 非法 `zcStr` 静默返回全量 191 | **客户端严格校验**周次/星期/节次；校验失败 → 明确报错，绝不发未校验值 |
| 非法 `xnxq` 返回干净 0 | 先用学期目录校验学期；否则会把「学期不存在」误报成「0 间空教室」 |
| `results=[]` 且 `total>0` 合法（越界页） | 空结果判定必须看 `total`，不能只看 `results` |
| `jyzt`/`sfqy` 恒为 `"1"`，无逐房节次 | 删除 `status:"可用"` 硬编码；可用性只由「服务端过滤生效」证明 |
| 教师资源域仅 6 栋楼 | 楼栋候选从 `getZyKjs` 结果去重导出，不用 35 栋全量、不回退学生路径 |
| `getZcXqJC` 权威解析日期↔周次 | UI 的日期/周次唯一来源；`xlksRq` 提供学期基准 |
| `getXqrqxx` 给出某周 7 天日期 | 展示「实际查询日期」的首选数据源（服务端权威，无需本地推算） |
| 真实节次时间表与 App 硬编码不符 | 纠正前端时段标签与后端自动节次逻辑 |
