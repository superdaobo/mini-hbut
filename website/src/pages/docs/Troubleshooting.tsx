import { Link } from 'react-router-dom';

const quickFlow = [
    {
        title: '先判断范围',
        items: [
            '只有一个模块异常时，优先在对应页面刷新、切换筛选项、重新选择学期或房间；多个教务模块同时失败时，先判断是否是教务系统维护或登录会话问题。',
            '只有桌面端异常时，检查 Tauri、HTTP Bridge、系统通知、文件导出和 WebView2；只有移动端异常时，检查 Capacitor 权限、后台白名单、系统电池策略和 iOS 证书。',
        ],
    },
    {
        title: '再看状态文案',
        items: [
            '出现会话过期、登录失效、验证码识别失败、教务系统维护、离线、sync_time、请求超时、权限被拒绝等文案时，不要直接清空数据，先保留现场。',
            '有离线缓存时，页面一般会继续显示旧数据并附带 sync_time；没有缓存时，首次请求失败只能重试或重新登录。',
        ],
    },
    {
        title: '最后收集证据',
        items: [
            '用户反馈前先进入设置 → 调试日志，筛选 Error 或 Warn，复制最近日志；进入问题反馈页时也可以点击复制最近 error。',
            '开发者复现前先记录平台、版本、账号登录方式、触发页面、网络环境、是否启用云同步、是否存在远程配置覆盖和完整复现步骤。',
        ],
    },
];

const installIssues = [
    {
        title: 'Windows SmartScreen',
        problem: 'Windows 首次安装或运行时提示未知发布者、SmartScreen 拦截。',
        actions: [
            '确认安装包来自发布页或可信下载源。',
            '点击“更多信息”后选择“仍要运行”。',
            '如果 WebView2 安装失败，重新联网安装或使用系统组件修复后再启动。',
        ],
    },
    {
        title: 'macOS 无法验证开发者',
        problem: 'macOS 打开应用时提示无法验证开发者或应用已损坏。',
        actions: [
            '在系统设置的隐私与安全性中允许打开 Mini-HBUT。',
            '必要时对 App 执行 xattr -cr 清理隔离属性。',
            '如果仍打不开，重新下载完整 dmg，避免半包或浏览器拦截造成损坏。',
        ],
    },
    {
        title: 'Linux WebKit2GTK',
        problem: 'Linux AppImage 或 deb 启动失败，常见原因是系统缺少 WebKit2GTK 运行库。',
        actions: [
            'Debian/Ubuntu 系发行版优先安装 libwebkit2gtk-4.1-0。',
            'AppImage 需要执行权限，可通过 chmod +x 处理。',
            '如果命令行启动有缺依赖提示，先补齐系统包再反馈。',
        ],
    },
    {
        title: 'Android 覆盖安装',
        problem: 'Android 更新后担心数据丢失，或安装失败。',
        actions: [
            '同一包名的新版 APK 可直接覆盖安装，通常保留本地登录态、缓存和设置。',
            '安装失败时检查签名是否来自同一发布渠道；签名不一致时系统会拒绝覆盖。',
            '通知不准或后台任务中断时，将 Mini-HBUT 加入后台白名单并关闭过度省电限制。',
        ],
    },
    {
        title: 'iOS 证书',
        problem: 'iOS 侧载后无法打开、证书过期或闪退。',
        actions: [
            '在 VPN 与设备管理中信任开发者证书。',
            '个人 Apple ID 签名通常有有效期限制，过期后需要重新签名安装。',
            'SideStore、LiveContainer 或其他容器异常时，先确认容器本身可运行，再重新导入应用。',
        ],
    },
];

const loginIssues = [
    {
        title: '验证码识别失败',
        items: [
            '验证码识别依赖 OCR 端点，连续失败时先刷新验证码，再检查设置中的后端和 OCR 配置。',
            '远程配置可能切换 OCR 服务；如果所有端点都不可用，可以手动输入验证码。',
            '验证码图片来自学校登录页，教务系统维护或返回异常页面时，OCR 可能识别到错误内容。',
        ],
    },
    {
        title: '会话过期与自动重登',
        items: [
            '教务 Cookie 过期后，部分命令会返回会话过期、登录失效或需要重新登录。',
            'Mini-HBUT 会尝试自动重登，自动重登依赖内存中的 last_password 或已保存的会话信息；密码变更、账号锁定或验证码失败会使自动重登失败。',
            '手动重新登录前先确认校园网/VPN 可用，再刷新目标页面。',
        ],
    },
    {
        title: 'portal_qr_temp 临时登录',
        items: [
            'portal_qr_temp 适合临时扫码使用，不保存密码，当前会话失效后需要重新扫码。',
            '临时会话可能无法覆盖所有需要完整 CAS、教务、学习通或一卡通票据的功能。',
            '公共电脑使用后应退出登录，并清理浏览器 localStorage、Cookie 快照和本地应用数据。',
        ],
    },
    {
        title: '学习通关联',
        items: [
            '学习通关联失败时，先确认学习通账号已经绑定学校和学号。',
            '学号通常应是 10 位数字；如果学习通账号无法解析学号，建议改用统一身份认证或融合门户登录。',
            '学习通 Cookie 与教务 Cookie 是不同作用域，关联成功也不代表所有教务接口都已授权。',
        ],
    },
];

const dataIssues = [
    {
        title: '教务系统维护',
        source: 'src/utils/api.js',
        items: [
            '前端会用 looksLikeMaintenanceIssue 判断 timed out、维护、暂不可用、连接失败等文本，并写入 hbu_jwxt_maintenance、hbu_jwxt_maintenance_time、hbu_jwxt_maintenance_hint。',
            '维护期间教务类缓存键可能显示离线缓存。离线缓存带 offline 和 sync_time，只能说明数据来自上次成功请求。',
            '维护结束后重新打开页面或手动刷新；如果 hbu_jwxt_maintenance 长时间残留，先完成一次成功请求再判断是否仍异常。',
        ],
    },
    {
        title: '离线缓存与容量',
        source: 'src/utils/api.js',
        items: [
            'fetchWithCache 会先读内存和 localStorage 的 cache:*，网络失败时可能用 withOfflineMeta 包装旧数据。',
            'localStorage 写入遇到 QuotaExceeded 时，会调用 trimLocalCacheStorage 清理旧 cache:* 条目，再尝试写入。',
            '首次使用没有缓存时，离线模式不会凭空生成数据；用户看到空状态不一定是 bug。',
        ],
    },
    {
        title: '成绩/课表不是最新',
        source: 'AcademicServices.tsx / src/utils/api.js',
        items: [
            '成绩、课表、考试、排名、校历等模块会使用缓存减少重复请求。需要最新数据时，优先手动刷新或切换学期触发重新请求。',
            '如果页面显示 sync_time，说明当前数据来自缓存或后端离线兜底，不代表教务系统实时状态。',
            '课表预热、Widget 快照和通知检查也会消费缓存，用户应先确认主页面数据已刷新。',
        ],
    },
    {
        title: '全校课表没有结果',
        source: 'GlobalScheduleView.vue / AcademicServices.tsx',
        items: [
            '先减少筛选条件，只保留学年学期或关键字段，再逐步增加院系、专业、教师、课程名。',
            '筛选条件组合过窄、教务维护、学期不匹配或公共缓存过期都可能导致空结果。',
            '如果 qxzkb_public_cache 存在旧数据，页面可能显示离线兜底；否则需要等待远端恢复。',
        ],
    },
];

const featureIssues = [
    {
        title: '电费查询失败',
        items: [
            '首次使用需要完成校区、楼栋、楼层、房间选择；通知中心也依赖这个房间信息检查低余额。',
            '电费查询涉及 SSO token、电费 token 和 refresh token，过期后会尝试刷新；刷新失败时重新登录更可靠。',
            '照明用电和空调用电是两个查询维度，单边失败时先确认房间选择和学校服务状态。',
        ],
    },
    {
        title: '资料分享连接失败',
        items: [
            '资料分享依赖远程配置中的 WebDAV endpoint、用户名和密码。',
            '连接失败时先检查网络、校园网/VPN、远程配置是否加载成功，以及 WebDAV 服务是否临时不可用。',
            '图片预览、PDF 预览、Office 在线预览和直链下载是不同链路，某一种失败不代表全部文件不可用。',
        ],
    },
    {
        title: 'AI 助手无响应',
        items: [
            '校园助手依赖远程 AI 服务、本地会话、一码通 token 或 AI token。初始化失败时先查看设置中的后端状态。',
            '文件上传受大小和格式限制，20 MB 以上文件或不支持的格式会被拒绝。',
            '远程模型列表来自远程配置，模型暂时不可用时可切换模型或稍后重试。',
        ],
    },
    {
        title: '导出 ICS',
        items: [
            '课表 ICS 导出后需要使用支持 .ics 的日历应用导入。',
            '桌面端通常保存到用户选择的路径，移动端更依赖系统分享能力。',
            '导入后时间不对时，先确认学期开始日期、周次、课程节次和日历应用时区。',
        ],
    },
];

const notificationIssues = [
    '通知权限未授权时，runNotificationCheck 不能真正发送系统通知；用户需要在通知中心或系统设置中允许通知。',
    'Android 需要后台白名单、允许自启动或关闭过度省电限制；iOS Background Fetch 由系统调度，无法保证准点。',
    'hbu_notify_snapshot:${studentId} 保存通知检查快照，fallbackSnapshot 可在检查失败时回显上次状态。',
    '成绩通知使用 hbu_notify_grade_signature 去重；通知重复推送时，先确认是否装了多个版本、是否多设备登录同一账号、是否清空了去重缓存。',
    'syncBackgroundFetchContext 会把学号、API base、通知开关、提前分钟数和周期同步给后台任务；后台异常时先核对这些上下文是否最新。',
];

const cloudSyncIssues = [
    '云同步失败时，先看设置页的 hbu_cloud_sync_status:*，它记录 lastUploadOk、lastDownloadOk、lastUploadError、lastDownloadError 等状态。',
    'cloud_sync.js 对上传和下载都有 cooldown。短时间连续点击可能返回 cooldown，并带 remainingMs。',
    'requestCloudSync 会先获取 challenge，再在请求里带 x-cloud-sync-challenge；401 后会强制刷新 challenge 重试一次。',
    '学号不是 10 位数字、远程配置关闭、endpoint 缺失、secretRef 不匹配、网络失败或服务端返回错误都会阻断同步。',
    '关闭云同步只阻止后续同步，不代表已经清理远端历史数据；需要删除远端数据时应按服务端能力单独处理。',
];

const debugAndFeedback = [
    {
        title: '设置 → 调试日志',
        items: [
            'src/utils/debug_logger.ts 会把 console 和部分 HTTP 请求记录到 hbu_debug_logs_v1，并广播 hbu-debug-log-updated。',
            'SettingsView.vue 的调试页支持按 Debug、Info、Warn、Error、Log 过滤，支持清空和复制日志。',
            '复制前应检查日志是否包含学号、Cookie、Authorization、token、验证码或个人信息；公开反馈时先脱敏。',
        ],
    },
    {
        title: '复制最近 error',
        items: [
            'FeedbackView.vue 会读取最近 200 条调试日志，只筛选 level=error 的记录。',
            '问题反馈页可复制反馈链接、复制最近 error 或复制单条 error。',
            '反馈材料清单至少包含平台、版本、登录方式、问题页面、复现步骤、最近 error、网络环境和是否启用云同步。',
        ],
    },
];

const maintenanceScripts = [
    ['debug_capture_ui.mjs', '通过 BRIDGE_BASE、DEBUG_TOKEN、DEBUG_VIEW、DEBUG_SELECTOR、DEBUG_FILENAME 等参数请求 /debug/navigate、/debug/open_module 和 /debug/screenshot。'],
    ['run_tauri_debug_dev.mjs', '检查 Vite 1420 和 Bridge 4399 端口状态，Windows 下调用 run_tauri_debug_dev.ps1，非 Windows 下设置 HBUT_DEBUG_ENABLE_BRIDGE_TOOLS=true。'],
    ['test_debug_bridge_contract.mjs', '启动本地 mock HTTP 服务，验证 debugCustomScheduleUpsert、debugCaptureCurrentPage、Authorization Bearer 和错误返回。'],
    ['test_hot_update_framework.mjs', '验证热更新 manifest 归一化、sha256、verifyHotBundleSignature、版本兼容、staged/current/rollback 状态。'],
    ['test_more_module_bridge.mjs', '联调模块 catalog、manifest、package_sha256、/module_bundle/prepare、本地 preview_url 和真实模块特征。'],
    ['test_resource_share_network.mjs', '检查资源分享网络、WebDAV 认证和远端目录/文件访问。'],
    ['scripts/check_dist_boundary.mjs', '检查 dist 顶层白名单和 forbiddenSegments，避免 modules、website、app-resources 进入桌面包。'],
    ['scripts/guard_sensitive_uploads.mjs', '扫描 libsql、JWT、HuggingFace、Resend、Bearer token 和敏感环境变量，适合提交或反馈材料前检查。'],
    ['scripts/check-frontend-safety.mjs', '扫描前端裸调 chaoxing.com、console.log 敏感字段和超星签到硬编码延迟。'],
    ['scripts/check-design-tokens.mjs', '扫描签到模块样式硬编码颜色，作为 UI 维护检查的一部分。'],
];

const maintenanceChecklist = [
    '先复现问题并记录最小路径：页面、点击顺序、账号登录方式、网络环境、平台和版本。',
    '用户问题优先跑 website 的文档契约和构建，确认排错文档仍可访问；开发脚本问题再跑对应专项脚本。',
    '桌面调试桥问题先确认 127.0.0.1:4399 是否启动、debug.enable_bridge_tools 是否开启、DEBUG_TOKEN 是否一致。',
    '热更新问题先检查 manifest 必填字段、sha256、signature、版本范围和 staged/current/rollback 状态。',
    '模块问题先检查 catalog.json、manifest.json、package_url、package_sha256、bundle.zip 和 preview_url。',
    '反馈材料进入公开渠道前运行或人工执行敏感信息检查，移除 Cookie、Authorization、token、二维码和学号以外的个人隐私。',
];

const sourceEvidence = [
    '旧 FAQ 证据：website/src/pages/docs/FAQ.tsx 的登录问题、功能使用问题、安装与更新、网络与连接、后台通知、数据与隐私、平台相关问题。',
    '缓存维护证据：src/utils/api.js 的 hbu_jwxt_maintenance、looksLikeMaintenanceIssue、setMaintenanceFlag、withOfflineMeta、sync_time、QuotaExceeded、trimLocalCacheStorage。',
    '通知证据：src/utils/notify_center.js 的 hbu_notify_snapshot、runNotificationCheck、sendQueuedNotifications、grade signature、fallbackSnapshot；src/utils/background_fetch.js 的 syncBackgroundFetchContext。',
    '云同步证据：src/utils/cloud_sync.js 的 hbu_cloud_sync_status、cooldown、requestCloudSync、runCloudSyncUpload、runCloudSyncDownload、runAutoCloudSyncAfterLogin、x-cloud-sync-challenge。',
    '反馈和日志证据：src/utils/debug_logger.ts 的 hbu_debug_logs_v1；src/components/SettingsView.vue 的调试日志面板；src/components/FeedbackView.vue 的复制最近 error。',
    '调试脚本证据：scripts/debug_capture_ui.mjs、scripts/run_tauri_debug_dev.mjs、scripts/test_debug_bridge_contract.mjs、scripts/test_hot_update_framework.mjs、scripts/test_more_module_bridge.mjs、scripts/test_resource_share_network.mjs。',
    '维护守卫证据：scripts/check_dist_boundary.mjs、scripts/guard_sensitive_uploads.mjs、scripts/check-frontend-safety.mjs、scripts/check-design-tokens.mjs。',
];

const Troubleshooting = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">用户文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                故障排查
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                本页是排错、FAQ 与维护手册，整合旧 FAQ、用户可见错误、缓存恢复、通知与云同步状态、反馈日志、
                调试桥脚本和发布前守卫。目标是让普通用户知道先做什么，让维护者知道用哪些证据继续定位。
            </p>
        </header>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">快速定位流程</h2>
            <div className="grid gap-4 lg:grid-cols-3">
                {quickFlow.map((step) => (
                    <article key={step.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-cyan">{step.title}</h3>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {step.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">安装与启动</h2>
            <div className="grid gap-4 lg:grid-cols-2">
                {installIssues.map((issue) => (
                    <article key={issue.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-purple">{issue.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-gray-400">{issue.problem}</p>
                        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {issue.actions.map((action) => (
                                <li key={action}>{action}</li>
                            ))}
                        </ol>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">登录与验证码</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {loginIssues.map((issue) => (
                    <article key={issue.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-cyan">{issue.title}</h3>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {issue.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">数据、缓存与教务维护</h2>
            <div className="grid gap-4 lg:grid-cols-2">
                {dataIssues.map((issue) => (
                    <article key={issue.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-white">{issue.title}</h3>
                        <div className="mt-1 text-xs leading-6 text-cyan">{issue.source}</div>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {issue.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">功能模块常见问题</h2>
            <div className="grid gap-4 lg:grid-cols-2">
                {featureIssues.map((issue) => (
                    <article key={issue.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-purple">{issue.title}</h3>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {issue.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-6">
                <h2 className="text-2xl font-bold text-white">通知权限与后台白名单</h2>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-200">
                    {notificationIssues.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </article>
            <article className="rounded-xl border border-cyan/30 bg-cyan/[0.06] p-6">
                <h2 className="text-2xl font-bold text-white">云同步失败</h2>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-200">
                    {cloudSyncIssues.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
            {debugAndFeedback.map((block) => (
                <article key={block.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                    <h2 className="text-2xl font-bold text-white">{block.title}</h2>
                    <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                        {block.items.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </article>
            ))}
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">开发者调试与专项脚本</h2>
            <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="grid grid-cols-1 divide-y divide-white/10 md:grid-cols-[280px_1fr] md:divide-y-0">
                    {maintenanceScripts.map(([name, desc]) => (
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
            <h2 className="text-2xl font-bold text-white">维护检查清单</h2>
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-6">
                <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-200">
                    {maintenanceChecklist.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ol>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">反馈材料清单</h2>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    <li>平台和版本：Windows、macOS、Linux、Android 或 iOS，以及 Mini-HBUT 版本号。</li>
                    <li>入口和步骤：从哪个页面进入、点击了什么、是否能稳定复现。</li>
                    <li>网络和登录：校园网/VPN、登录方式、是否使用 portal_qr_temp、是否提示会话过期。</li>
                    <li>状态证据：页面错误文案、sync_time、hbu_jwxt_maintenance、hbu_cloud_sync_status、hbu_notify_snapshot。</li>
                    <li>日志证据：设置 → 调试日志复制 Error/Warn；问题反馈页复制最近 error；公开提交前先脱敏。</li>
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
                <Link to="/docs/settings-data" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    查看设置与数据，理解调试日志、云同步、导出中心和反馈入口如何使用。
                </Link>
                <Link to="/docs/security-privacy" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    查看安全与隐私，确认反馈材料、日志、Cookie、token 和本地数据库的脱敏边界。
                </Link>
                <Link to="/docs/build-release" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    查看构建发布，理解维护脚本、发布前检查和运维风险边界。
                </Link>
            </div>
        </section>
    </div>
);

export default Troubleshooting;
