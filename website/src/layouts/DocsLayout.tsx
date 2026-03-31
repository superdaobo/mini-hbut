import { Outlet, Link, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { Menu, X, Book, BookOpen, Settings, HelpCircle, Cpu, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';

const DocsLayout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();

    const links = [
        { path: '/docs', label: '文档总览', icon: <Book size={18} /> },
        { path: '/docs/guide', label: '使用指南', icon: <BookOpen size={18} /> },
        { path: '/docs/configuration', label: '配置', icon: <Settings size={18} /> },
        { path: '/docs/faq', label: '常见问题', icon: <HelpCircle size={18} /> },
        { path: '/docs/technical', label: '技术原理', icon: <Cpu size={18} /> },
        { path: '/docs/more', label: '更多', icon: <MoreHorizontal size={18} /> },
    ];

    const isActive = (path: string) => {
        if (path === '/docs' && location.pathname === '/docs') return true;
        if (path !== '/docs' && location.pathname.startsWith(path)) return true;
        return false;
    }

    return (
        <div className="min-h-screen bg-black text-white font-sans flex flex-col">
            <Navbar />

            <div className="flex flex-1 pt-20 relative">
                {/* Mobile Sidebar Toggle */}
                <button
                    className="lg:hidden fixed bottom-6 right-6 z-50 p-4 bg-cyan/20 backdrop-blur-md border border-cyan/50 rounded-full text-cyan shadow-[0_0_20px_rgba(15,240,252,0.3)]"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                >
                    {isSidebarOpen ? <X /> : <Menu />}
                </button>

                {/* Sidebar */}
                <aside
                    className={`
            fixed lg:sticky top-20 left-0 h-[calc(100vh-5rem)] w-64 bg-black/90 backdrop-blur-lg border-r border-cyan/20 
            transform transition-transform duration-300 z-40 overflow-y-auto
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          `}
                >
                    <div className="p-6">
                        <h2 className="text-xl font-bold mb-6 font-pixel text-transparent bg-clip-text bg-gradient-to-r from-cyan to-purple">
                            文档中心
                        </h2>
                        <nav className="space-y-2">
                            {links.map((link) => (
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
                        </nav>

                        <div className="mt-8 pt-8 border-t border-gray-800">
                            <div className="text-xs text-gray-500 uppercase tracking-widest mb-4">Resources</div>
                            <a href="https://github.com/superdaobo/mini-hbut" target="_blank" className="block text-gray-400 hover:text-cyan transition-colors text-sm mb-2">GitHub Repository</a>
                            <a href="https://hbut.edu.cn" target="_blank" className="block text-gray-400 hover:text-cyan transition-colors text-sm">HBUT Official</a>
                        </div>
                    </div>
                </aside>

                {/* Content Area */}
                <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 lg:px-12 overflow-x-hidden">
                    <div className="prose prose-invert prose-cyan max-w-none">
                        <Outlet />
                    </div>
                </main>
            </div>

            {/* Background Grid (Subtle) */}
            <div className="fixed inset-0 pointer-events-none z-[-1] opacity-10"
                style={{ backgroundImage: 'linear-gradient(rgba(15, 240, 252, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 240, 252, 0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
            />
        </div>
    );
};

export default DocsLayout;
