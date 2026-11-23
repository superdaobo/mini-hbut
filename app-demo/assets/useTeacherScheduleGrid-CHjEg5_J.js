import { a4 as normalizeSemester, a5 as buildTeacherScopedKey, a6 as normalizeScopeAccountId, a7 as canPersistTeacherState, a8 as fetchTeacherScheduleLists, a9 as asString, aa as stripTeacherHtml, ab as asNumber, ac as buildStableKey, ad as dedupeByStableKey, ae as asArray, af as asRecord, _ as _export_sfc, ag as fetchTeacherClassSchedule, ah as fetchTeacherRoomSchedule } from "./app-demo-D63SYrKg.js";
import { r as readStoredSemester, d as deriveSemesterByDate } from "./teacher_semesters-Cl97oR_n.js";
import { r as resolveTeacherSyncStatus, i as isTeacherOffline } from "./teacher_sync_status-But3HSMJ.js";
import { r as ref, h as computed, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, d as createCommentVNode, s as withKeys, w as withModifiers, e as normalizeStyle, n as normalizeClass, u as unref, x as watch, j as createBlock, l as withCtx, g as createTextVNode, F as Fragment, f as renderList, m as Transition } from "./vue-core-4L5yFbGc.js";
import { t as timeSchedule, M as MAX_PERIOD } from "./constants-BEIPv_h0.js";
import { u as useI18n } from "./more-modules-CjuZH60i.js";
import { l as getCourseEndPeriod, k as isValidCalendarDate, i as getCourseRealInterval, e as parseClockToMinute, q as getGridTotalHeight, r as intervalToGridRect, j as intervalsOverlap, s as buildScheduleTimeGeometry, u as buildOverflowConflictCourse, g as getCourseStyle } from "./eventTypes-BjJUfugq.js";
const teacherScheduleListsErrorKey = (kind) => `teacher.error.${kind}`;
const SCHEDULE_LISTS_SEMESTER_PATTERN = /^\d{4}-\d{4}-[12]$/;
const isValidScheduleListsSemester = (value) => SCHEDULE_LISTS_SEMESTER_PATTERN.test(value);
const resolveInitialScheduleListsSemester = (explicit) => {
  const normalized = normalizeSemester(explicit ?? "");
  if (isValidScheduleListsSemester(normalized)) return normalized;
  const stored = normalizeSemester(readStoredSemester());
  if (isValidScheduleListsSemester(stored)) return stored;
  return deriveSemesterByDate();
};
const normalizeScheduleClass = (value, index) => {
  const record = asRecord(value);
  const classNo = asString(record.classNo ?? record.bjbh);
  const className = stripTeacherHtml(record.className ?? record.bjmc);
  const encodeId = asString(record.encodeId);
  const semester = normalizeSemester(record.semester ?? record.xnxq);
  return {
    key: buildStableKey([encodeId, classNo, className, semester, index]),
    classNo,
    className,
    studentCount: asNumber(record.studentCount ?? record.bjrs) ?? null,
    enrollYear: asString(record.enrollYear ?? record.rxnf),
    campusId: asString(record.campusId ?? record.xqdm),
    departmentName: stripTeacherHtml(record.departmentName ?? record.yxmc),
    majorName: stripTeacherHtml(record.majorName ?? record.zymc),
    encodeId,
    semester,
    scheduleUrl: asString(record.scheduleUrl)
  };
};
const normalizeScheduleRoom = (value, index) => {
  const record = asRecord(value);
  const roomNo = asString(record.roomNo ?? record.jsbh);
  const roomName = stripTeacherHtml(record.roomName ?? record.jsmc);
  const buildingName = stripTeacherHtml(record.buildingName ?? record.jxlmc);
  return {
    key: buildStableKey([roomNo, roomName, buildingName, index]),
    roomNo,
    roomName,
    buildingId: asString(record.buildingId ?? record.jxldm),
    buildingName,
    campusName: stripTeacherHtml(record.campusName ?? record.xqmc),
    roomType: asString(record.roomType ?? record.jslx),
    capacity: asNumber(record.capacity ?? record.zdskrnrs) ?? null,
    encodeId: asString(record.encodeId),
    semester: asString(record.semester ?? record.xnxq),
    campusId: asString(record.campusId ?? record.xqdm)
  };
};
const normalizeScheduleListsPayload = (raw) => {
  const payload = asRecord(raw);
  const classes = dedupeByStableKey(
    asArray(payload.classes).map(normalizeScheduleClass),
    (item) => item.key
  );
  const rooms = dedupeByStableKey(
    asArray(payload.rooms).map(normalizeScheduleRoom),
    (item) => item.key
  );
  const sourceRecord = asRecord(payload.scheduleSource);
  return {
    classes,
    classTotal: asNumber(payload.classTotal) ?? classes.length,
    rooms,
    roomTotal: asNumber(payload.roomTotal) ?? rooms.length,
    scheduleSource: {
      kind: asString(sourceRecord.kind),
      pagePath: asString(sourceRecord.pagePath),
      reason: stripTeacherHtml(sourceRecord.reason),
      requiresParams: asArray(sourceRecord.requiresParams).map((item) => asString(item))
    }
  };
};
const SCHEDULE_LISTS_CACHE_TTL_MS = 5 * 60 * 1e3;
const scheduleListsSnapshots = /* @__PURE__ */ new Map();
const SCHEDULE_LISTS_SNAPSHOT_MAX_ENTRIES = 32;
const readScheduleListsSnapshot = (key, now = Date.now()) => {
  const snapshot = scheduleListsSnapshots.get(key);
  if (!snapshot) return null;
  const syncedAtMs = Date.parse(snapshot.syncedAt);
  const stale = !Number.isFinite(syncedAtMs) || now - syncedAtMs > SCHEDULE_LISTS_CACHE_TTL_MS;
  return { data: snapshot.data, syncedAt: snapshot.syncedAt, stale };
};
const writeScheduleListsSnapshot = (key, data, syncedAt) => {
  scheduleListsSnapshots.set(key, { syncedAt, data });
  while (scheduleListsSnapshots.size > SCHEDULE_LISTS_SNAPSHOT_MAX_ENTRIES) {
    const oldest = scheduleListsSnapshots.keys().next().value;
    if (oldest === void 0) break;
    scheduleListsSnapshots.delete(oldest);
  }
};
const SCHEDULE_RECENT_CLASS_LIMIT = 3;
const SCHEDULE_RECENT_STORAGE_PREFIX = "hbu_teacher_schedule_recent_classes";
const recentStorageKey = (accountId) => {
  const account = normalizeScopeAccountId(accountId);
  if (!account) return "";
  return `${SCHEDULE_RECENT_STORAGE_PREFIX}:${buildTeacherScopedKey(
    "scheduleRecent",
    account,
    "_"
  )}`;
};
const readRecentClasses = (key) => {
  if (!key) return [];
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, index) => normalizeScheduleClass(item, index)).filter((item) => item.classNo || item.className).slice(0, SCHEDULE_RECENT_CLASS_LIMIT);
  } catch {
    return [];
  }
};
const writeRecentClasses = (key, items) => {
  if (!key) return;
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(items));
  } catch {
  }
};
const scheduleListsEmptyError = () => ({ kind: "empty", message: "" });
const useTeacherScheduleLists = (options = {}) => {
  const semester = ref(resolveInitialScheduleListsSemester(options.initialSemester));
  const keyword = ref("");
  const state = ref({
    status: "idle",
    data: null,
    error: null
  });
  const requestSeq = ref(0);
  const lastSuccessfulSyncAt = ref("");
  const fromCache = ref(false);
  const snapshotStale = ref(false);
  const buildingFilter = ref("");
  const recentClasses = ref([]);
  const accountId = computed(() => normalizeScopeAccountId(options.accountId?.() ?? ""));
  const scopeKey = computed(
    () => buildTeacherScopedKey("scheduleLists", accountId.value, semester.value)
  );
  const snapshotKey = computed(
    () => canPersistTeacherState(accountId.value) ? scopeKey.value : ""
  );
  const classes = computed(() => state.value.data?.classes ?? []);
  const classTotal = computed(() => state.value.data?.classTotal ?? 0);
  const rooms = computed(() => {
    const list = state.value.data?.rooms ?? [];
    const filter = buildingFilter.value;
    const kw = keyword.value.trim().toLowerCase();
    let out = list;
    if (kw) {
      out = out.filter(
        (item) => item.roomName.toLowerCase().includes(kw) || item.roomNo.toLowerCase().includes(kw)
      );
    }
    if (filter) {
      out = out.filter((item) => item.buildingName === filter);
    }
    return out;
  });
  const allRooms = computed(() => state.value.data?.rooms ?? []);
  const roomTotal = computed(() => state.value.data?.roomTotal ?? 0);
  const scheduleSource = computed(
    () => state.value.data?.scheduleSource ?? null
  );
  const buildingChips = computed(() => {
    const counter = /* @__PURE__ */ new Map();
    for (const room of allRooms.value) {
      if (!room.buildingName) continue;
      counter.set(room.buildingName, (counter.get(room.buildingName) ?? 0) + 1);
    }
    return [...counter.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  });
  const isLoading = computed(() => state.value.status === "loading");
  const isEmpty = computed(() => state.value.status === "empty");
  const isReady = computed(() => state.value.status === "ready");
  const isError = computed(() => state.value.status === "error");
  const errorKey = computed(
    () => state.value.error ? teacherScheduleListsErrorKey(state.value.error.kind) : ""
  );
  const syncStatus = computed(
    () => resolveTeacherSyncStatus({
      phase: state.value.status,
      hasData: state.value.data !== null,
      fromCache: fromCache.value,
      stale: snapshotStale.value,
      hasSyncTime: Boolean(lastSuccessfulSyncAt.value),
      offline: isTeacherOffline(),
      errorKind: state.value.error?.kind ?? null
    })
  );
  const applySnapshot = (snapshot, stale) => {
    lastSuccessfulSyncAt.value = snapshot.syncedAt;
    fromCache.value = true;
    snapshotStale.value = stale;
    const empty = snapshot.data.classes.length === 0 && snapshot.data.rooms.length === 0;
    state.value = empty ? { status: "empty", data: null, error: scheduleListsEmptyError() } : { status: "ready", data: snapshot.data, error: null };
  };
  const revalidate = async (scope, account, key) => {
    const seq = ++requestSeq.value;
    const kw = keyword.value.trim();
    state.value = { status: "loading", data: state.value.data, error: null };
    const result = await fetchTeacherScheduleLists(
      { semester: semester.value, keyword: kw || void 0 },
      { scope: account }
    );
    if (seq !== requestSeq.value || scope !== scopeKey.value) return;
    if (kw !== keyword.value.trim()) return;
    if (result.status === "ready" && result.data) {
      const data = normalizeScheduleListsPayload(result.data);
      const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
      lastSuccessfulSyncAt.value = syncedAt;
      fromCache.value = false;
      snapshotStale.value = false;
      if (key && !kw) writeScheduleListsSnapshot(key, data, syncedAt);
      if (data.classes.length === 0 && data.rooms.length === 0) {
        state.value = { status: "empty", data: null, error: scheduleListsEmptyError() };
        return;
      }
      state.value = { status: "ready", data, error: null };
      return;
    }
    if (result.status === "empty") {
      lastSuccessfulSyncAt.value = (/* @__PURE__ */ new Date()).toISOString();
      fromCache.value = false;
      snapshotStale.value = false;
      state.value = { status: "empty", data: null, error: scheduleListsEmptyError() };
      return;
    }
    state.value = { status: "error", data: state.value.data, error: result.error };
  };
  const load = async (opts = {}) => {
    const scope = scopeKey.value;
    const account = accountId.value;
    const key = snapshotKey.value;
    if (!opts.force && !keyword.value.trim() && key) {
      const snapshot = readScheduleListsSnapshot(key);
      if (snapshot) {
        applySnapshot({ syncedAt: snapshot.syncedAt, data: snapshot.data }, snapshot.stale);
        if (!snapshot.stale) return;
      }
    }
    await revalidate(scope, account, key);
  };
  const setSemester = async (value) => {
    const next = normalizeSemester(value);
    if (!isValidScheduleListsSemester(next) || next === semester.value) return;
    semester.value = next;
    state.value = { status: "idle", data: null, error: null };
    lastSuccessfulSyncAt.value = "";
    fromCache.value = false;
    snapshotStale.value = false;
    buildingFilter.value = "";
    await load();
  };
  const setKeyword = async (value) => {
    const next = value.trim();
    if (next === keyword.value) return;
    keyword.value = next;
    await load();
  };
  const retry = () => load({ force: true });
  const setBuildingFilter = (name) => {
    const next = name.trim();
    buildingFilter.value = buildingFilter.value === next ? "" : next;
  };
  const loadRecentClasses = () => {
    recentClasses.value = readRecentClasses(recentStorageKey(accountId.value));
  };
  const recordRecentClass = (item) => {
    const entry = { ...item };
    const rest = recentClasses.value.filter(
      (old) => !(old.classNo === entry.classNo && old.className === entry.className)
    );
    recentClasses.value = [entry, ...rest].slice(0, SCHEDULE_RECENT_CLASS_LIMIT);
    writeRecentClasses(recentStorageKey(accountId.value), recentClasses.value);
  };
  return {
    semester,
    keyword,
    accountId,
    scopeKey,
    state,
    classes,
    classTotal,
    rooms,
    allRooms,
    roomTotal,
    scheduleSource,
    buildingChips,
    buildingFilter,
    recentClasses,
    isLoading,
    isEmpty,
    isReady,
    isError,
    errorKey,
    lastSuccessfulSyncAt,
    fromCache,
    snapshotStale,
    syncStatus,
    load,
    setSemester,
    setKeyword,
    setBuildingFilter,
    retry,
    loadRecentClasses,
    recordRecentClass
  };
};
const formatCooldownText = (value) => {
  const ms = Number(value || 0);
  if (ms <= 0) return "可立即同步";
  const sec = Math.ceil(ms / 1e3);
  if (sec < 60) return `${sec} 秒后可再次同步`;
  const min = Math.floor(sec / 60);
  const remain = sec % 60;
  return remain > 0 ? `${min}分${remain}秒后可再次同步` : `${min} 分钟后可再次同步`;
};
const buildLocationText = (course) => {
  const building = String(course?.building || "").trim();
  const room = String(course?.room_code || course?.room || "").trim();
  return [building, room].filter(Boolean).join(" ") || "未填写";
};
const buildCourseTimeText = (course) => {
  const weekday = Number(course?.weekday || 0);
  const period = Number(course?.period || 0);
  if (!weekday || !period) return "未填写";
  const endPeriod = getCourseEndPeriod(course);
  return `周${weekday} 第${period}-${endPeriod}节`;
};
const buildSingleCourseDetailText = (course) => {
  const lines = [
    `课程名称：${String(course?.name || "").trim() || "未填写"}`,
    `课程类型：${course?.is_custom ? "自定义课程" : "教务课程"}`,
    `教师：${String(course?.teacher || "").trim() || "未填写"}`,
    `地点：${buildLocationText(course)}`,
    `时间：${buildCourseTimeText(course)}`,
    `周次：${String(course?.weeks_text || "").trim() ? `${String(course?.weeks_text || "").trim()}周` : "未填写"}`,
    `学分：${String(course?.credit || "").trim() || "无"}`,
    `教学班：${String(course?.class_name || "").trim() || "无"}`
  ];
  if (course?.semester) {
    lines.push(`学期：${String(course.semester).trim()}`);
  }
  return lines.join("\n");
};
const buildConflictDetailText = (course) => {
  const conflicts = Array.isArray(course?.conflict_courses) ? course.conflict_courses : [];
  if (!conflicts.length) {
    return `课程名称：${String(course?.name || "").trim() || "未填写"}
冲突详情：无`;
  }
  const lines = ["冲突课程详情："];
  conflicts.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${String(item?.name || "").trim() || "未命名课程"}`);
    lines.push(`   类型：${item?.is_custom ? "自定义课程" : "教务课程"}`);
    lines.push(`   教师：${String(item?.teacher || "").trim() || "未填写"}`);
    lines.push(`   地点：${buildLocationText(item)}`);
    lines.push(`   时间：${buildCourseTimeText(item)}`);
    lines.push(`   周次：${String(item?.weeks_text || "").trim() ? `${String(item.weeks_text).trim()}周` : "未填写"}`);
  });
  return lines.join("\n");
};
const buildCourseDetailText = (course) => {
  if (!course) return "";
  if (course.is_conflict) {
    return buildConflictDetailText(course);
  }
  return buildSingleCourseDetailText(course);
};
const formatMinuteToClock = (value) => {
  const minute = Number(value);
  if (!Number.isFinite(minute) || minute < 0) return "";
  const total = Math.floor(minute);
  const hour = Math.floor(total / 60);
  if (hour > 23) return "";
  const rest = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
};
const copyTextWithFallback = async (text) => {
  const content = String(text || "").trim();
  if (!content) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      return true;
    }
  } catch {
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = content;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return true;
  } catch {
    return false;
  }
};
const _hoisted_1$2 = ["onKeydown"];
const _hoisted_2$2 = { class: "event-card__body" };
const _hoisted_3$2 = {
  key: 0,
  class: "event-card__name"
};
const _hoisted_4$2 = { class: "event-card__time" };
const _hoisted_5$2 = { class: "event-card__clock" };
const _hoisted_6$2 = {
  key: 0,
  class: "event-card__more"
};
const _hoisted_7$1 = {
  key: 1,
  class: "event-card__place"
};
const _sfc_main$2 = {
  __name: "ScheduleEventCard",
  props: {
    /** 渲染输入（ScheduleTimelineItem） */
    item: { type: Object, required: true },
    /** lane 布局结果（ScheduleLayoutSlot） */
    slot: { type: Object, required: true },
    /** 强制精简态（调用方按上下文收窄时使用） */
    compact: { type: Boolean, default: false }
  },
  emits: ["open-detail"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const widthPercent = computed(() => {
      const value = Number(props.slot?.widthPercent);
      return Number.isFinite(value) && value > 0 ? value : 100;
    });
    const heightPercent = computed(() => {
      const value = Number(props.slot?.heightPercent);
      return Number.isFinite(value) && value > 0 ? value : 0;
    });
    const isDense = computed(() => props.compact || !!props.slot?.collapsed);
    const isSingleLine = computed(() => isDense.value || heightPercent.value < 4);
    const showTimeRange = computed(() => !isSingleLine.value && widthPercent.value >= 48);
    const showPlace = computed(
      () => !isSingleLine.value && !!props.item?.subtitle && widthPercent.value >= 52 && heightPercent.value >= 10
    );
    const hiddenCount = computed(() => {
      const value = Number(props.slot?.hiddenCount);
      return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
    });
    const startText = computed(() => formatMinuteToClock(props.item?.startMinute));
    const endText = computed(() => formatMinuteToClock(props.item?.endMinute));
    const cardStyle = computed(() => {
      const slot = props.slot || {};
      const left = Number.isFinite(Number(slot.leftPercent)) ? Number(slot.leftPercent) : 0;
      const top = Number.isFinite(Number(slot.topPercent)) ? Number(slot.topPercent) : 0;
      return {
        top: `${top}%`,
        height: `${heightPercent.value}%`,
        // 左右各留 1px 缝隙，与相邻 lane / 课程卡保持可辨识的间隔
        left: `calc(${left}% + 1px)`,
        width: `calc(${widthPercent.value}% - 2px)`,
        "--event-accent": props.item?.color || "var(--event-accent-default, #2563eb)"
      };
    });
    const openDetail = () => emit("open-detail", props.item?.raw);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(["event-card", { "event-card--dense": isDense.value, "event-card--single-line": isSingleLine.value }]),
        style: normalizeStyle(cardStyle.value),
        role: "button",
        tabindex: "0",
        onClick: withModifiers(openDetail, ["stop"]),
        onKeydown: withKeys(withModifiers(openDetail, ["stop"]), ["enter"])
      }, [
        _cache[0] || (_cache[0] = createBaseVNode("span", {
          class: "event-card__bar",
          "aria-hidden": "true"
        }, null, -1)),
        createBaseVNode("div", _hoisted_2$2, [
          !isSingleLine.value ? (openBlock(), createElementBlock("div", _hoisted_3$2, toDisplayString(__props.item?.title), 1)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_4$2, [
            createBaseVNode("span", _hoisted_5$2, toDisplayString(showTimeRange.value ? `${startText.value} - ${endText.value}` : startText.value), 1),
            hiddenCount.value > 0 ? (openBlock(), createElementBlock("span", _hoisted_6$2, toDisplayString(`+${hiddenCount.value}`), 1)) : createCommentVNode("", true)
          ]),
          showPlace.value ? (openBlock(), createElementBlock("div", _hoisted_7$1, toDisplayString(__props.item?.subtitle), 1)) : createCommentVNode("", true)
        ])
      ], 46, _hoisted_1$2);
    };
  }
};
const ScheduleEventCard = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-72ae5165"]]);
const _hoisted_1$1 = ["aria-label"];
const _hoisted_2$1 = {
  class: "exam-card__badge",
  "aria-hidden": "true"
};
const _hoisted_3$1 = { class: "exam-card__body" };
const _hoisted_4$1 = {
  key: 0,
  class: "exam-card__name"
};
const _hoisted_5$1 = {
  key: 1,
  class: "exam-card__place"
};
const _hoisted_6$1 = { class: "exam-card__time" };
const _sfc_main$1 = {
  __name: "ScheduleExamCard",
  props: {
    /** 渲染输入（ScheduleTimelineItem，kind = exam） */
    item: { type: Object, required: true },
    /** lane 布局结果（ScheduleLayoutSlot） */
    slot: { type: Object, required: true }
  },
  emits: ["open-detail"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t } = useI18n();
    const exam = computed(() => props.item?.raw || {});
    const widthPercent = computed(() => {
      const value = Number(props.slot?.widthPercent);
      return Number.isFinite(value) && value > 0 ? value : 100;
    });
    const heightPercent = computed(() => {
      const value = Number(props.slot?.heightPercent);
      return Number.isFinite(value) && value > 0 ? value : 0;
    });
    const isDense = computed(() => !!props.slot?.collapsed);
    const isCompact = computed(() => heightPercent.value < 10);
    const isSingleLine = computed(() => heightPercent.value < 3);
    const titleText = computed(
      () => String(props.item?.title || "").trim() || t("schedule.exam.unnamedCourse")
    );
    const locationText = computed(() => String(exam.value?.location || "").trim());
    const timeText = computed(() => {
      if (exam.value?.timeTbd) return t("schedule.exam.timeTbd");
      return formatMinuteToClock(props.item?.startMinute) || t("schedule.exam.timeTbd");
    });
    const showPlace = computed(
      () => !isSingleLine.value && !isCompact.value && !!locationText.value && widthPercent.value >= 30
    );
    const cardStyle = computed(() => {
      const slot = props.slot || {};
      const left = Number.isFinite(Number(slot.leftPercent)) ? Number(slot.leftPercent) : 0;
      const top = Number.isFinite(Number(slot.topPercent)) ? Number(slot.topPercent) : 0;
      return {
        top: `${top}%`,
        height: `${heightPercent.value}%`,
        left: `calc(${left}% + 1px)`,
        width: `calc(${widthPercent.value}% - 2px)`
      };
    });
    const openDetail = () => emit("open-detail", exam.value);
    const onKeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.stopPropagation();
      if (event.key === " ") event.preventDefault();
      openDetail();
    };
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(["exam-card", {
          "exam-card--dense": isDense.value,
          "exam-card--compact": isCompact.value,
          "exam-card--single-line": isSingleLine.value,
          "exam-card--tbd": exam.value?.timeTbd
        }]),
        style: normalizeStyle(cardStyle.value),
        role: "button",
        tabindex: "0",
        "aria-label": `${unref(t)("schedule.exam.badge")} ${titleText.value}`,
        onClick: withModifiers(openDetail, ["stop"]),
        onKeydown: withModifiers(onKeydown, ["stop"])
      }, [
        createBaseVNode("span", _hoisted_2$1, toDisplayString(unref(t)("schedule.exam.badge")), 1),
        createBaseVNode("div", _hoisted_3$1, [
          !isSingleLine.value ? (openBlock(), createElementBlock("div", _hoisted_4$1, toDisplayString(titleText.value), 1)) : createCommentVNode("", true),
          showPlace.value ? (openBlock(), createElementBlock("div", _hoisted_5$1, toDisplayString(locationText.value), 1)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_6$1, toDisplayString(timeText.value), 1)
        ])
      ], 46, _hoisted_1$1);
    };
  }
};
const ScheduleExamCard = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-cdb93e33"]]);
const DEFAULT_EXAM_DURATION_MINUTES = 120;
const EXAM_TIME_TBD_START_MINUTE = 8 * 60;
const EXAM_TIME_TBD_END_MINUTE = 10 * 60;
const LAST_MINUTE_OF_DAY = 23 * 60 + 59;
const toText = (value) => {
  if (value === null || value === void 0) return "";
  return String(value).trim();
};
const pick = (source, keys) => {
  for (const key of keys) {
    if (source[key] !== void 0 && source[key] !== null && source[key] !== "") return source[key];
  }
  return void 0;
};
const normalizeClockText = (value) => toText(value).replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248)).replace(/[：]/g, ":").replace(/[～~—–－]/g, "-");
const extractClocks = (text) => {
  const clocks = [];
  const pattern = /(\d{1,2})\s*:\s*(\d{2})/g;
  let matched;
  while ((matched = pattern.exec(text)) !== null) {
    const hour = Number(matched[1]);
    const minute = Number(matched[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) continue;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;
    clocks.push(hour * 60 + minute);
  }
  return clocks;
};
function parseExamTimeRange(value) {
  const clocks = extractClocks(normalizeClockText(value));
  if (clocks.length === 0) return null;
  const startMinute = clocks[0];
  const rawEnd = clocks.length > 1 ? clocks[1] : startMinute + DEFAULT_EXAM_DURATION_MINUTES;
  const endMinute = Math.min(rawEnd, LAST_MINUTE_OF_DAY);
  if (endMinute <= startMinute) return null;
  return { startMinute, endMinute };
}
function normalizeExamDate(value) {
  const text = toText(value);
  if (!text) return "";
  const matched = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (!matched) return "";
  const year = matched[1];
  const month = String(Number(matched[2])).padStart(2, "0");
  const day = String(Number(matched[3])).padStart(2, "0");
  const iso = `${year}-${month}-${day}`;
  return isValidCalendarDate(iso) ? iso : "";
}
function normalizeScheduleExam(raw) {
  if (!raw || typeof raw !== "object") return null;
  const source = raw;
  const date = normalizeExamDate(pick(source, ["exam_date", "examDate", "date", "ksrq"]));
  if (!date) return null;
  const courseName = toText(pick(source, ["course_name", "courseName", "kcmc", "name"]));
  const location = toText(pick(source, ["location", "place", "room", "jsmc", "ksdd"]));
  const seatNo = toText(pick(source, ["seat_no", "seatNo", "seat_number", "zwh"]));
  const rawTime = toText(pick(source, ["exam_time", "examTime", "kssj", "time"]));
  const startTime = toText(pick(source, ["start_time", "startTime"]));
  const endTime = toText(pick(source, ["end_time", "endTime"]));
  const timeText = rawTime || (startTime && endTime ? `${startTime}-${endTime}` : startTime);
  const range = parseExamTimeRange(timeText);
  const explicitId = toText(pick(source, ["id", "exam_id", "examId"]));
  const id = explicitId || `exam:${date}:${courseName}:${timeText}:${location}`;
  return {
    id,
    courseName,
    date,
    startMinute: range ? range.startMinute : null,
    endMinute: range ? range.endMinute : null,
    timeText,
    timeTbd: range === null,
    location,
    seatNo
  };
}
function examDayIndexInWeek(date, weekDates) {
  const target = normalizeExamDate(date);
  if (!target) return null;
  const dates = Array.isArray(weekDates) ? weekDates : [];
  for (let index = 0; index < dates.length; index += 1) {
    if (normalizeExamDate(dates[index]) === target) return index + 1;
  }
  return null;
}
const normalizeDayIndex = (value) => {
  const day = Number(value);
  if (!Number.isFinite(day)) return null;
  const truncated = Math.trunc(day);
  if (truncated < 1 || truncated > 7) return null;
  return truncated;
};
const toOptionalText = (value) => {
  if (value === null || value === void 0) return void 0;
  const text = String(value).trim();
  return text.length > 0 ? text : void 0;
};
const toMonthDayKey = (value) => {
  const text = String(value ?? "").trim();
  if (text.length === 0) return null;
  const matched = /(\d{1,4})\D+(\d{1,2})\D+(\d{1,2})/.exec(text);
  let month;
  let day;
  if (matched) {
    month = Number(matched[2]);
    day = Number(matched[3]);
  } else {
    const short = /^(\d{1,2})\D+(\d{1,2})$/.exec(text);
    if (!short) return null;
    month = Number(short[1]);
    day = Number(short[2]);
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${month}-${day}`;
};
function courseToTimelineItem(course, dayIndex, source, timeSchedule2) {
  if (!course || typeof course !== "object") return null;
  const day = normalizeDayIndex(dayIndex) ?? normalizeDayIndex(course.weekday);
  if (day === null) return null;
  const interval = getCourseRealInterval(
    Number(course._displayStart ?? course.period),
    Number(course._displaySpan ?? course.djs),
    timeSchedule2
  );
  if (interval === null) return null;
  const title = toOptionalText(course.name) ?? "";
  const subtitle = [toOptionalText(course.teacher), toOptionalText(course.room_code ?? course.room)].filter((part) => !!part).join(" · ");
  const id = toOptionalText(course._uid ?? course.id ?? course.source_id) ?? `${source}:${day}:${interval.startMinute}:${interval.endMinute}:${title}`;
  return {
    id,
    kind: "course",
    dayIndex: day,
    startMinute: interval.startMinute,
    endMinute: interval.endMinute,
    title,
    subtitle: subtitle.length > 0 ? subtitle : void 0,
    color: toOptionalText(course.color),
    source,
    raw: course
  };
}
function eventToTimelineItem(event, weekDates, dayIndexHint) {
  if (!event || typeof event !== "object") return null;
  const startMinute = parseClockToMinute(event.startTime);
  const endMinute = parseClockToMinute(event.endTime);
  if (startMinute === null || endMinute === null) return null;
  if (endMinute <= startMinute) return null;
  const dates = Array.isArray(weekDates) ? weekDates : [];
  const eventKey = toMonthDayKey(event.date);
  let day = null;
  if (eventKey !== null) {
    for (let i = 0; i < dates.length; i += 1) {
      if (toMonthDayKey(dates[i]) === eventKey) {
        day = i + 1;
        break;
      }
    }
  }
  if (day === null && dates.length === 0) {
    day = normalizeDayIndex(dayIndexHint);
  }
  if (day === null) return null;
  const title = toOptionalText(event.title) ?? "";
  const id = toOptionalText(event.id) ?? `personal-event:${day}:${startMinute}:${endMinute}:${title}`;
  return {
    id,
    kind: "event",
    dayIndex: day,
    startMinute,
    endMinute,
    title,
    subtitle: toOptionalText(event.location),
    color: toOptionalText(event.color),
    source: "personal-event",
    raw: event
  };
}
function examToTimelineItem(exam, weekDates, dayIndexHint) {
  if (!exam || typeof exam !== "object") return null;
  const dates = Array.isArray(weekDates) ? weekDates : [];
  let day = examDayIndexInWeek(exam.date, dates);
  if (day === null && dates.length === 0) {
    day = normalizeDayIndex(dayIndexHint);
  }
  if (day === null) return null;
  const startMinute = exam.timeTbd ? EXAM_TIME_TBD_START_MINUTE : exam.startMinute;
  const endMinute = exam.timeTbd ? EXAM_TIME_TBD_END_MINUTE : exam.endMinute;
  if (startMinute === null || endMinute === null) return null;
  if (endMinute <= startMinute) return null;
  const title = toOptionalText(exam.courseName) ?? "";
  return {
    id: toOptionalText(exam.id) ?? `exam:${exam.date}:${startMinute}:${endMinute}:${title}`,
    kind: "exam",
    dayIndex: day,
    startMinute,
    endMinute,
    title,
    subtitle: toOptionalText(exam.location),
    source: "exam",
    raw: exam
  };
}
const DEFAULT_MAX_LANES = 3;
const MIN_LANE_WIDTH_PERCENT = 20;
const COMPACT_WIDTH_PERCENT = 30;
const COURSE_LANE_WEIGHT = 1.6;
const MIN_COURSE_REGION_PERCENT = 50;
const clampNumber = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};
const compareEntries = (a, b) => {
  if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute;
  if (a.endMinute !== b.endMinute) return a.endMinute - b.endMinute;
  if (a.kind !== b.kind) return kindRank(a.kind) - kindRank(b.kind);
  const idA = String(a.id ?? "");
  const idB = String(b.id ?? "");
  if (idA < idB) return -1;
  if (idA > idB) return 1;
  return 0;
};
const kindRank = (kind) => {
  if (kind === "course") return 0;
  if (kind === "exam") return 1;
  return 2;
};
const isBeforeVisibleRange = (item, geometry) => {
  if (!geometry?.valid || !Number.isFinite(geometry.firstMinute) || !Number.isFinite(geometry.lastMinute) || geometry.lastMinute <= geometry.firstMinute || !Number.isFinite(item?.startMinute) || !Number.isFinite(item?.endMinute) || item.endMinute <= item.startMinute) {
    return true;
  }
  return item.endMinute <= geometry.firstMinute;
};
const isAfterVisibleRange = (item, geometry) => {
  if (!geometry?.valid || !Number.isFinite(item?.startMinute) || !Number.isFinite(item?.endMinute) || item.endMinute <= item.startMinute) {
    return false;
  }
  return item.startMinute >= geometry.lastMinute;
};
function splitOutOfRangeEvents(items, geometry) {
  const before = [];
  const after = [];
  const inRange = [];
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    if (!item) continue;
    if (isBeforeVisibleRange(item, geometry)) {
      before.push(item);
    } else if (isAfterVisibleRange(item, geometry)) {
      after.push(item);
    } else {
      inRange.push(item);
    }
  }
  return { before, after, inRange };
}
const assignLanes = (entries) => {
  const lanes = [];
  for (const entry of entries) {
    let placed = false;
    for (const lane of lanes) {
      const last = lane[lane.length - 1];
      if (!intervalsOverlap(
        last.item.startMinute,
        last.item.endMinute,
        entry.item.startMinute,
        entry.item.endMinute
      )) {
        lane.push(entry);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([entry]);
  }
  return lanes;
};
const courseRegionPercent = (courseLanes, eventLanes) => {
  if (courseLanes <= 0) return 0;
  if (eventLanes <= 0) return 100;
  const weighted = COURSE_LANE_WEIGHT * courseLanes;
  const raw = 100 * weighted / (eventLanes + weighted);
  return clampNumber(raw, MIN_COURSE_REGION_PERCENT, 100);
};
function layoutTimelineItems(items, geometry, options) {
  const result = { slots: [], overflowGroups: [] };
  const list = Array.isArray(items) ? items.filter((item) => !!item) : [];
  if (list.length === 0) return result;
  const totalHeight = getGridTotalHeight(geometry);
  if (!geometry?.valid || totalHeight <= 0) return result;
  const laneLimit = DEFAULT_MAX_LANES;
  const entries = [];
  for (const item of list) {
    if (isBeforeVisibleRange(item, geometry) || isAfterVisibleRange(item, geometry)) continue;
    const rect = intervalToGridRect(item.startMinute, item.endMinute, geometry);
    if (!rect) continue;
    entries.push({
      item,
      topPercent: rect.top / totalHeight * 100,
      heightPercent: rect.height / totalHeight * 100
    });
  }
  if (entries.length === 0) return result;
  entries.sort((a, b) => compareEntries(a.item, b.item));
  const clusters = [];
  let current = null;
  for (const entry of entries) {
    if (current && !intervalsOverlap(
      entry.item.startMinute,
      entry.item.endMinute,
      current.startMinute,
      current.endMinute
    )) {
      clusters.push(current);
      current = null;
    }
    if (!current) {
      current = {
        entries: [],
        startMinute: entry.item.startMinute,
        endMinute: entry.item.endMinute
      };
    }
    current.entries.push(entry);
    current.endMinute = Math.max(current.endMinute, entry.item.endMinute);
  }
  if (current) clusters.push(current);
  for (const cluster of clusters) {
    const courseLanes = assignLanes(cluster.entries.filter((entry) => entry.item.kind === "course"));
    const eventLanes = assignLanes(cluster.entries.filter((entry) => entry.item.kind !== "course"));
    let visibleCourse = Math.min(courseLanes.length, laneLimit);
    let visibleEvent = Math.min(eventLanes.length, laneLimit - visibleCourse);
    while (visibleCourse + visibleEvent > 0) {
      const region2 = courseRegionPercent(visibleCourse, visibleEvent);
      const widths = [];
      if (visibleCourse > 0) widths.push(region2 / visibleCourse);
      if (visibleEvent > 0) widths.push((100 - region2) / visibleEvent);
      if (Math.min(...widths) >= MIN_LANE_WIDTH_PERCENT) break;
      if (visibleEvent > 0) visibleEvent -= 1;
      else visibleCourse -= 1;
    }
    const region = courseRegionPercent(visibleCourse, visibleEvent);
    const courseWidth = visibleCourse > 0 ? region / visibleCourse : 0;
    const eventWidth = visibleEvent > 0 ? (100 - region) / visibleEvent : 0;
    const courseLaneIndex = /* @__PURE__ */ new Map();
    courseLanes.forEach((lane, index) => lane.forEach((entry) => courseLaneIndex.set(entry, index)));
    const eventLaneIndex = /* @__PURE__ */ new Map();
    eventLanes.forEach((lane, index) => lane.forEach((entry) => eventLaneIndex.set(entry, index)));
    const clusterSlotStart = result.slots.length;
    const hiddenEntries = [];
    for (const entry of cluster.entries) {
      const courseIndex = courseLaneIndex.get(entry);
      if (courseIndex !== void 0) {
        if (courseIndex >= visibleCourse) {
          hiddenEntries.push(entry);
          continue;
        }
        result.slots.push({
          item: entry.item,
          leftPercent: courseIndex * courseWidth,
          widthPercent: courseWidth,
          topPercent: entry.topPercent,
          heightPercent: entry.heightPercent,
          collapsed: courseWidth < COMPACT_WIDTH_PERCENT,
          hiddenCount: 0
        });
        continue;
      }
      const eventIndex = eventLaneIndex.get(entry);
      if (eventIndex === void 0 || eventIndex >= visibleEvent) {
        hiddenEntries.push(entry);
        continue;
      }
      result.slots.push({
        item: entry.item,
        leftPercent: region + eventIndex * eventWidth,
        widthPercent: eventWidth,
        topPercent: entry.topPercent,
        heightPercent: entry.heightPercent,
        collapsed: eventWidth < COMPACT_WIDTH_PERCENT,
        hiddenCount: 0
      });
    }
    if (hiddenEntries.length > 0) {
      for (let i = clusterSlotStart; i < result.slots.length; i += 1) {
        result.slots[i].hiddenCount = hiddenEntries.length;
      }
      result.overflowGroups.push({
        dayIndex: hiddenEntries[0].item.dayIndex,
        topPercent: Math.min(...hiddenEntries.map((entry) => entry.topPercent)),
        hiddenCount: hiddenEntries.length,
        items: hiddenEntries.map((entry) => entry.item)
      });
    }
  }
  return result;
}
function gridYToMinute(y, geometry) {
  if (!Number.isFinite(y)) return null;
  const rows = geometry?.rows ?? [];
  const totalHeight = getGridTotalHeight(geometry);
  if (!geometry?.valid || rows.length === 0 || totalHeight <= 0) return null;
  const clampedY = clampNumber(y, 0, totalHeight);
  let row = rows[0];
  for (let i = 0; i < rows.length; i += 1) {
    if (clampedY >= rows[i].rowTop) row = rows[i];
    else break;
  }
  if (clampedY <= row.rowTop + row.periodBand) {
    const ratio = row.periodBand > 0 ? (clampedY - row.rowTop) / row.periodBand : 0;
    return row.startMinute + clampNumber(ratio, 0, 1) * (row.endMinute - row.startMinute);
  }
  const gapRatio = row.gapBand > 0 ? (clampedY - row.rowTop - row.periodBand) / row.gapBand : 0;
  return row.endMinute + clampNumber(gapRatio, 0, 1) * row.rawGapMinutes;
}
const normalizeSlots = (slots = timeSchedule) => (Array.isArray(slots) ? slots : []).map((slot) => {
  const startMinute = parseClockToMinute(slot?.start);
  const endMinute = parseClockToMinute(slot?.end);
  if (!Number.isFinite(slot?.p) || startMinute === null || endMinute === null || endMinute <= startMinute) {
    return null;
  }
  return {
    ...slot,
    p: Number(slot.p),
    startMinute,
    endMinute
  };
}).filter((slot) => !!slot).sort((a, b) => a.p - b.p);
const resolveClickedPeriod = (approximateMinute, slots = timeSchedule) => {
  const minute = Number(approximateMinute);
  const normalized = normalizeSlots(slots);
  if (!Number.isFinite(minute) || normalized.length === 0) return null;
  if (minute <= normalized[0].startMinute) return normalized[0].p;
  for (let index = 0; index < normalized.length; index += 1) {
    const slot = normalized[index];
    if (minute <= slot.endMinute) return slot.p;
    const next = normalized[index + 1];
    if (next && minute < next.startMinute) return next.p;
  }
  return normalized[normalized.length - 1].p;
};
const resolveCourseBlock = (period, slots = timeSchedule) => {
  const normalized = normalizeSlots(slots);
  if (normalized.length === 0) return null;
  const validPeriods = new Set(normalized.map((slot) => slot.p));
  const p = Number(period);
  if (!validPeriods.has(p)) return null;
  if (p >= 11 || !validPeriods.has(p % 2 === 0 ? p - 1 : p + 1)) {
    return { startPeriod: p, endPeriod: p, span: 1 };
  }
  const startPeriod = p % 2 === 0 ? p - 1 : p;
  const endPeriod = startPeriod + 1;
  if (!validPeriods.has(startPeriod) || !validPeriods.has(endPeriod)) {
    return { startPeriod: p, endPeriod: p, span: 1 };
  }
  return { startPeriod, endPeriod, span: 2 };
};
const courseBlockToGridRect = (startPeriod, endPeriod, totalPeriods = timeSchedule.length) => {
  const start = Number(startPeriod);
  const end = Number(endPeriod);
  const total = Number(totalPeriods);
  if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(total) || total <= 0 || start < 1 || end < start || end > total) {
    return null;
  }
  return {
    top: (start - 1) / total * 100,
    height: (end - start + 1) / total * 100
  };
};
const buildBlankTimeSelection = (approximateMinute, dayIndex, date, slots = timeSchedule) => {
  const normalized = normalizeSlots(slots);
  const period = resolveClickedPeriod(approximateMinute, slots);
  const block = period === null ? null : resolveCourseBlock(period, slots);
  if (!block) return null;
  const startSlot = normalized.find((slot) => slot.p === block.startPeriod);
  const endSlot = normalized.find((slot) => slot.p === block.endPeriod);
  if (!startSlot || !endSlot) return null;
  const day = Number(dayIndex);
  if (!Number.isInteger(day) || day < 1 || day > 7) return null;
  return {
    dayIndex: day,
    date: String(date || ""),
    startPeriod: block.startPeriod,
    endPeriod: block.endPeriod,
    span: block.span,
    startMinute: startSlot.startMinute,
    endMinute: endSlot.endMinute,
    startTime: formatMinuteToClock(startSlot.startMinute),
    endTime: formatMinuteToClock(endSlot.endMinute)
  };
};
const isSameBlankTimeSelection = (left, right) => !!left && !!right && left.dayIndex === right.dayIndex && left.date === right.date && left.startPeriod === right.startPeriod && left.endPeriod === right.endPeriod;
const _hoisted_1 = { class: "date-header" };
const _hoisted_2 = { class: "month-col" };
const _hoisted_3 = { class: "month-num" };
const _hoisted_4 = {
  key: 0,
  class: "month-label"
};
const _hoisted_5 = { class: "days-row" };
const _hoisted_6 = {
  key: 0,
  class: "day-exam-dot",
  "aria-hidden": "true"
};
const _hoisted_7 = { class: "day-num" };
const _hoisted_8 = { class: "day-label" };
const _hoisted_9 = { class: "grid-body" };
const _hoisted_10 = { class: "time-axis" };
const _hoisted_11 = { class: "time-start" };
const _hoisted_12 = { class: "period-num" };
const _hoisted_13 = { class: "time-end" };
const _hoisted_14 = {
  class: "grid-lines",
  "aria-hidden": "true"
};
const _hoisted_15 = ["onClick"];
const _hoisted_16 = ["onClick"];
const _hoisted_17 = { class: "course-name" };
const _hoisted_18 = { class: "course-meta" };
const _hoisted_19 = { class: "course-room" };
const _hoisted_20 = {
  key: 0,
  class: "course-teacher"
};
const _hoisted_21 = {
  class: "blank-selection-layer",
  "aria-hidden": "true"
};
const _hoisted_22 = { class: "blank-time-selection-label" };
const _hoisted_23 = { class: "event-layer" };
const _hoisted_24 = ["onClick"];
const _hoisted_25 = ["onClick"];
const _hoisted_26 = ["onClick"];
const TAP_MOVE_THRESHOLD_PX = 8;
const _sfc_main = {
  __name: "ScheduleGrid",
  props: {
    weekDates: { type: Array, default: () => [] },
    currentMonth: { type: Number, default: 0 },
    selectedWeek: { type: Number, default: 0 },
    // #742a：周切换过渡方向（由 useScheduleSemester 按滑动/键盘方向设置）
    weekTransitionName: { type: String, default: "week-slide-left" },
    scheduleCourseCardStyle: { type: String, default: "modern" },
    courseCardRefreshNonce: { type: Number, default: 0 },
    getCoursesForDay: { type: Function, default: () => () => [] },
    getCourseStyle: { type: Function, default: () => ({}) },
    isWidgetHighlighted: { type: Function, default: () => false },
    // #837：该天的事件（camelCase 领域对象）。默认返回空数组 → 未接线时零改动
    getEventsForDay: { type: Function, default: () => () => [] },
    // 考试叠加层：该天的考试（camelCase 领域对象）。默认返回空数组 → 未接线时零改动
    getExamsForDay: { type: Function, default: () => () => [] },
    // #856：all | courses | events。筛选发生在 lane 输入层，不做 CSS 假隐藏。
    viewMode: { type: String, default: "all" },
    // #837：是否允许点击空白处快速创建（默认开启）
    enableBlankCreate: { type: Boolean, default: true },
    // #857：父层打开抽屉/弹窗时递增，清掉未确认的临时虚线框。
    selectionResetNonce: { type: Number, default: 0 }
  },
  emits: [
    "open-detail",
    "open-event-detail",
    "open-exam-detail",
    "confirm-blank-selection"
  ],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t } = useI18n();
    const percentGeometry = buildScheduleTimeGeometry(timeSchedule, 100 / MAX_PERIOD);
    const EMPTY_LAYOUT = { slots: [], overflowGroups: [] };
    const isTodayColumn = (dayIndex) => {
      const idx = Number(dayIndex) - 1;
      if (idx < 0 || idx > 6) return false;
      const date = props.weekDates[idx];
      return !!date?.isToday;
    };
    const periodRows = Array.from({ length: MAX_PERIOD }, (_, i) => i + 1);
    const weekIsoDates = computed(
      () => (Array.isArray(props.weekDates) ? props.weekDates : []).map((entry) => entry?.iso || "")
    );
    const showCourses = computed(() => props.viewMode !== "events");
    const showEvents = computed(() => props.viewMode !== "courses");
    const showExams = computed(() => props.viewMode !== "events");
    const showOverlayItems = computed(() => showEvents.value || showExams.value);
    const visibleCoursesForDay = (day) => {
      if (!showCourses.value) return [];
      const courses = props.getCoursesForDay(day);
      return Array.isArray(courses) ? courses : [];
    };
    const visibleEventsForDay = (day) => {
      if (!showEvents.value) return [];
      const events = props.getEventsForDay(day);
      return Array.isArray(events) ? events : [];
    };
    const visibleExamsForDay = (day) => {
      if (!showExams.value) return [];
      const exams = props.getExamsForDay(day);
      return Array.isArray(exams) ? exams : [];
    };
    const hasExamOnDay = (day) => visibleExamsForDay(day).length > 0;
    const courseKeyOf = (course) => String(course?._uid ?? course?.id ?? course?.source_id ?? "");
    const isSinglePeriodCourse = (course) => {
      const start = Number(course?._displayStart ?? course?.period) || 1;
      const span = Math.max(
        1,
        Math.min(MAX_PERIOD - start + 1, Number(course?._displaySpan ?? course?.djs) || 1)
      );
      return span === 1;
    };
    const collectTimelineItems = (day) => {
      const items = [];
      const courses = visibleCoursesForDay(day);
      if (Array.isArray(courses)) {
        for (const course of courses) {
          const item = courseToTimelineItem(
            course,
            day,
            course?.is_custom ? "custom-course" : "official",
            timeSchedule
          );
          if (item) items.push(item);
        }
      }
      const events = visibleEventsForDay(day);
      if (Array.isArray(events)) {
        for (const event of events) {
          const item = eventToTimelineItem(event, weekIsoDates.value, day);
          if (item) items.push(item);
        }
      }
      const exams = visibleExamsForDay(day);
      if (Array.isArray(exams)) {
        for (const exam of exams) {
          const item = examToTimelineItem(exam, weekIsoDates.value, day);
          if (item) items.push(item);
        }
      }
      return items;
    };
    const sortByStart = (list) => [...list].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
    const dayTimeline = computed(() => {
      const map = {};
      for (let day = 1; day <= 7; day += 1) {
        const items = collectTimelineItems(day);
        const { before, after } = splitOutOfRangeEvents(items, percentGeometry);
        map[day] = {
          layout: layoutTimelineItems(items, percentGeometry),
          before: sortByStart(before),
          after: sortByStart(after)
        };
      }
      return map;
    });
    const dayLayout = (day) => dayTimeline.value[day]?.layout || EMPTY_LAYOUT;
    const overlaySlots = (day) => dayLayout(day).slots.filter((slot) => slot.item.kind !== "course");
    const eventSlots = (day) => overlaySlots(day).filter((slot) => slot.item.kind === "event");
    const examSlots = (day) => overlaySlots(day).filter((slot) => slot.item.kind === "exam");
    const overflowGroups = (day) => showOverlayItems.value ? dayLayout(day).overflowGroups : [];
    const beforeEvents = (day) => dayTimeline.value[day]?.before || [];
    const afterEvents = (day) => dayTimeline.value[day]?.after || [];
    const courseSlotMap = computed(() => {
      const map = /* @__PURE__ */ new Map();
      for (let day = 1; day <= 7; day += 1) {
        const courses = visibleCoursesForDay(day);
        if (!Array.isArray(courses) || courses.length === 0) continue;
        const byId = /* @__PURE__ */ new Map();
        for (const slot of dayLayout(day).slots) {
          if (slot.item.kind === "course") byId.set(slot.item.id, slot);
        }
        if (byId.size === 0) continue;
        for (const course of courses) {
          const key = courseKeyOf(course);
          const slot = byId.get(key);
          if (slot) map.set(`${day}:${key}`, slot);
        }
      }
      return map;
    });
    const courseLaneStyle = (course, day) => {
      const slot = courseSlotMap.value.get(`${day}:${courseKeyOf(course)}`);
      if (!slot || slot.widthPercent >= 100) return null;
      const left = slot.leftPercent;
      const width = slot.widthPercent;
      return {
        width: `calc(${width}% - 2px)`,
        marginLeft: `calc(${left}% + 1px)`,
        marginRight: `calc(${100 - left - width}% + 1px)`
      };
    };
    const blankSelection = ref(null);
    const clearBlankSelection = () => {
      blankSelection.value = null;
    };
    watch(
      [
        () => props.selectedWeek,
        () => props.viewMode,
        () => props.selectionResetNonce,
        () => weekIsoDates.value.join("|")
      ],
      clearBlankSelection
    );
    const blankSelectionStyle = (day) => {
      const selection = blankSelection.value;
      if (!selection || selection.dayIndex !== Number(day)) return null;
      const rect = courseBlockToGridRect(selection.startPeriod, selection.endPeriod, MAX_PERIOD);
      if (!rect) return null;
      return {
        top: `${rect.top}%`,
        height: `${rect.height}%`
      };
    };
    const blankSelectionLabel = (day) => {
      const selection = blankSelection.value;
      if (!selection || selection.dayIndex !== Number(day)) return "";
      return selection.startPeriod === selection.endPeriod ? String(selection.startPeriod) : `${selection.startPeriod}–${selection.endPeriod}`;
    };
    let pointerOrigin = null;
    let tapMoved = false;
    const handleColumnPointerDown = (event) => {
      pointerOrigin = { x: event.clientX, y: event.clientY };
      tapMoved = false;
    };
    const handleColumnPointerUp = (event) => {
      const origin = pointerOrigin;
      pointerOrigin = null;
      if (!origin) return;
      tapMoved = Math.abs(event.clientX - origin.x) > TAP_MOVE_THRESHOLD_PX || Math.abs(event.clientY - origin.y) > TAP_MOVE_THRESHOLD_PX;
    };
    const handleColumnClick = (event, day) => {
      if (!props.enableBlankCreate || tapMoved) return;
      const target = event.target;
      if (target?.closest?.(".course-card, .event-card, .exam-card, .event-overflow-chip, .event-edge-indicator")) {
        clearBlankSelection();
        return;
      }
      const layer = event.currentTarget?.querySelector?.(".event-layer");
      const rect = layer?.getBoundingClientRect?.();
      if (!rect || rect.height <= 0) return;
      const offsetY = event.clientY - rect.top;
      if (offsetY < 0 || offsetY > rect.height) return;
      const approximate = gridYToMinute(
        offsetY / rect.height * getGridTotalHeight(percentGeometry),
        percentGeometry
      );
      if (approximate === null) return;
      const nextSelection = buildBlankTimeSelection(
        approximate,
        Number(day),
        props.weekDates?.[day - 1]?.iso || "",
        timeSchedule
      );
      if (!nextSelection) return;
      if (isSameBlankTimeSelection(blankSelection.value, nextSelection)) {
        clearBlankSelection();
        emit("confirm-blank-selection", nextSelection);
        return;
      }
      blankSelection.value = nextSelection;
    };
    const edgeHint = (list) => {
      const first = list[0];
      if (!first) return "";
      const clock = formatMinuteToClock(first.startMinute);
      const suffix = list.length > 1 ? ` +${list.length - 1}` : "";
      return `${clock} ${first.title || ""}${suffix}`.trim();
    };
    const openFirstEvent = (list) => {
      const first = Array.isArray(list) ? list[0] : null;
      if (!first) return;
      clearBlankSelection();
      if (first.kind === "exam") {
        emit("open-exam-detail", first.raw);
        return;
      }
      emit("open-event-detail", first.raw);
    };
    const openCourseDetail = (course) => {
      clearBlankSelection();
      emit("open-detail", course);
    };
    const openOverflowGroup = (group) => {
      const items = Array.isArray(group?.items) ? group.items : [];
      const hiddenCourseCount = items.filter((item) => item?.kind === "course" && item.raw).length;
      const synthetic = buildOverflowConflictCourse(
        group,
        t("schedule.grid.conflictOverflowTitle").replace("{n}", String(hiddenCourseCount)),
        t("schedule.grid.conflictHint"),
        Number(props.selectedWeek) || 0
      );
      if (synthetic) {
        openCourseDetail(synthetic);
        return;
      }
      openFirstEvent(items);
    };
    const openEventDetail = (raw) => {
      clearBlankSelection();
      emit("open-event-detail", raw);
    };
    const openExamDetail = (raw) => {
      clearBlankSelection();
      emit("open-exam-detail", raw);
    };
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Transition, {
        name: __props.weekTransitionName,
        mode: "out-in"
      }, {
        default: withCtx(() => [
          (openBlock(), createElementBlock("div", {
            class: "timetable-container",
            key: `week-${__props.selectedWeek}`
          }, [
            createBaseVNode("div", _hoisted_1, [
              createBaseVNode("div", _hoisted_2, [
                createBaseVNode("div", _hoisted_3, [
                  createTextVNode(toDisplayString(__props.currentMonth), 1),
                  unref(t)("schedule.grid.monthSuffix") ? (openBlock(), createElementBlock("span", _hoisted_4, toDisplayString(unref(t)("schedule.grid.monthSuffix")), 1)) : createCommentVNode("", true)
                ])
              ]),
              createBaseVNode("div", _hoisted_5, [
                (openBlock(), createElementBlock(Fragment, null, renderList(7, (day) => {
                  return createBaseVNode("div", {
                    key: day,
                    class: normalizeClass(["day-col", { "is-today": isTodayColumn(day) }])
                  }, [
                    hasExamOnDay(day) ? (openBlock(), createElementBlock("span", _hoisted_6)) : createCommentVNode("", true),
                    createBaseVNode("div", _hoisted_7, toDisplayString(__props.weekDates[day - 1]?.date || day), 1),
                    createBaseVNode("div", _hoisted_8, toDisplayString(__props.weekDates[day - 1]?.dayLabel || ""), 1)
                  ], 2);
                }), 64))
              ])
            ]),
            createBaseVNode("div", _hoisted_9, [
              createBaseVNode("div", _hoisted_10, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(timeSchedule), (t2) => {
                  return openBlock(), createElementBlock("div", {
                    key: t2.p,
                    class: "time-slot"
                  }, [
                    createBaseVNode("span", _hoisted_11, toDisplayString(t2.start), 1),
                    createBaseVNode("span", _hoisted_12, toDisplayString(t2.p), 1),
                    createBaseVNode("span", _hoisted_13, toDisplayString(t2.end), 1)
                  ]);
                }), 128))
              ]),
              (openBlock(), createElementBlock("div", {
                class: "courses-grid",
                key: `courses-grid-${__props.scheduleCourseCardStyle}-${__props.courseCardRefreshNonce}`
              }, [
                createBaseVNode("div", _hoisted_14, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(unref(periodRows), (i) => {
                    return openBlock(), createElementBlock("div", {
                      key: i,
                      class: "line-row"
                    });
                  }), 128))
                ]),
                (openBlock(), createElementBlock(Fragment, null, renderList(7, (day) => {
                  return createBaseVNode("div", {
                    key: day,
                    class: normalizeClass(["day-column", { "is-today-column": isTodayColumn(day) }]),
                    onPointerdown: handleColumnPointerDown,
                    onPointerup: handleColumnPointerUp,
                    onClick: ($event) => handleColumnClick($event, day)
                  }, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(visibleCoursesForDay(day), (course) => {
                      return openBlock(), createElementBlock("div", {
                        key: course._uid || course.id,
                        class: normalizeClass(["course-card", [
                          `course-card--${__props.scheduleCourseCardStyle}`,
                          { conflict: course.is_conflict },
                          { "course-card--single-period": isSinglePeriodCourse(course) },
                          { "widget-highlight": __props.isWidgetHighlighted(course, day) }
                        ]]),
                        style: normalizeStyle([__props.getCourseStyle(course), courseLaneStyle(course, day)]),
                        onClick: ($event) => openCourseDetail(course)
                      }, [
                        createBaseVNode("div", _hoisted_17, toDisplayString(course.name), 1),
                        createBaseVNode("div", _hoisted_18, [
                          createBaseVNode("div", _hoisted_19, toDisplayString(course.is_conflict ? unref(t)("schedule.grid.conflictHint") : course.room_code || course.room), 1),
                          __props.scheduleCourseCardStyle === "class" && !course.is_conflict ? (openBlock(), createElementBlock("div", _hoisted_20, toDisplayString(course.teacher || unref(t)("schedule.grid.noTeacher")), 1)) : createCommentVNode("", true)
                        ])
                      ], 14, _hoisted_16);
                    }), 128)),
                    createBaseVNode("div", _hoisted_21, [
                      blankSelectionStyle(day) ? (openBlock(), createElementBlock("div", {
                        key: 0,
                        class: "blank-time-selection",
                        style: normalizeStyle(blankSelectionStyle(day))
                      }, [
                        createBaseVNode("span", _hoisted_22, toDisplayString(blankSelectionLabel(day)), 1)
                      ], 4)) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_23, [
                      beforeEvents(day).length ? (openBlock(), createElementBlock("button", {
                        key: 0,
                        type: "button",
                        class: "event-edge-indicator event-edge-indicator--before",
                        onClick: withModifiers(($event) => openFirstEvent(beforeEvents(day)), ["stop"])
                      }, toDisplayString(`↑ ${edgeHint(beforeEvents(day))}`), 9, _hoisted_24)) : createCommentVNode("", true),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(eventSlots(day), (slot) => {
                        return openBlock(), createBlock(ScheduleEventCard, {
                          key: `event-${slot.item.id}`,
                          item: slot.item,
                          slot,
                          onOpenDetail: _cache[0] || (_cache[0] = ($event) => openEventDetail($event))
                        }, null, 8, ["item", "slot"]);
                      }), 128)),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(examSlots(day), (slot) => {
                        return openBlock(), createBlock(ScheduleExamCard, {
                          key: `exam-${slot.item.id}`,
                          item: slot.item,
                          slot,
                          onOpenDetail: _cache[1] || (_cache[1] = ($event) => openExamDetail($event))
                        }, null, 8, ["item", "slot"]);
                      }), 128)),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(overflowGroups(day), (group) => {
                        return openBlock(), createElementBlock("button", {
                          key: `overflow-${day}-${group.topPercent}`,
                          type: "button",
                          class: "event-overflow-chip",
                          style: normalizeStyle({ top: `${group.topPercent}%` }),
                          onClick: withModifiers(($event) => openOverflowGroup(group), ["stop"])
                        }, toDisplayString(`+${group.hiddenCount}`), 13, _hoisted_25);
                      }), 128)),
                      afterEvents(day).length ? (openBlock(), createElementBlock("button", {
                        key: 1,
                        type: "button",
                        class: "event-edge-indicator event-edge-indicator--after",
                        onClick: withModifiers(($event) => openFirstEvent(afterEvents(day)), ["stop"])
                      }, toDisplayString(`↓ ${edgeHint(afterEvents(day))}`), 9, _hoisted_26)) : createCommentVNode("", true)
                    ])
                  ], 42, _hoisted_15);
                }), 64))
              ]))
            ])
          ]))
        ]),
        _: 1
      }, 8, ["name"]);
    };
  }
};
const ScheduleGrid = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-e37844ff"]]);
const toGridCourse = (entry, semester, index) => {
  const rooms = Array.isArray(entry.roomNames) ? entry.roomNames.filter(Boolean) : [];
  const primaryRoom = entry.roomName || rooms[0] || "";
  const roomLabel = rooms.length > 1 ? `${primaryRoom} 等${rooms.length}间` : primaryRoom;
  const weekday = Number(entry.weekday) || 1;
  const period = Math.min(Math.max(Number(entry.startSection) || 1, 1), 11);
  const span = Math.max(1, Number(entry.spanSections) || 1);
  return {
    id: `${entry.classNo || "x"}-${weekday}-${period}-${index}`,
    name: entry.courseName || "",
    teacher: entry.teacherName || "",
    room: roomLabel,
    room_code: roomLabel,
    building: entry.buildingName || "",
    weekday,
    period,
    djs: span,
    weeks: Array.isArray(entry.weeks) ? entry.weeks : [],
    weeks_text: entry.weekText || "",
    credit: entry.credits != null ? String(entry.credits) : "",
    class_name: entry.classNo || "",
    semester,
    source_id: entry.classNo || "",
    roomNames: rooms.length > 0 ? rooms : primaryRoom ? [primaryRoom] : [],
    courseType: entry.courseType || ""
  };
};
const buildWeekDates = (anchor = /* @__PURE__ */ new Date()) => {
  const base = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const dow = base.getDay() === 0 ? 7 : base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - (dow - 1));
  const labels = ["一", "二", "三", "四", "五", "六", "日"];
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    const today = /* @__PURE__ */ new Date();
    return {
      iso,
      date: String(d.getDate()),
      month: d.getMonth() + 1,
      dayOfWeek: index + 1,
      // ScheduleGrid 读的是 dayLabel / isToday（见 ScheduleGrid.vue:404/77）
      dayLabel: labels[index],
      label: labels[index],
      isToday: d.toDateString() === today.toDateString()
    };
  });
};
const useTeacherScheduleGrid = () => {
  const kind = ref("class");
  const loading = ref(false);
  const error = ref("");
  const entries = ref([]);
  const semester = ref("");
  const selectedName = ref("");
  const lastLoadedAt = ref("");
  const selectedWeek = ref(0);
  const weekOptions = computed(() => {
    const all = /* @__PURE__ */ new Set();
    for (const course of courses.value) {
      for (const w of course.weeks) all.add(w);
    }
    return [...all].sort((a, b) => a - b);
  });
  const courses = computed(
    () => entries.value.map((entry, index) => toGridCourse(entry, semester.value, index))
  );
  const visibleCourses = computed(() => {
    const week = selectedWeek.value;
    if (!week) return courses.value;
    return courses.value.filter((course) => course.weeks.includes(week));
  });
  const coursesByDay = computed(() => {
    const map = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
    for (const course of visibleCourses.value) {
      const day = course.weekday >= 1 && course.weekday <= 7 ? course.weekday : 1;
      map[day].push(course);
    }
    for (const day of Object.keys(map)) {
      map[Number(day)].sort((a, b) => a.period - b.period);
    }
    return map;
  });
  const getCoursesForDay = (dayIndex) => {
    const day = Number(dayIndex);
    return coursesByDay.value[day] || [];
  };
  const getCourseStyleFor = (course) => getCourseStyle(course, "modern");
  const load = async (params) => {
    kind.value = params.kind;
    if (!params.encodeId) {
      error.value = "";
      entries.value = [];
      return;
    }
    loading.value = true;
    error.value = "";
    semester.value = params.semester || "";
    selectedName.value = params.displayName || "";
    try {
      const state = params.kind === "class" ? await fetchTeacherClassSchedule({
        encodeId: params.encodeId,
        semester: params.semester || void 0,
        campusId: params.campusId || void 0
      }) : await fetchTeacherRoomSchedule({
        encodeId: params.encodeId,
        semester: params.semester || void 0,
        campusId: params.campusId || void 0
      });
      if (state.error) {
        error.value = state.error.message || "加载失败";
        entries.value = [];
        return;
      }
      const payload = state.data || {};
      entries.value = Array.isArray(payload.entries) ? payload.entries : [];
      semester.value = String(payload.semester || semester.value || "");
      lastLoadedAt.value = (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", { hour12: false });
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      entries.value = [];
    } finally {
      loading.value = false;
    }
  };
  const reset = () => {
    entries.value = [];
    error.value = "";
    selectedName.value = "";
    lastLoadedAt.value = "";
  };
  return {
    kind,
    loading,
    error,
    entries,
    courses,
    coursesByDay,
    semester,
    selectedName,
    lastLoadedAt,
    getCoursesForDay,
    getCourseStyleFor,
    selectedWeek,
    weekOptions,
    visibleCourses,
    load,
    reset
  };
};
export {
  ScheduleGrid as S,
  formatMinuteToClock as a,
  buildCourseDetailText as b,
  copyTextWithFallback as c,
  buildWeekDates as d,
  useTeacherScheduleGrid as e,
  formatCooldownText as f,
  normalizeScheduleExam as n,
  useTeacherScheduleLists as u
};
