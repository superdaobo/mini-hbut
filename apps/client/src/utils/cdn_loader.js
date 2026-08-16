const scriptLoaders = new Map()
const moduleLoaders = new Map()
const styleLoaders = new Map()
const CDN_CACHE_NAME = 'hbut-cdn-runtime-v2'

const normalizeUrls = (urls) => {
  if (!Array.isArray(urls)) return []
  return urls.map((item) => String(item || '').trim()).filter(Boolean)
}

const withTimeout = (promise, timeoutMs = 15000) =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('CDN load timeout'))
    }, timeoutMs)
    promise
      .then((value) => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timer)
        reject(error)
      })
  })

const hasCacheStorage = () => typeof window !== 'undefined' && typeof window.caches !== 'undefined'

const openCdnCache = async () => {
  if (!hasCacheStorage()) return null
  try {
    return await window.caches.open(CDN_CACHE_NAME)
  } catch {
    return null
  }
}

const fetchTextByUrl = async (url, timeoutMs = 15000) => {
  const response = await withTimeout(
    fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store'
    }),
    timeoutMs
  )
  if (!response.ok) {
    throw new Error(`fetch failed(${response.status}): ${url}`)
  }
  const cache = await openCdnCache()
  if (cache) {
    try {
      await cache.put(url, response.clone())
    } catch {
      // ignore cache put failure
    }
  }
  return response.text()
}

const readCachedTextByUrl = async (url) => {
  const cache = await openCdnCache()
  if (!cache) return ''
  try {
    const response = await cache.match(url)
    if (!response || !response.ok) return ''
    return await response.text()
  } catch {
    return ''
  }
}

const loadScriptByUrl = (url) =>
  new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve(url)
    script.onerror = () => reject(new Error(`load script failed: ${url}`))
    document.head.appendChild(script)
  })

const loadScriptByText = (code, sourceUrl = '') =>
  new Promise((resolve, reject) => {
    try {
      const blob = new Blob([`${code}\n//# sourceURL=${sourceUrl || 'hbut-cdn-runtime.js'}`], {
        type: 'text/javascript'
      })
      const blobUrl = URL.createObjectURL(blob)
      withTimeout(loadScriptByUrl(blobUrl), 15000)
        .then(() => {
          URL.revokeObjectURL(blobUrl)
          resolve(sourceUrl || blobUrl)
        })
        .catch((error) => {
          URL.revokeObjectURL(blobUrl)
          reject(error)
        })
    } catch (error) {
      reject(error)
    }
  })

export const loadScriptFromCdn = async ({
  cacheKey,
  urls,
  timeoutMs = 15000,
  resolveGlobal
} = {}) => {
  const key = String(cacheKey || '')
  const list = normalizeUrls(urls)
  if (!key || !list.length) {
    throw new Error('CDN script config invalid')
  }

  const pickGlobal = typeof resolveGlobal === 'function' ? resolveGlobal : () => null
  const existed = pickGlobal()
  if (existed) return existed

  const pending = scriptLoaders.get(key)
  if (pending) return pending

  const task = (async () => {
    let lastError = null
    // 优先缓存：首次下载后可在弱网场景继续加载。
    for (const url of list) {
      try {
        const cached = await readCachedTextByUrl(url)
        if (!cached) continue
        await loadScriptByText(cached, url)
        const loaded = pickGlobal()
        if (loaded) return loaded
      } catch (error) {
        lastError = error
      }
    }
    for (const url of list) {
      try {
        const code = await fetchTextByUrl(url, timeoutMs)
        await loadScriptByText(code, url)
        const loaded = pickGlobal()
        if (loaded) return loaded
      } catch (error) {
        lastError = error
      }
    }
    // 最后兜底：让浏览器自行请求脚本链接。
    for (const url of list) {
      try {
        await withTimeout(loadScriptByUrl(url), timeoutMs)
        const loaded = pickGlobal()
        if (loaded) return loaded
      } catch (error) {
        lastError = error
      }
    }
    throw lastError || new Error(`CDN script load failed: ${key}`)
  })()

  scriptLoaders.set(key, task)
  try {
    return await task
  } finally {
    if (!pickGlobal()) {
      scriptLoaders.delete(key)
    }
  }
}

const importByUrl = async (url) => import(/* @vite-ignore */ url)

export const importModuleFromCdn = async ({
  cacheKey,
  urls,
  timeoutMs = 15000
} = {}) => {
  const key = String(cacheKey || '')
  const list = normalizeUrls(urls)
  if (!key || !list.length) {
    throw new Error('CDN module config invalid')
  }

  const pending = moduleLoaders.get(key)
  if (pending) return pending

  const task = (async () => {
    let lastError = null
    for (const url of list) {
      try {
        return await withTimeout(importByUrl(url), timeoutMs)
      } catch (error) {
        lastError = error
      }
    }
    throw lastError || new Error(`CDN module load failed: ${key}`)
  })()

  moduleLoaders.set(key, task)
  try {
    return await task
  } catch (error) {
    moduleLoaders.delete(key)
    throw error
  }
}

const loadStyleByUrl = (url, id) =>
  new Promise((resolve, reject) => {
    const existed = document.getElementById(id)
    if (existed) {
      resolve(url)
      return
    }
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = url
    link.crossOrigin = 'anonymous'
    link.onload = () => resolve(url)
    link.onerror = () => reject(new Error(`load stylesheet failed: ${url}`))
    document.head.appendChild(link)
  })

const loadStyleByText = (cssText, id) =>
  new Promise((resolve, reject) => {
    const existed = document.getElementById(id)
    if (existed) {
      resolve(id)
      return
    }
    const style = document.createElement('style')
    style.id = id
    style.textContent = cssText
    try {
      document.head.appendChild(style)
      resolve(id)
    } catch (error) {
      reject(error)
    }
  })

export const loadStyleFromCdn = async ({
  cacheKey,
  urls,
  timeoutMs = 15000
} = {}) => {
  const key = String(cacheKey || '')
  const list = normalizeUrls(urls)
  if (!key || !list.length) {
    throw new Error('CDN style config invalid')
  }

  const pending = styleLoaders.get(key)
  if (pending) return pending

  const styleId = `cdn-style-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const task = (async () => {
    let lastError = null
    for (const url of list) {
      try {
        const cached = await readCachedTextByUrl(url)
        if (!cached) continue
        await loadStyleByText(cached, styleId)
        return url
      } catch (error) {
        lastError = error
      }
    }
    for (const url of list) {
      try {
        const cssText = await fetchTextByUrl(url, timeoutMs)
        await loadStyleByText(cssText, styleId)
        return url
      } catch (error) {
        lastError = error
      }
    }
    for (const url of list) {
      try {
        return await withTimeout(loadStyleByUrl(url, styleId), timeoutMs)
      } catch (error) {
        lastError = error
      }
    }
    throw lastError || new Error(`CDN style load failed: ${key}`)
  })()

  styleLoaders.set(key, task)
  try {
    return await task
  } catch (error) {
    styleLoaders.delete(key)
    throw error
  }
}
