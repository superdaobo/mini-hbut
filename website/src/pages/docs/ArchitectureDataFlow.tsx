import DocSectionPage from './DocSectionPage';

const ArchitectureDataFlow = () => (
    <DocSectionPage
        title="架构与数据流"
        audience="开发者文档"
        subtitle="覆盖 Vue 入口、视图分发、状态恢复、API/缓存/降级、论坛、通知、Widget 和数据库关系。"
        coverage={['Vue 应用入口和视图分发', '状态恢复与导航父子关系', 'API、缓存、离线降级', '数据库、论坛、通知、Widget']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['src/main.ts、src/App.vue、src/components、src/utils。', 'Technical.tsx 中的架构、缓存、云同步和模块说明。'],
            },
            {
                title: '本页骨架职责',
                items: ['承接 Task 10 和 Task 11 的开发者核心内容。', '避免 Technical.tsx 继续成为单页大杂烩。'],
            },
        ]}
    />
);

export default ArchitectureDataFlow;
