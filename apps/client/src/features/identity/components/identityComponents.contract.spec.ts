// src/features/identity/components/identityComponents.contract.spec.ts
//
// #623 Component 测试清单（源码契约测试，读取 .vue + 外部 scoped css）：
//   - 应用名 + 域名同时显示（防同名钓鱼）
//   - scope 正确文案（服务端 label + 本地兜底元数据）
//   - student.identity 明确「Mini-HBUT 本地验证」
//   - 敏感 scope 图标 + 文字双重标识（不只依赖颜色）
//   - approved/denied/expired/error 结果状态
//   - 键盘可达性（focus trap / Escape / aria-modal / safe-area）
//
// 采用与 TowerGoView.spec.ts 相同的 readVueContractSource 模式：
// 组件不挂载 DOM（项目无 jsdom），通过源码断言保证安全交互结构存在。

import { describe, expect, it } from 'vitest'
import { readVueContractSource } from '../../../utils/contract_source_test'
import {
  IDENTITY_SCOPE_META,
  NON_OFFICIAL_NOTICE,
  SENSITIVE_SCOPE_NOTICE
} from '../identityScopes'

const overlaySource = () => readVueContractSource('src/features/identity/components/IdentityApprovalOverlay.vue')
const scopeListSource = () => readVueContractSource('src/features/identity/components/IdentityScopeList.vue')
const clientCardSource = () => readVueContractSource('src/features/identity/components/IdentityClientCard.vue')
const resultSource = () => readVueContractSource('src/features/identity/components/IdentityResultState.vue')
const deviceSource = () => readVueContractSource('src/features/identity/components/IdentityDeviceSettings.vue')

describe('#623 Component 契约：应用信息与权限展示', () => {
  it('app name + 域名同时显示（防同名钓鱼，不隐藏 homepage_host）', () => {
    const source = clientCardSource()
    // 应用名与域名都绑定展示
    expect(source).toContain('client.name')
    expect(source).toContain('client.homepage_host')
    expect(source).toContain('未知应用') // 无 name 时兜底
    // 开发者显示名 + 审核状态
    expect(source).toContain('client.developer_display_name')
    expect(source).toContain('已审核')
    expect(source).toContain('未审核')
    // 展示资料全部来自 Core sanitized DTO，不信任深链字段
    const overlay = overlaySource()
    expect(overlay).toContain('ui.requestDetail')
  })

  it('scope 正确文案：服务端 label 展示 + 本地兜底元数据存在', () => {
    // 本地兜底元数据与 Core SCOPE_META 文案对齐（label 以服务端为准）
    expect(IDENTITY_SCOPE_META.openid.label).toBe('确认你的 Mini-HBUT 身份')
    expect(IDENTITY_SCOPE_META['student.identity'].label).toBe('获取你的学校身份（如学号、姓名）')
    expect(IDENTITY_SCOPE_META['student.identity'].risk).toBe('sensitive')
    // 组件渲染 scope.id（强标签）+ scope.label（说明）
    const source = scopeListSource()
    expect(source).toContain('scope.id')
    expect(source).toContain('scope.label')
    expect(source).toContain('基础权限')
    expect(source).toContain('敏感权限')
  })

  it('student.identity 明确「Mini-HBUT 本地验证」，不显示官方认证字样', () => {
    const source = overlaySource()
    // 当前身份区：学校身份验证方式明确为 Mini-HBUT 本地验证
    expect(source).toContain('学校身份验证方式：Mini-HBUT 本地验证')
    // 非官方声明（#617 信任边界）：由 IdentityScopeList 插值 identityScopes 常量
    const scopeList = scopeListSource()
    expect(scopeList).toContain('NON_OFFICIAL_NOTICE')
    expect(NON_OFFICIAL_NOTICE).toContain('不代表湖北工业大学官方认证')
    // 绝不出现「湖北工业大学官方认证」之类表述
    expect(source).not.toContain('官方认证')
    expect(source).not.toContain('湖北工业大学认证')
  })

  it('敏感 scope：图标 + 边框 + 文字三重标识（不只依赖颜色）', () => {
    const source = scopeListSource()
    // 文字标识：aria-label + 非恐吓式提示文案（组件插值常量）
    expect(source).toContain('aria-label="敏感权限"')
    expect(source).toContain('SENSITIVE_SCOPE_NOTICE')
    expect(SENSITIVE_SCOPE_NOTICE).toContain('在线验证你的学校登录状态')
    // 视觉标识：敏感分组 class + 图标（颜色之外的冗余通道）
    expect(source).toContain('identity-scope-group--sensitive')
    expect(source).toContain('identity-scope-item--sensitive')
    expect(source).toContain('shield_person')
    // scope 分组不依赖颜色：risk 字段驱动
    expect(source).toContain('groupScopesByRisk')
  })

  it('approved/denied/cancelled/expired/error 五种结果状态', () => {
    const source = resultSource()
    expect(source).toContain('已允许登录')
    expect(source).toContain('已拒绝授权')
    expect(source).toContain('已取消授权')
    expect(source).toContain('请求已过期')
    expect(source).toContain('授权失败')
    // 终态不泄露内部错误细节：结果页不渲染 errorCode/internalDetail/脱敏日志
    expect(source).not.toContain('errorCode')
    expect(source).not.toContain('internalDetail')
    expect(source).not.toContain('private')
  })

  it('键盘可达性：focus trap / Escape 等价取消 / role=dialog / safe-area', () => {
    const source = overlaySource()
    // ARIA 对话框语义
    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-modal="true"')
    // Escape 不得无声关闭并仍批准：走 cancelActive / confirmResult
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain('cancelActive()')
    expect(source).toContain('confirmResult()')
    // Tab focus trap 接线
    expect(source).toContain('trapTabFocus')
    expect(source).toContain('focusCard')
    // 动作进行中禁用按钮（防重复点击/悬空）
    expect(source).toContain(':disabled="busy"')
    // 关闭按钮 = 取消此次授权（不是隐藏 Overlay）
    expect(source).toContain('aria-label="取消此次授权"')
    // 强制遮罩优先级：force update / blocking announcement 可见时本 Overlay 隐藏
    expect(source).toContain('forceUpdateVisible')
    expect(source).toContain('blockingAnnouncementVisible')
  })

  it('设备安全设置：撤销强确认 Modal + 恢复说明 + 授权记录 V1.1 预留', () => {
    const source = deviceSource()
    expect(source).toContain('撤销此设备')
    expect(source).toContain('REVOKE_CONFIRM_PHRASE')
    expect(source).toContain('输入「')
    // 最后设备/恢复说明
    expect(source).toContain('唯一的设备')
    expect(source).toContain('重新通过网页授权流程绑定')
    // 授权记录 V1.1 预留入口
    expect(source).toContain('授权记录')
    expect(source).toContain('V1.1')
  })
})
