import { Link } from 'react-router-dom';

const overviewCards = [
    {
        title: '用户说明',
        tone: 'text-cyan',
        items: [
            'Mini-HBUT 会处理统一身份认证账号、教务 Cookie、学习通 Cookie、课表、成绩、排名、个人信息、电费、校园码、论坛资料、通知快照和设置项。退出登录只能清理一部分运行态数据，不能等同于全盘擦除本地缓存。',
            '不要把调试日志、Cookie 快照、数据库、截图、验证码图片、二维码、校园码、云同步状态或论坛 token 发给不可信对象。它们可能足以恢复登录态或还原个人学业信息。',
            '云同步、OCR、资料分享、论坛、AI、模块中心、热更新、远程字体和远程配置都会访问网络。使用前应确认当前网络环境、远程端点来源和账号数据是否适合上传。',
        ],
    },
    {
        title: '开发者边界',
        tone: 'text-purple',
        items: [
            '安全边界必须按实际源码描述：SQLite 不是加密数据库，encrypted_password 是 Base64 编码，base64 不是强加密；热更新 signature 目前是 sha256 样式完整性字段，不是非对称签名。',
            '权限边界由 Tauri capability、平台 adapter、Rust command、HTTP bridge 和页面调用点共同组成。已初始化插件不代表前端拥有任意文件系统或系统能力。',
            '远程内容、模块包、customJs、调试桥和本地 HTTP bridge 都属于高风险能力。生产文档不能把它们描述成强沙箱或强身份认证机制。',
        ],
    },
];

const accountSessionLifecycle = [
    {
        stage: '登录输入与统一身份认证',
        evidence: 'src-tauri/src/http_client/auth.rs / src-tauri/src/http_client/mod.rs',
        items: [
            '统一身份认证链路会读取用户名、密码、验证码和 CAS 页面参数。encrypt_password_aes 只用于复现 CAS 前端 AES-CBC 表单加密，不是本地密码存储保护。',
            'HbutClient 在内存中保留 last_username 和 last_password，用于重登、图书馆、电费、学习平台补票等流程。clear_session 会把 last_password、电费 token 和登录态置空。',
            'auth.rs 的调试输出会记录登录 URL、用户名、密码长度、验证码长度、Cookie 等调试信息；开发环境日志要当敏感数据处理，不应上传到 issue、论坛或公开仓库。',
        ],
    },
    {
        stage: 'Cookie Jar 与会话恢复',
        evidence: 'src-tauri/src/http_client/session.rs',
        items: [
            'Rust 侧主 HTTP client 使用 Cookie Jar 维护 code.hbut.edu.cn、auth.hbut.edu.cn、jwxt.hbut.edu.cn、hbut.jw.chaoxing.com 等域名会话。',
            'get_cookies 返回带 Code、Auth、Jwxt、ChaoxingJwxt 作用域的组合 Cookie 字符串；get_cookie_snapshot 返回 code、auth、jwxt、chaoxing_jwxt 结构化 JSON。',
            'restore_session 会解析 user_sessions 中的 Cookie 并写回 Jar；restore_cookie_snapshot 与 load_cookie_snapshot_from_file 还支持从本地 Cookie 快照恢复。',
            '学习通桥接会传播 UID、_uid、fid、cx_p_token、p_auth_token、xxtenc 等关键 Cookie 到 mooc 域名。学习通 Cookie 应按账号登录态处理。',
        ],
    },
    {
        stage: '退出登录与清理',
        evidence: 'src-tauri/src/http_client/session.rs / src/App.vue',
        items: [
            'clear_session 清理的是 HbutClient 内存态、Cookie Jar、last_password、electricity_token、electricity_refresh_token 和用户信息。',
            '前端退出登录会移除或重置 hbu_username、登录状态和部分页面态，但不自动清空所有 SQLite 表、localStorage 缓存、IndexedDB、Cache API、Cookie 快照文件和模块缓存。',
            '开发者新增“清理全部数据”能力时，应显式列出要删除的 user_sessions、online_learning_platform_state、chaoxing_checkin_log、cache:*、hbu_remote_config_snapshot、字体缓存、模块缓存和 Cookie 快照路径。',
        ],
    },
];

const localStorageItems = [
    'hbu_username 保存当前学号或最近使用的学号，hbu_remember 保存是否记住登录名。',
    'localStorage 的 cache:* 保存前端通用缓存，可能包含 grades、schedule、ranking、studentinfo、academic、calendar 等学业数据。',
    'hbu_remote_config_snapshot 保存远程配置快照，会影响 OCR、论坛、资料分享、云同步、模块中心、AI、config_admin_ids 等运行时端点和管理员入口。',
    'hbu_cloud_sync_device_id 是云同步设备标识；hbu_cloud_sync_status:*、hbu_cloud_sync_last_success:*、hbu_cloud_sync_last_upload_success:*、hbu_cloud_sync_last_download_success:* 保存同步状态。',
    'hbu_forum_token:${studentId}、hbu_forum_profile:${studentId} 保存论坛登录 token 和社区资料；这些数据不属于教务 Cookie，但同样是账号相关敏感信息。',
    'hbu_ui_settings_v2 包含 customCss 和 customJs；src/utils/ui_settings.ts 会把 customCss 写入 styleEl.textContent，并把 customJs 写入 scriptEl.textContent 后插入页面执行。',
];

const sqliteTables = [
    {
        name: 'user_sessions',
        desc: '保存 student_id、cookies、encrypted_password、one_code_token、electricity_refresh_token、electricity_token_expires_at、last_login。encrypted_password 当前只是 Base64 编码，base64 不是强加密。',
    },
    {
        name: 'online_learning_platform_state',
        desc: '保存学习平台连接状态、account_id、display_name、cookie_blob、meta_json、sync_time。cookie_blob 能恢复学习通或长江雨课堂会话。',
    },
    {
        name: 'chaoxing_checkin_log',
        desc: '保存学习通签到日志、提交状态、活动信息、位置或图片类输入结果。删除账号数据时应同时考虑该表。',
    },
    {
        name: '缓存表',
        desc: 'grades_cache、schedule_cache、ranking_cache、studentinfo_cache、electricity_cache、transaction_cache、ai_session_cache 等保存业务 JSON 和 sync_time。它们提升离线体验，也扩大本地隐私面。',
    },
];

const cloudRemoteItems = [
    'src/utils/cloud_sync.js 会用 student_id、device_id、reason、payload、secret_ref 发起云同步请求，并通过 /ping 获取 challenge 后在后续请求加入 x-cloud-sync-challenge。',
    '云同步 payload 可包含 hbu_app_settings_v1、hbu_ui_settings_v2、hbu_font_settings_v1、登录入口模式、登录方法、hbu_remember、自定义课程、成绩、排名、个人信息、课表和课表元信息。',
    '当前审计未发现云同步上传密码、Cookie、user_sessions.encrypted_password 或论坛 token 的路径，但会上传足以识别学生和学业状态的数据。',
    'src/utils/remote_config.js 会从 GitCode raw、代理 URL 或 /remote_config.json 加载配置；失败后可回退 hbu_remote_config_snapshot 和 DEFAULT_CONFIG。',
    '远程配置可控制 OCR 端点、forum endpoint、cloud sync endpoint、module center CDN、资源分享 WebDAV、AI models、config_admin_ids。它是运行时信任边界，不只是 UI 配置。',
    'OCR 会把验证码图片或 base64 数据发给配置端点；默认配置中存在 HTTPS 远程 OCR 和 HTTP fallback，HTTP 明文链路不能按强隐私传输描述。',
];

const platformPermissionItems = [
    'src-tauri/capabilities/main.json 绑定 windows: ["main"]，授权 core:default、notification:default、notification:allow-request-permission、notification:allow-is-permission-granted、notification:allow-notify、notification:allow-create-channel、notification:allow-list-channels、shell:default、window-state:default。',
    'src-tauri/src/lib.rs 初始化 tauri_plugin_notification、tauri_plugin_shell、tauri_plugin_fs、tauri_plugin_autostart、tauri_plugin_window_state、keep-screen-on 等插件。插件初始化不等于前端页面拥有任意 fs 权限。',
    'shell:default 允许外链打开能力，风险边界依赖 URL 校验、调用点约束和用户可感知跳转。open_external_url 当前只允许 http、https、mailto、tel、weixin、wechat、小程序等有限协议。',
    'src-tauri/tauri.conf.json 中 security.csp 为 null，等价于 csp: null。当前不能依赖 Tauri 配置层 CSP 阻止远程脚本、iframe、模块内容或 customJs。',
    '通知权限仅代表可请求和发送本地通知，不代表后台常驻服务稳定可用。Android 前台服务、iOS 后台任务、Web Notification 和桌面通知各自有系统限制。',
];

const remoteContentRisks = [
    {
        title: '模块包',
        source: 'src-tauri/src/modules/module_bundle.rs / src/utils/more_modules.js',
        items: [
            '模块包来自远程 manifest，package_url 指向 bundle.zip，package_sha256 用于内容完整性校验。没有 package_sha256 时只能记录实际 sha256，不能证明来源可信。',
            'Rust 解包使用 enclosed_name() 并检查 output_path.starts_with(temp_root)，用于限制 zip 路径穿越；entry_path 也会拒绝根路径和 .. 片段。',
            'zip 路径净化只能防止写出缓存目录，不能防止模块自身前端逻辑滥用宿主已经暴露的 Web 能力。远程内容应按不可信前端代码处理。',
        ],
    },
    {
        title: '热更新',
        source: 'src/utils/hot_update.js / src/utils/hot_update_core.js',
        items: [
            '热更新框架默认关闭，src/utils/hot_update.js 会先检查 debug runtime config，只有 enableHotUpdateFramework 开启时才继续。',
            'manifest 必须包含 version、bundle_url、sha256、signature、min_bootstrap_version、max_bootstrap_version、min_native_version、max_native_version。',
            '下载后先计算 sha256，再调用 verifyHotBundleSignature。当前 verifyHotBundleSignature 接受 digest 相等或 signature 以 sha256: 开头的方案，不是非对称签名体系。',
            '因此 signature 只能描述为完整性字段或弱签名占位，不能写成公钥验签、代码签名或发布者身份认证。',
        ],
    },
    {
        title: '调试桥',
        source: 'src-tauri/src/debug_bridge.rs / src-tauri/src/http_server.rs / src/utils/debug_bridge_client.js',
        items: [
            '调试桥默认关闭，enableBridgeTools 默认 false；src/main.ts 只有在 get_debug_runtime_config 返回 enableBridgeTools 时才加载 debug_bridge 客户端。',
            '本地 HTTP bridge 的 debug_bridge 接口可截图、导航、打开模块、读取状态、重置更多模块缓存。它是开发/测试能力，不应暴露到公网或局域网。',
            'debug_bridge_client.js 会同时发送 Authorization: Bearer 和 x-local-token。调试 token、截图和 DOM 状态均可能包含隐私信息。',
        ],
    },
];

const guardRails = [
    'scripts/guard_sensitive_uploads.mjs 可在 pre-commit、pre-push、scan-file 模式下扫描 Turso/libsql URL、JWT、HuggingFace token、Resend key、Bearer token 和敏感环境变量。',
    'scripts/check-frontend-safety.mjs 会扫描前端裸调 chaoxing.com、console.log 中的 password/cookie/token/Authorization 等敏感字段，以及超星签到 Rust sleep(10 硬编码延迟。',
    'scripts/check-design-tokens.mjs 扫描 MoreChaoxingCheckinView.vue 和 src/components/chaoxing_checkin 的样式硬编码颜色。它是 UI 质量守卫，不替代安全扫描。',
    '这些脚本是提交链路和源码启发式守卫，不是运行时 DLP、密钥托管、数据库加密、CSP 或远程内容沙箱。',
];

const userChecklist = [
    '退出登录后，如需彻底清理个人数据，还应清理应用数据目录、浏览器 localStorage、IndexedDB、Cache API、Cookie 快照、模块缓存和云同步状态。',
    '不要把 hbut_cookie_snapshot.json、SQLite 数据库、调试截图、日志、二维码、校园码、验证码图片、论坛 token 或 cloud sync 状态发给陌生人。',
    '使用云同步前确认远端服务来源；关闭云同步只能阻止后续同步，不代表已经删除服务端历史数据。',
    '开启自定义 JS、调试桥、热更新或第三方模块前，确认来源可信。customJs 会作为真实脚本执行，不是普通主题文本。',
    '使用资料分享、论坛、AI、OCR 和远程模块时，默认会发生网络请求；校园网、代理、公共 Wi-Fi 或 HTTP fallback 都可能改变传输风险。',
];

const developerChecklist = [
    '新增持久化字段前，先判断它是否属于密码、Cookie、token、个人信息、成绩、位置、图片、日志或设备标识，并更新本页的敏感信息生命周期。',
    '新增 Tauri 插件或前端直接调用插件 API 前，同时检查 src-tauri/capabilities/main.json、Rust builder 初始化、PlatformBridge 和具体调用点。',
    '新增远程配置字段时，必须说明默认值、快照 key、可信来源、失败回退、是否能改变 endpoint、是否会启用远程内容或管理员入口。',
    '新增模块包、热更新、iframe 或外链能力时，必须要求 HTTPS、sha256、package_sha256、版本范围、路径净化、可回滚状态和禁用开关。',
    '新增日志时禁止输出明文 password、Cookie、Authorization、token、one_code_token、electricity_refresh_token、cookie_blob、验证码 base64 和云同步 challenge。',
];

const lifecycleRows = [
    ['输入', '学号、密码、验证码、Cookie、二维码、签到图片、论坛内容、设置项。', 'LoginV3.vue、auth.rs、chaoxing_checkin、forum_api.js。'],
    ['内存', 'last_password、Cookie Jar、electricity_token、electricity_refresh_token、OCR runtime config、用户信息。', 'src-tauri/src/http_client/mod.rs、session.rs。'],
    ['本地持久化', 'user_sessions、encrypted_password、one_code_token、online_learning_platform_state.cookie_blob、chaoxing_checkin_log、cache:*、hbu_username。', 'src-tauri/src/db.rs、localStorage。'],
    ['网络传输', 'CAS 表单、验证码 OCR、教务接口、超星接口、云同步 payload、论坛 Bearer token、资料分享 WebDAV、模块 manifest。', 'auth.rs、cloud_sync.js、remote_config.js、forum_api.js、module_bundle.rs。'],
    ['清理与回滚', 'clear_session、退出登录、云同步状态、模块缓存、热更新 staged 状态、调试桥状态。', 'session.rs、App.vue、more_modules.js、hot_update.js、debug_bridge.rs。'],
];

const sourceEvidence = [
    '账号与登录证据：src-tauri/src/http_client/auth.rs 的登录参数、encrypt_password_aes 调用、last_password 缓存；src-tauri/src/http_client/mod.rs 的 HbutClient、Cookie Jar、electricity_token、electricity_refresh_token、danger_accept_invalid_certs(true)。',
    '会话证据：src-tauri/src/http_client/session.rs 的 get_cookies、get_cookie_snapshot、restore_session、restore_cookie_snapshot、clear_session、save_cookie_snapshot_to_file、load_cookie_snapshot_from_file。',
    '数据库证据：src-tauri/src/db.rs 的 user_sessions、encrypted_password、one_code_token、electricity_refresh_token、online_learning_platform_state、cookie_blob、chaoxing_checkin_log、grades_cache、schedule_cache。',
    '前端存储证据：src/App.vue 和 LoginV3.vue 的 hbu_username、hbu_remember；src/utils/api.js 的 cache:*；src/utils/forum_api.js 的 hbu_forum_token；src/utils/ui_settings.ts 的 customCss、customJs、scriptEl.textContent。',
    '云同步和远程配置证据：src/utils/cloud_sync.js 的 hbu_cloud_sync_device_id、hbu_cloud_sync_status、x-cloud-sync-challenge、buildSyncPayload；src/utils/remote_config.js 的 hbu_remote_config_snapshot、config_admin_ids。',
    '权限证据：src-tauri/capabilities/main.json 的 notification:allow-request-permission、shell:default、window-state:default；src-tauri/tauri.conf.json 的 security.csp 和 csp: null。',
    '远程内容证据：src-tauri/src/modules/module_bundle.rs 的 package_sha256、sha256_hex、enclosed_name、output_path.starts_with；src/utils/more_modules.js 的 package_sha256 缓存和本地包状态。',
    '调试与热更新证据：src-tauri/src/debug_bridge.rs 的 enable_bridge_tools；src/utils/debug_bridge_client.js 的 Authorization 和 x-local-token；src/utils/hot_update_core.js 的 verifyHotBundleSignature、sha256、signature。',
    '守卫脚本证据：scripts/guard_sensitive_uploads.mjs、scripts/check-frontend-safety.mjs、scripts/check-design-tokens.mjs。',
];

const SecurityPrivacy = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">用户与开发者文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                安全与隐私
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                本页把 Mini-HBUT 的账号、Cookie、密码、token、本地缓存、SQLite、云同步、远程配置、权限、远程内容、模块包、
                调试桥和热更新放在同一张安全地图里。它不是法律合规声明，而是基于当前源码的敏感信息生命周期和开发者边界说明。
            </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
            {overviewCards.map((card) => (
                <article key={card.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                    <h2 className={`text-2xl font-bold ${card.tone}`}>{card.title}</h2>
                    <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                        {card.items.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </article>
            ))}
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">账号、Cookie 与会话生命周期</h2>
            <div className="grid gap-4 lg:grid-cols-3">
                {accountSessionLifecycle.map((block) => (
                    <article key={block.stage} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="text-xl font-bold text-cyan">{block.stage}</h3>
                        <div className="mt-1 text-xs leading-6 text-gray-500">{block.evidence}</div>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                            {block.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">本地存储、SQLite 与缓存</h2>
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <article className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                    <h3 className="text-xl font-bold text-purple">localStorage 和 Web 存储</h3>
                    <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                        {localStorageItems.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </article>
                <article className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                    <h3 className="text-xl font-bold text-purple">SQLite 高敏感表</h3>
                    <div className="mt-5 divide-y divide-white/10">
                        {sqliteTables.map((table) => (
                            <div key={table.name} className="grid gap-2 py-3 text-sm leading-7 md:grid-cols-[220px_1fr]">
                                <div className="font-semibold text-cyan">{table.name}</div>
                                <div className="text-gray-300">{table.desc}</div>
                            </div>
                        ))}
                    </div>
                </article>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">云同步、OCR 与远程配置</h2>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {cloudRemoteItems.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">平台权限边界</h2>
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-200">
                    {platformPermissionItems.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">远程内容、模块包、调试桥与热更新</h2>
            <div className="grid gap-4 lg:grid-cols-3">
                {remoteContentRisks.map((risk) => (
                    <article key={risk.title} className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-5">
                        <h3 className="text-xl font-bold text-white">{risk.title}</h3>
                        <div className="mt-1 text-xs leading-6 text-red-100/80">{risk.source}</div>
                        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-200">
                            {risk.items.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">敏感信息生命周期</h2>
            <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="grid grid-cols-1 divide-y divide-white/10 md:grid-cols-[160px_1fr_1fr] md:divide-y-0">
                    {lifecycleRows.map(([stage, data, evidence]) => (
                        <div key={stage} className="contents">
                            <div className="border-b border-white/10 bg-white/[0.05] px-5 py-4 text-sm font-semibold text-cyan md:border-r">
                                {stage}
                            </div>
                            <div className="border-b border-white/10 px-5 py-4 text-sm leading-7 text-gray-300 md:border-r">{data}</div>
                            <div className="border-b border-white/10 px-5 py-4 text-sm leading-7 text-gray-300">{evidence}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <h2 className="text-2xl font-bold text-white">安全守卫脚本</h2>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {guardRails.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </article>
            <article className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <h2 className="text-2xl font-bold text-white">用户操作建议</h2>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {userChecklist.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </article>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">开发者检查清单</h2>
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.06] p-6">
                <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-200">
                    {developerChecklist.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ol>
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
                <Link to="/docs/architecture" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    回到架构与数据流，查看 Cookie、SQLite、云同步、缓存和错误处理如何连接。
                </Link>
                <Link to="/docs/platform-tauri" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    继续阅读平台与 Tauri，核对 capability、shell、通知、Widget 和运行时桥接边界。
                </Link>
                <Link to="/docs/build-release" className="rounded-lg border border-white/10 p-4 text-sm leading-7 text-gray-300 transition-colors hover:border-cyan/50">
                    继续阅读构建发布，检查 guard_sensitive_uploads、check-frontend-safety、热更新包和模块发布流程。
                </Link>
            </div>
        </section>
    </div>
);

export default SecurityPrivacy;
