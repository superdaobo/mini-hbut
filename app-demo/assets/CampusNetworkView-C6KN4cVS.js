import { r as ref, o as onMounted, a as openBlock, c as createElementBlock, p as createVNode, u as unref, b as createBaseVNode, t as toDisplayString, n as normalizeClass, K as withDirectives, L as vModelText, V as vModelDynamic, F as Fragment, f as renderList, d as createCommentVNode, h as computed } from "./vue-core-Dzs4fLAU.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { _ as _export_sfc, az as readCampusNetworkSettings, m as useI18n, aA as loadRememberedCredential, aB as buildCampusAccountKey, aC as probeCampusNetwork, aD as campusStatusLabelKey, aE as CAMPUS_CARRIER_OPTIONS, aF as campusCarrierHintKey, aG as campusCarrierLabelKey, j as showToast, aH as loginCampusNetwork, p as tf, aI as HBUT_CAMPUS_GATEWAYS, aJ as writeCampusNetworkSettings } from "./app-demo-CUOWTnz-.js";
import { a as isTauriRuntime } from "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "campus-network-view" };
const _hoisted_2 = { class: "glass-card status-card" };
const _hoisted_3 = { class: "status-row" };
const _hoisted_4 = { class: "status-copy" };
const _hoisted_5 = { class: "status-label" };
const _hoisted_6 = { class: "status-value" };
const _hoisted_7 = ["disabled", "aria-label"];
const _hoisted_8 = { class: "glass-card form-card" };
const _hoisted_9 = { class: "field" };
const _hoisted_10 = ["placeholder"];
const _hoisted_11 = { class: "field" };
const _hoisted_12 = { class: "password-row" };
const _hoisted_13 = ["type", "placeholder"];
const _hoisted_14 = ["aria-label"];
const _hoisted_15 = { class: "material-symbols-outlined" };
const _hoisted_16 = { class: "toggle-row" };
const _hoisted_17 = ["aria-checked"];
const _hoisted_18 = { class: "option-group" };
const _hoisted_19 = { class: "chip-row" };
const _hoisted_20 = ["onClick"];
const _hoisted_21 = { class: "toggle-row" };
const _hoisted_22 = ["aria-checked"];
const _hoisted_23 = ["disabled"];
const _hoisted_24 = {
  key: 0,
  class: "advanced-box"
};
const _hoisted_25 = { class: "field" };
const _hoisted_26 = ["value", "placeholder"];
const _hoisted_27 = { class: "hint" };
const _hoisted_28 = { class: "hint" };
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
    const { t: tLocale } = useI18n();
    const gatewayPresetText = computed(
      () => tf("campusnet.advanced.gatewayPreset", { gateways: HBUT_CAMPUS_GATEWAYS.join("、") })
    );
    const statusText = computed(() => {
      if (probing.value) return tLocale("campusnet.status.checking");
      const base = tLocale(campusStatusLabelKey(status.value));
      if (status.value === "error" || status.value === "needs_auth") {
        const msg = probeMessage.value || settings.value.last_message;
        return msg ? `${base}${tLocale("campusnet.status.separator")}${msg}` : base;
      }
      return probeMessage.value || base;
    });
    const carrierOptions = computed(
      () => CAMPUS_CARRIER_OPTIONS.map((item) => ({
        ...item,
        label: tLocale(campusCarrierLabelKey(item.id)),
        hint: tLocale(campusCarrierHintKey(item.id))
      }))
    );
    const refreshProbe = async () => {
      if (!isTauriRuntime()) {
        status.value = "unknown";
        probeMessage.value = t("campusnet.status.probeHint");
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
        showToast(t("campusnet.login.errorNoStudentId"), "error");
        return;
      }
      if (!password.value) {
        showToast(t("campusnet.login.errorNoPassword"), "error");
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
          title: unref(tLocale)("campusnet.title"),
          icon: "wifi",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, null, 8, ["title"]),
        createBaseVNode("section", _hoisted_2, [
          createBaseVNode("div", _hoisted_3, [
            _cache[4] || (_cache[4] = createBaseVNode("span", { class: "material-symbols-outlined status-icon" }, "router", -1)),
            createBaseVNode("div", _hoisted_4, [
              createBaseVNode("span", _hoisted_5, toDisplayString(unref(tLocale)("campusnet.status.label")), 1),
              createBaseVNode("span", _hoisted_6, toDisplayString(statusText.value), 1)
            ]),
            createBaseVNode("button", {
              class: "icon-btn",
              type: "button",
              disabled: probing.value,
              onClick: refreshProbe,
              "aria-label": unref(tLocale)("campusnet.status.refreshAria")
            }, [
              createBaseVNode("span", {
                class: normalizeClass(["material-symbols-outlined", { spin: probing.value }])
              }, "refresh", 2)
            ], 8, _hoisted_7)
          ])
        ]),
        createBaseVNode("section", _hoisted_8, [
          createBaseVNode("label", _hoisted_9, [
            createBaseVNode("span", null, toDisplayString(unref(tLocale)("campusnet.form.studentId")), 1),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => account.value = $event),
              type: "text",
              inputmode: "numeric",
              autocomplete: "username",
              placeholder: unref(tLocale)("campusnet.form.studentIdPlaceholder")
            }, null, 8, _hoisted_10), [
              [vModelText, account.value]
            ])
          ]),
          createBaseVNode("label", _hoisted_11, [
            createBaseVNode("span", null, toDisplayString(unref(tLocale)("campusnet.form.password")), 1),
            createBaseVNode("div", _hoisted_12, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => password.value = $event),
                type: showPassword.value ? "text" : "password",
                autocomplete: "current-password",
                placeholder: unref(tLocale)("campusnet.form.passwordPlaceholder")
              }, null, 8, _hoisted_13), [
                [vModelDynamic, password.value]
              ]),
              createBaseVNode("button", {
                class: "icon-btn",
                type: "button",
                onClick: _cache[3] || (_cache[3] = ($event) => showPassword.value = !showPassword.value),
                "aria-label": unref(tLocale)("campusnet.form.showPasswordAria")
              }, [
                createBaseVNode("span", _hoisted_15, toDisplayString(showPassword.value ? "visibility_off" : "visibility"), 1)
              ], 8, _hoisted_14)
            ])
          ]),
          createBaseVNode("div", _hoisted_16, [
            createBaseVNode("div", null, [
              createBaseVNode("strong", null, toDisplayString(unref(tLocale)("campusnet.remember.title")), 1),
              createBaseVNode("small", null, toDisplayString(unref(tLocale)("campusnet.remember.desc")), 1)
            ]),
            createBaseVNode("button", {
              class: normalizeClass(["toggle", { on: settings.value.remember_password }]),
              type: "button",
              role: "switch",
              "aria-checked": settings.value.remember_password,
              onClick: handleToggleRemember
            }, null, 10, _hoisted_17)
          ]),
          createBaseVNode("div", _hoisted_18, [
            createBaseVNode("label", null, toDisplayString(unref(tLocale)("campusnet.carrier.label")), 1),
            createBaseVNode("div", _hoisted_19, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(carrierOptions.value, (item) => {
                return openBlock(), createElementBlock("button", {
                  key: item.id,
                  type: "button",
                  class: normalizeClass(["option-chip", { active: settings.value.carrier === item.id }]),
                  onClick: ($event) => handleCarrierChange(item.id)
                }, [
                  createBaseVNode("strong", null, toDisplayString(item.label), 1),
                  createBaseVNode("small", null, toDisplayString(item.hint), 1)
                ], 10, _hoisted_20);
              }), 128))
            ])
          ]),
          createBaseVNode("div", _hoisted_21, [
            createBaseVNode("div", null, [
              createBaseVNode("strong", null, toDisplayString(unref(tLocale)("campusnet.autoLogin.title")), 1),
              createBaseVNode("small", null, toDisplayString(unref(tLocale)("campusnet.autoLogin.desc")), 1)
            ]),
            createBaseVNode("button", {
              class: normalizeClass(["toggle", { on: settings.value.auto_login }]),
              type: "button",
              role: "switch",
              "aria-checked": settings.value.auto_login,
              onClick: handleToggleAutoLogin
            }, null, 10, _hoisted_22)
          ]),
          createBaseVNode("button", {
            class: "primary-btn",
            type: "button",
            disabled: loggingIn.value,
            onClick: handleLogin
          }, toDisplayString(loggingIn.value ? unref(tLocale)("campusnet.login.working") : unref(tLocale)("campusnet.login.idle")), 9, _hoisted_23),
          createBaseVNode("button", {
            class: "link-btn",
            type: "button",
            onClick: handleToggleAdvanced
          }, toDisplayString(settings.value.show_advanced ? unref(tLocale)("campusnet.advanced.collapse") : unref(tLocale)("campusnet.advanced.expand")), 1),
          settings.value.show_advanced ? (openBlock(), createElementBlock("div", _hoisted_24, [
            createBaseVNode("label", _hoisted_25, [
              createBaseVNode("span", null, toDisplayString(unref(tLocale)("campusnet.advanced.gatewayLabel")), 1),
              createBaseVNode("input", {
                value: settings.value.gateway_override,
                type: "url",
                placeholder: unref(tLocale)("campusnet.advanced.gatewayPlaceholder"),
                onInput: handleGatewayInput
              }, null, 40, _hoisted_26)
            ]),
            createBaseVNode("p", _hoisted_27, toDisplayString(gatewayPresetText.value), 1),
            createBaseVNode("p", _hoisted_28, toDisplayString(unref(tLocale)("campusnet.advanced.autoLoginHint")), 1)
          ])) : createCommentVNode("", true)
        ])
      ]);
    };
  }
};
const CampusNetworkView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-70d65f45"]]);
export {
  CampusNetworkView as default
};
