import Link from 'next/link';

const builtInModules = [
    ['hecheng_hugongda', '合成湖工大', '默认 order=1，远程模块，来自 DEFAULT_MODULE_CENTER 与网站模块产物。'],
    ['jump_out_hbut', '跳出湖工大', '跳一跳风格小游戏，走 manifest_url 下载或远程打开链路。'],
    ['hbut_2048', '2048 湖工大版', '内置入口不依赖线上 catalog，避免 catalog 滞后导致入口消失。'],
    ['clumsy_bird_hbut', '笨鸟先飞', '飞行点击类小游戏，构建后进入 website/public/modules。'],
    ['hbut_monopoly', '湖工大富翁', '校园投骰经营小游戏，模块包同样发布到 main、dev、latest。'],
    ['hbut_miner', '湖工矿工', '抓取类小游戏，module.json 指向 source_dir=project。'],
    ['hbut_memory_match', '湖工记忆牌', '翻牌配对模块，入口为 index.html。'],
    ['hbut_gomoku', '湖工五子棋', '本地双人五子棋，是网站模块契约覆盖的新增游戏之一。'],
];

const manifestFields = [
    ['catalog.json', '渠道级远程目录，包含 schema_version、generated_at、channel、source_channel 和 modules 列表。'],
    ['manifest.json', '单模块发布清单，模块中心会通过 manifest_url 获取它。'],
    ['package_url', '主 bundle.zip 下载地址，桌面端准备本地包、移动端下载缓存都依赖它。'],
    ['package_urls', '候选下载地址列表，more_modules 会去重并按场景选择。'],
    ['package_sha256', '模块压缩包完整性校验值，Tauri 与 Capacitor 本地缓存都使用它判断是否需要刷新。'],
    ['package_size', '发布脚本记录的 bundle 大小，用于发布治理和排错。'],
    ['entry_path', '模块 HTML 入口，默认 index.html，不能包含 .. 这类越界路径。'],
    ['open_url', '远程直开兜底地址，Web 或移动端无法本地预览时使用。'],
    ['min_compatible_version', '最低兼容版本，MoreView.vue 会结合当前 App 版本做兼容判断。'],
];

const runtimeFlow = [
    'MoreView.vue 首先读取远程配置 module_center，再调用 buildModuleCenterCards 合并 DEFAULT_MODULE_CENTER、配置 modules 与 catalogModules。',
    'normalizeModuleCenterEntry 会把 id、name、kind、order、key_required、view、min_compatible_version 和 manifest_url 归一化。',
    '用户点击远程模块后，MoreView.vue 拉取 manifest.json，检查版本兼容，再调用 prepareAndOpenModule。',
    'prepareAndOpenModule 在桌面端优先走 prepare_module_bundle；在 Capacitor 端走本地 Filesystem 下载解压；在 Web 端走 remote-site 远程预览。',
    'MoreModuleHostView.vue 接收会话后通过 normalizeModuleHostSessionPayload 和 resolveModuleHostPreviewSource 修正 preview_url、preview_mode、open_url 和本地缓存路径。',
];

const previewModes = [
    ['tauri-local', '桌面端本地桥接模式，preview_url 指向 http://127.0.0.1:4399/module_bundle/content/...。'],
    ['capacitor-local', '移动端本地文件模式，Filesystem 写入 Directory.Data 后通过 toNativeFileSrc 转换本地 URL。'],
    ['remote-site', '远程站点模式，使用 open_url 或远程候选地址直接在宿主 iframe 中打开。'],
];

const nativeBundleFlow = [
    'src-tauri/src/modules/module_bundle.rs 使用 MODULE_CACHE_ROOT=more_modules，把模块按 channel/module_id/version 缓存在 AppCache 下。',
    'ModuleBundlePrepareRequest 接收 channel、module_id、version、package_url、package_urls、package_sha256、entry_path 和 min_compatible_version。',
    'prepare_module_bundle 会优先检查本地 metadata 与 package_sha256，命中时直接返回 ModuleBundlePrepareResult。',
    '未命中缓存时下载 bundle.zip，校验 sha256，解压 site 内容，写入 bundle.zip 和 metadata。',
    'build_preview_url 生成本地预览地址，open_module_bundle_window 可打开独立模块窗口。',
    'resolve_module_bundle_file 负责把本地桥接 URL 映射回缓存目录文件，并阻断越界路径；文档中把这类风险称为 zip slip 防护。',
];

const buildFlow = [
    'scripts/build_website_modules.mjs 从 website/modules-src 扫描每个 module.json，跳过 disabled=true 的模块。',
    'module.json 至少要声明 id、name、entry_path，可选 source_dir、dist_dir、order、icon、key_required、min_compatible_version 和 release_notes。',
    '脚本会在模块 source_dir 内执行 npm ci 或 npm install，再执行 npm run build，读取 dist_dir 作为静态站点产物。',
    'PUBLISH_CHANNELS 固定为 main、dev、latest；每个渠道都会写入 website/public/modules/{channel}/{moduleId}。',
    '每个模块版本目录包含 site、bundle.zip、manifest.json；模块根目录也会写一份最新 manifest.json。',
    '发布 manifest 会记录 published_channel 和 source_channel，catalog.json 按 order 排序，供客户端模块中心拉取。',
];

const maintenanceChecks = [
    '新增模块时先补 website/modules-src/{id}/module.json，再确认源码目录、构建脚本、dist_dir 和 entry_path 都存在。',
    '发布前运行 scripts/build_website_modules.mjs 需要注意它是写入型脚本，会安装依赖、构建模块并覆盖 website/public/modules。',
    '模块入口异常时先检查 catalog.json、manifest.json、package_url、package_sha256、bundle.zip 和 preview_url。',
    '桌面本地桥异常时检查 canUseLocalModuleBridgePreview、prepare_module_bundle 返回值、bundle_path 和 /module_bundle/content 路由。',
    '移动端本地包异常时检查 Capacitor、Filesystem、toNativeFileSrc、local_preview_url 与 preview_mode=capacitor-local。',
    '调试桥可通过 debug_reset_more_modules 清理模块缓存，但只能在明确开启调试桥和本地 token 正确时使用。',
];

const evidence = [
    '入口合并：src/utils/module_center.js 的 DEFAULT_MODULE_CENTER、normalizeModuleCenterEntry、buildModuleCenterCards。',
    '远程目录与缓存：src/utils/more_modules.js 的 MODULE_CDN_BASE、hbu_more_module_state_v1、hbu_more_module_catalog_cache_v1、hbu_more_module_manifest_cache_v1、hbu_more_module_remote_source_rotation_v1。',
    '用户入口：src/components/MoreView.vue 的 catalog 拉取、manifest 检查、isManifestVersionCompatible、prepareAndOpenModule 和导航 payload。',
    '宿主入口：src/components/MoreModuleHostView.vue 与 src/App.vue 的 more_module_host、moduleHostSession、preview_url 修复逻辑。',
    '桌面本地包：src-tauri/src/modules/module_bundle.rs 的 ModuleBundlePrepareRequest、ModuleBundlePrepareResult、prepare_module_bundle、open_module_bundle_window、resolve_module_bundle_file。',
    'HTTP 桥：src-tauri/src/http_server.rs 的 /module_bundle/prepare、/module_bundle/open、/module_bundle/content、/debug/reset_more_modules。',
    '构建脚本：scripts/build_website_modules.mjs 与 website/modules-src/*/module.json。',
    '专项验证：scripts/test_more_module_bridge.mjs 与 src/utils/website_game_modules_contract.spec.ts。',
];

const ModuleSystem = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">开发者文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                模块系统
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                模块系统把应用内“更多”页面、网站模块构建产物、Tauri 本地 bundle 桥接、Capacitor 本地缓存和远程
                open_url 兜底连接起来。它不是简单 iframe 列表，而是一条从模块中心到运行时宿主的完整发布与加载链路。
            </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <h2 className="text-2xl font-bold text-white">模块中心</h2>
                <p className="mt-3 text-sm leading-7 text-gray-300">
                    `src/utils/module_center.js` 提供 DEFAULT_MODULE_CENTER、normalizeModuleCenterEntry 和
                    buildModuleCenterCards。内置模块优先保证入口稳定，远程 catalog 再补充 manifest_url、描述、排序和兼容信息。
                </p>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    <li>远程模块默认渠道是 main，也支持 dev 和 latest。</li>
                    <li>配置 modules、远程 catalogModules 与内置 DEFAULT_MODULE_CENTER 会按 id 合并。</li>
                    <li>内置游戏入口不依赖线上 catalog，避免远程目录滞后导致入口消失。</li>
                </ul>
            </article>
            <article className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <h2 className="text-2xl font-bold text-white">远程目录</h2>
                <p className="mt-3 text-sm leading-7 text-gray-300">
                    `src/utils/more_modules.js` 使用 MODULE_CDN_BASE 指向模块 CDN。运行时缓存包含
                    hbu_more_module_state_v1、hbu_more_module_catalog_cache_v1、hbu_more_module_manifest_cache_v1
                    和 hbu_more_module_remote_source_rotation_v1。
                </p>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    <li>catalog.json 是渠道入口；manifest.json 是单模块发布入口。</li>
                    <li>远程候选地址会在当前 CDN、GitHub raw 和代理之间选择，但 iframe 打开时会避开常见代理。</li>
                    <li>缓存只是可用性兜底，不能当作发布成功证明。</li>
                </ul>
            </article>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">内置模块清单</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {builtInModules.map(([id, name, desc]) => (
                    <article key={id} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-lg font-bold text-cyan">{name}</h3>
                        <div className="mt-1 text-xs text-purple">{id}</div>
                        <p className="mt-3 text-sm leading-7 text-gray-300">{desc}</p>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">manifest 字段契约</h2>
            <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="grid grid-cols-1 divide-y divide-white/10 md:grid-cols-[240px_1fr] md:divide-y-0">
                    {manifestFields.map(([field, desc]) => (
                        <div key={field} className="contents">
                            <div className="border-b border-white/10 bg-white/[0.05] px-5 py-4 text-sm font-semibold text-cyan md:border-r">
                                {field}
                            </div>
                            <div className="border-b border-white/10 px-5 py-4 text-sm leading-7 text-gray-300">{desc}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">运行时打开链路</h2>
            <ol className="rounded-xl border border-white/10 bg-white/[0.03] p-6 list-decimal space-y-2 pl-10 text-sm leading-7 text-gray-300">
                {runtimeFlow.map((item) => (
                    <li key={item}>{item}</li>
                ))}
            </ol>
            <div className="grid gap-4 md:grid-cols-3">
                {previewModes.map(([mode, desc]) => (
                    <article key={mode} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-lg font-bold text-purple">{mode}</h3>
                        <p className="mt-3 text-sm leading-7 text-gray-300">{desc}</p>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">Tauri 本地 bundle 桥</h2>
            <div className="rounded-xl border border-cyan/30 bg-cyan/[0.06] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-200">
                    {nativeBundleFlow.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">构建与发布链</h2>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {buildFlow.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-6">
                <h2 className="text-2xl font-bold text-white">模块安全边界</h2>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-200">
                    <li>模块包可以渲染独立 HTML/JS，因此入口和远程来源必须来自受控 catalog 与 manifest。</li>
                    <li>package_sha256 是完整性检查，不等同于发布者身份认证；安全隐私页已说明它不是非对称签名。</li>
                    <li>entry_path 和 zip entry 都必须禁止绝对路径、`.`、`..`，防止 zip slip 或目录越界。</li>
                    <li>MoreModuleHostView.vue 只能消费归一化后的 preview_url，不能直接信任远程 payload。</li>
                </ul>
            </article>
            <article className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-6">
                <h2 className="text-2xl font-bold text-white">模块维护清单</h2>
                <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-200">
                    {maintenanceChecks.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ol>
            </article>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">验证入口</h2>
            <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-xl font-bold text-cyan">scripts/test_more_module_bridge.mjs</h3>
                    <p className="mt-3 text-sm leading-7 text-gray-300">
                        该脚本读取远程 catalog.json、manifest.json，调用 /module_bundle/prepare，确认返回的 preview_url
                        命中 /module_bundle/content，并抽取 HTML 与资源文本确认不是占位页。
                    </p>
                </article>
                <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-xl font-bold text-cyan">website_game_modules_contract.spec.ts</h3>
                    <p className="mt-3 text-sm leading-7 text-gray-300">
                        该契约测试确认 website/modules-src 中的游戏与 DEFAULT_MODULE_CENTER 对齐，覆盖 hbut_gomoku、
                        hbut_2048 等模块入口，并检查宿主不会在移动端使用桌面本地桥 URL。
                    </p>
                </article>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">源码证据索引</h2>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {evidence.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-2xl font-bold text-white">继续阅读</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Link href="/docs/extensions" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    用户侧扩展模块说明。
                </Link>
                <Link href="/docs/build-release" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    构建发布与 website modules 产物治理。
                </Link>
                <Link href="/docs/security-privacy" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    模块包、远程内容、hash 和调试桥安全边界。
                </Link>
            </div>
        </section>
    </div>
);

export default ModuleSystem;
