import { HelpCircle, AlertTriangle, Wifi, Lock, Battery, Monitor, RefreshCw, Database, MessageSquare } from 'lucide-react';

const FAQ = () => {
    const faqSections = [
        {
            title: '登录问题',
            icon: <Lock className="text-cyan" size={20} />,
            questions: [
                {
                    q: '验证码识别失败，一直登录不上怎么办？',
                    a: `验证码识别依赖 OCR 服务，识别率一般在 90% 以上。如果连续失败：
1. 点击刷新验证码重新识别
2. 检查设置 → 后端中的 OCR 服务地址是否正常（可用功能测速功能检测）
3. 如果所有 OCR 端点都不可用，可以尝试手动输入验证码
4. 如果学校教务系统处于维护状态，OCR 服务返回的验证码图片可能不正确`
                },
                {
                    q: '提示「登录失效」或「会话过期」？',
                    a: `教务系统的登录会话有有效期限制。Mini-HBUT 会在会话过期时自动尝试使用保存的密码重新登录。如果重登也失败：
1. 检查网络连接是否正常
2. 检查校园网/VPN 是否可用
3. 手动点击「重新登录」按钮
4. 如果学校修改了密码或账号状态变化，需要重新输入密码`
                },
                {
                    q: '学习通登录后无法关联教务系统？',
                    a: `学习通登录会自动解析学号并尝试关联教务系统。如果失败：
1. 确认学习通账号已绑定学校
2. 确认学号是否正确（10 位数字）
3. 尝试使用融合门户登录方式代替`
                },
                {
                    q: '扫码登录的二维码扫不了？',
                    a: `扫码登录需要用对应的客户端扫码：
• 门户扫码：用学校融合门户 App 扫码
• 学习通扫码：用超星学习通 App 扫码
扫码后在手机端确认授权，Mini-HBUT 会自动检测登录状态。`
                },
                {
                    q: '临时登录有什么限制？',
                    a: `通过门户扫码的临时登录（portal_qr_temp）：
• 不保存密码，仅保持当前会话
• 会话过期后需要重新扫码
• 部分功能可能受限（如考试查询可能需要完整会话）
• 适合在公共电脑上临时使用`
                },
            ]
        },
        {
            title: '功能使用问题',
            icon: <HelpCircle className="text-purple" size={20} />,
            questions: [
                {
                    q: '成绩/课表数据不是最新的？',
                    a: `Mini-HBUT 使用缓存机制减少重复请求：
• 成绩/课表缓存 3 天，在缓存有效期内会使用缓存数据
• 如需强制刷新，下拉页面或点击刷新按钮即可重新从教务系统获取
• 后台静默检查会在后台自动比较最新数据与缓存
• 如果教务系统正在维护，会显示离线缓存数据并标注"离线"`
                },
                {
                    q: '电费查询显示查询失败？',
                    a: `电费查询涉及 SSO 单点登录和电费系统，故障原因可能是：
1. 未正确选择宿舍房间：首次使用需要通过「校区→楼栋→楼层→房间」级联选择器选择你的宿舍
2. 电费服务器临时不可用：应用会自动重试（默认 2 次），也可稍后手动重试
3. SSO Token 过期：应用会自动尝试刷新 Token
4. 选择了错误的宿舍：修改宿舍选择后重新查询`
                },
                {
                    q: '课表上的课程信息有误？',
                    a: `课表数据来自教务系统：
• 如果教务系统更新了课表但应用显示旧数据，请手动刷新课表
• 如果需要添加教务系统没有的课程（如辅修、社团活动），可使用「自定义课程」功能手动添加
• 自定义课程按学期存储，与教务课程区分显示`
                },
                {
                    q: '资料分享显示「连接失败」？',
                    a: `资料分享功能依赖 WebDAV 服务器：
• 检查网络连接，WebDAV 服务可能需要校园网环境
• 远程配置中的 WebDAV 地址可能已变更，等待管理员更新
• 如果是自部署的 WebDAV，检查服务器是否正常运行`
                },
                {
                    q: '全校课表查询没有结果？',
                    a: `全校课表查询需要正确的筛选条件：
• 确认选择了正确的学年学期
• 确认院系/专业/年级的选择组合有对应课程
• 如果条件过于精确，尝试减少筛选条件
• 数据来源于教务系统，在教务系统维护期间可能无法查询`
                },
                {
                    q: 'AI 助手没有响应或出错？',
                    a: `AI 助手依赖远程 AI 服务：
• 检查网络连接是否正常
• 尝试切换其他 AI 模型（设置 → AI 模型列表中可选择）
• 如果所有模型都无法使用，可能是 AI 服务暂时不可用
• AI 功能通过远程配置管理，模型列表可能随时更新`
                },
                {
                    q: '导出课表 ICS 后日历应用无法识别？',
                    a: `ICS 文件导出注意事项：
• 确保日历应用支持 .ics 格式（Google Calendar、Outlook、Apple Calendar 均支持）
• 导出的 ICS 文件保存在应用缓存目录中
• 在桌面端，文件会保存到指定的导出路径
• 在移动端，可通过分享功能发送到其他应用`
                },
            ]
        },
        {
            title: '安装与更新问题',
            icon: <RefreshCw className="text-cyan" size={20} />,
            questions: [
                {
                    q: 'Windows 安装时 SmartScreen 拦截？',
                    a: `这是因为安装包使用开源签名，Windows SmartScreen 对不常见的签名会发出警告：
1. 点击「更多信息」
2. 点击「仍要运行」
3. 应用本身不含恶意代码，可放心安装
4. 源代码完全开源，可自行审计：github.com/superdaobo/mini-hbut`
                },
                {
                    q: 'macOS 提示「无法验证开发者」？',
                    a: `解决方法：
1. 打开「系统设置」→「隐私与安全性」
2. 找到 Mini-HBUT 的提示，点击「仍要打开」
3. 或者在终端执行：xattr -cr /Applications/Mini-HBUT.app
4. 之后即可正常打开应用`
                },
                {
                    q: 'Linux 启动报错？',
                    a: `常见原因和解决方法：
• 缺少 WebKit2GTK：sudo apt install libwebkit2gtk-4.1-0
• AppImage 没有执行权限：chmod +x Mini-HBUT_*.AppImage
• DEB 包依赖缺失：sudo apt-get install -f`
                },
                {
                    q: 'iOS 安装后打不开或闪退？',
                    a: `常见原因：
1. 证书未信任：设置 → 通用 → VPN 与设备管理 → 信任开发者证书
2. 证书过期：个人 Apple ID 签名有效期 7 天，需要续签
3. 使用了开发模式的 IPA：请下载最新 Release 版本
4. LiveContainer 容器异常：尝试在 iLoader 中重新导入应用`
                },
                {
                    q: 'Android 更新后数据会丢失吗？',
                    a: `不会。直接安装新版 APK 即可覆盖更新，所有本地数据（登录信息、缓存、设置）均会保留。
如果云同步已启用，数据还会备份到云端，即使卸载重装也能恢复。`
                },
                {
                    q: '提示「版本过低，请更新」？',
                    a: `这是服务端的强制更新策略，表示当前版本存在重要问题或不再兼容：
1. 按提示下载并安装最新版本
2. 桌面端点击更新提示可跳转下载页面
3. 移动端需要手动下载新版安装包`
                },
            ]
        },
        {
            title: '网络与连接问题',
            icon: <Wifi className="text-cyan" size={20} />,
            questions: [
                {
                    q: '校内网络/VPN 下无法使用？',
                    a: `Mini-HBUT 需要访问学校教务系统，通常需要校园网环境：
• 如果在校外，需要连接学校 VPN
• 部分功能（如电费查询、一码通）可能需要额外的 SSO 认证
• 检查 VPN 是否正确分流（教务系统域名需要走 VPN）`
                },
                {
                    q: '「教务系统维护中」提示？',
                    a: `学校教务系统有维护时间（通常是深夜或考试周前后）：
• 维护期间所有功能会自动切换到离线缓存模式
• 显示上次缓存的数据，并标注「离线」
• 具体维护时间以学校教务处通知为准
• 维护结束后首次打开时会自动刷新数据`
                },
                {
                    q: '数据加载很慢？',
                    a: `可能的原因和优化方法：
1. 网络状况差：检查网络连接质量
2. 服务器响应慢：使用「设置 → 功能测速」检查各服务延迟
3. 调大超时时间：设置 → 后端 → 请求超时（ms），适当增加超时
4. 启用缓存：确保没有频繁强制刷新
5. CDN 节点问题：尝试切换字体/资源 CDN 线路`
                },
            ]
        },
        {
            title: '后台通知问题',
            icon: <Battery className="text-cyan" size={20} />,
            questions: [
                {
                    q: '设置了通知但收不到？',
                    a: `后台通知依赖系统权限和策略：
1. 确认已在通知设置中启用对应的通知类型（成绩/考试/电费）
2. 确认系统已授权 Mini-HBUT 发送通知
3. Android 用户：检查省电策略，将 Mini-HBUT 设为「不受限制」
4. 华为/小米/OPPO/vivo 用户：在厂商的自启管理/后台管理中允许 Mini-HBUT
5. 检查通知间隔设置（最小 15 分钟）`
                },
                {
                    q: '通知重复推送？',
                    a: `Mini-HBUT 使用签名去重机制防止重复推送。如果仍出现重复：
• 可能是应用重启导致去重缓存清空
• 确认只安装了一个 Mini-HBUT 版本
• 检查是否同时在多台设备登录了相同账号`
                },
                {
                    q: 'iOS 后台通知不准时？',
                    a: `iOS 对后台任务有严格限制：
• Background Fetch 的触发时间由系统智能调度，不保证准时
• 系统会根据用户使用习惯和电量状态调整唤醒频率
• 使用频率越高的 App，后台唤醒越频繁
• 这是 iOS 系统限制，无法绕过`
                },
            ]
        },
        {
            title: '数据与隐私',
            icon: <Database className="text-purple" size={20} />,
            questions: [
                {
                    q: '我的密码安全吗？',
                    a: `Mini-HBUT 采取多重保护措施：
• 密码仅保存在设备本地（localStorage/SQLite），不上传到任何服务器
• 学习通登录密码使用 AES-128-CBC 加密传输
• 云同步不包含密码数据
• 所有网络请求走 HTTPS 加密
• 源代码完全开源，密码处理逻辑可审计`
                },
                {
                    q: '云同步会泄露我的数据吗？',
                    a: `云同步的安全设计：
• 数据存储在 Cloudflare KV 中，通过学号标识
• 上传/下载需要通过 challenge 认证
• 同步的数据仅包含：课表、设置、自定义课程、成绩缓存
• 不同步密码、身份敏感信息（身份证号等）
• 你可以在设置中关闭云同步功能
• 可以自行部署私有云同步服务`
                },
                {
                    q: '如何清除所有本地数据？',
                    a: `清除方式：
• 桌面端：卸载应用或删除应用数据目录
• Android：设置 → 应用 → Mini-HBUT → 清除数据
• iOS：删除应用（侧载应用的数据随应用删除）
• 清除后需要重新登录，且本地缓存数据将丢失
• 如果启用了云同步，重新登录后可恢复部分数据`
                },
                {
                    q: 'HTTP Bridge 是否安全？',
                    a: `HTTP Bridge 的安全策略：
• 仅监听 127.0.0.1（本机回环地址），不对外暴露
• 只有本机运行的程序才能访问
• 不建议将 Bridge 端口转发到公网
• 如需外部集成，建议通过 NoneBot 等中间层添加鉴权`
                },
            ]
        },
        {
            title: '平台相关问题',
            icon: <Monitor className="text-cyan" size={20} />,
            questions: [
                {
                    q: '桌面端和移动端功能有什么区别？',
                    a: `功能差异：
| 功能 | 桌面端 (Tauri) | 移动端 (Capacitor) |
|------|:---:|:---:|
| 核心查询模块 | ✅ | ✅ |
| HTTP Bridge API | ✅ | ❌ |
| 后台通知 | 运行时 | 后台常驻 |
| 开机自启 | ❌ | ✅ (Android) |
| 文件导出 | 选择目录 | 缓存/分享 |
| 屏幕常亮 | ❌ | ✅ |

HTTP Bridge 仅在桌面端可用，移动端所有功能通过原生 API 调用。`
                },
                {
                    q: 'Android 和 iOS 功能有区别吗？',
                    a: `主要区别：
• iOS 后台任务受系统严格限制，不如 Android 灵活
• Android 支持开机自启后台任务
• iOS 需要侧载安装（SideStore/nb助手）
• Android 直接安装 APK 即可
• iOS 证书有有效期限制（7天或1年）
• 核心学业查询功能两个平台完全一致`
                },
            ]
        },
    ];

    return (
        <div className="space-y-12">
            {/* 页面标题 */}
            <div className="border-b border-gray-800 pb-6">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                    常见问题
                </h1>
                <p className="text-xl text-gray-400">
                    使用 Mini-HBUT 过程中遇到问题？这里收集了用户最常遇到的问题和解决方案。
                </p>
            </div>

            {/* 快速导航 */}
            <div className="flex flex-wrap gap-2">
                {faqSections.map((section) => (
                    <a
                        key={section.title}
                        href={`#faq-${section.title}`}
                        className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-gray-400 hover:text-cyan hover:border-cyan/30 transition-colors"
                    >
                        {section.title}
                    </a>
                ))}
            </div>

            {/* FAQ 内容 */}
            {faqSections.map((section) => (
                <section key={section.title} className="space-y-4" id={`faq-${section.title}`}>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        {section.icon}
                        {section.title}
                    </h2>
                    <div className="space-y-3">
                        {section.questions.map((item, idx) => (
                            <details key={idx} className="group rounded-xl bg-gray-900/60 border border-gray-800 overflow-hidden">
                                <summary className="flex items-center gap-3 p-5 cursor-pointer hover:bg-white/5 transition-colors">
                                    <AlertTriangle size={16} className="text-cyan flex-shrink-0 group-open:text-purple transition-colors" />
                                    <span className="font-medium text-white">{item.q}</span>
                                </summary>
                                <div className="px-5 pb-5 pt-0 text-gray-300 text-sm whitespace-pre-line border-t border-gray-800/50 mt-0 pt-4">
                                    {item.a}
                                </div>
                            </details>
                        ))}
                    </div>
                </section>
            ))}

            {/* 反馈入口 */}
            <section className="space-y-4" id="feedback">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <MessageSquare className="text-purple" size={22} />
                    没找到你的问题？
                </h2>
                <div className="p-6 rounded-xl bg-gray-900/60 border border-gray-800 space-y-3">
                    <p className="text-gray-300">如果以上内容无法解决你的问题，你可以通过以下方式反馈：</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <a href="https://docs.qq.com/sheet/DQkdvWHJxQ3RwWlB4?tab=BB08J2" target="_blank"
                            className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-cyan/30 transition-colors text-center">
                            <div className="text-white font-semibold mb-1">📋 问题反馈表</div>
                            <div className="text-xs text-gray-400">通过在线表格提交问题</div>
                        </a>
                        <a href="https://github.com/superdaobo/mini-hbut/issues" target="_blank"
                            className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-cyan/30 transition-colors text-center">
                            <div className="text-white font-semibold mb-1">🐛 GitHub Issues</div>
                            <div className="text-xs text-gray-400">在 GitHub 上提交 Bug 或建议</div>
                        </a>
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
                            <div className="text-white font-semibold mb-1">📱 应用内反馈</div>
                            <div className="text-xs text-gray-400">在应用「我的 → 反馈」中提交</div>
                        </div>
                    </div>
                    <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-sm">
                        <strong>💡 反馈建议：</strong>提交问题时，请一并提供：你的系统平台、应用版本号、问题的详细描述和复现步骤。可以在设置 → 调试中复制日志一起提交，有助于快速定位问题。
                    </div>
                </div>
            </section>
        </div>
    );
};

export default FAQ;
