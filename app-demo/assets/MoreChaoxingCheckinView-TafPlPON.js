import { c as createElementBlock, b as openBlock, f as createCommentVNode, s as renderSlot, g as createTextVNode, t as toDisplayString, n as normalizeClass, d as createBaseVNode, q as createVNode, u as unref, e as computed, k as createBlock, F as Fragment, i as renderList, l as withCtx, C as withDirectives, a as ref, D as vModelText, o as onMounted, m as onBeforeUnmount, h as normalizeStyle, v as Teleport, T as Transition } from "./vue-core-DdLVj9yW.js";
import { _ as _sfc_main$a } from "./TPageHeader-D5pZCgZr.js";
import { _ as _export_sfc, aj as TModal } from "./app-demo-CxKBY5JQ.js";
import { T as TEmptyState } from "./TEmptyState-BSfdOG3N.js";
import { T as TStatusBadge } from "./TStatusBadge-8FuTyS87.js";
import { u as useGeolocation } from "./useGeolocation-D7J63RN2.js";
import { b as isTauriRuntime, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./debug-tools-CObt9e11.js";
import "./capture-DZL0crXj.js";
const _hoisted_1$8 = {
  key: 0,
  class: "t-section__title"
};
const _hoisted_2$7 = {
  key: 0,
  class: "t-section__icon"
};
const _hoisted_3$7 = {
  key: 1,
  class: "t-section__badge"
};
const _sfc_main$9 = {
  __name: "TSection",
  props: {
    title: { type: String, default: "" },
    icon: { type: String, default: "" },
    flush: { type: Boolean, default: false }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(["t-section", { "t-section--flush": __props.flush }])
      }, [
        __props.title ? (openBlock(), createElementBlock("h4", _hoisted_1$8, [
          __props.icon ? (openBlock(), createElementBlock("span", _hoisted_2$7, toDisplayString(__props.icon), 1)) : createCommentVNode("", true),
          createTextVNode(" " + toDisplayString(__props.title) + " ", 1),
          _ctx.$slots.badge ? (openBlock(), createElementBlock("span", _hoisted_3$7, [
            renderSlot(_ctx.$slots, "badge", {}, void 0, true)
          ])) : createCommentVNode("", true)
        ])) : createCommentVNode("", true),
        renderSlot(_ctx.$slots, "default", {}, void 0, true)
      ], 2);
    };
  }
};
const TSection = /* @__PURE__ */ _export_sfc(_sfc_main$9, [["__scopeId", "data-v-c227bf67"]]);
const _hoisted_1$7 = {
  key: 0,
  class: "session-banner"
};
const _sfc_main$8 = {
  __name: "SessionStatusBanner",
  props: {
    connected: { type: Boolean, default: false }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return !__props.connected ? (openBlock(), createElementBlock("div", _hoisted_1$7, [
        _cache[0] || (_cache[0] = createBaseVNode("div", { class: "session-banner__icon" }, "⚠️", -1)),
        _cache[1] || (_cache[1] = createBaseVNode("div", { class: "session-banner__content" }, [
          createBaseVNode("p", { class: "session-banner__title" }, "学习通未连接"),
          createBaseVNode("p", { class: "session-banner__desc" }, "请先在「在线学习」模块登录学习通账号，签到功能依赖已有会话。")
        ], -1)),
        createVNode(unref(TStatusBadge), {
          type: "warning",
          text: "未连接"
        })
      ])) : createCommentVNode("", true);
    };
  }
};
const SessionStatusBanner = /* @__PURE__ */ _export_sfc(_sfc_main$8, [["__scopeId", "data-v-055b44fa"]]);
const _hoisted_1$6 = { class: "activity-card glass-card" };
const _hoisted_2$6 = { class: "activity-card__head" };
const _hoisted_3$6 = { class: "activity-card__icon" };
const _hoisted_4$6 = { class: "activity-card__info" };
const _hoisted_5$6 = { class: "activity-card__course" };
const _hoisted_6$6 = { class: "activity-card__meta" };
const _hoisted_7$3 = {
  key: 0,
  class: "activity-card__time"
};
const _hoisted_8$2 = { class: "activity-card__actions" };
const _hoisted_9$2 = ["disabled"];
const _sfc_main$7 = {
  __name: "CheckinActivityCard",
  props: {
    activity: { type: Object, required: true },
    inflight: { type: Boolean, default: false }
  },
  emits: ["action"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const typeLabel = computed(() => {
      const map = {
        normal: "普通签到",
        location: "位置签到",
        photo: "拍照签到",
        qrcode: "二维码签到",
        gesture: "手势签到"
      };
      return map[props.activity.activity_type] || "签到";
    });
    const typeIcon = computed(() => {
      const map = {
        normal: "✋",
        location: "📍",
        photo: "📷",
        qrcode: "📱",
        gesture: "✍️"
      };
      return map[props.activity.activity_type] || "✅";
    });
    const statusBadgeType = computed(() => {
      const map = {
        active: "success",
        pending: "info",
        signed: "muted",
        expired: "danger"
      };
      return map[props.activity.status] || "muted";
    });
    const statusLabel = computed(() => {
      const map = {
        active: "进行中",
        pending: "待开始",
        signed: "已签到",
        expired: "已过期"
      };
      return map[props.activity.status] || "未知";
    });
    const actionDisabled = computed(() => {
      return props.inflight || props.activity.status !== "active";
    });
    const actionText = computed(() => {
      if (props.inflight) return "提交中...";
      if (props.activity.status === "signed") return "已签";
      if (props.activity.status === "expired") return "已过期";
      return "签到";
    });
    const formatTime = (ts) => {
      if (!ts) return "";
      const d = new Date(ts * 1e3);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    };
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$6, [
        createBaseVNode("div", _hoisted_2$6, [
          createBaseVNode("span", _hoisted_3$6, toDisplayString(typeIcon.value), 1),
          createBaseVNode("div", _hoisted_4$6, [
            createBaseVNode("p", _hoisted_5$6, toDisplayString(__props.activity.course_name), 1),
            createBaseVNode("p", _hoisted_6$6, [
              createTextVNode(toDisplayString(typeLabel.value) + " · " + toDisplayString(__props.activity.teacher_name) + " ", 1),
              __props.activity.start_time ? (openBlock(), createElementBlock("span", _hoisted_7$3, toDisplayString(formatTime(__props.activity.start_time)), 1)) : createCommentVNode("", true)
            ])
          ]),
          createVNode(unref(TStatusBadge), {
            type: statusBadgeType.value,
            text: statusLabel.value
          }, null, 8, ["type", "text"])
        ]),
        createBaseVNode("div", _hoisted_8$2, [
          createBaseVNode("button", {
            class: "activity-card__btn",
            disabled: actionDisabled.value,
            onClick: _cache[0] || (_cache[0] = ($event) => emit("action"))
          }, toDisplayString(actionText.value), 9, _hoisted_9$2)
        ])
      ]);
    };
  }
};
const CheckinActivityCard = /* @__PURE__ */ _export_sfc(_sfc_main$7, [["__scopeId", "data-v-a3e24dec"]]);
const _hoisted_1$5 = { class: "history-list" };
const _hoisted_2$5 = {
  key: 1,
  class: "history-list__items"
};
const _hoisted_3$5 = { class: "history-item__head" };
const _hoisted_4$5 = { class: "history-item__course" };
const _hoisted_5$5 = { class: "history-item__meta" };
const _hoisted_6$5 = {
  key: 0,
  class: "history-item__error"
};
const _sfc_main$6 = {
  __name: "CheckinHistoryList",
  props: {
    entries: { type: Array, default: () => [] }
  },
  setup(__props) {
    const props = __props;
    const maskStudentId = (id) => {
      if (!id || id.length < 4) return "****";
      return id.slice(0, 2) + "****" + id.slice(-2);
    };
    const typeLabel = (type) => {
      const map = {
        normal: "普通",
        location: "位置",
        photo: "拍照",
        qrcode: "二维码",
        gesture: "手势"
      };
      return map[type] || "签到";
    };
    const resultBadgeType = (result) => {
      if (result === "success") return "success";
      if (result === "already_signed") return "muted";
      return "danger";
    };
    const resultLabel = (result) => {
      if (result === "success") return "成功";
      if (result === "already_signed") return "已签";
      return "失败";
    };
    const formatTime = (ts) => {
      if (!ts) return "";
      const d = new Date(ts * 1e3);
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${month}/${day} ${hh}:${mm}`;
    };
    const sortedEntries = computed(() => {
      return [...props.entries].sort((a, b) => (b.submitted_at || 0) - (a.submitted_at || 0));
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$5, [
        !sortedEntries.value.length ? (openBlock(), createBlock(unref(TEmptyState), {
          key: 0,
          type: "empty",
          message: "暂无签到记录",
          icon: "📋"
        })) : (openBlock(), createElementBlock("div", _hoisted_2$5, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(sortedEntries.value, (entry) => {
            return openBlock(), createElementBlock("div", {
              key: `${entry.active_id}-${entry.submitted_at}`,
              class: "history-item glass-card"
            }, [
              createBaseVNode("div", _hoisted_3$5, [
                createBaseVNode("span", _hoisted_4$5, toDisplayString(entry.course_name), 1),
                createVNode(unref(TStatusBadge), {
                  type: resultBadgeType(entry.result),
                  text: resultLabel(entry.result)
                }, null, 8, ["type", "text"])
              ]),
              createBaseVNode("div", _hoisted_5$5, [
                createBaseVNode("span", null, toDisplayString(typeLabel(entry.activity_type)), 1),
                _cache[0] || (_cache[0] = createBaseVNode("span", { class: "history-item__sep" }, "·", -1)),
                createBaseVNode("span", null, toDisplayString(maskStudentId(entry.student_id)), 1),
                _cache[1] || (_cache[1] = createBaseVNode("span", { class: "history-item__sep" }, "·", -1)),
                createBaseVNode("span", null, toDisplayString(formatTime(entry.submitted_at)), 1)
              ]),
              entry.error_message && entry.result === "failure" ? (openBlock(), createElementBlock("p", _hoisted_6$5, toDisplayString(entry.error_message), 1)) : createCommentVNode("", true)
            ]);
          }), 128))
        ]))
      ]);
    };
  }
};
const CheckinHistoryList = /* @__PURE__ */ _export_sfc(_sfc_main$6, [["__scopeId", "data-v-ae92894b"]]);
const _hoisted_1$4 = { class: "location-modal" };
const _hoisted_2$4 = { class: "location-modal__row" };
const _hoisted_3$4 = { class: "location-modal__row" };
const _hoisted_4$4 = { class: "location-modal__row" };
const _hoisted_5$4 = ["disabled"];
const _hoisted_6$4 = {
  key: 1,
  class: "location-modal__error"
};
const _hoisted_7$2 = ["disabled"];
const _sfc_main$5 = {
  __name: "LocationCheckinModal",
  props: {
    visible: { type: Boolean, default: false }
  },
  emits: ["close", "submit"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { available: geoAvailable, loading: geoLoading, getCurrentPosition } = useGeolocation();
    const latitude = ref("");
    const longitude = ref("");
    const address = ref("");
    const error = ref("");
    const submitting = ref(false);
    const handleGeolocate = async () => {
      error.value = "";
      try {
        const pos = await getCurrentPosition();
        latitude.value = String(pos.latitude);
        longitude.value = String(pos.longitude);
      } catch (err) {
        error.value = err instanceof Error ? err.message : "定位失败";
      }
    };
    const handleSubmit = () => {
      const lat = parseFloat(latitude.value);
      const lng = parseFloat(longitude.value);
      const addr = address.value.trim();
      if (isNaN(lat) || isNaN(lng)) {
        error.value = "请输入有效的经纬度";
        return;
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        error.value = "经纬度超出有效范围";
        return;
      }
      if (!addr) {
        error.value = "请输入地址描述";
        return;
      }
      error.value = "";
      submitting.value = true;
      emit("submit", { latitude: lat, longitude: lng, address: addr });
      submitting.value = false;
    };
    const handleClose = () => {
      error.value = "";
      emit("close");
    };
    return (_ctx, _cache) => {
      return openBlock(), createBlock(unref(TModal), {
        visible: __props.visible,
        title: "位置签到",
        width: "380px",
        onClose: handleClose
      }, {
        footer: withCtx(() => [
          createBaseVNode("button", {
            class: "modal-btn modal-btn--cancel",
            onClick: handleClose
          }, "取消"),
          createBaseVNode("button", {
            class: "modal-btn modal-btn--primary",
            disabled: submitting.value,
            onClick: handleSubmit
          }, " 确认签到 ", 8, _hoisted_7$2)
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_1$4, [
            createBaseVNode("div", _hoisted_2$4, [
              _cache[3] || (_cache[3] = createBaseVNode("label", { class: "location-modal__label" }, "纬度", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => latitude.value = $event),
                class: "location-modal__input",
                type: "text",
                inputmode: "decimal",
                placeholder: "例：30.5728"
              }, null, 512), [
                [vModelText, latitude.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_3$4, [
              _cache[4] || (_cache[4] = createBaseVNode("label", { class: "location-modal__label" }, "经度", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => longitude.value = $event),
                class: "location-modal__input",
                type: "text",
                inputmode: "decimal",
                placeholder: "例：114.3162"
              }, null, 512), [
                [vModelText, longitude.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_4$4, [
              _cache[5] || (_cache[5] = createBaseVNode("label", { class: "location-modal__label" }, "地址", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => address.value = $event),
                class: "location-modal__input",
                type: "text",
                placeholder: "例：湖北工业大学图书馆"
              }, null, 512), [
                [vModelText, address.value]
              ])
            ]),
            unref(geoAvailable) ? (openBlock(), createElementBlock("button", {
              key: 0,
              class: "location-modal__geo-btn",
              disabled: unref(geoLoading),
              onClick: handleGeolocate
            }, toDisplayString(unref(geoLoading) ? "定位中..." : "📍 获取当前位置"), 9, _hoisted_5$4)) : createCommentVNode("", true),
            error.value ? (openBlock(), createElementBlock("p", _hoisted_6$4, toDisplayString(error.value), 1)) : createCommentVNode("", true)
          ])
        ]),
        _: 1
      }, 8, ["visible"]);
    };
  }
};
const LocationCheckinModal = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["__scopeId", "data-v-899119f0"]]);
function useQrScanner() {
  const cameraAvailable = ref(false);
  const scanning = ref(false);
  const lastError = ref("");
  function detectCamera() {
    if (typeof navigator === "undefined") return false;
    if (/android|iphone|ipad|ipod/i.test(navigator.userAgent)) {
      cameraAvailable.value = true;
      return true;
    }
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
      cameraAvailable.value = true;
      return true;
    }
    cameraAvailable.value = false;
    return false;
  }
  async function scanFromFileInput(inputEl) {
    scanning.value = true;
    lastError.value = "";
    return new Promise((resolve) => {
      const handler = () => {
        inputEl.removeEventListener("change", handler);
        scanning.value = false;
        const file = inputEl.files?.[0] ?? null;
        if (!file) {
          lastError.value = "未选择图片";
          resolve(null);
          return;
        }
        resolve(file);
      };
      inputEl.addEventListener("change", handler);
      inputEl.click();
    });
  }
  detectCamera();
  return {
    cameraAvailable,
    scanning,
    lastError,
    detectCamera,
    scanFromFileInput
  };
}
const _hoisted_1$3 = { class: "photo-modal" };
const _hoisted_2$3 = ["src"];
const _hoisted_3$3 = {
  key: 1,
  class: "photo-modal__placeholder"
};
const _hoisted_4$3 = ["capture"];
const _hoisted_5$3 = {
  key: 0,
  class: "photo-modal__error"
};
const _hoisted_6$3 = ["disabled"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const _sfc_main$4 = {
  __name: "PhotoCheckinModal",
  props: {
    visible: { type: Boolean, default: false }
  },
  emits: ["close", "submit"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const { cameraAvailable } = useQrScanner();
    const fileInputRef = ref(null);
    const preview = ref("");
    const selectedFile = ref(null);
    const error = ref("");
    const submitting = ref(false);
    const handleFileChange = (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      if (file.size > MAX_FILE_SIZE) {
        error.value = "图片大小不能超过 10MB";
        return;
      }
      if (!file.type.startsWith("image/")) {
        error.value = "请选择图片文件";
        return;
      }
      error.value = "";
      selectedFile.value = file;
      preview.value = URL.createObjectURL(file);
    };
    const handleSubmit = async () => {
      if (!selectedFile.value) {
        error.value = "请先选择照片";
        return;
      }
      submitting.value = true;
      error.value = "";
      try {
        const buffer = await selectedFile.value.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        emit("submit", {
          bytes,
          mime: selectedFile.value.type || "image/jpeg",
          name: selectedFile.value.name || "photo.jpg"
        });
      } catch (err) {
        error.value = err instanceof Error ? err.message : "读取文件失败";
      } finally {
        submitting.value = false;
      }
    };
    const handleClose = () => {
      error.value = "";
      preview.value = "";
      selectedFile.value = null;
      if (fileInputRef.value) fileInputRef.value.value = "";
      emit("close");
    };
    return (_ctx, _cache) => {
      return openBlock(), createBlock(unref(TModal), {
        visible: __props.visible,
        title: "拍照签到",
        width: "380px",
        onClose: handleClose
      }, {
        footer: withCtx(() => [
          createBaseVNode("button", {
            class: "modal-btn modal-btn--cancel",
            onClick: handleClose
          }, "取消"),
          createBaseVNode("button", {
            class: "modal-btn modal-btn--primary",
            disabled: submitting.value || !selectedFile.value,
            onClick: handleSubmit
          }, toDisplayString(submitting.value ? "上传中..." : "确认签到"), 9, _hoisted_6$3)
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_1$3, [
            createBaseVNode("div", {
              class: "photo-modal__preview",
              onClick: _cache[0] || (_cache[0] = ($event) => fileInputRef.value?.click())
            }, [
              preview.value ? (openBlock(), createElementBlock("img", {
                key: 0,
                src: preview.value,
                class: "photo-modal__img",
                alt: "预览"
              }, null, 8, _hoisted_2$3)) : (openBlock(), createElementBlock("div", _hoisted_3$3, [..._cache[1] || (_cache[1] = [
                createBaseVNode("span", { class: "photo-modal__placeholder-icon" }, "📷", -1),
                createBaseVNode("span", null, "点击选择照片", -1)
              ])]))
            ]),
            createBaseVNode("input", {
              ref_key: "fileInputRef",
              ref: fileInputRef,
              type: "file",
              accept: "image/*",
              capture: unref(cameraAvailable) ? "environment" : void 0,
              class: "photo-modal__file-input",
              onChange: handleFileChange
            }, null, 40, _hoisted_4$3),
            error.value ? (openBlock(), createElementBlock("p", _hoisted_5$3, toDisplayString(error.value), 1)) : createCommentVNode("", true)
          ])
        ]),
        _: 1
      }, 8, ["visible"]);
    };
  }
};
const PhotoCheckinModal = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-3c6e3fa4"]]);
const _hoisted_1$2 = { class: "gesture-modal" };
const _hoisted_2$2 = { class: "gesture-modal__mode-switch" };
const _hoisted_3$2 = {
  key: 0,
  class: "gesture-grid"
};
const _hoisted_4$2 = ["onClick"];
const _hoisted_5$2 = { class: "gesture-dot__label" };
const _hoisted_6$2 = {
  key: 0,
  class: "gesture-dot__order"
};
const _hoisted_7$1 = {
  key: 1,
  class: "gesture-number"
};
const _hoisted_8$1 = {
  key: 2,
  class: "gesture-modal__preview"
};
const _hoisted_9$1 = {
  key: 4,
  class: "gesture-modal__error"
};
const _hoisted_10$1 = ["disabled"];
const _sfc_main$3 = {
  __name: "GestureCheckinModal",
  props: {
    visible: { type: Boolean, default: false }
  },
  emits: ["close", "submit"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const mode = ref("grid");
    const selectedDots = ref([]);
    const numberInput = ref("");
    const error = ref("");
    const submitting = ref(false);
    const GRID_DOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const patternString = computed(() => {
      if (mode.value === "number") return numberInput.value.trim();
      return selectedDots.value.join("");
    });
    const handleDotClick = (dot) => {
      if (selectedDots.value.includes(dot)) return;
      selectedDots.value = [...selectedDots.value, dot];
    };
    const handleClearGrid = () => {
      selectedDots.value = [];
    };
    const handleSubmit = () => {
      const pattern = patternString.value;
      if (!pattern || pattern.length < 3) {
        error.value = "手势至少需要连接 3 个点";
        return;
      }
      if (!/^[1-9]+$/.test(pattern)) {
        error.value = "手势格式无效，仅允许 1-9 的数字";
        return;
      }
      error.value = "";
      submitting.value = true;
      emit("submit", pattern);
      submitting.value = false;
    };
    const handleClose = () => {
      error.value = "";
      selectedDots.value = [];
      numberInput.value = "";
      emit("close");
    };
    return (_ctx, _cache) => {
      return openBlock(), createBlock(unref(TModal), {
        visible: __props.visible,
        title: "手势签到",
        width: "360px",
        onClose: handleClose
      }, {
        footer: withCtx(() => [
          createBaseVNode("button", {
            class: "modal-btn modal-btn--cancel",
            onClick: handleClose
          }, "取消"),
          createBaseVNode("button", {
            class: "modal-btn modal-btn--primary",
            disabled: submitting.value,
            onClick: handleSubmit
          }, " 确认签到 ", 8, _hoisted_10$1)
        ]),
        default: withCtx(() => [
          createBaseVNode("div", _hoisted_1$2, [
            createBaseVNode("div", _hoisted_2$2, [
              createBaseVNode("button", {
                class: normalizeClass(["gesture-mode-btn", { "gesture-mode-btn--active": mode.value === "grid" }]),
                onClick: _cache[0] || (_cache[0] = ($event) => mode.value = "grid")
              }, " 九宫格 ", 2),
              createBaseVNode("button", {
                class: normalizeClass(["gesture-mode-btn", { "gesture-mode-btn--active": mode.value === "number" }]),
                onClick: _cache[1] || (_cache[1] = ($event) => mode.value = "number")
              }, " 数字输入 ", 2)
            ]),
            mode.value === "grid" ? (openBlock(), createElementBlock("div", _hoisted_3$2, [
              (openBlock(), createElementBlock(Fragment, null, renderList(GRID_DOTS, (dot) => {
                return createBaseVNode("button", {
                  key: dot,
                  class: normalizeClass(["gesture-dot", { "gesture-dot--selected": selectedDots.value.includes(dot) }]),
                  onClick: ($event) => handleDotClick(dot)
                }, [
                  createBaseVNode("span", _hoisted_5$2, toDisplayString(dot), 1),
                  selectedDots.value.includes(dot) ? (openBlock(), createElementBlock("span", _hoisted_6$2, toDisplayString(selectedDots.value.indexOf(dot) + 1), 1)) : createCommentVNode("", true)
                ], 10, _hoisted_4$2);
              }), 64))
            ])) : (openBlock(), createElementBlock("div", _hoisted_7$1, [
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => numberInput.value = $event),
                class: "gesture-number__input",
                type: "text",
                inputmode: "numeric",
                placeholder: "输入手势数字序列，如 14789",
                maxlength: "9"
              }, null, 512), [
                [vModelText, numberInput.value]
              ]),
              _cache[3] || (_cache[3] = createBaseVNode("p", { class: "gesture-number__hint" }, "数字 1-9 对应九宫格从左上到右下的位置", -1))
            ])),
            patternString.value ? (openBlock(), createElementBlock("div", _hoisted_8$1, [
              _cache[4] || (_cache[4] = createTextVNode(" 当前手势：", -1)),
              createBaseVNode("strong", null, toDisplayString(patternString.value), 1)
            ])) : createCommentVNode("", true),
            mode.value === "grid" && selectedDots.value.length ? (openBlock(), createElementBlock("button", {
              key: 3,
              class: "gesture-clear-btn",
              onClick: handleClearGrid
            }, " 清除重选 ")) : createCommentVNode("", true),
            error.value ? (openBlock(), createElementBlock("p", _hoisted_9$1, toDisplayString(error.value), 1)) : createCommentVNode("", true)
          ])
        ]),
        _: 1
      }, 8, ["visible"]);
    };
  }
};
const GestureCheckinModal = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-adb92c6f"]]);
const _sfc_main$2 = {
  __name: "QrScreenSelectOverlay",
  emits: ["select", "cancel"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const overlayRef = ref(null);
    const dragging = ref(false);
    const startX = ref(0);
    const startY = ref(0);
    const currentX = ref(0);
    const currentY = ref(0);
    const rectStyle = () => {
      if (!dragging.value) return { display: "none" };
      const x = Math.min(startX.value, currentX.value);
      const y = Math.min(startY.value, currentY.value);
      const w = Math.abs(currentX.value - startX.value);
      const h = Math.abs(currentY.value - startY.value);
      return {
        left: `${x}px`,
        top: `${y}px`,
        width: `${w}px`,
        height: `${h}px`
      };
    };
    const handleMouseDown = (e) => {
      dragging.value = true;
      startX.value = e.clientX;
      startY.value = e.clientY;
      currentX.value = e.clientX;
      currentY.value = e.clientY;
    };
    const handleMouseMove = (e) => {
      if (!dragging.value) return;
      currentX.value = e.clientX;
      currentY.value = e.clientY;
    };
    const handleMouseUp = () => {
      if (!dragging.value) return;
      dragging.value = false;
      const x = Math.min(startX.value, currentX.value);
      const y = Math.min(startY.value, currentY.value);
      const w = Math.abs(currentX.value - startX.value);
      const h = Math.abs(currentY.value - startY.value);
      if (w < 20 || h < 20) {
        emit("cancel");
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      emit("select", {
        x: Math.round(x * dpr),
        y: Math.round(y * dpr),
        w: Math.round(w * dpr),
        h: Math.round(h * dpr)
      });
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        emit("cancel");
      }
    };
    onMounted(() => {
      document.addEventListener("keydown", handleKeyDown);
    });
    onBeforeUnmount(() => {
      document.removeEventListener("keydown", handleKeyDown);
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        createBaseVNode("div", {
          ref_key: "overlayRef",
          ref: overlayRef,
          class: "screen-select-overlay",
          onMousedown: handleMouseDown,
          onMousemove: handleMouseMove,
          onMouseup: handleMouseUp
        }, [
          _cache[0] || (_cache[0] = createBaseVNode("div", { class: "screen-select-overlay__hint" }, " 拖拽选择包含二维码的区域，按 Esc 取消 ", -1)),
          createBaseVNode("div", {
            class: "screen-select-overlay__rect",
            style: normalizeStyle(rectStyle())
          }, null, 4)
        ], 544)
      ]);
    };
  }
};
const QrScreenSelectOverlay = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-b7594efc"]]);
const _hoisted_1$1 = { class: "qr-modal" };
const _hoisted_2$1 = { class: "qr-modal__entries" };
const _hoisted_3$1 = {
  key: 0,
  class: "qr-modal__section"
};
const _hoisted_4$1 = ["disabled"];
const _hoisted_5$1 = {
  key: 1,
  class: "qr-modal__section"
};
const _hoisted_6$1 = {
  key: 0,
  class: "qr-modal__hint"
};
const _hoisted_7 = {
  key: 2,
  class: "qr-modal__section"
};
const _hoisted_8 = { class: "qr-modal__file-label" };
const _hoisted_9 = {
  key: 0,
  class: "qr-modal__hint"
};
const _hoisted_10 = {
  key: 3,
  class: "qr-modal__section"
};
const _hoisted_11 = ["disabled"];
const _hoisted_12 = {
  key: 4,
  class: "qr-modal__error"
};
const _sfc_main$1 = {
  __name: "QrCheckinModal",
  props: {
    visible: { type: Boolean, default: false },
    activeId: { type: String, default: "" },
    parseQrUrl: { type: Function, required: true },
    decodeQrImage: { type: Function, required: true },
    captureScreenQr: { type: Function, required: true }
  },
  emits: ["close", "submit"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { cameraAvailable } = useQrScanner();
    const mode = ref("paste");
    const urlInput = ref("");
    const error = ref("");
    const processing = ref(false);
    const showScreenOverlay = ref(false);
    const fileInputRef = ref(null);
    const isDesktop = isTauriRuntime();
    const handlePasteSubmit = async () => {
      const raw = urlInput.value.trim().replace(/&amp;/g, "&");
      if (!raw) {
        error.value = "请粘贴二维码链接";
        return;
      }
      processing.value = true;
      error.value = "";
      try {
        const parts = await props.parseQrUrl(raw);
        emit("submit", parts.enc);
      } catch (err) {
        error.value = err instanceof Error ? err.message : "链接解析失败";
      } finally {
        processing.value = false;
      }
    };
    const handleImageSelect = async (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        error.value = "图片大小不能超过 10MB";
        return;
      }
      processing.value = true;
      error.value = "";
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const decoded = await props.decodeQrImage(bytes, file.type || "image/png");
        const parts = await props.parseQrUrl(decoded.url);
        emit("submit", parts.enc);
      } catch (err) {
        error.value = err instanceof Error ? err.message : "二维码识别失败";
      } finally {
        processing.value = false;
        if (fileInputRef.value) fileInputRef.value.value = "";
      }
    };
    const handleCameraCapture = async (event) => {
      await handleImageSelect(event);
    };
    const handleScreenCapture = () => {
      showScreenOverlay.value = true;
    };
    const handleScreenRect = async (rect) => {
      showScreenOverlay.value = false;
      processing.value = true;
      error.value = "";
      try {
        const decoded = await props.captureScreenQr(rect);
        const parts = await props.parseQrUrl(decoded.url);
        emit("submit", parts.enc);
      } catch (err) {
        error.value = err instanceof Error ? err.message : "屏幕截图识别失败";
      } finally {
        processing.value = false;
      }
    };
    const handleClose = () => {
      error.value = "";
      urlInput.value = "";
      processing.value = false;
      showScreenOverlay.value = false;
      emit("close");
    };
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        createVNode(unref(TModal), {
          visible: __props.visible,
          title: "二维码签到",
          width: "400px",
          onClose: handleClose
        }, {
          footer: withCtx(() => [
            createBaseVNode("button", {
              class: "modal-btn modal-btn--cancel",
              onClick: handleClose
            }, "关闭")
          ]),
          default: withCtx(() => [
            createBaseVNode("div", _hoisted_1$1, [
              createBaseVNode("div", _hoisted_2$1, [
                createBaseVNode("button", {
                  class: normalizeClass(["qr-entry-btn", { "qr-entry-btn--active": mode.value === "paste" }]),
                  onClick: _cache[0] || (_cache[0] = ($event) => mode.value = "paste")
                }, " 📋 粘贴链接 ", 2),
                createBaseVNode("button", {
                  class: normalizeClass(["qr-entry-btn", { "qr-entry-btn--active": mode.value === "image" }]),
                  onClick: _cache[1] || (_cache[1] = ($event) => mode.value = "image")
                }, " 🖼️ 选择图片 ", 2),
                unref(cameraAvailable) ? (openBlock(), createElementBlock("button", {
                  key: 0,
                  class: normalizeClass(["qr-entry-btn", { "qr-entry-btn--active": mode.value === "camera" }]),
                  onClick: _cache[2] || (_cache[2] = ($event) => mode.value = "camera")
                }, " 📷 拍照扫码 ", 2)) : createCommentVNode("", true),
                unref(isDesktop) ? (openBlock(), createElementBlock("button", {
                  key: 1,
                  class: normalizeClass(["qr-entry-btn", { "qr-entry-btn--active": mode.value === "screen" }]),
                  onClick: _cache[3] || (_cache[3] = ($event) => mode.value = "screen")
                }, " 🖥️ 屏幕截图 ", 2)) : createCommentVNode("", true)
              ]),
              mode.value === "paste" ? (openBlock(), createElementBlock("div", _hoisted_3$1, [
                withDirectives(createBaseVNode("textarea", {
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => urlInput.value = $event),
                  class: "qr-modal__textarea",
                  placeholder: "粘贴学习通签到二维码链接...",
                  rows: "3"
                }, null, 512), [
                  [vModelText, urlInput.value]
                ]),
                createBaseVNode("button", {
                  class: "qr-modal__action-btn",
                  disabled: processing.value || !urlInput.value.trim(),
                  onClick: handlePasteSubmit
                }, toDisplayString(processing.value ? "解析中..." : "解析并签到"), 9, _hoisted_4$1)
              ])) : createCommentVNode("", true),
              mode.value === "image" ? (openBlock(), createElementBlock("div", _hoisted_5$1, [
                createBaseVNode("label", {
                  class: "qr-modal__file-label",
                  onClick: _cache[5] || (_cache[5] = ($event) => fileInputRef.value?.click())
                }, [..._cache[7] || (_cache[7] = [
                  createBaseVNode("span", { class: "qr-modal__file-icon" }, "🖼️", -1),
                  createBaseVNode("span", null, "点击选择包含二维码的图片", -1)
                ])]),
                createBaseVNode("input", {
                  ref_key: "fileInputRef",
                  ref: fileInputRef,
                  type: "file",
                  accept: "image/*",
                  class: "qr-modal__file-input",
                  onChange: handleImageSelect
                }, null, 544),
                processing.value ? (openBlock(), createElementBlock("p", _hoisted_6$1, "正在识别二维码...")) : createCommentVNode("", true)
              ])) : createCommentVNode("", true),
              mode.value === "camera" ? (openBlock(), createElementBlock("div", _hoisted_7, [
                createBaseVNode("label", _hoisted_8, [
                  _cache[8] || (_cache[8] = createBaseVNode("span", { class: "qr-modal__file-icon" }, "📷", -1)),
                  _cache[9] || (_cache[9] = createBaseVNode("span", null, "点击拍摄二维码照片", -1)),
                  createBaseVNode("input", {
                    type: "file",
                    accept: "image/*",
                    capture: "environment",
                    class: "qr-modal__file-input",
                    onChange: handleCameraCapture
                  }, null, 32)
                ]),
                processing.value ? (openBlock(), createElementBlock("p", _hoisted_9, "正在识别二维码...")) : createCommentVNode("", true)
              ])) : createCommentVNode("", true),
              mode.value === "screen" ? (openBlock(), createElementBlock("div", _hoisted_10, [
                createBaseVNode("button", {
                  class: "qr-modal__action-btn",
                  disabled: processing.value,
                  onClick: handleScreenCapture
                }, toDisplayString(processing.value ? "识别中..." : "🖥️ 选择屏幕区域"), 9, _hoisted_11),
                _cache[10] || (_cache[10] = createBaseVNode("p", { class: "qr-modal__hint" }, "点击后将出现全屏覆盖层，拖拽选择包含二维码的区域", -1))
              ])) : createCommentVNode("", true),
              error.value ? (openBlock(), createElementBlock("p", _hoisted_12, toDisplayString(error.value), 1)) : createCommentVNode("", true)
            ])
          ]),
          _: 1
        }, 8, ["visible"]),
        showScreenOverlay.value ? (openBlock(), createBlock(QrScreenSelectOverlay, {
          key: 0,
          onSelect: handleScreenRect,
          onCancel: _cache[6] || (_cache[6] = ($event) => showScreenOverlay.value = false)
        })) : createCommentVNode("", true)
      ], 64);
    };
  }
};
const QrCheckinModal = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-1a571206"]]);
function useChaoxingCheckin() {
  const activities = ref([]);
  const history = ref([]);
  const loading = ref(false);
  const sessionConnected = ref(false);
  const inflightIds = ref(/* @__PURE__ */ new Set());
  const activeActivities = computed(
    () => activities.value.filter((a) => a.status === "active")
  );
  const pendingOrExpired = computed(
    () => activities.value.filter((a) => a.status !== "active")
  );
  async function refresh(force = false) {
    loading.value = true;
    try {
      const result = await invokeNative("chaoxing_checkin_list", {
        forceRefresh: force
      });
      activities.value = result;
      sessionConnected.value = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("session_expired") || msg.includes("请先登录")) {
        sessionConnected.value = false;
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }
  async function submitCommon(activeId) {
    inflightIds.value.add(activeId);
    try {
      return await invokeNative("chaoxing_checkin_submit_common", {
        active_id: activeId
      });
    } finally {
      inflightIds.value.delete(activeId);
    }
  }
  async function submitLocation(activeId, lat, lng, addr) {
    inflightIds.value.add(activeId);
    try {
      return await invokeNative("chaoxing_checkin_submit_location", {
        active_id: activeId,
        latitude: lat,
        longitude: lng,
        address: addr
      });
    } finally {
      inflightIds.value.delete(activeId);
    }
  }
  async function uploadPhoto(bytes, mime, name) {
    return await invokeNative("chaoxing_checkin_upload_photo", {
      image_bytes: Array.from(bytes),
      mime_type: mime,
      file_name: name
    });
  }
  async function submitPhoto(activeId, objectId) {
    inflightIds.value.add(activeId);
    try {
      return await invokeNative("chaoxing_checkin_submit_photo", {
        active_id: activeId,
        object_id: objectId
      });
    } finally {
      inflightIds.value.delete(activeId);
    }
  }
  async function submitQrcode(activeId, enc) {
    inflightIds.value.add(activeId);
    try {
      return await invokeNative("chaoxing_checkin_submit_qrcode", {
        active_id: activeId,
        enc
      });
    } finally {
      inflightIds.value.delete(activeId);
    }
  }
  async function submitGesture(activeId, pattern) {
    inflightIds.value.add(activeId);
    try {
      return await invokeNative("chaoxing_checkin_submit_gesture", {
        active_id: activeId,
        pattern
      });
    } finally {
      inflightIds.value.delete(activeId);
    }
  }
  async function fetchHistory(limit) {
    const result = await invokeNative("chaoxing_checkin_history", {
      student_id: null,
      limit: limit ?? 50
    });
    history.value = result;
  }
  async function parseQrUrl(url) {
    return await invokeNative("chaoxing_checkin_parse_qr_url", { url });
  }
  async function decodeQrImage(bytes, mime) {
    return await invokeNative("chaoxing_checkin_decode_qr_image", {
      image_bytes: Array.from(bytes),
      mime_type: mime
    });
  }
  async function captureScreenQr(rect) {
    return await invokeNative("chaoxing_checkin_capture_screen_qr", {
      rect: rect ?? null
    });
  }
  function isInflight(activeId) {
    return inflightIds.value.has(activeId);
  }
  return {
    activities,
    history,
    loading,
    sessionConnected,
    activeActivities,
    pendingOrExpired,
    refresh,
    submitCommon,
    submitLocation,
    uploadPhoto,
    submitPhoto,
    submitQrcode,
    submitGesture,
    fetchHistory,
    parseQrUrl,
    decodeQrImage,
    captureScreenQr,
    isInflight
  };
}
const _hoisted_1 = { class: "more-chaoxing-checkin-view" };
const _hoisted_2 = ["disabled"];
const _hoisted_3 = { class: "more-chaoxing-checkin-view__body" };
const _hoisted_4 = { class: "checkin-tabs" };
const _hoisted_5 = { class: "checkin-activity-list" };
const _hoisted_6 = { class: "checkin-activity-list" };
const _sfc_main = {
  __name: "MoreChaoxingCheckinView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const {
      activities,
      history,
      loading,
      sessionConnected,
      activeActivities,
      pendingOrExpired,
      refresh,
      submitCommon,
      submitLocation,
      uploadPhoto,
      submitPhoto,
      submitQrcode,
      submitGesture,
      fetchHistory,
      parseQrUrl,
      decodeQrImage,
      captureScreenQr,
      isInflight
    } = useChaoxingCheckin();
    const refreshing = ref(false);
    const error = ref("");
    const toast = ref("");
    const locationModal = ref({ visible: false, activeId: "" });
    const photoModal = ref({ visible: false, activeId: "" });
    const gestureModal = ref({ visible: false, activeId: "" });
    const qrModal = ref({ visible: false, activeId: "" });
    const showTab = ref("active");
    const handleRefresh = async () => {
      refreshing.value = true;
      error.value = "";
      try {
        await refresh(true);
      } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
      } finally {
        refreshing.value = false;
      }
    };
    const handleAction = async (activity) => {
      const type = activity.activity_type;
      const activeId = activity.active_id;
      if (type === "normal") {
        try {
          const res = await submitCommon(activeId);
          toast.value = res.message || "签到成功";
          await refresh();
        } catch (err) {
          toast.value = err instanceof Error ? err.message : "签到失败";
        }
        return;
      }
      if (type === "location") {
        locationModal.value = { visible: true, activeId };
        return;
      }
      if (type === "photo") {
        photoModal.value = { visible: true, activeId };
        return;
      }
      if (type === "gesture") {
        gestureModal.value = { visible: true, activeId };
        return;
      }
      if (type === "qrcode") {
        qrModal.value = { visible: true, activeId };
        return;
      }
    };
    const handleLocationSubmit = async (payload) => {
      try {
        const res = await submitLocation(
          locationModal.value.activeId,
          payload.latitude,
          payload.longitude,
          payload.address
        );
        toast.value = res.message || "位置签到成功";
        locationModal.value.visible = false;
        await refresh();
      } catch (err) {
        toast.value = err instanceof Error ? err.message : "位置签到失败";
      }
    };
    const handlePhotoSubmit = async (payload) => {
      try {
        const uploaded = await uploadPhoto(payload.bytes, payload.mime, payload.name);
        const res = await submitPhoto(photoModal.value.activeId, uploaded.object_id);
        toast.value = res.message || "拍照签到成功";
        photoModal.value.visible = false;
        await refresh();
      } catch (err) {
        toast.value = err instanceof Error ? err.message : "拍照签到失败";
      }
    };
    const handleGestureSubmit = async (pattern) => {
      try {
        const res = await submitGesture(gestureModal.value.activeId, pattern);
        toast.value = res.message || "手势签到成功";
        gestureModal.value.visible = false;
        await refresh();
      } catch (err) {
        toast.value = err instanceof Error ? err.message : "手势签到失败";
      }
    };
    const handleQrSubmit = async (enc) => {
      try {
        const res = await submitQrcode(qrModal.value.activeId, enc);
        toast.value = res.message || "二维码签到成功";
        qrModal.value.visible = false;
        await refresh();
      } catch (err) {
        toast.value = err instanceof Error ? err.message : "二维码签到失败";
      }
    };
    const handleShowHistory = async () => {
      showTab.value = "history";
      try {
        await fetchHistory();
      } catch {
      }
    };
    onMounted(async () => {
      try {
        await refresh();
      } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
      }
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$a), {
          title: "学习通签到",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }, {
          actions: withCtx(() => [
            createBaseVNode("button", {
              class: "icon-btn",
              disabled: refreshing.value,
              onClick: handleRefresh
            }, "↻", 8, _hoisted_2)
          ]),
          _: 1
        }),
        createBaseVNode("div", _hoisted_3, [
          createVNode(SessionStatusBanner, { connected: unref(sessionConnected) }, null, 8, ["connected"]),
          createVNode(Transition, { name: "toast-fade" }, {
            default: withCtx(() => [
              toast.value ? (openBlock(), createElementBlock("div", {
                key: 0,
                class: "checkin-toast",
                onClick: _cache[1] || (_cache[1] = ($event) => toast.value = "")
              }, toDisplayString(toast.value), 1)) : createCommentVNode("", true)
            ]),
            _: 1
          }),
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("button", {
              class: normalizeClass(["checkin-tab", { "checkin-tab--active": showTab.value === "active" }]),
              onClick: _cache[2] || (_cache[2] = ($event) => showTab.value = "active")
            }, " 签到活动 ", 2),
            createBaseVNode("button", {
              class: normalizeClass(["checkin-tab", { "checkin-tab--active": showTab.value === "history" }]),
              onClick: handleShowHistory
            }, " 签到记录 ", 2)
          ]),
          showTab.value === "active" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            unref(loading) ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 0,
              type: "loading",
              message: "正在获取签到活动..."
            })) : error.value ? (openBlock(), createBlock(unref(TEmptyState), {
              key: 1,
              type: "error",
              message: error.value
            }, null, 8, ["message"])) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
              unref(activeActivities).length ? (openBlock(), createBlock(unref(TSection), {
                key: 0,
                title: "进行中",
                icon: "🟢"
              }, {
                default: withCtx(() => [
                  createBaseVNode("div", _hoisted_5, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(unref(activeActivities), (item) => {
                      return openBlock(), createBlock(CheckinActivityCard, {
                        key: item.active_id,
                        activity: item,
                        inflight: unref(isInflight)(item.active_id),
                        onAction: ($event) => handleAction(item)
                      }, null, 8, ["activity", "inflight", "onAction"]);
                    }), 128))
                  ])
                ]),
                _: 1
              })) : createCommentVNode("", true),
              unref(pendingOrExpired).length ? (openBlock(), createBlock(unref(TSection), {
                key: 1,
                title: "已结束 / 已签",
                icon: "📋"
              }, {
                default: withCtx(() => [
                  createBaseVNode("div", _hoisted_6, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(unref(pendingOrExpired), (item) => {
                      return openBlock(), createBlock(CheckinActivityCard, {
                        key: item.active_id,
                        activity: item,
                        inflight: unref(isInflight)(item.active_id),
                        onAction: ($event) => handleAction(item)
                      }, null, 8, ["activity", "inflight", "onAction"]);
                    }), 128))
                  ])
                ]),
                _: 1
              })) : createCommentVNode("", true),
              !unref(activities).length ? (openBlock(), createBlock(unref(TEmptyState), {
                key: 2,
                type: "empty",
                message: "暂无签到活动",
                icon: "📭"
              })) : createCommentVNode("", true)
            ], 64))
          ], 64)) : createCommentVNode("", true),
          showTab.value === "history" ? (openBlock(), createBlock(CheckinHistoryList, {
            key: 1,
            entries: unref(history)
          }, null, 8, ["entries"])) : createCommentVNode("", true)
        ]),
        createVNode(LocationCheckinModal, {
          visible: locationModal.value.visible,
          onClose: _cache[3] || (_cache[3] = ($event) => locationModal.value.visible = false),
          onSubmit: handleLocationSubmit
        }, null, 8, ["visible"]),
        createVNode(PhotoCheckinModal, {
          visible: photoModal.value.visible,
          onClose: _cache[4] || (_cache[4] = ($event) => photoModal.value.visible = false),
          onSubmit: handlePhotoSubmit
        }, null, 8, ["visible"]),
        createVNode(GestureCheckinModal, {
          visible: gestureModal.value.visible,
          onClose: _cache[5] || (_cache[5] = ($event) => gestureModal.value.visible = false),
          onSubmit: handleGestureSubmit
        }, null, 8, ["visible"]),
        createVNode(QrCheckinModal, {
          visible: qrModal.value.visible,
          "active-id": qrModal.value.activeId,
          "parse-qr-url": unref(parseQrUrl),
          "decode-qr-image": unref(decodeQrImage),
          "capture-screen-qr": unref(captureScreenQr),
          onClose: _cache[6] || (_cache[6] = ($event) => qrModal.value.visible = false),
          onSubmit: handleQrSubmit
        }, null, 8, ["visible", "active-id", "parse-qr-url", "decode-qr-image", "capture-screen-qr"])
      ]);
    };
  }
};
const MoreChaoxingCheckinView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-815faae7"]]);
export {
  MoreChaoxingCheckinView as default
};
