import DocSectionPage from './DocSectionPage';

const UserGuide = () => (
    <DocSectionPage
        title="用户手册"
        audience="用户文档"
        subtitle="面向普通用户的功能地图，用于解释每类功能在哪里、适合什么场景、遇到加载失败或登录过期时该如何理解。"
        coverage={['首页与全局导航', '登录态和权限提示', '常用功能阅读路径', '跨模块通用状态']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['Guide.tsx 中的功能介绍。', 'Task 2 形成的用户模块清单和入口关系。'],
            },
            {
                title: '本页骨架职责',
                items: ['作为用户文档总目录。', '把具体功能说明分流到教务服务、校园生活、社区通知和扩展模块页面。'],
            },
        ]}
    />
);

export default UserGuide;
