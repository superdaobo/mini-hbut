# 图书馆预约 · 线上接口实测验证（2026-10-16）

> 验证方式：MCP 浏览器（Playwright 有头 Chrome，已登录超星）+ 宿主机 curl（用 App 自己的 Cookie 快照复现入口链）
> 验证账号：学生 `2510231106`（超星 uid `406591160`，图书馆 fid `25285`）
> 结论：**两个上报现象均已定位到根因**，另有 2 个附加契约错误。以下每条都带实测证据。

---

## 一、入口链路（实测，与 App 常量一致）

```
GET https://v1.chaoxing.com/mobileSet/redirectUrlMobile?mAppId=<APP_ID>
  → 302 https://auth.chaoxing.com/connect/oauth2/authorize?appid=<APP>&redirect_uri=<真实系统>?<凭证>
  → 302 <真实系统>?...&code=<一次性>&state=25285
```

| 应用 | mAppId | redirect_uri 指向 | 落地路径 |
| --- | --- | --- | --- |
| 座位预约 | `19248837` | `/front/apps/seatengine/index?seatId=3597` | `/front/apps/seatengine/index` ✅ 与 `system_path()` 一致 |
| 静音仓 | `19261750` | `/front/apps/reserve/item/index?reserveId=24727&resvAppId=24727` | 服务端再跳 `/front/web/apps/reservepc/index` ✅ |
| 研讨室 | `19248835` | `/front/apps/reserve/item/index?reserveId=24679&resvAppId=24679` | 同上 ✅ |

链路携带的凭证（实测原值结构）：

```
seatId=3597 & enc=3efcb238a7f6beed95a11530b27d5825 & fidEnc=c7450f13f8a0e9ab
& uid=406591160 & mappIdEnc=7b341141c24560dd92773ffdcfcd150a & formid=3597
& wfwEnc=9C32209DB3CDFF7CC351BD42FF5C8270 & mappId=19248837
& appId=0be8aa201f084dc2b6956535f906f0ce & appKey=vd4jK704487si06c & code=… & state=25285
```

> ⛔ **链路里没有 `seatIdEnc`，也没有 `reserveIdEnc`** —— 这两个参数由落地页 HTML 服务端注入，
> 不在跳转链上。这与勘察结论一致，但**只有座位模块实现了「去页面抓一次」**（见 §三）。

---

## 二、凭证缺失时超星的响应（bug 2 的直接触发源）

实测（浏览器会话有效、参数只差一个 `*Enc`）：

| 请求 | 响应 |
| --- | --- |
| `GET /data/apps/seatengine/index?seatId=3597`（**无** seatIdEnc） | `200 {"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}` |
| `GET /data/apps/seatengine/index?seatId=3597&seatIdEnc=b146028eafa4eea9` | `200 {"data":{"seatConfig":{…107字段…},"curReserves":[],"nearReserves":[]},"success":true}` |
| `POST /data/apps/reserve/info`（**无** reserveIdEnc） | `200 {"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}` |
| `POST /data/apps/reserve/info`（**有** reserveIdEnc） | `200 {"data":{"reserveData":{…}},"success":true}` |

**即：缺凭证 ≠ 无权限，而是「应用未找到」。但超星给这条错误用的文案，恰好被 App 当成「无权限」。**

---

## 三、bug 2 根因：`未查询到您所访问的应用` 被误判为 `no_permission`

判定链（逐行可核对）：

1. `apps/client/src-tauri/src/modules/library_reserve.rs:1229`
   ```rust
   const STRONG: [&str; 2] = ["未查询到您所访问的应用", "应用不存在"];
   if STRONG.iter().any(|m| body.contains(m)) { return true; }   // ← 命中即「无权限」
   ```
2. 同文件 `:556` `read_api_response` 在解析 JSON **之前**先跑该启发式 → 返回
   `LibraryReserveError::no_permission("调用「{path}」被超星拒绝（HTTP 200）：当前账号可能没有该应用权限")`
3. 前端 `library.reserve.error.noPermission` = **「当前账号没有该预约项的权限。」**（zh-CN.ts:1598）
   —— 与用户所见文案完全一致
4. 且 `no_permission` 恒带 `can_relogin=false`（:131），UI 语义变成「重新登录也没用」，把用户引向错误方向

### 为什么「其他接口」必然缺凭证（触发条件）

| 模块 | 是否去落地页抓 `*Enc` | 结果 |
| --- | --- | --- |
| 座位 `library_reserve_seat.rs:211 fetch_page_hints` | ✅ 有 | 抓得到 → 座位查询正常 |
| 静音仓/研讨室 `library_reserve_pc.rs:338` | ❌ **无** | 恒为 `None` → **每次调用都缺 `reserveIdEnc` → 必然 no_permission** |

实测证据（两处都确认过）：

- 座位页原始 HTML：`…operateData('data/apps/seatengine/index', {seatId: seatId, seatIdEnc: 'b146028eafa4eea9'})…`
- 静音仓页原始 HTML：`…reserveIdEnc: '838c48dae07db28c', fidEnc: fidEnc} doRequest('data/apps/reserve/item/list/time'…)…`

→ **修复方向明确**：把座位模块的 `fetch_page_hints` 抽到地基模块，PC 侧落地页抓 `reserveIdEnc`
（`reserveIdEnc` 实测稳定，与勘察期同值，说明并非短时效）。

---

## 四、bug 1 相关：座位数据与服务端一致，「我的预约」端点用错

### 4.1 座位侧：服务端确实是空

- `seatengine/index`（带正确 seatIdEnc）→ `curReserves: []`、`nearReserves: []`
- 官方座位页自身也显示 **「当前预约：暂无预约 / 最近预约：空」**（已截图）
- Rust→IPC→前端字段链路核对无误（`transport/tauri/library_reserve.rs:462` 返回 `currentReservations`，
  前端 `ReserveSeatPanel.vue:143` 读同名字段）
- 失败时会走 `v-else-if="error"` 错误卡，**不会**静默变空态

→ **该账号当前没有座位预约**；空态是真实数据的正确呈现。

### 4.2 「我的预约」用的是错误端点（真 bug）

| | App 现用 | 实测正确 |
| --- | --- | --- |
| 我的预约 | `POST /data/apps/reserve/latest/data` | `POST /data/apps/reservepc/user/histroy` |
| 取消预约 | `POST /data/apps/reserve/del/form/aprv`（未验证） | 页面引用 `data/apps/reserve/item/user/cancel` |

实测：

```
POST /data/apps/reserve/latest/data  {reserveId,reserveIdEnc,fidEnc}
→ 400  HTML 错误页：errorMsg: Required request parameter 'itemId' for method parameter type Integer is not present
   （该端点不是列表接口，需要 itemId；勘察期只是从 JS 静态提取，从未实测）

POST /data/apps/reservepc/user/histroy {reserveId:24727,resvAppId:24727,reserveIdEnc:838c48dae07db28c,fidEnc:c7450f13f8a0e9ab}
→ 200 {"data":{"totalRow":1,"totalPage":1,"rows":[ … 1 条 … ]}}
```

**该账号确实有 1 条静音仓记录**（研讨室 `totalRow=0`）：

```json
{"id":29589158,"itemId":49136,"name":"4号静音仓","today":"2026-07-11",
 "starttime":1783760400000,"endtime":1783767600000,"status":2,"isCancel":0,
 "reserveDuration":206000,"remark":"讨论问题","aprvId":0,"reserveId":24727}
```

→ **字段映射也对不上**：`ReserveMinePanel.vue:44 normalizeItem` 期待
`itemName / date / startTime / endTime / statusName / aprvId`，真实字段是
`name / today / starttime(ms) / endtime(ms) / status(数字) / id / itemId`，且 `aprvId` 恒为 0。
即使换成正确端点，也要同时改字段映射与取消参数（`aprvId` → `id`/`itemId`）。

---

## 五、其它实测发现（供修复参考）

- **服务端时间字段确实是 `serverNow`**：`POST /data/apps/reserve/special/rule` → `{"data":{"serverNow":1792149829247}}`（Unix 毫秒）。
  座位页则以内联 JS 注入 `serverNow = new Date('2026-10-16T19:08:05.992+08:00')`。两者 App 都能取到（`SERVER_TIME_KEYS` 已含 `serverNow`）。
- `POST /data/apps/reserve/verify/reserveuser/status` → `{"msg":"预约记录不存在","success":false}`（当前无进行中预约）。
- 页面真实引用的端点集（比 App 现用契约更全）：
  `reservepc/user/histroy`、`reserve/item/user/cancel`、`reserve/verify/reserveuser/status`、
  `reserve/special/rule`、`reserve/form/getuserinfo`、`reservepc/team/verify`、`reserve/team/out`、
  `seatengine/{index,identity/verify,room/info,check/exist,dialog,unlock/qrcode}`。
- **App 的 LibraryReserve 日志不落盘**：`runtime_log.rs` 只进内存环形缓冲（3000 条）+ `eprintln!`。
  因此 `%LOCALAPPDATA%\com.hbut.mini\logs\mini-hbut.log` 里查不到任何 LibraryReserve 记录——
  后续取证要么看前端调试窗 / bridge，要么先给 runtime_log 加落盘。
- 环境提示：MCP 浏览器解析 `v1.chaoxing.com` 失败（`ERR_NAME_NOT_RESOLVED`，宿主机正常）。
  绕过办法：直接用 `auth.chaoxing.com/connect/oauth2/authorize?...` 起链，或在宿主机用 curl + 登录 Cookie 复现。

---

## 六、修复建议（按优先级）

| 优先级 | 改动 | 位置 |
| --- | --- | --- |
| P0 | 把「未查询到您所访问的应用 / 应用不存在」从 `no_permission` 强特征里**移出**，改判为「凭证缺失或失效」新类别（`credential_invalid` / `unexpected_response`），并允许重试/重新解析入口 | `library_reserve.rs:1229` |
| P0 | 抽出 `fetch_page_hints` 到地基模块，**PC 侧也去落地页抓 `reserveIdEnc`**（缺失时补一次，仍缺则明确报「凭证未取到」而不是「无权限」） | `library_reserve_pc.rs:338`、`library_reserve.rs` |
| P0 | `looks_like_no_permission` 的 `status == 403` 无条件判无权限**过宽**（403 也可能是风控/来源校验），建议要求正文同时命中特征词 | `library_reserve.rs:1233` |
| P1 | 「我的预约」端点改为 `reservepc/user/histroy`，并按其真实字段映射（`name/today/starttime/endtime/status/isCancel/id/itemId`） | `library_reserve_pc.rs:82`、`ReserveMinePanel.vue:44` |
| P1 | 取消端点与参数核对 `reserve/item/user/cancel`（**写操作，需授权后单独验证**） | `library_reserve_pc.rs:88` |
| P2 | 给 `runtime_log` 增加落盘（或至少在 LibraryReserve 关键路径落文件），否则真机问题无法取证 | `runtime_log.rs` |
| P2 | 更新勘察契约文档：补 `redirect_uri` 不含 `*Enc` 的事实、`reserve/latest/data` 需 `itemId`、新增端点清单 | `data/library-reserve-recon/01-api-contract.md` |

---

## 七、尚未验证 / 风险

1. **写路径**（选座、提交、签到、取消）本次**未调用**（只读验证），契约仍缺。
2. 「我的预约」当前只有 1 条**历史**记录（2026-07-11，`status=2`，未取消），无进行中预约，
   因此**未能验证 `curReserves`/`nearReserves` 非空时的字段解析**是否正确。
3. `reserve/latest/data` 的 `itemId` 语义未追（不确定它是否真与「我的预约」无关）。
4. 座位 `seatIdEnc`（`b146028eafa4eea9`）与 `reserveIdEnc`（`838c48dae07db28c`）跨天同值，
   倾向**稳定值**而非短时效，但仍建议每次实时抓取（当前实现即如此）。
