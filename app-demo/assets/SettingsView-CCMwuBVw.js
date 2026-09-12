const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./runtime-bridge-Dt57BD2i.js","./more-modules-DaLSEgdg.js"])))=>i.map(i=>d[i]);
import { K as getIdentityDeviceDisplayName, V as identityDeviceStatus, W as identityRevokeCurrentDeviceLocal, a as isTauriRuntime, d as invokeNative, X as parseMiniHbutDeepLink, Y as IDENTITY_REQUEST_ID_PATTERN, Z as IDENTITY_HANDOFF_PATTERN, P as isMobileLike, s as detectRuntime, U as subscribeDebugLogs, L as getDebugLogs, p as pushDebugLog, M as formatDebugTime, $ as clearDebugLogs, _ as __vitePreload } from "./runtime-bridge-Dt57BD2i.js";
import { m as useI18n, ae as identityUiState, af as setIdentityDeviceRefreshing, ag as setIdentityDeviceError, ah as setIdentityDeviceStatus, j as showToast, ai as setIdentityRevoking, aj as getIdentityCoreBaseUrl, ak as clearIdentityDeviceMeta, _ as _export_sfc, u as useLocale, M as CLOUD_SYNC_UPDATED_EVENT, al as FONT_CDN_OPTIONS, q as useAppSettings, am as getCloudSyncLocalStatus, an as setLocale, ao as getCloudSyncRuntimeConfig, a3 as getStoredOcrConfig, a2 as applyOcrRuntimeConfig, ap as useFontSettings, aq as setFontCdnProvider, ar as prefetchCdnFonts, as as loadDeyiHeiFont, at as ensureFontLoaded, au as resetAppSettings, av as DEFAULT_CLOUD_SYNC_ENDPOINT, aw as DEFAULT_BACKEND_TARGETS, b as useUiSettings, h as flushUiSettings } from "./app-demo-CUOWTnz-.js";
import { y as defineComponent, o as onMounted, a as openBlock, c as createElementBlock, b as createBaseVNode, n as normalizeClass, u as unref, t as toDisplayString, g as createTextVNode, d as createCommentVNode, K as withDirectives, L as vModelText, m as withKeys, h as computed, r as ref, v as watch, l as onBeforeUnmount, j as createBlock, s as Teleport, p as createVNode, F as Fragment, f as renderList, e as normalizeStyle } from "./vue-core-Dzs4fLAU.js";
import { g as getNightModePreference, i as isNightModeEnabled, a as initNightModeClass, s as setNightModePreference, b as resolveNightModeDark } from "./debug-tools-XN5ic1q-.js";
import "./more-modules-DaLSEgdg.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1$3 = { class: "identity-device-settings" };
const _hoisted_2$3 = { class: "identity-device-section glass-card" };
const _hoisted_3$3 = { class: "section-head" };
const _hoisted_4$2 = { class: "identity-test-note" };
const _hoisted_5$2 = { class: "identity-device-grid" };
const _hoisted_6$2 = { class: "identity-device-field" };
const _hoisted_7$2 = { class: "identity-device-field" };
const _hoisted_8$2 = { class: "identity-device-field" };
const _hoisted_9$2 = { class: "identity-device-field" };
const _hoisted_10$2 = {
  key: 0,
  class: "identity-device-field identity-device-field--wide"
};
const _hoisted_11$2 = { class: "identity-device-mono" };
const _hoisted_12$2 = {
  key: 1,
  class: "identity-device-field identity-device-field--wide"
};
const _hoisted_13$2 = { class: "identity-device-mono" };
const _hoisted_14$2 = { class: "identity-device-hint" };
const _hoisted_15$2 = {
  key: 0,
  class: "identity-device-error"
};
const _hoisted_16$2 = { class: "identity-device-actions" };
const _hoisted_17$2 = ["disabled"];
const _hoisted_18$2 = ["disabled"];
const _hoisted_19$2 = { class: "identity-device-section glass-card" };
const _hoisted_20$2 = { class: "section-head" };
const _hoisted_21$1 = { class: "identity-device-hint" };
const _hoisted_22$1 = ["aria-label"];
const _hoisted_23$1 = { class: "identity-revoke-card modal-pop-card" };
const _hoisted_24$1 = { class: "identity-revoke-desc" };
const _hoisted_25$1 = { class: "identity-revoke-desc identity-revoke-desc--strong" };
const _hoisted_26$1 = { class: "identity-revoke-label" };
const _hoisted_27$1 = ["placeholder"];
const _hoisted_28$1 = { class: "identity-revoke-actions" };
const _hoisted_29$1 = ["disabled"];
const _hoisted_30$1 = ["disabled"];
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "IdentityDeviceSettings",
  setup(__props, { expose: __expose }) {
    const { t } = useI18n();
    const ui = identityUiState;
    const revokeConfirmPhrase = computed(() => t("identity.device.action.revoke"));
    const revokeModalVisible = ref(false);
    const revokeConfirmInput = ref("");
    const confirmMismatch = computed(() => revokeConfirmInput.value !== revokeConfirmPhrase.value);
    const serviceEnabledText = computed(
      () => ui.deviceStatus === null ? t("identity.device.status.checking") : ui.deviceStatus.available ? t("identity.device.status.enabled") : t("identity.device.status.disabled")
    );
    const boundText = computed(() => {
      if (ui.deviceStatus === null) return t("identity.device.status.checking");
      if (ui.deviceStatus.available === false) return t("identity.device.bind.unavailable");
      return ui.deviceId ? t("identity.device.bind.bound") : ui.deviceStatus.has_key ? t("identity.device.bind.key_pending") : t("identity.device.bind.unbound");
    });
    const verifiedAtText = computed(() => {
      if (!ui.verifiedAt) return "—";
      try {
        return new Date(ui.verifiedAt).toLocaleString();
      } catch {
        return "—";
      }
    });
    const refreshDeviceStatus = async () => {
      setIdentityDeviceRefreshing(true);
      setIdentityDeviceError("");
      try {
        const status = await identityDeviceStatus();
        setIdentityDeviceStatus(status);
        if (status?.available === false) {
          setIdentityDeviceError(status.error || t("identity.device.error.storage_unavailable"));
        }
      } catch {
        setIdentityDeviceError(t("identity.device.error.read_failed"));
      } finally {
        setIdentityDeviceRefreshing(false);
      }
    };
    const openRevokeModal = () => {
      revokeConfirmInput.value = "";
      revokeModalVisible.value = true;
    };
    const closeRevokeModal = () => {
      revokeModalVisible.value = false;
      revokeConfirmInput.value = "";
    };
    const revokeCurrentDevice = async () => {
      if (confirmMismatch.value || ui.revoking) return;
      const deviceId = ui.deviceId;
      if (!deviceId) {
        showToast(t("identity.device.toast.not_bound"), "info");
        closeRevokeModal();
        return;
      }
      setIdentityRevoking(true);
      setIdentityDeviceError("");
      try {
        await identityRevokeCurrentDeviceLocal({
          base_url: getIdentityCoreBaseUrl(),
          device_id: deviceId
        });
        clearIdentityDeviceMeta();
        closeRevokeModal();
        showToast(t("identity.device.toast.revoked"), "success");
      } catch (err) {
        const message = String(err?.message || err || t("identity.device.revoke.fallback_message"));
        setIdentityDeviceError(message);
        showToast(t("identity.device.toast.revoke_failed"), "error");
      } finally {
        setIdentityRevoking(false);
      }
      await refreshDeviceStatus();
    };
    onMounted(() => {
      void refreshDeviceStatus();
    });
    __expose({ refreshDeviceStatus });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$3, [
        createBaseVNode("section", _hoisted_2$3, [
          createBaseVNode("div", _hoisted_3$3, [
            _cache[1] || (_cache[1] = createBaseVNode("h3", null, "Mini-HBUT Identity", -1)),
            createBaseVNode("span", {
              class: normalizeClass(["identity-device-pill", { ok: unref(ui).deviceStatus?.available }])
            }, toDisplayString(serviceEnabledText.value), 3)
          ]),
          createBaseVNode("p", _hoisted_4$2, [
            _cache[2] || (_cache[2] = createTextVNode(" 🧪 ", -1)),
            createBaseVNode("strong", null, toDisplayString(unref(t)("identity.overlay.test.badge")), 1),
            createTextVNode(toDisplayString(unref(t)("identity.device.test_note")), 1)
          ]),
          createBaseVNode("dl", _hoisted_5$2, [
            createBaseVNode("div", _hoisted_6$2, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("identity.device.field.device")), 1),
              createBaseVNode("dd", null, toDisplayString(unref(getIdentityDeviceDisplayName)()), 1)
            ]),
            createBaseVNode("div", _hoisted_7$2, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("identity.device.field.bind_status")), 1),
              createBaseVNode("dd", null, toDisplayString(boundText.value), 1)
            ]),
            createBaseVNode("div", _hoisted_8$2, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("identity.device.field.last_auth")), 1),
              createBaseVNode("dd", null, toDisplayString(verifiedAtText.value), 1)
            ]),
            createBaseVNode("div", _hoisted_9$2, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("identity.device.field.method")), 1),
              createBaseVNode("dd", null, toDisplayString(unref(t)("identity.device.field.method_value")), 1)
            ]),
            unref(ui).deviceStatus?.fingerprint ? (openBlock(), createElementBlock("div", _hoisted_10$2, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("identity.device.field.fingerprint")), 1),
              createBaseVNode("dd", _hoisted_11$2, toDisplayString(unref(ui).deviceStatus.fingerprint), 1)
            ])) : createCommentVNode("", true),
            unref(ui).deviceId ? (openBlock(), createElementBlock("div", _hoisted_12$2, [
              createBaseVNode("dt", null, toDisplayString(unref(t)("identity.device.field.device_id")), 1),
              createBaseVNode("dd", _hoisted_13$2, toDisplayString(unref(ui).deviceId), 1)
            ])) : createCommentVNode("", true)
          ]),
          createBaseVNode("p", _hoisted_14$2, toDisplayString(unref(t)("identity.device.hint.bind_flow")), 1),
          unref(ui).deviceError ? (openBlock(), createElementBlock("p", _hoisted_15$2, toDisplayString(unref(ui).deviceError), 1)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_16$2, [
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              disabled: unref(ui).deviceRefreshing,
              onClick: refreshDeviceStatus
            }, toDisplayString(unref(ui).deviceRefreshing ? unref(t)("identity.device.action.refreshing") : unref(t)("identity.device.action.refresh")), 9, _hoisted_17$2),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple identity-device-revoke",
              disabled: !unref(ui).deviceId || unref(ui).revoking,
              onClick: openRevokeModal
            }, toDisplayString(unref(ui).revoking ? unref(t)("identity.device.action.revoking") : unref(t)("identity.device.action.revoke")), 9, _hoisted_18$2)
          ])
        ]),
        createBaseVNode("section", _hoisted_19$2, [
          createBaseVNode("div", _hoisted_20$2, [
            createBaseVNode("h3", null, toDisplayString(unref(t)("identity.device.history.title")), 1)
          ]),
          createBaseVNode("p", _hoisted_21$1, toDisplayString(unref(t)("identity.device.history.desc")), 1)
        ]),
        revokeModalVisible.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "identity-revoke-modal",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": unref(t)("identity.device.revoke.dialog.aria")
        }, [
          createBaseVNode("div", _hoisted_23$1, [
            createBaseVNode("h3", null, toDisplayString(unref(t)("identity.device.revoke.title")), 1),
            createBaseVNode("p", _hoisted_24$1, toDisplayString(unref(t)("identity.device.revoke.desc.effect")), 1),
            createBaseVNode("p", _hoisted_25$1, toDisplayString(unref(t)("identity.device.revoke.desc.last_device")), 1),
            createBaseVNode("label", _hoisted_26$1, [
              createTextVNode(toDisplayString(unref(t)("identity.device.revoke.confirm_prompt").replace("{phrase}", revokeConfirmPhrase.value)) + " ", 1),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => revokeConfirmInput.value = $event),
                class: "identity-revoke-input",
                type: "text",
                placeholder: revokeConfirmPhrase.value,
                autocomplete: "off",
                spellcheck: "false",
                onKeydown: withKeys(closeRevokeModal, ["esc"])
              }, null, 40, _hoisted_27$1), [
                [vModelText, revokeConfirmInput.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_28$1, [
              createBaseVNode("button", {
                class: "btn-secondary btn-ripple",
                disabled: unref(ui).revoking,
                onClick: closeRevokeModal
              }, toDisplayString(unref(t)("identity.device.revoke.action.cancel")), 9, _hoisted_29$1),
              createBaseVNode("button", {
                class: "btn-danger btn-ripple",
                disabled: confirmMismatch.value || unref(ui).revoking,
                onClick: revokeCurrentDevice
              }, toDisplayString(unref(ui).revoking ? unref(t)("identity.device.action.revoking") : unref(t)("identity.device.revoke.action.confirm")), 9, _hoisted_30$1)
            ])
          ])
        ], 8, _hoisted_22$1)) : createCommentVNode("", true)
      ]);
    };
  }
});
const IdentityDeviceSettings = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-1d76ea12"]]);
const decodeIdentityQrImage = async (bytes, mime) => {
  if (!isTauriRuntime()) {
    return null;
  }
  try {
    const result = await invokeNative("chaoxing_checkin_decode_qr_image", {
      image_bytes: bytes,
      mime_type: mime || "image/png"
    });
    if (result && typeof result.url === "string" && result.url) {
      return { url: result.url };
    }
    return null;
  } catch {
    return null;
  }
};
const IDENTITY_QR_MAX_LENGTH = 2048;
const IDENTITY_QR_SOURCE = "qr";
const HTTPS_FALLBACK_PATH_RE = /^\/(?:handoff|r)\/([A-Za-z0-9_-]{3,64})\/?$/;
const IDENTITY_QR_HASH_KEY = "h";
const IDENTITY_QR_INVALID_MESSAGE = "这不是有效的 Mini-HBUT 登录二维码";
const fail = () => ({
  ok: false,
  error: { code: "invalid_code", message: IDENTITY_QR_INVALID_MESSAGE }
});
const parseIdentityQr = (raw) => {
  if (typeof raw !== "string" || raw.trim() === "") {
    return fail();
  }
  const trimmed = raw.trim();
  if (trimmed.length > IDENTITY_QR_MAX_LENGTH) {
    return fail();
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("minihbut:")) {
    return parseMiniHbutIdentityQr(trimmed);
  }
  if (lower.startsWith("https:") || lower.startsWith("http:")) {
    return parseHttpsFallbackQr(trimmed);
  }
  return fail();
};
const parseMiniHbutIdentityQr = (raw) => {
  const result = parseMiniHbutDeepLink(raw);
  if (!result.ok || result.link.kind !== "identity") {
    return fail();
  }
  try {
    const source = new URL(raw).searchParams.get("source");
    if (source !== null && source !== "" && source !== IDENTITY_QR_SOURCE) {
      return fail();
    }
  } catch {
    return fail();
  }
  return { ok: true, link: result.link };
};
const parseHttpsFallbackQr = (raw) => {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return fail();
  }
  if (url.search !== "" || url.searchParams.size > 0) {
    return fail();
  }
  const match = HTTPS_FALLBACK_PATH_RE.exec(url.pathname);
  if (!match) {
    return fail();
  }
  const requestId = match[1];
  if (!IDENTITY_REQUEST_ID_PATTERN.test(requestId)) {
    return fail();
  }
  const params = new URLSearchParams(url.hash.slice(1));
  const handoff = params.get(IDENTITY_QR_HASH_KEY) || "";
  if (!IDENTITY_HANDOFF_PATTERN.test(handoff)) {
    return fail();
  }
  return { ok: true, link: { kind: "identity", requestId, handoff } };
};
const INITIAL_QR_SCAN_STATE = { phase: "scanning" };
const identityQrScanReducer = (state, event) => {
  switch (event.type) {
    case "OPEN":
    case "RESET":
      return INITIAL_QR_SCAN_STATE;
    case "PERMISSION_DENIED":
      return { phase: "permission_needed" };
    case "PICK_STARTED":
      return { phase: "parsing" };
    case "PARSE_INVALID":
      return { phase: "invalid_code" };
    case "SUBMIT_REJECTED":
      return { phase: "scanning" };
    case "SUBMITTED":
      return { phase: "loading_request" };
    case "REQUEST_EXPIRED":
      return { phase: "expired_request" };
    case "APPROVAL_OPENED":
      return { phase: "approval_opened" };
    default:
      return state;
  }
};
const _hoisted_1$2 = ["aria-label"];
const _hoisted_2$2 = { class: "identity-qr-scanner-card" };
const _hoisted_3$2 = { class: "identity-qr-scanner-head" };
const _hoisted_4$1 = ["aria-label"];
const _hoisted_5$1 = {
  key: 0,
  class: "identity-qr-scanner-body"
};
const _hoisted_6$1 = {
  key: 0,
  class: "identity-qr-scanner-notice"
};
const _hoisted_7$1 = { class: "identity-qr-scanner-entries" };
const _hoisted_8$1 = { class: "identity-qr-scanner-entry identity-qr-scanner-entry--primary" };
const _hoisted_9$1 = {
  class: "material-symbols-outlined",
  "aria-hidden": "true"
};
const _hoisted_10$1 = ["capture"];
const _hoisted_11$1 = { class: "identity-qr-scanner-paste" };
const _hoisted_12$1 = ["placeholder", "disabled"];
const _hoisted_13$1 = ["disabled"];
const _hoisted_14$1 = { class: "identity-qr-scanner-hint" };
const _hoisted_15$1 = {
  key: 1,
  class: "identity-qr-scanner-body identity-qr-scanner-status",
  role: "status"
};
const _hoisted_16$1 = {
  key: 2,
  class: "identity-qr-scanner-body identity-qr-scanner-status"
};
const _hoisted_17$1 = {
  key: 3,
  class: "identity-qr-scanner-body identity-qr-scanner-status"
};
const _hoisted_18$1 = {
  key: 4,
  class: "identity-qr-scanner-body identity-qr-scanner-status",
  role: "status"
};
const _hoisted_19$1 = {
  key: 5,
  class: "identity-qr-scanner-body identity-qr-scanner-status"
};
const _hoisted_20$1 = { class: "identity-qr-scanner-status-desc" };
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "IdentityQrScanner",
  props: {
    visible: { type: Boolean },
    submitIntent: { type: Function }
  },
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const { t } = useI18n();
    const props = __props;
    const emit = __emit;
    const state = ref(INITIAL_QR_SCAN_STATE);
    const dispatch = (event) => {
      state.value = identityQrScanReducer(state.value, event);
    };
    const phase = computed(() => state.value.phase);
    const isMobile = isMobileLike();
    const pasteText = ref("");
    const parsing = computed(() => phase.value === "parsing");
    const handleFileChange = async (event) => {
      const input = event.target;
      const file = input.files?.[0];
      input.value = "";
      if (!file) {
        dispatch({ type: "SUBMIT_REJECTED" });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        dispatch({ type: "PARSE_INVALID" });
        return;
      }
      dispatch({ type: "PICK_STARTED" });
      await runScanFlow(async () => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const decoded = await decodeIdentityQrImage(bytes, file.type || "image/png");
        return decoded?.url ?? null;
      });
    };
    const handlePasteSubmit = async () => {
      const raw = pasteText.value.trim();
      if (!raw || parsing.value) return;
      dispatch({ type: "PICK_STARTED" });
      await runScanFlow(async () => raw);
    };
    const runScanFlow = async (obtain) => {
      let raw = null;
      try {
        raw = await obtain();
      } catch {
        raw = null;
      }
      if (!raw) {
        dispatch({ type: "PARSE_INVALID" });
        return;
      }
      const result = parseIdentityQr(raw);
      pasteText.value = "";
      if (!result.ok) {
        dispatch({ type: "PARSE_INVALID" });
        return;
      }
      props.submitIntent(result.link.requestId, result.link.handoff);
      dispatch({ type: "SUBMITTED" });
    };
    watch(
      () => [identityUiState.approvalPhase, identityUiState.lastResult?.outcome],
      ([approvalPhase, outcome]) => {
        if (phase.value !== "loading_request" && phase.value !== "approval_opened") return;
        if (approvalPhase !== "idle") {
          dispatch({ type: "APPROVAL_OPENED" });
        }
        if (outcome === "expired") {
          dispatch({ type: "REQUEST_EXPIRED" });
        }
      }
    );
    watch(
      () => props.visible,
      (visible) => {
        if (visible) {
          dispatch({ type: "OPEN" });
        } else {
          dispatch({ type: "RESET" });
          pasteText.value = "";
        }
      },
      { immediate: true }
    );
    onBeforeUnmount(() => {
      dispatch({ type: "RESET" });
    });
    const handleClose = () => {
      emit("close");
    };
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        __props.visible ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "identity-qr-scanner",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": unref(t)("identity.qr.scanner.dialog.aria")
        }, [
          createBaseVNode("div", _hoisted_2$2, [
            createBaseVNode("header", _hoisted_3$2, [
              _cache[3] || (_cache[3] = createBaseVNode("span", {
                class: "material-symbols-outlined identity-qr-scanner-head-icon",
                "aria-hidden": "true"
              }, "qr_code_scanner", -1)),
              createBaseVNode("h2", null, toDisplayString(unref(t)("identity.qr.scanner.title")), 1),
              createBaseVNode("button", {
                class: "identity-qr-scanner-close",
                type: "button",
                "aria-label": unref(t)("identity.qr.scanner.close.aria"),
                onClick: handleClose
              }, [..._cache[2] || (_cache[2] = [
                createBaseVNode("span", {
                  class: "material-symbols-outlined",
                  "aria-hidden": "true"
                }, "close", -1)
              ])], 8, _hoisted_4$1)
            ]),
            phase.value === "scanning" || phase.value === "permission_needed" ? (openBlock(), createElementBlock("div", _hoisted_5$1, [
              phase.value === "permission_needed" ? (openBlock(), createElementBlock("p", _hoisted_6$1, toDisplayString(unref(t)("identity.qr.scanner.permission_needed")), 1)) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_7$1, [
                createBaseVNode("label", _hoisted_8$1, [
                  createBaseVNode("span", _hoisted_9$1, toDisplayString(unref(isMobile) ? "photo_camera" : "image"), 1),
                  createBaseVNode("span", null, toDisplayString(unref(isMobile) ? unref(t)("identity.qr.scanner.action.capture") : unref(t)("identity.qr.scanner.action.pick_image")), 1),
                  createBaseVNode("input", {
                    class: "identity-qr-scanner-file",
                    type: "file",
                    accept: "image/*",
                    capture: unref(isMobile) ? "environment" : void 0,
                    onChange: handleFileChange
                  }, null, 40, _hoisted_10$1)
                ])
              ]),
              createBaseVNode("div", _hoisted_11$1, [
                withDirectives(createBaseVNode("textarea", {
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => pasteText.value = $event),
                  class: "identity-qr-scanner-paste-input",
                  rows: "3",
                  placeholder: unref(t)("identity.qr.scanner.paste.placeholder"),
                  disabled: parsing.value,
                  spellcheck: "false"
                }, null, 8, _hoisted_12$1), [
                  [vModelText, pasteText.value]
                ]),
                createBaseVNode("button", {
                  class: "identity-qr-scanner-action",
                  type: "button",
                  disabled: parsing.value || !pasteText.value.trim(),
                  onClick: handlePasteSubmit
                }, toDisplayString(unref(t)("identity.qr.scanner.action.parse")), 9, _hoisted_13$1)
              ]),
              createBaseVNode("p", _hoisted_14$1, toDisplayString(unref(t)("identity.qr.scanner.privacy_hint")), 1)
            ])) : phase.value === "parsing" ? (openBlock(), createElementBlock("div", _hoisted_15$1, [
              _cache[4] || (_cache[4] = createBaseVNode("span", {
                class: "material-symbols-outlined identity-qr-scanner-spin",
                "aria-hidden": "true"
              }, "sync", -1)),
              createBaseVNode("h3", null, toDisplayString(unref(t)("identity.qr.scanner.parsing")), 1)
            ])) : phase.value === "invalid_code" ? (openBlock(), createElementBlock("div", _hoisted_16$1, [
              _cache[5] || (_cache[5] = createBaseVNode("span", {
                class: "material-symbols-outlined identity-qr-scanner-status-error",
                "aria-hidden": "true"
              }, "error", -1)),
              createBaseVNode("h3", null, toDisplayString(unref(t)("identity.qr.scanner.invalid.title")), 1),
              createBaseVNode("button", {
                class: "identity-qr-scanner-action",
                type: "button",
                onClick: _cache[1] || (_cache[1] = ($event) => dispatch({ type: "OPEN" }))
              }, toDisplayString(unref(t)("identity.qr.scanner.action.rescan")), 1)
            ])) : phase.value === "expired_request" ? (openBlock(), createElementBlock("div", _hoisted_17$1, [
              _cache[6] || (_cache[6] = createBaseVNode("span", {
                class: "material-symbols-outlined identity-qr-scanner-status-error",
                "aria-hidden": "true"
              }, "timer_off", -1)),
              createBaseVNode("h3", null, toDisplayString(unref(t)("identity.qr.scanner.expired.title")), 1),
              createBaseVNode("button", {
                class: "identity-qr-scanner-action",
                type: "button",
                onClick: handleClose
              }, toDisplayString(unref(t)("identity.qr.scanner.action.close")), 1)
            ])) : phase.value === "loading_request" ? (openBlock(), createElementBlock("div", _hoisted_18$1, [
              _cache[7] || (_cache[7] = createBaseVNode("span", {
                class: "material-symbols-outlined identity-qr-scanner-spin",
                "aria-hidden": "true"
              }, "sync", -1)),
              createBaseVNode("h3", null, toDisplayString(unref(t)("identity.qr.scanner.submitted.title")), 1)
            ])) : phase.value === "approval_opened" ? (openBlock(), createElementBlock("div", _hoisted_19$1, [
              _cache[8] || (_cache[8] = createBaseVNode("span", {
                class: "material-symbols-outlined identity-qr-scanner-status-ok",
                "aria-hidden": "true"
              }, "verified_user", -1)),
              createBaseVNode("h3", null, toDisplayString(unref(t)("identity.qr.scanner.approval_opened.title")), 1),
              createBaseVNode("p", _hoisted_20$1, toDisplayString(unref(t)("identity.qr.scanner.approval_opened.desc")), 1),
              createBaseVNode("button", {
                class: "identity-qr-scanner-action",
                type: "button",
                onClick: handleClose
              }, toDisplayString(unref(t)("identity.qr.scanner.action.close")), 1)
            ])) : createCommentVNode("", true)
          ])
        ], 8, _hoisted_1$2)) : createCommentVNode("", true)
      ]);
    };
  }
});
const IdentityQrScanner = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-f38ee527"]]);
const _hoisted_1$1 = { class: "glass-card identity-qr-entry" };
const _hoisted_2$1 = { class: "identity-qr-entry-main" };
const _hoisted_3$1 = { class: "identity-qr-entry-text" };
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "IdentityQrLoginEntry",
  props: {
    identity: {}
  },
  setup(__props) {
    const { t } = useI18n();
    const props = __props;
    const scannerVisible = ref(false);
    const openScanner = () => {
      if (!props.identity) {
        showToast(t("identity.qr.entry.toast.unsupported"), "warning");
        return;
      }
      scannerVisible.value = true;
    };
    const submitIntent = (requestId, handoff) => {
      if (!props.identity) return;
      props.identity.submitIntent({ requestId, handoff, arrivedAt: Date.now() });
    };
    const closeScanner = () => {
      scannerVisible.value = false;
    };
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("section", _hoisted_1$1, [
        createBaseVNode("div", _hoisted_2$1, [
          _cache[0] || (_cache[0] = createBaseVNode("span", {
            class: "material-symbols-outlined identity-qr-entry-icon",
            "aria-hidden": "true"
          }, "qr_code_scanner", -1)),
          createBaseVNode("div", _hoisted_3$1, [
            createBaseVNode("h4", null, toDisplayString(unref(t)("identity.qr.entry.title")), 1),
            createBaseVNode("p", null, toDisplayString(unref(t)("identity.qr.entry.desc")), 1)
          ])
        ]),
        createBaseVNode("button", {
          class: "mini-btn btn-ripple identity-qr-entry-btn",
          type: "button",
          onClick: openScanner
        }, toDisplayString(unref(t)("identity.qr.entry.action")), 1),
        createVNode(IdentityQrScanner, {
          visible: scannerVisible.value,
          "submit-intent": submitIntent,
          onClose: closeScanner
        }, null, 8, ["visible"])
      ]);
    };
  }
});
const IdentityQrLoginEntry = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-7a34347a"]]);
const _hoisted_1 = { class: "settings-view" };
const _hoisted_2 = { class: "settings-page-header" };
const _hoisted_3 = { class: "header-title" };
const _hoisted_4 = { class: "settings-tab-bar" };
const _hoisted_5 = { class: "settings-section glass-card startup-page-section" };
const _hoisted_6 = { class: "startup-page-row" };
const _hoisted_7 = { class: "startup-page-label" };
const _hoisted_8 = { class: "startup-page-toggle" };
const _hoisted_9 = { class: "startup-page-row" };
const _hoisted_10 = { class: "startup-page-label" };
const _hoisted_11 = { class: "startup-page-toggle" };
const _hoisted_12 = { class: "settings-section glass-card" };
const _hoisted_13 = { class: "section-head" };
const _hoisted_14 = { class: "option-group" };
const _hoisted_15 = { class: "chip-row" };
const _hoisted_16 = ["onClick"];
const _hoisted_17 = { class: "theme-hint" };
const _hoisted_18 = { class: "settings-section glass-card language-section" };
const _hoisted_19 = { class: "language-row" };
const _hoisted_20 = { class: "language-label" };
const _hoisted_21 = { class: "language-toggle" };
const _hoisted_22 = ["onClick"];
const _hoisted_23 = { class: "language-hint" };
const _hoisted_24 = { class: "settings-section glass-card" };
const _hoisted_25 = { class: "option-group" };
const _hoisted_26 = { class: "chip-row" };
const _hoisted_27 = ["onClick"];
const _hoisted_28 = { class: "option-group" };
const _hoisted_29 = { class: "chip-row" };
const _hoisted_30 = ["onClick"];
const _hoisted_31 = { class: "option-group" };
const _hoisted_32 = { class: "chip-row" };
const _hoisted_33 = ["onClick"];
const _hoisted_34 = { class: "settings-section glass-card" };
const _hoisted_35 = { class: "profile-grid" };
const _hoisted_36 = ["onClick"];
const _hoisted_37 = { class: "settings-section glass-card" };
const _hoisted_38 = { class: "font-actions" };
const _hoisted_39 = { class: "font-cdn" };
const _hoisted_40 = { class: "font-cdn-row" };
const _hoisted_41 = ["onClick"];
const _hoisted_42 = { class: "font-availability" };
const _hoisted_43 = { class: "font-download-row" };
const _hoisted_44 = ["disabled"];
const _hoisted_45 = ["disabled"];
const _hoisted_46 = ["disabled"];
const _hoisted_47 = { class: "hint" };
const _hoisted_48 = {
  key: 1,
  class: "settings-section glass-card backend-shell"
};
const _hoisted_49 = { class: "section-head" };
const _hoisted_50 = { class: "backend-summary" };
const _hoisted_51 = { class: "status-pill" };
const _hoisted_52 = { class: "status-pill" };
const _hoisted_53 = { class: "status-pill" };
const _hoisted_54 = { class: "status-pill" };
const _hoisted_55 = { class: "status-pill" };
const _hoisted_56 = { class: "backend-block" };
const _hoisted_57 = { class: "section-head section-head-compact" };
const _hoisted_58 = { class: "hint" };
const _hoisted_59 = { class: "cloud-sync-status-grid" };
const _hoisted_60 = { class: "cloud-sync-status-item" };
const _hoisted_61 = { class: "cloud-sync-status-item" };
const _hoisted_62 = { class: "cloud-sync-status-item" };
const _hoisted_63 = { class: "cloud-sync-status-item" };
const _hoisted_64 = {
  key: 0,
  class: "hint cloud-sync-error"
};
const _hoisted_65 = {
  key: 1,
  class: "hint cloud-sync-error"
};
const _hoisted_66 = { class: "backend-block" };
const _hoisted_67 = { class: "toggle-text" };
const _hoisted_68 = { class: "toggle-meta" };
const _hoisted_69 = ["aria-checked"];
const _hoisted_70 = { class: "backend-block" };
const _hoisted_71 = { class: "hint" };
const _hoisted_72 = { class: "hint" };
const _hoisted_73 = {
  key: 0,
  class: "hint"
};
const _hoisted_74 = { class: "backend-grid" };
const _hoisted_75 = { class: "field" };
const _hoisted_76 = { class: "field" };
const _hoisted_77 = { class: "field" };
const _hoisted_78 = ["placeholder"];
const _hoisted_79 = { class: "field" };
const _hoisted_80 = ["placeholder"];
const _hoisted_81 = { class: "backend-block" };
const _hoisted_82 = { class: "backend-grid" };
const _hoisted_83 = { class: "field" };
const _hoisted_84 = { class: "field" };
const _hoisted_85 = { class: "field" };
const _hoisted_86 = { class: "field" };
const _hoisted_87 = { class: "field" };
const _hoisted_88 = { class: "field" };
const _hoisted_89 = { class: "field" };
const _hoisted_90 = { class: "field" };
const _hoisted_91 = { class: "field" };
const _hoisted_92 = { class: "field" };
const _hoisted_93 = { class: "field" };
const _hoisted_94 = { class: "hint" };
const _hoisted_95 = { class: "backend-block" };
const _hoisted_96 = { class: "section-head section-head-compact" };
const _hoisted_97 = ["disabled"];
const _hoisted_98 = { class: "hint" };
const _hoisted_99 = { class: "probe-list" };
const _hoisted_100 = { class: "probe-main" };
const _hoisted_101 = { class: "probe-url" };
const _hoisted_102 = {
  key: 0,
  class: "hint"
};
const _hoisted_103 = {
  key: 2,
  class: "settings-section identity-security-tab"
};
const _hoisted_104 = { class: "section-head" };
const _hoisted_105 = {
  key: 3,
  class: "settings-section glass-card debug-shell"
};
const _hoisted_106 = { class: "section-head" };
const _hoisted_107 = { class: "debug-head-actions" };
const _hoisted_108 = { class: "backend-summary" };
const _hoisted_109 = { class: "status-pill" };
const _hoisted_110 = { class: "status-pill" };
const _hoisted_111 = { class: "status-pill" };
const _hoisted_112 = { class: "debug-filter-row" };
const _hoisted_113 = ["onClick"];
const _hoisted_114 = {
  ref: "debugPanelRef",
  class: "debug-log-panel"
};
const _hoisted_115 = { class: "debug-log-head" };
const _hoisted_116 = { class: "debug-time" };
const _hoisted_117 = { class: "debug-level" };
const _hoisted_118 = { class: "debug-scope" };
const _hoisted_119 = { class: "debug-message" };
const _hoisted_120 = {
  key: 0,
  class: "hint"
};
const _hoisted_121 = {
  key: 4,
  class: "font-modal"
};
const _hoisted_122 = { class: "font-modal-card" };
const _hoisted_123 = { class: "font-modal-progress" };
const _hoisted_124 = { class: "progress-bar" };
const _hoisted_125 = { key: 0 };
const _hoisted_126 = { key: 1 };
const _hoisted_127 = { key: 2 };
const _hoisted_128 = { key: 3 };
const _hoisted_129 = {
  key: 0,
  class: "font-step"
};
const _hoisted_130 = {
  key: 1,
  class: "font-error"
};
const _hoisted_131 = { class: "font-modal-actions" };
const _hoisted_132 = { class: "theme-scene" };
const _hoisted_133 = { class: "theme-moon-anim" };
const _hoisted_134 = { class: "moon-stars" };
const _hoisted_135 = { class: "theme-transition-text" };
function render(_ctx, _cache, $props, $setup, $data, $options) {
  return openBlock(), createElementBlock(Fragment, null, [
    createBaseVNode("div", _hoisted_1, [
      createBaseVNode("header", _hoisted_2, [
        createBaseVNode("button", {
          class: "header-icon-btn",
          onClick: _cache[0] || (_cache[0] = ($event) => $setup.emit("back"))
        }, [..._cache[36] || (_cache[36] = [
          createBaseVNode("span", { class: "material-symbols-outlined" }, "arrow_back", -1)
        ])]),
        createBaseVNode("h1", _hoisted_3, toDisplayString($setup.t("settings.title")), 1),
        _cache[37] || (_cache[37] = createBaseVNode("div", { class: "header-spacer" }, null, -1))
      ]),
      createBaseVNode("div", _hoisted_4, [
        createBaseVNode("button", {
          class: normalizeClass(["settings-tab-item", { active: $setup.activeTab === "appearance" }]),
          onClick: _cache[1] || (_cache[1] = ($event) => $setup.activeTab = "appearance")
        }, toDisplayString($setup.t("settings.tab.appearance")), 3),
        createBaseVNode("button", {
          class: normalizeClass(["settings-tab-item", { active: $setup.activeTab === "backend" }]),
          onClick: _cache[2] || (_cache[2] = ($event) => $setup.activeTab = "backend")
        }, toDisplayString($setup.t("settings.tab.backend")), 3),
        createBaseVNode("button", {
          class: normalizeClass(["settings-tab-item", { active: $setup.activeTab === "security" }]),
          onClick: _cache[3] || (_cache[3] = ($event) => $setup.activeTab = "security")
        }, toDisplayString($setup.t("settings.tab.security")), 3),
        createBaseVNode("button", {
          class: normalizeClass(["settings-tab-item", { active: $setup.activeTab === "debug" }]),
          onClick: _cache[4] || (_cache[4] = ($event) => $setup.activeTab = "debug")
        }, toDisplayString($setup.t("settings.tab.debug")), 3)
      ]),
      $setup.activeTab === "appearance" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
        createBaseVNode("section", _hoisted_5, [
          createBaseVNode("div", _hoisted_6, [
            createBaseVNode("span", _hoisted_7, toDisplayString($setup.t("settings.startup.page.label")), 1),
            createBaseVNode("div", _hoisted_8, [
              createBaseVNode("button", {
                class: normalizeClass(["toggle-btn btn-ripple", { active: $setup.uiSettings.startupPage === "home" }]),
                onClick: _cache[5] || (_cache[5] = ($event) => {
                  $setup.uiSettings.startupPage = "home";
                  $setup.showToast($setup.t("settings.startup.page.toastHome"), "success");
                })
              }, toDisplayString($setup.t("settings.startup.page.home")), 3),
              createBaseVNode("button", {
                class: normalizeClass(["toggle-btn btn-ripple", { active: $setup.uiSettings.startupPage === "schedule" }]),
                onClick: _cache[6] || (_cache[6] = ($event) => {
                  $setup.uiSettings.startupPage = "schedule";
                  $setup.showToast($setup.t("settings.startup.page.toastSchedule"), "success");
                })
              }, toDisplayString($setup.t("settings.startup.page.schedule")), 3)
            ])
          ]),
          createBaseVNode("div", _hoisted_9, [
            createBaseVNode("span", _hoisted_10, toDisplayString($setup.t("settings.startup.splash.label")), 1),
            createBaseVNode("div", _hoisted_11, [
              createBaseVNode("button", {
                class: normalizeClass(["toggle-btn btn-ripple", { active: $setup.uiSettings.splashEnabled }]),
                onClick: _cache[7] || (_cache[7] = ($event) => {
                  $setup.uiSettings.splashEnabled = true;
                  $setup.showToast($setup.t("settings.startup.splash.toastOn"), "success");
                })
              }, toDisplayString($setup.t("settings.startup.splash.on")), 3),
              createBaseVNode("button", {
                class: normalizeClass(["toggle-btn btn-ripple", { active: !$setup.uiSettings.splashEnabled }]),
                onClick: _cache[8] || (_cache[8] = ($event) => {
                  $setup.uiSettings.splashEnabled = false;
                  $setup.showToast($setup.t("settings.startup.splash.toastOff"), "success");
                })
              }, toDisplayString($setup.t("settings.startup.splash.off")), 3)
            ])
          ])
        ]),
        createBaseVNode("section", _hoisted_12, [
          createBaseVNode("div", _hoisted_13, [
            createBaseVNode("h3", null, toDisplayString($setup.t("settings.theme.title")), 1)
          ]),
          createBaseVNode("div", _hoisted_14, [
            createBaseVNode("label", null, toDisplayString($setup.t("settings.theme.modeLabel")), 1),
            createBaseVNode("div", _hoisted_15, [
              (openBlock(), createElementBlock(Fragment, null, renderList($setup.nightModeOptions, (item) => {
                return createBaseVNode("button", {
                  key: item.key,
                  class: normalizeClass(["option-chip", { active: $setup.nightModePreference === item.key }]),
                  onClick: ($event) => $setup.setNightMode(item.key)
                }, [
                  createBaseVNode("strong", null, toDisplayString($setup.t(item.labelKey)), 1),
                  createBaseVNode("small", null, toDisplayString($setup.t(item.descKey)), 1)
                ], 10, _hoisted_16);
              }), 64))
            ]),
            createBaseVNode("p", _hoisted_17, toDisplayString($setup.nightModeHint), 1)
          ])
        ]),
        createBaseVNode("section", _hoisted_18, [
          createBaseVNode("div", _hoisted_19, [
            createBaseVNode("span", _hoisted_20, toDisplayString($setup.t("settings.language.label")), 1),
            createBaseVNode("div", _hoisted_21, [
              (openBlock(), createElementBlock(Fragment, null, renderList($setup.localeOptions, (item) => {
                return createBaseVNode("button", {
                  key: item.key,
                  class: normalizeClass(["toggle-btn btn-ripple", { active: $setup.locale === item.key }]),
                  onClick: ($event) => $setup.handleLocaleChange(item.key)
                }, toDisplayString(item.label), 11, _hoisted_22);
              }), 64))
            ])
          ]),
          createBaseVNode("p", _hoisted_23, toDisplayString($setup.t("settings.language.hint")), 1)
        ]),
        createBaseVNode("section", _hoisted_24, [
          createBaseVNode("h3", null, toDisplayString($setup.t("settings.personalize.title")), 1),
          createBaseVNode("div", _hoisted_25, [
            createBaseVNode("label", null, toDisplayString($setup.t("settings.personalize.card.label")), 1),
            createBaseVNode("div", _hoisted_26, [
              (openBlock(), createElementBlock(Fragment, null, renderList($setup.cardStyleOptions, (item) => {
                return createBaseVNode("button", {
                  key: item.key,
                  class: normalizeClass(["option-chip", { active: $setup.uiSettings.profile.cardStyle === item.key }]),
                  onClick: ($event) => $setup.setProfileOption("cardStyle", item.key, $setup.t(item.labelKey))
                }, [
                  createBaseVNode("strong", null, toDisplayString($setup.t(item.labelKey)), 1),
                  createBaseVNode("small", null, toDisplayString($setup.t(item.descKey)), 1)
                ], 10, _hoisted_27);
              }), 64))
            ])
          ]),
          createBaseVNode("div", _hoisted_28, [
            createBaseVNode("label", null, toDisplayString($setup.t("settings.personalize.nav.label")), 1),
            createBaseVNode("div", _hoisted_29, [
              (openBlock(), createElementBlock(Fragment, null, renderList($setup.navStyleOptions, (item) => {
                return createBaseVNode("button", {
                  key: item.key,
                  class: normalizeClass(["option-chip", { active: $setup.uiSettings.profile.navStyle === item.key }]),
                  onClick: ($event) => $setup.setProfileOption("navStyle", item.key, $setup.t(item.labelKey))
                }, [
                  createBaseVNode("strong", null, toDisplayString($setup.t(item.labelKey)), 1),
                  createBaseVNode("small", null, toDisplayString($setup.t(item.descKey)), 1)
                ], 10, _hoisted_30);
              }), 64))
            ])
          ]),
          createBaseVNode("div", _hoisted_31, [
            createBaseVNode("label", null, toDisplayString($setup.t("settings.personalize.density.label")), 1),
            createBaseVNode("div", _hoisted_32, [
              (openBlock(), createElementBlock(Fragment, null, renderList($setup.densityOptions, (item) => {
                return createBaseVNode("button", {
                  key: item.key,
                  class: normalizeClass(["option-chip", { active: $setup.uiSettings.profile.density === item.key }]),
                  onClick: ($event) => $setup.setProfileOption("density", item.key, $setup.t(item.labelKey))
                }, [
                  createBaseVNode("strong", null, toDisplayString($setup.t(item.labelKey)), 1),
                  createBaseVNode("small", null, toDisplayString($setup.t(item.descKey)), 1)
                ], 10, _hoisted_33);
              }), 64))
            ])
          ])
        ]),
        createBaseVNode("section", _hoisted_34, [
          createBaseVNode("h3", null, toDisplayString($setup.t("settings.profile.title")), 1),
          createBaseVNode("div", _hoisted_35, [
            (openBlock(), createElementBlock(Fragment, null, renderList($setup.interactionProfiles, (profile) => {
              return createBaseVNode("button", {
                key: profile.key,
                class: "profile-card",
                onClick: ($event) => $setup.handleApplyProfile(profile)
              }, [
                createBaseVNode("strong", null, toDisplayString($setup.t(profile.labelKey)), 1),
                createBaseVNode("span", null, toDisplayString($setup.t(profile.descKey)), 1)
              ], 8, _hoisted_36);
            }), 64))
          ])
        ]),
        createBaseVNode("section", _hoisted_37, [
          createBaseVNode("h3", null, toDisplayString($setup.t("settings.font.title")), 1),
          createBaseVNode("div", _hoisted_38, [
            createBaseVNode("button", {
              class: normalizeClass(["font-btn btn-ripple", { active: $setup.fontSettings.font === "default" }]),
              onClick: _cache[9] || (_cache[9] = ($event) => $setup.handleSelectFont("default"))
            }, toDisplayString($setup.t("settings.font.name.default")), 3),
            createBaseVNode("button", {
              class: normalizeClass(["font-btn btn-ripple", { active: $setup.fontSettings.font === "heiti" }]),
              onClick: _cache[10] || (_cache[10] = ($event) => $setup.handleSelectFont("heiti"))
            }, toDisplayString($setup.t("settings.font.name.heiti")), 3),
            createBaseVNode("button", {
              class: normalizeClass(["font-btn btn-ripple", { active: $setup.fontSettings.font === "songti" }]),
              onClick: _cache[11] || (_cache[11] = ($event) => $setup.handleSelectFont("songti"))
            }, toDisplayString($setup.t("settings.font.name.songti")), 3),
            createBaseVNode("button", {
              class: normalizeClass(["font-btn btn-ripple", { active: $setup.fontSettings.font === "kaiti" }]),
              onClick: _cache[12] || (_cache[12] = ($event) => $setup.handleSelectFont("kaiti"))
            }, toDisplayString($setup.t("settings.font.name.kaiti")), 3),
            createBaseVNode("button", {
              class: normalizeClass(["font-btn btn-ripple", { active: $setup.fontSettings.font === "fangsong" }]),
              onClick: _cache[13] || (_cache[13] = ($event) => $setup.handleSelectFont("fangsong"))
            }, toDisplayString($setup.t("settings.font.name.fangsong")), 3),
            createBaseVNode("button", {
              class: normalizeClass(["font-btn btn-ripple", { active: $setup.fontSettings.font === "deyihei" }]),
              onClick: _cache[14] || (_cache[14] = ($event) => $setup.handleSelectFont("deyihei"))
            }, toDisplayString($setup.t("settings.font.name.deyiheiNeedsDownload")), 3)
          ]),
          createBaseVNode("div", _hoisted_39, [
            createBaseVNode("label", null, toDisplayString($setup.t("settings.font.cdn.label")), 1),
            createBaseVNode("div", _hoisted_40, [
              (openBlock(true), createElementBlock(Fragment, null, renderList($setup.fontCdnOptions, (option) => {
                return openBlock(), createElementBlock("button", {
                  key: option.key,
                  class: normalizeClass(["font-cdn-btn btn-ripple", { active: $setup.fontSettings.cdnProvider === option.key }]),
                  onClick: ($event) => $setup.handleSelectCdnProvider(option.key)
                }, [
                  createBaseVNode("strong", null, toDisplayString($setup.t(`settings.font.cdn.${option.key}.label`)), 1),
                  createBaseVNode("small", null, toDisplayString($setup.t(`settings.font.cdn.${option.key}.desc`)), 1)
                ], 10, _hoisted_41);
              }), 128))
            ])
          ]),
          createBaseVNode("div", _hoisted_42, [
            createBaseVNode("label", null, toDisplayString($setup.t("settings.font.availability.title")), 1),
            createBaseVNode("ul", null, [
              (openBlock(true), createElementBlock(Fragment, null, renderList($setup.fontLocalAvailability, (item) => {
                return openBlock(), createElementBlock("li", { key: item }, toDisplayString(item), 1);
              }), 128))
            ])
          ]),
          createBaseVNode("div", _hoisted_43, [
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              disabled: $setup.downloadingFont,
              onClick: _cache[15] || (_cache[15] = ($event) => $setup.handleDownloadFont($setup.fontSettings.loaded))
            }, toDisplayString($setup.downloadingFont ? $setup.t("settings.font.btn.downloading") : $setup.fontSettings.loaded ? $setup.t("settings.font.btn.reDownload") : $setup.t("settings.font.btn.download")), 9, _hoisted_44),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              disabled: $setup.cdnPrefetching,
              onClick: _cache[16] || (_cache[16] = ($event) => $setup.handlePrefetchFonts(false))
            }, toDisplayString($setup.cdnPrefetching ? $setup.t("settings.font.btn.caching") : $setup.prefetchButtonText), 9, _hoisted_45),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              disabled: $setup.cdnPrefetching,
              onClick: _cache[17] || (_cache[17] = ($event) => $setup.handlePrefetchFonts(false, true))
            }, toDisplayString($setup.cdnPrefetching ? $setup.t("settings.font.btn.caching") : $setup.t("settings.font.btn.cacheAll")), 9, _hoisted_46),
            createBaseVNode("span", _hoisted_47, toDisplayString($setup.t("settings.font.hint.autoSave")), 1)
          ])
        ])
      ], 64)) : $setup.activeTab === "backend" ? (openBlock(), createElementBlock("section", _hoisted_48, [
        createBaseVNode("div", _hoisted_49, [
          createBaseVNode("h3", null, toDisplayString($setup.t("settings.backend.title")), 1),
          createBaseVNode("button", {
            class: "mini-btn btn-ripple",
            onClick: $setup.handleResetBackend
          }, toDisplayString($setup.t("settings.backend.resetBtn")), 1)
        ]),
        createBaseVNode("div", _hoisted_50, [
          createBaseVNode("span", _hoisted_51, toDisplayString($setup.t("settings.backend.summary.source")) + toDisplayString($setup.backendSourceLabel), 1),
          createBaseVNode("span", _hoisted_52, toDisplayString($setup.t("settings.backend.summary.runtime")) + toDisplayString($setup.runtimeLabel), 1),
          createBaseVNode("span", _hoisted_53, toDisplayString($setup.t("settings.backend.summary.previewThreads")) + toDisplayString($setup.activePreviewThreads), 1),
          createBaseVNode("span", _hoisted_54, toDisplayString($setup.t("settings.backend.summary.downloadThreads")) + toDisplayString($setup.activeDownloadThreads), 1),
          createBaseVNode("span", _hoisted_55, toDisplayString($setup.t("settings.backend.summary.device")) + toDisplayString($setup.activeDeviceLabel), 1)
        ]),
        createBaseVNode("div", _hoisted_56, [
          createBaseVNode("div", _hoisted_57, [
            createBaseVNode("h4", null, toDisplayString($setup.t("settings.backend.cloudSync.title")), 1),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              onClick: $setup.refreshCloudSyncStatus
            }, toDisplayString($setup.t("settings.backend.cloudSync.refreshBtn")), 1)
          ]),
          createBaseVNode("p", _hoisted_58, toDisplayString($setup.t("settings.backend.cloudSync.hint")), 1),
          createBaseVNode("div", _hoisted_59, [
            createBaseVNode("article", _hoisted_60, [
              createBaseVNode("small", null, toDisplayString($setup.t("settings.backend.cloudSync.statusLabel")), 1),
              createBaseVNode("strong", {
                class: normalizeClass({ ok: $setup.cloudSyncRuntime.enabled, error: !$setup.cloudSyncRuntime.enabled })
              }, toDisplayString($setup.cloudSyncEnabledText), 3)
            ]),
            createBaseVNode("article", _hoisted_61, [
              createBaseVNode("small", null, toDisplayString($setup.t("settings.backend.cloudSync.lastUpload")), 1),
              createBaseVNode("strong", {
                class: normalizeClass({ ok: $setup.cloudSyncStatus?.lastUploadOk, error: $setup.cloudSyncStatus?.lastUploadAt && !$setup.cloudSyncStatus?.lastUploadOk })
              }, toDisplayString($setup.cloudSyncUploadStatusText), 3),
              createBaseVNode("span", null, toDisplayString($setup.formatStatusTime($setup.cloudSyncStatus?.lastUploadAt)), 1)
            ]),
            createBaseVNode("article", _hoisted_62, [
              createBaseVNode("small", null, toDisplayString($setup.t("settings.backend.cloudSync.lastDownload")), 1),
              createBaseVNode("strong", {
                class: normalizeClass({ ok: $setup.cloudSyncStatus?.lastDownloadOk, error: $setup.cloudSyncStatus?.lastDownloadAt && !$setup.cloudSyncStatus?.lastDownloadOk })
              }, toDisplayString($setup.cloudSyncDownloadStatusText), 3),
              createBaseVNode("span", null, toDisplayString($setup.formatStatusTime($setup.cloudSyncStatus?.lastDownloadAt)), 1)
            ]),
            createBaseVNode("article", _hoisted_63, [
              createBaseVNode("small", null, toDisplayString($setup.t("settings.backend.cloudSync.lastUpdated")), 1),
              createBaseVNode("strong", null, toDisplayString($setup.cloudSyncStatusUpdatedAt || "—"), 1),
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.cloudSync.studentId")) + toDisplayString($setup.cloudSyncStatus?.studentId || $setup.currentStudentId), 1)
            ])
          ]),
          $setup.cloudSyncLastUploadError ? (openBlock(), createElementBlock("p", _hoisted_64, toDisplayString($setup.t("settings.backend.cloudSync.uploadError")) + toDisplayString($setup.cloudSyncLastUploadError), 1)) : createCommentVNode("", true),
          $setup.cloudSyncLastDownloadError ? (openBlock(), createElementBlock("p", _hoisted_65, toDisplayString($setup.t("settings.backend.cloudSync.downloadError")) + toDisplayString($setup.cloudSyncLastDownloadError), 1)) : createCommentVNode("", true)
        ]),
        createBaseVNode("div", _hoisted_66, [
          createBaseVNode("div", {
            class: normalizeClass(["toggle-row", {
              active: $setup.localOnlyModeEnabled,
              inactive: !$setup.localOnlyModeEnabled
            }])
          }, [
            createBaseVNode("div", _hoisted_67, [
              createBaseVNode("strong", null, toDisplayString($setup.t("settings.backend.localOnly.title")), 1),
              createBaseVNode("small", null, toDisplayString($setup.t("settings.backend.localOnly.desc")), 1)
            ]),
            createBaseVNode("div", _hoisted_68, [
              createBaseVNode("span", {
                class: normalizeClass(["toggle-badge", {
                  active: $setup.localOnlyModeEnabled,
                  inactive: !$setup.localOnlyModeEnabled
                }])
              }, toDisplayString($setup.localOnlyModeEnabled ? $setup.t("settings.backend.localOnly.badgeLocal") : $setup.t("settings.backend.localOnly.badgeRemote")), 3),
              createBaseVNode("button", {
                type: "button",
                class: normalizeClass(["toggle-switch", { checked: $setup.localOnlyModeEnabled }]),
                role: "switch",
                "aria-checked": $setup.localOnlyModeEnabled,
                onClick: $setup.handleRemoteModeChanged
              }, [..._cache[38] || (_cache[38] = [
                createBaseVNode("span", { class: "toggle-thumb" }, null, -1)
              ])], 10, _hoisted_69)
            ])
          ], 2)
        ]),
        createBaseVNode("div", _hoisted_70, [
          createBaseVNode("h4", null, toDisplayString($setup.t("settings.backend.local.title")), 1),
          createBaseVNode("p", _hoisted_71, toDisplayString($setup.t("settings.backend.local.hint1")), 1),
          createBaseVNode("p", _hoisted_72, toDisplayString($setup.t("settings.backend.local.hint2")), 1),
          $setup.appSettings.backend.useRemoteConfig ? (openBlock(), createElementBlock("p", _hoisted_73, toDisplayString($setup.t("settings.backend.local.remoteHint")), 1)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_74, [
            createBaseVNode("label", _hoisted_75, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.ocr")), 1),
              withDirectives(createBaseVNode("input", {
                type: "text",
                placeholder: "https://your-ocr.example/api/ocr/recognize",
                "onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => $setup.appSettings.backend.ocrEndpoint = $event)
              }, null, 512), [
                [
                  vModelText,
                  $setup.appSettings.backend.ocrEndpoint,
                  void 0,
                  { trim: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_76, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.upload")), 1),
              withDirectives(createBaseVNode("input", {
                type: "text",
                placeholder: "https://your-upload.example/api/temp/upload",
                "onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => $setup.appSettings.backend.tempUploadEndpoint = $event)
              }, null, 512), [
                [
                  vModelText,
                  $setup.appSettings.backend.tempUploadEndpoint,
                  void 0,
                  { trim: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_77, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.cloudSyncEndpoint")), 1),
              withDirectives(createBaseVNode("input", {
                type: "text",
                placeholder: $setup.t("settings.backend.field.cloudSyncEndpointPlaceholder", { url: $setup.DEFAULT_CLOUD_SYNC_ENDPOINT }),
                "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => $setup.appSettings.backend.cloudSyncEndpoint = $event)
              }, null, 8, _hoisted_78), [
                [
                  vModelText,
                  $setup.appSettings.backend.cloudSyncEndpoint,
                  void 0,
                  { trim: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_79, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.cloudSyncSecretRef")), 1),
              withDirectives(createBaseVNode("input", {
                type: "text",
                placeholder: $setup.t("settings.backend.field.cloudSyncSecretRefPlaceholder"),
                "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => $setup.appSettings.backend.cloudSyncSecretRef = $event)
              }, null, 8, _hoisted_80), [
                [
                  vModelText,
                  $setup.appSettings.backend.cloudSyncSecretRef,
                  void 0,
                  { trim: true }
                ]
              ])
            ])
          ])
        ]),
        createBaseVNode("div", _hoisted_81, [
          createBaseVNode("h4", null, toDisplayString($setup.t("settings.backend.moduleParams.title")), 1),
          createBaseVNode("div", _hoisted_82, [
            createBaseVNode("label", _hoisted_83, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.electricityRetries")), 1),
              withDirectives(createBaseVNode("input", {
                type: "number",
                min: "0",
                max: "5",
                "onUpdate:modelValue": _cache[22] || (_cache[22] = ($event) => $setup.appSettings.retry.electricity = $event)
              }, null, 512), [
                [
                  vModelText,
                  $setup.appSettings.retry.electricity,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_84, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.classroomRetries")), 1),
              withDirectives(createBaseVNode("input", {
                type: "number",
                min: "0",
                max: "5",
                "onUpdate:modelValue": _cache[23] || (_cache[23] = ($event) => $setup.appSettings.retry.classroom = $event)
              }, null, 512), [
                [
                  vModelText,
                  $setup.appSettings.retry.classroom,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_85, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.retryDelay")), 1),
              withDirectives(createBaseVNode("input", {
                type: "number",
                min: "500",
                max: "10000",
                step: "100",
                "onUpdate:modelValue": _cache[24] || (_cache[24] = ($event) => $setup.appSettings.retryDelayMs = $event)
              }, null, 512), [
                [
                  vModelText,
                  $setup.appSettings.retryDelayMs,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_86, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.notifyTimeout")), 1),
              withDirectives(createBaseVNode("input", {
                type: "number",
                min: "5000",
                max: "60000",
                step: "500",
                "onUpdate:modelValue": _cache[25] || (_cache[25] = ($event) => $setup.appSettings.backend.moduleParams.requestTimeoutMs = $event)
              }, null, 512), [
                [
                  vModelText,
                  $setup.appSettings.backend.moduleParams.requestTimeoutMs,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_87, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.probeTimeout")), 1),
              withDirectives(createBaseVNode("input", {
                type: "number",
                min: "3000",
                max: "30000",
                step: "500",
                "onUpdate:modelValue": _cache[26] || (_cache[26] = ($event) => $setup.appSettings.backend.moduleParams.probeTimeoutMs = $event)
              }, null, 512), [
                [
                  vModelText,
                  $setup.appSettings.backend.moduleParams.probeTimeoutMs,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_88, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.uploadCooldown")), 1),
              withDirectives(createBaseVNode("input", {
                type: "number",
                min: "120",
                max: "3600",
                step: "10",
                "onUpdate:modelValue": _cache[27] || (_cache[27] = ($event) => $setup.appSettings.backend.moduleParams.cloudSyncUploadCooldownSec = $event)
              }, null, 512), [
                [
                  vModelText,
                  $setup.appSettings.backend.moduleParams.cloudSyncUploadCooldownSec,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_89, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.downloadCooldown")), 1),
              withDirectives(createBaseVNode("input", {
                type: "number",
                min: "10",
                max: "3600",
                step: "5",
                "onUpdate:modelValue": _cache[28] || (_cache[28] = ($event) => $setup.appSettings.backend.moduleParams.cloudSyncDownloadCooldownSec = $event)
              }, null, 512), [
                [
                  vModelText,
                  $setup.appSettings.backend.moduleParams.cloudSyncDownloadCooldownSec,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_90, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.previewThreadsMobile")), 1),
              withDirectives(createBaseVNode("input", {
                type: "number",
                min: "1",
                max: "8",
                step: "1",
                "onUpdate:modelValue": _cache[29] || (_cache[29] = ($event) => $setup.appSettings.resourceShare.previewThreadsMobile = $event)
              }, null, 512), [
                [
                  vModelText,
                  $setup.appSettings.resourceShare.previewThreadsMobile,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_91, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.previewThreadsDesktop")), 1),
              withDirectives(createBaseVNode("input", {
                type: "number",
                min: "1",
                max: "12",
                step: "1",
                "onUpdate:modelValue": _cache[30] || (_cache[30] = ($event) => $setup.appSettings.resourceShare.previewThreadsDesktop = $event)
              }, null, 512), [
                [
                  vModelText,
                  $setup.appSettings.resourceShare.previewThreadsDesktop,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_92, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.downloadThreadsMobile")), 1),
              withDirectives(createBaseVNode("input", {
                type: "number",
                min: "1",
                max: "8",
                step: "1",
                "onUpdate:modelValue": _cache[31] || (_cache[31] = ($event) => $setup.appSettings.resourceShare.downloadThreadsMobile = $event)
              }, null, 512), [
                [
                  vModelText,
                  $setup.appSettings.resourceShare.downloadThreadsMobile,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_93, [
              createBaseVNode("span", null, toDisplayString($setup.t("settings.backend.field.downloadThreadsDesktop")), 1),
              withDirectives(createBaseVNode("input", {
                type: "number",
                min: "1",
                max: "12",
                step: "1",
                "onUpdate:modelValue": _cache[32] || (_cache[32] = ($event) => $setup.appSettings.resourceShare.downloadThreadsDesktop = $event)
              }, null, 512), [
                [
                  vModelText,
                  $setup.appSettings.resourceShare.downloadThreadsDesktop,
                  void 0,
                  { number: true }
                ]
              ])
            ])
          ]),
          createBaseVNode("p", _hoisted_94, toDisplayString($setup.t("settings.backend.threads.hint")), 1)
        ]),
        createBaseVNode("div", _hoisted_95, [
          createBaseVNode("div", _hoisted_96, [
            createBaseVNode("h4", null, toDisplayString($setup.t("settings.probe.title")), 1),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              disabled: $setup.probeRunning,
              onClick: $setup.handleRunConnectivityTest
            }, toDisplayString($setup.probeRunning ? $setup.t("settings.probe.testingBtn") : $setup.t("settings.probe.startBtn")), 9, _hoisted_97)
          ]),
          createBaseVNode("p", _hoisted_98, toDisplayString($setup.t("settings.probe.hint")), 1),
          createBaseVNode("div", _hoisted_99, [
            (openBlock(true), createElementBlock(Fragment, null, renderList($setup.probeRows, (item) => {
              return openBlock(), createElementBlock("article", {
                key: item.id,
                class: "probe-item"
              }, [
                createBaseVNode("div", _hoisted_100, [
                  createBaseVNode("strong", null, toDisplayString($setup.t(item.labelKey)), 1),
                  createBaseVNode("small", null, toDisplayString($setup.t(item.descKey)), 1),
                  createBaseVNode("code", _hoisted_101, toDisplayString(item.url || $setup.t("settings.probe.unsetUrl")), 1)
                ]),
                createBaseVNode("span", {
                  class: normalizeClass(["probe-state", $setup.probeStateClass(item.id)])
                }, toDisplayString($setup.probeStateText(item.id)), 3)
              ]);
            }), 128))
          ]),
          $setup.probeFinishedAt ? (openBlock(), createElementBlock("p", _hoisted_102, toDisplayString($setup.t("settings.probe.lastRun")) + toDisplayString($setup.probeFinishedAt), 1)) : createCommentVNode("", true)
        ])
      ])) : $setup.activeTab === "security" ? (openBlock(), createElementBlock("section", _hoisted_103, [
        createBaseVNode("div", _hoisted_104, [
          createBaseVNode("h3", null, toDisplayString($setup.t("settings.security.title")), 1)
        ]),
        createVNode($setup["IdentityQrLoginEntry"], { identity: $props.identity }, null, 8, ["identity"]),
        createVNode($setup["IdentityDeviceSettings"])
      ])) : (openBlock(), createElementBlock("section", _hoisted_105, [
        createBaseVNode("div", _hoisted_106, [
          createBaseVNode("h3", null, toDisplayString($setup.t("settings.debug.title")), 1),
          createBaseVNode("div", _hoisted_107, [
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              onClick: $setup.refreshDebugPanel
            }, toDisplayString($setup.t("settings.debug.btn.refresh")), 1),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              onClick: $setup.handleCopyDebugLogs
            }, toDisplayString($setup.t("settings.debug.btn.copy")), 1),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple danger",
              onClick: $setup.handleClearDebugPanel
            }, toDisplayString($setup.t("settings.debug.btn.clear")), 1)
          ])
        ]),
        createBaseVNode("div", _hoisted_108, [
          createBaseVNode("span", _hoisted_109, toDisplayString($setup.t("settings.debug.stats.total")) + toDisplayString($setup.debugStats.total), 1),
          createBaseVNode("span", _hoisted_110, toDisplayString($setup.t("settings.debug.stats.warns")) + toDisplayString($setup.debugStats.warns), 1),
          createBaseVNode("span", _hoisted_111, toDisplayString($setup.t("settings.debug.stats.errors")) + toDisplayString($setup.debugStats.errors), 1)
        ]),
        createBaseVNode("div", _hoisted_112, [
          (openBlock(), createElementBlock(Fragment, null, renderList($setup.debugLevelOptions, (option) => {
            return createBaseVNode("button", {
              key: option.key,
              class: normalizeClass(["debug-filter-btn btn-ripple", { active: $setup.debugFilter === option.key }]),
              onClick: ($event) => $setup.debugFilter = option.key
            }, toDisplayString($setup.t(option.labelKey)), 11, _hoisted_113);
          }), 64))
        ]),
        createBaseVNode("div", _hoisted_114, [
          (openBlock(true), createElementBlock(Fragment, null, renderList($setup.filteredDebugLogs, (item) => {
            return openBlock(), createElementBlock("article", {
              key: item.id,
              class: normalizeClass(["debug-log-item", `lvl-${item.level}`])
            }, [
              createBaseVNode("header", _hoisted_115, [
                createBaseVNode("span", _hoisted_116, toDisplayString($setup.formatDebugTime(item.ts)), 1),
                createBaseVNode("span", _hoisted_117, toDisplayString(String(item.level || "log").toUpperCase()), 1),
                createBaseVNode("span", _hoisted_118, toDisplayString(item.scope), 1)
              ]),
              createBaseVNode("p", _hoisted_119, toDisplayString(item.message), 1)
            ], 2);
          }), 128)),
          !$setup.filteredDebugLogs.length ? (openBlock(), createElementBlock("p", _hoisted_120, toDisplayString($setup.t("settings.debug.empty")), 1)) : createCommentVNode("", true)
        ], 512)
      ])),
      $setup.showFontModal ? (openBlock(), createElementBlock("div", _hoisted_121, [
        createBaseVNode("div", _hoisted_122, [
          createBaseVNode("h3", null, toDisplayString($setup.fontModalTitle), 1),
          createBaseVNode("p", null, toDisplayString($setup.fontModalDescription), 1),
          createBaseVNode("div", _hoisted_123, [
            createBaseVNode("div", _hoisted_124, [
              createBaseVNode("div", {
                class: "progress-fill",
                style: normalizeStyle({ width: `${$setup.fontDownloadProgress}%` })
              }, null, 4)
            ]),
            $setup.fontDownloadStatus === "downloading" ? (openBlock(), createElementBlock("span", _hoisted_125, toDisplayString($setup.t("settings.font.modal.downloading")), 1)) : $setup.fontDownloadStatus === "success" ? (openBlock(), createElementBlock("span", _hoisted_126, toDisplayString($setup.t("settings.font.modal.success")), 1)) : $setup.fontDownloadStatus === "failed" ? (openBlock(), createElementBlock("span", _hoisted_127, toDisplayString($setup.t("settings.font.modal.failed")), 1)) : (openBlock(), createElementBlock("span", _hoisted_128, toDisplayString($setup.t("settings.font.modal.waiting")), 1))
          ]),
          $setup.fontDownloadStep ? (openBlock(), createElementBlock("p", _hoisted_129, toDisplayString($setup.fontDownloadStep), 1)) : createCommentVNode("", true),
          $setup.fontDownloadError ? (openBlock(), createElementBlock("p", _hoisted_130, toDisplayString($setup.fontDownloadError), 1)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_131, [
            $setup.fontDownloadStatus === "failed" && $setup.fontModalRetryMode === "deyihei" ? (openBlock(), createElementBlock("button", {
              key: 0,
              class: "btn-secondary btn-ripple",
              onClick: _cache[33] || (_cache[33] = ($event) => $setup.handleDownloadFont(true))
            }, toDisplayString($setup.t("settings.font.modal.retryDownload")), 1)) : createCommentVNode("", true),
            $setup.fontDownloadStatus === "failed" && $setup.fontModalRetryMode === "prefetch" ? (openBlock(), createElementBlock("button", {
              key: 1,
              class: "btn-secondary btn-ripple",
              onClick: _cache[34] || (_cache[34] = ($event) => $setup.handlePrefetchFonts(true))
            }, toDisplayString($setup.t("settings.font.modal.retryPrefetch")), 1)) : createCommentVNode("", true),
            createBaseVNode("button", {
              class: "btn-primary btn-ripple",
              onClick: _cache[35] || (_cache[35] = ($event) => $setup.showFontModal = false)
            }, toDisplayString($setup.t("settings.font.modal.close")), 1)
          ])
        ])
      ])) : createCommentVNode("", true)
    ]),
    (openBlock(), createBlock(Teleport, { to: "body" }, [
      $setup.themeTransitioning ? (openBlock(), createElementBlock("div", {
        key: 0,
        class: normalizeClass(["theme-fullscreen-overlay", $setup.themeTransitionType])
      }, [
        createBaseVNode("div", _hoisted_132, [
          _cache[43] || (_cache[43] = createBaseVNode("div", { class: "theme-horizon" }, null, -1)),
          $setup.themeTransitionType === "to-light" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            _cache[39] || (_cache[39] = createBaseVNode("div", { class: "theme-sun-anim" }, [
              createBaseVNode("div", { class: "sun-body" }, [
                createBaseVNode("i", { class: "fas fa-sun" })
              ]),
              createBaseVNode("div", { class: "sun-rays" })
            ], -1)),
            _cache[40] || (_cache[40] = createBaseVNode("div", { class: "theme-moon-fall" }, [
              createBaseVNode("div", {
                class: "moon-body",
                style: { "width": "56px", "height": "56px", "font-size": "24px" }
              }, [
                createBaseVNode("i", { class: "fas fa-moon" })
              ])
            ], -1))
          ], 64)) : createCommentVNode("", true),
          $setup.themeTransitionType === "to-dark" ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("div", _hoisted_133, [
              _cache[41] || (_cache[41] = createBaseVNode("div", { class: "moon-body" }, [
                createBaseVNode("i", { class: "fas fa-moon" })
              ], -1)),
              createBaseVNode("div", _hoisted_134, [
                (openBlock(), createElementBlock(Fragment, null, renderList(12, (i) => {
                  return createBaseVNode("span", {
                    key: i,
                    class: "m-star",
                    style: normalizeStyle({ "--delay": `${i * 0.08}s`, "--x": `${Math.random() * 100}%`, "--y": `${Math.random() * 60}%` })
                  }, null, 4);
                }), 64))
              ])
            ]),
            _cache[42] || (_cache[42] = createBaseVNode("div", { class: "theme-sun-fall" }, [
              createBaseVNode("div", {
                class: "sun-body",
                style: { "width": "56px", "height": "56px", "font-size": "24px" }
              }, [
                createBaseVNode("i", { class: "fas fa-sun" })
              ])
            ], -1))
          ], 64)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_135, toDisplayString($setup.themeTransitionType === "to-dark" ? $setup.t("settings.theme.overlay.dark") : $setup.t("settings.theme.overlay.light")), 1)
        ])
      ], 2)) : createCommentVNode("", true)
    ]))
  ], 64);
}
const REMOTE_CONFIG_MODE_EVENT = "hbu-remote-config-mode-changed";
const REMOTE_UPLOAD_ENDPOINT_KEY = "hbu_temp_upload_endpoint";
const REMOTE_CONFIG_SNAPSHOT_KEY = "hbu_remote_config_snapshot";
const DEFAULT_OCR_ENDPOINT = "https://mini-hbut-testocr1.hf.space/api/ocr/recognize";
const DEBUG_LOG_LIMIT = 1e3;
const _sfc_main = {
  __name: "SettingsView",
  props: {
    identity: { type: Object, default: null }
  },
  emits: ["back", "openWorkspaceLayout"],
  setup(__props, { expose: __expose, emit: __emit }) {
    __expose();
    const tr = (key, params = {}) => {
      const text = t(key);
      return Object.entries(params).reduce(
        (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
        text
      );
    };
    const emit = __emit;
    const props = __props;
    const LOCAL_HOST_PATTERN = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i;
    const runtimeType = detectRuntime();
    const isTauriApp = isTauriRuntime();
    const isCapacitorApp = runtimeType === "capacitor";
    const runtimeLabel = computed(() => {
      if (runtimeType === "tauri") return "Tauri";
      if (runtimeType === "capacitor") return "Capacitor";
      return "Web";
    });
    const activeTab = ref("appearance");
    const uiSettings = useUiSettings();
    const appSettings = useAppSettings();
    const fontSettings = useFontSettings();
    const { locale, t } = useLocale();
    const localeOptions = [
      { key: "zh-CN", label: "简体中文" },
      { key: "en", label: "English" }
    ];
    const handleLocaleChange = (next) => {
      if (locale.value === next) return;
      setLocale(next);
      showToast(t("settings.language.toast"), "success");
    };
    const nightModeOptions = [
      { key: "system", labelKey: "settings.theme.system.label", descKey: "settings.theme.system.desc" },
      { key: "light", labelKey: "settings.theme.light.label", descKey: "settings.theme.light.desc" },
      { key: "dark", labelKey: "settings.theme.dark.label", descKey: "settings.theme.dark.desc" }
    ];
    const nightModePreference = ref(getNightModePreference());
    const isDarkMode = ref(isNightModeEnabled());
    const themeTransitioning = ref(false);
    const themeTransitionType = ref("");
    const nightModeHint = computed(() => {
      if (nightModePreference.value === "system") return t("settings.theme.hint.system");
      return nightModePreference.value === "dark" ? t("settings.theme.hint.dark") : t("settings.theme.hint.light");
    });
    const setNightMode = (mode) => {
      if (nightModePreference.value === mode) return;
      const willBeDark = resolveNightModeDark(mode);
      themeTransitionType.value = willBeDark ? "to-dark" : "to-light";
      themeTransitioning.value = true;
      setTimeout(() => {
        nightModePreference.value = mode;
        isDarkMode.value = setNightModePreference(mode);
        flushUiSettings();
      }, 400);
      setTimeout(() => {
        themeTransitioning.value = false;
        themeTransitionType.value = "";
      }, 1200);
    };
    const initDarkMode = () => {
      nightModePreference.value = getNightModePreference();
      isDarkMode.value = initNightModeClass();
    };
    initDarkMode();
    const downloadingFont = ref(false);
    const showFontModal = ref(false);
    const fontDownloadProgress = ref(0);
    const fontDownloadStatus = ref("idle");
    const fontDownloadError = ref("");
    const fontModalTitle = ref("");
    const fontModalDescription = ref("");
    const fontDownloadStep = ref("");
    const fontModalRetryMode = ref("deyihei");
    const pendingFontKey = ref("");
    const cdnPrefetching = ref(false);
    const probeRunning = ref(false);
    const probeResults = ref({});
    const probeFinishedAt = ref("");
    const cloudSyncStatus = ref(null);
    const cloudSyncStatusUpdatedAt = ref("");
    let backendAutoApplyTimer = null;
    let backendAutoApplying = false;
    const debugLogs = ref([]);
    const debugFilter = ref("all");
    const debugPanelRef = ref(null);
    let unsubscribeDebugLogs = null;
    const debugLevelOptions = [
      { key: "all", labelKey: "settings.debug.filter.all" },
      { key: "debug", labelKey: "settings.debug.filter.debug" },
      { key: "info", labelKey: "settings.debug.filter.info" },
      { key: "warn", labelKey: "settings.debug.filter.warn" },
      { key: "error", labelKey: "settings.debug.filter.error" },
      { key: "log", labelKey: "settings.debug.filter.log" }
    ];
    const isMobileDevice = isMobileLike();
    const currentStudentId = computed(() => localStorage.getItem("hbu_username") || t("settings.account.notLoggedIn"));
    const activeDeviceLabel = computed(
      () => isMobileDevice ? t("settings.backend.device.mobile") : t("settings.backend.device.desktop")
    );
    const backendSourceLabel = computed(
      () => appSettings.backend.useRemoteConfig ? t("settings.backend.source.remote") : t("settings.backend.source.local")
    );
    const activePreviewThreads = computed(
      () => isMobileDevice ? appSettings.resourceShare.previewThreadsMobile : appSettings.resourceShare.previewThreadsDesktop
    );
    const activeDownloadThreads = computed(
      () => isMobileDevice ? appSettings.resourceShare.downloadThreadsMobile : appSettings.resourceShare.downloadThreadsDesktop
    );
    const fontCdnOptions = FONT_CDN_OPTIONS;
    const localOnlyModeEnabled = computed(() => !appSettings.backend.useRemoteConfig);
    const cloudSyncRuntime = computed(() => getCloudSyncRuntimeConfig());
    const cloudSyncEnabledText = computed(
      () => cloudSyncRuntime.value.enabled ? t("settings.backend.cloudSync.enabled") : t("settings.backend.cloudSync.disabled")
    );
    const cloudSyncUploadStatusText = computed(() => {
      const status = cloudSyncStatus.value;
      if (!status || !status.lastUploadAt) return t("settings.backend.cloudSync.noUpload");
      return status.lastUploadOk ? t("settings.backend.cloudSync.uploadOk") : t("settings.backend.cloudSync.uploadFail");
    });
    const cloudSyncDownloadStatusText = computed(() => {
      const status = cloudSyncStatus.value;
      if (!status || !status.lastDownloadAt) return t("settings.backend.cloudSync.noDownload");
      return status.lastDownloadOk ? t("settings.backend.cloudSync.downloadOk") : t("settings.backend.cloudSync.downloadFail");
    });
    const cloudSyncLastUploadError = computed(
      () => String(cloudSyncStatus.value?.lastUploadError || "").trim()
    );
    const cloudSyncLastDownloadError = computed(
      () => String(cloudSyncStatus.value?.lastDownloadError || "").trim()
    );
    const fontLocalAvailabilityKeys = computed(() => {
      if (isMobileDevice) {
        return [
          "settings.font.availability.mobile.1",
          "settings.font.availability.mobile.2",
          "settings.font.availability.mobile.3"
        ];
      }
      return [
        "settings.font.availability.desktop.1",
        "settings.font.availability.desktop.2",
        "settings.font.availability.desktop.3"
      ];
    });
    const fontLocalAvailability = computed(
      () => fontLocalAvailabilityKeys.value.map((key) => t(key))
    );
    const FONT_DISPLAY_NAME_KEYS = {
      heiti: "settings.font.name.heiti",
      songti: "settings.font.name.songti",
      kaiti: "settings.font.name.kaiti",
      fangsong: "settings.font.name.fangsong",
      deyihei: "settings.font.name.deyihei"
    };
    const fontDisplayName = (fontKey) => {
      const nameKey = FONT_DISPLAY_NAME_KEYS[fontKey];
      return nameKey ? t(nameKey) : fontKey;
    };
    const prefetchButtonText = computed(() => {
      const pending = String(pendingFontKey.value || "").trim();
      if (pending && pending !== "default") {
        return tr("settings.font.prefetch.named", { name: fontDisplayName(pending) });
      }
      const current = String(fontSettings.font || "").trim();
      if (current && current !== "default") {
        return tr("settings.font.prefetch.named", { name: fontDisplayName(current) });
      }
      return t("settings.font.prefetch.selectFirst");
    });
    const filteredDebugLogs = computed(() => {
      if (debugFilter.value === "all") return debugLogs.value;
      return debugLogs.value.filter((item) => item.level === debugFilter.value);
    });
    const debugStats = computed(() => {
      const total = debugLogs.value.length;
      const errors = debugLogs.value.filter((item) => item.level === "error").length;
      const warns = debugLogs.value.filter((item) => item.level === "warn").length;
      return { total, errors, warns };
    });
    const presetEntries = computed(() => []);
    const toSafeText = (value) => String(value || "").trim();
    const formatStatusTime = (value) => {
      const ts = Number(value || 0);
      if (!Number.isFinite(ts) || ts <= 0) return "—";
      try {
        return new Date(ts).toLocaleString();
      } catch {
        return "—";
      }
    };
    const refreshCloudSyncStatus = () => {
      const sid = String(localStorage.getItem("hbu_username") || "").trim();
      if (!sid) {
        cloudSyncStatus.value = null;
        cloudSyncStatusUpdatedAt.value = "";
        return;
      }
      const status = getCloudSyncLocalStatus(sid);
      cloudSyncStatus.value = status;
      cloudSyncStatusUpdatedAt.value = (/* @__PURE__ */ new Date()).toLocaleString();
    };
    const readSnapshotUploadEndpoint = () => {
      try {
        const raw = localStorage.getItem(REMOTE_CONFIG_SNAPSHOT_KEY);
        if (!raw) return "";
        const snapshot = JSON.parse(raw);
        return toSafeText(
          snapshot?.temp_file_server?.schedule_upload_endpoint || snapshot?.resource_share?.temp_upload_endpoint
        );
      } catch {
        return "";
      }
    };
    const getEffectiveUploadEndpoint = (backend) => {
      const localValue = toSafeText(backend?.tempUploadEndpoint);
      if (!backend?.useRemoteConfig) return localValue;
      return toSafeText(localStorage.getItem(REMOTE_UPLOAD_ENDPOINT_KEY)) || readSnapshotUploadEndpoint() || localValue;
    };
    const normalizeProbeTarget = (value) => {
      const text = String(value || "").trim();
      if (!text) return "";
      if (/^https?:\/\//i.test(text)) return text;
      const prefix = LOCAL_HOST_PATTERN.test(text) ? "http://" : "https://";
      return `${prefix}${text}`;
    };
    const probeRows = computed(() => {
      const backend = appSettings.backend || {};
      const stored = getStoredOcrConfig();
      const uploadEndpoint = getEffectiveUploadEndpoint(backend);
      const cloudSyncConfig = getCloudSyncRuntimeConfig();
      const cloudSyncEndpoint = cloudSyncConfig.enabled ? normalizeProbeTarget(cloudSyncConfig.endpoint || DEFAULT_CLOUD_SYNC_ENDPOINT) : "";
      const localOcr = String(
        backend.ocrEndpoint || (!backend.useRemoteConfig ? DEFAULT_OCR_ENDPOINT : stored.endpoint) || ""
      ).trim();
      return [
        {
          id: "ocr",
          labelKey: "settings.probe.ocr.label",
          url: normalizeProbeTarget(localOcr),
          descKey: "settings.probe.ocr.desc"
        },
        {
          id: "upload",
          labelKey: "settings.probe.upload.label",
          url: normalizeProbeTarget(uploadEndpoint),
          descKey: "settings.probe.upload.desc"
        },
        {
          id: "cloud_sync",
          labelKey: "settings.probe.cloud_sync.label",
          url: cloudSyncEndpoint,
          descKey: "settings.probe.cloud_sync.desc"
        },
        {
          id: "portal",
          labelKey: "settings.probe.portal.label",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.portal),
          descKey: "settings.probe.portal.desc"
        },
        {
          id: "jwxt",
          labelKey: "settings.probe.jwxt.label",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.jwxt),
          descKey: "settings.probe.jwxt.desc"
        },
        {
          id: "chaoxing",
          labelKey: "settings.probe.chaoxing.label",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.chaoxing),
          descKey: "settings.probe.chaoxing.desc"
        },
        {
          id: "oneCode",
          labelKey: "settings.probe.oneCode.label",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.oneCode),
          descKey: "settings.probe.oneCode.desc"
        },
        {
          id: "library",
          labelKey: "settings.probe.library.label",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.library),
          descKey: "settings.probe.library.desc"
        }
      ];
    });
    const cardStyleOptions = [
      { key: "glass", labelKey: "settings.personalize.card.glass.label", descKey: "settings.personalize.card.glass.desc" },
      { key: "solid", labelKey: "settings.personalize.card.solid.label", descKey: "settings.personalize.card.solid.desc" },
      { key: "outline", labelKey: "settings.personalize.card.outline.label", descKey: "settings.personalize.card.outline.desc" }
    ];
    const navStyleOptions = [
      { key: "floating", labelKey: "settings.personalize.nav.floating.label", descKey: "settings.personalize.nav.floating.desc" },
      { key: "pill", labelKey: "settings.personalize.nav.pill.label", descKey: "settings.personalize.nav.pill.desc" },
      { key: "compact", labelKey: "settings.personalize.nav.compact.label", descKey: "settings.personalize.nav.compact.desc" }
    ];
    const densityOptions = [
      { key: "comfortable", labelKey: "settings.personalize.density.comfortable.label", descKey: "settings.personalize.density.comfortable.desc" },
      { key: "balanced", labelKey: "settings.personalize.density.balanced.label", descKey: "settings.personalize.density.balanced.desc" },
      { key: "compact", labelKey: "settings.personalize.density.compact.label", descKey: "settings.personalize.density.compact.desc" }
    ];
    const startupPageOptions = [
      { key: "home", labelKey: "settings.startup.page.home" },
      { key: "schedule", labelKey: "settings.startup.page.schedule" }
    ];
    const interactionProfiles = [
      {
        key: "mobile_focus",
        labelKey: "settings.profile.mobile_focus.label",
        descKey: "settings.profile.mobile_focus.desc",
        patch: { radiusScale: 1.12, fontScale: 1.03, spaceScale: 1.08, motionScale: 0.9 },
        profile: { cardStyle: "solid", navStyle: "compact", density: "compact", iconStyle: "line", decor: "none" }
      },
      {
        key: "immersive_read",
        labelKey: "settings.profile.immersive_read.label",
        descKey: "settings.profile.immersive_read.desc",
        patch: { radiusScale: 1.1, fontScale: 1.02, spaceScale: 1.04, motionScale: 1 },
        profile: { cardStyle: "glass", navStyle: "floating", density: "comfortable", iconStyle: "duotone", decor: "grain" }
      },
      {
        key: "minimal",
        labelKey: "settings.profile.minimal.label",
        descKey: "settings.profile.minimal.desc",
        patch: { radiusScale: 0.92, fontScale: 0.95, spaceScale: 0.9, motionScale: 0.85 },
        profile: { cardStyle: "outline", navStyle: "compact", density: "compact", iconStyle: "mono", decor: "none" }
      },
      {
        key: "classic",
        labelKey: "settings.profile.classic.label",
        descKey: "settings.profile.classic.desc",
        patch: { radiusScale: 1, fontScale: 1, spaceScale: 1, motionScale: 1 },
        profile: { cardStyle: "solid", navStyle: "pill", density: "balanced", iconStyle: "duotone", decor: "mesh" }
      }
    ];
    const withCacheBust = (url) => {
      const text = String(url || "").trim();
      if (!text) return "";
      return `${text}${text.includes("?") ? "&" : "?"}_probe=${Date.now()}`;
    };
    const nowMs = () => typeof performance !== "undefined" ? performance.now() : Date.now();
    const toShortError = (error) => {
      const text = String(error?.message || error || "").toLowerCase();
      if (!text) return t("settings.probe.error.request");
      if (text.includes("timeout") || text.includes("aborted")) return t("settings.probe.error.timeout");
      if (text.includes("failed to fetch") || text.includes("network")) return t("settings.probe.error.network");
      if (text.length > 18) return `${text.slice(0, 18)}...`;
      return text;
    };
    const probeViaCapacitorHttp = async (url, timeoutMs) => {
      if (!isCapacitorApp) return null;
      try {
        const core = await __vitePreload(() => import("./runtime-bridge-Dt57BD2i.js").then((n) => n.a3), true ? __vite__mapDeps([0,1]) : void 0, import.meta.url);
        const capHttp = core?.CapacitorHttp || window?.Capacitor?.Plugins?.CapacitorHttp;
        if (!capHttp?.request) return null;
        const response = await capHttp.request({
          method: "GET",
          url: withCacheBust(url),
          headers: { Accept: "*/*" },
          connectTimeout: timeoutMs,
          readTimeout: timeoutMs
        });
        return { status: Number(response?.status || 0), source: "capacitor-http" };
      } catch {
        return null;
      }
    };
    const probeViaFetch = async (url, timeoutMs) => {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = window.setTimeout(() => {
        controller?.abort?.();
      }, timeoutMs);
      try {
        const response = await fetch(withCacheBust(url), {
          method: "GET",
          mode: "no-cors",
          cache: "no-store",
          signal: controller?.signal
        });
        return { status: Number(response?.status || 0), source: "fetch" };
      } finally {
        window.clearTimeout(timer);
      }
    };
    const probeViaImage = (url, timeoutMs) => new Promise((resolve, reject) => {
      const img = new Image();
      let done = false;
      const timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        img.onload = null;
        img.onerror = null;
        reject(new Error("timeout"));
      }, timeoutMs);
      const finish = (ok) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        {
          resolve({ status: 0, source: "image" });
        }
      };
      img.onload = () => finish();
      img.onerror = () => finish();
      img.src = withCacheBust(url);
    });
    const probeEndpoint = async (url, timeoutMs) => {
      const start = nowMs();
      try {
        const capMeta = await probeViaCapacitorHttp(url, timeoutMs);
        if (capMeta) {
          return {
            status: "success",
            latencyMs: Math.max(1, Math.round(nowMs() - start)),
            httpStatus: capMeta.status,
            source: capMeta.source
          };
        }
        const fetchMeta = await probeViaFetch(url, timeoutMs);
        return {
          status: "success",
          latencyMs: Math.max(1, Math.round(nowMs() - start)),
          httpStatus: fetchMeta.status,
          source: fetchMeta.source
        };
      } catch (fetchError) {
        try {
          const imageMeta = await probeViaImage(url, timeoutMs);
          return {
            status: "success",
            latencyMs: Math.max(1, Math.round(nowMs() - start)),
            httpStatus: imageMeta.status,
            source: imageMeta.source
          };
        } catch (imgError) {
          return {
            status: "error",
            latencyMs: Math.max(1, Math.round(nowMs() - start)),
            error: toShortError(imgError || fetchError)
          };
        }
      }
    };
    const getProbeResult = (id) => probeResults.value[id] || { status: "idle" };
    const probeStateClass = (id) => {
      const result = getProbeResult(id);
      if (result.status === "testing") return "testing";
      if (result.status === "error") return "error";
      if (result.status === "skipped") return "idle";
      if (result.status !== "success") return "idle";
      if (result.latencyMs < 250) return "fast";
      if (result.latencyMs < 800) return "medium";
      return "slow";
    };
    const probeStateText = (id) => {
      const result = getProbeResult(id);
      if (result.status === "testing") return t("settings.probe.state.testing");
      if (result.status === "skipped") return t("settings.probe.state.unset");
      if (result.status === "error") {
        return tr("settings.probe.state.failed", {
          error: result.error || t("settings.probe.state.errorFallback")
        });
      }
      if (result.status === "success") {
        if (result.httpStatus > 0) {
          return `${result.latencyMs} ms · HTTP ${result.httpStatus}`;
        }
        return `${result.latencyMs} ms · ${t("settings.probe.state.reachable")}`;
      }
      return t("settings.probe.state.idle");
    };
    const runSingleProbe = async (item, timeoutMs) => {
      if (!item.url) {
        probeResults.value = {
          ...probeResults.value,
          [item.id]: { status: "skipped" }
        };
        return;
      }
      const itemLabel = t(item.labelKey);
      pushDebugLog("Probe", tr("settings.debug.log.probeStart", { label: itemLabel, url: item.url }), "debug");
      probeResults.value = {
        ...probeResults.value,
        [item.id]: { status: "testing" }
      };
      const result = await probeEndpoint(item.url, timeoutMs);
      pushDebugLog(
        "Probe",
        `${itemLabel} -> ${result.status}${result.latencyMs ? ` (${result.latencyMs}ms)` : ""}`,
        result.status === "error" ? "warn" : "info",
        result
      );
      probeResults.value = {
        ...probeResults.value,
        [item.id]: result
      };
    };
    const handleRunConnectivityTest = async () => {
      if (probeRunning.value) return;
      const timeoutMs = Number(appSettings.backend.moduleParams.probeTimeoutMs || 8e3);
      const rows = probeRows.value;
      if (!rows.length) {
        showToast(t("settings.toast.probeNoTargets"), "info");
        return;
      }
      pushDebugLog("Settings", tr("settings.debug.log.probeRunStart", { count: rows.length, timeout: timeoutMs }), "info");
      probeRunning.value = true;
      probeFinishedAt.value = "";
      await Promise.all(rows.map((item) => runSingleProbe(item, timeoutMs)));
      probeRunning.value = false;
      probeFinishedAt.value = (/* @__PURE__ */ new Date()).toLocaleString();
      pushDebugLog("Settings", tr("settings.debug.log.probeRunDone", { count: rows.length, timeout: timeoutMs }), "info");
      showToast(t("settings.toast.probeDone"), "success");
    };
    const refreshDebugPanel = () => {
      debugLogs.value = getDebugLogs(DEBUG_LOG_LIMIT);
    };
    const scrollDebugToBottom = () => {
      requestAnimationFrame(() => {
        const panel = debugPanelRef.value;
        if (!panel) return;
        panel.scrollTop = panel.scrollHeight;
      });
    };
    const handleClearDebugPanel = () => {
      clearDebugLogs();
      refreshDebugPanel();
      showToast(t("settings.toast.debugCleared"), "success");
    };
    const handleCopyDebugLogs = async () => {
      const rows = debugLogs.value.map((item) => {
        return `${formatDebugTime(item.ts)} [${String(item.level || "log").toUpperCase()}][${item.scope}] ${item.message}`;
      });
      if (!rows.length) {
        showToast(t("settings.toast.debugEmpty"), "info");
        return;
      }
      try {
        await navigator.clipboard.writeText(rows.join("\n"));
        showToast(t("settings.toast.debugCopied"), "success");
      } catch {
        showToast(t("settings.toast.debugCopyFail"), "error");
      }
    };
    const setProfileOption = (field, value, label) => {
      if (uiSettings.profile[field] === value) {
        flushUiSettings();
        showToast(tr("settings.toast.optionActive", { label }), "info");
        return;
      }
      uiSettings.profile[field] = value;
      flushUiSettings();
      showToast(tr("settings.toast.optionSwitched", { label }), "success");
    };
    const handleApplyProfile = (profile) => {
      Object.entries(profile.patch).forEach(([k, v]) => {
        uiSettings[k] = v;
      });
      if (profile.profile) {
        Object.entries(profile.profile).forEach(([k, v]) => {
          uiSettings.profile[k] = v;
        });
      }
      flushUiSettings();
      showToast(tr("settings.toast.profileApplied", { label: t(profile.labelKey) }), "success");
    };
    const handleApplyBackendSettings = async ({ silent = false, emitModeEvent = false } = {}) => {
      try {
        pushDebugLog(
          "Settings",
          tr("settings.debug.log.applyBackend", {
            value: appSettings.backend.useRemoteConfig ? "1" : "0"
          })
        );
        const stored = getStoredOcrConfig();
        const customOcrEndpoint = String(appSettings.backend.ocrEndpoint || "").trim();
        const endpointList = customOcrEndpoint ? [customOcrEndpoint] : appSettings.backend.useRemoteConfig ? stored.endpoints : [DEFAULT_OCR_ENDPOINT];
        await applyOcrRuntimeConfig({
          ocr: {
            enabled: true,
            endpoint: endpointList[0] || stored.endpoint,
            endpoints: endpointList,
            local_fallback_endpoints: stored.local_fallback_endpoints
          }
        });
        window.dispatchEvent(new CustomEvent("hbu-ocr-config-updated"));
        const uploadEndpoint = String(appSettings.backend.tempUploadEndpoint || "").trim();
        const useRemoteConfig = appSettings.backend.useRemoteConfig;
        const shouldWriteUploadEndpoint = !!uploadEndpoint || !useRemoteConfig;
        if (shouldWriteUploadEndpoint) {
          if (uploadEndpoint) {
            localStorage.setItem(REMOTE_UPLOAD_ENDPOINT_KEY, uploadEndpoint);
          } else {
            localStorage.removeItem(REMOTE_UPLOAD_ENDPOINT_KEY);
          }
        }
        if (isTauriApp && shouldWriteUploadEndpoint) {
          await invokeNative("set_temp_upload_endpoint", { endpoint: uploadEndpoint || null });
        }
        const cloudSyncEndpoint = String(appSettings.backend.cloudSyncEndpoint || "").trim();
        const cloudSyncSecretRef = String(appSettings.backend.cloudSyncSecretRef || "").trim();
        const cloudSyncUploadCooldown = Number(appSettings.backend.moduleParams.cloudSyncUploadCooldownSec || 120);
        const cloudSyncDownloadCooldown = Number(appSettings.backend.moduleParams.cloudSyncDownloadCooldownSec || 10);
        pushDebugLog(
          "Settings",
          tr("settings.debug.log.cloudSyncConfig", {
            endpoint: cloudSyncEndpoint || "(remote/default)",
            ref: cloudSyncSecretRef || "(remote/default)",
            up: cloudSyncUploadCooldown,
            down: cloudSyncDownloadCooldown
          }),
          "debug"
        );
        if (emitModeEvent) {
          window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT));
        }
        if (!silent) {
          showToast(t("settings.toast.backendApplied"), "success");
        }
        pushDebugLog("Settings", t("settings.debug.log.applyBackendOk"), "info");
        return true;
      } catch (e) {
        pushDebugLog("Settings", t("settings.debug.log.applyBackendFail"), "error", e);
        console.warn("[Settings] apply backend config failed", e);
        if (!silent) {
          showToast(t("settings.toast.backendApplyFail"), "error");
        }
        return false;
      }
    };
    const handleRemoteModeChanged = async () => {
      const nextUseRemoteConfig = !appSettings.backend.useRemoteConfig;
      appSettings.backend.useRemoteConfig = nextUseRemoteConfig;
      pushDebugLog(
        "Settings",
        tr("settings.debug.log.switchSource", {
          source: nextUseRemoteConfig ? t("settings.backend.source.remote") : t("settings.backend.localOnly.badgeLocal")
        })
      );
      if (nextUseRemoteConfig) {
        window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT));
        showToast(t("settings.toast.remoteEnabled"), "success");
        return;
      }
      const ok = await handleApplyBackendSettings({ silent: true, emitModeEvent: true });
      if (ok) {
        showToast(t("settings.toast.localOnlyEnabled"), "success");
      }
    };
    const handleResetBackend = () => {
      resetAppSettings();
      probeResults.value = {};
      probeFinishedAt.value = "";
      window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT));
      pushDebugLog("Settings", t("settings.debug.log.backendReset"));
      showToast(t("settings.toast.backendReset"), "success");
    };
    const clearBackendAutoApplyTimer = () => {
      if (backendAutoApplyTimer) {
        window.clearTimeout(backendAutoApplyTimer);
        backendAutoApplyTimer = null;
      }
    };
    const scheduleBackendAutoApply = () => {
      clearBackendAutoApplyTimer();
      backendAutoApplyTimer = window.setTimeout(async () => {
        if (backendAutoApplying) return;
        backendAutoApplying = true;
        try {
          await handleApplyBackendSettings({ silent: true, emitModeEvent: false });
        } finally {
          backendAutoApplying = false;
        }
      }, 420);
    };
    watch(
      () => [
        appSettings.backend.useRemoteConfig,
        appSettings.backend.ocrEndpoint,
        appSettings.backend.tempUploadEndpoint,
        appSettings.backend.cloudSyncEndpoint,
        appSettings.backend.cloudSyncSecretRef,
        appSettings.backend.moduleParams.requestTimeoutMs,
        appSettings.backend.moduleParams.probeTimeoutMs,
        appSettings.backend.moduleParams.cloudSyncCooldownSec,
        appSettings.backend.moduleParams.cloudSyncUploadCooldownSec,
        appSettings.backend.moduleParams.cloudSyncDownloadCooldownSec,
        appSettings.retry.electricity,
        appSettings.retry.classroom,
        appSettings.retryDelayMs,
        appSettings.resourceShare.previewThreadsMobile,
        appSettings.resourceShare.previewThreadsDesktop,
        appSettings.resourceShare.downloadThreadsMobile,
        appSettings.resourceShare.downloadThreadsDesktop
      ],
      () => {
        scheduleBackendAutoApply();
      }
    );
    watch(
      () => activeTab.value,
      (tab) => {
        if (tab !== "debug") return;
        refreshDebugPanel();
        scrollDebugToBottom();
      }
    );
    watch(
      () => currentStudentId.value,
      () => {
        refreshCloudSyncStatus();
      }
    );
    onMounted(() => {
      refreshDebugPanel();
      refreshCloudSyncStatus();
      unsubscribeDebugLogs = subscribeDebugLogs((logs) => {
        debugLogs.value = logs.slice(-DEBUG_LOG_LIMIT);
        if (activeTab.value === "debug") {
          scrollDebugToBottom();
        }
      });
      window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, refreshCloudSyncStatus);
      if (activeTab.value === "debug") {
        scrollDebugToBottom();
      }
    });
    onBeforeUnmount(() => {
      clearBackendAutoApplyTimer();
      window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, refreshCloudSyncStatus);
      if (typeof unsubscribeDebugLogs === "function") {
        unsubscribeDebugLogs();
        unsubscribeDebugLogs = null;
      }
    });
    const handleSelectFont = async (fontKey) => {
      if (fontKey === "default") {
        fontSettings.font = "default";
        pendingFontKey.value = "";
        pushDebugLog("Font", t("settings.debug.log.fontDefault"));
        flushUiSettings();
        showToast(t("settings.toast.fontApplied"), "success");
        return;
      }
      const fontName = fontDisplayName(fontKey);
      pushDebugLog("Font", tr("settings.debug.log.fontSwitch", { name: fontName }));
      showFontModal.value = true;
      fontModalTitle.value = tr("settings.font.modal.loadTitle", {
        name: fontName || t("settings.font.generic")
      });
      fontModalDescription.value = t("settings.font.modal.checkingLocal");
      fontModalRetryMode.value = fontKey === "deyihei" ? "deyihei" : "prefetch";
      fontDownloadProgress.value = 20;
      fontDownloadStatus.value = "downloading";
      fontDownloadError.value = "";
      fontDownloadStep.value = tr("settings.font.step.checkLocal", { name: fontName });
      try {
        const cached = await ensureFontLoaded(fontKey, false, true);
        if (cached) {
          fontSettings.font = fontKey;
          pendingFontKey.value = "";
          flushUiSettings();
          pushDebugLog("Font", tr("settings.debug.log.fontCacheHit", { name: fontName }), "info");
          fontDownloadProgress.value = 100;
          fontDownloadStatus.value = "success";
          fontDownloadStep.value = t("settings.font.step.cacheHit");
          showToast(t("settings.toast.fontApplied"), "success");
          showFontModal.value = false;
          return;
        }
      } catch {
      }
      pushDebugLog("Font", tr("settings.debug.log.fontCdnDownload", { name: fontName }));
      fontModalDescription.value = t("settings.font.modal.downloadingFromCdn");
      fontDownloadProgress.value = 40;
      fontDownloadStep.value = tr("settings.font.step.downloading", { name: fontName });
      try {
        let loaded = false;
        if (fontKey === "deyihei") {
          loaded = await loadDeyiHeiFont(true);
        } else {
          loaded = await ensureFontLoaded(fontKey, true, false);
        }
        if (!loaded) throw new Error("font download failed");
        fontSettings.font = fontKey;
        pendingFontKey.value = "";
        flushUiSettings();
        pushDebugLog("Font", tr("settings.debug.log.fontDownloadOk", { name: fontName }), "info");
        fontDownloadProgress.value = 100;
        fontDownloadStatus.value = "success";
        fontDownloadStep.value = t("settings.font.step.downloadDone");
        showToast(t("settings.toast.fontApplied"), "success");
        showFontModal.value = false;
      } catch (e) {
        console.warn("[Font] download failed", e);
        pendingFontKey.value = fontKey;
        pushDebugLog("Font", tr("settings.debug.log.fontDownloadFail", { name: fontName }), "error", e);
        fontDownloadStatus.value = "failed";
        fontDownloadError.value = t("settings.font.error.downloadFail");
        fontDownloadProgress.value = 0;
        fontDownloadStep.value = "";
        showToast(t("settings.toast.fontDownloadFail"), "error");
      }
    };
    const handleSelectCdnProvider = async (provider) => {
      if (fontSettings.cdnProvider === provider) return;
      setFontCdnProvider(provider);
      if (fontSettings.font !== "default") {
        await ensureFontLoaded(fontSettings.font, true);
      }
      pushDebugLog("Font", tr("settings.debug.log.cdnSwitch", { provider }));
      showToast(
        tr("settings.toast.cdnSwitched", {
          name: provider === "auto" ? t("settings.font.cdn.autoName") : provider
        }),
        "success"
      );
    };
    const handlePrefetchFonts = async (force = false, cacheAll = false) => {
      if (cdnPrefetching.value) return;
      const pending = String(pendingFontKey.value || "").trim();
      const current = String(fontSettings.font || "").trim();
      let targets;
      if (cacheAll) {
        targets = ["heiti", "songti", "kaiti", "fangsong", "deyihei"];
      } else {
        targets = pending && pending !== "default" ? [pending] : current && current !== "default" ? [current] : [];
      }
      if (!targets.length) {
        showToast(t("settings.toast.fontSelectFirst"), "info");
        return;
      }
      pushDebugLog("Font", tr("settings.debug.log.fontPrefetchStart", { value: force ? "1" : "0" }));
      cdnPrefetching.value = true;
      const needDeyiheiDownload = targets.includes("deyihei") && !fontSettings.loaded;
      showFontModal.value = true;
      fontModalTitle.value = cacheAll ? t("settings.font.modal.cacheAllTitle") : t("settings.font.modal.prefetchTitle");
      fontModalDescription.value = cacheAll ? tr("settings.font.modal.cacheAllDesc", { count: targets.length }) : needDeyiheiDownload ? t("settings.font.modal.deyiheiFirst") : tr("settings.font.modal.caching", {
        names: targets.map((key) => fontDisplayName(key)).join(" / ")
      });
      fontModalRetryMode.value = "prefetch";
      fontDownloadProgress.value = 8;
      fontDownloadStatus.value = "downloading";
      fontDownloadError.value = "";
      fontDownloadStep.value = t("settings.font.step.preparing");
      try {
        const results = await prefetchCdnFonts(force, ({ key, index, total, ok }) => {
          const label = fontDisplayName(key);
          if (showFontModal.value) {
            fontDownloadProgress.value = Math.max(12, Math.round(index / total * 100));
            fontDownloadStep.value = ok ? tr("settings.font.step.itemOk", { index, total, name: label }) : tr("settings.font.step.itemFail", { index, total, name: label });
          }
        }, targets);
        const success = Object.values(results).filter(Boolean).length;
        const requestedKey = targets[0];
        if (requestedKey && results[requestedKey]) {
          fontSettings.font = requestedKey;
          pendingFontKey.value = "";
          flushUiSettings();
        }
        const totalCount = Object.keys(results).length;
        if (success === totalCount) {
          pushDebugLog("Font", tr("settings.debug.log.fontPrefetchDone", { done: success, total: totalCount }));
          fontDownloadStatus.value = "success";
          showToast(tr("settings.toast.fontCacheDone", { done: success, total: totalCount }), "success");
          showFontModal.value = false;
        } else {
          pushDebugLog(
            "Font",
            tr("settings.debug.log.fontPrefetchPartial", { done: success, total: totalCount }),
            "warn",
            results
          );
          fontDownloadStatus.value = "failed";
          fontDownloadError.value = tr("settings.font.error.partialFail", { done: success, total: totalCount });
          showToast(t("settings.toast.fontCachePartialFail"), "error");
        }
      } catch (e) {
        pushDebugLog("Font", t("settings.debug.log.fontPrefetchFail"), "error", e);
        console.warn("[Font] prefetch failed", e);
        fontDownloadStatus.value = "failed";
        fontDownloadError.value = t("settings.font.error.cacheFail");
        fontDownloadProgress.value = 0;
        fontDownloadStep.value = "";
        showToast(t("settings.toast.fontCacheFail"), "error");
      } finally {
        cdnPrefetching.value = false;
      }
    };
    const handleDownloadFont = async (force = false) => {
      if (downloadingFont.value) return;
      pushDebugLog("Font", tr("settings.debug.log.deyiheiDownload", { value: force ? "1" : "0" }));
      downloadingFont.value = true;
      showFontModal.value = true;
      fontModalTitle.value = t("settings.font.modal.downloadTitle");
      fontModalDescription.value = t("settings.font.modal.downloadDesc");
      fontModalRetryMode.value = "deyihei";
      fontDownloadStep.value = t("settings.font.step.preparingDownload");
      fontDownloadProgress.value = 15;
      fontDownloadStatus.value = "downloading";
      fontDownloadError.value = "";
      try {
        const loaded = await loadDeyiHeiFont(force);
        if (!loaded) {
          throw new Error("font not loaded");
        }
        fontDownloadProgress.value = 100;
        fontDownloadStatus.value = "success";
        fontDownloadStep.value = t("settings.font.step.deyiheiDone");
        fontSettings.font = "deyihei";
        pendingFontKey.value = "";
        pushDebugLog("Font", t("settings.debug.log.deyiheiOk"));
        showToast(t("settings.toast.deyiheiApplied"), "success");
        showFontModal.value = false;
      } catch (e) {
        pushDebugLog("Font", t("settings.debug.log.deyiheiFail"), "error", e);
        fontDownloadStatus.value = "failed";
        fontDownloadError.value = t("settings.font.error.downloadFail");
        fontDownloadProgress.value = 0;
        fontDownloadStep.value = "";
        showToast(t("settings.toast.fontDownloadFail"), "error");
        console.warn("[Font] download failed", e);
      } finally {
        downloadingFont.value = false;
      }
    };
    const __returned__ = { tr, emit, props, REMOTE_CONFIG_MODE_EVENT, REMOTE_UPLOAD_ENDPOINT_KEY, REMOTE_CONFIG_SNAPSHOT_KEY, DEFAULT_OCR_ENDPOINT, LOCAL_HOST_PATTERN, runtimeType, isTauriApp, isCapacitorApp, runtimeLabel, activeTab, uiSettings, appSettings, fontSettings, locale, t, localeOptions, handleLocaleChange, nightModeOptions, nightModePreference, isDarkMode, themeTransitioning, themeTransitionType, nightModeHint, setNightMode, initDarkMode, downloadingFont, showFontModal, fontDownloadProgress, fontDownloadStatus, fontDownloadError, fontModalTitle, fontModalDescription, fontDownloadStep, fontModalRetryMode, pendingFontKey, cdnPrefetching, probeRunning, probeResults, probeFinishedAt, cloudSyncStatus, cloudSyncStatusUpdatedAt, get backendAutoApplyTimer() {
      return backendAutoApplyTimer;
    }, set backendAutoApplyTimer(v) {
      backendAutoApplyTimer = v;
    }, get backendAutoApplying() {
      return backendAutoApplying;
    }, set backendAutoApplying(v) {
      backendAutoApplying = v;
    }, debugLogs, debugFilter, debugPanelRef, get unsubscribeDebugLogs() {
      return unsubscribeDebugLogs;
    }, set unsubscribeDebugLogs(v) {
      unsubscribeDebugLogs = v;
    }, DEBUG_LOG_LIMIT, debugLevelOptions, isMobileDevice, currentStudentId, activeDeviceLabel, backendSourceLabel, activePreviewThreads, activeDownloadThreads, fontCdnOptions, localOnlyModeEnabled, cloudSyncRuntime, cloudSyncEnabledText, cloudSyncUploadStatusText, cloudSyncDownloadStatusText, cloudSyncLastUploadError, cloudSyncLastDownloadError, fontLocalAvailabilityKeys, fontLocalAvailability, FONT_DISPLAY_NAME_KEYS, fontDisplayName, prefetchButtonText, filteredDebugLogs, debugStats, presetEntries, toSafeText, formatStatusTime, refreshCloudSyncStatus, readSnapshotUploadEndpoint, getEffectiveUploadEndpoint, normalizeProbeTarget, probeRows, cardStyleOptions, navStyleOptions, densityOptions, startupPageOptions, interactionProfiles, withCacheBust, nowMs, toShortError, probeViaCapacitorHttp, probeViaFetch, probeViaImage, probeEndpoint, getProbeResult, probeStateClass, probeStateText, runSingleProbe, handleRunConnectivityTest, refreshDebugPanel, scrollDebugToBottom, handleClearDebugPanel, handleCopyDebugLogs, setProfileOption, handleApplyProfile, handleApplyBackendSettings, handleRemoteModeChanged, handleResetBackend, clearBackendAutoApplyTimer, scheduleBackendAutoApply, handleSelectFont, handleSelectCdnProvider, handlePrefetchFonts, handleDownloadFont, computed, onBeforeUnmount, onMounted, ref, watch, get flushUiSettings() {
      return flushUiSettings;
    }, get useUiSettings() {
      return useUiSettings;
    }, get DEFAULT_BACKEND_TARGETS() {
      return DEFAULT_BACKEND_TARGETS;
    }, get DEFAULT_CLOUD_SYNC_ENDPOINT() {
      return DEFAULT_CLOUD_SYNC_ENDPOINT;
    }, get resetAppSettings() {
      return resetAppSettings;
    }, get useAppSettings() {
      return useAppSettings;
    }, get FONT_CDN_OPTIONS() {
      return FONT_CDN_OPTIONS;
    }, get ensureFontLoaded() {
      return ensureFontLoaded;
    }, get loadDeyiHeiFont() {
      return loadDeyiHeiFont;
    }, get prefetchCdnFonts() {
      return prefetchCdnFonts;
    }, get setFontCdnProvider() {
      return setFontCdnProvider;
    }, get useFontSettings() {
      return useFontSettings;
    }, get applyOcrRuntimeConfig() {
      return applyOcrRuntimeConfig;
    }, get getStoredOcrConfig() {
      return getStoredOcrConfig;
    }, get CLOUD_SYNC_UPDATED_EVENT() {
      return CLOUD_SYNC_UPDATED_EVENT;
    }, get getCloudSyncLocalStatus() {
      return getCloudSyncLocalStatus;
    }, get getCloudSyncRuntimeConfig() {
      return getCloudSyncRuntimeConfig;
    }, get invokeNative() {
      return invokeNative;
    }, get isTauriRuntime() {
      return isTauriRuntime;
    }, get detectRuntime() {
      return detectRuntime;
    }, get isMobileLike() {
      return isMobileLike;
    }, get showToast() {
      return showToast;
    }, IdentityDeviceSettings, IdentityQrLoginEntry, get clearDebugLogs() {
      return clearDebugLogs;
    }, get formatDebugTime() {
      return formatDebugTime;
    }, get getDebugLogs() {
      return getDebugLogs;
    }, get pushDebugLog() {
      return pushDebugLog;
    }, get subscribeDebugLogs() {
      return subscribeDebugLogs;
    }, get getNightModePreference() {
      return getNightModePreference;
    }, get initNightModeClass() {
      return initNightModeClass;
    }, get isNightModeEnabled() {
      return isNightModeEnabled;
    }, get resolveNightModeDark() {
      return resolveNightModeDark;
    }, get setNightModePreference() {
      return setNightModePreference;
    }, get setLocale() {
      return setLocale;
    }, get useLocale() {
      return useLocale;
    } };
    Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
    return __returned__;
  }
};
const SettingsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["render", render], ["__scopeId", "data-v-4754a8eb"]]);
export {
  SettingsView as default
};
