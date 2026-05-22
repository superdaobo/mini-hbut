import DocSectionPage from './DocSectionPage';

const BuildRelease = () => (
    <DocSectionPage
        title="构建发布"
        audience="开发者文档"
        subtitle="覆盖根项目和 website 的 npm scripts、Tauri build、Capacitor sync、release manifest、hot bundle、发布链接和脚本风险。"
        coverage={['根项目与 website 构建', 'Tauri 和 Capacitor 发布链', 'release manifest 与热更新包', '测试、脚本和发布链接检查']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['package.json、website/package.json、vite.config.ts、tauri.conf.json。', 'scripts 与 website/scripts 下的构建、发布和安全检查脚本。'],
            },
            {
                title: '本页骨架职责',
                items: ['为 Task 13 的构建、测试、发布和运维文档提供入口。', '记录哪些脚本是只读检查，哪些脚本会写入构建产物。'],
            },
        ]}
    />
);

export default BuildRelease;
