# Goal 1 任务清单

## Task 1：审计 website 游戏模块结构

- [x] 状态：完成
- 范围：只读检查 `website`、`src` 中模块宿主、catalog/manifest、构建脚本和已有游戏源码。
- 目标：确认“跳出湖工大”“笨鸟先飞”的源码位置、产物位置、加载路径、构建命令、现有问题面。
- 验证：输出文件/行号证据，列出后续可编辑源码边界和不得覆盖的产物边界。
- 执行记录：
  - 已确认游戏模块源码统一位于 `website/modules-src/<module_id>/project`，模块元数据位于 `website/modules-src/<module_id>/module.json`。
  - 已确认现有模块包括 `hecheng_hugongda`、`jump_out_hbut`、`hbut_2048`、`clumsy_bird_hbut`、`hugongda_escape`，其中 `hugongda_escape` 在 `module.json` 中标记 `disabled: true`。
  - “跳出湖工大”源码边界：`website/modules-src/jump_out_hbut/project/src`；重点文件包括 `App.vue`、`style.css`、`game/LandingDetector.js`、`game/JumpController.js`、`game/GameEngine.js`、`game/PlatformGenerator.js`、`renderer/buildings/*`、`utils/constants.js`。
  - “笨鸟先飞”源码边界：`website/modules-src/clumsy_bird_hbut/project/src`；重点文件包括 `main.js`、`style.css`、`game/FlappyGame.js`、`utils/game_rank.js`。
  - 已确认构建脚本 `scripts/build_website_modules.mjs` 从 `website/modules-src` 读取 `module.json`，执行各模块 `npm run build`，并发布到 `website/public/modules/{main,dev,latest}`；`website/public/modules` 应按产物处理，后续不作为主要编辑源。
  - 已确认 Tauri/主应用模块宿主链路：`src/utils/module_center.js` 内置远程游戏入口，`src/components/MoreView.vue` 拉取 manifest 并调用 `prepareModuleBundle`，随后导航到 `more_module_host`，`src/components/MoreModuleHostView.vue` 使用 iframe 承载 `preview_url`。
  - 已确认当前工作区已有非本轮改动：`src/utils/remote_config.js`、`src/utils/forum_api.spec.ts`、`website/public/modules/...` 以及 `goal-1/`；本轮未回退、未覆盖这些改动。
- 验证结果：
  - `website/modules-src/jump_out_hbut/module.json`：`id=jump_out_hbut`、`entry_path=index.html`、`source_dir=project`、`order=2`。
  - `website/modules-src/clumsy_bird_hbut/module.json`：`id=clumsy_bird_hbut`、`entry_path=index.html`、`source_dir=project`、`order=4`。
  - `scripts/build_website_modules.mjs`：`SOURCE_ROOT=website/modules-src`、`OUTPUT_ROOT=website/public/modules`，发布 manifest 包含 `open_url` 和 `entry_path`，catalog 写入三个 channel。
  - `src/utils/module_center.js`：默认模块中心包含 `hecheng_hugongda`、`jump_out_hbut`、`hbut_2048`、`clumsy_bird_hbut` 四个远程模块。
  - `src/components/MoreView.vue`：`emitPreparedModuleNavigate` 组装 `module_id`、`preview_url`、`open_url`、`manifest_url`，导航到 `more_module_host`。
  - `src/components/MoreModuleHostView.vue`：iframe 容器使用 `min-height: 100dvh`、安全区 padding、`frameContentHeight` 和 postMessage 高度兜底；后续竖屏问题需要在宿主和游戏页面一起验证。
  - `website/modules-src/jump_out_hbut/project/package.json`：已有 `build`、`test`、`test:watch`，适合后续补充碰撞和集成回归。
  - `website/modules-src/clumsy_bird_hbut/project/package.json`：目前只有 `build`、`preview`，后续若要锁定逻辑需补测试脚本或上层集成测试。
  - `website/modules-src/jump_out_hbut/project/src/game/LandingDetector.js` 当前按落点相对平台 `width/depth` 做离散判定；`JumpController.js` 使用参数曲线结束后再判定，后续“穿模”需要测试高速度、边界和平台有效落点。
  - `website/modules-src/jump_out_hbut/project/src/renderer/buildings/*` 当前多数建筑由简单 `BoxGeometry/CylinderGeometry/SphereGeometry` 组合，后续视觉优化应集中在这些文件和 `utils/constants.js`。
- 剩余风险：
  - 本轮是只读审计加任务记录，没有运行浏览器截图、Tauri WebView、模块构建或单元测试。
  - iOS/Tauri iframe 的真实安全区、滚动和触控行为仍需后续 Task 2-3 用测试和竖屏 viewport 验证。
  - `website/public/modules` 存在已有未提交构建产物改动，后续构建可能继续改动这些文件，需要先锁定源码和产物同步策略。
  - “跳出湖工大”的穿模问题目前只定位到落点判定和跳跃路径风险，尚未复现具体场景。
- 下一步：
  - 执行 Task 2：建立游戏模块集成回归测试，先锁定 manifest/catalog、入口文件、资源路径、Tauri 宿主可嵌入约束和竖屏基础要求。

## Task 2：建立游戏模块集成回归测试

- [x] 状态：完成
- 范围：新增或扩展测试，覆盖游戏 manifest/catalog、入口文件、资源路径、Tauri 宿主可嵌入约束。
- 目标：先用测试锁住模块可发现、入口可加载、移动端 viewport 约束。
- 验证：先看到测试能暴露当前缺口，再实现最小修复到通过。
- 执行记录：
  - 新增根 Vitest 集成测试 `src/utils/website_game_modules_contract.spec.ts`，直接读取 `website/modules-src` 源码模块、模块中心工具和宿主 iframe 源码，覆盖模块可发现、入口文件、Vite 相对资源 base、重点竖屏游戏 viewport、安全区嵌入契约、宿主 iframe 基础约束，以及从 manifest 推导远端 `open_url`。
  - 按 TDD 执行红灯：首次运行 `npx.cmd vitest run src/utils/website_game_modules_contract.spec.ts` 失败在 `jump_out_hbut` 缺少 `viewport-fit=cover`，证明测试捕捉到 iOS/Tauri 竖屏嵌入契约缺口。
  - 对 `website/modules-src/jump_out_hbut/project/index.html` 和 `website/modules-src/clumsy_bird_hbut/project/index.html` 的 viewport meta 补充 `viewport-fit=cover`，这是让 iOS 安全区嵌入可被页面正确感知的最小修复。
  - 修正 `src/utils/module_center.spec.ts` 中已经漂移的旧断言：当前默认模块中心不再自动注入 `shuake`，但显式配置传入 `shuake` 时仍应作为 internal 模块保留，并与 catalog 远程游戏合并。
- 验证结果：
  - 红灯命令：`npx.cmd vitest run src/utils/website_game_modules_contract.spec.ts`；结果：1 failed / 3 passed，失败点为 `jump_out_hbut 需要声明 viewport-fit=cover`。
  - 绿灯命令：`npx.cmd vitest run src/utils/website_game_modules_contract.spec.ts`；结果：1 passed，4 tests passed。
  - 相邻回归命令：`npx.cmd vitest run src/utils/website_game_modules_contract.spec.ts src/utils/module_center.spec.ts`；结果：2 passed，8 tests passed。
  - Diff 检查确认本轮业务相关变更集中在新增集成测试、两个重点游戏入口 viewport 契约、`module_center.spec.ts` 测试契约修正和本 `tasks.md` 记录。
- 剩余风险：
  - 尚未运行真实浏览器或 Tauri WebView 竖屏截图；iOS 安全区、iframe 高度上报和触控体验仍需 Task 3 继续验证。
  - 尚未执行整站全量测试或模块构建；本轮只运行了 Task 2 目标相关的 Vitest 回归。
  - `website/public/modules` 仍是已有构建产物改动，本轮没有重建或同步产物，避免覆盖用户现有变更。
- 下一步：
  - 执行 Task 3：修复“跳出湖工大”和“笨鸟先飞”的 Tauri 内嵌与竖屏基础布局，并用本轮测试作为回归底线。

## Task 3：修复“跳出湖工大”和“笨鸟先飞”的 Tauri 内嵌与竖屏基础布局

- [ ] 状态：未完成
- 范围：两个现有游戏页面、manifest 必要字段、模块宿主适配样式。
- 目标：竖屏下无横向滚动，游戏主区域完整可见，触控按钮/手势可用，Tauri 内嵌尺寸稳定。
- 验证：测试 + Playwright/浏览器 viewport 检查 + 构建。
- 执行记录：
- 验证结果：
- 剩余风险：
- 下一步：

## 大型检查 A：完成 Task 1-3 后执行

- [ ] 状态：未完成
- 检查项：需求偏离、构建、测试、模块宿主、竖屏 UI、触控、资源路径、已有未提交变更是否被误改。
- 执行记录：
- 结论：
- 修复项：

## Task 4：重构“跳出湖工大”碰撞与物理稳定性

- [ ] 状态：未完成
- 范围：“跳出湖工大”核心游戏逻辑。
- 目标：修复穿模，建立稳定碰撞边界、速度上限、连续碰撞或分步积分策略。
- 验证：逻辑测试覆盖高速度、边界、障碍物碰撞、失败判定；手动游玩不出现高频穿模。
- 执行记录：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 5：优化“跳出湖工大”视觉资产和湖工建筑表现

- [ ] 状态：未完成
- 范围：建筑绘制、背景、角色、障碍物、UI 状态。
- 目标：建筑更像湖工校园特色，不再粗糙；保持移动端性能。
- 验证：截图检查、资源路径检查、移动端帧率/交互基本流畅。
- 执行记录：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 6：优化“笨鸟先飞”的页面体验和可玩性

- [ ] 状态：未完成
- 范围：“笨鸟先飞”页面布局、输入、难度、计分、失败/重开。
- 目标：竖屏可玩，节奏合理，湖工特色清晰。
- 验证：逻辑测试 + 竖屏手动/截图验证。
- 执行记录：
- 验证结果：
- 剩余风险：
- 下一步：

## 大型检查 B：完成 Task 4-6 后执行

- [ ] 状态：未完成
- 检查项：游戏逻辑 bug、穿模复现、视觉质量、移动端触控、构建测试、宿主集成。
- 执行记录：
- 结论：
- 修复项：

## Task 7：新增湖工大富翁类游戏

- [ ] 状态：未完成
- 范围：新增模块源码、manifest、catalog 接入。
- 目标：实现投骰、走格、校园地点事件、金币/绩点等湖工主题资源、胜负/重开。
- 验证：核心逻辑测试 + 模块入口可打开 + 竖屏可玩。
- 执行记录：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 8：新增湖工矿工类游戏

- [ ] 状态：未完成
- 范围：新增模块源码、manifest、catalog 接入。
- 目标：实现抓取、摆动、计分、关卡目标、湖工特色物品。
- 验证：核心逻辑测试 + 模块入口可打开 + 竖屏可玩。
- 执行记录：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 9：新增至少一个额外湖工特色小游戏

- [ ] 状态：未完成
- 范围：新增轻量游戏模块。
- 目标：补足“多做几个游戏”的范围，玩法与已有游戏差异明显，并具备可玩闭环。
- 验证：核心逻辑测试 + 模块入口可打开 + 竖屏可玩。
- 执行记录：
- 验证结果：
- 剩余风险：
- 下一步：

## 大型检查 C：完成 Task 7-9 后执行

- [ ] 状态：未完成
- 检查项：新增游戏数量、玩法差异、catalog/manifest 一致性、许可证风险、构建、移动端可玩性。
- 执行记录：
- 结论：
- 修复项：

## Task 10：统一游戏中心体验与 Tauri 宿主联调

- [ ] 状态：未完成
- 范围：模块列表、入口排序、加载状态、返回/退出、宿主 iframe 或 WebView 尺寸。
- 目标：所有游戏从 Tauri 内入口进入体验一致，竖屏下不遮挡、不溢出。
- 验证：模块列表检查、宿主页面检查、移动端 viewport 截图。
- 执行记录：
- 验证结果：
- 剩余风险：
- 下一步：

## Task 11：完整构建、测试、视觉和代码审查

- [ ] 状态：未完成
- 范围：全目标最终验证。
- 目标：完成最终最大 review，修复高风险问题，确认目标全部满足。
- 验证：测试、构建、diff、截图/浏览器检查、需求逐项审计。
- 执行记录：
- 验证结果：
- 剩余风险：
- 下一步：

## 最终完成审计

- [ ] 状态：未完成
- 要求：逐条对照 `input.md` 和 `plan.md` 的完成标准，只有证据充分时才能标记 goal complete。
- 执行记录：
- 结论：
