import { _ as _export_sfc, f as fetchWithCache, a as axiosInstance, w as writeElectricityToWidget, b as setCachedData, s as showToast, o as openExternal } from "./app-demo-CxKBY5JQ.js";
import { q as qrToDataURL } from "./qrcode-aDWm1EFy.js";
import { u as useAppSettings } from "./more-modules-CsUTdMqs.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { f as fetchDormitoryDataset } from "./static_resource_cache-E8R6eQd0.js";
import { b as isTauriRuntime, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { p as prepareOneCodeAppOpen } from "./one_code_open-y7YuUCO7.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { o as onMounted, a as ref, e as computed, w as watch, E as resolveComponent, c as createElementBlock, b as openBlock, q as createVNode, d as createBaseVNode, u as unref, f as createCommentVNode, t as toDisplayString, g as createTextVNode, l as withCtx, F as Fragment, i as renderList, n as normalizeClass, h as normalizeStyle } from "./vue-core-DdLVj9yW.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
function hasUsageCurve(stats) {
  if (!stats) return false;
  const pts = stats.points;
  const month = stats.month_points ?? stats.monthPoints;
  return Array.isArray(pts) && pts.length > 0 || Array.isArray(month) && month.length > 0;
}
function isUsageSnapshotOnly(stats) {
  if (!stats || hasUsageCurve(stats)) return false;
  if (stats.success === false) return false;
  const hasQty = stats.quantity != null && String(stats.quantity).trim() !== "";
  const hasBal = stats.balance != null && String(stats.balance).trim() !== "";
  const hasToday = stats.today_use != null && String(stats.today_use).trim() !== "" || stats.todayUse != null && String(stats.todayUse).trim() !== "";
  const hasSummary = Boolean(String(stats.summary || "").trim());
  const hasMessage = Boolean(String(stats.message || "").trim());
  return hasQty || hasBal || hasToday || hasSummary || hasMessage;
}
function resolveUsageEmptyText(opts) {
  if (!opts.hasSelectedRoom) {
    return "请先选择宿舍查看用电趋势";
  }
  const msg = String(opts.stats?.message || "").trim();
  if (msg && !/请先选择宿舍/.test(msg)) {
    return msg;
  }
  return "该房间暂无分日/分月用电曲线，可查看上方电费余额";
}
const _hoisted_1 = { class: "electricity-page text-on-surface min-h-screen flex flex-col font-body-md max-w-[448px] mx-auto relative overflow-x-hidden" };
const _hoisted_2 = { class: "flex-1 px-container-padding pb-[100px] flex flex-col gap-5 mt-4" };
const _hoisted_3 = {
  key: 0,
  class: "bg-surface-container-high rounded-lg p-3 flex items-start gap-3"
};
const _hoisted_4 = { class: "font-label-md text-outline text-label-md mt-1" };
const _hoisted_5 = { class: "glass-card rounded-2xl p-5" };
const _hoisted_6 = { class: "grid grid-cols-2 gap-3" };
const _hoisted_7 = { class: "relative" };
const _hoisted_8 = ["value"];
const _hoisted_9 = { class: "relative" };
const _hoisted_10 = ["value"];
const _hoisted_11 = { class: "relative" };
const _hoisted_12 = ["value"];
const _hoisted_13 = { class: "relative" };
const _hoisted_14 = ["value"];
const _hoisted_15 = {
  key: 1,
  class: "glass-card rounded-2xl p-8 flex flex-col items-center justify-center gap-3"
};
const _hoisted_16 = { class: "absolute -right-4 -top-4 opacity-[0.15]" };
const _hoisted_17 = { class: "flex justify-between items-start mb-4 relative z-10" };
const _hoisted_18 = { class: "flex items-center gap-2" };
const _hoisted_19 = {
  class: "material-symbols-outlined text-[14px]",
  style: { "font-variation-settings": "'FILL' 1" }
};
const _hoisted_20 = { class: "grid grid-cols-2 gap-4 relative z-10" };
const _hoisted_21 = { class: "font-headline-md text-headline-md text-on-surface mt-1" };
const _hoisted_22 = { class: "mt-5 flex gap-3 relative z-10" };
const _hoisted_23 = ["disabled"];
const _hoisted_24 = {
  key: 0,
  class: "glass-card-info rounded-2xl p-5 relative overflow-hidden"
};
const _hoisted_25 = { class: "flex justify-between items-start mb-4 relative z-10" };
const _hoisted_26 = {
  class: "material-symbols-outlined text-[14px]",
  style: { "font-variation-settings": "'FILL' 1" }
};
const _hoisted_27 = { class: "grid grid-cols-2 gap-4 relative z-10" };
const _hoisted_28 = { class: "font-headline-md text-headline-md text-on-surface mt-1" };
const _hoisted_29 = { class: "mt-5 flex gap-3 relative z-10" };
const _hoisted_30 = ["disabled"];
const _hoisted_31 = {
  key: 1,
  class: "glass-card rounded-2xl p-5 flex items-center gap-3"
};
const _hoisted_32 = { class: "absolute -right-4 -top-4 opacity-[0.15]" };
const _hoisted_33 = { class: "flex justify-between items-start mb-4 relative z-10" };
const _hoisted_34 = { class: "flex items-center gap-2" };
const _hoisted_35 = {
  class: "material-symbols-outlined text-[14px]",
  style: { "font-variation-settings": "'FILL' 1" }
};
const _hoisted_36 = { class: "grid grid-cols-2 gap-4 relative z-10" };
const _hoisted_37 = { class: "font-headline-md text-headline-md text-on-surface mt-1" };
const _hoisted_38 = { class: "mt-5 flex gap-3 relative z-10" };
const _hoisted_39 = ["disabled"];
const _hoisted_40 = {
  key: 4,
  class: "glass-card-warning rounded-2xl p-5 flex items-center gap-3"
};
const _hoisted_41 = { class: "font-body-md text-body-md text-error" };
const _hoisted_42 = {
  key: 5,
  class: "glass-card rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center"
};
const _hoisted_43 = { class: "util-card usage-card" };
const _hoisted_44 = { class: "util-card-head" };
const _hoisted_45 = {
  key: 0,
  class: "bound-tag"
};
const _hoisted_46 = {
  key: 1,
  class: "bound-tag soft"
};
const _hoisted_47 = { class: "seg" };
const _hoisted_48 = {
  key: 0,
  class: "util-muted pulse"
};
const _hoisted_49 = {
  key: 1,
  class: "util-err-row"
};
const _hoisted_50 = { class: "kpi-row" };
const _hoisted_51 = { class: "kpi pop" };
const _hoisted_52 = {
  key: 0,
  class: "kpi focus pop"
};
const _hoisted_53 = { class: "kpi pop" };
const _hoisted_54 = ["aria-selected", "onClick"];
const _hoisted_55 = { class: "ibar-track" };
const _hoisted_56 = { class: "ibar-val" };
const _hoisted_57 = { class: "ibar-lab" };
const _hoisted_58 = {
  key: 3,
  class: "usage-snapshot"
};
const _hoisted_59 = { class: "util-muted" };
const _hoisted_60 = {
  key: 0,
  class: "kpi-row snapshot-kpi"
};
const _hoisted_61 = {
  key: 0,
  class: "kpi pop"
};
const _hoisted_62 = {
  key: 1,
  class: "kpi pop"
};
const _hoisted_63 = {
  key: 4,
  class: "util-muted"
};
const _hoisted_64 = { class: "util-card pay-card" };
const _hoisted_65 = { class: "pay-actions" };
const _hoisted_66 = ["disabled"];
const _hoisted_67 = ["disabled", "aria-pressed"];
const _hoisted_68 = {
  key: 0,
  class: "pay-qr"
};
const _hoisted_69 = ["src"];
const _sfc_main = {
  __name: "ElectricityView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const loading = ref(false);
    const dormData = ref([]);
    const selectedPath = ref([]);
    const balanceData = ref(null);
    const acBalanceData = ref(null);
    const errorMsg = ref("");
    const offline = ref(false);
    const syncTime = ref("");
    const API_BASE = "/api";
    const appSettings = useAppSettings();
    const maxRetry = computed(() => appSettings.retry.electricity);
    const retryDelayMs = computed(() => appSettings.retryDelayMs);
    const isDualBilling = ref(false);
    const currentLevelMapping = ref(null);
    const normalizePathValue = (value) => {
      if (value && typeof value === "object") {
        return String(value.value ?? value.id ?? value.label ?? value.name ?? "").trim();
      }
      return String(value ?? "").trim();
    };
    const normalizeSelectionPath = (value) => {
      if (!Array.isArray(value)) return [];
      return value.map((item) => normalizePathValue(item)).filter((item) => item !== "");
    };
    const findByValue = (list, value) => (Array.isArray(list) ? list : []).find((item) => String(item?.value) === String(value));
    const getStaleCache = (cacheKey) => {
      try {
        const raw = localStorage.getItem(`cache:${cacheKey}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.data) return null;
        return { data: parsed.data, timestamp: parsed.timestamp };
      } catch (e) {
        return null;
      }
    };
    const mergeLevels = (rawData) => {
      if (!Array.isArray(rawData)) return [];
      return rawData.map((area) => ({
        ...area,
        children: (area.children || []).map((building) => {
          const levels = building.children || [];
          const lightLevels = {};
          const acLevels = {};
          const plainLevels = [];
          levels.forEach((level) => {
            const label = level.label || "";
            const lightMatch = label.match(/^照明(\d+)层$/);
            const acMatch = label.match(/^空调(\d+)层$/);
            if (lightMatch) {
              lightLevels[lightMatch[1]] = level;
            } else if (acMatch) {
              acLevels[acMatch[1]] = level;
            } else {
              plainLevels.push(level);
            }
          });
          const lightFloors = Object.keys(lightLevels);
          const acFloors = Object.keys(acLevels);
          const hasDual = lightFloors.length > 0 && acFloors.length > 0;
          if (!hasDual && lightFloors.length === 0 && acFloors.length === 0) {
            return building;
          }
          const mergedLevels = [];
          const allFloorNums = /* @__PURE__ */ new Set([...lightFloors, ...acFloors]);
          const sortedFloors = [...allFloorNums].sort((a, b) => Number(a) - Number(b));
          sortedFloors.forEach((floorNum) => {
            const lightLevel = lightLevels[floorNum];
            const acLevel = acLevels[floorNum];
            const baseLevel = lightLevel || acLevel;
            const mergedValue = `merged_${floorNum}_${lightLevel?.value || ""}_${acLevel?.value || ""}`;
            let acRoomMap = null;
            if (lightLevel && acLevel) {
              acRoomMap = {};
              const acByNum = {};
              (acLevel.children || []).forEach((r) => {
                const num = (r.label || "").replace(/房间$/, "");
                acByNum[num] = r.value;
              });
              (lightLevel.children || []).forEach((r) => {
                const lightNum = (r.label || "").replace(/房间$/, "");
                const candidates = ["1" + lightNum, "6" + lightNum, lightNum];
                for (const c of candidates) {
                  if (acByNum[c]) {
                    acRoomMap[r.value] = acByNum[c];
                    break;
                  }
                }
              });
            }
            const mergedChildren = (baseLevel.children || []).map((room) => {
              const acVal = acRoomMap?.[room.value] || null;
              return acVal ? { ...room, _acRoomValue: acVal } : room;
            });
            mergedLevels.push({
              value: mergedValue,
              label: `${floorNum}层`,
              children: mergedChildren,
              _lightLayerId: lightLevel?.value || null,
              _acLayerId: acLevel?.value || null,
              _isDual: !!(lightLevel && acLevel),
              _floorNum: floorNum
            });
          });
          plainLevels.forEach((p) => mergedLevels.push(p));
          return {
            ...building,
            children: mergedLevels
          };
        })
      }));
    };
    onMounted(async () => {
      try {
        const { data } = await fetchDormitoryDataset();
        dormData.value = mergeLevels(data?.data || []);
        const saved = localStorage.getItem("last_dorm_selection");
        if (saved) {
          selectedPath.value = normalizeSelectionPath(JSON.parse(saved));
          if (selectedPath.value.length === 4) {
            const levelNode = currentLevel.value;
            if (levelNode?._isDual) {
              isDualBilling.value = true;
              currentLevelMapping.value = {
                lightLayerId: levelNode._lightLayerId,
                acLayerId: levelNode._acLayerId
              };
              const roomNode = levelNode.children?.find((r) => r.value === selectedPath.value[3]);
              if (roomNode?._acRoomValue) {
                localStorage.setItem("last_dorm_ac_room", JSON.stringify(roomNode._acRoomValue));
              }
            }
            fetchBalance();
          }
        }
      } catch (e) {
        console.error("加载宿舍数据失败:", e);
        errorMsg.value = "无法加载宿舍列表，请稍后重试";
      }
    });
    const currentArea = computed(() => findByValue(dormData.value, selectedPath.value[0]));
    const currentBuilding = computed(() => {
      if (!currentArea.value || !selectedPath.value[1]) return null;
      return findByValue(currentArea.value.children, selectedPath.value[1]);
    });
    const currentLevel = computed(() => {
      if (!currentBuilding.value || !selectedPath.value[2]) return null;
      return findByValue(currentBuilding.value.children, selectedPath.value[2]);
    });
    const selectedAreaValue = computed({
      get: () => selectedPath.value[0] ?? "",
      set: (value) => handleSelect(0, value)
    });
    const selectedBuildingValue = computed({
      get: () => selectedPath.value[1] ?? "",
      set: (value) => handleSelect(1, value)
    });
    const selectedLevelValue = computed({
      get: () => selectedPath.value[2] ?? "",
      set: (value) => handleSelect(2, value)
    });
    const selectedRoomValue = computed({
      get: () => selectedPath.value[3] ?? "",
      set: (value) => handleSelect(3, value)
    });
    const handleSelect = (level, value) => {
      const normalizedValue = normalizePathValue(value);
      const nextPath = normalizeSelectionPath(selectedPath.value.slice(0, level));
      if (normalizedValue) {
        nextPath[level] = normalizedValue;
      }
      selectedPath.value = [...nextPath];
      if (level >= 2) {
        const levelNode = findByValue(currentBuilding.value?.children, selectedPath.value[2]);
        if (levelNode && levelNode._isDual) {
          isDualBilling.value = true;
          currentLevelMapping.value = {
            lightLayerId: levelNode._lightLayerId,
            acLayerId: levelNode._acLayerId
          };
        } else {
          isDualBilling.value = false;
          currentLevelMapping.value = null;
        }
      } else {
        isDualBilling.value = false;
        currentLevelMapping.value = null;
      }
      if (level === 3 && selectedPath.value.length === 4) {
        localStorage.setItem("last_dorm_selection", JSON.stringify(selectedPath.value));
        const labels = [
          currentArea.value?.label || "",
          currentBuilding.value?.label || "",
          currentLevel.value?.label || "",
          currentLevel.value?.children?.find((r) => r.value === selectedPath.value[3])?.label || ""
        ].filter(Boolean);
        localStorage.setItem("last_dorm_selection_label", labels.join(" "));
        const roomNode = currentLevel.value?.children?.find((r) => r.value === selectedPath.value[3]);
        if (roomNode?._acRoomValue) {
          localStorage.setItem("last_dorm_ac_room", JSON.stringify(roomNode._acRoomValue));
        } else {
          localStorage.removeItem("last_dorm_ac_room");
        }
        fetchBalance();
      } else {
        balanceData.value = null;
        acBalanceData.value = null;
      }
    };
    const requestBalanceOnline = async (payload, cacheKey) => {
      const res = await axiosInstance.post(`${API_BASE}/v2/electricity/balance`, payload);
      const data = res?.data;
      if (data?.success && data?.offline !== true) {
        setCachedData(cacheKey, data);
      }
      return { data, timestamp: Date.now() };
    };
    const parseLayerIds = (levelValue) => {
      if (currentLevelMapping.value) {
        return currentLevelMapping.value;
      }
      if (typeof levelValue === "string" && levelValue.startsWith("merged_")) {
        const parts = levelValue.split("_");
        return {
          lightLayerId: parts[2] || null,
          acLayerId: parts[3] || null
        };
      }
      return { lightLayerId: levelValue, acLayerId: null };
    };
    const fetchBalance = async ({ retryCount = 0, forceNetwork = false } = {}) => {
      if (selectedPath.value.length !== 4) return;
      loading.value = true;
      if (retryCount === 0) errorMsg.value = "";
      const [area_id, building_id, layer_id, room_id] = selectedPath.value;
      const { lightLayerId, acLayerId } = parseLayerIds(layer_id);
      const hasDual = !!(lightLayerId && acLayerId);
      try {
        const realLightLayerId = lightLayerId || layer_id;
        const lightCacheKey = `electricity:${props.studentId}:${area_id}-${building_id}-${realLightLayerId}-${room_id}`;
        const lightPayload = {
          area_id,
          building_id,
          layer_id: realLightLayerId,
          room_id,
          student_id: props.studentId
        };
        const lightResult = forceNetwork ? await requestBalanceOnline(lightPayload, lightCacheKey) : await fetchWithCache(lightCacheKey, async () => {
          const res = await axiosInstance.post(`${API_BASE}/v2/electricity/balance`, lightPayload);
          return res.data;
        });
        if (lightResult.data?.success) {
          balanceData.value = lightResult.data;
          offline.value = lightResult.data?.offline === true;
          syncTime.value = lightResult.data?.sync_time || "";
          writeElectricityToWidget({
            quantity: Number(lightResult.data?.quantity) || 0,
            room: selectedPath.value.join(" / ") || "",
            isLow: Number(lightResult.data?.quantity) < 10
          }).catch(() => {
          });
        } else {
          const cached = getStaleCache(lightCacheKey);
          if (cached?.data) {
            balanceData.value = cached.data;
            offline.value = true;
            syncTime.value = cached.data?.sync_time || new Date(cached.timestamp).toLocaleString();
          } else {
            errorMsg.value = lightResult.data?.error || "查询失败";
            balanceData.value = null;
          }
        }
        if (hasDual) {
          isDualBilling.value = true;
          const roomNode = currentLevel.value?.children?.find((r) => r.value === room_id);
          const acRoomValue = roomNode?._acRoomValue;
          if (!acRoomValue) {
            acBalanceData.value = null;
          } else {
            const acCacheKey = `electricity:${props.studentId}:${area_id}-${building_id}-${acLayerId}-${acRoomValue}`;
            const acPayload = {
              area_id,
              building_id,
              layer_id: acLayerId,
              room_id: acRoomValue,
              student_id: props.studentId
            };
            try {
              const acResult = forceNetwork ? await requestBalanceOnline(acPayload, acCacheKey) : await fetchWithCache(acCacheKey, async () => {
                const res = await axiosInstance.post(`${API_BASE}/v2/electricity/balance`, acPayload);
                return res.data;
              });
              if (acResult.data?.success) {
                acBalanceData.value = acResult.data;
              } else {
                const cached = getStaleCache(acCacheKey);
                if (cached?.data) {
                  acBalanceData.value = cached.data;
                } else {
                  acBalanceData.value = null;
                }
              }
            } catch {
              acBalanceData.value = null;
            }
          }
        } else {
          isDualBilling.value = false;
          acBalanceData.value = null;
        }
      } catch (e) {
        console.error("电费查询错误:", e);
        if (e.response && (e.response.status === 502 || e.response.status === 504) || e.message.includes("Network Error")) {
          if (retryCount < maxRetry.value) {
            errorMsg.value = `系统预热中，正在重试 (${retryCount + 1}/${maxRetry.value})...`;
            setTimeout(() => {
              fetchBalance({ retryCount: retryCount + 1, forceNetwork });
            }, retryDelayMs.value);
            return;
          } else {
            errorMsg.value = "服务器响应超时，请稍后再试";
          }
        } else {
          const cacheKey = `electricity:${props.studentId}:${selectedPath.value.join("-")}`;
          const cached = getStaleCache(cacheKey);
          if (cached?.data) {
            balanceData.value = cached.data;
            offline.value = true;
            syncTime.value = cached.data?.sync_time || new Date(cached.timestamp).toLocaleString();
            errorMsg.value = "";
          } else {
            errorMsg.value = e.message || "网络错误";
            balanceData.value = null;
          }
        }
      } finally {
        if (!String(errorMsg.value || "").includes("正在重试")) {
          loading.value = false;
        }
      }
    };
    const handleBack = () => emit("back");
    const payLoading = ref(false);
    const showPayQr = ref(false);
    const payQr = ref("");
    const usageStats = ref(null);
    const usageLoading = ref(false);
    const usageError = ref("");
    const usageTab = ref("week");
    const selectedBarIdx = ref(-1);
    const chartReady = ref(false);
    const mapPoints = (pts, short = true) => {
      if (!Array.isArray(pts)) return [];
      return pts.map((p) => {
        const full = String(p?.label || p?.date || p?.fullLabel || "—");
        const label = short ? full.replace(/^\d{4}-?/, "").slice(0, 5) || full : full;
        return {
          label,
          fullLabel: full,
          value: Number(p?.value ?? p?.dayuse ?? 0) || 0,
          unit: p?.unit || "度"
        };
      });
    };
    const weekPoints = computed(() => mapPoints(usageStats.value?.points));
    const monthPoints = computed(
      () => mapPoints(usageStats.value?.month_points || usageStats.value?.monthPoints, false)
    );
    const activePoints = computed(
      () => usageTab.value === "month" ? monthPoints.value : weekPoints.value
    );
    const chartMax = computed(() => {
      const vals = activePoints.value.map((p) => p.value);
      const m = Math.max(0, ...vals);
      return m > 0 ? m : 1;
    });
    const selectedPoint = computed(() => {
      const pts = activePoints.value;
      if (!pts.length) return null;
      const i = selectedBarIdx.value >= 0 && selectedBarIdx.value < pts.length ? selectedBarIdx.value : pts.length - 1;
      return { ...pts[i], index: i };
    });
    const periodSum = computed(
      () => activePoints.value.reduce((s, p) => s + (Number(p.value) || 0), 0)
    );
    const todayUse = computed(
      () => usageStats.value?.today_use ?? usageStats.value?.todayUse ?? null
    );
    const selectedRoomLabel = computed(() => {
      if (selectedPath.value.length === 4 && currentLevel.value) {
        const room = currentLevel.value.children?.find(
          (r) => r.value === selectedPath.value[3]
        );
        const parts = [
          currentArea.value?.label,
          currentBuilding.value?.label,
          currentLevel.value?.label,
          room?.label
        ].filter(Boolean);
        return parts.join(" ");
      }
      return "";
    });
    const displayRoomName = computed(() => {
      if (selectedRoomLabel.value) return selectedRoomLabel.value;
      return usageStats.value?.room_name || usageStats.value?.roomName || "";
    });
    const usageSourceHint = computed(() => {
      const src = usageStats.value?.source || "";
      const hint = usageStats.value?.hint || "";
      if (hint) return hint;
      if (src === "selected") return "用电趋势：当前所选房间";
      if (src === "bound") return "用电趋势：一码通绑定房间";
      return "";
    });
    const hasSelectedRoom = computed(() => selectedPath.value.length === 4);
    const usageSnapshotOnly = computed(() => isUsageSnapshotOnly(usageStats.value));
    const usageEmptyText = computed(
      () => resolveUsageEmptyText({
        hasSelectedRoom: hasSelectedRoom.value,
        stats: usageStats.value
      })
    );
    const usageSnapshotQuantity = computed(() => {
      const q = usageStats.value?.quantity;
      if (q == null || String(q).trim() === "") return "";
      return String(q);
    });
    const usageSnapshotBalance = computed(() => {
      const b = usageStats.value?.balance;
      if (b == null || String(b).trim() === "") return "";
      return String(b);
    });
    let usageRequestSeq = 0;
    const selectBar = (i) => {
      selectedBarIdx.value = i;
    };
    const switchUsageTab = (tab) => {
      usageTab.value = tab;
      selectedBarIdx.value = -1;
      chartReady.value = false;
      requestAnimationFrame(() => {
        chartReady.value = true;
      });
    };
    const openElectricityPay = async () => {
      payLoading.value = true;
      try {
        const res = await prepareOneCodeAppOpen({ appCode: "electric", appName: "缴电费" });
        if (res.openUrl) {
          await openExternal(res.openUrl);
          try {
            payQr.value = await qrToDataURL(res.openUrl, { width: 180 });
          } catch {
            payQr.value = "";
          }
        }
      } catch (e) {
        showToast(String(e?.message || e || "打开失败"));
      } finally {
        payLoading.value = false;
      }
    };
    const togglePayQr = async () => {
      if (showPayQr.value) {
        showPayQr.value = false;
        return;
      }
      payLoading.value = true;
      try {
        const res = await prepareOneCodeAppOpen({ appCode: "electric", appName: "缴电费" });
        payQr.value = await qrToDataURL(res.openUrl, { width: 180 });
        showPayQr.value = true;
      } catch (e) {
        showToast(String(e?.message || e || "生成二维码失败"));
      } finally {
        payLoading.value = false;
      }
    };
    const roomLabelText = () => {
      if (selectedPath.value.length < 4) return "";
      const room = currentLevel.value?.children?.find(
        (r) => r.value === selectedPath.value[3]
      );
      return [
        currentArea.value?.label,
        currentBuilding.value?.label,
        currentLevel.value?.label,
        room?.label
      ].filter(Boolean).join(" ");
    };
    const loadUsageStats = async () => {
      if (!isTauriRuntime()) return;
      const reqId = ++usageRequestSeq;
      usageLoading.value = true;
      usageError.value = "";
      selectedBarIdx.value = -1;
      chartReady.value = false;
      try {
        const roomId = selectedPath.value.length === 4 ? String(selectedPath.value[3] || "").trim() : "";
        let acRoomId = "";
        if (selectedPath.value.length === 4 && currentLevel.value) {
          const roomNode = currentLevel.value.children?.find(
            (r) => r.value === selectedPath.value[3]
          );
          acRoomId = String(roomNode?._acRoomValue || "").trim();
        }
        const res = await invokeNative("electricity_usage_stats", {
          roomPath: selectedPath.value.length ? [...selectedPath.value] : null,
          roomVerify: roomId || null,
          roomVerifyAlt: acRoomId || null,
          roomLabel: roomLabelText() || null
        });
        if (reqId !== usageRequestSeq) return;
        usageStats.value = res || null;
        const pts = res?.points;
        const monthPts = res?.month_points || res?.monthPoints;
        const hasPts = Array.isArray(pts) && pts.length;
        const hasMonth = Array.isArray(monthPts) && monthPts.length;
        if (res?.success === false && !hasPts && !hasMonth) {
          const raw = String(res?.message || "暂无用电数据");
          usageError.value = hasSelectedRoom.value && /请先选择宿舍/.test(raw) ? "该房间暂无用电趋势数据，可重试或查看上方电费余额" : raw;
        } else if (hasPts || hasMonth) {
          requestAnimationFrame(() => {
            if (reqId === usageRequestSeq) chartReady.value = true;
          });
        }
        if (res?.bound_updated || res?.boundUpdated) {
          const hint = String(res?.hint || "").trim();
          if (hint) showToast(hint, "success");
        }
      } catch (e) {
        if (reqId !== usageRequestSeq) return;
        usageError.value = String(e?.message || e || "加载失败");
        usageStats.value = null;
      } finally {
        if (reqId === usageRequestSeq) {
          usageLoading.value = false;
        }
      }
    };
    onMounted(() => {
      if (isTauriRuntime()) void loadUsageStats();
    });
    watch(
      () => selectedPath.value.join("|"),
      (key, prev) => {
        if (key === prev) return;
        showPayQr.value = false;
        if (selectedPath.value.length === 4) {
          void loadUsageStats();
        } else {
          usageRequestSeq += 1;
          usageStats.value = null;
          usageError.value = "";
          chartReady.value = false;
          usageLoading.value = false;
        }
      }
    );
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          icon: "bolt",
          title: "电费查询",
          onBack: handleBack
        }),
        createBaseVNode("main", _hoisted_2, [
          offline.value ? (openBlock(), createElementBlock("div", _hoisted_3, [
            _cache[10] || (_cache[10] = createBaseVNode("span", {
              class: "material-symbols-outlined text-secondary mt-0.5",
              style: { "font-variation-settings": "'FILL' 0" }
            }, "cloud_off", -1)),
            createBaseVNode("div", null, [
              _cache[9] || (_cache[9] = createBaseVNode("p", { class: "font-body-md text-on-surface-variant text-body-md" }, "当前显示为离线缓存数据", -1)),
              createBaseVNode("p", _hoisted_4, "最后更新: " + toDisplayString(unref(formatRelativeTime)(syncTime.value)), 1)
            ])
          ])) : createCommentVNode("", true),
          createBaseVNode("section", _hoisted_5, [
            _cache[19] || (_cache[19] = createBaseVNode("h2", { class: "font-headline-sm text-headline-sm text-on-surface mb-4 flex items-center gap-2" }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined text-primary",
                style: { "font-variation-settings": "'FILL' 0" }
              }, "apartment"),
              createTextVNode(" 宿舍信息 ")
            ], -1)),
            createBaseVNode("div", _hoisted_6, [
              createBaseVNode("div", _hoisted_7, [
                _cache[12] || (_cache[12] = createBaseVNode("label", { class: "block font-label-sm text-label-sm text-outline mb-1 pl-1" }, "校区", -1)),
                createVNode(_component_IOSSelect, {
                  modelValue: selectedAreaValue.value,
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selectedAreaValue.value = $event),
                  placeholder: "选择校区",
                  class: "w-full bg-surface-container-low rounded-xl text-sm"
                }, {
                  default: withCtx(() => [
                    _cache[11] || (_cache[11] = createBaseVNode("option", {
                      value: "",
                      disabled: ""
                    }, "选择校区", -1)),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(dormData.value, (area) => {
                      return openBlock(), createElementBlock("option", {
                        key: area.value,
                        value: area.value
                      }, toDisplayString(area.label), 9, _hoisted_8);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue"])
              ]),
              createBaseVNode("div", _hoisted_9, [
                _cache[14] || (_cache[14] = createBaseVNode("label", { class: "block font-label-sm text-label-sm text-outline mb-1 pl-1" }, "楼栋", -1)),
                createVNode(_component_IOSSelect, {
                  modelValue: selectedBuildingValue.value,
                  "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => selectedBuildingValue.value = $event),
                  disabled: !selectedPath.value[0],
                  placeholder: "选择楼栋",
                  class: "w-full bg-surface-container-low rounded-xl text-sm"
                }, {
                  default: withCtx(() => [
                    _cache[13] || (_cache[13] = createBaseVNode("option", {
                      value: "",
                      disabled: ""
                    }, "选择楼栋", -1)),
                    currentArea.value ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(currentArea.value.children, (b) => {
                      return openBlock(), createElementBlock("option", {
                        key: b.value,
                        value: b.value
                      }, toDisplayString(b.label), 9, _hoisted_10);
                    }), 128)) : createCommentVNode("", true)
                  ]),
                  _: 1
                }, 8, ["modelValue", "disabled"])
              ]),
              createBaseVNode("div", _hoisted_11, [
                _cache[16] || (_cache[16] = createBaseVNode("label", { class: "block font-label-sm text-label-sm text-outline mb-1 pl-1" }, "楼层", -1)),
                createVNode(_component_IOSSelect, {
                  modelValue: selectedLevelValue.value,
                  "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => selectedLevelValue.value = $event),
                  disabled: !selectedPath.value[1],
                  placeholder: "选择楼层",
                  class: "w-full bg-surface-container-low rounded-xl text-sm"
                }, {
                  default: withCtx(() => [
                    _cache[15] || (_cache[15] = createBaseVNode("option", {
                      value: "",
                      disabled: ""
                    }, "选择楼层", -1)),
                    currentBuilding.value ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(currentBuilding.value.children, (l) => {
                      return openBlock(), createElementBlock("option", {
                        key: l.value,
                        value: l.value
                      }, toDisplayString(l.label), 9, _hoisted_12);
                    }), 128)) : createCommentVNode("", true)
                  ]),
                  _: 1
                }, 8, ["modelValue", "disabled"])
              ]),
              createBaseVNode("div", _hoisted_13, [
                _cache[18] || (_cache[18] = createBaseVNode("label", { class: "block font-label-sm text-label-sm text-outline mb-1 pl-1" }, "房间", -1)),
                createVNode(_component_IOSSelect, {
                  modelValue: selectedRoomValue.value,
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => selectedRoomValue.value = $event),
                  disabled: !selectedPath.value[2],
                  placeholder: "选择房间",
                  class: "w-full bg-surface-container-low rounded-xl text-sm"
                }, {
                  default: withCtx(() => [
                    _cache[17] || (_cache[17] = createBaseVNode("option", {
                      value: "",
                      disabled: ""
                    }, "选择房间", -1)),
                    currentLevel.value ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(currentLevel.value.children, (r) => {
                      return openBlock(), createElementBlock("option", {
                        key: r.value,
                        value: r.value
                      }, toDisplayString(r.label), 9, _hoisted_14);
                    }), 128)) : createCommentVNode("", true)
                  ]),
                  _: 1
                }, 8, ["modelValue", "disabled"])
              ])
            ])
          ]),
          loading.value ? (openBlock(), createElementBlock("div", _hoisted_15, [..._cache[20] || (_cache[20] = [
            createBaseVNode("div", { class: "animate-spin" }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined text-primary text-3xl",
                style: { "font-variation-settings": "'FILL' 0" }
              }, "progress_activity")
            ], -1),
            createBaseVNode("p", { class: "font-body-md text-body-md text-on-surface-variant" }, "正在查询电费信息...", -1)
          ])])) : balanceData.value && isDualBilling.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            createBaseVNode("section", {
              class: normalizeClass([
                "rounded-2xl p-5 relative overflow-hidden",
                parseFloat(balanceData.value.quantity) < 10 ? "glass-card-warning" : "glass-card-info"
              ])
            }, [
              createBaseVNode("div", _hoisted_16, [
                createBaseVNode("span", {
                  class: normalizeClass(["material-symbols-outlined text-9xl", parseFloat(balanceData.value.quantity) < 10 ? "text-error" : "text-primary"]),
                  style: { "font-variation-settings": "'FILL' 1" }
                }, "lightbulb", 2)
              ]),
              createBaseVNode("div", _hoisted_17, [
                createBaseVNode("div", _hoisted_18, [
                  createBaseVNode("div", {
                    class: normalizeClass([
                      "rounded-full p-2 flex items-center justify-center",
                      parseFloat(balanceData.value.quantity) < 10 ? "bg-error-container text-error" : "bg-primary-container/20 text-primary"
                    ])
                  }, [..._cache[21] || (_cache[21] = [
                    createBaseVNode("span", {
                      class: "material-symbols-outlined text-lg",
                      style: { "font-variation-settings": "'FILL' 1" }
                    }, "lightbulb", -1)
                  ])], 2),
                  _cache[22] || (_cache[22] = createBaseVNode("h3", { class: "font-headline-sm text-headline-sm text-on-surface" }, "照明用电", -1))
                ]),
                createBaseVNode("div", {
                  class: normalizeClass([
                    "font-label-sm text-label-sm px-2 py-1 rounded-md flex items-center gap-1",
                    parseFloat(balanceData.value.quantity) < 10 ? "bg-error/10 text-error" : "bg-success-teal/10 text-success-teal"
                  ])
                }, [
                  createBaseVNode("span", _hoisted_19, toDisplayString(parseFloat(balanceData.value.quantity) < 10 ? "warning" : "check_circle"), 1),
                  createTextVNode(" " + toDisplayString(parseFloat(balanceData.value.quantity) < 10 ? "余额不足" : "运行正常"), 1)
                ], 2)
              ]),
              createBaseVNode("div", _hoisted_20, [
                createBaseVNode("div", null, [
                  _cache[23] || (_cache[23] = createBaseVNode("p", { class: "font-label-md text-label-md text-on-surface-variant mb-1" }, "剩余电量 (度)", -1)),
                  createBaseVNode("p", {
                    class: normalizeClass(["font-headline-lg text-headline-lg", parseFloat(balanceData.value.quantity) < 10 ? "text-error" : "text-primary"])
                  }, toDisplayString(balanceData.value.quantity), 3)
                ]),
                createBaseVNode("div", null, [
                  _cache[24] || (_cache[24] = createBaseVNode("p", { class: "font-label-md text-label-md text-on-surface-variant mb-1" }, "剩余金额 (元)", -1)),
                  createBaseVNode("p", _hoisted_21, "¥ " + toDisplayString(balanceData.value.balance), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_22, [
                createBaseVNode("button", {
                  type: "button",
                  class: normalizeClass([
                    "flex-1 font-body-lg text-body-lg py-3 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-transform",
                    parseFloat(balanceData.value.quantity) < 10 ? "bg-primary text-on-primary shadow-md shadow-primary/20" : "bg-primary-container/10 text-primary"
                  ]),
                  disabled: payLoading.value,
                  onClick: openElectricityPay
                }, [
                  _cache[25] || (_cache[25] = createBaseVNode("span", {
                    class: "material-symbols-outlined text-[20px]",
                    style: { "font-variation-settings": "'FILL' 1" }
                  }, "account_balance_wallet", -1)),
                  createTextVNode(" " + toDisplayString(payLoading.value ? "准备中…" : parseFloat(balanceData.value.quantity) < 10 ? "立即充值" : "去充值"), 1)
                ], 10, _hoisted_23),
                createBaseVNode("button", {
                  class: "bg-surface-container-lowest text-primary border border-primary/20 rounded-full w-12 h-12 flex items-center justify-center active:scale-95 transition-transform shadow-sm",
                  onClick: _cache[4] || (_cache[4] = ($event) => fetchBalance({ forceNetwork: true }))
                }, [..._cache[26] || (_cache[26] = [
                  createBaseVNode("span", {
                    class: "material-symbols-outlined",
                    style: { "font-variation-settings": "'FILL' 0" }
                  }, "refresh", -1)
                ])])
              ])
            ], 2),
            acBalanceData.value ? (openBlock(), createElementBlock("section", _hoisted_24, [
              _cache[32] || (_cache[32] = createBaseVNode("div", { class: "absolute -right-4 -top-4 opacity-[0.12]" }, [
                createBaseVNode("span", {
                  class: "material-symbols-outlined text-9xl text-info-sky",
                  style: { "font-variation-settings": "'FILL' 1" }
                }, "ac_unit")
              ], -1)),
              createBaseVNode("div", _hoisted_25, [
                _cache[27] || (_cache[27] = createBaseVNode("div", { class: "flex items-center gap-2" }, [
                  createBaseVNode("div", { class: "bg-primary-container/20 text-primary rounded-full p-2 flex items-center justify-center" }, [
                    createBaseVNode("span", {
                      class: "material-symbols-outlined text-lg",
                      style: { "font-variation-settings": "'FILL' 1" }
                    }, "ac_unit")
                  ]),
                  createBaseVNode("h3", { class: "font-headline-sm text-headline-sm text-on-surface" }, "空调用电")
                ], -1)),
                createBaseVNode("div", {
                  class: normalizeClass([
                    "font-label-sm text-label-sm px-2 py-1 rounded-md flex items-center gap-1",
                    parseFloat(acBalanceData.value.quantity) < 10 ? "bg-error/10 text-error" : "bg-success-teal/10 text-success-teal"
                  ])
                }, [
                  createBaseVNode("span", _hoisted_26, toDisplayString(parseFloat(acBalanceData.value.quantity) < 10 ? "warning" : "check_circle"), 1),
                  createTextVNode(" " + toDisplayString(parseFloat(acBalanceData.value.quantity) < 10 ? "余额不足" : "运行正常"), 1)
                ], 2)
              ]),
              createBaseVNode("div", _hoisted_27, [
                createBaseVNode("div", null, [
                  _cache[28] || (_cache[28] = createBaseVNode("p", { class: "font-label-md text-label-md text-on-surface-variant mb-1" }, "剩余电量 (度)", -1)),
                  createBaseVNode("p", {
                    class: normalizeClass(["font-headline-lg text-headline-lg", parseFloat(acBalanceData.value.quantity) < 10 ? "text-error" : "text-primary"])
                  }, toDisplayString(acBalanceData.value.quantity), 3)
                ]),
                createBaseVNode("div", null, [
                  _cache[29] || (_cache[29] = createBaseVNode("p", { class: "font-label-md text-label-md text-on-surface-variant mb-1" }, "剩余金额 (元)", -1)),
                  createBaseVNode("p", _hoisted_28, "¥ " + toDisplayString(acBalanceData.value.balance), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_29, [
                createBaseVNode("button", {
                  type: "button",
                  class: "flex-1 bg-primary-container/10 text-primary font-body-lg text-body-lg py-3 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-transform",
                  disabled: payLoading.value,
                  onClick: openElectricityPay
                }, [
                  _cache[30] || (_cache[30] = createBaseVNode("span", {
                    class: "material-symbols-outlined text-[20px]",
                    style: { "font-variation-settings": "'FILL' 1" }
                  }, "account_balance_wallet", -1)),
                  createTextVNode(" " + toDisplayString(payLoading.value ? "准备中…" : "去充值"), 1)
                ], 8, _hoisted_30),
                createBaseVNode("button", {
                  class: "bg-surface-container-lowest text-primary border border-primary/20 rounded-full w-12 h-12 flex items-center justify-center active:scale-95 transition-transform shadow-sm",
                  onClick: _cache[5] || (_cache[5] = ($event) => fetchBalance({ forceNetwork: true }))
                }, [..._cache[31] || (_cache[31] = [
                  createBaseVNode("span", {
                    class: "material-symbols-outlined",
                    style: { "font-variation-settings": "'FILL' 0" }
                  }, "refresh", -1)
                ])])
              ])
            ])) : (openBlock(), createElementBlock("section", _hoisted_31, [..._cache[33] || (_cache[33] = [
              createBaseVNode("span", {
                class: "material-symbols-outlined text-outline",
                style: { "font-variation-settings": "'FILL' 0" }
              }, "ac_unit", -1),
              createBaseVNode("p", { class: "font-body-md text-body-md text-on-surface-variant" }, "空调电费查询失败", -1)
            ])]))
          ], 64)) : balanceData.value && !isDualBilling.value ? (openBlock(), createElementBlock("section", {
            key: 3,
            class: normalizeClass([
              "rounded-2xl p-5 relative overflow-hidden",
              parseFloat(balanceData.value.quantity) < 10 ? "glass-card-warning" : "glass-card-info"
            ])
          }, [
            createBaseVNode("div", _hoisted_32, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined text-9xl", parseFloat(balanceData.value.quantity) < 10 ? "text-error" : "text-primary"]),
                style: { "font-variation-settings": "'FILL' 1" }
              }, "lightbulb", 2)
            ]),
            createBaseVNode("div", _hoisted_33, [
              createBaseVNode("div", _hoisted_34, [
                createBaseVNode("div", {
                  class: normalizeClass([
                    "rounded-full p-2 flex items-center justify-center",
                    parseFloat(balanceData.value.quantity) < 10 ? "bg-error-container text-error" : "bg-primary-container/20 text-primary"
                  ])
                }, [..._cache[34] || (_cache[34] = [
                  createBaseVNode("span", {
                    class: "material-symbols-outlined text-lg",
                    style: { "font-variation-settings": "'FILL' 1" }
                  }, "lightbulb", -1)
                ])], 2),
                _cache[35] || (_cache[35] = createBaseVNode("h3", { class: "font-headline-sm text-headline-sm text-on-surface" }, "电费余额", -1))
              ]),
              createBaseVNode("div", {
                class: normalizeClass([
                  "font-label-sm text-label-sm px-2 py-1 rounded-md flex items-center gap-1",
                  parseFloat(balanceData.value.quantity) < 10 ? "bg-error/10 text-error" : "bg-success-teal/10 text-success-teal"
                ])
              }, [
                createBaseVNode("span", _hoisted_35, toDisplayString(parseFloat(balanceData.value.quantity) < 10 ? "warning" : "check_circle"), 1),
                createTextVNode(" " + toDisplayString(balanceData.value.status), 1)
              ], 2)
            ]),
            createBaseVNode("div", _hoisted_36, [
              createBaseVNode("div", null, [
                _cache[36] || (_cache[36] = createBaseVNode("p", { class: "font-label-md text-label-md text-on-surface-variant mb-1" }, "剩余电量 (度)", -1)),
                createBaseVNode("p", {
                  class: normalizeClass(["font-headline-lg text-headline-lg", parseFloat(balanceData.value.quantity) < 10 ? "text-error" : "text-primary"])
                }, toDisplayString(balanceData.value.quantity), 3)
              ]),
              createBaseVNode("div", null, [
                _cache[37] || (_cache[37] = createBaseVNode("p", { class: "font-label-md text-label-md text-on-surface-variant mb-1" }, "剩余金额 (元)", -1)),
                createBaseVNode("p", _hoisted_37, "¥ " + toDisplayString(balanceData.value.balance), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_38, [
              createBaseVNode("button", {
                type: "button",
                class: normalizeClass([
                  "flex-1 font-body-lg text-body-lg py-3 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-transform",
                  parseFloat(balanceData.value.quantity) < 10 ? "bg-primary text-on-primary shadow-md shadow-primary/20" : "bg-primary-container/10 text-primary"
                ]),
                disabled: payLoading.value,
                onClick: openElectricityPay
              }, [
                _cache[38] || (_cache[38] = createBaseVNode("span", {
                  class: "material-symbols-outlined text-[20px]",
                  style: { "font-variation-settings": "'FILL' 1" }
                }, "account_balance_wallet", -1)),
                createTextVNode(" " + toDisplayString(payLoading.value ? "准备中…" : parseFloat(balanceData.value.quantity) < 10 ? "立即充值" : "去充值"), 1)
              ], 10, _hoisted_39),
              createBaseVNode("button", {
                class: "bg-surface-container-lowest text-primary border border-primary/20 rounded-full w-12 h-12 flex items-center justify-center active:scale-95 transition-transform shadow-sm",
                onClick: _cache[6] || (_cache[6] = ($event) => fetchBalance({ forceNetwork: true }))
              }, [..._cache[39] || (_cache[39] = [
                createBaseVNode("span", {
                  class: "material-symbols-outlined",
                  style: { "font-variation-settings": "'FILL' 0" }
                }, "refresh", -1)
              ])])
            ])
          ], 2)) : errorMsg.value ? (openBlock(), createElementBlock("div", _hoisted_40, [
            _cache[40] || (_cache[40] = createBaseVNode("span", {
              class: "material-symbols-outlined text-error",
              style: { "font-variation-settings": "'FILL' 0" }
            }, "error", -1)),
            createBaseVNode("p", _hoisted_41, toDisplayString(errorMsg.value), 1)
          ])) : (openBlock(), createElementBlock("div", _hoisted_42, [..._cache[41] || (_cache[41] = [
            createBaseVNode("span", {
              class: "material-symbols-outlined text-4xl text-outline",
              style: { "font-variation-settings": "'FILL' 0" }
            }, "electric_meter", -1),
            createBaseVNode("p", { class: "font-body-md text-body-md text-on-surface-variant" }, "请先选择宿舍以查询电费", -1)
          ])])),
          createBaseVNode("section", _hoisted_43, [
            createBaseVNode("div", _hoisted_44, [
              createBaseVNode("div", null, [
                _cache[42] || (_cache[42] = createBaseVNode("h3", null, "用电趋势", -1)),
                displayRoomName.value ? (openBlock(), createElementBlock("p", _hoisted_45, toDisplayString(displayRoomName.value), 1)) : createCommentVNode("", true),
                usageSourceHint.value ? (openBlock(), createElementBlock("p", _hoisted_46, toDisplayString(usageSourceHint.value), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", _hoisted_47, [
                createBaseVNode("button", {
                  type: "button",
                  class: normalizeClass({ on: usageTab.value === "week" }),
                  onClick: _cache[7] || (_cache[7] = ($event) => switchUsageTab("week"))
                }, "日", 2),
                createBaseVNode("button", {
                  type: "button",
                  class: normalizeClass({ on: usageTab.value === "month" }),
                  onClick: _cache[8] || (_cache[8] = ($event) => switchUsageTab("month"))
                }, "月", 2)
              ])
            ]),
            usageLoading.value ? (openBlock(), createElementBlock("div", _hoisted_48, "加载智能水电…")) : usageError.value && !activePoints.value.length ? (openBlock(), createElementBlock("div", _hoisted_49, [
              createBaseVNode("span", null, toDisplayString(usageError.value), 1),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: loadUsageStats
              }, "重试")
            ])) : activePoints.value.length ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
              createBaseVNode("div", _hoisted_50, [
                createBaseVNode("div", _hoisted_51, [
                  _cache[44] || (_cache[44] = createBaseVNode("span", null, "今日", -1)),
                  createBaseVNode("strong", null, [
                    createTextVNode(toDisplayString(todayUse.value ?? "—"), 1),
                    _cache[43] || (_cache[43] = createBaseVNode("small", null, "度", -1))
                  ])
                ]),
                selectedPoint.value ? (openBlock(), createElementBlock("div", _hoisted_52, [
                  createBaseVNode("span", null, toDisplayString(selectedPoint.value.fullLabel), 1),
                  createBaseVNode("strong", null, [
                    createTextVNode(toDisplayString(selectedPoint.value.value), 1),
                    createBaseVNode("small", null, toDisplayString(selectedPoint.value.unit), 1)
                  ])
                ])) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_53, [
                  _cache[46] || (_cache[46] = createBaseVNode("span", null, "合计", -1)),
                  createBaseVNode("strong", null, [
                    createTextVNode(toDisplayString(periodSum.value.toFixed(1)), 1),
                    _cache[45] || (_cache[45] = createBaseVNode("small", null, "度", -1))
                  ])
                ])
              ]),
              createBaseVNode("div", {
                class: normalizeClass(["ibar", { ready: chartReady.value }]),
                role: "listbox",
                "aria-label": "用电柱图"
              }, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(activePoints.value, (p, i) => {
                  return openBlock(), createElementBlock("button", {
                    key: `${usageTab.value}-${p.fullLabel}-${i}`,
                    type: "button",
                    class: normalizeClass(["ibar-col", { active: selectedBarIdx.value < 0 ? i === activePoints.value.length - 1 : selectedBarIdx.value === i }]),
                    role: "option",
                    style: normalizeStyle({ "--i": i }),
                    "aria-selected": selectedBarIdx.value < 0 ? i === activePoints.value.length - 1 : selectedBarIdx.value === i,
                    onClick: ($event) => selectBar(i)
                  }, [
                    createBaseVNode("div", _hoisted_55, [
                      createBaseVNode("div", {
                        class: "ibar-fill",
                        style: normalizeStyle({
                          "--h": Math.max(10, p.value / chartMax.value * 100) + "%"
                        })
                      }, null, 4)
                    ]),
                    createBaseVNode("span", _hoisted_56, toDisplayString(p.value), 1),
                    createBaseVNode("span", _hoisted_57, toDisplayString(p.label), 1)
                  ], 14, _hoisted_54);
                }), 128))
              ], 2)
            ], 64)) : usageSnapshotOnly.value ? (openBlock(), createElementBlock("div", _hoisted_58, [
              createBaseVNode("p", _hoisted_59, toDisplayString(usageStats.value?.message || usageStats.value?.summary || "该房间暂无分日/分月用电曲线"), 1),
              usageSnapshotQuantity.value || usageSnapshotBalance.value ? (openBlock(), createElementBlock("div", _hoisted_60, [
                usageSnapshotQuantity.value ? (openBlock(), createElementBlock("div", _hoisted_61, [
                  _cache[48] || (_cache[48] = createBaseVNode("span", null, "剩余电量", -1)),
                  createBaseVNode("strong", null, [
                    createTextVNode(toDisplayString(usageSnapshotQuantity.value), 1),
                    _cache[47] || (_cache[47] = createBaseVNode("small", null, "度", -1))
                  ])
                ])) : createCommentVNode("", true),
                usageSnapshotBalance.value ? (openBlock(), createElementBlock("div", _hoisted_62, [
                  _cache[50] || (_cache[50] = createBaseVNode("span", null, "余额", -1)),
                  createBaseVNode("strong", null, [
                    createTextVNode(toDisplayString(usageSnapshotBalance.value), 1),
                    _cache[49] || (_cache[49] = createBaseVNode("small", null, "元", -1))
                  ])
                ])) : createCommentVNode("", true)
              ])) : createCommentVNode("", true),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: loadUsageStats
              }, "重新拉取趋势")
            ])) : (openBlock(), createElementBlock("div", _hoisted_63, toDisplayString(usageEmptyText.value), 1))
          ]),
          createBaseVNode("section", _hoisted_64, [
            createBaseVNode("div", _hoisted_65, [
              createBaseVNode("button", {
                type: "button",
                class: "pay-main",
                disabled: payLoading.value,
                onClick: openElectricityPay
              }, [
                _cache[51] || (_cache[51] = createBaseVNode("span", { class: "material-symbols-outlined" }, "bolt", -1)),
                createTextVNode(" " + toDisplayString(payLoading.value ? "打开中…" : "缴电费"), 1)
              ], 8, _hoisted_66),
              createBaseVNode("button", {
                type: "button",
                class: "pay-side",
                disabled: payLoading.value,
                "aria-pressed": showPayQr.value,
                onClick: togglePayQr
              }, [..._cache[52] || (_cache[52] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "qr_code_2", -1)
              ])], 8, _hoisted_67)
            ]),
            showPayQr.value && payQr.value ? (openBlock(), createElementBlock("div", _hoisted_68, [
              createBaseVNode("img", {
                src: payQr.value,
                alt: "缴电费",
                width: "180",
                height: "180"
              }, null, 8, _hoisted_69)
            ])) : createCommentVNode("", true)
          ])
        ])
      ]);
    };
  }
};
const ElectricityView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-6e49eecf"]]);
export {
  ElectricityView as default
};
