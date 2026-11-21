import { i as defineComponent, o as onMounted, a as openBlock, c as createElementBlock, k as createVNode, u as unref, b as createBaseVNode, F as Fragment, f as renderList, d as createCommentVNode, t as toDisplayString, w as withModifiers, e as normalizeStyle, r as ref, h as computed } from "./vue-core-4L5yFbGc.js";
import { o as openExternal, _ as _export_sfc } from "./app-demo-C2QcskTn.js";
import { a as isTauriRuntime, d as invokeNative, t as toNativeFileSrc } from "./runtime-bridge-BNc94E8M.js";
import { _ as _sfc_main$1 } from "./TPageHeader.vue_vue_type_script_setup_true_lang-BqDeZlwd.js";
import "./more-modules-_ebfrMaq.js";
import "./debug-tools-CR1SXL-G.js";
import "./capture-BLRn_Hwi.js";
const META_PREFIX = "hbu_image_cache_meta_v1:";
const inFlight = /* @__PURE__ */ new Map();
const metaKey = (cacheKey) => `${META_PREFIX}${cacheKey}`;
const readMeta = (cacheKey) => {
  try {
    const raw = localStorage.getItem(metaKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      key: String(parsed.key || cacheKey),
      url: String(parsed.url || ""),
      path: parsed.path ? String(parsed.path) : void 0,
      updatedAt: Number(parsed.updatedAt || 0)
    };
  } catch {
    return null;
  }
};
const writeMeta = (cacheKey, meta) => {
  try {
    localStorage.setItem(metaKey(cacheKey), JSON.stringify(meta));
  } catch {
  }
};
const ttlExpired = (updatedAt, ttlHours) => {
  if (!updatedAt) return true;
  const ttlMs = Math.max(1, ttlHours) * 60 * 60 * 1e3;
  return Date.now() - updatedAt > ttlMs;
};
const toLocalSrc = async (path) => {
  try {
    return await toNativeFileSrc(path);
  } catch {
    return "";
  }
};
async function resolveForTauri(options) {
  const { cacheKey, url, ttlHours = 24 * 7 } = options;
  const meta = readMeta(cacheKey);
  const force = !meta || meta.url !== url || ttlExpired(meta.updatedAt, ttlHours);
  if (!force && meta?.path) {
    const src = await toLocalSrc(meta.path);
    if (src) return src;
  }
  const payload = await invokeNative("cache_remote_image", {
    cacheKey,
    url,
    force
  });
  if (!payload?.path) return url;
  writeMeta(cacheKey, {
    key: cacheKey,
    url,
    path: payload.path,
    updatedAt: Date.now()
  });
  return await toLocalSrc(payload.path) || url;
}
async function resolveForWeb(options) {
  const { cacheKey, url, ttlHours = 24 } = options;
  const meta = readMeta(cacheKey);
  const force = !meta || meta.url !== url || ttlExpired(meta.updatedAt, ttlHours);
  if (force) {
    writeMeta(cacheKey, {
      key: cacheKey,
      url,
      updatedAt: Date.now()
    });
  }
  return url;
}
async function resolveCachedImage(options) {
  const key = `${options.cacheKey}|${options.url}`;
  if (!inFlight.has(key)) {
    inFlight.set(
      key,
      (async () => {
        try {
          if (isTauriRuntime()) {
            return await resolveForTauri(options);
          }
          return await resolveForWeb(options);
        } finally {
          inFlight.delete(key);
        }
      })()
    );
  }
  return inFlight.get(key);
}
const _hoisted_1 = { class: "campus-photo-map-view" };
const _hoisted_2 = { class: "maps-grid" };
const _hoisted_3 = { class: "map-cover" };
const _hoisted_4 = ["src", "alt", "onError"];
const _hoisted_5 = {
  key: 0,
  class: "cover-badge"
};
const _hoisted_6 = { class: "map-meta" };
const _hoisted_7 = ["onClick"];
const _hoisted_8 = { class: "viewer-shell" };
const _hoisted_9 = { class: "viewer-toolbar" };
const _hoisted_10 = { class: "viewer-title" };
const _hoisted_11 = { class: "viewer-actions" };
const _hoisted_12 = ["src", "alt"];
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "CampusPhotoMapView",
  props: {
    studentId: { type: String, default: "" }
  },
  emits: ["back"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const maps = [
      {
        id: "map1",
        title: "校园地图 A",
        subtitle: "主校区总览",
        url: "https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/map/map1.jpg"
      },
      {
        id: "map2",
        title: "校园地图 B",
        subtitle: "建筑分布",
        url: "https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/map/map2.jpg"
      }
    ];
    const cachedSrcMap = ref({});
    const loadStateMap = ref({});
    const activeMap = ref(null);
    const scale = ref(1);
    const offset = ref({ x: 0, y: 0 });
    const viewportRef = ref(null);
    const pointers = /* @__PURE__ */ new Map();
    const lastPanPoint = ref(null);
    const lastPinchDistance = ref(0);
    const zoomText = computed(() => `${Math.round(scale.value * 100)}%`);
    const imageTransform = computed(
      () => `translate(-50%, -50%) translate3d(${offset.value.x}px, ${offset.value.y}px, 0) scale(${scale.value})`
    );
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const getMapSrc = (item) => cachedSrcMap.value[item.id] || item.url;
    const fallbackToRemote = (item) => {
      const current = cachedSrcMap.value[item.id];
      if (current === item.url) {
        loadStateMap.value[item.id] = "error";
        return;
      }
      cachedSrcMap.value[item.id] = item.url;
      loadStateMap.value[item.id] = "error";
    };
    const handleCoverImageError = (item) => fallbackToRemote(item);
    const handleViewerImageError = () => {
      if (activeMap.value) fallbackToRemote(activeMap.value);
    };
    const maxPan = () => {
      const el = viewportRef.value;
      if (!el) return { x: 240, y: 320 };
      const k = Math.max(0, scale.value - 1);
      return {
        x: el.clientWidth * (0.5 + k * 0.9),
        y: el.clientHeight * (0.5 + k * 0.9)
      };
    };
    const clampOffset = (next) => {
      const lim = maxPan();
      return {
        x: clamp(next.x, -lim.x, lim.x),
        y: clamp(next.y, -lim.y, lim.y)
      };
    };
    const resetView = () => {
      scale.value = 1;
      offset.value = { x: 0, y: 0 };
      lastPanPoint.value = null;
      lastPinchDistance.value = 0;
    };
    const openMap = (map) => {
      activeMap.value = map;
      resetView();
    };
    const closeMap = () => {
      activeMap.value = null;
      resetView();
      pointers.clear();
    };
    const zoomBy = (delta) => {
      const nextScale = clamp(scale.value + delta, 1, 6);
      scale.value = nextScale;
      if (nextScale <= 1) {
        offset.value = { x: 0, y: 0 };
      } else {
        offset.value = clampOffset(offset.value);
      }
    };
    const onWheel = (event) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 0.2 : -0.2);
    };
    const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const onPointerDown = (event) => {
      if (!activeMap.value) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        lastPanPoint.value = { x: event.clientX, y: event.clientY };
      } else if (pointers.size === 2) {
        const values = [...pointers.values()];
        lastPinchDistance.value = pointDistance(values[0], values[1]);
        lastPanPoint.value = null;
      }
    };
    const onPointerMove = (event) => {
      if (!activeMap.value || !pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const values = [...pointers.values()];
        const distance = pointDistance(values[0], values[1]);
        if (lastPinchDistance.value > 0) {
          const ratio = distance / lastPinchDistance.value;
          const nextScale = clamp(scale.value * ratio, 1, 6);
          scale.value = nextScale;
          offset.value = nextScale <= 1 ? { x: 0, y: 0 } : clampOffset(offset.value);
        }
        lastPinchDistance.value = distance;
        return;
      }
      if (pointers.size === 1 && scale.value > 1 && lastPanPoint.value) {
        const dx = event.clientX - lastPanPoint.value.x;
        const dy = event.clientY - lastPanPoint.value.y;
        offset.value = clampOffset({
          x: offset.value.x + dx,
          y: offset.value.y + dy
        });
        lastPanPoint.value = { x: event.clientX, y: event.clientY };
      }
    };
    const onPointerUp = (event) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) lastPinchDistance.value = 0;
      if (pointers.size === 1) {
        const only = [...pointers.values()][0];
        lastPanPoint.value = { x: only.x, y: only.y };
      }
      if (pointers.size === 0) lastPanPoint.value = null;
    };
    const openRaw = async () => {
      if (!activeMap.value) return;
      await openExternal(activeMap.value.url);
    };
    const loadSingleMap = async (item) => {
      loadStateMap.value[item.id] = "loading";
      try {
        const localSrc = await resolveCachedImage({
          cacheKey: `campus-map-${item.id}`,
          url: item.url,
          ttlHours: 24 * 7
        });
        cachedSrcMap.value[item.id] = localSrc;
        loadStateMap.value[item.id] = "ready";
      } catch {
        cachedSrcMap.value[item.id] = item.url;
        loadStateMap.value[item.id] = "error";
      }
    };
    const warmupMaps = async () => {
      await Promise.allSettled(maps.map((item) => loadSingleMap(item)));
    };
    onMounted(() => {
      warmupMaps();
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(_sfc_main$1), {
          title: "校园地图",
          icon: "map",
          onBack: _cache[0] || (_cache[0] = ($event) => emit("back"))
        }),
        _cache[8] || (_cache[8] = createBaseVNode("section", { class: "intro-card" }, [
          createBaseVNode("p", null, "支持缩放、拖拽和手势查看，地图会自动缓存到本地。"),
          createBaseVNode("p", null, "缓存有效期 7 天，到期后会自动后台刷新。")
        ], -1)),
        createBaseVNode("section", _hoisted_2, [
          (openBlock(), createElementBlock(Fragment, null, renderList(maps, (item) => {
            return createBaseVNode("article", {
              key: item.id,
              class: "map-card"
            }, [
              createBaseVNode("div", _hoisted_3, [
                createBaseVNode("img", {
                  src: getMapSrc(item),
                  alt: item.title,
                  loading: "lazy",
                  onError: ($event) => handleCoverImageError(item)
                }, null, 40, _hoisted_4),
                loadStateMap.value[item.id] === "loading" ? (openBlock(), createElementBlock("div", _hoisted_5, "缓存中")) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", _hoisted_6, [
                createBaseVNode("h3", null, toDisplayString(item.title), 1),
                createBaseVNode("p", null, toDisplayString(item.subtitle), 1)
              ]),
              createBaseVNode("button", {
                class: "open-btn",
                onClick: ($event) => openMap(item)
              }, "查看地图", 8, _hoisted_7)
            ]);
          }), 64))
        ]),
        activeMap.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "viewer-overlay",
          onClick: withModifiers(closeMap, ["self"])
        }, [
          createBaseVNode("div", _hoisted_8, [
            createBaseVNode("div", _hoisted_9, [
              createBaseVNode("div", _hoisted_10, [
                createBaseVNode("h3", null, toDisplayString(activeMap.value.title), 1),
                createBaseVNode("span", null, toDisplayString(zoomText.value), 1)
              ]),
              createBaseVNode("div", _hoisted_11, [
                createBaseVNode("button", {
                  "aria-label": "缩小",
                  onClick: _cache[1] || (_cache[1] = ($event) => zoomBy(-0.2))
                }, [..._cache[3] || (_cache[3] = [
                  createBaseVNode("span", {
                    class: "material-symbols-outlined",
                    "aria-hidden": "true"
                  }, "zoom_out", -1)
                ])]),
                createBaseVNode("button", {
                  "aria-label": "放大",
                  onClick: _cache[2] || (_cache[2] = ($event) => zoomBy(0.2))
                }, [..._cache[4] || (_cache[4] = [
                  createBaseVNode("span", {
                    class: "material-symbols-outlined",
                    "aria-hidden": "true"
                  }, "zoom_in", -1)
                ])]),
                createBaseVNode("button", {
                  "aria-label": "重置视图",
                  onClick: resetView
                }, [..._cache[5] || (_cache[5] = [
                  createBaseVNode("span", {
                    class: "material-symbols-outlined",
                    "aria-hidden": "true"
                  }, "restart_alt", -1)
                ])]),
                createBaseVNode("button", {
                  "aria-label": "查看原图",
                  onClick: openRaw
                }, [..._cache[6] || (_cache[6] = [
                  createBaseVNode("span", {
                    class: "material-symbols-outlined",
                    "aria-hidden": "true"
                  }, "open_in_new", -1)
                ])]),
                createBaseVNode("button", {
                  class: "close-btn",
                  "aria-label": "关闭查看器",
                  onClick: closeMap
                }, [..._cache[7] || (_cache[7] = [
                  createBaseVNode("span", {
                    class: "material-symbols-outlined",
                    "aria-hidden": "true"
                  }, "close", -1)
                ])])
              ])
            ]),
            createBaseVNode("div", {
              ref_key: "viewportRef",
              ref: viewportRef,
              class: "viewer-viewport",
              onWheel,
              onPointerdown: onPointerDown,
              onPointermove: onPointerMove,
              onPointerup: onPointerUp,
              onPointercancel: onPointerUp,
              onPointerleave: onPointerUp
            }, [
              createBaseVNode("img", {
                class: "viewer-image",
                src: getMapSrc(activeMap.value),
                alt: activeMap.value.title,
                style: normalizeStyle({ transform: imageTransform.value }),
                onError: handleViewerImageError,
                draggable: "false"
              }, null, 44, _hoisted_12)
            ], 544)
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
});
const CampusPhotoMapView = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-fb745612"]]);
export {
  CampusPhotoMapView as default
};
