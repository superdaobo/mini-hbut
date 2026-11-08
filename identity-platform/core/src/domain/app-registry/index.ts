/**
 * T12 应用注册审核生命周期 —— 领域层出口。
 *
 * 本目录只放**纯逻辑**（无 IO、无数据库、无 Koa），便于穷举测试；
 * 路由层与 provisioner 的装配在后续提交里接（本层已把幂等键与安全阀语义固化）。
 *
 * 设计依据：`docs/architecture/t12-app-registry-lifecycle.md`。
 */

export * from './types.js'
export * from './revision.js'
export * from './lifecycle.js'
export * from './idempotency.js'
export * from './catalog.js'
export * from './provisioning.js'
export * from './reconcile.js'
