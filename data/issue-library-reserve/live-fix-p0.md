## TL;DR

打开「静音仓 / 研讨室」页签稳定提示「当前账号没有该预约项的权限。」，但账号明明有权限（浏览器实测同接口正常返回数据）。根因是超星在缺 `*Enc` 凭证时返回的「未查询到您所访问的应用」被错误分类成「无权限」，而 PC 侧从未获取过 `reserveIdEnc`。

## 决策点

- [ ] **新增错误类别 vs 复用现有类别**：缺凭证既不是「无权限」也不是「网络不可达」。是新增一个可判别类别（如「凭证/入口失效，可重试」），还是归入现有的「非预期响应」？前者前端能给出准确引导，后者改动最小但文案仍偏笼统。

## 问题描述

用户上报：在图书馆预约页面「打开其他接口时」显示「当前账号没有该预约项的权限」，提示被超星拒绝，但本地抓包显示账号有该权限、浏览器也能正常进入。这是**误报**，且误导性强——用户会以为自己的账号被图书馆禁用了。

实测确认这是两个事实叠加的结果：

1. 超星在缺少 `*Enc` 凭证时返回的是「**应用未找到**」而不是「无权限」；
2. 现有分类逻辑把这句话当成「无权限」，并且 `no_permission` 语义上告诉用户「重新登录无用」。

## 当前行为

### 1）超星对「缺凭证」的响应（实测）

| 请求 | 响应 |
| --- | --- |
| `GET /data/apps/seatengine/index?seatId=3597`（不带 `seatIdEnc`） | `HTTP 200 {"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}` |
| `GET /data/apps/seatengine/index?seatId=3597&seatIdEnc=b146028eafa4eea9` | `HTTP 200 {"data":{"seatConfig":{…},"curReserves":[],"nearReserves":[]},"success":true}` |
| `POST /data/apps/reserve/info`（不带 `reserveIdEnc`） | `HTTP 200 {"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}` |
| `POST /data/apps/reserve/info`（带 `reserveIdEnc`） | `HTTP 200 {"data":{"reserveData":{…}},"success":true}` |

即：**只差一个 `*Enc` 参数，服务端从「应用未找到」变成正常数据**。

### 2）误判发生的位置

`apps/client/src-tauri/src/modules/library_reserve.rs:1227-1242` 的 `looks_like_no_permission` 中，
`"未查询到您所访问的应用"` 被列为**强特征**，命中即返回 `true`：

```
1229:    const STRONG: [&str; 2] = ["未查询到您所访问的应用", "应用不存在"];
1230:    if STRONG.iter().any(|m| body.contains(m)) { return true; }
```

该函数在 `read_api_response`（同文件 `:556`）里**先于 JSON 解析**执行，因此正常的业务错误响应
被直接转成 `no_permission`；前端 `zh-CN.ts:1598` 的 `library.reserve.error.noPermission` 即
「当前账号没有该预约项的权限。」，与用户所见完全一致。

另外 `:1233` 的 `if status == 403 { return true; }` 无条件把 403 判为无权限，而 403 也可能来自
风控 / 来源校验等与权限无关的原因。

### 3）为什么 PC 侧必然缺 `reserveIdEnc`

入口链实测（`GET https://v1.chaoxing.com/mobileSet/redirectUrlMobile?mAppId=<APP_ID>` 的 302）：

```
座位   19248837 → redirect_uri = /front/apps/seatengine/index?seatId=3597&enc=…&fidEnc=…&uid=…&mappIdEnc=…&formid=3597&wfwEnc=…&appKey=…
静音仓 19261750 → redirect_uri = /front/apps/reserve/item/index?reserveId=24727&resvAppId=24727&enc=…&fidEnc=…&uid=…&mappIdEnc=…&formid=24727&wfwEnc=…&appKey=…
研讨室 19248835 → redirect_uri = /front/apps/reserve/item/index?reserveId=24679&resvAppId=24679&…同上…
```

**链路里没有 `seatIdEnc`，也没有 `reserveIdEnc`**（二者由落地页 HTML 服务端注入）。

| 模块 | 是否从落地页取得 `*Enc` | 结果 |
| --- | --- | --- |
| 座位 `library_reserve_seat.rs:211 fetch_page_hints` | 有 | 抓得到，座位查询正常 |
| PC `library_reserve_pc.rs:338` | **无** | `reserve_id_enc` 恒为 `None` → 每次调用都缺参 → 稳定误报 |

落地页原始 HTML 中这两个值确实存在（实测片段）：

- 座位页：`operateData('data/apps/seatengine/index', {seatId: seatId, seatIdEnc: 'b146028eafa4eea9'})`
- 静音仓页：`reserveIdEnc: '838c48dae07db28c', fidEnc: fidEnc} doRequest('data/apps/reserve/item/list/time'…)`

## 期望行为

- 缺 `*Enc`（或凭证失效）时，界面提示应指向**凭证 / 入口解析失败并可重试**，不得表述为「账号没有权限」，也不得暗示「重新登录无用」。
- 静音仓 / 研讨室的业务接口应在登录态正常时正常返回数据（不再稳定报无权限）。
- 403 不应无条件等同「无权限」。

---

## 影响范围

| 文件 | 行号 | 当前状态 |
| --- | --- | --- |
| `apps/client/src-tauri/src/modules/library_reserve.rs` | 1227-1242 | `looks_like_no_permission` 强特征含「未查询到您所访问的应用」；403 无条件判无权限 |
| `apps/client/src-tauri/src/modules/library_reserve.rs` | 537-574 | `read_api_response` 先跑该启发式再解析 JSON |
| `apps/client/src-tauri/src/modules/library_reserve.rs` | 77-84, 130-132 | `ERR_NO_PERMISSION` 常量与 `no_permission()`（`can_relogin=false`） |
| `apps/client/src-tauri/src/modules/library_reserve_pc.rs` | 318, 338-346, 363-372 | 只从链路取 `reserve_id_enc`，缺失时仅记日志并继续请求 |
| `apps/client/src-tauri/src/modules/library_reserve_seat.rs` | 211-247 | 座位侧的页面注入参数抓取（PC 侧缺同类能力） |
| `apps/client/src/utils/i18n/messages/{zh-CN,en,ja}.ts` | `library.reserve.error.*` | 错误类别 → 文案映射；Rust `ERR_*` 与前端映射有回归门闩 |

## 触发/复现方式

1. 在 App 中登录融合门户（超星登录态有效）。
2. 进入「图书馆预约」，切到**静音仓**或**研讨室**页签。
3. 观察提示：稳定显示「当前账号没有该预约项的权限。」（实为缺 `reserveIdEnc`）。
4. 对照：在浏览器中打开同一预约项页面，接口（带 `reserveIdEnc`）返回正常数据。

## 验收标准

- [ ] 缺 `*Enc` 的响应（`未查询到您所访问的应用`）不再被归类为 `no_permission`
- [ ] 登录态正常时，静音仓 / 研讨室页签不再出现「当前账号没有该预约项的权限。」
- [ ] 静音仓页签能取到预约项详情与可预约时段
- [ ] 403 判定不再无条件等同「无权限」
- [ ] 新增单测覆盖：`未查询到您所访问的应用` 不判 `no_permission`；403 且正文无特征词不判 `no_permission`
- [ ] Rust `ERR_*` 全部类别均有前端文案映射（回归门闩通过）
- [ ] `cargo test --lib library_reserve` 全绿、`cargo fmt --all -- --check` 无 diff、`npm run typecheck` 通过

## 关联

- 父单：Epic（本 Epic）
- Epic #1051
- 证据文档：`data/library-reserve-recon/02-live-verification-2026-10-16.md`
