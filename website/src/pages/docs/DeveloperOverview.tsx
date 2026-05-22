import DocSectionPage from './DocSectionPage';

const DeveloperOverview = () => (
    <DocSectionPage
        title="开发者总览"
        audience="开发者文档"
        subtitle="面向维护者和贡献者说明仓库结构、运行方式、阅读顺序、贡献入口和后续专题页面关系。"
        coverage={['仓库结构', '开发环境和运行入口', '贡献阅读顺序', '源码到文档的导航']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['More.tsx 的开发指南内容。', 'Task 1 和 Task 3 的源码结构、脚本、平台、工具层索引。'],
            },
            {
                title: '本页骨架职责',
                items: ['作为开发者文档的起点。', '把具体架构、平台、模块、构建和安全内容分流到专题页面。'],
            },
        ]}
    />
);

export default DeveloperOverview;
