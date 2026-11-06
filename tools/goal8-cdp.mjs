#!/usr/bin/env node
/**
 * 极简 CDP 客户端（goal-8 真机验证用）。
 *
 * 为什么需要它：`/debug/frontend-eval` 的返回值依赖「把结果写进 document.title 再回读原生窗口标题」，
 * 在 Windows/WebView2 上原生标题不同步，回读恒为 null。CDP 能拿到真正的返回值，也能进 iframe 上下文。
 *
 * 用法：
 *   node tools/goal8-cdp.mjs list
 *   node tools/goal8-cdp.mjs frames
 *   node tools/goal8-cdp.mjs eval --expr "location.href"
 *   node tools/goal8-cdp.mjs eval --expr "..." --frame <frameId>
 *   node tools/goal8-cdp.mjs shot --out D:/tmp/x.png
 */
const PORT = Number(process.env.GOAL8_CDP_PORT || 9222)

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
const command = process.argv[2]

const httpJson = async (url) => {
  const response = await fetch(url)
  return response.json()
}

const connect = async (wsUrl) => {
  const socket = new WebSocket(wsUrl)
  const pending = new Map()
  let nextId = 1
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  socket.addEventListener('message', (event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
    }
  })
  const subEvents = []
  const notifications = []
  socket.addEventListener('message', (event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    if (message.id) return
    if (message.method === 'Target.attachedToTarget') subEvents.push(message.params)
    if (message.method) notifications.push(message)
  })
  // eslint-disable-next-line no-unused-vars
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      const payload = { id, method, params }
      if (sessionId) payload.sessionId = sessionId
      socket.send(JSON.stringify(payload))
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error(`${method} 超时`))
        }
      }, 30_000)
    })
  return { send, close: () => socket.close(), subEvents, notifications }
}

/** 取主页面 target（优先 localhost:5173 或 tauri 页面）。 */
const pickPage = async () => {
  const targets = await httpJson(`http://127.0.0.1:${PORT}/json/list`)
  const pages = targets.filter((item) => item.type === 'page' && item.webSocketDebuggerUrl)
  if (!pages.length) throw new Error('没有可用的 page target')
  return pages[0]
}

const main = async () => {
  if (command === 'list') {
    const targets = await httpJson(`http://127.0.0.1:${PORT}/json/list`)
    for (const item of targets) {
      if (!item.type) continue
      console.log(`${item.type} | ${String(item.title || '').slice(0, 60)} | ${String(item.url || '').slice(0, 90)}`)
    }
    return
  }

  const page = await pickPage()
  const client = await connect(page.webSocketDebuggerUrl)

  if (command === 'frames') {
    await client.send('Page.enable')
    const tree = await client.send('Page.getFrameTree')
    const walk = (node, depth = 0) => {
      const frame = node.frame
      console.log(`${'  '.repeat(depth)}${frame.id} | ${String(frame.url).slice(0, 100)}`)
      for (const child of node.childFrames || []) walk(child, depth + 1)
    }
    walk(tree.frameTree)
    client.close()
    return
  }

  if (command === 'eval') {
    const expr = String(args.get('expr') || 'null')
    const params = {
      expression: `(async () => { try { return { ok: true, value: await (${expr}) }; } catch (e) { return { ok: false, error: String(e && e.message || e), name: String(e && e.name || 'Error') }; } })()`,
      awaitPromise: true,
      returnByValue: true
    }
    const frameId = args.get('frame')
    if (frameId) {
      // 在指定 frame 的默认执行上下文里求值
      await client.send('Page.enable')
      const tree = await client.send('Page.createIsolatedWorld', {
        frameId: String(frameId),
        worldName: 'goal8',
        grantUniveralAccess: true
      })
      const result = await client.send('Runtime.evaluate', {
        ...params,
        contextId: tree.executionContextId
      })
      console.log(JSON.stringify(result.result?.value ?? result, null, 2))
      client.close()
      return
    }
    const result = await client.send('Runtime.evaluate', params)
    const value = result.result?.value
    console.log(JSON.stringify(value ?? result, null, 2))
    client.close()
    return
  }

  if (command === 'click') {
    const selector = String(args.get('selector') || '')
    if (!selector) {
      console.error('用法: click --selector "<css>" [--index 0]')
      process.exit(1)
    }
    const index = Number(args.get('index') || 0)
    const rect = await client.send('Runtime.evaluate', {
      expression: `(() => { const list = Array.from(document.querySelectorAll(${JSON.stringify(selector)})); const el = list[${index}]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, text: (el.innerText||'').trim().slice(0, 30) }; })()`,
      returnByValue: true
    })
    const box = rect.result?.value
    if (!box || !box.w) {
      console.error(`未找到可点击元素: ${selector}[${index}]`)
      process.exit(1)
    }
    const point = { x: Math.round(box.x), y: Math.round(box.y), button: 'left', clickCount: 1 }
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point })
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point })
    console.log(`clicked ${selector}[${index}] "${box.text}" at (${point.x},${point.y})`)
    client.close()
    return
  }

  if (command === 'deep') {
    const expr = String(args.get('expr') || '({ title: document.title, origin: location.origin })')
    await client.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
    await new Promise((resolve) => setTimeout(resolve, Number(args.get('wait') || 3000)))
    console.log(`附加子目标数: ${client.subEvents.length}`)
    for (const item of client.subEvents) {
      const url = item.targetInfo?.url || ''
      try {
        const result = await client.send(
          'Runtime.evaluate',
          {
            expression: `(async () => { try { return { ok: true, value: await (${expr}) }; } catch (e) { return { ok: false, error: String(e && e.message || e) }; } })()`,
            awaitPromise: true,
            returnByValue: true
          },
          item.sessionId
        )
        console.log(`--- ${url}`)
        console.log(JSON.stringify(result.result?.value ?? result, null, 2))
      } catch (error) {
        console.log(`--- ${url} (求值失败: ${error.message})`)
      }
    }
    client.close()
    return
  }

  if (command === 'deep-watch') {
    const seconds = Number(args.get('seconds') || 20)
    await client.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const targets = client.subEvents.slice()
    for (const item of targets) {
      try {
        await client.send('Runtime.enable', {}, item.sessionId)
        await client.send('Log.enable', {}, item.sessionId)
      } catch (error) {
        console.log(`启用日志失败 ${item.targetInfo?.url}: ${error.message}`)
      }
    }
    // 触发模块 iframe 重载（父窗口点击宿主刷新按钮）
    await client.send('Runtime.evaluate', {
      expression: `(() => { const b = document.querySelector('.more-module-host-view .icon-btn'); if (b) { b.click(); return 'reloaded'; } return 'no-button'; })()`,
      returnByValue: true
    })
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
    const interesting = client.notifications.filter((item) =>
      ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded'].includes(item.method)
    )
    console.log(`捕获 ${interesting.length} 条日志/异常：`)
    for (const item of interesting) {
      if (item.method === 'Runtime.consoleAPICalled') {
        const args = (item.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')
        console.log(`  [console.${item.params.type}] ${String(args).slice(0, 220)}`)
      } else if (item.method === 'Runtime.exceptionThrown') {
        const d = item.params.exceptionDetails || {}
        console.log(`  [exception] ${String(d.text || '').slice(0, 120)} :: ${String(d.exception?.description || '').slice(0, 300)}`)
      } else {
        const e = item.params.entry || {}
        console.log(`  [log.${e.level}] ${String(e.text || '').slice(0, 220)}`)
      }
    }
    client.close()
    return
  }

  if (command === 'shot') {
    const out = String(args.get('out') || 'goal8-shot.png')
    await client.send('Page.enable')
    const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const fs = await import('node:fs')
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
    console.log(`saved ${out}`)
    client.close()
    return
  }

  console.error('未知命令：' + String(command))
  process.exit(1)
}

await main()
