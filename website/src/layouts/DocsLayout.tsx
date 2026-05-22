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
    GraduationCap,
    HelpCircle,
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

    const isActive = (path: string) => {
        return location.pathname === path;
    };

    return (
        <div className="min-h-screen bg-black text-white font-sans flex flex-col">
            <Navbar />

            <div className="flex flex-1 pt-20 relative">
                <button
                    className="lg:hidden fixed bottom-6 right-6 z-50 p-4 bg-cyan/20 backdrop-blur-md border border-cyan/50 rounded-full text-cyan shadow-[0_0_20px_rgba(15,240,252,0.3)]"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    type="button"
                    aria-label={isSidebarOpen ? '关闭文档导航' : '打开文档导航'}
                >
                    {isSidebarOpen ? <X /> : <Menu />}
                </button>

                <aside
                    className={`
            fixed lg:sticky top-20 left-0 h-[calc(100vh-5rem)] w-72 bg-black/90 backdrop-blur-lg border-r border-cyan/20
            transform transition-transform duration-300 z-40 overflow-y-auto
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
                >
                    <div className="p-6">
                        <h2 className="text-xl font-bold mb-6 font-pixel text-transparent bg-clip-text bg-gradient-to-r from-cyan to-purple">
                            文档中心
                        </h2>
                        <nav className="space-y-6" aria-label="文档导航">
                            {docsNavSections.map((section) => (
                                <div key={section.title} className="space-y-2">
                                    <div className="px-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                                        {section.title}
                                    </div>
                                    {section.links.map((link) => (
                                        <Link
                                            key={link.path}
                                            to={link.path}
                                            onClick={() => setIsSidebarOpen(false)}
                                            className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300
                    ${isActive(link.path)
                                                    ? 'bg-cyan/10 text-cyan border border-cyan/30 shadow-[0_0_10px_rgba(15,240,252,0.1)]'
                                                    : 'text-gray-400 hover:text-white hover:bg-white/5'}
                  `}
                                        >
                                            {link.icon}
                                            <span>{link.label}</span>
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

                <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 lg:px-12 overflow-x-hidden">
                    <div className="prose prose-invert prose-cyan max-w-none">
                        <Outlet />
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
