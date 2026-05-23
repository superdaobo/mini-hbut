import { Outlet, Link, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
    Bell,
    Book,
    BookOpen,
    Boxes,
    Bug,
    Building2,
    Code2,
    Cpu,
    Database,
    FileCode2,
    Gauge,
    GraduationCap,
    HelpCircle,
    MoveUp,
    Layers,
    LifeBuoy,
    Map,
    Menu,
    Rocket,
    Settings,
    ShieldCheck,
    TerminalSquare,
    Wrench,
    X,
} from 'lucide-react';
import { useState } from 'react';

const docsNavSections = [
    {
        title: '开始',
        links: [
            { path: '/docs', label: '文档总览', icon: <Book size={18} /> },
            { path: '/docs/quick-start', label: '快速开始', icon: <Rocket size={18} /> },
        ],
    },
    {
        title: '用户文档',
        links: [
            { path: '/docs/user-guide', label: '用户手册', icon: <BookOpen size={18} /> },
            { path: '/docs/academic', label: '教务服务', icon: <GraduationCap size={18} /> },
            { path: '/docs/campus-life', label: '校园生活', icon: <Map size={18} /> },
            { path: '/docs/community-notifications', label: '社区与通知', icon: <Bell size={18} /> },
            { path: '/docs/extensions', label: '扩展模块', icon: <Boxes size={18} /> },
            { path: '/docs/settings-data', label: '设置与数据', icon: <Settings size={18} /> },
            { path: '/docs/troubleshooting', label: '故障排查', icon: <LifeBuoy size={18} /> },
        ],
    },
    {
        title: '开发者文档',
        links: [
            { path: '/docs/developer', label: '开发者总览', icon: <Code2 size={18} /> },
            { path: '/docs/architecture', label: '架构与数据流', icon: <Layers size={18} /> },
            { path: '/docs/platform-tauri', label: '平台与 Tauri', icon: <Cpu size={18} /> },
            { path: '/docs/module-system', label: '模块系统', icon: <Building2 size={18} /> },
            { path: '/docs/build-release', label: '构建发布', icon: <TerminalSquare size={18} /> },
            { path: '/docs/security-privacy', label: '安全与隐私', icon: <ShieldCheck size={18} /> },
        ],
    },
    {
        title: '参考资料',
        links: [
            { path: '/docs/reference', label: '参考资料', icon: <Database size={18} /> },
            { path: '/docs/reference/tauri-api', label: 'Tauri API', icon: <FileCode2 size={18} /> },
            { path: '/docs/reference/dev-rules', label: '开发规范', icon: <Wrench size={18} /> },
            { path: '/docs/reference/nonebot', label: 'Nonebot 集成', icon: <HelpCircle size={18} /> },
            { path: '/docs/reference/implementation-notes', label: '实现札记', icon: <Bug size={18} /> },
        ],
    },
];

const DocsLayout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();

    const currentSection = docsNavSections.find((section) =>
        section.links.some((link) => link.path === location.pathname)
    ) ?? docsNavSections[0];
    const currentPage = currentSection.links.find((link) => link.path === location.pathname) ?? docsNavSections[0].links[0];

    const isActive = (path: string) => {
        return location.pathname === path;
    };

    return (
        <div id="top" className="documentationShell min-h-screen bg-black text-white font-sans flex flex-col">
            <a
                href="#doc-content"
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:border focus:border-cyan/40 focus:bg-black focus:px-4 focus:py-2 focus:text-sm focus:text-cyan"
            >
                跳到正文
            </a>
            <Navbar />

            <div className="flex flex-1 pt-20 relative">
                {isSidebarOpen && (
                    <button
                        className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-30"
                        type="button"
                        aria-label="关闭文档导航遮罩"
                        onClick={() => setIsSidebarOpen(false)}
                    />
                )}

                <button
                    className="lg:hidden fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-cyan/50 bg-cyan/20 text-cyan shadow-[0_0_20px_rgba(15,240,252,0.3)] backdrop-blur-md transition-colors hover:bg-cyan/25 focus:outline-none focus:ring-2 focus:ring-cyan/60"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    type="button"
                    aria-label={isSidebarOpen ? '关闭文档导航' : '打开文档导航'}
                    aria-expanded={isSidebarOpen}
                    aria-controls="docs-sidebar"
                >
                    {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
                </button>

                <aside
                    id="docs-sidebar"
                    aria-modal={isSidebarOpen ? 'true' : undefined}
                    role={isSidebarOpen ? 'dialog' : undefined}
                    className={`
            fixed lg:sticky top-20 left-0 h-[calc(100vh-5rem)] w-[19rem] max-w-[86vw] bg-black/95 lg:bg-black/88 backdrop-blur-xl border-r border-cyan/20
            transform transition-transform duration-300 z-40 overflow-y-auto overscroll-contain
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
                >
                    <div className="p-5 pb-24 lg:p-6">
                        <div className="mb-5 rounded-lg border border-cyan/15 bg-white/[0.03] p-4">
                            <h2 className="font-pixel text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan to-purple">
                                文档中心
                            </h2>
                            <p className="mt-2 text-xs leading-5 text-gray-500">
                                当前：{currentSection.title} / {currentPage.label}
                            </p>
                        </div>
                        <nav className="space-y-5" aria-label="文档导航">
                            {docsNavSections.map((section) => (
                                <div key={section.title} className="space-y-2">
                                    <div className="px-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                                        {section.title}
                                    </div>
                                    {section.links.map((link) => (
                                        <Link
                                            key={link.path}
                                            to={link.path}
                                            onClick={() => setIsSidebarOpen(false)}
                                            aria-current={isActive(link.path) ? 'page' : undefined}
                                            className={`
                    flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all duration-200
                    ${isActive(link.path)
                                                    ? 'border-cyan/35 bg-cyan/10 text-cyan shadow-[0_0_10px_rgba(15,240,252,0.1)]'
                                                    : 'border-transparent text-gray-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-white'}
                  `}
                                        >
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-current">
                                                {link.icon}
                                            </span>
                                            <span className="truncate">{link.label}</span>
                                        </Link>
                                    ))}
                                </div>
                            ))}
                        </nav>

                        <div className="mt-8 pt-8 border-t border-gray-800">
                            <div className="text-xs text-gray-500 uppercase tracking-widest mb-4">Resources</div>
                            <a href="https://github.com/superdaobo/mini-hbut" target="_blank" className="block text-gray-400 hover:text-cyan transition-colors text-sm mb-2">GitHub Repository</a>
                            <a href="https://hbut.edu.cn" target="_blank" className="block text-gray-400 hover:text-cyan transition-colors text-sm">HBUT Official</a>
                        </div>
                    </div>
                </aside>

                <main id="doc-content" className="flex-1 w-full overflow-x-hidden px-4 py-8 sm:px-6 lg:px-10">
                    <div className="mx-auto grid w-full max-w-7xl gap-8 xl:grid-cols-[minmax(0,1fr)_16rem]">
                        <article className="min-w-0 max-w-4xl">
                            <div className="mb-8 rounded-xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
                                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-cyan/80">
                                    <span>{currentSection.title}</span>
                                    <span className="text-gray-600">/</span>
                                    <span>{currentPage.label}</span>
                                </div>
                                <p className="mt-3 text-sm leading-6 text-gray-400">
                                    长文档建议按当前分组逐页阅读；右侧辅助栏会保留当前位置和快速操作。
                                </p>
                            </div>
                            <div className="prose prose-invert prose-cyan max-w-none prose-p:leading-8 prose-li:leading-7 prose-headings:scroll-mt-28 prose-pre:max-w-full prose-pre:overflow-x-auto">
                                <Outlet />
                            </div>
                        </article>

                        <aside className="hidden xl:block">
                            <div className="sticky top-24 space-y-4">
                                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                        <Gauge size={16} className="text-cyan" />
                                        阅读进度
                                    </div>
                                    <p className="mt-3 text-xs leading-5 text-gray-500">
                                        当前位于 {currentSection.title} 分组，页面为 {currentPage.label}。长文内容已限制行宽，便于逐段扫描。
                                    </p>
                                </div>
                                <a
                                    href="#top"
                                    className="flex items-center justify-between rounded-xl border border-cyan/20 bg-cyan/10 px-4 py-3 text-sm text-cyan transition-colors hover:border-cyan/40 hover:bg-cyan/15 focus:outline-none focus:ring-2 focus:ring-cyan/60"
                                >
                                    <span>返回顶部</span>
                                    <MoveUp size={16} />
                                </a>
                            </div>
                        </aside>
                    </div>
                </main>
            </div>

            <div
                className="fixed inset-0 pointer-events-none z-[-1] opacity-10"
                style={{
                    backgroundImage: 'linear-gradient(rgba(15, 240, 252, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 240, 252, 0.1) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                }}
            />
        </div>
    );
};

export default DocsLayout;
