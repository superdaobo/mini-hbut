import { ref } from 'vue'

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

  /** 获取当前位置 */
  async function getCurrentPosition(timeout = 10000): Promise<GeoPosition> {
    if (!available.value) {
      lastError.value = '当前设备不支持定位'
      throw new Error(lastError.value)
    }

    loading.value = true
    lastError.value = ''

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
          resolve(result)
        },
        (err) => {
          loading.value = false
          switch (err.code) {
            case err.PERMISSION_DENIED:
              lastError.value = '定位权限被拒绝'
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
          reject(new Error(lastError.value))
        },
        {
          enableHighAccuracy: true,
          timeout,
          maximumAge: 30000
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
