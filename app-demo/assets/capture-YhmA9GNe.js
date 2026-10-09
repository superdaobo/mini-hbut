import { _ as __vitePreload } from "./runtime-bridge-gQMtwwk6.js";
const loadHtml2Canvas = async () => {
  const mod = await __vitePreload(() => import("./html2canvas.esm-C17pzFXx.js"), true ? [] : void 0, import.meta.url);
  return mod.default ?? mod;
};
const DEFAULT_LIGHT_CAPTURE_BACKGROUND = "#f4f7ff";
const DEFAULT_DARK_CAPTURE_BACKGROUND = "#0f172a";
const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = (event) => reject(event);
  reader.readAsDataURL(blob);
});
const CAPTURE_READY_TIMEOUT_MS = 3e3;
const boundedWait = (promise, timeoutMs) => new Promise((resolve) => {
  if (!(timeoutMs > 0)) {
    resolve();
    return;
  }
  let settled = false;
  let timer = null;
  const finish = () => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    resolve();
  };
  timer = setTimeout(finish, timeoutMs);
  promise.then(finish, finish);
});
const waitForCaptureReady = async (rootEl, timeoutMs = CAPTURE_READY_TIMEOUT_MS) => {
  if (!rootEl) return;
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
  const fonts = document?.fonts;
  if (fonts?.ready) {
    try {
      await boundedWait(fonts.ready, Math.max(0, deadline - Date.now()));
    } catch {
    }
  }
  const images = Array.from(rootEl.querySelectorAll("img"));
  if (images.length > 0) {
    await boundedWait(
      Promise.all(
        images.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          });
        })
      ),
      Math.max(0, deadline - Date.now())
    );
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};
const resolveCaptureTarget = (selector) => {
  const explicit = String(selector || "").trim();
  if (explicit) {
    const matched = document.querySelector(explicit);
    if (matched instanceof HTMLElement) return matched;
    throw new Error(`未找到截图目标：${explicit}`);
  }
  const candidates = [
    ".view-transition-root > *",
    ".view-page",
    ".app-shell",
    "#app"
  ];
  for (const item of candidates) {
    const matched = document.querySelector(item);
    if (matched instanceof HTMLElement) return matched;
  }
  if (document.body instanceof HTMLElement) return document.body;
  throw new Error("当前页面尚未准备完成，无法截图");
};
const isTransparentBackground = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "transparent" || normalized === "rgba(0, 0, 0, 0)" || normalized === "rgba(0,0,0,0)";
};
const resolveCaptureBackgroundColor = (target, explicitBackgroundColor) => {
  const explicit = String(explicitBackgroundColor || "").trim();
  if (explicit) return explicit;
  const doc = target.ownerDocument || document;
  const root = doc.documentElement;
  const readComputedStyle = doc.defaultView?.getComputedStyle?.bind(doc.defaultView) || globalThis.getComputedStyle;
  const candidates = [target, doc.body, root].filter(Boolean);
  for (const candidate of candidates) {
    const color = readComputedStyle(candidate).backgroundColor;
    if (!isTransparentBackground(color)) return color;
  }
  const isDark = root.classList.contains("dark");
  return isDark ? DEFAULT_DARK_CAPTURE_BACKGROUND : DEFAULT_LIGHT_CAPTURE_BACKGROUND;
};
const captureElementToBlob = async ({
  selector,
  format = "png",
  backgroundColor,
  scale,
  maxHeight
}) => {
  const target = resolveCaptureTarget(selector);
  const exportWidth = Math.max(
    Math.ceil(target.scrollWidth || 0),
    Math.ceil(target.clientWidth || 0),
    640
  );
  const exportHeight = Math.max(
    Math.ceil(target.clientHeight || 0),
    Number(maxHeight) > 0 ? Math.min(
      Math.ceil(target.scrollHeight || target.clientHeight || 0),
      Math.ceil(Number(maxHeight))
    ) : Math.ceil(target.scrollHeight || target.clientHeight || 0),
    480
  );
  target.classList.add("capture-mode");
  try {
    await waitForCaptureReady(target);
    const resolvedBackgroundColor = resolveCaptureBackgroundColor(target, backgroundColor);
    const canvas = await renderElementToCanvas(target, {
      exportWidth,
      exportHeight,
      backgroundColor: resolvedBackgroundColor,
      scale
    });
    const mime = format === "webp" ? "image/webp" : "image/png";
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) resolve(value);
          else reject(new Error("无法生成截图数据"));
        },
        mime,
        0.98
      );
    });
    return {
      blob,
      mime,
      width: canvas.width,
      height: canvas.height
    };
  } finally {
    target.classList.remove("capture-mode");
  }
};
const renderElementToCanvas = async (element, {
  exportWidth,
  exportHeight,
  backgroundColor = DEFAULT_LIGHT_CAPTURE_BACKGROUND,
  scale
} = {}) => {
  const width = Math.max(
    Math.ceil(exportWidth || 0),
    Math.ceil(element.scrollWidth || 0),
    Math.ceil(element.clientWidth || 0),
    640
  );
  const height = Math.max(
    Math.ceil(
      exportHeight || element.scrollHeight || element.clientHeight || 0
    ),
    480
  );
  const baseOptions = {
    useCORS: true,
    allowTaint: false,
    imageTimeout: 15e3,
    scale: scale || Math.max(2, Math.min(window.devicePixelRatio || 2, 3)),
    backgroundColor,
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: width,
    windowHeight: height,
    width,
    height
  };
  try {
    const html2canvas = await loadHtml2Canvas();
    return await html2canvas(element, {
      ...baseOptions,
      foreignObjectRendering: false
    });
  } catch (error) {
    const message = String(error?.message || error || "");
    if (!/unsupported color function|oklab|color-mix/i.test(message)) {
      throw error;
    }
    const html2canvas = await loadHtml2Canvas();
    return html2canvas(element, {
      ...baseOptions,
      foreignObjectRendering: true,
      backgroundColor
    });
  }
};
export {
  blobToDataUrl as b,
  captureElementToBlob as c,
  renderElementToCanvas as r,
  waitForCaptureReady as w
};
