import process from 'node:process'
import { performance } from 'node:perf_hooks'

const CONFIG_URLS = [
  'https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/remote_config.json',
  'https://gh-proxy.com/https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/remote_config.json'
]

const DEFAULT_RESOURCE_SHARE = {
  endpoint: 'https://mini-hbut-chaoxing-webdav.hf.space',
  username: 'mini-hbut',
  password: 'mini-hbut'
}

const CDN_ASSETS = {
  xgplayerScript: [
    'https://cdn.jsdelivr.net.cn/npm/xgplayer@3.0.22/dist/index.min.js',
    'https://unpkg.com/xgplayer@3.0.22/dist/index.min.js',
    'https://cdn.jsdelivr.net/npm/xgplayer@3.0.22/dist/index.min.js'
  ],
  xgplayerStyle: [
    'https://cdn.jsdelivr.net.cn/npm/xgplayer@3.0.22/dist/index.min.css',
    'https://unpkg.com/xgplayer@3.0.22/dist/index.min.css',
    'https://cdn.jsdelivr.net/npm/xgplayer@3.0.22/dist/index.min.css'
  ],
  pdfjsModule: [
    'https://cdn.jsdelivr.net.cn/npm/pdfjs-dist@4.10.38/legacy/build/pdf.mjs',
    'https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.mjs',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.mjs'
  ],
  pdfjsWorker: [
    'https://cdn.jsdelivr.net.cn/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs',
    'https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs'
  ]
}

const timeoutFetch = async (url, init = {}, timeoutMs = 12000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const basicAuth = (username, password) => {
  const raw = `${username}:${password}`
  return `Basic ${Buffer.from(raw).toString('base64')}`
}

const fmtMs = (ms) => `${Math.round(ms)}ms`

const testUrl = async (label, url, init, passStatus) => {
  const start = performance.now()
  try {
    const res = await timeoutFetch(url, init, 15000)
    const elapsed = performance.now() - start
    const ok = passStatus(res.status)
    return {
      label,
      url,
      ok,
      status: res.status,
      elapsed
    }
  } catch (error) {
    return {
      label,
      url,
      ok: false,
      status: 0,
      elapsed: performance.now() - start,
      error: error?.message || String(error)
    }
  }
}

const pickRemoteConfig = async () => {
  for (const url of CONFIG_URLS) {
    try {
      const res = await timeoutFetch(url, { method: 'GET', headers: { Accept: 'application/json' } }, 10000)
      if (!res.ok) continue
      const data = await res.json().catch(() => null)
      if (data && typeof data === 'object') return data
    } catch {
      // try next
    }
  }
  return null
}

const toDavUrl = (endpoint, path = '/') => {
  const safeEndpoint = String(endpoint || '').replace(/\/+$/, '')
  const normalizedPath = `/${String(path || '/').replace(/^\/+/, '')}`
  const encodedPath = normalizedPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `${safeEndpoint}/dav${encodedPath}`
}

const run = async () => {
  const config = (await pickRemoteConfig()) || {}
  const share = config?.resource_share || {}
  const endpoint = String(share.endpoint || DEFAULT_RESOURCE_SHARE.endpoint).trim() || DEFAULT_RESOURCE_SHARE.endpoint
  const username = String(share.username || DEFAULT_RESOURCE_SHARE.username).trim() || DEFAULT_RESOURCE_SHARE.username
  const password = String(share.password || DEFAULT_RESOURCE_SHARE.password).trim() || DEFAULT_RESOURCE_SHARE.password

  const checks = []

  const propfindBody = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>`
  checks.push(
    await testUrl(
      'WebDAV PROPFIND 根目录',
      toDavUrl(endpoint, '/'),
      {
        method: 'PROPFIND',
        headers: {
          Authorization: basicAuth(username, password),
          Depth: '1',
          'Content-Type': 'application/xml; charset=utf-8'
        },
        body: propfindBody
      },
      (status) => status === 207 || status === 200 || status === 401 || status === 403
    )
  )

  checks.push(
    await testUrl(
      'WebDAV GET 根目录',
      toDavUrl(endpoint, '/'),
      {
        method: 'GET',
        headers: {
          Authorization: basicAuth(username, password)
        }
      },
      (status) => status >= 200 && status < 500
    )
  )

  for (const [group, urls] of Object.entries(CDN_ASSETS)) {
    for (const url of urls) {
      checks.push(
        await testUrl(
          `CDN ${group}`,
          url,
          {
            method: 'GET',
            headers: {
              Range: 'bytes=0-2047'
            }
          },
          (status) => status === 200 || status === 206
        )
      )
    }
  }

  console.log('=== Resource Share 网络连通性测试 ===')
  console.log(`endpoint: ${endpoint}`)
  console.log(`username: ${username}`)
  console.log('')
  for (const row of checks) {
    const statusText = row.status ? `HTTP ${row.status}` : 'NO_RESPONSE'
    const suffix = row.error ? ` | ${row.error}` : ''
    const mark = row.ok ? 'PASS' : 'FAIL'
    console.log(`[${mark}] ${row.label} | ${statusText} | ${fmtMs(row.elapsed)} | ${row.url}${suffix}`)
  }

  const failed = checks.filter((item) => !item.ok)
  console.log('')
  const webDavFailed = checks.filter((item) => item.label.startsWith('WebDAV') && !item.ok)
  const cdnGroupFailed = Object.keys(CDN_ASSETS).filter(
    (group) => !checks.some((item) => item.label === `CDN ${group}` && item.ok)
  )

  if (webDavFailed.length || cdnGroupFailed.length) {
    console.log(`结果：关键检查未通过`)
    if (webDavFailed.length) {
      console.log(`- WebDAV 失败：${webDavFailed.length} 项`)
    }
    if (cdnGroupFailed.length) {
      console.log(`- CDN 失败分组：${cdnGroupFailed.join(', ')}`)
    }
    process.exitCode = 1
    return
  }
  if (failed.length) {
    console.log(`结果：关键检查通过，存在 ${failed.length} 项备用线路不可达（可接受）`)
    return
  }
  console.log(`结果：全部通过（${checks.length} 项）`)
}

run().catch((error) => {
  console.error('测试脚本执行失败:', error?.message || error)
  process.exitCode = 1
})
