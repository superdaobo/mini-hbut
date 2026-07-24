import { b as isTauriRuntime, e as isLikelyAndroidUserAgent } from "./runtime-bridge-apFQ0nCw.js";
const CAMPUS_MAP_SCHEMA_VERSION = "1";
const CAMPUS_MAP_CACHE_VERSION = "v2";
const CAMPUS_MAP_CONFIG_BASE = "https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/campus_map";
const CAMPUS_MAP_MANIFEST_URL = `${CAMPUS_MAP_CONFIG_BASE}/manifest.json`;
const CAMPUS_MAP_CACHE_KEY = `static_resource:campus_map_bundle:${CAMPUS_MAP_CACHE_VERSION}`;
const CAMPUS_MAP_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
const CAMPUS_MAP_FETCH_TIMEOUT_MS = 1e4;
const CAMPUS_LOCATION_DRIFT_THRESHOLD_METERS = 2e3;
const CAMPUS_MAP_DIRECTION_PROXY = "/campus-map/direction";
const TENCENT_MAP_SCRIPT_ATTR = "data-tencent-map";
const getGlobalTMap = () => {
  if (typeof window === "undefined") return null;
  return window.TMap || null;
};
async function loadTencentMap(apiKey) {
  if (typeof window === "undefined") throw new Error("当前环境无法加载地图");
  const existing = getGlobalTMap();
  if (existing) return existing;
  const scriptSelector = `script[${TENCENT_MAP_SCRIPT_ATTR}="1"]`;
  const scriptEl = document.querySelector(scriptSelector);
  if (scriptEl) {
    await new Promise((resolve, reject) => {
      scriptEl.addEventListener("load", () => resolve(), { once: true });
      scriptEl.addEventListener("error", () => reject(new Error("腾讯地图脚本加载失败")), { once: true });
    });
    const loaded2 = getGlobalTMap();
    if (!loaded2) throw new Error("腾讯地图脚本已加载但未暴露 TMap");
    return loaded2;
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.setAttribute(TENCENT_MAP_SCRIPT_ATTR, "1");
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("腾讯地图脚本加载失败"));
    document.head.appendChild(script);
  });
  const loaded = getGlobalTMap();
  if (!loaded) throw new Error("腾讯地图脚本已加载但未暴露 TMap");
  return loaded;
}
const toTencentLatLng = (TMap, point) => {
  const lat = "lat" in point ? point.lat : point.latitude;
  const lng = "lng" in point ? point.lng : point.longitude;
  return new TMap.LatLng(Number(lat), Number(lng));
};
const TOWERGO_CONFIG = Object.freeze({
  baseUrl: "/towergo",
  localBridgeBaseUrl: "http://127.0.0.1:4399/towergo",
  realBaseUrl: "https://ebike-oper.chinatowercom.cn",
  tenantId: "1",
  secret: "zhuoyingtech",
  sign: "HHzwPK9bmE2XGrsaZbDGFQANjhjlqWmFAJ10fglpF7e54fAia",
  signStr: "PCFqnNgvbrFzxYx4OwNd95wtTmDVAfPZ7xKBQfLlh21lr9F00H",
  platform: "wechat",
  appId: "wx278283883c249e3e",
  qqMapKey: "LQBBZ-Y42ER-STHWC-WORES-QFUQS-SKFFV",
  appKey: "yCgCur4oa9LhlaAKpWP9DqfP",
  payChannel: "wx_lite"
});
const safeString = (value) => String(value ?? "").trim();
const memoryStorage = /* @__PURE__ */ (() => {
  const store = /* @__PURE__ */ new Map();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
})();
const ensureLocalStorage = () => {
  const target = globalThis;
  if (typeof target.localStorage !== "undefined") return target.localStorage;
  target.localStorage = memoryStorage;
  return target.localStorage;
};
ensureLocalStorage();
const toBase64 = (value) => {
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(value)));
  }
  const bufferCtor = globalThis.Buffer;
  if (bufferCtor) return bufferCtor.from(value, "utf8").toString("base64");
  throw new Error("当前环境不支持 Base64 编码");
};
const sha256 = async (value) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("当前环境不支持 SHA-256 签名");
  }
  const data = new TextEncoder().encode(value);
  const hashBuffer = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((item) => item.toString(16).padStart(2, "0")).join("");
};
const createTowerGoStorage = (prefix = "towergo_") => ({
  get(key) {
    try {
      const raw = ensureLocalStorage().getItem(prefix + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    ensureLocalStorage().setItem(prefix + key, JSON.stringify(value));
  },
  del(key) {
    ensureLocalStorage().removeItem(prefix + key);
  },
  getDeviceId() {
    const existing = safeString(this.get("deviceId"));
    if (existing) return existing;
    const nextId = `tauri_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    this.set("deviceId", nextId);
    return nextId;
  }
});
const towerGoStorage = createTowerGoStorage();
const isLocalTowerGoToken = (token) => typeof token === "string" && token.startsWith("local_");
const getTowerGoAuthState = (storage = towerGoStorage) => {
  const loginInfo = storage.get("loginInfo") || {};
  const token = safeString(loginInfo.accessToken || loginInfo.access_token || loginInfo.token);
  if (!token || isLocalTowerGoToken(token)) {
    return { loggedIn: false, token: "", loginInfo: null };
  }
  return { loggedIn: true, token, loginInfo };
};
const normalizeTowerGoResult = (body, httpStatus = 0) => {
  const source = body && typeof body === "object" ? body : {};
  const ok = source.success === true || source.code === 0 || source.code === "0" || source.code === "00000";
  const code = source.code == null ? ok ? "00000" : "UNKNOWN" : String(source.code);
  const msg = safeString(source.msg || source.message || source.error || (ok ? "请求成功" : "请求失败"));
  return {
    ok,
    success: ok,
    code,
    msg,
    data: source.data == null ? null : source.data,
    raw: body,
    httpStatus,
    degraded: false,
    authExpired: code === "00005"
  };
};
const normalizeTowerGoError = (error, url = "") => {
  const err = error;
  return {
    ok: false,
    success: false,
    code: err?.code || "NETWORK_ERROR",
    msg: err?.message || "网络请求失败",
    data: null,
    raw: null,
    httpStatus: err?.httpStatus || 0,
    degraded: !!err?.degraded,
    url
  };
};
const buildCommonData = (storage) => {
  const timestamp = Date.now();
  const channelInfo = storage.get("channelInfo") || {};
  return {
    timestamp,
    commonData: {
      platform: TOWERGO_CONFIG.platform,
      traceId: timestamp + Math.floor(Math.random() * 1e11).toString(),
      deviceId: storage.getDeviceId(),
      tenantId: TOWERGO_CONFIG.tenantId,
      appId: TOWERGO_CONFIG.appId,
      businessChannel: safeString(storage.get("businessChannel")),
      cityAreaCode: safeString(channelInfo.cityAreaCode),
      cityAreaCodeName: safeString(channelInfo.cityAreaCodeName),
      cityDeptCode: safeString(channelInfo.cityDeptCode),
      cityDeptCodeName: safeString(channelInfo.cityDeptCodeName),
      provinceDeptCode: safeString(channelInfo.provinceDeptCode),
      provinceDeptCodeName: safeString(channelInfo.provinceDeptCodeName)
    }
  };
};
const buildTowerGoRequestInit = async (method, url, data = {}, options = {}) => {
  const storage = options.storage || towerGoStorage;
  const { timestamp, commonData } = buildCommonData(storage);
  const mergedData = { ...commonData, ...data || {} };
  const signRaw = `${JSON.stringify(mergedData)}_t=${timestamp}${TOWERGO_CONFIG.sign}${TOWERGO_CONFIG.signStr}`;
  const headers = {
    _t: String(timestamp),
    _s: await sha256(signRaw),
    "Content-Type": "application/json; charset=UTF-8",
    Accept: "application/json",
    "accept-language": "zh-CN",
    "x-miniprogram-appid": TOWERGO_CONFIG.appId,
    "x-client-platform": "mini-hbut-tauri"
  };
  const auth = getTowerGoAuthState(storage);
  if (url === "/oauth/token") {
    headers.Authorization = `Basic ${toBase64(`${TOWERGO_CONFIG.tenantId}:${TOWERGO_CONFIG.secret}`)}`;
  } else if (auth.loggedIn && !options.skipAuth) {
    headers.Authorization = `Bearer ${auth.token}`;
  }
  const init = {
    method,
    headers
  };
  if (method !== "GET") {
    init.body = JSON.stringify(mergedData);
  }
  return init;
};
const resolveTowerGoBaseUrl = () => {
  const win = typeof window === "undefined" ? null : window;
  if (win?.__TAURI_INTERNALS__ || win?.__TAURI__) return TOWERGO_CONFIG.localBridgeBaseUrl;
  return TOWERGO_CONFIG.baseUrl;
};
const appendGetQuery = (url, data) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data || {})) {
    if (value == null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  if (!query) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
};
const towerGoRequest = async (method, url, data = {}, options = {}) => {
  const relativeUrl = method === "GET" ? appendGetQuery(url, data) : url;
  const fullUrl = relativeUrl.startsWith("http") ? relativeUrl : `${resolveTowerGoBaseUrl()}${relativeUrl}`;
  try {
    const response = await fetch(fullUrl, await buildTowerGoRequestInit(method, url, data, options));
    const rawText = await response.text();
    let parsed = {};
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      return {
        ok: false,
        success: false,
        code: "INVALID_JSON",
        msg: `小塔出行接口返回了非 JSON 响应（HTTP ${response.status}）`,
        data: null,
        raw: rawText.slice(0, 500),
        httpStatus: response.status,
        degraded: false,
        url
      };
    }
    const result = normalizeTowerGoResult(parsed, response.status);
    if (result.authExpired) {
      towerGoStorage.del("loginInfo");
      towerGoStorage.del("userInfo");
    }
    return result;
  } catch (error) {
    const normalized = normalizeTowerGoError(error, url);
    if (options.throwOnError) throw error;
    return normalized;
  }
};
const firstArray = (data) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const obj = data;
  for (const key of ["list", "records", "rows", "data", "items"]) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  return [];
};
const buildLocationPayload = (lat, lng, extra = {}) => {
  const serviceId = safeString(extra.serviceId || towerGoStorage.get("serviceId"));
  return {
    lat,
    lng,
    ...serviceId ? { serviceId } : {},
    ...extra
  };
};
const buildFenceLocationPayload = (lat, lng, extra = {}) => ({
  ...buildLocationPayload(lat, lng, extra),
  locationDTO: { lat, lng }
});
const towerGoApi = {
  config: TOWERGO_CONFIG,
  storage: towerGoStorage,
  get: (url, params, options) => towerGoRequest("GET", url, params || {}, options),
  post: (url, data, options) => towerGoRequest("POST", url, data || {}, options),
  request: towerGoRequest,
  firstArray,
  isLoggedIn: () => getTowerGoAuthState().loggedIn,
  logout: () => {
    for (const key of ["loginInfo", "userInfo", "serviceId", "businessChannel", "channelInfo", "lastSummary"]) {
      towerGoStorage.del(key);
    }
  },
  auth: {
    sendCode: (phone, scene = 1) => towerGoRequest("POST", "/client/code/send", { phone: `+86-${phone}`, scene }, { skipAuth: true }),
    login: (phone, code) => towerGoRequest("POST", "/oauth/token", {
      grant_type: "phone_code",
      phone: `+86-${phone}`,
      messageCode: code
    }, { skipAuth: true }),
    getUserInfo: () => towerGoRequest("POST", "/client/user/user/personInfo", {}),
    getTenantConfig: () => towerGoRequest("POST", "/client/tenant/config", {}),
    async doFullLogin(phone, code) {
      const loginResult = await this.login(phone, code);
      if (!loginResult.ok || !loginResult.data) return loginResult;
      const data = loginResult.data;
      const loginInfo = {
        accessToken: safeString(data.access_token || data.accessToken || data.token),
        refreshToken: safeString(data.refresh_token || data.refreshToken),
        openid: safeString(data.openid),
        pin: safeString(data.pin || data.userPin || data.user_pin),
        userPin: safeString(data.userPin || data.pin || data.user_pin)
      };
      towerGoStorage.set("loginInfo", loginInfo);
      const userResult = await this.getUserInfo();
      if (userResult.ok && userResult.data) {
        const user = userResult.data;
        towerGoStorage.set("userInfo", {
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
        });
        if (user.serviceId) towerGoStorage.set("serviceId", user.serviceId);
        if (user.businessChannel) towerGoStorage.set("businessChannel", user.businessChannel);
      }
      const configResult = await this.getTenantConfig();
      if (configResult.ok && configResult.data) towerGoStorage.set("channelInfo", configResult.data);
      return { ...loginResult, userInfo: towerGoStorage.get("userInfo") };
    }
  },
  rent: {
    scan: (carId) => towerGoRequest("POST", "/client/rent/scan", { carId, carType: 0 }),
    getNearBike: (lat, lng, options) => towerGoRequest("POST", "/client/paas/device/eBikeLocation", buildLocationPayload(lat, lng, options)),
    getCarInfo: (carId) => towerGoRequest("POST", "/client/rent/getCarInfo", { carId }),
    carSearchVoice: (data) => towerGoRequest("POST", "/client/paas/device/carSearchVoice", data || {}),
    getRideInfo: (data) => towerGoRequest("POST", "/client/rent/getRideInfo", data || {}),
    ride: (data) => towerGoRequest("POST", "/client/rent/network/ride", data),
    returnPermission: (data) => towerGoRequest("POST", "/client/rent/returnPermission", data || {}),
    networkReturn: (data) => towerGoRequest("POST", "/client/rent/network/return", data),
    tempParking: (data) => towerGoRequest("POST", "/client/rent/tempParking", data),
    tempUnlock: (data) => towerGoRequest("POST", "/client/rent/tempUnlock", data),
    continueRiding: (data) => towerGoRequest("POST", "/client/rent/car/continueRiding", data),
    closeOrder: (data) => towerGoRequest("POST", "/client/rent/closeOrder", data)
  },
  order: {
    list: (params) => towerGoRequest("POST", "/client/order/list", params || {}),
    detail: (orderId) => towerGoRequest("POST", "/client/order/detail", { orderId }),
    detailLast: (data) => towerGoRequest("POST", "/client/order/detailLast", data || {}),
    queryFrozen: (data) => towerGoRequest("POST", "/client/order/queryFrozen", data || {}),
    frozen: (data) => towerGoRequest("POST", "/client/order/frozen", data || {})
  },
  wallet: {
    account: (params) => towerGoRequest("POST", "/ebike_account/user_account/client/user_account", params || {}),
    walletInfo: (params) => towerGoRequest("POST", "/ebike_account/wallet/client/get_wallet_info", params || {}),
    rechargeList: (params) => towerGoRequest("POST", "/client/recharge/app/rechargeList", params || {})
  },
  card: {
    ridingCard: (params) => towerGoRequest("POST", "/ebike_account/riding_card/client/get_riding_card", params || {}),
    depositCard: (params) => towerGoRequest("POST", "/ebike_account/deposit_card/client/get_user_deposit_card", params || {}),
    discount: (params) => towerGoRequest("POST", "/ebike_account/discount/client/get_user_all_discount", params || {})
  },
  fence: {
    serviceByLocation: (lat, lng) => towerGoRequest("POST", "/client/fence/serviceArea/getByLocation", { lat, lng }),
    fenceByServiceId: (serviceId) => towerGoRequest("POST", "/client/fence/serviceArea/getFenceByServiceId", { id: serviceId }),
    nearFence: (lat, lng, options) => towerGoRequest("POST", "/client/fence/serviceArea/getNearFence", buildFenceLocationPayload(lat, lng, options)),
    nearParkingNum: (lat, lng, options) => towerGoRequest("POST", "/client/fence/parking/nearParkingNum", buildFenceLocationPayload(lat, lng, options))
  },
  user: {
    rentCheck: (data) => towerGoRequest("POST", "/client/user/rent/check", data || {}),
    authState: (data) => towerGoRequest("POST", "/client/user/auth/state", data || {})
  },
  pay: {
    deductWallet: (data) => towerGoRequest("POST", "/client/rent/return/deductWallet", data || {}),
    closeOrder: (data) => towerGoRequest("POST", "/client/rent/closeOrder", data || {})
  },
  help: {
    customerService: () => towerGoRequest("POST", "/client/helpConfig/getCustomerServiceByServiceId", {}),
    homeNav: () => towerGoRequest("POST", "/client/helpConfig/getHomeNavByServiceId", { carType: 0 })
  }
};
const LOCAL_BRIDGE_ORIGIN = "http://127.0.0.1:4399";
const decodeTencentPolyline = (coors) => {
  if (!Array.isArray(coors) || coors.length < 2) return [];
  const points = [];
  let lat = coors[0] / 1e6;
  let lng = coors[1] / 1e6;
  points.push({ lat, lng });
  for (let i = 2; i < coors.length; i += 2) {
    lat += coors[i] / 1e6;
    lng += coors[i + 1] / 1e6;
    points.push({ lat, lng });
  }
  return points;
};
const resolveCampusMapDirectionUrl = (proxyPath = CAMPUS_MAP_DIRECTION_PROXY) => {
  const path = String(proxyPath || CAMPUS_MAP_DIRECTION_PROXY).trim() || CAMPUS_MAP_DIRECTION_PROXY;
  if (/^https?:\/\//i.test(path)) return path;
  if (!isTauriRuntime()) return path;
  if (isLikelyAndroidUserAgent()) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${LOCAL_BRIDGE_ORIGIN}${normalized}`;
};
const formatCoord = (point) => `${point.lat},${point.lng}`;
const fetchWalkingRoute = async (from, to, { signal } = {}) => {
  const fromLat = Number(from?.lat);
  const fromLng = Number(from?.lng);
  const toLat = Number(to?.lat);
  const toLng = Number(to?.lng);
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
    throw new Error("路线起终点坐标无效");
  }
  const params = new URLSearchParams({
    from: formatCoord({ lat: fromLat, lng: fromLng }),
    to: formatCoord({ lat: toLat, lng: toLng }),
    output: "json"
  });
  const endpoint = resolveCampusMapDirectionUrl();
  const response = await fetch(`${endpoint}?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal
  });
  if (!response.ok) {
    throw new Error(`路线服务 HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (payload.status !== 0) {
    throw new Error(payload.message || "路线规划失败");
  }
  const route = payload.result?.routes?.[0];
  if (!route?.polyline?.length) {
    throw new Error("路线结果为空");
  }
  const polyline = decodeTencentPolyline(route.polyline);
  if (polyline.length < 2) {
    throw new Error("路线折线无效");
  }
  return {
    distanceMeters: Number(route.distance) || 0,
    durationSeconds: Number(route.duration) || 0,
    polyline
  };
};
const formatWalkingDuration = (seconds) => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
};
const formatWalkingDistance = (meters) => {
  if (!Number.isFinite(meters)) return "--";
  if (meters < 1e3) return `${Math.round(meters)} m`;
  return `${(meters / 1e3).toFixed(1)} km`;
};
export {
  CAMPUS_MAP_SCHEMA_VERSION as C,
  TOWERGO_CONFIG as T,
  CAMPUS_MAP_MANIFEST_URL as a,
  CAMPUS_MAP_CACHE_KEY as b,
  CAMPUS_MAP_CACHE_TTL_MS as c,
  CAMPUS_MAP_FETCH_TIMEOUT_MS as d,
  formatWalkingDistance as e,
  formatWalkingDuration as f,
  fetchWalkingRoute as g,
  CAMPUS_LOCATION_DRIFT_THRESHOLD_METERS as h,
  towerGoStorage as i,
  towerGoApi as j,
  loadTencentMap as l,
  toTencentLatLng as t
};
