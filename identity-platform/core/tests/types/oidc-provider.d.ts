/**
 * oidc-provider 类型声明（tests 侧残留：早期 #619 的最小声明）。
 *
 * 说明：完整的 oidc-provider 类型（Provider 构造/模型/事件/interaction）已由
 * #620 在 src/oidc/oidc-provider.d.ts 统一接管（官方包纯 JS 无类型）；
 * 本文件只保留官方 memory adapter 子路径的声明（#619 adapter 对照测试用），
 * 避免 class 重复声明在 skipLibCheck 下成员丢失。
 */

declare module 'oidc-provider/lib/adapters/memory_adapter.js' {
  export function createMemoryAdapter(
    clockTolerance?: number,
  ): (model: string) => {
    upsert(id: string, payload: Record<string, unknown>, expiresIn?: number): Promise<void>
    find(id: string): Promise<Record<string, unknown> | undefined>
    findByUserCode(userCode: string): Promise<Record<string, unknown> | undefined>
    findByUid(uid: string): Promise<Record<string, unknown> | undefined>
    consume(id: string): Promise<void>
    destroy(id: string): Promise<void>
    revokeByGrantId(grantId: string): Promise<void>
  }
}
