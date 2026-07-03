import { Cpu, Layers, GitBranch, ArrowRightLeft, Shield, Globe, Workflow, Server, RefreshCw, Zap } from 'lucide-react';

const Technical = () => {
    return (
        <div className="space-y-12">
            {/* 页面标题 */}
            <div className="border-b border-gray-800 pb-6">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                    技术原理
                </h1>
                <p className="text-xl text-gray-400">
                    深入了解 Mini-HBUT 的架构设计、数据流、跨平台实现机制和核心技术方案。
                </p>
            </div>

            {/* ===== 整体架构 ===== */}
            <section className="space-y-6" id="architecture">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Layers className="text-cyan" size={26} />
                    整体架构
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-bold text-white">技术栈总览</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                            <h4 className="font-semibold text-cyan mb-2">前端</h4>
                            <ul className="text-sm text-gray-300 space-y-1">
                                <li>• Vue 3 + TypeScript + Composition API</li>
                                <li>• Vite 构建工具（端口 1420）</li>
                                <li>• Vant 4 UI 组件库</li>
                                <li>• Pinia 状态管理</li>
                                <li>• 自定义 CSS 变量主题系统</li>
                            </ul>
                        </div>
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                            <h4 className="font-semibold text-cyan mb-2">桌面后端（Tauri 2.x）</h4>
                            <ul className="text-sm text-gray-300 space-y-1">
                                <li>• Rust + Tokio 异步运行时</li>
                                <li>• reqwest HTTP 客户端</li>
                                <li>• scraper HTML 解析器</li>
                                <li>• SQLite 本地数据库</li>
                                <li>• 本地 HTTP Bridge（127.0.0.1:4399）</li>
                            </ul>
                        </div>
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                            <h4 className="font-semibold text-cyan mb-2">移动端（Capacitor 6.x）</h4>
                            <ul className="text-sm text-gray-300 space-y-1">
                                <li>• Android: Gradle + WebView</li>
                                <li>• iOS: Xcode + WKWebView</li>
                                <li>• Background Fetch 后台任务</li>
                                <li>• Local Notifications 本地通知</li>
                                <li>• Preferences 持久化存储</li>
                            </ul>
                        </div>
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                            <h4 className="font-semibold text-cyan mb-2">云服务</h4>
                            <ul className="text-sm text-gray-300 space-y-1">
                                <li>• Cloudflare Workers 云同步</li>
                                <li>• Cloudflare KV 数据存储</li>
                                <li>• GitHub Actions CI/CD</li>
                                <li>• jsDelivr / unpkg CDN</li>
                                <li>• GitCode 远程配置托管</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-bold text-white">架构图</h3>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto font-mono">
                        <code>{`┌─────────────────────────────────────────────────────────────┐
│                        用户界面 (Vue 3)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 成绩查询  │ │ 课表管理  │ │ 考试安排  │ │  ...更多  │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       └────────────┼────────────┼────────────┘              │
│                    ▼                                         │
│          ┌──────────────────┐                                │
│          │  平台桥接层        │                                │
│          │  (src/platform/)  │                                │
│          └───┬──────┬───┬───┘                                │
└──────────────┼──────┼───┼───────────────────────────────────┘
               │      │   │
    ┌──────────▼──┐ ┌─▼───▼──────┐ ┌────────────┐
    │  Tauri 2.x  │ │ Capacitor  │ │  Web 模式   │
    │  (Rust)     │ │ (Native)   │ │ (Browser)  │
    │             │ │            │ │            │
    │ • HTTP客户端 │ │ • Native   │ │ • Fetch    │
    │ • SQLite    │ │   Plugins  │ │ • IndexedDB│
    │ • Bridge    │ │ • BGFetch  │ │            │
    └──────┬──────┘ └─────┬──────┘ └─────┬──────┘
           │              │              │
           ▼              ▼              ▼
    ┌──────────────────────────────────────────┐
    │          教务系统 / 电费系统 / ...          │
    │         (学校内网服务)                      │
    └──────────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────┐
    │          云服务层                          │
    │  • Cloudflare Workers (云同步)            │
    │  • OCR 服务 (验证码识别)                   │
    │  • 远程配置 (GitCode/GitHub)              │
    │  • CDN (jsDelivr/unpkg)                  │
    └─────────────────────────────────────────┘`}</code>
                    </pre>
                </div>
            </section>

            {/* ===== 跨平台桥接 ===== */}
            <section className="space-y-6" id="platform-bridge">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <GitBranch className="text-purple" size={26} />
                    跨平台桥接机制
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <p className="text-gray-300">
                        Mini-HBUT 的核心设计原则是<strong>「一套前端代码，多平台运行」</strong>。通过平台桥接层（<code className="text-sm text-cyan">src/platform/</code>），
                        前端组件无需关心底层运行环境，所有平台差异在桥接层统一抽象。
                    </p>

                    <h3 className="text-lg font-bold text-white mt-4">运行时检测</h3>
                    <p className="text-gray-300 text-sm">
                        <code className="text-cyan">src/platform/runtime.ts</code> 负责在启动时自动检测当前运行平台：
                    </p>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                        <code>{`// 检测优先级
1. window.__TAURI__     → 'tauri'     (桌面端)
2. window.Capacitor     → 'capacitor' (移动端)
3. 其他                  → 'web'       (浏览器)`}</code>
                    </pre>

                    <h3 className="text-lg font-bold text-white mt-4">能力抽象</h3>
                    <p className="text-gray-300 text-sm">
                        <code className="text-cyan">src/platform/types.ts</code> 定义了统一的能力接口，每个平台有对应的适配器实现：
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left mt-2">
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="py-2 px-3 text-gray-400">能力</th>
                                    <th className="py-2 px-3 text-gray-400">Tauri 实现</th>
                                    <th className="py-2 px-3 text-gray-400">Capacitor 实现</th>
                                    <th className="py-2 px-3 text-gray-400">Web 实现</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-300">
                                {[
                                    ['打开链接', 'Tauri Shell Plugin', 'Capacitor Browser', 'window.open'],
                                    ['发送通知', 'Tauri Notification', 'LocalNotifications', 'Notification API'],
                                    ['HTTP 请求', 'Rust reqwest', 'Capacitor HTTP', 'Fetch API'],
                                    ['屏幕常亮', '不支持', 'KeepAwake Plugin', '不支持'],
                                    ['文件操作', 'Tauri FS Plugin', 'Capacitor Filesystem', 'IndexedDB'],
                                    ['分享', '不支持', 'Capacitor Share', '不支持'],
                                ].map((row, i) => (
                                    <tr key={i} className="border-b border-gray-800/50">
                                        {row.map((cell, j) => (
                                            <td key={j} className="py-2 px-3 text-xs">{cell}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-sm">
                        <strong>ℹ️ 设计规范：</strong>页面层组件不直接调用 <code className="text-xs">@tauri-apps/api</code> 或 <code className="text-xs">@capacitor/*</code>，
                        而是统一通过 <code className="text-xs">src/platform/</code> 暴露的接口调用。新增原生能力必须先在 <code className="text-xs">types.ts</code> 中定义接口，
                        再在各适配器中实现。
                    </div>
                </div>
            </section>

            {/* ===== 登录与会话 ===== */}
            <section className="space-y-6" id="auth-session">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Shield className="text-cyan" size={26} />
                    登录与会话管理
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-bold text-white">CAS 登录流程</h3>
                    <p className="text-gray-300 text-sm">新融合门户使用 CAS 单点登录协议，完整流程如下：</p>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto font-mono">
                        <code>{`客户端                    教务系统                  OCR 服务
  │                         │                         │
  │  1. GET 登录页面         │                         │
  │ ─────────────────────▶  │                         │
  │  2. 返回HTML+验证码图片  │                         │
  │ ◀─────────────────────  │                         │
  │                         │                         │
  │  3. 发送验证码图片(base64)│                         │
  │ ──────────────────────────────────────────────▶   │
  │  4. 返回识别结果         │                         │
  │ ◀──────────────────────────────────────────────   │
  │                         │                         │
  │  5. POST 登录请求        │                         │
  │    (账号+密码+验证码)     │                         │
  │ ─────────────────────▶  │                         │
  │  6. 返回Cookie/重定向    │                         │
  │ ◀─────────────────────  │                         │
  │                         │                         │
  │  7. 保存Cookie到本地     │                         │
  │  8. 获取最新成绩/课表    │                         │
  │ ─────────────────────▶  │                         │`}</code>
                    </pre>

                    <h3 className="text-lg font-bold text-white mt-4">会话恢复策略</h3>
                    <p className="text-gray-300 text-sm">应用启动时会按以下优先级恢复登录状态：</p>
                    <ol className="list-decimal list-inside space-y-2 ml-4 text-gray-300 text-sm">
                        <li><strong>本地 Cookie 恢复：</strong>尝试使用本地存储的 Cookie 直接访问教务系统，如果 Cookie 仍有效则直接进入。</li>
                        <li><strong>最新会话恢复：</strong>如果 Cookie 失效，尝试读取最近一次会话的凭据重新建立连接。</li>
                        <li><strong>自动重登：</strong>如果保存了密码（非加密临时登录），使用保存的密码自动完成登录流程。</li>
                        <li><strong>引导登录：</strong>如果以上都失败，展示登录页面让用户手动登录。</li>
                    </ol>

                    <h3 className="text-lg font-bold text-white mt-4">学习通登录</h3>
                    <p className="text-gray-300 text-sm">学习通登录使用超星教育平台 API：</p>
                    <ul className="list-disc list-inside space-y-1 ml-4 text-gray-300 text-sm">
                        <li>密码使用 <strong>AES-128-CBC</strong> 加密后传输。</li>
                        <li>登录成功后通过 SSO 关联到学校教务系统。</li>
                        <li>学号解析策略：payload 解析 → 缓存读取 → API 查询 → 降级处理。</li>
                    </ul>

                    <h3 className="text-lg font-bold text-white mt-4">扫码登录</h3>
                    <p className="text-gray-300 text-sm">扫码登录流程（门户/学习通通用）：</p>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                        <code>{`1. qr_init_login()     → 获取二维码  → 显示在页面上
2. qr_check_status()   → 轮询状态    → 等待用户扫码确认
3. qr_confirm_login()  → 确认登录    → 获取 Cookie → 进入首页`}</code>
                    </pre>
                </div>
            </section>

            {/* ===== 数据流 ===== */}
            <section className="space-y-6" id="data-flow">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <ArrowRightLeft className="text-purple" size={26} />
                    数据流与缓存
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-bold text-white">请求-缓存-降级 三层策略</h3>
                    <p className="text-gray-300 text-sm">Mini-HBUT 所有数据请求遵循统一的三层策略：</p>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto font-mono">
                        <code>{`用户请求
    │
    ▼
┌──────────────┐  命中    ┌────────────┐
│  检查前端缓存  │────────▶│  返回缓存数据 │
│  (localStorage)│        │  (标注来源)   │
└──────┬───────┘  未命中   └────────────┘
       │
       ▼
┌──────────────┐  成功    ┌─────────────┐
│  网络请求      │────────▶│  更新缓存     │
│  (API/Bridge)  │        │  返回新数据    │
└──────┬───────┘  失败    └─────────────┘
       │
       ▼
┌──────────────┐  有数据   ┌─────────────┐
│  检查后端缓存  │────────▶│  返回离线数据  │
│  (SQLite)     │         │  标注"离线"    │
└──────┬───────┘  无数据   └─────────────┘
       │
       ▼
┌──────────────┐
│  显示错误提示  │
└──────────────┘`}</code>
                    </pre>

                    <h3 className="text-lg font-bold text-white mt-4">缓存 TTL 策略</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left mt-2">
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="py-2 px-3 text-gray-400">缓存级别</th>
                                    <th className="py-2 px-3 text-gray-400">TTL</th>
                                    <th className="py-2 px-3 text-gray-400">适用场景</th>
                                    <th className="py-2 px-3 text-gray-400">缓存键前缀</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-300">
                                {[
                                    ['SHORT_TTL', '30 秒', '排名、实时余额', 'ranking:'],
                                    ['DEFAULT_TTL', '5 分钟', '常规查询', '默认'],
                                    ['LONG_TTL', '3 天', '成绩、课表、考试', 'grades: / schedule: / exams:'],
                                    ['EXTRA_LONG_TTL', '7 天', '校历、培养方案', 'calendar: / academic:'],
                                ].map((row, i) => (
                                    <tr key={i} className="border-b border-gray-800/50">
                                        <td className="py-2 px-3"><code className="text-xs text-cyan">{row[0]}</code></td>
                                        <td className="py-2 px-3">{row[1]}</td>
                                        <td className="py-2 px-3">{row[2]}</td>
                                        <td className="py-2 px-3 text-xs">{row[3]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <h3 className="text-lg font-bold text-white mt-4">缓存容量限制</h3>
                    <ul className="list-disc list-inside space-y-1 ml-4 text-gray-300 text-sm">
                        <li>前端 localStorage 缓存：最多 <strong>220</strong> 个条目。</li>
                        <li>单个缓存值大小限制：<strong>180KB</strong>（超过则不缓存）。</li>
                        <li>超出容量时自动淘汰最早过期的缓存条目。</li>
                        <li>后端 SQLite 缓存无条目限制，但会定期清理过期数据。</li>
                    </ul>

                    <h3 className="text-lg font-bold text-white mt-4">JWXT 维护模式检测</h3>
                    <p className="text-gray-300 text-sm">
                        当教务系统（JWXT）返回维护页面或特定状态码时，前端自动进入维护模式：
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-4 text-gray-300 text-sm">
                        <li>所有查询自动回退到离线缓存。</li>
                        <li>页面顶部显示维护提示横幅。</li>
                        <li>维护结束后首次请求成功会自动退出维护模式。</li>
                    </ul>
                </div>
            </section>

            {/* ===== HTTP Bridge ===== */}
            <section className="space-y-6" id="http-bridge">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Server className="text-cyan" size={26} />
                    HTTP Bridge 原理
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <p className="text-gray-300">
                        Tauri 桌面端在启动时会在本地开启一个 HTTP 服务器（<code className="text-sm text-cyan">127.0.0.1:4399</code>），
                        称为 HTTP Bridge。前端通过 Vite 反向代理将 <code className="text-sm text-cyan">/bridge</code> 路径转发到此服务。
                    </p>

                    <h3 className="text-lg font-bold text-white mt-2">工作原理</h3>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto font-mono">
                        <code>{`┌──────────┐    /api/v2/*     ┌──────────┐    /bridge/*    ┌──────────────┐
│ Vue 前端  │ ──────────────▶ │ Vite Dev │ ────────────▶ │ Rust HTTP    │
│ (组件)    │                 │ Server   │               │ Bridge       │
│           │ ◀────────────── │ :1420    │ ◀──────────── │ :4399        │
└──────────┘    JSON 响应      └──────────┘    JSON 响应   └──────┬───────┘
                                                                  │
                                              ┌───────────────────┘
                                              │
                               ┌──────────────▼──────────────┐
                               │     Rust HTTP Client          │
                               │  • 教务系统请求                │
                               │  • 电费系统 SSO               │
                               │  • 一卡通/图书馆 API          │
                               │  • SQLite 读写               │
                               └──────────────────────────────┘`}</code>
                    </pre>

                    <h3 className="text-lg font-bold text-white mt-4">统一响应格式</h3>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                        <code>{`interface ApiResponse<T> {
  success: boolean;       // 请求是否成功
  data: T | null;         // 返回数据（成功时）
  error: {                // 错误信息（失败时）
    kind: string;         // 错误类型
    message: string;      // 错误描述
  } | null;
  time: string;           // 服务端时间戳
}`}</code>
                    </pre>

                    <h3 className="text-lg font-bold text-white mt-4">安全边界</h3>
                    <ul className="list-disc list-inside space-y-1 ml-4 text-gray-300 text-sm">
                        <li>仅监听 <code className="text-xs text-cyan">127.0.0.1</code>，不接受外部连接。</li>
                        <li>不开放 <code className="text-xs text-cyan">0.0.0.0</code> 绑定。</li>
                        <li>Cookie 和凭据仅保存在本地，不通过 Bridge 暴露。</li>
                        <li>外部程序（如 NoneBot）通过 Bridge 调用时，应自行添加鉴权层。</li>
                    </ul>
                </div>
            </section>

            {/* ===== Tauri Commands ===== */}
            <section className="space-y-6" id="tauri-commands">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Cpu className="text-purple" size={26} />
                    Tauri Commands（Rust 指令）
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <p className="text-gray-300 text-sm">
                        所有 Tauri Commands 定义在 <code className="text-sm text-cyan">src-tauri/src/lib.rs</code> 中，
                        前端通过 <code className="text-sm text-cyan">@tauri-apps/api</code> 的 <code className="text-sm text-cyan">invoke()</code> 方法直接调用。
                    </p>

                    <h3 className="text-lg font-bold text-white">指令分组</h3>
                    <div className="space-y-3 mt-2">
                        {[
                            {
                                group: '认证',
                                commands: [
                                    'get_login_page - 获取登录页面HTML',
                                    'portal_qr_init_login - 门户扫码初始化',
                                    'portal_qr_check_status - 门户扫码状态检查',
                                    'portal_qr_confirm_login - 门户扫码确认',
                                    'chaoxing_qr_init_login - 学习通扫码初始化',
                                    'chaoxing_qr_check_status - 学习通扫码状态',
                                    'chaoxing_qr_confirm_login - 学习通扫码确认',
                                    'chaoxing_password_login - 学习通密码登录',
                                ]
                            },
                            {
                                group: '学业数据',
                                commands: [
                                    'sync_grades - 从教务系统同步成绩',
                                    'get_grades_local - 获取本地缓存成绩',
                                    'sync_schedule - 从教务系统同步课表',
                                    'get_schedule_local - 获取本地缓存课表',
                                    'fetch_exams - 查询考试安排',
                                    'fetch_ranking - 查询绩点排名',
                                    'fetch_student_info - 获取学生信息',
                                    'fetch_qxzkb_list - 查询全校课表',
                                ]
                            },
                            {
                                group: '校园生活',
                                commands: [
                                    'electricity_query_location - 查询电费房间',
                                    'electricity_query_account - 查询电费余额',
                                    'fetch_transaction_history - 查询交易记录',
                                    'fetch_classrooms - 查询空教室',
                                    'search_library_books - 搜索图书馆藏',
                                ]
                            },
                            {
                                group: '文件与导出',
                                commands: [
                                    'export_schedule_calendar - 导出课表为ICS',
                                    'cache_remote_image - 缓存远程图片',
                                    'save_export_file - 保存导出文件',
                                    'resource_share_fetch_file_payload_native - 获取共享文件',
                                ]
                            },
                            {
                                group: '其他',
                                commands: [
                                    'hbut_ai_chat - AI 对话',
                                    'campus_code_qrcode - 生成校园码',
                                    'campus_code_order_status - 查询订单状态',
                                ]
                            },
                        ].map(group => (
                            <div key={group.group} className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <div className="font-semibold text-cyan text-sm mb-2">{group.group}</div>
                                <ul className="space-y-0.5">
                                    {group.commands.map(cmd => (
                                        <li key={cmd} className="text-xs text-gray-400 font-mono">• {cmd}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ===== 后台任务 ===== */}
            <section className="space-y-6" id="background-tasks">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <RefreshCw className="text-cyan" size={26} />
                    后台任务机制
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-bold text-white">桌面端（Tauri）</h3>
                    <p className="text-gray-300 text-sm">
                        桌面端在应用启动时执行一次全量检查，此后按照用户设置的间隔定期轮询。检查逻辑运行在 Rust 后端的 Tokio 异步任务中。
                    </p>

                    <h3 className="text-lg font-bold text-white mt-4">移动端（Capacitor）</h3>
                    <p className="text-gray-300 text-sm">
                        移动端使用 <code className="text-sm text-cyan">@transistorsoft/capacitor-background-fetch</code> 插件实现后台任务。
                    </p>
                    <div className="overflow-x-auto mt-2">
                        <table className="w-full text-sm text-left">
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="py-2 px-3 text-gray-400">配置项</th>
                                    <th className="py-2 px-3 text-gray-400">值</th>
                                    <th className="py-2 px-3 text-gray-400">说明</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-300">
                                {[
                                    ['minimumFetchInterval', '15 分钟', '系统允许的最小检查间隔'],
                                    ['stopOnTerminate', 'false', '应用被杀后继续运行后台任务'],
                                    ['startOnBoot', 'true', '开机后自动启动后台任务'],
                                    ['enableHeadless', 'true', '支持无界面后台执行'],
                                ].map((row, i) => (
                                    <tr key={i} className="border-b border-gray-800/50">
                                        <td className="py-2 px-3"><code className="text-xs text-cyan">{row[0]}</code></td>
                                        <td className="py-2 px-3">{row[1]}</td>
                                        <td className="py-2 px-3">{row[2]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <h3 className="text-lg font-bold text-white mt-4">后台检查项</h3>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto font-mono">
                        <code>{`后台唤醒
    │
    ├─▶ 检查新成绩  → 比较本地缓存 → 有新成绩 → 推送通知
    │
    ├─▶ 检查考试    → 解析日期    → 明天有考试 → 推送提醒
    │
    ├─▶ 检查电费    → 查询余额    → 低于10度  → 推送告警
    │
    └─▶ 刷新课表    → 同步数据    → 更新缓存`}</code>
                    </pre>

                    <h3 className="text-lg font-bold text-white mt-4">通知去重</h3>
                    <p className="text-gray-300 text-sm">
                        每条通知根据内容生成签名（hash），已推送的签名记录在本地。同一签名的通知在一个周期内不会重复推送，避免用户被反复打扰。
                    </p>
                </div>
            </section>

            {/* ===== 云同步原理 ===== */}
            <section className="space-y-6" id="cloud-sync-tech">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Globe className="text-purple" size={26} />
                    云同步原理
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <h3 className="text-lg font-bold text-white">架构</h3>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto font-mono">
                        <code>{`客户端                     中转服务                  Cloudflare
(Mini-HBUT)               (OCR Service)             Workers + KV
    │                          │                         │
    │  POST /api/cloud-sync    │                         │
    │  {action, student_id,    │                         │
    │   secret_ref, payload}   │                         │
    │ ────────────────────▶    │                         │
    │                          │  POST /sync/upload      │
    │                          │  Authorization: Bearer  │
    │                          │ ──────────────────────▶ │
    │                          │                         │ KV.put(sync:{id})
    │                          │  ◀────────────────────  │
    │  ◀────────────────────   │                         │
    │                          │                         │`}</code>
                    </pre>

                    <h3 className="text-lg font-bold text-white mt-4">为什么需要中转？</h3>
                    <ul className="list-disc list-inside space-y-2 ml-4 text-gray-300 text-sm">
                        <li><strong>安全：</strong>Cloudflare Worker 的 API Token 保存在中转服务的 Secrets 中，不下发到客户端，防止泄露。</li>
                        <li><strong>灵活：</strong>中转服务可以做额外的校验（如 challenge 认证）、日志记录和限流。</li>
                        <li><strong>兼容：</strong>客户端只需对接中转服务的统一接口，无需关心后端存储的变化。</li>
                    </ul>

                    <h3 className="text-lg font-bold text-white mt-4">同步数据结构</h3>
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto">
                        <code>{`{
  "student_id": "2023123456",
  "updated_at": "2026-03-10T12:00:00.000Z",
  "reason": "auto_login",          // 同步原因
  "device_id": "xxxxx-xxxxx",      // 设备标识
  "client_time": 1741622400000,     // 客户端时间戳
  "payload": {
    "settings": { ... },           // 应用/UI/字体/登录设置
    "custom_courses": { ... },     // 自定义课程（按学期）
    "academic": { ... }            // 成绩/排名/课表缓存
  }
}`}</code>
                    </pre>

                    <h3 className="text-lg font-bold text-white mt-4">速率限制</h3>
                    <p className="text-gray-300 text-sm">
                        Cloudflare Worker 内置基于 KV 的速率限制，通过{' '}
                        <code className="text-xs text-cyan">rate:{'{action}'}:{'{student_id}'}:{'{ip}'}</code>{' '}键记录上次请求时间，
                        未超过冷却时间的请求会返回 429（Too Many Requests）。
                    </p>
                </div>
            </section>

            {/* ===== CDN 缓存 ===== */}
            <section className="space-y-6" id="cdn-cache">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Zap className="text-cyan" size={26} />
                    CDN 缓存与按需加载
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-4">
                    <p className="text-gray-300">
                        为减小安装包体积，Mini-HBUT 将部分大型库改为首次使用时按需下载并缓存：
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left mt-2">
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="py-2 px-3 text-gray-400">库</th>
                                    <th className="py-2 px-3 text-gray-400">用途</th>
                                    <th className="py-2 px-3 text-gray-400">加载时机</th>
                                    <th className="py-2 px-3 text-gray-400">缓存位置</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-300">
                                {[
                                    ['pdf.js', 'PDF 文件在线预览', '首次打开 PDF 文件', 'IndexedDB'],
                                    ['xgplayer', '视频播放', '首次播放视频文件', 'IndexedDB'],
                                    ['KaTeX', '数学公式渲染', '首次使用 AI 对话', 'IndexedDB'],
                                    ['marked-katex', 'Markdown + LaTeX', '首次使用 AI 对话', 'IndexedDB'],
                                    ['得意黑字体', '中文装饰字体', '用户选择并下载', 'IndexedDB'],
                                ].map((row, i) => (
                                    <tr key={i} className="border-b border-gray-800/50">
                                        <td className="py-2 px-3 font-medium">{row[0]}</td>
                                        <td className="py-2 px-3">{row[1]}</td>
                                        <td className="py-2 px-3 text-xs">{row[2]}</td>
                                        <td className="py-2 px-3 text-xs">{row[3]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-sm text-gray-400 mt-3">
                        加载器（<code className="text-xs text-cyan">cdn_loader.js</code>）会按照配置的 CDN 线路（jsDelivr → unpkg）依次尝试下载，
                        成功后写入 IndexedDB 持久化。后续使用直接从本地读取，实现「首次联网，后续离线」的体验。
                    </p>
                </div>
            </section>

            {/* ===== 项目结构 ===== */}
            <section className="space-y-6" id="project-structure">
                <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                    <Workflow className="text-purple" size={26} />
                    项目结构
                </h2>

                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800">
                    <pre className="bg-black/60 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto font-mono">
                        <code>{`tauri-app/
├── src/                          # Vue 前端源码
│   ├── App.vue                   # 主应用组件（路由 + 导航）
│   ├── main.ts                   # 应用入口
│   ├── components/               # 30+ 业务组件
│   │   ├── Dashboard.vue         #   首页仪表盘
│   │   ├── GradeView.vue         #   成绩查询
│   │   ├── ScheduleView.vue      #   课表管理
│   │   ├── LoginV3.vue           #   登录页面
│   │   ├── SettingsView.vue      #   设置中心
│   │   └── ...
│   ├── utils/                    # 工具函数库
│   │   ├── api.js                #   API 封装 + 缓存
│   │   ├── app_settings.ts       #   应用设置管理
│   │   ├── remote_config.js      #   远程配置
│   │   ├── cloud_sync.js         #   云同步
│   │   ├── background_fetch.js   #   后台任务
│   │   ├── font_settings.ts      #   字体系统
│   │   ├── updater.js            #   版本更新
│   │   └── ...
│   ├── platform/                 # 平台桥接层
│   │   ├── types.ts              #   能力接口定义
│   │   ├── native.ts             #   原生能力封装
│   │   ├── runtime.ts            #   运行时检测
│   │   └── adapters/             #   平台适配器
│   ├── config/                   # UI 配置
│   └── styles/                   # 样式文件
│
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── lib.rs                #   命令入口 + 启动逻辑
│   │   ├── http_client/          #   网络请求模块
│   │   ├── http_server.rs        #   HTTP Bridge 服务
│   │   └── db.rs                 #   SQLite 数据库
│   ├── tauri.conf.json           #   Tauri 配置
│   └── Cargo.toml                #   Rust 依赖
│
├── android/                      # Capacitor Android 工程
├── ios/                          # Capacitor iOS 工程
├── cloudflare/worker/            # 云同步 Worker
├── public/                       # 静态资源
│   └── dormitory_data.json       #   宿舍楼层数据
└── remote_config.json            # 远程配置示例`}</code>
                    </pre>
                </div>
            </section>
        </div>
    );
};

export default Technical;
