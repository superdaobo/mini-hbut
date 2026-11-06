#!/usr/bin/env node
/**
 * goal-8 游戏中心回归 —— 可自动化部分（用 CDP 驱动正在运行的 mini-hbut 桌面应用）
 *
 * 用法：
 *   node tools/goal8-games-check.mjs [--seconds 40] [--out report.json]
 *
 * 依赖（无 npm 依赖，全部为仓库内已有工具 + Node 24 内置能力）：
 *   - tools/goal8-cdp.mjs：极简 CDP 客户端（list / eval / click / deep-watch）
 *   - 应用正在运行：4399 桥、4398 模块内容、9222 CDP
 *
 * 行为边界：只做「读状态 / 导航 / 点游戏 Tab / 点游戏卡片 / 抓控制台」。
 * 不触碰任何会修改应用数据的接口（登录、提交分数、兑换 ticket 等一概不调）。
 *
 * 诚实性原则：任何一步失败都如实写入报告（false / error / null），绝不猜测成功。
 *
 * verdict 规则（写入报告 notes，便于复判）：
 *   - blocked：CDP 不可达、导航失败、或（切 Tab 兜底后）仍找不到任何游戏入口
 *   - ok     ：找到入口 && 点击成功 && 出现游戏 iframe && 控制台出现 hello 或 welcome 握手字样
 *   - partial：以上链路中任一环节缺失（但未 blocked）
 */

import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------- 常量与命令行参数 ----------
const CDP_PORT = Number(process.env.GOAL8_CDP_PORT || 9222)
const CDP_TOOL = join(dirname(fileURLToPath(import.meta.url)), 'goal8-cdp.mjs')

let watchSeconds = 40 // 打开游戏后观察控制台/iframe 的秒数
let outPath = 'goal8-games-report.json'
{
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--seconds' && argv[i + 1] !== undefined) {
      const n = Number(argv[i + 1])
      if (Number.isFinite(n)) watchSeconds = Math.min(300, Math.max(5, Math.round(n)))
      i += 1
    } else if (argv[i] === '--out' && argv[i + 1] !== undefined) {
      outPath = argv[i + 1]
      i += 1
    }
  }
}

const sleep = (ms) => new Promise((resolveTimer) => setTimeout(resolveTimer, ms))

// ---------- CDP 子命令封装（execFile 直调 goal8-cdp.mjs，不经 shell） ----------
const cdp = (args, timeoutMs) =>
  new Promise((resolveResult) => {
    execFile(
      process.execPath,
      [CDP_TOOL, ...args],
      { timeout: timeoutMs ?? 60000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolveResult({
          code: error ? 1 : 0,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          errorText: error ? String(error.message || error) : ''
        })
      }
    )
  })

/** 在应用主窗口求值一个 JS 表达式；返回 { ok, value } 或 { ok:false, error } */
const cdpEval = async (expr) => {
  const r = await cdp(['eval', '--expr', expr])
  if (!r.stdout) {
    return { ok: false, error: `cdp eval 无输出（code=${r.code}）：${(r.stderr || r.errorText).slice(0, 200)}` }
  }
  try {
    const parsed = JSON.parse(r.stdout.trim())
    // goal8-cdp 的 eval 输出恒为 { ok, value } 或 { ok:false, error, name }
    if (parsed && typeof parsed === 'object' && 'ok' in parsed) return parsed
    return { ok: true, value: parsed }
  } catch {
    return { ok: false, error: `无法解析 eval 输出：${r.stdout.slice(0, 160)}` }
  }
}

/** 解析 goal8-cdp deep-watch 的文本输出（行格式固定：[console.x] / [exception] / [log.x]） */
const parseDeepWatch = (stdout) => {
  const entries = []
  let captured = null
  for (const line of String(stdout).split('\n')) {
    let m
    if ((m = line.match(/捕获\s*(\d+)\s*条日志/))) captured = Number(m[1])
    else if ((m = line.match(/^\s*\[console\.(\w+)\]\s*(.*)$/))) entries.push({ level: `console.${m[1]}`, text: m[2].trim() })
    else if ((m = line.match(/^\s*\[exception\]\s*(.*)$/))) entries.push({ level: 'exception', text: m[1].trim() })
    else if ((m = line.match(/^\s*\[log\.(\w+)\]\s*(.*)$/))) entries.push({ level: `log.${m[1]}`, text: m[2].trim() })
  }
  return { captured, entries }
}

/**
 * 最小父窗口 console 监听（仅主 frame，不进 iframe；与 deep-watch 并行跑）。
 * 为什么需要：goal8-cdp 的 deep-watch 只附加「子目标」，宿主（主窗口）侧若有握手/降级
 * 日志会漏掉；此处只复用同一 CDP 协议的 4 个方法，不做别的。
 */
const watchParentConsole = async (seconds) => {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
    const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    if (!page) return { ok: false, entries: [], error: '没有可用的 page target' }
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true })
      ws.addEventListener('error', rej, { once: true })
    })
    const entries = []
    let nextId = 1
    const send = (method, params = {}) =>
      new Promise((resSend) => {
        const id = nextId++
        const timer = setTimeout(() => resSend(null), 5000)
        ws.addEventListener('message', function handler(ev) {
          let message
          try {
            message = JSON.parse(ev.data)
          } catch {
            return
          }
          if (message.id === id) {
            clearTimeout(timer)
            ws.removeEventListener('message', handler)
            resSend(message.result ?? null)
          }
        })
        ws.send(JSON.stringify({ id, method, params }))
      })
    ws.addEventListener('message', (ev) => {
      let message
      try {
        message = JSON.parse(ev.data)
      } catch {
        return
      }
      if (message.id) return
      if (message.method === 'Runtime.consoleAPICalled') {
        const text = (message.params.args || [])
          .map((a) => a.value ?? a.description ?? a.type)
          .join(' ')
        entries.push({ level: `console.${message.params.type}`, text: String(text).slice(0, 300) })
      } else if (message.method === 'Runtime.exceptionThrown') {
        const d = message.params.exceptionDetails || {}
        entries.push({ level: 'exception', text: `${d.text || ''} :: ${d.exception?.description || ''}`.slice(0, 300) })
      } else if (message.method === 'Log.entryAdded') {
        const e = message.params.entry || {}
        entries.push({ level: `log.${e.level}`, text: String(e.text || '').slice(0, 300) })
      }
    })
    await send('Runtime.enable')
    await send('Log.enable')
    await new Promise((r) => setTimeout(r, seconds * 1000))
    ws.close()
    return { ok: true, entries }
  } catch (error) {
    return { ok: false, entries: [], error: String(error?.message || error) }
  }
}

// ---------- 探测表达式（在应用窗口内求值） ----------
// 说明：卡片是 button.gc-games__card[data-game-id]（GameCenterGamesTab.vue）；
// 但「游戏」Tab 默认不挂载（activeTab 初始为 home，v-if 切换），所以探测要覆盖：
// 属性选择器 + .gc-games__card + 中文游戏名文本（11 个游戏名来自 utils/module_center.js）。
const PROBE_JS = `(() => {
  const q = (s) => Array.from(document.querySelectorAll(s))
  const counts = {
    '[data-game-id]': q('[data-game-id]').length,
    '[data-module-id]': q('[data-module-id]').length,
    'a[href*="game"]': q('a[href*="game"]').length,
    '.gc-games__card': q('.gc-games__card').length,
    'text:game-name': 0
  }
  const nameRe = /合成|跳出|2048|笨鸟|富翁|矿工|记忆牌|五子棋|叠塔|挪车|消消乐/
  const leafSet = new Set()
  for (const sel of ['button', 'a', 'span', 'strong', 'em', 'h1', 'h2', 'h3', 'h4', 'p', 'li', 'div']) {
    for (const el of q(sel)) if (el.children.length === 0) leafSet.add(el)
  }
  const nameLeaves = [...leafSet].filter((el) => {
    const t = (el.textContent || '').trim()
    return t.length > 0 && t.length <= 24 && nameRe.test(t)
  })
  counts['text:game-name'] = nameLeaves.length
  const seen = new Set()
  const candidates = []
  const pool = [...q('[data-game-id]'), ...q('[data-module-id]'), ...q('a[href*="game"]'), ...q('.gc-games__card')]
  for (const el of pool) {
    if (seen.has(el)) continue
    seen.add(el)
    const gameId = el.getAttribute('data-game-id')
    const moduleId = el.getAttribute('data-module-id')
    candidates.push({
      tag: el.tagName.toLowerCase(),
      gameId: gameId || null,
      moduleId: moduleId || null,
      text: (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
      disabled: el.disabled === true
    })
    if (candidates.length >= 20) break
  }
  const tabs = q('[data-tab]').map((el) => ({
    tab: el.getAttribute('data-tab'),
    active: el.getAttribute('aria-selected') === 'true' || el.classList.contains('game-center-tabs__item--active')
  }))
  return {
    url: location.href,
    title: document.title,
    // 页面正文快照：当选择器全为 0 时（如新版模块面板“清单未发布”错误态），
    // 让报告自证当前视图到底渲染了什么，而不是只留下一个空 counts
    bodyText: (document.body && document.body.innerText ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 300),
    counts,
    candidates,
    tabs,
    iframes: q('iframe').map((f) => f.src || '')
  }
})()`

/** 按优先级从探测结果里选出「游戏入口」选择器与数量（先探测再统计，不假设结构） */
const pickCards = (probeValue) => {
  const c = (probeValue && probeValue.counts) || {}
  const order = ['[data-game-id]', '[data-module-id]', 'a[href*="game"]', 'text:game-name']
  for (const key of order) {
    const n = Number(c[key])
    if (Number.isFinite(n) && n > 0) return { selector: key, count: n }
  }
  return null
}

// ---------- 主流程 ----------
const report = {
  startedAt: new Date().toISOString(),
  cdpReachable: false,
  navigated: false,
  navMethod: null,
  before: null,
  cardsFound: null,
  probe: null, // 记录实际探测用的表达式与全部中间结果（供复判）
  openedGame: null,
  gameFrames: [],
  consoleHighlights: [],
  handshake: { helloSeen: false, welcomeSeen: false, protocolVersionSeen: null },
  verdict: 'blocked',
  notes: []
}

let cdpReachable = false
let probe = null
let cardsFound = null
let openedGame = { selector: null, ok: false, detail: '未执行点击' }

try {
  // ===== 步骤 0：CDP 可达性 =====
  const list = await cdp(['list'])
  cdpReachable = list.code === 0 && list.stdout.length > 0
  report.cdpReachable = cdpReachable
  if (!cdpReachable) {
    report.notes.push(`CDP 不可达（127.0.0.1:${CDP_PORT}）：${(list.stderr || list.errorText).slice(0, 160)}`)
  }

  if (cdpReachable) {
    // ===== 步骤 1：读当前页面状态 + 导航到游戏中心 =====
    const before = await cdpEval(`({ href: location.href, hash: location.hash, title: document.title, hookType: typeof window.__hbuDebugNavigate })`)
    if (before.ok) {
      report.before = before.value
      report.probe = { beforeState: before.value }
    } else {
      report.notes.push(`读取初始状态失败：${before.error}`)
    }

    // 优先走 DEV 调试钩子（真实导航，见 useAppRuntime.ts 的 #1169）
    if (before.ok && before.value.hookType === 'function') {
      const nav = await cdpEval(`window.__hbuDebugNavigate({ view: 'game_center' })`)
      if (nav.ok) {
        report.navigated = true
        report.navMethod = 'debug-hook'
        report.notes.push(`调试钩子导航返回：${JSON.stringify(nav.value ?? null).slice(0, 120)}`)
        await sleep(3000)
      } else {
        report.notes.push(`调试钩子调用失败：${nav.error}`)
      }
    }
    // 钩子不存在（非 DEV 构建）：回退 hash + reload，按任务约定等 8 秒
    if (!report.navigated) {
      const nav = await cdpEval(`(() => { const u = localStorage.getItem('hbu_username') || ''; location.hash = '#/' + u + '/game_center'; location.reload(); return 'reloaded' })()`)
      if (nav.ok) {
        report.navigated = true
        report.navMethod = 'hash-reload'
        report.notes.push(`hash 回退导航已发出：${nav.value}，等待 8 秒让页面重载`)
        await sleep(8000)
      } else {
        report.notes.push(`hash 导航失败：${nav.error}`)
      }
    }

    // ===== 步骤 2：等 5 秒后探测游戏卡片/入口 =====
    await sleep(5000)
    const p1 = await cdpEval(PROBE_JS)
    if (!p1.ok) {
      report.notes.push(`首次 DOM 探测失败：${p1.error}`)
    } else {
      probe = p1.value
      cardsFound = pickCards(probe)
      report.probe = { expression: PROBE_JS, first: probe }
    }

    // 兜底：卡片在「游戏」Tab 内（v-if 未挂载）→ 点 Tab 再探测一次
    if (!cardsFound && probe && Array.isArray(probe.tabs)) {
      const gamesTab = probe.tabs.find((t) => t.tab === 'games')
      if (gamesTab && !gamesTab.active) {
        const tabClick = await cdp(['click', '--selector', '[data-tab="games"]'])
        const tabOk = tabClick.code === 0 && tabClick.stdout.includes('clicked')
        report.notes.push(
          tabOk
            ? '首次探测未发现卡片；已点击「游戏」Tab（data-tab="games"）并重新探测'
            : `尝试切「游戏」Tab 失败：${(tabClick.stderr || tabClick.errorText).slice(0, 120)}`
        )
        if (tabOk) {
          await sleep(3000)
          const p2 = await cdpEval(PROBE_JS)
          if (p2.ok) {
            probe = p2.value
            cardsFound = pickCards(probe)
            report.probe.afterTabSwitch = probe
          } else {
            report.notes.push(`切 Tab 后重新探测失败：${p2.error}`)
          }
        }
      }
    }

    report.cardsFound = cardsFound ? { ...cardsFound } : { selector: null, count: 0 }
    // 入口为 0 且正文出现「面板/清单未发布」类错误态时，把根因写进报告（新版构建里
    // 游戏中心是远程模块面板 more_panel，清单没发布时面板无法打开，卡片自然为 0）
    if (!cardsFound && probe && typeof probe.bodyText === 'string' && /清单未发布|面板打开失败|模块加载失败/.test(probe.bodyText)) {
      report.notes.push(`视图处于错误态（无卡片）：页面正文 = 「${probe.bodyText.slice(0, 120)}」—— 疑似模块清单未发布/加载失败，属外部依赖，非 DOM 选择器问题`)
    }
    if (cardsFound) {
      const c = probe.counts
      report.notes.push(
        `入口统计：${Object.entries(c).map(([k, v]) => `${k}=${v}`).join('，')}（选择器按 ${cardsFound.selector} 取 ${cardsFound.count}）`
      )
    } else {
      report.notes.push('未找到任何游戏入口（含切 Tab 兜底后）')
    }

    // ===== 步骤 3：点击第一个可点击的游戏入口 =====
    const pickSelector = (cands) => {
      const enabled =
        cands.find((c) => !c.disabled && c.gameId) ||
        cands.find((c) => !c.disabled && c.moduleId) ||
        cands.find((c) => !c.disabled)
      if (!enabled) return null
      if (enabled.gameId) return `[data-game-id="${enabled.gameId}"]`
      if (enabled.moduleId) return `[data-module-id="${enabled.moduleId}"]`
      return 'a[href*="game"]'
    }

    let cands = probe && Array.isArray(probe.candidates) ? probe.candidates : []
    let clickSelector = pickSelector(cands)
    // 首卡处于 busy/disabled 时给 3 秒再探一次
    if (!clickSelector && cands.length > 0 && cands.every((c) => c.disabled)) {
      await sleep(3000)
      const p3 = await cdpEval(PROBE_JS)
      if (p3.ok) {
        cands = p3.value.candidates || []
        clickSelector = pickSelector(cands)
      }
    }

    if (clickSelector) {
      const click = await cdp(['click', '--selector', clickSelector])
      const ok = click.code === 0 && click.stdout.includes('clicked')
      openedGame = {
        selector: clickSelector,
        ok,
        detail: ok ? click.stdout.trim() : `点击失败：${(click.stderr || click.errorText).slice(0, 200)}`
      }
      if (!ok) report.notes.push(openedGame.detail)
    } else {
      openedGame = { selector: null, ok: false, detail: '没有找到可点击的游戏入口' }
      report.notes.push(openedGame.detail)
    }
    report.openedGame = openedGame

    // ===== 步骤 4：打开游戏后观察 --seconds 秒（deep-watch 抓 iframe 控制台 + 父窗口 console） =====
    if (openedGame.ok) {
      await sleep(2000) // 等模块宿主视图开始挂载游戏 iframe
      const watchTimeoutMs = watchSeconds * 1000 + 30000
      const [deep, parentWatch] = await Promise.all([
        cdp(['deep-watch', '--seconds', String(watchSeconds)], watchTimeoutMs),
        watchParentConsole(watchSeconds)
      ])
      const parsedDeep = parseDeepWatch(deep.stdout)
      report.watch = {
        seconds: watchSeconds,
        deepChild: { code: deep.code, capturedCount: parsedDeep.captured, entryCount: parsedDeep.entries.length },
        parentWatcher: { ok: parentWatch.ok, entryCount: parentWatch.entries.length, error: parentWatch.error || null }
      }
      if (deep.code !== 0) report.notes.push(`deep-watch 子进程异常退出：${(deep.stderr || deep.errorText).slice(0, 160)}`)
      // 注意：goal8-cdp deep-watch 会在附加后点一次宿主刷新按钮（.more-module-host-view .icon-btn，
      // 存在时触发 iframe 重载以便抓全新控制台），属只读刷新，不算数据修改。
      report.notes.push('deep-watch 内置行为：若宿主刷新按钮存在会点一次（只读刷新，用于抓全新 iframe 控制台）')

      // ===== 步骤 5（前半）：最终 iframe / 页面状态探测 =====
      const finalProbe = await cdpEval(`(() => ({
        url: location.href,
        iframes: Array.from(document.querySelectorAll('iframe')).map((f) => f.src || ''),
        hasModuleHost: !!document.querySelector('.more-module-host-view')
      })())`)
      let finalIframes = []
      if (finalProbe.ok) {
        finalIframes = finalProbe.value.iframes || []
        report.afterOpen = finalProbe.value
        if (!finalProbe.value.hasModuleHost) report.notes.push('打开后未见 .more-module-host-view（可能仍在加载或点击未生效）')
      } else {
        report.notes.push(`打开后状态探测失败：${finalProbe.error}`)
      }
      const frameUrls = [...new Set([...(probe?.iframes || []), ...finalIframes])]
      report.gameFrames = frameUrls.map((url) => {
        let origin = null
        try {
          if (url) origin = new URL(url).origin
        } catch {
          origin = null
        }
        return { url: url || null, origin }
      })

      // ===== 控制台汇总 + 握手判定 =====
      const allEntries = [...parsedDeep.entries, ...parentWatch.entries]
      report.consoleEntriesTotal = allEntries.length
      const highlight = (e) =>
        /error|warn|exception/i.test(e.level) || /game|mini-hbut|ticket|protocol|hello|welcome|sdk/i.test(e.text)
      report.consoleHighlights = allEntries.filter(highlight).slice(0, 40).map((e) => ({ level: e.level, text: e.text.slice(0, 220) }))
      const allText = allEntries.map((e) => `${e.level} ${e.text}`).join('\n')
      report.handshake = {
        helloSeen: /mini-hbut:game-sdk:hello/.test(allText),
        welcomeSeen: /mini-hbut:game-sdk:welcome/.test(allText),
        protocolVersionSeen: (allText.match(/protocol_?version["']?\s*[:=]\s*["']?(\d+)/i) || [])[1] || null
      }
      report.notes.push(
        '握手字样只在控制台里找；已核实源码：SDK（_sdk/src）无任何 console.* 输出，hello/welcome 走 postMessage，因此控制台未见不代表握手失败'
      )
    } else {
      report.notes.push('未成功打开游戏，跳过 deep-watch 观察阶段')
    }
  }
} catch (fatal) {
  report.notes.push(`脚本主流程异常：${String(fatal?.stack || fatal).slice(0, 300)}`)
}

// ---------- verdict ----------
if (!report.cdpReachable || !report.navigated || !report.cardsFound || report.cardsFound.count === 0) {
  report.verdict = 'blocked'
} else if (
  report.openedGame &&
  report.openedGame.ok &&
  report.gameFrames.length > 0 &&
  (report.handshake.helloSeen || report.handshake.welcomeSeen)
) {
  report.verdict = 'ok'
} else {
  report.verdict = 'partial'
}
report.notes.push('verdict 规则：blocked=CDP 不可达/导航失败/无入口；ok=入口+点击+游戏iframe+握手字样齐全；partial=其余')
report.finishedAt = new Date().toISOString()

// ---------- 写报告 ----------
try {
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
} catch (writeError) {
  console.error(`报告写入失败：${writeError.message}`)
}

// ---------- stdout 人类可读摘要（≤20 行） ----------
const cs = report.cardsFound || { selector: null, count: 0 }
const og = report.openedGame || { selector: null, ok: false }
const lines = []
lines.push('== 游戏中心回归（CDP 自动化）==')
lines.push(`CDP: ${report.cdpReachable ? '可达' : '不可达'}；导航: ${report.navigated ? `成功（${report.navMethod}）` : '失败'}`)
lines.push(`游戏入口: ${cs.selector ? `${cs.selector} × ${cs.count}` : '未找到'}`)
lines.push(`打开游戏: ${og.ok ? `成功（${og.selector}）` : `失败（${og.selector || '无选择器'}）`}`)
lines.push(`游戏 iframe: ${report.gameFrames.length} 个${report.gameFrames.length ? '（' + report.gameFrames.slice(0, 3).map((f) => f.origin || f.url || '?').join(' / ') + '）' : ''}`)
const h = report.handshake
lines.push(`握手: hello=${h.helloSeen ? '见' : '未见'} welcome=${h.welcomeSeen ? '见' : '未见'} protocol_version=${h.protocolVersionSeen ?? '未见'}`)
lines.push(`控制台: 共 ${report.consoleEntriesTotal ?? 0} 条（高亮 ${report.consoleHighlights.length} 条）`)
lines.push(`verdict: ${report.verdict}`)
lines.push(`报告: ${resolve(outPath)}`)
for (const n of report.notes.slice(0, 6)) lines.push(`· ${n}`)
console.log(lines.slice(0, 20).join('\n'))
process.exit(report.cdpReachable ? 0 : 1)
