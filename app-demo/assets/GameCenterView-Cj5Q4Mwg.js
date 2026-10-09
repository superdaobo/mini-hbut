import { _ as _sfc_main$9 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-DhSUOFfG.js";
import { bv as GAME_PLATFORM_REQUEST_TIMEOUT_MS, br as LOCAL_ERROR_CODES, ak as getIdentityAccessToken, bu as GAME_PLATFORM_PROTOCOL_VERSION, _ as _export_sfc, u as useI18n, z as tf, c as useAuthStore, bH as DEFAULT_GAME_CENTER_FLAGS, al as fetchRemoteConfig, bO as readCachedPlayerProfile, bl as normalizeModuleCenterChannel, bm as buildModuleCenterCards } from "./app-demo-DztvWo2z.js";
import { a as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, d as createCommentVNode, n as normalizeClass, v as watch, o as onMounted, u as unref, g as createTextVNode, F as Fragment, j as createBlock, f as renderList, e as normalizeStyle, r as ref, h as computed, p as createVNode, L as withDirectives, O as vModelRadio, M as vModelText } from "./vue-core-D-44rohN.js";
import { G as GamePlatformError, g as createIdempotencyKey, h as requestGamePlatformJson, r as resolveGamePlatformApiBase, d as fetchPointsDailyTasks, i as isPointsFeatureDisabled, j as isPointsAuthError, k as dailyTaskTitleI18nKey, t as taskProgressPercent, l as GLOBAL_RANK_DEFAULT_LIMIT, m as fetchGlobalXpLeaderboard, n as mergeGlobalRankRows, o as formatPointsTimestamp, L as LEDGER_DEFAULT_LIMIT, q as formatDelta, f as fetchPointsWallet, s as fetchPointsLedger, u as levelProgressPercent, v as rewardStatusI18nKey, w as ledgerReasonI18nKey, x as ledgerEntryTypeI18nKey, y as mergeLedgerEntries, E as EMPTY_GAME_PLATFORM_CAPABILITIES, z as fetchGamePlayerWallet, A as fetchGamePlatformMeta, b as requestGameOpen, B as fetchClassicLeaderboard, C as normalizeLegacyLeaderboard, D as fetchGameLeaderboards, F as normalizeGamePlatformLeaderboard } from "./pending_open-CJJALk6R.js";
import { h as getFeaturePolicy, u as resolveModuleChannel, w as getLocalModuleState } from "./more-modules-yxgAg-Rh.js";
import "./runtime-bridge-gQMtwwk6.js";
import { G as GAME_CENTER_GAME_IDS, r as resolveEffectiveGameCenterFlags } from "./flags-D9kb3dpA.js";
import "./debug-tools-CyNtADDO.js";
import "./capture-YhmA9GNe.js";
const DRIFT_TEXT_MAX_LENGTH = 500;
const DRIFT_TEXT_MIN_LENGTH = 1;
const DRIFT_COIN_AMOUNT_MAX = 1e4;
const DRIFT_REPORT_DETAIL_MAX_LENGTH = 200;
const DRIFT_REPORT_REASONS = Object.freeze(["spam", "abuse", "fraud", "other"]);
const DRIFT_ERROR_CODES = Object.freeze({
  poolEmpty: "DRIFT_POOL_EMPTY",
  selfClaim: "DRIFT_SELF_CLAIM",
  alreadyClaimed: "DRIFT_ALREADY_CLAIMED",
  expired: "DRIFT_EXPIRED",
  notFound: "DRIFT_NOT_FOUND",
  textInvalid: "DRIFT_TEXT_INVALID",
  rateLimited: "RATE_LIMITED",
  dailyLimitExceeded: "DAILY_LIMIT_EXCEEDED"
});
const DRIFT_LOCAL_ERROR_CODES = Object.freeze({
  invalidText: "LOCAL_DRIFT_INVALID_TEXT",
  invalidAmount: "LOCAL_DRIFT_INVALID_AMOUNT",
  invalidReason: "LOCAL_DRIFT_INVALID_REASON"
});
const safeText = (value) => String(value ?? "").trim();
const countCodePoints = (value) => Array.from(value).length;
const validateDriftText = (raw) => {
  const text = safeText(raw);
  const length = countCodePoints(text);
  if (length < DRIFT_TEXT_MIN_LENGTH) return { ok: false, length, reason: "empty" };
  if (length > DRIFT_TEXT_MAX_LENGTH) return { ok: false, length, reason: "tooLong" };
  return { ok: true, length, reason: "" };
};
const normalizeDriftText = (raw) => safeText(raw);
const validateDriftCoinAmount = (raw) => {
  const text = safeText(raw);
  if (!text) return { ok: true, value: 0, reason: "" };
  if (!/^\d+$/.test(text)) return { ok: false, value: 0, reason: "notInteger" };
  const value = Number(text);
  if (!Number.isSafeInteger(value)) return { ok: false, value: 0, reason: "notInteger" };
  if (value < 1) return { ok: false, value: 0, reason: "notPositive" };
  if (value > DRIFT_COIN_AMOUNT_MAX) return { ok: false, value: 0, reason: "tooLarge" };
  return { ok: true, value, reason: "" };
};
const parsePublishCoinAmount = (raw) => {
  const text = safeText(raw);
  if (!text) return 0;
  if (!/^\d+$/.test(text)) {
    throw new GamePlatformError(DRIFT_LOCAL_ERROR_CODES.invalidAmount, "红包金额必须是整数", {
      retryable: false
    });
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 0 || value > DRIFT_COIN_AMOUNT_MAX) {
    throw new GamePlatformError(
      DRIFT_LOCAL_ERROR_CODES.invalidAmount,
      `红包金额需在 0..${DRIFT_COIN_AMOUNT_MAX} 之间`,
      { retryable: false }
    );
  }
  return value;
};
const requireDriftBase = (apiBase) => {
  const base = resolveGamePlatformApiBase(apiBase);
  if (!base) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.configMissing, "游戏平台服务未配置，漂流瓶暂时不可用", {
      retryable: false
    });
  }
  return base;
};
const requireIdentityHeaders = async () => {
  const token = await getIdentityAccessToken();
  if (!token) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.authMissing, "当前未登录，无法使用漂流瓶", {
      retryable: false
    });
  }
  return {
    Authorization: `Bearer ${token}`,
    "X-Game-Platform-Protocol": String(GAME_PLATFORM_PROTOCOL_VERSION)
  };
};
const authorizedDriftRequest = async (path, options = {}) => {
  const base = requireDriftBase(options.apiBase);
  const headers = await requireIdentityHeaders();
  return requestGamePlatformJson(`${base}${path}`, {
    method: options.method || "GET",
    headers: { ...headers, ...options.headers || {} },
    body: options.body,
    timeoutMs: options.timeoutMs ?? GAME_PLATFORM_REQUEST_TIMEOUT_MS
  });
};
const unwrapDriftPayload = (payload) => {
  const body = payload && typeof payload === "object" ? payload : {};
  const nested = body.data && typeof body.data === "object" ? body.data : null;
  return nested ? { ...nested, ...body } : body;
};
const toSafeInt = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
};
const requireBottleId = (value) => {
  const id = safeText(value);
  if (!id) {
    throw new GamePlatformError(LOCAL_ERROR_CODES.responseInvalid, "漂流瓶数据异常，请稍后重试", {
      retryable: true
    });
  }
  return id;
};
const normalizeDriftBottle = (payload) => {
  const body = unwrapDriftPayload(payload);
  const bottle = body.bottle && typeof body.bottle === "object" ? body.bottle : body;
  return {
    bottleId: requireBottleId(bottle.bottle_id),
    text: String(bottle.text ?? ""),
    coinAmount: toSafeInt(bottle.coin_amount, 0),
    status: safeText(bottle.status),
    expiresAt: safeText(bottle.expires_at),
    senderLabel: safeText(bottle.sender_label),
    isMine: bottle.is_mine === true
  };
};
const publishDriftBottle = async (input) => {
  const text = normalizeDriftText(input.text);
  const textValidation = validateDriftText(text);
  if (!textValidation.ok) {
    throw new GamePlatformError(DRIFT_LOCAL_ERROR_CODES.invalidText, "漂流瓶内容不符合要求，请调整后再试", {
      retryable: false
    });
  }
  const coinAmount = parsePublishCoinAmount(input.coinAmount ?? 0);
  const clientRequestId = safeText(input.clientRequestId) || createIdempotencyKey();
  const payload = await authorizedDriftRequest("/drift-bottles", {
    method: "POST",
    apiBase: input.apiBase,
    timeoutMs: input.timeoutMs,
    body: {
      text,
      coin_amount: coinAmount,
      client_request_id: clientRequestId
    }
  });
  const body = unwrapDriftPayload(payload);
  return {
    bottleId: requireBottleId(body.bottle_id),
    status: safeText(body.status),
    text: String(body.text ?? text),
    coinAmount: toSafeInt(body.coin_amount, coinAmount),
    createdAt: safeText(body.created_at),
    expiresAt: safeText(body.expires_at)
  };
};
const drawRandomDriftBottle = async (options = {}) => {
  const params = new URLSearchParams();
  params.set("exclude_recent", options.excludeRecent === false ? "false" : "true");
  const payload = await authorizedDriftRequest(
    `/drift-bottles/random?${params.toString()}`,
    { apiBase: options.apiBase, timeoutMs: options.timeoutMs }
  );
  return normalizeDriftBottle(payload);
};
const claimDriftBottle = async (bottleId, options = {}) => {
  const id = requireBottleId(bottleId);
  const payload = await authorizedDriftRequest(
    `/drift-bottles/${encodeURIComponent(id)}/claim`,
    // 契约未定义 claim body；显式空 JSON 让 Content-Type 与 body 都存在，
    // 避免服务端统一 `request.json()` 解析路径在「无 body 的 POST」上报错。
    { method: "POST", body: {}, apiBase: options.apiBase, timeoutMs: options.timeoutMs }
  );
  const body = unwrapDriftPayload(payload);
  return {
    bottleId: requireBottleId(body.bottle_id ?? id),
    status: safeText(body.status),
    coinAmount: toSafeInt(body.coin_amount, 0),
    claimedAt: safeText(body.claimed_at),
    credited: body.credited === true
  };
};
const reportDriftBottle = async (bottleId, input) => {
  const id = requireBottleId(bottleId);
  const reason = safeText(input.reason);
  if (!DRIFT_REPORT_REASONS.includes(reason)) {
    throw new GamePlatformError(DRIFT_LOCAL_ERROR_CODES.invalidReason, "举报原因无效", { retryable: false });
  }
  const detail = safeText(input.detail).slice(0, DRIFT_REPORT_DETAIL_MAX_LENGTH);
  const payload = await authorizedDriftRequest(
    `/drift-bottles/${encodeURIComponent(id)}/report`,
    {
      method: "POST",
      apiBase: input.apiBase,
      timeoutMs: input.timeoutMs,
      body: { reason, detail }
    }
  );
  const body = unwrapDriftPayload(payload);
  return {
    reportId: safeText(body.report_id),
    status: safeText(body.status),
    bottleStatusAfter: safeText(body.bottle_status_after)
  };
};
const hideDriftBottle = async (bottleId, options = {}) => {
  const id = requireBottleId(bottleId);
  const payload = await authorizedDriftRequest(
    `/drift-bottles/${encodeURIComponent(id)}/hide`,
    // 同 claim：契约未定义 body，显式空 JSON 兼容服务端统一 body 解析路径。
    { method: "POST", body: {}, apiBase: options.apiBase, timeoutMs: options.timeoutMs }
  );
  const body = unwrapDriftPayload(payload);
  return {
    bottleId: requireBottleId(body.bottle_id ?? id),
    hiddenForMe: body.hidden_for_me !== false
  };
};
const _hoisted_1$8 = { class: "gc-notice__text" };
const _hoisted_2$8 = {
  key: 0,
  class: "gc-notice__title"
};
const _hoisted_3$8 = {
  key: 1,
  class: "gc-notice__message"
};
const _hoisted_4$8 = ["disabled"];
const _sfc_main$8 = {
  __name: "GameCenterNotice",
  props: {
    tone: { type: String, default: "info" },
    title: { type: String, default: "" },
    message: { type: String, default: "" },
    actionText: { type: String, default: "" },
    busy: { type: Boolean, default: false }
  },
  emits: ["action"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(["gc-notice", `gc-notice--${props.tone}`]),
        role: "status"
      }, [
        createBaseVNode("div", _hoisted_1$8, [
          props.title ? (openBlock(), createElementBlock("strong", _hoisted_2$8, toDisplayString(props.title), 1)) : createCommentVNode("", true),
          props.message ? (openBlock(), createElementBlock("span", _hoisted_3$8, toDisplayString(props.message), 1)) : createCommentVNode("", true)
        ]),
        props.actionText ? (openBlock(), createElementBlock("button", {
          key: 0,
          class: "gc-notice__action",
          type: "button",
          disabled: props.busy,
          onClick: _cache[0] || (_cache[0] = ($event) => emit("action"))
        }, toDisplayString(props.actionText), 9, _hoisted_4$8)) : createCommentVNode("", true)
      ], 2);
    };
  }
};
const GameCenterNotice = /* @__PURE__ */ _export_sfc(_sfc_main$8, [["__scopeId", "data-v-b85a3d40"]]);
const _hoisted_1$7 = { class: "gc-home" };
const _hoisted_2$7 = { class: "gc-card gc-card--player" };
const _hoisted_3$7 = { class: "gc-player" };
const _hoisted_4$7 = { class: "gc-player__info" };
const _hoisted_5$7 = { class: "gc-player__name" };
const _hoisted_6$7 = { class: "gc-player__meta" };
const _hoisted_7$7 = {
  key: 0,
  class: "gc-player__wallet"
};
const _hoisted_8$6 = { class: "gc-stat" };
const _hoisted_9$6 = { class: "gc-stat__label" };
const _hoisted_10$6 = { class: "gc-stat" };
const _hoisted_11$6 = { class: "gc-stat__label" };
const _hoisted_12$5 = { class: "gc-stat" };
const _hoisted_13$5 = { class: "gc-stat__label" };
const _hoisted_14$5 = {
  key: 0,
  class: "gc-card",
  "data-section": "daily-tasks"
};
const _hoisted_15$5 = { class: "gc-card__header" };
const _hoisted_16$5 = { class: "gc-card__title" };
const _hoisted_17$5 = {
  key: 0,
  class: "gc-card__meta"
};
const _hoisted_18$5 = {
  key: 0,
  class: "gc-card__hint"
};
const _hoisted_19$5 = {
  key: 1,
  class: "gc-card__hint"
};
const _hoisted_20$5 = {
  key: 3,
  class: "gc-card__hint"
};
const _hoisted_21$5 = {
  key: 4,
  class: "gc-task-list"
};
const _hoisted_22$5 = { class: "gc-task__head" };
const _hoisted_23$5 = { class: "gc-task__title" };
const _hoisted_24$5 = { class: "gc-task__status" };
const _hoisted_25$5 = ["aria-label", "aria-valuenow"];
const _hoisted_26$5 = {
  key: 5,
  class: "gc-card__hint"
};
const _hoisted_27$4 = {
  key: 1,
  class: "gc-card"
};
const _hoisted_28$3 = { class: "gc-card__header" };
const _hoisted_29$3 = { class: "gc-card__title" };
const _hoisted_30$3 = { class: "gc-game-list" };
const _hoisted_31$3 = ["onClick"];
const _hoisted_32$2 = { "aria-hidden": "true" };
const _hoisted_33$2 = { class: "gc-card" };
const _hoisted_34$2 = { class: "gc-card__header" };
const _hoisted_35$2 = { class: "gc-card__title" };
const _hoisted_36$2 = { class: "gc-game-list" };
const _hoisted_37$2 = ["onClick"];
const _hoisted_38$2 = { "aria-hidden": "true" };
const _sfc_main$7 = {
  __name: "GameCenterHomeTab",
  props: {
    profile: { type: Object, default: () => ({}) },
    economyEnabled: { type: Boolean, default: false },
    dailyTasksEnabled: { type: Boolean, default: false },
    /** 远程配置下发的 API base（缺省走环境默认源；透传给 points.ts 请求层） */
    apiBase: { type: String, default: "" },
    recentGames: { type: Array, default: () => [] },
    recommendedGames: { type: Array, default: () => [] }
  },
  emits: ["open-game"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t } = useI18n();
    const tasks = ref(null);
    const tasksLoading = ref(false);
    const tasksError = ref(null);
    const toViewError = (error) => ({
      code: String(error?.code || ""),
      message: String(error?.message || "").trim(),
      retryable: error?.retryable === true
    });
    const tasksAuthError = computed(() => !!tasksError.value && isPointsAuthError(tasksError.value));
    const tasksFeatureDisabled = computed(() => !!tasksError.value && isPointsFeatureDisabled(tasksError.value));
    const taskItems = computed(() => tasks.value ? tasks.value.tasks : []);
    const completedCount = computed(() => taskItems.value.filter((task) => task.completed).length);
    const loadTasks = async () => {
      if (!props.dailyTasksEnabled) {
        tasks.value = null;
        tasksError.value = null;
        return;
      }
      tasksLoading.value = true;
      tasksError.value = null;
      try {
        const snapshot = await fetchPointsDailyTasks({ apiBase: props.apiBase });
        if (!props.dailyTasksEnabled) return;
        tasks.value = snapshot;
      } catch (error) {
        if (!props.dailyTasksEnabled) return;
        tasks.value = null;
        tasksError.value = toViewError(error);
      } finally {
        tasksLoading.value = false;
      }
    };
    const taskTitle = (task) => {
      const key = dailyTaskTitleI18nKey(task?.taskId);
      return key ? t(key) : String(task?.title || "").trim() || t("gameCenter.points.tasksTitle");
    };
    const taskPercent = (task) => taskProgressPercent(task?.progress, task?.target);
    watch(
      () => props.dailyTasksEnabled,
      (enabled) => {
        if (enabled && !tasks.value && !tasksLoading.value) void loadTasks();
      }
    );
    onMounted(() => {
      void loadTasks();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$7, [
        createBaseVNode("section", _hoisted_2$7, [
          createBaseVNode("div", _hoisted_3$7, [
            _cache[0] || (_cache[0] = createBaseVNode("span", {
              class: "gc-player__avatar",
              "aria-hidden": "true"
            }, "🎓", -1)),
            createBaseVNode("div", _hoisted_4$7, [
              createBaseVNode("strong", _hoisted_5$7, toDisplayString(props.profile.name || unref(t)("gameCenter.home.anonymous")), 1),
              createBaseVNode("span", _hoisted_6$7, [
                createTextVNode(toDisplayString(props.profile.className || unref(t)("gameCenter.home.classUnknown")) + " ", 1),
                props.profile.schoolName ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                  createTextVNode(" · " + toDisplayString(props.profile.schoolName), 1)
                ], 64)) : createCommentVNode("", true)
              ])
            ])
          ]),
          props.economyEnabled ? (openBlock(), createElementBlock("div", _hoisted_7$7, [
            createBaseVNode("div", _hoisted_8$6, [
              createBaseVNode("span", _hoisted_9$6, toDisplayString(unref(t)("gameCenter.me.level")), 1),
              _cache[1] || (_cache[1] = createBaseVNode("strong", { class: "gc-stat__value" }, "--", -1))
            ]),
            createBaseVNode("div", _hoisted_10$6, [
              createBaseVNode("span", _hoisted_11$6, toDisplayString(unref(t)("gameCenter.me.xp")), 1),
              _cache[2] || (_cache[2] = createBaseVNode("strong", { class: "gc-stat__value" }, "--", -1))
            ]),
            createBaseVNode("div", _hoisted_12$5, [
              createBaseVNode("span", _hoisted_13$5, toDisplayString(unref(t)("gameCenter.me.coins")), 1),
              _cache[3] || (_cache[3] = createBaseVNode("strong", { class: "gc-stat__value" }, "--", -1))
            ])
          ])) : createCommentVNode("", true)
        ]),
        props.dailyTasksEnabled ? (openBlock(), createElementBlock("section", _hoisted_14$5, [
          createBaseVNode("header", _hoisted_15$5, [
            createBaseVNode("h3", _hoisted_16$5, toDisplayString(unref(t)("gameCenter.home.tasksTitle")), 1),
            taskItems.value.length ? (openBlock(), createElementBlock("span", _hoisted_17$5, toDisplayString(unref(tf)("gameCenter.home.tasksCompletedCount", { done: completedCount.value, total: taskItems.value.length })), 1)) : createCommentVNode("", true)
          ]),
          tasksFeatureDisabled.value ? (openBlock(), createElementBlock("p", _hoisted_18$5, toDisplayString(unref(t)("gameCenter.points.tasksDisabled")), 1)) : tasksAuthError.value ? (openBlock(), createElementBlock("p", _hoisted_19$5, toDisplayString(unref(t)("gameCenter.points.signInRequired")), 1)) : tasksError.value ? (openBlock(), createBlock(GameCenterNotice, {
            key: 2,
            tone: "warning",
            title: unref(t)("gameCenter.points.loadFailed"),
            message: tasksError.value.message || unref(t)("gameCenter.points.loadFailed"),
            "action-text": unref(t)("gameCenter.points.retry"),
            busy: tasksLoading.value,
            onAction: loadTasks
          }, null, 8, ["title", "message", "action-text", "busy"])) : tasksLoading.value && !tasks.value ? (openBlock(), createElementBlock("p", _hoisted_20$5, toDisplayString(unref(t)("gameCenter.points.loading")), 1)) : taskItems.value.length ? (openBlock(), createElementBlock("ul", _hoisted_21$5, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(taskItems.value, (task) => {
              return openBlock(), createElementBlock("li", {
                key: task.taskId,
                class: normalizeClass(["gc-task", { "gc-task--done": task.completed }])
              }, [
                createBaseVNode("div", _hoisted_22$5, [
                  createBaseVNode("span", _hoisted_23$5, toDisplayString(taskTitle(task)), 1),
                  createBaseVNode("span", _hoisted_24$5, toDisplayString(task.completed ? unref(t)("gameCenter.points.rewardGranted") : unref(tf)("gameCenter.points.taskProgressValue", { progress: task.progress, target: task.target })), 1)
                ]),
                createBaseVNode("div", {
                  class: "gc-task__track",
                  role: "progressbar",
                  "aria-label": taskTitle(task),
                  "aria-valuemin": "0",
                  "aria-valuemax": "100",
                  "aria-valuenow": taskPercent(task)
                }, [
                  createBaseVNode("div", {
                    class: "gc-task__fill",
                    style: normalizeStyle({ width: `${taskPercent(task)}%` })
                  }, null, 4)
                ], 8, _hoisted_25$5)
              ], 2);
            }), 128))
          ])) : tasks.value ? (openBlock(), createElementBlock("p", _hoisted_26$5, toDisplayString(unref(t)("gameCenter.points.tasksEmpty")), 1)) : createCommentVNode("", true)
        ])) : createCommentVNode("", true),
        props.recentGames.length ? (openBlock(), createElementBlock("section", _hoisted_27$4, [
          createBaseVNode("header", _hoisted_28$3, [
            createBaseVNode("h3", _hoisted_29$3, toDisplayString(unref(t)("gameCenter.home.recentTitle")), 1)
          ]),
          createBaseVNode("div", _hoisted_30$3, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(props.recentGames, (item) => {
              return openBlock(), createElementBlock("button", {
                key: `recent-${item.id}`,
                class: "gc-game-chip",
                type: "button",
                onClick: ($event) => emit("open-game", item.id)
              }, [
                createBaseVNode("span", _hoisted_32$2, toDisplayString(item.icon || "🎮"), 1),
                createBaseVNode("span", null, toDisplayString(item.name), 1)
              ], 8, _hoisted_31$3);
            }), 128))
          ])
        ])) : createCommentVNode("", true),
        createBaseVNode("section", _hoisted_33$2, [
          createBaseVNode("header", _hoisted_34$2, [
            createBaseVNode("h3", _hoisted_35$2, toDisplayString(unref(t)("gameCenter.home.recommendTitle")), 1)
          ]),
          createBaseVNode("div", _hoisted_36$2, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(props.recommendedGames, (item) => {
              return openBlock(), createElementBlock("button", {
                key: `recommend-${item.id}`,
                class: "gc-game-chip",
                type: "button",
                onClick: ($event) => emit("open-game", item.id)
              }, [
                createBaseVNode("span", _hoisted_38$2, toDisplayString(item.icon || "🎮"), 1),
                createBaseVNode("span", null, toDisplayString(item.name), 1)
              ], 8, _hoisted_37$2);
            }), 128))
          ])
        ])
      ]);
    };
  }
};
const GameCenterHomeTab = /* @__PURE__ */ _export_sfc(_sfc_main$7, [["__scopeId", "data-v-08ac5d9f"]]);
const _hoisted_1$6 = { class: "gc-games" };
const _hoisted_2$6 = {
  key: 0,
  class: "gc-competitive",
  "data-section": "gomoku-competitive"
};
const _hoisted_3$6 = { class: "gc-competitive__title" };
const _hoisted_4$6 = { class: "gc-competitive__desc" };
const _hoisted_5$6 = { class: "gc-games__hint" };
const _hoisted_6$6 = { class: "gc-games__grid" };
const _hoisted_7$6 = ["data-game-id", "disabled", "onClick"];
const _hoisted_8$5 = {
  class: "gc-games__icon",
  "aria-hidden": "true"
};
const _hoisted_9$5 = { class: "gc-games__name" };
const _hoisted_10$5 = { class: "gc-games__desc" };
const _hoisted_11$5 = { class: "gc-games__status" };
const COMPETITIVE_GOMOKU_MODULE_ID = "hbut_gomoku";
const _sfc_main$6 = {
  __name: "GameCenterGamesTab",
  props: {
    games: { type: Array, default: () => [] },
    busyGameId: { type: String, default: "" },
    gomokuCompetitiveEnabled: { type: Boolean, default: false }
  },
  emits: ["open-game"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t } = useI18n();
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$6, [
        props.gomokuCompetitiveEnabled ? (openBlock(), createElementBlock("section", _hoisted_2$6, [
          createBaseVNode("strong", _hoisted_3$6, toDisplayString(unref(t)("gameCenter.games.competitiveTitle")), 1),
          createBaseVNode("span", _hoisted_4$6, toDisplayString(unref(t)("gameCenter.games.competitiveBody")), 1),
          createBaseVNode("button", {
            class: "gc-competitive__action",
            type: "button",
            onClick: _cache[0] || (_cache[0] = ($event) => emit("open-game", COMPETITIVE_GOMOKU_MODULE_ID))
          }, toDisplayString(unref(t)("gameCenter.games.competitiveAction")), 1)
        ])) : createCommentVNode("", true),
        createBaseVNode("p", _hoisted_5$6, toDisplayString(unref(t)("gameCenter.games.hint")), 1),
        createBaseVNode("div", _hoisted_6$6, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(props.games, (item) => {
            return openBlock(), createElementBlock("button", {
              key: item.id,
              class: "gc-games__card",
              type: "button",
              "data-game-id": item.id,
              disabled: props.busyGameId === item.id,
              onClick: ($event) => emit("open-game", item.id)
            }, [
              createBaseVNode("span", _hoisted_8$5, toDisplayString(item.icon || "🎮"), 1),
              createBaseVNode("strong", _hoisted_9$5, toDisplayString(item.name), 1),
              createBaseVNode("span", _hoisted_10$5, toDisplayString(item.description || unref(t)("gameCenter.games.noDesc")), 1),
              createBaseVNode("span", _hoisted_11$5, toDisplayString(item.statusText || unref(t)("gameCenter.games.ready")), 1)
            ], 8, _hoisted_7$6);
          }), 128))
        ])
      ]);
    };
  }
};
const GameCenterGamesTab = /* @__PURE__ */ _export_sfc(_sfc_main$6, [["__scopeId", "data-v-866cb40d"]]);
const _hoisted_1$5 = { class: "gc-rank" };
const _hoisted_2$5 = { class: "gc-rank__games" };
const _hoisted_3$5 = ["data-game-id", "onClick"];
const _hoisted_4$5 = { "aria-hidden": "true" };
const _hoisted_5$5 = { class: "gc-card" };
const _hoisted_6$5 = { class: "gc-card__header" };
const _hoisted_7$5 = { class: "gc-card__title" };
const _hoisted_8$4 = { class: "gc-card__meta" };
const _hoisted_9$4 = {
  key: 0,
  class: "gc-card__hint"
};
const _hoisted_10$4 = {
  key: 1,
  class: "gc-card__hint"
};
const _hoisted_11$4 = {
  key: 2,
  class: "gc-rank__list"
};
const _hoisted_12$4 = { class: "gc-rank__pos" };
const _hoisted_13$4 = { class: "gc-rank__name" };
const _hoisted_14$4 = { class: "gc-rank__score" };
const _hoisted_15$4 = {
  key: 0,
  class: "gc-rank__tag"
};
const _hoisted_16$4 = { class: "gc-card__note" };
const _hoisted_17$4 = { class: "gc-card" };
const _hoisted_18$4 = { class: "gc-card__header" };
const _hoisted_19$4 = { class: "gc-card__title" };
const _hoisted_20$4 = {
  key: 0,
  class: "gc-card__hint"
};
const _hoisted_21$4 = {
  key: 0,
  class: "gc-card__hint"
};
const _hoisted_22$4 = {
  key: 1,
  class: "gc-card__hint"
};
const _hoisted_23$4 = {
  key: 2,
  class: "gc-rank__list"
};
const _hoisted_24$4 = { class: "gc-rank__pos" };
const _hoisted_25$4 = { class: "gc-rank__name" };
const _hoisted_26$4 = { class: "gc-rank__score" };
const _hoisted_27$3 = { class: "gc-card__note" };
const _sfc_main$5 = {
  __name: "GameCenterRankTab",
  props: {
    games: { type: Array, default: () => [] },
    selectedGameId: { type: String, default: "" },
    classicBoard: { type: Object, default: null },
    loading: { type: Boolean, default: false },
    errorMessage: { type: String, default: "" },
    verifiedEnabled: { type: Boolean, default: false },
    verifiedRewardEnabled: { type: Boolean, default: false },
    verifiedBoard: { type: Object, default: null },
    verifiedError: { type: String, default: "" }
  },
  emits: ["select-game", "retry"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t } = useI18n();
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$5, [
        createBaseVNode("div", _hoisted_2$5, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(props.games, (item) => {
            return openBlock(), createElementBlock("button", {
              key: item.id,
              class: normalizeClass(["gc-rank__game", { "gc-rank__game--active": item.id === props.selectedGameId }]),
              type: "button",
              "data-game-id": item.id,
              onClick: ($event) => emit("select-game", item.id)
            }, [
              createBaseVNode("span", _hoisted_4$5, toDisplayString(item.icon || "🎮"), 1),
              createBaseVNode("span", null, toDisplayString(item.name), 1)
            ], 10, _hoisted_3$5);
          }), 128))
        ]),
        props.errorMessage ? (openBlock(), createBlock(GameCenterNotice, {
          key: 0,
          tone: "warning",
          title: unref(t)("gameCenter.rank.loadFailed"),
          message: props.errorMessage,
          "action-text": unref(t)("gameCenter.rank.retry"),
          busy: props.loading,
          onAction: _cache[0] || (_cache[0] = ($event) => emit("retry"))
        }, null, 8, ["title", "message", "action-text", "busy"])) : createCommentVNode("", true),
        createBaseVNode("section", _hoisted_5$5, [
          createBaseVNode("header", _hoisted_6$5, [
            createBaseVNode("h3", _hoisted_7$5, toDisplayString(unref(t)("gameCenter.rank.classicTitle")), 1),
            createBaseVNode("span", _hoisted_8$4, toDisplayString(unref(t)("gameCenter.rank.classicSource")), 1)
          ]),
          props.loading ? (openBlock(), createElementBlock("p", _hoisted_9$4, toDisplayString(unref(t)("gameCenter.rank.loading")), 1)) : !props.classicBoard || !props.classicBoard.entries.length ? (openBlock(), createElementBlock("p", _hoisted_10$4, toDisplayString(unref(t)("gameCenter.rank.empty")), 1)) : (openBlock(), createElementBlock("ol", _hoisted_11$4, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(props.classicBoard.entries, (entry) => {
              return openBlock(), createElementBlock("li", {
                key: entry.key,
                class: normalizeClass(["gc-rank__row", { "gc-rank__row--self": entry.isSelf }])
              }, [
                createBaseVNode("span", _hoisted_12$4, toDisplayString(entry.rank), 1),
                createBaseVNode("span", _hoisted_13$4, toDisplayString(entry.playerName), 1),
                createBaseVNode("span", _hoisted_14$4, toDisplayString(entry.score), 1),
                entry.isSelf ? (openBlock(), createElementBlock("span", _hoisted_15$4, toDisplayString(unref(t)("gameCenter.rank.selfTag")), 1)) : createCommentVNode("", true)
              ], 2);
            }), 128))
          ])),
          createBaseVNode("p", _hoisted_16$4, toDisplayString(unref(t)("gameCenter.rank.piiNote")), 1)
        ]),
        createBaseVNode("section", _hoisted_17$4, [
          createBaseVNode("header", _hoisted_18$4, [
            createBaseVNode("h3", _hoisted_19$4, toDisplayString(unref(t)("gameCenter.rank.verifiedTitle")), 1)
          ]),
          !props.verifiedEnabled ? (openBlock(), createElementBlock("p", _hoisted_20$4, toDisplayString(unref(t)("gameCenter.rank.verifiedPlaceholder")), 1)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            props.verifiedError ? (openBlock(), createElementBlock("p", _hoisted_21$4, toDisplayString(props.verifiedError), 1)) : !props.verifiedBoard || !props.verifiedBoard.entries.length ? (openBlock(), createElementBlock("p", _hoisted_22$4, toDisplayString(unref(t)("gameCenter.rank.empty")), 1)) : (openBlock(), createElementBlock("ol", _hoisted_23$4, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(props.verifiedBoard.entries, (entry) => {
                return openBlock(), createElementBlock("li", {
                  key: entry.key,
                  class: "gc-rank__row"
                }, [
                  createBaseVNode("span", _hoisted_24$4, toDisplayString(entry.rank), 1),
                  createBaseVNode("span", _hoisted_25$4, toDisplayString(entry.playerName), 1),
                  createBaseVNode("span", _hoisted_26$4, toDisplayString(entry.score), 1)
                ]);
              }), 128))
            ])),
            createBaseVNode("p", _hoisted_27$3, toDisplayString(props.verifiedRewardEnabled ? unref(t)("gameCenter.rank.rewardSettled") : unref(t)("gameCenter.rank.rewardDisabled")), 1)
          ], 64))
        ])
      ]);
    };
  }
};
const GameCenterRankTab = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["__scopeId", "data-v-35e47811"]]);
const _hoisted_1$4 = { class: "gc-global-rank" };
const _hoisted_2$4 = {
  key: 2,
  class: "gc-card__hint"
};
const _hoisted_3$4 = {
  key: 3,
  class: "gc-card gc-card--me",
  "data-section": "global-rank-me"
};
const _hoisted_4$4 = { class: "gc-card__header" };
const _hoisted_5$4 = { class: "gc-card__title" };
const _hoisted_6$4 = { class: "gc-card__meta" };
const _hoisted_7$4 = { class: "gc-my-rank" };
const _hoisted_8$3 = { class: "gc-my-rank__pos" };
const _hoisted_9$3 = { class: "gc-my-rank__name" };
const _hoisted_10$3 = { class: "gc-my-rank__level" };
const _hoisted_11$3 = { class: "gc-my-rank__xp" };
const _hoisted_12$3 = {
  key: 4,
  class: "gc-card__note"
};
const _hoisted_13$3 = {
  key: 5,
  class: "gc-card",
  "data-section": "global-rank-list"
};
const _hoisted_14$3 = { class: "gc-card__header" };
const _hoisted_15$3 = { class: "gc-card__title" };
const _hoisted_16$3 = { class: "gc-card__meta" };
const _hoisted_17$3 = {
  key: 0,
  class: "gc-card__hint"
};
const _hoisted_18$3 = {
  key: 1,
  class: "gc-rank-list"
};
const _hoisted_19$3 = { class: "gc-rank-list__pos" };
const _hoisted_20$3 = { class: "gc-rank-list__name" };
const _hoisted_21$3 = { class: "gc-rank-list__level" };
const _hoisted_22$3 = { class: "gc-rank-list__xp" };
const _hoisted_23$3 = {
  key: 0,
  class: "gc-rank-list__tag"
};
const _hoisted_24$3 = ["disabled"];
const _hoisted_25$3 = {
  key: 4,
  class: "gc-card__note"
};
const _hoisted_26$3 = { class: "gc-global-rank__policy" };
const _sfc_main$4 = {
  __name: "GameCenterGlobalRankTab",
  props: {
    /** 远程配置下发的 API base（缺省走环境默认源） */
    apiBase: { type: String, default: "" },
    /** 榜单双闸门结果（game_verified_session_enabled && capabilities.leaderboards） */
    leaderboardsEnabled: { type: Boolean, default: false },
    /** 首屏分页大小（契约默认 50，上限由 points.ts 夹紧到 100） */
    pageSize: { type: Number, default: GLOBAL_RANK_DEFAULT_LIMIT }
  },
  setup(__props) {
    const props = __props;
    const { t } = useI18n();
    const board = ref(null);
    const loading = ref(false);
    const error = ref(null);
    const loadingMore = ref(false);
    const nextCursor = ref("");
    const toViewError = (error2) => ({
      code: String(error2?.code || ""),
      message: String(error2?.message || "").trim(),
      retryable: error2?.retryable === true
    });
    const errorText = computed(() => error.value?.message || t("gameCenter.globalRank.loadFailed"));
    const authError = computed(() => !!error.value && isPointsAuthError(error.value));
    const myRankText = computed(() => {
      const rank = Number(board.value?.me?.rank) || 0;
      return rank > 0 ? String(rank) : t("gameCenter.globalRank.notRanked");
    });
    const generatedAtText = computed(() => formatPointsTimestamp(board.value?.generatedAt));
    const loadBoard = async () => {
      if (!props.leaderboardsEnabled) {
        board.value = null;
        nextCursor.value = "";
        error.value = null;
        return;
      }
      loading.value = true;
      error.value = null;
      try {
        const page = await fetchGlobalXpLeaderboard({ apiBase: props.apiBase, limit: props.pageSize });
        if (!props.leaderboardsEnabled) return;
        board.value = page;
        nextCursor.value = page.nextCursor;
      } catch (caught) {
        if (!props.leaderboardsEnabled) return;
        board.value = null;
        nextCursor.value = "";
        error.value = toViewError(caught);
      } finally {
        loading.value = false;
      }
    };
    const loadMore = async () => {
      const cursor = nextCursor.value;
      if (!cursor || loadingMore.value || loading.value) return;
      loadingMore.value = true;
      error.value = null;
      try {
        const page = await fetchGlobalXpLeaderboard({
          apiBase: props.apiBase,
          limit: props.pageSize,
          cursor
        });
        if (!props.leaderboardsEnabled) return;
        board.value = {
          ...board.value || page,
          items: mergeGlobalRankRows(board.value?.items || [], page.items),
          me: page.me || board.value?.me || null,
          generatedAt: page.generatedAt || board.value?.generatedAt || "",
          ruleVersion: page.ruleVersion || board.value?.ruleVersion || ""
        };
        nextCursor.value = page.nextCursor;
      } catch (caught) {
        error.value = toViewError(caught);
      } finally {
        loadingMore.value = false;
      }
    };
    watch(
      () => props.leaderboardsEnabled,
      (enabled) => {
        if (enabled && !board.value && !loading.value) void loadBoard();
      }
    );
    onMounted(() => {
      void loadBoard();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$4, [
        !props.leaderboardsEnabled ? (openBlock(), createBlock(GameCenterNotice, {
          key: 0,
          tone: "info",
          title: unref(t)("gameCenter.globalRank.title"),
          message: unref(t)("gameCenter.globalRank.disabled")
        }, null, 8, ["title", "message"])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          authError.value ? (openBlock(), createBlock(GameCenterNotice, {
            key: 0,
            tone: "info",
            title: unref(t)("gameCenter.globalRank.loadFailed"),
            message: unref(t)("gameCenter.globalRank.signInHint")
          }, null, 8, ["title", "message"])) : error.value && !board.value ? (openBlock(), createBlock(GameCenterNotice, {
            key: 1,
            tone: "warning",
            title: unref(t)("gameCenter.globalRank.loadFailed"),
            message: errorText.value,
            "action-text": unref(t)("gameCenter.globalRank.retry"),
            busy: loading.value,
            onAction: loadBoard
          }, null, 8, ["title", "message", "action-text", "busy"])) : createCommentVNode("", true),
          loading.value && !board.value ? (openBlock(), createElementBlock("p", _hoisted_2$4, toDisplayString(unref(t)("gameCenter.globalRank.loading")), 1)) : createCommentVNode("", true),
          board.value && board.value.me ? (openBlock(), createElementBlock("section", _hoisted_3$4, [
            createBaseVNode("header", _hoisted_4$4, [
              createBaseVNode("h3", _hoisted_5$4, toDisplayString(unref(t)("gameCenter.globalRank.myRankTitle")), 1),
              createBaseVNode("span", _hoisted_6$4, toDisplayString(unref(t)("gameCenter.globalRank.metricName")), 1)
            ]),
            createBaseVNode("div", _hoisted_7$4, [
              createBaseVNode("span", _hoisted_8$3, toDisplayString(myRankText.value), 1),
              createBaseVNode("span", _hoisted_9$3, toDisplayString(board.value.me.displayName), 1),
              createBaseVNode("span", _hoisted_10$3, toDisplayString(unref(tf)("gameCenter.globalRank.levelLabel", { level: board.value.me.level })), 1),
              createBaseVNode("strong", _hoisted_11$3, toDisplayString(board.value.me.xpTotal), 1)
            ])
          ])) : board.value ? (openBlock(), createElementBlock("p", _hoisted_12$3, toDisplayString(unref(t)("gameCenter.globalRank.signInHint")), 1)) : createCommentVNode("", true),
          board.value ? (openBlock(), createElementBlock("section", _hoisted_13$3, [
            createBaseVNode("header", _hoisted_14$3, [
              createBaseVNode("h3", _hoisted_15$3, toDisplayString(unref(t)("gameCenter.globalRank.title")), 1),
              createBaseVNode("span", _hoisted_16$3, toDisplayString(unref(t)("gameCenter.globalRank.subtitle")), 1)
            ]),
            !board.value.items.length ? (openBlock(), createElementBlock("p", _hoisted_17$3, toDisplayString(unref(t)("gameCenter.globalRank.empty")), 1)) : (openBlock(), createElementBlock("ol", _hoisted_18$3, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(board.value.items, (row) => {
                return openBlock(), createElementBlock("li", {
                  key: row.playerRef || `rank-${row.rank}`,
                  class: normalizeClass(["gc-rank-list__row", { "gc-rank-list__row--self": row.isSelf }])
                }, [
                  createBaseVNode("span", _hoisted_19$3, toDisplayString(row.rank), 1),
                  createBaseVNode("span", _hoisted_20$3, toDisplayString(row.displayName), 1),
                  createBaseVNode("span", _hoisted_21$3, toDisplayString(unref(tf)("gameCenter.globalRank.levelLabel", { level: row.level })), 1),
                  createBaseVNode("span", _hoisted_22$3, toDisplayString(row.xpTotal), 1),
                  row.isSelf ? (openBlock(), createElementBlock("span", _hoisted_23$3, toDisplayString(unref(t)("gameCenter.globalRank.selfTag")), 1)) : createCommentVNode("", true)
                ], 2);
              }), 128))
            ])),
            error.value && board.value ? (openBlock(), createBlock(GameCenterNotice, {
              key: 2,
              tone: "warning",
              title: unref(t)("gameCenter.globalRank.loadFailed"),
              message: errorText.value,
              "action-text": unref(t)("gameCenter.globalRank.retry"),
              busy: loadingMore.value,
              onAction: loadMore
            }, null, 8, ["title", "message", "action-text", "busy"])) : createCommentVNode("", true),
            nextCursor.value ? (openBlock(), createElementBlock("button", {
              key: 3,
              class: "gc-global-rank__more",
              type: "button",
              disabled: loadingMore.value,
              onClick: loadMore
            }, toDisplayString(loadingMore.value ? unref(t)("gameCenter.globalRank.loadingMore") : unref(t)("gameCenter.globalRank.loadMore")), 9, _hoisted_24$3)) : createCommentVNode("", true),
            generatedAtText.value ? (openBlock(), createElementBlock("p", _hoisted_25$3, toDisplayString(unref(tf)("gameCenter.globalRank.generatedAt", { time: generatedAtText.value })), 1)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          createBaseVNode("p", _hoisted_26$3, toDisplayString(unref(t)("gameCenter.globalRank.piiNote")), 1)
        ], 64))
      ]);
    };
  }
};
const GameCenterGlobalRankTab = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-165b4a70"]]);
const _hoisted_1$3 = { class: "gc-points" };
const _hoisted_2$3 = {
  key: 2,
  class: "gc-card__hint"
};
const _hoisted_3$3 = {
  key: 3,
  class: "gc-card",
  "data-section": "points-overview"
};
const _hoisted_4$3 = { class: "gc-card__header" };
const _hoisted_5$3 = { class: "gc-card__title" };
const _hoisted_6$3 = { class: "gc-card__meta" };
const _hoisted_7$3 = { class: "gc-stat-grid" };
const _hoisted_8$2 = { class: "gc-stat" };
const _hoisted_9$2 = { class: "gc-stat__label" };
const _hoisted_10$2 = { class: "gc-stat__value" };
const _hoisted_11$2 = { class: "gc-stat" };
const _hoisted_12$2 = { class: "gc-stat__label" };
const _hoisted_13$2 = { class: "gc-stat__value" };
const _hoisted_14$2 = { class: "gc-stat" };
const _hoisted_15$2 = { class: "gc-stat__label" };
const _hoisted_16$2 = { class: "gc-stat__value" };
const _hoisted_17$2 = {
  class: "gc-progress",
  "data-role": "level-progress"
};
const _hoisted_18$2 = { class: "gc-progress__label" };
const _hoisted_19$2 = ["aria-label", "aria-valuenow"];
const _hoisted_20$2 = { class: "gc-progress__value" };
const _hoisted_21$2 = {
  key: 0,
  class: "gc-card__note"
};
const _hoisted_22$2 = {
  key: 1,
  class: "gc-card__note"
};
const _hoisted_23$2 = {
  key: 4,
  class: "gc-card",
  "data-section": "points-today"
};
const _hoisted_24$2 = { class: "gc-card__header" };
const _hoisted_25$2 = { class: "gc-card__title" };
const _hoisted_26$2 = {
  key: 0,
  class: "gc-card__meta"
};
const _hoisted_27$2 = { class: "gc-stat-grid" };
const _hoisted_28$2 = { class: "gc-stat" };
const _hoisted_29$2 = { class: "gc-stat__label" };
const _hoisted_30$2 = { class: "gc-stat__value" };
const _hoisted_31$2 = { class: "gc-stat" };
const _hoisted_32$1 = { class: "gc-stat__label" };
const _hoisted_33$1 = { class: "gc-stat__value" };
const _hoisted_34$1 = { class: "gc-stat" };
const _hoisted_35$1 = { class: "gc-stat__label" };
const _hoisted_36$1 = { class: "gc-stat__value" };
const _hoisted_37$1 = { class: "gc-points__caps" };
const _hoisted_38$1 = { class: "gc-points__cap" };
const _hoisted_39$1 = { class: "gc-points__cap" };
const _hoisted_40$1 = { class: "gc-points__cap" };
const _hoisted_41$1 = {
  key: 5,
  class: "gc-card",
  "data-section": "points-tasks"
};
const _hoisted_42$1 = { class: "gc-card__header" };
const _hoisted_43$1 = { class: "gc-card__title" };
const _hoisted_44 = {
  key: 0,
  class: "gc-card__meta"
};
const _hoisted_45 = {
  key: 0,
  class: "gc-card__hint"
};
const _hoisted_46 = {
  key: 1,
  class: "gc-card__hint"
};
const _hoisted_47 = {
  key: 3,
  class: "gc-card__hint"
};
const _hoisted_48 = {
  key: 4,
  class: "gc-task-list"
};
const _hoisted_49 = { class: "gc-task__head" };
const _hoisted_50 = { class: "gc-task__title" };
const _hoisted_51 = { class: "gc-task__status" };
const _hoisted_52 = { class: "gc-progress gc-progress--compact" };
const _hoisted_53 = ["aria-label", "aria-valuenow"];
const _hoisted_54 = { class: "gc-progress__value" };
const _hoisted_55 = { class: "gc-task__reward" };
const _hoisted_56 = { class: "gc-task__reward-label" };
const _hoisted_57 = { class: "gc-task__reward-value" };
const _hoisted_58 = { class: "gc-task__reward-value" };
const _hoisted_59 = {
  key: 5,
  class: "gc-card__hint"
};
const _hoisted_60 = {
  key: 6,
  class: "gc-card",
  "data-section": "points-ledger"
};
const _hoisted_61 = { class: "gc-card__header" };
const _hoisted_62 = { class: "gc-card__title" };
const _hoisted_63 = {
  key: 0,
  class: "gc-card__meta"
};
const _hoisted_64 = {
  key: 0,
  class: "gc-card__hint"
};
const _hoisted_65 = {
  key: 1,
  class: "gc-card__hint"
};
const _hoisted_66 = {
  key: 3,
  class: "gc-card__hint"
};
const _hoisted_67 = { class: "gc-ledger" };
const _hoisted_68 = { class: "gc-ledger__main" };
const _hoisted_69 = { class: "gc-ledger__reason" };
const _hoisted_70 = { class: "gc-ledger__type" };
const _hoisted_71 = { class: "gc-ledger__deltas" };
const _hoisted_72 = { class: "gc-ledger__time" };
const _hoisted_73 = ["disabled"];
const _hoisted_74 = { class: "gc-points__policy" };
const _sfc_main$3 = {
  __name: "GameCenterPointsTab",
  props: {
    /** 远程配置下发的 API base（缺省走环境默认源） */
    apiBase: { type: String, default: "" },
    /** 经济双闸门结果（game_economy_enabled && capabilities.wallet），由父级收敛 */
    walletEnabled: { type: Boolean, default: false },
    /** 每日任务双闸门结果（game_daily_tasks_enabled && capabilities.daily_tasks） */
    dailyTasksEnabled: { type: Boolean, default: false },
    /** 账本分页大小（契约默认 20，上限由 points.ts 夹紧到 100） */
    ledgerPageSize: { type: Number, default: LEDGER_DEFAULT_LIMIT }
  },
  setup(__props) {
    const props = __props;
    const { t } = useI18n();
    const wallet = ref(null);
    const walletLoading = ref(false);
    const walletError = ref(null);
    const tasks = ref(null);
    const tasksLoading = ref(false);
    const tasksError = ref(null);
    const ledgerItems = ref([]);
    const ledgerLoading = ref(false);
    const ledgerError = ref(null);
    const ledgerNextCursor = ref("");
    const ledgerLoadingMore = ref(false);
    const toViewError = (error) => ({
      code: String(error?.code || ""),
      message: String(error?.message || "").trim(),
      retryable: error?.retryable === true
    });
    const errorText = (error) => error?.message || t("gameCenter.points.loadFailed");
    const walletAuthError = computed(() => !!walletError.value && isPointsAuthError(walletError.value));
    const tasksAuthError = computed(() => !!tasksError.value && isPointsAuthError(tasksError.value));
    const tasksFeatureDisabled = computed(() => !!tasksError.value && isPointsFeatureDisabled(tasksError.value));
    const ledgerAuthError = computed(() => !!ledgerError.value && isPointsAuthError(ledgerError.value));
    const levelPercent = computed(() => wallet.value ? levelProgressPercent(wallet.value.levelCurve) : 0);
    const ledgerEmpty = computed(
      () => !ledgerLoading.value && !ledgerError.value && ledgerItems.value.length === 0
    );
    const loadWallet = async () => {
      if (!props.walletEnabled) {
        wallet.value = null;
        walletError.value = null;
        return;
      }
      walletLoading.value = true;
      walletError.value = null;
      try {
        const snapshot = await fetchPointsWallet({ apiBase: props.apiBase });
        if (!props.walletEnabled) return;
        wallet.value = snapshot;
      } catch (error) {
        if (!props.walletEnabled) return;
        wallet.value = null;
        walletError.value = toViewError(error);
      } finally {
        walletLoading.value = false;
      }
    };
    const loadTasks = async () => {
      if (!props.dailyTasksEnabled) {
        tasks.value = null;
        tasksError.value = null;
        return;
      }
      tasksLoading.value = true;
      tasksError.value = null;
      try {
        const snapshot = await fetchPointsDailyTasks({ apiBase: props.apiBase });
        if (!props.dailyTasksEnabled) return;
        tasks.value = snapshot;
      } catch (error) {
        if (!props.dailyTasksEnabled) return;
        tasks.value = null;
        tasksError.value = toViewError(error);
      } finally {
        tasksLoading.value = false;
      }
    };
    const loadLedger = async () => {
      if (!props.walletEnabled) {
        ledgerItems.value = [];
        ledgerNextCursor.value = "";
        ledgerError.value = null;
        return;
      }
      ledgerLoading.value = true;
      ledgerError.value = null;
      try {
        const page = await fetchPointsLedger({ apiBase: props.apiBase, limit: props.ledgerPageSize });
        if (!props.walletEnabled) return;
        ledgerItems.value = page.items;
        ledgerNextCursor.value = page.nextCursor;
      } catch (error) {
        if (!props.walletEnabled) return;
        ledgerItems.value = [];
        ledgerNextCursor.value = "";
        ledgerError.value = toViewError(error);
      } finally {
        ledgerLoading.value = false;
      }
    };
    const loadMoreLedger = async () => {
      const cursor = ledgerNextCursor.value;
      if (!cursor || ledgerLoadingMore.value || ledgerLoading.value) return;
      ledgerLoadingMore.value = true;
      ledgerError.value = null;
      try {
        const page = await fetchPointsLedger({
          apiBase: props.apiBase,
          limit: props.ledgerPageSize,
          cursor
        });
        ledgerItems.value = mergeLedgerEntries(ledgerItems.value, page.items);
        ledgerNextCursor.value = page.nextCursor;
      } catch (error) {
        ledgerError.value = toViewError(error);
      } finally {
        ledgerLoadingMore.value = false;
      }
    };
    const taskTitle = (task) => {
      const key = dailyTaskTitleI18nKey(task?.taskId);
      return key ? t(key) : String(task?.title || "").trim() || t("gameCenter.points.tasksTitle");
    };
    const taskRewardStatusText = (task) => {
      const key = rewardStatusI18nKey(task?.rewardStatus);
      return key ? t(key) : t("gameCenter.points.rewardNone");
    };
    const taskPercent = (task) => taskProgressPercent(task?.progress, task?.target);
    const reasonText = (entry) => {
      const key = ledgerReasonI18nKey(entry?.reasonCode);
      return key ? t(key) : t("gameCenter.points.reason.unknown");
    };
    const entryTypeText = (entry) => {
      const key = ledgerEntryTypeI18nKey(entry?.entryType);
      return key ? t(key) : t("gameCenter.points.entryType.unknown");
    };
    const deltaClass = (value) => {
      const num = Number(value) || 0;
      if (num > 0) return "is-positive";
      if (num < 0) return "is-negative";
      return "is-zero";
    };
    const capText = (cap) => cap === null || cap === void 0 ? t("gameCenter.points.capUnlimited") : String(cap);
    watch(
      () => [props.walletEnabled, props.dailyTasksEnabled],
      ([walletOn, tasksOn]) => {
        if (walletOn && !wallet.value && !walletLoading.value) void loadWallet();
        if (walletOn && !ledgerItems.value.length && !ledgerLoading.value && !ledgerError.value && !ledgerNextCursor.value) {
          void loadLedger();
        }
        if (tasksOn && !tasks.value && !tasksLoading.value) void loadTasks();
      }
    );
    onMounted(() => {
      void loadWallet();
      void loadTasks();
      void loadLedger();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$3, [
        !props.walletEnabled ? (openBlock(), createBlock(GameCenterNotice, {
          key: 0,
          tone: "info",
          title: unref(t)("gameCenter.points.title"),
          message: unref(t)("gameCenter.points.walletDisabled")
        }, null, 8, ["title", "message"])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          walletAuthError.value ? (openBlock(), createBlock(GameCenterNotice, {
            key: 0,
            tone: "info",
            title: unref(t)("gameCenter.points.loadFailed"),
            message: unref(t)("gameCenter.points.signInRequired")
          }, null, 8, ["title", "message"])) : walletError.value ? (openBlock(), createBlock(GameCenterNotice, {
            key: 1,
            tone: "warning",
            title: unref(t)("gameCenter.points.loadFailed"),
            message: errorText(walletError.value),
            "action-text": unref(t)("gameCenter.points.retry"),
            busy: walletLoading.value,
            onAction: loadWallet
          }, null, 8, ["title", "message", "action-text", "busy"])) : createCommentVNode("", true),
          walletLoading.value && !wallet.value ? (openBlock(), createElementBlock("p", _hoisted_2$3, toDisplayString(unref(t)("gameCenter.points.loading")), 1)) : createCommentVNode("", true),
          wallet.value ? (openBlock(), createElementBlock("section", _hoisted_3$3, [
            createBaseVNode("header", _hoisted_4$3, [
              createBaseVNode("h3", _hoisted_5$3, toDisplayString(unref(t)("gameCenter.points.title")), 1),
              createBaseVNode("span", _hoisted_6$3, toDisplayString(unref(t)("gameCenter.points.totalXp")), 1)
            ]),
            createBaseVNode("div", _hoisted_7$3, [
              createBaseVNode("div", _hoisted_8$2, [
                createBaseVNode("span", _hoisted_9$2, toDisplayString(unref(t)("gameCenter.points.level")), 1),
                createBaseVNode("strong", _hoisted_10$2, "Lv." + toDisplayString(wallet.value.level), 1)
              ]),
              createBaseVNode("div", _hoisted_11$2, [
                createBaseVNode("span", _hoisted_12$2, toDisplayString(unref(t)("gameCenter.points.totalXp")), 1),
                createBaseVNode("strong", _hoisted_13$2, toDisplayString(wallet.value.xpTotal), 1)
              ]),
              createBaseVNode("div", _hoisted_14$2, [
                createBaseVNode("span", _hoisted_15$2, toDisplayString(unref(t)("gameCenter.points.coins")), 1),
                createBaseVNode("strong", _hoisted_16$2, toDisplayString(wallet.value.coinBalance), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_17$2, [
              createBaseVNode("span", _hoisted_18$2, toDisplayString(unref(t)("gameCenter.points.levelProgress")), 1),
              createBaseVNode("div", {
                class: "gc-progress__track",
                role: "progressbar",
                "aria-label": unref(t)("gameCenter.points.levelProgress"),
                "aria-valuemin": "0",
                "aria-valuemax": "100",
                "aria-valuenow": levelPercent.value
              }, [
                createBaseVNode("div", {
                  class: "gc-progress__fill",
                  style: normalizeStyle({ width: `${levelPercent.value}%` })
                }, null, 4)
              ], 8, _hoisted_19$2),
              createBaseVNode("span", _hoisted_20$2, toDisplayString(unref(tf)("gameCenter.points.xpProgressValue", { into: wallet.value.levelCurve.xpIntoLevel, span: wallet.value.levelCurve.xpSpan })), 1)
            ]),
            wallet.value.levelCurve.xpForNext > 0 ? (openBlock(), createElementBlock("p", _hoisted_21$2, toDisplayString(unref(tf)("gameCenter.points.xpForNextValue", { n: wallet.value.levelCurve.xpForNext })), 1)) : createCommentVNode("", true),
            !wallet.value.economyEnabled ? (openBlock(), createElementBlock("p", _hoisted_22$2, toDisplayString(unref(t)("gameCenter.points.walletDisabled")), 1)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          wallet.value ? (openBlock(), createElementBlock("section", _hoisted_23$2, [
            createBaseVNode("header", _hoisted_24$2, [
              createBaseVNode("h3", _hoisted_25$2, toDisplayString(unref(t)("gameCenter.points.todayTitle")), 1),
              wallet.value.today.date ? (openBlock(), createElementBlock("span", _hoisted_26$2, toDisplayString(wallet.value.today.date), 1)) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_27$2, [
              createBaseVNode("div", _hoisted_28$2, [
                createBaseVNode("span", _hoisted_29$2, toDisplayString(unref(t)("gameCenter.points.todayXp")), 1),
                createBaseVNode("strong", _hoisted_30$2, toDisplayString(wallet.value.today.xpGained), 1)
              ]),
              createBaseVNode("div", _hoisted_31$2, [
                createBaseVNode("span", _hoisted_32$1, toDisplayString(unref(t)("gameCenter.points.todayCoins")), 1),
                createBaseVNode("strong", _hoisted_33$1, toDisplayString(wallet.value.today.coinGained), 1)
              ]),
              createBaseVNode("div", _hoisted_34$1, [
                createBaseVNode("span", _hoisted_35$1, toDisplayString(unref(t)("gameCenter.points.todayRuns")), 1),
                createBaseVNode("strong", _hoisted_36$1, toDisplayString(wallet.value.today.runCount), 1)
              ])
            ]),
            createBaseVNode("dl", _hoisted_37$1, [
              createBaseVNode("div", _hoisted_38$1, [
                createBaseVNode("dt", null, toDisplayString(unref(t)("gameCenter.points.capXp")), 1),
                createBaseVNode("dd", null, toDisplayString(capText(wallet.value.dailyCaps.xpCap)), 1)
              ]),
              createBaseVNode("div", _hoisted_39$1, [
                createBaseVNode("dt", null, toDisplayString(unref(t)("gameCenter.points.capCoins")), 1),
                createBaseVNode("dd", null, toDisplayString(capText(wallet.value.dailyCaps.coinCap)), 1)
              ]),
              createBaseVNode("div", _hoisted_40$1, [
                createBaseVNode("dt", null, toDisplayString(unref(t)("gameCenter.points.capRuns")), 1),
                createBaseVNode("dd", null, toDisplayString(capText(wallet.value.dailyCaps.runCap)), 1)
              ])
            ])
          ])) : createCommentVNode("", true),
          props.dailyTasksEnabled ? (openBlock(), createElementBlock("section", _hoisted_41$1, [
            createBaseVNode("header", _hoisted_42$1, [
              createBaseVNode("h3", _hoisted_43$1, toDisplayString(unref(t)("gameCenter.points.tasksTitle")), 1),
              tasks.value && tasks.value.date ? (openBlock(), createElementBlock("span", _hoisted_44, toDisplayString(tasks.value.date), 1)) : createCommentVNode("", true)
            ]),
            tasksFeatureDisabled.value ? (openBlock(), createElementBlock("p", _hoisted_45, toDisplayString(unref(t)("gameCenter.points.tasksDisabled")), 1)) : tasksAuthError.value ? (openBlock(), createElementBlock("p", _hoisted_46, toDisplayString(unref(t)("gameCenter.points.signInRequired")), 1)) : tasksError.value ? (openBlock(), createBlock(GameCenterNotice, {
              key: 2,
              tone: "warning",
              title: unref(t)("gameCenter.points.loadFailed"),
              message: errorText(tasksError.value),
              "action-text": unref(t)("gameCenter.points.retry"),
              busy: tasksLoading.value,
              onAction: loadTasks
            }, null, 8, ["title", "message", "action-text", "busy"])) : tasksLoading.value && !tasks.value ? (openBlock(), createElementBlock("p", _hoisted_47, toDisplayString(unref(t)("gameCenter.points.loading")), 1)) : tasks.value && tasks.value.tasks.length ? (openBlock(), createElementBlock("ul", _hoisted_48, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(tasks.value.tasks, (task) => {
                return openBlock(), createElementBlock("li", {
                  key: task.taskId,
                  class: normalizeClass(["gc-task", { "gc-task--done": task.completed }])
                }, [
                  createBaseVNode("div", _hoisted_49, [
                    createBaseVNode("span", _hoisted_50, toDisplayString(taskTitle(task)), 1),
                    createBaseVNode("span", _hoisted_51, toDisplayString(taskRewardStatusText(task)), 1)
                  ]),
                  createBaseVNode("div", _hoisted_52, [
                    createBaseVNode("div", {
                      class: "gc-progress__track",
                      role: "progressbar",
                      "aria-label": taskTitle(task),
                      "aria-valuemin": "0",
                      "aria-valuemax": "100",
                      "aria-valuenow": taskPercent(task)
                    }, [
                      createBaseVNode("div", {
                        class: "gc-progress__fill",
                        style: normalizeStyle({ width: `${taskPercent(task)}%` })
                      }, null, 4)
                    ], 8, _hoisted_53),
                    createBaseVNode("span", _hoisted_54, toDisplayString(unref(tf)("gameCenter.points.taskProgressValue", { progress: task.progress, target: task.target })), 1)
                  ]),
                  createBaseVNode("div", _hoisted_55, [
                    createBaseVNode("span", _hoisted_56, toDisplayString(unref(t)("gameCenter.points.taskReward")), 1),
                    createBaseVNode("span", _hoisted_57, "+" + toDisplayString(task.rewardXp) + " XP", 1),
                    createBaseVNode("span", _hoisted_58, "+" + toDisplayString(task.rewardCoin) + " " + toDisplayString(unref(t)("gameCenter.points.coins")), 1)
                  ])
                ], 2);
              }), 128))
            ])) : tasks.value ? (openBlock(), createElementBlock("p", _hoisted_59, toDisplayString(unref(t)("gameCenter.points.tasksEmpty")), 1)) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          wallet.value ? (openBlock(), createElementBlock("section", _hoisted_60, [
            createBaseVNode("header", _hoisted_61, [
              createBaseVNode("h3", _hoisted_62, toDisplayString(unref(t)("gameCenter.points.ledgerTitle")), 1),
              ledgerItems.value.length ? (openBlock(), createElementBlock("span", _hoisted_63, toDisplayString(unref(tf)("gameCenter.points.ledgerCount", { n: ledgerItems.value.length })), 1)) : createCommentVNode("", true)
            ]),
            ledgerLoading.value && !ledgerItems.value.length ? (openBlock(), createElementBlock("p", _hoisted_64, toDisplayString(unref(t)("gameCenter.points.loading")), 1)) : ledgerAuthError.value ? (openBlock(), createElementBlock("p", _hoisted_65, toDisplayString(unref(t)("gameCenter.points.signInRequired")), 1)) : ledgerError.value && !ledgerItems.value.length ? (openBlock(), createBlock(GameCenterNotice, {
              key: 2,
              tone: "warning",
              title: unref(t)("gameCenter.points.loadFailed"),
              message: errorText(ledgerError.value),
              "action-text": unref(t)("gameCenter.points.retry"),
              busy: ledgerLoading.value,
              onAction: loadLedger
            }, null, 8, ["title", "message", "action-text", "busy"])) : ledgerEmpty.value ? (openBlock(), createElementBlock("p", _hoisted_66, toDisplayString(unref(t)("gameCenter.points.ledgerEmpty")), 1)) : (openBlock(), createElementBlock(Fragment, { key: 4 }, [
              createBaseVNode("ul", _hoisted_67, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(ledgerItems.value, (entry) => {
                  return openBlock(), createElementBlock("li", {
                    key: entry.key,
                    class: "gc-ledger__row"
                  }, [
                    createBaseVNode("div", _hoisted_68, [
                      createBaseVNode("span", _hoisted_69, toDisplayString(reasonText(entry)), 1),
                      createBaseVNode("span", _hoisted_70, toDisplayString(entryTypeText(entry)), 1)
                    ]),
                    createBaseVNode("div", _hoisted_71, [
                      createBaseVNode("span", {
                        class: normalizeClass(["gc-ledger__delta", deltaClass(entry.xpDelta)])
                      }, toDisplayString(unref(formatDelta)(entry.xpDelta)) + " XP ", 3),
                      createBaseVNode("span", {
                        class: normalizeClass(["gc-ledger__delta", deltaClass(entry.coinDelta)])
                      }, toDisplayString(unref(formatDelta)(entry.coinDelta)) + " " + toDisplayString(unref(t)("gameCenter.points.coins")), 3)
                    ]),
                    createBaseVNode("span", _hoisted_72, toDisplayString(unref(formatPointsTimestamp)(entry.createdAt)), 1)
                  ]);
                }), 128))
              ]),
              ledgerError.value ? (openBlock(), createBlock(GameCenterNotice, {
                key: 0,
                tone: "warning",
                title: unref(t)("gameCenter.points.loadFailed"),
                message: errorText(ledgerError.value),
                "action-text": unref(t)("gameCenter.points.retry"),
                busy: ledgerLoadingMore.value,
                onAction: loadMoreLedger
              }, null, 8, ["title", "message", "action-text", "busy"])) : createCommentVNode("", true),
              ledgerNextCursor.value ? (openBlock(), createElementBlock("button", {
                key: 1,
                class: "gc-points__more",
                type: "button",
                disabled: ledgerLoadingMore.value,
                onClick: loadMoreLedger
              }, toDisplayString(ledgerLoadingMore.value ? unref(t)("gameCenter.points.ledgerLoadingMore") : unref(t)("gameCenter.points.ledgerLoadMore")), 9, _hoisted_73)) : createCommentVNode("", true)
            ], 64))
          ])) : createCommentVNode("", true),
          createBaseVNode("p", _hoisted_74, toDisplayString(unref(t)("gameCenter.points.piiNote")), 1)
        ], 64))
      ]);
    };
  }
};
const GameCenterPointsTab = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-88094012"]]);
const _hoisted_1$2 = {
  class: "gc-drift",
  "data-section": "drift-bottle"
};
const _hoisted_2$2 = { class: "gc-drift__intro" };
const _hoisted_3$2 = { class: "gc-drift__card" };
const _hoisted_4$2 = { class: "gc-drift__card-header" };
const _hoisted_5$2 = { class: "gc-drift__card-title" };
const _hoisted_6$2 = ["disabled"];
const _hoisted_7$2 = {
  key: 2,
  class: "gc-drift__bottle",
  "data-section": "bottle-card"
};
const _hoisted_8$1 = { class: "gc-drift__bottle-meta" };
const _hoisted_9$1 = { class: "gc-drift__from" };
const _hoisted_10$1 = {
  key: 0,
  class: "gc-drift__badge"
};
const _hoisted_11$1 = {
  key: 1,
  class: "gc-drift__badge gc-drift__badge--coin"
};
const _hoisted_12$1 = {
  key: 2,
  class: "gc-drift__badge"
};
const _hoisted_13$1 = { class: "gc-drift__text" };
const _hoisted_14$1 = {
  key: 0,
  class: "gc-drift__meta"
};
const _hoisted_15$1 = {
  key: 0,
  class: "gc-drift__hint"
};
const _hoisted_16$1 = ["disabled"];
const _hoisted_17$1 = { class: "gc-drift__actions" };
const _hoisted_18$1 = ["disabled"];
const _hoisted_19$1 = ["disabled"];
const _hoisted_20$1 = {
  key: 3,
  class: "gc-drift__report"
};
const _hoisted_21$1 = { class: "gc-drift__report-label" };
const _hoisted_22$1 = { class: "gc-drift__reasons" };
const _hoisted_23$1 = ["value"];
const _hoisted_24$1 = ["maxlength", "placeholder"];
const _hoisted_25$1 = ["disabled"];
const _hoisted_26$1 = {
  key: 0,
  class: "gc-drift__error"
};
const _hoisted_27$1 = {
  key: 4,
  class: "gc-drift__success",
  role: "status"
};
const _hoisted_28$1 = { class: "gc-drift__card" };
const _hoisted_29$1 = { class: "gc-drift__card-header" };
const _hoisted_30$1 = { class: "gc-drift__card-title" };
const _hoisted_31$1 = {
  class: "gc-drift__modes",
  role: "tablist"
};
const _hoisted_32 = ["aria-selected", "data-mode", "onClick"];
const _hoisted_33 = ["maxlength", "placeholder"];
const _hoisted_34 = { class: "gc-drift__counter" };
const _hoisted_35 = {
  class: "gc-drift__field-label",
  for: "drift-coin-amount"
};
const _hoisted_36 = ["placeholder"];
const _hoisted_37 = { class: "gc-drift__note" };
const _hoisted_38 = {
  key: 1,
  class: "gc-drift__note"
};
const _hoisted_39 = {
  key: 2,
  class: "gc-drift__error"
};
const _hoisted_40 = {
  key: 3,
  class: "gc-drift__error"
};
const _hoisted_41 = {
  key: 4,
  class: "gc-drift__error"
};
const _hoisted_42 = ["disabled"];
const _hoisted_43 = { class: "gc-drift__policy" };
const _sfc_main$2 = {
  __name: "GameCenterDriftTab",
  props: {
    /**
     * 可选：`GameCenterView` 下发的远程 API base（`flags.api_base`）。
     * 缺省（''）时 `drift.ts` 走环境派生默认源，与其它 Tab 的缺省行为一致。
     */
    apiBase: { type: String, default: "" }
  },
  setup(__props) {
    const props = __props;
    const { t, locale } = useI18n();
    const requestOptions = computed(() => props.apiBase ? { apiBase: props.apiBase } : {});
    const ugcAllowed = getFeaturePolicy().userGeneratedContent;
    const sessionState = ref(ugcAllowed ? "checking" : "blocked");
    const drawBusy = ref(false);
    const drawState = ref("idle");
    const currentBottle = ref(null);
    const drawError = ref("");
    const claimBusy = ref(false);
    const claimState = ref("idle");
    const claimResult = ref(null);
    const claimError = ref("");
    const moderateBusy = ref(false);
    const reportOpen = ref(false);
    const reportReason = ref(DRIFT_REPORT_REASONS[0]);
    const reportDetail = ref("");
    const reportDone = ref(false);
    const reportError = ref("");
    const actionMessage = ref("");
    const publishMode = ref("text");
    const publishText = ref("");
    const coinInput = ref("");
    const publishBusy = ref(false);
    const publishError = ref("");
    const publishSubmitError = ref("");
    const publishedBottle = ref(null);
    const publishKey = ref("");
    const textLength = computed(() => validateDriftText(publishText.value).length);
    const textValidation = computed(() => validateDriftText(publishText.value));
    const coinValidation = computed(() => validateDriftCoinAmount(coinInput.value));
    const fieldErrorKey = computed(() => {
      if (textValidation.value.reason === "tooLong") return "gameCenter.drift.validate.textTooLong";
      if (publishMode.value === "coin" && coinValidation.value.reason) {
        switch (coinValidation.value.reason) {
          case "notInteger":
            return "gameCenter.drift.validate.coinNotInteger";
          case "tooLarge":
            return "gameCenter.drift.validate.coinTooLarge";
          default:
            return "gameCenter.drift.validate.coinNotPositive";
        }
      }
      return "";
    });
    const canPublish = computed(() => {
      if (!textValidation.value.ok) return false;
      if (publishMode.value !== "coin") return true;
      return coinValidation.value.ok && coinValidation.value.value >= 1;
    });
    const senderLabel = computed(() => {
      void locale.value;
      const bottle = currentBottle.value;
      if (!bottle) return "";
      return tf("gameCenter.drift.bottle.from", {
        name: bottle.senderLabel || t("gameCenter.drift.bottle.anonymous")
      });
    });
    const coinBadgeLabel = computed(() => {
      void locale.value;
      const bottle = currentBottle.value;
      if (!bottle || bottle.coinAmount <= 0) return "";
      return tf("gameCenter.drift.bottle.coinBadge", { n: bottle.coinAmount });
    });
    const expiresLabel = computed(() => {
      void locale.value;
      const bottle = currentBottle.value;
      const raw = String(bottle?.expiresAt || "");
      if (!raw) return "";
      const parsed = new Date(raw);
      const display = Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString();
      return tf("gameCenter.drift.bottle.expiresAt", { time: display });
    });
    const claimSummary = computed(() => {
      void locale.value;
      const result = claimResult.value;
      if (!result) return "";
      if (result.coinAmount > 0) {
        return tf("gameCenter.drift.claim.credited", { n: result.coinAmount });
      }
      return t("gameCenter.drift.claim.success");
    });
    const counterLabel = computed(() => {
      void locale.value;
      return tf("gameCenter.drift.publish.counter", { n: textLength.value, max: DRIFT_TEXT_MAX_LENGTH });
    });
    const isInsufficientBalanceCode = (code) => /INSUFFICIENT|BALANCE/i.test(String(code || ""));
    const presentError = (error) => {
      const code = error instanceof GamePlatformError ? error.code : "";
      const serverMessage = String(error?.message || "").trim();
      let key = "";
      switch (code) {
        case DRIFT_ERROR_CODES.poolEmpty:
          key = "gameCenter.drift.error.poolEmpty";
          break;
        case DRIFT_ERROR_CODES.selfClaim:
          key = "gameCenter.drift.error.selfClaim";
          break;
        case DRIFT_ERROR_CODES.alreadyClaimed:
          key = "gameCenter.drift.error.alreadyClaimed";
          break;
        case DRIFT_ERROR_CODES.expired:
          key = "gameCenter.drift.error.expired";
          break;
        case DRIFT_ERROR_CODES.notFound:
          key = "gameCenter.drift.error.notFound";
          break;
        case DRIFT_ERROR_CODES.rateLimited:
          key = "gameCenter.drift.error.rateLimited";
          break;
        case DRIFT_ERROR_CODES.dailyLimitExceeded:
          key = "gameCenter.drift.error.dailyLimit";
          break;
        case DRIFT_ERROR_CODES.textInvalid:
          key = "gameCenter.drift.error.textInvalid";
          break;
        case LOCAL_ERROR_CODES.authMissing:
          key = "gameCenter.drift.error.unauthenticated";
          break;
        case LOCAL_ERROR_CODES.configMissing:
        case LOCAL_ERROR_CODES.transportInsecure:
          key = "gameCenter.drift.error.serviceUnavailable";
          break;
        default:
          key = isInsufficientBalanceCode(code) ? "gameCenter.drift.error.insufficientBalance" : "";
      }
      return {
        code,
        signedOut: code === LOCAL_ERROR_CODES.authMissing,
        message: key ? t(key) : serverMessage || t("gameCenter.drift.error.unknown")
      };
    };
    const refreshSession = async () => {
      sessionState.value = "checking";
      try {
        const token = await getIdentityAccessToken();
        sessionState.value = token ? "ready" : "signedOut";
      } catch {
        sessionState.value = "signedOut";
      }
    };
    const resetBottleArea = () => {
      claimState.value = "idle";
      claimResult.value = null;
      claimError.value = "";
      reportOpen.value = false;
      reportDone.value = false;
      reportDetail.value = "";
      reportError.value = "";
      actionMessage.value = "";
    };
    const handleDraw = async () => {
      if (drawBusy.value || sessionState.value !== "ready") return;
      drawBusy.value = true;
      drawError.value = "";
      resetBottleArea();
      try {
        currentBottle.value = await drawRandomDriftBottle({ ...requestOptions.value });
        drawState.value = "ready";
      } catch (error) {
        currentBottle.value = null;
        const present = presentError(error);
        if (present.code === DRIFT_ERROR_CODES.poolEmpty) {
          drawState.value = "empty";
        } else {
          if (present.signedOut) sessionState.value = "signedOut";
          drawState.value = "error";
          drawError.value = present.message;
        }
      } finally {
        drawBusy.value = false;
      }
    };
    const handleClaim = async () => {
      const bottle = currentBottle.value;
      if (!bottle || claimBusy.value || claimState.value === "claimed") return;
      claimBusy.value = true;
      claimError.value = "";
      try {
        claimResult.value = await claimDriftBottle(bottle.bottleId, { ...requestOptions.value });
        claimState.value = "claimed";
      } catch (error) {
        const present = presentError(error);
        if (present.signedOut) sessionState.value = "signedOut";
        claimError.value = present.message;
      } finally {
        claimBusy.value = false;
      }
    };
    const toggleReport = () => {
      reportOpen.value = !reportOpen.value;
      reportError.value = "";
    };
    const handleReport = async () => {
      const bottle = currentBottle.value;
      if (!bottle || moderateBusy.value || reportDone.value) return;
      moderateBusy.value = true;
      reportError.value = "";
      try {
        await reportDriftBottle(bottle.bottleId, {
          reason: reportReason.value,
          detail: reportDetail.value,
          ...requestOptions.value
        });
        reportDone.value = true;
        reportOpen.value = false;
        actionMessage.value = t("gameCenter.drift.report.success");
      } catch (error) {
        const present = presentError(error);
        if (present.signedOut) sessionState.value = "signedOut";
        reportError.value = present.message;
      } finally {
        moderateBusy.value = false;
      }
    };
    const handleHide = async () => {
      const bottle = currentBottle.value;
      if (!bottle || moderateBusy.value) return;
      moderateBusy.value = true;
      reportError.value = "";
      try {
        await hideDriftBottle(bottle.bottleId, { ...requestOptions.value });
        currentBottle.value = null;
        drawState.value = "idle";
        resetBottleArea();
        actionMessage.value = t("gameCenter.drift.hide.success");
      } catch (error) {
        const present = presentError(error);
        if (present.signedOut) sessionState.value = "signedOut";
        reportError.value = present.message;
      } finally {
        moderateBusy.value = false;
      }
    };
    const handlePublish = async () => {
      if (publishBusy.value) return;
      publishError.value = "";
      publishSubmitError.value = "";
      const textCheck = validateDriftText(publishText.value);
      if (!textCheck.ok) {
        publishSubmitError.value = t(
          textCheck.reason === "empty" ? "gameCenter.drift.validate.textEmpty" : "gameCenter.drift.validate.textTooLong"
        );
        return;
      }
      let coinAmount = 0;
      if (publishMode.value === "coin") {
        const coinCheck = validateDriftCoinAmount(coinInput.value);
        if (!coinCheck.ok || coinCheck.value < 1) {
          const reason = coinCheck.reason || "notPositive";
          publishSubmitError.value = t(
            reason === "notInteger" ? "gameCenter.drift.validate.coinNotInteger" : reason === "tooLarge" ? "gameCenter.drift.validate.coinTooLarge" : "gameCenter.drift.validate.coinNotPositive"
          );
          return;
        }
        coinAmount = coinCheck.value;
      }
      if (!publishKey.value) publishKey.value = createIdempotencyKey();
      publishBusy.value = true;
      try {
        publishedBottle.value = await publishDriftBottle({
          text: publishText.value,
          coinAmount,
          clientRequestId: publishKey.value
        });
        publishText.value = "";
        coinInput.value = "";
        publishKey.value = "";
      } catch (error) {
        const present = presentError(error);
        if (present.signedOut) sessionState.value = "signedOut";
        publishError.value = present.message;
      } finally {
        publishBusy.value = false;
      }
    };
    const resetPublished = () => {
      publishedBottle.value = null;
    };
    watch([publishText, coinInput, publishMode], () => {
      publishKey.value = "";
    });
    onMounted(() => {
      if (ugcAllowed) void refreshSession();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$2, [
        createBaseVNode("p", _hoisted_2$2, toDisplayString(unref(t)("gameCenter.drift.subtitle")), 1),
        !unref(ugcAllowed) ? (openBlock(), createBlock(GameCenterNotice, {
          key: 0,
          tone: "warning",
          title: unref(t)("gameCenter.drift.policyDisabledTitle"),
          message: unref(t)("gameCenter.drift.policyDisabledBody")
        }, null, 8, ["title", "message"])) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          sessionState.value === "checking" ? (openBlock(), createBlock(GameCenterNotice, {
            key: 0,
            tone: "info",
            message: unref(t)("gameCenter.drift.session.checking")
          }, null, 8, ["message"])) : sessionState.value === "signedOut" ? (openBlock(), createBlock(GameCenterNotice, {
            key: 1,
            tone: "warning",
            title: unref(t)("gameCenter.drift.guestTitle"),
            message: unref(t)("gameCenter.drift.guestBody"),
            "action-text": unref(t)("gameCenter.drift.retry"),
            onAction: refreshSession
          }, null, 8, ["title", "message", "action-text"])) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
            createBaseVNode("section", _hoisted_3$2, [
              createBaseVNode("header", _hoisted_4$2, [
                createBaseVNode("h3", _hoisted_5$2, toDisplayString(unref(t)("gameCenter.drift.draw.title")), 1)
              ]),
              createBaseVNode("button", {
                class: "gc-drift__primary",
                type: "button",
                "data-action": "draw",
                disabled: drawBusy.value,
                onClick: handleDraw
              }, toDisplayString(drawBusy.value ? unref(t)("gameCenter.drift.draw.busy") : unref(t)("gameCenter.drift.draw.action")), 9, _hoisted_6$2),
              drawState.value === "empty" ? (openBlock(), createBlock(GameCenterNotice, {
                key: 0,
                tone: "info",
                title: unref(t)("gameCenter.drift.draw.emptyTitle"),
                message: unref(t)("gameCenter.drift.draw.emptyBody"),
                "action-text": unref(t)("gameCenter.drift.draw.again"),
                busy: drawBusy.value,
                onAction: handleDraw
              }, null, 8, ["title", "message", "action-text", "busy"])) : drawState.value === "error" && drawError.value ? (openBlock(), createBlock(GameCenterNotice, {
                key: 1,
                tone: "danger",
                title: unref(t)("gameCenter.drift.error.title"),
                message: drawError.value,
                "action-text": unref(t)("gameCenter.drift.retry"),
                busy: drawBusy.value,
                onAction: handleDraw
              }, null, 8, ["title", "message", "action-text", "busy"])) : createCommentVNode("", true),
              currentBottle.value ? (openBlock(), createElementBlock("article", _hoisted_7$2, [
                createBaseVNode("header", _hoisted_8$1, [
                  createBaseVNode("span", _hoisted_9$1, toDisplayString(senderLabel.value), 1),
                  currentBottle.value.isMine ? (openBlock(), createElementBlock("span", _hoisted_10$1, toDisplayString(unref(t)("gameCenter.drift.bottle.mineBadge")), 1)) : createCommentVNode("", true),
                  currentBottle.value.coinAmount > 0 ? (openBlock(), createElementBlock("span", _hoisted_11$1, toDisplayString(coinBadgeLabel.value), 1)) : (openBlock(), createElementBlock("span", _hoisted_12$1, toDisplayString(unref(t)("gameCenter.drift.bottle.textOnlyBadge")), 1))
                ]),
                createBaseVNode("p", _hoisted_13$1, toDisplayString(currentBottle.value.text), 1),
                expiresLabel.value ? (openBlock(), createElementBlock("p", _hoisted_14$1, toDisplayString(expiresLabel.value), 1)) : createCommentVNode("", true),
                claimState.value === "claimed" ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                  createVNode(GameCenterNotice, {
                    tone: "info",
                    message: claimSummary.value
                  }, null, 8, ["message"]),
                  createBaseVNode("button", {
                    class: "gc-drift__primary",
                    type: "button",
                    "data-action": "draw-again",
                    onClick: handleDraw
                  }, toDisplayString(unref(t)("gameCenter.drift.claim.again")), 1)
                ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                  currentBottle.value.isMine ? (openBlock(), createElementBlock("p", _hoisted_15$1, toDisplayString(unref(t)("gameCenter.drift.bottle.mineClaimNote")), 1)) : (openBlock(), createElementBlock("button", {
                    key: 1,
                    class: "gc-drift__primary",
                    type: "button",
                    "data-action": "claim",
                    disabled: claimBusy.value,
                    onClick: handleClaim
                  }, toDisplayString(claimBusy.value ? unref(t)("gameCenter.drift.claim.busy") : currentBottle.value.coinAmount > 0 ? unref(t)("gameCenter.drift.claim.redeem") : unref(t)("gameCenter.drift.claim.action")), 9, _hoisted_16$1)),
                  claimError.value ? (openBlock(), createBlock(GameCenterNotice, {
                    key: 2,
                    tone: "danger",
                    message: claimError.value,
                    "action-text": unref(t)("gameCenter.drift.draw.again"),
                    onAction: handleDraw
                  }, null, 8, ["message", "action-text"])) : createCommentVNode("", true)
                ], 64)),
                createBaseVNode("div", _hoisted_17$1, [
                  createBaseVNode("button", {
                    class: "gc-drift__ghost",
                    type: "button",
                    "data-action": "report-toggle",
                    disabled: moderateBusy.value || reportDone.value,
                    onClick: toggleReport
                  }, toDisplayString(reportOpen.value ? unref(t)("gameCenter.drift.report.cancel") : unref(t)("gameCenter.drift.report.action")), 9, _hoisted_18$1),
                  createBaseVNode("button", {
                    class: "gc-drift__ghost",
                    type: "button",
                    "data-action": "hide",
                    disabled: moderateBusy.value,
                    onClick: handleHide
                  }, toDisplayString(unref(t)("gameCenter.drift.hide.action")), 9, _hoisted_19$1)
                ]),
                reportOpen.value ? (openBlock(), createElementBlock("div", _hoisted_20$1, [
                  createBaseVNode("span", _hoisted_21$1, toDisplayString(unref(t)("gameCenter.drift.report.reasonLabel")), 1),
                  createBaseVNode("div", _hoisted_22$1, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(unref(DRIFT_REPORT_REASONS), (reason) => {
                      return openBlock(), createElementBlock("label", {
                        key: reason,
                        class: "gc-drift__reason"
                      }, [
                        withDirectives(createBaseVNode("input", {
                          "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => reportReason.value = $event),
                          type: "radio",
                          name: "drift-report-reason",
                          value: reason
                        }, null, 8, _hoisted_23$1), [
                          [vModelRadio, reportReason.value]
                        ]),
                        createBaseVNode("span", null, toDisplayString(unref(t)(`gameCenter.drift.report.reason.${reason}`)), 1)
                      ]);
                    }), 128))
                  ]),
                  withDirectives(createBaseVNode("textarea", {
                    "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => reportDetail.value = $event),
                    class: "gc-drift__detail",
                    maxlength: unref(DRIFT_REPORT_DETAIL_MAX_LENGTH),
                    placeholder: unref(t)("gameCenter.drift.report.detailPlaceholder")
                  }, null, 8, _hoisted_24$1), [
                    [vModelText, reportDetail.value]
                  ]),
                  createBaseVNode("button", {
                    class: "gc-drift__primary",
                    type: "button",
                    "data-action": "report-submit",
                    disabled: moderateBusy.value,
                    onClick: handleReport
                  }, toDisplayString(moderateBusy.value ? unref(t)("gameCenter.drift.report.busy") : unref(t)("gameCenter.drift.report.submit")), 9, _hoisted_25$1),
                  reportError.value ? (openBlock(), createElementBlock("p", _hoisted_26$1, toDisplayString(reportError.value), 1)) : createCommentVNode("", true)
                ])) : createCommentVNode("", true),
                actionMessage.value ? (openBlock(), createElementBlock("p", _hoisted_27$1, toDisplayString(actionMessage.value), 1)) : createCommentVNode("", true)
              ])) : createCommentVNode("", true)
            ]),
            createBaseVNode("section", _hoisted_28$1, [
              createBaseVNode("header", _hoisted_29$1, [
                createBaseVNode("h3", _hoisted_30$1, toDisplayString(unref(t)("gameCenter.drift.publish.title")), 1)
              ]),
              createBaseVNode("div", _hoisted_31$1, [
                (openBlock(), createElementBlock(Fragment, null, renderList(["text", "coin"], (mode) => {
                  return createBaseVNode("button", {
                    key: mode,
                    class: normalizeClass(["gc-drift__mode", { "gc-drift__mode--active": publishMode.value === mode }]),
                    type: "button",
                    role: "tab",
                    "aria-selected": publishMode.value === mode ? "true" : "false",
                    "data-mode": mode,
                    onClick: ($event) => publishMode.value = mode
                  }, toDisplayString(mode === "text" ? unref(t)("gameCenter.drift.publish.textMode") : unref(t)("gameCenter.drift.publish.coinMode")), 11, _hoisted_32);
                }), 64))
              ]),
              withDirectives(createBaseVNode("textarea", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => publishText.value = $event),
                class: "gc-drift__input",
                maxlength: unref(DRIFT_TEXT_MAX_LENGTH),
                placeholder: unref(t)("gameCenter.drift.publish.placeholder"),
                "data-field": "drift-text"
              }, null, 8, _hoisted_33), [
                [vModelText, publishText.value]
              ]),
              createBaseVNode("span", _hoisted_34, toDisplayString(counterLabel.value), 1),
              publishMode.value === "coin" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                createBaseVNode("label", _hoisted_35, toDisplayString(unref(t)("gameCenter.drift.publish.coinLabel")), 1),
                withDirectives(createBaseVNode("input", {
                  id: "drift-coin-amount",
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => coinInput.value = $event),
                  class: "gc-drift__input gc-drift__input--single",
                  type: "text",
                  inputmode: "numeric",
                  autocomplete: "off",
                  placeholder: unref(t)("gameCenter.drift.publish.coinPlaceholder"),
                  "data-field": "drift-coin"
                }, null, 8, _hoisted_36), [
                  [vModelText, coinInput.value]
                ]),
                createBaseVNode("p", _hoisted_37, toDisplayString(unref(t)("gameCenter.drift.publish.coinNote")), 1)
              ], 64)) : (openBlock(), createElementBlock("p", _hoisted_38, toDisplayString(unref(t)("gameCenter.drift.publish.textNote")), 1)),
              fieldErrorKey.value ? (openBlock(), createElementBlock("p", _hoisted_39, toDisplayString(unref(t)(fieldErrorKey.value)), 1)) : createCommentVNode("", true),
              publishSubmitError.value ? (openBlock(), createElementBlock("p", _hoisted_40, toDisplayString(publishSubmitError.value), 1)) : createCommentVNode("", true),
              publishError.value ? (openBlock(), createElementBlock("p", _hoisted_41, toDisplayString(publishError.value), 1)) : createCommentVNode("", true),
              createBaseVNode("button", {
                class: "gc-drift__primary",
                type: "button",
                "data-action": "publish",
                disabled: publishBusy.value || !canPublish.value,
                onClick: handlePublish
              }, toDisplayString(publishBusy.value ? unref(t)("gameCenter.drift.publish.busy") : unref(t)("gameCenter.drift.publish.action")), 9, _hoisted_42),
              publishedBottle.value ? (openBlock(), createBlock(GameCenterNotice, {
                key: 5,
                tone: "info",
                title: unref(t)("gameCenter.drift.publish.successTitle"),
                message: publishedBottle.value.coinAmount > 0 ? unref(tf)("gameCenter.drift.publish.successCoinBody", { n: publishedBottle.value.coinAmount }) : unref(t)("gameCenter.drift.publish.successBody"),
                "action-text": unref(t)("gameCenter.drift.publish.another"),
                onAction: resetPublished
              }, null, 8, ["title", "message", "action-text"])) : createCommentVNode("", true)
            ]),
            createBaseVNode("p", _hoisted_43, toDisplayString(unref(t)("gameCenter.drift.policyNote")), 1)
          ], 64))
        ], 64))
      ]);
    };
  }
};
const GameCenterDriftTab = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-d5104fe3"]]);
const _hoisted_1$1 = { class: "gc-me" };
const _hoisted_2$1 = { class: "gc-card" };
const _hoisted_3$1 = { class: "gc-card__header" };
const _hoisted_4$1 = { class: "gc-card__title" };
const _hoisted_5$1 = { class: "gc-me__fields" };
const _hoisted_6$1 = { class: "gc-me__field" };
const _hoisted_7$1 = { class: "gc-me__field" };
const _hoisted_8 = { class: "gc-me__field" };
const _hoisted_9 = {
  key: 0,
  class: "gc-card"
};
const _hoisted_10 = { class: "gc-card__header" };
const _hoisted_11 = { class: "gc-card__title" };
const _hoisted_12 = { class: "gc-me__fields" };
const _hoisted_13 = { class: "gc-me__field" };
const _hoisted_14 = { class: "gc-me__field" };
const _hoisted_15 = { class: "gc-me__field" };
const _hoisted_16 = {
  key: 1,
  class: "gc-me__gated"
};
const _hoisted_17 = { class: "gc-card" };
const _hoisted_18 = { class: "gc-card__header" };
const _hoisted_19 = { class: "gc-card__title" };
const _hoisted_20 = { class: "gc-me__games" };
const _hoisted_21 = ["data-game-id", "onClick"];
const _hoisted_22 = { "aria-hidden": "true" };
const _hoisted_23 = {
  key: 0,
  class: "gc-card__hint"
};
const _hoisted_24 = {
  key: 1,
  class: "gc-card__hint"
};
const _hoisted_25 = {
  key: 2,
  class: "gc-card__hint"
};
const _hoisted_26 = {
  key: 3,
  class: "gc-me__fields"
};
const _hoisted_27 = { class: "gc-me__field" };
const _hoisted_28 = { class: "gc-me__field" };
const _hoisted_29 = { class: "gc-me__field" };
const _hoisted_30 = { class: "gc-me__field" };
const _hoisted_31 = { class: "gc-me__policy" };
const _sfc_main$1 = {
  __name: "GameCenterMeTab",
  props: {
    profile: { type: Object, default: () => ({}) },
    games: { type: Array, default: () => [] },
    selectedGameId: { type: String, default: "" },
    selfBest: { type: Object, default: null },
    wallet: { type: Object, default: null },
    economyEnabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    errorMessage: { type: String, default: "" }
  },
  emits: ["select-game", "retry"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t } = useI18n();
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("section", _hoisted_2$1, [
          createBaseVNode("header", _hoisted_3$1, [
            createBaseVNode("h3", _hoisted_4$1, toDisplayString(unref(t)("gameCenter.me.profileTitle")), 1)
          ]),
          createBaseVNode("dl", _hoisted_5$1, [
            createBaseVNode("div", _hoisted_6$1, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("gameCenter.me.nickname")), 1),
              createBaseVNode("dd", null, toDisplayString(props.profile.name || unref(t)("gameCenter.home.anonymous")), 1)
            ]),
            createBaseVNode("div", _hoisted_7$1, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("gameCenter.me.className")), 1),
              createBaseVNode("dd", null, toDisplayString(props.profile.className || unref(t)("gameCenter.home.classUnknown")), 1)
            ]),
            createBaseVNode("div", _hoisted_8, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("gameCenter.me.schoolName")), 1),
              createBaseVNode("dd", null, toDisplayString(props.profile.schoolName || unref(t)("gameCenter.me.schoolUnknown")), 1)
            ])
          ])
        ]),
        props.economyEnabled ? (openBlock(), createElementBlock("section", _hoisted_9, [
          createBaseVNode("header", _hoisted_10, [
            createBaseVNode("h3", _hoisted_11, toDisplayString(unref(t)("gameCenter.me.walletTitle")), 1)
          ]),
          createBaseVNode("dl", _hoisted_12, [
            createBaseVNode("div", _hoisted_13, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("gameCenter.me.level")), 1),
              createBaseVNode("dd", null, toDisplayString(props.wallet?.level ?? "--"), 1)
            ]),
            createBaseVNode("div", _hoisted_14, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("gameCenter.me.xp")), 1),
              createBaseVNode("dd", null, toDisplayString(props.wallet?.xp ?? "--"), 1)
            ]),
            createBaseVNode("div", _hoisted_15, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("gameCenter.me.coins")), 1),
              createBaseVNode("dd", null, toDisplayString(props.wallet?.coins ?? "--"), 1)
            ])
          ])
        ])) : (openBlock(), createElementBlock("p", _hoisted_16, toDisplayString(unref(t)("gameCenter.me.economyDisabledNote")), 1)),
        createBaseVNode("section", _hoisted_17, [
          createBaseVNode("header", _hoisted_18, [
            createBaseVNode("h3", _hoisted_19, toDisplayString(unref(t)("gameCenter.me.historyTitle")), 1)
          ]),
          createBaseVNode("div", _hoisted_20, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(props.games, (item) => {
              return openBlock(), createElementBlock("button", {
                key: item.id,
                class: normalizeClass(["gc-me__game", { "gc-me__game--active": item.id === props.selectedGameId }]),
                type: "button",
                "data-game-id": item.id,
                onClick: ($event) => emit("select-game", item.id)
              }, [
                createBaseVNode("span", _hoisted_22, toDisplayString(item.icon || "🎮"), 1),
                createBaseVNode("span", null, toDisplayString(item.name), 1)
              ], 10, _hoisted_21);
            }), 128))
          ]),
          props.loading ? (openBlock(), createElementBlock("p", _hoisted_23, toDisplayString(unref(t)("gameCenter.me.loading")), 1)) : props.errorMessage ? (openBlock(), createElementBlock("p", _hoisted_24, toDisplayString(props.errorMessage), 1)) : !props.selfBest ? (openBlock(), createElementBlock("p", _hoisted_25, toDisplayString(unref(t)("gameCenter.me.noHistory")), 1)) : (openBlock(), createElementBlock("dl", _hoisted_26, [
            createBaseVNode("div", _hoisted_27, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("gameCenter.me.bestScore")), 1),
              createBaseVNode("dd", null, toDisplayString(props.selfBest.score), 1)
            ]),
            createBaseVNode("div", _hoisted_28, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("gameCenter.me.bestMaxLevel")), 1),
              createBaseVNode("dd", null, toDisplayString(props.selfBest.maxLevel), 1)
            ]),
            createBaseVNode("div", _hoisted_29, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("gameCenter.me.classRank")), 1),
              createBaseVNode("dd", null, toDisplayString(props.selfBest.classRank || "--"), 1)
            ]),
            createBaseVNode("div", _hoisted_30, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("gameCenter.me.schoolRank")), 1),
              createBaseVNode("dd", null, toDisplayString(props.selfBest.schoolRank || "--"), 1)
            ])
          ]))
        ]),
        createBaseVNode("p", _hoisted_31, toDisplayString(unref(t)("gameCenter.me.piiNote")), 1)
      ]);
    };
  }
};
const GameCenterMeTab = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-b8fe548b"]]);
let pendingTab = "";
const consumeGameCenterTab = () => {
  const tab = pendingTab;
  pendingTab = "";
  return tab;
};
const _hoisted_1 = { class: "game-center-view" };
const _hoisted_2 = { class: "game-center-view__body" };
const _hoisted_3 = {
  key: 1,
  class: "game-center-view__loading"
};
const _hoisted_4 = {
  class: "game-center-tabs",
  role: "tablist"
};
const _hoisted_5 = ["aria-selected", "data-tab", "onClick"];
const _hoisted_6 = { "aria-hidden": "true" };
const _hoisted_7 = { class: "game-center-view__panel" };
const _sfc_main = {
  __name: "GameCenterView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back", "navigate"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { t } = useI18n();
    const authStore = useAuthStore();
    const sessionVerified = computed(() => authStore.sessionVerified === true);
    const DEFAULT_FLAGS = {
      ...DEFAULT_GAME_CENTER_FLAGS,
      api_base: "",
      allowed_game_origins: []
    };
    const flags = ref({ ...DEFAULT_FLAGS });
    const capabilities = ref({ ...EMPTY_GAME_PLATFORM_CAPABILITIES });
    const flagsLoaded = ref(false);
    const activeTab = ref("home");
    const games = ref([]);
    const selectedGameId = ref(GAME_CENTER_GAME_IDS[0]);
    const profile = ref({ name: "", className: "", schoolName: "" });
    const refreshProfile = () => {
      profile.value = readCachedPlayerProfile(props.studentId, GAME_CENTER_GAME_IDS, sessionVerified.value);
    };
    watch([() => props.studentId, sessionVerified], refreshProfile, { immediate: true });
    const classicBoard = ref(null);
    const boardLoading = ref(false);
    const boardError = ref("");
    const verifiedBoard = ref(null);
    const verifiedError = ref("");
    const wallet = ref(null);
    const platformNotice = ref("");
    const safeText2 = (value) => String(value ?? "").trim();
    const economyEnabled = computed(
      () => flags.value.game_economy_enabled === true && capabilities.value.wallet === true
    );
    const verifiedEnabled = computed(
      () => flags.value.game_verified_session_enabled === true && capabilities.value.leaderboards === true
    );
    const driftEnabled = computed(
      () => flags.value.drift_bottle_enabled === true && capabilities.value.drift_bottle === true
    );
    const dailyTasksEnabled = computed(
      () => flags.value.game_daily_tasks_enabled === true && capabilities.value.daily_tasks === true
    );
    const gomokuCompetitiveEnabled = computed(
      () => flags.value.gomoku_competitive_enabled === true && capabilities.value.gomoku_match === true
    );
    const verifiedRewardEnabled = computed(
      () => flags.value.verified_reward_enabled === true && capabilities.value.verified_reward === true
    );
    const requiresCapabilities = computed(
      () => flags.value.game_verified_session_enabled === true || flags.value.game_economy_enabled === true || flags.value.game_daily_tasks_enabled === true || flags.value.gomoku_competitive_enabled === true || flags.value.drift_bottle_enabled === true || flags.value.verified_reward_enabled === true
    );
    const tabs = computed(() => {
      const list = [
        { key: "home", label: t("gameCenter.tabs.home"), icon: "🏠" },
        { key: "games", label: t("gameCenter.tabs.games"), icon: "🎮" },
        { key: "rank", label: t("gameCenter.tabs.rank"), icon: "🏆" }
      ];
      if (verifiedEnabled.value) {
        list.push({ key: "globalRank", label: t("gameCenter.tabs.globalRank"), icon: "🌍" });
      }
      if (economyEnabled.value || dailyTasksEnabled.value) {
        list.push({ key: "points", label: t("gameCenter.tabs.points"), icon: "💰" });
      }
      if (driftEnabled.value) {
        list.push({ key: "drift", label: t("gameCenter.tabs.drift"), icon: "🍾" });
      }
      list.push({ key: "me", label: t("gameCenter.tabs.me"), icon: "👤" });
      return list;
    });
    const resolveErrorMessage = (error) => {
      const message = safeText2(error?.message);
      return message || t("gameCenter.rank.loadFailed");
    };
    const gameCardStatus = (moduleId) => {
      const local = getLocalModuleState(moduleId);
      return safeText2(local?.version) ? t("more.status.ready") : t("more.status.notDownloaded");
    };
    const recommendGames = computed(() => games.value.slice(0, 3));
    const recentGames = computed(
      () => games.value.filter((item) => safeText2(getLocalModuleState(item.id)?.version)).slice(0, 3)
    );
    const applyFlags = (config) => {
      flags.value = resolveEffectiveGameCenterFlags(config);
      flagsLoaded.value = true;
    };
    const refreshPlatformAvailability = async () => {
      if (!requiresCapabilities.value) {
        platformNotice.value = t("gameCenter.status.compatibilityMode");
        return;
      }
      try {
        const meta = await fetchGamePlatformMeta(flags.value.api_base);
        capabilities.value = { ...meta.capabilities };
        platformNotice.value = "";
        if (activeTab.value === "rank") await loadVerifiedBoard();
        if (activeTab.value === "me") await loadWalletIfEnabled();
      } catch {
        capabilities.value = { ...EMPTY_GAME_PLATFORM_CAPABILITIES };
        platformNotice.value = t("gameCenter.status.compatibilityMode");
      }
    };
    const loadGames = async () => {
      const channel = normalizeModuleCenterChannel(await resolveModuleChannel(), "main");
      games.value = buildModuleCenterCards({ channel }).filter((item) => GAME_CENTER_GAME_IDS.includes(item.id)).map((item) => ({
        id: item.id,
        name: item.name,
        icon: item.icon,
        description: item.description,
        statusText: gameCardStatus(item.id),
        kind: item.kind
      }));
    };
    let walletInFlight = false;
    let verifiedInFlight = false;
    const loadWalletIfEnabled = async () => {
      if (!economyEnabled.value) {
        wallet.value = null;
        return;
      }
      if (walletInFlight) return;
      walletInFlight = true;
      try {
        const payload = await fetchGamePlayerWallet(flags.value.api_base);
        if (!economyEnabled.value) {
          wallet.value = null;
          return;
        }
        const source = payload.wallet && typeof payload.wallet === "object" ? payload.wallet : payload.data && typeof payload.data === "object" ? payload.data : payload;
        wallet.value = {
          level: source.level ?? source.player_level ?? null,
          xp: source.xp ?? source.xp_total ?? null,
          coins: source.coins ?? source.coin_balance ?? null
        };
      } catch {
        wallet.value = null;
      } finally {
        walletInFlight = false;
      }
    };
    const loadClassicBoard = async () => {
      boardLoading.value = true;
      boardError.value = "";
      try {
        const className = safeText2(profile.value.className);
        const payload = await fetchClassicLeaderboard({
          gameId: selectedGameId.value,
          scope: className ? "class" : "school",
          // 契约 D：游客态（会话未确认）不把缓存学号当作「当前用户」查询 / 高亮榜单
          studentId: sessionVerified.value ? safeText2(props.studentId) : "",
          className,
          schoolName: safeText2(profile.value.schoolName) || "湖北工业大学",
          limit: 20
        });
        classicBoard.value = normalizeLegacyLeaderboard(payload, {
          gameId: selectedGameId.value,
          selfStudentId: sessionVerified.value ? safeText2(props.studentId) : "",
          selfPlayerName: safeText2(profile.value.name)
        });
      } catch (error) {
        classicBoard.value = null;
        boardError.value = resolveErrorMessage(error);
      } finally {
        boardLoading.value = false;
      }
    };
    const loadVerifiedBoard = async () => {
      if (!verifiedEnabled.value) {
        verifiedBoard.value = null;
        verifiedError.value = "";
        return;
      }
      if (verifiedInFlight) return;
      verifiedInFlight = true;
      try {
        const payload = await fetchGameLeaderboards({
          gameId: selectedGameId.value,
          board: "verified",
          scope: "school",
          limit: 20,
          apiBase: flags.value.api_base
        });
        if (!verifiedEnabled.value) {
          verifiedBoard.value = null;
          verifiedError.value = "";
          return;
        }
        verifiedBoard.value = normalizeGamePlatformLeaderboard(payload, {
          gameId: selectedGameId.value,
          board: "verified"
        });
        verifiedError.value = "";
      } catch (error) {
        verifiedBoard.value = null;
        verifiedError.value = resolveErrorMessage(error);
      } finally {
        verifiedInFlight = false;
      }
    };
    const loadBoards = async () => {
      await loadClassicBoard();
      await loadVerifiedBoard();
    };
    const handleSelectGame = async (gameId) => {
      const next = safeText2(gameId);
      if (!next || next === selectedGameId.value) return;
      selectedGameId.value = next;
      await loadBoards();
    };
    const handleRetry = async () => {
      await loadBoards();
    };
    const handleOpenGame = (gameId) => {
      if (!requestGameOpen(gameId)) return;
      emit("navigate", "more");
    };
    const handleTabChange = (tabKey) => {
      if (tabKey === activeTab.value) return;
      activeTab.value = tabKey;
    };
    watch(activeTab, (next) => {
      if (next === "rank" || next === "me") {
        if (!classicBoard.value && !boardLoading.value) void loadBoards();
        if (next === "me") void loadWalletIfEnabled();
      }
    });
    onMounted(async () => {
      await loadGames();
      void (async () => {
        try {
          applyFlags(await fetchRemoteConfig({ force: false }));
        } catch {
          applyFlags(null);
        }
        const requestedTab = consumeGameCenterTab();
        if (flags.value.game_center_enabled !== true) {
          emit("navigate", "more");
          return;
        }
        await refreshPlatformAvailability();
        if (requestedTab && tabs.value.some((tab) => tab.key === requestedTab)) {
          activeTab.value = requestedTab;
        }
        if (activeTab.value === "rank" || activeTab.value === "me") await loadBoards();
      })();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$9), {
          title: unref(t)("gameCenter.title"),
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, null, 8, ["title"]),
        createBaseVNode("div", _hoisted_2, [
          platformNotice.value ? (openBlock(), createBlock(GameCenterNotice, {
            key: 0,
            tone: "info",
            title: unref(t)("gameCenter.status.noticeTitle"),
            message: platformNotice.value
          }, null, 8, ["title", "message"])) : createCommentVNode("", true),
          !flagsLoaded.value ? (openBlock(), createElementBlock("p", _hoisted_3, toDisplayString(unref(t)("gameCenter.loading")), 1)) : createCommentVNode("", true),
          createBaseVNode("nav", _hoisted_4, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(tabs.value, (tab) => {
              return openBlock(), createElementBlock("button", {
                key: tab.key,
                class: normalizeClass(["game-center-tabs__item", { "game-center-tabs__item--active": tab.key === activeTab.value }]),
                type: "button",
                role: "tab",
                "aria-selected": tab.key === activeTab.value ? "true" : "false",
                "data-tab": tab.key,
                onClick: ($event) => handleTabChange(tab.key)
              }, [
                createBaseVNode("span", _hoisted_6, toDisplayString(tab.icon), 1),
                createBaseVNode("span", null, toDisplayString(tab.label), 1)
              ], 10, _hoisted_5);
            }), 128))
          ]),
          createBaseVNode("div", _hoisted_7, [
            activeTab.value === "home" ? (openBlock(), createBlock(GameCenterHomeTab, {
              key: 0,
              profile: profile.value,
              "economy-enabled": economyEnabled.value,
              "daily-tasks-enabled": dailyTasksEnabled.value,
              "api-base": flags.value.api_base,
              "recent-games": recentGames.value,
              "recommended-games": recommendGames.value,
              onOpenGame: handleOpenGame
            }, null, 8, ["profile", "economy-enabled", "daily-tasks-enabled", "api-base", "recent-games", "recommended-games"])) : activeTab.value === "games" ? (openBlock(), createBlock(GameCenterGamesTab, {
              key: 1,
              games: games.value,
              "gomoku-competitive-enabled": gomokuCompetitiveEnabled.value,
              onOpenGame: handleOpenGame
            }, null, 8, ["games", "gomoku-competitive-enabled"])) : activeTab.value === "rank" ? (openBlock(), createBlock(GameCenterRankTab, {
              key: 2,
              games: games.value,
              "selected-game-id": selectedGameId.value,
              "classic-board": classicBoard.value,
              loading: boardLoading.value,
              "error-message": boardError.value,
              "verified-enabled": verifiedEnabled.value,
              "verified-reward-enabled": verifiedRewardEnabled.value,
              "verified-board": verifiedBoard.value,
              "verified-error": verifiedError.value,
              onSelectGame: handleSelectGame,
              onRetry: handleRetry
            }, null, 8, ["games", "selected-game-id", "classic-board", "loading", "error-message", "verified-enabled", "verified-reward-enabled", "verified-board", "verified-error"])) : activeTab.value === "globalRank" ? (openBlock(), createBlock(GameCenterGlobalRankTab, {
              key: 3,
              "api-base": flags.value.api_base,
              "leaderboards-enabled": verifiedEnabled.value
            }, null, 8, ["api-base", "leaderboards-enabled"])) : activeTab.value === "points" ? (openBlock(), createBlock(GameCenterPointsTab, {
              key: 4,
              "api-base": flags.value.api_base,
              "wallet-enabled": economyEnabled.value,
              "daily-tasks-enabled": dailyTasksEnabled.value
            }, null, 8, ["api-base", "wallet-enabled", "daily-tasks-enabled"])) : activeTab.value === "drift" && driftEnabled.value ? (openBlock(), createBlock(GameCenterDriftTab, {
              key: 5,
              "api-base": flags.value.api_base
            }, null, 8, ["api-base"])) : activeTab.value === "me" ? (openBlock(), createBlock(GameCenterMeTab, {
              key: 6,
              profile: profile.value,
              games: games.value,
              "selected-game-id": selectedGameId.value,
              "self-best": classicBoard.value?.self || null,
              wallet: wallet.value,
              "economy-enabled": economyEnabled.value,
              loading: boardLoading.value,
              "error-message": boardError.value,
              onSelectGame: handleSelectGame,
              onRetry: handleRetry
            }, null, 8, ["profile", "games", "selected-game-id", "self-best", "wallet", "economy-enabled", "loading", "error-message"])) : createCommentVNode("", true)
          ])
        ])
      ]);
    };
  }
};
const GameCenterView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-d1b89016"]]);
export {
  GameCenterView as default
};
