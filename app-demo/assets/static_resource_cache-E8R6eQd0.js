import { g as getCachedData, b as setCachedData } from "./app-demo-CxKBY5JQ.js";
import { b as isTauriRuntime, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
const STATIC_RESOURCE_BASE = "https://hbut.6661111.xyz/app-resources";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/superdaobo/mini-hbut/website-pages/app-resources";
const GITHUB_PROXY_BASE = "https://ghfast.top/https://raw.githubusercontent.com/superdaobo/mini-hbut/website-pages/app-resources";
const DORMITORY_MANIFEST_URL = `${STATIC_RESOURCE_BASE}/dormitory/manifest.json`;
const DORMITORY_FALLBACK_URL = `${STATIC_RESOURCE_BASE}/dormitory/dormitory_data-20260423.json`;
const DORMITORY_CACHE_KEY = "static_resource:dormitory_data";
const STATIC_RESOURCE_TTL = 30 * 24 * 60 * 60 * 1e3;
const STATIC_RESOURCE_TIMEOUT_MS = 1e4;
const safeText = (value) => String(value ?? "").trim();
const withCacheBust = (url) => {
  const text = safeText(url);
  if (!text) return "";
  const joiner = text.includes("?") ? "&" : "?";
  return `${text}${joiner}_t=${Date.now()}`;
};
const toAbsoluteUrl = (value, base) => {
  const raw = safeText(value);
  if (!raw) return "";
  try {
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
};
const withOfflineMeta = (data, timestamp) => {
  if (!data || typeof data !== "object") {
    return {
      success: true,
      data,
      offline: true,
      sync_time: new Date(timestamp).toISOString()
    };
  }
  return {
    ...data,
    offline: true,
    sync_time: data.sync_time || new Date(timestamp).toISOString()
  };
};
const toProxyUrls = (url) => {
  const raw = safeText(url).split("?")[0];
  const suffix = raw.replace(STATIC_RESOURCE_BASE, "");
  if (!suffix || suffix === raw) return [];
  return [
    `${GITHUB_RAW_BASE}${suffix}`,
    `${GITHUB_PROXY_BASE}${suffix}`
  ];
};
const fetchJsonNoStore = async (url) => {
  const requestUrl = withCacheBust(url);
  if (isTauriRuntime()) {
    const nativeUrls = [requestUrl, ...toProxyUrls(url).map(withCacheBust)];
    for (const tryUrl of nativeUrls) {
      try {
        return await withTimeout(
          invokeNative("fetch_remote_json", { url: tryUrl }),
          STATIC_RESOURCE_TIMEOUT_MS
        );
      } catch (error) {
        console.warn("[StaticResource] 原生 fetch 失败，尝试下一个源", {
          url: tryUrl,
          error: String(error?.message || error || "")
        });
      }
    }
    console.warn("[StaticResource] 所有原生源失败，尝试浏览器 fetch 兜底");
  }
  const urlsToTry = [requestUrl, ...toProxyUrls(url).map(withCacheBust)];
  let lastError = null;
  for (const tryUrl of urlsToTry) {
    try {
      const response = await withTimeout(
        fetch(tryUrl, {
          cache: "no-store",
          headers: { Accept: "application/json" }
        }),
        STATIC_RESOURCE_TIMEOUT_MS
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`解析静态资源失败：${parseErr?.message || "unknown"}`);
      }
    } catch (error) {
      lastError = error;
      console.warn("[StaticResource] fetch 失败，尝试下一个源", {
        url: tryUrl,
        error: String(error?.message || error || "")
      });
    }
  }
  throw lastError || new Error("所有静态资源源均不可用");
};
const fetchTextNoStore = async (url) => {
  const urlsToTry = [withCacheBust(url), ...toProxyUrls(url).map(withCacheBust)];
  let lastError = null;
  for (const tryUrl of urlsToTry) {
    try {
      const response = await withTimeout(
        fetch(tryUrl, {
          cache: "no-store",
          headers: { Accept: "application/json" }
        }),
        STATIC_RESOURCE_TIMEOUT_MS
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      console.warn("[StaticResource] fetchText 失败，尝试下一个源", {
        url: tryUrl,
        error: String(error?.message || error || "")
      });
    }
  }
  throw lastError || new Error("所有静态资源源均不可用");
};
const withTimeout = async (promise, ms = STATIC_RESOURCE_TIMEOUT_MS) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("static-resource-timeout")), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const readDormitoryCache = () => getCachedData(DORMITORY_CACHE_KEY, STATIC_RESOURCE_TTL);
const GITCODE_DIRECT_URL = "https://raw.gitcode.com/superdaobo/mini-hbut-config/raw/main/dormitory_data.json";
const fetchDormitoryDataset = async ({ forceRefresh = false } = {}) => {
  const cached = readDormitoryCache();
  if (!forceRefresh && cached?.data?.data && Array.isArray(cached.data.data) && cached.data.data.length > 0) {
    console.info("[StaticResource] 宿舍数据命中缓存，跳过网络请求", {
      version: cached.data.version,
      count: cached.data.data.length
    });
    return {
      data: cached.data,
      fromCache: true,
      timestamp: cached.timestamp
    };
  }
  let payloadData = null;
  let sourceLabel = "";
  try {
    console.info("[StaticResource] 尝试 Gitcode 直链...");
    payloadData = await fetchJsonNoStore(GITCODE_DIRECT_URL);
    if (Array.isArray(payloadData) && payloadData.length > 0) {
      sourceLabel = "gitcode-direct";
    } else {
      payloadData = null;
    }
  } catch (e) {
    console.warn("[StaticResource] Gitcode 直链失败:", e?.message);
  }
  if (!payloadData) {
    try {
      console.info("[StaticResource] 尝试 manifest 方式...");
      const manifest = await fetchJsonNoStore(DORMITORY_MANIFEST_URL);
      const resourceUrl = toAbsoluteUrl(
        manifest?.url || manifest?.resource_url || DORMITORY_FALLBACK_URL,
        DORMITORY_MANIFEST_URL
      ) || DORMITORY_FALLBACK_URL;
      if (isTauriRuntime()) {
        payloadData = await fetchJsonNoStore(resourceUrl);
      } else {
        const payloadText = await fetchTextNoStore(resourceUrl);
        payloadData = JSON.parse(payloadText);
      }
      if (Array.isArray(payloadData) && payloadData.length > 0) {
        sourceLabel = "manifest-cdn";
      } else {
        payloadData = null;
      }
    } catch (e) {
      console.warn("[StaticResource] manifest 方式失败:", e?.message);
    }
  }
  if (!payloadData) {
    try {
      console.info("[StaticResource] 尝试 ghfast 代理...");
      const proxyUrl = `${GITHUB_PROXY_BASE}/dormitory/dormitory_data-20260423.json`;
      payloadData = await fetchJsonNoStore(proxyUrl);
      if (Array.isArray(payloadData) && payloadData.length > 0) {
        sourceLabel = "ghfast-proxy";
      } else {
        payloadData = null;
      }
    } catch (e) {
      console.warn("[StaticResource] ghfast 代理失败:", e?.message);
    }
  }
  if (!payloadData) {
    try {
      console.info("[StaticResource] 尝试 GitHub 源站...");
      const githubUrl = `${GITHUB_RAW_BASE}/dormitory/dormitory_data-20260423.json`;
      payloadData = await fetchJsonNoStore(githubUrl);
      if (Array.isArray(payloadData) && payloadData.length > 0) {
        sourceLabel = "github-pages";
      } else {
        payloadData = null;
      }
    } catch (e) {
      console.warn("[StaticResource] GitHub 源站失败:", e?.message);
    }
  }
  if (!payloadData || !Array.isArray(payloadData) || payloadData.length === 0) {
    if (cached?.data) {
      return {
        data: withOfflineMeta(cached.data, cached.timestamp),
        fromCache: true,
        timestamp: cached.timestamp,
        stale: true
      };
    }
    throw new Error("所有宿舍数据源均不可用，请检查网络连接");
  }
  const nextPayload = {
    success: true,
    data: payloadData,
    version: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    sync_time: (/* @__PURE__ */ new Date()).toISOString(),
    source: sourceLabel
  };
  setCachedData(DORMITORY_CACHE_KEY, nextPayload);
  console.info("[StaticResource] 宿舍数据加载成功", {
    fromCache: false,
    count: payloadData.length,
    source: sourceLabel
  });
  return {
    data: nextPayload,
    fromCache: false,
    timestamp: Date.now()
  };
};
export {
  fetchDormitoryDataset as f
};
