import { p as pushDebugLog } from "./runtime-bridge-apFQ0nCw.js";
import { a as ref } from "./vue-core-DdLVj9yW.js";
function useGeolocation() {
  const available = ref(typeof navigator !== "undefined" && "geolocation" in navigator);
  const loading = ref(false);
  const lastPosition = ref(null);
  const lastError = ref("");
  async function getCurrentPosition(timeout = 1e4, maximumAge = 5e3, enableHighAccuracy = true) {
    if (!available.value) {
      lastError.value = "当前设备不支持定位";
      pushDebugLog("Geo", lastError.value, "warn", { available: false });
      throw new Error(lastError.value);
    }
    loading.value = true;
    lastError.value = "";
    pushDebugLog(
      "Geo",
      `定位请求开始 timeout=${timeout}ms maximumAge=${maximumAge} highAccuracy=${enableHighAccuracy}`,
      "debug",
      { timeout, maximumAge, enableHighAccuracy }
    );
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const result = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          };
          lastPosition.value = result;
          loading.value = false;
          pushDebugLog(
            "Geo",
            `定位成功 lat=${result.latitude.toFixed(6)} lng=${result.longitude.toFixed(6)} ±${Math.round(result.accuracy || 0)}m`,
            "info",
            {
              latitude: result.latitude,
              longitude: result.longitude,
              accuracy: result.accuracy,
              source: "system"
            }
          );
          resolve(result);
        },
        (err) => {
          loading.value = false;
          switch (err.code) {
            case err.PERMISSION_DENIED:
              lastError.value = "定位权限被拒绝，请在系统设置中开启位置权限";
              break;
            case err.POSITION_UNAVAILABLE:
              lastError.value = "无法获取位置信息";
              break;
            case err.TIMEOUT:
              lastError.value = "定位超时，请重试";
              break;
            default:
              lastError.value = "定位失败";
          }
          pushDebugLog("Geo", `定位失败: ${lastError.value}`, "error", {
            code: err.code,
            message: err.message,
            enableHighAccuracy
          });
          reject(new Error(lastError.value));
        },
        {
          enableHighAccuracy: Boolean(enableHighAccuracy),
          timeout,
          maximumAge: Math.max(0, Number(maximumAge) || 0)
        }
      );
    });
  }
  return {
    available,
    loading,
    lastPosition,
    lastError,
    getCurrentPosition
  };
}
export {
  useGeolocation as u
};
