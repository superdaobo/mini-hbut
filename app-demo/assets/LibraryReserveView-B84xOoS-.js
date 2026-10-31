var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { _ as _sfc_main$5 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-DPr8J7w0.js";
import { _ as _export_sfc, b as useLocale, z as tf, bZ as TModal, an as looksLikeHtml, ao as sanitizeSchoolInboxHtml, b_ as linkifyPlainText, q as showToast, c as useAuthStore } from "./app-demo-BXR7Wchv.js";
import { x as watch, o as onMounted, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, j as createBlock, d as createCommentVNode, F as Fragment, L as withDirectives, P as vModelSelect, f as renderList, g as createTextVNode, n as normalizeClass, k as createVNode, l as withCtx, M as vModelText, r as ref, h as computed, e as normalizeStyle } from "./vue-core-CVT-P0lT.js";
import { d as invokeNative } from "./runtime-bridge-z2ulLxEq.js";
import { T as TEmptyState } from "./TEmptyState-Bpftv9OS.js";
import { T as TCollapse } from "./TCollapse-Dagrwt7i.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import "./more-modules-DkooyOvE.js";
import "./debug-tools-B-8Pd-e1.js";
import "./capture-CoTlEFL0.js";
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
const MS_TIMESTAMP_MIN = 1e11;
const hmFromMs = (ms) => {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad2$1(date.getHours())}:${pad2$1(date.getMinutes())}`;
};
const toLocalHm = (raw) => {
  if (raw === null || raw === void 0 || raw === "") return "";
  if (typeof raw === "number") {
    return Number.isFinite(raw) && Math.abs(raw) >= MS_TIMESTAMP_MIN ? hmFromMs(raw) : "";
  }
  const text = String(raw).trim();
  if (!text) return "";
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return Math.abs(n) >= MS_TIMESTAMP_MIN ? hmFromMs(n) : "";
  }
  if (text.includes(":")) return extractHm(text);
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? "" : hmFromMs(parsed);
};
const asRecord$1 = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const toInt$1 = (value) => {
  if (value === null || value === void 0 || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
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
const sortKeyOf = (value) => value.date ? `${value.date} ${value.start || "00:00"}` : "9999-99-99 99:99";
const nestedRawOf = (record) => asRecord$1(record.raw);
const pickEntryValue = (record, keys) => {
  const nested = nestedRawOf(record);
  for (const key of keys) {
    const direct = record[key];
    if (direct !== null && direct !== void 0 && String(direct).trim() !== "") return direct;
    const inner = nested[key];
    if (inner !== null && inner !== void 0 && String(inner).trim() !== "") return inner;
  }
  return void 0;
};
const resolveRecordId = (record) => {
  for (const key of ["id", "itemId", "aprvId"]) {
    const value = toInt$1(pickEntryValue(record, [key]));
    if (value !== null && value !== 0) return String(value);
  }
  return "";
};
const resolveCancelled = (record) => {
  const raw = pickEntryValue(record, ["isCancel", "is_cancel", "canceled", "cancelled"]);
  if (raw === true) return true;
  const n = toInt$1(raw);
  return n !== null && n !== 0;
};
const normalizeMyReservation = (raw, app, index) => {
  const record = asRecord$1(raw);
  const recordId = resolveRecordId(record);
  const cancelled = resolveCancelled(record);
  return {
    key: `${app}-${recordId || "row"}-${index}`,
    app,
    recordId,
    statusName: String(
      pickEntryValue(record, ["statusName", "aprvStatusName", "statusText"]) ?? ""
    ).trim(),
    statusKey: cancelled ? "library.reserve.mine.statusCancelled" : "library.reserve.mine.statusFallback",
    name: String(pickEntryValue(record, ["name", "itemName", "reserveName", "roomName"]) ?? "").trim(),
    date: String(pickEntryValue(record, ["today", "date", "reserveDate", "day"]) ?? "").trim(),
    start: toLocalHm(pickEntryValue(record, ["starttime", "startTime", "beginTime"])),
    end: toLocalHm(pickEntryValue(record, ["endtime", "endTime", "finishTime"])),
    status: toInt$1(pickEntryValue(record, ["status", "aprvStatus"])),
    cancelled,
    raw: record
  };
};
const RESERVE_ERROR_MESSAGE_KEYS = {
  chaoxing_not_logged_in: "library.reserve.error.notLoggedIn",
  no_permission: "library.reserve.error.noPermission",
  // #1075：预约凭证未取得或已失效（入口页 `*Enc` 缺失 / 过期），可重试；
  // 语义**不是**「无权限」，故与 noPermission 分开映射。
  credential_invalid: "library.reserve.error.credentialInvalid",
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
const RESERVE_ERROR_DETAIL_MAX = 200;
const truncateReserveDetail = (detail, max = RESERVE_ERROR_DETAIL_MAX) => {
  const text = String(detail ?? "").trim();
  if (!text) return "";
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : RESERVE_ERROR_DETAIL_MAX;
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};
const formatReserveFailureText = (failure, translate, fallbackKey = "library.reserve.error.unknown") => {
  const detail = truncateReserveDetail(failure.detail);
  const base = failure.messageKey ? translate(failure.messageKey) : "";
  if (!base) return detail || translate(fallbackKey);
  if (!detail) return base;
  return `${base}${translate("library.reserve.error.detailSuffix")}${detail}`;
};
const SIGN_SCRIPT_URL = "https://office-static.chaoxing.com/r/staticreserve/js/src/front/apps/common/enc/min/submitVerify.min.js";
const MD5_SCRIPT_URL = "https://office-static.chaoxing.com/r/staticreserve/js/lib/md5/md5.js";
const MD5_GLOBAL = "hex_md5";
const SUBMIT_ENC_ELEMENT_ID = "submit_enc";
class SeatSignError extends Error {
  constructor(code, detail = "") {
    super(detail || code);
    __publicField(this, "code");
    this.name = "SeatSignError";
    this.code = code;
  }
}
let modulePromise = null;
const GLOBAL_MODULE_KEYS = ["submitVerify", "submitVerifyModule"];
const ensureSubmitEncInput = (submitEnc) => {
  const existing = document.getElementById(SUBMIT_ENC_ELEMENT_ID);
  if (existing instanceof HTMLInputElement) {
    existing.value = submitEnc;
    return;
  }
  const input = document.createElement("input");
  input.type = "hidden";
  input.id = SUBMIT_ENC_ELEMENT_ID;
  input.value = submitEnc;
  document.body.appendChild(input);
};
const pickModule = (captured) => {
  if (captured && typeof captured.verifyParam === "function") {
    return captured;
  }
  const globalRecord = globalThis;
  for (const key of GLOBAL_MODULE_KEYS) {
    const candidate = globalRecord[key];
    if (candidate && typeof candidate.verifyParam === "function") {
      return candidate;
    }
  }
  return null;
};
const fetchText = async (url) => {
  let response;
  try {
    response = await fetch(url, { credentials: "omit" });
  } catch {
    throw new SeatSignError("script_load");
  }
  if (!response.ok) throw new SeatSignError("script_load", `HTTP ${response.status}`);
  const source = await response.text();
  if (!source.trim()) throw new SeatSignError("script_load", "empty script");
  return source;
};
const injectScript = (source) => {
  let captured = null;
  const shim = (...args) => {
    const factory = args[args.length - 1];
    if (typeof factory === "function") {
      captured = factory();
    }
  };
  shim.amd = true;
  const globalRecord = globalThis;
  const previous = globalRecord.define;
  globalRecord.define = shim;
  try {
    const script = document.createElement("script");
    script.textContent = source;
    document.head.appendChild(script);
  } catch (error) {
    throw new SeatSignError("module_missing", error instanceof Error ? error.message : "");
  } finally {
    globalRecord.define = previous;
  }
  return captured;
};
const ensureMd5Global = async () => {
  const globalRecord = globalThis;
  if (typeof globalRecord[MD5_GLOBAL] === "function") return;
  injectScript(await fetchText(MD5_SCRIPT_URL));
};
const loadSignModule = () => {
  if (modulePromise) return modulePromise;
  const pending = (async () => {
    await ensureMd5Global();
    const module = pickModule(injectScript(await fetchText(SIGN_SCRIPT_URL)));
    if (!module) throw new SeatSignError("module_missing");
    return module;
  })();
  modulePromise = pending.catch((error) => {
    modulePromise = null;
    throw error;
  });
  return modulePromise;
};
const buildSeatEnc = async (input, submitEnc) => {
  if (typeof document === "undefined" || typeof fetch !== "function") {
    throw new SeatSignError("script_load", "no dom");
  }
  ensureSubmitEncInput(submitEnc);
  const module = await loadSignModule();
  let enc;
  try {
    enc = module.verifyParam({
      roomId: input.roomId,
      startTime: input.startTime,
      endTime: input.endTime,
      day: input.day,
      captcha: input.captcha,
      seatNum: input.seatNum,
      wyToken: "",
      wfwEngineEnc: input.wfwEngineEnc
    });
  } catch {
    throw new SeatSignError("sign_failed");
  }
  const text = typeof enc === "string" ? enc.trim() : "";
  if (!text) throw new SeatSignError("sign_failed");
  return text;
};
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
    // allowReserveNow 未在 Rust 侧建模，只存在于透传的原始 `seatConfig`（`config.raw`）中；
    // 顶层同名键作为兜底（兼容后端后续把它提升为归一化字段）。
    allowReserveNow: toInt(asRecord(record.raw).allowReserveNow ?? record.allowReserveNow),
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
const hmToMinutes$1 = (hm) => {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(String(hm ?? "").trim());
  if (!matched) return null;
  const h = Number(matched[1]);
  const m = Number(matched[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};
const seatMsToServerHm = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "";
  const shifted = new Date(n + SERVER_TZ_OFFSET_MINUTES * 6e4);
  if (Number.isNaN(shifted.getTime())) return "";
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
};
const offsetMsToHm = (epochMs) => {
  const n = Number(epochMs);
  if (!Number.isFinite(n) || n < 0) return "";
  const shifted = new Date(n + SERVER_TZ_OFFSET_MINUTES * 6e4);
  if (Number.isNaN(shifted.getTime())) return "";
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
};
const buildSeatTimeSlices = (startOffsetMs, endOffsetMs, timeUnitMin) => {
  const unitRaw = Number(timeUnitMin);
  const unit = Number.isFinite(unitRaw) && unitRaw > 0 ? Math.floor(unitRaw) : 60;
  const step = unit * 6e4;
  const startRaw = Number(startOffsetMs);
  const start = Number.isFinite(startRaw) && startRaw >= 0 ? Math.floor(startRaw) : 0;
  const endRaw = Number(endOffsetMs);
  const end = Number.isFinite(endRaw) && endRaw > start ? Math.floor(endRaw) : start;
  const slices = [];
  for (let offset = start; offset <= end; offset += step) {
    slices.push({ offsetMs: offset, label: offsetMsToHm(offset) });
  }
  if (!slices.length) slices.push({ offsetMs: start, label: offsetMsToHm(start) });
  return slices;
};
const normalizeSeatLevels = (raw) => {
  const record = asRecord(raw);
  const list = Array.isArray(record.levels) ? record.levels : [];
  const out = [];
  for (const entry of list) {
    const text = toStr(entry);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
};
const normalizeSeatMatch = (raw) => {
  const record = asRecord(raw);
  const match = record.match;
  if (!match || typeof match !== "object" || Array.isArray(match)) return null;
  const view = asRecord(match);
  return {
    roomId: toStr(view.roomId),
    seatNum: toStr(view.seatNum),
    firstLevelName: toStr(view.firstLevelName),
    secondLevelName: toStr(view.secondLevelName),
    thirdLevelName: toStr(view.thirdLevelName),
    startTimeMs: toInt(view.startTimeMs),
    endTimeMs: toInt(view.endTimeMs),
    duration: toStr(view.duration)
  };
};
const seatMatchAreaText = (match) => {
  if (!match) return "";
  return [match.firstLevelName, match.secondLevelName, match.thirdLevelName].filter((part) => part).join(" / ");
};
const seatMatchTimeText = (match, placeholder = "--:--") => {
  if (!match) return "";
  const start = seatMsToServerHm(match.startTimeMs) || placeholder;
  const end = seatMsToServerHm(match.endTimeMs) || placeholder;
  return `${start}-${end}`;
};
const seatMsToServerDate = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "";
  const shifted = new Date(n + SERVER_TZ_OFFSET_MINUTES * 6e4);
  if (Number.isNaN(shifted.getTime())) return "";
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
};
const buildSeatTimeCells = (slices) => {
  const cells = [];
  for (let index = 0; index < slices.length - 1; index += 1) {
    const start = slices[index];
    const end = slices[index + 1];
    if (!start?.label || !end?.label) continue;
    cells.push({
      startIndex: index,
      endIndex: index + 1,
      start: start.label,
      end: end.label,
      label: `${start.label}-${end.label}`
    });
  }
  return cells;
};
const resolveSeatTimeCellClick = (current, cellIndex) => {
  const index = Math.trunc(Number(cellIndex));
  if (!Number.isFinite(index) || index < 0) return current;
  if (!current) return { startIndex: index, endIndex: index + 1 };
  if (index === current.startIndex) return null;
  if (index < current.startIndex) return { startIndex: index, endIndex: index + 1 };
  return { startIndex: current.startIndex, endIndex: index + 1 };
};
const seatCellState = (cell, selection) => {
  if (!selection) return "off";
  if (cell.startIndex === selection.startIndex) return "anchor";
  if (cell.startIndex > selection.startIndex && cell.startIndex < selection.endIndex) return "on";
  return "off";
};
const seatSelectionRangeText = (slices, selection) => {
  if (!selection) return "";
  const start = slices[selection.startIndex]?.label;
  const end = slices[selection.endIndex]?.label;
  if (!start || !end) return "";
  return `${start}-${end}`;
};
const isSeatCellPast = (cell, clock, allowReserveNow, dateKey = "") => {
  if (!clock) return false;
  if (dateKey) {
    if (dateKey < clock.dateKey) return true;
    if (dateKey > clock.dateKey) return false;
  }
  const start = hmToMinutes$1(cell.start);
  const end = hmToMinutes$1(cell.end);
  if (end !== null && end <= clock.minutes) return true;
  if (allowReserveNow === 0 && start !== null && start <= clock.minutes) return true;
  return false;
};
const resolveSeatDefaultSelection = (cells, clock, allowReserveNow, dateKey = "", minUnits = 2) => {
  if (!cells.length) return null;
  const first = cells.findIndex((cell) => !isSeatCellPast(cell, clock, allowReserveNow, dateKey));
  if (first < 0) return null;
  const span = Math.max(1, Math.floor(minUnits));
  const lastIndex = Math.min(cells.length - 1, first + span - 1);
  return { startIndex: cells[first].startIndex, endIndex: cells[lastIndex].endIndex };
};
const WFW_ENC_KEYS = ["wfwEngineEnc", "wfwEnc", "wfw_engine_enc", "wfwEngine"];
const normalizeSeatPrepare = (raw) => {
  const record = asRecord(raw);
  let wfwEngineEnc = "";
  for (const key of WFW_ENC_KEYS) {
    const value = toStr(record[key]);
    if (value) {
      wfwEngineEnc = value;
      break;
    }
  }
  return {
    captchaUrl: toStr(record.captchaUrl),
    submitEnc: toStr(record.submitEnc),
    wfwEngineEnc,
    raw: record
  };
};
const parseRoomId = (raw) => {
  const text = toStr(raw).trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};
const resolveSeatSubmitParams = (match, ymd, fallbackStart, fallbackEnd) => {
  if (!match || !match.seatNum) return null;
  const roomId = parseRoomId(match.roomId);
  if (roomId === null) return null;
  const startTime = seatMsToServerHm(match.startTimeMs) || toStr(fallbackStart);
  const endTime = seatMsToServerHm(match.endTimeMs) || toStr(fallbackEnd);
  const day = seatMsToServerDate(match.startTimeMs) || toStr(ymd);
  if (!startTime || !endTime || !day) return null;
  return { roomId, seatNum: match.seatNum, startTime, endTime, day };
};
const _hoisted_1$4 = { class: "panel" };
const _hoisted_2$4 = { class: "bar span-all" };
const _hoisted_3$4 = { class: "bar__title" };
const _hoisted_4$4 = ["disabled"];
const _hoisted_5$4 = ["value"];
const _hoisted_6$4 = {
  key: 1,
  class: "card error-card span-all"
};
const _hoisted_7$4 = { class: "err" };
const _hoisted_8$3 = {
  key: 0,
  class: "hint"
};
const _hoisted_9$3 = { class: "card func span-all" };
const _hoisted_10$3 = { class: "card__title" };
const _hoisted_11$3 = {
  key: 0,
  class: "field"
};
const _hoisted_12$3 = {
  class: "field__label",
  for: "seat-level1"
};
const _hoisted_13$3 = { value: "" };
const _hoisted_14$2 = ["value"];
const _hoisted_15$2 = {
  key: 1,
  class: "field"
};
const _hoisted_16$2 = {
  class: "field__label",
  for: "seat-level2"
};
const _hoisted_17$2 = { value: "" };
const _hoisted_18$2 = ["value"];
const _hoisted_19$2 = {
  key: 2,
  class: "field"
};
const _hoisted_20$2 = {
  class: "field__label",
  for: "seat-level3"
};
const _hoisted_21$2 = { value: "" };
const _hoisted_22$2 = ["value"];
const _hoisted_23$2 = { class: "grid-block" };
const _hoisted_24$1 = { class: "grid-block__head" };
const _hoisted_25$1 = { class: "field__label" };
const _hoisted_26$1 = { class: "grid-block__picked" };
const _hoisted_27$1 = ["aria-label"];
const _hoisted_28$1 = ["disabled", "aria-pressed", "onClick"];
const _hoisted_29$1 = {
  key: 0,
  class: "hint hint--warn"
};
const _hoisted_30$1 = { class: "hint" };
const _hoisted_31$1 = ["disabled"];
const _hoisted_32$1 = {
  key: 3,
  class: "match match--error"
};
const _hoisted_33$1 = { class: "err" };
const _hoisted_34$1 = {
  key: 4,
  class: "match"
};
const _hoisted_35$1 = { class: "match__title" };
const _hoisted_36$1 = { class: "match__row" };
const _hoisted_37$1 = { class: "match__row match__row--seat" };
const _hoisted_38$1 = { class: "match__row" };
const _hoisted_39$1 = { class: "hint hint--warn" };
const _hoisted_40$1 = {
  key: 5,
  class: "match match--ok"
};
const _hoisted_41$1 = { class: "match__title" };
const _hoisted_42$1 = { class: "match__row" };
const _hoisted_43$1 = { class: "match__row match__row--seat" };
const _hoisted_44$1 = { class: "match__row" };
const _hoisted_45$1 = { class: "match__row" };
const _hoisted_46$1 = {
  key: 6,
  class: "hint hint--warn"
};
const _hoisted_47$1 = {
  key: 1,
  class: "hint"
};
const _hoisted_48$1 = {
  key: 2,
  class: "hint"
};
const _hoisted_49$1 = { class: "card span-all" };
const _hoisted_50$1 = { class: "card__title" };
const _hoisted_51$1 = {
  key: 0,
  class: "hint"
};
const _hoisted_52$1 = {
  key: 1,
  class: "records"
};
const _hoisted_53$1 = { class: "record__name" };
const _hoisted_54$1 = { class: "record__meta" };
const _hoisted_55$1 = { key: 0 };
const _hoisted_56$1 = { key: 1 };
const _hoisted_57$1 = { class: "card__title card__title--gap" };
const _hoisted_58 = {
  key: 2,
  class: "hint"
};
const _hoisted_59 = {
  key: 3,
  class: "records"
};
const _hoisted_60 = { class: "record__name" };
const _hoisted_61 = { class: "record__meta" };
const _hoisted_62 = { key: 0 };
const _hoisted_63 = { key: 1 };
const _hoisted_64 = { class: "card span-all" };
const _hoisted_65 = { class: "card__title" };
const _hoisted_66 = { class: "hint" };
const _hoisted_67 = { class: "card notice span-all" };
const _hoisted_68 = {
  key: 0,
  class: "notice__time"
};
const _hoisted_69 = {
  key: 1,
  class: "notice__violation"
};
const _hoisted_70 = { class: "notice__label" };
const _hoisted_71 = { class: "notice__list" };
const _hoisted_72 = {
  key: 1,
  class: "notice__list"
};
const _hoisted_73 = { class: "notice__subtitle" };
const _hoisted_74 = ["innerHTML"];
const _hoisted_75 = { class: "hint notice__unsupported" };
const _hoisted_76 = {
  key: 0,
  class: "confirm__rows"
};
const _hoisted_77 = { class: "confirm__line" };
const _hoisted_78 = { class: "confirm__line" };
const _hoisted_79 = { class: "confirm__line" };
const _hoisted_80 = { class: "confirm__warn" };
const _hoisted_81 = {
  key: 1,
  class: "hint"
};
const _hoisted_82 = { class: "err" };
const _hoisted_83 = ["disabled"];
const _hoisted_84 = ["src", "alt"];
const _hoisted_85 = { class: "field" };
const _hoisted_86 = {
  class: "field__label",
  for: "seat-captcha"
};
const _hoisted_87 = ["placeholder"];
const _hoisted_88 = ["disabled"];
const _hoisted_89 = {
  key: 4,
  class: "err"
};
const _hoisted_90 = ["disabled"];
const _hoisted_91 = ["disabled"];
const SEAT_APP = "seat";
const _sfc_main$4 = {
  __name: "ReserveSeatPanel",
  emits: ["open-official"],
  setup(__props, { emit: __emit }) {
    const { t } = useLocale();
    const emit = __emit;
    const loading = ref(true);
    const error = ref("");
    const errorDetail = ref("");
    const payload = ref(null);
    const failureText = (failure, fallbackKey = "library.reserve.error.unknown") => formatReserveFailureText(failure, t, fallbackKey);
    const config = computed(() => normalizeSeatConfig(payload.value?.config));
    const clock = computed(() => parseSeatClock(payload.value?.serverNow));
    const serverClockText = computed(
      () => clock.value ? `${clock.value.dateKey} ${clock.value.clock}` : ""
    );
    const todayRange = computed(() => resolveTodayOpenRange(config.value, clock.value));
    const openState = computed(() => resolveOpenState(clock.value, todayRange.value));
    const openStateText = computed(() => {
      if (openState.value === "open") return t("library.reserve.seat.open.open");
      if (openState.value === "before") return t("library.reserve.seat.open.before");
      if (openState.value === "after") return t("library.reserve.seat.open.after");
      return t("library.reserve.seat.open.unknown");
    });
    const releaseStateText = computed(() => {
      const state = resolveReleaseState(clock.value, config.value.reserveBeforeTime);
      if (state === "released") return t("library.reserve.seat.release.released");
      if (state === "pending") {
        return tf("library.reserve.seat.release.pending", { time: config.value.reserveBeforeTime });
      }
      return t("library.reserve.seat.release.unknown");
    });
    const level1Options = ref([]);
    const level2Options = ref([]);
    const level3Options = ref([]);
    const firstLevel = ref("");
    const secondLevel = ref("");
    const thirdLevel = ref("");
    const loadLevels = async (levelType, params = {}) => {
      try {
        const req = { app: SEAT_APP, level_type: levelType };
        if (params.firstLevelName) req.first_level_name = params.firstLevelName;
        if (params.secondLevelName) req.second_level_name = params.secondLevelName;
        const res = await invokeNative("library_reserve_seat_levels", { req });
        return normalizeSeatLevels(res);
      } catch {
        return [];
      }
    };
    const timeRange = ref(null);
    const timeRangeReady = ref(false);
    const slices = computed(
      () => buildSeatTimeSlices(timeRange.value?.startOffsetMs, timeRange.value?.endOffsetMs, config.value.timeUnit)
    );
    const cells = computed(() => buildSeatTimeCells(slices.value));
    const selection = ref(null);
    const isCellPast = (cell) => isSeatCellPast(cell, clock.value, config.value.allowReserveNow, timeRange.value?.ymd);
    const hasSelectableCell = computed(() => cells.value.some((cell) => !isCellPast(cell)));
    watch(
      [cells, clock, config],
      () => {
        selection.value = resolveSeatDefaultSelection(
          cells.value,
          clock.value,
          config.value.allowReserveNow,
          timeRange.value?.ymd
        );
      },
      { immediate: true }
    );
    const selectCell = (cell) => {
      if (isCellPast(cell)) return;
      selection.value = resolveSeatTimeCellClick(selection.value, cell.startIndex);
      resetMatch();
    };
    const cellClass = (cell) => {
      if (isCellPast(cell)) return "cell cell--past";
      const state = seatCellState(cell, selection.value);
      if (state === "anchor") return "cell cell--anchor";
      if (state === "on") return "cell cell--on";
      return "cell";
    };
    const selectionText = computed(() => seatSelectionRangeText(slices.value, selection.value));
    const startSlice = computed(
      () => selection.value ? slices.value[selection.value.startIndex] || null : null
    );
    const endSlice = computed(
      () => selection.value ? slices.value[selection.value.endIndex] || null : null
    );
    const canSearch = computed(() => Boolean(startSlice.value && endSlice.value));
    const matching = ref(false);
    const matchError = ref("");
    const match = ref(null);
    const searched = ref(false);
    const findSeat = async () => {
      if (!canSearch.value || matching.value) return;
      matching.value = true;
      matchError.value = "";
      match.value = null;
      submitSummary.value = null;
      searched.value = true;
      try {
        const req = {
          app: SEAT_APP,
          start_time: startSlice.value.label,
          end_time: endSlice.value.label
        };
        if (firstLevel.value) req.first_level_name = firstLevel.value;
        if (secondLevel.value) req.second_level_name = secondLevel.value;
        if (thirdLevel.value) req.third_level_name = thirdLevel.value;
        const res = await invokeNative("library_reserve_seat_match", { req });
        match.value = normalizeSeatMatch(res);
      } catch (e) {
        matchError.value = failureText(parseReserveFailure(e));
      } finally {
        matching.value = false;
      }
    };
    const matchAreaText = computed(() => seatMatchAreaText(match.value));
    const matchTimeText = computed(() => seatMatchTimeText(match.value, t("library.reserve.seat.row.timeUnknown")));
    const submitVisible = ref(false);
    const preparing = ref(false);
    const submitting = ref(false);
    const prepareError = ref("");
    const submitError = ref("");
    const prepare = ref(null);
    const captcha = ref("");
    const submitSummary = ref(null);
    const signErrorText = (error2) => {
      const base = error2.code === "script_load" ? t("library.reserve.seat.submit.error.signScript") : error2.code === "module_missing" ? t("library.reserve.seat.submit.error.signModule") : t("library.reserve.seat.submit.error.sign");
      const detail = error2.message && error2.message !== error2.code ? truncateReserveDetail(error2.message) : "";
      return detail ? `${base}${t("library.reserve.error.detailSuffix")}${detail}` : base;
    };
    const openSubmit = () => {
      if (!match.value) return;
      submitVisible.value = true;
      submitError.value = "";
      prepareError.value = "";
      captcha.value = "";
      void prepareCaptcha();
    };
    const prepareCaptcha = async () => {
      preparing.value = true;
      prepareError.value = "";
      try {
        const res = await invokeNative("library_reserve_seat_submit_prepare", { req: { app: SEAT_APP } });
        const view = normalizeSeatPrepare(res);
        prepare.value = view;
        if (!view.captchaUrl) prepareError.value = t("library.reserve.seat.submit.error.captcha");
      } catch (e) {
        prepare.value = null;
        prepareError.value = failureText(
          parseReserveFailure(e),
          "library.reserve.seat.submit.error.captcha"
        );
      } finally {
        preparing.value = false;
      }
    };
    const confirmSubmit = async () => {
      const target = match.value;
      const params = resolveSeatSubmitParams(
        target,
        timeRange.value?.ymd,
        startSlice.value?.label || "",
        endSlice.value?.label || ""
      );
      if (!params) {
        submitError.value = t("library.reserve.seat.submit.error.params");
        return;
      }
      const code = captcha.value.trim();
      if (!code) {
        submitError.value = t("library.reserve.seat.submit.captchaRequired");
        return;
      }
      if (!prepare.value) {
        submitError.value = prepareError.value || t("library.reserve.seat.submit.error.captcha");
        return;
      }
      submitting.value = true;
      submitError.value = "";
      try {
        const enc = await buildSeatEnc(
          { ...params, captcha: code, wfwEngineEnc: prepare.value.wfwEngineEnc },
          prepare.value.submitEnc
        );
        await invokeNative("library_reserve_seat_submit", {
          req: {
            app: SEAT_APP,
            room_id: params.roomId,
            seat_num: params.seatNum,
            start_time: params.startTime,
            end_time: params.endTime,
            day: params.day,
            captcha: code,
            enc
          }
        });
        submitSummary.value = {
          seat: params.seatNum,
          area: matchAreaText.value,
          range: `${params.startTime}-${params.endTime}`,
          day: params.day
        };
        submitVisible.value = false;
        resetMatch();
        showToast(t("library.reserve.seat.submit.success"), "success", 3200);
        await loadConfig();
      } catch (e) {
        if (e instanceof SeatSignError) {
          submitError.value = signErrorText(e);
        } else {
          submitError.value = failureText(
            parseReserveFailure(e),
            "library.reserve.seat.submit.error.submit"
          );
        }
      } finally {
        submitting.value = false;
      }
    };
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
      if (c.onlySupportsApiSignIn === true) lines.push(t("library.reserve.seat.rule.signInApiOnly"));
      return lines;
    });
    const violationLine = computed(() => {
      const { violateTimes, violationLimitDay, violationLimitDuration } = config.value;
      if (violateTimes !== null && violateTimes > 0 && violationLimitDay !== null && violationLimitDay > 0 && violationLimitDuration !== null && violationLimitDuration > 0) {
        return tf("library.reserve.seat.rule.violation", {
          times: violateTimes,
          days: violationLimitDay,
          duration: violationLimitDuration
        });
      }
      return "";
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
    const hasRuleDetails = computed(() => hasRules.value || Boolean(noticeHtml.value));
    const currentRows = computed(() => normalizeSeatReservations(payload.value?.currentReservations));
    const recentRows = computed(() => normalizeSeatReservations(payload.value?.recentReservations));
    const rowTitle = (row) => row.roomName || row.seatNo || t("library.reserve.seat.row.titleFallback");
    const rowTime = (row) => seatReservationTime(row) || t("library.reserve.seat.row.timeUnknown");
    const loadConfig = async () => {
      loading.value = true;
      error.value = "";
      errorDetail.value = "";
      try {
        const res = await invokeNative("library_reserve_seat_config", { req: { app: SEAT_APP } });
        payload.value = res || null;
      } catch (e) {
        const failure = parseReserveFailure(e);
        payload.value = null;
        error.value = failure.messageKey ? t(failure.messageKey) : failure.detail || t("library.reserve.error.unknown");
        errorDetail.value = failure.messageKey ? truncateReserveDetail(failure.detail) : "";
      } finally {
        loading.value = false;
      }
    };
    const loadTimeRange = async () => {
      timeRangeReady.value = false;
      try {
        const res = await invokeNative("library_reserve_seat_time_range", { req: { app: SEAT_APP } });
        timeRange.value = res || null;
      } catch {
        timeRange.value = null;
      } finally {
        timeRangeReady.value = true;
      }
    };
    const resetMatch = () => {
      match.value = null;
      matchError.value = "";
      searched.value = false;
      submitSummary.value = null;
      submitVisible.value = false;
      submitError.value = "";
    };
    watch(firstLevel, async (value) => {
      secondLevel.value = "";
      thirdLevel.value = "";
      level3Options.value = [];
      resetMatch();
      level2Options.value = value ? await loadLevels(1, { firstLevelName: value }) : [];
    });
    watch(secondLevel, async (value) => {
      thirdLevel.value = "";
      resetMatch();
      level3Options.value = value && firstLevel.value ? await loadLevels(2, { firstLevelName: firstLevel.value, secondLevelName: value }) : [];
    });
    watch(thirdLevel, resetMatch);
    const refresh = async () => {
      await loadConfig();
      if (!error.value) {
        await Promise.all([loadTimeRange(), loadLevels(0).then((list) => level1Options.value = list)]);
      }
    };
    onMounted(refresh);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$4, [
        createBaseVNode("div", _hoisted_2$4, [
          createBaseVNode("h2", _hoisted_3$4, toDisplayString(unref(t)("library.reserve.tab.seat")), 1),
          createBaseVNode("button", {
            type: "button",
            class: "link",
            disabled: loading.value,
            onClick: refresh
          }, toDisplayString(unref(t)("library.reserve.seat.refresh")), 9, _hoisted_4$4)
        ]),
        createBaseVNode("input", {
          id: "submit_enc",
          type: "hidden",
          value: prepare.value?.submitEnc || ""
        }, null, 8, _hoisted_5$4),
        loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
          key: 0,
          class: "span-all",
          type: "loading",
          message: unref(t)("library.reserve.state.loading")
        }, null, 8, ["message"])) : error.value ? (openBlock(), createElementBlock("section", _hoisted_6$4, [
          createBaseVNode("p", _hoisted_7$4, toDisplayString(error.value), 1),
          errorDetail.value ? (openBlock(), createElementBlock("p", _hoisted_8$3, toDisplayString(errorDetail.value), 1)) : createCommentVNode("", true),
          createBaseVNode("button", {
            type: "button",
            class: "ghost",
            onClick: refresh
          }, toDisplayString(unref(t)("library.reserve.btn.retry")), 1)
        ])) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
          createBaseVNode("section", _hoisted_9$3, [
            createBaseVNode("h3", _hoisted_10$3, toDisplayString(unref(t)("library.reserve.seat.find.title")), 1),
            timeRangeReady.value && cells.value.length ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
              level1Options.value.length ? (openBlock(), createElementBlock("div", _hoisted_11$3, [
                createBaseVNode("label", _hoisted_12$3, toDisplayString(unref(t)("library.reserve.seat.find.level1")), 1),
                withDirectives(createBaseVNode("select", {
                  id: "seat-level1",
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => firstLevel.value = $event),
                  class: "select"
                }, [
                  createBaseVNode("option", _hoisted_13$3, toDisplayString(unref(t)("library.reserve.seat.find.all")), 1),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(level1Options.value, (option) => {
                    return openBlock(), createElementBlock("option", {
                      key: option,
                      value: option
                    }, toDisplayString(option), 9, _hoisted_14$2);
                  }), 128))
                ], 512), [
                  [vModelSelect, firstLevel.value]
                ])
              ])) : createCommentVNode("", true),
              level2Options.value.length ? (openBlock(), createElementBlock("div", _hoisted_15$2, [
                createBaseVNode("label", _hoisted_16$2, toDisplayString(unref(t)("library.reserve.seat.find.level2")), 1),
                withDirectives(createBaseVNode("select", {
                  id: "seat-level2",
                  "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => secondLevel.value = $event),
                  class: "select"
                }, [
                  createBaseVNode("option", _hoisted_17$2, toDisplayString(unref(t)("library.reserve.seat.find.all")), 1),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(level2Options.value, (option) => {
                    return openBlock(), createElementBlock("option", {
                      key: option,
                      value: option
                    }, toDisplayString(option), 9, _hoisted_18$2);
                  }), 128))
                ], 512), [
                  [vModelSelect, secondLevel.value]
                ])
              ])) : createCommentVNode("", true),
              level3Options.value.length ? (openBlock(), createElementBlock("div", _hoisted_19$2, [
                createBaseVNode("label", _hoisted_20$2, toDisplayString(unref(t)("library.reserve.seat.find.level3")), 1),
                withDirectives(createBaseVNode("select", {
                  id: "seat-level3",
                  "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => thirdLevel.value = $event),
                  class: "select"
                }, [
                  createBaseVNode("option", _hoisted_21$2, toDisplayString(unref(t)("library.reserve.seat.find.all")), 1),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(level3Options.value, (option) => {
                    return openBlock(), createElementBlock("option", {
                      key: option,
                      value: option
                    }, toDisplayString(option), 9, _hoisted_22$2);
                  }), 128))
                ], 512), [
                  [vModelSelect, thirdLevel.value]
                ])
              ])) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_23$2, [
                createBaseVNode("div", _hoisted_24$1, [
                  createBaseVNode("span", _hoisted_25$1, toDisplayString(unref(t)("library.reserve.seat.time.label.grid")), 1),
                  createBaseVNode("strong", _hoisted_26$1, [
                    selectionText.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                      createTextVNode(toDisplayString(unref(tf)("library.reserve.seat.time.selected", { range: selectionText.value })), 1)
                    ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                      createTextVNode(toDisplayString(unref(t)("library.reserve.seat.time.unselected")), 1)
                    ], 64))
                  ])
                ]),
                createBaseVNode("div", {
                  class: "grid",
                  role: "group",
                  "aria-label": unref(t)("library.reserve.seat.time.label.grid")
                }, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(cells.value, (cell) => {
                    return openBlock(), createElementBlock("button", {
                      key: cell.label,
                      type: "button",
                      class: normalizeClass(cellClass(cell)),
                      disabled: isCellPast(cell),
                      "aria-pressed": !isCellPast(cell) && unref(seatCellState)(cell, selection.value) !== "off",
                      onClick: ($event) => selectCell(cell)
                    }, toDisplayString(cell.label), 11, _hoisted_28$1);
                  }), 128))
                ], 8, _hoisted_27$1),
                !hasSelectableCell.value ? (openBlock(), createElementBlock("p", _hoisted_29$1, toDisplayString(unref(t)("library.reserve.seat.time.allPast")), 1)) : createCommentVNode("", true),
                createVNode(unref(TCollapse), {
                  title: unref(t)("library.reserve.collapse.hint")
                }, {
                  default: withCtx(() => [
                    createBaseVNode("p", _hoisted_30$1, toDisplayString(unref(t)("library.reserve.seat.time.gridHint")), 1)
                  ]),
                  _: 1
                }, 8, ["title"])
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "primary",
                disabled: !canSearch.value || matching.value,
                onClick: findSeat
              }, toDisplayString(matching.value ? unref(t)("library.reserve.seat.find.searching") : unref(t)("library.reserve.seat.find.action")), 9, _hoisted_31$1),
              matchError.value ? (openBlock(), createElementBlock("div", _hoisted_32$1, [
                createBaseVNode("p", _hoisted_33$1, toDisplayString(matchError.value), 1)
              ])) : match.value ? (openBlock(), createElementBlock("div", _hoisted_34$1, [
                createBaseVNode("p", _hoisted_35$1, toDisplayString(unref(t)("library.reserve.seat.find.result")), 1),
                createBaseVNode("p", _hoisted_36$1, toDisplayString(unref(tf)("library.reserve.seat.find.area", { area: matchAreaText.value || "--" })), 1),
                createBaseVNode("p", _hoisted_37$1, toDisplayString(unref(tf)("library.reserve.seat.find.seatNo", { seat: match.value.seatNum || "--" })), 1),
                createBaseVNode("p", _hoisted_38$1, toDisplayString(unref(tf)("library.reserve.seat.find.timeRange", { range: matchTimeText.value })), 1),
                createBaseVNode("p", _hoisted_39$1, toDisplayString(unref(t)("library.reserve.seat.find.locked")), 1),
                createBaseVNode("button", {
                  type: "button",
                  class: "primary",
                  onClick: openSubmit
                }, toDisplayString(unref(t)("library.reserve.seat.find.submit")), 1)
              ])) : submitSummary.value ? (openBlock(), createElementBlock("div", _hoisted_40$1, [
                createBaseVNode("p", _hoisted_41$1, toDisplayString(unref(t)("library.reserve.seat.submit.success")), 1),
                createBaseVNode("p", _hoisted_42$1, toDisplayString(unref(tf)("library.reserve.seat.find.area", { area: submitSummary.value.area || "--" })), 1),
                createBaseVNode("p", _hoisted_43$1, toDisplayString(unref(tf)("library.reserve.seat.find.seatNo", { seat: submitSummary.value.seat })), 1),
                createBaseVNode("p", _hoisted_44$1, toDisplayString(unref(tf)("library.reserve.seat.find.timeRange", { range: submitSummary.value.range })), 1),
                createBaseVNode("p", _hoisted_45$1, toDisplayString(submitSummary.value.day), 1)
              ])) : searched.value ? (openBlock(), createElementBlock("p", _hoisted_46$1, toDisplayString(unref(t)("library.reserve.seat.find.empty")), 1)) : createCommentVNode("", true)
            ], 64)) : !timeRangeReady.value ? (openBlock(), createElementBlock("p", _hoisted_47$1, toDisplayString(unref(t)("library.reserve.state.loading")), 1)) : (openBlock(), createElementBlock("p", _hoisted_48$1, toDisplayString(unref(t)("library.reserve.seat.find.timeUnavailable")), 1))
          ]),
          createBaseVNode("section", _hoisted_49$1, [
            createBaseVNode("h3", _hoisted_50$1, toDisplayString(unref(t)("library.reserve.seat.section.current")), 1),
            !currentRows.value.length ? (openBlock(), createElementBlock("p", _hoisted_51$1, toDisplayString(unref(t)("library.reserve.seat.current.empty")), 1)) : (openBlock(), createElementBlock("ul", _hoisted_52$1, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(currentRows.value, (row) => {
                return openBlock(), createElementBlock("li", {
                  key: row.key,
                  class: "record"
                }, [
                  createBaseVNode("span", _hoisted_53$1, toDisplayString(rowTitle(row)), 1),
                  createBaseVNode("span", _hoisted_54$1, [
                    row.seatNo ? (openBlock(), createElementBlock("span", _hoisted_55$1, toDisplayString(unref(tf)("library.reserve.seat.row.seatNo", { seat: row.seatNo })), 1)) : createCommentVNode("", true),
                    row.date ? (openBlock(), createElementBlock("span", _hoisted_56$1, toDisplayString(row.date), 1)) : createCommentVNode("", true),
                    createTextVNode(toDisplayString(rowTime(row)), 1)
                  ])
                ]);
              }), 128))
            ])),
            createBaseVNode("h3", _hoisted_57$1, toDisplayString(unref(t)("library.reserve.seat.section.recent")), 1),
            !recentRows.value.length ? (openBlock(), createElementBlock("p", _hoisted_58, toDisplayString(unref(t)("library.reserve.seat.recent.empty")), 1)) : (openBlock(), createElementBlock("ul", _hoisted_59, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(recentRows.value, (row) => {
                return openBlock(), createElementBlock("li", {
                  key: row.key,
                  class: "record"
                }, [
                  createBaseVNode("span", _hoisted_60, toDisplayString(rowTitle(row)), 1),
                  createBaseVNode("span", _hoisted_61, [
                    row.seatNo ? (openBlock(), createElementBlock("span", _hoisted_62, toDisplayString(unref(tf)("library.reserve.seat.row.seatNo", { seat: row.seatNo })), 1)) : createCommentVNode("", true),
                    row.date ? (openBlock(), createElementBlock("span", _hoisted_63, toDisplayString(row.date), 1)) : createCommentVNode("", true),
                    createTextVNode(toDisplayString(rowTime(row)), 1)
                  ])
                ]);
              }), 128))
            ]))
          ]),
          createBaseVNode("section", _hoisted_64, [
            createBaseVNode("h3", _hoisted_65, toDisplayString(unref(t)("library.reserve.embed.title")), 1),
            createBaseVNode("p", _hoisted_66, toDisplayString(unref(t)("library.reserve.seat.official.hint")), 1),
            createBaseVNode("button", {
              type: "button",
              class: "ghost",
              onClick: _cache[3] || (_cache[3] = ($event) => emit("open-official"))
            }, toDisplayString(unref(t)("library.reserve.seat.official.action")), 1)
          ]),
          createBaseVNode("section", _hoisted_67, [
            clock.value ? (openBlock(), createElementBlock("p", _hoisted_68, [
              createTextVNode(toDisplayString(unref(t)("library.reserve.seat.time.label")) + "：" + toDisplayString(serverClockText.value) + " ", 1),
              _cache[7] || (_cache[7] = createBaseVNode("span", { class: "notice__sep" }, "·", -1)),
              createTextVNode(toDisplayString(openStateText.value) + " ", 1),
              _cache[8] || (_cache[8] = createBaseVNode("span", { class: "notice__sep" }, "·", -1)),
              createTextVNode(toDisplayString(releaseStateText.value), 1)
            ])) : createCommentVNode("", true),
            violationLine.value ? (openBlock(), createElementBlock("p", _hoisted_69, toDisplayString(violationLine.value), 1)) : createCommentVNode("", true),
            hasRuleDetails.value ? (openBlock(), createBlock(unref(TCollapse), {
              key: 2,
              title: unref(t)("library.reserve.seat.section.notice")
            }, {
              default: withCtx(() => [
                hasRules.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                  openHours.value.length ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                    createBaseVNode("p", _hoisted_70, toDisplayString(unref(t)("library.reserve.seat.rule.openTime")), 1),
                    createBaseVNode("ul", _hoisted_71, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(openHours.value, (row) => {
                        return openBlock(), createElementBlock("li", {
                          key: row.key
                        }, toDisplayString(openHourText(row)), 1);
                      }), 128))
                    ])
                  ], 64)) : createCommentVNode("", true),
                  ruleLines.value.length ? (openBlock(), createElementBlock("ul", _hoisted_72, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(ruleLines.value, (line, i) => {
                      return openBlock(), createElementBlock("li", {
                        key: `rule-${i}`
                      }, toDisplayString(line), 1);
                    }), 128))
                  ])) : createCommentVNode("", true)
                ], 64)) : createCommentVNode("", true),
                noticeHtml.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                  createBaseVNode("h4", _hoisted_73, toDisplayString(noticeTitle.value), 1),
                  createBaseVNode("div", {
                    class: "rich",
                    innerHTML: noticeHtml.value
                  }, null, 8, _hoisted_74)
                ], 64)) : createCommentVNode("", true)
              ]),
              _: 1
            }, 8, ["title"])) : createCommentVNode("", true),
            createBaseVNode("p", _hoisted_75, toDisplayString(unref(t)("library.reserve.seat.unsupported.hint")), 1)
          ])
        ], 64)),
        createVNode(unref(TModal), {
          visible: submitVisible.value,
          title: unref(t)("library.reserve.seat.submit.title"),
          width: "420px",
          closable: !submitting.value,
          "close-on-overlay": !submitting.value,
          onClose: _cache[6] || (_cache[6] = ($event) => submitVisible.value = false)
        }, {
          footer: withCtx(() => [
            createBaseVNode("button", {
              type: "button",
              class: "ghost",
              disabled: submitting.value,
              onClick: _cache[5] || (_cache[5] = ($event) => submitVisible.value = false)
            }, toDisplayString(unref(t)("library.reserve.btn.cancel")), 9, _hoisted_90),
            createBaseVNode("button", {
              type: "button",
              class: "primary",
              disabled: submitting.value || preparing.value || Boolean(prepareError.value),
              onClick: confirmSubmit
            }, toDisplayString(submitting.value ? unref(t)("library.reserve.btn.submitting") : unref(t)("library.reserve.seat.submit.action")), 9, _hoisted_91)
          ]),
          default: withCtx(() => [
            match.value ? (openBlock(), createElementBlock("div", _hoisted_76, [
              createBaseVNode("p", _hoisted_77, toDisplayString(unref(tf)("library.reserve.seat.find.area", { area: matchAreaText.value || "--" })), 1),
              createBaseVNode("p", _hoisted_78, toDisplayString(unref(tf)("library.reserve.seat.find.seatNo", { seat: match.value.seatNum || "--" })), 1),
              createBaseVNode("p", _hoisted_79, toDisplayString(unref(tf)("library.reserve.seat.find.timeRange", { range: matchTimeText.value })), 1)
            ])) : createCommentVNode("", true),
            createBaseVNode("p", _hoisted_80, toDisplayString(unref(t)("library.reserve.seat.submit.warn")), 1),
            preparing.value ? (openBlock(), createElementBlock("p", _hoisted_81, toDisplayString(unref(t)("library.reserve.seat.submit.preparing")), 1)) : prepareError.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
              createBaseVNode("p", _hoisted_82, toDisplayString(prepareError.value), 1),
              createBaseVNode("button", {
                type: "button",
                class: "ghost",
                disabled: preparing.value,
                onClick: prepareCaptcha
              }, toDisplayString(unref(t)("library.reserve.btn.retry")), 9, _hoisted_83)
            ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
              prepare.value && prepare.value.captchaUrl ? (openBlock(), createElementBlock("img", {
                key: 0,
                class: "captcha__img",
                src: prepare.value.captchaUrl,
                alt: unref(t)("library.reserve.seat.submit.captchaAlt")
              }, null, 8, _hoisted_84)) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_85, [
                createBaseVNode("label", _hoisted_86, toDisplayString(unref(t)("library.reserve.seat.submit.captchaLabel")), 1),
                withDirectives(createBaseVNode("input", {
                  id: "seat-captcha",
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => captcha.value = $event),
                  class: "input",
                  type: "text",
                  autocomplete: "off",
                  placeholder: unref(t)("library.reserve.seat.submit.captchaPlaceholder")
                }, null, 8, _hoisted_87), [
                  [vModelText, captcha.value]
                ])
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "link link--left",
                disabled: preparing.value,
                onClick: prepareCaptcha
              }, toDisplayString(unref(t)("library.reserve.seat.submit.reload")), 9, _hoisted_88)
            ], 64)),
            submitError.value ? (openBlock(), createElementBlock("p", _hoisted_89, toDisplayString(submitError.value), 1)) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["visible", "title", "closable", "close-on-overlay"])
      ]);
    };
  }
};
const ReserveSeatPanel = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-99052bd0"]]);
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
const weekdayOfWeek = (week) => {
  const n = toInt$1(week);
  if (n === null) return null;
  return (n % 7 + 7) % 7;
};
const hmToMinutes = (hm) => {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(extractHm(hm));
  if (!matched) return null;
  const h = Number(matched[1]);
  const m = Number(matched[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};
const minutesToHm = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) return "";
  return `${pad2$1(Math.floor(minutes / 60))}:${pad2$1(minutes % 60)}`;
};
const normalizeRoomInterval = (raw) => {
  const record = asRecord$1(raw);
  const week = weekdayOfWeek(record.week);
  if (week === null) return null;
  const availableRaw = record.available;
  const available = !(availableRaw === 0 || availableRaw === false || availableRaw === "0");
  return {
    week,
    available,
    start: extractHm(record.startTime),
    end: extractHm(record.endTime)
  };
};
const normalizeRoomItem = (raw, index) => {
  const record = asRecord$1(raw);
  const itemId = String(record.itemId ?? record.item_id ?? record.id ?? "").trim();
  const intervalsRaw = Array.isArray(record.intervals) ? record.intervals : [];
  const intervals = intervalsRaw.map((entry) => normalizeRoomInterval(entry)).filter((entry) => entry !== null);
  return {
    key: `room-${itemId || "row"}-${index}`,
    itemId,
    name: String(record.name ?? record.itemName ?? record.item_name ?? "").trim(),
    minUserNum: toInt$1(record.minUserNum ?? record.min_user_num),
    maxUserNum: toInt$1(record.maxUserNum ?? record.max_user_num),
    formId: String(record.formId ?? record.form_id ?? "").trim(),
    advanceDays: toInt$1(record.advanceDays ?? record.advance_days),
    timeUnit: toInt$1(record.timeUnit ?? record.time_unit),
    rangeStartMs: toInt$1(record.rangeStartMs ?? record.range_start_ms),
    rangeEndMs: toInt$1(record.rangeEndMs ?? record.range_end_ms),
    intervals,
    raw: record
  };
};
const normalizeRoomList = (list) => {
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => normalizeRoomItem(item, index));
};
const resolveAdvanceDays = (...candidates) => {
  for (const candidate of candidates) {
    const n = toInt$1(candidate);
    if (n !== null && n >= 0) return n;
  }
  return FALLBACK_ADVANCE_DAYS;
};
const resolveRoomDayInterval = (room, weekday) => {
  if (!room) return null;
  return room.intervals.find((interval) => interval.week === weekday) || null;
};
const normalizeRoomIntervalSlots = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    const record = asRecord$1(entry);
    const id = toInt$1(record.id);
    const week = toInt$1(record.week);
    if (id === null || week === null) continue;
    const capacity = toInt$1(record.userNum ?? record.user_num);
    out.push({
      id,
      week,
      start: extractHm(record.startTime ?? record.start),
      end: extractHm(record.endTime ?? record.end),
      available: !(record.available === 0 || record.available === false || record.available === "0"),
      userNum: capacity !== null && capacity > 0 ? capacity : 1
    });
  }
  return out.sort((a, b) => a.week - b.week || a.start.localeCompare(b.start));
};
const roomOccupancyKey = (intervalId, date) => `${intervalId}_${String(date ?? "").trim()}`;
const normalizeOccupancyRecords = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    const record = asRecord$1(entry);
    const intervalId = toInt$1(record.intervalId ?? record.interval_id);
    const date = String(record.date ?? "").trim();
    if (intervalId === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const reserveNum = toInt$1(record.reserveNum ?? record.reserve_num);
    out.push({
      recordId: toInt$1(record.id ?? record.recordId ?? record.record_id),
      intervalId,
      date,
      // 缺失 / 非法按 1（官方页面同样兜底）：按 0 会漏算占用 → 误报「可预约」
      reserveNum: reserveNum !== null && reserveNum > 0 ? reserveNum : 1,
      uid: toInt$1(record.uid),
      userName: String(record.userName ?? record.user_name ?? record.uname ?? "").trim()
    });
  }
  return out;
};
const normalizeRoomOccupancy = (raw) => {
  const record = asRecord$1(raw);
  const records = normalizeOccupancyRecords(record.records);
  const used = {};
  for (const item of records) {
    const key = roomOccupancyKey(item.intervalId, item.date);
    used[key] = (used[key] ?? 0) + item.reserveNum;
  }
  const unkeyedRaw = toInt$1(record.unkeyed);
  return {
    records,
    used,
    clock: parseSeatClock(record.serverNow ?? record.server_now),
    unkeyed: unkeyedRaw !== null && unkeyedRaw > 0 ? unkeyedRaw : 0
  };
};
const weekdayKeyOfDate = (dateKey) => {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey ?? "").trim());
  if (!matched) return 0;
  const date = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
  if (Number.isNaN(date.getTime())) return 0;
  const day = date.getDay();
  return day === 0 ? 7 : day;
};
const resolveRoomIntervalIds = (slots, weekday, start, end) => {
  const from = hmToMinutes(start);
  const to = hmToMinutes(end);
  if (from === null || to === null || to <= from) return [];
  return slots.filter((slot) => slot.week === weekday && slot.available).filter((slot) => {
    const slotFrom = hmToMinutes(slot.start);
    const slotTo = hmToMinutes(slot.end);
    return slotFrom !== null && slotTo !== null && slotFrom >= from && slotTo <= to;
  }).sort((a, b) => a.start.localeCompare(b.start)).map((slot) => slot.id);
};
const resolveRoomGridDays = (advanceDays, advanceTime, now = /* @__PURE__ */ new Date()) => {
  const base = Math.max(0, toInt$1(advanceDays) ?? FALLBACK_ADVANCE_DAYS);
  const matched = /^(\d{1,2}):(\d{2})$/.exec(String(advanceTime ?? "").trim());
  if (!matched) return base;
  const config = Number(matched[1]) * 60 + Number(matched[2]);
  if (!Number.isFinite(config)) return base;
  const current = now.getHours() * 60 + now.getMinutes();
  return current > config ? base + 1 : base;
};
const roomOpenRange = (room) => {
  if (!room) return { openFrom: "", openTo: "" };
  let from = null;
  let to = null;
  for (const interval of room.intervals) {
    if (!interval.available) continue;
    const start = hmToMinutes(interval.start);
    const end = hmToMinutes(interval.end);
    if (start === null || end === null || end <= start) continue;
    from = from === null ? start : Math.min(from, start);
    to = to === null ? end : Math.max(to, end);
  }
  return {
    openFrom: from === null ? "" : minutesToHm(from),
    openTo: to === null ? "" : minutesToHm(to)
  };
};
const splitIntervalByUnit = (start, end, unitMin) => {
  const from = hmToMinutes(start);
  const to = hmToMinutes(end);
  if (from === null || to === null || to <= from) return [];
  const unit = Number.isFinite(unitMin) && unitMin > 0 ? Math.floor(unitMin) : 60;
  const out = [];
  for (let cursor = from; cursor + unit <= to; cursor += unit) {
    out.push({ start: minutesToHm(cursor), end: minutesToHm(cursor + unit) });
  }
  return out;
};
const ROOM_SERVER_TIME_KEYS = [
  "serverNow",
  "serverTime",
  "currentServerTime",
  "currentTime",
  "nowTime",
  "sysTime",
  "systemTime",
  "timestamp",
  "serverTimestamp"
];
const resolveRoomServerClock = (raw) => {
  const record = asRecord$1(raw);
  const nested = asRecord$1(record.raw);
  for (const key of ROOM_SERVER_TIME_KEYS) {
    const clock = parseSeatClock(record[key]) ?? parseSeatClock(nested[key]);
    if (clock) return clock;
  }
  return null;
};
const dateFromClock = (clock) => {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clock.dateKey);
  if (!matched) return /* @__PURE__ */ new Date();
  return new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
};
const isRoomCellPast = (dateKey, end, clock) => {
  if (!clock || !dateKey) return false;
  if (dateKey < clock.dateKey) return true;
  if (dateKey > clock.dateKey) return false;
  const endMinutes = hmToMinutes(end);
  return endMinutes !== null && endMinutes <= clock.minutes;
};
const buildRoomGrid = (room, advanceDays, timeUnitMin, now = /* @__PURE__ */ new Date(), clock = null, slots = [], occupancyUsed = null, occupancyKnown = true) => {
  if (!room) return { columns: [], rows: [] };
  const unit = Number.isFinite(Number(timeUnitMin)) && Number(timeUnitMin) > 0 ? Math.floor(Number(timeUnitMin)) : 60;
  const byStart = (a, b) => {
    const diff = (hmToMinutes(a.start) ?? 0) - (hmToMinutes(b.start) ?? 0);
    return diff !== 0 ? diff : a.end.localeCompare(b.end);
  };
  let columns;
  if (slots.length) {
    const map = /* @__PURE__ */ new Map();
    for (const slot of slots) {
      if (!slot.start || !slot.end) continue;
      const key = `${slot.start}-${slot.end}`;
      if (!map.has(key)) map.set(key, { key, start: slot.start, end: slot.end, label: key });
    }
    columns = [...map.values()].sort(byStart);
  } else {
    const map = /* @__PURE__ */ new Map();
    for (const interval of room.intervals) {
      for (const slot of splitIntervalByUnit(interval.start, interval.end, unit)) {
        const key = `${slot.start}-${slot.end}`;
        if (!map.has(key)) {
          map.set(key, { key, start: slot.start, end: slot.end, label: key });
        }
      }
    }
    columns = [...map.values()].sort(byStart);
  }
  if (!columns.length) return { columns: [], rows: [] };
  const base = clock ? dateFromClock(clock) : now;
  const rows = buildDateOptions(advanceDays, base).map((option) => {
    const weekday = option.date.getDay();
    const interval = resolveRoomDayInterval(room, weekday);
    const startMinutes = interval ? hmToMinutes(interval.start) : null;
    const endMinutes = interval ? hmToMinutes(interval.end) : null;
    const weekdayKey = weekday === 0 ? 7 : weekday;
    const daySlots = slots.filter((slot) => slot.week === weekdayKey);
    const rowDisabled = !interval || !interval.available;
    const cells = columns.map((column) => {
      const past = isRoomCellPast(option.value, column.end, clock);
      let open;
      const slot = daySlots.find(
        (candidate) => candidate.start === column.start && candidate.end === column.end
      );
      if (slots.length) {
        open = Boolean(slot && slot.available);
      } else {
        const cellStart = hmToMinutes(column.start);
        const cellEnd = hmToMinutes(column.end);
        open = startMinutes !== null && endMinutes !== null && cellStart !== null && cellEnd !== null && cellStart >= startMinutes && cellEnd <= endMinutes;
      }
      const capacity = slot ? Math.max(1, slot.userNum) : 0;
      const used = slot && occupancyUsed ? occupancyUsed[roomOccupancyKey(slot.id, option.value)] ?? 0 : 0;
      const occupied = Boolean(slot) && open && capacity > 0 && used >= capacity;
      const unknown = !occupancyKnown;
      return {
        ...column,
        date: option.value,
        available: !rowDisabled && open && !past && !occupied && !unknown,
        past,
        occupied,
        unknown
      };
    });
    return {
      key: option.value,
      date: option.value,
      weekday,
      offset: option.offset,
      disabled: rowDisabled || cells.every((cell) => !cell.available),
      cells
    };
  });
  return { columns, rows };
};
const roomIndexFromName = (name) => {
  const matched = String(name ?? "").match(/\d+/);
  if (!matched) return null;
  const value = Number(matched[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
};
const resolveCatalogResource = (catalog, room) => {
  if (!room) return null;
  const index = roomIndexFromName(room.name);
  if (index === null) return null;
  return catalog.find((item) => item.index === index) || null;
};
const _hoisted_1$2 = { class: "panel" };
const _hoisted_2$2 = { class: "section-title" };
const _hoisted_3$2 = {
  key: 1,
  class: "card error-card"
};
const _hoisted_4$2 = { class: "err" };
const _hoisted_5$2 = {
  key: 0,
  class: "hint"
};
const _hoisted_6$2 = {
  key: 3,
  class: "res-list"
};
const _hoisted_7$2 = ["onClick"];
const _hoisted_8$1 = { class: "res-card__top" };
const _hoisted_9$1 = { class: "res-card__name" };
const _hoisted_10$1 = {
  key: 0,
  class: "res-card__meta"
};
const _hoisted_11$1 = {
  key: 1,
  class: "res-card__meta"
};
const _hoisted_12$1 = {
  key: 2,
  class: "res-card__meta"
};
const _hoisted_13$1 = {
  key: 3,
  class: "res-card__note"
};
const _hoisted_14$1 = { class: "card res-summary" };
const _hoisted_15$1 = {
  key: 0,
  class: "res-card__meta"
};
const _hoisted_16$1 = {
  key: 1,
  class: "res-card__meta"
};
const _hoisted_17$1 = {
  key: 2,
  class: "res-card__meta"
};
const _hoisted_18$1 = { class: "section-title" };
const _hoisted_19$1 = {
  key: 0,
  class: "hint"
};
const _hoisted_20$1 = {
  key: 1,
  class: "hint hint--warn"
};
const _hoisted_21$1 = {
  key: 2,
  class: "hint"
};
const _hoisted_22$1 = { class: "hint hint--warn" };
const _hoisted_23$1 = {
  key: 0,
  class: "hint"
};
const _hoisted_24 = ["disabled"];
const _hoisted_25 = {
  key: 4,
  class: "hint"
};
const _hoisted_26 = { class: "grid-scroll" };
const _hoisted_27 = { class: "grid__corner" };
const _hoisted_28 = { class: "grid__date" };
const _hoisted_29 = { class: "grid__week" };
const _hoisted_30 = { class: "grid__md" };
const _hoisted_31 = {
  key: 0,
  class: "grid__tag"
};
const _hoisted_32 = ["disabled", "aria-pressed", "onClick"];
const _hoisted_33 = { class: "gcell__label" };
const _hoisted_34 = { class: "legend" };
const _hoisted_35 = { class: "section-title" };
const _hoisted_36 = { class: "card" };
const _hoisted_37 = {
  key: 0,
  class: "hint"
};
const _hoisted_38 = {
  key: 2,
  class: "hint"
};
const _hoisted_39 = {
  key: 3,
  class: "hint"
};
const _hoisted_40 = { class: "submit-bar" };
const _hoisted_41 = { class: "submit-bar__info" };
const _hoisted_42 = { class: "muted" };
const _hoisted_43 = {
  key: 1,
  class: "muted"
};
const _hoisted_44 = ["disabled"];
const _hoisted_45 = {
  key: 2,
  class: "card notice"
};
const _hoisted_46 = { class: "notice__body notice__body--danger" };
const _hoisted_47 = {
  key: 0,
  class: "notice__body notice__body--danger"
};
const _hoisted_48 = { key: 0 };
const _hoisted_49 = {
  key: 0,
  class: "notice__body notice__body--strong"
};
const _hoisted_50 = {
  key: 1,
  class: "notice__body"
};
const _hoisted_51 = {
  key: 2,
  class: "notice__body"
};
const _hoisted_52 = {
  key: 3,
  class: "notice__list"
};
const _hoisted_53 = { key: 0 };
const _hoisted_54 = { class: "confirm__list" };
const _hoisted_55 = { class: "confirm__warn" };
const _hoisted_56 = ["disabled"];
const _hoisted_57 = ["disabled"];
const _sfc_main$2 = {
  __name: "ReserveRoomPanel",
  props: {
    /** 应用标识：quiet_room（静音仓）/ seminar_room（研讨室） */
    app: { type: String, required: true }
  },
  setup(__props) {
    const props = __props;
    const { t, locale } = useLocale();
    const loading = ref(true);
    const loadError = ref("");
    const loadErrorDetail = ref("");
    const itemInfo = ref(null);
    const rooms = ref([]);
    const roomsLoading = ref(false);
    const roomsError = ref("");
    const roomsErrorDetail = ref("");
    const topAdvanceDays = ref(null);
    const serverClock = ref(null);
    const intervalSlots = ref([]);
    const settingLoading = ref(false);
    const settingError = ref("");
    const occupancyUsed = ref(null);
    const occupancyLoading = ref(false);
    const occupancyError = ref("");
    const occupancyLoaded = ref(false);
    const occupancyUnkeyed = ref(0);
    const occupancyKnown = computed(
      () => occupancyLoaded.value && !occupancyError.value && occupancyUnkeyed.value === 0 && intervalSlots.value.length > 0
    );
    const occupancyRange = () => {
      const today = /* @__PURE__ */ new Date();
      const days = Math.max(1, Number(gridDays.value) || 1);
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
      return { start: toDateKey(from), end: toDateKey(to) };
    };
    const failureText = (failure) => formatReserveFailureText(failure, t);
    const roomViews = computed(() => {
      void locale.value;
      const catalog = RESOURCE_CATALOG[props.app] || [];
      return rooms.value.map((room) => {
        const fallback = resolveCatalogResource(catalog, room);
        const range = roomOpenRange(room);
        return {
          key: room.key,
          room,
          name: room.name || (fallback ? tf(fallback.nameKey, { n: fallback.index }) : t("library.reserve.booking.roomFallback")),
          capacityMin: room.minUserNum ?? fallback?.capacityMin ?? null,
          capacityMax: room.maxUserNum ?? fallback?.capacityMax ?? null,
          openFrom: range.openFrom || fallback?.openFrom || "",
          openTo: range.openTo || fallback?.openTo || "",
          location: fallback ? t(fallback.locationKey) : "",
          note: fallback?.noteKey ? t(fallback.noteKey) : ""
        };
      });
    });
    const selectedRoomKey = ref("");
    const selectedRoomView = computed(
      () => roomViews.value.find((view) => view.key === selectedRoomKey.value) || null
    );
    const selectedRoom = computed(() => selectedRoomView.value?.room || null);
    const advanceDays = computed(
      () => resolveAdvanceDays(
        itemInfo.value?.advanceDays,
        selectedRoom.value?.advanceDays,
        topAdvanceDays.value
      )
    );
    const gridDays = computed(
      () => resolveRoomGridDays(advanceDays.value, itemInfo.value?.advanceTime)
    );
    const grid = computed(
      () => buildRoomGrid(
        selectedRoom.value,
        // buildRoomGrid 内部按 `advanceDays + 1` 天生成，这里传入「总天数 - 1」
        Math.max(0, gridDays.value - 1),
        selectedRoom.value?.timeUnit ?? null,
        /* @__PURE__ */ new Date(),
        serverClock.value,
        // 真实时段（含非整点档，如 20:00-21:30）；拿不到时空数组 → 回落到按粒度切分
        intervalSlots.value,
        // #1080：实时占用（`intervalId_date` → 已占用份数）+ 占用是否可信
        occupancyUsed.value,
        occupancyKnown.value
      )
    );
    const roomForm = computed(() => {
      const raw = selectedRoom.value?.raw;
      const config = raw ? raw.customFormConfig : null;
      if (config === null || config === void 0) return { fields: [], parsed: true };
      return normalizeFormFields(config);
    });
    const selectedCell = ref(null);
    const formValues = ref({});
    const formErrors = ref({});
    const cellState = (cell) => {
      if (!cell.available) {
        if (cell.occupied) return "full";
        if (cell.unknown) return "unknown";
        return "closed";
      }
      const picked = selectedCell.value;
      if (picked && picked.date === cell.date && picked.start === cell.start && picked.end === cell.end) {
        return "on";
      }
      return "off";
    };
    const cellClass = (cell) => {
      const state = cellState(cell);
      const modifier = state === "on" ? "gcell--on" : state === "full" ? "gcell--full" : state === "unknown" ? "gcell--unknown" : state === "closed" ? "gcell--closed" : "gcell--free";
      return ["gcell", modifier];
    };
    const dateTag = (row) => {
      if (row.offset === 0) return t("library.reserve.date.today");
      if (row.offset === 1) return t("library.reserve.date.tomorrow");
      return "";
    };
    const gridStyle = computed(() => ({
      gridTemplateColumns: `84px repeat(${grid.value.columns.length}, minmax(68px, 1fr))`
    }));
    const chooseCell = (cell) => {
      if (!cell.available) {
        const key = cell.occupied ? "library.reserve.toast.slotOccupied" : cell.unknown ? "library.reserve.booking.occupancyUnknown" : "library.reserve.toast.slotUnavailable";
        showToast(t(key), "warning");
        return;
      }
      const picked = selectedCell.value;
      if (picked && picked.date === cell.date && picked.start === cell.start && picked.end === cell.end) {
        selectedCell.value = null;
        formValues.value = {};
        formErrors.value = {};
        return;
      }
      selectedCell.value = { date: cell.date, start: cell.start, end: cell.end };
      formValues.value = buildInitialValues(roomForm.value.fields);
      formErrors.value = {};
    };
    const cellTimeText = (cell) => cell ? `${cell.start}-${cell.end}` : "";
    const confirmRows = computed(() => {
      const view = selectedRoomView.value;
      const cell = selectedCell.value;
      if (!view || !cell) return [];
      return [
        { label: t("library.reserve.confirm.room"), value: view.name },
        { label: t("library.reserve.confirm.date"), value: cell.date },
        { label: t("library.reserve.confirm.time"), value: cellTimeText(cell) },
        ...summarizeFormValues(roomForm.value.fields, formValues.value).map((row) => ({
          label: row.label,
          value: row.value
        }))
      ];
    });
    const durationLimit = computed(() => {
      const raw = Number(itemInfo.value?.durationLimitMin);
      return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
    });
    const notice = computed(() => ({
      title: String(itemInfo.value?.dialogTitle ?? "").trim(),
      body: stripHtml(itemInfo.value?.dialogContent)
    }));
    const hasNotice = computed(
      () => loading.value || Boolean(loadError.value) || Boolean(notice.value.title || notice.value.body) || Boolean(durationLimit.value)
    );
    const confirmVisible = ref(false);
    const submitting = ref(false);
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
        loadError.value = failure.messageKey ? t(failure.messageKey) : failure.detail || t("library.reserve.error.unknown");
        loadErrorDetail.value = failure.messageKey ? truncateReserveDetail(failure.detail) : "";
      } finally {
        loading.value = false;
      }
    };
    const loadRooms = async () => {
      roomsLoading.value = true;
      roomsError.value = "";
      roomsErrorDetail.value = "";
      try {
        const res = await invokeNative("library_reserve_time_list", { req: { app: props.app } });
        rooms.value = normalizeRoomList(res?.items);
        topAdvanceDays.value = res?.advanceDays ?? null;
        serverClock.value = resolveRoomServerClock(res);
      } catch (e) {
        const failure = parseReserveFailure(e);
        rooms.value = [];
        serverClock.value = null;
        roomsError.value = failure.messageKey ? t(failure.messageKey) : failure.detail || t("library.reserve.error.unknown");
        roomsErrorDetail.value = failure.messageKey ? truncateReserveDetail(failure.detail) : "";
      } finally {
        roomsLoading.value = false;
      }
    };
    const loadRoomSetting = async (itemId) => {
      intervalSlots.value = [];
      settingError.value = "";
      if (!itemId) return;
      settingLoading.value = true;
      try {
        const res = await invokeNative("library_reserve_item_setting", {
          req: { app: props.app, item_id: Number(itemId) }
        });
        intervalSlots.value = normalizeRoomIntervalSlots(res?.intervals);
        if (!intervalSlots.value.length) {
          settingError.value = t("library.reserve.booking.settingEmpty");
        }
      } catch (e) {
        const failure = parseReserveFailure(e);
        settingError.value = failureText(failure);
      } finally {
        settingLoading.value = false;
      }
    };
    const resetCellSelection = () => {
      selectedCell.value = null;
      formValues.value = {};
      formErrors.value = {};
    };
    const loadRoomOccupancy = async (itemId) => {
      occupancyUsed.value = null;
      occupancyError.value = "";
      occupancyUnkeyed.value = 0;
      occupancyLoaded.value = false;
      if (!itemId) return;
      occupancyLoading.value = true;
      try {
        const range = occupancyRange();
        const res = await invokeNative("library_reserve_item_occupancy", {
          req: {
            app: props.app,
            item_id: Number(itemId),
            start_time: range.start,
            end_time: range.end
          }
        });
        const view = normalizeRoomOccupancy(res);
        occupancyUsed.value = view.used;
        occupancyUnkeyed.value = view.unkeyed;
        occupancyLoaded.value = true;
        if (view.clock) serverClock.value = view.clock;
      } catch (e) {
        const failure = parseReserveFailure(e);
        occupancyError.value = failureText(failure);
      } finally {
        occupancyLoading.value = false;
      }
    };
    const selectRoom = (view) => {
      selectedRoomKey.value = view.key;
      resetCellSelection();
      void loadRoomSetting(view.room.itemId);
      void loadRoomOccupancy(view.room.itemId);
    };
    const backToList = () => {
      selectedRoomKey.value = "";
      resetCellSelection();
      intervalSlots.value = [];
      settingError.value = "";
      occupancyUsed.value = null;
      occupancyError.value = "";
      occupancyUnkeyed.value = 0;
      occupancyLoaded.value = false;
    };
    const onFormValues = (next) => {
      formValues.value = next;
    };
    const requestSubmit = () => {
      if (!occupancyKnown.value) {
        showToast(t("library.reserve.booking.occupancyUnknown"), "warning");
        return;
      }
      if (!selectedCell.value) {
        showToast(t("library.reserve.toast.selectSlot"), "warning");
        return;
      }
      const validation = validateFormValues(roomForm.value.fields, formValues.value);
      formErrors.value = validation.errors;
      if (!validation.valid) {
        showToast(t("library.reserve.toast.formInvalid"), "warning");
        return;
      }
      confirmVisible.value = true;
    };
    const confirmSubmit = async () => {
      const room = selectedRoom.value;
      const cell = selectedCell.value;
      if (!room || !cell) {
        confirmVisible.value = false;
        return;
      }
      const intervalIds = resolveRoomIntervalIds(
        intervalSlots.value,
        weekdayKeyOfDate(cell.date),
        cell.start,
        cell.end
      );
      if (!intervalIds.length) {
        confirmVisible.value = false;
        showToast(t("library.reserve.toast.intervalMissing"), "error", 3400);
        return;
      }
      submitting.value = true;
      try {
        const reserveUsers = [
          {
            itemId: Number(room.itemId),
            starttime: `${cell.date} ${cell.start}`,
            endtime: `${cell.date} ${cell.end}`,
            remark: "",
            today: cell.date,
            intervalIds: JSON.stringify(intervalIds)
          }
        ];
        const req = {
          app: props.app,
          cycle_type: 0,
          form_data: toFormData(roomForm.value.fields, formValues.value),
          extra: {
            itemId: room.itemId,
            reserveUsers: JSON.stringify(reserveUsers),
            reserveNum: "1",
            // 与官方页面一致：风控关闭，wfwEngineEnc 传空串
            wfwEngineEnc: ""
          }
        };
        const res = await invokeNative("library_reserve_submit", { req });
        confirmVisible.value = false;
        showToast(res?.message || t("library.reserve.toast.submitSuccess"), "success");
        resetCellSelection();
        await Promise.all([loadRooms(), loadRoomOccupancy(room.itemId)]);
      } catch (e) {
        confirmVisible.value = false;
        const failure = parseReserveFailure(e);
        showToast(failureText(failure), failure.network ? "warning" : "error", failure.network ? 2600 : 3400);
      } finally {
        submitting.value = false;
      }
    };
    onMounted(() => {
      void loadConstraints();
      void loadRooms();
    });
    watch(
      () => props.app,
      () => {
        backToList();
        rooms.value = [];
        topAdvanceDays.value = null;
        serverClock.value = null;
        intervalSlots.value = [];
        settingError.value = "";
        occupancyUsed.value = null;
        occupancyError.value = "";
        occupancyUnkeyed.value = 0;
        occupancyLoaded.value = false;
        void loadConstraints();
        void loadRooms();
      }
    );
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$2, [
        !selectedRoomView.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
          createBaseVNode("h2", _hoisted_2$2, toDisplayString(unref(t)("library.reserve.resource.title")), 1),
          roomsLoading.value ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 0,
            type: "loading",
            message: unref(t)("library.reserve.state.loading")
          }, null, 8, ["message"])) : roomsError.value ? (openBlock(), createElementBlock("section", _hoisted_3$2, [
            createBaseVNode("p", _hoisted_4$2, toDisplayString(roomsError.value), 1),
            roomsErrorDetail.value ? (openBlock(), createElementBlock("p", _hoisted_5$2, toDisplayString(roomsErrorDetail.value), 1)) : createCommentVNode("", true),
            createBaseVNode("button", {
              type: "button",
              class: "ghost",
              onClick: loadRooms
            }, toDisplayString(unref(t)("library.reserve.btn.retry")), 1)
          ])) : !roomViews.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
            key: 2,
            type: "empty",
            message: unref(t)("library.reserve.booking.roomsEmpty")
          }, null, 8, ["message"])) : (openBlock(), createElementBlock("div", _hoisted_6$2, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(roomViews.value, (view) => {
              return openBlock(), createElementBlock("button", {
                key: view.key,
                type: "button",
                class: "res-card",
                onClick: ($event) => selectRoom(view)
              }, [
                createBaseVNode("div", _hoisted_8$1, [
                  createBaseVNode("h3", _hoisted_9$1, toDisplayString(view.name), 1),
                  _cache[3] || (_cache[3] = createBaseVNode("span", {
                    class: "material-symbols-outlined",
                    "aria-hidden": "true"
                  }, "chevron_right", -1))
                ]),
                view.openFrom && view.openTo ? (openBlock(), createElementBlock("p", _hoisted_10$1, toDisplayString(unref(tf)("library.reserve.resource.openTime", { range: `${view.openFrom}-${view.openTo}` })), 1)) : createCommentVNode("", true),
                view.location ? (openBlock(), createElementBlock("p", _hoisted_11$1, toDisplayString(unref(tf)("library.reserve.resource.location", { place: view.location })), 1)) : createCommentVNode("", true),
                view.capacityMin !== null && view.capacityMax !== null ? (openBlock(), createElementBlock("p", _hoisted_12$1, toDisplayString(unref(tf)("library.reserve.resource.capacity", { min: view.capacityMin, max: view.capacityMax })), 1)) : createCommentVNode("", true),
                view.note ? (openBlock(), createElementBlock("p", _hoisted_13$1, toDisplayString(view.note), 1)) : createCommentVNode("", true)
              ], 8, _hoisted_7$2);
            }), 128))
          ]))
        ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          createBaseVNode("button", {
            type: "button",
            class: "back-link",
            onClick: backToList
          }, [
            _cache[4] || (_cache[4] = createBaseVNode("span", {
              class: "material-symbols-outlined",
              "aria-hidden": "true"
            }, "arrow_back", -1)),
            createTextVNode(" " + toDisplayString(selectedRoomView.value.name), 1)
          ]),
          createBaseVNode("section", _hoisted_14$1, [
            selectedRoomView.value.openFrom && selectedRoomView.value.openTo ? (openBlock(), createElementBlock("p", _hoisted_15$1, toDisplayString(unref(tf)("library.reserve.resource.openTime", { range: `${selectedRoomView.value.openFrom}-${selectedRoomView.value.openTo}` })), 1)) : createCommentVNode("", true),
            selectedRoomView.value.location ? (openBlock(), createElementBlock("p", _hoisted_16$1, toDisplayString(unref(tf)("library.reserve.resource.location", { place: selectedRoomView.value.location })), 1)) : createCommentVNode("", true),
            selectedRoomView.value.capacityMin !== null && selectedRoomView.value.capacityMax !== null ? (openBlock(), createElementBlock("p", _hoisted_17$1, toDisplayString(unref(tf)("library.reserve.resource.capacity", { min: selectedRoomView.value.capacityMin, max: selectedRoomView.value.capacityMax })), 1)) : createCommentVNode("", true)
          ]),
          createBaseVNode("h3", _hoisted_18$1, toDisplayString(unref(t)("library.reserve.booking.grid")), 1),
          settingLoading.value ? (openBlock(), createElementBlock("p", _hoisted_19$1, toDisplayString(unref(t)("library.reserve.booking.settingLoading")), 1)) : settingError.value ? (openBlock(), createElementBlock("p", _hoisted_20$1, toDisplayString(settingError.value), 1)) : createCommentVNode("", true),
          occupancyLoading.value ? (openBlock(), createElementBlock("p", _hoisted_21$1, toDisplayString(unref(t)("library.reserve.booking.occupancyLoading")), 1)) : !occupancyKnown.value && grid.value.columns.length ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("p", _hoisted_22$1, toDisplayString(unref(t)("library.reserve.booking.occupancyUnknown")), 1),
            occupancyError.value ? (openBlock(), createElementBlock("p", _hoisted_23$1, toDisplayString(occupancyError.value), 1)) : createCommentVNode("", true),
            createBaseVNode("button", {
              type: "button",
              class: "ghost",
              disabled: occupancyLoading.value || !selectedRoomView.value,
              onClick: _cache[0] || (_cache[0] = ($event) => loadRoomOccupancy(selectedRoomView.value.room.itemId))
            }, toDisplayString(unref(t)("library.reserve.btn.retry")), 9, _hoisted_24)
          ], 64)) : createCommentVNode("", true),
          !grid.value.columns.length ? (openBlock(), createElementBlock("p", _hoisted_25, toDisplayString(unref(t)("library.reserve.booking.noIntervals")), 1)) : (openBlock(), createElementBlock(Fragment, { key: 5 }, [
            createBaseVNode("div", _hoisted_26, [
              createBaseVNode("div", {
                class: "grid grid--head",
                style: normalizeStyle(gridStyle.value)
              }, [
                createBaseVNode("span", _hoisted_27, toDisplayString(unref(t)("library.reserve.booking.gridDate")), 1),
                (openBlock(true), createElementBlock(Fragment, null, renderList(grid.value.columns, (column) => {
                  return openBlock(), createElementBlock("span", {
                    key: column.key,
                    class: "grid__col"
                  }, toDisplayString(column.label), 1);
                }), 128))
              ], 4),
              (openBlock(true), createElementBlock(Fragment, null, renderList(grid.value.rows, (row) => {
                return openBlock(), createElementBlock("div", {
                  key: row.key,
                  class: normalizeClass(["grid grid--row", { "grid--off": row.disabled }]),
                  style: normalizeStyle(gridStyle.value)
                }, [
                  createBaseVNode("span", _hoisted_28, [
                    createBaseVNode("span", _hoisted_29, toDisplayString(unref(t)(unref(WEEKDAY_KEYS)[row.weekday])), 1),
                    createBaseVNode("strong", _hoisted_30, toDisplayString(row.date.slice(5)), 1),
                    dateTag(row) ? (openBlock(), createElementBlock("em", _hoisted_31, toDisplayString(dateTag(row)), 1)) : createCommentVNode("", true)
                  ]),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(row.cells, (cell) => {
                    return openBlock(), createElementBlock("button", {
                      key: cell.key,
                      type: "button",
                      class: normalizeClass(cellClass(cell)),
                      disabled: !cell.available,
                      "aria-pressed": cellState(cell) === "on",
                      onClick: ($event) => chooseCell(cell)
                    }, [
                      createBaseVNode("span", _hoisted_33, toDisplayString(cell.label), 1)
                    ], 10, _hoisted_32);
                  }), 128))
                ], 6);
              }), 128))
            ]),
            createBaseVNode("div", _hoisted_34, [
              createBaseVNode("span", null, [
                _cache[5] || (_cache[5] = createBaseVNode("i", { class: "dot dot--free" }, null, -1)),
                createTextVNode(toDisplayString(unref(t)("library.reserve.booking.legendFree")), 1)
              ]),
              createBaseVNode("span", null, [
                _cache[6] || (_cache[6] = createBaseVNode("i", { class: "dot dot--full" }, null, -1)),
                createTextVNode(toDisplayString(unref(t)("library.reserve.booking.legendFull")), 1)
              ]),
              createBaseVNode("span", null, [
                _cache[7] || (_cache[7] = createBaseVNode("i", { class: "dot dot--closed" }, null, -1)),
                createTextVNode(toDisplayString(unref(t)("library.reserve.booking.legendClosed")), 1)
              ]),
              createBaseVNode("span", null, [
                _cache[8] || (_cache[8] = createBaseVNode("i", { class: "dot dot--on" }, null, -1)),
                createTextVNode(toDisplayString(unref(t)("library.reserve.booking.legendSelected")), 1)
              ])
            ])
          ], 64)),
          selectedCell.value ? (openBlock(), createElementBlock(Fragment, { key: 6 }, [
            createBaseVNode("h3", _hoisted_35, toDisplayString(unref(t)("library.reserve.booking.form")), 1),
            createBaseVNode("section", _hoisted_36, [
              selectedRoomView.value.capacityMin !== null && selectedRoomView.value.capacityMax !== null ? (openBlock(), createElementBlock("p", _hoisted_37, toDisplayString(unref(tf)("library.reserve.booking.capacityHint", { min: selectedRoomView.value.capacityMin, max: selectedRoomView.value.capacityMax })), 1)) : createCommentVNode("", true),
              roomForm.value.fields.length ? (openBlock(), createBlock(ReserveFormFields, {
                key: 1,
                fields: roomForm.value.fields,
                values: formValues.value,
                errors: formErrors.value,
                disabled: submitting.value,
                "onUpdate:values": onFormValues
              }, null, 8, ["fields", "values", "errors", "disabled"])) : !roomForm.value.parsed ? (openBlock(), createElementBlock("p", _hoisted_38, toDisplayString(unref(t)("library.reserve.booking.formUnparsed")), 1)) : (openBlock(), createElementBlock("p", _hoisted_39, toDisplayString(unref(t)("library.reserve.booking.formEmpty")), 1))
            ])
          ], 64)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_40, [
            createBaseVNode("div", _hoisted_41, [
              selectedCell.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                createBaseVNode("strong", null, toDisplayString(cellTimeText(selectedCell.value)), 1),
                createBaseVNode("span", _hoisted_42, toDisplayString(selectedCell.value.date), 1)
              ], 64)) : (openBlock(), createElementBlock("span", _hoisted_43, toDisplayString(unref(t)("library.reserve.booking.selectHint")), 1))
            ]),
            createBaseVNode("button", {
              type: "button",
              class: "primary",
              disabled: !selectedCell.value || submitting.value || settingLoading.value || occupancyLoading.value || !occupancyKnown.value,
              onClick: requestSubmit
            }, toDisplayString(submitting.value ? unref(t)("library.reserve.btn.submitting") : unref(t)("library.reserve.btn.submit")), 9, _hoisted_44)
          ])
        ], 64)),
        hasNotice.value ? (openBlock(), createElementBlock("section", _hoisted_45, [
          createBaseVNode("p", _hoisted_46, toDisplayString(unref(t)("library.reserve.notice.violation")), 1),
          loadError.value ? (openBlock(), createElementBlock("p", _hoisted_47, [
            createTextVNode(toDisplayString(loadError.value), 1),
            loadErrorDetail.value ? (openBlock(), createElementBlock("span", _hoisted_48, toDisplayString(loadErrorDetail.value), 1)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          loadError.value ? (openBlock(), createElementBlock("button", {
            key: 1,
            type: "button",
            class: "ghost",
            onClick: loadConstraints
          }, toDisplayString(unref(t)("library.reserve.btn.retry")), 1)) : createCommentVNode("", true),
          createVNode(unref(TCollapse), {
            title: unref(t)("library.reserve.notice.title")
          }, {
            default: withCtx(() => [
              notice.value.title ? (openBlock(), createElementBlock("p", _hoisted_49, toDisplayString(notice.value.title), 1)) : createCommentVNode("", true),
              notice.value.body ? (openBlock(), createElementBlock("p", _hoisted_50, toDisplayString(notice.value.body), 1)) : createCommentVNode("", true),
              loading.value ? (openBlock(), createElementBlock("p", _hoisted_51, toDisplayString(unref(t)("library.reserve.state.loading")), 1)) : (openBlock(), createElementBlock("ul", _hoisted_52, [
                createBaseVNode("li", null, toDisplayString(unref(tf)("library.reserve.notice.advance", { n: advanceDays.value })), 1),
                durationLimit.value ? (openBlock(), createElementBlock("li", _hoisted_53, toDisplayString(unref(tf)("library.reserve.notice.duration", { n: durationLimit.value })), 1)) : createCommentVNode("", true)
              ]))
            ]),
            _: 1
          }, 8, ["title"])
        ])) : createCommentVNode("", true),
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
            }, toDisplayString(unref(t)("library.reserve.btn.cancel")), 9, _hoisted_56),
            createBaseVNode("button", {
              type: "button",
              class: "primary",
              disabled: submitting.value,
              onClick: confirmSubmit
            }, toDisplayString(submitting.value ? unref(t)("library.reserve.btn.submitting") : unref(t)("library.reserve.btn.confirm")), 9, _hoisted_57)
          ]),
          default: withCtx(() => [
            createBaseVNode("dl", _hoisted_54, [
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
            createBaseVNode("p", _hoisted_55, toDisplayString(unref(t)("library.reserve.confirm.violation")), 1)
          ]),
          _: 1
        }, 8, ["visible", "title"])
      ]);
    };
  }
};
const ReserveRoomPanel = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-5501956e"]]);
const _hoisted_1$1 = { class: "panel" };
const _hoisted_2$1 = { class: "bar span-all" };
const _hoisted_3$1 = { class: "bar__title" };
const _hoisted_4$1 = ["disabled"];
const _hoisted_5$1 = {
  key: 0,
  class: "warn span-all"
};
const _hoisted_6$1 = {
  key: 1,
  class: "offline-banner span-all"
};
const _hoisted_7$1 = {
  key: 3,
  class: "card error-card span-all"
};
const _hoisted_8 = { class: "err" };
const _hoisted_9 = {
  key: 0,
  class: "hint"
};
const _hoisted_10 = { class: "order__top" };
const _hoisted_11 = { class: "order__name" };
const _hoisted_12 = { class: "meta" };
const _hoisted_13 = { class: "order__foot" };
const _hoisted_14 = { class: "tag" };
const _hoisted_15 = ["onClick"];
const _hoisted_16 = { class: "hint" };
const _hoisted_17 = {
  key: 0,
  class: "confirm__list"
};
const _hoisted_18 = { class: "confirm__row" };
const _hoisted_19 = { class: "confirm__row" };
const _hoisted_20 = { class: "confirm__row" };
const _hoisted_21 = {
  key: 1,
  class: "warn"
};
const _hoisted_22 = ["disabled"];
const _hoisted_23 = ["disabled"];
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
    const offline = ref(false);
    const syncTime = ref("");
    const cancelTarget = ref(null);
    const cancelVisible = ref(false);
    const cancelling = ref(false);
    const cancelError = ref("");
    const failureText = (failure) => failure.messageKey ? t(failure.messageKey) : failure.detail || t("library.reserve.error.unknown");
    const appName = (app) => app === "quiet_room" ? t("library.reserve.tab.quiet") : t("library.reserve.tab.room");
    const normalizeItem = (raw, app, index) => {
      const item = normalizeMyReservation(raw, app, index);
      return { ...item, name: item.name || appName(app) };
    };
    const timeText = (item) => {
      if (item.start && item.end) return `${item.start}-${item.end}`;
      return item.start || item.end || "";
    };
    const canCancel = (item) => Boolean(item.recordId) && !item.cancelled;
    const load = async () => {
      loading.value = true;
      error.value = "";
      errorDetail.value = "";
      partialError.value = "";
      offline.value = false;
      syncTime.value = "";
      const results = await Promise.allSettled(
        APPS.map((app) => invokeNative("library_reserve_my_reservations", { req: { app } }))
      );
      const merged = [];
      const failures = [];
      const offlineSyncTimes = [];
      results.forEach((result, i) => {
        const app = APPS[i];
        if (result.status === "fulfilled") {
          const data = result.value;
          if (data?.offline === true) {
            const time = String(data?.sync_time || "").trim();
            if (time) offlineSyncTimes.push(time);
          }
          const list = Array.isArray(data?.items) ? data.items : [];
          list.forEach((item, index) => merged.push(normalizeItem(item, app, index)));
        } else {
          failures.push(parseReserveFailure(result.reason));
        }
      });
      const latestOfflineSync = offlineSyncTimes.sort().pop() || "";
      offline.value = latestOfflineSync !== "";
      syncTime.value = latestOfflineSync;
      merged.sort((a, b) => sortKeyOf(b).localeCompare(sortKeyOf(a)));
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
      if (!canCancel(item)) return;
      cancelTarget.value = item;
      cancelError.value = "";
      cancelVisible.value = true;
    };
    const confirmCancel = async () => {
      const item = cancelTarget.value;
      if (!item?.recordId) {
        cancelVisible.value = false;
        return;
      }
      cancelling.value = true;
      cancelError.value = "";
      try {
        await invokeNative("library_reserve_cancel", {
          req: { app: item.app, id: item.recordId }
        });
        cancelVisible.value = false;
        showToast(t("library.reserve.mine.cancelSuccess"), "success");
        await load();
      } catch (e) {
        const failure = parseReserveFailure(e);
        cancelError.value = failureText(failure);
      } finally {
        cancelling.value = false;
      }
    };
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
        offline.value && !loading.value ? (openBlock(), createElementBlock("div", _hoisted_6$1, toDisplayString(unref(tf)("library.reserve.mine.offlineBanner", { time: unref(formatRelativeTime)(syncTime.value) })), 1)) : createCommentVNode("", true),
        loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
          key: 2,
          class: "span-all",
          type: "loading",
          message: unref(t)("library.reserve.mine.loading")
        }, null, 8, ["message"])) : error.value ? (openBlock(), createElementBlock("section", _hoisted_7$1, [
          createBaseVNode("p", _hoisted_8, toDisplayString(error.value), 1),
          errorDetail.value ? (openBlock(), createElementBlock("p", _hoisted_9, toDisplayString(errorDetail.value), 1)) : createCommentVNode("", true),
          createBaseVNode("button", {
            type: "button",
            class: "ghost",
            onClick: load
          }, toDisplayString(unref(t)("library.reserve.btn.retry")), 1)
        ])) : !items.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
          key: 4,
          class: "span-all",
          type: "empty",
          message: unref(t)("library.reserve.mine.empty")
        }, null, 8, ["message"])) : (openBlock(true), createElementBlock(Fragment, { key: 5 }, renderList(items.value, (item) => {
          return openBlock(), createElementBlock("article", {
            key: item.key,
            class: "card order"
          }, [
            createBaseVNode("div", _hoisted_10, [
              createBaseVNode("strong", _hoisted_11, toDisplayString(item.name), 1),
              createBaseVNode("span", {
                class: normalizeClass(["badge", { "badge--off": item.cancelled }])
              }, toDisplayString(item.statusName || unref(t)(item.statusKey)), 3)
            ]),
            createBaseVNode("p", _hoisted_12, toDisplayString(item.date) + " " + toDisplayString(timeText(item)), 1),
            createBaseVNode("div", _hoisted_13, [
              createBaseVNode("span", _hoisted_14, toDisplayString(appName(item.app)), 1),
              canCancel(item) ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "danger-link",
                onClick: ($event) => askCancel(item)
              }, toDisplayString(unref(t)("library.reserve.mine.cancel")), 9, _hoisted_15)) : createCommentVNode("", true)
            ])
          ]);
        }), 128)),
        createVNode(unref(TModal), {
          visible: cancelVisible.value,
          title: unref(t)("library.reserve.mine.cancelTitle"),
          width: "380px",
          onClose: _cache[1] || (_cache[1] = ($event) => cancelVisible.value = false)
        }, {
          footer: withCtx(() => [
            createBaseVNode("button", {
              type: "button",
              class: "ghost",
              disabled: cancelling.value,
              onClick: _cache[0] || (_cache[0] = ($event) => cancelVisible.value = false)
            }, toDisplayString(unref(t)("library.reserve.mine.cancelKeep")), 9, _hoisted_22),
            createBaseVNode("button", {
              type: "button",
              class: "danger",
              disabled: cancelling.value,
              onClick: confirmCancel
            }, toDisplayString(cancelling.value ? unref(t)("library.reserve.mine.cancelling") : unref(t)("library.reserve.mine.cancelConfirm")), 9, _hoisted_23)
          ]),
          default: withCtx(() => [
            createBaseVNode("p", _hoisted_16, toDisplayString(unref(t)("library.reserve.mine.cancelHint")), 1),
            cancelTarget.value ? (openBlock(), createElementBlock("dl", _hoisted_17, [
              createBaseVNode("div", _hoisted_18, [
                createBaseVNode("dt", null, toDisplayString(unref(t)("library.reserve.confirm.room")), 1),
                createBaseVNode("dd", null, toDisplayString(cancelTarget.value.name), 1)
              ]),
              createBaseVNode("div", _hoisted_19, [
                createBaseVNode("dt", null, toDisplayString(unref(t)("library.reserve.confirm.date")), 1),
                createBaseVNode("dd", null, toDisplayString(cancelTarget.value.date), 1)
              ]),
              createBaseVNode("div", _hoisted_20, [
                createBaseVNode("dt", null, toDisplayString(unref(t)("library.reserve.confirm.time")), 1),
                createBaseVNode("dd", null, toDisplayString(timeText(cancelTarget.value)), 1)
              ])
            ])) : createCommentVNode("", true),
            cancelError.value ? (openBlock(), createElementBlock("p", _hoisted_21, toDisplayString(cancelError.value), 1)) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["visible", "title"])
      ]);
    };
  }
};
const ReserveMinePanel = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-adf7cc28"]]);
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
  emits: ["back", "require-login", "open-official"],
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
            _cache[2] || (_cache[2] = createBaseVNode("span", {
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
            activeTab.value === "seat" ? (openBlock(), createBlock(ReserveSeatPanel, {
              key: 0,
              onOpenOfficial: _cache[1] || (_cache[1] = ($event) => emit("open-official"))
            })) : activeTab.value === "quiet" ? (openBlock(), createBlock(ReserveRoomPanel, {
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
const LibraryReserveView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-550c10d6"]]);
export {
  LibraryReserveView as default
};
