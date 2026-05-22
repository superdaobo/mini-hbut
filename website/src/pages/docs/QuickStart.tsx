import { Link } from 'react-router-dom';

const platformInstall = [
    {
        name: 'Windows',
        detail: '下载 Releases 页面中的 .msi 安装包，双击安装后从开始菜单或桌面启动。首次启动会初始化本地配置和数据库。遇到 SmartScreen 提示时，确认来源为项目发布页后选择继续运行。',
    },
    {
        name: 'macOS',
        detail: '下载对应芯片架构的 .dmg，将应用拖入 Applications。首次打开如遇“无法验证开发者”，到系统设置的隐私与安全性中允许打开。',
    },
    {
        name: 'Linux',
        detail: '优先使用 AppImage；Debian/Ubuntu 可使用 .deb 包。若启动时报 WebKit 运行时缺失，需要安装系统 WebKit2GTK 相关依赖。',
    },
    {
        name: 'Android',
        detail: '下载 Release APK 并允许“安装未知来源应用”。覆盖安装新版不会清空本地登录信息、缓存和设置。',
    },
    {
        name: 'iOS',
        detail: '当前需要侧载 IPA。安装后到“设置 -> 通用 -> VPN 与设备管理”信任开发者证书；证书到期前需要续签，过期后通常表现为打开即闪退。',
    },
];

const loginMethods = [
    {
        title: '统一身份认证',
        desc: '使用湖工大学号和统一身份认证密码登录。应用会获取验证码页面，调用 OCR 识别验证码后提交登录；登录成功后保存 Cookie 和必要会话信息。',
    },
    {
        title: '学习通',
        desc: '使用学习通账号密码或学习通二维码完成登录。登录后应用会尝试解析学号并关联教务系统，适合学习通状态稳定但门户登录不方便的场景。',
    },
    {
        title: '扫码临时登录',
        desc: '使用门户或学习通客户端扫描应用内二维码完成授权。临时登录适合短时查询，但会话恢复能力弱于账号密码登录。',
    },
];

const firstUseFlow = [
    '安装并启动应用，进入我的页完成登录。未登录时，首页仍可查看图书查询、校园地图、资料分享等不依赖身份的入口；成绩、课表、电费等需要登录的模块会提示先登录。',
    '登录成功后应用进入首页仪表盘。首页会展示天气、今日安排、快捷入口、功能分类和搜索框；今日课程从课表数据生成，未登录、加载中、加载失败、今日无课程安排都会有不同状态。',
    '使用搜索框搜索服务、课程、资讯。服务结果会跳转到对应模块，课程结果来自本周课表搜索条目，资讯结果来自公告/通知数据。',
    '通过底部主 Tab 在首页、个人课表、论坛、通知中心、我的之间切换。进入二级模块后，页面返回按钮会回到进入前的父页面；多数功能页也提供返回仪表盘路径。',
    '进入我的页的设置中心调整主题、字体、后端/OCR、通知和调试选项；进入导出中心可以导出成绩、课表、个人信息等数据。',
    '启用云同步后，课表、自定义课程、设置和部分学业数据可在新设备登录后恢复；无网络或教务维护时，支持离线缓存的数据会显示上次同步内容和同步时间。',
];

const routeCards = [
    {
        title: '用户手册',
        to: '/docs/user-guide',
        desc: '先看功能地图，了解哪些功能需要登录，哪些功能可以直接使用。',
    },
    {
        title: '教务服务',
        to: '/docs/academic',
        desc: '成绩、课表、考试、排名、空教室、选课、校历和培养方案会在这里继续扩写。',
    },
    {
        title: '设置与数据',
        to: '/docs/settings-data',
        desc: '主题、字体、缓存、云同步、导出、远程配置和隐私相关说明会在这里继续扩写。',
    },
    {
        title: '故障排查',
        to: '/docs/troubleshooting',
        desc: '登录失败、验证码、安装拦截、通知收不到、网络维护和数据清理问题集中在这里。',
    },
];

const QuickStart = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">用户文档</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                快速开始
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                本页把首次使用 Mini-HBUT 的关键路径串起来：下载与安装、首次登录、首页仪表盘、底部主 Tab、搜索、设置中心、导出中心、云同步和离线缓存。
                如果只想尽快用起来，按下面顺序走即可。
            </p>
        </header>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">1. 下载与安装</h2>
            <p className="text-gray-300 leading-8">
                安装包以 GitHub Releases 为主入口。不同平台的包类型和系统限制不同，但安装后的应用数据目录会保留登录状态、设置和可缓存数据；覆盖安装通常不会清空本地数据。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
                {platformInstall.map((item) => (
                    <article key={item.name} className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                        <h3 className="mb-2 text-xl font-semibold text-cyan">{item.name}</h3>
                        <p className="text-sm leading-7 text-gray-300">{item.detail}</p>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">2. 首次登录和会话状态</h2>
            <p className="text-gray-300 leading-8">
                登录入口在“我的”页。应用内部以学号判断是否已登录；进入需要身份的模块时，如果尚未登录，会显示“请先在个人中心登录”的提示。
                登录成功后会保存 Cookie 和登录方式，下次启动会尝试自动恢复会话；如果学校会话过期，应用会尝试重新登录，失败时再要求用户手动处理。
            </p>
            <div className="grid gap-4 md:grid-cols-3">
                {loginMethods.map((method) => (
                    <article key={method.title} className="rounded-lg border border-cyan/20 bg-cyan/5 p-5">
                        <h3 className="mb-2 text-lg font-semibold text-white">{method.title}</h3>
                        <p className="text-sm leading-7 text-gray-300">{method.desc}</p>
                    </article>
                ))}
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">3. 从首页仪表盘开始</h2>
            <p className="text-gray-300 leading-8">
                首页是高频入口集合。当前源码中的首页模块被分成教务服务、一码通和资源三类；快捷入口默认围绕成绩、课表、空教室、电费、排名等常用服务，并支持用户自行调整。
            </p>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                <h3 className="mb-4 text-xl font-semibold text-white">推荐首次使用顺序</h3>
                <ol className="space-y-3 text-gray-300">
                    {firstUseFlow.map((item) => (
                        <li key={item} className="leading-8">{item}</li>
                    ))}
                </ol>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">4. 继续阅读路径</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {routeCards.map((card) => (
                    <Link
                        key={card.to}
                        to={card.to}
                        className="rounded-lg border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-cyan/50"
                    >
                        <div className="mb-2 text-lg font-semibold text-cyan">{card.title}</div>
                        <p className="text-sm leading-7 text-gray-300">{card.desc}</p>
                    </Link>
                ))}
            </div>
        </section>
    </div>
);

export default QuickStart;
