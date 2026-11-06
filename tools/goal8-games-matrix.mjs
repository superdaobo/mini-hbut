#!/usr/bin/env node
/**
 * 11 个游戏的真机批量回归（#1169 / goal-8 收尾）。
 *
 * 做法（确定性，避免面板 UI 的时序与「自动恢复上一次游戏」干扰）：
 *   对每个游戏 id：
 *     1. 从本地静态 CDN 取签名前清单 `{cdn}/main/<id>/manifest.json`；
 *     2. `POST /module_bundle/prepare` → 走真实的「下载 → 校验 → 解包 → 4388/4398 本地安装」；
 *     3. `POST /debug/navigate {view:'more_module_host', payload:{... launch_surface:'game_center'}}`
 *        → 宿主以**游戏面**打开该模块（这一步才会创建 game bridge）；
 *     4. 等 iframe 就绪后读宿主握手诊断 `window.__HBUT_GAME_BRIDGE_DIAG__`（DEV 专用打点）。
 *
 * 另外：真实用户路径（游戏中心 → `more_panel` 面板 → 点卡片）已单独验证过一次
 * （见 goal-8/evidence/realmachine-verification.md 的「面板点卡片」记录），面板注入的
 * `game_list` 与 11 张卡片、点击后的 iframe 与握手掌路均成立。
 *
 * 用法：
 *   node tools/goal8-games-matrix.mjs [--token <bridge token>] [--out report.json] [--only id,id]
 *                                      [--cdn http://127.0.0.1:8899]
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CDP_CLI = path.join(HERE, 'goal8-cdp.mjs')
const BRIDGE = 'http://127.0.0.1:4399'

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
const OUT = String(args.get('out') || 'goal8-games-matrix.json')
const CDN = String(args.get('cdn') || 'http://127.0.0.1:8899').replace(/\/+$/, '')
const ONLY = String(args.get('only') || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 不走宿主握手的游戏（按契约分类，不算失败）。
 *
 * `hbut_gomoku` 的 `main.js` **不 import SDK 的 `MiniHBUTGame`**（只用底层
 * `readLaunchTicket` / platform client），因此它本来就不发 `hello`；它的票据来自宿主注入到
 * iframe URL 的 `gpt` 参数（`withLaunchTicket`，SDK 的 `LAUNCH_TICKET_QUERY_KEYS`）。
 * 协议允许这种形态（SDK 未握手即降级 compatibility/standalone，不影响游玩）。
 */
const NO_HOST_HANDSHAKE_GAMES = Object.freeze({
  hbut_gomoku: '该游戏不使用宿主握手，改用宿主注入 URL 的 gpt 票据（readLaunchTicket）'
})

const bridge = async (pathName, body) => {
  const response = await fetch(`${BRIDGE}${pathName}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  return response.json()
}

/** CDP eval（主窗口上下文）。 */
const evalInPage = (expr) => {
  const output = execFileSync(process.execPath, [CDP_CLI, 'eval', '--expr', expr], {
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

const readDiag = async (gameId) => {
  const result = await bridge('/debug/frontend-eval', {
    js: `(window.__HBUT_GAME_BRIDGE_DIAG__ || []).filter((entry) => entry.module_id === ${JSON.stringify(gameId)})`
  })
  const value = result?.data?.result?.value
  return Array.isArray(value) ? value : []
}

const main = async () => {
  const catalog = await (await fetch(`${CDN}/main/catalog.json`)).json()
  const gameIds = (catalog.modules || [])
    .map((item) => item.id)
    .filter((id) => id !== 'more_panel')
    .filter((id) => !ONLY.length || ONLY.includes(id))

  console.log(`== 11 个游戏真机回归（共 ${gameIds.length} 个，CDN=${CDN}）==`)
  const rows = []
  for (const id of gameIds) {
    const row = {
      id,
      prepared: false,
      prepareSource: '',
      trusted: null,
      opened: false,
      iframe: '',
      events: [],
      verdict: 'fail',
      note: ''
    }
    try {
      const manifest = await (await fetch(`${CDN}/main/${id}/manifest.json`)).json()
      const prepared = await bridge('/module_bundle/prepare', {
        channel: manifest.channel || 'main',
        module_id: manifest.module_id || id,
        version: manifest.version,
        package_url: manifest.package_url,
        package_urls: [manifest.package_url],
        package_sha256: manifest.package_sha256,
        entry_path: manifest.entry_path || 'index.html',
        module_name: manifest.module_name || id,
        manifest
      })
      row.prepared = prepared?.success === true
      row.prepareSource = prepared?.data?.source || ''
      row.trusted = prepared?.data?.trusted ?? null
      if (!row.prepared) {
        row.note = `prepare 失败：${String(prepared?.error?.message || prepared?.error || '').slice(0, 80)}`
        rows.push(row)
        console.log(`❌ ${id.padEnd(20)} prepare 失败 ${row.note}`)
        continue
      }
      await bridge('/debug/frontend-eval', { js: 'window.__HBUT_GAME_BRIDGE_DIAG__ = []' })
      const nav = await bridge('/debug/navigate', {
        view: 'more_module_host',
        payload: {
          module_id: id,
          module_name: manifest.module_name || id,
          version: manifest.version,
          channel: manifest.channel || 'main',
          entry_path: manifest.entry_path || 'index.html',
          preview_url: prepared.data.preview_url,
          local_preview_url: prepared.data.preview_url,
          trusted: prepared.data.trusted === true,
          permissions: Array.isArray(manifest.permissions) ? manifest.permissions : [],
          source: prepared.data.source,
          preview_mode: 'tauri-local',
          local_ready: true,
          launch_surface: 'game_center',
          bundle_path: prepared.data.bundle_path,
          cache_dir: prepared.data.cache_dir
        }
      })
      row.opened = nav?.success === true
      await sleep(6000)
      // ⚠️ 关键：应用会**复用**同一模块的既有 iframe（同一游戏再次打开时不重新加载文档），
      // 而 SDK 的 hello 只在文档加载时发一次 → 必须点宿主标题栏的「↻」强制 remount，
      // 否则这里会读到 0 条握手事件（曾误判为「游戏没握手」）。
      try {
        execFileSync(process.execPath, [CDP_CLI, 'click', '--selector', '.more-module-host-view .icon-btn'], {
          encoding: 'utf8',
          cwd: HERE
        })
      } catch {
        // 刷新按钮不可用则继续（例如模块未 ready）
      }
      await sleep(14000)
      const frames = evalInPage("Array.from(document.querySelectorAll('iframe')).map((f) => f.src)")
      row.iframe = Array.isArray(frames) ? frames.find((src) => src.includes(id)) || '' : ''
      row.events = (await readDiag(id)).map((entry) => entry.event)
      const accepted = row.events.includes('hello_accepted')
      const welcomed = row.events.includes('welcome_sent')
      if (NO_HOST_HANDSHAKE_GAMES[id]) {
        // 有 iframe 即视为「按契约加载成功」；把它单列，避免污染握手统计
        row.verdict = row.iframe ? 'n/a' : 'fail'
        row.note = NO_HOST_HANDSHAKE_GAMES[id]
      } else {
        row.verdict = row.iframe && accepted && welcomed ? 'ok' : row.iframe && accepted ? 'partial' : 'fail'
      }
    } catch (error) {
      row.note = String(error && error.message ? error.message : error).slice(0, 120)
    }
    rows.push(row)
    const mark =
      row.verdict === 'ok' ? '✅' : row.verdict === 'n/a' ? '➖' : row.verdict === 'partial' ? '⚠️' : '❌'
    console.log(
      `${mark} ${id.padEnd(20)} prepare=${row.prepareSource || '-'} iframe=${row.iframe ? 'yes' : 'no'} events=${row.events.join(',') || '-'} ${row.note}`
    )
  }

  const summary = {
    total: rows.length,
    ok: rows.filter((row) => row.verdict === 'ok').length,
    partial: rows.filter((row) => row.verdict === 'partial').length,
    fail: rows.filter((row) => row.verdict === 'fail').length,
    notApplicable: rows.filter((row) => row.verdict === 'n/a').length,
    generatedAt: new Date().toISOString()
  }
  writeFileSync(OUT, `${JSON.stringify({ summary, rows }, null, 2)}\n`, 'utf8')
  console.log(`\n小结：ok=${summary.ok} partial=${summary.partial} fail=${summary.fail} → 报告 ${OUT}`)
}

await main()
