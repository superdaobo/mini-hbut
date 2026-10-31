import { _ as _export_sfc, b as useLocale, h as fetchWithCache, j as axiosInstance, L as LONG_TTL, B as SHORT_TTL, A as useAppSettings } from "./app-demo-BXR7Wchv.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-DPr8J7w0.js";
import { T as TEmptyState } from "./TEmptyState-Bpftv9OS.js";
import { r as ref, x as watch, o as onMounted, p as onBeforeUnmount, a as openBlock, c as createElementBlock, k as createVNode, u as unref, t as toDisplayString, d as createCommentVNode, b as createBaseVNode, n as normalizeClass, g as createTextVNode, F as Fragment, f as renderList, j as createBlock, h as computed } from "./vue-core-CVT-P0lT.js";
import "./runtime-bridge-z2ulLxEq.js";
import "./more-modules-DkooyOvE.js";
import "./debug-tools-B-8Pd-e1.js";
import "./capture-CoTlEFL0.js";
const CLASSROOM_AVAILABILITY = Object.freeze({
  PERIOD_FREE: "period_free",
  RESOURCE_CATALOG: "resource_catalog",
  UNKNOWN: "unknown",
  UNAUTHORIZED: "unauthorized",
  BAD_RESPONSE: "bad_response"
});
const toFiniteNumber = (value) => {
  if (value === null || value === void 0 || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const normalizeClassroomMeta = (meta = {}) => {
  const source = meta && typeof meta === "object" ? meta : {};
  const total = toFiniteNumber(source.total);
  const loaded = toFiniteNumber(source.loaded);
  const resourceTotal = toFiniteNumber(source.resource_total);
  const week = toFiniteNumber(source.week);
  return {
    date_str: String(source.date_str || "").trim(),
    date_iso: String(source.date_iso || "").trim(),
    date_source: String(source.date_source || "").trim(),
    // 周次 0 = 预备周（服务端把 zcStr=0 当「不过滤」）→ 不展示为「第 0 周」
    week: week === null || week <= 0 ? "" : String(week),
    weekday_name: String(source.weekday_name || "").trim(),
    semester: String(source.semester || "").trim(),
    query_time: String(source.query_time || "").trim(),
    availability: String(source.availability || "").trim(),
    total,
    loaded,
    truncated: source.truncated === true,
    filters_applied: source.filters_applied === true,
    resource_total: resourceTotal,
    periods_str: String(source.periods_str || "").trim()
  };
};
const classroomAvailabilityOf = (meta) => {
  const value = String(meta?.availability || "").trim();
  const known = Object.values(CLASSROOM_AVAILABILITY);
  return known.includes(value) ? value : CLASSROOM_AVAILABILITY.UNKNOWN;
};
const isVerifiedFree = (meta) => classroomAvailabilityOf(meta) === CLASSROOM_AVAILABILITY.PERIOD_FREE;
const isResourceCatalog = (meta) => classroomAvailabilityOf(meta) === CLASSROOM_AVAILABILITY.RESOURCE_CATALOG;
const isAvailabilityUnknown = (meta) => classroomAvailabilityOf(meta) === CLASSROOM_AVAILABILITY.UNKNOWN;
const classroomCountKey = (meta) => {
  if (isVerifiedFree(meta)) return "classroom.result.freeCount";
  if (isAvailabilityUnknown(meta)) return "classroom.result.unknownCount";
  return "classroom.result.catalogCount";
};
const classroomResultCount = (meta, fallbackCount = 0) => {
  const total = toFiniteNumber(meta?.total);
  if (total !== null) return total;
  return Number.isFinite(Number(fallbackCount)) ? Number(fallbackCount) : 0;
};
const classroomBadgeKey = (meta) => {
  if (isVerifiedFree(meta)) return "classroom.badge.free";
  if (isAvailabilityUnknown(meta)) return "classroom.badge.unknown";
  return "classroom.badge.catalog";
};
const classroomNoticeKey = (meta) => {
  if (isResourceCatalog(meta)) return "classroom.availability.catalog";
  if (isAvailabilityUnknown(meta)) return "classroom.availability.unknown";
  return "classroom.availability.other";
};
const shouldShowAvailabilityNotice = (meta, hasSuccessfulQuery) => !!hasSuccessfulQuery && !isVerifiedFree(meta);
const classroomEmptyMode = ({ meta, roomCount, loading, hasError }) => {
  if (loading || hasError) return "none";
  if (!Number.isFinite(Number(roomCount)) || Number(roomCount) > 0) return "none";
  return isVerifiedFree(meta) ? "verified-empty" : "unverified-empty";
};
const isClassroomResultTruncated = (meta, fallbackCount = 0) => {
  if (meta?.truncated === true) return true;
  const total = toFiniteNumber(meta?.total);
  const loaded = toFiniteNumber(meta?.loaded);
  if (total === null || loaded === null) return false;
  return loaded < total && total > 0;
};
const formatClassroomWeekLabel = (week, nthFormatter) => {
  const value = String(week ?? "").trim();
  if (!value) return "";
  if (/^第.+周$|^Week\s?\d+$/i.test(value)) return value;
  return typeof nthFormatter === "function" ? nthFormatter(value) : value;
};
const formatClassroomCalendarLabel = (meta, nthFormatter) => {
  const parts = [];
  const week = formatClassroomWeekLabel(meta?.week, nthFormatter);
  const weekday = String(meta?.weekday_name || "").trim();
  if (week) parts.push(week);
  if (weekday) parts.push(weekday);
  return parts.join(" · ");
};
const normalizeRemoteWeeks = (weeks) => {
  if (!Array.isArray(weeks)) return [];
  const out = [];
  for (const item of weeks) {
    const value = Number(item);
    if (Number.isFinite(value) && value > 0 && !out.includes(value)) out.push(value);
  }
  return out.sort((a, b) => a - b);
};
const resolveWeekOptions = (remoteWeeks, fallbackCount = 25) => {
  const remote = normalizeRemoteWeeks(remoteWeeks);
  if (remote.length) return remote;
  return Array.from({ length: fallbackCount }, (_, i) => i + 1);
};
const resolveBuildingQueryValue = (building, fromTeacherDomain) => {
  const code = String(building?.code ?? "").trim();
  const name = String(building?.name ?? "").trim();
  if (fromTeacherDomain) return code || name;
  return name || code;
};
const buildClassroomQueryPayload = ({ filters = {}, studentId = "" } = {}) => {
  const sid = String(studentId || "").trim();
  const week = toFiniteNumber(filters.week);
  const weekday = toFiniteNumber(filters.weekday);
  const minSeats = toFiniteNumber(filters.minSeats);
  const maxSeats = toFiniteNumber(filters.maxSeats);
  const periods = Array.isArray(filters.periods) ? filters.periods.map((item) => toFiniteNumber(item)).filter((item) => item !== null && item >= 1 && item <= 11) : [];
  const building = String(filters.building || "").trim();
  const payload = { student_id: sid };
  if (week !== null && week > 0) payload.week = week;
  if (weekday !== null && weekday >= 1 && weekday <= 7) payload.weekday = weekday;
  if (periods.length) payload.periods = periods;
  if (building) payload.building = building;
  if (minSeats !== null) payload.min_seats = minSeats;
  if (maxSeats !== null) payload.max_seats = maxSeats;
  return payload;
};
const buildClassroomCacheKey = (studentId, payload = {}, role = "") => {
  const sid = String(studentId || "").trim();
  const roleKey = String(role || "").trim() || "unknown";
  const week = payload.week ?? "auto";
  const weekday = payload.weekday ?? "auto";
  const periods = Array.isArray(payload.periods) && payload.periods.length ? payload.periods.join(",") : "auto";
  const building = encodeURIComponent(String(payload.building || "all")).slice(0, 48);
  const min = payload.min_seats ?? "";
  const max = payload.max_seats ?? "";
  return `classroom:${sid}:${roleKey}:w${week}:d${weekday}:p${periods}:b${building}:s${min}-${max}`;
};
const classroomRoleFromMeta = (meta) => {
  const mode = String(meta?.filter_mode || "").trim();
  if (mode.startsWith("teacher")) return "teacher";
  if (mode) return "student";
  return "";
};
const _hoisted_1 = { class: "classroom-page min-h-screen bg-surface text-on-surface flex flex-col mx-auto max-w-[448px] relative" };
const _hoisted_2 = {
  key: 0,
  class: "mx-4 mt-2 px-3 py-2 rounded-xl bg-error-container/60 text-on-error-container text-xs font-medium"
};
const _hoisted_3 = { class: "flex-1 flex flex-col gap-5 pb-24" };
const _hoisted_4 = { class: "px-4 flex flex-col gap-3" };
const _hoisted_5 = { class: "grid grid-cols-3 gap-2" };
const _hoisted_6 = { class: "flex flex-col gap-3 bg-surface-container-lowest p-4 rounded-[24px] shadow-[0_4px_15px_rgba(0,0,0,0.03)] mt-2" };
const _hoisted_7 = { class: "flex items-center" };
const _hoisted_8 = { class: "classroom-filter-label text-xs font-medium w-12 shrink-0" };
const _hoisted_9 = { class: "flex overflow-x-auto no-scrollbar gap-2 pb-1" };
const _hoisted_10 = ["onClick"];
const _hoisted_11 = { class: "flex items-center" };
const _hoisted_12 = { class: "classroom-filter-label text-xs font-medium w-12 shrink-0" };
const _hoisted_13 = { class: "flex overflow-x-auto no-scrollbar gap-2 pb-1" };
const _hoisted_14 = ["onClick"];
const _hoisted_15 = { class: "flex items-center" };
const _hoisted_16 = { class: "classroom-filter-label text-xs font-medium w-12 shrink-0" };
const _hoisted_17 = { class: "flex overflow-x-auto no-scrollbar gap-2 pb-1" };
const _hoisted_18 = ["onClick"];
const _hoisted_19 = { class: "flex items-start" };
const _hoisted_20 = { class: "classroom-filter-label text-xs font-medium w-12 shrink-0 pt-2" };
const _hoisted_21 = { class: "classroom-period-groups" };
const _hoisted_22 = { class: "classroom-period-row-label" };
const _hoisted_23 = { class: "classroom-period-row-buttons" };
const _hoisted_24 = ["onClick", "aria-label", "title"];
const _hoisted_25 = {
  key: 0,
  class: "material-symbols-outlined text-[14px]"
};
const _hoisted_26 = { class: "mt-2 flex justify-between items-center pt-3 border-t border-surface-variant" };
const _hoisted_27 = {
  class: "text-on-surface-variant text-sm",
  "data-testid": "classroom-count-label"
};
const _hoisted_28 = ["disabled"];
const _hoisted_29 = {
  key: 0,
  class: "mx-4 px-4 py-3 rounded-xl bg-error-container/60 text-on-error-container text-sm text-center",
  "data-testid": "classroom-error"
};
const _hoisted_30 = {
  key: 1,
  class: "mx-4 px-4 py-3 rounded-xl bg-surface-container text-on-surface-variant text-xs leading-relaxed",
  "data-testid": "classroom-availability-notice"
};
const _hoisted_31 = { class: "px-4 flex flex-col gap-3" };
const _hoisted_32 = {
  key: 0,
  class: "classroom-result-meta",
  "data-testid": "classroom-result-meta"
};
const _hoisted_33 = { key: 0 };
const _hoisted_34 = { key: 1 };
const _hoisted_35 = {
  key: 2,
  class: "classroom-result-meta-time"
};
const _hoisted_36 = {
  key: 1,
  class: "px-3 py-2 rounded-xl bg-surface-container text-on-surface-variant text-xs",
  "data-testid": "classroom-truncated"
};
const _hoisted_37 = { class: "flex justify-between items-start" };
const _hoisted_38 = { class: "flex flex-col" };
const _hoisted_39 = { class: "text-lg font-bold text-on-surface flex items-center gap-2" };
const _hoisted_40 = {
  key: 0,
  class: "px-2 py-0.5 rounded-md bg-success-teal/10 text-success-teal text-[10px] font-semibold",
  "data-testid": "classroom-badge-free"
};
const _hoisted_41 = {
  key: 1,
  class: "px-2 py-0.5 rounded-md bg-surface-container text-on-surface-variant text-[10px] font-semibold",
  "data-testid": "classroom-badge-unverified"
};
const _hoisted_42 = { class: "text-secondary text-sm mt-1" };
const _hoisted_43 = { class: "flex flex-col items-end" };
const _hoisted_44 = { class: "text-primary text-xl font-bold" };
const _hoisted_45 = { class: "text-on-surface-variant text-[10px] font-semibold" };
const _hoisted_46 = { class: "flex gap-2 mt-1" };
const _hoisted_47 = {
  key: 0,
  class: "px-2.5 py-1 rounded bg-surface-container flex items-center gap-1 text-on-surface-variant text-[10px] font-semibold"
};
const _hoisted_48 = {
  key: 1,
  class: "px-2.5 py-1 rounded bg-surface-container flex items-center gap-1 text-on-surface-variant text-[10px] font-semibold"
};
const _hoisted_49 = {
  key: 2,
  class: "py-4 flex justify-center"
};
const _hoisted_50 = {
  key: 3,
  class: "py-6 flex flex-col items-center justify-center gap-2 text-on-surface-variant"
};
const _hoisted_51 = { class: "text-xs font-medium" };
const CLASSROOM_SNAPSHOT_SCHEMA = 1;
const CLASSROOM_SNAPSHOT_PREFIX = "hbu_classroom_snapshot_v1";
const CLASSROOM_SNAPSHOT_FRESH_MS = 60 * 1e3;
const CLASSROOM_AUTO_QUERY_COOLDOWN_MS = 20 * 1e3;
const CLASSROOM_DEFERRED_REFRESH_MS = 2500;
const WARMUP_RETRY_KEY = "classroom.error.warmupRetry";
const _sfc_main = {
  __name: "ClassroomView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const { t } = useLocale();
    const tr = (key, params = {}) => {
      let text = t(key);
      for (const [name, value] of Object.entries(params)) {
        text = text.split(`{${name}}`).join(String(value));
      }
      return text;
    };
    const props = __props;
    const API_BASE = "/api";
    const appSettings = useAppSettings();
    const maxRetry = computed(() => appSettings.retry.classroom);
    const retryDelayMs = computed(() => appSettings.retryDelayMs);
    const CN_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    const displayBuildingName = (name) => {
      const m = String(name || "").trim().match(/^(\d+)(?:号教学(?:楼)?|号楼|教)$/);
      if (!m) return name;
      const cn = m[1].split("").map((d) => CN_DIGITS[Number(d)] || d).join("");
      return `${cn}教`;
    };
    const loading = ref(false);
    const buildings = ref([]);
    const classrooms = ref([]);
    const displayLimit = ref(50);
    const errorMsg = ref("");
    const offline = ref(false);
    const syncTime = ref("");
    const currentMeta = ref(normalizeClassroomMeta({}));
    const hasSuccessfulQuery = ref(false);
    const isPeriodVerified = computed(() => isVerifiedFree(currentMeta.value));
    const availabilityNoticeKey = computed(() => classroomNoticeKey(currentMeta.value));
    const showAvailabilityNotice = computed(
      () => shouldShowAvailabilityNotice(currentMeta.value, hasSuccessfulQuery.value)
    );
    const roomBadgeKey = computed(() => classroomBadgeKey(currentMeta.value));
    const remoteWeekOptions = ref([]);
    const resourceTotal = ref(null);
    const buildingsFromTeacherDomain = ref(false);
    const classroomRole = ref("");
    const buildingQueryValue = (building) => resolveBuildingQueryValue(building, buildingsFromTeacherDomain.value);
    const displayedClassrooms = computed(() => classrooms.value.slice(0, displayLimit.value));
    const hasMoreClassrooms = computed(() => classrooms.value.length > displayLimit.value);
    const showMoreClassrooms = () => {
      displayLimit.value += 50;
    };
    const queryDateLabel = computed(() => String(currentMeta.value?.date_str || "").trim());
    const queryCalendarLabel = computed(
      () => formatClassroomCalendarLabel(currentMeta.value, (n) => tr("classroom.week.nth", { n }))
    );
    const queryTimeLabel = computed(() => {
      const raw = String(currentMeta.value?.query_time || syncTime.value || "").trim();
      return raw ? formatRelativeTime(raw) : "";
    });
    const resultCountLabel = computed(
      () => tr(classroomCountKey(currentMeta.value), {
        n: classroomResultCount(currentMeta.value, classrooms.value.length)
      })
    );
    const resultTruncated = computed(
      () => isClassroomResultTruncated(currentMeta.value, classrooms.value.length)
    );
    const emptyMode = computed(
      () => classroomEmptyMode({
        meta: currentMeta.value,
        roomCount: classrooms.value.length,
        loading: loading.value,
        hasError: !!errorMsg.value || !hasSuccessfulQuery.value
      })
    );
    let disposed = false;
    let retryTimer = null;
    let autoRefreshTimer = null;
    let latestRequestId = 0;
    let latestBuildingRequestId = 0;
    let activeQueryController = null;
    let activeBuildingController = null;
    let lastAutoQueryAt = 0;
    let lastAutoQueryFingerprint = "";
    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };
    const clearAutoRefreshTimer = () => {
      if (autoRefreshTimer) {
        clearTimeout(autoRefreshTimer);
        autoRefreshTimer = null;
      }
    };
    const safeArray = (value) => Array.isArray(value) ? value : [];
    const selectCurrentWeek = () => {
      filters.value.week = "";
    };
    const createAbortSignal = (type = "query") => {
      if (typeof AbortController === "undefined") return null;
      if (type === "query" && activeQueryController) {
        activeQueryController.abort();
      }
      if (type === "building" && activeBuildingController) {
        activeBuildingController.abort();
      }
      const controller = new AbortController();
      if (type === "query") activeQueryController = controller;
      if (type === "building") activeBuildingController = controller;
      return controller.signal;
    };
    const clearAbortController = (type = "query", signal = null) => {
      if (type === "query" && activeQueryController?.signal === signal) {
        activeQueryController = null;
      }
      if (type === "building" && activeBuildingController?.signal === signal) {
        activeBuildingController = null;
      }
    };
    const resolveStudentId = () => {
      const sid = String(props.studentId || "").trim();
      if (sid) return sid;
      return String(localStorage.getItem("hbu_username") || "").trim();
    };
    const buildClassroomSnapshotKey = (studentId) => {
      const sid = String(studentId || "").trim();
      if (!sid) return "";
      return `${CLASSROOM_SNAPSHOT_PREFIX}:${sid}`;
    };
    const readClassroomSnapshot = (studentId = "") => {
      const sid = String(studentId || resolveStudentId() || "").trim();
      const key = buildClassroomSnapshotKey(sid);
      if (!key) return null;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Number(parsed?.schema_version || 0) !== CLASSROOM_SNAPSHOT_SCHEMA) return null;
        if (String(parsed?.student_id || "").trim() !== sid) return null;
        return {
          schema_version: CLASSROOM_SNAPSHOT_SCHEMA,
          student_id: sid,
          filters: parsed?.filters && typeof parsed.filters === "object" ? parsed.filters : {},
          current_meta: parsed?.current_meta && typeof parsed.current_meta === "object" ? parsed.current_meta : {},
          classrooms: safeArray(parsed?.classrooms),
          sync_time: String(parsed?.sync_time || "").trim(),
          offline: !!parsed?.offline,
          updated_at: String(parsed?.updated_at || "").trim()
        };
      } catch {
        return null;
      }
    };
    const writeClassroomSnapshot = (reason = "unknown") => {
      const sid = resolveStudentId();
      const key = buildClassroomSnapshotKey(sid);
      if (!sid || !key || !hasSuccessfulQuery.value) return false;
      try {
        localStorage.setItem(key, JSON.stringify({
          schema_version: CLASSROOM_SNAPSHOT_SCHEMA,
          student_id: sid,
          // 角色一并落盘：师生走完全不同的空教室数据源，恢复时据此丢弃跨角色快照
          role: String(classroomRole.value || "").trim(),
          filters: { ...filters.value },
          current_meta: { ...currentMeta.value },
          classrooms: safeArray(classrooms.value),
          sync_time: String(syncTime.value || "").trim(),
          offline: !!offline.value,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }));
        console.log("[Classroom] snapshot saved:", reason);
        return true;
      } catch {
        return false;
      }
    };
    const applyClassroomSnapshot = (snapshot, options = {}) => {
      if (!snapshot) return false;
      filters.value = {
        week: String(snapshot.filters?.week || "").trim(),
        weekday: String(snapshot.filters?.weekday || "").trim(),
        periods: safeArray(snapshot.filters?.periods).map((item) => Number(item)).filter((item) => Number.isFinite(item)),
        building: String(snapshot.filters?.building || "").trim(),
        minSeats: String(snapshot.filters?.minSeats || "").trim(),
        maxSeats: String(snapshot.filters?.maxSeats || "").trim()
      };
      currentMeta.value = normalizeClassroomMeta(snapshot.current_meta);
      classroomRole.value = String(snapshot.role || "").trim() || classroomRoleFromMeta(snapshot.current_meta);
      classrooms.value = safeArray(snapshot.classrooms);
      syncTime.value = String(snapshot.sync_time || snapshot.updated_at || "").trim();
      offline.value = options?.markOffline !== false;
      hasSuccessfulQuery.value = true;
      if (options?.preserveMessage !== true) {
        errorMsg.value = "";
      }
      return true;
    };
    const restoreClassroomSnapshot = (options = {}) => {
      const snapshot = readClassroomSnapshot();
      if (!snapshot) return false;
      return applyClassroomSnapshot(snapshot, options);
    };
    const parseSnapshotTimestamp = (snapshot) => {
      const raw = String(snapshot?.updated_at || snapshot?.sync_time || "").trim();
      if (!raw) return 0;
      const ts = Date.parse(raw);
      return Number.isFinite(ts) ? ts : 0;
    };
    const getSnapshotAgeMs = (snapshot) => {
      const ts = parseSnapshotTimestamp(snapshot);
      if (!ts) return Number.POSITIVE_INFINITY;
      return Math.max(0, Date.now() - ts);
    };
    const filters = ref({
      week: "",
      weekday: "",
      periods: [],
      // 选中的节次
      building: "",
      minSeats: "",
      maxSeats: ""
    });
    const weekOptions = computed(() => resolveWeekOptions(remoteWeekOptions.value));
    const weekdayOptions = [1, 2, 3, 4, 5, 6, 7].map((value) => ({
      value,
      label: t(`classroom.weekday.${value}`)
    }));
    const periodOptions = [
      { value: 1, label: "08:20-09:05" },
      { value: 2, label: "09:10-09:55" },
      { value: 3, label: "10:15-11:00" },
      { value: 4, label: "11:05-11:50" },
      { value: 5, label: "14:00-14:45" },
      { value: 6, label: "14:50-15:35" },
      { value: 7, label: "15:55-16:40" },
      { value: 8, label: "16:45-17:30" },
      { value: 9, label: "18:30-19:15" },
      { value: 10, label: "19:20-20:05" },
      { value: 11, label: "20:10-20:55" }
    ];
    const periodGroups = [
      { key: "morning", label: t("classroom.time.morning"), periods: periodOptions.slice(0, 4) },
      { key: "afternoon", label: t("classroom.time.afternoon"), periods: periodOptions.slice(4, 8) },
      { key: "evening", label: t("classroom.time.evening"), periods: periodOptions.slice(8, 11) }
    ];
    const fetchBuildings = async () => {
      const requestId = ++latestBuildingRequestId;
      const signal = createAbortSignal("building");
      try {
        console.log("[Classroom] Fetching buildings...");
        const { data } = await fetchWithCache("classroom:buildings", async () => {
          const res = await axiosInstance.get(`${API_BASE}/v2/classroom/buildings`, { signal });
          console.log("[Classroom] Buildings API response:", res.data);
          return res.data;
        }, LONG_TTL);
        if (disposed || requestId !== latestBuildingRequestId) return;
        console.log("[Classroom] Buildings data:", data);
        if (data?.success) {
          buildings.value = safeArray(data.data);
          buildingsFromTeacherDomain.value = String(data?.meta?.source || "") === "teacher_resource_domain";
          remoteWeekOptions.value = normalizeRemoteWeeks(data?.meta?.weeks);
          const total = Number(data?.meta?.resource_total);
          resourceTotal.value = Number.isFinite(total) && total > 0 ? total : null;
          console.log("[Classroom] Buildings loaded:", buildings.value.length);
        } else {
          console.error("[Classroom] Buildings failed:", data);
          buildings.value = [];
          remoteWeekOptions.value = [];
          resourceTotal.value = null;
          buildingsFromTeacherDomain.value = false;
          if (data?.error && !errorMsg.value) {
            errorMsg.value = String(data.error);
          }
        }
      } catch (e) {
        if (String(e?.name || "").trim() === "CanceledError" || String(e?.message || "").includes("canceled")) {
          return;
        }
        console.error("获取教学楼失败", e);
        if (!disposed && requestId === latestBuildingRequestId) {
          buildings.value = [];
        }
      } finally {
        clearAbortController("building", signal);
      }
    };
    const CLASS_SCHEDULE = [
      [8, 20, 9, 5],
      // 第1节
      [9, 10, 9, 55],
      // 第2节
      [10, 15, 11, 0],
      // 第3节
      [11, 5, 11, 50],
      // 第4节
      [14, 0, 14, 45],
      // 第5节
      [14, 50, 15, 35],
      // 第6节
      [15, 55, 16, 40],
      // 第7节
      [16, 45, 17, 30],
      // 第8节
      [18, 30, 19, 15],
      // 第9节
      [19, 20, 20, 5],
      // 第10节
      [20, 10, 20, 55]
      // 第11节
    ];
    const daypartRange = (period) => {
      if (period <= 4) return [1, 4];
      if (period <= 8) return [5, 8];
      return [9, 11];
    };
    const buildPeriodRange = (start, end) => {
      const items = [];
      for (let i = start; i <= end; i += 1) items.push(i);
      return items;
    };
    const buildQueryPayload = (studentId = resolveStudentId()) => buildClassroomQueryPayload({ filters: filters.value, studentId });
    const buildCurrentQueryFingerprint = (studentId = resolveStudentId()) => {
      const sid = String(studentId || "").trim();
      if (!sid) return "";
      return buildClassroomCacheKey(sid, buildQueryPayload(sid), classroomRole.value);
    };
    const scheduleDeferredAutoRefresh = (reason = "deferred", delayMs = CLASSROOM_DEFERRED_REFRESH_MS) => {
      clearAutoRefreshTimer();
      if (disposed || document.hidden) return;
      const safeDelay = Math.max(400, Number(delayMs) || CLASSROOM_DEFERRED_REFRESH_MS);
      autoRefreshTimer = setTimeout(() => {
        autoRefreshTimer = null;
        void triggerAutoQuery(`${reason}:delayed`, {
          preserveResults: true,
          minIntervalMs: CLASSROOM_AUTO_QUERY_COOLDOWN_MS
        });
      }, safeDelay);
    };
    const triggerAutoQuery = async (reason = "auto", options = {}) => {
      if (disposed || document.hidden) return false;
      if (loading.value && !options.force) {
        console.log(`[Classroom] skip auto query while loading: ${reason}`);
        return false;
      }
      const sid = resolveStudentId();
      if (!sid) {
        await queryClassrooms(0, {
          preserveResults: options?.preserveResults !== false,
          reason,
          isAuto: true
        });
        return true;
      }
      const fingerprint = buildCurrentQueryFingerprint(sid);
      const minIntervalMs = Number(options?.minIntervalMs) > 0 ? Number(options.minIntervalMs) : CLASSROOM_AUTO_QUERY_COOLDOWN_MS;
      const snapshot = readClassroomSnapshot(sid);
      const snapshotAge = getSnapshotAgeMs(snapshot);
      const hasFreshSnapshot = hasSuccessfulQuery.value && snapshotAge < CLASSROOM_SNAPSHOT_FRESH_MS;
      if (!options.force && hasFreshSnapshot) {
        console.log(`[Classroom] skip auto query (${reason}) because snapshot is fresh: ${snapshotAge}ms`);
        const delay = Math.min(
          CLASSROOM_SNAPSHOT_FRESH_MS,
          Math.max(CLASSROOM_DEFERRED_REFRESH_MS, CLASSROOM_SNAPSHOT_FRESH_MS - snapshotAge)
        );
        scheduleDeferredAutoRefresh(reason, delay);
        return false;
      }
      if (!options.force && fingerprint && lastAutoQueryFingerprint === fingerprint && Date.now() - lastAutoQueryAt < minIntervalMs) {
        console.log(`[Classroom] skip auto query cooldown: ${reason}`);
        return false;
      }
      clearAutoRefreshTimer();
      lastAutoQueryFingerprint = fingerprint;
      lastAutoQueryAt = Date.now();
      await queryClassrooms(0, {
        preserveResults: options?.preserveResults !== false,
        reason,
        isAuto: true
      });
      return true;
    };
    const handleManualQuery = () => {
      clearAutoRefreshTimer();
      lastAutoQueryAt = 0;
      lastAutoQueryFingerprint = "";
      return queryClassrooms(0, {
        preserveResults: true,
        reason: "manual",
        isAuto: false
      });
    };
    const getCurrentClassPeriods = () => {
      const now = /* @__PURE__ */ new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      for (let i = 0; i < CLASS_SCHEDULE.length; i += 1) {
        const [, , eh, em] = CLASS_SCHEDULE[i];
        const period = i + 1;
        const endMinutes = eh * 60 + em;
        if (currentMinutes <= endMinutes) {
          const [start, end] = daypartRange(period);
          return buildPeriodRange(period, end);
        }
      }
      return [9, 10, 11];
    };
    const initLocalMeta = () => {
      const now = /* @__PURE__ */ new Date();
      const dayIndex = now.getDay();
      const weekdayKeyValue = dayIndex === 0 ? 7 : dayIndex;
      if (!filters.value.weekday) {
        filters.value.weekday = weekdayKeyValue;
      }
      if (filters.value.periods.length === 0) {
        filters.value.periods = getCurrentClassPeriods();
      }
    };
    const queryClassrooms = async (retryCount = 0, options = {}) => {
      if (disposed) return;
      const sid = resolveStudentId();
      const preserveResults = options?.preserveResults !== false;
      const reason = String(options?.reason || "manual").trim() || "manual";
      const isAuto = options?.isAuto === true;
      if (isAuto && loading.value && retryCount === 0) {
        console.log(`[Classroom] ignore overlapped auto query: ${reason}`);
        return;
      }
      if (!sid) {
        errorMsg.value = hasSuccessfulQuery.value ? t("classroom.error.loginRequiredCached") : t("classroom.error.loginRequired");
        loading.value = false;
        return;
      }
      clearRetryTimer();
      const requestId = ++latestRequestId;
      const signal = createAbortSignal("query");
      loading.value = true;
      if (retryCount === 0) errorMsg.value = "";
      if (!preserveResults) {
        classrooms.value = [];
      }
      try {
        const payload = buildQueryPayload(sid);
        console.log(`[Classroom] queryClassrooms reason=${reason} retry=${retryCount} payload:`, JSON.stringify(payload));
        const cacheKey = buildClassroomCacheKey(sid, payload, classroomRole.value);
        const { data } = await fetchWithCache(cacheKey, async () => {
          console.log("[Classroom] Making API call for classrooms");
          const res = await axiosInstance.post(`${API_BASE}/v2/classroom/query`, payload, { signal });
          console.log("[Classroom] API response:", res.data);
          return res.data;
        }, SHORT_TTL);
        if (disposed || requestId !== latestRequestId) return;
        if (data?.success) {
          classrooms.value = safeArray(data.data);
          displayLimit.value = 50;
          offline.value = !!data.offline;
          syncTime.value = data.sync_time || "";
          hasSuccessfulQuery.value = true;
          if (data.meta) {
            currentMeta.value = normalizeClassroomMeta(data.meta);
            classroomRole.value = classroomRoleFromMeta(data.meta);
            if (!filters.value.weekday && currentMeta.value.weekday) filters.value.weekday = currentMeta.value.weekday;
            if (filters.value.periods.length === 0 && data.meta.periods) {
              filters.value.periods = safeArray(data.meta.periods);
            }
          } else {
            currentMeta.value = normalizeClassroomMeta({});
          }
          writeClassroomSnapshot("query-success");
        } else {
          if (data?.need_login) {
            offline.value = true;
            errorMsg.value = hasSuccessfulQuery.value ? t("classroom.error.sessionExpiredCached") : t("classroom.error.sessionExpired");
            return;
          }
          if (!preserveResults || !hasSuccessfulQuery.value) {
            classrooms.value = [];
          }
          currentMeta.value = normalizeClassroomMeta({});
          errorMsg.value = data?.error || t("classroom.error.queryFailed");
        }
      } catch (e) {
        if (disposed || requestId !== latestRequestId) return;
        if (String(e?.name || "").trim() === "CanceledError" || String(e?.message || "").includes("canceled")) {
          return;
        }
        console.error("查询异常", e);
        if (e.response && (e.response.status === 502 || e.response.status === 504) || e.message.includes("Network Error")) {
          if (retryCount < maxRetry.value) {
            if (retryCount === 0 && !currentMeta.value.date_str) initLocalMeta();
            errorMsg.value = tr(WARMUP_RETRY_KEY, {
              cur: retryCount + 1,
              max: maxRetry.value
            });
            retryTimer = setTimeout(() => {
              retryTimer = null;
              if (disposed) return;
              queryClassrooms(retryCount + 1, {
                preserveResults: true,
                reason: `${reason}:retry`,
                isAuto
              });
            }, retryDelayMs.value);
            return;
          } else {
            errorMsg.value = hasSuccessfulQuery.value ? t("classroom.error.serverTimeoutCached") : t("classroom.error.serverTimeout");
          }
        } else {
          errorMsg.value = hasSuccessfulQuery.value ? t("classroom.error.connectionFailedCached") : t("classroom.error.connectionFailed");
        }
      } finally {
        clearAbortController("query", signal);
        if (disposed || requestId !== latestRequestId) return;
        if (!errorMsg.value.includes(t(WARMUP_RETRY_KEY))) {
          loading.value = false;
        }
      }
    };
    const togglePeriod = (p) => {
      const index = filters.value.periods.indexOf(p);
      if (index > -1) {
        filters.value.periods.splice(index, 1);
      } else {
        filters.value.periods.push(p);
        filters.value.periods.sort((a, b) => a - b);
      }
    };
    const selectTimeRange = (type) => {
      if (type === "morning") filters.value.periods = [1, 2, 3, 4];
      else if (type === "afternoon") filters.value.periods = [5, 6, 7, 8];
      else if (type === "evening") filters.value.periods = [9, 10, 11];
      else if (type === "clear") filters.value.periods = [];
    };
    const handleClassroomVisibilityChange = () => {
      if (document.hidden) {
        writeClassroomSnapshot("app-hidden");
        clearAutoRefreshTimer();
        return;
      }
      if (restoreClassroomSnapshot({ markOffline: false })) {
        void triggerAutoQuery("visibility-resume", {
          preserveResults: true,
          minIntervalMs: CLASSROOM_AUTO_QUERY_COOLDOWN_MS
        });
      }
    };
    watch(
      () => props.studentId,
      (nextSid, prevSid) => {
        const next = String(nextSid || "").trim();
        const prev = String(prevSid || "").trim();
        if (!next || next === prev) return;
        clearAutoRefreshTimer();
        if (!restoreClassroomSnapshot({ markOffline: false })) {
          void triggerAutoQuery("student-id-change", {
            preserveResults: true,
            force: true
          });
          return;
        }
        void triggerAutoQuery("student-id-change", {
          preserveResults: true,
          force: true
        });
      }
    );
    onMounted(async () => {
      initLocalMeta();
      document.addEventListener("visibilitychange", handleClassroomVisibilityChange);
      const restored = restoreClassroomSnapshot({ markOffline: false });
      const buildingsTask = fetchBuildings();
      if (restored) {
        void triggerAutoQuery("mounted-with-snapshot", {
          preserveResults: true,
          force: true
        });
      } else {
        void triggerAutoQuery("mounted-no-snapshot", {
          preserveResults: true,
          force: true
        });
      }
      await Promise.allSettled([buildingsTask]);
    });
    onBeforeUnmount(() => {
      writeClassroomSnapshot("component-unmount");
      disposed = true;
      document.removeEventListener("visibilitychange", handleClassroomVisibilityChange);
      clearRetryTimer();
      clearAutoRefreshTimer();
      activeQueryController?.abort?.();
      activeBuildingController?.abort?.();
      activeQueryController = null;
      activeBuildingController = null;
      latestRequestId += 1;
      latestBuildingRequestId += 1;
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          icon: "school",
          title: unref(t)("classroom.title"),
          onBack: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("back"))
        }, null, 8, ["title"]),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_2, toDisplayString(unref(t)("classroom.offline.updatedPrefix")) + toDisplayString(unref(formatRelativeTime)(syncTime.value)), 1)) : createCommentVNode("", true),
        createBaseVNode("main", _hoisted_3, [
          createBaseVNode("section", _hoisted_4, [
            createBaseVNode("div", _hoisted_5, [
              createBaseVNode("button", {
                onClick: _cache[1] || (_cache[1] = ($event) => selectTimeRange("morning")),
                class: normalizeClass([
                  "py-2.5 rounded-lg text-xs font-medium transition-transform active:scale-95 flex items-center justify-center gap-1",
                  filters.value.periods.length > 0 && filters.value.periods.every((p) => p <= 4) ? "bg-primary-container text-on-primary-container border border-transparent shadow-[0_4px_15px_rgba(33,112,228,0.15)]" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30 shadow-[0_4px_15px_rgba(0,0,0,0.03)]"
                ])
              }, [
                _cache[6] || (_cache[6] = createBaseVNode("span", { class: "material-symbols-outlined text-[16px]" }, "wb_sunny", -1)),
                createTextVNode(" " + toDisplayString(unref(t)("classroom.time.morning")), 1)
              ], 2),
              createBaseVNode("button", {
                onClick: _cache[2] || (_cache[2] = ($event) => selectTimeRange("afternoon")),
                class: normalizeClass([
                  "py-2.5 rounded-lg text-xs font-medium transition-transform active:scale-95 flex items-center justify-center gap-1",
                  filters.value.periods.length > 0 && filters.value.periods.every((p) => p >= 5 && p <= 8) ? "bg-primary-container text-on-primary-container border border-transparent shadow-[0_4px_15px_rgba(33,112,228,0.15)]" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30 shadow-[0_4px_15px_rgba(0,0,0,0.03)]"
                ])
              }, [
                _cache[7] || (_cache[7] = createBaseVNode("span", { class: "material-symbols-outlined text-[16px]" }, "routine", -1)),
                createTextVNode(" " + toDisplayString(unref(t)("classroom.time.afternoon")), 1)
              ], 2),
              createBaseVNode("button", {
                onClick: _cache[3] || (_cache[3] = ($event) => selectTimeRange("evening")),
                class: normalizeClass([
                  "py-2.5 rounded-lg text-xs font-medium transition-transform active:scale-95 flex items-center justify-center gap-1",
                  filters.value.periods.length > 0 && filters.value.periods.every((p) => p >= 9) ? "bg-primary-container text-on-primary-container border border-transparent shadow-[0_4px_15px_rgba(33,112,228,0.15)]" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30 shadow-[0_4px_15px_rgba(0,0,0,0.03)]"
                ])
              }, [
                _cache[8] || (_cache[8] = createBaseVNode("span", { class: "material-symbols-outlined text-[16px]" }, "bedtime", -1)),
                createTextVNode(" " + toDisplayString(unref(t)("classroom.time.evening")), 1)
              ], 2)
            ]),
            createBaseVNode("div", _hoisted_6, [
              createBaseVNode("div", _hoisted_7, [
                createBaseVNode("span", _hoisted_8, toDisplayString(unref(t)("classroom.filter.building")), 1),
                createBaseVNode("div", _hoisted_9, [
                  createBaseVNode("button", {
                    onClick: _cache[4] || (_cache[4] = ($event) => filters.value.building = ""),
                    class: normalizeClass([
                      "px-3 py-1.5 rounded-full text-xs font-medium shrink-0",
                      !filters.value.building ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant"
                    ])
                  }, toDisplayString(unref(t)("classroom.filter.all")), 3),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(buildings.value.filter((b) => b.code), (b) => {
                    return openBlock(), createElementBlock("button", {
                      key: b.code,
                      onClick: ($event) => filters.value.building = buildingQueryValue(b),
                      class: normalizeClass([
                        "px-3 py-1.5 rounded-full text-xs font-medium shrink-0",
                        filters.value.building === buildingQueryValue(b) ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant"
                      ])
                    }, toDisplayString(displayBuildingName(b.name)), 11, _hoisted_10);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_11, [
                createBaseVNode("span", _hoisted_12, toDisplayString(unref(t)("classroom.filter.week")), 1),
                createBaseVNode("div", _hoisted_13, [
                  createBaseVNode("button", {
                    onClick: selectCurrentWeek,
                    class: normalizeClass([
                      "px-3 py-1.5 rounded-full text-xs font-medium shrink-0",
                      !filters.value.week ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant"
                    ])
                  }, toDisplayString(currentMeta.value.week ? tr("classroom.week.currentWithRange", { n: currentMeta.value.week }) : unref(t)("classroom.week.current")), 3),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(weekOptions.value, (w) => {
                    return openBlock(), createElementBlock("button", {
                      key: w,
                      onClick: ($event) => filters.value.week = w,
                      class: normalizeClass([
                        "px-3 py-1.5 rounded-full text-xs font-medium shrink-0",
                        Number(filters.value.week) === w ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant"
                      ])
                    }, toDisplayString(tr("classroom.week.nth", { n: w })), 11, _hoisted_14);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_15, [
                createBaseVNode("span", _hoisted_16, toDisplayString(unref(t)("classroom.filter.weekday")), 1),
                createBaseVNode("div", _hoisted_17, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(weekdayOptions), (w) => {
                    return openBlock(), createElementBlock("button", {
                      key: w.value,
                      onClick: ($event) => filters.value.weekday = w.value,
                      class: normalizeClass([
                        "px-3 py-1.5 rounded-full text-xs font-medium shrink-0",
                        Number(filters.value.weekday) === w.value ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant"
                      ])
                    }, toDisplayString(w.label), 11, _hoisted_18);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_19, [
                createBaseVNode("span", _hoisted_20, toDisplayString(unref(t)("classroom.filter.period")), 1),
                createBaseVNode("div", _hoisted_21, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(periodGroups, (group) => {
                    return createBaseVNode("div", {
                      key: group.key,
                      class: "classroom-period-row"
                    }, [
                      createBaseVNode("span", _hoisted_22, toDisplayString(group.label), 1),
                      createBaseVNode("div", _hoisted_23, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(group.periods, (p) => {
                          return openBlock(), createElementBlock("button", {
                            key: p.value,
                            onClick: ($event) => togglePeriod(p.value),
                            "aria-label": tr("classroom.period.aria", { n: p.value }),
                            title: tr("classroom.period.title", { n: p.value }),
                            class: normalizeClass([
                              "classroom-period-button px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1",
                              filters.value.periods.includes(p.value) ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant"
                            ])
                          }, [
                            filters.value.periods.includes(p.value) ? (openBlock(), createElementBlock("span", _hoisted_25, "check")) : createCommentVNode("", true),
                            createTextVNode(" " + toDisplayString(p.value), 1)
                          ], 10, _hoisted_24);
                        }), 128))
                      ])
                    ]);
                  }), 64))
                ])
              ]),
              createBaseVNode("div", _hoisted_26, [
                createBaseVNode("span", _hoisted_27, toDisplayString(resultCountLabel.value), 1),
                createBaseVNode("button", {
                  class: "text-primary text-xs font-medium flex items-center gap-1",
                  onClick: _cache[5] || (_cache[5] = ($event) => {
                    selectTimeRange("clear");
                    filters.value.building = "";
                    filters.value.week = "";
                  })
                }, [
                  _cache[9] || (_cache[9] = createBaseVNode("span", { class: "material-symbols-outlined text-[16px]" }, "filter_alt_off", -1)),
                  createTextVNode(" " + toDisplayString(unref(t)("classroom.filter.reset")), 1)
                ])
              ]),
              createBaseVNode("button", {
                class: "w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm active:scale-95 transition-transform disabled:opacity-60",
                onClick: handleManualQuery,
                disabled: loading.value
              }, toDisplayString(loading.value ? unref(t)("classroom.query.loading") : unref(t)("classroom.query.idle")), 9, _hoisted_28)
            ])
          ]),
          errorMsg.value ? (openBlock(), createElementBlock("div", _hoisted_29, toDisplayString(errorMsg.value), 1)) : createCommentVNode("", true),
          !errorMsg.value && showAvailabilityNotice.value ? (openBlock(), createElementBlock("div", _hoisted_30, toDisplayString(unref(t)(availabilityNoticeKey.value)), 1)) : createCommentVNode("", true),
          createBaseVNode("section", _hoisted_31, [
            hasSuccessfulQuery.value || classrooms.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_32, [
              createBaseVNode("span", null, [
                createTextVNode(toDisplayString(unref(t)("classroom.meta.datePrefix")), 1),
                createBaseVNode("strong", null, toDisplayString(queryDateLabel.value || unref(t)("classroom.meta.dateUnknown")), 1)
              ]),
              queryCalendarLabel.value ? (openBlock(), createElementBlock("span", _hoisted_33, toDisplayString(queryCalendarLabel.value), 1)) : createCommentVNode("", true),
              currentMeta.value.periods_str ? (openBlock(), createElementBlock("span", _hoisted_34, toDisplayString(currentMeta.value.periods_str), 1)) : createCommentVNode("", true),
              queryTimeLabel.value ? (openBlock(), createElementBlock("span", _hoisted_35, toDisplayString(unref(t)("classroom.meta.queryTimePrefix")) + toDisplayString(queryTimeLabel.value), 1)) : createCommentVNode("", true)
            ])) : createCommentVNode("", true),
            hasSuccessfulQuery.value && resultTruncated.value ? (openBlock(), createElementBlock("div", _hoisted_36, toDisplayString(tr("classroom.result.truncated", { loaded: currentMeta.value.loaded ?? classrooms.value.length, total: currentMeta.value.total ?? classrooms.value.length })), 1)) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(displayedClassrooms.value, (room) => {
              return openBlock(), createElementBlock("div", {
                key: room.id,
                class: "bg-surface-container-lowest rounded-[24px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.03)] border border-outline-variant/10 flex flex-col gap-3 relative overflow-hidden"
              }, [
                _cache[12] || (_cache[12] = createBaseVNode("div", { class: "absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-success-teal/10 to-transparent rounded-bl-full pointer-events-none" }, null, -1)),
                createBaseVNode("div", _hoisted_37, [
                  createBaseVNode("div", _hoisted_38, [
                    createBaseVNode("h3", _hoisted_39, [
                      createTextVNode(toDisplayString(room.name) + " ", 1),
                      isPeriodVerified.value ? (openBlock(), createElementBlock("span", _hoisted_40, toDisplayString(unref(t)("classroom.badge.free")), 1)) : (openBlock(), createElementBlock("span", _hoisted_41, toDisplayString(unref(t)(roomBadgeKey.value)), 1))
                    ]),
                    createBaseVNode("span", _hoisted_42, toDisplayString(room.type || room.campus), 1)
                  ]),
                  createBaseVNode("div", _hoisted_43, [
                    createBaseVNode("span", _hoisted_44, toDisplayString(room.seats), 1),
                    createBaseVNode("span", _hoisted_45, toDisplayString(unref(t)("classroom.card.seats")), 1)
                  ])
                ]),
                createBaseVNode("div", _hoisted_46, [
                  room.building ? (openBlock(), createElementBlock("span", _hoisted_47, [
                    _cache[10] || (_cache[10] = createBaseVNode("span", { class: "material-symbols-outlined text-[14px]" }, "apartment", -1)),
                    createTextVNode(" " + toDisplayString(room.building), 1)
                  ])) : createCommentVNode("", true),
                  room.floor ? (openBlock(), createElementBlock("span", _hoisted_48, [
                    _cache[11] || (_cache[11] = createBaseVNode("span", { class: "material-symbols-outlined text-[14px]" }, "layers", -1)),
                    createTextVNode(" " + toDisplayString(tr("classroom.card.floor", { n: room.floor })), 1)
                  ])) : createCommentVNode("", true)
                ])
              ]);
            }), 128)),
            hasMoreClassrooms.value ? (openBlock(), createElementBlock("div", _hoisted_49, [
              createBaseVNode("button", {
                class: "px-6 py-2.5 rounded-full bg-surface-container-lowest border border-outline-variant/30 text-on-surface-variant text-xs font-medium active:scale-95 transition-transform",
                onClick: showMoreClassrooms
              }, toDisplayString(tr("classroom.more.load", { n: classrooms.value.length - displayLimit.value })), 1)
            ])) : createCommentVNode("", true),
            loading.value && classrooms.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_50, [
              _cache[13] || (_cache[13] = createBaseVNode("span", { class: "material-symbols-outlined animate-spin" }, "autorenew", -1)),
              createBaseVNode("span", _hoisted_51, toDisplayString(unref(t)("classroom.loading.more")), 1)
            ])) : createCommentVNode("", true),
            emptyMode.value === "verified-empty" ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 4,
              icon: "🏢",
              message: unref(t)("classroom.empty")
            }, null, 8, ["message"])) : emptyMode.value === "unverified-empty" ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 5,
              icon: "🏢",
              message: unref(t)("classroom.emptyUnverified")
            }, null, 8, ["message"])) : createCommentVNode("", true)
          ])
        ])
      ]);
    };
  }
};
const ClassroomView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-9905f3e4"]]);
export {
  ClassroomView as default
};
