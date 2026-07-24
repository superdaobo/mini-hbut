import { p as pushDebugLog } from "./runtime-bridge-apFQ0nCw.js";
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
          const drift = distanceMeters(fallback.latitude, fallback.longitude, lat, lng);
          if (Number.isFinite(drift) && drift > maxDriftMeters) {
            const point2 = { ...fallback, source: "fallback", accuracy };
            pushDebugLog(
              "TowerGo",
              `定位漂移 ${Math.round(drift)}m > ${maxDriftMeters}m，回退校区 lat=${point2.latitude} lng=${point2.longitude}`,
              "warn",
              { rawLat, rawLng, lat, lng, accuracy, drift, ...point2 }
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
export {
  BATTERY_ICON_TIERS as B,
  CENTER_FETCH_DEBOUNCE_MS as C,
  HBUT_LOCATION as H,
  SCAN_REFRESH_INTERVAL_MS as S,
  normalizeVehicles as a,
  batteryLevelTier as b,
  formatDistance as f,
  normalizePoint as n,
  resolveTowerGoLocation as r
};
