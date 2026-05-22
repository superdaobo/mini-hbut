import { Link } from 'react-router-dom';
import DocSectionPage from './DocSectionPage';

const ReferenceIndex = () => (
    <div className="space-y-8">
        <DocSectionPage
            title="参考资料"
            audience="参考资料"
            subtitle="汇总低频但需要稳定访问的 API、开发规范、外部集成、实现札记、配置 schema、文件索引和脚本索引。"
            coverage={['Tauri API/HTTP Bridge', '开发规范', 'Nonebot 或外部集成', '实现札记与源码索引']}
            sections={[
                {
                    title: '后续扩写来源',
                    items: ['现有 TauriApi.tsx、DevRules.tsx、Nonebot.tsx、Implementation.tsx。', 'Task 16 的源码到文档引用索引。'],
                },
                {
                    title: '本页骨架职责',
                    items: ['把低频查阅内容集中到参考资料分组。', '避免开发者参考页面干扰普通用户主线。'],
                },
            ]}
        />

        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <h2 className="mb-4 text-2xl font-bold text-white">已接入参考页面</h2>
            <div className="grid gap-3 md:grid-cols-2">
                <Link className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-cyan hover:border-cyan/50" to="/docs/reference/tauri-api">Tauri API / HTTP Bridge</Link>
                <Link className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-cyan hover:border-cyan/50" to="/docs/reference/dev-rules">开发规范</Link>
                <Link className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-cyan hover:border-cyan/50" to="/docs/reference/nonebot">Nonebot / 外部集成</Link>
                <Link className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-cyan hover:border-cyan/50" to="/docs/reference/implementation-notes">实现札记</Link>
            </div>
        </section>
    </div>
);

export default ReferenceIndex;
