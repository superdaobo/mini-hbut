import { Link } from 'react-router-dom';

const docsLinks = [
    ['/docs/reference/tauri-api', 'Tauri API / HTTP Bridge', '命令、桥接和 HTTP 调试入口。'],
    ['/docs/reference/dev-rules', '开发规范', '仓库约定、质量门禁和维护要求。'],
    ['/docs/reference/nonebot', 'Nonebot / 外部集成', '外部机器人、接口和联动说明。'],
    ['/docs/reference/implementation-notes', '实现札记', '历史实现、设计取舍和细节备注。'],
];

const entryIndex = [
    ['src/main.ts', 'Vue 应用入口，初始化主题、设置、字体、后台任务、通知检查、调试日志和调试桥。'],
    ['src/App.vue', '主视图调度入口，维护 currentView、历史栈、返回行为、模块宿主会话和受保护页面访问。'],
    ['website/src/App.tsx', '文档站和下载站路由入口，注册所有 /docs 子路由和静态页面。'],
    ['website/src/layouts/DocsLayout.tsx', '文档导航、分组、侧栏和移动端菜单结构。'],
];

const userDocsIndex = [
    ['QuickStart.tsx', '/docs/quick-start', '快速开始：安装、首次登录、首页、搜索、快捷入口和返回行为。'],
    ['UserGuide.tsx', '/docs/user-guide', '用户手册：主导航、账号、会话、首页工作流和日常使用路径。'],
    ['AcademicServices.tsx', '/docs/academic', '教务服务：成绩、课表、考试、排名、空教室、培养方案和学业进度。'],
    ['CampusLife.tsx', '/docs/campus-life', '校园生活：电费、校园码、流水、图书馆、地图、资料分享和 AI。'],
    ['CommunityNotifications.tsx', '/docs/community-notifications', '社区与通知：论坛、帖子、反馈、通知权限和后台提醒。'],
    ['Extensions.tsx', '/docs/extensions', '扩展模块：更多页面、小游戏、模块宿主和远程模块体验。'],
    ['SettingsData.tsx', '/docs/settings-data', '设置与数据：主题、字体、导出、云同步、调试日志和反馈材料。'],
    ['Troubleshooting.tsx', '/docs/troubleshooting', '故障排查：安装、登录、缓存、通知、云同步、调试脚本和维护清单。'],
];

const developerDocsIndex = [
    ['DeveloperOverview.tsx', '/docs/developer', '开发者总览：入口层、视图调度、组件组织、平台边界和阅读顺序。'],
    ['ArchitectureDataFlow.tsx', '/docs/architecture', '架构与数据流：请求、缓存、远程配置、云同步、通知、SQLite 和错误处理。'],
    ['PlatformTauri.tsx', '/docs/platform-tauri', '平台与 Tauri：运行时识别、PlatformBridge、Tauri/Capacitor/Web adapter、权限和 commands。'],
    ['ModuleSystem.tsx', '/docs/module-system', '模块系统：模块中心、manifest、本地 bundle、Capacitor 缓存、构建发布和安全边界。'],
    ['BuildRelease.tsx', '/docs/build-release', '构建发布：根构建、website 构建、release manifest、热更新包、模块产物和守卫脚本。'],
    ['SecurityPrivacy.tsx', '/docs/security-privacy', '安全与隐私：账号、Cookie、SQLite、localStorage、远程内容、调试桥和热更新边界。'],
];

const referenceDocsIndex = [
    ['TauriApi.tsx', '/docs/reference/tauri-api', '低频 API 与 HTTP Bridge 查阅入口。'],
    ['DevRules.tsx', '/docs/reference/dev-rules', '开发规范和工程约束。'],
    ['Nonebot.tsx', '/docs/reference/nonebot', '外部集成参考。'],
    ['Implementation.tsx', '/docs/reference/implementation-notes', '实现札记和历史说明。'],
];

const legacyDocsIndex = [
    ['Guide.tsx', '/docs/guide', '旧版安装指南，保留历史平台安装、下载和侧载说明。新版首次使用路径优先读 QuickStart.tsx。'],
    ['Configuration.tsx', '/docs/configuration', '旧版配置说明，保留 OCR、远程配置、云同步和高级配置细节。新版用户路径优先读 SettingsData.tsx。'],
    ['FAQ.tsx', '/docs/faq', '旧版 FAQ，保留历史问答。新版排错闭环优先读 Troubleshooting.tsx。'],
    ['Technical.tsx', '/docs/technical', '旧版技术原理，保留历史架构解释。新版实现路径优先读 DeveloperOverview.tsx 和 ArchitectureDataFlow.tsx。'],
    ['More.tsx', '/docs/more', '旧版更多资料入口，保留外部链接、贡献入口和相关资料。新版源码索引优先读 ReferenceIndex.tsx。'],
];

const crossReadingMatrix = [
    ['用户首次上手', '/docs/quick-start', '/docs/user-guide', '先完成安装、登录、首页和搜索，再进入完整用户功能地图。'],
    ['学习与校园服务', '/docs/academic', '/docs/campus-life', '教务服务和校园生活互相补充，覆盖学习、身份、资源和一卡通数据。'],
    ['消息与反馈', '/docs/community-notifications', '/docs/settings-data', '论坛、通知、反馈材料、日志和设置通常需要一起阅读。'],
    ['扩展与模块实现', '/docs/extensions', '/docs/module-system', '用户看到的更多模块，对应开发者的 manifest、catalog、bundle 和宿主实现。'],
    ['排错与风险', '/docs/troubleshooting', '/docs/security-privacy', '排查登录、网络、通知和缓存问题前，需要确认敏感信息和权限边界。'],
    ['源码与发布', '/docs/developer', '/docs/build-release', '开发者总览给出阅读顺序，构建发布给出脚本、产物和门禁。'],
    ['索引与历史资料', '/docs/reference', '/docs/faq', '参考索引负责当前源码定位，旧版 FAQ 保留历史问答和迁移线索。'],
];

const componentIndex = [
    ['Dashboard.vue', '首页和搜索、今日课程、天气、快捷入口、功能分类、首页布局状态。'],
    ['ScheduleView.vue', '个人课表、自定义课程、学期/周次、导入导出、ICS 和云同步入口。'],
    ['GradeView.vue', '成绩查询、绩点、学分、缓存和登录失效提示。'],
    ['MoreView.vue', '模块中心、catalog 拉取、manifest 检查、模块准备和跳转。'],
    ['MoreModuleHostView.vue', '模块 iframe 宿主、本地/远程 preview_url、加载失败和外部打开兜底。'],
    ['SettingsView.vue', '设置、云同步状态、调试日志、测速、通知、字体、主题和实验选项。'],
    ['FeedbackView.vue', '反馈入口、复制最近 error、复制单条 error 和反馈链接。'],
];

const utilityIndex = [
    ['src/utils/api.js', '教务 API、fetchWithCache、withOfflineMeta、sync_time、维护标记和 localStorage 缓存。'],
    ['src/utils/cloud_sync.js', '云同步上传/下载、hbu_cloud_sync_status、cooldown、x-cloud-sync-challenge。'],
    ['src/utils/module_center.js', 'DEFAULT_MODULE_CENTER、buildModuleCenterCards 和模块中心入口归一化。'],
    ['src/utils/more_modules.js', '远程 catalog、manifest、本地 bundle、Capacitor 文件缓存和 preview source 选择。'],
    ['src/utils/notify_center.js', 'runNotificationCheck、hbu_notify_snapshot、通知去重和 fallback snapshot。'],
];

const platformBackendIndex = [
    ['src/platform/runtime.ts', '运行时识别：Tauri、Capacitor、Capacitor Web 和 Web fallback。'],
    ['src/platform/types.ts', 'PlatformBridge、RuntimePlatform、WidgetBridge 等跨端抽象类型。'],
    ['src-tauri/src/lib.rs', 'Tauri command 注册、窗口、Widget、通知、调试桥、模块窗口和业务 command。'],
    ['src-tauri/src/http_client/mod.rs', 'HbutClient、Cookie Jar、CAS/教务域名、OCR endpoint、会话和重登公共逻辑。'],
    ['src-tauri/src/db.rs', 'SQLite 表、缓存、用户会话、Cookie 快照、在线学习和论坛相关存储。'],
    ['src-tauri/src/modules/module_bundle.rs', '模块包下载、sha256、缓存目录、bundle.zip、preview_url 和路径防护。'],
];

const scriptIndex = [
    ['scripts/build_website_modules.mjs', '构建 website/modules-src，写入 website/public/modules、catalog.json、manifest.json 和 bundle.zip。'],
    ['scripts/build_hot_bundle.mjs', '构建 dist-hot、hot-manifest.json、sha256 和热更新 zip。'],
    ['scripts/check_dist_boundary.mjs', '检查桌面 dist 边界，阻止 website/modules/app-resources 等目录进入桌面包。'],
    ['scripts/guard_sensitive_uploads.mjs', '扫描 libsql、JWT、token、敏感环境变量和误上传风险。'],
    ['scripts/test_more_module_bridge.mjs', '联调 catalog、manifest、/module_bundle/prepare、preview_url 和模块真实资源。'],
    ['website/scripts/test-docs-ia.mjs', '验证文档路由、侧栏、静态入口和参考页接入。'],
    ['website/scripts/test-docs-user-content.mjs', '验证用户文档内容契约和骨架占位清理。'],
    ['website/scripts/test-docs-developer-content.mjs', '验证开发者文档内容契约、ReferenceIndex 路径存在性检查和骨架占位清理。'],
];

const artifactIndex = [
    ['website/modules-src', '模块源码根目录，每个模块包含 module.json 和 source_dir。'],
    ['website/public/modules', '模块发布产物根目录，按 main、dev、latest 渠道保存 catalog 和模块包。'],
];

const readingOrder = [
    '从产品视角查功能：先读快速开始、用户手册，再按教务服务、校园生活、社区与通知、扩展模块、设置与数据深入。',
    '从架构视角查实现：先读开发者总览，再读架构与数据流、平台与 Tauri、模块系统。',
    '从发布与风险视角查维护：先读构建发布，再读安全与隐私、故障排查。',
    '需要定位源码时，先在本页找文件，再跳到对应专题页确认上下文和风险边界。',
];

const renderPathCards = (items: string[][]) => (
    <div className="grid gap-4 md:grid-cols-2">
        {items.map(([path, description]) => (
            <article key={path} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="text-sm font-semibold text-cyan">{path}</h3>
                <p className="mt-3 text-sm leading-7 text-gray-300">{description}</p>
            </article>
        ))}
    </div>
);

const ReferenceIndex = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">参考资料</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                参考资料
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                本页是源码到文档引用索引，把当前已经文档化的页面、组件、工具、平台后端、脚本和构建产物按
                维护路径串起来。它的作用不是替代专题文档，而是让开发者从源码文件快速定位到对应说明。
            </p>
        </header>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">已接入参考页面</h2>
            <div className="grid gap-3 md:grid-cols-2">
                {docsLinks.map(([to, title, desc]) => (
                    <Link key={to} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50" to={to}>
                        <h3 className="text-lg font-bold text-cyan">{title}</h3>
                        <p className="mt-2 text-sm leading-7 text-gray-300">{desc}</p>
                    </Link>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">入口与导航</h2>
            {renderPathCards(entryIndex)}
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">用户文档索引</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {userDocsIndex.map(([file, to, description]) => (
                    <Link key={file} to={to} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50">
                        <h3 className="text-sm font-semibold text-cyan">{file}</h3>
                        <p className="mt-3 text-sm leading-7 text-gray-300">{description}</p>
                    </Link>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">开发者文档索引</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {developerDocsIndex.map(([file, to, description]) => (
                    <Link key={file} to={to} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50">
                        <h3 className="text-sm font-semibold text-purple">{file}</h3>
                        <p className="mt-3 text-sm leading-7 text-gray-300">{description}</p>
                    </Link>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">参考页索引</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {referenceDocsIndex.map(([file, to, description]) => (
                    <Link key={file} to={to} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50">
                        <h3 className="text-sm font-semibold text-cyan">{file}</h3>
                        <p className="mt-3 text-sm leading-7 text-gray-300">{description}</p>
                    </Link>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">旧版文档索引</h2>
            <p className="text-sm leading-7 text-gray-300">
                这些页面仍在路由和静态入口中保留，适合查历史说明；新版用户文档、开发者文档、故障排查和参考索引是当前主线。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
                {legacyDocsIndex.map(([file, to, description]) => (
                    <Link key={file} to={to} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50">
                        <h3 className="text-sm font-semibold text-gray-200">{file}</h3>
                        <p className="mt-3 text-sm leading-7 text-gray-300">{description}</p>
                    </Link>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">交叉阅读矩阵</h2>
            <div className="space-y-3">
                {crossReadingMatrix.map(([scene, primary, secondary, description]) => (
                    <article key={scene} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-lg font-bold text-cyan">{scene}</h3>
                        <div className="mt-3 flex flex-wrap gap-2 text-sm">
                            <Link className="rounded-lg border border-cyan/25 px-3 py-1.5 text-cyan transition-colors hover:bg-cyan/10" to={primary}>
                                {primary}
                            </Link>
                            <Link className="rounded-lg border border-purple/25 px-3 py-1.5 text-purple-200 transition-colors hover:bg-purple/10" to={secondary}>
                                {secondary}
                            </Link>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-gray-300">{description}</p>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">前端组件索引</h2>
            {renderPathCards(componentIndex)}
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">工具与数据索引</h2>
            {renderPathCards(utilityIndex)}
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">平台与后端索引</h2>
            {renderPathCards(platformBackendIndex)}
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">脚本与契约索引</h2>
            {renderPathCards(scriptIndex)}
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">产物与模块目录</h2>
            {renderPathCards(artifactIndex)}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-cyan/30 bg-cyan/[0.06] p-6">
                <h2 className="text-2xl font-bold text-white">路径存在性检查</h2>
                <p className="mt-4 text-sm leading-7 text-gray-200">
                    `website/scripts/test-docs-developer-content.mjs` 会读取本页，并用 existsSync 检查本页关键路径确实存在于仓库。
                    如果后续文件迁移、重命名或删除，契约会失败，防止引用索引变成陈旧清单。
                </p>
            </article>
            <article className="rounded-xl border border-purple/30 bg-purple/[0.06] p-6">
                <h2 className="text-2xl font-bold text-white">阅读顺序</h2>
                <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-200">
                    {readingOrder.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ol>
            </article>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">源码证据索引</h2>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <p className="text-sm leading-7 text-gray-300">
                    本页索引的源码证据来自已完成 Task 1-16 的结构审计、用户功能清单、开发者专题、构建发布专题、安全隐私专题、
                    故障排查专题和 Checkpoint E。后续 Task 19 会再次对照源码模块清单做最终覆盖率审计。
                </p>
            </div>
        </section>
    </div>
);

export default ReferenceIndex;
