import { i as defineComponent, o as onMounted, a as openBlock, c as createElementBlock, b as createBaseVNode, v as renderSlot, e as normalizeStyle, d as createCommentVNode, t as toDisplayString, g as createTextVNode, F as Fragment, r as ref, n as normalizeClass, f as renderList, u as unref, h as computed, p as onBeforeUnmount, x as watch, C as nextTick, w as withModifiers, k as createVNode, l as withCtx, M as withDirectives, S as vShow } from "./vue-core-4L5yFbGc.js";
import { b as batteryLevelTier, f as formatDistance, S as SCAN_REFRESH_INTERVAL_MS, H as HBUT_LOCATION, a as resolveTowerGoLocation, t as toGcj, r as resetTencentMapLoader, l as loadTencentMap, c as normalizeVehicles, n as normalizePoint, d as toTencentLatLng, e as BATTERY_ICON_TIERS, C as CENTER_FETCH_DEBOUNCE_MS, B as BottomSheet } from "./BottomSheet-Bv5JRLvE.js";
import { _ as _export_sfc, c6 as bridgeFetch } from "./app-demo-D63SYrKg.js";
import { a as isTauriRuntime, p as pushDebugLog } from "./runtime-bridge-D89yarmp.js";
import "./more-modules-CjuZH60i.js";
import "./debug-tools-M02-hysp.js";
import "./capture-DywMeU18.js";
const _hoisted_1$3 = { class: "tg-map-panel tg-map-panel--fs" };
const _hoisted_2$3 = ["disabled", "aria-label", "title"];
const _hoisted_3$3 = { class: "pop-main" };
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "TowerGoMapPanel",
  props: {
    sheetClearance: { default: 0 },
    locating: { type: Boolean, default: false },
    showFab: { type: Boolean, default: true },
    selectedVehicle: { default: null },
    routeIsStraight: { type: Boolean, default: false },
    formatDistance: { type: Function, default: (meters) => `${Math.round(Number(meters) || 0)}m` }
  },
  emits: ["mapReady", "locate", "navigate", "close"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const mapEl = ref(null);
    onMounted(() => emit("mapReady", mapEl.value));
    const onLocate = () => emit("locate");
    const onNavigate = () => emit("navigate");
    const onClose = () => emit("close");
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("section", _hoisted_1$3, [
        createBaseVNode("div", {
          ref_key: "mapEl",
          ref: mapEl,
          class: "tg-map tg-map--fs"
        }, null, 512),
        renderSlot(_ctx.$slots, "default", {}, void 0, true),
        __props.showFab ? (openBlock(), createElementBlock("button", {
          key: 0,
          type: "button",
          class: "tg-icon-btn tg-fab",
          style: normalizeStyle({ bottom: `calc(${__props.sheetClearance + 20}px + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)))` }),
          disabled: __props.locating,
          "aria-label": __props.locating ? "定位中" : "定位",
          title: __props.locating ? "定位中" : "定位",
          onClick: onLocate
        }, [..._cache[0] || (_cache[0] = [
          createBaseVNode("span", { class: "material-symbols-outlined" }, "my_location", -1)
        ])], 12, _hoisted_2$3)) : createCommentVNode("", true),
        __props.selectedVehicle ? (openBlock(), createElementBlock("div", {
          key: 1,
          class: "tg-vehicle-pop tg-vehicle-pop--apple",
          style: normalizeStyle({ bottom: `calc(${__props.sheetClearance + 16}px + var(--app-safe-bottom, env(safe-area-inset-bottom, 0px)))` })
        }, [
          _cache[2] || (_cache[2] = createBaseVNode("span", { class: "vehicle-icon material-symbols-outlined" }, "electric_bike", -1)),
          createBaseVNode("div", _hoisted_3$3, [
            createBaseVNode("strong", null, "NO." + toDisplayString(__props.selectedVehicle.id || __props.selectedVehicle.imei || "--"), 1),
            createBaseVNode("small", null, [
              createTextVNode(toDisplayString(__props.formatDistance(__props.selectedVehicle.distance)) + " · 电量 " + toDisplayString(__props.selectedVehicle.battery || "--") + "% ", 1),
              __props.routeIsStraight ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                createTextVNode(" · 直线示意")
              ], 64)) : createCommentVNode("", true)
            ])
          ]),
          createBaseVNode("button", {
            class: "pop-nav",
            type: "button",
            onClick: onNavigate
          }, "到这"),
          createBaseVNode("button", {
            class: "pop-close",
            type: "button",
            "aria-label": "取消选中",
            onClick: onClose
          }, [..._cache[1] || (_cache[1] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "close", -1)
          ])])
        ], 4)) : createCommentVNode("", true)
      ]);
    };
  }
});
const TowerGoMapPanel = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-05fa5b54"]]);
const _hoisted_1$2 = { class: "tg-list-panel" };
const _hoisted_2$2 = { class: "tg-filter-bar" };
const _hoisted_3$2 = {
  class: "seg",
  role: "group",
  "aria-label": "排序方式"
};
const _hoisted_4$2 = {
  class: "seg",
  role: "group",
  "aria-label": "电量筛选"
};
const _hoisted_5$2 = {
  key: 0,
  class: "empty-row"
};
const _hoisted_6$2 = {
  key: 1,
  class: "empty-row"
};
const _hoisted_7$2 = {
  key: 2,
  class: "vehicle-scroll-list"
};
const _hoisted_8$2 = ["onClick"];
const _hoisted_9$1 = ["data-tier", "data-low"];
const _hoisted_10$1 = { class: "vehicle-main" };
const _hoisted_11$1 = ["data-low"];
const _hoisted_12$1 = {
  key: 0,
  class: "truncation-hint"
};
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "TowerGoVehicleList",
  props: {
    vehicles: {},
    selectedId: { default: "" },
    loading: { type: Boolean, default: false },
    errorMessage: { default: "" },
    total: { default: 0 }
  },
  emits: ["select"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const sortBy = ref("distance");
    const filterMinBattery = ref(0);
    const sortedVehicles = computed(() => {
      const list = [...props.vehicles];
      const filtered = filterMinBattery.value > 0 ? list.filter((v) => Number(v.battery) >= filterMinBattery.value) : list;
      return filtered.sort(
        (a, b) => sortBy.value === "battery" ? Number(b.battery) - Number(a.battery) : Number(a.distance) - Number(b.distance)
      );
    });
    const onSelect = (vehicle) => emit("select", vehicle);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("section", _hoisted_1$2, [
        createBaseVNode("div", _hoisted_2$2, [
          createBaseVNode("div", _hoisted_3$2, [
            createBaseVNode("button", {
              class: normalizeClass({ active: sortBy.value === "distance" }),
              onClick: _cache[0] || (_cache[0] = ($event) => sortBy.value = "distance")
            }, "按距离", 2),
            createBaseVNode("button", {
              class: normalizeClass({ active: sortBy.value === "battery" }),
              onClick: _cache[1] || (_cache[1] = ($event) => sortBy.value = "battery")
            }, "按电量", 2)
          ]),
          createBaseVNode("div", _hoisted_4$2, [
            createBaseVNode("button", {
              class: normalizeClass({ active: filterMinBattery.value === 0 }),
              onClick: _cache[2] || (_cache[2] = ($event) => filterMinBattery.value = 0)
            }, "全部", 2),
            createBaseVNode("button", {
              class: normalizeClass({ active: filterMinBattery.value === 30 }),
              onClick: _cache[3] || (_cache[3] = ($event) => filterMinBattery.value = 30)
            }, "≥30%", 2),
            createBaseVNode("button", {
              class: normalizeClass({ active: filterMinBattery.value === 60 }),
              onClick: _cache[4] || (_cache[4] = ($event) => filterMinBattery.value = 60)
            }, "≥60%", 2)
          ])
        ]),
        __props.loading && !__props.vehicles.length ? (openBlock(), createElementBlock("div", _hoisted_5$2, "正在加载附近车辆…")) : !__props.loading && !sortedVehicles.value.length ? (openBlock(), createElementBlock("div", _hoisted_6$2, toDisplayString(__props.errorMessage || "暂无可展示车辆。"), 1)) : (openBlock(), createElementBlock("div", _hoisted_7$2, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(sortedVehicles.value.slice(0, 50), (vehicle) => {
            return openBlock(), createElementBlock("button", {
              key: vehicle.id || vehicle.imei,
              class: normalizeClass(["vehicle-row", { active: __props.selectedId && (vehicle.id === __props.selectedId || vehicle.imei === __props.selectedId) }]),
              type: "button",
              onClick: ($event) => onSelect(vehicle)
            }, [
              createBaseVNode("span", {
                class: "vehicle-icon vehicle-icon--batt",
                "data-tier": unref(batteryLevelTier)(vehicle.battery),
                "data-low": Number(vehicle.battery) < 30 ? "1" : "0"
              }, [
                _cache[5] || (_cache[5] = createBaseVNode("span", { class: "material-symbols-outlined" }, "electric_bike", -1)),
                createBaseVNode("b", null, toDisplayString(unref(batteryLevelTier)(vehicle.battery)), 1)
              ], 8, _hoisted_9$1),
              createBaseVNode("span", _hoisted_10$1, [
                createBaseVNode("strong", null, "NO." + toDisplayString(vehicle.id || vehicle.imei || "--"), 1),
                createBaseVNode("small", null, toDisplayString(unref(formatDistance)(vehicle.distance)) + " · 电量 " + toDisplayString(vehicle.battery || "--") + "%", 1)
              ]),
              createBaseVNode("span", {
                class: "vehicle-batt",
                "data-low": Number(vehicle.battery) < 30 ? "1" : "0"
              }, toDisplayString(vehicle.battery || "--") + "% ", 9, _hoisted_11$1)
            ], 10, _hoisted_8$2);
          }), 128)),
          sortedVehicles.value.length > 50 ? (openBlock(), createElementBlock("p", _hoisted_12$1, " （仅显示前 50 辆，地图上可见全部 " + toDisplayString(__props.total) + " 辆） ", 1)) : createCommentVNode("", true)
        ]))
      ]);
    };
  }
});
const TowerGoVehicleList = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-ca55b12f"]]);
const _hoisted_1$1 = { class: "tg-area-panel" };
const _hoisted_2$1 = { class: "tg-area-card" };
const _hoisted_3$1 = { key: 0 };
const _hoisted_4$1 = { class: "tg-area-card" };
const _hoisted_5$1 = { class: "card-head" };
const _hoisted_6$1 = {
  key: 0,
  class: "progress-chip"
};
const _hoisted_7$1 = {
  key: 0,
  class: "empty-row"
};
const _hoisted_8$1 = {
  key: 1,
  class: "parking-list"
};
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "TowerGoServiceArea",
  props: {
    serviceName: {},
    serviceId: {},
    scanTimeText: {},
    currentLocation: {},
    locationSourceText: {},
    lastFetchCenter: {},
    parkingList: {},
    refreshing: { type: Boolean, default: false }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("section", _hoisted_1$1, [
        createBaseVNode("article", _hoisted_2$1, [
          _cache[0] || (_cache[0] = createBaseVNode("span", null, "当前服务区", -1)),
          createBaseVNode("strong", null, toDisplayString(__props.serviceName), 1),
          createBaseVNode("p", null, "serviceId：" + toDisplayString(__props.serviceId || "--") + " · 最近刷新 " + toDisplayString(__props.scanTimeText), 1),
          createBaseVNode("p", null, " 自身定位：" + toDisplayString(Number(__props.currentLocation.latitude).toFixed(5)) + ", " + toDisplayString(Number(__props.currentLocation.longitude).toFixed(5)) + "（" + toDisplayString(__props.locationSourceText) + "） ", 1),
          __props.lastFetchCenter ? (openBlock(), createElementBlock("p", _hoisted_3$1, " 最近查车中心：" + toDisplayString(Number(__props.lastFetchCenter.latitude).toFixed(5)) + ", " + toDisplayString(Number(__props.lastFetchCenter.longitude).toFixed(5)), 1)) : createCommentVNode("", true)
        ]),
        createBaseVNode("article", _hoisted_4$1, [
          createBaseVNode("div", _hoisted_5$1, [
            createBaseVNode("h3", null, "停车点（" + toDisplayString(__props.parkingList.length) + "）", 1),
            __props.refreshing ? (openBlock(), createElementBlock("span", _hoisted_6$1, "刷新中")) : createCommentVNode("", true)
          ]),
          !__props.parkingList.length ? (openBlock(), createElementBlock("div", _hoisted_7$1, "暂无停车点数据")) : (openBlock(), createElementBlock("ul", _hoisted_8$1, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(__props.parkingList, (p, i) => {
              return openBlock(), createElementBlock("li", {
                key: String(p.id || i)
              }, [
                _cache[1] || (_cache[1] = createBaseVNode("span", { class: "material-symbols-outlined" }, "place", -1)),
                createBaseVNode("div", null, [
                  createBaseVNode("strong", null, toDisplayString(p.name || "未命名停车点"), 1),
                  createBaseVNode("small", null, "当前 " + toDisplayString(p.carCount ?? "--") + " 辆 · 限停 " + toDisplayString(p.maxParkingNumber ?? "--"), 1)
                ])
              ]);
            }), 128))
          ]))
        ])
      ]);
    };
  }
});
const TowerGoServiceArea = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-29097a84"]]);
const CAMPUS_MAP_DIRECTION_PROXY = "/campus-map/direction";
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
  const response = await bridgeFetch(`${endpoint}?${params.toString()}`, {
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
    const response = await bridgeFetch(
      fullUrl,
      await buildTowerGoRequestInit(method, url, data, options)
    );
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
const toErrorMessage = (raw, fallback) => {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object") {
    const record = raw;
    for (const key of ["msg", "message", "error"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
};
const useTowerGoMap = (mapContainerRef) => {
  const currentLocation = ref({ ...HBUT_LOCATION });
  const selectedVehicle = ref(null);
  const vehicles = ref([]);
  const serviceId = ref(String(towerGoStorage.get("serviceId") || ""));
  const serviceInfo = ref(null);
  const parkingInfo = ref(null);
  const fences = ref(null);
  const mapErrors = ref([]);
  const mapScriptError = ref("");
  const loadingMap = ref(false);
  const locating = ref(false);
  const lastScanAt = ref(0);
  const lastFetchCenter = ref(null);
  const mapScriptState = ref("idle");
  const mapInstance = ref(null);
  const centerMarkerLayer = ref(null);
  const vehicleMarkerLayer = ref(null);
  const fencePolygonLayer = ref(null);
  const mapDataReady = ref(false);
  const routeIsStraight = ref(false);
  let refreshTimer = null;
  let mapErrorHandler = null;
  let activeScanToken = 0;
  let regionFetchTimer = null;
  const centerFetchInFlight = ref(false);
  const readMapCenter = () => {
    const map = mapInstance.value;
    if (!map?.getCenter) return null;
    try {
      const center = map.getCenter();
      const latitude = Number(center?.getLat?.() ?? center?.lat);
      const longitude = Number(center?.getLng?.() ?? center?.lng);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return { name: "地图中心", latitude, longitude };
    } catch {
      return null;
    }
  };
  const bindMapRegionChange = () => {
    const map = mapInstance.value;
    if (!map?.on) return;
    const schedule = () => {
      if (regionFetchTimer) window.clearTimeout(regionFetchTimer);
      regionFetchTimer = window.setTimeout(() => {
        regionFetchTimer = null;
        void refreshVehiclesAtMapCenter();
      }, CENTER_FETCH_DEBOUNCE_MS);
    };
    for (const eventName of ["dragend", "zoomend", "idle"]) {
      try {
        map.on(eventName, schedule);
      } catch {
      }
    }
  };
  const validId = (value) => String(value ?? "").trim();
  const toTMapLatLng = (point) => {
    const TMap = window.TMap;
    return toTencentLatLng(TMap, { latitude: point.latitude, longitude: point.longitude });
  };
  const svgToDataUrl = (svg) => {
    try {
      const encoded = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(svg))) : "";
      if (encoded) return `data:image/svg+xml;base64,${encoded}`;
    } catch {
    }
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  };
  const appleUserDotSvg = () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="10" fill="#007AFF" stroke="#ffffff" stroke-width="3"/>
      <circle cx="22" cy="22" r="18" fill="none" stroke="#007AFF" stroke-opacity="0.28" stroke-width="4"/>
    </svg>`;
    return svgToDataUrl(svg);
  };
  const officialVehiclePinSvg = (tier, active = false, hasReward = false) => {
    const body = hasReward ? "#FF9F0A" : active ? "#0A84FF" : "#12B76A";
    const batt = tier <= 0 ? "#98A2B3" : tier < 30 ? "#F04438" : tier < 60 ? "#F79009" : "#12B76A";
    const label = String(Math.max(0, Math.min(100, tier)));
    const w = active ? 51 : 36;
    const h = active ? 71 : 51;
    const pinTop = active ? 46 : 34;
    const cx = w / 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <path d="M${cx} 2C${cx - 12.5} 2 ${cx - 20} 9.8 ${cx - 20} 19.5c0 12.8 20 31 20 31s20-18.2 20-31C${cx + 20} 9.8 ${cx + 12.5} 2 ${cx} 2z" fill="${body}" stroke="#fff" stroke-width="1.6"/>
      <circle cx="${cx}" cy="18" r="10.5" fill="#fff"/>
      <path d="M${cx - 7} 20h14l-1.4-4.8a3.2 3.2 0 0 0-3.1-2.4h-4.4a3.2 3.2 0 0 0-3.1 2.4L${cx - 7} 20zm1.7 1.6h10.6v2.4a1.3 1.3 0 0 1-1.3 1.3h-8a1.3 1.3 0 0 1-1.3-1.3v-2.4z" fill="${body}"/>
      <rect x="${cx - 9}" y="${pinTop - 12}" width="18" height="9" rx="2" fill="#fff" stroke="${batt}" stroke-width="1.2"/>
      <rect x="${cx + 9}" y="${pinTop - 9.5}" width="2.2" height="4" rx="0.8" fill="${batt}"/>
      <rect x="${cx - 7.5}" y="${pinTop - 10.2}" width="${Math.max(1.5, 16 * tier / 100)}" height="5.4" rx="1" fill="${batt}"/>
      <text x="${cx}" y="${pinTop + 2}" text-anchor="middle" font-size="7" font-family="system-ui,sans-serif" font-weight="700" fill="#fff">${label}</text>
    </svg>`;
    return svgToDataUrl(svg);
  };
  const buildTowerGoMarkerStyles = (TMap) => {
    const styles = {};
    const makeStyle = typeof TMap?.MarkerStyle === "function" ? (opts) => new TMap.MarkerStyle(opts) : (opts) => ({ ...opts });
    styles.user = makeStyle({
      width: 40,
      height: 40,
      anchor: { x: 20, y: 20 },
      src: appleUserDotSvg()
    });
    for (const tier of BATTERY_ICON_TIERS) {
      styles[`vehicle-${tier}`] = makeStyle({
        width: 36,
        height: 51,
        anchor: { x: 18, y: 51 },
        src: officialVehiclePinSvg(tier, false, false)
      });
      styles[`vehicleActive-${tier}`] = makeStyle({
        width: 51,
        height: 71,
        anchor: { x: 25.5, y: 71 },
        src: officialVehiclePinSvg(tier, true, false)
      });
      styles[`vehicleReward-${tier}`] = makeStyle({
        width: 36,
        height: 51,
        anchor: { x: 18, y: 51 },
        src: officialVehiclePinSvg(tier, false, true)
      });
    }
    return styles;
  };
  const vehicleStyleId = (vehicle, active) => {
    const tier = batteryLevelTier(vehicle.battery);
    if (active) return `vehicleActive-${tier}`;
    if (vehicle.hasReward) return `vehicleReward-${tier}`;
    return `vehicle-${tier}`;
  };
  const ensureUserLocationMarker = (point) => {
    if (!mapInstance.value || !window.TMap) return;
    const TMap = window.TMap;
    const styles = buildTowerGoMarkerStyles(TMap);
    const center = toTMapLatLng(point);
    const geometry = {
      id: "center",
      styleId: "user",
      position: center,
      properties: { title: point.name || "当前位置" }
    };
    if (!centerMarkerLayer.value) {
      centerMarkerLayer.value = new TMap.MultiMarker({
        map: mapInstance.value,
        styles,
        geometries: [geometry],
        zIndex: 200
      });
      return;
    }
    centerMarkerLayer.value.setStyles?.(styles);
    centerMarkerLayer.value.setGeometries?.([geometry]);
  };
  const initMap = async (retry = 0) => {
    const container = mapContainerRef.value;
    if (!container || mapInstance.value) return;
    if (!container.offsetWidth || !container.offsetHeight) {
      if (retry < 8) {
        mapScriptState.value = "loading";
        await new Promise((r) => window.setTimeout(r, 120 + retry * 80));
        return initMap(retry + 1);
      }
      mapScriptState.value = "fallback";
      mapErrors.value = ["地图容器尺寸为 0，请返回后重试"];
      pushDebugLog("TowerGo", "地图初始化失败：容器尺寸为 0", "error");
      return;
    }
    try {
      mapScriptState.value = "loading";
      const TMap = await loadTencentMap(TOWERGO_CONFIG.qqMapKey);
      const center = toTMapLatLng(currentLocation.value);
      mapInstance.value = new TMap.Map(container, { center, zoom: 16, viewMode: "2D", showControl: false });
      ensureUserLocationMarker(currentLocation.value);
      bindMapRegionChange();
      mapScriptState.value = "ready";
      mapScriptError.value = "";
      pushDebugLog(
        "TowerGo",
        `地图就绪 size=${container.offsetWidth}x${container.offsetHeight}`,
        "info",
        {
          lat: currentLocation.value.latitude,
          lng: currentLocation.value.longitude
        }
      );
      window.setTimeout(() => {
        void refreshVehiclesAtMapCenter();
      }, 600);
    } catch (error) {
      mapScriptState.value = "fallback";
      mapScriptError.value = error?.message || "地图加载失败";
      mapErrors.value = [mapScriptError.value];
      pushDebugLog("TowerGo", `地图加载失败: ${error?.message || error}`, "error");
    }
  };
  const retryMap = async () => {
    if (mapScriptState.value === "loading") return;
    try {
      mapInstance.value?.destroy?.();
    } catch {
    }
    mapInstance.value = null;
    mapScriptState.value = "idle";
    mapErrors.value = [];
    mapScriptError.value = "";
    resetTencentMapLoader();
    await initMap();
  };
  const updateMapCenter = (point) => {
    currentLocation.value = point;
    if (!mapInstance.value || !window.TMap) return;
    const center = toTMapLatLng(point);
    mapInstance.value.setCenter(center);
    ensureUserLocationMarker(point);
    pushDebugLog(
      "TowerGo",
      `地图已更新自身位置 lat=${point.latitude.toFixed(6)} lng=${point.longitude.toFixed(6)} source=${point.source || "unknown"}`,
      "info",
      point
    );
  };
  const renderVehicleMarkers = () => {
    if (!mapInstance.value || !window.TMap) return;
    const TMap = window.TMap;
    const styles = buildTowerGoMarkerStyles(TMap);
    const selectedId = selectedVehicle.value?.id || selectedVehicle.value?.imei || "";
    const geometries = vehicles.value.slice(0, 200).map((vehicle, index) => {
      const id = vehicle.id || vehicle.imei || `vehicle-${index}`;
      const active = !!selectedId && id === selectedId;
      return {
        id,
        styleId: vehicleStyleId(vehicle, active),
        position: new TMap.LatLng(vehicle.latitude, vehicle.longitude),
        properties: {
          title: vehicle.id || vehicle.imei || "车辆",
          battery: vehicle.battery
        }
      };
    });
    if (!vehicleMarkerLayer.value) {
      vehicleMarkerLayer.value = new TMap.MultiMarker({
        map: mapInstance.value,
        styles,
        geometries,
        zIndex: 120
      });
      vehicleMarkerLayer.value.on?.("click", (event) => {
        const id = event?.geometry?.id;
        const item = vehicles.value.find((vehicle) => vehicle.id === id || vehicle.imei === id);
        if (item) selectVehicle(item);
      });
      ensureUserLocationMarker(currentLocation.value);
      return;
    }
    vehicleMarkerLayer.value.setStyles?.(styles);
    vehicleMarkerLayer.value.setGeometries?.(geometries);
  };
  const renderFenceLayers = () => {
    if (!mapInstance.value || !window.TMap) return;
    const TMap = window.TMap;
    const fenceData = fences.value;
    const list = Array.isArray(fenceData) ? fenceData : fenceData && Array.isArray(fenceData.parkings) ? fenceData.parkings : [];
    if (!list.length) return;
    const geometries = list.slice(0, 30).map((item, index) => {
      const polygon = Array.isArray(item) ? item : item.pointList || item.points;
      const paths = (Array.isArray(polygon) ? polygon : []).map(normalizePoint).filter(Boolean).map((point) => new TMap.LatLng(point.latitude, point.longitude));
      return paths.length >= 3 ? { id: `fence-${index}`, paths } : null;
    }).filter(Boolean);
    if (!geometries.length) return;
    if (!fencePolygonLayer.value) {
      fencePolygonLayer.value = new TMap.MultiPolygon({ map: mapInstance.value, geometries });
      return;
    }
    fencePolygonLayer.value.setGeometries?.(geometries);
  };
  const selectVehicle = (vehicle) => {
    selectedVehicle.value = vehicle;
    if (mapInstance.value && window.TMap) {
      mapInstance.value.setCenter(toTMapLatLng(vehicle));
    }
    void drawRouteToVehicle(vehicle);
  };
  let locationWatchId = null;
  let routeLineLayer = null;
  const clearRouteLine = () => {
    try {
      routeLineLayer?.setMap?.(null);
    } catch {
    }
    routeLineLayer = null;
    routeIsStraight.value = false;
  };
  const paintRoutePaths = (paths) => {
    if (!mapInstance.value || !window.TMap || paths.length < 2) return;
    const TMap = window.TMap;
    clearRouteLine();
    try {
      const style = typeof TMap.PolylineStyle === "function" ? new TMap.PolylineStyle({
        color: "#007AFF",
        width: 6,
        borderWidth: 2,
        borderColor: "#ffffff",
        lineCap: "round"
      }) : {
        color: "#007AFF",
        width: 6,
        borderWidth: 2,
        borderColor: "#ffffff",
        lineCap: "round"
      };
      routeLineLayer = new TMap.MultiPolyline({
        map: mapInstance.value,
        styles: { route: style },
        geometries: [{ id: "to-vehicle", styleId: "route", paths }]
      });
    } catch {
    }
  };
  const drawRouteToVehicle = async (vehicle) => {
    if (!vehicle || !mapInstance.value || !window.TMap) {
      clearRouteLine();
      return;
    }
    const TMap = window.TMap;
    try {
      const fresh = await resolveTowerGoLocation({ maximumAge: 0, timeoutMs: 8e3 });
      if (fresh.source === "system") {
        currentLocation.value = fresh;
        updateMapCenter(fresh);
      }
    } catch {
    }
    const from = toTMapLatLng(currentLocation.value);
    const to = toTMapLatLng(vehicle);
    try {
      const walk = await fetchWalkingRoute(
        { lat: currentLocation.value.latitude, lng: currentLocation.value.longitude },
        { lat: vehicle.latitude, lng: vehicle.longitude }
      );
      if (walk.polyline?.length >= 2) {
        const paths = walk.polyline.map((p) => new TMap.LatLng(p.lat, p.lng));
        paintRoutePaths(paths);
        routeIsStraight.value = false;
        return;
      }
    } catch {
    }
    paintRoutePaths([from, to]);
    routeIsStraight.value = true;
  };
  const startNavigateToSelected = () => {
    if (!selectedVehicle.value) return;
    void drawRouteToVehicle(selectedVehicle.value);
    stopLocationWatch();
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    locationWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const gcj = toGcj(pos.coords.latitude, pos.coords.longitude);
        currentLocation.value = {
          latitude: gcj.latitude,
          longitude: gcj.longitude,
          accuracy: pos.coords.accuracy,
          name: "当前位置",
          source: "system"
        };
        updateMapCenter(currentLocation.value);
        if (selectedVehicle.value) void drawRouteToVehicle(selectedVehicle.value);
      },
      () => {
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12e3 }
    );
  };
  const stopLocationWatch = () => {
    if (locationWatchId != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchId);
    }
    locationWatchId = null;
  };
  const stopNavigateToSelected = () => {
    selectedVehicle.value = null;
    stopLocationWatch();
    clearRouteLine();
  };
  const fetchNearBikesAtCenter = async (point, sid) => {
    const result = await towerGoApi.rent.getNearBike(point.latitude, point.longitude, {
      serviceId: sid
    });
    const list = result.ok ? normalizeVehicles(result.data, currentLocation.value) : [];
    pushDebugLog(
      "TowerGo",
      `中心拉车 center=${point.latitude.toFixed(6)},${point.longitude.toFixed(6)} ok=${result.ok} count=${list.length}`,
      result.ok ? "info" : "warn",
      {
        center: point,
        serviceId: sid,
        count: list.length,
        sample: list.slice(0, 3).map((v) => ({
          id: v.id || v.imei,
          lat: v.latitude,
          lng: v.longitude,
          battery: v.battery
        })),
        msg: result.msg
      }
    );
    return {
      ok: result.ok,
      msg: result.msg,
      vehicles: list
    };
  };
  const refreshVehiclesAtMapCenter = async () => {
    if (loadingMap.value || centerFetchInFlight.value) return;
    const sid = validId(serviceId.value);
    if (!sid) return;
    const center = readMapCenter() || currentLocation.value;
    if (!Number.isFinite(center.latitude) || !Number.isFinite(center.longitude)) return;
    centerFetchInFlight.value = true;
    activeScanToken += 1;
    const token = activeScanToken;
    try {
      const result = await fetchNearBikesAtCenter(center, sid);
      if (token !== activeScanToken) return;
      lastFetchCenter.value = center;
      if (result.ok) {
        vehicles.value = result.vehicles;
        lastScanAt.value = Date.now();
        if (selectedVehicle.value) {
          const key = selectedVehicle.value.id || selectedVehicle.value.imei;
          const still = vehicles.value.some((v) => v.id === key || v.imei === key);
          if (!still) {
            selectedVehicle.value = null;
            clearRouteLine();
          }
        }
        mapErrors.value = mapErrors.value.filter((m) => !m.includes("车辆"));
        renderVehicleMarkers();
      } else if (result.msg) {
        mapErrors.value = [toErrorMessage(result.msg, "车辆数据加载失败")];
      }
    } catch (error) {
      if (token !== activeScanToken) return;
      mapErrors.value = [error?.message || "附近车辆加载失败"];
    } finally {
      if (token === activeScanToken) centerFetchInFlight.value = false;
    }
  };
  const loadMapData = async (point = currentLocation.value) => {
    if (loadingMap.value) return;
    activeScanToken += 1;
    const token = activeScanToken;
    loadingMap.value = true;
    selectedVehicle.value = null;
    clearRouteLine();
    mapErrors.value = [];
    try {
      const service = await towerGoApi.fence.serviceByLocation(point.latitude, point.longitude);
      if (!service.ok || !service.data) {
        throw new Error(service.msg || "无法识别当前服务区，请确认定位在湖工大校区内");
      }
      const data = service.data;
      const sid = validId(data.id || data.serviceId || data.service_id);
      if (!sid) throw new Error("服务区数据异常：缺少 serviceId");
      serviceId.value = sid;
      serviceInfo.value = data;
      towerGoStorage.set("serviceId", sid);
      const fetchPoint = readMapCenter() || point;
      const [bikeResult, fenceResult, parkingResult] = await Promise.all([
        fetchNearBikesAtCenter(fetchPoint, sid),
        towerGoApi.fence.nearFence(point.latitude, point.longitude, { serviceId: sid }),
        towerGoApi.fence.nearParkingNum(point.latitude, point.longitude, { serviceId: sid })
      ]);
      if (token !== activeScanToken) return;
      vehicles.value = bikeResult.ok ? bikeResult.vehicles : [];
      fences.value = fenceResult.ok ? fenceResult.data : null;
      parkingInfo.value = parkingResult.ok ? parkingResult.data : null;
      mapErrors.value = [bikeResult, fenceResult].filter((item) => !item.ok).map((item) => toErrorMessage(item.msg, "车辆数据加载失败"));
      lastScanAt.value = Date.now();
      lastFetchCenter.value = fetchPoint;
      mapDataReady.value = true;
      pushDebugLog(
        "TowerGo",
        `中心拉车完成 count=${vehicles.value.length} serviceId=${sid}`,
        "info",
        {
          count: vehicles.value.length,
          serviceId: sid,
          center: fetchPoint,
          user: point,
          locationSource: point.source || "unknown"
        }
      );
      renderVehicleMarkers();
      ensureUserLocationMarker(point);
      renderFenceLayers();
    } catch (error) {
      if (token !== activeScanToken) return;
      vehicles.value = [];
      mapErrors.value = [error?.message || "地图数据加载失败"];
      pushDebugLog("TowerGo", `地图数据加载失败: ${error?.message || error}`, "error");
    } finally {
      if (token === activeScanToken) loadingMap.value = false;
    }
  };
  const refreshBySystemLocation = async () => {
    locating.value = true;
    try {
      const point = await resolveTowerGoLocation({ maximumAge: 0 });
      updateMapCenter(point);
      if (point.source === "fallback") {
        mapErrors.value = ["定位不可用或偏移过大，已用校区中心查车"];
      } else if (point.outOfRange) {
        mapErrors.value = [`当前位置距校区约 ${formatDistance(point.driftMeters)}，可能不在服务区`];
      }
      await loadMapData(point);
    } finally {
      locating.value = false;
    }
  };
  const refreshCurrentArea = async () => {
    if (!validId(serviceId.value)) {
      await loadMapData(readMapCenter() || currentLocation.value);
      return;
    }
    await refreshVehiclesAtMapCenter();
  };
  const startRefreshTimer = () => {
    stopRefreshTimer();
    refreshTimer = window.setInterval(() => {
      if (!loadingMap.value && mapContainerRef.value) void refreshCurrentArea();
    }, SCAN_REFRESH_INTERVAL_MS);
  };
  const stopRefreshTimer = () => {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };
  const teardownTowerGoRuntime = () => {
    activeScanToken += 1;
    stopRefreshTimer();
    stopLocationWatch();
    clearRouteLine();
    if (regionFetchTimer) {
      window.clearTimeout(regionFetchTimer);
      regionFetchTimer = null;
    }
    centerFetchInFlight.value = false;
    loadingMap.value = false;
    if (mapErrorHandler) {
      window.removeEventListener("error", mapErrorHandler, true);
      mapErrorHandler = null;
    }
    try {
      vehicleMarkerLayer.value?.setMap?.(null);
      centerMarkerLayer.value?.setMap?.(null);
      fencePolygonLayer.value?.setMap?.(null);
      vehicleMarkerLayer.value = null;
      centerMarkerLayer.value = null;
      fencePolygonLayer.value = null;
      mapInstance.value?.destroy?.();
    } catch {
    }
    mapInstance.value = null;
    mapDataReady.value = false;
  };
  const suppressMapWorkerError = () => {
    mapErrorHandler = (e) => {
      if (e.message?.includes("could not be cloned")) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("error", mapErrorHandler, true);
    const nativeWorker = window.Worker;
    if (nativeWorker) {
      const wrapped = function(scriptURL, options) {
        const worker = new nativeWorker(scriptURL, options);
        const nativePost = worker.postMessage.bind(worker);
        worker.postMessage = ((message, transfer) => {
          try {
            if (transfer && transfer.length) {
              nativePost(message, transfer);
            } else {
              nativePost(message);
            }
          } catch {
          }
        });
        return worker;
      };
      wrapped.prototype = nativeWorker.prototype;
      try {
        Object.defineProperty(window, "Worker", { value: wrapped, configurable: true, writable: true });
      } catch {
      }
    }
  };
  const restoreMapWorker = () => {
  };
  onBeforeUnmount(() => {
    teardownTowerGoRuntime();
  });
  return {
    // refs（供壳组件模板/编排使用）
    currentLocation,
    selectedVehicle,
    vehicles,
    serviceId,
    serviceInfo,
    parkingInfo,
    fences,
    mapErrors,
    mapScriptError,
    loadingMap,
    locating,
    lastScanAt,
    lastFetchCenter,
    mapScriptState,
    mapDataReady,
    routeIsStraight,
    centerFetchInFlight,
    // actions
    initMap,
    retryMap,
    selectVehicle,
    startNavigateToSelected,
    stopNavigateToSelected,
    refreshBySystemLocation,
    refreshCurrentArea,
    refreshVehiclesAtMapCenter,
    loadMapData,
    startRefreshTimer,
    teardownTowerGoRuntime,
    suppressMapWorkerError,
    restoreMapWorker
  };
};
const _hoisted_1 = { class: "towergo-view towergo-view--fullscreen module-page" };
const _hoisted_2 = { class: "tg-fs-title" };
const _hoisted_3 = ["disabled"];
const _hoisted_4 = {
  key: 0,
  class: "map-fallback map-fallback--overlay"
};
const _hoisted_5 = { class: "map-fallback__card" };
const _hoisted_6 = { key: 0 };
const _hoisted_7 = { key: 0 };
const _hoisted_8 = { class: "tg-map-status" };
const _hoisted_9 = { class: "tg-area-card" };
const _hoisted_10 = { key: 0 };
const _hoisted_11 = { class: "tg-status-actions" };
const _hoisted_12 = ["disabled"];
const _hoisted_13 = ["disabled"];
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TowerGoView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const mapContainerRef = ref(null);
    const {
      currentLocation,
      selectedVehicle,
      vehicles,
      serviceId,
      serviceInfo,
      fences,
      mapErrors,
      mapScriptError,
      loadingMap,
      locating,
      lastScanAt,
      lastFetchCenter,
      mapScriptState,
      mapDataReady,
      routeIsStraight,
      centerFetchInFlight,
      initMap,
      retryMap,
      selectVehicle,
      startNavigateToSelected,
      stopNavigateToSelected,
      refreshBySystemLocation,
      refreshCurrentArea,
      startRefreshTimer,
      teardownTowerGoRuntime,
      suppressMapWorkerError
    } = useTowerGoMap(mapContainerRef);
    const activeTab = ref("map");
    const sheetSnap = ref("peek");
    const sheetRef = ref(null);
    const isDesktopLayout = ref(false);
    let layoutMedia = null;
    const syncLayoutMedia = () => {
      isDesktopLayout.value = !!layoutMedia?.matches;
    };
    const sheetClearance = computed(() => {
      if (isDesktopLayout.value) return 0;
      const exposed = sheetRef.value;
      const height = Number(exposed?.currentHeight);
      return Number.isFinite(height) && height > 0 ? height : 96;
    });
    const onTabChange = (tab) => {
      activeTab.value = tab;
      sheetSnap.value = tab === "map" ? "peek" : "half";
    };
    watch(activeTab, (tab) => {
      if (tab === "map" && sheetSnap.value === "full") sheetSnap.value = "peek";
    });
    const nearestVehicle = computed(() => vehicles.value[0] || null);
    const scanTimeText = computed(
      () => lastScanAt.value ? new Date(lastScanAt.value).toLocaleTimeString("zh-CN", { hour12: false }) : "--"
    );
    const serviceName = computed(() => String(serviceInfo.value?.name || "湖工大校区"));
    const parkingList = computed(() => {
      const fenceData = fences.value;
      return fenceData?.parkings || [];
    });
    const locationSourceText = computed(() => {
      if (currentLocation.value.source === "system") return "系统定位";
      if (currentLocation.value.source === "fallback") return "校区兜底";
      return "地图中心";
    });
    const mapSubtitle = computed(() => {
      if (locating.value) return "正在定位…";
      if (loadingMap.value || centerFetchInFlight.value) return "正在加载附近车辆…";
      if (nearestVehicle.value) {
        return `附近 ${vehicles.value.length} 辆 · 最近 ${formatDistance(nearestVehicle.value.distance)} · ${locationSourceText.value}`;
      }
      if (currentLocation.value.source === "fallback" && mapErrors.value[0]) {
        return `${mapErrors.value[0]}（查车中心：校区兜底）`;
      }
      return mapErrors.value[0] || `附近暂无车辆 · ${locationSourceText.value}`;
    });
    const handleBack = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      emit("back");
    };
    const onMapReady = (el) => {
      mapContainerRef.value = el;
    };
    const onSelectVehicle = (vehicle) => {
      selectVehicle(vehicle);
      onTabChange("map");
    };
    onMounted(async () => {
      layoutMedia = typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)") : null;
      syncLayoutMedia();
      layoutMedia?.addEventListener?.("change", syncLayoutMedia);
      suppressMapWorkerError();
      await nextTick();
      await initMap();
      await refreshBySystemLocation();
      startRefreshTimer();
    });
    onBeforeUnmount(() => {
      teardownTowerGoRuntime();
      layoutMedia?.removeEventListener?.("change", syncLayoutMedia);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", {
          class: "tg-fs-header",
          onPointerdown: _cache[1] || (_cache[1] = withModifiers(() => {
          }, ["stop"])),
          onTouchstart: _cache[2] || (_cache[2] = withModifiers(() => {
          }, ["stop"]))
        }, [
          createBaseVNode("button", {
            class: "tg-icon-btn tg-back-btn",
            type: "button",
            "aria-label": "返回",
            onPointerdown: withModifiers(handleBack, ["stop", "prevent"]),
            onClick: withModifiers(handleBack, ["stop", "prevent"]),
            onTouchend: withModifiers(handleBack, ["stop", "prevent"])
          }, [..._cache[11] || (_cache[11] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
          ])], 32),
          createBaseVNode("div", _hoisted_2, [
            _cache[12] || (_cache[12] = createBaseVNode("strong", null, "小塔出行", -1)),
            createBaseVNode("small", null, toDisplayString(mapSubtitle.value), 1)
          ]),
          createBaseVNode("button", {
            class: "tg-icon-btn",
            disabled: unref(loadingMap),
            title: "刷新视野",
            onClick: _cache[0] || (_cache[0] = //@ts-ignore
            (...args) => unref(refreshCurrentArea) && unref(refreshCurrentArea)(...args))
          }, [..._cache[13] || (_cache[13] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "refresh", -1)
          ])], 8, _hoisted_3)
        ], 32),
        createVNode(TowerGoMapPanel, {
          locating: unref(locating),
          "show-fab": unref(mapScriptState) === "ready",
          "selected-vehicle": unref(selectedVehicle),
          "route-is-straight": unref(routeIsStraight),
          "format-distance": unref(formatDistance),
          "sheet-clearance": sheetClearance.value,
          onMapReady,
          onLocate: unref(refreshBySystemLocation),
          onNavigate: unref(startNavigateToSelected),
          onClose: unref(stopNavigateToSelected)
        }, {
          default: withCtx(() => [
            unref(mapScriptState) === "fallback" || unref(mapScriptState) !== "ready" && !unref(mapDataReady) ? (openBlock(), createElementBlock("div", _hoisted_4, [
              createBaseVNode("div", _hoisted_5, [
                _cache[14] || (_cache[14] = createBaseVNode("span", { class: "material-symbols-outlined" }, "electric_bike", -1)),
                createBaseVNode("strong", null, toDisplayString(unref(currentLocation).name || "湖北工业大学"), 1),
                createBaseVNode("p", null, toDisplayString(unref(mapScriptError) || unref(mapErrors)[0] || "地图加载中，车辆数据会继续刷新。"), 1),
                unref(currentLocation).latitude ? (openBlock(), createElementBlock("small", _hoisted_6, [
                  createTextVNode(" 定位 " + toDisplayString(unref(currentLocation).latitude.toFixed(5)) + ", " + toDisplayString(unref(currentLocation).longitude.toFixed(5)) + " ", 1),
                  unref(currentLocation).source ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                    createTextVNode(" · " + toDisplayString(unref(currentLocation).source), 1)
                  ], 64)) : createCommentVNode("", true)
                ])) : createCommentVNode("", true),
                unref(mapScriptState) === "fallback" ? (openBlock(), createElementBlock("button", {
                  key: 1,
                  type: "button",
                  class: "map-fallback__retry",
                  onClick: _cache[3] || (_cache[3] = //@ts-ignore
                  (...args) => unref(retryMap) && unref(retryMap)(...args))
                }, " 重试加载地图 ")) : createCommentVNode("", true)
              ])
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["locating", "show-fab", "selected-vehicle", "route-is-straight", "format-distance", "sheet-clearance", "onLocate", "onNavigate", "onClose"]),
        createVNode(unref(BottomSheet), {
          ref_key: "sheetRef",
          ref: sheetRef,
          modelValue: sheetSnap.value,
          "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => sheetSnap.value = $event),
          class: "tg-sheet"
        }, {
          header: withCtx(() => [
            createBaseVNode("nav", {
              class: "tg-tabs tg-tabs--overlay",
              onPointerdown: _cache[7] || (_cache[7] = withModifiers(() => {
              }, ["stop"]))
            }, [
              createBaseVNode("button", {
                class: normalizeClass({ active: activeTab.value === "map" }),
                onClick: _cache[4] || (_cache[4] = ($event) => onTabChange("map"))
              }, [..._cache[15] || (_cache[15] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "map", -1),
                createTextVNode("地图 ", -1)
              ])], 2),
              createBaseVNode("button", {
                class: normalizeClass({ active: activeTab.value === "list" }),
                onClick: _cache[5] || (_cache[5] = ($event) => onTabChange("list"))
              }, [
                _cache[16] || (_cache[16] = createBaseVNode("span", { class: "material-symbols-outlined" }, "two_wheeler", -1)),
                _cache[17] || (_cache[17] = createTextVNode("车辆 ", -1)),
                unref(vehicles).length ? (openBlock(), createElementBlock("em", _hoisted_7, toDisplayString(unref(vehicles).length), 1)) : createCommentVNode("", true)
              ], 2),
              createBaseVNode("button", {
                class: normalizeClass({ active: activeTab.value === "area" }),
                onClick: _cache[6] || (_cache[6] = ($event) => onTabChange("area"))
              }, [..._cache[18] || (_cache[18] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "place", -1),
                createTextVNode("服务区 ", -1)
              ])], 2)
            ], 32)
          ]),
          default: withCtx(() => [
            withDirectives(createBaseVNode("section", _hoisted_8, [
              createBaseVNode("article", _hoisted_9, [
                _cache[21] || (_cache[21] = createBaseVNode("span", null, "地图状态", -1)),
                createBaseVNode("strong", null, toDisplayString(mapSubtitle.value), 1),
                createBaseVNode("p", null, "最近刷新 " + toDisplayString(scanTimeText.value) + " · " + toDisplayString(locationSourceText.value), 1),
                unref(lastFetchCenter) ? (openBlock(), createElementBlock("p", _hoisted_10, " 查车中心：" + toDisplayString(Number(unref(lastFetchCenter).latitude).toFixed(5)) + ", " + toDisplayString(Number(unref(lastFetchCenter).longitude).toFixed(5)), 1)) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_11, [
                  createBaseVNode("button", {
                    type: "button",
                    disabled: unref(locating),
                    onClick: _cache[8] || (_cache[8] = //@ts-ignore
                    (...args) => unref(refreshBySystemLocation) && unref(refreshBySystemLocation)(...args))
                  }, [
                    _cache[19] || (_cache[19] = createBaseVNode("span", { class: "material-symbols-outlined" }, "my_location", -1)),
                    createTextVNode(" " + toDisplayString(unref(locating) ? "定位中" : "重新定位"), 1)
                  ], 8, _hoisted_12),
                  createBaseVNode("button", {
                    type: "button",
                    disabled: unref(loadingMap),
                    onClick: _cache[9] || (_cache[9] = //@ts-ignore
                    (...args) => unref(refreshCurrentArea) && unref(refreshCurrentArea)(...args))
                  }, [..._cache[20] || (_cache[20] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "radar", -1),
                    createTextVNode(" 刷新视野 ", -1)
                  ])], 8, _hoisted_13)
                ])
              ])
            ], 512), [
              [vShow, activeTab.value === "map"]
            ]),
            withDirectives(createVNode(TowerGoVehicleList, {
              vehicles: unref(vehicles),
              "selected-id": unref(selectedVehicle)?.id || unref(selectedVehicle)?.imei || "",
              loading: unref(loadingMap) || unref(centerFetchInFlight),
              "error-message": unref(mapErrors)[0] || "",
              total: unref(vehicles).length,
              onSelect: onSelectVehicle
            }, null, 8, ["vehicles", "selected-id", "loading", "error-message", "total"]), [
              [vShow, activeTab.value === "list"]
            ]),
            withDirectives(createVNode(TowerGoServiceArea, {
              "service-name": serviceName.value,
              "service-id": unref(serviceId),
              "scan-time-text": scanTimeText.value,
              "current-location": unref(currentLocation),
              "location-source-text": locationSourceText.value,
              "last-fetch-center": unref(lastFetchCenter),
              "parking-list": parkingList.value,
              refreshing: unref(loadingMap) || unref(centerFetchInFlight)
            }, null, 8, ["service-name", "service-id", "scan-time-text", "current-location", "location-source-text", "last-fetch-center", "parking-list", "refreshing"]), [
              [vShow, activeTab.value === "area"]
            ])
          ]),
          _: 1
        }, 8, ["modelValue"])
      ]);
    };
  }
});
const TowerGoView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-ea4547fc"]]);
export {
  TowerGoView as default
};
