import { _ as _sfc_main$5 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-CSGuhC_h.js";
import { _ as _export_sfc, b as useLocale, z as tf, ak as looksLikeHtml, al as sanitizeSchoolInboxHtml, bY as linkifyPlainText, bX as TModal, q as showToast, c as useAuthStore } from "./app-demo-TQEQRs3d.js";
import { d as invokeNative } from "./runtime-bridge-DtTGpr5b.js";
import { T as TEmptyState } from "./TEmptyState-Q6txwufz.js";
import { o as onMounted, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, j as createBlock, d as createCommentVNode, F as Fragment, n as normalizeClass, f as renderList, g as createTextVNode, r as ref, h as computed, v as watch, p as createVNode, k as withCtx } from "./vue-core-CU1bwGIw.js";
import "./more-modules-DxXoZJOA.js";
import "./debug-tools-Csa71jvB.js";
import "./capture-DDnJhEie.js";
const QUIET_RESOURCES = Array.from({ length: 5 }, (_, i) => {
  const index = i + 1;
  return {
    id: `quiet_room-${index}`,
    app: "quiet_room",
    index,
    nameKey: "library.reserve.resource.quiet.name",
    locationKey: "library.reserve.resource.quiet.location",
    openFrom: "08:00",
    openTo: "21:30",
    capacityMin: 2,
    capacityMax: 6,
    noteKey: "library.reserve.resource.quiet.note"
  };
});
const SEMINAR_RESOURCES = Array.from({ length: 7 }, (_, i) => {
  const index = i + 1;
  const large = index === 7;
  return {
    id: `seminar_room-${index}`,
    app: "seminar_room",
    index,
    nameKey: "library.reserve.resource.seminar.name",
    locationKey: "library.reserve.resource.seminar.location",
    openFrom: "08:00",
    openTo: "21:00",
    capacityMin: large ? 6 : 2,
    capacityMax: large ? 30 : 8
  };
});
const RESOURCE_CATALOG = {
  quiet_room: QUIET_RESOURCES,
  seminar_room: SEMINAR_RESOURCES
};
const FALLBACK_ADVANCE_DAYS = 3;
const WEEKDAY_KEYS = [
  "library.reserve.weekday.0",
  "library.reserve.weekday.1",
  "library.reserve.weekday.2",
  "library.reserve.weekday.3",
  "library.reserve.weekday.4",
  "library.reserve.weekday.5",
  "library.reserve.weekday.6"
];
const pad2$1 = (n) => String(n).padStart(2, "0");
const toDateKey = (date) => `${date.getFullYear()}-${pad2$1(date.getMonth() + 1)}-${pad2$1(date.getDate())}`;
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const buildDateOptions = (advanceDays, now = /* @__PURE__ */ new Date()) => {
  const extra = Math.max(0, Math.floor(Number(advanceDays) || 0));
  const base = startOfDay(now);
  return Array.from({ length: extra + 1 }, (_, offset) => {
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    return { value: toDateKey(date), date, offset };
  });
};
const extractHm = (raw) => {
  const matched = String(raw ?? "").match(/(\d{1,2}):(\d{2})/);
  if (!matched) return "";
  return `${pad2$1(Number(matched[1]))}:${matched[2]}`;
};
const matchesDate = (raw, dateKey) => {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return false;
  const target = dateKey.replace(/\D/g, "");
  if (digits.length >= 8) return digits.slice(-8) === target;
  if (digits.length >= 4) return digits.slice(-4) === target.slice(-4);
  return false;
};
const buildSlotTimeRange = (dateKey) => {
  const day = String(dateKey ?? "").trim();
  if (!day) return { startTime: "", endTime: "" };
  return { startTime: `${day} 00:00`, endTime: `${day} 23:59` };
};
const asRecord$1 = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const toInt$1 = (value) => {
  if (value === null || value === void 0 || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const resolveSlotState = (item, openFrom, openTo) => {
  const status = toInt$1(item.status);
  if (status === 1) return "taken";
  const remaining = toInt$1(item.remaining);
  if (remaining !== null && remaining <= 0) return "taken";
  const start = extractHm(item.startTime);
  const end = extractHm(item.endTime);
  if (start && openFrom && start < openFrom) return "closed";
  if (end && openTo && end > openTo) return "closed";
  if (status !== null && status !== 0) return "closed";
  return "free";
};
const resolveControl = (fieldType) => {
  const t = fieldType.toLowerCase();
  if (/textarea|multi.?line|remark|comment/.test(t)) return "textarea";
  if (/radio/.test(t)) return "radio";
  if (/checkbox|multi.?select|tags/.test(t)) return "checkbox";
  if (/select|dropdown|combo|choose|enum/.test(t)) return "select";
  if (/number|int|digit|count|num|amount|people/.test(t)) return "number";
  if (/date/.test(t)) return "date";
  if (/time/.test(t)) return "time";
  return "text";
};
const resolveFormat = (fieldType) => {
  const t = fieldType.toLowerCase();
  if (/mail/.test(t)) return "email";
  if (/phone|mobile|tel/.test(t)) return "phone";
  return "";
};
const normalizeOptions = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (entry === null || entry === void 0) continue;
    if (typeof entry === "object") {
      const obj = entry;
      const value = obj.value ?? obj.id ?? obj.key ?? obj.code ?? obj.fieldValue ?? obj.label ?? obj.name;
      if (value === null || value === void 0 || String(value).trim() === "") continue;
      const label = obj.label ?? obj.name ?? obj.text ?? obj.title ?? obj.value ?? value;
      out.push({ value: String(value), label: String(label) });
    } else {
      out.push({ value: String(entry), label: String(entry) });
    }
  }
  return out;
};
const normalizeFormFields = (config) => {
  const cfg = asRecord$1(config);
  const parsed = cfg.parsed === true;
  const rawFields = Array.isArray(cfg.fields) ? cfg.fields : [];
  const fields = [];
  for (const entry of rawFields) {
    const raw = asRecord$1(entry);
    const key = String(raw.key ?? "").trim();
    if (!key) continue;
    const fieldType = String(raw.fieldType ?? "");
    const options = normalizeOptions(raw.options);
    const control = resolveControl(fieldType);
    const resolved = options.length > 0 && control === "text" ? "radio" : control;
    const defaultValue = raw.defaultValue;
    fields.push({
      key,
      label: String(raw.label ?? "").trim() || key,
      control: resolved,
      required: raw.required === true,
      placeholder: String(raw.placeholder ?? "").trim(),
      options,
      min: toInt$1(asRecord$1(raw.raw).min ?? raw.min),
      max: toInt$1(asRecord$1(raw.raw).max ?? raw.max),
      pattern: String(asRecord$1(raw.raw).pattern ?? raw.pattern ?? "").trim(),
      format: resolveFormat(fieldType),
      defaultValue: defaultValue === null || defaultValue === void 0 ? "" : Array.isArray(defaultValue) ? defaultValue.map((v) => String(v)).join(",") : String(defaultValue)
    });
  }
  return { fields, parsed };
};
const buildInitialValues = (fields) => {
  const values = {};
  for (const field of fields) {
    values[field.key] = field.control === "checkbox" ? field.defaultValue ? field.defaultValue.split(",").filter(Boolean) : [] : field.defaultValue;
  }
  return values;
};
const stringifyValue = (value) => Array.isArray(value) ? value.join(",") : String(value ?? "").trim();
const compilePattern = (pattern) => {
  if (!pattern) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
};
const validateFormValues = (fields, values) => {
  const errors = {};
  for (const field of fields) {
    const value = values[field.key];
    const text = stringifyValue(value);
    if (!text) {
      if (field.required) errors[field.key] = "library.reserve.form.required";
      continue;
    }
    if (field.control === "number") {
      const n = Number(text);
      if (!Number.isFinite(n)) {
        errors[field.key] = "library.reserve.form.number";
        continue;
      }
      if (field.min !== null && n < field.min) {
        errors[field.key] = "library.reserve.form.min";
        continue;
      }
      if (field.max !== null && n > field.max) {
        errors[field.key] = "library.reserve.form.max";
        continue;
      }
    }
    if (field.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      errors[field.key] = "library.reserve.form.email";
      continue;
    }
    if (field.format === "phone" && !/^[0-9+\-() ]{6,20}$/.test(text)) {
      errors[field.key] = "library.reserve.form.phone";
      continue;
    }
    const pattern = compilePattern(field.pattern);
    if (pattern && !pattern.test(text)) {
      errors[field.key] = "library.reserve.form.format";
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
};
const resolveFieldErrorLimit = (field, errorKey) => {
  if (errorKey === "library.reserve.form.max") return field.max;
  if (errorKey === "library.reserve.form.min") return field.min;
  return null;
};
const formatFieldErrorText = (field, errorKey, translate) => {
  if (!errorKey) return "";
  const text = translate(errorKey);
  const limit = resolveFieldErrorLimit(field, errorKey);
  if (limit === null || limit === void 0) return text;
  return text.split("{n}").join(String(limit));
};
const toFormData = (fields, values) => {
  const data = {};
  for (const field of fields) {
    const text = stringifyValue(values[field.key]);
    if (text) data[field.key] = text;
  }
  return data;
};
const summarizeFormValues = (fields, values) => fields.map((field) => ({ label: field.label, value: stringifyValue(values[field.key]) })).filter((row) => row.value !== "");
const normalizeSlot = (item, index, resource) => {
  const raw = asRecord$1(item);
  const hasFormConfig = raw.customFormConfig !== null && raw.customFormConfig !== void 0;
  const form = hasFormConfig ? normalizeFormFields(raw.customFormConfig) : { fields: [], parsed: true };
  const start = extractHm(raw.startTime);
  const end = extractHm(raw.endTime);
  return {
    id: `${raw.aprvId ?? raw.itemId ?? "slot"}-${index}`,
    aprvId: toInt$1(raw.aprvId),
    itemName: String(raw.itemName ?? "").trim(),
    date: String(raw.date ?? "").trim(),
    start,
    end,
    state: resolveSlotState(raw, resource.openFrom, resource.openTo),
    capacity: toInt$1(raw.capacity),
    remaining: toInt$1(raw.remaining),
    fields: form.fields,
    formParsed: form.parsed,
    raw
  };
};
const pickSelectedSlot = (slots, slotId) => slots.find((item) => item.id === slotId) || null;
const sortKeyOf = (value) => value.date ? `${value.date} ${value.start || "00:00"}` : "9999-99-99 99:99";
const pickRawString = (raw, keys) => {
  for (const key of keys) {
    const value = raw[key];
    if (value === null || value === void 0) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return void 0;
};
const RESERVE_ERROR_MESSAGE_KEYS = {
  chaoxing_not_logged_in: "library.reserve.error.notLoggedIn",
  no_permission: "library.reserve.error.noPermission",
  network_unreachable: "library.reserve.error.network",
  slot_unavailable: "library.reserve.error.slotUnavailable",
  reserve_limit_exceeded: "library.reserve.error.limit",
  reserve_suspended: "library.reserve.error.suspended",
  business_rejected: "library.reserve.error.business",
  invalid_params: "library.reserve.error.invalidParams",
  invalid_app: "library.reserve.error.business",
  unexpected_response: "library.reserve.error.unknown"
};
const parseReserveFailure = (error) => {
  const record = asRecord$1(error);
  const kind = typeof record.kind === "string" ? record.kind : "";
  const detail = typeof record.message === "string" && record.message.trim() ? record.message.trim() : error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return {
    kind,
    messageKey: RESERVE_ERROR_MESSAGE_KEYS[kind] ?? "",
    detail,
    network: kind === "network_unreachable"
  };
};
const stripHtml = (raw) => String(raw ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const toInt = (value) => {
  if (value === null || value === void 0 || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const toStr = (value) => value === null || value === void 0 ? "" : String(value).trim();
const toBool = (value) => {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
};
const pad2 = (n) => String(n).padStart(2, "0");
const SERVER_TZ_OFFSET_MINUTES = 8 * 60;
const DATE_TIME_PATTERN = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T ](\d{1,2}):(\d{1,2})/;
const buildClock = (y, mo, d, h, mi) => {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  if (!Number.isFinite(weekday)) return null;
  return {
    dateKey: `${y}-${pad2(mo)}-${pad2(d)}`,
    clock: `${pad2(h)}:${pad2(mi)}`,
    minutes: h * 60 + mi,
    weekday
  };
};
const parseSeatClock = (raw) => {
  const text = toStr(raw);
  if (!text || !/\d/.test(text)) return null;
  const matched = DATE_TIME_PATTERN.exec(text);
  if (matched) {
    return buildClock(
      Number(matched[1]),
      Number(matched[2]),
      Number(matched[3]),
      Number(matched[4]),
      Number(matched[5])
    );
  }
  if (/^\d{10,13}$/.test(text)) {
    const value = Number(text);
    const ms = text.length >= 13 ? value : value * 1e3;
    const shifted = new Date(ms + SERVER_TZ_OFFSET_MINUTES * 6e4);
    if (Number.isNaN(shifted.getTime())) return null;
    return buildClock(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth() + 1,
      shifted.getUTCDate(),
      shifted.getUTCHours(),
      shifted.getUTCMinutes()
    );
  }
  return null;
};
const toMinutes = (hm) => {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(extractHm(hm));
  if (!matched) return null;
  const h = Number(matched[1]);
  const m = Number(matched[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};
const resolveOpenState = (clock, range) => {
  if (!clock || !range) return "unknown";
  const start = toMinutes(range.start);
  const end = toMinutes(range.end);
  if (start === null && end === null) return "unknown";
  if (start !== null && clock.minutes < start) return "before";
  if (end !== null && clock.minutes >= end) return "after";
  return "open";
};
const resolveReleaseState = (clock, releaseTime) => {
  if (!clock) return "unknown";
  const at = toMinutes(releaseTime);
  if (at === null) return "unknown";
  return clock.minutes >= at ? "released" : "pending";
};
const DAY_PREFIXES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const resolveOpenHourRows = (config) => {
  const raw = config?.commonTimeConfig?.raw;
  if (raw && typeof raw === "object") {
    const record = raw;
    const rows = WEEKDAY_ORDER.map((weekday) => {
      const prefix = DAY_PREFIXES[weekday];
      return {
        key: prefix,
        weekday,
        label: "",
        start: extractHm(record[`${prefix}StartTime`]),
        end: extractHm(record[`${prefix}EndTime`])
      };
    }).filter((row) => row.start || row.end);
    if (rows.length) return rows;
  }
  return (config?.commonTimeConfig?.days ?? []).map((day, index) => ({
    key: `day-${index}`,
    weekday: null,
    label: day.day,
    start: day.start,
    end: day.end
  }));
};
const resolveTodayOpenRange = (config, clock) => {
  if (!clock) return null;
  const timeConfig = config?.commonTimeConfig ?? null;
  const raw = timeConfig?.raw;
  if (raw && typeof raw === "object") {
    const prefix = DAY_PREFIXES[clock.weekday];
    const start = extractHm(raw[`${prefix}StartTime`]);
    const end = extractHm(raw[`${prefix}EndTime`]);
    if (start || end) return { start, end };
  }
  const days = timeConfig?.days ?? [];
  if (!days.length) return null;
  if (days.length === 1) return { start: days[0].start, end: days[0].end };
  const first = days[0];
  const uniform = days.every((day) => day.start === first.start && day.end === first.end);
  return uniform ? { start: first.start, end: first.end } : null;
};
const normalizeSeatConfig = (raw) => {
  const record = asRecord(raw);
  const timeConfigRaw = record.commonTimeConfig;
  let commonTimeConfig = null;
  if (timeConfigRaw && typeof timeConfigRaw === "object") {
    const timeRecord = asRecord(timeConfigRaw);
    const days = Array.isArray(timeRecord.days) ? timeRecord.days.map((entry) => {
      const day = asRecord(entry);
      return {
        day: toStr(day.day),
        start: extractHm(day.start),
        end: extractHm(day.end)
      };
    }) : [];
    commonTimeConfig = { days, raw: timeRecord.raw };
  }
  return {
    seatId: toInt(record.seatId),
    deptId: toInt(record.deptId),
    name: toStr(record.name),
    reserveBeforeDay: toInt(record.reserveBeforeDay),
    reserveBeforeTime: extractHm(record.reserveBeforeTime),
    reserveDuration: toInt(record.reserveDuration),
    reserveNumLimit: toInt(record.reserveNumLimit),
    timeUnit: toInt(record.timeUnit),
    violateTimes: toInt(record.violateTimes),
    violationLimitDay: toInt(record.violationLimitDay),
    violationLimitDuration: toInt(record.violationLimitDuration),
    noticeName: toStr(record.noticeName),
    noticeContent: toStr(record.noticeContent),
    onlySupportsApiSignIn: toBool(record.onlySupportsApiSignIn),
    commonTimeConfig
  };
};
const normalizeSeatReservation = (raw, index) => {
  const record = asRecord(raw);
  const id = toStr(record.id);
  return {
    key: `seat-${id || "row"}-${index}`,
    id,
    seatNo: toStr(record.seatNo),
    roomName: toStr(record.roomName),
    date: toStr(record.date),
    start: extractHm(record.startTime),
    end: extractHm(record.endTime),
    statusName: toStr(record.statusName)
  };
};
const normalizeSeatReservations = (list) => {
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => normalizeSeatReservation(item, index)).sort((a, b) => sortKeyOf(a).localeCompare(sortKeyOf(b)));
};
const seatReservationTime = (row) => {
  if (row.start && row.end) return `${row.start}-${row.end}`;
  return row.start || row.end || "";
};
const _hoisted_1$4 = { class: "panel" };
const _hoisted_2$4 = { class: "bar span-all" };
const _hoisted_3$4 = { class: "bar__title" };
const _hoisted_4$4 = ["disabled"];
const _hoisted_5$4 = {
  key: 1,
  class: "card error-card span-all"
};
const _hoisted_6$4 = { class: "err" };
const _hoisted_7$4 = {
  key: 0,
  class: "hint"
};
const _hoisted_8$3 = {
  key: 0,
  class: "card status span-all"
};
const _hoisted_9$3 = { class: "status__row" };
const _hoisted_10$3 = { class: "status__label" };
const _hoisted_11$3 = { class: "status__value" };
const _hoisted_12$3 = {
  key: 0,
  class: "status__source"
};
const _hoisted_13$3 = { class: "status__row" };
const _hoisted_14$2 = { class: "status__label" };
const _hoisted_15$2 = { class: "status__row" };
const _hoisted_16$2 = { class: "status__label" };
const _hoisted_17$2 = { class: "status__value" };
const _hoisted_18$2 = { class: "hint" };
const _hoisted_19$1 = {
  key: 1,
  class: "card status status--muted span-all"
};
const _hoisted_20$1 = { class: "hint" };
const _hoisted_21$1 = { class: "card rules span-all" };
const _hoisted_22$1 = { class: "card__title" };
const _hoisted_23$1 = { class: "rules__label" };
const _hoisted_24$1 = { class: "rules__list" };
const _hoisted_25$1 = {
  key: 1,
  class: "rules__list"
};
const _hoisted_26$1 = {
  key: 1,
  class: "hint"
};
const _hoisted_27$1 = { class: "card span-all" };
const _hoisted_28$1 = { class: "card__title" };
const _hoisted_29$1 = ["innerHTML"];
const _hoisted_30$1 = {
  key: 1,
  class: "hint"
};
const _hoisted_31$1 = { class: "group" };
const _hoisted_32$1 = { class: "section-title" };
const _hoisted_33$1 = { class: "order__top" };
const _hoisted_34$1 = { class: "order__name" };
const _hoisted_35$1 = {
  key: 0,
  class: "badge"
};
const _hoisted_36$1 = {
  key: 0,
  class: "meta"
};
const _hoisted_37$1 = { class: "meta" };
const _hoisted_38$1 = { key: 0 };
const _hoisted_39$1 = { class: "group" };
const _hoisted_40$1 = { class: "section-title" };
const _hoisted_41$1 = { class: "order__top" };
const _hoisted_42$1 = { class: "order__name" };
const _hoisted_43$1 = {
  key: 0,
  class: "badge"
};
const _hoisted_44$1 = {
  key: 0,
  class: "meta"
};
const _hoisted_45$1 = { class: "meta" };
const _hoisted_46$1 = { key: 0 };
const _hoisted_47$1 = { class: "card unsupported span-all" };
const _hoisted_48$1 = { class: "card__title" };
const _hoisted_49$1 = { class: "unsupported__list" };
const _hoisted_50$1 = { class: "hint" };
const SEAT_APP = "seat";
const _sfc_main$4 = {
  __name: "ReserveSeatPanel",
  setup(__props) {
    const { t } = useLocale();
    const loading = ref(true);
    const error = ref("");
    const errorDetail = ref("");
    const payload = ref(null);
    const failureText = (failure) => failure.messageKey ? t(failure.messageKey) : failure.detail || t("library.reserve.error.unknown");
    const config = computed(() => normalizeSeatConfig(payload.value?.config));
    const clock = computed(() => parseSeatClock(payload.value?.serverNow));
    const serverClockText = computed(
      () => clock.value ? `${clock.value.dateKey} ${clock.value.clock}` : ""
    );
    const timeSourceText = computed(() => {
      const source = payload.value?.serverNowSource;
      if (source === "response") return t("library.reserve.seat.time.sourceResponse");
      if (source === "page") return t("library.reserve.seat.time.sourcePage");
      return "";
    });
    const todayRange = computed(() => resolveTodayOpenRange(config.value, clock.value));
    const openState = computed(() => resolveOpenState(clock.value, todayRange.value));
    const openStateText = computed(() => {
      if (openState.value === "open") return t("library.reserve.seat.open.open");
      if (openState.value === "before") return t("library.reserve.seat.open.before");
      if (openState.value === "after") return t("library.reserve.seat.open.after");
      return t("library.reserve.seat.open.unknown");
    });
    const openStateClass = computed(() => ({
      "status__value--ok": openState.value === "open",
      "status__value--off": openState.value === "before" || openState.value === "after"
    }));
    const releaseStateText = computed(() => {
      const state = resolveReleaseState(clock.value, config.value.reserveBeforeTime);
      if (state === "released") return t("library.reserve.seat.release.released");
      if (state === "pending") {
        return tf("library.reserve.seat.release.pending", { time: config.value.reserveBeforeTime });
      }
      return t("library.reserve.seat.release.unknown");
    });
    const openHours = computed(() => resolveOpenHourRows(config.value));
    const ruleLines = computed(() => {
      const c = config.value;
      const lines = [];
      if (c.reserveBeforeDay !== null && c.reserveBeforeDay > 0) {
        lines.push(tf("library.reserve.seat.rule.advance", { n: c.reserveBeforeDay }));
      }
      if (c.reserveBeforeTime) {
        lines.push(tf("library.reserve.seat.rule.release", { time: c.reserveBeforeTime }));
      }
      if (c.reserveDuration !== null && c.reserveDuration > 0) {
        lines.push(tf("library.reserve.seat.rule.duration", { n: c.reserveDuration }));
      }
      if (c.reserveNumLimit !== null && c.reserveNumLimit > 0) {
        lines.push(tf("library.reserve.seat.rule.limit", { n: c.reserveNumLimit }));
      }
      if (c.timeUnit !== null && c.timeUnit > 0) {
        lines.push(tf("library.reserve.seat.rule.timeUnit", { n: c.timeUnit }));
      }
      const { violateTimes, violationLimitDay, violationLimitDuration } = c;
      if (violateTimes !== null && violateTimes > 0 && violationLimitDay !== null && violationLimitDay > 0 && violationLimitDuration !== null && violationLimitDuration > 0) {
        lines.push(
          tf("library.reserve.seat.rule.violation", {
            times: violateTimes,
            days: violationLimitDay,
            duration: violationLimitDuration
          })
        );
      }
      if (c.onlySupportsApiSignIn === true) lines.push(t("library.reserve.seat.rule.signInApiOnly"));
      return lines;
    });
    const hasRules = computed(() => openHours.value.length > 0 || ruleLines.value.length > 0);
    const openHourText = (row) => tf("library.reserve.seat.rule.dayRange", {
      day: row.weekday === null ? row.label : t(WEEKDAY_KEYS[row.weekday]),
      range: `${row.start || "--:--"}-${row.end || "--:--"}`
    });
    const noticeHtml = computed(() => {
      const raw = config.value.noticeContent.trim();
      if (!raw) return "";
      return looksLikeHtml(raw) ? sanitizeSchoolInboxHtml(raw) : linkifyPlainText(raw);
    });
    const noticeTitle = computed(() => config.value.noticeName || t("library.reserve.seat.section.notice"));
    const currentRows = computed(() => normalizeSeatReservations(payload.value?.currentReservations));
    const recentRows = computed(() => normalizeSeatReservations(payload.value?.recentReservations));
    const rowTitle = (row) => row.roomName || row.seatNo || t("library.reserve.seat.row.titleFallback");
    const rowTime = (row) => seatReservationTime(row) || t("library.reserve.seat.row.timeUnknown");
    const load = async () => {
      loading.value = true;
      error.value = "";
      errorDetail.value = "";
      try {
        const res = await invokeNative("library_reserve_seat_config", { req: { app: SEAT_APP } });
        payload.value = res || null;
      } catch (e) {
        const failure = parseReserveFailure(e);
        payload.value = null;
        error.value = failureText(failure);
        errorDetail.value = failure.messageKey ? failure.detail : "";
      } finally {
        loading.value = false;
      }
    };
    onMounted(load);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$4, [
        createBaseVNode("div", _hoisted_2$4, [
          createBaseVNode("h2", _hoisted_3$4, toDisplayString(unref(t)("library.reserve.tab.seat")), 1),
          createBaseVNode("button", {
            type: "button",
            class: "link",
            disabled: loading.value,
            onClick: load
          }, toDisplayString(unref(t)("library.reserve.seat.refresh")), 9, _hoisted_4$4)
        ]),
        loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
          key: 0,
          class: "span-all",
          type: "loading",
          message: unref(t)("library.reserve.seat.loading")
        }, null, 8, ["message"])) : error.value ? (openBlock(), createElementBlock("section", _hoisted_5$4, [
          createBaseVNode("p", _hoisted_6$4, toDisplayString(error.value), 1),
          errorDetail.value ? (openBlock(), createElementBlock("p", _hoisted_7$4, toDisplayString(errorDetail.value), 1)) : createCommentVNode("", true),
          createBaseVNode("button", {
            type: "button",
            class: "ghost",
            onClick: load
          }, toDisplayString(unref(t)("library.reserve.btn.retry")), 1)
        ])) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
          clock.value ? (openBlock(), createElementBlock("section", _hoisted_8$3, [
            createBaseVNode("div", _hoisted_9$3, [
              createBaseVNode("span", _hoisted_10$3, toDisplayString(unref(t)("library.reserve.seat.time.label")), 1),
              createBaseVNode("strong", _hoisted_11$3, toDisplayString(serverClockText.value), 1)
            ]),
            timeSourceText.value ? (openBlock(), createElementBlock("p", _hoisted_12$3, toDisplayString(timeSourceText.value), 1)) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_13$3, [
              createBaseVNode("span", _hoisted_14$2, toDisplayString(unref(t)("library.reserve.seat.open.label")), 1),
              createBaseVNode("strong", {
                class: normalizeClass(["status__value", openStateClass.value])
              }, toDisplayString(openStateText.value), 3)
            ]),
            createBaseVNode("div", _hoisted_15$2, [
              createBaseVNode("span", _hoisted_16$2, toDisplayString(unref(t)("library.reserve.seat.release.label")), 1),
              createBaseVNode("strong", _hoisted_17$2, toDisplayString(releaseStateText.value), 1)
            ]),
            createBaseVNode("p", _hoisted_18$2, toDisplayString(unref(t)("library.reserve.seat.time.hint")), 1)
          ])) : (openBlock(), createElementBlock("section", _hoisted_19$1, [
            createBaseVNode("p", _hoisted_20$1, toDisplayString(unref(t)("library.reserve.seat.time.unavailable")), 1)
          ])),
          createBaseVNode("section", _hoisted_21$1, [
            createBaseVNode("h3", _hoisted_22$1, toDisplayString(unref(t)("library.reserve.seat.section.rules")), 1),
            hasRules.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
              openHours.value.length ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                createBaseVNode("p", _hoisted_23$1, toDisplayString(unref(t)("library.reserve.seat.rule.openTime")), 1),
                createBaseVNode("ul", _hoisted_24$1, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(openHours.value, (row) => {
                    return openBlock(), createElementBlock("li", {
                      key: row.key
                    }, toDisplayString(openHourText(row)), 1);
                  }), 128))
                ])
              ], 64)) : createCommentVNode("", true),
              ruleLines.value.length ? (openBlock(), createElementBlock("ul", _hoisted_25$1, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(ruleLines.value, (line, i) => {
                  return openBlock(), createElementBlock("li", {
                    key: `rule-${i}`
                  }, toDisplayString(line), 1);
                }), 128))
              ])) : createCommentVNode("", true)
            ], 64)) : (openBlock(), createElementBlock("p", _hoisted_26$1, toDisplayString(unref(t)("library.reserve.seat.rulesEmpty")), 1))
          ]),
          createBaseVNode("section", _hoisted_27$1, [
            createBaseVNode("h3", _hoisted_28$1, toDisplayString(noticeTitle.value), 1),
            noticeHtml.value ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "rich",
              innerHTML: noticeHtml.value
            }, null, 8, _hoisted_29$1)) : (openBlock(), createElementBlock("p", _hoisted_30$1, toDisplayString(unref(t)("library.reserve.seat.notice.empty")), 1))
          ]),
          createBaseVNode("section", _hoisted_31$1, [
            createBaseVNode("h3", _hoisted_32$1, toDisplayString(unref(t)("library.reserve.seat.section.current")), 1),
            !currentRows.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: unref(t)("library.reserve.seat.current.empty")
            }, null, 8, ["message"])) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(currentRows.value, (row) => {
              return openBlock(), createElementBlock("article", {
                key: row.key,
                class: "card order"
              }, [
                createBaseVNode("div", _hoisted_33$1, [
                  createBaseVNode("strong", _hoisted_34$1, toDisplayString(rowTitle(row)), 1),
                  row.statusName ? (openBlock(), createElementBlock("span", _hoisted_35$1, toDisplayString(row.statusName), 1)) : createCommentVNode("", true)
                ]),
                row.roomName && row.seatNo ? (openBlock(), createElementBlock("p", _hoisted_36$1, toDisplayString(unref(tf)("library.reserve.seat.row.seatNo", { seat: row.seatNo })), 1)) : createCommentVNode("", true),
                createBaseVNode("p", _hoisted_37$1, [
                  row.date ? (openBlock(), createElementBlock("span", _hoisted_38$1, toDisplayString(row.date), 1)) : createCommentVNode("", true),
                  createTextVNode(toDisplayString(rowTime(row)), 1)
                ])
              ]);
            }), 128))
          ]),
          createBaseVNode("section", _hoisted_39$1, [
            createBaseVNode("h3", _hoisted_40$1, toDisplayString(unref(t)("library.reserve.seat.section.recent")), 1),
            !recentRows.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: unref(t)("library.reserve.seat.recent.empty")
            }, null, 8, ["message"])) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(recentRows.value, (row) => {
              return openBlock(), createElementBlock("article", {
                key: row.key,
                class: "card order"
              }, [
                createBaseVNode("div", _hoisted_41$1, [
                  createBaseVNode("strong", _hoisted_42$1, toDisplayString(rowTitle(row)), 1),
                  row.statusName ? (openBlock(), createElementBlock("span", _hoisted_43$1, toDisplayString(row.statusName), 1)) : createCommentVNode("", true)
                ]),
                row.roomName && row.seatNo ? (openBlock(), createElementBlock("p", _hoisted_44$1, toDisplayString(unref(tf)("library.reserve.seat.row.seatNo", { seat: row.seatNo })), 1)) : createCommentVNode("", true),
                createBaseVNode("p", _hoisted_45$1, [
                  row.date ? (openBlock(), createElementBlock("span", _hoisted_46$1, toDisplayString(row.date), 1)) : createCommentVNode("", true),
                  createTextVNode(toDisplayString(rowTime(row)), 1)
                ])
              ]);
            }), 128))
          ]),
          createBaseVNode("section", _hoisted_47$1, [
            createBaseVNode("h3", _hoisted_48$1, toDisplayString(unref(t)("library.reserve.seat.section.unsupported")), 1),
            createBaseVNode("ul", _hoisted_49$1, [
              createBaseVNode("li", null, toDisplayString(unref(t)("library.reserve.seat.unsupported.availability")), 1),
              createBaseVNode("li", null, toDisplayString(unref(t)("library.reserve.seat.unsupported.select")), 1),
              createBaseVNode("li", null, toDisplayString(unref(t)("library.reserve.seat.unsupported.signIn")), 1)
            ]),
            createBaseVNode("p", _hoisted_50$1, toDisplayString(unref(t)("library.reserve.seat.unsupported.guide")), 1)
          ])
        ], 64))
      ]);
    };
  }
};
const ReserveSeatPanel = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-c2d15a46"]]);
const _hoisted_1$3 = { class: "form" };
const _hoisted_2$3 = ["for"];
const _hoisted_3$3 = {
  key: 0,
  class: "field__required",
  "aria-hidden": "true"
};
const _hoisted_4$3 = ["id", "value", "placeholder", "disabled", "onInput"];
const _hoisted_5$3 = ["id", "value", "disabled", "onChange"];
const _hoisted_6$3 = { value: "" };
const _hoisted_7$3 = ["value"];
const _hoisted_8$2 = ["aria-label"];
const _hoisted_9$2 = ["name", "value", "checked", "disabled", "onChange"];
const _hoisted_10$2 = {
  key: 3,
  class: "field__options"
};
const _hoisted_11$2 = ["value", "checked", "disabled", "onChange"];
const _hoisted_12$2 = ["id", "type", "value", "placeholder", "disabled", "onInput"];
const _hoisted_13$2 = {
  key: 5,
  class: "field__error"
};
const _sfc_main$3 = {
  __name: "ReserveFormFields",
  props: {
    /** 归一化后的字段定义 */
    fields: { type: Array, default: () => [] },
    /** 表单值（checkbox 为数组） */
    values: { type: Object, default: () => ({}) },
    /** 字段名 → i18n 错误 key */
    errors: { type: Object, default: () => ({}) },
    disabled: { type: Boolean, default: false }
  },
  emits: ["update:values"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t } = useLocale();
    const setValue = (key, value) => {
      emit("update:values", { ...props.values, [key]: value });
    };
    const onInput = (key, event) => {
      setValue(key, String(event?.target?.value ?? ""));
    };
    const toggleOption = (key, optionValue) => {
      const current = Array.isArray(props.values[key]) ? props.values[key] : [];
      const next = current.includes(optionValue) ? current.filter((item) => item !== optionValue) : [...current, optionValue];
      setValue(key, next);
    };
    const textValue = (key) => String(props.values[key] ?? "");
    const errorText = (field) => formatFieldErrorText(field, props.errors[field.key], t);
    const placeholderOf = (field) => field.placeholder || t("library.reserve.form.placeholder");
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$3, [
        (openBlock(true), createElementBlock(Fragment, null, renderList(props.fields, (field) => {
          return openBlock(), createElementBlock("div", {
            key: field.key,
            class: "field"
          }, [
            createBaseVNode("label", {
              class: "field__label",
              for: `rf-${field.key}`
            }, [
              createTextVNode(toDisplayString(field.label) + " ", 1),
              field.required ? (openBlock(), createElementBlock("span", _hoisted_3$3, "*")) : createCommentVNode("", true)
            ], 8, _hoisted_2$3),
            field.control === "textarea" ? (openBlock(), createElementBlock("textarea", {
              key: 0,
              id: `rf-${field.key}`,
              class: normalizeClass(["field__input field__input--area", { invalid: props.errors[field.key] }]),
              value: textValue(field.key),
              placeholder: placeholderOf(field),
              disabled: props.disabled,
              rows: "3",
              onInput: ($event) => onInput(field.key, $event)
            }, null, 42, _hoisted_4$3)) : field.control === "select" ? (openBlock(), createElementBlock("select", {
              key: 1,
              id: `rf-${field.key}`,
              class: normalizeClass(["field__input", { invalid: props.errors[field.key] }]),
              value: textValue(field.key),
              disabled: props.disabled,
              onChange: ($event) => onInput(field.key, $event)
            }, [
              createBaseVNode("option", _hoisted_6$3, toDisplayString(placeholderOf(field)), 1),
              (openBlock(true), createElementBlock(Fragment, null, renderList(field.options, (option) => {
                return openBlock(), createElementBlock("option", {
                  key: option.value,
                  value: option.value
                }, toDisplayString(option.label), 9, _hoisted_7$3);
              }), 128))
            ], 42, _hoisted_5$3)) : field.control === "radio" ? (openBlock(), createElementBlock("div", {
              key: 2,
              class: "field__options",
              role: "radiogroup",
              "aria-label": field.label
            }, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(field.options, (option) => {
                return openBlock(), createElementBlock("label", {
                  key: option.value,
                  class: "option"
                }, [
                  createBaseVNode("input", {
                    type: "radio",
                    name: `rf-${field.key}`,
                    value: option.value,
                    checked: textValue(field.key) === option.value,
                    disabled: props.disabled,
                    onChange: ($event) => onInput(field.key, $event)
                  }, null, 40, _hoisted_9$2),
                  createBaseVNode("span", null, toDisplayString(option.label), 1)
                ]);
              }), 128))
            ], 8, _hoisted_8$2)) : field.control === "checkbox" ? (openBlock(), createElementBlock("div", _hoisted_10$2, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(field.options, (option) => {
                return openBlock(), createElementBlock("label", {
                  key: option.value,
                  class: "option"
                }, [
                  createBaseVNode("input", {
                    type: "checkbox",
                    value: option.value,
                    checked: Array.isArray(props.values[field.key]) && props.values[field.key].includes(option.value),
                    disabled: props.disabled,
                    onChange: ($event) => toggleOption(field.key, option.value)
                  }, null, 40, _hoisted_11$2),
                  createBaseVNode("span", null, toDisplayString(option.label), 1)
                ]);
              }), 128))
            ])) : (openBlock(), createElementBlock("input", {
              key: 4,
              id: `rf-${field.key}`,
              class: normalizeClass(["field__input", { invalid: props.errors[field.key] }]),
              type: field.control === "number" ? "number" : field.control,
              value: textValue(field.key),
              placeholder: placeholderOf(field),
              disabled: props.disabled,
              onInput: ($event) => onInput(field.key, $event)
            }, null, 42, _hoisted_12$2)),
            errorText(field) ? (openBlock(), createElementBlock("p", _hoisted_13$2, toDisplayString(errorText(field)), 1)) : createCommentVNode("", true)
          ]);
        }), 128))
      ]);
    };
  }
};
const ReserveFormFields = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-e0c27c40"]]);
const _hoisted_1$2 = { class: "panel" };
const _hoisted_2$2 = {
  key: 0,
  class: "card notice"
};
const _hoisted_3$2 = { class: "notice__head" };
const _hoisted_4$2 = ["aria-label"];
const _hoisted_5$2 = {
  key: 0,
  class: "notice__body"
};
const _hoisted_6$2 = { class: "card notice notice--warn" };
const _hoisted_7$2 = {
  key: 0,
  class: "notice__body"
};
const _hoisted_8$1 = { class: "notice__list" };
const _hoisted_9$1 = { key: 0 };
const _hoisted_10$1 = { class: "notice__body notice__body--danger" };
const _hoisted_11$1 = {
  key: 0,
  class: "notice__body notice__body--danger"
};
const _hoisted_12$1 = { key: 0 };
const _hoisted_13$1 = { class: "section-title" };
const _hoisted_14$1 = { class: "res-list" };
const _hoisted_15$1 = ["onClick"];
const _hoisted_16$1 = { class: "res-card__top" };
const _hoisted_17$1 = { class: "res-card__name" };
const _hoisted_18$1 = { class: "res-card__meta" };
const _hoisted_19 = { class: "res-card__meta" };
const _hoisted_20 = { class: "res-card__meta" };
const _hoisted_21 = {
  key: 0,
  class: "res-card__note"
};
const _hoisted_22 = { class: "card res-summary" };
const _hoisted_23 = { class: "res-card__meta" };
const _hoisted_24 = { class: "res-card__meta" };
const _hoisted_25 = { class: "res-card__meta" };
const _hoisted_26 = {
  key: 0,
  class: "res-card__note"
};
const _hoisted_27 = { class: "notice__body notice__body--danger" };
const _hoisted_28 = { class: "section-title" };
const _hoisted_29 = { class: "dates" };
const _hoisted_30 = ["aria-pressed", "onClick"];
const _hoisted_31 = { class: "date__week" };
const _hoisted_32 = { class: "date__md" };
const _hoisted_33 = {
  key: 0,
  class: "date__tag"
};
const _hoisted_34 = { class: "section-title" };
const _hoisted_35 = {
  key: 1,
  class: "card error-card"
};
const _hoisted_36 = { class: "err" };
const _hoisted_37 = {
  key: 0,
  class: "hint"
};
const _hoisted_38 = { class: "slots" };
const _hoisted_39 = ["aria-disabled", "aria-pressed", "onClick"];
const _hoisted_40 = { class: "slot__time" };
const _hoisted_41 = {
  key: 0,
  class: "slot__name"
};
const _hoisted_42 = {
  key: 1,
  class: "slot__sub"
};
const _hoisted_43 = { class: "legend" };
const _hoisted_44 = { class: "section-title" };
const _hoisted_45 = { class: "card" };
const _hoisted_46 = { class: "hint" };
const _hoisted_47 = {
  key: 1,
  class: "hint"
};
const _hoisted_48 = {
  key: 2,
  class: "hint"
};
const _hoisted_49 = { class: "submit-bar" };
const _hoisted_50 = { class: "submit-bar__info" };
const _hoisted_51 = { class: "muted" };
const _hoisted_52 = {
  key: 1,
  class: "muted"
};
const _hoisted_53 = ["disabled"];
const _hoisted_54 = { class: "confirm__lead" };
const _hoisted_55 = { class: "confirm__list" };
const _hoisted_56 = { class: "confirm__warn" };
const _hoisted_57 = ["disabled"];
const _hoisted_58 = ["disabled"];
const _sfc_main$2 = {
  __name: "ReserveRoomPanel",
  props: {
    /** 应用标识：quiet_room（静音仓）/ seminar_room（研讨室） */
    app: { type: String, required: true }
  },
  setup(__props) {
    const props = __props;
    const { t, locale } = useLocale();
    const resources = computed(() => {
      void locale.value;
      const list = RESOURCE_CATALOG[props.app] || [];
      return list.map((item) => ({
        ...item,
        name: tf(item.nameKey, { n: item.index }),
        location: t(item.locationKey),
        note: item.noteKey ? t(item.noteKey) : ""
      }));
    });
    const loading = ref(true);
    const loadError = ref("");
    const loadErrorDetail = ref("");
    const itemInfo = ref(null);
    const noticeDismissed = ref(false);
    const selectedResourceId = ref("");
    const selectedResource = computed(
      () => resources.value.find((item) => item.id === selectedResourceId.value) || null
    );
    const slots = ref([]);
    const slotsLoading = ref(false);
    const slotsError = ref("");
    const slotsErrorDetail = ref("");
    const selectedDate = ref("");
    const selectedSlotId = ref("");
    const selectedSlot = computed(() => pickSelectedSlot(visibleSlots.value, selectedSlotId.value));
    const formValues = ref({});
    const formErrors = ref({});
    const confirmVisible = ref(false);
    const submitting = ref(false);
    const failureText = (failure) => failure.messageKey ? t(failure.messageKey) : failure.detail || t("library.reserve.error.unknown");
    const advanceDays = computed(() => {
      const raw = Number(itemInfo.value?.advanceDays);
      return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : FALLBACK_ADVANCE_DAYS;
    });
    const dateOptions = computed(() => buildDateOptions(advanceDays.value));
    const durationLimit = computed(() => {
      const raw = Number(itemInfo.value?.durationLimitMin);
      return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
    });
    const notice = computed(() => ({
      title: String(itemInfo.value?.dialogTitle ?? "").trim(),
      body: stripHtml(itemInfo.value?.dialogContent)
    }));
    const showNotice = computed(
      () => !noticeDismissed.value && Boolean(notice.value.title || notice.value.body)
    );
    const slotsHaveDate = computed(() => slots.value.some((slot) => Boolean(slot.date)));
    const visibleSlots = computed(() => {
      if (!slotsHaveDate.value) return slots.value;
      return slots.value.filter((slot) => matchesDate(slot.date, selectedDate.value));
    });
    const dateLabel = (option) => ({
      weekday: t(WEEKDAY_KEYS[option.date.getDay()]),
      md: `${String(option.date.getMonth() + 1).padStart(2, "0")}-${String(option.date.getDate()).padStart(2, "0")}`,
      tag: option.offset === 0 ? t("library.reserve.date.today") : option.offset === 1 ? t("library.reserve.date.tomorrow") : ""
    });
    const slotTimeText = (slot) => slot.end ? `${slot.start}-${slot.end}` : slot.start || t("library.reserve.booking.slotUnknown");
    const slotClass = (slot) => [
      "slot",
      slot.state === "free" ? "slot--free" : slot.state === "taken" ? "slot--taken" : "slot--closed",
      { "slot--on": slot.id === selectedSlotId.value }
    ];
    const confirmRows = computed(() => {
      const resource = selectedResource.value;
      const slot = selectedSlot.value;
      if (!resource || !slot) return [];
      return [
        // 房间名优先取后端时段自带的 itemName（权威来源）；缺失时回落所选房间
        { label: t("library.reserve.confirm.room"), value: slot.itemName || resource.name },
        { label: t("library.reserve.confirm.date"), value: selectedDate.value },
        { label: t("library.reserve.confirm.time"), value: slotTimeText(slot) },
        ...summarizeFormValues(slot.fields, formValues.value).map((row) => ({
          label: row.label,
          value: row.value
        }))
      ];
    });
    const loadConstraints = async () => {
      loading.value = true;
      loadError.value = "";
      loadErrorDetail.value = "";
      try {
        const res = await invokeNative("library_reserve_item_info", { req: { app: props.app } });
        itemInfo.value = res?.info || null;
      } catch (e) {
        const failure = parseReserveFailure(e);
        itemInfo.value = null;
        loadError.value = failureText(failure);
        loadErrorDetail.value = failure.messageKey ? failure.detail : "";
      } finally {
        loading.value = false;
        if (!selectedDate.value) selectedDate.value = dateOptions.value[0]?.value || "";
      }
    };
    const loadSlots = async () => {
      const resource = selectedResource.value;
      if (!resource) return;
      slotsLoading.value = true;
      slotsError.value = "";
      slotsErrorDetail.value = "";
      try {
        const range = buildSlotTimeRange(selectedDate.value);
        const req = { app: props.app };
        if (range.startTime) {
          req.start_time = range.startTime;
          req.end_time = range.endTime;
        }
        const res = await invokeNative("library_reserve_time_list", { req });
        const items = Array.isArray(res?.items) ? res.items : [];
        slots.value = items.map((item, index) => normalizeSlot(item, index, resource)).sort((a, b) => String(a.start).localeCompare(String(b.start)));
      } catch (e) {
        const failure = parseReserveFailure(e);
        slots.value = [];
        slotsError.value = failureText(failure);
        slotsErrorDetail.value = failure.messageKey ? failure.detail : "";
      } finally {
        slotsLoading.value = false;
      }
    };
    const resetSlotSelection = () => {
      selectedSlotId.value = "";
      formValues.value = {};
      formErrors.value = {};
    };
    const selectResource = async (resource) => {
      selectedResourceId.value = resource.id;
      resetSlotSelection();
      selectedDate.value = dateOptions.value[0]?.value || "";
      await loadSlots();
    };
    const selectDate = async (dateKey) => {
      if (!dateKey || dateKey === selectedDate.value) return;
      selectedDate.value = dateKey;
      resetSlotSelection();
      await loadSlots();
    };
    const backToList = () => {
      selectedResourceId.value = "";
      resetSlotSelection();
      slots.value = [];
      slotsError.value = "";
    };
    const chooseSlot = (slot) => {
      if (slot.state !== "free") {
        showToast(t("library.reserve.toast.slotUnavailable"), "warning");
        return;
      }
      if (selectedSlotId.value === slot.id) {
        selectedSlotId.value = "";
        return;
      }
      selectedSlotId.value = slot.id;
      formValues.value = buildInitialValues(slot.fields);
      formErrors.value = {};
    };
    const onFormValues = (next) => {
      formValues.value = next;
    };
    const requestSubmit = () => {
      const slot = selectedSlot.value;
      if (!slot) {
        showToast(t("library.reserve.toast.selectSlot"), "warning");
        return;
      }
      const validation = validateFormValues(slot.fields, formValues.value);
      formErrors.value = validation.errors;
      if (!validation.valid) {
        showToast(t("library.reserve.toast.formInvalid"), "warning");
        return;
      }
      confirmVisible.value = true;
    };
    const confirmSubmit = async () => {
      const slot = selectedSlot.value;
      if (!slot) {
        confirmVisible.value = false;
        return;
      }
      submitting.value = true;
      try {
        const cycleType = Number(itemInfo.value?.cycleType);
        const req = {
          app: props.app,
          // aprvId 来自时段条目（实测可能为 0，原样透传；缺失则交由后端推导）
          aprv_id: slot.aprvId === null ? void 0 : String(slot.aprvId),
          // 以下两项契约未实测，按常见键名从原始条目兜底提取（取不到则不传）
          aprv_status_type_id: pickRawString(slot.raw, [
            "aprvStatusTypeId",
            "statusTypeId",
            "aprvStatusType"
          ]),
          form_user_id: pickRawString(slot.raw, ["formUserId", "formUser", "userId", "applyUserId"]),
          cycle_type: Number.isFinite(cycleType) ? cycleType : 0,
          form_data: toFormData(slot.fields, formValues.value)
        };
        const res = await invokeNative("library_reserve_submit", { req });
        confirmVisible.value = false;
        showToast(res?.message || t("library.reserve.toast.submitSuccess"), "success");
        resetSlotSelection();
        await loadSlots();
      } catch (e) {
        confirmVisible.value = false;
        const failure = parseReserveFailure(e);
        showToast(failureText(failure), failure.network ? "warning" : "error", failure.network ? 2600 : 3400);
      } finally {
        submitting.value = false;
      }
    };
    onMounted(loadConstraints);
    watch(
      () => props.app,
      () => {
        backToList();
        noticeDismissed.value = false;
        selectedDate.value = "";
        void loadConstraints();
      }
    );
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$2, [
        !selectedResource.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
          showNotice.value ? (openBlock(), createElementBlock("section", _hoisted_2$2, [
            createBaseVNode("div", _hoisted_3$2, [
              createBaseVNode("strong", null, toDisplayString(notice.value.title || unref(t)("library.reserve.notice.title")), 1),
              createBaseVNode("button", {
                type: "button",
                class: "icon-btn",
                "aria-label": unref(t)("common.close"),
                onClick: _cache[0] || (_cache[0] = ($event) => noticeDismissed.value = true)
              }, [..._cache[3] || (_cache[3] = [
                createBaseVNode("span", {
                  class: "material-symbols-outlined",
                  "aria-hidden": "true"
                }, "close", -1)
              ])], 8, _hoisted_4$2)
            ]),
            notice.value.body ? (openBlock(), createElementBlock("p", _hoisted_5$2, toDisplayString(notice.value.body), 1)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          createBaseVNode("section", _hoisted_6$2, [
            createBaseVNode("strong", null, toDisplayString(unref(t)("library.reserve.notice.title")), 1),
            loading.value ? (openBlock(), createElementBlock("p", _hoisted_7$2, toDisplayString(unref(t)("library.reserve.state.loading")), 1)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
              createBaseVNode("ul", _hoisted_8$1, [
                createBaseVNode("li", null, toDisplayString(unref(tf)("library.reserve.notice.advance", { n: advanceDays.value })), 1),
                durationLimit.value ? (openBlock(), createElementBlock("li", _hoisted_9$1, toDisplayString(unref(tf)("library.reserve.notice.duration", { n: durationLimit.value })), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("p", _hoisted_10$1, toDisplayString(unref(t)("library.reserve.notice.violation")), 1),
              loadError.value ? (openBlock(), createElementBlock("p", _hoisted_11$1, [
                createTextVNode(toDisplayString(loadError.value), 1),
                loadErrorDetail.value ? (openBlock(), createElementBlock("span", _hoisted_12$1, toDisplayString(loadErrorDetail.value), 1)) : createCommentVNode("", true)
              ])) : createCommentVNode("", true),
              loadError.value ? (openBlock(), createElementBlock("button", {
                key: 1,
                type: "button",
                class: "ghost",
                onClick: loadConstraints
              }, toDisplayString(unref(t)("library.reserve.btn.retry")), 1)) : createCommentVNode("", true)
            ], 64))
          ]),
          createBaseVNode("h2", _hoisted_13$1, toDisplayString(unref(t)("library.reserve.resource.title")), 1),
          createBaseVNode("div", _hoisted_14$1, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(resources.value, (resource) => {
              return openBlock(), createElementBlock("button", {
                key: resource.id,
                type: "button",
                class: "res-card",
                onClick: ($event) => selectResource(resource)
              }, [
                createBaseVNode("div", _hoisted_16$1, [
                  createBaseVNode("h3", _hoisted_17$1, toDisplayString(resource.name), 1),
                  _cache[4] || (_cache[4] = createBaseVNode("span", {
                    class: "material-symbols-outlined",
                    "aria-hidden": "true"
                  }, "chevron_right", -1))
                ]),
                createBaseVNode("p", _hoisted_18$1, toDisplayString(unref(tf)("library.reserve.resource.openTime", { range: `${resource.openFrom}-${resource.openTo}` })), 1),
                createBaseVNode("p", _hoisted_19, toDisplayString(unref(tf)("library.reserve.resource.location", { place: resource.location })), 1),
                createBaseVNode("p", _hoisted_20, toDisplayString(unref(tf)("library.reserve.resource.capacity", { min: resource.capacityMin, max: resource.capacityMax })), 1),
                resource.note ? (openBlock(), createElementBlock("p", _hoisted_21, toDisplayString(resource.note), 1)) : createCommentVNode("", true)
              ], 8, _hoisted_15$1);
            }), 128))
          ])
        ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          createBaseVNode("button", {
            type: "button",
            class: "back-link",
            onClick: backToList
          }, [
            _cache[5] || (_cache[5] = createBaseVNode("span", {
              class: "material-symbols-outlined",
              "aria-hidden": "true"
            }, "arrow_back", -1)),
            createTextVNode(" " + toDisplayString(selectedResource.value.name), 1)
          ]),
          createBaseVNode("section", _hoisted_22, [
            createBaseVNode("p", _hoisted_23, toDisplayString(unref(tf)("library.reserve.resource.openTime", { range: `${selectedResource.value.openFrom}-${selectedResource.value.openTo}` })), 1),
            createBaseVNode("p", _hoisted_24, toDisplayString(unref(tf)("library.reserve.resource.location", { place: selectedResource.value.location })), 1),
            createBaseVNode("p", _hoisted_25, toDisplayString(unref(tf)("library.reserve.resource.capacity", { min: selectedResource.value.capacityMin, max: selectedResource.value.capacityMax })), 1),
            selectedResource.value.note ? (openBlock(), createElementBlock("p", _hoisted_26, toDisplayString(selectedResource.value.note), 1)) : createCommentVNode("", true),
            createBaseVNode("p", _hoisted_27, toDisplayString(unref(t)("library.reserve.notice.violation")), 1)
          ]),
          createBaseVNode("h3", _hoisted_28, toDisplayString(unref(t)("library.reserve.booking.date")), 1),
          createBaseVNode("div", _hoisted_29, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(dateOptions.value, (option) => {
              return openBlock(), createElementBlock("button", {
                key: option.value,
                type: "button",
                class: normalizeClass(["date", { "date--on": option.value === selectedDate.value }]),
                "aria-pressed": option.value === selectedDate.value,
                onClick: ($event) => selectDate(option.value)
              }, [
                createBaseVNode("span", _hoisted_31, toDisplayString(dateLabel(option).weekday), 1),
                createBaseVNode("strong", _hoisted_32, toDisplayString(dateLabel(option).md), 1),
                dateLabel(option).tag ? (openBlock(), createElementBlock("span", _hoisted_33, toDisplayString(dateLabel(option).tag), 1)) : createCommentVNode("", true)
              ], 10, _hoisted_30);
            }), 128))
          ]),
          createBaseVNode("h3", _hoisted_34, toDisplayString(unref(t)("library.reserve.booking.slot")), 1),
          slotsLoading.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: unref(t)("library.reserve.state.loading")
          }, null, 8, ["message"])) : slotsError.value ? (openBlock(), createElementBlock("section", _hoisted_35, [
            createBaseVNode("p", _hoisted_36, toDisplayString(slotsError.value), 1),
            slotsErrorDetail.value ? (openBlock(), createElementBlock("p", _hoisted_37, toDisplayString(slotsErrorDetail.value), 1)) : createCommentVNode("", true),
            createBaseVNode("button", {
              type: "button",
              class: "ghost",
              onClick: loadSlots
            }, toDisplayString(unref(t)("library.reserve.btn.retry")), 1)
          ])) : !visibleSlots.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            type: "empty",
            message: unref(t)("library.reserve.booking.slotEmpty")
          }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("div", _hoisted_38, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(visibleSlots.value, (slot) => {
                return openBlock(), createElementBlock("button", {
                  key: slot.id,
                  type: "button",
                  class: normalizeClass(slotClass(slot)),
                  "aria-disabled": slot.state !== "free",
                  "aria-pressed": slot.id === selectedSlotId.value,
                  onClick: ($event) => chooseSlot(slot)
                }, [
                  createBaseVNode("span", _hoisted_40, toDisplayString(slotTimeText(slot)), 1),
                  slot.itemName ? (openBlock(), createElementBlock("span", _hoisted_41, toDisplayString(slot.itemName), 1)) : createCommentVNode("", true),
                  slot.remaining !== null ? (openBlock(), createElementBlock("span", _hoisted_42, toDisplayString(unref(tf)("library.reserve.booking.remaining", { n: slot.remaining })), 1)) : createCommentVNode("", true)
                ], 10, _hoisted_39);
              }), 128))
            ]),
            createBaseVNode("div", _hoisted_43, [
              createBaseVNode("span", null, [
                _cache[6] || (_cache[6] = createBaseVNode("i", { class: "dot dot--free" }, null, -1)),
                createTextVNode(toDisplayString(unref(t)("library.reserve.booking.legendFree")), 1)
              ]),
              createBaseVNode("span", null, [
                _cache[7] || (_cache[7] = createBaseVNode("i", { class: "dot dot--taken" }, null, -1)),
                createTextVNode(toDisplayString(unref(t)("library.reserve.booking.legendTaken")), 1)
              ]),
              createBaseVNode("span", null, [
                _cache[8] || (_cache[8] = createBaseVNode("i", { class: "dot dot--closed" }, null, -1)),
                createTextVNode(toDisplayString(unref(t)("library.reserve.booking.legendClosed")), 1)
              ]),
              createBaseVNode("span", null, [
                _cache[9] || (_cache[9] = createBaseVNode("i", { class: "dot dot--on" }, null, -1)),
                createTextVNode(toDisplayString(unref(t)("library.reserve.booking.legendSelected")), 1)
              ])
            ])
          ], 64)),
          selectedSlot.value ? (openBlock(), createElementBlock(Fragment, { key: 4 }, [
            createBaseVNode("h3", _hoisted_44, toDisplayString(unref(t)("library.reserve.booking.form")), 1),
            createBaseVNode("section", _hoisted_45, [
              createBaseVNode("p", _hoisted_46, toDisplayString(unref(tf)("library.reserve.booking.capacityHint", { min: selectedResource.value.capacityMin, max: selectedResource.value.capacityMax })), 1),
              selectedSlot.value.fields.length ? (openBlock(), createBlock(ReserveFormFields, {
                key: 0,
                fields: selectedSlot.value.fields,
                values: formValues.value,
                errors: formErrors.value,
                disabled: submitting.value,
                "onUpdate:values": onFormValues
              }, null, 8, ["fields", "values", "errors", "disabled"])) : !selectedSlot.value.formParsed ? (openBlock(), createElementBlock("p", _hoisted_47, toDisplayString(unref(t)("library.reserve.booking.formUnparsed")), 1)) : (openBlock(), createElementBlock("p", _hoisted_48, toDisplayString(unref(t)("library.reserve.booking.formEmpty")), 1))
            ])
          ], 64)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_49, [
            createBaseVNode("div", _hoisted_50, [
              selectedSlot.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                createBaseVNode("strong", null, toDisplayString(slotTimeText(selectedSlot.value)), 1),
                createBaseVNode("span", _hoisted_51, toDisplayString(selectedDate.value), 1)
              ], 64)) : (openBlock(), createElementBlock("span", _hoisted_52, toDisplayString(unref(t)("library.reserve.booking.selectHint")), 1))
            ]),
            createBaseVNode("button", {
              type: "button",
              class: "primary",
              disabled: !selectedSlot.value || submitting.value,
              onClick: requestSubmit
            }, toDisplayString(submitting.value ? unref(t)("library.reserve.btn.submitting") : unref(t)("library.reserve.btn.submit")), 9, _hoisted_53)
          ])
        ], 64)),
        createVNode(unref(TModal), {
          visible: confirmVisible.value,
          title: unref(t)("library.reserve.confirm.title"),
          width: "420px",
          onClose: _cache[2] || (_cache[2] = ($event) => confirmVisible.value = false)
        }, {
          footer: withCtx(() => [
            createBaseVNode("button", {
              type: "button",
              class: "ghost",
              disabled: submitting.value,
              onClick: _cache[1] || (_cache[1] = ($event) => confirmVisible.value = false)
            }, toDisplayString(unref(t)("library.reserve.btn.cancel")), 9, _hoisted_57),
            createBaseVNode("button", {
              type: "button",
              class: "primary",
              disabled: submitting.value,
              onClick: confirmSubmit
            }, toDisplayString(submitting.value ? unref(t)("library.reserve.btn.submitting") : unref(t)("library.reserve.btn.confirm")), 9, _hoisted_58)
          ]),
          default: withCtx(() => [
            createBaseVNode("p", _hoisted_54, toDisplayString(unref(t)("library.reserve.confirm.body")), 1),
            createBaseVNode("dl", _hoisted_55, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(confirmRows.value, (row, i) => {
                return openBlock(), createElementBlock("div", {
                  key: i,
                  class: "confirm__row"
                }, [
                  createBaseVNode("dt", null, toDisplayString(row.label), 1),
                  createBaseVNode("dd", null, toDisplayString(row.value), 1)
                ]);
              }), 128))
            ]),
            createBaseVNode("p", _hoisted_56, toDisplayString(unref(t)("library.reserve.confirm.violation")), 1)
          ]),
          _: 1
        }, 8, ["visible", "title"])
      ]);
    };
  }
};
const ReserveRoomPanel = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-c6511585"]]);
const _hoisted_1$1 = { class: "panel" };
const _hoisted_2$1 = { class: "bar span-all" };
const _hoisted_3$1 = { class: "bar__title" };
const _hoisted_4$1 = ["disabled"];
const _hoisted_5$1 = {
  key: 0,
  class: "warn span-all"
};
const _hoisted_6$1 = {
  key: 2,
  class: "card error-card span-all"
};
const _hoisted_7$1 = { class: "err" };
const _hoisted_8 = {
  key: 0,
  class: "hint"
};
const _hoisted_9 = { class: "hint" };
const _hoisted_10 = { class: "order__top" };
const _hoisted_11 = { class: "order__name" };
const _hoisted_12 = { class: "badge" };
const _hoisted_13 = { class: "meta" };
const _hoisted_14 = { class: "order__actions" };
const _hoisted_15 = ["onClick"];
const _hoisted_16 = { class: "confirm__body" };
const _hoisted_17 = ["disabled"];
const _hoisted_18 = ["disabled"];
const _sfc_main$1 = {
  __name: "ReserveMinePanel",
  setup(__props) {
    const APPS = ["quiet_room", "seminar_room"];
    const { t } = useLocale();
    const loading = ref(true);
    const error = ref("");
    const errorDetail = ref("");
    const partialError = ref("");
    const items = ref([]);
    const cancelVisible = ref(false);
    const cancelling = ref(false);
    const pendingCancel = ref(null);
    const failureText = (failure) => failure.messageKey ? t(failure.messageKey) : failure.detail || t("library.reserve.error.unknown");
    const appName = (app) => app === "quiet_room" ? t("library.reserve.tab.quiet") : t("library.reserve.tab.room");
    const normalizeItem = (raw, app, index) => {
      const record = raw && typeof raw === "object" ? raw : {};
      const aprvId = record.aprvId === null || record.aprvId === void 0 || record.aprvId === "" ? "" : String(record.aprvId);
      return {
        key: `${app}-${aprvId || "row"}-${index}`,
        app,
        aprvId,
        name: String(record.itemName ?? "").trim() || appName(app),
        statusName: String(record.statusName ?? "").trim(),
        date: String(record.date ?? "").trim(),
        start: extractHm(record.startTime),
        end: extractHm(record.endTime)
      };
    };
    const timeText = (item) => {
      if (item.start && item.end) return `${item.start}-${item.end}`;
      return item.start || item.end || "";
    };
    const load = async () => {
      loading.value = true;
      error.value = "";
      errorDetail.value = "";
      partialError.value = "";
      const results = await Promise.allSettled(
        APPS.map((app) => invokeNative("library_reserve_my_reservations", { req: { app } }))
      );
      const merged = [];
      const failures = [];
      results.forEach((result, i) => {
        const app = APPS[i];
        if (result.status === "fulfilled") {
          const list = Array.isArray(result.value?.items) ? result.value.items : [];
          list.forEach((item, index) => merged.push(normalizeItem(item, app, index)));
        } else {
          failures.push(parseReserveFailure(result.reason));
        }
      });
      merged.sort((a, b) => sortKeyOf(a).localeCompare(sortKeyOf(b)));
      items.value = merged;
      if (failures.length && !merged.length) {
        error.value = failureText(failures[0]);
        errorDetail.value = failures[0].messageKey ? failures[0].detail : "";
      } else if (failures.length) {
        partialError.value = t("library.reserve.mine.partialError");
      }
      loading.value = false;
    };
    const askCancel = (item) => {
      if (!item.aprvId) {
        showToast(t("library.reserve.mine.noAprvId"), "warning");
        return;
      }
      pendingCancel.value = item;
      cancelVisible.value = true;
    };
    const confirmCancel = async () => {
      const item = pendingCancel.value;
      if (!item || !item.aprvId) {
        cancelVisible.value = false;
        return;
      }
      cancelling.value = true;
      try {
        const res = await invokeNative("library_reserve_cancel", {
          req: { app: item.app, aprv_id: String(item.aprvId) }
        });
        cancelVisible.value = false;
        showToast(res?.message || t("library.reserve.toast.cancelSuccess"), "success");
        await load();
      } catch (e) {
        cancelVisible.value = false;
        const failure = parseReserveFailure(e);
        showToast(failureText(failure), failure.network ? "warning" : "error", failure.network ? 2600 : 3400);
      } finally {
        cancelling.value = false;
      }
    };
    const cancelBody = computed(() => {
      const item = pendingCancel.value;
      if (!item) return "";
      return tf("library.reserve.cancel.body", {
        name: item.name,
        date: item.date,
        time: timeText(item)
      });
    });
    onMounted(load);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("div", _hoisted_2$1, [
          createBaseVNode("h2", _hoisted_3$1, toDisplayString(unref(t)("library.reserve.mine.title")), 1),
          createBaseVNode("button", {
            type: "button",
            class: "link",
            disabled: loading.value,
            onClick: load
          }, toDisplayString(unref(t)("library.reserve.mine.refresh")), 9, _hoisted_4$1)
        ]),
        partialError.value ? (openBlock(), createElementBlock("p", _hoisted_5$1, toDisplayString(partialError.value), 1)) : createCommentVNode("", true),
        loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
          key: 1,
          class: "span-all",
          type: "loading",
          message: unref(t)("library.reserve.mine.loading")
        }, null, 8, ["message"])) : error.value ? (openBlock(), createElementBlock("section", _hoisted_6$1, [
          createBaseVNode("p", _hoisted_7$1, toDisplayString(error.value), 1),
          errorDetail.value ? (openBlock(), createElementBlock("p", _hoisted_8, toDisplayString(errorDetail.value), 1)) : createCommentVNode("", true),
          createBaseVNode("button", {
            type: "button",
            class: "ghost",
            onClick: load
          }, toDisplayString(unref(t)("library.reserve.btn.retry")), 1)
        ])) : !items.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
          key: 3,
          class: "span-all",
          type: "empty",
          message: unref(t)("library.reserve.mine.empty")
        }, {
          default: withCtx(() => [
            createBaseVNode("p", _hoisted_9, toDisplayString(unref(t)("library.reserve.mine.hint")), 1)
          ]),
          _: 1
        }, 8, ["message"])) : (openBlock(true), createElementBlock(Fragment, { key: 4 }, renderList(items.value, (item) => {
          return openBlock(), createElementBlock("article", {
            key: item.key,
            class: "card order"
          }, [
            createBaseVNode("div", _hoisted_10, [
              createBaseVNode("strong", _hoisted_11, toDisplayString(item.name), 1),
              createBaseVNode("span", _hoisted_12, toDisplayString(item.statusName || unref(t)("library.reserve.mine.statusFallback")), 1)
            ]),
            createBaseVNode("p", _hoisted_13, toDisplayString(item.date) + " " + toDisplayString(timeText(item)), 1),
            createBaseVNode("div", _hoisted_14, [
              createBaseVNode("button", {
                type: "button",
                class: "ghost",
                onClick: ($event) => askCancel(item)
              }, toDisplayString(unref(t)("library.reserve.cancel.action")), 9, _hoisted_15)
            ])
          ]);
        }), 128)),
        createVNode(unref(TModal), {
          visible: cancelVisible.value,
          title: unref(t)("library.reserve.cancel.title"),
          width: "400px",
          onClose: _cache[1] || (_cache[1] = ($event) => cancelVisible.value = false)
        }, {
          footer: withCtx(() => [
            createBaseVNode("button", {
              type: "button",
              class: "ghost",
              disabled: cancelling.value,
              onClick: _cache[0] || (_cache[0] = ($event) => cancelVisible.value = false)
            }, toDisplayString(unref(t)("library.reserve.btn.back")), 9, _hoisted_17),
            createBaseVNode("button", {
              type: "button",
              class: "danger",
              disabled: cancelling.value,
              onClick: confirmCancel
            }, toDisplayString(cancelling.value ? unref(t)("library.reserve.btn.submitting") : unref(t)("library.reserve.btn.confirm")), 9, _hoisted_18)
          ]),
          default: withCtx(() => [
            createBaseVNode("p", _hoisted_16, toDisplayString(cancelBody.value), 1)
          ]),
          _: 1
        }, 8, ["visible", "title"])
      ]);
    };
  }
};
const ReserveMinePanel = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-018674ee"]]);
const _hoisted_1 = { class: "page" };
const _hoisted_2 = { class: "body" };
const _hoisted_3 = {
  key: 0,
  class: "guide"
};
const _hoisted_4 = { class: "guide__title" };
const _hoisted_5 = { class: "guide__desc" };
const _hoisted_6 = ["aria-label"];
const _hoisted_7 = ["aria-selected", "onClick"];
const _sfc_main = {
  __name: "LibraryReserveView",
  emits: ["back", "require-login"],
  setup(__props, { emit: __emit }) {
    const { t } = useLocale();
    const authStore = useAuthStore();
    const emit = __emit;
    const TABS = ["seat", "quiet", "room", "mine"];
    const activeTab = ref("seat");
    const canUse = computed(() => Boolean(authStore.isLoggedIn && authStore.sessionVerified));
    const selectTab = (tabKey) => {
      activeTab.value = tabKey;
    };
    const goLogin = () => emit("require-login");
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$5), {
          title: unref(t)("library.reserve.title"),
          icon: "event_seat",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, null, 8, ["title"]),
        createBaseVNode("div", _hoisted_2, [
          !canUse.value ? (openBlock(), createElementBlock("section", _hoisted_3, [
            _cache[1] || (_cache[1] = createBaseVNode("span", {
              class: "guide__icon material-symbols-outlined",
              "aria-hidden": "true"
            }, "account_circle", -1)),
            createBaseVNode("h2", _hoisted_4, toDisplayString(unref(t)("library.reserve.login.title")), 1),
            createBaseVNode("p", _hoisted_5, toDisplayString(unref(t)("library.reserve.login.desc")), 1),
            createBaseVNode("button", {
              type: "button",
              class: "primary",
              onClick: goLogin
            }, toDisplayString(unref(t)("library.reserve.login.action")), 1)
          ])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("div", {
              class: "tabs",
              role: "tablist",
              "aria-label": unref(t)("library.reserve.title")
            }, [
              (openBlock(), createElementBlock(Fragment, null, renderList(TABS, (tabKey) => {
                return createBaseVNode("button", {
                  key: tabKey,
                  type: "button",
                  class: normalizeClass(["tab", { active: activeTab.value === tabKey }]),
                  role: "tab",
                  "aria-selected": activeTab.value === tabKey,
                  onClick: ($event) => selectTab(tabKey)
                }, toDisplayString(unref(t)(`library.reserve.tab.${tabKey}`)), 11, _hoisted_7);
              }), 64))
            ], 8, _hoisted_6),
            activeTab.value === "seat" ? (openBlock(), createBlock(ReserveSeatPanel, { key: 0 })) : activeTab.value === "quiet" ? (openBlock(), createBlock(ReserveRoomPanel, {
              key: "quiet",
              app: "quiet_room"
            })) : activeTab.value === "room" ? (openBlock(), createBlock(ReserveRoomPanel, {
              key: "room",
              app: "seminar_room"
            })) : (openBlock(), createBlock(ReserveMinePanel, { key: 3 }))
          ], 64))
        ])
      ]);
    };
  }
};
const LibraryReserveView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-ef1d4b7c"]]);
export {
  LibraryReserveView as default
};
