import { t as timeSchedule } from "./constants-BEIPv_h0.js";
import { v as mergeDailyCourses, l as getCourseEndPeriod } from "./eventTypes-BjJUfugq.js";
const getCoursesForDayAndWeek = (_startDateStr, scheduleData, dayIndex, weekNumber) => {
  const source = Array.isArray(scheduleData) ? scheduleData : [];
  const dailyCourses = source.filter((course) => {
    return course.weekday === dayIndex && course.weeks.includes(weekNumber);
  });
  dailyCourses.sort((a, b) => a.period - b.period);
  return mergeDailyCourses(dailyCourses);
};
const createTimestampSuffix = () => {
  const now = /* @__PURE__ */ new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
};
const getDateForWeekDay = (startDateStr, weekNumber, weekday) => {
  if (!startDateStr) return null;
  const base = new Date(startDateStr);
  base.setDate(base.getDate() + (weekNumber - 1) * 7 + (weekday - 1));
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const buildCourseEvent = (course, iso, weekNumber, day) => {
  const startPeriod = Number(course.period) || 1;
  const endPeriod = getCourseEndPeriod(course);
  const startSlot = timeSchedule.find((t) => t.p === startPeriod);
  const endSlot = timeSchedule.find((t) => t.p === endPeriod);
  if (!startSlot || !endSlot) return null;
  const start = `${iso}T${startSlot.start}:00`;
  const end = `${iso}T${endSlot.end}:00`;
  const room = course.room_code || course.room || "";
  const location = [course.building, room].filter(Boolean).join(" ");
  const timeLabel = `第${weekNumber}周 周${day} 第${startPeriod}-${endPeriod}节 ${startSlot.start}-${endSlot.end}`;
  const description = `时间: ${timeLabel}
地点: ${location || "未标注"}`;
  return {
    summary: course.name,
    description,
    location: location || void 0,
    start,
    end
  };
};
const buildExportEventsForWeek = (weekNumber, options) => {
  const { startDateStr, scheduleData } = options || {};
  const events = [];
  if (!startDateStr) return events;
  const source = Array.isArray(scheduleData) ? scheduleData : [];
  for (let day = 1; day <= 7; day++) {
    const iso = getDateForWeekDay(startDateStr, weekNumber, day);
    if (!iso) continue;
    const courses = getCoursesForDayAndWeek(startDateStr, source, day, weekNumber);
    courses.forEach((course) => {
      const event = buildCourseEvent(course, iso, weekNumber, day);
      if (event) events.push(event);
    });
  }
  return events;
};
const resolveSemesterTotalWeeks = (scheduleData) => {
  const source = Array.isArray(scheduleData) ? scheduleData : [];
  const maxWeek = source.reduce((acc, course) => {
    const maxCourseWeek = Array.isArray(course.weeks) && course.weeks.length ? Math.max(...course.weeks) : 0;
    return Math.max(acc, maxCourseWeek);
  }, 0);
  return maxWeek || 25;
};
const buildExportEventsForSemester = (options) => {
  const { startDateStr, scheduleData } = options || {};
  const events = [];
  if (!startDateStr) return events;
  const source = Array.isArray(scheduleData) ? scheduleData : [];
  const totalWeeks = resolveSemesterTotalWeeks(source);
  const seen = /* @__PURE__ */ new Set();
  for (let week = 1; week <= totalWeeks; week++) {
    for (let day = 1; day <= 7; day++) {
      const iso = getDateForWeekDay(startDateStr, week, day);
      if (!iso) continue;
      const courses = getCoursesForDayAndWeek(startDateStr, source, day, week);
      courses.forEach((course) => {
        const event = buildCourseEvent(course, iso, week, day);
        if (!event) return;
        const teacher = course.teacher || "";
        const key = `${course.name}|${event.start}|${event.end}|${event.location || ""}|${teacher}`;
        if (seen.has(key)) return;
        seen.add(key);
        events.push(event);
      });
    }
  }
  return events;
};
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const buildPersonalEventExportItem = (event) => {
  if (!event || typeof event !== "object") return null;
  const title = String(event.title ?? "").trim();
  const date = String(event.date ?? "").trim();
  const startTime = String(event.start_time ?? "").trim();
  const endTime = String(event.end_time ?? "").trim();
  if (!title || !ISO_DATE_RE.test(date)) return null;
  if (!HH_MM_RE.test(startTime) || !HH_MM_RE.test(endTime)) return null;
  const location = String(event.location ?? "").trim();
  const note = String(event.note ?? "").trim();
  return {
    summary: title,
    description: note || void 0,
    location: location || void 0,
    start: `${date}T${startTime}:00`,
    end: `${date}T${endTime}:00`
  };
};
const personalEventKey = (event) => {
  const id = String(event?.id ?? "").trim();
  if (id) return `id:${id}`;
  return `fingerprint:${String(event?.date ?? "")}|${String(event?.start_time ?? "")}|${String(event?.end_time ?? "")}|${String(event?.title ?? "")}`;
};
const compareByStart = (a, b) => {
  if (a.start === b.start) return 0;
  return a.start < b.start ? -1 : 1;
};
const buildPersonalExportEvents = (options) => {
  const { events, startDate, endDate } = options || {};
  const list = Array.isArray(events) ? events : [];
  const start = String(startDate || "").trim();
  const end = String(endDate || "").trim();
  if (!ISO_DATE_RE.test(start) || !ISO_DATE_RE.test(end)) return [];
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const raw of list) {
    const event = raw;
    const date = String(event?.date ?? "").trim();
    if (!ISO_DATE_RE.test(date) || date < start || date > end) continue;
    const key = personalEventKey(event);
    if (seen.has(key)) continue;
    const item = buildPersonalEventExportItem(event);
    if (!item) continue;
    seen.add(key);
    result.push(item);
  }
  return result.sort(compareByStart);
};
const resolveSemesterDateRange = (startDateStr, scheduleData) => {
  const start = String(startDateStr || "").trim();
  if (!ISO_DATE_RE.test(start)) return null;
  const totalWeeks = resolveSemesterTotalWeeks(scheduleData);
  const endDate = getDateForWeekDay(start, totalWeeks, 7);
  if (!endDate) return null;
  return { startDate: start, endDate };
};
const resolveWeekDateRange = (options) => {
  const { weekDates, startDateStr, weekNumber } = options || {};
  const isos = (Array.isArray(weekDates) ? weekDates : []).map((day) => String(day?.iso ?? "").trim()).filter((iso) => ISO_DATE_RE.test(iso)).sort();
  if (isos.length) {
    return { startDate: isos[0], endDate: isos[isos.length - 1] };
  }
  const week = Number(weekNumber) || 1;
  const startDate = getDateForWeekDay(String(startDateStr || ""), week, 1);
  const endDate = getDateForWeekDay(String(startDateStr || ""), week, 7);
  if (!startDate || !endDate) return null;
  return { startDate, endDate };
};
const mergePersonalEventsIntoExport = async (options) => {
  const courseEvents = Array.isArray(options?.courseEvents) ? options.courseEvents : [];
  const range = options?.range || null;
  const fetchEvents = options?.fetchEvents;
  if (!range || typeof fetchEvents !== "function") {
    return { events: courseEvents, personalEventCount: 0, personalEventsFailed: false };
  }
  let rawEvents = [];
  let personalEventsFailed = false;
  try {
    rawEvents = await fetchEvents(range);
  } catch {
    personalEventsFailed = true;
  }
  const personalEvents = buildPersonalExportEvents({
    events: rawEvents,
    startDate: range.startDate,
    endDate: range.endDate
  });
  const events = [...courseEvents, ...personalEvents];
  events.sort(compareByStart);
  return { events, personalEventCount: personalEvents.length, personalEventsFailed };
};
export {
  buildExportEventsForWeek as a,
  buildExportEventsForSemester as b,
  resolveWeekDateRange as c,
  createTimestampSuffix as d,
  mergePersonalEventsIntoExport as m,
  resolveSemesterDateRange as r
};
