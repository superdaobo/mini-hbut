import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const nowIso = () => new Date().toISOString()

export const isAppMounted = (snapshot) => Boolean(
  snapshot?.readyState === 'complete' &&
  snapshot?.rootExists &&
  snapshot?.rootChildren > 0 &&
  snapshot?.vueAppPresent &&
  snapshot?.visibleElements > 2
)

export const isStrictCspEvalFailure = (value) =>
  /unsafe-eval|refused to evaluate a string|evalerror|new function/i.test(String(value || ''))

export const isCspViolation = (value) =>
  /content security policy directive|violates the following content security policy|refused to (?:load|connect|execute|apply|frame)/i.test(String(value || ''))

const parseArgs = (argv) => {
  const values = { port: 0, timeoutMs: 45000, output: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--port') values.port = Number(argv[++index])
    else if (arg === '--timeout-ms') values.timeoutMs = Number(argv[++index])
    else if (arg === '--output') values.output = String(argv[++index] || '')
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!Number.isInteger(values.port) || values.port < 1 || values.port > 65535) {
    throw new Error('--port must be a valid TCP port')
  }
  if (!Number.isFinite(values.timeoutMs) || values.timeoutMs < 1000) {
    throw new Error('--timeout-ms must be at least 1000')
  }
  return values
}

const fetchJson = async (url, timeoutMs = 2000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  } finally {
    clearTimeout(timer)
  }
}

const waitForTarget = async (port, deadline) => {
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`)
      const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (target) return target
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(`WebView2 DevTools target did not appear on loopback port ${port}: ${lastError?.message || 'timeout'}`)
}

const createCdpClient = async (url) => {
  if (typeof globalThis.WebSocket !== 'function') {
    throw new Error('Node.js WebSocket support is unavailable; Node 22 or newer is required')
  }
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DevTools WebSocket connection timed out')), 5000)
    socket.onopen = () => { clearTimeout(timer); resolve() }
    socket.onerror = () => { clearTimeout(timer); reject(new Error('DevTools WebSocket connection failed')) }
  })

  let nextId = 1
  const pending = new Map()
  const diagnostics = []
  const rejectPending = (reason) => {
    for (const waiter of pending.values()) waiter.reject(reason)
    pending.clear()
  }
  socket.onclose = () => rejectPending(new Error('DevTools WebSocket closed'))
  socket.onerror = () => rejectPending(new Error('DevTools WebSocket failed'))
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const waiter = pending.get(message.id)
      if (!waiter) return
      pending.delete(message.id)
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)))
      else waiter.resolve(message.result)
      return
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params?.exceptionDetails || {}
      diagnostics.push({
        kind: 'exception',
        text: String(details.exception?.description || details.text || '').slice(0, 800),
        url: String(details.url || '').slice(0, 300),
        line: details.lineNumber ?? null,
        column: details.columnNumber ?? null,
      })
    } else if (message.method === 'Log.entryAdded') {
      const entry = message.params?.entry || {}
      if (entry.level === 'error' || entry.level === 'warning') {
        diagnostics.push({
          kind: `log-${entry.level}`,
          text: String(entry.text || '').slice(0, 800),
          url: String(entry.url || '').slice(0, 300),
          line: entry.lineNumber ?? null,
        })
      }
    } else if (message.method === 'Runtime.consoleAPICalled') {
      const type = message.params?.type
      if (type === 'error' || type === 'warning') {
        diagnostics.push({
          kind: `console-${type}`,
          text: (message.params?.args || []).map((arg) => String(arg.value ?? arg.description ?? '')).join(' ').slice(0, 800),
        })
      }
    }
  }

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`DevTools command timed out: ${method}`))
    }, 5000)
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value) },
      reject: (error) => { clearTimeout(timer); reject(error) },
    })
    socket.send(JSON.stringify({ id, method, params }))
  })
  return { socket, send, diagnostics }
}

const takeSnapshot = async (send) => {
  const expression = `(() => {
    const root = document.querySelector('#app')
    const visibleElements = [...document.querySelectorAll('body *')].filter((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 1 && rect.height > 1
    }).length
    return {
      readyState: document.readyState,
      title: document.title,
      targetUrl: location.origin + location.pathname,
      rootExists: Boolean(root),
      rootChildren: root?.children?.length || 0,
      vueAppPresent: Boolean(root?.__vue_app__),
      visibleElements,
      bodyHtmlLength: document.body?.innerHTML?.length || 0
    }
  })()`
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'DOM snapshot evaluation failed')
  return result.result?.value || null
}

const writeEvidence = (output, evidence) => {
  if (!output) return
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
}

export async function assertWebviewAppMounted({ port, timeoutMs, output = '' }) {
  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  let client = null
  let snapshot = null
  try {
    const target = await waitForTarget(port, deadline)
    client = await createCdpClient(target.webSocketDebuggerUrl)
    await client.send('Runtime.enable')
    await client.send('Log.enable')
    await client.send('Page.enable')

    while (Date.now() < deadline) {
      snapshot = await takeSnapshot(client.send)
      const strictCspFailures = client.diagnostics.filter((item) => isStrictCspEvalFailure(item.text))
      const cspViolations = client.diagnostics.filter((item) => isCspViolation(item.text))
      if (cspViolations.length > 0) {
        const evidence = {
          schema_version: 1,
          status: 'failed',
          observed_at_utc: nowIso(),
          elapsed_ms: Date.now() - startedAt,
          snapshot,
          diagnostics: client.diagnostics.slice(-20),
          strict_csp_eval_failures: strictCspFailures.length,
          csp_violations: cspViolations.length,
        }
        writeEvidence(output, evidence)
        const reason = strictCspFailures.length > 0
          ? 'strict CSP blocked runtime JavaScript evaluation'
          : 'WebView emitted a Content Security Policy violation'
        throw new Error(`${reason}; snapshot=${JSON.stringify(snapshot)}`)
      }
      if (isAppMounted(snapshot)) {
        const evidence = {
          schema_version: 1,
          status: 'mounted',
          observed_at_utc: nowIso(),
          elapsed_ms: Date.now() - startedAt,
          snapshot,
          diagnostics: client.diagnostics.slice(-20),
          strict_csp_eval_failures: client.diagnostics.filter((item) => isStrictCspEvalFailure(item.text)).length,
          csp_violations: client.diagnostics.filter((item) => isCspViolation(item.text)).length,
        }
        writeEvidence(output, evidence)
        console.log(`[webview-smoke] mounted rootChildren=${snapshot.rootChildren} visibleElements=${snapshot.visibleElements} elapsedMs=${evidence.elapsed_ms}`)
        return evidence
      }
      await sleep(250)
    }

    const strictCspFailures = client.diagnostics.filter((item) => isStrictCspEvalFailure(item.text))
    const evidence = {
      schema_version: 1,
      status: 'failed',
      observed_at_utc: nowIso(),
      elapsed_ms: Date.now() - startedAt,
      snapshot,
      diagnostics: client.diagnostics.slice(-20),
      strict_csp_eval_failures: strictCspFailures.length,
      csp_violations: client.diagnostics.filter((item) => isCspViolation(item.text)).length,
    }
    writeEvidence(output, evidence)
    const cause = strictCspFailures.length > 0
      ? 'strict CSP blocked runtime JavaScript evaluation'
      : 'Vue root did not mount visible application content'
    throw new Error(`${cause}; snapshot=${JSON.stringify(snapshot)}`)
  } finally {
    client?.socket?.close()
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2))
  assertWebviewAppMounted(options).catch((error) => {
    console.error(`[webview-smoke] ${error.message}`)
    process.exitCode = 1
  })
}
