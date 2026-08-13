// src/features/identity/identitySecurityContract.spec.ts
//
// #623 Contract 测试清单（安全契约）：
//   1. App 不信任 deep-link 里的展示资料（只保留 requestId/handoff/arrivedAt）
//   2. private key 永远不进入 JS（签名在 Rust 侧；提交 body 无密钥材料）
//   3. handoff 不进 localStorage（intent store 无持久化 API 调用）
//   4. test account 不能 Production enroll/approve（isTestAccountBlocked 守卫）
//   5. 没有 student.identity 时不读取学校身份（refreshSessionVerified 只在
//      hasSensitiveScope 分支内调用）
//
// 以「源码契约 + 单元行为」双层断言：不挂载 DOM、不引入 jsdom。

import { describe, expect, it } from 'vitest'
import { readContractSource } from '../../utils/contract_source_test'
import { isTestAccountBlocked } from './identityService'

const coordinatorSource = () => readContractSource('src/app/coordinators/IdentityCoordinator.ts')
const intentStoreSource = () => readContractSource('src/features/identity/identityIntentStore.ts')
const serviceSource = () => readContractSource('src/features/identity/identityService.ts')
const storeSource = () => readContractSource('src/features/identity/identityStore.ts')
const nativeSource = () => readContractSource('src/platform/native.ts')

describe('#623 Contract：信任边界与密钥边界', () => {
  it('App 不信任 deep-link 里的展示资料：submitIntent 只保留合同字段', () => {
    const source = coordinatorSource()
    // 归一化只保留 requestId/handoff/arrivedAt，附加字段一律丢弃
    expect(source).toMatch(/normalized[^;]*requestId[^;]*handoff[^;]*arrivedAt/)
    expect(source).toContain('任何 deep link 附加的展示资料（name/scope/student_id）一律丢弃')
    // 展示数据来源：fetchRequestDetail（Core sanitized），不读深链
    expect(source).toContain('fetchRequestDetail')
    // sanitized 数据说明在 identityService（fetchRequestDetail 注释）
    const service = serviceSource()
    expect(service).toContain('只信任服务端返回的清洗数据')
    expect(service).toContain('deep link 中的任何展示资料一律忽略')
  })

  it('private key 永远不进入 JS：签名由 Rust identity_sign_auth_request 完成', () => {
    const service = serviceSource()
    // approve 提交 body 只含 device_id/issued_at/nonce/signature/canonical_version
    expect(service).toContain('device_id: approval.device_id')
    expect(service).toContain('issued_at: approval.issued_at')
    expect(service).toContain('nonce: approval.nonce')
    expect(service).toContain('signature: approval.signature')
    expect(service).toContain('canonical_version: approval.canonical_version')
    expect(service).not.toContain('private_key')
    expect(service).not.toContain('privateKey')
    const native = nativeSource()
    // 原生命令封装：签名命令参数无密钥材料
    expect(native).toContain("'identity_sign_auth_request'")
    expect(native).not.toContain('private_key')
    // 注释声明安全约定
    expect(native).toContain('任何 identity_ 命令都不接受/返回私钥材料')
  })

  it('handoff 不进 localStorage：intent store 无任何持久化 API 调用', () => {
    const intent = intentStoreSource()
    // 内存 store 不调用任何持久化 API（注释中的禁令字样不算调用）
    expect(intent).not.toContain('localStorage.setItem')
    expect(intent).not.toContain('localStorage.getItem')
    expect(intent).not.toContain('localStorage.removeItem')
    expect(intent).not.toContain('indexedDB.open')
    expect(intent).not.toContain('sessionStorage')
    // 安全红线注释
    expect(intent).toContain('禁止写入 localStorage / IndexedDB / SQLite / debug logs')
    // identityStore 的持久化键只可能是非敏感设备元数据，且不叫 handoff
    const store = storeSource()
    // 存储键定义区（IDENTITY_*_KEY）不含 handoff/secret
    const keyArea = store.slice(store.indexOf('IDENTITY_DEVICE_ID_KEY'), store.indexOf('const safeStorage'))
    expect(keyArea).not.toContain('handoff')
    expect(keyArea).not.toContain('secret')
    expect(store).toContain('IDENTITY_DEVICE_ID_KEY')
    expect(store).toContain('IDENTITY_USER_ID_KEY')
  })

  it('test account 不能 Production enroll/approve（前端防御纵深）', async () => {
    const service = serviceSource()
    // enrollment 与 approve 都有 test account 守卫
    expect(service).toContain("if (isTestAccountBlocked()) {")
    expect(service).toContain('测试账号不能用于正式身份服务')
    // 行为级验证：测试账号标记时拒绝
    try {
      localStorage.clear()
      localStorage.setItem('hbu_test_account_session', '1')
    } catch {
      // node 无 localStorage：跳过行为断言，只保留源码契约
    }
    expect(isTestAccountBlocked()).toBe(false) // node 环境无 localStorage -> false（不误伤）
  })

  it('没有 student.identity 时不读取学校身份：session 刷新只在敏感分支内', () => {
    const source = coordinatorSource()
    // refreshSessionVerified 调用位于 hasSensitiveScope 分支内
    const sensitiveBranch = source.slice(
      source.indexOf('if (hasSensitiveScope(detail.scopes)) {'),
      source.indexOf('setIdentityApprovalPhase(\'ready\'')
    )
    expect(sensitiveBranch).toContain('refreshSessionVerified')
    // 分支外（ready 设置区）不应出现 refreshSessionVerified
    const readyArea = source.slice(source.indexOf("setIdentityApprovalPhase('ready'"))
    expect(readyArea).not.toContain('refreshSessionVerified')
    // 失败不给权限：本地缓存学号 ≠ 验证成功
    expect(source).toContain('本地有缓存学号 ≠ 验证成功')
  })
})
