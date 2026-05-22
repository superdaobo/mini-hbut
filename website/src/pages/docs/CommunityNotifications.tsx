import DocSectionPage from './DocSectionPage';

const CommunityNotifications = () => (
    <DocSectionPage
        title="社区与通知"
        audience="用户文档"
        subtitle="覆盖论坛、通知中心、课程提醒、电费提醒、后台检查和 Widget 差异等沟通与提醒能力。"
        coverage={['论坛浏览与互动', '系统通知权限', '课程和电费提醒', '后台任务与 Widget']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['ForumView、NotificationView、notification_actions、forum_* 工具。', '平台通知适配、后台抓取和 Tauri notification 模块。'],
            },
            {
                title: '本页骨架职责',
                items: ['把社区和提醒类能力从泛用户指南中拆出。', '为用户理解权限、后台和失败状态提供独立页面。'],
            },
        ]}
    />
);

export default CommunityNotifications;
