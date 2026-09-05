import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BuBxb9nY.js";
import { aL as fetchAuthHistory, aM as IdentityServiceError, i as showToast, _ as _export_sfc } from "./app-demo-BxokP0Ga.js";
import { T as TEmptyState } from "./TEmptyState-BDwp3cnC.js";
import { y as defineComponent, o as onMounted, a as openBlock, c as createElementBlock, p as createVNode, k as withCtx, b as createBaseVNode, n as normalizeClass, u as unref, t as toDisplayString, d as createCommentVNode, F as Fragment, g as renderList, r as ref, h as computed } from "./vue-core-DPI62iBa.js";
import "./runtime-bridge-HjlgKupV.js";
import "./more-modules-c4l-U-qE.js";
import "./debug-tools-3S6y50wl.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "auth-history-view" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = {
  key: 0,
  class: "history-stats-card"
};
const _hoisted_4 = { class: "stat-item" };
const _hoisted_5 = { class: "stat-value" };
const _hoisted_6 = { class: "stat-item" };
const _hoisted_7 = { class: "stat-value" };
const _hoisted_8 = { class: "stat-item" };
const _hoisted_9 = { class: "stat-value stat-value--time" };
const _hoisted_10 = {
  key: 1,
  class: "history-tip-card"
};
const _hoisted_11 = { class: "tip-desc" };
const _hoisted_12 = {
  key: 2,
  class: "history-tip-card"
};
const _hoisted_13 = { class: "tip-desc" };
const _hoisted_14 = {
  key: 3,
  class: "history-empty-wrap"
};
const _hoisted_15 = {
  key: 4,
  class: "history-list"
};
const _hoisted_16 = { class: "history-item-main" };
const _hoisted_17 = { class: "history-item-body" };
const _hoisted_18 = { class: "history-app-line" };
const _hoisted_19 = { class: "history-app-name" };
const _hoisted_20 = {
  key: 0,
  class: "history-test-badge"
};
const _hoisted_21 = {
  key: 0,
  class: "history-app-host"
};
const _hoisted_22 = { class: "history-scope-line" };
const _hoisted_23 = { class: "history-item-time" };
const _hoisted_24 = { class: "history-time-relative" };
const _hoisted_25 = { class: "history-time-full" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "IdentityAuthHistoryView",
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const items = ref([]);
    const loadState = ref("loading");
    const errorMessage = ref("");
    const loading = ref(false);
    const formatRelativeTime = (iso) => {
      const t = new Date(iso).getTime();
      if (!Number.isFinite(t)) return "";
      const diff = Date.now() - t;
      const minute = 6e4;
      const hour = 60 * minute;
      const day = 24 * hour;
      if (diff < minute) return "刚刚";
      if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
      if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
      if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
      const d = new Date(t);
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
    const load = async () => {
      loading.value = true;
      loadState.value = "loading";
      errorMessage.value = "";
      try {
        items.value = await fetchAuthHistory();
        loadState.value = "ready";
      } catch (err) {
        if (err instanceof IdentityServiceError && err.code === "device_not_bound") {
          loadState.value = "no_device";
          errorMessage.value = err.message;
        } else {
          loadState.value = "error";
          errorMessage.value = err instanceof IdentityServiceError ? err.message : "加载失败，请稍后重试";
        }
      } finally {
        loading.value = false;
      }
    };
    const handleRefresh = async () => {
      await load();
      if (loadState.value === "ready") showToast("授权记录已刷新");
    };
    onMounted(() => {
      void load();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: "授权记录",
          icon: "history",
          "show-back": "",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "history-refresh-btn",
              "aria-label": "刷新",
              disabled: loading.value,
              onClick: handleRefresh
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { spinning: loading.value }])
              }, "refresh", 2)
            ], 8, _hoisted_2)
          ]),
          _: 1
        }),
        loadState.value === "ready" && items.value.length > 0 ? (openBlock(), createElementBlock("section", _hoisted_3, [
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("span", _hoisted_5, toDisplayString(totalCount.value), 1),
            _cache[1] || (_cache[1] = createBaseVNode("span", { class: "stat-label" }, "授权次数", -1))
          ]),
          createBaseVNode("div", _hoisted_6, [
            createBaseVNode("span", _hoisted_7, toDisplayString(appCount.value), 1),
            _cache[2] || (_cache[2] = createBaseVNode("span", { class: "stat-label" }, "涉及应用", -1))
          ]),
          createBaseVNode("div", _hoisted_8, [
            createBaseVNode("span", _hoisted_9, toDisplayString(lastTime.value), 1),
            _cache[3] || (_cache[3] = createBaseVNode("span", { class: "stat-label" }, "最近授权", -1))
          ])
        ])) : createCommentVNode("", true),
        loadState.value === "no_device" ? (openBlock(), createElementBlock("section", _hoisted_10, [
          _cache[4] || (_cache[4] = createBaseVNode("span", { class: "material-symbols-outlined tip-icon" }, "devices", -1)),
          _cache[5] || (_cache[5] = createBaseVNode("p", { class: "tip-title" }, "本机尚未注册为身份签名设备", -1)),
          createBaseVNode("p", _hoisted_11, toDisplayString(errorMessage.value), 1),
          _cache[6] || (_cache[6] = createBaseVNode("p", { class: "tip-desc" }, "授权记录由本机签名设备批准后产生。请先在「设置 → 登录与安全」完成设备注册，再发起一次授权即可看到记录。", -1))
        ])) : createCommentVNode("", true),
        loadState.value === "error" ? (openBlock(), createElementBlock("section", _hoisted_12, [
          _cache[7] || (_cache[7] = createBaseVNode("span", { class: "material-symbols-outlined tip-icon tip-icon--error" }, "error", -1)),
          _cache[8] || (_cache[8] = createBaseVNode("p", { class: "tip-title" }, "加载失败", -1)),
          createBaseVNode("p", _hoisted_13, toDisplayString(errorMessage.value), 1),
          createBaseVNode("button", {
            class: "history-retry-btn",
            onClick: load
          }, "重试")
        ])) : createCommentVNode("", true),
        loadState.value === "ready" && items.value.length === 0 ? (openBlock(), createElementBlock("section", _hoisted_14, [
          createVNode(unref(TEmptyState), {
            icon: "🗂️",
            message: "还没有授权记录 —— 从网页发起授权并在此设备确认后，记录会显示在这里。"
          })
        ])) : createCommentVNode("", true),
        loadState.value === "ready" && items.value.length > 0 ? (openBlock(), createElementBlock("section", _hoisted_15, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(items.value, (item) => {
            return openBlock(), createElementBlock("article", {
              key: item.request_id,
              class: "history-item-card"
            }, [
              createBaseVNode("div", _hoisted_16, [
                _cache[9] || (_cache[9] = createBaseVNode("div", { class: "history-app-icon" }, [
                  createBaseVNode("span", { class: "material-symbols-outlined" }, "apps")
                ], -1)),
                createBaseVNode("div", _hoisted_17, [
                  createBaseVNode("div", _hoisted_18, [
                    createBaseVNode("span", _hoisted_19, toDisplayString(item.client.name || "未命名应用"), 1),
                    item.client.is_test ? (openBlock(), createElementBlock("span", _hoisted_20, "测试应用")) : createCommentVNode("", true)
                  ]),
                  item.client.homepage_host ? (openBlock(), createElementBlock("span", _hoisted_21, toDisplayString(item.client.homepage_host), 1)) : createCommentVNode("", true),
                  createBaseVNode("div", _hoisted_22, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(item.scopes, (scope) => {
                      return openBlock(), createElementBlock("span", {
                        key: scope.id,
                        class: normalizeClass(["history-scope-tag", { "history-scope-tag--sensitive": scope.risk === "sensitive" }])
                      }, toDisplayString(scope.label), 3);
                    }), 128))
                  ])
                ]),
                _cache[10] || (_cache[10] = createBaseVNode("span", { class: "history-status-badge" }, "已授权", -1))
              ]),
              createBaseVNode("div", _hoisted_23, [
                createBaseVNode("span", _hoisted_24, toDisplayString(formatRelativeTime(item.approved_at)), 1),
                createBaseVNode("span", _hoisted_25, toDisplayString(formatFullTime(item.approved_at)), 1)
              ])
            ]);
          }), 128))
        ])) : createCommentVNode("", true),
        _cache[11] || (_cache[11] = createBaseVNode("p", { class: "history-footnote" }, " 授权记录由身份服务按本机设备签名统计，仅展示本设备批准过的授权（上限 50 条），不会上传任何凭据。 ", -1))
      ]);
    };
  }
});
const IdentityAuthHistoryView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-dbd65d44"]]);
export {
  IdentityAuthHistoryView as default
};
