var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { m as onBeforeUnmount, a as ref, N as defineComponent, w as watch, o as onMounted, z as nextTick, c as createElementBlock, b as openBlock, q as createVNode, f as createCommentVNode, d as createBaseVNode, l as withCtx, u as unref, t as toDisplayString, C as withDirectives, D as vModelText, Q as isRef, n as normalizeClass, F as Fragment, i as renderList } from "./vue-core-DdLVj9yW.js";
import { r as resolveTowerGoLocation, H as HBUT_LOCATION } from "./towergo_map-DkOHuYT2.js";
import { C as CAMPUS_MAP_SCHEMA_VERSION, a as CAMPUS_MAP_MANIFEST_URL, b as CAMPUS_MAP_CACHE_KEY, c as CAMPUS_MAP_CACHE_TTL_MS, d as CAMPUS_MAP_FETCH_TIMEOUT_MS, l as loadTencentMap, T as TOWERGO_CONFIG, t as toTencentLatLng, f as formatWalkingDuration, e as formatWalkingDistance, g as fetchWalkingRoute, h as CAMPUS_LOCATION_DRIFT_THRESHOLD_METERS } from "./walking_route_service-DmXuyG7m.js";
import { g as getCachedData, b as setCachedData, s as showToast, _ as _export_sfc } from "./app-demo-CxKBY5JQ.js";
import { b as isTauriRuntime, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const BUILDING_CATEGORIES = /* @__PURE__ */ new Set([
  "teaching",
  "dormitory",
  "library",
  "canteen",
  "sports",
  "admin",
  "gate",
  "other"
]);
const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
};
const safeText$1 = (value) => String(value ?? "").trim();
const readSchemaVersion = (payload) => safeText$1(payload.schema_version || payload.schemaVersion);
class CampusMapSchemaError extends Error {
  constructor(message) {
    super(message);
    __publicField(this, "code", "campus_map_schema_error");
    this.name = "CampusMapSchemaError";
  }
}
const assertSchemaVersion = (payload, label) => {
  const version2 = readSchemaVersion(payload);
  if (version2 && version2 !== CAMPUS_MAP_SCHEMA_VERSION) {
    throw new CampusMapSchemaError(`${label} schema_version 不匹配（期望 ${CAMPUS_MAP_SCHEMA_VERSION}，实际 ${version2}）`);
  }
};
const parseBuilding = (raw, index) => {
  if (!raw || typeof raw !== "object") {
    throw new CampusMapSchemaError(`buildings[${index}] 不是有效对象`);
  }
  const item = raw;
  const id = safeText$1(item.id);
  const name = safeText$1(item.name);
  const category = safeText$1(item.category);
  const lat = toNumber(item.lat);
  const lng = toNumber(item.lng);
  if (!id) throw new CampusMapSchemaError(`buildings[${index}].id 不能为空`);
  if (!name) throw new CampusMapSchemaError(`buildings[${index}].name 不能为空`);
  if (!BUILDING_CATEGORIES.has(category)) {
    throw new CampusMapSchemaError(`buildings[${index}].category 非法：${category || "(empty)"}`);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new CampusMapSchemaError(`buildings[${index}] 坐标无效`);
  }
  const aliases = Array.isArray(item.aliases) ? item.aliases.map((entry) => safeText$1(entry)).filter(Boolean) : void 0;
  const tags = Array.isArray(item.tags) ? item.tags.map((entry) => safeText$1(entry)).filter(Boolean) : void 0;
  const meta = item.meta && typeof item.meta === "object" ? Object.fromEntries(
    Object.entries(item.meta).map(([key, value]) => [key, safeText$1(value)])
  ) : void 0;
  return {
    id,
    name,
    aliases: aliases?.length ? aliases : void 0,
    category,
    lat,
    lng,
    campus_id: safeText$1(item.campus_id || item.campusId) || void 0,
    tags: tags?.length ? tags : void 0,
    meta: meta && Object.keys(meta).length ? meta : void 0
  };
};
const parseCampusBuildingsPayload = (payload) => {
  if (Array.isArray(payload)) {
    return payload.map((item, index) => parseBuilding(item, index));
  }
  if (!payload || typeof payload !== "object") {
    throw new CampusMapSchemaError("buildings 数据格式无效");
  }
  const obj = payload;
  assertSchemaVersion(obj, "buildings");
  const list = obj.buildings;
  if (!Array.isArray(list) || !list.length) {
    throw new CampusMapSchemaError("buildings 列表为空");
  }
  return list.map((item, index) => parseBuilding(item, index));
};
const parseCampusMapConfig = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new CampusMapSchemaError("config 数据格式无效");
  }
  const obj = payload;
  assertSchemaVersion(obj, "config");
  const centerRaw = obj.center;
  const lat = toNumber(centerRaw?.lat);
  const lng = toNumber(centerRaw?.lng);
  const defaultZoom = toNumber(obj.default_zoom ?? obj.defaultZoom);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new CampusMapSchemaError("config.center 坐标无效");
  }
  if (!Number.isFinite(defaultZoom)) {
    throw new CampusMapSchemaError("config.default_zoom 无效");
  }
  let bounds2;
  const boundsRaw = obj.bounds;
  if (boundsRaw && typeof boundsRaw === "object") {
    const sw = boundsRaw.sw;
    const ne = boundsRaw.ne;
    const swLat = toNumber(sw?.lat);
    const swLng = toNumber(sw?.lng);
    const neLat = toNumber(ne?.lat);
    const neLng = toNumber(ne?.lng);
    if ([swLat, swLng, neLat, neLng].every(Number.isFinite)) {
      bounds2 = { sw: { lat: swLat, lng: swLng }, ne: { lat: neLat, lng: neLng } };
    }
  }
  return {
    version: safeText$1(obj.version) || "unknown",
    center: { lat, lng },
    default_zoom: defaultZoom,
    bounds: bounds2,
    map_style_id: safeText$1(obj.map_style_id || obj.mapStyleId) || void 0
  };
};
const parseCampusMapManifest = (payload) => {
  if (!payload || typeof payload !== "object") {
    throw new CampusMapSchemaError("manifest 数据格式无效");
  }
  const obj = payload;
  assertSchemaVersion(obj, "manifest");
  const version2 = safeText$1(obj.version);
  const buildingsUrl = safeText$1(obj.buildings_url || obj.buildingsUrl);
  const configUrl = safeText$1(obj.config_url || obj.configUrl);
  if (!version2) throw new CampusMapSchemaError("manifest.version 不能为空");
  if (!buildingsUrl) throw new CampusMapSchemaError("manifest.buildings_url 不能为空");
  if (!configUrl) throw new CampusMapSchemaError("manifest.config_url 不能为空");
  return {
    version: version2,
    buildings_url: buildingsUrl,
    config_url: configUrl,
    updated_at: safeText$1(obj.updated_at || obj.updatedAt) || void 0
  };
};
const schema_version$2 = "1";
const buildings = [
  {
    id: "library",
    name: "图书馆",
    aliases: [
      "湖工图书馆"
    ],
    category: "library",
    lat: 30.4826,
    lng: 114.3128,
    tags: [
      "自习",
      "借阅"
    ]
  },
  {
    id: "j1",
    name: "教学1号楼",
    aliases: [
      "一教",
      "1教"
    ],
    category: "teaching",
    lat: 30.4812,
    lng: 114.3115
  },
  {
    id: "j2",
    name: "教学2号楼",
    aliases: [
      "二教",
      "2教"
    ],
    category: "teaching",
    lat: 30.4808,
    lng: 114.3126
  },
  {
    id: "j3",
    name: "教学3号楼",
    aliases: [
      "三教",
      "3教"
    ],
    category: "teaching",
    lat: 30.4815,
    lng: 114.3142
  },
  {
    id: "j4",
    name: "教学4号楼",
    aliases: [
      "四教",
      "4教"
    ],
    category: "teaching",
    lat: 30.4821,
    lng: 114.3151
  },
  {
    id: "gym",
    name: "体育馆",
    category: "sports",
    lat: 30.4834,
    lng: 114.3109
  },
  {
    id: "canteen-n",
    name: "北区食堂",
    aliases: [
      "北食堂"
    ],
    category: "canteen",
    lat: 30.4838,
    lng: 114.3136
  },
  {
    id: "canteen-s",
    name: "南区食堂",
    aliases: [
      "南食堂"
    ],
    category: "canteen",
    lat: 30.4796,
    lng: 114.3148
  },
  {
    id: "admin",
    name: "行政楼",
    category: "admin",
    lat: 30.4819,
    lng: 114.313
  },
  {
    id: "gate-south",
    name: "南门",
    category: "gate",
    lat: 30.4788,
    lng: 114.3134
  },
  {
    id: "gate-north",
    name: "北门",
    category: "gate",
    lat: 30.4852,
    lng: 114.3122
  },
  {
    id: "dorm-1",
    name: "1号学生公寓",
    category: "dormitory",
    lat: 30.4846,
    lng: 114.3158
  },
  {
    id: "dorm-2",
    name: "2号学生公寓",
    category: "dormitory",
    lat: 30.4841,
    lng: 114.3168
  }
];
const fallbackBuildings = {
  schema_version: schema_version$2,
  buildings
};
const schema_version$1 = "1";
const version$1 = "2026.07.05";
const center = {
  lat: 30.4819,
  lng: 114.313
};
const default_zoom = 17;
const bounds = {
  sw: {
    lat: 30.4775,
    lng: 114.3075
  },
  ne: {
    lat: 30.4865,
    lng: 114.3185
  }
};
const fallbackConfig = {
  schema_version: schema_version$1,
  version: version$1,
  center,
  default_zoom,
  bounds
};
const schema_version = "1";
const version = "2026.07.05";
const buildings_url = "./buildings.json";
const config_url = "./config.json";
const updated_at = "2026-07-05T00:00:00Z";
const fallbackManifest = {
  schema_version,
  version,
  buildings_url,
  config_url,
  updated_at
};
const safeText = (value) => String(value ?? "").trim();
const withCacheBust = (url) => {
  const text = safeText(url);
  if (!text) return "";
  const joiner = text.includes("?") ? "&" : "?";
  return `${text}${joiner}_t=${Date.now()}`;
};
const toAbsoluteUrl = (value, base) => {
  const raw = safeText(value);
  if (!raw) return "";
  try {
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
};
const withTimeout = async (promise, ms = CAMPUS_MAP_FETCH_TIMEOUT_MS) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("campus-map-fetch-timeout")), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const fetchJsonNoStore = async (url) => {
  const requestUrl = withCacheBust(url);
  if (isTauriRuntime()) {
    return withTimeout(invokeNative("fetch_remote_json", { url: requestUrl }));
  }
  const response = await withTimeout(
    fetch(requestUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    })
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};
const readBundleCache = () => getCachedData(CAMPUS_MAP_CACHE_KEY, CAMPUS_MAP_CACHE_TTL_MS);
const buildFallbackBundle = (reason) => ({
  manifest: parseCampusMapManifest(fallbackManifest),
  config: parseCampusMapConfig(fallbackConfig),
  buildings: parseCampusBuildingsPayload(fallbackBuildings),
  fromCache: false,
  offline: true,
  ...reason ? { degradedReason: reason } : {}
});
const fetchCampusMapDataset = async ({
  forceRefresh = false
} = {}) => {
  const cached = readBundleCache();
  if (!forceRefresh && cached?.data?.buildings?.length) {
    return {
      ...cached.data,
      fromCache: true,
      offline: Boolean(cached.data.offline)
    };
  }
  try {
    const manifestRaw = await fetchJsonNoStore(CAMPUS_MAP_MANIFEST_URL);
    const manifest = parseCampusMapManifest(manifestRaw);
    const manifestBase = CAMPUS_MAP_MANIFEST_URL.replace(/\/[^/]+$/, "/");
    const buildingsUrl = toAbsoluteUrl(manifest.buildings_url, manifestBase);
    const configUrl = toAbsoluteUrl(manifest.config_url, manifestBase);
    const [buildingsRaw, configRaw] = await Promise.all([
      fetchJsonNoStore(buildingsUrl),
      fetchJsonNoStore(configUrl)
    ]);
    const bundle = {
      manifest,
      config: parseCampusMapConfig(configRaw),
      buildings: parseCampusBuildingsPayload(buildingsRaw),
      fromCache: false,
      offline: false
    };
    setCachedData(CAMPUS_MAP_CACHE_KEY, bundle);
    return bundle;
  } catch (error) {
    const message = error instanceof CampusMapSchemaError ? error.message : error?.message || "校园地图数据加载失败";
    if (cached?.data?.buildings?.length) {
      return {
        ...cached.data,
        fromCache: true,
        offline: true,
        degradedReason: message
      };
    }
    return {
      ...buildFallbackBundle(message),
      degradedReason: message
    };
  }
};
const normalize = (value) => value.trim().toLowerCase();
const searchCampusBuildings = (buildings2, query, limit = 20) => {
  const keyword = normalize(query);
  if (!keyword) return buildings2.slice(0, limit);
  const scored = buildings2.map((building) => {
    const haystacks = [building.name, ...building.aliases || [], ...building.tags || []];
    const normalized = haystacks.map(normalize);
    const exact = normalized.some((item) => item === keyword);
    const starts = normalized.some((item) => item.startsWith(keyword));
    const includes = normalized.some((item) => item.includes(keyword));
    if (!includes) return null;
    const score = exact ? 0 : starts ? 1 : 2;
    return { building, score };
  }).filter(Boolean);
  return scored.sort((a, b) => a.score - b.score || a.building.name.localeCompare(b.building.name, "zh-CN")).slice(0, limit).map((item) => item.building);
};
const getBuildingCategoryLabel = (category) => {
  const labels = {
    teaching: "教学楼",
    dormitory: "宿舍",
    library: "图书馆",
    canteen: "食堂",
    sports: "体育",
    admin: "行政",
    gate: "校门",
    other: "其他"
  };
  return labels[category] || "其他";
};
const CATEGORY_COLORS = {
  library: "#2563eb",
  teaching: "#0d9488",
  canteen: "#ea580c",
  dorm: "#7c3aed",
  sports: "#16a34a",
  gate: "#b45309",
  service: "#64748b"
};
const pinSvg = (label, fill) => {
  const text = String(label || "").slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
    <path d="M20 2C11.7 2 5 8.7 5 17c0 11.2 15 29 15 29s15-17.8 15-29C35 8.7 28.3 2 20 2z" fill="${fill}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="20" cy="17" r="7" fill="#fff"/>
    <text x="20" y="20" text-anchor="middle" font-size="9" font-weight="700" fill="${fill}" font-family="sans-serif">${text}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};
const userDotSvg = () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="9" fill="#007AFF" stroke="#ffffff" stroke-width="3"/>
    <circle cx="20" cy="20" r="16" fill="none" stroke="#007AFF" stroke-opacity="0.28" stroke-width="4"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};
const campusBuildingStyleId = (building) => `bldg-${building.category || "default"}-${building.id}`;
const campusUserLocationStyleId = () => "user-location";
const plainMarkerStyle = (opts) => ({ ...opts });
const buildCampusBuildingMarkerStyles = (TMap, buildings2) => {
  const styles = {};
  const makeStyle = typeof TMap.MarkerStyle === "function" ? (opts) => new TMap.MarkerStyle(opts) : plainMarkerStyle;
  styles[campusUserLocationStyleId()] = makeStyle({
    width: 32,
    height: 32,
    anchor: { x: 16, y: 16 },
    src: userDotSvg()
  });
  for (const building of buildings2 || []) {
    const fill = CATEGORY_COLORS[String(building.category || "")] || "#0074CF";
    const styleId = campusBuildingStyleId(building);
    styles[styleId] = makeStyle({
      width: 34,
      height: 40,
      anchor: { x: 17, y: 40 },
      src: pinSvg(building.name, fill)
    });
  }
  return styles;
};
const CAMPUS_MAP_CONTAINER_CLASS = "campus-map-tencent-host";
const injectCampusMapStyles = () => {
  if (typeof document === "undefined") return;
  const id = "campus-map-tencent-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
.${CAMPUS_MAP_CONTAINER_CLASS} {
  width: 100%;
  height: 100%;
  border-radius: 16px;
  overflow: hidden;
  background: var(--ui-surface-muted, #e5e7eb);
}
.${CAMPUS_MAP_CONTAINER_CLASS} .tmap-zoom-control,
.${CAMPUS_MAP_CONTAINER_CLASS} .tmap-control-container {
  filter: none;
}
html.dark .${CAMPUS_MAP_CONTAINER_CLASS} {
  filter: brightness(0.92) saturate(0.95);
}
`;
  document.head.appendChild(style);
};
class CampusMapController {
  constructor() {
    __publicField(this, "map", null);
    __publicField(this, "TMap", null);
    __publicField(this, "buildingLayer", null);
    __publicField(this, "routeLayer", null);
    __publicField(this, "userLayer", null);
    __publicField(this, "buildings", []);
    __publicField(this, "onMarkerClick", null);
  }
  async init(container, config) {
    if (!container.offsetWidth || !container.offsetHeight) {
      throw new Error("地图容器尺寸无效");
    }
    injectCampusMapStyles();
    container.classList.add(CAMPUS_MAP_CONTAINER_CLASS);
    this.TMap = await loadTencentMap(TOWERGO_CONFIG.qqMapKey);
    const center2 = toTencentLatLng(this.TMap, config.center);
    this.map = new this.TMap.Map(container, {
      center: center2,
      zoom: config.default_zoom,
      viewMode: "2D",
      baseMap: { type: "vector" }
    });
    if (config.bounds) {
      const bounds2 = new this.TMap.LatLngBounds(
        toTencentLatLng(this.TMap, config.bounds.sw),
        toTencentLatLng(this.TMap, config.bounds.ne)
      );
      this.map.fitBounds(bounds2, { padding: 48 });
    }
  }
  destroy() {
    this.buildingLayer?.setMap?.(null);
    this.routeLayer?.setMap?.(null);
    this.userLayer?.setMap?.(null);
    this.buildingLayer = null;
    this.routeLayer = null;
    this.userLayer = null;
    this.map?.destroy?.();
    this.map = null;
    this.TMap = null;
  }
  setMarkerClickHandler(handler) {
    this.onMarkerClick = handler;
  }
  setBuildings(buildings2) {
    this.buildings = buildings2;
    if (!this.map || !this.TMap) return;
    const styles = buildCampusBuildingMarkerStyles(this.TMap, buildings2);
    const geometries = buildings2.filter((building) => Number.isFinite(building.lat) && Number.isFinite(building.lng)).map((building) => ({
      id: building.id,
      styleId: campusBuildingStyleId(building),
      position: toTencentLatLng(this.TMap, { lat: building.lat, lng: building.lng }),
      properties: { title: building.name, category: building.category }
    }));
    if (!this.buildingLayer) {
      this.buildingLayer = new this.TMap.MultiMarker({
        map: this.map,
        styles,
        geometries,
        zIndex: 120
      });
      this.buildingLayer.on?.("click", (event) => {
        const id = event?.geometry?.id;
        const target = this.buildings.find((item) => item.id === id);
        if (target) this.onMarkerClick?.(target);
      });
      return;
    }
    this.buildingLayer.setStyles?.(styles);
    this.buildingLayer.setGeometries?.(geometries);
  }
  focusBuilding(building, zoom = 18) {
    if (!this.map || !this.TMap) return;
    this.map.setCenter(toTencentLatLng(this.TMap, { lat: building.lat, lng: building.lng }));
    this.map.setZoom(zoom);
  }
  setUserLocation(point) {
    if (!this.map || !this.TMap) return;
    const styles = buildCampusBuildingMarkerStyles(this.TMap, []);
    const geometry = {
      id: "user-location",
      styleId: campusUserLocationStyleId(),
      position: toTencentLatLng(this.TMap, point),
      properties: { title: "我的位置" }
    };
    if (!this.userLayer) {
      this.userLayer = new this.TMap.MultiMarker({
        map: this.map,
        styles,
        geometries: [geometry],
        zIndex: 40
      });
      return;
    }
    this.userLayer.setStyles?.(styles);
    this.userLayer.setGeometries?.([geometry]);
  }
  setRoutePolyline(points) {
    if (!this.map || !this.TMap) return;
    if (!points.length) {
      this.routeLayer?.setGeometries?.([]);
      return;
    }
    const paths = points.map((point) => toTencentLatLng(this.TMap, point));
    const geometry = { id: "walking-route", styleId: "route", paths };
    const styles = {
      route: {
        color: "#6366f1",
        width: 6,
        borderColor: "#ffffff",
        borderWidth: 2,
        lineCap: "round"
      }
    };
    if (!this.routeLayer) {
      this.routeLayer = new this.TMap.MultiPolyline({
        map: this.map,
        geometries: [geometry],
        styles
      });
      return;
    }
    this.routeLayer.setStyles?.(styles);
    this.routeLayer.setGeometries?.([geometry]);
  }
  clearRoute() {
    this.routeLayer?.setGeometries?.([]);
  }
}
const useCampusMap = () => {
  const loading = ref(true);
  const mapReady = ref(false);
  const errorText = ref("");
  const degradedText = ref("");
  const bundle = ref(null);
  const searchQuery = ref("");
  const searchResults = ref([]);
  const selectedBuilding = ref(null);
  const userLocation = ref({ lat: HBUT_LOCATION.latitude, lng: HBUT_LOCATION.longitude });
  const routeLoading = ref(false);
  const routeError = ref("");
  const routeResult = ref(null);
  const controller = new CampusMapController();
  let routeAbort = null;
  const applySearch = () => {
    const buildings2 = bundle.value?.buildings || [];
    searchResults.value = searchCampusBuildings(buildings2, searchQuery.value);
  };
  const loadDataset = async (forceRefresh = false) => {
    loading.value = true;
    errorText.value = "";
    try {
      const data = await fetchCampusMapDataset({ forceRefresh });
      bundle.value = data;
      degradedText.value = data.degradedReason || (data.offline ? "当前使用离线/缓存数据" : "");
      controller.setBuildings(data.buildings);
      applySearch();
    } catch (error) {
      errorText.value = error?.message || "校园地图加载失败";
    } finally {
      loading.value = false;
    }
  };
  const initMap = async (container) => {
    if (!container || !bundle.value) return;
    try {
      await controller.init(container, bundle.value.config);
      controller.setBuildings(bundle.value.buildings);
      controller.setMarkerClickHandler((building) => selectBuilding(building));
      controller.setUserLocation(userLocation.value);
      mapReady.value = true;
    } catch (error) {
      errorText.value = error?.message || "地图初始化失败";
      mapReady.value = false;
    }
  };
  const destroyMap = () => {
    controller.destroy();
    mapReady.value = false;
  };
  const refreshLocation = async () => {
    const resolved = await resolveTowerGoLocation({
      fallback: HBUT_LOCATION,
      maxDriftMeters: CAMPUS_LOCATION_DRIFT_THRESHOLD_METERS,
      maximumAge: 0,
      timeoutMs: 12e3
    });
    userLocation.value = { lat: resolved.latitude, lng: resolved.longitude };
    controller.setUserLocation(userLocation.value);
    return resolved;
  };
  const selectBuilding = (building) => {
    selectedBuilding.value = building;
    controller.focusBuilding(building);
    routeResult.value = null;
    routeError.value = "";
    controller.clearRoute();
  };
  const clearSelection = () => {
    selectedBuilding.value = null;
    routeResult.value = null;
    routeError.value = "";
    controller.clearRoute();
  };
  const planWalkingRoute = async () => {
    if (!selectedBuilding.value) return;
    routeAbort?.abort();
    routeAbort = new AbortController();
    routeLoading.value = true;
    routeError.value = "";
    try {
      await refreshLocation();
      const result = await fetchWalkingRoute(userLocation.value, {
        lat: selectedBuilding.value.lat,
        lng: selectedBuilding.value.lng
      }, { signal: routeAbort.signal });
      routeResult.value = result;
      controller.setRoutePolyline(result.polyline);
    } catch (error) {
      if (error?.name === "AbortError") return;
      routeError.value = error?.message || "步行路线规划失败";
      controller.clearRoute();
    } finally {
      routeLoading.value = false;
    }
  };
  onBeforeUnmount(() => {
    routeAbort?.abort();
    destroyMap();
  });
  return {
    loading,
    mapReady,
    errorText,
    degradedText,
    bundle,
    searchQuery,
    searchResults,
    selectedBuilding,
    userLocation,
    routeLoading,
    routeError,
    routeResult,
    loadDataset,
    initMap,
    destroyMap,
    refreshLocation,
    applySearch,
    selectBuilding,
    clearSelection,
    planWalkingRoute,
    formatWalkingDistance,
    formatWalkingDuration
  };
};
const _hoisted_1 = { class: "campus-map-view" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = {
  key: 0,
  class: "status-banner warn"
};
const _hoisted_4 = {
  key: 1,
  class: "status-banner error"
};
const _hoisted_5 = {
  key: 2,
  class: "status-banner warn"
};
const _hoisted_6 = { class: "search-panel" };
const _hoisted_7 = { class: "map-shell" };
const _hoisted_8 = {
  key: 0,
  class: "map-placeholder"
};
const _hoisted_9 = {
  key: 3,
  class: "detail-card"
};
const _hoisted_10 = { class: "detail-head" };
const _hoisted_11 = {
  key: 0,
  class: "detail-meta"
};
const _hoisted_12 = { class: "detail-actions" };
const _hoisted_13 = ["disabled"];
const _hoisted_14 = {
  key: 1,
  class: "route-error"
};
const _hoisted_15 = {
  key: 2,
  class: "route-meta"
};
const _hoisted_16 = { class: "results-panel" };
const _hoisted_17 = { class: "results-head" };
const _hoisted_18 = { class: "results-list" };
const _hoisted_19 = ["onClick"];
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "CampusMapView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const mapContainerRef = ref(null);
    const {
      loading,
      mapReady,
      errorText,
      degradedText,
      bundle,
      searchQuery,
      searchResults,
      selectedBuilding,
      routeLoading,
      routeError,
      routeResult,
      loadDataset,
      initMap,
      refreshLocation,
      applySearch,
      selectBuilding,
      clearSelection,
      planWalkingRoute,
      formatWalkingDistance: formatWalkingDistance2,
      formatWalkingDuration: formatWalkingDuration2
    } = useCampusMap();
    const handleRefresh = async () => {
      await loadDataset(true);
      if (mapContainerRef.value && bundle.value) {
        await initMap(mapContainerRef.value);
      }
      showToast("地图数据已刷新");
    };
    watch(searchQuery, () => applySearch());
    onMounted(async () => {
      await refreshLocation();
      await loadDataset(false);
      await nextTick();
      await initMap(mapContainerRef.value);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: "校园地图",
          icon: "map",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "header-action",
              type: "button",
              disabled: unref(loading),
              onClick: handleRefresh
            }, toDisplayString(unref(loading) ? "加载中" : "刷新"), 9, _hoisted_2)
          ]),
          _: 1
        }),
        unref(degradedText) ? (openBlock(), createElementBlock("section", _hoisted_3, toDisplayString(unref(degradedText)), 1)) : createCommentVNode("", true),
        unref(errorText) ? (openBlock(), createElementBlock("section", _hoisted_4, toDisplayString(unref(errorText)), 1)) : unref(mapReady) && unref(bundle) && !unref(bundle).buildings?.length ? (openBlock(), createElementBlock("section", _hoisted_5, " 暂无建筑点位数据，请点击刷新或检查网络 ")) : createCommentVNode("", true),
        createBaseVNode("section", _hoisted_6, [
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => isRef(searchQuery) ? searchQuery.value = $event : null),
            class: "search-input",
            type: "search",
            placeholder: "搜索教学楼、食堂、图书馆...",
            autocomplete: "off"
          }, null, 512), [
            [vModelText, unref(searchQuery)]
          ]),
          createBaseVNode("button", {
            class: "locate-btn",
            type: "button",
            onClick: _cache[2] || (_cache[2] = //@ts-ignore
            (...args) => unref(refreshLocation) && unref(refreshLocation)(...args))
          }, "定位")
        ]),
        createBaseVNode("section", _hoisted_7, [
          createBaseVNode("div", {
            ref_key: "mapContainerRef",
            ref: mapContainerRef,
            class: normalizeClass(["map-host", { ready: unref(mapReady) }])
          }, null, 2),
          !unref(mapReady) && !unref(errorText) ? (openBlock(), createElementBlock("div", _hoisted_8, "地图加载中...")) : createCommentVNode("", true)
        ]),
        unref(selectedBuilding) ? (openBlock(), createElementBlock("section", _hoisted_9, [
          createBaseVNode("div", _hoisted_10, [
            createBaseVNode("div", null, [
              createBaseVNode("h3", null, toDisplayString(unref(selectedBuilding).name), 1),
              createBaseVNode("p", null, toDisplayString(unref(getBuildingCategoryLabel)(unref(selectedBuilding).category)), 1)
            ]),
            createBaseVNode("button", {
              class: "ghost-btn",
              type: "button",
              onClick: _cache[3] || (_cache[3] = //@ts-ignore
              (...args) => unref(clearSelection) && unref(clearSelection)(...args))
            }, "关闭")
          ]),
          unref(selectedBuilding).aliases?.length ? (openBlock(), createElementBlock("p", _hoisted_11, " 别名：" + toDisplayString(unref(selectedBuilding).aliases.join("、")), 1)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_12, [
            createBaseVNode("button", {
              class: "primary-btn",
              type: "button",
              disabled: unref(routeLoading),
              onClick: _cache[4] || (_cache[4] = //@ts-ignore
              (...args) => unref(planWalkingRoute) && unref(planWalkingRoute)(...args))
            }, toDisplayString(unref(routeLoading) ? "规划中..." : "步行导航"), 9, _hoisted_13)
          ]),
          unref(routeError) ? (openBlock(), createElementBlock("p", _hoisted_14, toDisplayString(unref(routeError)), 1)) : unref(routeResult) ? (openBlock(), createElementBlock("p", _hoisted_15, " 约 " + toDisplayString(unref(formatWalkingDistance2)(unref(routeResult).distanceMeters)) + " · " + toDisplayString(unref(formatWalkingDuration2)(unref(routeResult).durationSeconds)), 1)) : createCommentVNode("", true)
        ])) : createCommentVNode("", true),
        createBaseVNode("section", _hoisted_16, [
          createBaseVNode("div", _hoisted_17, [
            _cache[5] || (_cache[5] = createBaseVNode("h2", null, "建筑列表", -1)),
            createBaseVNode("span", null, toDisplayString(unref(searchResults).length) + " 个结果", 1)
          ]),
          createBaseVNode("ul", _hoisted_18, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(searchResults), (item) => {
              return openBlock(), createElementBlock("li", {
                key: item.id
              }, [
                createBaseVNode("button", {
                  type: "button",
                  class: "result-item",
                  onClick: ($event) => unref(selectBuilding)(item)
                }, [
                  createBaseVNode("strong", null, toDisplayString(item.name), 1),
                  createBaseVNode("span", null, toDisplayString(unref(getBuildingCategoryLabel)(item.category)), 1)
                ], 8, _hoisted_19)
              ]);
            }), 128))
          ])
        ])
      ]);
    };
  }
});
const CampusMapView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-2464512c"]]);
export {
  CampusMapView as default
};
