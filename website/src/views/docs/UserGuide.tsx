import Link from 'next/link';

const moduleGroups = [
    {
        title: '教务服务',
        desc: '面向学习和教务查询，包含成绩查询、个人课表、全校课表、选课中心、空教室、考试安排、绩点排名、校历、学业情况和培养方案。',
        login: '需要登录',
        to: '/docs/academic',
    },
    {
        title: '一码通',
        desc: '面向校园身份和一卡通数据，包含校园码、电费查询和交易记录。校园码、电费与交易流水都依赖登录后的身份或会话。',
        login: '需要登录',
        to: '/docs/campus-life',
    },
    {
        title: '校园生活',
        desc: '面向资源和生活工具，包含图书查询、校园地图、资料分享、天气和资源浏览。图书查询、校园地图、资料分享属于无需登录即可从首页进入的资源类入口。',
        login: '部分无需登录',
        to: '/docs/campus-life',
    },
    {
        title: '社区与通知',
        desc: '面向消息和交流，包含论坛、通知中心、课程提醒、电费提醒和后台任务状态。论坛互动需要登录，通知中心还依赖系统通知权限。',
        login: '部分需要登录',
        to: '/docs/community-notifications',
    },
    {
        title: '扩展模块',
        desc: '面向更多玩法和模块市场，包含更多模块、模块宿主、超星签到、在线学习入口状态和小游戏模块。',
        login: '按模块决定',
        to: '/docs/extensions',
    },
    {
        title: '我的与设置',
        desc: '面向个人资料、设置中心、导出中心、反馈、隐私政策、开源协议、赞助和更新等辅助能力。',
        login: '部分需要登录',
        to: '/docs/settings-data',
    },
];

const commonStates = [
    {
        name: '加载中',
        desc: '页面正在从教务、一卡通、远程配置、本地缓存或模块目录读取数据。等待结束后通常会进入结果、空状态或错误提示。',
    },
    {
        name: '空状态',
        desc: '请求成功但没有数据。例如今日无课程安排、没有考试安排、搜索无结果或当前月份没有交易流水。',
    },
    {
        name: '登录过期',
        desc: '学校会话失效或 Cookie 不再可用。应用会尝试自动恢复会话或重新登录，失败后需要回到我的页处理账号状态。',
    },
    {
        name: '离线',
        desc: '网络不可用、教务维护或远程服务异常时，支持缓存的模块会展示离线缓存和同步时间；不支持缓存的功能会提示重试或稍后再查。',
    },
];

const readingPath = [
    ['快速开始', '/docs/quick-start', '先完成安装、登录、首页仪表盘、搜索和底部主 Tab 的理解。'],
    ['教务服务', '/docs/academic', '再按学习场景阅读成绩、个人课表、考试、排名、培养方案、选课和空教室。'],
    ['校园生活', '/docs/campus-life', '然后阅读电费查询、校园码、图书查询、校园地图、资料分享和交易记录。'],
    ['社区与通知', '/docs/community-notifications', '最后补齐论坛、通知中心、课程提醒、电费提醒和后台任务的使用边界。'],
    ['设置与数据', '/docs/settings-data', '如果换设备、想导出、想改主题/字体/OCR/云同步，再阅读设置与数据。'],
];

const UserGuide = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">用户文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                用户手册
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                这是普通用户阅读路径和功能地图。它不展开内部接口或源码实现，而是说明你能从哪里进入、哪些功能需要登录、哪些功能无需登录、遇到加载中、空状态、登录过期、离线时应该如何理解。
            </p>
        </header>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">普通用户阅读路径</h2>
            <div className="space-y-3">
                {readingPath.map(([title, to, desc], index) => (
                    <Link
                        key={to}
                        href={to}
                        className="flex gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-cyan/50"
                    >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan/10 text-sm font-bold text-cyan">
                            {index + 1}
                        </span>
                        <span>
                            <span className="block font-semibold text-white">{title}</span>
                            <span className="block text-sm leading-7 text-gray-300">{desc}</span>
                        </span>
                    </Link>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">首页与全局导航</h2>
            <div className="rounded-lg border border-cyan/20 bg-cyan/5 p-5 text-gray-300">
                <p className="leading-8">
                    首页与全局导航由主应用统一管理。底部主 Tab 包含首页、个人课表、论坛、通知中心、我的；从首页或我的页进入成绩查询、电费查询、校园码、图书查询、资料分享、更多模块等二级页面后，返回按钮会回到对应父页面。
                    首页搜索会聚合服务、课程和资讯，适合快速进入模块或查找当天课程。
                </p>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">功能分类地图</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {moduleGroups.map((group) => (
                    <Link
                        key={group.title}
                        href={group.to}
                        className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50"
                    >
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <h3 className="text-xl font-semibold text-cyan">{group.title}</h3>
                            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300">{group.login}</span>
                        </div>
                        <p className="text-sm leading-7 text-gray-300">{group.desc}</p>
                    </Link>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">通用状态说明</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {commonStates.map((state) => (
                    <article key={state.name} className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="mb-2 text-lg font-semibold text-white">{state.name}</h3>
                        <p className="text-sm leading-7 text-gray-300">{state.desc}</p>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">常用功能速查</h2>
            <div className="overflow-hidden rounded-lg border border-white/10">
                <table className="w-full text-left text-sm text-gray-300">
                    <thead className="bg-white/5 text-gray-200">
                        <tr>
                            <th className="px-4 py-3">功能</th>
                            <th className="px-4 py-3">入口</th>
                            <th className="px-4 py-3">说明</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                        {[
                            ['成绩查询', '首页 -> 教务服务 / 快捷入口', '查看成绩、绩点、学分，后续专题会补充成绩分布 Beta。'],
                            ['个人课表', '底部主 Tab -> 课表', '查看课程详情、自定义课程、导入导出和云同步。'],
                            ['电费查询', '首页 -> 一码通 / 快捷入口', '选择宿舍后查看余额，支持失败重试和缓存兜底。'],
                            ['校园码', '首页 -> 一码通', '展示在线或离线二维码，依赖身份与配置状态。'],
                            ['图书查询', '首页 -> 资源', '无需登录即可搜索馆藏、筛选并查看详情。'],
                            ['资料分享', '首页 -> 资源', '浏览 WebDAV 资料目录，支持预览和下载兜底。'],
                            ['论坛', '底部主 Tab -> 论坛', '浏览帖子、发帖、回复、收藏和通知，互动需要登录。'],
                            ['通知中心', '底部主 Tab -> 通知', '管理通知权限、课程提醒、电费提醒和测试通知。'],
                            ['更多模块', '我的 -> 更多', '进入模块市场、小游戏、超星签到或模块宿主。'],
                        ].map(([feature, entry, desc]) => (
                            <tr key={feature}>
                                <td className="px-4 py-3 font-medium text-white">{feature}</td>
                                <td className="px-4 py-3">{entry}</td>
                                <td className="px-4 py-3">{desc}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    </div>
);

export default UserGuide;
