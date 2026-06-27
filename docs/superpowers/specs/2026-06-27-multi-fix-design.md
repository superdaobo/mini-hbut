# Mini-HBUT 四项修复与 HF 给分同步 — 设计规格

日期：2026-06-27

## 概述

本规格涵盖四个独立可交付子任务：

1. **快捷入口暗色图标**：暗色模式下统一黑色图标背景
2. **学校官网 news 子域**：Tauri 内部本地代理支持 `news.hbut.edu.cn`
3. **服务统计趋势图**：「最新版本人数」系列 X 轴标注版本号
4. **ocr-service 给分每日同步**：后台自动重建 `grade_distribution`，先 testocr1 后生产

## Sub-issue 1：快捷入口暗色图标

### 问题

编辑快捷入口选择器中，暗色模式下部分图标背景为白色、部分为深灰，视觉不一致。

### 根因

- 主网格使用 `quick-entry-icon` + `data-module` + CSS 渐变
- 编辑弹窗缺少上述 class，仅依赖不完整的 `bg-*-50` 暗色覆盖
- `bg-gray-50` 被暗化为 `#334155`，其他 `bg-*-50` 仍为浅色

### 方案

- 编辑弹窗图标容器增加 `quick-entry-icon` 与 `data-module`
- `dark-mode.css` 统一规则：`html.dark .dashboard-root .quick-entry-icon { background: #000 !important; }`
- 删除 per-module 渐变规则
- 保留 `iconColor` 彩色 glyph

### 验收

- `html.dark` 下主网格与编辑选择器图标背景均为黑色
- `npm run test:ci` 通过

## Sub-issue 2：学校官网 news 子域

### 问题

Tauri iOS / 非 desktop 从 www 点击新闻跳转到 `news.hbut.edu.cn` 后页面卡死。

### 根因

- 本地 `school-website` 代理仅转发到 `www.hbut.edu.cn`
- iframe 脱离代理后直接加载 news 子域可能因跨域/X-Frame 策略失败

### 方案（仅 Tauri 内部，不走 ocr-service）

- 扩展 `http_server.rs` 的 `school_website_proxy` 支持 host 参数（`@news/` 或 `?host=`）
- host 校验：`*.hbut.edu.cn`
- HTML 响应轻量链接重写，将官方子域链接改回本地代理路径
- `school_website_embed.ts` 对齐 Tauri bridge URL

### 验收

- 从 www 点新闻可加载 news 内容
- 桌面 native WebView 不退化
- 不新增 ocr-service 代理 endpoint

## Sub-issue 3：服务统计趋势图

### 问题

「近 7 天趋势」中「最新版」折线图 X 轴显示日期，用户期望显示版本号。

### 方案

- 系列 label 改为「最新版本人数」
- 仅该系列 X 轴使用 `row.latest_version`
- 其余系列仍用 `row.date`

### 验收

- 最新版本人数图底部显示版本号（如 `1.4.2`）
- 无需改 ocr-service API

## Sub-issue 4：ocr-service 给分每日同步

### 问题

给分分布表 `grade_distribution` 仅支持手动脚本重建，无每日自动同步。

### 方案

- 抽取 `modules/grade_distribution_rebuild.py` 可调用入口
- `entrypoint.py` 增加 `_grade_distribution_rebuild_loop`
- 环境变量：`GRADE_DIST_AUTO_REBUILD_ENABLED`、`GRADE_DIST_AUTO_REBUILD_INTERVAL`
- 顺序：archive export → rebuild
- `grade_distribution.py` 增加 `SQLPUB_*` fallback
- 先部署 testocr1 验证，再推 ocr-service 生产

### 验收

- `tests/test_grade_distribution_cloud_sources.py` 通过
- testocr1 观察 1 轮 rebuild 日志
- `/api/grade-distribution/semesters` 有数据

## 依赖关系

```
Sub1、Sub3、Sub4 可并行
Sub2 依赖 http_server.rs 改动
Sub4 部署：testocr1 → ocr-service
```

## 回滚

- news 链接重写失效：保留直接 navigate
- rebuild 写坏 SQLPub：testocr1 先跑；skill 备份路径 `data/grade-distribution-cloud-sources/sqlpub-backups/`
- Turso 不稳定：`--skip-turso` + HF archive fallback
