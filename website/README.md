# mini-hbut 官网（文档与下载站）

`mini-hbut官网` 是 Mini-HBUT 项目的官方前端站点，承担以下职责：

- 展示产品介绍、版本信息与下载入口
- 承载开发文档（架构、API、发布规范、集成说明）
- 统一对外发布新增能力与兼容性说明

## 技术栈

- React 18 + TypeScript
- Vite 5
- Tailwind CSS
- Lucide Icons

## 当前已同步的客户端新增能力（文档已更新）

以下内容已在官网文档中同步更新（对应 Tauri 客户端后续迭代）：

- 图书查询模块：检索、筛选、馆藏详情（索书号/馆藏地/借阅状态）
- 校园地图模块：地图查看、缩放拖拽、远程拉取与缓存策略
- 资料分享模块：WebDAV 目录浏览、预览、下载、下载后分享
- 导出中心：JSON/长图导出、多学期聚合导出、课表临时链接上传
- OCR 策略：远程配置优先、失败自动回退本地兜底
- 远程配置：`ocr` / `temp_file_server` / `resource_share` / 公告 / 强制更新
- 移动端适配：安全区、底部导航、主题风格联动说明

## 开发命令

```bash
npm install
npm run dev
npm run build
npm run preview
```

## 文档入口（站内）

- `/docs/overview`：总览
- `/docs/implementation`：架构与数据流
- `/docs/tauri-api`：HTTP Bridge API 手册
- `/docs/rules`：开发规范
- `/docs/nonebot`：外部集成说明

## 目录结构（核心）

```text
mini-hbut官网/
├─ public/
├─ src/
│  ├─ pages/docs/           # 文档页面
│  ├─ components/           # 站点组件
│  ├─ styles/               # 样式与主题
│  └─ main.tsx
├─ scripts/
├─ package.json
└─ vite.config.ts
```

## 维护建议

- 文档内容应与 `tauri-app/README.md`、`src-tauri` 实际实现保持一致。
- 每次客户端发版后，优先更新官网文档中的“新增能力”和“接口变化”。
- 若涉及远程配置字段扩展，需同步更新站点文档与示例 JSON。
