/**
 * API 配置
 * 服务器端用于 OCR 和数据同步
 * 本地 Tauri 用于直接请求学校系统（绕过 CORS）
 */

// 服务器 API 地址
export const SERVER_API_BASE = 'http://1.94.167.18:5080/api'

// CAS 登录地址
export const CAS_BASE_URL = 'https://cas.hbut.edu.cn/cas'

// 教务系统地址
export const JWXT_BASE_URL = 'http://jwglxt.hbut.edu.cn'

/**
 * 调用服务器 OCR 接口识别验证码
 */
export async function serverOcrRecognize(imageBase64: string): Promise<string> {
  try {
    // 去掉 data:image/xxx;base64, 前缀
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    
    const response = await fetch(`${SERVER_API_BASE}/ocr/recognize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Data }),
    })
    
    const result = await response.json()
    if (result.success && result.result) {
      return result.result
    }
    return ''
  } catch (e) {
    console.error('OCR 识别失败:', e)
    return ''
  }
}

/**
 * 向服务器同步数据（用于数据备份）
 */
export async function syncDataToServer(
  studentId: string,
  dataType: string,
  data: any
): Promise<boolean> {
  try {
    const response = await fetch(`${SERVER_API_BASE}/sync/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        studentId, 
        dataType,
        data, 
        timestamp: Date.now() 
      }),
    })
    const result = await response.json()
    return result.success
  } catch (e) {
    console.warn('数据同步失败:', e)
    return false
  }
}

/**
 * 从服务器获取备份数据
 */
export async function fetchDataFromServer(
  studentId: string,
  dataType: string
): Promise<any> {
  try {
    const response = await fetch(`${SERVER_API_BASE}/sync/download/${studentId}/${dataType}`)
    const result = await response.json()
    if (result.success) {
      return result.data
    }
    return null
  } catch (e) {
    console.warn('从服务器获取数据失败:', e)
    return null
  }
}
