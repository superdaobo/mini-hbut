## TL;DR

新建「图书馆预约」前端页面（单页 Tab：座位 / 静音仓 / 研讨室 + 我的预约），
完成视图注册、首页模块注册与三语 i18n，为 S5/S6 提供容器。

## 需求描述

用户需要一个统一的图书馆预约入口：进去后能在三类资源间快速切换，
并随时查看自己的预约。本 issue 只做**框架与接线**，不含具体业务 UI。

## 当前行为

- `components/LibraryView.vue` 已存在，但做的是**馆藏检索（OPAC）**——图书搜索、馆藏状态、封面抓取，
  与预约无关，不应混入
- `app/viewRegistry.ts` 中已有 `library` 视图注册（指向 `LibraryView.vue`）
- `config/dashboard_modules.ts` 的 `home.cat.chaoxing` 分类当前为
  `['chaoxing_hub', 'chaoxing_inbox', 'chaoxing_class']`
- i18n 词条位于 `utils/i18n/messages/{zh-CN,en,ja}.ts`

## 期望行为

- 首页「学习通」分类下出现「图书馆预约」入口
- 点击进入独立页面，顶部 Tab 可在座位 / 静音仓 / 研讨室 / 我的预约之间切换
- 页面遵循现有范式：`TPageHeader` 模板 + `useLocale()` 取词
- 三语词条齐备
- 未登录超星时展示明确引导，而不是空白或死入口

## 影响范围

| 文件 | 当前状态 |
| --- | --- |
| `apps/client/src/app/viewRegistry.ts` | 需新增视图 loader 与注册项 |
| `apps/client/src/config/dashboard_modules.ts` | `BASE_MODULES` / `MODULE_CATEGORY_DEFS` / `QUICK_ENTRY_META` 需新增条目 |
| `apps/client/src/utils/i18n/messages/zh-CN.ts` | 需新增词条 |
| `apps/client/src/utils/i18n/messages/en.ts` | 需新增词条 |
| `apps/client/src/utils/i18n/messages/ja.ts` | 需新增词条 |
| `apps/client/src/components/` | 需新增预约视图组件 |

> 注意：`role_capabilities.spec.ts` 的 `ALL_MODULE_IDS` 与 `BASE_MODULES` 对齐，
> 新增模块会影响该契约测试。

## 设计约束

- 视觉与交互沿用软件既有设计规范与组件范式，不引入新的样式体系
- 单页 Tab 形态（已确认的产品决策）
- 需适配窄屏与宽屏（项目已有 768 主断点与外壳限宽策略）

## 验收标准

- [ ] 首页「学习通」分类下出现「图书馆预约」入口，图标与配色与同类模块一致
- [ ] 点击可进入页面，四个 Tab 可切换且状态正确
- [ ] i18n 三语齐备，无硬编码中文文案
- [ ] 未登录超星时展示引导态，不出现死入口
- [ ] 宽屏（≥768px）与窄屏下布局均正常
- [ ] `npm run typecheck` 通过
- [ ] 相关契约测试（`role_capabilities.spec.ts` 等）通过

## 关联

- 父 Epic：图书馆预约三系统接入
- 依赖：S1（接口可先用契约 mock，不阻塞）
- 被依赖：S5、S6
- 勘察文档：`data/library-reserve-recon/01-api-contract.md`
