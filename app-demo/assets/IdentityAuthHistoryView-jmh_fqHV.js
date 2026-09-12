import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { m as useI18n, aP as fetchAuthHistory, aQ as IdentityServiceError, j as showToast, _ as _export_sfc } from "./app-demo-CUOWTnz-.js";
import { T as TEmptyState } from "./TEmptyState-BwJ_g5G7.js";
import { y as defineComponent, o as onMounted, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, u as unref, n as normalizeClass, t as toDisplayString, d as createCommentVNode, F as Fragment, f as renderList, r as ref, h as computed } from "./vue-core-Dzs4fLAU.js";
import "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "auth-history-view" };
const _hoisted_2 = ["aria-label", "disabled"];
const _hoisted_3 = {
  key: 0,
  class: "history-stats-card"
};
const _hoisted_4 = { class: "stat-item" };
const _hoisted_5 = { class: "stat-value" };
const _hoisted_6 = { class: "stat-label" };
const _hoisted_7 = { class: "stat-item" };
const _hoisted_8 = { class: "stat-value" };
const _hoisted_9 = { class: "stat-label" };
const _hoisted_10 = { class: "stat-item" };
const _hoisted_11 = { class: "stat-value stat-value--time" };
const _hoisted_12 = { class: "stat-label" };
const _hoisted_13 = {
  key: 1,
  class: "history-tip-card"
};
const _hoisted_14 = { class: "tip-title" };
const _hoisted_15 = { class: "tip-desc" };
const _hoisted_16 = { class: "tip-desc" };
const _hoisted_17 = {
  key: 2,
  class: "history-tip-card"
};
const _hoisted_18 = { class: "tip-title" };
const _hoisted_19 = { class: "tip-desc" };
const _hoisted_20 = {
  key: 0,
  class: "tip-desc tip-hint"
};
const _hoisted_21 = {
  key: 3,
  class: "history-empty-wrap"
};
const _hoisted_22 = {
  key: 4,
  class: "history-list"
};
const _hoisted_23 = { class: "history-item-main" };
const _hoisted_24 = { class: "history-item-body" };
const _hoisted_25 = { class: "history-app-line" };
const _hoisted_26 = { class: "history-app-name" };
const _hoisted_27 = {
  key: 0,
  class: "history-test-badge"
};
const _hoisted_28 = {
  key: 0,
  class: "history-app-host"
};
const _hoisted_29 = { class: "history-scope-line" };
const _hoisted_30 = { class: "history-status-badge" };
const _hoisted_31 = { class: "history-item-time" };
const _hoisted_32 = { class: "history-time-relative" };
const _hoisted_33 = { class: "history-time-full" };
const _hoisted_34 = { class: "history-footnote" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "IdentityAuthHistoryView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const { t } = useI18n();
    const emit = __emit;
    const items = ref([]);
    const loadState = ref("loading");
    const errorMessage = ref("");
    const errorHint = ref("");
    const loading = ref(false);
    const formatRelativeTime = (iso) => {
      const t0 = new Date(iso).getTime();
      if (!Number.isFinite(t0)) return "";
      const diff = Date.now() - t0;
      const minute = 6e4;
      const hour = 60 * minute;
      const day = 24 * hour;
      if (diff < minute) return t("identity.history.time.just_now");
      if (diff < hour) return t("identity.history.time.minutes_ago").replace("{n}", String(Math.floor(diff / minute)));
      if (diff < day) return t("identity.history.time.hours_ago").replace("{n}", String(Math.floor(diff / hour)));
      if (diff < 7 * day) return t("identity.history.time.days_ago").replace("{n}", String(Math.floor(diff / day)));
      const d = new Date(t0);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const formatFullTime = (iso) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    const totalCount = computed(() => items.value.length);
    const appCount = computed(() => new Set(items.value.map((i) => i.client.name)).size);
    const lastTime = computed(() => items.value[0] ? formatRelativeTime(items.value[0].approved_at) : "—");
    const errorHintFor = (code) => {
      switch (code) {
        case "secure_storage_unavailable":
          return t("identity.history.hint.secure_storage_unavailable");
        case "device_revoked":
          return t("identity.history.hint.device_revoked");
        case "signature_rejected":
          return t("identity.history.hint.signature_rejected");
        case "network_unavailable":
          return t("identity.history.hint.network_unavailable");
        case "client_unavailable":
          return t("identity.history.hint.client_unavailable");
        case "unknown":
          return t("identity.history.hint.unknown");
        default:
          return "";
      }
    };
    const load = async () => {
      loading.value = true;
      loadState.value = "loading";
      errorMessage.value = "";
      errorHint.value = "";
      try {
        items.value = await fetchAuthHistory();
        loadState.value = "ready";
      } catch (err) {
        if (err instanceof IdentityServiceError && err.code === "device_not_bound") {
          loadState.value = "no_device";
          errorMessage.value = err.message;
        } else {
          loadState.value = "error";
          errorMessage.value = err instanceof IdentityServiceError ? err.message : t("identity.history.fallback.load_failed");
          if (err instanceof IdentityServiceError) {
            errorHint.value = errorHintFor(err.code);
          }
        }
      } finally {
        loading.value = false;
      }
    };
    const handleRefresh = async () => {
      await load();
      if (loadState.value === "ready") showToast(t("identity.history.toast.refreshed"));
    };
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("identity.history.title"),
          icon: "history",
          "show-back": "",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "history-refresh-btn",
              "aria-label": unref(t)("identity.history.refresh.aria"),
              disabled: loading.value,
              onClick: handleRefresh
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { spinning: loading.value }])
              }, "refresh", 2)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }, 8, ["title"]),
        loadState.value === "ready" && items.value.length > 0 ? (openBlock(), createElementBlock("section", _hoisted_3, [
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("span", _hoisted_5, toDisplayString(totalCount.value), 1),
            createBaseVNode("span", _hoisted_6, toDisplayString(unref(t)("identity.history.stat.total")), 1)
          ]),
          createBaseVNode("div", _hoisted_7, [
            createBaseVNode("span", _hoisted_8, toDisplayString(appCount.value), 1),
            createBaseVNode("span", _hoisted_9, toDisplayString(unref(t)("identity.history.stat.apps")), 1)
          ]),
          createBaseVNode("div", _hoisted_10, [
            createBaseVNode("span", _hoisted_11, toDisplayString(lastTime.value), 1),
            createBaseVNode("span", _hoisted_12, toDisplayString(unref(t)("identity.history.stat.last")), 1)
          ])
        ])) : createCommentVNode("", true),
        loadState.value === "no_device" ? (openBlock(), createElementBlock("section", _hoisted_13, [
          _cache[1] || (_cache[1] = createBaseVNode("span", { class: "material-symbols-outlined tip-icon" }, "devices", -1)),
          createBaseVNode("p", _hoisted_14, toDisplayString(unref(t)("identity.history.no_device.title")), 1),
          createBaseVNode("p", _hoisted_15, toDisplayString(errorMessage.value), 1),
          createBaseVNode("p", _hoisted_16, toDisplayString(unref(t)("identity.history.no_device.desc")), 1)
        ])) : createCommentVNode("", true),
        loadState.value === "error" ? (openBlock(), createElementBlock("section", _hoisted_17, [
          _cache[2] || (_cache[2] = createBaseVNode("span", { class: "material-symbols-outlined tip-icon tip-icon--error" }, "error", -1)),
          createBaseVNode("p", _hoisted_18, toDisplayString(unref(t)("identity.history.error.title")), 1),
          createBaseVNode("p", _hoisted_19, toDisplayString(errorMessage.value), 1),
          errorHint.value ? (openBlock(), createElementBlock("p", _hoisted_20, toDisplayString(errorHint.value), 1)) : createCommentVNode("", true),
          createBaseVNode("button", {
            class: "history-retry-btn",
            onClick: load
          }, toDisplayString(unref(t)("identity.history.error.retry")), 1)
        ])) : createCommentVNode("", true),
        loadState.value === "ready" && items.value.length === 0 ? (openBlock(), createElementBlock("section", _hoisted_21, [
          createVNode(unref(TEmptyState), {
            icon: "🗂️",
            message: unref(t)("identity.history.empty")
          }, null, 8, ["message"])
        ])) : createCommentVNode("", true),
        loadState.value === "ready" && items.value.length > 0 ? (openBlock(), createElementBlock("section", _hoisted_22, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (item) => {
            return openBlock(), createElementBlock("article", {
              key: item.request_id,
              class: "history-item-card"
            }, [
              createBaseVNode("div", _hoisted_23, [
                _cache[3] || (_cache[3] = createBaseVNode("div", { class: "history-app-icon" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "apps")
                ], -1)),
                createBaseVNode("div", _hoisted_24, [
                  createBaseVNode("div", _hoisted_25, [
                    createBaseVNode("span", _hoisted_26, toDisplayString(item.client.name || unref(t)("identity.history.app.unnamed")), 1),
                    item.client.is_test ? (openBlock(), createElementBlock("span", _hoisted_27, toDisplayString(unref(t)("identity.history.badge.test")), 1)) : createCommentVNode("", true)
                  ]),
                  item.client.homepage_host ? (openBlock(), createElementBlock("span", _hoisted_28, toDisplayString(item.client.homepage_host), 1)) : createCommentVNode("", true),
                  createBaseVNode("div", _hoisted_29, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(item.scopes, (scope) => {
                      return openBlock(), createElementBlock("span", {
                        key: scope.id,
                        class: normalizeClass(["history-scope-tag", { "history-scope-tag--sensitive": scope.risk === "sensitive" }])
                      }, toDisplayString(scope.label), 3);
                    }), 128))
                  ])
                ]),
                createBaseVNode("span", _hoisted_30, toDisplayString(unref(t)("identity.history.badge.approved")), 1)
              ]),
              createBaseVNode("div", _hoisted_31, [
                createBaseVNode("span", _hoisted_32, toDisplayString(formatRelativeTime(item.approved_at)), 1),
                createBaseVNode("span", _hoisted_33, toDisplayString(formatFullTime(item.approved_at)), 1)
              ])
            ]);
          }), 128))
        ])) : createCommentVNode("", true),
        createBaseVNode("p", _hoisted_34, toDisplayString(unref(t)("identity.history.footnote")), 1)
      ]);
    };
  }
});
const IdentityAuthHistoryView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-bb178824"]]);
export {
  IdentityAuthHistoryView as default
};
