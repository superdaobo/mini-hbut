import { r as ref, v as watch, o as onMounted, l as onBeforeUnmount, a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, u as unref, n as normalizeClass, F as Fragment, K as withDirectives, L as vModelText, Q as vModelCheckbox, g as createTextVNode, p as createVNode, k as withCtx, d as createCommentVNode, T as Transition, h as computed, j as createBlock, f as renderList, w as withModifiers, C as nextTick } from "./vue-core-Dzs4fLAU.js";
import { _ as _imports_0 } from "./app_icon-BoqTJkLh.js";
import { _ as _export_sfc, u as useLocale, a as useAuthStore, a0 as loadPortalRememberedPassword, a1 as loadChaoxingRememberedPassword, $ as fetchRemoteConfig, a2 as applyOcrRuntimeConfig, a3 as getStoredOcrConfig, d as axiosInstance, a4 as syncPortalRememberCredential, a5 as runExclusiveLogin, s as setCachedData, a6 as saveRememberedCredential, a7 as buildHbutAccountKey, a8 as buildChaoxingAccountKey, m as useI18n, o as openExternal, j as showToast, p as tf } from "./app-demo-CUOWTnz-.js";
import { p as pushDebugLog, R as isTestAccountCredentials, y as saveRememberedUsername, a as isTauriRuntime, d as invokeNative, G as markTestAccountSession, T as TEST_ACCOUNT, S as TEST_ACCOUNT_LOGIN_METHOD, C as seedTestAccountCaches, B as getTestAccountGrades, i as isTestAccountSession, E as clearTestAccountSession } from "./runtime-bridge-Dt57BD2i.js";
import { N as NON_OFFICIAL_DISCLAIMER_ZH, l as NON_OFFICIAL_DISCLAIMER_EN, P as PRIVACY_POLICY_URL, I as ICP_BEIAN_TEXT, m as isSponsorEntryAllowed, i as isViewAllowed, o as ICP_BEIAN_URL } from "./more-modules-DaLSEgdg.js";
import "./debug-tools-XN5ic1q-.js";
import "./capture-D-zd0oUS.js";
const hasCJK = (text) => /[\u4e00-\u9fff]/.test(text);
const readableErrorText = (raw) => {
  if (raw === null || raw === void 0) return "";
  if (raw instanceof Error) return raw.message;
  if (typeof raw === "object") {
    const record = raw;
    for (const key of ["message", "error", "kind"]) {
      if (typeof record[key] === "string" && String(record[key]).trim()) {
        return String(record[key]).trim();
      }
    }
  }
  return String(raw).trim();
};
const NETWORK_ERROR_RE = /error sending request|timed out|timeout|connection (?:failed|closed|reset|refused)|failed to fetch|network (?:error|request)|ECONN|ENOTFOUND|ETIMEDOUT|无法连接|无法访问/i;
const OCR_ERROR_RE = /\bOCR\b|识别服务|valid.*code|recognition/i;
const CREDENTIAL_ERROR_RE = /用户名或密码错误|username或密码错误|账号或密码错误|帐号或密码错误|密码错误|密码不正确|用户不存在|账号不存在|帐号不存在|认证失败/i;
const FALLBACK_CREDENTIAL_TEXT = "登录失败，请检查账号或密码";
const friendlyLoginError = (raw) => {
  const text = readableErrorText(raw);
  if (!text || text === "[object Object]") {
    return "登录失败，请稍后重试";
  }
  if (OCR_ERROR_RE.test(text)) {
    return "验证码识别服务暂不可用，请稍后重试";
  }
  if (NETWORK_ERROR_RE.test(text)) {
    return "无法连接教务系统，请检查网络后重试";
  }
  if (/获取登录页失败/i.test(text)) {
    return "暂无法获取登录信息，请检查网络后重试";
  }
  if (CREDENTIAL_ERROR_RE.test(text)) {
    return "用户名或密码错误，请重新输入";
  }
  if (text === FALLBACK_CREDENTIAL_TEXT) {
    return "登录失败，请确认账号密码正确；若验证码识别服务异常也会出现此提示，请稍后重试";
  }
  if (hasCJK(text)) {
    return text;
  }
  return `登录失败：${text}`;
};
const _hoisted_1$1 = { class: "login-container" };
const _hoisted_2$1 = { class: "subtitle" };
const _hoisted_3$1 = ["aria-label"];
const _hoisted_4$1 = { class: "mode-capsule" };
const _hoisted_5$1 = {
  key: 0,
  class: "progress-container"
};
const _hoisted_6$1 = { class: "status-msg" };
const _hoisted_7$1 = {
  key: 1,
  class: "form-container"
};
const _hoisted_8$1 = { class: "input-group" };
const _hoisted_9$1 = ["placeholder"];
const _hoisted_10$1 = { class: "input-group" };
const _hoisted_11$1 = ["placeholder"];
const _hoisted_12$1 = { class: "checkbox-group" };
const _hoisted_13$1 = { class: "checkbox-label" };
const _hoisted_14$1 = ["disabled"];
const _hoisted_15$1 = { class: "action-pills" };
const _hoisted_16$1 = {
  class: "action-pill action-pill-link",
  href: "https://auth.hbut.edu.cn/retrieve-password/retrievePassword/index.html?service=https%3A%2F%2Fe.hbut.edu.cn%2Flogin%23%2F#/",
  target: "_blank",
  rel: "noopener noreferrer"
};
const _hoisted_17$1 = {
  key: 0,
  class: "qr-panel"
};
const _hoisted_18$1 = { class: "qr-panel-head" };
const _hoisted_19$1 = { class: "qr-panel-title" };
const _hoisted_20$1 = { class: "qr-image-box" };
const _hoisted_21$1 = ["src", "alt"];
const _hoisted_22$1 = {
  key: 1,
  class: "qr-placeholder"
};
const _hoisted_23$1 = { class: "qr-status" };
const _hoisted_24$1 = {
  key: 0,
  class: "qr-countdown"
};
const _hoisted_25$1 = ["disabled"];
const _hoisted_26$1 = { class: "mode-info" };
const _hoisted_27$1 = { class: "info-text" };
const _hoisted_28$1 = { class: "input-group" };
const _hoisted_29$1 = ["placeholder"];
const _hoisted_30$1 = { class: "input-group" };
const _hoisted_31$1 = ["placeholder"];
const _hoisted_32$1 = { class: "checkbox-group" };
const _hoisted_33$1 = { class: "checkbox-label" };
const _hoisted_34$1 = ["disabled"];
const _hoisted_35$1 = { class: "action-pills" };
const _hoisted_36$1 = { class: "action-pill action-pill-note" };
const _hoisted_37$1 = {
  key: 0,
  class: "qr-panel"
};
const _hoisted_38$1 = { class: "qr-panel-head" };
const _hoisted_39$1 = { class: "qr-panel-title" };
const _hoisted_40$1 = { class: "qr-image-box" };
const _hoisted_41$1 = ["src", "alt"];
const _hoisted_42$1 = {
  key: 1,
  class: "qr-placeholder"
};
const _hoisted_43$1 = { class: "qr-status" };
const _hoisted_44$1 = {
  key: 0,
  class: "qr-countdown"
};
const _hoisted_45$1 = ["disabled"];
const _hoisted_46$1 = { class: "mode-info mode-info-warn" };
const _hoisted_47$1 = { class: "info-text" };
const _hoisted_48$1 = { class: "checkbox-group agreement" };
const _hoisted_49$1 = { class: "checkbox-label checkbox-label--agreement" };
const _hoisted_50$1 = { class: "agreement-text" };
const _hoisted_51$1 = { class: "agreement-text" };
const _hoisted_52$1 = { class: "non-official-disclaimer" };
const _hoisted_53$1 = { class: "non-official-disclaimer non-official-disclaimer--en" };
const LOGIN_METHOD_KEY = "hbu_login_method";
const LOGIN_MODE_PREF_KEY = "hbu_login_entry_mode";
const LOGIN_TEMP_FLAG_KEY = "hbu_login_temporary";
const LOGOUT_REASON_KEY = "hbu_logout_reason";
const TEMP_SESSION_EXPIRED_REASON = "temp_session_expired";
const CHAOXING_ACCOUNT_KEY = "hbu_cx_account";
const CHAOXING_PASSWORD_KEY = "hbu_cx_password";
const CHAOXING_REMEMBER_KEY = "hbu_cx_remember";
const OCR_READY_REUSE_MS = 90 * 1e3;
const CHAOXING_FORGET_PWD_URL = "https://passport2.chaoxing.com/pwd/findpwd?version=1&fid=0&flushCookie=true&independentId=0&refer=https%3A%2F%2Fi.chaoxing.com";
const _sfc_main$1 = {
  __name: "LoginV3",
  props: {
    loginMode: { type: String, default: "portal" }
  },
  emits: ["success", "switchMode", "showLegal"],
  setup(__props, { emit: __emit }) {
    const { t } = useLocale();
    const tr = (key, params = {}) => {
      let text = t(key);
      for (const [name, value] of Object.entries(params)) {
        text = text.split(`{${name}}`).join(String(value));
      }
      return text;
    };
    const props = __props;
    const authStore = useAuthStore();
    const markLoginOnline = () => {
      authStore.onlineSessionState = "online";
    };
    const emit = __emit;
    const LOGIN_MODES = [
      {
        key: "portal",
        titleKey: "login.mode.portalTitle",
        descKey: "login.mode.portalDesc"
      },
      {
        key: "chaoxing",
        titleKey: "login.mode.chaoxingTitle",
        descKey: "login.mode.chaoxingDesc"
      }
    ];
    const normalizeModeKey = (mode) => {
      const raw = String(mode || "").trim();
      if (!raw) return "";
      if (raw === "portal" || raw.startsWith("portal_")) return "portal";
      if (raw === "chaoxing" || raw.startsWith("chaoxing_")) return "chaoxing";
      return raw;
    };
    const isKnownMode = (mode) => LOGIN_MODES.some((item) => item.key === mode);
    const resolveInitialMode = () => {
      const fromProp = normalizeModeKey(props.loginMode);
      if (isKnownMode(fromProp)) return fromProp;
      const fromStorage = normalizeModeKey(localStorage.getItem(LOGIN_MODE_PREF_KEY));
      if (isKnownMode(fromStorage)) return fromStorage;
      return "portal";
    };
    const activeMode = ref(resolveInitialMode());
    const currentModeMeta = computed(() => {
      const meta = LOGIN_MODES.find((item) => item.key === activeMode.value) || LOGIN_MODES[0];
      return {
        key: meta.key,
        title: t(meta.titleKey),
        desc: t(meta.descKey)
      };
    });
    const username = ref("");
    const password = ref("");
    const chaoxingAccount = ref("");
    const chaoxingPassword = ref("");
    const rememberMe = ref(true);
    const agreePolicy = ref(true);
    const loading = ref(false);
    const statusMsg = ref("");
    const ocrConfigMode = ref(t("login.ocr.local"));
    const debugLogs = ref([]);
    const portalQrVisible = ref(false);
    const chaoxingQrVisible = ref(false);
    let ocrReadyInFlight = null;
    let ocrReadyAt = 0;
    const qrUuid = ref("");
    const qrImageBase64 = ref("");
    const qrState = ref("idle");
    const qrStateMessage = ref("");
    const qrSubmitting = ref(false);
    const qrExpiresAt = ref(0);
    const qrRemainingSeconds = ref(0);
    let qrTimer = null;
    let qrPollingBusy = false;
    const cxQrUuid = ref("");
    const cxQrEnc = ref("");
    const cxQrImageBase64 = ref("");
    const cxQrState = ref("idle");
    const cxQrStateMessage = ref("");
    const cxQrSubmitting = ref(false);
    const cxQrExpiresAt = ref(0);
    const cxQrRemainingSeconds = ref(0);
    const cxQrContext = ref(null);
    let cxQrTimer = null;
    let cxQrPollingBusy = false;
    const API_BASE = "/api";
    let portalQrInitSeq = 0;
    let chaoxingQrInitSeq = 0;
    const isPortalMode = computed(() => activeMode.value === "portal");
    const isChaoxingMode = computed(() => activeMode.value === "chaoxing");
    const canSubmitPasswordLogin = computed(() => {
      return !loading.value;
    });
    const canSubmitChaoxingPasswordLogin = computed(() => {
      return !loading.value;
    });
    const isLikelyStudentId = (value) => /^\d{10}$/.test(String(value || "").trim());
    const pickStudentIdCandidate = (payload) => {
      if (!payload || typeof payload !== "object") return "";
      const candidates = [
        payload.student_id,
        payload.studentId,
        payload?.data?.student_id,
        payload?.data?.studentId,
        payload?.data?.xh,
        payload?.xh
      ];
      for (const item of candidates) {
        const sid = String(item || "").trim();
        if (isLikelyStudentId(sid)) {
          return sid;
        }
      }
      return "";
    };
    const resolveChaoxingStudentId = async (payload = null) => {
      const payloadSid = pickStudentIdCandidate(payload);
      if (payloadSid) return payloadSid;
      const cachedSid = String(localStorage.getItem("hbu_username") || "").trim();
      if (isLikelyStudentId(cachedSid)) return cachedSid;
      if (isTauriRuntime()) {
        try {
          const studentInfo = await invokeNative("fetch_student_info");
          const infoSid = pickStudentIdCandidate(studentInfo);
          if (infoSid) return infoSid;
        } catch (e) {
          pushDebug(`学习通学号解析失败(fetch_student_info): ${e.message || e}`);
        }
      }
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/student_info`);
        const sid = pickStudentIdCandidate(res?.data);
        if (sid) return sid;
      } catch (e) {
        pushDebug(`学习通学号解析失败(v2/student_info): ${e.response?.data?.error || e.message || e}`);
      }
      const accountCandidates = [
        String(payload?.account || "").trim(),
        String(chaoxingAccount.value || "").trim()
      ];
      for (const candidate of accountCandidates) {
        if (isLikelyStudentId(candidate)) {
          return candidate;
        }
      }
      return "";
    };
    const applyLoginMethodStorage = (mode) => {
      const isTemp = mode.endsWith("_temp");
      localStorage.setItem(LOGIN_METHOD_KEY, mode);
      localStorage.setItem(LOGIN_TEMP_FLAG_KEY, isTemp ? "1" : "0");
    };
    const pushDebug = (message) => {
      const text = String(message || "").trim();
      if (!text) return;
      const ts = (/* @__PURE__ */ new Date()).toLocaleTimeString();
      debugLogs.value = [`[${ts}] ${text}`, ...debugLogs.value].slice(0, 30);
      pushDebugLog("Login", text, "debug");
    };
    const pushDebugList = (items) => {
      if (!Array.isArray(items)) return;
      items.forEach((item) => pushDebug(item));
    };
    const clearDebugLogs = () => {
      debugLogs.value = [];
    };
    const isPortalPendingError = (err) => {
      const msg = String(err?.message || err || "").toLowerCase();
      return msg.includes("未完成") || msg.includes("not complete") || msg.includes("等待");
    };
    const resolveOcrModeLabel = (status, endpoint) => {
      const activeSource = String(status?.active_source || "").trim();
      if (activeSource.includes("fallback") || activeSource.includes("local")) return t("login.ocr.local");
      if (activeSource && activeSource !== "unknown") return t("login.ocr.remote");
      const configured = String(status?.configured_endpoint || "").trim();
      if (configured || endpoint) return t("login.ocr.remote");
      if (status?.fallback_used) return t("login.ocr.local");
      return t("login.ocr.local");
    };
    const refreshOcrMode = async (endpointHint = "") => {
      try {
        const runtime = await invokeNative("get_ocr_runtime_status");
        ocrConfigMode.value = resolveOcrModeLabel(runtime, endpointHint);
        const activeSource = String(runtime?.active_source || "");
        pushDebugLog(
          "Login",
          `OCR运行态 mode=${ocrConfigMode.value} source=${activeSource || "unknown"}`,
          "debug"
        );
      } catch {
        ocrConfigMode.value = endpointHint ? t("login.ocr.remote") : t("login.ocr.local");
        pushDebugLog("Login", "获取 OCR 运行态失败，使用本地模式显示", "warn");
      }
    };
    const ensureOcrEndpointReady = async ({ force = false } = {}) => {
      if (!force && ocrReadyInFlight) {
        return ocrReadyInFlight;
      }
      if (!force && ocrReadyAt > 0 && Date.now() - ocrReadyAt < OCR_READY_REUSE_MS) {
        return;
      }
      const task = (async () => {
        let endpointHint = "";
        try {
          const cfg = await fetchRemoteConfig();
          await applyOcrRuntimeConfig(cfg);
          endpointHint = String(cfg?.ocr?.endpoint || "").trim();
          pushDebugLog("Login", `OCR配置已应用（远程配置）：${endpointHint || "未返回主端点"}`, "info");
        } catch (e) {
          console.warn("[OCR] 拉取远程配置失败，改用本地 OCR 配置:", e);
          pushDebugLog("Login", "OCR远程配置拉取失败，切换本地配置", "warn", e);
          const localCfg = getStoredOcrConfig();
          await applyOcrRuntimeConfig({
            ocr: {
              enabled: true,
              endpoint: localCfg.endpoint,
              endpoints: localCfg.endpoints,
              local_fallback_endpoints: localCfg.local_fallback_endpoints
            }
          });
          endpointHint = localCfg.endpoint;
          pushDebugLog("Login", `OCR配置已应用（本地配置）：${endpointHint || "未配置主端点"}`, "info");
        }
        await refreshOcrMode(endpointHint);
        ocrReadyAt = Date.now();
      })();
      ocrReadyInFlight = task;
      try {
        await task;
      } finally {
        if (ocrReadyInFlight === task) {
          ocrReadyInFlight = null;
        }
      }
    };
    const handleOcrConfigUpdated = () => {
      const localCfg = getStoredOcrConfig();
      refreshOcrMode(String(localCfg.endpoint || "").trim());
    };
    const clearQrTimer = () => {
      if (qrTimer) {
        clearTimeout(qrTimer);
        qrTimer = null;
      }
    };
    const clearCxQrTimer = () => {
      if (cxQrTimer) {
        clearTimeout(cxQrTimer);
        cxQrTimer = null;
      }
    };
    const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
      let timer = null;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      });
      try {
        return await Promise.race([promise, timeoutPromise]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    const normalizeInvokePayload = (raw) => {
      if (raw && typeof raw === "object") return raw;
      if (typeof raw === "string") {
        const text = raw.trim();
        if (!text) return {};
        try {
          return JSON.parse(text);
        } catch {
          return { raw: text };
        }
      }
      return {};
    };
    const pickText = (payload, keys) => {
      if (!payload || typeof payload !== "object") return "";
      const containers = [payload, payload.data, payload.result].filter(Boolean);
      for (const container of containers) {
        for (const key of keys) {
          const value = container?.[key];
          if (value === 0) return "0";
          if (value === false) return "false";
          if (value === null || value === void 0) continue;
          const text = String(value).trim();
          if (text) return text;
        }
      }
      return "";
    };
    const normalizeQrImageSource = (raw) => {
      const value = String(raw || "").trim();
      if (!value) return "";
      if (value.startsWith("data:image/")) return value;
      if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) return value;
      return `data:image/png;base64,${value}`;
    };
    const resetQrState = () => {
      clearQrTimer();
      portalQrInitSeq += 1;
      qrUuid.value = "";
      qrImageBase64.value = "";
      qrState.value = "idle";
      qrStateMessage.value = "";
      qrExpiresAt.value = 0;
      qrRemainingSeconds.value = 0;
      qrSubmitting.value = false;
      qrPollingBusy = false;
    };
    const resetCxQrState = () => {
      clearCxQrTimer();
      chaoxingQrInitSeq += 1;
      cxQrUuid.value = "";
      cxQrEnc.value = "";
      cxQrImageBase64.value = "";
      cxQrState.value = "idle";
      cxQrStateMessage.value = "";
      cxQrExpiresAt.value = 0;
      cxQrRemainingSeconds.value = 0;
      cxQrSubmitting.value = false;
      cxQrContext.value = null;
      cxQrPollingBusy = false;
    };
    const updateQrCountdown = () => {
      if (!qrExpiresAt.value) {
        qrRemainingSeconds.value = 0;
        return;
      }
      const remain = Math.max(0, Math.ceil((qrExpiresAt.value - Date.now()) / 1e3));
      qrRemainingSeconds.value = remain;
      if (remain === 0 && qrState.value !== "success") {
        qrState.value = "expired";
        qrStateMessage.value = t("login.qr.expired");
        clearQrTimer();
      }
    };
    const updateCxQrCountdown = () => {
      if (!cxQrExpiresAt.value) {
        cxQrRemainingSeconds.value = 0;
        return;
      }
      const remain = Math.max(0, Math.ceil((cxQrExpiresAt.value - Date.now()) / 1e3));
      cxQrRemainingSeconds.value = remain;
      if (remain === 0 && cxQrState.value !== "success") {
        cxQrState.value = "expired";
        cxQrStateMessage.value = t("login.cx.qr.expired");
        clearCxQrTimer();
      }
    };
    const scheduleQrPoll = () => {
      clearQrTimer();
      qrTimer = setTimeout(() => {
        pollPortalQrStatus().catch((e) => {
          console.warn("[QR] 轮询状态失败:", e);
        });
      }, 1e3);
    };
    const scheduleCxQrPoll = () => {
      clearCxQrTimer();
      cxQrTimer = setTimeout(() => {
        pollChaoxingQrStatus().catch((e) => {
          pushDebug(`学习通二维码轮询异常: ${e.message || e}`);
        });
      }, 1200);
    };
    const fetchGradesAfterLogin = async (sid) => {
      const res = await axiosInstance.post(`${API_BASE}/v2/quick_fetch`, { student_id: sid });
      return res.data;
    };
    const emitSuccessWithGrades = async (sid) => {
      try {
        const gradesData = await fetchGradesAfterLogin(sid);
        if (gradesData?.success) {
          emit("success", gradesData.data || []);
          return;
        }
        statusMsg.value = tr("login.status.gradesSyncFailed", {
          err: gradesData?.error || t("login.error.unknown")
        });
        emit("success", []);
      } catch (e) {
        const errMsg = e.response?.data?.error || e.message || t("login.error.unknown");
        statusMsg.value = tr("login.status.gradesSyncFailed", { err: errMsg });
        emit("success", []);
      }
    };
    const savePortalCredentials = async () => {
      if (rememberMe.value) {
        saveRememberedUsername(username.value);
        localStorage.setItem("hbu_remember", "true");
        await saveRememberedCredential(
          buildHbutAccountKey(username.value),
          password.value
        );
        localStorage.removeItem("hbu_credentials");
      } else {
        localStorage.removeItem("hbu_credentials");
        localStorage.setItem("hbu_remember", "false");
        await saveRememberedCredential(buildHbutAccountKey(username.value), "");
      }
    };
    const saveChaoxingCredentials = async () => {
      if (rememberMe.value) {
        localStorage.setItem(CHAOXING_ACCOUNT_KEY, chaoxingAccount.value);
        localStorage.setItem(CHAOXING_REMEMBER_KEY, "true");
        await saveRememberedCredential(
          buildChaoxingAccountKey(chaoxingAccount.value),
          chaoxingPassword.value
        );
        localStorage.removeItem(CHAOXING_PASSWORD_KEY);
      } else {
        localStorage.removeItem(CHAOXING_PASSWORD_KEY);
        localStorage.setItem(CHAOXING_REMEMBER_KEY, "false");
        await saveRememberedCredential(buildChaoxingAccountKey(chaoxingAccount.value), "");
      }
    };
    const handleTestAccountLogin = async () => {
      loading.value = true;
      statusMsg.value = t("login.status.enteringDemo");
      try {
        markTestAccountSession();
        username.value = TEST_ACCOUNT.studentId;
        saveRememberedUsername(TEST_ACCOUNT.studentId);
        localStorage.setItem("hbu_remember", "false");
        localStorage.setItem("hbu_login_entry_mode", "portal");
        applyLoginMethodStorage(TEST_ACCOUNT_LOGIN_METHOD);
        localStorage.removeItem("hbu_manual_logout");
        localStorage.removeItem(LOGOUT_REASON_KEY);
        seedTestAccountCaches(setCachedData, TEST_ACCOUNT.studentId);
        markLoginOnline();
        statusMsg.value = t("login.status.demoLoaded");
        emit("success", getTestAccountGrades());
      } finally {
        loading.value = false;
      }
    };
    const handlePasswordLogin = async () => {
      if (!username.value || !password.value) {
        statusMsg.value = t("login.error.enterCredentials");
        return;
      }
      if (!agreePolicy.value) {
        statusMsg.value = t("login.error.agreePolicy");
        return;
      }
      if (isTestAccountCredentials(username.value, password.value)) {
        await handleTestAccountLogin();
        return;
      }
      loading.value = true;
      statusMsg.value = t("login.status.signingIn");
      void ensureOcrEndpointReady().catch((e) => {
        pushDebugLog("Login", "登录前 OCR 配置刷新失败（已忽略）", "warn", e);
      });
      await savePortalCredentials();
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/start_login`, {
          username: username.value,
          password: password.value,
          captcha: "",
          lt: "",
          execution: ""
        });
        const result = res.data;
        if (!result?.success) {
          statusMsg.value = `❌ ${friendlyLoginError(result?.error || "")}`;
          return;
        }
        const sid = String(result?.data?.student_id || username.value || "").trim();
        if (sid) {
          saveRememberedUsername(sid);
        }
        await syncPortalRememberCredential({
          username: username.value,
          studentId: sid,
          password: password.value,
          remember: rememberMe.value
        });
        if (rememberMe.value) {
          localStorage.setItem("hbu_remember", "true");
        }
        applyLoginMethodStorage("portal_password");
        localStorage.removeItem(LOGOUT_REASON_KEY);
        markLoginOnline();
        statusMsg.value = t("login.status.signInSuccessSyncing");
        await emitSuccessWithGrades(sid || username.value);
      } catch (e) {
        const errMsg = e.response?.data?.error || e.message || t("login.error.unknown");
        statusMsg.value = `⚠️ ${friendlyLoginError(errMsg)}`;
      } finally {
        loading.value = false;
        await refreshOcrMode(String(getStoredOcrConfig().endpoint || "").trim());
      }
    };
    const pollPortalQrStatus = async () => {
      if (!qrUuid.value || !isPortalMode.value || !portalQrVisible.value) return;
      if (qrSubmitting.value || qrPollingBusy) return;
      updateQrCountdown();
      if (qrState.value === "expired") return;
      qrPollingBusy = true;
      try {
        const payload = await invokeNative("portal_qr_check_status", { uuid: qrUuid.value });
        const code = String(payload?.status_code || "").trim();
        if (code === "1") {
          qrState.value = "confirming";
          qrStateMessage.value = t("login.qr.confirming");
          await confirmPortalQrLogin();
          return;
        }
        if (code === "2") {
          qrState.value = "scanned";
          qrStateMessage.value = t("login.qr.scanned");
          const submitted = await confirmPortalQrLogin({ allowPending: true });
          if (submitted) return;
        } else if (code === "3") {
          qrState.value = "expired";
          qrStateMessage.value = t("login.qr.expired");
          clearQrTimer();
          return;
        } else {
          qrState.value = "waiting";
          qrStateMessage.value = t("login.qr.waiting");
        }
      } catch (e) {
        qrState.value = "error";
        qrStateMessage.value = tr("login.qr.statusFailed", { err: e.message || e });
      } finally {
        qrPollingBusy = false;
      }
      updateQrCountdown();
      if (qrState.value !== "expired" && qrState.value !== "success") {
        scheduleQrPoll();
      }
    };
    const initPortalQrLogin = async () => {
      if (!agreePolicy.value) {
        statusMsg.value = t("login.error.agreePolicy");
        return;
      }
      if (!isTauriRuntime()) {
        statusMsg.value = t("login.qr.notSupported");
        return;
      }
      portalQrVisible.value = true;
      statusMsg.value = "";
      qrSubmitting.value = false;
      qrState.value = "loading";
      qrStateMessage.value = t("login.qr.generating");
      clearQrTimer();
      const currentSeq = ++portalQrInitSeq;
      try {
        const rawPayload = await withTimeout(invokeNative("portal_qr_init_login", {
          service: "https://e.hbut.edu.cn/login#/"
        }), 2e4, t("login.qr.initTimeout"));
        if (currentSeq !== portalQrInitSeq) return;
        const payload = normalizeInvokePayload(rawPayload);
        const uuid = pickText(payload, ["uuid", "qr_uuid"]);
        const qrImg = normalizeQrImageSource(
          pickText(payload, [
            "qr_image_base64",
            "qrImageBase64",
            "qr_image",
            "qrImage",
            "image_base64",
            "imageBase64",
            "image"
          ])
        );
        if (!uuid || !qrImg) {
          throw new Error(t("login.qr.dataIncomplete"));
        }
        qrUuid.value = uuid;
        qrImageBase64.value = qrImg;
        qrExpiresAt.value = Date.now() + 180 * 1e3;
        qrState.value = "waiting";
        qrStateMessage.value = t("login.qr.defaultHint");
        updateQrCountdown();
        scheduleQrPoll();
      } catch (e) {
        qrState.value = "error";
        qrStateMessage.value = tr("login.qr.generateFailed", { err: e.message || e });
      }
    };
    const openPortalQrPanel = async (refresh = false) => {
      portalQrVisible.value = true;
      if (refresh || !qrImageBase64.value || qrState.value === "expired") {
        await initPortalQrLogin();
      }
    };
    const closePortalQrPanel = () => {
      portalQrVisible.value = false;
      resetQrState();
    };
    const confirmPortalQrLogin = async ({ allowPending = false } = {}) => {
      if (!qrUuid.value || qrSubmitting.value) return false;
      qrSubmitting.value = true;
      clearQrTimer();
      try {
        const userInfo = await runExclusiveLogin(
          () => invokeNative("portal_qr_confirm_login", {
            uuid: qrUuid.value,
            service: "https://e.hbut.edu.cn/login#/"
          })
        );
        const sid = String(userInfo?.student_id || "").trim();
        if (!sid) {
          throw new Error(t("login.qr.noStudentId"));
        }
        username.value = sid;
        saveRememberedUsername(sid);
        applyLoginMethodStorage("portal_qr_temp");
        localStorage.removeItem("hbu_manual_logout");
        localStorage.removeItem(LOGOUT_REASON_KEY);
        markLoginOnline();
        qrState.value = "success";
        qrStateMessage.value = t("login.qr.successSyncing");
        await emitSuccessWithGrades(sid);
        return true;
      } catch (e) {
        if (allowPending && isPortalPendingError(e)) {
          qrState.value = "scanned";
          qrStateMessage.value = t("login.qr.scannedConfirmOnPhone");
          return false;
        }
        qrState.value = "error";
        qrStateMessage.value = tr("login.qr.signInFailed", { err: e.message || e });
        return false;
      } finally {
        qrSubmitting.value = false;
      }
    };
    const handleChaoxingLoginSuccess = async (payload, modeKey) => {
      const sid = await resolveChaoxingStudentId(payload);
      if (!sid) {
        throw new Error(t("login.error.cx.noStudentId"));
      }
      username.value = sid;
      saveRememberedUsername(sid);
      await saveChaoxingCredentials();
      applyLoginMethodStorage(modeKey);
      localStorage.removeItem("hbu_manual_logout");
      localStorage.removeItem(LOGOUT_REASON_KEY);
      markLoginOnline();
      statusMsg.value = t("login.cx.qr.successSyncing");
      pushDebugList(payload?.debug);
      emit("success", []);
    };
    const handleChaoxingPasswordLogin = async () => {
      if (!chaoxingAccount.value || !chaoxingPassword.value) {
        statusMsg.value = t("login.error.cx.enterCredentials");
        return;
      }
      if (!agreePolicy.value) {
        statusMsg.value = t("login.error.agreePolicy");
        return;
      }
      if (!isTauriRuntime()) {
        statusMsg.value = t("login.error.cx.notSupportedNative");
        return;
      }
      loading.value = true;
      statusMsg.value = t("login.error.cx.signingIn");
      try {
        const payload = await runExclusiveLogin(
          () => invokeNative("chaoxing_password_login", {
            account: chaoxingAccount.value,
            password: chaoxingPassword.value
          })
        );
        await handleChaoxingLoginSuccess(payload, "chaoxing_password");
      } catch (e) {
        statusMsg.value = tr("login.error.cx.signInFailed", { err: friendlyLoginError(e.message || e) });
        pushDebug(`学习通密码登录失败: ${e.message || e}`);
      } finally {
        loading.value = false;
      }
    };
    const pollChaoxingQrStatus = async () => {
      if (!cxQrUuid.value || !cxQrEnc.value || !isChaoxingMode.value || !chaoxingQrVisible.value) return;
      if (cxQrSubmitting.value || cxQrPollingBusy) return;
      updateCxQrCountdown();
      if (cxQrState.value === "expired") return;
      cxQrPollingBusy = true;
      try {
        const payload = await invokeNative("chaoxing_qr_check_status", {
          uuid: cxQrUuid.value,
          enc: cxQrEnc.value,
          forbidotherlogin: String(cxQrContext.value?.forbidotherlogin || "0"),
          double_factor_login: String(cxQrContext.value?.double_factor_login || "0")
        });
        pushDebugList(payload?.debug);
        const typeCode = String(payload?.type_code || "").trim();
        if (payload?.should_finish_login) {
          cxQrState.value = "confirming";
          cxQrStateMessage.value = t("login.cx.qr.confirming");
          await confirmChaoxingQrLogin();
          return;
        }
        if (typeCode === "4") {
          cxQrState.value = "scanned";
          cxQrStateMessage.value = payload?.nickname ? tr("login.cx.qr.scannedWithNickname", { nickname: payload.nickname }) : t("login.cx.qr.scanned");
        } else if (typeCode === "6") {
          cxQrState.value = "expired";
          cxQrStateMessage.value = t("login.cx.qr.cancelled");
          clearCxQrTimer();
          return;
        } else if (typeCode === "7") {
          cxQrState.value = "expired";
          cxQrStateMessage.value = payload?.message || t("login.cx.qr.abnormal");
          clearCxQrTimer();
          return;
        } else if (typeCode === "3") {
          cxQrState.value = "waiting";
          cxQrStateMessage.value = payload?.message || t("login.cx.qr.waiting");
        } else {
          cxQrState.value = "waiting";
          cxQrStateMessage.value = payload?.message || t("login.cx.qr.waiting");
        }
      } catch (e) {
        cxQrState.value = "error";
        cxQrStateMessage.value = tr("login.cx.qr.statusFailed", { err: e.message || e });
        pushDebug(`学习通二维码状态失败: ${e.message || e}`);
      } finally {
        cxQrPollingBusy = false;
      }
      updateCxQrCountdown();
      if (cxQrState.value !== "expired" && cxQrState.value !== "success") {
        scheduleCxQrPoll();
      }
    };
    const initChaoxingQrLogin = async (preferRefresh = false) => {
      if (!agreePolicy.value) {
        statusMsg.value = t("login.error.agreePolicy");
        return;
      }
      if (!isTauriRuntime()) {
        statusMsg.value = t("login.cx.qr.notSupported");
        return;
      }
      chaoxingQrVisible.value = true;
      statusMsg.value = "";
      cxQrSubmitting.value = false;
      cxQrState.value = "loading";
      cxQrStateMessage.value = t("login.cx.qr.generating");
      clearCxQrTimer();
      const currentSeq = ++chaoxingQrInitSeq;
      try {
        const command = preferRefresh && cxQrUuid.value ? "chaoxing_qr_refresh_login" : "chaoxing_qr_init_login";
        const rawPayload = await withTimeout(invokeNative(command), 2e4, t("login.cx.qr.initTimeout"));
        if (currentSeq !== chaoxingQrInitSeq) return;
        const payload = normalizeInvokePayload(rawPayload);
        const uuid = pickText(payload, ["uuid", "qr_uuid"]);
        const enc = pickText(payload, ["enc", "encrypt"]);
        const qrImg = normalizeQrImageSource(
          pickText(payload, [
            "qr_image_base64",
            "qrImageBase64",
            "qr_image",
            "qrImage",
            "image_base64",
            "imageBase64",
            "image"
          ])
        );
        if (!uuid || !enc || !qrImg) {
          throw new Error(t("login.cx.qr.dataIncomplete"));
        }
        cxQrUuid.value = uuid;
        cxQrEnc.value = enc;
        cxQrImageBase64.value = qrImg;
        cxQrContext.value = payload?.context || null;
        const ttl = Number(payload?.expires_in_seconds || 150);
        cxQrExpiresAt.value = Date.now() + Math.max(60, ttl) * 1e3;
        cxQrState.value = "waiting";
        cxQrStateMessage.value = t("login.cx.qr.defaultHint");
        updateCxQrCountdown();
        scheduleCxQrPoll();
        pushDebugList(payload?.debug);
      } catch (e) {
        cxQrState.value = "error";
        cxQrStateMessage.value = tr("login.cx.qr.generateFailed", { err: e.message || e });
        pushDebug(`学习通二维码生成失败: ${e.message || e}`);
      }
    };
    const openChaoxingQrPanel = async (refresh = false) => {
      chaoxingQrVisible.value = true;
      if (refresh || !cxQrImageBase64.value || cxQrState.value === "expired") {
        await initChaoxingQrLogin(refresh || !!cxQrImageBase64.value);
      }
    };
    const closeChaoxingQrPanel = () => {
      chaoxingQrVisible.value = false;
      resetCxQrState();
    };
    const confirmChaoxingQrLogin = async () => {
      if (!cxQrUuid.value || !cxQrEnc.value || cxQrSubmitting.value) return;
      cxQrSubmitting.value = true;
      clearCxQrTimer();
      try {
        const payload = await runExclusiveLogin(
          () => invokeNative("chaoxing_qr_confirm_login", {
            uuid: cxQrUuid.value,
            enc: cxQrEnc.value,
            account_hint: chaoxingAccount.value || void 0
          })
        );
        cxQrState.value = "success";
        cxQrStateMessage.value = t("login.cx.qr.successSyncing");
        await handleChaoxingLoginSuccess(payload, "chaoxing_qr_temp");
      } catch (e) {
        cxQrState.value = "error";
        cxQrStateMessage.value = tr("login.cx.qr.signInFailed", { err: e.message || e });
        pushDebug(`学习通扫码登录失败: ${e.message || e}`);
      } finally {
        cxQrSubmitting.value = false;
      }
    };
    const switchMode = (mode) => {
      if (!isKnownMode(mode) || activeMode.value === mode) return;
      activeMode.value = mode;
      statusMsg.value = "";
      clearDebugLogs();
      if (mode !== "portal") {
        portalQrVisible.value = false;
        resetQrState();
      }
      if (mode !== "chaoxing") {
        chaoxingQrVisible.value = false;
        resetCxQrState();
      }
    };
    const handleKeyPress = (event) => {
      if (event.key !== "Enter" || loading.value) return;
      if (isPortalMode.value) {
        handlePasswordLogin();
        return;
      }
      if (isChaoxingMode.value) {
        handleChaoxingPasswordLogin();
      }
    };
    watch(
      () => props.loginMode,
      (mode) => {
        const nextMode = normalizeModeKey(mode);
        if (isKnownMode(nextMode) && nextMode !== activeMode.value) {
          activeMode.value = nextMode;
        }
      }
    );
    watch(activeMode, (mode) => {
      localStorage.setItem(LOGIN_MODE_PREF_KEY, mode);
      emit("switchMode", mode);
    });
    const hydrateRememberedCredentials = async () => {
      const savedUsername = localStorage.getItem("hbu_username");
      const savedRemember = localStorage.getItem("hbu_remember");
      if (savedRemember !== "false" && savedUsername) {
        username.value = savedUsername;
        password.value = await loadPortalRememberedPassword(savedUsername);
        rememberMe.value = true;
      }
      const savedCxRemember = localStorage.getItem(CHAOXING_REMEMBER_KEY);
      const savedCxAccount = localStorage.getItem(CHAOXING_ACCOUNT_KEY);
      if (savedCxRemember !== "false" && savedCxAccount) {
        chaoxingAccount.value = savedCxAccount;
        chaoxingPassword.value = await loadChaoxingRememberedPassword(savedCxAccount);
        rememberMe.value = true;
      }
    };
    onMounted(async () => {
      const savedMode = normalizeModeKey(localStorage.getItem(LOGIN_MODE_PREF_KEY));
      if (isKnownMode(savedMode) && savedMode !== activeMode.value) {
        activeMode.value = savedMode;
      }
      const reason = String(localStorage.getItem(LOGOUT_REASON_KEY) || "").trim();
      if (reason === TEMP_SESSION_EXPIRED_REASON) {
        statusMsg.value = t("login.status.tempSessionExpired");
        localStorage.removeItem(LOGOUT_REASON_KEY);
      }
      await hydrateRememberedCredentials();
      void ensureOcrEndpointReady().catch((e) => {
        console.warn("[Login] OCR 初始化失败（后台重试）:", e);
      });
      window.addEventListener("hbu-ocr-config-updated", handleOcrConfigUpdated);
    });
    onBeforeUnmount(() => {
      clearQrTimer();
      clearCxQrTimer();
      window.removeEventListener("hbu-ocr-config-updated", handleOcrConfigUpdated);
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        _cache[19] || (_cache[19] = createBaseVNode("div", { class: "logo" }, [
          createBaseVNode("img", {
            class: "logo-img",
            src: _imports_0,
            alt: "Mini-HBUT"
          })
        ], -1)),
        createBaseVNode("h2", null, toDisplayString(unref(t)("login.title")), 1),
        createBaseVNode("p", _hoisted_2$1, toDisplayString(unref(t)("login.subtitle")), 1),
        createBaseVNode("div", {
          class: "entry-switch",
          role: "tablist",
          "aria-label": unref(t)("login.entry.switchAria")
        }, [
          createBaseVNode("span", {
            class: normalizeClass(["entry-slider", { "is-chaoxing": isChaoxingMode.value }])
          }, null, 2),
          createBaseVNode("button", {
            class: normalizeClass(["entry-btn", { active: isPortalMode.value }]),
            onClick: _cache[0] || (_cache[0] = ($event) => switchMode("portal"))
          }, toDisplayString(unref(t)("login.mode.portal")), 3),
          createBaseVNode("button", {
            class: normalizeClass(["entry-btn", { active: isChaoxingMode.value }]),
            onClick: _cache[1] || (_cache[1] = ($event) => switchMode("chaoxing"))
          }, toDisplayString(unref(t)("login.mode.chaoxing")), 3)
        ], 8, _hoisted_3$1),
        createBaseVNode("p", _hoisted_4$1, toDisplayString(currentModeMeta.value.title), 1),
        loading.value ? (openBlock(), createElementBlock("div", _hoisted_5$1, [
          _cache[15] || (_cache[15] = createBaseVNode("div", { class: "loading-spinner" }, [
            createBaseVNode("div", { class: "spinner" })
          ], -1)),
          createBaseVNode("p", _hoisted_6$1, toDisplayString(statusMsg.value), 1)
        ])) : (openBlock(), createElementBlock("div", _hoisted_7$1, [
          isPortalMode.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            createBaseVNode("div", _hoisted_8$1, [
              createBaseVNode("label", null, toDisplayString(unref(t)("login.label.studentId")), 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => username.value = $event),
                type: "text",
                placeholder: unref(t)("login.placeholder.studentId"),
                maxlength: "10",
                onKeypress: handleKeyPress
              }, null, 40, _hoisted_9$1), [
                [vModelText, username.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_10$1, [
              createBaseVNode("label", null, toDisplayString(unref(t)("login.label.password")), 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => password.value = $event),
                type: "password",
                placeholder: unref(t)("login.placeholder.password"),
                onKeypress: handleKeyPress
              }, null, 40, _hoisted_11$1), [
                [vModelText, password.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_12$1, [
              createBaseVNode("label", _hoisted_13$1, [
                withDirectives(createBaseVNode("input", {
                  type: "checkbox",
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => rememberMe.value = $event),
                  class: "real-checkbox"
                }, null, 512), [
                  [vModelCheckbox, rememberMe.value]
                ]),
                _cache[16] || (_cache[16] = createBaseVNode("span", { class: "custom-checkbox" }, null, -1)),
                createTextVNode(" " + toDisplayString(unref(t)("login.rememberPassword")), 1)
              ])
            ]),
            createBaseVNode("button", {
              class: "login-btn",
              disabled: !canSubmitPasswordLogin.value,
              onClick: handlePasswordLogin
            }, toDisplayString(unref(t)("login.btn.signIn")), 9, _hoisted_14$1),
            createBaseVNode("div", _hoisted_15$1, [
              createBaseVNode("a", _hoisted_16$1, toDisplayString(unref(t)("login.btn.forgotPassword")), 1),
              createBaseVNode("button", {
                class: "action-pill action-pill-btn",
                onClick: _cache[5] || (_cache[5] = ($event) => openPortalQrPanel())
              }, toDisplayString(unref(t)("login.btn.qrSignIn")), 1)
            ]),
            createVNode(Transition, { name: "fade-slide" }, {
              default: withCtx(() => [
                portalQrVisible.value ? (openBlock(), createElementBlock("div", _hoisted_17$1, [
                  createBaseVNode("div", _hoisted_18$1, [
                    createBaseVNode("span", _hoisted_19$1, toDisplayString(unref(t)("login.qr.panelTitle")), 1),
                    createBaseVNode("button", {
                      class: "qr-close-btn",
                      type: "button",
                      onClick: closePortalQrPanel
                    }, toDisplayString(unref(t)("login.qr.collapse")), 1)
                  ]),
                  createBaseVNode("div", _hoisted_20$1, [
                    qrImageBase64.value ? (openBlock(), createElementBlock("img", {
                      key: 0,
                      src: qrImageBase64.value,
                      alt: unref(t)("login.qr.imageAlt"),
                      class: "qr-image"
                    }, null, 8, _hoisted_21$1)) : (openBlock(), createElementBlock("div", _hoisted_22$1, toDisplayString(qrState.value === "error" ? qrStateMessage.value || unref(t)("login.qr.loadFailed") : unref(t)("login.qr.generating")), 1))
                  ]),
                  createBaseVNode("p", _hoisted_23$1, toDisplayString(qrStateMessage.value || unref(t)("login.qr.defaultHint")), 1),
                  qrRemainingSeconds.value > 0 ? (openBlock(), createElementBlock("p", _hoisted_24$1, toDisplayString(tr("login.qr.remaining", { n: qrRemainingSeconds.value })), 1)) : createCommentVNode("", true),
                  createBaseVNode("button", {
                    class: "login-btn",
                    disabled: qrSubmitting.value,
                    onClick: _cache[6] || (_cache[6] = ($event) => openPortalQrPanel(true))
                  }, toDisplayString(qrImageBase64.value ? unref(t)("login.qr.refresh") : unref(t)("login.qr.generate")), 9, _hoisted_25$1)
                ])) : createCommentVNode("", true)
              ]),
              _: 1
            }),
            createBaseVNode("div", _hoisted_26$1, [
              createBaseVNode("span", _hoisted_27$1, toDisplayString(unref(t)("login.ocr.configPrefix")) + toDisplayString(ocrConfigMode.value), 1)
            ])
          ], 64)) : isChaoxingMode.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("div", _hoisted_28$1, [
              createBaseVNode("label", null, toDisplayString(unref(t)("login.label.cxAccount")), 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => chaoxingAccount.value = $event),
                type: "text",
                placeholder: unref(t)("login.placeholder.cxAccount"),
                maxlength: "40",
                onKeypress: handleKeyPress
              }, null, 40, _hoisted_29$1), [
                [vModelText, chaoxingAccount.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_30$1, [
              createBaseVNode("label", null, toDisplayString(unref(t)("login.label.cxPassword")), 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => chaoxingPassword.value = $event),
                type: "password",
                placeholder: unref(t)("login.placeholder.password"),
                maxlength: "40",
                onKeypress: handleKeyPress
              }, null, 40, _hoisted_31$1), [
                [vModelText, chaoxingPassword.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_32$1, [
              createBaseVNode("label", _hoisted_33$1, [
                withDirectives(createBaseVNode("input", {
                  type: "checkbox",
                  "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => rememberMe.value = $event),
                  class: "real-checkbox"
                }, null, 512), [
                  [vModelCheckbox, rememberMe.value]
                ]),
                _cache[17] || (_cache[17] = createBaseVNode("span", { class: "custom-checkbox" }, null, -1)),
                createTextVNode(" " + toDisplayString(unref(t)("login.rememberPassword")), 1)
              ])
            ]),
            createBaseVNode("button", {
              class: "login-btn",
              disabled: !canSubmitChaoxingPasswordLogin.value,
              onClick: handleChaoxingPasswordLogin
            }, toDisplayString(unref(t)("login.btn.signIn")), 9, _hoisted_34$1),
            createBaseVNode("div", _hoisted_35$1, [
              createBaseVNode("a", {
                class: "action-pill action-pill-link",
                href: CHAOXING_FORGET_PWD_URL,
                target: "_blank",
                rel: "noopener noreferrer"
              }, toDisplayString(unref(t)("login.btn.forgotPassword")), 1),
              createBaseVNode("button", {
                class: "action-pill action-pill-btn",
                onClick: _cache[10] || (_cache[10] = ($event) => openChaoxingQrPanel())
              }, toDisplayString(unref(t)("login.btn.qrSignIn")), 1),
              createBaseVNode("span", _hoisted_36$1, toDisplayString(unref(t)("login.cx.limitedBadge")), 1)
            ]),
            createVNode(Transition, { name: "fade-slide" }, {
              default: withCtx(() => [
                chaoxingQrVisible.value ? (openBlock(), createElementBlock("div", _hoisted_37$1, [
                  createBaseVNode("div", _hoisted_38$1, [
                    createBaseVNode("span", _hoisted_39$1, toDisplayString(unref(t)("login.cx.qr.panelTitle")), 1),
                    createBaseVNode("button", {
                      class: "qr-close-btn",
                      type: "button",
                      onClick: closeChaoxingQrPanel
                    }, toDisplayString(unref(t)("login.qr.collapse")), 1)
                  ]),
                  createBaseVNode("div", _hoisted_40$1, [
                    cxQrImageBase64.value ? (openBlock(), createElementBlock("img", {
                      key: 0,
                      src: cxQrImageBase64.value,
                      alt: unref(t)("login.cx.qr.imageAlt"),
                      class: "qr-image"
                    }, null, 8, _hoisted_41$1)) : (openBlock(), createElementBlock("div", _hoisted_42$1, toDisplayString(cxQrState.value === "error" ? cxQrStateMessage.value || unref(t)("login.cx.qr.loadFailed") : unref(t)("login.cx.qr.generating")), 1))
                  ]),
                  createBaseVNode("p", _hoisted_43$1, toDisplayString(cxQrStateMessage.value || unref(t)("login.cx.qr.defaultHint")), 1),
                  cxQrRemainingSeconds.value > 0 ? (openBlock(), createElementBlock("p", _hoisted_44$1, toDisplayString(tr("login.qr.remaining", { n: cxQrRemainingSeconds.value })), 1)) : createCommentVNode("", true),
                  createBaseVNode("button", {
                    class: "login-btn",
                    disabled: cxQrSubmitting.value,
                    onClick: _cache[11] || (_cache[11] = ($event) => openChaoxingQrPanel(true))
                  }, toDisplayString(cxQrImageBase64.value ? unref(t)("login.cx.qr.refresh") : unref(t)("login.cx.qr.generate")), 9, _hoisted_45$1)
                ])) : createCommentVNode("", true)
              ]),
              _: 1
            }),
            createBaseVNode("div", _hoisted_46$1, [
              createBaseVNode("span", _hoisted_47$1, toDisplayString(unref(t)("login.cx.restrictedNote")), 1)
            ])
          ], 64)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_48$1, [
            createBaseVNode("label", _hoisted_49$1, [
              withDirectives(createBaseVNode("input", {
                type: "checkbox",
                "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => agreePolicy.value = $event),
                class: "real-checkbox"
              }, null, 512), [
                [vModelCheckbox, agreePolicy.value]
              ]),
              _cache[18] || (_cache[18] = createBaseVNode("span", { class: "custom-checkbox" }, null, -1)),
              createBaseVNode("span", _hoisted_50$1, toDisplayString(unref(t)("login.agreement.prefix")), 1),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[13] || (_cache[13] = ($event) => emit("showLegal", "disclaimer"))
              }, toDisplayString(unref(t)("login.agreement.disclaimer")), 1),
              createBaseVNode("span", _hoisted_51$1, toDisplayString(unref(t)("login.agreement.and")), 1),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[14] || (_cache[14] = ($event) => emit("showLegal", "privacy"))
              }, toDisplayString(unref(t)("login.agreement.privacy")), 1)
            ])
          ]),
          createBaseVNode("p", _hoisted_52$1, toDisplayString(unref(NON_OFFICIAL_DISCLAIMER_ZH)), 1),
          createBaseVNode("p", _hoisted_53$1, toDisplayString(unref(NON_OFFICIAL_DISCLAIMER_EN)), 1),
          statusMsg.value ? (openBlock(), createElementBlock("p", {
            key: 2,
            class: normalizeClass(["status-msg", { error: statusMsg.value.includes("⚠️") || statusMsg.value.includes("❌") }])
          }, toDisplayString(statusMsg.value), 3)) : createCommentVNode("", true)
        ]))
      ]);
    };
  }
};
const LoginV3 = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-e8d8b731"]]);
let probePromise = null;
function certIssueMessagesFromResults(results) {
  if (!Array.isArray(results)) return [];
  return results.filter(
    (item) => Boolean(item) && item.status === "cert-error"
  ).map((item) => `${item.domain} 证书校验未通过，已以兼容模式连接`);
}
const certIssues = ref([]);
function ensureCertProbe() {
  if (probePromise) return probePromise;
  probePromise = invokeNative("probe_school_cert_status").then((results) => {
    certIssues.value = certIssueMessagesFromResults(results);
    return results;
  }).catch(() => {
    certIssues.value = [];
    return [];
  });
  return probePromise;
}
function useCertProbeBanner() {
  return { certIssues, ensureCertProbe };
}
const _hoisted_1 = { class: "me-view" };
const _hoisted_2 = { class: "dashboard-header" };
const _hoisted_3 = { class: "header-pill" };
const _hoisted_4 = {
  key: 0,
  class: "profile-card"
};
const _hoisted_5 = { class: "profile-student-id" };
const _hoisted_6 = { class: "profile-school" };
const _hoisted_7 = { class: "profile-actions" };
const _hoisted_8 = {
  key: 0,
  class: "demo-actions"
};
const _hoisted_9 = { class: "demo-hint" };
const _hoisted_10 = {
  key: 1,
  class: "profile-card profile-card--login"
};
const _hoisted_11 = { class: "status-card" };
const _hoisted_12 = { class: "status-left" };
const _hoisted_13 = { class: "status-text" };
const _hoisted_14 = { class: "status-title" };
const _hoisted_15 = { class: "status-subtitle" };
const _hoisted_16 = { class: "func-grid" };
const _hoisted_17 = { class: "grid-label" };
const _hoisted_18 = { class: "grid-label" };
const _hoisted_19 = { class: "grid-label" };
const _hoisted_20 = { class: "grid-label" };
const _hoisted_21 = { class: "grid-label" };
const _hoisted_22 = { class: "grid-label" };
const _hoisted_23 = { class: "grid-label" };
const _hoisted_24 = { class: "grid-label" };
const _hoisted_25 = { class: "grid-label" };
const _hoisted_26 = { class: "grid-label" };
const _hoisted_27 = { class: "grid-label" };
const _hoisted_28 = { class: "grid-label" };
const _hoisted_29 = { class: "grid-label" };
const _hoisted_30 = { class: "grid-label" };
const _hoisted_31 = { class: "grid-label" };
const _hoisted_32 = { class: "legal-card about-minihbut-card" };
const _hoisted_33 = { class: "legal-title" };
const _hoisted_34 = { class: "legal-content" };
const _hoisted_35 = { class: "muted-en" };
const _hoisted_36 = { key: 0 };
const _hoisted_37 = { class: "privacy-policy-entry__body" };
const _hoisted_38 = { class: "privacy-policy-entry__title" };
const _hoisted_39 = { class: "privacy-policy-entry__desc" };
const _hoisted_40 = { class: "legal-title" };
const _hoisted_41 = { class: "legal-tabs" };
const _hoisted_42 = {
  key: 0,
  class: "legal-content"
};
const _hoisted_43 = {
  key: 1,
  class: "legal-content"
};
const _hoisted_44 = { class: "icp-beian-footer" };
const _hoisted_45 = { class: "intro" };
const _hoisted_46 = { class: "section" };
const _hoisted_47 = { class: "label" };
const _hoisted_48 = { class: "section" };
const _hoisted_49 = { class: "label" };
const _hoisted_50 = { class: "opensource-list" };
const _hoisted_51 = { class: "tag" };
const _hoisted_52 = { class: "tag" };
const _hoisted_53 = { class: "tag" };
const _hoisted_54 = { class: "section thanks" };
const _hoisted_55 = { class: "highlight" };
const _hoisted_56 = { class: "modal-actions" };
const _hoisted_57 = { class: "intro" };
const _hoisted_58 = { class: "sponsor-qr-container" };
const _hoisted_59 = {
  key: 0,
  class: "sponsor-loading"
};
const _hoisted_60 = ["src", "alt"];
const _hoisted_61 = { class: "sponsor-hint" };
const _hoisted_62 = { class: "modal-actions" };
const _hoisted_63 = { class: "intro" };
const _hoisted_64 = {
  key: 0,
  class: "account-list"
};
const _hoisted_65 = ["onClick"];
const _hoisted_66 = { class: "account-info" };
const _hoisted_67 = { class: "account-label" };
const _hoisted_68 = { class: "account-id" };
const _hoisted_69 = {
  key: 0,
  class: "account-badge account-badge--current"
};
const _hoisted_70 = {
  key: 1,
  class: "account-badge account-badge--busy"
};
const _hoisted_71 = {
  key: 2,
  class: "account-badge account-badge--warn"
};
const _hoisted_72 = {
  key: 3,
  class: "account-badge account-badge--ready"
};
const _hoisted_73 = ["disabled", "onClick"];
const _hoisted_74 = {
  key: 1,
  class: "empty-hint"
};
const _hoisted_75 = { class: "modal-actions" };
const _hoisted_76 = ["disabled"];
const SPONSOR_IMAGE_CACHE_KEY = "hbu_sponsor_qr_cache";
const SPONSOR_IMAGE_SRC = "https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/%E8%B5%9E%E8%B5%8F%E7%A0%81.JPG";
const _sfc_main = {
  __name: "MeView",
  props: {
    studentId: { type: String, default: "" },
    isLoggedIn: { type: Boolean, default: false },
    loginMode: { type: String, default: "portal_password" },
    configAdminIds: { type: Array, default: () => [] }
  },
  emits: ["success", "switchMode", "logout", "navigate", "checkUpdate", "openOfficial", "openFeedback", "openConfig", "openSettings", "account-switched"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const loginFormKey = ref(0);
    watch(
      () => props.isLoggedIn,
      (loggedIn, wasLoggedIn) => {
        if (wasLoggedIn && !loggedIn) {
          loginFormKey.value += 1;
        }
      }
    );
    const { certIssues: certIssues2, ensureCertProbe: ensureCertProbe2 } = useCertProbeBanner();
    onMounted(() => {
      ensureCertProbe2();
    });
    const emit = __emit;
    const { t } = useI18n();
    const activeLegalTab = ref("disclaimer");
    const legalSectionRef = ref(null);
    const showOpenSourceModal = ref(false);
    const showSponsorModal = ref(false);
    const sponsorImageUrl = ref("");
    const sponsorImageLoading = ref(false);
    const isDemoSession = computed(() => isTestAccountSession());
    const showSponsorEntry = computed(
      () => isSponsorEntryAllowed({
        isLoggedIn: props.isLoggedIn,
        isDemoSession: isDemoSession.value
      })
    );
    const loadSponsorImage = async () => {
      if (!showSponsorEntry.value) return;
      const cached = localStorage.getItem(SPONSOR_IMAGE_CACHE_KEY);
      if (cached) {
        sponsorImageUrl.value = cached;
        return;
      }
      sponsorImageLoading.value = true;
      try {
        const res = await fetch(SPONSOR_IMAGE_SRC);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          sponsorImageUrl.value = dataUrl;
          try {
            localStorage.setItem(SPONSOR_IMAGE_CACHE_KEY, dataUrl);
          } catch {
          }
          sponsorImageLoading.value = false;
        };
        reader.readAsDataURL(blob);
      } catch {
        sponsorImageUrl.value = SPONSOR_IMAGE_SRC;
        sponsorImageLoading.value = false;
      }
    };
    watch(showSponsorModal, (val) => {
      if (!val) return;
      if (!showSponsorEntry.value) {
        showSponsorModal.value = false;
        return;
      }
      if (!sponsorImageUrl.value) loadSponsorImage();
    });
    watch(showSponsorEntry, (allowed) => {
      if (!allowed && showSponsorModal.value) {
        showSponsorModal.value = false;
      }
    });
    const handleLogout = () => emit("logout");
    const goStudentInfo = () => emit("navigate", "studentinfo");
    const handleCheckUpdate = () => emit("checkUpdate");
    const handleOpenOfficial = () => emit("openOfficial");
    const handleOpenConfig = () => emit("openConfig");
    const handleOpenSettings = () => emit("openSettings");
    const handleOpenExport = () => emit("navigate", "export_center");
    const handleOpenServiceStats = () => emit("navigate", "service_stats");
    const handleOpenSchoolWebsite = () => emit("navigate", "school_website");
    const handleOpenQuickLinks = () => emit("navigate", "quick_links");
    const handleOpenCampusNetwork = () => emit("navigate", "campus_network");
    const handleOpenMore = () => emit("navigate", "more");
    const handleOpenPrivacyData = () => emit("navigate", "privacy_data");
    const handleOpenAuthHistory = () => emit("navigate", "identity_auth_history");
    const isConfigAdmin = () => Array.isArray(props.configAdminIds) && props.configAdminIds.includes(props.studentId);
    const policySession = () => ({
      isLoggedIn: props.isLoggedIn,
      isDemoSession: isDemoSession.value
    });
    const showCampusNetwork = computed(
      () => props.isLoggedIn && isViewAllowed("campus_network", policySession())
    );
    const showSchoolWebsite = computed(
      () => props.isLoggedIn && isViewAllowed("school_website", policySession())
    );
    const showQuickLinks = computed(
      () => props.isLoggedIn && isViewAllowed("quick_links", policySession())
    );
    const showServiceStats = computed(
      () => props.isLoggedIn && isViewAllowed("service_stats", policySession())
    );
    const showMoreModules = computed(() => isViewAllowed("more", policySession()));
    const showConfigTool = computed(
      () => isConfigAdmin() && isViewAllowed("config", policySession())
    );
    const resetDemoData = () => {
      if (!isTestAccountSession()) return;
      try {
        localStorage.removeItem("hbu_demo_banner_dismissed");
        const drop = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("cache:") || k.includes("2026000001"))) drop.push(k);
        }
        drop.forEach((k) => localStorage.removeItem(k));
        showToast(t("me.toast.demoReset"));
      } catch {
        showToast(t("me.toast.demoResetFailed"));
      }
    };
    const exitDemoMode = () => {
      clearTestAccountSession();
      emit("logout");
      showToast(t("me.toast.demoExited"));
    };
    const handleFeedback = () => emit("openFeedback");
    const handleOpenSource = () => {
      showOpenSourceModal.value = true;
    };
    const openGithub = async () => {
      await openExternal("https://github.com/superdaobo/mini-hbut");
    };
    const openIcpBeian = async () => {
      await openExternal(ICP_BEIAN_URL);
    };
    const handleShowLegal = async (tab) => {
      activeLegalTab.value = tab;
      await nextTick();
      if (legalSectionRef.value?.scrollIntoView) {
        legalSectionRef.value.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    const showAccountSwitchModal = ref(false);
    const savedAccounts = ref([]);
    const switchingAccount = ref("");
    const loadSavedAccounts = async () => {
      try {
        const list = await invokeNative("list_saved_accounts");
        savedAccounts.value = Array.isArray(list) ? list : [];
      } catch (e) {
        console.warn("[AccountSwitch] failed to load saved accounts:", e);
        savedAccounts.value = [];
      }
    };
    const openAccountSwitch = async () => {
      showAccountSwitchModal.value = true;
      switchingAccount.value = "";
      await loadSavedAccounts();
      if (!savedAccounts.value.length) {
        showToast(t("me.toast.noSavedAccounts"), "info");
        showAccountSwitchModal.value = false;
      }
    };
    const switchToAccount = async (acc) => {
      if (switchingAccount.value) return;
      if (acc.is_current) {
        showAccountSwitchModal.value = false;
        return;
      }
      if (!acc.has_cookies) {
        showToast(t("me.toast.sessionInvalid"), "warning");
        return;
      }
      switchingAccount.value = acc.student_id;
      try {
        const info = await invokeNative("switch_active_account", {
          studentId: acc.student_id,
          student_id: acc.student_id
        });
        const sid = String(info?.student_id || acc.student_id || "").trim();
        showAccountSwitchModal.value = false;
        if (sid) {
          emit("account-switched", sid);
          showToast(tf("me.toast.switched", { name: acc.masked_id || sid }), "success");
        } else {
          showToast(t("me.toast.switchFailedNoId"), "error");
        }
      } catch (e) {
        showToast(String(e?.message || e || t("me.toast.switchFailed")), "error");
      } finally {
        switchingAccount.value = "";
      }
    };
    const removeAccount = async (acc) => {
      if (switchingAccount.value) return;
      if (!window.confirm(tf("me.toast.deleteConfirm", { name: acc.masked_id || acc.student_id }))) {
        return;
      }
      switchingAccount.value = acc.student_id;
      try {
        await invokeNative("delete_saved_account", {
          studentId: acc.student_id,
          student_id: acc.student_id
        });
        savedAccounts.value = savedAccounts.value.filter((a) => a.student_id !== acc.student_id);
        showToast(t("me.toast.deleted"), "success");
        if (acc.is_current) {
          showAccountSwitchModal.value = false;
          emit("logout");
        }
      } catch (e) {
        showToast(String(e?.message || e || t("me.toast.deleteFailed")), "error");
      } finally {
        switchingAccount.value = "";
      }
    };
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          _cache[15] || (_cache[15] = createBaseVNode("div", { class: "header-left" }, [
            createBaseVNode("img", {
              class: "logo-img",
              src: _imports_0,
              alt: "HBUT"
            }),
            createBaseVNode("span", { class: "header-title" }, "Mini-HBUT")
          ], -1)),
          createBaseVNode("span", _hoisted_3, toDisplayString(unref(t)("me.title")), 1)
        ]),
        __props.isLoggedIn ? (openBlock(), createElementBlock("section", _hoisted_4, [
          _cache[16] || (_cache[16] = createBaseVNode("div", { class: "profile-avatar" }, [
            createBaseVNode("span", { class: "material-symbols-outlined avatar-icon" }, "person")
          ], -1)),
          createBaseVNode("h2", _hoisted_5, toDisplayString(__props.studentId), 1),
          createBaseVNode("p", _hoisted_6, toDisplayString(isDemoSession.value ? unref(t)("me.profile.demoSession") : unref(t)("me.profile.studentTool")), 1),
          createBaseVNode("div", _hoisted_7, [
            createBaseVNode("button", {
              class: "btn-info",
              onClick: goStudentInfo
            }, toDisplayString(unref(t)("me.profile.studentInfo")), 1),
            !isDemoSession.value ? (openBlock(), createElementBlock("button", {
              key: 0,
              class: "btn-switch",
              onClick: openAccountSwitch
            }, toDisplayString(unref(t)("me.profile.switchAccount")), 1)) : createCommentVNode("", true),
            createBaseVNode("button", {
              class: "btn-logout",
              onClick: handleLogout
            }, toDisplayString(unref(t)("me.profile.logout")), 1)
          ]),
          isDemoSession.value ? (openBlock(), createElementBlock("div", _hoisted_8, [
            createBaseVNode("p", _hoisted_9, toDisplayString(unref(t)("me.profile.demoHint")), 1),
            createBaseVNode("button", {
              type: "button",
              class: "btn-info",
              onClick: resetDemoData
            }, toDisplayString(unref(t)("me.profile.resetDemoData")), 1),
            createBaseVNode("button", {
              type: "button",
              class: "btn-logout",
              onClick: exitDemoMode
            }, toDisplayString(unref(t)("me.profile.exitDemoMode")), 1)
          ])) : createCommentVNode("", true)
        ])) : (openBlock(), createElementBlock("section", _hoisted_10, [
          (openBlock(), createBlock(LoginV3, {
            key: loginFormKey.value,
            "login-mode": __props.loginMode,
            onSuccess: _cache[0] || (_cache[0] = ($event) => emit("success", $event)),
            onSwitchMode: _cache[1] || (_cache[1] = ($event) => emit("switchMode", $event)),
            onShowLegal: handleShowLegal
          }, null, 8, ["login-mode"]))
        ])),
        createBaseVNode("section", _hoisted_11, [
          createBaseVNode("div", _hoisted_12, [
            _cache[17] || (_cache[17] = createBaseVNode("div", { class: "status-icon-box" }, [
              createBaseVNode("span", { class: "material-symbols-outlined status-icon" }, "verified_user")
            ], -1)),
            createBaseVNode("div", _hoisted_13, [
              createBaseVNode("span", _hoisted_14, toDisplayString(unref(t)("me.status.title")), 1),
              createBaseVNode("span", _hoisted_15, toDisplayString(unref(t)("me.status.subtitle")), 1),
              (openBlock(true), createElementBlock(Fragment, null, renderList(unref(certIssues2), (msg) => {
                return openBlock(), createElementBlock("span", {
                  key: msg,
                  class: "cert-probe-warning"
                }, toDisplayString(msg), 1);
              }), 128))
            ])
          ]),
          _cache[18] || (_cache[18] = createBaseVNode("span", { class: "status-dot" }, null, -1))
        ]),
        createBaseVNode("section", _hoisted_16, [
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleOpenOfficial
          }, [
            _cache[19] || (_cache[19] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E8F0FE" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#1A73E8" }
              }, "campaign")
            ], -1)),
            createBaseVNode("span", _hoisted_17, toDisplayString(unref(t)("me.grid.official")), 1)
          ]),
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleOpenSettings
          }, [
            _cache[20] || (_cache[20] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#FCE8E6" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#D93025" }
              }, "settings")
            ], -1)),
            createBaseVNode("span", _hoisted_18, toDisplayString(unref(t)("me.grid.settings")), 1)
          ]),
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleOpenPrivacyData
          }, [
            _cache[21] || (_cache[21] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E8F5E9" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#2E7D32" }
              }, "shield")
            ], -1)),
            createBaseVNode("span", _hoisted_19, toDisplayString(unref(t)("me.grid.privacy")), 1)
          ]),
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleOpenAuthHistory
          }, [
            _cache[22] || (_cache[22] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#EDE7F6" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#5E35B1" }
              }, "history")
            ], -1)),
            createBaseVNode("span", _hoisted_20, toDisplayString(unref(t)("me.grid.authHistory")), 1)
          ]),
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleOpenExport
          }, [
            _cache[23] || (_cache[23] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E6F4EA" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#1E8E3E" }
              }, "download")
            ], -1)),
            createBaseVNode("span", _hoisted_21, toDisplayString(unref(t)("me.grid.export")), 1)
          ]),
          showCampusNetwork.value ? (openBlock(), createElementBlock("button", {
            key: 0,
            class: "grid-item",
            onClick: handleOpenCampusNetwork
          }, [
            _cache[24] || (_cache[24] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E3F2FD" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#1565C0" }
              }, "wifi")
            ], -1)),
            createBaseVNode("span", _hoisted_22, toDisplayString(unref(t)("me.grid.campusNetwork")), 1)
          ])) : createCommentVNode("", true),
          showSchoolWebsite.value ? (openBlock(), createElementBlock("button", {
            key: 1,
            class: "grid-item",
            onClick: handleOpenSchoolWebsite
          }, [
            _cache[25] || (_cache[25] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E8EAF6" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#3949AB" }
              }, "language")
            ], -1)),
            createBaseVNode("span", _hoisted_23, toDisplayString(unref(t)("me.grid.schoolWebsite")), 1)
          ])) : createCommentVNode("", true),
          showQuickLinks.value ? (openBlock(), createElementBlock("button", {
            key: 2,
            class: "grid-item",
            onClick: handleOpenQuickLinks
          }, [
            _cache[26] || (_cache[26] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E0F7FA" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#00838F" }
              }, "link")
            ], -1)),
            createBaseVNode("span", _hoisted_24, toDisplayString(unref(t)("me.grid.quickLinks")), 1)
          ])) : createCommentVNode("", true),
          showServiceStats.value ? (openBlock(), createElementBlock("button", {
            key: 3,
            class: "grid-item",
            onClick: handleOpenServiceStats
          }, [
            _cache[27] || (_cache[27] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E0F2F1" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#00796B" }
              }, "monitoring")
            ], -1)),
            createBaseVNode("span", _hoisted_25, toDisplayString(unref(t)("me.grid.serviceStats")), 1)
          ])) : createCommentVNode("", true),
          showConfigTool.value ? (openBlock(), createElementBlock("button", {
            key: 4,
            class: "grid-item",
            onClick: handleOpenConfig
          }, [
            _cache[28] || (_cache[28] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#FEF7E0" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#F9AB00" }
              }, "build")
            ], -1)),
            createBaseVNode("span", _hoisted_26, toDisplayString(unref(t)("me.grid.configTool")), 1)
          ])) : createCommentVNode("", true),
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleCheckUpdate
          }, [
            _cache[29] || (_cache[29] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#F3E8FD" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#9333EA" }
              }, "update")
            ], -1)),
            createBaseVNode("span", _hoisted_27, toDisplayString(unref(t)("me.grid.checkUpdate")), 1)
          ]),
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleFeedback
          }, [
            _cache[30] || (_cache[30] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E1F5FE" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#0288D1" }
              }, "feedback")
            ], -1)),
            createBaseVNode("span", _hoisted_28, toDisplayString(unref(t)("me.grid.feedback")), 1)
          ]),
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleOpenSource
          }, [
            _cache[31] || (_cache[31] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#ECEFF1" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#455A64" }
              }, "code")
            ], -1)),
            createBaseVNode("span", _hoisted_29, toDisplayString(unref(t)("me.grid.openSource")), 1)
          ]),
          showSponsorEntry.value ? (openBlock(), createElementBlock("button", {
            key: 5,
            class: "grid-item",
            onClick: _cache[2] || (_cache[2] = ($event) => showSponsorModal.value = true)
          }, [
            _cache[32] || (_cache[32] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#FFF3E0" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#E65100" }
              }, "favorite")
            ], -1)),
            createBaseVNode("span", _hoisted_30, toDisplayString(unref(t)("me.grid.sponsor")), 1)
          ])) : createCommentVNode("", true),
          showMoreModules.value ? (openBlock(), createElementBlock("button", {
            key: 6,
            class: "grid-item",
            onClick: handleOpenMore
          }, [
            _cache[33] || (_cache[33] = createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#F3E5F5" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#7B1FA2" }
              }, "apps")
            ], -1)),
            createBaseVNode("span", _hoisted_31, toDisplayString(unref(t)("me.grid.more")), 1)
          ])) : createCommentVNode("", true)
        ]),
        createBaseVNode("section", _hoisted_32, [
          createBaseVNode("h3", _hoisted_33, toDisplayString(unref(t)("me.about.title")), 1),
          createBaseVNode("div", _hoisted_34, [
            createBaseVNode("p", null, toDisplayString(unref(NON_OFFICIAL_DISCLAIMER_ZH)), 1),
            createBaseVNode("p", _hoisted_35, toDisplayString(unref(NON_OFFICIAL_DISCLAIMER_EN)), 1),
            isDemoSession.value ? (openBlock(), createElementBlock("p", _hoisted_36, toDisplayString(unref(t)("me.about.demoNotice")), 1)) : createCommentVNode("", true),
            createBaseVNode("button", {
              type: "button",
              class: "privacy-policy-entry",
              onClick: _cache[3] || (_cache[3] = ($event) => unref(openExternal)(unref(PRIVACY_POLICY_URL)))
            }, [
              _cache[34] || (_cache[34] = createBaseVNode("span", {
                class: "privacy-policy-entry__icon",
                "aria-hidden": "true"
              }, [
                createBaseVNode("span", { class: "material-symbols-outlined" }, "shield")
              ], -1)),
              createBaseVNode("span", _hoisted_37, [
                createBaseVNode("span", _hoisted_38, toDisplayString(unref(t)("me.about.privacyTitle")), 1),
                createBaseVNode("span", _hoisted_39, toDisplayString(unref(t)("me.about.privacyDesc")), 1)
              ]),
              _cache[35] || (_cache[35] = createBaseVNode("span", {
                class: "privacy-policy-entry__chev material-symbols-outlined",
                "aria-hidden": "true"
              }, "open_in_new", -1))
            ])
          ])
        ]),
        createBaseVNode("section", {
          ref_key: "legalSectionRef",
          ref: legalSectionRef,
          class: "legal-card"
        }, [
          createBaseVNode("h3", _hoisted_40, toDisplayString(unref(t)("me.legal.title")), 1),
          createBaseVNode("div", _hoisted_41, [
            createBaseVNode("button", {
              class: normalizeClass(["legal-tab", { active: activeLegalTab.value === "disclaimer" }]),
              onClick: _cache[4] || (_cache[4] = ($event) => activeLegalTab.value = "disclaimer")
            }, toDisplayString(unref(t)("me.legal.tab.disclaimer")), 3),
            createBaseVNode("button", {
              class: normalizeClass(["legal-tab", { active: activeLegalTab.value === "privacy" }]),
              onClick: _cache[5] || (_cache[5] = ($event) => activeLegalTab.value = "privacy")
            }, toDisplayString(unref(t)("me.legal.tab.privacy")), 3)
          ]),
          activeLegalTab.value === "disclaimer" ? (openBlock(), createElementBlock("div", _hoisted_42, [
            createBaseVNode("p", null, toDisplayString(unref(t)("me.legal.disclaimer.intro")), 1),
            createBaseVNode("ul", null, [
              createBaseVNode("li", null, toDisplayString(unref(t)("me.legal.disclaimer.item1")), 1),
              createBaseVNode("li", null, toDisplayString(unref(t)("me.legal.disclaimer.item2")), 1),
              createBaseVNode("li", null, toDisplayString(unref(t)("me.legal.disclaimer.item3")), 1),
              createBaseVNode("li", null, toDisplayString(unref(t)("me.legal.disclaimer.item4")), 1)
            ])
          ])) : (openBlock(), createElementBlock("div", _hoisted_43, [
            createBaseVNode("p", null, toDisplayString(unref(t)("me.legal.privacy.intro")), 1),
            createBaseVNode("ul", null, [
              createBaseVNode("li", null, [
                createBaseVNode("strong", null, toDisplayString(unref(t)("me.legal.privacy.collectLabel")), 1),
                createTextVNode("：" + toDisplayString(unref(t)("me.legal.privacy.collectText")), 1)
              ]),
              createBaseVNode("li", null, [
                createBaseVNode("strong", null, toDisplayString(unref(t)("me.legal.privacy.purposeLabel")), 1),
                createTextVNode("：" + toDisplayString(unref(t)("me.legal.privacy.purposeText")), 1)
              ]),
              createBaseVNode("li", null, [
                createBaseVNode("strong", null, toDisplayString(unref(t)("me.legal.privacy.storageLabel")), 1),
                createTextVNode("：" + toDisplayString(unref(t)("me.legal.privacy.storageText")), 1)
              ]),
              createBaseVNode("li", null, [
                createBaseVNode("strong", null, toDisplayString(unref(t)("me.legal.privacy.shareLabel")), 1),
                createTextVNode("：" + toDisplayString(unref(t)("me.legal.privacy.shareText")), 1)
              ]),
              createBaseVNode("li", null, [
                createBaseVNode("strong", null, toDisplayString(unref(t)("me.legal.privacy.retentionLabel")), 1),
                createTextVNode("：" + toDisplayString(unref(t)("me.legal.privacy.retentionText")), 1)
              ])
            ]),
            createBaseVNode("p", null, toDisplayString(unref(t)("me.legal.privacy.agreement")), 1)
          ]))
        ], 512),
        createBaseVNode("footer", _hoisted_44, [
          createBaseVNode("button", {
            type: "button",
            class: "icp-beian-link",
            onClick: openIcpBeian
          }, toDisplayString(unref(ICP_BEIAN_TEXT)), 1)
        ]),
        createVNode(Transition, { name: "modal-pop" }, {
          default: withCtx(() => [
            showOpenSourceModal.value ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "modal-mask",
              onClick: _cache[8] || (_cache[8] = ($event) => showOpenSourceModal.value = false)
            }, [
              createBaseVNode("div", {
                class: "modal-card modal-pop-card",
                onClick: _cache[7] || (_cache[7] = withModifiers(() => {
                }, ["stop"]))
              }, [
                createBaseVNode("h3", null, [
                  _cache[36] || (_cache[36] = createBaseVNode("span", { class: "material-symbols-outlined opensource-title-icon" }, "menu_book", -1)),
                  createTextVNode(" " + toDisplayString(unref(t)("me.opensource.title")), 1)
                ]),
                createBaseVNode("p", _hoisted_45, toDisplayString(unref(t)("me.opensource.intro")), 1),
                createBaseVNode("div", _hoisted_46, [
                  createBaseVNode("p", _hoisted_47, toDisplayString(unref(t)("me.opensource.projectAddress")), 1),
                  createBaseVNode("a", {
                    class: "github-link",
                    onClick: openGithub
                  }, [..._cache[37] || (_cache[37] = [
                    createBaseVNode("svg", {
                      class: "icon",
                      viewBox: "0 0 24 24",
                      fill: "currentColor"
                    }, [
                      createBaseVNode("path", { d: "M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" })
                    ], -1),
                    createTextVNode(" https://github.com/superdaobo/mini-hbut ", -1)
                  ])])
                ]),
                createBaseVNode("div", _hoisted_48, [
                  createBaseVNode("p", _hoisted_49, toDisplayString(unref(t)("me.opensource.techStack")), 1),
                  createBaseVNode("ul", _hoisted_50, [
                    createBaseVNode("li", null, [
                      createBaseVNode("span", _hoisted_51, toDisplayString(unref(t)("me.opensource.tag.frontend")), 1),
                      _cache[38] || (_cache[38] = createTextVNode(" Tauri / Vue 3 / Vite", -1))
                    ]),
                    createBaseVNode("li", null, [
                      createBaseVNode("span", _hoisted_52, toDisplayString(unref(t)("me.opensource.tag.backend")), 1),
                      _cache[39] || (_cache[39] = createTextVNode(" Rust (reqwest / scraper / serde)", -1))
                    ]),
                    createBaseVNode("li", null, [
                      createBaseVNode("span", _hoisted_53, toDisplayString(unref(t)("me.opensource.tag.thanks")), 1)
                    ])
                  ])
                ]),
                createBaseVNode("div", _hoisted_54, [
                  createBaseVNode("p", null, toDisplayString(unref(t)("me.opensource.thanksMiniHuGong")), 1),
                  createBaseVNode("p", null, toDisplayString(unref(t)("me.opensource.thanksFriends")), 1),
                  createBaseVNode("p", _hoisted_55, toDisplayString(unref(t)("me.opensource.thanksAll")), 1)
                ]),
                createBaseVNode("div", _hoisted_56, [
                  createBaseVNode("button", {
                    class: "btn-primary",
                    onClick: _cache[6] || (_cache[6] = ($event) => showOpenSourceModal.value = false)
                  }, toDisplayString(unref(t)("me.opensource.gotIt")), 1)
                ])
              ])
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }),
        createVNode(Transition, { name: "modal-pop" }, {
          default: withCtx(() => [
            showSponsorModal.value && showSponsorEntry.value ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "modal-mask",
              onClick: _cache[11] || (_cache[11] = ($event) => showSponsorModal.value = false)
            }, [
              createBaseVNode("div", {
                class: "modal-card sponsor-modal modal-pop-card",
                onClick: _cache[10] || (_cache[10] = withModifiers(() => {
                }, ["stop"]))
              }, [
                createBaseVNode("h3", null, toDisplayString(unref(t)("me.sponsor.title")), 1),
                createBaseVNode("p", _hoisted_57, toDisplayString(unref(t)("me.sponsor.intro")), 1),
                createBaseVNode("div", _hoisted_58, [
                  sponsorImageLoading.value ? (openBlock(), createElementBlock("div", _hoisted_59, toDisplayString(unref(t)("me.sponsor.loading")), 1)) : sponsorImageUrl.value ? (openBlock(), createElementBlock("img", {
                    key: 1,
                    src: sponsorImageUrl.value,
                    alt: unref(t)("me.sponsor.qrAlt"),
                    class: "sponsor-qr-image"
                  }, null, 8, _hoisted_60)) : createCommentVNode("", true)
                ]),
                createBaseVNode("p", _hoisted_61, toDisplayString(unref(t)("me.sponsor.hint")), 1),
                createBaseVNode("div", _hoisted_62, [
                  createBaseVNode("button", {
                    class: "btn-primary",
                    onClick: _cache[9] || (_cache[9] = ($event) => showSponsorModal.value = false)
                  }, toDisplayString(unref(t)("common.close")), 1)
                ])
              ])
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }),
        createVNode(Transition, { name: "modal-pop" }, {
          default: withCtx(() => [
            showAccountSwitchModal.value ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "modal-mask",
              onClick: _cache[14] || (_cache[14] = ($event) => showAccountSwitchModal.value = false)
            }, [
              createBaseVNode("div", {
                class: "modal-card account-switch-modal modal-pop-card",
                onClick: _cache[13] || (_cache[13] = withModifiers(() => {
                }, ["stop"]))
              }, [
                createBaseVNode("h3", null, [
                  _cache[40] || (_cache[40] = createBaseVNode("span", { class: "material-symbols-outlined account-switch-title-icon" }, "switch_account", -1)),
                  createTextVNode(" " + toDisplayString(unref(t)("me.account.title")), 1)
                ]),
                createBaseVNode("p", _hoisted_63, toDisplayString(unref(t)("me.account.intro")), 1),
                savedAccounts.value.length ? (openBlock(), createElementBlock("ul", _hoisted_64, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(savedAccounts.value, (acc) => {
                    return openBlock(), createElementBlock("li", {
                      key: acc.student_id,
                      class: normalizeClass(["account-item", { "account-item--busy": switchingAccount.value === acc.student_id }])
                    }, [
                      createBaseVNode("div", {
                        class: "account-main",
                        onClick: ($event) => switchToAccount(acc)
                      }, [
                        createBaseVNode("div", _hoisted_66, [
                          createBaseVNode("span", _hoisted_67, toDisplayString(acc.display_name || acc.masked_id), 1),
                          createBaseVNode("span", _hoisted_68, toDisplayString(acc.masked_id), 1)
                        ]),
                        acc.is_current ? (openBlock(), createElementBlock("span", _hoisted_69, toDisplayString(unref(t)("me.account.current")), 1)) : switchingAccount.value === acc.student_id ? (openBlock(), createElementBlock("span", _hoisted_70, toDisplayString(unref(t)("me.account.switching")), 1)) : !acc.has_cookies ? (openBlock(), createElementBlock("span", _hoisted_71, toDisplayString(unref(t)("me.account.needRelogin")), 1)) : (openBlock(), createElementBlock("span", _hoisted_72, toDisplayString(unref(t)("me.account.ready")), 1))
                      ], 8, _hoisted_65),
                      !acc.is_current ? (openBlock(), createElementBlock("button", {
                        key: 0,
                        type: "button",
                        class: "account-delete",
                        disabled: !!switchingAccount.value,
                        onClick: ($event) => removeAccount(acc)
                      }, toDisplayString(unref(t)("me.account.delete")), 9, _hoisted_73)) : createCommentVNode("", true)
                    ], 2);
                  }), 128))
                ])) : (openBlock(), createElementBlock("p", _hoisted_74, toDisplayString(unref(t)("me.account.emptyHint")), 1)),
                createBaseVNode("div", _hoisted_75, [
                  createBaseVNode("button", {
                    class: "btn-primary",
                    disabled: !!switchingAccount.value,
                    onClick: _cache[12] || (_cache[12] = ($event) => showAccountSwitchModal.value = false)
                  }, toDisplayString(unref(t)("common.close")), 9, _hoisted_76)
                ])
              ])
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        })
      ]);
    };
  }
};
const MeView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-1b40b3f8"]]);
export {
  MeView as default
};
