import DocSectionPage from './DocSectionPage';

const ModuleSystem = () => (
    <DocSectionPage
        title="模块系统"
        audience="开发者文档"
        subtitle="面向维护者解释模块中心、远程 catalog、manifest、iframe 宿主、安全嵌入和 website/modules-src 构建链。"
        coverage={['module_center 与 more_modules', '远程 catalog 和 manifest', '模块宿主与桥接边界', 'website 模块构建链']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['src/utils/module_center.js、src/utils/more_modules.js、MoreModuleHostView。', 'website/modules-src、website/public/modules 和 scripts/build_website_modules.mjs。'],
            },
            {
                title: '本页骨架职责',
                items: ['承接扩展模块的开发者侧实现说明。', '与用户侧 Extensions 页面互相分工。'],
            },
        ]}
    />
);

export default ModuleSystem;
