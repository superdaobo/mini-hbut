/**
 * 一码通官方应用打开助手（#438）
 * 统一 invoke 参数，避免 missing key `req`
 */
import { invokeNative, isTauriRuntime } from '../platform/native'
import { openExternal } from './external_link'

/**
 * @param {{ appCode: string, appName?: string }} opts
 * @returns {Promise<{ success: boolean, openUrl: string, payUrl: string, hint: string, message: string, tid: string }>}
 */
export async function prepareOneCodeAppOpen({ appCode, appName = '' } = {}) {
  if (!isTauriRuntime()) {
    throw new Error('请在客户端内使用本功能')
  }
  const code = String(appCode || '').trim()
  if (!code) throw new Error('缺少应用编码')

  const res = await invokeNative('one_code_app_open_prepare', {
    app_code: code,
    app_name: String(appName || '').trim()
  })

  const openUrl = String(res?.open_url || res?.openUrl || res?.pay_url || res?.payUrl || '').trim()
  const payUrl = String(res?.pay_url || res?.payUrl || openUrl).trim()
  const success = res?.success !== false && !!openUrl
  const message = String(res?.message || '').trim()
  if (!success) {
    throw new Error(message || '未能生成官方入口')
  }
  return {
    success,
    openUrl,
    payUrl,
    hint: String(res?.hint || '打开官方一码通页面完成操作'),
    message,
    tid: String(res?.tid || '')
  }
}

export async function openOneCodeApp({ appCode, appName = '' } = {}) {
  const prepared = await prepareOneCodeAppOpen({ appCode, appName })
  await openExternal(prepared.openUrl)
  return prepared
}
