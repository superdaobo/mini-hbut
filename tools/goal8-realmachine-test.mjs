#!/usr/bin/env node
/**
 * goal-8 真机验证驱动（T04–T08）。
 *
 * 覆盖：
 *   A. 双端口与策略矩阵（4399 业务 / 4398 内容）
 *   B. 模块内容响应头（CSP / no-store）
 *   C. 通过 /debug/frontend-eval 驱动前端：挂本地 CDN、打开模块
 *   D. 采集隔离探针结果（模块内四条负向 + 受控请求正向）
 *   E. 汇总为一份可复查报告
 *
 * 用法：node tools/goal8-realmachine-test.mjs [--token <bridge-token>] [--skip-open]
 */
import fs from 'node:fs'
import path from 'node:path'

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

const BRIDGE = 'http://127.0.0.1:4399'
const CONTENT = 'http://127.0.0.1:4398'
const CDN = 'http://127.0.0.1:8899'
const TOKEN = String(args.get('token') || process.env.HBUT_BRIDGE_TOKEN || 'local-test-token-123')
const OUT = path.resolve(args.get('out') || 'goal8-realmachine-report.json')

const report = { startedAt: new Date().toISOString(), steps: [] }
const step = (name, ok, detail) => {
  report.steps.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 原始 HTTP 请求，返回 { status, headers, body, error }。 */
const raw = async (url, init = {}) => {
  try {
    const response = await fetch(url, init)
    const body = await response.text()
    return { status: response.status, headers: Object.fromEntries(response.headers), body, error: '' }
  } catch (error) {
    return { status: 0, headers: {}, body: '', error: `${error?.name}: ${error?.message}` }
  }
}

/** 带桥令牌的请求。 */
const withToken = (init = {}) => ({
  ...init,
  headers: { ...(init.headers || {}), Authorization: `Bearer ${TOKEN}` }
})

/** 前端 eval：把 JS 结果写进 document.title 再回读。 */
const frontendEval = async (js) => {
  const wrapped = `(() => { try { const __v = (${js}); document.title = 'DIAG:' + JSON.stringify(__v === undefined ? null : __v); } catch (e) { document.title = 'DIAG:' + JSON.stringify({ __error: String(e && e.message || e) }); } })()`
  const response = await raw(`${BRIDGE}/debug/frontend-eval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ js: wrapped })
  })
  if (response.status !== 200) return { error: `http ${response.status}: ${response.body.slice(0, 200)}` }
  let parsed
  try {
    parsed = JSON.parse(response.body)
  } catch {
    return { error: 'bad json' }
  }
  const diag = parsed?.data?.diag
  if (diag === null || diag === undefined) return { error: 'no diag (title 未回读)' }
  try {
    return { value: JSON.parse(diag) }
  } catch {
    return { error: `diag 非 JSON: ${String(diag).slice(0, 120)}` }
  }
}

const waitFor = async (label, url, timeoutMs = 180_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const probe = await raw(url)
    if (probe.status > 0) return true
    await sleep(3000)
  }
  step(`等待 ${label}`, false, `${url} 在 ${timeoutMs}ms 内不可达`)
  return false
}

// ── A. 端口与策略矩阵 ────────────────────────────────────────
const sectionPorts = async () => {
  const health = await raw(`${BRIDGE}/health`)
  step('4399 /health 可达', health.status === 200, `status=${health.status}`)

  const contentIndex = await raw(`${CONTENT}/module_bundle/content/main/__probe__/1`)
  step('4398 内容服务在监听（HTTP 层有响应）', contentIndex.status > 0, `status=${contentIndex.status}（未知模块 404 属正常）`)

  const contentOther = await raw(`${CONTENT}/health`)
  step('4398 不提供业务路由（/health 应 404）', contentOther.status === 404, `status=${contentOther.status}`)

  const matrix = [
    ['/health', {}, '公开健康检查 → 200'],
    ['/exports/__probe_missing__.ics', {}, '公开只读导出（无 token）→ 期望 200/404 但不是 401'],
    ['/sync_grades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, '受保护 POST（无 token）→ 401'],
    ['/sync_grades', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4398' }, body: '{}' }, '模块 origin 伪造 → 403'],
    ['/cache/get?table=x&key=y', {}, '本地缓存读取（带参数、无 token）→ 401'],
    ['/module_bundle/content/main/x/1/index.html', {}, 'Bridge 上内容路径 → 404（已迁走）']
  ]
  for (const [path_, init, expected] of matrix) {
    const response = await raw(`${BRIDGE}${path_}`, init)
    let ok = false
    if (path_ === '/health') ok = response.status === 200
    else if (path_.startsWith('/exports/')) ok = response.status !== 401 && response.status !== 403
    else if (expected.includes('403')) ok = response.status === 403
    else if (expected.includes('404')) ok = response.status === 404
    else if (path_.startsWith('/cache/get')) ok = response.status === 401
    else ok = response.status === 401
    step(`矩阵 ${path_} → ${expected}`, ok, `status=${response.status}`)
  }

  const withTok = await raw(`${BRIDGE}/sync_grades`, withToken({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  }))
  step('矩阵 /sync_grades 带 token → 非 401', withTok.status !== 401, `status=${withTok.status}`)
}

// ── B. 内容响应头 ───────────────────────────────────────────
const sectionHeaders = async (moduleId, version = '1.0.0') => {
  const file = await raw(`${CONTENT}/module_bundle/content/main/${moduleId}/${version}/index.html`)
  step('内容文件可读（200）', file.status === 200, `status=${file.status}`)
  const csp = file.headers['content-security-policy'] || ''
  step('内容响应带 CSP 且 script-src 限同源', csp.includes("script-src 'self'"), csp ? csp.slice(0, 80) : '无 CSP 头')
  step('内容响应 no-store', (file.headers['cache-control'] || '').includes('no-store'), file.headers['cache-control'] || '')
}

// ── C. 前端驱动 ─────────────────────────────────────────────
const sectionDrive = async () => {
  const probe = await frontendEval('1 + 1')
  if (probe.error) {
    step('/debug/frontend-eval 可用', false, probe.error)
    return false
  }
  step('/debug/frontend-eval 可用', true, `回读=${JSON.stringify(probe.value)}`)

  const override = await frontendEval(`localStorage.setItem('hbu_module_cdn_base_override', '${CDN}'); localStorage.getItem('hbu_module_cdn_base_override')`)
  step('写入本地 CDN 覆盖', override.value === CDN, `value=${override.value}`)

  // 让前端重置模块状态并刷新目录（走它自己的调试通道，语义比只改 localStorage 完整）
  const reset = await raw(`${BRIDGE}/debug/reset_more_modules`, withToken({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cdnBaseOverride: CDN })
  }))
  step('重置模块状态并指定本地 CDN', reset.status === 200, `status=${reset.status} ${reset.body.slice(0, 120)}`)
  await sleep(3000)

  // 安装探针结果收集器（模块 postMessage 给宿主，宿主在主窗口里）
  const listener = await frontendEval(`
    (() => {
      if (window.__goal8ProbeInstalled) return 'already';
      window.__goal8ProbeInstalled = true;
      window.__goal8Probe = null;
      window.addEventListener('message', (event) => {
        const data = event && event.data;
        if (data && data.type === 'hbu-isolation-probe-result') window.__goal8Probe = data;
      });
      return 'installed';
    })()
  `)
  step('安装探针结果收集器', listener.value === 'installed' || listener.value === 'already', String(listener.value))
  return true
}

const openModule = async (moduleId) => {
  const response = await raw(`${BRIDGE}/debug/open_module`, withToken({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleId })
  }))
  return response
}

const sectionProbe = async () => {
  const response = await openModule('isolation_probe')
  step('打开隔离探针模块', response.status === 200, `status=${response.status} ${response.body.slice(0, 160)}`)
  if (response.status !== 200) return

  for (let i = 0; i < 12; i += 1) {
    await sleep(4000)
    const collected = await frontendEval('window.__goal8Probe || null')
    if (collected.value && Array.isArray(collected.value.results)) {
      report.probe = collected.value
      const rows = collected.value.results
      step('探针回传结果', true, `${rows.length} 项`)
      for (const row of rows) {
        const verdict = row.error ? `拒/失败(${row.error})` : `status=${row.status}`
        console.log(`   · ${row.id}: ${verdict} ${row.detail ? `| ${String(row.detail).slice(0, 120)}` : ''}`)
      }
      return
    }
    console.log(`   …等待探针结果 (${i + 1}/12)`)
  }
  step('探针回传结果', false, '超时未见 hbu-isolation-probe-result')
}

const sectionState = async () => {
  const state = await frontendEval(`
    ({
      url: location.href,
      moduleStateKeys: Object.keys(localStorage).filter((k) => k.startsWith('hbu')).slice(0, 20)
    })
  `)
  step('读取前端状态', !state.error, JSON.stringify(state.value || state.error).slice(0, 200))
}

const main = async () => {
  console.log(`[goal8] bridge=${BRIDGE} content=${CONTENT} cdn=${CDN}`)
  if (!(await waitFor('bridge 4399', `${BRIDGE}/health`))) return finish()
  if (!(await waitFor('content 4398', `${CONTENT}/module_bundle/content/main/__probe__/1`, 60_000))) return finish()

  await sectionPorts()
  const canDrive = await sectionDrive()
  if (canDrive && !args.get('skip-open')) {
    await sectionProbe()
    await sectionHeaders('isolation_probe', '1.0.0')
    await sectionState()
  }
  finish()
}

const finish = () => {
  report.finishedAt = new Date().toISOString()
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8')
  const failed = report.steps.filter((item) => !item.ok)
  console.log(`\n[goal8] 报告写入 ${OUT}`)
  console.log(`[goal8] 通过 ${report.steps.length - failed.length}/${report.steps.length}；失败 ${failed.length}`)
  if (failed.length) for (const item of failed) console.log(`   ❌ ${item.name} — ${item.detail}`)
}

await main()
