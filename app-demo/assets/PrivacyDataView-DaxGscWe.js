import { _ as _export_sfc, m as useI18n, o as openExternal, p as tf, j as showToast } from "./app-demo-CUOWTnz-.js";
import { N as NON_OFFICIAL_DISCLAIMER_ZH, l as NON_OFFICIAL_DISCLAIMER_EN, P as PRIVACY_POLICY_URL, S as SECURITY_DOCS_URL, p as SUPPORT_DOCS_URL, q as PROJECT_HOME_URL, G as GITHUB_URL, F as FEEDBACK_URL, f as isAppStoreBuild } from "./more-modules-DaLSEgdg.js";
import { i as isTestAccountSession, E as clearTestAccountSession } from "./runtime-bridge-Dt57BD2i.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { a as openBlock, c as createElementBlock, p as createVNode, u as unref, b as createBaseVNode, t as toDisplayString, d as createCommentVNode, r as ref } from "./vue-core-Dzs4fLAU.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "privacy-data-view" };
const _hoisted_2 = { class: "privacy-data-view__main" };
const _hoisted_3 = {
  class: "privacy-card privacy-card--enter",
  style: { "--enter-delay": "0ms" }
};
const _hoisted_4 = { class: "privacy-card__head" };
const _hoisted_5 = { class: "muted" };
const _hoisted_6 = {
  class: "privacy-card privacy-card--enter",
  style: { "--enter-delay": "60ms" }
};
const _hoisted_7 = { class: "privacy-card__head" };
const _hoisted_8 = { class: "privacy-link-list" };
const _hoisted_9 = { class: "link-btn__label" };
const _hoisted_10 = { class: "link-btn__label" };
const _hoisted_11 = { class: "link-btn__label" };
const _hoisted_12 = { class: "link-btn__label" };
const _hoisted_13 = { class: "link-btn__label" };
const _hoisted_14 = { class: "link-btn__label" };
const _hoisted_15 = {
  class: "privacy-card privacy-card--enter",
  style: { "--enter-delay": "120ms" }
};
const _hoisted_16 = { class: "privacy-card__head" };
const _hoisted_17 = { class: "muted" };
const _hoisted_18 = { class: "privacy-action-list" };
const _hoisted_19 = ["disabled"];
const _hoisted_20 = ["disabled"];
const _hoisted_21 = ["disabled"];
const _hoisted_22 = { class: "muted" };
const _hoisted_23 = {
  key: 0,
  class: "status privacy-card--enter",
  style: { "--enter-delay": "160ms" }
};
const _sfc_main = {
  __name: "PrivacyDataView",
  emits: ["back", "logout", "cleared"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { t } = useI18n();
    const busy = ref("");
    const message = ref("");
    const openUrl = async (url) => {
      await openExternal(url);
    };
    const clearLocalCaches = () => {
      busy.value = "cache";
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (k.startsWith("cache:") || k.includes("_cache") || k.startsWith("hbu_cloud_sync")) {
            keys.push(k);
          }
        }
        keys.forEach((k) => localStorage.removeItem(k));
        message.value = tf("privacy.toast.clearedCache", { n: keys.length });
        showToast(message.value);
      } catch (e) {
        message.value = String(e?.message || e);
      } finally {
        busy.value = "";
      }
    };
    const clearSession = () => {
      busy.value = "session";
      try {
        ;
        [
          "hbu_login_method",
          "hbu_test_account_session",
          "hbu_manual_logout",
          "hbu_logout_reason"
        ].forEach((k) => localStorage.removeItem(k));
        if (isTestAccountSession()) clearTestAccountSession();
        message.value = t("privacy.toast.sessionCleared");
        showToast(message.value);
        emit("logout");
      } catch (e) {
        message.value = String(e?.message || e);
      } finally {
        busy.value = "";
      }
    };
    const clearAllLocal = () => {
      if (!confirm(t("privacy.confirm.clearAll"))) {
        return;
      }
      busy.value = "all";
      try {
        const preserve = /* @__PURE__ */ new Set([]);
        const dump = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const k = localStorage.key(i);
          if (k && !preserve.has(k)) dump.push(k);
        }
        dump.forEach((k) => localStorage.removeItem(k));
        try {
          sessionStorage.clear();
        } catch {
        }
        clearTestAccountSession();
        message.value = t("privacy.toast.allCleared");
        showToast(message.value);
        emit("cleared");
        emit("logout");
      } catch (e) {
        message.value = String(e?.message || e);
      } finally {
        busy.value = "";
      }
    };
    const disableCloudAndStats = () => {
      try {
        localStorage.setItem("hbu_cloud_sync_user_disabled", "1");
        localStorage.setItem("hbu_usage_stats_user_disabled", "1");
        message.value = t("privacy.toast.cloudDisabled");
        showToast(message.value);
      } catch (e) {
        message.value = String(e?.message || e);
      }
    };
    const exportLocalMeta = () => {
      try {
        const payload = {
          exported_at: (/* @__PURE__ */ new Date()).toISOString(),
          app_store_build: isAppStoreBuild(),
          demo_session: isTestAccountSession(),
          keys: Object.keys(localStorage || {})
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mini-hbut-local-data-export.json";
        a.click();
        URL.revokeObjectURL(url);
        showToast(t("privacy.toast.metaExported"));
      } catch (e) {
        message.value = String(e?.message || e);
      }
    };
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: unref(t)("privacy.title"),
          icon: "shield",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, null, 8, ["title"]),
        createBaseVNode("main", _hoisted_2, [
          createBaseVNode("section", _hoisted_3, [
            createBaseVNode("div", _hoisted_4, [
              _cache[7] || (_cache[7] = createBaseVNode("span", {
                class: "privacy-card__icon",
                "aria-hidden": "true"
              }, [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "info")
              ], -1)),
              createBaseVNode("h2", null, toDisplayString(unref(t)("privacy.section.disclaimer")), 1)
            ]),
            createBaseVNode("p", null, toDisplayString(unref(NON_OFFICIAL_DISCLAIMER_ZH)), 1),
            createBaseVNode("p", _hoisted_5, toDisplayString(unref(NON_OFFICIAL_DISCLAIMER_EN)), 1)
          ]),
          createBaseVNode("section", _hoisted_6, [
            createBaseVNode("div", _hoisted_7, [
              _cache[8] || (_cache[8] = createBaseVNode("span", {
                class: "privacy-card__icon privacy-card__icon--policy",
                "aria-hidden": "true"
              }, [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "policy")
              ], -1)),
              createBaseVNode("h2", null, toDisplayString(unref(t)("privacy.section.policy")), 1)
            ]),
            createBaseVNode("div", _hoisted_8, [
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[1] || (_cache[1] = ($event) => openUrl(unref(PRIVACY_POLICY_URL)))
              }, [
                _cache[9] || (_cache[9] = createBaseVNode("span", { class: "link-btn__icon material-symbols-outlined" }, "privacy_tip", -1)),
                createBaseVNode("span", _hoisted_9, toDisplayString(unref(t)("privacy.link.privacyPolicy")), 1),
                _cache[10] || (_cache[10] = createBaseVNode("span", { class: "link-btn__chev material-symbols-outlined" }, "open_in_new", -1))
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[2] || (_cache[2] = ($event) => openUrl(unref(SECURITY_DOCS_URL)))
              }, [
                _cache[11] || (_cache[11] = createBaseVNode("span", { class: "link-btn__icon material-symbols-outlined" }, "security", -1)),
                createBaseVNode("span", _hoisted_10, toDisplayString(unref(t)("privacy.link.security")), 1),
                _cache[12] || (_cache[12] = createBaseVNode("span", { class: "link-btn__chev material-symbols-outlined" }, "open_in_new", -1))
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[3] || (_cache[3] = ($event) => openUrl(unref(SUPPORT_DOCS_URL)))
              }, [
                _cache[13] || (_cache[13] = createBaseVNode("span", { class: "link-btn__icon material-symbols-outlined" }, "menu_book", -1)),
                createBaseVNode("span", _hoisted_11, toDisplayString(unref(t)("privacy.link.userDocs")), 1),
                _cache[14] || (_cache[14] = createBaseVNode("span", { class: "link-btn__chev material-symbols-outlined" }, "open_in_new", -1))
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[4] || (_cache[4] = ($event) => openUrl(unref(PROJECT_HOME_URL)))
              }, [
                _cache[15] || (_cache[15] = createBaseVNode("span", { class: "link-btn__icon material-symbols-outlined" }, "public", -1)),
                createBaseVNode("span", _hoisted_12, toDisplayString(unref(t)("privacy.link.projectHome")), 1),
                _cache[16] || (_cache[16] = createBaseVNode("span", { class: "link-btn__chev material-symbols-outlined" }, "open_in_new", -1))
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[5] || (_cache[5] = ($event) => openUrl(unref(GITHUB_URL)))
              }, [
                _cache[17] || (_cache[17] = createBaseVNode("span", { class: "link-btn__icon material-symbols-outlined" }, "code", -1)),
                createBaseVNode("span", _hoisted_13, toDisplayString(unref(t)("privacy.link.github")), 1),
                _cache[18] || (_cache[18] = createBaseVNode("span", { class: "link-btn__chev material-symbols-outlined" }, "open_in_new", -1))
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[6] || (_cache[6] = ($event) => openUrl(unref(FEEDBACK_URL)))
              }, [
                _cache[19] || (_cache[19] = createBaseVNode("span", { class: "link-btn__icon material-symbols-outlined" }, "support_agent", -1)),
                createBaseVNode("span", _hoisted_14, toDisplayString(unref(t)("privacy.link.support")), 1),
                _cache[20] || (_cache[20] = createBaseVNode("span", { class: "link-btn__chev material-symbols-outlined" }, "open_in_new", -1))
              ])
            ])
          ]),
          createBaseVNode("section", _hoisted_15, [
            createBaseVNode("div", _hoisted_16, [
              _cache[21] || (_cache[21] = createBaseVNode("span", {
                class: "privacy-card__icon privacy-card__icon--control",
                "aria-hidden": "true"
              }, [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "database")
              ], -1)),
              createBaseVNode("h2", null, toDisplayString(unref(t)("privacy.section.control")), 1)
            ]),
            createBaseVNode("p", _hoisted_17, toDisplayString(unref(t)("privacy.control.intro")), 1),
            createBaseVNode("div", _hoisted_18, [
              createBaseVNode("button", {
                type: "button",
                class: "action-btn",
                disabled: !!busy.value,
                onClick: clearLocalCaches
              }, [
                _cache[22] || (_cache[22] = createBaseVNode("span", { class: "action-btn__icon material-symbols-outlined" }, "cached", -1)),
                createBaseVNode("span", null, toDisplayString(unref(t)("privacy.action.clearCache")), 1)
              ], 8, _hoisted_19),
              createBaseVNode("button", {
                type: "button",
                class: "action-btn",
                disabled: !!busy.value,
                onClick: clearSession
              }, [
                _cache[23] || (_cache[23] = createBaseVNode("span", { class: "action-btn__icon material-symbols-outlined" }, "logout", -1)),
                createBaseVNode("span", null, toDisplayString(unref(t)("privacy.action.clearSession")), 1)
              ], 8, _hoisted_20),
              createBaseVNode("button", {
                type: "button",
                class: "action-btn danger",
                disabled: !!busy.value,
                onClick: clearAllLocal
              }, [
                _cache[24] || (_cache[24] = createBaseVNode("span", { class: "action-btn__icon material-symbols-outlined" }, "delete_forever", -1)),
                createBaseVNode("span", null, toDisplayString(unref(t)("privacy.action.clearAll")), 1)
              ], 8, _hoisted_21),
              createBaseVNode("button", {
                type: "button",
                class: "action-btn",
                onClick: disableCloudAndStats
              }, [
                _cache[25] || (_cache[25] = createBaseVNode("span", { class: "action-btn__icon material-symbols-outlined" }, "cloud_off", -1)),
                createBaseVNode("span", null, toDisplayString(unref(t)("privacy.action.disableCloud")), 1)
              ]),
              createBaseVNode("button", {
                type: "button",
                class: "action-btn",
                onClick: exportLocalMeta
              }, [
                _cache[26] || (_cache[26] = createBaseVNode("span", { class: "action-btn__icon material-symbols-outlined" }, "download", -1)),
                createBaseVNode("span", null, toDisplayString(unref(t)("privacy.action.exportMeta")), 1)
              ])
            ]),
            createBaseVNode("p", _hoisted_22, toDisplayString(unref(t)("privacy.control.cloudDeletion")), 1)
          ]),
          message.value ? (openBlock(), createElementBlock("p", _hoisted_23, toDisplayString(message.value), 1)) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const PrivacyDataView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-067bf2e5"]]);
export {
  PrivacyDataView as default
};
