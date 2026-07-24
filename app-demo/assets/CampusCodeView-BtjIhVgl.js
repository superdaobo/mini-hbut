import { _ as _export_sfc, a as axiosInstance } from "./app-demo-CxKBY5JQ.js";
import { q as qrToDataURL } from "./qrcode-aDWm1EFy.js";
import { _ as _sfc_main$1 } from "./TPageHeader-D5pZCgZr.js";
import { o as onMounted, a as ref, m as onBeforeUnmount, c as createElementBlock, b as openBlock, q as createVNode, d as createBaseVNode, f as createCommentVNode, u as unref, n as normalizeClass, e as computed, t as toDisplayString, z as nextTick } from "./vue-core-DdLVj9yW.js";
import "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "campus-code-view" };
const _hoisted_2 = { class: "mode-panel" };
const _hoisted_3 = ["disabled"];
const _hoisted_4 = ["disabled"];
const _hoisted_5 = { class: "status-panel" };
const _hoisted_6 = { class: "line" };
const _hoisted_7 = { class: "value" };
const _hoisted_8 = { class: "line" };
const _hoisted_9 = { class: "value" };
const _hoisted_10 = { class: "line" };
const _hoisted_11 = { class: "value" };
const _hoisted_12 = { class: "qr-panel" };
const _hoisted_13 = {
  key: 0,
  class: "loading-block"
};
const _hoisted_14 = {
  key: 1,
  class: "qr-body"
};
const _hoisted_15 = ["src"];
const _hoisted_16 = {
  key: 1,
  class: "qr-empty"
};
const _hoisted_17 = {
  key: 2,
  class: "banner error"
};
const _hoisted_18 = { class: "meta-grid" };
const _hoisted_19 = { class: "meta-item" };
const _hoisted_20 = { class: "meta-item" };
const _hoisted_21 = { class: "meta-item" };
const _hoisted_22 = { class: "meta-item" };
const _hoisted_23 = ["disabled"];
const _hoisted_24 = {
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
    const normalizeMode = (value) => {
      const raw = String(value || "").trim().toLowerCase();
      return raw === "offline" ? "offline" : "online";
    };
    const currentModeLabel = computed(() => mode.value === "offline" ? "高能模式" : "在线模式");
    const canOnline = computed(() => configData.value?.disableOnline !== true);
    const canOffline = computed(() => configData.value?.enableOffline === true);
    const refreshSecond = computed(() => {
      const raw = Number(configData.value?.refreshSecond || 60);
      if (!Number.isFinite(raw) || raw < 15) return 60;
      return Math.min(raw, 180);
    });
    const isOfflineMode = computed(() => mode.value === "offline");
    const autoRefreshHint = computed(
      () => isOfflineMode.value ? "高能模式下为手动刷新" : `在线模式每 ${refreshSecond.value} 秒自动刷新`
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
          throw new Error(data?.message || data?.error || "校园码配置请求失败");
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
          return { type: "success", text: "检测到支付成功，已自动刷新新二维码。" };
        case "2":
          return { type: "warn", text: "当前二维码已被使用，请刷新后继续。" };
        case "4":
          return { type: "warn", text: "二维码状态异常（非法码），请刷新。" };
        case "6":
          return { type: "warn", text: "校园卡余额不足，请充值后重试。" };
        case "7":
          return { type: "warn", text: "支付异常，请稍后重试或联系管理员。" };
        case "5":
        default:
          return { type: "idle", text: "等待扫码中…" };
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
          throw new Error(data?.message || data?.error || "校园码请求失败");
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
          errorMsg.value = error?.message || "校园码加载失败";
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
        errorMsg.value = error?.message || "校园码配置加载失败";
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
          title: "校园码",
          onBack: handleBack
        }),
        createBaseVNode("section", _hoisted_2, [
          createBaseVNode("button", {
            class: normalizeClass(["mode-chip", { active: mode.value === "online", disabled: !canOnline.value }]),
            disabled: !canOnline.value || loadingCode.value,
            onClick: _cache[0] || (_cache[0] = ($event) => handleSwitchMode("online"))
          }, " 在线模式 ", 10, _hoisted_3),
          createBaseVNode("button", {
            class: normalizeClass(["mode-chip", { active: mode.value === "offline", disabled: !canOffline.value }]),
            disabled: !canOffline.value || loadingCode.value,
            onClick: _cache[1] || (_cache[1] = ($event) => handleSwitchMode("offline"))
          }, " 高能模式 ", 10, _hoisted_4)
        ]),
        createBaseVNode("section", _hoisted_5, [
          createBaseVNode("div", _hoisted_6, [
            _cache[3] || (_cache[3] = createBaseVNode("span", { class: "label" }, "当前模式", -1)),
            createBaseVNode("span", _hoisted_7, toDisplayString(currentModeLabel.value), 1)
          ]),
          createBaseVNode("div", _hoisted_8, [
            _cache[4] || (_cache[4] = createBaseVNode("span", { class: "label" }, "刷新策略", -1)),
            createBaseVNode("span", _hoisted_9, toDisplayString(autoRefreshHint.value), 1)
          ]),
          createBaseVNode("div", _hoisted_10, [
            _cache[5] || (_cache[5] = createBaseVNode("span", { class: "label" }, "最后刷新", -1)),
            createBaseVNode("span", _hoisted_11, toDisplayString(lastRefreshAt.value || "--:--:--"), 1)
          ])
        ]),
        createBaseVNode("section", _hoisted_12, [
          loadingConfig.value || loadingCode.value ? (openBlock(), createElementBlock("div", _hoisted_13, [
            _cache[6] || (_cache[6] = createBaseVNode("div", { class: "spinner" }, null, -1)),
            createBaseVNode("p", null, toDisplayString(loadingConfig.value ? "加载校园码配置中..." : "正在生成校园码..."), 1)
          ])) : (openBlock(), createElementBlock("div", _hoisted_14, [
            qrImageDataUrl.value ? (openBlock(), createElementBlock("img", {
              key: 0,
              src: qrImageDataUrl.value,
              class: "qr-fallback-image",
              alt: "校园码二维码"
            }, null, 8, _hoisted_15)) : createCommentVNode("", true),
            !qrcodeText.value ? (openBlock(), createElementBlock("p", _hoisted_16, "暂无可用二维码，请点击刷新")) : createCommentVNode("", true)
          ])),
          errorMsg.value ? (openBlock(), createElementBlock("div", _hoisted_17, toDisplayString(errorMsg.value), 1)) : createCommentVNode("", true),
          statusText.value ? (openBlock(), createElementBlock("div", {
            key: 3,
            class: normalizeClass(["banner", statusType.value])
          }, toDisplayString(statusText.value), 3)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_18, [
            createBaseVNode("div", _hoisted_19, [
              _cache[7] || (_cache[7] = createBaseVNode("span", null, "学号", -1)),
              createBaseVNode("strong", null, toDisplayString(idSerial.value || "未知"), 1)
            ]),
            createBaseVNode("div", _hoisted_20, [
              _cache[8] || (_cache[8] = createBaseVNode("span", null, "姓名", -1)),
              createBaseVNode("strong", null, toDisplayString(userName.value || "未知"), 1)
            ]),
            createBaseVNode("div", _hoisted_21, [
              _cache[9] || (_cache[9] = createBaseVNode("span", null, "余额", -1)),
              createBaseVNode("strong", null, "¥ " + toDisplayString(balance.value), 1)
            ]),
            createBaseVNode("div", _hoisted_22, [
              _cache[10] || (_cache[10] = createBaseVNode("span", null, "模式", -1)),
              createBaseVNode("strong", null, toDisplayString(currentModeLabel.value), 1)
            ])
          ]),
          createBaseVNode("button", {
            class: "refresh-btn",
            disabled: loadingCode.value,
            onClick: _cache[2] || (_cache[2] = ($event) => refreshCampusCode())
          }, toDisplayString(loadingCode.value ? "刷新中..." : "手动刷新二维码"), 9, _hoisted_23)
        ]),
        orderSnapshot.value ? (openBlock(), createElementBlock("section", _hoisted_24, [
          _cache[11] || (_cache[11] = createBaseVNode("h3", null, "最近状态", -1)),
          createBaseVNode("p", null, "状态码：" + toDisplayString(orderSnapshot.value.status || "-"), 1),
          createBaseVNode("p", null, "交易金额：" + toDisplayString(orderSnapshot.value.txAmt || "0.00"), 1),
          createBaseVNode("p", null, "支付方式：" + toDisplayString(orderSnapshot.value.paymentName || "虚拟卡被扫支付"), 1)
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const CampusCodeView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-73eab368"]]);
export {
  CampusCodeView as default
};
