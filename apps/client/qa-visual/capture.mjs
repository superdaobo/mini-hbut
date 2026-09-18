/**
 * Epic #833 视觉回归截图（零依赖 CDP）。
 *
 * 流程：本地静态服务 qa-visual-dist → headless Chrome → 逐场景切 viewport 截图，
 * 同时收集控制台错误与异常，输出到 docs/parallel-execution/schedule-timeline/visual-smoke/。
 *
 * 用法：node qa-visual/capture.mjs
 */
import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_DIR = path.resolve(__dirname, '..')
const DIST = path.join(CLIENT_DIR, 'qa-visual-dist')
const OUT = path.resolve(CLIENT_DIR, '../../docs/parallel-execution/schedule-timeline/visual-smoke')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9411
const CDP_PORT = 9412

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, mobile: true, deviceScaleFactor: 2 },
  { name: 'desktop', width: 1280, height: 800, mobile: false, deviceScaleFactor: 1 }
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const getJSON = (url) =>
  new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(e)
          }
        })
      })
      .on('error', reject)
  })

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.listeners = []
  }
  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => {
      ws.onopen = res
      ws.onerror = rej
    })
    const cdp = new CDP(ws)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && cdp.pending.has(msg.id)) {
        const { resolve, reject } = cdp.pending.get(msg.id)
        cdp.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      } else if (msg.method) {
        cdp.listeners.forEach((fn) => fn(msg))
      }
    }
    return cdp
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error('timeout ' + method))
        }
      }, 30000)
    })
  }
  on(fn) {
    this.listeners.push(fn)
  }
}

const startStaticServer = () =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
      const file = path.join(DIST, rel)
      if (!file.startsWith(DIST) || !fs.existsSync(file)) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
    })
    server.listen(PORT, '127.0.0.1', () => resolve(server))
  })

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const server = await startStaticServer()

  const profile = path.join(CLIENT_DIR, 'qa-visual-dist', '.chrome-profile')
  fs.rmSync(profile, { recursive: true, force: true })
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  )

  let version = null
  for (let i = 0; i < 80; i++) {
    try {
      version = await getJSON(`http://127.0.0.1:${CDP_PORT}/json/version`)
      break
    } catch {
      await sleep(250)
    }
  }
  if (!version) {
    chrome.kill()
    server.close()
    throw new Error('devtools not reachable')
  }

  const browser = await CDP.connect(version.webSocketDebuggerUrl)
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })

  const logs = []
  browser.on((m) => {
    if (m.sessionId !== sessionId) return
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      logs.push(`[${m.params.type}] ` + (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' '))
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      logs.push('[EXCEPTION] ' + d.text + ' ' + ((d.exception || {}).description || ''))
    }
    if (m.method === 'Log.entryAdded' && ['error'].includes(m.params.entry.level)) {
      logs.push('[log:error] ' + m.params.entry.text)
    }
  })

  await browser.send('Runtime.enable', {}, sessionId)
  await browser.send('Log.enable', {}, sessionId)
  await browser.send('Page.enable', {}, sessionId)

  const evaluate = async (expression) => {
    const r = await browser.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      sessionId
    )
    if (r.exceptionDetails) {
      return { __err: r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception || {}).description || '') }
    }
    return r.result.value
  }

  const shots = []
  const problems = []

  for (const vp of VIEWPORTS) {
    await browser.send(
      'Emulation.setDeviceMetricsOverride',
      { width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor, mobile: vp.mobile },
      sessionId
    )

    const mark = logs.length
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` }, sessionId)
    await sleep(2000)

    const scenarios = await evaluate('JSON.stringify(window.__scenarios || [])')
    const list = JSON.parse(scenarios)

    for (const name of list) {
      const ok = await evaluate(`window.__setScenario(${JSON.stringify(name)})`)
      if (ok !== true) {
        problems.push(`setScenario(${name}) 返回 ${JSON.stringify(ok)}`)
        continue
      }
      await sleep(500)

      // 结构性检查：事件卡 / 聚合 chip / edge indicator 计数 + 横向溢出
      const probe = await evaluate(`JSON.stringify({
        scenario: window.__currentScenario(),
        badge: (document.querySelector('[data-qa-scenario]')||{}).textContent || '',
        eventCards: document.querySelectorAll('.event-card').length,
        overflowChips: document.querySelectorAll('.event-overflow-chip').length,
        edgeIndicators: document.querySelectorAll('.event-edge-indicator').length,
        courseCards: document.querySelectorAll('.course-card').length,
        dashedRows: document.querySelectorAll('.line-row').length,
        gridOverflowX: (() => { const g = document.querySelector('.courses-grid'); return g ? g.scrollWidth - g.clientWidth : -1 })(),
        bodyOverflowX: document.body.scrollWidth - document.body.clientWidth
      })`)
      const info = JSON.parse(probe)
      info.viewport = vp.name
      shots.push(info)

      const png = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId)
      fs.writeFileSync(path.join(OUT, `${name}-${vp.name}.png`), Buffer.from(png.data, 'base64'))
    }

    const slice = logs.slice(mark)
    if (slice.length) problems.push(`[${vp.name}] 控制台问题 ${slice.length} 条：` + slice.slice(0, 5).join(' | '))
  }

  const report = { generatedAt: new Date().toISOString(), outDir: OUT, shots, problems }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))

  console.log(JSON.stringify(report, null, 2))

  await browser.send('Target.closeTarget', { targetId })
  browser.ws.close()
  chrome.kill()
  server.close()
  process.exit(0)
}

main().catch((e) => {
  console.error('CAPTURE FAILED:', e)
  process.exit(1)
})
