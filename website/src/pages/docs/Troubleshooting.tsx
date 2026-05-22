import DocSectionPage from './DocSectionPage';

const Troubleshooting = () => (
    <DocSectionPage
        title="故障排查"
        audience="用户文档"
        subtitle="由现有 FAQ 升级而来，后续覆盖安装、登录、网络、通知、数据隐私、平台差异和反馈入口。"
        coverage={['安装和平台问题', '登录、验证码、网络问题', '通知、后台和缓存问题', '反馈和日志辅助']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['FAQ.tsx 中的问答数据。', '错误提示、调试脚本、日志和平台适配相关源码。'],
            },
            {
                title: '本页骨架职责',
                items: ['保留旧 FAQ 的兼容入口，同时建立更明确的排错入口。', '为 Task 15 的排错与维护手册提供用户侧落点。'],
            },
        ]}
    />
);

export default Troubleshooting;
