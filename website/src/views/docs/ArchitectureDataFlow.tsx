import Link from 'next/link';

const requestEntries = [
    {
        title: '兼容 axios 的主业务入口',
        source: 'src/utils/axios_adapter.js',
        items: [
            'src/utils/axios_adapter.js 把历史 axios.get / axios.post 调用适配成 Tauri command 或本地 bridge 请求。Tauri 运行时优先 invokeNative，非 Tauri 运行时使用 /bridge 或 http://127.0.0.1:4399 兜底。',
            'adapter.get 覆盖 /v3/login_params、/v2/semesters、/v2/qxzkb/options、/v2/classroom/buildings 等查询入口；adapter.post 覆盖 /v2/start_login、验证码刷新和大量教务/一卡通写入式请求。',
            'mockResponse 和 mockError 让旧组件继续拿到近似 axios 的 response 结构，但这不是全局异常体系，调用方仍要检查 success、error、need_login 等业务字段。',
        ],
    },
    {
        title: '浏览器直连和辅助服务入口',
        source: 'src/utils/api.ts',
        items: [
            'src/utils/api.ts 是辅助 HTTP 服务入口，包含 serverOcrRecognize、syncDataToServer、fetchDataFromServer。',
            'serverOcrRecognize 直接向 SERVER_API_BASE 的 /ocr/recognize 发送验证码图片；syncDataToServer 和 fetchDataFromServer 是旧式数据备份接口，不等同于当前主线 cloud_sync。',
            '该文件仍保留 http://1.94.167.18:5080/api 这类直连地址，文档和安全审计必须把它标为独立辅助链路，而不是 Tauri 主数据层。',
        ],
    },
    {
        title: '远程配置和静态资源链路',
        source: 'src/utils/remote_config.js / src/utils/static_resource_cache.js',
        items: [
            'src/utils/remote_config.js 维护 CONFIG_URLS、DEFAULT_CONFIG、hbu_remote_config_snapshot，并通过 fetchByInvoke、fetchByCapacitor、fetchByWeb 多源拉取远程配置。',
            'normalizeRemoteConfig 会归一 OCR、WebDAV、forum、cloud_sync、module_center、ai_models、config_admin_ids 等配置字段，并持久化 OCR 端点到独立 localStorage key。',
            'src/utils/static_resource_cache.js 使用 static_resource:dormitory_data 缓存宿舍数据，优先 invokeNative(fetch_remote_json)，失败后走浏览器 fetch、多源 URL 和缓存兜底。',
        ],
    },
];

const cacheLayers = [
    {
        title: '前端通用缓存',
        source: 'src/utils/api.js',
        items: [
            'fetchWithCache 是前端通用缓存入口，先查 memoryCache，再查 localStorage 中的 cache:* 键，命中后返回 fromCache 和 timestamp。',
            'getCachedData、setCachedData、getBestCachedEntry、withOfflineMeta 构成缓存读写和陈旧缓存回退。setCachedData 会限制 MAX_LOCAL_CACHE_ENTRIES 和 MAX_LOCAL_CACHE_VALUE_BYTES。',
            'isQuotaExceededError、trimLocalCacheStorage、enforceLocalCacheCountLimit 处理 localStorage 配额问题；classroom: 这类高频查询不再写入 localStorage，因为后端 SQLite 已承担缓存。',
        ],
    },
    {
        title: '教务维护模式',
        source: 'src/utils/api.js',
        items: [
            'hbu_jwxt_maintenance、hbu_jwxt_maintenance_time、hbu_jwxt_maintenance_hint 记录本地维护模式。',
            'looksLikeMaintenanceIssue 根据网络错误、DNS、timed out、维护、暂不可用、连接失败等文本做启发式判断；setMaintenanceFlag 写 localStorage 并广播 hbu-jwxt-maintenance 事件。',
            '维护模式只影响 JWXT_KEY_PREFIXES 命中的教务类缓存键，不是服务端权威状态，也不是全站网络熔断。',
        ],
    },
    {
        title: 'SQLite 缓存和会话',
        source: 'src-tauri/src/db.rs',
        items: [
            'src-tauri/src/db.rs 的 init_db 创建 grades_cache、schedule_cache、exams_cache、studentinfo_cache、calendar_cache、ranking_cache、academic_progress_cache、training_plan_cache、classroom_cache、electricity_cache、transaction_cache、ai_session_cache 等表。',
            'save_cache 和 get_cache 以 JSON 字符串保存数据，并记录 sync_time；多数 Tauri command 采用网络成功写缓存、失败读缓存并附加 offline/sync_time 的模式。',
            'user_sessions 保存 student_id、cookies、encrypted_password、one_code_token、electricity_refresh_token、electricity_token_expires_at、last_login 等字段，是敏感会话表。',
        ],
    },
];

const remoteFlows = [
    {
        title: '远程配置快照',
        source: 'src/utils/remote_config.js',
        desc: 'loadRemoteConfig 会优先复用短期内存缓存，拉取失败时读取 hbu_remote_config_snapshot，再失败才回到 DEFAULT_CONFIG。配置会影响 OCR、论坛、资料分享、模块中心、云同步、AI 和管理员入口。',
    },
    {
        title: '云同步',
        source: 'src/utils/cloud_sync.js',
        desc: 'src/utils/cloud_sync.js 从 app settings、远程配置和本地 override 合成运行参数。requestCloudSync 会通过 /ping 获取 challenge，并在后续请求中加入 x-cloud-sync-challenge；上传和下载都有 cooldown，失败会记录 hbu_cloud_sync_status:* 并继续向上抛错。',
    },
    {
        title: '同步负载和应用',
        source: 'src/utils/cloud_sync.js',
        desc: 'buildSyncPayload 从 localStorage 缓存、设置、自定义课程和学业数据构造上传包；runCloudSyncDownload 会调用 applySettingsFromCloud、replaceCustomCourses、applyAcademicFromCloud，把云端设置和课程数据写回本地。',
    },
    {
        title: '登录后自动同步',
        source: 'src/utils/cloud_sync.js',
        desc: 'runAutoCloudSyncAfterLogin 以下载优先，然后用 primeAcademicCaches 补齐学业缓存并尝试上传。它不是实时双向同步，而是受触发时机、远程配置、账号格式、网络和 cooldown 共同限制的同步流程。',
    },
];

const notificationFlows = [
    'src/utils/notify_center.js 的 runNotificationCheck 会并发执行课表、成绩、考试、电费检查，再调用 sendQueuedNotifications 发送本地通知。',
    '通知中心通过 syncBackgroundFetchContext 把学号、API base、通知开关、提前分钟数和周期写给 src/utils/background_fetch.js，移动端后台任务再回调同一套检查逻辑。',
    'hbu_notify_snapshot:* 保存上次通知快照；后台检查关闭或失败时，getStoredSnapshot 可作为 fallbackSnapshot 返回给页面。',
    'src/utils/widget_bridge.ts 从课表缓存和自定义课程构建 Widget 数据，writeElectricityToWidget 和 writeExamToWidget 由通知检查结果驱动。',
    'src/utils/widget_snapshot.ts 的 buildTodayCourseSnapshot 是纯函数，不访问 localStorage、网络或原生桥，因此 Widget 不是直接联网刷新，而是消费缓存和快照。',
];

const nativeFlows = [
    {
        title: 'HbutClient 和 Cookie Jar',
        source: 'src-tauri/src/http_client/mod.rs',
        items: [
            'HbutClient 持有 reqwest::Client、独立 ocr_client、Cookie Jar、登录状态、用户信息、电费 token、OCR 运行态、登录冷却和重登冷却字段。',
            '主 HTTP client 使用 cookie_store(true) 和 cookie_provider(Arc<Jar>)，让 CAS、教务、图书馆、一码通、超星链路共享 Cookie Jar；OCR 使用独立 ocr_client，避免污染主会话。',
            'academic_base_url 会根据 prefer_chaoxing_jwxt 或超星 Cookie 自动选择 jwxt.hbut.edu.cn 或 hbut.jw.chaoxing.com。',
        ],
    },
    {
        title: '登录、会话和冷却',
        source: 'src-tauri/src/http_client/session.rs / auth.rs',
        items: [
            'encrypt_password_aes 复现 CAS 前端 AES-CBC 加密；login_cooldown_remaining 限制普通登录 60 秒，relogin_cooldown_remaining 限制自动重登 180 秒。',
            'restore_session、refresh_session、get_cookie_snapshot、restore_cookie_snapshot、save_cookie_snapshot_to_file、load_cookie_snapshot_from_file 负责 Cookie 快照导入导出和本地恢复。',
            'try_bridge_cas_to_chaoxing 与 ensure_chaoxing_academic_session 用于 CAS 到超星教务的桥接补票，解决已登录但接口未授权的跨域会话问题。',
        ],
    },
    {
        title: '电费、一卡通和 AI token',
        source: 'src-tauri/src/http_client/electricity.rs / ai.rs',
        items: [
            'ensure_electricity_token 优先复用内存 token，然后尝试 refresh token，必要时重新 SSO 获取；校园码、交易记录、电费查询复用同一类 one_code_token。',
            'persist_electricity_tokens 会把 one_code_token、refresh_token、token_expires_at 写入 user_sessions，供下次启动恢复。',
            'init_ai_session 会尝试读取 ai_session_cache、复用一码通 token、获取 blade_auth，并把 token 写回 ai_session_cache；AI 可用性依赖外部服务和会话有效性。',
        ],
    },
];

const errorBoundaries = [
    '错误处理没有完全统一：axios_adapter.js 常返回 { success:false, error }，forum_api.js 会 throw Error，cloud_sync.js 会先写状态再 throw error，Tauri command 层大量使用 Result<T, String>。',
    '离线能力边界必须写清：缓存命中或 stale fallback 才能展示 offline 数据，首次无缓存、会话失效、token 过期或实时接口必需联网时仍会失败。',
    '敏感信息边界必须写清：user_sessions 和 Cookie 快照足以恢复账号会话，不能当普通缓存处理。',
    'base64 不是强加密：db.rs 中 encrypted_password 实际是 Base64 编码，不能描述为可靠加密保护。',
    '远程服务可用性不能保证：CAS、教务、超星、OPAC、OCR、AI、云同步代理和 WebDAV 都是外部依赖。',
    '缓存表名当前由代码固定调用点传入 save_cache/get_cache；如果未来暴露外部输入，需要额外限制表名，避免 SQL 拼接风险。',
];

const sourceEvidence = [
    '前端请求入口：src/utils/axios_adapter.js 的 adapter.get、adapter.post、mockResponse、mockError、bridgePost、bridgeGet。',
    '前端缓存证据：src/utils/api.js 的 fetchWithCache、getCachedData、setCachedData、withOfflineMeta、isQuotaExceededError、looksLikeMaintenanceIssue、setMaintenanceFlag、hbu_jwxt_maintenance。',
    '辅助服务证据：src/utils/api.ts 的 serverOcrRecognize、syncDataToServer、fetchDataFromServer。',
    '远程配置证据：src/utils/remote_config.js 的 hbu_remote_config_snapshot、normalizeRemoteConfig、fetchByInvoke、fetchByCapacitor、fetchByWeb、applyOcrRuntimeConfig、cloud_sync。',
    '云同步证据：src/utils/cloud_sync.js 的 getCloudSyncRuntimeConfig、requestCloudSync、x-cloud-sync-challenge、buildSyncPayload、runCloudSyncUpload、runCloudSyncDownload、runAutoCloudSyncAfterLogin、cooldown。',
    '静态资源证据：src/utils/static_resource_cache.js 的 fetchDormitoryDataset、static_resource:dormitory_data、fetchJsonNoStore、withOfflineMeta。',
    '论坛和通知证据：src/utils/forum_api.js 的 hbu_forum_token、parseJsonResponse、request；src/utils/notify_center.js 的 runNotificationCheck、sendQueuedNotifications、syncBackgroundFetchContext。',
    'Widget 证据：src/utils/background_fetch.js、src/utils/widget_bridge.ts、src/utils/widget_snapshot.ts。',
    'Rust HTTP 证据：src-tauri/src/http_client/mod.rs 的 HbutClient、Cookie Jar、encrypt_password_aes、academic_base_url、login_cooldown_remaining。',
    'Rust 会话证据：src-tauri/src/http_client/session.rs 的 restore_session、refresh_session、get_cookie_snapshot、restore_cookie_snapshot、clear_session。',
    'SQLite 证据：src-tauri/src/db.rs 的 init_db、save_cache、get_cache、user_sessions、grades_cache、schedule_cache、electricity_cache、ai_session_cache。',
];

const ArchitectureDataFlow = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">开发者文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                架构与数据流
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                本页从请求入口、缓存层级、远程配置、云同步、通知/Widget、Rust HTTP client、SQLite 和错误处理几个维度说明 Mini-HBUT 的数据如何流动。
                它承接开发者总览，继续解释 API 调用、缓存、离线、维护模式、错误提示和敏感信息处理边界。
            </p>
        </header>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">请求入口</h2>
            <div className="grid gap-4 lg:grid-cols-3">
                {requestEntries.map((entry) => (
                    <article key={entry.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-cyan">{entry.title}</h3>
                        <div className="mt-1 text-xs leading-6 text-gray-500">{entry.source}</div>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {entry.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">缓存、离线和维护模式</h2>
            <div className="grid gap-4 lg:grid-cols-3">
                {cacheLayers.map((layer) => (
                    <article key={layer.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-purple">{layer.title}</h3>
                        <div className="mt-1 text-xs leading-6 text-gray-500">{layer.source}</div>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {layer.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">远程配置和云同步数据流</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {remoteFlows.map((flow) => (
                    <article key={flow.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-white">{flow.title}</h3>
                        <div className="mt-1 text-xs leading-6 text-cyan">{flow.source}</div>
                        <p className="mt-3 text-sm leading-7 text-gray-300">{flow.desc}</p>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">通知和 Widget 数据流</h2>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {notificationFlows.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">Rust 会话、网络和数据库</h2>
            <div className="grid gap-4 lg:grid-cols-3">
                {nativeFlows.map((flow) => (
                    <article key={flow.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-cyan">{flow.title}</h3>
                        <div className="mt-1 text-xs leading-6 text-gray-500">{flow.source}</div>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {flow.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">错误处理、敏感信息边界和离线能力边界</h2>
            <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-200">
                    {errorBoundaries.map((item) => (
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
                    回到开发者架构总览，重新查看入口层、视图调度层和平台边界。
                </Link>
                <Link href="/docs/platform-tauri" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    继续阅读平台与 Tauri，展开原生桥接、权限和运行时能力矩阵。
                </Link>
                <Link href="/docs/security-privacy" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    继续阅读安全与隐私，细化 Cookie、token、Base64、远程配置和自定义脚本风险。
                </Link>
            </div>
        </section>
    </div>
);

export default ArchitectureDataFlow;
