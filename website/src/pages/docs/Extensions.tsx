import DocSectionPage from './DocSectionPage';

const Extensions = () => (
    <DocSectionPage
        title="扩展模块"
        audience="用户文档"
        subtitle="覆盖更多模块、模块宿主、超星签到、在线学习入口状态和 website/modules-src 下的小游戏模块。"
        coverage={['更多模块与模块市场', '模块宿主和缓存兜底', '超星签到与在线学习', '小游戏和禁用模块说明']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['MoreView、MoreModuleHostView、MoreChaoxingCheckinView 和 chaoxing_checkin 子组件。', 'website/modules-src 与 website/public/modules 下的 manifest/catalog。'],
            },
            {
                title: '本页骨架职责',
                items: ['为 Task 9 的扩展模块用户文档提供入口。', '后续明确 hugongda_escape 源码存在但 manifest 禁用的状态。'],
            },
        ]}
    />
);

export default Extensions;
