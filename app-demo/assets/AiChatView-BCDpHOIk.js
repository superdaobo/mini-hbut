import { w as watch, o as onMounted, a as ref, z as nextTick, m as onBeforeUnmount, E as resolveComponent, c as createElementBlock, b as openBlock, d as createBaseVNode, f as createCommentVNode, q as createVNode, l as withCtx, F as Fragment, i as renderList, e as computed, t as toDisplayString, n as normalizeClass, u as unref, C as withDirectives, D as vModelText, p as withKeys, j as withModifiers } from "./vue-core-DdLVj9yW.js";
import { i as initMarkdownRuntime, r as renderMarkdown } from "./markdown-BHQqcErw.js";
import { b as isTauriRuntime, i as isTestAccountSession, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import { _ as _export_sfc } from "./app-demo-CxKBY5JQ.js";
import { f as fetchEventSource } from "./online-learning-BGeH--Iq.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1 = { class: "ai-header glass-card" };
const _hoisted_2 = { class: "header-top-row" };
const _hoisted_3 = { class: "header-left-actions" };
const _hoisted_4 = { class: "model-select" };
const _hoisted_5 = ["value"];
const _hoisted_6 = { class: "stream-debug glass-card" };
const _hoisted_7 = {
  key: 0,
  class: "status-msg"
};
const _hoisted_8 = {
  key: 1,
  class: "status-msg error"
};
const _hoisted_9 = {
  key: 2,
  class: "messages"
};
const _hoisted_10 = { class: "avatar" };
const _hoisted_11 = { class: "bubble" };
const _hoisted_12 = {
  key: 0,
  class: "attachment-preview"
};
const _hoisted_13 = {
  key: 1,
  class: "thinking-window"
};
const _hoisted_14 = { class: "thinking-window-header" };
const _hoisted_15 = { class: "thinking-window-title" };
const _hoisted_16 = {
  key: 0,
  class: "thinking-window-state"
};
const _hoisted_17 = ["innerHTML"];
const _hoisted_18 = {
  key: 1,
  class: "thinking-placeholder"
};
const _hoisted_19 = {
  key: 2,
  class: "thinking-block"
};
const _hoisted_20 = ["onClick"];
const _hoisted_21 = ["innerHTML"];
const _hoisted_22 = {
  key: 3,
  class: "progress-hint"
};
const _hoisted_23 = {
  key: 4,
  class: "stream-loading"
};
const _hoisted_24 = ["innerHTML"];
const _hoisted_25 = ["textContent"];
const _hoisted_26 = {
  key: 0,
  class: "message-row assistant loading"
};
const _hoisted_27 = ["disabled"];
const _hoisted_28 = ["accept"];
const _hoisted_29 = ["disabled"];
const _hoisted_30 = ["disabled"];
const _hoisted_31 = { class: "history-header" };
const _hoisted_32 = { class: "history-list" };
const _hoisted_33 = ["onClick"];
const _hoisted_34 = { class: "history-title" };
const _hoisted_35 = { class: "history-meta" };
const _hoisted_36 = {
  key: 0,
  class: "history-preview"
};
const _hoisted_37 = ["onClick"];
const _hoisted_38 = {
  key: 2,
  class: "confirm-backdrop"
};
const _hoisted_39 = { class: "confirm-dialog glass-card" };
const _hoisted_40 = {
  key: 0,
  class: "confirm-error"
};
const _hoisted_41 = { class: "confirm-actions" };
const _hoisted_42 = ["disabled"];
const _hoisted_43 = ["disabled"];
const DEFAULT_WELCOME = "您好，我是湖工小实，很高兴与你相遇，请问有什么可以帮您?";
const AI_POST_TIMEOUT_MS = 25e3;
const AI_PROBE_TIMEOUT_MS = 3200;
const AI_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MODEL_ID_DEEPSEEK = "ep-20250207092149-pvc95";
const MODEL_ID_DOUBAO = "ep-20250219175323-5mvmg";
const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";
const _sfc_main = {
  __name: "AiChatView",
  props: {
    studentId: String,
    modelOptions: {
      type: Array,
      default: () => []
    }
  },
  emits: ["back"],
  setup(__props) {
    const props = __props;
    const AI_BRIDGE_CANDIDATES = ["http://127.0.0.1:4399", "http://localhost:4399"];
    const AI_BRIDGE_PATHS = {
      health: "/health",
      init: "/ai_init",
      upload: "/ai_upload",
      chat: "/ai_chat",
      stream: "/ai_chat_stream",
      sessionNew: "/ai_chat_session/new",
      sessionHistory: "/ai_chat_session/history",
      sessionMessages: "/ai_chat_session/messages",
      sessionDelete: "/ai_chat_session/delete"
    };
    const AI_RETRY_DELAYS_MS = [0, 220, 520];
    const hasTauriRuntime = isTauriRuntime();
    let activeBridgeIndex = 0;
    let activeBridgeBase = AI_BRIDGE_CANDIDATES[0];
    const AI_ALLOWED_FILE_EXTENSIONS = ["docx", "pdf", "txt", "md"];
    const AI_UPLOAD_ACCEPT = AI_ALLOWED_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(",");
    const AI_MIME_BY_EXT = {
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pdf: "application/pdf",
      txt: "text/plain",
      md: "text/markdown"
    };
    const buildTestAccountAiReply = (question = "") => {
      const prompt = String(question || "").trim();
      return [
        "演示账号不会调用外部 AI 服务。",
        prompt ? `你刚才的问题是：${prompt}` : "你可以继续输入问题查看本地演示回复。",
        "TestFlight 审核环境下，此模块只展示界面与历史记录交互。"
      ].join("\n\n");
    };
    const defaultModelOptions = [
      { label: "Qwen-Plus", value: "qwen-plus" },
      { label: "Qwen-Max", value: "qwen-max" },
      { label: "DeepSeek-R1", value: "ep-20250207092149-pvc95" },
      { label: "Doubao1.5-Pro", value: "ep-20250219175323-5mvmg" }
    ];
    const MODEL_ALIAS_MAP = {
      "qwen-max": ["qwen-max", "Qwen-Max", "qwen_max"],
      "qwen-plus": ["qwen-plus", "Qwen-Plus", "qwen_plus"],
      "deepseek-r1": [
        "deepseek-r1",
        "DeepSeek-R1",
        "deepseek_r1",
        "deepseek-r1-250120",
        "deepseek-r1-thinking",
        MODEL_ID_DEEPSEEK
      ],
      "doubao-1.5-pro": ["doubao-1.5-pro", "doubao1.5-pro", "Doubao1.5-Pro", MODEL_ID_DOUBAO],
      [MODEL_ID_DEEPSEEK]: [MODEL_ID_DEEPSEEK, "deepseek-r1", "DeepSeek-R1"],
      [MODEL_ID_DOUBAO]: [MODEL_ID_DOUBAO, "doubao-1.5-pro", "doubao1.5-pro", "Doubao1.5-Pro"]
    };
    const MODEL_DISPLAY_MAP = {
      "qwen-plus": "Qwen-Plus",
      "qwen-max": "Qwen-Max",
      [MODEL_ID_DEEPSEEK]: "DeepSeek-R1",
      "deepseek-r1": "DeepSeek-R1",
      [MODEL_ID_DOUBAO]: "Doubao1.5-Pro",
      "doubao-1.5-pro": "Doubao1.5-Pro"
    };
    const token = ref("");
    const bladeAuth = ref("");
    const dynamicModelOptions = ref([]);
    const initStatus = ref("loading");
    const initError = ref("");
    const selectedModel = ref("qwen-max");
    const historyOpen = ref(false);
    const sessions = ref([]);
    const activeSessionId = ref("");
    const messages = ref([]);
    const deleteConfirmVisible = ref(false);
    const deleteConfirmLoading = ref(false);
    const deleteConfirmError = ref("");
    const pendingDeleteSessionId = ref("");
    const input = ref("");
    const isLoading = ref(false);
    const attachment = ref(null);
    const fileInput = ref(null);
    const chatContainer = ref(null);
    const rootEl = ref(null);
    const inputBarEl = ref(null);
    const attachmentBarEl = ref(null);
    const autoScrollEnabled = ref(true);
    const skipInitialScroll = ref(true);
    const streamStats = ref({
      active: false,
      raw: 0,
      delta: 0,
      progress: 0,
      fallback: false,
      lastEvent: "-"
    });
    const resetStreamStats = () => {
      streamStats.value = {
        active: false,
        raw: 0,
        delta: 0,
        progress: 0,
        fallback: false,
        lastEvent: "-"
      };
    };
    let resizeObserver = null;
    let viewportResizeHandler = null;
    let windowResizeHandler = null;
    const setRootCssVar = (name, value) => {
      if (!rootEl.value) return;
      rootEl.value.style.setProperty(name, value);
    };
    const updateLayoutMetrics = () => {
      const inputHeight = Math.max(64, Math.ceil(inputBarEl.value?.offsetHeight || 72));
      const attachmentHeight = Math.ceil(attachmentBarEl.value?.offsetHeight || 0);
      setRootCssVar("--ai-input-height", `${inputHeight}px`);
      setRootCssVar("--ai-attachment-height", `${attachmentHeight}px`);
    };
    const updateKeyboardOffset = () => {
      if (typeof window === "undefined") return;
      const vv = window.visualViewport;
      if (!vv) {
        setRootCssVar("--ai-keyboard-offset", "0px");
        return;
      }
      const offset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setRootCssVar("--ai-keyboard-offset", `${offset}px`);
    };
    const handleInputFocus = () => {
      nextTick(() => {
        updateKeyboardOffset();
        updateLayoutMetrics();
        queueAutoScroll();
      });
    };
    const handleInputBlur = () => {
      window.setTimeout(() => {
        updateKeyboardOffset();
        updateLayoutMetrics();
      }, 80);
    };
    const AI_DEBUG = (() => {
      try {
        return localStorage.getItem("hbu_ai_debug") === "1";
      } catch {
        return false;
      }
    })();
    const normalizedModelOptions = computed(() => {
      const mergeLists = (...lists) => {
        const out = [];
        const seen = /* @__PURE__ */ new Set();
        for (const list of lists) {
          for (const item of list) {
            const key = normalizeModelValue(item.value);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(item);
          }
        }
        return out;
      };
      const normalizeList = (list) => {
        const safe = Array.isArray(list) ? list : [];
        return safe.map((item) => {
          const value = String(item?.value || "").trim();
          if (!value) return null;
          const key = normalizeModelValue(value);
          const label = String(item?.label || MODEL_DISPLAY_MAP[key] || value).trim();
          return { label, value };
        }).filter(Boolean);
      };
      const defaults = normalizeList(defaultModelOptions);
      const fromProps = normalizeList(props.modelOptions);
      const fromDynamic = normalizeList(dynamicModelOptions.value);
      if (Array.isArray(dynamicModelOptions.value) && dynamicModelOptions.value.length) {
        return mergeLists(fromDynamic, fromProps, defaults);
      }
      if (Array.isArray(props.modelOptions) && props.modelOptions.length) {
        return mergeLists(fromProps, defaults);
      }
      return defaults;
    });
    const historyKey = computed(() => `hbu_ai_history_v2_${props.studentId || "guest"}`);
    const normalizeModelValue = (value) => String(value || "").trim().toLowerCase();
    const normalizeModelToken = (value) => normalizeModelValue(value).replace(/[^a-z0-9]+/g, "");
    const detectModelFamily = (value, label = "") => {
      const full = `${normalizeModelValue(value)} ${normalizeModelValue(label)}`;
      const token2 = normalizeModelToken(`${value || ""}${label || ""}`);
      if (full.includes("deepseek") || token2.includes("deepseek") || full.includes(MODEL_ID_DEEPSEEK.toLowerCase())) {
        return "deepseek";
      }
      if (full.includes("doubao") || full.includes("豆包") || token2.includes("doubao") || full.includes(MODEL_ID_DOUBAO.toLowerCase())) {
        return "doubao";
      }
      if (full.includes("qwen") || token2.includes("qwen")) {
        if (full.includes("max") || token2.includes("max")) return "qwen-max";
        if (full.includes("plus") || token2.includes("plus")) return "qwen-plus";
      }
      return "";
    };
    const isDeepSeekModel = (value) => {
      return detectModelFamily(value) === "deepseek";
    };
    const modelDisplayName = (value) => {
      const normalized = normalizeModelValue(value);
      return MODEL_DISPLAY_MAP[normalized] || String(value || "").trim() || "未知模型";
    };
    const availableModelSet = computed(() => {
      const set = /* @__PURE__ */ new Set();
      for (const option of normalizedModelOptions.value || []) {
        const val = normalizeModelValue(option?.value);
        if (val) set.add(val);
      }
      return set;
    });
    const detectRenderMode = (role, content = "") => {
      if (role !== "assistant") return "plain";
      const text = String(content || "").trim();
      if (!text) return "plain";
      return "markdown";
    };
    const normalizeMessage = (msg = {}) => {
      const role = msg?.role === "user" ? "user" : "assistant";
      const content = sanitizeStreamText(String(msg?.content || ""));
      const modelUsed = String(msg?.modelUsed || "");
      const runtimeStreaming = Boolean(msg?.runtimeStreaming);
      return {
        ...msg,
        id: msg?.id || `msg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        role,
        content,
        thinking: sanitizeStreamText(String(msg?.thinking || "")),
        showThinking: Boolean(msg?.showThinking),
        runtimeStreaming,
        isStreaming: runtimeStreaming && Boolean(msg?.isStreaming),
        progress: runtimeStreaming ? String(msg?.progress || "") : "",
        modelUsed,
        thinkStreamMode: Boolean(msg?.thinkStreamMode),
        streamCarry: String(msg?.streamCarry || ""),
        createdAt: Number(msg?.createdAt || Date.now()),
        renderMode: msg?.renderMode || detectRenderMode(role, content)
      };
    };
    const makeMessage = (role, content = "", extra = {}) => normalizeMessage({
      role,
      content,
      thinking: "",
      showThinking: false,
      isStreaming: false,
      progress: "",
      createdAt: Date.now(),
      renderMode: detectRenderMode(role, content),
      ...extra
    });
    const makeSession = ({
      id,
      remoteSessionId = "",
      title = "新对话",
      preview = "",
      updatedAt = Date.now(),
      messages: seedMessages,
      loaded = false
    } = {}) => ({
      id: id || `local_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      remoteSessionId,
      title,
      preview,
      updatedAt,
      loaded,
      messages: Array.isArray(seedMessages) && seedMessages.length ? seedMessages.map((item) => normalizeMessage(item)) : [makeMessage("assistant", DEFAULT_WELCOME)]
    });
    const findSession = (id) => sessions.value.find((item) => item.id === id);
    const ensureModelSelection = () => {
      const list = normalizedModelOptions.value;
      if (!Array.isArray(list) || !list.length) return;
      if (!list.some((m) => m?.value === selectedModel.value)) {
        selectedModel.value = list[0].value;
      }
    };
    const buildModelCandidates = (selected) => {
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      const push = (value) => {
        const raw = String(value || "").trim();
        if (!raw) return;
        const key = raw.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(raw);
      };
      const normalized = normalizeModelValue(selected);
      const selectedOption = (normalizedModelOptions.value || []).find((item) => normalizeModelValue(item?.value) === normalized);
      const selectedLabel = String(selectedOption?.label || "");
      const family = detectModelFamily(selected, selectedLabel);
      push(selected);
      if (selectedLabel) push(selectedLabel);
      for (const alias of MODEL_ALIAS_MAP[normalized] || []) {
        push(alias);
      }
      if (family === "deepseek") {
        for (const alias of MODEL_ALIAS_MAP["deepseek-r1"] || []) push(alias);
        push(MODEL_ID_DEEPSEEK);
      } else if (family === "doubao") {
        for (const alias of MODEL_ALIAS_MAP["doubao-1.5-pro"] || []) push(alias);
        push(MODEL_ID_DOUBAO);
      } else if (family === "qwen-plus") {
        for (const alias of MODEL_ALIAS_MAP["qwen-plus"] || []) push(alias);
      } else if (family === "qwen-max") {
        for (const alias of MODEL_ALIAS_MAP["qwen-max"] || []) push(alias);
      }
      for (const option of normalizedModelOptions.value || []) {
        const value = String(option?.value || "").trim();
        const label = String(option?.label || "").trim();
        const optionFamily = detectModelFamily(value, label);
        if (!family || optionFamily === family) {
          push(value);
          if (label) push(label);
        }
      }
      push("qwen-max");
      push("qwen-plus");
      return out;
    };
    const isIllegalModelError = (err) => {
      const text = String(err || "").toLowerCase();
      return text.includes("模型名非法") || text.includes("illegal model") || text.includes("model非法") || text.includes("模型") && text.includes("非法");
    };
    const unwrapApiData = (resp) => {
      if (!resp || typeof resp !== "object") return null;
      if ("data" in resp) return resp.data;
      return resp;
    };
    const sleep = (ms = 0) => new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
    const isNetworkFetchError = (error) => {
      const text = String(error || "").toLowerCase();
      return text.includes("failed to fetch") || text.includes("network") || text.includes("abort") || text.includes("timeout") || text.includes("load failed") || text.includes("connection");
    };
    const buildBridgeUrl = (path, base = activeBridgeBase) => {
      const cleanPath = String(path || "").trim();
      if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) return cleanPath;
      if (!cleanPath.startsWith("/")) return `${base}/${cleanPath}`;
      return `${base}${cleanPath}`;
    };
    const rotateBridgeCandidate = () => {
      activeBridgeIndex = (activeBridgeIndex + 1) % AI_BRIDGE_CANDIDATES.length;
      activeBridgeBase = AI_BRIDGE_CANDIDATES[activeBridgeIndex];
      return activeBridgeBase;
    };
    const probeBridge = async (base) => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), AI_PROBE_TIMEOUT_MS);
      try {
        const res = await fetch(buildBridgeUrl(AI_BRIDGE_PATHS.health, base), {
          method: "GET",
          signal: controller.signal
        });
        if (!res.ok) {
          throw new Error(`health ${res.status}`);
        }
        return true;
      } finally {
        window.clearTimeout(timeoutId);
      }
    };
    const ensureBridgeAvailable = async (forceProbe = false) => {
      const candidateOrder = [];
      for (let i = 0; i < AI_BRIDGE_CANDIDATES.length; i += 1) {
        const idx = (activeBridgeIndex + i) % AI_BRIDGE_CANDIDATES.length;
        candidateOrder.push({ idx, base: AI_BRIDGE_CANDIDATES[idx] });
      }
      if (!forceProbe && candidateOrder.length) {
        return candidateOrder[0].base;
      }
      let lastError = null;
      for (const item of candidateOrder) {
        try {
          await probeBridge(item.base);
          activeBridgeIndex = item.idx;
          activeBridgeBase = item.base;
          return item.base;
        } catch (error) {
          lastError = error;
        }
      }
      throw new Error(`本地 AI 服务不可用：${String(lastError || "bridge unavailable")}`);
    };
    const parsePostResponse = async (res) => {
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(text || `请求失败(${res.status})`);
      }
      const extractErrorMessage = (payload) => {
        if (!payload || typeof payload !== "object") return "";
        return String(
          payload?.error?.message || payload?.error_description || payload?.message || payload?.msg || ""
        ).trim();
      };
      const errorMessage = extractErrorMessage(json);
      if (!res.ok) {
        throw new Error(errorMessage || `请求失败(${res.status})`);
      }
      if (json?.success === false) {
        throw new Error(errorMessage || "请求失败");
      }
      return json;
    };
    const postJson = async (path, body, options = {}) => {
      if (isTestAccountSession()) {
        return {
          success: false,
          demo_disabled: true,
          error: "演示账号不会调用外部 AI 服务"
        };
      }
      const retries = Number.isFinite(options?.retries) ? Math.max(0, Number(options.retries)) : 2;
      const skipProbe = options?.skipProbe === true;
      let lastError = null;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const delay = AI_RETRY_DELAYS_MS[Math.min(attempt, AI_RETRY_DELAYS_MS.length - 1)] || 0;
        if (delay > 0) {
          await sleep(delay);
        }
        try {
          await ensureBridgeAvailable(!skipProbe || attempt > 0);
          const controller = new AbortController();
          const timeoutId = window.setTimeout(() => controller.abort(), AI_POST_TIMEOUT_MS);
          const res = await fetch(buildBridgeUrl(path), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal
          }).finally(() => {
            window.clearTimeout(timeoutId);
          });
          return await parsePostResponse(res);
        } catch (error) {
          lastError = error;
          if (!isNetworkFetchError(error) || attempt >= retries) {
            throw error;
          }
          rotateBridgeCandidate();
        }
      }
      throw lastError || new Error("请求失败");
    };
    const invokeAiCommand = async (command, camelArgs = void 0, snakeArgs = void 0) => {
      try {
        return await invokeNative(command, camelArgs);
      } catch (firstError) {
        if (!snakeArgs || String(firstError || "").toLowerCase().includes("unknown field") === false) {
          throw firstError;
        }
        return invokeNative(command, snakeArgs);
      }
    };
    const tryInvokeAiInit = async () => {
      if (!hasTauriRuntime) return null;
      const payload = await invokeAiCommand("hbut_ai_init");
      return payload;
    };
    const tryInvokeAiChat = async (payload) => {
      if (!hasTauriRuntime) return "";
      const camelArgs = {
        token: payload.token,
        bladeAuth: payload.bladeAuth,
        question: payload.question,
        uploadUrl: payload.user_attachment || "",
        model: payload.model,
        sessionId: payload.session_id || ""
      };
      const snakeArgs = {
        token: payload.token,
        blade_auth: payload.bladeAuth,
        question: payload.question,
        upload_url: payload.user_attachment || "",
        model: payload.model,
        session_id: payload.session_id || ""
      };
      const data = await invokeAiCommand("hbut_ai_chat", camelArgs, snakeArgs);
      return parseAiResponseText(data);
    };
    const tryInvokeAiUpload = async (payload) => {
      if (!hasTauriRuntime) return null;
      const camelArgs = {
        token: payload.token,
        bladeAuth: payload.bladeAuth,
        fileContent: "",
        fileName: payload.fileName,
        fileBase64: payload.fileBase64,
        fileMime: payload.fileMime
      };
      const snakeArgs = {
        token: payload.token,
        blade_auth: payload.bladeAuth,
        file_content: "",
        file_name: payload.fileName,
        file_base64: payload.fileBase64,
        file_mime: payload.fileMime
      };
      return invokeAiCommand("hbut_ai_upload", camelArgs, snakeArgs);
    };
    const applyInitPayload = (payload) => {
      const data = unwrapApiData(payload);
      token.value = data?.token || "";
      bladeAuth.value = data?.blade_auth || data?.bladeAuth || "";
      if (!token.value || !bladeAuth.value) {
        throw new Error("AI 凭证缺失");
      }
      if (Array.isArray(data?.models) && data.models.length) {
        dynamicModelOptions.value = data.models;
      }
      ensureModelSelection();
    };
    const requestStreamOnce = async (payload, hooks) => {
      await ensureBridgeAvailable(true);
      const streamUrl = buildBridgeUrl(AI_BRIDGE_PATHS.stream);
      return fetchEventSource(streamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        ...hooks
      });
    };
    const saveLocalHistory = () => {
      try {
        const active = findSession(activeSessionId.value);
        if (active) {
          active.messages = messages.value.slice(-200);
          active.updatedAt = Date.now();
          const firstUser = active.messages.find((m) => m.role === "user" && m.content?.trim());
          if (firstUser) active.title = firstUser.content.trim().slice(0, 20);
          const latest = [...active.messages].reverse().find((m) => m.content?.trim());
          active.preview = latest?.content?.slice(0, 120) || active.preview;
        }
        localStorage.setItem(historyKey.value, JSON.stringify({
          activeSessionId: activeSessionId.value,
          sessions: sessions.value.slice(0, 80)
        }));
      } catch {
      }
    };
    const loadLocalHistory = () => {
      let parsed = null;
      try {
        parsed = JSON.parse(localStorage.getItem(historyKey.value) || "null");
      } catch {
        parsed = null;
      }
      if (parsed && Array.isArray(parsed.sessions) && parsed.sessions.length) {
        sessions.value = parsed.sessions.map((item) => makeSession(item));
        activeSessionId.value = parsed.activeSessionId || sessions.value[0].id;
        const active = findSession(activeSessionId.value) || sessions.value[0];
        activeSessionId.value = active.id;
        messages.value = active.messages || [makeMessage("assistant", DEFAULT_WELCOME)];
        return;
      }
      const session = makeSession();
      sessions.value = [session];
      activeSessionId.value = session.id;
      messages.value = session.messages;
    };
    const syncMessagesToActiveSession = () => {
      const active = findSession(activeSessionId.value);
      if (!active) return;
      active.messages = messages.value;
      active.updatedAt = Date.now();
    };
    const handleChatScroll = () => {
      const el = chatContainer.value;
      if (!el) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      autoScrollEnabled.value = distance < 48;
    };
    const scrollToBottom = () => {
      const el = chatContainer.value;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    };
    const forceScrollToBottom = () => {
      autoScrollEnabled.value = true;
      nextTick(() => {
        scrollToBottom();
        window.requestAnimationFrame(() => {
          scrollToBottom();
        });
      });
    };
    const snapToLatest = () => {
      skipInitialScroll.value = false;
      forceScrollToBottom();
    };
    const syncAutoScroll = () => {
      nextTick(() => {
        if (!chatContainer.value) return;
        if (skipInitialScroll.value) {
          skipInitialScroll.value = false;
          scrollToBottom();
          window.requestAnimationFrame(() => {
            scrollToBottom();
          });
          return;
        }
        if (autoScrollEnabled.value) {
          scrollToBottom();
        }
      });
    };
    let autoScrollFrame = 0;
    const queueAutoScroll = () => {
      if (!autoScrollEnabled.value) return;
      if (autoScrollFrame) return;
      autoScrollFrame = window.requestAnimationFrame(() => {
        autoScrollFrame = 0;
        scrollToBottom();
      });
    };
    const handleInputTyping = () => {
      forceScrollToBottom();
    };
    const initViewportHooks = () => {
      updateLayoutMetrics();
      updateKeyboardOffset();
      windowResizeHandler = () => {
        updateKeyboardOffset();
        updateLayoutMetrics();
      };
      if (typeof window !== "undefined") {
        window.addEventListener("resize", windowResizeHandler);
      }
      if (typeof window !== "undefined" && window.visualViewport) {
        viewportResizeHandler = () => {
          updateKeyboardOffset();
          updateLayoutMetrics();
        };
        window.visualViewport.addEventListener("resize", viewportResizeHandler);
        window.visualViewport.addEventListener("scroll", viewportResizeHandler);
      }
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          updateLayoutMetrics();
          updateKeyboardOffset();
        });
        if (rootEl.value) resizeObserver.observe(rootEl.value);
        if (inputBarEl.value) resizeObserver.observe(inputBarEl.value);
        if (attachmentBarEl.value) resizeObserver.observe(attachmentBarEl.value);
      }
    };
    const disposeViewportHooks = () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (typeof window !== "undefined" && window.visualViewport && viewportResizeHandler) {
        window.visualViewport.removeEventListener("resize", viewportResizeHandler);
        window.visualViewport.removeEventListener("scroll", viewportResizeHandler);
      }
      if (typeof window !== "undefined" && windowResizeHandler) {
        window.removeEventListener("resize", windowResizeHandler);
      }
      viewportResizeHandler = null;
      windowResizeHandler = null;
    };
    const formatSessionTime = (ts) => new Date(ts || Date.now()).toLocaleString();
    const parseAiResponseText = (value) => {
      if (value == null) return "";
      if (typeof value === "string") return value;
      if (typeof value === "object") {
        return value.content || value.text || value.answer || "";
      }
      return String(value);
    };
    const extractFileExtension = (fileName = "") => {
      const normalized = String(fileName || "").trim().toLowerCase();
      if (!normalized) return "";
      const idx = normalized.lastIndexOf(".");
      if (idx < 0 || idx === normalized.length - 1) return "";
      return normalized.slice(idx + 1);
    };
    const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || "");
        const commaIndex = raw.indexOf(",");
        resolve(commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw);
      };
      reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
      reader.readAsDataURL(file);
    });
    const NOISE_MESSAGES = ["操作成功", "请求完成", "success"];
    const isLikelyHexNoise = (value) => {
      const compact = String(value || "").replace(/\s+/g, "");
      if (compact.length < 128) return false;
      const hexChars = compact.replace(/[^0-9a-f]/gi, "").length;
      return hexChars / compact.length > 0.97;
    };
    const stripHexNoiseRuns = (value) => {
      const text = String(value || "");
      if (!text) return "";
      return text.replace(/[0-9a-fA-F]{80,}/g, (run) => isLikelyHexNoise(run) ? "" : run);
    };
    const isNoiseMessage = (value) => {
      const text = String(value || "").trim().toLowerCase();
      if (!text) return true;
      if (NOISE_MESSAGES.includes(text)) return true;
      if (isLikelyHexNoise(text)) return true;
      return text.startsWith("正在读取文件") || text.startsWith("正在阅读文件");
    };
    const isAiUnauthorizedText = (value) => {
      const text = String(value || "").trim().toLowerCase();
      if (!text) return false;
      return text.includes("请求未授权") || text.includes("unauthorized") || text.includes("401");
    };
    const stripCitationMarkers = (value) => {
      const text = String(value || "");
      if (/^\s*!![\s\u00A0]*\d+[\s\u00A0]*!!\s*$/.test(text)) return text;
      return text.replace(/!![\s\u00A0]*\d+[\s\u00A0]*!!/g, "");
    };
    const sanitizeStreamText = (value) => {
      const stripped = stripHexNoiseRuns(String(value || ""));
      const noCitation = stripCitationMarkers(stripped);
      return noCitation.replace(/\u0000/g, "");
    };
    const normalizeMathText = (text) => {
      if (!text || typeof text !== "string") return "";
      return text.replace(/\$\s+([^$\n]+?)\s+\$/g, (_m, inner) => `$${String(inner).trim()}$`).replace(/\\\s+frac/g, "\\frac").replace(/\\\s+sum/g, "\\sum");
    };
    const compactDisplayText = (text) => {
      return sanitizeStreamText(String(text || "")).replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "").trimStart();
    };
    const normalizeStreamIncrement = (currentText, incomingText) => {
      const current = String(currentText || "");
      const incoming = String(incomingText || "");
      if (!incoming) return "";
      if (!current) return incoming;
      if (incoming === current) return "";
      if (incoming.startsWith(current)) {
        return incoming.slice(current.length);
      }
      if (current.endsWith(incoming)) return "";
      const maxOverlap = Math.min(current.length, incoming.length);
      for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
        if (current.slice(-overlap) === incoming.slice(0, overlap)) {
          return incoming.slice(overlap);
        }
      }
      return incoming;
    };
    const renderMessage = (msg) => {
      if (!msg?.content) return "";
      const normalized = compactDisplayText(normalizeMathText(msg.content));
      return renderMarkdown(normalized);
    };
    const initAiSession = async () => {
      initStatus.value = "loading";
      initError.value = "";
      if (isTestAccountSession()) {
        token.value = "test-account-token";
        bladeAuth.value = "test-account-blade-auth";
        dynamicModelOptions.value = defaultModelOptions;
        initStatus.value = "success";
        initError.value = "";
        return;
      }
      try {
        const resp = await postJson(AI_BRIDGE_PATHS.init, {});
        applyInitPayload(resp);
        initStatus.value = "success";
      } catch (error) {
        if (AI_DEBUG) {
          console.debug("[AI] bridge 初始化失败，尝试 invoke 兜底:", error);
        }
        try {
          const payload = await tryInvokeAiInit();
          if (!payload) {
            throw error;
          }
          applyInitPayload(payload);
          initStatus.value = "success";
          initError.value = "";
          return;
        } catch (invokeError) {
          initStatus.value = "error";
          initError.value = String(invokeError || error);
        }
      }
    };
    const ensureInitReady = async () => {
      if (initStatus.value === "success" && token.value && bladeAuth.value) return;
      await initAiSession();
      if (initStatus.value !== "success" || !token.value || !bladeAuth.value) {
        throw new Error(initError.value || "AI 初始化失败");
      }
    };
    const createRemoteSession = async () => {
      if (isTestAccountSession()) return "";
      await ensureInitReady();
      const resp = await postJson(AI_BRIDGE_PATHS.sessionNew, {
        token: token.value,
        blade_auth: bladeAuth.value
      });
      const data = unwrapApiData(resp);
      const sessionId = data?.session_id || resp?.session_id;
      if (!sessionId) {
        throw new Error("远端未返回 session_id");
      }
      return sessionId;
    };
    const loadSessionMessagesFromRemote = async (session, force = false) => {
      if (!session?.remoteSessionId) return;
      if (session.loaded && !force) return;
      await ensureInitReady();
      try {
        const resp = await postJson(AI_BRIDGE_PATHS.sessionMessages, {
          token: token.value,
          blade_auth: bladeAuth.value,
          session_id: session.remoteSessionId
        });
        const data = unwrapApiData(resp);
        const list = data?.messages || [];
        if (Array.isArray(list) && list.length) {
          session.messages = list.map((item) => makeMessage(
            item.role === "user" ? "user" : "assistant",
            item.content || "",
            {
              createdAt: Number(item.timestamp || Date.now())
            }
          ));
          session.loaded = true;
          const latest = [...session.messages].reverse().find((m) => m.content?.trim());
          if (latest) {
            session.preview = latest.content.slice(0, 120);
          }
        }
        if (session.id === activeSessionId.value) {
          messages.value = session.messages;
          snapToLatest();
        }
        saveLocalHistory();
      } catch (error) {
        if (AI_DEBUG) {
          console.debug("[AI] 加载会话消息失败:", error);
        }
      }
    };
    const syncRemoteHistory = async () => {
      if (isTestAccountSession()) return;
      await ensureInitReady();
      const resp = await postJson(AI_BRIDGE_PATHS.sessionHistory, {
        token: token.value,
        blade_auth: bladeAuth.value,
        current: 1,
        size: 50
      });
      const data = unwrapApiData(resp);
      const remoteSessions = Array.isArray(data?.sessions) ? data.sessions : [];
      const localOnly = sessions.value.filter((item) => !item.remoteSessionId);
      const merged = remoteSessions.map((remoteItem) => {
        const existing = sessions.value.find((s) => s.remoteSessionId === remoteItem.session_id);
        return makeSession({
          id: existing?.id || `remote_${remoteItem.session_id}`,
          remoteSessionId: remoteItem.session_id,
          title: remoteItem.title || existing?.title || "新对话",
          preview: remoteItem.preview || existing?.preview || "",
          updatedAt: Number(remoteItem.updated_at || existing?.updatedAt || Date.now()),
          messages: existing?.messages,
          loaded: existing?.loaded || false
        });
      });
      sessions.value = [...merged, ...localOnly].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 80);
      if (!sessions.value.length) {
        const remoteSessionId = await createRemoteSession().catch(() => "");
        sessions.value = [makeSession({ remoteSessionId })];
      }
      const stillActive = findSession(activeSessionId.value);
      if (!stillActive) {
        activeSessionId.value = sessions.value[0].id;
      }
      const active = findSession(activeSessionId.value) || sessions.value[0];
      activeSessionId.value = active.id;
      messages.value = active.messages;
      snapToLatest();
      saveLocalHistory();
      await loadSessionMessagesFromRemote(active, false);
    };
    const selectSession = async (id) => {
      const target = findSession(id);
      if (!target) return;
      activeSessionId.value = target.id;
      messages.value = target.messages || [makeMessage("assistant", DEFAULT_WELCOME)];
      snapToLatest();
      historyOpen.value = false;
      saveLocalHistory();
      await loadSessionMessagesFromRemote(target, false);
    };
    const startNewSession = async () => {
      let remoteSessionId = "";
      try {
        remoteSessionId = await createRemoteSession();
      } catch {
      }
      const session = makeSession({ remoteSessionId, messages: [makeMessage("assistant", DEFAULT_WELCOME)] });
      sessions.value.unshift(session);
      activeSessionId.value = session.id;
      messages.value = session.messages;
      snapToLatest();
      historyOpen.value = false;
      saveLocalHistory();
    };
    const requestDeleteSession = (sessionId) => {
      pendingDeleteSessionId.value = sessionId;
      deleteConfirmVisible.value = true;
      deleteConfirmLoading.value = false;
      deleteConfirmError.value = "";
    };
    const cancelDeleteSession = () => {
      if (deleteConfirmLoading.value) return;
      deleteConfirmVisible.value = false;
      deleteConfirmError.value = "";
      pendingDeleteSessionId.value = "";
    };
    const deleteSessionConfirmed = async () => {
      const sessionId = pendingDeleteSessionId.value;
      const idx = sessions.value.findIndex((item) => item.id === sessionId);
      if (idx < 0) {
        deleteConfirmVisible.value = false;
        pendingDeleteSessionId.value = "";
        return;
      }
      deleteConfirmLoading.value = true;
      deleteConfirmError.value = "";
      const target = sessions.value[idx];
      try {
        if (target.remoteSessionId) {
          await ensureInitReady();
          await postJson(AI_BRIDGE_PATHS.sessionDelete, {
            token: token.value,
            blade_auth: bladeAuth.value,
            session_id: target.remoteSessionId
          });
        }
      } catch (error) {
        deleteConfirmError.value = `远端删除失败：${String(error)}`;
        deleteConfirmLoading.value = false;
        return;
      }
      const wasActive = sessions.value[idx].id === activeSessionId.value;
      sessions.value.splice(idx, 1);
      if (!sessions.value.length) {
        sessions.value = [makeSession()];
      }
      if (wasActive) {
        activeSessionId.value = sessions.value[0].id;
        messages.value = sessions.value[0].messages;
        snapToLatest();
      }
      saveLocalHistory();
      deleteConfirmLoading.value = false;
      deleteConfirmVisible.value = false;
      pendingDeleteSessionId.value = "";
    };
    const parseStreamEventObject = (obj) => {
      if (!obj || typeof obj !== "object") return null;
      if (obj?.event) {
        const eventName = String(obj.event);
        if (eventName === "delta") {
          const delta = sanitizeStreamText(String(
            obj.delta ?? obj.content ?? obj.text ?? (typeof obj.data === "string" ? obj.data : "")
          ));
          if (!delta || isNoiseMessage(delta) || isLikelyHexNoise(delta)) return null;
          return { event: "delta", delta };
        }
        if (eventName === "thinking") {
          const delta = sanitizeStreamText(String(obj.delta ?? obj.thinking ?? obj.content ?? ""));
          if (!delta || isNoiseMessage(delta) || isLikelyHexNoise(delta)) return null;
          return { event: "thinking", delta };
        }
        if (eventName === "progress") {
          const message = sanitizeStreamText(String(obj.message ?? obj.msg ?? obj.content ?? ""));
          if (!message || isNoiseMessage(message)) return null;
          return { event: "progress", message };
        }
        if (eventName === "session") {
          return { event: "session", session_id: obj.session_id ?? obj.sessionId ?? "" };
        }
        if (eventName === "done" || eventName === "error") {
          return obj;
        }
        const fallback2 = sanitizeStreamText(parseAiResponseText(obj));
        if (fallback2?.trim() && !isNoiseMessage(fallback2)) return { event: "delta", delta: fallback2 };
        return null;
      }
      const type = Number(obj?.type);
      if (type === 1) {
        const content = sanitizeStreamText(typeof obj?.content === "string" ? obj.content : "");
        const thinking = sanitizeStreamText(typeof obj?.thinking === "string" ? obj.thinking : "");
        if (content && !isNoiseMessage(content)) return { event: "delta", delta: content };
        if (thinking && !isNoiseMessage(thinking)) return { event: "thinking", delta: thinking };
        return null;
      }
      if (type === 4 || type === 12) {
        const content = sanitizeStreamText(typeof obj?.content === "string" ? obj.content : "");
        if (!content || isNoiseMessage(content) || isLikelyHexNoise(content)) return null;
        return { event: "delta", delta: content };
      }
      if (type === 13 || type === 14 || type === 23) return null;
      if (type === -1) {
        const content = sanitizeStreamText(typeof obj?.content === "string" ? obj.content : "");
        if (!content || isNoiseMessage(content) || isLikelyHexNoise(content)) return null;
        return { event: "replace", content };
      }
      if (type === 11) {
        const thinking = sanitizeStreamText(typeof obj?.thinking === "string" ? obj.thinking : "");
        if (thinking && !isNoiseMessage(thinking) && !isLikelyHexNoise(thinking)) return { event: "thinking", delta: thinking };
        return null;
      }
      if (type === 24) {
        const msg = sanitizeStreamText(obj?.message || obj?.msg || obj?.processInfo?.content || "");
        if (isNoiseMessage(msg)) return null;
        return { event: "progress", message: msg };
      }
      if (Number(obj?.finish) === 1) return { event: "done" };
      const fallback = sanitizeStreamText(parseAiResponseText(obj));
      if (fallback?.trim() && !isNoiseMessage(fallback) && !isLikelyHexNoise(fallback)) return { event: "delta", delta: fallback };
      return null;
    };
    const parseStreamEvents = (raw) => {
      if (!raw || typeof raw !== "string") return [];
      const rows = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (!rows.length) return [];
      const out = [];
      for (const row of rows) {
        const line = row.startsWith("data:") ? row.slice(5).trim() : row;
        if (!line || line === "keep-alive" || line.startsWith("event:") || line.startsWith(":")) continue;
        if (line === "[DONE]") {
          out.push({ event: "done" });
          continue;
        }
        try {
          const obj = JSON.parse(line);
          const parsed = parseStreamEventObject(obj);
          if (parsed) out.push(parsed);
          continue;
        } catch {
          const cleaned = sanitizeStreamText(line);
          if (!isNoiseMessage(cleaned) && !isLikelyHexNoise(cleaned)) {
            out.push({ event: "delta", delta: cleaned });
          }
        }
      }
      return out;
    };
    const extractThinkCarryLength = (text) => {
      const source = String(text || "").toLowerCase();
      if (!source) return 0;
      let best = 0;
      for (const token2 of [THINK_OPEN_TAG, THINK_CLOSE_TAG]) {
        const maxLen = Math.min(token2.length - 1, source.length);
        for (let len = maxLen; len >= 1; len -= 1) {
          if (token2.startsWith(source.slice(source.length - len))) {
            best = Math.max(best, len);
            break;
          }
        }
      }
      return best;
    };
    const appendDeepSeekChunk = (assistantMsg, rawChunk, appendContent) => {
      const chunk = sanitizeStreamText(String(rawChunk || ""));
      if (!chunk && !assistantMsg.streamCarry) return;
      let text = `${assistantMsg.streamCarry || ""}${chunk}`;
      assistantMsg.streamCarry = "";
      if (!text) return;
      const appendThinking = (segment) => {
        const delta = normalizeStreamIncrement(assistantMsg.thinking, segment);
        if (delta) assistantMsg.thinking += delta;
      };
      let cursor = 0;
      while (cursor < text.length) {
        const rest = text.slice(cursor);
        const restLower = rest.toLowerCase();
        const openIdx = restLower.indexOf(THINK_OPEN_TAG);
        const closeIdx = restLower.indexOf(THINK_CLOSE_TAG);
        if (openIdx === -1 && closeIdx === -1) break;
        let marker = THINK_OPEN_TAG;
        let markerPos = openIdx;
        if (openIdx === -1 || closeIdx !== -1 && closeIdx < openIdx) {
          marker = THINK_CLOSE_TAG;
          markerPos = closeIdx;
        }
        const absolute = cursor + markerPos;
        const segment = text.slice(cursor, absolute);
        if (segment) {
          if (assistantMsg.thinkStreamMode) {
            appendThinking(segment);
          } else {
            appendContent(segment);
          }
        }
        assistantMsg.thinkStreamMode = marker === THINK_OPEN_TAG;
        cursor = absolute + marker.length;
      }
      const tail = text.slice(cursor);
      if (!tail) return;
      const carryLen = extractThinkCarryLength(tail);
      if (carryLen > 0) {
        const body = tail.slice(0, tail.length - carryLen);
        if (body) {
          if (assistantMsg.thinkStreamMode) {
            appendThinking(body);
          } else {
            appendContent(body);
          }
        }
        assistantMsg.streamCarry = tail.slice(tail.length - carryLen);
        return;
      }
      if (assistantMsg.thinkStreamMode) {
        appendThinking(tail);
      } else {
        appendContent(tail);
      }
    };
    const shouldUseThinkingWindow = (msg) => {
      if (!msg || msg.role !== "assistant") return false;
      return isDeepSeekModel(msg.modelUsed);
    };
    const streamChatResponse = async (payload, assistantMsg, onSession = () => {
    }) => {
      const deepSeekMode = isDeepSeekModel(payload.model);
      let doneReceived = false;
      let receivedAnyPayload = false;
      let deltaBuffer = "";
      let flushTimer = 0;
      const flushIntervalMs = 22;
      const flushDeltaNow = () => {
        if (!deltaBuffer) return;
        assistantMsg.content += deltaBuffer;
        assistantMsg.progress = "";
        deltaBuffer = "";
        queueAutoScroll();
      };
      const scheduleDeltaFlush = () => {
        if (flushTimer) return;
        flushTimer = window.setTimeout(() => {
          flushTimer = 0;
          flushDeltaNow();
          if (!doneReceived && deltaBuffer) {
            scheduleDeltaFlush();
          }
        }, flushIntervalMs);
      };
      const enqueueDelta = (text) => {
        if (!text) return;
        deltaBuffer += text;
        if (doneReceived) {
          flushDeltaNow();
        } else {
          scheduleDeltaFlush();
        }
      };
      const enqueueDeltaSmart = (text) => {
        const incoming = String(text || "");
        if (!incoming) return;
        const currentSnapshot = `${assistantMsg.content}${deltaBuffer}`;
        const delta = normalizeStreamIncrement(currentSnapshot, incoming);
        if (!delta) return;
        enqueueDelta(delta);
      };
      streamStats.value.active = true;
      streamStats.value.lastEvent = "connect";
      assistantMsg.modelUsed = payload.model;
      assistantMsg.thinkStreamMode = false;
      assistantMsg.streamCarry = "";
      if (deepSeekMode) {
        assistantMsg.showThinking = true;
      }
      const streamAttempts = Math.max(1, AI_BRIDGE_CANDIDATES.length);
      let lastStreamError = null;
      for (let attempt = 0; attempt < streamAttempts; attempt += 1) {
        const controller = new AbortController();
        try {
          await requestStreamOnce(payload, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream"
            },
            body: JSON.stringify(payload),
            openWhenHidden: true,
            signal: controller.signal,
            async onopen(response) {
              if (!response.ok) {
                throw new Error(`流式连接失败(${response.status})`);
              }
            },
            onmessage(event) {
              const rawCount = String(event.data || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
              streamStats.value.raw += Math.max(1, rawCount);
              const parsedItems = parseStreamEvents(event.data);
              if (!parsedItems.length) return;
              for (const parsed of parsedItems) {
                if (parsed.event === "done") {
                  streamStats.value.lastEvent = "done";
                  doneReceived = true;
                  flushDeltaNow();
                  controller.abort();
                  return;
                }
                if (parsed.event === "session") {
                  streamStats.value.lastEvent = "session";
                  const sid = String(parsed.session_id || "").trim();
                  if (sid) onSession(sid);
                  continue;
                }
                if (parsed.event === "delta") {
                  receivedAnyPayload = true;
                  streamStats.value.delta += 1;
                  streamStats.value.lastEvent = "delta";
                  const text = sanitizeStreamText(String(parsed.delta || ""));
                  if (text) {
                    if (deepSeekMode) {
                      appendDeepSeekChunk(assistantMsg, text, enqueueDeltaSmart);
                    } else {
                      enqueueDeltaSmart(text);
                    }
                  }
                  continue;
                }
                if (parsed.event === "thinking") {
                  receivedAnyPayload = true;
                  streamStats.value.lastEvent = "thinking";
                  const text = sanitizeStreamText(String(parsed.delta || ""));
                  if (text) {
                    if (deepSeekMode) {
                      const delta = normalizeStreamIncrement(assistantMsg.thinking, text);
                      if (delta) {
                        assistantMsg.thinking += delta;
                      }
                      assistantMsg.showThinking = true;
                    } else {
                      enqueueDeltaSmart(text);
                    }
                  }
                  continue;
                }
                if (parsed.event === "progress") {
                  receivedAnyPayload = true;
                  streamStats.value.progress += 1;
                  streamStats.value.lastEvent = "progress";
                  const text = String(parsed.message || "");
                  assistantMsg.progress = text;
                  continue;
                }
                if (parsed.event === "replace") {
                  receivedAnyPayload = true;
                  streamStats.value.lastEvent = "replace";
                  const text = sanitizeStreamText(String(parsed.content || ""));
                  if (text) {
                    doneReceived = false;
                    deltaBuffer = "";
                    assistantMsg.content = compactDisplayText(text);
                    assistantMsg.thinking = "";
                    assistantMsg.progress = "";
                    queueAutoScroll();
                  }
                  continue;
                }
                if (parsed.event === "error") {
                  streamStats.value.lastEvent = "error";
                  throw new Error(String(parsed.message || "流式返回错误"));
                }
              }
            },
            onclose() {
              if (!doneReceived && receivedAnyPayload) {
                doneReceived = true;
                flushDeltaNow();
                return;
              }
              if (!doneReceived) {
                throw new Error("流式连接被提前关闭");
              }
            },
            onerror(error) {
              if (doneReceived) return;
              throw error;
            }
          });
          lastStreamError = null;
          break;
        } catch (error) {
          lastStreamError = error;
          const aborted = String(error || "").toLowerCase().includes("abort");
          if (doneReceived || aborted) {
            lastStreamError = null;
            break;
          }
          const canRetry = isNetworkFetchError(error) && !receivedAnyPayload && attempt < streamAttempts - 1;
          if (!canRetry) {
            throw error;
          }
          rotateBridgeCandidate();
          const retryDelay = AI_RETRY_DELAYS_MS[Math.min(attempt + 1, AI_RETRY_DELAYS_MS.length - 1)] || 200;
          await sleep(retryDelay);
        }
      }
      if (lastStreamError) {
        throw lastStreamError;
      }
      if (flushTimer) {
        window.clearTimeout(flushTimer);
        flushTimer = 0;
      }
      flushDeltaNow();
      assistantMsg.streamCarry = "";
      streamStats.value.active = false;
    };
    const fallbackChatRequest = async (payload) => {
      const normalizedPayload = {
        token: payload?.token || "",
        bladeAuth: payload?.bladeAuth || payload?.blade_auth || "",
        question: payload?.question || "",
        user_attachment: payload?.user_attachment || "",
        model: payload?.model || selectedModel.value,
        session_id: payload?.session_id || ""
      };
      try {
        const response = await postJson(AI_BRIDGE_PATHS.chat, {
          token: normalizedPayload.token,
          blade_auth: normalizedPayload.bladeAuth,
          question: normalizedPayload.question,
          user_attachment: normalizedPayload.user_attachment || "",
          model: normalizedPayload.model,
          session_id: normalizedPayload.session_id || ""
        });
        const data = unwrapApiData(response);
        const parsed = normalizeMathText(parseAiResponseText(data?.data ?? data));
        if (isNoiseMessage(parsed)) return "";
        return parsed;
      } catch (error) {
        if (AI_DEBUG) {
          console.debug("[AI] bridge fallbackChat 失败，尝试 invoke 兜底:", error);
        }
        const invokeText = await tryInvokeAiChat(normalizedPayload).catch(() => "");
        const parsedInvoke = normalizeMathText(parseAiResponseText(invokeText));
        if (parsedInvoke && !isNoiseMessage(parsedInvoke)) {
          return parsedInvoke;
        }
        throw error;
      }
    };
    const appendTextWithTyping = async (assistantMsg, text) => {
      const normalized = normalizeMathText(String(text || ""));
      if (!normalized) return;
      await new Promise((resolve) => {
        let cursor = 0;
        const step = normalized.length > 300 ? 8 : 6;
        const tick = () => {
          if (cursor >= normalized.length) {
            queueAutoScroll();
            resolve(true);
            return;
          }
          assistantMsg.content += normalized.slice(cursor, cursor + step);
          cursor += step;
          queueAutoScroll();
          window.requestAnimationFrame(tick);
        };
        window.requestAnimationFrame(tick);
      });
    };
    const ensureActiveSession = async () => {
      let active = findSession(activeSessionId.value);
      if (!active) {
        await startNewSession();
        active = findSession(activeSessionId.value);
      }
      if (!active.remoteSessionId) {
        active.remoteSessionId = await createRemoteSession().catch(() => "");
      }
      return active;
    };
    const sendMessage = async () => {
      if (!input.value.trim() && !attachment.value || isLoading.value) return;
      resetStreamStats();
      const userText = input.value.trim();
      const userAttachment = attachment.value;
      input.value = "";
      attachment.value = null;
      isLoading.value = true;
      const userMessage = makeMessage("user", userText || "请分析上传内容", {
        file: userAttachment || null
      });
      messages.value.push(userMessage);
      const assistantMsg = makeMessage("assistant", "", {
        isStreaming: true,
        runtimeStreaming: true,
        thinking: "",
        progress: "",
        modelUsed: selectedModel.value,
        showThinking: isDeepSeekModel(selectedModel.value),
        thinkStreamMode: false,
        streamCarry: ""
      });
      messages.value.push(assistantMsg);
      forceScrollToBottom();
      syncMessagesToActiveSession();
      try {
        if (isTestAccountSession()) {
          await appendTextWithTyping(assistantMsg, buildTestAccountAiReply(userText));
          return;
        }
        await ensureInitReady();
        ensureModelSelection();
        const active = await ensureActiveSession();
        let effectiveModel = selectedModel.value;
        const payload = {
          token: token.value,
          blade_auth: bladeAuth.value,
          question: userText || (userAttachment ? "请分析上传的文件" : "你好"),
          model: effectiveModel,
          session_id: active.remoteSessionId || "",
          user_attachment: userAttachment?.url || ""
        };
        if (AI_DEBUG) {
          console.debug("[AI] send payload:", payload);
        }
        const modelCandidates = buildModelCandidates(selectedModel.value);
        let streamOk = false;
        let streamError = null;
        for (const modelCandidate of modelCandidates) {
          payload.model = modelCandidate;
          effectiveModel = modelCandidate;
          try {
            await streamChatResponse(payload, assistantMsg, (sid) => {
              if (active && !active.remoteSessionId) {
                active.remoteSessionId = sid;
              }
            });
            streamOk = true;
            break;
          } catch (error) {
            streamError = error;
            if (isIllegalModelError(error)) {
              continue;
            }
            throw error;
          }
        }
        if (!streamOk) {
          if (isIllegalModelError(streamError)) {
            throw new Error("当前账号不支持该模型，请切换其他模型后重试。");
          }
          throw streamError || new Error("流式请求失败");
        }
        if (selectedModel.value !== effectiveModel) {
          selectedModel.value = effectiveModel;
        }
        assistantMsg.modelUsed = effectiveModel;
        if (isAiUnauthorizedText(assistantMsg.content) || isAiUnauthorizedText(assistantMsg.progress)) {
          await initAiSession();
          payload.token = token.value;
          payload.blade_auth = bladeAuth.value;
          assistantMsg.content = "";
          assistantMsg.thinking = "";
          assistantMsg.progress = "";
          assistantMsg.isStreaming = true;
          assistantMsg.runtimeStreaming = true;
          await streamChatResponse(payload, assistantMsg, (sid) => {
            if (active && !active.remoteSessionId) {
              active.remoteSessionId = sid;
            }
          });
          if (isAiUnauthorizedText(assistantMsg.content) || isAiUnauthorizedText(assistantMsg.progress)) {
            throw new Error("AI 服务鉴权失败，请重新登录后重试");
          }
        }
        if (!assistantMsg.content.trim()) {
          const fallback = await fallbackChatRequest({
            token: token.value,
            bladeAuth: bladeAuth.value,
            question: payload.question,
            model: effectiveModel,
            session_id: payload.session_id,
            user_attachment: payload.user_attachment
          });
          streamStats.value.fallback = true;
          streamStats.value.lastEvent = "fallback";
          if (fallback) {
            await appendTextWithTyping(assistantMsg, fallback);
          } else {
            assistantMsg.content = "未获取到有效回答，请重试。";
          }
        }
      } catch (error) {
        try {
          const active = findSession(activeSessionId.value);
          const fallbackCandidates = buildModelCandidates(selectedModel.value);
          const fallbackModel = fallbackCandidates.find((item) => availableModelSet.value.has(normalizeModelValue(item))) || fallbackCandidates[0] || "qwen-max";
          if (selectedModel.value !== fallbackModel) {
            selectedModel.value = fallbackModel;
          }
          const fallback = await fallbackChatRequest({
            token: token.value,
            bladeAuth: bladeAuth.value,
            question: userText || "你好",
            model: fallbackModel,
            session_id: active?.remoteSessionId || "",
            user_attachment: userAttachment?.url || ""
          });
          streamStats.value.fallback = true;
          streamStats.value.lastEvent = "fallback-error";
          if (fallback) {
            await appendTextWithTyping(assistantMsg, fallback);
          } else {
            assistantMsg.content = `发送失败：${String(error)}`;
          }
        } catch (fallbackError) {
          assistantMsg.content = `发送失败：${String(fallbackError)}`;
        }
      } finally {
        streamStats.value.active = false;
        assistantMsg.runtimeStreaming = false;
        assistantMsg.content = compactDisplayText(assistantMsg.content);
        assistantMsg.thinking = compactDisplayText(assistantMsg.thinking);
        assistantMsg.streamCarry = "";
        assistantMsg.thinkStreamMode = false;
        assistantMsg.renderMode = detectRenderMode(assistantMsg.role, assistantMsg.content);
        assistantMsg.isStreaming = false;
        assistantMsg.progress = "";
        isLoading.value = false;
        syncMessagesToActiveSession();
        saveLocalHistory();
      }
    };
    const triggerUpload = () => fileInput.value?.click();
    const handleFileChange = async (event) => {
      const file = event?.target?.files?.[0];
      if (!file) return;
      if (isTestAccountSession()) {
        attachment.value = { name: file.name, url: "demo://ai-upload-disabled" };
        event.target.value = "";
        return;
      }
      if (initStatus.value !== "success") {
        await initAiSession();
      }
      try {
        const ext = extractFileExtension(file.name);
        if (!AI_ALLOWED_FILE_EXTENSIONS.includes(ext)) {
          throw new Error(`仅支持上传 ${AI_UPLOAD_ACCEPT} 格式文件`);
        }
        if (file.size > AI_MAX_UPLOAD_BYTES) {
          throw new Error("文件大小不能超过 20MB");
        }
        const fileBase64 = await readFileAsBase64(file);
        if (!fileBase64) {
          throw new Error("文件内容为空或读取失败");
        }
        const mime = file.type || AI_MIME_BY_EXT[ext] || "application/octet-stream";
        let link = "";
        try {
          const res = await postJson(AI_BRIDGE_PATHS.upload, {
            token: token.value,
            blade_auth: bladeAuth.value,
            file_name: file.name,
            file_content: "",
            file_base64: fileBase64,
            file_mime: mime
          });
          const data = unwrapApiData(res);
          link = data?.link || data?.data?.link || "";
        } catch (error) {
          if (AI_DEBUG) {
            console.debug("[AI] bridge 上传失败，尝试 invoke 兜底:", error);
          }
          const invokeRes = await tryInvokeAiUpload({
            token: token.value,
            bladeAuth: bladeAuth.value,
            fileName: file.name,
            fileBase64,
            fileMime: mime
          });
          const data = unwrapApiData(invokeRes);
          link = data?.link || data?.data?.link || "";
        }
        if (!link) {
          throw new Error("上传失败");
        }
        attachment.value = { name: file.name, url: link };
      } catch (error) {
        window.alert(`文件上传失败：${String(error)}`);
      } finally {
        event.target.value = "";
      }
    };
    const showLoadingBubble = computed(() => isLoading.value && !messages.value.some((m) => m.role === "assistant" && m.isStreaming));
    watch(normalizedModelOptions, ensureModelSelection, { immediate: true });
    watch(() => messages.value.length, () => {
      syncMessagesToActiveSession();
      saveLocalHistory();
      syncAutoScroll();
    });
    watch(() => !!attachment.value, () => {
      nextTick(() => {
        updateLayoutMetrics();
      });
    });
    watch(historyKey, () => {
      loadLocalHistory();
      initAiSession().then(() => syncRemoteHistory()).catch(() => {
      });
    });
    onMounted(async () => {
      await initMarkdownRuntime(6e3).catch(() => {
      });
      loadLocalHistory();
      await initAiSession();
      if (initStatus.value === "success") {
        try {
          await syncRemoteHistory();
        } catch (error) {
          if (AI_DEBUG) {
            console.debug("[AI] 同步远端历史失败，已回退本地缓存:", error);
          }
        }
      }
      nextTick(() => {
        initViewportHooks();
        snapToLatest();
      });
    });
    onBeforeUnmount(() => {
      disposeViewportHooks();
    });
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", {
        ref_key: "rootEl",
        ref: rootEl,
        class: normalizeClass(["ai-view", { "has-attachment": !!attachment.value }])
      }, [
        createBaseVNode("div", _hoisted_1, [
          createBaseVNode("div", _hoisted_2, [
            createBaseVNode("div", _hoisted_3, [
              createBaseVNode("button", {
                class: "back-btn",
                onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("back"))
              }, [..._cache[7] || (_cache[7] = [
                createBaseVNode("span", { class: "icon" }, "←", -1),
                createBaseVNode("span", { class: "label" }, "返回", -1)
              ])]),
              createBaseVNode("button", {
                class: "history-btn",
                onClick: _cache[1] || (_cache[1] = ($event) => historyOpen.value = !historyOpen.value)
              }, "历史")
            ]),
            createBaseVNode("div", _hoisted_4, [
              createVNode(_component_IOSSelect, {
                modelValue: selectedModel.value,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => selectedModel.value = $event),
                disabled: isLoading.value || initStatus.value !== "success"
              }, {
                default: withCtx(() => [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(normalizedModelOptions.value, (m) => {
                    return openBlock(), createElementBlock("option", {
                      key: m.value,
                      value: m.value
                    }, toDisplayString(m.label), 9, _hoisted_5);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue", "disabled"])
            ])
          ])
        ]),
        createBaseVNode("div", _hoisted_6, [
          createBaseVNode("span", {
            class: normalizeClass(["debug-pill", { active: streamStats.value.active }])
          }, toDisplayString(streamStats.value.active ? "流式进行中" : "流式空闲"), 3),
          createBaseVNode("span", null, "raw " + toDisplayString(streamStats.value.raw), 1),
          createBaseVNode("span", null, "delta " + toDisplayString(streamStats.value.delta), 1),
          createBaseVNode("span", null, "progress " + toDisplayString(streamStats.value.progress), 1),
          createBaseVNode("span", null, "fallback " + toDisplayString(streamStats.value.fallback ? "1" : "0"), 1),
          createBaseVNode("span", null, "last " + toDisplayString(streamStats.value.lastEvent), 1)
        ]),
        createBaseVNode("div", {
          class: "chat-area",
          ref_key: "chatContainer",
          ref: chatContainer,
          onScroll: handleChatScroll
        }, [
          initStatus.value === "loading" ? (openBlock(), createElementBlock("div", _hoisted_7, "正在连接 AI 服务...")) : initStatus.value === "error" ? (openBlock(), createElementBlock("div", _hoisted_8, [
            createBaseVNode("div", null, "连接失败：" + toDisplayString(initError.value), 1),
            createBaseVNode("button", {
              class: "retry-btn",
              onClick: initAiSession
            }, "重试连接")
          ])) : (openBlock(), createElementBlock("div", _hoisted_9, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(messages.value, (msg) => {
              return openBlock(), createElementBlock("div", {
                key: msg.id,
                class: normalizeClass(["message-row", msg.role])
              }, [
                createBaseVNode("div", _hoisted_10, toDisplayString(msg.role === "user" ? "👤" : "🤖"), 1),
                createBaseVNode("div", _hoisted_11, [
                  msg.file ? (openBlock(), createElementBlock("div", _hoisted_12, "📄 " + toDisplayString(msg.file.name), 1)) : createCommentVNode("", true),
                  shouldUseThinkingWindow(msg) && (msg.thinking || msg.isStreaming) ? (openBlock(), createElementBlock("div", _hoisted_13, [
                    createBaseVNode("div", _hoisted_14, [
                      createBaseVNode("span", _hoisted_15, toDisplayString(modelDisplayName(msg.modelUsed)) + " 思考流", 1),
                      msg.isStreaming ? (openBlock(), createElementBlock("span", _hoisted_16, "流式中")) : createCommentVNode("", true)
                    ]),
                    msg.thinking ? (openBlock(), createElementBlock("div", {
                      key: 0,
                      class: "thinking-content",
                      innerHTML: unref(renderMarkdown)(msg.thinking)
                    }, null, 8, _hoisted_17)) : (openBlock(), createElementBlock("div", _hoisted_18, "正在生成思考内容..."))
                  ])) : msg.thinking ? (openBlock(), createElementBlock("div", _hoisted_19, [
                    createBaseVNode("button", {
                      class: "thinking-toggle",
                      onClick: ($event) => msg.showThinking = !msg.showThinking
                    }, " 深度思考 ", 8, _hoisted_20),
                    msg.showThinking ? (openBlock(), createElementBlock("div", {
                      key: 0,
                      class: "thinking-content",
                      innerHTML: unref(renderMarkdown)(msg.thinking)
                    }, null, 8, _hoisted_21)) : createCommentVNode("", true)
                  ])) : createCommentVNode("", true),
                  msg.progress && msg.isStreaming ? (openBlock(), createElementBlock("div", _hoisted_22, toDisplayString(msg.progress), 1)) : createCommentVNode("", true),
                  msg.role === "assistant" && msg.isStreaming && !msg.content ? (openBlock(), createElementBlock("div", _hoisted_23, [..._cache[8] || (_cache[8] = [
                    createBaseVNode("span", { class: "dot" }, null, -1),
                    createBaseVNode("span", { class: "dot" }, null, -1),
                    createBaseVNode("span", { class: "dot" }, null, -1),
                    createBaseVNode("span", { class: "stream-label" }, "正在生成回答", -1)
                  ])])) : createCommentVNode("", true),
                  msg.role === "assistant" ? (openBlock(), createElementBlock("div", {
                    key: 5,
                    class: "text rich-text",
                    innerHTML: renderMessage(msg)
                  }, null, 8, _hoisted_24)) : (openBlock(), createElementBlock("div", {
                    key: 6,
                    class: "text plain-text",
                    textContent: toDisplayString(msg.content)
                  }, null, 8, _hoisted_25))
                ])
              ], 2);
            }), 128)),
            showLoadingBubble.value ? (openBlock(), createElementBlock("div", _hoisted_26, [..._cache[9] || (_cache[9] = [
              createBaseVNode("div", { class: "avatar" }, "🤖", -1),
              createBaseVNode("div", { class: "bubble" }, "正在思考...", -1)
            ])])) : createCommentVNode("", true)
          ]))
        ], 544),
        attachment.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          ref_key: "attachmentBarEl",
          ref: attachmentBarEl,
          class: "attachment-bar glass-card"
        }, [
          createBaseVNode("span", null, "📎 " + toDisplayString(attachment.value.name), 1),
          createBaseVNode("button", {
            onClick: _cache[3] || (_cache[3] = ($event) => attachment.value = null)
          }, "×")
        ], 512)) : createCommentVNode("", true),
        createBaseVNode("div", {
          ref_key: "inputBarEl",
          ref: inputBarEl,
          class: "input-area glass-card"
        }, [
          createBaseVNode("button", {
            class: "attach-btn",
            onClick: triggerUpload,
            disabled: isLoading.value || initStatus.value !== "success"
          }, "➕", 8, _hoisted_27),
          createBaseVNode("input", {
            ref_key: "fileInput",
            ref: fileInput,
            type: "file",
            accept: unref(AI_UPLOAD_ACCEPT),
            style: { "display": "none" },
            onChange: handleFileChange
          }, null, 40, _hoisted_28),
          withDirectives(createBaseVNode("input", {
            "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => input.value = $event),
            type: "text",
            onInput: handleInputTyping,
            onKeyup: withKeys(sendMessage, ["enter"]),
            onFocus: handleInputFocus,
            onBlur: handleInputBlur,
            disabled: isLoading.value || initStatus.value !== "success",
            placeholder: "输入问题或上传文件..."
          }, null, 40, _hoisted_29), [
            [vModelText, input.value]
          ]),
          createBaseVNode("button", {
            class: "send-btn",
            disabled: !input.value && !attachment.value || isLoading.value || initStatus.value !== "success",
            onClick: sendMessage
          }, "发送", 8, _hoisted_30)
        ], 512),
        historyOpen.value ? (openBlock(), createElementBlock("div", {
          key: 1,
          class: "history-backdrop",
          onClick: _cache[5] || (_cache[5] = ($event) => historyOpen.value = false)
        })) : createCommentVNode("", true),
        createBaseVNode("div", {
          class: normalizeClass(["history-panel", { open: historyOpen.value }])
        }, [
          createBaseVNode("div", _hoisted_31, [
            _cache[10] || (_cache[10] = createBaseVNode("h3", null, "历史记录", -1)),
            createBaseVNode("button", {
              class: "history-close",
              onClick: _cache[6] || (_cache[6] = ($event) => historyOpen.value = false)
            }, "×")
          ]),
          createBaseVNode("button", {
            class: "new-chat-btn",
            onClick: startNewSession
          }, "新对话"),
          createBaseVNode("div", _hoisted_32, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(sessions.value, (s) => {
              return openBlock(), createElementBlock("div", {
                key: s.id,
                class: normalizeClass(["history-item", { active: s.id === activeSessionId.value }]),
                onClick: ($event) => selectSession(s.id)
              }, [
                createBaseVNode("div", _hoisted_34, toDisplayString(s.title || "新对话"), 1),
                createBaseVNode("div", _hoisted_35, toDisplayString(formatSessionTime(s.updatedAt)), 1),
                s.preview ? (openBlock(), createElementBlock("div", _hoisted_36, toDisplayString(s.preview), 1)) : createCommentVNode("", true),
                createBaseVNode("button", {
                  class: "history-delete",
                  onClick: withModifiers(($event) => requestDeleteSession(s.id), ["stop"])
                }, "删除", 8, _hoisted_37)
              ], 10, _hoisted_33);
            }), 128))
          ])
        ], 2),
        deleteConfirmVisible.value ? (openBlock(), createElementBlock("div", _hoisted_38, [
          createBaseVNode("div", _hoisted_39, [
            _cache[11] || (_cache[11] = createBaseVNode("h4", null, "删除历史对话", -1)),
            _cache[12] || (_cache[12] = createBaseVNode("p", null, "删除后将同步清理云端会话记录，无法恢复。", -1)),
            deleteConfirmError.value ? (openBlock(), createElementBlock("div", _hoisted_40, toDisplayString(deleteConfirmError.value), 1)) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_41, [
              createBaseVNode("button", {
                class: "confirm-cancel",
                disabled: deleteConfirmLoading.value,
                onClick: cancelDeleteSession
              }, "取消", 8, _hoisted_42),
              createBaseVNode("button", {
                class: "confirm-danger",
                disabled: deleteConfirmLoading.value,
                onClick: deleteSessionConfirmed
              }, toDisplayString(deleteConfirmLoading.value ? "删除中..." : "确认删除"), 9, _hoisted_43)
            ])
          ])
        ])) : createCommentVNode("", true)
      ], 2);
    };
  }
};
const AiChatView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-535a5731"]]);
export {
  AiChatView as default
};
