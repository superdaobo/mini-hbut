import { Link } from 'react-router-dom';

const lifeModules = [
    {
        title: '校园码',
        entry: '首页 -> 一码通 -> 校园码。',
        source: 'src/components/CampusCodeView.vue、src-tauri/src/modules/one_code.rs、src-tauri/src/modules/electricity.rs',
        usage: [
            '校园码页面用于生成一卡通二维码，顶部会显示在线模式或高能模式。在线模式依赖一卡通接口，高能模式会在配置允许时走本地离线签发逻辑。',
            '二维码区域会展示校园卡余额、二维码状态和手动刷新按钮。支付成功、二维码已使用、非法码、余额不足等状态会转换成用户可读提示。',
            '如果本地二维码编码失败，页面会回退为图片二维码；如果没有可用文本，会显示“暂无可用二维码，请点击刷新”。',
        ],
        states: [
            '需要登录并具备一卡通会话；校园码配置加载失败会显示校园码配置加载失败。',
            '高能模式只有在远程配置允许离线签发时可用，不能把它理解成永远可用的脱网支付能力。',
            '余额不足只表示当前接口返回的校园卡状态，仍需要以一卡通官方余额为准。',
        ],
    },
    {
        title: '电费查询',
        entry: '首页 -> 一码通 -> 电费查询；也可从首页默认快捷入口进入。',
        source: 'src/components/ElectricityView.vue、src-tauri/src/modules/electricity.rs、src/utils/static_resource_cache.js',
        usage: [
            '第一次使用需要选择宿舍楼层和房间。页面会合并“照明N层”和“空调N层”两类楼层，双计费宿舍会同时展示照明用电和空调用电。',
            '查询结果展示电费余额、剩余电量、更新时间和余额不足/运行正常状态；低于阈值时页面会突出余额不足。',
            '房间选择会保存为 last_dorm_selection、last_dorm_selection_label 和 last_dorm_ac_room，通知中心可复用该宿舍信息做电费提醒。',
        ],
        states: [
            '宿舍数据加载失败时会显示加载宿舍数据失败；余额查询失败会展示查询失败或网络错误。',
            '支持 fetchWithCache 离线缓存；后端会使用 electricity_cache，网络失败时可能显示上次成功数据和 sync_time。',
            '空调用电只有在当前宿舍存在空调端房间映射时展示，没有空调计费时不会强行显示空调卡片。',
        ],
    },
    {
        title: '交易记录',
        entry: '首页 -> 一码通 -> 交易记录。',
        source: 'src/components/TransactionHistory.vue、src-tauri/src/modules/transaction.rs、src-tauri/src/lib.rs',
        usage: [
            '交易记录用于查看一卡通流水，通常同步近一年记录，按月份拉取消费、充值、图书/打印等记录。',
            '页面会按记录名称映射图标和颜色，方便区分食堂、超市、图书、打印等场景。',
            '导出中心可按交易记录月份汇总导出，但浏览器模式不支持交易记录导出。',
        ],
        states: [
            '此功能仅在首次登录后有效，长期未登录可能导致查询失败；无法加载时优先退出后重新登录。',
            '支持 offline 和 sync_time 标识；后端使用 transaction_cache 做失败兜底，接口返回失败时显示获取数据失败。',
            '月份为空不一定是错误，可能是该月没有一卡通流水。',
        ],
    },
    {
        title: '图书查询',
        entry: '首页 -> 资源 -> 图书查询。',
        source: 'src/components/LibraryView.vue、src-tauri/src/lib.rs、src/utils/axios_adapter.js',
        usage: [
            '图书查询用于馆藏检索。输入关键词、题名或 ISBN 后点击搜索图书，结果列表展示书名、作者、出版社、馆藏状态等摘要。',
            '筛选区可清空筛选；点击条目会打开图书详情，查看馆藏位置、索书号、可借状态等字段。',
            '字典加载失败不阻断主流程，用户仍可直接按关键词搜索；结果支持分页和筛选。',
        ],
        states: [
            '没有输入关键词时提示请输入图书关键词；没有结果时显示暂无检索结果。',
            '检索失败显示图书检索失败；图书详情失败显示加载图书详情失败；后端 library_public_cache 可做公共馆藏查询兜底。',
            '图书服务依赖图书馆站点和后端代理，不应承诺所有馆藏字段都完整。',
        ],
    },
    {
        title: '校园地图',
        entry: '首页 -> 资源 -> 校园地图。',
        source: 'src/components/CampusMapView.vue、src-tauri/src/lib.rs、src/utils/static_resource_cache.js',
        usage: [
            '校园地图提供 A/B 两套静态地图图片。打开后支持缩放、拖拽和手势查看，适合移动端放大定位楼栋。',
            '地图图片会自动缓存到本地；缓存失败时回退远程 URL，不阻断展示。',
            '页面支持唤起微信小程序；唤起失败时会提示手动复制口令到微信打开。',
        ],
        states: [
            '地图图片加载失败会进入图片错误兜底，用户可切换另一张地图或稍后重试。',
            '微信小程序跳转受系统、浏览器和微信安装状态影响，不能保证每个平台都能直接打开。',
            '导出中心的校园地图缓存只导出已命中的缓存，未打开过地图时可能显示未命中校园地图缓存。',
        ],
    },
    {
        title: '资料分享',
        entry: '首页 -> 资源 -> 资料分享。',
        source: 'src/components/ResourceShareView.vue、src-tauri/src/lib.rs、src/utils/remote_config.js',
        usage: [
            '资料分享读取远程配置中的 WebDAV 资料源，支持目录浏览、返回上级、文件预览和直链下载。',
            '图片预览、PDF 预览、媒体播放、文本读取和 Office 在线预览会按文件类型选择不同预览通道。',
            '下载会先尝试获取直链；预览失败时通常会提示点击下载后查看。',
        ],
        states: [
            '远程配置加载失败会使用默认配置并显示提示；资料分享模块被禁用时显示资料分享模块已禁用。',
            '目录加载失败、目录响应解析失败、原生目录接口返回空响应都会进入错误状态；目录为空时会直接提示当前目录为空。',
            'PDF 和 Office 在线预览依赖远程文件可访问性，不能保证所有校园资料都能在应用内直接预览。',
        ],
    },
    {
        title: '校园助手',
        entry: '首页 -> 资源 -> 校园助手；当前首页元数据可能标注暂不可用。',
        source: 'src/components/AiChatView.vue、src-tauri/src/modules/ai.rs、src/utils/remote_config.js',
        usage: [
            '校园助手连接本地 AI 服务桥接地址，支持会话列表、新建会话、历史消息、流式输出和普通兜底回复。',
            '文件上传限制为 docx、pdf、txt、md，单文件最大 20 MB；上传后会把文件信息附加到会话。',
            '离线时允许新建本地会话，但远端同步、删除和流式输出仍依赖本地 AI 服务或 Tauri 后端。',
        ],
        states: [
            '初始化失败会显示连接失败；鉴权失败会提示 AI 服务鉴权失败，请重新登录后重试。',
            '本地 AI 服务不可用时会在多个候选桥接地址间重试，再尝试 Tauri invoke 兜底。',
            '不要把校园助手写成云端稳定服务；当前源码明确包含本地桥接、超时、重试、ai_session_cache 和远端失败回退。',
        ],
    },
];

const quickTips = [
    '校园码和电费都属于一卡通能力，优先保证已经登录，并在一卡通状态异常时手动刷新。',
    '电费提醒依赖电费模块保存过宿舍房间；没有选择房间时，通知中心会提示先到电费模块选择。',
    '图书查询、校园地图和资料分享不一定需要教务登录，但它们依赖外部站点、远程配置或 WebDAV 可访问。',
    '资料分享和校园助手涉及外部文件/服务，遇到预览或流式失败时，先尝试下载、刷新或切换网络。',
];

const sourceEvidence = [
    '首页入口：src/components/Dashboard.vue 中 “一码通” 包含 campus_code、electricity、transactions，“资源” 包含 library、campus_map、resource_share、ai。',
    '一卡通后端：src-tauri/src/modules/electricity.rs 处理电费、校园码和一卡通相关请求；src-tauri/src/modules/one_code.rs 提供校园码命令边界。',
    '资源类入口：src/components/LibraryView.vue、CampusMapView.vue、ResourceShareView.vue 分别负责馆藏检索、地图查看和 WebDAV 资料浏览。',
    'AI 边界：src/components/AiChatView.vue 使用本地桥接和 Tauri invoke 兜底，src-tauri/src/modules/ai.rs 提供后端 AI 命令。',
    '缓存与离线：src/components/ElectricityView.vue、TransactionHistory.vue 和 ExportCenterView.vue 会读取 offline、sync_time 或本地缓存状态。',
];

const CampusLife = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">用户文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                校园生活全量指南
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                本页覆盖校园码、电费查询、交易记录、图书查询、校园地图、资料分享和校园助手。
                这些模块横跨一卡通、图书馆、远程配置、WebDAV、地图缓存和本地 AI 服务，文档重点说明入口、常用操作、失败状态和平台限制。
            </p>
        </header>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">快速使用顺序</h2>
            <div className="rounded-lg border border-cyan/20 bg-cyan/5 p-5">
                <ol className="space-y-3 text-gray-300">
                    {quickTips.map((tip) => (
                        <li key={tip} className="leading-8">{tip}</li>
                    ))}
                </ol>
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">功能入口、使用方法与异常处理</h2>
            {lifeModules.map((module) => (
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
            <Link to="/docs/community-notifications" className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50">
                <div className="mb-2 text-lg font-semibold text-cyan">继续阅读社区与通知</div>
                <p className="text-sm leading-7 text-gray-300">了解论坛、系统通知、课程提醒、电费提醒和后台白名单。</p>
            </Link>
            <Link to="/docs/settings-data" className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50">
                <div className="mb-2 text-lg font-semibold text-cyan">查看设置与数据</div>
                <p className="text-sm leading-7 text-gray-300">了解导出中心、反馈、主题字体、云同步和本地缓存。</p>
            </Link>
        </section>
    </div>
);

export default CampusLife;
