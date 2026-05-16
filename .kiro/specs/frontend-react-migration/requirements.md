# Requirements Document

## Introduction

将 Mini-HBUT（湖北工业大学教务助手）Tauri 桌面应用的前端框架从 Vue 3 + Composition API 完整迁移至 React 18+ TypeScript 技术栈。迁移范围涵盖 40+ 页面级组件、13 个 shadcn UI 组件、3 个 composables（→ hooks）、60+ 工具函数模块、自定义设计令牌系统、平台抽象层以及自定义视图导航系统。迁移后保留现有 Tailwind CSS 配置、Vite 构建管道和 Vitest 测试框架，确保功能完整性和视觉一致性不退化。

## Glossary

- **App_Shell**：应用顶层容器组件，负责全局布局、导航栏、视图切换和全局状态初始化
- **View_Component**：页面级 React 组件，对应当前 Vue 中的 `*View.vue` 文件
- **UI_Component**：基于 shadcn/ui（React 版）的基础 UI 组件（Button、Card、Dialog 等）
- **Custom_Hook**：React 自定义 Hook，对应当前 Vue composables（useChaoxingCheckin、useGeolocation、useQrScanner）
- **State_Store**：基于 Zustand 的全局状态管理模块，替代当前 Pinia store
- **Platform_Bridge**：平台抽象层（`src/platform/`），封装 Tauri 和 Capacitor 原生 API 调用
- **Design_Token_System**：设计令牌系统（`src/config/design-tokens.ts`），定义颜色、字体、间距等视觉常量
- **Navigation_System**：自定义视图导航系统，基于 React 状态管理实现视图切换（非标准路由）
- **Build_Pipeline**：Vite 5 构建管道，包含代码分割、chunk 策略和构建配置
- **Utility_Module**：`src/utils/` 下的工具函数模块，提供 API 调用、加密、缓存等通用能力

## Requirements

### 需求 1：构建系统迁移

**用户故事：** 作为开发者，我希望将 Vite 构建配置从 Vue 切换到 React，以便项目能正确编译 JSX/TSX 文件并保留现有的代码分割策略。

#### 验收标准

1. WHEN 执行 `vite build` 命令时，THE Build_Pipeline SHALL 使用 `@vitejs/plugin-react` 替代 `@vitejs/plugin-vue` 编译所有 `.tsx` 和 `.ts` 源文件，并生成构建产物至默认输出目录
2. THE Build_Pipeline SHALL 保留现有的 `manualChunks` 代码分割策略，将 React 核心库（react、react-dom）分配到 `react-core` chunk 中，并保留其余所有现有 chunk 规则（markdown、capture、debug-tools、online-learning、more-modules、runtime-bridge）不变
3. THE Build_Pipeline SHALL 保留现有的所有路径别名配置，包括 `@` 指向 `src` 目录以及 `axios` 指向 `src/utils/axios_adapter.js`
4. THE Build_Pipeline SHALL 保留现有的环境变量定义（`VITE_APP_VERSION` 从 package.json 读取版本号、`VITE_BUILD_PROFILE` 从环境变量 `MINI_HBUT_BUILD_PROFILE` 读取且默认值为 `standard`）
5. IF 构建配置中环境变量 `MINI_HBUT_BUILD_PROFILE` 值为 `release`，THEN THE Build_Pipeline SHALL 通过 esbuild 的 `drop` 选项移除所有 console 和 debugger 语句
6. THE Build_Pipeline SHALL 在 `tsconfig.json` 中将 `jsx` 选项从 `preserve` 修改为 `react-jsx`，以支持 React 17+ 的自动 JSX 转换
7. IF 构建配置中环境变量 `MINI_HBUT_BUILD_PROFILE` 值为 `dev-fast`，THEN THE Build_Pipeline SHALL 禁用 JavaScript 压缩和 CSS 压缩，并将 `chunkSizeWarningLimit` 设置为 1600KB

### 需求 2：依赖包迁移

**用户故事：** 作为开发者，我希望将项目依赖从 Vue 生态切换到 React 生态，以便使用 React 组件库和状态管理工具。

#### 验收标准

1. THE Build_Pipeline SHALL 移除以下 Vue 相关依赖：vue、vue-router、pinia、@vitejs/plugin-vue、vue-tsc、radix-vue、reka-ui、vue-sonner、@vueuse/core
2. THE Build_Pipeline SHALL 添加 React 18.x 核心依赖，其中 react 和 react-dom 作为 dependencies，@types/react 和 @types/react-dom 作为 devDependencies
3. THE Build_Pipeline SHALL 添加状态管理依赖 zustand 作为 dependencies
4. THE Build_Pipeline SHALL 添加与需求 3 中 13 个 shadcn/ui 组件对应的 @radix-ui/react-* 包（react-avatar、react-dropdown-menu、react-dialog、react-select、react-scroll-area、react-separator、react-tabs）以及 sonner 作为 dependencies
5. THE Build_Pipeline SHALL 保留所有平台相关依赖不变，包括 @tauri-apps/api、@tauri-apps/plugin-* 系列、tauri-plugin-keep-screen-on-api、@capacitor/* 系列、@transistorsoft/capacitor-background-fetch
6. THE Build_Pipeline SHALL 保留所有工具类依赖不变：class-variance-authority、clsx、tailwind-merge、marked、dompurify、html2canvas、fflate、qrcode、@microsoft/fetch-event-source
7. WHEN 依赖变更完成后执行 `npm install` 时，THE Build_Pipeline SHALL 无依赖冲突地完成安装，且 `vite build` 能成功构建产物

### 需求 3：shadcn/ui 组件迁移

**用户故事：** 作为开发者，我希望将 13 个 shadcn-vue 组件替换为 shadcn/ui React 版本，以便在 React 组件中使用一致的 UI 基础组件。

#### 验收标准

1. THE UI_Component SHALL 在 `src/components/ui/` 目录下为以下 13 个组件各提供一个子目录，每个子目录包含 React TSX 实现文件和 `index.ts` 桶导出文件：Avatar、Badge、Button、Card、Dialog、DropdownMenu、Input、ScrollArea、Select、Separator、Sheet、Sonner、Tabs
2. WHEN UI_Component 被渲染时，THE UI_Component SHALL 引用与 Vue 版本相同的 CSS 变量主题系统（`--primary`、`--secondary`、`--background`、`--foreground`、`--accent`、`--muted`、`--ring`、`--border`、`--input`、`--destructive` 等 HSL 变量），且不引入任何硬编码颜色值
3. THE UI_Component SHALL 保留现有的 `components.json` 配置中的路径别名（`@/components`、`@/lib/utils`），且 `components.json` 中 `style` 保持为 `"default"`、`typescript` 保持为 `true`、`cssVariables` 保持为 `true`
4. THE UI_Component SHALL 使用 `class-variance-authority` 的 `cva` 函数定义变体样式，使用 `tailwind-merge` 的 `twMerge` 合并类名，且每个支持变体的组件（Button、Badge、Avatar）须导出其 variants 定义和对应的 `VariantProps` 类型
5. THE UI_Component SHALL 将 `cn()` 工具函数放置在 `src/lib/utils.ts` 中，实现为 `twMerge(clsx(inputs))` 的组合调用，保持与 shadcn/ui 标准目录结构一致
6. WHEN UI_Component 的 React 版本被导入使用时，THE UI_Component SHALL 保留与 Vue 版本相同的变体选项（如 Button 组件须支持 variant: default/destructive/outline/secondary/ghost/link 和 size: default/sm/lg/icon）
7. THE UI_Component SHALL 基于 `@radix-ui/react-*` 原语构建需要无障碍交互的组件（Dialog、DropdownMenu、Select、ScrollArea、Sheet、Tabs），确保键盘导航和 ARIA 属性由 Radix 原语自动提供

### 需求 4：设计令牌系统保留

**用户故事：** 作为开发者，我希望迁移后保留现有的设计令牌系统，以便视觉风格和主题配置不发生变化。

#### 验收标准

1. THE Design_Token_System SHALL 保留 `src/config/design-tokens.ts` 文件内容不变，迁移后该文件的所有导出（colors、fontFamily、fontSize、spacing、borderRadius、letterSpacing、boxShadow）的键名与值与迁移前逐项相同
2. THE Design_Token_System SHALL 保留 `tailwind.config.ts` 中对设计令牌的引用方式不变，包括：从 `./src/config/design-tokens` 导入令牌、通过 `theme.extend` 展开令牌对象、以及通过 `hsl(var(--*) / <alpha-value>)` 格式引用 CSS 变量的动态主题色映射
3. THE Design_Token_System SHALL 保留 CSS 变量主题系统，`src/index.css` 中 `@layer base` 内的 `:root` 和 `.dark` 选择器所定义的全部 CSS 自定义属性名称及其 HSL 值与迁移前逐项相同
4. WHILE 应用处于暗色模式（HTML 根元素包含 `class="dark"`），THE Design_Token_System SHALL 使 `.dark` 选择器下定义的 CSS 变量值覆盖 `:root` 默认值，且 Tailwind 配置中 `darkMode: ['class']` 设置保持不变
5. WHEN 迁移后的 React 组件使用 Tailwind 工具类（如 `bg-primary`、`text-foreground`）引用设计令牌时，THE Design_Token_System SHALL 确保组件渲染的计算样式值与迁移前 Vue 组件使用相同工具类时的计算样式值一致

### 需求 5：状态管理迁移

**用户故事：** 作为开发者，我希望将 Pinia 状态管理替换为 Zustand，以便在 React 组件中使用轻量级的全局状态管理。

#### 验收标准

1. THE State_Store SHALL 使用 Zustand 创建全局状态 store，包含以下状态分类：认证状态（studentId、userUuid、isLoggedIn）、页面数据（gradeData、gradesOffline、gradesSyncTime）、UI 状态（currentView、activeTab、currentModule、isLoading、showLoginPrompt）、以及当前各 Vue reactive 模块（app_settings、ui_settings、font_settings、toast）对应的状态切片
2. THE State_Store SHALL 通过 zustand/middleware 的 persist 中间件将需要跨会话保留的状态切片（认证凭据、用户偏好设置、应用配置）持久化到 localStorage，使用与当前相同的 storage key 命名（如 `hbu_app_settings_v1`、`hbu_ui_settings_v1`），非持久化状态（isLoading、临时 UI 标志）不写入存储
3. WHEN 用户登录成功时，THE State_Store SHALL 更新 studentId 和认证状态，并依次触发以下副作用：启动会话保活定时器、启动电费保活定时器、启动通知监控（startNotificationMonitor）、重置云同步冷却并执行自动云同步（runAutoCloudSyncAfterLogin）、预取培养方案数据
4. WHEN 用户登出时，THE State_Store SHALL 将 studentId、userUuid、gradeData 重置为空值/空数组，停止所有活跃定时器（会话保活、电费保活、通知监控、教务恢复轮询），并移除 localStorage 中的会话相关键（session cookies、login token、login method）
5. THE State_Store SHALL 通过 Zustand 的 `getState()` 和 `setState()` API 支持在 React 组件外部（工具函数、Axios 拦截器、平台回调中）同步访问和修改状态，无需 Hook 调用
6. IF localStorage 持久化写入失败（如存储配额超限），THEN THE State_Store SHALL 保持内存中状态不受影响，静默忽略写入错误，确保应用运行不中断

### 需求 6：视图导航系统迁移

**用户故事：** 作为开发者，我希望将自定义视图切换系统迁移到 React，以便保持现有的导航模式（基于状态的视图切换而非 URL 路由）。

#### 验收标准

1. THE Navigation_System SHALL 使用 Zustand store 管理当前活动视图标识符（字符串类型，如 `'home'`、`'grades'`、`'schedule'`），并维护与现有 `MAIN_TABS` 和 `HIERARCHICAL_PARENT_VIEW_MAP` 一致的视图层级关系
2. THE Navigation_System SHALL 通过 `window.history.pushState` / `replaceState` 维护视图历史栈，最大深度不超过 50 层，与现有基于浏览器 history API 的行为一致
3. WHEN 用户点击导航项（底部 Tab 栏或页面内导航入口）时，THE Navigation_System SHALL 切换到目标视图、更新 Zustand store 中的活动视图标识符，并通过 `pushState` 将当前视图状态压入浏览器历史栈
4. WHEN 用户触发返回操作（浏览器 popstate 事件或页面内返回按钮）时，THE Navigation_System SHALL 根据 `HIERARCHICAL_PARENT_VIEW_MAP` 解析父视图并切换到该父视图；IF 当前视图为 `'home'`（根视图），THEN THE Navigation_System SHALL 不执行任何导航操作
5. THE Navigation_System SHALL 支持带参数的视图切换，通过 history state 对象传递视图参数（如 `{ module_id, preview_url }` 用于模块宿主视图），参数在目标视图组件中可通过 Zustand store 或 props 获取
6. THE Navigation_System SHALL 使用 React.lazy 和 Suspense 实现视图组件的按需加载，为每个视图组件注册独立的动态 import 加载器，与当前 `defineAsyncComponent` 行为一致
7. WHEN 视图组件加载失败时，THE Navigation_System SHALL 在视图区域显示包含错误描述的提示信息，并提供"重试"按钮（重新触发动态 import）和"返回"按钮（导航至父视图）
8. IF 视图切换的目标视图为受保护视图且用户未通过访问验证，THEN THE Navigation_System SHALL 阻止导航并显示访问验证对话框，验证通过后再完成导航
9. WHEN 应用从后台恢复（visibilitychange 事件触发 visible 状态）时，THE Navigation_System SHALL 从 `window.history.state` 恢复当前视图状态，确保视图标识符与浏览器历史记录一致

### 需求 7：页面级组件迁移

**用户故事：** 作为开发者，我希望将所有 40+ 页面级 Vue 组件迁移为 React 函数组件，以便在新框架下保持完整的功能覆盖。

#### 验收标准

1. THE View_Component SHALL 将以下所有页面级组件迁移为 React TSX 函数组件：Dashboard、GradeView、ElectricityView、ClassroomView、ScheduleView、GlobalScheduleView、CourseSelectionView、StudentInfoView、ExamView、RankingView、CalendarView、AcademicProgressView、TrainingPlanView、MeView、OfficialView、FeedbackView、NotificationView、ConfigEditor、SettingsView、ExportCenterView、MoreView、MoreShuakeView、MoreModuleHostView、MoreChaoxingCheckinView、OnlineLearningChaoxingView、OnlineLearningYuketangView、TransactionHistory、CampusCodeView、AiChatView、CampusMapView、LibraryView、ResourceShareView、LoginV3、SplashScreen、UpdateDialog、Toast、WorkspaceLayoutEditor
2. WHEN View_Component 被渲染时，THE View_Component SHALL 产生与 Vue 版本相同的 DOM 结构层级和相同的 Tailwind CSS 类名集合，且所有用户可触发的交互（点击、输入、滚动、拖拽）触发与 Vue 版本相同的状态变更和回调调用
3. THE View_Component SHALL 使用 React Hooks（useState、useEffect、useMemo、useCallback）替代 Vue Composition API（ref、computed、watch、onMounted），并使用 useEffect 的清理函数替代 onBeforeUnmount 中的资源释放逻辑
4. THE View_Component SHALL 保留所有现有的 Tailwind CSS 类名，确保样式不退化
5. WHEN View_Component 需要访问全局状态时，THE View_Component SHALL 通过 Zustand store hooks 获取状态，替代 Pinia useStore 调用
6. THE View_Component SHALL 将 Vue 的 defineProps 声明转换为 TypeScript interface 定义的 React props 类型，将 defineEmits 事件转换为回调函数 props（命名格式为 `onXxx`），将 Vue slots 转换为 React children 或具名 render prop
7. IF View_Component 在渲染过程中发生运行时错误，THEN THE View_Component SHALL 被 React Error Boundary 捕获，显示错误提示信息并提供重试操作入口，不导致整个应用崩溃
8. THE View_Component SHALL 每个组件对应一个同名 `.tsx` 文件并使用命名导出，文件内不包含任何 Vue 特定导入（vue、pinia、@vueuse/core）

### 需求 8：Composables 迁移为 Custom Hooks

**用户故事：** 作为开发者，我希望将 3 个 Vue composables 迁移为 React 自定义 Hooks，以便在 React 组件中复用签到、地理位置和二维码扫描逻辑。

#### 验收标准

1. THE Custom_Hook SHALL 将 `useChaoxingCheckin` composable 迁移为同名 React Hook，返回值包含状态字段（`activities`、`history`、`loading`、`sessionConnected`）、派生数据（`activeActivities`、`pendingOrExpired`）以及方法（`refresh`、`submitCommon`、`submitLocation`、`uploadPhoto`、`submitPhoto`、`submitQrcode`、`submitGesture`、`fetchHistory`、`parseQrUrl`、`decodeQrImage`、`captureScreenQr`、`isInflight`），各方法的参数类型和返回类型与原 composable 保持一致
2. THE Custom_Hook SHALL 将 `useGeolocation` composable 迁移为同名 React Hook，返回值包含状态字段（`available`、`loading`、`lastPosition`、`lastError`）和方法（`getCurrentPosition`），其中 `getCurrentPosition` 接受可选的 `timeout` 参数（默认 10000 毫秒）并返回 `Promise<GeoPosition>`
3. THE Custom_Hook SHALL 将 `useQrScanner` composable 迁移为同名 React Hook，返回值包含状态字段（`cameraAvailable`、`scanning`、`lastError`）和方法（`detectCamera`、`scanFromFileInput`），Hook 初始化时自动调用 `detectCamera` 检测相机可用性
4. THE Custom_Hook SHALL 使用 `useState` 替代 `ref` 管理响应式状态，使用 `useMemo` 替代 `computed` 实现派生数据，使用 `useEffect` 替代 `onMounted` 实现初始化副作用，使用 `useCallback` 包裹所有返回的方法以保证函数引用稳定
5. THE Custom_Hook SHALL 保留与 Platform_Bridge 的交互方式不变（通过 `invokeNative` 调用 Tauri 命令）
6. IF `invokeNative` 调用失败，THEN THE Custom_Hook SHALL 将错误信息写入对应的错误状态字段（`lastError` 或抛出异常），且 `useChaoxingCheckin` 在检测到 `session_expired` 或 `请先登录` 错误时将 `sessionConnected` 置为 `false`
7. WHEN 组件卸载时，THE Custom_Hook SHALL 通过 `useEffect` 清理函数移除所有已注册的事件监听器（如 `useQrScanner` 中 file input 的 change 监听）

### 需求 9：平台抽象层保留

**用户故事：** 作为开发者，我希望平台抽象层在迁移后保持不变，以便 Tauri 和 Capacitor 原生功能继续正常工作。

#### 验收标准

1. THE Platform_Bridge SHALL 保留 `src/platform/` 目录下所有文件及子目录的接口和实现不变，包括 `native.ts`、`runtime.ts`、`types.ts`、`index.ts`，以及 `adapters/`（tauri.ts、capacitor.ts、web.ts）和 `capacitor/`（widget.ts）子目录中的所有文件
2. THE Platform_Bridge SHALL 保留 `native.ts` 中 `invokeNative`、`getCurrentNativeWindow`、`exitNativeApp`、`getNativeAppVersion`、`toNativeFileSrc`、`readNativeBinaryFile` 等函数的 TypeScript 签名（参数类型、返回类型）不变，且各函数在相同运行时环境和相同输入下产生相同的返回值和相同的错误抛出行为
3. THE Platform_Bridge SHALL 保留运行时检测逻辑（`detectRuntime`），在 `window.__TAURI_INTERNALS__` 或 `tauri:` 协议存在时返回 `'tauri'`，在 Capacitor 原生桥或 `capacitor:`/`ionic:` 协议存在时返回 `'capacitor'`，其余情况返回 `'web'`
4. THE Platform_Bridge SHALL 保留 `types.ts` 中定义的 `PlatformBridge` 接口及 `index.ts` 中导出的 `platformBridge` 对象，确保其所有方法（`openHttp`、`openUri`、`getNotificationPermission`、`requestNotificationPermission`、`ensureNotificationChannel`、`sendLocalNotification`、`keepScreenOn`、`shareLinkOrFile`、`setAggressiveKeepAlive`、`getAggressiveKeepAliveState`、`openBatteryOptimizationSettings`）的签名和运行时分发逻辑不变
5. WHEN React 组件调用 Platform_Bridge 的任意导出函数时，THE Platform_Bridge SHALL 返回与迁移前 Vue 组件在相同运行时环境、相同参数下调用时类型一致且值相等的结果，且抛出相同类型的异常
6. IF 当前运行时不支持某原生操作（如在 Web 环境调用 `readNativeBinaryFile`），THEN THE Platform_Bridge SHALL 抛出包含运行时不支持说明的 Error，而非返回 undefined 或静默失败

### 需求 10：工具函数模块保留

**用户故事：** 作为开发者，我希望 60+ 工具函数模块在迁移后保持不变，以便所有业务逻辑（API 调用、加密、缓存、云同步等）继续正常工作。

#### 验收标准

1. THE Utility_Module SHALL 保留 `src/utils/` 目录下所有不含 Vue 特定导入的工具函数文件内容不变（文件内容与迁移前逐字节一致）
2. IF 工具函数中存在 Vue 特定导入（包括但不限于 `ref`、`reactive`、`watch`、`computed`、`effectScope`），THEN THE Utility_Module SHALL 移除该 Vue 依赖并改用纯 JavaScript/TypeScript 实现（如将 `reactive` 替换为普通对象、将 `ref` 替换为变量、将 `watch` 替换为回调或订阅机制），同时保持对外导出的函数和对象在调用方视角下行为等价
3. THE Utility_Module SHALL 保留所有工具函数的公开 API 签名不变（函数名、参数列表、返回值类型），确保调用方无需修改调用方式
4. IF 工具函数原先对外导出 Vue 响应式对象（如 `reactive` 对象或 `ref`），THEN THE Utility_Module SHALL 将其替换为普通 JavaScript 对象或变量，并提供等价的订阅/通知机制使调用方能感知状态变化
5. THE Utility_Module SHALL 保留 `src/utils/axios_adapter.js` 的 axios 适配器实现，维持现有的 HTTP 请求拦截和代理行为
6. WHEN 执行 `vitest run` 命令时，THE Utility_Module SHALL 确保 `src/utils/` 目录下所有现有的 Vitest 测试文件（`*.spec.ts`）全部通过且无失败用例

### 需求 11：应用入口和全局配置迁移

**用户故事：** 作为开发者，我希望将应用入口从 Vue 的 `createApp` 迁移到 React 的 `createRoot`，以便应用能正确启动并挂载到 DOM。

#### 验收标准

1. THE App_Shell SHALL 使用 `ReactDOM.createRoot` 将根组件挂载到 `#app` DOM 节点
2. THE App_Shell SHALL 在应用启动时按以下顺序执行初始化逻辑：initThemeBridge（挂载前执行以避免 FOUC）→ initDebugLogger → initUiSettings → initAppSettings → initFontSettings → 挂载根组件 → 触发延迟初始化任务（markdown runtime、debug bridge、background fetch scheduler）
3. THE App_Shell SHALL 保留 `index.html` 中的 `<div id="app">` 挂载点、`<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` favicon 引用以及 viewport meta 配置
4. THE App_Shell SHALL 保留现有的全局 CSS 导入结构：入口文件导入 `index.css`，`index.css` 通过 `@layer legacy` 导入 `style.css` 和 `ui_ux_pro_max.css`，通过 `@layer tailwind` 加载 Tailwind 指令
5. IF 启动过程中 bootstrap 函数抛出异常，THEN THE App_Shell SHALL 捕获该异常并仍然尝试将根组件挂载到 `#app` 节点，确保用户至少看到基础界面
6. IF `#app` DOM 节点在 `document` 中不存在，THEN THE App_Shell SHALL 在控制台输出错误信息且不执行挂载操作

### 需求 12：测试框架适配

**用户故事：** 作为开发者，我希望 Vitest 测试框架在迁移后能正确测试 React 组件，以便保持测试覆盖率不退化。

#### 验收标准

1. THE Build_Pipeline SHALL 在 `vitest.config.ts` 中配置 React 组件测试支持，包括：添加 `@testing-library/react` 和 `@testing-library/jest-dom` 为开发依赖，并为组件测试文件指定 `jsdom` 环境（通过 `environmentMatchGlobs` 或文件内 `@vitest-environment` 注释），同时保留现有非组件测试的 `node` 环境不变
2. THE Build_Pipeline SHALL 保留所有现有的非组件测试文件（工具函数测试、属性测试、平台测试）内容不变，且这些测试在迁移后无需修改即可通过
3. WHEN 执行 `vitest run` 命令时，THE Build_Pipeline SHALL 成功运行所有测试文件（包括 `src/**/*.spec.ts` 和 `src/**/*.spec.tsx`），所有迁移前已通过的测试用例在迁移后仍全部通过（退出码为 0）
4. THE Build_Pipeline SHALL 保留 `fast-check` 属性测试依赖和现有的属性测试用例，确保属性测试在 `node` 环境下正常执行
5. THE Build_Pipeline SHALL 在 `vitest.config.ts` 的 `test.include` 配置中同时包含 `.spec.ts` 和 `.spec.tsx` 文件模式，确保 React 组件测试文件能被自动发现和执行

### 需求 13：Tailwind CSS 配置适配

**用户故事：** 作为开发者，我希望 Tailwind CSS 配置在迁移后正确扫描 React 文件，以便所有样式类名被正确包含在构建产物中。

#### 验收标准

1. THE Build_Pipeline SHALL 更新 `tailwind.config.ts` 的 `content` 配置，移除 `vue` 扩展名，最终 content 数组为 `['./index.html', './src/**/*.{js,ts,jsx,tsx}']`
2. THE Build_Pipeline SHALL 保留 `tailwind.config.ts` 中所有自定义主题扩展，包括：colors、fontFamily、fontSize、spacing、borderRadius、letterSpacing、boxShadow、screens、ringColor、ringOffsetWidth、ringWidth
3. THE Build_Pipeline SHALL 保留 `darkMode: ['class']` 配置，确保暗色模式切换机制不变
4. THE Build_Pipeline SHALL 保留所有自定义 screen 断点配置（mobile: 320px、tablet: 768px、desktop: 1200px）
5. THE Build_Pipeline SHALL 保留 `tailwind.config.ts` 顶部对 `src/config/design-tokens` 的导入语句，确保 colors、fontFamily、fontSize、spacing、borderRadius、letterSpacing、boxShadow 令牌在构建时正确解析
6. WHEN 执行 `vite build` 完成后，THE Build_Pipeline SHALL 生成的 CSS 产物中包含源文件中使用的所有 Tailwind 工具类（即不存在因 content 配置遗漏导致的类名缺失）

### 需求 14：跨平台兼容性保留

**用户故事：** 作为开发者，我希望迁移后应用仍能在 Tauri（Windows/macOS/Linux）和 Capacitor（Android/iOS）平台上正常运行。

#### 验收标准

1. WHEN 应用在 Tauri 环境中运行时，THE App_Shell SHALL 通过 Platform_Bridge 调用以下 Tauri 插件 API 且不抛出运行时错误：@tauri-apps/plugin-fs（文件读写）、@tauri-apps/plugin-notification（通知）、@tauri-apps/plugin-shell（Shell 命令）、@tauri-apps/plugin-autostart（自动启动）、@tauri-apps/plugin-upload（文件上传）
2. WHEN 应用在 Capacitor 环境中运行时，THE App_Shell SHALL 通过 Platform_Bridge 调用以下 Capacitor 插件 API 且不抛出运行时错误：@capacitor/filesystem（文件系统）、@capacitor/browser（浏览器）、@capacitor/share（分享）、@capacitor/local-notifications（本地通知）、@capacitor/app（应用生命周期）、@capacitor/app-launcher（应用启动器）、@capacitor/preferences（偏好存储）
3. THE App_Shell SHALL 保留 `capacitor.config.ts` 中的 appId、appName、webDir 以及 server scheme 配置不变
4. WHEN 执行 `npm run cap:sync` 时，THE Build_Pipeline SHALL 以退出码 0 完成同步，且 `android/app/src/main/assets/` 和 `ios/App/App/public/` 目录中包含最新的 Web 构建产物（index.html 及 assets 目录）
5. IF 应用在非 Tauri 环境中调用 Tauri 专属 API（如 invokeNative），THEN THE Platform_Bridge SHALL 抛出包含运行时标识的错误信息，而非产生未捕获异常或静默失败

### 需求 15：渐进式迁移支持

**用户故事：** 作为开发者，我希望迁移过程支持渐进式推进，以便能分阶段验证功能正确性而非一次性全量替换。

#### 验收标准

1. THE Build_Pipeline SHALL 支持在迁移过程中同时配置 `@vitejs/plugin-vue` 和 `@vitejs/plugin-react`，使 `.vue` 和 `.tsx` 文件能在同一项目中共存并被正确编译
2. WHILE 迁移处于混合阶段（项目中同时存在未迁移的 `.vue` 文件和已迁移的 `.tsx` 文件），THE Navigation_System SHALL 通过适配器组件将 Vue 组件包装为 React 组件接口，使其可在 React 视图树中渲染，且适配器 SHALL 支持向被包装的 Vue 组件传递 props 并在组件卸载时正确销毁 Vue 实例
3. WHEN 一批组件从 `.vue` 迁移为 `.tsx` 完成后，THE Build_Pipeline SHALL 通过 `vite build` 以退出码 0 完成构建且无编译错误输出
4. WHEN 所有 `.vue` 文件已迁移为 `.tsx` 且项目中不再存在 `.vue` 源文件时，THE Build_Pipeline SHALL 移除 `@vitejs/plugin-vue`、`vue`、`vue-router`、`pinia` 及其他 Vue 相关依赖，仅保留 React 技术栈
5. WHILE 迁移处于混合阶段，THE Build_Pipeline SHALL 确保已迁移的 React 组件和未迁移的 Vue 组件各自的 HMR（热模块替换）均正常工作，修改任一类型文件后浏览器在 5 秒内完成热更新
