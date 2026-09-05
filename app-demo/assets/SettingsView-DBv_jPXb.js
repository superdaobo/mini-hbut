const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./runtime-bridge-HjlgKupV.js","./more-modules-c4l-U-qE.js"])))=>i.map(i=>d[i]);
import { K as getIdentityDeviceDisplayName, V as identityDeviceStatus, W as identityRevokeCurrentDeviceLocal, a as isTauriRuntime, d as invokeNative, X as parseMiniHbutDeepLink, Y as IDENTITY_REQUEST_ID_PATTERN, Z as IDENTITY_HANDOFF_PATTERN, P as isMobileLike, s as detectRuntime, U as subscribeDebugLogs, L as getDebugLogs, p as pushDebugLog, M as formatDebugTime, $ as clearDebugLogs, _ as __vitePreload } from "./runtime-bridge-HjlgKupV.js";
import { aa as identityUiState, ab as setIdentityDeviceRefreshing, ac as setIdentityDeviceError, ad as setIdentityDeviceStatus, i as showToast, ae as setIdentityRevoking, af as getIdentityCoreBaseUrl, ag as clearIdentityDeviceMeta, _ as _export_sfc, H as CLOUD_SYNC_UPDATED_EVENT, ah as FONT_CDN_OPTIONS, l as useAppSettings, ai as getCloudSyncLocalStatus, aj as getCloudSyncRuntimeConfig, $ as getStoredOcrConfig, Z as applyOcrRuntimeConfig, ak as useFontSettings, al as setFontCdnProvider, am as prefetchCdnFonts, an as loadDeyiHeiFont, ao as ensureFontLoaded, ap as resetAppSettings, aq as DEFAULT_CLOUD_SYNC_ENDPOINT, ar as DEFAULT_BACKEND_TARGETS, a as useUiSettings, as as UI_PRESETS, at as resetUiSettings, e as flushUiSettings, au as applyPreset } from "./app-demo-BxokP0Ga.js";
import { y as defineComponent, o as onMounted, a as openBlock, c as createElementBlock, b as createBaseVNode, n as normalizeClass, u as unref, t as toDisplayString, e as createTextVNode, d as createCommentVNode, K as withDirectives, L as vModelText, m as withKeys, r as ref, h as computed, v as watch, l as onBeforeUnmount, j as createBlock, s as Teleport, p as createVNode, F as Fragment, g as renderList, f as normalizeStyle } from "./vue-core-DPI62iBa.js";
import { g as getNightModePreference, i as isNightModeEnabled, a as initNightModeClass, s as setNightModePreference, b as resolveNightModeDark } from "./debug-tools-3S6y50wl.js";
import "./more-modules-c4l-U-qE.js";
import "./capture-D-zd0oUS.js";
const _hoisted_1$3 = { class: "identity-device-settings" };
const _hoisted_2$2 = { class: "identity-device-section glass-card" };
const _hoisted_3$2 = { class: "section-head" };
const _hoisted_4$2 = { class: "identity-device-grid" };
const _hoisted_5$2 = { class: "identity-device-field" };
const _hoisted_6$2 = { class: "identity-device-field" };
const _hoisted_7$2 = { class: "identity-device-field" };
const _hoisted_8$2 = {
  key: 0,
  class: "identity-device-field identity-device-field--wide"
};
const _hoisted_9$2 = { class: "identity-device-mono" };
const _hoisted_10$2 = {
  key: 1,
  class: "identity-device-field identity-device-field--wide"
};
const _hoisted_11$2 = { class: "identity-device-mono" };
const _hoisted_12$2 = {
  key: 0,
  class: "identity-device-error"
};
const _hoisted_13$2 = { class: "identity-device-actions" };
const _hoisted_14$2 = ["disabled"];
const _hoisted_15$2 = ["disabled"];
const _hoisted_16$2 = {
  key: 0,
  class: "identity-revoke-modal",
  role: "dialog",
  "aria-modal": "true",
  "aria-label": "撤销当前设备"
};
const _hoisted_17$1 = { class: "identity-revoke-card modal-pop-card" };
const _hoisted_18$1 = { class: "identity-revoke-label" };
const _hoisted_19$1 = { class: "identity-revoke-actions" };
const _hoisted_20$1 = ["disabled"];
const _hoisted_21$1 = ["disabled"];
const REVOKE_CONFIRM_PHRASE = "撤销此设备";
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "IdentityDeviceSettings",
  setup(__props, { expose: __expose }) {
    const ui = identityUiState;
    const revokeModalVisible = ref(false);
    const revokeConfirmInput = ref("");
    const confirmMismatch = computed(() => revokeConfirmInput.value !== REVOKE_CONFIRM_PHRASE);
    const serviceEnabledText = computed(
      () => ui.deviceStatus === null ? "检测中…" : ui.deviceStatus.available ? "已启用" : "未启用"
    );
    const boundText = computed(() => {
      if (ui.deviceStatus === null) return "检测中…";
      if (ui.deviceStatus.available === false) return "不可用";
      return ui.deviceId ? "已绑定" : ui.deviceStatus.has_key ? "本机已有密钥（待绑定）" : "未绑定";
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
          setIdentityDeviceError(status.error || "本机安全存储不可用");
        }
      } catch {
        setIdentityDeviceError("无法读取设备状态");
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
        showToast("当前设备尚未绑定，无需撤销", "info");
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
        showToast("当前设备已撤销", "success");
      } catch (err) {
        const message = String(err?.message || err || "撤销失败");
        setIdentityDeviceError(message);
        showToast("撤销失败，请稍后重试", "error");
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
        createBaseVNode("section", _hoisted_2$2, [
          createBaseVNode("div", _hoisted_3$2, [
            _cache[1] || (_cache[1] = createBaseVNode("h3", null, "Mini-HBUT Identity", -1)),
            createBaseVNode("span", {
              class: normalizeClass(["identity-device-pill", { ok: unref(ui).deviceStatus?.available }])
            }, toDisplayString(serviceEnabledText.value), 3)
          ]),
          _cache[8] || (_cache[8] = createBaseVNode("p", { class: "identity-test-note" }, [
            createTextVNode(" 🧪 "),
            createBaseVNode("strong", null, "测试说明"),
            createTextVNode("：当前连接的身份服务为测试部署（id.湖北工业大学.com 测试环境）。 授权测试应用（如 mini-hbut-test）时不会获取你的真实数据；正式环境上线后会移除本说明。 ")
          ], -1)),
          createBaseVNode("dl", _hoisted_4$2, [
            createBaseVNode("div", _hoisted_5$2, [
              _cache[2] || (_cache[2] = createBaseVNode("dt", null, "当前设备", -1)),
              createBaseVNode("dd", null, toDisplayString(unref(getIdentityDeviceDisplayName)()), 1)
            ]),
            createBaseVNode("div", _hoisted_6$2, [
              _cache[3] || (_cache[3] = createBaseVNode("dt", null, "绑定状态", -1)),
              createBaseVNode("dd", null, toDisplayString(boundText.value), 1)
            ]),
            createBaseVNode("div", _hoisted_7$2, [
              _cache[4] || (_cache[4] = createBaseVNode("dt", null, "最近认证", -1)),
              createBaseVNode("dd", null, toDisplayString(verifiedAtText.value), 1)
            ]),
            _cache[7] || (_cache[7] = createBaseVNode("div", { class: "identity-device-field" }, [
              createBaseVNode("dt", null, "学校身份验证方式"),
              createBaseVNode("dd", null, "Mini-HBUT 本地验证")
            ], -1)),
            unref(ui).deviceStatus?.fingerprint ? (openBlock(), createElementBlock("div", _hoisted_8$2, [
              _cache[5] || (_cache[5] = createBaseVNode("dt", null, "设备指纹", -1)),
              createBaseVNode("dd", _hoisted_9$2, toDisplayString(unref(ui).deviceStatus.fingerprint), 1)
            ])) : createCommentVNode("", true),
            unref(ui).deviceId ? (openBlock(), createElementBlock("div", _hoisted_10$2, [
              _cache[6] || (_cache[6] = createBaseVNode("dt", null, "设备 ID", -1)),
              createBaseVNode("dd", _hoisted_11$2, toDisplayString(unref(ui).deviceId), 1)
            ])) : createCommentVNode("", true)
          ]),
          _cache[9] || (_cache[9] = createBaseVNode("p", { class: "identity-device-hint" }, " 首次允许授权时 App 会自动绑定本设备；撤销后如需恢复，请重新从网页发起授权流程。 ", -1)),
          unref(ui).deviceError ? (openBlock(), createElementBlock("p", _hoisted_12$2, toDisplayString(unref(ui).deviceError), 1)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_13$2, [
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              disabled: unref(ui).deviceRefreshing,
              onClick: refreshDeviceStatus
            }, toDisplayString(unref(ui).deviceRefreshing ? "刷新中…" : "刷新状态"), 9, _hoisted_14$2),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple identity-device-revoke",
              disabled: !unref(ui).deviceId || unref(ui).revoking,
              onClick: openRevokeModal
            }, toDisplayString(unref(ui).revoking ? "撤销中…" : "撤销此设备"), 9, _hoisted_15$2)
          ])
        ]),
        _cache[13] || (_cache[13] = createBaseVNode("section", { class: "identity-device-section glass-card" }, [
          createBaseVNode("div", { class: "section-head" }, [
            createBaseVNode("h3", null, "授权记录")
          ]),
          createBaseVNode("p", { class: "identity-device-hint" }, " 本设备批准过的身份授权（哪些应用、何时、授权了哪些权限）可在「我的 → 授权记录」查看。 ")
        ], -1)),
        revokeModalVisible.value ? (openBlock(), createElementBlock("div", _hoisted_16$2, [
          createBaseVNode("div", _hoisted_17$1, [
            _cache[10] || (_cache[10] = createBaseVNode("h3", null, "撤销当前设备", -1)),
            _cache[11] || (_cache[11] = createBaseVNode("p", { class: "identity-revoke-desc" }, " 撤销后，本设备将无法再完成 Mini-HBUT 授权审批；此操作不会影响其他设备（如有）。 ", -1)),
            _cache[12] || (_cache[12] = createBaseVNode("p", { class: "identity-revoke-desc identity-revoke-desc--strong" }, " 如果这是你唯一的设备，撤销后将无法在此设备继续使用身份服务，需要重新通过网页授权流程绑定。 ", -1)),
            createBaseVNode("label", _hoisted_18$1, [
              createTextVNode(" 请输入「" + toDisplayString(REVOKE_CONFIRM_PHRASE) + "」以确认 "),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => revokeConfirmInput.value = $event),
                class: "identity-revoke-input",
                type: "text",
                placeholder: REVOKE_CONFIRM_PHRASE,
                autocomplete: "off",
                spellcheck: "false",
                onKeydown: withKeys(closeRevokeModal, ["esc"])
              }, null, 544), [
                [vModelText, revokeConfirmInput.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_19$1, [
              createBaseVNode("button", {
                class: "btn-secondary btn-ripple",
                disabled: unref(ui).revoking,
                onClick: closeRevokeModal
              }, "取消", 8, _hoisted_20$1),
              createBaseVNode("button", {
                class: "btn-danger btn-ripple",
                disabled: confirmMismatch.value || unref(ui).revoking,
                onClick: revokeCurrentDevice
              }, toDisplayString(unref(ui).revoking ? "撤销中…" : "确认撤销"), 9, _hoisted_21$1)
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
});
const IdentityDeviceSettings = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-2d93f980"]]);
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
const _hoisted_1$2 = {
  key: 0,
  class: "identity-qr-scanner",
  role: "dialog",
  "aria-modal": "true",
  "aria-label": "扫一扫登录"
};
const _hoisted_2$1 = { class: "identity-qr-scanner-card" };
const _hoisted_3$1 = {
  key: 0,
  class: "identity-qr-scanner-body"
};
const _hoisted_4$1 = {
  key: 0,
  class: "identity-qr-scanner-notice"
};
const _hoisted_5$1 = { class: "identity-qr-scanner-entries" };
const _hoisted_6$1 = { class: "identity-qr-scanner-entry identity-qr-scanner-entry--primary" };
const _hoisted_7$1 = {
  class: "material-symbols-outlined",
  "aria-hidden": "true"
};
const _hoisted_8$1 = ["capture"];
const _hoisted_9$1 = { class: "identity-qr-scanner-paste" };
const _hoisted_10$1 = ["disabled"];
const _hoisted_11$1 = ["disabled"];
const _hoisted_12$1 = {
  key: 1,
  class: "identity-qr-scanner-body identity-qr-scanner-status",
  role: "status"
};
const _hoisted_13$1 = {
  key: 2,
  class: "identity-qr-scanner-body identity-qr-scanner-status"
};
const _hoisted_14$1 = {
  key: 3,
  class: "identity-qr-scanner-body identity-qr-scanner-status"
};
const _hoisted_15$1 = {
  key: 4,
  class: "identity-qr-scanner-body identity-qr-scanner-status",
  role: "status"
};
const _hoisted_16$1 = {
  key: 5,
  class: "identity-qr-scanner-body identity-qr-scanner-status"
};
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "IdentityQrScanner",
  props: {
    visible: { type: Boolean },
    submitIntent: { type: Function }
  },
  emits: ["close"],
  setup(__props, { emit: __emit }) {
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
        __props.visible ? (openBlock(), createElementBlock("div", _hoisted_1$2, [
          createBaseVNode("div", _hoisted_2$1, [
            createBaseVNode("header", { class: "identity-qr-scanner-head" }, [
              _cache[3] || (_cache[3] = createBaseVNode("span", {
                class: "material-symbols-outlined identity-qr-scanner-head-icon",
                "aria-hidden": "true"
              }, "qr_code_scanner", -1)),
              _cache[4] || (_cache[4] = createBaseVNode("h2", null, "扫一扫登录", -1)),
              createBaseVNode("button", {
                class: "identity-qr-scanner-close",
                type: "button",
                "aria-label": "关闭扫一扫",
                onClick: handleClose
              }, [..._cache[2] || (_cache[2] = [
                createBaseVNode("span", {
                  class: "material-symbols-outlined",
                  "aria-hidden": "true"
                }, "close", -1)
              ])])
            ]),
            phase.value === "scanning" || phase.value === "permission_needed" ? (openBlock(), createElementBlock("div", _hoisted_3$1, [
              phase.value === "permission_needed" ? (openBlock(), createElementBlock("p", _hoisted_4$1, " 相机不可用，可以使用相册图片或手动粘贴链接继续。 ")) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_5$1, [
                createBaseVNode("label", _hoisted_6$1, [
                  createBaseVNode("span", _hoisted_7$1, toDisplayString(unref(isMobile) ? "photo_camera" : "image"), 1),
                  createBaseVNode("span", null, toDisplayString(unref(isMobile) ? "拍摄二维码" : "选择二维码图片"), 1),
                  createBaseVNode("input", {
                    class: "identity-qr-scanner-file",
                    type: "file",
                    accept: "image/*",
                    capture: unref(isMobile) ? "environment" : void 0,
                    onChange: handleFileChange
                  }, null, 40, _hoisted_8$1)
                ])
              ]),
              createBaseVNode("div", _hoisted_9$1, [
                withDirectives(createBaseVNode("textarea", {
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => pasteText.value = $event),
                  class: "identity-qr-scanner-paste-input",
                  rows: "3",
                  placeholder: "粘贴电脑网页上复制的扫码链接…",
                  disabled: parsing.value,
                  spellcheck: "false"
                }, null, 8, _hoisted_10$1), [
                  [vModelText, pasteText.value]
                ]),
                createBaseVNode("button", {
                  class: "identity-qr-scanner-action",
                  type: "button",
                  disabled: parsing.value || !pasteText.value.trim(),
                  onClick: handlePasteSubmit
                }, " 解析链接 ", 8, _hoisted_11$1)
              ]),
              _cache[5] || (_cache[5] = createBaseVNode("p", { class: "identity-qr-scanner-hint" }, " 图片与链接只在本地识别，不会上传服务器；扫码后仍需在弹窗中确认授权。 ", -1))
            ])) : phase.value === "parsing" ? (openBlock(), createElementBlock("div", _hoisted_12$1, [..._cache[6] || (_cache[6] = [
              createBaseVNode("span", {
                class: "material-symbols-outlined identity-qr-scanner-spin",
                "aria-hidden": "true"
              }, "sync", -1),
              createBaseVNode("h3", null, "正在识别二维码…", -1)
            ])])) : phase.value === "invalid_code" ? (openBlock(), createElementBlock("div", _hoisted_13$1, [
              _cache[7] || (_cache[7] = createBaseVNode("span", {
                class: "material-symbols-outlined identity-qr-scanner-status-error",
                "aria-hidden": "true"
              }, "error", -1)),
              _cache[8] || (_cache[8] = createBaseVNode("h3", null, "这不是有效的 Mini-HBUT 登录二维码", -1)),
              createBaseVNode("button", {
                class: "identity-qr-scanner-action",
                type: "button",
                onClick: _cache[1] || (_cache[1] = ($event) => dispatch({ type: "OPEN" }))
              }, " 重新扫描 ")
            ])) : phase.value === "expired_request" ? (openBlock(), createElementBlock("div", _hoisted_14$1, [
              _cache[9] || (_cache[9] = createBaseVNode("span", {
                class: "material-symbols-outlined identity-qr-scanner-status-error",
                "aria-hidden": "true"
              }, "timer_off", -1)),
              _cache[10] || (_cache[10] = createBaseVNode("h3", null, "二维码已过期，请在电脑网页重新发起登录", -1)),
              createBaseVNode("button", {
                class: "identity-qr-scanner-action",
                type: "button",
                onClick: handleClose
              }, "关闭")
            ])) : phase.value === "loading_request" ? (openBlock(), createElementBlock("div", _hoisted_15$1, [..._cache[11] || (_cache[11] = [
              createBaseVNode("span", {
                class: "material-symbols-outlined identity-qr-scanner-spin",
                "aria-hidden": "true"
              }, "sync", -1),
              createBaseVNode("h3", null, "已提交授权请求，正在获取信息…", -1)
            ])])) : phase.value === "approval_opened" ? (openBlock(), createElementBlock("div", _hoisted_16$1, [
              _cache[12] || (_cache[12] = createBaseVNode("span", {
                class: "material-symbols-outlined identity-qr-scanner-status-ok",
                "aria-hidden": "true"
              }, "verified_user", -1)),
              _cache[13] || (_cache[13] = createBaseVNode("h3", null, "已转交授权确认", -1)),
              _cache[14] || (_cache[14] = createBaseVNode("p", { class: "identity-qr-scanner-status-desc" }, " 请在授权弹窗中核对应用与权限后确认；你无需在电脑上做任何操作。 ", -1)),
              createBaseVNode("button", {
                class: "identity-qr-scanner-action",
                type: "button",
                onClick: handleClose
              }, "关闭")
            ])) : createCommentVNode("", true)
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
});
const IdentityQrScanner = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-1751fe56"]]);
const _hoisted_1$1 = { class: "glass-card identity-qr-entry" };
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "IdentityQrLoginEntry",
  props: {
    identity: {}
  },
  setup(__props) {
    const props = __props;
    const scannerVisible = ref(false);
    const openScanner = () => {
      if (!props.identity) {
        showToast("当前环境不支持扫码登录，请使用「打开 Mini-HBUT」按钮", "warning");
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
        _cache[0] || (_cache[0] = createBaseVNode("div", { class: "identity-qr-entry-main" }, [
          createBaseVNode("span", {
            class: "material-symbols-outlined identity-qr-entry-icon",
            "aria-hidden": "true"
          }, "qr_code_scanner"),
          createBaseVNode("div", { class: "identity-qr-entry-text" }, [
            createBaseVNode("h4", null, "扫一扫登录"),
            createBaseVNode("p", null, "用本机相机扫描电脑网页上的登录二维码，即可在手机上完成授权。")
          ])
        ], -1)),
        createBaseVNode("button", {
          class: "mini-btn btn-ripple identity-qr-entry-btn",
          type: "button",
          onClick: openScanner
        }, " 扫一扫 "),
        createVNode(IdentityQrScanner, {
          visible: scannerVisible.value,
          "submit-intent": submitIntent,
          onClose: closeScanner
        }, null, 8, ["visible"])
      ]);
    };
  }
});
const IdentityQrLoginEntry = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-c20e21ed"]]);
const _hoisted_1 = { class: "settings-view" };
const _hoisted_2 = { class: "settings-page-header" };
const _hoisted_3 = { class: "settings-tab-bar" };
const _hoisted_4 = { class: "settings-section glass-card startup-page-section" };
const _hoisted_5 = { class: "startup-page-row" };
const _hoisted_6 = { class: "startup-page-toggle" };
const _hoisted_7 = { class: "startup-page-row" };
const _hoisted_8 = { class: "startup-page-toggle" };
const _hoisted_9 = { class: "settings-section glass-card" };
const _hoisted_10 = { class: "option-group" };
const _hoisted_11 = { class: "chip-row" };
const _hoisted_12 = ["onClick"];
const _hoisted_13 = { class: "theme-hint" };
const _hoisted_14 = { class: "settings-section glass-card" };
const _hoisted_15 = { class: "option-group" };
const _hoisted_16 = { class: "chip-row" };
const _hoisted_17 = ["onClick"];
const _hoisted_18 = { class: "option-group" };
const _hoisted_19 = { class: "chip-row" };
const _hoisted_20 = ["onClick"];
const _hoisted_21 = { class: "option-group" };
const _hoisted_22 = { class: "chip-row" };
const _hoisted_23 = ["onClick"];
const _hoisted_24 = { class: "settings-section glass-card" };
const _hoisted_25 = { class: "profile-grid" };
const _hoisted_26 = ["onClick"];
const _hoisted_27 = { class: "settings-section glass-card" };
const _hoisted_28 = { class: "font-actions" };
const _hoisted_29 = { class: "font-cdn" };
const _hoisted_30 = { class: "font-cdn-row" };
const _hoisted_31 = ["onClick"];
const _hoisted_32 = { class: "font-availability" };
const _hoisted_33 = { class: "font-download-row" };
const _hoisted_34 = ["disabled"];
const _hoisted_35 = ["disabled"];
const _hoisted_36 = ["disabled"];
const _hoisted_37 = {
  key: 1,
  class: "settings-section glass-card backend-shell"
};
const _hoisted_38 = { class: "backend-summary" };
const _hoisted_39 = { class: "status-pill" };
const _hoisted_40 = { class: "status-pill" };
const _hoisted_41 = { class: "status-pill" };
const _hoisted_42 = { class: "status-pill" };
const _hoisted_43 = { class: "status-pill" };
const _hoisted_44 = { class: "backend-block" };
const _hoisted_45 = { class: "cloud-sync-status-grid" };
const _hoisted_46 = { class: "cloud-sync-status-item" };
const _hoisted_47 = { class: "cloud-sync-status-item" };
const _hoisted_48 = { class: "cloud-sync-status-item" };
const _hoisted_49 = { class: "cloud-sync-status-item" };
const _hoisted_50 = {
  key: 0,
  class: "hint cloud-sync-error"
};
const _hoisted_51 = {
  key: 1,
  class: "hint cloud-sync-error"
};
const _hoisted_52 = { class: "backend-block" };
const _hoisted_53 = { class: "toggle-meta" };
const _hoisted_54 = ["aria-checked"];
const _hoisted_55 = { class: "backend-block" };
const _hoisted_56 = {
  key: 0,
  class: "hint"
};
const _hoisted_57 = { class: "backend-grid" };
const _hoisted_58 = { class: "field" };
const _hoisted_59 = { class: "field" };
const _hoisted_60 = { class: "field" };
const _hoisted_61 = ["placeholder"];
const _hoisted_62 = { class: "field" };
const _hoisted_63 = { class: "backend-block" };
const _hoisted_64 = { class: "backend-grid" };
const _hoisted_65 = { class: "field" };
const _hoisted_66 = { class: "field" };
const _hoisted_67 = { class: "field" };
const _hoisted_68 = { class: "field" };
const _hoisted_69 = { class: "field" };
const _hoisted_70 = { class: "field" };
const _hoisted_71 = { class: "field" };
const _hoisted_72 = { class: "field" };
const _hoisted_73 = { class: "field" };
const _hoisted_74 = { class: "field" };
const _hoisted_75 = { class: "field" };
const _hoisted_76 = { class: "backend-block" };
const _hoisted_77 = { class: "section-head section-head-compact" };
const _hoisted_78 = ["disabled"];
const _hoisted_79 = { class: "probe-list" };
const _hoisted_80 = { class: "probe-main" };
const _hoisted_81 = { class: "probe-url" };
const _hoisted_82 = {
  key: 0,
  class: "hint"
};
const _hoisted_83 = {
  key: 2,
  class: "settings-section identity-security-tab"
};
const _hoisted_84 = {
  key: 3,
  class: "settings-section glass-card debug-shell"
};
const _hoisted_85 = { class: "backend-summary" };
const _hoisted_86 = { class: "status-pill" };
const _hoisted_87 = { class: "status-pill" };
const _hoisted_88 = { class: "status-pill" };
const _hoisted_89 = { class: "debug-filter-row" };
const _hoisted_90 = ["onClick"];
const _hoisted_91 = {
  ref: "debugPanelRef",
  class: "debug-log-panel"
};
const _hoisted_92 = { class: "debug-log-head" };
const _hoisted_93 = { class: "debug-time" };
const _hoisted_94 = { class: "debug-level" };
const _hoisted_95 = { class: "debug-scope" };
const _hoisted_96 = { class: "debug-message" };
const _hoisted_97 = {
  key: 0,
  class: "hint"
};
const _hoisted_98 = {
  key: 4,
  class: "font-modal"
};
const _hoisted_99 = { class: "font-modal-card" };
const _hoisted_100 = { class: "font-modal-progress" };
const _hoisted_101 = { class: "progress-bar" };
const _hoisted_102 = { key: 0 };
const _hoisted_103 = { key: 1 };
const _hoisted_104 = { key: 2 };
const _hoisted_105 = { key: 3 };
const _hoisted_106 = {
  key: 0,
  class: "font-step"
};
const _hoisted_107 = {
  key: 1,
  class: "font-error"
};
const _hoisted_108 = { class: "font-modal-actions" };
const _hoisted_109 = { class: "theme-scene" };
const _hoisted_110 = { class: "theme-moon-anim" };
const _hoisted_111 = { class: "moon-stars" };
const _hoisted_112 = { class: "theme-transition-text" };
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
        _cache[37] || (_cache[37] = createBaseVNode("h1", { class: "header-title" }, "设置中心", -1)),
        _cache[38] || (_cache[38] = createBaseVNode("div", { class: "header-spacer" }, null, -1))
      ]),
      createBaseVNode("div", _hoisted_3, [
        createBaseVNode("button", {
          class: normalizeClass(["settings-tab-item", { active: $setup.activeTab === "appearance" }]),
          onClick: _cache[1] || (_cache[1] = ($event) => $setup.activeTab = "appearance")
        }, " 外观 ", 2),
        createBaseVNode("button", {
          class: normalizeClass(["settings-tab-item", { active: $setup.activeTab === "backend" }]),
          onClick: _cache[2] || (_cache[2] = ($event) => $setup.activeTab = "backend")
        }, " 后端 ", 2),
        createBaseVNode("button", {
          class: normalizeClass(["settings-tab-item", { active: $setup.activeTab === "security" }]),
          onClick: _cache[3] || (_cache[3] = ($event) => $setup.activeTab = "security")
        }, " 安全 ", 2),
        createBaseVNode("button", {
          class: normalizeClass(["settings-tab-item", { active: $setup.activeTab === "debug" }]),
          onClick: _cache[4] || (_cache[4] = ($event) => $setup.activeTab = "debug")
        }, " 调试 ", 2)
      ]),
      $setup.activeTab === "appearance" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
        createBaseVNode("section", _hoisted_4, [
          createBaseVNode("div", _hoisted_5, [
            _cache[39] || (_cache[39] = createBaseVNode("span", { class: "startup-page-label" }, "启动页面", -1)),
            createBaseVNode("div", _hoisted_6, [
              createBaseVNode("button", {
                class: normalizeClass(["toggle-btn btn-ripple", { active: $setup.uiSettings.startupPage === "home" }]),
                onClick: _cache[5] || (_cache[5] = ($event) => {
                  $setup.uiSettings.startupPage = "home";
                  $setup.showToast("启动页面：首页", "success");
                })
              }, "首页", 2),
              createBaseVNode("button", {
                class: normalizeClass(["toggle-btn btn-ripple", { active: $setup.uiSettings.startupPage === "schedule" }]),
                onClick: _cache[6] || (_cache[6] = ($event) => {
                  $setup.uiSettings.startupPage = "schedule";
                  $setup.showToast("启动页面：课表", "success");
                })
              }, "课表", 2)
            ])
          ]),
          createBaseVNode("div", _hoisted_7, [
            _cache[40] || (_cache[40] = createBaseVNode("span", { class: "startup-page-label" }, "开屏动画", -1)),
            createBaseVNode("div", _hoisted_8, [
              createBaseVNode("button", {
                class: normalizeClass(["toggle-btn btn-ripple", { active: $setup.uiSettings.splashEnabled }]),
                onClick: _cache[7] || (_cache[7] = ($event) => {
                  $setup.uiSettings.splashEnabled = true;
                  $setup.showToast("开屏动画：已开启", "success");
                })
              }, "开启", 2),
              createBaseVNode("button", {
                class: normalizeClass(["toggle-btn btn-ripple", { active: !$setup.uiSettings.splashEnabled }]),
                onClick: _cache[8] || (_cache[8] = ($event) => {
                  $setup.uiSettings.splashEnabled = false;
                  $setup.showToast("开屏动画：已关闭", "success");
                })
              }, "关闭", 2)
            ])
          ])
        ]),
        createBaseVNode("section", _hoisted_9, [
          _cache[42] || (_cache[42] = createBaseVNode("div", { class: "section-head" }, [
            createBaseVNode("h3", null, "主题模式")
          ], -1)),
          createBaseVNode("div", _hoisted_10, [
            _cache[41] || (_cache[41] = createBaseVNode("label", null, "外观模式", -1)),
            createBaseVNode("div", _hoisted_11, [
              (openBlock(), createElementBlock(Fragment, null, renderList($setup.nightModeOptions, (item) => {
                return createBaseVNode("button", {
                  key: item.key,
                  class: normalizeClass(["option-chip", { active: $setup.nightModePreference === item.key }]),
                  onClick: ($event) => $setup.setNightMode(item.key)
                }, [
                  createBaseVNode("strong", null, toDisplayString(item.label), 1),
                  createBaseVNode("small", null, toDisplayString(item.desc), 1)
                ], 10, _hoisted_12);
              }), 64))
            ]),
            createBaseVNode("p", _hoisted_13, toDisplayString($setup.nightModeHint), 1)
          ])
        ]),
        createBaseVNode("section", _hoisted_14, [
          _cache[46] || (_cache[46] = createBaseVNode("h3", null, "界面个性化", -1)),
          createBaseVNode("div", _hoisted_15, [
            _cache[43] || (_cache[43] = createBaseVNode("label", null, "卡片风格", -1)),
            createBaseVNode("div", _hoisted_16, [
              (openBlock(), createElementBlock(Fragment, null, renderList($setup.cardStyleOptions, (item) => {
                return createBaseVNode("button", {
                  key: item.key,
                  class: normalizeClass(["option-chip", { active: $setup.uiSettings.profile.cardStyle === item.key }]),
                  onClick: ($event) => $setup.setProfileOption("cardStyle", item.key, `卡片风格：${item.label}`)
                }, [
                  createBaseVNode("strong", null, toDisplayString(item.label), 1),
                  createBaseVNode("small", null, toDisplayString(item.desc), 1)
                ], 10, _hoisted_17);
              }), 64))
            ])
          ]),
          createBaseVNode("div", _hoisted_18, [
            _cache[44] || (_cache[44] = createBaseVNode("label", null, "导航样式", -1)),
            createBaseVNode("div", _hoisted_19, [
              (openBlock(), createElementBlock(Fragment, null, renderList($setup.navStyleOptions, (item) => {
                return createBaseVNode("button", {
                  key: item.key,
                  class: normalizeClass(["option-chip", { active: $setup.uiSettings.profile.navStyle === item.key }]),
                  onClick: ($event) => $setup.setProfileOption("navStyle", item.key, `导航样式：${item.label}`)
                }, [
                  createBaseVNode("strong", null, toDisplayString(item.label), 1),
                  createBaseVNode("small", null, toDisplayString(item.desc), 1)
                ], 10, _hoisted_20);
              }), 64))
            ])
          ]),
          createBaseVNode("div", _hoisted_21, [
            _cache[45] || (_cache[45] = createBaseVNode("label", null, "界面密度", -1)),
            createBaseVNode("div", _hoisted_22, [
              (openBlock(), createElementBlock(Fragment, null, renderList($setup.densityOptions, (item) => {
                return createBaseVNode("button", {
                  key: item.key,
                  class: normalizeClass(["option-chip", { active: $setup.uiSettings.profile.density === item.key }]),
                  onClick: ($event) => $setup.setProfileOption("density", item.key, `界面密度：${item.label}`)
                }, [
                  createBaseVNode("strong", null, toDisplayString(item.label), 1),
                  createBaseVNode("small", null, toDisplayString(item.desc), 1)
                ], 10, _hoisted_23);
              }), 64))
            ])
          ])
        ]),
        createBaseVNode("section", _hoisted_24, [
          _cache[47] || (_cache[47] = createBaseVNode("h3", null, "风格套装", -1)),
          createBaseVNode("div", _hoisted_25, [
            (openBlock(), createElementBlock(Fragment, null, renderList($setup.interactionProfiles, (profile) => {
              return createBaseVNode("button", {
                key: profile.key,
                class: "profile-card",
                onClick: ($event) => $setup.handleApplyProfile(profile)
              }, [
                createBaseVNode("strong", null, toDisplayString(profile.label), 1),
                createBaseVNode("span", null, toDisplayString(profile.desc), 1)
              ], 8, _hoisted_26);
            }), 64))
          ])
        ]),
        createBaseVNode("section", _hoisted_27, [
          _cache[51] || (_cache[51] = createBaseVNode("h3", null, "字体", -1)),
          createBaseVNode("div", _hoisted_28, [
            createBaseVNode("button", {
              class: normalizeClass(["font-btn btn-ripple", { active: $setup.fontSettings.font === "default" }]),
              onClick: _cache[9] || (_cache[9] = ($event) => $setup.handleSelectFont("default"))
            }, " 默认字体 ", 2),
            createBaseVNode("button", {
              class: normalizeClass(["font-btn btn-ripple", { active: $setup.fontSettings.font === "heiti" }]),
              onClick: _cache[10] || (_cache[10] = ($event) => $setup.handleSelectFont("heiti"))
            }, " 黑体 ", 2),
            createBaseVNode("button", {
              class: normalizeClass(["font-btn btn-ripple", { active: $setup.fontSettings.font === "songti" }]),
              onClick: _cache[11] || (_cache[11] = ($event) => $setup.handleSelectFont("songti"))
            }, " 宋体 ", 2),
            createBaseVNode("button", {
              class: normalizeClass(["font-btn btn-ripple", { active: $setup.fontSettings.font === "kaiti" }]),
              onClick: _cache[12] || (_cache[12] = ($event) => $setup.handleSelectFont("kaiti"))
            }, " 楷体 ", 2),
            createBaseVNode("button", {
              class: normalizeClass(["font-btn btn-ripple", { active: $setup.fontSettings.font === "fangsong" }]),
              onClick: _cache[13] || (_cache[13] = ($event) => $setup.handleSelectFont("fangsong"))
            }, " 仿宋 ", 2),
            createBaseVNode("button", {
              class: normalizeClass(["font-btn btn-ripple", { active: $setup.fontSettings.font === "deyihei" }]),
              onClick: _cache[14] || (_cache[14] = ($event) => $setup.handleSelectFont("deyihei"))
            }, " 得意黑（需下载） ", 2)
          ]),
          createBaseVNode("div", _hoisted_29, [
            _cache[48] || (_cache[48] = createBaseVNode("label", null, "字体 CDN 节点", -1)),
            createBaseVNode("div", _hoisted_30, [
              (openBlock(true), createElementBlock(Fragment, null, renderList($setup.fontCdnOptions, (option) => {
                return openBlock(), createElementBlock("button", {
                  key: option.key,
                  class: normalizeClass(["font-cdn-btn btn-ripple", { active: $setup.fontSettings.cdnProvider === option.key }]),
                  onClick: ($event) => $setup.handleSelectCdnProvider(option.key)
                }, [
                  createBaseVNode("strong", null, toDisplayString(option.label), 1),
                  createBaseVNode("small", null, toDisplayString(option.desc), 1)
                ], 10, _hoisted_31);
              }), 128))
            ])
          ]),
          createBaseVNode("div", _hoisted_32, [
            _cache[49] || (_cache[49] = createBaseVNode("label", null, "本地字体可用性说明", -1)),
            createBaseVNode("ul", null, [
              (openBlock(true), createElementBlock(Fragment, null, renderList($setup.fontLocalAvailability, (item) => {
                return openBlock(), createElementBlock("li", { key: item }, toDisplayString(item), 1);
              }), 128))
            ])
          ]),
          createBaseVNode("div", _hoisted_33, [
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              disabled: $setup.downloadingFont,
              onClick: _cache[15] || (_cache[15] = ($event) => $setup.handleDownloadFont($setup.fontSettings.loaded))
            }, toDisplayString($setup.downloadingFont ? "下载中..." : $setup.fontSettings.loaded ? "重新下载得意黑" : "下载得意黑"), 9, _hoisted_34),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              disabled: $setup.cdnPrefetching,
              onClick: _cache[16] || (_cache[16] = ($event) => $setup.handlePrefetchFonts(false))
            }, toDisplayString($setup.cdnPrefetching ? "缓存中..." : $setup.prefetchButtonText), 9, _hoisted_35),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              disabled: $setup.cdnPrefetching,
              onClick: _cache[17] || (_cache[17] = ($event) => $setup.handlePrefetchFonts(false, true))
            }, toDisplayString($setup.cdnPrefetching ? "缓存中..." : "缓存全部字体"), 9, _hoisted_36),
            _cache[50] || (_cache[50] = createBaseVNode("span", { class: "hint" }, "字体选择会自动保存；下次打开应用会自动恢复上次字体。", -1))
          ])
        ])
      ], 64)) : $setup.activeTab === "backend" ? (openBlock(), createElementBlock("section", _hoisted_37, [
        createBaseVNode("div", { class: "section-head" }, [
          _cache[52] || (_cache[52] = createBaseVNode("h3", null, "后端与模块参数", -1)),
          createBaseVNode("button", {
            class: "mini-btn btn-ripple",
            onClick: $setup.handleResetBackend
          }, "恢复默认")
        ]),
        createBaseVNode("div", _hoisted_38, [
          createBaseVNode("span", _hoisted_39, "配置源：" + toDisplayString($setup.backendSourceLabel), 1),
          createBaseVNode("span", _hoisted_40, "运行时：" + toDisplayString($setup.runtimeLabel), 1),
          createBaseVNode("span", _hoisted_41, "预览线程：" + toDisplayString($setup.activePreviewThreads), 1),
          createBaseVNode("span", _hoisted_42, "下载线程：" + toDisplayString($setup.activeDownloadThreads), 1),
          createBaseVNode("span", _hoisted_43, "设备：" + toDisplayString($setup.activeDeviceLabel), 1)
        ]),
        createBaseVNode("div", _hoisted_44, [
          createBaseVNode("div", { class: "section-head section-head-compact" }, [
            _cache[53] || (_cache[53] = createBaseVNode("h4", null, "云同步状态", -1)),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              onClick: $setup.refreshCloudSyncStatus
            }, "刷新状态")
          ]),
          _cache[58] || (_cache[58] = createBaseVNode("p", { class: "hint" }, "用于确认本机云同步上传/下载是否执行成功。", -1)),
          createBaseVNode("div", _hoisted_45, [
            createBaseVNode("article", _hoisted_46, [
              _cache[54] || (_cache[54] = createBaseVNode("small", null, "服务状态", -1)),
              createBaseVNode("strong", {
                class: normalizeClass({ ok: $setup.cloudSyncRuntime.enabled, error: !$setup.cloudSyncRuntime.enabled })
              }, toDisplayString($setup.cloudSyncEnabledText), 3)
            ]),
            createBaseVNode("article", _hoisted_47, [
              _cache[55] || (_cache[55] = createBaseVNode("small", null, "上次上传", -1)),
              createBaseVNode("strong", {
                class: normalizeClass({ ok: $setup.cloudSyncStatus?.lastUploadOk, error: $setup.cloudSyncStatus?.lastUploadAt && !$setup.cloudSyncStatus?.lastUploadOk })
              }, toDisplayString($setup.cloudSyncUploadStatusText), 3),
              createBaseVNode("span", null, toDisplayString($setup.formatStatusTime($setup.cloudSyncStatus?.lastUploadAt)), 1)
            ]),
            createBaseVNode("article", _hoisted_48, [
              _cache[56] || (_cache[56] = createBaseVNode("small", null, "上次下载", -1)),
              createBaseVNode("strong", {
                class: normalizeClass({ ok: $setup.cloudSyncStatus?.lastDownloadOk, error: $setup.cloudSyncStatus?.lastDownloadAt && !$setup.cloudSyncStatus?.lastDownloadOk })
              }, toDisplayString($setup.cloudSyncDownloadStatusText), 3),
              createBaseVNode("span", null, toDisplayString($setup.formatStatusTime($setup.cloudSyncStatus?.lastDownloadAt)), 1)
            ]),
            createBaseVNode("article", _hoisted_49, [
              _cache[57] || (_cache[57] = createBaseVNode("small", null, "最近更新", -1)),
              createBaseVNode("strong", null, toDisplayString($setup.cloudSyncStatusUpdatedAt || "—"), 1),
              createBaseVNode("span", null, "学号：" + toDisplayString($setup.cloudSyncStatus?.studentId || $setup.currentStudentId), 1)
            ])
          ]),
          $setup.cloudSyncLastUploadError ? (openBlock(), createElementBlock("p", _hoisted_50, "上传错误：" + toDisplayString($setup.cloudSyncLastUploadError), 1)) : createCommentVNode("", true),
          $setup.cloudSyncLastDownloadError ? (openBlock(), createElementBlock("p", _hoisted_51, "下载错误：" + toDisplayString($setup.cloudSyncLastDownloadError), 1)) : createCommentVNode("", true)
        ]),
        createBaseVNode("div", _hoisted_52, [
          createBaseVNode("div", {
            class: normalizeClass(["toggle-row", {
              active: $setup.localOnlyModeEnabled,
              inactive: !$setup.localOnlyModeEnabled
            }])
          }, [
            _cache[60] || (_cache[60] = createBaseVNode("div", { class: "toggle-text" }, [
              createBaseVNode("strong", null, "不使用远程配置（仅本地）"),
              createBaseVNode("small", null, "开启后只应用本地设置，远程配置将不再覆盖 OCR/上传地址。")
            ], -1)),
            createBaseVNode("div", _hoisted_53, [
              createBaseVNode("span", {
                class: normalizeClass(["toggle-badge", {
                  active: $setup.localOnlyModeEnabled,
                  inactive: !$setup.localOnlyModeEnabled
                }])
              }, toDisplayString($setup.localOnlyModeEnabled ? "仅本地" : "远程配置"), 3),
              createBaseVNode("button", {
                type: "button",
                class: normalizeClass(["toggle-switch", { checked: $setup.localOnlyModeEnabled }]),
                role: "switch",
                "aria-checked": $setup.localOnlyModeEnabled,
                onClick: $setup.handleRemoteModeChanged
              }, [..._cache[59] || (_cache[59] = [
                createBaseVNode("span", { class: "toggle-thumb" }, null, -1)
              ])], 10, _hoisted_54)
            ])
          ], 2)
        ]),
        createBaseVNode("div", _hoisted_55, [
          _cache[65] || (_cache[65] = createBaseVNode("h4", null, "本地服务设置", -1)),
          _cache[66] || (_cache[66] = createBaseVNode("p", { class: "hint" }, "仅支持手动填写地址，不展示本地预设列表。", -1)),
          _cache[67] || (_cache[67] = createBaseVNode("p", { class: "hint" }, "修改后会自动保存到本地并自动应用到当前运行实例。", -1)),
          $setup.appSettings.backend.useRemoteConfig ? (openBlock(), createElementBlock("p", _hoisted_56, " 当前启用远程配置，远程刷新后 OCR/上传/云同步中转地址可能被覆盖；若需固定使用本地地址，请开启“仅本地”。 ")) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_57, [
            createBaseVNode("label", _hoisted_58, [
              _cache[61] || (_cache[61] = createBaseVNode("span", null, "OCR 服务器", -1)),
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
            createBaseVNode("label", _hoisted_59, [
              _cache[62] || (_cache[62] = createBaseVNode("span", null, "临时文件上传服务器", -1)),
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
            createBaseVNode("label", _hoisted_60, [
              _cache[63] || (_cache[63] = createBaseVNode("span", null, "云同步中转地址", -1)),
              withDirectives(createBaseVNode("input", {
                type: "text",
                placeholder: `默认：${$setup.DEFAULT_CLOUD_SYNC_ENDPOINT}`,
                "onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => $setup.appSettings.backend.cloudSyncEndpoint = $event)
              }, null, 8, _hoisted_61), [
                [
                  vModelText,
                  $setup.appSettings.backend.cloudSyncEndpoint,
                  void 0,
                  { trim: true }
                ]
              ])
            ]),
            createBaseVNode("label", _hoisted_62, [
              _cache[64] || (_cache[64] = createBaseVNode("span", null, "云同步秘钥引用（secret_ref）", -1)),
              withDirectives(createBaseVNode("input", {
                type: "text",
                placeholder: "默认：kv1-main（仅引用，不是明文秘钥）",
                "onUpdate:modelValue": _cache[21] || (_cache[21] = ($event) => $setup.appSettings.backend.cloudSyncSecretRef = $event)
              }, null, 512), [
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
        createBaseVNode("div", _hoisted_63, [
          _cache[79] || (_cache[79] = createBaseVNode("h4", null, "模块参数", -1)),
          createBaseVNode("div", _hoisted_64, [
            createBaseVNode("label", _hoisted_65, [
              _cache[68] || (_cache[68] = createBaseVNode("span", null, "电费查询重试次数", -1)),
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
            createBaseVNode("label", _hoisted_66, [
              _cache[69] || (_cache[69] = createBaseVNode("span", null, "空教室查询重试次数", -1)),
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
            createBaseVNode("label", _hoisted_67, [
              _cache[70] || (_cache[70] = createBaseVNode("span", null, "重试间隔（ms）", -1)),
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
            createBaseVNode("label", _hoisted_68, [
              _cache[71] || (_cache[71] = createBaseVNode("span", null, "通知检查请求超时（ms）", -1)),
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
            createBaseVNode("label", _hoisted_69, [
              _cache[72] || (_cache[72] = createBaseVNode("span", null, "功能测速超时（ms）", -1)),
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
            createBaseVNode("label", _hoisted_70, [
              _cache[73] || (_cache[73] = createBaseVNode("span", null, "云同步上传冷却（秒，至少120）", -1)),
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
            createBaseVNode("label", _hoisted_71, [
              _cache[74] || (_cache[74] = createBaseVNode("span", null, "云同步下载冷却（秒，至少10）", -1)),
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
            createBaseVNode("label", _hoisted_72, [
              _cache[75] || (_cache[75] = createBaseVNode("span", null, "移动端预览线程", -1)),
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
            createBaseVNode("label", _hoisted_73, [
              _cache[76] || (_cache[76] = createBaseVNode("span", null, "桌面端预览线程", -1)),
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
            createBaseVNode("label", _hoisted_74, [
              _cache[77] || (_cache[77] = createBaseVNode("span", null, "移动端下载线程", -1)),
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
            createBaseVNode("label", _hoisted_75, [
              _cache[78] || (_cache[78] = createBaseVNode("span", null, "桌面端下载线程", -1)),
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
          _cache[80] || (_cache[80] = createBaseVNode("p", { class: "hint" }, "并发越高速度通常越快，但会提高设备与网络占用。", -1))
        ]),
        createBaseVNode("div", _hoisted_76, [
          createBaseVNode("div", _hoisted_77, [
            _cache[81] || (_cache[81] = createBaseVNode("h4", null, "功能测试", -1)),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              disabled: $setup.probeRunning,
              onClick: $setup.handleRunConnectivityTest
            }, toDisplayString($setup.probeRunning ? "测速中..." : "开始测速"), 9, _hoisted_78)
          ]),
          _cache[82] || (_cache[82] = createBaseVNode("p", { class: "hint" }, "并发测试当前 OCR、上传、云同步、新融合门户、教务系统、超星渠道、一卡通与图书馆地址。", -1)),
          createBaseVNode("div", _hoisted_79, [
            (openBlock(true), createElementBlock(Fragment, null, renderList($setup.probeRows, (item) => {
              return openBlock(), createElementBlock("article", {
                key: item.id,
                class: "probe-item"
              }, [
                createBaseVNode("div", _hoisted_80, [
                  createBaseVNode("strong", null, toDisplayString(item.label), 1),
                  createBaseVNode("small", null, toDisplayString(item.desc), 1),
                  createBaseVNode("code", _hoisted_81, toDisplayString(item.url || "未设置地址"), 1)
                ]),
                createBaseVNode("span", {
                  class: normalizeClass(["probe-state", $setup.probeStateClass(item.id)])
                }, toDisplayString($setup.probeStateText(item.id)), 3)
              ]);
            }), 128))
          ]),
          $setup.probeFinishedAt ? (openBlock(), createElementBlock("p", _hoisted_82, "最近测速：" + toDisplayString($setup.probeFinishedAt), 1)) : createCommentVNode("", true)
        ])
      ])) : $setup.activeTab === "security" ? (openBlock(), createElementBlock("section", _hoisted_83, [
        _cache[83] || (_cache[83] = createBaseVNode("div", { class: "section-head" }, [
          createBaseVNode("h3", null, "登录与安全")
        ], -1)),
        createVNode($setup["IdentityQrLoginEntry"], { identity: $props.identity }, null, 8, ["identity"]),
        createVNode($setup["IdentityDeviceSettings"])
      ])) : (openBlock(), createElementBlock("section", _hoisted_84, [
        createBaseVNode("div", { class: "section-head" }, [
          _cache[84] || (_cache[84] = createBaseVNode("h3", null, "调试日志", -1)),
          createBaseVNode("div", { class: "debug-head-actions" }, [
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              onClick: $setup.refreshDebugPanel
            }, "刷新"),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple",
              onClick: $setup.handleCopyDebugLogs
            }, "复制"),
            createBaseVNode("button", {
              class: "mini-btn btn-ripple danger",
              onClick: $setup.handleClearDebugPanel
            }, "清空")
          ])
        ]),
        createBaseVNode("div", _hoisted_85, [
          createBaseVNode("span", _hoisted_86, "总日志：" + toDisplayString($setup.debugStats.total), 1),
          createBaseVNode("span", _hoisted_87, "告警：" + toDisplayString($setup.debugStats.warns), 1),
          createBaseVNode("span", _hoisted_88, "错误：" + toDisplayString($setup.debugStats.errors), 1)
        ]),
        createBaseVNode("div", _hoisted_89, [
          (openBlock(), createElementBlock(Fragment, null, renderList($setup.debugLevelOptions, (option) => {
            return createBaseVNode("button", {
              key: option.key,
              class: normalizeClass(["debug-filter-btn btn-ripple", { active: $setup.debugFilter === option.key }]),
              onClick: ($event) => $setup.debugFilter = option.key
            }, toDisplayString(option.label), 11, _hoisted_90);
          }), 64))
        ]),
        createBaseVNode("div", _hoisted_91, [
          (openBlock(true), createElementBlock(Fragment, null, renderList($setup.filteredDebugLogs, (item) => {
            return openBlock(), createElementBlock("article", {
              key: item.id,
              class: normalizeClass(["debug-log-item", `lvl-${item.level}`])
            }, [
              createBaseVNode("header", _hoisted_92, [
                createBaseVNode("span", _hoisted_93, toDisplayString($setup.formatDebugTime(item.ts)), 1),
                createBaseVNode("span", _hoisted_94, toDisplayString(String(item.level || "log").toUpperCase()), 1),
                createBaseVNode("span", _hoisted_95, toDisplayString(item.scope), 1)
              ]),
              createBaseVNode("p", _hoisted_96, toDisplayString(item.message), 1)
            ], 2);
          }), 128)),
          !$setup.filteredDebugLogs.length ? (openBlock(), createElementBlock("p", _hoisted_97, "暂无日志，执行一次功能后会自动出现。")) : createCommentVNode("", true)
        ], 512)
      ])),
      $setup.showFontModal ? (openBlock(), createElementBlock("div", _hoisted_98, [
        createBaseVNode("div", _hoisted_99, [
          createBaseVNode("h3", null, toDisplayString($setup.fontModalTitle), 1),
          createBaseVNode("p", null, toDisplayString($setup.fontModalDescription), 1),
          createBaseVNode("div", _hoisted_100, [
            createBaseVNode("div", _hoisted_101, [
              createBaseVNode("div", {
                class: "progress-fill",
                style: normalizeStyle({ width: `${$setup.fontDownloadProgress}%` })
              }, null, 4)
            ]),
            $setup.fontDownloadStatus === "downloading" ? (openBlock(), createElementBlock("span", _hoisted_102, "下载中...")) : $setup.fontDownloadStatus === "success" ? (openBlock(), createElementBlock("span", _hoisted_103, "下载完成")) : $setup.fontDownloadStatus === "failed" ? (openBlock(), createElementBlock("span", _hoisted_104, "下载失败")) : (openBlock(), createElementBlock("span", _hoisted_105, "等待开始"))
          ]),
          $setup.fontDownloadStep ? (openBlock(), createElementBlock("p", _hoisted_106, toDisplayString($setup.fontDownloadStep), 1)) : createCommentVNode("", true),
          $setup.fontDownloadError ? (openBlock(), createElementBlock("p", _hoisted_107, toDisplayString($setup.fontDownloadError), 1)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_108, [
            $setup.fontDownloadStatus === "failed" && $setup.fontModalRetryMode === "deyihei" ? (openBlock(), createElementBlock("button", {
              key: 0,
              class: "btn-secondary btn-ripple",
              onClick: _cache[33] || (_cache[33] = ($event) => $setup.handleDownloadFont(true))
            }, " 重试下载 ")) : createCommentVNode("", true),
            $setup.fontDownloadStatus === "failed" && $setup.fontModalRetryMode === "prefetch" ? (openBlock(), createElementBlock("button", {
              key: 1,
              class: "btn-secondary btn-ripple",
              onClick: _cache[34] || (_cache[34] = ($event) => $setup.handlePrefetchFonts(true))
            }, " 重试缓存 ")) : createCommentVNode("", true),
            createBaseVNode("button", {
              class: "btn-primary btn-ripple",
              onClick: _cache[35] || (_cache[35] = ($event) => $setup.showFontModal = false)
            }, "关闭")
          ])
        ])
      ])) : createCommentVNode("", true)
    ]),
    (openBlock(), createBlock(Teleport, { to: "body" }, [
      $setup.themeTransitioning ? (openBlock(), createElementBlock("div", {
        key: 0,
        class: normalizeClass(["theme-fullscreen-overlay", $setup.themeTransitionType])
      }, [
        createBaseVNode("div", _hoisted_109, [
          _cache[89] || (_cache[89] = createBaseVNode("div", { class: "theme-horizon" }, null, -1)),
          $setup.themeTransitionType === "to-light" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            _cache[85] || (_cache[85] = createBaseVNode("div", { class: "theme-sun-anim" }, [
              createBaseVNode("div", { class: "sun-body" }, [
                createBaseVNode("i", { class: "fas fa-sun" })
              ]),
              createBaseVNode("div", { class: "sun-rays" })
            ], -1)),
            _cache[86] || (_cache[86] = createBaseVNode("div", { class: "theme-moon-fall" }, [
              createBaseVNode("div", {
                class: "moon-body",
                style: { "width": "56px", "height": "56px", "font-size": "24px" }
              }, [
                createBaseVNode("i", { class: "fas fa-moon" })
              ])
            ], -1))
          ], 64)) : createCommentVNode("", true),
          $setup.themeTransitionType === "to-dark" ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            createBaseVNode("div", _hoisted_110, [
              _cache[87] || (_cache[87] = createBaseVNode("div", { class: "moon-body" }, [
                createBaseVNode("i", { class: "fas fa-moon" })
              ], -1)),
              createBaseVNode("div", _hoisted_111, [
                (openBlock(), createElementBlock(Fragment, null, renderList(12, (i) => {
                  return createBaseVNode("span", {
                    key: i,
                    class: "m-star",
                    style: normalizeStyle({ "--delay": `${i * 0.08}s`, "--x": `${Math.random() * 100}%`, "--y": `${Math.random() * 60}%` })
                  }, null, 4);
                }), 64))
              ])
            ]),
            _cache[88] || (_cache[88] = createBaseVNode("div", { class: "theme-sun-fall" }, [
              createBaseVNode("div", {
                class: "sun-body",
                style: { "width": "56px", "height": "56px", "font-size": "24px" }
              }, [
                createBaseVNode("i", { class: "fas fa-sun" })
              ])
            ], -1))
          ], 64)) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_112, toDisplayString($setup.themeTransitionType === "to-dark" ? "夜间模式" : "白天模式"), 1)
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
    const nightModeOptions = [
      { key: "system", label: "跟随系统", desc: "自动适配系统深浅色" },
      { key: "light", label: "白天", desc: "清爽明亮" },
      { key: "dark", label: "夜间", desc: "夜间模式，保护眼睛" }
    ];
    const nightModePreference = ref(getNightModePreference());
    const isDarkMode = ref(isNightModeEnabled());
    const themeTransitioning = ref(false);
    const themeTransitionType = ref("");
    const nightModeHint = computed(() => {
      if (nightModePreference.value === "system") return "正在跟随系统深浅色自动切换";
      return nightModePreference.value === "dark" ? "夜间模式已开启，保护您的眼睛" : "白天模式，清爽明亮";
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
    const fontModalTitle = ref("字体加载");
    const fontModalDescription = ref("正在处理字体资源，请稍候。");
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
      { key: "all", label: "全部" },
      { key: "debug", label: "Debug" },
      { key: "info", label: "Info" },
      { key: "warn", label: "Warn" },
      { key: "error", label: "Error" },
      { key: "log", label: "Log" }
    ];
    const isMobileDevice = isMobileLike();
    const currentStudentId = computed(() => localStorage.getItem("hbu_username") || "未登录");
    const currentPresetLabel = computed(() => UI_PRESETS[uiSettings.preset]?.label || "自定义");
    const activeDeviceLabel = computed(() => isMobileDevice ? "移动端" : "桌面端");
    const backendSourceLabel = computed(
      () => appSettings.backend.useRemoteConfig ? "远程配置（含本地兜底）" : "仅本地配置"
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
      () => cloudSyncRuntime.value.enabled ? "已启用" : "未启用"
    );
    const cloudSyncUploadStatusText = computed(() => {
      const status = cloudSyncStatus.value;
      if (!status || !status.lastUploadAt) return "暂无上传记录";
      return status.lastUploadOk ? "最近上传成功" : "最近上传失败";
    });
    const cloudSyncDownloadStatusText = computed(() => {
      const status = cloudSyncStatus.value;
      if (!status || !status.lastDownloadAt) return "暂无下载记录";
      return status.lastDownloadOk ? "最近下载成功" : "最近下载失败";
    });
    const cloudSyncLastUploadError = computed(
      () => String(cloudSyncStatus.value?.lastUploadError || "").trim()
    );
    const cloudSyncLastDownloadError = computed(
      () => String(cloudSyncStatus.value?.lastDownloadError || "").trim()
    );
    const fontLocalAvailability = computed(() => {
      if (isMobileDevice) {
        return [
          "默认字体：本地可用（系统字体）",
          "黑体/宋体/楷体/仿宋：移动端通常不内置，建议先点“预缓存 CDN 字体”",
          "得意黑：需点击“下载得意黑”单独缓存"
        ];
      }
      return [
        "默认字体：本地可用（系统字体）",
        "黑体/宋体：Windows/macOS 上通常可本地替换",
        "楷体/仿宋：不同桌面系统覆盖不一致，建议预缓存 CDN 字体"
      ];
    });
    const FONT_DISPLAY_NAME = {
      heiti: "黑体",
      songti: "宋体",
      kaiti: "楷体",
      fangsong: "仿宋",
      deyihei: "得意黑"
    };
    const prefetchButtonText = computed(() => {
      const pending = String(pendingFontKey.value || "").trim();
      if (pending && pending !== "default") {
        return `预缓存${FONT_DISPLAY_NAME[pending] || pending}`;
      }
      const current = String(fontSettings.font || "").trim();
      if (current && current !== "default") {
        return `预缓存${FONT_DISPLAY_NAME[current] || current}`;
      }
      return "先选字体再缓存";
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
    const presetEntries = computed(
      () => Object.entries(UI_PRESETS).map(([key, preset]) => ({
        key,
        ...preset
      }))
    );
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
          label: "OCR 服务器",
          url: normalizeProbeTarget(localOcr),
          desc: "验证码识别服务"
        },
        {
          id: "upload",
          label: "临时上传服务器",
          url: normalizeProbeTarget(uploadEndpoint),
          desc: "课表导出临时文件上传"
        },
        {
          id: "cloud_sync",
          label: "云同步服务",
          url: cloudSyncEndpoint,
          desc: "账号设置与课表云备份"
        },
        {
          id: "portal",
          label: "新融合门户",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.portal),
          desc: "统一门户可达性"
        },
        {
          id: "jwxt",
          label: "教务系统",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.jwxt),
          desc: "课程/成绩主系统"
        },
        {
          id: "chaoxing",
          label: "超星渠道",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.chaoxing),
          desc: "教务超星入口"
        },
        {
          id: "oneCode",
          label: "一码通",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.oneCode),
          desc: "一卡通与电费认证入口"
        },
        {
          id: "library",
          label: "图书馆",
          url: normalizeProbeTarget(DEFAULT_BACKEND_TARGETS.library),
          desc: "图书服务站点"
        }
      ];
    });
    const cardStyleOptions = [
      { key: "glass", label: "玻璃卡片", desc: "半透明层叠，观感轻盈" },
      { key: "solid", label: "实体卡片", desc: "信息稳定，适合高频阅读" },
      { key: "outline", label: "线框卡片", desc: "弱背景，强调边界层级" }
    ];
    const navStyleOptions = [
      { key: "floating", label: "悬浮导航", desc: "圆角悬浮底栏，现代移动风格" },
      { key: "pill", label: "胶囊导航", desc: "选中态更突出，反馈更明显" },
      { key: "compact", label: "紧凑导航", desc: "占用更少高度，提升信息密度" }
    ];
    const densityOptions = [
      { key: "comfortable", label: "舒适", desc: "留白更多，触控更友好" },
      { key: "balanced", label: "均衡", desc: "效率与观感平衡（推荐）" },
      { key: "compact", label: "紧凑", desc: "压缩间距，单屏显示更多内容" }
    ];
    const startupPageOptions = [
      { key: "home", label: "首页", desc: "默认进入综合首页" },
      { key: "schedule", label: "课表", desc: "启动后直接进入课表" }
    ];
    const interactionProfiles = [
      {
        key: "mobile_focus",
        label: "移动高效",
        desc: "大按钮 · 紧凑间距 · 快速响应",
        patch: { radiusScale: 1.12, fontScale: 1.03, spaceScale: 1.08, motionScale: 0.9 },
        profile: { cardStyle: "solid", navStyle: "compact", density: "compact", iconStyle: "line", decor: "none" }
      },
      {
        key: "immersive_read",
        label: "沉浸阅读",
        desc: "柔和光效 · 舒适间距 · 细节丰富",
        patch: { radiusScale: 1.1, fontScale: 1.02, spaceScale: 1.04, motionScale: 1 },
        profile: { cardStyle: "glass", navStyle: "floating", density: "comfortable", iconStyle: "duotone", decor: "grain" }
      },
      {
        key: "minimal",
        label: "极简模式",
        desc: "线条简洁 · 信息密集 · 零装饰",
        patch: { radiusScale: 0.92, fontScale: 0.95, spaceScale: 0.9, motionScale: 0.85 },
        profile: { cardStyle: "outline", navStyle: "compact", density: "compact", iconStyle: "mono", decor: "none" }
      },
      {
        key: "classic",
        label: "经典布局",
        desc: "均衡配色 · 标准密度 · 双色图标",
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
      if (!text) return "请求失败";
      if (text.includes("timeout") || text.includes("aborted")) return "超时";
      if (text.includes("failed to fetch") || text.includes("network")) return "网络异常";
      if (text.length > 18) return `${text.slice(0, 18)}...`;
      return text;
    };
    const probeViaCapacitorHttp = async (url, timeoutMs) => {
      if (!isCapacitorApp) return null;
      try {
        const core = await __vitePreload(() => import("./runtime-bridge-HjlgKupV.js").then((n) => n.a3), true ? __vite__mapDeps([0,1]) : void 0, import.meta.url);
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
      if (result.status === "testing") return "检测中...";
      if (result.status === "skipped") return "未配置地址";
      if (result.status === "error") return `失败：${result.error || "请求异常"}`;
      if (result.status === "success") {
        if (result.httpStatus > 0) {
          return `${result.latencyMs} ms · HTTP ${result.httpStatus}`;
        }
        return `${result.latencyMs} ms · 可达`;
      }
      return "待检测";
    };
    const runSingleProbe = async (item, timeoutMs) => {
      if (!item.url) {
        probeResults.value = {
          ...probeResults.value,
          [item.id]: { status: "skipped" }
        };
        return;
      }
      pushDebugLog("Probe", `开始检测 ${item.label}: ${item.url}`, "debug");
      probeResults.value = {
        ...probeResults.value,
        [item.id]: { status: "testing" }
      };
      const result = await probeEndpoint(item.url, timeoutMs);
      pushDebugLog(
        "Probe",
        `${item.label} -> ${result.status}${result.latencyMs ? ` (${result.latencyMs}ms)` : ""}`,
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
        showToast("当前没有可测速的目标地址", "info");
        return;
      }
      pushDebugLog("Settings", `开始功能测速：目标数=${rows.length}，超时=${timeoutMs}ms`, "info");
      probeRunning.value = true;
      probeFinishedAt.value = "";
      await Promise.all(rows.map((item) => runSingleProbe(item, timeoutMs)));
      probeRunning.value = false;
      probeFinishedAt.value = (/* @__PURE__ */ new Date()).toLocaleString();
      pushDebugLog("Settings", `功能测速完成，目标数=${rows.length}，超时=${timeoutMs}ms`, "info");
      showToast("测速完成", "success");
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
      showToast("调试日志已清空", "success");
    };
    const handleCopyDebugLogs = async () => {
      const rows = debugLogs.value.map((item) => {
        return `${formatDebugTime(item.ts)} [${String(item.level || "log").toUpperCase()}][${item.scope}] ${item.message}`;
      });
      if (!rows.length) {
        showToast("当前没有调试日志", "info");
        return;
      }
      try {
        await navigator.clipboard.writeText(rows.join("\n"));
        showToast("调试日志已复制", "success");
      } catch {
        showToast("复制失败，请检查剪贴板权限", "error");
      }
    };
    const handleApplyPreset = (presetKey) => {
      applyPreset(presetKey);
      flushUiSettings();
      showToast(`已切换主题：${UI_PRESETS[presetKey].label}`, "success");
    };
    const setProfileOption = (field, value, label) => {
      if (uiSettings.profile[field] === value) {
        flushUiSettings();
        showToast(`${label}已生效`, "info");
        return;
      }
      uiSettings.profile[field] = value;
      flushUiSettings();
      showToast(`已切换：${label}`, "success");
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
      showToast(`已应用方案：${profile.label}`, "success");
    };
    const handleResetAppearance = () => {
      resetUiSettings();
      flushUiSettings();
      showToast("已恢复默认主题设置", "success");
    };
    const handleApplyBackendSettings = async ({ silent = false, emitModeEvent = false } = {}) => {
      try {
        pushDebugLog(
          "Settings",
          `应用后端配置：useRemote=${appSettings.backend.useRemoteConfig ? "1" : "0"}`
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
          `CloudSync 配置 endpoint=${cloudSyncEndpoint || "(remote/default)"} secret_ref=${cloudSyncSecretRef || "(remote/default)"} upload_cooldown=${cloudSyncUploadCooldown}s download_cooldown=${cloudSyncDownloadCooldown}s`,
          "debug"
        );
        if (emitModeEvent) {
          window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT));
        }
        if (!silent) {
          showToast("后端设置已应用", "success");
        }
        pushDebugLog("Settings", "后端配置应用成功", "info");
        return true;
      } catch (e) {
        pushDebugLog("Settings", "后端配置应用失败", "error", e);
        console.warn("[Settings] apply backend config failed", e);
        if (!silent) {
          showToast("应用后端设置失败，请检查地址格式", "error");
        }
        return false;
      }
    };
    const handleRemoteModeChanged = async () => {
      const nextUseRemoteConfig = !appSettings.backend.useRemoteConfig;
      appSettings.backend.useRemoteConfig = nextUseRemoteConfig;
      pushDebugLog("Settings", `切换配置源：${nextUseRemoteConfig ? "远程配置" : "仅本地"}`);
      if (nextUseRemoteConfig) {
        window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT));
        showToast("已启用远程配置", "success");
        return;
      }
      const ok = await handleApplyBackendSettings({ silent: true, emitModeEvent: true });
      if (ok) {
        showToast("已切换为仅本地配置", "success");
      }
    };
    const handleResetBackend = () => {
      resetAppSettings();
      probeResults.value = {};
      probeFinishedAt.value = "";
      window.dispatchEvent(new CustomEvent(REMOTE_CONFIG_MODE_EVENT));
      pushDebugLog("Settings", "后端参数已恢复默认");
      showToast("已恢复默认后端参数", "success");
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
        pushDebugLog("Font", "切换字体：默认");
        flushUiSettings();
        showToast("字体已应用", "success");
        return;
      }
      pushDebugLog("Font", `切换字体：${FONT_DISPLAY_NAME[fontKey] || fontKey}`);
      showFontModal.value = true;
      fontModalTitle.value = `加载${FONT_DISPLAY_NAME[fontKey] || "字体"}`;
      fontModalDescription.value = "正在检测本地缓存...";
      fontModalRetryMode.value = fontKey === "deyihei" ? "deyihei" : "prefetch";
      fontDownloadProgress.value = 20;
      fontDownloadStatus.value = "downloading";
      fontDownloadError.value = "";
      fontDownloadStep.value = `检测本地缓存：${FONT_DISPLAY_NAME[fontKey] || fontKey}`;
      try {
        const cached = await ensureFontLoaded(fontKey, false, true);
        if (cached) {
          fontSettings.font = fontKey;
          pendingFontKey.value = "";
          flushUiSettings();
          pushDebugLog("Font", `字体切换成功（缓存命中）：${FONT_DISPLAY_NAME[fontKey] || fontKey}`, "info");
          fontDownloadProgress.value = 100;
          fontDownloadStatus.value = "success";
          fontDownloadStep.value = "本地缓存命中，字体已应用";
          showToast("字体已应用", "success");
          showFontModal.value = false;
          return;
        }
      } catch {
      }
      pushDebugLog("Font", `本地缓存未命中，开始从 CDN 下载：${FONT_DISPLAY_NAME[fontKey] || fontKey}`);
      fontModalDescription.value = "本地未缓存，正在从 CDN 下载字体...";
      fontDownloadProgress.value = 40;
      fontDownloadStep.value = `正在下载：${FONT_DISPLAY_NAME[fontKey] || fontKey}`;
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
        pushDebugLog("Font", `字体下载并应用成功：${FONT_DISPLAY_NAME[fontKey] || fontKey}`, "info");
        fontDownloadProgress.value = 100;
        fontDownloadStatus.value = "success";
        fontDownloadStep.value = "字体下载完成，已应用";
        showToast("字体已应用", "success");
        showFontModal.value = false;
      } catch (e) {
        console.warn("[Font] download failed", e);
        pendingFontKey.value = fontKey;
        pushDebugLog("Font", `字体下载失败：${FONT_DISPLAY_NAME[fontKey] || fontKey}`, "error", e);
        fontDownloadStatus.value = "failed";
        fontDownloadError.value = "字体下载失败，请检查网络后重试。";
        fontDownloadProgress.value = 0;
        fontDownloadStep.value = "";
        showToast("字体下载失败，请检查网络后重试", "error");
      }
    };
    const handleSelectCdnProvider = async (provider) => {
      if (fontSettings.cdnProvider === provider) return;
      setFontCdnProvider(provider);
      if (fontSettings.font !== "default") {
        await ensureFontLoaded(fontSettings.font, true);
      }
      pushDebugLog("Font", `切换 CDN 节点：${provider}`);
      showToast(`字体 CDN 已切换为：${provider === "auto" ? "自动" : provider}`, "success");
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
        showToast("请先选择一个字体，再执行预缓存", "info");
        return;
      }
      pushDebugLog("Font", `开始预缓存字体，force=${force ? "1" : "0"}`);
      cdnPrefetching.value = true;
      const needDeyiheiDownload = targets.includes("deyihei") && !fontSettings.loaded;
      showFontModal.value = true;
      fontModalTitle.value = cacheAll ? "缓存全部字体" : "预缓存云端字体";
      fontModalDescription.value = cacheAll ? `正在缓存全部 ${targets.length} 种字体...` : needDeyiheiDownload ? "未检测到本地得意黑，将先缓存得意黑后再应用。" : `正在缓存：${targets.map((key) => FONT_DISPLAY_NAME[key] || key).join(" / ")}`;
      fontModalRetryMode.value = "prefetch";
      fontDownloadProgress.value = 8;
      fontDownloadStatus.value = "downloading";
      fontDownloadError.value = "";
      fontDownloadStep.value = "准备预缓存字体...";
      try {
        const results = await prefetchCdnFonts(force, ({ key, index, total, ok }) => {
          const label = FONT_DISPLAY_NAME[key] || key;
          if (showFontModal.value) {
            fontDownloadProgress.value = Math.max(12, Math.round(index / total * 100));
            fontDownloadStep.value = `(${index}/${total}) ${label}${ok ? " 缓存完成" : " 缓存失败"}`;
          }
        }, targets);
        const success = Object.values(results).filter(Boolean).length;
        const requestedKey = targets[0];
        if (requestedKey && results[requestedKey]) {
          fontSettings.font = requestedKey;
          pendingFontKey.value = "";
          flushUiSettings();
        }
        if (success === Object.keys(results).length) {
          pushDebugLog("Font", `字体预缓存完成：${success}/${Object.keys(results).length}`);
          fontDownloadStatus.value = "success";
          showToast(`字体缓存完成：${success}/${Object.keys(results).length}`, "success");
          showFontModal.value = false;
        } else {
          pushDebugLog(
            "Font",
            `字体预缓存部分失败：${success}/${Object.keys(results).length}`,
            "warn",
            results
          );
          fontDownloadStatus.value = "failed";
          fontDownloadError.value = `部分字体缓存失败（${success}/${Object.keys(results).length}）`;
          showToast("部分字体缓存失败，请重试", "error");
        }
      } catch (e) {
        pushDebugLog("Font", "字体预缓存失败", "error", e);
        console.warn("[Font] prefetch failed", e);
        fontDownloadStatus.value = "failed";
        fontDownloadError.value = "字体缓存失败，请检查网络后重试";
        fontDownloadProgress.value = 0;
        fontDownloadStep.value = "";
        showToast("字体缓存失败，请检查网络后重试", "error");
      } finally {
        cdnPrefetching.value = false;
      }
    };
    const handleDownloadFont = async (force = false) => {
      if (downloadingFont.value) return;
      pushDebugLog("Font", `下载得意黑：force=${force ? "1" : "0"}`);
      downloadingFont.value = true;
      showFontModal.value = true;
      fontModalTitle.value = "下载得意黑字体";
      fontModalDescription.value = "首次启用需下载字体文件，下载完成后会自动应用。";
      fontModalRetryMode.value = "deyihei";
      fontDownloadStep.value = "准备下载得意黑...";
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
        fontDownloadStep.value = "得意黑已缓存并应用";
        fontSettings.font = "deyihei";
        pendingFontKey.value = "";
        pushDebugLog("Font", "得意黑下载并应用成功");
        showToast("字体下载完成，已应用得意黑", "success");
        showFontModal.value = false;
      } catch (e) {
        pushDebugLog("Font", "得意黑下载失败", "error", e);
        fontDownloadStatus.value = "failed";
        fontDownloadError.value = "字体下载失败，请检查网络后重试";
        fontDownloadProgress.value = 0;
        fontDownloadStep.value = "";
        showToast("字体下载失败，请检查网络后重试", "error");
        console.warn("[Font] download failed", e);
      } finally {
        downloadingFont.value = false;
      }
    };
    const __returned__ = { emit, props, REMOTE_CONFIG_MODE_EVENT, REMOTE_UPLOAD_ENDPOINT_KEY, REMOTE_CONFIG_SNAPSHOT_KEY, DEFAULT_OCR_ENDPOINT, LOCAL_HOST_PATTERN, runtimeType, isTauriApp, isCapacitorApp, runtimeLabel, activeTab, uiSettings, appSettings, fontSettings, nightModeOptions, nightModePreference, isDarkMode, themeTransitioning, themeTransitionType, nightModeHint, setNightMode, initDarkMode, downloadingFont, showFontModal, fontDownloadProgress, fontDownloadStatus, fontDownloadError, fontModalTitle, fontModalDescription, fontDownloadStep, fontModalRetryMode, pendingFontKey, cdnPrefetching, probeRunning, probeResults, probeFinishedAt, cloudSyncStatus, cloudSyncStatusUpdatedAt, get backendAutoApplyTimer() {
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
    }, DEBUG_LOG_LIMIT, debugLevelOptions, isMobileDevice, currentStudentId, currentPresetLabel, activeDeviceLabel, backendSourceLabel, activePreviewThreads, activeDownloadThreads, fontCdnOptions, localOnlyModeEnabled, cloudSyncRuntime, cloudSyncEnabledText, cloudSyncUploadStatusText, cloudSyncDownloadStatusText, cloudSyncLastUploadError, cloudSyncLastDownloadError, fontLocalAvailability, FONT_DISPLAY_NAME, prefetchButtonText, filteredDebugLogs, debugStats, presetEntries, toSafeText, formatStatusTime, refreshCloudSyncStatus, readSnapshotUploadEndpoint, getEffectiveUploadEndpoint, normalizeProbeTarget, probeRows, cardStyleOptions, navStyleOptions, densityOptions, startupPageOptions, interactionProfiles, withCacheBust, nowMs, toShortError, probeViaCapacitorHttp, probeViaFetch, probeViaImage, probeEndpoint, getProbeResult, probeStateClass, probeStateText, runSingleProbe, handleRunConnectivityTest, refreshDebugPanel, scrollDebugToBottom, handleClearDebugPanel, handleCopyDebugLogs, handleApplyPreset, setProfileOption, handleApplyProfile, handleResetAppearance, handleApplyBackendSettings, handleRemoteModeChanged, handleResetBackend, clearBackendAutoApplyTimer, scheduleBackendAutoApply, handleSelectFont, handleSelectCdnProvider, handlePrefetchFonts, handleDownloadFont, computed, onBeforeUnmount, onMounted, ref, watch, get applyPreset() {
      return applyPreset;
    }, get flushUiSettings() {
      return flushUiSettings;
    }, get resetUiSettings() {
      return resetUiSettings;
    }, get UI_PRESETS() {
      return UI_PRESETS;
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
    } };
    Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
    return __returned__;
  }
};
const SettingsView = /* @__PURE__ */ _export_sfc(_sfc_main, [["render", render], ["__scopeId", "data-v-3cc89317"]]);
export {
  SettingsView as default
};
