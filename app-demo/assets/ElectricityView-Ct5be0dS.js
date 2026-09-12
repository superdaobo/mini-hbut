import { _ as _export_sfc, m as useI18n, t, f as fetchWithCache, d as axiosInstance, w as writeElectricityToWidget, p as tf, s as setCachedData, j as showToast, o as openExternal, q as useAppSettings } from "./app-demo-CUOWTnz-.js";
import { q as qrToDataURL } from "./qrcode-DqJHidZ9.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { f as fetchDormitoryDataset } from "./static_resource_cache-BR2tzHfN.js";
import { a as isTauriRuntime, d as invokeNative } from "./runtime-bridge-Dt57BD2i.js";
import { p as prepareOneCodeAppOpen } from "./one_code_open-DolWkQwu.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { o as onMounted, h as computed, v as watch, C as nextTick, M as resolveComponent, a as openBlock, c as createElementBlock, p as createVNode, u as unref, b as createBaseVNode, t as toDisplayString, d as createCommentVNode, g as createTextVNode, k as withCtx, F as Fragment, f as renderList, n as normalizeClass, e as normalizeStyle, r as ref } from "./vue-core-Dzs4fLAU.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
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
function matchLightLevelLabel(label) {
  const m = String(label ?? "").match(/^照明(\d+)层$/);
  return m ? m[1] : null;
}
function matchAcLevelLabel(label) {
  const m = String(label ?? "").match(/^空调(\d+)层$/);
  return m ? m[1] : null;
}
function stripRoomSuffix(label) {
  return String(label ?? "").replace(/房间$/, "");
}
function containsMisleadingRoomHint(message) {
  return /请先选择宿舍/.test(String(message ?? ""));
}
const _hoisted_1 = { class: "electricity-page text-on-surface min-h-screen flex flex-col font-body-md max-w-[448px] mx-auto relative overflow-x-hidden" };
const _hoisted_2 = { class: "flex-1 px-container-padding pb-[100px] flex flex-col gap-5 mt-4" };
const _hoisted_3 = {
  key: 0,
  class: "bg-surface-container-high rounded-lg p-3 flex items-start gap-3"
};
const _hoisted_4 = { class: "font-body-md text-on-surface-variant text-body-md" };
const _hoisted_5 = { class: "font-label-md text-outline text-label-md mt-1" };
const _hoisted_6 = { class: "glass-card rounded-2xl p-5" };
const _hoisted_7 = { class: "font-headline-sm text-headline-sm text-on-surface mb-4 flex items-center gap-2" };
const _hoisted_8 = { class: "grid grid-cols-2 gap-3" };
const _hoisted_9 = { class: "relative" };
const _hoisted_10 = { class: "block font-label-sm text-label-sm text-outline mb-1 pl-1" };
const _hoisted_11 = {
  value: "",
  disabled: ""
};
const _hoisted_12 = ["value"];
const _hoisted_13 = { class: "relative" };
const _hoisted_14 = { class: "block font-label-sm text-label-sm text-outline mb-1 pl-1" };
const _hoisted_15 = {
  value: "",
  disabled: ""
};
const _hoisted_16 = ["value"];
const _hoisted_17 = { class: "relative" };
const _hoisted_18 = { class: "block font-label-sm text-label-sm text-outline mb-1 pl-1" };
const _hoisted_19 = {
  value: "",
  disabled: ""
};
const _hoisted_20 = ["value"];
const _hoisted_21 = { class: "relative" };
const _hoisted_22 = { class: "block font-label-sm text-label-sm text-outline mb-1 pl-1" };
const _hoisted_23 = {
  value: "",
  disabled: ""
};
const _hoisted_24 = ["value"];
const _hoisted_25 = {
  key: 1,
  class: "glass-card rounded-2xl p-8 flex flex-col items-center justify-center gap-3"
};
const _hoisted_26 = { class: "font-body-md text-body-md text-on-surface-variant" };
const _hoisted_27 = { class: "absolute -right-4 -top-4 opacity-[0.15]" };
const _hoisted_28 = { class: "flex justify-between items-start mb-4 relative z-10" };
const _hoisted_29 = { class: "flex items-center gap-2" };
const _hoisted_30 = { class: "font-headline-sm text-headline-sm text-on-surface" };
const _hoisted_31 = {
  class: "material-symbols-outlined text-[14px]",
  style: { "font-variation-settings": "'FILL' 1" }
};
const _hoisted_32 = { class: "grid grid-cols-2 gap-4 relative z-10" };
const _hoisted_33 = { class: "font-label-md text-label-md text-on-surface-variant mb-1" };
const _hoisted_34 = { class: "font-label-md text-label-md text-on-surface-variant mb-1" };
const _hoisted_35 = { class: "font-headline-md text-headline-md text-on-surface mt-1" };
const _hoisted_36 = { class: "mt-5 flex gap-3 relative z-10" };
const _hoisted_37 = ["disabled"];
const _hoisted_38 = {
  key: 0,
  class: "glass-card-info rounded-2xl p-5 relative overflow-hidden"
};
const _hoisted_39 = { class: "flex justify-between items-start mb-4 relative z-10" };
const _hoisted_40 = { class: "flex items-center gap-2" };
const _hoisted_41 = { class: "font-headline-sm text-headline-sm text-on-surface" };
const _hoisted_42 = {
  class: "material-symbols-outlined text-[14px]",
  style: { "font-variation-settings": "'FILL' 1" }
};
const _hoisted_43 = { class: "grid grid-cols-2 gap-4 relative z-10" };
const _hoisted_44 = { class: "font-label-md text-label-md text-on-surface-variant mb-1" };
const _hoisted_45 = { class: "font-label-md text-label-md text-on-surface-variant mb-1" };
const _hoisted_46 = { class: "font-headline-md text-headline-md text-on-surface mt-1" };
const _hoisted_47 = { class: "mt-5 flex gap-3 relative z-10" };
const _hoisted_48 = ["disabled"];
const _hoisted_49 = {
  key: 1,
  class: "glass-card rounded-2xl p-5 flex items-center gap-3"
};
const _hoisted_50 = { class: "font-body-md text-body-md text-on-surface-variant" };
const _hoisted_51 = { class: "absolute -right-4 -top-4 opacity-[0.15]" };
const _hoisted_52 = { class: "flex justify-between items-start mb-4 relative z-10" };
const _hoisted_53 = { class: "flex items-center gap-2" };
const _hoisted_54 = { class: "font-headline-sm text-headline-sm text-on-surface" };
const _hoisted_55 = {
  class: "material-symbols-outlined text-[14px]",
  style: { "font-variation-settings": "'FILL' 1" }
};
const _hoisted_56 = { class: "grid grid-cols-2 gap-4 relative z-10" };
const _hoisted_57 = { class: "font-label-md text-label-md text-on-surface-variant mb-1" };
const _hoisted_58 = { class: "font-label-md text-label-md text-on-surface-variant mb-1" };
const _hoisted_59 = { class: "font-headline-md text-headline-md text-on-surface mt-1" };
const _hoisted_60 = { class: "mt-5 flex gap-3 relative z-10" };
const _hoisted_61 = ["disabled"];
const _hoisted_62 = {
  key: 4,
  class: "glass-card-warning rounded-2xl p-5 flex items-center gap-3"
};
const _hoisted_63 = { class: "font-body-md text-body-md text-error" };
const _hoisted_64 = {
  key: 5,
  class: "glass-card rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center"
};
const _hoisted_65 = { class: "font-body-md text-body-md text-on-surface-variant" };
const _hoisted_66 = { class: "util-card usage-card" };
const _hoisted_67 = { class: "util-card-head" };
const _hoisted_68 = {
  key: 0,
  class: "bound-tag"
};
const _hoisted_69 = {
  key: 1,
  class: "bound-tag soft"
};
const _hoisted_70 = { class: "seg" };
const _hoisted_71 = {
  key: 0,
  class: "util-muted pulse"
};
const _hoisted_72 = {
  key: 1,
  class: "util-err-row"
};
const _hoisted_73 = { class: "kpi-row" };
const _hoisted_74 = { class: "kpi pop" };
const _hoisted_75 = {
  key: 0,
  class: "kpi focus pop"
};
const _hoisted_76 = { class: "kpi pop" };
const _hoisted_77 = ["aria-label"];
const _hoisted_78 = ["aria-selected", "onClick"];
const _hoisted_79 = { class: "ibar-track" };
const _hoisted_80 = { class: "ibar-val" };
const _hoisted_81 = { class: "ibar-lab" };
const _hoisted_82 = {
  key: 3,
  class: "usage-snapshot"
};
const _hoisted_83 = { class: "util-muted" };
const _hoisted_84 = {
  key: 0,
  class: "kpi-row snapshot-kpi"
};
const _hoisted_85 = {
  key: 0,
  class: "kpi pop"
};
const _hoisted_86 = {
  key: 1,
  class: "kpi pop"
};
const _hoisted_87 = {
  key: 4,
  class: "util-muted"
};
const _hoisted_88 = { class: "util-card pay-card" };
const _hoisted_89 = { class: "pay-actions" };
const _hoisted_90 = ["disabled"];
const _hoisted_91 = ["disabled", "aria-pressed"];
const _hoisted_92 = {
  key: 0,
  class: "pay-qr"
};
const _hoisted_93 = ["src", "alt"];
const _hoisted_94 = { class: "pay-demo-hint" };
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
    const { t: tLocale } = useI18n();
    const tfOfflineLastUpdate = computed(
      () => tf("electricity.offlineBanner.lastUpdate", { time: formatRelativeTime(syncTime.value) })
    );
    const tfPayDemoHint = computed(
      () => tf("electricity.pay.demoHint", { app: t("electricity.iHubut.name") })
    );
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
            const lightFloor = matchLightLevelLabel(label);
            const acFloor = matchAcLevelLabel(label);
            if (lightFloor) {
              lightLevels[lightFloor] = level;
            } else if (acFloor) {
              acLevels[acFloor] = level;
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
                const num = stripRoomSuffix(r.label);
                acByNum[num] = r.value;
              });
              (lightLevel.children || []).forEach((r) => {
                const lightNum = stripRoomSuffix(r.label);
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
              // 楼层标签按当前语言拼装（t 非响应式，但 mergeLevels 每次加载宿舍数据时重跑）
              label: tf("electricity.unit.floorN", { n: floorNum }),
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
        console.error("[Electricity] failed to load dormitory dataset:", e);
        errorMsg.value = t("electricity.error.loadDorm");
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
            errorMsg.value = lightResult.data?.error || t("electricity.error.queryFailed");
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
        console.error("[Electricity] balance query failed:", e);
        if (e.response && (e.response.status === 502 || e.response.status === 504) || e.message.includes("Network Error")) {
          if (retryCount < maxRetry.value) {
            errorMsg.value = tf("electricity.error.retrying", { n: retryCount + 1, max: maxRetry.value });
            setTimeout(() => {
              fetchBalance({ retryCount: retryCount + 1, forceNetwork });
            }, retryDelayMs.value);
            return;
          } else {
            errorMsg.value = t("electricity.error.serverTimeout");
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
            errorMsg.value = e.message || t("electricity.error.network");
            balanceData.value = null;
          }
        }
      } finally {
        if (!String(errorMsg.value || "").includes(t("electricity.error.retrying").split("{")[0])) {
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
    const comparePointLabel = (a, b) => {
      const extract = (p) => String(p?.label || p?.date || p?.fullLabel || "").match(/\d+/g)?.map(Number) ?? [];
      const na = extract(a);
      const nb = extract(b);
      const len = Math.max(na.length, nb.length);
      for (let i = 0; i < len; i += 1) {
        const va = na[i] ?? -1;
        const vb = nb[i] ?? -1;
        if (va !== vb) return va - vb;
      }
      return 0;
    };
    const mapPoints = (pts, short = true) => {
      if (!Array.isArray(pts)) return [];
      return [...pts].sort(comparePointLabel).map((p) => {
        const full = String(p?.label || p?.date || p?.fullLabel || "—");
        const label = short ? full.replace(/^\d{4}-?/, "").slice(0, 5) || full : full;
        return {
          label,
          fullLabel: full,
          value: Number(p?.value ?? p?.dayuse ?? 0) || 0,
          // 缺省单位按当前语言兜底（后端有 unit 时用后端值）
          unit: p?.unit || t("electricity.usage.kwh")
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
    const ibarRef = ref(null);
    watch([activePoints, chartReady], () => {
      nextTick(() => {
        const el = ibarRef.value;
        if (el) el.scrollLeft = el.scrollWidth;
      });
    });
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
      if (src === "selected") return tLocale("electricity.usage.sourceSelected");
      if (src === "bound") return tLocale("electricity.usage.sourceBound");
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
        const res = await prepareOneCodeAppOpen({ appCode: "electric", appName: t("electricity.oneCode.appName") });
        if (res.openUrl) {
          await openExternal(res.openUrl);
          try {
            payQr.value = await qrToDataURL(res.openUrl, { width: 180 });
          } catch {
            payQr.value = "";
          }
        }
      } catch (e) {
        showToast(String(e?.message || e || t("electricity.pay.openFailed")));
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
        const res = await prepareOneCodeAppOpen({ appCode: "electric", appName: t("electricity.oneCode.appName") });
        payQr.value = await qrToDataURL(res.openUrl, { width: 180 });
        showPayQr.value = true;
      } catch (e) {
        showToast(String(e?.message || e || t("electricity.pay.qrFailed")));
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
          const raw = String(res?.message || t("electricity.usage.errorNoData"));
          usageError.value = hasSelectedRoom.value && containsMisleadingRoomHint(raw) ? t("electricity.usage.errorNoTrend") : raw;
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
        usageError.value = String(e?.message || e || t("electricity.usage.loadFailed"));
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
          title: unref(tLocale)("electricity.title"),
          onBack: handleBack
        }, null, 8, ["title"]),
        createBaseVNode("main", _hoisted_2, [
          offline.value ? (openBlock(), createElementBlock("div", _hoisted_3, [
            _cache[9] || (_cache[9] = createBaseVNode("span", {
              class: "material-symbols-outlined text-secondary mt-0.5",
              style: { "font-variation-settings": "'FILL' 0" }
            }, "cloud_off", -1)),
            createBaseVNode("div", null, [
              createBaseVNode("p", _hoisted_4, toDisplayString(unref(tLocale)("electricity.offlineBanner.text")), 1),
              createBaseVNode("p", _hoisted_5, toDisplayString(tfOfflineLastUpdate.value), 1)
            ])
          ])) : createCommentVNode("", true),
          createBaseVNode("section", _hoisted_6, [
            createBaseVNode("h2", _hoisted_7, [
              _cache[10] || (_cache[10] = createBaseVNode("span", {
                class: "material-symbols-outlined text-primary",
                style: { "font-variation-settings": "'FILL' 0" }
              }, "apartment", -1)),
              createTextVNode(" " + toDisplayString(unref(tLocale)("electricity.selector.title")), 1)
            ]),
            createBaseVNode("div", _hoisted_8, [
              createBaseVNode("div", _hoisted_9, [
                createBaseVNode("label", _hoisted_10, toDisplayString(unref(tLocale)("electricity.selector.area")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: selectedAreaValue.value,
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selectedAreaValue.value = $event),
                  placeholder: unref(tLocale)("electricity.selector.placeholder.area"),
                  class: "w-full bg-surface-container-low rounded-xl text-sm"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("option", _hoisted_11, toDisplayString(unref(tLocale)("electricity.selector.placeholder.area")), 1),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(dormData.value, (area) => {
                      return openBlock(), createElementBlock("option", {
                        key: area.value,
                        value: area.value
                      }, toDisplayString(area.label), 9, _hoisted_12);
                    }), 128))
                  ]),
                  _: 1
                }, 8, ["modelValue", "placeholder"])
              ]),
              createBaseVNode("div", _hoisted_13, [
                createBaseVNode("label", _hoisted_14, toDisplayString(unref(tLocale)("electricity.selector.building")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: selectedBuildingValue.value,
                  "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => selectedBuildingValue.value = $event),
                  disabled: !selectedPath.value[0],
                  placeholder: unref(tLocale)("electricity.selector.placeholder.building"),
                  class: "w-full bg-surface-container-low rounded-xl text-sm"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("option", _hoisted_15, toDisplayString(unref(tLocale)("electricity.selector.placeholder.building")), 1),
                    currentArea.value ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(currentArea.value.children, (b) => {
                      return openBlock(), createElementBlock("option", {
                        key: b.value,
                        value: b.value
                      }, toDisplayString(b.label), 9, _hoisted_16);
                    }), 128)) : createCommentVNode("", true)
                  ]),
                  _: 1
                }, 8, ["modelValue", "disabled", "placeholder"])
              ]),
              createBaseVNode("div", _hoisted_17, [
                createBaseVNode("label", _hoisted_18, toDisplayString(unref(tLocale)("electricity.selector.level")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: selectedLevelValue.value,
                  "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => selectedLevelValue.value = $event),
                  disabled: !selectedPath.value[1],
                  placeholder: unref(tLocale)("electricity.selector.placeholder.level"),
                  class: "w-full bg-surface-container-low rounded-xl text-sm"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("option", _hoisted_19, toDisplayString(unref(tLocale)("electricity.selector.placeholder.level")), 1),
                    currentBuilding.value ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(currentBuilding.value.children, (l) => {
                      return openBlock(), createElementBlock("option", {
                        key: l.value,
                        value: l.value
                      }, toDisplayString(l.label), 9, _hoisted_20);
                    }), 128)) : createCommentVNode("", true)
                  ]),
                  _: 1
                }, 8, ["modelValue", "disabled", "placeholder"])
              ]),
              createBaseVNode("div", _hoisted_21, [
                createBaseVNode("label", _hoisted_22, toDisplayString(unref(tLocale)("electricity.selector.room")), 1),
                createVNode(_component_IOSSelect, {
                  modelValue: selectedRoomValue.value,
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => selectedRoomValue.value = $event),
                  disabled: !selectedPath.value[2],
                  placeholder: unref(tLocale)("electricity.selector.placeholder.room"),
                  class: "w-full bg-surface-container-low rounded-xl text-sm"
                }, {
                  default: withCtx(() => [
                    createBaseVNode("option", _hoisted_23, toDisplayString(unref(tLocale)("electricity.selector.placeholder.room")), 1),
                    currentLevel.value ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(currentLevel.value.children, (r) => {
                      return openBlock(), createElementBlock("option", {
                        key: r.value,
                        value: r.value
                      }, toDisplayString(r.label), 9, _hoisted_24);
                    }), 128)) : createCommentVNode("", true)
                  ]),
                  _: 1
                }, 8, ["modelValue", "disabled", "placeholder"])
              ])
            ])
          ]),
          loading.value ? (openBlock(), createElementBlock("div", _hoisted_25, [
            _cache[11] || (_cache[11] = createBaseVNode("div", { class: "animate-spin" }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined text-primary text-3xl",
                style: { "font-variation-settings": "'FILL' 0" }
              }, "progress_activity")
            ], -1)),
            createBaseVNode("p", _hoisted_26, toDisplayString(unref(tLocale)("electricity.loading")), 1)
          ])) : balanceData.value && isDualBilling.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            createBaseVNode("section", {
              class: normalizeClass([
                "rounded-2xl p-5 relative overflow-hidden",
                parseFloat(balanceData.value.quantity) < 10 ? "glass-card-warning" : "glass-card-info"
              ])
            }, [
              createBaseVNode("div", _hoisted_27, [
                createBaseVNode("span", {
                  class: normalizeClass(["material-symbols-outlined text-9xl", parseFloat(balanceData.value.quantity) < 10 ? "text-error" : "text-primary"]),
                  style: { "font-variation-settings": "'FILL' 1" }
                }, "lightbulb", 2)
              ]),
              createBaseVNode("div", _hoisted_28, [
                createBaseVNode("div", _hoisted_29, [
                  createBaseVNode("div", {
                    class: normalizeClass([
                      "rounded-full p-2 flex items-center justify-center",
                      parseFloat(balanceData.value.quantity) < 10 ? "bg-error-container text-error" : "bg-primary-container/20 text-primary"
                    ])
                  }, [..._cache[12] || (_cache[12] = [
                    createBaseVNode("span", {
                      class: "material-symbols-outlined text-lg",
                      style: { "font-variation-settings": "'FILL' 1" }
                    }, "lightbulb", -1)
                  ])], 2),
                  createBaseVNode("h3", _hoisted_30, toDisplayString(unref(tLocale)("electricity.card.lighting")), 1)
                ]),
                createBaseVNode("div", {
                  class: normalizeClass([
                    "font-label-sm text-label-sm px-2 py-1 rounded-md flex items-center gap-1",
                    parseFloat(balanceData.value.quantity) < 10 ? "bg-error/10 text-error" : "bg-success-teal/10 text-success-teal"
                  ])
                }, [
                  createBaseVNode("span", _hoisted_31, toDisplayString(parseFloat(balanceData.value.quantity) < 10 ? "warning" : "check_circle"), 1),
                  createTextVNode(" " + toDisplayString(parseFloat(balanceData.value.quantity) < 10 ? unref(tLocale)("electricity.status.low") : unref(tLocale)("electricity.status.normal")), 1)
                ], 2)
              ]),
              createBaseVNode("div", _hoisted_32, [
                createBaseVNode("div", null, [
                  createBaseVNode("p", _hoisted_33, toDisplayString(unref(tLocale)("electricity.remainingKwh")), 1),
                  createBaseVNode("p", {
                    class: normalizeClass(["font-headline-lg text-headline-lg", parseFloat(balanceData.value.quantity) < 10 ? "text-error" : "text-primary"])
                  }, toDisplayString(balanceData.value.quantity), 3)
                ]),
                createBaseVNode("div", null, [
                  createBaseVNode("p", _hoisted_34, toDisplayString(unref(tLocale)("electricity.remainingYuan")), 1),
                  createBaseVNode("p", _hoisted_35, "¥ " + toDisplayString(balanceData.value.balance), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_36, [
                createBaseVNode("button", {
                  type: "button",
                  class: normalizeClass([
                    "flex-1 font-body-lg text-body-lg py-3 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-transform",
                    parseFloat(balanceData.value.quantity) < 10 ? "bg-primary text-on-primary shadow-md shadow-primary/20" : "bg-primary-container/10 text-primary"
                  ]),
                  disabled: payLoading.value,
                  onClick: openElectricityPay
                }, [
                  _cache[13] || (_cache[13] = createBaseVNode("span", {
                    class: "material-symbols-outlined text-[20px]",
                    style: { "font-variation-settings": "'FILL' 1" }
                  }, "account_balance_wallet", -1)),
                  createTextVNode(" " + toDisplayString(payLoading.value ? unref(tLocale)("electricity.pay.preparing") : parseFloat(balanceData.value.quantity) < 10 ? unref(tLocale)("electricity.pay.rechargeNow") : unref(tLocale)("electricity.pay.recharge")), 1)
                ], 10, _hoisted_37),
                createBaseVNode("button", {
                  class: "bg-surface-container-lowest text-primary border border-primary/20 rounded-full w-12 h-12 flex items-center justify-center active:scale-95 transition-transform shadow-sm",
                  onClick: _cache[4] || (_cache[4] = ($event) => fetchBalance({ forceNetwork: true }))
                }, [..._cache[14] || (_cache[14] = [
                  createBaseVNode("span", {
                    class: "material-symbols-outlined",
                    style: { "font-variation-settings": "'FILL' 0" }
                  }, "refresh", -1)
                ])])
              ])
            ], 2),
            acBalanceData.value ? (openBlock(), createElementBlock("section", _hoisted_38, [
              _cache[18] || (_cache[18] = createBaseVNode("div", { class: "absolute -right-4 -top-4 opacity-[0.12]" }, [
                createBaseVNode("span", {
                  class: "material-symbols-outlined text-9xl text-info-sky",
                  style: { "font-variation-settings": "'FILL' 1" }
                }, "ac_unit")
              ], -1)),
              createBaseVNode("div", _hoisted_39, [
                createBaseVNode("div", _hoisted_40, [
                  _cache[15] || (_cache[15] = createBaseVNode("div", { class: "bg-primary-container/20 text-primary rounded-full p-2 flex items-center justify-center" }, [
                    createBaseVNode("span", {
                      class: "material-symbols-outlined text-lg",
                      style: { "font-variation-settings": "'FILL' 1" }
                    }, "ac_unit")
                  ], -1)),
                  createBaseVNode("h3", _hoisted_41, toDisplayString(unref(tLocale)("electricity.card.ac")), 1)
                ]),
                createBaseVNode("div", {
                  class: normalizeClass([
                    "font-label-sm text-label-sm px-2 py-1 rounded-md flex items-center gap-1",
                    parseFloat(acBalanceData.value.quantity) < 10 ? "bg-error/10 text-error" : "bg-success-teal/10 text-success-teal"
                  ])
                }, [
                  createBaseVNode("span", _hoisted_42, toDisplayString(parseFloat(acBalanceData.value.quantity) < 10 ? "warning" : "check_circle"), 1),
                  createTextVNode(" " + toDisplayString(parseFloat(acBalanceData.value.quantity) < 10 ? unref(tLocale)("electricity.status.low") : unref(tLocale)("electricity.status.normal")), 1)
                ], 2)
              ]),
              createBaseVNode("div", _hoisted_43, [
                createBaseVNode("div", null, [
                  createBaseVNode("p", _hoisted_44, toDisplayString(unref(tLocale)("electricity.remainingKwh")), 1),
                  createBaseVNode("p", {
                    class: normalizeClass(["font-headline-lg text-headline-lg", parseFloat(acBalanceData.value.quantity) < 10 ? "text-error" : "text-primary"])
                  }, toDisplayString(acBalanceData.value.quantity), 3)
                ]),
                createBaseVNode("div", null, [
                  createBaseVNode("p", _hoisted_45, toDisplayString(unref(tLocale)("electricity.remainingYuan")), 1),
                  createBaseVNode("p", _hoisted_46, "¥ " + toDisplayString(acBalanceData.value.balance), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_47, [
                createBaseVNode("button", {
                  type: "button",
                  class: "flex-1 bg-primary-container/10 text-primary font-body-lg text-body-lg py-3 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-transform",
                  disabled: payLoading.value,
                  onClick: openElectricityPay
                }, [
                  _cache[16] || (_cache[16] = createBaseVNode("span", {
                    class: "material-symbols-outlined text-[20px]",
                    style: { "font-variation-settings": "'FILL' 1" }
                  }, "account_balance_wallet", -1)),
                  createTextVNode(" " + toDisplayString(payLoading.value ? unref(tLocale)("electricity.pay.preparing") : unref(tLocale)("electricity.pay.recharge")), 1)
                ], 8, _hoisted_48),
                createBaseVNode("button", {
                  class: "bg-surface-container-lowest text-primary border border-primary/20 rounded-full w-12 h-12 flex items-center justify-center active:scale-95 transition-transform shadow-sm",
                  onClick: _cache[5] || (_cache[5] = ($event) => fetchBalance({ forceNetwork: true }))
                }, [..._cache[17] || (_cache[17] = [
                  createBaseVNode("span", {
                    class: "material-symbols-outlined",
                    style: { "font-variation-settings": "'FILL' 0" }
                  }, "refresh", -1)
                ])])
              ])
            ])) : (openBlock(), createElementBlock("section", _hoisted_49, [
              _cache[19] || (_cache[19] = createBaseVNode("span", {
                class: "material-symbols-outlined text-outline",
                style: { "font-variation-settings": "'FILL' 0" }
              }, "ac_unit", -1)),
              createBaseVNode("p", _hoisted_50, toDisplayString(unref(tLocale)("electricity.acQueryFailed")), 1)
            ]))
          ], 64)) : balanceData.value && !isDualBilling.value ? (openBlock(), createElementBlock("section", {
            key: 3,
            class: normalizeClass([
              "rounded-2xl p-5 relative overflow-hidden",
              parseFloat(balanceData.value.quantity) < 10 ? "glass-card-warning" : "glass-card-info"
            ])
          }, [
            createBaseVNode("div", _hoisted_51, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined text-9xl", parseFloat(balanceData.value.quantity) < 10 ? "text-error" : "text-primary"]),
                style: { "font-variation-settings": "'FILL' 1" }
              }, "lightbulb", 2)
            ]),
            createBaseVNode("div", _hoisted_52, [
              createBaseVNode("div", _hoisted_53, [
                createBaseVNode("div", {
                  class: normalizeClass([
                    "rounded-full p-2 flex items-center justify-center",
                    parseFloat(balanceData.value.quantity) < 10 ? "bg-error-container text-error" : "bg-primary-container/20 text-primary"
                  ])
                }, [..._cache[20] || (_cache[20] = [
                  createBaseVNode("span", {
                    class: "material-symbols-outlined text-lg",
                    style: { "font-variation-settings": "'FILL' 1" }
                  }, "lightbulb", -1)
                ])], 2),
                createBaseVNode("h3", _hoisted_54, toDisplayString(unref(tLocale)("electricity.card.balance")), 1)
              ]),
              createBaseVNode("div", {
                class: normalizeClass([
                  "font-label-sm text-label-sm px-2 py-1 rounded-md flex items-center gap-1",
                  parseFloat(balanceData.value.quantity) < 10 ? "bg-error/10 text-error" : "bg-success-teal/10 text-success-teal"
                ])
              }, [
                createBaseVNode("span", _hoisted_55, toDisplayString(parseFloat(balanceData.value.quantity) < 10 ? "warning" : "check_circle"), 1),
                createTextVNode(" " + toDisplayString(balanceData.value.status), 1)
              ], 2)
            ]),
            createBaseVNode("div", _hoisted_56, [
              createBaseVNode("div", null, [
                createBaseVNode("p", _hoisted_57, toDisplayString(unref(tLocale)("electricity.remainingKwh")), 1),
                createBaseVNode("p", {
                  class: normalizeClass(["font-headline-lg text-headline-lg", parseFloat(balanceData.value.quantity) < 10 ? "text-error" : "text-primary"])
                }, toDisplayString(balanceData.value.quantity), 3)
              ]),
              createBaseVNode("div", null, [
                createBaseVNode("p", _hoisted_58, toDisplayString(unref(tLocale)("electricity.remainingYuan")), 1),
                createBaseVNode("p", _hoisted_59, "¥ " + toDisplayString(balanceData.value.balance), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_60, [
              createBaseVNode("button", {
                type: "button",
                class: normalizeClass([
                  "flex-1 font-body-lg text-body-lg py-3 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-transform",
                  parseFloat(balanceData.value.quantity) < 10 ? "bg-primary text-on-primary shadow-md shadow-primary/20" : "bg-primary-container/10 text-primary"
                ]),
                disabled: payLoading.value,
                onClick: openElectricityPay
              }, [
                _cache[21] || (_cache[21] = createBaseVNode("span", {
                  class: "material-symbols-outlined text-[20px]",
                  style: { "font-variation-settings": "'FILL' 1" }
                }, "account_balance_wallet", -1)),
                createTextVNode(" " + toDisplayString(payLoading.value ? unref(tLocale)("electricity.pay.preparing") : parseFloat(balanceData.value.quantity) < 10 ? unref(tLocale)("electricity.pay.rechargeNow") : unref(tLocale)("electricity.pay.recharge")), 1)
              ], 10, _hoisted_61),
              createBaseVNode("button", {
                class: "bg-surface-container-lowest text-primary border border-primary/20 rounded-full w-12 h-12 flex items-center justify-center active:scale-95 transition-transform shadow-sm",
                onClick: _cache[6] || (_cache[6] = ($event) => fetchBalance({ forceNetwork: true }))
              }, [..._cache[22] || (_cache[22] = [
                createBaseVNode("span", {
                  class: "material-symbols-outlined",
                  style: { "font-variation-settings": "'FILL' 0" }
                }, "refresh", -1)
              ])])
            ])
          ], 2)) : errorMsg.value ? (openBlock(), createElementBlock("div", _hoisted_62, [
            _cache[23] || (_cache[23] = createBaseVNode("span", {
              class: "material-symbols-outlined text-error",
              style: { "font-variation-settings": "'FILL' 0" }
            }, "error", -1)),
            createBaseVNode("p", _hoisted_63, toDisplayString(errorMsg.value), 1)
          ])) : (openBlock(), createElementBlock("div", _hoisted_64, [
            _cache[24] || (_cache[24] = createBaseVNode("span", {
              class: "material-symbols-outlined text-4xl text-outline",
              style: { "font-variation-settings": "'FILL' 0" }
            }, "electric_meter", -1)),
            createBaseVNode("p", _hoisted_65, toDisplayString(unref(tLocale)("electricity.empty")), 1)
          ])),
          createBaseVNode("section", _hoisted_66, [
            createBaseVNode("div", _hoisted_67, [
              createBaseVNode("div", null, [
                createBaseVNode("h3", null, toDisplayString(unref(tLocale)("electricity.usage.title")), 1),
                displayRoomName.value ? (openBlock(), createElementBlock("p", _hoisted_68, toDisplayString(displayRoomName.value), 1)) : createCommentVNode("", true),
                usageSourceHint.value ? (openBlock(), createElementBlock("p", _hoisted_69, toDisplayString(usageSourceHint.value), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", _hoisted_70, [
                createBaseVNode("button", {
                  type: "button",
                  class: normalizeClass({ on: usageTab.value === "week" }),
                  onClick: _cache[7] || (_cache[7] = ($event) => switchUsageTab("week"))
                }, toDisplayString(unref(tLocale)("electricity.usage.tabDay")), 3),
                createBaseVNode("button", {
                  type: "button",
                  class: normalizeClass({ on: usageTab.value === "month" }),
                  onClick: _cache[8] || (_cache[8] = ($event) => switchUsageTab("month"))
                }, toDisplayString(unref(tLocale)("electricity.usage.tabMonth")), 3)
              ])
            ]),
            usageLoading.value ? (openBlock(), createElementBlock("div", _hoisted_71, toDisplayString(unref(tLocale)("electricity.usage.loadingSmart")), 1)) : usageError.value && !activePoints.value.length ? (openBlock(), createElementBlock("div", _hoisted_72, [
              createBaseVNode("span", null, toDisplayString(usageError.value), 1),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: loadUsageStats
              }, toDisplayString(unref(tLocale)("electricity.usage.retry")), 1)
            ])) : activePoints.value.length ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
              createBaseVNode("div", _hoisted_73, [
                createBaseVNode("div", _hoisted_74, [
                  createBaseVNode("span", null, toDisplayString(unref(tLocale)("electricity.usage.today")), 1),
                  createBaseVNode("strong", null, [
                    createTextVNode(toDisplayString(todayUse.value ?? "—"), 1),
                    createBaseVNode("small", null, toDisplayString(unref(tLocale)("electricity.usage.kwh")), 1)
                  ])
                ]),
                selectedPoint.value ? (openBlock(), createElementBlock("div", _hoisted_75, [
                  createBaseVNode("span", null, toDisplayString(selectedPoint.value.fullLabel), 1),
                  createBaseVNode("strong", null, [
                    createTextVNode(toDisplayString(selectedPoint.value.value), 1),
                    createBaseVNode("small", null, toDisplayString(selectedPoint.value.unit), 1)
                  ])
                ])) : createCommentVNode("", true),
                createBaseVNode("div", _hoisted_76, [
                  createBaseVNode("span", null, toDisplayString(unref(tLocale)("electricity.usage.total")), 1),
                  createBaseVNode("strong", null, [
                    createTextVNode(toDisplayString(periodSum.value.toFixed(1)), 1),
                    createBaseVNode("small", null, toDisplayString(unref(tLocale)("electricity.usage.kwh")), 1)
                  ])
                ])
              ]),
              createBaseVNode("div", {
                class: normalizeClass(["ibar", { ready: chartReady.value }]),
                role: "listbox",
                "aria-label": unref(tLocale)("electricity.usage.chartAria"),
                ref_key: "ibarRef",
                ref: ibarRef
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
                    createBaseVNode("div", _hoisted_79, [
                      createBaseVNode("div", {
                        class: "ibar-fill",
                        style: normalizeStyle({
                          "--h": Math.max(10, p.value / chartMax.value * 100) + "%"
                        })
                      }, null, 4)
                    ]),
                    createBaseVNode("span", _hoisted_80, toDisplayString(p.value), 1),
                    createBaseVNode("span", _hoisted_81, toDisplayString(p.label), 1)
                  ], 14, _hoisted_78);
                }), 128))
              ], 10, _hoisted_77)
            ], 64)) : usageSnapshotOnly.value ? (openBlock(), createElementBlock("div", _hoisted_82, [
              createBaseVNode("p", _hoisted_83, toDisplayString(usageStats.value?.message || usageStats.value?.summary || unref(tLocale)("electricity.usage.snapshotNoCurve")), 1),
              usageSnapshotQuantity.value || usageSnapshotBalance.value ? (openBlock(), createElementBlock("div", _hoisted_84, [
                usageSnapshotQuantity.value ? (openBlock(), createElementBlock("div", _hoisted_85, [
                  createBaseVNode("span", null, toDisplayString(unref(tLocale)("electricity.usage.snapshotQuantity")), 1),
                  createBaseVNode("strong", null, [
                    createTextVNode(toDisplayString(usageSnapshotQuantity.value), 1),
                    createBaseVNode("small", null, toDisplayString(unref(tLocale)("electricity.usage.kwh")), 1)
                  ])
                ])) : createCommentVNode("", true),
                usageSnapshotBalance.value ? (openBlock(), createElementBlock("div", _hoisted_86, [
                  createBaseVNode("span", null, toDisplayString(unref(tLocale)("electricity.usage.snapshotBalance")), 1),
                  createBaseVNode("strong", null, [
                    createTextVNode(toDisplayString(usageSnapshotBalance.value), 1),
                    createBaseVNode("small", null, toDisplayString(unref(tLocale)("electricity.usage.snapshotYuan")), 1)
                  ])
                ])) : createCommentVNode("", true)
              ])) : createCommentVNode("", true),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: loadUsageStats
              }, toDisplayString(unref(tLocale)("electricity.usage.refreshTrend")), 1)
            ])) : (openBlock(), createElementBlock("div", _hoisted_87, toDisplayString(usageEmptyText.value), 1))
          ]),
          createBaseVNode("section", _hoisted_88, [
            createBaseVNode("div", _hoisted_89, [
              createBaseVNode("button", {
                type: "button",
                class: "pay-main",
                disabled: payLoading.value,
                onClick: openElectricityPay
              }, [
                _cache[25] || (_cache[25] = createBaseVNode("span", { class: "material-symbols-outlined" }, "bolt", -1)),
                createTextVNode(" " + toDisplayString(payLoading.value ? unref(tLocale)("electricity.pay.opening") : unref(tLocale)("electricity.pay.main")), 1)
              ], 8, _hoisted_90),
              createBaseVNode("button", {
                type: "button",
                class: "pay-side",
                disabled: payLoading.value,
                "aria-pressed": showPayQr.value,
                onClick: togglePayQr
              }, [..._cache[26] || (_cache[26] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "qr_code_2", -1)
              ])], 8, _hoisted_91)
            ]),
            showPayQr.value && payQr.value ? (openBlock(), createElementBlock("div", _hoisted_92, [
              createBaseVNode("img", {
                src: payQr.value,
                alt: unref(tLocale)("electricity.pay.qrAlt"),
                width: "180",
                height: "180"
              }, null, 8, _hoisted_93)
            ])) : createCommentVNode("", true),
            createBaseVNode("p", _hoisted_94, [
              _cache[27] || (_cache[27] = createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "font-variation-settings": "'FILL' 0" }
              }, "info", -1)),
              createBaseVNode("span", null, toDisplayString(tfPayDemoHint.value), 1)
            ])
          ])
        ])
      ]);
    };
  }
};
const ElectricityView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-641aa93f"]]);
export {
  ElectricityView as default
};
