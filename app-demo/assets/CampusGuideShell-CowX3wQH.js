var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { H as HBUT_LOCATION, n as normalizePoint } from "./towergo_map-DkOHuYT2.js";
import { resolveCampusGuideBaseUrl, CAMPUS_GUIDE_CONFIG, readCampusGuideMode, writeCampusGuideMode } from "./config-D40V78Q-.js";
import { u as useGeolocation } from "./useGeolocation-D7J63RN2.js";
import { Q as isLiveLocationAllowed } from "./more-modules-CsUTdMqs.js";
import { p as pushDebugLog } from "./runtime-bridge-apFQ0nCw.js";
import { r as reactive, e as computed, N as defineComponent, c as createElementBlock, b as openBlock, q as createVNode, d as createBaseVNode, u as unref, s as renderSlot, k as createBlock, l as withCtx, t as toDisplayString, o as onMounted, F as Fragment, i as renderList, f as createCommentVNode, z as nextTick, a as ref, m as onBeforeUnmount, n as normalizeClass, w as watch, O as onActivated, h as normalizeStyle, C as withDirectives, D as vModelText, g as createTextVNode, K as vModelSelect, j as withModifiers, P as KeepAlive } from "./vue-core-DdLVj9yW.js";
import { _ as _sfc_main$u } from "./TPageHeader-D5pZCgZr.js";
import { o as openExternal, s as showToast } from "./app-demo-CxKBY5JQ.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const CAMPUS_GUIDE_VIEWS = Object.freeze({
  hub: "hub",
  home: "home",
  settings: "settings",
  search: "search",
  walkline: "walkline",
  poi: "poi",
  route: "route",
  roadmap: "roadmap",
  bus: "bus",
  activity: "activity",
  activityDetail: "activity-detail",
  notice: "notice",
  noticeDetail: "notice-detail",
  about: "about",
  collect: "collect",
  mockLocation: "mock-location",
  yunyouIntro: "yunyou-intro",
  yunyouDetail: "yunyou-detail",
  yunyouClue: "yunyou-clue",
  yunyouSignature: "yunyou-signature",
  punchHome: "punch-home",
  punchMap: "punch-map",
  punchPostcard: "punch-postcard",
  punchAlumniCard: "punch-alumni-card",
  punchMy: "punch-my"
});
const CAMPUS_GUIDE_VIEW_TITLES = {
  hub: "湖工大导览",
  home: "校园导览",
  settings: "导览设置",
  search: "搜索地点",
  walkline: "步行导航",
  poi: "地点详情",
  route: "游览路线",
  roadmap: "路线地图",
  bus: "班车路线",
  activity: "校园活动",
  "activity-detail": "活动详情",
  notice: "通知公告",
  "notice-detail": "公告详情",
  about: "校园概况",
  collect: "我的收藏",
  "mock-location": "模拟定位",
  "yunyou-intro": "云游打卡",
  "yunyou-detail": "云游文化衫",
  "yunyou-clue": "云游线索",
  "yunyou-signature": "文化衫签名",
  "punch-home": "校庆打卡",
  "punch-map": "地图打卡",
  "punch-postcard": "校庆明信片",
  "punch-alumni-card": "校友卡",
  "punch-my": "我的校庆"
};
const KNOWN_VIEWS = new Set(Object.values(CAMPUS_GUIDE_VIEWS));
const isKnownCampusGuideView = (view) => KNOWN_VIEWS.has(view);
const EARTH_RADIUS = 6378137;
const distanceMeters = (from, to) => {
  const lat1 = from.latitude * Math.PI / 180;
  const lat2 = to.latitude * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLng = (to.longitude - from.longitude) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const distanceUnit = (meters, prefix = "距你") => {
  if (!Number.isFinite(meters) || meters <= 0) return `${prefix}0米`;
  if (meters < 1e3) return `${prefix}${Math.round(meters)}米`;
  return `${prefix}${(Math.round(meters / 100) / 10).toFixed(1)}公里`;
};
const isPointInPolygon = (point, polygon) => {
  if (!point || !polygon?.length) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].latitude;
    const xi = polygon[i].longitude;
    const yj = polygon[j].latitude;
    const xj = polygon[j].longitude;
    const intersects = xi > point.longitude !== xj > point.longitude && point.latitude < (yj - yi) * (point.longitude - xi) / (xj - xi) + yi;
    if (intersects) inside = !inside;
  }
  return inside;
};
const isPointInAoi = (point, rings) => {
  if (!rings?.length) return false;
  return rings.some((ring) => isPointInPolygon(point, ring));
};
const toNumber$1 = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
};
const parseAoiRing = (ring) => String(ring || "").split(";").map((segment) => {
  const [lng, lat] = segment.split(",").map((part) => Number(part.trim()));
  return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;
}).filter(Boolean);
const buildScenicTags = (raw) => {
  if (!raw || typeof raw !== "object") return [];
  const data = raw;
  if (Array.isArray(data.tags) && data.tags.length) {
    return data.tags;
  }
  const tagSetMap = Array.isArray(data.tag_set_map) ? data.tag_set_map : [];
  const tagSet = Array.isArray(data.tag_set) ? data.tag_set.map(String) : [];
  if (!tagSetMap.length || !tagSet.length) return [];
  const tags = [];
  for (const tagKey of tagSet) {
    for (const item of tagSetMap) {
      if (item?.tag === tagKey) tags.push(item);
    }
  }
  return tags;
};
const normalizeScenicInfo = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  const aoiRaw = data.aoi;
  let aoi;
  if (Array.isArray(aoiRaw)) {
    aoi = aoiRaw.map((item) => {
      if (typeof item === "string") return parseAoiRing(item);
      if (Array.isArray(item)) {
        return item.map((point) => {
          if (!point || typeof point !== "object") return null;
          const obj = point;
          const lat = toNumber$1(obj.latitude ?? obj.lat);
          const lng = toNumber$1(obj.longitude ?? obj.lng ?? obj.lon);
          return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;
        }).filter(Boolean);
      }
      return [];
    });
  }
  return {
    ...data,
    scenic_id: data.scenic_id ?? data.id,
    latitude: toNumber$1(data.latitude),
    longitude: toNumber$1(data.longitude),
    introduction: data.introduction ? String(data.introduction) : void 0,
    screen_url: data.screen_url ? String(data.screen_url) : void 0,
    aoi
  };
};
const toCoord$1 = (value) => {
  const num = toNumber$1(value);
  if (!Number.isFinite(num)) return NaN;
  if (Math.abs(num) > 1e3) return num / 1e6;
  return num;
};
const normalizeSpot = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const data = raw;
  const location = data.location && typeof data.location === "object" ? data.location : data.point && typeof data.point === "object" ? data.point : data.latlng && typeof data.latlng === "object" ? data.latlng : void 0;
  let lat = toCoord$1(location?.lat ?? location?.latitude ?? data.latitude ?? data.lat);
  let lng = toCoord$1(
    location?.lon ?? location?.lng ?? location?.longitude ?? data.longitude ?? data.lng ?? data.lon
  );
  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && typeof data.location === "string") {
    const parts = data.location.split(/[,，\s]+/).map((p) => toCoord$1(p.trim()));
    if (parts.length >= 2 && parts.every(Number.isFinite)) {
      if (Math.abs(parts[0]) <= 90 && Math.abs(parts[1]) <= 180) {
        lat = parts[0];
        lng = parts[1];
      } else if (Math.abs(parts[1]) <= 90 && Math.abs(parts[0]) <= 180) {
        lat = parts[1];
        lng = parts[0];
      }
    }
  }
  const spotId = data.spot_id ?? data.id;
  const name = String(data.name ?? data.title ?? "").trim();
  if (!spotId || !name) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    spot_id: spotId,
    name,
    category: data.category ? String(data.category) : void 0,
    marker_type: data.marker_type ? String(data.marker_type) : data.map_type ? String(data.map_type) : void 0,
    latitude: lat,
    longitude: lng,
    point: { latitude: lat, longitude: lng },
    distance: toNumber$1(data.distance),
    distancer: data.distancer ? String(data.distancer) : void 0,
    introduction: data.introduction ? String(data.introduction) : void 0,
    info: data.info ? String(data.info) : void 0,
    pic: data.pic,
    speech: data.speech,
    is_saved: Boolean(data.is_saved),
    raw
  };
};
const normalizeSpotList = (raw) => {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw;
  const list = Array.isArray(obj.list) ? obj.list : Array.isArray(raw) ? raw : [];
  return list.map(normalizeSpot).filter(Boolean);
};
const scenicCenter = (scenic, fallback) => {
  const lat = toNumber$1(scenic?.latitude);
  const lng = toNumber$1(scenic?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { latitude: lat, longitude: lng, name: scenic?.name || fallback.name };
  }
  return fallback;
};
const parseRoadPointText = (raw) => {
  const text = String(raw || "").trim();
  if (!text) return [];
  try {
    if (Array.isArray(raw)) {
      return raw.map((segment) => {
        if (Array.isArray(segment)) {
          return segment.map((point) => {
            if (!point || typeof point !== "object") return null;
            const obj = point;
            const lat = toNumber$1(obj.latitude ?? obj.lat);
            const lng = toNumber$1(obj.longitude ?? obj.lng ?? obj.lon);
            return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;
          }).filter(Boolean);
        }
        return [];
      }).filter((segment) => segment.length >= 2);
    }
  } catch {
  }
  return text.split("&").map(
    (segment) => segment.split(";").map((pair) => {
      const [lat, lng] = pair.split(",").map((part) => Number(part.trim()));
      return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;
    }).filter(Boolean)
  ).filter((segment) => segment.length >= 2);
};
const normalizeTourRoutes = (raw) => {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((item) => {
    const data = item || {};
    const distance = toNumber$1(data.distance);
    return {
      road_id: data.road_id ?? data.id,
      id: data.id ?? data.road_id,
      name: String(data.name || data.title || "游览路线"),
      title: data.title ? String(data.title) : void 0,
      distance: data.distance,
      distancer: data.distancer ? String(data.distancer) : Number.isFinite(distance) ? distanceUnit(distance, "距离") : void 0,
      img_road: data.img_road ? String(data.img_road) : void 0,
      road_tag: Array.isArray(data.road_tag) ? data.road_tag.map(String) : String(data.road_tag || "").split(",").map((tag) => tag.trim()).filter(Boolean),
      road_point: parseRoadPointText(data.road_point),
      spot_list: normalizeSpotList({ list: data.spot_list }),
      spots: Array.isArray(data.spots) ? data.spots : void 0,
      raw: item
    };
  });
};
const normalizeBusRoads = (raw) => {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((item) => {
    const data = item || {};
    return {
      road_id: data.road_id ?? data.id,
      id: data.id ?? data.road_id,
      name: String(data.name || data.title || "班车路线"),
      title: data.title ? String(data.title) : void 0,
      road_point: parseRoadPointText(data.road_point),
      raw: item
    };
  });
};
const normalizeNotices = (raw) => {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  return list.map((item, index) => {
    const data = item || {};
    const content = String(data.content || "").split("[[enter]]").join("\n");
    return {
      id: data.id ?? index,
      title: String(data.title || data.name || `公告 ${index + 1}`),
      content
    };
  });
};
const normalizeActivities = (raw) => {
  const list = Array.isArray(raw?.list) ? raw.list : Array.isArray(raw) ? raw : [];
  return list.map((item) => {
    const data = item || {};
    return {
      activity_id: data.activity_id ?? data.id,
      id: data.id ?? data.activity_id,
      title: String(data.title || data.name || "校园活动"),
      name: data.name ? String(data.name) : void 0,
      content: data.content ? String(data.content) : void 0,
      introduction: data.introduction ? String(data.introduction) : void 0,
      pic: data.pic,
      start_time: data.start_time ? String(data.start_time) : void 0,
      end_time: data.end_time ? String(data.end_time) : void 0,
      raw: item
    };
  });
};
const CAMPUS_GUIDE_ENDPOINTS = Object.freeze({
  scenicInfo: "/guide/v1/scenic/info",
  spotSearch: "/guide/v1/spot/search",
  spotInfo: "/guide/v1/spot/info",
  spotList: "/guide/v1/spot/list",
  spotWalk: "/guide/v1/spot/walk",
  hotSearch: "/guide/v1/spot/hot_search",
  reportSearch: "/guide/v1/spot/report_search",
  scenicActivity: "/guide/v1/scenic/activity",
  saveSpot: "/guide/v1/user/save_spot",
  saveSpotList: "/guide/v1/user/save_spot_list",
  openId: "/guide/v1/user/openid"
});
const isSuccessCode = (code) => code === 0 || code === "0";
class WisdomApiError extends Error {
  constructor(message, code) {
    super(message);
    __publicField(this, "code");
    this.name = "WisdomApiError";
    this.code = code;
  }
}
const joinUrl = (path) => {
  const base = resolveCampusGuideBaseUrl().replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
};
const wisdomPost = async (path, body = {}, options = {}) => {
  let response;
  try {
    response = await fetch(joinUrl(path), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/plain, */*"
      },
      body: JSON.stringify(body),
      signal: options.signal
    });
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (offline || message.includes("failed to fetch") || message.includes("network")) {
      throw new WisdomApiError("校园导览网络连接失败，请检查网络或稍后重试");
    }
    throw new WisdomApiError("校园导览服务暂时不可用，请稍后重试");
  }
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new WisdomApiError(`校园导览接口返回非 JSON（HTTP ${response.status}）`);
  }
  if (!response.ok) {
    throw new WisdomApiError(
      payload?.msg || payload?.message || `校园导览接口 HTTP ${response.status}`,
      payload?.code
    );
  }
  if (!payload || !isSuccessCode(payload.code)) {
    throw new WisdomApiError(
      payload?.msg || payload?.message || "校园导览接口返回失败",
      payload?.code
    );
  }
  return payload.data ?? null;
};
const campusGuideApi = {
  getScenicInfo: (params = {}) => wisdomPost(CAMPUS_GUIDE_ENDPOINTS.scenicInfo, params),
  searchSpots: (params = {}) => wisdomPost(CAMPUS_GUIDE_ENDPOINTS.spotSearch, params),
  getSpotInfo: (params = {}) => wisdomPost(CAMPUS_GUIDE_ENDPOINTS.spotInfo, params),
  getSpotList: (params = {}) => wisdomPost(CAMPUS_GUIDE_ENDPOINTS.spotList, params),
  getWalkRoute: (params = {}) => wisdomPost(CAMPUS_GUIDE_ENDPOINTS.spotWalk, params),
  getHotSearch: (params = {}) => wisdomPost(CAMPUS_GUIDE_ENDPOINTS.hotSearch, params),
  reportSearch: (params = {}) => wisdomPost(CAMPUS_GUIDE_ENDPOINTS.reportSearch, params),
  getActivities: (params = {}) => wisdomPost(CAMPUS_GUIDE_ENDPOINTS.scenicActivity, params),
  saveSpot: (params = {}) => wisdomPost(CAMPUS_GUIDE_ENDPOINTS.saveSpot, params),
  getSaveSpotList: (params = {}) => wisdomPost(CAMPUS_GUIDE_ENDPOINTS.saveSpotList, params),
  getOpenId: (params = {}) => wisdomPost(CAMPUS_GUIDE_ENDPOINTS.openId, params)
};
const DEVICE_KEY = "campus_guide_device_id";
const OPEN_ID_KEY = "campus_guide_open_id";
const getCampusGuideDeviceId = () => {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const next = `cg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_KEY, next);
    return next;
  } catch {
    return `cg_fallback_${Date.now()}`;
  }
};
const getCampusGuideOpenId = () => {
  try {
    return localStorage.getItem(OPEN_ID_KEY) || getCampusGuideDeviceId();
  } catch {
    return getCampusGuideDeviceId();
  }
};
const setCampusGuideOpenId = (openId) => {
  try {
    localStorage.setItem(OPEN_ID_KEY, openId);
  } catch {
  }
};
const LOCAL_FAVORITES_KEY = "campus_guide_favorites";
const readLocalFavorites = () => {
  try {
    const raw = localStorage.getItem(LOCAL_FAVORITES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(list.map(String));
  } catch {
    return /* @__PURE__ */ new Set();
  }
};
const writeLocalFavorites = (ids) => {
  try {
    localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify([...ids]));
  } catch {
  }
};
const loadFavoriteSpotIds = async () => {
  const local = readLocalFavorites();
  try {
    const raw = await campusGuideApi.getSaveSpotList({
      scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
      open_id: getCampusGuideOpenId(),
      pn: 1,
      rn: 200
    });
    const list = Array.isArray(raw?.list) ? raw.list : Array.isArray(raw) ? raw : [];
    for (const item of list) {
      const id = String(item?.spot_id ?? item ?? "");
      if (id) local.add(id);
    }
    writeLocalFavorites(local);
  } catch {
  }
  return local;
};
const toggleFavoriteSpot = async (spotId, saved) => {
  const id = String(spotId);
  const local = readLocalFavorites();
  if (saved) local.delete(id);
  else local.add(id);
  writeLocalFavorites(local);
  try {
    await campusGuideApi.saveSpot({
      scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
      spot_id: spotId,
      open_id: getCampusGuideOpenId(),
      type: saved ? 0 : 1
    });
  } catch {
  }
  return !saved;
};
const SPOTS_CACHE_PREFIX = "campus_guide_spots_v2_";
const META_KEY = "campus_guide_offline_meta_v2";
const readSpotsCache = (category) => {
  try {
    const raw = localStorage.getItem(`${SPOTS_CACHE_PREFIX}${category}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeSpotList({ list: parsed.spots });
  } catch {
    return null;
  }
};
const writeSpotsCache = (category, spots) => {
  try {
    localStorage.setItem(
      `${SPOTS_CACHE_PREFIX}${category}`,
      JSON.stringify({ spots, updatedAt: (/* @__PURE__ */ new Date()).toISOString() })
    );
    const meta = readOfflineMeta();
    meta.lastCategory = category;
    writeOfflineMeta(meta);
  } catch {
  }
};
const readOfflineMeta = () => {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};
const writeOfflineMeta = (meta) => {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
  }
};
const touchScenicCacheMeta = (_scenic) => {
  const meta = readOfflineMeta();
  meta.scenicUpdatedAt = (/* @__PURE__ */ new Date()).toISOString();
  writeOfflineMeta(meta);
};
const getSpotsCacheUpdatedAt = (category) => {
  try {
    const raw = localStorage.getItem(`${SPOTS_CACHE_PREFIX}${category}`);
    if (!raw) return "";
    return String(JSON.parse(raw)?.updatedAt || "");
  } catch {
    return "";
  }
};
const clearCampusGuideOfflineCaches = () => {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(SPOTS_CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(META_KEY);
    localStorage.removeItem("campus_guide_scenic_cache_v1");
  } catch {
  }
};
const MOCK_LOC_KEY = "campus_guide_mock_loc";
let lastLocationMeta = {
  point: { ...HBUT_LOCATION, name: HBUT_LOCATION.name || "湖北工业大学" },
  source: "fallback"
};
const getLastLocationMeta = () => lastLocationMeta;
const readMockLocation = () => {
  try {
    const raw = localStorage.getItem(MOCK_LOC_KEY);
    if (!raw) return null;
    return normalizePoint(JSON.parse(raw));
  } catch {
    return null;
  }
};
const writeMockLocation = (point) => {
  if (!point) {
    localStorage.removeItem(MOCK_LOC_KEY);
    return;
  }
  localStorage.setItem(MOCK_LOC_KEY, JSON.stringify(point));
};
const campusFallback = () => ({
  ...HBUT_LOCATION,
  name: HBUT_LOCATION.name || "湖北工业大学"
});
const trySystemLocation = async () => {
  const geo = useGeolocation();
  try {
    return await geo.getCurrentPosition(12e3, 0, true);
  } catch (highAccErr) {
    pushDebugLog(
      "CampusGuide",
      `高精度定位失败，尝试低精度: ${highAccErr?.message || highAccErr}`,
      "warn"
    );
    return geo.getCurrentPosition(16e3, 3e3, false);
  }
};
const resolveCampusLocationDetailed = async () => {
  const mock = readMockLocation();
  if (mock) {
    const point = { ...mock, name: mock.name || "模拟定位" };
    const result = { point, source: "mock" };
    lastLocationMeta = result;
    pushDebugLog(
      "CampusGuide",
      `定位结果 source=mock lat=${point.latitude} lng=${point.longitude}`,
      "info",
      point
    );
    return result;
  }
  if (!isLiveLocationAllowed()) {
    const point = { ...campusFallback(), name: "校园中心" };
    const result = {
      point,
      source: "policy",
      error: "当前版本使用默认校区位置"
    };
    lastLocationMeta = result;
    pushDebugLog("CampusGuide", "App Store 构建跳过实时定位，使用默认点", "info", point);
    return result;
  }
  try {
    const position = await trySystemLocation();
    const point = {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      name: "当前位置"
    };
    const result = { point, source: "system" };
    lastLocationMeta = result;
    pushDebugLog(
      "CampusGuide",
      `定位结果 source=system lat=${point.latitude.toFixed(6)} lng=${point.longitude.toFixed(6)} ±${Math.round(point.accuracy || 0)}m`,
      "info",
      { ...point, source: "system" }
    );
    return result;
  } catch (err) {
    const message = err?.message || "定位失败";
    const point = campusFallback();
    const result = { point, source: "fallback", error: message };
    lastLocationMeta = result;
    pushDebugLog(
      "CampusGuide",
      `定位回退校区中心: ${message}`,
      "warn",
      { ...point, source: "fallback" }
    );
    return result;
  }
};
const resolveCampusLocation = async () => {
  const result = await resolveCampusLocationDetailed();
  return result.point;
};
const resolveInsideScenic = (point, aoiRings) => {
  if (!aoiRings.length) return true;
  const inside = isPointInAoi(point, aoiRings);
  if (inside) return true;
  const accuracy = Number(point.accuracy);
  if (Number.isFinite(accuracy) && accuracy > 150) {
    return true;
  }
  const d = Math.hypot(
    (point.latitude - HBUT_LOCATION.latitude) * 111320,
    (point.longitude - HBUT_LOCATION.longitude) * 111320 * Math.cos(point.latitude * Math.PI / 180)
  );
  if (d < 2500) return true;
  return false;
};
const SCENIC_CACHE_KEY = "campus_guide_scenic_cache_v1";
let singleton = null;
const readScenicCache = () => {
  try {
    const raw = localStorage.getItem(SCENIC_CACHE_KEY);
    return raw ? normalizeScenicInfo(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};
const writeScenicCache = (scenic) => {
  try {
    localStorage.setItem(SCENIC_CACHE_KEY, JSON.stringify(scenic));
  } catch {
  }
};
const createCampusGuideStore = () => {
  const cached = readScenicCache();
  const state = reactive({
    scenic: cached,
    tags: Array.isArray(cached?.tags) ? cached.tags : [],
    activeTag: Array.isArray(cached?.tags) ? cached.tags[0]?.tag || "" : "",
    spots: [],
    selectedSpot: null,
    userLocation: { ...HBUT_LOCATION, name: "湖北工业大学" },
    insideScenic: true,
    loading: false,
    spotsLoading: false,
    mapReady: false,
    error: "",
    offline: false,
    cacheUpdatedAt: "",
    favoriteIds: /* @__PURE__ */ new Set(),
    tourRoutes: [],
    busRoads: [],
    activities: [],
    notices: [],
    hotSearch: [],
    // #491：进入校园地图直达导览主地图，不再先出三选一 Hub
    currentView: CAMPUS_GUIDE_VIEWS.home,
    navParams: {},
    viewStack: []
  });
  const mapCenter = computed(() => scenicCenter(state.scenic, state.userLocation));
  const applyFavoriteFlags = (list) => list.map((spot) => ({
    ...spot,
    is_saved: state.favoriteIds.has(String(spot.spot_id))
  }));
  const store = {
    get scenic() {
      return state.scenic;
    },
    set scenic(value) {
      state.scenic = value;
    },
    get tags() {
      return state.tags;
    },
    set tags(value) {
      state.tags = value;
    },
    get activeTag() {
      return state.activeTag;
    },
    set activeTag(value) {
      state.activeTag = value;
    },
    get spots() {
      return state.spots;
    },
    set spots(value) {
      state.spots = value;
    },
    get selectedSpot() {
      return state.selectedSpot;
    },
    set selectedSpot(value) {
      state.selectedSpot = value;
    },
    get userLocation() {
      return state.userLocation;
    },
    set userLocation(value) {
      state.userLocation = value;
    },
    get insideScenic() {
      return state.insideScenic;
    },
    set insideScenic(value) {
      state.insideScenic = value;
    },
    get loading() {
      return state.loading;
    },
    set loading(value) {
      state.loading = value;
    },
    get spotsLoading() {
      return state.spotsLoading;
    },
    set spotsLoading(value) {
      state.spotsLoading = value;
    },
    get mapReady() {
      return state.mapReady;
    },
    set mapReady(value) {
      state.mapReady = value;
    },
    get error() {
      return state.error;
    },
    set error(value) {
      state.error = value;
    },
    get offline() {
      return state.offline;
    },
    set offline(value) {
      state.offline = value;
    },
    get cacheUpdatedAt() {
      return state.cacheUpdatedAt;
    },
    set cacheUpdatedAt(value) {
      state.cacheUpdatedAt = value;
    },
    get favoriteIds() {
      return state.favoriteIds;
    },
    set favoriteIds(value) {
      state.favoriteIds = value;
    },
    get tourRoutes() {
      return state.tourRoutes;
    },
    set tourRoutes(value) {
      state.tourRoutes = value;
    },
    get busRoads() {
      return state.busRoads;
    },
    set busRoads(value) {
      state.busRoads = value;
    },
    get activities() {
      return state.activities;
    },
    set activities(value) {
      state.activities = value;
    },
    get notices() {
      return state.notices;
    },
    set notices(value) {
      state.notices = value;
    },
    get hotSearch() {
      return state.hotSearch;
    },
    set hotSearch(value) {
      state.hotSearch = value;
    },
    get currentView() {
      return state.currentView;
    },
    set currentView(value) {
      state.currentView = value;
    },
    get navParams() {
      return state.navParams;
    },
    set navParams(value) {
      state.navParams = value;
    },
    get mapCenter() {
      return mapCenter.value;
    },
    navigateTo(view, params = {}) {
      if (state.currentView !== view) state.viewStack.push(state.currentView);
      state.navParams = params;
      state.currentView = view;
    },
    goBack() {
      const previous = state.viewStack.pop();
      state.currentView = previous || CAMPUS_GUIDE_VIEWS.home;
      state.navParams = {};
    },
    async loadScenic() {
      const raw = await campusGuideApi.getScenicInfo({
        scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
        field: ["basic", "ticket_info", "aoi", "bus_road_list"]
      });
      state.scenic = normalizeScenicInfo(raw);
      const tags = buildScenicTags(raw);
      state.scenic.tags = tags;
      state.tags = tags;
      writeScenicCache(state.scenic);
      touchScenicCacheMeta(state.scenic);
      state.offline = false;
      state.busRoads = normalizeBusRoads(state.scenic.bus_road_list);
      if (!state.activeTag && state.tags[0]?.tag) state.activeTag = state.tags[0].tag;
      return state.scenic;
    },
    async loadNotices() {
      try {
        const raw = await campusGuideApi.getScenicInfo({
          scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
          field: ["notice"]
        });
        state.notices = normalizeNotices(raw?.notice);
      } catch {
        state.notices = [];
      }
      return state.notices;
    },
    async refreshLocation() {
      state.userLocation = await resolveCampusLocation();
      state.insideScenic = resolveInsideScenic(state.userLocation, state.scenic?.aoi || []);
      return state.userLocation;
    },
    async loadSpotsByCategory(category = state.activeTag) {
      if (!category) return [];
      try {
        const raw = await campusGuideApi.searchSpots({
          scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
          category,
          field: ["basic", "pic", "speech", "park_area"],
          latitude: state.userLocation.latitude,
          longitude: state.userLocation.longitude,
          pn: 1,
          rn: 100
        });
        state.spots = applyFavoriteFlags(normalizeSpotList(raw)).map((spot) => ({ ...spot }));
        writeSpotsCache(category, state.spots);
        state.cacheUpdatedAt = getSpotsCacheUpdatedAt(category);
        state.offline = false;
      } catch (err) {
        const cached2 = readSpotsCache(category);
        if (cached2?.length) {
          state.spots = applyFavoriteFlags(cached2);
          state.cacheUpdatedAt = getSpotsCacheUpdatedAt(category);
          state.offline = true;
          state.error = "POI 数据加载失败，已使用离线缓存";
          return state.spots;
        }
        throw err;
      }
      return state.spots;
    },
    async loadHotSearch() {
      try {
        const raw = await campusGuideApi.getHotSearch({ scenic_id: CAMPUS_GUIDE_CONFIG.scenicId });
        const list = Array.isArray(raw?.list) ? raw.list : Array.isArray(raw) ? raw : [];
        state.hotSearch = list.map((item) => String(item?.name || item || "")).filter(Boolean);
      } catch {
        state.hotSearch = [];
      }
      return state.hotSearch;
    },
    async searchSpotsByName(keyword) {
      const raw = await campusGuideApi.searchSpots({
        scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
        name: keyword,
        field: ["basic", "pic", "speech", "park_area"],
        latitude: state.userLocation.latitude,
        longitude: state.userLocation.longitude,
        pn: 1,
        rn: 50
      });
      return applyFavoriteFlags(normalizeSpotList(raw));
    },
    async loadSpotDetail(spotId) {
      const raw = await campusGuideApi.getSpotInfo({
        scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
        spot_id: spotId,
        open_id: getCampusGuideOpenId(),
        field: ["basic", "pic", "speech", "introduction", "info"]
      });
      const spot = normalizeSpot(raw);
      if (!spot) throw new Error("地点详情加载失败");
      spot.is_saved = state.favoriteIds.has(String(spot.spot_id));
      return spot;
    },
    async loadActivities() {
      try {
        const raw = await campusGuideApi.getActivities({ scenic_id: CAMPUS_GUIDE_CONFIG.scenicId });
        state.activities = normalizeActivities(raw);
      } catch {
        state.activities = [];
      }
      return state.activities;
    },
    async loadTourRoutesDetailed() {
      if (state.tourRoutes.length) return state.tourRoutes;
      const raw = await campusGuideApi.getScenicInfo({
        scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
        field: ["tour_road_list"]
      });
      const info = normalizeScenicInfo(raw);
      const routes = normalizeTourRoutes(info.tour_road_list);
      for (const route of routes) {
        if (!route.spots?.length) continue;
        try {
          const spotRaw = await campusGuideApi.getSpotList({
            scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
            spot_id: route.spots,
            field: ["basic", "speech"]
          });
          route.spot_list = normalizeSpotList(spotRaw);
        } catch {
          route.spot_list = [];
        }
      }
      state.tourRoutes = routes;
      return routes;
    },
    async loadFavorites() {
      state.favoriteIds = await loadFavoriteSpotIds();
      state.spots = applyFavoriteFlags(state.spots);
      if (state.selectedSpot) {
        state.selectedSpot = {
          ...state.selectedSpot,
          is_saved: state.favoriteIds.has(String(state.selectedSpot.spot_id))
        };
      }
      return state.favoriteIds;
    },
    async bootstrap() {
      state.loading = true;
      state.error = "";
      try {
        await store.refreshLocation();
        try {
          const openIdResult = await campusGuideApi.getOpenId({ scenic_id: CAMPUS_GUIDE_CONFIG.scenicId });
          if (openIdResult?.open_id) setCampusGuideOpenId(openIdResult.open_id);
        } catch {
        }
        await store.loadFavorites();
        try {
          await store.loadScenic();
        } catch (err) {
          if (!state.scenic) throw err;
          state.offline = true;
          state.error = "景区数据加载失败，已使用缓存";
        }
        await store.loadNotices();
        if (state.activeTag) {
          state.cacheUpdatedAt = getSpotsCacheUpdatedAt(state.activeTag);
        }
        await store.loadSpotsByCategory();
        await store.loadHotSearch();
      } catch (err) {
        state.error = err?.message || "校园导览加载失败";
        throw err;
      } finally {
        state.loading = false;
      }
    },
    async selectTag(tag) {
      if (!tag || tag === state.activeTag) return state.spots;
      state.activeTag = tag;
      state.selectedSpot = null;
      state.spotsLoading = true;
      state.error = "";
      try {
        const spots = await store.loadSpotsByCategory(tag);
        return spots;
      } finally {
        state.spotsLoading = false;
      }
    },
    async selectSpot(spot) {
      state.selectedSpot = spot;
      if (!spot) return null;
      try {
        const detail = await store.loadSpotDetail(spot.spot_id);
        state.selectedSpot = detail;
        return detail;
      } catch {
        return spot;
      }
    },
    async toggleFavorite(spot) {
      const next = await toggleFavoriteSpot(spot.spot_id, Boolean(spot.is_saved));
      const id = String(spot.spot_id);
      if (next) state.favoriteIds.add(id);
      else state.favoriteIds.delete(id);
      state.favoriteIds = new Set(state.favoriteIds);
      spot.is_saved = next;
      if (state.selectedSpot?.spot_id === spot.spot_id) state.selectedSpot = { ...spot };
      state.spots = applyFavoriteFlags(state.spots);
      return next;
    },
    async focusSpotOnHome(spot) {
      state.viewStack = [];
      state.currentView = CAMPUS_GUIDE_VIEWS.home;
      state.navParams = {};
      await store.selectSpot(spot);
    }
  };
  return store;
};
const useCampusGuideStore = () => {
  if (!singleton) singleton = createCampusGuideStore();
  return singleton;
};
const resetCampusGuideStore = () => {
  singleton = null;
};
const _hoisted_1$t = { class: "campus-guide-page" };
const _hoisted_2$q = { class: "campus-guide-page-body" };
const _sfc_main$t = /* @__PURE__ */ defineComponent({
  __name: "GuidePageLayout",
  props: {
    title: {},
    icon: {}
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$t, [
        createVNode(unref(_sfc_main$u), {
          title: __props.title,
          icon: __props.icon || "map",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, null, 8, ["title", "icon"]),
        createBaseVNode("div", _hoisted_2$q, [
          renderSlot(_ctx.$slots, "default")
        ])
      ]);
    };
  }
});
const _hoisted_1$s = { class: "campus-guide-title" };
const _hoisted_2$p = { class: "campus-guide-muted" };
const _hoisted_3$g = { class: "campus-guide-article" };
const _sfc_main$s = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideAbout",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "校园概况",
        icon: "school",
        onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          createBaseVNode("h2", _hoisted_1$s, toDisplayString(unref(store).scenic?.name || "湖北工业大学"), 1),
          createBaseVNode("p", _hoisted_2$p, " 中心坐标：" + toDisplayString(unref(store).scenic?.latitude) + ", " + toDisplayString(unref(store).scenic?.longitude), 1),
          createBaseVNode("article", _hoisted_3$g, toDisplayString(unref(store).scenic?.introduction || "湖北工业大学校园导览，支持教学楼标点、分类筛选、步行导航、游览路线、班车路线、活动公告、云游打卡与校庆打卡等功能。"), 1)
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$r = { class: "campus-guide-list" };
const _hoisted_2$o = ["onClick"];
const _sfc_main$r = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideActivity",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    onMounted(() => {
      void store.loadActivities();
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "校园活动",
        icon: "event",
        onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          createBaseVNode("ul", _hoisted_1$r, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(store).activities, (item) => {
              return openBlock(), createElementBlock("li", {
                key: item.activity_id || item.id
              }, [
                createBaseVNode("button", {
                  type: "button",
                  onClick: ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).activityDetail, { activityId: item.activity_id || item.id })
                }, [
                  createBaseVNode("strong", null, toDisplayString(item.title), 1),
                  createBaseVNode("span", null, toDisplayString(item.start_time || ""), 1)
                ], 8, _hoisted_2$o)
              ]);
            }), 128))
          ])
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$q = { class: "campus-guide-title" };
const _hoisted_2$n = {
  key: 0,
  class: "campus-guide-muted"
};
const _hoisted_3$f = { class: "campus-guide-article" };
const _hoisted_4$c = {
  key: 1,
  class: "campus-guide-muted"
};
const _sfc_main$q = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideActivityDetail",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const activity = computed(() => {
      const targetId = String(store.navParams.activityId ?? "");
      return store.activities.find((item) => String(item.activity_id || item.id) === targetId) ?? null;
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "活动详情",
        icon: "event",
        onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          activity.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            createBaseVNode("h2", _hoisted_1$q, toDisplayString(activity.value.title), 1),
            activity.value.start_time ? (openBlock(), createElementBlock("p", _hoisted_2$n, toDisplayString(activity.value.start_time) + " - " + toDisplayString(activity.value.end_time), 1)) : createCommentVNode("", true),
            createBaseVNode("article", _hoisted_3$f, toDisplayString(activity.value.content || activity.value.introduction || "暂无活动详情"), 1)
          ], 64)) : (openBlock(), createElementBlock("p", _hoisted_4$c, "未找到活动"))
        ]),
        _: 1
      });
    };
  }
});
const MARKER_WIDTH = 62;
const MARKER_HEIGHT = 35;
const LABEL_CHAR_WIDTH = 10;
const LABEL_PADDING = 20;
const LABEL_HEIGHT = 30;
const latLngToPixel = (point, zoom) => {
  const scale = 256 * 2 ** zoom;
  const x = (point.longitude + 180) / 360 * scale;
  const sinLat = Math.sin(point.latitude * Math.PI / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
};
const markerBox = (pixel) => {
  const width = MARKER_WIDTH;
  const height = MARKER_HEIGHT;
  return {
    x: pixel.x - width / 2,
    y: pixel.y,
    width,
    height
  };
};
const labelBox = (pixel) => {
  const width = Math.max(pixel.name.length * LABEL_CHAR_WIDTH + LABEL_PADDING, MARKER_WIDTH);
  const height = LABEL_HEIGHT;
  return {
    x: pixel.x - width / 2,
    y: pixel.y - height,
    width,
    height
  };
};
const boxesOverlap = (a, b) => {
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  return right - left <= a.width + b.width && bottom - top <= a.height + b.height;
};
const resetDodgeFlags = (spots, selected) => {
  for (const spot of spots) {
    if (!spot.point) continue;
    spot.point.isDodged = false;
    spot.priority = String(selected?.spot_id ?? "") === String(spot.spot_id) ? 9999 : spot.priority ?? 0;
  }
};
const collideAtZoom = (spots, zoom, dodgeType, selected) => {
  resetDodgeFlags(spots, selected);
  const pixels = spots.filter((spot) => spot.point && !spot.point.isDodged).map((spot) => {
    const base = latLngToPixel(spot.point, zoom);
    return {
      ...base,
      name: spot.name,
      dodgeType,
      bigType: Boolean(spot.marker_type),
      spot
    };
  });
  for (let i = 0; i < pixels.length - 1; i++) {
    if (pixels[i].spot.point?.isDodged) continue;
    for (let j = i + 1; j < pixels.length; j++) {
      if (pixels[j].spot.point?.isDodged) continue;
      const boxA = dodgeType === 1 ? markerBox(pixels[i]) : labelBox(pixels[i]);
      const boxB = dodgeType === 1 ? markerBox(pixels[j]) : labelBox(pixels[j]);
      if (!boxesOverlap(boxA, boxB)) continue;
      const priorityA = pixels[i].spot.priority ?? 0;
      const priorityB = pixels[j].spot.priority ?? 0;
      if (priorityA >= priorityB) {
        if (pixels[j].spot.point) pixels[j].spot.point.isDodged = true;
      } else if (pixels[i].spot.point) {
        pixels[i].spot.point.isDodged = true;
      }
    }
  }
  const gate = spots.find((spot) => String(spot.spot_id) === "109180");
  if (gate?.point) gate.point.isDodged = false;
};
const applyMarkerDodge = (spots, zoom, selected) => {
  const dodgeable = spots.map((spot) => ({
    ...spot,
    point: {
      ...spot.point || {
        latitude: Number(spot.latitude),
        longitude: Number(spot.longitude)
      },
      isDodged: false
    },
    priority: String(selected?.spot_id ?? "") === String(spot.spot_id) ? 9999 : 0,
    marker_type: spot.marker_type
  }));
  collideAtZoom(dodgeable, zoom, 1, selected);
  collideAtZoom(dodgeable, zoom, 2, selected);
  return dodgeable;
};
const visibleDodgedSpots = (spots) => spots.filter((spot) => spot.point && !spot.point.isDodged);
const MARKER_THEME = "#0074CF";
const markerThemeByType = (markerType, active = false) => {
  if (markerType === "bus") return active ? "#15803d" : "#16a34a";
  if (markerType === "activity") return active ? "#c2410c" : "#ea580c";
  return active ? "#005fa8" : MARKER_THEME;
};
const markerSvg = (label, active = false, markerType) => {
  const fill = markerThemeByType(markerType, active);
  const text = label.slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52">
    <path d="M22 0C12.06 0 4 8.06 4 18c0 12.75 18 34 18 34s18-21.25 18-34C40 8.06 31.94 0 22 0z" fill="${fill}"/>
    <circle cx="22" cy="18" r="11" fill="#fff"/>
    <text x="22" y="22" text-anchor="middle" font-size="10" font-weight="700" fill="${fill}" font-family="sans-serif">${text}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};
const markerSizeByName = (name) => {
  const len = String(name || "").length;
  if (len <= 4) return 4;
  if (len <= 6) return 6;
  if (len <= 8) return 8;
  if (len <= 10) return 10;
  return 12;
};
const styleCache = /* @__PURE__ */ new Map();
const createMarkerStyle = (TMap, opts) => {
  if (typeof TMap.MarkerStyle === "function") return new TMap.MarkerStyle(opts);
  return { ...opts };
};
const ensureSpotStyle = (TMap, name, size, active, markerType) => {
  const key = `spot-${size}-${active ? "a" : "n"}-${markerType || "default"}-${name}`;
  if (!styleCache.has(key)) {
    styleCache.set(
      key,
      createMarkerStyle(TMap, {
        width: active ? 40 : 34,
        height: active ? 46 : 40,
        anchor: { x: active ? 20 : 17, y: active ? 46 : 40 },
        src: markerSvg(name, active, markerType)
      })
    );
  }
  return key;
};
const buildMarkerStyles = (TMap) => {
  const styles = {};
  styles.location = createMarkerStyle(TMap, {
    width: 28,
    height: 28,
    anchor: { x: 14, y: 14 },
    src: markerSvg("我", true)
  });
  return styles;
};
const buildSpotMarkerStyles = (TMap, spots, selectedId) => {
  const styles = buildMarkerStyles(TMap);
  for (const spot of spots) {
    const size = markerSizeByName(spot.name);
    const id = String(spot.spot_id);
    const active = String(selectedId ?? "") === id;
    const styleId = ensureSpotStyle(TMap, spot.name, size, active, spot.marker_type);
    const style = styleCache.get(styleId);
    if (style != null) styles[styleId] = style;
  }
  return styles;
};
const spotToMarkerGeometry = (spot, index, selectedId) => {
  const raw = spot.point || spot.latlng;
  const latitude = Number(
    raw?.latitude ?? spot.latitude ?? spot.lat
  );
  const longitude = Number(
    raw?.longitude ?? spot.longitude ?? spot.lng
  );
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const point = { latitude, longitude };
  const id = String(spot.spot_id || index);
  const size = markerSizeByName(spot.name);
  const active = String(selectedId ?? "") === id;
  const styleId = `spot-${size}-${active ? "a" : "n"}-${spot.marker_type || "default"}-${spot.name}`;
  return {
    id,
    styleId,
    position: point,
    properties: { title: spot.name }
  };
};
const SCRIPT_ATTR = "data-campus-guide-map";
let loadPromise = null;
const loadTencentMap = async (key = CAMPUS_GUIDE_CONFIG.qqMapKey) => {
  if (typeof window === "undefined") {
    throw new Error("当前环境无法加载地图");
  }
  const globalWindow = window;
  if (globalWindow.TMap) return globalWindow.TMap;
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[${SCRIPT_ATTR}="1"]`);
    const handleReady = () => {
      if (globalWindow.TMap) {
        resolve(globalWindow.TMap);
        return;
      }
      reject(new Error("腾讯地图脚本已加载但未暴露 TMap"));
    };
    if (existing) {
      existing.addEventListener("load", handleReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("腾讯地图脚本加载失败")), { once: true });
      if (globalWindow.TMap) handleReady();
      return;
    }
    const script = document.createElement("script");
    script.setAttribute(SCRIPT_ATTR, "1");
    script.async = true;
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`;
    script.onload = handleReady;
    script.onerror = () => reject(new Error("腾讯地图脚本加载失败"));
    document.head.appendChild(script);
  });
  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    throw error;
  }
};
const toLatLng = (TMap, point) => new TMap.LatLng(Number(point.latitude), Number(point.longitude));
class CampusMapCore {
  constructor(container, options) {
    __publicField(this, "container");
    __publicField(this, "options");
    __publicField(this, "TMap", null);
    __publicField(this, "map", null);
    __publicField(this, "markerLayer", null);
    __publicField(this, "aoiLayer", null);
    __publicField(this, "locationLayer", null);
    __publicField(this, "polylineLayer", null);
    __publicField(this, "customLayer", null);
    __publicField(this, "customLayerReady", false);
    __publicField(this, "customLayerRetries", 0);
    /** 含尺寸未就绪的调度次数上限，避免容器长期 0 尺寸时无限 timer */
    __publicField(this, "customLayerScheduleCount", 0);
    __publicField(this, "spotMap", /* @__PURE__ */ new Map());
    __publicField(this, "lastSpots", []);
    __publicField(this, "lastSelectedSpotId");
    __publicField(this, "lastSpotSignature", "");
    /** 最近一次成功写入 MultiMarker 的几何数量（用于 UI 提示有数无点） */
    __publicField(this, "lastPaintedMarkerCount", 0);
    __publicField(this, "zoomRefreshTimer", null);
    __publicField(this, "customLayerRetryTimer", null);
    this.container = container;
    this.options = options;
  }
  async init() {
    const TMap = await loadTencentMap();
    this.TMap = TMap;
    const center = toLatLng(TMap, this.options.center);
    this.map = new TMap.Map(this.container, {
      center,
      zoom: CAMPUS_GUIDE_CONFIG.defaultZoom,
      minZoom: CAMPUS_GUIDE_CONFIG.minZoom,
      maxZoom: CAMPUS_GUIDE_CONFIG.maxZoom,
      viewMode: "2D",
      showControl: false,
      draggable: true,
      scrollable: true,
      doubleClickZoom: true,
      // 手绘层优先：减少 2D 楼块/兴趣点遮挡自定义瓦片（#369 iOS）
      baseMap: {
        type: "vector",
        features: ["base"]
      }
    });
    await this.mountCustomLayer();
    this.scheduleCustomLayerRetry();
    this.renderAoi();
    this.bindZoomRefresh();
    return this.map;
  }
  bindZoomRefresh() {
    const refresh = () => {
      if (!this.lastSpots.length) return;
      if (this.zoomRefreshTimer) clearTimeout(this.zoomRefreshTimer);
      this.zoomRefreshTimer = setTimeout(() => {
        this.renderSpots(this.lastSpots, this.lastSelectedSpotId);
        this.options.onZoomChange?.(this.getZoom());
      }, 120);
    };
    this.map?.on?.("zoom", refresh);
    this.map?.on?.("zoom_changed", refresh);
  }
  /**
   * 强制刷新 marker。
   * @param forceRecreate 为 true 时销毁重建 MultiMarker，避免 setStyles 残留导致有数无点
   */
  refreshMarkers(forceRecreate = false) {
    if (!this.lastSpots.length) return;
    if (forceRecreate) {
      this.lastSpotSignature = "";
      this.destroyMarkerLayer();
    }
    this.renderSpots(this.lastSpots, this.lastSelectedSpotId);
  }
  getLastPaintedMarkerCount() {
    return this.lastPaintedMarkerCount;
  }
  destroyMarkerLayer() {
    if (!this.markerLayer) return;
    this.markerLayer.setMap?.(null);
    this.markerLayer.destroy?.();
    this.markerLayer = null;
  }
  resolveVisibleSpots(spots, zoom, selectedSpot) {
    if (!CAMPUS_GUIDE_CONFIG.markerDodge) return spots;
    return visibleDodgedSpots(applyMarkerDodge(spots, zoom, selectedSpot));
  }
  buildSpotSignature(spots) {
    return spots.map((spot) => String(spot.spot_id)).join("|");
  }
  bindMarkerClick() {
    this.markerLayer?.on?.("click", (event) => {
      const payload = event;
      const id = payload?.geometry?.id || payload?.detail?.geometry?.id;
      if (!id) return;
      const spot = this.spotMap.get(id);
      if (spot) this.options.onMarkerClick?.(spot);
    });
  }
  scheduleCustomLayerRetry() {
    if (this.customLayerReady) return;
    if (this.customLayerRetries >= 4 || this.customLayerScheduleCount >= 10) return;
    if (this.customLayerRetryTimer) clearTimeout(this.customLayerRetryTimer);
    this.customLayerScheduleCount += 1;
    const delay = 400 + Math.min(this.customLayerScheduleCount, 6) * 350;
    this.customLayerRetryTimer = setTimeout(() => {
      this.customLayerRetryTimer = null;
      void this.mountCustomLayer();
      this.scheduleCustomLayerRetry();
    }, delay);
  }
  async mountCustomLayer() {
    if (!this.TMap || !this.map || this.customLayerReady) return;
    const layerId = CAMPUS_GUIDE_CONFIG.customLayerId;
    const w = this.container?.clientWidth || 0;
    const h = this.container?.clientHeight || 0;
    let attempt = this.customLayerRetries;
    try {
      if (w < 8 || h < 8) {
        pushDebugLog(
          "CampusGuide",
          `手绘层延后挂载（容器未就绪） size=${w}x${h}`,
          "warn",
          { layerId, size: `${w}x${h}` }
        );
        return;
      }
      this.customLayerRetries += 1;
      attempt = this.customLayerRetries;
      const map = this.map;
      map?.resize?.();
      const create = this.TMap.ImageTileLayer?.createCustomLayer;
      if (typeof create !== "function") {
        pushDebugLog("CampusGuide", "ImageTileLayer.createCustomLayer 不可用", "error", { layerId });
        return;
      }
      if (this.customLayer) {
        try {
          this.customLayer.setMap?.(null);
          this.customLayer.destroy?.();
        } catch {
        }
        this.customLayer = null;
      }
      const layer = await create({
        layerId,
        map: this.map,
        minZoom: CAMPUS_GUIDE_CONFIG.minZoom,
        maxZoom: CAMPUS_GUIDE_CONFIG.maxZoom,
        zIndex: 2,
        opacity: 1
      });
      if (layer) {
        this.customLayer = layer;
        this.customLayerReady = true;
        pushDebugLog(
          "CampusGuide",
          `手绘层挂载成功 attempt=${attempt} layerId=${layerId}`,
          "info",
          { layerId, attempt, size: `${w}x${h}` }
        );
        return;
      }
      pushDebugLog(
        "CampusGuide",
        `手绘层返回空 attempt=${attempt} layerId=${layerId}`,
        "warn",
        { layerId, attempt }
      );
    } catch (err) {
      pushDebugLog(
        "CampusGuide",
        `手绘层挂载失败 attempt=${attempt}: ${err?.message || err}`,
        "error",
        { layerId, attempt, err }
      );
    }
  }
  renderAoi() {
    if (!this.TMap || !this.map || !this.options.aoiRings?.length) return;
    const geometries = this.options.aoiRings.map((ring, index) => {
      const paths = ring.map((point) => toLatLng(this.TMap, point));
      return paths.length >= 3 ? { id: `aoi-${index}`, paths } : null;
    }).filter(Boolean);
    if (!geometries.length) return;
    this.aoiLayer = new this.TMap.MultiPolygon({
      map: this.map,
      styles: {
        campus: {
          color: "rgba(0, 116, 207, 0.08)",
          showBorder: true,
          borderColor: "rgba(0, 116, 207, 0.45)",
          borderWidth: 2
        }
      },
      geometries: geometries.map((item) => ({
        id: item.id,
        styleId: "campus",
        paths: item.paths
      }))
    });
  }
  setCenter(point, zoom) {
    if (!this.TMap || !this.map) return;
    this.map.setCenter(toLatLng(this.TMap, point));
    if (typeof zoom === "number") this.map.setZoom(zoom);
  }
  getZoom() {
    return Number(this.map?.getZoom?.() ?? CAMPUS_GUIDE_CONFIG.defaultZoom);
  }
  renderSpots(spots, selectedSpotId) {
    if (!this.TMap || !this.map) return;
    this.lastSpots = spots;
    this.lastSelectedSpotId = selectedSpotId;
    this.spotMap.clear();
    const selected = selectedSpotId ?? this.options.selectedSpotId;
    const selectedSpot = spots.find((spot) => String(spot.spot_id) === String(selected ?? "")) || null;
    const zoom = this.getZoom();
    const visibleSpots = this.resolveVisibleSpots(spots, zoom, selectedSpot);
    const styles = buildSpotMarkerStyles(
      this.TMap,
      visibleSpots,
      selected
    );
    const safeStyles = {};
    for (const [key, value] of Object.entries(styles)) {
      if (value != null) safeStyles[key] = value;
    }
    const geometries = visibleSpots.map((spot, index) => {
      const geometry = spotToMarkerGeometry(spot, index, selected);
      if (!geometry) return null;
      if (!safeStyles[geometry.styleId]) return null;
      const id = String(spot.spot_id || index);
      this.spotMap.set(id, spot);
      try {
        return {
          ...geometry,
          position: toLatLng(this.TMap, geometry.position)
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
    this.lastPaintedMarkerCount = geometries.length;
    if (spots.length > 0 && geometries.length === 0) {
      pushDebugLog(
        "CampusGuide",
        `renderSpots: ${spots.length} 个点位均无有效几何（坐标/样式失败）`,
        "warn",
        { spots: spots.length, visible: visibleSpots.length }
      );
    }
    const signature = this.buildSpotSignature(spots);
    const categoryChanged = signature !== this.lastSpotSignature;
    this.lastSpotSignature = signature;
    if (!categoryChanged && this.markerLayer) {
      try {
        this.markerLayer.setStyles?.(safeStyles);
        this.markerLayer.setGeometries?.(geometries);
        return;
      } catch (err) {
        pushDebugLog(
          "CampusGuide",
          `setStyles/setGeometries 失败，重建 marker 层: ${err?.message || err}`,
          "warn"
        );
        this.destroyMarkerLayer();
      }
    }
    this.destroyMarkerLayer();
    try {
      this.markerLayer = new this.TMap.MultiMarker({
        map: this.map,
        styles: safeStyles,
        geometries,
        zIndex: 120
      });
      this.bindMarkerClick();
    } catch (err) {
      this.lastPaintedMarkerCount = 0;
      pushDebugLog(
        "CampusGuide",
        `MultiMarker 创建失败: ${err?.message || err}`,
        "error",
        { count: geometries.length }
      );
    }
  }
  renderLocation(point) {
    if (!this.TMap || !this.map) return;
    const styles = buildMarkerStyles(this.TMap);
    const geometry = {
      id: "user-location",
      styleId: "location",
      position: toLatLng(this.TMap, point),
      properties: { title: point.name || "当前位置" }
    };
    if (!this.locationLayer) {
      this.locationLayer = new this.TMap.MultiMarker({ map: this.map, styles, geometries: [geometry] });
      return;
    }
    this.locationLayer.setGeometries?.([geometry]);
  }
  renderPolylines(segments, color = CAMPUS_GUIDE_CONFIG.themeColor) {
    if (!this.TMap || !this.map) return;
    const geometries = segments.map((segment, index) => {
      const paths = (segment || []).filter(
        (point) => point && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))
      ).map((point) => toLatLng(this.TMap, point));
      return paths.length >= 2 ? { id: `route-${index}`, paths } : null;
    }).filter(Boolean);
    const styleOpts = {
      color,
      width: 6,
      borderColor: "#ffffff",
      borderWidth: 2,
      lineCap: "round"
    };
    const routeStyle = typeof this.TMap.PolylineStyle === "function" ? new this.TMap.PolylineStyle(styleOpts) : { ...styleOpts };
    const styles = { route: routeStyle };
    const mapped = geometries.map((item) => ({
      id: item.id,
      styleId: "route",
      paths: item.paths
    }));
    try {
      if (!this.polylineLayer) {
        this.polylineLayer = new this.TMap.MultiPolyline({
          map: this.map,
          styles,
          geometries: mapped
        });
        return;
      }
      this.polylineLayer.setStyles?.(styles);
      this.polylineLayer.setGeometries?.(mapped);
    } catch (err) {
      pushDebugLog(
        "CampusGuide",
        `renderPolylines 失败: ${err?.message || err}`,
        "error",
        { segments: segments.length }
      );
      try {
        this.polylineLayer?.setMap?.(null);
        this.polylineLayer?.destroy?.();
      } catch {
      }
      this.polylineLayer = null;
      throw err;
    }
  }
  clearPolylines() {
    this.polylineLayer?.setGeometries?.([]);
  }
  resize() {
    const map = this.map;
    map?.resize?.();
    if (!this.customLayerReady) this.scheduleCustomLayerRetry();
  }
  fitPoints(points) {
    if (!this.TMap || !this.map || !points.length) return;
    const latitudes = points.map((p) => p.latitude);
    const longitudes = points.map((p) => p.longitude);
    const bounds = {
      sw: new this.TMap.LatLng(Math.min(...latitudes), Math.min(...longitudes)),
      ne: new this.TMap.LatLng(Math.max(...latitudes), Math.max(...longitudes))
    };
    this.map.fitBounds?.(bounds, { padding: 80 });
  }
  destroy() {
    if (this.zoomRefreshTimer) {
      clearTimeout(this.zoomRefreshTimer);
      this.zoomRefreshTimer = null;
    }
    if (this.customLayerRetryTimer) {
      clearTimeout(this.customLayerRetryTimer);
      this.customLayerRetryTimer = null;
    }
    this.markerLayer?.destroy?.();
    this.aoiLayer?.destroy?.();
    this.locationLayer?.destroy?.();
    this.polylineLayer?.destroy?.();
    this.customLayer?.destroy?.();
    this.map?.destroy?.();
    this.markerLayer = null;
    this.aoiLayer = null;
    this.locationLayer = null;
    this.polylineLayer = null;
    this.customLayer = null;
    this.customLayerReady = false;
    this.customLayerRetries = 0;
    this.customLayerScheduleCount = 0;
    this.map = null;
    this.TMap = null;
    this.spotMap.clear();
    this.lastSpotSignature = "";
    this.lastPaintedMarkerCount = 0;
  }
}
const _hoisted_1$p = { class: "campus-guide-chip-list" };
const _hoisted_2$m = ["onClick"];
const _hoisted_3$e = { class: "campus-guide-map-shell campus-guide-map-shell--compact" };
const _sfc_main$p = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideBus",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const mapContainerRef = ref(null);
    const mapCore = ref(null);
    const activeIndex = ref(0);
    const renderRoute = async (index) => {
      activeIndex.value = index;
      const route = store.busRoads[index];
      if (!mapCore.value || !route?.road_point?.length) return;
      mapCore.value.renderPolylines(route.road_point, "#16a34a");
      mapCore.value.fitPoints(route.road_point.flat());
    };
    onMounted(async () => {
      await nextTick();
      const container = mapContainerRef.value;
      if (!container) return;
      const core = new CampusMapCore(container, { center: store.mapCenter });
      await core.init();
      mapCore.value = core;
      if (store.busRoads.length) await renderRoute(0);
    });
    onBeforeUnmount(() => {
      mapCore.value?.destroy();
      mapCore.value = null;
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "班车路线",
        icon: "directions_bus",
        onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_1$p, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(store).busRoads, (route, index) => {
              return openBlock(), createElementBlock("button", {
                key: route.road_id || index,
                type: "button",
                class: normalizeClass(["campus-guide-chip", { active: index === activeIndex.value }]),
                onClick: ($event) => renderRoute(index)
              }, toDisplayString(route.name), 11, _hoisted_2$m);
            }), 128))
          ]),
          createBaseVNode("div", _hoisted_3$e, [
            createBaseVNode("div", {
              ref_key: "mapContainerRef",
              ref: mapContainerRef,
              class: "campus-guide-map-canvas"
            }, null, 512)
          ])
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$o = {
  key: 0,
  class: "campus-guide-muted"
};
const _hoisted_2$l = {
  key: 1,
  class: "campus-guide-list"
};
const _hoisted_3$d = ["onClick"];
const _hoisted_4$b = {
  key: 2,
  class: "campus-guide-muted"
};
const _sfc_main$o = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideCollect",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const favorites = ref([]);
    const loading = ref(true);
    onMounted(async () => {
      try {
        await store.loadFavorites();
        const raw = await campusGuideApi.getSaveSpotList({
          scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
          open_id: getCampusGuideOpenId(),
          pn: 1,
          rn: 200
        });
        favorites.value = normalizeSpotList(raw);
      } finally {
        loading.value = false;
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "我的收藏",
        icon: "favorite",
        onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          loading.value ? (openBlock(), createElementBlock("p", _hoisted_1$o, "加载中…")) : (openBlock(), createElementBlock("ul", _hoisted_2$l, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(favorites.value, (spot) => {
              return openBlock(), createElementBlock("li", {
                key: spot.spot_id
              }, [
                createBaseVNode("button", {
                  type: "button",
                  onClick: ($event) => {
                    unref(store).focusSpotOnHome(spot);
                    emit("back");
                  }
                }, [
                  createBaseVNode("strong", null, toDisplayString(spot.name), 1)
                ], 8, _hoisted_3$d)
              ]);
            }), 128))
          ])),
          !loading.value && !favorites.value.length ? (openBlock(), createElementBlock("p", _hoisted_4$b, "暂无收藏地点")) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$n = { class: "campus-entrance-menu" };
const _sfc_main$n = /* @__PURE__ */ defineComponent({
  __name: "EntranceMenu",
  emits: ["about", "route", "collect", "activity", "bus", "mock", "settings"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$n, [
        createBaseVNode("button", {
          type: "button",
          onClick: _cache[0] || (_cache[0] = ($event) => emit("about"))
        }, "概况"),
        createBaseVNode("button", {
          type: "button",
          onClick: _cache[1] || (_cache[1] = ($event) => emit("route"))
        }, "路线"),
        createBaseVNode("button", {
          type: "button",
          onClick: _cache[2] || (_cache[2] = ($event) => emit("collect"))
        }, "收藏"),
        createBaseVNode("button", {
          type: "button",
          onClick: _cache[3] || (_cache[3] = ($event) => emit("activity"))
        }, "活动"),
        createBaseVNode("button", {
          type: "button",
          onClick: _cache[4] || (_cache[4] = ($event) => emit("bus"))
        }, "班车"),
        createBaseVNode("button", {
          type: "button",
          onClick: _cache[5] || (_cache[5] = ($event) => emit("mock"))
        }, "模拟定位"),
        createBaseVNode("button", {
          type: "button",
          onClick: _cache[6] || (_cache[6] = ($event) => emit("settings"))
        }, "设置")
      ]);
    };
  }
});
const _hoisted_1$m = { class: "campus-notice-text" };
const _sfc_main$m = /* @__PURE__ */ defineComponent({
  __name: "NoticeBar",
  props: {
    notice: {}
  },
  emits: ["open"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    return (_ctx, _cache) => {
      return __props.notice?.title ? (openBlock(), createElementBlock("button", {
        key: 0,
        class: "campus-notice-bar",
        type: "button",
        onClick: _cache[0] || (_cache[0] = ($event) => emit("open"))
      }, [
        _cache[1] || (_cache[1] = createBaseVNode("span", { class: "campus-notice-tag" }, "公告", -1)),
        createBaseVNode("span", _hoisted_1$m, toDisplayString(__props.notice.title), 1)
      ])) : createCommentVNode("", true);
    };
  }
});
const _hoisted_1$l = {
  key: 0,
  class: "campus-poi-card"
};
const _hoisted_2$k = { class: "campus-poi-head" };
const _hoisted_3$c = {
  key: 0,
  class: "campus-poi-desc"
};
const _hoisted_4$a = { class: "campus-poi-actions" };
const _sfc_main$l = /* @__PURE__ */ defineComponent({
  __name: "PoiCard",
  props: {
    spot: {},
    userLocation: {}
  },
  emits: ["detail", "navigate", "favorite", "audio", "close"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const distanceText = computed(() => {
      if (!props.spot) return "";
      if (props.spot.distancer) return props.spot.distancer;
      const point = props.spot.point;
      if (!point) return "";
      return distanceUnit(distanceMeters(props.userLocation, point));
    });
    return (_ctx, _cache) => {
      return __props.spot ? (openBlock(), createElementBlock("section", _hoisted_1$l, [
        createBaseVNode("button", {
          class: "campus-poi-close",
          type: "button",
          "aria-label": "关闭",
          onClick: _cache[0] || (_cache[0] = ($event) => emit("close"))
        }, "×"),
        createBaseVNode("div", _hoisted_2$k, [
          createBaseVNode("h3", null, toDisplayString(__props.spot.name), 1),
          createBaseVNode("span", null, toDisplayString(distanceText.value || "距离计算中"), 1)
        ]),
        __props.spot.introduction || __props.spot.info ? (openBlock(), createElementBlock("p", _hoisted_3$c, toDisplayString(__props.spot.introduction || __props.spot.info), 1)) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_4$a, [
          createBaseVNode("button", {
            type: "button",
            onClick: _cache[1] || (_cache[1] = ($event) => emit("detail"))
          }, "详情"),
          createBaseVNode("button", {
            type: "button",
            onClick: _cache[2] || (_cache[2] = ($event) => emit("audio"))
          }, "讲解"),
          createBaseVNode("button", {
            type: "button",
            onClick: _cache[3] || (_cache[3] = ($event) => emit("favorite"))
          }, toDisplayString(__props.spot.is_saved ? "已收藏" : "收藏"), 1),
          createBaseVNode("button", {
            type: "button",
            class: "primary",
            onClick: _cache[4] || (_cache[4] = ($event) => emit("navigate"))
          }, "导航")
        ])
      ])) : createCommentVNode("", true);
    };
  }
});
let currentAudio = null;
const stopSpeech = () => {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
};
const stopCampusAudio = () => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  stopSpeech();
};
const playCampusAudioUrl = async (url) => {
  stopCampusAudio();
  if (!url) return false;
  currentAudio = new Audio(url);
  try {
    await currentAudio.play();
    return true;
  } catch {
    currentAudio = null;
    return false;
  }
};
const speakCampusText = (text) => {
  stopCampusAudio();
  const content = String(text || "").trim();
  if (!content || typeof window === "undefined" || !window.speechSynthesis) return false;
  const utterance = new SpeechSynthesisUtterance(content);
  utterance.lang = "zh-CN";
  utterance.rate = 1;
  utterance.onend = () => {
  };
  window.speechSynthesis.speak(utterance);
  return true;
};
const playCampusSpeech = async (speech, fallbackText) => {
  if (Array.isArray(speech) && speech[0] && typeof speech[0] === "object") {
    const item = speech[0];
    const url = String(item.audio || item.url || "").trim();
    if (url && await playCampusAudioUrl(url)) return true;
  }
  if (speech && typeof speech === "object") {
    const item = speech;
    const url = String(item.audio || item.url || "").trim();
    if (url && await playCampusAudioUrl(url)) return true;
  }
  return speakCampusText(fallbackText || "");
};
const MICRO_DEGREE_THRESHOLD = 1e3;
const isMicroDegreePolyline = (lat, lng) => Math.abs(lat) > MICRO_DEGREE_THRESHOLD || Math.abs(lng) > MICRO_DEGREE_THRESHOLD;
const decodeDeltaPolyline = (raw) => {
  if (!Array.isArray(raw) || raw.length < 2) return [];
  const coors = raw.map((item) => {
    const n = Number(item);
    return Number.isFinite(n) ? n : NaN;
  });
  if (coors.length < 2) return [];
  const firstLat = coors[0];
  const firstLng = coors[1];
  if (!Number.isFinite(firstLat) || !Number.isFinite(firstLng)) return [];
  if (isMicroDegreePolyline(firstLat, firstLng)) {
    const values2 = [];
    let lat = firstLat / 1e6;
    let lng = firstLng / 1e6;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    values2.push(lat, lng);
    for (let index = 2; index + 1 < coors.length; index += 2) {
      const deltaLat = coors[index];
      const deltaLng = coors[index + 1];
      if (!Number.isFinite(deltaLat) || !Number.isFinite(deltaLng)) continue;
      lat += deltaLat / 1e6;
      lng += deltaLng / 1e6;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      values2.push(lat, lng);
    }
    return values2;
  }
  const values = coors.slice();
  for (let index = 2; index < values.length; index += 1) {
    const base = values[index - 2];
    const delta = values[index];
    if (!Number.isFinite(base) || !Number.isFinite(delta)) {
      values[index] = NaN;
      continue;
    }
    values[index] = base + delta / 1e6;
  }
  return values;
};
const polylineToPoints = (raw) => {
  const values = decodeDeltaPolyline(raw);
  const points = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    const latitude = values[index];
    const longitude = values[index + 1];
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    points.push({ latitude, longitude });
  }
  return points;
};
const toCoord = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
};
const isValidGeoPoint = (point) => {
  if (!point) return false;
  const lat = toCoord(point.latitude);
  const lng = toCoord(point.longitude);
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};
const resolveNavEndPoint = (spot, explicitEndPoint) => {
  if (isValidGeoPoint(explicitEndPoint)) return explicitEndPoint;
  if (isValidGeoPoint(spot?.point)) return spot.point;
  const lat = toCoord(spot?.latitude);
  const lng = toCoord(spot?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const point = { latitude: lat, longitude: lng };
  return isValidGeoPoint(point) ? point : null;
};
const extractWalkPolyline = (raw) => {
  if (raw == null) return null;
  const asPolylineArray = (value) => {
    if (!Array.isArray(value) || value.length < 2) return null;
    if (typeof value[0] === "number" || typeof value[0] === "string") {
      return value;
    }
    if (Array.isArray(value[0])) {
      const flat = [];
      for (const pair of value) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        flat.push(pair[0], pair[1]);
      }
      return flat.length >= 2 ? flat : null;
    }
    return null;
  };
  const fromObject = (obj) => {
    const direct = asPolylineArray(obj.polyline);
    if (direct) return direct;
    const routes = obj.routes ?? obj.route ?? obj.list ?? obj.paths;
    if (Array.isArray(routes) && routes.length > 0) {
      const first = routes[0];
      if (first && typeof first === "object") {
        const nested = fromObject(first);
        if (nested) return nested;
      }
      const flat = asPolylineArray(routes);
      if (flat) return flat;
    }
    if (typeof obj.polyline === "string" && obj.polyline.trim()) {
      const parts = obj.polyline.split(/[;,\s]+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) return parts;
    }
    return null;
  };
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    if (raw[0] && typeof raw[0] === "object" && !Array.isArray(raw[0])) {
      return fromObject(raw[0]);
    }
    return asPolylineArray(raw);
  }
  if (typeof raw === "object") {
    return fromObject(raw);
  }
  return null;
};
const fetchCampusWalkRoute = async (start, end) => {
  if (!isValidGeoPoint(start) || !isValidGeoPoint(end)) {
    return {
      points: [],
      distance: void 0,
      duration: void 0,
      raw: void 0
    };
  }
  const raw = await campusGuideApi.getWalkRoute({
    startLng: Number(start.longitude),
    startLat: Number(start.latitude),
    endLng: Number(end.longitude),
    endLat: Number(end.latitude)
  });
  const dataCandidate = Array.isArray(raw) ? raw[0] : raw;
  const data = dataCandidate && typeof dataCandidate === "object" ? dataCandidate : {};
  let points = [];
  try {
    const polyline = extractWalkPolyline(data) ?? extractWalkPolyline(raw);
    if (polyline) {
      points = polylineToPoints(polyline).filter(isValidGeoPoint);
    }
  } catch {
    points = [];
  }
  return {
    points,
    distance: data?.distance,
    duration: data?.duration,
    raw: data
  };
};
const buildTencentWalkRouteUrl = (end, name = "目的地", from) => {
  if (!isValidGeoPoint(end)) return null;
  const lat = Number(end.latitude);
  const lng = Number(end.longitude);
  const label = encodeURIComponent(name);
  const referer = encodeURIComponent(CAMPUS_GUIDE_CONFIG.qqMapKey);
  const fromPart = from && isValidGeoPoint(from) ? `&fromcoord=${Number(from.latitude)},${Number(from.longitude)}` : "";
  return `https://apis.map.qq.com/uri/v1/routeplan?type=walk&to=${label}&tocoord=${lat},${lng}${fromPart}&referer=${referer}`;
};
const openExternalMapNavigation = async (end, name = "目的地", from) => {
  if (!isValidGeoPoint(end)) return false;
  const lat = Number(end.latitude);
  const lng = Number(end.longitude);
  const label = encodeURIComponent(name);
  const tencentUrl = buildTencentWalkRouteUrl(end, name, from);
  const candidates = [
    tencentUrl,
    `https://uri.amap.com/navigation?to=${lng},${lat},${label}&mode=walk&coordinate=gaode`,
    `https://map.baidu.com/mobile/webapp/search/search/qt=nav&sn=0&en=1&end=${lat},${lng}`
  ].filter(Boolean);
  for (const url of candidates) {
    if (await openExternal(url)) return true;
  }
  return false;
};
const formatWalkDuration = (seconds) => {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "";
  const minutes = total < 60 ? 1 : Math.round(total / 60);
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}小时${rest}分钟` : `${hours}小时`;
};
const _hoisted_1$k = { class: "campus-guide-root campus-guide-root--immersive" };
const _hoisted_2$j = {
  key: 0,
  class: "campus-guide-status"
};
const _hoisted_3$b = {
  key: 1,
  class: "campus-guide-status is-error"
};
const _hoisted_4$9 = {
  key: 2,
  class: "campus-guide-status"
};
const _hoisted_5$7 = { class: "campus-guide-map-stage" };
const _hoisted_6$5 = { class: "campus-guide-map-shell campus-guide-map-shell--immersive" };
const _hoisted_7$4 = { class: "campus-guide-map-controls" };
const _hoisted_8$3 = { class: "campus-guide-top-panel" };
const _hoisted_9$1 = {
  key: 1,
  class: "campus-guide-tabs"
};
const _hoisted_10$1 = ["disabled", "onClick"];
const _hoisted_11$1 = {
  key: 2,
  class: "campus-guide-muted campus-guide-tab-status"
};
const _hoisted_12 = {
  key: 3,
  class: "campus-guide-muted campus-guide-tab-status"
};
const _hoisted_13 = {
  key: 4,
  class: "campus-guide-muted campus-guide-tab-status"
};
const _hoisted_14 = { class: "campus-guide-fab-group" };
const _hoisted_15 = ["disabled"];
const _hoisted_16 = {
  key: 1,
  class: "campus-guide-poi-layer"
};
const _sfc_main$k = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideHome",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const mapContainerRef = ref(null);
    const mapCore = ref(null);
    const locating = ref(false);
    const showEntrance = ref(false);
    const activePoi = ref(null);
    const store = useCampusGuideStore();
    const topNotice = computed(() => store.notices[0] || null);
    const guideTags = computed(() => store.tags);
    const setActivePoi = (spot) => {
      activePoi.value = spot;
      store.selectedSpot = spot;
    };
    const handleMarkerClick = (spot) => {
      setActivePoi(spot);
      mapCore.value?.renderSpots(store.spots, spot.spot_id);
      mapCore.value?.setCenter(
        spot.point || { latitude: Number(spot.latitude), longitude: Number(spot.longitude) },
        CAMPUS_GUIDE_CONFIG.defaultZoom
      );
      void store.selectSpot(spot).then((detail) => {
        if (detail) activePoi.value = detail;
      });
    };
    const fitSpotsOnMap = () => {
      if (!mapCore.value || !store.spots.length) return;
      const points = store.spots.map((spot) => spot.point || { latitude: Number(spot.latitude), longitude: Number(spot.longitude) }).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
      if (points.length) mapCore.value.fitPoints(points);
    };
    const refreshMapMarkers = async (selectedId) => {
      await nextTick();
      if (!mapCore.value) return;
      const activeId = activePoi.value?.spot_id ?? store.selectedSpot?.spot_id;
      mapCore.value.renderSpots([...store.spots], activeId);
      mapCore.value.renderLocation(store.userLocation);
    };
    const syncMapData = () => {
      void refreshMapMarkers();
    };
    const initMap = async () => {
      await nextTick();
      const container = mapContainerRef.value;
      if (!container || mapCore.value) return;
      const core = new CampusMapCore(container, {
        center: store.mapCenter,
        aoiRings: store.scenic?.aoi || [],
        selectedSpotId: activePoi.value?.spot_id,
        onMarkerClick: handleMarkerClick,
        onZoomChange: () => syncMapData()
      });
      await core.init();
      mapCore.value = core;
      await refreshMapMarkers();
      store.mapReady = true;
      fitSpotsOnMap();
      requestAnimationFrame(() => mapCore.value?.resize());
    };
    const handleLocate = async () => {
      if (locating.value) return;
      locating.value = true;
      try {
        const point = await store.refreshLocation();
        mapCore.value?.setCenter(point, CAMPUS_GUIDE_CONFIG.defaultZoom);
        mapCore.value?.renderLocation(point);
        const meta = getLastLocationMeta();
        if (meta.source === "policy") {
          showToast("当前版本使用默认校区位置", "warning", 2200);
        } else if (meta.source === "fallback") {
          showToast(meta.error || "定位失败，已使用校区中心", "warning", 2400);
        } else if (meta.source === "mock") {
          showToast("已使用模拟定位", "success", 1600);
        } else {
          showToast(store.insideScenic ? "已定位到校园内" : "已定位，当前在校外", "success", 1800);
        }
      } catch (err) {
        showToast(err?.message || "定位失败", "error", 2200);
      } finally {
        locating.value = false;
      }
    };
    const handleTagClick = async (tag) => {
      if (tag === store.activeTag || store.spotsLoading) return;
      try {
        setActivePoi(null);
        const spots = await store.selectTag(tag);
        await refreshMapMarkers();
        mapCore.value?.refreshMarkers(true);
        fitSpotsOnMap();
        window.setTimeout(() => {
          mapCore.value?.resize();
          mapCore.value?.refreshMarkers(true);
        }, 280);
        if (!spots.length) {
          showToast("该分类下暂时没有点位", "warning", 1800);
        } else if ((mapCore.value?.getLastPaintedMarkerCount() ?? 0) === 0) {
          showToast("点位数据缺少有效坐标，地图无法标注", "warning", 2200);
        }
      } catch (err) {
        showToast(err?.message || "加载分类失败", "error", 2200);
      }
    };
    const closePoiCard = () => {
      setActivePoi(null);
      void store.selectSpot(null);
      mapCore.value?.renderSpots(store.spots);
    };
    const startNavigation = () => {
      const spot = activePoi.value;
      const endPoint = resolveNavEndPoint(spot);
      if (!spot || !endPoint) {
        showToast("该点位缺少坐标，无法导航", "warning", 1800);
        return;
      }
      store.navigateTo(CAMPUS_GUIDE_VIEWS.walkline, {
        spot,
        endPoint
      });
    };
    const handleFavorite = async () => {
      if (!activePoi.value) return;
      await store.toggleFavorite(activePoi.value);
      activePoi.value = store.selectedSpot;
      showToast(activePoi.value?.is_saved ? "已收藏" : "已取消收藏", "success", 1500);
    };
    const handleAudio = async () => {
      if (!activePoi.value) return;
      const ok = await playCampusSpeech(
        activePoi.value.speech,
        activePoi.value.introduction || activePoi.value.info
      );
      if (!ok) showToast("暂无语音讲解", "warning", 1800);
    };
    onMounted(async () => {
      try {
        if (!store.mapReady) await store.bootstrap();
        activePoi.value = store.selectedSpot;
        await initMap();
        window.setTimeout(() => {
          mapCore.value?.resize();
          void refreshMapMarkers();
          if (!store.spots.length && !store.loading && !store.spotsLoading) {
            showToast("当前分类暂无点位，可切换分类或检查网络", "warning", 2200);
          }
        }, 320);
      } catch {
      }
    });
    watch(
      () => [store.activeTag, store.spots.map((s) => s.spot_id).join(",")],
      () => {
        void refreshMapMarkers();
      }
    );
    watch(
      () => store.userLocation,
      () => mapCore.value?.renderLocation(store.userLocation),
      { deep: true }
    );
    watch(
      () => store.selectedSpot,
      (spot) => {
        if (spot?.spot_id !== activePoi.value?.spot_id) {
          activePoi.value = spot;
        }
        if (!mapCore.value) return;
        mapCore.value.renderSpots(store.spots, spot?.spot_id);
      }
    );
    onActivated(() => {
      activePoi.value = store.selectedSpot;
      syncMapData();
      if (store.selectedSpot) {
        mapCore.value?.setCenter(
          store.selectedSpot.point || {
            latitude: Number(store.selectedSpot.latitude),
            longitude: Number(store.selectedSpot.longitude)
          },
          CAMPUS_GUIDE_CONFIG.defaultZoom
        );
      }
    });
    onBeforeUnmount(() => {
      mapCore.value?.destroy();
      mapCore.value = null;
      store.mapReady = false;
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$k, [
        createVNode(unref(_sfc_main$u), {
          title: "校园导览",
          icon: "map",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }),
        unref(store).offline ? (openBlock(), createElementBlock("div", _hoisted_2$j, "离线模式 · 缓存更新于 " + toDisplayString(unref(store).cacheUpdatedAt || "未知"), 1)) : createCommentVNode("", true),
        unref(store).error ? (openBlock(), createElementBlock("div", _hoisted_3$b, toDisplayString(unref(store).error), 1)) : unref(store).loading && !unref(store).mapReady ? (openBlock(), createElementBlock("div", _hoisted_4$9, "正在加载校园地图与 POI 数据…")) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_5$7, [
          createBaseVNode("div", _hoisted_6$5, [
            createBaseVNode("div", {
              ref_key: "mapContainerRef",
              ref: mapContainerRef,
              class: "campus-guide-map-canvas"
            }, null, 512)
          ]),
          createBaseVNode("div", _hoisted_7$4, [
            createBaseVNode("div", _hoisted_8$3, [
              createBaseVNode("button", {
                class: "campus-guide-search",
                type: "button",
                onClick: _cache[1] || (_cache[1] = ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).search))
              }, " 搜索教学楼、食堂、场馆… "),
              topNotice.value ? (openBlock(), createBlock(_sfc_main$m, {
                key: 0,
                notice: topNotice.value,
                onOpen: _cache[2] || (_cache[2] = ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).noticeDetail, { noticeId: topNotice.value.id }))
              }, null, 8, ["notice"])) : createCommentVNode("", true),
              guideTags.value.length ? (openBlock(), createElementBlock("div", _hoisted_9$1, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(guideTags.value, (item) => {
                  return openBlock(), createElementBlock("button", {
                    key: item.tag,
                    type: "button",
                    class: normalizeClass({ active: item.tag === unref(store).activeTag }),
                    disabled: unref(store).spotsLoading,
                    onClick: ($event) => handleTagClick(item.tag)
                  }, toDisplayString(item.name || item.tag), 11, _hoisted_10$1);
                }), 128))
              ])) : createCommentVNode("", true),
              unref(store).spotsLoading ? (openBlock(), createElementBlock("p", _hoisted_11$1, "正在切换分类…")) : unref(store).activeTag && !unref(store).spots.length ? (openBlock(), createElementBlock("p", _hoisted_12, " 当前分类暂无点位 ")) : unref(store).activeTag ? (openBlock(), createElementBlock("p", _hoisted_13, " 共 " + toDisplayString(unref(store).spots.length) + " 个点位 ", 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_14, [
              createBaseVNode("button", {
                class: "campus-guide-fab",
                type: "button",
                title: "菜单",
                onClick: _cache[3] || (_cache[3] = ($event) => showEntrance.value = !showEntrance.value)
              }, "☰"),
              createBaseVNode("button", {
                class: "campus-guide-fab",
                disabled: locating.value,
                title: "定位",
                onClick: handleLocate
              }, toDisplayString(locating.value ? "…" : "◎"), 9, _hoisted_15)
            ]),
            showEntrance.value ? (openBlock(), createBlock(_sfc_main$n, {
              key: 0,
              class: "campus-guide-entrance-floating",
              onAbout: _cache[4] || (_cache[4] = ($event) => {
                unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).about);
                showEntrance.value = false;
              }),
              onRoute: _cache[5] || (_cache[5] = ($event) => {
                unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).route);
                showEntrance.value = false;
              }),
              onCollect: _cache[6] || (_cache[6] = ($event) => {
                unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).collect);
                showEntrance.value = false;
              }),
              onActivity: _cache[7] || (_cache[7] = ($event) => {
                unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).activity);
                showEntrance.value = false;
              }),
              onBus: _cache[8] || (_cache[8] = ($event) => {
                unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).bus);
                showEntrance.value = false;
              }),
              onMock: _cache[9] || (_cache[9] = ($event) => {
                unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).mockLocation);
                showEntrance.value = false;
              }),
              onSettings: _cache[10] || (_cache[10] = ($event) => {
                unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).settings);
                showEntrance.value = false;
              })
            })) : createCommentVNode("", true),
            activePoi.value ? (openBlock(), createElementBlock("div", _hoisted_16, [
              createVNode(_sfc_main$l, {
                spot: activePoi.value,
                "user-location": unref(store).userLocation,
                onClose: closePoiCard,
                onDetail: _cache[11] || (_cache[11] = ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).poi, { spot: activePoi.value, spotId: activePoi.value.spot_id })),
                onNavigate: startNavigation,
                onFavorite: handleFavorite,
                onAudio: handleAudio
              }, null, 8, ["spot", "user-location"])
            ])) : createCommentVNode("", true)
          ])
        ])
      ]);
    };
  }
});
const _hoisted_1$j = { class: "campus-guide-page campus-guide-hub" };
const _hoisted_2$i = { class: "campus-guide-page-body" };
const _hoisted_3$a = { class: "campus-guide-title" };
const _sfc_main$j = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideHub",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const openGuide = () => store.navigateTo(CAMPUS_GUIDE_VIEWS.home);
    onMounted(() => {
      if (!store.scenic) void store.bootstrap().catch(() => void 0);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$j, [
        createVNode(unref(_sfc_main$u), {
          title: "湖工大导览",
          icon: "explore",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }),
        createBaseVNode("div", _hoisted_2$i, [
          unref(store).scenic?.screen_url ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "campus-guide-hub-cover",
            style: normalizeStyle({ backgroundImage: `url(${unref(store).scenic.screen_url})` })
          }, null, 4)) : createCommentVNode("", true),
          createBaseVNode("h2", _hoisted_3$a, toDisplayString(unref(store).scenic?.name || "湖北工业大学"), 1),
          _cache[2] || (_cache[2] = createBaseVNode("p", { class: "campus-guide-muted" }, "正在进入校园导览地图…", -1)),
          createBaseVNode("div", { class: "campus-guide-hub-actions" }, [
            createBaseVNode("button", {
              type: "button",
              class: "campus-guide-hub-card primary",
              onClick: openGuide
            }, [..._cache[1] || (_cache[1] = [
              createBaseVNode("strong", null, "校园导览", -1),
              createBaseVNode("span", null, "手绘地图 · POI · 导航", -1)
            ])])
          ])
        ])
      ]);
    };
  }
});
const _hoisted_1$i = { class: "campus-guide-field" };
const _hoisted_2$h = { class: "campus-guide-field" };
const _sfc_main$i = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideMockLocation",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const lat = ref(String(readMockLocation()?.latitude ?? store.userLocation.latitude));
    const lng = ref(String(readMockLocation()?.longitude ?? store.userLocation.longitude));
    const applyMock = async () => {
      const latitude = Number(lat.value);
      const longitude = Number(lng.value);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        showToast("请输入有效坐标", "warning", 1800);
        return;
      }
      writeMockLocation({ latitude, longitude, name: "模拟定位" });
      await store.refreshLocation();
      showToast("模拟定位已应用", "success", 1500);
    };
    const clearMock = async () => {
      writeMockLocation(null);
      await store.refreshLocation();
      const point = await resolveCampusLocation();
      lat.value = String(point.latitude);
      lng.value = String(point.longitude);
      showToast("已恢复真实定位", "success", 1500);
    };
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "模拟定位",
        icon: "my_location",
        onBack: _cache[2] || (_cache[2] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          createBaseVNode("label", _hoisted_1$i, [
            _cache[3] || (_cache[3] = createBaseVNode("span", null, "纬度 latitude", -1)),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => lat.value = $event),
              class: "campus-guide-input"
            }, null, 512), [
              [vModelText, lat.value]
            ])
          ]),
          createBaseVNode("label", _hoisted_2$h, [
            _cache[4] || (_cache[4] = createBaseVNode("span", null, "经度 longitude", -1)),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => lng.value = $event),
              class: "campus-guide-input"
            }, null, 512), [
              [vModelText, lng.value]
            ])
          ]),
          createBaseVNode("div", { class: "campus-guide-action-row" }, [
            createBaseVNode("button", {
              type: "button",
              class: "primary",
              onClick: applyMock
            }, "应用模拟定位"),
            createBaseVNode("button", {
              type: "button",
              onClick: clearMock
            }, "清除")
          ])
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$h = { class: "campus-guide-title" };
const _hoisted_2$g = { class: "campus-guide-article pre" };
const _sfc_main$h = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideNoticeDetail",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const notice = computed(() => {
      const targetId = String(store.navParams.noticeId ?? "");
      return store.notices.find((item) => String(item.id) === targetId) ?? null;
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "公告详情",
        icon: "campaign",
        onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          notice.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            createBaseVNode("h2", _hoisted_1$h, toDisplayString(notice.value.title), 1),
            createBaseVNode("article", _hoisted_2$g, toDisplayString(notice.value.content), 1)
          ], 64)) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$g = { class: "campus-guide-list" };
const _hoisted_2$f = ["onClick"];
const _sfc_main$g = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideNoticeList",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "通知公告",
        icon: "campaign",
        onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          createBaseVNode("ul", _hoisted_1$g, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(store).notices, (item) => {
              return openBlock(), createElementBlock("li", {
                key: item.id
              }, [
                createBaseVNode("button", {
                  type: "button",
                  onClick: ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).noticeDetail, { noticeId: item.id })
                }, [
                  createBaseVNode("strong", null, toDisplayString(item.title), 1)
                ], 8, _hoisted_2$f)
              ]);
            }), 128))
          ])
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$f = {
  key: 0,
  class: "campus-guide-muted"
};
const _hoisted_2$e = { class: "campus-guide-title" };
const _hoisted_3$9 = { class: "campus-guide-muted" };
const _hoisted_4$8 = { class: "campus-guide-article" };
const _hoisted_5$6 = { class: "campus-guide-action-row" };
const _sfc_main$f = /* @__PURE__ */ defineComponent({
  __name: "CampusGuidePoiDetail",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const detail = ref(store.navParams.spot || store.selectedSpot);
    const loading = ref(false);
    onMounted(async () => {
      const spotId = store.navParams.spotId || detail.value?.spot_id;
      if (!spotId) return;
      loading.value = true;
      try {
        detail.value = await store.loadSpotDetail(spotId);
      } catch (err) {
        showToast(err?.message || "加载详情失败", "error", 2200);
      } finally {
        loading.value = false;
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "地点详情",
        icon: "place",
        onBack: _cache[3] || (_cache[3] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          loading.value ? (openBlock(), createElementBlock("div", _hoisted_1$f, "加载中…")) : detail.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("h2", _hoisted_2$e, toDisplayString(detail.value.name), 1),
            createBaseVNode("p", _hoisted_3$9, toDisplayString(detail.value.distancer), 1),
            createBaseVNode("article", _hoisted_4$8, toDisplayString(detail.value.introduction || detail.value.info || "暂无详细介绍"), 1),
            createBaseVNode("div", _hoisted_5$6, [
              createBaseVNode("button", {
                type: "button",
                onClick: _cache[0] || (_cache[0] = ($event) => unref(playCampusSpeech)(detail.value.speech, detail.value.introduction))
              }, "语音讲解"),
              createBaseVNode("button", {
                type: "button",
                onClick: _cache[1] || (_cache[1] = ($event) => unref(store).toggleFavorite(detail.value))
              }, toDisplayString(detail.value.is_saved ? "取消收藏" : "收藏"), 1),
              createBaseVNode("button", {
                type: "button",
                class: "primary",
                onClick: _cache[2] || (_cache[2] = ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).walkline, {
                  spot: detail.value,
                  endPoint: unref(resolveNavEndPoint)(detail.value)
                }))
              }, " 导航 ")
            ])
          ], 64)) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
});
const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
};
const padNumberArr = (number) => {
  const text = String(number);
  return ("00000" + text).slice(-5).split("");
};
const normalizePunchCard = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const data = raw;
  const cardId = data.card_id ?? data.id;
  const name = String(data.name || data.title || "").trim();
  const number = toNumber(data.number);
  if (!cardId || !name) return null;
  const lat = toNumber(data.latitude ?? data.lat);
  const lng = toNumber(data.longitude ?? data.lng ?? data.lon);
  const point = Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : void 0;
  return {
    card_id: cardId,
    name,
    number: Number.isFinite(number) ? number : 0,
    numberArr: Array.isArray(data.numberArr) ? data.numberArr : padNumberArr(Number.isFinite(number) ? number : 0),
    is_check: Boolean(data.is_check),
    latitude: point?.latitude,
    longitude: point?.longitude,
    point,
    pic: data.pic ? String(data.pic) : void 0,
    info: data.info ? String(data.info) : void 0,
    spot_id: data.spot_id,
    raw
  };
};
const normalizePunchCardList = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  const list = Array.isArray(data.card_list) ? data.card_list : [];
  const card_list = list.map(normalizePunchCard).filter(Boolean);
  return {
    card_list,
    total: card_list.length,
    checkedTotal: card_list.filter((item) => item.is_check).length,
    compose_url: data.compose_url ? String(data.compose_url) : void 0,
    raw
  };
};
const normalizeShirtSlot = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const data = raw;
  return {
    id: data.id ?? data.shirt_id,
    name: data.name ? String(data.name) : void 0,
    pic: data.pic ? String(data.pic) : void 0,
    position_z: toNumber(data.position_z),
    raw
  };
};
const normalizeShirtInfo = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  const list = (Array.isArray(data.list) ? data.list : []).map(normalizeShirtSlot).filter(Boolean);
  const frontList = list.filter((item) => item.position_z === 0);
  const behindList = list.filter((item) => item.position_z === 1);
  return {
    isJoin: Number(data.enroll) === 1,
    number: toNumber(data.number),
    frontList: frontList.length ? frontList : list.filter((_, index) => index % 2 === 0),
    behindList: behindList.length ? behindList : list.filter((_, index) => index % 2 === 1),
    list,
    raw
  };
};
const normalizeStudentCardInfo = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    name: data.name ? String(data.name) : void 0,
    college: data.college ? String(data.college) : void 0,
    major: data.major ? String(data.major) : void 0,
    grade: data.grade ? String(data.grade) : void 0,
    student_no: data.student_no ? String(data.student_no) : void 0,
    avatar: data.avatar ? String(data.avatar) : void 0,
    card_url: data.card_url ? String(data.card_url) : void 0,
    raw
  };
};
const PHASE2_ENDPOINTS = Object.freeze({
  cardList: "/hbut/card/list",
  cardCheck: "/card/check",
  cardCompose: "/card/compose",
  shirtInfo: "/hbut/shirt/info",
  shirtEnroll: "/hbut/shirt/enroll",
  shirtSign: "/hbut/shirt/sign",
  shirtUnlock: "/hbut/shirt/unlock",
  studentCardInfo: "/hbut/student_card/info",
  studentCardUpdate: "/hbut/student_card/update",
  openIdUpdate: "/hbut/open_id/update"
});
const withScenic = (params = {}) => ({
  scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
  ...params
});
const phase2Api = {
  getCardList: async (params = {}) => normalizePunchCardList(await wisdomPost(PHASE2_ENDPOINTS.cardList, withScenic(params))),
  postCardCheck: (params = {}) => wisdomPost(PHASE2_ENDPOINTS.cardCheck, withScenic(params)),
  postCardCompose: (params = {}) => wisdomPost(PHASE2_ENDPOINTS.cardCompose, withScenic(params)),
  getShirtInfo: async (params = {}) => normalizeShirtInfo(await wisdomPost(PHASE2_ENDPOINTS.shirtInfo, params)),
  postShirtEnroll: (params = {}) => wisdomPost(PHASE2_ENDPOINTS.shirtEnroll, params),
  postShirtSign: (params = {}) => wisdomPost(PHASE2_ENDPOINTS.shirtSign, params),
  postShirtUnlock: (params = {}) => wisdomPost(PHASE2_ENDPOINTS.shirtUnlock, params),
  getStudentCardInfo: async (params = {}) => normalizeStudentCardInfo(await wisdomPost(PHASE2_ENDPOINTS.studentCardInfo, withScenic(params))),
  updateStudentCard: (params = {}) => wisdomPost(PHASE2_ENDPOINTS.studentCardUpdate, withScenic(params)),
  updateOpenIdInfo: (params = {}) => wisdomPost(PHASE2_ENDPOINTS.openIdUpdate, withScenic(params))
};
const CHECK_RADIUS_METERS = 120;
const loadPunchCards = async () => phase2Api.getCardList({ open_id: getCampusGuideOpenId() });
const checkInPunchCard = async (card, location) => {
  if (!card.point) throw new Error("该打卡点缺少坐标信息");
  const distance = distanceMeters(location, card.point);
  if (distance > CHECK_RADIUS_METERS) {
    throw new Error(`距离打卡点还有 ${Math.round(distance)} 米，请靠近后再试`);
  }
  await phase2Api.postCardCheck({
    open_id: getCampusGuideOpenId(),
    card_id: card.card_id,
    latitude: location.latitude,
    longitude: location.longitude
  });
  return loadPunchCards();
};
const composePunchPostcard = async () => {
  const result = await phase2Api.postCardCompose({ open_id: getCampusGuideOpenId() });
  return String(result?.compose_url || result?.url || "");
};
const loadStudentCard = async () => phase2Api.getStudentCardInfo({ open_id: getCampusGuideOpenId() });
const saveStudentCard = async (payload) => phase2Api.updateStudentCard({
  open_id: getCampusGuideOpenId(),
  scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
  ...payload
});
const canCheckInCard = (card, location) => {
  if (!card.point || card.is_check) return false;
  return distanceMeters(location, card.point) <= CHECK_RADIUS_METERS;
};
const _hoisted_1$e = {
  key: 0,
  class: "campus-guide-muted"
};
const _hoisted_2$d = ["src"];
const _hoisted_3$8 = { class: "campus-guide-field" };
const _hoisted_4$7 = { class: "campus-guide-field" };
const _hoisted_5$5 = { class: "campus-guide-field" };
const _hoisted_6$4 = { class: "campus-guide-field" };
const _hoisted_7$3 = { class: "campus-guide-field" };
const _hoisted_8$2 = ["disabled"];
const _sfc_main$e = /* @__PURE__ */ defineComponent({
  __name: "CampusGuidePunchAlumniCard",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const form = ref({});
    const loading = ref(true);
    const saving = ref(false);
    const refresh = async () => {
      form.value = await loadStudentCard();
    };
    const handleSave = async () => {
      saving.value = true;
      try {
        await saveStudentCard({
          name: form.value.name,
          college: form.value.college,
          major: form.value.major,
          grade: form.value.grade,
          student_no: form.value.student_no
        });
        await refresh();
        showToast("校友卡已保存", "success", 1500);
      } catch (err) {
        showToast(err?.message || "保存失败", "error", 2200);
      } finally {
        saving.value = false;
      }
    };
    onMounted(async () => {
      try {
        await refresh();
      } catch (err) {
        showToast(err?.message || "校友卡加载失败", "error", 2200);
      } finally {
        loading.value = false;
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "校友卡",
        icon: "badge",
        onBack: _cache[5] || (_cache[5] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          loading.value ? (openBlock(), createElementBlock("p", _hoisted_1$e, "加载中…")) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            form.value.card_url ? (openBlock(), createElementBlock("img", {
              key: 0,
              src: form.value.card_url,
              alt: "校友卡",
              class: "campus-phase2-postcard"
            }, null, 8, _hoisted_2$d)) : createCommentVNode("", true),
            createBaseVNode("label", _hoisted_3$8, [
              _cache[6] || (_cache[6] = createBaseVNode("span", null, "姓名", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.value.name = $event),
                class: "campus-guide-input"
              }, null, 512), [
                [vModelText, form.value.name]
              ])
            ]),
            createBaseVNode("label", _hoisted_4$7, [
              _cache[7] || (_cache[7] = createBaseVNode("span", null, "学院", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.value.college = $event),
                class: "campus-guide-input"
              }, null, 512), [
                [vModelText, form.value.college]
              ])
            ]),
            createBaseVNode("label", _hoisted_5$5, [
              _cache[8] || (_cache[8] = createBaseVNode("span", null, "专业", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.major = $event),
                class: "campus-guide-input"
              }, null, 512), [
                [vModelText, form.value.major]
              ])
            ]),
            createBaseVNode("label", _hoisted_6$4, [
              _cache[9] || (_cache[9] = createBaseVNode("span", null, "年级", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.value.grade = $event),
                class: "campus-guide-input"
              }, null, 512), [
                [vModelText, form.value.grade]
              ])
            ]),
            createBaseVNode("label", _hoisted_7$3, [
              _cache[10] || (_cache[10] = createBaseVNode("span", null, "学号", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.value.student_no = $event),
                class: "campus-guide-input"
              }, null, 512), [
                [vModelText, form.value.student_no]
              ])
            ]),
            createBaseVNode("button", {
              type: "button",
              class: "campus-guide-primary-btn",
              disabled: saving.value,
              onClick: handleSave
            }, toDisplayString(saving.value ? "保存中…" : "保存校友卡"), 9, _hoisted_8$2)
          ], 64))
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$d = {
  key: 0,
  class: "campus-guide-muted"
};
const _hoisted_2$c = { class: "campus-phase2-progress" };
const _hoisted_3$7 = { class: "campus-entrance-menu campus-phase2-menu" };
const _hoisted_4$6 = { class: "campus-guide-list compact" };
const _sfc_main$d = /* @__PURE__ */ defineComponent({
  __name: "CampusGuidePunchHome",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const cards = ref(null);
    const loading = ref(true);
    const progressText = computed(() => {
      if (!cards.value) return "";
      return `${cards.value.checkedTotal} / ${cards.value.total}`;
    });
    const refresh = async () => {
      loading.value = true;
      try {
        cards.value = await loadPunchCards();
      } catch (err) {
        showToast(err?.message || "打卡数据加载失败", "error", 2200);
      } finally {
        loading.value = false;
      }
    };
    onMounted(() => {
      void refresh();
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "校庆打卡",
        icon: "celebration",
        onBack: _cache[4] || (_cache[4] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          loading.value ? (openBlock(), createElementBlock("p", _hoisted_1$d, "加载中…")) : cards.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("div", _hoisted_2$c, [
              _cache[5] || (_cache[5] = createBaseVNode("strong", null, "打卡进度", -1)),
              createBaseVNode("span", null, toDisplayString(progressText.value), 1)
            ]),
            createBaseVNode("div", _hoisted_3$7, [
              createBaseVNode("button", {
                type: "button",
                onClick: _cache[0] || (_cache[0] = ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).punchMap))
              }, "地图打卡"),
              createBaseVNode("button", {
                type: "button",
                onClick: _cache[1] || (_cache[1] = ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).punchPostcard))
              }, "明信片"),
              createBaseVNode("button", {
                type: "button",
                onClick: _cache[2] || (_cache[2] = ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).punchAlumniCard))
              }, "校友卡"),
              createBaseVNode("button", {
                type: "button",
                onClick: _cache[3] || (_cache[3] = ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).punchMy))
              }, "我的")
            ]),
            createBaseVNode("ul", _hoisted_4$6, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(cards.value.card_list, (card) => {
                return openBlock(), createElementBlock("li", {
                  key: card.card_id
                }, [
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(card.name), 1),
                    createBaseVNode("span", null, toDisplayString(card.is_check ? "已打卡" : "未打卡"), 1)
                  ])
                ]);
              }), 128))
            ])
          ], 64)) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$c = { class: "campus-guide-root campus-guide-root--immersive" };
const _hoisted_2$b = {
  key: 0,
  class: "campus-guide-status"
};
const _hoisted_3$6 = { class: "campus-guide-map-shell campus-guide-map-shell--immersive" };
const _hoisted_4$5 = { class: "campus-guide-overlay" };
const _hoisted_5$4 = {
  key: 0,
  class: "campus-poi-card campus-phase2-check-panel"
};
const _hoisted_6$3 = { class: "campus-guide-muted" };
const _hoisted_7$2 = {
  key: 0,
  class: "campus-guide-muted"
};
const _hoisted_8$1 = ["disabled"];
const _sfc_main$c = /* @__PURE__ */ defineComponent({
  __name: "CampusGuidePunchMap",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const mapContainerRef = ref(null);
    const mapCore = ref(null);
    const cards = ref([]);
    const selected = ref(null);
    const checking = ref(false);
    const loading = ref(true);
    const selectedDistance = computed(() => {
      if (!selected.value?.point) return "";
      return distanceUnit(distanceMeters(store.userLocation, selected.value.point));
    });
    const refreshCards = async () => {
      const result = await loadPunchCards();
      cards.value = result.card_list;
      return result;
    };
    const toSpotLike = (card) => ({
      spot_id: card.card_id,
      name: card.name,
      point: card.point,
      latitude: card.latitude,
      longitude: card.longitude,
      introduction: card.info,
      is_saved: card.is_check
    });
    const initMap = async () => {
      await nextTick();
      const container = mapContainerRef.value;
      if (!container || mapCore.value) return;
      const core = new CampusMapCore(container, {
        center: store.mapCenter,
        aoiRings: store.scenic?.aoi || [],
        onMarkerClick: (spot) => {
          const card = cards.value.find((item) => String(item.card_id) === String(spot.spot_id));
          if (card) selected.value = card;
        }
      });
      await core.init();
      core.renderLocation(store.userLocation);
      mapCore.value = core;
      requestAnimationFrame(() => mapCore.value?.resize());
    };
    const syncMarkers = () => {
      if (!mapCore.value) return;
      const spots = cards.value.filter((card) => card.point).map((card) => toSpotLike(card));
      mapCore.value.renderSpots(spots, selected.value?.card_id);
    };
    const handleCheckIn = async () => {
      if (!selected.value || selected.value.is_check) return;
      checking.value = true;
      try {
        await store.refreshLocation();
        const result = await checkInPunchCard(selected.value, store.userLocation);
        cards.value = result.card_list;
        selected.value = cards.value.find((item) => item.card_id === selected.value?.card_id) || null;
        syncMarkers();
        showToast("打卡成功", "success", 1500);
      } catch (err) {
        showToast(err?.message || "打卡失败", "error", 2200);
      } finally {
        checking.value = false;
      }
    };
    onMounted(async () => {
      try {
        await refreshCards();
        await initMap();
        syncMarkers();
      } catch (err) {
        showToast(err?.message || "地图加载失败", "error", 2200);
      } finally {
        loading.value = false;
      }
    });
    onBeforeUnmount(() => {
      mapCore.value?.destroy();
      mapCore.value = null;
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$c, [
        createVNode(unref(_sfc_main$u), {
          title: "地图打卡",
          icon: "map",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }),
        loading.value ? (openBlock(), createElementBlock("div", _hoisted_2$b, "加载打卡点…")) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_3$6, [
          createBaseVNode("div", {
            ref_key: "mapContainerRef",
            ref: mapContainerRef,
            class: "campus-guide-map-canvas"
          }, null, 512),
          createBaseVNode("div", _hoisted_4$5, [
            selected.value ? (openBlock(), createElementBlock("section", _hoisted_5$4, [
              createBaseVNode("h3", null, toDisplayString(selected.value.name), 1),
              createBaseVNode("p", _hoisted_6$3, toDisplayString(selectedDistance.value) + " · " + toDisplayString(selected.value.is_check ? "已打卡" : "未打卡"), 1),
              selected.value.info ? (openBlock(), createElementBlock("p", _hoisted_7$2, toDisplayString(selected.value.info), 1)) : createCommentVNode("", true),
              !selected.value.is_check ? (openBlock(), createElementBlock("button", {
                key: 1,
                type: "button",
                class: "campus-guide-primary-btn",
                disabled: checking.value || !unref(canCheckInCard)(selected.value, unref(store).userLocation),
                onClick: handleCheckIn
              }, toDisplayString(checking.value ? "打卡中…" : "在此打卡"), 9, _hoisted_8$1)) : createCommentVNode("", true)
            ])) : createCommentVNode("", true)
          ])
        ])
      ]);
    };
  }
});
const YUNYOU_INTRO_KEY = "campus_guide_yunyou_intro_seen";
const YUNYOU_USER_KEY = "campus_guide_yunyou_user";
const markYunyouIntroSeen = () => {
  try {
    localStorage.setItem(YUNYOU_INTRO_KEY, "1");
  } catch {
  }
};
const readYunyouUser = () => {
  try {
    const raw = localStorage.getItem(YUNYOU_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeYunyouUser = (user) => {
  try {
    if (!user) {
      localStorage.removeItem(YUNYOU_USER_KEY);
      return;
    }
    localStorage.setItem(YUNYOU_USER_KEY, JSON.stringify(user));
  } catch {
  }
};
const _hoisted_1$b = {
  key: 0,
  class: "campus-guide-muted"
};
const _hoisted_2$a = { class: "campus-phase2-profile" };
const _hoisted_3$5 = { key: 0 };
const _hoisted_4$4 = { key: 1 };
const _hoisted_5$3 = { class: "campus-guide-muted" };
const _hoisted_6$2 = { class: "campus-guide-action-row" };
const _sfc_main$b = /* @__PURE__ */ defineComponent({
  __name: "CampusGuidePunchMy",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const checkedTotal = ref(0);
    const total = ref(0);
    const studentName = ref("");
    const yunyouName = ref(readYunyouUser()?.nickName || "");
    const loading = ref(true);
    onMounted(async () => {
      try {
        const [cards, student] = await Promise.all([loadPunchCards(), loadStudentCard()]);
        checkedTotal.value = cards.checkedTotal;
        total.value = cards.total;
        studentName.value = student.name || "";
      } catch (err) {
        showToast(err?.message || "加载失败", "error", 2200);
      } finally {
        loading.value = false;
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "我的校庆",
        icon: "person",
        onBack: _cache[2] || (_cache[2] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          loading.value ? (openBlock(), createElementBlock("p", _hoisted_1$b, "加载中…")) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("div", _hoisted_2$a, [
              createBaseVNode("p", null, [
                _cache[3] || (_cache[3] = createBaseVNode("strong", null, "打卡进度", -1)),
                createTextVNode(" " + toDisplayString(checkedTotal.value) + " / " + toDisplayString(total.value), 1)
              ]),
              studentName.value ? (openBlock(), createElementBlock("p", _hoisted_3$5, [
                _cache[4] || (_cache[4] = createBaseVNode("strong", null, "校友姓名", -1)),
                createTextVNode(" " + toDisplayString(studentName.value), 1)
              ])) : createCommentVNode("", true),
              yunyouName.value ? (openBlock(), createElementBlock("p", _hoisted_4$4, [
                _cache[5] || (_cache[5] = createBaseVNode("strong", null, "云游昵称", -1)),
                createTextVNode(" " + toDisplayString(yunyouName.value), 1)
              ])) : createCommentVNode("", true),
              createBaseVNode("p", _hoisted_5$3, "OpenID：" + toDisplayString(unref(getCampusGuideOpenId)()), 1)
            ]),
            createBaseVNode("div", _hoisted_6$2, [
              createBaseVNode("button", {
                type: "button",
                onClick: _cache[0] || (_cache[0] = ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).punchMap))
              }, "继续打卡"),
              createBaseVNode("button", {
                type: "button",
                class: "primary",
                onClick: _cache[1] || (_cache[1] = ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).punchAlumniCard))
              }, " 编辑校友卡 ")
            ])
          ], 64))
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$a = {
  key: 0,
  class: "campus-guide-muted"
};
const _hoisted_2$9 = { class: "campus-phase2-progress" };
const _hoisted_3$4 = ["disabled"];
const _hoisted_4$3 = ["src"];
const _sfc_main$a = /* @__PURE__ */ defineComponent({
  __name: "CampusGuidePunchPostcard",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const checkedTotal = ref(0);
    const total = ref(0);
    const composeUrl = ref("");
    const loading = ref(true);
    const composing = ref(false);
    const canCompose = computed(() => total.value > 0 && checkedTotal.value >= total.value);
    const refresh = async () => {
      const result = await loadPunchCards();
      checkedTotal.value = result.checkedTotal;
      total.value = result.total;
      composeUrl.value = result.compose_url || "";
    };
    const handleCompose = async () => {
      composing.value = true;
      try {
        composeUrl.value = await composePunchPostcard();
        showToast("明信片已生成", "success", 1500);
      } catch (err) {
        showToast(err?.message || "明信片生成失败", "error", 2200);
      } finally {
        composing.value = false;
      }
    };
    onMounted(async () => {
      try {
        await refresh();
      } catch (err) {
        showToast(err?.message || "加载失败", "error", 2200);
      } finally {
        loading.value = false;
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "校庆明信片",
        icon: "mail",
        onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          loading.value ? (openBlock(), createElementBlock("p", _hoisted_1$a, "加载中…")) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            _cache[2] || (_cache[2] = createBaseVNode("p", { class: "campus-guide-muted" }, "完成全部打卡点后可合成校庆明信片。", -1)),
            createBaseVNode("div", _hoisted_2$9, [
              _cache[1] || (_cache[1] = createBaseVNode("strong", null, "打卡进度", -1)),
              createBaseVNode("span", null, toDisplayString(checkedTotal.value) + " / " + toDisplayString(total.value), 1)
            ]),
            createBaseVNode("button", {
              type: "button",
              class: "campus-guide-primary-btn",
              disabled: !canCompose.value || composing.value,
              onClick: handleCompose
            }, toDisplayString(composing.value ? "生成中…" : "生成明信片"), 9, _hoisted_3$4),
            composeUrl.value ? (openBlock(), createElementBlock("img", {
              key: 0,
              src: composeUrl.value,
              alt: "校庆明信片",
              class: "campus-phase2-postcard"
            }, null, 8, _hoisted_4$3)) : createCommentVNode("", true)
          ], 64))
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$9 = { class: "campus-guide-list" };
const _hoisted_2$8 = ["onClick"];
const _sfc_main$9 = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideRouteList",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    onMounted(() => {
      void store.loadTourRoutesDetailed();
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "游览路线",
        icon: "route",
        onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          createBaseVNode("ul", _hoisted_1$9, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(store).tourRoutes, (route, index) => {
              return openBlock(), createElementBlock("li", {
                key: route.road_id || index
              }, [
                createBaseVNode("button", {
                  type: "button",
                  onClick: ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).roadmap, { routeId: route.road_id, routeIndex: index })
                }, [
                  createBaseVNode("strong", null, toDisplayString(route.name), 1),
                  createBaseVNode("span", null, toDisplayString(route.distancer || ""), 1)
                ], 8, _hoisted_2$8)
              ]);
            }), 128))
          ])
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$8 = { class: "campus-guide-field" };
const _hoisted_2$7 = { class: "campus-phase2-section" };
const _hoisted_3$3 = { class: "campus-guide-muted" };
const _sfc_main$8 = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideSettings",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const guideMode = ref(readCampusGuideMode());
    const applyMode = () => {
      writeCampusGuideMode(guideMode.value);
      showToast("地图模式已保存，重新进入校园地图后生效", "success", 2200);
    };
    const clearCache = () => {
      clearCampusGuideOfflineCaches();
      showToast("校园导览缓存已清除", "success", 1800);
    };
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "导览设置",
        icon: "settings",
        onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          createBaseVNode("label", _hoisted_1$8, [
            _cache[3] || (_cache[3] = createBaseVNode("span", null, "地图模式", -1)),
            withDirectives(createBaseVNode("select", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => guideMode.value = $event),
              class: "campus-guide-input"
            }, [..._cache[2] || (_cache[2] = [
              createBaseVNode("option", { value: "tencent" }, "腾讯手绘导览（推荐）", -1),
              createBaseVNode("option", { value: "legacy" }, "旧版静态地图", -1)
            ])], 512), [
              [vModelSelect, guideMode.value]
            ])
          ]),
          createBaseVNode("button", {
            type: "button",
            class: "campus-guide-primary-btn",
            onClick: applyMode
          }, "保存设置"),
          createBaseVNode("section", _hoisted_2$7, [
            _cache[4] || (_cache[4] = createBaseVNode("h3", null, "离线缓存", -1)),
            createBaseVNode("p", _hoisted_3$3, [
              createTextVNode(" 状态：" + toDisplayString(unref(store).offline ? "离线模式" : "在线模式") + " ", 1),
              unref(store).cacheUpdatedAt ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                createTextVNode(" · 更新于 " + toDisplayString(unref(store).cacheUpdatedAt), 1)
              ], 64)) : createCommentVNode("", true)
            ]),
            createBaseVNode("button", {
              type: "button",
              class: "campus-guide-primary-btn",
              onClick: clearCache
            }, "清除导览缓存")
          ])
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$7 = { class: "campus-guide-map-shell campus-guide-map-shell--compact" };
const _hoisted_2$6 = {
  key: 0,
  class: "campus-guide-list compact"
};
const _sfc_main$7 = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideRouteMap",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const mapContainerRef = ref(null);
    const mapCore = ref(null);
    const route = computed(() => {
      const index = store.navParams.routeIndex ?? 0;
      return store.tourRoutes[index] || null;
    });
    onMounted(async () => {
      await nextTick();
      const container = mapContainerRef.value;
      if (!container || !route.value) return;
      const core = new CampusMapCore(container, { center: store.mapCenter });
      await core.init();
      if (route.value.road_point?.length) core.renderPolylines(route.value.road_point);
      if (route.value.spot_list?.length) core.renderSpots(route.value.spot_list);
      const points = (route.value.road_point || []).flat();
      if (points.length) core.fitPoints(points);
      mapCore.value = core;
    });
    onBeforeUnmount(() => {
      mapCore.value?.destroy();
      mapCore.value = null;
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: route.value?.name || "路线地图",
        icon: "map",
        onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_1$7, [
            createBaseVNode("div", {
              ref_key: "mapContainerRef",
              ref: mapContainerRef,
              class: "campus-guide-map-canvas"
            }, null, 512)
          ]),
          route.value?.spot_list?.length ? (openBlock(), createElementBlock("ul", _hoisted_2$6, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(route.value.spot_list, (spot) => {
              return openBlock(), createElementBlock("li", {
                key: spot.spot_id
              }, toDisplayString(spot.name), 1);
            }), 128))
          ])) : createCommentVNode("", true)
        ]),
        _: 1
      }, 8, ["title"]);
    };
  }
});
const reportCampusSearchKeyword = async (keyword) => {
  const text = keyword.trim();
  if (!text) return;
  try {
    await campusGuideApi.reportSearch({
      scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
      name: text
    });
  } catch {
  }
};
const _hoisted_1$6 = {
  key: 0,
  class: "campus-guide-chip-list"
};
const _hoisted_2$5 = ["onClick"];
const _hoisted_3$2 = {
  key: 1,
  class: "campus-guide-muted"
};
const _hoisted_4$2 = { class: "campus-guide-list" };
const _hoisted_5$2 = ["onClick"];
const _sfc_main$6 = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideSearch",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const keyword = ref("");
    const results = ref([]);
    const searching = ref(false);
    let timer = 0;
    watch(keyword, (value) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const text = value.trim();
        if (!text) {
          results.value = [];
          return;
        }
        searching.value = true;
        try {
          results.value = await store.searchSpotsByName(text);
        } finally {
          searching.value = false;
        }
      }, 500);
    });
    const pickSpot = async (spot) => {
      void reportCampusSearchKeyword(keyword.value || spot.name);
      await store.focusSpotOnHome(spot);
      emit("back");
    };
    onMounted(() => {
      void store.loadHotSearch();
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "搜索地点",
        icon: "search",
        onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => keyword.value = $event),
            class: "campus-guide-input",
            placeholder: "输入地点名称"
          }, null, 512), [
            [vModelText, keyword.value]
          ]),
          unref(store).hotSearch.length ? (openBlock(), createElementBlock("div", _hoisted_1$6, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(store).hotSearch, (item) => {
              return openBlock(), createElementBlock("button", {
                key: item,
                type: "button",
                class: "campus-guide-chip",
                onClick: ($event) => keyword.value = item
              }, toDisplayString(item), 9, _hoisted_2$5);
            }), 128))
          ])) : createCommentVNode("", true),
          searching.value ? (openBlock(), createElementBlock("p", _hoisted_3$2, "搜索中…")) : createCommentVNode("", true),
          createBaseVNode("ul", _hoisted_4$2, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(results.value, (spot) => {
              return openBlock(), createElementBlock("li", {
                key: spot.spot_id
              }, [
                createBaseVNode("button", {
                  type: "button",
                  onClick: ($event) => pickSpot(spot)
                }, [
                  createBaseVNode("strong", null, toDisplayString(spot.name), 1),
                  createBaseVNode("span", null, toDisplayString(spot.distancer || ""), 1)
                ], 8, _hoisted_5$2)
              ]);
            }), 128))
          ])
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$5 = { class: "campus-guide-root campus-guide-root--immersive" };
const _hoisted_2$4 = { class: "campus-guide-status" };
const _hoisted_3$1 = {
  key: 0,
  class: "campus-guide-status"
};
const _hoisted_4$1 = {
  key: 1,
  class: "campus-guide-status"
};
const _hoisted_5$1 = { class: "campus-guide-map-shell campus-guide-map-shell--immersive" };
const _hoisted_6$1 = { class: "campus-guide-walk-actions" };
const _hoisted_7$1 = {
  key: 1,
  class: "campus-guide-muted"
};
const _sfc_main$5 = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideWalkLine",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const mapContainerRef = ref(null);
    const mapCore = ref(null);
    const routeText = ref("");
    const loadingRoute = ref(true);
    const routeReady = ref(false);
    const endPoint = computed(() => resolveNavEndPoint(store.navParams.spot, store.navParams.endPoint));
    const endName = computed(() => store.navParams.spot?.name || "目的地");
    const openExternalNav = async () => {
      const end = endPoint.value;
      if (!end || !isValidGeoPoint(end)) {
        showToast("该点位缺少坐标，无法打开外部地图", "warning", 2200);
        return;
      }
      const ok = await openExternalMapNavigation(end, endName.value, store.userLocation);
      if (!ok) showToast("无法打开外部地图", "error", 2200);
    };
    const init = async () => {
      await nextTick();
      const container = mapContainerRef.value;
      const end = endPoint.value;
      if (!container || !end) {
        routeText.value = "缺少目的地坐标";
        loadingRoute.value = false;
        return;
      }
      const core = new CampusMapCore(container, {
        center: store.userLocation,
        aoiRings: store.scenic?.aoi || []
      });
      await core.init();
      core.renderLocation(store.userLocation);
      mapCore.value = core;
      requestAnimationFrame(() => mapCore.value?.resize());
      try {
        if (!isValidGeoPoint(store.userLocation)) {
          routeText.value = "起点坐标无效，请先定位或使用外部地图";
          loadingRoute.value = false;
          return;
        }
        const result = await fetchCampusWalkRoute(store.userLocation, end);
        if (result.points.length >= 2) {
          try {
            core.renderPolylines([result.points]);
            core.fitPoints([store.userLocation, ...result.points, end]);
            const distanceText = typeof result.distance === "number" ? `${Math.round(result.distance)}米` : String(result.distance || "");
            routeText.value = `${distanceText} ${formatWalkDuration(result.duration)}`.trim();
            routeReady.value = true;
          } catch {
            routeText.value = "路线绘制失败，可打开外部地图导航";
            core.fitPoints([store.userLocation, end]);
            showToast("校内路线绘制失败，请使用外部地图", "warning", 2400);
          }
        } else if (store.insideScenic) {
          routeText.value = "未获取到校内步行路线，可尝试外部地图";
          core.fitPoints([store.userLocation, end]);
        } else {
          routeText.value = "当前在校外，建议使用外部地图导航";
          core.fitPoints([store.userLocation, end]);
        }
      } catch (err) {
        routeText.value = err?.message || "路线规划失败";
        showToast(routeText.value, "error", 2200);
        try {
          core.fitPoints([store.userLocation, end]);
        } catch {
        }
      } finally {
        loadingRoute.value = false;
      }
    };
    onMounted(() => {
      void init();
    });
    onBeforeUnmount(() => {
      mapCore.value?.destroy();
      mapCore.value = null;
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$5, [
        createVNode(unref(_sfc_main$u), {
          title: "步行导航",
          icon: "route",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }),
        createBaseVNode("div", _hoisted_2$4, "目的地：" + toDisplayString(endName.value), 1),
        loadingRoute.value ? (openBlock(), createElementBlock("div", _hoisted_3$1, "正在规划路线…")) : (openBlock(), createElementBlock("div", _hoisted_4$1, toDisplayString(routeText.value), 1)),
        createBaseVNode("div", _hoisted_5$1, [
          createBaseVNode("div", {
            ref_key: "mapContainerRef",
            ref: mapContainerRef,
            class: "campus-guide-map-canvas"
          }, null, 512)
        ]),
        createBaseVNode("div", _hoisted_6$1, [
          endPoint.value ? (openBlock(), createElementBlock("button", {
            key: 0,
            type: "button",
            class: "campus-guide-primary-btn",
            onClick: openExternalNav
          }, " 打开外部地图导航 ")) : createCommentVNode("", true),
          routeReady.value ? (openBlock(), createElementBlock("p", _hoisted_7$1, "蓝线为推荐步行路线，可双指放大查看细节。")) : createCommentVNode("", true)
        ])
      ]);
    };
  }
});
const _hoisted_1$4 = { class: "campus-phase2-clue-list" };
const _sfc_main$4 = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideYunyouClue",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const clues = [
      "在图书馆附近寻找第一处云游印记",
      "前往体育馆打卡点解锁背面图案",
      "完成签名后可在文化衫详情页查看效果",
      "所有线索完成后可参与校庆线下打卡联动"
    ];
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "云游线索",
        icon: "lightbulb",
        onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          _cache[2] || (_cache[2] = createBaseVNode("p", { class: "campus-guide-muted" }, "根据线索在校园内探索，完成云游文化衫定制。", -1)),
          createBaseVNode("ol", _hoisted_1$4, [
            (openBlock(), createElementBlock(Fragment, null, renderList(clues, (item, index) => {
              return createBaseVNode("li", { key: index }, toDisplayString(item), 1);
            }), 64))
          ]),
          createBaseVNode("button", {
            type: "button",
            class: "campus-guide-primary-btn",
            onClick: _cache[0] || (_cache[0] = ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).yunyouSignature))
          }, " 去签名 ")
        ]),
        _: 1
      });
    };
  }
});
const loadShirtInfo = async () => phase2Api.getShirtInfo({ open_id: getCampusGuideOpenId() });
const enrollYunyouShirt = async () => {
  const user = readYunyouUser();
  await phase2Api.postShirtEnroll({
    open_id: getCampusGuideOpenId(),
    nick_name: user?.nickName || "云游用户"
  });
  return loadShirtInfo();
};
const signYunyouShirt = async (payload) => {
  await phase2Api.postShirtSign({
    open_id: getCampusGuideOpenId(),
    ...payload
  });
  return loadShirtInfo();
};
const _hoisted_1$3 = {
  key: 0,
  class: "campus-guide-muted"
};
const _hoisted_2$3 = { class: "campus-guide-muted" };
const _hoisted_3 = {
  key: 0,
  class: "campus-guide-action-row"
};
const _hoisted_4 = ["disabled"];
const _hoisted_5 = { class: "campus-phase2-section" };
const _hoisted_6 = { class: "campus-phase2-grid" };
const _hoisted_7 = ["src", "alt"];
const _hoisted_8 = { class: "campus-phase2-section" };
const _hoisted_9 = { class: "campus-phase2-grid" };
const _hoisted_10 = ["src", "alt"];
const _hoisted_11 = { class: "campus-guide-action-row" };
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideYunyouDetail",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const shirt = ref(null);
    const loading = ref(true);
    const joining = ref(false);
    const refresh = async () => {
      loading.value = true;
      try {
        shirt.value = await loadShirtInfo();
      } catch (err) {
        showToast(err?.message || "文化衫信息加载失败", "error", 2200);
      } finally {
        loading.value = false;
      }
    };
    const handleEnroll = async () => {
      joining.value = true;
      try {
        shirt.value = await enrollYunyouShirt();
        showToast("报名成功", "success", 1500);
      } catch (err) {
        showToast(err?.message || "报名失败", "error", 2200);
      } finally {
        joining.value = false;
      }
    };
    onMounted(() => {
      void refresh();
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "云游文化衫",
        icon: "checkroom",
        onBack: _cache[2] || (_cache[2] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          loading.value ? (openBlock(), createElementBlock("p", _hoisted_1$3, "加载中…")) : shirt.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("p", _hoisted_2$3, toDisplayString(shirt.value.isJoin ? `已参与云游 · 编号 ${shirt.value.number || "-"}` : "尚未报名云游活动"), 1),
            !shirt.value.isJoin ? (openBlock(), createElementBlock("div", _hoisted_3, [
              createBaseVNode("button", {
                type: "button",
                class: "primary",
                disabled: joining.value,
                onClick: handleEnroll
              }, toDisplayString(joining.value ? "报名中…" : "立即报名"), 9, _hoisted_4)
            ])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
              createBaseVNode("section", _hoisted_5, [
                _cache[3] || (_cache[3] = createBaseVNode("h3", null, "正面图案", -1)),
                createBaseVNode("div", _hoisted_6, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(shirt.value.frontList, (item) => {
                    return openBlock(), createElementBlock("article", {
                      key: String(item.id),
                      class: "campus-phase2-card"
                    }, [
                      item.pic ? (openBlock(), createElementBlock("img", {
                        key: 0,
                        src: item.pic,
                        alt: item.name || "正面图案"
                      }, null, 8, _hoisted_7)) : createCommentVNode("", true),
                      createBaseVNode("p", null, toDisplayString(item.name || "图案"), 1)
                    ]);
                  }), 128))
                ])
              ]),
              createBaseVNode("section", _hoisted_8, [
                _cache[4] || (_cache[4] = createBaseVNode("h3", null, "背面图案", -1)),
                createBaseVNode("div", _hoisted_9, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(shirt.value.behindList, (item) => {
                    return openBlock(), createElementBlock("article", {
                      key: String(item.id),
                      class: "campus-phase2-card"
                    }, [
                      item.pic ? (openBlock(), createElementBlock("img", {
                        key: 0,
                        src: item.pic,
                        alt: item.name || "背面图案"
                      }, null, 8, _hoisted_10)) : createCommentVNode("", true),
                      createBaseVNode("p", null, toDisplayString(item.name || "图案"), 1)
                    ]);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_11, [
                createBaseVNode("button", {
                  type: "button",
                  onClick: _cache[0] || (_cache[0] = ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).yunyouClue))
                }, "查看线索"),
                createBaseVNode("button", {
                  type: "button",
                  class: "primary",
                  onClick: _cache[1] || (_cache[1] = ($event) => unref(store).navigateTo(unref(CAMPUS_GUIDE_VIEWS).yunyouSignature))
                }, " 签名定制 ")
              ])
            ], 64))
          ], 64)) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$2 = { class: "campus-guide-field" };
const _hoisted_2$2 = ["disabled"];
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideYunyouIntro",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const nickName = ref(readYunyouUser()?.nickName || "");
    const startYunyou = () => {
      const name = nickName.value.trim();
      if (!name) return;
      writeYunyouUser({ nickName: name });
      markYunyouIntroSeen();
      store.navigateTo(CAMPUS_GUIDE_VIEWS.yunyouDetail);
    };
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "云游打卡",
        icon: "cloud",
        onBack: _cache[1] || (_cache[1] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          _cache[3] || (_cache[3] = createBaseVNode("h2", { class: "campus-guide-title" }, "校庆云游文化衫", -1)),
          _cache[4] || (_cache[4] = createBaseVNode("p", { class: "campus-guide-muted" }, " 在线参与湖工大校庆云游活动，定制文化衫签名，收集线索并完成云游打卡。 ", -1)),
          createBaseVNode("label", _hoisted_1$2, [
            _cache[2] || (_cache[2] = createBaseVNode("span", null, "昵称（用于文化衫展示）", -1)),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => nickName.value = $event),
              class: "campus-guide-input",
              placeholder: "输入昵称"
            }, null, 512), [
              [vModelText, nickName.value]
            ])
          ]),
          createBaseVNode("button", {
            type: "button",
            class: "campus-guide-primary-btn",
            disabled: !nickName.value.trim(),
            onClick: startYunyou
          }, " 开始云游 ", 8, _hoisted_2$2)
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1$1 = { class: "campus-guide-action-row" };
const _hoisted_2$1 = ["disabled"];
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideYunyouSignature",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const canvasRef = ref(null);
    const drawing = ref(false);
    const saving = ref(false);
    let ctx = null;
    const getPoint = (event) => {
      const canvas = canvasRef.value;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    };
    const startDraw = (event) => {
      const point = getPoint(event);
      if (!point || !ctx) return;
      drawing.value = true;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    };
    const moveDraw = (event) => {
      if (!drawing.value || !ctx) return;
      const point = getPoint(event);
      if (!point) return;
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    };
    const stopDraw = () => {
      drawing.value = false;
    };
    const clearCanvas = () => {
      const canvas = canvasRef.value;
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    const saveSignature = async () => {
      const canvas = canvasRef.value;
      if (!canvas) return;
      saving.value = true;
      try {
        const signature = canvas.toDataURL("image/png");
        const user = readYunyouUser();
        await signYunyouShirt({
          nick_name: user?.nickName || "云游用户",
          signature,
          position_z: 0
        });
        showToast("签名已提交", "success", 1500);
        emit("back");
      } catch (err) {
        showToast(err?.message || "签名提交失败", "error", 2200);
      } finally {
        saving.value = false;
      }
    };
    onMounted(() => {
      const canvas = canvasRef.value;
      if (!canvas) return;
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.strokeStyle = "#0074cf";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
    });
    onBeforeUnmount(() => {
      ctx = null;
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(_sfc_main$t, {
        title: "文化衫签名",
        icon: "draw",
        onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
      }, {
        default: withCtx(() => [
          _cache[1] || (_cache[1] = createBaseVNode("p", { class: "campus-guide-muted" }, "在下方区域手写签名，将用于云游文化衫展示。", -1)),
          createBaseVNode("canvas", {
            ref_key: "canvasRef",
            ref: canvasRef,
            class: "campus-phase2-signature-canvas",
            onPointerdown: withModifiers(startDraw, ["prevent"]),
            onPointermove: withModifiers(moveDraw, ["prevent"]),
            onPointerup: withModifiers(stopDraw, ["prevent"]),
            onPointerleave: withModifiers(stopDraw, ["prevent"])
          }, null, 544),
          createBaseVNode("div", _hoisted_1$1, [
            createBaseVNode("button", {
              type: "button",
              onClick: clearCanvas
            }, "清除"),
            createBaseVNode("button", {
              type: "button",
              class: "primary",
              disabled: saving.value,
              onClick: saveSignature
            }, toDisplayString(saving.value ? "提交中…" : "提交签名"), 9, _hoisted_2$1)
          ])
        ]),
        _: 1
      });
    };
  }
});
const _hoisted_1 = { class: "campus-guide-shell" };
const _hoisted_2 = {
  key: 24,
  class: "campus-guide-page"
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "CampusGuideShell",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const store = useCampusGuideStore();
    const activeView = computed(() => store.currentView);
    const isUnknownView = computed(() => !isKnownCampusGuideView(activeView.value));
    const handleAppBack = () => {
      if (activeView.value === CAMPUS_GUIDE_VIEWS.home || activeView.value === CAMPUS_GUIDE_VIEWS.hub) {
        emit("back");
        return;
      }
      store.goBack();
    };
    onBeforeUnmount(() => resetCampusGuideStore());
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).hub ? (openBlock(), createBlock(_sfc_main$j, {
          key: 0,
          onBack: handleAppBack
        })) : createCommentVNode("", true),
        (openBlock(), createBlock(KeepAlive, null, [
          activeView.value === unref(CAMPUS_GUIDE_VIEWS).home ? (openBlock(), createBlock(_sfc_main$k, {
            key: 0,
            onBack: handleAppBack
          })) : createCommentVNode("", true)
        ], 1024)),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).search ? (openBlock(), createBlock(_sfc_main$6, {
          key: 1,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).walkline ? (openBlock(), createBlock(_sfc_main$5, {
          key: 2,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).poi ? (openBlock(), createBlock(_sfc_main$f, {
          key: 3,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).route ? (openBlock(), createBlock(_sfc_main$9, {
          key: 4,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).roadmap ? (openBlock(), createBlock(_sfc_main$7, {
          key: 5,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).bus ? (openBlock(), createBlock(_sfc_main$p, {
          key: 6,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).activity ? (openBlock(), createBlock(_sfc_main$r, {
          key: 7,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).activityDetail ? (openBlock(), createBlock(_sfc_main$q, {
          key: 8,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).notice ? (openBlock(), createBlock(_sfc_main$g, {
          key: 9,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).noticeDetail ? (openBlock(), createBlock(_sfc_main$h, {
          key: 10,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).about ? (openBlock(), createBlock(_sfc_main$s, {
          key: 11,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).collect ? (openBlock(), createBlock(_sfc_main$o, {
          key: 12,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).mockLocation ? (openBlock(), createBlock(_sfc_main$i, {
          key: 13,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).settings ? (openBlock(), createBlock(_sfc_main$8, {
          key: 14,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).yunyouIntro ? (openBlock(), createBlock(_sfc_main$2, {
          key: 15,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).yunyouDetail ? (openBlock(), createBlock(_sfc_main$3, {
          key: 16,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).yunyouClue ? (openBlock(), createBlock(_sfc_main$4, {
          key: 17,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).yunyouSignature ? (openBlock(), createBlock(_sfc_main$1, {
          key: 18,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).punchHome ? (openBlock(), createBlock(_sfc_main$d, {
          key: 19,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).punchMap ? (openBlock(), createBlock(_sfc_main$c, {
          key: 20,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).punchPostcard ? (openBlock(), createBlock(_sfc_main$a, {
          key: 21,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).punchAlumniCard ? (openBlock(), createBlock(_sfc_main$e, {
          key: 22,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        activeView.value === unref(CAMPUS_GUIDE_VIEWS).punchMy ? (openBlock(), createBlock(_sfc_main$b, {
          key: 23,
          onBack: unref(store).goBack
        }, null, 8, ["onBack"])) : createCommentVNode("", true),
        isUnknownView.value ? (openBlock(), createElementBlock("div", _hoisted_2, [
          createBaseVNode("p", null, "未知页面：" + toDisplayString(unref(CAMPUS_GUIDE_VIEW_TITLES)[activeView.value] || activeView.value), 1),
          createBaseVNode("button", {
            type: "button",
            onClick: _cache[0] || (_cache[0] = //@ts-ignore
            (...args) => unref(store).goBack && unref(store).goBack(...args))
          }, "返回")
        ])) : createCommentVNode("", true)
      ]);
    };
  }
});
export {
  _sfc_main as default
};
