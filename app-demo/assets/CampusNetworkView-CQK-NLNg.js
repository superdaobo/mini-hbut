import { a as ref, o as onMounted, c as createElementBlock, b as openBlock, q as createVNode, d as createBaseVNode, u as unref, t as toDisplayString, e as computed, n as normalizeClass, f as createCommentVNode, C as withDirectives, D as vModelText, M as vModelDynamic, F as Fragment, i as renderList } from "./vue-core-DdLVj9yW.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { _ as _export_sfc, a9 as readCampusNetworkSettings, aa as loadRememberedCredential, ab as buildCampusAccountKey, ac as CAMPUS_CARRIER_OPTIONS, ad as HBUT_CAMPUS_GATEWAYS, ae as probeCampusNetwork, s as showToast, af as loginCampusNetwork, ag as writeCampusNetworkSettings, ah as campusStatusLabel } from "./app-demo-CxKBY5JQ.js";
import { b as isTauriRuntime } from "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "campus-network-view" };
const _hoisted_2 = { class: "glass-card status-card" };
const _hoisted_3 = { class: "status-row" };
const _hoisted_4 = { class: "status-copy" };
const _hoisted_5 = { class: "status-value" };
const _hoisted_6 = ["disabled"];
const _hoisted_7 = { class: "glass-card form-card" };
const _hoisted_8 = { class: "field" };
const _hoisted_9 = { class: "field" };
const _hoisted_10 = { class: "password-row" };
const _hoisted_11 = ["type"];
const _hoisted_12 = { class: "material-symbols-outlined" };
const _hoisted_13 = { class: "toggle-row" };
const _hoisted_14 = ["aria-checked"];
const _hoisted_15 = { class: "option-group" };
const _hoisted_16 = { class: "chip-row" };
const _hoisted_17 = ["onClick"];
const _hoisted_18 = { class: "toggle-row" };
const _hoisted_19 = ["aria-checked"];
const _hoisted_20 = ["disabled"];
const _hoisted_21 = {
  key: 0,
  class: "advanced-box"
};
const _hoisted_22 = { class: "field" };
const _hoisted_23 = ["value"];
const _hoisted_24 = { class: "hint" };
const _sfc_main = {
  __name: "CampusNetworkView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const settings = ref(readCampusNetworkSettings());
    const account = ref("");
    const password = ref("");
    const showPassword = ref(false);
    const probing = ref(false);
    const loggingIn = ref(false);
    const probeMessage = ref("");
    const status = ref(settings.value.last_status || "unknown");
    const statusText = computed(() => {
      if (probing.value) return "检测中…";
      const base = campusStatusLabel(status.value);
      if (status.value === "error" || status.value === "needs_auth") {
        const msg = probeMessage.value || settings.value.last_message;
        return msg ? `${base}：${msg}` : base;
      }
      return probeMessage.value || base;
    });
    const refreshProbe = async () => {
      if (!isTauriRuntime()) {
        status.value = "unknown";
        probeMessage.value = "请在桌面/移动端应用中使用校园网认证";
        return;
      }
      probing.value = true;
      status.value = "checking";
      try {
        const result = await probeCampusNetwork(settings.value.gateway_override);
        status.value = result?.status || "unknown";
        probeMessage.value = String(result?.message || "");
        settings.value = readCampusNetworkSettings();
      } finally {
        probing.value = false;
      }
    };
    const persistSettings = (patch) => {
      settings.value = writeCampusNetworkSettings(patch);
    };
    const handleCarrierChange = (carrier) => {
      persistSettings({ carrier });
    };
    const handleToggleRemember = () => {
      persistSettings({ remember_password: !settings.value.remember_password });
    };
    const handleToggleAutoLogin = () => {
      persistSettings({ auto_login: !settings.value.auto_login });
    };
    const handleToggleAdvanced = () => {
      persistSettings({ show_advanced: !settings.value.show_advanced });
    };
    const handleGatewayInput = (event) => {
      persistSettings({ gateway_override: String(event.target.value || "").trim() });
    };
    const handleLogin = async () => {
      const sid = String(account.value || props.studentId || localStorage.getItem("hbu_username") || "").trim();
      if (!sid) {
        showToast("请填写学号", "error");
        return;
      }
      if (!password.value) {
        showToast("请填写密码", "error");
        return;
      }
      loggingIn.value = true;
      try {
        const probe = await probeCampusNetwork(settings.value.gateway_override);
        const result = await loginCampusNetwork({
          studentId: sid,
          password: password.value,
          carrier: settings.value.carrier,
          gatewayOverride: settings.value.gateway_override,
          queryString: probe?.query_string || void 0,
          rememberPassword: settings.value.remember_password
        });
        settings.value = readCampusNetworkSettings();
        status.value = result.success ? "authenticated" : "error";
        probeMessage.value = result.message;
        showToast(result.message, result.success ? "success" : "error");
        if (result.success) {
          await refreshProbe();
        }
      } finally {
        loggingIn.value = false;
      }
    };
    onMounted(async () => {
      const sid = String(props.studentId || localStorage.getItem("hbu_username") || "").trim();
      account.value = sid;
      if (sid && settings.value.remember_password) {
        const saved = await loadRememberedCredential(buildCampusAccountKey(sid));
        if (saved) password.value = saved;
      }
      await refreshProbe();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: "校园网",
          icon: "wifi",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }),
        createBaseVNode("section", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            _cache[5] || (_cache[5] = createBaseVNode("span", { class: "material-symbols-outlined status-icon" }, "router", -1)),
            createBaseVNode("div", _hoisted_4, [
              _cache[4] || (_cache[4] = createBaseVNode("span", { class: "status-label" }, "连接状态", -1)),
              createBaseVNode("span", _hoisted_5, toDisplayString(statusText.value), 1)
            ]),
            createBaseVNode("button", {
              class: "icon-btn",
              type: "button",
              disabled: probing.value,
              onClick: refreshProbe,
              "aria-label": "重新检测"
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { spin: probing.value }])
              }, "refresh", 2)
            ], 8, _hoisted_6)
          ])
        ]),
        createBaseVNode("section", _hoisted_7, [
          createBaseVNode("label", _hoisted_8, [
            _cache[6] || (_cache[6] = createBaseVNode("span", null, "学号", -1)),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => account.value = $event),
              type: "text",
              inputmode: "numeric",
              autocomplete: "username",
              placeholder: "默认读取已保存学号"
            }, null, 512), [
              [vModelText, account.value]
            ])
          ]),
          createBaseVNode("label", _hoisted_9, [
            _cache[7] || (_cache[7] = createBaseVNode("span", null, "密码", -1)),
            createBaseVNode("div", _hoisted_10, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => password.value = $event),
                type: showPassword.value ? "text" : "password",
                autocomplete: "current-password",
                placeholder: "校园网密码"
              }, null, 8, _hoisted_11), [
                [vModelDynamic, password.value]
              ]),
              createBaseVNode("button", {
                class: "icon-btn",
                type: "button",
                onClick: _cache[3] || (_cache[3] = ($event) => showPassword.value = !showPassword.value),
                "aria-label": "显示密码"
              }, [
                createBaseVNode("span", _hoisted_12, toDisplayString(showPassword.value ? "visibility_off" : "visibility"), 1)
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_13, [
            _cache[8] || (_cache[8] = createBaseVNode("div", null, [
              createBaseVNode("strong", null, "记住密码"),
              createBaseVNode("small", null, "保存到系统密钥环（campus: 前缀）")
            ], -1)),
            createBaseVNode("button", {
              class: normalizeClass(["toggle", { on: settings.value.remember_password }]),
              type: "button",
              role: "switch",
              "aria-checked": settings.value.remember_password,
              onClick: handleToggleRemember
            }, null, 10, _hoisted_14)
          ]),
          createBaseVNode("div", _hoisted_15, [
            _cache[9] || (_cache[9] = createBaseVNode("label", null, "运营商", -1)),
            createBaseVNode("div", _hoisted_16, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(CAMPUS_CARRIER_OPTIONS), (item) => {
                return openBlock(), createElementBlock("button", {
                  key: item.id,
                  type: "button",
                  class: normalizeClass(["option-chip", { active: settings.value.carrier === item.id }]),
                  onClick: ($event) => handleCarrierChange(item.id)
                }, [
                  createBaseVNode("strong", null, toDisplayString(item.label), 1),
                  createBaseVNode("small", null, toDisplayString(item.hint), 1)
                ], 10, _hoisted_17);
              }), 128))
            ])
          ]),
          createBaseVNode("div", _hoisted_18, [
            _cache[10] || (_cache[10] = createBaseVNode("div", null, [
              createBaseVNode("strong", null, "自动认证"),
              createBaseVNode("small", null, "连接 iHBUT 后，应用前台恢复时尽力自动登录")
            ], -1)),
            createBaseVNode("button", {
              class: normalizeClass(["toggle", { on: settings.value.auto_login }]),
              type: "button",
              role: "switch",
              "aria-checked": settings.value.auto_login,
              onClick: handleToggleAutoLogin
            }, null, 10, _hoisted_19)
          ]),
          createBaseVNode("button", {
            class: "primary-btn",
            type: "button",
            disabled: loggingIn.value,
            onClick: handleLogin
          }, toDisplayString(loggingIn.value ? "认证中…" : "立即认证"), 9, _hoisted_20),
          createBaseVNode("button", {
            class: "link-btn",
            type: "button",
            onClick: handleToggleAdvanced
          }, toDisplayString(settings.value.show_advanced ? "收起高级" : "高级"), 1),
          settings.value.show_advanced ? (openBlock(), createElementBlock("div", _hoisted_21, [
            createBaseVNode("label", _hoisted_22, [
              _cache[11] || (_cache[11] = createBaseVNode("span", null, "认证服务器覆盖", -1)),
              createBaseVNode("input", {
                value: settings.value.gateway_override,
                type: "url",
                placeholder: "留空使用预置网关",
                onInput: handleGatewayInput
              }, null, 40, _hoisted_23)
            ]),
            createBaseVNode("p", _hoisted_24, "预置：" + toDisplayString(unref(HBUT_CAMPUS_GATEWAYS).join("、")), 1),
            _cache[12] || (_cache[12] = createBaseVNode("p", { class: "hint" }, "iOS 无法保证后台连 WiFi 即登；Android 依赖系统后台任务频率。", -1))
          ])) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const CampusNetworkView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-ca61d104"]]);
export {
  CampusNetworkView as default
};
