import { p as pushDebugLog } from "./runtime-bridge-D89yarmp.js";
import { i as defineComponent, x as watch, p as onBeforeUnmount, a as openBlock, c as createElementBlock, e as normalizeStyle, n as normalizeClass, d as createCommentVNode, v as renderSlot, b as createBaseVNode, r as ref, h as computed } from "./vue-core-4L5yFbGc.js";
import { _ as _export_sfc } from "./app-demo-D63SYrKg.js";
const HBUT_LOCATION = {
  name: "湖北工业大学",
  latitude: 30.4819,
  longitude: 114.313
};
const SCAN_REFRESH_INTERVAL_MS = 18e4;
const SCAN_VIEWPORT_DEBOUNCE_MS = 280;
const CENTER_FETCH_DEBOUNCE_MS = SCAN_VIEWPORT_DEBOUNCE_MS;
const BATTERY_ICON_TIERS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const batteryLevelTier = (battery) => {
  const n = Number(battery);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 100) return 100;
  return Math.round(n / 10) * 10;
};
const wgs84ToGcj02 = (lat, lng) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { latitude: lat, longitude: lng };
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) {
    return { latitude: lat, longitude: lng };
  }
  const PI = Math.PI;
  const A = 6378245;
  const EE = 0.006693421622965943;
  const transformLat = (x, y) => {
    let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
    ret += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
    ret += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
    return ret;
  };
  const transformLng = (x, y) => {
    let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
    ret += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
    ret += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
    return ret;
  };
  const dLat = transformLat(lng - 105, lat - 35);
  const dLng = transformLng(lng - 105, lat - 35);
  const radLat = lat / 180 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const mgLat = lat + dLat * 180 / (A * (1 - EE) / (magic * sqrtMagic) * PI);
  const mgLng = lng + dLng * 180 / (A / sqrtMagic * Math.cos(radLat) * PI);
  return { latitude: mgLat, longitude: mgLng };
};
const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
};
const coerceChinaLatLng = (lat, lng) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let a = lat;
  let b = lng;
  const latLooksLikeLng = a > 70 && a < 140 && b > 15 && b < 55;
  if (latLooksLikeLng) {
    const tmp = a;
    a = b;
    b = tmp;
  }
  if (a < 15 || a > 55 || b < 70 || b > 140) return null;
  return { latitude: a, longitude: b };
};
const firstArray = (data) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const obj = data;
  for (const key of [
    "list",
    "records",
    "rows",
    "data",
    "items",
    "deviceList",
    "device_list",
    "carList",
    "car_list",
    "ebikeList",
    "eBikeList",
    "nearList",
    "bikeList",
    "vehicles"
  ]) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  for (const key of ["data", "result", "payload"]) {
    const nested = obj[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const inner = firstArray(nested);
      if (inner.length) return inner;
    }
  }
  return [];
};
const readLatLngFromObject = (obj) => {
  const topLat = toNumber(
    obj.lat ?? obj.latitude ?? obj.carLat ?? obj.car_lat ?? obj.posLat ?? obj.pos_lat ?? obj.centerLat ?? obj.latY ?? obj.y
  );
  const topLng = toNumber(
    obj.lng ?? obj.lon ?? obj.longitude ?? obj.carLng ?? obj.car_lng ?? obj.posLng ?? obj.pos_lng ?? obj.centerLng ?? obj.lngX ?? obj.x
  );
  const top = coerceChinaLatLng(topLat, topLng);
  if (top) return top;
  for (const nestKey of ["location", "pos", "position", "coordinate", "coord", "gps", "point"]) {
    const nested = obj[nestKey];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const fromNested = readLatLngFromObject(nested);
      if (fromNested) return fromNested;
    }
    if (Array.isArray(nested) && nested.length >= 2) {
      const coerced = coerceChinaLatLng(toNumber(nested[1]), toNumber(nested[0]));
      if (coerced) return coerced;
      const swapped = coerceChinaLatLng(toNumber(nested[0]), toNumber(nested[1]));
      if (swapped) return swapped;
    }
  }
  return null;
};
const normalizePoint = (point) => {
  if (!point) return null;
  if (Array.isArray(point)) {
    const asLngLat = coerceChinaLatLng(toNumber(point[1]), toNumber(point[0]));
    if (asLngLat) return asLngLat;
    return coerceChinaLatLng(toNumber(point[0]), toNumber(point[1]));
  }
  if (typeof point !== "object") return null;
  return readLatLngFromObject(point);
};
const distanceMeters = (lat1, lng1, lat2, lng2) => {
  const radius = 6371e3;
  const p1 = Number(lat1) * Math.PI / 180;
  const p2 = Number(lat2) * Math.PI / 180;
  const dp = (Number(lat2) - Number(lat1)) * Math.PI / 180;
  const dl = (Number(lng2) - Number(lng1)) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};
const normalizeVehicles = (data, origin = HBUT_LOCATION) => {
  const loc = normalizePoint(origin) || HBUT_LOCATION;
  return firstArray(data).map((item) => {
    const obj = item || {};
    const coords = readLatLngFromObject(obj);
    if (!coords) return null;
    const { latitude: lat, longitude: lng } = coords;
    const rawDistance = toNumber(obj.distance ?? obj.dist ?? obj.meters);
    let distance = Number.isFinite(rawDistance) ? rawDistance : distanceMeters(loc.latitude, loc.longitude, lat, lng);
    if (Number.isFinite(rawDistance) && rawDistance > 0 && rawDistance < 30 && distanceMeters(loc.latitude, loc.longitude, lat, lng) > 200) {
      if (rawDistance * 1e3 > 50) distance = rawDistance * 1e3;
    }
    return {
      id: String(obj.carId || obj.car_id || obj.id || obj.imei || obj.deviceId || ""),
      imei: String(obj.imei || obj.deviceId || ""),
      latitude: lat,
      longitude: lng,
      battery: obj.restBattery ?? obj.battery ?? obj.power ?? obj.soc ?? 0,
      distance,
      mileage: obj.restMileage ?? obj.mileage ?? "",
      lastUsedTime: String(obj.lastUsedTime || obj.last_used_time || ""),
      hasReward: obj.hasReward,
      raw: item
    };
  }).filter(Boolean).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0));
};
const resolveTowerGoLocation = async ({
  geolocation = typeof navigator === "undefined" ? void 0 : navigator.geolocation,
  fallback = HBUT_LOCATION,
  timeoutMs = 12e3,
  maxDriftMeters = 2e3,
  /** 0 = 强制刷新，避免 iOS/系统把陈旧校外坐标当当前 */
  maximumAge = 0
} = {}) => {
  if (!geolocation?.getCurrentPosition) {
    const point = { ...fallback, source: "fallback" };
    pushDebugLog(
      "TowerGo",
      `定位不可用，回退校区 lat=${point.latitude} lng=${point.longitude}`,
      "warn",
      point
    );
    return point;
  }
  pushDebugLog("TowerGo", `定位请求开始 timeout=${timeoutMs}ms maximumAge=${maximumAge}`, "debug", {
    timeoutMs,
    maximumAge
  });
  return new Promise((resolve) => {
    try {
      geolocation.getCurrentPosition(
        (position) => {
          const rawLat = position.coords.latitude;
          const rawLng = position.coords.longitude;
          const accuracy = position.coords.accuracy || 0;
          const gcj = wgs84ToGcj02(rawLat, rawLng);
          const lat = gcj.latitude;
          const lng = gcj.longitude;
          const clearlyInvalid = !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || Math.abs(lat) < 1e-9 && Math.abs(lng) < 1e-9;
          const drift = distanceMeters(fallback.latitude, fallback.longitude, lat, lng);
          if (clearlyInvalid || !Number.isFinite(drift)) {
            const { accuracy: _fallbackAccuracy, ...fallbackPoint } = fallback;
            const point2 = { ...fallbackPoint, source: "fallback", accuracy };
            pushDebugLog(
              "TowerGo",
              `定位结果异常（lat=${rawLat} lng=${rawLng}），回退校区 lat=${point2.latitude} lng=${point2.longitude}`,
              "warn",
              { rawLat, rawLng, lat, lng, drift, ...point2 }
            );
            resolve(point2);
            return;
          }
          if (drift > maxDriftMeters) {
            const point2 = {
              name: "当前位置",
              latitude: lat,
              longitude: lng,
              accuracy,
              source: "system",
              outOfRange: true,
              driftMeters: Math.round(drift)
            };
            pushDebugLog(
              "TowerGo",
              `定位超出校区范围 ${Math.round(drift)}m > ${maxDriftMeters}m，保留真实位置并标记 outOfRange`,
              "warn",
              { rawLat, rawLng, lat, lng, drift, ...point2 }
            );
            resolve(point2);
            return;
          }
          const point = {
            name: "当前位置",
            latitude: lat,
            longitude: lng,
            accuracy,
            source: "system"
          };
          pushDebugLog(
            "TowerGo",
            `定位成功(GCJ) lat=${lat.toFixed(6)} lng=${lng.toFixed(6)} ±${Math.round(accuracy)}m wgs=${rawLat.toFixed(6)},${rawLng.toFixed(6)}`,
            "info",
            { ...point, rawLat, rawLng }
          );
          resolve(point);
        },
        (err) => {
          const point = { ...fallback, source: "fallback" };
          pushDebugLog("TowerGo", `定位失败，回退校区: ${err?.message || err}`, "error", {
            ...point,
            code: err?.code
          });
          resolve(point);
        },
        {
          timeout: timeoutMs,
          enableHighAccuracy: true,
          maximumAge: Math.max(0, Number(maximumAge) || 0)
        }
      );
    } catch (err) {
      const point = { ...fallback, source: "fallback" };
      pushDebugLog(
        "TowerGo",
        `定位异常，回退校区: ${err?.message || err}`,
        "error",
        point
      );
      resolve(point);
    }
  });
};
const formatDistance = (meters) => {
  const value = Number(meters);
  if (!Number.isFinite(value)) return "--";
  if (value < 1e3) return `${Math.round(value)} m`;
  return `${(value / 1e3).toFixed(1)} km`;
};
const toGcj = (lat, lng) => wgs84ToGcj02(lat, lng);
const TENCENT_MAP_SCRIPT_ATTR = "data-tencent-map";
const getGlobalTMap = () => {
  if (typeof window === "undefined") return null;
  return window.TMap || null;
};
const TENCENT_MAP_SCRIPT_SRC = (apiKey) => `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(apiKey)}`;
const TENCENT_MAP_LOAD_TIMEOUT_MS = 15e3;
let inflightLoad = null;
const resetTencentMapLoader = () => {
  inflightLoad = null;
  if (typeof document === "undefined") return;
  document.querySelectorAll(`script[${TENCENT_MAP_SCRIPT_ATTR}]`).forEach((el) => el.remove());
};
const waitForScript = (script) => new Promise((resolve, reject) => {
  let settled = false;
  let timer = null;
  const finish = (error) => {
    if (settled) return;
    settled = true;
    if (timer !== null) window.clearTimeout(timer);
    script.removeEventListener("load", onLoad);
    script.removeEventListener("error", onError);
    error ? reject(error) : resolve();
  };
  const onLoad = () => finish();
  const onError = () => finish(new Error("腾讯地图脚本加载失败"));
  timer = window.setTimeout(
    () => finish(new Error("腾讯地图脚本加载超时")),
    TENCENT_MAP_LOAD_TIMEOUT_MS
  );
  script.addEventListener("load", onLoad);
  script.addEventListener("error", onError);
});
async function loadTencentMap(apiKey) {
  if (typeof window === "undefined") throw new Error("当前环境无法加载地图");
  const existing = getGlobalTMap();
  if (existing) return existing;
  if (inflightLoad) return inflightLoad;
  const started = (async () => {
    document.querySelectorAll(`script[${TENCENT_MAP_SCRIPT_ATTR}]`).forEach((el) => el.remove());
    const script = document.createElement("script");
    script.setAttribute(TENCENT_MAP_SCRIPT_ATTR, "1");
    script.src = TENCENT_MAP_SCRIPT_SRC(apiKey);
    script.async = true;
    const ready = waitForScript(script);
    document.head.appendChild(script);
    try {
      await ready;
    } catch (error) {
      script.remove();
      throw error;
    }
    const loaded = getGlobalTMap();
    if (!loaded) {
      script.remove();
      throw new Error("腾讯地图脚本已加载但未暴露 TMap");
    }
    return loaded;
  })();
  inflightLoad = started;
  try {
    return await started;
  } finally {
    if (inflightLoad === started) inflightLoad = null;
  }
}
const toTencentLatLng = (TMap, point) => {
  const lat = "lat" in point ? point.lat : point.latitude;
  const lng = "lng" in point ? point.lng : point.longitude;
  return new TMap.LatLng(Number(lat), Number(lng));
};
const _hoisted_1 = ["data-snap"];
const _hoisted_2 = {
  key: 0,
  class: "bottom-sheet__grabber",
  "aria-hidden": "true"
};
const _hoisted_3 = { class: "bottom-sheet__body" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "BottomSheet",
  props: {
    modelValue: { default: "half" },
    peekHeight: { default: 96 },
    halfRatio: { default: 0.5 },
    fullRatio: { default: 0.88 },
    handle: { type: Boolean, default: true }
  },
  emits: ["update:modelValue"],
  setup(__props, { expose: __expose, emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const dragging = ref(false);
    const dragDelta = ref(0);
    const viewportHeight = () => typeof window === "undefined" ? 800 : window.innerHeight;
    const snapHeights = computed(() => {
      const vh = viewportHeight();
      return {
        peek: props.peekHeight,
        half: Math.round(vh * props.halfRatio),
        full: Math.round(vh * props.fullRatio)
      };
    });
    const maxHeight = computed(() => snapHeights.value.full);
    const currentHeight = computed(() => {
      const base = snapHeights.value[props.modelValue] ?? snapHeights.value.half;
      const next = base + dragDelta.value;
      return Math.max(props.peekHeight, Math.min(maxHeight.value, next));
    });
    const sheetStyle = computed(() => ({
      height: `${currentHeight.value}px`,
      transition: dragging.value ? "none" : `height calc(var(--ui-duration-normal) * var(--ui-motion-scale)) var(--ui-ease-out)`
    }));
    let startY = 0;
    const onPointerDown = (event) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      dragging.value = true;
      startY = event.clientY;
      dragDelta.value = 0;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event) => {
      if (!dragging.value) return;
      dragDelta.value = startY - event.clientY;
    };
    const onPointerUp = (event) => {
      if (!dragging.value) return;
      dragging.value = false;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      const height = currentHeight.value;
      const candidates = ["peek", "half", "full"];
      let best = props.modelValue;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const snap of candidates) {
        const distance = Math.abs(snapHeights.value[snap] - height);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = snap;
        }
      }
      dragDelta.value = 0;
      if (best !== props.modelValue) emit("update:modelValue", best);
    };
    const cycleSnap = (direction) => {
      const order = ["peek", "half", "full"];
      const index = order.indexOf(props.modelValue);
      const nextIndex = Math.max(0, Math.min(order.length - 1, index + direction));
      if (nextIndex !== index) emit("update:modelValue", order[nextIndex]);
    };
    const onKeydown = (event) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        cycleSnap(1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        cycleSnap(-1);
      }
    };
    const onResize = () => {
      dragDelta.value = 0;
    };
    watch(
      () => props.modelValue,
      () => {
        dragDelta.value = 0;
      }
    );
    if (typeof window !== "undefined") {
      window.addEventListener("resize", onResize);
      onBeforeUnmount(() => window.removeEventListener("resize", onResize));
    }
    __expose({ currentHeight, snapHeights });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("section", {
        class: normalizeClass(["bottom-sheet", { "is-dragging": dragging.value }]),
        style: normalizeStyle(sheetStyle.value),
        "data-testid": "bottom-sheet",
        "data-snap": __props.modelValue
      }, [
        __props.handle || _ctx.$slots.header ? (openBlock(), createElementBlock("header", {
          key: 0,
          class: "bottom-sheet__header",
          role: "button",
          tabindex: "0",
          "aria-label": "拖动调整面板高度（上下方向键切换档位）",
          onPointerdown: onPointerDown,
          onPointermove: onPointerMove,
          onPointerup: onPointerUp,
          onPointercancel: onPointerUp,
          onKeydown
        }, [
          __props.handle ? (openBlock(), createElementBlock("span", _hoisted_2)) : createCommentVNode("", true),
          renderSlot(_ctx.$slots, "header", {}, void 0, true)
        ], 32)) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_3, [
          renderSlot(_ctx.$slots, "default", {}, void 0, true)
        ])
      ], 14, _hoisted_1);
    };
  }
});
const BottomSheet = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-9d1df8ea"]]);
export {
  BottomSheet as B,
  CENTER_FETCH_DEBOUNCE_MS as C,
  HBUT_LOCATION as H,
  SCAN_REFRESH_INTERVAL_MS as S,
  resolveTowerGoLocation as a,
  batteryLevelTier as b,
  normalizeVehicles as c,
  toTencentLatLng as d,
  BATTERY_ICON_TIERS as e,
  formatDistance as f,
  loadTencentMap as l,
  normalizePoint as n,
  resetTencentMapLoader as r,
  toGcj as t
};
