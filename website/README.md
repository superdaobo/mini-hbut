# mini-hbut 官网（文档与下载站）

`mini-hbut官网` 是 Mini-HBUT 项目的官方前端站点，承担以下职责：

- 展示 3D 交互式产品首页、版本信息与下载入口
- 承载开发文档（架构、API、发布规范、集成说明）
- 统一对外发布新增能力与兼容性说明

## 技术栈

- Next.js 15 + React 19 + TypeScript
- Tailwind CSS
- Three.js + React Three Fiber + Drei
- GSAP ScrollTrigger + Lenis 平滑滚动
- Framer Motion
- Lucide Icons

## 开发命令

在 `website/` 目录下执行：

```bash
npm install
npm run dev
```

本地开发服务器默认运行在 [http://localhost:3000](http://localhost:3000)。

### 构建与预览

```bash
npm run build
npm run start
```

构建产物输出到 `dist/`（`output: 'export'` 静态导出）。

### 其他脚本

```bash
npm run lint
npm run test:docs-ia
npm run test:docs-developer-content
npm run test:docs-user-content
npm run test:release-links
```

## 路由结构

| 路径 | 说明 |
|------|------|
| `/` | 3D 滚动驱动产品首页 |
| `/releases` | 历史版本与下载 |
| `/search` | 站内搜索 |
| `/docs/*` | 文档中心（用户文档、开发者文档、参考资料） |

## 首页 3D 架构（核心文件）

```text
src/
├─ app/                    # Next.js App Router
├─ components/
│  ├─ home/HomeExperience.tsx
│  ├─ SceneCanvas.tsx
│  ├─ PhoneModel.tsx
│  ├─ CameraRig.tsx
│  ├─ SmoothScrollProvider.tsx
│  └─ ...
├─ lib/scroll-utils.ts     # 运镜关键帧与滚动阶段
├─ hooks/use-scroll-progress.tsx
└─ views/                  # 页面视图（文档、发布页等）
```

## 文档入口（站内）

- `/docs`：文档总览
- `/docs/quick-start`：快速开始
- `/docs/user-guide`：用户手册
- `/docs/developer`：开发者总览
- `/docs/reference`：参考资料索引

## 维护建议

- 文档内容应与 `tauri-app/README.md`、`src-tauri` 实际实现保持一致。
- 每次客户端发版后，优先更新官网文档中的「新增能力」和「接口变化」。
- 若涉及远程配置字段扩展，需同步更新站点文档与示例 JSON。
