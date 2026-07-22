/**
 * 一码通官方应用打开助手
 *
 * Rust 命令使用 rename_all = "camelCase"：
 * 前端必须传 appCode / appName（不要只传 app_code）。
 */
import { invokeNative, isTauriRuntime } from '../platform/native'
import { openExternal } from './external_link'

/**
 * @param {{ appCode?: string, appName?: string, code?: string, name?: string, app_code?: string, app_name?: string }} opts
 */
export async function prepareOneCodeAppOpen(opts = {}) {
  if (!isTauriRuntime()) {
    throw new Error('请在客户端内使用本功能')
  }
  const code = String(
    opts.appCode ?? opts.code ?? opts.app_code ?? ''
  ).trim()
  if (!code) throw new Error('缺少应用编码 appCode')
  const name = String(
    opts.appName ?? opts.name ?? opts.app_name ?? ''
  ).trim()

  // 只传 camelCase，与 Rust #[tauri::command(rename_all = "camelCase")] 对齐
  const res = await invokeNative('one_code_app_open_prepare', {
    appCode: code,
    appName: name
  })

  const openUrl = String(
    res?.open_url || res?.openUrl || res?.pay_url || res?.payUrl || ''
  ).trim()
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

export async function openOneCodeApp(opts = {}) {
  const prepared = await prepareOneCodeAppOpen(opts)
  await openExternal(prepared.openUrl)
  return prepared
}
