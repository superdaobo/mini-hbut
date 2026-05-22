import DocSectionPage from './DocSectionPage';

const PlatformTauri = () => (
    <DocSectionPage
        title="平台与 Tauri"
        audience="开发者文档"
        subtitle="覆盖 Tauri、Capacitor、Web 平台适配层、原生桥接、权限、Tauri commands、Rust modules 和 HTTP client。"
        coverage={['平台运行时检测', 'native bridge 和权限边界', 'Tauri command 与 Rust 模块', 'HTTP client、Cookie、会话和 OCR']}
        sections={[
            {
                title: '后续扩写来源',
                items: ['src/platform、src-tauri/src/lib.rs、src-tauri/src/modules、src-tauri/src/http_client。', 'Technical.tsx 中的平台能力和 Tauri API 说明。'],
            },
            {
                title: '本页骨架职责',
                items: ['为 Task 12 的平台适配专题提供入口。', '把 Tauri 参考接口与平台架构说明分离。'],
            },
        ]}
    />
);

export default PlatformTauri;
