import { BookOpen, Compass, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const Overview = () => {
    const navCards = [
        {
            title: '使用指南',
            desc: '安装教程（全平台）、快速上手、功能详解、高级特性与 API 接口说明。',
            path: '/docs/guide',
        },
        {
            title: '配置',
            desc: '外观 / 后端 / 调试设置项详解，远程配置结构，OCR、云同步、WebDAV 自部署指南。',
            path: '/docs/configuration',
        },
        {
            title: '常见问题',
            desc: '登录、功能、安装、网络、通知、隐私、跨平台等常见问题解答。',
            path: '/docs/faq',
        },
        {
            title: '技术原理',
            desc: '架构设计、跨平台桥接、登录会话、数据流缓存、HTTP Bridge、后台任务与云同步机制。',
            path: '/docs/technical',
        },
        {
            title: '更多',
            desc: '开发指南、NoneBot 集成、参与贡献、开源协议与相关链接。',
            path: '/docs/more',
        },
    ];

    return (
        <div className="space-y-10">
            <div className="border-b border-gray-800 pb-6">
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                    文档中心
                </h1>
                <p className="text-xl text-gray-400">
                    欢迎来到 Mini-HBUT 文档中心！这里包含从入门使用到技术深入的全部内容，帮助你快速上手并充分利用 Mini-HBUT 的所有功能。
                </p>
            </div>

            <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Compass className="text-cyan" size={22} />
                    Mini-HBUT 是什么
                </h2>
                <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-800 text-gray-300 space-y-3">
                    <p>
                        Mini-HBUT 是一款专为湖北工业大学学生设计的<strong>跨平台一站式校园助手</strong>，
                        支持 Windows、macOS、Linux、Android 和 iOS 全平台。
                    </p>
                    <p>核心功能包括：</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>成绩查询与 GPA 分析、绩点排名对比</li>
                        <li>智能课表管理、考试安排自动提醒</li>
                        <li>电费余额查询与低电量告警</li>
                        <li>空教室查询、校园地图、图书馆搜索</li>
                        <li>AI 学习助手、校园码生成、云同步</li>
                        <li>后台静默检查、成绩/考试/电费推送通知</li>
                    </ul>
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Sparkles className="text-purple" size={22} />
                    亮点特性
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                        '跨平台：一套代码覆盖 Windows、macOS、Linux、Android、iOS 五大平台。',
                        '离线可用：三层缓存策略保证断网也能查看已加载的数据。',
                        '后台通知：成绩更新、考试提醒、电费告警自动推送到系统通知栏。',
                        '云同步：一键同步设置和数据到云端，换设备也能秒恢复。',
                        '隐私优先：所有数据本地存储，不收集任何个人信息。',
                        '完全开源：GPL v3 协议，代码公开透明。',
                    ].map((item) => (
                        <div key={item} className="p-4 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300">
                            {item}
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <BookOpen className="text-cyan" size={22} />
                    文档导航
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {navCards.map((card) => (
                        <Link
                            key={card.title}
                            to={card.path}
                            className="p-5 rounded-xl bg-gray-900/50 border border-gray-800 hover:border-cyan/30 transition-all"
                        >
                            <div className="text-white font-bold mb-2">{card.title}</div>
                            <div className="text-sm text-gray-400">{card.desc}</div>
                        </Link>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Sparkles className="text-cyan" size={22} />
                    最新能力（v1.2.5）
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                        {
                            title: '后台静默检查',
                            desc: '课表静默刷新 + 新成绩检测 + 考试提醒 + 电费监控，启动即执行一次全量检查。'
                        },
                        {
                            title: 'AI 学习助手',
                            desc: '接入多家大模型（DeepSeek / Qwen / Gemini / GLM），支持流式回复与 LaTeX 公式渲染。'
                        },
                        {
                            title: '移动端后台任务',
                            desc: 'Capacitor Background Fetch 支持进程被杀后周期联网检查，含开机自动拉起。'
                        },
                        {
                            title: '云同步',
                            desc: '基于 Cloudflare Workers + KV 的端到端加密云数据同步，支持设置与学业数据。'
                        },
                        {
                            title: '资源共享',
                            desc: '基于 WebDAV 的校园学习资源共享网络，支持文件上传/下载与在线预览。'
                        },
                        {
                            title: '按需加载 CDN',
                            desc: 'pdf.js / xgplayer / KaTeX 等大型库首次使用时自动下载并持久化缓存到 IndexedDB。'
                        },
                    ].map((item) => (
                        <div key={item.title} className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <div className="text-white font-semibold mb-2">{item.title}</div>
                            <div className="text-sm text-gray-300">{item.desc}</div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="text-green-400" size={22} />
                    版本信息
                </h2>
                <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-800 space-y-2 text-gray-300 text-sm">
                    <div>当前版本：<span className="text-cyan font-semibold">v1.2.5</span></div>
                    <div>技术栈：Vue 3 + Tauri 2.x（桌面端）+ Capacitor 6.x（移动端）</div>
                    <div>支持平台：Windows / macOS / Linux / Android / iOS</div>
                    <div>开源协议：GPL v3</div>
                </div>
            </section>
        </div>
    );
};

export default Overview;

