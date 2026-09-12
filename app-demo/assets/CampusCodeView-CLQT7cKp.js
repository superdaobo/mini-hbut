import { _ as _export_sfc, m as useI18n, t, p as tf, d as axiosInstance } from "./app-demo-CUOWTnz-.js";
import { q as qrToDataURL } from "./qrcode-DqJHidZ9.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-Dh0eXg1s.js";
import { o as onMounted, l as onBeforeUnmount, a as openBlock, c as createElementBlock, p as createVNode, u as unref, b as createBaseVNode, n as normalizeClass, t as toDisplayString, d as createCommentVNode, r as ref, C as nextTick, h as computed } from "./vue-core-Dzs4fLAU.js";
import "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1 = { class: "campus-code-view" };
const _hoisted_2 = { class: "mode-panel" };
const _hoisted_3 = ["disabled"];
const _hoisted_4 = ["disabled"];
const _hoisted_5 = { class: "status-panel" };
const _hoisted_6 = { class: "line" };
const _hoisted_7 = { class: "label" };
const _hoisted_8 = { class: "value" };
const _hoisted_9 = { class: "line" };
const _hoisted_10 = { class: "label" };
const _hoisted_11 = { class: "value" };
const _hoisted_12 = { class: "line" };
const _hoisted_13 = { class: "label" };
const _hoisted_14 = { class: "value" };
const _hoisted_15 = { class: "qr-panel" };
const _hoisted_16 = {
  key: 0,
  class: "loading-block"
};
const _hoisted_17 = {
  key: 1,
  class: "qr-body"
};
const _hoisted_18 = ["src", "alt"];
const _hoisted_19 = {
  key: 1,
  class: "qr-empty"
};
const _hoisted_20 = {
  key: 2,
  class: "banner error"
};
const _hoisted_21 = { class: "meta-grid" };
const _hoisted_22 = { class: "meta-item" };
const _hoisted_23 = { class: "meta-item" };
const _hoisted_24 = { class: "meta-item" };
const _hoisted_25 = { class: "meta-item" };
const _hoisted_26 = ["disabled"];
const _hoisted_27 = {
  key: 0,
  class: "order-panel"
};
const DEV_CODE_KEY = "hbu_campus_code_devcode";
const MODE_KEY = "hbu_campus_code_mode";
const _sfc_main = {
  __name: "CampusCodeView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const API_BASE = "/api";
    const loadingConfig = ref(false);
    const loadingCode = ref(false);
    const mode = ref("online");
    const configData = ref({});
    const qrcodeText = ref("");
    const qrImageDataUrl = ref("");
    const balance = ref("--");
    const idSerial = ref("");
    const userName = ref("");
    const errorMsg = ref("");
    const statusText = ref("");
    const statusType = ref("idle");
    const lastRefreshAt = ref("");
    const orderSnapshot = ref(null);
    let refreshTimer = null;
    let orderTimer = null;
    let orderPolling = false;
    const { t: tLocale } = useI18n();
    const normalizeMode = (value) => {
      const raw = String(value || "").trim().toLowerCase();
      return raw === "offline" ? "offline" : "online";
    };
    const currentModeLabel = computed(
      () => tLocale(mode.value === "offline" ? "campuscode.mode.offline" : "campuscode.mode.online")
    );
    const canOnline = computed(() => configData.value?.disableOnline !== true);
    const canOffline = computed(() => configData.value?.enableOffline === true);
    const refreshSecond = computed(() => {
      const raw = Number(configData.value?.refreshSecond || 60);
      if (!Number.isFinite(raw) || raw < 15) return 60;
      return Math.min(raw, 180);
    });
    const isOfflineMode = computed(() => mode.value === "offline");
    const autoRefreshHint = computed(
      () => isOfflineMode.value ? tLocale("campuscode.mode.offlineHint") : tf("campuscode.mode.onlineHint", { n: refreshSecond.value })
    );
    const ensureDevCode = () => {
      try {
        const saved = String(localStorage.getItem(DEV_CODE_KEY) || "").trim();
        if (/^\d{12,22}$/.test(saved)) return saved;
        const next = `${Date.now()}${Math.floor(Math.random() * 1e6).toString().padStart(6, "0")}`;
        localStorage.setItem(DEV_CODE_KEY, next);
        return next;
      } catch {
        return "17724566707419069471";
      }
    };
    const saveMode = (value) => {
      try {
        localStorage.setItem(MODE_KEY, value);
      } catch {
      }
    };
    const loadMode = () => {
      try {
        return normalizeMode(localStorage.getItem(MODE_KEY));
      } catch {
        return "online";
      }
    };
    const clearTimers = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      if (orderTimer) {
        clearTimeout(orderTimer);
        orderTimer = null;
      }
    };
    const renderQrCode = async () => {
      qrImageDataUrl.value = "";
      if (!qrcodeText.value) {
        return;
      }
      try {
        qrImageDataUrl.value = await qrToDataURL(qrcodeText.value, {
          text: qrcodeText.value,
          width: 248,
          margin: 1,
          color: {
            dark: "#0f172a",
            light: "#ffffff"
          }
        });
      } catch (error) {
        qrImageDataUrl.value = `https://api.qrserver.com/v1/create-qr-code/?size=248x248&data=${encodeURIComponent(
          qrcodeText.value
        )}`;
      }
    };
    const fetchCampusCodeConfig = async () => {
      loadingConfig.value = true;
      try {
        const devCode = ensureDevCode();
        const { data } = await axiosInstance.post(`${API_BASE}/v2/campus_code/config`, {
          dev_code: devCode,
          student_id: props.studentId
        });
        if (!data?.success) {
          throw new Error(data?.message || data?.error || t("campuscode.error.configRequest"));
        }
        configData.value = data.resultData || {};
      } finally {
        loadingConfig.value = false;
      }
    };
    const applyModeAvailability = () => {
      if (mode.value === "offline" && !canOffline.value) {
        mode.value = canOnline.value ? "online" : "offline";
      }
      if (mode.value === "online" && !canOnline.value && canOffline.value) {
        mode.value = "offline";
      }
      saveMode(mode.value);
    };
    const mapOrderStatus = (code) => {
      const statusCode = String(code || "");
      switch (statusCode) {
        case "1":
          return { type: "success", text: t("campuscode.status.paid") };
        case "2":
          return { type: "warn", text: t("campuscode.status.used") };
        case "4":
          return { type: "warn", text: t("campuscode.status.illegal") };
        case "6":
          return { type: "warn", text: t("campuscode.status.lowBalance") };
        case "7":
          return { type: "warn", text: t("campuscode.status.payError") };
        case "5":
        default:
          return { type: "idle", text: t("campuscode.status.waiting") };
      }
    };
    const scheduleAutoRefresh = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      if (isOfflineMode.value) return;
      refreshTimer = setTimeout(() => {
        refreshCampusCode({ silent: true }).catch(() => {
        });
      }, refreshSecond.value * 1e3);
    };
    const scheduleOrderPolling = () => {
      if (orderTimer) {
        clearTimeout(orderTimer);
        orderTimer = null;
      }
      if (!qrcodeText.value) return;
      orderTimer = setTimeout(() => {
        queryOrderStatus().catch(() => {
        });
      }, 3e3);
    };
    const queryOrderStatus = async () => {
      if (orderPolling || !qrcodeText.value) {
        scheduleOrderPolling();
        return;
      }
      orderPolling = true;
      try {
        const { data } = await axiosInstance.post(`${API_BASE}/v2/campus_code/order_status`, {
          qrcode: qrcodeText.value,
          offline: isOfflineMode.value,
          student_id: props.studentId
        });
        if (!data?.success) {
          scheduleOrderPolling();
          return;
        }
        const result = data.resultData || {};
        orderSnapshot.value = result;
        const mapped = mapOrderStatus(result.status);
        statusType.value = mapped.type;
        statusText.value = mapped.text;
        if (String(result.status || "") === "1") {
          await refreshCampusCode({ silent: true });
          return;
        }
      } catch {
      } finally {
        orderPolling = false;
      }
      scheduleOrderPolling();
    };
    const refreshCampusCode = async ({ silent = false } = {}) => {
      if (loadingCode.value) return;
      loadingCode.value = true;
      if (!silent) {
        errorMsg.value = "";
      }
      clearTimers();
      try {
        const devCode = ensureDevCode();
        const { data } = await axiosInstance.post(`${API_BASE}/v2/campus_code/qrcode`, {
          mode: mode.value,
          qrcode_type: "",
          dev_code: devCode,
          student_id: props.studentId
        });
        if (!data?.success) {
          throw new Error(data?.message || data?.error || t("campuscode.error.qrRequest"));
        }
        const result = data.resultData || {};
        qrcodeText.value = String(result.qrcode || "").trim();
        balance.value = String(result.balance || "--");
        idSerial.value = String(result.idSerial || "").trim();
        userName.value = String(result.userName || "").trim();
        lastRefreshAt.value = (/* @__PURE__ */ new Date()).toLocaleTimeString();
        const mapped = mapOrderStatus("5");
        statusType.value = mapped.type;
        statusText.value = mapped.text;
        await nextTick();
        await renderQrCode();
        scheduleAutoRefresh();
        scheduleOrderPolling();
      } catch (error) {
        qrcodeText.value = "";
        qrImageDataUrl.value = "";
        if (!silent) {
          errorMsg.value = error?.message || t("campuscode.error.loadFailed");
        }
      } finally {
        loadingCode.value = false;
      }
    };
    const handleSwitchMode = async (nextMode) => {
      const target = normalizeMode(nextMode);
      if (target === mode.value) return;
      if (target === "online" && !canOnline.value) return;
      if (target === "offline" && !canOffline.value) return;
      mode.value = target;
      saveMode(target);
      await refreshCampusCode();
    };
    const handleBack = () => emit("back");
    onMounted(async () => {
      mode.value = loadMode();
      try {
        await fetchCampusCodeConfig();
        applyModeAvailability();
      } catch (error) {
        errorMsg.value = error?.message || t("campuscode.error.configFailed");
      }
      await refreshCampusCode({ silent: false });
    });
    onBeforeUnmount(() => {
      clearTimers();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          icon: "qr_code",
          title: unref(tLocale)("campuscode.title"),
          onBack: handleBack
        }, null, 8, ["title"]),
        createBaseVNode("section", _hoisted_2, [
          createBaseVNode("button", {
            class: normalizeClass(["mode-chip", { active: mode.value === "online", disabled: !canOnline.value }]),
            disabled: !canOnline.value || loadingCode.value,
            onClick: _cache[0] || (_cache[0] = ($event) => handleSwitchMode("online"))
          }, toDisplayString(unref(tLocale)("campuscode.mode.online")), 11, _hoisted_3),
          createBaseVNode("button", {
            class: normalizeClass(["mode-chip", { active: mode.value === "offline", disabled: !canOffline.value }]),
            disabled: !canOffline.value || loadingCode.value,
            onClick: _cache[1] || (_cache[1] = ($event) => handleSwitchMode("offline"))
          }, toDisplayString(unref(tLocale)("campuscode.mode.offline")), 11, _hoisted_4)
        ]),
        createBaseVNode("section", _hoisted_5, [
          createBaseVNode("div", _hoisted_6, [
            createBaseVNode("span", _hoisted_7, toDisplayString(unref(tLocale)("campuscode.mode.current")), 1),
            createBaseVNode("span", _hoisted_8, toDisplayString(currentModeLabel.value), 1)
          ]),
          createBaseVNode("div", _hoisted_9, [
            createBaseVNode("span", _hoisted_10, toDisplayString(unref(tLocale)("campuscode.mode.refreshPolicy")), 1),
            createBaseVNode("span", _hoisted_11, toDisplayString(autoRefreshHint.value), 1)
          ]),
          createBaseVNode("div", _hoisted_12, [
            createBaseVNode("span", _hoisted_13, toDisplayString(unref(tLocale)("campuscode.mode.lastRefresh")), 1),
            createBaseVNode("span", _hoisted_14, toDisplayString(lastRefreshAt.value || "--:--:--"), 1)
          ])
        ]),
        createBaseVNode("section", _hoisted_15, [
          loadingConfig.value || loadingCode.value ? (openBlock(), createElementBlock("div", _hoisted_16, [
            _cache[3] || (_cache[3] = createBaseVNode("div", { class: "spinner" }, null, -1)),
            createBaseVNode("p", null, toDisplayString(loadingConfig.value ? unref(tLocale)("campuscode.loading.config") : unref(tLocale)("campuscode.loading.qr")), 1)
          ])) : (openBlock(), createElementBlock("div", _hoisted_17, [
            qrImageDataUrl.value ? (openBlock(), createElementBlock("img", {
              key: 0,
              src: qrImageDataUrl.value,
              class: "qr-fallback-image",
              alt: unref(tLocale)("campuscode.qr.alt")
            }, null, 8, _hoisted_18)) : createCommentVNode("", true),
            !qrcodeText.value ? (openBlock(), createElementBlock("p", _hoisted_19, toDisplayString(unref(tLocale)("campuscode.qr.empty")), 1)) : createCommentVNode("", true)
          ])),
          errorMsg.value ? (openBlock(), createElementBlock("div", _hoisted_20, toDisplayString(errorMsg.value), 1)) : createCommentVNode("", true),
          statusText.value ? (openBlock(), createElementBlock("div", {
            key: 3,
            class: normalizeClass(["banner", statusType.value])
          }, toDisplayString(statusText.value), 3)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_21, [
            createBaseVNode("div", _hoisted_22, [
              createBaseVNode("span", null, toDisplayString(unref(tLocale)("campuscode.meta.studentId")), 1),
              createBaseVNode("strong", null, toDisplayString(idSerial.value || unref(tLocale)("campuscode.meta.unknown")), 1)
            ]),
            createBaseVNode("div", _hoisted_23, [
              createBaseVNode("span", null, toDisplayString(unref(tLocale)("campuscode.meta.name")), 1),
              createBaseVNode("strong", null, toDisplayString(userName.value || unref(tLocale)("campuscode.meta.unknown")), 1)
            ]),
            createBaseVNode("div", _hoisted_24, [
              createBaseVNode("span", null, toDisplayString(unref(tLocale)("campuscode.meta.balance")), 1),
              createBaseVNode("strong", null, "¥ " + toDisplayString(balance.value), 1)
            ]),
            createBaseVNode("div", _hoisted_25, [
              createBaseVNode("span", null, toDisplayString(unref(tLocale)("campuscode.meta.mode")), 1),
              createBaseVNode("strong", null, toDisplayString(currentModeLabel.value), 1)
            ])
          ]),
          createBaseVNode("button", {
            class: "refresh-btn",
            disabled: loadingCode.value,
            onClick: _cache[2] || (_cache[2] = ($event) => refreshCampusCode())
          }, toDisplayString(loadingCode.value ? unref(tLocale)("campuscode.refresh.working") : unref(tLocale)("campuscode.refresh.idle")), 9, _hoisted_26)
        ]),
        orderSnapshot.value ? (openBlock(), createElementBlock("section", _hoisted_27, [
          createBaseVNode("h3", null, toDisplayString(unref(tLocale)("campuscode.order.title")), 1),
          createBaseVNode("p", null, toDisplayString(unref(tf)("campuscode.order.statusCode", { code: orderSnapshot.value.status || "-" })), 1),
          createBaseVNode("p", null, toDisplayString(unref(tf)("campuscode.order.txAmt", { amount: orderSnapshot.value.txAmt || "0.00" })), 1),
          createBaseVNode("p", null, toDisplayString(unref(tf)("campuscode.order.payment", { name: orderSnapshot.value.paymentName || unref(tLocale)("campuscode.order.defaultPayment") })), 1)
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const CampusCodeView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-b7063a65"]]);
export {
  CampusCodeView as default
};
