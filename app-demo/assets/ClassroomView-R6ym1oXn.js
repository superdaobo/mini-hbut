import { _ as _export_sfc, f as fetchWithCache, a as axiosInstance, L as LONG_TTL, S as SHORT_TTL } from "./app-demo-CxKBY5JQ.js";
import { u as useAppSettings } from "./more-modules-CsUTdMqs.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import { w as watch, o as onMounted, m as onBeforeUnmount, c as createElementBlock, b as openBlock, q as createVNode, f as createCommentVNode, d as createBaseVNode, u as unref, a as ref, t as toDisplayString, n as normalizeClass, g as createTextVNode, F as Fragment, i as renderList, k as createBlock, e as computed } from "./vue-core-DdLVj9yW.js";
import "./runtime-bridge-apFQ0nCw.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
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
const _hoisted_8 = { class: "flex overflow-x-auto no-scrollbar gap-2 pb-1" };
const _hoisted_9 = ["onClick"];
const _hoisted_10 = { class: "flex items-center" };
const _hoisted_11 = { class: "flex overflow-x-auto no-scrollbar gap-2 pb-1" };
const _hoisted_12 = ["onClick"];
const _hoisted_13 = { class: "flex items-center" };
const _hoisted_14 = { class: "flex overflow-x-auto no-scrollbar gap-2 pb-1" };
const _hoisted_15 = ["onClick"];
const _hoisted_16 = { class: "flex items-start" };
const _hoisted_17 = { class: "classroom-period-groups" };
const _hoisted_18 = { class: "classroom-period-row-label" };
const _hoisted_19 = { class: "classroom-period-row-buttons" };
const _hoisted_20 = ["onClick", "aria-label", "title"];
const _hoisted_21 = {
  key: 0,
  class: "material-symbols-outlined text-[14px]"
};
const _hoisted_22 = { class: "mt-2 flex justify-between items-center pt-3 border-t border-surface-variant" };
const _hoisted_23 = { class: "text-on-surface-variant text-sm" };
const _hoisted_24 = ["disabled"];
const _hoisted_25 = {
  key: 0,
  class: "mx-4 px-4 py-3 rounded-xl bg-error-container/60 text-on-error-container text-sm text-center"
};
const _hoisted_26 = { class: "px-4 flex flex-col gap-3" };
const _hoisted_27 = {
  key: 0,
  class: "classroom-result-meta"
};
const _hoisted_28 = { key: 0 };
const _hoisted_29 = { class: "flex justify-between items-start" };
const _hoisted_30 = { class: "flex flex-col" };
const _hoisted_31 = { class: "text-lg font-bold text-on-surface flex items-center gap-2" };
const _hoisted_32 = { class: "text-secondary text-sm mt-1" };
const _hoisted_33 = { class: "flex flex-col items-end" };
const _hoisted_34 = { class: "text-primary text-xl font-bold" };
const _hoisted_35 = { class: "flex gap-2 mt-1" };
const _hoisted_36 = {
  key: 0,
  class: "px-2.5 py-1 rounded bg-surface-container flex items-center gap-1 text-on-surface-variant text-[10px] font-semibold"
};
const _hoisted_37 = {
  key: 1,
  class: "px-2.5 py-1 rounded bg-surface-container flex items-center gap-1 text-on-surface-variant text-[10px] font-semibold"
};
const _hoisted_38 = {
  key: 1,
  class: "py-4 flex justify-center"
};
const _hoisted_39 = {
  key: 2,
  class: "py-6 flex flex-col items-center justify-center gap-2 text-on-surface-variant"
};
const CLASSROOM_SNAPSHOT_SCHEMA = 1;
const CLASSROOM_SNAPSHOT_PREFIX = "hbu_classroom_snapshot_v1";
const CLASSROOM_SNAPSHOT_FRESH_MS = 60 * 1e3;
const CLASSROOM_AUTO_QUERY_COOLDOWN_MS = 20 * 1e3;
const CLASSROOM_DEFERRED_REFRESH_MS = 2500;
const _sfc_main = {
  __name: "ClassroomView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "logout"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const API_BASE = "/api";
    const appSettings = useAppSettings();
    const maxRetry = computed(() => appSettings.retry.classroom);
    const retryDelayMs = computed(() => appSettings.retryDelayMs);
    const loading = ref(false);
    const buildings = ref([]);
    const classrooms = ref([]);
    const displayLimit = ref(50);
    const errorMsg = ref("");
    const offline = ref(false);
    const syncTime = ref("");
    const currentMeta = ref({
      date_str: "",
      week: "",
      weekday_name: "",
      semester: ""
    });
    const hasSuccessfulQuery = ref(false);
    const displayedClassrooms = computed(() => classrooms.value.slice(0, displayLimit.value));
    const hasMoreClassrooms = computed(() => classrooms.value.length > displayLimit.value);
    const showMoreClassrooms = () => {
      displayLimit.value += 50;
    };
    const queryDateLabel = computed(() => String(currentMeta.value?.date_str || "").trim());
    const queryCalendarLabel = computed(() => {
      const week = String(currentMeta.value?.week || "").trim();
      const weekday = String(currentMeta.value?.weekday_name || "").trim();
      const parts = [];
      if (week) parts.push(week === "?" || /^第.+周$/.test(week) ? week : `第${week}周`);
      if (weekday) parts.push(weekday);
      return parts.join(" · ");
    });
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
    const toPositiveInt = (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };
    const readStoredScheduleMeta = () => {
      if (typeof localStorage === "undefined") return {};
      try {
        const raw = localStorage.getItem("hbu_schedule_meta");
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    };
    const calculateWeekFromStartDate = (startDateText) => {
      const text = String(startDateText || "").trim();
      if (!text) return 0;
      const start = new Date(text);
      if (Number.isNaN(start.getTime())) return 0;
      const now = /* @__PURE__ */ new Date();
      const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const begin = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const diffMs = current.getTime() - begin.getTime();
      if (diffMs < 0) return 1;
      return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1e3)) + 1;
    };
    const getPreferredCurrentWeek = () => {
      const meta = readStoredScheduleMeta();
      const storedWeek = toPositiveInt(meta?.current_week, 0);
      if (storedWeek > 0) return storedWeek;
      return toPositiveInt(calculateWeekFromStartDate(meta?.start_date), 0);
    };
    const resolveClassroomMeta = (meta = {}) => {
      const preferredWeek = getPreferredCurrentWeek();
      return {
        date_str: String(meta?.date_str || "").trim(),
        week: preferredWeek || String(meta?.week || "").trim(),
        weekday_name: String(meta?.weekday_name || "").trim(),
        semester: String(meta?.semester || "").trim()
      };
    };
    const selectCurrentWeek = () => {
      const preferredWeek = getPreferredCurrentWeek();
      if (preferredWeek > 0) {
        filters.value.week = "";
        currentMeta.value = resolveClassroomMeta(currentMeta.value);
      } else {
        filters.value.week = "";
      }
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
      const preferredWeek = getPreferredCurrentWeek();
      filters.value = {
        week: preferredWeek ? "" : String(snapshot.filters?.week || "").trim(),
        weekday: String(snapshot.filters?.weekday || "").trim(),
        periods: safeArray(snapshot.filters?.periods).map((item) => Number(item)).filter((item) => Number.isFinite(item)),
        building: String(snapshot.filters?.building || "").trim(),
        minSeats: String(snapshot.filters?.minSeats || "").trim(),
        maxSeats: String(snapshot.filters?.maxSeats || "").trim()
      };
      currentMeta.value = resolveClassroomMeta(snapshot.current_meta);
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
    const buildClassroomCacheKey = (studentId, payload) => {
      const week = payload.week ?? "auto";
      const weekday = payload.weekday ?? "auto";
      const periods = Array.isArray(payload.periods) && payload.periods.length ? payload.periods.join(",") : "auto";
      const building = encodeURIComponent(String(payload.building || "all")).slice(0, 48);
      const min = payload.min_seats ?? "";
      const max = payload.max_seats ?? "";
      return `classroom:${studentId}:w${week}:d${weekday}:p${periods}:b${building}:s${min}-${max}`;
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
    const weekOptions = Array.from({ length: 25 }, (_, i) => i + 1);
    const weekdayOptions = [
      { value: 1, label: "周一" },
      { value: 2, label: "周二" },
      { value: 3, label: "周三" },
      { value: 4, label: "周四" },
      { value: 5, label: "周五" },
      { value: 6, label: "周六" },
      { value: 7, label: "周日" }
    ];
    const periodOptions = [
      { value: 1, label: "第1节 (08:00-08:45)" },
      { value: 2, label: "第2节 (08:55-09:40)" },
      { value: 3, label: "第3节 (10:10-10:55)" },
      { value: 4, label: "第4节 (11:05-11:50)" },
      { value: 5, label: "第5节 (14:00-14:45)" },
      { value: 6, label: "第6节 (14:55-15:40)" },
      { value: 7, label: "第7节 (16:10-16:55)" },
      { value: 8, label: "第8节 (17:05-17:50)" },
      { value: 9, label: "第9节 (19:00-19:45)" },
      { value: 10, label: "第10节 (19:55-20:40)" },
      { value: 11, label: "第11节 (20:50-21:35)" }
    ];
    const periodGroups = [
      { key: "morning", label: "上午", periods: periodOptions.slice(0, 4) },
      { key: "afternoon", label: "下午", periods: periodOptions.slice(4, 8) },
      { key: "evening", label: "晚上", periods: periodOptions.slice(8, 11) }
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
          console.log("[Classroom] Buildings loaded:", buildings.value.length);
        } else {
          console.error("[Classroom] Buildings failed:", data);
          buildings.value = [];
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
      [8, 0, 8, 45],
      // 第1节: 8:00-8:45
      [8, 55, 9, 40],
      // 第2节: 8:55-9:40
      [10, 10, 10, 55],
      // 第3节: 10:10-10:55
      [11, 5, 11, 50],
      // 第4节: 11:05-11:50
      [14, 0, 14, 45],
      // 第5节: 14:00-14:45
      [14, 55, 15, 40],
      // 第6节: 14:55-15:40
      [16, 10, 16, 55],
      // 第7节: 16:10-16:55
      [17, 5, 17, 50],
      // 第8节: 17:05-17:50
      [19, 0, 19, 45],
      // 第9节: 19:00-19:45
      [19, 55, 20, 40],
      // 第10节: 19:55-20:40
      [20, 50, 21, 35]
      // 第11节: 20:50-21:35
    ];
    const buildPeriodRange = (start, end) => {
      const items = [];
      for (let i = start; i <= end; i += 1) items.push(i);
      return items;
    };
    const buildQueryPayload = (studentId = resolveStudentId()) => {
      const sid = String(studentId || "").trim();
      const preferredWeek = getPreferredCurrentWeek();
      const selectedWeek = filters.value.week ? parseInt(filters.value.week, 10) : preferredWeek || null;
      const payload = {
        student_id: sid,
        week: selectedWeek,
        weekday: filters.value.weekday ? parseInt(filters.value.weekday, 10) : null,
        periods: filters.value.periods.map((p) => parseInt(p, 10)).filter((p) => Number.isFinite(p)),
        building: filters.value.building,
        min_seats: filters.value.minSeats ? parseInt(filters.value.minSeats, 10) : null,
        max_seats: filters.value.maxSeats ? parseInt(filters.value.maxSeats, 10) : null
      };
      if (!payload.week) delete payload.week;
      if (!payload.weekday) delete payload.weekday;
      if (!payload.periods.length) delete payload.periods;
      if (!payload.building) delete payload.building;
      if (payload.min_seats == null || Number.isNaN(payload.min_seats)) delete payload.min_seats;
      if (payload.max_seats == null || Number.isNaN(payload.max_seats)) delete payload.max_seats;
      return payload;
    };
    const buildCurrentQueryFingerprint = (studentId = resolveStudentId()) => {
      const sid = String(studentId || "").trim();
      if (!sid) return "";
      return buildClassroomCacheKey(sid, buildQueryPayload(sid));
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
          if (period <= 4) return buildPeriodRange(period, 4);
          if (period <= 8) return buildPeriodRange(period, 8);
          return buildPeriodRange(period, 11);
        }
      }
      return [9, 10, 11];
    };
    const initLocalMeta = () => {
      const now = /* @__PURE__ */ new Date();
      const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      const dayIndex = now.getDay();
      const preferredWeek = getPreferredCurrentWeek();
      currentMeta.value = {
        date_str: now.toLocaleDateString(),
        week: preferredWeek || "?",
        weekday_name: days[dayIndex],
        semester: "加载中..."
      };
      if (!filters.value.weekday) {
        filters.value.weekday = dayIndex === 0 ? 7 : dayIndex;
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
        errorMsg.value = hasSuccessfulQuery.value ? "当前显示上次查询结果，请登录后刷新空教室。" : "未检测到登录状态，请先登录后再查询空教室";
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
        const cacheKey = buildClassroomCacheKey(sid, payload);
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
            currentMeta.value = resolveClassroomMeta(data.meta);
            if (!filters.value.week && !getPreferredCurrentWeek()) filters.value.week = data.meta.week;
            if (!filters.value.weekday) filters.value.weekday = data.meta.weekday;
            if (filters.value.periods.length === 0 && data.meta.periods) {
              filters.value.periods = data.meta.periods;
            }
          }
          writeClassroomSnapshot("query-success");
        } else {
          if (data?.need_login) {
            offline.value = true;
            errorMsg.value = hasSuccessfulQuery.value ? "会话已过期，当前显示上次查询结果，请重新登录后刷新。" : "会话已过期，请重新登录后再查询空教室。";
            return;
          }
          if (!preserveResults || !hasSuccessfulQuery.value) {
            classrooms.value = [];
          }
          errorMsg.value = data?.error || "查询失败";
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
            errorMsg.value = `系统预热中，自动重试 (${retryCount + 1}/${maxRetry.value})...`;
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
            errorMsg.value = hasSuccessfulQuery.value ? "服务器响应超时，当前显示上次查询结果，请稍后重试。" : "服务器响应超时，请手动刷新";
          }
        } else {
          errorMsg.value = hasSuccessfulQuery.value ? "连接服务器失败，当前显示上次查询结果。" : "连接服务器失败";
        }
      } finally {
        clearAbortController("query", signal);
        if (disposed || requestId !== latestRequestId) return;
        if (!errorMsg.value.includes("自动重试")) {
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
          title: "空教室",
          onBack: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("back"))
        }),
        offline.value ? (openBlock(), createElementBlock("div", _hoisted_2, " 当前显示为离线数据，更新于" + toDisplayString(unref(formatRelativeTime)(syncTime.value)), 1)) : createCommentVNode("", true),
        createBaseVNode("main", _hoisted_3, [
          createBaseVNode("section", _hoisted_4, [
            createBaseVNode("div", _hoisted_5, [
              createBaseVNode("button", {
                onClick: _cache[1] || (_cache[1] = ($event) => selectTimeRange("morning")),
                class: normalizeClass([
                  "py-2.5 rounded-lg text-xs font-medium transition-transform active:scale-95 flex items-center justify-center gap-1",
                  filters.value.periods.length > 0 && filters.value.periods.every((p) => p <= 4) ? "bg-primary-container text-on-primary-container border border-transparent shadow-[0_4px_15px_rgba(33,112,228,0.15)]" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30 shadow-[0_4px_15px_rgba(0,0,0,0.03)]"
                ])
              }, [..._cache[6] || (_cache[6] = [
                createBaseVNode("span", { class: "material-symbols-outlined text-[16px]" }, "wb_sunny", -1),
                createTextVNode(" 上午 ", -1)
              ])], 2),
              createBaseVNode("button", {
                onClick: _cache[2] || (_cache[2] = ($event) => selectTimeRange("afternoon")),
                class: normalizeClass([
                  "py-2.5 rounded-lg text-xs font-medium transition-transform active:scale-95 flex items-center justify-center gap-1",
                  filters.value.periods.length > 0 && filters.value.periods.every((p) => p >= 5 && p <= 8) ? "bg-primary-container text-on-primary-container border border-transparent shadow-[0_4px_15px_rgba(33,112,228,0.15)]" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30 shadow-[0_4px_15px_rgba(0,0,0,0.03)]"
                ])
              }, [..._cache[7] || (_cache[7] = [
                createBaseVNode("span", { class: "material-symbols-outlined text-[16px]" }, "routine", -1),
                createTextVNode(" 下午 ", -1)
              ])], 2),
              createBaseVNode("button", {
                onClick: _cache[3] || (_cache[3] = ($event) => selectTimeRange("evening")),
                class: normalizeClass([
                  "py-2.5 rounded-lg text-xs font-medium transition-transform active:scale-95 flex items-center justify-center gap-1",
                  filters.value.periods.length > 0 && filters.value.periods.every((p) => p >= 9) ? "bg-primary-container text-on-primary-container border border-transparent shadow-[0_4px_15px_rgba(33,112,228,0.15)]" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30 shadow-[0_4px_15px_rgba(0,0,0,0.03)]"
                ])
              }, [..._cache[8] || (_cache[8] = [
                createBaseVNode("span", { class: "material-symbols-outlined text-[16px]" }, "bedtime", -1),
                createTextVNode(" 晚上 ", -1)
              ])], 2)
            ]),
            createBaseVNode("div", _hoisted_6, [
              createBaseVNode("div", _hoisted_7, [
                _cache[9] || (_cache[9] = createBaseVNode("span", { class: "classroom-filter-label text-xs font-medium w-12 shrink-0" }, "楼栋", -1)),
                createBaseVNode("div", _hoisted_8, [
                  createBaseVNode("button", {
                    onClick: _cache[4] || (_cache[4] = ($event) => filters.value.building = ""),
                    class: normalizeClass([
                      "px-3 py-1.5 rounded-full text-xs font-medium shrink-0",
                      !filters.value.building ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant"
                    ])
                  }, "全部", 2),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(buildings.value.filter((b) => b.code), (b) => {
                    return openBlock(), createElementBlock("button", {
                      key: b.code,
                      onClick: ($event) => filters.value.building = b.name,
                      class: normalizeClass([
                        "px-3 py-1.5 rounded-full text-xs font-medium shrink-0",
                        filters.value.building === b.name ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant"
                      ])
                    }, toDisplayString(b.name), 11, _hoisted_9);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_10, [
                _cache[10] || (_cache[10] = createBaseVNode("span", { class: "classroom-filter-label text-xs font-medium w-12 shrink-0" }, "周次", -1)),
                createBaseVNode("div", _hoisted_11, [
                  createBaseVNode("button", {
                    onClick: selectCurrentWeek,
                    class: normalizeClass([
                      "px-3 py-1.5 rounded-full text-xs font-medium shrink-0",
                      !filters.value.week ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant"
                    ])
                  }, "本周" + toDisplayString(currentMeta.value.week ? `(第${currentMeta.value.week}周)` : ""), 3),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(weekOptions), (w) => {
                    return openBlock(), createElementBlock("button", {
                      key: w,
                      onClick: ($event) => filters.value.week = w,
                      class: normalizeClass([
                        "px-3 py-1.5 rounded-full text-xs font-medium shrink-0",
                        Number(filters.value.week) === w ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant"
                      ])
                    }, "第" + toDisplayString(w) + "周", 11, _hoisted_12);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_13, [
                _cache[11] || (_cache[11] = createBaseVNode("span", { class: "classroom-filter-label text-xs font-medium w-12 shrink-0" }, "星期", -1)),
                createBaseVNode("div", _hoisted_14, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(weekdayOptions, (w) => {
                    return createBaseVNode("button", {
                      key: w.value,
                      onClick: ($event) => filters.value.weekday = w.value,
                      class: normalizeClass([
                        "px-3 py-1.5 rounded-full text-xs font-medium shrink-0",
                        Number(filters.value.weekday) === w.value ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant"
                      ])
                    }, toDisplayString(w.label), 11, _hoisted_15);
                  }), 64))
                ])
              ]),
              createBaseVNode("div", _hoisted_16, [
                _cache[12] || (_cache[12] = createBaseVNode("span", { class: "classroom-filter-label text-xs font-medium w-12 shrink-0 pt-2" }, "节次", -1)),
                createBaseVNode("div", _hoisted_17, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(periodGroups, (group) => {
                    return createBaseVNode("div", {
                      key: group.key,
                      class: "classroom-period-row"
                    }, [
                      createBaseVNode("span", _hoisted_18, toDisplayString(group.label), 1),
                      createBaseVNode("div", _hoisted_19, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(group.periods, (p) => {
                          return openBlock(), createElementBlock("button", {
                            key: p.value,
                            onClick: ($event) => togglePeriod(p.value),
                            "aria-label": `第${p.value}节`,
                            title: p.label,
                            class: normalizeClass([
                              "classroom-period-button px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1",
                              filters.value.periods.includes(p.value) ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-lowest border border-outline-variant/50 text-on-surface-variant"
                            ])
                          }, [
                            filters.value.periods.includes(p.value) ? (openBlock(), createElementBlock("span", _hoisted_21, "check")) : createCommentVNode("", true),
                            createTextVNode(" " + toDisplayString(p.value), 1)
                          ], 10, _hoisted_20);
                        }), 128))
                      ])
                    ]);
                  }), 64))
                ])
              ]),
              createBaseVNode("div", _hoisted_22, [
                createBaseVNode("span", _hoisted_23, [
                  _cache[13] || (_cache[13] = createTextVNode(" 找到 ", -1)),
                  createBaseVNode("strong", null, toDisplayString(classrooms.value.length), 1),
                  _cache[14] || (_cache[14] = createTextVNode(" 个空教室 ", -1))
                ]),
                createBaseVNode("button", {
                  class: "text-primary text-xs font-medium flex items-center gap-1",
                  onClick: _cache[5] || (_cache[5] = ($event) => {
                    selectTimeRange("clear");
                    filters.value.building = "";
                    filters.value.week = "";
                  })
                }, [..._cache[15] || (_cache[15] = [
                  createBaseVNode("span", { class: "material-symbols-outlined text-[16px]" }, "filter_alt_off", -1),
                  createTextVNode(" 重置筛选 ", -1)
                ])])
              ]),
              createBaseVNode("button", {
                class: "w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm active:scale-95 transition-transform disabled:opacity-60",
                onClick: handleManualQuery,
                disabled: loading.value
              }, toDisplayString(loading.value ? "查询中..." : "查询空教室"), 9, _hoisted_24)
            ])
          ]),
          errorMsg.value ? (openBlock(), createElementBlock("div", _hoisted_25, toDisplayString(errorMsg.value), 1)) : createCommentVNode("", true),
          createBaseVNode("section", _hoisted_26, [
            hasSuccessfulQuery.value || classrooms.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_27, [
              createBaseVNode("span", null, [
                _cache[16] || (_cache[16] = createTextVNode("查询日期：", -1)),
                createBaseVNode("strong", null, toDisplayString(queryDateLabel.value || "未知日期"), 1)
              ]),
              queryCalendarLabel.value ? (openBlock(), createElementBlock("span", _hoisted_28, toDisplayString(queryCalendarLabel.value), 1)) : createCommentVNode("", true)
            ])) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(displayedClassrooms.value, (room) => {
              return openBlock(), createElementBlock("div", {
                key: room.id,
                class: "bg-surface-container-lowest rounded-[24px] p-5 shadow-[0_4px_15px_rgba(0,0,0,0.03)] border border-outline-variant/10 flex flex-col gap-3 relative overflow-hidden"
              }, [
                _cache[21] || (_cache[21] = createBaseVNode("div", { class: "absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-success-teal/10 to-transparent rounded-bl-full pointer-events-none" }, null, -1)),
                createBaseVNode("div", _hoisted_29, [
                  createBaseVNode("div", _hoisted_30, [
                    createBaseVNode("h3", _hoisted_31, [
                      createTextVNode(toDisplayString(room.name) + " ", 1),
                      _cache[17] || (_cache[17] = createBaseVNode("span", { class: "px-2 py-0.5 rounded-md bg-success-teal/10 text-success-teal text-[10px] font-semibold" }, "空闲", -1))
                    ]),
                    createBaseVNode("span", _hoisted_32, toDisplayString(room.type || room.campus), 1)
                  ]),
                  createBaseVNode("div", _hoisted_33, [
                    createBaseVNode("span", _hoisted_34, toDisplayString(room.seats), 1),
                    _cache[18] || (_cache[18] = createBaseVNode("span", { class: "text-on-surface-variant text-[10px] font-semibold" }, "座位数", -1))
                  ])
                ]),
                createBaseVNode("div", _hoisted_35, [
                  room.building ? (openBlock(), createElementBlock("span", _hoisted_36, [
                    _cache[19] || (_cache[19] = createBaseVNode("span", { class: "material-symbols-outlined text-[14px]" }, "apartment", -1)),
                    createTextVNode(" " + toDisplayString(room.building), 1)
                  ])) : createCommentVNode("", true),
                  room.floor ? (openBlock(), createElementBlock("span", _hoisted_37, [
                    _cache[20] || (_cache[20] = createBaseVNode("span", { class: "material-symbols-outlined text-[14px]" }, "layers", -1)),
                    createTextVNode(" " + toDisplayString(room.floor) + "层 ", 1)
                  ])) : createCommentVNode("", true)
                ])
              ]);
            }), 128)),
            hasMoreClassrooms.value ? (openBlock(), createElementBlock("div", _hoisted_38, [
              createBaseVNode("button", {
                class: "px-6 py-2.5 rounded-full bg-surface-container-lowest border border-outline-variant/30 text-on-surface-variant text-xs font-medium active:scale-95 transition-transform",
                onClick: showMoreClassrooms
              }, " 加载更多（还有 " + toDisplayString(classrooms.value.length - displayLimit.value) + " 间） ", 1)
            ])) : createCommentVNode("", true),
            loading.value && classrooms.value.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_39, [..._cache[22] || (_cache[22] = [
              createBaseVNode("span", { class: "material-symbols-outlined animate-spin" }, "autorenew", -1),
              createBaseVNode("span", { class: "text-xs font-medium" }, "正在加载更多教室...", -1)
            ])])) : createCommentVNode("", true),
            !loading.value && classrooms.value.length === 0 && !errorMsg.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 3,
              icon: "🏢",
              message: "当前条件下没有找到空教室"
            })) : createCommentVNode("", true)
          ])
        ])
      ]);
    };
  }
};
const ClassroomView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-ffc2e7bc"]]);
export {
  ClassroomView as default
};
