import { b as isTauriRuntime, a as invokeNative } from "./runtime-bridge-apFQ0nCw.js";
async function prepareOneCodeAppOpen(opts = {}) {
  if (!isTauriRuntime()) {
    throw new Error("请在客户端内使用本功能");
  }
  const code = String(
    opts.appCode ?? opts.code ?? opts.app_code ?? ""
  ).trim();
  if (!code) throw new Error("缺少应用编码 appCode");
  const name = String(
    opts.appName ?? opts.name ?? opts.app_name ?? ""
  ).trim();
  const res = await invokeNative("one_code_app_open_prepare", {
    appCode: code,
    appName: name
  });
  const openUrl = String(
    res?.open_url || res?.openUrl || res?.pay_url || res?.payUrl || ""
  ).trim();
  const payUrl = String(res?.pay_url || res?.payUrl || openUrl).trim();
  const success = res?.success !== false && !!openUrl;
  const message = String(res?.message || "").trim();
  if (!success) {
    throw new Error(message || "未能生成官方入口");
  }
  return {
    success,
    openUrl,
    payUrl,
    hint: String(res?.hint || "打开官方一码通页面完成操作"),
    message,
    tid: String(res?.tid || "")
  };
}
export {
  prepareOneCodeAppOpen as p
};
