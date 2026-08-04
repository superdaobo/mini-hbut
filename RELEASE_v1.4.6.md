# Mini-HBUT v1.4.6 更新说明

发布日期：2026-08-04

---

## ✨ 版本概览

相对 [v1.4.5](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.5)，本版本合入 **4** 个已合并 PR，并在版本窗口内关闭 **6** 个 Issue。

本版本主要完成：

1. **Windows 白屏修复**：v1.4.5 正式版在严格 CSP 下启动首页空白，根因是启动期 Ajv 动态编译被 `unsafe-eval` 禁令阻断；改为 CSP 安全的静态校验器并新增生产 bundle 守卫与 WebView2 冒烟门禁
2. **更新检查修正**：开发版（如 `1.4.5-beta.363`）不再被同核心正式版（`1.4.5`）误判为可更新，只有核心版本真正更高的正式版才提示
3. **阶段 2B / 2C / 3 工程治理**：CodeQL 60 条告警收口、`vue-tsc` 类型检查归零、SQLite 原子性与备份、成绩领域双通道统一、架构防回归
4. **CI 与 dev 构建恢复**：恢复 post-merge website / Capacitor 冒烟工作流，以及完整多平台 dev 构建与 `dev-latest` 部署

完整对比：[v1.4.5...v1.4.6](https://github.com/superdaobo/mini-hbut/compare/v1.4.5...v1.4.6)

---

## 🎯 修复与体验改进

### 🖥️ Windows 白屏修复（#565）

- 修复 Windows v1.4.5 正式版加载启动页后首页空白：桌面端严格 CSP 禁止 `unsafe-eval`，而启动期静态导入的组件快照校验器用 Ajv 动态编译，导致 Vue 挂载前 `#app` 为空
- 改用严格 CSP 安全的静态 TypeScript 校验器，保留原 schema 与 `validateSnapshot.errors` 契约
- Ajv 移出生产依赖与 Vite 预打包
- 新增生产 bundle 守卫：拒绝动态 `eval` / `new Function` / Ajv 编译器代码进入产物
- 新增 WebView2 CDP 冒烟门禁：验证 Vue 已挂载、可见内容存在、无 CSP 违规，并接入 Windows Release-profile 干跑

### 🔄 更新检查修正（#566 / #567）

- 修复开发版被同核心正式版误判为可更新：安装 `1.4.5-beta.363` 时，不再提示可更新到 `1.4.5`；只有核心版本真正更高的正式版（如 `1.4.6`）才会提示
- 正式版之间仍按标准语义化版本比较；dev 频道的滚动 Beta 构建比较逻辑保持不变

---

## 🏗️ 稳定性与工程治理（#558：阶段 2B / 2C / 3）

### 阶段 2B：CodeQL 与敏感数据安全收口（#548）

- 处置基线中 60 条 CodeQL 告警（51 JS/TS、9 Rust）
- 修复 URL 校验、异常文本 XSS、动态方法调用、Shell 参数、敏感 localStorage/日志等真实问题
- 为 Rust 测试字面量、空串哨兵与校园网公开协议常量补充逐条分类与已知向量测试
- 新增 JS/Rust CodeQL triage 文档与防回归测试

### 阶段 2C：真实质量门禁（#549）

- 完整 `vue-tsc --noEmit` 从 292 个错误收口为 0
- CI 与本地统一执行完整类型检查，移除对遗留测试的排除
- 对齐记忆配对 `preview -> playing -> won` 状态机，补齐遗留 JS 模块准确声明文件

### 阶段 3：可靠性、成绩领域与架构收敛（#547 / #550 / #551）

- SQLite 统一 busy timeout、会话原子 UPSERT、并发写测试；新增显式、原子、可校验且有限保留的数据库备份能力
- 核心请求超时、维护状态分类、SWR 退避与跨实例缓存失效
- Tauri Command 与 HTTP Bridge 共用同一个 `GradeService`，统一 Grade DTO、绩点来源与教师补齐，删除旧重复实现
- 平台判断集中到 `src/platform/runtime.ts`；ICS/文件名纯函数集中到共享 Rust 模块
- 新增 `check:architecture` 防回归：阻止成绩双实现、ICS 重复定义、组件 UA 正则及 `api.js/api.ts` 同名回归

---

## 🛠️ CI 与构建

- 恢复合并后自动触发的 website 与 Capacitor 冒烟工作流（#559）
- 恢复 main→dev 的完整多平台构建与 `dev-latest` 部署（iOS / macOS / Linux / Windows / Android），替代冒烟-only 模式（#565）

---

## 📦 版本信息

- 版本号：**1.4.6**
- 标签：[`v1.4.6`](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.6)
- 上一版本：[`v1.4.5`](https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.5)
- 完整变更：[`v1.4.5...v1.4.6`](https://github.com/superdaobo/mini-hbut/compare/v1.4.5...v1.4.6)
- 统计：已合并 PR **4** · 版本窗口内关闭 Issue **6**

---

## 🔗 本版本重点关联

| 类型 | 编号 | 说明 |
|------|------|------|
| PR | [#565](https://github.com/superdaobo/mini-hbut/pull/565) | Windows 严格 CSP 白屏修复与 dev 构建恢复 |
| Issue | [#566](https://github.com/superdaobo/mini-hbut/issues/566) | 开发版被同核心正式版误判为可更新 |
| PR | [#567](https://github.com/superdaobo/mini-hbut/pull/567) | 更新检查：同 core 正式版不回落提示 |
| Epic | [#547](https://github.com/superdaobo/mini-hbut/issues/547) | 阶段 2B、2C 与阶段 3 完整收口 |
| Issue | [#548](https://github.com/superdaobo/mini-hbut/issues/548) | 阶段 2B CodeQL 与敏感数据安全收口 |
| Issue | [#549](https://github.com/superdaobo/mini-hbut/issues/549) | 阶段 2C 全量类型检查与真实测试门禁 |
| Issue | [#550](https://github.com/superdaobo/mini-hbut/issues/550) | 阶段 3 数据可靠性、缓存与备份基础 |
| Issue | [#551](https://github.com/superdaobo/mini-hbut/issues/551) | 阶段 3 统一成绩领域与双通道语义 |
| PR | [#558](https://github.com/superdaobo/mini-hbut/pull/558) | 阶段 2B、2C 与阶段 3 合入 |
| PR | [#559](https://github.com/superdaobo/mini-hbut/pull/559) | 恢复 post-merge website / Capacitor 工作流 |

---

## 📋 完整 PR 列表（v1.4.5 → v1.4.6，共 4 个）

- #558 [stability: complete phase 2B, 2C and phase 3](https://github.com/superdaobo/mini-hbut/pull/558)
- #559 [fix(ci): restore post-merge website and Capacitor workflows](https://github.com/superdaobo/mini-hbut/pull/559)
- #565 [fix: prevent strict-CSP startup white screen and restore full dev builds](https://github.com/superdaobo/mini-hbut/pull/565)
- #567 [fix(updater): prevent same-core stable update prompt for beta installs](https://github.com/superdaobo/mini-hbut/pull/567)

---

## 📋 完整 Issue 列表（版本窗口内关闭，共 6 个）

- #547 [stability: 阶段 2B、2C 与阶段 3 完整收口](https://github.com/superdaobo/mini-hbut/issues/547)
- #548 [security: 阶段 2B CodeQL 与敏感数据安全收口](https://github.com/superdaobo/mini-hbut/issues/548)
- #549 [quality: 阶段 2C 全量类型检查与真实测试门禁](https://github.com/superdaobo/mini-hbut/issues/549)
- #550 [stability: 阶段 3 数据可靠性、缓存与备份基础](https://github.com/superdaobo/mini-hbut/issues/550)
- #551 [refactor: 阶段 3 统一成绩领域与双通道语义](https://github.com/superdaobo/mini-hbut/issues/551)
- #566 [fix(updater): 开发版被同核心正式版误判为可更新](https://github.com/superdaobo/mini-hbut/issues/566)