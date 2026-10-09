import { ac as errorMessage, ad as hasTauri, ae as invoke, af as bridgePost, ag as unwrapBridge } from "./app-demo-DztvWo2z.js";
import { l as looksLikeHtml, s as sanitizeSchoolInboxHtml } from "./school_inbox_content-CxpfsU1v.js";
const asRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
const asArray = (value) => Array.isArray(value) ? value : [];
const asString = (value) => {
  if (value === null || value === void 0) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};
const asNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  return void 0;
};
const INJECTED_IDENTITY_FIELDS = Object.freeze(
  /* @__PURE__ */ new Set([
    "currentUserId",
    "userRoleId",
    "dataAuth",
    "dataXnxq",
    "currentRoleId",
    "currentJsId",
    "currentUserName",
    "currentDepartmentId",
    "new"
  ])
);
const stripInjectedIdentityFields = (record) => {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    if (INJECTED_IDENTITY_FIELDS.has(key)) continue;
    out[key] = value;
  }
  return out;
};
const HTML_ENTITY_MAP = Object.freeze({
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'"
});
const decodeEntitiesOnce = (input) => input.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, (entity) => {
  const mapped = HTML_ENTITY_MAP[entity.toLowerCase()];
  return mapped === void 0 ? entity : mapped;
});
const stripTagsUntilStable = (input) => {
  let current = input;
  for (let pass = 0; pass < 32; pass += 1) {
    const next = current.replace(/<[^>]*>?/g, "");
    if (next === current) return next;
    current = next;
  }
  return current.replace(/[<>]/g, "");
};
const stripTeacherHtml = (raw) => {
  const text = asString(raw);
  if (!text) return "";
  if (!looksLikeHtml(text)) return text;
  const sanitized = sanitizeSchoolInboxHtml(text);
  return stripTagsUntilStable(decodeEntitiesOnce(sanitized)).replace(/\s+/g, " ").trim();
};
const normalizeTeacherText = (value) => asString(value).replace(/\s+/g, " ").trim();
const normalizeSemester = (value) => {
  const text = asString(value);
  const match = text.match(/(\d{4})\s*-\s*(\d{4})\s*-\s*(\d{1,2})/);
  if (!match) return text;
  const term = Number(match[3]);
  return `${match[1]}-${match[2]}-${Number.isFinite(term) ? term : match[3]}`;
};
const normalizeDate = (value) => {
  const text = asString(value);
  const match = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!match) return "";
  const pad = (n) => n.padStart(2, "0");
  return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
};
const normalizeExamTime = (value) => asString(value).replace(/\s*[~～至]\s*/g, "~").replace(/\s+/g, " ").trim();
const buildStableKey = (parts) => parts.map((part) => {
  if (part === null || part === void 0) return "";
  if (typeof part === "number" && Number.isFinite(part)) return String(part);
  return normalizeTeacherText(part).replace(/\s+/g, "_");
}).join("|");
const dedupeByStableKey = (items, keyOf) => {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  items.forEach((item, index) => {
    const key = keyOf(item, index);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out;
};
const normalizeTeacherProfile = (raw) => {
  const record = asRecord(raw);
  const profile = {
    accountId: asString(record.accountId ?? record.currentUserName),
    name: asString(record.name),
    roleId: asString(record.roleId ?? record.currentRoleId),
    departmentId: asString(record.departmentId ?? record.currentDepartmentId)
  };
  const departmentName = asString(record.departmentName);
  if (departmentName) profile.departmentName = departmentName;
  const title = asString(record.title);
  if (title) profile.title = title;
  const email = asString(record.email);
  if (email) profile.email = email;
  return profile;
};
const normalizeTeachingTask = (raw) => {
  const record = stripInjectedIdentityFields(asRecord(raw));
  return {
    id: asString(record.id),
    xnxq: normalizeSemester(record.xnxq),
    kcmc: normalizeTeacherText(record.kcmc),
    name: normalizeTeacherText(record.name),
    jxbid: asString(record.jxbid),
    jxbzc: asString(record.jxbzc) || void 0,
    bjrs: asNumber(record.bjrs),
    xf: asString(record.xf) || void 0,
    zongxs: asString(record.zongxs) || void 0,
    zxs: asString(record.zxs) || void 0,
    skzc: asString(record.skzc) || void 0,
    jxzc: asString(record.jxzc) || void 0,
    ksxs: asString(record.ksxs) || void 0,
    ksxsname: normalizeTeacherText(record.ksxsname) || void 0,
    kcdm: asString(record.kcdm) || void 0,
    encodeId: asString(record.encodeId) || void 0
  };
};
const normalizeTeachingClass = (raw) => {
  const record = stripInjectedIdentityFields(asRecord(raw));
  return {
    id: asString(record.id),
    kcmc: normalizeTeacherText(record.kcmc),
    kcbh: asString(record.kcbh),
    xnxq: normalizeSemester(record.xnxq),
    name: normalizeTeacherText(record.name),
    jxbid: asString(record.jxbid),
    jxbzc: asString(record.jxbzc) || void 0,
    bjrs: asNumber(record.bjrs),
    xf: asString(record.xf) || void 0,
    xs: asString(record.xs) || void 0,
    kkyxmc: normalizeTeacherText(record.kkyxmc) || void 0,
    cjfbzt: asString(record.cjfbzt) || void 0,
    bkbj: asString(record.bkbj) || void 0,
    ksxs: asString(record.ksxs) || void 0
  };
};
const normalizeInvigilation = (raw) => {
  const record = stripInjectedIdentityFields(asRecord(raw));
  return {
    id: asString(record.id),
    xnxq: normalizeSemester(record.xnxq) || void 0,
    pcid: asString(record.pcid) || void 0,
    xqmc: normalizeTeacherText(record.xqmc) || void 0,
    zjk: normalizeTeacherText(record.zjk) || void 0,
    ksrq: normalizeDate(record.ksrq) || void 0,
    kscc: normalizeTeacherText(record.kscc) || void 0,
    kcmc: normalizeTeacherText(record.kcmc),
    jsmc: normalizeTeacherText(record.jsmc) || void 0,
    ksrs: asNumber(record.ksrs),
    kspcmc: normalizeTeacherText(record.kspcmc) || void 0,
    ksfs: normalizeTeacherText(record.ksfs) || void 0,
    jkjsxm: normalizeTeacherText(record.jkjsxm) || void 0,
    kkyx: normalizeTeacherText(record.kkyx) || void 0,
    ksbj: normalizeTeacherText(record.ksbj) || void 0,
    ypjks: asString(record.ypjks) || void 0,
    txbz: asString(record.txbz) || void 0,
    gld: asString(record.gld) || void 0
  };
};
const normalizeTeacherExam = (raw) => {
  const record = stripInjectedIdentityFields(asRecord(raw));
  return {
    id: asString(record.id),
    kcmc: normalizeTeacherText(record.kcmc),
    jsmc: normalizeTeacherText(record.jsmc) || void 0,
    jkjs: normalizeTeacherText(record.jkjs) || void 0,
    kssj: normalizeExamTime(record.kssj) || void 0,
    ksrs: asNumber(record.ksrs),
    kkyx: normalizeTeacherText(record.kkyx) || void 0,
    kspcmc: normalizeTeacherText(record.kspcmc) || void 0,
    ksrq: normalizeDate(record.ksrq) || void 0,
    bjmc: normalizeTeacherText(record.bjmc) || void 0,
    jxbmc: normalizeTeacherText(record.jxbmc) || void 0,
    jsname: normalizeTeacherText(record.jsname) || void 0,
    kcbh: asString(record.kcbh) || void 0,
    jkjsid: asString(record.jkjsid) || void 0,
    qssj: normalizeExamTime(record.qssj) || void 0,
    jssj: normalizeExamTime(record.jssj) || void 0,
    encodeId: asString(record.encodeId) || void 0,
    syrl: asString(record.syrl) || void 0,
    skyx: normalizeTeacherText(record.skyx) || void 0,
    sjbh: asString(record.sjbh) || void 0
  };
};
const normalizeTeachingData = (raw) => {
  const record = asRecord(raw);
  return {
    tasks: asArray(record.tasks).map(normalizeTeachingTask),
    classes: asArray(record.classes).map(normalizeTeachingClass)
  };
};
const normalizeExamData = (raw) => {
  const record = asRecord(raw);
  return {
    invigilations: asArray(record.invigilations).map(normalizeInvigilation),
    exams: asArray(record.exams).map(normalizeTeacherExam)
  };
};
const invigilationKey = (item) => buildStableKey([item.id, item.xnxq, item.kcmc, item.ksrq, item.kscc]);
const classifyTeacherErrorKind = (message) => {
  const text = String(message || "");
  if (!text) return "unknown";
  if (/未实现|尚未实现|not\s*implemented|not_implemented|notimplemented/i.test(text)) {
    return "notImplemented";
  }
  if (/会话已过期|登录已失效|重新登录|请重新登录|session\s*expired|expired/i.test(text)) {
    return "expired";
  }
  if (/没有访问当前接口的权限|无权限|未授权|\b401\b|unauthorized|permission/i.test(text)) {
    return "unauthorized";
  }
  if (/报错啦|错误原因|无法访问|<!doctype|<html/i.test(text)) {
    return "errorHtml";
  }
  if (/超时|timeout|timed\s*out|aborted|abort/i.test(text)) {
    return "timeout";
  }
  return "unknown";
};
const toTeacherDataError = (error) => {
  const message = errorMessage(error);
  return { kind: classifyTeacherErrorKind(message), message };
};
const teacherEmptyError = () => ({ kind: "empty", message: "" });
const runTeacherFetch = async (spec) => {
  try {
    let raw;
    if (hasTauri) {
      raw = await invoke(spec.command, spec.tauriArgs);
    } else {
      const response = await bridgePost(spec.bridgePath, spec.bridgePayload);
      if (response.success === false) {
        throw new Error(errorMessage(response.error) || "教师数据获取失败");
      }
      raw = unwrapBridge(response);
    }
    const data = spec.normalize(raw);
    if (spec.isEmpty(data)) {
      return { status: "empty", data: null, error: teacherEmptyError() };
    }
    return { status: "ready", data, error: null };
  } catch (error) {
    return { status: "error", data: null, error: toTeacherDataError(error) };
  }
};
const fetchTeacherProfile = () => runTeacherFetch({
  command: "teacher_profile_fetch",
  tauriArgs: {},
  bridgePath: "/v2/teacher/profile",
  bridgePayload: {},
  normalize: normalizeTeacherProfile,
  isEmpty: (profile) => !profile.accountId && !profile.name
});
const fetchTeacherTeaching = (semester) => runTeacherFetch({
  command: "teacher_teaching_fetch",
  tauriArgs: { semester: semester ?? null },
  bridgePath: "/v2/teacher/teaching",
  bridgePayload: { semester: semester ?? null },
  normalize: normalizeTeachingData,
  isEmpty: (data) => data.tasks.length === 0 && data.classes.length === 0
});
const fetchTeacherExams = (semester) => runTeacherFetch({
  command: "teacher_exams_fetch",
  tauriArgs: { semester: semester ?? null },
  bridgePath: "/v2/teacher/exams",
  bridgePayload: { semester: semester ?? null },
  normalize: normalizeExamData,
  isEmpty: (data) => data.invigilations.length === 0 && data.exams.length === 0
});
export {
  asString as a,
  normalizeSemester as b,
  classifyTeacherErrorKind as c,
  fetchTeacherTeaching as d,
  normalizeDate as e,
  fetchTeacherProfile as f,
  dedupeByStableKey as g,
  fetchTeacherExams as h,
  invigilationKey as i,
  normalizeTeacherText as n,
  stripTeacherHtml as s,
  toTeacherDataError as t
};
