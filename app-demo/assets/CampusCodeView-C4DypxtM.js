import { _ as _export_sfc, u as useI18n, v as t, z as tf, j as axiosInstance } from "./app-demo-BXR7Wchv.js";
import { q as qrToDataURL } from "./qrcode-CiIpSBum.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-DPr8J7w0.js";
import { o as onMounted, p as onBeforeUnmount, a as openBlock, c as createElementBlock, k as createVNode, u as unref, b as createBaseVNode, n as normalizeClass, t as toDisplayString, d as createCommentVNode, r as ref, h as computed } from "./vue-core-CVT-P0lT.js";
import "./runtime-bridge-z2ulLxEq.js";
import "./more-modules-DkooyOvE.js";
import "./debug-tools-B-8Pd-e1.js";
import "./capture-CoTlEFL0.js";
const RETRY_DELAYS_MS = [5e3, 1e4, 2e4, 3e4];
const KIND_NORMALIZATION = {
  campus_code_auth_required: "auth_required",
  campus_code_empty_response: "empty_response",
  campus_code_non_json: "non_json",
  campus_code_upstream_unavailable: "upstream_unavailable",
  campus_code_transport: "transport",
  campus_code_business_rejected: "business_rejected"
};
const TRANSIENT_RAW_KINDS = /* @__PURE__ */ new Set([
  "campus_code_empty_response",
  "campus_code_non_json",
  "campus_code_upstream_unavailable",
  "campus_code_transport"
]);
const asText = (value) => typeof value === "string" ? value.trim() : "";
const readErrorInfo = (value) => {
  if (value === null || value === void 0) return null;
  if (typeof value === "string") {
    const text = value.trim();
    return text ? { kind: null, message: text } : null;
  }
  if (typeof value !== "object") return null;
  const info = { kind: null, message: "" };
  const directKind = asText(value.kind);
  if (directKind) info.kind = directKind;
  const directMessage = asText(value.message);
  if (directMessage) info.message = directMessage;
  if (!info.kind && !info.message) {
    const nested = readErrorInfo(value.error);
    if (nested) {
      info.kind = nested.kind;
      info.message = nested.message;
    }
  }
  return info.kind || info.message ? info : null;
};
const extractErrorInfo = (error) => {
  const candidates = [];
  if (error !== null && typeof error === "object") {
    const response = error.response;
    if (response !== null && typeof response === "object") {
      candidates.push(response.data);
      candidates.push(response);
    }
    candidates.push(error);
  } else {
    candidates.push(error);
  }
  for (const candidate of candidates) {
    const info = readErrorInfo(candidate);
    if (info && info.kind) return info;
  }
  for (const candidate of candidates) {
    const info = readErrorInfo(candidate);
    if (info && info.message) return info;
  }
  return { kind: null, message: "" };
};
const classifyCampusCodeFailure = (error) => {
  const info = extractErrorInfo(error);
  const rawKind = info.kind;
  const kind = rawKind && rawKind in KIND_NORMALIZATION ? KIND_NORMALIZATION[rawKind] : "unknown";
  const retryable = kind === "unknown" || rawKind && TRANSIENT_RAW_KINDS.has(rawKind);
  return {
    kind,
    rawKind: rawKind ? rawKind : null,
    message: info.message,
    retryable
  };
};
const nextRetryDelayMs = (failures) => {
  const count = Math.max(1, Math.floor(Number(failures) || 1));
  const index = Math.min(count - 1, RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[index];
};
const createCampusCodeRefreshChain = (options = {}) => {
  const {
    request,
    getIntervalMs = () => null,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    now = () => Date.now(),
    classify = classifyCampusCodeFailure,
    nextDelay = nextRetryDelayMs,
    onState = () => {
    },
    onSuccess = () => {
    },
    onFailure = () => {
    }
  } = options;
  let disposed = false;
  let pendingTimer = null;
  let requestSeq = 0;
  let failureCount = 0;
  let lastFailure = null;
  let lastSuccessAt = null;
  let retryDelayMs = null;
  let status = "idle";
  const snapshot = () => ({
    status,
    kind: lastFailure ? lastFailure.kind : null,
    message: lastFailure ? lastFailure.message : null,
    failureCount,
    retryDelayMs: status === "failed" ? retryDelayMs : null,
    lastSuccessAt
  });
  const emit = () => {
    onState(snapshot());
  };
  const clearPending = () => {
    if (pendingTimer !== null) {
      clearTimeoutFn(pendingTimer);
      pendingTimer = null;
    }
  };
  const scheduleTimer = (delayMs, fn) => {
    clearPending();
    if (disposed) return;
    pendingTimer = setTimeoutFn(() => {
      pendingTimer = null;
      void runAttempt(fn);
    }, delayMs);
  };
  const isStale = (seq) => disposed || seq !== requestSeq;
  const safeCallback = (fn, arg) => {
    try {
      fn(arg);
    } catch {
    }
  };
  const runAttempt = async (origin) => {
    if (disposed) return;
    const seq = ++requestSeq;
    status = "loading";
    emit();
    try {
      const payload = await request(origin);
      if (isStale(seq)) return;
      failureCount = 0;
      lastFailure = null;
      lastSuccessAt = now();
      retryDelayMs = null;
      status = "ready";
      emit();
      safeCallback(onSuccess, payload);
      const intervalMs = getIntervalMs();
      if (typeof intervalMs === "number" && intervalMs > 0) {
        scheduleTimer(intervalMs, "auto");
      }
    } catch (error) {
      if (isStale(seq)) return;
      const info = classify(error);
      failureCount += 1;
      lastFailure = { kind: info.kind, message: info.message };
      if (info.retryable) {
        const intervalMs = getIntervalMs();
        if (typeof intervalMs === "number" && intervalMs > 0) {
          const delay = nextDelay(failureCount);
          retryDelayMs = delay;
          status = "failed";
          emit();
          safeCallback(onFailure, info);
          scheduleTimer(delay, "retry");
        } else {
          retryDelayMs = null;
          status = "failed";
          emit();
          safeCallback(onFailure, info);
        }
      } else if (info.kind === "auth_required") {
        retryDelayMs = null;
        status = "stopped_auth";
        emit();
        safeCallback(onFailure, info);
      } else {
        retryDelayMs = null;
        status = "stopped_business";
        emit();
        safeCallback(onFailure, info);
      }
    }
  };
  const start = () => {
    if (disposed) return;
    void runAttempt("start");
  };
  const triggerNow = () => {
    if (disposed) return;
    clearPending();
    void runAttempt("manual");
  };
  const stop = () => {
    if (disposed) return;
    disposed = true;
    requestSeq += 1;
    clearPending();
    status = "stopped";
    emit();
  };
  const dispose = stop;
  return { start, triggerNow, stop, dispose };
};
const createOrderStatusPoller = (options = {}) => {
  const {
    request,
    getIntervalMs = () => 3e3,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    classify = classifyCampusCodeFailure,
    nextDelay = nextRetryDelayMs,
    shouldContinue = () => true,
    onState = () => {
    },
    onResult = () => {
    }
  } = options;
  let disposed = false;
  let pendingTimer = null;
  let requestSeq = 0;
  let failureCount = 0;
  let status = "idle";
  const snapshot = () => ({ status, failureCount });
  const emit = () => {
    onState(snapshot());
  };
  const clearPending = () => {
    if (pendingTimer !== null) {
      clearTimeoutFn(pendingTimer);
      pendingTimer = null;
    }
  };
  const scheduleTimer = (delayMs) => {
    clearPending();
    if (disposed) return;
    pendingTimer = setTimeoutFn(() => {
      pendingTimer = null;
      void runPoll();
    }, delayMs);
  };
  const isStale = (seq) => disposed || seq !== requestSeq;
  const safeCallback = (fn, arg) => {
    try {
      fn(arg);
    } catch {
    }
  };
  const runPoll = async () => {
    if (disposed) return;
    if (!shouldContinue()) {
      stop();
      return;
    }
    const seq = ++requestSeq;
    status = "polling";
    emit();
    try {
      const payload = await request();
      if (isStale(seq)) return;
      failureCount = 0;
      status = "ready";
      emit();
      safeCallback(onResult, payload);
      const intervalMs = getIntervalMs();
      if (typeof intervalMs === "number" && intervalMs > 0) {
        scheduleTimer(intervalMs);
      }
    } catch (error) {
      if (isStale(seq)) return;
      classify(error);
      failureCount += 1;
      status = "failed";
      emit();
      const delay = nextDelay(failureCount);
      scheduleTimer(delay);
    }
  };
  const start = () => {
    if (disposed) return;
    void runPoll();
  };
  const stop = () => {
    if (disposed) return;
    disposed = true;
    requestSeq += 1;
    clearPending();
    status = "stopped";
    emit();
  };
  const dispose = stop;
  return { start, stop, dispose };
};
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
  key: 3,
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
const ORDER_POLL_INTERVAL_MS = 3e3;
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
    const qrStatus = ref("idle");
    const qrFailureKind = ref(null);
    const qrRetryDelayMs = ref(null);
    const lastSuccessAt = ref(null);
    let qrRenderSeq = 0;
    let chainRef = null;
    let orderPollerRef = null;
    let visibilityHandler = null;
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
    const failureBanner = computed(() => {
      if (qrStatus.value === "failed") {
        const delay = qrRetryDelayMs.value;
        return typeof delay === "number" && delay > 0 ? tf("campuscode.state.recovering", { n: Math.round(delay / 1e3) }) : t("campuscode.state.recoverFailed");
      }
      if (qrStatus.value === "stopped_auth") return t("campuscode.state.stoppedAuth");
      if (qrStatus.value === "stopped_business") return t("campuscode.state.stoppedBusiness");
      return "";
    });
    const failureBannerType = computed(
      () => qrStatus.value === "stopped_auth" || qrStatus.value === "stopped_business" ? "error" : "warn"
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
    const renderQrCode = async () => {
      const seq = ++qrRenderSeq;
      const text = qrcodeText.value;
      qrImageDataUrl.value = "";
      if (!text) {
        return;
      }
      try {
        const dataUrl = await qrToDataURL(text, {
          text,
          width: 248,
          margin: 1,
          color: {
            dark: "#0f172a",
            light: "#ffffff"
          }
        });
        if (seq !== qrRenderSeq) return;
        qrImageDataUrl.value = dataUrl;
      } catch (error) {
        if (seq !== qrRenderSeq) return;
        qrImageDataUrl.value = `https://api.qrserver.com/v1/create-qr-code/?size=248x248&data=${encodeURIComponent(
          text
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
          const failure = classifyCampusCodeFailure(data);
          const message = failure.kind === "transport" ? t("campuscode.error.transport") : failure.message || t("campuscode.error.configRequest");
          throw new Error(message);
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
    const applyChainState = (state) => {
      qrStatus.value = state.status;
      qrFailureKind.value = state.kind;
      qrRetryDelayMs.value = state.retryDelayMs;
      if (typeof state.lastSuccessAt === "number") lastSuccessAt.value = state.lastSuccessAt;
    };
    const runQrRequest = async (_origin) => {
      const devCode = ensureDevCode();
      const { data } = await axiosInstance.post(`${API_BASE}/v2/campus_code/qrcode`, {
        mode: mode.value,
        qrcode_type: "",
        dev_code: devCode,
        student_id: props.studentId
      });
      if (!data?.success) {
        throw data ?? new Error(t("campuscode.error.qrRequest"));
      }
      return data.resultData || {};
    };
    const applyQrPayload = (payload) => {
      const result = payload || {};
      const code = String(result.qrcode || "").trim();
      qrcodeText.value = code;
      balance.value = String(result.balance || "--");
      idSerial.value = String(result.idSerial || "").trim();
      userName.value = String(result.userName || "").trim();
      lastRefreshAt.value = (/* @__PURE__ */ new Date()).toLocaleTimeString();
      orderSnapshot.value = null;
      const mapped = mapOrderStatus("5");
      statusType.value = mapped.type;
      statusText.value = mapped.text;
      void renderQrCode();
      startOrderPolling();
    };
    const applyQrFailure = () => {
      qrRenderSeq += 1;
      qrcodeText.value = "";
      qrImageDataUrl.value = "";
      orderSnapshot.value = null;
      stopOrderPolling();
    };
    const startChain = () => {
      stopChain();
      chainRef = createCampusCodeRefreshChain({
        request: runQrRequest,
        getIntervalMs: () => isOfflineMode.value ? null : refreshSecond.value * 1e3,
        onState: applyChainState,
        onSuccess: applyQrPayload,
        onFailure: applyQrFailure
      });
      chainRef.start();
    };
    const stopChain = () => {
      if (chainRef) {
        chainRef.stop();
        chainRef = null;
      }
    };
    const manualRefresh = () => {
      if (chainRef) {
        chainRef.triggerNow();
      } else {
        startChain();
      }
    };
    const runOrderStatusRequest = async () => {
      const { data } = await axiosInstance.post(`${API_BASE}/v2/campus_code/order_status`, {
        qrcode: qrcodeText.value,
        offline: isOfflineMode.value,
        student_id: props.studentId
      });
      if (!data?.success) {
        throw data ?? new Error(t("campuscode.error.qrRequest"));
      }
      return data.resultData || {};
    };
    const applyOrderStatus = (payload) => {
      if (!qrcodeText.value) return;
      const result = payload || {};
      orderSnapshot.value = result;
      const mapped = mapOrderStatus(result.status);
      statusType.value = mapped.type;
      statusText.value = mapped.text;
      if (String(result.status || "") === "1" && chainRef) {
        stopOrderPolling();
        chainRef.triggerNow();
      }
    };
    const startOrderPolling = () => {
      stopOrderPolling();
      orderPollerRef = createOrderStatusPoller({
        request: runOrderStatusRequest,
        getIntervalMs: () => ORDER_POLL_INTERVAL_MS,
        shouldContinue: () => !!qrcodeText.value,
        onResult: applyOrderStatus
      });
      orderPollerRef.start();
    };
    const stopOrderPolling = () => {
      if (orderPollerRef) {
        orderPollerRef.stop();
        orderPollerRef = null;
      }
    };
    const handleSwitchMode = (nextMode) => {
      const target = normalizeMode(nextMode);
      if (target === mode.value) return;
      if (target === "online" && !canOnline.value) return;
      if (target === "offline" && !canOffline.value) return;
      mode.value = target;
      saveMode(target);
      startChain();
    };
    const handleBack = () => emit("back");
    const onVisibilityChange = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      if (isOfflineMode.value || !chainRef) return;
      const last = lastSuccessAt.value;
      if (typeof last !== "number") return;
      if (Date.now() - last >= refreshSecond.value * 1e3) {
        chainRef.triggerNow();
      }
    };
    onMounted(async () => {
      mode.value = loadMode();
      try {
        await fetchCampusCodeConfig();
        applyModeAvailability();
      } catch (error) {
        errorMsg.value = error?.message || t("campuscode.error.configFailed");
      }
      startChain();
      if (typeof document !== "undefined") {
        visibilityHandler = onVisibilityChange;
        document.addEventListener("visibilitychange", visibilityHandler);
      }
    });
    onBeforeUnmount(() => {
      if (visibilityHandler && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", visibilityHandler);
        visibilityHandler = null;
      }
      stopChain();
      stopOrderPolling();
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
            disabled: !canOnline.value || qrStatus.value === "loading",
            onClick: _cache[0] || (_cache[0] = ($event) => handleSwitchMode("online"))
          }, toDisplayString(unref(tLocale)("campuscode.mode.online")), 11, _hoisted_3),
          createBaseVNode("button", {
            class: normalizeClass(["mode-chip", { active: mode.value === "offline", disabled: !canOffline.value }]),
            disabled: !canOffline.value || qrStatus.value === "loading",
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
          loadingConfig.value || qrStatus.value === "loading" ? (openBlock(), createElementBlock("div", _hoisted_16, [
            _cache[2] || (_cache[2] = createBaseVNode("div", { class: "spinner" }, null, -1)),
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
          failureBanner.value ? (openBlock(), createElementBlock("div", {
            key: 2,
            class: normalizeClass(["banner", failureBannerType.value])
          }, toDisplayString(failureBanner.value), 3)) : createCommentVNode("", true),
          errorMsg.value ? (openBlock(), createElementBlock("div", _hoisted_20, toDisplayString(errorMsg.value), 1)) : createCommentVNode("", true),
          statusText.value ? (openBlock(), createElementBlock("div", {
            key: 4,
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
            disabled: qrStatus.value === "loading",
            onClick: manualRefresh
          }, toDisplayString(qrStatus.value === "loading" ? unref(tLocale)("campuscode.refresh.working") : unref(tLocale)("campuscode.refresh.idle")), 9, _hoisted_26)
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
const CampusCodeView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-e2aa8334"]]);
export {
  CampusCodeView as default
};
