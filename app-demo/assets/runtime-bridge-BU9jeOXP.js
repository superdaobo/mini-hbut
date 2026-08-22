const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./index-CeFN6dWb.js","./more-modules-CfNfahoc.js"])))=>i.map(i=>d[i]);
import { i as isViewAllowed } from "./more-modules-CfNfahoc.js";
const scriptRel = "modulepreload";
const assetsURL = function(dep, importerUrl) {
  return new URL(dep, importerUrl).href;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    let allSettled2 = function(promises) {
      return Promise.all(
        promises.map(
          (p) => Promise.resolve(p).then(
            (value) => ({ status: "fulfilled", value }),
            (reason) => ({ status: "rejected", reason })
          )
        )
      );
    };
    const links = document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute("nonce");
    promise = allSettled2(
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
const REMEMBERED_USERNAME_KEY = "hbu_username";
const STUDENT_ID_RE = /^\d{10}$/;
const normalize = (value) => String(value ?? "").trim();
const canonicalizeStudentId = (value) => {
  const raw = normalize(value);
  if (!STUDENT_ID_RE.test(raw)) return "";
  const numeric = Number(raw);
  if (!Number.isSafeInteger(numeric) || numeric < 0) return "";
  return String(numeric).padStart(10, "0");
};
const saveRememberedUsername = (value) => {
  const sid = canonicalizeStudentId(value);
  try {
    if (!sid) {
      globalThis.localStorage?.removeItem(REMEMBERED_USERNAME_KEY);
      return "";
    }
    globalThis.localStorage?.setItem(REMEMBERED_USERNAME_KEY, sid);
  } catch {
  }
  return sid;
};
const clearRememberedUsername = () => {
  try {
    globalThis.localStorage?.removeItem(REMEMBERED_USERNAME_KEY);
  } catch {
  }
};
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
  saveRememberedUsername(TEST_ACCOUNT.studentId);
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
    clearRememberedUsername();
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
  constructor(message, code, data) {
    super(message);
    this.message = message;
    this.code = code;
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
          // https://github.com/facebook/react/issues/20030
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
    } catch (error) {
      return Promise.reject(error);
    }
  }
  async deleteCookie(options) {
    try {
      document.cookie = `${options.key}=; Max-Age=0`;
    } catch (error) {
      return Promise.reject(error);
    }
  }
  async clearCookies() {
    try {
      const cookies = document.cookie.split(";") || [];
      for (const cookie of cookies) {
        document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${(/* @__PURE__ */ new Date()).toUTCString()};path=/`);
      }
    } catch (error) {
      return Promise.reject(error);
    }
  }
  async clearAllCookies() {
    try {
      await this.clearCookies();
    } catch (error) {
      return Promise.reject(error);
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
  reader.onerror = (error) => reject(error);
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
  const type = headers["content-type"] || "";
  if (typeof options.data === "string") {
    output.body = options.data;
  } else if (type.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.data || {})) {
      params.set(key, value);
    }
    output.body = params.toString();
  } else if (type.includes("multipart/form-data") || options.data instanceof FormData) {
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
  } else if (type.includes("application/json") || typeof options.data === "object") {
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
const index$a = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
const isIOSLike = () => {
  const nav = globalThis.navigator;
  if (!nav) return false;
  const ua = String(nav.userAgent || "");
  const platform = String(nav.platform || "");
  const maxTouchPoints = nav.maxTouchPoints || 0;
  return /iPad|iPhone|iPod/i.test(ua) || platform === "MacIntel" && maxTouchPoints > 1;
};
const isAndroidLike = () => {
  const nav = globalThis.navigator;
  if (!nav) return false;
  return /Android/i.test(String(nav.userAgent || ""));
};
const isDesktopLike = () => !isIOSLike() && !isAndroidLike();
const isMobileLike = () => isIOSLike() || isAndroidLike();
const buildBackgroundCheckState$2 = () => ({
  supported: true,
  enabled: false,
  scheduler: { kind: "capacitor-background-fetch", status: "unavailable" },
  auth: { status: "unknown" },
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastResult: "unknown",
  reason: "Capacitor 壳已退役 BackgroundFetch（#616）：移动后台检查请使用 Tauri 构建（WorkManager/BGAppRefresh）",
  updatedAt: (/* @__PURE__ */ new Date()).toISOString()
});
const getWindow = () => typeof window === "undefined" ? void 0 : window;
const getCapacitor = () => getWindow()?.Capacitor;
const getPlugin = (name) => getCapacitor()?.Plugins?.[name];
let hbutNativeProxy = null;
const getRegisteredPlugin = async (name) => {
  const globalPlugin = getPlugin(name);
  if (globalPlugin) return { plugin: globalPlugin };
  try {
    const mod = await __vitePreload(() => Promise.resolve().then(() => index$a), true ? void 0 : void 0, import.meta.url);
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
    const mod = await __vitePreload(() => Promise.resolve().then(() => index$8), true ? void 0 : void 0, import.meta.url);
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
    const mod = await __vitePreload(() => Promise.resolve().then(() => index$7), true ? void 0 : void 0, import.meta.url);
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
      const id = payload.id ?? Math.floor(Date.now() % 2147483e3);
      const isIOS = isIOSLike();
      const notification = {
        id,
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
  async shareLinkOrFile(target, title) {
    const share = getPlugin("Share");
    if (share?.share) {
      const t = String(target || "").trim();
      const titleText = title || "Mini-HBUT";
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
  async setAggressiveKeepAlive(_enable) {
    return {
      supported: false,
      active: false,
      source: "capacitor",
      reason: "前台服务保活已退役（#616）：后台检查由 Tauri 构建的 WorkManager/BGAppRefresh 提供"
    };
  },
  async getAggressiveKeepAliveState() {
    return {
      supported: false,
      active: false,
      source: "capacitor",
      reason: "前台服务保活已退役（#616）"
    };
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
      const app2 = await __vitePreload(() => Promise.resolve().then(() => index$6), true ? void 0 : void 0, import.meta.url);
      const openSettings = app2.App.openSettings;
      if (typeof openSettings === "function") {
        await openSettings();
        return true;
      }
      return false;
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
      const app2 = await __vitePreload(() => Promise.resolve().then(() => index$6), true ? void 0 : void 0, import.meta.url);
      const openSettings = app2.App.openSettings;
      if (typeof openSettings === "function") {
        await openSettings();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
  // ---- 后台检查能力（#609 契约）：迁移期降级，不伪造 ready ----
  async getBackgroundCheckState() {
    return buildBackgroundCheckState$2();
  },
  async setBackgroundCheckConfig(_config) {
    return buildBackgroundCheckState$2();
  },
  async runBackgroundCheckNow() {
    return "unknown";
  },
  async syncBackgroundCheckContext(_context) {
    return false;
  },
  async clearBackgroundCheckContext() {
    return false;
  },
  async consumeBackgroundEvents(_handler) {
    return null;
  }
};
let desktopKeepAliveActive = false;
const isAndroidLikeUA = () => /android/i.test(String(globalThis?.navigator?.userAgent || ""));
const isIOSLikeUA = () => /(iphone|ipad|ipod)/i.test(String(globalThis?.navigator?.userAgent || ""));
const isMobileLikeUA = () => isAndroidLikeUA() || isIOSLikeUA();
const buildBackgroundCheckState$1 = () => {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (isMobileLikeUA()) {
    const kind = isAndroidLikeUA() ? "android-workmanager" : "ios-bgapprefresh";
    return {
      supported: true,
      enabled: false,
      scheduler: { kind, status: "unavailable" },
      auth: { status: "unknown" },
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastResult: "unknown",
      reason: `移动端 ${kind} 后台检查插件尚未接入（#611/#612/#613），当前不可用`,
      updatedAt: now
    };
  }
  return {
    supported: false,
    enabled: false,
    scheduler: { kind: "desktop-foreground", status: "unavailable" },
    auth: { status: "unknown" },
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastResult: "unknown",
    reason: "桌面端无系统后台调度：仅支持前台轮询与屏幕常亮，不提供移动后台检查",
    updatedAt: now
  };
};
const mapPluginStateToContract = (state) => {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const isMobile = isMobileLikeUA();
  const kind = isMobile ? isAndroidLikeUA() ? "android-workmanager" : "ios-bgapprefresh" : "desktop-foreground";
  const enabled = state.enabled === true;
  const lastRunAt = state.lastRunAt ? String(state.lastRunAt) : null;
  const lastRunOk = state.lastRunOk === true;
  const error = state.error ? String(state.error) : void 0;
  return {
    supported: isMobile,
    enabled,
    scheduler: {
      kind,
      // 插件已配置且启用 -> ready；未启用 -> disabled（真实值，不伪造）
      status: enabled ? "ready" : "disabled"
    },
    auth: {
      status: error ? "expired" : lastRunAt ? "ready" : "unknown"
    },
    lastAttemptAt: lastRunAt,
    lastSuccessAt: lastRunOk ? lastRunAt : null,
    lastResult: lastRunOk ? "unchanged" : error ? "network-error" : "unknown",
    lastError: error,
    reason: error ? `最近一次后台检查异常：${error}` : `后台调度：${kind}`,
    updatedAt: now
  };
};
const normalizePermission$1 = (value) => {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  return "prompt";
};
const invokeNative$1 = async (command, args) => {
  const core$1 = await __vitePreload(() => Promise.resolve().then(() => core), true ? void 0 : void 0, import.meta.url);
  if (typeof args === "undefined") return core$1.invoke(command);
  return core$1.invoke(command, args);
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
    await invokeNative$1("open_external_url", { url: target });
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
      const shell = await __vitePreload(() => Promise.resolve().then(() => index$5), true ? void 0 : void 0, import.meta.url);
      await shell.open(target);
      return true;
    } catch {
      const encodedTarget = encodeURI(target);
      if (encodedTarget !== target) {
        try {
          const shell = await __vitePreload(() => Promise.resolve().then(() => index$5), true ? void 0 : void 0, import.meta.url);
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
      const state = await invokeNative$1("get_notification_permission_native");
      return normalizePermission$1(String(state));
    } catch {
    }
    try {
      const mod = await __vitePreload(() => Promise.resolve().then(() => index$4), true ? void 0 : void 0, import.meta.url);
      const granted = await mod.isPermissionGranted();
      return granted ? "granted" : "prompt";
    } catch {
      return "prompt";
    }
  },
  async requestNotificationPermission() {
    try {
      const state = await invokeNative$1("request_notification_permission_native");
      return normalizePermission$1(String(state));
    } catch {
    }
    try {
      const mod = await __vitePreload(() => Promise.resolve().then(() => index$4), true ? void 0 : void 0, import.meta.url);
      const state = await mod.requestPermission();
      return normalizePermission$1(String(state));
    } catch {
      return "denied";
    }
  },
  async ensureNotificationChannel(channelId) {
    try {
      const mod = await __vitePreload(() => Promise.resolve().then(() => index$4), true ? void 0 : void 0, import.meta.url);
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
      await invokeNative$1("send_local_notification_native", {
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
      const mod = await __vitePreload(() => Promise.resolve().then(() => index$4), true ? void 0 : void 0, import.meta.url);
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
      const mod = await __vitePreload(() => Promise.resolve().then(() => index$4), true ? void 0 : void 0, import.meta.url);
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
      const mod = await __vitePreload(() => import("./index-CeFN6dWb.js"), true ? __vite__mapDeps([0,1]) : void 0, import.meta.url);
      if (typeof mod.keepScreenOn === "function") {
        await mod.keepScreenOn(enable);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
  async shareLinkOrFile(target, title) {
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
  },
  // ---- 后台检查能力（#609 契约）：真实状态映射 + 插件接线（#615 扩展） ----
  async getBackgroundCheckState() {
    try {
      const state = await invokeNative$1("plugin:hbut-background|bg_get_state");
      if (state && typeof state === "object" && !state.error) {
        return mapPluginStateToContract(state);
      }
    } catch {
    }
    return buildBackgroundCheckState$1();
  },
  async setBackgroundCheckConfig(config) {
    const business = [];
    if (config?.checkGradeChanges) business.push("grades");
    if (config?.checkExamChanges) business.push("exams");
    if (config?.checkSchoolInbox) business.push("school_inbox");
    try {
      const result = await invokeNative$1(
        "plugin:hbut-background|bg_configure",
        {
          config: {
            schema: 1,
            enabled: !!config?.enabled,
            intervalMinutes: Number(config?.intervalMinutes || 30),
            business,
            scope: null
          }
        }
      );
      if (result && typeof result === "object" && result.error) {
        const state = buildBackgroundCheckState$1();
        return {
          ...state,
          enabled: !!config?.enabled,
          lastError: String(result.error),
          reason: "后台配置同步失败（native 端错误）"
        };
      }
      return {
        ...buildBackgroundCheckState$1(),
        enabled: !!config?.enabled,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastResult: "unknown",
        reason: `后台检查配置已同步（业务：${business.join(",") || "无"}）`
      };
    } catch (error) {
      const state = buildBackgroundCheckState$1();
      return {
        ...state,
        reason: `${state.reason}；配置变更暂未生效（后台插件未接入）`
      };
    }
  },
  async runBackgroundCheckNow() {
    return "unknown";
  },
  async syncBackgroundCheckContext(context) {
    const sid = String(context?.studentId || "").trim();
    if (!sid) return false;
    const business = [];
    if (context?.config?.checkGradeChanges !== false) business.push("grades");
    if (context?.config?.checkExamChanges !== false) business.push("exams");
    if (context?.config?.checkSchoolInbox !== false) business.push("school_inbox");
    try {
      const result = await invokeNative$1(
        "plugin:hbut-background|bg_sync_context",
        {
          context: {
            schema: 1,
            scope: sid,
            business,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        }
      );
      return !(result && typeof result === "object" && result.error);
    } catch {
      return false;
    }
  },
  async clearBackgroundCheckContext() {
    try {
      const result = await invokeNative$1(
        "plugin:hbut-background|bg_clear_context",
        { scope: null }
      );
      return !(result && typeof result === "object" && result.error);
    } catch {
      return false;
    }
  },
  async consumeBackgroundEvents(_handler) {
    return null;
  }
};
const peekBackgroundEvents = async (limit) => {
  try {
    const result = await invokeNative$1(
      "plugin:hbut-background|bg_peek_events",
      { limit: limit ?? null }
    );
    return Array.isArray(result?.events) ? result.events : [];
  } catch {
    return [];
  }
};
const ackBackgroundEvents = async (ids) => {
  const list = Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && id.length > 0) : [];
  if (list.length === 0) return true;
  try {
    await invokeNative$1("plugin:hbut-background|bg_consume_events", {
      limit: null,
      ids: list
    });
    return true;
  } catch {
    return false;
  }
};
const scheduleLocalNotification = async (input) => {
  try {
    await invokeNative$1("schedule_local_notification_native", {
      id: input.id,
      channelId: input.channelId,
      title: input.title,
      body: input.body,
      targetView: input.targetView || "notifications",
      atEpochSecs: input.atEpochSecs
    });
    return true;
  } catch {
    return false;
  }
};
const getPendingLocalNotifications = async () => {
  try {
    const items = await invokeNative$1(
      "get_pending_local_notifications_native"
    );
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
};
const cancelLocalNotifications = async (ids) => {
  try {
    await invokeNative$1("cancel_local_notifications_native", { ids: Array.isArray(ids) ? ids : [] });
    return true;
  } catch {
    return false;
  }
};
const tauri = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ackBackgroundEvents,
  cancelLocalNotifications,
  getPendingLocalNotifications,
  peekBackgroundEvents,
  scheduleLocalNotification,
  tauriBridge
}, Symbol.toStringTag, { value: "Module" }));
const normalizePermission = (value) => {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  return "prompt";
};
const openByWindow = (target) => {
  window.open(target, "_blank", "noopener,noreferrer");
};
const buildBackgroundCheckState = () => ({
  supported: false,
  enabled: false,
  scheduler: { kind: "unsupported", status: "unavailable" },
  auth: { status: "unknown" },
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastResult: "unknown",
  reason: "Web 环境不支持后台智能检查：页面关闭后无任何调度能力",
  updatedAt: (/* @__PURE__ */ new Date()).toISOString()
});
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
  async shareLinkOrFile(target, title) {
    try {
      if (navigator.share) {
        await navigator.share({ title, url: target });
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
  },
  // ---- 后台检查能力（#609 契约）：Web 一律安全降级，不抛未处理异常 ----
  async getBackgroundCheckState() {
    return buildBackgroundCheckState();
  },
  async setBackgroundCheckConfig(_config) {
    return buildBackgroundCheckState();
  },
  async runBackgroundCheckNow() {
    return "unknown";
  },
  async syncBackgroundCheckContext(_context) {
    return false;
  },
  async clearBackgroundCheckContext() {
    return false;
  },
  async consumeBackgroundEvents(_handler) {
    return null;
  }
};
const isPlainObject$1 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const toSafeString = (value) => {
  const text = String(value ?? "").trim();
  return text === "null" || text === "undefined" ? "" : text;
};
const toEventType = (value) => {
  const text = toSafeString(value);
  if (text === "grades-changed" || text === "exams-changed" || text === "school-message") return text;
  return "unknown";
};
const toSchedulerKind = (value) => {
  const text = toSafeString(value);
  if (text === "android-workmanager" || text === "ios-bgapprefresh" || text === "capacitor-background-fetch" || text === "desktop-foreground") {
    return text;
  }
  return "unsupported";
};
const normalizeBackgroundDetectedEvent = (raw) => {
  if (!isPlainObject$1(raw)) return null;
  const id = toSafeString(raw.id);
  const detectedAt = toSafeString(raw.detectedAt);
  const signature = toSafeString(raw.signature);
  if (!id || !detectedAt || !signature) return null;
  const targetView = raw.targetView ? toSafeString(raw.targetView) : void 0;
  const presented = raw.presented === true || raw.presented === "true" || raw.presented === 1;
  const source = toSchedulerKind(raw.source);
  let meta;
  if (isPlainObject$1(raw.meta)) {
    meta = {};
    for (const [key, value] of Object.entries(raw.meta)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        meta[key] = value;
      }
    }
    if (Object.keys(meta).length === 0) meta = void 0;
  }
  return { id, type: toEventType(raw.type), detectedAt, source, targetView, presented, signature, meta };
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
  async shareLinkOrFile(target, title) {
    return pickBridge().shareLinkOrFile(target, title);
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
  },
  // ---- 后台检查能力（#609 契约）----
  async getBackgroundCheckState() {
    return pickBridge().getBackgroundCheckState();
  },
  async setBackgroundCheckConfig(config) {
    return pickBridge().setBackgroundCheckConfig(config);
  },
  async runBackgroundCheckNow() {
    return pickBridge().runBackgroundCheckNow();
  },
  async syncBackgroundCheckContext(context) {
    return pickBridge().syncBackgroundCheckContext(context);
  },
  async clearBackgroundCheckContext() {
    return pickBridge().clearBackgroundCheckContext();
  },
  async consumeBackgroundEvents(handler) {
    return pickBridge().consumeBackgroundEvents(handler);
  }
};
const index$9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getRuntime,
  normalizeBackgroundDetectedEvent,
  platformBridge
}, Symbol.toStringTag, { value: "Module" }));
const STORAGE_KEY = "hbu_debug_logs_v1";
const MAX_MEMORY_LOGS = 1200;
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
  const scope = parseScope(first);
  const message = values.join(" ").replace(/\s+/g, " ").trim();
  const details = values.join("\n");
  return { scope, message, details };
};
const persistLogs = () => {
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
  const { scope, message, details } = normalizeMessage(args);
  if (!message) return;
  const record = {
    id: `${Date.now()}-${seq += 1}`,
    ts: Date.now(),
    level,
    scope,
    message,
    details
  };
  records.push(record);
  if (records.length > MAX_MEMORY_LOGS) {
    records = records.slice(records.length - MAX_MEMORY_LOGS);
  }
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
    } catch (error) {
      pushRecord("error", [
        `[HTTP] 请求失败 ${method} ${url} (${Date.now() - start}ms)`,
        error
      ]);
      throw error;
    }
  };
  patchedFetch = true;
};
const loadStoredLogs = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
  return [];
};
let rustPollTimer = null;
let lastRustLogId = 0;
let rustBridgeBusy = false;
const isTauriWindow = () => typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
const invokeSilent = async (command, args) => {
  if (!isTauriWindow()) return null;
  try {
    const core$1 = await __vitePreload(() => Promise.resolve().then(() => core), true ? void 0 : void 0, import.meta.url);
    return await core$1.invoke(command, args);
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
      const id = Number(item.id || 0);
      if (id > lastRustLogId) lastRustLogId = id;
      const level = item.level || "info";
      const scope = String(item.scope || "Rust");
      const message = String(item.message || "");
      if (!message) continue;
      const record = {
        id: `rust-${id || Date.now()}-${seq += 1}`,
        ts: Number(item.ts) || Date.now(),
        level: ["debug", "info", "warn", "error", "log"].includes(level) ? level : "info",
        scope,
        message: `[${scope}] ${message}`,
        details: item.details !== void 0 ? asText(item.details) : `[${scope}] ${message}`
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
const pushDebugLog = (scope, message, level = "info", details) => {
  const prefix = `[${scope || "APP"}] ${message || ""}`.trim();
  const payload = details === void 0 ? [prefix] : [prefix, details];
  pushRecord(level, payload);
  if (typeof window === "undefined") return;
  if (rustBridgeBusy) return;
  if (String(scope || "") === "Native") return;
  void (async () => {
    try {
      await invokeSilent("push_runtime_log", {
        scope: scope || "Frontend",
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
  notifyListeners();
};
const subscribeDebugLogs = (listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getDebugLogEventName = () => LOG_EVENT;
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
  getDebugLogEventName,
  getDebugLogs,
  initDebugLogger,
  pullRuntimeLogsFromRust,
  pushDebugLog,
  subscribeDebugLogs
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
  const id = Number(threadId || 0);
  return forumThreads.find((thread) => Number(thread.id) === id) || forumThreads[0];
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
    const items = categoryId ? forumThreads.filter((thread) => Number(thread.category_id) === categoryId) : forumThreads;
    return { items: clone(items) };
  }
  if (method === "GET" && pathname === "/search") {
    const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const items = query ? forumThreads.filter(
      (thread) => `${thread.title} ${thread.content_md}`.toLowerCase().includes(query)
    ) : forumThreads;
    return { items: clone(items) };
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
const isTauriMobileRuntime = () => isTauriRuntime() && (isLikelyIOSUserAgent() || isLikelyAndroidUserAgent());
const SILENT_NATIVE_COMMANDS = /* @__PURE__ */ new Set([
  "push_runtime_log",
  "get_runtime_logs",
  "clear_runtime_logs",
  "get_runtime_diag"
]);
const invokeNative = async (command, args) => {
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
  const core$1 = await __vitePreload(() => Promise.resolve().then(() => core), true ? void 0 : void 0, import.meta.url);
  try {
    const result = await core$1.invoke(command, args);
    if (!silent) {
      pushDebugLog("Native", `invoke 成功：${command} (${Date.now() - startedAt}ms)`, "info");
    }
    return result;
  } catch (error) {
    if (!silent) {
      pushDebugLog("Native", `invoke 失败：${command} (${Date.now() - startedAt}ms)`, "error", error);
    }
    throw error;
  }
};
const getCurrentNativeWindow = async () => {
  if (!isTauriRuntime()) return null;
  const windowApi = await __vitePreload(() => Promise.resolve().then(() => window$1), true ? void 0 : void 0, import.meta.url);
  return windowApi.getCurrentWindow();
};
const exitNativeApp = async () => {
  if (isTauriRuntime()) {
    await invokeNative("exit_app");
    return;
  }
  if (isCapacitorRuntime()) {
    try {
      const app2 = await __vitePreload(() => Promise.resolve().then(() => index$6), true ? void 0 : void 0, import.meta.url);
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
      const app2 = await __vitePreload(() => Promise.resolve().then(() => index$6), true ? void 0 : void 0, import.meta.url);
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
    const core$1 = await __vitePreload(() => Promise.resolve().then(() => core), true ? void 0 : void 0, import.meta.url);
    return core$1.convertFileSrc(filePath);
  }
  if (isCapacitorRuntime()) {
    const core2 = await __vitePreload(() => Promise.resolve().then(() => index$a), true ? void 0 : void 0, import.meta.url);
    return core2.Capacitor.convertFileSrc(filePath);
  }
  return filePath;
};
const readNativeBinaryFile = async (filePath) => {
  if (!isTauriRuntime()) {
    throw new Error("当前运行时不支持读取本地文件");
  }
  const fsPlugin = await __vitePreload(() => Promise.resolve().then(() => index$3), true ? void 0 : void 0, import.meta.url);
  return fsPlugin.readFile(filePath);
};
const identityDeviceStatus = () => invokeNative("identity_device_status");
const identityGetPublicKey = () => invokeNative("identity_get_public_key");
const identityEnrollDevice = (args) => invokeNative("identity_enroll_device", args);
const identitySignAuthRequest = (args) => invokeNative("identity_sign_auth_request", args);
const identityRevokeCurrentDeviceLocal = (args) => invokeNative("identity_revoke_current_device_local", args);
const identityFetchAuthHistory = (args) => invokeNative("identity_fetch_auth_history", args);
const getIdentityDeviceDisplayName = () => {
  const ua = String(globalThis?.navigator?.userAgent || "");
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS 设备";
  if (/android/i.test(ua)) return "Android 设备";
  if (/windows/i.test(ua)) return "Windows PC";
  if (/mac/i.test(ua)) return "Mac";
  if (/linux/i.test(ua)) return "Linux";
  return "Mini-HBUT 设备";
};
const native = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  exitNativeApp,
  getCurrentNativeWindow,
  getIdentityDeviceDisplayName,
  getNativeAppVersion,
  identityDeviceStatus,
  identityEnrollDevice,
  identityFetchAuthHistory,
  identityGetPublicKey,
  identityRevokeCurrentDeviceLocal,
  identitySignAuthRequest,
  invokeNative,
  isCapacitorRuntime,
  isLikelyAndroidUserAgent,
  isLikelyIOSUserAgent,
  isTauriDesktopRuntime,
  isTauriMobileRuntime,
  isTauriRuntime,
  readNativeBinaryFile,
  toNativeFileSrc
}, Symbol.toStringTag, { value: "Module" }));
const MINI_HBUT_SCHEME = "minihbut";
const MINI_HBUT_DEEPLINK_MAX_LENGTH = 2048;
const IDENTITY_REQUEST_ID_PATTERN = /^ar_[A-Za-z0-9_-]{8,64}$/;
const IDENTITY_HANDOFF_PATTERN = /^[A-Za-z0-9._~-]{32,128}$/;
const fail = (code, message) => ({
  ok: false,
  error: { code, message }
});
const toWidgetSource = (url) => url.searchParams.get("source") || "widget";
const parseMiniHbutDeepLink = (rawUrl) => {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    return fail("invalid-url", "无效的链接");
  }
  const trimmed = rawUrl.trim();
  if (trimmed.length > MINI_HBUT_DEEPLINK_MAX_LENGTH) {
    return fail("oversized", "链接过长");
  }
  if (!trimmed.toLowerCase().startsWith(`${MINI_HBUT_SCHEME}:`)) {
    return fail("wrong-scheme", "不支持的链接");
  }
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return fail("invalid-url", "无效的链接");
  }
  if (url.protocol !== `${MINI_HBUT_SCHEME}:`) {
    return fail("wrong-scheme", "不支持的链接");
  }
  if (url.username !== "" || url.password !== "") {
    return fail("userinfo-rejected", "不支持的链接");
  }
  const host = url.hostname;
  if (host === "schedule") {
    const date = url.searchParams.get("date") || "";
    const periodRaw = url.searchParams.get("period") || "";
    const period = /^\d+$/.test(periodRaw) ? Number(periodRaw) : 0;
    return { ok: true, link: { kind: "widget-schedule", date, period, source: toWidgetSource(url) } };
  }
  if (host === "electricity") {
    return { ok: true, link: { kind: "navigate", view: "electricity", source: toWidgetSource(url) } };
  }
  if (host === "exam") {
    return { ok: true, link: { kind: "navigate", view: "exams", source: toWidgetSource(url) } };
  }
  if (host === "identity") {
    return parseIdentityDeepLink(url);
  }
  return fail("unsupported-host", "不支持的链接");
};
const parseIdentityDeepLink = (url) => {
  const requestId = url.searchParams.get("request_id") || "";
  const handoff = url.searchParams.get("handoff") || "";
  if (!IDENTITY_REQUEST_ID_PATTERN.test(requestId) || !IDENTITY_HANDOFF_PATTERN.test(handoff)) {
    return fail("invalid-identity", "授权请求无效");
  }
  return { ok: true, link: { kind: "identity", requestId, handoff } };
};
const installMiniHbutDeepLinkListeners = async (handler) => {
  const cleanups = [];
  const handleUrls = (urls) => {
    for (const raw of urls) {
      const result = parseMiniHbutDeepLink(raw);
      if (!result.ok) continue;
      try {
        handler(result.link);
      } catch {
      }
    }
  };
  if (isTauriRuntime()) {
    try {
      const deepLink = await __vitePreload(() => Promise.resolve().then(() => index$2), true ? void 0 : void 0, import.meta.url);
      try {
        const startUrls = await deepLink.getCurrent();
        if (Array.isArray(startUrls) && startUrls.length > 0) handleUrls(startUrls);
      } catch {
      }
      try {
        const unlisten = await deepLink.onOpenUrl(handleUrls);
        cleanups.push(unlisten);
      } catch {
      }
    } catch {
    }
  } else if (isCapacitorRuntime()) {
    try {
      const app2 = await __vitePreload(() => Promise.resolve().then(() => index$6), true ? void 0 : void 0, import.meta.url);
      const listener = await app2.App.addListener("appUrlOpen", (event2) => {
        const url = event2?.url;
        if (typeof url === "string" && url) handleUrls([url]);
      });
      cleanups.push(() => {
        void listener.remove();
      });
    } catch {
    }
  }
  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
      }
    }
  };
};
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const todayCourseSnapshotSchema = {
  required: ["version", "generated_at", "date", "student_id", "week_index", "weekday", "courses"],
  properties: {
    version: { type: "integer", const: 1 },
    generated_at: { type: "string", pattern: ISO_DATE_TIME_PATTERN.source },
    date: { type: "string", pattern: DATE_PATTERN.source },
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
          time_start: { type: "string", pattern: TIME_PATTERN.source },
          time_end: { type: "string", pattern: TIME_PATTERN.source },
          name: { type: "string", minLength: 1, maxLength: 80 },
          location: { type: "string", maxLength: 80 },
          teacher: { type: "string", maxLength: 80 },
          color: { type: "string", pattern: COLOR_PATTERN.source }
        }
      }
    }
  }
};
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const escapeJsonPointer = (value) => value.replace(/~/g, "~0").replace(/\//g, "~1");
const validateAllowedProperties = (value, allowed, instancePath, schemaPath, addError) => {
  for (const property of Object.keys(value)) {
    if (!allowed.has(property)) {
      addError(
        instancePath,
        `${schemaPath}/additionalProperties`,
        "additionalProperties",
        "must NOT have additional properties",
        { additionalProperty: property }
      );
    }
  }
};
const validateRequiredProperties = (value, required, instancePath, schemaPath, addError) => {
  for (const property of required) {
    if (!Object.prototype.hasOwnProperty.call(value, property)) {
      addError(
        instancePath,
        `${schemaPath}/required`,
        "required",
        `must have required property '${property}'`,
        { missingProperty: property }
      );
    }
  }
};
const validateString = (value, instancePath, schemaPath, addError, options = {}) => {
  if (typeof value !== "string") {
    addError(instancePath, `${schemaPath}/type`, "type", "must be string", { type: "string" });
    return;
  }
  const codePointLength = Array.from(value).length;
  if (options.minLength !== void 0 && codePointLength < options.minLength) {
    addError(instancePath, `${schemaPath}/minLength`, "minLength", `must NOT have fewer than ${options.minLength} characters`, { limit: options.minLength });
  }
  if (options.maxLength !== void 0 && codePointLength > options.maxLength) {
    addError(instancePath, `${schemaPath}/maxLength`, "maxLength", `must NOT have more than ${options.maxLength} characters`, { limit: options.maxLength });
  }
  if (options.pattern && !options.pattern.test(value)) {
    addError(instancePath, `${schemaPath}/pattern`, "pattern", `must match pattern "${options.pattern.source}"`, { pattern: options.pattern.source });
  }
};
const validateInteger = (value, instancePath, schemaPath, addError, minimum, maximum) => {
  if (!Number.isInteger(value)) {
    addError(instancePath, `${schemaPath}/type`, "type", "must be integer", { type: "integer" });
    return;
  }
  const numeric = value;
  if (numeric < minimum) {
    addError(instancePath, `${schemaPath}/minimum`, "minimum", `must be >= ${minimum}`, { comparison: ">=", limit: minimum });
  }
  if (numeric > maximum) {
    addError(instancePath, `${schemaPath}/maximum`, "maximum", `must be <= ${maximum}`, { comparison: "<=", limit: maximum });
  }
};
const ROOT_REQUIRED = todayCourseSnapshotSchema.required;
const ROOT_PROPERTIES = new Set(Object.keys(todayCourseSnapshotSchema.properties));
const COURSE_REQUIRED = todayCourseSnapshotSchema.properties.courses.items.required;
const COURSE_PROPERTIES = new Set(Object.keys(todayCourseSnapshotSchema.properties.courses.items.properties));
const validator = ((value) => {
  const errors = [];
  const addError = (instancePath, schemaPath, keyword, message, params = {}) => {
    errors.push({ instancePath, schemaPath, keyword, params, message });
  };
  if (!isPlainObject(value)) {
    addError("", "#/type", "type", "must be object", { type: "object" });
    validator.errors = errors;
    return false;
  }
  validateAllowedProperties(value, ROOT_PROPERTIES, "", "#", addError);
  validateRequiredProperties(value, ROOT_REQUIRED, "", "#", addError);
  if (Object.prototype.hasOwnProperty.call(value, "version")) {
    if (!Number.isInteger(value.version)) {
      addError("/version", "#/properties/version/type", "type", "must be integer", { type: "integer" });
    } else if (value.version !== 1) {
      addError("/version", "#/properties/version/const", "const", "must be equal to constant", { allowedValue: 1 });
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "generated_at")) {
    validateString(value.generated_at, "/generated_at", "#/properties/generated_at", addError, { pattern: ISO_DATE_TIME_PATTERN });
  }
  if (Object.prototype.hasOwnProperty.call(value, "date")) {
    validateString(value.date, "/date", "#/properties/date", addError, { pattern: DATE_PATTERN });
  }
  if (Object.prototype.hasOwnProperty.call(value, "student_id")) {
    validateString(value.student_id, "/student_id", "#/properties/student_id", addError, { maxLength: 32 });
  }
  if (Object.prototype.hasOwnProperty.call(value, "week_index")) {
    validateInteger(value.week_index, "/week_index", "#/properties/week_index", addError, 0, 60);
  }
  if (Object.prototype.hasOwnProperty.call(value, "weekday")) {
    validateInteger(value.weekday, "/weekday", "#/properties/weekday", addError, 1, 7);
  }
  if (Object.prototype.hasOwnProperty.call(value, "courses")) {
    if (!Array.isArray(value.courses)) {
      addError("/courses", "#/properties/courses/type", "type", "must be array", { type: "array" });
    } else {
      if (value.courses.length > 14) {
        addError("/courses", "#/properties/courses/maxItems", "maxItems", "must NOT have more than 14 items", { limit: 14 });
      }
      value.courses.forEach((course, index2) => {
        const instancePath = `/courses/${index2}`;
        const schemaPath = "#/properties/courses/items";
        if (!isPlainObject(course)) {
          addError(instancePath, `${schemaPath}/type`, "type", "must be object", { type: "object" });
          return;
        }
        validateAllowedProperties(course, COURSE_PROPERTIES, instancePath, schemaPath, addError);
        validateRequiredProperties(course, COURSE_REQUIRED, instancePath, schemaPath, addError);
        const propertyPath = (property) => `${instancePath}/${escapeJsonPointer(property)}`;
        const propertySchema = (property) => `${schemaPath}/properties/${escapeJsonPointer(property)}`;
        if (Object.prototype.hasOwnProperty.call(course, "period_start")) {
          validateInteger(course.period_start, propertyPath("period_start"), propertySchema("period_start"), addError, 1, 14);
        }
        if (Object.prototype.hasOwnProperty.call(course, "period_end")) {
          validateInteger(course.period_end, propertyPath("period_end"), propertySchema("period_end"), addError, 1, 14);
        }
        if (Object.prototype.hasOwnProperty.call(course, "time_start")) {
          validateString(course.time_start, propertyPath("time_start"), propertySchema("time_start"), addError, { pattern: TIME_PATTERN });
        }
        if (Object.prototype.hasOwnProperty.call(course, "time_end")) {
          validateString(course.time_end, propertyPath("time_end"), propertySchema("time_end"), addError, { pattern: TIME_PATTERN });
        }
        if (Object.prototype.hasOwnProperty.call(course, "name")) {
          validateString(course.name, propertyPath("name"), propertySchema("name"), addError, { minLength: 1, maxLength: 80 });
        }
        if (Object.prototype.hasOwnProperty.call(course, "location")) {
          validateString(course.location, propertyPath("location"), propertySchema("location"), addError, { maxLength: 80 });
        }
        if (Object.prototype.hasOwnProperty.call(course, "teacher")) {
          validateString(course.teacher, propertyPath("teacher"), propertySchema("teacher"), addError, { maxLength: 80 });
        }
        if (Object.prototype.hasOwnProperty.call(course, "color")) {
          validateString(course.color, propertyPath("color"), propertySchema("color"), addError, { pattern: COLOR_PATTERN });
        }
      });
    }
  }
  validator.errors = errors.length > 0 ? errors : null;
  return errors.length === 0;
});
validator.errors = null;
const validateSnapshot = validator;
const MAX_SNAPSHOT_BYTES = 32 * 1024;
class WidgetBridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
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
      await invokeNative("write_widget_snapshot", { snapshotJson: json });
    },
    async writeElectricity(options) {
      await invokeNative("write_electricity_snapshot", { json: JSON.stringify(options.data) });
    },
    async writeExam(options) {
      await invokeNative("write_exam_snapshot", { json: JSON.stringify(options.data) });
    },
    async writeThemeColor(options) {
      await invokeNative("write_widget_theme_color", { color: options.color });
    },
    async clearSnapshot() {
      await invokeNative("clear_widget_snapshot");
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
    const errors = validateSnapshot.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ");
    throw new WidgetBridgeError("INVALID_SNAPSHOT", `Schema validation failed: ${errors}`);
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
      const code = err?.code;
      if (code && NON_RETRYABLE_CODES.has(code)) {
        throw err;
      }
      if (attempt === RETRY_DELAYS.length) break;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[widget] writeSnapshot retry ${attempt + 1}/3: ${message}`);
      pushDebugLog("widget", `writeSnapshot retry ${attempt + 1}/3: ${message}`, "warn", { code });
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
const index$8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  LocalNotifications,
  get Weekday() {
    return Weekday;
  }
}, Symbol.toStringTag, { value: "Module" }));
const AppLauncher = registerPlugin("AppLauncher", {
  web: () => __vitePreload(() => Promise.resolve().then(() => web$3), true ? void 0 : void 0, import.meta.url).then((m) => new m.AppLauncherWeb())
});
const index$7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AppLauncher
}, Symbol.toStringTag, { value: "Module" }));
const App = registerPlugin("App", {
  web: () => __vitePreload(() => Promise.resolve().then(() => web$2), true ? void 0 : void 0, import.meta.url).then((m) => new m.AppWeb())
});
const index$6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  App
}, Symbol.toStringTag, { value: "Module" }));
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (typeof state === "function" ? receiver !== state || true : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return state.set(receiver, value), value;
}
typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
  var e = new Error(message);
  return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
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
async function open$1(path, openWith) {
  await invoke("plugin:shell|open", {
    path,
    with: openWith
  });
}
const index$5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Child,
  Command,
  EventEmitter,
  open: open$1
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
async function registerActionTypes(types) {
  await invoke("plugin:notification|register_action_types", { types });
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
async function removeChannel(id) {
  await invoke("plugin:notification|delete_channel", { id });
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
const index$4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
  async setTitle(title) {
    return invoke("plugin:window|set_title", {
      label: this.label,
      value: title
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
async function open(path, options) {
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
    const file = await open(path, {
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
const index$3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
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
  open,
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
async function getCurrent() {
  return await invoke("plugin:deep-link|get_current");
}
async function register(protocol) {
  return await invoke("plugin:deep-link|register", { protocol });
}
async function unregister(protocol) {
  return await invoke("plugin:deep-link|unregister", { protocol });
}
async function isRegistered(protocol) {
  return await invoke("plugin:deep-link|is_registered", { protocol });
}
async function onOpenUrl(handler) {
  return await listen("deep-link://new-url", (event2) => {
    handler(event2.payload);
  });
}
const index$2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getCurrent,
  isRegistered,
  onOpenUrl,
  register,
  unregister
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
const FilesystemDirectory = Directory;
const FilesystemEncoding = Encoding;
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
  Filesystem,
  FilesystemDirectory,
  FilesystemEncoding
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
const web$2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AppWeb
}, Symbol.toStringTag, { value: "Module" }));
const Share = registerPlugin("Share", {
  web: () => __vitePreload(() => Promise.resolve().then(() => web), true ? void 0 : void 0, import.meta.url).then((m) => new m.ShareWeb())
});
const index = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Share
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
      // The "from" object is a file
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
  isLikelyIOSUserAgent as $,
  getTestAccountGrades as A,
  seedTestAccountCaches as B,
  clearRememberedUsername as C,
  clearTestAccountSession as D,
  isAndroidLike as E,
  markTestAccountSession as F,
  installMiniHbutDeepLinkListeners as G,
  resolveNotificationActionTarget as H,
  identityFetchAuthHistory as I,
  getIdentityDeviceDisplayName as J,
  getDebugLogs as K,
  formatDebugTime as L,
  initDebugLogger as M,
  invoke as N,
  isMobileLike as O,
  resolveTestAccountForumResponse as P,
  isTestAccountCredentials as Q,
  TEST_ACCOUNT_LOGIN_METHOD as R,
  subscribeDebugLogs as S,
  TEST_ACCOUNT as T,
  identityDeviceStatus as U,
  identityRevokeCurrentDeviceLocal as V,
  parseMiniHbutDeepLink as W,
  IDENTITY_REQUEST_ID_PATTERN as X,
  IDENTITY_HANDOFF_PATTERN as Y,
  clearDebugLogs as Z,
  __vitePreload as _,
  isTauriRuntime as a,
  isTauriDesktopRuntime as a0,
  test_account as a1,
  index$a as a2,
  tauri as a3,
  index$9 as a4,
  debug_logger as a5,
  native as a6,
  index$6 as a7,
  core as a8,
  event as a9,
  window$1 as aa,
  index$1 as ab,
  index as ac,
  isLikelyAndroidUserAgent as b,
  isCapacitorRuntime as c,
  invokeNative as d,
  platformBridge as e,
  resolveTestAccountHttpResponse as f,
  getNativeAppVersion as g,
  requestRefresh as h,
  isTestAccountSession as i,
  clearSnapshot as j,
  writeElectricitySnapshot as k,
  writeExamSnapshot as l,
  writeWidgetThemeColor as m,
  normalizeBackgroundDetectedEvent as n,
  getRuntime as o,
  pushDebugLog as p,
  detectRuntime as q,
  resolveTestAccountCachePayload as r,
  readNativeBinaryFile as s,
  toNativeFileSrc as t,
  isIOSLike as u,
  isDesktopLike as v,
  writeSnapshotWithRetry as w,
  saveRememberedUsername as x,
  exitNativeApp as y,
  getCurrentNativeWindow as z
};
