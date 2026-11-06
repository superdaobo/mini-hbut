const resolveTeacherSyncStatus = (input) => {
  if (input.phase === "error") {
    if (!input.hasData) return "failed";
    if (input.offline || input.errorKind === "timeout") return "cached";
    return "failed";
  }
  if (input.phase === "loading") {
    return input.hasSyncTime ? "updating" : "never";
  }
  if (!input.hasSyncTime) return "never";
  if (input.fromCache && (input.stale || input.offline)) return "cached";
  return "synced";
};
const isTeacherOffline = () => {
  try {
    return globalThis.navigator?.onLine === false;
  } catch {
    return false;
  }
};
const pad2 = (value) => String(value).padStart(2, "0");
const formatClock = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
const formatDate = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const parseTeacherSyncTime = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      match[6] ? Number(match[6]) : 0
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed);
};
const describeTeacherSyncTime = (value, now = Date.now()) => {
  const date = parseTeacherSyncTime(value);
  if (!date) return null;
  const nowDate = new Date(now);
  const diff = now - date.getTime();
  if (diff < 0) {
    return { key: "teacher.sync.at", params: { date: formatDate(date), time: formatClock(date) } };
  }
  if (diff < 60 * 1e3) return { key: "teacher.sync.justNow", params: {} };
  if (diff < 60 * 60 * 1e3) {
    return { key: "teacher.sync.minutesAgo", params: { n: String(Math.floor(diff / (60 * 1e3))) } };
  }
  if (isSameDay(date, nowDate)) {
    return { key: "teacher.sync.todayAt", params: { time: formatClock(date) } };
  }
  const yesterday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return { key: "teacher.sync.yesterdayAt", params: { time: formatClock(date) } };
  }
  return { key: "teacher.sync.at", params: { date: formatDate(date), time: formatClock(date) } };
};
const teacherSyncStatusKey = (status) => `teacher.sync.status.${status}`;
export {
  describeTeacherSyncTime as d,
  isTeacherOffline as i,
  resolveTeacherSyncStatus as r,
  teacherSyncStatusKey as t
};
