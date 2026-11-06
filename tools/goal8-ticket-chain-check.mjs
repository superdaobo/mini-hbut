#!/usr/bin/env node
/**
 * 游戏票据链路真机验证（goal-8 第四轮）。
 *
 * 验证目标（我们这一侧的完整链路）：
 *   宿主闸门（契约 C）→ fetchGameLaunchTicket（要 AT）→ 平台 API `POST {api_base}/tickets`
 *   → 宿主回 `mini-hbut:game-sdk:ticket` → 游戏侧 SDK 收票并校验形状
 *
 * 两个**外部依赖**在本脚本里被替换（其余全是真的）：
 *   1. Identity AT：本机设备未在 Identity Core 注册（换票 404），故用 DEV 打桩缝
 *      `globalThis.__HBUT_IDENTITY_AT_STUB__`（仅 DEV 生效，见 utils/identity_access_token.ts）；
 *   2. 平台 API：`api_base` 指向 `tools/goal8-mock-game-platform.mjs`（本地模拟签发 `gpt_…`）。
 *
 * 配置注入走应用**自带的**本地快照缝 `localStorage['hbu_remote_config_snapshot']`
 * （`game_platform.allowed_game_origins` 生产为空 = 票据被配置关掉，这是本次的关键发现）；
 * 脚本开始时备份原快照，结束时**自动还原**。
 *
 * 用法：
 *   node tools/goal8-ticket-chain-check.mjs [--token <bridge token>] [--game hbut_2048]
 *                                          [--cdn http://127.0.0.1:8899]
 *                                          [--platform http://127.0.0.1:8900/api/game-platform/v1]
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CDP_CLI = path.join(HERE, 'goal8-cdp.mjs')
const BRIDGE = 'http://127.0.0.1:4399'
const SNAPSHOT_KEY = 'hbu_remote_config_snapshot'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i]
  if (!token.startsWith('--')) continue
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith('--')) args.set(token.slice(2), true)
  else {
    args.set(token.slice(2), next)
    i += 1
  }
}
const TOKEN = String(args.get('token') || process.env.HBUT_BRIDGE_TOKEN || 'local-test-token-123')
const GAME = String(args.get('game') || 'hbut_2048')
const CDN = String(args.get('cdn') || 'http://127.0.0.1:8899').replace(/\/+$/, '')
const PLATFORM = String(
  args.get('platform') || 'http://127.0.0.1:8900/api/game-platform/v1'
).replace(/\/+$/, '')
const OUT = String(args.get('out') || 'goal8-ticket-chain.json')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const bridge = async (pathName, body) => {
  const response = await fetch(`${BRIDGE}${pathName}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  return response.json()
}

const cdp = (mode, expr, extra = []) => {
  const output = execFileSync(process.execPath, [CDP_CLI, mode, '--expr', expr, ...extra], {
    encoding: 'utf8',
    cwd: HERE,
    maxBuffer: 8 * 1024 * 1024
  })
  const start = output.indexOf('{')
  if (start < 0) return null
  try {
    const parsed = JSON.parse(output.slice(start))
    return parsed && parsed.ok !== undefined ? parsed.value : parsed
  } catch {
    return null
  }
}

/** 主窗口求值（走 /debug/frontend-eval，返回值现在是真的）。 */
const evalInPage = async (js) => {
  const result = await bridge('/debug/frontend-eval', { js })
  return result?.data?.result?.value ?? null
}

const report = { game: GAME, steps: [], platform: PLATFORM, ok: false }

const step = (name, ok, detail) => {
  report.steps.push({ name, ok, detail: detail ?? '' })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

const main = async () => {
  try {
  // 1) 注入 DEV 运行时配置覆盖（`__HBUT_REMOTE_CONFIG_OVERRIDE__`，仅 DEV 生效）。
  //    为什么不用远程配置快照：冷启动快照会被后台刷新覆盖，实测注入不生效
  //    （闸门 reasons=[origin_whitelist_empty, verified_flag_disabled]）。
  const injected = await evalInPage(`(() => {
    globalThis.__HBUT_REMOTE_CONFIG_OVERRIDE__ = {
      game_platform: {
        enabled: true,
        // ⚠️ 必须同时清掉 canary：flags.ts 里 effectiveEnabled = enabled && canaryDecision.included，
        // 生产配置里 canary 未纳入本机 → origins 被清空、V2 开关全部坍缩（实测闸门 reasons 正是
        // origin_whitelist_empty + verified_flag_disabled）。null = 不做灰度（字段缺省语义）。
        canary: null,
        api_base: ${JSON.stringify(PLATFORM)},
        allowed_game_origins: ['http://127.0.0.1:4398'],
        flags: {
          game_center_enabled: true,
          game_verified_session_enabled: true,
          game_economy_enabled: true
        }
      }
    };
    const o = globalThis.__HBUT_REMOTE_CONFIG_OVERRIDE__.game_platform;
    return { api_base: o.api_base, origins: o.allowed_game_origins, verified: o.flags.game_verified_session_enabled };
  })()`)
  step(
    '注入 DEV 运行时配置覆盖（allowed_game_origins + api_base + verified 开关）',
    injected?.verified === true && Array.isArray(injected?.origins) && injected.origins.length > 0,
    `api_base=${injected?.api_base} origins=${JSON.stringify(injected?.origins)}`
  )

  // 2) 设置 DEV AT 打桩（仅 DEV 生效；宿主取票时要它换 AT）
  const stubSet = await evalInPage(
    `(() => { globalThis.__HBUT_IDENTITY_AT_STUB__ = 'stub-at-for-local-ticket-check'; return typeof globalThis.__HBUT_IDENTITY_AT_STUB__; })()`
  )
  step('设置 DEV Identity AT 打桩', stubSet === 'string', `type=${stubSet}`)

    // 2.5) ⚠️ 必须先**切走宿主视图**：`MoreModuleHostView` 的 `hostFlags` 在 onMounted 读一次配置，
    //      若该视图已挂载（应用会跨次恢复同一游戏的会话），导航过来**复用实例** → 覆盖不生效
    //      （实测闸门一直报 config_origins=[]）。切到 home 让它卸载，再打开游戏即可重读。
    await bridge('/debug/navigate', { view: 'home' })
    await sleep(4000)

    // 3) 准备并打开游戏（真实 prepare：下载/校验/解包/4398 安装）
    const manifest = await (await fetch(`${CDN}/main/${GAME}/manifest.json`)).json()
    const prepared = await bridge('/module_bundle/prepare', {
      channel: manifest.channel || 'main',
      module_id: manifest.module_id || GAME,
      version: manifest.version,
      package_url: manifest.package_url,
      package_urls: [manifest.package_url],
      package_sha256: manifest.package_sha256,
      entry_path: manifest.entry_path || 'index.html',
      module_name: manifest.module_name || GAME,
      manifest
    })
    step('prepare 游戏包', prepared?.success === true, `source=${prepared?.data?.source || '-'}`)

    await evalInPage('window.__HBUT_GAME_BRIDGE_DIAG__ = []')
    const nav = await bridge('/debug/navigate', {
      view: 'more_module_host',
      payload: {
        module_id: GAME,
        module_name: manifest.module_name || GAME,
        version: manifest.version,
        channel: manifest.channel || 'main',
        entry_path: manifest.entry_path || 'index.html',
        preview_url: prepared?.data?.preview_url,
        local_preview_url: prepared?.data?.preview_url,
        trusted: prepared?.data?.trusted === true,
        permissions: [],
        source: prepared?.data?.source,
        preview_mode: 'tauri-local',
        local_ready: true,
        launch_surface: 'game_center',
        cache_dir: prepared?.data?.cache_dir,
        bundle_path: prepared?.data?.bundle_path
      }
    })
    step('打开游戏（game 面）', nav?.success === true)
    await sleep(6000)
    // 强制 remount：应用会复用同一游戏的既有 iframe，SDK 不会重发 hello
    try {
      execFileSync(process.execPath, [CDP_CLI, 'click', '--selector', '.more-module-host-view .icon-btn'], {
        encoding: 'utf8',
        cwd: HERE
      })
    } catch {
      /* 刷新按钮不可用时继续 */
    }
    await sleep(12000)

    // 4) 从游戏 iframe 主动请求票据，并等宿主回包
    const ticketResult = cdp(
      'deep',
      `new Promise((resolve) => {
        const rid = 'ticket-' + Date.now();
        const timer = setTimeout(() => { window.removeEventListener('message', onMsg); resolve({ replied: false, note: '12s 内未收到 ticket 回包' }); }, 12000);
        const onMsg = (event) => {
          const payload = event.data;
          if (!payload || payload.type !== 'mini-hbut:game-sdk:ticket') return;
          if (payload.request_id !== rid) return;
          clearTimeout(timer);
          window.removeEventListener('message', onMsg);
          const ticket = String(payload.ticket || '');
          resolve({
            replied: true,
            ticketPresent: ticket.length > 0,
            ticketShapeOk: /^gpt_[A-Za-z0-9_-]{16,}$/.test(ticket),
            ticketLen: ticket.length,
            gameIdMatched: payload.game_id === ${JSON.stringify(GAME)},
            protocolVersion: payload.protocol_version
          });
        };
        window.addEventListener('message', onMsg);
        window.parent.postMessage({ type: 'mini-hbut:game-sdk:request-ticket', request_id: rid, game_id: ${JSON.stringify(GAME)}, reason: 'goal8-verify' }, '*');
      })`
    )
    report.ticketReply = ticketResult
    step(
      '宿主回 mini-hbut:game-sdk:ticket（形状合法）',
      ticketResult?.replied === true && ticketResult?.ticketPresent === true && ticketResult?.ticketShapeOk === true,
      `len=${ticketResult?.ticketLen} gameIdMatched=${ticketResult?.gameIdMatched} pv=${ticketResult?.protocolVersion}`
    )

    // 5) 宿主侧诊断（闸门是否通过、是否真的去平台取票）
    const diag = await evalInPage(
      `(window.__HBUT_GAME_BRIDGE_DIAG__ || []).filter((entry) => entry.module_id === ${JSON.stringify(GAME)})`
    )
    report.diagnostics = Array.isArray(diag) ? diag.map((entry) => entry.event) : []
    report.trustPolicy = Array.isArray(diag)
      ? diag.filter((entry) => entry.event === 'trust_policy').slice(-1)[0] || null
      : null
    if (report.trustPolicy) {
      const tp = report.trustPolicy
      console.log(
        `   ↳ 闸门：eligible=${tp.verified_eligible} reasons=${JSON.stringify(tp.reasons)} origin=${tp.origin} allowlist=${JSON.stringify(tp.allowlist)} config_origins=${JSON.stringify(tp.config_origins)} session=${tp.session_verified}`
      )
    }
    const ticketRequested = report.diagnostics.includes('ticket_requested')
    const ticketReplied = report.diagnostics.includes('ticket_replied')
    step('宿主诊断：ticket_requested + ticket_replied', ticketRequested && ticketReplied, report.diagnostics.join(','))

    report.ok =
      ticketResult?.replied === true && ticketResult?.ticketShapeOk === true && ticketRequested && ticketReplied
  } finally {
    // 6) 清除运行时覆盖与 AT 打桩（不触碰远程配置快照）
    const restored = await evalInPage(
      `(() => { delete globalThis.__HBUT_REMOTE_CONFIG_OVERRIDE__; delete globalThis.__HBUT_IDENTITY_AT_STUB__; return 'cleared'; })()`
    )
    step('清除 DEV 配置覆盖 + AT 打桩', restored === 'cleared', String(restored))
  }

  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`\n${report.ok ? '✅ 票据链路（桩 AT + 桩平台）全链通过' : '❌ 票据链路未全通'} → 报告 ${OUT}`)
}

await main()
