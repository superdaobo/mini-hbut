import assert from 'node:assert/strict'
import fs from 'node:fs'

const bridgeBase = process.env.BRIDGE_BASE || 'http://127.0.0.1:4399'
const moduleBase = process.env.MODULE_CDN_BASE || 'https://hbut.6661111.xyz/modules'
const channel = process.env.MODULE_CHANNEL || 'dev'
const moduleId = process.env.MODULE_ID || 'hecheng_hugongda'
const moduleCatalogUrl = `${moduleBase}/${channel}/catalog.json`
const placeholderMarkers = [
  '模块入口已就绪',
  '官网直开兜底',
  '验证模块包下载、解压和应用内窗口预览链路',
  '模块中心联调与发布验证'
]

const getExpectedPatterns = (targetModuleId) => {
  if (targetModuleId === 'hecheng_hugongda') {
    return [/合成湖工大/i, /(清北只是起点|得分|下个登场)/i]
  }
  if (targetModuleId === 'hugongda_escape') {
    return [/(湖工大|撤离)/i, /(开始行动|选择你的职业|行动失败|成功撤离)/i]
  }
  return [/(<!doctype html>|<html|<body)/i]
}

const fetchText = async (url, init) => {
  const response = await fetch(url, init)
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`请求失败：HTTP ${response.status}`)
  }
  return text
}

const fetchJson = async (url, init) => {
  const response = await fetch(url, init)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `请求失败：HTTP ${response.status}`
    throw new Error(message)
  }
  return payload
}

const extractAssetUrls = (html, pageUrl) => {
  const urls = new Set()
  const pattern = /<(?:script|link)\b[^>]+(?:src|href)=["']([^"'#?]+(?:\?[^"']*)?)["'][^>]*>/gi
  let match
  while ((match = pattern.exec(html))) {
    const raw = String(match[1] || '').trim()
    if (!raw || /^https?:\/\//i.test(raw)) continue
    urls.add(new URL(raw, pageUrl).toString())
  }
  return [...urls]
}

const collectPreviewArtifacts = async (previewUrl) => {
  const html = await fetchText(previewUrl, { cache: 'no-store' })
  const assetUrls = extractAssetUrls(html, previewUrl)
  const assetContents = []
  for (const assetUrl of assetUrls) {
    assetContents.push(await fetchText(assetUrl, { cache: 'no-store' }))
  }
  return {
    html,
    assetUrls,
    combinedText: [html, ...assetContents].join('\n')
  }
}

const resolveManifestUrl = (target) => {
  const localUrl = new URL(`./${moduleId}/manifest.json`, `${moduleCatalogUrl}?ts=0`).toString()
  const remoteUrl = new URL(
    target?.manifest_url || `./${moduleId}/manifest.json`,
    moduleCatalogUrl
  ).toString()

  try {
    const localOrigin = new URL(moduleCatalogUrl).origin
    const remoteOrigin = new URL(remoteUrl).origin
    if (localOrigin !== remoteOrigin) {
      return localUrl
    }
  } catch {
    // ignore invalid url and fallback
  }
  return remoteUrl
}

const resolvePackageUrl = (manifestUrl, manifest) => {
  const localUrl = new URL(
    `./${moduleId}/${manifest.version}/bundle.zip`,
    `${moduleBase}/${channel}/catalog.json`
  ).toString()
  const remoteUrl = new URL(manifest.package_url, manifestUrl).toString()
  try {
    const localOrigin = new URL(moduleCatalogUrl).origin
    const remoteOrigin = new URL(remoteUrl).origin
    if (localOrigin !== remoteOrigin) {
      return localUrl
    }
  } catch {
    // ignore invalid url and fallback
  }
  return remoteUrl
}

const main = async () => {
  const catalogPayload = await fetchJson(`${moduleCatalogUrl}?ts=${Date.now()}`)
  const modules = Array.isArray(catalogPayload?.modules) ? catalogPayload.modules : []
  const target = modules.find((item) => item?.id === moduleId)
  assert.ok(target, `模块 ${moduleId} 不存在于 ${channel} 渠道 catalog`)

  const manifestUrl = resolveManifestUrl(target)
  const manifest = await fetchJson(`${manifestUrl}${manifestUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`)
  assert.equal(manifest.module_id, moduleId, 'manifest module_id 不匹配')
  const packageUrl = resolvePackageUrl(manifestUrl, manifest)

  const preparePayload = await fetchJson(`${bridgeBase}/module_bundle/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel,
      moduleId,
      moduleName: manifest.module_name,
      version: manifest.version,
      packageUrl,
      packageSha256: manifest.package_sha256 || '',
      entryPath: manifest.entry_path || 'index.html'
    })
  })
  const prepared = preparePayload?.data || {}
  assert.ok(prepared.preview_url, 'prepare 未返回 preview_url')
  assert.match(
    String(prepared.preview_url || ''),
    /\/module_bundle\/content\//,
    'prepare 返回的 preview_url 不是本地模块桥接地址'
  )
  assert.ok(prepared.bundle_path, 'prepare 未返回 bundle_path')
  assert.ok(fs.existsSync(prepared.bundle_path), `bundle.zip 不存在：${prepared.bundle_path}`)

  const previewArtifacts = await collectPreviewArtifacts(prepared.preview_url)
  const previewText = previewArtifacts.combinedText
  for (const marker of placeholderMarkers) {
    assert.ok(!previewText.includes(marker), `preview 仍命中占位页文案：${marker}`)
  }
  for (const pattern of getExpectedPatterns(moduleId)) {
    assert.match(previewText, pattern, `preview 资源未命中真实模块特征：${pattern}`)
  }

  console.log('[module-bridge-test] prepare:', JSON.stringify(prepared, null, 2))
  console.log('[module-bridge-test] assets:', JSON.stringify(previewArtifacts.assetUrls, null, 2))
  console.log('[module-bridge-test] 所有断言通过')
}

main().catch((error) => {
  console.error('[module-bridge-test] 失败:', error?.message || error)
  process.exitCode = 1
})
