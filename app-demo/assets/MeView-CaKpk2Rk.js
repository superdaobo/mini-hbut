import { a as ref, w as watch, o as onMounted, m as onBeforeUnmount, c as createElementBlock, b as openBlock, d as createBaseVNode, n as normalizeClass, e as computed, t as toDisplayString, f as createCommentVNode, F as Fragment, q as createVNode, C as withDirectives, D as vModelText, g as createTextVNode, H as vModelCheckbox, l as withCtx, T as Transition, u as unref, y as createStaticVNode, k as createBlock, j as withModifiers, z as nextTick } from "./vue-core-DdLVj9yW.js";
import { _ as _imports_0 } from "./app_icon-BoqTJkLh.js";
import { _ as _export_sfc, M as loadPortalRememberedPassword, N as loadChaoxingRememberedPassword, a as axiosInstance, O as syncPortalRememberCredential, b as setCachedData, P as saveRememberedCredential, Q as buildHbutAccountKey, R as buildChaoxingAccountKey, o as openExternal, s as showToast } from "./app-demo-CxKBY5JQ.js";
import { N as NON_OFFICIAL_DISCLAIMER_ZH, w as NON_OFFICIAL_DISCLAIMER_EN, j as fetchRemoteConfig, k as applyOcrRuntimeConfig, m as getStoredOcrConfig, P as PRIVACY_POLICY_URL, I as ICP_BEIAN_TEXT, x as ICP_BEIAN_URL, y as isSponsorEntryAllowed, i as isViewAllowed } from "./more-modules-CsUTdMqs.js";
import { p as pushDebugLog, F as isTestAccountCredentials, b as isTauriRuntime, a as invokeNative, s as markTestAccountSession, T as TEST_ACCOUNT, G as TEST_ACCOUNT_LOGIN_METHOD, u as seedTestAccountCaches, y as getTestAccountGrades, i as isTestAccountSession, C as clearTestAccountSession } from "./runtime-bridge-apFQ0nCw.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1$1 = { class: "login-container" };
const _hoisted_2$1 = {
  class: "entry-switch",
  role: "tablist",
  "aria-label": "登录入口切换"
};
const _hoisted_3$1 = { class: "mode-capsule" };
const _hoisted_4$1 = {
  key: 0,
  class: "progress-container"
};
const _hoisted_5$1 = { class: "status-msg" };
const _hoisted_6$1 = {
  key: 1,
  class: "form-container"
};
const _hoisted_7$1 = { class: "input-group" };
const _hoisted_8$1 = { class: "input-group" };
const _hoisted_9$1 = { class: "checkbox-group" };
const _hoisted_10$1 = { class: "checkbox-label" };
const _hoisted_11$1 = ["disabled"];
const _hoisted_12$1 = { class: "action-pills" };
const _hoisted_13$1 = {
  key: 0,
  class: "qr-panel"
};
const _hoisted_14$1 = { class: "qr-image-box" };
const _hoisted_15$1 = ["src"];
const _hoisted_16$1 = {
  key: 1,
  class: "qr-placeholder"
};
const _hoisted_17$1 = { class: "qr-status" };
const _hoisted_18$1 = {
  key: 0,
  class: "qr-countdown"
};
const _hoisted_19$1 = ["disabled"];
const _hoisted_20$1 = { class: "mode-info" };
const _hoisted_21 = { class: "info-text" };
const _hoisted_22 = { class: "input-group" };
const _hoisted_23 = { class: "input-group" };
const _hoisted_24 = { class: "checkbox-group" };
const _hoisted_25 = { class: "checkbox-label" };
const _hoisted_26 = ["disabled"];
const _hoisted_27 = { class: "action-pills" };
const _hoisted_28 = {
  key: 0,
  class: "qr-panel"
};
const _hoisted_29 = { class: "qr-image-box" };
const _hoisted_30 = ["src"];
const _hoisted_31 = {
  key: 1,
  class: "qr-placeholder"
};
const _hoisted_32 = { class: "qr-status" };
const _hoisted_33 = {
  key: 0,
  class: "qr-countdown"
};
const _hoisted_34 = ["disabled"];
const _hoisted_35 = { class: "checkbox-group agreement" };
const _hoisted_36 = { class: "checkbox-label checkbox-label--agreement" };
const _hoisted_37 = { class: "non-official-disclaimer" };
const _hoisted_38 = { class: "non-official-disclaimer non-official-disclaimer--en" };
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
    const props = __props;
    const emit = __emit;
    const LOGIN_MODES = [
      {
        key: "portal",
        title: "新融合门户",
        desc: "账号密码 + 扫码临时登录"
      },
      {
        key: "chaoxing",
        title: "学习通（功能受限）",
        desc: "账号密码 + 扫码临时登录"
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
    const username = ref("");
    const password = ref("");
    const chaoxingAccount = ref("");
    const chaoxingPassword = ref("");
    const rememberMe = ref(true);
    const agreePolicy = ref(true);
    const loading = ref(false);
    const statusMsg = ref("");
    const ocrConfigMode = ref("本地");
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
    const currentModeMeta = computed(() => LOGIN_MODES.find((item) => item.key === activeMode.value) || LOGIN_MODES[0]);
    const canSubmitPasswordLogin = computed(() => {
      return Boolean(username.value && password.value && agreePolicy.value && !loading.value);
    });
    const canSubmitChaoxingPasswordLogin = computed(() => {
      return Boolean(chaoxingAccount.value && chaoxingPassword.value && agreePolicy.value && !loading.value);
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
      if (activeSource.includes("fallback") || activeSource.includes("local")) return "本地";
      if (activeSource && activeSource !== "unknown") return "远程";
      const configured = String(status?.configured_endpoint || "").trim();
      if (configured || endpoint) return "远程";
      if (status?.fallback_used) return "本地";
      return "本地";
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
        ocrConfigMode.value = endpointHint ? "远程" : "本地";
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
      refreshOcrMode(String(localCfg.endpoint).trim());
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
        qrStateMessage.value = "二维码已失效，请点击刷新二维码。";
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
        cxQrStateMessage.value = "学习通二维码已失效，请点击刷新。";
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
        statusMsg.value = `⚠️ 登录成功，但成绩同步失败：${gradesData?.error || "未知错误"}`;
        emit("success", []);
      } catch (e) {
        const errMsg = e.response?.data?.error || e.message || "未知错误";
        statusMsg.value = `⚠️ 登录成功，但成绩同步失败：${errMsg}`;
        emit("success", []);
      }
    };
    const savePortalCredentials = async () => {
      if (rememberMe.value) {
        localStorage.setItem("hbu_username", username.value);
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
      statusMsg.value = "正在进入 TestFlight 演示账号...";
      try {
        markTestAccountSession();
        username.value = TEST_ACCOUNT.studentId;
        localStorage.setItem("hbu_username", TEST_ACCOUNT.studentId);
        localStorage.setItem("hbu_remember", "false");
        localStorage.setItem("hbu_login_entry_mode", "portal");
        applyLoginMethodStorage(TEST_ACCOUNT_LOGIN_METHOD);
        localStorage.removeItem("hbu_manual_logout");
        localStorage.removeItem(LOGOUT_REASON_KEY);
        seedTestAccountCaches(setCachedData, TEST_ACCOUNT.studentId);
        statusMsg.value = "登录成功，已加载演示数据";
        emit("success", getTestAccountGrades());
      } finally {
        loading.value = false;
      }
    };
    const handlePasswordLogin = async () => {
      if (!username.value || !password.value) {
        statusMsg.value = "请输入完整的账号和密码";
        return;
      }
      if (!agreePolicy.value) {
        statusMsg.value = "请先阅读并同意免责声明与隐私政策";
        return;
      }
      if (isTestAccountCredentials(username.value, password.value)) {
        await handleTestAccountLogin();
        return;
      }
      loading.value = true;
      statusMsg.value = "🔒 正在登录...";
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
          statusMsg.value = `❌ ${result?.error || "登录失败"}`;
          return;
        }
        const sid = String(result?.data?.student_id || username.value || "").trim();
        if (sid) {
          localStorage.setItem("hbu_username", sid);
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
        statusMsg.value = "✅ 登录成功，正在同步数据...";
        await emitSuccessWithGrades(sid || username.value);
      } catch (e) {
        const errMsg = e.response?.data?.error || e.message || "未知错误";
        statusMsg.value = `⚠️ 登录失败: ${errMsg}`;
      } finally {
        loading.value = false;
        await refreshOcrMode(String(getStoredOcrConfig().endpoint).trim());
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
          qrStateMessage.value = "扫码确认成功，正在提交登录...";
          await confirmPortalQrLogin();
          return;
        }
        if (code === "2") {
          qrState.value = "scanned";
          qrStateMessage.value = "已扫码，正在确认登录状态...";
          const submitted = await confirmPortalQrLogin({ allowPending: true });
          if (submitted) return;
        } else if (code === "3") {
          qrState.value = "expired";
          qrStateMessage.value = "二维码已失效，请点击刷新二维码。";
          clearQrTimer();
          return;
        } else {
          qrState.value = "waiting";
          qrStateMessage.value = "等待扫码中...";
        }
      } catch (e) {
        qrState.value = "error";
        qrStateMessage.value = `二维码状态查询失败：${e.message || e}`;
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
        statusMsg.value = "请先阅读并同意免责声明与隐私政策";
        return;
      }
      if (!isTauriRuntime()) {
        statusMsg.value = "当前运行时暂不支持原生扫码登录，请使用账号密码登录。";
        return;
      }
      portalQrVisible.value = true;
      statusMsg.value = "";
      qrSubmitting.value = false;
      qrState.value = "loading";
      qrStateMessage.value = "正在生成二维码...";
      clearQrTimer();
      const currentSeq = ++portalQrInitSeq;
      try {
        const rawPayload = await withTimeout(invokeNative("portal_qr_init_login", {
          service: "https://e.hbut.edu.cn/login#/"
        }), 2e4, "二维码生成超时，请检查网络后重试");
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
          throw new Error("二维码数据不完整，请重试");
        }
        qrUuid.value = uuid;
        qrImageBase64.value = qrImg;
        qrExpiresAt.value = Date.now() + 180 * 1e3;
        qrState.value = "waiting";
        qrStateMessage.value = "请使用新融合门户 App 扫码登录。";
        updateQrCountdown();
        scheduleQrPoll();
      } catch (e) {
        qrState.value = "error";
        qrStateMessage.value = `二维码生成失败：${e.message || e}`;
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
        const userInfo = await invokeNative("portal_qr_confirm_login", {
          uuid: qrUuid.value,
          service: "https://e.hbut.edu.cn/login#/"
        });
        const sid = String(userInfo?.student_id || "").trim();
        if (!sid) {
          throw new Error("扫码成功但未获取到学号");
        }
        username.value = sid;
        localStorage.setItem("hbu_username", sid);
        applyLoginMethodStorage("portal_qr_temp");
        localStorage.removeItem("hbu_manual_logout");
        localStorage.removeItem(LOGOUT_REASON_KEY);
        qrState.value = "success";
        qrStateMessage.value = "✅ 扫码登录成功，正在同步数据...";
        await emitSuccessWithGrades(sid);
        return true;
      } catch (e) {
        if (allowPending && isPortalPendingError(e)) {
          qrState.value = "scanned";
          qrStateMessage.value = "已扫码，请在手机端完成确认...";
          return false;
        }
        qrState.value = "error";
        qrStateMessage.value = `扫码登录失败：${e.message || e}`;
        return false;
      } finally {
        qrSubmitting.value = false;
      }
    };
    const handleChaoxingLoginSuccess = async (payload, modeKey) => {
      const sid = await resolveChaoxingStudentId(payload);
      if (!sid) {
        throw new Error("学习通登录成功，但未解析到 10 位学号，请先检查账号绑定信息");
      }
      username.value = sid;
      localStorage.setItem("hbu_username", sid);
      await saveChaoxingCredentials();
      applyLoginMethodStorage(modeKey);
      localStorage.removeItem("hbu_manual_logout");
      localStorage.removeItem(LOGOUT_REASON_KEY);
      statusMsg.value = "✅ 学习通登录成功，正在进入首页...";
      pushDebugList(payload?.debug);
      emit("success", []);
    };
    const handleChaoxingPasswordLogin = async () => {
      if (!chaoxingAccount.value || !chaoxingPassword.value) {
        statusMsg.value = "请输入完整的学习通账号和密码";
        return;
      }
      if (!agreePolicy.value) {
        statusMsg.value = "请先阅读并同意免责声明与隐私政策";
        return;
      }
      if (!isTauriRuntime()) {
        statusMsg.value = "当前运行时暂不支持学习通原生登录，请在桌面端/原生容器使用。";
        return;
      }
      loading.value = true;
      statusMsg.value = "🔒 正在登录学习通...";
      try {
        const payload = await invokeNative("chaoxing_password_login", {
          account: chaoxingAccount.value,
          password: chaoxingPassword.value
        });
        await handleChaoxingLoginSuccess(payload, "chaoxing_password");
      } catch (e) {
        statusMsg.value = `⚠️ 学习通登录失败: ${e.message || e}`;
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
          cxQrStateMessage.value = "扫码确认成功，正在提交学习通登录...";
          await confirmChaoxingQrLogin();
          return;
        }
        if (typeCode === "4") {
          cxQrState.value = "scanned";
          cxQrStateMessage.value = payload?.nickname ? `已扫码：${payload.nickname}，请在学习通确认登录。` : "已扫码，请在学习通确认登录。";
        } else if (typeCode === "6") {
          cxQrState.value = "expired";
          cxQrStateMessage.value = "客户端取消登录，二维码已失效。";
          clearCxQrTimer();
          return;
        } else if (typeCode === "7") {
          cxQrState.value = "expired";
          cxQrStateMessage.value = payload?.message || "二维码异常，请刷新。";
          clearCxQrTimer();
          return;
        } else if (typeCode === "3") {
          cxQrState.value = "waiting";
          cxQrStateMessage.value = payload?.message || "等待扫码中...";
        } else {
          cxQrState.value = "waiting";
          cxQrStateMessage.value = payload?.message || "等待扫码中...";
        }
      } catch (e) {
        cxQrState.value = "error";
        cxQrStateMessage.value = `学习通二维码状态查询失败：${e.message || e}`;
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
        statusMsg.value = "请先阅读并同意免责声明与隐私政策";
        return;
      }
      if (!isTauriRuntime()) {
        statusMsg.value = "当前运行时暂不支持学习通扫码登录。";
        return;
      }
      chaoxingQrVisible.value = true;
      statusMsg.value = "";
      cxQrSubmitting.value = false;
      cxQrState.value = "loading";
      cxQrStateMessage.value = "正在生成学习通二维码...";
      clearCxQrTimer();
      const currentSeq = ++chaoxingQrInitSeq;
      try {
        const command = preferRefresh && cxQrUuid.value ? "chaoxing_qr_refresh_login" : "chaoxing_qr_init_login";
        const rawPayload = await withTimeout(invokeNative(command), 2e4, "学习通二维码生成超时，请检查网络后重试");
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
          throw new Error("学习通二维码数据不完整");
        }
        cxQrUuid.value = uuid;
        cxQrEnc.value = enc;
        cxQrImageBase64.value = qrImg;
        cxQrContext.value = payload?.context || null;
        const ttl = Number(payload?.expires_in_seconds || 150);
        cxQrExpiresAt.value = Date.now() + Math.max(60, ttl) * 1e3;
        cxQrState.value = "waiting";
        cxQrStateMessage.value = "请使用学习通 App 扫码登录。";
        updateCxQrCountdown();
        scheduleCxQrPoll();
        pushDebugList(payload?.debug);
      } catch (e) {
        cxQrState.value = "error";
        cxQrStateMessage.value = `学习通二维码生成失败：${e.message || e}`;
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
        const payload = await invokeNative("chaoxing_qr_confirm_login", {
          uuid: cxQrUuid.value,
          enc: cxQrEnc.value,
          account_hint: chaoxingAccount.value || void 0
        });
        cxQrState.value = "success";
        cxQrStateMessage.value = "✅ 学习通扫码登录成功，正在进入首页...";
        await handleChaoxingLoginSuccess(payload, "chaoxing_qr_temp");
      } catch (e) {
        cxQrState.value = "error";
        cxQrStateMessage.value = `学习通扫码登录失败：${e.message || e}`;
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
        statusMsg.value = "扫码临时登录已失效，请重新登录。";
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
        _cache[32] || (_cache[32] = createBaseVNode("div", { class: "logo" }, [
          createBaseVNode("img", {
            class: "logo-img",
            src: _imports_0,
            alt: "Mini-HBUT"
          })
        ], -1)),
        _cache[33] || (_cache[33] = createBaseVNode("h2", null, "账号登录", -1)),
        _cache[34] || (_cache[34] = createBaseVNode("p", { class: "subtitle" }, "选择入口后继续", -1)),
        createBaseVNode("div", _hoisted_2$1, [
          createBaseVNode("span", {
            class: normalizeClass(["entry-slider", { "is-chaoxing": isChaoxingMode.value }])
          }, null, 2),
          createBaseVNode("button", {
            class: normalizeClass(["entry-btn", { active: isPortalMode.value }]),
            onClick: _cache[0] || (_cache[0] = ($event) => switchMode("portal"))
          }, " 新融合门户 ", 2),
          createBaseVNode("button", {
            class: normalizeClass(["entry-btn", { active: isChaoxingMode.value }]),
            onClick: _cache[1] || (_cache[1] = ($event) => switchMode("chaoxing"))
          }, " 学习通 ", 2)
        ]),
        createBaseVNode("p", _hoisted_3$1, toDisplayString(currentModeMeta.value.title), 1),
        loading.value ? (openBlock(), createElementBlock("div", _hoisted_4$1, [
          _cache[15] || (_cache[15] = createBaseVNode("div", { class: "loading-spinner" }, [
            createBaseVNode("div", { class: "spinner" })
          ], -1)),
          createBaseVNode("p", _hoisted_5$1, toDisplayString(statusMsg.value), 1)
        ])) : (openBlock(), createElementBlock("div", _hoisted_6$1, [
          isPortalMode.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            createBaseVNode("div", _hoisted_7$1, [
              _cache[16] || (_cache[16] = createBaseVNode("label", null, "学号", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => username.value = $event),
                type: "text",
                placeholder: "学号（10位数字）",
                maxlength: "10",
                onKeypress: handleKeyPress
              }, null, 544), [
                [vModelText, username.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_8$1, [
              _cache[17] || (_cache[17] = createBaseVNode("label", null, "密码", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => password.value = $event),
                type: "password",
                placeholder: "密码",
                onKeypress: handleKeyPress
              }, null, 544), [
                [vModelText, password.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_9$1, [
              createBaseVNode("label", _hoisted_10$1, [
                withDirectives(createBaseVNode("input", {
                  type: "checkbox",
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => rememberMe.value = $event),
                  class: "real-checkbox"
                }, null, 512), [
                  [vModelCheckbox, rememberMe.value]
                ]),
                _cache[18] || (_cache[18] = createBaseVNode("span", { class: "custom-checkbox" }, null, -1)),
                _cache[19] || (_cache[19] = createTextVNode(" 记住密码 ", -1))
              ])
            ]),
            createBaseVNode("button", {
              class: "login-btn",
              disabled: !canSubmitPasswordLogin.value,
              onClick: handlePasswordLogin
            }, " 登录 ", 8, _hoisted_11$1),
            createBaseVNode("div", _hoisted_12$1, [
              _cache[20] || (_cache[20] = createBaseVNode("a", {
                class: "action-pill action-pill-link",
                href: "https://auth.hbut.edu.cn/retrieve-password/retrievePassword/index.html?service=https%3A%2F%2Fe.hbut.edu.cn%2Flogin%23%2F#/",
                target: "_blank",
                rel: "noopener noreferrer"
              }, " 忘记密码 ", -1)),
              createBaseVNode("button", {
                class: "action-pill action-pill-btn",
                onClick: _cache[5] || (_cache[5] = ($event) => openPortalQrPanel())
              }, " 扫码登录 ")
            ]),
            createVNode(Transition, { name: "fade-slide" }, {
              default: withCtx(() => [
                portalQrVisible.value ? (openBlock(), createElementBlock("div", _hoisted_13$1, [
                  createBaseVNode("div", { class: "qr-panel-head" }, [
                    _cache[21] || (_cache[21] = createBaseVNode("span", { class: "qr-panel-title" }, "扫码登录（临时）", -1)),
                    createBaseVNode("button", {
                      class: "qr-close-btn",
                      type: "button",
                      onClick: closePortalQrPanel
                    }, "收起")
                  ]),
                  createBaseVNode("div", _hoisted_14$1, [
                    qrImageBase64.value ? (openBlock(), createElementBlock("img", {
                      key: 0,
                      src: qrImageBase64.value,
                      alt: "扫码登录二维码",
                      class: "qr-image"
                    }, null, 8, _hoisted_15$1)) : (openBlock(), createElementBlock("div", _hoisted_16$1, toDisplayString(qrState.value === "error" ? qrStateMessage.value || "二维码加载失败" : "正在生成二维码..."), 1))
                  ]),
                  createBaseVNode("p", _hoisted_17$1, toDisplayString(qrStateMessage.value || "请使用新融合门户 App 扫码登录。"), 1),
                  qrRemainingSeconds.value > 0 ? (openBlock(), createElementBlock("p", _hoisted_18$1, "二维码剩余 " + toDisplayString(qrRemainingSeconds.value) + " 秒", 1)) : createCommentVNode("", true),
                  createBaseVNode("button", {
                    class: "login-btn",
                    disabled: qrSubmitting.value,
                    onClick: _cache[6] || (_cache[6] = ($event) => openPortalQrPanel(true))
                  }, toDisplayString(qrImageBase64.value ? "刷新二维码" : "生成二维码"), 9, _hoisted_19$1)
                ])) : createCommentVNode("", true)
              ]),
              _: 1
            }),
            createBaseVNode("div", _hoisted_20$1, [
              createBaseVNode("span", _hoisted_21, "OCR 配置：" + toDisplayString(ocrConfigMode.value), 1)
            ])
          ], 64)) : isChaoxingMode.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("div", _hoisted_22, [
              _cache[22] || (_cache[22] = createBaseVNode("label", null, "学习通账号", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => chaoxingAccount.value = $event),
                type: "text",
                placeholder: "手机号 / 超星号 / 学号",
                maxlength: "40",
                onKeypress: handleKeyPress
              }, null, 544), [
                [vModelText, chaoxingAccount.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_23, [
              _cache[23] || (_cache[23] = createBaseVNode("label", null, "学习通密码", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => chaoxingPassword.value = $event),
                type: "password",
                placeholder: "密码",
                maxlength: "40",
                onKeypress: handleKeyPress
              }, null, 544), [
                [vModelText, chaoxingPassword.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_24, [
              createBaseVNode("label", _hoisted_25, [
                withDirectives(createBaseVNode("input", {
                  type: "checkbox",
                  "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => rememberMe.value = $event),
                  class: "real-checkbox"
                }, null, 512), [
                  [vModelCheckbox, rememberMe.value]
                ]),
                _cache[24] || (_cache[24] = createBaseVNode("span", { class: "custom-checkbox" }, null, -1)),
                _cache[25] || (_cache[25] = createTextVNode(" 记住密码 ", -1))
              ])
            ]),
            createBaseVNode("button", {
              class: "login-btn",
              disabled: !canSubmitChaoxingPasswordLogin.value,
              onClick: handleChaoxingPasswordLogin
            }, " 登录 ", 8, _hoisted_26),
            createBaseVNode("div", _hoisted_27, [
              createBaseVNode("a", {
                class: "action-pill action-pill-link",
                href: CHAOXING_FORGET_PWD_URL,
                target: "_blank",
                rel: "noopener noreferrer"
              }, " 忘记密码 "),
              createBaseVNode("button", {
                class: "action-pill action-pill-btn",
                onClick: _cache[10] || (_cache[10] = ($event) => openChaoxingQrPanel())
              }, " 扫码登录 "),
              _cache[26] || (_cache[26] = createBaseVNode("span", { class: "action-pill action-pill-note" }, "功能受限", -1))
            ]),
            createVNode(Transition, { name: "fade-slide" }, {
              default: withCtx(() => [
                chaoxingQrVisible.value ? (openBlock(), createElementBlock("div", _hoisted_28, [
                  createBaseVNode("div", { class: "qr-panel-head" }, [
                    _cache[27] || (_cache[27] = createBaseVNode("span", { class: "qr-panel-title" }, "学习通扫码登录（临时）", -1)),
                    createBaseVNode("button", {
                      class: "qr-close-btn",
                      type: "button",
                      onClick: closeChaoxingQrPanel
                    }, "收起")
                  ]),
                  createBaseVNode("div", _hoisted_29, [
                    cxQrImageBase64.value ? (openBlock(), createElementBlock("img", {
                      key: 0,
                      src: cxQrImageBase64.value,
                      alt: "学习通扫码二维码",
                      class: "qr-image"
                    }, null, 8, _hoisted_30)) : (openBlock(), createElementBlock("div", _hoisted_31, toDisplayString(cxQrState.value === "error" ? cxQrStateMessage.value || "二维码加载失败" : "正在生成学习通二维码..."), 1))
                  ]),
                  createBaseVNode("p", _hoisted_32, toDisplayString(cxQrStateMessage.value || "请使用学习通 App 扫码登录。"), 1),
                  cxQrRemainingSeconds.value > 0 ? (openBlock(), createElementBlock("p", _hoisted_33, "二维码剩余 " + toDisplayString(cxQrRemainingSeconds.value) + " 秒", 1)) : createCommentVNode("", true),
                  createBaseVNode("button", {
                    class: "login-btn",
                    disabled: cxQrSubmitting.value,
                    onClick: _cache[11] || (_cache[11] = ($event) => openChaoxingQrPanel(true))
                  }, toDisplayString(cxQrImageBase64.value ? "刷新学习通二维码" : "生成学习通二维码"), 9, _hoisted_34)
                ])) : createCommentVNode("", true)
              ]),
              _: 1
            }),
            _cache[28] || (_cache[28] = createBaseVNode("div", { class: "mode-info mode-info-warn" }, [
              createBaseVNode("span", { class: "info-text" }, "学习通登录后首页仅显示教务相关模块。")
            ], -1))
          ], 64)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_35, [
            createBaseVNode("label", _hoisted_36, [
              withDirectives(createBaseVNode("input", {
                type: "checkbox",
                "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => agreePolicy.value = $event),
                class: "real-checkbox"
              }, null, 512), [
                [vModelCheckbox, agreePolicy.value]
              ]),
              _cache[29] || (_cache[29] = createBaseVNode("span", { class: "custom-checkbox" }, null, -1)),
              _cache[30] || (_cache[30] = createBaseVNode("span", { class: "agreement-text" }, "我已阅读并同意", -1)),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[13] || (_cache[13] = ($event) => emit("showLegal", "disclaimer"))
              }, "《免责声明》"),
              _cache[31] || (_cache[31] = createBaseVNode("span", { class: "agreement-text" }, "与", -1)),
              createBaseVNode("button", {
                type: "button",
                class: "link-btn",
                onClick: _cache[14] || (_cache[14] = ($event) => emit("showLegal", "privacy"))
              }, "《隐私政策》")
            ])
          ]),
          createBaseVNode("p", _hoisted_37, toDisplayString(unref(NON_OFFICIAL_DISCLAIMER_ZH)), 1),
          createBaseVNode("p", _hoisted_38, toDisplayString(unref(NON_OFFICIAL_DISCLAIMER_EN)), 1),
          statusMsg.value ? (openBlock(), createElementBlock("p", {
            key: 2,
            class: normalizeClass(["status-msg", { error: statusMsg.value.includes("失败") || statusMsg.value.includes("⚠️") || statusMsg.value.includes("❌") }])
          }, toDisplayString(statusMsg.value), 3)) : createCommentVNode("", true)
        ]))
      ]);
    };
  }
};
const LoginV3 = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-8d3dcb4d"]]);
const _hoisted_1 = { class: "me-view" };
const _hoisted_2 = {
  key: 0,
  class: "profile-card"
};
const _hoisted_3 = { class: "profile-student-id" };
const _hoisted_4 = { class: "profile-school" };
const _hoisted_5 = {
  key: 0,
  class: "demo-actions"
};
const _hoisted_6 = {
  key: 1,
  class: "profile-card profile-card--login"
};
const _hoisted_7 = { class: "func-grid" };
const _hoisted_8 = { class: "legal-card about-minihbut-card" };
const _hoisted_9 = { class: "legal-content" };
const _hoisted_10 = { class: "muted-en" };
const _hoisted_11 = { key: 0 };
const _hoisted_12 = { class: "legal-tabs" };
const _hoisted_13 = {
  key: 0,
  class: "legal-content"
};
const _hoisted_14 = {
  key: 1,
  class: "legal-content"
};
const _hoisted_15 = { class: "icp-beian-footer" };
const _hoisted_16 = { class: "modal-actions" };
const _hoisted_17 = { class: "sponsor-qr-container" };
const _hoisted_18 = {
  key: 0,
  class: "sponsor-loading"
};
const _hoisted_19 = ["src"];
const _hoisted_20 = { class: "modal-actions" };
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
  emits: ["success", "switchMode", "logout", "navigate", "checkUpdate", "openOfficial", "openFeedback", "openConfig", "openSettings"],
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
    const emit = __emit;
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
        showToast("已重置演示缓存，请重新打开各模块");
      } catch {
        showToast("演示数据重置失败");
      }
    };
    const exitDemoMode = () => {
      clearTestAccountSession();
      emit("logout");
      showToast("已退出演示模式");
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
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        _cache[41] || (_cache[41] = createStaticVNode('<header class="dashboard-header" data-v-69f61743><div class="header-left" data-v-69f61743><img class="logo-img" src="' + _imports_0 + '" alt="HBUT" data-v-69f61743><span class="header-title" data-v-69f61743>Mini-HBUT</span></div><span class="header-pill" data-v-69f61743>我的</span></header>', 1)),
        __props.isLoggedIn ? (openBlock(), createElementBlock("section", _hoisted_2, [
          _cache[13] || (_cache[13] = createBaseVNode("div", { class: "profile-avatar" }, [
            createBaseVNode("span", { class: "material-symbols-outlined avatar-icon" }, "person")
          ], -1)),
          createBaseVNode("h2", _hoisted_3, toDisplayString(__props.studentId), 1),
          createBaseVNode("p", _hoisted_4, toDisplayString(isDemoSession.value ? "演示会话（虚构数据）" : "学生工具"), 1),
          createBaseVNode("div", { class: "profile-actions" }, [
            createBaseVNode("button", {
              class: "btn-info",
              onClick: goStudentInfo
            }, "个人信息"),
            createBaseVNode("button", {
              class: "btn-logout",
              onClick: handleLogout
            }, "退出登录")
          ]),
          isDemoSession.value ? (openBlock(), createElementBlock("div", _hoisted_5, [
            _cache[12] || (_cache[12] = createBaseVNode("p", { class: "demo-hint" }, "当前为审核演示模式：页面使用虚构数据，不连接真实校园服务。", -1)),
            createBaseVNode("button", {
              type: "button",
              class: "btn-info",
              onClick: resetDemoData
            }, "重置演示数据"),
            createBaseVNode("button", {
              type: "button",
              class: "btn-logout",
              onClick: exitDemoMode
            }, "退出演示模式")
          ])) : createCommentVNode("", true)
        ])) : (openBlock(), createElementBlock("section", _hoisted_6, [
          (openBlock(), createBlock(LoginV3, {
            key: loginFormKey.value,
            "login-mode": __props.loginMode,
            onSuccess: _cache[0] || (_cache[0] = ($event) => emit("success", $event)),
            onSwitchMode: _cache[1] || (_cache[1] = ($event) => emit("switchMode", $event)),
            onShowLegal: handleShowLegal
          }, null, 8, ["login-mode"]))
        ])),
        _cache[42] || (_cache[42] = createStaticVNode('<section class="status-card" data-v-69f61743><div class="status-left" data-v-69f61743><div class="status-icon-box" data-v-69f61743><span class="material-symbols-outlined status-icon" data-v-69f61743>verified_user</span></div><div class="status-text" data-v-69f61743><span class="status-title" data-v-69f61743>登录状态</span><span class="status-subtitle" data-v-69f61743>静默登录已开启</span></div></div><span class="status-dot" data-v-69f61743></span></section>', 1)),
        createBaseVNode("section", _hoisted_7, [
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleOpenOfficial
          }, [..._cache[14] || (_cache[14] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E8F0FE" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#1A73E8" }
              }, "campaign")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "公告动态", -1)
          ])]),
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleOpenSettings
          }, [..._cache[15] || (_cache[15] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#FCE8E6" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#D93025" }
              }, "settings")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "设置中心", -1)
          ])]),
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleOpenPrivacyData
          }, [..._cache[16] || (_cache[16] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E8F5E9" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#2E7D32" }
              }, "shield")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "隐私与数据", -1)
          ])]),
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleOpenExport
          }, [..._cache[17] || (_cache[17] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E6F4EA" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#1E8E3E" }
              }, "download")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "导出中心", -1)
          ])]),
          showCampusNetwork.value ? (openBlock(), createElementBlock("button", {
            key: 0,
            class: "grid-item",
            onClick: handleOpenCampusNetwork
          }, [..._cache[18] || (_cache[18] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E3F2FD" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#1565C0" }
              }, "wifi")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "校园网", -1)
          ])])) : createCommentVNode("", true),
          showSchoolWebsite.value ? (openBlock(), createElementBlock("button", {
            key: 1,
            class: "grid-item",
            onClick: handleOpenSchoolWebsite
          }, [..._cache[19] || (_cache[19] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E8EAF6" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#3949AB" }
              }, "language")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "学校官网", -1)
          ])])) : createCommentVNode("", true),
          showQuickLinks.value ? (openBlock(), createElementBlock("button", {
            key: 2,
            class: "grid-item",
            onClick: handleOpenQuickLinks
          }, [..._cache[20] || (_cache[20] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E0F7FA" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#00838F" }
              }, "link")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "快捷链接", -1)
          ])])) : createCommentVNode("", true),
          showServiceStats.value ? (openBlock(), createElementBlock("button", {
            key: 3,
            class: "grid-item",
            onClick: handleOpenServiceStats
          }, [..._cache[21] || (_cache[21] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E0F2F1" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#00796B" }
              }, "monitoring")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "服务统计", -1)
          ])])) : createCommentVNode("", true),
          showConfigTool.value ? (openBlock(), createElementBlock("button", {
            key: 4,
            class: "grid-item",
            onClick: handleOpenConfig
          }, [..._cache[22] || (_cache[22] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#FEF7E0" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#F9AB00" }
              }, "build")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "配置工具", -1)
          ])])) : createCommentVNode("", true),
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleCheckUpdate
          }, [..._cache[23] || (_cache[23] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#F3E8FD" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#9333EA" }
              }, "update")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "检查更新", -1)
          ])]),
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleFeedback
          }, [..._cache[24] || (_cache[24] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#E1F5FE" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#0288D1" }
              }, "feedback")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "意见反馈", -1)
          ])]),
          createBaseVNode("button", {
            class: "grid-item",
            onClick: handleOpenSource
          }, [..._cache[25] || (_cache[25] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#ECEFF1" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#455A64" }
              }, "code")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "开源协议", -1)
          ])]),
          showSponsorEntry.value ? (openBlock(), createElementBlock("button", {
            key: 5,
            class: "grid-item",
            onClick: _cache[2] || (_cache[2] = ($event) => showSponsorModal.value = true)
          }, [..._cache[26] || (_cache[26] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#FFF3E0" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#E65100" }
              }, "favorite")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "赞助", -1)
          ])])) : createCommentVNode("", true),
          showMoreModules.value ? (openBlock(), createElementBlock("button", {
            key: 6,
            class: "grid-item",
            onClick: handleOpenMore
          }, [..._cache[27] || (_cache[27] = [
            createBaseVNode("div", {
              class: "grid-icon-box",
              style: { "background": "#F3E5F5" }
            }, [
              createBaseVNode("span", {
                class: "material-symbols-outlined",
                style: { "color": "#7B1FA2" }
              }, "apps")
            ], -1),
            createBaseVNode("span", { class: "grid-label" }, "更多", -1)
          ])])) : createCommentVNode("", true)
        ]),
        createBaseVNode("section", _hoisted_8, [
          _cache[29] || (_cache[29] = createBaseVNode("h3", { class: "legal-title" }, "关于 Mini-HBUT", -1)),
          createBaseVNode("div", _hoisted_9, [
            createBaseVNode("p", null, toDisplayString(unref(NON_OFFICIAL_DISCLAIMER_ZH)), 1),
            createBaseVNode("p", _hoisted_10, toDisplayString(unref(NON_OFFICIAL_DISCLAIMER_EN)), 1),
            isDemoSession.value ? (openBlock(), createElementBlock("p", _hoisted_11, " 演示模式说明：当前会话使用本地虚构数据，不连接真实校园服务。可在上方重置演示数据或退出演示。 ")) : createCommentVNode("", true),
            createBaseVNode("button", {
              type: "button",
              class: "privacy-policy-entry",
              onClick: _cache[3] || (_cache[3] = ($event) => unref(openExternal)(unref(PRIVACY_POLICY_URL)))
            }, [..._cache[28] || (_cache[28] = [
              createStaticVNode('<span class="privacy-policy-entry__icon" aria-hidden="true" data-v-69f61743><span class="material-symbols-outlined" data-v-69f61743>shield</span></span><span class="privacy-policy-entry__body" data-v-69f61743><span class="privacy-policy-entry__title" data-v-69f61743>隐私政策</span><span class="privacy-policy-entry__desc" data-v-69f61743>在系统浏览器中打开完整政策</span></span><span class="privacy-policy-entry__chev material-symbols-outlined" aria-hidden="true" data-v-69f61743>open_in_new</span>', 3)
            ])])
          ])
        ]),
        createBaseVNode("section", {
          ref_key: "legalSectionRef",
          ref: legalSectionRef,
          class: "legal-card"
        }, [
          _cache[32] || (_cache[32] = createBaseVNode("h3", { class: "legal-title" }, "免责声明与隐私政策", -1)),
          createBaseVNode("div", _hoisted_12, [
            createBaseVNode("button", {
              class: normalizeClass(["legal-tab", { active: activeLegalTab.value === "disclaimer" }]),
              onClick: _cache[4] || (_cache[4] = ($event) => activeLegalTab.value = "disclaimer")
            }, " 免责声明 ", 2),
            createBaseVNode("button", {
              class: normalizeClass(["legal-tab", { active: activeLegalTab.value === "privacy" }]),
              onClick: _cache[5] || (_cache[5] = ($event) => activeLegalTab.value = "privacy")
            }, " 隐私政策 ", 2)
          ]),
          activeLegalTab.value === "disclaimer" ? (openBlock(), createElementBlock("div", _hoisted_13, [..._cache[30] || (_cache[30] = [
            createBaseVNode("p", null, "本应用为独立开发的学习与信息查询工具，非任何学校或教育机构的官方系统、官方网站或官方客户端。", -1),
            createBaseVNode("ul", null, [
              createBaseVNode("li", null, "数据来源于学校相关系统接口或公开信息，仅用于展示与查询参考。"),
              createBaseVNode("li", null, "我们会尽力保证展示信息的及时性与准确性，但不对其完整性、准确性、时效性作保证。"),
              createBaseVNode("li", null, "因网络、系统维护、第三方服务变化等导致的服务中断或信息错误，我们不承担责任。"),
              createBaseVNode("li", null, "请勿将本应用用于任何违法、违规或侵害他人权益的用途。")
            ], -1)
          ])])) : (openBlock(), createElementBlock("div", _hoisted_14, [..._cache[31] || (_cache[31] = [
            createStaticVNode("<p data-v-69f61743>我们仅收集提供服务所必需的数据，并采取合理措施保护数据安全。</p><ul data-v-69f61743><li data-v-69f61743><strong data-v-69f61743>收集内容</strong>：学号、登录会话信息、验证码参数、查询所需的临时授权信息。</li><li data-v-69f61743><strong data-v-69f61743>使用目的</strong>：用于身份验证、成绩/课表/电费等查询与展示。</li><li data-v-69f61743><strong data-v-69f61743>存储方式</strong>：本地会存储加密后的账号凭据与缓存数据；后端仅保存必要的会话与授权信息。</li><li data-v-69f61743><strong data-v-69f61743>数据共享</strong>：不会向无关第三方共享个人信息，除非获得你的明确授权或法律要求。</li><li data-v-69f61743><strong data-v-69f61743>数据保留</strong>：仅在实现功能所需期限内保留，可通过退出登录清理会话。</li></ul><p data-v-69f61743>继续使用即表示你已阅读并同意本隐私政策。</p>", 3)
          ])]))
        ], 512),
        createBaseVNode("footer", _hoisted_15, [
          createBaseVNode("button", {
            type: "button",
            class: "icp-beian-link",
            onClick: openIcpBeian
          }, toDisplayString(unref(ICP_BEIAN_TEXT)), 1)
        ]),
        showOpenSourceModal.value ? (openBlock(), createElementBlock("div", {
          key: 2,
          class: "modal-mask",
          onClick: _cache[8] || (_cache[8] = ($event) => showOpenSourceModal.value = false)
        }, [
          createBaseVNode("div", {
            class: "modal-card",
            onClick: _cache[7] || (_cache[7] = withModifiers(() => {
            }, ["stop"]))
          }, [
            _cache[35] || (_cache[35] = createBaseVNode("h3", null, [
              createBaseVNode("span", { class: "material-symbols-outlined opensource-title-icon" }, "menu_book"),
              createTextVNode(" 开源说明")
            ], -1)),
            _cache[36] || (_cache[36] = createBaseVNode("p", { class: "intro" }, "Mini-HBUT 是一个开源项目，致力于提供更好的校园信息查询体验。", -1)),
            createBaseVNode("div", { class: "section" }, [
              _cache[34] || (_cache[34] = createBaseVNode("p", { class: "label" }, "项目地址", -1)),
              createBaseVNode("a", {
                class: "github-link",
                onClick: openGithub
              }, [..._cache[33] || (_cache[33] = [
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
            _cache[37] || (_cache[37] = createStaticVNode('<div class="section" data-v-69f61743><p class="label" data-v-69f61743>开源技术</p><ul class="opensource-list" data-v-69f61743><li data-v-69f61743><span class="tag" data-v-69f61743>前端</span> Tauri / Vue 3 / Vite</li><li data-v-69f61743><span class="tag" data-v-69f61743>后端</span> Rust (reqwest / scraper / serde)</li><li data-v-69f61743><span class="tag" data-v-69f61743>感谢</span> 所有开源贡献者</li></ul></div><div class="section thanks" data-v-69f61743><p data-v-69f61743>感谢原 <strong data-v-69f61743>Mini湖工</strong> 小程序的开发者，为本项目提供了宝贵的灵感</p><p data-v-69f61743>感谢开发者的 <strong data-v-69f61743>朋友们和舍友们</strong>，提供了测试和反馈</p><p class="highlight" data-v-69f61743>感谢所有为 Mini-HBUT 做出贡献的人！ 🎉</p></div>', 2)),
            createBaseVNode("div", _hoisted_16, [
              createBaseVNode("button", {
                class: "btn-primary",
                onClick: _cache[6] || (_cache[6] = ($event) => showOpenSourceModal.value = false)
              }, "知道了")
            ])
          ])
        ])) : createCommentVNode("", true),
        showSponsorModal.value && showSponsorEntry.value ? (openBlock(), createElementBlock("div", {
          key: 3,
          class: "modal-mask",
          onClick: _cache[11] || (_cache[11] = ($event) => showSponsorModal.value = false)
        }, [
          createBaseVNode("div", {
            class: "modal-card sponsor-modal",
            onClick: _cache[10] || (_cache[10] = withModifiers(() => {
            }, ["stop"]))
          }, [
            _cache[38] || (_cache[38] = createBaseVNode("h3", null, "❤️ 赞助支持", -1)),
            _cache[39] || (_cache[39] = createBaseVNode("p", { class: "intro" }, "如果 Mini-HBUT 对你有帮助，欢迎请作者喝杯咖啡 ☕", -1)),
            createBaseVNode("div", _hoisted_17, [
              sponsorImageLoading.value ? (openBlock(), createElementBlock("div", _hoisted_18, "加载中...")) : sponsorImageUrl.value ? (openBlock(), createElementBlock("img", {
                key: 1,
                src: sponsorImageUrl.value,
                alt: "微信赞赏码",
                class: "sponsor-qr-image"
              }, null, 8, _hoisted_19)) : createCommentVNode("", true)
            ]),
            _cache[40] || (_cache[40] = createBaseVNode("p", { class: "sponsor-hint" }, "长按或截图扫码 · 微信赞赏", -1)),
            createBaseVNode("div", _hoisted_20, [
              createBaseVNode("button", {
                class: "btn-primary",
                onClick: _cache[9] || (_cache[9] = ($event) => showSponsorModal.value = false)
              }, "关闭")
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const MeView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-69f61743"]]);
export {
  MeView as default
};
