# 项目文档索引

## 架构与开发

- [tauri-app 工程域概览](./architecture/tauri-app-overview.md)
- [后端端点与故障转移契约](./architecture/backend-endpoints-contract.md)
- [环境后端运行手册（dev/beta/release 统一）](./architecture/environment-backend-runbook.md)
- [生产后端接口缺口清单（mini.hbut.site）](./architecture/production-backend-gaps.md)
- [开发文档](./开发文档.md)
- [迁移指南](./migration-guide.md)
- [页面结构（Stitch）](./page-structure-for-stitch.md)

## 平台与协议

- [Android 签名](./android-signing.md)
- [超星协议](./chaoxing-protocol.md)
- [校内信箱 API 备注](./school-inbox-api-notes.md)

## 模块化 / 统一身份迁移（Epic #1161）

- [事实基线与跨端能力矩阵（T01-A）](./architecture/contracts/facts-and-baseline.md)：代码与部署基线、平台能力矩阵、五类凭据边界、待实测与待决策清单
- [模块与授权公共契约（T01-B）](./architecture/contracts/module-and-auth-contracts.md)：模块身份/实例/请求信封/权限版本/目录条目/R1–R9 追踪
- [架构现状与迁移需求说明（10-30 背景材料）](./architecture/mini-hbut-architecture-and-migration-requirements.md)
- [迁移与模块运行时重新规划（11-01）](./architecture/mini-hbut-migration-plan-2026-11-01.md)

## 发布说明

通用发布说明保留在仓库根目录 `release.md`（供 `scripts/build_release_manifests.mjs` 读取；按版本专属说明时可在发布前更新该文件）。
