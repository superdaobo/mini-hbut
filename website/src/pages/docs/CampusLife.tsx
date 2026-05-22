import DocSectionPage from './DocSectionPage';

const CampusLife = () => (
    <DocSectionPage
        title="校园生活"
        audience="用户文档"
        subtitle="集中承载校园码、电费、交易流水、图书馆、校园地图、资料分享和天气等校园生活工具。"
        coverage={['校园码和一码通', '电费与交易流水', '图书馆、地图、资料分享', '天气和资源类入口']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['CampusCodeView、ElectricityView、TransactionHistory、LibraryView、CampusMapView、ResourceShareView。', 'Tauri 一码通、电费、交易、资源共享和在线学习相关命令。'],
            },
            {
                title: '本页骨架职责',
                items: ['让生活工具从旧 Guide 中拆出。', '为 Task 8 的校园生活用户文档提供入口。'],
            },
        ]}
    />
);

export default CampusLife;
