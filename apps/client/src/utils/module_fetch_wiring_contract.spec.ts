/**
 * #1167 T06 前端接线的源码契约测试。
 *
 * 三条不变式（都是「接错就静默失效」的接缝）：
 * 1. 宿主必须在**消息来源校验之后**才处理受控请求（不能只凭 type 就信）；
 * 2. 未验签实例必须在**本地**就回 `MODULE_NOT_TRUSTED`，不把请求打到 Rust 再等拒；
 * 3. 实例生命周期必须与组件绑定（mount 登记 / unmount 注销 / 切账号清空）。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

const HOST_VIEW = 'src/components/MoreModuleHostView.vue'
const MORE_VIEW = 'src/components/MoreView.vue'
const PROTOCOL = 'src/utils/module_controlled_request.ts'

describe('#1167 T06 宿主接线契约', () => {
  it('受控请求处理器先校验 event.source 与 origin，再看消息类型', () => {
    const source = read(HOST_VIEW)
    const start = source.indexOf('const handleModuleFetchMessage = async (event) => {')
    expect(start, '必须存在 handleModuleFetchMessage').toBeGreaterThan(0)
    const body = source.slice(start, start + 2000)
    const sourceCheck = body.indexOf('event.source !== frameWindow')
    const originCheck = body.indexOf('frameAllowedOrigins.value')
    const typeCheck = body.indexOf('MODULE_FETCH_REQUEST_TYPE')
    expect(sourceCheck).toBeGreaterThan(0)
    expect(originCheck).toBeGreaterThan(0)
    expect(typeCheck).toBeGreaterThan(0)
    // 两个校验都必须出现在「判断 type」之前
    expect(sourceCheck).toBeLessThan(typeCheck)
    expect(originCheck).toBeLessThan(typeCheck)
  })

  it('只在「明确不可信」时本地拦截，未知交给 Rust 判定', () => {
    const source = read(HOST_VIEW)
    const start = source.indexOf('const handleModuleFetchMessage = async (event) => {')
    const body = source.slice(start, start + 2600)
    // 2026-11-06 真机整改：原先用 `!moduleInstanceTrusted.value` 会在
    // 「会话归一化丢掉 trusted 字段」时把整条取数链路静默断掉（真机上表现为
    // controlled_fetch 恒为 MODULE_NOT_TRUSTED）。现在只在明确 false 时拦截。
    const trustedCheck = body.indexOf("props.session?.trusted === false")
    const invokeCall = body.indexOf("invokeNative('module_session_fetch'")
    expect(trustedCheck).toBeGreaterThan(0)
    expect(invokeCall).toBeGreaterThan(0)
    expect(trustedCheck).toBeLessThan(invokeCall)
    expect(body).toContain('MODULE_NOT_TRUSTED')
    // 不得再出现「未知即拦截」的旧写法
    expect(body).not.toContain('if (!moduleInstanceTrusted.value)')
  })

  it('前端自报的 trusted 不被信任：Rust 侧用缓存清单重新验签', () => {
    const rust = read('src-tauri/src/transport/tauri/module_fetch.rs')
    expect(rust).toContain('read_verified_cached_manifest')
    expect(rust).toContain('instance.trusted = true')
    expect(rust).toContain('instance.trusted = false')
    // 登记请求必须带上 moduleId/channel/version，否则无法回读清单
    const host = read(HOST_VIEW)
    expect(host).toContain('moduleId: moduleId.value')
    expect(host).toContain("channel: safeText(moduleChannel.value) || 'main'")
    expect(host).toContain('version: safeText(moduleVersion.value)')
    const bundle = read('src-tauri/src/modules/module_bundle.rs')
    expect(bundle).toContain('pub fn read_verified_cached_manifest')
    expect(bundle).toContain('verify_manifest_signature(&manifest)')
  })

  it('实例生命周期与组件绑定：mount 登记、unmount 注销、切账号清空', () => {
    const source = read(HOST_VIEW)
    expect(source).toContain("invokeNative('module_instance_register'")
    expect(source).toContain("invokeNative('module_instance_unregister'")
    expect(source).toContain("invokeNative('module_instances_clear'")
    // mount 里登记（onMounted 块内）
    const mounted = source.indexOf('onMounted(() => {')
    const mountedBlock = source.slice(mounted, mounted + 600)
    expect(mountedBlock).toContain('registerModuleInstance()')
    // unmount 里注销
    const unmounted = source.indexOf('onBeforeUnmount(() => {')
    const unmountedBlock = source.slice(unmounted, unmounted + 400)
    expect(unmountedBlock).toContain('unregisterModuleInstance()')
  })

  it('宿主把 T05 的 trusted / permissions 透传给受控请求登记', () => {
    const moreView = read(MORE_VIEW)
    expect(moreView).toContain('trusted: prepared?.trusted === true')
    expect(moreView).toContain('permissions:')
    const hostView = read(HOST_VIEW)
    expect(hostView).toContain('props.session?.trusted === true')
  })

  it('协议层只接受字符串参数值，且能力名允许下划线命名', () => {
    const protocol = read(PROTOCOL)
    expect(protocol).toContain('typeof value !== \'string\'')
    expect(protocol).toContain('a-z0-9._')
    // 不允许模块自带 URL / 头字段
    for (const forbidden of ['headers', 'url', 'cookie']) {
      expect(protocol.toLowerCase()).not.toContain(`request_id, ${forbidden}`)
    }
  })
})
