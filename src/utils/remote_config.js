import { invoke } from '@tauri-apps/api/core'
import { fetchWithCache, SHORT_TTL } from './api.js'

const DEFAULT_CONFIG = {
  announcements: {
    pinned: [],
    ticker: [],
    list: [],
    confirm: []
  },
  force_update: {
    min_version: '',
    message: '',
    download_url: ''
  },
  ocr: {
    endpoint: '',
    enabled: true
  }
}

const CONFIG_URL = 'https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/remote_config.json'

const normalizeArray = (value) => (Array.isArray(value) ? value : [])

export function normalizeRemoteConfig(raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {}
  const announcements = cfg.announcements || {}

  return {
    announcements: {
      pinned: normalizeArray(announcements.pinned),
      ticker: normalizeArray(announcements.ticker),
      list: normalizeArray(announcements.list),
      confirm: normalizeArray(announcements.confirm)
    },
    force_update: {
      min_version: cfg.force_update?.min_version || '',
      message: cfg.force_update?.message || '',
      download_url: cfg.force_update?.download_url || ''
    },
    ocr: {
      endpoint: cfg.ocr?.endpoint || '',
      enabled: cfg.ocr?.enabled !== false
    }
  }
}

export async function fetchRemoteConfig() {
  if (!CONFIG_URL) {
    return DEFAULT_CONFIG
  }

  const { data } = await fetchWithCache('remote-config', async () => {
    try {
      return await invoke('fetch_remote_config', { url: CONFIG_URL })
    } catch (e) {
      const res = await fetch(CONFIG_URL, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json'
        }
      })
      if (!res.ok) {
        throw new Error(`配置拉取失败: ${res.status}`)
      }
      return res.json()
    }
  }, SHORT_TTL)

  return normalizeRemoteConfig(data || DEFAULT_CONFIG)
}
