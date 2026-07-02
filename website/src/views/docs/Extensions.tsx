import Link from 'next/link';

const moduleFlow = [
    {
        title: '1. 进入模块中心',
        details: [
            '用户从“我的 / 更多”进入更多模块页面。MoreView 会先用 src/utils/module_center.js 生成内置模块卡片，让模块中心即使远程 catalog 暂时不可用也能展示基本入口。',
            '页面会继续读取远程配置和远程 catalog，默认 CDN 基地址是 https://hbut.6661111.xyz/modules，正式渠道为 main，同时代码也支持 dev 和 latest 渠道。',
        ],
    },
    {
        title: '2. 读取 manifest 并准备模块包',
        details: [
            '远程模块点击后会拉取 manifest。manifest 中的 package_url 指向 bundle.zip，package_sha256 用于校验包内容，entry_path 默认是 index.html。',
            '首次使用需下载。MoreView 会显示“获取模块清单中”“检查线上版本”“下载并准备本地包”等状态；如果模块缺少 manifest_url，则会标记“模块清单未发布”。',
        ],
    },
    {
        title: '3. 命中缓存或打开宿主',
        details: [
            '如果本地缓存版本、min_compatible_version 和 package_sha256 与远端一致，页面会命中本地缓存；远端检查失败时，只在兼容缓存存在时回退本地缓存。',
            '准备完成后进入模块宿主 MoreModuleHostView。宿主通过 iframe 嵌入模块页面，并根据平台显示“内嵌运行”“桌面本地包”“安卓本地包”“远端页面”等运行标签。',
        ],
    },
];

const runtimeNotes = [
    {
        title: 'Tauri 桌面端',
        desc: 'src-tauri/src/modules/module_bundle.rs 会把 bundle.zip 解压到应用缓存目录 more_modules 下，写入 .module-cache-meta.json，并通过 127.0.0.1 模块桥接地址暴露入口。open_module_bundle_window 也保留了独立窗口能力，但当前更多页主路径是内嵌模块宿主。',
    },
    {
        title: 'Capacitor 移动端',
        desc: 'src/utils/more_modules.js 会把模块缓存到 Capacitor Filesystem 的 modules 目录。Android/iOS 无法使用桌面本地桥时，会尝试安卓本地包、远端页面或本地缓存兜底。',
    },
    {
        title: 'Web 或受限环境',
        desc: '无法使用 Tauri 原生桥时会优先选择 open_url / remote-site。代理 URL 可能因 X-Frame-Options 无法 iframe 嵌入，所以打开候选 URL 会过滤部分代理地址。',
    },
    {
        title: 'iframe 尺寸与白屏处理',
        desc: '小游戏会通过 window.parent.postMessage 发送 mini-hbut:module-size，宿主据此调整 iframe 高度。若 iOS WKWebView 不上报尺寸，MoreModuleHostView 会使用默认高度，并在疑似白屏时提供外部浏览器打开提示。',
    },
];

const checkinModules = [
    {
        title: '学习通签到活动',
        details: [
            'MoreChaoxingCheckinView 展示学习通签到活动与签到记录。页面会区分“进行中”和“已结束 / 已签”，没有活动时显示“暂无签到活动”。',
            '普通签到可直接提交；位置签到会打开 LocationCheckinModal，要求纬度、经度和地址；拍照签到会先上传照片再提交 object_id。',
            '手势签到通过 GestureCheckinModal 输入手势码；二维码签到通过 QrCheckinModal 支持粘贴链接、图片识别、拍照扫码和屏幕选区识别。',
        ],
    },
    {
        title: '会话与安全边界',
        details: [
            'SessionStatusBanner 会提示学习通未连接时先到在线学习模块登录学习通账号。后端 src-tauri/src/modules/chaoxing_checkin 会检查会话过期、域名白名单和请求参数。',
            '签到请求只面向学习通相关域名与 hbut.jw.chaoxing.com 桥接域；二维码解析也只接受受控的超星签到 URL。网络异常、会话失效、图片 MIME 或大小不合法都会返回失败提示。',
        ],
    },
    {
        title: '在线学习与学习记录',
        details: [
            'MoreShuakeView 是学习记录页面，读取学习通和长江雨课堂两个平台的概览、最近同步、缓存状态、同步记录，并提供同步全部平台和清理缓存。',
            'OnlineLearningChaoxingView 读取学习通课程、章节、官方进度，并提供自动学习入口；OnlineLearningYuketangView 通过微信扫码连接长江雨课堂，读取课程和视频任务进度，也提供自动学习入口。',
            '这些页面在当前源码中存在，但当前普通 App 渲染链路不完整；是否在普通用户路径中可见取决于 App 接入和远程 module_center 配置，文档不把它写成所有安装包必然显示的入口。',
        ],
    },
];

const publishedGames = [
    {
        name: '合成湖工大',
        id: 'hecheng_hugongda',
        status: '已在模块中心内置，也出现在当前 catalog。',
        desc: '拖拽/触控投放学校球体，相同学校碰撞后合成，最终目标是合成“湖北工业大学”。模块会读取宿主注入的学号、姓名、班级和 rank_api，结算后可上传排行榜。',
        source: 'website/modules-src/hecheng_hugongda/project/src/App.vue',
    },
    {
        name: '跳出湖工大',
        id: 'jump_out_hbut',
        status: '已在模块中心内置，也出现在当前 catalog。',
        desc: 'Three.js 风格的校园跳一跳。用户蓄力后跳到校园建筑平台，连续落点和平台命中会影响得分，支持排行榜面板。',
        source: 'website/modules-src/jump_out_hbut/project/src/App.vue',
    },
    {
        name: '2048 湖工大版',
        id: 'hbut_2048',
        status: '已在模块中心内置，也出现在当前 catalog。',
        desc: '方向键或滑动移动方块，合并相同数字直到 2048。模块记录最高分，并在上下文完整时显示排行榜。',
        source: 'website/modules-src/hbut_2048/project/src/game/GameManager.js',
    },
    {
        name: '笨鸟先飞',
        id: 'clumsy_bird_hbut',
        status: '已在模块中心内置，也出现在当前 catalog。',
        desc: 'Flappy Bird 玩法，点击或触控让角色上升，穿过障碍得分。管道间距、速度和生成间隔会随分数变化。',
        source: 'website/modules-src/clumsy_bird_hbut/project/src/game/FlappyGame.js',
    },
    {
        name: '湖工大富翁',
        id: 'hbut_monopoly',
        status: '已在模块中心内置，也出现在当前 catalog。',
        desc: '掷骰子走校园棋盘，管理资金、绩点、影响力、精力和压力，触发事件、行动卡和校园据点投资。',
        source: 'website/modules-src/hbut_monopoly/project/src/game/monopoly.js',
    },
    {
        name: '湖工矿工',
        id: 'hbut_miner',
        status: '已在模块中心内置，也出现在当前 catalog。',
        desc: '黄金矿工式吊钩抓取校园物品。每关有目标分、倒计时和不同物品效果，失败或通关都会进入结算。',
        source: 'website/modules-src/hbut_miner/project/src/game/miner.js',
    },
    {
        name: '湖工记忆牌',
        id: 'hbut_memory_match',
        status: '已在模块中心内置，也出现在当前 catalog。',
        desc: '翻牌配对记忆玩法，关卡开始前有短暂预览，随后按时间和错配次数计算得分。',
        source: 'website/modules-src/hbut_memory_match/project/src/game/memory.js',
    },
];

const unpublishedModules = [
    {
        name: '湖工五子棋',
        id: 'hbut_gomoku',
        status: '工作区存在，未必已发布。',
        desc: '当前工作区存在 website/modules-src/hbut_gomoku/module.json 和源码，玩法是本地双人十五路五子棋，包含落子顺序、防重复、胜负和平局判断。但该目录当前未跟踪，且 website/public/modules/main/catalog.json 未列出它，所以用户侧不能把它视为已上线模块。',
    },
    {
        name: '湖工大逃生',
        id: 'hugongda_escape',
        status: '源码存在但 disabled。',
        desc: 'website/modules-src/hugongda_escape/module.json 明确写有 disabled: true。scripts/build_website_modules.mjs 会跳过 disabled 模块，因此当前 catalog 不包含它；即使 public 目录曾有历史残留，也不应写成普通用户可见模块。',
    },
];

const userBoundaries = [
    '小游戏不是主应用内置页面，而是 website/modules-src 构建出来的模块包，通过模块市场、manifest、bundle.zip 和模块宿主加载。',
    '排行榜依赖宿主注入上下文，包括 student_id、player_name、class_name、major、school_name 和 rank_api。上下文缺失时，模块会关闭或降级排行榜能力。',
    '模块中心首次打开会先显示内置卡片，再异步刷新远程 catalog。远程 catalog 慢或失败不代表所有模块都坏了，但未缓存模块仍可能打不开。',
    '缓存兜底不是永久离线承诺。只有已经成功下载过、manifest 信息完整、版本兼容且缓存入口仍存在的模块，才可能在远端失败时打开。',
    '学习通签到、在线学习和自动学习都依赖有效会话、平台接口和学校网络环境。功能可用性以学习通、长江雨课堂和当前登录状态为准。',
    '模块宿主 iframe 当前没有 sandbox 属性，不能理解为强沙箱隔离；安全边界主要来自 manifest/package_sha256 校验、zip 路径防穿越、运行时地址选择和用户侧信任来源控制。',
    '自动学习不是平台官方能力，源码通过学习通进度上报或长江雨课堂 heartbeat 模拟观看进度；使用前需要自行承担课程平台规则和账号风险。',
];

const sourceEvidence = [
    '模块中心默认卡片与合并逻辑：src/utils/module_center.js 定义 DEFAULT_MODULE_CENTER，并在 buildModuleCenterCards 中合并内置模块、远程配置和 catalog。',
    '更多模块页面：src/components/MoreView.vue 负责 fetchModuleCatalog、fetchModuleManifest、prepareModuleBundle、检查线上版本、下载状态、本地缓存状态和跳转 more_module_host。',
    '模块宿主：src/components/MoreModuleHostView.vue 使用 iframe 加载 preview_url，处理 mini-hbut:module-size、加载超时、iOS 白屏、外部打开和本地缓存失效提示。',
    '模块缓存与平台分流：src/utils/more_modules.js 负责 Tauri 桥接、Capacitor Filesystem 缓存、远端 open_url 候选、manifest 缓存、catalog 缓存和 localStorage 状态。',
    'Tauri 模块包后端：src-tauri/src/modules/module_bundle.rs 提供 prepare_module_bundle、resolve_module_bundle_file 和 open_module_bundle_window，写入 bundle.zip 与缓存元信息。',
    '学习通签到页面：src/components/MoreChaoxingCheckinView.vue 组合签到活动、签到记录、位置签到、拍照签到、手势签到和二维码签到弹窗。',
    '在线学习入口源码：src/components/MoreShuakeView.vue、src/components/OnlineLearningChaoxingView.vue、src/components/OnlineLearningYuketangView.vue 当前存在，但普通 App 渲染链路需要以后续接入为准。',
    '签到后端：src-tauri/src/modules/chaoxing_checkin 包含签到列表、普通签到、位置签到、拍照签到、二维码签到、手势签到、签到记录、二维码解析和清理学习通数据。',
    '在线学习后端：src-tauri/src/modules/online_learning.rs 覆盖学习通、长江雨课堂、同步记录、平台缓存、课程列表、章节、进度、自动学习相关心跳接口。',
    '发布目录：website/public/modules/main/catalog.json、website/public/modules/dev/catalog.json、website/public/modules/latest/catalog.json 是当前可见模块清单依据。',
    '构建脚本：scripts/build_website_modules.mjs 从 website/modules-src 构建 site、bundle.zip、manifest.json 和三渠道 catalog，并跳过 disabled 模块。',
];

const Extensions = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">用户文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                扩展模块全量指南
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                本页覆盖更多模块、模块中心、模块市场、模块宿主、远程 catalog、manifest、bundle.zip、
                学习通签到、在线学习和 website/modules-src 下的小游戏。核心原则是：用户看到的是模块卡片，
                实际运行链路是 catalog 到 manifest，再到 package_url 和 package_sha256 校验，最后进入本地缓存或远端页面与 iframe 宿主。
            </p>
        </header>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">快速使用顺序</h2>
            <div className="rounded-lg border border-cyan/20 bg-cyan/5 p-5">
                <ol className="list-decimal space-y-3 pl-5 text-sm leading-8 text-gray-300">
                    <li>从“我的 / 更多”打开模块中心，等待模块市场卡片完成加载。</li>
                    <li>第一次点击远程模块时保持网络可用，等待 manifest 获取、bundle.zip 下载和本地缓存写入。</li>
                    <li>再次打开同一模块时优先检查线上版本；若版本与 package_sha256 一致，会尽量命中本地缓存。</li>
                    <li>进入模块宿主后，如果页面提示加载超时、白屏或本地缓存缺失，先返回更多页刷新并重新进入。</li>
                    <li>使用学习通签到或在线学习前，先确认学习通或长江雨课堂会话有效，必要时重新登录或扫码。</li>
                </ol>
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">模块中心、模块市场与缓存链路</h2>
            {moduleFlow.map((item) => (
                <article key={item.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                    <h3 className="mb-3 text-xl font-bold text-cyan">{item.title}</h3>
                    <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                        {item.details.map((detail) => (
                            <li key={detail}>{detail}</li>
                        ))}
                    </ul>
                </article>
            ))}
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">模块宿主与平台差异</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {runtimeNotes.map((note) => (
                    <article key={note.title} className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="mb-2 text-lg font-semibold text-cyan">{note.title}</h3>
                        <p className="text-sm leading-7 text-gray-300">{note.desc}</p>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">超星签到、学习记录与在线学习</h2>
            {checkinModules.map((module) => (
                <article key={module.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                    <h3 className="mb-3 text-xl font-bold text-white">{module.title}</h3>
                    <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                        {module.details.map((detail) => (
                            <li key={detail}>{detail}</li>
                        ))}
                    </ul>
                </article>
            ))}
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">当前已发布小游戏</h2>
            <div className="grid gap-4 lg:grid-cols-2">
                {publishedGames.map((game) => (
                    <article key={game.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <div className="mb-3 flex flex-col gap-1 border-b border-white/10 pb-3">
                            <h3 className="text-xl font-bold text-white">{game.name}</h3>
                            <div className="text-xs text-cyan">{game.id}</div>
                            <div className="text-xs text-gray-500">{game.status}</div>
                        </div>
                        <p className="mb-3 text-sm leading-7 text-gray-300">{game.desc}</p>
                        <div className="text-xs leading-6 text-gray-500">
                            <strong className="text-gray-300">源码证据：</strong>{game.source}
                        </div>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">存在源码但不应写成已上线的模块</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {unpublishedModules.map((module) => (
                    <article key={module.id} className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-5">
                        <h3 className="text-xl font-bold text-white">{module.name}</h3>
                        <div className="mt-1 text-xs text-amber-200">{module.id} · {module.status}</div>
                        <p className="mt-3 text-sm leading-7 text-gray-300">{module.desc}</p>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">用户边界与排错提示</h2>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    {userBoundaries.map((item) => (
                        <li key={item}>{item}</li>
                    ))}
                </ul>
            </div>
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
            <Link href="/docs/user-guide" className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50">
                <div className="mb-2 text-lg font-semibold text-cyan">回到用户手册</div>
                <p className="text-sm leading-7 text-gray-300">从首页、我的页、更多模块和设置入口串起普通用户阅读路径。</p>
            </Link>
            <Link href="/docs/module-system" className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50">
                <div className="mb-2 text-lg font-semibold text-cyan">继续模块系统文档</div>
                <p className="text-sm leading-7 text-gray-300">开发者侧会继续展开 manifest 字段、模块构建、桥接边界和发布流程。</p>
            </Link>
        </section>
    </div>
);

export default Extensions;
