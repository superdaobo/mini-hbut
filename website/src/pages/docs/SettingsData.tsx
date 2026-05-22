import DocSectionPage from './DocSectionPage';

const SettingsData = () => (
    <DocSectionPage
        title="设置与数据"
        audience="用户文档"
        subtitle="面向用户解释主题、字体、缓存、云同步、导出、远程配置影响、更新和反馈等设置类能力。"
        coverage={['主题、字体和个性化', '缓存、离线和云同步', '导出中心和日志反馈', '远程配置对用户的影响']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['SettingsView、ExportCenterView、ConfigEditor、MeView。', 'settings、theme、font、cloud_sync、remote_config、export_center 等工具。'],
            },
            {
                title: '本页骨架职责',
                items: ['把用户可理解的设置内容从 Configuration 中拆出。', '开发者配置字段后续进入参考资料或开发者页面。'],
            },
        ]}
    />
);

export default SettingsData;
