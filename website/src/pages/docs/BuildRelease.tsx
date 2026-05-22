import { Link } from 'react-router-dom';

const rootBuildCards = [
    {
        title: '根项目脚本入口',
        source: 'package.json',
        items: [
            'package.json 是 Mini-HBUT 主应用的脚本入口。dev 启动 Vite，build 与 build:web 都执行 vite build，test 执行 vitest run，build:hot-bundle 执行 scripts/build_hot_bundle.mjs。',
            'prebuild 和 prebuild:web 都会先执行 scripts/prepare_dist.mjs。也就是说运行 npm run build 或 npm run build:web 前，根目录 dist 会被清理或移动到 .dist-trash-*。',
            'tauri 只是转交给 @tauri-apps/cli；tauri:dev:debug-bridge 走 scripts/run_tauri_debug_dev.mjs，用于带调试桥的本地 Tauri 开发。',
            'cap:sync、cap:run:android、cap:open:android、cap:open:ios 是移动端链路入口，其中 cap:sync 和 cap:run:android 会先 npm run build:web，再执行 npx cap sync 或 npx cap run android。',
        ],
    },
    {
        title: '主应用 Vite 构建',
        source: 'vite.config.ts',
        items: [
            'vite.config.ts 从根 package.json 注入 VITE_APP_VERSION，并通过 MINI_HBUT_BUILD_PROFILE 注入 VITE_BUILD_PROFILE。默认 profile 是 standard。',
            'MINI_HBUT_BUILD_PROFILE=release 时 esbuild.drop 会移除 console 和 debugger，并开启 reportCompressedSize；MINI_HBUT_BUILD_PROFILE=dev-fast 时关闭 JS/CSS 压缩并放宽 chunk 警告。',
            'manualChunks 把 vue-core、markdown、capture、debug-tools、online-learning、more-modules、runtime-bridge 拆成独立 chunk，避免平台桥、Markdown、截图和更多模块逻辑全部压进同一主包。',
            '开发服务器固定 1420 且 strictPort: true；/bridge 代理到 127.0.0.1:4399，字体代理到远端 SmileySans 文件。',
        ],
    },
    {
        title: 'dist 清理与边界',
        source: 'scripts/prepare_dist.mjs / scripts/check_dist_boundary.mjs',
        items: [
            'scripts/prepare_dist.mjs 是写入型脚本：它会删除 dist；Windows 文件锁阻塞时会把 dist 重命名为 .dist-trash-*，并尝试延迟删除或截断残留文件。',
            'scripts/check_dist_boundary.mjs 是只读检查脚本：它读取 dist 顶层文件和递归文件路径，不修改产物。',
            'check_dist_boundary 的 allowedEntries / allowedTopLevelEntries 只允许 assets、favicon.svg、fonts、index.html、pdf-preview-lab.html、remote_config.json、remote_config.sample.json、splash 进入桌面包。',
            'forbiddenSegments 明确禁止 dist 中出现 modules、website、app-resources 路径片段，避免网站模块、站点源码或应用资源误进入桌面安装包。',
        ],
    },
];

const platformReleaseCards = [
    {
        title: 'Tauri 打包链',
        source: 'src-tauri/tauri.conf.json / src-tauri/Cargo.toml',
        items: [
            'src-tauri/tauri.conf.json 的 beforeDevCommand 是 npm run dev，devUrl 是 http://localhost:1420，frontendDist 指向 ../dist。',
            'beforeBuildCommand 是 npm run build && node scripts/check_dist_boundary.mjs。Tauri build 会先构建前端，再检查 dist 边界，然后才把 dist 纳入安装包。',
            '产品名是 Mini-HBUT，identifier 是 com.hbut.mini；Windows NSIS 使用 lzma 压缩、SimpChinese，并通过 downloadBootstrapper 静默安装 WebView2。',
            'src-tauri/Cargo.toml 的 release profile 使用 opt-level = "z"、lto = "fat"、codegen-units = 1、panic = "abort"、strip = "symbols"，目标是减小安装包和二进制体积。',
        ],
    },
    {
        title: 'Capacitor 同步链',
        source: 'capacitor.config.ts / package.json',
        items: [
            'Capacitor 配置位于 capacitor.config.ts，appId 为 com.hbut.mini，appName 为 Mini-HBUT，webDir 为 dist，androidScheme 和 iosScheme 都是 https。',
            'cap:sync 会先执行 build:web，再执行 npx cap sync。移动端 native 工程读取的是同一份 dist，不维护独立前端页面。',
            'cap:run:android 会先构建 Web 产物再运行 Android；cap:open:android 和 cap:open:ios 只是打开原生工程，不会自动重建 dist。',
            '移动端发布前必须确认 dist 是最新、Capacitor sync 已执行、平台图标或 native 插件改动已经同步；仅打开 Android Studio 或 Xcode 不代表 Web 产物已刷新。',
        ],
    },
];

const websiteBuildCards = [
    {
        title: 'website 构建入口',
        source: 'website/package.json',
        items: [
            'website/package.json 管理文档站和发布页。dev 启动 Vite，build 执行 tsc -b && vite build，preview 用于本地预览构建产物。',
            'test:docs-ia 检查文档信息架构、路由和导航契约；test:docs-developer-content 检查开发者文档内容覆盖；test:docs-user-content 检查用户文档内容覆盖。',
            'test:release-links 执行 website/scripts/test-release-links.mjs，用本地 stable-latest.json 或 GitHub latest release API 校验下载链接。',
            'lint 存在但不是本 goal 每轮的默认阻塞命令；发布前可作为额外质量门禁运行。',
        ],
    },
    {
        title: 'website 多入口',
        source: 'website/vite.config.ts',
        items: [
            'website/vite.config.ts 使用 React 插件和 inspectAttr 插件，base 为 /。',
            'build.rollupOptions.input 显式列出首页、releases 页面和所有 docs 静态入口，包括 docsBuildRelease 对应 docs/build-release/index.html。',
            '新增文档页面时不仅要加 React route 和侧栏，还要确认 docsEntries 中有对应静态 HTML 入口，否则静态部署路径可能 404。',
            'website dev server 使用 0.0.0.0:3000 且 open: true；goal 模式中不要为了预览抢占 Windows 焦点，优先用构建和契约测试验证。',
        ],
    },
];

const releaseManifestItems = [
    'scripts/build_release_manifests.mjs 默认写入 website/public/releases，也可通过 RELEASES_DIR 指定输出根目录。',
    'RELEASE_CHANNEL 或 CHANNEL 只接受 main/dev 语义，normalizeChannel 会把非 dev 都归为 main。SOURCE_REF、SOURCE_SHA、STABLE_TAG、DEV_VERSION、GITHUB_REPOSITORY、GITHUB_TOKEN 会影响 manifest 元数据和 GitHub release 拉取。',
    '脚本会生成或更新 stable-latest.json、dev-latest.json、latest.json、active.json、channels.json、history.json，并在稳定版本目录、dev-latest 目录和 latest 目录写 manifest.json。',
    'latest/active 只允许指向 stable/main，不再指向 dev。dev-latest 可以存在，但不会成为主站首页和自动更新的 active 来源。',
    '脚本会 pruneReleaseDirectories，只保留 latest、当前 stable tag 和 dev-latest 目录。它是写入型脚本，不能在未确认 release 目录输入的情况下随意运行。',
    'history.json 优先来自 GitHub releases；如果 GitHub API、gh 或 token 不可用，会 fallback 到本地 stable 目录生成 history。',
];

const hotBundleItems = [
    'build:hot-bundle 调用 scripts/build_hot_bundle.mjs，要求根目录 dist 已经存在；如果没有先 npm run build，会直接失败。',
    '脚本输出到 dist-hot，生成 mini-hbut-web-${version}.zip 和 hot-manifest.json。',
    'Windows 通过临时 pack_hot_bundle.ps1 调用 Compress-Archive；非 Windows 通过 zip -qr 打包 dist。',
    'hot-manifest.json 写入 version、bundle_url、sha256、signature: sha256:${sha256}、min_bootstrap_version、max_bootstrap_version、min_native_version、max_native_version 和 notes。',
    '当前 signature 是 sha256 前缀形式，不是非对称签名。发布热更新前必须同时确认传输渠道、hash 校验和客户端版本范围。',
];

const modulePublishItems = [
    'scripts/build_website_modules.mjs 从 website/modules-src 读取模块源码，默认写到 website/public/modules。',
    'PUBLISH_CHANNELS 固定为 main、dev、latest。每个启用模块会在三个 channel 下生成版本目录、site 目录、bundle.zip、manifest.json 和频道 catalog.json。',
    '模块构建会对每个模块源码目录执行 npm ci，失败后 fallback 到 npm install，然后执行 npm run build；disabled: true 的模块会跳过。',
    'manifest.json 中包含 package_url、package_sha256、package_size、entry_path、published_at、open_url、published_channel、source_channel 和 min_compatible_version。',
    'catalog.json 按 order 排序并暴露 module id、name、manifest_url、key_required、icon、description。模块中心和 more module bridge 依赖这个目录结构。',
    '这是写入型脚本，并且会安装依赖、构建子项目、复制 dist、打 zip。发布前要确认 MODULE_BASE_URL、MODULE_VERSION、MODULE_SOURCE_CHANNEL、MODULE_OUTPUT_ROOT 是否符合目标环境。',
];

const checks = [
    {
        title: '文档站检查',
        items: [
            'website/package.json 的 test:docs-ia、test:docs-developer-content、test:docs-user-content 分别检查路由导航、开发者文档覆盖和用户文档覆盖。',
            'website/scripts/test-release-links.mjs 优先读取 website/public/releases/stable-latest.json，再 fallback 到 GitHub latest release API；它要求 Windows exe、mac dmg、Android apk、iOS ipa、Linux AppImage 链接可达。',
            'website/scripts/update-release-links.mjs 已被标记为废弃路径，只提示下载链接由运行时 GitHub latest release API 解析，不应作为发布更新动作依赖。',
        ],
    },
    {
        title: '主项目检查',
        items: [
            'npm test 执行 Vitest；test:pbt 只运行名称包含 Property 的属性测试。',
            'test:debug-bridge-contract、test:hot-update-framework、test:more-module-bridge、test:resource-share-network 是面向调试桥、热更新、更多模块桥和资源共享网络的专项检查。',
            'scripts/report_bundle_sizes.mjs 读取 dist 和 src-tauri/target/release/bundle，输出 Web 产物和安装包体积；它是只读检查脚本。',
        ],
    },
    {
        title: '安全与设计守卫',
        items: [
            'scripts/guard_sensitive_uploads.mjs 支持 pre-commit、pre-push、scan-file，用于阻止 libsql URL、JWT/Turso token、HuggingFace token、Resend key、Bearer token 和敏感环境变量进入提交或推送。',
            'scripts/check-frontend-safety.mjs 会扫描前端裸调 chaoxing.com、console.log 敏感字段和超星签到 Rust sleep(10 硬编码延迟。',
            'scripts/check-design-tokens.mjs 扫描 MoreChaoxingCheckinView.vue 和 src/components/chaoxing_checkin 的 style 区，禁止未允许的硬编码 hex 颜色。',
        ],
    },
];

const writeScripts = [
    ['scripts/prepare_dist.mjs', '删除或移动根 dist，必要时截断残留文件。'],
    ['scripts/build_hot_bundle.mjs', '读取 dist，写 dist-hot、热更新 zip、hot-manifest.json 和 Windows 临时 pack_hot_bundle.ps1。'],
    ['scripts/build_release_manifests.mjs', '写 website/public/releases 下的 stable/dev/latest/active/channels/history manifest，并可能清理旧 release 目录。'],
    ['scripts/build_website_modules.mjs', '安装模块依赖、构建 website/modules-src 子项目，写 website/public/modules 下的 catalog.json、manifest.json、site 和 bundle.zip。'],
    ['npm run build / build:web', '经 prebuild/prebuild:web 先清理 dist，再由 Vite 写新 dist。'],
    ['cap:sync / cap:run:android', '先写 dist，再同步或运行 Capacitor 原生工程。'],
];

const readOnlyChecks = [
    ['scripts/check_dist_boundary.mjs', '读取 dist 顶层白名单和 forbiddenSegments，发现违规直接失败。'],
    ['scripts/report_bundle_sizes.mjs', '读取 dist 与 bundle 目录，输出体积报告和基线差异。'],
    ['scripts/check-frontend-safety.mjs', '扫描源码安全规则，不写文件。'],
    ['scripts/check-design-tokens.mjs', '扫描签到模块样式硬编码颜色，不写文件。'],
    ['website/scripts/test-release-links.mjs', '读取本地 stable manifest 或远端 release API，并用 HEAD/Range GET 检查下载链接。'],
    ['website/scripts/test-docs-*.mjs', '读取文档源码并检查关键词、路由和导航契约。'],
];

const preReleaseChecklist = [
    '确认工作区没有混入无关文件，尤其不要把 website/public/modules、website/public/releases 的历史产物和源码改动混在同一个发布提交里。',
    '先运行 npm run build，确认 dist 可构建；Tauri 发布再依赖 beforeBuildCommand 自动运行 scripts/check_dist_boundary.mjs。',
    '桌面包发布前运行 scripts/report_bundle_sizes.mjs，记录 dist 与平台安装包体积，观察是否有异常膨胀。',
    '移动端发布前运行 cap:sync，确认 capacitor.config.ts 的 webDir=dist 与当前构建产物一致，再进入 Android Studio 或 Xcode。',
    '热更新发布前先生成 dist，再运行 build:hot-bundle，校验 dist-hot/hot-manifest.json 的 sha256、signature、版本范围和 zip 文件名。',
    'website 发布前运行 website 的 test:docs-ia、test:docs-developer-content、test:docs-user-content 和 build，发布下载页前补跑 test:release-links。',
    'release manifest 发布前明确 RELEASE_CHANNEL、STABLE_TAG、DEV_VERSION、SOURCE_REF、SOURCE_SHA，避免 latest/active 指向错误版本或误删旧目录。',
    '模块发布前明确 MODULE_BASE_URL、MODULE_VERSION、MODULE_SOURCE_CHANNEL，确认 disabled 模块不会被发布，并抽样检查 catalog.json、bundle.zip 和 package_sha256。',
    '敏感信息发布前运行 guard_sensitive_uploads.mjs pre-commit 或 scan-file，并避免把本地 token、release API key、Cloudflare/Turso 环境变量写进仓库。',
];

const operationalRisks = [
    'npm run build 表面上是 Vite 构建，实际会先触发 prebuild 清理 dist；Tauri beforeBuildCommand 又会再次运行 npm run build，所以桌面发布链的耗时和副作用都比单个 vite build 更大。',
    'bundle.targets = "all" 不代表任意宿主系统都能产出所有平台安装包；真实产物仍取决于当前 OS、Tauri toolchain、签名证书、Android/iOS 原生工程和 CI runner 能力。',
    'Windows WebView 使用 downloadBootstrapper 且 silent: true，安装时依赖外部 WebView2 下载链路。离线环境、校园网限制或代理异常都可能导致安装失败。',
    'src-tauri/tauri.conf.json 中 security.csp 为 null。发布链本身不会补上 CSP，需要安全专题继续约束远程资源、模块 iframe、自定义 JS、Markdown 和调试桥。',
    'release manifest 发布后要抽样核对 stable-latest.json、latest.json、active.json、版本目录 manifest.json 与真实安装包文件是否一致；manifest 声明了资产但目录缺文件时，test:release-links 或用户下载会暴露 404。',
    '模块发布后要核对 main、dev、latest 的 catalog.json、source_channel、published_channel、manifest_url、open_url 和 package_sha256。dev 产物误进入 main/latest 是发布治理风险。',
    'scripts/build_website_modules.mjs 没有长期版本清理策略。旧版本 bundle.zip、site 目录和 manifest 会持续留在 website/public/modules，可能增加仓库体积、部署时间和 CDN 成本。',
    'scripts/build_hot_bundle.mjs 当前 signature 是 sha256:${sha256} 字段，不是非对称签名。热更新发布必须依赖客户端校验、HTTPS/CDN 边界和版本范围共同降低篡改风险。',
    'release profile 的 panic = "abort"、strip = "symbols"、debug = 0 有利于体积，但会削弱线上崩溃诊断信息。发布事故排查需要额外保留构建日志和版本元数据。',
];

const sourceEvidence = [
    '根构建证据：package.json 的 prebuild、prebuild:web、build、build:web、build:hot-bundle、test、tauri、tauri:dev:debug-bridge、cap:sync、cap:run:android、cap:open:android、cap:open:ios。',
    'Vite 证据：vite.config.ts 的 MINI_HBUT_BUILD_PROFILE、VITE_APP_VERSION、VITE_BUILD_PROFILE、manualChunks、server.port=1420、/bridge proxy。',
    'Tauri 证据：src-tauri/tauri.conf.json 的 beforeDevCommand、devUrl、beforeBuildCommand、frontendDist、NSIS、webviewInstallMode；src-tauri/Cargo.toml 的 release profile。',
    'Capacitor 证据：capacitor.config.ts 的 appId、appName、webDir、androidScheme、iosScheme。',
    'dist 边界证据：scripts/prepare_dist.mjs 的 dist 清理、.dist-trash-* fallback、truncate fallback；scripts/check_dist_boundary.mjs 的 allowedEntries / allowedTopLevelEntries 和 forbiddenSegments。',
    '热更新证据：scripts/build_hot_bundle.mjs 的 dist-hot、hot-manifest.json、sha256、signature、min_bootstrap_version、max_bootstrap_version、min_native_version、max_native_version。',
    'release 证据：scripts/build_release_manifests.mjs 的 stable-latest.json、dev-latest.json、latest.json、active.json、channels.json、history.json、latest/active stable-only 规则。',
    '模块发布证据：scripts/build_website_modules.mjs 的 website/public/modules、main/dev/latest channel、catalog.json、manifest.json、bundle.zip、package_sha256。',
    'website 证据：website/package.json 的 test:docs-ia、test:docs-developer-content、test:docs-user-content、test:release-links、build；website/vite.config.ts 的 docsBuildRelease 静态入口。',
    '安全检查证据：scripts/guard_sensitive_uploads.mjs、scripts/check-frontend-safety.mjs、scripts/check-design-tokens.mjs、website/scripts/test-release-links.mjs、website/scripts/update-release-links.mjs。',
];

const BuildRelease = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">开发者文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                构建发布
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                本页说明 Mini-HBUT 的根项目、Tauri、Capacitor、website、release manifest、热更新包、模块发布、发布链接、
                安全守卫和运维检查脚本。重点区分写入型脚本与只读检查脚本，避免发布时误删 dist、误写 website/public 或误把 dev 产物暴露给 stable 用户。
            </p>
        </header>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">根项目构建链</h2>
            <div className="grid gap-4 lg:grid-cols-3">
                {rootBuildCards.map((card) => (
                    <article key={card.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-cyan">{card.title}</h3>
                        <div className="mt-1 text-xs leading-6 text-gray-500">{card.source}</div>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {card.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">Tauri 与 Capacitor 发布链</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {platformReleaseCards.map((card) => (
                    <article key={card.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                        <h3 className="text-xl font-bold text-purple">{card.title}</h3>
                        <div className="mt-1 text-xs leading-6 text-gray-500">{card.source}</div>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {card.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">website 文档站构建</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {websiteBuildCards.map((card) => (
                    <article key={card.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                        <h3 className="text-xl font-bold text-white">{card.title}</h3>
                        <div className="mt-1 text-xs leading-6 text-cyan">{card.source}</div>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {card.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-xl border border-white/10 bg-white/[0.03] p-6 lg:col-span-2">
                <h2 className="text-2xl font-bold text-white">release manifest</h2>
                <div className="mt-1 text-xs leading-6 text-gray-500">scripts/build_release_manifests.mjs</div>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {releaseManifestItems.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </article>
            <article className="rounded-xl border border-cyan/20 bg-cyan/[0.06] p-6">
                <h2 className="text-2xl font-bold text-white">热更新包</h2>
                <div className="mt-1 text-xs leading-6 text-cyan">scripts/build_hot_bundle.mjs</div>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-200">
                    {hotBundleItems.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </article>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">website 模块发布</h2>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {modulePublishItems.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">测试、链接与安全检查</h2>
            <div className="grid gap-4 lg:grid-cols-3">
                {checks.map((card) => (
                    <article key={card.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-cyan">{card.title}</h3>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {card.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-6">
                <h2 className="text-2xl font-bold text-white">写入型脚本</h2>
                <div className="mt-1 text-sm leading-7 text-amber-100">
                    这些命令会删除、复制、打包、安装依赖或写入发布产物，发布前必须确认输入目录和环境变量。
                </div>
                <div className="mt-5 divide-y divide-white/10">
                    {writeScripts.map(([name, desc]) => (
                        <div key={name} className="grid gap-2 py-3 text-sm leading-7 md:grid-cols-[220px_1fr]">
                            <div className="font-semibold text-amber-100">{name}</div>
                            <div className="text-gray-200">{desc}</div>
                        </div>
                    ))}
                </div>
            </article>

            <article className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-6">
                <h2 className="text-2xl font-bold text-white">只读检查脚本</h2>
                <div className="mt-1 text-sm leading-7 text-emerald-100">
                    这些命令主要读取源码、dist、manifest 或远端链接，适合作为发布前质量门禁。
                </div>
                <div className="mt-5 divide-y divide-white/10">
                    {readOnlyChecks.map(([name, desc]) => (
                        <div key={name} className="grid gap-2 py-3 text-sm leading-7 md:grid-cols-[220px_1fr]">
                            <div className="font-semibold text-emerald-100">{name}</div>
                            <div className="text-gray-200">{desc}</div>
                        </div>
                    ))}
                </div>
            </article>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">发布前检查清单</h2>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {preReleaseChecklist.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ol>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">运维风险边界</h2>
            <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-200">
                    {operationalRisks.map((item) => (
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
                <Link to="/docs/platform-tauri" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    回到平台与 Tauri，理解 beforeBuildCommand 背后的 Tauri、Capacitor、Web 能力边界。
                </Link>
                <Link to="/docs/module-system" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    继续阅读模块系统，核对 website/public/modules、catalog.json、manifest.json 与模块宿主的数据关系。
                </Link>
                <Link to="/docs/security-privacy" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    继续阅读安全与隐私，展开 token、Cookie、远程配置、调试桥、热更新和模块包的安全边界。
                </Link>
            </div>
        </section>
    </div>
);

export default BuildRelease;
