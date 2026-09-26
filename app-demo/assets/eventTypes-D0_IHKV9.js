import { t } from "./app-demo-BO0WKfcf.js";
const getWeekDays = () => [1, 2, 3, 4, 5, 6, 7].map((i) => t(`schedule.weekdayLong.${i}`));
const getWeekDayLabels = () => [1, 2, 3, 4, 5, 6, 7].map((i) => t(`schedule.weekday.${i}`));
const MAX_PERIOD = 11;
const periodOptions = Array.from({ length: MAX_PERIOD }, (_, i) => i + 1);
const getCourseCardStyleOptions = () => [
  { key: "modern", label: t("schedule.style.modern") },
  { key: "traditional", label: t("schedule.style.traditional") },
  { key: "class", label: t("schedule.style.class") }
];
const getScheduleViewModeOptions = () => [
  { key: "all", label: t("schedule.viewMode.all") },
  { key: "courses", label: t("schedule.viewMode.courses") },
  { key: "events", label: t("schedule.viewMode.events") }
];
const timeSchedule = [
  { p: 1, start: "08:20", end: "09:05" },
  { p: 2, start: "09:10", end: "09:55" },
  { p: 3, start: "10:15", end: "11:00" },
  { p: 4, start: "11:05", end: "11:50" },
  { p: 5, start: "14:00", end: "14:45" },
  { p: 6, start: "14:50", end: "15:35" },
  { p: 7, start: "15:55", end: "16:40" },
  { p: 8, start: "16:45", end: "17:30" },
  { p: 9, start: "18:30", end: "19:15" },
  { p: 10, start: "19:20", end: "20:05" },
  { p: 11, start: "20:10", end: "20:55" }
];
const courseThemes = [
  { bg: "#e7f4ff", text: "#0f5da8", border: "#72b9ff" },
  // 湖蓝
  { bg: "#fff0e8", text: "#cb4f2f", border: "#ffb390" },
  // 珊瑚橘
  { bg: "#efe9ff", text: "#5f52cf", border: "#b8aaff" },
  // 紫藤
  { bg: "#fff4db", text: "#be7a07", border: "#efc465" },
  // 琥珀
  { bg: "#ffeaf2", text: "#c33f73", border: "#f3a8c4" },
  // 玫瑰
  { bg: "#e8faf5", text: "#117f67", border: "#8adcc4" },
  // 青绿
  { bg: "#e8efff", text: "#335ccb", border: "#9eb4ff" },
  // 靛蓝
  { bg: "#fff1f5", text: "#b63f58", border: "#f0acbb" },
  // 浅莓
  { bg: "#edf8ef", text: "#2f8c3d", border: "#9dd7a7" },
  // 春绿
  { bg: "#e8f9ff", text: "#007893", border: "#84d6ec" },
  // 青空
  { bg: "#f4edff", text: "#7548c1", border: "#c6adf1" },
  // 兰紫
  { bg: "#fff2e2", text: "#b05c16", border: "#efb67f" }
  // 暖杏
];
const LOGIN_SESSION_TOKEN_KEY = "hbu_login_session_token";
const SCHEDULE_META_KEY = "hbu_schedule_meta";
const COURSE_COLOR_PRESETS = [
  { id: "lake", hex: "#72b9ff", bg: "#e7f4ff", text: "#0f5da8", label: "湖蓝" },
  { id: "coral", hex: "#ffb390", bg: "#fff0e8", text: "#cb4f2f", label: "珊瑚橘" },
  { id: "wisteria", hex: "#b8aaff", bg: "#efe9ff", text: "#5f52cf", label: "紫藤" },
  { id: "amber", hex: "#efc465", bg: "#fff4db", text: "#be7a07", label: "琥珀" },
  { id: "rose", hex: "#f3a8c4", bg: "#ffeaf2", text: "#c33f73", label: "玫瑰" },
  { id: "teal", hex: "#8adcc4", bg: "#e8faf5", text: "#117f67", label: "青绿" },
  { id: "indigo", hex: "#9eb4ff", bg: "#e8efff", text: "#335ccb", label: "靛蓝" },
  { id: "berry", hex: "#f0acbb", bg: "#fff1f5", text: "#b63f58", label: "浅莓" },
  { id: "spring", hex: "#9dd7a7", bg: "#edf8ef", text: "#2f8c3d", label: "春绿" },
  { id: "sky", hex: "#84d6ec", bg: "#e8f9ff", text: "#007893", label: "青空" },
  { id: "orchid", hex: "#c6adf1", bg: "#f4edff", text: "#7548c1", label: "兰紫" },
  { id: "apricot", hex: "#efb67f", bg: "#fff2e2", text: "#b05c16", label: "暖杏" }
];
const DEFAULT_COURSE_COLOR = "";
function normalizeHexColor(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const hasHash = raw.startsWith("#");
  let body = hasHash ? raw.slice(1).trim() : raw;
  if (hasHash && /^[0-9a-fA-F]{3}$/.test(body)) {
    body = body.split("").map((ch) => ch + ch).join("");
  } else if (/^[0-9a-fA-F]{8}$/.test(body)) {
    body = body.slice(0, 6);
  } else if (!/^[0-9a-fA-F]{6}$/.test(body)) {
    return null;
  }
  return `#${body.toLowerCase()}`;
}
function normalizeOptionalCourseColor(value) {
  if (value === null || value === void 0) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return "";
  return normalizeHexColor(trimmed);
}
function findPresetByHex(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return COURSE_COLOR_PRESETS.find((p) => p.hex.toLowerCase() === normalized) ?? null;
}
function contrastTextForHex(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "#0f172a";
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.55 ? "#0f172a" : "#ffffff";
}
function mixHexWithWhite(hex, amount = 0.22) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "#f8fafc";
  const t2 = Math.min(1, Math.max(0, amount));
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const mix = (c) => Math.round(255 * (1 - t2) + c * t2);
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}
function hexToHsv(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}
function hsvToHex(h, s, v) {
  const hh = (h % 360 + 360) % 360;
  const ss = Math.min(1, Math.max(0, s));
  const vv = Math.min(1, Math.max(0, v));
  const c = vv * ss;
  const x = c * (1 - Math.abs(hh / 60 % 2 - 1));
  const m = vv - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(rp)}${toHex(gp)}${toHex(bp)}`;
}
const hashText = (value) => {
  let hash = 0;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};
const hexToRgb = (hex) => {
  const text = String(hex || "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(text)) return null;
  return {
    r: Number.parseInt(text.slice(0, 2), 16),
    g: Number.parseInt(text.slice(2, 4), 16),
    b: Number.parseInt(text.slice(4, 6), 16)
  };
};
const colorDistance = (aHex, bHex) => {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  if (!a || !b) return 0;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};
const getThemeContrastScore = (aIndex, bIndex) => {
  const themeA = courseThemes[aIndex] || {};
  const themeB = courseThemes[bIndex] || {};
  const borderGap = colorDistance(themeA.border, themeB.border);
  const textGap = colorDistance(themeA.text, themeB.text);
  return borderGap * 0.72 + textGap * 0.28;
};
const getCircularOffset = (seed, candidate) => {
  const len = courseThemes.length;
  const forward = (candidate - seed + len) % len;
  const backward = (seed - candidate + len) % len;
  return Math.min(forward, backward);
};
const evaluateThemeCandidate = (candidate, seed, neighborColors, globalColors) => {
  const neighborMinContrast = neighborColors.length ? neighborColors.reduce((minGap, neighborColor) => {
    const gap = getThemeContrastScore(candidate, neighborColor);
    return gap < minGap ? gap : minGap;
  }, Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
  const globalMinContrast = globalColors.length ? globalColors.reduce((minGap, globalColor) => {
    const gap = getThemeContrastScore(candidate, globalColor);
    return gap < minGap ? gap : minGap;
  }, Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
  return {
    candidate,
    neighborMinContrast,
    globalMinContrast,
    offset: getCircularOffset(seed, candidate)
  };
};
const pickBestThemeCandidate = (candidates, seed, neighborColors, globalColors) => {
  let best = null;
  for (const candidate of candidates) {
    const metrics = evaluateThemeCandidate(candidate, seed, neighborColors, globalColors);
    if (!best) {
      best = metrics;
      continue;
    }
    if (metrics.neighborMinContrast > best.neighborMinContrast) {
      best = metrics;
      continue;
    }
    if (metrics.neighborMinContrast === best.neighborMinContrast && metrics.globalMinContrast > best.globalMinContrast) {
      best = metrics;
      continue;
    }
    if (metrics.neighborMinContrast === best.neighborMinContrast && metrics.globalMinContrast === best.globalMinContrast && metrics.offset < best.offset) {
      best = metrics;
    }
  }
  return best?.candidate ?? null;
};
const processScheduleData = (courses) => {
  if (!courses || courses.length === 0) return [];
  courses.sort((a, b) => {
    if (a.weekday !== b.weekday) return a.weekday - b.weekday;
    return a.period - b.period;
  });
  return courses;
};
const periodsOverlap = (aStart, aEnd, bStart, bEnd) => {
  return !(aEnd < bStart || bEnd < aStart);
};
const areAdjacentCourses = (a, b) => {
  if (a._day === b._day) {
    return a._end + 1 === b._start || b._end + 1 === a._start;
  }
  if (Math.abs(a._day - b._day) === 1) {
    return periodsOverlap(a._start, a._end, b._start, b._end);
  }
  return false;
};
const getCourseMergeSignature = (course) => {
  const id = String(course?.id || course?.source_id || "").trim();
  const name = String(course?.name || "").trim();
  const teacher = String(course?.teacher || "").trim();
  const room = String(course?.room_code || course?.room || "").trim();
  const building = String(course?.building || "").trim();
  const className = String(course?.class_name || "").trim();
  const custom = course?.is_custom ? "1" : "0";
  return `${id}|${name}|${teacher}|${room}|${building}|${className}|${custom}`;
};
const getCourseEndPeriod = (course) => {
  const start = Number(course?.period) || 1;
  const span = Math.max(1, Number(course?.djs) || 1);
  return Math.min(MAX_PERIOD, start + span - 1);
};
const mergeDailyCourses = (dailyCourses) => {
  if (!dailyCourses.length) return [];
  const signatureCount = /* @__PURE__ */ new Map();
  dailyCourses.forEach((course) => {
    const signature = getCourseMergeSignature(course);
    signatureCount.set(signature, (signatureCount.get(signature) || 0) + 1);
  });
  const resolveRawSpan = (course) => {
    const start = Number(course?.period) || 1;
    if (course?.is_custom) {
      return Math.max(1, Math.min(MAX_PERIOD - start + 1, Number(course?.djs) || 1));
    }
    const signature = getCourseMergeSignature(course);
    const count = Number(signatureCount.get(signature) || 0);
    if (count > 1) {
      return 1;
    }
    const candidate = Number(course?.djs) || 1;
    if (candidate >= 1 && candidate <= MAX_PERIOD && start + candidate - 1 <= MAX_PERIOD) {
      return candidate;
    }
    return 1;
  };
  const merged = [];
  let i = 0;
  while (i < dailyCourses.length) {
    const current = dailyCourses[i];
    const startPeriod = Number(current.period) || 1;
    const currentSpan = resolveRawSpan(current);
    let endPeriod = Math.min(MAX_PERIOD, startPeriod + currentSpan - 1);
    let j = i + 1;
    while (j < dailyCourses.length) {
      const next = dailyCourses[j];
      const nextStart = Number(next.period) || 1;
      const nextSpan = resolveRawSpan(next);
      const nextEnd = Math.min(MAX_PERIOD, nextStart + nextSpan - 1);
      const sameSignature = getCourseMergeSignature(next) === getCourseMergeSignature(current);
      const canMergeSinglePeriodOnly = currentSpan === 1 && nextSpan === 1;
      if (sameSignature && canMergeSinglePeriodOnly && !!next.is_custom === !!current.is_custom && nextStart === endPeriod + 1) {
        endPeriod = Math.max(endPeriod, nextEnd);
        j++;
      } else {
        break;
      }
    }
    const span = endPeriod - startPeriod + 1;
    merged.push({
      ...current,
      djs: span
    });
    i = j;
  }
  return merged;
};
const buildConflictBlocks = (day, mergedCourses, weekNumber, fallbackSemester = "") => {
  if (!Array.isArray(mergedCourses) || mergedCourses.length < 2) return [];
  const periodConflicts = [];
  for (let period = 1; period <= 11; period += 1) {
    const activeRaw = mergedCourses.filter((course) => {
      const start = Number(course._start || course.period || 1);
      const span = Math.max(1, Number(course.djs || 1));
      const end = Number(course._end || start + span - 1);
      return period >= start && period <= end && !course.is_conflict;
    });
    const active = [];
    const signatureSet = /* @__PURE__ */ new Set();
    activeRaw.forEach((course) => {
      const signature = `${getCourseMergeSignature(course)}|${course.period}|${course.djs}`;
      if (signatureSet.has(signature)) return;
      signatureSet.add(signature);
      active.push(course);
    });
    if (active.length > 1) {
      const ids = active.map((course) => String(course._uid || course.id || course.name)).sort();
      periodConflicts.push({
        period,
        key: ids.join("|"),
        active
      });
    }
  }
  if (!periodConflicts.length) return [];
  const blocks = [];
  let i = 0;
  while (i < periodConflicts.length) {
    const current = periodConflicts[i];
    let end = current.period;
    let j = i + 1;
    while (j < periodConflicts.length && periodConflicts[j].period === end + 1 && periodConflicts[j].key === current.key) {
      end = periodConflicts[j].period;
      j += 1;
    }
    const conflictCourses = current.active;
    const title = `课程冲突（${conflictCourses.length}门）`;
    blocks.push({
      id: `conflict:${day}:${current.period}:${end}:${current.key}`,
      name: title,
      teacher: "",
      room: "点击查看冲突详情",
      room_code: `${conflictCourses.length}门冲突`,
      building: "冲突提示",
      weekday: day,
      period: current.period,
      djs: end - current.period + 1,
      weeks: [weekNumber],
      weeks_text: String(weekNumber),
      credit: "",
      class_name: "冲突课程",
      is_conflict: true,
      conflict_courses: conflictCourses.map((course) => ({
        id: course.id,
        source_id: course.source_id || course.id,
        name: course.name,
        teacher: course.teacher,
        room: course.room,
        room_code: course.room_code,
        building: course.building,
        weekday: course.weekday,
        period: course.period,
        djs: course.djs,
        weeks: Array.isArray(course.weeks) ? [...course.weeks] : [],
        weeks_text: course.weeks_text,
        credit: course.credit,
        class_name: course.class_name,
        semester: course.semester || fallbackSemester || "",
        is_custom: !!course.is_custom
      }))
    });
    i = j;
  }
  return blocks;
};
const buildWeekCoursesWithColors = (weekNumber, options) => {
  const { scheduleData, fallbackSemester = "" } = options || {};
  const source = Array.isArray(scheduleData) ? scheduleData : [];
  const byDay = {};
  const nodes = [];
  const nameBuckets = /* @__PURE__ */ new Map();
  for (let day = 1; day <= 7; day += 1) {
    const dailyCourses = source.filter((course) => course.weekday === day && course.weeks.includes(weekNumber)).sort((a, b) => a.period - b.period);
    const merged = mergeDailyCourses(dailyCourses).map((course, index) => {
      const span = Math.max(1, Number(course.djs) || 1);
      const start = Number(course.period);
      const end = Math.min(MAX_PERIOD, start + span - 1);
      return {
        ...course,
        _day: day,
        _start: start,
        _end: end,
        _uid: `${day}-${start}-${end}-${course.name}-${index}`
      };
    });
    const conflicts = buildConflictBlocks(day, merged, weekNumber, fallbackSemester);
    byDay[day] = [...merged, ...conflicts];
    merged.forEach((node) => {
      nodes.push(node);
      const nameKey = String(node.name || "");
      if (!nameBuckets.has(nameKey)) {
        nameBuckets.set(nameKey, []);
      }
      nameBuckets.get(nameKey).push(node);
    });
  }
  if (!nodes.length) return byDay;
  const nameNeighbors = new Map([...nameBuckets.keys()].map((name) => [name, /* @__PURE__ */ new Set()]));
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const nameA = String(a.name || "");
      const nameB = String(b.name || "");
      if (nameA !== nameB && areAdjacentCourses(a, b)) {
        nameNeighbors.get(nameA)?.add(nameB);
        nameNeighbors.get(nameB)?.add(nameA);
      }
    }
  }
  const orderedNames = [...nameBuckets.keys()].sort((a, b) => {
    const degreeDiff = (nameNeighbors.get(b)?.size || 0) - (nameNeighbors.get(a)?.size || 0);
    if (degreeDiff !== 0) return degreeDiff;
    return hashText(a) - hashText(b);
  });
  const colorByName = /* @__PURE__ */ new Map();
  const globallyUsedColors = /* @__PURE__ */ new Set();
  const allCandidates = Array.from({ length: courseThemes.length }, (_, i) => i);
  orderedNames.forEach((name) => {
    const neighborColorSet = /* @__PURE__ */ new Set();
    nameNeighbors.get(name)?.forEach((neighborName) => {
      if (!colorByName.has(neighborName)) return;
      const neighborColor = colorByName.get(neighborName);
      neighborColorSet.add(neighborColor);
    });
    const neighborColors = [...neighborColorSet];
    const globalColors = [...globallyUsedColors];
    const seed = hashText(name) % courseThemes.length;
    const uniqueCandidates = allCandidates.filter(
      (candidate) => !globallyUsedColors.has(candidate) && !neighborColorSet.has(candidate)
    );
    const reusableCandidates = allCandidates.filter(
      (candidate) => globallyUsedColors.has(candidate) && !neighborColorSet.has(candidate)
    );
    const noNeighborConflictCandidates = allCandidates.filter(
      (candidate) => !neighborColorSet.has(candidate)
    );
    let chosen = pickBestThemeCandidate(uniqueCandidates, seed, neighborColors, globalColors);
    if (chosen === null) {
      chosen = pickBestThemeCandidate(reusableCandidates, seed, neighborColors, globalColors);
    }
    if (chosen === null) {
      chosen = pickBestThemeCandidate(noNeighborConflictCandidates, seed, neighborColors, globalColors);
    }
    if (chosen === null) {
      chosen = pickBestThemeCandidate(allCandidates, seed, neighborColors, globalColors);
    }
    if (chosen === null) chosen = seed;
    colorByName.set(name, chosen);
    globallyUsedColors.add(chosen);
  });
  for (let day = 1; day <= 7; day += 1) {
    byDay[day] = (byDay[day] || []).map((course) => ({
      ...course,
      colorIndex: course.is_conflict ? 0 : colorByName.get(String(course.name || "")) ?? 0
    }));
  }
  return byDay;
};
const getCourseStyle = (course, cardStyle) => {
  if (!course) return {};
  const start = Number(course.period) || 1;
  const span = Math.max(1, Math.min(MAX_PERIOD - start + 1, Number(course.djs) || 1));
  const isTraditionalCard = cardStyle === "traditional";
  const isClassCard = cardStyle === "class";
  const modernRadius = "14px";
  const traditionalRadius = "12px";
  const classRadius = "12px";
  if (course.is_conflict) {
    return {
      "--course-bg": isTraditionalCard ? "#fef2f2" : isClassCard ? "rgba(254, 242, 242, 0.96)" : "repeating-linear-gradient(135deg, #fff1f2 0, #fff1f2 8px, #ffe4e6 8px, #ffe4e6 16px)",
      "--course-text": isTraditionalCard ? "#b91c1c" : "#b91c1c",
      "--course-border": isTraditionalCard ? "#fecaca" : "#dc2626",
      "--course-shadow": isTraditionalCard ? "0 2px 8px rgba(220, 38, 38, 0.08)" : isClassCard ? "0 6px 14px rgba(220, 38, 38, 0.16)" : "0 8px 18px rgba(220, 38, 38, 0.2)",
      "--course-span": String(span),
      "--course-radius": isTraditionalCard ? traditionalRadius : isClassCard ? classRadius : modernRadius,
      "--course-border-width": isClassCard ? "1px" : "2px",
      gridRow: `${start} / span ${span}`,
      gridColumn: "1",
      zIndex: 4
    };
  }
  let index = 0;
  if (course.colorIndex !== void 0) {
    index = course.colorIndex;
  } else {
    let hash = 0;
    for (let i = 0; i < course.name.length; i++) {
      hash = course.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    index = Math.abs(hash) % courseThemes.length;
  }
  const theme = courseThemes[index];
  const isCustom = !!course.is_custom;
  const userColor = isCustom ? normalizeOptionalCourseColor(course.color) : null;
  const hasUserColor = !!(userColor && userColor.length);
  const borderColor = hasUserColor ? userColor : isCustom ? "#111111" : theme.border || "#cbd5e1";
  const traditionalBackground = hasUserColor ? mixHexWithWhite(userColor, 0.22) : isCustom ? "#111111" : theme.bg;
  const traditionalText = hasUserColor ? contrastTextForHex(traditionalBackground) : isCustom ? "#ffffff" : theme.text;
  const modernText = hasUserColor ? userColor : theme.text;
  const modernBackground = "rgba(255, 255, 255, 0.92)";
  const classBackground = "rgba(255, 255, 255, 0.94)";
  const normalShadow = isCustom ? "0 7px 16px rgba(15, 23, 42, 0.24)" : "0 6px 14px rgba(71, 85, 105, 0.16)";
  const traditionalShadow = "0 2px 8px rgba(0, 0, 0, 0.04)";
  const classShadow = isCustom ? "0 6px 14px rgba(15, 23, 42, 0.2)" : "0 4px 10px rgba(71, 85, 105, 0.14)";
  return {
    "--course-bg": isTraditionalCard ? traditionalBackground : isClassCard ? classBackground : modernBackground,
    "--course-text": isTraditionalCard ? traditionalText : modernText,
    "--course-border": borderColor,
    "--course-shadow": isTraditionalCard ? traditionalShadow : isClassCard ? classShadow : normalShadow,
    "--course-span": String(span),
    "--course-radius": isTraditionalCard ? traditionalRadius : isClassCard ? classRadius : modernRadius,
    "--course-border-width": isClassCard ? "1px" : isCustom ? "2px" : "1px",
    gridRow: `${start} / span ${span}`,
    gridColumn: "1",
    zIndex: 1
  };
};
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
  const startSlot = timeSchedule.find((t2) => t2.p === startPeriod);
  const endSlot = timeSchedule.find((t2) => t2.p === endPeriod);
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
const MINUTES_PER_DAY = 1440;
const DEFAULT_MAX_GAP_MINUTES = 30;
const CLOCK_PATTERN = /^(\d{2}):(\d{2})$/;
const clampNumber = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};
function parseClockToMinute(clock) {
  if (typeof clock !== "string") return null;
  const matched = CLOCK_PATTERN.exec(clock.trim());
  if (!matched) return null;
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
function getCourseRealInterval(period, djs, timeSchedule2) {
  if (!Array.isArray(timeSchedule2) || timeSchedule2.length === 0) return null;
  if (!Number.isFinite(period) || !Number.isFinite(djs)) return null;
  const total = timeSchedule2.length;
  const startIndex = clampNumber(Math.trunc(period), 1, total);
  const span = Math.max(1, Math.trunc(djs) || 1);
  const endIndex = Math.min(total, startIndex + span - 1);
  const startMinute = parseClockToMinute(timeSchedule2[startIndex - 1]?.start ?? "");
  const endMinute = parseClockToMinute(timeSchedule2[endIndex - 1]?.end ?? "");
  if (startMinute === null || endMinute === null || endMinute <= startMinute) return null;
  return { startMinute, endMinute };
}
function buildScheduleTimeGeometry(timeSchedule2, slotHeight, options) {
  const maxGapMinutes = DEFAULT_MAX_GAP_MINUTES;
  const rowHeight = Number.isFinite(slotHeight) && slotHeight > 0 ? slotHeight : 0;
  const emptyGeometry = {
    slotHeight: rowHeight,
    rowCount: 0,
    totalHeight: 0,
    maxGapMinutes,
    rows: [],
    firstMinute: 0,
    lastMinute: 0,
    valid: false
  };
  if (!Array.isArray(timeSchedule2) || timeSchedule2.length === 0 || rowHeight === 0) {
    return emptyGeometry;
  }
  const parsed = [];
  for (const slot of timeSchedule2) {
    const startMinute = parseClockToMinute(slot?.start ?? "");
    const endMinute = parseClockToMinute(slot?.end ?? "");
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      return emptyGeometry;
    }
    parsed.push({
      period: Number.isFinite(Number(slot?.p)) ? Number(slot.p) : parsed.length + 1,
      startMinute,
      endMinute
    });
  }
  const rows = [];
  let totalHeight = 0;
  for (let i = 0; i < parsed.length; i += 1) {
    const current = parsed[i];
    const durationMinutes = current.endMinute - current.startMinute;
    const rawGapMinutes = i + 1 < parsed.length ? Math.max(0, parsed[i + 1].startMinute - current.endMinute) : 0;
    const effGapMinutes = Math.min(rawGapMinutes, maxGapMinutes);
    const denominator = durationMinutes + effGapMinutes;
    const periodBand = denominator > 0 ? rowHeight * durationMinutes / denominator : rowHeight;
    const rowTop = totalHeight;
    rows.push({
      period: current.period,
      rowTop,
      rowHeight,
      startMinute: current.startMinute,
      endMinute: current.endMinute,
      durationMinutes,
      rawGapMinutes,
      effGapMinutes,
      periodBand,
      gapBand: rowHeight - periodBand
    });
    totalHeight += rowHeight;
  }
  return {
    slotHeight: rowHeight,
    rowCount: rows.length,
    totalHeight,
    maxGapMinutes,
    rows,
    firstMinute: rows[0].startMinute,
    lastMinute: rows[rows.length - 1].endMinute,
    valid: true
  };
}
function timeToGridY(minute, geometry) {
  const rows = geometry?.rows ?? [];
  const totalHeight = Number.isFinite(geometry?.totalHeight) && geometry.totalHeight > 0 ? geometry.totalHeight : 0;
  if (!Number.isFinite(minute)) return { y: 0, edge: "before" };
  if (rows.length === 0) return { y: 0, edge: "before" };
  const firstMinute = rows[0].startMinute;
  const lastMinute = rows[rows.length - 1].endMinute;
  if (minute < firstMinute) return { y: 0, edge: "before" };
  if (minute > lastMinute) return { y: totalHeight, edge: "after" };
  let row = rows[0];
  for (let i = 0; i < rows.length; i += 1) {
    if (minute >= rows[i].startMinute) row = rows[i];
    else break;
  }
  let y;
  if (minute <= row.endMinute) {
    const span = row.endMinute - row.startMinute;
    const ratio = span > 0 ? (minute - row.startMinute) / span : 0;
    y = row.rowTop + clampNumber(ratio, 0, 1) * row.periodBand;
  } else {
    const gap = row.rawGapMinutes;
    const ratio = gap > 0 ? (minute - row.endMinute) / gap : 1;
    y = row.rowTop + row.periodBand + clampNumber(ratio, 0, 1) * row.gapBand;
  }
  return { y: clampNumber(y, 0, totalHeight), edge: "inside" };
}
function intervalToGridRect(startMinute, endMinute, geometry) {
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) return null;
  if (endMinute <= startMinute) return null;
  const start = timeToGridY(startMinute, geometry);
  const end = timeToGridY(endMinute, geometry);
  return {
    top: Math.min(start.y, end.y),
    height: Math.max(0, Math.abs(end.y - start.y)),
    startEdge: start.edge,
    endEdge: end.edge
  };
}
function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  if (!Number.isFinite(aStart) || !Number.isFinite(aEnd) || !Number.isFinite(bStart) || !Number.isFinite(bEnd)) {
    return false;
  }
  return aStart < bEnd && bStart < aEnd;
}
function getGridTotalHeight(geometry) {
  const totalHeight = geometry?.totalHeight;
  return Number.isFinite(totalHeight) && totalHeight > 0 ? totalHeight : 0;
}
const REMINDER_OPTIONS = [
  { value: null, labelKey: "schedule.event.reminder.none" },
  { value: 0, labelKey: "schedule.event.reminder.atStart" },
  { value: 5, labelKey: "schedule.event.reminder.min5" },
  { value: 10, labelKey: "schedule.event.reminder.min10" },
  { value: 30, labelKey: "schedule.event.reminder.min30" },
  { value: 60, labelKey: "schedule.event.reminder.hour1" }
];
const ALLOWED_REMINDER_MINUTES = REMINDER_OPTIONS.map(
  (option) => option.value
);
const toText = (value) => {
  if (value === null || value === void 0) return "";
  return String(value).trim();
};
const pick = (source, keys) => {
  for (const key of keys) {
    if (source[key] !== void 0 && source[key] !== null) return source[key];
  }
  return void 0;
};
function isValidCalendarDate(value) {
  const text = toText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}
function daysInMonth(year, month) {
  if (month === 2) {
    const leap = year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
    return leap ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}
function normalizeScheduleEvent(payload) {
  if (!payload || typeof payload !== "object") return null;
  const source = payload;
  const id = toText(pick(source, ["id", "event_id", "eventId"]));
  if (!id) return null;
  const date = toText(pick(source, ["date"]));
  if (!isValidCalendarDate(date)) return null;
  const startTime = toText(pick(source, ["start_time", "startTime"]));
  const endTime = toText(pick(source, ["end_time", "endTime"]));
  const startMinute = parseClockToMinute(startTime);
  const endMinute = parseClockToMinute(endTime);
  if (startMinute === null || endMinute === null || endMinute <= startMinute) return null;
  const rawReminder = pick(source, ["reminder_minutes", "reminderMinutes"]);
  const reminderNumber = Number(rawReminder);
  const reminderMinutes = rawReminder === void 0 || rawReminder === null || !Number.isFinite(reminderNumber) || reminderNumber < 0 ? null : Math.trunc(reminderNumber);
  return {
    id,
    title: toText(pick(source, ["title"])),
    date,
    startTime,
    endTime,
    location: toText(pick(source, ["location"])),
    note: toText(pick(source, ["note"])),
    color: toText(pick(source, ["color"])),
    reminderMinutes,
    createdAt: toText(pick(source, ["created_at", "createdAt"])),
    updatedAt: toText(pick(source, ["updated_at", "updatedAt"]))
  };
}
function toScheduleEventPayload(event) {
  return {
    title: event.title,
    date: event.date,
    start_time: event.startTime,
    end_time: event.endTime,
    location: event.location,
    note: event.note,
    color: event.color,
    reminder_minutes: event.reminderMinutes
  };
}
export {
  ALLOWED_REMINDER_MINUTES as A,
  toScheduleEventPayload as B,
  COURSE_COLOR_PRESETS as C,
  DEFAULT_COURSE_COLOR as D,
  timeSchedule as E,
  getGridTotalHeight as F,
  intervalToGridRect as G,
  buildScheduleTimeGeometry as H,
  MAX_PERIOD as I,
  hexToHsv as J,
  hsvToHex as K,
  LOGIN_SESSION_TOKEN_KEY as L,
  MINUTES_PER_DAY as M,
  REMINDER_OPTIONS as R,
  SCHEDULE_META_KEY as S,
  getCourseCardStyleOptions as a,
  getWeekDays as b,
  getCourseStyle as c,
  buildWeekCoursesWithColors as d,
  getCourseEndPeriod as e,
  periodOptions as f,
  getScheduleViewModeOptions as g,
  getWeekDayLabels as h,
  buildExportEventsForSemester as i,
  buildExportEventsForWeek as j,
  resolveWeekDateRange as k,
  createTimestampSuffix as l,
  mergePersonalEventsIntoExport as m,
  normalizeOptionalCourseColor as n,
  pickBestThemeCandidate as o,
  processScheduleData as p,
  hashText as q,
  resolveSemesterDateRange as r,
  normalizeHexColor as s,
  findPresetByHex as t,
  normalizeScheduleEvent as u,
  parseClockToMinute as v,
  getCourseRealInterval as w,
  intervalsOverlap as x,
  courseThemes as y,
  isValidCalendarDate as z
};
