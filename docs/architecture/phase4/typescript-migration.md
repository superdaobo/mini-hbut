# 阶段 4C：核心 JavaScript 渐进迁移 TypeScript

## 迁移顺序与结果

本轮严格按 Issue #555 的顺序建立 TypeScript 公共边界：

1. credential_storage：完整迁移为 TypeScript，补齐账户键、迁移输入和原生调用返回类型。
2. api：完整迁移为 TypeScript，缓存、SWR、维护模式和泛型请求均有显式类型。
3. axios_adapter：完整迁移为 TypeScript，统一 JsonObject、原生 invoke 与桥接响应边界。
4. remote_config：公共 API 迁移为 TypeScript；高风险配置归一化实现隔离在 remote_config.runtime.js，由单一 typed facade 约束。
5. cloud_sync：公共 API 迁移为 TypeScript；大型同步编排隔离在 cloud_sync.runtime.js，由输入、结果、冷却与配置类型约束。
6. notify_center：公共 API 迁移为 TypeScript；通知调度实现隔离在 notify_center.runtime.js，由检查与监控类型约束。
7. updater：公共 API 迁移为 TypeScript；渠道、Release、下载结果均由 typed facade 约束。
8. background_fetch：完整迁移为 TypeScript，补齐 Capacitor 上下文、回调事件与运行状态类型。

同时将 encryption.js 完整迁移为 encryption.ts，避免 credential_storage 依赖无类型加密边界。

## Runtime 隔离原则

remote_config、cloud_sync、notify_center、updater 的实现体较大且包含大量平台分支。本阶段没有使用全文件 ts-nocheck，也没有对业务代码铺设 any；而是将旧实现改名为明确的 runtime 文件，只允许对应 TypeScript facade 导入。应用和测试继续通过原模块名访问，新增调用必须满足 TypeScript 接口。

这不是永久终点。后续可在不改变调用方的前提下逐段把 runtime 内部实现迁回 .ts；每段迁移都必须删除相应 facade 断言并通过全量测试。

## 验证

- npm run typecheck
- npm run test:ci
- npm run build
- npm run check:architecture

## 回滚

迁移未改变持久化格式与 HTTP 协议。回滚单个模块时恢复原文件名和导入即可；不要同时回滚安全存储格式迁移。
