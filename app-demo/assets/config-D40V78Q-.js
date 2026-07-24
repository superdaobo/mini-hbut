import { b as isTauriRuntime, e as isLikelyAndroidUserAgent, K as isLikelyIOSUserAgent } from "./runtime-bridge-apFQ0nCw.js";
import "./more-modules-CsUTdMqs.js";
import "./vue-core-DdLVj9yW.js";
const __vite_import_meta_env__ = {};
const CAMPUS_GUIDE_CONFIG = Object.freeze({
  scenicId: "48770",
  /** 湖工大手绘地图 subkey，绑定自定义图层 */
  qqMapKey: "5KDBZ-X2ACL-JVBPV-EPTZN-HMR42-WPF62",
  mapLbsKey: "XM4BZ-S4IKU-6GRV3-BT3XH-O27EQ-ZSF2U",
  routeLbsKey: "ZOLBZ-PRKEJ-ZQ5FS-FUVXT-XBIDO-HEBNE",
  customLayerId: "6913dc019029",
  themeColor: "#0074CF",
  apiBase: "/campus-guide",
  /** iOS / 桌面 Tauri：本地签名代理（http_server） */
  localBridgeBaseUrl: "http://127.0.0.1:4399/campus-guide",
  /**
   * Android Release 默认不启 loopback bridge。
   * 可通过 VITE_CAMPUS_GUIDE_HTTPS_BASE 或 localStorage `campus_guide_https_base` 覆盖。
   * 未配置时回退同源相对路径 `/campus-guide`（由宿主注入/远程网关反代时可用）。
   */
  httpsProxyBaseDefault: "",
  minZoom: 15,
  maxZoom: 20,
  defaultZoom: 16,
  useTencentGuide: true,
  /** #491：产品裁剪，入口层不再暴露云游/校庆打卡 */
  enableYunyou: false,
  enablePunch: false,
  /** 桌面端屏幕更大，默认展示全部 POI；小程序仍做点避让 */
  markerDodge: false,
  cdnBase: "https://industry.map.qq.com/cloud/hugongda/2022/09/05"
});
const readConfiguredHttpsBase = () => {
  try {
    const fromStorage = String(localStorage.getItem("campus_guide_https_base") || "").trim();
    if (fromStorage) return fromStorage.replace(/\/$/, "");
  } catch {
  }
  const fromEnv = String(
    __vite_import_meta_env__?.VITE_CAMPUS_GUIDE_HTTPS_BASE || ""
  ).trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const def = String(CAMPUS_GUIDE_CONFIG.httpsProxyBaseDefault || "").trim();
  return def ? def.replace(/\/$/, "") : "";
};
const resolveCampusGuideBaseUrl = () => {
  if (!isTauriRuntime()) return CAMPUS_GUIDE_CONFIG.apiBase;
  if (isLikelyAndroidUserAgent()) {
    const httpsBase = readConfiguredHttpsBase();
    if (httpsBase) return httpsBase.endsWith("/campus-guide") ? httpsBase : `${httpsBase}/campus-guide`;
    return CAMPUS_GUIDE_CONFIG.apiBase;
  }
  if (isLikelyIOSUserAgent() || !isLikelyAndroidUserAgent()) {
    return CAMPUS_GUIDE_CONFIG.localBridgeBaseUrl;
  }
  return CAMPUS_GUIDE_CONFIG.apiBase;
};
const GUIDE_MODE_KEY = "campus_guide_use_tencent";
const readCampusGuideMode = () => {
  try {
    const raw = localStorage.getItem(GUIDE_MODE_KEY);
    if (raw === "legacy") return "legacy";
    if (raw === "tencent") return "tencent";
  } catch {
  }
  return CAMPUS_GUIDE_CONFIG.useTencentGuide ? "tencent" : "legacy";
};
const writeCampusGuideMode = (mode) => {
  try {
    localStorage.setItem(GUIDE_MODE_KEY, mode);
  } catch {
  }
};
export {
  CAMPUS_GUIDE_CONFIG,
  readCampusGuideMode,
  resolveCampusGuideBaseUrl,
  writeCampusGuideMode
};
