## TL;DR

首页「全部功能」新增「学习通」分组，并完成模块改名与导航注册，为后续业务页留好入口。

## 问题/需求描述

当前首页只有「教务服务 / 一码通 / 资源」三组。学习通相关能力被塞在资源里（`chaoxing_class` 显示为「学习通」），WebDAV 也叫「资料分享」，与产品规划冲突。需要先改信息架构再堆功能。

## 当前行为

- `Dashboard.vue` 中 `featureCategories` 仅三组；`chaoxing_class` 在「资源」。
- `chaoxing_class` 名称「学习通」；`resource_share` 名称「资料分享」。
- `ui_settings.ts` 的 `HomeModuleKey` / `HOME_MODULE_ORDER_DEFAULT` 未包含新模块 id。
- `App.vue` 懒加载视图映射无 `chaoxing_hub` / `chaoxing_inbox` / `teaching_eval` / `broadband` / `sports_venue`。

## 期望行为

- 分组：**教务服务**（含教学评教入口）、**学习通**、**一码通**、**资源**。
- 命名：`chaoxing_class` → **资料分享**；`resource_share` → **资源网盘**。
- 新模块 id 可导航（可先占位页）：`chaoxing_hub`、`chaoxing_inbox`、`teaching_eval`、`broadband`、`sports_venue`。
- 布局缓存中未知 id 过滤不炸；搜索词同步。

## 影响范围

| 区域 | 说明 |
|------|------|
| `src/components/Dashboard.vue` | 模块列表、分组、搜索 |
| `src/config/ui_settings.ts` | HomeModuleKey / 默认顺序 |
| `src/App.vue` | 视图注册与导航 |
| 相关 `*_contract.spec.ts` | 断言名称/顺序 |

## 验收标准

- [ ] 首页「全部功能」可见「学习通」分组
- [ ] 资源组不再出现「学习通」文案
- [ ] 「资料分享」进入原班级资料；「资源网盘」进入 WebDAV
- [ ] 新模块入口可点进占位或实现页
- [ ] 相关契约测试更新并通过
