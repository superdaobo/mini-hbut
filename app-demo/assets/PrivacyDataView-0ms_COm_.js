import { _ as _export_sfc, o as openExternal, s as showToast } from "./app-demo-CxKBY5JQ.js";
import { N as NON_OFFICIAL_DISCLAIMER_ZH, w as NON_OFFICIAL_DISCLAIMER_EN, P as PRIVACY_POLICY_URL, S as SECURITY_DOCS_URL, B as SUPPORT_DOCS_URL, C as PROJECT_HOME_URL, G as GITHUB_URL, F as FEEDBACK_URL, f as isAppStoreBuild } from "./more-modules-CsUTdMqs.js";
import { i as isTestAccountSession, C as clearTestAccountSession } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { c as createElementBlock, b as openBlock, q as createVNode, d as createBaseVNode, u as unref, f as createCommentVNode, t as toDisplayString, a as ref } from "./vue-core-DdLVj9yW.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "privacy-data-view" };
const _hoisted_2 = { class: "privacy-data-view__main" };
const _hoisted_3 = {
  class: "privacy-card privacy-card--enter",
  style: { "--enter-delay": "0ms" }
};
const _hoisted_4 = { class: "muted" };
const _hoisted_5 = {
  class: "privacy-card privacy-card--enter",
  style: { "--enter-delay": "60ms" }
};
const _hoisted_6 = { class: "privacy-link-list" };
const _hoisted_7 = {
  class: "privacy-card privacy-card--enter",
  style: { "--enter-delay": "120ms" }
};
const _hoisted_8 = { class: "privacy-action-list" };
const _hoisted_9 = ["disabled"];
const _hoisted_10 = ["disabled"];
const _hoisted_11 = ["disabled"];
const _hoisted_12 = {
  key: 0,
  class: "status privacy-card--enter",
  style: { "--enter-delay": "160ms" }
};
const _sfc_main = {
  __name: "PrivacyDataView",
  emits: ["back", "logout", "cleared"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
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
        message.value = `已清除 ${keys.length} 项离线缓存键`;
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
        message.value = "已请求清除登录会话标记；请再点退出登录以清理内存态";
        showToast(message.value);
        emit("logout");
      } catch (e) {
        message.value = String(e?.message || e);
      } finally {
        busy.value = "";
      }
    };
    const clearAllLocal = () => {
      if (!confirm("将清除本应用在本设备保存的本地数据（缓存、设置快照、演示标记等）。不会删除学校账号。是否继续？")) {
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
        message.value = "已清除全部本地 Web 存储。建议完全退出应用后重新打开。";
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
        message.value = "已标记关闭云同步与使用统计上传（本地偏好）";
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
        showToast("已导出本地键名清单（不含密码）");
      } catch (e) {
        message.value = String(e?.message || e);
      }
    };
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: "隐私与数据",
          icon: "shield",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }),
        createBaseVNode("main", _hoisted_2, [
          createBaseVNode("section", _hoisted_3, [
            _cache[7] || (_cache[7] = createBaseVNode("div", { class: "privacy-card__head" }, [
              createBaseVNode("span", {
                class: "privacy-card__icon",
                "aria-hidden": "true"
              }, [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "info")
              ]),
              createBaseVNode("h2", null, "非官方声明")
            ], -1)),
            createBaseVNode("p", null, toDisplayString(unref(NON_OFFICIAL_DISCLAIMER_ZH)), 1),
            createBaseVNode("p", _hoisted_4, toDisplayString(unref(NON_OFFICIAL_DISCLAIMER_EN)), 1)
          ]),
          createBaseVNode("section", _hoisted_5, [
            _cache[14] || (_cache[14] = createBaseVNode("div", { class: "privacy-card__head" }, [
              createBaseVNode("span", {
                class: "privacy-card__icon privacy-card__icon--policy",
                "aria-hidden": "true"
              }, [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "policy")
              ]),
              createBaseVNode("h2", null, "政策与支持")
            ], -1)),
            createBaseVNode("div", _hoisted_6, [
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[1] || (_cache[1] = ($event) => openUrl(unref(PRIVACY_POLICY_URL)))
              }, [..._cache[8] || (_cache[8] = [
                createBaseVNode("span", { class: "link-btn__icon material-symbols-outlined" }, "privacy_tip", -1),
                createBaseVNode("span", { class: "link-btn__label" }, "查看隐私政策", -1),
                createBaseVNode("span", { class: "link-btn__chev material-symbols-outlined" }, "open_in_new", -1)
              ])]),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[2] || (_cache[2] = ($event) => openUrl(unref(SECURITY_DOCS_URL)))
              }, [..._cache[9] || (_cache[9] = [
                createBaseVNode("span", { class: "link-btn__icon material-symbols-outlined" }, "security", -1),
                createBaseVNode("span", { class: "link-btn__label" }, "数据与安全说明", -1),
                createBaseVNode("span", { class: "link-btn__chev material-symbols-outlined" }, "open_in_new", -1)
              ])]),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[3] || (_cache[3] = ($event) => openUrl(unref(SUPPORT_DOCS_URL)))
              }, [..._cache[10] || (_cache[10] = [
                createBaseVNode("span", { class: "link-btn__icon material-symbols-outlined" }, "menu_book", -1),
                createBaseVNode("span", { class: "link-btn__label" }, "用户文档", -1),
                createBaseVNode("span", { class: "link-btn__chev material-symbols-outlined" }, "open_in_new", -1)
              ])]),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[4] || (_cache[4] = ($event) => openUrl(unref(PROJECT_HOME_URL)))
              }, [..._cache[11] || (_cache[11] = [
                createBaseVNode("span", { class: "link-btn__icon material-symbols-outlined" }, "public", -1),
                createBaseVNode("span", { class: "link-btn__label" }, "项目官网", -1),
                createBaseVNode("span", { class: "link-btn__chev material-symbols-outlined" }, "open_in_new", -1)
              ])]),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[5] || (_cache[5] = ($event) => openUrl(unref(GITHUB_URL)))
              }, [..._cache[12] || (_cache[12] = [
                createBaseVNode("span", { class: "link-btn__icon material-symbols-outlined" }, "code", -1),
                createBaseVNode("span", { class: "link-btn__label" }, "开源仓库", -1),
                createBaseVNode("span", { class: "link-btn__chev material-symbols-outlined" }, "open_in_new", -1)
              ])]),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[6] || (_cache[6] = ($event) => openUrl(unref(FEEDBACK_URL)))
              }, [..._cache[13] || (_cache[13] = [
                createBaseVNode("span", { class: "link-btn__icon material-symbols-outlined" }, "support_agent", -1),
                createBaseVNode("span", { class: "link-btn__label" }, "联系支持 / 反馈", -1),
                createBaseVNode("span", { class: "link-btn__chev material-symbols-outlined" }, "open_in_new", -1)
              ])])
            ])
          ]),
          createBaseVNode("section", _hoisted_7, [
            _cache[20] || (_cache[20] = createBaseVNode("div", { class: "privacy-card__head" }, [
              createBaseVNode("span", {
                class: "privacy-card__icon privacy-card__icon--control",
                "aria-hidden": "true"
              }, [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "database")
              ]),
              createBaseVNode("h2", null, "本应用数据控制")
            ], -1)),
            _cache[21] || (_cache[21] = createBaseVNode("p", { class: "muted" }, " Mini-HBUT 使用你已有的校园登录凭据查询你本人有权访问的信息，不创建独立的校园机构账号，因此无法删除学校侧账号。 ", -1)),
            createBaseVNode("div", _hoisted_8, [
              createBaseVNode("button", {
                type: "button",
                class: "action-btn",
                disabled: !!busy.value,
                onClick: clearLocalCaches
              }, [..._cache[15] || (_cache[15] = [
                createBaseVNode("span", { class: "action-btn__icon material-symbols-outlined" }, "cached", -1),
                createBaseVNode("span", null, "清除离线缓存", -1)
              ])], 8, _hoisted_9),
              createBaseVNode("button", {
                type: "button",
                class: "action-btn",
                disabled: !!busy.value,
                onClick: clearSession
              }, [..._cache[16] || (_cache[16] = [
                createBaseVNode("span", { class: "action-btn__icon material-symbols-outlined" }, "logout", -1),
                createBaseVNode("span", null, "清除登录会话", -1)
              ])], 8, _hoisted_10),
              createBaseVNode("button", {
                type: "button",
                class: "action-btn danger",
                disabled: !!busy.value,
                onClick: clearAllLocal
              }, [..._cache[17] || (_cache[17] = [
                createBaseVNode("span", { class: "action-btn__icon material-symbols-outlined" }, "delete_forever", -1),
                createBaseVNode("span", null, "清除全部本地数据", -1)
              ])], 8, _hoisted_11),
              createBaseVNode("button", {
                type: "button",
                class: "action-btn",
                onClick: disableCloudAndStats
              }, [..._cache[18] || (_cache[18] = [
                createBaseVNode("span", { class: "action-btn__icon material-symbols-outlined" }, "cloud_off", -1),
                createBaseVNode("span", null, "关闭云同步与使用统计", -1)
              ])]),
              createBaseVNode("button", {
                type: "button",
                class: "action-btn",
                onClick: exportLocalMeta
              }, [..._cache[19] || (_cache[19] = [
                createBaseVNode("span", { class: "action-btn__icon material-symbols-outlined" }, "download", -1),
                createBaseVNode("span", null, "导出个人数据元信息", -1)
              ])])
            ]),
            _cache[22] || (_cache[22] = createBaseVNode("p", { class: "muted" }, " 删除 Mini-HBUT 云端数据：若你曾开启云同步，请在关闭同步后通过反馈渠道申请删除服务端关联记录（学号哈希/设备标识）。本页不会删除学校系统中的成绩或账号。 ", -1))
          ]),
          message.value ? (openBlock(), createElementBlock("p", _hoisted_12, toDisplayString(message.value), 1)) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const PrivacyDataView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-52c60fef"]]);
export {
  PrivacyDataView as default
};
