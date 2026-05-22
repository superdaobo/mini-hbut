import { Link } from 'react-router-dom';

const communityModules = [
    {
        title: '论坛',
        entry: '底部主 Tab -> 论坛。',
        source: 'src/components/ForumView.vue、src/utils/forum_api.js、src/utils/forum_cache.js',
        usage: [
            '论坛按版块组织内容，默认覆盖校园生活、学习互助、失物招领、软件反馈等场景。用户可以浏览帖子、热帖、搜索帖子、进入详情页。',
            '登录后可以发帖、回复、评分、收藏、举报，并维护社区资料。社区资料包含昵称、头像 URL、头像上传和个人简介。',
            '用户主页会展示对方资料和内容摘要；“我的收藏”展示已收藏帖子。',
            '管理员能力只对远端资料标记为管理员的用户显示，包括举报处理、用户管理、备份和徽章相关操作。',
        ],
        states: [
            '未登录时可以浏览部分内容，但发帖、回复、评分、收藏和举报会提示请先登录后再使用社区功能。',
            '帖子列表、帖子详情、用户主页、头像上传都有独立加载失败提示；空列表会展示空状态。',
            '论坛存在本地缓存兜底，但不是离线发帖队列；网络失败时只能辅助展示旧内容，不能保证离线互动提交。',
        ],
    },
    {
        title: '通知中心',
        entry: '底部主 Tab -> 通知。',
        source: 'src/components/NotificationView.vue、src/utils/notify_center.js、src/platform/notification_actions.ts、src-tauri/src/modules/notification.rs',
        usage: [
            '通知中心管理系统通知权限、成绩更新、考试安排、寝室电费、上课提醒和后台自动检查。',
            '通知类型设置可以控制成绩出分提醒、考前提醒、电费提醒和课程提醒；课程提醒支持设置课前提前分钟数。',
            '页面会展示今日课程摘要、电费监控摘要、最近通知和后台检查状态。',
            '发送测试通知用于验证系统通知能力，必要时会尝试移动端重试通道和 Rust 兜底通道。',
        ],
        states: [
            '通知权限包含已授权、已拒绝、未授权、当前环境不支持等状态；权限不足时测试通知不会发送。',
            '未登录状态下无法执行检查；没有在电费模块选择宿舍房间时，电费提醒会提示先在电费模块选择房间。',
            'Android 建议加入后台白名单，iOS 后台任务由系统调度，前台服务保活也依赖平台能力；文档不能承诺后台通知一定准时。',
        ],
    },
];

const platformNotes = [
    {
        title: '通知点击目标',
        desc: 'src/platform/notification_actions.ts 会把通知点击目标限制在允许的视图中，默认回到 notifications，电费通知可跳到 electricity。',
    },
    {
        title: '后台检查边界',
        desc: 'src/utils/notify_center.js 会检查课表、成绩、考试、电费和上课提醒，并写入 hbu_notify_snapshot:{studentId}，但系统可能回收后台任务。',
    },
    {
        title: '论坛权限边界',
        desc: 'ForumView 根据登录态和远端 profile 判断普通用户与管理员。文档只说明用户能看到的能力，不把管理员功能包装成普通入口。',
    },
];

const sourceEvidence = [
    '入口注册：src/App.vue 的 MAIN_TABS 包含 forum 和 notifications，底部 Tab 直接进入论坛与通知中心。',
    '论坛客户端：src/utils/forum_api.js 封装帖子、回复、评分、收藏、举报、用户资料和管理员接口。',
    '论坛缓存：src/utils/forum_cache.js 使用 hbu_forum_cache 做请求失败时的旧数据兜底。',
    '通知调度：src/utils/notify_center.js 保存 hbu_notify_* 设置，执行成绩、考试、电费、课程提醒检查，并同步 Widget 数据。',
    '原生通知：src-tauri/src/modules/notification.rs 和 src/platform/notification_actions.ts 共同处理系统通知与点击后的视图跳转。',
];

const CommunityNotifications = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">用户文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                社区与通知全量指南
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                本页说明论坛和通知中心。论坛用于校园交流、反馈、收藏和社区资料；通知中心用于系统通知权限、课程提醒、电费提醒、考试提醒和后台自动检查。
                两者都依赖登录态、远端服务或系统权限，实际可用性会随网络、平台后台策略和远端配置变化。
            </p>
        </header>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">功能入口、使用方法与异常处理</h2>
            {communityModules.map((module) => (
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
            <h2 className="text-2xl font-bold text-white">平台与权限说明</h2>
            <div className="grid gap-4 md:grid-cols-3">
                {platformNotes.map((note) => (
                    <article key={note.title} className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="mb-2 text-lg font-semibold text-cyan">{note.title}</h3>
                        <p className="text-sm leading-7 text-gray-300">{note.desc}</p>
                    </article>
                ))}
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
            <Link to="/docs/campus-life" className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50">
                <div className="mb-2 text-lg font-semibold text-cyan">返回校园生活</div>
                <p className="text-sm leading-7 text-gray-300">查看校园码、电费、交易记录、图书、地图、资料分享和校园助手。</p>
            </Link>
            <Link to="/docs/settings-data" className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50">
                <div className="mb-2 text-lg font-semibold text-cyan">继续设置与数据</div>
                <p className="text-sm leading-7 text-gray-300">了解通知相关设置、调试日志、导出中心和反馈入口。</p>
            </Link>
        </section>
    </div>
);

export default CommunityNotifications;
