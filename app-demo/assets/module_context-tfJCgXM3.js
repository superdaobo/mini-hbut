import { by as normalizeGameOrigin } from "./app-demo-BU0DrW_f.js";
const CLIENT_VERSION_RE = /^[0-9A-Za-z._+-]{1,64}$/;
const normalizeAppVersion = (value) => {
  const text = String(value ?? "").trim();
  return CLIENT_VERSION_RE.test(text) ? text : "";
};
const resolveBuildAppVersion = (override) => normalizeAppVersion("1.4.11");
const resolveHostOriginFromLocation = (locationLike) => {
  if (!locationLike) return "";
  let origin;
  let protocol;
  let host;
  try {
    origin = locationLike.origin;
    protocol = locationLike.protocol;
    host = locationLike.host;
  } catch {
    return "";
  }
  const fromOrigin = normalizeGameOrigin(origin);
  if (fromOrigin) return fromOrigin;
  const protocolText = String(protocol ?? "").trim();
  const hostText = String(host ?? "").trim();
  if (!protocolText || !hostText) return "";
  return normalizeGameOrigin(`${protocolText}//${hostText}`);
};
const resolveHostOrigin = (value, locationLike) => {
  const direct = normalizeGameOrigin(value);
  if (direct) return direct;
  return resolveHostOriginFromLocation(locationLike);
};
const appendModuleEnvQueryParams = (url, options = {}) => {
  const applied = [];
  const version = normalizeAppVersion(options.appVersion);
  if (version) {
    url.searchParams.set("app_version", version);
    applied.push("app_version");
  }
  const hostOrigin = resolveHostOrigin(options.hostOrigin, options.hostLocation);
  if (hostOrigin) {
    url.searchParams.set("host_origin", hostOrigin);
    applied.push("host_origin");
  }
  return applied;
};
export {
  appendModuleEnvQueryParams as a,
  resolveBuildAppVersion as r
};
