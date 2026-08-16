import assert from 'node:assert/strict'

const bridgeBase = String(process.env.BRIDGE_BASE || 'http://127.0.0.1:4399').replace(/\/+$/, '')
const bridgeToken = String(process.env.HBUT_BRIDGE_TOKEN || '').trim()

const request = async (path, init = {}) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    return await fetch(`${bridgeBase}${path}`, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const assertNotBlockedByBridgePolicy = (response, label) => {
  assert.notEqual(response.status, 401, `${label} must not be rejected as unauthorized`)
  assert.notEqual(response.status, 403, `${label} must not be rejected by Origin policy`)
}

const main = async () => {
  const health = await request('/health', { method: 'GET' })
  assert.equal(health.status, 200, 'GET /health must stay public')

  const unauthenticated = await request('/sync_grades', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  assert.equal(unauthenticated.status, 401, 'protected route must reject missing context')

  const hostile = await request('/sync_grades', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://attacker.example',
      ...(bridgeToken ? { Authorization: `Bearer ${bridgeToken}` } : {})
    },
    body: '{}'
  })
  assert.equal(hostile.status, 403, 'hostile Origin must win over a supplied token')

  for (const [path, label] of [
    ['/exports/__bridge_contract_missing__.ics', 'export download'],
    ['/module_bundle/content/main/contract/0/index.html', 'module content'],
    ['/school-website/__bridge_contract_missing__', 'school website embed']
  ]) {
    const response = await request(path, { method: 'GET' })
    assertNotBlockedByBridgePolicy(response, label)
  }

  const preflight = await request('/ai_chat_stream', {
    method: 'OPTIONS',
    headers: {
      Origin: 'capacitor://localhost',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization'
    }
  })
  assert.ok(preflight.ok, `trusted preflight failed with HTTP ${preflight.status}`)
  assert.equal(
    preflight.headers.get('access-control-allow-origin'),
    'capacitor://localhost',
    'trusted Capacitor Origin must be echoed by CORS'
  )

  const hostilePreflight = await request('/ai_chat_stream', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://attacker.example',
      'Access-Control-Request-Method': 'POST'
    }
  })
  assert.equal(
    hostilePreflight.headers.get('access-control-allow-origin'),
    null,
    'untrusted Origin must not receive an allow-origin header'
  )

  if (bridgeToken) {
    const tokenPassThrough = await request('/module_bundle/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bridgeToken}`
      },
      body: '{}'
    })
    assertNotBlockedByBridgePolicy(tokenPassThrough, 'Bearer-authenticated request')
  }

  console.log('[bridge-http-contract] all assertions passed')
}

main().catch((error) => {
  console.error('[bridge-http-contract] failed:', error?.stack || error)
  process.exitCode = 1
})
