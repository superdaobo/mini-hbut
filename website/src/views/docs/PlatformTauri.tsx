import Link from 'next/link';

const runtimeSections = [
    {
        title: '运行时识别',
        source: 'src/platform/runtime.ts',
        items: [
            'detectRuntime 的顺序是先判断 Capacitor，再判断 Tauri，最后回退 Web。这个顺序很重要，因为移动端 WebView、loopback dev server 和 Tauri Android 都可能暴露相似的 host 或协议。',
            'hasNativeCapacitor 会读取 window.Capacitor 或 @capacitor/core，并兼容 isNativePlatform、getPlatform、platform 字段；looksLikePackagedCapacitorHost 会把移动端 loopback host 与 Capacitor bridge 组合判断。',
            'isTauriRuntime 会识别 tauri: 协议、tauri.localhost、window.__TAURI_INTERNALS__.invoke、window.__TAURI__ marker，同时明确避开 Capacitor native 与 Capacitor loopback。',
            '运行时识别依赖 WebView 注入对象、协议、host 和 userAgent。dev live reload、移动端调试代理或未来 Tauri/Capacitor 升级都可能改变判断条件，所以新增平台能力时要先核对 detectRuntime。',
        ],
    },
    {
        title: '统一桥接入口',
        source: 'src/platform/types.ts / src/platform/index.ts',
        items: [
            'src/platform/types.ts 定义 RuntimePlatform、NotifyPayload、KeepAliveState 和 PlatformBridge。PlatformBridge 是业务层可以依赖的平台能力面。',
            'PlatformBridge 目前覆盖 openHttp、openUri、getNotificationPermission、requestNotificationPermission、ensureNotificationChannel、sendLocalNotification、addNotificationActionListener、keepScreenOn、shareLinkOrFile、setAggressiveKeepAlive、getAggressiveKeepAliveState、openBatteryOptimizationSettings。',
            'src/platform/index.ts 的 pickBridge 会在每次调用 platformBridge 时动态选择 tauriBridge、capacitorBridge 或 webBridge，避免页面组件直接散落 @tauri-apps、@capacitor、navigator 和 window 判断。',
            '新增跨平台能力时，优先把稳定能力放进 PlatformBridge；只在确实是 Tauri 专属命令时才暴露为 invokeNative。',
        ],
    },
    {
        title: '原生命令门面',
        source: 'src/platform/native.ts',
        items: [
            'invokeNative 是当前统一 Tauri command 调用入口。非 Tauri 运行时会写入 debug log 并抛出“当前运行时不支持 invoke”，避免 Web 或 Capacitor 误触 Rust command。',
            'getCurrentNativeWindow 只在 Tauri 返回当前窗口对象；exitNativeApp 在 Tauri 调 exit_app，在 Capacitor 调 App.exitApp，在 Web 尝试 window.close。',
            'getNativeAppVersion 分别读取 @tauri-apps/api/app.getVersion 或 Capacitor App.getInfo；toNativeFileSrc 分别使用 convertFileSrc；readNativeBinaryFile 仅允许 Tauri 通过 @tauri-apps/plugin-fs 读取二进制文件。',
            '这层文件不是全平台万能桥。Capacitor 不能通过 invokeNative 调 Rust command，Web 也没有本地文件读取能力。',
        ],
    },
];

const adapterSections = [
    {
        title: 'Tauri adapter',
        source: 'src/platform/adapters/tauri.ts',
        items: [
            'tauriBridge.openUri 优先使用 @tauri-apps/plugin-shell.open，失败后尝试 encodeURI，再走 Rust open_external_url fallback；openHttp 直接复用 openUri。',
            '通知权限先调用 get_notification_permission_native 和 request_notification_permission_native，失败后回退 @tauri-apps/plugin-notification 的 isPermissionGranted 与 requestPermission。',
            'sendLocalNotification 优先调用 send_local_notification_native；Windows 原生路径失败后直接返回 false，避免旧 JS 通知路径“返回成功但系统不弹窗”。非 Windows 才继续尝试 @tauri-apps/plugin-notification.sendNotification。',
            'ensureNotificationChannel 使用 Tauri notification plugin 创建 Mini-HBUT 通知 channel，addNotificationActionListener 使用 onAction 注册回调。',
            'keepScreenOn 使用 tauri-plugin-keep-screen-on-api；setAggressiveKeepAlive 只是常亮插件加内存态 desktopKeepAliveActive，不是系统级后台服务。',
            'openBatteryOptimizationSettings 通过 open_external_url 尝试打开 Windows ms-settings:batterysaver-settings 或 macOS Battery Settings URL。',
        ],
    },
    {
        title: 'Capacitor adapter',
        source: 'src/platform/adapters/capacitor.ts',
        items: [
            'capacitorBridge 从 window.Capacitor.Plugins 获取插件，也会通过 registerPlugin 注册 HBUTNative。HBUTNative 是 Android 前台服务、电池优化设置等能力的自定义插件入口。',
            'openHttp 优先 @capacitor/app-launcher 的 AppLauncher.openUrl，失败后 window.open；openUri 先 AppLauncher，再尝试 Browser.open，最后 window.open。',
            '通知权限、通道、发送和动作监听来自 @capacitor/local-notifications。sendLocalNotification 默认延迟 1.5 秒，Android 可传 channelId，iOS 不传 channelId 且不启用 allowWhileIdle。',
            'shareLinkOrFile 优先 @capacitor/share 或全局 Share.share，失败后降级打开链接。',
            'keepScreenOn 没有专用 Capacitor 插件，目前只尝试 navigator.wakeLock；setAggressiveKeepAlive 在 iOS 明确返回不支持，在 Android 依赖 HBUTNative.setForegroundService。',
            'openBatteryOptimizationSettings 优先 HBUTNative.openBatteryOptimizationSettings，失败后调用 @capacitor/app 的 App.openSettings。',
        ],
    },
    {
        title: 'Web fallback',
        source: 'src/platform/adapters/web.ts',
        items: [
            'webBridge.openHttp 与 openUri 优先 window.open，失败后写 location.href。',
            '通知权限使用浏览器 Notification.permission 与 Notification.requestPermission；sendLocalNotification 只创建浏览器 Notification，只有 title 和 body。',
            'Web 没有通知 channel 和原生通知动作，ensureNotificationChannel 固定返回 true，addNotificationActionListener 固定返回 null。',
            'keepScreenOn 只尝试 navigator.wakeLock.request("screen")；shareLinkOrFile 优先 navigator.share，失败后打开链接。',
            'setAggressiveKeepAlive 和 getAggressiveKeepAliveState 明确返回不支持，openBatteryOptimizationSettings 固定 false。',
        ],
    },
];

const notificationAndWidget = [
    {
        title: '通知动作边界',
        source: 'src/platform/notification_actions.ts',
        items: [
            'ALLOWED_NOTIFICATION_TARGETS 只允许 notifications、schedule、grades、exams、electricity、classroom、home。',
            'normalizeNotificationTargetView 会去掉 hash、斜杠、查询串和片段；非法值统一回退 notifications。',
            'resolveNotificationActionTarget 同时兼容 Capacitor/Tauri payload 中 extra.view、extra.targetView、extra.target_view、root.view、root.targetView 等字段。',
            '通知点击不是任意深链入口，不能让远程 payload 直接打开未授权页面。',
        ],
    },
    {
        title: 'Widget 桥接',
        source: 'src/platform/capacitor/widget.ts',
        items: [
            'getWidgetBridge 的优先级是 Tauri Android、Capacitor、no-op。桌面 Tauri 和 Web dev 会得到 no-op 代理，调用成功不代表系统 Widget 已更新。',
            'Tauri Android 通过 invokeNative 写入 SharedPreferences 风格命令：write_widget_snapshot、write_electricity_snapshot、write_exam_snapshot、write_widget_theme_color、clear_widget_snapshot。',
            'Capacitor 环境使用 MiniHbutWidget 插件；不可用环境的 writeSnapshot、writeElectricity、writeExam、requestRefresh 都是空实现。',
            'writeSnapshot 会先执行 Ajv schema 校验，再检查 UTF-8 字节数不超过 32 KB。WidgetBridgeError 的 INVALID_SNAPSHOT 和 SNAPSHOT_TOO_LARGE 不会进入重试。',
            'writeSnapshotWithRetry 对其他错误按 250ms、1000ms、4000ms 重试。Tauri Android 的 requestRefresh 不能主动刷新系统 Widget，依赖系统周期刷新。',
        ],
    },
];

const tauriConfig = [
    {
        title: 'Tauri 配置',
        source: 'src-tauri/tauri.conf.json',
        items: [
            '产品名是 Mini-HBUT，版本 1.3.6，identifier 是 com.hbut.mini。',
            'dev 阶段执行 npm run dev，devUrl 为 http://localhost:1420；build 阶段执行 npm run build && node scripts/check_dist_boundary.mjs，frontendDist 指向 ../dist。',
            '主窗口标题是 Mini-HBUT - 湖北工业大学教务助手，默认 420 x 720，最小 380 x 600，可缩放并居中。',
            'bundle.active 为 true，targets 为 all；Windows NSIS 使用 lzma 压缩和 SimpChinese，WebView2 使用 downloadBootstrapper 且 silent。',
            'security.csp 当前是 null，这意味着 Tauri 配置层没有收紧 CSP。安全专题需要继续评估自定义 JS、模块窗口和远程内容边界。',
        ],
    },
    {
        title: 'Capability 与权限',
        source: 'src-tauri/capabilities/main.json',
        items: [
            '当前 capability 文件是 src-tauri/capabilities/main.json，不是 default.json；identifier 为 main-capability，绑定 windows: ["main"]。',
            '已授权 core:default、notification:default、notification:allow-request-permission、notification:allow-is-permission-granted、notification:allow-notify、notification:allow-create-channel、notification:allow-list-channels、shell:default、window-state:default。',
            '插件初始化和 capability 授权不是同一层。Cargo 和 builder 中接入 tauri_plugin_fs、tauri_plugin_autostart、tauri_plugin_keep_screen_on，不等于前端窗口已经拥有所有对应细粒度权限。',
            '新增前端直接调用插件 API 前，必须同时检查 package 依赖、Rust builder 初始化和 capability 权限。',
        ],
    },
    {
        title: 'Rust command 与插件',
        source: 'src-tauri/src/lib.rs / src-tauri/Cargo.toml',
        items: [
            'src-tauri/src/lib.rs 使用 #[cfg_attr(mobile, tauri::mobile_entry_point)] pub fn run() 作为移动入口；仓库里没有 src-tauri/src/mobile.rs。',
            'builder 初始化 tauri_plugin_notification、tauri_plugin_shell、tauri_plugin_fs，非移动端接入 tauri_plugin_autostart 和 tauri_plugin_window_state，移动端接入 tauri_plugin_keep_screen_on。',
            'generate_handler! 注册登录、OCR、会话、远程配置、调试桥、导出、系统外部打开、模块包、通知、教务、选课、在线学习、图书馆、电费、流水、校园码、AI、一卡通、Widget、超星签到和天气命令。',
            '平台专题重点 command 包括 open_external_url、prepare_module_bundle、open_module_bundle_window、resource_share_list_dir_native、send_local_notification_native、get_notification_permission_native、request_notification_permission_native、write_widget_snapshot、write_electricity_snapshot、write_exam_snapshot、debug_widget_paths。',
            'Cargo.toml 中的 reqwest、rusqlite、axum、tokio-tungstenite、notify-rust、rfd、jni 等说明 Rust 层同时承担网络、缓存、HTTP bridge、桌面通知、文件对话框和 Android JNI 能力。',
        ],
    },
];

const capacitorConfig = [
    'capacitor.config.ts 定义 appId 为 com.hbut.mini，appName 为 Mini-HBUT，webDir 为 dist，androidScheme 和 iosScheme 都是 https。',
    'package.json 中 Capacitor 相关依赖包括 @capacitor/android、@capacitor/ios、@capacitor/core、@capacitor/app、@capacitor/app-launcher、@capacitor/browser、@capacitor/filesystem、@capacitor/local-notifications、@capacitor/preferences、@capacitor/share、@transistorsoft/capacitor-background-fetch。',
    'package.json 中 Tauri 前端 API 依赖包括 @tauri-apps/api、@tauri-apps/plugin-autostart、@tauri-apps/plugin-fs、@tauri-apps/plugin-notification、@tauri-apps/plugin-shell、tauri-plugin-keep-screen-on-api。',
    '根脚本 cap:sync、cap:run:android、cap:open:android、cap:open:ios 都以 npm run build:web 或 npx cap 为入口；移动端前端逻辑复用 dist，而不是单独维护一套页面。',
];

const capabilityMatrix = [
    ['外链与 URI', 'Tauri: plugin-shell.open + open_external_url；Capacitor: @capacitor/app-launcher + Browser.open；Web: window.open / location.href。'],
    ['本地通知', 'Tauri: Rust native command 优先，插件兜底；Capacitor: @capacitor/local-notifications；Web: Notification API，无 action listener。'],
    ['通知动作', 'Tauri/Capacitor payload 都必须经过 resolveNotificationActionTarget 白名单归一；Web 没有原生动作监听。'],
    ['文件读取', 'readNativeBinaryFile 只允许 Tauri；Capacitor 文件能力由业务模块或插件单独处理；Web 无本地任意文件读取。'],
    ['模块包与远程内容', 'prepare_module_bundle 会下载 zip、校验 sha256、净化路径并缓存到 app cache；open_module_bundle_window 桌面端支持独立窗口，非桌面端提示使用主窗口内嵌模式。'],
    ['Widget', 'Tauri Android 通过 SharedPreferences command 写入，Capacitor 通过 MiniHbutWidget 插件，桌面/Web no-op。'],
    ['强保活', 'Tauri 桌面是 keep-screen-on + 内存状态；Capacitor iOS 不支持前台服务；Capacitor Android 依赖 HBUTNative；Web 不支持。'],
    ['后台任务', 'Rust notification.rs 存在后台循环实现，但 lib.rs 当前不启动，产品主线改为前端跨平台通知监控与移动端 background fetch。'],
];

const riskBoundaries = [
    '权限边界：src-tauri/capabilities/main.json 只授权 main 窗口的 core、notification、shell、window-state 能力；插件接入不等于所有前端 API 都可直接调用。',
    'CSP 边界：src-tauri/tauri.conf.json 中 csp 为 null，后续安全文档必须继续审计自定义 JS、模块 iframe、远程资源和调试桥。',
    '通知边界：Windows 原生通知失败会返回 false；Web 通知能力弱；Rust 后台通知循环当前没有启动，不能写成桌面后台常驻通知服务。',
    '文件边界：模块包、资料分享、字体下载和 Widget 都涉及本地写入，必须保留路径净化、hash 校验、缓存目录约束和大小限制。',
    '平台边界：Tauri Android Widget 无法主动 requestRefresh；Capacitor Android 强保活依赖 HBUTNative；iOS 前台服务不可用；Web 没有系统级后台保活。',
    '运行时边界：detectRuntime 依赖注入对象、host、protocol 和 userAgent，开发调试环境可能误导判断，新增能力必须做真实设备验证。',
];

const sourceEvidence = [
    '平台接口证据：src/platform/types.ts 的 RuntimePlatform、NotifyPayload、KeepAliveState、PlatformBridge。',
    '运行时证据：src/platform/runtime.ts 的 detectRuntime、hasNativeCapacitor、looksLikePackagedCapacitorHost、isTauriRuntime、isCapacitorRuntime。',
    '桥接门面证据：src/platform/index.ts 的 pickBridge、getRuntime、platformBridge；src/platform/native.ts 的 invokeNative、getCurrentNativeWindow、exitNativeApp、getNativeAppVersion、toNativeFileSrc、readNativeBinaryFile。',
    'adapter 证据：src/platform/adapters/tauri.ts 的 tauriBridge、tryOpenWithRustFallback、tryOpenDesktopPowerSettings；src/platform/adapters/capacitor.ts 的 capacitorBridge、getRegisteredPlugin、getHBUTNativePlugin、getLocalNotifications、openByAppLauncher；src/platform/adapters/web.ts 的 webBridge。',
    '通知和 Widget 证据：src/platform/notification_actions.ts 的 ALLOWED_NOTIFICATION_TARGETS、normalizeNotificationTargetView、resolveNotificationActionTarget；src/platform/capacitor/widget.ts 的 getWidgetBridge、WidgetBridgeError、writeSnapshot、writeSnapshotWithRetry、writeElectricitySnapshot、writeExamSnapshot、writeWidgetThemeColor、requestRefresh。',
    'Tauri 配置证据：src-tauri/tauri.conf.json、src-tauri/capabilities/main.json、src-tauri/Cargo.toml、src-tauri/src/lib.rs、src-tauri/src/modules/notification.rs、src-tauri/src/modules/module_bundle.rs。',
    'Capacitor 配置证据：capacitor.config.ts、package.json 中的 @capacitor/*、@tauri-apps/*、tauri-plugin-keep-screen-on-api 和 cap:* 脚本。',
];

const PlatformTauri = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">开发者文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                平台与 Tauri
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                本页解释 Mini-HBUT 如何在 Tauri、Capacitor 和 Web 三类运行时之间切换能力，重点覆盖运行时识别、原生桥接、
                通知与 Widget、Tauri capability、Rust command、移动端配置和权限边界。
            </p>
        </header>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">运行时识别与桥接入口</h2>
            <div className="grid gap-4 lg:grid-cols-3">
                {runtimeSections.map((section) => (
                    <article key={section.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-cyan">{section.title}</h3>
                        <div className="mt-1 text-xs leading-6 text-gray-500">{section.source}</div>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {section.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">三端 adapter 能力</h2>
            <div className="grid gap-4 lg:grid-cols-3">
                {adapterSections.map((section) => (
                    <article key={section.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-purple">{section.title}</h3>
                        <div className="mt-1 text-xs leading-6 text-gray-500">{section.source}</div>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {section.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">通知动作与 Widget 桥接</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {notificationAndWidget.map((section) => (
                    <article key={section.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                        <h3 className="text-xl font-bold text-cyan">{section.title}</h3>
                        <div className="mt-1 text-xs leading-6 text-gray-500">{section.source}</div>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {section.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">Tauri 配置、权限和 Rust command</h2>
            <div className="grid gap-4 lg:grid-cols-3">
                {tauriConfig.map((section) => (
                    <article key={section.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-white">{section.title}</h3>
                        <div className="mt-1 text-xs leading-6 text-cyan">{section.source}</div>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {section.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">Capacitor 配置</h2>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {capacitorConfig.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">能力矩阵</h2>
            <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="grid grid-cols-1 divide-y divide-white/10 md:grid-cols-[220px_1fr] md:divide-y-0">
                    {capabilityMatrix.map(([name, desc]) => (
                        <div key={name} className="contents">
                            <div className="border-b border-white/10 bg-white/[0.05] px-5 py-4 text-sm font-semibold text-cyan md:border-r">
                                {name}
                            </div>
                            <div className="border-b border-white/10 px-5 py-4 text-sm leading-7 text-gray-300">{desc}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">权限边界、风险和限制</h2>
            <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-200">
                    {riskBoundaries.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">源码证据索引</h2>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {sourceEvidence.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-2xl font-bold text-white">继续阅读</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Link href="/docs/developer" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    回到开发者架构总览，查看 App.vue、src/main.ts、组件组织和平台边界如何配合。
                </Link>
                <Link href="/docs/architecture" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    继续阅读架构与数据流，理解 API、缓存、SQLite、通知中心和 Widget 快照的数据来源。
                </Link>
                <Link href="/docs/security-privacy" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    继续阅读安全与隐私，展开 Cookie、token、CSP、远程内容、模块包和调试桥风险。
                </Link>
            </div>
        </section>
    </div>
);

export default PlatformTauri;
