import { c9 as getBridgeSessionToken } from "./app-demo-3oSHw6M5.js";
import "./runtime-bridge-BViGMv5P.js";
import "./more-modules-6OuVUGvL.js";
import "./vue-core-CVT-P0lT.js";
import "./debug-tools-DQjNIaVK.js";
import "./capture-DDDYy2yb.js";
const MEDIA_CAP_PREFIX = "media";
const MEDIA_CAPABILITY_TTL_SECONDS = 30 * 60;
const toBase64Url = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const hmacSha256 = async (key, message) => {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) throw new Error("当前环境不支持 crypto.subtle");
  const encoder = new TextEncoder();
  const cryptoKey = await cryptoObj.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await cryptoObj.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return new Uint8Array(signature);
};
const computeMediaCapability = async (token, target, exp) => toBase64Url(await hmacSha256(token, `${MEDIA_CAP_PREFIX}|${target}|${exp}`));
const buildMediaCapabilityUrl = async (target, options = {}) => {
  const token = await getBridgeSessionToken();
  if (!token) return target;
  const origin = (options.origin || "http://127.0.0.1:4399").replace(/\/$/, "");
  const ttl = options.ttlSeconds ?? MEDIA_CAPABILITY_TTL_SECONDS;
  const now = options.now ?? Math.floor(Date.now() / 1e3);
  const exp = now + ttl;
  try {
    const cap = await computeMediaCapability(token, target, exp);
    return `${origin}/proxy/video?url=${encodeURIComponent(target)}&exp=${exp}&cap=${cap}`;
  } catch {
    return target;
  }
};
export {
  MEDIA_CAPABILITY_TTL_SECONDS,
  buildMediaCapabilityUrl,
  computeMediaCapability
};
