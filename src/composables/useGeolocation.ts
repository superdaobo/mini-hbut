import { ref } from 'vue'
import { pushDebugLog } from '../utils/debug_logger'

export interface GeoPosition {
  latitude: number
  longitude: number
  accuracy: number
}

/**
 * 地理位置 composable。
 * 检测 Geolocation API 可用性并提供获取当前位置的方法。
 */
export function useGeolocation() {
  const available = ref(typeof navigator !== 'undefined' && 'geolocation' in navigator)
  const loading = ref(false)
  const lastPosition = ref<GeoPosition | null>(null)
  const lastError = ref('')

  /**
   * 获取当前位置。
   * @param timeout 超时 ms
   * @param maximumAge 允许的缓存年龄 ms；0 表示强制刷新（校园导览 iOS 建议 0）
   * @param enableHighAccuracy 是否启用高精度（部分机型室内高精度会直接失败）
   */
  async function getCurrentPosition(
    timeout = 10000,
    maximumAge = 5000,
    enableHighAccuracy = true
  ): Promise<GeoPosition> {
    if (!available.value) {
      lastError.value = '当前设备不支持定位'
      pushDebugLog('Geo', lastError.value, 'warn', { available: false })
      throw new Error(lastError.value)
    }

    loading.value = true
    lastError.value = ''
    pushDebugLog(
      'Geo',
      `定位请求开始 timeout=${timeout}ms maximumAge=${maximumAge} highAccuracy=${enableHighAccuracy}`,
      'debug',
      { timeout, maximumAge, enableHighAccuracy }
    )

    return new Promise<GeoPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const result: GeoPosition = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          }
          lastPosition.value = result
          loading.value = false
          // #370：写入设置调试信息
          pushDebugLog(
            'Geo',
            `定位成功 lat=${result.latitude.toFixed(6)} lng=${result.longitude.toFixed(6)} ±${Math.round(result.accuracy || 0)}m`,
            'info',
            {
              latitude: result.latitude,
              longitude: result.longitude,
              accuracy: result.accuracy,
              source: 'system'
            }
          )
          resolve(result)
        },
        (err) => {
          loading.value = false
          switch (err.code) {
            case err.PERMISSION_DENIED:
              lastError.value = '定位权限被拒绝，请在系统设置中开启位置权限'
              break
            case err.POSITION_UNAVAILABLE:
              lastError.value = '无法获取位置信息'
              break
            case err.TIMEOUT:
              lastError.value = '定位超时，请重试'
              break
            default:
              lastError.value = '定位失败'
          }
          pushDebugLog('Geo', `定位失败: ${lastError.value}`, 'error', {
            code: err.code,
            message: err.message,
            enableHighAccuracy
          })
          reject(new Error(lastError.value))
        },
        {
          enableHighAccuracy: Boolean(enableHighAccuracy),
          timeout,
          maximumAge: Math.max(0, Number(maximumAge) || 0)
        }
      )
    })
  }

  return {
    available,
    loading,
    lastPosition,
    lastError,
    getCurrentPosition
  }
}
