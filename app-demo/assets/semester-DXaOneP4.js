import { S as SCHEDULE_META_KEY } from "./constants-NOUSPpZg.js";
const deriveSemesterByDate = (date = /* @__PURE__ */ new Date()) => {
  const year = Number(date.getFullYear());
  const month = Number(date.getMonth()) + 1;
  const day = Number(date.getDate());
  let academicYearStart = year - 1;
  let term = 1;
  if (month >= 9) {
    academicYearStart = year;
    term = 1;
  } else if (month >= 3) {
    academicYearStart = year - 1;
    term = 2;
  } else if (month === 2 && day >= 15) {
    academicYearStart = year - 1;
    term = 2;
  } else {
    academicYearStart = year - 1;
    term = 1;
  }
  return `${academicYearStart}-${academicYearStart + 1}-${term}`;
};
const resolveDisplayStudentId = (studentId) => {
  const sid = String(studentId || "").trim();
  if (sid) return sid;
  if (localStorage.getItem("hbu_manual_logout") === "true") return "";
  const fallback = String(localStorage.getItem("hbu_username") || "").trim();
  return /^\d{9,10}$/.test(fallback) ? fallback : "";
};
const readStoredSemesterMeta = () => {
  try {
    const raw = localStorage.getItem(SCHEDULE_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};
const readStoredSemester = () => {
  return String(readStoredSemesterMeta()?.semester || "").trim();
};
const getNextSemesterString = (semester) => {
  const m = String(semester || "").trim().match(/^(\d{4})-(\d{4})-([12])$/);
  if (!m) return "";
  const startYear = Number(m[1]);
  const endYear = Number(m[2]);
  const term = Number(m[3]);
  if (endYear !== startYear + 1) return "";
  if (term === 1) return `${startYear}-${endYear}-2`;
  return `${endYear}-${endYear + 1}-1`;
};
const SEMESTER_SWITCH_LEAD_DAYS = 3;
const parseSemesterLocalDate = (text) => {
  const raw = String(text || "").trim();
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
};
const startOfDay = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};
const resolveSemesterByStartDate = (entries, today = /* @__PURE__ */ new Date(), leadDays = SEMESTER_SWITCH_LEAD_DAYS) => {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const baseDay = startOfDay(today instanceof Date && !Number.isNaN(today.getTime()) ? today : /* @__PURE__ */ new Date());
  const lead = Number.isFinite(leadDays) ? Math.max(0, Math.floor(Number(leadDays))) : SEMESTER_SWITCH_LEAD_DAYS;
  const cutoff = new Date(baseDay);
  cutoff.setDate(cutoff.getDate() + lead);
  let best = null;
  for (const entry of entries) {
    const semester = String(entry?.semester || "").trim();
    if (!semester) continue;
    const start = parseSemesterLocalDate(entry?.start_date);
    if (!start) continue;
    if (start.getTime() > cutoff.getTime()) continue;
    if (!best || start.getTime() > best.start.getTime()) {
      best = { semester, start };
    }
  }
  return best ? best.semester : null;
};
const isSemesterStartWithinLeadWindow = (startDate, today = /* @__PURE__ */ new Date(), leadDays = SEMESTER_SWITCH_LEAD_DAYS) => {
  const start = parseSemesterLocalDate(startDate);
  if (!start) return false;
  const baseDay = startOfDay(today instanceof Date && !Number.isNaN(today.getTime()) ? today : /* @__PURE__ */ new Date());
  const lead = Number.isFinite(leadDays) ? Math.max(0, Math.floor(Number(leadDays))) : SEMESTER_SWITCH_LEAD_DAYS;
  const cutoff = new Date(baseDay);
  cutoff.setDate(cutoff.getDate() + lead);
  return start.getTime() <= cutoff.getTime();
};
export {
  SEMESTER_SWITCH_LEAD_DAYS as S,
  resolveDisplayStudentId as a,
  readStoredSemesterMeta as b,
  resolveSemesterByStartDate as c,
  deriveSemesterByDate as d,
  getNextSemesterString as g,
  isSemesterStartWithinLeadWindow as i,
  readStoredSemester as r
};
