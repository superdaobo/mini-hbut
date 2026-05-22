import DocSectionPage from './DocSectionPage';

const QuickStart = () => (
    <DocSectionPage
        title="快速开始"
        audience="用户文档"
        subtitle="用于承接首次安装、首次登录、首页入口、底部导航、搜索和常见首次配置，后续 Task 6 会把现有使用指南内容迁移到这里。"
        coverage={['下载安装与平台差异', '首次登录和会话状态', '首页、搜索、快捷入口', '底部导航和返回路径']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['现有 Guide.tsx 的安装和首次使用内容。', 'Task 2 中记录的首页、登录态门禁、导航恢复和快捷入口源码证据。'],
            },
            {
                title: '本页骨架职责',
                items: ['先提供稳定路由和导航入口。', '避免继续把首次使用说明堆叠到旧的单页使用指南。'],
            },
        ]}
    />
);

export default QuickStart;
