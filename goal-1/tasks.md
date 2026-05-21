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

- [x] 状态：完成
- 范围：两个现有游戏页面、manifest 必要字段、模块宿主适配样式。
- 目标：竖屏下无横向滚动，游戏主区域完整可见，触控按钮/手势可用，Tauri 内嵌尺寸稳定。
- 验证：测试 + Playwright/浏览器 viewport 检查 + 构建。
- 执行记录：
  - 扩展 `src/utils/website_game_modules_contract.spec.ts`，新增两个重点竖屏游戏的页面嵌入契约：必须向宿主发送 `mini-hbut:module-size`，消息包含稳定 `module_id`，入口脚本设置 `--module-vh` 动态视口变量，并监听 `orientationchange` 重新同步尺寸；样式必须声明动态视口、安全区变量、横向溢出隔离和 `overscroll-behavior`。
  - 按 TDD 执行红灯：新增契约测试后，`npx.cmd vitest run src/utils/website_game_modules_contract.spec.ts` 失败在 `jump_out_hbut` 缺少 `mini-hbut:module-size` 高度上报。
  - 修复 `website/modules-src/jump_out_hbut/project/src/main.js`：新增动态视口变量同步、宿主高度上报、`resize/orientationchange/visualViewport.resize` 监听和 `ResizeObserver` 尺寸同步；修复 `style.css` 与 `App.vue`：根容器使用动态视口、安全区变量、禁止横向溢出和页面级 overscroll，游戏容器保持触控不被滚动抢占。
  - 修复 `website/modules-src/clumsy_bird_hbut/project/src/main.js`：把已有宿主高度上报升级为统一 `MODULE_ID`、动态视口变量、方向变化/visualViewport/ResizeObserver 同步；修复 `style.css`：根容器使用动态视口和安全区 padding，canvas 区域隔离触控滚动，排行榜遮罩和上传提示避开安全区。
  - 浏览器验证中发现以 `about:blank` 作为模拟宿主会导致 iframe 进入 `chrome-error://chromewebdata`，消息通道无法验证；改用本地 HTTP 页面作为模拟宿主后，两个 iframe 均能收到 `mini-hbut:module-size` 消息。
- 验证结果：
  - 红灯命令：`npx.cmd vitest run src/utils/website_game_modules_contract.spec.ts`；结果：1 failed / 4 passed，失败点为 `jump_out_hbut 需要向宿主上报 iframe 内容高度`。
  - 绿灯命令：`npx.cmd vitest run src/utils/website_game_modules_contract.spec.ts`；结果：1 passed，5 tests passed。
  - 相邻回归命令：`npx.cmd vitest run src/utils/website_game_modules_contract.spec.ts src/utils/module_center.spec.ts`；结果：2 passed，9 tests passed。
  - 构建命令：在 `website/modules-src/jump_out_hbut/project` 执行 `npm.cmd run build`，构建通过；保留一个既有音频目录 `new URL('../assets/audio/', import.meta.url)` 构建警告。
  - 构建命令：在 `website/modules-src/clumsy_bird_hbut/project` 执行 `npm.cmd run build`，构建通过。
  - Playwright 竖屏直开验证：390×844 下 `jump_out_hbut` 页面无横向溢出，开始界面可见；点击“开始游戏”后 HUD 和 canvas 均在 390×844 内，`bodyHeight=844`，`--module-vh=8.44px`。
  - Playwright 竖屏直开验证：390×844 下 `clumsy_bird_hbut` 页面无横向溢出，header、canvas 均在视口内，canvas 尺寸为 390×585，`bodyHeight=844`，`--module-vh=8.44px`。
  - Playwright 模拟宿主 iframe 验证：390×844 iframe 中，`jump_out_hbut` 收到 3 条 `mini-hbut:module-size` 消息，`module_id=jump_out_hbut`，`height=844`；`clumsy_bird_hbut` 收到 3 条 `mini-hbut:module-size` 消息，`module_id=clumsy_bird_hbut`，`height=844`。
  - Playwright 桌面补充验证：1024×768 下两个游戏均无横向溢出；`笨鸟先飞` canvas 非空像素检查通过。`跳出湖工大` WebGL canvas 像素读取为 0，但截图和 DOM 状态确认页面并非空白，开始界面与游戏 HUD 均可见。
- 剩余风险：
  - 本轮验证使用 Chromium 模拟移动竖屏和 iframe 宿主，尚未在真实 iOS WKWebView/Tauri WebView 上截图确认。
  - `jump_out_hbut` 仍有既有音频资源加载警告和 favicon 404，不影响本轮布局目标，但后续大型检查 A 应记录并评估是否修复。
  - 本轮没有重新生成或提交 `website/public/modules` 构建产物，避免覆盖已有未提交产物改动；后续发布前需要统一构建同步。
- 下一步：
  - 执行大型检查 A：完成 Task 1-3 后，对需求偏离、构建、测试、模块宿主、竖屏 UI、触控、资源路径和已有未提交变更进行全面检查-debug循环。

## 大型检查 A：完成 Task 1-3 后执行

- [x] 状态：完成
- 检查项：需求偏离、构建、测试、模块宿主、竖屏 UI、触控、资源路径、已有未提交变更是否被误改。
- 执行记录：
  - 已重读 `AGENTS.md`、`goal-1/input.md`、`goal-1/plan.md`、`goal-1/tasks.md`，确认本轮只执行完成 Task 1-3 后的大型检查 A，不进入 Task 4。
  - 静态审计确认 `src/utils/website_game_modules_contract.spec.ts`、`src/components/MoreModuleHostView.vue`、`website/modules-src/jump_out_hbut/project/src`、`website/modules-src/clumsy_bird_hbut/project/src` 中仍保留 Task 2-3 的关键契约：`mini-hbut:module-size`、`module_id` 校验、`--module-vh` 动态视口变量、`orientationchange` 监听、安全区变量、横向溢出隔离和 `overscroll-behavior`。
  - Git 状态检查确认 Task 3 已提交为 `2c49a2c fix: stabilize game modules in mobile iframe`；当前未提交的 `website/public/modules/...` 6 个产物文件仍保持隔离，未纳入本轮检查提交。
  - Fresh 测试：执行 `npx.cmd vitest run src/utils/website_game_modules_contract.spec.ts src/utils/module_center.spec.ts --testTimeout 60000`，结果 2 个测试文件通过、9 个测试通过。
  - Fresh 构建：在 `website/modules-src/jump_out_hbut/project` 执行 `npm.cmd run build`，构建通过；仍有既有 `new URL('../assets/audio/', import.meta.url)` 音频目录运行时解析警告。
  - Fresh 构建：在 `website/modules-src/clumsy_bird_hbut/project` 执行 `npm.cmd run build`，构建通过，无新增构建警告。
  - 竖屏运行时检查：启动 `jump_out_hbut` 于 `http://127.0.0.1:5180/`、`clumsy_bird_hbut` 于 `http://127.0.0.1:5181/`，使用 Playwright 390×844 viewport 复验。
  - `jump_out_hbut` 直开验证：`scrollWidth=390`、`clientWidth=390`、`bodyHeight=844`、`--module-vh=8.44px`、`overflowX=hidden`，开始页 canvas 为 390×844；点击“开始游戏”后 canvas 仍为 390×844，HUD 为 390×64，均在视口内。
  - `clumsy_bird_hbut` 直开验证：`scrollWidth=390`、`clientWidth=390`、`bodyHeight=844`、`--module-vh=8.44px`、`overflowX=hidden`，canvas 为 390×585，header 为 390×46，均在视口内。
  - 模拟宿主 iframe 验证：在 HTTP 宿主页内嵌两个 390×844 iframe，收到 `jump_out_hbut` 与 `clumsy_bird_hbut` 的 `mini-hbut:module-size` 消息，两个模块上报高度均为 844。
  - 控制台检查：`jump_out_hbut` 仍有既有音频加载失败警告和 favicon 404；`clumsy_bird_hbut` 仅有 favicon 404。两类问题不阻断 Task 1-3 的竖屏和宿主嵌入目标，但需后续任务或最终审计时统一清理。
  - 验证后停止本轮启动的 5180/5181 Vite 进程；后续 `netstat` 输出未见 5180/5181 的 LISTENING 记录。
- 结论：
  - Task 1-3 的模块结构审计、集成契约、两个重点游戏的竖屏嵌入基础布局目前没有发现高风险回归。
  - 当前证据覆盖源码契约、相关 Vitest、两个游戏构建、Chromium 竖屏直开和 HTTP iframe 宿主消息；真实 iOS WKWebView/Tauri 设备截图仍未覆盖。
  - 当前目标整体尚未完成：`jump_out_hbut` 的穿模和建筑视觉优化，以及新增大富翁类、矿工类等多个游戏仍在后续任务中。
- 修复项：
  - 本轮未发现必须在 Task 1-3 范围内立即修复的代码问题，因此没有修改业务源码。
  - 记录后续风险：发布前需要统一处理 `website/public/modules` 产物同步；后续审计需要评估 `jump_out_hbut` 音频资源警告和两个模块 favicon 404。

## Task 4：重构“跳出湖工大”碰撞与物理稳定性

- [x] 状态：完成
- 范围：“跳出湖工大”核心游戏逻辑。
- 目标：修复穿模，建立稳定碰撞边界、速度上限、连续碰撞或分步积分策略。
- 验证：逻辑测试覆盖高速度、边界、障碍物碰撞、失败判定；手动游玩不出现高频穿模。
- 执行记录：
  - 根因定位：跳跃轨迹原先默认终点 Y 等于起跳平台顶部，目标平台更高时，角色在落地阶段可能先进入高平台/建筑体再被落点判定修正，形成视觉穿模。
  - 根因定位：`NORMAL_LANDING_THRESHOLD=1.1` 允许宽容命中，但成功后保留原始落点坐标；当落点略超出平台真实几何边界时，角色会站在边缘外侧，产生“成功但穿出平台”的视觉问题。
  - 根因定位：`JumpController.jump()` 没有防御异常 `chargePercent`，外部若传入小于 0 或大于 1 的值，会突破设计距离/速度范围。
  - 修复 `JumpController.js`：对 `chargePercent` 做 `[0,1]` 钳制；新增 `options.endY`；跳跃 Y 轴基准从起点高度线性过渡到目标平台顶部，再叠加抛物线高度，避免不同高度平台落地前穿入建筑体。
  - 修复 `GameEngine.js`：执行跳跃前计算目标平台顶部高度并传入 `JumpController`；落地成功后优先使用检测器返回的 `safePosition`，再修正 Y 到平台顶部。
  - 修复 `LandingDetector.js`：命中平台时返回 `safePosition`，将 X/Z 钳制在平台真实几何边界内，保留宽容命中的手感但消除边缘外站位。
  - 补充/修正测试：为不同高度平台落地、超大/负数蓄力输入、宽容命中边界钳制增加回归覆盖；同时把已漂移的蓄力时间、跳跃距离、方向角、落点阈值和平台距离断言对齐当前源码常量。
- 验证结果：
  - `npm.cmd test`（workdir：`website/modules-src/jump_out_hbut/project`）通过：9 个测试文件、152 个测试全部通过。
  - `npm.cmd run build`（workdir：`website/modules-src/jump_out_hbut/project`）通过；仍保留既有 `new URL('../assets/audio/', import.meta.url)` 音频目录构建警告。
  - `npx.cmd vitest run src/utils/website_game_modules_contract.spec.ts src/utils/module_center.spec.ts --testTimeout 60000` 通过：2 个测试文件、9 个测试全部通过。
  - `git diff --check -- website/modules-src/jump_out_hbut/project/src/game website/modules-src/jump_out_hbut/project/src/utils goal-1/tasks.md` 未发现空白错误，仅出现 Windows 换行提示。
  - 390×844 Playwright 竖屏运行时验证：首屏开始按钮可见；进入游戏后 `scrollWidth=390`、`clientWidth=390`、`bodyHeight=844`、`overflowX=hidden`、`--module-vh=8.44px`，canvas 为 390×844，HUD 为 390×64。
  - Playwright 控制台检查：1 个 favicon 404 和 6 个既有音效加载 warning；未发现 Task 4 物理修复导致的页面崩溃或运行时异常。
- 剩余风险：
  - 本轮修复的是跳跃路径、速度/距离输入边界和平台成功落点边界；当前项目没有实质障碍物碰撞系统，`tasks.md` 中“障碍物碰撞”只能在后续视觉/玩法任务引入障碍物后继续覆盖。
  - 浏览器验证使用 Chromium 竖屏视口，不等同于真实 iOS WKWebView/Tauri 长时间手动游玩；真实设备上的连续多局穿模仍需后续最终联调补充。
  - `jump_out_hbut` 的音频资源 warning 和 favicon 404 是既有问题，本轮记录但不在 Task 4 物理范围内修复。
- 下一步：
  - 执行 Task 5：优化“跳出湖工大”视觉资产和湖工建筑表现，改善建筑粗糙问题，并在视觉改动中继续观察平台/建筑边缘遮挡和穿插风险。

## Task 5：优化“跳出湖工大”视觉资产和湖工建筑表现

- [x] 状态：完成
- 范围：建筑绘制、背景、角色、障碍物、UI 状态。
- 目标：建筑更像湖工校园特色，不再粗糙；保持移动端性能。
- 验证：截图检查、资源路径检查、移动端帧率/交互基本流畅。
- 执行记录：
  - 审计当前建筑实现后确认主要问题：多数建筑只是基础 `BoxGeometry/CylinderGeometry` 拼接，缺少统一湖工语义、门牌/标识、细节层和平台边界提示；部分原有模型还超出平台尺寸预算，容易造成视觉穿插错觉。
  - 新增 `CampusVisualKit.js`，在 `BuildingFactory.create()` 输出时统一装饰全部 13 类建筑：湖工地标名称、校园标识牌、窗格/功能细节层、顶部安全边界线和低矮基座。
  - 收敛原有越界模型：调整工程楼侧翼、行政楼门廊、地铁站斜坡入口，使视觉边界保持在平台尺寸预算内。
  - 新增 `CampusBackdrop.js` 并接入 `SceneManager`，提供低成本校园背景层，包括南湖水面、校园跑道、道路和远景楼群，强化湖工场景识别。
  - 优化 `PlayerRenderer.js`：角色从纯橙色胶囊升级为“湖工跳跃者”，增加胸前校徽、蓝黄标识条和方向标记，mesh 数量仍保持轻量。
  - 优化 UI 状态：`GameHUD.vue`、`StartScreen.vue`、`GameOverScreen.vue` 改用文本和 CSS 状态点/标识，移除 HUD、开始页和上传失败提示中的 emoji 图标；开始页文案改为“跃过南湖与湖工地标”。
  - 新增视觉契约测试：`BuildingFactory.test.js`、`CampusBackdrop.test.js`、`PlayerRenderer.test.js`、`GameUIVisual.test.js`，覆盖建筑湖工语义/细节层/尺寸预算、背景语义、角色识别度、UI 非 emoji 状态标识。
- 验证结果：
  - 红灯验证：`npx.cmd vitest run src/renderer/buildings/BuildingFactory.test.js` 初始失败，失败点包括 `library` 缺少 `campusLandmark`，以及 `engineering` 宽度超出平台预算。
  - 红灯验证：`npx.cmd vitest run src/renderer/PlayerRenderer.test.js` 初始失败，失败点为角色缺少 `displayName=湖工跳跃者`。
  - 红灯验证：`npx.cmd vitest run src/renderer/CampusBackdrop.test.js` 初始失败，失败点为 `CampusBackdrop.js` 不存在。
  - 红灯验证：`npx.cmd vitest run src/components/GameUIVisual.test.js` 初始失败，失败点为 HUD 仍显示 `🦶/🔊` 且开始页缺少“跃过南湖与湖工地标”。
  - 绿灯验证：`npx.cmd vitest run src/components/GameUIVisual.test.js src/renderer/buildings/BuildingFactory.test.js src/renderer/PlayerRenderer.test.js src/renderer/CampusBackdrop.test.js` 通过：4 个测试文件、7 个测试全部通过。
  - 全量模块测试：`npm.cmd test`（workdir：`website/modules-src/jump_out_hbut/project`）通过：13 个测试文件、159 个测试全部通过。
  - 模块构建：`npm.cmd run build`（workdir：`website/modules-src/jump_out_hbut/project`）通过；仍保留既有 `new URL('../assets/audio/', import.meta.url)` 音频目录构建 warning。
  - 根目录契约测试：`npx.cmd vitest run src/utils/website_game_modules_contract.spec.ts src/utils/module_center.spec.ts --testTimeout 60000` 通过：2 个测试文件、9 个测试全部通过。
  - 资源/文本检查：`rg -n "[🦶🔊🔇🦘💡⚠️]" website/modules-src/jump_out_hbut/project/src` 未再命中旧 UI emoji 图标。
  - 390×844 Playwright 竖屏运行时验证：首屏显示“跃过南湖与湖工地标，按住蓄力，松开跳跃”；进入游戏后 `scrollWidth=390`、`clientWidth=390`、`bodyHeight=844`、`overflowX=hidden`、`--module-vh=8.44px`，canvas 为 390×844，HUD 为 390×65.33，HUD 文案为“跳跃 0 / 音效”，旧 emoji 图标不存在。
  - Playwright 截图：已保存 `task5-jump-mobile.png` 作为 390×844 游戏态视觉证据。
  - Playwright 控制台检查：仍只有既有音效资源加载 warning 和 favicon 404，未发现 Task 5 视觉改动导致的运行时崩溃。
  - `git diff --check -- website/modules-src/jump_out_hbut/project/src/renderer website/modules-src/jump_out_hbut/project/src/components goal-1/tasks.md` 未发现空白错误，仅出现 Windows 换行提示。
- 剩余风险：
  - 本轮截图验证使用 Chromium 竖屏视口，尚未覆盖真实 iOS WKWebView/Tauri 设备的视觉截图。
  - 校园背景和建筑装饰为低多边形程序化模型，不依赖真实照片或贴图；辨识度比原方块模型明显增强，但不是精确复刻湖工建筑。
  - `jump_out_hbut` 音频资源 warning 和 favicon 404 仍是既有问题，本轮记录但不在 Task 5 视觉资产范围内修复。
- 下一步：
  - 执行 Task 6：优化“笨鸟先飞”的页面体验和可玩性，继续覆盖竖屏、输入、难度、计分、失败/重开体验。

## Task 6：优化“笨鸟先飞”的页面体验和可玩性

- [x] 状态：完成
- 范围：“笨鸟先飞”页面布局、输入、难度、计分、失败/重开。
- 目标：竖屏可玩，节奏合理，湖工特色清晰。
- 验证：逻辑测试 + 竖屏手动/截图验证。
- 执行记录：
  - 根因定位：原 `FlappyGame` 开局不会立即生成首个障碍，玩家起飞后前 1.8 秒画面偏空，节奏反馈弱。
  - 根因定位：难度曲线散落在实例方法和 `_update()` 内部，缺少可测试的速度、间隙、生成间隔边界契约。
  - 根因定位：`main.js` 在 `onGameOver` 时才创建 `currentRunId`，排行榜提交的运行 ID 无法准确代表“一局从开始到结束”的生命周期。
  - 根因定位：页面外壳和 Canvas 提示仍使用 `🐦/🏆/👆` 等 emoji 与通用绿色管道，湖工特色不足；窄屏 header 用 flex 分布，长标题容易和分数/排行榜挤压。
  - 新增根目录回归测试 `src/utils/clumsy_bird_hbut_experience.spec.ts`，覆盖湖工主题文案、禁止旧 emoji、runId 开局生成、移动端 header 可读性、难度曲线边界、开局首个障碍、game over 点击回到 ready 状态。
  - 修复 `website/modules-src/clumsy_bird_hbut/project/src/game/FlappyGame.js`：导出 `getPipeGap()`、`getPipeSpeed()`、`getPipeSpawnInterval()` 和 `GAMEPLAY_LIMITS`；开局立即生成首个校园门柱障碍；生成间隔和速度按分数渐进并封顶；失败后点按回到 ready 且清空障碍。
  - 优化 `FlappyGame.js` Canvas 视觉：加入南湖水面、远景教学楼、HBUT 标识、校园跑道、蓝黄校门柱障碍和小鸟蓝黄围巾；准备页提示改为“穿过南湖与图书馆 / 点按屏幕起飞”，结束页提示改为“点按屏幕回到起飞准备”。
  - 修复 `website/modules-src/clumsy_bird_hbut/project/src/main.js`：页面标题改为“笨鸟先飞 · 湖工飞行训练”，排行榜标题去掉 emoji；`currentRunId` 初始化后在每次 `state === 'playing'` 时重新生成，并清理待重试上传状态，`onGameOver` 只提交本局结果。
  - 优化 `website/modules-src/clumsy_bird_hbut/project/src/style.css`：header 改为 `grid-template-columns: minmax(0, 1fr) auto auto`，标题使用省略和 `white-space: nowrap`，分数与按钮保持紧凑，避免竖屏挤出。
- 验证结果：
  - 红灯验证：`npx.cmd vitest run src/game/FlappyGame.test.js --testTimeout 60000`（模块目录内临时测试）失败于 `getPipeGap is not a function` 与开局 `pipes` 为空，证明测试捕捉到难度函数缺失和开局节奏缺口。
  - 红灯验证：`npx.cmd vitest run src/ClumsyBirdExperience.test.js --testTimeout 60000`（模块目录内临时测试）失败于标题缺少“笨鸟先飞 · 湖工飞行训练”、`currentRunId` 未在开局生成、header 样式缺少 `minmax(0, 1fr)`。
  - 绿灯验证：将测试迁入根目录 `src/utils/clumsy_bird_hbut_experience.spec.ts` 后，执行 `npx.cmd vitest run src\utils\clumsy_bird_hbut_experience.spec.ts --testTimeout 60000` 通过：1 个测试文件、6 个测试全部通过。
  - 相邻回归：`npx.cmd vitest run src\utils\website_game_modules_contract.spec.ts src\utils\module_center.spec.ts --testTimeout 60000` 通过：2 个测试文件、9 个测试全部通过。
  - 模块构建：`npm.cmd run build`（workdir：`website/modules-src/clumsy_bird_hbut/project`）通过，产物为 `dist/index.html`、CSS 和 JS bundle。
  - 竖屏运行时验证：启动 `http://127.0.0.1:5182/`，Playwright 390×844 检查首屏：`scrollWidth=390`、`clientWidth=390`、`bodyHeight=844`、header 390×46、title 文案完整、canvas 390×585、`--module-vh=8.44px`、`overflowX=hidden`、Canvas 非空像素 153600。
  - 竖屏游戏态验证：点击 Canvas 起飞后仍为 `scrollWidth=390`、`clientWidth=390`、`bodyHeight=844`、header 390×46、canvas 390×585、score 为 0、Canvas 非空像素 153600，控制台无错误，仅保留 1 条 favicon warning。
  - Playwright 截图：已保存 `task6-clumsy-bird-mobile.png` 作为 390×844 游戏态视觉证据。
  - 服务清理：本轮验证用 5182 Vite 进程已停止，后续 `Get-NetTCPConnection -LocalPort 5182` 无监听结果。
  - 依赖风险检查：曾尝试给模块本地 `package.json` 增加 `vitest`，`npm audit` 显示会扩大 Vite/esbuild 审计链；已撤回该依赖改动，最终测试使用根目录已有 Vitest，不改模块 package/lock。
  - 空白检查：`git diff --check -- website\modules-src\clumsy_bird_hbut\project\src\game\FlappyGame.js website\modules-src\clumsy_bird_hbut\project\src\main.js website\modules-src\clumsy_bird_hbut\project\src\style.css src\utils\clumsy_bird_hbut_experience.spec.ts` 未发现空白错误，仅出现 Windows 换行提示。
- 剩余风险：
  - 浏览器验证仍是 Chromium 移动视口，不等同于真实 iOS WKWebView/Tauri WebView 长时间手动游玩。
  - 本轮提升的是“笨鸟先飞”的节奏、主题和基础可玩性；排行榜接口只通过现有上下文和静态契约验证，未调用真实后端。
  - `favicon` 404 warning 仍存在，和 Task 3 检查时一致，不阻断本轮玩法体验目标。
  - `website/public/modules` 仍存在既有未提交产物改动，本轮继续隔离，未同步或提交发布产物。
- 下一步：
  - 执行大型检查 B：完成 Task 4-6 后，对跳出湖工大物理/视觉、笨鸟先飞玩法、移动端触控、构建测试、宿主集成和未提交产物隔离进行全面检查-debug循环。

## 大型检查 B：完成 Task 4-6 后执行

- [x] 状态：完成
- 检查项：游戏逻辑 bug、穿模复现、视觉质量、移动端触控、构建测试、宿主集成。
- 执行记录：
  - 已重读 `AGENTS.md`、`goal-1/input.md`、`goal-1/plan.md`、`goal-1/tasks.md`，确认本轮只执行完成 Task 4-6 后的大型检查 B，不进入 Task 7。
  - Git 状态检查确认本轮相关未提交源码只涉及 `jump_out_hbut` 的排行榜 UI、音频管理器和对应测试；既有 `website/public/modules/...` 产物改动、`.playwright-mcp` 临时文件和历史截图继续隔离，未纳入本轮提交。
  - 静态视觉审计发现 `LeaderboardPanel.vue` 仍使用 `🏆/🥇/🥈/🥉` 等 emoji，与 Task 5 的 UI 去 emoji 目标不一致；先在 `GameUIVisual.test.js` 增加排行榜面板契约测试，红灯确认后修复为文本标题、数字排名和可访问关闭按钮。
  - 构建/运行时审计发现 `AudioManager.js` 在没有 `src/assets/audio` 目录时仍用 `new URL('../assets/audio/', import.meta.url)` 构造缺失资源路径，导致构建 warning 和运行时 6 条音频加载 warning；先新增 `AudioManager.test.js`，红灯确认仍会 fetch 6 个不存在 mp3 后，改为通过 `import.meta.glob('../assets/audio/*.{mp3,wav,ogg}', { eager: true, query: '?url', import: 'default' })` 只加载实际打包资源，当前无资源时静默降级。
  - Fresh 测试：`npm.cmd test`（workdir：`website/modules-src/jump_out_hbut/project`）通过，14 个测试文件、161 个测试全部通过。
  - Fresh 根目录契约/体验测试：`npx.cmd vitest run src\utils\clumsy_bird_hbut_experience.spec.ts src\utils\website_game_modules_contract.spec.ts src\utils\module_center.spec.ts --testTimeout 60000` 通过，3 个测试文件、15 个测试全部通过。
  - Fresh 构建：`npm.cmd run build`（workdir：`website/modules-src/jump_out_hbut/project`）通过，原先的音频目录构建 warning 已消失。
  - Fresh 构建：`npm.cmd run build`（workdir：`website/modules-src/clumsy_bird_hbut/project`）通过。
  - 竖屏运行时验证：由于 5184/5185 已有占用，本轮 Vite 自动使用 `jump_out_hbut=http://127.0.0.1:5187/`、`clumsy_bird_hbut=http://127.0.0.1:5186/`；Playwright 使用 390×844 viewport 复验两个模块。
  - `jump_out_hbut` 直开验证：首屏 `scrollWidth=390`、`clientWidth=390`、`bodyHeight=844`、`overflowX=hidden`、`--module-vh=8.44px`，canvas 为 390×844，文案显示“跃过南湖与湖工地标”；进入游戏态后仍为 390×844，无横向溢出，HUD 文案为“0 / 跳跃 0 / 音效”。
  - `jump_out_hbut` 控制台检查：本轮修复后音频加载 warning 为 0，仅保留 favicon 404。
  - `clumsy_bird_hbut` 直开验证：`scrollWidth=390`、`clientWidth=390`、`bodyHeight=844`、`overflowX=hidden`、`--module-vh=8.44px`，header 为 390×46，canvas 为 390×585，canvas 非空像素检查通过；点按 canvas 进入游戏态后尺寸保持稳定。
  - `clumsy_bird_hbut` 控制台检查：仅保留 favicon 404，无新增 warning。
  - 模拟宿主 iframe 验证：在 390px 宿主页中同时嵌入两个 390×844 iframe，收到 6 条 `mini-hbut:module-size` 消息；`jump_out_hbut` 和 `clumsy_bird_hbut` 均上报 `module_id/moduleId`，高度均为 844。
  - 服务清理：停止本轮实际监听在 5186/5187 的 Vite/Node 进程，复查 5186/5187 无 LISTEN 结果；旧的 5184/5185 占用未触碰。
  - 静态 emoji 扫描：`rg -n "🐦|🏆|👆|🦶|🔊|🔇|🥇|🥈|🥉" ...` 仅剩根目录测试中的断言正则，源码未再命中旧游戏 UI emoji。
  - 空白检查：`git diff --check -- website/modules-src/jump_out_hbut/project/src/components/GameUIVisual.test.js website/modules-src/jump_out_hbut/project/src/components/LeaderboardPanel.vue website/modules-src/jump_out_hbut/project/src/services/AudioManager.js website/modules-src/jump_out_hbut/project/src/services/AudioManager.test.js` 未发现空白错误，仅有 Windows 换行提示。
- 结论：
  - Task 4-6 的物理稳定性、视觉升级、笨鸟玩法体验在本轮检查中未发现高风险回归；两个游戏均能在 390×844 竖屏下直开、进入游戏态，并通过 iframe 向宿主上报稳定高度。
  - 本轮检查发现并修复了两个真实问题：`jump_out_hbut` 排行榜遗漏 emoji 清理，以及音频资源缺失导致的构建/运行时 warning。
  - 当前目标整体尚未完成：新增湖工大富翁、矿工和额外小游戏仍在后续 Task 7-9，统一游戏中心和最终审计仍在 Task 10-11。
- 修复项：
  - `LeaderboardPanel.vue`：排行榜标题改为纯文本“排行榜”，前三名显示数字排名，关闭按钮增加 `aria-label="关闭排行榜"`。
  - `GameUIVisual.test.js`：新增排行榜面板去 emoji 视觉契约。
  - `AudioManager.js`：音效加载改为只加载 Vite 实际发现的音频资产，无资产时不请求缺失文件并静默降级。
  - `AudioManager.test.js`：新增缺失音频资源时不得 fetch、不得输出加载失败 warning 的回归测试。
  - 剩余风险：真实 iOS WKWebView/Tauri 设备长时间游玩仍未覆盖；两个游戏仍有 favicon 404；`website/public/modules` 既有产物改动仍未统一发布同步。
  - 下一步：执行 Task 7，新增湖工大富翁类游戏。

## Task 7：新增湖工大富翁类游戏

- [x] 状态：完成
- 范围：新增模块源码、manifest、catalog 接入。
- 目标：实现投骰、走格、校园地点事件、金币/绩点等湖工主题资源、胜负/重开。
- 验证：核心逻辑测试 + 模块入口可打开 + 竖屏可玩。
- 执行记录：
  - 已按 Goal Mode 重读 `AGENTS.md`、`goal-1/input.md`、`goal-1/plan.md`、`goal-1/tasks.md`，确认本轮只执行 Task 7，不进入 Task 8。
  - 设计假设：Goal Mode 禁止暂停提问，因此采用轻量自研实现，不引入不明来源开源整包；新增模块 ID 为 `hbut_monopoly`，玩法为环形校园棋盘、投骰走格、校园地点事件、金币/绩点资源、胜利/失败/重开闭环。
  - 新增 `website/modules-src/hbut_monopoly/module.json`，接入模块构建系统，模块名“湖工大富翁”，图标 `🎲`，order 为 7。
  - 新增 `website/modules-src/hbut_monopoly/project` Vite 模块，包含 `index.html`、`package.json`、`package-lock.json`、`vite.config.js`、本地空 `postcss.config.js`、`src/main.js`、`src/style.css`、`src/game/monopoly.js`。
  - 新增核心规则 `monopoly.js`：16 格湖工校园棋盘，包含校门起点、南湖、图书馆、食堂、工程楼、计算机学院、创业基地、毕设答辩等地点；实现 `createInitialState()`、`playTurn()`、`restartGame()`、确定性骰子、经过起点奖学金、金币耗尽失败、绩点达标胜利。
  - 新增页面 UI：移动端优先的 4×4 校园棋盘、金币/绩点/回合指标、骰子显示、投骰前进、重新开始、校园事件记录；触控按钮适合竖屏内嵌。
  - 新增宿主嵌入桥接：`MODULE_ID = 'hbut_monopoly'`、动态 `--module-vh`、`resize/orientationchange/visualViewport.resize` 同步、`ResizeObserver`、`mini-hbut:module-size` 高度上报。
  - 更新 `src/utils/module_center.js` 默认模块中心，加入 `hbut_monopoly` 远程模块入口。
  - 扩展 `src/utils/website_game_modules_contract.spec.ts`，把 `hbut_monopoly` 纳入游戏模块发现、默认模块中心、入口、Vite base、iOS viewport、动态视口、安全区和宿主高度上报契约。
  - 新增 `src/utils/hbut_monopoly_game.spec.ts`，覆盖棋盘地点/事件类型、投骰走格与事件结算、经过起点奖学金、绩点胜利、金币失败、重开恢复初始资源，以及竖屏 iframe 固定高度样式契约。
  - TDD 红灯：首次运行 `npx.cmd vitest run src\utils\website_game_modules_contract.spec.ts src\utils\module_center.spec.ts src\utils\hbut_monopoly_game.spec.ts --testTimeout 60000` 失败，失败点包括缺少 `hbut_monopoly` 源码模块、入口 HTML、`main.js` 和核心规则文件。
  - 运行时检查发现 390×844 下首版样式 `bodyHeight=870`，内部滚动条把 `clientWidth` 压到 375；随后增强样式契约测试并修复 CSS：根高度固定为 `calc(var(--module-vh, 1vh) * 100)`，`body` 不再用 padding 撑高页面，安全区 padding 移到 `#app`，页面级 `overflow-x/overflow-y: hidden`。
  - 构建检查发现新模块向上继承根目录 PostCSS/Tailwind 配置会产生 Tailwind content warning；新增模块本地空 `postcss.config.js` 隔离根配置，后续构建输出无该 warning。
- 验证结果：
  - 绿灯测试：`npx.cmd vitest run src\utils\website_game_modules_contract.spec.ts src\utils\module_center.spec.ts src\utils\hbut_monopoly_game.spec.ts --testTimeout 60000` 通过，3 个测试文件、14 个测试全部通过。
  - 新模块构建：`npm.cmd run build`（workdir：`website/modules-src/hbut_monopoly/project`）通过，使用锁文件后的 Vite 5.4.21，构建输出无 Tailwind warning。
  - 依赖安装验证：`npm.cmd ci --prefer-offline --no-audit --no-fund`（workdir：`website/modules-src/hbut_monopoly/project`）通过，确认发布脚本的 `npm ci` 路径可用；`node_modules/` 和 `dist/` 均被 `.gitignore` 忽略。
  - Playwright 390×844 直开验证：`http://127.0.0.1:5188/` 下 `scrollWidth=390`、`clientWidth=390`、`bodyHeight=844`、`appHeight=844`、`overflowX=hidden`、`overflowY=hidden`、`--module-vh=8.44px`、棋盘 16 格、当前位置“校门起点”，控制台 0 errors / 0 warnings。
  - Playwright 投骰交互验证：点击“投骰前进”后，骰子为 3，当前位置到“西区食堂”，金币从 320 变为 285，回合变为 1，最新事件记录显示“西区食堂: 请小队吃饭，钱包变轻。，金币-35”，页面仍保持 390×844 且无内部滚动。
  - Playwright 模拟宿主 iframe 验证：390×844 iframe 收到 3 条 `mini-hbut:module-size` 消息，`module_id/moduleId` 均为 `hbut_monopoly`，高度均为 844。
  - 服务清理：停止本轮实际监听在 5188 的 Vite/Node 进程，复查 5188 无 LISTEN 结果。
- 剩余风险：
  - 新模块是自研轻量大富翁玩法，未引入外部开源代码，因此无新增第三方玩法代码许可证风险；但视觉仍是 CSS 方格棋盘，不是复杂动画棋盘。
  - 本轮只提交源码和锁文件，不同步 `website/public/modules` 构建产物；后续发布/最终审计需要统一运行模块发布脚本并处理已有产物改动。
  - 浏览器验证仍使用 Chromium 移动视口，不等同于真实 iOS WKWebView/Tauri 设备长时间游玩。
- 下一步：
  - 执行 Task 8：新增湖工矿工类游戏。

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
