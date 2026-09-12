import { C as nextTick, h as computed, r as ref, v as watch, o as onMounted, $ as onUnmounted, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, u as unref, t as toDisplayString, d as createCommentVNode, b as createBaseVNode, F as Fragment, f as renderList, n as normalizeClass, K as withDirectives, L as vModelText, Y as isRef, j as createBlock, e as normalizeStyle, g as createTextVNode } from "./vue-core-Dzs4fLAU.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { j as showToast, _ as _export_sfc, u as useLocale } from "./app-demo-CUOWTnz-.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import { T as TStatusBadge } from "./TStatusBadge-BQkIkQEA.js";
import { v as isIOSLike, a as isTauriRuntime, d as invokeNative, p as pushDebugLog } from "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const safeText = (value) => String(value ?? "").trim();
const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const preferHttps = (url) => {
  const u = safeText(url);
  if (u.startsWith("http://")) return `https://${u.slice(7)}`;
  return u;
};
const normalizeCourseCover = (url) => {
  const u = safeText(url);
  if (!u) return "";
  return u.replace("/star3/origin/", "/star3/150_150c/");
};
const typeMetaOf = (typeRaw) => {
  const t = safeText(typeRaw).toLowerCase();
  if (t.includes("video") || t === "视频") return { text: "视频", type: "info", kind: "video" };
  if (t.includes("doc") || t.includes("pdf") || t.includes("ppt") || t.includes("book") || t === "document" || t === "文档")
    return { text: "文档", type: "warning", kind: "document" };
  if (t.includes("work") || t === "作业") return { text: "作业", type: "danger", kind: "work" };
  if (t === "knowledge" || t === "章节") return { text: "小节", type: "primary", kind: "knowledge" };
  if (t === "unknown" || t === "未知") return { text: "未知类型", type: "muted", kind: "unknown" };
  return { text: safeText(typeRaw) || "任务", type: "muted", kind: "task" };
};
const formatDuration = (sec) => {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
};
const mediaErrorMessage = (event) => {
  try {
    const el = event?.target;
    const code = el?.error?.code;
    const map = {
      1: "加载中止",
      2: "网络错误（可能被 CDN 拒绝或会话失效）",
      3: "解码失败",
      4: "格式不支持或地址无效"
    };
    if (code && map[code]) return map[code];
    if (el?.error?.message) return String(el.error.message);
  } catch {
  }
  return "";
};
const PIE_COLORS = ["#2563eb", "#7c3aed", "#06b6d4", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899"];
const WEIGHT_LABELS = {
  work: "作业",
  test: "考试",
  video: "视频",
  attend: "签到",
  bbs: "讨论",
  live: "直播",
  read: "阅读",
  task: "任务点"
};
const scoreSlicesOf = (score) => {
  if (!score) return [];
  const list = Array.isArray(score.weight_list) ? score.weight_list : [];
  const raw = [];
  if (list.length) {
    for (const w of list) {
      const value = safeNumber(w.value ?? w.score ?? w.weight ?? 0);
      const name = safeText(w.name || w.key || "项目");
      if (value > 0) raw.push({ name, value });
    }
  } else if (score.weight && typeof score.weight === "object") {
    for (const [k, v] of Object.entries(score.weight)) {
      const value = safeNumber(v);
      if (value > 0) raw.push({ name: WEIGHT_LABELS[k] || k, value });
    }
  }
  const total = raw.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  return raw.map((item, i) => {
    const pct = item.value / total * 100;
    const start = acc;
    acc += pct;
    return {
      ...item,
      pct,
      color: PIE_COLORS[i % PIE_COLORS.length],
      start,
      end: acc
    };
  });
};
const pieGradientOf = (slices) => {
  if (!slices.length) return "conic-gradient(#e2e8f0 0 100%)";
  const parts = slices.map((s) => `${s.color} ${s.start}% ${s.end}%`);
  return `conic-gradient(${parts.join(", ")})`;
};
const normalizeCourse = (item = {}) => {
  const raw = item && typeof item === "object" ? item : {};
  const courseId = safeText(raw.course_id || raw.courseId || "");
  const clazzId = safeText(raw.clazz_id || raw.clazzId || "");
  const cpi = safeText(raw.cpi || "");
  return {
    id: safeText(raw.id || `${courseId}:${clazzId}`),
    courseId,
    clazzId,
    cpi,
    title: safeText(raw.title || raw.name || raw.course_name || "未命名课程"),
    teacher: safeText(raw.teacher || raw.teacher_name || raw.teacherfactor || ""),
    imageUrl: normalizeCourseCover(raw.image_url || raw.imageUrl || raw.cover || ""),
    progressText: safeText(raw.progress_text || raw.progressText || ""),
    progressRate: safeNumber(
      raw.progress_rate ?? raw.progressRate ?? raw.progress_percent ?? raw.percent
    ),
    pendingCount: safeNumber(raw.pending_count ?? raw.pendingCount ?? 0),
    courseUrl: safeText(raw.course_url || raw.courseUrl || raw.url || ""),
    // 缺省用「未分学期」，避免全量标成「本学期」掩盖多学期问题
    semester: safeText(raw.semester || raw.term || "未分学期") || "未分学期"
  };
};
const normalizeKnowledge = (raw = {}) => ({
  id: safeText(raw.id || raw.knowledge_id || raw.knowledgeId),
  knowledgeId: safeText(raw.knowledge_id || raw.knowledgeId || raw.id),
  title: safeText(raw.title || raw.name || "未命名小节"),
  completed: !!(raw.completed || raw.isPassed),
  courseId: safeText(raw.course_id || raw.courseId),
  clazzId: safeText(raw.clazz_id || raw.clazzId),
  cpi: safeText(raw.cpi || ""),
  layer: safeNumber(raw.layer ?? raw.level ?? 0)
});
const normalizeSection = (raw = {}) => {
  const tasks = Array.isArray(raw.tasks) ? raw.tasks : Array.isArray(raw.children) ? raw.children : [];
  return {
    id: safeText(raw.id || raw.section_id || "sec"),
    title: safeText(raw.title || raw.name || "章节"),
    knowledges: tasks.map(normalizeKnowledge).filter((k) => k.id || k.title)
  };
};
const normalizeTaskItem = (raw = {}) => {
  const typeRaw = raw.type || raw.task_type || raw.module || "";
  const title = safeText(raw.title || raw.name || "未命名任务");
  let meta = typeMetaOf(typeRaw);
  if (meta.kind === "task" || meta.kind === "unknown") {
    const lower = title.toLowerCase();
    if (/\.(pdf|ppt|pptx|doc|docx|xls|xlsx|txt)$/i.test(lower) || /课件|讲义|幻灯/.test(title)) {
      meta = { text: "文档", type: "warning", kind: "document" };
    } else if (/\.(mp4|flv|m3u8|mov|avi|mkv|webm)$/i.test(lower)) {
      meta = { text: "视频", type: "info", kind: "video" };
    }
  }
  const objectId = safeText(
    raw.objectId || raw.object_id || raw.property?.objectid || raw.property?.objectId
  );
  const kind = meta.kind;
  return {
    id: safeText(raw.id || raw.jobid || raw.objectId || raw.object_id || Math.random()),
    title,
    objectId,
    jobid: safeText(raw.jobid || raw.jobId),
    completed: !!(raw.completed || raw.isPassed),
    status: safeText(raw.status || (raw.completed || raw.isPassed ? "已完成" : "未完成")),
    typeMeta: meta,
    kind,
    empty_hint: !!(raw.empty_hint || raw.emptyHint)
  };
};
const collectPlayUrls = (st = {}, top = {}) => {
  const list = [];
  const push = (u) => {
    const https = preferHttps(u);
    if (!https || !https.startsWith("http")) return;
    if (!list.includes(https)) list.push(https);
  };
  if (Array.isArray(top.play_urls)) top.play_urls.forEach(push);
  if (Array.isArray(st.play_urls)) st.play_urls.forEach(push);
  ["https", "hd", "http", "play_url", "download", "mp3", "url", "sd"].forEach((k) => {
    push(st[k]);
    push(top[k]);
  });
  return list;
};
const collectDocUrls = (st = {}, top = {}) => {
  const list = [];
  const push = (u) => {
    const https = preferHttps(u);
    if (!https || !https.startsWith("http")) return;
    if (!list.includes(https)) list.push(https);
  };
  if (Array.isArray(top.play_urls)) top.play_urls.forEach(push);
  if (Array.isArray(st.play_urls)) st.play_urls.forEach(push);
  ["https", "http", "download", "pdf", "url", "preview", "previewUrl", "hd", "sd"].forEach((k) => {
    push(st[k]);
    push(top[k]);
  });
  return list;
};
const toVideoProxyUrl = (u, isTauri) => {
  if (!u || !u.startsWith("http")) return u;
  if (!isTauri) return u;
  return `http://127.0.0.1:4399/proxy/video?url=${encodeURIComponent(u)}`;
};
const INITIAL_COURSE_BATCH = 20;
const COURSE_LOAD_MORE_STEP = 20;
const IOS_PROGRESSIVE_FIRST_BATCH = 6;
const MAX_COURSE_LIST_SIZE = 500;
const createChaoxingHubCore = (props, emit) => {
  const isIOSLikeDevice = isIOSLike();
  const loading = ref(true);
  const refreshing = ref(false);
  const pageLoading = ref(false);
  const error = ref("");
  const videoError = ref("");
  const videoSrcIndex = ref(0);
  const mutable = {
    disposed: false,
    progressiveRenderRaf: 0,
    lastCourseAutoLoadAt: 0,
    loadMoreObserver: null,
    loadMoreObserverTarget: null
  };
  const stack = ref([{ level: "list" }]);
  const current = computed(() => stack.value[stack.value.length - 1] || { level: "list" });
  const breadcrumbs = computed(() => {
    const items = [];
    for (const frame of stack.value) {
      if (frame.level === "list") items.push({ key: "list", label: "课程" });
      else if (frame.level === "course")
        items.push({ key: "course", label: frame.course?.title || "课程" });
      else if (frame.level === "section")
        items.push({ key: "section", label: frame.section?.title || "章" });
      else if (frame.level === "knowledge")
        items.push({ key: "knowledge", label: frame.knowledge?.title || "小节" });
      else if (frame.level === "score") items.push({ key: "score", label: "成绩" });
      else if (frame.level === "video")
        items.push({ key: "video", label: frame.task?.title || "视频" });
      else if (frame.level === "document")
        items.push({ key: "document", label: frame.task?.title || "文档" });
    }
    return items;
  });
  const pageTitle = computed(() => {
    const c = current.value;
    if (c.level === "list") return "课程中心";
    if (c.level === "course") return c.course?.title || "课程";
    if (c.level === "section") return c.section?.title || "章节";
    if (c.level === "knowledge") return c.knowledge?.title || "任务";
    if (c.level === "score") return "成绩组成";
    if (c.level === "video") return c.task?.title || "视频";
    if (c.level === "document") return c.task?.title || "文档";
    return "课程中心";
  });
  const activeVideoSrc = computed(() => {
    const urls = current.value?.playUrls || [];
    if (!urls.length) return current.value?.src || "";
    return urls[Math.min(videoSrcIndex.value, urls.length - 1)] || "";
  });
  const scoreSlices = computed(() => scoreSlicesOf(current.value?.score));
  const pieGradient = computed(() => pieGradientOf(scoreSlices.value));
  const cxInvoke = async (cmd, body = {}) => {
    if (!isTauriRuntime()) throw new Error("请在客户端内使用");
    const raw = { student_id: props.studentId || "", ...body };
    const map = [
      ["courseId", "course_id"],
      ["clazzId", "clazz_id"],
      ["classId", "clazz_id"],
      ["knowledgeId", "knowledge_id"],
      ["objectId", "object_id"],
      ["courseUrl", "course_url"],
      ["studentId", "student_id"]
    ];
    for (const [camel, snake] of map) {
      if (raw[camel] != null && (raw[snake] == null || raw[snake] === "")) {
        raw[snake] = raw[camel];
      }
      delete raw[camel];
    }
    return invokeNative(cmd, { req: raw });
  };
  const scrollModuleToTop = () => {
    nextTick(() => {
      try {
        const shell = document.querySelector(".app-shell");
        if (shell) shell.scrollTop = 0;
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        const root = document.querySelector(".cx-hub");
        if (root) root.scrollTop = 0;
      } catch {
      }
    });
  };
  const push = (frame) => {
    stack.value = [...stack.value, frame];
    scrollModuleToTop();
  };
  const releaseMediaForFrames = (frames = []) => {
    const needRelease = frames.some((f) => f?.level === "video" || f?.level === "document");
    if (!needRelease) return;
    try {
      document.querySelectorAll(".cx-hub video.video-el").forEach((v) => {
        try {
          ;
          v.pause();
          v.src = "";
          v.load();
        } catch {
        }
      });
      document.querySelectorAll(".cx-hub iframe.doc-frame").forEach((f) => {
        try {
          ;
          f.src = "about:blank";
        } catch {
        }
      });
    } catch {
    }
  };
  const pop = () => {
    if (stack.value.length <= 1) {
      emit("back");
      return;
    }
    releaseMediaForFrames([stack.value[stack.value.length - 1]]);
    stack.value = stack.value.slice(0, -1);
    videoError.value = "";
    videoSrcIndex.value = 0;
    scrollModuleToTop();
  };
  const jumpTo = (index) => {
    if (index < 0 || index >= stack.value.length) return;
    releaseMediaForFrames(stack.value.slice(index + 1));
    stack.value = stack.value.slice(0, index + 1);
    videoError.value = "";
    videoSrcIndex.value = 0;
    scrollModuleToTop();
  };
  const dispose = () => {
    mutable.disposed = true;
    if (mutable.progressiveRenderRaf) {
      cancelAnimationFrame(mutable.progressiveRenderRaf);
      mutable.progressiveRenderRaf = 0;
    }
    if (mutable.loadMoreObserver) {
      mutable.loadMoreObserver.disconnect();
      mutable.loadMoreObserver = null;
      mutable.loadMoreObserverTarget = null;
    }
  };
  return {
    mutable,
    stack,
    current,
    breadcrumbs,
    pageTitle,
    loading,
    refreshing,
    pageLoading,
    error,
    videoError,
    videoSrcIndex,
    activeVideoSrc,
    scoreSlices,
    pieGradient,
    isIOSLikeDevice,
    shouldRenderRemoteCourseCovers: !isIOSLikeDevice,
    cxInvoke,
    scrollModuleToTop,
    push,
    pop,
    jumpTo,
    releaseMediaForFrames,
    dispose
  };
};
const useChaoxingCourseList = (core) => {
  const courses = ref([]);
  const semesterTabs = ref(["全部"]);
  const activeSemester = ref("全部");
  const searchQuery = ref("");
  const statusMeta = ref({});
  const courseRenderLimit = ref(core.isIOSLikeDevice ? IOS_PROGRESSIVE_FIRST_BATCH : INITIAL_COURSE_BATCH);
  const filteredCourses = computed(() => {
    let list = courses.value;
    if (activeSemester.value && activeSemester.value !== "全部") {
      list = list.filter((c) => c.semester === activeSemester.value);
    }
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) => c.title.toLowerCase().includes(q) || c.teacher.toLowerCase().includes(q)
    );
  });
  const visibleCourses = computed(() => {
    return filteredCourses.value.slice(0, courseRenderLimit.value);
  });
  const hasMoreCourses = computed(
    () => visibleCourses.value.length < filteredCourses.value.length
  );
  const totalPending = computed(
    () => courses.value.reduce((s, c) => s + (c.pendingCount || 0), 0)
  );
  const badgeType = computed(() => {
    if (statusMeta.value?.connected === true) return "success";
    if (courses.value.length) return "warning";
    return "muted";
  });
  const badgeText = computed(() => {
    if (statusMeta.value?.connected === true) return "会话可用";
    if (courses.value.length) return "缓存/部分";
    return "未连接";
  });
  const resetCourseRenderLimit = () => {
    if (core.mutable.progressiveRenderRaf) {
      cancelAnimationFrame(core.mutable.progressiveRenderRaf);
      core.mutable.progressiveRenderRaf = 0;
    }
    courseRenderLimit.value = core.isIOSLikeDevice ? IOS_PROGRESSIVE_FIRST_BATCH : INITIAL_COURSE_BATCH;
  };
  const scheduleProgressiveCourseRender = () => {
    if (core.mutable.progressiveRenderRaf) cancelAnimationFrame(core.mutable.progressiveRenderRaf);
    const step = () => {
      if (core.mutable.disposed) return;
      if (courseRenderLimit.value < INITIAL_COURSE_BATCH) {
        courseRenderLimit.value = Math.min(
          INITIAL_COURSE_BATCH,
          courseRenderLimit.value + 3
        );
        core.mutable.progressiveRenderRaf = requestAnimationFrame(step);
      } else {
        core.mutable.progressiveRenderRaf = 0;
      }
    };
    core.mutable.progressiveRenderRaf = requestAnimationFrame(step);
  };
  const loadMoreCourses = () => {
    if (!hasMoreCourses.value) return;
    const now = Date.now();
    if (now - core.mutable.lastCourseAutoLoadAt < 300) return;
    core.mutable.lastCourseAutoLoadAt = now;
    courseRenderLimit.value += COURSE_LOAD_MORE_STEP;
  };
  const loadMoreSentinelRef = ref(null);
  const ensureLoadMoreObserver = () => {
    if (core.mutable.loadMoreObserver || typeof IntersectionObserver === "undefined") return;
    core.mutable.loadMoreObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) loadMoreCourses();
        }
      },
      { rootMargin: "240px 0px" }
    );
  };
  watch(hasMoreCourses, (hasMore) => {
    if (!hasMore) return;
    ensureLoadMoreObserver();
    nextTick(() => {
      const el = loadMoreSentinelRef.value;
      if (!el || !core.mutable.loadMoreObserver) return;
      if (core.mutable.loadMoreObserverTarget && core.mutable.loadMoreObserverTarget !== el) {
        core.mutable.loadMoreObserver.unobserve(core.mutable.loadMoreObserverTarget);
      }
      core.mutable.loadMoreObserverTarget = el;
      core.mutable.loadMoreObserver.observe(el);
    });
  });
  const loadList = async ({ silent = false, force = false } = {}) => {
    if (!silent) core.loading.value = true;
    else core.refreshing.value = true;
    core.error.value = "";
    const t0 = Date.now();
    const doForce = force || false;
    pushDebugLog("ChaoxingHub", `加载课程列表 silent=${silent} force=${doForce}`, "info");
    try {
      const coursePromise = core.cxInvoke("chaoxing_fetch_courses", { force: doForce });
      const statusPromise = core.cxInvoke("chaoxing_get_session_status", {}).catch((e) => ({
        success: false,
        error: String(e?.message || e)
      }));
      const [courseRes, statusRes] = await Promise.all([coursePromise, statusPromise]);
      if (core.mutable.disposed) return;
      if (courseRes?.success === false) throw new Error(courseRes?.error || "课程列表失败");
      statusMeta.value = statusRes || {};
      let list = Array.isArray(courseRes?.courses) ? courseRes.courses : [];
      pushDebugLog("ChaoxingHub", `课程原始数据 count=${list.length}`, "info");
      if (list.length > MAX_COURSE_LIST_SIZE) {
        pushDebugLog(
          "ChaoxingHub",
          `课程数量超限 raw=${list.length}，已截断至 ${MAX_COURSE_LIST_SIZE}`,
          "warn"
        );
        list = list.slice(0, MAX_COURSE_LIST_SIZE);
      }
      courses.value = list.map(normalizeCourse).filter((c) => c.courseId && c.clazzId);
      if (core.isIOSLikeDevice) {
        courseRenderLimit.value = Math.min(INITIAL_COURSE_BATCH, IOS_PROGRESSIVE_FIRST_BATCH);
        scheduleProgressiveCourseRender();
      }
      pushDebugLog(
        "ChaoxingHub",
        `课程列表完成 count=${courses.value.length} from_cache=${!!courseRes?.from_cache} (${Date.now() - t0}ms)`,
        "info",
        { sync_time: courseRes?.sync_time, platform_status: courseRes?.platform_status }
      );
      const fromApi = Array.isArray(courseRes?.semesters) ? courseRes.semesters.map((s) => String(s ?? "").trim()).filter(Boolean) : [];
      const fromCourses = [...new Set(courses.value.map((c) => c.semester).filter(Boolean))];
      const merged = [];
      for (const s of [...fromApi, ...fromCourses]) {
        if (!merged.includes(s)) merged.push(s);
      }
      merged.sort((a, b) => {
        const rank = (s) => {
          if (s === "本学期") return 0;
          if (String(s).includes("年") || String(s).includes("学期")) return 1;
          if (s === "历史课程") return 2;
          if (s === "未分学期") return 4;
          return 3;
        };
        const d = rank(a) - rank(b);
        if (d !== 0) return d;
        return String(b).localeCompare(String(a), "zh");
      });
      semesterTabs.value = ["全部", ...merged];
      if (!semesterTabs.value.includes(activeSemester.value)) {
        activeSemester.value = "全部";
      }
      pushDebugLog(
        "ChaoxingHub",
        `学期列表 count=${merged.length} labels=${merged.join("|") || "(空)"} folder_extra=${courseRes?.folder_extra ?? "n/a"}`,
        merged.length <= 1 ? "warn" : "info",
        { semesters: merged, from_api: fromApi, from_courses: fromCourses }
      );
    } catch (e) {
      if (core.mutable.disposed) return;
      core.error.value = String(e?.message || e).trim() || "加载失败";
    } finally {
      if (!core.mutable.disposed) {
        if (core.isIOSLikeDevice) {
          requestAnimationFrame(() => {
            if (core.mutable.disposed) return;
            core.loading.value = false;
            core.refreshing.value = false;
          });
        } else {
          core.loading.value = false;
          core.refreshing.value = false;
        }
      }
    }
  };
  const onIosMemoryWarning = () => {
    if (core.mutable.progressiveRenderRaf) {
      cancelAnimationFrame(core.mutable.progressiveRenderRaf);
      core.mutable.progressiveRenderRaf = 0;
    }
    courseRenderLimit.value = INITIAL_COURSE_BATCH;
    pushDebugLog("ChaoxingHub", "收到 iOS 内存告警，收缩课程渲染批量", "warn");
  };
  return {
    courses,
    semesterTabs,
    activeSemester,
    searchQuery,
    statusMeta,
    filteredCourses,
    visibleCourses,
    hasMoreCourses,
    totalPending,
    badgeType,
    badgeText,
    courseRenderLimit,
    loadMoreSentinelRef,
    loadList,
    loadMoreCourses,
    resetCourseRenderLimit,
    onIosMemoryWarning
  };
};
const useChaoxingCourseNav = (core) => {
  const openCourse = async (course, { force = false } = {}) => {
    core.pageLoading.value = true;
    try {
      const outlineRes = await core.cxInvoke("chaoxing_fetch_course_outline", {
        course_id: course.courseId,
        clazz_id: course.clazzId,
        cpi: course.cpi || "",
        course_url: course.courseUrl || "",
        force: !!force
      });
      if (core.mutable.disposed) return;
      if (outlineRes?.success === false) throw new Error(outlineRes?.error || "大纲失败");
      let sectionList = Array.isArray(outlineRes?.sections) ? outlineRes.sections : [];
      if (!sectionList.length && Array.isArray(outlineRes?.nodes)) {
        sectionList = [{ id: "all", title: "全部章节", tasks: outlineRes.nodes }];
      }
      const sections = sectionList.map(normalizeSection).filter((s) => s.knowledges.length || s.title);
      const frame = {
        level: "course",
        course,
        sections,
        progress: {}
      };
      if (core.current.value.level === "course") {
        const base = core.stack.value.slice(0, -1);
        core.stack.value = [...base, frame];
      } else {
        core.push(frame);
      }
      void core.cxInvoke("chaoxing_fetch_course_progress", {
        course_id: course.courseId,
        clazz_id: course.clazzId,
        cpi: course.cpi || "",
        course_url: course.courseUrl || "",
        force: false
      }).then((progressRes) => {
        if (core.mutable.disposed) return;
        const top = core.stack.value[core.stack.value.length - 1];
        if (top?.level === "course" && top.course?.courseId === course.courseId) {
          top.progress = progressRes || {};
          core.stack.value = [...core.stack.value.slice(0, -1), { ...top }];
        }
      }).catch(() => {
      });
    } catch (e) {
      if (core.mutable.disposed) return;
      showToast(safeText(e?.message || e) || "打开课程失败");
    } finally {
      if (!core.mutable.disposed) core.pageLoading.value = false;
    }
  };
  const openSection = (course, section) => {
    core.push({ level: "section", course, section });
  };
  const openKnowledge = async (course, section, knowledge) => {
    core.pageLoading.value = true;
    try {
      const courseId = knowledge.courseId || course.courseId;
      const clazzId = knowledge.clazzId || course.clazzId;
      const cpi = knowledge.cpi || course.cpi || "";
      const kid = knowledge.knowledgeId || knowledge.id;
      const res = await core.cxInvoke("chaoxing_get_knowledge_cards", {
        course_id: courseId,
        clazz_id: clazzId,
        knowledge_id: kid,
        cpi
      });
      if (core.mutable.disposed) return;
      if (res?.success === false) throw new Error(res?.error || "任务点加载失败");
      const list = Array.isArray(res?.tasks) ? res.tasks : Array.isArray(res?.attachments) ? res.attachments : Array.isArray(res?.videos) ? res.videos : [];
      const mapped = list.map(normalizeTaskItem);
      const real = mapped.filter((t) => !t.empty_hint && (t.objectId || t.kind !== "task"));
      core.push({
        level: "knowledge",
        course,
        section,
        knowledge,
        tasks: real.length ? real : mapped,
        meta: {
          fid: safeText(res?.fid || ""),
          reportUrl: safeText(res?.reportUrl || res?.report_url || ""),
          userid: safeText(res?.userid || "")
        }
      });
    } catch (e) {
      if (core.mutable.disposed) return;
      showToast(safeText(e?.message || e) || "打开小节失败");
    } finally {
      if (!core.mutable.disposed) core.pageLoading.value = false;
    }
  };
  const openScore = async (course) => {
    core.pageLoading.value = true;
    try {
      const res = await core.cxInvoke("chaoxing_fetch_course_score", {
        course_id: course.courseId,
        clazz_id: course.clazzId,
        cpi: course.cpi || ""
      });
      if (core.mutable.disposed) return;
      if (res?.success === false) throw new Error(res?.error || res?.message || "成绩加载失败");
      if (core.current.value.level === "score") {
        const base = core.stack.value.slice(0, -1);
        core.stack.value = [...base, { level: "score", course, score: res }];
      } else {
        core.push({ level: "score", course, score: res });
      }
    } catch (e) {
      if (core.mutable.disposed) return;
      const msg = safeText(e?.message || e) || "成绩加载失败";
      if (msg.includes("Unknown POST endpoint")) {
        showToast("成绩接口未就绪，请完全退出应用后重新打开");
      } else if (msg.includes("duplicate field")) {
        showToast("参数冲突已修复，请完全重启应用后再试");
      } else {
        showToast(msg);
      }
    } finally {
      if (!core.mutable.disposed) core.pageLoading.value = false;
    }
  };
  const openVideo = async (course, section, knowledge, task, meta) => {
    if (!task.objectId) {
      showToast("该任务没有可播放资源");
      return;
    }
    core.pageLoading.value = true;
    core.videoError.value = "";
    core.videoSrcIndex.value = 0;
    try {
      const res = await core.cxInvoke("chaoxing_get_video_status", {
        object_id: task.objectId,
        fid: safeText(meta?.fid || "0")
      });
      if (core.mutable.disposed) return;
      if (res?.success === false) throw new Error(res?.error || "视频状态失败");
      const st = res?.data && typeof res.data === "object" ? res.data : res;
      const playUrls = collectPlayUrls(st, res || {}).map((u) => toVideoProxyUrl(u, isTauriRuntime()));
      if (!playUrls.length) {
        throw new Error(
          st.status && st.status !== "success" ? `视频不可用（${st.status}）` : "未返回播放地址，请确认学习通会话有效"
        );
      }
      core.push({
        level: "video",
        course,
        section,
        knowledge,
        task,
        src: playUrls[0] || "",
        playUrls,
        poster: preferHttps(safeText(st.screenshot || st.thumb || "")),
        filename: safeText(st.filename || task.title),
        duration: safeNumber(st.duration)
      });
    } catch (e) {
      if (core.mutable.disposed) return;
      showToast(safeText(e?.message || e) || "视频打开失败");
    } finally {
      if (!core.mutable.disposed) core.pageLoading.value = false;
    }
  };
  const openDocument = async (course, section, knowledge, task, meta) => {
    if (!task.objectId) {
      showToast(`文档「${task.title}」无可预览资源（缺少 objectId）`);
      return;
    }
    core.pageLoading.value = true;
    try {
      const res = await core.cxInvoke("chaoxing_get_video_status", {
        object_id: task.objectId,
        fid: safeText(meta?.fid || "0")
      });
      if (core.mutable.disposed) return;
      if (res?.success === false) throw new Error(res?.error || "文档状态失败");
      const st = res?.data && typeof res.data === "object" ? res.data : res;
      const docUrls = collectDocUrls(st, res || {});
      const filename = safeText(st.filename || task.title);
      const officialPreview = preferHttps(
        `https://mooc1.chaoxing.com/ananas/modules/pdf/index.html?objectid=${encodeURIComponent(task.objectId)}&fid=${encodeURIComponent(safeText(meta?.fid || "0"))}`
      );
      const previewUrl = docUrls[0] || officialPreview;
      if (!previewUrl) {
        showToast(`文档「${filename || task.title}」暂无预览地址，请在学习通网页端打开`);
        return;
      }
      core.push({
        level: "document",
        course,
        section,
        knowledge,
        task,
        src: previewUrl,
        candidates: docUrls.length ? docUrls : [officialPreview],
        filename,
        fileType: safeText(st.fileType || st.filetype || task.typeMeta?.text || "文档")
      });
    } catch (e) {
      if (core.mutable.disposed) return;
      const msg = safeText(e?.message || e) || "文档打开失败";
      showToast(`文档预览失败：${msg}`);
    } finally {
      if (!core.mutable.disposed) core.pageLoading.value = false;
    }
  };
  const onVideoError = (event) => {
    const frame = core.current.value;
    const urls = frame?.playUrls || [];
    if (core.videoSrcIndex.value + 1 < urls.length) {
      core.videoSrcIndex.value += 1;
      core.videoError.value = `线路 ${core.videoSrcIndex.value + 1}/${urls.length} 失败，切换备用地址…`;
      return;
    }
    const detail = mediaErrorMessage(event);
    core.videoError.value = detail ? `视频播放失败：${detail}。请重试、切换线路或重新登录学习通` : "视频播放失败：无法解析播放地址或被 CDN 拒绝。请重试，或重新登录学习通后再打开";
  };
  const retryVideo = () => {
    const frame = core.current.value;
    if (frame?.level !== "video" || !frame.task) return;
    const task = frame.task;
    const course = frame.course;
    const section = frame.section;
    const knowledge = frame.knowledge;
    const knowFrame = [...core.stack.value].reverse().find((f) => f.level === "knowledge");
    const meta = knowFrame?.meta || { fid: "0" };
    if (core.stack.value.length > 1 && core.current.value.level === "video") {
      core.stack.value = core.stack.value.slice(0, -1);
    }
    core.videoError.value = "";
    core.videoSrcIndex.value = 0;
    void openVideo(course, section, knowledge, task, meta);
  };
  const onTaskClick = (frame, task) => {
    if (task.empty_hint) {
      showToast("该小节暂无任务点");
      return;
    }
    if (task.kind === "video") {
      void openVideo(frame.course, frame.section, frame.knowledge, task, frame.meta || {});
      return;
    }
    if (task.kind === "document") {
      void openDocument(frame.course, frame.section, frame.knowledge, task, frame.meta || {});
      return;
    }
    if (task.kind === "work") {
      showToast(`作业「${task.title}」请在学习通网页端完成`);
      return;
    }
    if (task.kind === "unknown" && task.objectId) {
      showToast(`未知类型任务「${task.title}」，暂不按视频打开`);
      return;
    }
    showToast(`${task.typeMeta?.text || "任务"}：${task.title}`);
  };
  const onCoverError = (event) => {
    const target = event.target;
    if (target) {
      target.style.display = "none";
      const fallback = target.nextElementSibling;
      if (fallback) fallback.style.display = "flex";
    }
  };
  return {
    openCourse,
    openSection,
    openKnowledge,
    openScore,
    openVideo,
    openDocument,
    onTaskClick,
    retryVideo,
    onCoverError,
    onVideoError
  };
};
const _hoisted_1 = { class: "cx-hub" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = { class: "cx-hub__body" };
const _hoisted_4 = ["aria-label"];
const _hoisted_5 = ["disabled", "onClick"];
const _hoisted_6 = {
  key: 0,
  class: "crumb-sep"
};
const _hoisted_7 = {
  key: 1,
  class: "page-loading"
};
const _hoisted_8 = { class: "panel hero" };
const _hoisted_9 = { class: "hero-row" };
const _hoisted_10 = { class: "stat-row" };
const _hoisted_11 = { class: "stat" };
const _hoisted_12 = { class: "stat" };
const _hoisted_13 = {
  key: 0,
  class: "err"
};
const _hoisted_14 = {
  key: 1,
  class: "hint"
};
const _hoisted_15 = {
  key: 0,
  class: "sem-scroll",
  role: "tablist"
};
const _hoisted_16 = ["aria-selected", "onClick"];
const _hoisted_17 = { class: "search-wrap" };
const _hoisted_18 = ["placeholder"];
const _hoisted_19 = ["onClick"];
const _hoisted_20 = { class: "cover" };
const _hoisted_21 = ["src"];
const _hoisted_22 = { class: "row-main" };
const _hoisted_23 = {
  key: 0,
  class: "sem-tag"
};
const _hoisted_24 = { class: "mini-bar" };
const _hoisted_25 = { class: "row-main" };
const _hoisted_26 = { class: "panel course-head" };
const _hoisted_27 = { class: "course-head__top" };
const _hoisted_28 = { class: "course-head__meta" };
const _hoisted_29 = { class: "pill" };
const _hoisted_30 = { class: "btn-row" };
const _hoisted_31 = {
  key: 0,
  class: "hint"
};
const _hoisted_32 = { class: "section-head" };
const _hoisted_33 = { class: "section-head__title" };
const _hoisted_34 = { class: "section-head__count" };
const _hoisted_35 = { class: "menu-list" };
const _hoisted_36 = ["onClick"];
const _hoisted_37 = { class: "menu-item__rail" };
const _hoisted_38 = { class: "menu-item__num" };
const _hoisted_39 = {
  key: 0,
  class: "menu-item__line"
};
const _hoisted_40 = { class: "menu-item__body" };
const _hoisted_41 = { class: "menu-item__meta" };
const _hoisted_42 = { class: "dot" };
const _hoisted_43 = { class: "dot soft" };
const _hoisted_44 = { class: "panel soft-panel" };
const _hoisted_45 = { class: "pill slate" };
const _hoisted_46 = { class: "soft-panel__title" };
const _hoisted_47 = { class: "section-head" };
const _hoisted_48 = { class: "section-head__title" };
const _hoisted_49 = { class: "section-head__count" };
const _hoisted_50 = { class: "menu-list" };
const _hoisted_51 = ["onClick"];
const _hoisted_52 = { class: "material-symbols-outlined" };
const _hoisted_53 = { class: "menu-item__body" };
const _hoisted_54 = { class: "menu-item__meta" };
const _hoisted_55 = { class: "panel soft-panel" };
const _hoisted_56 = { class: "pill violet" };
const _hoisted_57 = { class: "soft-panel__title" };
const _hoisted_58 = { class: "hint" };
const _hoisted_59 = { class: "section-head" };
const _hoisted_60 = { class: "section-head__title" };
const _hoisted_61 = { class: "section-head__count" };
const _hoisted_62 = { class: "menu-list" };
const _hoisted_63 = ["onClick"];
const _hoisted_64 = { class: "material-symbols-outlined" };
const _hoisted_65 = { class: "menu-item__body" };
const _hoisted_66 = { class: "menu-item__meta" };
const _hoisted_67 = { class: "dot" };
const _hoisted_68 = { class: "material-symbols-outlined menu-item__chev accent" };
const _hoisted_69 = {
  key: 6,
  class: "panel score-panel"
};
const _hoisted_70 = { class: "score-total" };
const _hoisted_71 = {
  key: 0,
  class: "hint"
};
const _hoisted_72 = {
  key: 0,
  class: "pie-wrap"
};
const _hoisted_73 = { class: "pie-hole" };
const _hoisted_74 = { class: "pie-legend" };
const _hoisted_75 = {
  key: 1,
  class: "score-list"
};
const _hoisted_76 = {
  key: 2,
  class: "weight-grid"
};
const _hoisted_77 = { class: "wchip" };
const _hoisted_78 = { class: "wchip" };
const _hoisted_79 = { class: "wchip" };
const _hoisted_80 = { class: "wchip" };
const _hoisted_81 = {
  key: 3,
  class: "hint"
};
const _hoisted_82 = {
  key: 7,
  class: "panel video-panel"
};
const _hoisted_83 = { class: "crumb" };
const _hoisted_84 = { class: "video-title" };
const _hoisted_85 = {
  key: 0,
  class: "hint"
};
const _hoisted_86 = ["poster", "src"];
const _hoisted_87 = {
  key: 1,
  class: "video-err"
};
const _hoisted_88 = { class: "btn-row video-actions" };
const _hoisted_89 = { class: "hint" };
const _hoisted_90 = {
  key: 8,
  class: "panel video-panel"
};
const _hoisted_91 = { class: "crumb" };
const _hoisted_92 = { class: "video-title" };
const _hoisted_93 = { class: "hint" };
const _hoisted_94 = ["src", "title"];
const _hoisted_95 = {
  key: 1,
  class: "video-err"
};
const _hoisted_96 = { class: "btn-row video-actions" };
const _hoisted_97 = { class: "hint" };
const _sfc_main = {
  __name: "ChaoxingHubView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const { t } = useLocale();
    const tFmt = (key, params = {}) => Object.entries(params).reduce(
      (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
      t(key)
    );
    const props = __props;
    const emit = __emit;
    const core = createChaoxingHubCore(props, emit);
    const list = useChaoxingCourseList(core);
    const nav = useChaoxingCourseNav(core);
    const {
      current,
      breadcrumbs,
      pageTitle,
      stack,
      loading,
      refreshing,
      pageLoading,
      error,
      videoError,
      videoSrcIndex,
      activeVideoSrc,
      scoreSlices,
      pieGradient,
      shouldRenderRemoteCourseCovers,
      jumpTo,
      pop
    } = core;
    const {
      courses,
      semesterTabs,
      activeSemester,
      searchQuery,
      filteredCourses,
      visibleCourses,
      hasMoreCourses,
      totalPending,
      badgeType,
      badgeText,
      loadMoreSentinelRef,
      loadList,
      loadMoreCourses,
      resetCourseRenderLimit,
      onIosMemoryWarning
    } = list;
    const {
      openCourse,
      openSection,
      openKnowledge,
      openScore,
      onTaskClick,
      retryVideo,
      onCoverError,
      onVideoError
    } = nav;
    const handleHeaderBack = () => pop();
    watch(
      () => props.studentId,
      () => {
        stack.value = [{ level: "list" }];
        resetCourseRenderLimit();
        void loadList();
      }
    );
    watch([activeSemester, searchQuery], () => {
      resetCourseRenderLimit();
    });
    onMounted(() => {
      core.scrollModuleToTop();
      window.addEventListener("iosMemoryWarning", onIosMemoryWarning);
      void loadList();
    });
    onUnmounted(() => {
      core.dispose();
      window.removeEventListener("iosMemoryWarning", onIosMemoryWarning);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(pageTitle),
          icon: "school",
          onBack: handleHeaderBack
        }, {
          actions: withCtx(() => [
            unref(current).level === "list" ? (openBlock(), createElementBlock("button", {
              key: 0,
              class: "ghost-btn",
              type: "button",
              disabled: unref(refreshing) || unref(loading),
              onClick: _cache[0] || (_cache[0] = ($event) => unref(loadList)({ silent: true, force: true }))
            }, toDisplayString(unref(refreshing) ? "…" : unref(t)("chaoxing.hub.refresh")), 9, _hoisted_2)) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("div", _hoisted_3, [
          unref(stack).length > 1 ? (openBlock(), createElementBlock("nav", {
            key: 0,
            class: "crumbs",
            "aria-label": unref(t)("chaoxing.hub.pathAria")
          }, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(breadcrumbs), (bc, i) => {
              return openBlock(), createElementBlock(Fragment, {
                key: bc.key + i
              }, [
                createBaseVNode("button", {
                  type: "button",
                  class: normalizeClass(["crumb-btn", { current: i === unref(breadcrumbs).length - 1 }]),
                  disabled: i === unref(breadcrumbs).length - 1,
                  onClick: ($event) => unref(jumpTo)(i)
                }, toDisplayString(bc.label), 11, _hoisted_5),
                i < unref(breadcrumbs).length - 1 ? (openBlock(), createElementBlock("span", _hoisted_6, "/")) : createCommentVNode("", true)
              ], 64);
            }), 128))
          ], 8, _hoisted_4)) : createCommentVNode("", true),
          unref(pageLoading) ? (openBlock(), createElementBlock("div", _hoisted_7, [
            _cache[11] || (_cache[11] = createBaseVNode("span", { class: "material-symbols-outlined spin" }, "progress_activity", -1)),
            createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.loading")), 1)
          ])) : createCommentVNode("", true),
          unref(current).level === "list" ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            createBaseVNode("section", _hoisted_8, [
              createBaseVNode("div", _hoisted_9, [
                createBaseVNode("div", null, [
                  createBaseVNode("strong", null, toDisplayString(unref(t)("chaoxing.hub.myCourses")), 1),
                  createBaseVNode("p", null, toDisplayString(tFmt("chaoxing.hub.courseCount", { n: unref(courses).length })) + " · " + toDisplayString(unref(semesterTabs).length > 2 ? tFmt("chaoxing.hub.semestersCount", { n: unref(semesterTabs).length - 1 }) : unref(semesterTabs).length === 2 ? unref(semesterTabs)[1] : unref(t)("chaoxing.hub.semestersPending")), 1)
                ]),
                createVNode(unref(TStatusBadge), {
                  type: unref(badgeType),
                  text: unref(badgeText)
                }, null, 8, ["type", "text"])
              ]),
              createBaseVNode("div", _hoisted_10, [
                createBaseVNode("div", _hoisted_11, [
                  createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.statCourses")), 1),
                  createBaseVNode("b", null, toDisplayString(unref(filteredCourses).length), 1)
                ]),
                createBaseVNode("div", _hoisted_12, [
                  createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.statPending")), 1),
                  createBaseVNode("b", null, toDisplayString(unref(totalPending)), 1)
                ])
              ]),
              unref(error) ? (openBlock(), createElementBlock("p", _hoisted_13, toDisplayString(unref(error)), 1)) : createCommentVNode("", true),
              unref(filteredCourses).length > unref(visibleCourses).length ? (openBlock(), createElementBlock("p", _hoisted_14, toDisplayString(tFmt("chaoxing.hub.shownProgress", { a: unref(visibleCourses).length, b: unref(filteredCourses).length })), 1)) : createCommentVNode("", true)
            ]),
            unref(semesterTabs).length > 1 ? (openBlock(), createElementBlock("div", _hoisted_15, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(semesterTabs), (sem) => {
                return openBlock(), createElementBlock("button", {
                  key: sem,
                  type: "button",
                  class: normalizeClass(["sem-chip", { active: unref(activeSemester) === sem }]),
                  role: "tab",
                  "aria-selected": unref(activeSemester) === sem,
                  onClick: ($event) => activeSemester.value = sem
                }, toDisplayString(sem), 11, _hoisted_16);
              }), 128))
            ])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_17, [
              _cache[12] || (_cache[12] = createBaseVNode("span", { class: "material-symbols-outlined" }, "search", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => isRef(searchQuery) ? searchQuery.value = $event : null),
                type: "search",
                placeholder: unref(t)("chaoxing.hub.searchPlaceholder")
              }, null, 8, _hoisted_18), [
                [vModelText, unref(searchQuery)]
              ])
            ]),
            unref(loading) ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 1,
              type: "loading",
              message: unref(t)("chaoxing.hub.readingCourses")
            }, null, 8, ["message"])) : !unref(filteredCourses).length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 2,
              type: "empty",
              message: unref(error) || unref(t)("chaoxing.hub.noCourses")
            }, null, 8, ["message"])) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(visibleCourses), (c) => {
              return openBlock(), createElementBlock("button", {
                key: c.id,
                type: "button",
                class: "row-card course",
                onClick: ($event) => unref(openCourse)(c)
              }, [
                createBaseVNode("div", _hoisted_20, [
                  unref(shouldRenderRemoteCourseCovers) && c.imageUrl ? (openBlock(), createElementBlock("img", {
                    key: 0,
                    src: c.imageUrl,
                    alt: "",
                    loading: "lazy",
                    referrerpolicy: "no-referrer",
                    onError: _cache[2] || (_cache[2] = (...args) => unref(onCoverError) && unref(onCoverError)(...args))
                  }, null, 40, _hoisted_21)) : createCommentVNode("", true),
                  createBaseVNode("div", {
                    class: "cover-fb",
                    style: normalizeStyle(unref(shouldRenderRemoteCourseCovers) && c.imageUrl ? { display: "none" } : void 0)
                  }, [..._cache[13] || (_cache[13] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "menu_book", -1)
                  ])], 4)
                ]),
                createBaseVNode("div", _hoisted_22, [
                  createBaseVNode("strong", null, toDisplayString(c.title), 1),
                  createBaseVNode("p", null, [
                    c.semester ? (openBlock(), createElementBlock("span", _hoisted_23, toDisplayString(c.semester), 1)) : createCommentVNode("", true),
                    createTextVNode(" " + toDisplayString(c.teacher || unref(t)("chaoxing.hub.teacherMissing")), 1)
                  ]),
                  createBaseVNode("div", _hoisted_24, [
                    createBaseVNode("i", {
                      style: normalizeStyle({ width: Math.min(100, c.progressRate || 0) + "%" })
                    }, null, 4)
                  ])
                ]),
                _cache[14] || (_cache[14] = createBaseVNode("span", { class: "material-symbols-outlined chev" }, "chevron_right", -1))
              ], 8, _hoisted_19);
            }), 128)),
            unref(hasMoreCourses) ? (openBlock(), createElementBlock("button", {
              key: 3,
              type: "button",
              class: "row-card course course-load-more",
              onClick: _cache[3] || (_cache[3] = (...args) => unref(loadMoreCourses) && unref(loadMoreCourses)(...args))
            }, [
              createBaseVNode("div", _hoisted_25, [
                createBaseVNode("strong", null, toDisplayString(unref(t)("chaoxing.hub.loadMore")), 1),
                createBaseVNode("p", null, toDisplayString(tFmt("chaoxing.hub.loadMoreRemaining", { n: unref(filteredCourses).length - unref(visibleCourses).length })), 1)
              ]),
              _cache[15] || (_cache[15] = createBaseVNode("span", { class: "material-symbols-outlined chev" }, "expand_more", -1))
            ])) : createCommentVNode("", true),
            unref(hasMoreCourses) ? (openBlock(), createElementBlock("div", {
              key: 4,
              ref_key: "loadMoreSentinelRef",
              ref: loadMoreSentinelRef,
              class: "course-load-sentinel",
              "aria-hidden": "true"
            }, null, 512)) : createCommentVNode("", true)
          ], 64)) : unref(current).level === "course" ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("section", _hoisted_26, [
              createBaseVNode("div", _hoisted_27, [
                createBaseVNode("div", _hoisted_28, [
                  createBaseVNode("span", _hoisted_29, toDisplayString(unref(t)("chaoxing.hub.chaptersTitle")), 1),
                  createBaseVNode("strong", null, toDisplayString(unref(current).course.title), 1),
                  createBaseVNode("p", null, toDisplayString(unref(current).course.teacher || unref(t)("chaoxing.hub.teacherMissing")), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_30, [
                createBaseVNode("button", {
                  type: "button",
                  class: "chip-btn",
                  onClick: _cache[4] || (_cache[4] = ($event) => unref(openScore)(unref(current).course))
                }, [
                  _cache[16] || (_cache[16] = createBaseVNode("span", { class: "material-symbols-outlined" }, "grade", -1)),
                  createTextVNode(" " + toDisplayString(unref(t)("chaoxing.hub.scoreComposition")), 1)
                ]),
                createBaseVNode("button", {
                  type: "button",
                  class: "chip-btn ghost",
                  onClick: _cache[5] || (_cache[5] = ($event) => unref(openCourse)(unref(current).course, { force: true }))
                }, [
                  _cache[17] || (_cache[17] = createBaseVNode("span", { class: "material-symbols-outlined" }, "refresh", -1)),
                  createTextVNode(" " + toDisplayString(unref(t)("chaoxing.hub.refresh")), 1)
                ])
              ]),
              unref(current).progress?.progress_text ? (openBlock(), createElementBlock("p", _hoisted_31, toDisplayString(unref(current).progress.progress_text), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_32, [
              createBaseVNode("span", _hoisted_33, toDisplayString(unref(t)("chaoxing.hub.allChapters")), 1),
              createBaseVNode("span", _hoisted_34, toDisplayString(tFmt("chaoxing.hub.chaptersCount", { n: unref(current).sections?.length || 0 })), 1)
            ]),
            !unref(current).sections?.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: unref(t)("chaoxing.hub.noChapters")
            }, null, 8, ["message"])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_35, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(current).sections, (sec, sIdx) => {
                return openBlock(), createElementBlock("button", {
                  key: sec.id || sIdx,
                  type: "button",
                  class: "menu-item",
                  onClick: ($event) => unref(openSection)(unref(current).course, sec)
                }, [
                  createBaseVNode("div", _hoisted_37, [
                    createBaseVNode("span", _hoisted_38, toDisplayString(String(sIdx + 1).padStart(2, "0")), 1),
                    sIdx < (unref(current).sections?.length || 0) - 1 ? (openBlock(), createElementBlock("i", _hoisted_39)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", _hoisted_40, [
                    createBaseVNode("strong", null, toDisplayString(sec.title), 1),
                    createBaseVNode("div", _hoisted_41, [
                      createBaseVNode("span", _hoisted_42, toDisplayString(tFmt("chaoxing.hub.knowledgeCount", { n: sec.knowledges.length })), 1),
                      createBaseVNode("span", _hoisted_43, toDisplayString(unref(t)("chaoxing.hub.continueLearning")), 1)
                    ])
                  ]),
                  _cache[18] || (_cache[18] = createBaseVNode("span", { class: "material-symbols-outlined menu-item__chev" }, "chevron_right", -1))
                ], 8, _hoisted_36);
              }), 128))
            ])
          ], 64)) : unref(current).level === "section" ? (openBlock(), createElementBlock(Fragment, { key: 4 }, [
            createBaseVNode("section", _hoisted_44, [
              createBaseVNode("span", _hoisted_45, toDisplayString(unref(t)("chaoxing.hub.currentChapter")), 1),
              createBaseVNode("strong", _hoisted_46, toDisplayString(unref(current).section?.title), 1)
            ]),
            createBaseVNode("div", _hoisted_47, [
              createBaseVNode("span", _hoisted_48, toDisplayString(unref(t)("chaoxing.hub.sectionsTitle")), 1),
              createBaseVNode("span", _hoisted_49, toDisplayString(unref(current).section?.knowledges?.length || 0), 1)
            ]),
            !unref(current).section.knowledges?.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: unref(t)("chaoxing.hub.noSections")
            }, null, 8, ["message"])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_50, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(current).section.knowledges, (k, kIdx) => {
                return openBlock(), createElementBlock("button", {
                  key: k.id || kIdx,
                  type: "button",
                  class: normalizeClass(["menu-item", { done: k.completed }]),
                  onClick: ($event) => unref(openKnowledge)(unref(current).course, unref(current).section, k)
                }, [
                  createBaseVNode("div", {
                    class: normalizeClass(["menu-item__icon", k.completed ? "ok" : "todo"])
                  }, [
                    createBaseVNode("span", _hoisted_52, toDisplayString(k.completed ? "check_circle" : "play_lesson"), 1)
                  ], 2),
                  createBaseVNode("div", _hoisted_53, [
                    createBaseVNode("strong", null, toDisplayString(k.title), 1),
                    createBaseVNode("div", _hoisted_54, [
                      createBaseVNode("span", {
                        class: normalizeClass(["dot", k.completed ? "ok" : ""])
                      }, toDisplayString(k.completed ? unref(t)("chaoxing.hub.done") : unref(t)("chaoxing.hub.undone")), 3)
                    ])
                  ]),
                  _cache[19] || (_cache[19] = createBaseVNode("span", { class: "material-symbols-outlined menu-item__chev" }, "chevron_right", -1))
                ], 10, _hoisted_51);
              }), 128))
            ])
          ], 64)) : unref(current).level === "knowledge" ? (openBlock(), createElementBlock(Fragment, { key: 5 }, [
            createBaseVNode("section", _hoisted_55, [
              createBaseVNode("span", _hoisted_56, toDisplayString(unref(t)("chaoxing.hub.taskPoints")), 1),
              createBaseVNode("strong", _hoisted_57, toDisplayString(unref(current).knowledge?.title), 1),
              createBaseVNode("p", _hoisted_58, toDisplayString(unref(current).section?.title), 1)
            ]),
            createBaseVNode("div", _hoisted_59, [
              createBaseVNode("span", _hoisted_60, toDisplayString(unref(t)("chaoxing.hub.pageContent")), 1),
              createBaseVNode("span", _hoisted_61, toDisplayString(tFmt("chaoxing.hub.itemsUnit", { n: unref(current).tasks?.length || 0 })), 1)
            ]),
            !unref(current).tasks?.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: unref(t)("chaoxing.hub.noTasks")
            }, null, 8, ["message"])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_62, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(current).tasks, (t2) => {
                return openBlock(), createElementBlock("button", {
                  key: t2.id,
                  type: "button",
                  class: "menu-item task",
                  onClick: ($event) => unref(onTaskClick)(unref(current), t2)
                }, [
                  createBaseVNode("div", {
                    class: normalizeClass(["menu-item__icon", t2.kind === "video" ? "vid" : t2.kind === "document" ? "doc" : "todo"])
                  }, [
                    createBaseVNode("span", _hoisted_64, toDisplayString(t2.kind === "video" ? "play_circle" : t2.kind === "document" ? "description" : "task"), 1)
                  ], 2),
                  createBaseVNode("div", _hoisted_65, [
                    createBaseVNode("strong", null, toDisplayString(t2.title), 1),
                    createBaseVNode("div", _hoisted_66, [
                      createVNode(unref(TStatusBadge), {
                        type: t2.typeMeta.type,
                        text: t2.typeMeta.text
                      }, null, 8, ["type", "text"]),
                      createBaseVNode("span", _hoisted_67, toDisplayString(t2.status), 1)
                    ])
                  ]),
                  createBaseVNode("span", _hoisted_68, toDisplayString(t2.kind === "video" ? "play_arrow" : "chevron_right"), 1)
                ], 8, _hoisted_63);
              }), 128))
            ])
          ], 64)) : unref(current).level === "score" ? (openBlock(), createElementBlock("section", _hoisted_69, [
            createBaseVNode("div", _hoisted_70, [
              createBaseVNode("div", null, [
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.totalScore")), 1),
                unref(current).score?.user_name ? (openBlock(), createElementBlock("p", _hoisted_71, toDisplayString(unref(current).score.user_name), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("strong", null, toDisplayString(unref(current).score?.total_score ?? unref(current).score?.score?.score ?? "—"), 1)
            ]),
            unref(scoreSlices).length ? (openBlock(), createElementBlock("div", _hoisted_72, [
              createBaseVNode("div", {
                class: "pie",
                style: normalizeStyle({ background: unref(pieGradient) }),
                "aria-hidden": "true"
              }, [
                createBaseVNode("div", _hoisted_73, [
                  createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.weight")), 1)
                ])
              ], 4),
              createBaseVNode("ul", _hoisted_74, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(scoreSlices), (s, i) => {
                  return openBlock(), createElementBlock("li", { key: i }, [
                    createBaseVNode("i", {
                      style: normalizeStyle({ background: s.color })
                    }, null, 4),
                    createBaseVNode("span", null, toDisplayString(s.name), 1),
                    createBaseVNode("b", null, toDisplayString(s.value) + "%", 1)
                  ]);
                }), 128))
              ])
            ])) : createCommentVNode("", true),
            (unref(current).score?.weight_list || []).length ? (openBlock(), createElementBlock("ul", _hoisted_75, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(current).score.weight_list, (w, i) => {
                return openBlock(), createElementBlock("li", { key: i }, [
                  createBaseVNode("span", null, toDisplayString(w.name || w.key || unref(t)("chaoxing.hub.itemFallback")), 1),
                  createBaseVNode("b", null, toDisplayString(w.value ?? w.score ?? "—") + toDisplayString(typeof w.value === "number" ? "%" : ""), 1)
                ]);
              }), 128))
            ])) : unref(current).score?.weight ? (openBlock(), createElementBlock("div", _hoisted_76, [
              createBaseVNode("div", _hoisted_77, [
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.weightWork")), 1),
                createBaseVNode("b", null, toDisplayString(unref(current).score.weight.work ?? 0) + "%", 1)
              ]),
              createBaseVNode("div", _hoisted_78, [
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.weightTest")), 1),
                createBaseVNode("b", null, toDisplayString(unref(current).score.weight.test ?? 0) + "%", 1)
              ]),
              createBaseVNode("div", _hoisted_79, [
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.weightVideo")), 1),
                createBaseVNode("b", null, toDisplayString(unref(current).score.weight.video ?? 0) + "%", 1)
              ]),
              createBaseVNode("div", _hoisted_80, [
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.weightAttend")), 1),
                createBaseVNode("b", null, toDisplayString(unref(current).score.weight.attend ?? 0) + "%", 1)
              ])
            ])) : createCommentVNode("", true),
            unref(current).score?.job ? (openBlock(), createElementBlock("p", _hoisted_81, toDisplayString(tFmt("chaoxing.hub.jobFinishRate", { n: unref(current).score.job.jobFinishRate ?? "—" })), 1)) : createCommentVNode("", true),
            createBaseVNode("button", {
              type: "button",
              class: "chip-btn",
              onClick: _cache[6] || (_cache[6] = ($event) => unref(openScore)(unref(current).course))
            }, toDisplayString(unref(t)("chaoxing.hub.resync")), 1)
          ])) : unref(current).level === "video" ? (openBlock(), createElementBlock("section", _hoisted_82, [
            createBaseVNode("p", _hoisted_83, toDisplayString(unref(current).knowledge?.title), 1),
            createBaseVNode("h3", _hoisted_84, toDisplayString(unref(current).filename || unref(current).task?.title), 1),
            unref(current).duration ? (openBlock(), createElementBlock("p", _hoisted_85, toDisplayString(tFmt("chaoxing.hub.duration", { d: unref(formatDuration)(unref(current).duration) })), 1)) : createCommentVNode("", true),
            (openBlock(), createElementBlock("video", {
              key: unref(activeVideoSrc),
              class: "video-el",
              controls: "",
              playsinline: "",
              autoplay: "",
              preload: "metadata",
              poster: unref(current).poster || void 0,
              src: unref(activeVideoSrc),
              onError: _cache[7] || (_cache[7] = (...args) => unref(onVideoError) && unref(onVideoError)(...args))
            }, null, 40, _hoisted_86)),
            unref(videoError) ? (openBlock(), createElementBlock("p", _hoisted_87, toDisplayString(unref(videoError)), 1)) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_88, [
              createBaseVNode("button", {
                type: "button",
                class: "chip-btn ghost light",
                onClick: _cache[8] || (_cache[8] = (...args) => unref(retryVideo) && unref(retryVideo)(...args))
              }, [
                _cache[20] || (_cache[20] = createBaseVNode("span", { class: "material-symbols-outlined" }, "refresh", -1)),
                createTextVNode(" " + toDisplayString(unref(t)("chaoxing.hub.reload")), 1)
              ]),
              (unref(current).playUrls || []).length > 1 ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "chip-btn ghost light",
                onClick: _cache[9] || (_cache[9] = ($event) => {
                  videoSrcIndex.value = (unref(videoSrcIndex) + 1) % unref(current).playUrls.length;
                  videoError.value = "";
                })
              }, toDisplayString(tFmt("chaoxing.hub.switchLine", { a: unref(videoSrcIndex) + 1, b: unref(current).playUrls.length })), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("p", _hoisted_89, toDisplayString(unref(t)("chaoxing.hub.directLinkHint")), 1)
          ])) : unref(current).level === "document" ? (openBlock(), createElementBlock("section", _hoisted_90, [
            createBaseVNode("p", _hoisted_91, toDisplayString(unref(current).knowledge?.title), 1),
            createBaseVNode("h3", _hoisted_92, toDisplayString(unref(current).filename || unref(current).task?.title), 1),
            createBaseVNode("p", _hoisted_93, toDisplayString(tFmt("chaoxing.hub.typeLabel", { t: unref(current).fileType || unref(t)("chaoxing.hub.docFallback") })), 1),
            unref(current).src ? (openBlock(), createElementBlock("iframe", {
              key: unref(current).src,
              class: "video-el doc-frame",
              src: unref(current).src,
              title: unref(t)("chaoxing.hub.docFallback"),
              referrerpolicy: "no-referrer-when-downgrade"
            }, null, 8, _hoisted_94)) : (openBlock(), createElementBlock("p", _hoisted_95, toDisplayString(unref(t)("chaoxing.hub.noPreviewUrl")), 1)),
            createBaseVNode("div", _hoisted_96, [
              (unref(current).candidates || []).length > 1 ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "chip-btn ghost light",
                onClick: _cache[10] || (_cache[10] = ($event) => (() => {
                  const list2 = unref(current).candidates || [];
                  const i = Math.max(0, list2.indexOf(unref(current).src));
                  unref(current).src = list2[(i + 1) % list2.length];
                })())
              }, toDisplayString(unref(t)("chaoxing.hub.switchPreviewSource")), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("p", _hoisted_97, toDisplayString(unref(t)("chaoxing.hub.docPreviewHint")), 1)
          ])) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const ChaoxingHubView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-bf3410f2"]]);
export {
  ChaoxingHubView as default
};
