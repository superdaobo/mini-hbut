import { _ as __vitePreload } from "./runtime-bridge-apFQ0nCw.js";
async function qrToDataURL(text, options = {}) {
  const payload = String(options.text ?? text ?? "").trim();
  if (!payload) throw new Error("二维码内容为空");
  const width = Number(options.width) > 0 ? Number(options.width) : 220;
  const margin = Number.isFinite(Number(options.margin)) ? Number(options.margin) : 1;
  try {
    const mod = await __vitePreload(() => import(
      /* @vite-ignore */
      "./online-learning-BGeH--Iq.js"
    ).then((n) => n.b), true ? [] : void 0, import.meta.url);
    const api = resolveQrApi(mod);
    if (api) {
      return await api.toDataURL(payload, {
        margin,
        width,
        errorCorrectionLevel: "M"
      });
    }
  } catch {
  }
  return "https://api.qrserver.com/v1/create-qr-code/?size=" + encodeURIComponent(`${width}x${width}`) + "&margin=" + encodeURIComponent(String(margin)) + "&data=" + encodeURIComponent(payload);
}
function resolveQrApi(mod) {
  if (!mod) return null;
  if (typeof mod.toDataURL === "function") return mod;
  if (mod.default && typeof mod.default.toDataURL === "function") return mod.default;
  if (mod.default && mod.default.default && typeof mod.default.default.toDataURL === "function") {
    return mod.default.default;
  }
  return null;
}
export {
  qrToDataURL as q
};
