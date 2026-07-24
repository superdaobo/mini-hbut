import { w as watch, o as onMounted, c as createElementBlock, b as openBlock, q as createVNode, d as createBaseVNode, l as withCtx, f as createCommentVNode, e as computed, a as ref, t as toDisplayString, u as unref, F as Fragment, i as renderList, n as normalizeClass, k as createBlock, C as withDirectives, D as vModelText, h as normalizeStyle, g as createTextVNode, z as nextTick } from "./vue-core-DdLVj9yW.js";
import { p as pushDebugLog, b as isTauriRuntime, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _export_sfc, s as showToast } from "./app-demo-CxKBY5JQ.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import { T as TStatusBadge } from "./TStatusBadge-8FuTyS87.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "cx-hub" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = { class: "cx-hub__body" };
const _hoisted_4 = {
  key: 0,
  class: "crumbs",
  "aria-label": "路径"
};
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
  key: 0,
  class: "sem-scroll",
  role: "tablist"
};
const _hoisted_15 = ["aria-selected", "onClick"];
const _hoisted_16 = { class: "search-wrap" };
const _hoisted_17 = ["onClick"];
const _hoisted_18 = { class: "cover" };
const _hoisted_19 = ["src"];
const _hoisted_20 = { class: "row-main" };
const _hoisted_21 = {
  key: 0,
  class: "sem-tag"
};
const _hoisted_22 = { class: "mini-bar" };
const _hoisted_23 = { class: "panel course-head" };
const _hoisted_24 = { class: "course-head__top" };
const _hoisted_25 = { class: "course-head__meta" };
const _hoisted_26 = { class: "btn-row" };
const _hoisted_27 = {
  key: 0,
  class: "hint"
};
const _hoisted_28 = { class: "section-head" };
const _hoisted_29 = { class: "section-head__count" };
const _hoisted_30 = { class: "menu-list" };
const _hoisted_31 = ["onClick"];
const _hoisted_32 = { class: "menu-item__rail" };
const _hoisted_33 = { class: "menu-item__num" };
const _hoisted_34 = {
  key: 0,
  class: "menu-item__line"
};
const _hoisted_35 = { class: "menu-item__body" };
const _hoisted_36 = { class: "menu-item__meta" };
const _hoisted_37 = { class: "dot" };
const _hoisted_38 = { class: "panel soft-panel" };
const _hoisted_39 = { class: "soft-panel__title" };
const _hoisted_40 = { class: "section-head" };
const _hoisted_41 = { class: "section-head__count" };
const _hoisted_42 = { class: "menu-list" };
const _hoisted_43 = ["onClick"];
const _hoisted_44 = { class: "material-symbols-outlined" };
const _hoisted_45 = { class: "menu-item__body" };
const _hoisted_46 = { class: "menu-item__meta" };
const _hoisted_47 = { class: "panel soft-panel" };
const _hoisted_48 = { class: "soft-panel__title" };
const _hoisted_49 = { class: "hint" };
const _hoisted_50 = { class: "section-head" };
const _hoisted_51 = { class: "section-head__count" };
const _hoisted_52 = { class: "menu-list" };
const _hoisted_53 = ["onClick"];
const _hoisted_54 = { class: "material-symbols-outlined" };
const _hoisted_55 = { class: "menu-item__body" };
const _hoisted_56 = { class: "menu-item__meta" };
const _hoisted_57 = { class: "dot" };
const _hoisted_58 = { class: "material-symbols-outlined menu-item__chev accent" };
const _hoisted_59 = {
  key: 6,
  class: "panel score-panel"
};
const _hoisted_60 = { class: "score-total" };
const _hoisted_61 = {
  key: 0,
  class: "hint"
};
const _hoisted_62 = {
  key: 0,
  class: "pie-wrap"
};
const _hoisted_63 = { class: "pie-legend" };
const _hoisted_64 = {
  key: 1,
  class: "score-list"
};
const _hoisted_65 = {
  key: 2,
  class: "weight-grid"
};
const _hoisted_66 = { class: "wchip" };
const _hoisted_67 = { class: "wchip" };
const _hoisted_68 = { class: "wchip" };
const _hoisted_69 = { class: "wchip" };
const _hoisted_70 = {
  key: 3,
  class: "hint"
};
const _hoisted_71 = {
  key: 7,
  class: "panel video-panel"
};
const _hoisted_72 = { class: "crumb" };
const _hoisted_73 = { class: "video-title" };
const _hoisted_74 = {
  key: 0,
  class: "hint"
};
const _hoisted_75 = ["src"];
const _hoisted_76 = ["poster", "src"];
const _hoisted_77 = {
  key: 3,
  class: "video-err"
};
const _hoisted_78 = { class: "btn-row video-actions" };
const _hoisted_79 = { class: "hint" };
const _hoisted_80 = {
  key: 8,
  class: "panel video-panel"
};
const _hoisted_81 = { class: "crumb" };
const _hoisted_82 = { class: "video-title" };
const _hoisted_83 = { class: "hint" };
const _hoisted_84 = ["src"];
const _hoisted_85 = {
  key: 1,
  class: "video-err"
};
const _hoisted_86 = { class: "btn-row video-actions" };
const _sfc_main = {
  __name: "ChaoxingHubView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const loading = ref(true);
    const refreshing = ref(false);
    const pageLoading = ref(false);
    const error = ref("");
    const courses = ref([]);
    const semesterTabs = ref(["全部"]);
    const activeSemester = ref("全部");
    const searchQuery = ref("");
    const statusMeta = ref({});
    const videoError = ref("");
    const videoSrcIndex = ref(0);
    const PIE_COLORS = ["#2563eb", "#7c3aed", "#06b6d4", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899"];
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
    const safeText = (v) => String(v ?? "").trim();
    const safeNumber = (v, fb = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fb;
    };
    const preferHttps = (url) => {
      const u = safeText(url);
      if (u.startsWith("http://")) return `https://${u.slice(7)}`;
      return u;
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
        imageUrl: safeText(raw.image_url || raw.imageUrl || raw.cover || ""),
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
    const scoreSlices = computed(() => {
      const score = current.value?.score;
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
        const labels = {
          work: "作业",
          test: "考试",
          video: "视频",
          attend: "签到",
          bbs: "讨论",
          live: "直播",
          read: "阅读",
          task: "任务点"
        };
        for (const [k, v] of Object.entries(score.weight)) {
          const value = safeNumber(v);
          if (value > 0) raw.push({ name: labels[k] || k, value });
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
          // conic-gradient 用
          start,
          end: acc
        };
      });
    });
    const pieGradient = computed(() => {
      const slices = scoreSlices.value;
      if (!slices.length) return "conic-gradient(#e2e8f0 0 100%)";
      const parts = slices.map((s) => `${s.color} ${s.start}% ${s.end}%`);
      return `conic-gradient(${parts.join(", ")})`;
    });
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
    const activeVideoSrc = computed(() => {
      const urls = current.value?.playUrls || [];
      if (!urls.length) return current.value?.src || "";
      return urls[Math.min(videoSrcIndex.value, urls.length - 1)] || "";
    });
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
    const loadList = async ({ silent = false, force = false } = {}) => {
      if (!silent) loading.value = true;
      else refreshing.value = true;
      error.value = "";
      const t0 = Date.now();
      const doForce = force || false;
      pushDebugLog("ChaoxingHub", `加载课程列表 silent=${silent} force=${doForce}`, "info");
      try {
        const coursePromise = cxInvoke("chaoxing_fetch_courses", { force: doForce });
        const statusPromise = cxInvoke("chaoxing_get_session_status", {}).catch((e) => ({
          success: false,
          error: String(e?.message || e)
        }));
        const [courseRes, statusRes] = await Promise.all([coursePromise, statusPromise]);
        if (courseRes?.success === false) throw new Error(courseRes?.error || "课程列表失败");
        statusMeta.value = statusRes || {};
        const list = Array.isArray(courseRes?.courses) ? courseRes.courses : [];
        courses.value = list.map(normalizeCourse).filter((c) => c.courseId && c.clazzId);
        pushDebugLog(
          "ChaoxingHub",
          `课程列表完成 count=${courses.value.length} from_cache=${!!courseRes?.from_cache} (${Date.now() - t0}ms)`,
          "info",
          { sync_time: courseRes?.sync_time, platform_status: courseRes?.platform_status }
        );
        const fromApi = Array.isArray(courseRes?.semesters) ? courseRes.semesters.map((s) => safeText(s)).filter(Boolean) : [];
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
        error.value = safeText(e?.message || e) || "加载失败";
      } finally {
        loading.value = false;
        refreshing.value = false;
      }
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
    const pop = () => {
      if (stack.value.length <= 1) {
        emit("back");
        return;
      }
      stack.value = stack.value.slice(0, -1);
      videoError.value = "";
      videoSrcIndex.value = 0;
      scrollModuleToTop();
    };
    const jumpTo = (index) => {
      if (index < 0 || index >= stack.value.length) return;
      stack.value = stack.value.slice(0, index + 1);
      videoError.value = "";
      videoSrcIndex.value = 0;
      scrollModuleToTop();
    };
    const openCourse = async (course, { force = false } = {}) => {
      pageLoading.value = true;
      try {
        const outlineRes = await cxInvoke("chaoxing_fetch_course_outline", {
          course_id: course.courseId,
          clazz_id: course.clazzId,
          cpi: course.cpi || "",
          course_url: course.courseUrl || "",
          force: !!force
        });
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
        if (current.value.level === "course") {
          const base = stack.value.slice(0, -1);
          stack.value = [...base, frame];
        } else {
          push(frame);
        }
        void cxInvoke("chaoxing_fetch_course_progress", {
          course_id: course.courseId,
          clazz_id: course.clazzId,
          cpi: course.cpi || "",
          course_url: course.courseUrl || "",
          force: false
        }).then((progressRes) => {
          const top = stack.value[stack.value.length - 1];
          if (top?.level === "course" && top.course?.courseId === course.courseId) {
            top.progress = progressRes || {};
            stack.value = [...stack.value.slice(0, -1), { ...top }];
          }
        }).catch(() => {
        });
      } catch (e) {
        showToast(safeText(e?.message || e) || "打开课程失败");
      } finally {
        pageLoading.value = false;
      }
    };
    const openSection = (course, section) => {
      push({ level: "section", course, section });
    };
    const openKnowledge = async (course, section, knowledge) => {
      pageLoading.value = true;
      try {
        const courseId = knowledge.courseId || course.courseId;
        const clazzId = knowledge.clazzId || course.clazzId;
        const cpi = knowledge.cpi || course.cpi || "";
        const kid = knowledge.knowledgeId || knowledge.id;
        const res = await cxInvoke("chaoxing_get_knowledge_cards", {
          course_id: courseId,
          clazz_id: clazzId,
          knowledge_id: kid,
          cpi
        });
        if (res?.success === false) throw new Error(res?.error || "任务点加载失败");
        const list = Array.isArray(res?.tasks) ? res.tasks : Array.isArray(res?.attachments) ? res.attachments : Array.isArray(res?.videos) ? res.videos : [];
        const mapped = list.map(normalizeTaskItem);
        const real = mapped.filter((t) => !t.empty_hint && (t.objectId || t.kind !== "task"));
        push({
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
        showToast(safeText(e?.message || e) || "打开小节失败");
      } finally {
        pageLoading.value = false;
      }
    };
    const openScore = async (course) => {
      pageLoading.value = true;
      try {
        const res = await cxInvoke("chaoxing_fetch_course_score", {
          course_id: course.courseId,
          clazz_id: course.clazzId,
          cpi: course.cpi || ""
        });
        if (res?.success === false) throw new Error(res?.error || res?.message || "成绩加载失败");
        if (current.value.level === "score") {
          const base = stack.value.slice(0, -1);
          stack.value = [...base, { level: "score", course, score: res }];
        } else {
          push({ level: "score", course, score: res });
        }
      } catch (e) {
        const msg = safeText(e?.message || e) || "成绩加载失败";
        if (msg.includes("Unknown POST endpoint")) {
          showToast("成绩接口未就绪，请完全退出应用后重新打开");
        } else if (msg.includes("duplicate field")) {
          showToast("参数冲突已修复，请完全重启应用后再试");
        } else {
          showToast(msg);
        }
      } finally {
        pageLoading.value = false;
      }
    };
    const collectPlayUrls = (st = {}, top = {}) => {
      const list = [];
      const push2 = (u) => {
        const https = preferHttps(u);
        if (!https || !https.startsWith("http")) return;
        if (!list.includes(https)) list.push(https);
      };
      if (Array.isArray(top.play_urls)) top.play_urls.forEach(push2);
      if (Array.isArray(st.play_urls)) st.play_urls.forEach(push2);
      ["https", "hd", "http", "play_url", "download", "mp3", "url", "sd"].forEach((k) => {
        push2(st[k]);
        push2(top[k]);
      });
      return list;
    };
    const collectDocUrls = (st = {}, top = {}) => {
      const list = [];
      const push2 = (u) => {
        const https = preferHttps(u);
        if (!https || !https.startsWith("http")) return;
        if (!list.includes(https)) list.push(https);
      };
      if (Array.isArray(top.play_urls)) top.play_urls.forEach(push2);
      if (Array.isArray(st.play_urls)) st.play_urls.forEach(push2);
      ["https", "http", "download", "pdf", "url", "preview", "previewUrl", "hd", "sd"].forEach((k) => {
        push2(st[k]);
        push2(top[k]);
      });
      return list;
    };
    const openVideo = async (course, section, knowledge, task, meta) => {
      if (!task.objectId) {
        showToast("该任务没有可播放资源");
        return;
      }
      pageLoading.value = true;
      videoError.value = "";
      videoSrcIndex.value = 0;
      try {
        const res = await cxInvoke("chaoxing_get_video_status", {
          object_id: task.objectId,
          fid: meta?.fid || "0"
        });
        if (res?.success === false) throw new Error(res?.error || "视频状态失败");
        const st = res?.data && typeof res.data === "object" ? res.data : res;
        const playUrls = collectPlayUrls(st, res || {});
        const playerUrl = preferHttps(
          safeText(res?.player_url || st.player_url || "") || `https://mooc1.chaoxing.com/ananas/modules/video/index.html?objectid=${encodeURIComponent(task.objectId)}&fid=${encodeURIComponent(meta?.fid || "0")}&isPhone=true`
        );
        if (!playUrls.length && !playerUrl) {
          throw new Error(
            st.status && st.status !== "success" ? `视频不可用（${st.status}）` : "未返回播放地址，请确认学习通会话有效"
          );
        }
        push({
          level: "video",
          course,
          section,
          knowledge,
          task,
          src: playUrls[0] || "",
          playUrls,
          playerUrl,
          usePlayer: !playUrls.length,
          poster: preferHttps(safeText(st.screenshot || st.thumb || "")),
          filename: safeText(st.filename || task.title),
          duration: safeNumber(st.duration)
        });
      } catch (e) {
        showToast(safeText(e?.message || e) || "视频打开失败");
      } finally {
        pageLoading.value = false;
      }
    };
    const openDocument = async (course, section, knowledge, task, meta) => {
      if (!task.objectId) {
        showToast(`文档「${task.title}」无可预览资源（缺少 objectId）`);
        return;
      }
      pageLoading.value = true;
      try {
        const res = await cxInvoke("chaoxing_get_video_status", {
          object_id: task.objectId,
          fid: meta?.fid || "0"
        });
        if (res?.success === false) throw new Error(res?.error || "文档状态失败");
        const st = res?.data && typeof res.data === "object" ? res.data : res;
        const docUrls = collectDocUrls(st, res || {});
        const filename = safeText(st.filename || task.title);
        const officialPreview = preferHttps(
          `https://mooc1.chaoxing.com/ananas/modules/pdf/index.html?objectid=${encodeURIComponent(task.objectId)}&fid=${encodeURIComponent(meta?.fid || "0")}`
        );
        const previewUrl = docUrls[0] || officialPreview;
        if (!previewUrl) {
          showToast(`文档「${filename || task.title}」暂无预览地址，请在学习通网页端打开`);
          return;
        }
        push({
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
        const msg = safeText(e?.message || e) || "文档打开失败";
        showToast(`文档预览失败：${msg}`);
      } finally {
        pageLoading.value = false;
      }
    };
    const mediaErrorMessage = (ev) => {
      try {
        const el = ev?.target || ev?.currentTarget;
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
    const onVideoError = (ev) => {
      const frame = current.value;
      const urls = frame?.playUrls || [];
      if (videoSrcIndex.value + 1 < urls.length) {
        videoSrcIndex.value += 1;
        videoError.value = `线路 ${videoSrcIndex.value + 1}/${urls.length} 失败，切换备用地址…`;
        return;
      }
      if (frame?.playerUrl && !frame.usePlayer) {
        frame.usePlayer = true;
        videoError.value = "直链播放失败，已切换学习通官方播放器…";
        return;
      }
      const detail = mediaErrorMessage(ev);
      videoError.value = detail ? `视频播放失败：${detail}。请重试、切换线路或重新登录学习通` : "视频播放失败：无法解析播放地址或被 CDN 拒绝。请重试，或重新登录学习通后再打开";
    };
    const retryVideo = () => {
      const frame = current.value;
      if (frame?.level !== "video" || !frame.task) return;
      const task = frame.task;
      const course = frame.course;
      const section = frame.section;
      const knowledge = frame.knowledge;
      const knowFrame = [...stack.value].reverse().find((f) => f.level === "knowledge");
      const meta = knowFrame?.meta || { fid: "0" };
      if (stack.value.length > 1 && current.value.level === "video") {
        stack.value = stack.value.slice(0, -1);
      }
      videoError.value = "";
      videoSrcIndex.value = 0;
      void openVideo(course, section, knowledge, task, meta);
    };
    const onTaskClick = (frame, task) => {
      if (task.empty_hint || task.status === "无可播放任务") {
        showToast("该小节暂无任务点");
        return;
      }
      if (task.kind === "video") {
        void openVideo(frame.course, frame.section, frame.knowledge, task, frame.meta);
        return;
      }
      if (task.kind === "document") {
        void openDocument(frame.course, frame.section, frame.knowledge, task, frame.meta);
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
    const onCoverError = (e) => {
      if (e?.target) {
        e.target.style.display = "none";
        const fallback = e.target.nextElementSibling;
        if (fallback) fallback.style.display = "flex";
      }
    };
    const handleHeaderBack = () => pop();
    const formatDuration = (sec) => {
      const s = Math.max(0, Math.floor(Number(sec) || 0));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${m}:${String(r).padStart(2, "0")}`;
    };
    watch(
      () => props.studentId,
      () => {
        stack.value = [{ level: "list" }];
        void loadList();
      }
    );
    onMounted(() => {
      scrollModuleToTop();
      void loadList();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: pageTitle.value,
          icon: "school",
          onBack: handleHeaderBack
        }, {
          actions: withCtx(() => [
            current.value.level === "list" ? (openBlock(), createElementBlock("button", {
              key: 0,
              class: "ghost-btn",
              type: "button",
              disabled: refreshing.value || loading.value,
              onClick: _cache[0] || (_cache[0] = ($event) => loadList({ silent: true, force: true }))
            }, toDisplayString(refreshing.value ? "…" : "刷新"), 9, _hoisted_2)) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["title"]),
        createBaseVNode("div", _hoisted_3, [
          stack.value.length > 1 ? (openBlock(), createElementBlock("nav", _hoisted_4, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(breadcrumbs.value, (bc, i) => {
              return openBlock(), createElementBlock(Fragment, {
                key: bc.key + i
              }, [
                createBaseVNode("button", {
                  type: "button",
                  class: normalizeClass(["crumb-btn", { current: i === breadcrumbs.value.length - 1 }]),
                  disabled: i === breadcrumbs.value.length - 1,
                  onClick: ($event) => jumpTo(i)
                }, toDisplayString(bc.label), 11, _hoisted_5),
                i < breadcrumbs.value.length - 1 ? (openBlock(), createElementBlock("span", _hoisted_6, "/")) : createCommentVNode("", true)
              ], 64);
            }), 128))
          ])) : createCommentVNode("", true),
          pageLoading.value ? (openBlock(), createElementBlock("div", _hoisted_7, [..._cache[8] || (_cache[8] = [
            createBaseVNode("span", { class: "material-symbols-outlined spin" }, "progress_activity", -1),
            createBaseVNode("span", null, "加载中…", -1)
          ])])) : createCommentVNode("", true),
          current.value.level === "list" ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            createBaseVNode("section", _hoisted_8, [
              createBaseVNode("div", _hoisted_9, [
                createBaseVNode("div", null, [
                  _cache[9] || (_cache[9] = createBaseVNode("strong", null, "我的课程", -1)),
                  createBaseVNode("p", null, toDisplayString(courses.value.length) + " 门 · " + toDisplayString(semesterTabs.value.length > 2 ? semesterTabs.value.length - 1 + " 个学期" : semesterTabs.value.length === 2 ? semesterTabs.value[1] : "学期待同步"), 1)
                ]),
                createVNode(unref(TStatusBadge), {
                  type: badgeType.value,
                  text: badgeText.value
                }, null, 8, ["type", "text"])
              ]),
              createBaseVNode("div", _hoisted_10, [
                createBaseVNode("div", _hoisted_11, [
                  _cache[10] || (_cache[10] = createBaseVNode("span", null, "课程", -1)),
                  createBaseVNode("b", null, toDisplayString(filteredCourses.value.length), 1)
                ]),
                createBaseVNode("div", _hoisted_12, [
                  _cache[11] || (_cache[11] = createBaseVNode("span", null, "待办", -1)),
                  createBaseVNode("b", null, toDisplayString(totalPending.value), 1)
                ])
              ]),
              error.value ? (openBlock(), createElementBlock("p", _hoisted_13, toDisplayString(error.value), 1)) : createCommentVNode("", true)
            ]),
            semesterTabs.value.length > 1 ? (openBlock(), createElementBlock("div", _hoisted_14, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(semesterTabs.value, (sem) => {
                return openBlock(), createElementBlock("button", {
                  key: sem,
                  type: "button",
                  class: normalizeClass(["sem-chip", { active: activeSemester.value === sem }]),
                  role: "tab",
                  "aria-selected": activeSemester.value === sem,
                  onClick: ($event) => activeSemester.value = sem
                }, toDisplayString(sem), 11, _hoisted_15);
              }), 128))
            ])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_16, [
              _cache[12] || (_cache[12] = createBaseVNode("span", { class: "material-symbols-outlined" }, "search", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => searchQuery.value = $event),
                type: "search",
                placeholder: "搜索课程 / 教师"
              }, null, 512), [
                [vModelText, searchQuery.value]
              ])
            ]),
            loading.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 1,
              type: "loading",
              message: "正在读取课程…"
            })) : !filteredCourses.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 2,
              type: "empty",
              message: error.value || "暂无课程"
            }, null, 8, ["message"])) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(filteredCourses.value, (c) => {
              return openBlock(), createElementBlock("button", {
                key: c.id,
                type: "button",
                class: "row-card course",
                onClick: ($event) => openCourse(c)
              }, [
                createBaseVNode("div", _hoisted_18, [
                  c.imageUrl ? (openBlock(), createElementBlock("img", {
                    key: 0,
                    src: c.imageUrl,
                    alt: "",
                    loading: "lazy",
                    referrerpolicy: "no-referrer",
                    onError: onCoverError
                  }, null, 40, _hoisted_19)) : createCommentVNode("", true),
                  createBaseVNode("div", {
                    class: "cover-fb",
                    style: normalizeStyle(c.imageUrl ? { display: "none" } : void 0)
                  }, [..._cache[13] || (_cache[13] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "menu_book", -1)
                  ])], 4)
                ]),
                createBaseVNode("div", _hoisted_20, [
                  createBaseVNode("strong", null, toDisplayString(c.title), 1),
                  createBaseVNode("p", null, [
                    c.semester ? (openBlock(), createElementBlock("span", _hoisted_21, toDisplayString(c.semester), 1)) : createCommentVNode("", true),
                    createTextVNode(" " + toDisplayString(c.teacher || "教师暂缺"), 1)
                  ]),
                  createBaseVNode("div", _hoisted_22, [
                    createBaseVNode("i", {
                      style: normalizeStyle({ width: Math.min(100, c.progressRate || 0) + "%" })
                    }, null, 4)
                  ])
                ]),
                _cache[14] || (_cache[14] = createBaseVNode("span", { class: "material-symbols-outlined chev" }, "chevron_right", -1))
              ], 8, _hoisted_17);
            }), 128))
          ], 64)) : current.value.level === "course" ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("section", _hoisted_23, [
              createBaseVNode("div", _hoisted_24, [
                createBaseVNode("div", _hoisted_25, [
                  _cache[15] || (_cache[15] = createBaseVNode("span", { class: "pill" }, "章节目录", -1)),
                  createBaseVNode("strong", null, toDisplayString(current.value.course.title), 1),
                  createBaseVNode("p", null, toDisplayString(current.value.course.teacher || "教师暂缺"), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_26, [
                createBaseVNode("button", {
                  type: "button",
                  class: "chip-btn",
                  onClick: _cache[2] || (_cache[2] = ($event) => openScore(current.value.course))
                }, [..._cache[16] || (_cache[16] = [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "grade", -1),
                  createTextVNode(" 成绩组成 ", -1)
                ])]),
                createBaseVNode("button", {
                  type: "button",
                  class: "chip-btn ghost",
                  onClick: _cache[3] || (_cache[3] = ($event) => openCourse(current.value.course, { force: true }))
                }, [..._cache[17] || (_cache[17] = [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "refresh", -1),
                  createTextVNode(" 刷新 ", -1)
                ])])
              ]),
              current.value.progress?.progress_text ? (openBlock(), createElementBlock("p", _hoisted_27, toDisplayString(current.value.progress.progress_text), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_28, [
              _cache[18] || (_cache[18] = createBaseVNode("span", { class: "section-head__title" }, "全部章节", -1)),
              createBaseVNode("span", _hoisted_29, toDisplayString(current.value.sections?.length || 0) + " 章", 1)
            ]),
            !current.value.sections?.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: "暂无章节，请点刷新或检查学习通会话"
            })) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_30, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(current.value.sections, (sec, sIdx) => {
                return openBlock(), createElementBlock("button", {
                  key: sec.id || sIdx,
                  type: "button",
                  class: "menu-item",
                  onClick: ($event) => openSection(current.value.course, sec)
                }, [
                  createBaseVNode("div", _hoisted_32, [
                    createBaseVNode("span", _hoisted_33, toDisplayString(String(sIdx + 1).padStart(2, "0")), 1),
                    sIdx < (current.value.sections?.length || 0) - 1 ? (openBlock(), createElementBlock("i", _hoisted_34)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", _hoisted_35, [
                    createBaseVNode("strong", null, toDisplayString(sec.title), 1),
                    createBaseVNode("div", _hoisted_36, [
                      createBaseVNode("span", _hoisted_37, toDisplayString(sec.knowledges.length) + " 个小节", 1),
                      _cache[19] || (_cache[19] = createBaseVNode("span", { class: "dot soft" }, "继续学习", -1))
                    ])
                  ]),
                  _cache[20] || (_cache[20] = createBaseVNode("span", { class: "material-symbols-outlined menu-item__chev" }, "chevron_right", -1))
                ], 8, _hoisted_31);
              }), 128))
            ])
          ], 64)) : current.value.level === "section" ? (openBlock(), createElementBlock(Fragment, { key: 4 }, [
            createBaseVNode("section", _hoisted_38, [
              _cache[21] || (_cache[21] = createBaseVNode("span", { class: "pill slate" }, "当前章节", -1)),
              createBaseVNode("strong", _hoisted_39, toDisplayString(current.value.section?.title), 1)
            ]),
            createBaseVNode("div", _hoisted_40, [
              _cache[22] || (_cache[22] = createBaseVNode("span", { class: "section-head__title" }, "小节列表", -1)),
              createBaseVNode("span", _hoisted_41, toDisplayString(current.value.section?.knowledges?.length || 0), 1)
            ]),
            !current.value.section.knowledges?.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: "该章暂无小节"
            })) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_42, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(current.value.section.knowledges, (k, kIdx) => {
                return openBlock(), createElementBlock("button", {
                  key: k.id || kIdx,
                  type: "button",
                  class: normalizeClass(["menu-item", { done: k.completed }]),
                  onClick: ($event) => openKnowledge(current.value.course, current.value.section, k)
                }, [
                  createBaseVNode("div", {
                    class: normalizeClass(["menu-item__icon", k.completed ? "ok" : "todo"])
                  }, [
                    createBaseVNode("span", _hoisted_44, toDisplayString(k.completed ? "check_circle" : "play_lesson"), 1)
                  ], 2),
                  createBaseVNode("div", _hoisted_45, [
                    createBaseVNode("strong", null, toDisplayString(k.title), 1),
                    createBaseVNode("div", _hoisted_46, [
                      createBaseVNode("span", {
                        class: normalizeClass(["dot", k.completed ? "ok" : ""])
                      }, toDisplayString(k.completed ? "已完成" : "未完成"), 3)
                    ])
                  ]),
                  _cache[23] || (_cache[23] = createBaseVNode("span", { class: "material-symbols-outlined menu-item__chev" }, "chevron_right", -1))
                ], 10, _hoisted_43);
              }), 128))
            ])
          ], 64)) : current.value.level === "knowledge" ? (openBlock(), createElementBlock(Fragment, { key: 5 }, [
            createBaseVNode("section", _hoisted_47, [
              _cache[24] || (_cache[24] = createBaseVNode("span", { class: "pill violet" }, "任务点", -1)),
              createBaseVNode("strong", _hoisted_48, toDisplayString(current.value.knowledge?.title), 1),
              createBaseVNode("p", _hoisted_49, toDisplayString(current.value.section?.title), 1)
            ]),
            createBaseVNode("div", _hoisted_50, [
              _cache[25] || (_cache[25] = createBaseVNode("span", { class: "section-head__title" }, "本页内容", -1)),
              createBaseVNode("span", _hoisted_51, toDisplayString(current.value.tasks?.length || 0) + " 项", 1)
            ]),
            !current.value.tasks?.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: "暂无任务"
            })) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_52, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(current.value.tasks, (t) => {
                return openBlock(), createElementBlock("button", {
                  key: t.id,
                  type: "button",
                  class: "menu-item task",
                  onClick: ($event) => onTaskClick(current.value, t)
                }, [
                  createBaseVNode("div", {
                    class: normalizeClass(["menu-item__icon", t.kind === "video" ? "vid" : t.kind === "document" ? "doc" : "todo"])
                  }, [
                    createBaseVNode("span", _hoisted_54, toDisplayString(t.kind === "video" ? "play_circle" : t.kind === "document" ? "description" : "task"), 1)
                  ], 2),
                  createBaseVNode("div", _hoisted_55, [
                    createBaseVNode("strong", null, toDisplayString(t.title), 1),
                    createBaseVNode("div", _hoisted_56, [
                      createVNode(unref(TStatusBadge), {
                        type: t.typeMeta.type,
                        text: t.typeMeta.text
                      }, null, 8, ["type", "text"]),
                      createBaseVNode("span", _hoisted_57, toDisplayString(t.status), 1)
                    ])
                  ]),
                  createBaseVNode("span", _hoisted_58, toDisplayString(t.kind === "video" ? "play_arrow" : "chevron_right"), 1)
                ], 8, _hoisted_53);
              }), 128))
            ])
          ], 64)) : current.value.level === "score" ? (openBlock(), createElementBlock("section", _hoisted_59, [
            createBaseVNode("div", _hoisted_60, [
              createBaseVNode("div", null, [
                _cache[26] || (_cache[26] = createBaseVNode("span", null, "综合成绩", -1)),
                current.value.score?.user_name ? (openBlock(), createElementBlock("p", _hoisted_61, toDisplayString(current.value.score.user_name), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("strong", null, toDisplayString(current.value.score?.total_score ?? current.value.score?.score?.score ?? "—"), 1)
            ]),
            scoreSlices.value.length ? (openBlock(), createElementBlock("div", _hoisted_62, [
              createBaseVNode("div", {
                class: "pie",
                style: normalizeStyle({ background: pieGradient.value }),
                "aria-hidden": "true"
              }, [..._cache[27] || (_cache[27] = [
                createBaseVNode("div", { class: "pie-hole" }, [
                  createBaseVNode("span", null, "权重")
                ], -1)
              ])], 4),
              createBaseVNode("ul", _hoisted_63, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(scoreSlices.value, (s, i) => {
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
            (current.value.score?.weight_list || []).length ? (openBlock(), createElementBlock("ul", _hoisted_64, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(current.value.score.weight_list, (w, i) => {
                return openBlock(), createElementBlock("li", { key: i }, [
                  createBaseVNode("span", null, toDisplayString(w.name || w.key || "项目"), 1),
                  createBaseVNode("b", null, toDisplayString(w.value ?? w.score ?? "—") + toDisplayString(typeof w.value === "number" ? "%" : ""), 1)
                ]);
              }), 128))
            ])) : current.value.score?.weight ? (openBlock(), createElementBlock("div", _hoisted_65, [
              createBaseVNode("div", _hoisted_66, [
                _cache[28] || (_cache[28] = createBaseVNode("span", null, "作业", -1)),
                createBaseVNode("b", null, toDisplayString(current.value.score.weight.work ?? 0) + "%", 1)
              ]),
              createBaseVNode("div", _hoisted_67, [
                _cache[29] || (_cache[29] = createBaseVNode("span", null, "考试", -1)),
                createBaseVNode("b", null, toDisplayString(current.value.score.weight.test ?? 0) + "%", 1)
              ]),
              createBaseVNode("div", _hoisted_68, [
                _cache[30] || (_cache[30] = createBaseVNode("span", null, "视频", -1)),
                createBaseVNode("b", null, toDisplayString(current.value.score.weight.video ?? 0) + "%", 1)
              ]),
              createBaseVNode("div", _hoisted_69, [
                _cache[31] || (_cache[31] = createBaseVNode("span", null, "签到", -1)),
                createBaseVNode("b", null, toDisplayString(current.value.score.weight.attend ?? 0) + "%", 1)
              ])
            ])) : createCommentVNode("", true),
            current.value.score?.job ? (openBlock(), createElementBlock("p", _hoisted_70, " 任务点完成率 " + toDisplayString(current.value.score.job.jobFinishRate ?? "—") + "% ", 1)) : createCommentVNode("", true),
            createBaseVNode("button", {
              type: "button",
              class: "chip-btn",
              onClick: _cache[4] || (_cache[4] = ($event) => openScore(current.value.course))
            }, " 重新同步 ")
          ])) : current.value.level === "video" ? (openBlock(), createElementBlock("section", _hoisted_71, [
            createBaseVNode("p", _hoisted_72, toDisplayString(current.value.knowledge?.title), 1),
            createBaseVNode("h3", _hoisted_73, toDisplayString(current.value.filename || current.value.task?.title), 1),
            current.value.duration ? (openBlock(), createElementBlock("p", _hoisted_74, "时长 " + toDisplayString(formatDuration(current.value.duration)), 1)) : createCommentVNode("", true),
            current.value.usePlayer && current.value.playerUrl ? (openBlock(), createElementBlock("iframe", {
              key: "player-" + current.value.playerUrl,
              class: "video-el doc-frame",
              src: current.value.playerUrl,
              title: "学习通视频播放器",
              allow: "autoplay; fullscreen",
              referrerpolicy: "no-referrer-when-downgrade"
            }, null, 8, _hoisted_75)) : (openBlock(), createElementBlock("video", {
              key: activeVideoSrc.value,
              class: "video-el",
              controls: "",
              playsinline: "",
              autoplay: "",
              preload: "metadata",
              poster: current.value.poster || void 0,
              src: activeVideoSrc.value,
              onError: onVideoError
            }, null, 40, _hoisted_76)),
            videoError.value ? (openBlock(), createElementBlock("p", _hoisted_77, toDisplayString(videoError.value), 1)) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_78, [
              createBaseVNode("button", {
                type: "button",
                class: "chip-btn ghost light",
                onClick: retryVideo
              }, [..._cache[32] || (_cache[32] = [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "refresh", -1),
                createTextVNode(" 重新加载 ", -1)
              ])]),
              (current.value.playUrls || []).length > 1 && !current.value.usePlayer ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "chip-btn ghost light",
                onClick: _cache[5] || (_cache[5] = ($event) => {
                  videoSrcIndex.value = (videoSrcIndex.value + 1) % current.value.playUrls.length;
                  videoError.value = "";
                })
              }, " 切换线路 " + toDisplayString(videoSrcIndex.value + 1) + "/" + toDisplayString(current.value.playUrls.length), 1)) : createCommentVNode("", true),
              current.value.playerUrl && !current.value.usePlayer ? (openBlock(), createElementBlock("button", {
                key: 1,
                type: "button",
                class: "chip-btn ghost light",
                onClick: _cache[6] || (_cache[6] = ($event) => {
                  current.value.usePlayer = true;
                  videoError.value = "";
                })
              }, " 官方播放器 ")) : createCommentVNode("", true)
            ]),
            createBaseVNode("p", _hoisted_79, toDisplayString(current.value.usePlayer ? "官方 ananas 播放器（应用内）" : "直链播放，失败可切换官方播放器"), 1)
          ])) : current.value.level === "document" ? (openBlock(), createElementBlock("section", _hoisted_80, [
            createBaseVNode("p", _hoisted_81, toDisplayString(current.value.knowledge?.title), 1),
            createBaseVNode("h3", _hoisted_82, toDisplayString(current.value.filename || current.value.task?.title), 1),
            createBaseVNode("p", _hoisted_83, "类型：" + toDisplayString(current.value.fileType || "文档"), 1),
            current.value.src ? (openBlock(), createElementBlock("iframe", {
              key: current.value.src,
              class: "video-el doc-frame",
              src: current.value.src,
              title: "文档预览",
              referrerpolicy: "no-referrer-when-downgrade"
            }, null, 8, _hoisted_84)) : (openBlock(), createElementBlock("p", _hoisted_85, "暂无预览地址")),
            createBaseVNode("div", _hoisted_86, [
              (current.value.candidates || []).length > 1 ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "chip-btn ghost light",
                onClick: _cache[7] || (_cache[7] = ($event) => (() => {
                  const list = current.value.candidates || [];
                  const i = Math.max(0, list.indexOf(current.value.src));
                  current.value.src = list[(i + 1) % list.length];
                })())
              }, " 切换预览源 ")) : createCommentVNode("", true)
            ]),
            _cache[33] || (_cache[33] = createBaseVNode("p", { class: "hint" }, "文档在应用内预览；若空白请确认学习通会话有效", -1))
          ])) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const ChaoxingHubView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-b13f3fba"]]);
export {
  ChaoxingHubView as default
};
