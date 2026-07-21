## TL;DR

增强电费页（融合电量统计）、提供缴电费链接/二维码，并新增教育网网费与运动场馆预约入口（官方跳转，非内嵌支付）。

## 问题/需求描述

一码通手机端有电量查询统计、缴电费、网费、场馆等；App 仅有余额/电量查询与交易记录，缴费与扩展生活服务缺失。

## 当前行为

- `ElectricityView` + `/server/utilities/location|account`：余额、电量、状态；无统计图、无缴费入口。
- 手机端 appList 含：`electric`、`broadband`、`电量查询` third、`运动场馆` third（见 `docs/feature-inventory/03-yimatong-features.md`）。
- 一码通 token / 电费 token 已有缓存路径。

## 期望行为

- 电费页：概览卡 + 统计区（有数据时）+「缴纳电费」生成官方 URL 与二维码。
- 网费：查询信息 + 缴纳跳转/二维码（同模式）。
- 场馆：经一码通 third open 打开；失败提示校园网。
- **不**在 App 内完成资金支付。

## 影响范围

- `ElectricityView.vue`、`modules/electricity.rs`、`http_client/electricity.rs`
- 新：`BroadbandView`、`SportsVenueView` 或通用第三方打开
- `one_code` third open

## 验收标准

- [ ] 电费页可刷新余额/电量；统计区无数据可隐藏
- [ ] 缴电费可展示链接与二维码
- [ ] 网费、场馆入口可用或失败可读
- [ ] 主题/暗色适配
