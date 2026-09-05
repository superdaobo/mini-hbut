import { _ as _export_sfc } from "./app-demo-BxokP0Ga.js";
import { a as openBlock, c as createElementBlock, F as Fragment, g as renderList, f as normalizeStyle, n as normalizeClass, d as createCommentVNode, h as computed, l as onBeforeUnmount, j as createBlock, k as withCtx, q as renderSlot, O as resolveDynamicComponent, r as ref } from "./vue-core-DPI62iBa.js";
const _hoisted_1 = {
  key: 0,
  class: "layout-collision-fx",
  "aria-hidden": "true"
};
const _sfc_main$1 = {
  __name: "LayoutCollisionFxLayer",
  props: {
    items: {
      type: Array,
      default: () => []
    }
  },
  setup(__props) {
    const props = __props;
    const normalizedItems = computed(
      () => (Array.isArray(props.items) ? props.items : []).map((item) => ({
        ...item,
        className: `layout-collision-fx__node layout-collision-fx__node--${item?.kind || "spark"}`,
        style: {
          "--fx-x": `${Number(item?.x || 0).toFixed(2)}px`,
          "--fx-y": `${Number(item?.y || 0).toFixed(2)}px`,
          "--fx-size": `${Number(item?.size || 0).toFixed(2)}px`,
          "--fx-radius": `${Number(item?.radius || 0).toFixed(2)}px`,
          "--fx-opacity": Number(item?.life || 0).toFixed(3),
          "--fx-color": String(item?.color || "#5b8cff")
        }
      }))
    );
    return (_ctx, _cache) => {
      return normalizedItems.value.length ? (openBlock(), createElementBlock("div", _hoisted_1, [
        (openBlock(true), createElementBlock(Fragment, null, renderList(normalizedItems.value, (item) => {
          return openBlock(), createElementBlock("div", {
            key: item.id,
            class: normalizeClass(item.className),
            style: normalizeStyle(item.style)
          }, null, 6);
        }), 128))
      ])) : createCommentVNode("", true);
    };
  }
};
const LayoutCollisionFxLayer = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-27812505"]]);
const DRAG_START_DISTANCE_PX = 8;
const CLICK_SUPPRESS_MS = 220;
const _sfc_main = {
  __name: "SortableSurface",
  props: {
    id: {
      type: [String, Number],
      required: true
    },
    group: {
      type: String,
      required: true
    },
    section: {
      type: String,
      default: ""
    },
    tag: {
      type: String,
      default: "div"
    },
    editing: {
      type: Boolean,
      default: false
    },
    disabled: {
      type: Boolean,
      default: false
    },
    surfaceClass: {
      type: [String, Array, Object],
      default: ""
    },
    surfaceStyle: {
      type: [String, Array, Object],
      default: ""
    }
  },
  emits: [
    "drag-start",
    "drag-move",
    "drag-end",
    "click",
    "pointerdown",
    "pointermove",
    "pointerleave"
  ],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const elementRef = ref(null);
    const isDragging = ref(false);
    let activePointerId = null;
    let dragPressing = false;
    let startPoint = { x: 0, y: 0 };
    let lastPoint = { x: 0, y: 0 };
    let suppressClickUntil = 0;
    const dragDisabled = computed(() => !props.editing || props.disabled);
    const dragOffset = computed(() => ({
      x: lastPoint.x - startPoint.x,
      y: lastPoint.y - startPoint.y
    }));
    const mergedClass = computed(() => [
      props.surfaceClass,
      {
        editing: props.editing,
        dragging: isDragging.value
      }
    ]);
    const mergedStyle = computed(() => [
      props.surfaceStyle,
      {
        "--drag-translate-x": isDragging.value ? `${dragOffset.value.x}px` : "0px",
        "--drag-translate-y": isDragging.value ? `${dragOffset.value.y}px` : "0px"
      }
    ]);
    const setElementRef = (node) => {
      elementRef.value = node;
    };
    const releaseDragTracking = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove, true);
      window.removeEventListener("pointerup", handleWindowPointerUp, true);
      window.removeEventListener("pointercancel", handleWindowPointerUp, true);
      const node = elementRef.value;
      if (node && activePointerId !== null && typeof node.releasePointerCapture === "function") {
        try {
          node.releasePointerCapture(activePointerId);
        } catch {
        }
      }
      activePointerId = null;
      dragPressing = false;
      isDragging.value = false;
      startPoint = { x: 0, y: 0 };
      lastPoint = { x: 0, y: 0 };
    };
    const beginDragTracking = (event) => {
      dragPressing = true;
      activePointerId = event.pointerId;
      startPoint = {
        x: Number(event.clientX || 0),
        y: Number(event.clientY || 0)
      };
      lastPoint = { ...startPoint };
      const node = elementRef.value;
      if (node && typeof node.setPointerCapture === "function") {
        try {
          node.setPointerCapture(event.pointerId);
        } catch {
        }
      }
      window.addEventListener("pointermove", handleWindowPointerMove, true);
      window.addEventListener("pointerup", handleWindowPointerUp, true);
      window.addEventListener("pointercancel", handleWindowPointerUp, true);
    };
    const handleWindowPointerMove = (event) => {
      if (!dragPressing || event.pointerId !== activePointerId) return;
      emit("pointermove", event);
      const point = {
        x: Number(event.clientX || 0),
        y: Number(event.clientY || 0)
      };
      lastPoint = point;
      const deltaX = point.x - startPoint.x;
      const deltaY = point.y - startPoint.y;
      if (!isDragging.value) {
        const distance = Math.hypot(deltaX, deltaY);
        if (distance < DRAG_START_DISTANCE_PX) {
          return;
        }
        isDragging.value = true;
        emit("drag-start", {
          id: props.id,
          section: props.section,
          point: { ...startPoint }
        });
      }
      event.preventDefault();
      emit("drag-move", {
        id: props.id,
        section: props.section,
        point,
        delta: {
          x: deltaX,
          y: deltaY
        }
      });
    };
    const handleWindowPointerUp = (event) => {
      if (!dragPressing || event.pointerId !== activePointerId) return;
      const point = {
        x: Number(event.clientX || 0),
        y: Number(event.clientY || 0)
      };
      if (isDragging.value) {
        suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
        emit("drag-end", {
          id: props.id,
          section: props.section,
          point,
          delta: {
            x: point.x - startPoint.x,
            y: point.y - startPoint.y
          }
        });
      }
      releaseDragTracking();
    };
    const handlePointerDownInternal = (event) => {
      emit("pointerdown", event);
      if (dragDisabled.value) return;
      if (event.button !== void 0 && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      beginDragTracking(event);
    };
    const handleClickInternal = (event) => {
      if (Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      emit("click", event);
    };
    onBeforeUnmount(() => {
      releaseDragTracking();
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(resolveDynamicComponent(__props.tag), {
        ref: setElementRef,
        "data-layout-id": String(__props.id),
        "data-layout-section": __props.section,
        class: normalizeClass(mergedClass.value),
        style: normalizeStyle(mergedStyle.value),
        onClick: handleClickInternal,
        onPointerdown: handlePointerDownInternal,
        onPointermove: _cache[0] || (_cache[0] = ($event) => emit("pointermove", $event)),
        onPointerleave: _cache[1] || (_cache[1] = ($event) => emit("pointerleave", $event))
      }, {
        default: withCtx(() => [
          renderSlot(_ctx.$slots, "default", {
            isDragging: isDragging.value,
            isOvered: false
          })
        ]),
        _: 3
      }, 40, ["data-layout-id", "data-layout-section", "class", "style"]);
    };
  }
};
const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
const getRectGap = (value, start, end) => {
  if (value < start) return start - value;
  if (value > end) return value - end;
  return 0;
};
const captureLayoutSlotAnchors = (root, section) => {
  const scope = root instanceof Element ? root : document;
  return Array.from(scope.querySelectorAll(`[data-layout-section="${section}"]`)).map((element, index) => {
    const id = String(element.getAttribute("data-layout-id") || "").trim();
    if (!id) return null;
    const rect = element.getBoundingClientRect();
    return {
      id,
      index,
      rect,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2
    };
  }).filter(Boolean);
};
const resolveLayoutSlotTarget = (anchors, point) => {
  if (!Array.isArray(anchors) || !anchors.length || !point) return null;
  const x = toFiniteNumber(point.x);
  const y = toFiniteNumber(point.y);
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const item of anchors) {
    const gapX = getRectGap(x, item.rect.left, item.rect.right);
    const gapY = getRectGap(y, item.rect.top, item.rect.bottom);
    const edgeScore = gapX * gapX + gapY * gapY;
    const dx = x - item.centerX;
    const dy = y - item.centerY;
    const centerScore = dx * dx + dy * dy;
    const score = edgeScore * 0.72 + centerScore * 0.28;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
};
const moveLayoutItemToIndex = (list, activeKey, targetIndex) => {
  const next = [...list];
  const activeIndex = next.indexOf(activeKey);
  const normalizedTargetIndex = Math.max(0, Math.min(Number(targetIndex) || 0, next.length - 1));
  if (activeIndex < 0 || activeIndex === normalizedTargetIndex) {
    return next;
  }
  const [moved] = next.splice(activeIndex, 1);
  next.splice(normalizedTargetIndex, 0, moved);
  return next;
};
let layoutCollisionFxSeed = 0;
const DEFAULT_PALETTE = ["#5b8cff", "#8fd6ff", "#f6c56f"];
const clampNumber = (value, min, max) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
};
const nextFxId = (prefix) => `${prefix}-${Date.now()}-${layoutCollisionFxSeed += 1}`;
const resolveCollisionPalette = (...colors) => {
  const palette = colors.flat().map((item) => String(item || "").trim()).filter(Boolean);
  return palette.length ? palette : [...DEFAULT_PALETTE];
};
const resolveRelativeCollisionPoint = ({ rootRect, sourceRect, targetRect }) => {
  if (!rootRect || !targetRect) {
    return { x: 0, y: 0 };
  }
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const sourceCenterX = sourceRect ? sourceRect.left + sourceRect.width / 2 : targetCenterX;
  const sourceCenterY = sourceRect ? sourceRect.top + sourceRect.height / 2 : targetCenterY;
  return {
    x: (sourceCenterX + targetCenterX) / 2 - rootRect.left,
    y: (sourceCenterY + targetCenterY) / 2 - rootRect.top
  };
};
const createLayoutCollisionBurst = ({
  x = 0,
  y = 0,
  colors = DEFAULT_PALETTE,
  sparkCount = 12
} = {}) => {
  const palette = resolveCollisionPalette(colors);
  const burst = [
    {
      id: nextFxId("ring"),
      kind: "ring",
      x,
      y,
      radius: 18,
      growth: 3.1 + Math.random() * 0.8,
      life: 0.92,
      decay: 0.07,
      color: palette[0]
    },
    {
      id: nextFxId("core"),
      kind: "core",
      x,
      y,
      size: 12,
      life: 0.72,
      decay: 0.09,
      color: palette[Math.min(1, palette.length - 1)] || palette[0]
    }
  ];
  for (let index = 0; index < sparkCount; index += 1) {
    const angle = Math.PI * 2 * index / sparkCount + (Math.random() - 0.5) * 0.22;
    const speed = 2 + Math.random() * 3.8;
    burst.push({
      id: nextFxId("spark"),
      kind: "spark",
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0.08 + Math.random() * 0.08,
      life: 1,
      decay: 0.045 + Math.random() * 0.025,
      size: 2.6 + Math.random() * 3.1,
      color: palette[index % palette.length]
    });
  }
  return burst;
};
const advanceLayoutCollisionFx = (items, deltaMs = 16.67) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  const step = clampNumber(deltaMs / 16.67, 0.72, 1.9);
  return items.map((item) => {
    if (!item) return null;
    const next = { ...item };
    if (next.kind === "spark") {
      next.x += next.vx * step;
      next.y += next.vy * step;
      next.vy += next.gravity * step;
      next.vx *= 0.984;
      next.life -= next.decay * step;
      next.size *= 0.994;
    } else if (next.kind === "ring") {
      next.radius += next.growth * step;
      next.life -= next.decay * step;
    } else {
      next.size += 0.18 * step;
      next.life -= next.decay * step;
    }
    return next.life > 0.02 ? next : null;
  }).filter(Boolean);
};
export {
  LayoutCollisionFxLayer as L,
  _sfc_main as _,
  resolveCollisionPalette as a,
  advanceLayoutCollisionFx as b,
  createLayoutCollisionBurst as c,
  resolveLayoutSlotTarget as d,
  captureLayoutSlotAnchors as e,
  moveLayoutItemToIndex as m,
  resolveRelativeCollisionPoint as r
};
