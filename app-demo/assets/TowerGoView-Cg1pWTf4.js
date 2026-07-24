import { N as defineComponent, a as ref, o as onMounted, z as nextTick, m as onBeforeUnmount, c as createElementBlock, b as openBlock, d as createBaseVNode, C as withDirectives, j as withModifiers, t as toDisplayString, e as computed, n as normalizeClass, g as createTextVNode, f as createCommentVNode, I as vShow, F as Fragment, u as unref, i as renderList } from "./vue-core-DdLVj9yW.js";
import { i as towerGoStorage, l as loadTencentMap, T as TOWERGO_CONFIG, g as fetchWalkingRoute, t as toTencentLatLng, j as towerGoApi } from "./walking_route_service-DmXuyG7m.js";
import { H as HBUT_LOCATION, f as formatDistance, b as batteryLevelTier, r as resolveTowerGoLocation, S as SCAN_REFRESH_INTERVAL_MS, a as normalizeVehicles, B as BATTERY_ICON_TIERS, C as CENTER_FETCH_DEBOUNCE_MS, n as normalizePoint } from "./towergo_map-DkOHuYT2.js";
import { p as pushDebugLog } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _export_sfc } from "./app-demo-CxKBY5JQ.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "towergo-view towergo-view--fullscreen module-page" };
const _hoisted_2 = { class: "tg-fs-title" };
const _hoisted_3 = ["disabled"];
const _hoisted_4 = { class: "tg-tabs tg-tabs--overlay" };
const _hoisted_5 = { key: 0 };
const _hoisted_6 = { class: "tg-map-panel tg-map-panel--fs" };
const _hoisted_7 = {
  key: 0,
  class: "map-fallback map-fallback--overlay"
};
const _hoisted_8 = { key: 0 };
const _hoisted_9 = { class: "map-toolbar map-toolbar--fs" };
const _hoisted_10 = ["disabled"];
const _hoisted_11 = ["disabled"];
const _hoisted_12 = {
  key: 1,
  class: "tg-vehicle-pop tg-vehicle-pop--apple"
};
const _hoisted_13 = { class: "pop-main" };
const _hoisted_14 = { class: "tg-list-panel" };
const _hoisted_15 = { class: "tg-filter-bar" };
const _hoisted_16 = { class: "seg" };
const _hoisted_17 = { class: "seg" };
const _hoisted_18 = {
  key: 0,
  class: "empty-row"
};
const _hoisted_19 = {
  key: 1,
  class: "empty-row"
};
const _hoisted_20 = {
  key: 2,
  class: "vehicle-scroll-list"
};
const _hoisted_21 = ["onClick"];
const _hoisted_22 = ["data-tier", "data-low"];
const _hoisted_23 = { class: "vehicle-main" };
const _hoisted_24 = ["data-low"];
const _hoisted_25 = {
  key: 0,
  class: "truncation-hint"
};
const _hoisted_26 = { class: "tg-area-panel" };
const _hoisted_27 = { class: "tg-area-card" };
const _hoisted_28 = { key: 0 };
const _hoisted_29 = { class: "tg-area-card" };
const _hoisted_30 = { class: "card-head" };
const _hoisted_31 = {
  key: 0,
  class: "progress-chip"
};
const _hoisted_32 = {
  key: 0,
  class: "empty-row"
};
const _hoisted_33 = {
  key: 1,
  class: "parking-list"
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "TowerGoView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const mapContainerRef = ref(null);
    const currentLocation = ref({ ...HBUT_LOCATION });
    const selectedVehicle = ref(null);
    const vehicles = ref([]);
    const serviceId = ref(String(towerGoStorage.get("serviceId") || ""));
    const serviceInfo = ref(null);
    const parkingInfo = ref(null);
    const fences = ref(null);
    const mapErrors = ref([]);
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
    const activeTab = ref("map");
    const sortBy = ref("distance");
    const filterMinBattery = ref(0);
    let refreshTimer = null;
    let mapErrorHandler = null;
    let activeScanToken = 0;
    let regionFetchTimer = null;
    const centerFetchInFlight = ref(false);
    const nearestVehicle = computed(() => vehicles.value[0] || null);
    const scanTimeText = computed(
      () => lastScanAt.value ? new Date(lastScanAt.value).toLocaleTimeString("zh-CN", { hour12: false }) : "--"
    );
    const serviceName = computed(() => String(serviceInfo.value?.name || "湖工大校区"));
    const sortedVehicles = computed(() => {
      const list = [...vehicles.value];
      const filtered = filterMinBattery.value > 0 ? list.filter((v) => Number(v.battery) >= filterMinBattery.value) : list;
      return filtered.sort(
        (a, b) => sortBy.value === "battery" ? Number(b.battery) - Number(a.battery) : Number(a.distance) - Number(b.distance)
      );
    });
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
        mapErrors.value = [error?.message || "地图加载失败"];
        pushDebugLog("TowerGo", `地图加载失败: ${error?.message || error}`, "error");
      }
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
          currentLocation.value = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
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
          mapErrors.value = [result.msg];
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
        mapErrors.value = [bikeResult, fenceResult].filter((item) => !item.ok).map((item) => item.msg);
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
      mapContainerRef.value = null;
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
          worker.postMessage = (message, transfer) => {
            try {
              nativePost(message, transfer);
            } catch {
            }
          };
          return worker;
        };
        wrapped.prototype = nativeWorker.prototype;
        try {
          Object.defineProperty(window, "Worker", { value: wrapped, configurable: true, writable: true });
        } catch {
        }
      }
    };
    onMounted(async () => {
      suppressMapWorkerError();
      await nextTick();
      await initMap();
      await refreshBySystemLocation();
      startRefreshTimer();
    });
    onBeforeUnmount(() => {
      teardownTowerGoRuntime();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", {
          class: "tg-fs-header",
          onPointerdown: _cache[0] || (_cache[0] = withModifiers(() => {
          }, ["stop"])),
          onTouchstart: _cache[1] || (_cache[1] = withModifiers(() => {
          }, ["stop"]))
        }, [
          createBaseVNode("button", {
            class: "tg-icon-btn tg-back-btn",
            type: "button",
            "aria-label": "返回",
            onPointerdown: withModifiers(handleBack, ["stop", "prevent"]),
            onClick: withModifiers(handleBack, ["stop", "prevent"]),
            onTouchend: withModifiers(handleBack, ["stop", "prevent"])
          }, [..._cache[10] || (_cache[10] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
          ])], 32),
          createBaseVNode("div", _hoisted_2, [
            _cache[11] || (_cache[11] = createBaseVNode("strong", null, "小塔出行", -1)),
            createBaseVNode("small", null, toDisplayString(mapSubtitle.value), 1)
          ]),
          createBaseVNode("button", {
            class: "tg-icon-btn",
            disabled: loadingMap.value,
            title: "刷新当前视野",
            onClick: refreshCurrentArea
          }, [..._cache[12] || (_cache[12] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "refresh", -1)
          ])], 8, _hoisted_3)
        ], 32),
        createBaseVNode("nav", _hoisted_4, [
          createBaseVNode("button", {
            class: normalizeClass({ active: activeTab.value === "map" }),
            onClick: _cache[2] || (_cache[2] = ($event) => activeTab.value = "map")
          }, [..._cache[13] || (_cache[13] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "map", -1),
            createTextVNode("地图 ", -1)
          ])], 2),
          createBaseVNode("button", {
            class: normalizeClass({ active: activeTab.value === "list" }),
            onClick: _cache[3] || (_cache[3] = ($event) => activeTab.value = "list")
          }, [
            _cache[14] || (_cache[14] = createBaseVNode("span", { class: "material-symbols-outlined" }, "two_wheeler", -1)),
            _cache[15] || (_cache[15] = createTextVNode("车辆 ", -1)),
            vehicles.value.length ? (openBlock(), createElementBlock("em", _hoisted_5, toDisplayString(vehicles.value.length), 1)) : createCommentVNode("", true)
          ], 2),
          createBaseVNode("button", {
            class: normalizeClass({ active: activeTab.value === "area" }),
            onClick: _cache[4] || (_cache[4] = ($event) => activeTab.value = "area")
          }, [..._cache[16] || (_cache[16] = [
            createBaseVNode("span", { class: "material-symbols-outlined" }, "place", -1),
            createTextVNode("服务区 ", -1)
          ])], 2)
        ]),
        withDirectives(createBaseVNode("section", _hoisted_6, [
          createBaseVNode("div", {
            ref_key: "mapContainerRef",
            ref: mapContainerRef,
            class: "tg-map tg-map--fs"
          }, null, 512),
          mapScriptState.value === "fallback" || mapScriptState.value !== "ready" && !mapDataReady.value ? (openBlock(), createElementBlock("div", _hoisted_7, [
            _cache[17] || (_cache[17] = createBaseVNode("span", { class: "material-symbols-outlined" }, "electric_bike", -1)),
            createBaseVNode("strong", null, toDisplayString(currentLocation.value.name || "湖北工业大学"), 1),
            createBaseVNode("p", null, toDisplayString(mapErrors.value[0] || "地图加载中，车辆数据会继续刷新。"), 1),
            currentLocation.value.latitude ? (openBlock(), createElementBlock("small", _hoisted_8, [
              createTextVNode(" 定位 " + toDisplayString(currentLocation.value.latitude.toFixed(5)) + ", " + toDisplayString(currentLocation.value.longitude.toFixed(5)) + " ", 1),
              currentLocation.value.source ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                createTextVNode(" · " + toDisplayString(currentLocation.value.source), 1)
              ], 64)) : createCommentVNode("", true)
            ])) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_9, [
            createBaseVNode("button", {
              disabled: locating.value || loadingMap.value,
              onClick: refreshBySystemLocation
            }, [
              _cache[18] || (_cache[18] = createBaseVNode("span", { class: "material-symbols-outlined" }, "my_location", -1)),
              createTextVNode(" " + toDisplayString(locating.value ? "定位中" : "定位"), 1)
            ], 8, _hoisted_10),
            createBaseVNode("button", {
              disabled: loadingMap.value,
              onClick: refreshCurrentArea
            }, [..._cache[19] || (_cache[19] = [
              createBaseVNode("span", { class: "material-symbols-outlined" }, "radar", -1),
              createTextVNode(" 刷新视野 ", -1)
            ])], 8, _hoisted_11)
          ]),
          selectedVehicle.value ? (openBlock(), createElementBlock("div", _hoisted_12, [
            _cache[21] || (_cache[21] = createBaseVNode("span", { class: "vehicle-icon material-symbols-outlined" }, "electric_bike", -1)),
            createBaseVNode("div", _hoisted_13, [
              createBaseVNode("strong", null, "NO." + toDisplayString(selectedVehicle.value.id || selectedVehicle.value.imei || "--"), 1),
              createBaseVNode("small", null, [
                createTextVNode(toDisplayString(unref(formatDistance)(selectedVehicle.value.distance)) + " · 电量 " + toDisplayString(selectedVehicle.value.battery || "--") + "% ", 1),
                routeIsStraight.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                  createTextVNode(" · 直线示意")
                ], 64)) : createCommentVNode("", true)
              ])
            ]),
            createBaseVNode("button", {
              class: "pop-nav",
              type: "button",
              onClick: startNavigateToSelected
            }, "到这"),
            createBaseVNode("button", {
              class: "pop-close",
              onClick: stopNavigateToSelected
            }, [..._cache[20] || (_cache[20] = [
              createBaseVNode("span", { class: "material-symbols-outlined" }, "close", -1)
            ])])
          ])) : createCommentVNode("", true)
        ], 512), [
          [vShow, activeTab.value === "map"]
        ]),
        withDirectives(createBaseVNode("section", _hoisted_14, [
          createBaseVNode("div", _hoisted_15, [
            createBaseVNode("div", _hoisted_16, [
              createBaseVNode("button", {
                class: normalizeClass({ active: sortBy.value === "distance" }),
                onClick: _cache[5] || (_cache[5] = ($event) => sortBy.value = "distance")
              }, "按距离", 2),
              createBaseVNode("button", {
                class: normalizeClass({ active: sortBy.value === "battery" }),
                onClick: _cache[6] || (_cache[6] = ($event) => sortBy.value = "battery")
              }, "按电量", 2)
            ]),
            createBaseVNode("div", _hoisted_17, [
              createBaseVNode("button", {
                class: normalizeClass({ active: filterMinBattery.value === 0 }),
                onClick: _cache[7] || (_cache[7] = ($event) => filterMinBattery.value = 0)
              }, "全部", 2),
              createBaseVNode("button", {
                class: normalizeClass({ active: filterMinBattery.value === 30 }),
                onClick: _cache[8] || (_cache[8] = ($event) => filterMinBattery.value = 30)
              }, "≥30%", 2),
              createBaseVNode("button", {
                class: normalizeClass({ active: filterMinBattery.value === 60 }),
                onClick: _cache[9] || (_cache[9] = ($event) => filterMinBattery.value = 60)
              }, "≥60%", 2)
            ])
          ]),
          (loadingMap.value || centerFetchInFlight.value) && !vehicles.value.length ? (openBlock(), createElementBlock("div", _hoisted_18, "正在加载附近车辆…")) : !loadingMap.value && !centerFetchInFlight.value && !sortedVehicles.value.length ? (openBlock(), createElementBlock("div", _hoisted_19, toDisplayString(mapErrors.value[0] || "暂无可展示车辆。"), 1)) : (openBlock(), createElementBlock("div", _hoisted_20, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(sortedVehicles.value.slice(0, 50), (vehicle) => {
              return openBlock(), createElementBlock("button", {
                key: vehicle.id || vehicle.imei,
                class: normalizeClass(["vehicle-row", { active: selectedVehicle.value?.id === vehicle.id }]),
                onClick: ($event) => selectVehicle(vehicle)
              }, [
                createBaseVNode("span", {
                  class: "vehicle-icon vehicle-icon--batt",
                  "data-tier": unref(batteryLevelTier)(vehicle.battery),
                  "data-low": Number(vehicle.battery) < 30 ? "1" : "0"
                }, [
                  _cache[22] || (_cache[22] = createBaseVNode("span", { class: "material-symbols-outlined" }, "electric_bike", -1)),
                  createBaseVNode("em", null, toDisplayString(unref(batteryLevelTier)(vehicle.battery)), 1)
                ], 8, _hoisted_22),
                createBaseVNode("span", _hoisted_23, [
                  createBaseVNode("strong", null, "NO." + toDisplayString(vehicle.id || vehicle.imei || "--"), 1),
                  createBaseVNode("small", null, toDisplayString(unref(formatDistance)(vehicle.distance)) + " · 电量 " + toDisplayString(vehicle.battery || "--") + "%", 1)
                ]),
                createBaseVNode("span", {
                  class: "vehicle-batt",
                  "data-low": Number(vehicle.battery) < 30 ? "1" : "0"
                }, toDisplayString(vehicle.battery || "--") + "%", 9, _hoisted_24)
              ], 10, _hoisted_21);
            }), 128)),
            sortedVehicles.value.length > 50 ? (openBlock(), createElementBlock("p", _hoisted_25, "（仅显示前 50 辆，地图上可见全部 " + toDisplayString(vehicles.value.length) + " 辆）", 1)) : createCommentVNode("", true)
          ]))
        ], 512), [
          [vShow, activeTab.value === "list"]
        ]),
        withDirectives(createBaseVNode("section", _hoisted_26, [
          createBaseVNode("article", _hoisted_27, [
            _cache[23] || (_cache[23] = createBaseVNode("span", null, "当前服务区", -1)),
            createBaseVNode("strong", null, toDisplayString(serviceName.value), 1),
            createBaseVNode("p", null, "serviceId：" + toDisplayString(serviceId.value || "--") + " · 最近刷新 " + toDisplayString(scanTimeText.value), 1),
            createBaseVNode("p", null, "自身定位：" + toDisplayString(Number(currentLocation.value.latitude).toFixed(5)) + ", " + toDisplayString(Number(currentLocation.value.longitude).toFixed(5)) + "（" + toDisplayString(locationSourceText.value) + "）", 1),
            lastFetchCenter.value ? (openBlock(), createElementBlock("p", _hoisted_28, " 最近查车中心：" + toDisplayString(Number(lastFetchCenter.value.latitude).toFixed(5)) + ", " + toDisplayString(Number(lastFetchCenter.value.longitude).toFixed(5)), 1)) : createCommentVNode("", true)
          ]),
          createBaseVNode("article", _hoisted_29, [
            createBaseVNode("div", _hoisted_30, [
              createBaseVNode("h3", null, "停车点（" + toDisplayString(parkingList.value.length) + "）", 1),
              loadingMap.value || centerFetchInFlight.value ? (openBlock(), createElementBlock("span", _hoisted_31, "刷新中")) : createCommentVNode("", true)
            ]),
            !parkingList.value.length ? (openBlock(), createElementBlock("div", _hoisted_32, "暂无停车点数据")) : (openBlock(), createElementBlock("ul", _hoisted_33, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(parkingList.value, (p, i) => {
                return openBlock(), createElementBlock("li", {
                  key: String(p.id || i)
                }, [
                  _cache[24] || (_cache[24] = createBaseVNode("span", { class: "material-symbols-outlined" }, "place", -1)),
                  createBaseVNode("div", null, [
                    createBaseVNode("strong", null, toDisplayString(p.name || "未命名停车点"), 1),
                    createBaseVNode("small", null, "当前 " + toDisplayString(p.carCount ?? "--") + " 辆 · 限停 " + toDisplayString(p.maxParkingNumber ?? "--"), 1)
                  ])
                ]);
              }), 128))
            ]))
          ])
        ], 512), [
          [vShow, activeTab.value === "area"]
        ])
      ]);
    };
  }
});
const TowerGoView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-ca873b98"]]);
export {
  TowerGoView as default
};
