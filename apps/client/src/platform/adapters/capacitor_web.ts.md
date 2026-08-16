# Capacitor/Web 适配层机制 (adapters/capacitor.ts & web.ts)

## 1. 模块边界与平台补齐

这两份文件填补了移动原生与纯净浏览器最后一块图图：
1. **`capacitor.ts`** 处理打包为 Android/iOS 手机原生 App 的情境。
2. **`web.ts`** 处理在最原始（PC / 手机 浏览器）环境下的标准功能降维映射。

## 2. 纯 Web 浏览器适配套件 (`web.ts`)

完全基于标准的 HTML5 与浏览器级 BOM 对象。
- **链接外跳**：暴力双解法 `try { window.open } catch { location.href = url }`，兼容弹窗拦截的浏览器。
- **通知**：依托 Web `Notification` 对象，没有 `ensureNotificationChannel` 的概念（因为浏览器没有通知频道），直接返回 `true`。
- **常亮 `keepScreenOn`**：利用较新的浏览器特性 `navigator.wakeLock.request('screen')` 申请防休眠。
- **分享**：走标准的 `navigator.share()`，如果在不支持分享（旧版浏览器或非 HTTPS）情况下，降级利用外转接。

## 3. Capacitor 移动端适配套件 (`capacitor.ts`)

专门衔接移动端原生能力，特别是与系统 Launcher 强绑定的场景。

### 3.1 跨 App 唤回能力
```javascript
const openByAppLauncher = async (target: string) => {
  const mod = await import('@capacitor/app-launcher')
  await mod.AppLauncher.openUrl({ url: target })
}
```
这对于拉起支付宝支付、跳转微信扫码有着至关重要的作用。

### 3.2 离线通知队列 (`sendLocalNotification`)
在发送通知时，故意设为了 `at: new Date(Date.now() + 600)`。这是移动端开发上常见的防丢件 Trick——推迟 600 毫秒发出。目的是给 UI 渲染和 JS 主线程留出喘息空当（很多系统如果在繁重转场时立即发出推送可能被吞噬或丢失）。并且附带 `allowWhileIdle: true` 保证手机息屏黑态下，依然能震动提醒考试通知。