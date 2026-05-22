import { Link } from 'react-router-dom';

const bootLayers = [
    {
        title: '入口层：先稳定首屏，再延迟重任务',
        source: 'src/main.ts',
        items: [
            'src/main.ts 是 Vue 应用入口。mountApp 创建 Vue 实例，注册全局 IOSSelect，然后把 App.vue 挂载到 #app。',
            'bootstrap 在挂载前调用 initThemeBridge，提前把主题 CSS 变量写入 :root，避免首次绘制时出现无样式闪烁。',
            'bootstrap 同步初始化 initDebugLogger、initUiSettings、initAppSettings、initFontSettings，确保调试日志、UI 偏好、后端设置和字体设置在业务页面读取前已经进入可用状态。',
            'runDeferredInitializers 在首屏之后执行本地图标字体、Markdown 运行时、后台通知检查和调试桥初始化，降低 Android 首次安装和低端设备上的白屏风险。',
            'initBackgroundFetchScheduler 会把后台任务统一接到 runNotificationCheck，通知检查失败只记录警告，不阻断应用启动。',
            'initDebugBridgeClient 只会在 Tauri 运行时且 get_debug_runtime_config 返回 enableBridgeTools 时加载，避免普通运行环境暴露调试桥能力。',
        ],
    },
    {
        title: '视图调度层：App.vue 是单页工作台',
        source: 'src/App.vue',
        items: [
            'src/App.vue 不是普通路由表，而是一个显式状态机。currentView 决定当前页面，activeTab 维护底部主 Tab，viewRenderNonce 用于必要时强制重建视图。',
            'createAsyncPage 基于 defineAsyncComponent 包装所有大页面，VIEW_PREFETCHERS 记录每个 view 对应的异步加载函数，降低首包压力。',
            'MAIN_TABS 固定为 home、schedule、forum、notifications、me；ME_SUB_VIEWS 把 official、feedback、config、settings、export_center、more、more_module_host、more_chaoxing_checkin 归到我的页体系。',
            'HIERARCHICAL_PARENT_VIEW_MAP 明确返回链路，例如 official 回到 me，more_module_host 回到 more。没有显式父级的功能页默认回到 home。',
            'goToView 会先调用 ensureProtectedViewAccess，受保护页面如果没有访问授权，会弹出访问提示而不是直接切换。',
            'goToViewInternal 负责记住 homeScrollSnapshot、切换 currentView、写入 history snapshot，并在返回首页时恢复滚动位置。',
            'resolveParentView、goToParentView、handleBackToDashboard 构成返回模型：模块返回父级，首页返回恢复滚动，而不是粗暴重置到页面顶部。',
            'handleNavigate 统一处理子组件发出的导航目标。进入 more_module_host 前会持久化 moduleHostSession 并修复模块宿主会话；进入 grades 前如果没有成绩数据，会先尝试 fetchGradesFromAPI。',
            'replaceHistorySnapshot、pushHistorySnapshot、syncFromHash 让窗口历史、hash 快照和当前视图保持一致，支持刷新、深链、Widget 入口和返回按钮协同工作。',
        ],
    },
];

const componentGroups = [
    {
        title: '业务页面组件',
        source: 'src/components',
        desc: 'src/components 下的 GradeView、ScheduleView、Dashboard、ForumView、MoreView、SettingsView 等页面组件直接承载用户功能。App.vue 通过 currentView 分支渲染它们，并用 @navigate、@back、props、事件回调串联页面。',
    },
    {
        title: '模板组件',
        source: 'src/components/templates',
        desc: 'src/components/templates 提供 TPageHeader、TCard、TEmptyState、TStatusBadge、TSection、TActionBar 等业务模板。它们比基础 UI 更接近 Mini-HBUT 的页面语义，适合沉淀重复的标题区、状态区、空态区和操作栏。',
    },
    {
        title: '基础 UI 组件',
        source: 'src/components/ui',
        desc: 'src/components/ui 主要是 shadcn-vue 风格的 Button、Card、Dialog、Sheet、Select、Tabs、DropdownMenu、ScrollArea 等无业务组件。它们负责交互原语，不应直接绑定教务、通知或模块中心数据。',
    },
    {
        title: '组合式能力',
        source: 'src/composables',
        desc: 'src/composables/useChaoxingCheckin.ts、src/composables/useGeolocation.ts、src/composables/useQrScanner.ts 把超星签到、定位和二维码扫描拆出页面组件，避免签到弹窗里混入平台探测、权限和扫描状态机。',
    },
];

const designSources = [
    'src/config/ui_settings.ts 定义 UiPreset、WorkspaceLayout、HomeWidgetKey、HomeModuleKey、NotificationCardKey 和默认模块顺序，是首页布局、通知卡片顺序、主题、密度、图标风格的配置源。',
    'src/config/design-tokens.ts 提供 colors、fontFamily、fontSize、spacing、borderRadius、letterSpacing、boxShadow 等基础设计 token，适合作为新增组件的视觉起点。',
    'src/utils/ui_settings.ts 负责读取 hbu_ui_settings_v2、规范化配置、注入 customCss/customJs、写入 data-theme/data-ui-card/data-ui-nav/data-ui-density 等运行时属性。',
    'src/utils/theme-bridge.ts 把 UI_PRESETS 转成 CSS 变量，并在 initThemeBridge 阶段提前注入，确保主题切换无需 Tailwind 重新编译。',
    'src/styles/main.css 是基础 reset、原子样式和旧页面骨架；src/styles/dark-mode.css 负责夜间模式覆盖；src/styles/ui_ux_pro_max.css 根据 data-ui-* 属性接管高级材质、密度、导航和卡片形态。',
];

const platformBoundaries = [
    {
        title: '统一接口',
        source: 'src/platform/types.ts',
        items: [
            'RuntimePlatform 明确运行时只有 tauri、capacitor、web 三类。',
            'PlatformBridge 统一 openHttp、openUri、getNotificationPermission、requestNotificationPermission、ensureNotificationChannel、sendLocalNotification、addNotificationActionListener、keepScreenOn、shareLinkOrFile、setAggressiveKeepAlive、getAggressiveKeepAliveState、openBatteryOptimizationSettings。',
            '前端业务应依赖 platformBridge 或 invokeNative 包装层，避免在页面组件里散落 @tauri-apps、@capacitor 或 navigator API 判断。',
        ],
    },
    {
        title: '运行时识别',
        source: 'src/platform/runtime.ts',
        items: [
            'detectRuntime 先识别 Capacitor，再识别 Tauri，最后回退 web。',
            'Capacitor 判断同时读取 Capacitor.isNativePlatform、getPlatform、loopback host 和移动端 userAgent；Tauri 判断会避开移动 WebView，并兼容 __TAURI_INTERNALS__.invoke。',
            '这层逻辑决定后续 platformBridge 选 tauriBridge、capacitorBridge 还是 webBridge。',
        ],
    },
    {
        title: '桥接选择',
        source: 'src/platform/index.ts',
        items: [
            'platformBridge 每次调用前都会 pickBridge，因此运行时差异集中在 adapters 中，而不是扩散到业务页面。',
            'tauriBridge 优先走 Rust native command 和 Tauri 插件；capacitorBridge 走 Capacitor LocalNotifications、Share、AppLauncher 等插件；webBridge 使用浏览器 Notification、WakeLock、navigator.share 或降级打开链接。',
            'WidgetBridge 位于 src/platform/capacitor/widget.ts，Tauri Android 通过 invokeNative 写入快照，Capacitor 原生插件可用时走插件，Web/不可用环境使用 no-op 代理。',
        ],
    },
    {
        title: '原生命令入口',
        source: 'src/platform/native.ts',
        items: [
            'invokeNative 是当前统一 Tauri command 调用入口。非 Tauri 运行时会记录 debug log 并拒绝调用，避免 Web 环境误触原生命令。',
            'getNativeAppVersion、exitNativeApp、toNativeFileSrc、readNativeBinaryFile 把 Tauri、Capacitor、Web 差异收在同一个文件中。',
            '新增原生能力时，优先判断它属于通用 PlatformBridge 能力，还是只应该暴露为 Tauri 专用 invokeNative。',
        ],
    },
];

const readingPath = [
    ['架构与数据流', '/docs/architecture', '继续展开 API、缓存、状态恢复、SQLite、通知和 Widget 数据关系。'],
    ['平台与 Tauri', '/docs/platform-tauri', '继续展开 Tauri command、Rust modules、HTTP client、Capacitor/Web 能力矩阵。'],
    ['模块系统', '/docs/module-system', '继续展开 module_center、more_modules、manifest、iframe 宿主和 website/modules-src 构建链。'],
    ['构建发布', '/docs/build-release', '继续展开根项目脚本、website 构建、Tauri 打包、Capacitor 同步、release manifest 和 hot bundle。'],
    ['安全与隐私', '/docs/security-privacy', '继续展开 Cookie、密码、token、SQLite、云同步、自定义 JS、调试桥和热更新边界。'],
];

const sourceEvidence = [
    '入口证据：src/main.ts 的 bootstrap、initThemeBridge、initUiSettings、initAppSettings、initFontSettings、runDeferredInitializers、initBackgroundFetchScheduler、runNotificationCheck、initDebugBridgeClient。',
    '视图证据：src/App.vue 的 createAsyncPage、defineAsyncComponent、MAIN_TABS、ME_SUB_VIEWS、HIERARCHICAL_PARENT_VIEW_MAP、VIEW_PREFETCHERS、goToView、goToViewInternal、ensureProtectedViewAccess、resolveParentView、goToParentView、handleNavigate、handleBackToDashboard、replaceHistorySnapshot、pushHistorySnapshot、syncFromHash。',
    '组件证据：src/components、src/components/templates、src/components/ui、src/composables/useChaoxingCheckin.ts、src/composables/useGeolocation.ts、src/composables/useQrScanner.ts。',
    '样式证据：src/config/ui_settings.ts、src/config/design-tokens.ts、src/utils/ui_settings.ts、src/utils/theme-bridge.ts、src/styles/main.css、src/styles/dark-mode.css、src/styles/ui_ux_pro_max.css。',
    '平台证据：src/platform/types.ts、src/platform/runtime.ts、src/platform/index.ts、src/platform/native.ts、src/platform/adapters/tauri.ts、src/platform/adapters/capacitor.ts、src/platform/adapters/web.ts、src/platform/capacitor/widget.ts。',
];

const DeveloperOverview = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">开发者文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                开发者架构总览
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                本页是维护 Mini-HBUT 的第一站，先说明入口层、视图调度层、组件组织层、设计与样式基座、平台边界层的职责。
                后续专题再继续深入数据流、Tauri/Rust、模块系统、构建发布与安全隐私。
            </p>
        </header>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">整体分层</h2>
            <div className="grid gap-4 lg:grid-cols-2">
                {bootLayers.map((layer) => (
                    <article key={layer.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                        <div className="mb-4 border-b border-white/10 pb-3">
                            <h3 className="text-xl font-bold text-cyan">{layer.title}</h3>
                            <div className="mt-1 text-xs leading-6 text-gray-500">
                                <strong className="text-gray-300">源码证据：</strong>{layer.source}
                            </div>
                        </div>
                        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {layer.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">组件组织层</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {componentGroups.map((group) => (
                    <article key={group.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-white">{group.title}</h3>
                        <div className="mt-1 text-xs text-cyan">{group.source}</div>
                        <p className="mt-3 text-sm leading-7 text-gray-300">{group.desc}</p>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">设计与样式基座</h2>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {designSources.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">平台边界层</h2>
            <div className="grid gap-4 lg:grid-cols-2">
                {platformBoundaries.map((boundary) => (
                    <article key={boundary.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                        <div className="mb-4 border-b border-white/10 pb-3">
                            <h3 className="text-xl font-bold text-purple">{boundary.title}</h3>
                            <div className="mt-1 text-xs leading-6 text-gray-500">
                                <strong className="text-gray-300">源码证据：</strong>{boundary.source}
                            </div>
                        </div>
                        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {boundary.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">开发阅读顺序</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {readingPath.map(([title, href, desc]) => (
                    <Link key={href} to={href} className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50">
                        <div className="mb-2 text-lg font-semibold text-cyan">{title}</div>
                        <p className="text-sm leading-7 text-gray-300">{desc}</p>
                    </Link>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">源码证据索引</h2>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {sourceEvidence.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
        </section>
    </div>
);

export default DeveloperOverview;
