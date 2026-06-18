type TowerGoHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface TowerGoStorageLike {
  get(key: string): unknown
  set(key: string, value: unknown): void
  del(key: string): void
  getDeviceId(): string
}

export interface TowerGoRequestOptions {
  skipAuth?: boolean
  throwOnError?: boolean
  storage?: TowerGoStorageLike
}

export interface TowerGoResult<T = unknown> {
  ok: boolean
  success: boolean
  code: string
  msg: string
  data: T | null
  raw: unknown
  httpStatus: number
  degraded: boolean
  authExpired?: boolean
  url?: string
}

export const TOWERGO_CONFIG = Object.freeze({
  baseUrl: '/towergo',
  localBridgeBaseUrl: 'http://127.0.0.1:4399/towergo',
  realBaseUrl: 'https://ebike-oper.chinatowercom.cn',
  tenantId: '1',
  secret: 'zhuoyingtech',
  sign: 'HHzwPK9bmE2XGrsaZbDGFQANjhjlqWmFAJ10fglpF7e54fAia',
  signStr: 'PCFqnNgvbrFzxYx4OwNd95wtTmDVAfPZ7xKBQfLlh21lr9F00H',
  platform: 'wechat',
  appId: 'wx278283883c249e3e',
  qqMapKey: 'LQBBZ-Y42ER-STHWC-WORES-QFUQS-SKFFV',
  appKey: 'yCgCur4oa9LhlaAKpWP9DqfP',
  payChannel: 'wx_lite'
})

// TOWERGO_CONFIRMABLE_ACTIONS removed — the TowerGo module no longer exposes any side-effect actions to the user

const REDACTED = '[redacted]'
const SENSITIVE_KEYS = new Set([
  'authorization',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'token',
  'password',
  'secret',
  'sign',
  'signstr',
  'appkey',
  'phone',
  'mobile',
  'userpin',
  'pin'
])

const safeString = (value: unknown) => String(value ?? '').trim()

const memoryStorage = (() => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() }
  }
})()

const ensureLocalStorage = () => {
  const target = globalThis as typeof globalThis & { localStorage?: Storage }
  if (typeof target.localStorage !== 'undefined') return target.localStorage
  target.localStorage = memoryStorage as Storage
  return target.localStorage
}

ensureLocalStorage()

const toBase64 = (value: string) => {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(value)))
  }
  const bufferCtor = (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer
  if (bufferCtor) return bufferCtor.from(value, 'utf8').toString('base64')
  throw new Error('当前环境不支持 Base64 编码')
}

const sha256 = async (value: string) => {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('当前环境不支持 SHA-256 签名')
  }
  const data = new TextEncoder().encode(value)
  const hashBuffer = await subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map((item) => item.toString(16).padStart(2, '0')).join('')
}

export const createTowerGoStorage = (prefix = 'towergo_'): TowerGoStorageLike => ({
  get(key: string) {
    try {
      const raw = ensureLocalStorage().getItem(prefix + key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  set(key: string, value: unknown) {
    ensureLocalStorage().setItem(prefix + key, JSON.stringify(value))
  },
  del(key: string) {
    ensureLocalStorage().removeItem(prefix + key)
  },
  getDeviceId() {
    const existing = safeString(this.get('deviceId'))
    if (existing) return existing
    const nextId = `tauri_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    this.set('deviceId', nextId)
    return nextId
  }
})

export const towerGoStorage = createTowerGoStorage()

export const isLocalTowerGoToken = (token: unknown) =>
  typeof token === 'string' && token.startsWith('local_')

export const getTowerGoAuthState = (storage: TowerGoStorageLike = towerGoStorage) => {
  const loginInfo = (storage.get('loginInfo') || {}) as Record<string, unknown>
  const token = safeString(loginInfo.accessToken || loginInfo.access_token || loginInfo.token)
  if (!token || isLocalTowerGoToken(token)) {
    return { loggedIn: false, token: '', loginInfo: null as Record<string, unknown> | null }
  }
  return { loggedIn: true, token, loginInfo }
}

export const redactString = (value: unknown) => {
  const text = String(value ?? '')
  if (!text) return text
  if (/^(Bearer|Basic)\s+/i.test(text)) return REDACTED
  return text
    .replace(/\+86-1(\d{2})\d{4}(\d{4})/g, '+86-1$1****$2')
    .replace(/\b1(\d{2})\d{4}(\d{4})\b/g, '1$1****$2')
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, REDACTED)
    .replace(/\ba_[A-Za-z0-9_-]{8,}\b/g, `a_${REDACTED}`)
}

export const redactForLog = (value: unknown, depth = 0): unknown => {
  if (value == null) return value
  if (depth > 4) return '[truncated]'
  if (typeof value === 'string') return redactString(value)
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactForLog(item, depth + 1))
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).slice(0, 100)) {
    const normalized = key.toLowerCase().replace(/[_-]/g, '')
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) || SENSITIVE_KEYS.has(normalized)
      ? REDACTED
      : redactForLog((value as Record<string, unknown>)[key], depth + 1)
  }
  return out
}

export const normalizeTowerGoResult = <T = unknown>(body: unknown, httpStatus = 0): TowerGoResult<T> => {
  const source = (body && typeof body === 'object') ? body as Record<string, unknown> : {}
  const ok = source.success === true || source.code === 0 || source.code === '0' || source.code === '00000'
  const code = source.code == null ? (ok ? '00000' : 'UNKNOWN') : String(source.code)
  const msg = safeString(source.msg || source.message || source.error || (ok ? '请求成功' : '请求失败'))
  return {
    ok,
    success: ok,
    code,
    msg,
    data: (source.data == null ? null : source.data) as T | null,
    raw: body,
    httpStatus,
    degraded: false,
    authExpired: code === '00005'
  }
}

export const normalizeTowerGoError = (error: unknown, url = ''): TowerGoResult => {
  const err = error as { code?: string, message?: string, httpStatus?: number, degraded?: boolean }
  return {
    ok: false,
    success: false,
    code: err?.code || 'NETWORK_ERROR',
    msg: err?.message || '网络请求失败',
    data: null,
    raw: null,
    httpStatus: err?.httpStatus || 0,
    degraded: !!err?.degraded,
    url
  }
}

const buildCommonData = (storage: TowerGoStorageLike) => {
  const timestamp = Date.now()
  const channelInfo = (storage.get('channelInfo') || {}) as Record<string, unknown>
  return {
    timestamp,
    commonData: {
      platform: TOWERGO_CONFIG.platform,
      traceId: timestamp + Math.floor(Math.random() * 1e11).toString(),
      deviceId: storage.getDeviceId(),
      tenantId: TOWERGO_CONFIG.tenantId,
      appId: TOWERGO_CONFIG.appId,
      businessChannel: safeString(storage.get('businessChannel')),
      cityAreaCode: safeString(channelInfo.cityAreaCode),
      cityAreaCodeName: safeString(channelInfo.cityAreaCodeName),
      cityDeptCode: safeString(channelInfo.cityDeptCode),
      cityDeptCodeName: safeString(channelInfo.cityDeptCodeName),
      provinceDeptCode: safeString(channelInfo.provinceDeptCode),
      provinceDeptCodeName: safeString(channelInfo.provinceDeptCodeName)
    }
  }
}

export const buildTowerGoRequestInit = async (
  method: TowerGoHttpMethod,
  url: string,
  data: Record<string, unknown> = {},
  options: TowerGoRequestOptions = {}
): Promise<RequestInit> => {
  const storage = options.storage || towerGoStorage
  const { timestamp, commonData } = buildCommonData(storage)
  const mergedData = { ...commonData, ...(data || {}) }
  const signRaw = `${JSON.stringify(mergedData)}_t=${timestamp}${TOWERGO_CONFIG.sign}${TOWERGO_CONFIG.signStr}`
  const headers: Record<string, string> = {
    _t: String(timestamp),
    _s: await sha256(signRaw),
    'Content-Type': 'application/json; charset=UTF-8',
    Accept: 'application/json',
    'accept-language': 'zh-CN',
    'x-miniprogram-appid': TOWERGO_CONFIG.appId,
    'x-client-platform': 'mini-hbut-tauri'
  }
  const auth = getTowerGoAuthState(storage)
  if (url === '/oauth/token') {
    headers.Authorization = `Basic ${toBase64(`${TOWERGO_CONFIG.tenantId}:${TOWERGO_CONFIG.secret}`)}`
  } else if (auth.loggedIn && !options.skipAuth) {
    headers.Authorization = `Bearer ${auth.token}`
  }
  const init: RequestInit = {
    method,
    headers
  }
  if (method !== 'GET') {
    init.body = JSON.stringify(mergedData)
  }
  return init
}

export const resolveTowerGoBaseUrl = () => {
  const win = typeof window === 'undefined' ? null : window as Window & {
    __TAURI_INTERNALS__?: unknown
    __TAURI__?: unknown
  }
  if (win?.__TAURI_INTERNALS__ || win?.__TAURI__) return TOWERGO_CONFIG.localBridgeBaseUrl
  return TOWERGO_CONFIG.baseUrl
}

const appendGetQuery = (url: string, data: Record<string, unknown>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(data || {})) {
    if (value == null || value === '') continue
    params.set(key, String(value))
  }
  const query = params.toString()
  if (!query) return url
  return `${url}${url.includes('?') ? '&' : '?'}${query}`
}

export const towerGoRequest = async <T = unknown>(
  method: TowerGoHttpMethod,
  url: string,
  data: Record<string, unknown> = {},
  options: TowerGoRequestOptions = {}
): Promise<TowerGoResult<T>> => {
  const relativeUrl = method === 'GET' ? appendGetQuery(url, data) : url
  const fullUrl = relativeUrl.startsWith('http') ? relativeUrl : `${resolveTowerGoBaseUrl()}${relativeUrl}`
  try {
    const response = await fetch(fullUrl, await buildTowerGoRequestInit(method, url, data, options))
    const rawText = await response.text()
    let parsed: unknown = {}
    try {
      parsed = rawText ? JSON.parse(rawText) : {}
    } catch {
      return {
        ok: false,
        success: false,
        code: 'INVALID_JSON',
        msg: `小塔出行接口返回了非 JSON 响应（HTTP ${response.status}）`,
        data: null,
        raw: rawText.slice(0, 500),
        httpStatus: response.status,
        degraded: false,
        url
      }
    }
    const result = normalizeTowerGoResult<T>(parsed, response.status)
    if (result.authExpired) {
      towerGoStorage.del('loginInfo')
      towerGoStorage.del('userInfo')
    }
    return result
  } catch (error) {
    const normalized = normalizeTowerGoError(error, url)
    if (options.throwOnError) throw error
    return normalized
  }
}

const firstArray = (data: unknown): unknown[] => {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  const obj = data as Record<string, unknown>
  for (const key of ['list', 'records', 'rows', 'data', 'items']) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[]
  }
  return []
}

const buildLocationPayload = (lat: number, lng: number, extra: Record<string, unknown> = {}) => {
  const serviceId = safeString(extra.serviceId || towerGoStorage.get('serviceId'))
  return {
    lat,
    lng,
    ...(serviceId ? { serviceId } : {}),
    ...extra
  }
}

const buildFenceLocationPayload = (lat: number, lng: number, extra: Record<string, unknown> = {}) => ({
  ...buildLocationPayload(lat, lng, extra),
  locationDTO: { lat, lng }
})

export const towerGoApi = {
  config: TOWERGO_CONFIG,
  storage: towerGoStorage,
  get: <T = unknown>(url: string, params?: Record<string, unknown>, options?: TowerGoRequestOptions) =>
    towerGoRequest<T>('GET', url, params || {}, options),
  post: <T = unknown>(url: string, data?: Record<string, unknown>, options?: TowerGoRequestOptions) =>
    towerGoRequest<T>('POST', url, data || {}, options),
  request: towerGoRequest,
  firstArray,
  isLoggedIn: () => getTowerGoAuthState().loggedIn,
  logout: () => {
    for (const key of ['loginInfo', 'userInfo', 'serviceId', 'businessChannel', 'channelInfo', 'lastSummary']) {
      towerGoStorage.del(key)
    }
  },
  auth: {
    sendCode: (phone: string, scene = 1) =>
      towerGoRequest('POST', '/client/code/send', { phone: `+86-${phone}`, scene }, { skipAuth: true }),
    login: (phone: string, code: string) =>
      towerGoRequest<Record<string, unknown>>('POST', '/oauth/token', {
        grant_type: 'phone_code',
        phone: `+86-${phone}`,
        messageCode: code
      }, { skipAuth: true }),
    getUserInfo: () => towerGoRequest<Record<string, unknown>>('POST', '/client/user/user/personInfo', {}),
    getTenantConfig: () => towerGoRequest<Record<string, unknown>>('POST', '/client/tenant/config', {}),
    async doFullLogin(phone: string, code: string) {
      const loginResult = await this.login(phone, code)
      if (!loginResult.ok || !loginResult.data) return loginResult
      const data = loginResult.data
      const loginInfo = {
        accessToken: safeString(data.access_token || data.accessToken || data.token),
        refreshToken: safeString(data.refresh_token || data.refreshToken),
        openid: safeString(data.openid),
        pin: safeString(data.pin || data.userPin || data.user_pin),
        userPin: safeString(data.userPin || data.pin || data.user_pin)
      }
      towerGoStorage.set('loginInfo', loginInfo)
      const userResult = await this.getUserInfo()
      if (userResult.ok && userResult.data) {
        const user = userResult.data
        towerGoStorage.set('userInfo', {
          pin: safeString(user.pin || user.userPin || user.user_pin || loginInfo.pin),
          userPin: safeString(user.userPin || user.pin || user.user_pin || loginInfo.userPin),
          nickname: safeString(user.nickname || user.nickName || user.authName),
          phone,
          authName: safeString(user.authName),
          avatar: safeString(user.avatar || user.headImg),
          serviceId: safeString(user.serviceId || user.service_id),
          businessChannel: safeString(user.businessChannel || user.business_channel),
          izStudentAuth: !!user.izStudentAuth,
          izAuth: !!user.izAuth
        })
        if (user.serviceId) towerGoStorage.set('serviceId', user.serviceId)
        if (user.businessChannel) towerGoStorage.set('businessChannel', user.businessChannel)
      }
      const configResult = await this.getTenantConfig()
      if (configResult.ok && configResult.data) towerGoStorage.set('channelInfo', configResult.data)
      return { ...loginResult, userInfo: towerGoStorage.get('userInfo') }
    }
  },
  rent: {
    scan: (carId: string) => towerGoRequest('POST', '/client/rent/scan', { carId, carType: 0 }),
    getNearBike: (lat: number, lng: number, options?: Record<string, unknown>) =>
      towerGoRequest('POST', '/client/paas/device/eBikeLocation', buildLocationPayload(lat, lng, options)),
    getCarInfo: (carId: string) => towerGoRequest('POST', '/client/rent/getCarInfo', { carId }),
    carSearchVoice: (data: Record<string, unknown>) => towerGoRequest('POST', '/client/paas/device/carSearchVoice', data || {}),
    getRideInfo: (data: Record<string, unknown>) => towerGoRequest('POST', '/client/rent/getRideInfo', data || {}),
    ride: (data: Record<string, unknown>) => towerGoRequest('POST', '/client/rent/network/ride', data),
    returnPermission: (data: Record<string, unknown>) => towerGoRequest('POST', '/client/rent/returnPermission', data || {}),
    networkReturn: (data: Record<string, unknown>) => towerGoRequest('POST', '/client/rent/network/return', data),
    tempParking: (data: Record<string, unknown>) => towerGoRequest('POST', '/client/rent/tempParking', data),
    tempUnlock: (data: Record<string, unknown>) => towerGoRequest('POST', '/client/rent/tempUnlock', data),
    continueRiding: (data: Record<string, unknown>) => towerGoRequest('POST', '/client/rent/car/continueRiding', data),
    closeOrder: (data: Record<string, unknown>) => towerGoRequest('POST', '/client/rent/closeOrder', data)
  },
  order: {
    list: (params?: Record<string, unknown>) => towerGoRequest('POST', '/client/order/list', params || {}),
    detail: (orderId: string) => towerGoRequest('POST', '/client/order/detail', { orderId }),
    detailLast: (data?: Record<string, unknown>) => towerGoRequest('POST', '/client/order/detailLast', data || {}),
    queryFrozen: (data?: Record<string, unknown>) => towerGoRequest('POST', '/client/order/queryFrozen', data || {}),
    frozen: (data?: Record<string, unknown>) => towerGoRequest('POST', '/client/order/frozen', data || {})
  },
  wallet: {
    account: (params?: Record<string, unknown>) => towerGoRequest('POST', '/ebike_account/user_account/client/user_account', params || {}),
    walletInfo: (params?: Record<string, unknown>) => towerGoRequest('POST', '/ebike_account/wallet/client/get_wallet_info', params || {}),
    rechargeList: (params?: Record<string, unknown>) => towerGoRequest('POST', '/client/recharge/app/rechargeList', params || {})
  },
  card: {
    ridingCard: (params?: Record<string, unknown>) => towerGoRequest('POST', '/ebike_account/riding_card/client/get_riding_card', params || {}),
    depositCard: (params?: Record<string, unknown>) => towerGoRequest('POST', '/ebike_account/deposit_card/client/get_user_deposit_card', params || {}),
    discount: (params?: Record<string, unknown>) => towerGoRequest('POST', '/ebike_account/discount/client/get_user_all_discount', params || {})
  },
  fence: {
    serviceByLocation: (lat: number, lng: number) => towerGoRequest('POST', '/client/fence/serviceArea/getByLocation', { lat, lng }),
    fenceByServiceId: (serviceId: string) => towerGoRequest('POST', '/client/fence/serviceArea/getFenceByServiceId', { id: serviceId }),
    nearFence: (lat: number, lng: number, options?: Record<string, unknown>) =>
      towerGoRequest('POST', '/client/fence/serviceArea/getNearFence', buildFenceLocationPayload(lat, lng, options)),
    nearParkingNum: (lat: number, lng: number, options?: Record<string, unknown>) =>
      towerGoRequest('POST', '/client/fence/parking/nearParkingNum', buildFenceLocationPayload(lat, lng, options))
  },
  user: {
    rentCheck: (data?: Record<string, unknown>) => towerGoRequest('POST', '/client/user/rent/check', data || {}),
    authState: (data?: Record<string, unknown>) => towerGoRequest('POST', '/client/user/auth/state', data || {})
  },
  pay: {
    deductWallet: (data?: Record<string, unknown>) => towerGoRequest('POST', '/client/rent/return/deductWallet', data || {}),
    closeOrder: (data?: Record<string, unknown>) => towerGoRequest('POST', '/client/rent/closeOrder', data || {})
  },
  help: {
    customerService: () => towerGoRequest('POST', '/client/helpConfig/getCustomerServiceByServiceId', {}),
    homeNav: () => towerGoRequest('POST', '/client/helpConfig/getHomeNavByServiceId', { carType: 0 })
  }
}
