'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
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
    History,
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
    {
        title: '历史文档',
        links: [
            { path: '/docs/guide', label: '安装指南', icon: <History size={18} /> },
            { path: '/docs/configuration', label: '配置说明', icon: <Settings size={18} /> },
            { path: '/docs/faq', label: '旧版 FAQ', icon: <HelpCircle size={18} /> },
            { path: '/docs/technical', label: '技术原理', icon: <Cpu size={18} /> },
            { path: '/docs/more', label: '更多资料', icon: <BookOpen size={18} /> },
        ],
    },
];

const defaultRecommendedDocs = [
    { path: '/docs/quick-start', label: '快速开始', desc: '从安装、首次登录、首页、搜索和底部主 Tab 建立使用路径。' },
    { path: '/docs/user-guide', label: '用户手册', desc: '按普通用户视角串起功能分类、登录状态、空状态和离线状态。' },
    { path: '/docs/developer', label: '开发者总览', desc: '按源码阅读顺序理解入口、组件、平台桥接和维护边界。' },
    { path: '/docs/reference', label: '参考资料', desc: '需要定位源码、脚本、API 或历史说明时从这里跳转。' },
];

const recommendedReadingByPath: Record<string, Array<{ path: string; label: string; desc: string }>> = {
    '/docs': [
        { path: '/docs/quick-start', label: '快速开始', desc: '先完成用户侧首次使用路径。' },
        { path: '/docs/user-guide', label: '用户手册', desc: '再按普通用户功能地图阅读各模块。' },
        { path: '/docs/developer', label: '开发者总览', desc: '需要源码实现时进入开发者阅读线。' },
        { path: '/docs/reference', label: '参考资料', desc: '最后用索引定位文件、脚本和参考页。' },
    ],
    '/docs/quick-start': [
        { path: '/docs/user-guide', label: '用户手册', desc: '继续阅读完整用户路径和功能分类地图。' },
        { path: '/docs/academic', label: '教务服务', desc: '进入成绩、课表、考试、排名和培养方案专题。' },
        { path: '/docs/settings-data', label: '设置与数据', desc: '配置主题、字体、导出、云同步和反馈材料。' },
        { path: '/docs/troubleshooting', label: '故障排查', desc: '登录、安装、通知、网络或缓存异常时从这里查。' },
    ],
    '/docs/user-guide': [
        { path: '/docs/academic', label: '教务服务', desc: '学习场景相关功能的详细入口和状态说明。' },
        { path: '/docs/campus-life', label: '校园生活', desc: '校园码、电费、图书馆、地图和资料分享。' },
        { path: '/docs/community-notifications', label: '社区与通知', desc: '论坛、通知权限、课程提醒和后台任务。' },
        { path: '/docs/settings-data', label: '设置与数据', desc: '换设备、导出、反馈或排错前阅读。' },
    ],
    '/docs/academic': [
        { path: '/docs/user-guide', label: '用户手册', desc: '回到普通用户功能地图。' },
        { path: '/docs/campus-life', label: '校园生活', desc: '继续阅读一卡通和资源类模块。' },
        { path: '/docs/troubleshooting', label: '故障排查', desc: '处理登录过期、空结果和教务维护。' },
        { path: '/docs/reference', label: '参考资料', desc: '定位成绩、课表、考试等源码入口。' },
    ],
    '/docs/campus-life': [
        { path: '/docs/community-notifications', label: '社区与通知', desc: '继续阅读通知、反馈和论坛。' },
        { path: '/docs/settings-data', label: '设置与数据', desc: '理解缓存、导出、日志和云同步。' },
        { path: '/docs/troubleshooting', label: '故障排查', desc: '处理电费、校园码、资源预览和网络问题。' },
        { path: '/docs/security-privacy', label: '安全与隐私', desc: '确认一卡通、缓存和远程资料边界。' },
    ],
    '/docs/community-notifications': [
        { path: '/docs/campus-life', label: '校园生活', desc: '回看通知相关的校园生活数据来源。' },
        { path: '/docs/settings-data', label: '设置与数据', desc: '调整通知权限、日志和反馈材料。' },
        { path: '/docs/troubleshooting', label: '故障排查', desc: '处理通知不弹、论坛异常和后台任务问题。' },
        { path: '/docs/security-privacy', label: '安全与隐私', desc: '理解论坛 token、通知权限和后台任务边界。' },
    ],
    '/docs/extensions': [
        { path: '/docs/user-guide', label: '用户手册', desc: '回到普通用户入口关系。' },
        { path: '/docs/module-system', label: '模块系统', desc: '从开发者视角理解模块 manifest、catalog 和宿主。' },
        { path: '/docs/build-release', label: '构建发布', desc: '了解模块如何被打包并发布到渠道。' },
        { path: '/docs/security-privacy', label: '安全与隐私', desc: '核对 iframe、本地 bundle 和远程内容边界。' },
    ],
    '/docs/settings-data': [
        { path: '/docs/campus-life', label: '校园生活', desc: '回看会受缓存和导出影响的生活类数据。' },
        { path: '/docs/troubleshooting', label: '故障排查', desc: '处理配置、日志、同步和反馈问题。' },
        { path: '/docs/security-privacy', label: '安全与隐私', desc: '理解本地存储、云同步和敏感信息边界。' },
        { path: '/docs/reference', label: '参考资料', desc: '定位设置、导出和云同步源码。' },
    ],
    '/docs/troubleshooting': [
        { path: '/docs/settings-data', label: '设置与数据', desc: '按配置、日志和导出路径准备反馈材料。' },
        { path: '/docs/security-privacy', label: '安全与隐私', desc: '排查前先确认账号、Cookie 和 token 风险。' },
        { path: '/docs/build-release', label: '构建发布', desc: '开发者排查构建、发布和脚本问题。' },
        { path: '/docs/faq', label: '旧版 FAQ', desc: '查阅旧版问答中的历史说明。' },
    ],
    '/docs/developer': [
        { path: '/docs/architecture', label: '架构与数据流', desc: '继续展开 API、缓存、SQLite、通知和 Widget 数据关系。' },
        { path: '/docs/platform-tauri', label: '平台与 Tauri', desc: '继续展开原生桥接、权限和运行时能力矩阵。' },
        { path: '/docs/module-system', label: '模块系统', desc: '继续展开更多模块、manifest、bundle 和 iframe 宿主。' },
        { path: '/docs/reference', label: '参考资料', desc: '用源码索引定位组件、工具、后端和脚本。' },
    ],
    '/docs/architecture': [
        { path: '/docs/developer', label: '开发者总览', desc: '回到整体源码阅读路径。' },
        { path: '/docs/platform-tauri', label: '平台与 Tauri', desc: '核对 bridge、adapter、commands 和权限。' },
        { path: '/docs/security-privacy', label: '安全与隐私', desc: '理解缓存、Cookie、远程配置和调试桥风险。' },
        { path: '/docs/reference', label: '参考资料', desc: '定位架构相关源码文件。' },
    ],
    '/docs/platform-tauri': [
        { path: '/docs/architecture', label: '架构与数据流', desc: '回看跨端数据来源和状态恢复。' },
        { path: '/docs/module-system', label: '模块系统', desc: '理解模块窗口、本地 bundle 和 preview_url。' },
        { path: '/docs/build-release', label: '构建发布', desc: '核对 Tauri、Capacitor 和 website 发布链。' },
        { path: '/docs/security-privacy', label: '安全与隐私', desc: '核对 shell、通知、Widget 和远程内容边界。' },
    ],
    '/docs/module-system': [
        { path: '/docs/extensions', label: '扩展模块', desc: '从用户视角回看更多模块和小游戏体验。' },
        { path: '/docs/build-release', label: '构建发布', desc: '核对模块构建、catalog 和 manifest 产物。' },
        { path: '/docs/security-privacy', label: '安全与隐私', desc: '核对模块包、iframe、本地文件和 zip 防护。' },
        { path: '/docs/reference', label: '参考资料', desc: '定位模块中心和模块宿主源码。' },
    ],
    '/docs/build-release': [
        { path: '/docs/platform-tauri', label: '平台与 Tauri', desc: '确认跨端能力与打包入口。' },
        { path: '/docs/module-system', label: '模块系统', desc: '核对模块发布产物和渠道。' },
        { path: '/docs/security-privacy', label: '安全与隐私', desc: '核对发布守卫、热更新和敏感信息扫描。' },
        { path: '/docs/reference/dev-rules', label: '开发规范', desc: '查阅工程约束和质量门禁。' },
    ],
    '/docs/security-privacy': [
        { path: '/docs/architecture', label: '架构与数据流', desc: '回看数据流、缓存和错误处理。' },
        { path: '/docs/platform-tauri', label: '平台与 Tauri', desc: '核对 capability、shell、通知和运行时桥接。' },
        { path: '/docs/build-release', label: '构建发布', desc: '检查守卫脚本、热更新包和模块发布流程。' },
        { path: '/docs/troubleshooting', label: '故障排查', desc: '将风险判断落到排错动作。' },
    ],
    '/docs/reference': [
        { path: '/docs/user-guide', label: '用户手册', desc: '从用户视角理解索引中的功能页面。' },
        { path: '/docs/developer', label: '开发者总览', desc: '从开发者视角理解索引中的源码路径。' },
        { path: '/docs/reference/tauri-api', label: 'Tauri API', desc: '查阅命令、桥接和 HTTP 调试入口。' },
        { path: '/docs/reference/dev-rules', label: '开发规范', desc: '查阅工程约束、质量门禁和维护要求。' },
    ],
    '/docs/guide': [
        { path: '/docs/quick-start', label: '快速开始', desc: '迁移到新版安装和首次使用路径。' },
        { path: '/docs/troubleshooting', label: '故障排查', desc: '安装失败、平台限制和更新问题。' },
        { path: '/docs/reference', label: '参考资料', desc: '查阅历史文档和源码索引。' },
        { path: '/docs/faq', label: '旧版 FAQ', desc: '继续查看旧版问答。' },
    ],
    '/docs/configuration': [
        { path: '/docs/settings-data', label: '设置与数据', desc: '迁移到新版设置、缓存、导出和云同步说明。' },
        { path: '/docs/security-privacy', label: '安全与隐私', desc: '确认令牌、远程配置和敏感信息边界。' },
        { path: '/docs/troubleshooting', label: '故障排查', desc: '处理配置保存、测速和网络问题。' },
        { path: '/docs/reference', label: '参考资料', desc: '查阅历史配置页和源码索引。' },
    ],
    '/docs/faq': [
        { path: '/docs/troubleshooting', label: '故障排查', desc: '新版排错专题是旧 FAQ 的主线索引。' },
        { path: '/docs/quick-start', label: '快速开始', desc: '重新确认安装、登录和首页路径。' },
        { path: '/docs/settings-data', label: '设置与数据', desc: '处理设置、日志、反馈和导出。' },
        { path: '/docs/reference', label: '参考资料', desc: '定位旧 FAQ 的历史来源。' },
    ],
    '/docs/technical': [
        { path: '/docs/developer', label: '开发者总览', desc: '迁移到新版开发者阅读顺序。' },
        { path: '/docs/architecture', label: '架构与数据流', desc: '展开数据流、缓存和状态恢复。' },
        { path: '/docs/platform-tauri', label: '平台与 Tauri', desc: '展开跨端桥接和后端命令。' },
        { path: '/docs/reference', label: '参考资料', desc: '查阅源码和历史技术说明。' },
    ],
    '/docs/more': [
        { path: '/docs/reference', label: '参考资料', desc: '从新版索引进入 API、规范和实现札记。' },
        { path: '/docs/module-system', label: '模块系统', desc: '理解更多模块和模块宿主。' },
        { path: '/docs/build-release', label: '构建发布', desc: '查阅发布和维护流程。' },
        { path: '/docs/reference/nonebot', label: 'Nonebot 集成', desc: '继续阅读外部集成参考。' },
    ],
    '/docs/reference/tauri-api': [
        { path: '/docs/platform-tauri', label: '平台与 Tauri', desc: '回到跨端桥接和 command 总览。' },
        { path: '/docs/architecture', label: '架构与数据流', desc: '理解 API 数据流和缓存关系。' },
        { path: '/docs/reference', label: '参考资料', desc: '返回索引。' },
        { path: '/docs/reference/dev-rules', label: '开发规范', desc: '查阅工程约束。' },
    ],
    '/docs/reference/dev-rules': [
        { path: '/docs/developer', label: '开发者总览', desc: '回到开发者阅读路径。' },
        { path: '/docs/build-release', label: '构建发布', desc: '结合质量门禁和发布流程。' },
        { path: '/docs/security-privacy', label: '安全与隐私', desc: '结合敏感信息和权限边界。' },
        { path: '/docs/reference', label: '参考资料', desc: '返回索引。' },
    ],
    '/docs/reference/nonebot': [
        { path: '/docs/reference', label: '参考资料', desc: '返回索引。' },
        { path: '/docs/more', label: '更多资料', desc: '查看历史外部链接和集成入口。' },
        { path: '/docs/security-privacy', label: '安全与隐私', desc: '确认外部集成风险。' },
        { path: '/docs/troubleshooting', label: '故障排查', desc: '处理联动和网络问题。' },
    ],
    '/docs/reference/implementation-notes': [
        { path: '/docs/developer', label: '开发者总览', desc: '回到开发者阅读路径。' },
        { path: '/docs/architecture', label: '架构与数据流', desc: '将实现札记放回当前架构。' },
        { path: '/docs/reference', label: '参考资料', desc: '返回索引。' },
        { path: '/docs/technical', label: '技术原理', desc: '查看历史技术原理。' },
    ],
};

const DocsLayout = ({ children }: { children: React.ReactNode }) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const pathname = usePathname() ?? '/docs';

    const currentSection = docsNavSections.find((section) =>
        section.links.some((link) => link.path === pathname)
    ) ?? docsNavSections[0];
    const currentPage = currentSection.links.find((link) => link.path === pathname) ?? docsNavSections[0].links[0];
    const recommendedDocs = recommendedReadingByPath[pathname] ?? defaultRecommendedDocs;

    const isActive = (path: string) => {
        return pathname === path;
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
                                            href={link.path}
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
                                {children}
                            </div>
                            <section className="mt-12 border-t border-white/10 pt-8">
                                <div className="mb-4">
                                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan/80">
                                        推荐阅读路径
                                    </div>
                                    <h2 className="mt-2 text-2xl font-bold text-white">相关文档</h2>
                                    <p className="mt-3 text-sm leading-6 text-gray-400">
                                        当前页面读完后，可以按下面的交叉链接继续。用户文档、开发者文档、故障排查、参考资料和历史文档会互相补充。
                                    </p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    {recommendedDocs.map((item) => (
                                        <Link
                                            key={item.path}
                                            href={item.path}
                                            className="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-cyan/50 hover:bg-white/[0.05]"
                                        >
                                            <div className="font-semibold text-cyan">{item.label}</div>
                                            <p className="mt-2 text-sm leading-6 text-gray-300">{item.desc}</p>
                                        </Link>
                                    ))}
                                </div>
                            </section>
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
