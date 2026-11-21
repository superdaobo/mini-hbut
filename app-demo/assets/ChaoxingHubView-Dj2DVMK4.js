const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./bridge_media_capability-BOSFLc-q.js","./app-demo-C2QcskTn.js","./runtime-bridge-BNc94E8M.js","./more-modules-_ebfrMaq.js","./vue-core-4L5yFbGc.js","./debug-tools-CR1SXL-G.js","./capture-BLRn_Hwi.js","./app-demo-9ty5rCKU.css"])))=>i.map(i=>d[i]);
import { p as onBeforeUnmount, a as openBlock, j as createBlock, c as createElementBlock, b as createBaseVNode, u as unref, t as toDisplayString, d as createCommentVNode, T as Teleport, r as ref, C as nextTick, i as defineComponent, x as watch, g as createTextVNode, F as Fragment, f as renderList, n as normalizeClass, e as normalizeStyle, h as computed, o as onMounted, $ as onUnmounted, k as createVNode, l as withCtx, M as withDirectives, N as vModelText, a0 as isRef } from "./vue-core-4L5yFbGc.js";
import { _ as _sfc_main$3 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BqDeZlwd.js";
import { _ as _export_sfc, o as openExternal, n as showToast, bW as TModal } from "./app-demo-C2QcskTn.js";
import { T as TEmptyState } from "./TEmptyState-CcMJuzH9.js";
import { T as TStatusBadge } from "./TStatusBadge-3emk2iuU.js";
import { d as invokeNative, aa as isTauriDesktopRuntime, _ as __vitePreload, C as isIOSLike, a as isTauriRuntime, p as pushDebugLog } from "./runtime-bridge-BNc94E8M.js";
import { b as useLocale, t as tf } from "./more-modules-_ebfrMaq.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import "./debug-tools-CR1SXL-G.js";
import "./capture-BLRn_Hwi.js";
const _hoisted_1$2 = {
  key: 0,
  class: "cx-embed"
};
const _hoisted_2$2 = { class: "cx-embed__bar" };
const _hoisted_3$2 = ["aria-label"];
const _hoisted_4$2 = { class: "cx-embed__title" };
const _hoisted_5$2 = {
  key: 0,
  class: "cx-embed__tip"
};
const _hoisted_6$2 = {
  key: 1,
  class: "cx-embed__tip is-error"
};
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const _sfc_main$2 = {
  __name: "ChaoxingEmbedFrame",
  props: {
    /** 要打开的学习通地址（只允许 *.chaoxing.com，后端会再校验一次） */
    url: { type: String, default: "" },
    /** 顶栏标题（课程名 / 作业名） */
    title: { type: String, default: "" }
  },
  emits: ["close"],
  setup(__props, { expose: __expose, emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t } = useLocale();
    const host = ref(null);
    const opened = ref(false);
    const zoom = ref(1);
    const busy = ref(false);
    const error = ref("");
    let syncTimer = null;
    const boundsOf = () => {
      const el = host.value;
      if (!el || !el.isConnected) return null;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.round(rect.left));
      const y = Math.max(0, Math.round(rect.top));
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      if (width < 8 || height < 8) return null;
      return { x, y, width, height };
    };
    const stopSync = () => {
      if (syncTimer !== null) {
        window.clearInterval(syncTimer);
        syncTimer = null;
      }
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
    const startSync = () => {
      stopSync();
      window.addEventListener("resize", onViewportChange);
      window.addEventListener("scroll", onViewportChange, true);
      syncTimer = window.setInterval(onViewportChange, 500);
    };
    function onViewportChange() {
      void sync();
    }
    const sync = async () => {
      if (!opened.value || busy.value) return;
      const bounds = boundsOf();
      if (!bounds) return;
      try {
        await invokeNative("chaoxing_embed_resize", { bounds });
      } catch {
      }
    };
    const fitZoom = () => {
      const width = window.innerWidth || 420;
      const ratio = Math.round(width / 1e3 * 100) / 100;
      return Math.max(0.45, Math.min(1, ratio));
    };
    const toggleZoom = async () => {
      const next = zoom.value < 0.999 ? 1 : fitZoom();
      zoom.value = next;
      try {
        await invokeNative("chaoxing_embed_zoom", { zoom: next });
      } catch {
      }
    };
    const waitForLayout = () => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)));
    });
    const open = async (url) => {
      const target = String(url || props.url || "").trim();
      if (!target) {
        error.value = "缺少目标地址";
        return;
      }
      error.value = "";
      if (!isTauriDesktopRuntime()) {
        await openExternal(target);
        emit("close");
        return;
      }
      busy.value = true;
      opened.value = true;
      try {
        await nextTick();
        await waitForLayout();
        const bounds = boundsOf();
        if (!bounds) throw new Error("内嵌容器尺寸无效");
        zoom.value = fitZoom();
        await invokeNative("chaoxing_embed_open", {
          url: target,
          bounds,
          userAgent: MOBILE_UA,
          zoom: zoom.value
        });
        startSync();
      } catch (e) {
        opened.value = false;
        error.value = String(e?.message || e || "打开失败");
      } finally {
        busy.value = false;
      }
    };
    const close = async () => {
      stopSync();
      if (opened.value) {
        try {
          await invokeNative("chaoxing_embed_close");
        } catch {
        }
      }
      opened.value = false;
      emit("close");
    };
    onBeforeUnmount(() => {
      stopSync();
      if (opened.value) {
        void invokeNative("chaoxing_embed_close").catch(() => {
        });
      }
    });
    __expose({ open, close });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        opened.value ? (openBlock(), createElementBlock("div", _hoisted_1$2, [
          createBaseVNode("header", _hoisted_2$2, [
            createBaseVNode("button", {
              type: "button",
              class: "cx-embed__back",
              "aria-label": unref(t)("chaoxing.embed.back"),
              onClick: close
            }, [..._cache[0] || (_cache[0] = [
              createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
            ])], 8, _hoisted_3$2),
            createBaseVNode("div", _hoisted_4$2, [
              createBaseVNode("strong", null, toDisplayString(__props.title || unref(t)("chaoxing.embed.title")), 1),
              createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.embed.loggedIn")), 1)
            ]),
            createBaseVNode("button", {
              type: "button",
              class: "cx-embed__zoom",
              onClick: toggleZoom
            }, toDisplayString(zoom.value < 0.999 ? unref(t)("chaoxing.embed.actual") : unref(t)("chaoxing.embed.fit")), 1),
            createBaseVNode("button", {
              type: "button",
              class: "cx-embed__close",
              onClick: close
            }, toDisplayString(unref(t)("chaoxing.embed.close")), 1)
          ]),
          createBaseVNode("div", {
            ref_key: "host",
            ref: host,
            class: "cx-embed__host"
          }, [
            busy.value ? (openBlock(), createElementBlock("p", _hoisted_5$2, toDisplayString(unref(t)("chaoxing.embed.opening")), 1)) : error.value ? (openBlock(), createElementBlock("p", _hoisted_6$2, toDisplayString(error.value), 1)) : createCommentVNode("", true)
          ], 512)
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const ChaoxingEmbedFrame = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-2aeee552"]]);
const _hoisted_1$1 = { class: "sr" };
const _hoisted_2$1 = { class: "sr-hero" };
const _hoisted_3$1 = { class: "sr-hero__head" };
const _hoisted_4$1 = { class: "sr-hero__main" };
const _hoisted_5$1 = { class: "sr-pill sr-pill--blue" };
const _hoisted_6$1 = { class: "sr-hero__title" };
const _hoisted_7$1 = { class: "sr-hero__meta" };
const _hoisted_8$1 = {
  class: "sr-tabs",
  role: "tablist"
};
const _hoisted_9$1 = ["aria-selected", "onClick"];
const _hoisted_10$1 = {
  key: 0,
  class: "sr-tip"
};
const _hoisted_11$1 = {
  key: 1,
  class: "sr-tip is-error"
};
const _hoisted_12$1 = { class: "sr-card sr-gauge" };
const _hoisted_13$1 = { class: "sr-gauge__ring" };
const _hoisted_14$1 = ["viewBox"];
const _hoisted_15$1 = ["cx", "cy"];
const _hoisted_16$1 = ["cx", "cy", "stroke-dashoffset"];
const _hoisted_17$1 = { class: "sr-gauge__center" };
const _hoisted_18$1 = { class: "sr-gauge__foot" };
const _hoisted_19$1 = { class: "sr-gauge__foot-left" };
const _hoisted_20$1 = {
  key: 0,
  class: "sr-gauge__foot-right"
};
const _hoisted_21$1 = { class: "sr-grid" };
const _hoisted_22$1 = { class: "sr-metric__top" };
const _hoisted_23$1 = { class: "material-symbols-outlined" };
const _hoisted_24$1 = { class: "sr-metric__value" };
const _hoisted_25$1 = { class: "sr-metric__label" };
const _hoisted_26$1 = { class: "sr-metric__bar" };
const _hoisted_27$1 = {
  key: 0,
  class: "sr-card sr-panel"
};
const _hoisted_28$1 = { class: "sr-panel__head" };
const _hoisted_29$1 = { class: "sr-panel__count" };
const _hoisted_30$1 = { class: "sr-dist" };
const _hoisted_31$1 = { class: "sr-dist__label" };
const _hoisted_32$1 = { class: "sr-dist__track" };
const _hoisted_33$1 = { class: "sr-dist__value" };
const _hoisted_34$1 = { class: "sr-card sr-chart" };
const _hoisted_35$1 = { class: "sr-chart__head" };
const _hoisted_36$1 = { class: "sr-chart__title" };
const _hoisted_37$1 = { class: "sr-pill sr-pill--blue-soft" };
const _hoisted_38$1 = { class: "sr-chart__sub" };
const _hoisted_39$1 = { class: "sr-chart__sub-strong" };
const _hoisted_40$1 = {
  class: "sr-seg",
  role: "group"
};
const _hoisted_41$1 = {
  key: 0,
  class: "sr-bars"
};
const _hoisted_42$1 = { class: "sr-bar__value" };
const _hoisted_43$1 = { key: 0 };
const _hoisted_44$1 = { class: "sr-bar__date" };
const _hoisted_45$1 = {
  key: 1,
  class: "sr-visit30"
};
const _hoisted_46$1 = { class: "sr-visit30__row" };
const _hoisted_47$1 = { class: "sr-dist__track" };
const _hoisted_48$1 = { class: "sr-visit30__hint" };
const _hoisted_49$1 = { class: "sr-chart__foot" };
const _hoisted_50$1 = { class: "sr-chart__foot-left" };
const _hoisted_51$1 = { class: "sr-card sr-gauge" };
const _hoisted_52$1 = { class: "sr-gauge__ring" };
const _hoisted_53$1 = ["viewBox"];
const _hoisted_54$1 = ["cx", "cy"];
const _hoisted_55$1 = ["cx", "cy", "stroke-dashoffset"];
const _hoisted_56$1 = { class: "sr-gauge__center" };
const _hoisted_57$1 = { class: "sr-gauge__foot" };
const _hoisted_58$1 = { class: "sr-gauge__foot-left" };
const _hoisted_59$1 = { class: "sr-gauge__foot-right" };
const _hoisted_60$1 = { class: "sr-card sr-panel" };
const _hoisted_61$1 = { class: "sr-panel__head" };
const _hoisted_62$1 = {
  key: 0,
  class: "sr-empty"
};
const _hoisted_63$1 = {
  key: 1,
  class: "sr-dist"
};
const _hoisted_64$1 = { class: "sr-dist__label" };
const _hoisted_65$1 = { class: "sr-dist__track" };
const _hoisted_66$1 = { class: "sr-dist__value" };
const _hoisted_67$1 = { class: "sr-grid" };
const _hoisted_68$1 = { class: "sr-metric" };
const _hoisted_69$1 = { class: "sr-metric__top" };
const _hoisted_70$1 = { class: "sr-metric__badge is-muted" };
const _hoisted_71$1 = { class: "sr-metric__value" };
const _hoisted_72$1 = { class: "sr-metric__label" };
const _hoisted_73$1 = { class: "sr-metric__bar" };
const _hoisted_74$1 = { class: "sr-metric" };
const _hoisted_75$1 = { class: "sr-metric__value" };
const _hoisted_76$1 = { class: "sr-metric__label" };
const _hoisted_77$1 = { class: "sr-metric__bar" };
const _hoisted_78$1 = { class: "sr-metric" };
const _hoisted_79$1 = { class: "sr-metric__value" };
const _hoisted_80$1 = { class: "sr-metric__label" };
const _hoisted_81$1 = { class: "sr-card sr-panel" };
const _hoisted_82$1 = { class: "sr-panel__head" };
const _hoisted_83$1 = { class: "sr-panel__count" };
const _hoisted_84$1 = {
  key: 0,
  class: "sr-empty"
};
const _hoisted_85$1 = ["onClick"];
const _hoisted_86$1 = { class: "sr-row__main" };
const _hoisted_87$1 = { class: "sr-card sr-panel" };
const _hoisted_88$1 = { class: "sr-panel__head" };
const _hoisted_89$1 = { class: "sr-panel__count" };
const _hoisted_90$1 = {
  key: 0,
  class: "sr-empty"
};
const _hoisted_91$1 = ["onClick"];
const _hoisted_92$1 = { class: "sr-row__main" };
const _hoisted_93$1 = { class: "sr-card sr-gauge" };
const _hoisted_94$1 = { class: "sr-gauge__ring" };
const _hoisted_95$1 = ["viewBox"];
const _hoisted_96$1 = ["cx", "cy"];
const _hoisted_97$1 = ["cx", "cy", "stroke-dashoffset"];
const _hoisted_98$1 = { class: "sr-gauge__center" };
const _hoisted_99$1 = { class: "sr-gauge__foot" };
const _hoisted_100$1 = { class: "sr-gauge__foot-left" };
const _hoisted_101$1 = { class: "sr-gauge__foot-right" };
const _hoisted_102$1 = { class: "sr-grid" };
const _hoisted_103$1 = { class: "sr-metric" };
const _hoisted_104$1 = { class: "sr-metric__value" };
const _hoisted_105$1 = { class: "sr-metric__label" };
const _hoisted_106$1 = { class: "sr-metric__bar" };
const _hoisted_107$1 = { class: "sr-metric" };
const _hoisted_108$1 = { class: "sr-metric__value" };
const _hoisted_109$1 = { class: "sr-metric__label" };
const _hoisted_110$1 = { class: "sr-metric" };
const _hoisted_111$1 = { class: "sr-metric__top" };
const _hoisted_112$1 = {
  key: 0,
  class: "sr-metric__badge is-emerald"
};
const _hoisted_113$1 = {
  key: 1,
  class: "sr-metric__badge is-muted"
};
const _hoisted_114$1 = { class: "sr-metric__value" };
const _hoisted_115$1 = { class: "sr-metric__label" };
const _hoisted_116$1 = { class: "sr-metric__bar" };
const _hoisted_117$1 = { class: "sr-metric" };
const _hoisted_118$1 = { class: "sr-metric__top" };
const _hoisted_119$1 = { class: "sr-metric__value" };
const _hoisted_120$1 = { class: "sr-metric__label" };
const _hoisted_121$1 = { class: "sr-metric__bar" };
const _hoisted_122$1 = { class: "sr-card sr-gauge" };
const _hoisted_123$1 = { class: "sr-gauge__ring" };
const _hoisted_124$1 = ["viewBox"];
const _hoisted_125$1 = ["cx", "cy"];
const _hoisted_126$1 = ["cx", "cy", "stroke-dashoffset"];
const _hoisted_127$1 = { class: "sr-gauge__center" };
const _hoisted_128$1 = { class: "sr-gauge__foot" };
const _hoisted_129$1 = { class: "sr-gauge__foot-left" };
const _hoisted_130$1 = { class: "sr-gauge__foot-right" };
const _hoisted_131$1 = { class: "sr-grid" };
const _hoisted_132$1 = { class: "sr-metric" };
const _hoisted_133$1 = { class: "sr-metric__top" };
const _hoisted_134$1 = { class: "sr-metric__badge is-emerald" };
const _hoisted_135$1 = { class: "sr-metric__value" };
const _hoisted_136$1 = { class: "sr-metric__label" };
const _hoisted_137$1 = { class: "sr-metric__bar" };
const _hoisted_138$1 = { class: "sr-metric" };
const _hoisted_139$1 = { class: "sr-metric__value" };
const _hoisted_140 = { class: "sr-metric__label" };
const _hoisted_141 = { class: "sr-metric" };
const _hoisted_142 = { class: "sr-metric__top" };
const _hoisted_143 = { class: "sr-metric__badge is-muted" };
const _hoisted_144 = { class: "sr-metric__value" };
const _hoisted_145 = { class: "sr-metric__label" };
const _hoisted_146 = { class: "sr-metric" };
const _hoisted_147 = { class: "sr-metric__top" };
const _hoisted_148 = { class: "sr-metric__value" };
const _hoisted_149 = { class: "sr-metric__label" };
const _hoisted_150 = { class: "sr-metric__bar" };
const _hoisted_151 = { class: "sr-metric" };
const _hoisted_152 = { class: "sr-metric__top" };
const _hoisted_153 = { class: "sr-metric__badge is-muted" };
const _hoisted_154 = { class: "sr-metric__value" };
const _hoisted_155 = { class: "sr-metric__label" };
const _hoisted_156 = { class: "sr-metric__bar" };
const _hoisted_157 = { class: "sr-metric" };
const _hoisted_158 = { class: "sr-metric__top" };
const _hoisted_159 = {
  key: 0,
  class: "sr-metric__badge is-emerald"
};
const _hoisted_160 = {
  key: 1,
  class: "sr-metric__badge is-muted"
};
const _hoisted_161 = { class: "sr-metric__value" };
const _hoisted_162 = { class: "sr-metric__label" };
const _hoisted_163 = { class: "sr-metric__bar" };
const _hoisted_164 = { class: "sr-metric" };
const _hoisted_165 = { class: "sr-metric__value" };
const _hoisted_166 = { class: "sr-metric__label" };
const _hoisted_167 = { class: "sr-metric__bar" };
const _hoisted_168 = { class: "sr-card sr-panel" };
const _hoisted_169 = { class: "sr-panel__head" };
const _hoisted_170 = { class: "sr-panel__count" };
const _hoisted_171 = {
  key: 0,
  class: "sr-empty"
};
const _hoisted_172 = {
  key: 1,
  class: "sr-dist"
};
const _hoisted_173 = { class: "sr-dist__row" };
const _hoisted_174 = { class: "sr-dist__label" };
const _hoisted_175 = { class: "sr-dist__value" };
const _hoisted_176 = { class: "sr-dist__row" };
const _hoisted_177 = { class: "sr-dist__label" };
const _hoisted_178 = { class: "sr-dist__value" };
const _hoisted_179 = { class: "sr-dist__row" };
const _hoisted_180 = { class: "sr-dist__label" };
const _hoisted_181 = { class: "sr-dist__value" };
const _hoisted_182 = { class: "sr-dist__row" };
const _hoisted_183 = { class: "sr-dist__label" };
const _hoisted_184 = { class: "sr-dist__value" };
const _hoisted_185 = { class: "sr-grid" };
const _hoisted_186 = { class: "sr-metric" };
const _hoisted_187 = { class: "sr-metric__top" };
const _hoisted_188 = { class: "sr-metric__badge is-emerald" };
const _hoisted_189 = { class: "sr-metric__value" };
const _hoisted_190 = { class: "sr-metric__label" };
const _hoisted_191 = { class: "sr-metric__bar" };
const _hoisted_192 = { class: "sr-metric" };
const _hoisted_193 = { class: "sr-metric__value" };
const _hoisted_194 = { class: "sr-metric__label" };
const _hoisted_195 = { class: "sr-metric" };
const _hoisted_196 = { class: "sr-metric__value" };
const _hoisted_197 = { class: "sr-metric__label" };
const _hoisted_198 = { class: "sr-card sr-panel" };
const _hoisted_199 = { class: "sr-panel__head" };
const _hoisted_200 = { class: "sr-panel__count" };
const _hoisted_201 = {
  key: 0,
  class: "sr-empty"
};
const _hoisted_202 = ["onClick"];
const _hoisted_203 = { class: "sr-row__main" };
const _hoisted_204 = {
  key: 8,
  class: "sr-cta"
};
const _hoisted_205 = { class: "sr-cta__text" };
const _hoisted_206 = { class: "sr-foot" };
const PASS_LINE = 60;
const RING_SIZE = 160;
const RING_RADIUS = 62;
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "ChaoxingStudyRecord",
  props: {
    course: { type: Object, required: true }
  },
  emits: ["open-official"],
  setup(__props, { expose: __expose, emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t } = useLocale();
    const TABS = [
      { key: "overview", labelKey: "chaoxing.study.tab.overview", dims: ["score", "job", "test", "work", "groupTask", "point", "sign", "weekPv", "overallSummary"] },
      { key: "sign", labelKey: "chaoxing.study.tab.sign", dims: ["sign"] },
      { key: "work", labelKey: "chaoxing.study.tab.work", dims: ["job", "work", "workSummary", "behindTask", "importWeekTask"] },
      { key: "test", labelKey: "chaoxing.study.tab.test", dims: ["test", "videoTest", "examSummary"] },
      { key: "video", labelKey: "chaoxing.study.tab.video", dims: ["taskSummary", "videoTest", "point", "live", "cxclass"] },
      { key: "other", labelKey: "chaoxing.study.tab.other", dims: ["nearTask", "weekTask", "ai-evaluate-stat"] }
    ];
    const activeTab = ref("overview");
    const loading = ref(false);
    const error = ref("");
    const dims = ref({});
    const errors = ref({});
    const loadedTabs = ref({});
    const coreRef = ref(null);
    const tabOf = (key) => TABS.find((tab) => tab.key === key) || TABS[0];
    const payloadOf = (dim) => {
      const raw = dims.value[dim] || {};
      const data = raw.data;
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return data;
      }
      return raw;
    };
    const listOf = (dim) => {
      const raw = dims.value[dim] || {};
      const data = raw.data;
      if (Array.isArray(data)) return data;
      const resultList = data?.resultList;
      if (Array.isArray(resultList)) return resultList;
      if (Array.isArray(raw)) return raw;
      return [];
    };
    const num = (value, fallback = 0) => {
      if (value === null || value === void 0 || value === "") return fallback;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const pct = (value) => Math.max(0, Math.min(100, num(value)));
    const loadTab = async (key, force = false) => {
      if (!force && loadedTabs.value[key]) return;
      const tab = tabOf(key);
      const missing = tab.dims.filter((dim) => force || !dims.value[dim]);
      if (!missing.length) {
        loadedTabs.value[key] = true;
        return;
      }
      loading.value = true;
      error.value = "";
      try {
        const res = await coreRef.value?.cxInvoke("chaoxing_fetch_study_record", {
          courseId: props.course.courseId,
          clazzId: props.course.clazzId,
          cpi: props.course.cpi || "",
          dimensions: missing,
          force
        });
        if (res?.dimensions && typeof res.dimensions === "object") {
          dims.value = { ...dims.value, ...res.dimensions };
        }
        if (res?.errors && typeof res.errors === "object") {
          errors.value = { ...errors.value, ...res.errors };
        }
        loadedTabs.value[key] = true;
        const firstError = Object.values(errors.value)[0];
        if (firstError && !Object.keys(dims.value).length) error.value = String(firstError);
      } catch (e) {
        error.value = String(e?.message || e || t("chaoxing.study.loadFailed"));
      } finally {
        loading.value = false;
      }
    };
    const bindCore = (core) => {
      coreRef.value = core;
      void loadTab(activeTab.value);
    };
    __expose({ bindCore, reload: () => loadTab(activeTab.value, true) });
    watch(activeTab, (key) => {
      void loadTab(key);
    });
    const courseMeta = computed(() => {
      const bits = [];
      if (props.course.teacher) bits.push(props.course.teacher);
      else bits.push(t("chaoxing.hub.teacherMissing"));
      if (props.course.semester) bits.push(props.course.semester);
      return bits;
    });
    const scoreData = computed(() => payloadOf("score"));
    const scoreDetail = computed(() => scoreData.value.score || {});
    const scoreWeight = computed(() => scoreData.value.weight || {});
    const totalScore = computed(() => num(scoreDetail.value.score));
    const scoreStatus = computed(() => {
      const score = totalScore.value;
      if (score >= 85) return { text: t("chaoxing.study.grade.excellent"), tone: "high" };
      if (score >= PASS_LINE) return { text: t("chaoxing.study.grade.good"), tone: "mid" };
      return { text: t("chaoxing.study.grade.fail"), tone: "low" };
    });
    const classRank = computed(() => {
      const job = payloadOf("job");
      const rank = num(job.jobRank);
      const total = num(job.studentCount);
      if (!rank || !total) return "";
      return Math.max(1, Math.round(rank / total * 100));
    });
    const weightRate = (key) => {
      const weight = num(scoreWeight.value[key]);
      const got = num(scoreDetail.value[key]);
      if (weight <= 0) return pct(got);
      return Math.max(0, Math.min(100, got / weight * 100));
    };
    const workRate = computed(() => weightRate("work"));
    const testRate = computed(() => pct(payloadOf("test").finishPer));
    const groupRate = computed(() => pct(payloadOf("groupTask").taskPer));
    const signRate = computed(() => pct(payloadOf("sign").signPer));
    const videoRate = computed(() => weightRate("video"));
    const visitRate = computed(() => weightRate("visitTime"));
    const metricCards = computed(() => [
      {
        key: "work",
        label: t("chaoxing.study.card.work"),
        value: `${num(payloadOf("work").finishCount)}/${num(payloadOf("work").receivedNum)}`,
        badge: `${workRate.value.toFixed(0)}%`,
        badgeTone: "muted",
        icon: "assignment",
        iconTone: "blue",
        barTone: "blue",
        percent: workRate.value
      },
      {
        key: "test",
        label: t("chaoxing.study.card.test"),
        // 实测：上游 `receivedNum` 与 `finishPer` 不自洽（46/46 却是 0%），
        // 用 `testNum/totalJob` 与完成率才一致
        value: `${num(payloadOf("test").testNum)}/${num(payloadOf("test").totalJob)}`,
        badge: testRate.value >= 100 ? t("chaoxing.study.badge.done") : `${testRate.value.toFixed(0)}%`,
        badgeTone: testRate.value >= 100 ? "emerald" : "muted",
        icon: "quiz",
        iconTone: "indigo",
        barTone: "indigo",
        percent: testRate.value
      },
      {
        key: "group",
        label: t("chaoxing.study.card.group"),
        value: `${num(payloadOf("groupTask").taskNum)}`,
        badge: num(payloadOf("groupTask").taskNum) > 0 ? `${groupRate.value.toFixed(0)}%` : t("chaoxing.study.badge.none"),
        badgeTone: "muted",
        icon: "groups",
        iconTone: "sky",
        barTone: "sky",
        percent: groupRate.value
      },
      {
        key: "sign",
        label: t("chaoxing.study.card.sign"),
        value: `${signRate.value.toFixed(0)}%`,
        badge: signRate.value >= 100 ? t("chaoxing.study.badge.full") : t("chaoxing.study.badge.todo"),
        badgeTone: signRate.value >= 100 ? "emerald" : "amber",
        icon: "how_to_reg",
        iconTone: "amber",
        barTone: "amber",
        percent: signRate.value
      },
      {
        key: "video",
        label: t("chaoxing.study.card.video"),
        value: `${videoRate.value.toFixed(0)}%`,
        badge: videoRate.value >= 90 ? t("chaoxing.study.badge.ahead") : `${videoRate.value.toFixed(0)}%`,
        badgeTone: videoRate.value >= 90 ? "emerald" : "muted",
        icon: "smart_display",
        iconTone: "emerald",
        barTone: "emerald",
        percent: videoRate.value
      },
      {
        key: "visit",
        label: t("chaoxing.study.card.visit"),
        value: `${visitRate.value.toFixed(0)}%`,
        badge: visitRate.value >= 100 ? t("chaoxing.study.badge.full") : `${visitRate.value.toFixed(0)}%`,
        badgeTone: visitRate.value >= 100 ? "teal" : "muted",
        icon: "visibility",
        iconTone: "teal",
        barTone: "teal",
        percent: visitRate.value
      }
    ]);
    const weekPv = computed(() => {
      const data = payloadOf("weekPv");
      const counts = Array.isArray(data.counts) ? data.counts.map((v) => num(v)) : [];
      const dates = Array.isArray(data.dates) ? data.dates.map((v) => String(v)) : [];
      const max = Math.max(1, ...counts);
      const peak = counts.indexOf(max);
      return counts.map((count, index) => ({
        date: dates[index] || "",
        count,
        height: count === 0 ? 4 : Math.max(12, Math.round(count / max * 128)),
        peak: index === peak && count > 0
      }));
    });
    const weekPvTotal = computed(() => weekPv.value.reduce((sum, item) => sum + item.count, 0));
    const weekPvAvg = computed(
      () => weekPv.value.length ? (weekPvTotal.value / weekPv.value.length).toFixed(1) : "0.0"
    );
    const activityLabel = computed(() => {
      const avg = Number(weekPvAvg.value);
      if (avg >= 3) return t("chaoxing.study.visit.high");
      if (avg >= 1) return t("chaoxing.study.visit.mid");
      return t("chaoxing.study.visit.low");
    });
    const signBuckets = computed(() => {
      const data = payloadOf("sign");
      return [
        { key: "attendance", label: t("chaoxing.study.sign.normal"), value: num(data.attendanceCount), tone: "emerald" },
        { key: "late", label: t("chaoxing.study.sign.late"), value: num(data.lateCount), tone: "amber" },
        { key: "early", label: t("chaoxing.study.sign.early"), value: num(data.earlyCount), tone: "orange" },
        { key: "absence", label: t("chaoxing.study.sign.absence"), value: num(data.absenceCount), tone: "rose" },
        { key: "sick", label: t("chaoxing.study.sign.sick"), value: num(data.sickCount), tone: "sky" },
        { key: "public", label: t("chaoxing.study.sign.public"), value: num(data.publicCount), tone: "violet" },
        { key: "overdue", label: t("chaoxing.study.sign.overdue"), value: num(data.overdueCount), tone: "slate" }
      ];
    });
    const signMax = computed(() => Math.max(1, ...signBuckets.value.map((item) => item.value)));
    const workSummary = computed(() => payloadOf("workSummary"));
    const examSummary = computed(() => payloadOf("examSummary"));
    const overallSummary = computed(() => payloadOf("overallSummary"));
    const overallWeights = computed(() => {
      const raw = overallSummary.value.weights || {};
      return Object.entries(raw).map(([name, percent]) => ({ name, percent: num(percent) })).sort((a, b) => b.percent - a.percent);
    });
    const taskSummary = computed(() => payloadOf("taskSummary"));
    const watchedMinutes = computed(() => num(taskSummary.value.video_watched_minutes));
    const totalMinutes = computed(() => num(taskSummary.value.video_total_minutes));
    const readMinutes = computed(() => num(taskSummary.value.read_minutes));
    const taskDone = computed(() => num(taskSummary.value.completed));
    const taskTotal = computed(() => num(taskSummary.value.task_points));
    const taskPercent = computed(
      () => taskTotal.value > 0 ? taskDone.value / taskTotal.value * 100 : 0
    );
    const videoWatchRate = computed(() => pct(taskSummary.value.video_percent));
    const videoScore = computed(() => num(scoreDetail.value.video));
    const videoWeight = computed(() => num(scoreWeight.value.video));
    const hasLiveData = computed(
      () => num(liveData.value.livingTime) + num(liveData.value.playbackTime) + num(cxclassData.value.watchTimeMinutes) + num(cxclassData.value.lookBackTime) > 0
    );
    const visitView = ref("7d");
    const visitScore = computed(() => num(scoreDetail.value.visitTime));
    const visitWeight = computed(() => num(scoreWeight.value.visitTime));
    const behindTasks = computed(() => listOf("behindTask").filter((item) => item && item.name).slice(0, 8));
    const weekTasks = computed(() => listOf("importWeekTask").filter((item) => item && item.name).slice(0, 8));
    const nearTasks = computed(() => listOf("nearTask").filter((item) => item && item.name).slice(0, 8));
    const videoTestData = computed(() => payloadOf("videoTest"));
    const liveData = computed(() => payloadOf("live"));
    const pointData = computed(() => payloadOf("point"));
    const cxclassData = computed(() => payloadOf("cxclass"));
    const aiData = computed(() => payloadOf("ai-evaluate-stat"));
    const RING_CIRC = 2 * Math.PI * RING_RADIUS;
    const ringOffset = (percent) => RING_CIRC * (1 - pct(percent) / 100);
    const animated = ref({});
    let rafId = 0;
    const animateNumbers = (targets) => {
      if (rafId) cancelAnimationFrame(rafId);
      const start = performance.now();
      const from = {};
      Object.keys(targets).forEach((key) => {
        from[key] = animated.value[key] || 0;
      });
      const step = (now) => {
        const progress = Math.min(1, (now - start) / 300);
        const eased = 1 - Math.pow(1 - progress, 3);
        const next = {};
        Object.keys(targets).forEach((key) => {
          next[key] = from[key] + (targets[key] - from[key]) * eased;
        });
        animated.value = next;
        if (progress < 1) rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    };
    const shown = (key, fallback = 0) => {
      const value = animated.value[key];
      return value === void 0 ? fallback : value;
    };
    watch(
      () => [activeTab.value, totalScore.value, signRate.value, weekPvTotal.value],
      () => {
        animateNumbers({ score: totalScore.value, sign: signRate.value, weekPv: weekPvTotal.value });
      },
      { immediate: true }
    );
    onBeforeUnmount(() => {
      if (rafId) cancelAnimationFrame(rafId);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("section", _hoisted_1$1, [
        createBaseVNode("section", _hoisted_2$1, [
          _cache[5] || (_cache[5] = createBaseVNode("div", {
            class: "sr-hero__glow",
            "aria-hidden": "true"
          }, null, -1)),
          createBaseVNode("div", _hoisted_3$1, [
            createBaseVNode("div", _hoisted_4$1, [
              createBaseVNode("span", _hoisted_5$1, [
                _cache[3] || (_cache[3] = createBaseVNode("i", null, null, -1)),
                createTextVNode(toDisplayString(unref(t)("chaoxing.hub.studyRecord")), 1)
              ]),
              createBaseVNode("h2", _hoisted_6$1, toDisplayString(__props.course?.title || unref(t)("chaoxing.study.title")), 1),
              createBaseVNode("p", _hoisted_7$1, [
                _cache[4] || (_cache[4] = createBaseVNode("span", { class: "material-symbols-outlined" }, "person", -1)),
                createTextVNode(" " + toDisplayString(courseMeta.value.join(" · ")), 1)
              ])
            ])
          ])
        ]),
        createBaseVNode("nav", _hoisted_8$1, [
          (openBlock(), createElementBlock(Fragment, null, renderList(TABS, (tab) => {
            return createBaseVNode("button", {
              key: tab.key,
              type: "button",
              role: "tab",
              class: normalizeClass(["sr-tab", { "is-active": activeTab.value === tab.key }]),
              "aria-selected": activeTab.value === tab.key,
              onClick: ($event) => activeTab.value = tab.key
            }, toDisplayString(unref(t)(tab.labelKey)), 11, _hoisted_9$1);
          }), 64))
        ]),
        loading.value ? (openBlock(), createElementBlock("div", _hoisted_10$1, toDisplayString(unref(t)("chaoxing.study.loading")), 1)) : error.value ? (openBlock(), createElementBlock("div", _hoisted_11$1, toDisplayString(error.value), 1)) : createCommentVNode("", true),
        activeTab.value === "overview" ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
          createBaseVNode("section", _hoisted_12$1, [
            createBaseVNode("div", _hoisted_13$1, [
              (openBlock(), createElementBlock("svg", {
                viewBox: `0 0 ${RING_SIZE} ${RING_SIZE}`,
                class: "sr-gauge__svg"
              }, [
                _cache[6] || (_cache[6] = createBaseVNode("defs", null, [
                  createBaseVNode("linearGradient", {
                    id: "srRingAmber",
                    x1: "0%",
                    y1: "0%",
                    x2: "100%",
                    y2: "100%"
                  }, [
                    createBaseVNode("stop", {
                      offset: "0%",
                      "stop-color": "#F59E0B"
                    }),
                    createBaseVNode("stop", {
                      offset: "60%",
                      "stop-color": "#F97316"
                    }),
                    createBaseVNode("stop", {
                      offset: "100%",
                      "stop-color": "#EA580C"
                    })
                  ])
                ], -1)),
                createBaseVNode("circle", {
                  cx: RING_SIZE / 2,
                  cy: RING_SIZE / 2,
                  r: RING_RADIUS,
                  fill: "none",
                  stroke: "var(--md-sys-color-surface-variant, #F1F5F9)",
                  "stroke-width": 12,
                  "stroke-linecap": "round"
                }, null, 8, _hoisted_15$1),
                createBaseVNode("circle", {
                  class: "sr-gauge__arc",
                  cx: RING_SIZE / 2,
                  cy: RING_SIZE / 2,
                  r: RING_RADIUS,
                  fill: "none",
                  stroke: "url(#srRingAmber)",
                  "stroke-width": 13,
                  "stroke-linecap": "round",
                  "stroke-dasharray": RING_CIRC,
                  "stroke-dashoffset": ringOffset(shown("score", totalScore.value))
                }, null, 8, _hoisted_16$1)
              ], 8, _hoisted_14$1)),
              createBaseVNode("div", _hoisted_17$1, [
                createBaseVNode("strong", null, toDisplayString(shown("score", totalScore.value).toFixed(1)), 1),
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.study.totalScore")), 1),
                createBaseVNode("em", {
                  class: normalizeClass(["sr-gauge__badge", `is-${scoreStatus.value.tone}`])
                }, toDisplayString(scoreStatus.value.text), 3)
              ])
            ]),
            createBaseVNode("div", _hoisted_18$1, [
              createBaseVNode("span", _hoisted_19$1, [
                _cache[7] || (_cache[7] = createBaseVNode("i", null, null, -1)),
                createTextVNode(toDisplayString(unref(tf)("chaoxing.study.passLine", { n: PASS_LINE.toFixed(1) })), 1)
              ]),
              classRank.value ? (openBlock(), createElementBlock("span", _hoisted_20$1, toDisplayString(unref(tf)("chaoxing.study.classRank", { n: classRank.value })), 1)) : createCommentVNode("", true)
            ])
          ]),
          createBaseVNode("section", _hoisted_21$1, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(metricCards.value, (card) => {
              return openBlock(), createElementBlock("article", {
                key: card.key,
                class: "sr-metric"
              }, [
                createBaseVNode("div", _hoisted_22$1, [
                  createBaseVNode("span", {
                    class: normalizeClass(["sr-metric__icon", `is-${card.iconTone}`])
                  }, [
                    createBaseVNode("span", _hoisted_23$1, toDisplayString(card.icon), 1)
                  ], 2),
                  createBaseVNode("span", {
                    class: normalizeClass(["sr-metric__badge", `is-${card.badgeTone}`])
                  }, toDisplayString(card.badge), 3)
                ]),
                createBaseVNode("strong", _hoisted_24$1, toDisplayString(card.value), 1),
                createBaseVNode("span", _hoisted_25$1, toDisplayString(card.label), 1),
                createBaseVNode("i", _hoisted_26$1, [
                  createBaseVNode("b", {
                    class: normalizeClass(`is-${card.barTone}`),
                    style: normalizeStyle({ width: card.percent + "%" })
                  }, null, 6)
                ])
              ]);
            }), 128))
          ]),
          overallWeights.value.length ? (openBlock(), createElementBlock("section", _hoisted_27$1, [
            createBaseVNode("div", _hoisted_28$1, [
              createBaseVNode("h3", null, toDisplayString(unref(t)("chaoxing.study.weights.title")), 1),
              createBaseVNode("span", _hoisted_29$1, toDisplayString(unref(tf)("chaoxing.study.weights.total", { n: num(overallSummary.value.total_score) })), 1)
            ]),
            createBaseVNode("div", _hoisted_30$1, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(overallWeights.value, (w) => {
                return openBlock(), createElementBlock("div", {
                  key: w.name,
                  class: "sr-dist__row"
                }, [
                  createBaseVNode("span", _hoisted_31$1, toDisplayString(w.name), 1),
                  createBaseVNode("i", _hoisted_32$1, [
                    createBaseVNode("b", {
                      class: "is-blue",
                      style: normalizeStyle({ width: w.percent + "%" })
                    }, null, 4)
                  ]),
                  createBaseVNode("span", _hoisted_33$1, toDisplayString(w.percent) + "%", 1)
                ]);
              }), 128))
            ])
          ])) : createCommentVNode("", true),
          createBaseVNode("section", _hoisted_34$1, [
            createBaseVNode("div", _hoisted_35$1, [
              createBaseVNode("div", null, [
                createBaseVNode("div", _hoisted_36$1, [
                  createBaseVNode("h3", null, toDisplayString(unref(t)("chaoxing.study.visit.title")), 1),
                  createBaseVNode("span", _hoisted_37$1, toDisplayString(unref(t)("chaoxing.study.visit.badge")), 1)
                ]),
                createBaseVNode("p", _hoisted_38$1, [
                  createTextVNode(toDisplayString(unref(t)("chaoxing.study.visit.total")) + " ", 1),
                  createBaseVNode("b", null, toDisplayString(shown("weekPv", weekPvTotal.value).toFixed(0)), 1),
                  createTextVNode(" " + toDisplayString(unref(t)("chaoxing.study.visit.times")) + " · " + toDisplayString(unref(t)("chaoxing.study.visit.avg")) + " ", 1),
                  createBaseVNode("b", _hoisted_39$1, toDisplayString(weekPvAvg.value), 1),
                  createTextVNode(" " + toDisplayString(unref(t)("chaoxing.study.visit.perDay")), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_40$1, [
                createBaseVNode("button", {
                  type: "button",
                  class: normalizeClass({ "is-active": visitView.value === "7d" }),
                  onClick: _cache[0] || (_cache[0] = ($event) => visitView.value = "7d")
                }, toDisplayString(unref(t)("chaoxing.study.visit.days7")), 3),
                createBaseVNode("button", {
                  type: "button",
                  class: normalizeClass({ "is-active": visitView.value === "30d" }),
                  onClick: _cache[1] || (_cache[1] = ($event) => visitView.value = "30d")
                }, toDisplayString(unref(t)("chaoxing.study.visit.days30")), 3)
              ])
            ]),
            visitView.value === "7d" ? (openBlock(), createElementBlock("div", _hoisted_41$1, [
              _cache[8] || (_cache[8] = createBaseVNode("div", {
                class: "sr-bars__grid",
                "aria-hidden": "true"
              }, [
                createBaseVNode("i"),
                createBaseVNode("i"),
                createBaseVNode("i"),
                createBaseVNode("i")
              ], -1)),
              (openBlock(true), createElementBlock(Fragment, null, renderList(weekPv.value, (item) => {
                return openBlock(), createElementBlock("div", {
                  key: item.date,
                  class: normalizeClass(["sr-bar", { "is-peak": item.peak }])
                }, [
                  createBaseVNode("span", _hoisted_42$1, [
                    createTextVNode(toDisplayString(item.count), 1),
                    item.peak ? (openBlock(), createElementBlock("i", _hoisted_43$1)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("b", {
                    style: normalizeStyle({ height: item.height + "px" })
                  }, null, 4),
                  createBaseVNode("span", _hoisted_44$1, toDisplayString(item.date), 1)
                ], 2);
              }), 128))
            ])) : (openBlock(), createElementBlock("div", _hoisted_45$1, [
              createBaseVNode("div", _hoisted_46$1, [
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.study.visit.score")), 1),
                createBaseVNode("strong", null, toDisplayString(visitScore.value) + " / " + toDisplayString(visitWeight.value), 1)
              ]),
              createBaseVNode("i", _hoisted_47$1, [
                createBaseVNode("b", {
                  class: normalizeClass(`is-${visitRate.value >= 70 ? "emerald" : visitRate.value >= 30 ? "amber" : "rose"}`),
                  style: normalizeStyle({ width: visitRate.value + "%" })
                }, null, 6)
              ]),
              createBaseVNode("p", _hoisted_48$1, toDisplayString(unref(t)("chaoxing.study.visit.days30Hint")), 1)
            ])),
            createBaseVNode("div", _hoisted_49$1, [
              createBaseVNode("span", _hoisted_50$1, [
                _cache[9] || (_cache[9] = createBaseVNode("i", null, null, -1)),
                createTextVNode(toDisplayString(unref(t)("chaoxing.study.visit.activity")) + toDisplayString(activityLabel.value), 1)
              ])
            ])
          ])
        ], 64)) : activeTab.value === "sign" ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
          createBaseVNode("section", _hoisted_51$1, [
            createBaseVNode("div", _hoisted_52$1, [
              (openBlock(), createElementBlock("svg", {
                viewBox: `0 0 ${RING_SIZE} ${RING_SIZE}`,
                class: "sr-gauge__svg"
              }, [
                _cache[10] || (_cache[10] = createBaseVNode("defs", null, [
                  createBaseVNode("linearGradient", {
                    id: "srRingSign",
                    x1: "0%",
                    y1: "0%",
                    x2: "100%",
                    y2: "100%"
                  }, [
                    createBaseVNode("stop", {
                      offset: "0%",
                      "stop-color": "#34D399"
                    }),
                    createBaseVNode("stop", {
                      offset: "100%",
                      "stop-color": "#10B981"
                    })
                  ])
                ], -1)),
                createBaseVNode("circle", {
                  cx: RING_SIZE / 2,
                  cy: RING_SIZE / 2,
                  r: RING_RADIUS,
                  fill: "none",
                  stroke: "var(--md-sys-color-surface-variant, #F1F5F9)",
                  "stroke-width": 12,
                  "stroke-linecap": "round"
                }, null, 8, _hoisted_54$1),
                createBaseVNode("circle", {
                  class: "sr-gauge__arc",
                  cx: RING_SIZE / 2,
                  cy: RING_SIZE / 2,
                  r: RING_RADIUS,
                  fill: "none",
                  stroke: "url(#srRingSign)",
                  "stroke-width": 13,
                  "stroke-linecap": "round",
                  "stroke-dasharray": RING_CIRC,
                  "stroke-dashoffset": ringOffset(shown("sign", signRate.value))
                }, null, 8, _hoisted_55$1)
              ], 8, _hoisted_53$1)),
              createBaseVNode("div", _hoisted_56$1, [
                createBaseVNode("strong", null, toDisplayString(shown("sign", signRate.value).toFixed(1)) + "%", 1),
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.study.sign.rate")), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_57$1, [
              createBaseVNode("span", _hoisted_58$1, [
                _cache[11] || (_cache[11] = createBaseVNode("i", null, null, -1)),
                createTextVNode(toDisplayString(unref(tf)("chaoxing.study.sign.total", { n: num(payloadOf("sign").allCount) })), 1)
              ]),
              createBaseVNode("span", _hoisted_59$1, toDisplayString(unref(tf)("chaoxing.study.sign.overdueCount", { n: num(payloadOf("sign").overdueCount) })), 1)
            ])
          ]),
          createBaseVNode("section", _hoisted_60$1, [
            createBaseVNode("div", _hoisted_61$1, [
              createBaseVNode("h3", null, toDisplayString(unref(t)("chaoxing.study.sign.distribution")), 1)
            ]),
            num(payloadOf("sign").allCount) === 0 ? (openBlock(), createElementBlock("p", _hoisted_62$1, toDisplayString(unref(t)("chaoxing.study.sign.empty")), 1)) : (openBlock(), createElementBlock("div", _hoisted_63$1, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(signBuckets.value, (bucket) => {
                return openBlock(), createElementBlock("div", {
                  key: bucket.key,
                  class: "sr-dist__row"
                }, [
                  createBaseVNode("span", _hoisted_64$1, toDisplayString(bucket.label), 1),
                  createBaseVNode("i", _hoisted_65$1, [
                    createBaseVNode("b", {
                      class: normalizeClass(`is-${bucket.tone}`),
                      style: normalizeStyle({ width: bucket.value / signMax.value * 100 + "%" })
                    }, null, 6)
                  ]),
                  createBaseVNode("span", _hoisted_66$1, toDisplayString(bucket.value), 1)
                ]);
              }), 128))
            ]))
          ])
        ], 64)) : activeTab.value === "work" ? (openBlock(), createElementBlock(Fragment, { key: 4 }, [
          createBaseVNode("section", _hoisted_67$1, [
            createBaseVNode("article", _hoisted_68$1, [
              createBaseVNode("div", _hoisted_69$1, [
                _cache[12] || (_cache[12] = createBaseVNode("span", { class: "sr-metric__icon is-blue" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "assignment_turned_in")
                ], -1)),
                createBaseVNode("span", _hoisted_70$1, toDisplayString(num(workSummary.value.percent).toFixed(0)) + "%", 1)
              ]),
              createBaseVNode("strong", _hoisted_71$1, toDisplayString(num(workSummary.value.done)) + "/" + toDisplayString(num(workSummary.value.total)), 1),
              createBaseVNode("span", _hoisted_72$1, toDisplayString(unref(t)("chaoxing.study.work.done")), 1),
              createBaseVNode("i", _hoisted_73$1, [
                createBaseVNode("b", {
                  class: "is-blue",
                  style: normalizeStyle({ width: num(workSummary.value.percent) + "%" })
                }, null, 4)
              ])
            ]),
            createBaseVNode("article", _hoisted_74$1, [
              _cache[13] || (_cache[13] = createBaseVNode("div", { class: "sr-metric__top" }, [
                createBaseVNode("span", { class: "sr-metric__icon is-indigo" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "percent")
                ])
              ], -1)),
              createBaseVNode("strong", _hoisted_75$1, toDisplayString(num(workSummary.value.percent).toFixed(0)) + "%", 1),
              createBaseVNode("span", _hoisted_76$1, toDisplayString(unref(t)("chaoxing.study.work.rate")), 1),
              createBaseVNode("i", _hoisted_77$1, [
                createBaseVNode("b", {
                  class: "is-indigo",
                  style: normalizeStyle({ width: num(workSummary.value.percent) + "%" })
                }, null, 4)
              ])
            ]),
            createBaseVNode("article", _hoisted_78$1, [
              _cache[14] || (_cache[14] = createBaseVNode("div", { class: "sr-metric__top" }, [
                createBaseVNode("span", { class: "sr-metric__icon is-amber" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "star")
                ])
              ], -1)),
              createBaseVNode("strong", _hoisted_79$1, toDisplayString(num(workSummary.value.average_score)), 1),
              createBaseVNode("span", _hoisted_80$1, toDisplayString(unref(t)("chaoxing.study.work.average")), 1),
              _cache[15] || (_cache[15] = createBaseVNode("i", { class: "sr-metric__bar" }, [
                createBaseVNode("b", {
                  class: "is-amber",
                  style: { "width": "100%" }
                })
              ], -1))
            ])
          ]),
          createBaseVNode("section", _hoisted_81$1, [
            createBaseVNode("div", _hoisted_82$1, [
              createBaseVNode("h3", null, toDisplayString(unref(t)("chaoxing.study.work.overdue")), 1),
              createBaseVNode("span", _hoisted_83$1, toDisplayString(behindTasks.value.length), 1)
            ]),
            !behindTasks.value.length ? (openBlock(), createElementBlock("p", _hoisted_84$1, toDisplayString(unref(t)("chaoxing.study.work.noOverdue")), 1)) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(behindTasks.value, (item) => {
              return openBlock(), createElementBlock("button", {
                key: String(item.id),
                type: "button",
                class: "sr-row",
                onClick: ($event) => emit("open-official", item)
              }, [
                createBaseVNode("span", _hoisted_86$1, [
                  createBaseVNode("strong", null, toDisplayString(item.name), 1),
                  createBaseVNode("small", null, toDisplayString(item.chapterName || item.endDate || ""), 1)
                ]),
                _cache[16] || (_cache[16] = createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_right", -1))
              ], 8, _hoisted_85$1);
            }), 128))
          ]),
          createBaseVNode("section", _hoisted_87$1, [
            createBaseVNode("div", _hoisted_88$1, [
              createBaseVNode("h3", null, toDisplayString(unref(t)("chaoxing.study.work.thisWeek")), 1),
              createBaseVNode("span", _hoisted_89$1, toDisplayString(weekTasks.value.length), 1)
            ]),
            !weekTasks.value.length ? (openBlock(), createElementBlock("p", _hoisted_90$1, toDisplayString(unref(t)("chaoxing.study.work.noWeek")), 1)) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(weekTasks.value, (item) => {
              return openBlock(), createElementBlock("button", {
                key: String(item.id),
                type: "button",
                class: "sr-row",
                onClick: ($event) => emit("open-official", item)
              }, [
                createBaseVNode("span", _hoisted_92$1, [
                  createBaseVNode("strong", null, toDisplayString(item.name), 1),
                  createBaseVNode("small", null, toDisplayString(item.endTimeStr || ""), 1)
                ]),
                _cache[17] || (_cache[17] = createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_right", -1))
              ], 8, _hoisted_91$1);
            }), 128))
          ])
        ], 64)) : activeTab.value === "test" ? (openBlock(), createElementBlock(Fragment, { key: 5 }, [
          createBaseVNode("section", _hoisted_93$1, [
            createBaseVNode("div", _hoisted_94$1, [
              (openBlock(), createElementBlock("svg", {
                viewBox: `0 0 ${RING_SIZE} ${RING_SIZE}`,
                class: "sr-gauge__svg"
              }, [
                _cache[18] || (_cache[18] = createBaseVNode("defs", null, [
                  createBaseVNode("linearGradient", {
                    id: "srRingTest",
                    x1: "0%",
                    y1: "0%",
                    x2: "100%",
                    y2: "100%"
                  }, [
                    createBaseVNode("stop", {
                      offset: "0%",
                      "stop-color": "#818CF8"
                    }),
                    createBaseVNode("stop", {
                      offset: "100%",
                      "stop-color": "#4F46E5"
                    })
                  ])
                ], -1)),
                createBaseVNode("circle", {
                  cx: RING_SIZE / 2,
                  cy: RING_SIZE / 2,
                  r: RING_RADIUS,
                  fill: "none",
                  stroke: "var(--md-sys-color-surface-variant, #F1F5F9)",
                  "stroke-width": 12,
                  "stroke-linecap": "round"
                }, null, 8, _hoisted_96$1),
                createBaseVNode("circle", {
                  class: "sr-gauge__arc",
                  cx: RING_SIZE / 2,
                  cy: RING_SIZE / 2,
                  r: RING_RADIUS,
                  fill: "none",
                  stroke: "url(#srRingTest)",
                  "stroke-width": 13,
                  "stroke-linecap": "round",
                  "stroke-dasharray": RING_CIRC,
                  "stroke-dashoffset": ringOffset(testRate.value)
                }, null, 8, _hoisted_97$1)
              ], 8, _hoisted_95$1)),
              createBaseVNode("div", _hoisted_98$1, [
                createBaseVNode("strong", null, toDisplayString(testRate.value.toFixed(1)) + "%", 1),
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.study.test.rate")), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_99$1, [
              createBaseVNode("span", _hoisted_100$1, [
                _cache[19] || (_cache[19] = createBaseVNode("i", null, null, -1)),
                createTextVNode(toDisplayString(unref(tf)("chaoxing.study.test.done", { a: num(payloadOf("test").testNum), b: num(payloadOf("test").totalJob) })), 1)
              ]),
              createBaseVNode("span", _hoisted_101$1, toDisplayString(unref(tf)("chaoxing.study.test.avg", { n: num(payloadOf("test").testAvgScore) })), 1)
            ])
          ]),
          createBaseVNode("section", _hoisted_102$1, [
            createBaseVNode("article", _hoisted_103$1, [
              _cache[20] || (_cache[20] = createBaseVNode("div", { class: "sr-metric__top" }, [
                createBaseVNode("span", { class: "sr-metric__icon is-indigo" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "task_alt")
                ])
              ], -1)),
              createBaseVNode("strong", _hoisted_104$1, toDisplayString(num(payloadOf("test").testNum)) + "/" + toDisplayString(num(payloadOf("test").totalJob)), 1),
              createBaseVNode("span", _hoisted_105$1, toDisplayString(unref(t)("chaoxing.study.test.doneLabel")), 1),
              createBaseVNode("i", _hoisted_106$1, [
                createBaseVNode("b", {
                  class: "is-indigo",
                  style: normalizeStyle({ width: testRate.value + "%" })
                }, null, 4)
              ])
            ]),
            createBaseVNode("article", _hoisted_107$1, [
              _cache[21] || (_cache[21] = createBaseVNode("div", { class: "sr-metric__top" }, [
                createBaseVNode("span", { class: "sr-metric__icon is-amber" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "grade")
                ])
              ], -1)),
              createBaseVNode("strong", _hoisted_108$1, toDisplayString(num(payloadOf("test").testAvgScore)), 1),
              createBaseVNode("span", _hoisted_109$1, toDisplayString(unref(t)("chaoxing.study.test.avgLabel")), 1),
              _cache[22] || (_cache[22] = createBaseVNode("i", { class: "sr-metric__bar" }, [
                createBaseVNode("b", {
                  class: "is-amber",
                  style: { "width": "100%" }
                })
              ], -1))
            ]),
            createBaseVNode("article", _hoisted_110$1, [
              createBaseVNode("div", _hoisted_111$1, [
                _cache[23] || (_cache[23] = createBaseVNode("span", { class: "sr-metric__icon is-emerald" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "play_lesson")
                ], -1)),
                num(videoTestData.value.count) > 0 ? (openBlock(), createElementBlock("span", _hoisted_112$1, toDisplayString(pct(videoTestData.value.finishPer).toFixed(0)) + "% ", 1)) : (openBlock(), createElementBlock("span", _hoisted_113$1, toDisplayString(unref(t)("chaoxing.study.badge.none")), 1))
              ]),
              createBaseVNode("strong", _hoisted_114$1, toDisplayString(num(videoTestData.value.count) > 0 ? `${num(videoTestData.value.finishCount)}/${num(videoTestData.value.count)}` : "—"), 1),
              createBaseVNode("span", _hoisted_115$1, toDisplayString(unref(t)("chaoxing.study.test.video")), 1),
              createBaseVNode("i", _hoisted_116$1, [
                createBaseVNode("b", {
                  class: "is-emerald",
                  style: normalizeStyle({ width: pct(videoTestData.value.finishPer) + "%" })
                }, null, 4)
              ])
            ]),
            createBaseVNode("article", _hoisted_117$1, [
              createBaseVNode("div", _hoisted_118$1, [
                _cache[24] || (_cache[24] = createBaseVNode("span", { class: "sr-metric__icon is-rose" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "history_edu")
                ], -1)),
                createBaseVNode("span", {
                  class: normalizeClass(["sr-metric__badge", num(examSummary.value.percent) >= 100 ? "is-emerald" : "is-muted"])
                }, toDisplayString(num(examSummary.value.percent).toFixed(0)) + "% ", 3)
              ]),
              createBaseVNode("strong", _hoisted_119$1, toDisplayString(num(examSummary.value.done)) + "/" + toDisplayString(num(examSummary.value.total)), 1),
              createBaseVNode("span", _hoisted_120$1, toDisplayString(unref(t)("chaoxing.study.test.examDone")), 1),
              createBaseVNode("i", _hoisted_121$1, [
                createBaseVNode("b", {
                  class: "is-rose",
                  style: normalizeStyle({ width: num(examSummary.value.percent) + "%" })
                }, null, 4)
              ])
            ])
          ])
        ], 64)) : activeTab.value === "video" ? (openBlock(), createElementBlock(Fragment, { key: 6 }, [
          createBaseVNode("section", _hoisted_122$1, [
            createBaseVNode("div", _hoisted_123$1, [
              (openBlock(), createElementBlock("svg", {
                viewBox: `0 0 ${RING_SIZE} ${RING_SIZE}`,
                class: "sr-gauge__svg"
              }, [
                _cache[25] || (_cache[25] = createBaseVNode("defs", null, [
                  createBaseVNode("linearGradient", {
                    id: "srRingVideo",
                    x1: "0%",
                    y1: "0%",
                    x2: "100%",
                    y2: "100%"
                  }, [
                    createBaseVNode("stop", {
                      offset: "0%",
                      "stop-color": "#34D399"
                    }),
                    createBaseVNode("stop", {
                      offset: "100%",
                      "stop-color": "#059669"
                    })
                  ])
                ], -1)),
                createBaseVNode("circle", {
                  cx: RING_SIZE / 2,
                  cy: RING_SIZE / 2,
                  r: RING_RADIUS,
                  fill: "none",
                  stroke: "var(--md-sys-color-surface-variant, #F1F5F9)",
                  "stroke-width": 12,
                  "stroke-linecap": "round"
                }, null, 8, _hoisted_125$1),
                createBaseVNode("circle", {
                  class: "sr-gauge__arc",
                  cx: RING_SIZE / 2,
                  cy: RING_SIZE / 2,
                  r: RING_RADIUS,
                  fill: "none",
                  stroke: "url(#srRingVideo)",
                  "stroke-width": 13,
                  "stroke-linecap": "round",
                  "stroke-dasharray": RING_CIRC,
                  "stroke-dashoffset": ringOffset(videoWatchRate.value)
                }, null, 8, _hoisted_126$1)
              ], 8, _hoisted_124$1)),
              createBaseVNode("div", _hoisted_127$1, [
                createBaseVNode("strong", null, toDisplayString(videoWatchRate.value.toFixed(1)) + "%", 1),
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.study.video.rate")), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_128$1, [
              createBaseVNode("span", _hoisted_129$1, [
                _cache[26] || (_cache[26] = createBaseVNode("i", null, null, -1)),
                createTextVNode(toDisplayString(unref(tf)("chaoxing.study.video.watchedLine", { a: watchedMinutes.value, b: totalMinutes.value })), 1)
              ]),
              createBaseVNode("span", _hoisted_130$1, toDisplayString(unref(tf)("chaoxing.study.video.readLine", { n: readMinutes.value })), 1)
            ])
          ]),
          createBaseVNode("section", _hoisted_131$1, [
            createBaseVNode("article", _hoisted_132$1, [
              createBaseVNode("div", _hoisted_133$1, [
                _cache[27] || (_cache[27] = createBaseVNode("span", { class: "sr-metric__icon is-emerald" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "smart_display")
                ], -1)),
                createBaseVNode("span", _hoisted_134$1, toDisplayString(videoWatchRate.value.toFixed(0)) + "%", 1)
              ]),
              createBaseVNode("strong", _hoisted_135$1, [
                createTextVNode(toDisplayString(watchedMinutes.value) + " ", 1),
                createBaseVNode("small", null, toDisplayString(unref(t)("chaoxing.study.video.minuteUnit")), 1)
              ]),
              createBaseVNode("span", _hoisted_136$1, toDisplayString(unref(t)("chaoxing.study.video.watched")), 1),
              createBaseVNode("i", _hoisted_137$1, [
                createBaseVNode("b", {
                  class: "is-emerald",
                  style: normalizeStyle({ width: videoWatchRate.value + "%" })
                }, null, 4)
              ])
            ]),
            createBaseVNode("article", _hoisted_138$1, [
              _cache[28] || (_cache[28] = createBaseVNode("div", { class: "sr-metric__top" }, [
                createBaseVNode("span", { class: "sr-metric__icon is-sky" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "schedule")
                ])
              ], -1)),
              createBaseVNode("strong", _hoisted_139$1, [
                createTextVNode(toDisplayString(totalMinutes.value) + " ", 1),
                createBaseVNode("small", null, toDisplayString(unref(t)("chaoxing.study.video.minuteUnit")), 1)
              ]),
              createBaseVNode("span", _hoisted_140, toDisplayString(unref(t)("chaoxing.study.video.total")), 1)
            ]),
            createBaseVNode("article", _hoisted_141, [
              createBaseVNode("div", _hoisted_142, [
                _cache[29] || (_cache[29] = createBaseVNode("span", { class: "sr-metric__icon is-indigo" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "menu_book")
                ], -1)),
                createBaseVNode("span", _hoisted_143, toDisplayString(num(taskSummary.value.read_required_minutes)) + " " + toDisplayString(unref(t)("chaoxing.study.video.minuteUnit")), 1)
              ]),
              createBaseVNode("strong", _hoisted_144, [
                createTextVNode(toDisplayString(readMinutes.value) + " ", 1),
                createBaseVNode("small", null, toDisplayString(unref(t)("chaoxing.study.video.minuteUnit")), 1)
              ]),
              createBaseVNode("span", _hoisted_145, toDisplayString(unref(t)("chaoxing.study.video.read")), 1)
            ]),
            createBaseVNode("article", _hoisted_146, [
              createBaseVNode("div", _hoisted_147, [
                _cache[30] || (_cache[30] = createBaseVNode("span", { class: "sr-metric__icon is-amber" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "task_alt")
                ], -1)),
                createBaseVNode("span", {
                  class: normalizeClass(["sr-metric__badge", taskPercent.value >= 70 ? "is-emerald" : "is-muted"])
                }, toDisplayString(taskPercent.value.toFixed(0)) + "%", 3)
              ]),
              createBaseVNode("strong", _hoisted_148, toDisplayString(taskDone.value) + "/" + toDisplayString(taskTotal.value), 1),
              createBaseVNode("span", _hoisted_149, toDisplayString(unref(t)("chaoxing.study.video.taskPoints")), 1),
              createBaseVNode("i", _hoisted_150, [
                createBaseVNode("b", {
                  class: "is-amber",
                  style: normalizeStyle({ width: taskPercent.value + "%" })
                }, null, 4)
              ])
            ]),
            createBaseVNode("article", _hoisted_151, [
              createBaseVNode("div", _hoisted_152, [
                _cache[31] || (_cache[31] = createBaseVNode("span", { class: "sr-metric__icon is-blue" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "grade")
                ], -1)),
                createBaseVNode("span", _hoisted_153, toDisplayString(videoRate.value.toFixed(0)) + "%", 1)
              ]),
              createBaseVNode("strong", _hoisted_154, toDisplayString(videoScore.value) + "/" + toDisplayString(videoWeight.value), 1),
              createBaseVNode("span", _hoisted_155, toDisplayString(unref(t)("chaoxing.study.video.score")), 1),
              createBaseVNode("i", _hoisted_156, [
                createBaseVNode("b", {
                  class: "is-blue",
                  style: normalizeStyle({ width: videoRate.value + "%" })
                }, null, 4)
              ])
            ]),
            createBaseVNode("article", _hoisted_157, [
              createBaseVNode("div", _hoisted_158, [
                _cache[32] || (_cache[32] = createBaseVNode("span", { class: "sr-metric__icon is-violet" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "play_lesson")
                ], -1)),
                num(videoTestData.value.count) > 0 ? (openBlock(), createElementBlock("span", _hoisted_159, toDisplayString(pct(videoTestData.value.finishPer).toFixed(0)) + "%", 1)) : (openBlock(), createElementBlock("span", _hoisted_160, toDisplayString(unref(t)("chaoxing.study.badge.none")), 1))
              ]),
              createBaseVNode("strong", _hoisted_161, toDisplayString(num(videoTestData.value.count) > 0 ? `${num(videoTestData.value.finishCount)}/${num(videoTestData.value.count)}` : "—"), 1),
              createBaseVNode("span", _hoisted_162, toDisplayString(unref(t)("chaoxing.study.video.videoTest")), 1),
              createBaseVNode("i", _hoisted_163, [
                createBaseVNode("b", {
                  class: "is-violet",
                  style: normalizeStyle({ width: pct(videoTestData.value.finishPer) + "%" })
                }, null, 4)
              ])
            ]),
            createBaseVNode("article", _hoisted_164, [
              _cache[33] || (_cache[33] = createBaseVNode("div", { class: "sr-metric__top" }, [
                createBaseVNode("span", { class: "sr-metric__icon is-teal" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "stars")
                ])
              ], -1)),
              createBaseVNode("strong", _hoisted_165, toDisplayString(num(pointData.value.ponits)) + "/" + toDisplayString(num(pointData.value.activeLimit)), 1),
              createBaseVNode("span", _hoisted_166, toDisplayString(unref(t)("chaoxing.study.video.points")), 1),
              createBaseVNode("i", _hoisted_167, [
                createBaseVNode("b", {
                  class: "is-teal",
                  style: normalizeStyle({ width: Math.min(100, num(pointData.value.ponits) / Math.max(1, num(pointData.value.activeLimit)) * 100) + "%" })
                }, null, 4)
              ])
            ])
          ]),
          createBaseVNode("section", _hoisted_168, [
            createBaseVNode("div", _hoisted_169, [
              createBaseVNode("h3", null, toDisplayString(unref(t)("chaoxing.study.video.liveSection")), 1),
              createBaseVNode("span", _hoisted_170, toDisplayString(hasLiveData.value ? unref(t)("chaoxing.study.badge.done") : unref(t)("chaoxing.study.badge.none")), 1)
            ]),
            !hasLiveData.value ? (openBlock(), createElementBlock("p", _hoisted_171, toDisplayString(unref(t)("chaoxing.study.video.noLive")), 1)) : (openBlock(), createElementBlock("div", _hoisted_172, [
              createBaseVNode("div", _hoisted_173, [
                createBaseVNode("span", _hoisted_174, toDisplayString(unref(t)("chaoxing.study.video.live")), 1),
                createBaseVNode("span", _hoisted_175, toDisplayString(num(liveData.value.livingTime)), 1)
              ]),
              createBaseVNode("div", _hoisted_176, [
                createBaseVNode("span", _hoisted_177, toDisplayString(unref(t)("chaoxing.study.video.playback")), 1),
                createBaseVNode("span", _hoisted_178, toDisplayString(num(liveData.value.playbackTime)), 1)
              ]),
              createBaseVNode("div", _hoisted_179, [
                createBaseVNode("span", _hoisted_180, toDisplayString(unref(t)("chaoxing.study.video.watch")), 1),
                createBaseVNode("span", _hoisted_181, toDisplayString(num(cxclassData.value.watchTimeMinutes)), 1)
              ]),
              createBaseVNode("div", _hoisted_182, [
                createBaseVNode("span", _hoisted_183, toDisplayString(unref(t)("chaoxing.study.video.lookback")), 1),
                createBaseVNode("span", _hoisted_184, toDisplayString(num(cxclassData.value.lookBackTime)), 1)
              ])
            ]))
          ])
        ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 7 }, [
          createBaseVNode("section", _hoisted_185, [
            createBaseVNode("article", _hoisted_186, [
              createBaseVNode("div", _hoisted_187, [
                _cache[34] || (_cache[34] = createBaseVNode("span", { class: "sr-metric__icon is-violet" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "psychology")
                ], -1)),
                createBaseVNode("span", _hoisted_188, toDisplayString(pct(aiData.value.aiEvaluatePer).toFixed(0)) + "%", 1)
              ]),
              createBaseVNode("strong", _hoisted_189, toDisplayString(pct(aiData.value.aiEvaluatePer).toFixed(0)) + "%", 1),
              createBaseVNode("span", _hoisted_190, toDisplayString(unref(t)("chaoxing.study.other.ai")), 1),
              createBaseVNode("i", _hoisted_191, [
                createBaseVNode("b", {
                  class: "is-violet",
                  style: normalizeStyle({ width: pct(aiData.value.aiEvaluatePer) + "%" })
                }, null, 4)
              ])
            ]),
            createBaseVNode("article", _hoisted_192, [
              _cache[35] || (_cache[35] = createBaseVNode("div", { class: "sr-metric__top" }, [
                createBaseVNode("span", { class: "sr-metric__icon is-emerald" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "task_alt")
                ])
              ], -1)),
              createBaseVNode("strong", _hoisted_193, toDisplayString(num(aiData.value.aiEvaluateReachCount)), 1),
              createBaseVNode("span", _hoisted_194, toDisplayString(unref(t)("chaoxing.study.other.aiReach")), 1)
            ]),
            createBaseVNode("article", _hoisted_195, [
              _cache[36] || (_cache[36] = createBaseVNode("div", { class: "sr-metric__top" }, [
                createBaseVNode("span", { class: "sr-metric__icon is-blue" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "edit_note")
                ])
              ], -1)),
              createBaseVNode("strong", _hoisted_196, toDisplayString(num(aiData.value.practiceCount)), 1),
              createBaseVNode("span", _hoisted_197, toDisplayString(unref(t)("chaoxing.study.other.practice")), 1)
            ])
          ]),
          createBaseVNode("section", _hoisted_198, [
            createBaseVNode("div", _hoisted_199, [
              createBaseVNode("h3", null, toDisplayString(unref(t)("chaoxing.study.other.near")), 1),
              createBaseVNode("span", _hoisted_200, toDisplayString(nearTasks.value.length), 1)
            ]),
            !nearTasks.value.length ? (openBlock(), createElementBlock("p", _hoisted_201, toDisplayString(unref(t)("chaoxing.study.other.noNear")), 1)) : createCommentVNode("", true),
            (openBlock(true), createElementBlock(Fragment, null, renderList(nearTasks.value, (item) => {
              return openBlock(), createElementBlock("button", {
                key: String(item.id),
                type: "button",
                class: "sr-row",
                onClick: ($event) => emit("open-official", item)
              }, [
                createBaseVNode("span", _hoisted_203, [
                  createBaseVNode("strong", null, toDisplayString(item.name), 1),
                  createBaseVNode("small", null, toDisplayString(item.endDate || item.endTimeStr || ""), 1)
                ]),
                _cache[37] || (_cache[37] = createBaseVNode("span", { class: "material-symbols-outlined" }, "chevron_right", -1))
              ], 8, _hoisted_202);
            }), 128))
          ])
        ], 64)),
        activeTab.value === "overview" || activeTab.value === "sign" ? (openBlock(), createElementBlock("footer", _hoisted_204, [
          createBaseVNode("div", _hoisted_205, [
            createBaseVNode("h4", null, toDisplayString(unref(t)("chaoxing.study.cta.title")), 1),
            createBaseVNode("p", null, toDisplayString(unref(tf)("chaoxing.study.cta.desc", { n: signRate.value.toFixed(0) })), 1)
          ]),
          createBaseVNode("button", {
            type: "button",
            class: "sr-cta__btn",
            onClick: _cache[2] || (_cache[2] = ($event) => emit("open-official", null))
          }, toDisplayString(unref(t)("chaoxing.tasks.openChaoxing")), 1)
        ])) : createCommentVNode("", true),
        createBaseVNode("p", _hoisted_206, toDisplayString(unref(t)("chaoxing.study.footnote")), 1)
      ]);
    };
  }
});
const ChaoxingStudyRecord = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-223447fd"]]);
const emptyStats = () => ({
  pending_work: 0,
  pending_exam: 0,
  overdue: 0,
  due_within_3d: 0,
  finished_work: 0
});
const useChaoxingTasks = (core) => {
  const works = ref([]);
  const exams = ref([]);
  const workStats = ref(emptyStats());
  const examStats = ref(emptyStats());
  const nearestWork = ref(null);
  const nearestExam = ref(null);
  const tasksLoading = ref(false);
  const tasksError = ref("");
  const tasksLoaded = ref(false);
  const loadTasks = async ({ force = false } = {}) => {
    if (tasksLoading.value) return;
    tasksLoading.value = true;
    tasksError.value = "";
    try {
      const workRes = await core.cxInvoke("chaoxing_fetch_works_all_courses", { force });
      if (workRes?.success === false) throw new Error(workRes?.error || "作业清单加载失败");
      works.value = Array.isArray(workRes?.items) ? workRes.items : [];
      workStats.value = { ...emptyStats(), ...workRes?.stats || {} };
      nearestWork.value = workRes?.nearest || null;
      const examRes = await core.cxInvoke("chaoxing_fetch_exams_all_courses", { force });
      if (examRes?.success === false) throw new Error(examRes?.error || "考试清单加载失败");
      exams.value = Array.isArray(examRes?.items) ? examRes.items : [];
      examStats.value = { ...emptyStats(), ...examRes?.stats || {} };
      nearestExam.value = examRes?.nearest || null;
      tasksLoaded.value = true;
      const stale = Boolean(workRes?.cache_stale || examRes?.cache_stale);
      if (stale && !force) {
        window.setTimeout(() => {
          void loadTasks({ force: true });
        }, 600);
      }
    } catch (e) {
      tasksError.value = String(e?.message || e || "清单加载失败");
    } finally {
      tasksLoading.value = false;
    }
  };
  const openWorkList = () => {
    core.push({ level: "workList" });
    if (!tasksLoaded.value) void loadTasks();
  };
  const openExamList = () => {
    core.push({ level: "examList" });
    if (!tasksLoaded.value) void loadTasks();
  };
  const resolveTaskUrl = async (item) => {
    try {
      const res = await core.cxInvoke("chaoxing_resolve_task_url", {
        courseId: item.course_id,
        clazzId: item.clazz_id,
        cpi: item.cpi || "",
        name: item.course || "",
        semester: item.semester || "",
        taskId: item.id,
        eventType: item.event_type
      });
      if (res?.success && typeof res.url === "string" && res.url) return res.url;
    } catch {
    }
    return item.url || "";
  };
  return {
    works,
    exams,
    workStats,
    examStats,
    nearestWork,
    nearestExam,
    tasksLoading,
    tasksError,
    tasksLoaded,
    loadTasks,
    openWorkList,
    openExamList,
    resolveTaskUrl
  };
};
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
const toVideoProxyUrl = async (u, isTauri) => {
  if (!u || !u.startsWith("http")) return u;
  if (!isTauri) return u;
  const { buildMediaCapabilityUrl } = await __vitePreload(async () => {
    const { buildMediaCapabilityUrl: buildMediaCapabilityUrl2 } = await import("./bridge_media_capability-BOSFLc-q.js");
    return { buildMediaCapabilityUrl: buildMediaCapabilityUrl2 };
  }, true ? __vite__mapDeps([0,1,2,3,4,5,6,7]) : void 0, import.meta.url);
  return buildMediaCapabilityUrl(u);
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
      else if (frame.level === "workList") items.push({ key: "workList", label: "作业" });
      else if (frame.level === "examList") items.push({ key: "examList", label: "考试" });
      else if (frame.level === "study") items.push({ key: "study", label: "学习记录" });
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
    if (c.level === "workList") return "我的作业";
    if (c.level === "examList") return "我的考试";
    if (c.level === "study") return "学习记录";
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
const STALE_LIST_MS = 30 * 60 * 1e3;
const useChaoxingCourseList = (core) => {
  const courses = ref([]);
  const semesterTabs = ref(["全部"]);
  const activeSemester = ref("全部");
  const searchQuery = ref("");
  const statusMeta = ref({});
  const listOffline = ref(false);
  const listSyncTime = ref("");
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
      listOffline.value = !!courseRes?.offline;
      listSyncTime.value = String(courseRes?.sync_time || "");
      if (!doForce && courseRes?.cached) {
        const cachedAt = Date.parse(listSyncTime.value);
        if (Number.isFinite(cachedAt) && Date.now() - cachedAt > STALE_LIST_MS) {
          pushDebugLog("ChaoxingHub", "课程缓存已过期，后台静默刷新", "info");
          window.setTimeout(() => {
            if (!core.mutable.disposed) void loadList({ silent: true, force: true });
          }, 300);
        }
      }
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
    listOffline,
    listSyncTime,
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
      const playUrls = await Promise.all(
        collectPlayUrls(st, res || {}).map((u) => toVideoProxyUrl(u, isTauriRuntime()))
      );
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
  class: "offline-banner",
  role: "status"
};
const _hoisted_15 = {
  key: 2,
  class: "hint"
};
const _hoisted_16 = { class: "quick-entries" };
const _hoisted_17 = { class: "quick-card__body" };
const _hoisted_18 = { key: 0 };
const _hoisted_19 = { key: 1 };
const _hoisted_20 = { key: 2 };
const _hoisted_21 = { class: "quick-card__body" };
const _hoisted_22 = { key: 0 };
const _hoisted_23 = { key: 1 };
const _hoisted_24 = { key: 2 };
const _hoisted_25 = {
  key: 0,
  class: "sem-scroll",
  role: "tablist"
};
const _hoisted_26 = ["aria-selected", "onClick"];
const _hoisted_27 = { class: "search-wrap" };
const _hoisted_28 = ["placeholder"];
const _hoisted_29 = ["onClick"];
const _hoisted_30 = { class: "cover" };
const _hoisted_31 = ["src"];
const _hoisted_32 = { class: "row-main" };
const _hoisted_33 = {
  key: 0,
  class: "sem-tag"
};
const _hoisted_34 = { class: "mini-bar" };
const _hoisted_35 = { class: "row-main" };
const _hoisted_36 = { class: "panel task-head" };
const _hoisted_37 = { class: "task-stats" };
const _hoisted_38 = { class: "btn-row" };
const _hoisted_39 = ["disabled"];
const _hoisted_40 = { class: "section-head" };
const _hoisted_41 = { class: "section-head__title" };
const _hoisted_42 = { class: "section-head__count" };
const _hoisted_43 = ["onClick"];
const _hoisted_44 = { class: "task-card__top" };
const _hoisted_45 = {
  key: 0,
  class: "task-badge"
};
const _hoisted_46 = { class: "task-card__course" };
const _hoisted_47 = { class: "task-card__meta" };
const _hoisted_48 = { key: 0 };
const _hoisted_49 = { key: 1 };
const _hoisted_50 = { class: "panel notice-panel" };
const _hoisted_51 = { class: "panel task-head" };
const _hoisted_52 = { class: "task-stats" };
const _hoisted_53 = { class: "btn-row" };
const _hoisted_54 = ["disabled"];
const _hoisted_55 = { class: "section-head" };
const _hoisted_56 = { class: "section-head__title" };
const _hoisted_57 = { class: "section-head__count" };
const _hoisted_58 = ["onClick"];
const _hoisted_59 = { class: "task-card__top" };
const _hoisted_60 = {
  key: 0,
  class: "task-badge"
};
const _hoisted_61 = { class: "task-card__course" };
const _hoisted_62 = { class: "task-card__meta" };
const _hoisted_63 = { class: "panel notice-panel" };
const _hoisted_64 = { class: "panel course-head" };
const _hoisted_65 = { class: "course-head__top" };
const _hoisted_66 = { class: "course-head__meta" };
const _hoisted_67 = { class: "pill" };
const _hoisted_68 = { class: "btn-row" };
const _hoisted_69 = {
  key: 0,
  class: "hint"
};
const _hoisted_70 = { class: "section-head" };
const _hoisted_71 = { class: "section-head__title" };
const _hoisted_72 = { class: "section-head__count" };
const _hoisted_73 = { class: "menu-list" };
const _hoisted_74 = ["onClick"];
const _hoisted_75 = { class: "menu-item__rail" };
const _hoisted_76 = { class: "menu-item__num" };
const _hoisted_77 = {
  key: 0,
  class: "menu-item__line"
};
const _hoisted_78 = { class: "menu-item__body" };
const _hoisted_79 = { class: "menu-item__meta" };
const _hoisted_80 = { class: "dot" };
const _hoisted_81 = { class: "dot soft" };
const _hoisted_82 = { class: "panel soft-panel" };
const _hoisted_83 = { class: "pill slate" };
const _hoisted_84 = { class: "soft-panel__title" };
const _hoisted_85 = { class: "section-head" };
const _hoisted_86 = { class: "section-head__title" };
const _hoisted_87 = { class: "section-head__count" };
const _hoisted_88 = { class: "menu-list" };
const _hoisted_89 = ["onClick"];
const _hoisted_90 = { class: "material-symbols-outlined" };
const _hoisted_91 = { class: "menu-item__body" };
const _hoisted_92 = { class: "menu-item__meta" };
const _hoisted_93 = { class: "panel soft-panel" };
const _hoisted_94 = { class: "pill violet" };
const _hoisted_95 = { class: "soft-panel__title" };
const _hoisted_96 = { class: "hint" };
const _hoisted_97 = { class: "section-head" };
const _hoisted_98 = { class: "section-head__title" };
const _hoisted_99 = { class: "section-head__count" };
const _hoisted_100 = { class: "menu-list" };
const _hoisted_101 = ["onClick"];
const _hoisted_102 = { class: "material-symbols-outlined" };
const _hoisted_103 = { class: "menu-item__body" };
const _hoisted_104 = { class: "menu-item__meta" };
const _hoisted_105 = { class: "dot" };
const _hoisted_106 = { class: "material-symbols-outlined menu-item__chev accent" };
const _hoisted_107 = {
  key: 8,
  class: "panel score-panel"
};
const _hoisted_108 = { class: "score-total" };
const _hoisted_109 = {
  key: 0,
  class: "hint"
};
const _hoisted_110 = {
  key: 0,
  class: "pie-wrap"
};
const _hoisted_111 = { class: "pie-hole" };
const _hoisted_112 = { class: "pie-legend" };
const _hoisted_113 = {
  key: 1,
  class: "score-list"
};
const _hoisted_114 = {
  key: 2,
  class: "weight-grid"
};
const _hoisted_115 = { class: "wchip" };
const _hoisted_116 = { class: "wchip" };
const _hoisted_117 = { class: "wchip" };
const _hoisted_118 = { class: "wchip" };
const _hoisted_119 = {
  key: 3,
  class: "hint"
};
const _hoisted_120 = {
  key: 9,
  class: "panel video-panel"
};
const _hoisted_121 = { class: "crumb" };
const _hoisted_122 = { class: "video-title" };
const _hoisted_123 = {
  key: 0,
  class: "hint"
};
const _hoisted_124 = ["poster", "src"];
const _hoisted_125 = {
  key: 1,
  class: "video-err"
};
const _hoisted_126 = { class: "btn-row video-actions" };
const _hoisted_127 = { class: "hint" };
const _hoisted_128 = {
  key: 11,
  class: "panel video-panel"
};
const _hoisted_129 = { class: "crumb" };
const _hoisted_130 = { class: "video-title" };
const _hoisted_131 = { class: "hint" };
const _hoisted_132 = ["src", "title"];
const _hoisted_133 = {
  key: 1,
  class: "video-err"
};
const _hoisted_134 = { class: "btn-row video-actions" };
const _hoisted_135 = { class: "hint" };
const _hoisted_136 = { class: "notice-line" };
const _hoisted_137 = { class: "notice-line" };
const _hoisted_138 = {
  key: 0,
  class: "notice-line"
};
const _hoisted_139 = { class: "notice-warn" };
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
    const tasks = useChaoxingTasks(core);
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
      listOffline,
      listSyncTime,
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
    const {
      works,
      exams,
      workStats,
      examStats,
      nearestWork,
      nearestExam,
      tasksLoading,
      tasksError,
      tasksLoaded,
      loadTasks,
      openWorkList,
      openExamList,
      resolveTaskUrl
    } = tasks;
    const embedRef = ref(null);
    const embedTitle = ref("");
    const noticeItem = ref(null);
    const remainText = (item) => {
      const ms = item?.deadline_ms;
      if (!ms) return "";
      const diff = ms - Date.now();
      if (diff < 0) return t("chaoxing.tasks.expired");
      const days = Math.floor(diff / 864e5);
      if (days >= 1) return tFmt("chaoxing.tasks.remainDays", { n: days });
      const hours = Math.floor(diff / 36e5);
      if (hours >= 1) return tFmt("chaoxing.tasks.remainHours", { n: hours });
      return t("chaoxing.tasks.remainSoon");
    };
    const isUrgent = (item) => {
      const ms = item?.deadline_ms;
      if (!ms) return false;
      const diff = ms - Date.now();
      return diff > 0 && diff <= 3 * 864e5;
    };
    const openOfficial = async (item) => {
      const target = item || null;
      noticeItem.value = null;
      embedTitle.value = target?.course || t("chaoxing.tasks.chaoxing");
      const freshUrl = target ? await resolveTaskUrl(target) : "";
      await nextTick();
      await embedRef.value?.open(freshUrl || "https://mooc1.chaoxing.com");
    };
    const copyTaskTitle = async () => {
      const item = noticeItem.value;
      if (!item) return;
      try {
        await navigator.clipboard.writeText(item.name);
        showToast(t("chaoxing.tasks.copied"), "success");
      } catch {
        showToast(t("chaoxing.tasks.copyFailed"), "error");
      }
    };
    const studyRef = ref(null);
    const studyCourse = ref(null);
    const openStudyRecord = (course) => {
      studyCourse.value = course || current.value?.course || null;
      core.push({ level: "study" });
      nextTick(() => {
        if (studyRef.value && studyCourse.value) studyRef.value.bindCore(core);
      });
    };
    const openStudyTask = async (item) => {
      const url = String(item?.url || "");
      embedTitle.value = String(item?.name || "");
      await nextTick();
      await embedRef.value?.open(url || "https://mooc1.chaoxing.com");
    };
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
      window.setTimeout(() => {
        if (!tasksLoaded.value && !tasksLoading.value) void loadTasks();
      }, 1200);
    });
    onUnmounted(() => {
      core.dispose();
      window.removeEventListener("iosMemoryWarning", onIosMemoryWarning);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$3), {
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
            _cache[20] || (_cache[20] = createBaseVNode("span", { class: "material-symbols-outlined spin" }, "progress_activity", -1)),
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
              unref(listOffline) ? (openBlock(), createElementBlock("div", _hoisted_14, [
                _cache[21] || (_cache[21] = createBaseVNode("span", {
                  class: "material-symbols-outlined",
                  "aria-hidden": "true"
                }, "cloud_off", -1)),
                createTextVNode(" " + toDisplayString(tFmt("chaoxing.hub.offlineBanner", { time: unref(formatRelativeTime)(unref(listSyncTime)) })), 1)
              ])) : createCommentVNode("", true),
              unref(filteredCourses).length > unref(visibleCourses).length ? (openBlock(), createElementBlock("p", _hoisted_15, toDisplayString(tFmt("chaoxing.hub.shownProgress", { a: unref(visibleCourses).length, b: unref(filteredCourses).length })), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("section", _hoisted_16, [
              createBaseVNode("button", {
                type: "button",
                class: "quick-card work",
                onClick: _cache[1] || (_cache[1] = (...args) => unref(openWorkList) && unref(openWorkList)(...args))
              }, [
                _cache[22] || (_cache[22] = createBaseVNode("span", { class: "material-symbols-outlined quick-card__icon" }, "assignment", -1)),
                createBaseVNode("div", _hoisted_17, [
                  createBaseVNode("strong", null, toDisplayString(unref(t)("chaoxing.tasks.workEntry")), 1),
                  !unref(tasksLoaded) && unref(tasksLoading) ? (openBlock(), createElementBlock("p", _hoisted_18, toDisplayString(unref(t)("chaoxing.tasks.loading")), 1)) : unref(workStats).pending_work > 0 ? (openBlock(), createElementBlock("p", _hoisted_19, [
                    createTextVNode(toDisplayString(tFmt("chaoxing.tasks.pendingCount", { n: unref(workStats).pending_work })) + " ", 1),
                    unref(nearestWork) ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                      createTextVNode("· " + toDisplayString(tFmt("chaoxing.tasks.nearest", { d: unref(nearestWork).deadline_text })), 1)
                    ], 64)) : createCommentVNode("", true)
                  ])) : (openBlock(), createElementBlock("p", _hoisted_20, toDisplayString(unref(t)("chaoxing.tasks.noWork")), 1))
                ]),
                _cache[23] || (_cache[23] = createBaseVNode("span", { class: "material-symbols-outlined chev" }, "chevron_right", -1))
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "quick-card exam",
                onClick: _cache[2] || (_cache[2] = (...args) => unref(openExamList) && unref(openExamList)(...args))
              }, [
                _cache[24] || (_cache[24] = createBaseVNode("span", { class: "material-symbols-outlined quick-card__icon" }, "quiz", -1)),
                createBaseVNode("div", _hoisted_21, [
                  createBaseVNode("strong", null, toDisplayString(unref(t)("chaoxing.tasks.examEntry")), 1),
                  !unref(tasksLoaded) && unref(tasksLoading) ? (openBlock(), createElementBlock("p", _hoisted_22, toDisplayString(unref(t)("chaoxing.tasks.loading")), 1)) : unref(examStats).pending_exam > 0 ? (openBlock(), createElementBlock("p", _hoisted_23, [
                    createTextVNode(toDisplayString(tFmt("chaoxing.tasks.pendingExamCount", { n: unref(examStats).pending_exam })) + " ", 1),
                    unref(nearestExam) ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                      createTextVNode("· " + toDisplayString(tFmt("chaoxing.tasks.nearest", { d: unref(nearestExam).deadline_text })), 1)
                    ], 64)) : createCommentVNode("", true)
                  ])) : (openBlock(), createElementBlock("p", _hoisted_24, toDisplayString(unref(t)("chaoxing.tasks.noExam")), 1))
                ]),
                _cache[25] || (_cache[25] = createBaseVNode("span", { class: "material-symbols-outlined chev" }, "chevron_right", -1))
              ])
            ]),
            unref(semesterTabs).length > 1 ? (openBlock(), createElementBlock("div", _hoisted_25, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(semesterTabs), (sem) => {
                return openBlock(), createElementBlock("button", {
                  key: sem,
                  type: "button",
                  class: normalizeClass(["sem-chip", { active: unref(activeSemester) === sem }]),
                  role: "tab",
                  "aria-selected": unref(activeSemester) === sem,
                  onClick: ($event) => activeSemester.value = sem
                }, toDisplayString(sem), 11, _hoisted_26);
              }), 128))
            ])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_27, [
              _cache[26] || (_cache[26] = createBaseVNode("span", { class: "material-symbols-outlined" }, "search", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => isRef(searchQuery) ? searchQuery.value = $event : null),
                type: "search",
                placeholder: unref(t)("chaoxing.hub.searchPlaceholder")
              }, null, 8, _hoisted_28), [
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
                createBaseVNode("div", _hoisted_30, [
                  unref(shouldRenderRemoteCourseCovers) && c.imageUrl ? (openBlock(), createElementBlock("img", {
                    key: 0,
                    src: c.imageUrl,
                    alt: "",
                    loading: "lazy",
                    referrerpolicy: "no-referrer",
                    onError: _cache[4] || (_cache[4] = (...args) => unref(onCoverError) && unref(onCoverError)(...args))
                  }, null, 40, _hoisted_31)) : createCommentVNode("", true),
                  createBaseVNode("div", {
                    class: "cover-fb",
                    style: normalizeStyle(unref(shouldRenderRemoteCourseCovers) && c.imageUrl ? { display: "none" } : void 0)
                  }, [..._cache[27] || (_cache[27] = [
                    createBaseVNode("span", { class: "material-symbols-outlined" }, "menu_book", -1)
                  ])], 4)
                ]),
                createBaseVNode("div", _hoisted_32, [
                  createBaseVNode("strong", null, toDisplayString(c.title), 1),
                  createBaseVNode("p", null, [
                    c.semester ? (openBlock(), createElementBlock("span", _hoisted_33, toDisplayString(c.semester), 1)) : createCommentVNode("", true),
                    createTextVNode(" " + toDisplayString(c.teacher || unref(t)("chaoxing.hub.teacherMissing")), 1)
                  ]),
                  createBaseVNode("div", _hoisted_34, [
                    createBaseVNode("i", {
                      style: normalizeStyle({ width: Math.min(100, c.progressRate || 0) + "%" })
                    }, null, 4)
                  ])
                ]),
                _cache[28] || (_cache[28] = createBaseVNode("span", { class: "material-symbols-outlined chev" }, "chevron_right", -1))
              ], 8, _hoisted_29);
            }), 128)),
            unref(hasMoreCourses) ? (openBlock(), createElementBlock("button", {
              key: 3,
              type: "button",
              class: "row-card course course-load-more",
              onClick: _cache[5] || (_cache[5] = (...args) => unref(loadMoreCourses) && unref(loadMoreCourses)(...args))
            }, [
              createBaseVNode("div", _hoisted_35, [
                createBaseVNode("strong", null, toDisplayString(unref(t)("chaoxing.hub.loadMore")), 1),
                createBaseVNode("p", null, toDisplayString(tFmt("chaoxing.hub.loadMoreRemaining", { n: unref(filteredCourses).length - unref(visibleCourses).length })), 1)
              ]),
              _cache[29] || (_cache[29] = createBaseVNode("span", { class: "material-symbols-outlined chev" }, "expand_more", -1))
            ])) : createCommentVNode("", true),
            unref(hasMoreCourses) ? (openBlock(), createElementBlock("div", {
              key: 4,
              ref_key: "loadMoreSentinelRef",
              ref: loadMoreSentinelRef,
              class: "course-load-sentinel",
              "aria-hidden": "true"
            }, null, 512)) : createCommentVNode("", true)
          ], 64)) : unref(current).level === "workList" ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
            createBaseVNode("section", _hoisted_36, [
              createBaseVNode("div", _hoisted_37, [
                createBaseVNode("div", null, [
                  createBaseVNode("b", null, toDisplayString(unref(workStats).pending_work), 1),
                  createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.tasks.pending")), 1)
                ]),
                createBaseVNode("div", null, [
                  createBaseVNode("b", null, toDisplayString(unref(workStats).finished_work), 1),
                  createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.tasks.finished")), 1)
                ]),
                createBaseVNode("div", null, [
                  createBaseVNode("b", null, toDisplayString(unref(workStats).overdue), 1),
                  createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.tasks.overdue")), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_38, [
                createBaseVNode("button", {
                  type: "button",
                  class: "chip-btn ghost",
                  disabled: unref(tasksLoading),
                  onClick: _cache[6] || (_cache[6] = ($event) => unref(loadTasks)({ force: true }))
                }, [
                  _cache[30] || (_cache[30] = createBaseVNode("span", { class: "material-symbols-outlined" }, "refresh", -1)),
                  createTextVNode(" " + toDisplayString(unref(t)("chaoxing.hub.refresh")), 1)
                ], 8, _hoisted_39)
              ])
            ]),
            unref(tasksLoading) && !unref(works).length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "loading",
              message: unref(t)("chaoxing.tasks.loading")
            }, null, 8, ["message"])) : unref(tasksError) && !unref(works).length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 1,
              type: "error",
              message: unref(tasksError)
            }, null, 8, ["message"])) : unref(works).length ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
              createBaseVNode("div", _hoisted_40, [
                createBaseVNode("span", _hoisted_41, toDisplayString(unref(t)("chaoxing.tasks.allPending")), 1),
                createBaseVNode("span", _hoisted_42, toDisplayString(unref(works).length), 1)
              ]),
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(works), (item) => {
                return openBlock(), createElementBlock("button", {
                  key: item.course_id + "-" + item.id,
                  type: "button",
                  class: normalizeClass(["task-card", { urgent: isUrgent(item) }]),
                  onClick: ($event) => noticeItem.value = item
                }, [
                  createBaseVNode("div", _hoisted_44, [
                    createBaseVNode("strong", null, toDisplayString(item.name), 1),
                    remainText(item) ? (openBlock(), createElementBlock("span", _hoisted_45, toDisplayString(remainText(item)), 1)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("p", _hoisted_46, toDisplayString(item.course), 1),
                  createBaseVNode("div", _hoisted_47, [
                    createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.tasks.deadline")) + " " + toDisplayString(item.deadline_text || "—"), 1),
                    item.question_num != null ? (openBlock(), createElementBlock("span", _hoisted_48, toDisplayString(tFmt("chaoxing.tasks.questionCount", { n: item.question_num })), 1)) : createCommentVNode("", true),
                    item.avg_finish_rate != null ? (openBlock(), createElementBlock("span", _hoisted_49, toDisplayString(tFmt("chaoxing.tasks.classRate", { n: Math.round(item.avg_finish_rate) })), 1)) : createCommentVNode("", true)
                  ])
                ], 10, _hoisted_43);
              }), 128))
            ], 64)) : (openBlock(), createBlock(unref(TEmptyState), {
              key: 3,
              type: "empty",
              message: unref(t)("chaoxing.tasks.noWork")
            }, null, 8, ["message"])),
            createBaseVNode("section", _hoisted_50, [
              createBaseVNode("p", null, toDisplayString(unref(t)("chaoxing.tasks.workNotice")), 1),
              createBaseVNode("button", {
                type: "button",
                class: "chip-btn",
                onClick: _cache[7] || (_cache[7] = ($event) => openOfficial(null))
              }, [
                _cache[31] || (_cache[31] = createBaseVNode("span", { class: "material-symbols-outlined" }, "open_in_new", -1)),
                createTextVNode(" " + toDisplayString(unref(t)("chaoxing.tasks.openChaoxing")), 1)
              ])
            ])
          ], 64)) : unref(current).level === "examList" ? (openBlock(), createElementBlock(Fragment, { key: 4 }, [
            createBaseVNode("section", _hoisted_51, [
              createBaseVNode("div", _hoisted_52, [
                createBaseVNode("div", null, [
                  createBaseVNode("b", null, toDisplayString(unref(examStats).pending_exam), 1),
                  createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.tasks.pendingExam")), 1)
                ]),
                createBaseVNode("div", null, [
                  createBaseVNode("b", null, toDisplayString(unref(examStats).due_within_3d), 1),
                  createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.tasks.dueSoon")), 1)
                ]),
                createBaseVNode("div", null, [
                  createBaseVNode("b", null, toDisplayString(unref(examStats).overdue), 1),
                  createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.tasks.overdue")), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_53, [
                createBaseVNode("button", {
                  type: "button",
                  class: "chip-btn ghost",
                  disabled: unref(tasksLoading),
                  onClick: _cache[8] || (_cache[8] = ($event) => unref(loadTasks)({ force: true }))
                }, [
                  _cache[32] || (_cache[32] = createBaseVNode("span", { class: "material-symbols-outlined" }, "refresh", -1)),
                  createTextVNode(" " + toDisplayString(unref(t)("chaoxing.hub.refresh")), 1)
                ], 8, _hoisted_54)
              ])
            ]),
            unref(tasksLoading) && !unref(exams).length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "loading",
              message: unref(t)("chaoxing.tasks.loading")
            }, null, 8, ["message"])) : unref(tasksError) && !unref(exams).length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 1,
              type: "error",
              message: unref(tasksError)
            }, null, 8, ["message"])) : unref(exams).length ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
              createBaseVNode("div", _hoisted_55, [
                createBaseVNode("span", _hoisted_56, toDisplayString(unref(t)("chaoxing.tasks.pendingExam")), 1),
                createBaseVNode("span", _hoisted_57, toDisplayString(unref(exams).length), 1)
              ]),
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(exams), (item) => {
                return openBlock(), createElementBlock("button", {
                  key: item.course_id + "-" + item.id,
                  type: "button",
                  class: normalizeClass(["task-card exam", { urgent: isUrgent(item) }]),
                  onClick: ($event) => noticeItem.value = item
                }, [
                  createBaseVNode("div", _hoisted_59, [
                    createBaseVNode("strong", null, toDisplayString(item.name), 1),
                    remainText(item) ? (openBlock(), createElementBlock("span", _hoisted_60, toDisplayString(remainText(item)), 1)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("p", _hoisted_61, toDisplayString(item.course), 1),
                  createBaseVNode("div", _hoisted_62, [
                    createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.tasks.examTime")) + " " + toDisplayString(item.deadline_text || "—"), 1)
                  ])
                ], 10, _hoisted_58);
              }), 128))
            ], 64)) : (openBlock(), createBlock(unref(TEmptyState), {
              key: 3,
              type: "empty",
              message: unref(t)("chaoxing.tasks.noExam")
            }, null, 8, ["message"])),
            createBaseVNode("section", _hoisted_63, [
              createBaseVNode("p", null, toDisplayString(unref(t)("chaoxing.tasks.examNotice")), 1),
              createBaseVNode("button", {
                type: "button",
                class: "chip-btn",
                onClick: _cache[9] || (_cache[9] = ($event) => openOfficial(null))
              }, [
                _cache[33] || (_cache[33] = createBaseVNode("span", { class: "material-symbols-outlined" }, "open_in_new", -1)),
                createTextVNode(" " + toDisplayString(unref(t)("chaoxing.tasks.openChaoxing")), 1)
              ])
            ])
          ], 64)) : unref(current).level === "course" ? (openBlock(), createElementBlock(Fragment, { key: 5 }, [
            createBaseVNode("section", _hoisted_64, [
              createBaseVNode("div", _hoisted_65, [
                createBaseVNode("div", _hoisted_66, [
                  createBaseVNode("span", _hoisted_67, toDisplayString(unref(t)("chaoxing.hub.chaptersTitle")), 1),
                  createBaseVNode("strong", null, toDisplayString(unref(current).course.title), 1),
                  createBaseVNode("p", null, toDisplayString(unref(current).course.teacher || unref(t)("chaoxing.hub.teacherMissing")), 1)
                ])
              ]),
              createBaseVNode("div", _hoisted_68, [
                createBaseVNode("button", {
                  type: "button",
                  class: "chip-btn",
                  onClick: _cache[10] || (_cache[10] = ($event) => unref(openScore)(unref(current).course))
                }, [
                  _cache[34] || (_cache[34] = createBaseVNode("span", { class: "material-symbols-outlined" }, "grade", -1)),
                  createTextVNode(" " + toDisplayString(unref(t)("chaoxing.hub.scoreComposition")), 1)
                ]),
                createBaseVNode("button", {
                  type: "button",
                  class: "chip-btn",
                  onClick: _cache[11] || (_cache[11] = ($event) => openStudyRecord(unref(current).course))
                }, [
                  _cache[35] || (_cache[35] = createBaseVNode("span", { class: "material-symbols-outlined" }, "insights", -1)),
                  createTextVNode(" " + toDisplayString(unref(t)("chaoxing.hub.studyRecord")), 1)
                ]),
                createBaseVNode("button", {
                  type: "button",
                  class: "chip-btn ghost",
                  onClick: _cache[12] || (_cache[12] = ($event) => unref(openCourse)(unref(current).course, { force: true }))
                }, [
                  _cache[36] || (_cache[36] = createBaseVNode("span", { class: "material-symbols-outlined" }, "refresh", -1)),
                  createTextVNode(" " + toDisplayString(unref(t)("chaoxing.hub.refresh")), 1)
                ])
              ]),
              unref(current).progress?.progress_text ? (openBlock(), createElementBlock("p", _hoisted_69, toDisplayString(unref(current).progress.progress_text), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_70, [
              createBaseVNode("span", _hoisted_71, toDisplayString(unref(t)("chaoxing.hub.allChapters")), 1),
              createBaseVNode("span", _hoisted_72, toDisplayString(tFmt("chaoxing.hub.chaptersCount", { n: unref(current).sections?.length || 0 })), 1)
            ]),
            !unref(current).sections?.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: unref(t)("chaoxing.hub.noChapters")
            }, null, 8, ["message"])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_73, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(current).sections, (sec, sIdx) => {
                return openBlock(), createElementBlock("button", {
                  key: sec.id || sIdx,
                  type: "button",
                  class: "menu-item",
                  onClick: ($event) => unref(openSection)(unref(current).course, sec)
                }, [
                  createBaseVNode("div", _hoisted_75, [
                    createBaseVNode("span", _hoisted_76, toDisplayString(String(sIdx + 1).padStart(2, "0")), 1),
                    sIdx < (unref(current).sections?.length || 0) - 1 ? (openBlock(), createElementBlock("i", _hoisted_77)) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", _hoisted_78, [
                    createBaseVNode("strong", null, toDisplayString(sec.title), 1),
                    createBaseVNode("div", _hoisted_79, [
                      createBaseVNode("span", _hoisted_80, toDisplayString(tFmt("chaoxing.hub.knowledgeCount", { n: sec.knowledges.length })), 1),
                      createBaseVNode("span", _hoisted_81, toDisplayString(unref(t)("chaoxing.hub.continueLearning")), 1)
                    ])
                  ]),
                  _cache[37] || (_cache[37] = createBaseVNode("span", { class: "material-symbols-outlined menu-item__chev" }, "chevron_right", -1))
                ], 8, _hoisted_74);
              }), 128))
            ])
          ], 64)) : unref(current).level === "section" ? (openBlock(), createElementBlock(Fragment, { key: 6 }, [
            createBaseVNode("section", _hoisted_82, [
              createBaseVNode("span", _hoisted_83, toDisplayString(unref(t)("chaoxing.hub.currentChapter")), 1),
              createBaseVNode("strong", _hoisted_84, toDisplayString(unref(current).section?.title), 1)
            ]),
            createBaseVNode("div", _hoisted_85, [
              createBaseVNode("span", _hoisted_86, toDisplayString(unref(t)("chaoxing.hub.sectionsTitle")), 1),
              createBaseVNode("span", _hoisted_87, toDisplayString(unref(current).section?.knowledges?.length || 0), 1)
            ]),
            !unref(current).section.knowledges?.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: unref(t)("chaoxing.hub.noSections")
            }, null, 8, ["message"])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_88, [
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
                    createBaseVNode("span", _hoisted_90, toDisplayString(k.completed ? "check_circle" : "play_lesson"), 1)
                  ], 2),
                  createBaseVNode("div", _hoisted_91, [
                    createBaseVNode("strong", null, toDisplayString(k.title), 1),
                    createBaseVNode("div", _hoisted_92, [
                      createBaseVNode("span", {
                        class: normalizeClass(["dot", k.completed ? "ok" : ""])
                      }, toDisplayString(k.completed ? unref(t)("chaoxing.hub.done") : unref(t)("chaoxing.hub.undone")), 3)
                    ])
                  ]),
                  _cache[38] || (_cache[38] = createBaseVNode("span", { class: "material-symbols-outlined menu-item__chev" }, "chevron_right", -1))
                ], 10, _hoisted_89);
              }), 128))
            ])
          ], 64)) : unref(current).level === "knowledge" ? (openBlock(), createElementBlock(Fragment, { key: 7 }, [
            createBaseVNode("section", _hoisted_93, [
              createBaseVNode("span", _hoisted_94, toDisplayString(unref(t)("chaoxing.hub.taskPoints")), 1),
              createBaseVNode("strong", _hoisted_95, toDisplayString(unref(current).knowledge?.title), 1),
              createBaseVNode("p", _hoisted_96, toDisplayString(unref(current).section?.title), 1)
            ]),
            createBaseVNode("div", _hoisted_97, [
              createBaseVNode("span", _hoisted_98, toDisplayString(unref(t)("chaoxing.hub.pageContent")), 1),
              createBaseVNode("span", _hoisted_99, toDisplayString(tFmt("chaoxing.hub.itemsUnit", { n: unref(current).tasks?.length || 0 })), 1)
            ]),
            !unref(current).tasks?.length ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "empty",
              message: unref(t)("chaoxing.hub.noTasks")
            }, null, 8, ["message"])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_100, [
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
                    createBaseVNode("span", _hoisted_102, toDisplayString(t2.kind === "video" ? "play_circle" : t2.kind === "document" ? "description" : "task"), 1)
                  ], 2),
                  createBaseVNode("div", _hoisted_103, [
                    createBaseVNode("strong", null, toDisplayString(t2.title), 1),
                    createBaseVNode("div", _hoisted_104, [
                      createVNode(unref(TStatusBadge), {
                        type: t2.typeMeta.type,
                        text: t2.typeMeta.text
                      }, null, 8, ["type", "text"]),
                      createBaseVNode("span", _hoisted_105, toDisplayString(t2.status), 1)
                    ])
                  ]),
                  createBaseVNode("span", _hoisted_106, toDisplayString(t2.kind === "video" ? "play_arrow" : "chevron_right"), 1)
                ], 8, _hoisted_101);
              }), 128))
            ])
          ], 64)) : unref(current).level === "score" ? (openBlock(), createElementBlock("section", _hoisted_107, [
            createBaseVNode("div", _hoisted_108, [
              createBaseVNode("div", null, [
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.totalScore")), 1),
                unref(current).score?.user_name ? (openBlock(), createElementBlock("p", _hoisted_109, toDisplayString(unref(current).score.user_name), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("strong", null, toDisplayString(unref(current).score?.total_score ?? unref(current).score?.score?.score ?? "—"), 1)
            ]),
            unref(scoreSlices).length ? (openBlock(), createElementBlock("div", _hoisted_110, [
              createBaseVNode("div", {
                class: "pie",
                style: normalizeStyle({ background: unref(pieGradient) }),
                "aria-hidden": "true"
              }, [
                createBaseVNode("div", _hoisted_111, [
                  createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.weight")), 1)
                ])
              ], 4),
              createBaseVNode("ul", _hoisted_112, [
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
            (unref(current).score?.weight_list || []).length ? (openBlock(), createElementBlock("ul", _hoisted_113, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(current).score.weight_list, (w, i) => {
                return openBlock(), createElementBlock("li", { key: i }, [
                  createBaseVNode("span", null, toDisplayString(w.name || w.key || unref(t)("chaoxing.hub.itemFallback")), 1),
                  createBaseVNode("b", null, toDisplayString(w.value ?? w.score ?? "—") + toDisplayString(typeof w.value === "number" ? "%" : ""), 1)
                ]);
              }), 128))
            ])) : unref(current).score?.weight ? (openBlock(), createElementBlock("div", _hoisted_114, [
              createBaseVNode("div", _hoisted_115, [
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.weightWork")), 1),
                createBaseVNode("b", null, toDisplayString(unref(current).score.weight.work ?? 0) + "%", 1)
              ]),
              createBaseVNode("div", _hoisted_116, [
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.weightTest")), 1),
                createBaseVNode("b", null, toDisplayString(unref(current).score.weight.test ?? 0) + "%", 1)
              ]),
              createBaseVNode("div", _hoisted_117, [
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.weightVideo")), 1),
                createBaseVNode("b", null, toDisplayString(unref(current).score.weight.video ?? 0) + "%", 1)
              ]),
              createBaseVNode("div", _hoisted_118, [
                createBaseVNode("span", null, toDisplayString(unref(t)("chaoxing.hub.weightAttend")), 1),
                createBaseVNode("b", null, toDisplayString(unref(current).score.weight.attend ?? 0) + "%", 1)
              ])
            ])) : createCommentVNode("", true),
            unref(current).score?.job ? (openBlock(), createElementBlock("p", _hoisted_119, toDisplayString(tFmt("chaoxing.hub.jobFinishRate", { n: unref(current).score.job.jobFinishRate ?? "—" })), 1)) : createCommentVNode("", true),
            createBaseVNode("button", {
              type: "button",
              class: "chip-btn",
              onClick: _cache[13] || (_cache[13] = ($event) => unref(openScore)(unref(current).course))
            }, toDisplayString(unref(t)("chaoxing.hub.resync")), 1)
          ])) : unref(current).level === "video" ? (openBlock(), createElementBlock("section", _hoisted_120, [
            createBaseVNode("p", _hoisted_121, toDisplayString(unref(current).knowledge?.title), 1),
            createBaseVNode("h3", _hoisted_122, toDisplayString(unref(current).filename || unref(current).task?.title), 1),
            unref(current).duration ? (openBlock(), createElementBlock("p", _hoisted_123, toDisplayString(tFmt("chaoxing.hub.duration", { d: unref(formatDuration)(unref(current).duration) })), 1)) : createCommentVNode("", true),
            (openBlock(), createElementBlock("video", {
              key: unref(activeVideoSrc),
              class: "video-el",
              controls: "",
              playsinline: "",
              autoplay: "",
              preload: "metadata",
              poster: unref(current).poster || void 0,
              src: unref(activeVideoSrc),
              onError: _cache[14] || (_cache[14] = (...args) => unref(onVideoError) && unref(onVideoError)(...args))
            }, null, 40, _hoisted_124)),
            unref(videoError) ? (openBlock(), createElementBlock("p", _hoisted_125, toDisplayString(unref(videoError)), 1)) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_126, [
              createBaseVNode("button", {
                type: "button",
                class: "chip-btn ghost light",
                onClick: _cache[15] || (_cache[15] = (...args) => unref(retryVideo) && unref(retryVideo)(...args))
              }, [
                _cache[39] || (_cache[39] = createBaseVNode("span", { class: "material-symbols-outlined" }, "refresh", -1)),
                createTextVNode(" " + toDisplayString(unref(t)("chaoxing.hub.reload")), 1)
              ]),
              (unref(current).playUrls || []).length > 1 ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "chip-btn ghost light",
                onClick: _cache[16] || (_cache[16] = ($event) => {
                  videoSrcIndex.value = (unref(videoSrcIndex) + 1) % unref(current).playUrls.length;
                  videoError.value = "";
                })
              }, toDisplayString(tFmt("chaoxing.hub.switchLine", { a: unref(videoSrcIndex) + 1, b: unref(current).playUrls.length })), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("p", _hoisted_127, toDisplayString(unref(t)("chaoxing.hub.directLinkHint")), 1)
          ])) : unref(current).level === "study" ? (openBlock(), createBlock(ChaoxingStudyRecord, {
            key: 10,
            ref_key: "studyRef",
            ref: studyRef,
            course: studyCourse.value,
            onOpenOfficial: openStudyTask
          }, null, 8, ["course"])) : unref(current).level === "document" ? (openBlock(), createElementBlock("section", _hoisted_128, [
            createBaseVNode("p", _hoisted_129, toDisplayString(unref(current).knowledge?.title), 1),
            createBaseVNode("h3", _hoisted_130, toDisplayString(unref(current).filename || unref(current).task?.title), 1),
            createBaseVNode("p", _hoisted_131, toDisplayString(tFmt("chaoxing.hub.typeLabel", { t: unref(current).fileType || unref(t)("chaoxing.hub.docFallback") })), 1),
            unref(current).src ? (openBlock(), createElementBlock("iframe", {
              key: unref(current).src,
              class: "video-el doc-frame",
              src: unref(current).src,
              title: unref(t)("chaoxing.hub.docFallback"),
              referrerpolicy: "no-referrer-when-downgrade"
            }, null, 8, _hoisted_132)) : (openBlock(), createElementBlock("p", _hoisted_133, toDisplayString(unref(t)("chaoxing.hub.noPreviewUrl")), 1)),
            createBaseVNode("div", _hoisted_134, [
              (unref(current).candidates || []).length > 1 ? (openBlock(), createElementBlock("button", {
                key: 0,
                type: "button",
                class: "chip-btn ghost light",
                onClick: _cache[17] || (_cache[17] = ($event) => (() => {
                  const list2 = unref(current).candidates || [];
                  const i = Math.max(0, list2.indexOf(unref(current).src));
                  unref(current).src = list2[(i + 1) % list2.length];
                })())
              }, toDisplayString(unref(t)("chaoxing.hub.switchPreviewSource")), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("p", _hoisted_135, toDisplayString(unref(t)("chaoxing.hub.docPreviewHint")), 1)
          ])) : createCommentVNode("", true),
          createVNode(unref(TModal), {
            visible: !!noticeItem.value,
            title: noticeItem.value?.name || "",
            onClose: _cache[19] || (_cache[19] = ($event) => noticeItem.value = null)
          }, {
            footer: withCtx(() => [
              createBaseVNode("button", {
                type: "button",
                class: "chip-btn ghost",
                onClick: copyTaskTitle
              }, toDisplayString(unref(t)("chaoxing.tasks.copyTitle")), 1),
              createBaseVNode("button", {
                type: "button",
                class: "chip-btn",
                onClick: _cache[18] || (_cache[18] = ($event) => openOfficial(noticeItem.value))
              }, toDisplayString(unref(t)("chaoxing.tasks.openChaoxing")), 1)
            ]),
            default: withCtx(() => [
              noticeItem.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                createBaseVNode("p", _hoisted_136, toDisplayString(noticeItem.value.course), 1),
                createBaseVNode("p", _hoisted_137, [
                  createTextVNode(toDisplayString(noticeItem.value.event_type === "exam" ? unref(t)("chaoxing.tasks.examTime") : unref(t)("chaoxing.tasks.deadline")) + " " + toDisplayString(noticeItem.value.deadline_text || "—") + " ", 1),
                  remainText(noticeItem.value) ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                    createTextVNode(" · " + toDisplayString(remainText(noticeItem.value)), 1)
                  ], 64)) : createCommentVNode("", true)
                ]),
                noticeItem.value.question_num != null ? (openBlock(), createElementBlock("p", _hoisted_138, toDisplayString(tFmt("chaoxing.tasks.questionCount", { n: noticeItem.value.question_num })), 1)) : createCommentVNode("", true),
                createBaseVNode("p", _hoisted_139, toDisplayString(noticeItem.value.event_type === "exam" ? unref(t)("chaoxing.tasks.examWarn") : unref(t)("chaoxing.tasks.workWarn")), 1)
              ], 64)) : createCommentVNode("", true)
            ]),
            _: 1
          }, 8, ["visible", "title"]),
          createVNode(ChaoxingEmbedFrame, {
            ref_key: "embedRef",
            ref: embedRef,
            title: embedTitle.value
          }, null, 8, ["title"])
        ])
      ]);
    };
  }
};
const ChaoxingHubView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-2ed2d0b5"]]);
export {
  ChaoxingHubView as default
};
