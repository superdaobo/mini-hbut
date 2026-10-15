## TL;DR

为 App 接入湖北工业大学图书馆的三套超星预约系统（**座位 / 静音仓 / 研讨室**），
让用户不装微信、不开超星 App、不跳浏览器，就能查余量、预约、取消、签到。

## 背景

图书馆官网 `lib.hbut.edu.cn` 与 `opac.hbut.edu.cn` 当前均返回 **403 不可用**；
唯一可用通道是超星侧，但超星入口被"**仅限微信客户端打开**"挡住。

本次已完整勘察并验证出一条**绕开微信的纯超星 OAuth 链路**（详见各 sub-issue 的定位层），
并抓到了全部只读接口契约与配置数据。

### 微信限制的真实机制（已定位到源码级）

服务大厅 `openApp()` 拼 URL 时 `openid=` / `enc=` 写死为空 → 跳 `wx.chaoxing.com/weixin/user/jump`
→ 跳 `open.weixin.qq.com/connect/oauth2/authorize`，而它返回的是一个**纯前端 UA 检测页**：

```javascript
var isWeixin = navigator.userAgent.toLowerCase().indexOf('micromessenger') != -1;
if (!isWeixin) { /* 渲染"抱歉，出错了" */ }
```

**结论：这是交互层限制，不是需要微信身份的服务端授权。**

### 可用的绕行链路（已验证三系统全部打开成功）

```
GET https://v1.chaoxing.com/mobileSet/redirectUrlMobile?mAppId=<APP_ID>
    ↓ 302
GET https://auth.chaoxing.com/connect/oauth2/authorize?appid=...&redirect_uri=<真实系统>
    ↓ 超星登录态自动授权通过（非微信）
GET <真实系统>
```

| 应用 | mAppId | 真实系统 |
| --- | --- | --- |
| 座位预约 | `19248837` | `reserve.chaoxing.com/front/apps/seatengine/index?seatId=3597` |
| 静音仓预约 | `19261750` | `reserve.chaoxing.com/front/web/apps/reservepc/index?reserveId=24727` |
| 研讨室预约 | `19248835` | `reserve.chaoxing.com/front/web/apps/reservepc/index?reserveId=24679` |

> 服务大厅 UI 上给的是外层卡片 ID，需再解一层才到真实 appId：
> 座位 `20796755` → `19248837`；空间预约 `20832678` → `20905575` → 应用包 `id=2399219`（内含静音仓 + 研讨室）。

## 已确认的产品决策

| 决策点 | 结论 |
| --- | --- |
| 功能范围 | 三套系统全做 |
| 首页归类 | 放「学习通」分类（`home.cat.chaoxing`） |
| 实现层次 | Rust 后端模块 + 前端页面（与 `sports_venue` / `chaoxing_*` 一致） |
| 写操作 | 允许完整操作（提交预约 / 取消 / 签到） |
| 前端形态 | 单页 Tab 合一（座位 / 静音仓 / 研讨室 + 我的预约） |
| 第一版边界 | 静音仓/研讨室做完整；**座位预约先做查询**（其写接口契约尚未抓到） |
| 交付 | 分阶段多个 PR |

## 重要已知风险

1. **座位预约的选座/提交/签到接口契约尚未抓到**。其二级页面依赖超星 App 原生桥接
   （`AppUtils.openUrl` → `postNotification('CLIENT_OPEN_URL')`），纯浏览器打不开，
   裸访问 `/front/apps/seatengine/list` 返回 500「未查询到您所访问的应用」。
   补齐需在 **08:00–22:00 开放时段**内走一遍真实预约。
2. **页面使用服务端注入时间做开放判断**（`serverNow = new Date('<服务端时间>')`），
   不是浏览器时间。本地时间模拟无效，客户端校验必须以服务端时间为准。
3. **签到只能走接口**：座位预约配置 `onlySupportsApiSignIn: true`，无网页签到按钮。
4. **违约有真实后果**：预约起始后 **20 分钟内未签到**视为违约；**7 天内违约 3 次停用 3 天**；
   每日最多 3 次暂离。客户端必须做二次确认与风险提示。
5. **疑似有风控与位置校验**：`seat/captcha/type`（验证码）、`seat/add/location/log`（位置上报）、
   `seat/risk/check/config`（风控）三个接口的存在说明预约流程可能不是无感的。

## Sub-issues 总览

| # | 标题 | 依赖 |
| --- | --- | --- |
| #1052 | [Rust] 基础模块与超星凭证链路 | 无 |
| #1053 | [Rust] 静音仓/研讨室 预约接口 | S1 |
| #1054 | [Rust] 座位预约 查询接口 | S1 |
| #1055 | [前端] 页面框架、模块注册与 i18n | S1（接口可先用契约 mock） |
| #1056 | [前端] 静音仓/研讨室 预约流程 UI | S2、S4 |
| #1057 | [前端] 座位预约 查询 UI | S3、S4 |
| #1058 | [质量] 契约测试与 i18n 门闩 | 贯穿，最后收口 |

## 依赖关系

```
S1 (Rust 基础/凭证) ──┬──→ S2 (静音仓/研讨室接口) ──→ S5 (静音仓/研讨室 UI) ──┐
                      │                                                      │
                      └──→ S3 (座位预约查询接口) ──→ S6 (座位预约查询 UI) ────┤
                                                                             │
                      S4 (前端框架/注册/i18n) ────────────────────────────────┤
                                                                             ▼
                                                                    S7 (测试与门闩收口)
```

## PR 切分（按功能）

| PR | 内容 | 合入后价值 |
| --- | --- | --- |
| PR1 | S1 + S4 | 地基就绪，入口暂不暴露 |
| PR2 | S2 + S5 | **静音仓/研讨室完整可用**（第一个可交付功能） |
| PR3 | S3 + S6 | 座位预约查询可用 |
| PR4 | S7 | 契约测试与 i18n 门闩收口 |

## 验收标准（整体）

- [ ] 三个 sub-issue 组全部完成并合并
- [ ] 首页「学习通」分类下出现「图书馆预约」入口
- [ ] 静音仓/研讨室可完成「查余量 → 选时段 → 提交 → 查看我的预约 → 取消」全链路
- [ ] 座位预约可查看余量与我的预约
- [ ] 未登录超星时给出明确引导，不出现死入口
- [ ] 所有写操作有二次确认与违约风险提示
- [ ] i18n 三语（zh-CN / en / ja）齐备并通过门闩
- [ ] `npm run typecheck` 与契约测试通过

## 勘察产出

完整勘察记录已落盘（分支 `feat/seat-reservation`）：

- `data/library-reserve-recon/00-README.md` — 可达性勘察、绕行链路、三系统对照
- `data/library-reserve-recon/01-api-contract.md` — 接口契约（参数 + 响应 + 字段含义）、架构差异、写接口线索
