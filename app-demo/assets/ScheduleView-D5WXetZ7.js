import { w as watch, o as onMounted, m as onBeforeUnmount, c as createElementBlock, b as openBlock, d as createBaseVNode, k as createBlock, h as normalizeStyle, e as computed, t as toDisplayString, q as createVNode, l as withCtx, f as createCommentVNode, a as ref, j as withModifiers, T as Transition, F as Fragment, i as renderList, u as unref, n as normalizeClass, v as Teleport, E as resolveComponent, g as createTextVNode, C as withDirectives, D as vModelText, z as nextTick } from "./vue-core-DdLVj9yW.js";
import { _ as _export_sfc, u as useUiSettings, C as CLOUD_SYNC_UPDATED_EVENT, i as consumeScheduleSwitchPending, j as writeScheduleLock, r as readScheduleLockDetail, k as isAutoScheduleLockReason, l as clearScheduleLock, m as readScheduleLock, p as readScheduleRenderSnapshot, q as getCloudSyncCooldownState, f as fetchWithCache, a as axiosInstance, E as EXTRA_LONG_TTL, D as DEFAULT_SWR_OPTIONS, n as normalizeSemesterList, h as resolveCurrentSemester, t as getCachedScheduleSnapshot, v as afterScheduleRefresh, x as warmupScheduleForStudent, y as SCHEDULE_POPUP_PENDING_KEY, z as writeScheduleRenderSnapshot, A as flushUiSettings, s as showToast, B as runCloudSyncUpload, F as runCloudSyncDownload } from "./app-demo-CxKBY5JQ.js";
import { f as formatRelativeTime } from "./time-DFqn0g8e.js";
import { p as pushDebugLog, b as isTauriRuntime, a as invokeNative, i as isTestAccountSession } from "./runtime-bridge-apFQ0nCw.js";
import { h as hasBootMetric, m as markBootMetric } from "./debug-tools-CObt9e11.js";
import "./more-modules-CsUTdMqs.js";
import "./capture-DZL0crXj.js";
const COURSE_COLOR_PRESETS = [
  { id: "lake", hex: "#72b9ff", bg: "#e7f4ff", text: "#0f5da8", label: "湖蓝" },
  { id: "coral", hex: "#ffb390", bg: "#fff0e8", text: "#cb4f2f", label: "珊瑚橘" },
  { id: "wisteria", hex: "#b8aaff", bg: "#efe9ff", text: "#5f52cf", label: "紫藤" },
  { id: "amber", hex: "#efc465", bg: "#fff4db", text: "#be7a07", label: "琥珀" },
  { id: "rose", hex: "#f3a8c4", bg: "#ffeaf2", text: "#c33f73", label: "玫瑰" },
  { id: "teal", hex: "#8adcc4", bg: "#e8faf5", text: "#117f67", label: "青绿" },
  { id: "indigo", hex: "#9eb4ff", bg: "#e8efff", text: "#335ccb", label: "靛蓝" },
  { id: "berry", hex: "#f0acbb", bg: "#fff1f5", text: "#b63f58", label: "浅莓" },
  { id: "spring", hex: "#9dd7a7", bg: "#edf8ef", text: "#2f8c3d", label: "春绿" },
  { id: "sky", hex: "#84d6ec", bg: "#e8f9ff", text: "#007893", label: "青空" },
  { id: "orchid", hex: "#c6adf1", bg: "#f4edff", text: "#7548c1", label: "兰紫" },
  { id: "apricot", hex: "#efb67f", bg: "#fff2e2", text: "#b05c16", label: "暖杏" }
];
const DEFAULT_COURSE_COLOR = "";
function normalizeHexColor(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const hasHash = raw.startsWith("#");
  let body = hasHash ? raw.slice(1).trim() : raw;
  if (hasHash && /^[0-9a-fA-F]{3}$/.test(body)) {
    body = body.split("").map((ch) => ch + ch).join("");
  } else if (/^[0-9a-fA-F]{8}$/.test(body)) {
    body = body.slice(0, 6);
  } else if (!/^[0-9a-fA-F]{6}$/.test(body)) {
    return null;
  }
  return `#${body.toLowerCase()}`;
}
function normalizeOptionalCourseColor(value) {
  if (value === null || value === void 0) return "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return "";
  return normalizeHexColor(trimmed);
}
function findPresetByHex(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return COURSE_COLOR_PRESETS.find((p) => p.hex.toLowerCase() === normalized) ?? null;
}
function contrastTextForHex(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "#0f172a";
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.55 ? "#0f172a" : "#ffffff";
}
function mixHexWithWhite(hex, amount = 0.22) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "#f8fafc";
  const t = Math.min(1, Math.max(0, amount));
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const mix = (c) => Math.round(255 * (1 - t) + c * t);
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}
function hexToHsv(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}
function hsvToHex(h, s, v) {
  const hh = (h % 360 + 360) % 360;
  const ss = Math.min(1, Math.max(0, s));
  const vv = Math.min(1, Math.max(0, v));
  const c = vv * ss;
  const x = c * (1 - Math.abs(hh / 60 % 2 - 1));
  const m = vv - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(rp)}${toHex(gp)}${toHex(bp)}`;
}
const _hoisted_1$1 = { class: "course-color-picker" };
const _hoisted_2$1 = { class: "ccp-entry-right" };
const _hoisted_3$1 = { class: "ccp-entry-meta" };
const _hoisted_4$1 = { class: "ccp-preset-grid" };
const _hoisted_5$1 = ["title", "aria-label", "onClick"];
const _hoisted_6$1 = { class: "ccp-custom-body" };
const _hoisted_7$1 = { class: "ccp-preview-row" };
const _hoisted_8$1 = { class: "ccp-hex" };
const hueGradient = "linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)";
const _sfc_main$1 = {
  __name: "CourseColorPicker",
  props: {
    /** 当前颜色 hex，空字符串表示未设定 */
    modelValue: { type: String, default: DEFAULT_COURSE_COLOR }
  },
  emits: ["update:modelValue"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const panel = ref("closed");
    const draftHex = ref("");
    const hue = ref(210);
    const sat = ref(0.55);
    const val = ref(0.95);
    const displayHex = computed(() => {
      const n = normalizeOptionalCourseColor(props.modelValue);
      return n === null ? "" : n;
    });
    const displaySwatch = computed(() => displayHex.value || "#cbd5e1");
    const isPresetSelected = (hex) => {
      const a = normalizeHexColor(hex);
      const b = normalizeHexColor(draftHex.value);
      return !!a && !!b && a === b;
    };
    const syncDraftFromModel = () => {
      const n = normalizeOptionalCourseColor(props.modelValue);
      draftHex.value = n || "";
      const hsv = hexToHsv(draftHex.value || "#72b9ff");
      if (hsv) {
        hue.value = hsv.h;
        sat.value = hsv.s;
        val.value = hsv.v;
      }
    };
    watch(
      () => props.modelValue,
      () => {
        if (panel.value === "closed") syncDraftFromModel();
      },
      { immediate: true }
    );
    const openPreset = () => {
      syncDraftFromModel();
      panel.value = "preset";
    };
    const closePanel = () => {
      panel.value = "closed";
    };
    const goCustom = () => {
      const hsv = hexToHsv(draftHex.value || "#72b9ff");
      if (hsv) {
        hue.value = hsv.h;
        sat.value = hsv.s;
        val.value = hsv.v;
      }
      panel.value = "custom";
    };
    const backToPreset = () => {
      panel.value = "preset";
    };
    const selectPreset = (hex) => {
      const n = normalizeHexColor(hex);
      if (!n) return;
      draftHex.value = n;
    };
    const clearColor = () => {
      draftHex.value = "";
    };
    const confirmColor = () => {
      const n = normalizeOptionalCourseColor(draftHex.value);
      if (n === null) return;
      emit("update:modelValue", n);
      panel.value = "closed";
    };
    const customPreview = computed(() => hsvToHex(hue.value, sat.value, val.value));
    watch([hue, sat, val], () => {
      if (panel.value !== "custom") return;
      draftHex.value = customPreview.value;
    });
    const svPanelRef = ref(null);
    const hueBarRef = ref(null);
    let draggingSv = false;
    let draggingHue = false;
    const applySvFromEvent = (event) => {
      const el = svPanelRef.value;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const clientX = event.touches?.[0]?.clientX ?? event.clientX;
      const clientY = event.touches?.[0]?.clientY ?? event.clientY;
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      sat.value = x;
      val.value = 1 - y;
    };
    const applyHueFromEvent = (event) => {
      const el = hueBarRef.value;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const clientX = event.touches?.[0]?.clientX ?? event.clientX;
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      hue.value = x * 360;
    };
    const onSvPointerDown = (event) => {
      draggingSv = true;
      applySvFromEvent(event);
      event.preventDefault?.();
    };
    const onHuePointerDown = (event) => {
      draggingHue = true;
      applyHueFromEvent(event);
      event.preventDefault?.();
    };
    const onPointerMove = (event) => {
      if (draggingSv) applySvFromEvent(event);
      if (draggingHue) applyHueFromEvent(event);
    };
    const onPointerUp = () => {
      draggingSv = false;
      draggingHue = false;
    };
    onMounted(() => {
      if (typeof window === "undefined") return;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("touchmove", onPointerMove, { passive: false });
      window.addEventListener("touchend", onPointerUp);
    });
    onBeforeUnmount(() => {
      if (typeof window === "undefined") return;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerUp);
    });
    const svKnobStyle = computed(() => ({
      left: `${sat.value * 100}%`,
      top: `${(1 - val.value) * 100}%`
    }));
    const hueKnobStyle = computed(() => ({
      left: `${hue.value / 360 * 100}%`
    }));
    const svBackground = computed(() => {
      const pure = hsvToHex(hue.value, 1, 1);
      return {
        background: `
      linear-gradient(to top, #000, transparent),
      linear-gradient(to right, #fff, ${pure})
    `
      };
    });
    const presetMatchLabel = computed(() => {
      const p = findPresetByHex(displayHex.value);
      return p?.label || (displayHex.value ? displayHex.value.toUpperCase() : "未设定");
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("button", {
          type: "button",
          class: "ccp-entry",
          onClick: openPreset
        }, [
          _cache[3] || (_cache[3] = createBaseVNode("span", { class: "ccp-entry-label" }, "设定颜色", -1)),
          createBaseVNode("span", _hoisted_2$1, [
            createBaseVNode("span", {
              class: "ccp-swatch",
              style: normalizeStyle({ background: displaySwatch.value })
            }, null, 4),
            createBaseVNode("span", _hoisted_3$1, toDisplayString(presetMatchLabel.value), 1),
            _cache[2] || (_cache[2] = createBaseVNode("span", {
              class: "ccp-chevron",
              "aria-hidden": "true"
            }, "›", -1))
          ])
        ]),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          createVNode(Transition, { name: "ccp-fade" }, {
            default: withCtx(() => [
              panel.value !== "closed" ? (openBlock(), createElementBlock("div", {
                key: 0,
                class: "ccp-mask",
                onClick: withModifiers(closePanel, ["self"])
              }, [
                createVNode(Transition, {
                  name: "ccp-sheet",
                  mode: "out-in"
                }, {
                  default: withCtx(() => [
                    panel.value === "preset" ? (openBlock(), createElementBlock("div", {
                      key: "preset",
                      class: "ccp-sheet",
                      onClick: _cache[0] || (_cache[0] = withModifiers(() => {
                      }, ["stop"]))
                    }, [
                      createBaseVNode("div", { class: "ccp-sheet-header" }, [
                        _cache[4] || (_cache[4] = createBaseVNode("div", { class: "ccp-sheet-title" }, "预设", -1)),
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-text-btn",
                          onClick: closePanel
                        }, "关闭")
                      ]),
                      createBaseVNode("div", _hoisted_4$1, [
                        (openBlock(true), createElementBlock(Fragment, null, renderList(unref(COURSE_COLOR_PRESETS), (item) => {
                          return openBlock(), createElementBlock("button", {
                            key: item.id,
                            type: "button",
                            class: normalizeClass(["ccp-preset-cell", { active: isPresetSelected(item.hex) }]),
                            title: item.label,
                            "aria-label": item.label,
                            style: normalizeStyle({ background: item.hex }),
                            onClick: ($event) => selectPreset(item.hex)
                          }, null, 14, _hoisted_5$1);
                        }), 128))
                      ]),
                      createBaseVNode("div", { class: "ccp-sheet-actions ccp-actions-3" }, [
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-secondary",
                          onClick: clearColor
                        }, "清除"),
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-secondary",
                          onClick: goCustom
                        }, "自定义"),
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-primary",
                          onClick: confirmColor
                        }, "完成")
                      ])
                    ])) : panel.value === "custom" ? (openBlock(), createElementBlock("div", {
                      key: "custom",
                      class: "ccp-sheet",
                      onClick: _cache[1] || (_cache[1] = withModifiers(() => {
                      }, ["stop"]))
                    }, [
                      createBaseVNode("div", { class: "ccp-sheet-header ccp-header-3" }, [
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-text-btn",
                          onClick: backToPreset
                        }, "返回"),
                        _cache[5] || (_cache[5] = createBaseVNode("div", { class: "ccp-sheet-title" }, "自定义", -1)),
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-text-btn",
                          onClick: closePanel
                        }, "关闭")
                      ]),
                      createBaseVNode("div", _hoisted_6$1, [
                        createBaseVNode("div", {
                          ref_key: "svPanelRef",
                          ref: svPanelRef,
                          class: "ccp-sv",
                          style: normalizeStyle(svBackground.value),
                          onPointerdown: onSvPointerDown,
                          onTouchstart: withModifiers(onSvPointerDown, ["prevent"])
                        }, [
                          createBaseVNode("span", {
                            class: "ccp-sv-knob",
                            style: normalizeStyle(svKnobStyle.value)
                          }, null, 4)
                        ], 36),
                        createBaseVNode("div", {
                          ref_key: "hueBarRef",
                          ref: hueBarRef,
                          class: "ccp-hue",
                          style: normalizeStyle({ background: hueGradient }),
                          onPointerdown: onHuePointerDown,
                          onTouchstart: withModifiers(onHuePointerDown, ["prevent"])
                        }, [
                          createBaseVNode("span", {
                            class: "ccp-hue-knob",
                            style: normalizeStyle(hueKnobStyle.value)
                          }, null, 4)
                        ], 36),
                        createBaseVNode("div", _hoisted_7$1, [
                          createBaseVNode("span", {
                            class: "ccp-swatch large",
                            style: normalizeStyle({ background: customPreview.value })
                          }, null, 4),
                          createBaseVNode("span", _hoisted_8$1, toDisplayString(customPreview.value.toUpperCase()), 1)
                        ])
                      ]),
                      createBaseVNode("div", { class: "ccp-sheet-actions ccp-actions-2" }, [
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-secondary",
                          onClick: backToPreset
                        }, "预设"),
                        createBaseVNode("button", {
                          type: "button",
                          class: "ccp-primary",
                          onClick: confirmColor
                        }, "完成")
                      ])
                    ])) : createCommentVNode("", true)
                  ]),
                  _: 1
                })
              ])) : createCommentVNode("", true)
            ]),
            _: 1
          })
        ]))
      ]);
    };
  }
};
const CourseColorPicker = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-1513f417"]]);
const _hoisted_1 = { class: "schedule-topbar" };
const _hoisted_2 = { class: "topbar-center" };
const _hoisted_3 = { class: "topbar-semester" };
const _hoisted_4 = { class: "topbar-right" };
const _hoisted_5 = { class: "week-selector" };
const _hoisted_6 = ["value"];
const _hoisted_7 = { class: "drawer-section" };
const _hoisted_8 = { class: "drawer-semester-row" };
const _hoisted_9 = ["value"];
const _hoisted_10 = {
  key: 0,
  class: "drawer-error"
};
const _hoisted_11 = { class: "drawer-section" };
const _hoisted_12 = {
  class: "drawer-style-switch",
  role: "tablist",
  "aria-label": "课程样式切换"
};
const _hoisted_13 = ["aria-pressed", "aria-selected", "onClick"];
const _hoisted_14 = { class: "drawer-actions" };
const _hoisted_15 = { class: "drawer-course-group" };
const _hoisted_16 = { class: "drawer-course-actions" };
const _hoisted_17 = ["disabled"];
const _hoisted_18 = ["disabled"];
const _hoisted_19 = { class: "drawer-sync-group" };
const _hoisted_20 = { class: "drawer-sync-actions" };
const _hoisted_21 = ["disabled"];
const _hoisted_22 = ["disabled"];
const _hoisted_23 = { class: "drawer-sync-actions drawer-sync-actions--json" };
const _hoisted_24 = ["disabled"];
const _hoisted_25 = ["disabled"];
const _hoisted_26 = { class: "drawer-sync-status" };
const _hoisted_27 = { class: "drawer-sync-cooldown" };
const _hoisted_28 = { class: "drawer-sync-cooldown" };
const _hoisted_29 = {
  key: 0,
  class: "drawer-sync-running"
};
const _hoisted_30 = {
  key: 1,
  class: "drawer-sync-export-path"
};
const _hoisted_31 = ["disabled"];
const _hoisted_32 = ["disabled"];
const _hoisted_33 = {
  key: 0,
  class: "export-result"
};
const _hoisted_34 = { class: "export-row" };
const _hoisted_35 = ["value"];
const _hoisted_36 = {
  key: 0,
  class: "export-copied"
};
const _hoisted_37 = {
  key: 1,
  class: "export-error"
};
const _hoisted_38 = {
  key: 0,
  class: "offline-banner"
};
const _hoisted_39 = {
  key: 1,
  class: "vacation-banner"
};
const _hoisted_40 = {
  key: 2,
  class: "error-banner"
};
const _hoisted_41 = { class: "modal-header" };
const _hoisted_42 = { class: "modal-body add-course-body" };
const _hoisted_43 = { class: "add-course-semester" };
const _hoisted_44 = { class: "add-field" };
const _hoisted_45 = { class: "add-field" };
const _hoisted_46 = { class: "add-field" };
const _hoisted_47 = { class: "add-field" };
const _hoisted_48 = ["value"];
const _hoisted_49 = { class: "add-row" };
const _hoisted_50 = { class: "add-field" };
const _hoisted_51 = ["value"];
const _hoisted_52 = { class: "add-field" };
const _hoisted_53 = ["value"];
const _hoisted_54 = { class: "add-field" };
const _hoisted_55 = { class: "add-field" };
const _hoisted_56 = {
  key: 0,
  class: "drawer-error add-course-error"
};
const _hoisted_57 = { class: "add-actions" };
const _hoisted_58 = ["disabled"];
const _hoisted_59 = ["disabled"];
const _hoisted_60 = { class: "modal-body manage-course-body" };
const _hoisted_61 = {
  key: 0,
  class: "manage-course-empty"
};
const _hoisted_62 = {
  key: 1,
  class: "manage-course-error"
};
const _hoisted_63 = {
  key: 2,
  class: "manage-course-empty"
};
const _hoisted_64 = {
  key: 3,
  class: "manage-course-groups"
};
const _hoisted_65 = ["onClick"];
const _hoisted_66 = { class: "manage-course-group-title" };
const _hoisted_67 = { class: "manage-course-group-arrow" };
const _hoisted_68 = {
  key: 0,
  class: "manage-course-list"
};
const _hoisted_69 = { class: "manage-course-card-main" };
const _hoisted_70 = { class: "manage-course-card-name" };
const _hoisted_71 = { class: "manage-course-card-meta" };
const _hoisted_72 = { class: "manage-course-card-meta" };
const _hoisted_73 = {
  key: 0,
  class: "manage-course-card-meta"
};
const _hoisted_74 = { class: "manage-course-card-actions" };
const _hoisted_75 = ["onClick"];
const _hoisted_76 = ["onClick"];
const _hoisted_77 = { class: "week-picker-sheet" };
const _hoisted_78 = { class: "week-picker-grid" };
const _hoisted_79 = ["onClick"];
const _hoisted_80 = { class: "date-header" };
const _hoisted_81 = { class: "month-col" };
const _hoisted_82 = { class: "month-num" };
const _hoisted_83 = { class: "days-row" };
const _hoisted_84 = { class: "day-num" };
const _hoisted_85 = { class: "day-label" };
const _hoisted_86 = { class: "grid-body" };
const _hoisted_87 = { class: "time-axis" };
const _hoisted_88 = { class: "time-start" };
const _hoisted_89 = { class: "period-num" };
const _hoisted_90 = { class: "time-end" };
const _hoisted_91 = { class: "grid-lines" };
const _hoisted_92 = ["onClick"];
const _hoisted_93 = { class: "course-name" };
const _hoisted_94 = { class: "course-room" };
const _hoisted_95 = {
  key: 0,
  class: "course-teacher"
};
const _hoisted_96 = { class: "modal-header" };
const _hoisted_97 = {
  key: 0,
  class: "modal-body"
};
const _hoisted_98 = ["onClick"];
const _hoisted_99 = { class: "conflict-item-title" };
const _hoisted_100 = {
  key: 0,
  class: "conflict-tag"
};
const _hoisted_101 = { class: "conflict-item-row" };
const _hoisted_102 = { class: "conflict-item-row" };
const _hoisted_103 = { class: "conflict-item-row" };
const _hoisted_104 = {
  key: 1,
  class: "modal-body"
};
const _hoisted_105 = {
  key: 0,
  class: "info-row"
};
const _hoisted_106 = { class: "info-row" };
const _hoisted_107 = { class: "value" };
const _hoisted_108 = { class: "info-row" };
const _hoisted_109 = { class: "value" };
const _hoisted_110 = { class: "info-row" };
const _hoisted_111 = { class: "value" };
const _hoisted_112 = { class: "info-row" };
const _hoisted_113 = { class: "value" };
const _hoisted_114 = { class: "info-row" };
const _hoisted_115 = { class: "value" };
const _hoisted_116 = { class: "info-row" };
const _hoisted_117 = { class: "value" };
const _hoisted_118 = {
  key: 1,
  class: "custom-course-actions"
};
const _hoisted_119 = { class: "detail-copy-actions" };
const _hoisted_120 = {
  key: 2,
  class: "detail-action-error"
};
const _hoisted_121 = { class: "confirm-title" };
const _hoisted_122 = { class: "confirm-lines" };
const _hoisted_123 = { class: "confirm-actions" };
const LOGIN_SESSION_TOKEN_KEY = "hbu_login_session_token";
const MAX_PERIOD = 11;
const _sfc_main = {
  __name: "ScheduleView",
  props: {
    studentId: { type: String, default: "" },
    widgetDate: { type: String, default: "" },
    widgetPeriod: { type: Number, default: 0 }
  },
  emits: ["back", "logout", "widget-deeplink-consumed"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const API_BASE = "/api";
    const loading = ref(false);
    const scheduleData = ref([]);
    const remoteScheduleData = ref([]);
    const customScheduleData = ref([]);
    const currentWeek = ref(0);
    const selectedWeek = ref(0);
    const semester = ref("");
    const totalWeeks = ref(25);
    const startDateStr = ref("");
    const errorMsg = ref("");
    const showDetail = ref(false);
    const selectedCourse = ref(null);
    const offline = ref(false);
    const offlineHint = ref("");
    const syncTime = ref("");
    const initialFetchDone = ref(false);
    const vacationNotice = ref("");
    const showMenu = ref(false);
    const exporting = ref(false);
    const exportingMode = ref("");
    const exportUrl = ref("");
    const exportError = ref("");
    const exportCopied = ref(false);
    const semesterOptions = ref([]);
    const semesterLoading = ref(false);
    const semesterDraft = ref("");
    const semesterError = ref("");
    const showSemesterPopup = ref(false);
    const semesterPopupText = ref("");
    const showSemesterBadgePopover = ref(false);
    const showAddCourse = ref(false);
    const courseDialogMode = ref("add");
    const editingCourseId = ref("");
    const editingCourseSemester = ref("");
    const showWeekPicker = ref(false);
    const addingCourse = ref(false);
    const addCourseError = ref("");
    const detailActionError = ref("");
    const showManageCourses = ref(false);
    const loadingManageCourses = ref(false);
    const manageCoursesError = ref("");
    const allCustomCourses = ref([]);
    const manageExpandedSemesters = ref({});
    const returnToManageAfterCourseSubmit = ref(false);
    const showConfirmDialog = ref(false);
    const confirmDialogTitle = ref("");
    const confirmDialogLines = ref([]);
    const confirmDialogConfirmText = ref("确认");
    const confirmDialogCancelText = ref("取消");
    const confirmDialogDanger = ref(false);
    const weekTransitionName = ref("week-slide-left");
    const syncUploading = ref(false);
    const syncDownloading = ref(false);
    const customCourseExporting = ref(false);
    const customCourseImporting = ref(false);
    const customCourseExportLocation = ref("");
    const syncUploadCooldownMs = ref(0);
    const syncDownloadCooldownMs = ref(0);
    const syncStatusText = ref("");
    const customCourseFileInput = ref(null);
    const uiSettings = useUiSettings();
    const courseCardRefreshNonce = ref(0);
    let confirmDialogResolver = null;
    let syncCooldownTimer = null;
    const addCourseForm = ref({
      name: "",
      teacher: "",
      room: "",
      weekday: 1,
      period: 1,
      djs: 1,
      weeks: [],
      /** 用户设定主色 hex；空字符串表示未设定（#469 本地表单态，#470 再持久化） */
      color: DEFAULT_COURSE_COLOR
    });
    const returnToDetailAfterCourseSubmit = ref(false);
    const widgetHighlightPeriod = ref(0);
    const widgetHighlightDay = ref(0);
    let widgetHighlightTimer = null;
    const courseDialogSemester = computed(() => {
      if (courseDialogMode.value === "edit") {
        return String(editingCourseSemester.value || semester.value || semesterDraft.value || "").trim();
      }
      return String(semester.value || semesterDraft.value || "").trim();
    });
    const readStoredSemester = () => {
      try {
        const raw = localStorage.getItem("hbu_schedule_meta");
        if (!raw) return "";
        const parsed = JSON.parse(raw);
        return String(parsed?.semester || "").trim();
      } catch {
        return "";
      }
    };
    const resolveDisplayStudentId = () => {
      const sid = String(props.studentId || "").trim();
      if (sid) return sid;
      if (localStorage.getItem("hbu_manual_logout") === "true") return "";
      const fallback = String(localStorage.getItem("hbu_username") || "").trim();
      return /^\d{10}$/.test(fallback) ? fallback : "";
    };
    const deriveSemesterByDate = (date = /* @__PURE__ */ new Date()) => {
      const year = Number(date.getFullYear());
      const month = Number(date.getMonth()) + 1;
      const day = Number(date.getDate());
      let academicYearStart = year - 1;
      let term = 1;
      if (month >= 9) {
        academicYearStart = year;
        term = 1;
      } else if (month >= 3) {
        academicYearStart = year - 1;
        term = 2;
      } else if (month === 2 && day >= 15) {
        academicYearStart = year - 1;
        term = 2;
      } else {
        academicYearStart = year - 1;
        term = 1;
      }
      return `${academicYearStart}-${academicYearStart + 1}-${term}`;
    };
    const storedSemester = readStoredSemester();
    if (storedSemester) {
      semester.value = storedSemester;
      semesterDraft.value = storedSemester;
    }
    const buildPopupShownKey = () => {
      const sid = String(props.studentId || "").trim();
      const sessionToken = String(localStorage.getItem(LOGIN_SESSION_TOKEN_KEY) || "").trim();
      if (!sid || !sessionToken) return "";
      return `hbu_schedule_popup_shown:${sid}:${sessionToken}`;
    };
    const markPopupShown = () => {
      const key = buildPopupShownKey();
      if (!key) return;
      localStorage.setItem(key, "1");
    };
    const isPopupShown = () => {
      const key = buildPopupShownKey();
      if (!key) return true;
      return localStorage.getItem(key) === "1";
    };
    const openSemesterPopup = (targetSemester = "") => {
      const sem = String(targetSemester || semester.value || semesterDraft.value || "").trim();
      if (!sem) return;
      semesterPopupText.value = sem;
      showSemesterPopup.value = true;
      markPopupShown();
    };
    const closeSemesterBadgePopover = (e) => {
      if (showSemesterBadgePopover.value && !e.target.closest(".semester-badge-wrap")) {
        showSemesterBadgePopover.value = false;
      }
    };
    const consumePendingSemesterPopup = () => {
      try {
        const raw = localStorage.getItem(SCHEDULE_POPUP_PENDING_KEY);
        if (!raw) return "";
        const parsed = JSON.parse(raw);
        const targetSid = String(parsed?.student_id || "").trim();
        const sem = String(parsed?.semester || "").trim();
        if (targetSid && targetSid !== String(props.studentId || "").trim()) {
          return "";
        }
        localStorage.removeItem(SCHEDULE_POPUP_PENDING_KEY);
        return sem;
      } catch {
        localStorage.removeItem(SCHEDULE_POPUP_PENDING_KEY);
        return "";
      }
    };
    const weekDays = ["1 周一", "2 周二", "3 周三", "4 周四", "5 周五", "6 周六", "7 周日"];
    const weekDayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    const periodOptions = Array.from({ length: 11 }, (_, i) => i + 1);
    const courseCardStyleOptions = [
      { key: "modern", label: "现代" },
      { key: "traditional", label: "传统" },
      { key: "class", label: "标准" }
    ];
    const timeSchedule = [
      { p: 1, start: "08:20", end: "09:05" },
      { p: 2, start: "09:10", end: "09:55" },
      { p: 3, start: "10:15", end: "11:00" },
      { p: 4, start: "11:05", end: "11:50" },
      { p: 5, start: "14:00", end: "14:45" },
      { p: 6, start: "14:50", end: "15:35" },
      { p: 7, start: "15:55", end: "16:40" },
      { p: 8, start: "16:45", end: "17:30" },
      { p: 9, start: "18:30", end: "19:15" },
      { p: 10, start: "19:20", end: "20:05" },
      { p: 11, start: "20:10", end: "20:55" }
    ];
    const courseThemes = [
      { bg: "#e7f4ff", text: "#0f5da8", border: "#72b9ff" },
      // 湖蓝
      { bg: "#fff0e8", text: "#cb4f2f", border: "#ffb390" },
      // 珊瑚橘
      { bg: "#efe9ff", text: "#5f52cf", border: "#b8aaff" },
      // 紫藤
      { bg: "#fff4db", text: "#be7a07", border: "#efc465" },
      // 琥珀
      { bg: "#ffeaf2", text: "#c33f73", border: "#f3a8c4" },
      // 玫瑰
      { bg: "#e8faf5", text: "#117f67", border: "#8adcc4" },
      // 青绿
      { bg: "#e8efff", text: "#335ccb", border: "#9eb4ff" },
      // 靛蓝
      { bg: "#fff1f5", text: "#b63f58", border: "#f0acbb" },
      // 浅莓
      { bg: "#edf8ef", text: "#2f8c3d", border: "#9dd7a7" },
      // 春绿
      { bg: "#e8f9ff", text: "#007893", border: "#84d6ec" },
      // 青空
      { bg: "#f4edff", text: "#7548c1", border: "#c6adf1" },
      // 兰紫
      { bg: "#fff2e2", text: "#b05c16", border: "#efb67f" }
      // 暖杏
    ];
    const weekDates = computed(() => {
      if (!startDateStr.value) return [];
      const start = new Date(startDateStr.value);
      const daysToAdd = (selectedWeek.value - 1) * 7;
      start.setDate(start.getDate() + daysToAdd);
      const dates = [];
      const today = /* @__PURE__ */ new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        dates.push({
          year: yyyy,
          month: d.getMonth() + 1,
          date: d.getDate(),
          iso: `${yyyy}-${mm}-${dd}`,
          dayLabel: weekDays[i],
          isToday: d.toDateString() === today.toDateString()
        });
      }
      return dates;
    });
    const currentMonth = computed(() => {
      if (weekDates.value.length > 0) return weekDates.value[0].month;
      return (/* @__PURE__ */ new Date()).getMonth() + 1;
    });
    const isTodayColumn = (dayIndex) => {
      const idx = Number(dayIndex) - 1;
      if (idx < 0 || idx > 6) return false;
      return !!weekDates.value[idx]?.isToday;
    };
    const semesterWeekOptions = computed(() => {
      const count = Number(totalWeeks.value);
      const safeCount = Number.isFinite(count) && count > 0 ? count : 25;
      return Array.from({ length: safeCount }, (_, i) => i + 1);
    });
    const courseSpanOptions = computed(() => {
      const start = Number(addCourseForm.value.period) || 1;
      const maxSpan = Math.max(1, 12 - start);
      return Array.from({ length: maxSpan }, (_, i) => i + 1);
    });
    const addWeeksCountText = computed(() => {
      const weeks = Array.isArray(addCourseForm.value.weeks) ? addCourseForm.value.weeks.length : 0;
      return weeks > 0 ? `已选 ${weeks} 周` : "未选择周次";
    });
    const normalizeCourseCardStyle = (value) => {
      const key = String(value || "").trim().toLowerCase();
      return ["modern", "traditional", "class"].includes(key) ? key : "modern";
    };
    const scheduleCourseCardStyle = ref(normalizeCourseCardStyle(uiSettings.scheduleCourseCardStyle));
    const formatCooldownText = (value) => {
      const ms = Number(value || 0);
      if (ms <= 0) return "可立即同步";
      const sec = Math.ceil(ms / 1e3);
      if (sec < 60) return `${sec} 秒后可再次同步`;
      const min = Math.floor(sec / 60);
      const remain = sec % 60;
      return remain > 0 ? `${min}分${remain}秒后可再次同步` : `${min} 分钟后可再次同步`;
    };
    const syncUploadCooldownText = computed(() => formatCooldownText(syncUploadCooldownMs.value));
    const syncDownloadCooldownText = computed(() => formatCooldownText(syncDownloadCooldownMs.value));
    const offlineBannerText = computed(() => {
      if (offlineHint.value) return offlineHint.value;
      if (syncTime.value) {
        return `当前显示为离线数据，更新于${formatRelativeTime(syncTime.value)}`;
      }
      return "当前显示为离线数据";
    });
    const openConfirmDialog = ({
      title = "请确认",
      lines = [],
      confirmText = "确认",
      cancelText = "取消",
      danger = false
    } = {}) => {
      confirmDialogTitle.value = String(title || "请确认");
      confirmDialogLines.value = Array.isArray(lines) ? lines.map((line) => String(line || "").trim()).filter(Boolean) : [];
      confirmDialogConfirmText.value = String(confirmText || "确认");
      confirmDialogCancelText.value = String(cancelText || "取消");
      confirmDialogDanger.value = !!danger;
      showConfirmDialog.value = true;
    };
    const closeConfirmDialog = (result = false) => {
      showConfirmDialog.value = false;
      const resolver = confirmDialogResolver;
      confirmDialogResolver = null;
      if (resolver) {
        resolver(!!result);
      }
    };
    const askConfirm = (options = {}) => {
      if (confirmDialogResolver) {
        confirmDialogResolver(false);
        confirmDialogResolver = null;
      }
      openConfirmDialog(options);
      return new Promise((resolve) => {
        confirmDialogResolver = resolve;
      });
    };
    const normalizeWeeks = (weeks) => {
      if (!Array.isArray(weeks)) return [];
      const normalized = weeks.map((w) => Number(w)).filter((w) => Number.isFinite(w) && w > 0);
      return Array.from(new Set(normalized)).sort((a, b) => a - b);
    };
    const formatWeeksText = (weeks) => {
      const values = normalizeWeeks(weeks);
      if (!values.length) return "";
      const ranges = [];
      let start = values[0];
      let prev = values[0];
      for (let i = 1; i < values.length; i += 1) {
        const current = values[i];
        if (current === prev + 1) {
          prev = current;
          continue;
        }
        ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = current;
        prev = current;
      }
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      return ranges.join(",");
    };
    const mergeScheduleSources = () => {
      const merged = [...remoteScheduleData.value, ...customScheduleData.value];
      scheduleData.value = processScheduleData(merged);
    };
    const normalizeCustomCourse = (raw) => {
      if (!raw || typeof raw !== "object") return null;
      const weeks = normalizeWeeks(raw.weeks);
      const colorNorm = normalizeOptionalCourseColor(raw.color);
      return {
        id: String(raw.id || raw.source_id || ""),
        name: String(raw.name || "").trim(),
        teacher: String(raw.teacher || "").trim(),
        room: String(raw.room || raw.room_code || "").trim(),
        room_code: String(raw.room_code || raw.room || "").trim(),
        building: String(raw.building || "自定义").trim(),
        weekday: Number(raw.weekday || 1),
        period: Number(raw.period || 1),
        djs: Number(raw.djs || 1),
        weeks,
        weeks_text: String(raw.weeks_text || formatWeeksText(weeks)),
        credit: String(raw.credit || ""),
        class_name: String(raw.class_name || "自定义课程"),
        semester: String(raw.semester || semester.value || semesterDraft.value || ""),
        source_id: String(raw.source_id || raw.id || ""),
        created_at: String(raw.created_at || ""),
        updated_at: String(raw.updated_at || ""),
        // 可选用户色；#469 本地表单用，#470 持久化后由后端下发
        color: colorNorm === null ? DEFAULT_COURSE_COLOR : colorNorm,
        is_custom: true
      };
    };
    const loadCustomCourses = async (targetSemester = "") => {
      const sid = String(props.studentId || "").trim();
      const sem = String(targetSemester || semester.value || semesterDraft.value || "").trim();
      if (!sid || !sem) {
        customScheduleData.value = [];
        mergeScheduleSources();
        return false;
      }
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/list`, {
          student_id: sid,
          semester: sem
        });
        if (!res.data?.success) {
          throw new Error(res.data?.error || "加载自定义课程失败");
        }
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        customScheduleData.value = list.map(normalizeCustomCourse).filter(Boolean).filter((course) => course.name && course.weekday >= 1 && course.weekday <= 7 && course.period >= 1 && course.period <= 11);
        mergeScheduleSources();
        persistScheduleRenderSnapshot("custom-load");
        return true;
      } catch (e) {
        console.warn("加载自定义课程失败", e);
        customScheduleData.value = [];
        mergeScheduleSources();
        return false;
      }
    };
    const sortSemesterKeys = (a, b) => {
      const currentSemester = String(semester.value || semesterDraft.value || "").trim();
      if (a === currentSemester && b !== currentSemester) return -1;
      if (b === currentSemester && a !== currentSemester) return 1;
      return String(b).localeCompare(String(a), "zh-CN", { numeric: true });
    };
    const managedCourseGroups = computed(() => {
      const groups = /* @__PURE__ */ new Map();
      for (const rawCourse of allCustomCourses.value || []) {
        const course = normalizeCustomCourse(rawCourse);
        if (!course?.id) continue;
        const sem = String(course.semester || "未分配学期").trim() || "未分配学期";
        if (!groups.has(sem)) {
          groups.set(sem, []);
        }
        groups.get(sem).push(course);
      }
      return Array.from(groups.entries()).sort((a, b) => sortSemesterKeys(a[0], b[0])).map(([semesterKey, courses]) => ({
        semester: semesterKey,
        courses: courses.sort((a, b) => {
          if (a.weekday !== b.weekday) return a.weekday - b.weekday;
          if (a.period !== b.period) return a.period - b.period;
          return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN");
        })
      }));
    });
    const syncManageExpandedSemesters = () => {
      const next = {};
      const currentSemester = String(semester.value || semesterDraft.value || "").trim();
      for (const group of managedCourseGroups.value) {
        next[group.semester] = manageExpandedSemesters.value[group.semester] ?? group.semester === currentSemester;
      }
      manageExpandedSemesters.value = next;
    };
    const loadAllCustomCourses = async () => {
      const sid = String(props.studentId || "").trim();
      if (!sid) {
        allCustomCourses.value = [];
        manageCoursesError.value = "请先登录后再管理课程";
        return false;
      }
      loadingManageCourses.value = true;
      manageCoursesError.value = "";
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/list_all`, {
          student_id: sid
        });
        if (!res.data?.success) {
          throw new Error(res.data?.error || "加载课程列表失败");
        }
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        allCustomCourses.value = list.map(normalizeCustomCourse).filter(Boolean).filter((course) => course.name && course.weekday >= 1 && course.weekday <= 7 && course.period >= 1 && course.period <= 11);
        syncManageExpandedSemesters();
        return true;
      } catch (e) {
        console.warn("加载全部自定义课程失败", e);
        allCustomCourses.value = [];
        manageCoursesError.value = String(e?.response?.data?.error || e?.message || "加载课程列表失败");
        return false;
      } finally {
        loadingManageCourses.value = false;
      }
    };
    const buildScheduleRenderSnapshotPayload = () => {
      const sid = resolveDisplayStudentId();
      const sem = String(semester.value || semesterDraft.value || "").trim();
      if (!sid || !sem) return null;
      return {
        student_id: sid,
        semester: sem,
        meta: {
          semester: sem,
          start_date: String(startDateStr.value || "").trim(),
          current_week: Number(currentWeek.value || 1),
          total_weeks: Number(totalWeeks.value || 25),
          vacation_notice: String(vacationNotice.value || "").trim()
        },
        selected_week: Number(selectedWeek.value || currentWeek.value || 1),
        sync_time: String(syncTime.value || "").trim(),
        offline: !!offline.value,
        remote_schedule_data: Array.isArray(remoteScheduleData.value) ? remoteScheduleData.value : [],
        custom_schedule_data: Array.isArray(customScheduleData.value) ? customScheduleData.value : [],
        merged_schedule_data: Array.isArray(scheduleData.value) ? scheduleData.value : [],
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
    };
    const persistScheduleRenderSnapshot = (reason = "unknown") => {
      const payload = buildScheduleRenderSnapshotPayload();
      if (!payload) return false;
      const courseCount = Array.isArray(payload.merged_schedule_data) ? payload.merged_schedule_data.length : 0;
      const hasRenderableData = courseCount > 0 || Array.isArray(payload.remote_schedule_data) && payload.remote_schedule_data.length > 0 || Array.isArray(payload.custom_schedule_data) && payload.custom_schedule_data.length > 0;
      if (!hasRenderableData) return false;
      const saved = writeScheduleRenderSnapshot(payload.student_id, payload);
      if (!saved) return false;
      pushDebugLog(
        "Schedule",
        `课表首屏快照已写入 reason=${reason} semester=${saved.semester} courses=${courseCount}`,
        "debug"
      );
      return true;
    };
    const applyScheduleRenderSnapshot = (snapshot, options = {}) => {
      const saved = snapshot && typeof snapshot === "object" ? snapshot : null;
      if (!saved) return false;
      const resolvedSemester = String(saved.semester || saved.meta?.semester || "").trim();
      if (!resolvedSemester) return false;
      semester.value = resolvedSemester;
      semesterDraft.value = resolvedSemester;
      remoteScheduleData.value = Array.isArray(saved.remote_schedule_data) ? saved.remote_schedule_data : [];
      customScheduleData.value = Array.isArray(saved.custom_schedule_data) ? saved.custom_schedule_data : [];
      scheduleData.value = Array.isArray(saved.merged_schedule_data) && saved.merged_schedule_data.length ? saved.merged_schedule_data : processScheduleData([...remoteScheduleData.value, ...customScheduleData.value]);
      applyMeta(saved.meta, resolvedSemester);
      const nextWeek = Number(saved.selected_week || currentWeek.value || 1);
      const safeWeek = Math.min(Math.max(nextWeek, 1), Math.max(Number(totalWeeks.value || 1), 1));
      selectedWeek.value = safeWeek;
      syncTime.value = String(saved.sync_time || "").trim();
      const markOffline = options?.markOffline === true;
      offline.value = markOffline;
      offlineHint.value = markOffline ? String(
        options?.offlineHint || "当前为缓存课表，登录恢复后自动刷新。"
      ).trim() : "";
      errorMsg.value = scheduleData.value.length ? "" : "暂无可用课表";
      initialFetchDone.value = true;
      if (options?.markBoot !== false) {
        markBootMetric("schedule_snapshot_applied", {
          semester: resolvedSemester,
          courses: scheduleData.value.length,
          updated_at: saved.updated_at || ""
        });
        requestAnimationFrame(() => {
          markBootMetric("schedule_first_paint", {
            semester: resolvedSemester,
            courses: scheduleData.value.length
          });
        });
      }
      return true;
    };
    const applyMeta = (meta, requestedSemester = "") => {
      const safeMeta = meta && typeof meta === "object" ? meta : {};
      const resolvedSemester = String(safeMeta.semester || requestedSemester || semester.value || "").trim();
      if (resolvedSemester) {
        semester.value = resolvedSemester;
        semesterDraft.value = resolvedSemester;
      }
      startDateStr.value = String(safeMeta.start_date || "").trim();
      vacationNotice.value = String(safeMeta.vacation_notice || "").trim();
      const parsedWeeks = Number(safeMeta.total_weeks || 0);
      totalWeeks.value = Number.isFinite(parsedWeeks) && parsedWeeks > 0 ? parsedWeeks : 25;
      const parsedCurrentWeek = Number(safeMeta.current_week || 0);
      const safeWeek = Number.isFinite(parsedCurrentWeek) && parsedCurrentWeek > 0 ? Math.min(parsedCurrentWeek, totalWeeks.value) : 1;
      currentWeek.value = safeWeek;
      selectedWeek.value = safeWeek;
      if (!isTestAccountSession()) {
        localStorage.setItem("hbu_schedule_meta", JSON.stringify({
          semester: resolvedSemester,
          start_date: startDateStr.value,
          current_week: currentWeek.value,
          total_weeks: totalWeeks.value,
          vacation_notice: vacationNotice.value
        }));
      }
    };
    const applySchedulePayload = (payload, requestedSemester = "", options = {}) => {
      if (!payload?.success) return false;
      const rawData = Array.isArray(payload?.data) ? payload.data : [];
      const silentCachePaint = options?.silentCachePaint === true;
      const forceOfflineBanner = options?.forceOfflineBanner === true;
      const loggedIn = !!String(props.studentId || "").trim();
      if (forceOfflineBanner || payload.offline && !silentCachePaint && !loggedIn) {
        offline.value = true;
        offlineHint.value = String(
          options?.offlineHint || (loggedIn ? "当前显示为缓存课表，教务暂不可用。" : "当前显示为离线数据，登录恢复后自动刷新。")
        ).trim();
      } else {
        offline.value = false;
        offlineHint.value = "";
      }
      syncTime.value = payload.sync_time || "";
      remoteScheduleData.value = processScheduleData(rawData);
      mergeScheduleSources();
      applyMeta(payload.meta, requestedSemester);
      errorMsg.value = rawData.length === 0 ? "暂无可用课表" : "";
      return true;
    };
    const applyCachedScheduleImmediately = (targetSemester = "", options = {}) => {
      const sem = String(targetSemester || semester.value || semesterDraft.value || "").trim();
      const sid = resolveDisplayStudentId();
      if (!sid || !sem) return false;
      const snapshot = getCachedScheduleSnapshot(sid, sem);
      if (!snapshot?.data?.success) return false;
      const silent = options?.silentCachePaint !== false && String(props.studentId || sid || "").trim();
      const applied = applySchedulePayload(snapshot.data, sem, {
        silentCachePaint: !!silent
      });
      if (applied && silent) {
        offline.value = false;
        offlineHint.value = "";
      }
      if (applied && !syncTime.value && snapshot.timestamp) {
        syncTime.value = new Date(snapshot.timestamp).toISOString();
      }
      return applied;
    };
    let onlineRevalidateToken = 0;
    const revalidateScheduleOnline = async (targetSemester = "") => {
      const sid = String(props.studentId || "").trim();
      const sem = String(targetSemester || semester.value || semesterDraft.value || "").trim();
      if (!sid) return false;
      const token = ++onlineRevalidateToken;
      const cacheKey = sem ? `schedule:${sid}:${sem}` : `schedule:${sid}`;
      try {
        const { data } = await fetchWithCache(
          cacheKey,
          async () => {
            const res = await axiosInstance.post(`${API_BASE}/v2/schedule/query`, {
              student_id: sid,
              semester: sem || void 0
            });
            return res.data;
          },
          void 0,
          { forceRemote: true, priority: "background", staleWhileRevalidate: false }
        );
        if (token !== onlineRevalidateToken) return false;
        if (data?.success && !data?.offline) {
          applySchedulePayload(data, sem, { silentCachePaint: false });
          offline.value = false;
          offlineHint.value = "";
          persistScheduleRenderSnapshot("online-revalidate");
          return true;
        }
        if (data?.need_login && (remoteScheduleData.value.length || customScheduleData.value.length)) {
          offline.value = true;
          offlineHint.value = "当前为缓存课表，登录恢复后自动刷新。";
        }
        return false;
      } catch {
        if (token !== onlineRevalidateToken) return false;
        return false;
      }
    };
    const applyStoredScheduleRenderSnapshot = (targetSemester = "", options = {}) => {
      const sid = resolveDisplayStudentId();
      const sem = String(targetSemester || semester.value || semesterDraft.value || "").trim();
      if (!sid) return false;
      const snapshot = readScheduleRenderSnapshot(sid, sem || "");
      if (!snapshot) return false;
      return applyScheduleRenderSnapshot(snapshot, options);
    };
    const initialRenderSnapshotApplied = applyStoredScheduleRenderSnapshot("", {
      markBoot: true
    });
    const fetchSchedule = async (targetSemester = "", options = {}) => {
      loading.value = true;
      semesterError.value = "";
      const persistLock = options?.persistLock === true;
      const lockReason = String(options?.lockReason || "schedule-fetch").trim() || "schedule-fetch";
      const requestedSemester = String(targetSemester || semester.value || semesterDraft.value || "").trim();
      const previousSemester = String(semester.value || "").trim();
      errorMsg.value = "";
      if (String(props.studentId || "").trim() && options?.preserveOfflineBanner !== true) {
        offline.value = false;
        offlineHint.value = "";
      }
      try {
        if (requestedSemester && requestedSemester !== previousSemester) {
          customScheduleData.value = [];
          mergeScheduleSources();
        }
        if (requestedSemester) {
          semester.value = requestedSemester;
        }
        if (!props.studentId) {
          const fallbackSemester = String(requestedSemester || semester.value || semesterDraft.value || readStoredSemester() || deriveSemesterByDate()).trim();
          const hasRenderSnapshot = fallbackSemester ? applyStoredScheduleRenderSnapshot(fallbackSemester, { markBoot: false }) : false;
          const hasInstantCache = hasRenderSnapshot || (fallbackSemester ? applyCachedScheduleImmediately(fallbackSemester) : false);
          if (hasInstantCache) {
            initialFetchDone.value = true;
            errorMsg.value = "";
          } else if (localStorage.getItem("hbu_manual_logout") === "true") {
            scheduleData.value = [];
            remoteScheduleData.value = [];
            customScheduleData.value = [];
            offline.value = false;
            offlineHint.value = "";
            initialFetchDone.value = true;
            errorMsg.value = "请先登录后查看课表";
          } else {
            errorMsg.value = "";
          }
          return false;
        }
        const cacheKey = requestedSemester ? `schedule:${props.studentId}:${requestedSemester}` : `schedule:${props.studentId}`;
        const { data, fromCache, stale } = await fetchWithCache(cacheKey, async () => {
          const res = await axiosInstance.post(`${API_BASE}/v2/schedule/query`, {
            student_id: props.studentId,
            semester: requestedSemester || void 0
          });
          return res.data;
        }, void 0, DEFAULT_SWR_OPTIONS);
        if (data?.success) {
          const treatAsSilentCache = !!String(props.studentId || "").trim() && (!!fromCache || !!data?.offline || !!stale);
          applySchedulePayload(data, requestedSemester, {
            silentCachePaint: treatAsSilentCache
          });
          if (treatAsSilentCache && data?.offline) {
            void revalidateScheduleOnline(requestedSemester || semester.value);
          }
          await loadCustomCourses(requestedSemester || semester.value);
          if (!remoteScheduleData.value.length && customScheduleData.value.length > 0) {
            errorMsg.value = "";
          }
          persistScheduleRenderSnapshot("fetch-success");
          if (props.studentId) {
            afterScheduleRefresh(props.studentId, data, { selectedWeek: selectedWeek.value || currentWeek.value || 1 }).catch(() => {
            });
          }
          if (!hasBootMetric("schedule_first_paint")) {
            requestAnimationFrame(() => {
              markBootMetric("schedule_first_paint", {
                semester: String(requestedSemester || semester.value || "").trim(),
                courses: scheduleData.value.length,
                source: "remote-refresh"
              });
            });
          }
          if (requestedSemester && persistLock) {
            writeScheduleLock(props.studentId, requestedSemester, lockReason);
          }
          return true;
        } else {
          if (data?.need_login) {
            const method = String(localStorage.getItem("hbu_login_method") || "").trim();
            const isTemp = localStorage.getItem("hbu_login_temp") === "1" || method.endsWith("_temp");
            if (isTemp) {
              emit("logout");
              return false;
            }
            if (remoteScheduleData.value.length || customScheduleData.value.length) {
              offline.value = true;
              offlineHint.value = "当前为缓存课表，登录恢复后自动刷新。";
              errorMsg.value = "";
              return false;
            }
            const hasRenderSnapshot = requestedSemester ? applyStoredScheduleRenderSnapshot(requestedSemester, { markBoot: false }) : false;
            const hasCached = hasRenderSnapshot || (requestedSemester ? applyCachedScheduleImmediately(requestedSemester) : false);
            if (hasCached) {
              offline.value = true;
              offlineHint.value = "当前为缓存课表，登录恢复后自动刷新。";
              errorMsg.value = "";
              return false;
            }
            errorMsg.value = data?.error || "会话已过期，请重新登录";
            return false;
          }
          if (!(remoteScheduleData.value.length || customScheduleData.value.length)) {
            remoteScheduleData.value = [];
            mergeScheduleSources();
            offline.value = false;
            vacationNotice.value = "";
            startDateStr.value = "";
            currentWeek.value = 1;
            selectedWeek.value = 1;
            totalWeeks.value = 25;
          } else {
            offline.value = true;
            offlineHint.value = "当前为缓存课表，登录恢复后自动刷新。";
          }
          await loadCustomCourses(requestedSemester || semester.value);
          const message = String(data?.error || "获取课表失败");
          errorMsg.value = remoteScheduleData.value.length || customScheduleData.value.length ? "" : /无课表|暂无/.test(message) ? "暂无可用课表" : message;
          if (customScheduleData.value.length > 0) {
            errorMsg.value = "";
          }
          return false;
        }
      } catch (e) {
        console.error("获取课表异常", e);
        if (!(remoteScheduleData.value.length || customScheduleData.value.length)) {
          remoteScheduleData.value = [];
          mergeScheduleSources();
          offline.value = false;
          vacationNotice.value = "";
          startDateStr.value = "";
          currentWeek.value = 1;
          selectedWeek.value = 1;
          totalWeeks.value = 25;
        } else {
          offline.value = true;
          offlineHint.value = "当前为缓存课表，连接恢复后自动刷新。";
        }
        await loadCustomCourses(requestedSemester || semester.value);
        const message = String(e?.message || "获取课表失败");
        errorMsg.value = remoteScheduleData.value.length || customScheduleData.value.length ? "" : /无课表|暂无/.test(message) ? "暂无可用课表" : message;
        if (customScheduleData.value.length > 0) {
          errorMsg.value = "";
        }
        return false;
      } finally {
        loading.value = false;
        initialFetchDone.value = true;
        if (!hasBootMetric("schedule_snapshot_applied")) {
          markBootMetric("schedule_snapshot_applied", {
            semester: String(requestedSemester || semester.value || "").trim(),
            courses: scheduleData.value.length,
            applied: false,
            reason: "snapshot-missing"
          });
        }
        markBootMetric("schedule_remote_refresh_finished", {
          semester: String(requestedSemester || semester.value || "").trim(),
          courses: scheduleData.value.length,
          offline: !!offline.value
        });
      }
    };
    const fetchSemesterOptions = async () => {
      semesterLoading.value = true;
      semesterError.value = "";
      try {
        const { data } = await fetchWithCache("semesters", async () => {
          const res = await axiosInstance.get(`${API_BASE}/v2/semesters`);
          return res.data;
        }, EXTRA_LONG_TTL, DEFAULT_SWR_OPTIONS);
        if (!data?.success) {
          throw new Error(data?.error || "获取学期列表失败");
        }
        const list = normalizeSemesterList(data?.semesters || []);
        semesterOptions.value = list;
        const resolved = resolveCurrentSemester(list, semester.value || data?.current);
        if (resolved) {
          semesterDraft.value = resolved;
          if (!semester.value) semester.value = resolved;
        }
      } catch (e) {
        semesterError.value = e?.message || "获取学期列表失败";
      } finally {
        semesterLoading.value = false;
      }
    };
    const applySemesterQuery = async () => {
      const selected = String(semesterDraft.value || "").trim();
      if (!selected) {
        semesterError.value = "请选择学期";
        return;
      }
      currentWeek.value = 1;
      selectedWeek.value = 1;
      totalWeeks.value = 25;
      startDateStr.value = "";
      vacationNotice.value = "";
      await fetchSchedule(selected, { persistLock: true, lockReason: "manual-select" });
    };
    const onSemesterChange = async () => {
      const selected = String(semesterDraft.value || "").trim();
      if (!selected || selected === semester.value) return;
      await applySemesterQuery();
    };
    watch(selectedWeek, (next, prev) => {
      const current = Number(next || 0);
      const previous = Number(prev || 0);
      const maxWeeks = Math.max(1, Number(totalWeeks.value || 1));
      if (!Number.isFinite(current) || current <= 0) {
        selectedWeek.value = 1;
        return;
      }
      if (current > maxWeeks) {
        selectedWeek.value = maxWeeks;
        return;
      }
      if (previous > 0 && current !== previous) {
        weekTransitionName.value = current > previous ? "week-slide-left" : "week-slide-right";
      }
    });
    watch(totalWeeks, (maxWeeks) => {
      if (!Number.isFinite(maxWeeks) || maxWeeks <= 0) return;
      if (selectedWeek.value > maxWeeks) {
        selectedWeek.value = maxWeeks;
      }
      if (currentWeek.value > maxWeeks) {
        currentWeek.value = maxWeeks;
      }
    });
    watch(selectedWeek, (next, prev) => {
      if (next === prev) return;
      if (!initialFetchDone.value) return;
      persistScheduleRenderSnapshot("selected-week");
    });
    watch(
      () => props.studentId,
      async (nextSid, prevSid) => {
        refreshCloudSyncCooldown();
        const next = String(nextSid || "").trim();
        const prev = String(prevSid || "").trim();
        if (!next || next === prev) return;
        const targetSemester = String(semester.value || semesterDraft.value || readStoredSemester() || deriveSemesterByDate()).trim();
        if (targetSemester) {
          const hasRenderSnapshot = applyStoredScheduleRenderSnapshot(targetSemester, { markBoot: false });
          const hasInstantCache = hasRenderSnapshot || applyCachedScheduleImmediately(targetSemester);
          if (hasInstantCache) {
            initialFetchDone.value = true;
            errorMsg.value = "";
          }
        }
        void fetchSchedule(targetSemester);
      }
    );
    watch(
      () => uiSettings.scheduleCourseCardStyle,
      (value) => {
        scheduleCourseCardStyle.value = normalizeCourseCardStyle(value);
        pushDebugLog("Schedule", `课表样式状态同步：${scheduleCourseCardStyle.value}`, "debug");
      },
      { immediate: true }
    );
    watch(
      () => props.widgetDate,
      (dateStr) => {
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
        if (!startDateStr.value) return;
        const targetDate = /* @__PURE__ */ new Date(dateStr + "T00:00:00+08:00");
        const startDate = /* @__PURE__ */ new Date(startDateStr.value + "T00:00:00+08:00");
        if (isNaN(targetDate.getTime()) || isNaN(startDate.getTime())) return;
        const diffMs = targetDate.getTime() - startDate.getTime();
        const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1e3));
        const targetWeek = Math.max(1, Math.floor(diffDays / 7) + 1);
        const targetDay = diffDays % 7 + 1;
        const maxWeeks = Math.max(1, Number(totalWeeks.value || 1));
        if (targetWeek >= 1 && targetWeek <= maxWeeks) {
          selectedWeek.value = targetWeek;
        }
        const period = Number(props.widgetPeriod) || 0;
        widgetHighlightDay.value = targetDay >= 1 && targetDay <= 7 ? targetDay : 0;
        widgetHighlightPeriod.value = period >= 1 && period <= 14 ? period : 0;
        nextTick(() => {
          scrollToWidgetTarget(targetDay, period);
        });
        if (widgetHighlightTimer) clearTimeout(widgetHighlightTimer);
        widgetHighlightTimer = setTimeout(() => {
          widgetHighlightPeriod.value = 0;
          widgetHighlightDay.value = 0;
          widgetHighlightTimer = null;
        }, 3e3);
        emit("widget-deeplink-consumed");
      },
      { immediate: true }
    );
    const scrollToWidgetTarget = (day, period) => {
      try {
        const gridBody = document.querySelector(".schedule-view .grid-body");
        if (!gridBody) return;
        if (period >= 1) {
          const timeSlots = gridBody.querySelectorAll(".time-axis .time-slot");
          const targetSlot = timeSlots[period - 1];
          if (targetSlot) {
            const offsetTop = targetSlot.offsetTop;
            gridBody.scrollTo({ top: Math.max(0, offsetTop - 20), behavior: "smooth" });
          }
        }
      } catch {
      }
    };
    watch(
      () => addCourseForm.value.period,
      (periodValue) => {
        const start = Number(periodValue) || 1;
        const maxSpan = Math.max(1, 12 - start);
        if (Number(addCourseForm.value.djs) > maxSpan) {
          addCourseForm.value.djs = maxSpan;
        }
        if (Number(addCourseForm.value.djs) < 1) {
          addCourseForm.value.djs = 1;
        }
      }
    );
    const processScheduleData = (courses) => {
      if (!courses || courses.length === 0) return [];
      courses.sort((a, b) => {
        if (a.weekday !== b.weekday) return a.weekday - b.weekday;
        return a.period - b.period;
      });
      return courses;
    };
    const hashText = (value) => {
      let hash = 0;
      const text = String(value || "");
      for (let i = 0; i < text.length; i += 1) {
        hash = text.charCodeAt(i) + ((hash << 5) - hash);
      }
      return Math.abs(hash);
    };
    const hexToRgb = (hex) => {
      const text = String(hex || "").trim().replace("#", "");
      if (!/^[0-9a-fA-F]{6}$/.test(text)) return null;
      return {
        r: Number.parseInt(text.slice(0, 2), 16),
        g: Number.parseInt(text.slice(2, 4), 16),
        b: Number.parseInt(text.slice(4, 6), 16)
      };
    };
    const colorDistance = (aHex, bHex) => {
      const a = hexToRgb(aHex);
      const b = hexToRgb(bHex);
      if (!a || !b) return 0;
      const dr = a.r - b.r;
      const dg = a.g - b.g;
      const db = a.b - b.b;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };
    const getThemeContrastScore = (aIndex, bIndex) => {
      const themeA = courseThemes[aIndex] || {};
      const themeB = courseThemes[bIndex] || {};
      const borderGap = colorDistance(themeA.border, themeB.border);
      const textGap = colorDistance(themeA.text, themeB.text);
      return borderGap * 0.72 + textGap * 0.28;
    };
    const getCircularOffset = (seed, candidate) => {
      const len = courseThemes.length;
      const forward = (candidate - seed + len) % len;
      const backward = (seed - candidate + len) % len;
      return Math.min(forward, backward);
    };
    const evaluateThemeCandidate = (candidate, seed, neighborColors, globalColors) => {
      const neighborMinContrast = neighborColors.length ? neighborColors.reduce((minGap, neighborColor) => {
        const gap = getThemeContrastScore(candidate, neighborColor);
        return gap < minGap ? gap : minGap;
      }, Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
      const globalMinContrast = globalColors.length ? globalColors.reduce((minGap, globalColor) => {
        const gap = getThemeContrastScore(candidate, globalColor);
        return gap < minGap ? gap : minGap;
      }, Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
      return {
        candidate,
        neighborMinContrast,
        globalMinContrast,
        offset: getCircularOffset(seed, candidate)
      };
    };
    const pickBestThemeCandidate = (candidates, seed, neighborColors, globalColors) => {
      let best = null;
      candidates.forEach((candidate) => {
        const metrics = evaluateThemeCandidate(candidate, seed, neighborColors, globalColors);
        if (!best) {
          best = metrics;
          return;
        }
        if (metrics.neighborMinContrast > best.neighborMinContrast) {
          best = metrics;
          return;
        }
        if (metrics.neighborMinContrast === best.neighborMinContrast && metrics.globalMinContrast > best.globalMinContrast) {
          best = metrics;
          return;
        }
        if (metrics.neighborMinContrast === best.neighborMinContrast && metrics.globalMinContrast === best.globalMinContrast && metrics.offset < best.offset) {
          best = metrics;
        }
      });
      return best?.candidate ?? null;
    };
    const periodsOverlap = (aStart, aEnd, bStart, bEnd) => {
      return !(aEnd < bStart || bEnd < aStart);
    };
    const areAdjacentCourses = (a, b) => {
      if (a._day === b._day) {
        return a._end + 1 === b._start || b._end + 1 === a._start;
      }
      if (Math.abs(a._day - b._day) === 1) {
        return periodsOverlap(a._start, a._end, b._start, b._end);
      }
      return false;
    };
    const getCourseMergeSignature = (course) => {
      const id = String(course?.id || course?.source_id || "").trim();
      const name = String(course?.name || "").trim();
      const teacher = String(course?.teacher || "").trim();
      const room = String(course?.room_code || course?.room || "").trim();
      const building = String(course?.building || "").trim();
      const className = String(course?.class_name || "").trim();
      const custom = course?.is_custom ? "1" : "0";
      return `${id}|${name}|${teacher}|${room}|${building}|${className}|${custom}`;
    };
    const getCourseEndPeriod = (course) => {
      const start = Number(course?.period) || 1;
      const span = Math.max(1, Number(course?.djs) || 1);
      return Math.min(MAX_PERIOD, start + span - 1);
    };
    const mergeDailyCourses = (dailyCourses) => {
      if (!dailyCourses.length) return [];
      const signatureCount = /* @__PURE__ */ new Map();
      dailyCourses.forEach((course) => {
        const signature = getCourseMergeSignature(course);
        signatureCount.set(signature, (signatureCount.get(signature) || 0) + 1);
      });
      const resolveRawSpan = (course) => {
        const start = Number(course?.period) || 1;
        if (course?.is_custom) {
          return Math.max(1, Math.min(MAX_PERIOD - start + 1, Number(course?.djs) || 1));
        }
        const signature = getCourseMergeSignature(course);
        const count = Number(signatureCount.get(signature) || 0);
        if (count > 1) {
          return 1;
        }
        const candidate = Number(course?.djs) || 1;
        if (candidate >= 1 && candidate <= MAX_PERIOD && start + candidate - 1 <= MAX_PERIOD) {
          return candidate;
        }
        return 1;
      };
      const merged = [];
      let i = 0;
      while (i < dailyCourses.length) {
        const current = dailyCourses[i];
        const startPeriod = Number(current.period) || 1;
        const currentSpan = resolveRawSpan(current);
        let endPeriod = Math.min(MAX_PERIOD, startPeriod + currentSpan - 1);
        let j = i + 1;
        while (j < dailyCourses.length) {
          const next = dailyCourses[j];
          const nextStart = Number(next.period) || 1;
          const nextSpan = resolveRawSpan(next);
          const nextEnd = Math.min(MAX_PERIOD, nextStart + nextSpan - 1);
          const sameSignature = getCourseMergeSignature(next) === getCourseMergeSignature(current);
          const canMergeSinglePeriodOnly = currentSpan === 1 && nextSpan === 1;
          if (sameSignature && canMergeSinglePeriodOnly && !!next.is_custom === !!current.is_custom && nextStart === endPeriod + 1) {
            endPeriod = Math.max(endPeriod, nextEnd);
            j++;
          } else {
            break;
          }
        }
        const span = endPeriod - startPeriod + 1;
        merged.push({
          ...current,
          djs: span
        });
        i = j;
      }
      return merged;
    };
    const buildConflictBlocks = (day, mergedCourses, weekNumber) => {
      if (!Array.isArray(mergedCourses) || mergedCourses.length < 2) return [];
      const periodConflicts = [];
      for (let period = 1; period <= 11; period += 1) {
        const activeRaw = mergedCourses.filter((course) => {
          const start = Number(course._start || course.period || 1);
          const span = Math.max(1, Number(course.djs || 1));
          const end = Number(course._end || start + span - 1);
          return period >= start && period <= end && !course.is_conflict;
        });
        const active = [];
        const signatureSet = /* @__PURE__ */ new Set();
        activeRaw.forEach((course) => {
          const signature = `${getCourseMergeSignature(course)}|${course.period}|${course.djs}`;
          if (signatureSet.has(signature)) return;
          signatureSet.add(signature);
          active.push(course);
        });
        if (active.length > 1) {
          const ids = active.map((course) => String(course._uid || course.id || course.name)).sort();
          periodConflicts.push({
            period,
            key: ids.join("|"),
            active
          });
        }
      }
      if (!periodConflicts.length) return [];
      const blocks = [];
      let i = 0;
      while (i < periodConflicts.length) {
        const current = periodConflicts[i];
        let end = current.period;
        let j = i + 1;
        while (j < periodConflicts.length && periodConflicts[j].period === end + 1 && periodConflicts[j].key === current.key) {
          end = periodConflicts[j].period;
          j += 1;
        }
        const conflictCourses = current.active;
        const title = `课程冲突（${conflictCourses.length}门）`;
        blocks.push({
          id: `conflict:${day}:${current.period}:${end}:${current.key}`,
          name: title,
          teacher: "",
          room: "点击查看冲突详情",
          room_code: `${conflictCourses.length}门冲突`,
          building: "冲突提示",
          weekday: day,
          period: current.period,
          djs: end - current.period + 1,
          weeks: [weekNumber],
          weeks_text: String(weekNumber),
          credit: "",
          class_name: "冲突课程",
          is_conflict: true,
          conflict_courses: conflictCourses.map((course) => ({
            id: course.id,
            source_id: course.source_id || course.id,
            name: course.name,
            teacher: course.teacher,
            room: course.room,
            room_code: course.room_code,
            building: course.building,
            weekday: course.weekday,
            period: course.period,
            djs: course.djs,
            weeks: Array.isArray(course.weeks) ? [...course.weeks] : [],
            weeks_text: course.weeks_text,
            credit: course.credit,
            class_name: course.class_name,
            semester: course.semester || semester.value || semesterDraft.value || "",
            is_custom: !!course.is_custom
          }))
        });
        i = j;
      }
      return blocks;
    };
    const buildWeekCoursesWithColors = (weekNumber) => {
      const byDay = {};
      const nodes = [];
      const nameBuckets = /* @__PURE__ */ new Map();
      for (let day = 1; day <= 7; day += 1) {
        const dailyCourses = scheduleData.value.filter((course) => course.weekday === day && course.weeks.includes(weekNumber)).sort((a, b) => a.period - b.period);
        const merged = mergeDailyCourses(dailyCourses).map((course, index) => {
          const span = Math.max(1, Number(course.djs) || 1);
          const start = Number(course.period);
          const end = Math.min(MAX_PERIOD, start + span - 1);
          return {
            ...course,
            _day: day,
            _start: start,
            _end: end,
            _uid: `${day}-${start}-${end}-${course.name}-${index}`
          };
        });
        const conflicts = buildConflictBlocks(day, merged, weekNumber);
        byDay[day] = [...merged, ...conflicts];
        merged.forEach((node) => {
          nodes.push(node);
          const nameKey = String(node.name || "");
          if (!nameBuckets.has(nameKey)) {
            nameBuckets.set(nameKey, []);
          }
          nameBuckets.get(nameKey).push(node);
        });
      }
      if (!nodes.length) return byDay;
      const nameNeighbors = new Map([...nameBuckets.keys()].map((name) => [name, /* @__PURE__ */ new Set()]));
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const nameA = String(a.name || "");
          const nameB = String(b.name || "");
          if (nameA !== nameB && areAdjacentCourses(a, b)) {
            nameNeighbors.get(nameA)?.add(nameB);
            nameNeighbors.get(nameB)?.add(nameA);
          }
        }
      }
      const orderedNames = [...nameBuckets.keys()].sort((a, b) => {
        const degreeDiff = (nameNeighbors.get(b)?.size || 0) - (nameNeighbors.get(a)?.size || 0);
        if (degreeDiff !== 0) return degreeDiff;
        return hashText(a) - hashText(b);
      });
      const colorByName = /* @__PURE__ */ new Map();
      const globallyUsedColors = /* @__PURE__ */ new Set();
      const allCandidates = Array.from({ length: courseThemes.length }, (_, i) => i);
      orderedNames.forEach((name) => {
        const neighborColorSet = /* @__PURE__ */ new Set();
        nameNeighbors.get(name)?.forEach((neighborName) => {
          if (!colorByName.has(neighborName)) return;
          const neighborColor = colorByName.get(neighborName);
          neighborColorSet.add(neighborColor);
        });
        const neighborColors = [...neighborColorSet];
        const globalColors = [...globallyUsedColors];
        const seed = hashText(name) % courseThemes.length;
        const uniqueCandidates = allCandidates.filter(
          (candidate) => !globallyUsedColors.has(candidate) && !neighborColorSet.has(candidate)
        );
        const reusableCandidates = allCandidates.filter(
          (candidate) => globallyUsedColors.has(candidate) && !neighborColorSet.has(candidate)
        );
        const noNeighborConflictCandidates = allCandidates.filter(
          (candidate) => !neighborColorSet.has(candidate)
        );
        let chosen = pickBestThemeCandidate(uniqueCandidates, seed, neighborColors, globalColors);
        if (chosen === null) {
          chosen = pickBestThemeCandidate(reusableCandidates, seed, neighborColors, globalColors);
        }
        if (chosen === null) {
          chosen = pickBestThemeCandidate(noNeighborConflictCandidates, seed, neighborColors, globalColors);
        }
        if (chosen === null) {
          chosen = pickBestThemeCandidate(allCandidates, seed, neighborColors, globalColors);
        }
        if (chosen === null) chosen = seed;
        colorByName.set(name, chosen);
        globallyUsedColors.add(chosen);
      });
      for (let day = 1; day <= 7; day += 1) {
        byDay[day] = (byDay[day] || []).map((course) => ({
          ...course,
          colorIndex: course.is_conflict ? 0 : colorByName.get(String(course.name || "")) ?? 0
        }));
      }
      return byDay;
    };
    const weekCoursesWithColor = computed(() => {
      const week = Number(selectedWeek.value);
      if (!Number.isFinite(week) || week <= 0) return {};
      return buildWeekCoursesWithColors(week);
    });
    const getCoursesForDay = (dayIndex) => {
      return weekCoursesWithColor.value[dayIndex] || [];
    };
    const getCoursesForDayAndWeek = (dayIndex, weekNumber) => {
      const dailyCourses = scheduleData.value.filter((course) => {
        return course.weekday === dayIndex && course.weeks.includes(weekNumber);
      });
      dailyCourses.sort((a, b) => a.period - b.period);
      return mergeDailyCourses(dailyCourses);
    };
    const getDateForWeekDay = (weekNumber, weekday) => {
      if (!startDateStr.value) return null;
      const base = new Date(startDateStr.value);
      base.setDate(base.getDate() + (weekNumber - 1) * 7 + (weekday - 1));
      const yyyy = base.getFullYear();
      const mm = String(base.getMonth() + 1).padStart(2, "0");
      const dd = String(base.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };
    const getCourseStyle = (course) => {
      if (!course) return {};
      const start = Number(course.period) || 1;
      const span = Math.max(1, Math.min(MAX_PERIOD - start + 1, Number(course.djs) || 1));
      const isTraditionalCard = scheduleCourseCardStyle.value === "traditional";
      const isClassCard = scheduleCourseCardStyle.value === "class";
      const modernRadius = "14px";
      const traditionalRadius = "12px";
      const classRadius = "12px";
      if (course.is_conflict) {
        return {
          "--course-bg": isTraditionalCard ? "#fef2f2" : isClassCard ? "rgba(254, 242, 242, 0.96)" : "repeating-linear-gradient(135deg, #fff1f2 0, #fff1f2 8px, #ffe4e6 8px, #ffe4e6 16px)",
          "--course-text": isTraditionalCard ? "#b91c1c" : "#b91c1c",
          "--course-border": isTraditionalCard ? "#fecaca" : "#dc2626",
          "--course-shadow": isTraditionalCard ? "0 2px 8px rgba(220, 38, 38, 0.08)" : isClassCard ? "0 6px 14px rgba(220, 38, 38, 0.16)" : "0 8px 18px rgba(220, 38, 38, 0.2)",
          "--course-span": String(span),
          "--course-radius": isTraditionalCard ? traditionalRadius : isClassCard ? classRadius : modernRadius,
          "--course-border-width": isClassCard ? "1px" : "2px",
          gridRow: `${start} / span ${span}`,
          gridColumn: "1",
          zIndex: 4
        };
      }
      let index = 0;
      if (course.colorIndex !== void 0) {
        index = course.colorIndex;
      } else {
        let hash = 0;
        for (let i = 0; i < course.name.length; i++) {
          hash = course.name.charCodeAt(i) + ((hash << 5) - hash);
        }
        index = Math.abs(hash) % courseThemes.length;
      }
      const theme = courseThemes[index];
      const isCustom = !!course.is_custom;
      const userColor = isCustom ? normalizeOptionalCourseColor(course.color) : null;
      const hasUserColor = !!(userColor && userColor.length);
      const borderColor = hasUserColor ? userColor : isCustom ? "#111111" : theme.border || "#cbd5e1";
      const traditionalBackground = hasUserColor ? mixHexWithWhite(userColor, 0.22) : isCustom ? "#111111" : theme.bg;
      const traditionalText = hasUserColor ? contrastTextForHex(traditionalBackground) : isCustom ? "#ffffff" : theme.text;
      const modernText = hasUserColor ? userColor : theme.text;
      const modernBackground = "rgba(255, 255, 255, 0.92)";
      const classBackground = "rgba(255, 255, 255, 0.94)";
      const normalShadow = isCustom ? "0 7px 16px rgba(15, 23, 42, 0.24)" : "0 6px 14px rgba(71, 85, 105, 0.16)";
      const traditionalShadow = "0 2px 8px rgba(0, 0, 0, 0.04)";
      const classShadow = isCustom ? "0 6px 14px rgba(15, 23, 42, 0.2)" : "0 4px 10px rgba(71, 85, 105, 0.14)";
      return {
        "--course-bg": isTraditionalCard ? traditionalBackground : isClassCard ? classBackground : modernBackground,
        "--course-text": isTraditionalCard ? traditionalText : modernText,
        "--course-border": borderColor,
        "--course-shadow": isTraditionalCard ? traditionalShadow : isClassCard ? classShadow : normalShadow,
        "--course-span": String(span),
        "--course-radius": isTraditionalCard ? traditionalRadius : isClassCard ? classRadius : modernRadius,
        "--course-border-width": isClassCard ? "1px" : isCustom ? "2px" : "1px",
        gridRow: `${start} / span ${span}`,
        gridColumn: "1",
        zIndex: 1
        // 增加间隔 (或者通过 margin 在 css 控制)
      };
    };
    const openDetail = (course) => {
      detailActionError.value = "";
      selectedCourse.value = course;
      showDetail.value = true;
    };
    const isWidgetHighlighted = (course, day) => {
      if (!widgetHighlightPeriod.value || !widgetHighlightDay.value) return false;
      if (day !== widgetHighlightDay.value) return false;
      const start = Number(course?.period) || 1;
      const span = Math.max(1, Number(course?.djs) || 1);
      const end = start + span - 1;
      return widgetHighlightPeriod.value >= start && widgetHighlightPeriod.value <= end;
    };
    const buildLocationText = (course) => {
      const building = String(course?.building || "").trim();
      const room = String(course?.room_code || course?.room || "").trim();
      return [building, room].filter(Boolean).join(" ") || "未填写";
    };
    const buildCourseTimeText = (course) => {
      const weekday = Number(course?.weekday || 0);
      const period = Number(course?.period || 0);
      if (!weekday || !period) return "未填写";
      const endPeriod = getCourseEndPeriod(course);
      return `周${weekday} 第${period}-${endPeriod}节`;
    };
    const buildSingleCourseDetailText = (course) => {
      const lines = [
        `课程名称：${String(course?.name || "").trim() || "未填写"}`,
        `课程类型：${course?.is_custom ? "自定义课程" : "教务课程"}`,
        `教师：${String(course?.teacher || "").trim() || "未填写"}`,
        `地点：${buildLocationText(course)}`,
        `时间：${buildCourseTimeText(course)}`,
        `周次：${String(course?.weeks_text || "").trim() ? `${String(course?.weeks_text || "").trim()}周` : "未填写"}`,
        `学分：${String(course?.credit || "").trim() || "无"}`,
        `教学班：${String(course?.class_name || "").trim() || "无"}`
      ];
      if (course?.semester) {
        lines.push(`学期：${String(course.semester).trim()}`);
      }
      return lines.join("\n");
    };
    const buildConflictDetailText = (course) => {
      const conflicts = Array.isArray(course?.conflict_courses) ? course.conflict_courses : [];
      if (!conflicts.length) {
        return `课程名称：${String(course?.name || "").trim() || "未填写"}
冲突详情：无`;
      }
      const lines = ["冲突课程详情："];
      conflicts.forEach((item, idx) => {
        lines.push(`${idx + 1}. ${String(item?.name || "").trim() || "未命名课程"}`);
        lines.push(`   类型：${item?.is_custom ? "自定义课程" : "教务课程"}`);
        lines.push(`   教师：${String(item?.teacher || "").trim() || "未填写"}`);
        lines.push(`   地点：${buildLocationText(item)}`);
        lines.push(`   时间：${buildCourseTimeText(item)}`);
        lines.push(`   周次：${String(item?.weeks_text || "").trim() ? `${String(item.weeks_text).trim()}周` : "未填写"}`);
      });
      return lines.join("\n");
    };
    const buildCourseDetailText = (course) => {
      if (!course) return "";
      if (course.is_conflict) {
        return buildConflictDetailText(course);
      }
      return buildSingleCourseDetailText(course);
    };
    const copyTextWithFallback = async (text) => {
      const content = String(text || "").trim();
      if (!content) return false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(content);
          return true;
        }
      } catch {
      }
      try {
        const textarea = document.createElement("textarea");
        textarea.value = content;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        return true;
      } catch {
        return false;
      }
    };
    const copySelectedCourseDetail = async () => {
      const course = selectedCourse.value;
      if (!course) return;
      const copied = await copyTextWithFallback(buildCourseDetailText(course));
      if (copied) {
        showToast(course.is_conflict ? "冲突课程详情已复制" : "课程详情已复制", "success");
        return;
      }
      showToast("复制失败，请稍后重试", "error");
    };
    const findCustomCourseRecord = (courseId, targetSemester = "") => {
      const normalizedId = String(courseId || "").trim();
      const normalizedSemester = String(targetSemester || "").trim();
      if (!normalizedId) return null;
      const pools = [customScheduleData.value, allCustomCourses.value];
      for (const pool of pools) {
        const found = (pool || []).find((item) => {
          const itemId = String(item?.source_id || item?.id || "").trim();
          const itemSemester = String(item?.semester || "").trim();
          if (!itemId || itemId !== normalizedId) return false;
          if (normalizedSemester && itemSemester && itemSemester !== normalizedSemester) return false;
          return true;
        });
        if (found) return normalizeCustomCourse(found);
      }
      return null;
    };
    const syncSelectedCustomCourse = (courseId, targetSemester = "") => {
      const nextCourse = findCustomCourseRecord(courseId, targetSemester);
      if (!nextCourse) {
        if (showDetail.value) {
          showDetail.value = false;
        }
        selectedCourse.value = null;
        return;
      }
      selectedCourse.value = nextCourse;
    };
    const resetAddCourseForm = () => {
      addCourseForm.value = {
        name: "",
        teacher: "",
        room: "",
        weekday: 1,
        period: 1,
        djs: 1,
        weeks: semesterWeekOptions.value.slice(),
        color: DEFAULT_COURSE_COLOR
      };
      addCourseError.value = "";
      showWeekPicker.value = false;
    };
    const populateCourseForm = (course) => {
      const normalized = normalizeCustomCourse(course);
      if (!normalized) return;
      const colorNorm = normalizeOptionalCourseColor(normalized.color);
      addCourseForm.value = {
        name: String(normalized.name || "").trim(),
        teacher: String(normalized.teacher || "").trim(),
        room: String(normalized.room || "").trim(),
        weekday: Number(normalized.weekday || 1),
        period: Number(normalized.period || 1),
        djs: Math.max(1, Number(normalized.djs || 1)),
        weeks: normalizeWeeks(normalized.weeks),
        // #469：回显已有 color；后端未下发时保持空（本地态）
        color: colorNorm === null ? DEFAULT_COURSE_COLOR : colorNorm
      };
      addCourseError.value = "";
      showWeekPicker.value = false;
    };
    const hasValidLoginSession = () => {
      const sid = String(props.studentId || "").trim();
      const sessionToken = String(localStorage.getItem(LOGIN_SESSION_TOKEN_KEY) || "").trim();
      return !!sid && !!sessionToken;
    };
    const promptLoginRequired = async () => {
      errorMsg.value = "请先登录后再管理自定义课程";
      showMenu.value = false;
      await askConfirm({
        title: "需要登录",
        lines: ["请先登录后再管理自定义课程。"],
        confirmText: "我知道了",
        cancelText: "关闭",
        danger: false
      });
    };
    const openAddCourseDialog = () => {
      if (!hasValidLoginSession()) {
        void promptLoginRequired();
        return;
      }
      const sem = String(semester.value || semesterDraft.value || "").trim();
      if (!sem) {
        semesterError.value = "请先选择学期后再添加课程";
        return;
      }
      courseDialogMode.value = "add";
      editingCourseId.value = "";
      editingCourseSemester.value = sem;
      returnToDetailAfterCourseSubmit.value = false;
      returnToManageAfterCourseSubmit.value = false;
      resetAddCourseForm();
      showAddCourse.value = true;
    };
    const closeAddCourseDialog = () => {
      const reopenManage = returnToManageAfterCourseSubmit.value;
      showAddCourse.value = false;
      showWeekPicker.value = false;
      addCourseError.value = "";
      courseDialogMode.value = "add";
      editingCourseId.value = "";
      editingCourseSemester.value = "";
      returnToDetailAfterCourseSubmit.value = false;
      returnToManageAfterCourseSubmit.value = false;
      if (reopenManage) {
        showManageCourses.value = true;
        void loadAllCustomCourses();
      }
    };
    const openEditCourseDialog = (course, { reopenDetail = false, reopenManage = false } = {}) => {
      const normalized = normalizeCustomCourse(course);
      if (!normalized?.is_custom) return;
      courseDialogMode.value = "edit";
      editingCourseId.value = String(normalized.source_id || normalized.id || "").trim();
      editingCourseSemester.value = String(normalized.semester || semester.value || semesterDraft.value || "").trim();
      returnToDetailAfterCourseSubmit.value = reopenDetail;
      returnToManageAfterCourseSubmit.value = reopenManage || showManageCourses.value;
      populateCourseForm(normalized);
      showDetail.value = false;
      showManageCourses.value = false;
      showMenu.value = false;
      showAddCourse.value = false;
      nextTick(() => {
        showAddCourse.value = true;
      });
    };
    const toggleManageSemester = (semesterKey) => {
      manageExpandedSemesters.value = {
        ...manageExpandedSemesters.value,
        [semesterKey]: !manageExpandedSemesters.value[semesterKey]
      };
    };
    const openManageCoursesDialog = async () => {
      if (!hasValidLoginSession()) {
        await promptLoginRequired();
        return;
      }
      showMenu.value = false;
      showManageCourses.value = true;
      await loadAllCustomCourses();
    };
    const closeManageCoursesDialog = () => {
      showManageCourses.value = false;
      loadingManageCourses.value = false;
      manageCoursesError.value = "";
    };
    const toggleAddCourseWeek = (week) => {
      const current = normalizeWeeks(addCourseForm.value.weeks);
      if (current.includes(week)) {
        addCourseForm.value.weeks = current.filter((w) => w !== week);
        return;
      }
      addCourseForm.value.weeks = normalizeWeeks([...current, week]);
    };
    const selectAllAddCourseWeeks = () => {
      addCourseForm.value.weeks = semesterWeekOptions.value.slice();
    };
    const clearAddCourseWeeks = () => {
      addCourseForm.value.weeks = [];
    };
    const validateAddCourse = () => {
      const name = String(addCourseForm.value.name || "").trim();
      if (!name) return "课程名称不能为空";
      const weeks = normalizeWeeks(addCourseForm.value.weeks);
      if (!weeks.length) return "请至少选择一个周次";
      const weekday = Number(addCourseForm.value.weekday);
      if (!Number.isFinite(weekday) || weekday < 1 || weekday > 7) return "请选择上课时间";
      const period = Number(addCourseForm.value.period);
      if (!Number.isFinite(period) || period < 1 || period > 11) return "开始节次必须在 1-11 节";
      const span = Number(addCourseForm.value.djs);
      const maxSpan = Math.max(1, 12 - period);
      if (!Number.isFinite(span) || span < 1 || span > maxSpan) return `上课节数必须在 1-${maxSpan} 节`;
      return "";
    };
    const refreshCustomCourseViews = async (targetSemester = "") => {
      const normalizedSemester = String(targetSemester || "").trim();
      const currentSemester = String(semester.value || semesterDraft.value || "").trim();
      if (normalizedSemester && normalizedSemester === currentSemester) {
        await loadCustomCourses(normalizedSemester);
      } else {
        mergeScheduleSources();
      }
      if (showManageCourses.value) {
        await loadAllCustomCourses();
      }
    };
    const submitAddCourse = async () => {
      if (!hasValidLoginSession()) {
        await promptLoginRequired();
        return;
      }
      const sem = String(courseDialogSemester.value || "").trim();
      if (!sem) {
        addCourseError.value = "学期无效，请重新选择";
        return;
      }
      const sid = String(props.studentId || "").trim();
      if (!sid) {
        addCourseError.value = "请先登录后再添加课程";
        return;
      }
      const validationError = validateAddCourse();
      if (validationError) {
        addCourseError.value = validationError;
        return;
      }
      const weeks = normalizeWeeks(addCourseForm.value.weeks);
      const colorNorm = normalizeOptionalCourseColor(addCourseForm.value.color);
      const payload = {
        student_id: sid,
        semester: sem,
        name: String(addCourseForm.value.name || "").trim(),
        teacher: String(addCourseForm.value.teacher || "").trim(),
        room: String(addCourseForm.value.room || "").trim(),
        weekday: Number(addCourseForm.value.weekday),
        period: Number(addCourseForm.value.period),
        djs: Number(addCourseForm.value.djs),
        weeks,
        // #470：可选用户色；空字符串表示未设定
        color: colorNorm === null ? DEFAULT_COURSE_COLOR : colorNorm
      };
      const isEditing = courseDialogMode.value === "edit";
      const confirmText = [
        `确认${isEditing ? "修改" : "添加"}到学期：${sem}`,
        `课程：${payload.name}`,
        `时间：${weekDayLabels[payload.weekday - 1]} 第${payload.period}-${payload.period + payload.djs - 1}节`,
        `周次：${formatWeeksText(weeks)}`
      ];
      const confirmed = await askConfirm({
        title: isEditing ? "确认修改课程" : "确认添加课程",
        lines: confirmText,
        confirmText: isEditing ? "确认修改" : "确认添加",
        cancelText: "取消",
        danger: false
      });
      if (!confirmed) {
        return;
      }
      addingCourse.value = true;
      addCourseError.value = "";
      try {
        const requestPayload = isEditing ? {
          ...payload,
          course_id: String(editingCourseId.value || "").trim()
        } : payload;
        const res = await axiosInstance.post(
          `${API_BASE}${isEditing ? "/v2/schedule/custom/update" : "/v2/schedule/custom/add"}`,
          requestPayload
        );
        if (!res.data?.success) {
          throw new Error(res.data?.error || `${isEditing ? "修改" : "添加"}课程失败`);
        }
        await refreshCustomCourseViews(sem);
        showAddCourse.value = false;
        showWeekPicker.value = false;
        if (isEditing && returnToManageAfterCourseSubmit.value) {
          showManageCourses.value = true;
          await loadAllCustomCourses();
        }
        if (isEditing && editingCourseId.value && returnToDetailAfterCourseSubmit.value) {
          syncSelectedCustomCourse(editingCourseId.value, sem);
          showDetail.value = !!selectedCourse.value;
        }
        courseDialogMode.value = "add";
        editingCourseId.value = "";
        editingCourseSemester.value = "";
        returnToDetailAfterCourseSubmit.value = false;
        returnToManageAfterCourseSubmit.value = false;
      } catch (e) {
        addCourseError.value = String(e?.response?.data?.error || e?.message || `${isEditing ? "修改" : "添加"}课程失败`);
      } finally {
        addingCourse.value = false;
      }
    };
    const deleteCustomCourseRecord = async (course, mode = "all", { reopenDetail = false } = {}) => {
      const normalized = normalizeCustomCourse(course);
      if (!normalized?.is_custom) return false;
      const sem = String(normalized.semester || semester.value || semesterDraft.value || "").trim();
      const sid = String(props.studentId || "").trim();
      if (!sem || !sid) return;
      const courseId = String(normalized.source_id || normalized.id || "").trim();
      if (!courseId) return;
      const isCurrentWeek = mode === "current_week";
      const week = Number(selectedWeek.value || 0);
      const message = isCurrentWeek ? `确认删除“${normalized.name}”在第${week}周的课程吗？` : `确认删除“${normalized.name}”的全部已选周次吗？`;
      const confirmed = await askConfirm({
        title: "确认删除课程",
        lines: [message],
        confirmText: "确认删除",
        cancelText: "取消",
        danger: true
      });
      if (!confirmed) return;
      try {
        const payload = {
          student_id: sid,
          semester: sem,
          course_id: courseId,
          mode: isCurrentWeek ? "current_week" : "all",
          current_week: isCurrentWeek ? week : void 0
        };
        const res = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/delete`, payload);
        if (!res.data?.success) {
          throw new Error(res.data?.error || "删除课程失败");
        }
        await refreshCustomCourseViews(sem);
        if (reopenDetail && !isCurrentWeek) {
          syncSelectedCustomCourse(courseId, sem);
          showDetail.value = !!selectedCourse.value;
        } else {
          showDetail.value = false;
          selectedCourse.value = null;
        }
        detailActionError.value = "";
        return true;
      } catch (e) {
        detailActionError.value = String(e?.response?.data?.error || e?.message || "删除课程失败");
        return false;
      }
    };
    const deleteCustomCourse = async (mode) => {
      const course = selectedCourse.value;
      if (!course?.is_custom) return;
      await deleteCustomCourseRecord(course, mode, { reopenDetail: mode === "current_week" });
    };
    const deleteManagedCourse = async (course) => {
      const ok = await deleteCustomCourseRecord(course, "all", { reopenDetail: false });
      if (!ok && detailActionError.value) {
        manageCoursesError.value = detailActionError.value;
      }
    };
    const openConflictCourseDetail = (course) => {
      const nextCourse = course?.is_custom ? findCustomCourseRecord(course.source_id || course.id, course.semester) || normalizeCustomCourse(course) : {
        ...course,
        is_conflict: false
      };
      if (!nextCourse) return;
      showDetail.value = false;
      nextTick(() => {
        openDetail({
          ...nextCourse,
          is_conflict: false
        });
      });
    };
    let touchStartX = 0;
    let touchStartY = 0;
    let touchLastX = 0;
    let touchStartAt = 0;
    let swipeTracking = false;
    let swipeLocked = false;
    const shouldIgnoreWeekSwipe = () => {
      return showMenu.value || showAddCourse.value || showManageCourses.value || showWeekPicker.value || showDetail.value || showConfirmDialog.value || showSemesterBadgePopover.value;
    };
    const shiftWeek = (delta) => {
      if (swipeLocked) return false;
      const current = Number(selectedWeek.value || 0);
      const max = Math.max(1, Number(totalWeeks.value || 1));
      const target = Math.min(max, Math.max(1, current + delta));
      if (target === current) return false;
      weekTransitionName.value = delta > 0 ? "week-slide-left" : "week-slide-right";
      selectedWeek.value = target;
      swipeLocked = true;
      window.setTimeout(() => {
        swipeLocked = false;
      }, 260);
      return true;
    };
    const handleTouchStart = (e) => {
      if (shouldIgnoreWeekSwipe()) return;
      const touch = e.changedTouches?.[0];
      if (!touch) return;
      swipeTracking = true;
      touchStartX = touch.screenX;
      touchStartY = touch.screenY;
      touchLastX = touch.screenX;
      touchStartAt = Date.now();
    };
    const handleTouchMove = (e) => {
      if (!swipeTracking) return;
      const touch = e.changedTouches?.[0];
      if (!touch) return;
      touchLastX = touch.screenX;
      const dx = Math.abs(touch.screenX - touchStartX);
      const dy = Math.abs(touch.screenY - touchStartY);
      if (dy > dx && dy > 16) {
        swipeTracking = false;
      }
    };
    const handleTouchEnd = (e) => {
      if (!swipeTracking) return;
      swipeTracking = false;
      const touch = e.changedTouches?.[0];
      const endX = touch?.screenX ?? touchLastX;
      const diff = touchStartX - endX;
      const durationMs = Math.max(1, Date.now() - touchStartAt);
      const velocity = Math.abs(diff) / durationMs;
      const distancePass = Math.abs(diff) >= 52;
      const velocityPass = Math.abs(diff) >= 24 && velocity >= 0.52;
      if (!distancePass && !velocityPass) return;
      if (diff > 0) {
        shiftWeek(1);
        return;
      }
      shiftWeek(-1);
    };
    const shouldIgnoreKeyboardWeekSwitch = () => {
      if (shouldIgnoreWeekSwipe()) return true;
      const active = document.activeElement;
      if (!active) return false;
      const tag = String(active.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      return !!active.getAttribute?.("contenteditable");
    };
    const handleWeekKeydown = (event) => {
      if (!event) return;
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (shouldIgnoreKeyboardWeekSwitch()) return;
      if (event.key === "ArrowLeft") {
        const changed = shiftWeek(-1);
        if (changed) event.preventDefault();
        return;
      }
      if (event.key === "ArrowRight") {
        const changed = shiftWeek(1);
        if (changed) event.preventDefault();
      }
    };
    const jumpToCurrentWeek = () => {
      if (currentWeek.value) {
        weekTransitionName.value = Number(currentWeek.value) >= Number(selectedWeek.value) ? "week-slide-left" : "week-slide-right";
        selectedWeek.value = currentWeek.value;
      }
    };
    const toggleMenu = () => {
      showMenu.value = !showMenu.value;
      if (!showMenu.value) {
        exportCopied.value = false;
      }
    };
    const setScheduleCourseCardStyle = (styleKey) => {
      const nextStyle = normalizeCourseCardStyle(styleKey);
      if (scheduleCourseCardStyle.value === nextStyle) return;
      scheduleCourseCardStyle.value = nextStyle;
      courseCardRefreshNonce.value += 1;
      uiSettings.scheduleCourseCardStyle = nextStyle;
      flushUiSettings();
      pushDebugLog("Schedule", `切换课表样式：${nextStyle}`, "info");
      try {
        const snapshot = JSON.parse(localStorage.getItem("hbu_ui_settings_v2") || "{}");
        pushDebugLog(
          "Schedule",
          `课表样式已写入本地缓存：${String(snapshot?.scheduleCourseCardStyle || "") || "unknown"}`,
          "debug"
        );
      } catch (error) {
        pushDebugLog("Schedule", "读取课表样式缓存失败", "warn", error);
      }
      nextTick(() => {
        courseCardRefreshNonce.value += 1;
        pushDebugLog(
          "Schedule",
          `课表样式热刷新完成：${nextStyle}，nonce=${courseCardRefreshNonce.value}`,
          "debug"
        );
      });
      const styleLabelMap = {
        modern: "现代",
        traditional: "传统",
        class: "标准"
      };
      showToast(`已切换为${styleLabelMap[nextStyle] || "现代"}样式`, "success");
    };
    const createTimestampSuffix = () => {
      const now = /* @__PURE__ */ new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const hh = String(now.getHours()).padStart(2, "0");
      const mi = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
    };
    const triggerTextFileDownload = (fileName, content, mimeType = "application/json;charset=utf-8") => {
      try {
        const blob = new Blob([content], { type: mimeType });
        const href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(href);
        return true;
      } catch {
        return false;
      }
    };
    const encodeBase64Utf8 = (content) => {
      const bytes = new TextEncoder().encode(String(content || ""));
      const chunkSize = 32768;
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, offset + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      return btoa(binary);
    };
    const saveJsonByFilePicker = async (fileName, content) => {
      if (typeof window.showSaveFilePicker !== "function") {
        return { ok: false, canceled: false, location: "" };
      }
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "JSON 文件",
              accept: {
                "application/json": [".json"]
              }
            }
          ]
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return {
          ok: true,
          canceled: false,
          location: handle?.name ? `已保存：${handle.name}` : "已保存到所选位置"
        };
      } catch (error) {
        if (String(error?.name || "").trim() === "AbortError") {
          return { ok: true, canceled: true, location: "已取消保存" };
        }
        return { ok: false, canceled: false, location: "" };
      }
    };
    const saveJsonByNativeExport = async (fileName, content) => {
      if (!isTauriRuntime()) {
        return { ok: false, canceled: false, location: "" };
      }
      try {
        const payload = await invokeNative("save_export_file", {
          req: {
            fileName,
            mimeType: "application/json",
            contentBase64: encodeBase64Utf8(content),
            preferMedia: false
          }
        });
        const path = String(payload?.path || "").trim();
        return {
          ok: true,
          canceled: false,
          location: path || "已保存到本地导出目录"
        };
      } catch (error) {
        const message = String(error?.message || error || "");
        if (message.includes("取消")) {
          return { ok: true, canceled: true, location: "已取消保存" };
        }
        return { ok: false, canceled: false, location: "" };
      }
    };
    const isLikelyMobileDevice = () => {
      const ua = String(navigator.userAgent || "");
      return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua);
    };
    const shareCustomCoursesJson = async (fileName, content) => {
      try {
        if (!navigator.share || typeof File === "undefined") return { ok: false, canceled: false };
        const file = new File([content], fileName, { type: "application/json" });
        await navigator.share({
          title: "Mini-HBUT 自定义课程备份",
          text: "自定义课程 JSON 备份",
          files: [file]
        });
        return { ok: true, canceled: false };
      } catch (error) {
        if (String(error?.name || "").trim() === "AbortError") {
          return { ok: true, canceled: true };
        }
        return { ok: false, canceled: false };
      }
    };
    const toPortableCustomCourse = (course) => {
      const normalized = normalizeCustomCourse(course);
      if (!normalized?.name) return null;
      return {
        id: normalized.source_id || normalized.id || "",
        source_id: normalized.source_id || normalized.id || "",
        semester: normalized.semester || "",
        name: normalized.name || "",
        teacher: normalized.teacher || "",
        room: normalized.room || "",
        weekday: Number(normalized.weekday || 1),
        period: Number(normalized.period || 1),
        djs: Number(normalized.djs || 1),
        weeks: normalizeWeeks(normalized.weeks),
        color: normalized.color || DEFAULT_COURSE_COLOR
      };
    };
    const readTextFromFile = async (file) => {
      if (!file) return "";
      if (typeof file.text === "function") {
        return await file.text();
      }
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取文件失败"));
        reader.readAsText(file, "utf-8");
      });
    };
    const parseImportedCustomCourse = (item, index) => {
      if (!item || typeof item !== "object") {
        throw new Error(`第 ${index + 1} 条课程数据格式错误`);
      }
      const semesterValue = String(item.semester || "").trim();
      const nameValue = String(item.name || "").trim();
      const teacherValue = String(item.teacher || "").trim();
      const roomValue = String(item.room || "").trim();
      const sourceId = String(item.source_id || item.id || "").trim();
      const weekdayValue = Number(item.weekday);
      const periodValue = Number(item.period);
      const djsValue = Number(item.djs);
      const weeksValue = normalizeWeeks(item.weeks);
      if (!semesterValue) throw new Error(`第 ${index + 1} 条课程缺少 semester`);
      if (!nameValue) throw new Error(`第 ${index + 1} 条课程缺少 name`);
      if (!Number.isFinite(weekdayValue) || weekdayValue < 1 || weekdayValue > 7) {
        throw new Error(`第 ${index + 1} 条课程 weekday 不合法`);
      }
      if (!Number.isFinite(periodValue) || periodValue < 1 || periodValue > 11) {
        throw new Error(`第 ${index + 1} 条课程 period 不合法`);
      }
      const maxSpan = Math.max(1, 12 - periodValue);
      if (!Number.isFinite(djsValue) || djsValue < 1 || djsValue > maxSpan) {
        throw new Error(`第 ${index + 1} 条课程 djs 不合法（最多 ${maxSpan}）`);
      }
      if (!weeksValue.length) throw new Error(`第 ${index + 1} 条课程 weeks 不能为空`);
      const colorNorm = normalizeOptionalCourseColor(item.color);
      const colorValue = colorNorm === null ? DEFAULT_COURSE_COLOR : colorNorm;
      return {
        source_id: sourceId,
        semester: semesterValue,
        name: nameValue,
        teacher: teacherValue,
        room: roomValue,
        color: colorValue,
        weekday: weekdayValue,
        period: periodValue,
        djs: djsValue,
        weeks: weeksValue
      };
    };
    const exportCustomCoursesJson = async () => {
      const sid = String(props.studentId || "").trim();
      if (!sid) {
        showToast("请先登录后再导出自定义课程", "error");
        return;
      }
      if (customCourseExporting.value) return;
      customCourseExporting.value = true;
      customCourseExportLocation.value = "";
      try {
        const res = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/list_all`, {
          student_id: sid
        });
        if (!res.data?.success) {
          throw new Error(res.data?.error || "导出自定义课程失败");
        }
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        const courses = list.map(toPortableCustomCourse).filter(Boolean);
        const payload = {
          version: "1.0.0",
          exported_at: (/* @__PURE__ */ new Date()).toISOString(),
          student_id: sid,
          courses
        };
        const content = JSON.stringify(payload, null, 2);
        const fileName = `mini-hbut-custom-courses-${createTimestampSuffix()}.json`;
        const pickerResult = await saveJsonByFilePicker(fileName, content);
        if (pickerResult.ok) {
          customCourseExportLocation.value = pickerResult.location;
          if (!pickerResult.canceled) {
            showToast(`已导出 ${courses.length} 门自定义课程`, "success");
          }
          return;
        }
        const preferShare = isLikelyMobileDevice();
        const shareResult = preferShare ? await shareCustomCoursesJson(fileName, content) : { ok: false, canceled: false };
        if (shareResult.ok) {
          customCourseExportLocation.value = shareResult.canceled ? "已取消保存" : "系统文件保存器/分享面板";
          if (!shareResult.canceled) {
            showToast(`已导出 ${courses.length} 门自定义课程`, "success");
          }
          return;
        }
        const nativeResult = await saveJsonByNativeExport(fileName, content);
        if (nativeResult.ok) {
          customCourseExportLocation.value = nativeResult.location;
          if (!nativeResult.canceled) {
            showToast(`已导出 ${courses.length} 门自定义课程`, "success");
          }
          return;
        }
        const fallbackShareResult = preferShare ? { ok: false, canceled: false } : await shareCustomCoursesJson(fileName, content);
        if (fallbackShareResult.ok) {
          customCourseExportLocation.value = fallbackShareResult.canceled ? "已取消保存" : "系统文件保存器/分享面板";
          if (!fallbackShareResult.canceled) {
            showToast(`已导出 ${courses.length} 门自定义课程`, "success");
          }
          return;
        }
        if (triggerTextFileDownload(fileName, content)) {
          customCourseExportLocation.value = "浏览器默认下载目录";
          showToast(`已导出 ${courses.length} 门自定义课程`, "success");
          return;
        }
        const copied = await copyTextWithFallback(content);
        if (copied) {
          customCourseExportLocation.value = "未生成文件，已复制 JSON 到剪贴板";
          showToast("文件导出失败，已复制 JSON 到剪贴板", "warning");
          return;
        }
        throw new Error("导出失败，请稍后重试");
      } catch (error) {
        showToast(String(error?.message || "导出自定义课程失败"), "error");
      } finally {
        customCourseExporting.value = false;
      }
    };
    const triggerImportCustomCourses = () => {
      if (customCourseImporting.value) return;
      customCourseFileInput.value?.click();
    };
    const importCustomCoursesFromText = async (content = "") => {
      const sid = String(props.studentId || "").trim();
      if (!sid) {
        throw new Error("请先登录后再导入自定义课程");
      }
      let parsed;
      try {
        parsed = JSON.parse(String(content || ""));
      } catch {
        throw new Error("JSON 解析失败，请检查文件格式");
      }
      const importStudentId = String(parsed?.student_id || "").trim();
      const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.courses) ? parsed.courses : [];
      if (!rows.length) {
        throw new Error("导入文件中没有可用课程数据");
      }
      if (importStudentId && importStudentId !== sid) {
        const confirmed = await askConfirm({
          title: "学号不一致，是否继续导入？",
          lines: [
            `当前登录学号：${sid}`,
            `导入文件学号：${importStudentId}`,
            "继续导入会写入当前登录账号的本地自定义课表。"
          ],
          confirmText: "继续导入",
          cancelText: "取消",
          danger: false
        });
        if (!confirmed) {
          throw new Error("已取消导入");
        }
      }
      const listRes = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/list_all`, {
        student_id: sid
      });
      if (!listRes.data?.success) {
        throw new Error(listRes.data?.error || "读取本地课程失败，无法导入");
      }
      const existingList = Array.isArray(listRes.data?.data) ? listRes.data.data : [];
      const existingMap = /* @__PURE__ */ new Map();
      existingList.forEach((item) => {
        const normalized = normalizeCustomCourse(item);
        if (!normalized) return;
        const sourceId = String(normalized.source_id || normalized.id || "").trim();
        if (!sourceId) return;
        existingMap.set(sourceId, normalized);
      });
      let added = 0;
      let updated = 0;
      let failed = 0;
      for (let index = 0; index < rows.length; index += 1) {
        try {
          const course = parseImportedCustomCourse(rows[index], index);
          const existing = course.source_id ? existingMap.get(course.source_id) : null;
          if (existing && String(existing.semester || "").trim() === course.semester) {
            const updateRes = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/update`, {
              student_id: sid,
              semester: course.semester,
              course_id: course.source_id,
              name: course.name,
              teacher: course.teacher,
              room: course.room,
              weekday: course.weekday,
              period: course.period,
              djs: course.djs,
              weeks: course.weeks,
              color: course.color || DEFAULT_COURSE_COLOR
            });
            if (!updateRes.data?.success) {
              throw new Error(updateRes.data?.error || "更新失败");
            }
            updated += 1;
            continue;
          }
          const addRes = await axiosInstance.post(`${API_BASE}/v2/schedule/custom/add`, {
            student_id: sid,
            semester: course.semester,
            name: course.name,
            teacher: course.teacher,
            room: course.room,
            weekday: course.weekday,
            period: course.period,
            djs: course.djs,
            weeks: course.weeks,
            color: course.color || DEFAULT_COURSE_COLOR
          });
          if (!addRes.data?.success) {
            throw new Error(addRes.data?.error || "新增失败");
          }
          added += 1;
        } catch (error) {
          failed += 1;
          console.warn("[Schedule] 自定义课程导入失败：", error);
        }
      }
      await refreshCustomCourseViews(String(semester.value || semesterDraft.value || "").trim());
      if (failed > 0) {
        showToast(`导入完成：新增 ${added}，更新 ${updated}，失败 ${failed}`, "warning", 4500);
      } else {
        showToast(`导入完成：新增 ${added}，更新 ${updated}`, "success");
      }
    };
    const handleCustomCourseFileChange = async (event) => {
      const input = event?.target;
      const file = input?.files?.[0];
      if (!file) return;
      customCourseImporting.value = true;
      try {
        const content = await readTextFromFile(file);
        await importCustomCoursesFromText(content);
      } catch (error) {
        const message = String(error?.message || "导入失败");
        if (message !== "已取消导入") {
          showToast(message, "error");
        }
      } finally {
        customCourseImporting.value = false;
        if (input) input.value = "";
      }
    };
    const buildExportEventsForWeek = (weekNumber) => {
      const events = [];
      if (!startDateStr.value) return events;
      for (let day = 1; day <= 7; day++) {
        const iso = getDateForWeekDay(weekNumber, day);
        if (!iso) continue;
        const courses = getCoursesForDayAndWeek(day, weekNumber);
        courses.forEach((course) => {
          const startPeriod = Number(course.period) || 1;
          const endPeriod = getCourseEndPeriod(course);
          const startSlot = timeSchedule.find((t) => t.p === startPeriod);
          const endSlot = timeSchedule.find((t) => t.p === endPeriod);
          if (!startSlot || !endSlot) return;
          const start = `${iso}T${startSlot.start}:00`;
          const end = `${iso}T${endSlot.end}:00`;
          const room = course.room_code || course.room || "";
          const location = [course.building, room].filter(Boolean).join(" ");
          const timeLabel = `第${weekNumber}周 周${day} 第${startPeriod}-${endPeriod}节 ${startSlot.start}-${endSlot.end}`;
          const description = `时间: ${timeLabel}
地点: ${location || "未标注"}`;
          events.push({
            summary: course.name,
            description,
            location: location || void 0,
            start,
            end
          });
        });
      }
      return events;
    };
    const buildExportEventsForSemester = () => {
      const events = [];
      if (!startDateStr.value) return events;
      const maxWeek = scheduleData.value.reduce((acc, course) => {
        const maxCourseWeek = Array.isArray(course.weeks) && course.weeks.length ? Math.max(...course.weeks) : 0;
        return Math.max(acc, maxCourseWeek);
      }, 0);
      const totalWeeks2 = maxWeek || 25;
      const seen = /* @__PURE__ */ new Set();
      for (let week = 1; week <= totalWeeks2; week++) {
        for (let day = 1; day <= 7; day++) {
          const iso = getDateForWeekDay(week, day);
          if (!iso) continue;
          const courses = getCoursesForDayAndWeek(day, week);
          courses.forEach((course) => {
            const startPeriod = Number(course.period) || 1;
            const endPeriod = getCourseEndPeriod(course);
            const startSlot = timeSchedule.find((t) => t.p === startPeriod);
            const endSlot = timeSchedule.find((t) => t.p === endPeriod);
            if (!startSlot || !endSlot) return;
            const start = `${iso}T${startSlot.start}:00`;
            const end = `${iso}T${endSlot.end}:00`;
            const room = course.room_code || course.room || "";
            const location = [course.building, room].filter(Boolean).join(" ");
            const timeLabel = `第${week}周 周${day} 第${startPeriod}-${endPeriod}节 ${startSlot.start}-${endSlot.end}`;
            const description = `时间: ${timeLabel}
地点: ${location || "未标注"}`;
            const teacher = course.teacher || "";
            const key = `${course.name}|${start}|${end}|${location}|${teacher}`;
            if (seen.has(key)) return;
            seen.add(key);
            events.push({
              summary: course.name,
              description,
              location: location || void 0,
              start,
              end
            });
          });
        }
      }
      return events;
    };
    const exportCalendar = async (mode = "week") => {
      exportError.value = "";
      exportUrl.value = "";
      exportCopied.value = false;
      if (exporting.value) return;
      if (!props.studentId) {
        exportError.value = "请先登录后再导出";
        return;
      }
      if (!startDateStr.value) {
        exportError.value = "缺少学期开始日期，暂无法导出";
        return;
      }
      exportingMode.value = mode;
      const events = mode === "semester" ? buildExportEventsForSemester() : buildExportEventsForWeek(selectedWeek.value);
      if (!events.length) {
        exportError.value = "当前周暂无可导出的课表数据";
        return;
      }
      exporting.value = true;
      try {
        const uploadEndpoint = String(localStorage.getItem("hbu_temp_upload_endpoint") || "").trim();
        const payload = {
          student_id: props.studentId,
          semester: semester.value,
          week: selectedWeek.value,
          events
        };
        if (uploadEndpoint) {
          payload.upload_endpoint = uploadEndpoint;
        }
        const res = await axiosInstance.post(`${API_BASE}/v2/schedule/export_calendar`, payload);
        if (res.data?.success) {
          exportUrl.value = res.data.url || "";
          if (!exportUrl.value) {
            exportError.value = "导出成功但未返回链接";
          } else {
            showToast("日历导出成功，复制链接用浏览器打开即可导入", "success", 3e3);
            nextTick(() => {
              const panel = document.querySelector(".drawer-panel");
              if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
            });
          }
        } else {
          exportError.value = res.data?.error || "导出失败";
        }
      } catch (e) {
        exportError.value = e.response?.data?.error || e.message || "导出失败";
      } finally {
        exporting.value = false;
        exportingMode.value = "";
      }
    };
    const copyExportUrl = async () => {
      if (!exportUrl.value) return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(exportUrl.value);
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = exportUrl.value;
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
        exportCopied.value = true;
        setTimeout(() => {
          exportCopied.value = false;
        }, 2e3);
      } catch (e) {
        exportError.value = "复制失败，请手动复制";
      }
    };
    const refreshCloudSyncCooldown = () => {
      const sid = String(props.studentId || "").trim();
      if (!sid) {
        syncUploadCooldownMs.value = 0;
        syncDownloadCooldownMs.value = 0;
        return;
      }
      const uploadState = getCloudSyncCooldownState(sid, "upload");
      const downloadState = getCloudSyncCooldownState(sid, "download");
      syncUploadCooldownMs.value = Math.max(0, Number(uploadState.remainingMs || 0));
      syncDownloadCooldownMs.value = Math.max(0, Number(downloadState.remainingMs || 0));
    };
    const clearCloudSyncCooldownTimer = () => {
      if (!syncCooldownTimer) return;
      window.clearInterval(syncCooldownTimer);
      syncCooldownTimer = null;
    };
    const ensureCloudSyncCooldownTimer = () => {
      clearCloudSyncCooldownTimer();
      syncCooldownTimer = window.setInterval(() => {
        refreshCloudSyncCooldown();
      }, 1e3);
    };
    const refreshScheduleAfterCloudDownload = async (syncResult = {}) => {
      const sem = String(semester.value || semesterDraft.value || "").trim();
      if (!sem) return;
      const downloadedSemesters = Array.isArray(syncResult?.academicApplied?.scheduleSemesters) ? syncResult.academicApplied.scheduleSemesters.map((item) => String(item || "").trim()).filter(Boolean) : [];
      const shouldRefreshSchedule = downloadedSemesters.length === 0 || downloadedSemesters.includes(sem);
      const hasCached = shouldRefreshSchedule ? applyCachedScheduleImmediately(sem) : false;
      await loadCustomCourses(sem);
      if (!hasCached && shouldRefreshSchedule) {
        await fetchSchedule(sem);
      }
    };
    const handleCloudSyncUpdated = (event) => {
      const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
      const sid = String(props.studentId || "").trim();
      const targetSid = String(detail?.studentId || "").trim();
      if (!sid || !targetSid || sid !== targetSid) return;
      refreshCloudSyncCooldown();
      if (detail?.action !== "download" || !detail?.success) return;
      if (syncDownloading.value) return;
      void refreshScheduleAfterCloudDownload(detail).catch((error) => {
        console.warn("[Schedule] cloud sync auto refresh failed:", error);
      });
    };
    const handleScheduleVisibilityChange = () => {
      if (document.hidden) {
        persistScheduleRenderSnapshot("app-hidden");
      }
    };
    const handleCloudSyncUpload = async () => {
      if (!hasValidLoginSession()) {
        await promptLoginRequired();
        return;
      }
      const sid = String(props.studentId || "").trim();
      if (!sid || syncUploading.value || syncDownloading.value) return;
      refreshCloudSyncCooldown();
      if (syncUploadCooldownMs.value > 0) {
        showToast(`上传冷却中，${syncUploadCooldownText.value}`, "info");
        return;
      }
      const sem = String(semester.value || semesterDraft.value || "").trim();
      const confirmed = await askConfirm({
        title: "确认上传到云端",
        lines: [
          "将覆盖云端已有的自定义课程数据。",
          `当前学期：${sem || "未选择学期"}`,
          "确认后将立即执行上传。"
        ],
        confirmText: "确认上传",
        cancelText: "取消",
        danger: true
      });
      if (!confirmed) return;
      syncUploading.value = true;
      syncStatusText.value = "正在上传云端备份...";
      try {
        const result = await runCloudSyncUpload({
          studentId: sid,
          reason: "schedule-manual-upload",
          force: false,
          includeCustomCourses: true,
          includeAcademic: false,
          includeSettings: false
        });
        if (!result?.success) {
          if (result?.cooldown) {
            syncUploadCooldownMs.value = Number(result.remainingMs || 0);
            showToast(`上传冷却中，${syncUploadCooldownText.value}`, "info");
          } else {
            showToast(result?.error || "云上传失败", "error");
          }
          return;
        }
        refreshCloudSyncCooldown();
        showToast("云上传完成", "success");
      } catch (e) {
        showToast(String(e?.message || "云上传失败"), "error");
      } finally {
        syncUploading.value = false;
        syncStatusText.value = "";
      }
    };
    const handleCloudSyncDownload = async () => {
      if (!hasValidLoginSession()) {
        await promptLoginRequired();
        return;
      }
      const sid = String(props.studentId || "").trim();
      if (!sid || syncUploading.value || syncDownloading.value) return;
      refreshCloudSyncCooldown();
      if (syncDownloadCooldownMs.value > 0) {
        showToast(`下载冷却中，${syncDownloadCooldownText.value}`, "info");
        return;
      }
      syncDownloading.value = true;
      syncStatusText.value = "正在下载云端备份并覆盖本地课表...";
      try {
        const result = await runCloudSyncDownload({
          studentId: sid,
          reason: "schedule-manual-download",
          force: false,
          applySettings: false,
          applyCustomCourses: true,
          applyAcademic: false
        });
        if (!result?.success) {
          if (result?.cooldown) {
            syncDownloadCooldownMs.value = Number(result.remainingMs || 0);
            showToast(`下载冷却中，${syncDownloadCooldownText.value}`, "info");
          } else {
            showToast(result?.error || "云下载失败", "error");
          }
          return;
        }
        await refreshScheduleAfterCloudDownload(result);
        refreshCloudSyncCooldown();
        if (result?.empty) {
          showToast("云端暂无备份，已记录本次同步", "info");
        } else {
          showToast("云下载完成，已应用自定义课程", "success");
        }
      } catch (e) {
        showToast(String(e?.message || "云下载失败"), "error");
      } finally {
        syncDownloading.value = false;
        syncStatusText.value = "";
      }
    };
    const handleSessionLogout = () => {
      scheduleData.value = [];
      remoteScheduleData.value = [];
      customScheduleData.value = [];
      offline.value = false;
      offlineHint.value = "";
      errorMsg.value = "请先登录后查看课表";
      initialFetchDone.value = true;
    };
    const handleSessionOnline = () => {
      const sid = String(props.studentId || "").trim();
      if (!sid) return;
      offline.value = false;
      offlineHint.value = "";
      const targetSemester = String(
        semester.value || semesterDraft.value || readStoredSemester() || deriveSemesterByDate()
      ).trim();
      void fetchSchedule(targetSemester);
    };
    onMounted(async () => {
      window.addEventListener("keydown", handleWeekKeydown);
      window.addEventListener(CLOUD_SYNC_UPDATED_EVENT, handleCloudSyncUpdated);
      window.addEventListener("hbu-session-online", handleSessionOnline);
      window.addEventListener("hbu-session-logout", handleSessionLogout);
      document.addEventListener("visibilitychange", handleScheduleVisibilityChange);
      refreshCloudSyncCooldown();
      ensureCloudSyncCooldownTimer();
      void fetchSemesterOptions();
      const switchSemester = consumeScheduleSwitchPending(props.studentId);
      if (switchSemester) {
        writeScheduleLock(props.studentId, switchSemester, "pending-switch");
        semester.value = switchSemester;
        semesterDraft.value = switchSemester;
      }
      const lockDetail = readScheduleLockDetail(props.studentId);
      const todaySemester = deriveSemesterByDate();
      if (lockDetail?.semester && todaySemester && lockDetail.semester !== todaySemester && isAutoScheduleLockReason(lockDetail.reason)) {
        const cleared = clearScheduleLock(props.studentId);
        if (cleared) {
          pushDebugLog(
            "Schedule",
            `检测到自动锁定学期(${lockDetail.semester})与当前日期学期(${todaySemester})冲突，已清理并重探测`,
            "warn"
          );
        }
      }
      const lockedSemester = String(readScheduleLock(props.studentId) || "").trim();
      const startupSemester = String(semester.value || semesterDraft.value || readStoredSemester() || deriveSemesterByDate()).trim();
      const startupRenderSnapshot = initialRenderSnapshotApplied || (startupSemester ? applyStoredScheduleRenderSnapshot(startupSemester, { markBoot: false }) : false);
      const startupCached = startupRenderSnapshot || (startupSemester ? applyCachedScheduleImmediately(startupSemester) : false);
      if (startupCached) {
        initialFetchDone.value = true;
        errorMsg.value = "";
        void loadCustomCourses(startupSemester);
      }
      if (lockedSemester) {
        semester.value = lockedSemester;
        semesterDraft.value = lockedSemester;
        const hasInstantCache = applyCachedScheduleImmediately(lockedSemester);
        if (hasInstantCache) {
          void loadCustomCourses(lockedSemester);
          void fetchSchedule(lockedSemester);
        } else {
          await fetchSchedule(lockedSemester);
        }
      } else if (props.studentId) {
        const probeAndRefresh = async () => {
          const warmed = await warmupScheduleForStudent(props.studentId, {
            forceProbe: true,
            reason: "first-enter"
          });
          if (warmed?.success && warmed?.semester) {
            semester.value = warmed.semester;
            semesterDraft.value = warmed.semester;
            if (!applySchedulePayload(warmed.payload, warmed.semester)) {
              await fetchSchedule(warmed.semester);
            } else {
              await loadCustomCourses(warmed.semester);
            }
          } else {
            await fetchSchedule();
          }
        };
        if (startupCached) {
          void probeAndRefresh();
        } else {
          await probeAndRefresh();
        }
      } else {
        if (!startupCached) {
          await fetchSchedule();
        }
      }
      const pendingSemester = consumePendingSemesterPopup();
      if (pendingSemester) {
        openSemesterPopup(pendingSemester);
        return;
      }
      if (!isPopupShown()) {
        openSemesterPopup();
      }
      document.addEventListener("click", closeSemesterBadgePopover);
    });
    onBeforeUnmount(() => {
      persistScheduleRenderSnapshot("component-unmount");
      window.removeEventListener("keydown", handleWeekKeydown);
      window.removeEventListener(CLOUD_SYNC_UPDATED_EVENT, handleCloudSyncUpdated);
      window.removeEventListener("hbu-session-online", handleSessionOnline);
      window.removeEventListener("hbu-session-logout", handleSessionLogout);
      document.removeEventListener("visibilitychange", handleScheduleVisibilityChange);
      document.removeEventListener("click", closeSemesterBadgePopover);
      clearCloudSyncCooldownTimer();
      if (widgetHighlightTimer) {
        clearTimeout(widgetHighlightTimer);
        widgetHighlightTimer = null;
      }
    });
    return (_ctx, _cache) => {
      const _component_IOSSelect = resolveComponent("IOSSelect");
      return openBlock(), createElementBlock("div", {
        class: "schedule-view",
        onTouchstartPassive: handleTouchStart,
        onTouchmovePassive: handleTouchMove,
        onTouchendPassive: handleTouchEnd,
        onTouchcancelPassive: handleTouchEnd
      }, [
        createBaseVNode("div", _hoisted_1, [
          createBaseVNode("button", {
            class: "menu-btn btn-ripple",
            onClick: toggleMenu,
            "aria-label": "打开课表菜单"
          }, [..._cache[28] || (_cache[28] = [
            createBaseVNode("span", { class: "material-symbols-outlined menu-icon" }, "menu", -1)
          ])]),
          createBaseVNode("div", _hoisted_2, [
            _cache[29] || (_cache[29] = createBaseVNode("h1", { class: "topbar-title" }, "课表", -1)),
            createBaseVNode("p", _hoisted_3, toDisplayString(semester.value || "加载中..."), 1)
          ]),
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("div", _hoisted_5, [
              createVNode(_component_IOSSelect, {
                modelValue: selectedWeek.value,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selectedWeek.value = $event),
                modelModifiers: { number: true }
              }, {
                default: withCtx(() => [
                  _cache[30] || (_cache[30] = createBaseVNode("option", {
                    disabled: "",
                    value: "0"
                  }, "请选择周次", -1)),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(totalWeeks.value, (w) => {
                    return openBlock(), createElementBlock("option", {
                      key: w,
                      value: w
                    }, "第" + toDisplayString(w) + "周", 9, _hoisted_6);
                  }), 128))
                ]),
                _: 1
              }, 8, ["modelValue"])
            ])
          ])
        ]),
        createVNode(Transition, { name: "drawer-fade" }, {
          default: withCtx(() => [
            showMenu.value ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "drawer-overlay",
              onClick: _cache[1] || (_cache[1] = ($event) => showMenu.value = false)
            })) : createCommentVNode("", true)
          ]),
          _: 1
        }),
        createVNode(Transition, { name: "drawer-slide" }, {
          default: withCtx(() => [
            showMenu.value ? (openBlock(), createElementBlock("aside", {
              key: 0,
              class: "drawer-panel",
              onClick: _cache[5] || (_cache[5] = withModifiers(() => {
              }, ["stop"]))
            }, [
              _cache[46] || (_cache[46] = createBaseVNode("div", { class: "drawer-title" }, [
                createBaseVNode("span", { class: "material-symbols-outlined drawer-title-icon" }, "calendar_month"),
                createTextVNode(" 课表工具 ")
              ], -1)),
              createBaseVNode("div", _hoisted_7, [
                _cache[32] || (_cache[32] = createBaseVNode("div", {
                  class: "drawer-subtitle",
                  "data-step": "1"
                }, "选择学期", -1)),
                createBaseVNode("div", _hoisted_8, [
                  createVNode(_component_IOSSelect, {
                    class: "drawer-select",
                    modelValue: semesterDraft.value,
                    "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => semesterDraft.value = $event),
                    disabled: semesterLoading.value || loading.value,
                    onChange: onSemesterChange
                  }, {
                    default: withCtx(() => [
                      _cache[31] || (_cache[31] = createBaseVNode("option", {
                        disabled: "",
                        value: ""
                      }, "请选择学期", -1)),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(semesterOptions.value, (sem) => {
                        return openBlock(), createElementBlock("option", {
                          key: sem,
                          value: sem
                        }, toDisplayString(sem), 9, _hoisted_9);
                      }), 128))
                    ]),
                    _: 1
                  }, 8, ["modelValue", "disabled"])
                ]),
                semesterError.value ? (openBlock(), createElementBlock("div", _hoisted_10, toDisplayString(semesterError.value), 1)) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", _hoisted_11, [
                _cache[33] || (_cache[33] = createBaseVNode("div", {
                  class: "drawer-subtitle",
                  "data-step": "2"
                }, "课程样式", -1)),
                createBaseVNode("div", _hoisted_12, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(courseCardStyleOptions, (item) => {
                    return createBaseVNode("button", {
                      key: item.key,
                      type: "button",
                      class: normalizeClass(["drawer-style-chip", { active: scheduleCourseCardStyle.value === item.key }]),
                      role: "tab",
                      "aria-pressed": scheduleCourseCardStyle.value === item.key,
                      "aria-selected": scheduleCourseCardStyle.value === item.key,
                      onClick: withModifiers(($event) => setScheduleCourseCardStyle(item.key), ["stop"])
                    }, [
                      createBaseVNode("strong", null, toDisplayString(item.label), 1)
                    ], 10, _hoisted_13);
                  }), 64))
                ])
              ]),
              createBaseVNode("div", _hoisted_14, [
                createBaseVNode("div", _hoisted_15, [
                  _cache[36] || (_cache[36] = createBaseVNode("div", {
                    class: "drawer-subtitle",
                    "data-step": "3"
                  }, "自定义课程管理", -1)),
                  createBaseVNode("div", _hoisted_16, [
                    createBaseVNode("button", {
                      class: "drawer-action add-course",
                      disabled: addingCourse.value,
                      onClick: openAddCourseDialog
                    }, [..._cache[34] || (_cache[34] = [
                      createBaseVNode("span", { class: "material-symbols-outlined" }, "add_circle", -1),
                      createTextVNode(" 添加课程 ", -1)
                    ])], 8, _hoisted_17),
                    createBaseVNode("button", {
                      class: "drawer-action manage-course",
                      disabled: loadingManageCourses.value,
                      onClick: openManageCoursesDialog
                    }, [
                      _cache[35] || (_cache[35] = createBaseVNode("span", { class: "material-symbols-outlined" }, "folder_copy", -1)),
                      createTextVNode(" " + toDisplayString(loadingManageCourses.value ? "加载中..." : "管理课程"), 1)
                    ], 8, _hoisted_18)
                  ])
                ]),
                createBaseVNode("div", _hoisted_19, [
                  _cache[41] || (_cache[41] = createBaseVNode("div", {
                    class: "drawer-subtitle",
                    "data-step": "4"
                  }, "自定义课程同步", -1)),
                  createBaseVNode("div", _hoisted_20, [
                    createBaseVNode("button", {
                      class: "drawer-action sync-upload",
                      disabled: syncUploading.value || syncDownloading.value || customCourseImporting.value || customCourseExporting.value,
                      onClick: handleCloudSyncUpload
                    }, [
                      _cache[37] || (_cache[37] = createBaseVNode("span", { class: "material-symbols-outlined" }, "cloud_upload", -1)),
                      createTextVNode(" " + toDisplayString(syncUploading.value ? "云上传中..." : "云上传"), 1)
                    ], 8, _hoisted_21),
                    createBaseVNode("button", {
                      class: "drawer-action sync-download",
                      disabled: syncUploading.value || syncDownloading.value || customCourseImporting.value || customCourseExporting.value,
                      onClick: handleCloudSyncDownload
                    }, [
                      _cache[38] || (_cache[38] = createBaseVNode("span", { class: "material-symbols-outlined" }, "cloud_download", -1)),
                      createTextVNode(" " + toDisplayString(syncDownloading.value ? "云下载中..." : "云下载"), 1)
                    ], 8, _hoisted_22)
                  ]),
                  createBaseVNode("div", _hoisted_23, [
                    createBaseVNode("button", {
                      class: "drawer-action sync-json-export",
                      disabled: syncUploading.value || syncDownloading.value || customCourseImporting.value || customCourseExporting.value,
                      onClick: exportCustomCoursesJson
                    }, [
                      _cache[39] || (_cache[39] = createBaseVNode("span", { class: "material-symbols-outlined" }, "data_object", -1)),
                      createTextVNode(" " + toDisplayString(customCourseExporting.value ? "导出中..." : "导出 JSON"), 1)
                    ], 8, _hoisted_24),
                    createBaseVNode("button", {
                      class: "drawer-action sync-json-import",
                      disabled: syncUploading.value || syncDownloading.value || customCourseImporting.value || customCourseExporting.value,
                      onClick: triggerImportCustomCourses
                    }, [
                      _cache[40] || (_cache[40] = createBaseVNode("span", { class: "material-symbols-outlined" }, "file_upload", -1)),
                      createTextVNode(" " + toDisplayString(customCourseImporting.value ? "导入中..." : "导入 JSON"), 1)
                    ], 8, _hoisted_25)
                  ]),
                  createBaseVNode("input", {
                    ref_key: "customCourseFileInput",
                    ref: customCourseFileInput,
                    type: "file",
                    accept: ".json,application/json",
                    style: { "display": "none" },
                    onChange: handleCustomCourseFileChange
                  }, null, 544),
                  createBaseVNode("div", _hoisted_26, [
                    createBaseVNode("span", _hoisted_27, "上传：" + toDisplayString(syncUploadCooldownText.value), 1),
                    createBaseVNode("span", _hoisted_28, "下载：" + toDisplayString(syncDownloadCooldownText.value), 1),
                    syncStatusText.value ? (openBlock(), createElementBlock("span", _hoisted_29, toDisplayString(syncStatusText.value), 1)) : createCommentVNode("", true),
                    customCourseExportLocation.value ? (openBlock(), createElementBlock("span", _hoisted_30, "导出位置：" + toDisplayString(customCourseExportLocation.value), 1)) : createCommentVNode("", true)
                  ])
                ]),
                _cache[44] || (_cache[44] = createBaseVNode("div", {
                  class: "drawer-subtitle",
                  "data-step": "5"
                }, "导出数据", -1)),
                createBaseVNode("button", {
                  class: "drawer-action",
                  disabled: exporting.value,
                  onClick: _cache[3] || (_cache[3] = ($event) => exportCalendar("week"))
                }, [
                  _cache[42] || (_cache[42] = createBaseVNode("span", { class: "material-symbols-outlined" }, "calendar_today", -1)),
                  createTextVNode(" " + toDisplayString(exporting.value && exportingMode.value === "week" ? "正在生成..." : "导出本周"), 1)
                ], 8, _hoisted_31),
                createBaseVNode("button", {
                  class: "drawer-action ghost",
                  disabled: exporting.value,
                  onClick: _cache[4] || (_cache[4] = ($event) => exportCalendar("semester"))
                }, [
                  _cache[43] || (_cache[43] = createBaseVNode("span", { class: "material-symbols-outlined" }, "school", -1)),
                  createTextVNode(" " + toDisplayString(exporting.value && exportingMode.value === "semester" ? "正在生成..." : "导出本学期"), 1)
                ], 8, _hoisted_32)
              ]),
              _cache[47] || (_cache[47] = createBaseVNode("div", { class: "drawer-tip" }, "生成后复制链接，用浏览器打开即可导入手机日历", -1)),
              exportUrl.value ? (openBlock(), createElementBlock("div", _hoisted_33, [
                _cache[45] || (_cache[45] = createBaseVNode("div", { class: "export-label" }, "本地导入链接", -1)),
                createBaseVNode("div", _hoisted_34, [
                  createBaseVNode("input", {
                    class: "export-input",
                    type: "text",
                    value: exportUrl.value,
                    readonly: ""
                  }, null, 8, _hoisted_35),
                  createBaseVNode("button", {
                    class: "export-copy",
                    onClick: copyExportUrl
                  }, "复制")
                ]),
                exportCopied.value ? (openBlock(), createElementBlock("div", _hoisted_36, "已复制链接")) : createCommentVNode("", true)
              ])) : createCommentVNode("", true),
              exportError.value ? (openBlock(), createElementBlock("div", _hoisted_37, toDisplayString(exportError.value), 1)) : createCommentVNode("", true)
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }),
        offline.value && initialFetchDone.value && !loading.value ? (openBlock(), createElementBlock("div", _hoisted_38, toDisplayString(offlineBannerText.value), 1)) : createCommentVNode("", true),
        vacationNotice.value ? (openBlock(), createElementBlock("div", _hoisted_39, toDisplayString(vacationNotice.value), 1)) : createCommentVNode("", true),
        errorMsg.value ? (openBlock(), createElementBlock("div", _hoisted_40, toDisplayString(errorMsg.value), 1)) : createCommentVNode("", true),
        createVNode(Transition, { name: "fade" }, {
          default: withCtx(() => [
            showAddCourse.value ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "modal-overlay",
              onClick: closeAddCourseDialog
            }, [
              createBaseVNode("div", {
                class: "modal-content glass add-course-modal",
                onClick: _cache[14] || (_cache[14] = withModifiers(() => {
                }, ["stop"]))
              }, [
                createBaseVNode("div", _hoisted_41, [
                  createBaseVNode("h3", null, toDisplayString(courseDialogMode.value === "edit" ? "修改课程" : "添加课程"), 1),
                  createBaseVNode("button", {
                    class: "close-btn",
                    onClick: closeAddCourseDialog
                  }, "×")
                ]),
                createBaseVNode("div", _hoisted_42, [
                  createBaseVNode("div", _hoisted_43, "学期：" + toDisplayString(courseDialogSemester.value), 1),
                  createBaseVNode("label", _hoisted_44, [
                    _cache[48] || (_cache[48] = createBaseVNode("span", null, "课程名称 *", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => addCourseForm.value.name = $event),
                      type: "text",
                      placeholder: "请输入课程名称"
                    }, null, 512), [
                      [
                        vModelText,
                        addCourseForm.value.name,
                        void 0,
                        { trim: true }
                      ]
                    ])
                  ]),
                  createBaseVNode("label", _hoisted_45, [
                    _cache[49] || (_cache[49] = createBaseVNode("span", null, "教师", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => addCourseForm.value.teacher = $event),
                      type: "text",
                      placeholder: "可选"
                    }, null, 512), [
                      [
                        vModelText,
                        addCourseForm.value.teacher,
                        void 0,
                        { trim: true }
                      ]
                    ])
                  ]),
                  createBaseVNode("label", _hoisted_46, [
                    _cache[50] || (_cache[50] = createBaseVNode("span", null, "上课地点", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => addCourseForm.value.room = $event),
                      type: "text",
                      placeholder: "可选"
                    }, null, 512), [
                      [
                        vModelText,
                        addCourseForm.value.room,
                        void 0,
                        { trim: true }
                      ]
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_47, [
                    _cache[51] || (_cache[51] = createBaseVNode("span", null, "上课时间 *", -1)),
                    createVNode(_component_IOSSelect, {
                      modelValue: addCourseForm.value.weekday,
                      "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => addCourseForm.value.weekday = $event),
                      modelModifiers: { number: true }
                    }, {
                      default: withCtx(() => [
                        (openBlock(), createElementBlock(Fragment, null, renderList(weekDayLabels, (label, idx) => {
                          return createBaseVNode("option", {
                            key: label,
                            value: idx + 1
                          }, toDisplayString(label), 9, _hoisted_48);
                        }), 64))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  createBaseVNode("div", _hoisted_49, [
                    createBaseVNode("label", _hoisted_50, [
                      _cache[52] || (_cache[52] = createBaseVNode("span", null, "开始节次 *", -1)),
                      createVNode(_component_IOSSelect, {
                        modelValue: addCourseForm.value.period,
                        "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => addCourseForm.value.period = $event),
                        modelModifiers: { number: true }
                      }, {
                        default: withCtx(() => [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(unref(periodOptions), (p) => {
                            return openBlock(), createElementBlock("option", {
                              key: p,
                              value: p
                            }, "第" + toDisplayString(p) + "节", 9, _hoisted_51);
                          }), 128))
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ]),
                    createBaseVNode("label", _hoisted_52, [
                      _cache[53] || (_cache[53] = createBaseVNode("span", null, "上课节数 *", -1)),
                      createVNode(_component_IOSSelect, {
                        modelValue: addCourseForm.value.djs,
                        "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => addCourseForm.value.djs = $event),
                        modelModifiers: { number: true }
                      }, {
                        default: withCtx(() => [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(courseSpanOptions.value, (s) => {
                            return openBlock(), createElementBlock("option", {
                              key: s,
                              value: s
                            }, toDisplayString(s) + "节", 9, _hoisted_53);
                          }), 128))
                        ]),
                        _: 1
                      }, 8, ["modelValue"])
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_54, [
                    _cache[54] || (_cache[54] = createBaseVNode("span", null, "上课周次 *", -1)),
                    createBaseVNode("button", {
                      class: "week-picker-trigger",
                      onClick: _cache[12] || (_cache[12] = ($event) => showWeekPicker.value = true)
                    }, toDisplayString(addWeeksCountText.value), 1)
                  ]),
                  createBaseVNode("div", _hoisted_55, [
                    createVNode(CourseColorPicker, {
                      modelValue: addCourseForm.value.color,
                      "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => addCourseForm.value.color = $event)
                    }, null, 8, ["modelValue"])
                  ]),
                  addCourseError.value ? (openBlock(), createElementBlock("div", _hoisted_56, toDisplayString(addCourseError.value), 1)) : createCommentVNode("", true)
                ]),
                createBaseVNode("div", _hoisted_57, [
                  createBaseVNode("button", {
                    class: "drawer-action ghost",
                    disabled: addingCourse.value,
                    onClick: closeAddCourseDialog
                  }, "取消", 8, _hoisted_58),
                  createBaseVNode("button", {
                    class: "drawer-action",
                    disabled: addingCourse.value,
                    onClick: submitAddCourse
                  }, toDisplayString(addingCourse.value ? `正在${courseDialogMode.value === "edit" ? "修改" : "添加"}...` : `${courseDialogMode.value === "edit" ? "修改" : "添加"}并确认`), 9, _hoisted_59)
                ])
              ])
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }),
        createVNode(Transition, { name: "fade" }, {
          default: withCtx(() => [
            showManageCourses.value ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "modal-overlay",
              onClick: closeManageCoursesDialog
            }, [
              createBaseVNode("div", {
                class: "modal-content glass manage-course-modal",
                onClick: _cache[15] || (_cache[15] = withModifiers(() => {
                }, ["stop"]))
              }, [
                createBaseVNode("div", { class: "modal-header" }, [
                  _cache[55] || (_cache[55] = createBaseVNode("h3", null, "管理课程", -1)),
                  createBaseVNode("button", {
                    class: "close-btn",
                    onClick: closeManageCoursesDialog
                  }, "×")
                ]),
                createBaseVNode("div", _hoisted_60, [
                  loadingManageCourses.value ? (openBlock(), createElementBlock("div", _hoisted_61, "正在加载自定义课程...")) : manageCoursesError.value ? (openBlock(), createElementBlock("div", _hoisted_62, toDisplayString(manageCoursesError.value), 1)) : !managedCourseGroups.value.length ? (openBlock(), createElementBlock("div", _hoisted_63, "暂未添加自定义课程")) : (openBlock(), createElementBlock("div", _hoisted_64, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(managedCourseGroups.value, (group) => {
                      return openBlock(), createElementBlock("section", {
                        key: group.semester,
                        class: "manage-course-group"
                      }, [
                        createBaseVNode("button", {
                          class: "manage-course-group-header",
                          onClick: ($event) => toggleManageSemester(group.semester)
                        }, [
                          createBaseVNode("div", _hoisted_66, [
                            createBaseVNode("strong", null, toDisplayString(group.semester), 1),
                            createBaseVNode("span", null, toDisplayString(group.courses.length) + " 门", 1)
                          ]),
                          createBaseVNode("span", _hoisted_67, toDisplayString(manageExpandedSemesters.value[group.semester] ? "收起" : "展开"), 1)
                        ], 8, _hoisted_65),
                        manageExpandedSemesters.value[group.semester] ? (openBlock(), createElementBlock("div", _hoisted_68, [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(group.courses, (course) => {
                            return openBlock(), createElementBlock("article", {
                              key: `${group.semester}-${course.source_id || course.id}`,
                              class: "manage-course-card"
                            }, [
                              createBaseVNode("div", _hoisted_69, [
                                createBaseVNode("div", _hoisted_70, toDisplayString(course.name), 1),
                                createBaseVNode("div", _hoisted_71, toDisplayString(weekDayLabels[(course.weekday || 1) - 1]) + " 第" + toDisplayString(course.period) + "-" + toDisplayString(getCourseEndPeriod(course)) + "节 ", 1),
                                createBaseVNode("div", _hoisted_72, "周次：" + toDisplayString(course.weeks_text), 1),
                                course.teacher || course.room ? (openBlock(), createElementBlock("div", _hoisted_73, toDisplayString([course.teacher, course.room].filter(Boolean).join(" · ")), 1)) : createCommentVNode("", true)
                              ]),
                              createBaseVNode("div", _hoisted_74, [
                                createBaseVNode("button", {
                                  class: "manage-course-btn edit",
                                  onClick: ($event) => openEditCourseDialog(course, { reopenManage: true })
                                }, "修改", 8, _hoisted_75),
                                createBaseVNode("button", {
                                  class: "manage-course-btn delete",
                                  onClick: ($event) => deleteManagedCourse(course)
                                }, "删除", 8, _hoisted_76)
                              ])
                            ]);
                          }), 128))
                        ])) : createCommentVNode("", true)
                      ]);
                    }), 128))
                  ]))
                ])
              ])
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          createVNode(Transition, { name: "sheet-up" }, {
            default: withCtx(() => [
              showWeekPicker.value ? (openBlock(), createElementBlock("div", {
                key: 0,
                class: "week-picker-mask",
                onClick: _cache[17] || (_cache[17] = withModifiers(($event) => showWeekPicker.value = false, ["self"]))
              }, [
                createBaseVNode("div", _hoisted_77, [
                  createBaseVNode("div", { class: "week-picker-header" }, [
                    _cache[56] || (_cache[56] = createBaseVNode("div", { class: "week-picker-title" }, "选择周次", -1)),
                    createBaseVNode("div", { class: "week-picker-ops" }, [
                      createBaseVNode("button", { onClick: selectAllAddCourseWeeks }, "全选"),
                      createBaseVNode("button", { onClick: clearAddCourseWeeks }, "清空")
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_78, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(semesterWeekOptions.value, (week) => {
                      return openBlock(), createElementBlock("button", {
                        key: week,
                        class: normalizeClass(["week-cell", { active: addCourseForm.value.weeks.includes(week) }]),
                        onClick: ($event) => toggleAddCourseWeek(week)
                      }, " 第" + toDisplayString(week) + "周 ", 11, _hoisted_79);
                    }), 128))
                  ]),
                  createBaseVNode("button", {
                    class: "week-picker-confirm",
                    onClick: _cache[16] || (_cache[16] = ($event) => showWeekPicker.value = false)
                  }, "完成")
                ])
              ])) : createCommentVNode("", true)
            ]),
            _: 1
          })
        ])),
        currentWeek.value && selectedWeek.value && selectedWeek.value !== currentWeek.value ? (openBlock(), createElementBlock("button", {
          key: 3,
          class: "jump-current-btn",
          onClick: jumpToCurrentWeek,
          title: "跳转到当前周"
        }, " 回到当前周 ")) : createCommentVNode("", true),
        createVNode(Transition, {
          name: weekTransitionName.value,
          mode: "out-in"
        }, {
          default: withCtx(() => [
            (openBlock(), createElementBlock("div", {
              class: "timetable-container",
              key: `week-${selectedWeek.value}`
            }, [
              createBaseVNode("div", _hoisted_80, [
                createBaseVNode("div", _hoisted_81, [
                  createBaseVNode("span", _hoisted_82, toDisplayString(currentMonth.value), 1),
                  _cache[57] || (_cache[57] = createBaseVNode("span", { class: "month-label" }, "月", -1))
                ]),
                createBaseVNode("div", _hoisted_83, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(weekDates.value, (d, index) => {
                    return openBlock(), createElementBlock("div", {
                      key: index,
                      class: normalizeClass(["day-col", { "is-today": d.isToday }])
                    }, [
                      createBaseVNode("div", _hoisted_84, toDisplayString(d.date), 1),
                      createBaseVNode("div", _hoisted_85, toDisplayString(d.dayLabel), 1)
                    ], 2);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_86, [
                createBaseVNode("div", _hoisted_87, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(timeSchedule, (t) => {
                    return createBaseVNode("div", {
                      key: t.p,
                      class: "time-slot"
                    }, [
                      createBaseVNode("span", _hoisted_88, toDisplayString(t.start), 1),
                      createBaseVNode("span", _hoisted_89, toDisplayString(t.p), 1),
                      createBaseVNode("span", _hoisted_90, toDisplayString(t.end), 1)
                    ]);
                  }), 64))
                ]),
                (openBlock(), createElementBlock("div", {
                  class: "courses-grid",
                  key: `courses-grid-${scheduleCourseCardStyle.value}-${courseCardRefreshNonce.value}`
                }, [
                  createBaseVNode("div", _hoisted_91, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(11, (i) => {
                      return createBaseVNode("div", {
                        key: i,
                        class: "line-row"
                      });
                    }), 64))
                  ]),
                  (openBlock(), createElementBlock(Fragment, null, renderList(7, (day) => {
                    return createBaseVNode("div", {
                      key: day,
                      class: normalizeClass(["day-column", { "is-today-column": isTodayColumn(day) }])
                    }, [
                      (openBlock(true), createElementBlock(Fragment, null, renderList(getCoursesForDay(day), (course) => {
                        return openBlock(), createElementBlock("div", {
                          key: course._uid || course.id,
                          class: normalizeClass(["course-card", [
                            `course-card--${scheduleCourseCardStyle.value}`,
                            { conflict: course.is_conflict },
                            { "widget-highlight": isWidgetHighlighted(course, day) }
                          ]]),
                          style: normalizeStyle(getCourseStyle(course)),
                          onClick: ($event) => openDetail(course)
                        }, [
                          createBaseVNode("div", _hoisted_93, toDisplayString(course.name), 1),
                          createBaseVNode("div", _hoisted_94, toDisplayString(course.is_conflict ? "点击查看冲突课程详情" : course.room_code || course.room), 1),
                          scheduleCourseCardStyle.value === "class" && !course.is_conflict ? (openBlock(), createElementBlock("div", _hoisted_95, toDisplayString(course.teacher || "未标注教师"), 1)) : createCommentVNode("", true)
                        ], 14, _hoisted_92);
                      }), 128))
                    ], 2);
                  }), 64))
                ]))
              ])
            ]))
          ]),
          _: 1
        }, 8, ["name"]),
        createVNode(Transition, { name: "fade" }, {
          default: withCtx(() => [
            showDetail.value ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "modal-overlay",
              onClick: _cache[23] || (_cache[23] = ($event) => showDetail.value = false)
            }, [
              createBaseVNode("div", {
                class: "modal-content glass",
                onClick: _cache[22] || (_cache[22] = withModifiers(() => {
                }, ["stop"]))
              }, [
                createBaseVNode("div", _hoisted_96, [
                  createBaseVNode("h3", null, toDisplayString(selectedCourse.value?.name), 1),
                  createBaseVNode("button", {
                    class: "close-btn",
                    onClick: _cache[18] || (_cache[18] = ($event) => showDetail.value = false)
                  }, "×")
                ]),
                selectedCourse.value?.is_conflict ? (openBlock(), createElementBlock("div", _hoisted_97, [
                  _cache[58] || (_cache[58] = createBaseVNode("div", { class: "conflict-hint" }, "当前时段存在多个课程重叠，请按下列信息核对。", -1)),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(selectedCourse.value?.conflict_courses || [], (item, idx) => {
                    return openBlock(), createElementBlock("div", {
                      key: `${item.id || item.name}-${idx}`,
                      class: normalizeClass(["conflict-item", { clickable: item.is_custom }]),
                      onClick: ($event) => item.is_custom && openConflictCourseDetail(item)
                    }, [
                      createBaseVNode("div", _hoisted_99, [
                        createTextVNode(toDisplayString(idx + 1) + ". " + toDisplayString(item.name) + " ", 1),
                        item.is_custom ? (openBlock(), createElementBlock("span", _hoisted_100, "自定义")) : createCommentVNode("", true)
                      ]),
                      createBaseVNode("div", _hoisted_101, "教师：" + toDisplayString(item.teacher || "未填写"), 1),
                      createBaseVNode("div", _hoisted_102, " 地点：" + toDisplayString([item.building, item.room || item.room_code].filter(Boolean).join(" ") || "未填写"), 1),
                      createBaseVNode("div", _hoisted_103, " 时间：周" + toDisplayString(item.weekday) + " 第" + toDisplayString(item.period) + "-" + toDisplayString(getCourseEndPeriod(item)) + "节 ", 1)
                    ], 10, _hoisted_98);
                  }), 128))
                ])) : (openBlock(), createElementBlock("div", _hoisted_104, [
                  selectedCourse.value?.is_custom ? (openBlock(), createElementBlock("div", _hoisted_105, [..._cache[59] || (_cache[59] = [
                    createBaseVNode("span", { class: "label" }, "类型", -1),
                    createBaseVNode("span", { class: "value" }, "自定义课程", -1)
                  ])])) : createCommentVNode("", true),
                  createBaseVNode("div", _hoisted_106, [
                    _cache[60] || (_cache[60] = createBaseVNode("span", { class: "label" }, "教师", -1)),
                    createBaseVNode("span", _hoisted_107, toDisplayString(selectedCourse.value?.teacher), 1)
                  ]),
                  createBaseVNode("div", _hoisted_108, [
                    _cache[61] || (_cache[61] = createBaseVNode("span", { class: "label" }, "教室", -1)),
                    createBaseVNode("span", _hoisted_109, toDisplayString(selectedCourse.value?.room) + " (" + toDisplayString(selectedCourse.value?.building) + ")", 1)
                  ]),
                  createBaseVNode("div", _hoisted_110, [
                    _cache[62] || (_cache[62] = createBaseVNode("span", { class: "label" }, "时间", -1)),
                    createBaseVNode("span", _hoisted_111, "周" + toDisplayString(selectedCourse.value?.weekday) + " 第" + toDisplayString(selectedCourse.value?.period) + "-" + toDisplayString(getCourseEndPeriod(selectedCourse.value)) + "节", 1)
                  ]),
                  createBaseVNode("div", _hoisted_112, [
                    _cache[63] || (_cache[63] = createBaseVNode("span", { class: "label" }, "周次", -1)),
                    createBaseVNode("span", _hoisted_113, toDisplayString(selectedCourse.value?.weeks_text) + "周", 1)
                  ]),
                  createBaseVNode("div", _hoisted_114, [
                    _cache[64] || (_cache[64] = createBaseVNode("span", { class: "label" }, "学分", -1)),
                    createBaseVNode("span", _hoisted_115, toDisplayString(selectedCourse.value?.credit), 1)
                  ]),
                  createBaseVNode("div", _hoisted_116, [
                    _cache[65] || (_cache[65] = createBaseVNode("span", { class: "label" }, "教学班", -1)),
                    createBaseVNode("span", _hoisted_117, toDisplayString(selectedCourse.value?.class_name), 1)
                  ]),
                  selectedCourse.value?.is_custom ? (openBlock(), createElementBlock("div", _hoisted_118, [
                    createBaseVNode("button", {
                      class: "custom-delete-btn edit",
                      onClick: _cache[19] || (_cache[19] = ($event) => openEditCourseDialog(selectedCourse.value, { reopenDetail: true }))
                    }, "修改课程"),
                    createBaseVNode("button", {
                      class: "custom-delete-btn week",
                      onClick: _cache[20] || (_cache[20] = ($event) => deleteCustomCourse("current_week"))
                    }, "删除这一周"),
                    createBaseVNode("button", {
                      class: "custom-delete-btn all",
                      onClick: _cache[21] || (_cache[21] = ($event) => deleteCustomCourse("all"))
                    }, "删除全部周次")
                  ])) : createCommentVNode("", true)
                ])),
                createBaseVNode("div", _hoisted_119, [
                  createBaseVNode("button", {
                    class: "detail-copy-btn",
                    onClick: copySelectedCourseDetail
                  }, toDisplayString(selectedCourse.value?.is_conflict ? "复制冲突详情" : "复制详情"), 1)
                ]),
                detailActionError.value ? (openBlock(), createElementBlock("div", _hoisted_120, toDisplayString(detailActionError.value), 1)) : createCommentVNode("", true)
              ])
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        }),
        createVNode(Transition, { name: "fade" }, {
          default: withCtx(() => [
            showConfirmDialog.value ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: "modal-overlay confirm-overlay",
              onClick: _cache[27] || (_cache[27] = ($event) => closeConfirmDialog(false))
            }, [
              createBaseVNode("div", {
                class: "modal-content confirm-modal",
                onClick: _cache[26] || (_cache[26] = withModifiers(() => {
                }, ["stop"]))
              }, [
                createBaseVNode("div", _hoisted_121, toDisplayString(confirmDialogTitle.value), 1),
                createBaseVNode("div", _hoisted_122, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(confirmDialogLines.value, (line, idx) => {
                    return openBlock(), createElementBlock("p", {
                      key: `confirm-${idx}`
                    }, toDisplayString(line), 1);
                  }), 128))
                ]),
                createBaseVNode("div", _hoisted_123, [
                  createBaseVNode("button", {
                    class: "confirm-btn cancel",
                    onClick: _cache[24] || (_cache[24] = ($event) => closeConfirmDialog(false))
                  }, toDisplayString(confirmDialogCancelText.value), 1),
                  createBaseVNode("button", {
                    class: normalizeClass(["confirm-btn", { danger: confirmDialogDanger.value }]),
                    onClick: _cache[25] || (_cache[25] = ($event) => closeConfirmDialog(true))
                  }, toDisplayString(confirmDialogConfirmText.value), 3)
                ])
              ])
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        })
      ], 32);
    };
  }
};
const ScheduleView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-5afa927f"]]);
export {
  ScheduleView as default
};
