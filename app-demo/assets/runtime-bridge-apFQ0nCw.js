const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./index-C_hIeLHX.js","./more-modules-CsUTdMqs.js","./vue-core-DdLVj9yW.js"])))=>i.map(i=>d[i]);
import { i as isViewAllowed } from "./more-modules-CsUTdMqs.js";
const scriptRel = "modulepreload";
const assetsURL = function(dep, importerUrl) {
  return new URL(dep, importerUrl).href;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    const links = document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute("nonce");
    promise = Promise.allSettled(
      deps.map((dep) => {
        dep = assetsURL(dep, importerUrl);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        const isBaseRelative = !!importerUrl;
        if (isBaseRelative) {
          for (let i = links.length - 1; i >= 0; i--) {
            const link2 = links[i];
            if (link2.href === dep && (!isCss || link2.rel === "stylesheet")) {
              return;
            }
          }
        } else if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) {
          return;
        }
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) {
          link.as = "script";
        }
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) {
          link.setAttribute("nonce", cspNonce);
        }
        document.head.appendChild(link);
        if (isCss) {
          return new Promise((res, rej) => {
            link.addEventListener("load", res);
            link.addEventListener(
              "error",
              () => rej(new Error(`Unable to preload CSS for ${dep}`))
            );
          });
        }
      })
    );
  }
  function handlePreloadError(err) {
    const e = new Event("vite:preloadError", {
      cancelable: true
    });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};
const createCapacitorPlatforms = (win) => {
  const defaultPlatformMap = /* @__PURE__ */ new Map();
  defaultPlatformMap.set("web", { name: "web" });
  const capPlatforms = win.CapacitorPlatforms || {
    currentPlatform: { name: "web" },
    platforms: defaultPlatformMap
  };
  const addPlatform2 = (name, platform) => {
    capPlatforms.platforms.set(name, platform);
  };
  const setPlatform2 = (name) => {
    if (capPlatforms.platforms.has(name)) {
      capPlatforms.currentPlatform = capPlatforms.platforms.get(name);
    }
  };
  capPlatforms.addPlatform = addPlatform2;
  capPlatforms.setPlatform = setPlatform2;
  return capPlatforms;
};
const initPlatforms = (win) => win.CapacitorPlatforms = createCapacitorPlatforms(win);
const CapacitorPlatforms = /* @__PURE__ */ initPlatforms(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
const addPlatform = CapacitorPlatforms.addPlatform;
const setPlatform = CapacitorPlatforms.setPlatform;
const legacyRegisterWebPlugin = (cap, webPlugin) => {
  var _a;
  const config = webPlugin.config;
  const Plugins2 = cap.Plugins;
  if (!(config === null || config === void 0 ? void 0 : config.name)) {
    throw new Error(`Capacitor WebPlugin is using the deprecated "registerWebPlugin()" function, but without the config. Please use "registerPlugin()" instead to register this web plugin."`);
  }
  console.warn(`Capacitor plugin "${config.name}" is using the deprecated "registerWebPlugin()" function`);
  if (!Plugins2[config.name] || ((_a = config === null || config === void 0 ? void 0 : config.platforms) === null || _a === void 0 ? void 0 : _a.includes(cap.getPlatform()))) {
    Plugins2[config.name] = webPlugin;
  }
};
var ExceptionCode;
(function(ExceptionCode2) {
  ExceptionCode2["Unimplemented"] = "UNIMPLEMENTED";
  ExceptionCode2["Unavailable"] = "UNAVAILABLE";
})(ExceptionCode || (ExceptionCode = {}));
class CapacitorException extends Error {
  constructor(message, code2, data) {
    super(message);
    this.message = message;
    this.code = code2;
    this.data = data;
  }
}
const getPlatformId = (win) => {
  var _a, _b;
  if (win === null || win === void 0 ? void 0 : win.androidBridge) {
    return "android";
  } else if ((_b = (_a = win === null || win === void 0 ? void 0 : win.webkit) === null || _a === void 0 ? void 0 : _a.messageHandlers) === null || _b === void 0 ? void 0 : _b.bridge) {
    return "ios";
  } else {
    return "web";
  }
};
const createCapacitor = (win) => {
  var _a, _b, _c, _d, _e;
  const capCustomPlatform = win.CapacitorCustomPlatform || null;
  const cap = win.Capacitor || {};
  const Plugins2 = cap.Plugins = cap.Plugins || {};
  const capPlatforms = win.CapacitorPlatforms;
  const defaultGetPlatform = () => {
    return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
  };
  const getPlatform = ((_a = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _a === void 0 ? void 0 : _a.getPlatform) || defaultGetPlatform;
  const defaultIsNativePlatform = () => getPlatform() !== "web";
  const isNativePlatform = ((_b = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _b === void 0 ? void 0 : _b.isNativePlatform) || defaultIsNativePlatform;
  const defaultIsPluginAvailable = (pluginName) => {
    const plugin = registeredPlugins.get(pluginName);
    if (plugin === null || plugin === void 0 ? void 0 : plugin.platforms.has(getPlatform())) {
      return true;
    }
    if (getPluginHeader(pluginName)) {
      return true;
    }
    return false;
  };
  const isPluginAvailable = ((_c = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _c === void 0 ? void 0 : _c.isPluginAvailable) || defaultIsPluginAvailable;
  const defaultGetPluginHeader = (pluginName) => {
    var _a2;
    return (_a2 = cap.PluginHeaders) === null || _a2 === void 0 ? void 0 : _a2.find((h) => h.name === pluginName);
  };
  const getPluginHeader = ((_d = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _d === void 0 ? void 0 : _d.getPluginHeader) || defaultGetPluginHeader;
  const handleError = (err) => win.console.error(err);
  const pluginMethodNoop = (_target, prop, pluginName) => {
    return Promise.reject(`${pluginName} does not have an implementation of "${prop}".`);
  };
  const registeredPlugins = /* @__PURE__ */ new Map();
  const defaultRegisterPlugin = (pluginName, jsImplementations = {}) => {
    const registeredPlugin = registeredPlugins.get(pluginName);
    if (registeredPlugin) {
      console.warn(`Capacitor plugin "${pluginName}" already registered. Cannot register plugins twice.`);
      return registeredPlugin.proxy;
    }
    const platform = getPlatform();
    const pluginHeader = getPluginHeader(pluginName);
    let jsImplementation;
    const loadPluginImplementation = async () => {
      if (!jsImplementation && platform in jsImplementations) {
        jsImplementation = typeof jsImplementations[platform] === "function" ? jsImplementation = await jsImplementations[platform]() : jsImplementation = jsImplementations[platform];
      } else if (capCustomPlatform !== null && !jsImplementation && "web" in jsImplementations) {
        jsImplementation = typeof jsImplementations["web"] === "function" ? jsImplementation = await jsImplementations["web"]() : jsImplementation = jsImplementations["web"];
      }
      return jsImplementation;
    };
    const createPluginMethod = (impl, prop) => {
      var _a2, _b2;
      if (pluginHeader) {
        const methodHeader = pluginHeader === null || pluginHeader === void 0 ? void 0 : pluginHeader.methods.find((m) => prop === m.name);
        if (methodHeader) {
          if (methodHeader.rtype === "promise") {
            return (options) => cap.nativePromise(pluginName, prop.toString(), options);
          } else {
            return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
          }
        } else if (impl) {
          return (_a2 = impl[prop]) === null || _a2 === void 0 ? void 0 : _a2.bind(impl);
        }
      } else if (impl) {
        return (_b2 = impl[prop]) === null || _b2 === void 0 ? void 0 : _b2.bind(impl);
      } else {
        throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, ExceptionCode.Unimplemented);
      }
    };
    const createPluginMethodWrapper = (prop) => {
      let remove2;
      const wrapper = (...args) => {
        const p = loadPluginImplementation().then((impl) => {
          const fn = createPluginMethod(impl, prop);
          if (fn) {
            const p2 = fn(...args);
            remove2 = p2 === null || p2 === void 0 ? void 0 : p2.remove;
            return p2;
          } else {
            throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, ExceptionCode.Unimplemented);
          }
        });
        if (prop === "addListener") {
          p.remove = async () => remove2();
        }
        return p;
      };
      wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
      Object.defineProperty(wrapper, "name", {
        value: prop,
        writable: false,
        configurable: false
      });
      return wrapper;
    };
    const addListener = createPluginMethodWrapper("addListener");
    const removeListener = createPluginMethodWrapper("removeListener");
    const addListenerNative = (eventName, callback) => {
      const call = addListener({ eventName }, callback);
      const remove2 = async () => {
        const callbackId = await call;
        removeListener({
          eventName,
          callbackId
        }, callback);
      };
      const p = new Promise((resolve2) => call.then(() => resolve2({ remove: remove2 })));
      p.remove = async () => {
        console.warn(`Using addListener() without 'await' is deprecated.`);
        await remove2();
      };
      return p;
    };
    const proxy = new Proxy({}, {
      get(_, prop) {
        switch (prop) {
          case "$$typeof":
            return void 0;
          case "toJSON":
            return () => ({});
          case "addListener":
            return pluginHeader ? addListenerNative : addListener;
          case "removeListener":
            return removeListener;
          default:
            return createPluginMethodWrapper(prop);
        }
      }
    });
    Plugins2[pluginName] = proxy;
    registeredPlugins.set(pluginName, {
      name: pluginName,
      proxy,
      platforms: /* @__PURE__ */ new Set([
        ...Object.keys(jsImplementations),
        ...pluginHeader ? [platform] : []
      ])
    });
    return proxy;
  };
  const registerPlugin2 = ((_e = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _e === void 0 ? void 0 : _e.registerPlugin) || defaultRegisterPlugin;
  if (!cap.convertFileSrc) {
    cap.convertFileSrc = (filePath) => filePath;
  }
  cap.getPlatform = getPlatform;
  cap.handleError = handleError;
  cap.isNativePlatform = isNativePlatform;
  cap.isPluginAvailable = isPluginAvailable;
  cap.pluginMethodNoop = pluginMethodNoop;
  cap.registerPlugin = registerPlugin2;
  cap.Exception = CapacitorException;
  cap.DEBUG = !!cap.DEBUG;
  cap.isLoggingEnabled = !!cap.isLoggingEnabled;
  cap.platform = cap.getPlatform();
  cap.isNative = cap.isNativePlatform();
  return cap;
};
const initCapacitorGlobal = (win) => win.Capacitor = createCapacitor(win);
const Capacitor = /* @__PURE__ */ initCapacitorGlobal(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
const registerPlugin = Capacitor.registerPlugin;
const Plugins = Capacitor.Plugins;
const registerWebPlugin = (plugin) => legacyRegisterWebPlugin(Capacitor, plugin);
class WebPlugin {
  constructor(config) {
    this.listeners = {};
    this.retainedEventArguments = {};
    this.windowListeners = {};
    if (config) {
      console.warn(`Capacitor WebPlugin "${config.name}" config object was deprecated in v3 and will be removed in v4.`);
      this.config = config;
    }
  }
  addListener(eventName, listenerFunc) {
    let firstListener = false;
    const listeners2 = this.listeners[eventName];
    if (!listeners2) {
      this.listeners[eventName] = [];
      firstListener = true;
    }
    this.listeners[eventName].push(listenerFunc);
    const windowListener = this.windowListeners[eventName];
    if (windowListener && !windowListener.registered) {
      this.addWindowListener(windowListener);
    }
    if (firstListener) {
      this.sendRetainedArgumentsForEvent(eventName);
    }
    const remove2 = async () => this.removeListener(eventName, listenerFunc);
    const p = Promise.resolve({ remove: remove2 });
    return p;
  }
  async removeAllListeners() {
    this.listeners = {};
    for (const listener in this.windowListeners) {
      this.removeWindowListener(this.windowListeners[listener]);
    }
    this.windowListeners = {};
  }
  notifyListeners(eventName, data, retainUntilConsumed) {
    const listeners2 = this.listeners[eventName];
    if (!listeners2) {
      if (retainUntilConsumed) {
        let args = this.retainedEventArguments[eventName];
        if (!args) {
          args = [];
        }
        args.push(data);
        this.retainedEventArguments[eventName] = args;
      }
      return;
    }
    listeners2.forEach((listener) => listener(data));
  }
  hasListeners(eventName) {
    return !!this.listeners[eventName].length;
  }
  registerWindowListener(windowEventName, pluginEventName) {
    this.windowListeners[pluginEventName] = {
      registered: false,
      windowEventName,
      pluginEventName,
      handler: (event2) => {
        this.notifyListeners(pluginEventName, event2);
      }
    };
  }
  unimplemented(msg = "not implemented") {
    return new Capacitor.Exception(msg, ExceptionCode.Unimplemented);
  }
  unavailable(msg = "not available") {
    return new Capacitor.Exception(msg, ExceptionCode.Unavailable);
  }
  async removeListener(eventName, listenerFunc) {
    const listeners2 = this.listeners[eventName];
    if (!listeners2) {
      return;
    }
    const index2 = listeners2.indexOf(listenerFunc);
    this.listeners[eventName].splice(index2, 1);
    if (!this.listeners[eventName].length) {
      this.removeWindowListener(this.windowListeners[eventName]);
    }
  }
  addWindowListener(handle) {
    window.addEventListener(handle.windowEventName, handle.handler);
    handle.registered = true;
  }
  removeWindowListener(handle) {
    if (!handle) {
      return;
    }
    window.removeEventListener(handle.windowEventName, handle.handler);
    handle.registered = false;
  }
  sendRetainedArgumentsForEvent(eventName) {
    const args = this.retainedEventArguments[eventName];
    if (!args) {
      return;
    }
    delete this.retainedEventArguments[eventName];
    args.forEach((arg) => {
      this.notifyListeners(eventName, arg);
    });
  }
}
const WebView = /* @__PURE__ */ registerPlugin("WebView");
const encode = (str) => encodeURIComponent(str).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape);
const decode = (str) => str.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent);
class CapacitorCookiesPluginWeb extends WebPlugin {
  async getCookies() {
    const cookies = document.cookie;
    const cookieMap = {};
    cookies.split(";").forEach((cookie) => {
      if (cookie.length <= 0)
        return;
      let [key, value] = cookie.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
      key = decode(key).trim();
      value = decode(value).trim();
      cookieMap[key] = value;
    });
    return cookieMap;
  }
  async setCookie(options) {
    try {
      const encodedKey = encode(options.key);
      const encodedValue = encode(options.value);
      const expires = `; expires=${(options.expires || "").replace("expires=", "")}`;
      const path = (options.path || "/").replace("path=", "");
      const domain = options.url != null && options.url.length > 0 ? `domain=${options.url}` : "";
      document.cookie = `${encodedKey}=${encodedValue || ""}${expires}; path=${path}; ${domain};`;
    } catch (error2) {
      return Promise.reject(error2);
    }
  }
  async deleteCookie(options) {
    try {
      document.cookie = `${options.key}=; Max-Age=0`;
    } catch (error2) {
      return Promise.reject(error2);
    }
  }
  async clearCookies() {
    try {
      const cookies = document.cookie.split(";") || [];
      for (const cookie of cookies) {
        document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${(/* @__PURE__ */ new Date()).toUTCString()};path=/`);
      }
    } catch (error2) {
      return Promise.reject(error2);
    }
  }
  async clearAllCookies() {
    try {
      await this.clearCookies();
    } catch (error2) {
      return Promise.reject(error2);
    }
  }
}
const CapacitorCookies = registerPlugin("CapacitorCookies", {
  web: () => new CapacitorCookiesPluginWeb()
});
const readBlobAsBase64 = async (blob) => new Promise((resolve2, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const base64String = reader.result;
    resolve2(base64String.indexOf(",") >= 0 ? base64String.split(",")[1] : base64String);
  };
  reader.onerror = (error2) => reject(error2);
  reader.readAsDataURL(blob);
});
const normalizeHttpHeaders = (headers = {}) => {
  const originalKeys = Object.keys(headers);
  const loweredKeys = Object.keys(headers).map((k) => k.toLocaleLowerCase());
  const normalized = loweredKeys.reduce((acc, key, index2) => {
    acc[key] = headers[originalKeys[index2]];
    return acc;
  }, {});
  return normalized;
};
const buildUrlParams = (params, shouldEncode = true) => {
  if (!params)
    return null;
  const output = Object.entries(params).reduce((accumulator, entry) => {
    const [key, value] = entry;
    let encodedValue;
    let item;
    if (Array.isArray(value)) {
      item = "";
      value.forEach((str) => {
        encodedValue = shouldEncode ? encodeURIComponent(str) : str;
        item += `${key}=${encodedValue}&`;
      });
      item.slice(0, -1);
    } else {
      encodedValue = shouldEncode ? encodeURIComponent(value) : value;
      item = `${key}=${encodedValue}`;
    }
    return `${accumulator}&${item}`;
  }, "");
  return output.substr(1);
};
const buildRequestInit = (options, extra = {}) => {
  const output = Object.assign({ method: options.method || "GET", headers: options.headers }, extra);
  const headers = normalizeHttpHeaders(options.headers);
  const type2 = headers["content-type"] || "";
  if (typeof options.data === "string") {
    output.body = options.data;
  } else if (type2.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.data || {})) {
      params.set(key, value);
    }
    output.body = params.toString();
  } else if (type2.includes("multipart/form-data") || options.data instanceof FormData) {
    const form = new FormData();
    if (options.data instanceof FormData) {
      options.data.forEach((value, key) => {
        form.append(key, value);
      });
    } else {
      for (const key of Object.keys(options.data)) {
        form.append(key, options.data[key]);
      }
    }
    output.body = form;
    const headers2 = new Headers(output.headers);
    headers2.delete("content-type");
    output.headers = headers2;
  } else if (type2.includes("application/json") || typeof options.data === "object") {
    output.body = JSON.stringify(options.data);
  }
  return output;
};
class CapacitorHttpPluginWeb extends WebPlugin {
  /**
   * Perform an Http request given a set of options
   * @param options Options to build the HTTP request
   */
  async request(options) {
    const requestInit = buildRequestInit(options, options.webFetchExtra);
    const urlParams = buildUrlParams(options.params, options.shouldEncodeUrlParams);
    const url = urlParams ? `${options.url}?${urlParams}` : options.url;
    const response = await fetch(url, requestInit);
    const contentType = response.headers.get("content-type") || "";
    let { responseType = "text" } = response.ok ? options : {};
    if (contentType.includes("application/json")) {
      responseType = "json";
    }
    let data;
    let blob;
    switch (responseType) {
      case "arraybuffer":
      case "blob":
        blob = await response.blob();
        data = await readBlobAsBase64(blob);
        break;
      case "json":
        data = await response.json();
        break;
      case "document":
      case "text":
      default:
        data = await response.text();
    }
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      data,
      headers,
      status: response.status,
      url: response.url
    };
  }
  /**
   * Perform an Http GET request given a set of options
   * @param options Options to build the HTTP request
   */
  async get(options) {
    return this.request(Object.assign(Object.assign({}, options), { method: "GET" }));
  }
  /**
   * Perform an Http POST request given a set of options
   * @param options Options to build the HTTP request
   */
  async post(options) {
    return this.request(Object.assign(Object.assign({}, options), { method: "POST" }));
  }
  /**
   * Perform an Http PUT request given a set of options
   * @param options Options to build the HTTP request
   */
  async put(options) {
    return this.request(Object.assign(Object.assign({}, options), { method: "PUT" }));
  }
  /**
   * Perform an Http PATCH request given a set of options
   * @param options Options to build the HTTP request
   */
  async patch(options) {
    return this.request(Object.assign(Object.assign({}, options), { method: "PATCH" }));
  }
  /**
   * Perform an Http DELETE request given a set of options
   * @param options Options to build the HTTP request
   */
  async delete(options) {
    return this.request(Object.assign(Object.assign({}, options), { method: "DELETE" }));
  }
}
const CapacitorHttp = registerPlugin("CapacitorHttp", {
  web: () => new CapacitorHttpPluginWeb()
});
const index$9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Capacitor,
  CapacitorCookies,
  CapacitorException,
  CapacitorHttp,
  CapacitorPlatforms,
  get ExceptionCode() {
    return ExceptionCode;
  },
  Plugins,
  WebPlugin,
  WebView,
  addPlatform,
  buildRequestInit,
  registerPlugin,
  registerWebPlugin,
  setPlatform
}, Symbol.toStringTag, { value: "Module" }));
const hasNativeCapacitor = () => {
  if (typeof window === "undefined") return false;
  const w = window;
  const cap = w.Capacitor || Capacitor;
  if (!cap) return false;
  try {
    if (typeof cap.isNativePlatform === "function") {
      return !!cap.isNativePlatform();
    }
  } catch {
  }
  try {
    if (typeof cap.getPlatform === "function") {
      const platform = String(cap.getPlatform() || "").toLowerCase();
      if (platform && platform !== "web") return true;
    }
  } catch {
  }
  const raw = String(cap.platform || "").toLowerCase();
  return !!raw && raw !== "web";
};
const isLoopbackHost = (host) => host === "localhost" || host.startsWith("localhost:") || host === "127.0.0.1" || host.startsWith("127.0.0.1:");
const isMobileUserAgent = () => {
  const ua = String(globalThis?.navigator?.userAgent || "");
  return /(android|iphone|ipad|ipod)/i.test(ua);
};
const looksLikePackagedCapacitorHost = () => {
  if (typeof window === "undefined") return false;
  const w = window;
  const protocol = String(window.location?.protocol || "").toLowerCase();
  const host = String(window.location?.host || "").toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") return false;
  if (!isLoopbackHost(host)) return false;
  if (host === "tauri.localhost" || host.startsWith("tauri.localhost:")) return false;
  if (!isMobileUserAgent()) return false;
  const hasCapacitorBridge = !!w.Capacitor;
  return hasCapacitorBridge;
};
const isTauriRuntime$1 = () => {
  if (typeof window === "undefined") return false;
  if (hasNativeCapacitor()) return false;
  const w = window;
  const hasTauriApi = !!w.__TAURI__;
  const hasInternalMarker = !!w.__TAURI_INTERNALS__;
  const hasInternalInvoke = typeof w.__TAURI_INTERNALS__?.invoke === "function";
  const protocol = window.location?.protocol || "";
  const host = window.location?.host || "";
  if (protocol === "tauri:" || host === "tauri.localhost") return true;
  if (looksLikePackagedCapacitorHost()) return false;
  if (hasInternalInvoke) return true;
  return hasTauriApi && hasInternalMarker;
};
const isCapacitorRuntime$1 = () => {
  if (typeof window === "undefined") return false;
  if (hasNativeCapacitor()) return true;
  if (looksLikePackagedCapacitorHost()) return true;
  const protocol = window.location?.protocol || "";
  return protocol === "capacitor:" || protocol === "ionic:";
};
const detectRuntime = () => {
  if (isCapacitorRuntime$1()) return "capacitor";
  if (isTauriRuntime$1()) return "tauri";
  return "web";
};
const STORAGE_KEY = "hbu_debug_logs_v1";
const MAX_MEMORY_LOGS = 1200;
const MAX_PERSIST_LOGS = 800;
const LOG_EVENT = "hbu-debug-log-updated";
let initialized = false;
let seq = 0;
let records = [];
let patchedFetch = false;
const listeners = /* @__PURE__ */ new Set();
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console)
};
const asText = (input) => {
  if (typeof input === "string") return input;
  if (typeof input === "number" || typeof input === "boolean") return String(input);
  if (input === null) return "null";
  if (input === void 0) return "undefined";
  if (input instanceof Error) {
    const stack = String(input.stack || "").trim();
    return stack || input.message || "Error";
  }
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
};
const parseScope = (text) => {
  const match = String(text || "").trim().match(/^\[([^\]]{1,40})\]/);
  return match?.[1] || "APP";
};
const normalizeMessage = (args) => {
  if (!Array.isArray(args) || args.length === 0) {
    return { scope: "APP", message: "", details: "" };
  }
  const values = args.map((item) => asText(item));
  const first = values[0] || "";
  const scope2 = parseScope(first);
  const message = values.join(" ").replace(/\s+/g, " ").trim();
  const details = values.join("\n");
  return { scope: scope2, message, details };
};
const persistLogs = () => {
  try {
    const toSave = records.slice(-MAX_PERSIST_LOGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
  }
};
const notifyListeners = () => {
  const snapshot = records.slice();
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {
    }
  });
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(new CustomEvent(LOG_EVENT));
    } catch {
    }
  }
};
const pushRecord = (level, args) => {
  const { scope: scope2, message, details } = normalizeMessage(args);
  if (!message) return;
  const record = {
    id: `${Date.now()}-${seq += 1}`,
    ts: Date.now(),
    level,
    scope: scope2,
    message,
    details
  };
  records.push(record);
  if (records.length > MAX_MEMORY_LOGS) {
    records = records.slice(records.length - MAX_MEMORY_LOGS);
  }
  persistLogs();
  notifyListeners();
};
const patchConsole = () => {
  const wrap = (level, fn) => {
    return (...args) => {
      fn(...args);
      pushRecord(level, args);
    };
  };
  console.log = wrap("log", originalConsole.log);
  console.info = wrap("info", originalConsole.info);
  console.warn = wrap("warn", originalConsole.warn);
  console.error = wrap("error", originalConsole.error);
  console.debug = wrap("debug", originalConsole.debug);
};
const extractFetchMeta = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input?.url || "";
  const method = String(
    init?.method || (input?.method ?? "GET")
  ).toUpperCase();
  return { url, method };
};
const patchFetch = () => {
  if (patchedFetch || typeof window === "undefined" || typeof window.fetch !== "function") return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const { url, method } = extractFetchMeta(input, init);
    const start = Date.now();
    pushRecord("debug", [`[HTTP] 请求开始 ${method} ${url}`]);
    try {
      const response = await nativeFetch(input, init);
      pushRecord("info", [
        `[HTTP] 请求完成 ${method} ${url} -> ${response.status} (${Date.now() - start}ms)`
      ]);
      return response;
    } catch (error2) {
      pushRecord("error", [
        `[HTTP] 请求失败 ${method} ${url} (${Date.now() - start}ms)`,
        error2
      ]);
      throw error2;
    }
  };
  patchedFetch = true;
};
const loadStoredLogs = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === "object").map((item) => ({
      id: String(item.id || ""),
      ts: Number(item.ts) || Date.now(),
      level: item.level || "log",
      scope: String(item.scope || "APP"),
      message: String(item.message || ""),
      details: String(item.details || item.message || "")
    })).filter((item) => !!item.message).slice(-MAX_MEMORY_LOGS);
  } catch {
    return [];
  }
};
let rustPollTimer = null;
let lastRustLogId = 0;
let rustBridgeBusy = false;
const isTauriWindow = () => typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
const invokeSilent = async (command, args) => {
  if (!isTauriWindow()) return null;
  try {
    const core$12 = await __vitePreload(() => Promise.resolve().then(() => core), true ? void 0 : void 0, import.meta.url);
    return await core$12.invoke(command, args);
  } catch {
    return null;
  }
};
const pullRuntimeLogsFromRust = async () => {
  if (typeof window === "undefined" || rustBridgeBusy) return;
  rustBridgeBusy = true;
  try {
    const res = await invokeSilent("get_runtime_logs", {
      limit: 200,
      sinceId: lastRustLogId || void 0,
      since_id: lastRustLogId || void 0
    });
    if (!res) return;
    const logs = Array.isArray(res?.logs) ? res.logs : [];
    for (const item of logs) {
      const id2 = Number(item.id || 0);
      if (id2 > lastRustLogId) lastRustLogId = id2;
      const level = item.level || "info";
      const scope2 = String(item.scope || "Rust");
      const message = String(item.message || "");
      if (!message) continue;
      const record = {
        id: `rust-${id2 || Date.now()}-${seq += 1}`,
        ts: Number(item.ts) || Date.now(),
        level: ["debug", "info", "warn", "error", "log"].includes(level) ? level : "info",
        scope: scope2,
        message: `[${scope2}] ${message}`,
        details: item.details !== void 0 ? asText(item.details) : `[${scope2}] ${message}`
      };
      records.push(record);
    }
    if (logs.length) {
      if (records.length > MAX_MEMORY_LOGS) {
        records = records.slice(records.length - MAX_MEMORY_LOGS);
      }
      persistLogs();
      notifyListeners();
    }
  } catch {
  } finally {
    rustBridgeBusy = false;
  }
};
const initDebugLogger = () => {
  if (initialized || typeof window === "undefined") return;
  records = loadStoredLogs();
  patchConsole();
  patchFetch();
  initialized = true;
  pushRecord("info", ["[Bootstrap] 调试日志模块已初始化"]);
  void pullRuntimeLogsFromRust();
  if (rustPollTimer) clearInterval(rustPollTimer);
  rustPollTimer = setInterval(() => {
    void pullRuntimeLogsFromRust();
  }, 2e3);
};
const pushDebugLog = (scope2, message, level = "info", details) => {
  const prefix = `[${scope2 || "APP"}] ${message || ""}`.trim();
  const payload = details === void 0 ? [prefix] : [prefix, details];
  pushRecord(level, payload);
  if (typeof window === "undefined") return;
  if (rustBridgeBusy) return;
  if (String(scope2 || "") === "Native") return;
  void (async () => {
    try {
      await invokeSilent("push_runtime_log", {
        scope: scope2 || "Frontend",
        message: message || "",
        level,
        details: details === void 0 ? null : details
      });
    } catch {
    }
  })();
};
const getDebugLogs = (limit = MAX_MEMORY_LOGS) => {
  const max = Math.max(1, Number(limit) || MAX_MEMORY_LOGS);
  return records.slice(-max);
};
const clearDebugLogs = () => {
  records = [];
  persistLogs();
  notifyListeners();
};
const subscribeDebugLogs = (listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const formatDebugTime = (timestamp) => {
  const date = new Date(Number(timestamp) || Date.now());
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
};
const debug_logger = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  clearDebugLogs,
  formatDebugTime,
  getDebugLogs,
  initDebugLogger,
  pullRuntimeLogsFromRust,
  pushDebugLog,
  subscribeDebugLogs
}, Symbol.toStringTag, { value: "Module" }));
const TEST_ACCOUNT_SESSION_KEY = "hbu_test_account_session";
const TEST_ACCOUNT_LOGIN_METHOD = "test_account";
const TEST_ACCOUNT = Object.freeze({
  username: "reviewer",
  password: "Test2026",
  studentId: "2026000001",
  displayName: "TestFlight 测试账号"
});
const safeStorage = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};
const normalizeText = (value) => String(value ?? "").trim();
const isTestAccountCredentials = (username, password) => normalizeText(username).toLowerCase() === TEST_ACCOUNT.username && normalizeText(password) === TEST_ACCOUNT.password;
const isTestAccountStudentId = (studentId) => normalizeText(studentId) === TEST_ACCOUNT.studentId;
const markTestAccountSession = () => {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(TEST_ACCOUNT_SESSION_KEY, "1");
  storage.setItem("hbu_login_method", TEST_ACCOUNT_LOGIN_METHOD);
  storage.setItem("hbu_username", TEST_ACCOUNT.studentId);
  storage.setItem("hbu_remember", "false");
  storage.setItem("hbu_login_entry_mode", "portal");
  storage.removeItem("hbu_manual_logout");
  storage.removeItem("hbu_logout_reason");
  storage.removeItem("hbu_login_temporary");
};
const clearTestAccountSession = () => {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(TEST_ACCOUNT_SESSION_KEY);
  if (storage.getItem("hbu_login_method") === TEST_ACCOUNT_LOGIN_METHOD) {
    storage.removeItem("hbu_login_method");
  }
  if (isTestAccountStudentId(storage.getItem("hbu_username"))) {
    storage.removeItem("hbu_username");
  }
};
const isTestAccountSession = () => {
  const storage = safeStorage();
  if (!storage) return false;
  return storage.getItem(TEST_ACCOUNT_SESSION_KEY) === "1" || storage.getItem("hbu_login_method") === TEST_ACCOUNT_LOGIN_METHOD || isTestAccountStudentId(storage.getItem("hbu_username"));
};
const test_account = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  TEST_ACCOUNT,
  TEST_ACCOUNT_LOGIN_METHOD,
  TEST_ACCOUNT_SESSION_KEY,
  clearTestAccountSession,
  isTestAccountCredentials,
  isTestAccountSession,
  isTestAccountStudentId,
  markTestAccountSession
}, Symbol.toStringTag, { value: "Module" }));
const TEST_STUDENT_ID = TEST_ACCOUNT.studentId;
const TEST_SEMESTER = "2025-2026-1";
const TEST_SYNC_TIME = "2026-07-06T08:00:00+08:00";
const DEMO_DISABLED_MESSAGE = "演示账号不执行真实操作";
const clone = (value) => {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
};
const success = (payload = {}) => ({
  success: true,
  sync_time: TEST_SYNC_TIME,
  ...payload
});
const demoDisabled = (message = DEMO_DISABLED_MESSAGE) => ({
  success: false,
  demo_disabled: true,
  error: message,
  message
});
const resourceShareDisabled = () => ({
  ...demoDisabled(),
  url: "data:text/plain;charset=utf-8,Mini-HBUT%20TestFlight%20demo%20resource",
  needAuth: false
});
const semestersPayload = success({
  semesters: ["2025-2026-1", "2024-2025-2", "2024-2025-1"],
  current: TEST_SEMESTER
});
const studentInfo = {
  student_id: TEST_STUDENT_ID,
  name: TEST_ACCOUNT.displayName,
  gender: "男",
  grade: "2026",
  college: "计算机学院",
  major: "软件工程",
  class_name: "软工2601",
  ethnicity: "汉族",
  birth_date: "2006-09-01",
  phone: "000****0000",
  email: "demo.reviewer@example.com",
  id_number: "0000************00"
};
const studentInfoPayload = success({
  data: studentInfo,
  student_id: TEST_STUDENT_ID,
  name: TEST_ACCOUNT.displayName
});
const grades = [
  {
    xnxq: TEST_SEMESTER,
    term: TEST_SEMESTER,
    kcbh: "HBUT-DEMO-001",
    kcmc: "高等数学 A",
    course_name: "高等数学 A",
    xf: "4.0",
    course_credit: "4.0",
    hdxf: "4.0",
    earned_credit: "4.0",
    zhcj: "92",
    final_score: "92",
    xfjd: "4.20",
    kcxz: "必修",
    skjs: "演示教师"
  },
  {
    xnxq: TEST_SEMESTER,
    term: TEST_SEMESTER,
    kcbh: "HBUT-DEMO-002",
    kcmc: "程序设计基础",
    course_name: "程序设计基础",
    xf: "3.0",
    course_credit: "3.0",
    hdxf: "3.0",
    earned_credit: "3.0",
    zhcj: "88",
    final_score: "88",
    xfjd: "3.80",
    kcxz: "必修",
    skjs: "演示教师"
  },
  {
    xnxq: "2024-2025-2",
    term: "2024-2025-2",
    kcbh: "HBUT-DEMO-003",
    kcmc: "大学英语",
    course_name: "大学英语",
    xf: "2.0",
    course_credit: "2.0",
    hdxf: "2.0",
    earned_credit: "2.0",
    zhcj: "优秀",
    final_score: "优秀",
    xfjd: "4.50",
    kcxz: "公共基础",
    skjs: "演示教师"
  }
];
const gradesPayload = success({ data: grades });
const scheduleCourses = [
  {
    id: "demo-schedule-1",
    name: "高等数学 A",
    teacher: "演示教师",
    room: "一教 301",
    room_code: "一教 301",
    building: "第一教学楼",
    class_name: "软工2601",
    weekday: 1,
    period: 1,
    start_period: 1,
    end_period: 2,
    djs: 2,
    weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    week_text: "1-16周"
  },
  {
    id: "demo-schedule-2",
    name: "程序设计基础",
    teacher: "演示教师",
    room: "实训楼 502",
    room_code: "实训楼 502",
    building: "实训楼",
    class_name: "软工2601",
    weekday: 3,
    period: 5,
    start_period: 5,
    end_period: 6,
    djs: 2,
    weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    week_text: "1-16周"
  },
  {
    id: "demo-schedule-3",
    name: "大学英语",
    teacher: "演示教师",
    room: "三教 204",
    room_code: "三教 204",
    building: "第三教学楼",
    class_name: "软工2601",
    weekday: 5,
    period: 3,
    start_period: 3,
    end_period: 4,
    djs: 2,
    weeks: [1, 3, 5, 7, 9, 11, 13, 15],
    week_text: "单周"
  }
];
const schedulePayload = success({
  data: scheduleCourses,
  meta: {
    semester: TEST_SEMESTER,
    start_date: "2026-03-02",
    current_week: 8,
    total_weeks: 20,
    vacation_notice: ""
  }
});
const examsPayload = success({
  data: [
    {
      course_name: "高等数学 A",
      exam_date: "2026-07-15",
      exam_time: "09:00-11:00",
      location: "一教 201",
      seat_no: "18"
    },
    {
      course_name: "程序设计基础",
      exam_date: "2026-07-18",
      exam_time: "14:00-16:00",
      location: "实训楼 401",
      seat_no: "06"
    }
  ]
});
const rankingPayload = success({
  data: {
    student_id: TEST_STUDENT_ID,
    name: TEST_ACCOUNT.displayName,
    major: "软件工程",
    gpa: "3.86",
    avg_score: "90.2",
    gpa_class_rank: 3,
    gpa_class_total: 42,
    gpa_major_rank: 12,
    gpa_major_total: 180,
    gpa_college_rank: 36,
    gpa_college_total: 640,
    avg_class_rank: 4,
    avg_class_total: 42,
    avg_major_rank: 15,
    avg_major_total: 180,
    avg_college_rank: 41,
    avg_college_total: 640
  }
});
const calendarPayload = success({
  data: [
    {
      ny: "2026-03",
      zc: 1,
      monday: "2",
      tuesday: "3",
      wednesday: "4",
      thursday: "5",
      friday: "6",
      saturday: "7",
      sunday: "8",
      bz: "开学周"
    },
    {
      ny: "2026-03",
      zc: 2,
      monday: "9",
      tuesday: "10",
      wednesday: "11",
      thursday: "12",
      friday: "13",
      saturday: "14",
      sunday: "15",
      bz: ""
    }
  ],
  meta: {
    semester: TEST_SEMESTER,
    current_week: 8
  }
});
const academicPayload = success({
  data: {
    summary: {
      gpa: "3.86",
      pjcj: "90.2",
      hdzxf: "9.0",
      yxkms: "3",
      bjgms: "0",
      gpazypm: "12/180",
      xwjdpm: "12/180"
    },
    tree: [
      {
        nodeId: "demo-required",
        nodeName: "公共基础与专业基础",
        yqzdxf: "9",
        yqzgxf: "12",
        kcList: grades.map((item) => ({
          kcbh: item.kcbh,
          kcmc: item.kcmc,
          xf: item.xf,
          hdxf: item.hdxf,
          xfjd: item.xfjd,
          zhcj: item.zhcj,
          xnxq: item.xnxq,
          kcxz: item.kcxz,
          skjs: item.skjs,
          wczt: "已修通过"
        }))
      }
    ]
  }
});
const trainingOptionsPayload = success({
  options: {
    grade: [{ value: "2026", label: "2026级" }],
    kkxq: [{ value: TEST_SEMESTER, label: TEST_SEMESTER }],
    kkyx: [{ value: "demo-college", label: "计算机学院" }],
    kkjys: [{ value: "demo-jys", label: "软件工程系" }],
    kcxz: [{ value: "必修", label: "必修" }, { value: "公共基础", label: "公共基础" }],
    kcgs: [{ value: "理论", label: "理论" }, { value: "实验", label: "实验" }]
  },
  defaults: {
    grade: "2026",
    kkxq: TEST_SEMESTER,
    kkyx: "demo-college",
    kkjys: "demo-jys"
  }
});
const trainingCoursesPayload = success({
  data: grades.map((item, index2) => ({
    id: `demo-training-${index2 + 1}`,
    kcbh: item.kcbh,
    kcmc: item.kcmc,
    xf: item.xf,
    kcxz: item.kcxz,
    kcgs: index2 === 1 ? "实验" : "理论",
    kkyxmc: "计算机学院",
    kkjysmc: "软件工程系",
    kkxq: item.xnxq
  })),
  page: 1,
  total: grades.length,
  totalPages: 1
});
const electricityPayload = success({
  balance: "42.60",
  quantity: "128.50",
  status: "正常"
});
const classroomBuildingsPayload = success({
  data: ["第一教学楼", "第三教学楼", "实训楼"]
});
const classroomPayload = success({
  data: [
    { building: "第一教学楼", room: "101", room_name: "一教 101", capacity: 80, seats: 80 },
    { building: "第一教学楼", room: "203", room_name: "一教 203", capacity: 60, seats: 60 },
    { building: "第三教学楼", room: "204", room_name: "三教 204", capacity: 72, seats: 72 }
  ],
  meta: {
    date_str: "2026-07-06",
    week: 8,
    weekday: 1,
    weekday_name: "周一",
    semester: TEST_SEMESTER,
    periods: [1, 2, 3, 4]
  }
});
const loginAccessPayload = success({
  data: {
    current_login: {
      client_ip: "127.0.0.1",
      ip_location: "TestFlight 演示环境",
      login_time: TEST_SYNC_TIME,
      browser: "Mini HBUT Demo"
    },
    current_logins: [
      {
        client_ip: "127.0.0.1",
        ip_location: "TestFlight 演示环境",
        login_time: TEST_SYNC_TIME,
        browser: "Mini HBUT Demo"
      }
    ],
    app_access_records: [
      {
        app_name: "mini-hbut",
        access_time: TEST_SYNC_TIME,
        auth_result: "成功",
        browser: "Mini HBUT Demo"
      }
    ],
    auth_info: {
      phone_verified: true,
      phone: "138****2026",
      email_verified: true,
      email: "reviewer@example.com",
      password_hint: "演示账号"
    },
    app_access_pagination: {
      page: 1,
      page_size: 10,
      total: 1,
      total_pages: 1
    }
  }
});
const libraryDictPayload = success({
  data: {
    resourceType: [{ code: "BK", name: "图书" }],
    publisher: [{ code: "demo-publisher", name: "高等教育出版社" }],
    author: [{ code: "demo-author", name: "演示作者" }],
    discode1: [{ code: "TP", name: "计算机技术" }],
    langCode: [{ code: "chi", name: "中文" }],
    countryCode: [{ code: "CN", name: "中国" }],
    locationId: [{ code: "demo-lib", name: "南湖校区图书馆" }]
  }
});
const libraryBook = {
  recordId: "demo-book-1",
  title: "软件工程导论",
  author: "演示作者",
  publisher: "高等教育出版社",
  publishYear: "2024",
  isbn: "9787040000000",
  callNo: ["TP311.5/DEMO"],
  locationName: "南湖校区图书馆",
  processTypeName: "可借"
};
const librarySearchPayload = success({
  data: {
    searchResult: [libraryBook],
    numFound: 1,
    facetResult: {
      resourceType: { BK: 1 },
      publisher: { demo_publisher: 1 },
      author: { demo_author: 1 },
      discode1: { TP: 1 },
      langCode: { chi: 1 },
      countryCode: { CN: 1 },
      locationId: { demo_lib: 1 }
    }
  }
});
const libraryDetailPayload = success({
  data: {
    detail: {
      ...libraryBook,
      adstract: "这是演示账号预置的图书详情，用于 TestFlight 审核浏览。"
    },
    holding: {
      orderFlag: "0"
    },
    holding_items: [
      {
        locationName: "南湖校区图书馆",
        callNo: "TP311.5/DEMO",
        statusName: "在架"
      }
    ]
  }
});
const courseSelectionOverviewPayload = success({
  data: {
    tabs: [
      {
        xkgzid: "demo-batch",
        xkgzMc: "演示选课批次",
        kklx: "01"
      }
    ],
    pcencs: {
      "demo-batch": "demo-pcenc"
    },
    has_valid_pcencs: true,
    message: "演示账号仅展示选课流程，不允许提交真实选课。"
  }
});
const courseSelectionListPayload = success({
  data: {
    condition: {},
    available_ratio: "100",
    occupied_slots: [],
    count: 1,
    courses: [
      {
        id: "demo-course-selection-1",
        jxbid: "demo-course-selection-1",
        kcmc: "创新创业基础",
        kcbh: "DEMO-XK-001",
        teacher: "演示教师",
        xf: "2.0",
        kcxz: "通识选修",
        schedule: "周二第7-8节",
        capacity: 80,
        selected: 12
      }
    ],
    message: ""
  }
});
const campusCodeConfigPayload = success({
  resultData: {
    disableOnline: false,
    enableOffline: true,
    refreshSecond: 60
  }
});
const campusCodePayload = success({
  resultData: {
    qrcode: `MINI-HBUT-DEMO-${TEST_STUDENT_ID}`,
    balance: "88.80",
    idSerial: TEST_STUDENT_ID,
    userName: TEST_ACCOUNT.displayName
  }
});
const qxzkbOptionsPayload = success({
  data: {
    xnxq: [{ value: TEST_SEMESTER, label: TEST_SEMESTER }],
    yx: [{ value: "demo-college", label: "计算机学院" }],
    nj: [{ value: "2026", label: "2026级" }]
  }
});
const onlineLearningPayload = success({
  data: {
    connected: true,
    status: "ready",
    message: "演示账号学习平台数据",
    courses: [
      {
        id: "demo-online-1",
        course_id: "demo-online-course",
        clazz_id: "demo-online-class",
        title: "软件工程导论",
        teacher: "演示教师",
        progress_text: "已完成 65%",
        progress_rate: 65,
        pending_count: 2
      }
    ]
  }
});
const onlineOutlinePayload = success({
  data: {
    sections: [
      {
        id: "demo-section-1",
        title: "第一章 软件工程概述",
        tasks: [
          {
            id: "demo-task-1",
            title: "课程导学",
            type: "video",
            status: "已完成",
            progress: "100%"
          },
          {
            id: "demo-task-2",
            title: "章节测验",
            type: "quiz",
            status: "未完成",
            progress: "0%"
          }
        ]
      }
    ]
  }
});
const schoolInboxPayload = {
  items: [
    {
      id: "demo-inbox-1",
      title: "TestFlight 演示通知",
      summary: "这是演示账号的预置消息。",
      body: "<p>这是演示账号的预置消息内容，用于审核人员浏览学校消息模块。</p>",
      createdAt: TEST_SYNC_TIME,
      isRead: false,
      source: "portal"
    }
  ],
  fetchedAt: TEST_SYNC_TIME,
  source: "portal"
};
const forumCategories = [
  { id: 1, slug: "campus", name: "校园广场", description: "TestFlight 演示校园交流" },
  { id: 2, slug: "study", name: "学习互助", description: "演示账号预置学习讨论" }
];
const forumThreads = [
  {
    id: 101,
    category_id: 1,
    title: "TestFlight 演示帖",
    content_md: "这是演示账号预置的社区帖子，不会连接真实论坛服务。",
    author_student_id: TEST_STUDENT_ID,
    created_at: TEST_SYNC_TIME,
    updated_at: TEST_SYNC_TIME,
    reply_count: 1,
    up_count: 3,
    down_count: 0,
    attachment_ids: []
  },
  {
    id: 102,
    category_id: 2,
    title: "课程资料互助演示",
    content_md: "这里展示学习互助模块的本地演示内容。",
    author_student_id: "2026000002",
    created_at: TEST_SYNC_TIME,
    updated_at: TEST_SYNC_TIME,
    reply_count: 0,
    up_count: 1,
    down_count: 0,
    attachment_ids: ["demo-forum-attachment"]
  }
];
const forumReplies = [
  {
    id: 201,
    thread_id: 101,
    content_md: "这是一条本地演示回复。",
    author_student_id: "2026000002",
    created_at: TEST_SYNC_TIME,
    up_count: 2,
    down_count: 0,
    attachment_ids: []
  }
];
const forumPolls = [
  {
    id: 301,
    title: "TestFlight 审核体验投票",
    description: "本地演示投票，不会写入远端。",
    status: "active",
    created_at: TEST_SYNC_TIME,
    my_vote_option_id: null,
    options: [
      { id: 1, label: "界面清晰", score: 10, votes: 8 },
      { id: 2, label: "功能完整", score: 9, votes: 6 },
      { id: 3, label: "需要改进", score: 3, votes: 1 }
    ]
  }
];
const forumProfile = {
  student_id: TEST_STUDENT_ID,
  nickname: TEST_ACCOUNT.displayName,
  avatar_url: "",
  bio: "TestFlight 本地演示社区资料",
  is_admin: false
};
const forumStats = {
  thread_count: 1,
  reply_count: 1,
  bookmark_count: 1,
  checkin_count: 3
};
const forumBadges = [
  { badge_key: "reviewer", display_name: "审核体验官" }
];
const forumDemoDisabled = (message = "未知测试账号 forum 请求已拦截") => ({
  success: false,
  demo_disabled: true,
  error: message,
  message
});
const resourceShareXml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype><d:getcontentlength>0</d:getcontentlength></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/TestFlight演示资料/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype><d:getcontentlength>0</d:getcontentlength></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/TestFlight演示资料/使用说明.txt</d:href>
    <d:propstat><d:prop><d:resourcetype/><d:getcontentlength>128</d:getcontentlength><d:getcontenttype>text/plain</d:getcontenttype></d:prop></d:propstat>
  </d:response>
</d:multistatus>`;
const cachePayloads = /* @__PURE__ */ new Map([
  ["semesters", semestersPayload],
  [`grades:${TEST_STUDENT_ID}`, gradesPayload],
  [`schedule:${TEST_STUDENT_ID}`, schedulePayload],
  [`schedule:${TEST_STUDENT_ID}:${TEST_SEMESTER}`, schedulePayload],
  [`studentinfo:${TEST_STUDENT_ID}`, studentInfoPayload],
  [`student_info:${TEST_STUDENT_ID}`, studentInfoPayload],
  [`exams:${TEST_STUDENT_ID}:current`, examsPayload],
  [`exams:${TEST_STUDENT_ID}:${TEST_SEMESTER}`, examsPayload],
  [`ranking:${TEST_STUDENT_ID}`, rankingPayload],
  [`ranking:${TEST_STUDENT_ID}:all`, rankingPayload],
  [`ranking:${TEST_STUDENT_ID}:current`, rankingPayload],
  [`ranking:${TEST_STUDENT_ID}:${TEST_SEMESTER}`, rankingPayload],
  [`calendar:${TEST_STUDENT_ID}:current`, calendarPayload],
  [`calendar:${TEST_STUDENT_ID}:${TEST_SEMESTER}`, calendarPayload],
  [`academic:${TEST_STUDENT_ID}:1`, academicPayload],
  [`academic:${TEST_STUDENT_ID}:0`, academicPayload],
  [`academic:${TEST_STUDENT_ID}:2`, academicPayload],
  [`academic:${TEST_STUDENT_ID}:4`, academicPayload],
  [`training:options:${TEST_STUDENT_ID}`, trainingOptionsPayload],
  [`training:jys:${TEST_STUDENT_ID}:demo-college`, success({ data: trainingOptionsPayload.options.kkjys })],
  [`electricity:${TEST_STUDENT_ID}:light`, electricityPayload],
  ["classroom:buildings", classroomBuildingsPayload]
]);
const getTestAccountGrades = () => clone(grades);
const seedTestAccountCaches = (setCachedData, studentId = TEST_STUDENT_ID) => {
  if (typeof setCachedData !== "function") return [];
  const sid = String(studentId || TEST_STUDENT_ID).trim() || TEST_STUDENT_ID;
  const entries = [
    [`grades:${sid}`, gradesPayload],
    [`schedule:${sid}`, schedulePayload],
    [`schedule:${sid}:${TEST_SEMESTER}`, schedulePayload],
    [`studentinfo:${sid}`, studentInfoPayload],
    [`student_info:${sid}`, studentInfoPayload],
    [`exams:${sid}:current`, examsPayload],
    [`exams:${sid}:${TEST_SEMESTER}`, examsPayload],
    [`ranking:${sid}:current`, rankingPayload],
    [`ranking:${sid}:all`, rankingPayload],
    [`calendar:${sid}:current`, calendarPayload],
    [`calendar:${sid}:${TEST_SEMESTER}`, calendarPayload],
    [`academic:${sid}:1`, academicPayload],
    [`training:options:${sid}`, trainingOptionsPayload],
    [`training:jys:${sid}:demo-college`, success({ data: trainingOptionsPayload.options.kkjys })],
    [`training:${sid}:1:${JSON.stringify(trainingOptionsPayload.defaults)}`, trainingCoursesPayload],
    [`electricity:${sid}:light`, electricityPayload]
  ];
  entries.forEach(([key, payload]) => setCachedData(key, clone(payload)));
  return entries.map(([key]) => key);
};
const resolveTestAccountCachePayload = (key) => {
  const text = String(key || "").trim();
  if (!text) return null;
  if (cachePayloads.has(text)) return clone(cachePayloads.get(text));
  if (text.startsWith(`grades:${TEST_STUDENT_ID}`)) return clone(gradesPayload);
  if (text.startsWith(`schedule:${TEST_STUDENT_ID}`)) return clone(schedulePayload);
  if (text.startsWith(`studentinfo:${TEST_STUDENT_ID}`) || text.startsWith(`student_info:${TEST_STUDENT_ID}`)) return clone(studentInfoPayload);
  if (text.startsWith(`exams:${TEST_STUDENT_ID}`)) return clone(examsPayload);
  if (text.startsWith(`ranking:${TEST_STUDENT_ID}`)) return clone(rankingPayload);
  if (text.startsWith(`calendar:${TEST_STUDENT_ID}`)) return clone(calendarPayload);
  if (text.startsWith(`academic:${TEST_STUDENT_ID}`)) return clone(academicPayload);
  if (text.startsWith(`training:options:${TEST_STUDENT_ID}`)) return clone(trainingOptionsPayload);
  if (text.startsWith(`training:jys:${TEST_STUDENT_ID}`)) return success({ data: clone(trainingOptionsPayload.options.kkjys) });
  if (text.startsWith(`training:${TEST_STUDENT_ID}:`)) return clone(trainingCoursesPayload);
  if (text.startsWith(`electricity:${TEST_STUDENT_ID}:`)) return clone(electricityPayload);
  if (text.startsWith("classroom:")) return text === "classroom:buildings" ? clone(classroomBuildingsPayload) : clone(classroomPayload);
  return null;
};
const resolveTestAccountHttpResponse = (method, url, data = {}) => {
  const httpMethod = String(method || "").toLowerCase();
  const path = String(url || "");
  if (httpMethod === "post" && path.includes("/v2/start_login")) {
    if (!isTestAccountCredentials(data?.username, data?.password)) return null;
    return success({
      data: {
        student_id: TEST_STUDENT_ID,
        name: TEST_ACCOUNT.displayName,
        login_method: "test_account"
      }
    });
  }
  if (httpMethod === "get" && path.includes("/v2/semesters")) return clone(semestersPayload);
  if (httpMethod === "get" && path.includes("/v2/qxzkb/options")) return clone(qxzkbOptionsPayload);
  if (httpMethod === "get" && path.includes("/v2/classroom/buildings")) return clone(classroomBuildingsPayload);
  if (httpMethod !== "post") return null;
  if (path.includes("/v2/quick_fetch")) return clone(gradesPayload);
  if (path.includes("/v2/grade_teacher")) return success({ by_kcbh: {}, semesters: {} });
  if (path.includes("/v2/schedule/custom/list")) return success({ data: [] });
  if (path.includes("/v2/schedule/custom/add") || path.includes("/v2/schedule/custom/update") || path.includes("/v2/schedule/custom/delete")) return demoDisabled();
  if (path.includes("/v2/schedule/export_calendar")) return success({ url: "mini-hbut-demo-calendar://readonly" });
  if (path.includes("/v2/schedule/query")) return clone(schedulePayload);
  if (path.includes("/v2/student_login_access")) return clone(loginAccessPayload);
  if (path.includes("/v2/student_info")) return clone(studentInfoPayload);
  if (path.includes("/v2/exams")) return clone(examsPayload);
  if (path.includes("/v2/ranking")) return clone(rankingPayload);
  if (path.includes("/v2/calendar")) return clone(calendarPayload);
  if (path.includes("/v2/academic_progress")) return clone(academicPayload);
  if (path.includes("/v2/classroom/query")) return clone(classroomPayload);
  if (path.includes("/v2/training_plan/options")) return clone(trainingOptionsPayload);
  if (path.includes("/v2/training_plan/jys")) return success({ data: clone(trainingOptionsPayload.options.kkjys) });
  if (path.includes("/v2/training_plan")) return clone(trainingCoursesPayload);
  if (path.includes("/v2/electricity/balance")) return clone(electricityPayload);
  if (path.includes("/v2/campus_code/config")) return clone(campusCodeConfigPayload);
  if (path.includes("/v2/campus_code/qrcode")) return clone(campusCodePayload);
  if (path.includes("/v2/campus_code/order_status")) return success({ resultData: { status: "5" } });
  if (path.includes("/v2/library/dict")) return clone(libraryDictPayload);
  if (path.includes("/v2/library/search")) return clone(librarySearchPayload);
  if (path.includes("/v2/library/detail")) return clone(libraryDetailPayload);
  if (path.includes("/v2/qxzkb/jcinfo")) return success({ data: [] });
  if (path.includes("/v2/qxzkb/zyxx")) return success({ data: [] });
  if (path.includes("/v2/qxzkb/kkjys")) return success({ data: [] });
  if (path.includes("/v2/qxzkb/query")) return success({ data: [] });
  if (path.includes("/v2/course_selection/overview")) return clone(courseSelectionOverviewPayload);
  if (path.includes("/v2/course_selection/list")) return clone(courseSelectionListPayload);
  if (path.includes("/v2/course_selection/end_time")) return success({ data: { remaining_seconds: 3600, countdown_text: "01:00:00", is_preview: false } });
  if (path.includes("/v2/course_selection/selected_courses")) return success({ data: { courses: [] } });
  if (path.includes("/v2/course_selection/child_classes")) return success({ data: { classes: [] } });
  if (path.includes("/v2/course_selection/select") || path.includes("/v2/course_selection/withdraw")) return demoDisabled();
  if (path.includes("/v2/course_selection/detail_intro")) return success({ data: { intro: "演示课程说明。" } });
  if (path.includes("/v2/course_selection/detail_teacher")) return success({ data: { teachers: [{ name: "演示教师", title: "讲师" }] } });
  if (path.includes("/v2/online_learning/sync_now") || path.includes("/v2/online_learning/clear_cache")) return demoDisabled();
  if (path.includes("/v2/online_learning/overview")) return clone(onlineLearningPayload);
  if (path.includes("/v2/online_learning/sync_runs")) return success({ data: { runs: [] } });
  if (path.includes("/v2/chaoxing/session_status")) return success({ data: { connected: true, status: "ready", message: "演示会话已连接" } });
  if (path.includes("/v2/chaoxing/courses") || path.includes("/v2/yuketang/courses")) return clone(onlineLearningPayload);
  if (path.includes("/v2/chaoxing/course_outline") || path.includes("/v2/yuketang/course_outline")) return clone(onlineOutlinePayload);
  if (path.includes("/v2/chaoxing/course_progress") || path.includes("/v2/yuketang/course_progress")) return success({ data: { percent: 65, progress_text: "已完成 65%" } });
  if (path.includes("/v2/chaoxing/knowledge_cards") || path.includes("/v2/chaoxing/video_status") || path.includes("/v2/yuketang/course_chapters") || path.includes("/v2/yuketang/leaf_info")) return clone(onlineOutlinePayload);
  if (path.includes("/v2/chaoxing/report_progress") || path.includes("/v2/yuketang/heartbeat") || path.includes("/v2/chaoxing/launch_url") || path.includes("/v2/yuketang/qr_login")) return demoDisabled();
  return null;
};
const resolveTestAccountNativeResponse = (command, args = {}) => {
  const name = String(command || "").trim();
  if (!name) return null;
  if (name === "fetch_student_info") return clone(studentInfoPayload);
  if (name === "sync_grades") return clone(gradesPayload);
  if (name === "sync_schedule") return clone(schedulePayload);
  if (name === "fetch_semesters") return clone(semestersPayload);
  if (name === "fetch_exams") return clone(examsPayload);
  if (name === "fetch_ranking") return clone(rankingPayload);
  if (name === "fetch_calendar_data") return clone(calendarPayload);
  if (name === "fetch_academic_progress") return clone(academicPayload);
  if (name === "fetch_training_plan_options") return clone(trainingOptionsPayload);
  if (name === "fetch_training_plan_jys") return success({ data: clone(trainingOptionsPayload.options.kkjys) });
  if (name === "fetch_training_plan_courses") return clone(trainingCoursesPayload);
  if (name === "fetch_classroom_buildings") return clone(classroomBuildingsPayload);
  if (name === "fetch_classrooms") return clone(classroomPayload);
  if (name === "fetch_personal_login_access_info") return clone(loginAccessPayload);
  if (name === "get_grade_teacher_cache" || name === "sync_grade_teachers_current_semester") return success({ by_kcbh: {}, semesters: {} });
  if (name === "list_custom_schedule_courses" || name === "list_all_custom_schedule_courses") return success({ data: [] });
  if (name === "add_custom_schedule_course" || name === "update_custom_schedule_course" || name === "delete_custom_schedule_course") return demoDisabled();
  if (name === "export_schedule_calendar") return success({ url: "mini-hbut-demo-calendar://readonly" });
  if (name === "electricity_query_account") {
    return {
      success: true,
      resultData: {
        utilityStatusName: "正常",
        sync_time: TEST_SYNC_TIME,
        templateList: [
          { code: "balance", value: "42.60" },
          { code: "quantity", value: "128.50" }
        ]
      }
    };
  }
  if (name.startsWith("campus_code_")) {
    if (name.includes("config")) return clone(campusCodeConfigPayload);
    if (name.includes("qrcode")) return clone(campusCodePayload);
    return success({ resultData: { status: "5" } });
  }
  if (name.startsWith("fetch_library") || name.startsWith("search_library")) {
    if (name.includes("dict")) return clone(libraryDictPayload);
    return clone(librarySearchPayload);
  }
  if (name === "fetch_library_book_detail") return clone(libraryDetailPayload);
  if (name.startsWith("fetch_qxzkb")) return success({ data: [] });
  if (name.includes("course_selection")) {
    if (name.includes("select_") || name.includes("withdraw")) return demoDisabled();
    return success({ data: {} });
  }
  if (name.startsWith("online_learning") || name.startsWith("chaoxing_") || name.startsWith("yuketang_")) {
    if (name.includes("sync") || name.includes("clear") || name.includes("report") || name.includes("heartbeat") || name.includes("qr_login")) return demoDisabled();
    return clone(onlineLearningPayload);
  }
  if (name === "fetch_transaction_history") return success({ data: [] });
  if (name === "school_inbox_fetch") return clone(schoolInboxPayload);
  if (name === "school_inbox_detail_fetch") {
    const fallback = args?.fallback && typeof args.fallback === "object" ? args.fallback : schoolInboxPayload.items[0];
    return { ...clone(fallback), body: fallback.body || schoolInboxPayload.items[0].body };
  }
  if (name === "school_inbox_mark_read") return { success: true };
  if (name === "resource_share_list_dir_native") return { success: true, xml: resourceShareXml };
  if (name === "resource_share_direct_url_native") return resourceShareDisabled();
  if (name === "resource_share_fetch_file_payload_native") return demoDisabled();
  if (name === "get_cookies") return "";
  if (name === "restore_session" || name === "restore_latest_session" || name === "login") return { student_id: TEST_STUDENT_ID, name: TEST_ACCOUNT.displayName };
  if (name === "logout" || name === "refresh_session" || name === "set_offline_user_context") return { success: true };
  if (name === "refresh_electricity_token") return { success: true };
  if (name === "get_ocr_runtime_status") return { success: true, status: "disabled", demo: true };
  if (name === "hbut_ai_init" || name === "hbut_ai_chat" || name === "hbut_ai_upload") return demoDisabled("演示账号不调用 AI 服务");
  return null;
};
const parseForumPath = (path) => {
  try {
    return new URL(String(path || "/"), "https://mini-hbut.local");
  } catch {
    return new URL("/", "https://mini-hbut.local");
  }
};
const isFormDataPayload = (value) => typeof FormData !== "undefined" && value instanceof FormData;
const normalizeForumBody = (body) => body && typeof body === "object" && !isFormDataPayload(body) ? body : {};
const findForumThread = (threadId) => {
  const id2 = Number(threadId || 0);
  return forumThreads.find((thread) => Number(thread.id) === id2) || forumThreads[0];
};
const resolveTestAccountForumResponse = (path, options = {}) => {
  const method = String(options?.method || "GET").toUpperCase();
  const url = parseForumPath(path);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const body = normalizeForumBody(options?.body);
  if (pathname === "/auth/token") {
    return {
      token: "test-account-forum-token",
      expires_at: 4102444800
    };
  }
  if (method === "GET" && pathname === "/categories") {
    return { items: clone(forumCategories) };
  }
  if (method === "POST" && pathname === "/categories") {
    return {
      id: Number(body.id || 99),
      slug: String(body.slug || "demo").trim() || "demo",
      name: String(body.name || "演示版块").trim() || "演示版块",
      description: String(body.description || "").trim()
    };
  }
  if (method === "GET" && pathname === "/threads/hot") {
    return { items: clone(forumThreads) };
  }
  if (method === "GET" && pathname === "/threads") {
    const categoryId = Number(url.searchParams.get("category_id") || 0);
    const items2 = categoryId ? forumThreads.filter((thread) => Number(thread.category_id) === categoryId) : forumThreads;
    return { items: clone(items2) };
  }
  if (method === "GET" && pathname === "/search") {
    const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const items2 = query ? forumThreads.filter(
      (thread) => `${thread.title} ${thread.content_md}`.toLowerCase().includes(query)
    ) : forumThreads;
    return { items: clone(items2) };
  }
  if (method === "POST" && pathname === "/threads") {
    return {
      ...clone(forumThreads[0]),
      id: 901,
      category_id: Number(body.category_id || forumCategories[0].id),
      title: String(body.title || "演示新帖").trim() || "演示新帖",
      content_md: String(body.content_md || "演示账号本地发帖内容").trim(),
      attachment_ids: Array.isArray(body.attachment_ids) ? clone(body.attachment_ids) : [],
      reply_count: 0,
      created_at: TEST_SYNC_TIME,
      updated_at: TEST_SYNC_TIME
    };
  }
  const threadMatch = pathname.match(/^\/threads\/([^/]+)$/);
  if (method === "GET" && threadMatch) {
    const thread = findForumThread(threadMatch[1]);
    return {
      thread: clone(thread),
      replies: Number(thread.id) === 101 ? clone(forumReplies) : []
    };
  }
  const replyMatch = pathname.match(/^\/threads\/([^/]+)\/replies$/);
  if (method === "POST" && replyMatch) {
    return {
      id: 902,
      thread_id: Number(replyMatch[1] || 0),
      content_md: String(body.content_md || "演示账号本地回复").trim(),
      author_student_id: TEST_STUDENT_ID,
      created_at: TEST_SYNC_TIME,
      up_count: 0,
      down_count: 0,
      attachment_ids: Array.isArray(body.attachment_ids) ? clone(body.attachment_ids) : []
    };
  }
  if (method === "POST" && (/^\/posts\/[^/]+\/reactions$/.test(pathname) || /^\/threads\/[^/]+\/bookmark$/.test(pathname) || pathname === "/follows" || pathname === "/reports" || pathname === "/messages" || pathname === "/checkins")) {
    return { success: true, demo: true };
  }
  if (method === "GET" && pathname === "/polls") {
    return { items: clone(forumPolls) };
  }
  if (method === "POST" && /^\/polls\/[^/]+\/votes$/.test(pathname)) {
    return {
      ...clone(forumPolls[0]),
      my_vote_option_id: Number(body.option_id || forumPolls[0].options[0].id)
    };
  }
  if (method === "POST" && pathname === "/admin/polls") {
    return {
      id: 903,
      title: String(body.title || "演示管理员投票").trim() || "演示管理员投票",
      description: String(body.description || "").trim(),
      status: "active",
      created_at: TEST_SYNC_TIME,
      my_vote_option_id: null,
      options: Array.isArray(body.options) ? body.options.map((option, index2) => ({
        id: index2 + 1,
        label: String(option.label || `选项 ${index2 + 1}`).trim(),
        score: Number(option.score || 0),
        votes: 0
      })) : clone(forumPolls[0].options)
    };
  }
  if (method === "POST" && /^\/admin\/polls\/[^/]+\/close$/.test(pathname)) {
    return {
      ...clone(forumPolls[0]),
      status: "closed"
    };
  }
  if (method === "GET" && pathname === "/me/summary") {
    return {
      profile: clone(forumProfile),
      stats: clone(forumStats)
    };
  }
  if (method === "GET" && pathname === "/me/threads") return { items: clone(forumThreads.slice(0, 1)) };
  if (method === "GET" && pathname === "/me/replies") {
    return {
      items: forumReplies.map((reply) => ({
        ...clone(reply),
        thread_title: forumThreads.find((thread) => Number(thread.id) === Number(reply.thread_id))?.title || "演示帖子"
      }))
    };
  }
  if (method === "GET" && pathname === "/me/bookmarks") return { items: clone(forumThreads.slice(1, 2)) };
  if (method === "GET" && pathname === "/notifications") {
    return {
      items: [
        {
          id: 401,
          title: "TestFlight 演示通知",
          content: "这是本地演示社区通知。",
          created_at: TEST_SYNC_TIME,
          is_read: 0
        }
      ]
    };
  }
  if (method === "GET" && pathname === "/messages") {
    return {
      items: [
        {
          id: 501,
          sender_student_id: "2026000002",
          receiver_student_id: TEST_STUDENT_ID,
          content: "欢迎体验 Mini-HBUT 社区演示。",
          created_at: TEST_SYNC_TIME
        }
      ]
    };
  }
  if (method === "GET" && pathname === "/badges") return { items: clone(forumBadges) };
  const userMatch = pathname.match(/^\/users\/([^/]+)$/);
  if (method === "GET" && userMatch) {
    const target = decodeURIComponent(userMatch[1]);
    return {
      profile: {
        ...clone(forumProfile),
        student_id: target,
        nickname: target === TEST_STUDENT_ID ? TEST_ACCOUNT.displayName : `演示用户 ${target.slice(-4)}`
      },
      stats: clone(forumStats),
      badges: clone(forumBadges)
    };
  }
  if (method === "POST" && pathname === "/attachments") {
    return {
      attachment_id: "demo-forum-attachment",
      url: "data:text/plain;charset=utf-8,Mini-HBUT%20forum%20demo%20attachment"
    };
  }
  if (method === "GET" && pathname === "/backups") return { items: [] };
  if (method === "GET" && pathname === "/admin/reports") return { items: [] };
  if (method === "GET" && pathname === "/admin/users") return { items: [] };
  if (method === "GET" && pathname === "/admin/backups") return { items: [] };
  if (method === "POST" && pathname.startsWith("/admin/")) {
    return { success: true, demo: true };
  }
  return forumDemoDisabled();
};
const isTauriRuntime = () => detectRuntime() === "tauri";
const isCapacitorRuntime = () => detectRuntime() === "capacitor";
const isLikelyIOSUserAgent = () => /(iphone|ipad|ipod)/i.test(String(globalThis?.navigator?.userAgent || ""));
const isLikelyAndroidUserAgent = () => /android/i.test(String(globalThis?.navigator?.userAgent || ""));
const isTauriDesktopRuntime = () => isTauriRuntime() && !isLikelyIOSUserAgent() && !isLikelyAndroidUserAgent();
const SILENT_NATIVE_COMMANDS = /* @__PURE__ */ new Set([
  "push_runtime_log",
  "get_runtime_logs",
  "clear_runtime_logs",
  "get_runtime_diag"
]);
const invokeNative$1 = async (command, args) => {
  const silent = SILENT_NATIVE_COMMANDS.has(command);
  if (isTestAccountSession()) {
    const testAccountResponse = resolveTestAccountNativeResponse(command, args);
    if (testAccountResponse !== null && testAccountResponse !== void 0) {
      if (!silent) {
        pushDebugLog("Native", `测试账号 invoke 命中演示数据：${command}`, "debug", args);
      }
      return testAccountResponse;
    }
    return {
      success: false,
      demo_disabled: true,
      error: "未知测试账号 invoke 已拦截"
    };
  }
  if (!isTauriRuntime()) {
    if (!silent) {
      pushDebugLog("Native", `invoke 调用被拒绝：${command}`, "warn");
    }
    throw new Error(`当前运行时不支持 invoke: ${command}`);
  }
  const startedAt = Date.now();
  if (!silent) {
    pushDebugLog("Native", `invoke 开始：${command}`, "debug", args);
  }
  const core$12 = await __vitePreload(() => Promise.resolve().then(() => core), true ? void 0 : void 0, import.meta.url);
  try {
    const result = await core$12.invoke(command, args);
    if (!silent) {
      pushDebugLog("Native", `invoke 成功：${command} (${Date.now() - startedAt}ms)`, "info");
    }
    return result;
  } catch (error2) {
    if (!silent) {
      pushDebugLog("Native", `invoke 失败：${command} (${Date.now() - startedAt}ms)`, "error", error2);
    }
    throw error2;
  }
};
const getCurrentNativeWindow = async () => {
  if (!isTauriRuntime()) return null;
  const windowApi = await __vitePreload(() => Promise.resolve().then(() => window$1), true ? void 0 : void 0, import.meta.url);
  return windowApi.getCurrentWindow();
};
const exitNativeApp = async () => {
  if (isTauriRuntime()) {
    await invokeNative$1("exit_app");
    return;
  }
  if (isCapacitorRuntime()) {
    try {
      const app2 = await __vitePreload(() => Promise.resolve().then(() => index$8), true ? void 0 : void 0, import.meta.url);
      await app2.App.exitApp();
      return;
    } catch {
    }
  }
  window.close();
};
const getNativeAppVersion = async () => {
  if (isTauriRuntime()) {
    const app$1 = await __vitePreload(() => Promise.resolve().then(() => app), true ? void 0 : void 0, import.meta.url);
    return await app$1.getVersion() || "";
  }
  if (isCapacitorRuntime()) {
    try {
      const app2 = await __vitePreload(() => Promise.resolve().then(() => index$8), true ? void 0 : void 0, import.meta.url);
      const info = await app2.App.getInfo();
      return info?.version || "";
    } catch {
      return "";
    }
  }
  return "";
};
const toNativeFileSrc = async (filePath) => {
  if (isTauriRuntime()) {
    const core$12 = await __vitePreload(() => Promise.resolve().then(() => core), true ? void 0 : void 0, import.meta.url);
    return core$12.convertFileSrc(filePath);
  }
  if (isCapacitorRuntime()) {
    const core2 = await __vitePreload(() => Promise.resolve().then(() => index$9), true ? void 0 : void 0, import.meta.url);
    return core2.Capacitor.convertFileSrc(filePath);
  }
  return filePath;
};
const readNativeBinaryFile = async (filePath) => {
  if (!isTauriRuntime()) {
    throw new Error("当前运行时不支持读取本地文件");
  }
  const fsPlugin = await __vitePreload(() => Promise.resolve().then(() => index$7), true ? void 0 : void 0, import.meta.url);
  return fsPlugin.readFile(filePath);
};
const native = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  exitNativeApp,
  getCurrentNativeWindow,
  getNativeAppVersion,
  invokeNative: invokeNative$1,
  isCapacitorRuntime,
  isLikelyAndroidUserAgent,
  isLikelyIOSUserAgent,
  isTauriDesktopRuntime,
  isTauriRuntime,
  readNativeBinaryFile,
  toNativeFileSrc
}, Symbol.toStringTag, { value: "Module" }));
const getWindow = () => typeof window === "undefined" ? void 0 : window;
const getCapacitor = () => getWindow()?.Capacitor;
const getPlugin = (name) => getCapacitor()?.Plugins?.[name];
let hbutNativeProxy = null;
const getRegisteredPlugin = async (name) => {
  const globalPlugin = getPlugin(name);
  if (globalPlugin) return { plugin: globalPlugin };
  try {
    const mod = await __vitePreload(() => Promise.resolve().then(() => index$9), true ? void 0 : void 0, import.meta.url);
    if (typeof mod.registerPlugin !== "function") return {};
    if (name === "HBUTNative") {
      hbutNativeProxy || (hbutNativeProxy = mod.registerPlugin("HBUTNative"));
      return { plugin: hbutNativeProxy };
    }
  } catch {
  }
  return {};
};
const getHBUTNativePlugin = async () => (await getRegisteredPlugin("HBUTNative")).plugin;
const getLocalNotifications = async () => {
  try {
    const mod = await __vitePreload(() => Promise.resolve().then(() => index$6), true ? void 0 : void 0, import.meta.url);
    if (mod?.LocalNotifications) return { plugin: mod.LocalNotifications };
  } catch {
  }
  return { plugin: getPlugin("LocalNotifications") };
};
const normalizePermission$2 = (value) => {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  return "prompt";
};
const openByAppLauncher = async (target) => {
  try {
    const mod = await __vitePreload(() => Promise.resolve().then(() => index$5), true ? void 0 : void 0, import.meta.url);
    const launcher = mod?.AppLauncher;
    if (!launcher?.openUrl) return false;
    await launcher.openUrl({ url: target });
    return true;
  } catch {
    return false;
  }
};
const capacitorBridge = {
  runtime: "capacitor",
  async openHttp(url) {
    const launched = await openByAppLauncher(url);
    if (launched) return true;
    try {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    } catch {
      return false;
    }
  },
  async openUri(target) {
    const launched = await openByAppLauncher(target);
    if (launched) return true;
    const browser = getPlugin("Browser");
    if (browser?.open) {
      try {
        await browser.open({ url: target });
        return true;
      } catch {
      }
    }
    try {
      window.open(target, "_blank", "noopener,noreferrer");
      return true;
    } catch {
      return false;
    }
  },
  async getNotificationPermission() {
    const { plugin: localNotifications } = await getLocalNotifications();
    if (!localNotifications?.checkPermissions) return "prompt";
    try {
      const result = await localNotifications.checkPermissions();
      return normalizePermission$2(result?.display);
    } catch {
      return "prompt";
    }
  },
  async requestNotificationPermission() {
    const { plugin: localNotifications } = await getLocalNotifications();
    if (!localNotifications?.requestPermissions) return "prompt";
    try {
      const result = await localNotifications.requestPermissions();
      return normalizePermission$2(result?.display);
    } catch {
      return "denied";
    }
  },
  async ensureNotificationChannel(channelId) {
    const { plugin: localNotifications } = await getLocalNotifications();
    if (!localNotifications?.createChannel) return true;
    try {
      await localNotifications.createChannel({
        id: channelId,
        name: "Mini-HBUT 通知",
        description: "课程、考试与系统提醒",
        importance: 4,
        visibility: 1
      });
      return true;
    } catch {
      return false;
    }
  },
  async sendLocalNotification(payload) {
    const { plugin: localNotifications } = await getLocalNotifications();
    if (!localNotifications?.schedule) return false;
    try {
      const id2 = payload.id ?? Math.floor(Date.now() % 2147483e3);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const notification = {
        id: id2,
        title: payload.title,
        body: payload.body || "",
        extra: {
          view: payload.targetView || "notifications"
        },
        schedule: {
          at: new Date(Date.now() + 1500),
          allowWhileIdle: !isIOS
        }
      };
      if (!isIOS && payload.channelId) {
        notification.channelId = payload.channelId;
      }
      await localNotifications.schedule({ notifications: [notification] });
      return true;
    } catch {
      return false;
    }
  },
  async addNotificationActionListener(listener) {
    const { plugin: localNotifications } = await getLocalNotifications();
    if (!localNotifications?.addListener) return null;
    try {
      const handle = await localNotifications.addListener(
        "localNotificationActionPerformed",
        (payload) => {
          listener(payload);
        }
      );
      return () => {
        try {
          void handle?.remove?.();
        } catch {
        }
      };
    } catch {
      return null;
    }
  },
  async keepScreenOn(enable) {
    if (!enable) return true;
    try {
      const nav = navigator;
      await nav?.wakeLock?.request?.("screen");
      return true;
    } catch {
      return false;
    }
  },
  async shareLinkOrFile(target, title2) {
    const share = getPlugin("Share");
    if (share?.share) {
      const t = String(target || "").trim();
      const titleText = title2 || "Mini-HBUT";
      const isLocalFile = /^file:\/\//i.test(t) || (/^[a-zA-Z]:[\\/]/.test(t) || t.startsWith("/")) && !/^https?:\/\//i.test(t);
      try {
        if (isLocalFile) {
          const fileUrl = t.startsWith("file:") ? t : t.startsWith("/") ? `file://${t}` : `file:///${t.replace(/\\/g, "/")}`;
          await share.share({
            title: titleText,
            dialogTitle: titleText || "保存或分享课件",
            files: [fileUrl],
            url: fileUrl
          });
          return true;
        }
        await share.share({
          title: titleText,
          text: titleText,
          url: t,
          dialogTitle: titleText
        });
        return true;
      } catch {
      }
    }
    return this.openUri(target);
  },
  async setAggressiveKeepAlive(enable) {
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      return {
        supported: false,
        active: false,
        source: "ios",
        reason: "iOS 不支持前台服务，后台任务由系统调度"
      };
    }
    const native2 = await getHBUTNativePlugin();
    if (!native2?.setForegroundService) {
      return {
        supported: false,
        active: false,
        source: "capacitor",
        reason: "未注册 HBUTNative 原生插件"
      };
    }
    try {
      const result = await native2.setForegroundService({ enabled: !!enable });
      return {
        supported: true,
        active: !!result?.active,
        source: String(result?.source || "android-foreground-service"),
        reason: String(result?.reason || "")
      };
    } catch (error2) {
      return {
        supported: true,
        active: false,
        source: "android-foreground-service",
        reason: String(error2 || "前台服务调用失败")
      };
    }
  },
  async getAggressiveKeepAliveState() {
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      return {
        supported: false,
        active: false,
        source: "ios",
        reason: "iOS 不支持前台服务，后台任务由系统调度"
      };
    }
    const plugin = await getHBUTNativePlugin();
    if (!plugin?.getForegroundServiceState) {
      return {
        supported: false,
        active: false,
        source: "capacitor",
        reason: "未注册 HBUTNative 原生插件"
      };
    }
    try {
      const result = await plugin.getForegroundServiceState();
      return {
        supported: true,
        active: !!result?.active,
        source: String(result?.source || "android-foreground-service"),
        reason: String(result?.reason || "")
      };
    } catch (error2) {
      return {
        supported: true,
        active: false,
        source: "android-foreground-service",
        reason: String(error2 || "前台服务状态读取失败")
      };
    }
  },
  async openBatteryOptimizationSettings() {
    const plugin = await getHBUTNativePlugin();
    if (plugin?.openBatteryOptimizationSettings) {
      try {
        const result = await plugin.openBatteryOptimizationSettings({});
        return !!result?.ok;
      } catch {
      }
    }
    try {
      const app2 = await __vitePreload(() => Promise.resolve().then(() => index$8), true ? void 0 : void 0, import.meta.url);
      await app2.App.openSettings();
      return true;
    } catch {
      return false;
    }
  },
  async openNotificationSettings() {
    const plugin = await getHBUTNativePlugin();
    if (plugin?.openNotificationSettings) {
      try {
        const result = await plugin.openNotificationSettings({});
        return !!result?.ok;
      } catch {
      }
    }
    try {
      const app2 = await __vitePreload(() => Promise.resolve().then(() => index$8), true ? void 0 : void 0, import.meta.url);
      await app2.App.openSettings();
      return true;
    } catch {
      return false;
    }
  }
};
let desktopKeepAliveActive = false;
const normalizePermission$1 = (value) => {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  return "prompt";
};
const invokeNative = async (command, args) => {
  const core$12 = await __vitePreload(() => Promise.resolve().then(() => core), true ? void 0 : void 0, import.meta.url);
  if (typeof args === "undefined") return core$12.invoke(command);
  return core$12.invoke(command, args);
};
const isWindowsRuntime = () => {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.userAgentData?.platform;
  return /Windows|Win32|Win64|WinCE/i.test(
    `${navigator.userAgent || ""} ${navigator.platform || ""} ${platform || ""}`
  );
};
const tryOpenWithRustFallback = async (target) => {
  try {
    await invokeNative("open_external_url", { url: target });
    return true;
  } catch {
    return false;
  }
};
const tryOpenDesktopPowerSettings = async () => {
  const ua = String(navigator.userAgent || "").toLowerCase();
  if (ua.includes("windows")) {
    return tryOpenWithRustFallback("ms-settings:batterysaver-settings");
  }
  if (ua.includes("mac os")) {
    return tryOpenWithRustFallback("x-apple.systempreferences:com.apple.Battery-Settings.extension");
  }
  return false;
};
const tauriBridge = {
  runtime: "tauri",
  async openHttp(url) {
    return this.openUri(url);
  },
  async openUri(target) {
    try {
      const shell = await __vitePreload(() => Promise.resolve().then(() => index$4), true ? void 0 : void 0, import.meta.url);
      await shell.open(target);
      return true;
    } catch {
      const encodedTarget = encodeURI(target);
      if (encodedTarget !== target) {
        try {
          const shell = await __vitePreload(() => Promise.resolve().then(() => index$4), true ? void 0 : void 0, import.meta.url);
          await shell.open(encodedTarget);
          return true;
        } catch {
        }
      }
      if (await tryOpenWithRustFallback(target)) return true;
      if (encodedTarget !== target) return tryOpenWithRustFallback(encodedTarget);
      return false;
    }
  },
  async getNotificationPermission() {
    try {
      const state = await invokeNative("get_notification_permission_native");
      return normalizePermission$1(String(state));
    } catch {
    }
    try {
      const mod = await __vitePreload(() => Promise.resolve().then(() => index$3), true ? void 0 : void 0, import.meta.url);
      const granted = await mod.isPermissionGranted();
      return granted ? "granted" : "prompt";
    } catch {
      return "prompt";
    }
  },
  async requestNotificationPermission() {
    try {
      const state = await invokeNative("request_notification_permission_native");
      return normalizePermission$1(String(state));
    } catch {
    }
    try {
      const mod = await __vitePreload(() => Promise.resolve().then(() => index$3), true ? void 0 : void 0, import.meta.url);
      const state = await mod.requestPermission();
      return normalizePermission$1(String(state));
    } catch {
      return "denied";
    }
  },
  async ensureNotificationChannel(channelId) {
    try {
      const mod = await __vitePreload(() => Promise.resolve().then(() => index$3), true ? void 0 : void 0, import.meta.url);
      await mod.createChannel({
        id: channelId,
        name: "Mini-HBUT 通知",
        description: "课程、考试与系统提醒",
        importance: mod.Importance.High,
        visibility: mod.Visibility.Private
      });
      return true;
    } catch {
      return false;
    }
  },
  async sendLocalNotification(payload) {
    try {
      await invokeNative("send_local_notification_native", {
        id: payload.id,
        channelId: payload.channelId,
        title: payload.title,
        body: payload.body,
        targetView: payload.targetView || "notifications"
      });
      return true;
    } catch {
      if (isWindowsRuntime()) return false;
    }
    try {
      const mod = await __vitePreload(() => Promise.resolve().then(() => index$3), true ? void 0 : void 0, import.meta.url);
      await mod.sendNotification({
        title: payload.title,
        body: payload.body
      });
      return true;
    } catch {
      return false;
    }
  },
  async addNotificationActionListener(listener) {
    try {
      const mod = await __vitePreload(() => Promise.resolve().then(() => index$3), true ? void 0 : void 0, import.meta.url);
      const unlisten = await mod.onAction((notification) => {
        listener(notification);
      });
      return () => {
        try {
          void unlisten.unregister();
        } catch {
        }
      };
    } catch {
      return null;
    }
  },
  async keepScreenOn(enable) {
    try {
      const mod = await __vitePreload(() => import("./index-C_hIeLHX.js"), true ? __vite__mapDeps([0,1,2]) : void 0, import.meta.url);
      if (typeof mod.keepScreenOn === "function") {
        await mod.keepScreenOn(enable);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
  async shareLinkOrFile(target, title2) {
    return this.openUri(target);
  },
  async setAggressiveKeepAlive(enable) {
    let ok = true;
    try {
      ok = await this.keepScreenOn(!!enable);
    } catch {
      ok = false;
    }
    desktopKeepAliveActive = !!enable && ok;
    return {
      supported: true,
      active: desktopKeepAliveActive,
      source: "tauri",
      reason: enable ? ok ? "桌面端已启用前台保活策略" : "桌面端启用保活失败" : "桌面端已关闭前台保活策略"
    };
  },
  async getAggressiveKeepAliveState() {
    return {
      supported: true,
      active: desktopKeepAliveActive,
      source: "tauri",
      reason: "桌面端使用前台轮询与窗口保活策略"
    };
  },
  async openBatteryOptimizationSettings() {
    return tryOpenDesktopPowerSettings();
  },
  async openNotificationSettings() {
    return tryOpenDesktopPowerSettings();
  }
};
const normalizePermission = (value) => {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  return "prompt";
};
const openByWindow = (target) => {
  window.open(target, "_blank", "noopener,noreferrer");
};
const webBridge = {
  runtime: "web",
  async openHttp(url) {
    try {
      openByWindow(url);
      return true;
    } catch {
      try {
        location.href = url;
        return true;
      } catch {
        return false;
      }
    }
  },
  async openUri(target) {
    try {
      openByWindow(target);
      return true;
    } catch {
      try {
        location.href = target;
        return true;
      } catch {
        return false;
      }
    }
  },
  async getNotificationPermission() {
    if (!("Notification" in window)) return "denied";
    return normalizePermission(Notification.permission);
  },
  async requestNotificationPermission() {
    if (!("Notification" in window)) return "denied";
    const permission = await Notification.requestPermission();
    return normalizePermission(permission);
  },
  async ensureNotificationChannel() {
    return true;
  },
  async sendLocalNotification(payload) {
    if (!("Notification" in window)) return false;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
    new Notification(payload.title, { body: payload.body || "" });
    return true;
  },
  async addNotificationActionListener() {
    return null;
  },
  async keepScreenOn(enable) {
    if (!enable) return true;
    try {
      const nav = navigator;
      await nav?.wakeLock?.request?.("screen");
      return true;
    } catch {
      return false;
    }
  },
  async shareLinkOrFile(target, title2) {
    try {
      if (navigator.share) {
        await navigator.share({ title: title2, url: target });
        return true;
      }
    } catch {
      return false;
    }
    return this.openUri(target);
  },
  async setAggressiveKeepAlive(enable) {
    return {
      supported: false,
      active: false,
      source: "web",
      reason: enable ? "Web 环境不支持前台服务保活" : "Web 环境不支持前台服务保活"
    };
  },
  async getAggressiveKeepAliveState() {
    return {
      supported: false,
      active: false,
      source: "web",
      reason: "Web 环境不支持移动端保活能力"
    };
  },
  async openBatteryOptimizationSettings() {
    return false;
  },
  async openNotificationSettings() {
    return false;
  }
};
const pickBridge = () => {
  const runtime = detectRuntime();
  if (runtime === "tauri") return tauriBridge;
  if (runtime === "capacitor") return capacitorBridge;
  return webBridge;
};
const getRuntime = () => pickBridge().runtime;
const platformBridge = {
  async openHttp(url) {
    return pickBridge().openHttp(url);
  },
  async openUri(target) {
    return pickBridge().openUri(target);
  },
  async getNotificationPermission() {
    return pickBridge().getNotificationPermission();
  },
  async requestNotificationPermission() {
    return pickBridge().requestNotificationPermission();
  },
  async ensureNotificationChannel(channelId) {
    return pickBridge().ensureNotificationChannel(channelId);
  },
  async sendLocalNotification(payload) {
    return pickBridge().sendLocalNotification(payload);
  },
  async addNotificationActionListener(listener) {
    return pickBridge().addNotificationActionListener(listener);
  },
  async keepScreenOn(enable) {
    return pickBridge().keepScreenOn(enable);
  },
  async shareLinkOrFile(target, title2) {
    return pickBridge().shareLinkOrFile(target, title2);
  },
  async setAggressiveKeepAlive(enable) {
    return pickBridge().setAggressiveKeepAlive(enable);
  },
  async getAggressiveKeepAliveState() {
    return pickBridge().getAggressiveKeepAliveState();
  },
  async openBatteryOptimizationSettings() {
    return pickBridge().openBatteryOptimizationSettings();
  },
  async openNotificationSettings() {
    return pickBridge().openNotificationSettings();
  }
};
var _2020 = { exports: {} };
var core$4 = {};
var validate = {};
var boolSchema = {};
var errors = {};
var codegen = {};
var code$1 = {};
(function(exports$1) {
  Object.defineProperty(exports$1, "__esModule", { value: true });
  exports$1.regexpCode = exports$1.getEsmExportName = exports$1.getProperty = exports$1.safeStringify = exports$1.stringify = exports$1.strConcat = exports$1.addCodeArg = exports$1.str = exports$1._ = exports$1.nil = exports$1._Code = exports$1.Name = exports$1.IDENTIFIER = exports$1._CodeOrName = void 0;
  class _CodeOrName {
  }
  exports$1._CodeOrName = _CodeOrName;
  exports$1.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
  class Name extends _CodeOrName {
    constructor(s) {
      super();
      if (!exports$1.IDENTIFIER.test(s))
        throw new Error("CodeGen: name must be a valid identifier");
      this.str = s;
    }
    toString() {
      return this.str;
    }
    emptyStr() {
      return false;
    }
    get names() {
      return { [this.str]: 1 };
    }
  }
  exports$1.Name = Name;
  class _Code extends _CodeOrName {
    constructor(code2) {
      super();
      this._items = typeof code2 === "string" ? [code2] : code2;
    }
    toString() {
      return this.str;
    }
    emptyStr() {
      if (this._items.length > 1)
        return false;
      const item = this._items[0];
      return item === "" || item === '""';
    }
    get str() {
      var _a;
      return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
    }
    get names() {
      var _a;
      return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names2, c) => {
        if (c instanceof Name)
          names2[c.str] = (names2[c.str] || 0) + 1;
        return names2;
      }, {});
    }
  }
  exports$1._Code = _Code;
  exports$1.nil = new _Code("");
  function _(strs, ...args) {
    const code2 = [strs[0]];
    let i = 0;
    while (i < args.length) {
      addCodeArg(code2, args[i]);
      code2.push(strs[++i]);
    }
    return new _Code(code2);
  }
  exports$1._ = _;
  const plus = new _Code("+");
  function str(strs, ...args) {
    const expr = [safeStringify(strs[0])];
    let i = 0;
    while (i < args.length) {
      expr.push(plus);
      addCodeArg(expr, args[i]);
      expr.push(plus, safeStringify(strs[++i]));
    }
    optimize(expr);
    return new _Code(expr);
  }
  exports$1.str = str;
  function addCodeArg(code2, arg) {
    if (arg instanceof _Code)
      code2.push(...arg._items);
    else if (arg instanceof Name)
      code2.push(arg);
    else
      code2.push(interpolate(arg));
  }
  exports$1.addCodeArg = addCodeArg;
  function optimize(expr) {
    let i = 1;
    while (i < expr.length - 1) {
      if (expr[i] === plus) {
        const res = mergeExprItems(expr[i - 1], expr[i + 1]);
        if (res !== void 0) {
          expr.splice(i - 1, 3, res);
          continue;
        }
        expr[i++] = "+";
      }
      i++;
    }
  }
  function mergeExprItems(a, b) {
    if (b === '""')
      return a;
    if (a === '""')
      return b;
    if (typeof a == "string") {
      if (b instanceof Name || a[a.length - 1] !== '"')
        return;
      if (typeof b != "string")
        return `${a.slice(0, -1)}${b}"`;
      if (b[0] === '"')
        return a.slice(0, -1) + b.slice(1);
      return;
    }
    if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
      return `"${a}${b.slice(1)}`;
    return;
  }
  function strConcat(c1, c2) {
    return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
  }
  exports$1.strConcat = strConcat;
  function interpolate(x) {
    return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
  }
  function stringify(x) {
    return new _Code(safeStringify(x));
  }
  exports$1.stringify = stringify;
  function safeStringify(x) {
    return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  }
  exports$1.safeStringify = safeStringify;
  function getProperty(key) {
    return typeof key == "string" && exports$1.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
  }
  exports$1.getProperty = getProperty;
  function getEsmExportName(key) {
    if (typeof key == "string" && exports$1.IDENTIFIER.test(key)) {
      return new _Code(`${key}`);
    }
    throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
  }
  exports$1.getEsmExportName = getEsmExportName;
  function regexpCode(rx) {
    return new _Code(rx.toString());
  }
  exports$1.regexpCode = regexpCode;
})(code$1);
var scope = {};
(function(exports$1) {
  Object.defineProperty(exports$1, "__esModule", { value: true });
  exports$1.ValueScope = exports$1.ValueScopeName = exports$1.Scope = exports$1.varKinds = exports$1.UsedValueState = void 0;
  const code_12 = code$1;
  class ValueError extends Error {
    constructor(name) {
      super(`CodeGen: "code" for ${name} not defined`);
      this.value = name.value;
    }
  }
  var UsedValueState;
  (function(UsedValueState2) {
    UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
    UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
  })(UsedValueState || (exports$1.UsedValueState = UsedValueState = {}));
  exports$1.varKinds = {
    const: new code_12.Name("const"),
    let: new code_12.Name("let"),
    var: new code_12.Name("var")
  };
  class Scope {
    constructor({ prefixes, parent } = {}) {
      this._names = {};
      this._prefixes = prefixes;
      this._parent = parent;
    }
    toName(nameOrPrefix) {
      return nameOrPrefix instanceof code_12.Name ? nameOrPrefix : this.name(nameOrPrefix);
    }
    name(prefix) {
      return new code_12.Name(this._newName(prefix));
    }
    _newName(prefix) {
      const ng = this._names[prefix] || this._nameGroup(prefix);
      return `${prefix}${ng.index++}`;
    }
    _nameGroup(prefix) {
      var _a, _b;
      if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
        throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
      }
      return this._names[prefix] = { prefix, index: 0 };
    }
  }
  exports$1.Scope = Scope;
  class ValueScopeName extends code_12.Name {
    constructor(prefix, nameStr) {
      super(nameStr);
      this.prefix = prefix;
    }
    setValue(value, { property, itemIndex }) {
      this.value = value;
      this.scopePath = (0, code_12._)`.${new code_12.Name(property)}[${itemIndex}]`;
    }
  }
  exports$1.ValueScopeName = ValueScopeName;
  const line = (0, code_12._)`\n`;
  class ValueScope extends Scope {
    constructor(opts) {
      super(opts);
      this._values = {};
      this._scope = opts.scope;
      this.opts = { ...opts, _n: opts.lines ? line : code_12.nil };
    }
    get() {
      return this._scope;
    }
    name(prefix) {
      return new ValueScopeName(prefix, this._newName(prefix));
    }
    value(nameOrPrefix, value) {
      var _a;
      if (value.ref === void 0)
        throw new Error("CodeGen: ref must be passed in value");
      const name = this.toName(nameOrPrefix);
      const { prefix } = name;
      const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
      let vs = this._values[prefix];
      if (vs) {
        const _name = vs.get(valueKey);
        if (_name)
          return _name;
      } else {
        vs = this._values[prefix] = /* @__PURE__ */ new Map();
      }
      vs.set(valueKey, name);
      const s = this._scope[prefix] || (this._scope[prefix] = []);
      const itemIndex = s.length;
      s[itemIndex] = value.ref;
      name.setValue(value, { property: prefix, itemIndex });
      return name;
    }
    getValue(prefix, keyOrRef) {
      const vs = this._values[prefix];
      if (!vs)
        return;
      return vs.get(keyOrRef);
    }
    scopeRefs(scopeName, values = this._values) {
      return this._reduceValues(values, (name) => {
        if (name.scopePath === void 0)
          throw new Error(`CodeGen: name "${name}" has no value`);
        return (0, code_12._)`${scopeName}${name.scopePath}`;
      });
    }
    scopeCode(values = this._values, usedValues, getCode) {
      return this._reduceValues(values, (name) => {
        if (name.value === void 0)
          throw new Error(`CodeGen: name "${name}" has no value`);
        return name.value.code;
      }, usedValues, getCode);
    }
    _reduceValues(values, valueCode, usedValues = {}, getCode) {
      let code2 = code_12.nil;
      for (const prefix in values) {
        const vs = values[prefix];
        if (!vs)
          continue;
        const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
        vs.forEach((name) => {
          if (nameSet.has(name))
            return;
          nameSet.set(name, UsedValueState.Started);
          let c = valueCode(name);
          if (c) {
            const def2 = this.opts.es5 ? exports$1.varKinds.var : exports$1.varKinds.const;
            code2 = (0, code_12._)`${code2}${def2} ${name} = ${c};${this.opts._n}`;
          } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) {
            code2 = (0, code_12._)`${code2}${c}${this.opts._n}`;
          } else {
            throw new ValueError(name);
          }
          nameSet.set(name, UsedValueState.Completed);
        });
      }
      return code2;
    }
  }
  exports$1.ValueScope = ValueScope;
})(scope);
(function(exports$1) {
  Object.defineProperty(exports$1, "__esModule", { value: true });
  exports$1.or = exports$1.and = exports$1.not = exports$1.CodeGen = exports$1.operators = exports$1.varKinds = exports$1.ValueScopeName = exports$1.ValueScope = exports$1.Scope = exports$1.Name = exports$1.regexpCode = exports$1.stringify = exports$1.getProperty = exports$1.nil = exports$1.strConcat = exports$1.str = exports$1._ = void 0;
  const code_12 = code$1;
  const scope_1 = scope;
  var code_2 = code$1;
  Object.defineProperty(exports$1, "_", { enumerable: true, get: function() {
    return code_2._;
  } });
  Object.defineProperty(exports$1, "str", { enumerable: true, get: function() {
    return code_2.str;
  } });
  Object.defineProperty(exports$1, "strConcat", { enumerable: true, get: function() {
    return code_2.strConcat;
  } });
  Object.defineProperty(exports$1, "nil", { enumerable: true, get: function() {
    return code_2.nil;
  } });
  Object.defineProperty(exports$1, "getProperty", { enumerable: true, get: function() {
    return code_2.getProperty;
  } });
  Object.defineProperty(exports$1, "stringify", { enumerable: true, get: function() {
    return code_2.stringify;
  } });
  Object.defineProperty(exports$1, "regexpCode", { enumerable: true, get: function() {
    return code_2.regexpCode;
  } });
  Object.defineProperty(exports$1, "Name", { enumerable: true, get: function() {
    return code_2.Name;
  } });
  var scope_2 = scope;
  Object.defineProperty(exports$1, "Scope", { enumerable: true, get: function() {
    return scope_2.Scope;
  } });
  Object.defineProperty(exports$1, "ValueScope", { enumerable: true, get: function() {
    return scope_2.ValueScope;
  } });
  Object.defineProperty(exports$1, "ValueScopeName", { enumerable: true, get: function() {
    return scope_2.ValueScopeName;
  } });
  Object.defineProperty(exports$1, "varKinds", { enumerable: true, get: function() {
    return scope_2.varKinds;
  } });
  exports$1.operators = {
    GT: new code_12._Code(">"),
    GTE: new code_12._Code(">="),
    LT: new code_12._Code("<"),
    LTE: new code_12._Code("<="),
    EQ: new code_12._Code("==="),
    NEQ: new code_12._Code("!=="),
    NOT: new code_12._Code("!"),
    OR: new code_12._Code("||"),
    AND: new code_12._Code("&&"),
    ADD: new code_12._Code("+")
  };
  class Node {
    optimizeNodes() {
      return this;
    }
    optimizeNames(_names, _constants) {
      return this;
    }
  }
  class Def extends Node {
    constructor(varKind, name, rhs) {
      super();
      this.varKind = varKind;
      this.name = name;
      this.rhs = rhs;
    }
    render({ es5, _n }) {
      const varKind = es5 ? scope_1.varKinds.var : this.varKind;
      const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
      return `${varKind} ${this.name}${rhs};` + _n;
    }
    optimizeNames(names2, constants) {
      if (!names2[this.name.str])
        return;
      if (this.rhs)
        this.rhs = optimizeExpr(this.rhs, names2, constants);
      return this;
    }
    get names() {
      return this.rhs instanceof code_12._CodeOrName ? this.rhs.names : {};
    }
  }
  class Assign extends Node {
    constructor(lhs, rhs, sideEffects) {
      super();
      this.lhs = lhs;
      this.rhs = rhs;
      this.sideEffects = sideEffects;
    }
    render({ _n }) {
      return `${this.lhs} = ${this.rhs};` + _n;
    }
    optimizeNames(names2, constants) {
      if (this.lhs instanceof code_12.Name && !names2[this.lhs.str] && !this.sideEffects)
        return;
      this.rhs = optimizeExpr(this.rhs, names2, constants);
      return this;
    }
    get names() {
      const names2 = this.lhs instanceof code_12.Name ? {} : { ...this.lhs.names };
      return addExprNames(names2, this.rhs);
    }
  }
  class AssignOp extends Assign {
    constructor(lhs, op, rhs, sideEffects) {
      super(lhs, rhs, sideEffects);
      this.op = op;
    }
    render({ _n }) {
      return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
    }
  }
  class Label extends Node {
    constructor(label) {
      super();
      this.label = label;
      this.names = {};
    }
    render({ _n }) {
      return `${this.label}:` + _n;
    }
  }
  class Break extends Node {
    constructor(label) {
      super();
      this.label = label;
      this.names = {};
    }
    render({ _n }) {
      const label = this.label ? ` ${this.label}` : "";
      return `break${label};` + _n;
    }
  }
  class Throw extends Node {
    constructor(error2) {
      super();
      this.error = error2;
    }
    render({ _n }) {
      return `throw ${this.error};` + _n;
    }
    get names() {
      return this.error.names;
    }
  }
  class AnyCode extends Node {
    constructor(code2) {
      super();
      this.code = code2;
    }
    render({ _n }) {
      return `${this.code};` + _n;
    }
    optimizeNodes() {
      return `${this.code}` ? this : void 0;
    }
    optimizeNames(names2, constants) {
      this.code = optimizeExpr(this.code, names2, constants);
      return this;
    }
    get names() {
      return this.code instanceof code_12._CodeOrName ? this.code.names : {};
    }
  }
  class ParentNode extends Node {
    constructor(nodes = []) {
      super();
      this.nodes = nodes;
    }
    render(opts) {
      return this.nodes.reduce((code2, n) => code2 + n.render(opts), "");
    }
    optimizeNodes() {
      const { nodes } = this;
      let i = nodes.length;
      while (i--) {
        const n = nodes[i].optimizeNodes();
        if (Array.isArray(n))
          nodes.splice(i, 1, ...n);
        else if (n)
          nodes[i] = n;
        else
          nodes.splice(i, 1);
      }
      return nodes.length > 0 ? this : void 0;
    }
    optimizeNames(names2, constants) {
      const { nodes } = this;
      let i = nodes.length;
      while (i--) {
        const n = nodes[i];
        if (n.optimizeNames(names2, constants))
          continue;
        subtractNames(names2, n.names);
        nodes.splice(i, 1);
      }
      return nodes.length > 0 ? this : void 0;
    }
    get names() {
      return this.nodes.reduce((names2, n) => addNames(names2, n.names), {});
    }
  }
  class BlockNode extends ParentNode {
    render(opts) {
      return "{" + opts._n + super.render(opts) + "}" + opts._n;
    }
  }
  class Root extends ParentNode {
  }
  class Else extends BlockNode {
  }
  Else.kind = "else";
  class If extends BlockNode {
    constructor(condition, nodes) {
      super(nodes);
      this.condition = condition;
    }
    render(opts) {
      let code2 = `if(${this.condition})` + super.render(opts);
      if (this.else)
        code2 += "else " + this.else.render(opts);
      return code2;
    }
    optimizeNodes() {
      super.optimizeNodes();
      const cond = this.condition;
      if (cond === true)
        return this.nodes;
      let e = this.else;
      if (e) {
        const ns = e.optimizeNodes();
        e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
      }
      if (e) {
        if (cond === false)
          return e instanceof If ? e : e.nodes;
        if (this.nodes.length)
          return this;
        return new If(not2(cond), e instanceof If ? [e] : e.nodes);
      }
      if (cond === false || !this.nodes.length)
        return void 0;
      return this;
    }
    optimizeNames(names2, constants) {
      var _a;
      this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names2, constants);
      if (!(super.optimizeNames(names2, constants) || this.else))
        return;
      this.condition = optimizeExpr(this.condition, names2, constants);
      return this;
    }
    get names() {
      const names2 = super.names;
      addExprNames(names2, this.condition);
      if (this.else)
        addNames(names2, this.else.names);
      return names2;
    }
  }
  If.kind = "if";
  class For extends BlockNode {
  }
  For.kind = "for";
  class ForLoop extends For {
    constructor(iteration) {
      super();
      this.iteration = iteration;
    }
    render(opts) {
      return `for(${this.iteration})` + super.render(opts);
    }
    optimizeNames(names2, constants) {
      if (!super.optimizeNames(names2, constants))
        return;
      this.iteration = optimizeExpr(this.iteration, names2, constants);
      return this;
    }
    get names() {
      return addNames(super.names, this.iteration.names);
    }
  }
  class ForRange extends For {
    constructor(varKind, name, from, to) {
      super();
      this.varKind = varKind;
      this.name = name;
      this.from = from;
      this.to = to;
    }
    render(opts) {
      const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
      const { name, from, to } = this;
      return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
    }
    get names() {
      const names2 = addExprNames(super.names, this.from);
      return addExprNames(names2, this.to);
    }
  }
  class ForIter extends For {
    constructor(loop, varKind, name, iterable) {
      super();
      this.loop = loop;
      this.varKind = varKind;
      this.name = name;
      this.iterable = iterable;
    }
    render(opts) {
      return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
    }
    optimizeNames(names2, constants) {
      if (!super.optimizeNames(names2, constants))
        return;
      this.iterable = optimizeExpr(this.iterable, names2, constants);
      return this;
    }
    get names() {
      return addNames(super.names, this.iterable.names);
    }
  }
  class Func extends BlockNode {
    constructor(name, args, async) {
      super();
      this.name = name;
      this.args = args;
      this.async = async;
    }
    render(opts) {
      const _async = this.async ? "async " : "";
      return `${_async}function ${this.name}(${this.args})` + super.render(opts);
    }
  }
  Func.kind = "func";
  class Return extends ParentNode {
    render(opts) {
      return "return " + super.render(opts);
    }
  }
  Return.kind = "return";
  class Try extends BlockNode {
    render(opts) {
      let code2 = "try" + super.render(opts);
      if (this.catch)
        code2 += this.catch.render(opts);
      if (this.finally)
        code2 += this.finally.render(opts);
      return code2;
    }
    optimizeNodes() {
      var _a, _b;
      super.optimizeNodes();
      (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
      (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
      return this;
    }
    optimizeNames(names2, constants) {
      var _a, _b;
      super.optimizeNames(names2, constants);
      (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names2, constants);
      (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names2, constants);
      return this;
    }
    get names() {
      const names2 = super.names;
      if (this.catch)
        addNames(names2, this.catch.names);
      if (this.finally)
        addNames(names2, this.finally.names);
      return names2;
    }
  }
  class Catch extends BlockNode {
    constructor(error2) {
      super();
      this.error = error2;
    }
    render(opts) {
      return `catch(${this.error})` + super.render(opts);
    }
  }
  Catch.kind = "catch";
  class Finally extends BlockNode {
    render(opts) {
      return "finally" + super.render(opts);
    }
  }
  Finally.kind = "finally";
  class CodeGen {
    constructor(extScope, opts = {}) {
      this._values = {};
      this._blockStarts = [];
      this._constants = {};
      this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
      this._extScope = extScope;
      this._scope = new scope_1.Scope({ parent: extScope });
      this._nodes = [new Root()];
    }
    toString() {
      return this._root.render(this.opts);
    }
    // returns unique name in the internal scope
    name(prefix) {
      return this._scope.name(prefix);
    }
    // reserves unique name in the external scope
    scopeName(prefix) {
      return this._extScope.name(prefix);
    }
    // reserves unique name in the external scope and assigns value to it
    scopeValue(prefixOrName, value) {
      const name = this._extScope.value(prefixOrName, value);
      const vs = this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set());
      vs.add(name);
      return name;
    }
    getScopeValue(prefix, keyOrRef) {
      return this._extScope.getValue(prefix, keyOrRef);
    }
    // return code that assigns values in the external scope to the names that are used internally
    // (same names that were returned by gen.scopeName or gen.scopeValue)
    scopeRefs(scopeName) {
      return this._extScope.scopeRefs(scopeName, this._values);
    }
    scopeCode() {
      return this._extScope.scopeCode(this._values);
    }
    _def(varKind, nameOrPrefix, rhs, constant) {
      const name = this._scope.toName(nameOrPrefix);
      if (rhs !== void 0 && constant)
        this._constants[name.str] = rhs;
      this._leafNode(new Def(varKind, name, rhs));
      return name;
    }
    // `const` declaration (`var` in es5 mode)
    const(nameOrPrefix, rhs, _constant) {
      return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
    }
    // `let` declaration with optional assignment (`var` in es5 mode)
    let(nameOrPrefix, rhs, _constant) {
      return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
    }
    // `var` declaration with optional assignment
    var(nameOrPrefix, rhs, _constant) {
      return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
    }
    // assignment code
    assign(lhs, rhs, sideEffects) {
      return this._leafNode(new Assign(lhs, rhs, sideEffects));
    }
    // `+=` code
    add(lhs, rhs) {
      return this._leafNode(new AssignOp(lhs, exports$1.operators.ADD, rhs));
    }
    // appends passed SafeExpr to code or executes Block
    code(c) {
      if (typeof c == "function")
        c();
      else if (c !== code_12.nil)
        this._leafNode(new AnyCode(c));
      return this;
    }
    // returns code for object literal for the passed argument list of key-value pairs
    object(...keyValues) {
      const code2 = ["{"];
      for (const [key, value] of keyValues) {
        if (code2.length > 1)
          code2.push(",");
        code2.push(key);
        if (key !== value || this.opts.es5) {
          code2.push(":");
          (0, code_12.addCodeArg)(code2, value);
        }
      }
      code2.push("}");
      return new code_12._Code(code2);
    }
    // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
    if(condition, thenBody, elseBody) {
      this._blockNode(new If(condition));
      if (thenBody && elseBody) {
        this.code(thenBody).else().code(elseBody).endIf();
      } else if (thenBody) {
        this.code(thenBody).endIf();
      } else if (elseBody) {
        throw new Error('CodeGen: "else" body without "then" body');
      }
      return this;
    }
    // `else if` clause - invalid without `if` or after `else` clauses
    elseIf(condition) {
      return this._elseNode(new If(condition));
    }
    // `else` clause - only valid after `if` or `else if` clauses
    else() {
      return this._elseNode(new Else());
    }
    // end `if` statement (needed if gen.if was used only with condition)
    endIf() {
      return this._endBlockNode(If, Else);
    }
    _for(node, forBody) {
      this._blockNode(node);
      if (forBody)
        this.code(forBody).endFor();
      return this;
    }
    // a generic `for` clause (or statement if `forBody` is passed)
    for(iteration, forBody) {
      return this._for(new ForLoop(iteration), forBody);
    }
    // `for` statement for a range of values
    forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
      const name = this._scope.toName(nameOrPrefix);
      return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
    }
    // `for-of` statement (in es5 mode replace with a normal for loop)
    forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
      const name = this._scope.toName(nameOrPrefix);
      if (this.opts.es5) {
        const arr = iterable instanceof code_12.Name ? iterable : this.var("_arr", iterable);
        return this.forRange("_i", 0, (0, code_12._)`${arr}.length`, (i) => {
          this.var(name, (0, code_12._)`${arr}[${i}]`);
          forBody(name);
        });
      }
      return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
    }
    // `for-in` statement.
    // With option `ownProperties` replaced with a `for-of` loop for object keys
    forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
      if (this.opts.ownProperties) {
        return this.forOf(nameOrPrefix, (0, code_12._)`Object.keys(${obj})`, forBody);
      }
      const name = this._scope.toName(nameOrPrefix);
      return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
    }
    // end `for` loop
    endFor() {
      return this._endBlockNode(For);
    }
    // `label` statement
    label(label) {
      return this._leafNode(new Label(label));
    }
    // `break` statement
    break(label) {
      return this._leafNode(new Break(label));
    }
    // `return` statement
    return(value) {
      const node = new Return();
      this._blockNode(node);
      this.code(value);
      if (node.nodes.length !== 1)
        throw new Error('CodeGen: "return" should have one node');
      return this._endBlockNode(Return);
    }
    // `try` statement
    try(tryBody, catchCode, finallyCode) {
      if (!catchCode && !finallyCode)
        throw new Error('CodeGen: "try" without "catch" and "finally"');
      const node = new Try();
      this._blockNode(node);
      this.code(tryBody);
      if (catchCode) {
        const error2 = this.name("e");
        this._currNode = node.catch = new Catch(error2);
        catchCode(error2);
      }
      if (finallyCode) {
        this._currNode = node.finally = new Finally();
        this.code(finallyCode);
      }
      return this._endBlockNode(Catch, Finally);
    }
    // `throw` statement
    throw(error2) {
      return this._leafNode(new Throw(error2));
    }
    // start self-balancing block
    block(body, nodeCount) {
      this._blockStarts.push(this._nodes.length);
      if (body)
        this.code(body).endBlock(nodeCount);
      return this;
    }
    // end the current self-balancing block
    endBlock(nodeCount) {
      const len = this._blockStarts.pop();
      if (len === void 0)
        throw new Error("CodeGen: not in self-balancing block");
      const toClose = this._nodes.length - len;
      if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
        throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
      }
      this._nodes.length = len;
      return this;
    }
    // `function` heading (or definition if funcBody is passed)
    func(name, args = code_12.nil, async, funcBody) {
      this._blockNode(new Func(name, args, async));
      if (funcBody)
        this.code(funcBody).endFunc();
      return this;
    }
    // end function definition
    endFunc() {
      return this._endBlockNode(Func);
    }
    optimize(n = 1) {
      while (n-- > 0) {
        this._root.optimizeNodes();
        this._root.optimizeNames(this._root.names, this._constants);
      }
    }
    _leafNode(node) {
      this._currNode.nodes.push(node);
      return this;
    }
    _blockNode(node) {
      this._currNode.nodes.push(node);
      this._nodes.push(node);
    }
    _endBlockNode(N1, N2) {
      const n = this._currNode;
      if (n instanceof N1 || N2 && n instanceof N2) {
        this._nodes.pop();
        return this;
      }
      throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
    }
    _elseNode(node) {
      const n = this._currNode;
      if (!(n instanceof If)) {
        throw new Error('CodeGen: "else" without "if"');
      }
      this._currNode = n.else = node;
      return this;
    }
    get _root() {
      return this._nodes[0];
    }
    get _currNode() {
      const ns = this._nodes;
      return ns[ns.length - 1];
    }
    set _currNode(node) {
      const ns = this._nodes;
      ns[ns.length - 1] = node;
    }
  }
  exports$1.CodeGen = CodeGen;
  function addNames(names2, from) {
    for (const n in from)
      names2[n] = (names2[n] || 0) + (from[n] || 0);
    return names2;
  }
  function addExprNames(names2, from) {
    return from instanceof code_12._CodeOrName ? addNames(names2, from.names) : names2;
  }
  function optimizeExpr(expr, names2, constants) {
    if (expr instanceof code_12.Name)
      return replaceName(expr);
    if (!canOptimize(expr))
      return expr;
    return new code_12._Code(expr._items.reduce((items2, c) => {
      if (c instanceof code_12.Name)
        c = replaceName(c);
      if (c instanceof code_12._Code)
        items2.push(...c._items);
      else
        items2.push(c);
      return items2;
    }, []));
    function replaceName(n) {
      const c = constants[n.str];
      if (c === void 0 || names2[n.str] !== 1)
        return n;
      delete names2[n.str];
      return c;
    }
    function canOptimize(e) {
      return e instanceof code_12._Code && e._items.some((c) => c instanceof code_12.Name && names2[c.str] === 1 && constants[c.str] !== void 0);
    }
  }
  function subtractNames(names2, from) {
    for (const n in from)
      names2[n] = (names2[n] || 0) - (from[n] || 0);
  }
  function not2(x) {
    return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_12._)`!${par(x)}`;
  }
  exports$1.not = not2;
  const andCode = mappend(exports$1.operators.AND);
  function and(...args) {
    return args.reduce(andCode);
  }
  exports$1.and = and;
  const orCode = mappend(exports$1.operators.OR);
  function or(...args) {
    return args.reduce(orCode);
  }
  exports$1.or = or;
  function mappend(op) {
    return (x, y) => x === code_12.nil ? y : y === code_12.nil ? x : (0, code_12._)`${par(x)} ${op} ${par(y)}`;
  }
  function par(x) {
    return x instanceof code_12.Name ? x : (0, code_12._)`(${x})`;
  }
})(codegen);
var util = {};
Object.defineProperty(util, "__esModule", { value: true });
util.checkStrictMode = util.getErrorPath = util.Type = util.useFunc = util.setEvaluated = util.evaluatedPropsToName = util.mergeEvaluated = util.eachItem = util.unescapeJsonPointer = util.escapeJsonPointer = util.escapeFragment = util.unescapeFragment = util.schemaRefOrVal = util.schemaHasRulesButRef = util.schemaHasRules = util.checkUnknownRules = util.alwaysValidSchema = util.toHash = void 0;
const codegen_1$z = codegen;
const code_1$a = code$1;
function toHash(arr) {
  const hash = {};
  for (const item of arr)
    hash[item] = true;
  return hash;
}
util.toHash = toHash;
function alwaysValidSchema(it, schema) {
  if (typeof schema == "boolean")
    return schema;
  if (Object.keys(schema).length === 0)
    return true;
  checkUnknownRules(it, schema);
  return !schemaHasRules(schema, it.self.RULES.all);
}
util.alwaysValidSchema = alwaysValidSchema;
function checkUnknownRules(it, schema = it.schema) {
  const { opts, self: self2 } = it;
  if (!opts.strictSchema)
    return;
  if (typeof schema === "boolean")
    return;
  const rules2 = self2.RULES.keywords;
  for (const key in schema) {
    if (!rules2[key])
      checkStrictMode(it, `unknown keyword: "${key}"`);
  }
}
util.checkUnknownRules = checkUnknownRules;
function schemaHasRules(schema, rules2) {
  if (typeof schema == "boolean")
    return !schema;
  for (const key in schema)
    if (rules2[key])
      return true;
  return false;
}
util.schemaHasRules = schemaHasRules;
function schemaHasRulesButRef(schema, RULES) {
  if (typeof schema == "boolean")
    return !schema;
  for (const key in schema)
    if (key !== "$ref" && RULES.all[key])
      return true;
  return false;
}
util.schemaHasRulesButRef = schemaHasRulesButRef;
function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword2, $data) {
  if (!$data) {
    if (typeof schema == "number" || typeof schema == "boolean")
      return schema;
    if (typeof schema == "string")
      return (0, codegen_1$z._)`${schema}`;
  }
  return (0, codegen_1$z._)`${topSchemaRef}${schemaPath}${(0, codegen_1$z.getProperty)(keyword2)}`;
}
util.schemaRefOrVal = schemaRefOrVal;
function unescapeFragment(str) {
  return unescapeJsonPointer(decodeURIComponent(str));
}
util.unescapeFragment = unescapeFragment;
function escapeFragment(str) {
  return encodeURIComponent(escapeJsonPointer(str));
}
util.escapeFragment = escapeFragment;
function escapeJsonPointer(str) {
  if (typeof str == "number")
    return `${str}`;
  return str.replace(/~/g, "~0").replace(/\//g, "~1");
}
util.escapeJsonPointer = escapeJsonPointer;
function unescapeJsonPointer(str) {
  return str.replace(/~1/g, "/").replace(/~0/g, "~");
}
util.unescapeJsonPointer = unescapeJsonPointer;
function eachItem(xs, f) {
  if (Array.isArray(xs)) {
    for (const x of xs)
      f(x);
  } else {
    f(xs);
  }
}
util.eachItem = eachItem;
function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
  return (gen, from, to, toName) => {
    const res = to === void 0 ? from : to instanceof codegen_1$z.Name ? (from instanceof codegen_1$z.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1$z.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
    return toName === codegen_1$z.Name && !(res instanceof codegen_1$z.Name) ? resultToName(gen, res) : res;
  };
}
util.mergeEvaluated = {
  props: makeMergeEvaluated({
    mergeNames: (gen, from, to) => gen.if((0, codegen_1$z._)`${to} !== true && ${from} !== undefined`, () => {
      gen.if((0, codegen_1$z._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1$z._)`${to} || {}`).code((0, codegen_1$z._)`Object.assign(${to}, ${from})`));
    }),
    mergeToName: (gen, from, to) => gen.if((0, codegen_1$z._)`${to} !== true`, () => {
      if (from === true) {
        gen.assign(to, true);
      } else {
        gen.assign(to, (0, codegen_1$z._)`${to} || {}`);
        setEvaluated(gen, to, from);
      }
    }),
    mergeValues: (from, to) => from === true ? true : { ...from, ...to },
    resultToName: evaluatedPropsToName
  }),
  items: makeMergeEvaluated({
    mergeNames: (gen, from, to) => gen.if((0, codegen_1$z._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1$z._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
    mergeToName: (gen, from, to) => gen.if((0, codegen_1$z._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1$z._)`${to} > ${from} ? ${to} : ${from}`)),
    mergeValues: (from, to) => from === true ? true : Math.max(from, to),
    resultToName: (gen, items2) => gen.var("items", items2)
  })
};
function evaluatedPropsToName(gen, ps) {
  if (ps === true)
    return gen.var("props", true);
  const props = gen.var("props", (0, codegen_1$z._)`{}`);
  if (ps !== void 0)
    setEvaluated(gen, props, ps);
  return props;
}
util.evaluatedPropsToName = evaluatedPropsToName;
function setEvaluated(gen, props, ps) {
  Object.keys(ps).forEach((p) => gen.assign((0, codegen_1$z._)`${props}${(0, codegen_1$z.getProperty)(p)}`, true));
}
util.setEvaluated = setEvaluated;
const snippets = {};
function useFunc(gen, f) {
  return gen.scopeValue("func", {
    ref: f,
    code: snippets[f.code] || (snippets[f.code] = new code_1$a._Code(f.code))
  });
}
util.useFunc = useFunc;
var Type;
(function(Type2) {
  Type2[Type2["Num"] = 0] = "Num";
  Type2[Type2["Str"] = 1] = "Str";
})(Type || (util.Type = Type = {}));
function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
  if (dataProp instanceof codegen_1$z.Name) {
    const isNumber = dataPropType === Type.Num;
    return jsPropertySyntax ? isNumber ? (0, codegen_1$z._)`"[" + ${dataProp} + "]"` : (0, codegen_1$z._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1$z._)`"/" + ${dataProp}` : (0, codegen_1$z._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
  }
  return jsPropertySyntax ? (0, codegen_1$z.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
}
util.getErrorPath = getErrorPath;
function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
  if (!mode)
    return;
  msg = `strict mode: ${msg}`;
  if (mode === true)
    throw new Error(msg);
  it.self.logger.warn(msg);
}
util.checkStrictMode = checkStrictMode;
var names$1 = {};
Object.defineProperty(names$1, "__esModule", { value: true });
const codegen_1$y = codegen;
const names = {
  // validation function arguments
  data: new codegen_1$y.Name("data"),
  // data passed to validation function
  // args passed from referencing schema
  valCxt: new codegen_1$y.Name("valCxt"),
  // validation/data context - should not be used directly, it is destructured to the names below
  instancePath: new codegen_1$y.Name("instancePath"),
  parentData: new codegen_1$y.Name("parentData"),
  parentDataProperty: new codegen_1$y.Name("parentDataProperty"),
  rootData: new codegen_1$y.Name("rootData"),
  // root data - same as the data passed to the first/top validation function
  dynamicAnchors: new codegen_1$y.Name("dynamicAnchors"),
  // used to support recursiveRef and dynamicRef
  // function scoped variables
  vErrors: new codegen_1$y.Name("vErrors"),
  // null or array of validation errors
  errors: new codegen_1$y.Name("errors"),
  // counter of validation errors
  this: new codegen_1$y.Name("this"),
  // "globals"
  self: new codegen_1$y.Name("self"),
  scope: new codegen_1$y.Name("scope"),
  // JTD serialize/parse name for JSON string and position
  json: new codegen_1$y.Name("json"),
  jsonPos: new codegen_1$y.Name("jsonPos"),
  jsonLen: new codegen_1$y.Name("jsonLen"),
  jsonPart: new codegen_1$y.Name("jsonPart")
};
names$1.default = names;
(function(exports$1) {
  Object.defineProperty(exports$1, "__esModule", { value: true });
  exports$1.extendErrors = exports$1.resetErrorsCount = exports$1.reportExtraError = exports$1.reportError = exports$1.keyword$DataError = exports$1.keywordError = void 0;
  const codegen_12 = codegen;
  const util_12 = util;
  const names_12 = names$1;
  exports$1.keywordError = {
    message: ({ keyword: keyword2 }) => (0, codegen_12.str)`must pass "${keyword2}" keyword validation`
  };
  exports$1.keyword$DataError = {
    message: ({ keyword: keyword2, schemaType }) => schemaType ? (0, codegen_12.str)`"${keyword2}" keyword must be ${schemaType} ($data)` : (0, codegen_12.str)`"${keyword2}" keyword is invalid ($data)`
  };
  function reportError(cxt, error2 = exports$1.keywordError, errorPaths, overrideAllErrors) {
    const { it } = cxt;
    const { gen, compositeRule, allErrors } = it;
    const errObj = errorObjectCode(cxt, error2, errorPaths);
    if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
      addError(gen, errObj);
    } else {
      returnErrors(it, (0, codegen_12._)`[${errObj}]`);
    }
  }
  exports$1.reportError = reportError;
  function reportExtraError(cxt, error2 = exports$1.keywordError, errorPaths) {
    const { it } = cxt;
    const { gen, compositeRule, allErrors } = it;
    const errObj = errorObjectCode(cxt, error2, errorPaths);
    addError(gen, errObj);
    if (!(compositeRule || allErrors)) {
      returnErrors(it, names_12.default.vErrors);
    }
  }
  exports$1.reportExtraError = reportExtraError;
  function resetErrorsCount(gen, errsCount) {
    gen.assign(names_12.default.errors, errsCount);
    gen.if((0, codegen_12._)`${names_12.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_12._)`${names_12.default.vErrors}.length`, errsCount), () => gen.assign(names_12.default.vErrors, null)));
  }
  exports$1.resetErrorsCount = resetErrorsCount;
  function extendErrors({ gen, keyword: keyword2, schemaValue, data, errsCount, it }) {
    if (errsCount === void 0)
      throw new Error("ajv implementation error");
    const err = gen.name("err");
    gen.forRange("i", errsCount, names_12.default.errors, (i) => {
      gen.const(err, (0, codegen_12._)`${names_12.default.vErrors}[${i}]`);
      gen.if((0, codegen_12._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_12._)`${err}.instancePath`, (0, codegen_12.strConcat)(names_12.default.instancePath, it.errorPath)));
      gen.assign((0, codegen_12._)`${err}.schemaPath`, (0, codegen_12.str)`${it.errSchemaPath}/${keyword2}`);
      if (it.opts.verbose) {
        gen.assign((0, codegen_12._)`${err}.schema`, schemaValue);
        gen.assign((0, codegen_12._)`${err}.data`, data);
      }
    });
  }
  exports$1.extendErrors = extendErrors;
  function addError(gen, errObj) {
    const err = gen.const("err", errObj);
    gen.if((0, codegen_12._)`${names_12.default.vErrors} === null`, () => gen.assign(names_12.default.vErrors, (0, codegen_12._)`[${err}]`), (0, codegen_12._)`${names_12.default.vErrors}.push(${err})`);
    gen.code((0, codegen_12._)`${names_12.default.errors}++`);
  }
  function returnErrors(it, errs) {
    const { gen, validateName, schemaEnv } = it;
    if (schemaEnv.$async) {
      gen.throw((0, codegen_12._)`new ${it.ValidationError}(${errs})`);
    } else {
      gen.assign((0, codegen_12._)`${validateName}.errors`, errs);
      gen.return(false);
    }
  }
  const E = {
    keyword: new codegen_12.Name("keyword"),
    schemaPath: new codegen_12.Name("schemaPath"),
    // also used in JTD errors
    params: new codegen_12.Name("params"),
    propertyName: new codegen_12.Name("propertyName"),
    message: new codegen_12.Name("message"),
    schema: new codegen_12.Name("schema"),
    parentSchema: new codegen_12.Name("parentSchema")
  };
  function errorObjectCode(cxt, error2, errorPaths) {
    const { createErrors } = cxt.it;
    if (createErrors === false)
      return (0, codegen_12._)`{}`;
    return errorObject(cxt, error2, errorPaths);
  }
  function errorObject(cxt, error2, errorPaths = {}) {
    const { gen, it } = cxt;
    const keyValues = [
      errorInstancePath(it, errorPaths),
      errorSchemaPath(cxt, errorPaths)
    ];
    extraErrorProps(cxt, error2, keyValues);
    return gen.object(...keyValues);
  }
  function errorInstancePath({ errorPath }, { instancePath }) {
    const instPath = instancePath ? (0, codegen_12.str)`${errorPath}${(0, util_12.getErrorPath)(instancePath, util_12.Type.Str)}` : errorPath;
    return [names_12.default.instancePath, (0, codegen_12.strConcat)(names_12.default.instancePath, instPath)];
  }
  function errorSchemaPath({ keyword: keyword2, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
    let schPath = parentSchema ? errSchemaPath : (0, codegen_12.str)`${errSchemaPath}/${keyword2}`;
    if (schemaPath) {
      schPath = (0, codegen_12.str)`${schPath}${(0, util_12.getErrorPath)(schemaPath, util_12.Type.Str)}`;
    }
    return [E.schemaPath, schPath];
  }
  function extraErrorProps(cxt, { params, message }, keyValues) {
    const { keyword: keyword2, data, schemaValue, it } = cxt;
    const { opts, propertyName, topSchemaRef, schemaPath } = it;
    keyValues.push([E.keyword, keyword2], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_12._)`{}`]);
    if (opts.messages) {
      keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
    }
    if (opts.verbose) {
      keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_12._)`${topSchemaRef}${schemaPath}`], [names_12.default.data, data]);
    }
    if (propertyName)
      keyValues.push([E.propertyName, propertyName]);
  }
})(errors);
Object.defineProperty(boolSchema, "__esModule", { value: true });
boolSchema.boolOrEmptySchema = boolSchema.topBoolOrEmptySchema = void 0;
const errors_1$3 = errors;
const codegen_1$x = codegen;
const names_1$9 = names$1;
const boolError = {
  message: "boolean schema is false"
};
function topBoolOrEmptySchema(it) {
  const { gen, schema, validateName } = it;
  if (schema === false) {
    falseSchemaError(it, false);
  } else if (typeof schema == "object" && schema.$async === true) {
    gen.return(names_1$9.default.data);
  } else {
    gen.assign((0, codegen_1$x._)`${validateName}.errors`, null);
    gen.return(true);
  }
}
boolSchema.topBoolOrEmptySchema = topBoolOrEmptySchema;
function boolOrEmptySchema(it, valid) {
  const { gen, schema } = it;
  if (schema === false) {
    gen.var(valid, false);
    falseSchemaError(it);
  } else {
    gen.var(valid, true);
  }
}
boolSchema.boolOrEmptySchema = boolOrEmptySchema;
function falseSchemaError(it, overrideAllErrors) {
  const { gen, data } = it;
  const cxt = {
    gen,
    keyword: "false schema",
    data,
    schema: false,
    schemaCode: false,
    schemaValue: false,
    params: {},
    it
  };
  (0, errors_1$3.reportError)(cxt, boolError, void 0, overrideAllErrors);
}
var dataType = {};
var rules = {};
Object.defineProperty(rules, "__esModule", { value: true });
rules.getRules = rules.isJSONType = void 0;
const _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
const jsonTypes = new Set(_jsonTypes);
function isJSONType(x) {
  return typeof x == "string" && jsonTypes.has(x);
}
rules.isJSONType = isJSONType;
function getRules() {
  const groups = {
    number: { type: "number", rules: [] },
    string: { type: "string", rules: [] },
    array: { type: "array", rules: [] },
    object: { type: "object", rules: [] }
  };
  return {
    types: { ...groups, integer: true, boolean: true, null: true },
    rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
    post: { rules: [] },
    all: {},
    keywords: {}
  };
}
rules.getRules = getRules;
var applicability = {};
Object.defineProperty(applicability, "__esModule", { value: true });
applicability.shouldUseRule = applicability.shouldUseGroup = applicability.schemaHasRulesForType = void 0;
function schemaHasRulesForType({ schema, self: self2 }, type2) {
  const group = self2.RULES.types[type2];
  return group && group !== true && shouldUseGroup(schema, group);
}
applicability.schemaHasRulesForType = schemaHasRulesForType;
function shouldUseGroup(schema, group) {
  return group.rules.some((rule) => shouldUseRule(schema, rule));
}
applicability.shouldUseGroup = shouldUseGroup;
function shouldUseRule(schema, rule) {
  var _a;
  return schema[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
}
applicability.shouldUseRule = shouldUseRule;
Object.defineProperty(dataType, "__esModule", { value: true });
dataType.reportTypeError = dataType.checkDataTypes = dataType.checkDataType = dataType.coerceAndCheckDataType = dataType.getJSONTypes = dataType.getSchemaTypes = dataType.DataType = void 0;
const rules_1 = rules;
const applicability_1$1 = applicability;
const errors_1$2 = errors;
const codegen_1$w = codegen;
const util_1$v = util;
var DataType;
(function(DataType2) {
  DataType2[DataType2["Correct"] = 0] = "Correct";
  DataType2[DataType2["Wrong"] = 1] = "Wrong";
})(DataType || (dataType.DataType = DataType = {}));
function getSchemaTypes(schema) {
  const types2 = getJSONTypes(schema.type);
  const hasNull = types2.includes("null");
  if (hasNull) {
    if (schema.nullable === false)
      throw new Error("type: null contradicts nullable: false");
  } else {
    if (!types2.length && schema.nullable !== void 0) {
      throw new Error('"nullable" cannot be used without "type"');
    }
    if (schema.nullable === true)
      types2.push("null");
  }
  return types2;
}
dataType.getSchemaTypes = getSchemaTypes;
function getJSONTypes(ts) {
  const types2 = Array.isArray(ts) ? ts : ts ? [ts] : [];
  if (types2.every(rules_1.isJSONType))
    return types2;
  throw new Error("type must be JSONType or JSONType[]: " + types2.join(","));
}
dataType.getJSONTypes = getJSONTypes;
function coerceAndCheckDataType(it, types2) {
  const { gen, data, opts } = it;
  const coerceTo = coerceToTypes(types2, opts.coerceTypes);
  const checkTypes = types2.length > 0 && !(coerceTo.length === 0 && types2.length === 1 && (0, applicability_1$1.schemaHasRulesForType)(it, types2[0]));
  if (checkTypes) {
    const wrongType = checkDataTypes(types2, data, opts.strictNumbers, DataType.Wrong);
    gen.if(wrongType, () => {
      if (coerceTo.length)
        coerceData(it, types2, coerceTo);
      else
        reportTypeError(it);
    });
  }
  return checkTypes;
}
dataType.coerceAndCheckDataType = coerceAndCheckDataType;
const COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
function coerceToTypes(types2, coerceTypes) {
  return coerceTypes ? types2.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
}
function coerceData(it, types2, coerceTo) {
  const { gen, data, opts } = it;
  const dataType2 = gen.let("dataType", (0, codegen_1$w._)`typeof ${data}`);
  const coerced = gen.let("coerced", (0, codegen_1$w._)`undefined`);
  if (opts.coerceTypes === "array") {
    gen.if((0, codegen_1$w._)`${dataType2} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1$w._)`${data}[0]`).assign(dataType2, (0, codegen_1$w._)`typeof ${data}`).if(checkDataTypes(types2, data, opts.strictNumbers), () => gen.assign(coerced, data)));
  }
  gen.if((0, codegen_1$w._)`${coerced} !== undefined`);
  for (const t of coerceTo) {
    if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
      coerceSpecificType(t);
    }
  }
  gen.else();
  reportTypeError(it);
  gen.endIf();
  gen.if((0, codegen_1$w._)`${coerced} !== undefined`, () => {
    gen.assign(data, coerced);
    assignParentData(it, coerced);
  });
  function coerceSpecificType(t) {
    switch (t) {
      case "string":
        gen.elseIf((0, codegen_1$w._)`${dataType2} == "number" || ${dataType2} == "boolean"`).assign(coerced, (0, codegen_1$w._)`"" + ${data}`).elseIf((0, codegen_1$w._)`${data} === null`).assign(coerced, (0, codegen_1$w._)`""`);
        return;
      case "number":
        gen.elseIf((0, codegen_1$w._)`${dataType2} == "boolean" || ${data} === null
              || (${dataType2} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1$w._)`+${data}`);
        return;
      case "integer":
        gen.elseIf((0, codegen_1$w._)`${dataType2} === "boolean" || ${data} === null
              || (${dataType2} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1$w._)`+${data}`);
        return;
      case "boolean":
        gen.elseIf((0, codegen_1$w._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1$w._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
        return;
      case "null":
        gen.elseIf((0, codegen_1$w._)`${data} === "" || ${data} === 0 || ${data} === false`);
        gen.assign(coerced, null);
        return;
      case "array":
        gen.elseIf((0, codegen_1$w._)`${dataType2} === "string" || ${dataType2} === "number"
              || ${dataType2} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1$w._)`[${data}]`);
    }
  }
}
function assignParentData({ gen, parentData, parentDataProperty }, expr) {
  gen.if((0, codegen_1$w._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1$w._)`${parentData}[${parentDataProperty}]`, expr));
}
function checkDataType(dataType2, data, strictNums, correct = DataType.Correct) {
  const EQ = correct === DataType.Correct ? codegen_1$w.operators.EQ : codegen_1$w.operators.NEQ;
  let cond;
  switch (dataType2) {
    case "null":
      return (0, codegen_1$w._)`${data} ${EQ} null`;
    case "array":
      cond = (0, codegen_1$w._)`Array.isArray(${data})`;
      break;
    case "object":
      cond = (0, codegen_1$w._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
      break;
    case "integer":
      cond = numCond((0, codegen_1$w._)`!(${data} % 1) && !isNaN(${data})`);
      break;
    case "number":
      cond = numCond();
      break;
    default:
      return (0, codegen_1$w._)`typeof ${data} ${EQ} ${dataType2}`;
  }
  return correct === DataType.Correct ? cond : (0, codegen_1$w.not)(cond);
  function numCond(_cond = codegen_1$w.nil) {
    return (0, codegen_1$w.and)((0, codegen_1$w._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1$w._)`isFinite(${data})` : codegen_1$w.nil);
  }
}
dataType.checkDataType = checkDataType;
function checkDataTypes(dataTypes, data, strictNums, correct) {
  if (dataTypes.length === 1) {
    return checkDataType(dataTypes[0], data, strictNums, correct);
  }
  let cond;
  const types2 = (0, util_1$v.toHash)(dataTypes);
  if (types2.array && types2.object) {
    const notObj = (0, codegen_1$w._)`typeof ${data} != "object"`;
    cond = types2.null ? notObj : (0, codegen_1$w._)`!${data} || ${notObj}`;
    delete types2.null;
    delete types2.array;
    delete types2.object;
  } else {
    cond = codegen_1$w.nil;
  }
  if (types2.number)
    delete types2.integer;
  for (const t in types2)
    cond = (0, codegen_1$w.and)(cond, checkDataType(t, data, strictNums, correct));
  return cond;
}
dataType.checkDataTypes = checkDataTypes;
const typeError = {
  message: ({ schema }) => `must be ${schema}`,
  params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1$w._)`{type: ${schema}}` : (0, codegen_1$w._)`{type: ${schemaValue}}`
};
function reportTypeError(it) {
  const cxt = getTypeErrorContext(it);
  (0, errors_1$2.reportError)(cxt, typeError);
}
dataType.reportTypeError = reportTypeError;
function getTypeErrorContext(it) {
  const { gen, data, schema } = it;
  const schemaCode = (0, util_1$v.schemaRefOrVal)(it, schema, "type");
  return {
    gen,
    keyword: "type",
    data,
    schema: schema.type,
    schemaCode,
    schemaValue: schemaCode,
    parentSchema: schema,
    params: {},
    it
  };
}
var defaults = {};
Object.defineProperty(defaults, "__esModule", { value: true });
defaults.assignDefaults = void 0;
const codegen_1$v = codegen;
const util_1$u = util;
function assignDefaults(it, ty) {
  const { properties: properties2, items: items2 } = it.schema;
  if (ty === "object" && properties2) {
    for (const key in properties2) {
      assignDefault(it, key, properties2[key].default);
    }
  } else if (ty === "array" && Array.isArray(items2)) {
    items2.forEach((sch, i) => assignDefault(it, i, sch.default));
  }
}
defaults.assignDefaults = assignDefaults;
function assignDefault(it, prop, defaultValue) {
  const { gen, compositeRule, data, opts } = it;
  if (defaultValue === void 0)
    return;
  const childData = (0, codegen_1$v._)`${data}${(0, codegen_1$v.getProperty)(prop)}`;
  if (compositeRule) {
    (0, util_1$u.checkStrictMode)(it, `default is ignored for: ${childData}`);
    return;
  }
  let condition = (0, codegen_1$v._)`${childData} === undefined`;
  if (opts.useDefaults === "empty") {
    condition = (0, codegen_1$v._)`${condition} || ${childData} === null || ${childData} === ""`;
  }
  gen.if(condition, (0, codegen_1$v._)`${childData} = ${(0, codegen_1$v.stringify)(defaultValue)}`);
}
var keyword = {};
var code = {};
Object.defineProperty(code, "__esModule", { value: true });
code.validateUnion = code.validateArray = code.usePattern = code.callValidateCode = code.schemaProperties = code.allSchemaProperties = code.noPropertyInData = code.propertyInData = code.isOwnProperty = code.hasPropFunc = code.reportMissingProp = code.checkMissingProp = code.checkReportMissingProp = void 0;
const codegen_1$u = codegen;
const util_1$t = util;
const names_1$8 = names$1;
const util_2$1 = util;
function checkReportMissingProp(cxt, prop) {
  const { gen, data, it } = cxt;
  gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
    cxt.setParams({ missingProperty: (0, codegen_1$u._)`${prop}` }, true);
    cxt.error();
  });
}
code.checkReportMissingProp = checkReportMissingProp;
function checkMissingProp({ gen, data, it: { opts } }, properties2, missing) {
  return (0, codegen_1$u.or)(...properties2.map((prop) => (0, codegen_1$u.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1$u._)`${missing} = ${prop}`)));
}
code.checkMissingProp = checkMissingProp;
function reportMissingProp(cxt, missing) {
  cxt.setParams({ missingProperty: missing }, true);
  cxt.error();
}
code.reportMissingProp = reportMissingProp;
function hasPropFunc(gen) {
  return gen.scopeValue("func", {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    ref: Object.prototype.hasOwnProperty,
    code: (0, codegen_1$u._)`Object.prototype.hasOwnProperty`
  });
}
code.hasPropFunc = hasPropFunc;
function isOwnProperty(gen, data, property) {
  return (0, codegen_1$u._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
}
code.isOwnProperty = isOwnProperty;
function propertyInData(gen, data, property, ownProperties) {
  const cond = (0, codegen_1$u._)`${data}${(0, codegen_1$u.getProperty)(property)} !== undefined`;
  return ownProperties ? (0, codegen_1$u._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
}
code.propertyInData = propertyInData;
function noPropertyInData(gen, data, property, ownProperties) {
  const cond = (0, codegen_1$u._)`${data}${(0, codegen_1$u.getProperty)(property)} === undefined`;
  return ownProperties ? (0, codegen_1$u.or)(cond, (0, codegen_1$u.not)(isOwnProperty(gen, data, property))) : cond;
}
code.noPropertyInData = noPropertyInData;
function allSchemaProperties(schemaMap) {
  return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
}
code.allSchemaProperties = allSchemaProperties;
function schemaProperties(it, schemaMap) {
  return allSchemaProperties(schemaMap).filter((p) => !(0, util_1$t.alwaysValidSchema)(it, schemaMap[p]));
}
code.schemaProperties = schemaProperties;
function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
  const dataAndSchema = passSchema ? (0, codegen_1$u._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
  const valCxt = [
    [names_1$8.default.instancePath, (0, codegen_1$u.strConcat)(names_1$8.default.instancePath, errorPath)],
    [names_1$8.default.parentData, it.parentData],
    [names_1$8.default.parentDataProperty, it.parentDataProperty],
    [names_1$8.default.rootData, names_1$8.default.rootData]
  ];
  if (it.opts.dynamicRef)
    valCxt.push([names_1$8.default.dynamicAnchors, names_1$8.default.dynamicAnchors]);
  const args = (0, codegen_1$u._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
  return context !== codegen_1$u.nil ? (0, codegen_1$u._)`${func}.call(${context}, ${args})` : (0, codegen_1$u._)`${func}(${args})`;
}
code.callValidateCode = callValidateCode;
const newRegExp = (0, codegen_1$u._)`new RegExp`;
function usePattern({ gen, it: { opts } }, pattern2) {
  const u = opts.unicodeRegExp ? "u" : "";
  const { regExp } = opts.code;
  const rx = regExp(pattern2, u);
  return gen.scopeValue("pattern", {
    key: rx.toString(),
    ref: rx,
    code: (0, codegen_1$u._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2$1.useFunc)(gen, regExp)}(${pattern2}, ${u})`
  });
}
code.usePattern = usePattern;
function validateArray(cxt) {
  const { gen, data, keyword: keyword2, it } = cxt;
  const valid = gen.name("valid");
  if (it.allErrors) {
    const validArr = gen.let("valid", true);
    validateItems(() => gen.assign(validArr, false));
    return validArr;
  }
  gen.var(valid, true);
  validateItems(() => gen.break());
  return valid;
  function validateItems(notValid) {
    const len = gen.const("len", (0, codegen_1$u._)`${data}.length`);
    gen.forRange("i", 0, len, (i) => {
      cxt.subschema({
        keyword: keyword2,
        dataProp: i,
        dataPropType: util_1$t.Type.Num
      }, valid);
      gen.if((0, codegen_1$u.not)(valid), notValid);
    });
  }
}
code.validateArray = validateArray;
function validateUnion(cxt) {
  const { gen, schema, keyword: keyword2, it } = cxt;
  if (!Array.isArray(schema))
    throw new Error("ajv implementation error");
  const alwaysValid = schema.some((sch) => (0, util_1$t.alwaysValidSchema)(it, sch));
  if (alwaysValid && !it.opts.unevaluated)
    return;
  const valid = gen.let("valid", false);
  const schValid = gen.name("_valid");
  gen.block(() => schema.forEach((_sch, i) => {
    const schCxt = cxt.subschema({
      keyword: keyword2,
      schemaProp: i,
      compositeRule: true
    }, schValid);
    gen.assign(valid, (0, codegen_1$u._)`${valid} || ${schValid}`);
    const merged = cxt.mergeValidEvaluated(schCxt, schValid);
    if (!merged)
      gen.if((0, codegen_1$u.not)(valid));
  }));
  cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
}
code.validateUnion = validateUnion;
Object.defineProperty(keyword, "__esModule", { value: true });
keyword.validateKeywordUsage = keyword.validSchemaType = keyword.funcKeywordCode = keyword.macroKeywordCode = void 0;
const codegen_1$t = codegen;
const names_1$7 = names$1;
const code_1$9 = code;
const errors_1$1 = errors;
function macroKeywordCode(cxt, def2) {
  const { gen, keyword: keyword2, schema, parentSchema, it } = cxt;
  const macroSchema = def2.macro.call(it.self, schema, parentSchema, it);
  const schemaRef = useKeyword(gen, keyword2, macroSchema);
  if (it.opts.validateSchema !== false)
    it.self.validateSchema(macroSchema, true);
  const valid = gen.name("valid");
  cxt.subschema({
    schema: macroSchema,
    schemaPath: codegen_1$t.nil,
    errSchemaPath: `${it.errSchemaPath}/${keyword2}`,
    topSchemaRef: schemaRef,
    compositeRule: true
  }, valid);
  cxt.pass(valid, () => cxt.error(true));
}
keyword.macroKeywordCode = macroKeywordCode;
function funcKeywordCode(cxt, def2) {
  var _a;
  const { gen, keyword: keyword2, schema, parentSchema, $data, it } = cxt;
  checkAsyncKeyword(it, def2);
  const validate2 = !$data && def2.compile ? def2.compile.call(it.self, schema, parentSchema, it) : def2.validate;
  const validateRef = useKeyword(gen, keyword2, validate2);
  const valid = gen.let("valid");
  cxt.block$data(valid, validateKeyword);
  cxt.ok((_a = def2.valid) !== null && _a !== void 0 ? _a : valid);
  function validateKeyword() {
    if (def2.errors === false) {
      assignValid();
      if (def2.modifying)
        modifyData(cxt);
      reportErrs(() => cxt.error());
    } else {
      const ruleErrs = def2.async ? validateAsync() : validateSync();
      if (def2.modifying)
        modifyData(cxt);
      reportErrs(() => addErrs(cxt, ruleErrs));
    }
  }
  function validateAsync() {
    const ruleErrs = gen.let("ruleErrs", null);
    gen.try(() => assignValid((0, codegen_1$t._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1$t._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1$t._)`${e}.errors`), () => gen.throw(e)));
    return ruleErrs;
  }
  function validateSync() {
    const validateErrs = (0, codegen_1$t._)`${validateRef}.errors`;
    gen.assign(validateErrs, null);
    assignValid(codegen_1$t.nil);
    return validateErrs;
  }
  function assignValid(_await = def2.async ? (0, codegen_1$t._)`await ` : codegen_1$t.nil) {
    const passCxt = it.opts.passContext ? names_1$7.default.this : names_1$7.default.self;
    const passSchema = !("compile" in def2 && !$data || def2.schema === false);
    gen.assign(valid, (0, codegen_1$t._)`${_await}${(0, code_1$9.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def2.modifying);
  }
  function reportErrs(errors2) {
    var _a2;
    gen.if((0, codegen_1$t.not)((_a2 = def2.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors2);
  }
}
keyword.funcKeywordCode = funcKeywordCode;
function modifyData(cxt) {
  const { gen, data, it } = cxt;
  gen.if(it.parentData, () => gen.assign(data, (0, codegen_1$t._)`${it.parentData}[${it.parentDataProperty}]`));
}
function addErrs(cxt, errs) {
  const { gen } = cxt;
  gen.if((0, codegen_1$t._)`Array.isArray(${errs})`, () => {
    gen.assign(names_1$7.default.vErrors, (0, codegen_1$t._)`${names_1$7.default.vErrors} === null ? ${errs} : ${names_1$7.default.vErrors}.concat(${errs})`).assign(names_1$7.default.errors, (0, codegen_1$t._)`${names_1$7.default.vErrors}.length`);
    (0, errors_1$1.extendErrors)(cxt);
  }, () => cxt.error());
}
function checkAsyncKeyword({ schemaEnv }, def2) {
  if (def2.async && !schemaEnv.$async)
    throw new Error("async keyword in sync schema");
}
function useKeyword(gen, keyword2, result) {
  if (result === void 0)
    throw new Error(`keyword "${keyword2}" failed to compile`);
  return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1$t.stringify)(result) });
}
function validSchemaType(schema, schemaType, allowUndefined = false) {
  return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
}
keyword.validSchemaType = validSchemaType;
function validateKeywordUsage({ schema, opts, self: self2, errSchemaPath }, def2, keyword2) {
  if (Array.isArray(def2.keyword) ? !def2.keyword.includes(keyword2) : def2.keyword !== keyword2) {
    throw new Error("ajv implementation error");
  }
  const deps = def2.dependencies;
  if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
    throw new Error(`parent schema must have dependencies of ${keyword2}: ${deps.join(",")}`);
  }
  if (def2.validateSchema) {
    const valid = def2.validateSchema(schema[keyword2]);
    if (!valid) {
      const msg = `keyword "${keyword2}" value is invalid at path "${errSchemaPath}": ` + self2.errorsText(def2.validateSchema.errors);
      if (opts.validateSchema === "log")
        self2.logger.error(msg);
      else
        throw new Error(msg);
    }
  }
}
keyword.validateKeywordUsage = validateKeywordUsage;
var subschema = {};
Object.defineProperty(subschema, "__esModule", { value: true });
subschema.extendSubschemaMode = subschema.extendSubschemaData = subschema.getSubschema = void 0;
const codegen_1$s = codegen;
const util_1$s = util;
function getSubschema(it, { keyword: keyword2, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
  if (keyword2 !== void 0 && schema !== void 0) {
    throw new Error('both "keyword" and "schema" passed, only one allowed');
  }
  if (keyword2 !== void 0) {
    const sch = it.schema[keyword2];
    return schemaProp === void 0 ? {
      schema: sch,
      schemaPath: (0, codegen_1$s._)`${it.schemaPath}${(0, codegen_1$s.getProperty)(keyword2)}`,
      errSchemaPath: `${it.errSchemaPath}/${keyword2}`
    } : {
      schema: sch[schemaProp],
      schemaPath: (0, codegen_1$s._)`${it.schemaPath}${(0, codegen_1$s.getProperty)(keyword2)}${(0, codegen_1$s.getProperty)(schemaProp)}`,
      errSchemaPath: `${it.errSchemaPath}/${keyword2}/${(0, util_1$s.escapeFragment)(schemaProp)}`
    };
  }
  if (schema !== void 0) {
    if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
      throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
    }
    return {
      schema,
      schemaPath,
      topSchemaRef,
      errSchemaPath
    };
  }
  throw new Error('either "keyword" or "schema" must be passed');
}
subschema.getSubschema = getSubschema;
function extendSubschemaData(subschema2, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
  if (data !== void 0 && dataProp !== void 0) {
    throw new Error('both "data" and "dataProp" passed, only one allowed');
  }
  const { gen } = it;
  if (dataProp !== void 0) {
    const { errorPath, dataPathArr, opts } = it;
    const nextData = gen.let("data", (0, codegen_1$s._)`${it.data}${(0, codegen_1$s.getProperty)(dataProp)}`, true);
    dataContextProps(nextData);
    subschema2.errorPath = (0, codegen_1$s.str)`${errorPath}${(0, util_1$s.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
    subschema2.parentDataProperty = (0, codegen_1$s._)`${dataProp}`;
    subschema2.dataPathArr = [...dataPathArr, subschema2.parentDataProperty];
  }
  if (data !== void 0) {
    const nextData = data instanceof codegen_1$s.Name ? data : gen.let("data", data, true);
    dataContextProps(nextData);
    if (propertyName !== void 0)
      subschema2.propertyName = propertyName;
  }
  if (dataTypes)
    subschema2.dataTypes = dataTypes;
  function dataContextProps(_nextData) {
    subschema2.data = _nextData;
    subschema2.dataLevel = it.dataLevel + 1;
    subschema2.dataTypes = [];
    it.definedProperties = /* @__PURE__ */ new Set();
    subschema2.parentData = it.data;
    subschema2.dataNames = [...it.dataNames, _nextData];
  }
}
subschema.extendSubschemaData = extendSubschemaData;
function extendSubschemaMode(subschema2, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
  if (compositeRule !== void 0)
    subschema2.compositeRule = compositeRule;
  if (createErrors !== void 0)
    subschema2.createErrors = createErrors;
  if (allErrors !== void 0)
    subschema2.allErrors = allErrors;
  subschema2.jtdDiscriminator = jtdDiscriminator;
  subschema2.jtdMetadata = jtdMetadata;
}
subschema.extendSubschemaMode = extendSubschemaMode;
var resolve$3 = {};
var fastDeepEqual = function equal(a, b) {
  if (a === b) return true;
  if (a && b && typeof a == "object" && typeof b == "object") {
    if (a.constructor !== b.constructor) return false;
    var length, i, keys;
    if (Array.isArray(a)) {
      length = a.length;
      if (length != b.length) return false;
      for (i = length; i-- !== 0; )
        if (!equal(a[i], b[i])) return false;
      return true;
    }
    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
    keys = Object.keys(a);
    length = keys.length;
    if (length !== Object.keys(b).length) return false;
    for (i = length; i-- !== 0; )
      if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
    for (i = length; i-- !== 0; ) {
      var key = keys[i];
      if (!equal(a[key], b[key])) return false;
    }
    return true;
  }
  return a !== a && b !== b;
};
var jsonSchemaTraverse = { exports: {} };
var traverse$1 = jsonSchemaTraverse.exports = function(schema, opts, cb) {
  if (typeof opts == "function") {
    cb = opts;
    opts = {};
  }
  cb = opts.cb || cb;
  var pre = typeof cb == "function" ? cb : cb.pre || function() {
  };
  var post = cb.post || function() {
  };
  _traverse(opts, pre, post, schema, "", schema);
};
traverse$1.keywords = {
  additionalItems: true,
  items: true,
  contains: true,
  additionalProperties: true,
  propertyNames: true,
  not: true,
  if: true,
  then: true,
  else: true
};
traverse$1.arrayKeywords = {
  items: true,
  allOf: true,
  anyOf: true,
  oneOf: true
};
traverse$1.propsKeywords = {
  $defs: true,
  definitions: true,
  properties: true,
  patternProperties: true,
  dependencies: true
};
traverse$1.skipKeywords = {
  default: true,
  enum: true,
  const: true,
  required: true,
  maximum: true,
  minimum: true,
  exclusiveMaximum: true,
  exclusiveMinimum: true,
  multipleOf: true,
  maxLength: true,
  minLength: true,
  pattern: true,
  format: true,
  maxItems: true,
  minItems: true,
  uniqueItems: true,
  maxProperties: true,
  minProperties: true
};
function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
  if (schema && typeof schema == "object" && !Array.isArray(schema)) {
    pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
    for (var key in schema) {
      var sch = schema[key];
      if (Array.isArray(sch)) {
        if (key in traverse$1.arrayKeywords) {
          for (var i = 0; i < sch.length; i++)
            _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
        }
      } else if (key in traverse$1.propsKeywords) {
        if (sch && typeof sch == "object") {
          for (var prop in sch)
            _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
        }
      } else if (key in traverse$1.keywords || opts.allKeys && !(key in traverse$1.skipKeywords)) {
        _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
      }
    }
    post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
  }
}
function escapeJsonPtr(str) {
  return str.replace(/~/g, "~0").replace(/\//g, "~1");
}
var jsonSchemaTraverseExports = jsonSchemaTraverse.exports;
Object.defineProperty(resolve$3, "__esModule", { value: true });
resolve$3.getSchemaRefs = resolve$3.resolveUrl = resolve$3.normalizeId = resolve$3._getFullPath = resolve$3.getFullPath = resolve$3.inlineRef = void 0;
const util_1$r = util;
const equal$3 = fastDeepEqual;
const traverse = jsonSchemaTraverseExports;
const SIMPLE_INLINED = /* @__PURE__ */ new Set([
  "type",
  "format",
  "pattern",
  "maxLength",
  "minLength",
  "maxProperties",
  "minProperties",
  "maxItems",
  "minItems",
  "maximum",
  "minimum",
  "uniqueItems",
  "multipleOf",
  "required",
  "enum",
  "const"
]);
function inlineRef(schema, limit = true) {
  if (typeof schema == "boolean")
    return true;
  if (limit === true)
    return !hasRef(schema);
  if (!limit)
    return false;
  return countKeys(schema) <= limit;
}
resolve$3.inlineRef = inlineRef;
const REF_KEYWORDS = /* @__PURE__ */ new Set([
  "$ref",
  "$recursiveRef",
  "$recursiveAnchor",
  "$dynamicRef",
  "$dynamicAnchor"
]);
function hasRef(schema) {
  for (const key in schema) {
    if (REF_KEYWORDS.has(key))
      return true;
    const sch = schema[key];
    if (Array.isArray(sch) && sch.some(hasRef))
      return true;
    if (typeof sch == "object" && hasRef(sch))
      return true;
  }
  return false;
}
function countKeys(schema) {
  let count = 0;
  for (const key in schema) {
    if (key === "$ref")
      return Infinity;
    count++;
    if (SIMPLE_INLINED.has(key))
      continue;
    if (typeof schema[key] == "object") {
      (0, util_1$r.eachItem)(schema[key], (sch) => count += countKeys(sch));
    }
    if (count === Infinity)
      return Infinity;
  }
  return count;
}
function getFullPath(resolver, id2 = "", normalize2) {
  if (normalize2 !== false)
    id2 = normalizeId(id2);
  const p = resolver.parse(id2);
  return _getFullPath(resolver, p);
}
resolve$3.getFullPath = getFullPath;
function _getFullPath(resolver, p) {
  const serialized = resolver.serialize(p);
  return serialized.split("#")[0] + "#";
}
resolve$3._getFullPath = _getFullPath;
const TRAILING_SLASH_HASH = /#\/?$/;
function normalizeId(id2) {
  return id2 ? id2.replace(TRAILING_SLASH_HASH, "") : "";
}
resolve$3.normalizeId = normalizeId;
function resolveUrl(resolver, baseId, id2) {
  id2 = normalizeId(id2);
  return resolver.resolve(baseId, id2);
}
resolve$3.resolveUrl = resolveUrl;
const ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
function getSchemaRefs(schema, baseId) {
  if (typeof schema == "boolean")
    return {};
  const { schemaId, uriResolver } = this.opts;
  const schId = normalizeId(schema[schemaId] || baseId);
  const baseIds = { "": schId };
  const pathPrefix = getFullPath(uriResolver, schId, false);
  const localRefs = {};
  const schemaRefs = /* @__PURE__ */ new Set();
  traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
    if (parentJsonPtr === void 0)
      return;
    const fullPath = pathPrefix + jsonPtr;
    let innerBaseId = baseIds[parentJsonPtr];
    if (typeof sch[schemaId] == "string")
      innerBaseId = addRef.call(this, sch[schemaId]);
    addAnchor.call(this, sch.$anchor);
    addAnchor.call(this, sch.$dynamicAnchor);
    baseIds[jsonPtr] = innerBaseId;
    function addRef(ref2) {
      const _resolve = this.opts.uriResolver.resolve;
      ref2 = normalizeId(innerBaseId ? _resolve(innerBaseId, ref2) : ref2);
      if (schemaRefs.has(ref2))
        throw ambiguos(ref2);
      schemaRefs.add(ref2);
      let schOrRef = this.refs[ref2];
      if (typeof schOrRef == "string")
        schOrRef = this.refs[schOrRef];
      if (typeof schOrRef == "object") {
        checkAmbiguosRef(sch, schOrRef.schema, ref2);
      } else if (ref2 !== normalizeId(fullPath)) {
        if (ref2[0] === "#") {
          checkAmbiguosRef(sch, localRefs[ref2], ref2);
          localRefs[ref2] = sch;
        } else {
          this.refs[ref2] = fullPath;
        }
      }
      return ref2;
    }
    function addAnchor(anchor) {
      if (typeof anchor == "string") {
        if (!ANCHOR.test(anchor))
          throw new Error(`invalid anchor "${anchor}"`);
        addRef.call(this, `#${anchor}`);
      }
    }
  });
  return localRefs;
  function checkAmbiguosRef(sch1, sch2, ref2) {
    if (sch2 !== void 0 && !equal$3(sch1, sch2))
      throw ambiguos(ref2);
  }
  function ambiguos(ref2) {
    return new Error(`reference "${ref2}" resolves to more than one schema`);
  }
}
resolve$3.getSchemaRefs = getSchemaRefs;
Object.defineProperty(validate, "__esModule", { value: true });
validate.getData = validate.KeywordCxt = validate.validateFunctionCode = void 0;
const boolSchema_1 = boolSchema;
const dataType_1$1 = dataType;
const applicability_1 = applicability;
const dataType_2 = dataType;
const defaults_1 = defaults;
const keyword_1 = keyword;
const subschema_1 = subschema;
const codegen_1$r = codegen;
const names_1$6 = names$1;
const resolve_1$2 = resolve$3;
const util_1$q = util;
const errors_1 = errors;
function validateFunctionCode(it) {
  if (isSchemaObj(it)) {
    checkKeywords(it);
    if (schemaCxtHasRules(it)) {
      topSchemaObjCode(it);
      return;
    }
  }
  validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
}
validate.validateFunctionCode = validateFunctionCode;
function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
  if (opts.code.es5) {
    gen.func(validateName, (0, codegen_1$r._)`${names_1$6.default.data}, ${names_1$6.default.valCxt}`, schemaEnv.$async, () => {
      gen.code((0, codegen_1$r._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
      destructureValCxtES5(gen, opts);
      gen.code(body);
    });
  } else {
    gen.func(validateName, (0, codegen_1$r._)`${names_1$6.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
  }
}
function destructureValCxt(opts) {
  return (0, codegen_1$r._)`{${names_1$6.default.instancePath}="", ${names_1$6.default.parentData}, ${names_1$6.default.parentDataProperty}, ${names_1$6.default.rootData}=${names_1$6.default.data}${opts.dynamicRef ? (0, codegen_1$r._)`, ${names_1$6.default.dynamicAnchors}={}` : codegen_1$r.nil}}={}`;
}
function destructureValCxtES5(gen, opts) {
  gen.if(names_1$6.default.valCxt, () => {
    gen.var(names_1$6.default.instancePath, (0, codegen_1$r._)`${names_1$6.default.valCxt}.${names_1$6.default.instancePath}`);
    gen.var(names_1$6.default.parentData, (0, codegen_1$r._)`${names_1$6.default.valCxt}.${names_1$6.default.parentData}`);
    gen.var(names_1$6.default.parentDataProperty, (0, codegen_1$r._)`${names_1$6.default.valCxt}.${names_1$6.default.parentDataProperty}`);
    gen.var(names_1$6.default.rootData, (0, codegen_1$r._)`${names_1$6.default.valCxt}.${names_1$6.default.rootData}`);
    if (opts.dynamicRef)
      gen.var(names_1$6.default.dynamicAnchors, (0, codegen_1$r._)`${names_1$6.default.valCxt}.${names_1$6.default.dynamicAnchors}`);
  }, () => {
    gen.var(names_1$6.default.instancePath, (0, codegen_1$r._)`""`);
    gen.var(names_1$6.default.parentData, (0, codegen_1$r._)`undefined`);
    gen.var(names_1$6.default.parentDataProperty, (0, codegen_1$r._)`undefined`);
    gen.var(names_1$6.default.rootData, names_1$6.default.data);
    if (opts.dynamicRef)
      gen.var(names_1$6.default.dynamicAnchors, (0, codegen_1$r._)`{}`);
  });
}
function topSchemaObjCode(it) {
  const { schema, opts, gen } = it;
  validateFunction(it, () => {
    if (opts.$comment && schema.$comment)
      commentKeyword(it);
    checkNoDefault(it);
    gen.let(names_1$6.default.vErrors, null);
    gen.let(names_1$6.default.errors, 0);
    if (opts.unevaluated)
      resetEvaluated(it);
    typeAndKeywords(it);
    returnResults(it);
  });
  return;
}
function resetEvaluated(it) {
  const { gen, validateName } = it;
  it.evaluated = gen.const("evaluated", (0, codegen_1$r._)`${validateName}.evaluated`);
  gen.if((0, codegen_1$r._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1$r._)`${it.evaluated}.props`, (0, codegen_1$r._)`undefined`));
  gen.if((0, codegen_1$r._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1$r._)`${it.evaluated}.items`, (0, codegen_1$r._)`undefined`));
}
function funcSourceUrl(schema, opts) {
  const schId = typeof schema == "object" && schema[opts.schemaId];
  return schId && (opts.code.source || opts.code.process) ? (0, codegen_1$r._)`/*# sourceURL=${schId} */` : codegen_1$r.nil;
}
function subschemaCode(it, valid) {
  if (isSchemaObj(it)) {
    checkKeywords(it);
    if (schemaCxtHasRules(it)) {
      subSchemaObjCode(it, valid);
      return;
    }
  }
  (0, boolSchema_1.boolOrEmptySchema)(it, valid);
}
function schemaCxtHasRules({ schema, self: self2 }) {
  if (typeof schema == "boolean")
    return !schema;
  for (const key in schema)
    if (self2.RULES.all[key])
      return true;
  return false;
}
function isSchemaObj(it) {
  return typeof it.schema != "boolean";
}
function subSchemaObjCode(it, valid) {
  const { schema, gen, opts } = it;
  if (opts.$comment && schema.$comment)
    commentKeyword(it);
  updateContext(it);
  checkAsyncSchema(it);
  const errsCount = gen.const("_errs", names_1$6.default.errors);
  typeAndKeywords(it, errsCount);
  gen.var(valid, (0, codegen_1$r._)`${errsCount} === ${names_1$6.default.errors}`);
}
function checkKeywords(it) {
  (0, util_1$q.checkUnknownRules)(it);
  checkRefsAndKeywords(it);
}
function typeAndKeywords(it, errsCount) {
  if (it.opts.jtd)
    return schemaKeywords(it, [], false, errsCount);
  const types2 = (0, dataType_1$1.getSchemaTypes)(it.schema);
  const checkedTypes = (0, dataType_1$1.coerceAndCheckDataType)(it, types2);
  schemaKeywords(it, types2, !checkedTypes, errsCount);
}
function checkRefsAndKeywords(it) {
  const { schema, errSchemaPath, opts, self: self2 } = it;
  if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1$q.schemaHasRulesButRef)(schema, self2.RULES)) {
    self2.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
  }
}
function checkNoDefault(it) {
  const { schema, opts } = it;
  if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
    (0, util_1$q.checkStrictMode)(it, "default is ignored in the schema root");
  }
}
function updateContext(it) {
  const schId = it.schema[it.opts.schemaId];
  if (schId)
    it.baseId = (0, resolve_1$2.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
}
function checkAsyncSchema(it) {
  if (it.schema.$async && !it.schemaEnv.$async)
    throw new Error("async schema in sync schema");
}
function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
  const msg = schema.$comment;
  if (opts.$comment === true) {
    gen.code((0, codegen_1$r._)`${names_1$6.default.self}.logger.log(${msg})`);
  } else if (typeof opts.$comment == "function") {
    const schemaPath = (0, codegen_1$r.str)`${errSchemaPath}/$comment`;
    const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
    gen.code((0, codegen_1$r._)`${names_1$6.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
  }
}
function returnResults(it) {
  const { gen, schemaEnv, validateName, ValidationError: ValidationError2, opts } = it;
  if (schemaEnv.$async) {
    gen.if((0, codegen_1$r._)`${names_1$6.default.errors} === 0`, () => gen.return(names_1$6.default.data), () => gen.throw((0, codegen_1$r._)`new ${ValidationError2}(${names_1$6.default.vErrors})`));
  } else {
    gen.assign((0, codegen_1$r._)`${validateName}.errors`, names_1$6.default.vErrors);
    if (opts.unevaluated)
      assignEvaluated(it);
    gen.return((0, codegen_1$r._)`${names_1$6.default.errors} === 0`);
  }
}
function assignEvaluated({ gen, evaluated, props, items: items2 }) {
  if (props instanceof codegen_1$r.Name)
    gen.assign((0, codegen_1$r._)`${evaluated}.props`, props);
  if (items2 instanceof codegen_1$r.Name)
    gen.assign((0, codegen_1$r._)`${evaluated}.items`, items2);
}
function schemaKeywords(it, types2, typeErrors, errsCount) {
  const { gen, schema, data, allErrors, opts, self: self2 } = it;
  const { RULES } = self2;
  if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1$q.schemaHasRulesButRef)(schema, RULES))) {
    gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
    return;
  }
  if (!opts.jtd)
    checkStrictTypes(it, types2);
  gen.block(() => {
    for (const group of RULES.rules)
      groupKeywords(group);
    groupKeywords(RULES.post);
  });
  function groupKeywords(group) {
    if (!(0, applicability_1.shouldUseGroup)(schema, group))
      return;
    if (group.type) {
      gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
      iterateKeywords(it, group);
      if (types2.length === 1 && types2[0] === group.type && typeErrors) {
        gen.else();
        (0, dataType_2.reportTypeError)(it);
      }
      gen.endIf();
    } else {
      iterateKeywords(it, group);
    }
    if (!allErrors)
      gen.if((0, codegen_1$r._)`${names_1$6.default.errors} === ${errsCount || 0}`);
  }
}
function iterateKeywords(it, group) {
  const { gen, schema, opts: { useDefaults } } = it;
  if (useDefaults)
    (0, defaults_1.assignDefaults)(it, group.type);
  gen.block(() => {
    for (const rule of group.rules) {
      if ((0, applicability_1.shouldUseRule)(schema, rule)) {
        keywordCode(it, rule.keyword, rule.definition, group.type);
      }
    }
  });
}
function checkStrictTypes(it, types2) {
  if (it.schemaEnv.meta || !it.opts.strictTypes)
    return;
  checkContextTypes(it, types2);
  if (!it.opts.allowUnionTypes)
    checkMultipleTypes(it, types2);
  checkKeywordTypes(it, it.dataTypes);
}
function checkContextTypes(it, types2) {
  if (!types2.length)
    return;
  if (!it.dataTypes.length) {
    it.dataTypes = types2;
    return;
  }
  types2.forEach((t) => {
    if (!includesType(it.dataTypes, t)) {
      strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
    }
  });
  narrowSchemaTypes(it, types2);
}
function checkMultipleTypes(it, ts) {
  if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
    strictTypesError(it, "use allowUnionTypes to allow union type keyword");
  }
}
function checkKeywordTypes(it, ts) {
  const rules2 = it.self.RULES.all;
  for (const keyword2 in rules2) {
    const rule = rules2[keyword2];
    if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
      const { type: type2 } = rule.definition;
      if (type2.length && !type2.some((t) => hasApplicableType(ts, t))) {
        strictTypesError(it, `missing type "${type2.join(",")}" for keyword "${keyword2}"`);
      }
    }
  }
}
function hasApplicableType(schTs, kwdT) {
  return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
}
function includesType(ts, t) {
  return ts.includes(t) || t === "integer" && ts.includes("number");
}
function narrowSchemaTypes(it, withTypes) {
  const ts = [];
  for (const t of it.dataTypes) {
    if (includesType(withTypes, t))
      ts.push(t);
    else if (withTypes.includes("integer") && t === "number")
      ts.push("integer");
  }
  it.dataTypes = ts;
}
function strictTypesError(it, msg) {
  const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
  msg += ` at "${schemaPath}" (strictTypes)`;
  (0, util_1$q.checkStrictMode)(it, msg, it.opts.strictTypes);
}
class KeywordCxt {
  constructor(it, def2, keyword2) {
    (0, keyword_1.validateKeywordUsage)(it, def2, keyword2);
    this.gen = it.gen;
    this.allErrors = it.allErrors;
    this.keyword = keyword2;
    this.data = it.data;
    this.schema = it.schema[keyword2];
    this.$data = def2.$data && it.opts.$data && this.schema && this.schema.$data;
    this.schemaValue = (0, util_1$q.schemaRefOrVal)(it, this.schema, keyword2, this.$data);
    this.schemaType = def2.schemaType;
    this.parentSchema = it.schema;
    this.params = {};
    this.it = it;
    this.def = def2;
    if (this.$data) {
      this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
    } else {
      this.schemaCode = this.schemaValue;
      if (!(0, keyword_1.validSchemaType)(this.schema, def2.schemaType, def2.allowUndefined)) {
        throw new Error(`${keyword2} value must be ${JSON.stringify(def2.schemaType)}`);
      }
    }
    if ("code" in def2 ? def2.trackErrors : def2.errors !== false) {
      this.errsCount = it.gen.const("_errs", names_1$6.default.errors);
    }
  }
  result(condition, successAction, failAction) {
    this.failResult((0, codegen_1$r.not)(condition), successAction, failAction);
  }
  failResult(condition, successAction, failAction) {
    this.gen.if(condition);
    if (failAction)
      failAction();
    else
      this.error();
    if (successAction) {
      this.gen.else();
      successAction();
      if (this.allErrors)
        this.gen.endIf();
    } else {
      if (this.allErrors)
        this.gen.endIf();
      else
        this.gen.else();
    }
  }
  pass(condition, failAction) {
    this.failResult((0, codegen_1$r.not)(condition), void 0, failAction);
  }
  fail(condition) {
    if (condition === void 0) {
      this.error();
      if (!this.allErrors)
        this.gen.if(false);
      return;
    }
    this.gen.if(condition);
    this.error();
    if (this.allErrors)
      this.gen.endIf();
    else
      this.gen.else();
  }
  fail$data(condition) {
    if (!this.$data)
      return this.fail(condition);
    const { schemaCode } = this;
    this.fail((0, codegen_1$r._)`${schemaCode} !== undefined && (${(0, codegen_1$r.or)(this.invalid$data(), condition)})`);
  }
  error(append, errorParams, errorPaths) {
    if (errorParams) {
      this.setParams(errorParams);
      this._error(append, errorPaths);
      this.setParams({});
      return;
    }
    this._error(append, errorPaths);
  }
  _error(append, errorPaths) {
    (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
  }
  $dataError() {
    (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
  }
  reset() {
    if (this.errsCount === void 0)
      throw new Error('add "trackErrors" to keyword definition');
    (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
  }
  ok(cond) {
    if (!this.allErrors)
      this.gen.if(cond);
  }
  setParams(obj, assign) {
    if (assign)
      Object.assign(this.params, obj);
    else
      this.params = obj;
  }
  block$data(valid, codeBlock, $dataValid = codegen_1$r.nil) {
    this.gen.block(() => {
      this.check$data(valid, $dataValid);
      codeBlock();
    });
  }
  check$data(valid = codegen_1$r.nil, $dataValid = codegen_1$r.nil) {
    if (!this.$data)
      return;
    const { gen, schemaCode, schemaType, def: def2 } = this;
    gen.if((0, codegen_1$r.or)((0, codegen_1$r._)`${schemaCode} === undefined`, $dataValid));
    if (valid !== codegen_1$r.nil)
      gen.assign(valid, true);
    if (schemaType.length || def2.validateSchema) {
      gen.elseIf(this.invalid$data());
      this.$dataError();
      if (valid !== codegen_1$r.nil)
        gen.assign(valid, false);
    }
    gen.else();
  }
  invalid$data() {
    const { gen, schemaCode, schemaType, def: def2, it } = this;
    return (0, codegen_1$r.or)(wrong$DataType(), invalid$DataSchema());
    function wrong$DataType() {
      if (schemaType.length) {
        if (!(schemaCode instanceof codegen_1$r.Name))
          throw new Error("ajv implementation error");
        const st = Array.isArray(schemaType) ? schemaType : [schemaType];
        return (0, codegen_1$r._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
      }
      return codegen_1$r.nil;
    }
    function invalid$DataSchema() {
      if (def2.validateSchema) {
        const validateSchemaRef = gen.scopeValue("validate$data", { ref: def2.validateSchema });
        return (0, codegen_1$r._)`!${validateSchemaRef}(${schemaCode})`;
      }
      return codegen_1$r.nil;
    }
  }
  subschema(appl, valid) {
    const subschema2 = (0, subschema_1.getSubschema)(this.it, appl);
    (0, subschema_1.extendSubschemaData)(subschema2, this.it, appl);
    (0, subschema_1.extendSubschemaMode)(subschema2, appl);
    const nextContext = { ...this.it, ...subschema2, items: void 0, props: void 0 };
    subschemaCode(nextContext, valid);
    return nextContext;
  }
  mergeEvaluated(schemaCxt, toName) {
    const { it, gen } = this;
    if (!it.opts.unevaluated)
      return;
    if (it.props !== true && schemaCxt.props !== void 0) {
      it.props = util_1$q.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
    }
    if (it.items !== true && schemaCxt.items !== void 0) {
      it.items = util_1$q.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
    }
  }
  mergeValidEvaluated(schemaCxt, valid) {
    const { it, gen } = this;
    if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
      gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1$r.Name));
      return true;
    }
  }
}
validate.KeywordCxt = KeywordCxt;
function keywordCode(it, keyword2, def2, ruleType) {
  const cxt = new KeywordCxt(it, def2, keyword2);
  if ("code" in def2) {
    def2.code(cxt, ruleType);
  } else if (cxt.$data && def2.validate) {
    (0, keyword_1.funcKeywordCode)(cxt, def2);
  } else if ("macro" in def2) {
    (0, keyword_1.macroKeywordCode)(cxt, def2);
  } else if (def2.compile || def2.validate) {
    (0, keyword_1.funcKeywordCode)(cxt, def2);
  }
}
const JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
const RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
function getData($data, { dataLevel, dataNames, dataPathArr }) {
  let jsonPointer;
  let data;
  if ($data === "")
    return names_1$6.default.rootData;
  if ($data[0] === "/") {
    if (!JSON_POINTER.test($data))
      throw new Error(`Invalid JSON-pointer: ${$data}`);
    jsonPointer = $data;
    data = names_1$6.default.rootData;
  } else {
    const matches = RELATIVE_JSON_POINTER.exec($data);
    if (!matches)
      throw new Error(`Invalid JSON-pointer: ${$data}`);
    const up = +matches[1];
    jsonPointer = matches[2];
    if (jsonPointer === "#") {
      if (up >= dataLevel)
        throw new Error(errorMsg("property/index", up));
      return dataPathArr[dataLevel - up];
    }
    if (up > dataLevel)
      throw new Error(errorMsg("data", up));
    data = dataNames[dataLevel - up];
    if (!jsonPointer)
      return data;
  }
  let expr = data;
  const segments = jsonPointer.split("/");
  for (const segment of segments) {
    if (segment) {
      data = (0, codegen_1$r._)`${data}${(0, codegen_1$r.getProperty)((0, util_1$q.unescapeJsonPointer)(segment))}`;
      expr = (0, codegen_1$r._)`${expr} && ${data}`;
    }
  }
  return expr;
  function errorMsg(pointerType, up) {
    return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
  }
}
validate.getData = getData;
var validation_error = {};
Object.defineProperty(validation_error, "__esModule", { value: true });
class ValidationError extends Error {
  constructor(errors2) {
    super("validation failed");
    this.errors = errors2;
    this.ajv = this.validation = true;
  }
}
validation_error.default = ValidationError;
var ref_error = {};
Object.defineProperty(ref_error, "__esModule", { value: true });
const resolve_1$1 = resolve$3;
class MissingRefError extends Error {
  constructor(resolver, baseId, ref2, msg) {
    super(msg || `can't resolve reference ${ref2} from id ${baseId}`);
    this.missingRef = (0, resolve_1$1.resolveUrl)(resolver, baseId, ref2);
    this.missingSchema = (0, resolve_1$1.normalizeId)((0, resolve_1$1.getFullPath)(resolver, this.missingRef));
  }
}
ref_error.default = MissingRefError;
var compile = {};
Object.defineProperty(compile, "__esModule", { value: true });
compile.resolveSchema = compile.getCompilingSchema = compile.resolveRef = compile.compileSchema = compile.SchemaEnv = void 0;
const codegen_1$q = codegen;
const validation_error_1 = validation_error;
const names_1$5 = names$1;
const resolve_1 = resolve$3;
const util_1$p = util;
const validate_1$1 = validate;
class SchemaEnv {
  constructor(env) {
    var _a;
    this.refs = {};
    this.dynamicAnchors = {};
    let schema;
    if (typeof env.schema == "object")
      schema = env.schema;
    this.schema = env.schema;
    this.schemaId = env.schemaId;
    this.root = env.root || this;
    this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
    this.schemaPath = env.schemaPath;
    this.localRefs = env.localRefs;
    this.meta = env.meta;
    this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
    this.refs = {};
  }
}
compile.SchemaEnv = SchemaEnv;
function compileSchema(sch) {
  const _sch = getCompilingSchema.call(this, sch);
  if (_sch)
    return _sch;
  const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
  const { es5, lines } = this.opts.code;
  const { ownProperties } = this.opts;
  const gen = new codegen_1$q.CodeGen(this.scope, { es5, lines, ownProperties });
  let _ValidationError;
  if (sch.$async) {
    _ValidationError = gen.scopeValue("Error", {
      ref: validation_error_1.default,
      code: (0, codegen_1$q._)`require("ajv/dist/runtime/validation_error").default`
    });
  }
  const validateName = gen.scopeName("validate");
  sch.validateName = validateName;
  const schemaCxt = {
    gen,
    allErrors: this.opts.allErrors,
    data: names_1$5.default.data,
    parentData: names_1$5.default.parentData,
    parentDataProperty: names_1$5.default.parentDataProperty,
    dataNames: [names_1$5.default.data],
    dataPathArr: [codegen_1$q.nil],
    // TODO can its length be used as dataLevel if nil is removed?
    dataLevel: 0,
    dataTypes: [],
    definedProperties: /* @__PURE__ */ new Set(),
    topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1$q.stringify)(sch.schema) } : { ref: sch.schema }),
    validateName,
    ValidationError: _ValidationError,
    schema: sch.schema,
    schemaEnv: sch,
    rootId,
    baseId: sch.baseId || rootId,
    schemaPath: codegen_1$q.nil,
    errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
    errorPath: (0, codegen_1$q._)`""`,
    opts: this.opts,
    self: this
  };
  let sourceCode;
  try {
    this._compilations.add(sch);
    (0, validate_1$1.validateFunctionCode)(schemaCxt);
    gen.optimize(this.opts.code.optimize);
    const validateCode = gen.toString();
    sourceCode = `${gen.scopeRefs(names_1$5.default.scope)}return ${validateCode}`;
    if (this.opts.code.process)
      sourceCode = this.opts.code.process(sourceCode, sch);
    const makeValidate = new Function(`${names_1$5.default.self}`, `${names_1$5.default.scope}`, sourceCode);
    const validate2 = makeValidate(this, this.scope.get());
    this.scope.value(validateName, { ref: validate2 });
    validate2.errors = null;
    validate2.schema = sch.schema;
    validate2.schemaEnv = sch;
    if (sch.$async)
      validate2.$async = true;
    if (this.opts.code.source === true) {
      validate2.source = { validateName, validateCode, scopeValues: gen._values };
    }
    if (this.opts.unevaluated) {
      const { props, items: items2 } = schemaCxt;
      validate2.evaluated = {
        props: props instanceof codegen_1$q.Name ? void 0 : props,
        items: items2 instanceof codegen_1$q.Name ? void 0 : items2,
        dynamicProps: props instanceof codegen_1$q.Name,
        dynamicItems: items2 instanceof codegen_1$q.Name
      };
      if (validate2.source)
        validate2.source.evaluated = (0, codegen_1$q.stringify)(validate2.evaluated);
    }
    sch.validate = validate2;
    return sch;
  } catch (e) {
    delete sch.validate;
    delete sch.validateName;
    if (sourceCode)
      this.logger.error("Error compiling schema, function code:", sourceCode);
    throw e;
  } finally {
    this._compilations.delete(sch);
  }
}
compile.compileSchema = compileSchema;
function resolveRef(root, baseId, ref2) {
  var _a;
  ref2 = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref2);
  const schOrFunc = root.refs[ref2];
  if (schOrFunc)
    return schOrFunc;
  let _sch = resolve$2.call(this, root, ref2);
  if (_sch === void 0) {
    const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref2];
    const { schemaId } = this.opts;
    if (schema)
      _sch = new SchemaEnv({ schema, schemaId, root, baseId });
  }
  if (_sch === void 0)
    return;
  return root.refs[ref2] = inlineOrCompile.call(this, _sch);
}
compile.resolveRef = resolveRef;
function inlineOrCompile(sch) {
  if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
    return sch.schema;
  return sch.validate ? sch : compileSchema.call(this, sch);
}
function getCompilingSchema(schEnv) {
  for (const sch of this._compilations) {
    if (sameSchemaEnv(sch, schEnv))
      return sch;
  }
}
compile.getCompilingSchema = getCompilingSchema;
function sameSchemaEnv(s1, s2) {
  return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
}
function resolve$2(root, ref2) {
  let sch;
  while (typeof (sch = this.refs[ref2]) == "string")
    ref2 = sch;
  return sch || this.schemas[ref2] || resolveSchema.call(this, root, ref2);
}
function resolveSchema(root, ref2) {
  const p = this.opts.uriResolver.parse(ref2);
  const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
  let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
  if (Object.keys(root.schema).length > 0 && refPath === baseId) {
    return getJsonPointer.call(this, p, root);
  }
  const id2 = (0, resolve_1.normalizeId)(refPath);
  const schOrRef = this.refs[id2] || this.schemas[id2];
  if (typeof schOrRef == "string") {
    const sch = resolveSchema.call(this, root, schOrRef);
    if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
      return;
    return getJsonPointer.call(this, p, sch);
  }
  if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
    return;
  if (!schOrRef.validate)
    compileSchema.call(this, schOrRef);
  if (id2 === (0, resolve_1.normalizeId)(ref2)) {
    const { schema } = schOrRef;
    const { schemaId } = this.opts;
    const schId = schema[schemaId];
    if (schId)
      baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
    return new SchemaEnv({ schema, schemaId, root, baseId });
  }
  return getJsonPointer.call(this, p, schOrRef);
}
compile.resolveSchema = resolveSchema;
const PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
  "properties",
  "patternProperties",
  "enum",
  "dependencies",
  "definitions"
]);
function getJsonPointer(parsedRef, { baseId, schema, root }) {
  var _a;
  if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
    return;
  for (const part of parsedRef.fragment.slice(1).split("/")) {
    if (typeof schema === "boolean")
      return;
    const partSchema = schema[(0, util_1$p.unescapeFragment)(part)];
    if (partSchema === void 0)
      return;
    schema = partSchema;
    const schId = typeof schema === "object" && schema[this.opts.schemaId];
    if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
      baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
    }
  }
  let env;
  if (typeof schema != "boolean" && schema.$ref && !(0, util_1$p.schemaHasRulesButRef)(schema, this.RULES)) {
    const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
    env = resolveSchema.call(this, root, $ref);
  }
  const { schemaId } = this.opts;
  env = env || new SchemaEnv({ schema, schemaId, root, baseId });
  if (env.schema !== env.root.schema)
    return env;
  return void 0;
}
const $id$8 = "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#";
const description = "Meta-schema for $data reference (JSON AnySchema extension proposal)";
const type$8 = "object";
const required$1 = [
  "$data"
];
const properties$9 = {
  $data: {
    type: "string",
    anyOf: [
      {
        format: "relative-json-pointer"
      },
      {
        format: "json-pointer"
      }
    ]
  }
};
const additionalProperties$1 = false;
const require$$9 = {
  $id: $id$8,
  description,
  type: type$8,
  required: required$1,
  properties: properties$9,
  additionalProperties: additionalProperties$1
};
var uri$1 = {};
var fastUri$1 = { exports: {} };
const isUUID$1 = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
const isIPv4$1 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
const isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
const isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
const isPathCharacter = RegExp.prototype.test.bind(/^[\da-z\-._~!$&'()*+,;=:@/]$/iu);
function stringArrayToHexStripped(input) {
  let acc = "";
  let code2 = 0;
  let i = 0;
  for (i = 0; i < input.length; i++) {
    code2 = input[i].charCodeAt(0);
    if (code2 === 48) {
      continue;
    }
    if (!(code2 >= 48 && code2 <= 57 || code2 >= 65 && code2 <= 70 || code2 >= 97 && code2 <= 102)) {
      return "";
    }
    acc += input[i];
    break;
  }
  for (i += 1; i < input.length; i++) {
    code2 = input[i].charCodeAt(0);
    if (!(code2 >= 48 && code2 <= 57 || code2 >= 65 && code2 <= 70 || code2 >= 97 && code2 <= 102)) {
      return "";
    }
    acc += input[i];
  }
  return acc;
}
const nonSimpleDomain$1 = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
function consumeIsZone(buffer) {
  buffer.length = 0;
  return true;
}
function consumeHextets(buffer, address, output) {
  if (buffer.length) {
    const hex = stringArrayToHexStripped(buffer);
    if (hex !== "") {
      address.push(hex);
    } else {
      output.error = true;
      return false;
    }
    buffer.length = 0;
  }
  return true;
}
function getIPV6(input) {
  let tokenCount = 0;
  const output = { error: false, address: "", zone: "" };
  const address = [];
  const buffer = [];
  let endipv6Encountered = false;
  let endIpv6 = false;
  let consume = consumeHextets;
  for (let i = 0; i < input.length; i++) {
    const cursor = input[i];
    if (cursor === "[" || cursor === "]") {
      continue;
    }
    if (cursor === ":") {
      if (endipv6Encountered === true) {
        endIpv6 = true;
      }
      if (!consume(buffer, address, output)) {
        break;
      }
      if (++tokenCount > 7) {
        output.error = true;
        break;
      }
      if (i > 0 && input[i - 1] === ":") {
        endipv6Encountered = true;
      }
      address.push(":");
      continue;
    } else if (cursor === "%") {
      if (!consume(buffer, address, output)) {
        break;
      }
      consume = consumeIsZone;
    } else {
      buffer.push(cursor);
      continue;
    }
  }
  if (buffer.length) {
    if (consume === consumeIsZone) {
      output.zone = buffer.join("");
    } else if (endIpv6) {
      address.push(buffer.join(""));
    } else {
      address.push(stringArrayToHexStripped(buffer));
    }
  }
  output.address = address.join("");
  return output;
}
function normalizeIPv6$1(host) {
  if (findToken(host, ":") < 2) {
    return { host, isIPV6: false };
  }
  const ipv6 = getIPV6(host);
  if (!ipv6.error) {
    let newHost = ipv6.address;
    let escapedHost = ipv6.address;
    if (ipv6.zone) {
      newHost += "%" + ipv6.zone;
      escapedHost += "%25" + ipv6.zone;
    }
    return { host: newHost, isIPV6: true, escapedHost };
  } else {
    return { host, isIPV6: false };
  }
}
function findToken(str, token) {
  let ind = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === token) ind++;
  }
  return ind;
}
function removeDotSegments$1(path) {
  let input = path;
  const output = [];
  let nextSlash = -1;
  let len = 0;
  while (len = input.length) {
    if (len === 1) {
      if (input === ".") {
        break;
      } else if (input === "/") {
        output.push("/");
        break;
      } else {
        output.push(input);
        break;
      }
    } else if (len === 2) {
      if (input[0] === ".") {
        if (input[1] === ".") {
          break;
        } else if (input[1] === "/") {
          input = input.slice(2);
          continue;
        }
      } else if (input[0] === "/") {
        if (input[1] === "." || input[1] === "/") {
          output.push("/");
          break;
        }
      }
    } else if (len === 3) {
      if (input === "/..") {
        if (output.length !== 0) {
          output.pop();
        }
        output.push("/");
        break;
      }
    }
    if (input[0] === ".") {
      if (input[1] === ".") {
        if (input[2] === "/") {
          input = input.slice(3);
          continue;
        }
      } else if (input[1] === "/") {
        input = input.slice(2);
        continue;
      }
    } else if (input[0] === "/") {
      if (input[1] === ".") {
        if (input[2] === "/") {
          input = input.slice(2);
          continue;
        } else if (input[2] === ".") {
          if (input[3] === "/") {
            input = input.slice(3);
            if (output.length !== 0) {
              output.pop();
            }
            continue;
          }
        }
      }
    }
    if ((nextSlash = input.indexOf("/", 1)) === -1) {
      output.push(input);
      break;
    } else {
      output.push(input.slice(0, nextSlash));
      input = input.slice(nextSlash);
    }
  }
  return output.join("");
}
const HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
const HOST_DELIM_RE = /[@/?#:]/g;
const HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
function reescapeHostDelimiters$1(host, isIP) {
  const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
  re.lastIndex = 0;
  return host.replace(re, (ch) => HOST_DELIMS[ch]);
}
function normalizePercentEncoding$1(input, decodeUnreserved = false) {
  if (input.indexOf("%") === -1) {
    return input;
  }
  let output = "";
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "%" && i + 2 < input.length) {
      const hex = input.slice(i + 1, i + 3);
      if (isHexPair(hex)) {
        const normalizedHex = hex.toUpperCase();
        const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
        if (decodeUnreserved && isUnreserved(decoded)) {
          output += decoded;
        } else {
          output += "%" + normalizedHex;
        }
        i += 2;
        continue;
      }
    }
    output += input[i];
  }
  return output;
}
function normalizePathEncoding$1(input) {
  let output = "";
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "%" && i + 2 < input.length) {
      const hex = input.slice(i + 1, i + 3);
      if (isHexPair(hex)) {
        const normalizedHex = hex.toUpperCase();
        const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
        if (decoded !== "." && isUnreserved(decoded)) {
          output += decoded;
        } else {
          output += "%" + normalizedHex;
        }
        i += 2;
        continue;
      }
    }
    if (isPathCharacter(input[i])) {
      output += input[i];
    } else {
      output += escape(input[i]);
    }
  }
  return output;
}
function escapePreservingEscapes$1(input) {
  let output = "";
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "%" && i + 2 < input.length) {
      const hex = input.slice(i + 1, i + 3);
      if (isHexPair(hex)) {
        output += "%" + hex.toUpperCase();
        i += 2;
        continue;
      }
    }
    output += escape(input[i]);
  }
  return output;
}
function recomposeAuthority$1(component) {
  const uriTokens = [];
  if (component.userinfo !== void 0) {
    uriTokens.push(component.userinfo);
    uriTokens.push("@");
  }
  if (component.host !== void 0) {
    let host = unescape(component.host);
    if (!isIPv4$1(host)) {
      const ipV6res = normalizeIPv6$1(host);
      if (ipV6res.isIPV6 === true) {
        host = `[${ipV6res.escapedHost}]`;
      } else {
        host = reescapeHostDelimiters$1(host, false);
      }
    }
    uriTokens.push(host);
  }
  if (typeof component.port === "number" || typeof component.port === "string") {
    uriTokens.push(":");
    uriTokens.push(String(component.port));
  }
  return uriTokens.length ? uriTokens.join("") : void 0;
}
var utils = {
  nonSimpleDomain: nonSimpleDomain$1,
  recomposeAuthority: recomposeAuthority$1,
  reescapeHostDelimiters: reescapeHostDelimiters$1,
  normalizePercentEncoding: normalizePercentEncoding$1,
  normalizePathEncoding: normalizePathEncoding$1,
  escapePreservingEscapes: escapePreservingEscapes$1,
  removeDotSegments: removeDotSegments$1,
  isIPv4: isIPv4$1,
  isUUID: isUUID$1,
  normalizeIPv6: normalizeIPv6$1
};
const { isUUID } = utils;
const URN_REG = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu;
function wsIsSecure(wsComponent) {
  if (wsComponent.secure === true) {
    return true;
  } else if (wsComponent.secure === false) {
    return false;
  } else if (wsComponent.scheme) {
    return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
  } else {
    return false;
  }
}
function httpParse(component) {
  if (!component.host) {
    component.error = component.error || "HTTP URIs must have a host.";
  }
  return component;
}
function httpSerialize(component) {
  const secure = String(component.scheme).toLowerCase() === "https";
  if (component.port === (secure ? 443 : 80) || component.port === "") {
    component.port = void 0;
  }
  if (!component.path) {
    component.path = "/";
  }
  return component;
}
function wsParse(wsComponent) {
  wsComponent.secure = wsIsSecure(wsComponent);
  wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
  wsComponent.path = void 0;
  wsComponent.query = void 0;
  return wsComponent;
}
function wsSerialize(wsComponent) {
  if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
    wsComponent.port = void 0;
  }
  if (typeof wsComponent.secure === "boolean") {
    wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
    wsComponent.secure = void 0;
  }
  if (wsComponent.resourceName) {
    const [path, query] = wsComponent.resourceName.split("?");
    wsComponent.path = path && path !== "/" ? path : void 0;
    wsComponent.query = query;
    wsComponent.resourceName = void 0;
  }
  wsComponent.fragment = void 0;
  return wsComponent;
}
function urnParse(urnComponent, options) {
  if (!urnComponent.path) {
    urnComponent.error = "URN can not be parsed";
    return urnComponent;
  }
  const matches = urnComponent.path.match(URN_REG);
  if (matches) {
    const scheme = options.scheme || urnComponent.scheme || "urn";
    urnComponent.nid = matches[1].toLowerCase();
    urnComponent.nss = matches[2];
    const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
    const schemeHandler = getSchemeHandler$1(urnScheme);
    urnComponent.path = void 0;
    if (schemeHandler) {
      urnComponent = schemeHandler.parse(urnComponent, options);
    }
  } else {
    urnComponent.error = urnComponent.error || "URN can not be parsed.";
  }
  return urnComponent;
}
function urnSerialize(urnComponent, options) {
  if (urnComponent.nid === void 0) {
    throw new Error("URN without nid cannot be serialized");
  }
  const scheme = options.scheme || urnComponent.scheme || "urn";
  const nid = urnComponent.nid.toLowerCase();
  const urnScheme = `${scheme}:${options.nid || nid}`;
  const schemeHandler = getSchemeHandler$1(urnScheme);
  if (schemeHandler) {
    urnComponent = schemeHandler.serialize(urnComponent, options);
  }
  const uriComponent = urnComponent;
  const nss = urnComponent.nss;
  uriComponent.path = `${nid || options.nid}:${nss}`;
  options.skipEscape = true;
  return uriComponent;
}
function urnuuidParse(urnComponent, options) {
  const uuidComponent = urnComponent;
  uuidComponent.uuid = uuidComponent.nss;
  uuidComponent.nss = void 0;
  if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
    uuidComponent.error = uuidComponent.error || "UUID is not valid.";
  }
  return uuidComponent;
}
function urnuuidSerialize(uuidComponent) {
  const urnComponent = uuidComponent;
  urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
  return urnComponent;
}
const http = (
  /** @type {SchemeHandler} */
  {
    scheme: "http",
    domainHost: true,
    parse: httpParse,
    serialize: httpSerialize
  }
);
const https = (
  /** @type {SchemeHandler} */
  {
    scheme: "https",
    domainHost: http.domainHost,
    parse: httpParse,
    serialize: httpSerialize
  }
);
const ws = (
  /** @type {SchemeHandler} */
  {
    scheme: "ws",
    domainHost: true,
    parse: wsParse,
    serialize: wsSerialize
  }
);
const wss = (
  /** @type {SchemeHandler} */
  {
    scheme: "wss",
    domainHost: ws.domainHost,
    parse: ws.parse,
    serialize: ws.serialize
  }
);
const urn = (
  /** @type {SchemeHandler} */
  {
    scheme: "urn",
    parse: urnParse,
    serialize: urnSerialize,
    skipNormalize: true
  }
);
const urnuuid = (
  /** @type {SchemeHandler} */
  {
    scheme: "urn:uuid",
    parse: urnuuidParse,
    serialize: urnuuidSerialize,
    skipNormalize: true
  }
);
const SCHEMES$1 = (
  /** @type {Record<SchemeName, SchemeHandler>} */
  {
    http,
    https,
    ws,
    wss,
    urn,
    "urn:uuid": urnuuid
  }
);
Object.setPrototypeOf(SCHEMES$1, null);
function getSchemeHandler$1(scheme) {
  return scheme && (SCHEMES$1[
    /** @type {SchemeName} */
    scheme
  ] || SCHEMES$1[
    /** @type {SchemeName} */
    scheme.toLowerCase()
  ]) || void 0;
}
var schemes = {
  SCHEMES: SCHEMES$1,
  getSchemeHandler: getSchemeHandler$1
};
const { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, escapePreservingEscapes, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = utils;
const { SCHEMES, getSchemeHandler } = schemes;
function normalize(uri2, options) {
  if (typeof uri2 === "string") {
    uri2 = /** @type {T} */
    normalizeString(uri2, options);
  } else if (typeof uri2 === "object") {
    uri2 = /** @type {T} */
    parse(serialize(uri2, options), options);
  }
  return uri2;
}
function resolve$1(baseURI, relativeURI, options) {
  const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
  const resolved = resolveComponent(parse(baseURI, schemelessOptions), parse(relativeURI, schemelessOptions), schemelessOptions, true);
  schemelessOptions.skipEscape = true;
  return serialize(resolved, schemelessOptions);
}
function resolveComponent(base, relative, options, skipNormalization) {
  const target = {};
  if (!skipNormalization) {
    base = parse(serialize(base, options), options);
    relative = parse(serialize(relative, options), options);
  }
  options = options || {};
  if (!options.tolerant && relative.scheme) {
    target.scheme = relative.scheme;
    target.userinfo = relative.userinfo;
    target.host = relative.host;
    target.port = relative.port;
    target.path = removeDotSegments(relative.path || "");
    target.query = relative.query;
  } else {
    if (relative.userinfo !== void 0 || relative.host !== void 0 || relative.port !== void 0) {
      target.userinfo = relative.userinfo;
      target.host = relative.host;
      target.port = relative.port;
      target.path = removeDotSegments(relative.path || "");
      target.query = relative.query;
    } else {
      if (!relative.path) {
        target.path = base.path;
        if (relative.query !== void 0) {
          target.query = relative.query;
        } else {
          target.query = base.query;
        }
      } else {
        if (relative.path[0] === "/") {
          target.path = removeDotSegments(relative.path);
        } else {
          if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
            target.path = "/" + relative.path;
          } else if (!base.path) {
            target.path = relative.path;
          } else {
            target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative.path;
          }
          target.path = removeDotSegments(target.path);
        }
        target.query = relative.query;
      }
      target.userinfo = base.userinfo;
      target.host = base.host;
      target.port = base.port;
    }
    target.scheme = base.scheme;
  }
  target.fragment = relative.fragment;
  return target;
}
function equal$2(uriA, uriB, options) {
  const normalizedA = normalizeComparableURI(uriA, options);
  const normalizedB = normalizeComparableURI(uriB, options);
  return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA.toLowerCase() === normalizedB.toLowerCase();
}
function serialize(cmpts, opts) {
  const component = {
    host: cmpts.host,
    scheme: cmpts.scheme,
    userinfo: cmpts.userinfo,
    port: cmpts.port,
    path: cmpts.path,
    query: cmpts.query,
    nid: cmpts.nid,
    nss: cmpts.nss,
    uuid: cmpts.uuid,
    fragment: cmpts.fragment,
    reference: cmpts.reference,
    resourceName: cmpts.resourceName,
    secure: cmpts.secure,
    error: ""
  };
  const options = Object.assign({}, opts);
  const uriTokens = [];
  const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
  if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
  if (component.path !== void 0) {
    if (!options.skipEscape) {
      component.path = escapePreservingEscapes(component.path);
      if (component.scheme !== void 0) {
        component.path = component.path.split("%3A").join(":");
      }
    } else {
      component.path = normalizePercentEncoding(component.path);
    }
  }
  if (options.reference !== "suffix" && component.scheme) {
    uriTokens.push(component.scheme, ":");
  }
  const authority = recomposeAuthority(component);
  if (authority !== void 0) {
    if (options.reference !== "suffix") {
      uriTokens.push("//");
    }
    uriTokens.push(authority);
    if (component.path && component.path[0] !== "/") {
      uriTokens.push("/");
    }
  }
  if (component.path !== void 0) {
    let s = component.path;
    if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
      s = removeDotSegments(s);
    }
    if (authority === void 0 && s[0] === "/" && s[1] === "/") {
      s = "/%2F" + s.slice(2);
    }
    uriTokens.push(s);
  }
  if (component.query !== void 0) {
    uriTokens.push("?", component.query);
  }
  if (component.fragment !== void 0) {
    uriTokens.push("#", component.fragment);
  }
  return uriTokens.join("");
}
const URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
const AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
function getParseError(parsed, matches) {
  if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") {
    return 'URI path must start with "/" when authority is present.';
  }
  if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
    return "URI port is malformed.";
  }
  return void 0;
}
function parseWithStatus(uri2, opts) {
  const options = Object.assign({}, opts);
  const parsed = {
    scheme: void 0,
    userinfo: void 0,
    host: "",
    port: void 0,
    path: "",
    query: void 0,
    fragment: void 0
  };
  let malformedAuthorityOrPort = false;
  let isIP = false;
  if (options.reference === "suffix") {
    if (options.scheme) {
      uri2 = options.scheme + ":" + uri2;
    } else {
      uri2 = "//" + uri2;
    }
  }
  const authorityMatch = uri2.match(AUTHORITY_PREFIX);
  if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
    parsed.error = "URI authority must not contain a literal backslash.";
    malformedAuthorityOrPort = true;
  }
  const matches = uri2.match(URI_PARSE);
  if (matches) {
    parsed.scheme = matches[1];
    parsed.userinfo = matches[3];
    parsed.host = matches[4];
    parsed.port = parseInt(matches[5], 10);
    parsed.path = matches[6] || "";
    parsed.query = matches[7];
    parsed.fragment = matches[8];
    if (isNaN(parsed.port)) {
      parsed.port = matches[5];
    }
    const parseError = getParseError(parsed, matches);
    if (parseError !== void 0) {
      parsed.error = parsed.error || parseError;
      malformedAuthorityOrPort = true;
    }
    if (parsed.host) {
      const ipv4result = isIPv4(parsed.host);
      if (ipv4result === false) {
        const ipv6result = normalizeIPv6(parsed.host);
        parsed.host = ipv6result.host.toLowerCase();
        isIP = ipv6result.isIPV6;
      } else {
        isIP = true;
      }
    }
    if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
      parsed.reference = "same-document";
    } else if (parsed.scheme === void 0) {
      parsed.reference = "relative";
    } else if (parsed.fragment === void 0) {
      parsed.reference = "absolute";
    } else {
      parsed.reference = "uri";
    }
    if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
      parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
    }
    const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
    if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport)) {
      if (parsed.host && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
        try {
          parsed.host = new URL("http://" + parsed.host).hostname;
        } catch (e) {
          parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
        }
      }
    }
    if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
      if (uri2.indexOf("%") !== -1) {
        if (parsed.scheme !== void 0) {
          parsed.scheme = unescape(parsed.scheme);
        }
        if (parsed.host !== void 0) {
          parsed.host = reescapeHostDelimiters(unescape(parsed.host), isIP);
        }
      }
      if (parsed.path) {
        parsed.path = normalizePathEncoding(parsed.path);
      }
      if (parsed.fragment) {
        try {
          parsed.fragment = encodeURI(decodeURIComponent(parsed.fragment));
        } catch {
          parsed.error = parsed.error || "URI malformed";
        }
      }
    }
    if (schemeHandler && schemeHandler.parse) {
      schemeHandler.parse(parsed, options);
    }
  } else {
    parsed.error = parsed.error || "URI can not be parsed.";
  }
  return { parsed, malformedAuthorityOrPort };
}
function parse(uri2, opts) {
  return parseWithStatus(uri2, opts).parsed;
}
function normalizeString(uri2, opts) {
  return normalizeStringWithStatus(uri2, opts).normalized;
}
function normalizeStringWithStatus(uri2, opts) {
  const { parsed, malformedAuthorityOrPort } = parseWithStatus(uri2, opts);
  return {
    normalized: malformedAuthorityOrPort ? uri2 : serialize(parsed, opts),
    malformedAuthorityOrPort
  };
}
function normalizeComparableURI(uri2, opts) {
  if (typeof uri2 === "string") {
    const { normalized, malformedAuthorityOrPort } = normalizeStringWithStatus(uri2, opts);
    return malformedAuthorityOrPort ? void 0 : normalized;
  }
  if (typeof uri2 === "object") {
    return serialize(uri2, opts);
  }
}
const fastUri = {
  SCHEMES,
  normalize,
  resolve: resolve$1,
  resolveComponent,
  equal: equal$2,
  serialize,
  parse
};
fastUri$1.exports = fastUri;
fastUri$1.exports.default = fastUri;
fastUri$1.exports.fastUri = fastUri;
var fastUriExports = fastUri$1.exports;
Object.defineProperty(uri$1, "__esModule", { value: true });
const uri = fastUriExports;
uri.code = 'require("ajv/dist/runtime/uri").default';
uri$1.default = uri;
(function(exports$1) {
  Object.defineProperty(exports$1, "__esModule", { value: true });
  exports$1.CodeGen = exports$1.Name = exports$1.nil = exports$1.stringify = exports$1.str = exports$1._ = exports$1.KeywordCxt = void 0;
  var validate_12 = validate;
  Object.defineProperty(exports$1, "KeywordCxt", { enumerable: true, get: function() {
    return validate_12.KeywordCxt;
  } });
  var codegen_12 = codegen;
  Object.defineProperty(exports$1, "_", { enumerable: true, get: function() {
    return codegen_12._;
  } });
  Object.defineProperty(exports$1, "str", { enumerable: true, get: function() {
    return codegen_12.str;
  } });
  Object.defineProperty(exports$1, "stringify", { enumerable: true, get: function() {
    return codegen_12.stringify;
  } });
  Object.defineProperty(exports$1, "nil", { enumerable: true, get: function() {
    return codegen_12.nil;
  } });
  Object.defineProperty(exports$1, "Name", { enumerable: true, get: function() {
    return codegen_12.Name;
  } });
  Object.defineProperty(exports$1, "CodeGen", { enumerable: true, get: function() {
    return codegen_12.CodeGen;
  } });
  const validation_error_12 = validation_error;
  const ref_error_12 = ref_error;
  const rules_12 = rules;
  const compile_12 = compile;
  const codegen_2 = codegen;
  const resolve_12 = resolve$3;
  const dataType_12 = dataType;
  const util_12 = util;
  const $dataRefSchema = require$$9;
  const uri_1 = uri$1;
  const defaultRegExp = (str, flags) => new RegExp(str, flags);
  defaultRegExp.code = "new RegExp";
  const META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
  const EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
    "validate",
    "serialize",
    "parse",
    "wrapper",
    "root",
    "schema",
    "keyword",
    "pattern",
    "formats",
    "validate$data",
    "func",
    "obj",
    "Error"
  ]);
  const removedOptions = {
    errorDataPath: "",
    format: "`validateFormats: false` can be used instead.",
    nullable: '"nullable" keyword is supported by default.',
    jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
    extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
    missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
    processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
    sourceCode: "Use option `code: {source: true}`",
    strictDefaults: "It is default now, see option `strict`.",
    strictKeywords: "It is default now, see option `strict`.",
    uniqueItems: '"uniqueItems" keyword is always validated.',
    unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
    cache: "Map is used as cache, schema object as key.",
    serialize: "Map is used as cache, schema object as key.",
    ajvErrors: "It is default now."
  };
  const deprecatedOptions = {
    ignoreKeywordsWithRef: "",
    jsPropertySyntax: "",
    unicode: '"minLength"/"maxLength" account for unicode characters by default.'
  };
  const MAX_EXPRESSION = 200;
  function requiredOptions(o) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
    const s = o.strict;
    const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
    const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
    const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
    const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
    return {
      strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
      strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
      strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
      strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
      strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
      code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
      loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
      loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
      meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
      messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
      inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
      schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
      addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
      validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
      validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
      unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
      int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
      uriResolver
    };
  }
  class Ajv {
    constructor(opts = {}) {
      this.schemas = {};
      this.refs = {};
      this.formats = /* @__PURE__ */ Object.create(null);
      this._compilations = /* @__PURE__ */ new Set();
      this._loading = {};
      this._cache = /* @__PURE__ */ new Map();
      opts = this.opts = { ...opts, ...requiredOptions(opts) };
      const { es5, lines } = this.opts.code;
      this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
      this.logger = getLogger(opts.logger);
      const formatOpt = opts.validateFormats;
      opts.validateFormats = false;
      this.RULES = (0, rules_12.getRules)();
      checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
      checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
      this._metaOpts = getMetaSchemaOptions.call(this);
      if (opts.formats)
        addInitialFormats.call(this);
      this._addVocabularies();
      this._addDefaultMetaSchema();
      if (opts.keywords)
        addInitialKeywords.call(this, opts.keywords);
      if (typeof opts.meta == "object")
        this.addMetaSchema(opts.meta);
      addInitialSchemas.call(this);
      opts.validateFormats = formatOpt;
    }
    _addVocabularies() {
      this.addKeyword("$async");
    }
    _addDefaultMetaSchema() {
      const { $data, meta, schemaId } = this.opts;
      let _dataRefSchema = $dataRefSchema;
      if (schemaId === "id") {
        _dataRefSchema = { ...$dataRefSchema };
        _dataRefSchema.id = _dataRefSchema.$id;
        delete _dataRefSchema.$id;
      }
      if (meta && $data)
        this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
    }
    defaultMeta() {
      const { meta, schemaId } = this.opts;
      return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
    }
    validate(schemaKeyRef, data) {
      let v;
      if (typeof schemaKeyRef == "string") {
        v = this.getSchema(schemaKeyRef);
        if (!v)
          throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
      } else {
        v = this.compile(schemaKeyRef);
      }
      const valid = v(data);
      if (!("$async" in v))
        this.errors = v.errors;
      return valid;
    }
    compile(schema, _meta) {
      const sch = this._addSchema(schema, _meta);
      return sch.validate || this._compileSchemaEnv(sch);
    }
    compileAsync(schema, meta) {
      if (typeof this.opts.loadSchema != "function") {
        throw new Error("options.loadSchema should be a function");
      }
      const { loadSchema } = this.opts;
      return runCompileAsync.call(this, schema, meta);
      async function runCompileAsync(_schema, _meta) {
        await loadMetaSchema.call(this, _schema.$schema);
        const sch = this._addSchema(_schema, _meta);
        return sch.validate || _compileAsync.call(this, sch);
      }
      async function loadMetaSchema($ref) {
        if ($ref && !this.getSchema($ref)) {
          await runCompileAsync.call(this, { $ref }, true);
        }
      }
      async function _compileAsync(sch) {
        try {
          return this._compileSchemaEnv(sch);
        } catch (e) {
          if (!(e instanceof ref_error_12.default))
            throw e;
          checkLoaded.call(this, e);
          await loadMissingSchema.call(this, e.missingSchema);
          return _compileAsync.call(this, sch);
        }
      }
      function checkLoaded({ missingSchema: ref2, missingRef }) {
        if (this.refs[ref2]) {
          throw new Error(`AnySchema ${ref2} is loaded but ${missingRef} cannot be resolved`);
        }
      }
      async function loadMissingSchema(ref2) {
        const _schema = await _loadSchema.call(this, ref2);
        if (!this.refs[ref2])
          await loadMetaSchema.call(this, _schema.$schema);
        if (!this.refs[ref2])
          this.addSchema(_schema, ref2, meta);
      }
      async function _loadSchema(ref2) {
        const p = this._loading[ref2];
        if (p)
          return p;
        try {
          return await (this._loading[ref2] = loadSchema(ref2));
        } finally {
          delete this._loading[ref2];
        }
      }
    }
    // Adds schema to the instance
    addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
      if (Array.isArray(schema)) {
        for (const sch of schema)
          this.addSchema(sch, void 0, _meta, _validateSchema);
        return this;
      }
      let id2;
      if (typeof schema === "object") {
        const { schemaId } = this.opts;
        id2 = schema[schemaId];
        if (id2 !== void 0 && typeof id2 != "string") {
          throw new Error(`schema ${schemaId} must be string`);
        }
      }
      key = (0, resolve_12.normalizeId)(key || id2);
      this._checkUnique(key);
      this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
      return this;
    }
    // Add schema that will be used to validate other schemas
    // options in META_IGNORE_OPTIONS are alway set to false
    addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
      this.addSchema(schema, key, true, _validateSchema);
      return this;
    }
    //  Validate schema against its meta-schema
    validateSchema(schema, throwOrLogError) {
      if (typeof schema == "boolean")
        return true;
      let $schema2;
      $schema2 = schema.$schema;
      if ($schema2 !== void 0 && typeof $schema2 != "string") {
        throw new Error("$schema must be a string");
      }
      $schema2 = $schema2 || this.opts.defaultMeta || this.defaultMeta();
      if (!$schema2) {
        this.logger.warn("meta-schema not available");
        this.errors = null;
        return true;
      }
      const valid = this.validate($schema2, schema);
      if (!valid && throwOrLogError) {
        const message = "schema is invalid: " + this.errorsText();
        if (this.opts.validateSchema === "log")
          this.logger.error(message);
        else
          throw new Error(message);
      }
      return valid;
    }
    // Get compiled schema by `key` or `ref`.
    // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
    getSchema(keyRef) {
      let sch;
      while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
        keyRef = sch;
      if (sch === void 0) {
        const { schemaId } = this.opts;
        const root = new compile_12.SchemaEnv({ schema: {}, schemaId });
        sch = compile_12.resolveSchema.call(this, root, keyRef);
        if (!sch)
          return;
        this.refs[keyRef] = sch;
      }
      return sch.validate || this._compileSchemaEnv(sch);
    }
    // Remove cached schema(s).
    // If no parameter is passed all schemas but meta-schemas are removed.
    // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
    // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
    removeSchema(schemaKeyRef) {
      if (schemaKeyRef instanceof RegExp) {
        this._removeAllSchemas(this.schemas, schemaKeyRef);
        this._removeAllSchemas(this.refs, schemaKeyRef);
        return this;
      }
      switch (typeof schemaKeyRef) {
        case "undefined":
          this._removeAllSchemas(this.schemas);
          this._removeAllSchemas(this.refs);
          this._cache.clear();
          return this;
        case "string": {
          const sch = getSchEnv.call(this, schemaKeyRef);
          if (typeof sch == "object")
            this._cache.delete(sch.schema);
          delete this.schemas[schemaKeyRef];
          delete this.refs[schemaKeyRef];
          return this;
        }
        case "object": {
          const cacheKey = schemaKeyRef;
          this._cache.delete(cacheKey);
          let id2 = schemaKeyRef[this.opts.schemaId];
          if (id2) {
            id2 = (0, resolve_12.normalizeId)(id2);
            delete this.schemas[id2];
            delete this.refs[id2];
          }
          return this;
        }
        default:
          throw new Error("ajv.removeSchema: invalid parameter");
      }
    }
    // add "vocabulary" - a collection of keywords
    addVocabulary(definitions) {
      for (const def2 of definitions)
        this.addKeyword(def2);
      return this;
    }
    addKeyword(kwdOrDef, def2) {
      let keyword2;
      if (typeof kwdOrDef == "string") {
        keyword2 = kwdOrDef;
        if (typeof def2 == "object") {
          this.logger.warn("these parameters are deprecated, see docs for addKeyword");
          def2.keyword = keyword2;
        }
      } else if (typeof kwdOrDef == "object" && def2 === void 0) {
        def2 = kwdOrDef;
        keyword2 = def2.keyword;
        if (Array.isArray(keyword2) && !keyword2.length) {
          throw new Error("addKeywords: keyword must be string or non-empty array");
        }
      } else {
        throw new Error("invalid addKeywords parameters");
      }
      checkKeyword.call(this, keyword2, def2);
      if (!def2) {
        (0, util_12.eachItem)(keyword2, (kwd) => addRule.call(this, kwd));
        return this;
      }
      keywordMetaschema.call(this, def2);
      const definition = {
        ...def2,
        type: (0, dataType_12.getJSONTypes)(def2.type),
        schemaType: (0, dataType_12.getJSONTypes)(def2.schemaType)
      };
      (0, util_12.eachItem)(keyword2, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
      return this;
    }
    getKeyword(keyword2) {
      const rule = this.RULES.all[keyword2];
      return typeof rule == "object" ? rule.definition : !!rule;
    }
    // Remove keyword
    removeKeyword(keyword2) {
      const { RULES } = this;
      delete RULES.keywords[keyword2];
      delete RULES.all[keyword2];
      for (const group of RULES.rules) {
        const i = group.rules.findIndex((rule) => rule.keyword === keyword2);
        if (i >= 0)
          group.rules.splice(i, 1);
      }
      return this;
    }
    // Add format
    addFormat(name, format2) {
      if (typeof format2 == "string")
        format2 = new RegExp(format2);
      this.formats[name] = format2;
      return this;
    }
    errorsText(errors2 = this.errors, { separator = ", ", dataVar = "data" } = {}) {
      if (!errors2 || errors2.length === 0)
        return "No errors";
      return errors2.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
    }
    $dataMetaSchema(metaSchema2, keywordsJsonPointers) {
      const rules2 = this.RULES.all;
      metaSchema2 = JSON.parse(JSON.stringify(metaSchema2));
      for (const jsonPointer of keywordsJsonPointers) {
        const segments = jsonPointer.split("/").slice(1);
        let keywords = metaSchema2;
        for (const seg of segments)
          keywords = keywords[seg];
        for (const key in rules2) {
          const rule = rules2[key];
          if (typeof rule != "object")
            continue;
          const { $data } = rule.definition;
          const schema = keywords[key];
          if ($data && schema)
            keywords[key] = schemaOrData(schema);
        }
      }
      return metaSchema2;
    }
    _removeAllSchemas(schemas, regex) {
      for (const keyRef in schemas) {
        const sch = schemas[keyRef];
        if (!regex || regex.test(keyRef)) {
          if (typeof sch == "string") {
            delete schemas[keyRef];
          } else if (sch && !sch.meta) {
            this._cache.delete(sch.schema);
            delete schemas[keyRef];
          }
        }
      }
    }
    _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
      let id2;
      const { schemaId } = this.opts;
      if (typeof schema == "object") {
        id2 = schema[schemaId];
      } else {
        if (this.opts.jtd)
          throw new Error("schema must be object");
        else if (typeof schema != "boolean")
          throw new Error("schema must be object or boolean");
      }
      let sch = this._cache.get(schema);
      if (sch !== void 0)
        return sch;
      baseId = (0, resolve_12.normalizeId)(id2 || baseId);
      const localRefs = resolve_12.getSchemaRefs.call(this, schema, baseId);
      sch = new compile_12.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
      this._cache.set(sch.schema, sch);
      if (addSchema && !baseId.startsWith("#")) {
        if (baseId)
          this._checkUnique(baseId);
        this.refs[baseId] = sch;
      }
      if (validateSchema)
        this.validateSchema(schema, true);
      return sch;
    }
    _checkUnique(id2) {
      if (this.schemas[id2] || this.refs[id2]) {
        throw new Error(`schema with key or id "${id2}" already exists`);
      }
    }
    _compileSchemaEnv(sch) {
      if (sch.meta)
        this._compileMetaSchema(sch);
      else
        compile_12.compileSchema.call(this, sch);
      if (!sch.validate)
        throw new Error("ajv implementation error");
      return sch.validate;
    }
    _compileMetaSchema(sch) {
      const currentOpts = this.opts;
      this.opts = this._metaOpts;
      try {
        compile_12.compileSchema.call(this, sch);
      } finally {
        this.opts = currentOpts;
      }
    }
  }
  Ajv.ValidationError = validation_error_12.default;
  Ajv.MissingRefError = ref_error_12.default;
  exports$1.default = Ajv;
  function checkOptions(checkOpts, options, msg, log = "error") {
    for (const key in checkOpts) {
      const opt = key;
      if (opt in options)
        this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
    }
  }
  function getSchEnv(keyRef) {
    keyRef = (0, resolve_12.normalizeId)(keyRef);
    return this.schemas[keyRef] || this.refs[keyRef];
  }
  function addInitialSchemas() {
    const optsSchemas = this.opts.schemas;
    if (!optsSchemas)
      return;
    if (Array.isArray(optsSchemas))
      this.addSchema(optsSchemas);
    else
      for (const key in optsSchemas)
        this.addSchema(optsSchemas[key], key);
  }
  function addInitialFormats() {
    for (const name in this.opts.formats) {
      const format2 = this.opts.formats[name];
      if (format2)
        this.addFormat(name, format2);
    }
  }
  function addInitialKeywords(defs) {
    if (Array.isArray(defs)) {
      this.addVocabulary(defs);
      return;
    }
    this.logger.warn("keywords option as map is deprecated, pass array");
    for (const keyword2 in defs) {
      const def2 = defs[keyword2];
      if (!def2.keyword)
        def2.keyword = keyword2;
      this.addKeyword(def2);
    }
  }
  function getMetaSchemaOptions() {
    const metaOpts = { ...this.opts };
    for (const opt of META_IGNORE_OPTIONS)
      delete metaOpts[opt];
    return metaOpts;
  }
  const noLogs = { log() {
  }, warn() {
  }, error() {
  } };
  function getLogger(logger) {
    if (logger === false)
      return noLogs;
    if (logger === void 0)
      return console;
    if (logger.log && logger.warn && logger.error)
      return logger;
    throw new Error("logger must implement log, warn and error methods");
  }
  const KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
  function checkKeyword(keyword2, def2) {
    const { RULES } = this;
    (0, util_12.eachItem)(keyword2, (kwd) => {
      if (RULES.keywords[kwd])
        throw new Error(`Keyword ${kwd} is already defined`);
      if (!KEYWORD_NAME.test(kwd))
        throw new Error(`Keyword ${kwd} has invalid name`);
    });
    if (!def2)
      return;
    if (def2.$data && !("code" in def2 || "validate" in def2)) {
      throw new Error('$data keyword must have "code" or "validate" function');
    }
  }
  function addRule(keyword2, definition, dataType2) {
    var _a;
    const post = definition === null || definition === void 0 ? void 0 : definition.post;
    if (dataType2 && post)
      throw new Error('keyword with "post" flag cannot have "type"');
    const { RULES } = this;
    let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType2);
    if (!ruleGroup) {
      ruleGroup = { type: dataType2, rules: [] };
      RULES.rules.push(ruleGroup);
    }
    RULES.keywords[keyword2] = true;
    if (!definition)
      return;
    const rule = {
      keyword: keyword2,
      definition: {
        ...definition,
        type: (0, dataType_12.getJSONTypes)(definition.type),
        schemaType: (0, dataType_12.getJSONTypes)(definition.schemaType)
      }
    };
    if (definition.before)
      addBeforeRule.call(this, ruleGroup, rule, definition.before);
    else
      ruleGroup.rules.push(rule);
    RULES.all[keyword2] = rule;
    (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
  }
  function addBeforeRule(ruleGroup, rule, before) {
    const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
    if (i >= 0) {
      ruleGroup.rules.splice(i, 0, rule);
    } else {
      ruleGroup.rules.push(rule);
      this.logger.warn(`rule ${before} is not defined`);
    }
  }
  function keywordMetaschema(def2) {
    let { metaSchema: metaSchema2 } = def2;
    if (metaSchema2 === void 0)
      return;
    if (def2.$data && this.opts.$data)
      metaSchema2 = schemaOrData(metaSchema2);
    def2.validateSchema = this.compile(metaSchema2, true);
  }
  const $dataRef = {
    $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
  };
  function schemaOrData(schema) {
    return { anyOf: [schema, $dataRef] };
  }
})(core$4);
var draft2020 = {};
var core$3 = {};
var id = {};
Object.defineProperty(id, "__esModule", { value: true });
const def$B = {
  keyword: "id",
  code() {
    throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
  }
};
id.default = def$B;
var ref = {};
Object.defineProperty(ref, "__esModule", { value: true });
ref.callRef = ref.getValidate = void 0;
const ref_error_1$1 = ref_error;
const code_1$8 = code;
const codegen_1$p = codegen;
const names_1$4 = names$1;
const compile_1$2 = compile;
const util_1$o = util;
const def$A = {
  keyword: "$ref",
  schemaType: "string",
  code(cxt) {
    const { gen, schema: $ref, it } = cxt;
    const { baseId, schemaEnv: env, validateName, opts, self: self2 } = it;
    const { root } = env;
    if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
      return callRootRef();
    const schOrEnv = compile_1$2.resolveRef.call(self2, root, baseId, $ref);
    if (schOrEnv === void 0)
      throw new ref_error_1$1.default(it.opts.uriResolver, baseId, $ref);
    if (schOrEnv instanceof compile_1$2.SchemaEnv)
      return callValidate(schOrEnv);
    return inlineRefSchema(schOrEnv);
    function callRootRef() {
      if (env === root)
        return callRef(cxt, validateName, env, env.$async);
      const rootName = gen.scopeValue("root", { ref: root });
      return callRef(cxt, (0, codegen_1$p._)`${rootName}.validate`, root, root.$async);
    }
    function callValidate(sch) {
      const v = getValidate(cxt, sch);
      callRef(cxt, v, sch, sch.$async);
    }
    function inlineRefSchema(sch) {
      const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1$p.stringify)(sch) } : { ref: sch });
      const valid = gen.name("valid");
      const schCxt = cxt.subschema({
        schema: sch,
        dataTypes: [],
        schemaPath: codegen_1$p.nil,
        topSchemaRef: schName,
        errSchemaPath: $ref
      }, valid);
      cxt.mergeEvaluated(schCxt);
      cxt.ok(valid);
    }
  }
};
function getValidate(cxt, sch) {
  const { gen } = cxt;
  return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1$p._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
}
ref.getValidate = getValidate;
function callRef(cxt, v, sch, $async) {
  const { gen, it } = cxt;
  const { allErrors, schemaEnv: env, opts } = it;
  const passCxt = opts.passContext ? names_1$4.default.this : codegen_1$p.nil;
  if ($async)
    callAsyncRef();
  else
    callSyncRef();
  function callAsyncRef() {
    if (!env.$async)
      throw new Error("async schema referenced by sync schema");
    const valid = gen.let("valid");
    gen.try(() => {
      gen.code((0, codegen_1$p._)`await ${(0, code_1$8.callValidateCode)(cxt, v, passCxt)}`);
      addEvaluatedFrom(v);
      if (!allErrors)
        gen.assign(valid, true);
    }, (e) => {
      gen.if((0, codegen_1$p._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
      addErrorsFrom(e);
      if (!allErrors)
        gen.assign(valid, false);
    });
    cxt.ok(valid);
  }
  function callSyncRef() {
    cxt.result((0, code_1$8.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
  }
  function addErrorsFrom(source) {
    const errs = (0, codegen_1$p._)`${source}.errors`;
    gen.assign(names_1$4.default.vErrors, (0, codegen_1$p._)`${names_1$4.default.vErrors} === null ? ${errs} : ${names_1$4.default.vErrors}.concat(${errs})`);
    gen.assign(names_1$4.default.errors, (0, codegen_1$p._)`${names_1$4.default.vErrors}.length`);
  }
  function addEvaluatedFrom(source) {
    var _a;
    if (!it.opts.unevaluated)
      return;
    const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
    if (it.props !== true) {
      if (schEvaluated && !schEvaluated.dynamicProps) {
        if (schEvaluated.props !== void 0) {
          it.props = util_1$o.mergeEvaluated.props(gen, schEvaluated.props, it.props);
        }
      } else {
        const props = gen.var("props", (0, codegen_1$p._)`${source}.evaluated.props`);
        it.props = util_1$o.mergeEvaluated.props(gen, props, it.props, codegen_1$p.Name);
      }
    }
    if (it.items !== true) {
      if (schEvaluated && !schEvaluated.dynamicItems) {
        if (schEvaluated.items !== void 0) {
          it.items = util_1$o.mergeEvaluated.items(gen, schEvaluated.items, it.items);
        }
      } else {
        const items2 = gen.var("items", (0, codegen_1$p._)`${source}.evaluated.items`);
        it.items = util_1$o.mergeEvaluated.items(gen, items2, it.items, codegen_1$p.Name);
      }
    }
  }
}
ref.callRef = callRef;
ref.default = def$A;
Object.defineProperty(core$3, "__esModule", { value: true });
const id_1 = id;
const ref_1$2 = ref;
const core$2 = [
  "$schema",
  "$id",
  "$defs",
  "$vocabulary",
  { keyword: "$comment" },
  "definitions",
  id_1.default,
  ref_1$2.default
];
core$3.default = core$2;
var validation$2 = {};
var limitNumber = {};
Object.defineProperty(limitNumber, "__esModule", { value: true });
const codegen_1$o = codegen;
const ops = codegen_1$o.operators;
const KWDs = {
  maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
  minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
  exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
  exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
};
const error$k = {
  message: ({ keyword: keyword2, schemaCode }) => (0, codegen_1$o.str)`must be ${KWDs[keyword2].okStr} ${schemaCode}`,
  params: ({ keyword: keyword2, schemaCode }) => (0, codegen_1$o._)`{comparison: ${KWDs[keyword2].okStr}, limit: ${schemaCode}}`
};
const def$z = {
  keyword: Object.keys(KWDs),
  type: "number",
  schemaType: "number",
  $data: true,
  error: error$k,
  code(cxt) {
    const { keyword: keyword2, data, schemaCode } = cxt;
    cxt.fail$data((0, codegen_1$o._)`${data} ${KWDs[keyword2].fail} ${schemaCode} || isNaN(${data})`);
  }
};
limitNumber.default = def$z;
var multipleOf = {};
Object.defineProperty(multipleOf, "__esModule", { value: true });
const codegen_1$n = codegen;
const error$j = {
  message: ({ schemaCode }) => (0, codegen_1$n.str)`must be multiple of ${schemaCode}`,
  params: ({ schemaCode }) => (0, codegen_1$n._)`{multipleOf: ${schemaCode}}`
};
const def$y = {
  keyword: "multipleOf",
  type: "number",
  schemaType: "number",
  $data: true,
  error: error$j,
  code(cxt) {
    const { gen, data, schemaCode, it } = cxt;
    const prec = it.opts.multipleOfPrecision;
    const res = gen.let("res");
    const invalid = prec ? (0, codegen_1$n._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1$n._)`${res} !== parseInt(${res})`;
    cxt.fail$data((0, codegen_1$n._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
  }
};
multipleOf.default = def$y;
var limitLength = {};
var ucs2length$1 = {};
Object.defineProperty(ucs2length$1, "__esModule", { value: true });
function ucs2length(str) {
  const len = str.length;
  let length = 0;
  let pos = 0;
  let value;
  while (pos < len) {
    length++;
    value = str.charCodeAt(pos++);
    if (value >= 55296 && value <= 56319 && pos < len) {
      value = str.charCodeAt(pos);
      if ((value & 64512) === 56320)
        pos++;
    }
  }
  return length;
}
ucs2length$1.default = ucs2length;
ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
Object.defineProperty(limitLength, "__esModule", { value: true });
const codegen_1$m = codegen;
const util_1$n = util;
const ucs2length_1 = ucs2length$1;
const error$i = {
  message({ keyword: keyword2, schemaCode }) {
    const comp = keyword2 === "maxLength" ? "more" : "fewer";
    return (0, codegen_1$m.str)`must NOT have ${comp} than ${schemaCode} characters`;
  },
  params: ({ schemaCode }) => (0, codegen_1$m._)`{limit: ${schemaCode}}`
};
const def$x = {
  keyword: ["maxLength", "minLength"],
  type: "string",
  schemaType: "number",
  $data: true,
  error: error$i,
  code(cxt) {
    const { keyword: keyword2, data, schemaCode, it } = cxt;
    const op = keyword2 === "maxLength" ? codegen_1$m.operators.GT : codegen_1$m.operators.LT;
    const len = it.opts.unicode === false ? (0, codegen_1$m._)`${data}.length` : (0, codegen_1$m._)`${(0, util_1$n.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
    cxt.fail$data((0, codegen_1$m._)`${len} ${op} ${schemaCode}`);
  }
};
limitLength.default = def$x;
var pattern = {};
Object.defineProperty(pattern, "__esModule", { value: true });
const code_1$7 = code;
const util_1$m = util;
const codegen_1$l = codegen;
const error$h = {
  message: ({ schemaCode }) => (0, codegen_1$l.str)`must match pattern "${schemaCode}"`,
  params: ({ schemaCode }) => (0, codegen_1$l._)`{pattern: ${schemaCode}}`
};
const def$w = {
  keyword: "pattern",
  type: "string",
  schemaType: "string",
  $data: true,
  error: error$h,
  code(cxt) {
    const { gen, data, $data, schema, schemaCode, it } = cxt;
    const u = it.opts.unicodeRegExp ? "u" : "";
    if ($data) {
      const { regExp } = it.opts.code;
      const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1$l._)`new RegExp` : (0, util_1$m.useFunc)(gen, regExp);
      const valid = gen.let("valid");
      gen.try(() => gen.assign(valid, (0, codegen_1$l._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
      cxt.fail$data((0, codegen_1$l._)`!${valid}`);
    } else {
      const regExp = (0, code_1$7.usePattern)(cxt, schema);
      cxt.fail$data((0, codegen_1$l._)`!${regExp}.test(${data})`);
    }
  }
};
pattern.default = def$w;
var limitProperties = {};
Object.defineProperty(limitProperties, "__esModule", { value: true });
const codegen_1$k = codegen;
const error$g = {
  message({ keyword: keyword2, schemaCode }) {
    const comp = keyword2 === "maxProperties" ? "more" : "fewer";
    return (0, codegen_1$k.str)`must NOT have ${comp} than ${schemaCode} properties`;
  },
  params: ({ schemaCode }) => (0, codegen_1$k._)`{limit: ${schemaCode}}`
};
const def$v = {
  keyword: ["maxProperties", "minProperties"],
  type: "object",
  schemaType: "number",
  $data: true,
  error: error$g,
  code(cxt) {
    const { keyword: keyword2, data, schemaCode } = cxt;
    const op = keyword2 === "maxProperties" ? codegen_1$k.operators.GT : codegen_1$k.operators.LT;
    cxt.fail$data((0, codegen_1$k._)`Object.keys(${data}).length ${op} ${schemaCode}`);
  }
};
limitProperties.default = def$v;
var required = {};
Object.defineProperty(required, "__esModule", { value: true });
const code_1$6 = code;
const codegen_1$j = codegen;
const util_1$l = util;
const error$f = {
  message: ({ params: { missingProperty } }) => (0, codegen_1$j.str)`must have required property '${missingProperty}'`,
  params: ({ params: { missingProperty } }) => (0, codegen_1$j._)`{missingProperty: ${missingProperty}}`
};
const def$u = {
  keyword: "required",
  type: "object",
  schemaType: "array",
  $data: true,
  error: error$f,
  code(cxt) {
    const { gen, schema, schemaCode, data, $data, it } = cxt;
    const { opts } = it;
    if (!$data && schema.length === 0)
      return;
    const useLoop = schema.length >= opts.loopRequired;
    if (it.allErrors)
      allErrorsMode();
    else
      exitOnErrorMode();
    if (opts.strictRequired) {
      const props = cxt.parentSchema.properties;
      const { definedProperties } = cxt.it;
      for (const requiredKey of schema) {
        if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
          const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
          const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
          (0, util_1$l.checkStrictMode)(it, msg, it.opts.strictRequired);
        }
      }
    }
    function allErrorsMode() {
      if (useLoop || $data) {
        cxt.block$data(codegen_1$j.nil, loopAllRequired);
      } else {
        for (const prop of schema) {
          (0, code_1$6.checkReportMissingProp)(cxt, prop);
        }
      }
    }
    function exitOnErrorMode() {
      const missing = gen.let("missing");
      if (useLoop || $data) {
        const valid = gen.let("valid", true);
        cxt.block$data(valid, () => loopUntilMissing(missing, valid));
        cxt.ok(valid);
      } else {
        gen.if((0, code_1$6.checkMissingProp)(cxt, schema, missing));
        (0, code_1$6.reportMissingProp)(cxt, missing);
        gen.else();
      }
    }
    function loopAllRequired() {
      gen.forOf("prop", schemaCode, (prop) => {
        cxt.setParams({ missingProperty: prop });
        gen.if((0, code_1$6.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
      });
    }
    function loopUntilMissing(missing, valid) {
      cxt.setParams({ missingProperty: missing });
      gen.forOf(missing, schemaCode, () => {
        gen.assign(valid, (0, code_1$6.propertyInData)(gen, data, missing, opts.ownProperties));
        gen.if((0, codegen_1$j.not)(valid), () => {
          cxt.error();
          gen.break();
        });
      }, codegen_1$j.nil);
    }
  }
};
required.default = def$u;
var limitItems = {};
Object.defineProperty(limitItems, "__esModule", { value: true });
const codegen_1$i = codegen;
const error$e = {
  message({ keyword: keyword2, schemaCode }) {
    const comp = keyword2 === "maxItems" ? "more" : "fewer";
    return (0, codegen_1$i.str)`must NOT have ${comp} than ${schemaCode} items`;
  },
  params: ({ schemaCode }) => (0, codegen_1$i._)`{limit: ${schemaCode}}`
};
const def$t = {
  keyword: ["maxItems", "minItems"],
  type: "array",
  schemaType: "number",
  $data: true,
  error: error$e,
  code(cxt) {
    const { keyword: keyword2, data, schemaCode } = cxt;
    const op = keyword2 === "maxItems" ? codegen_1$i.operators.GT : codegen_1$i.operators.LT;
    cxt.fail$data((0, codegen_1$i._)`${data}.length ${op} ${schemaCode}`);
  }
};
limitItems.default = def$t;
var uniqueItems = {};
var equal$1 = {};
Object.defineProperty(equal$1, "__esModule", { value: true });
const equal2 = fastDeepEqual;
equal2.code = 'require("ajv/dist/runtime/equal").default';
equal$1.default = equal2;
Object.defineProperty(uniqueItems, "__esModule", { value: true });
const dataType_1 = dataType;
const codegen_1$h = codegen;
const util_1$k = util;
const equal_1$2 = equal$1;
const error$d = {
  message: ({ params: { i, j } }) => (0, codegen_1$h.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
  params: ({ params: { i, j } }) => (0, codegen_1$h._)`{i: ${i}, j: ${j}}`
};
const def$s = {
  keyword: "uniqueItems",
  type: "array",
  schemaType: "boolean",
  $data: true,
  error: error$d,
  code(cxt) {
    const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
    if (!$data && !schema)
      return;
    const valid = gen.let("valid");
    const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
    cxt.block$data(valid, validateUniqueItems, (0, codegen_1$h._)`${schemaCode} === false`);
    cxt.ok(valid);
    function validateUniqueItems() {
      const i = gen.let("i", (0, codegen_1$h._)`${data}.length`);
      const j = gen.let("j");
      cxt.setParams({ i, j });
      gen.assign(valid, true);
      gen.if((0, codegen_1$h._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
    }
    function canOptimize() {
      return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
    }
    function loopN(i, j) {
      const item = gen.name("item");
      const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
      const indices = gen.const("indices", (0, codegen_1$h._)`{}`);
      gen.for((0, codegen_1$h._)`;${i}--;`, () => {
        gen.let(item, (0, codegen_1$h._)`${data}[${i}]`);
        gen.if(wrongType, (0, codegen_1$h._)`continue`);
        if (itemTypes.length > 1)
          gen.if((0, codegen_1$h._)`typeof ${item} == "string"`, (0, codegen_1$h._)`${item} += "_"`);
        gen.if((0, codegen_1$h._)`typeof ${indices}[${item}] == "number"`, () => {
          gen.assign(j, (0, codegen_1$h._)`${indices}[${item}]`);
          cxt.error();
          gen.assign(valid, false).break();
        }).code((0, codegen_1$h._)`${indices}[${item}] = ${i}`);
      });
    }
    function loopN2(i, j) {
      const eql = (0, util_1$k.useFunc)(gen, equal_1$2.default);
      const outer = gen.name("outer");
      gen.label(outer).for((0, codegen_1$h._)`;${i}--;`, () => gen.for((0, codegen_1$h._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1$h._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
        cxt.error();
        gen.assign(valid, false).break(outer);
      })));
    }
  }
};
uniqueItems.default = def$s;
var _const = {};
Object.defineProperty(_const, "__esModule", { value: true });
const codegen_1$g = codegen;
const util_1$j = util;
const equal_1$1 = equal$1;
const error$c = {
  message: "must be equal to constant",
  params: ({ schemaCode }) => (0, codegen_1$g._)`{allowedValue: ${schemaCode}}`
};
const def$r = {
  keyword: "const",
  $data: true,
  error: error$c,
  code(cxt) {
    const { gen, data, $data, schemaCode, schema } = cxt;
    if ($data || schema && typeof schema == "object") {
      cxt.fail$data((0, codegen_1$g._)`!${(0, util_1$j.useFunc)(gen, equal_1$1.default)}(${data}, ${schemaCode})`);
    } else {
      cxt.fail((0, codegen_1$g._)`${schema} !== ${data}`);
    }
  }
};
_const.default = def$r;
var _enum = {};
Object.defineProperty(_enum, "__esModule", { value: true });
const codegen_1$f = codegen;
const util_1$i = util;
const equal_1 = equal$1;
const error$b = {
  message: "must be equal to one of the allowed values",
  params: ({ schemaCode }) => (0, codegen_1$f._)`{allowedValues: ${schemaCode}}`
};
const def$q = {
  keyword: "enum",
  schemaType: "array",
  $data: true,
  error: error$b,
  code(cxt) {
    const { gen, data, $data, schema, schemaCode, it } = cxt;
    if (!$data && schema.length === 0)
      throw new Error("enum must have non-empty array");
    const useLoop = schema.length >= it.opts.loopEnum;
    let eql;
    const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1$i.useFunc)(gen, equal_1.default);
    let valid;
    if (useLoop || $data) {
      valid = gen.let("valid");
      cxt.block$data(valid, loopEnum);
    } else {
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const vSchema = gen.const("vSchema", schemaCode);
      valid = (0, codegen_1$f.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
    }
    cxt.pass(valid);
    function loopEnum() {
      gen.assign(valid, false);
      gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1$f._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
    }
    function equalCode(vSchema, i) {
      const sch = schema[i];
      return typeof sch === "object" && sch !== null ? (0, codegen_1$f._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1$f._)`${data} === ${sch}`;
    }
  }
};
_enum.default = def$q;
Object.defineProperty(validation$2, "__esModule", { value: true });
const limitNumber_1 = limitNumber;
const multipleOf_1 = multipleOf;
const limitLength_1 = limitLength;
const pattern_1 = pattern;
const limitProperties_1 = limitProperties;
const required_1 = required;
const limitItems_1 = limitItems;
const uniqueItems_1 = uniqueItems;
const const_1 = _const;
const enum_1 = _enum;
const validation$1 = [
  // number
  limitNumber_1.default,
  multipleOf_1.default,
  // string
  limitLength_1.default,
  pattern_1.default,
  // object
  limitProperties_1.default,
  required_1.default,
  // array
  limitItems_1.default,
  uniqueItems_1.default,
  // any
  { keyword: "type", schemaType: ["string", "array"] },
  { keyword: "nullable", schemaType: "boolean" },
  const_1.default,
  enum_1.default
];
validation$2.default = validation$1;
var applicator$1 = {};
var additionalItems = {};
Object.defineProperty(additionalItems, "__esModule", { value: true });
additionalItems.validateAdditionalItems = void 0;
const codegen_1$e = codegen;
const util_1$h = util;
const error$a = {
  message: ({ params: { len } }) => (0, codegen_1$e.str)`must NOT have more than ${len} items`,
  params: ({ params: { len } }) => (0, codegen_1$e._)`{limit: ${len}}`
};
const def$p = {
  keyword: "additionalItems",
  type: "array",
  schemaType: ["boolean", "object"],
  before: "uniqueItems",
  error: error$a,
  code(cxt) {
    const { parentSchema, it } = cxt;
    const { items: items2 } = parentSchema;
    if (!Array.isArray(items2)) {
      (0, util_1$h.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
      return;
    }
    validateAdditionalItems(cxt, items2);
  }
};
function validateAdditionalItems(cxt, items2) {
  const { gen, schema, data, keyword: keyword2, it } = cxt;
  it.items = true;
  const len = gen.const("len", (0, codegen_1$e._)`${data}.length`);
  if (schema === false) {
    cxt.setParams({ len: items2.length });
    cxt.pass((0, codegen_1$e._)`${len} <= ${items2.length}`);
  } else if (typeof schema == "object" && !(0, util_1$h.alwaysValidSchema)(it, schema)) {
    const valid = gen.var("valid", (0, codegen_1$e._)`${len} <= ${items2.length}`);
    gen.if((0, codegen_1$e.not)(valid), () => validateItems(valid));
    cxt.ok(valid);
  }
  function validateItems(valid) {
    gen.forRange("i", items2.length, len, (i) => {
      cxt.subschema({ keyword: keyword2, dataProp: i, dataPropType: util_1$h.Type.Num }, valid);
      if (!it.allErrors)
        gen.if((0, codegen_1$e.not)(valid), () => gen.break());
    });
  }
}
additionalItems.validateAdditionalItems = validateAdditionalItems;
additionalItems.default = def$p;
var prefixItems = {};
var items = {};
Object.defineProperty(items, "__esModule", { value: true });
items.validateTuple = void 0;
const codegen_1$d = codegen;
const util_1$g = util;
const code_1$5 = code;
const def$o = {
  keyword: "items",
  type: "array",
  schemaType: ["object", "array", "boolean"],
  before: "uniqueItems",
  code(cxt) {
    const { schema, it } = cxt;
    if (Array.isArray(schema))
      return validateTuple(cxt, "additionalItems", schema);
    it.items = true;
    if ((0, util_1$g.alwaysValidSchema)(it, schema))
      return;
    cxt.ok((0, code_1$5.validateArray)(cxt));
  }
};
function validateTuple(cxt, extraItems, schArr = cxt.schema) {
  const { gen, parentSchema, data, keyword: keyword2, it } = cxt;
  checkStrictTuple(parentSchema);
  if (it.opts.unevaluated && schArr.length && it.items !== true) {
    it.items = util_1$g.mergeEvaluated.items(gen, schArr.length, it.items);
  }
  const valid = gen.name("valid");
  const len = gen.const("len", (0, codegen_1$d._)`${data}.length`);
  schArr.forEach((sch, i) => {
    if ((0, util_1$g.alwaysValidSchema)(it, sch))
      return;
    gen.if((0, codegen_1$d._)`${len} > ${i}`, () => cxt.subschema({
      keyword: keyword2,
      schemaProp: i,
      dataProp: i
    }, valid));
    cxt.ok(valid);
  });
  function checkStrictTuple(sch) {
    const { opts, errSchemaPath } = it;
    const l = schArr.length;
    const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
    if (opts.strictTuples && !fullTuple) {
      const msg = `"${keyword2}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
      (0, util_1$g.checkStrictMode)(it, msg, opts.strictTuples);
    }
  }
}
items.validateTuple = validateTuple;
items.default = def$o;
Object.defineProperty(prefixItems, "__esModule", { value: true });
const items_1$1 = items;
const def$n = {
  keyword: "prefixItems",
  type: "array",
  schemaType: ["array"],
  before: "uniqueItems",
  code: (cxt) => (0, items_1$1.validateTuple)(cxt, "items")
};
prefixItems.default = def$n;
var items2020 = {};
Object.defineProperty(items2020, "__esModule", { value: true });
const codegen_1$c = codegen;
const util_1$f = util;
const code_1$4 = code;
const additionalItems_1$1 = additionalItems;
const error$9 = {
  message: ({ params: { len } }) => (0, codegen_1$c.str)`must NOT have more than ${len} items`,
  params: ({ params: { len } }) => (0, codegen_1$c._)`{limit: ${len}}`
};
const def$m = {
  keyword: "items",
  type: "array",
  schemaType: ["object", "boolean"],
  before: "uniqueItems",
  error: error$9,
  code(cxt) {
    const { schema, parentSchema, it } = cxt;
    const { prefixItems: prefixItems2 } = parentSchema;
    it.items = true;
    if ((0, util_1$f.alwaysValidSchema)(it, schema))
      return;
    if (prefixItems2)
      (0, additionalItems_1$1.validateAdditionalItems)(cxt, prefixItems2);
    else
      cxt.ok((0, code_1$4.validateArray)(cxt));
  }
};
items2020.default = def$m;
var contains = {};
Object.defineProperty(contains, "__esModule", { value: true });
const codegen_1$b = codegen;
const util_1$e = util;
const error$8 = {
  message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1$b.str)`must contain at least ${min} valid item(s)` : (0, codegen_1$b.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
  params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1$b._)`{minContains: ${min}}` : (0, codegen_1$b._)`{minContains: ${min}, maxContains: ${max}}`
};
const def$l = {
  keyword: "contains",
  type: "array",
  schemaType: ["object", "boolean"],
  before: "uniqueItems",
  trackErrors: true,
  error: error$8,
  code(cxt) {
    const { gen, schema, parentSchema, data, it } = cxt;
    let min;
    let max;
    const { minContains, maxContains } = parentSchema;
    if (it.opts.next) {
      min = minContains === void 0 ? 1 : minContains;
      max = maxContains;
    } else {
      min = 1;
    }
    const len = gen.const("len", (0, codegen_1$b._)`${data}.length`);
    cxt.setParams({ min, max });
    if (max === void 0 && min === 0) {
      (0, util_1$e.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
      return;
    }
    if (max !== void 0 && min > max) {
      (0, util_1$e.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
      cxt.fail();
      return;
    }
    if ((0, util_1$e.alwaysValidSchema)(it, schema)) {
      let cond = (0, codegen_1$b._)`${len} >= ${min}`;
      if (max !== void 0)
        cond = (0, codegen_1$b._)`${cond} && ${len} <= ${max}`;
      cxt.pass(cond);
      return;
    }
    it.items = true;
    const valid = gen.name("valid");
    if (max === void 0 && min === 1) {
      validateItems(valid, () => gen.if(valid, () => gen.break()));
    } else if (min === 0) {
      gen.let(valid, true);
      if (max !== void 0)
        gen.if((0, codegen_1$b._)`${data}.length > 0`, validateItemsWithCount);
    } else {
      gen.let(valid, false);
      validateItemsWithCount();
    }
    cxt.result(valid, () => cxt.reset());
    function validateItemsWithCount() {
      const schValid = gen.name("_valid");
      const count = gen.let("count", 0);
      validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
    }
    function validateItems(_valid, block) {
      gen.forRange("i", 0, len, (i) => {
        cxt.subschema({
          keyword: "contains",
          dataProp: i,
          dataPropType: util_1$e.Type.Num,
          compositeRule: true
        }, _valid);
        block();
      });
    }
    function checkLimits(count) {
      gen.code((0, codegen_1$b._)`${count}++`);
      if (max === void 0) {
        gen.if((0, codegen_1$b._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
      } else {
        gen.if((0, codegen_1$b._)`${count} > ${max}`, () => gen.assign(valid, false).break());
        if (min === 1)
          gen.assign(valid, true);
        else
          gen.if((0, codegen_1$b._)`${count} >= ${min}`, () => gen.assign(valid, true));
      }
    }
  }
};
contains.default = def$l;
var dependencies = {};
(function(exports$1) {
  Object.defineProperty(exports$1, "__esModule", { value: true });
  exports$1.validateSchemaDeps = exports$1.validatePropertyDeps = exports$1.error = void 0;
  const codegen_12 = codegen;
  const util_12 = util;
  const code_12 = code;
  exports$1.error = {
    message: ({ params: { property, depsCount, deps } }) => {
      const property_ies = depsCount === 1 ? "property" : "properties";
      return (0, codegen_12.str)`must have ${property_ies} ${deps} when property ${property} is present`;
    },
    params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_12._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
    // TODO change to reference
  };
  const def2 = {
    keyword: "dependencies",
    type: "object",
    schemaType: "object",
    error: exports$1.error,
    code(cxt) {
      const [propDeps, schDeps] = splitDependencies(cxt);
      validatePropertyDeps(cxt, propDeps);
      validateSchemaDeps(cxt, schDeps);
    }
  };
  function splitDependencies({ schema }) {
    const propertyDeps = {};
    const schemaDeps = {};
    for (const key in schema) {
      if (key === "__proto__")
        continue;
      const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
      deps[key] = schema[key];
    }
    return [propertyDeps, schemaDeps];
  }
  function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
    const { gen, data, it } = cxt;
    if (Object.keys(propertyDeps).length === 0)
      return;
    const missing = gen.let("missing");
    for (const prop in propertyDeps) {
      const deps = propertyDeps[prop];
      if (deps.length === 0)
        continue;
      const hasProperty = (0, code_12.propertyInData)(gen, data, prop, it.opts.ownProperties);
      cxt.setParams({
        property: prop,
        depsCount: deps.length,
        deps: deps.join(", ")
      });
      if (it.allErrors) {
        gen.if(hasProperty, () => {
          for (const depProp of deps) {
            (0, code_12.checkReportMissingProp)(cxt, depProp);
          }
        });
      } else {
        gen.if((0, codegen_12._)`${hasProperty} && (${(0, code_12.checkMissingProp)(cxt, deps, missing)})`);
        (0, code_12.reportMissingProp)(cxt, missing);
        gen.else();
      }
    }
  }
  exports$1.validatePropertyDeps = validatePropertyDeps;
  function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
    const { gen, data, keyword: keyword2, it } = cxt;
    const valid = gen.name("valid");
    for (const prop in schemaDeps) {
      if ((0, util_12.alwaysValidSchema)(it, schemaDeps[prop]))
        continue;
      gen.if(
        (0, code_12.propertyInData)(gen, data, prop, it.opts.ownProperties),
        () => {
          const schCxt = cxt.subschema({ keyword: keyword2, schemaProp: prop }, valid);
          cxt.mergeValidEvaluated(schCxt, valid);
        },
        () => gen.var(valid, true)
        // TODO var
      );
      cxt.ok(valid);
    }
  }
  exports$1.validateSchemaDeps = validateSchemaDeps;
  exports$1.default = def2;
})(dependencies);
var propertyNames = {};
Object.defineProperty(propertyNames, "__esModule", { value: true });
const codegen_1$a = codegen;
const util_1$d = util;
const error$7 = {
  message: "property name must be valid",
  params: ({ params }) => (0, codegen_1$a._)`{propertyName: ${params.propertyName}}`
};
const def$k = {
  keyword: "propertyNames",
  type: "object",
  schemaType: ["object", "boolean"],
  error: error$7,
  code(cxt) {
    const { gen, schema, data, it } = cxt;
    if ((0, util_1$d.alwaysValidSchema)(it, schema))
      return;
    const valid = gen.name("valid");
    gen.forIn("key", data, (key) => {
      cxt.setParams({ propertyName: key });
      cxt.subschema({
        keyword: "propertyNames",
        data: key,
        dataTypes: ["string"],
        propertyName: key,
        compositeRule: true
      }, valid);
      gen.if((0, codegen_1$a.not)(valid), () => {
        cxt.error(true);
        if (!it.allErrors)
          gen.break();
      });
    });
    cxt.ok(valid);
  }
};
propertyNames.default = def$k;
var additionalProperties = {};
Object.defineProperty(additionalProperties, "__esModule", { value: true });
const code_1$3 = code;
const codegen_1$9 = codegen;
const names_1$3 = names$1;
const util_1$c = util;
const error$6 = {
  message: "must NOT have additional properties",
  params: ({ params }) => (0, codegen_1$9._)`{additionalProperty: ${params.additionalProperty}}`
};
const def$j = {
  keyword: "additionalProperties",
  type: ["object"],
  schemaType: ["boolean", "object"],
  allowUndefined: true,
  trackErrors: true,
  error: error$6,
  code(cxt) {
    const { gen, schema, parentSchema, data, errsCount, it } = cxt;
    if (!errsCount)
      throw new Error("ajv implementation error");
    const { allErrors, opts } = it;
    it.props = true;
    if (opts.removeAdditional !== "all" && (0, util_1$c.alwaysValidSchema)(it, schema))
      return;
    const props = (0, code_1$3.allSchemaProperties)(parentSchema.properties);
    const patProps = (0, code_1$3.allSchemaProperties)(parentSchema.patternProperties);
    checkAdditionalProperties();
    cxt.ok((0, codegen_1$9._)`${errsCount} === ${names_1$3.default.errors}`);
    function checkAdditionalProperties() {
      gen.forIn("key", data, (key) => {
        if (!props.length && !patProps.length)
          additionalPropertyCode(key);
        else
          gen.if(isAdditional(key), () => additionalPropertyCode(key));
      });
    }
    function isAdditional(key) {
      let definedProp;
      if (props.length > 8) {
        const propsSchema = (0, util_1$c.schemaRefOrVal)(it, parentSchema.properties, "properties");
        definedProp = (0, code_1$3.isOwnProperty)(gen, propsSchema, key);
      } else if (props.length) {
        definedProp = (0, codegen_1$9.or)(...props.map((p) => (0, codegen_1$9._)`${key} === ${p}`));
      } else {
        definedProp = codegen_1$9.nil;
      }
      if (patProps.length) {
        definedProp = (0, codegen_1$9.or)(definedProp, ...patProps.map((p) => (0, codegen_1$9._)`${(0, code_1$3.usePattern)(cxt, p)}.test(${key})`));
      }
      return (0, codegen_1$9.not)(definedProp);
    }
    function deleteAdditional(key) {
      gen.code((0, codegen_1$9._)`delete ${data}[${key}]`);
    }
    function additionalPropertyCode(key) {
      if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
        deleteAdditional(key);
        return;
      }
      if (schema === false) {
        cxt.setParams({ additionalProperty: key });
        cxt.error();
        if (!allErrors)
          gen.break();
        return;
      }
      if (typeof schema == "object" && !(0, util_1$c.alwaysValidSchema)(it, schema)) {
        const valid = gen.name("valid");
        if (opts.removeAdditional === "failing") {
          applyAdditionalSchema(key, valid, false);
          gen.if((0, codegen_1$9.not)(valid), () => {
            cxt.reset();
            deleteAdditional(key);
          });
        } else {
          applyAdditionalSchema(key, valid);
          if (!allErrors)
            gen.if((0, codegen_1$9.not)(valid), () => gen.break());
        }
      }
    }
    function applyAdditionalSchema(key, valid, errors2) {
      const subschema2 = {
        keyword: "additionalProperties",
        dataProp: key,
        dataPropType: util_1$c.Type.Str
      };
      if (errors2 === false) {
        Object.assign(subschema2, {
          compositeRule: true,
          createErrors: false,
          allErrors: false
        });
      }
      cxt.subschema(subschema2, valid);
    }
  }
};
additionalProperties.default = def$j;
var properties$8 = {};
Object.defineProperty(properties$8, "__esModule", { value: true });
const validate_1 = validate;
const code_1$2 = code;
const util_1$b = util;
const additionalProperties_1$1 = additionalProperties;
const def$i = {
  keyword: "properties",
  type: "object",
  schemaType: "object",
  code(cxt) {
    const { gen, schema, parentSchema, data, it } = cxt;
    if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
      additionalProperties_1$1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1$1.default, "additionalProperties"));
    }
    const allProps = (0, code_1$2.allSchemaProperties)(schema);
    for (const prop of allProps) {
      it.definedProperties.add(prop);
    }
    if (it.opts.unevaluated && allProps.length && it.props !== true) {
      it.props = util_1$b.mergeEvaluated.props(gen, (0, util_1$b.toHash)(allProps), it.props);
    }
    const properties2 = allProps.filter((p) => !(0, util_1$b.alwaysValidSchema)(it, schema[p]));
    if (properties2.length === 0)
      return;
    const valid = gen.name("valid");
    for (const prop of properties2) {
      if (hasDefault(prop)) {
        applyPropertySchema(prop);
      } else {
        gen.if((0, code_1$2.propertyInData)(gen, data, prop, it.opts.ownProperties));
        applyPropertySchema(prop);
        if (!it.allErrors)
          gen.else().var(valid, true);
        gen.endIf();
      }
      cxt.it.definedProperties.add(prop);
      cxt.ok(valid);
    }
    function hasDefault(prop) {
      return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
    }
    function applyPropertySchema(prop) {
      cxt.subschema({
        keyword: "properties",
        schemaProp: prop,
        dataProp: prop
      }, valid);
    }
  }
};
properties$8.default = def$i;
var patternProperties = {};
Object.defineProperty(patternProperties, "__esModule", { value: true });
const code_1$1 = code;
const codegen_1$8 = codegen;
const util_1$a = util;
const util_2 = util;
const def$h = {
  keyword: "patternProperties",
  type: "object",
  schemaType: "object",
  code(cxt) {
    const { gen, schema, data, parentSchema, it } = cxt;
    const { opts } = it;
    const patterns = (0, code_1$1.allSchemaProperties)(schema);
    const alwaysValidPatterns = patterns.filter((p) => (0, util_1$a.alwaysValidSchema)(it, schema[p]));
    if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
      return;
    }
    const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
    const valid = gen.name("valid");
    if (it.props !== true && !(it.props instanceof codegen_1$8.Name)) {
      it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
    }
    const { props } = it;
    validatePatternProperties();
    function validatePatternProperties() {
      for (const pat of patterns) {
        if (checkProperties)
          checkMatchingProperties(pat);
        if (it.allErrors) {
          validateProperties(pat);
        } else {
          gen.var(valid, true);
          validateProperties(pat);
          gen.if(valid);
        }
      }
    }
    function checkMatchingProperties(pat) {
      for (const prop in checkProperties) {
        if (new RegExp(pat).test(prop)) {
          (0, util_1$a.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
        }
      }
    }
    function validateProperties(pat) {
      gen.forIn("key", data, (key) => {
        gen.if((0, codegen_1$8._)`${(0, code_1$1.usePattern)(cxt, pat)}.test(${key})`, () => {
          const alwaysValid = alwaysValidPatterns.includes(pat);
          if (!alwaysValid) {
            cxt.subschema({
              keyword: "patternProperties",
              schemaProp: pat,
              dataProp: key,
              dataPropType: util_2.Type.Str
            }, valid);
          }
          if (it.opts.unevaluated && props !== true) {
            gen.assign((0, codegen_1$8._)`${props}[${key}]`, true);
          } else if (!alwaysValid && !it.allErrors) {
            gen.if((0, codegen_1$8.not)(valid), () => gen.break());
          }
        });
      });
    }
  }
};
patternProperties.default = def$h;
var not = {};
Object.defineProperty(not, "__esModule", { value: true });
const util_1$9 = util;
const def$g = {
  keyword: "not",
  schemaType: ["object", "boolean"],
  trackErrors: true,
  code(cxt) {
    const { gen, schema, it } = cxt;
    if ((0, util_1$9.alwaysValidSchema)(it, schema)) {
      cxt.fail();
      return;
    }
    const valid = gen.name("valid");
    cxt.subschema({
      keyword: "not",
      compositeRule: true,
      createErrors: false,
      allErrors: false
    }, valid);
    cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
  },
  error: { message: "must NOT be valid" }
};
not.default = def$g;
var anyOf = {};
Object.defineProperty(anyOf, "__esModule", { value: true });
const code_1 = code;
const def$f = {
  keyword: "anyOf",
  schemaType: "array",
  trackErrors: true,
  code: code_1.validateUnion,
  error: { message: "must match a schema in anyOf" }
};
anyOf.default = def$f;
var oneOf = {};
Object.defineProperty(oneOf, "__esModule", { value: true });
const codegen_1$7 = codegen;
const util_1$8 = util;
const error$5 = {
  message: "must match exactly one schema in oneOf",
  params: ({ params }) => (0, codegen_1$7._)`{passingSchemas: ${params.passing}}`
};
const def$e = {
  keyword: "oneOf",
  schemaType: "array",
  trackErrors: true,
  error: error$5,
  code(cxt) {
    const { gen, schema, parentSchema, it } = cxt;
    if (!Array.isArray(schema))
      throw new Error("ajv implementation error");
    if (it.opts.discriminator && parentSchema.discriminator)
      return;
    const schArr = schema;
    const valid = gen.let("valid", false);
    const passing = gen.let("passing", null);
    const schValid = gen.name("_valid");
    cxt.setParams({ passing });
    gen.block(validateOneOf);
    cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
    function validateOneOf() {
      schArr.forEach((sch, i) => {
        let schCxt;
        if ((0, util_1$8.alwaysValidSchema)(it, sch)) {
          gen.var(schValid, true);
        } else {
          schCxt = cxt.subschema({
            keyword: "oneOf",
            schemaProp: i,
            compositeRule: true
          }, schValid);
        }
        if (i > 0) {
          gen.if((0, codegen_1$7._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1$7._)`[${passing}, ${i}]`).else();
        }
        gen.if(schValid, () => {
          gen.assign(valid, true);
          gen.assign(passing, i);
          if (schCxt)
            cxt.mergeEvaluated(schCxt, codegen_1$7.Name);
        });
      });
    }
  }
};
oneOf.default = def$e;
var allOf$1 = {};
Object.defineProperty(allOf$1, "__esModule", { value: true });
const util_1$7 = util;
const def$d = {
  keyword: "allOf",
  schemaType: "array",
  code(cxt) {
    const { gen, schema, it } = cxt;
    if (!Array.isArray(schema))
      throw new Error("ajv implementation error");
    const valid = gen.name("valid");
    schema.forEach((sch, i) => {
      if ((0, util_1$7.alwaysValidSchema)(it, sch))
        return;
      const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
      cxt.ok(valid);
      cxt.mergeEvaluated(schCxt);
    });
  }
};
allOf$1.default = def$d;
var _if = {};
Object.defineProperty(_if, "__esModule", { value: true });
const codegen_1$6 = codegen;
const util_1$6 = util;
const error$4 = {
  message: ({ params }) => (0, codegen_1$6.str)`must match "${params.ifClause}" schema`,
  params: ({ params }) => (0, codegen_1$6._)`{failingKeyword: ${params.ifClause}}`
};
const def$c = {
  keyword: "if",
  schemaType: ["object", "boolean"],
  trackErrors: true,
  error: error$4,
  code(cxt) {
    const { gen, parentSchema, it } = cxt;
    if (parentSchema.then === void 0 && parentSchema.else === void 0) {
      (0, util_1$6.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
    }
    const hasThen = hasSchema(it, "then");
    const hasElse = hasSchema(it, "else");
    if (!hasThen && !hasElse)
      return;
    const valid = gen.let("valid", true);
    const schValid = gen.name("_valid");
    validateIf();
    cxt.reset();
    if (hasThen && hasElse) {
      const ifClause = gen.let("ifClause");
      cxt.setParams({ ifClause });
      gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
    } else if (hasThen) {
      gen.if(schValid, validateClause("then"));
    } else {
      gen.if((0, codegen_1$6.not)(schValid), validateClause("else"));
    }
    cxt.pass(valid, () => cxt.error(true));
    function validateIf() {
      const schCxt = cxt.subschema({
        keyword: "if",
        compositeRule: true,
        createErrors: false,
        allErrors: false
      }, schValid);
      cxt.mergeEvaluated(schCxt);
    }
    function validateClause(keyword2, ifClause) {
      return () => {
        const schCxt = cxt.subschema({ keyword: keyword2 }, schValid);
        gen.assign(valid, schValid);
        cxt.mergeValidEvaluated(schCxt, valid);
        if (ifClause)
          gen.assign(ifClause, (0, codegen_1$6._)`${keyword2}`);
        else
          cxt.setParams({ ifClause: keyword2 });
      };
    }
  }
};
function hasSchema(it, keyword2) {
  const schema = it.schema[keyword2];
  return schema !== void 0 && !(0, util_1$6.alwaysValidSchema)(it, schema);
}
_if.default = def$c;
var thenElse = {};
Object.defineProperty(thenElse, "__esModule", { value: true });
const util_1$5 = util;
const def$b = {
  keyword: ["then", "else"],
  schemaType: ["object", "boolean"],
  code({ keyword: keyword2, parentSchema, it }) {
    if (parentSchema.if === void 0)
      (0, util_1$5.checkStrictMode)(it, `"${keyword2}" without "if" is ignored`);
  }
};
thenElse.default = def$b;
Object.defineProperty(applicator$1, "__esModule", { value: true });
const additionalItems_1 = additionalItems;
const prefixItems_1 = prefixItems;
const items_1 = items;
const items2020_1 = items2020;
const contains_1 = contains;
const dependencies_1$2 = dependencies;
const propertyNames_1 = propertyNames;
const additionalProperties_1 = additionalProperties;
const properties_1 = properties$8;
const patternProperties_1 = patternProperties;
const not_1 = not;
const anyOf_1 = anyOf;
const oneOf_1 = oneOf;
const allOf_1 = allOf$1;
const if_1 = _if;
const thenElse_1 = thenElse;
function getApplicator(draft20202 = false) {
  const applicator2 = [
    // any
    not_1.default,
    anyOf_1.default,
    oneOf_1.default,
    allOf_1.default,
    if_1.default,
    thenElse_1.default,
    // object
    propertyNames_1.default,
    additionalProperties_1.default,
    dependencies_1$2.default,
    properties_1.default,
    patternProperties_1.default
  ];
  if (draft20202)
    applicator2.push(prefixItems_1.default, items2020_1.default);
  else
    applicator2.push(additionalItems_1.default, items_1.default);
  applicator2.push(contains_1.default);
  return applicator2;
}
applicator$1.default = getApplicator;
var dynamic$1 = {};
var dynamicAnchor$1 = {};
Object.defineProperty(dynamicAnchor$1, "__esModule", { value: true });
dynamicAnchor$1.dynamicAnchor = void 0;
const codegen_1$5 = codegen;
const names_1$2 = names$1;
const compile_1$1 = compile;
const ref_1$1 = ref;
const def$a = {
  keyword: "$dynamicAnchor",
  schemaType: "string",
  code: (cxt) => dynamicAnchor(cxt, cxt.schema)
};
function dynamicAnchor(cxt, anchor) {
  const { gen, it } = cxt;
  it.schemaEnv.root.dynamicAnchors[anchor] = true;
  const v = (0, codegen_1$5._)`${names_1$2.default.dynamicAnchors}${(0, codegen_1$5.getProperty)(anchor)}`;
  const validate2 = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
  gen.if((0, codegen_1$5._)`!${v}`, () => gen.assign(v, validate2));
}
dynamicAnchor$1.dynamicAnchor = dynamicAnchor;
function _getValidate(cxt) {
  const { schemaEnv, schema, self: self2 } = cxt.it;
  const { root, baseId, localRefs, meta } = schemaEnv.root;
  const { schemaId } = self2.opts;
  const sch = new compile_1$1.SchemaEnv({ schema, schemaId, root, baseId, localRefs, meta });
  compile_1$1.compileSchema.call(self2, sch);
  return (0, ref_1$1.getValidate)(cxt, sch);
}
dynamicAnchor$1.default = def$a;
var dynamicRef$1 = {};
Object.defineProperty(dynamicRef$1, "__esModule", { value: true });
dynamicRef$1.dynamicRef = void 0;
const codegen_1$4 = codegen;
const names_1$1 = names$1;
const ref_1 = ref;
const def$9 = {
  keyword: "$dynamicRef",
  schemaType: "string",
  code: (cxt) => dynamicRef(cxt, cxt.schema)
};
function dynamicRef(cxt, ref2) {
  const { gen, keyword: keyword2, it } = cxt;
  if (ref2[0] !== "#")
    throw new Error(`"${keyword2}" only supports hash fragment reference`);
  const anchor = ref2.slice(1);
  if (it.allErrors) {
    _dynamicRef();
  } else {
    const valid = gen.let("valid", false);
    _dynamicRef(valid);
    cxt.ok(valid);
  }
  function _dynamicRef(valid) {
    if (it.schemaEnv.root.dynamicAnchors[anchor]) {
      const v = gen.let("_v", (0, codegen_1$4._)`${names_1$1.default.dynamicAnchors}${(0, codegen_1$4.getProperty)(anchor)}`);
      gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
    } else {
      _callRef(it.validateName, valid)();
    }
  }
  function _callRef(validate2, valid) {
    return valid ? () => gen.block(() => {
      (0, ref_1.callRef)(cxt, validate2);
      gen.let(valid, true);
    }) : () => (0, ref_1.callRef)(cxt, validate2);
  }
}
dynamicRef$1.dynamicRef = dynamicRef;
dynamicRef$1.default = def$9;
var recursiveAnchor = {};
Object.defineProperty(recursiveAnchor, "__esModule", { value: true });
const dynamicAnchor_1$1 = dynamicAnchor$1;
const util_1$4 = util;
const def$8 = {
  keyword: "$recursiveAnchor",
  schemaType: "boolean",
  code(cxt) {
    if (cxt.schema)
      (0, dynamicAnchor_1$1.dynamicAnchor)(cxt, "");
    else
      (0, util_1$4.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
  }
};
recursiveAnchor.default = def$8;
var recursiveRef = {};
Object.defineProperty(recursiveRef, "__esModule", { value: true });
const dynamicRef_1$1 = dynamicRef$1;
const def$7 = {
  keyword: "$recursiveRef",
  schemaType: "string",
  code: (cxt) => (0, dynamicRef_1$1.dynamicRef)(cxt, cxt.schema)
};
recursiveRef.default = def$7;
Object.defineProperty(dynamic$1, "__esModule", { value: true });
const dynamicAnchor_1 = dynamicAnchor$1;
const dynamicRef_1 = dynamicRef$1;
const recursiveAnchor_1 = recursiveAnchor;
const recursiveRef_1 = recursiveRef;
const dynamic = [dynamicAnchor_1.default, dynamicRef_1.default, recursiveAnchor_1.default, recursiveRef_1.default];
dynamic$1.default = dynamic;
var next$1 = {};
var dependentRequired = {};
Object.defineProperty(dependentRequired, "__esModule", { value: true });
const dependencies_1$1 = dependencies;
const def$6 = {
  keyword: "dependentRequired",
  type: "object",
  schemaType: "object",
  error: dependencies_1$1.error,
  code: (cxt) => (0, dependencies_1$1.validatePropertyDeps)(cxt)
};
dependentRequired.default = def$6;
var dependentSchemas = {};
Object.defineProperty(dependentSchemas, "__esModule", { value: true });
const dependencies_1 = dependencies;
const def$5 = {
  keyword: "dependentSchemas",
  type: "object",
  schemaType: "object",
  code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
};
dependentSchemas.default = def$5;
var limitContains = {};
Object.defineProperty(limitContains, "__esModule", { value: true });
const util_1$3 = util;
const def$4 = {
  keyword: ["maxContains", "minContains"],
  type: "array",
  schemaType: "number",
  code({ keyword: keyword2, parentSchema, it }) {
    if (parentSchema.contains === void 0) {
      (0, util_1$3.checkStrictMode)(it, `"${keyword2}" without "contains" is ignored`);
    }
  }
};
limitContains.default = def$4;
Object.defineProperty(next$1, "__esModule", { value: true });
const dependentRequired_1 = dependentRequired;
const dependentSchemas_1 = dependentSchemas;
const limitContains_1 = limitContains;
const next = [dependentRequired_1.default, dependentSchemas_1.default, limitContains_1.default];
next$1.default = next;
var unevaluated$2 = {};
var unevaluatedProperties = {};
Object.defineProperty(unevaluatedProperties, "__esModule", { value: true });
const codegen_1$3 = codegen;
const util_1$2 = util;
const names_1 = names$1;
const error$3 = {
  message: "must NOT have unevaluated properties",
  params: ({ params }) => (0, codegen_1$3._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
};
const def$3 = {
  keyword: "unevaluatedProperties",
  type: "object",
  schemaType: ["boolean", "object"],
  trackErrors: true,
  error: error$3,
  code(cxt) {
    const { gen, schema, data, errsCount, it } = cxt;
    if (!errsCount)
      throw new Error("ajv implementation error");
    const { allErrors, props } = it;
    if (props instanceof codegen_1$3.Name) {
      gen.if((0, codegen_1$3._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
    } else if (props !== true) {
      gen.forIn("key", data, (key) => props === void 0 ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
    }
    it.props = true;
    cxt.ok((0, codegen_1$3._)`${errsCount} === ${names_1.default.errors}`);
    function unevaluatedPropCode(key) {
      if (schema === false) {
        cxt.setParams({ unevaluatedProperty: key });
        cxt.error();
        if (!allErrors)
          gen.break();
        return;
      }
      if (!(0, util_1$2.alwaysValidSchema)(it, schema)) {
        const valid = gen.name("valid");
        cxt.subschema({
          keyword: "unevaluatedProperties",
          dataProp: key,
          dataPropType: util_1$2.Type.Str
        }, valid);
        if (!allErrors)
          gen.if((0, codegen_1$3.not)(valid), () => gen.break());
      }
    }
    function unevaluatedDynamic(evaluatedProps, key) {
      return (0, codegen_1$3._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
    }
    function unevaluatedStatic(evaluatedProps, key) {
      const ps = [];
      for (const p in evaluatedProps) {
        if (evaluatedProps[p] === true)
          ps.push((0, codegen_1$3._)`${key} !== ${p}`);
      }
      return (0, codegen_1$3.and)(...ps);
    }
  }
};
unevaluatedProperties.default = def$3;
var unevaluatedItems = {};
Object.defineProperty(unevaluatedItems, "__esModule", { value: true });
const codegen_1$2 = codegen;
const util_1$1 = util;
const error$2 = {
  message: ({ params: { len } }) => (0, codegen_1$2.str)`must NOT have more than ${len} items`,
  params: ({ params: { len } }) => (0, codegen_1$2._)`{limit: ${len}}`
};
const def$2 = {
  keyword: "unevaluatedItems",
  type: "array",
  schemaType: ["boolean", "object"],
  error: error$2,
  code(cxt) {
    const { gen, schema, data, it } = cxt;
    const items2 = it.items || 0;
    if (items2 === true)
      return;
    const len = gen.const("len", (0, codegen_1$2._)`${data}.length`);
    if (schema === false) {
      cxt.setParams({ len: items2 });
      cxt.fail((0, codegen_1$2._)`${len} > ${items2}`);
    } else if (typeof schema == "object" && !(0, util_1$1.alwaysValidSchema)(it, schema)) {
      const valid = gen.var("valid", (0, codegen_1$2._)`${len} <= ${items2}`);
      gen.if((0, codegen_1$2.not)(valid), () => validateItems(valid, items2));
      cxt.ok(valid);
    }
    it.items = true;
    function validateItems(valid, from) {
      gen.forRange("i", from, len, (i) => {
        cxt.subschema({ keyword: "unevaluatedItems", dataProp: i, dataPropType: util_1$1.Type.Num }, valid);
        if (!it.allErrors)
          gen.if((0, codegen_1$2.not)(valid), () => gen.break());
      });
    }
  }
};
unevaluatedItems.default = def$2;
Object.defineProperty(unevaluated$2, "__esModule", { value: true });
const unevaluatedProperties_1 = unevaluatedProperties;
const unevaluatedItems_1 = unevaluatedItems;
const unevaluated$1 = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
unevaluated$2.default = unevaluated$1;
var format$3 = {};
var format$2 = {};
Object.defineProperty(format$2, "__esModule", { value: true });
const codegen_1$1 = codegen;
const error$1 = {
  message: ({ schemaCode }) => (0, codegen_1$1.str)`must match format "${schemaCode}"`,
  params: ({ schemaCode }) => (0, codegen_1$1._)`{format: ${schemaCode}}`
};
const def$1 = {
  keyword: "format",
  type: ["number", "string"],
  schemaType: "string",
  $data: true,
  error: error$1,
  code(cxt, ruleType) {
    const { gen, data, $data, schema, schemaCode, it } = cxt;
    const { opts, errSchemaPath, schemaEnv, self: self2 } = it;
    if (!opts.validateFormats)
      return;
    if ($data)
      validate$DataFormat();
    else
      validateFormat();
    function validate$DataFormat() {
      const fmts = gen.scopeValue("formats", {
        ref: self2.formats,
        code: opts.code.formats
      });
      const fDef = gen.const("fDef", (0, codegen_1$1._)`${fmts}[${schemaCode}]`);
      const fType = gen.let("fType");
      const format2 = gen.let("format");
      gen.if((0, codegen_1$1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1$1._)`${fDef}.type || "string"`).assign(format2, (0, codegen_1$1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1$1._)`"string"`).assign(format2, fDef));
      cxt.fail$data((0, codegen_1$1.or)(unknownFmt(), invalidFmt()));
      function unknownFmt() {
        if (opts.strictSchema === false)
          return codegen_1$1.nil;
        return (0, codegen_1$1._)`${schemaCode} && !${format2}`;
      }
      function invalidFmt() {
        const callFormat = schemaEnv.$async ? (0, codegen_1$1._)`(${fDef}.async ? await ${format2}(${data}) : ${format2}(${data}))` : (0, codegen_1$1._)`${format2}(${data})`;
        const validData = (0, codegen_1$1._)`(typeof ${format2} == "function" ? ${callFormat} : ${format2}.test(${data}))`;
        return (0, codegen_1$1._)`${format2} && ${format2} !== true && ${fType} === ${ruleType} && !${validData}`;
      }
    }
    function validateFormat() {
      const formatDef = self2.formats[schema];
      if (!formatDef) {
        unknownFormat();
        return;
      }
      if (formatDef === true)
        return;
      const [fmtType, format2, fmtRef] = getFormat(formatDef);
      if (fmtType === ruleType)
        cxt.pass(validCondition());
      function unknownFormat() {
        if (opts.strictSchema === false) {
          self2.logger.warn(unknownMsg());
          return;
        }
        throw new Error(unknownMsg());
        function unknownMsg() {
          return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
        }
      }
      function getFormat(fmtDef) {
        const code2 = fmtDef instanceof RegExp ? (0, codegen_1$1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1$1._)`${opts.code.formats}${(0, codegen_1$1.getProperty)(schema)}` : void 0;
        const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code: code2 });
        if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
          return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1$1._)`${fmt}.validate`];
        }
        return ["string", fmtDef, fmt];
      }
      function validCondition() {
        if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
          if (!schemaEnv.$async)
            throw new Error("async format in sync schema");
          return (0, codegen_1$1._)`await ${fmtRef}(${data})`;
        }
        return typeof format2 == "function" ? (0, codegen_1$1._)`${fmtRef}(${data})` : (0, codegen_1$1._)`${fmtRef}.test(${data})`;
      }
    }
  }
};
format$2.default = def$1;
Object.defineProperty(format$3, "__esModule", { value: true });
const format_1$1 = format$2;
const format$1 = [format_1$1.default];
format$3.default = format$1;
var metadata$1 = {};
Object.defineProperty(metadata$1, "__esModule", { value: true });
metadata$1.contentVocabulary = metadata$1.metadataVocabulary = void 0;
metadata$1.metadataVocabulary = [
  "title",
  "description",
  "default",
  "deprecated",
  "readOnly",
  "writeOnly",
  "examples"
];
metadata$1.contentVocabulary = [
  "contentMediaType",
  "contentEncoding",
  "contentSchema"
];
Object.defineProperty(draft2020, "__esModule", { value: true });
const core_1 = core$3;
const validation_1 = validation$2;
const applicator_1 = applicator$1;
const dynamic_1 = dynamic$1;
const next_1 = next$1;
const unevaluated_1 = unevaluated$2;
const format_1 = format$3;
const metadata_1 = metadata$1;
const draft2020Vocabularies = [
  dynamic_1.default,
  core_1.default,
  validation_1.default,
  (0, applicator_1.default)(true),
  format_1.default,
  metadata_1.metadataVocabulary,
  metadata_1.contentVocabulary,
  next_1.default,
  unevaluated_1.default
];
draft2020.default = draft2020Vocabularies;
var discriminator = {};
var types = {};
Object.defineProperty(types, "__esModule", { value: true });
types.DiscrError = void 0;
var DiscrError;
(function(DiscrError2) {
  DiscrError2["Tag"] = "tag";
  DiscrError2["Mapping"] = "mapping";
})(DiscrError || (types.DiscrError = DiscrError = {}));
Object.defineProperty(discriminator, "__esModule", { value: true });
const codegen_1 = codegen;
const types_1 = types;
const compile_1 = compile;
const ref_error_1 = ref_error;
const util_1 = util;
const error = {
  message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
  params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
};
const def = {
  keyword: "discriminator",
  type: "object",
  schemaType: "object",
  error,
  code(cxt) {
    const { gen, data, schema, parentSchema, it } = cxt;
    const { oneOf: oneOf2 } = parentSchema;
    if (!it.opts.discriminator) {
      throw new Error("discriminator: requires discriminator option");
    }
    const tagName = schema.propertyName;
    if (typeof tagName != "string")
      throw new Error("discriminator: requires propertyName");
    if (schema.mapping)
      throw new Error("discriminator: mapping is not supported");
    if (!oneOf2)
      throw new Error("discriminator: requires oneOf keyword");
    const valid = gen.let("valid", false);
    const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
    gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
    cxt.ok(valid);
    function validateMapping() {
      const mapping = getMapping();
      gen.if(false);
      for (const tagValue in mapping) {
        gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
        gen.assign(valid, applyTagSchema(mapping[tagValue]));
      }
      gen.else();
      cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
      gen.endIf();
    }
    function applyTagSchema(schemaProp) {
      const _valid = gen.name("valid");
      const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
      cxt.mergeEvaluated(schCxt, codegen_1.Name);
      return _valid;
    }
    function getMapping() {
      var _a;
      const oneOfMapping = {};
      const topRequired = hasRequired(parentSchema);
      let tagRequired = true;
      for (let i = 0; i < oneOf2.length; i++) {
        let sch = oneOf2[i];
        if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
          const ref2 = sch.$ref;
          sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref2);
          if (sch instanceof compile_1.SchemaEnv)
            sch = sch.schema;
          if (sch === void 0)
            throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref2);
        }
        const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
        if (typeof propSch != "object") {
          throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
        }
        tagRequired = tagRequired && (topRequired || hasRequired(sch));
        addMappings(propSch, i);
      }
      if (!tagRequired)
        throw new Error(`discriminator: "${tagName}" must be required`);
      return oneOfMapping;
      function hasRequired({ required: required2 }) {
        return Array.isArray(required2) && required2.includes(tagName);
      }
      function addMappings(sch, i) {
        if (sch.const) {
          addMapping(sch.const, i);
        } else if (sch.enum) {
          for (const tagValue of sch.enum) {
            addMapping(tagValue, i);
          }
        } else {
          throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
        }
      }
      function addMapping(tagValue, i) {
        if (typeof tagValue != "string" || tagValue in oneOfMapping) {
          throw new Error(`discriminator: "${tagName}" values must be unique strings`);
        }
        oneOfMapping[tagValue] = i;
      }
    }
  }
};
discriminator.default = def;
var jsonSchema202012 = {};
const $schema$7 = "https://json-schema.org/draft/2020-12/schema";
const $id$7 = "https://json-schema.org/draft/2020-12/schema";
const $vocabulary$7 = {
  "https://json-schema.org/draft/2020-12/vocab/core": true,
  "https://json-schema.org/draft/2020-12/vocab/applicator": true,
  "https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
  "https://json-schema.org/draft/2020-12/vocab/validation": true,
  "https://json-schema.org/draft/2020-12/vocab/meta-data": true,
  "https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
  "https://json-schema.org/draft/2020-12/vocab/content": true
};
const $dynamicAnchor$7 = "meta";
const title$7 = "Core and Validation specifications meta-schema";
const allOf = [
  {
    $ref: "meta/core"
  },
  {
    $ref: "meta/applicator"
  },
  {
    $ref: "meta/unevaluated"
  },
  {
    $ref: "meta/validation"
  },
  {
    $ref: "meta/meta-data"
  },
  {
    $ref: "meta/format-annotation"
  },
  {
    $ref: "meta/content"
  }
];
const type$7 = [
  "object",
  "boolean"
];
const $comment = "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.";
const properties$7 = {
  definitions: {
    $comment: '"definitions" has been replaced by "$defs".',
    type: "object",
    additionalProperties: {
      $dynamicRef: "#meta"
    },
    deprecated: true,
    "default": {}
  },
  dependencies: {
    $comment: '"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.',
    type: "object",
    additionalProperties: {
      anyOf: [
        {
          $dynamicRef: "#meta"
        },
        {
          $ref: "meta/validation#/$defs/stringArray"
        }
      ]
    },
    deprecated: true,
    "default": {}
  },
  $recursiveAnchor: {
    $comment: '"$recursiveAnchor" has been replaced by "$dynamicAnchor".',
    $ref: "meta/core#/$defs/anchorString",
    deprecated: true
  },
  $recursiveRef: {
    $comment: '"$recursiveRef" has been replaced by "$dynamicRef".',
    $ref: "meta/core#/$defs/uriReferenceString",
    deprecated: true
  }
};
const require$$0 = {
  $schema: $schema$7,
  $id: $id$7,
  $vocabulary: $vocabulary$7,
  $dynamicAnchor: $dynamicAnchor$7,
  title: title$7,
  allOf,
  type: type$7,
  $comment,
  properties: properties$7
};
const $schema$6 = "https://json-schema.org/draft/2020-12/schema";
const $id$6 = "https://json-schema.org/draft/2020-12/meta/applicator";
const $vocabulary$6 = {
  "https://json-schema.org/draft/2020-12/vocab/applicator": true
};
const $dynamicAnchor$6 = "meta";
const title$6 = "Applicator vocabulary meta-schema";
const type$6 = [
  "object",
  "boolean"
];
const properties$6 = {
  prefixItems: {
    $ref: "#/$defs/schemaArray"
  },
  items: {
    $dynamicRef: "#meta"
  },
  contains: {
    $dynamicRef: "#meta"
  },
  additionalProperties: {
    $dynamicRef: "#meta"
  },
  properties: {
    type: "object",
    additionalProperties: {
      $dynamicRef: "#meta"
    },
    "default": {}
  },
  patternProperties: {
    type: "object",
    additionalProperties: {
      $dynamicRef: "#meta"
    },
    propertyNames: {
      format: "regex"
    },
    "default": {}
  },
  dependentSchemas: {
    type: "object",
    additionalProperties: {
      $dynamicRef: "#meta"
    },
    "default": {}
  },
  propertyNames: {
    $dynamicRef: "#meta"
  },
  "if": {
    $dynamicRef: "#meta"
  },
  then: {
    $dynamicRef: "#meta"
  },
  "else": {
    $dynamicRef: "#meta"
  },
  allOf: {
    $ref: "#/$defs/schemaArray"
  },
  anyOf: {
    $ref: "#/$defs/schemaArray"
  },
  oneOf: {
    $ref: "#/$defs/schemaArray"
  },
  not: {
    $dynamicRef: "#meta"
  }
};
const $defs$2 = {
  schemaArray: {
    type: "array",
    minItems: 1,
    items: {
      $dynamicRef: "#meta"
    }
  }
};
const require$$1 = {
  $schema: $schema$6,
  $id: $id$6,
  $vocabulary: $vocabulary$6,
  $dynamicAnchor: $dynamicAnchor$6,
  title: title$6,
  type: type$6,
  properties: properties$6,
  $defs: $defs$2
};
const $schema$5 = "https://json-schema.org/draft/2020-12/schema";
const $id$5 = "https://json-schema.org/draft/2020-12/meta/unevaluated";
const $vocabulary$5 = {
  "https://json-schema.org/draft/2020-12/vocab/unevaluated": true
};
const $dynamicAnchor$5 = "meta";
const title$5 = "Unevaluated applicator vocabulary meta-schema";
const type$5 = [
  "object",
  "boolean"
];
const properties$5 = {
  unevaluatedItems: {
    $dynamicRef: "#meta"
  },
  unevaluatedProperties: {
    $dynamicRef: "#meta"
  }
};
const require$$2 = {
  $schema: $schema$5,
  $id: $id$5,
  $vocabulary: $vocabulary$5,
  $dynamicAnchor: $dynamicAnchor$5,
  title: title$5,
  type: type$5,
  properties: properties$5
};
const $schema$4 = "https://json-schema.org/draft/2020-12/schema";
const $id$4 = "https://json-schema.org/draft/2020-12/meta/content";
const $vocabulary$4 = {
  "https://json-schema.org/draft/2020-12/vocab/content": true
};
const $dynamicAnchor$4 = "meta";
const title$4 = "Content vocabulary meta-schema";
const type$4 = [
  "object",
  "boolean"
];
const properties$4 = {
  contentEncoding: {
    type: "string"
  },
  contentMediaType: {
    type: "string"
  },
  contentSchema: {
    $dynamicRef: "#meta"
  }
};
const require$$3 = {
  $schema: $schema$4,
  $id: $id$4,
  $vocabulary: $vocabulary$4,
  $dynamicAnchor: $dynamicAnchor$4,
  title: title$4,
  type: type$4,
  properties: properties$4
};
const $schema$3 = "https://json-schema.org/draft/2020-12/schema";
const $id$3 = "https://json-schema.org/draft/2020-12/meta/core";
const $vocabulary$3 = {
  "https://json-schema.org/draft/2020-12/vocab/core": true
};
const $dynamicAnchor$3 = "meta";
const title$3 = "Core vocabulary meta-schema";
const type$3 = [
  "object",
  "boolean"
];
const properties$3 = {
  $id: {
    $ref: "#/$defs/uriReferenceString",
    $comment: "Non-empty fragments not allowed.",
    pattern: "^[^#]*#?$"
  },
  $schema: {
    $ref: "#/$defs/uriString"
  },
  $ref: {
    $ref: "#/$defs/uriReferenceString"
  },
  $anchor: {
    $ref: "#/$defs/anchorString"
  },
  $dynamicRef: {
    $ref: "#/$defs/uriReferenceString"
  },
  $dynamicAnchor: {
    $ref: "#/$defs/anchorString"
  },
  $vocabulary: {
    type: "object",
    propertyNames: {
      $ref: "#/$defs/uriString"
    },
    additionalProperties: {
      type: "boolean"
    }
  },
  $comment: {
    type: "string"
  },
  $defs: {
    type: "object",
    additionalProperties: {
      $dynamicRef: "#meta"
    }
  }
};
const $defs$1 = {
  anchorString: {
    type: "string",
    pattern: "^[A-Za-z_][-A-Za-z0-9._]*$"
  },
  uriString: {
    type: "string",
    format: "uri"
  },
  uriReferenceString: {
    type: "string",
    format: "uri-reference"
  }
};
const require$$4 = {
  $schema: $schema$3,
  $id: $id$3,
  $vocabulary: $vocabulary$3,
  $dynamicAnchor: $dynamicAnchor$3,
  title: title$3,
  type: type$3,
  properties: properties$3,
  $defs: $defs$1
};
const $schema$2 = "https://json-schema.org/draft/2020-12/schema";
const $id$2 = "https://json-schema.org/draft/2020-12/meta/format-annotation";
const $vocabulary$2 = {
  "https://json-schema.org/draft/2020-12/vocab/format-annotation": true
};
const $dynamicAnchor$2 = "meta";
const title$2 = "Format vocabulary meta-schema for annotation results";
const type$2 = [
  "object",
  "boolean"
];
const properties$2 = {
  format: {
    type: "string"
  }
};
const require$$5 = {
  $schema: $schema$2,
  $id: $id$2,
  $vocabulary: $vocabulary$2,
  $dynamicAnchor: $dynamicAnchor$2,
  title: title$2,
  type: type$2,
  properties: properties$2
};
const $schema$1 = "https://json-schema.org/draft/2020-12/schema";
const $id$1 = "https://json-schema.org/draft/2020-12/meta/meta-data";
const $vocabulary$1 = {
  "https://json-schema.org/draft/2020-12/vocab/meta-data": true
};
const $dynamicAnchor$1 = "meta";
const title$1 = "Meta-data vocabulary meta-schema";
const type$1 = [
  "object",
  "boolean"
];
const properties$1 = {
  title: {
    type: "string"
  },
  description: {
    type: "string"
  },
  "default": true,
  deprecated: {
    type: "boolean",
    "default": false
  },
  readOnly: {
    type: "boolean",
    "default": false
  },
  writeOnly: {
    type: "boolean",
    "default": false
  },
  examples: {
    type: "array",
    items: true
  }
};
const require$$6 = {
  $schema: $schema$1,
  $id: $id$1,
  $vocabulary: $vocabulary$1,
  $dynamicAnchor: $dynamicAnchor$1,
  title: title$1,
  type: type$1,
  properties: properties$1
};
const $schema = "https://json-schema.org/draft/2020-12/schema";
const $id = "https://json-schema.org/draft/2020-12/meta/validation";
const $vocabulary = {
  "https://json-schema.org/draft/2020-12/vocab/validation": true
};
const $dynamicAnchor = "meta";
const title = "Validation vocabulary meta-schema";
const type = [
  "object",
  "boolean"
];
const properties = {
  type: {
    anyOf: [
      {
        $ref: "#/$defs/simpleTypes"
      },
      {
        type: "array",
        items: {
          $ref: "#/$defs/simpleTypes"
        },
        minItems: 1,
        uniqueItems: true
      }
    ]
  },
  "const": true,
  "enum": {
    type: "array",
    items: true
  },
  multipleOf: {
    type: "number",
    exclusiveMinimum: 0
  },
  maximum: {
    type: "number"
  },
  exclusiveMaximum: {
    type: "number"
  },
  minimum: {
    type: "number"
  },
  exclusiveMinimum: {
    type: "number"
  },
  maxLength: {
    $ref: "#/$defs/nonNegativeInteger"
  },
  minLength: {
    $ref: "#/$defs/nonNegativeIntegerDefault0"
  },
  pattern: {
    type: "string",
    format: "regex"
  },
  maxItems: {
    $ref: "#/$defs/nonNegativeInteger"
  },
  minItems: {
    $ref: "#/$defs/nonNegativeIntegerDefault0"
  },
  uniqueItems: {
    type: "boolean",
    "default": false
  },
  maxContains: {
    $ref: "#/$defs/nonNegativeInteger"
  },
  minContains: {
    $ref: "#/$defs/nonNegativeInteger",
    "default": 1
  },
  maxProperties: {
    $ref: "#/$defs/nonNegativeInteger"
  },
  minProperties: {
    $ref: "#/$defs/nonNegativeIntegerDefault0"
  },
  required: {
    $ref: "#/$defs/stringArray"
  },
  dependentRequired: {
    type: "object",
    additionalProperties: {
      $ref: "#/$defs/stringArray"
    }
  }
};
const $defs = {
  nonNegativeInteger: {
    type: "integer",
    minimum: 0
  },
  nonNegativeIntegerDefault0: {
    $ref: "#/$defs/nonNegativeInteger",
    "default": 0
  },
  simpleTypes: {
    "enum": [
      "array",
      "boolean",
      "integer",
      "null",
      "number",
      "object",
      "string"
    ]
  },
  stringArray: {
    type: "array",
    items: {
      type: "string"
    },
    uniqueItems: true,
    "default": []
  }
};
const require$$7 = {
  $schema,
  $id,
  $vocabulary,
  $dynamicAnchor,
  title,
  type,
  properties,
  $defs
};
Object.defineProperty(jsonSchema202012, "__esModule", { value: true });
const metaSchema = require$$0;
const applicator = require$$1;
const unevaluated = require$$2;
const content = require$$3;
const core$1 = require$$4;
const format = require$$5;
const metadata = require$$6;
const validation = require$$7;
const META_SUPPORT_DATA = ["/properties"];
function addMetaSchema2020($data) {
  [
    metaSchema,
    applicator,
    unevaluated,
    content,
    core$1,
    with$data(this, format),
    metadata,
    with$data(this, validation)
  ].forEach((sch) => this.addMetaSchema(sch, void 0, false));
  return this;
  function with$data(ajv2, sch) {
    return $data ? ajv2.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
  }
}
jsonSchema202012.default = addMetaSchema2020;
(function(module, exports$1) {
  Object.defineProperty(exports$1, "__esModule", { value: true });
  exports$1.MissingRefError = exports$1.ValidationError = exports$1.CodeGen = exports$1.Name = exports$1.nil = exports$1.stringify = exports$1.str = exports$1._ = exports$1.KeywordCxt = exports$1.Ajv2020 = void 0;
  const core_12 = core$4;
  const draft2020_1 = draft2020;
  const discriminator_1 = discriminator;
  const json_schema_2020_12_1 = jsonSchema202012;
  const META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";
  class Ajv2020 extends core_12.default {
    constructor(opts = {}) {
      super({
        ...opts,
        dynamicRef: true,
        next: true,
        unevaluated: true
      });
    }
    _addVocabularies() {
      super._addVocabularies();
      draft2020_1.default.forEach((v) => this.addVocabulary(v));
      if (this.opts.discriminator)
        this.addKeyword(discriminator_1.default);
    }
    _addDefaultMetaSchema() {
      super._addDefaultMetaSchema();
      const { $data, meta } = this.opts;
      if (!meta)
        return;
      json_schema_2020_12_1.default.call(this, $data);
      this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
    }
    defaultMeta() {
      return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
    }
  }
  exports$1.Ajv2020 = Ajv2020;
  module.exports = exports$1 = Ajv2020;
  module.exports.Ajv2020 = Ajv2020;
  Object.defineProperty(exports$1, "__esModule", { value: true });
  exports$1.default = Ajv2020;
  var validate_12 = validate;
  Object.defineProperty(exports$1, "KeywordCxt", { enumerable: true, get: function() {
    return validate_12.KeywordCxt;
  } });
  var codegen_12 = codegen;
  Object.defineProperty(exports$1, "_", { enumerable: true, get: function() {
    return codegen_12._;
  } });
  Object.defineProperty(exports$1, "str", { enumerable: true, get: function() {
    return codegen_12.str;
  } });
  Object.defineProperty(exports$1, "stringify", { enumerable: true, get: function() {
    return codegen_12.stringify;
  } });
  Object.defineProperty(exports$1, "nil", { enumerable: true, get: function() {
    return codegen_12.nil;
  } });
  Object.defineProperty(exports$1, "Name", { enumerable: true, get: function() {
    return codegen_12.Name;
  } });
  Object.defineProperty(exports$1, "CodeGen", { enumerable: true, get: function() {
    return codegen_12.CodeGen;
  } });
  var validation_error_12 = validation_error;
  Object.defineProperty(exports$1, "ValidationError", { enumerable: true, get: function() {
    return validation_error_12.default;
  } });
  var ref_error_12 = ref_error;
  Object.defineProperty(exports$1, "MissingRefError", { enumerable: true, get: function() {
    return ref_error_12.default;
  } });
})(_2020, _2020.exports);
var _2020Exports = _2020.exports;
const ISO_DATE_TIME_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$";
const todayCourseSnapshotSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "TodayCourseSnapshot",
  type: "object",
  additionalProperties: false,
  required: ["version", "generated_at", "date", "student_id", "week_index", "weekday", "courses"],
  properties: {
    version: { type: "integer", const: 1 },
    generated_at: { type: "string", pattern: ISO_DATE_TIME_PATTERN },
    date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    student_id: { type: "string", maxLength: 32 },
    week_index: { type: "integer", minimum: 0, maximum: 60 },
    weekday: { type: "integer", minimum: 1, maximum: 7 },
    courses: {
      type: "array",
      maxItems: 14,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["period_start", "period_end", "time_start", "time_end", "name", "location", "teacher"],
        properties: {
          period_start: { type: "integer", minimum: 1, maximum: 14 },
          period_end: { type: "integer", minimum: 1, maximum: 14 },
          time_start: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          time_end: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
          name: { type: "string", minLength: 1, maxLength: 80 },
          location: { type: "string", maxLength: 80 },
          teacher: { type: "string", maxLength: 80 },
          color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }
        }
      }
    }
  }
};
const ajv = new _2020Exports.Ajv2020({ allErrors: true });
const validateSnapshot = ajv.compile(todayCourseSnapshotSchema);
const MAX_SNAPSHOT_BYTES = 32 * 1024;
class WidgetBridgeError extends Error {
  constructor(code2, message) {
    super(message);
    this.code = code2;
    this.name = "WidgetBridgeError";
  }
}
function isTauriAndroid() {
  if (!isTauriRuntime()) return false;
  const ua = String(globalThis?.navigator?.userAgent || "").toLowerCase();
  return ua.includes("android");
}
function createTauriAndroidBridge() {
  return {
    async writeSnapshot(options) {
      const json = JSON.stringify(options.snapshot);
      await invokeNative$1("write_widget_snapshot", { snapshotJson: json });
    },
    async writeElectricity(options) {
      await invokeNative$1("write_electricity_snapshot", { json: JSON.stringify(options.data) });
    },
    async writeExam(options) {
      await invokeNative$1("write_exam_snapshot", { json: JSON.stringify(options.data) });
    },
    async writeThemeColor(options) {
      await invokeNative$1("write_widget_theme_color", { color: options.color });
    },
    async clearSnapshot() {
      await invokeNative$1("clear_widget_snapshot");
    },
    async requestRefresh() {
    },
    async getCapabilities() {
      return { platform: "android-appwidget", pinned: false };
    }
  };
}
function createNoOpProxy() {
  return {
    writeSnapshot: () => Promise.resolve(),
    writeElectricity: () => Promise.resolve(),
    writeExam: () => Promise.resolve(),
    writeThemeColor: () => Promise.resolve(),
    clearSnapshot: () => Promise.resolve(),
    requestRefresh: () => Promise.resolve(),
    getCapabilities: () => Promise.resolve({ platform: "unavailable", pinned: false })
  };
}
let _bridge = null;
let _debugLogged = false;
let _capacitorWidget = null;
function getCapacitorWidgetPlugin() {
  if (_capacitorWidget) return _capacitorWidget;
  const cap = typeof window === "undefined" ? void 0 : window.Capacitor;
  const globalPlugin = cap?.Plugins?.MiniHbutWidget;
  if (globalPlugin) {
    _capacitorWidget = globalPlugin;
    return _capacitorWidget;
  }
  _capacitorWidget = registerPlugin("MiniHbutWidget");
  return _capacitorWidget;
}
function getWidgetBridge() {
  if (_bridge) return _bridge;
  if (isTauriAndroid()) {
    if (!_debugLogged) {
      console.debug("[widget] Tauri Android detected, using native SharedPreferences bridge");
      _debugLogged = true;
    }
    _bridge = createTauriAndroidBridge();
    return _bridge;
  }
  if (isCapacitorRuntime()) {
    if (!_debugLogged) {
      console.debug("[widget] Capacitor detected, using MiniHbutWidget plugin");
      _debugLogged = true;
    }
    _bridge = getCapacitorWidgetPlugin();
    return _bridge;
  }
  if (!_debugLogged) {
    console.debug("[widget] Non-mobile environment, widget bridge is no-op");
    _debugLogged = true;
  }
  _bridge = createNoOpProxy();
  return _bridge;
}
async function writeSnapshot(snapshot) {
  const valid = validateSnapshot(snapshot);
  if (!valid) {
    const errors2 = validateSnapshot.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ");
    throw new WidgetBridgeError("INVALID_SNAPSHOT", `Schema validation failed: ${errors2}`);
  }
  const json = JSON.stringify(snapshot);
  const byteLength = new TextEncoder().encode(json).length;
  if (byteLength > MAX_SNAPSHOT_BYTES) {
    throw new WidgetBridgeError(
      "SNAPSHOT_TOO_LARGE",
      `Snapshot size ${byteLength} bytes exceeds limit of ${MAX_SNAPSHOT_BYTES} bytes`
    );
  }
  await getWidgetBridge().writeSnapshot({ snapshot });
}
async function clearSnapshot() {
  await getWidgetBridge().clearSnapshot();
  await requestRefresh();
}
async function writeElectricitySnapshot(data) {
  await getWidgetBridge().writeElectricity({ data });
  await requestRefresh();
}
async function writeExamSnapshot(data) {
  await getWidgetBridge().writeExam({ data });
  await requestRefresh();
}
async function writeWidgetThemeColor(color) {
  await getWidgetBridge().writeThemeColor({ color });
}
async function requestRefresh() {
  await getWidgetBridge().requestRefresh();
}
const NON_RETRYABLE_CODES = /* @__PURE__ */ new Set(["SNAPSHOT_TOO_LARGE", "INVALID_SNAPSHOT"]);
const RETRY_DELAYS = [250, 1e3, 4e3];
async function writeSnapshotWithRetry(snapshot) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      await writeSnapshot(snapshot);
      await requestRefresh();
      return;
    } catch (err) {
      lastError = err;
      const code2 = err?.code;
      if (code2 && NON_RETRYABLE_CODES.has(code2)) {
        throw err;
      }
      if (attempt === RETRY_DELAYS.length) break;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[widget] writeSnapshot retry ${attempt + 1}/3: ${message}`);
      pushDebugLog("widget", `writeSnapshot retry ${attempt + 1}/3: ${message}`, "warn", { code: code2 });
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
  throw lastError;
}
const DEFAULT_TARGET_VIEW = "notifications";
const ALLOWED_NOTIFICATION_TARGETS = /* @__PURE__ */ new Set([
  "notifications",
  "schedule",
  "grades",
  "exams",
  "electricity",
  "classroom",
  "home"
]);
const toSafeText = (value) => String(value ?? "").trim();
const readPayloadObject = (payload) => {
  if (!payload || typeof payload !== "object") return {};
  return payload;
};
const pickViewCandidate = (payload) => {
  const root = readPayloadObject(payload);
  const notification = readPayloadObject(root.notification);
  const extra = readPayloadObject(notification.extra ?? root.extra);
  return toSafeText(
    extra.view ?? extra.targetView ?? extra.target_view ?? notification.view ?? root.view ?? root.targetView ?? root.target_view
  );
};
const normalizeNotificationTargetView = (value) => {
  const candidate = toSafeText(value).replace(/^#\/?/, "").replace(/^\/+/, "").split(/[/?#]/)[0];
  if (!candidate) return DEFAULT_TARGET_VIEW;
  if (!ALLOWED_NOTIFICATION_TARGETS.has(candidate)) return DEFAULT_TARGET_VIEW;
  if (!isViewAllowed(candidate)) return DEFAULT_TARGET_VIEW;
  return candidate;
};
const resolveNotificationActionTarget = (payload) => ({
  view: normalizeNotificationTargetView(pickViewCandidate(payload))
});
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (typeof state === "function" ? receiver !== state || true : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return state.set(receiver, value), value;
}
typeof SuppressedError === "function" ? SuppressedError : function(error2, suppressed, message) {
  var e = new Error(message);
  return e.name = "SuppressedError", e.error = error2, e.suppressed = suppressed, e;
};
var _Channel_onmessage, _Channel_nextMessageIndex, _Channel_pendingMessages, _Channel_messageEndIndex, _Resource_rid;
const SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
function transformCallback(callback, once2 = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once2);
}
class Channel {
  constructor(onmessage) {
    _Channel_onmessage.set(this, void 0);
    _Channel_nextMessageIndex.set(this, 0);
    _Channel_pendingMessages.set(this, []);
    _Channel_messageEndIndex.set(this, void 0);
    __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
    }));
    this.id = transformCallback((rawMessage) => {
      const index2 = rawMessage.index;
      if ("end" in rawMessage) {
        if (index2 == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
          this.cleanupCallback();
        } else {
          __classPrivateFieldSet(this, _Channel_messageEndIndex, index2);
        }
        return;
      }
      const message = rawMessage.message;
      if (index2 == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
        __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
        __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1);
        while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
          const message2 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
          __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message2);
          delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
          __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1);
        }
        if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
          this.cleanupCallback();
        }
      } else {
        __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index2] = message;
      }
    });
  }
  cleanupCallback() {
    window.__TAURI_INTERNALS__.unregisterCallback(this.id);
  }
  set onmessage(handler) {
    __classPrivateFieldSet(this, _Channel_onmessage, handler);
  }
  get onmessage() {
    return __classPrivateFieldGet(this, _Channel_onmessage, "f");
  }
  [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), SERIALIZE_TO_IPC_FN)]() {
    return `__CHANNEL__:${this.id}`;
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}
class PluginListener {
  constructor(plugin, event2, channelId) {
    this.plugin = plugin;
    this.event = event2;
    this.channelId = channelId;
  }
  async unregister() {
    return invoke(`plugin:${this.plugin}|remove_listener`, {
      event: this.event,
      channelId: this.channelId
    });
  }
}
async function addPluginListener(plugin, event2, cb) {
  const handler = new Channel(cb);
  try {
    await invoke(`plugin:${plugin}|register_listener`, {
      event: event2,
      handler
    });
    return new PluginListener(plugin, event2, handler.id);
  } catch {
    await invoke(`plugin:${plugin}|registerListener`, { event: event2, handler });
    return new PluginListener(plugin, event2, handler.id);
  }
}
async function checkPermissions(plugin) {
  return invoke(`plugin:${plugin}|check_permissions`);
}
async function requestPermissions(plugin) {
  return invoke(`plugin:${plugin}|request_permissions`);
}
async function invoke(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
function convertFileSrc(filePath, protocol = "asset") {
  return window.__TAURI_INTERNALS__.convertFileSrc(filePath, protocol);
}
class Resource {
  get rid() {
    return __classPrivateFieldGet(this, _Resource_rid, "f");
  }
  constructor(rid) {
    _Resource_rid.set(this, void 0);
    __classPrivateFieldSet(this, _Resource_rid, rid);
  }
  /**
   * Destroys and cleans up this resource from memory.
   * **You should not call any method on this object anymore and should drop any reference to it.**
   */
  async close() {
    return invoke("plugin:resources|close", {
      rid: this.rid
    });
  }
}
_Resource_rid = /* @__PURE__ */ new WeakMap();
function isTauri() {
  return !!(globalThis || window).isTauri;
}
const core = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Channel,
  PluginListener,
  Resource,
  SERIALIZE_TO_IPC_FN,
  addPluginListener,
  checkPermissions,
  convertFileSrc,
  invoke,
  isTauri,
  requestPermissions,
  transformCallback
}, Symbol.toStringTag, { value: "Module" }));
class LogicalSize {
  constructor(...args) {
    this.type = "Logical";
    if (args.length === 1) {
      if ("Logical" in args[0]) {
        this.width = args[0].Logical.width;
        this.height = args[0].Logical.height;
      } else {
        this.width = args[0].width;
        this.height = args[0].height;
      }
    } else {
      this.width = args[0];
      this.height = args[1];
    }
  }
  /**
   * Converts the logical size to a physical one.
   * @example
   * ```typescript
   * import { LogicalSize } from '@tauri-apps/api/dpi';
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   *
   * const appWindow = getCurrentWindow();
   * const factor = await appWindow.scaleFactor();
   * const size = new LogicalSize(400, 500);
   * const physical = size.toPhysical(factor);
   * ```
   *
   * @since 2.0.0
   */
  toPhysical(scaleFactor) {
    return new PhysicalSize(this.width * scaleFactor, this.height * scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      width: this.width,
      height: this.height
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}
class PhysicalSize {
  constructor(...args) {
    this.type = "Physical";
    if (args.length === 1) {
      if ("Physical" in args[0]) {
        this.width = args[0].Physical.width;
        this.height = args[0].Physical.height;
      } else {
        this.width = args[0].width;
        this.height = args[0].height;
      }
    } else {
      this.width = args[0];
      this.height = args[1];
    }
  }
  /**
   * Converts the physical size to a logical one.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const appWindow = getCurrentWindow();
   * const factor = await appWindow.scaleFactor();
   * const size = await appWindow.innerSize(); // PhysicalSize
   * const logical = size.toLogical(factor);
   * ```
   */
  toLogical(scaleFactor) {
    return new LogicalSize(this.width / scaleFactor, this.height / scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      width: this.width,
      height: this.height
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}
class Size {
  constructor(size2) {
    this.size = size2;
  }
  toLogical(scaleFactor) {
    return this.size instanceof LogicalSize ? this.size : this.size.toLogical(scaleFactor);
  }
  toPhysical(scaleFactor) {
    return this.size instanceof PhysicalSize ? this.size : this.size.toPhysical(scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      [`${this.size.type}`]: {
        width: this.size.width,
        height: this.size.height
      }
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}
class LogicalPosition {
  constructor(...args) {
    this.type = "Logical";
    if (args.length === 1) {
      if ("Logical" in args[0]) {
        this.x = args[0].Logical.x;
        this.y = args[0].Logical.y;
      } else {
        this.x = args[0].x;
        this.y = args[0].y;
      }
    } else {
      this.x = args[0];
      this.y = args[1];
    }
  }
  /**
   * Converts the logical position to a physical one.
   * @example
   * ```typescript
   * import { LogicalPosition } from '@tauri-apps/api/dpi';
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   *
   * const appWindow = getCurrentWindow();
   * const factor = await appWindow.scaleFactor();
   * const position = new LogicalPosition(400, 500);
   * const physical = position.toPhysical(factor);
   * ```
   *
   * @since 2.0.0
   */
  toPhysical(scaleFactor) {
    return new PhysicalPosition(this.x * scaleFactor, this.y * scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      x: this.x,
      y: this.y
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}
class PhysicalPosition {
  constructor(...args) {
    this.type = "Physical";
    if (args.length === 1) {
      if ("Physical" in args[0]) {
        this.x = args[0].Physical.x;
        this.y = args[0].Physical.y;
      } else {
        this.x = args[0].x;
        this.y = args[0].y;
      }
    } else {
      this.x = args[0];
      this.y = args[1];
    }
  }
  /**
   * Converts the physical position to a logical one.
   * @example
   * ```typescript
   * import { PhysicalPosition } from '@tauri-apps/api/dpi';
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   *
   * const appWindow = getCurrentWindow();
   * const factor = await appWindow.scaleFactor();
   * const position = new PhysicalPosition(400, 500);
   * const physical = position.toLogical(factor);
   * ```
   *
   * @since 2.0.0
   */
  toLogical(scaleFactor) {
    return new LogicalPosition(this.x / scaleFactor, this.y / scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      x: this.x,
      y: this.y
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}
class Position {
  constructor(position) {
    this.position = position;
  }
  toLogical(scaleFactor) {
    return this.position instanceof LogicalPosition ? this.position : this.position.toLogical(scaleFactor);
  }
  toPhysical(scaleFactor) {
    return this.position instanceof PhysicalPosition ? this.position : this.position.toPhysical(scaleFactor);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return {
      [`${this.position.type}`]: {
        x: this.position.x,
        y: this.position.y
      }
    };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}
var TauriEvent;
(function(TauriEvent2) {
  TauriEvent2["WINDOW_RESIZED"] = "tauri://resize";
  TauriEvent2["WINDOW_MOVED"] = "tauri://move";
  TauriEvent2["WINDOW_CLOSE_REQUESTED"] = "tauri://close-requested";
  TauriEvent2["WINDOW_DESTROYED"] = "tauri://destroyed";
  TauriEvent2["WINDOW_FOCUS"] = "tauri://focus";
  TauriEvent2["WINDOW_BLUR"] = "tauri://blur";
  TauriEvent2["WINDOW_SCALE_FACTOR_CHANGED"] = "tauri://scale-change";
  TauriEvent2["WINDOW_THEME_CHANGED"] = "tauri://theme-changed";
  TauriEvent2["WINDOW_CREATED"] = "tauri://window-created";
  TauriEvent2["WINDOW_SUSPENDED"] = "tauri://suspended";
  TauriEvent2["WINDOW_RESUMED"] = "tauri://resumed";
  TauriEvent2["WEBVIEW_CREATED"] = "tauri://webview-created";
  TauriEvent2["DRAG_ENTER"] = "tauri://drag-enter";
  TauriEvent2["DRAG_OVER"] = "tauri://drag-over";
  TauriEvent2["DRAG_DROP"] = "tauri://drag-drop";
  TauriEvent2["DRAG_LEAVE"] = "tauri://drag-leave";
})(TauriEvent || (TauriEvent = {}));
async function _unlisten(event2, eventId) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(event2, eventId);
  await invoke("plugin:event|unlisten", {
    event: event2,
    eventId
  });
}
async function listen(event2, handler, options) {
  var _a;
  const target = typeof (options === null || options === void 0 ? void 0 : options.target) === "string" ? { kind: "AnyLabel", label: options.target } : (_a = options === null || options === void 0 ? void 0 : options.target) !== null && _a !== void 0 ? _a : { kind: "Any" };
  return invoke("plugin:event|listen", {
    event: event2,
    target,
    handler: transformCallback(handler)
  }).then((eventId) => {
    return async () => _unlisten(event2, eventId);
  });
}
async function once(event2, handler, options) {
  return listen(event2, (eventData) => {
    void _unlisten(event2, eventData.id);
    handler(eventData);
  }, options);
}
async function emit(event2, payload) {
  await invoke("plugin:event|emit", {
    event: event2,
    payload
  });
}
async function emitTo(target, event2, payload) {
  const eventTarget = typeof target === "string" ? { kind: "AnyLabel", label: target } : target;
  await invoke("plugin:event|emit_to", {
    target: eventTarget,
    event: event2,
    payload
  });
}
const event = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  get TauriEvent() {
    return TauriEvent;
  },
  emit,
  emitTo,
  listen,
  once
}, Symbol.toStringTag, { value: "Module" }));
class Image extends Resource {
  /**
   * Creates an Image from a resource ID. For internal use only.
   *
   * @ignore
   */
  constructor(rid) {
    super(rid);
  }
  /** Creates a new Image using RGBA data, in row-major order from top to bottom, and with specified width and height. */
  static async new(rgba, width, height) {
    return invoke("plugin:image|new", {
      rgba: transformImage(rgba),
      width,
      height
    }).then((rid) => new Image(rid));
  }
  /**
   * Creates a new image using the provided bytes by inferring the file format.
   * If the format is known, prefer [@link Image.fromPngBytes] or [@link Image.fromIcoBytes].
   *
   * Only `ico` and `png` are supported (based on activated feature flag).
   *
   * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
   * To enable it, change your Cargo.toml file:
   * ```toml
   * [dependencies]
   * tauri = { version = "...", features = ["...", "image-png"] }
   * ```
   */
  static async fromBytes(bytes) {
    return invoke("plugin:image|from_bytes", {
      bytes: transformImage(bytes)
    }).then((rid) => new Image(rid));
  }
  /**
   * Creates a new image using the provided path.
   *
   * Only `ico` and `png` are supported (based on activated feature flag).
   *
   * Note that you need the `image-ico` or `image-png` Cargo features to use this API.
   * To enable it, change your Cargo.toml file:
   * ```toml
   * [dependencies]
   * tauri = { version = "...", features = ["...", "image-png"] }
   * ```
   */
  static async fromPath(path) {
    return invoke("plugin:image|from_path", { path }).then((rid) => new Image(rid));
  }
  /** Returns the RGBA data for this image, in row-major order from top to bottom.  */
  async rgba() {
    return invoke("plugin:image|rgba", {
      rid: this.rid
    }).then((buffer) => new Uint8Array(buffer));
  }
  /** Returns the size of this image.  */
  async size() {
    return invoke("plugin:image|size", { rid: this.rid });
  }
}
function transformImage(image) {
  const ret = image == null ? null : typeof image === "string" ? image : image instanceof Image ? image.rid : image;
  return ret;
}
var UserAttentionType;
(function(UserAttentionType2) {
  UserAttentionType2[UserAttentionType2["Critical"] = 1] = "Critical";
  UserAttentionType2[UserAttentionType2["Informational"] = 2] = "Informational";
})(UserAttentionType || (UserAttentionType = {}));
class CloseRequestedEvent {
  constructor(event2) {
    this._preventDefault = false;
    this.event = event2.event;
    this.id = event2.id;
  }
  preventDefault() {
    this._preventDefault = true;
  }
  isPreventDefault() {
    return this._preventDefault;
  }
}
var ProgressBarStatus;
(function(ProgressBarStatus2) {
  ProgressBarStatus2["None"] = "none";
  ProgressBarStatus2["Normal"] = "normal";
  ProgressBarStatus2["Indeterminate"] = "indeterminate";
  ProgressBarStatus2["Paused"] = "paused";
  ProgressBarStatus2["Error"] = "error";
})(ProgressBarStatus || (ProgressBarStatus = {}));
function getCurrentWindow() {
  return new Window(window.__TAURI_INTERNALS__.metadata.currentWindow.label, {
    // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
    skip: true
  });
}
async function getAllWindows() {
  return invoke("plugin:window|get_all_windows").then((windows) => windows.map((w) => new Window(w, {
    // @ts-expect-error `skip` is not defined in the public API but it is handled by the constructor
    skip: true
  })));
}
const localTauriEvents = ["tauri://created", "tauri://error"];
class Window {
  /**
   * Creates a new Window.
   * @example
   * ```typescript
   * import { Window } from '@tauri-apps/api/window';
   * const appWindow = new Window('my-label');
   * appWindow.once('tauri://created', function () {
   *  // window successfully created
   * });
   * appWindow.once('tauri://error', function (e) {
   *  // an error happened creating the window
   * });
   * ```
   *
   * @param label The unique window label. Must be alphanumeric: `a-zA-Z-/:_`.
   * @returns The {@link Window} instance to communicate with the window.
   */
  constructor(label, options = {}) {
    var _a;
    this.label = label;
    this.listeners = /* @__PURE__ */ Object.create(null);
    if (!(options === null || options === void 0 ? void 0 : options.skip)) {
      invoke("plugin:window|create", {
        options: {
          ...options,
          parent: typeof options.parent === "string" ? options.parent : (_a = options.parent) === null || _a === void 0 ? void 0 : _a.label,
          label
        }
      }).then(async () => this.emit("tauri://created")).catch(async (e) => this.emit("tauri://error", e));
    }
  }
  /**
   * Gets the Window associated with the given label.
   * @example
   * ```typescript
   * import { Window } from '@tauri-apps/api/window';
   * const mainWindow = Window.getByLabel('main');
   * ```
   *
   * @param label The window label.
   * @returns The Window instance to communicate with the window or null if the window doesn't exist.
   */
  static async getByLabel(label) {
    var _a;
    return (_a = (await getAllWindows()).find((w) => w.label === label)) !== null && _a !== void 0 ? _a : null;
  }
  /**
   * Get an instance of `Window` for the current window.
   */
  static getCurrent() {
    return getCurrentWindow();
  }
  /**
   * Gets a list of instances of `Window` for all available windows.
   */
  static async getAll() {
    return getAllWindows();
  }
  /**
   *  Gets the focused window.
   * @example
   * ```typescript
   * import { Window } from '@tauri-apps/api/window';
   * const focusedWindow = Window.getFocusedWindow();
   * ```
   *
   * @returns The Window instance or `undefined` if there is not any focused window.
   */
  static async getFocusedWindow() {
    for (const w of await getAllWindows()) {
      if (await w.isFocused()) {
        return w;
      }
    }
    return null;
  }
  /**
   * Listen to an emitted event on this window.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const unlisten = await getCurrentWindow().listen<string>('state-changed', (event) => {
   *   console.log(`Got error: ${payload}`);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param handler Event handler.
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async listen(event2, handler) {
    if (this._handleTauriEvent(event2, handler)) {
      return () => {
        const listeners2 = this.listeners[event2];
        listeners2.splice(listeners2.indexOf(handler), 1);
      };
    }
    return listen(event2, handler, {
      target: { kind: "Window", label: this.label }
    });
  }
  /**
   * Listen to an emitted event on this window only once.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const unlisten = await getCurrentWindow().once<null>('initialized', (event) => {
   *   console.log(`Window initialized!`);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param handler Event handler.
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async once(event2, handler) {
    if (this._handleTauriEvent(event2, handler)) {
      return () => {
        const listeners2 = this.listeners[event2];
        listeners2.splice(listeners2.indexOf(handler), 1);
      };
    }
    return once(event2, handler, {
      target: { kind: "Window", label: this.label }
    });
  }
  /**
   * Emits an event to all {@link EventTarget|targets}.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().emit('window-loaded', { loggedIn: true, token: 'authToken' });
   * ```
   *
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param payload Event payload.
   */
  async emit(event2, payload) {
    if (localTauriEvents.includes(event2)) {
      for (const handler of this.listeners[event2] || []) {
        handler({
          event: event2,
          id: -1,
          payload
        });
      }
      return;
    }
    return emit(event2, payload);
  }
  /**
   * Emits an event to all {@link EventTarget|targets} matching the given target.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().emit('main', 'window-loaded', { loggedIn: true, token: 'authToken' });
   * ```
   * @param target Label of the target Window/Webview/WebviewWindow or raw {@link EventTarget} object.
   * @param event Event name. Must include only alphanumeric characters, `-`, `/`, `:` and `_`.
   * @param payload Event payload.
   */
  async emitTo(target, event2, payload) {
    if (localTauriEvents.includes(event2)) {
      for (const handler of this.listeners[event2] || []) {
        handler({
          event: event2,
          id: -1,
          payload
        });
      }
      return;
    }
    return emitTo(target, event2, payload);
  }
  /** @ignore */
  _handleTauriEvent(event2, handler) {
    if (localTauriEvents.includes(event2)) {
      if (!(event2 in this.listeners)) {
        this.listeners[event2] = [handler];
      } else {
        this.listeners[event2].push(handler);
      }
      return true;
    }
    return false;
  }
  // Getters
  /**
   * The scale factor that can be used to map physical pixels to logical pixels.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const factor = await getCurrentWindow().scaleFactor();
   * ```
   *
   * @returns The window's monitor scale factor.
   */
  async scaleFactor() {
    return invoke("plugin:window|scale_factor", {
      label: this.label
    });
  }
  /**
   * The position of the top-left hand corner of the window's client area relative to the top-left hand corner of the desktop.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const position = await getCurrentWindow().innerPosition();
   * ```
   *
   * @returns The window's inner position.
   */
  async innerPosition() {
    return invoke("plugin:window|inner_position", {
      label: this.label
    }).then((p) => new PhysicalPosition(p));
  }
  /**
   * The position of the top-left hand corner of the window relative to the top-left hand corner of the desktop.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const position = await getCurrentWindow().outerPosition();
   * ```
   *
   * @returns The window's outer position.
   */
  async outerPosition() {
    return invoke("plugin:window|outer_position", {
      label: this.label
    }).then((p) => new PhysicalPosition(p));
  }
  /**
   * The physical size of the window's client area.
   * The client area is the content of the window, excluding the title bar and borders.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const size = await getCurrentWindow().innerSize();
   * ```
   *
   * @returns The window's inner size.
   */
  async innerSize() {
    return invoke("plugin:window|inner_size", {
      label: this.label
    }).then((s) => new PhysicalSize(s));
  }
  /**
   * The physical size of the entire window.
   * These dimensions include the title bar and borders. If you don't want that (and you usually don't), use inner_size instead.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const size = await getCurrentWindow().outerSize();
   * ```
   *
   * @returns The window's outer size.
   */
  async outerSize() {
    return invoke("plugin:window|outer_size", {
      label: this.label
    }).then((s) => new PhysicalSize(s));
  }
  /**
   * Gets the window's current fullscreen state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const fullscreen = await getCurrentWindow().isFullscreen();
   * ```
   *
   * @returns Whether the window is in fullscreen mode or not.
   */
  async isFullscreen() {
    return invoke("plugin:window|is_fullscreen", {
      label: this.label
    });
  }
  /**
   * Gets the window's current minimized state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const minimized = await getCurrentWindow().isMinimized();
   * ```
   */
  async isMinimized() {
    return invoke("plugin:window|is_minimized", {
      label: this.label
    });
  }
  /**
   * Gets the window's current maximized state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const maximized = await getCurrentWindow().isMaximized();
   * ```
   *
   * @returns Whether the window is maximized or not.
   */
  async isMaximized() {
    return invoke("plugin:window|is_maximized", {
      label: this.label
    });
  }
  /**
   * Gets the window's current focus state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const focused = await getCurrentWindow().isFocused();
   * ```
   *
   * @returns Whether the window is focused or not.
   */
  async isFocused() {
    return invoke("plugin:window|is_focused", {
      label: this.label
    });
  }
  /**
   * Gets the window's current decorated state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const decorated = await getCurrentWindow().isDecorated();
   * ```
   *
   * @returns Whether the window is decorated or not.
   */
  async isDecorated() {
    return invoke("plugin:window|is_decorated", {
      label: this.label
    });
  }
  /**
   * Gets the window's current resizable state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const resizable = await getCurrentWindow().isResizable();
   * ```
   *
   * @returns Whether the window is resizable or not.
   */
  async isResizable() {
    return invoke("plugin:window|is_resizable", {
      label: this.label
    });
  }
  /**
   * Gets the window's native maximize button state.
   *
   * #### Platform-specific
   *
   * - **Linux / iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const maximizable = await getCurrentWindow().isMaximizable();
   * ```
   *
   * @returns Whether the window's native maximize button is enabled or not.
   */
  async isMaximizable() {
    return invoke("plugin:window|is_maximizable", {
      label: this.label
    });
  }
  /**
   * Gets the window's native minimize button state.
   *
   * #### Platform-specific
   *
   * - **Linux / iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const minimizable = await getCurrentWindow().isMinimizable();
   * ```
   *
   * @returns Whether the window's native minimize button is enabled or not.
   */
  async isMinimizable() {
    return invoke("plugin:window|is_minimizable", {
      label: this.label
    });
  }
  /**
   * Gets the window's native close button state.
   *
   * #### Platform-specific
   *
   * - **iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const closable = await getCurrentWindow().isClosable();
   * ```
   *
   * @returns Whether the window's native close button is enabled or not.
   */
  async isClosable() {
    return invoke("plugin:window|is_closable", {
      label: this.label
    });
  }
  /**
   * Gets the window's current visible state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const visible = await getCurrentWindow().isVisible();
   * ```
   *
   * @returns Whether the window is visible or not.
   */
  async isVisible() {
    return invoke("plugin:window|is_visible", {
      label: this.label
    });
  }
  /**
   * Gets the window's current title.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const title = await getCurrentWindow().title();
   * ```
   */
  async title() {
    return invoke("plugin:window|title", {
      label: this.label
    });
  }
  /**
   * Gets the window's current theme.
   *
   * #### Platform-specific
   *
   * - **macOS:** Theme was introduced on macOS 10.14. Returns `light` on macOS 10.13 and below.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const theme = await getCurrentWindow().theme();
   * ```
   *
   * @returns The window theme.
   */
  async theme() {
    return invoke("plugin:window|theme", {
      label: this.label
    });
  }
  /**
   * Whether the window is configured to be always on top of other windows or not.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * const alwaysOnTop = await getCurrentWindow().isAlwaysOnTop();
   * ```
   *
   * @returns Whether the window is visible or not.
   */
  async isAlwaysOnTop() {
    return invoke("plugin:window|is_always_on_top", {
      label: this.label
    });
  }
  async activityName() {
    return invoke("plugin:window|activity_name", {
      label: this.label
    });
  }
  async sceneIdentifier() {
    return invoke("plugin:window|scene_identifier", {
      label: this.label
    });
  }
  // Setters
  /**
   * Centers the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().center();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async center() {
    return invoke("plugin:window|center", {
      label: this.label
    });
  }
  /**
   *  Requests user attention to the window, this has no effect if the application
   * is already focused. How requesting for user attention manifests is platform dependent,
   * see `UserAttentionType` for details.
   *
   * Providing `null` will unset the request for user attention. Unsetting the request for
   * user attention might not be done automatically by the WM when the window receives input.
   *
   * #### Platform-specific
   *
   * - **macOS:** `null` has no effect.
   * - **Linux:** Urgency levels have the same effect.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().requestUserAttention();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async requestUserAttention(requestType) {
    let requestType_ = null;
    if (requestType) {
      if (requestType === UserAttentionType.Critical) {
        requestType_ = { type: "Critical" };
      } else {
        requestType_ = { type: "Informational" };
      }
    }
    return invoke("plugin:window|request_user_attention", {
      label: this.label,
      value: requestType_
    });
  }
  /**
   * Updates the window resizable flag.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setResizable(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setResizable(resizable) {
    return invoke("plugin:window|set_resizable", {
      label: this.label,
      value: resizable
    });
  }
  /**
   * Enable or disable the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setEnabled(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @since 2.0.0
   */
  async setEnabled(enabled) {
    return invoke("plugin:window|set_enabled", {
      label: this.label,
      value: enabled
    });
  }
  /**
   * Whether the window is enabled or disabled.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setEnabled(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @since 2.0.0
   */
  async isEnabled() {
    return invoke("plugin:window|is_enabled", {
      label: this.label
    });
  }
  /**
   * Sets whether the window's native maximize button is enabled or not.
   * If resizable is set to false, this setting is ignored.
   *
   * #### Platform-specific
   *
   * - **macOS:** Disables the "zoom" button in the window titlebar, which is also used to enter fullscreen mode.
   * - **Linux / iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setMaximizable(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setMaximizable(maximizable) {
    return invoke("plugin:window|set_maximizable", {
      label: this.label,
      value: maximizable
    });
  }
  /**
   * Sets whether the window's native minimize button is enabled or not.
   *
   * #### Platform-specific
   *
   * - **Linux / iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setMinimizable(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setMinimizable(minimizable) {
    return invoke("plugin:window|set_minimizable", {
      label: this.label,
      value: minimizable
    });
  }
  /**
   * Sets whether the window's native close button is enabled or not.
   *
   * #### Platform-specific
   *
   * - **Linux:** GTK+ will do its best to convince the window manager not to show a close button. Depending on the system, this function may not have any effect when called on a window that is already visible
   * - **iOS / Android:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setClosable(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setClosable(closable) {
    return invoke("plugin:window|set_closable", {
      label: this.label,
      value: closable
    });
  }
  /**
   * Sets the window title.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setTitle('Tauri');
   * ```
   *
   * @param title The new title
   * @returns A promise indicating the success or failure of the operation.
   */
  async setTitle(title2) {
    return invoke("plugin:window|set_title", {
      label: this.label,
      value: title2
    });
  }
  /**
   * Maximizes the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().maximize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async maximize() {
    return invoke("plugin:window|maximize", {
      label: this.label
    });
  }
  /**
   * Unmaximizes the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().unmaximize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async unmaximize() {
    return invoke("plugin:window|unmaximize", {
      label: this.label
    });
  }
  /**
   * Toggles the window maximized state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().toggleMaximize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async toggleMaximize() {
    return invoke("plugin:window|toggle_maximize", {
      label: this.label
    });
  }
  /**
   * Minimizes the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().minimize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async minimize() {
    return invoke("plugin:window|minimize", {
      label: this.label
    });
  }
  /**
   * Unminimizes the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().unminimize();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async unminimize() {
    return invoke("plugin:window|unminimize", {
      label: this.label
    });
  }
  /**
   * Sets the window visibility to true.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().show();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async show() {
    return invoke("plugin:window|show", {
      label: this.label
    });
  }
  /**
   * Sets the window visibility to false.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().hide();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async hide() {
    return invoke("plugin:window|hide", {
      label: this.label
    });
  }
  /**
   * Closes the window.
   *
   * Note this emits a closeRequested event so you can intercept it. To force window close, use {@link Window.destroy}.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().close();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async close() {
    return invoke("plugin:window|close", {
      label: this.label
    });
  }
  /**
   * Destroys the window. Behaves like {@link Window.close} but forces the window close instead of emitting a closeRequested event.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().destroy();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async destroy() {
    return invoke("plugin:window|destroy", {
      label: this.label
    });
  }
  /**
   * Whether the window should have borders and bars.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setDecorations(false);
   * ```
   *
   * @param decorations Whether the window should have borders and bars.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setDecorations(decorations) {
    return invoke("plugin:window|set_decorations", {
      label: this.label,
      value: decorations
    });
  }
  /**
   * Whether or not the window should have shadow.
   *
   * #### Platform-specific
   *
   * - **Windows:**
   *   - `false` has no effect on decorated window, shadows are always ON.
   *   - `true` will make undecorated window have a 1px white border,
   * and on Windows 11, it will have a rounded corners.
   * - **Linux:** Unsupported.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setShadow(false);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setShadow(enable) {
    return invoke("plugin:window|set_shadow", {
      label: this.label,
      value: enable
    });
  }
  /**
   * Set window effects.
   */
  async setEffects(effects) {
    return invoke("plugin:window|set_effects", {
      label: this.label,
      value: effects
    });
  }
  /**
   * Clear any applied effects if possible.
   */
  async clearEffects() {
    return invoke("plugin:window|set_effects", {
      label: this.label,
      value: null
    });
  }
  /**
   * Whether the window should always be on top of other windows.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setAlwaysOnTop(true);
   * ```
   *
   * @param alwaysOnTop Whether the window should always be on top of other windows or not.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setAlwaysOnTop(alwaysOnTop) {
    return invoke("plugin:window|set_always_on_top", {
      label: this.label,
      value: alwaysOnTop
    });
  }
  /**
   * Whether the window should always be below other windows.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setAlwaysOnBottom(true);
   * ```
   *
   * @param alwaysOnBottom Whether the window should always be below other windows or not.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setAlwaysOnBottom(alwaysOnBottom) {
    return invoke("plugin:window|set_always_on_bottom", {
      label: this.label,
      value: alwaysOnBottom
    });
  }
  /**
   * Prevents the window contents from being captured by other apps.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setContentProtected(true);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setContentProtected(protected_) {
    return invoke("plugin:window|set_content_protected", {
      label: this.label,
      value: protected_
    });
  }
  /**
   * Resizes the window with a new inner size.
   * @example
   * ```typescript
   * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
   * await getCurrentWindow().setSize(new LogicalSize(600, 500));
   * ```
   *
   * @param size The logical or physical inner size.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setSize(size2) {
    return invoke("plugin:window|set_size", {
      label: this.label,
      value: size2 instanceof Size ? size2 : new Size(size2)
    });
  }
  /**
   * Sets the window minimum inner size. If the `size` argument is not provided, the constraint is unset.
   * @example
   * ```typescript
   * import { getCurrentWindow, PhysicalSize } from '@tauri-apps/api/window';
   * await getCurrentWindow().setMinSize(new PhysicalSize(600, 500));
   * ```
   *
   * @param size The logical or physical inner size, or `null` to unset the constraint.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setMinSize(size2) {
    return invoke("plugin:window|set_min_size", {
      label: this.label,
      value: size2 instanceof Size ? size2 : size2 ? new Size(size2) : null
    });
  }
  /**
   * Sets the window maximum inner size. If the `size` argument is undefined, the constraint is unset.
   * @example
   * ```typescript
   * import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
   * await getCurrentWindow().setMaxSize(new LogicalSize(600, 500));
   * ```
   *
   * @param size The logical or physical inner size, or `null` to unset the constraint.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setMaxSize(size2) {
    return invoke("plugin:window|set_max_size", {
      label: this.label,
      value: size2 instanceof Size ? size2 : size2 ? new Size(size2) : null
    });
  }
  /**
   * Sets the window inner size constraints.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setSizeConstraints({ minWidth: 300 });
   * ```
   *
   * @param constraints The logical or physical inner size, or `null` to unset the constraint.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setSizeConstraints(constraints) {
    function logical(pixel) {
      return pixel ? { Logical: pixel } : null;
    }
    return invoke("plugin:window|set_size_constraints", {
      label: this.label,
      value: {
        minWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minWidth),
        minHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.minHeight),
        maxWidth: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxWidth),
        maxHeight: logical(constraints === null || constraints === void 0 ? void 0 : constraints.maxHeight)
      }
    });
  }
  /**
   * Sets the window outer position.
   * @example
   * ```typescript
   * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
   * await getCurrentWindow().setPosition(new LogicalPosition(600, 500));
   * ```
   *
   * @param position The new position, in logical or physical pixels.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setPosition(position) {
    return invoke("plugin:window|set_position", {
      label: this.label,
      value: position instanceof Position ? position : new Position(position)
    });
  }
  /**
   * Sets the window fullscreen state.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setFullscreen(true);
   * ```
   *
   * @param fullscreen Whether the window should go to fullscreen or not.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setFullscreen(fullscreen) {
    return invoke("plugin:window|set_fullscreen", {
      label: this.label,
      value: fullscreen
    });
  }
  /**
   * On macOS, Toggles a fullscreen mode that doesn’t require a new macOS space. Returns a boolean indicating whether the transition was successful (this won’t work if the window was already in the native fullscreen).
   * This is how fullscreen used to work on macOS in versions before Lion. And allows the user to have a fullscreen window without using another space or taking control over the entire monitor.
   *
   * On other platforms, this is the same as {@link Window.setFullscreen}.
   *
   * @param fullscreen Whether the window should go to simple fullscreen or not.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setSimpleFullscreen(fullscreen) {
    return invoke("plugin:window|set_simple_fullscreen", {
      label: this.label,
      value: fullscreen
    });
  }
  /**
   * Bring the window to front and focus.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setFocus();
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   */
  async setFocus() {
    return invoke("plugin:window|set_focus", {
      label: this.label
    });
  }
  /**
   * Sets whether the window can be focused.
   *
   * #### Platform-specific
   *
   * - **macOS**: If the window is already focused, it is not possible to unfocus it after calling `set_focusable(false)`.
   *   In this case, you might consider calling {@link Window.setFocus} but it will move the window to the back i.e. at the bottom in terms of z-order.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setFocusable(true);
   * ```
   *
   * @param focusable Whether the window can be focused.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setFocusable(focusable) {
    return invoke("plugin:window|set_focusable", {
      label: this.label,
      value: focusable
    });
  }
  /**
   * Sets the window icon.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setIcon('/tauri/awesome.png');
   * ```
   *
   * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
   * To enable it, change your Cargo.toml file:
   * ```toml
   * [dependencies]
   * tauri = { version = "...", features = ["...", "image-png"] }
   * ```
   *
   * @param icon Icon bytes or path to the icon file.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setIcon(icon) {
    return invoke("plugin:window|set_icon", {
      label: this.label,
      value: transformImage(icon)
    });
  }
  /**
   * Whether the window icon should be hidden from the taskbar or not.
   *
   * #### Platform-specific
   *
   * - **macOS:** Unsupported.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setSkipTaskbar(true);
   * ```
   *
   * @param skip true to hide window icon, false to show it.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setSkipTaskbar(skip) {
    return invoke("plugin:window|set_skip_taskbar", {
      label: this.label,
      value: skip
    });
  }
  /**
   * Grabs the cursor, preventing it from leaving the window.
   *
   * There's no guarantee that the cursor will be hidden. You should
   * hide it by yourself if you want so.
   *
   * #### Platform-specific
   *
   * - **Linux:** Unsupported.
   * - **macOS:** This locks the cursor in a fixed location, which looks visually awkward.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setCursorGrab(true);
   * ```
   *
   * @param grab `true` to grab the cursor icon, `false` to release it.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setCursorGrab(grab) {
    return invoke("plugin:window|set_cursor_grab", {
      label: this.label,
      value: grab
    });
  }
  /**
   * Modifies the cursor's visibility.
   *
   * #### Platform-specific
   *
   * - **Windows:** The cursor is only hidden within the confines of the window.
   * - **macOS:** The cursor is hidden as long as the window has input focus, even if the cursor is
   *   outside of the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setCursorVisible(false);
   * ```
   *
   * @param visible If `false`, this will hide the cursor. If `true`, this will show the cursor.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setCursorVisible(visible) {
    return invoke("plugin:window|set_cursor_visible", {
      label: this.label,
      value: visible
    });
  }
  /**
   * Modifies the cursor icon of the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setCursorIcon('help');
   * ```
   *
   * @param icon The new cursor icon.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setCursorIcon(icon) {
    return invoke("plugin:window|set_cursor_icon", {
      label: this.label,
      value: icon
    });
  }
  /**
   * Sets the window background color.
   *
   * #### Platform-specific:
   *
   * - **Windows:** alpha channel is ignored.
   * - **iOS / Android:** Unsupported.
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @since 2.1.0
   */
  async setBackgroundColor(color) {
    return invoke("plugin:window|set_background_color", { color });
  }
  /**
   * Changes the position of the cursor in window coordinates.
   * @example
   * ```typescript
   * import { getCurrentWindow, LogicalPosition } from '@tauri-apps/api/window';
   * await getCurrentWindow().setCursorPosition(new LogicalPosition(600, 300));
   * ```
   *
   * @param position The new cursor position.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setCursorPosition(position) {
    return invoke("plugin:window|set_cursor_position", {
      label: this.label,
      value: position instanceof Position ? position : new Position(position)
    });
  }
  /**
   * Changes the cursor events behavior.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setIgnoreCursorEvents(true);
   * ```
   *
   * @param ignore `true` to ignore the cursor events; `false` to process them as usual.
   * @returns A promise indicating the success or failure of the operation.
   */
  async setIgnoreCursorEvents(ignore) {
    return invoke("plugin:window|set_ignore_cursor_events", {
      label: this.label,
      value: ignore
    });
  }
  /**
   * Starts dragging the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().startDragging();
   * ```
   *
   * @return A promise indicating the success or failure of the operation.
   */
  async startDragging() {
    return invoke("plugin:window|start_dragging", {
      label: this.label
    });
  }
  /**
   * Starts resize-dragging the window.
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().startResizeDragging();
   * ```
   *
   * @return A promise indicating the success or failure of the operation.
   */
  async startResizeDragging(direction) {
    return invoke("plugin:window|start_resize_dragging", {
      label: this.label,
      value: direction
    });
  }
  /**
   * Sets the badge count. It is app wide and not specific to this window.
   *
   * #### Platform-specific
   *
   * - **Windows**: Unsupported. Use @{linkcode Window.setOverlayIcon} instead.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setBadgeCount(5);
   * ```
   *
   * @param count The badge count. Use `undefined` to remove the badge.
   * @return A promise indicating the success or failure of the operation.
   */
  async setBadgeCount(count) {
    return invoke("plugin:window|set_badge_count", {
      label: this.label,
      value: count
    });
  }
  /**
   * Sets the badge cont **macOS only**.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setBadgeLabel("Hello");
   * ```
   *
   * @param label The badge label. Use `undefined` to remove the badge.
   * @return A promise indicating the success or failure of the operation.
   */
  async setBadgeLabel(label) {
    return invoke("plugin:window|set_badge_label", {
      label: this.label,
      value: label
    });
  }
  /**
   * Sets the overlay icon. **Windows only**
   * The overlay icon can be set for every window.
   *
   *
   * Note that you may need the `image-ico` or `image-png` Cargo features to use this API.
   * To enable it, change your Cargo.toml file:
   *
   * ```toml
   * [dependencies]
   * tauri = { version = "...", features = ["...", "image-png"] }
   * ```
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from '@tauri-apps/api/window';
   * await getCurrentWindow().setOverlayIcon("/tauri/awesome.png");
   * ```
   *
   * @param icon Icon bytes or path to the icon file. Use `undefined` to remove the overlay icon.
   * @return A promise indicating the success or failure of the operation.
   */
  async setOverlayIcon(icon) {
    return invoke("plugin:window|set_overlay_icon", {
      label: this.label,
      value: icon ? transformImage(icon) : void 0
    });
  }
  /**
   * Sets the taskbar progress state.
   *
   * #### Platform-specific
   *
   * - **Linux / macOS**: Progress bar is app-wide and not specific to this window.
   * - **Linux**: Only supported desktop environments with `libunity` (e.g. GNOME).
   *
   * @example
   * ```typescript
   * import { getCurrentWindow, ProgressBarStatus } from '@tauri-apps/api/window';
   * await getCurrentWindow().setProgressBar({
   *   status: ProgressBarStatus.Normal,
   *   progress: 50,
   * });
   * ```
   *
   * @return A promise indicating the success or failure of the operation.
   */
  async setProgressBar(state) {
    return invoke("plugin:window|set_progress_bar", {
      label: this.label,
      value: state
    });
  }
  /**
   * Sets whether the window should be visible on all workspaces or virtual desktops.
   *
   * #### Platform-specific
   *
   * - **Windows / iOS / Android:** Unsupported.
   *
   * @since 2.0.0
   */
  async setVisibleOnAllWorkspaces(visible) {
    return invoke("plugin:window|set_visible_on_all_workspaces", {
      label: this.label,
      value: visible
    });
  }
  /**
   * Sets the title bar style. **macOS only**.
   *
   * @since 2.0.0
   */
  async setTitleBarStyle(style) {
    return invoke("plugin:window|set_title_bar_style", {
      label: this.label,
      value: style
    });
  }
  /**
   * Set window theme, pass in `null` or `undefined` to follow system theme
   *
   * #### Platform-specific
   *
   * - **Linux / macOS**: Theme is app-wide and not specific to this window.
   * - **iOS / Android:** Unsupported.
   *
   * @since 2.0.0
   */
  async setTheme(theme) {
    return invoke("plugin:window|set_theme", {
      label: this.label,
      value: theme
    });
  }
  // Listeners
  /**
   * Listen to window resize.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onResized(({ payload: size }) => {
   *  console.log('Window resized', size);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onResized(handler) {
    return this.listen(TauriEvent.WINDOW_RESIZED, (e) => {
      e.payload = new PhysicalSize(e.payload);
      handler(e);
    });
  }
  /**
   * Listen to window move.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onMoved(({ payload: position }) => {
   *  console.log('Window moved', position);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onMoved(handler) {
    return this.listen(TauriEvent.WINDOW_MOVED, (e) => {
      e.payload = new PhysicalPosition(e.payload);
      handler(e);
    });
  }
  /**
   * Listen to window close requested. Emitted when the user requests to closes the window.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * import { confirm } from '@tauri-apps/api/dialog';
   * const unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
   *   const confirmed = await confirm('Are you sure?');
   *   if (!confirmed) {
   *     // user did not confirm closing the window; let's prevent it
   *     event.preventDefault();
   *   }
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onCloseRequested(handler) {
    return this.listen(TauriEvent.WINDOW_CLOSE_REQUESTED, async (event2) => {
      const evt = new CloseRequestedEvent(event2);
      await handler(evt);
      if (!evt.isPreventDefault()) {
        await this.destroy();
      }
    });
  }
  /**
   * Listen to a file drop event.
   * The listener is triggered when the user hovers the selected files on the webview,
   * drops the files or cancels the operation.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/webview";
   * const unlisten = await getCurrentWindow().onDragDropEvent((event) => {
   *  if (event.payload.type === 'over') {
   *    console.log('User hovering', event.payload.position);
   *  } else if (event.payload.type === 'drop') {
   *    console.log('User dropped', event.payload.paths);
   *  } else {
   *    console.log('File drop cancelled');
   *  }
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onDragDropEvent(handler) {
    const unlistenDrag = await this.listen(TauriEvent.DRAG_ENTER, (event2) => {
      handler({
        ...event2,
        payload: {
          type: "enter",
          paths: event2.payload.paths,
          position: new PhysicalPosition(event2.payload.position)
        }
      });
    });
    const unlistenDragOver = await this.listen(TauriEvent.DRAG_OVER, (event2) => {
      handler({
        ...event2,
        payload: {
          type: "over",
          position: new PhysicalPosition(event2.payload.position)
        }
      });
    });
    const unlistenDrop = await this.listen(TauriEvent.DRAG_DROP, (event2) => {
      handler({
        ...event2,
        payload: {
          type: "drop",
          paths: event2.payload.paths,
          position: new PhysicalPosition(event2.payload.position)
        }
      });
    });
    const unlistenCancel = await this.listen(TauriEvent.DRAG_LEAVE, (event2) => {
      handler({ ...event2, payload: { type: "leave" } });
    });
    return () => {
      unlistenDrag();
      unlistenDrop();
      unlistenDragOver();
      unlistenCancel();
    };
  }
  /**
   * Listen to window focus change.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
   *  console.log('Focus changed, window is focused? ' + focused);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onFocusChanged(handler) {
    const unlistenFocus = await this.listen(TauriEvent.WINDOW_FOCUS, (event2) => {
      handler({ ...event2, payload: true });
    });
    const unlistenBlur = await this.listen(TauriEvent.WINDOW_BLUR, (event2) => {
      handler({ ...event2, payload: false });
    });
    return () => {
      unlistenFocus();
      unlistenBlur();
    };
  }
  /**
   * Listen to window scale change. Emitted when the window's scale factor has changed.
   * The following user actions can cause DPI changes:
   * - Changing the display's resolution.
   * - Changing the display's scale factor (e.g. in Control Panel on Windows).
   * - Moving the window to a display with a different scale factor.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onScaleChanged(({ payload }) => {
   *  console.log('Scale changed', payload.scaleFactor, payload.size);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onScaleChanged(handler) {
    return this.listen(TauriEvent.WINDOW_SCALE_FACTOR_CHANGED, handler);
  }
  /**
   * Listen to the system theme change.
   *
   * @example
   * ```typescript
   * import { getCurrentWindow } from "@tauri-apps/api/window";
   * const unlisten = await getCurrentWindow().onThemeChanged(({ payload: theme }) => {
   *  console.log('New theme: ' + theme);
   * });
   *
   * // you need to call unlisten if your handler goes out of scope e.g. the component is unmounted
   * unlisten();
   * ```
   *
   * @returns A promise resolving to a function to unlisten to the event.
   * Note that removing the listener is required if your listener goes out of scope e.g. the component is unmounted.
   */
  async onThemeChanged(handler) {
    return this.listen(TauriEvent.WINDOW_THEME_CHANGED, handler);
  }
}
var BackgroundThrottlingPolicy;
(function(BackgroundThrottlingPolicy2) {
  BackgroundThrottlingPolicy2["Disabled"] = "disabled";
  BackgroundThrottlingPolicy2["Throttle"] = "throttle";
  BackgroundThrottlingPolicy2["Suspend"] = "suspend";
})(BackgroundThrottlingPolicy || (BackgroundThrottlingPolicy = {}));
var ScrollBarStyle;
(function(ScrollBarStyle2) {
  ScrollBarStyle2["Default"] = "default";
  ScrollBarStyle2["FluentOverlay"] = "fluentOverlay";
})(ScrollBarStyle || (ScrollBarStyle = {}));
var Effect;
(function(Effect2) {
  Effect2["AppearanceBased"] = "appearanceBased";
  Effect2["Light"] = "light";
  Effect2["Dark"] = "dark";
  Effect2["MediumLight"] = "mediumLight";
  Effect2["UltraDark"] = "ultraDark";
  Effect2["Titlebar"] = "titlebar";
  Effect2["Selection"] = "selection";
  Effect2["Menu"] = "menu";
  Effect2["Popover"] = "popover";
  Effect2["Sidebar"] = "sidebar";
  Effect2["HeaderView"] = "headerView";
  Effect2["Sheet"] = "sheet";
  Effect2["WindowBackground"] = "windowBackground";
  Effect2["HudWindow"] = "hudWindow";
  Effect2["FullScreenUI"] = "fullScreenUI";
  Effect2["Tooltip"] = "tooltip";
  Effect2["ContentBackground"] = "contentBackground";
  Effect2["UnderWindowBackground"] = "underWindowBackground";
  Effect2["UnderPageBackground"] = "underPageBackground";
  Effect2["Mica"] = "mica";
  Effect2["Blur"] = "blur";
  Effect2["Acrylic"] = "acrylic";
  Effect2["Tabbed"] = "tabbed";
  Effect2["TabbedDark"] = "tabbedDark";
  Effect2["TabbedLight"] = "tabbedLight";
})(Effect || (Effect = {}));
var EffectState;
(function(EffectState2) {
  EffectState2["FollowsWindowActiveState"] = "followsWindowActiveState";
  EffectState2["Active"] = "active";
  EffectState2["Inactive"] = "inactive";
})(EffectState || (EffectState = {}));
function mapMonitor(m) {
  return m === null ? null : {
    name: m.name,
    scaleFactor: m.scaleFactor,
    position: new PhysicalPosition(m.position),
    size: new PhysicalSize(m.size),
    workArea: {
      position: new PhysicalPosition(m.workArea.position),
      size: new PhysicalSize(m.workArea.size)
    }
  };
}
async function currentMonitor() {
  return invoke("plugin:window|current_monitor").then(mapMonitor);
}
async function primaryMonitor() {
  return invoke("plugin:window|primary_monitor").then(mapMonitor);
}
async function monitorFromPoint(x, y) {
  return invoke("plugin:window|monitor_from_point", {
    x,
    y
  }).then(mapMonitor);
}
async function availableMonitors() {
  return invoke("plugin:window|available_monitors").then((ms) => ms.map(mapMonitor));
}
async function cursorPosition() {
  return invoke("plugin:window|cursor_position").then((v) => new PhysicalPosition(v));
}
const window$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  CloseRequestedEvent,
  get Effect() {
    return Effect;
  },
  get EffectState() {
    return EffectState;
  },
  LogicalPosition,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
  get ProgressBarStatus() {
    return ProgressBarStatus;
  },
  get UserAttentionType() {
    return UserAttentionType;
  },
  Window,
  availableMonitors,
  currentMonitor,
  cursorPosition,
  getAllWindows,
  getCurrentWindow,
  monitorFromPoint,
  primaryMonitor
}, Symbol.toStringTag, { value: "Module" }));
const App = registerPlugin("App", {
  web: () => __vitePreload(() => Promise.resolve().then(() => web$5), true ? void 0 : void 0, import.meta.url).then((m) => new m.AppWeb())
});
const index$8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  App
}, Symbol.toStringTag, { value: "Module" }));
var BundleType;
(function(BundleType2) {
  BundleType2["Nsis"] = "nsis";
  BundleType2["Msi"] = "msi";
  BundleType2["Deb"] = "deb";
  BundleType2["Rpm"] = "rpm";
  BundleType2["AppImage"] = "appimage";
  BundleType2["App"] = "app";
})(BundleType || (BundleType = {}));
async function getVersion() {
  return invoke("plugin:app|version");
}
async function getName() {
  return invoke("plugin:app|name");
}
async function getTauriVersion() {
  return invoke("plugin:app|tauri_version");
}
async function getIdentifier() {
  return invoke("plugin:app|identifier");
}
async function show() {
  return invoke("plugin:app|app_show");
}
async function hide() {
  return invoke("plugin:app|app_hide");
}
async function fetchDataStoreIdentifiers() {
  return invoke("plugin:app|fetch_data_store_identifiers");
}
async function removeDataStore(uuid) {
  return invoke("plugin:app|remove_data_store", { uuid });
}
async function defaultWindowIcon() {
  return invoke("plugin:app|default_window_icon").then((rid) => rid ? new Image(rid) : null);
}
async function setTheme(theme) {
  return invoke("plugin:app|set_app_theme", { theme });
}
async function setDockVisibility(visible) {
  return invoke("plugin:app|set_dock_visibility", { visible });
}
async function getBundleType() {
  return invoke("plugin:app|bundle_type");
}
async function onBackButtonPress(handler) {
  return addPluginListener("app", "back-button", handler);
}
async function supportsMultipleWindows() {
  return invoke("plugin:app|supports_multiple_windows");
}
const app = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  get BundleType() {
    return BundleType;
  },
  defaultWindowIcon,
  fetchDataStoreIdentifiers,
  getBundleType,
  getIdentifier,
  getName,
  getTauriVersion,
  getVersion,
  hide,
  onBackButtonPress,
  removeDataStore,
  setDockVisibility,
  setTheme,
  show,
  supportsMultipleWindows
}, Symbol.toStringTag, { value: "Module" }));
var BaseDirectory;
(function(BaseDirectory2) {
  BaseDirectory2[BaseDirectory2["Audio"] = 1] = "Audio";
  BaseDirectory2[BaseDirectory2["Cache"] = 2] = "Cache";
  BaseDirectory2[BaseDirectory2["Config"] = 3] = "Config";
  BaseDirectory2[BaseDirectory2["Data"] = 4] = "Data";
  BaseDirectory2[BaseDirectory2["LocalData"] = 5] = "LocalData";
  BaseDirectory2[BaseDirectory2["Document"] = 6] = "Document";
  BaseDirectory2[BaseDirectory2["Download"] = 7] = "Download";
  BaseDirectory2[BaseDirectory2["Picture"] = 8] = "Picture";
  BaseDirectory2[BaseDirectory2["Public"] = 9] = "Public";
  BaseDirectory2[BaseDirectory2["Video"] = 10] = "Video";
  BaseDirectory2[BaseDirectory2["Resource"] = 11] = "Resource";
  BaseDirectory2[BaseDirectory2["Temp"] = 12] = "Temp";
  BaseDirectory2[BaseDirectory2["AppConfig"] = 13] = "AppConfig";
  BaseDirectory2[BaseDirectory2["AppData"] = 14] = "AppData";
  BaseDirectory2[BaseDirectory2["AppLocalData"] = 15] = "AppLocalData";
  BaseDirectory2[BaseDirectory2["AppCache"] = 16] = "AppCache";
  BaseDirectory2[BaseDirectory2["AppLog"] = 17] = "AppLog";
  BaseDirectory2[BaseDirectory2["Desktop"] = 18] = "Desktop";
  BaseDirectory2[BaseDirectory2["Executable"] = 19] = "Executable";
  BaseDirectory2[BaseDirectory2["Font"] = 20] = "Font";
  BaseDirectory2[BaseDirectory2["Home"] = 21] = "Home";
  BaseDirectory2[BaseDirectory2["Runtime"] = 22] = "Runtime";
  BaseDirectory2[BaseDirectory2["Template"] = 23] = "Template";
})(BaseDirectory || (BaseDirectory = {}));
var SeekMode;
(function(SeekMode2) {
  SeekMode2[SeekMode2["Start"] = 0] = "Start";
  SeekMode2[SeekMode2["Current"] = 1] = "Current";
  SeekMode2[SeekMode2["End"] = 2] = "End";
})(SeekMode || (SeekMode = {}));
function parseFileInfo(r) {
  return {
    isFile: r.isFile,
    isDirectory: r.isDirectory,
    isSymlink: r.isSymlink,
    size: r.size,
    mtime: r.mtime !== null ? new Date(r.mtime) : null,
    atime: r.atime !== null ? new Date(r.atime) : null,
    birthtime: r.birthtime !== null ? new Date(r.birthtime) : null,
    readonly: r.readonly,
    fileAttributes: r.fileAttributes,
    dev: r.dev,
    ino: r.ino,
    mode: r.mode,
    nlink: r.nlink,
    uid: r.uid,
    gid: r.gid,
    rdev: r.rdev,
    blksize: r.blksize,
    blocks: r.blocks
  };
}
function fromBytes(buffer) {
  const bytes = new Uint8ClampedArray(buffer);
  const size2 = bytes.byteLength;
  let x = 0;
  for (let i = 0; i < size2; i++) {
    const byte = bytes[i];
    x *= 256;
    x += byte;
  }
  return x;
}
class FileHandle extends Resource {
  /**
   * Reads up to `p.byteLength` bytes into `p`. It resolves to the number of
   * bytes read (`0` < `n` <= `p.byteLength`) and rejects if any error
   * encountered. Even if `read()` resolves to `n` < `p.byteLength`, it may
   * use all of `p` as scratch space during the call. If some data is
   * available but not `p.byteLength` bytes, `read()` conventionally resolves
   * to what is available instead of waiting for more.
   *
   * When `read()` encounters end-of-file condition, it resolves to EOF
   * (`null`).
   *
   * When `read()` encounters an error, it rejects with an error.
   *
   * Callers should always process the `n` > `0` bytes returned before
   * considering the EOF (`null`). Doing so correctly handles I/O errors that
   * happen after reading some bytes and also both of the allowed EOF
   * behaviors.
   *
   * @example
   * ```typescript
   * import { open, BaseDirectory } from "@tauri-apps/plugin-fs"
   * // if "$APPCONFIG/foo/bar.txt" contains the text "hello world":
   * const file = await open("foo/bar.txt", { baseDir: BaseDirectory.AppConfig });
   * const buf = new Uint8Array(100);
   * const numberOfBytesRead = await file.read(buf); // 11 bytes
   * const text = new TextDecoder().decode(buf);  // "hello world"
   * await file.close();
   * ```
   *
   * @since 2.0.0
   */
  async read(buffer) {
    if (buffer.byteLength === 0) {
      return 0;
    }
    const data = await invoke("plugin:fs|read", {
      rid: this.rid,
      len: buffer.byteLength
    });
    const nread = fromBytes(data.slice(-8));
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    buffer.set(bytes.slice(0, bytes.length - 8));
    return nread === 0 ? null : nread;
  }
  /**
   * Seek sets the offset for the next `read()` or `write()` to offset,
   * interpreted according to `whence`: `Start` means relative to the
   * start of the file, `Current` means relative to the current offset,
   * and `End` means relative to the end. Seek resolves to the new offset
   * relative to the start of the file.
   *
   * Seeking to an offset before the start of the file is an error. Seeking to
   * any positive offset is legal, but the behavior of subsequent I/O
   * operations on the underlying object is implementation-dependent.
   * It returns the number of cursor position.
   *
   * @example
   * ```typescript
   * import { open, SeekMode, BaseDirectory } from '@tauri-apps/plugin-fs';
   *
   * // Given hello.txt pointing to file with "Hello world", which is 11 bytes long:
   * const file = await open('hello.txt', { read: true, write: true, truncate: true, create: true, baseDir: BaseDirectory.AppLocalData });
   * await file.write(new TextEncoder().encode("Hello world"));
   *
   * // Seek 6 bytes from the start of the file
   * console.log(await file.seek(6, SeekMode.Start)); // "6"
   * // Seek 2 more bytes from the current position
   * console.log(await file.seek(2, SeekMode.Current)); // "8"
   * // Seek backwards 2 bytes from the end of the file
   * console.log(await file.seek(-2, SeekMode.End)); // "9" (e.g. 11-2)
   *
   * await file.close();
   * ```
   *
   * @since 2.0.0
   */
  async seek(offset, whence) {
    return await invoke("plugin:fs|seek", {
      rid: this.rid,
      offset,
      whence
    });
  }
  /**
   * Returns a {@linkcode FileInfo } for this file.
   *
   * @example
   * ```typescript
   * import { open, BaseDirectory } from '@tauri-apps/plugin-fs';
   * const file = await open("file.txt", { read: true, baseDir: BaseDirectory.AppLocalData });
   * const fileInfo = await file.stat();
   * console.log(fileInfo.isFile); // true
   * await file.close();
   * ```
   *
   * @since 2.0.0
   */
  async stat() {
    const res = await invoke("plugin:fs|fstat", {
      rid: this.rid
    });
    return parseFileInfo(res);
  }
  /**
   * Truncates or extends this file, to reach the specified `len`.
   * If `len` is not specified then the entire file contents are truncated.
   *
   * @example
   * ```typescript
   * import { open, BaseDirectory } from '@tauri-apps/plugin-fs';
   *
   * // truncate the entire file
   * const file = await open("my_file.txt", { read: true, write: true, create: true, baseDir: BaseDirectory.AppLocalData });
   * await file.truncate();
   *
   * // truncate part of the file
   * const file = await open("my_file.txt", { read: true, write: true, create: true, baseDir: BaseDirectory.AppLocalData });
   * await file.write(new TextEncoder().encode("Hello World"));
   * await file.truncate(7);
   * const data = new Uint8Array(32);
   * await file.read(data);
   * console.log(new TextDecoder().decode(data)); // Hello W
   * await file.close();
   * ```
   *
   * @since 2.0.0
   */
  async truncate(len) {
    await invoke("plugin:fs|ftruncate", {
      rid: this.rid,
      len
    });
  }
  /**
   * Writes `data.byteLength` bytes from `data` to the underlying data stream. It
   * resolves to the number of bytes written from `data` (`0` <= `n` <=
   * `data.byteLength`) or reject with the error encountered that caused the
   * write to stop early. `write()` must reject with a non-null error if
   * would resolve to `n` < `data.byteLength`. `write()` must not modify the
   * slice data, even temporarily.
   *
   * @example
   * ```typescript
   * import { open, write, BaseDirectory } from '@tauri-apps/plugin-fs';
   * const encoder = new TextEncoder();
   * const data = encoder.encode("Hello world");
   * const file = await open("bar.txt", { write: true, baseDir: BaseDirectory.AppLocalData });
   * const bytesWritten = await file.write(data); // 11
   * await file.close();
   * ```
   *
   * @since 2.0.0
   */
  async write(data) {
    return await invoke("plugin:fs|write", {
      rid: this.rid,
      data
    });
  }
}
async function create(path, options) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  const rid = await invoke("plugin:fs|create", {
    path: path instanceof URL ? path.toString() : path,
    options
  });
  return new FileHandle(rid);
}
async function open$1(path, options) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  const rid = await invoke("plugin:fs|open", {
    path: path instanceof URL ? path.toString() : path,
    options
  });
  return new FileHandle(rid);
}
async function copyFile(fromPath, toPath, options) {
  if (fromPath instanceof URL && fromPath.protocol !== "file:" || toPath instanceof URL && toPath.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  await invoke("plugin:fs|copy_file", {
    fromPath: fromPath instanceof URL ? fromPath.toString() : fromPath,
    toPath: toPath instanceof URL ? toPath.toString() : toPath,
    options
  });
}
async function mkdir(path, options) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  await invoke("plugin:fs|mkdir", {
    path: path instanceof URL ? path.toString() : path,
    options
  });
}
async function readDir(path, options) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  return await invoke("plugin:fs|read_dir", {
    path: path instanceof URL ? path.toString() : path,
    options
  });
}
async function readFile(path, options) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  const arr = await invoke("plugin:fs|read_file", {
    path: path instanceof URL ? path.toString() : path,
    options
  });
  return arr instanceof ArrayBuffer ? new Uint8Array(arr) : Uint8Array.from(arr);
}
async function readTextFile(path, options) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  const arr = await invoke("plugin:fs|read_text_file", {
    path: path instanceof URL ? path.toString() : path,
    options
  });
  const bytes = arr instanceof ArrayBuffer ? arr : Uint8Array.from(arr);
  return new TextDecoder(options?.encoding ?? "utf-8").decode(bytes);
}
async function readTextFileLines(path, options) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  const pathStr = path instanceof URL ? path.toString() : path;
  return await Promise.resolve({
    path: pathStr,
    rid: null,
    async next() {
      const decoder = new TextDecoder(options?.encoding ?? "utf-8");
      if (this.rid === null) {
        const encoding = decoder.encoding;
        this.rid = await invoke("plugin:fs|read_text_file_lines", {
          path: pathStr,
          options: options != null ? { ...options, encoding } : void 0
        });
      }
      const arr = await invoke("plugin:fs|read_text_file_lines_next", { rid: this.rid });
      const bytes = arr instanceof ArrayBuffer ? new Uint8Array(arr) : Uint8Array.from(arr);
      const done = bytes[bytes.byteLength - 1] === 1;
      if (done) {
        this.rid = null;
        return { value: null, done };
      }
      const line = decoder.decode(bytes.slice(0, bytes.byteLength - 1));
      return {
        value: line,
        done
      };
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  });
}
async function remove(path, options) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  await invoke("plugin:fs|remove", {
    path: path instanceof URL ? path.toString() : path,
    options
  });
}
async function rename(oldPath, newPath, options) {
  if (oldPath instanceof URL && oldPath.protocol !== "file:" || newPath instanceof URL && newPath.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  await invoke("plugin:fs|rename", {
    oldPath: oldPath instanceof URL ? oldPath.toString() : oldPath,
    newPath: newPath instanceof URL ? newPath.toString() : newPath,
    options
  });
}
async function stat(path, options) {
  const res = await invoke("plugin:fs|stat", {
    path: path instanceof URL ? path.toString() : path,
    options
  });
  return parseFileInfo(res);
}
async function lstat(path, options) {
  const res = await invoke("plugin:fs|lstat", {
    path: path instanceof URL ? path.toString() : path,
    options
  });
  return parseFileInfo(res);
}
async function truncate(path, len, options) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  await invoke("plugin:fs|truncate", {
    path: path instanceof URL ? path.toString() : path,
    len,
    options
  });
}
async function writeFile(path, data, options) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  if (data instanceof ReadableStream) {
    const file = await open$1(path, {
      read: false,
      create: true,
      write: true,
      ...options
    });
    const reader = data.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;
        await file.write(value);
      }
    } finally {
      reader.releaseLock();
      await file.close();
    }
  } else {
    await invoke("plugin:fs|write_file", data, {
      headers: {
        path: encodeURIComponent(path instanceof URL ? path.toString() : path),
        options: JSON.stringify(options)
      }
    });
  }
}
async function writeTextFile(path, data, options) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  const encoder = new TextEncoder();
  await invoke("plugin:fs|write_text_file", encoder.encode(data), {
    headers: {
      path: encodeURIComponent(path instanceof URL ? path.toString() : path),
      options: JSON.stringify(options)
    }
  });
}
async function exists(path, options) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  return await invoke("plugin:fs|exists", {
    path: path instanceof URL ? path.toString() : path,
    options
  });
}
class Watcher extends Resource {
}
async function watchInternal(paths, cb, options) {
  const watchPaths = Array.isArray(paths) ? paths : [paths];
  for (const path of watchPaths) {
    if (path instanceof URL && path.protocol !== "file:") {
      throw new TypeError("Must be a file URL.");
    }
  }
  const onEvent = new Channel();
  onEvent.onmessage = cb;
  const rid = await invoke("plugin:fs|watch", {
    paths: watchPaths.map((p) => p instanceof URL ? p.toString() : p),
    options,
    onEvent
  });
  const watcher = new Watcher(rid);
  return () => {
    void watcher.close();
  };
}
async function watch(paths, cb, options) {
  return await watchInternal(paths, cb, {
    delayMs: 2e3,
    ...options
  });
}
async function watchImmediate(paths, cb, options) {
  return await watchInternal(paths, cb, {
    ...options,
    delayMs: void 0
  });
}
async function size(path) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  return await invoke("plugin:fs|size", {
    path: path instanceof URL ? path.toString() : path
  });
}
async function startAccessingSecurityScopedResource(path) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  await invoke("plugin:fs|start_accessing_security_scoped_resource", {
    path: path instanceof URL ? path.toString() : path
  });
}
async function stopAccessingSecurityScopedResource(path) {
  if (path instanceof URL && path.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  await invoke("plugin:fs|stop_accessing_security_scoped_resource", {
    path: path instanceof URL ? path.toString() : path
  });
}
const index$7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  get BaseDirectory() {
    return BaseDirectory;
  },
  FileHandle,
  get SeekMode() {
    return SeekMode;
  },
  copyFile,
  create,
  exists,
  lstat,
  mkdir,
  open: open$1,
  readDir,
  readFile,
  readTextFile,
  readTextFileLines,
  remove,
  rename,
  size,
  startAccessingSecurityScopedResource,
  stat,
  stopAccessingSecurityScopedResource,
  truncate,
  watch,
  watchImmediate,
  writeFile,
  writeTextFile
}, Symbol.toStringTag, { value: "Module" }));
var Weekday;
(function(Weekday2) {
  Weekday2[Weekday2["Sunday"] = 1] = "Sunday";
  Weekday2[Weekday2["Monday"] = 2] = "Monday";
  Weekday2[Weekday2["Tuesday"] = 3] = "Tuesday";
  Weekday2[Weekday2["Wednesday"] = 4] = "Wednesday";
  Weekday2[Weekday2["Thursday"] = 5] = "Thursday";
  Weekday2[Weekday2["Friday"] = 6] = "Friday";
  Weekday2[Weekday2["Saturday"] = 7] = "Saturday";
})(Weekday || (Weekday = {}));
const LocalNotifications = registerPlugin("LocalNotifications", {
  web: () => __vitePreload(() => Promise.resolve().then(() => web$4), true ? void 0 : void 0, import.meta.url).then((m) => new m.LocalNotificationsWeb())
});
const index$6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  LocalNotifications,
  get Weekday() {
    return Weekday;
  }
}, Symbol.toStringTag, { value: "Module" }));
const AppLauncher = registerPlugin("AppLauncher", {
  web: () => __vitePreload(() => Promise.resolve().then(() => web$3), true ? void 0 : void 0, import.meta.url).then((m) => new m.AppLauncherWeb())
});
const index$5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AppLauncher
}, Symbol.toStringTag, { value: "Module" }));
class EventEmitter {
  constructor() {
    this.eventListeners = /* @__PURE__ */ Object.create(null);
  }
  /**
   * Alias for `emitter.on(eventName, listener)`.
   *
   * @since 2.0.0
   */
  addListener(eventName, listener) {
    return this.on(eventName, listener);
  }
  /**
   * Alias for `emitter.off(eventName, listener)`.
   *
   * @since 2.0.0
   */
  removeListener(eventName, listener) {
    return this.off(eventName, listener);
  }
  /**
   * Adds the `listener` function to the end of the listeners array for the
   * event named `eventName`. No checks are made to see if the `listener` has
   * already been added. Multiple calls passing the same combination of `eventName`and `listener` will result in the `listener` being added, and called, multiple
   * times.
   *
   * Returns a reference to the `EventEmitter`, so that calls can be chained.
   *
   * @since 2.0.0
   */
  on(eventName, listener) {
    if (eventName in this.eventListeners) {
      this.eventListeners[eventName].push(listener);
    } else {
      this.eventListeners[eventName] = [listener];
    }
    return this;
  }
  /**
   * Adds a **one-time**`listener` function for the event named `eventName`. The
   * next time `eventName` is triggered, this listener is removed and then invoked.
   *
   * Returns a reference to the `EventEmitter`, so that calls can be chained.
   *
   * @since 2.0.0
   */
  once(eventName, listener) {
    const wrapper = (arg) => {
      this.removeListener(eventName, wrapper);
      listener(arg);
    };
    return this.addListener(eventName, wrapper);
  }
  /**
   * Removes the all specified listener from the listener array for the event eventName
   * Returns a reference to the `EventEmitter`, so that calls can be chained.
   *
   * @since 2.0.0
   */
  off(eventName, listener) {
    if (eventName in this.eventListeners) {
      this.eventListeners[eventName] = this.eventListeners[eventName].filter((l) => l !== listener);
    }
    return this;
  }
  /**
   * Removes all listeners, or those of the specified eventName.
   *
   * Returns a reference to the `EventEmitter`, so that calls can be chained.
   *
   * @since 2.0.0
   */
  removeAllListeners(event2) {
    if (event2) {
      delete this.eventListeners[event2];
    } else {
      this.eventListeners = /* @__PURE__ */ Object.create(null);
    }
    return this;
  }
  /**
   * @ignore
   * Synchronously calls each of the listeners registered for the event named`eventName`, in the order they were registered, passing the supplied arguments
   * to each.
   *
   * @returns `true` if the event had listeners, `false` otherwise.
   *
   * @since 2.0.0
   */
  emit(eventName, arg) {
    if (eventName in this.eventListeners) {
      const listeners2 = this.eventListeners[eventName];
      for (const listener of listeners2)
        listener(arg);
      return true;
    }
    return false;
  }
  /**
   * Returns the number of listeners listening to the event named `eventName`.
   *
   * @since 2.0.0
   */
  listenerCount(eventName) {
    if (eventName in this.eventListeners)
      return this.eventListeners[eventName].length;
    return 0;
  }
  /**
   * Adds the `listener` function to the _beginning_ of the listeners array for the
   * event named `eventName`. No checks are made to see if the `listener` has
   * already been added. Multiple calls passing the same combination of `eventName`and `listener` will result in the `listener` being added, and called, multiple
   * times.
   *
   * Returns a reference to the `EventEmitter`, so that calls can be chained.
   *
   * @since 2.0.0
   */
  prependListener(eventName, listener) {
    if (eventName in this.eventListeners) {
      this.eventListeners[eventName].unshift(listener);
    } else {
      this.eventListeners[eventName] = [listener];
    }
    return this;
  }
  /**
   * Adds a **one-time**`listener` function for the event named `eventName` to the_beginning_ of the listeners array. The next time `eventName` is triggered, this
   * listener is removed, and then invoked.
   *
   * Returns a reference to the `EventEmitter`, so that calls can be chained.
   *
   * @since 2.0.0
   */
  prependOnceListener(eventName, listener) {
    const wrapper = (arg) => {
      this.removeListener(eventName, wrapper);
      listener(arg);
    };
    return this.prependListener(eventName, wrapper);
  }
}
class Child {
  constructor(pid) {
    this.pid = pid;
  }
  /**
   * Writes `data` to the `stdin`.
   *
   * @param data The message to write, either a string or a byte array.
   * @example
   * ```typescript
   * import { Command } from '@tauri-apps/plugin-shell';
   * const command = Command.create('node');
   * const child = await command.spawn();
   * await child.write('message');
   * await child.write([0, 1, 2, 3, 4, 5]);
   * ```
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @since 2.0.0
   */
  async write(data) {
    await invoke("plugin:shell|stdin_write", {
      pid: this.pid,
      buffer: data
    });
  }
  /**
   * Kills the child process.
   *
   * @returns A promise indicating the success or failure of the operation.
   *
   * @since 2.0.0
   */
  async kill() {
    await invoke("plugin:shell|kill", {
      cmd: "killChild",
      pid: this.pid
    });
  }
}
class Command extends EventEmitter {
  /**
   * @ignore
   * Creates a new `Command` instance.
   *
   * @param program The program name to execute.
   * It must be configured in your project's capabilities.
   * @param args Program arguments.
   * @param options Spawn options.
   */
  constructor(program, args = [], options) {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.program = program;
    this.args = typeof args === "string" ? [args] : args;
    this.options = options ?? {};
  }
  /**
   * Creates a command to execute the given program.
   * @example
   * ```typescript
   * import { Command } from '@tauri-apps/plugin-shell';
   * const command = Command.create('my-app', ['run', 'tauri']);
   * const output = await command.execute();
   * ```
   *
   * @param program The program to execute.
   * It must be configured in your project's capabilities.
   */
  static create(program, args = [], options) {
    return new Command(program, args, options);
  }
  /**
   * Creates a command to execute the given sidecar program.
   * @example
   * ```typescript
   * import { Command } from '@tauri-apps/plugin-shell';
   * const command = Command.sidecar('my-sidecar');
   * const output = await command.execute();
   * ```
   *
   * @param program The program to execute.
   * It must be configured in your project's capabilities.
   */
  static sidecar(program, args = [], options) {
    const instance = new Command(program, args, options);
    instance.options.sidecar = true;
    return instance;
  }
  /**
   * Executes the command as a child process, returning a handle to it.
   *
   * @returns A promise resolving to the child process handle.
   *
   * @since 2.0.0
   */
  async spawn() {
    const program = this.program;
    const args = this.args;
    const options = this.options;
    if (typeof args === "object") {
      Object.freeze(args);
    }
    const onEvent = new Channel();
    onEvent.onmessage = (event2) => {
      switch (event2.event) {
        case "Error":
          this.emit("error", event2.payload);
          break;
        case "Terminated":
          this.emit("close", event2.payload);
          break;
        case "Stdout":
          this.stdout.emit("data", event2.payload);
          break;
        case "Stderr":
          this.stderr.emit("data", event2.payload);
          break;
      }
    };
    return await invoke("plugin:shell|spawn", {
      program,
      args,
      options,
      onEvent
    }).then((pid) => new Child(pid));
  }
  /**
   * Executes the command as a child process, waiting for it to finish and collecting all of its output.
   * @example
   * ```typescript
   * import { Command } from '@tauri-apps/plugin-shell';
   * const output = await Command.create('echo', 'message').execute();
   * assert(output.code === 0);
   * assert(output.signal === null);
   * assert(output.stdout === 'message');
   * assert(output.stderr === '');
   * ```
   *
   * @returns A promise resolving to the child process output.
   *
   * @since 2.0.0
   */
  async execute() {
    const program = this.program;
    const args = this.args;
    const options = this.options;
    if (typeof args === "object") {
      Object.freeze(args);
    }
    return await invoke("plugin:shell|execute", {
      program,
      args,
      options
    });
  }
}
async function open(path, openWith) {
  await invoke("plugin:shell|open", {
    path,
    with: openWith
  });
}
const index$4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Child,
  Command,
  EventEmitter,
  open
}, Symbol.toStringTag, { value: "Module" }));
var ScheduleEvery;
(function(ScheduleEvery2) {
  ScheduleEvery2["Year"] = "year";
  ScheduleEvery2["Month"] = "month";
  ScheduleEvery2["TwoWeeks"] = "twoWeeks";
  ScheduleEvery2["Week"] = "week";
  ScheduleEvery2["Day"] = "day";
  ScheduleEvery2["Hour"] = "hour";
  ScheduleEvery2["Minute"] = "minute";
  ScheduleEvery2["Second"] = "second";
})(ScheduleEvery || (ScheduleEvery = {}));
class Schedule {
  static at(date, repeating = false, allowWhileIdle = false) {
    return {
      at: { date, repeating, allowWhileIdle },
      interval: void 0,
      every: void 0
    };
  }
  static interval(interval, allowWhileIdle = false) {
    return {
      at: void 0,
      interval: { interval, allowWhileIdle },
      every: void 0
    };
  }
  static every(kind, count, allowWhileIdle = false) {
    return {
      at: void 0,
      interval: void 0,
      every: { interval: kind, count, allowWhileIdle }
    };
  }
}
var Importance;
(function(Importance2) {
  Importance2[Importance2["None"] = 0] = "None";
  Importance2[Importance2["Min"] = 1] = "Min";
  Importance2[Importance2["Low"] = 2] = "Low";
  Importance2[Importance2["Default"] = 3] = "Default";
  Importance2[Importance2["High"] = 4] = "High";
})(Importance || (Importance = {}));
var Visibility;
(function(Visibility2) {
  Visibility2[Visibility2["Secret"] = -1] = "Secret";
  Visibility2[Visibility2["Private"] = 0] = "Private";
  Visibility2[Visibility2["Public"] = 1] = "Public";
})(Visibility || (Visibility = {}));
async function isPermissionGranted() {
  if (window.Notification.permission !== "default") {
    return await Promise.resolve(window.Notification.permission === "granted");
  }
  return await invoke("plugin:notification|is_permission_granted");
}
async function requestPermission() {
  return await window.Notification.requestPermission();
}
function sendNotification(options) {
  if (typeof options === "string") {
    new window.Notification(options);
  } else {
    new window.Notification(options.title, options);
  }
}
async function registerActionTypes(types2) {
  await invoke("plugin:notification|register_action_types", { types: types2 });
}
async function pending() {
  return await invoke("plugin:notification|get_pending");
}
async function cancel(notifications) {
  await invoke("plugin:notification|cancel", { notifications });
}
async function cancelAll() {
  await invoke("plugin:notification|cancel");
}
async function active() {
  return await invoke("plugin:notification|get_active");
}
async function removeActive(notifications) {
  await invoke("plugin:notification|remove_active", { notifications });
}
async function removeAllActive() {
  await invoke("plugin:notification|remove_active");
}
async function createChannel(channel) {
  await invoke("plugin:notification|create_channel", { ...channel });
}
async function removeChannel(id2) {
  await invoke("plugin:notification|delete_channel", { id: id2 });
}
async function channels() {
  return await invoke("plugin:notification|listChannels");
}
async function onNotificationReceived(cb) {
  return await addPluginListener("notification", "notification", cb);
}
async function onAction(cb) {
  return await addPluginListener("notification", "actionPerformed", cb);
}
const index$3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  get Importance() {
    return Importance;
  },
  Schedule,
  get ScheduleEvery() {
    return ScheduleEvery;
  },
  get Visibility() {
    return Visibility;
  },
  active,
  cancel,
  cancelAll,
  channels,
  createChannel,
  isPermissionGranted,
  onAction,
  onNotificationReceived,
  pending,
  registerActionTypes,
  removeActive,
  removeAllActive,
  removeChannel,
  requestPermission,
  sendNotification
}, Symbol.toStringTag, { value: "Module" }));
const Preferences = registerPlugin("Preferences", {
  web: () => __vitePreload(() => Promise.resolve().then(() => web$2), true ? void 0 : void 0, import.meta.url).then((m) => new m.PreferencesWeb())
});
const index$2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Preferences
}, Symbol.toStringTag, { value: "Module" }));
var Directory;
(function(Directory2) {
  Directory2["Documents"] = "DOCUMENTS";
  Directory2["Data"] = "DATA";
  Directory2["Library"] = "LIBRARY";
  Directory2["Cache"] = "CACHE";
  Directory2["External"] = "EXTERNAL";
  Directory2["ExternalStorage"] = "EXTERNAL_STORAGE";
})(Directory || (Directory = {}));
var Encoding;
(function(Encoding2) {
  Encoding2["UTF8"] = "utf8";
  Encoding2["ASCII"] = "ascii";
  Encoding2["UTF16"] = "utf16";
})(Encoding || (Encoding = {}));
const Filesystem = registerPlugin("Filesystem", {
  web: () => __vitePreload(() => Promise.resolve().then(() => web$1), true ? void 0 : void 0, import.meta.url).then((m) => new m.FilesystemWeb())
});
const index$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  get Directory() {
    return Directory;
  },
  get Encoding() {
    return Encoding;
  },
  Filesystem
}, Symbol.toStringTag, { value: "Module" }));
class AppWeb extends WebPlugin {
  constructor() {
    super();
    this.handleVisibilityChange = () => {
      const data = {
        isActive: document.hidden !== true
      };
      this.notifyListeners("appStateChange", data);
      if (document.hidden) {
        this.notifyListeners("pause", null);
      } else {
        this.notifyListeners("resume", null);
      }
    };
    document.addEventListener("visibilitychange", this.handleVisibilityChange, false);
  }
  exitApp() {
    throw this.unimplemented("Not implemented on web.");
  }
  async getInfo() {
    throw this.unimplemented("Not implemented on web.");
  }
  async getLaunchUrl() {
    return { url: "" };
  }
  async getState() {
    return { isActive: document.hidden !== true };
  }
  async minimizeApp() {
    throw this.unimplemented("Not implemented on web.");
  }
}
const web$5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AppWeb
}, Symbol.toStringTag, { value: "Module" }));
class LocalNotificationsWeb extends WebPlugin {
  constructor() {
    super(...arguments);
    this.pending = [];
    this.deliveredNotifications = [];
    this.hasNotificationSupport = () => {
      if (!("Notification" in window) || !Notification.requestPermission) {
        return false;
      }
      if (Notification.permission !== "granted") {
        try {
          new Notification("");
        } catch (e) {
          if (e.name == "TypeError") {
            return false;
          }
        }
      }
      return true;
    };
  }
  async getDeliveredNotifications() {
    const deliveredSchemas = [];
    for (const notification of this.deliveredNotifications) {
      const deliveredSchema = {
        title: notification.title,
        id: parseInt(notification.tag),
        body: notification.body
      };
      deliveredSchemas.push(deliveredSchema);
    }
    return {
      notifications: deliveredSchemas
    };
  }
  async removeDeliveredNotifications(delivered) {
    for (const toRemove of delivered.notifications) {
      const found = this.deliveredNotifications.find((n) => n.tag === String(toRemove.id));
      found === null || found === void 0 ? void 0 : found.close();
      this.deliveredNotifications = this.deliveredNotifications.filter(() => !found);
    }
  }
  async removeAllDeliveredNotifications() {
    for (const notification of this.deliveredNotifications) {
      notification.close();
    }
    this.deliveredNotifications = [];
  }
  async createChannel() {
    throw this.unimplemented("Not implemented on web.");
  }
  async deleteChannel() {
    throw this.unimplemented("Not implemented on web.");
  }
  async listChannels() {
    throw this.unimplemented("Not implemented on web.");
  }
  async schedule(options) {
    if (!this.hasNotificationSupport()) {
      throw this.unavailable("Notifications not supported in this browser.");
    }
    for (const notification of options.notifications) {
      this.sendNotification(notification);
    }
    return {
      notifications: options.notifications.map((notification) => ({
        id: notification.id
      }))
    };
  }
  async getPending() {
    return {
      notifications: this.pending
    };
  }
  async registerActionTypes() {
    throw this.unimplemented("Not implemented on web.");
  }
  async cancel(pending2) {
    this.pending = this.pending.filter((notification) => !pending2.notifications.find((n) => n.id === notification.id));
  }
  async areEnabled() {
    const { display } = await this.checkPermissions();
    return {
      value: display === "granted"
    };
  }
  async changeExactNotificationSetting() {
    throw this.unimplemented("Not implemented on web.");
  }
  async checkExactNotificationSetting() {
    throw this.unimplemented("Not implemented on web.");
  }
  async requestPermissions() {
    if (!this.hasNotificationSupport()) {
      throw this.unavailable("Notifications not supported in this browser.");
    }
    const display = this.transformNotificationPermission(await Notification.requestPermission());
    return { display };
  }
  async checkPermissions() {
    if (!this.hasNotificationSupport()) {
      throw this.unavailable("Notifications not supported in this browser.");
    }
    const display = this.transformNotificationPermission(Notification.permission);
    return { display };
  }
  transformNotificationPermission(permission) {
    switch (permission) {
      case "granted":
        return "granted";
      case "denied":
        return "denied";
      default:
        return "prompt";
    }
  }
  sendPending() {
    var _a;
    const toRemove = [];
    const now = (/* @__PURE__ */ new Date()).getTime();
    for (const notification of this.pending) {
      if (((_a = notification.schedule) === null || _a === void 0 ? void 0 : _a.at) && notification.schedule.at.getTime() <= now) {
        this.buildNotification(notification);
        toRemove.push(notification);
      }
    }
    this.pending = this.pending.filter((notification) => !toRemove.find((n) => n === notification));
  }
  sendNotification(notification) {
    var _a;
    if ((_a = notification.schedule) === null || _a === void 0 ? void 0 : _a.at) {
      const diff = notification.schedule.at.getTime() - (/* @__PURE__ */ new Date()).getTime();
      this.pending.push(notification);
      setTimeout(() => {
        this.sendPending();
      }, diff);
      return;
    }
    this.buildNotification(notification);
  }
  buildNotification(notification) {
    const localNotification = new Notification(notification.title, {
      body: notification.body,
      tag: String(notification.id)
    });
    localNotification.addEventListener("click", this.onClick.bind(this, notification), false);
    localNotification.addEventListener("show", this.onShow.bind(this, notification), false);
    localNotification.addEventListener("close", () => {
      this.deliveredNotifications = this.deliveredNotifications.filter(() => !this);
    }, false);
    this.deliveredNotifications.push(localNotification);
    return localNotification;
  }
  onClick(notification) {
    const data = {
      actionId: "tap",
      notification
    };
    this.notifyListeners("localNotificationActionPerformed", data);
  }
  onShow(notification) {
    this.notifyListeners("localNotificationReceived", notification);
  }
}
const web$4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  LocalNotificationsWeb
}, Symbol.toStringTag, { value: "Module" }));
class AppLauncherWeb extends WebPlugin {
  async canOpenUrl(_options) {
    return { value: true };
  }
  async openUrl(options) {
    window.open(options.url, "_blank");
    return { completed: true };
  }
}
const web$3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AppLauncherWeb
}, Symbol.toStringTag, { value: "Module" }));
class PreferencesWeb extends WebPlugin {
  constructor() {
    super(...arguments);
    this.group = "CapacitorStorage";
  }
  async configure({ group }) {
    if (typeof group === "string") {
      this.group = group;
    }
  }
  async get(options) {
    const value = this.impl.getItem(this.applyPrefix(options.key));
    return { value };
  }
  async set(options) {
    this.impl.setItem(this.applyPrefix(options.key), options.value);
  }
  async remove(options) {
    this.impl.removeItem(this.applyPrefix(options.key));
  }
  async keys() {
    const keys = this.rawKeys().map((k) => k.substring(this.prefix.length));
    return { keys };
  }
  async clear() {
    for (const key of this.rawKeys()) {
      this.impl.removeItem(key);
    }
  }
  async migrate() {
    var _a;
    const migrated = [];
    const existing = [];
    const oldprefix = "_cap_";
    const keys = Object.keys(this.impl).filter((k) => k.indexOf(oldprefix) === 0);
    for (const oldkey of keys) {
      const key = oldkey.substring(oldprefix.length);
      const value = (_a = this.impl.getItem(oldkey)) !== null && _a !== void 0 ? _a : "";
      const { value: currentValue } = await this.get({ key });
      if (typeof currentValue === "string") {
        existing.push(key);
      } else {
        await this.set({ key, value });
        migrated.push(key);
      }
    }
    return { migrated, existing };
  }
  async removeOld() {
    const oldprefix = "_cap_";
    const keys = Object.keys(this.impl).filter((k) => k.indexOf(oldprefix) === 0);
    for (const oldkey of keys) {
      this.impl.removeItem(oldkey);
    }
  }
  get impl() {
    return window.localStorage;
  }
  get prefix() {
    return this.group === "NativeStorage" ? "" : `${this.group}.`;
  }
  rawKeys() {
    return Object.keys(this.impl).filter((k) => k.indexOf(this.prefix) === 0);
  }
  applyPrefix(key) {
    return this.prefix + key;
  }
}
const web$2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  PreferencesWeb
}, Symbol.toStringTag, { value: "Module" }));
function resolve(path) {
  const posix = path.split("/").filter((item) => item !== ".");
  const newPosix = [];
  posix.forEach((item) => {
    if (item === ".." && newPosix.length > 0 && newPosix[newPosix.length - 1] !== "..") {
      newPosix.pop();
    } else {
      newPosix.push(item);
    }
  });
  return newPosix.join("/");
}
function isPathParent(parent, children) {
  parent = resolve(parent);
  children = resolve(children);
  const pathsA = parent.split("/");
  const pathsB = children.split("/");
  return parent !== children && pathsA.every((value, index2) => value === pathsB[index2]);
}
class FilesystemWeb extends WebPlugin {
  constructor() {
    super(...arguments);
    this.DB_VERSION = 1;
    this.DB_NAME = "Disc";
    this._writeCmds = ["add", "put", "delete"];
    this.downloadFile = async (options) => {
      var _a, _b;
      const requestInit = buildRequestInit(options, options.webFetchExtra);
      const response = await fetch(options.url, requestInit);
      let blob;
      if (!options.progress)
        blob = await response.blob();
      else if (!(response === null || response === void 0 ? void 0 : response.body))
        blob = new Blob();
      else {
        const reader = response.body.getReader();
        let bytes = 0;
        const chunks = [];
        const contentType = response.headers.get("content-type");
        const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
        while (true) {
          const { done, value } = await reader.read();
          if (done)
            break;
          chunks.push(value);
          bytes += (value === null || value === void 0 ? void 0 : value.length) || 0;
          const status = {
            url: options.url,
            bytes,
            contentLength
          };
          this.notifyListeners("progress", status);
        }
        const allChunks = new Uint8Array(bytes);
        let position = 0;
        for (const chunk of chunks) {
          if (typeof chunk === "undefined")
            continue;
          allChunks.set(chunk, position);
          position += chunk.length;
        }
        blob = new Blob([allChunks.buffer], { type: contentType || void 0 });
      }
      const result = await this.writeFile({
        path: options.path,
        directory: (_a = options.directory) !== null && _a !== void 0 ? _a : void 0,
        recursive: (_b = options.recursive) !== null && _b !== void 0 ? _b : false,
        data: blob
      });
      return { path: result.uri, blob };
    };
  }
  async initDb() {
    if (this._db !== void 0) {
      return this._db;
    }
    if (!("indexedDB" in window)) {
      throw this.unavailable("This browser doesn't support IndexedDB");
    }
    return new Promise((resolve2, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      request.onupgradeneeded = FilesystemWeb.doUpgrade;
      request.onsuccess = () => {
        this._db = request.result;
        resolve2(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        console.warn("db blocked");
      };
    });
  }
  static doUpgrade(event2) {
    const eventTarget = event2.target;
    const db = eventTarget.result;
    switch (event2.oldVersion) {
      case 0:
      case 1:
      default: {
        if (db.objectStoreNames.contains("FileStorage")) {
          db.deleteObjectStore("FileStorage");
        }
        const store = db.createObjectStore("FileStorage", { keyPath: "path" });
        store.createIndex("by_folder", "folder");
      }
    }
  }
  async dbRequest(cmd, args) {
    const readFlag = this._writeCmds.indexOf(cmd) !== -1 ? "readwrite" : "readonly";
    return this.initDb().then((conn) => {
      return new Promise((resolve2, reject) => {
        const tx = conn.transaction(["FileStorage"], readFlag);
        const store = tx.objectStore("FileStorage");
        const req = store[cmd](...args);
        req.onsuccess = () => resolve2(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  }
  async dbIndexRequest(indexName, cmd, args) {
    const readFlag = this._writeCmds.indexOf(cmd) !== -1 ? "readwrite" : "readonly";
    return this.initDb().then((conn) => {
      return new Promise((resolve2, reject) => {
        const tx = conn.transaction(["FileStorage"], readFlag);
        const store = tx.objectStore("FileStorage");
        const index2 = store.index(indexName);
        const req = index2[cmd](...args);
        req.onsuccess = () => resolve2(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  }
  getPath(directory, uriPath) {
    const cleanedUriPath = uriPath !== void 0 ? uriPath.replace(/^[/]+|[/]+$/g, "") : "";
    let fsPath = "";
    if (directory !== void 0)
      fsPath += "/" + directory;
    if (uriPath !== "")
      fsPath += "/" + cleanedUriPath;
    return fsPath;
  }
  async clear() {
    const conn = await this.initDb();
    const tx = conn.transaction(["FileStorage"], "readwrite");
    const store = tx.objectStore("FileStorage");
    store.clear();
  }
  /**
   * Read a file from disk
   * @param options options for the file read
   * @return a promise that resolves with the read file data result
   */
  async readFile(options) {
    const path = this.getPath(options.directory, options.path);
    const entry = await this.dbRequest("get", [path]);
    if (entry === void 0)
      throw Error("File does not exist.");
    return { data: entry.content ? entry.content : "" };
  }
  /**
   * Write a file to disk in the specified location on device
   * @param options options for the file write
   * @return a promise that resolves with the file write result
   */
  async writeFile(options) {
    const path = this.getPath(options.directory, options.path);
    let data = options.data;
    const encoding = options.encoding;
    const doRecursive = options.recursive;
    const occupiedEntry = await this.dbRequest("get", [path]);
    if (occupiedEntry && occupiedEntry.type === "directory")
      throw Error("The supplied path is a directory.");
    const parentPath = path.substr(0, path.lastIndexOf("/"));
    const parentEntry = await this.dbRequest("get", [parentPath]);
    if (parentEntry === void 0) {
      const subDirIndex = parentPath.indexOf("/", 1);
      if (subDirIndex !== -1) {
        const parentArgPath = parentPath.substr(subDirIndex);
        await this.mkdir({
          path: parentArgPath,
          directory: options.directory,
          recursive: doRecursive
        });
      }
    }
    if (!encoding && !(data instanceof Blob)) {
      data = data.indexOf(",") >= 0 ? data.split(",")[1] : data;
      if (!this.isBase64String(data))
        throw Error("The supplied data is not valid base64 content.");
    }
    const now = Date.now();
    const pathObj = {
      path,
      folder: parentPath,
      type: "file",
      size: data instanceof Blob ? data.size : data.length,
      ctime: now,
      mtime: now,
      content: data
    };
    await this.dbRequest("put", [pathObj]);
    return {
      uri: pathObj.path
    };
  }
  /**
   * Append to a file on disk in the specified location on device
   * @param options options for the file append
   * @return a promise that resolves with the file write result
   */
  async appendFile(options) {
    const path = this.getPath(options.directory, options.path);
    let data = options.data;
    const encoding = options.encoding;
    const parentPath = path.substr(0, path.lastIndexOf("/"));
    const now = Date.now();
    let ctime = now;
    const occupiedEntry = await this.dbRequest("get", [path]);
    if (occupiedEntry && occupiedEntry.type === "directory")
      throw Error("The supplied path is a directory.");
    const parentEntry = await this.dbRequest("get", [parentPath]);
    if (parentEntry === void 0) {
      const subDirIndex = parentPath.indexOf("/", 1);
      if (subDirIndex !== -1) {
        const parentArgPath = parentPath.substr(subDirIndex);
        await this.mkdir({
          path: parentArgPath,
          directory: options.directory,
          recursive: true
        });
      }
    }
    if (!encoding && !this.isBase64String(data))
      throw Error("The supplied data is not valid base64 content.");
    if (occupiedEntry !== void 0) {
      if (occupiedEntry.content instanceof Blob) {
        throw Error("The occupied entry contains a Blob object which cannot be appended to.");
      }
      if (occupiedEntry.content !== void 0 && !encoding) {
        data = btoa(atob(occupiedEntry.content) + atob(data));
      } else {
        data = occupiedEntry.content + data;
      }
      ctime = occupiedEntry.ctime;
    }
    const pathObj = {
      path,
      folder: parentPath,
      type: "file",
      size: data.length,
      ctime,
      mtime: now,
      content: data
    };
    await this.dbRequest("put", [pathObj]);
  }
  /**
   * Delete a file from disk
   * @param options options for the file delete
   * @return a promise that resolves with the deleted file data result
   */
  async deleteFile(options) {
    const path = this.getPath(options.directory, options.path);
    const entry = await this.dbRequest("get", [path]);
    if (entry === void 0)
      throw Error("File does not exist.");
    const entries = await this.dbIndexRequest("by_folder", "getAllKeys", [
      IDBKeyRange.only(path)
    ]);
    if (entries.length !== 0)
      throw Error("Folder is not empty.");
    await this.dbRequest("delete", [path]);
  }
  /**
   * Create a directory.
   * @param options options for the mkdir
   * @return a promise that resolves with the mkdir result
   */
  async mkdir(options) {
    const path = this.getPath(options.directory, options.path);
    const doRecursive = options.recursive;
    const parentPath = path.substr(0, path.lastIndexOf("/"));
    const depth = (path.match(/\//g) || []).length;
    const parentEntry = await this.dbRequest("get", [parentPath]);
    const occupiedEntry = await this.dbRequest("get", [path]);
    if (depth === 1)
      throw Error("Cannot create Root directory");
    if (occupiedEntry !== void 0)
      throw Error("Current directory does already exist.");
    if (!doRecursive && depth !== 2 && parentEntry === void 0)
      throw Error("Parent directory must exist");
    if (doRecursive && depth !== 2 && parentEntry === void 0) {
      const parentArgPath = parentPath.substr(parentPath.indexOf("/", 1));
      await this.mkdir({
        path: parentArgPath,
        directory: options.directory,
        recursive: doRecursive
      });
    }
    const now = Date.now();
    const pathObj = {
      path,
      folder: parentPath,
      type: "directory",
      size: 0,
      ctime: now,
      mtime: now
    };
    await this.dbRequest("put", [pathObj]);
  }
  /**
   * Remove a directory
   * @param options the options for the directory remove
   */
  async rmdir(options) {
    const { path, directory, recursive } = options;
    const fullPath = this.getPath(directory, path);
    const entry = await this.dbRequest("get", [fullPath]);
    if (entry === void 0)
      throw Error("Folder does not exist.");
    if (entry.type !== "directory")
      throw Error("Requested path is not a directory");
    const readDirResult = await this.readdir({ path, directory });
    if (readDirResult.files.length !== 0 && !recursive)
      throw Error("Folder is not empty");
    for (const entry2 of readDirResult.files) {
      const entryPath = `${path}/${entry2.name}`;
      const entryObj = await this.stat({ path: entryPath, directory });
      if (entryObj.type === "file") {
        await this.deleteFile({ path: entryPath, directory });
      } else {
        await this.rmdir({ path: entryPath, directory, recursive });
      }
    }
    await this.dbRequest("delete", [fullPath]);
  }
  /**
   * Return a list of files from the directory (not recursive)
   * @param options the options for the readdir operation
   * @return a promise that resolves with the readdir directory listing result
   */
  async readdir(options) {
    const path = this.getPath(options.directory, options.path);
    const entry = await this.dbRequest("get", [path]);
    if (options.path !== "" && entry === void 0)
      throw Error("Folder does not exist.");
    const entries = await this.dbIndexRequest("by_folder", "getAllKeys", [IDBKeyRange.only(path)]);
    const files = await Promise.all(entries.map(async (e) => {
      let subEntry = await this.dbRequest("get", [e]);
      if (subEntry === void 0) {
        subEntry = await this.dbRequest("get", [e + "/"]);
      }
      return {
        name: e.substring(path.length + 1),
        type: subEntry.type,
        size: subEntry.size,
        ctime: subEntry.ctime,
        mtime: subEntry.mtime,
        uri: subEntry.path
      };
    }));
    return { files };
  }
  /**
   * Return full File URI for a path and directory
   * @param options the options for the stat operation
   * @return a promise that resolves with the file stat result
   */
  async getUri(options) {
    const path = this.getPath(options.directory, options.path);
    let entry = await this.dbRequest("get", [path]);
    if (entry === void 0) {
      entry = await this.dbRequest("get", [path + "/"]);
    }
    return {
      uri: (entry === null || entry === void 0 ? void 0 : entry.path) || path
    };
  }
  /**
   * Return data about a file
   * @param options the options for the stat operation
   * @return a promise that resolves with the file stat result
   */
  async stat(options) {
    const path = this.getPath(options.directory, options.path);
    let entry = await this.dbRequest("get", [path]);
    if (entry === void 0) {
      entry = await this.dbRequest("get", [path + "/"]);
    }
    if (entry === void 0)
      throw Error("Entry does not exist.");
    return {
      type: entry.type,
      size: entry.size,
      ctime: entry.ctime,
      mtime: entry.mtime,
      uri: entry.path
    };
  }
  /**
   * Rename a file or directory
   * @param options the options for the rename operation
   * @return a promise that resolves with the rename result
   */
  async rename(options) {
    await this._copy(options, true);
    return;
  }
  /**
   * Copy a file or directory
   * @param options the options for the copy operation
   * @return a promise that resolves with the copy result
   */
  async copy(options) {
    return this._copy(options, false);
  }
  async requestPermissions() {
    return { publicStorage: "granted" };
  }
  async checkPermissions() {
    return { publicStorage: "granted" };
  }
  /**
   * Function that can perform a copy or a rename
   * @param options the options for the rename operation
   * @param doRename whether to perform a rename or copy operation
   * @return a promise that resolves with the result
   */
  async _copy(options, doRename = false) {
    let { toDirectory } = options;
    const { to, from, directory: fromDirectory } = options;
    if (!to || !from) {
      throw Error("Both to and from must be provided");
    }
    if (!toDirectory) {
      toDirectory = fromDirectory;
    }
    const fromPath = this.getPath(fromDirectory, from);
    const toPath = this.getPath(toDirectory, to);
    if (fromPath === toPath) {
      return {
        uri: toPath
      };
    }
    if (isPathParent(fromPath, toPath)) {
      throw Error("To path cannot contain the from path");
    }
    let toObj;
    try {
      toObj = await this.stat({
        path: to,
        directory: toDirectory
      });
    } catch (e) {
      const toPathComponents = to.split("/");
      toPathComponents.pop();
      const toPath2 = toPathComponents.join("/");
      if (toPathComponents.length > 0) {
        const toParentDirectory = await this.stat({
          path: toPath2,
          directory: toDirectory
        });
        if (toParentDirectory.type !== "directory") {
          throw new Error("Parent directory of the to path is a file");
        }
      }
    }
    if (toObj && toObj.type === "directory") {
      throw new Error("Cannot overwrite a directory with a file");
    }
    const fromObj = await this.stat({
      path: from,
      directory: fromDirectory
    });
    const updateTime = async (path, ctime2, mtime) => {
      const fullPath = this.getPath(toDirectory, path);
      const entry = await this.dbRequest("get", [fullPath]);
      entry.ctime = ctime2;
      entry.mtime = mtime;
      await this.dbRequest("put", [entry]);
    };
    const ctime = fromObj.ctime ? fromObj.ctime : Date.now();
    switch (fromObj.type) {
      case "file": {
        const file = await this.readFile({
          path: from,
          directory: fromDirectory
        });
        if (doRename) {
          await this.deleteFile({
            path: from,
            directory: fromDirectory
          });
        }
        let encoding;
        if (!(file.data instanceof Blob) && !this.isBase64String(file.data)) {
          encoding = Encoding.UTF8;
        }
        const writeResult = await this.writeFile({
          path: to,
          directory: toDirectory,
          data: file.data,
          encoding
        });
        if (doRename) {
          await updateTime(to, ctime, fromObj.mtime);
        }
        return writeResult;
      }
      case "directory": {
        if (toObj) {
          throw Error("Cannot move a directory over an existing object");
        }
        try {
          await this.mkdir({
            path: to,
            directory: toDirectory,
            recursive: false
          });
          if (doRename) {
            await updateTime(to, ctime, fromObj.mtime);
          }
        } catch (e) {
        }
        const contents = (await this.readdir({
          path: from,
          directory: fromDirectory
        })).files;
        for (const filename of contents) {
          await this._copy({
            from: `${from}/${filename.name}`,
            to: `${to}/${filename.name}`,
            directory: fromDirectory,
            toDirectory
          }, doRename);
        }
        if (doRename) {
          await this.rmdir({
            path: from,
            directory: fromDirectory
          });
        }
      }
    }
    return {
      uri: toPath
    };
  }
  isBase64String(str) {
    try {
      return btoa(atob(str)) == str;
    } catch (err) {
      return false;
    }
  }
}
FilesystemWeb._debug = true;
const web$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  FilesystemWeb
}, Symbol.toStringTag, { value: "Module" }));
const Share = registerPlugin("Share", {
  web: () => __vitePreload(() => Promise.resolve().then(() => web), true ? void 0 : void 0, import.meta.url).then((m) => new m.ShareWeb())
});
const index = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Share
}, Symbol.toStringTag, { value: "Module" }));
class ShareWeb extends WebPlugin {
  async canShare() {
    if (typeof navigator === "undefined" || !navigator.share) {
      return { value: false };
    } else {
      return { value: true };
    }
  }
  async share(options) {
    if (typeof navigator === "undefined" || !navigator.share) {
      throw this.unavailable("Share API not available in this browser");
    }
    await navigator.share({
      title: options.title,
      text: options.text,
      url: options.url
    });
    return {};
  }
}
const web = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ShareWeb
}, Symbol.toStringTag, { value: "Module" }));
export {
  exitNativeApp as A,
  resolveNotificationActionTarget as B,
  clearTestAccountSession as C,
  initDebugLogger as D,
  resolveTestAccountForumResponse as E,
  isTestAccountCredentials as F,
  TEST_ACCOUNT_LOGIN_METHOD as G,
  subscribeDebugLogs as H,
  clearDebugLogs as I,
  isTauriDesktopRuntime as J,
  isLikelyIOSUserAgent as K,
  registerPlugin as L,
  invoke as M,
  index$9 as N,
  debug_logger as O,
  test_account as P,
  native as Q,
  core as R,
  event as S,
  TEST_ACCOUNT as T,
  window$1 as U,
  index$8 as V,
  index$2 as W,
  index$1 as X,
  index as Y,
  __vitePreload as _,
  invokeNative$1 as a,
  isTauriRuntime as b,
  isCapacitorRuntime as c,
  detectRuntime as d,
  isLikelyAndroidUserAgent as e,
  platformBridge as f,
  getNativeAppVersion as g,
  resolveTestAccountCachePayload as h,
  isTestAccountSession as i,
  requestRefresh as j,
  clearSnapshot as k,
  writeElectricitySnapshot as l,
  writeExamSnapshot as m,
  writeWidgetThemeColor as n,
  readNativeBinaryFile as o,
  pushDebugLog as p,
  getRuntime as q,
  resolveTestAccountHttpResponse as r,
  markTestAccountSession as s,
  toNativeFileSrc as t,
  seedTestAccountCaches as u,
  getDebugLogs as v,
  writeSnapshotWithRetry as w,
  formatDebugTime as x,
  getTestAccountGrades as y,
  getCurrentNativeWindow as z
};
