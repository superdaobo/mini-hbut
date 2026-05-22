import DocSectionPage from './DocSectionPage';

const SecurityPrivacy = () => (
    <DocSectionPage
        title="安全与隐私"
        audience="用户与开发者文档"
        subtitle="统一解释账号、Cookie、密码、token、本地缓存、SQLite、云同步、远程配置、自定义 JS、调试桥和热更新边界。"
        coverage={['账号和会话数据', '本地缓存与 SQLite', '云同步和远程配置', '调试桥、热更新和外部资源']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['登录、Cookie、存储、网络、平台权限、远程配置和云同步相关源码。', 'guard_sensitive_uploads、check-frontend-safety 等安全脚本。'],
            },
            {
                title: '本页骨架职责',
                items: ['为 Task 14 的安全隐私文档提供入口。', '同时服务用户可理解说明和开发者边界说明。'],
            },
        ]}
    />
);

export default SecurityPrivacy;
