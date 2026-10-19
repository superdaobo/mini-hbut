/**
 * 图书馆预约 · 官方页内嵌三分支接线契约（issue #1081）。
 *
 * 背景：桌面用 Rust 子 WebView（`Window::add_child`），但 **iOS 上 `add_child` 不可用**
 * （cfg 为 `all(desktop, feature = "unstable")`），点「打开官方预约页」只会看到
 * 「当前平台不支持内嵌官方预约页」。修复路线是复用仓库既有的「学校官网」配方：
 * **Bridge 反向代理 + iframe**（`/reserve-embed/…`）。
 *
 * 仓库未引入 @vue/test-utils（vitest 主配置为 node 环境，无 DOM），故沿用既有
 * 「源码契约」测试风格（见 `reserve_panel_contract.spec.ts`）。
 */
import { describe, expect, it } from 'vitest'
import { readContractSource, readVueContractSource } from '../../utils/contract_source_test'

const embed = readVueContractSource('src/components/library-reserve/LibraryReserveEmbed.vue')
const embedUtil = readContractSource('src/utils/library_reserve_embed.ts')
const proxyModule = readContractSource('src-tauri/src/modules/library_reserve_proxy.rs')
const routeHandler = readContractSource('src-tauri/src/http_server/routes/library_reserve.rs')
const authSource = readContractSource('src-tauri/src/http_server/auth.rs')
const rustEmbed = readContractSource('src-tauri/src/modules/library_reserve_embed.rs')

/** 截取某个顶层 `const name = ...` 到下一个顶格 `}` 的代码块 */
const blockOf = (source: string, signature: string): string =>
  source.match(new RegExp(`${signature}[\\s\\S]*?\\n\\}`))?.[0] ?? ''

describe('#1081 模式判定：三分支（桌面 / 桥代理 / 降级外开）', () => {
  it('util 导出三条分支与探测能力', () => {
    for (const symbol of [
      'resolveLibraryReserveEmbedMode',
      'retryLibraryReserveEmbedMode',
      'probeLibraryReserveProxyReachable',
      'fetchLibraryReserveEmbedProxyInfo'
    ]) {
      expect(embedUtil, `缺少导出 ${symbol}`).toContain(`export const ${symbol}`)
    }
    for (const mode of ['native-webview', 'proxy-iframe', 'external-open']) {
      expect(embedUtil, `缺少模式 ${mode}`).toContain(`'${mode}'`)
    }
    // 前缀必须与 Rust 侧 RESERVE_EMBED_PREFIX 一致
    expect(embedUtil).toContain("'/reserve-embed/'")
    expect(proxyModule).toContain('pub const RESERVE_EMBED_PREFIX: &str = "/reserve-embed/"')
  })

  it('桌面 → native-webview（不得破坏 #1078 行为）', () => {
    const block = blockOf(embedUtil, 'export const resolveLibraryReserveEmbedMode')
    expect(block).toContain("if (isTauriDesktopRuntime()) return 'native-webview'")
    // Android / 纯浏览器没有桥也没有 add_child → 直接降级
    expect(block).toContain("if (isTauriRuntime() && isLikelyAndroidUserAgent()) return 'external-open'")
    expect(block).toContain('return \'external-open\'')
  })

  it('iOS → 探测桥：可达走 proxy-iframe，否则 external-open', () => {
    const block = blockOf(embedUtil, 'export const resolveLibraryReserveEmbedMode')
    expect(block).toContain('isLikelyIOSUserAgent()')
    expect(block).toContain('probeLibraryReserveProxyReachable()')
    expect(block).toContain("? 'proxy-iframe' : 'external-open'")
  })

  it('探测先 /health 再探代理路径（与 school_website_embed 同思路）', () => {
    const block = blockOf(embedUtil, 'export const probeLibraryReserveProxyReachable')
    expect(block).toContain('/health')
    expect(block).toContain('LIBRARY_RESERVE_EMBED_PREFIX')
    expect(block).toContain('AbortController')
    // 连接被拒（fetch 抛错）才算桥不可达
    expect(block).toContain('return false')
  })

  it('重试分支先让原生 ensure_http_bridge 拉起桥', () => {
    const block = blockOf(embedUtil, 'export const retryLibraryReserveEmbedMode')
    expect(block).toContain("invokeNative<EnsureBridgeResult>('ensure_http_bridge')")
    expect(block).toContain("if (result?.enabled === false) return 'external-open'")
  })
})

describe('#1081 组件三分支接线', () => {
  it('组件按模式分派：桌面浮层 / iframe / 外开降级', () => {
    expect(embed).toContain('resolveLibraryReserveEmbedMode')
    expect(embed).toContain('retryLibraryReserveEmbedMode')
    expect(embed).toContain('fetchLibraryReserveEmbedProxyInfo')
    expect(embed).toContain("if (resolved === 'native-webview')")
    expect(embed).toContain("if (resolved === 'proxy-iframe')")
    expect(embed).toContain('fallbackVisible.value = true')
  })

  it('桌面分支保留 open / resize / close 三条命令与 bounds 跟随', () => {
    for (const command of [
      'library_reserve_embed_open',
      'library_reserve_embed_resize',
      'library_reserve_embed_close'
    ]) {
      expect(embed, `缺少 ${command} 调用`).toContain(command)
    }
    expect(embed).toContain('scrollIntoView')
    expect(embed).toContain('ResizeObserver')
    expect(embed).toContain("addEventListener('scroll'")
    expect(embed).toContain('setInterval')
    expect(embed).toContain('onBeforeUnmount')
    expect(embed).toMatch(/watch\([\s\S]*close\(\)/)
    // 浮层容器只在桌面模式且已打开时挂载
    expect(embed).toContain('v-if="opened && useNativeEmbed" ref="host"')
  })

  it('iframe 分支：桥内地址 + no-referrer-when-downgrade + 加载/失败处理', () => {
    expect(embed).toContain('useIframe')
    expect(embed).toContain('v-if="opened && useIframe"')
    expect(embed).toContain(':src="iframeSrc"')
    expect(embed).toContain('referrerpolicy="no-referrer-when-downgrade"')
    expect(embed).toContain('@load="onIframeLoad"')
    expect(embed).toContain('@error="onIframeError"')
    // 标题走 i18n（白名单文件不得硬编码中文）
    expect(embed).toContain("t('library.reserve.embed.iframeTitle')")
  })

  it('降级分支：说明 + 「用系统浏览器打开」按钮（走 openExternal）', () => {
    expect(embed).toContain('openInBrowser')
    expect(embed).toContain('openExternal(')
    expect(embed).toContain("t('library.reserve.embed.externalHint')")
    expect(embed).toContain("t('library.reserve.embed.externalOpen')")
    // 降级时用的是 Rust 现取的官方入口（含短时效凭证），不是裸地址
    expect(embed).toContain('info.entryUrl')
  })

  it('关闭 / 切换应用会清掉 iframe 地址（否则会盖在新面板上）', () => {
    const block = blockOf(embed, 'const close = async')
    expect(block).toContain("iframeSrc.value = ''")
    expect(block).toContain('stopSync()')
  })
})

describe('#1081 Rust 侧接线：代理命令 + 路由 + 策略', () => {
  it('新增 library_reserve_embed_proxy_url 命令（全平台，非 cfg(desktop)）', () => {
    expect(rustEmbed).toContain('pub async fn library_reserve_embed_proxy_url')
    expect(rustEmbed).toContain('LibraryReserveEmbedProxyInfo')
    // 必须复用 library_reserve::resolve_entry 现取凭证，而不是让前端拼 URL
    const block = rustEmbed.match(
      /pub async fn library_reserve_embed_proxy_url[\s\S]*?\n\}/
    )?.[0]
    expect(block, '未定位到 proxy_url 命令体').toBeTruthy()
    expect(block).toContain('library_reserve::resolve_entry')
    expect(block).toContain('build_reserve_embed_bridge_url')
  })

  it('路由挂在 /reserve-embed（含 @static / @captcha 子域标签）', () => {
    expect(routeHandler).toContain('.route("/reserve-embed/*path", any(reserve_embed_proxy))')
    expect(routeHandler).toContain('.route("/reserve-embed/", any(reserve_embed_proxy_root))')
    // 会话必须来自 state.client（裸 client 会被 302 到登录页）
    expect(routeHandler).toContain('state.client.read().await')
    // 上游来源头钉死
    expect(routeHandler).toContain('https://reserve.chaoxing.com/')
  })

  it('响应头不得回传 set-cookie / content-encoding（reqwest 已解压）', () => {
    const block = routeHandler.match(/fn copy_response_header[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).toBeTruthy()
    expect(block).not.toContain('set-cookie')
    expect(block).not.toContain('content-encoding')
  })

  it('鉴权策略：GET/HEAD 放行，写方法要求可信桥上下文', () => {
    expect(authSource).toContain('PublicEmbedWrite')
    expect(authSource).toContain('path.starts_with("/reserve-embed")')
    const block = authSource.match(/pub\(crate\) fn decide_bridge_access[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).toContain('BridgeRoutePolicy::PublicEmbedWrite')
    // 恶意 Origin 一律 403（在写方法放行之前拦掉）
    expect(block.indexOf('has_explicit_untrusted_origin')).toBeLessThan(
      block.indexOf('PublicEmbedWrite')
    )
  })
})
