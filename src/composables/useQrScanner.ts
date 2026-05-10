import { ref } from 'vue'

/**
 * 相机二维码扫描 composable。
 * 检测相机可用性并提供扫描入口（通过 file input 或 Capacitor barcode-scanner）。
 */
export function useQrScanner() {
  const cameraAvailable = ref(false)
  const scanning = ref(false)
  const lastError = ref('')

  /** 检测当前环境是否支持相机 */
  function detectCamera(): boolean {
    if (typeof navigator === 'undefined') return false
    // 移动端 file input capture 始终可用
    if (/android|iphone|ipad|ipod/i.test(navigator.userAgent)) {
      cameraAvailable.value = true
      return true
    }
    // 桌面端检测 mediaDevices
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      cameraAvailable.value = true
      return true
    }
    cameraAvailable.value = false
    return false
  }

  /**
   * 通过 file input 获取图片文件（移动端会唤起相机）。
   * 返回 File 对象，调用方负责读取为 Uint8Array 后交给后端解码。
   */
  async function scanFromFileInput(inputEl: HTMLInputElement): Promise<File | null> {
    scanning.value = true
    lastError.value = ''
    return new Promise((resolve) => {
      const handler = () => {
        inputEl.removeEventListener('change', handler)
        scanning.value = false
        const file = inputEl.files?.[0] ?? null
        if (!file) {
          lastError.value = '未选择图片'
          resolve(null)
          return
        }
        resolve(file)
      }
      inputEl.addEventListener('change', handler)
      inputEl.click()
    })
  }

  // 初始化检测
  detectCamera()

  return {
    cameraAvailable,
    scanning,
    lastError,
    detectCamera,
    scanFromFileInput
  }
}
