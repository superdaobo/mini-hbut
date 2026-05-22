import { Link } from 'react-router-dom';

const settingsModules = [
    {
        title: '我的',
        entry: '底部主 Tab -> 我的。',
        source: 'src/components/MeView.vue、src/App.vue',
        usage: [
            '我的页展示头像、姓名、学号、登录状态和常用功能入口，包括个人信息、官方帖子、设置中心、导出中心、配置工具、检查更新、意见反馈、开源协议、赞助、更多、免责声明与隐私政策。',
            '退出登录通过事件交给 App 统一处理，会清理当前会话并让需要登录的模块回到未登录状态。',
            '隐私政策和免责声明是应用内给用户看的说明，提醒本地会存储会话、账号凭据和缓存数据。',
        ],
        states: [
            '配置工具只在 config_admin_ids 命中当前学号时显示，普通用户不会看到管理员入口。',
            '赞助二维码来自远程图片并带缓存，加载失败时不影响其它我的页入口。',
            '不要把隐私政策描述成完整法律合规文书；它是当前应用内可见的用户说明。',
        ],
    },
    {
        title: '设置中心',
        entry: '我的 -> 设置中心。',
        source: 'src/components/SettingsView.vue、src/utils/app_settings.ts、src/utils/ui_settings.ts、src/utils/font_settings.ts',
        usage: [
            '设置中心分为外观、后端、调试三类。外观页管理主题、卡片密度、导航样式、字体、字体 CDN 和字体预缓存。',
            '后端页管理远程配置、本地后端设置、OCR 地址、上传地址、云同步地址、云同步 secret 引用、请求超时和模块重试参数。',
            '调试页提供网络测速和调试日志，可并发测试 OCR、上传、云同步、新融合门户、教务系统、超星渠道、一卡通与图书馆地址。',
            '高级外观设置支持自定义 CSS/JS，适合调试或深度个性化；普通用户应谨慎使用。',
        ],
        states: [
            '主题、字体和后端设置主要保存在本地 localStorage 或 IndexedDB，不等于自动同步到账号云端。',
            '字体可能出现本地缓存命中、下载失败、部分字体缓存失败；失败时会显示字体下载失败或部分字体缓存失败。',
            '远程配置开启时，OCR、上传和云同步中转地址可能被远程刷新覆盖；若需固定本地地址，应开启仅本地。',
        ],
    },
    {
        title: '云同步',
        entry: '我的 -> 设置中心 -> 后端与云同步区域。',
        source: 'src/components/SettingsView.vue、src/utils/cloud_sync.js、src/utils/remote_config.js',
        usage: [
            '云同步用于上传和下载本地设置、教务数据摘要、自定义课程等数据，页面会展示最近上传成功/失败、最近下载成功/失败和更新时间。',
            '云同步运行参数来自远程配置或本地后端设置，包括 endpoint、secret_ref、上传冷却和下载冷却。',
            '新设备或自动登录后，云同步可能尝试应用云端设置，但仍以用户当前登录学号作为隔离边界。',
        ],
        states: [
            '云同步未启用时只显示未启用，不会强制上传。',
            '上传错误和下载错误会在设置中心展示；网络或密钥配置错误会导致同步失败。',
            '不要把云同步描述成完整备份服务；源码只同步指定数据类型和设置快照。',
        ],
    },
    {
        title: '导出中心',
        entry: '我的 -> 导出中心。',
        source: 'src/components/ExportCenterView.vue',
        usage: [
            '导出中心支持选择模块和学期列表，先预览导出数据，再导出 JSON 或长图片。',
            '可导出模块包括成绩、绩点排名、课表、考试安排、校历、学籍信息、学业完成情况、培养方案、电费、交易记录、空教室缓存和校园地图缓存。',
            '交易记录可选择交易记录月份；成绩、课表、排名等模块会按所选学期准备数据。',
            '长图片用于分享或留档，JSON 更适合备份和后续处理。',
        ],
        states: [
            '空教室缓存和校园地图缓存属于缓存导出，未进入对应页面查询或打开地图时可能提示未命中空教室缓存、未命中校园地图缓存。',
            '交易记录浏览器模式不支持导出，原生环境和浏览器的保存路径也不一致。',
            '学期列表获取失败会显示获取学期失败；导出 JSON 或长图片失败会显示对应错误。',
        ],
    },
    {
        title: '意见反馈',
        entry: '我的 -> 意见反馈。',
        source: 'src/components/FeedbackView.vue',
        usage: [
            '意见反馈会打开腾讯文档反馈表，也支持复制反馈链接。',
            '页面会读取最近错误日志，用户可以复制最近错误后贴到反馈表，帮助定位问题。',
            '如果没有最近错误，会显示当前没有最近 error。',
        ],
        states: [
            '外部浏览器打开失败会显示浏览器打开失败，用户可以改用复制反馈链接。',
            '剪贴板权限异常时会提示复制失败。',
            '不要把它写成应用内工单系统；当前实现是外链表单加最近错误辅助复制。',
        ],
    },
    {
        title: '官方帖子与配置工具',
        entry: '我的 -> 官方帖子；我的 -> 配置工具（管理员可见）。',
        source: 'src/components/OfficialView.vue、src/components/ConfigEditor.vue、src/utils/remote_config.js',
        usage: [
            '官方帖子以内嵌腾讯文档展示，也支持复制链接或外部浏览器打开。',
            '配置工具用于管理员查看和编辑远程配置 JSON 的本地草稿，覆盖公告、强制更新、OCR、上传、资料分享、云同步等字段。',
            '配置工具导出 remote_config.json，也会在导出失败时尝试复制 JSON 到剪贴板。',
        ],
        states: [
            '配置工具入口由 App 和 MeView 通过 config_admin_ids 控制，ConfigEditor 自身不是权限网关。',
            '配置工具不会直接写回远程仓库；它只负责编辑、校验、导出或复制 JSON。',
            '官方帖子不是离线公告中心，依赖腾讯文档 iframe 或外部浏览器。',
        ],
    },
];

const sourceEvidence = [
    '我的页入口：src/components/MeView.vue 暴露个人信息、设置中心、导出中心、配置工具、官方帖子、意见反馈、隐私政策和退出登录。',
    '设置持久化：src/utils/app_settings.ts 保存 hbu_app_settings_v1，src/utils/ui_settings.ts 保存 hbu_ui_settings_v2，src/utils/font_settings.ts 管理字体缓存。',
    '云同步：src/utils/cloud_sync.js 上传/下载 settings、academic、custom courses 等指定快照，src/utils/remote_config.js 提供 endpoint 和 secret_ref 配置。',
    '导出中心：src/components/ExportCenterView.vue 直接组织导出模块、学期列表、交易记录月份、缓存导出、JSON 和长图片导出。',
    '反馈和官方入口：src/components/FeedbackView.vue 与 OfficialView.vue 都是外部腾讯文档入口，失败时提供复制链接兜底。',
];

const SettingsData = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">用户文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                设置与数据全量指南
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                本页覆盖我的页、设置中心、云同步、导出中心、意见反馈、官方帖子和配置工具。
                这些能力决定主题字体、后端地址、OCR、远程配置、导出、日志反馈和退出登录的行为，适合在换设备、排错、备份或反馈问题前阅读。
            </p>
        </header>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">功能入口、使用方法与异常处理</h2>
            {settingsModules.map((module) => (
                <article key={module.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                    <div className="mb-4 flex flex-col gap-2 border-b border-white/10 pb-4">
                        <h3 className="text-2xl font-bold text-white">{module.title}</h3>
                        <div className="text-sm leading-7 text-gray-400">
                            <strong className="text-cyan">入口：</strong>{module.entry}
                        </div>
                        <div className="text-xs leading-6 text-gray-500">
                            <strong className="text-gray-300">源码证据：</strong>{module.source}
                        </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                            <h4 className="mb-2 text-lg font-semibold text-cyan">使用方法</h4>
                            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                                {module.usage.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 className="mb-2 text-lg font-semibold text-purple">状态说明与异常处理</h4>
                            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                                {module.states.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </article>
            ))}
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

        <section className="grid gap-4 md:grid-cols-2">
            <Link to="/docs/campus-life" className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50">
                <div className="mb-2 text-lg font-semibold text-cyan">返回校园生活</div>
                <p className="text-sm leading-7 text-gray-300">查看校园码、电费、交易记录、图书、地图、资料分享和校园助手。</p>
            </Link>
            <Link to="/docs/troubleshooting" className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50">
                <div className="mb-2 text-lg font-semibold text-cyan">继续排查问题</div>
                <p className="text-sm leading-7 text-gray-300">登录失败、网络错误、缓存清理、通知异常和平台差异会在故障排查中继续展开。</p>
            </Link>
        </section>
    </div>
);

export default SettingsData;
