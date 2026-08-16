# 一码通与高能脱机校园码 (CampusCodeView.vue)

## 1. 模块边界与定位

校园码，也就是平日里干饭、洗澡、进出宿舍闸机的命脉工具。
在此前绝大多数校园第三方应用中，打开校园码面临着：**加载极慢、排队时由于网络不佳导致打不开、付款码无法刷新导致后边大排长龙**的三大痛点。
`CampusCodeView.vue` 从底层重构了扫码体验，引入了“在线模式”与创新的**“高能模式（Offline脱机）”**动态双轨架构。

## 2. 脱机算法设计

正常来说，动态收款码由 Server 下发。但在网络拥堵（尤其是下课铃响时的食堂）时必定超载。
因此模块通过一个特定的设备标识推算机制 `DEV_CODE_KEY` 结合服务器授信：
```javascript
const ensureDevCode = () => {
  const saved = localStorage.getItem('hbu_campus_code_devcode')
  if (/^\d{12,22}$/.test(saved)) return saved
  const next = `${Date.now()}${Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')}`
  localStorage.setItem(DEV_CODE_KEY, next)
  return next
}
```
并且提供了离线的二维码签发计算降级：如果 `mode.value === 'offline'` 且配置中心允许脱机（`canOffline`），直接进行客户端推演生成校园码，绕过网络白屏。

## 3. QRCode 本地降级渲染防护

这里引入了一个极致的安全降级。由于在纯沙箱或缺失 Canvas 库极低配环境时，本地二维码画图库可能炸表。

```javascript
import QRCode from 'qrcode'
// ...
const renderQrCode = async () => {
  try {
    // 尝试在本地利用 Web 资源离线渲染（最快，不吃网）
    qrImageDataUrl.value = await QRCode.toDataURL(qrcodeText.value, {...})
  } catch (error) {
    // 捕获到 WebWorker / Canvas 被禁用的极端安卓机后
    // 降级使用 api.qrserver.com 进行云端生图
    qrImageDataUrl.value = `https://.../create-qr-code/?data=${encodeURIComponent(text)}`
  }
}
```

## 4. 轮询流水与状态映射字典

为了应对校园码的几种消费情况（比如付款成功、余额不足、重复扫码机器），系统后台建立了一套数字枚举机制。前端将其进行拟人转化展示：

```mermaid
graph TD
    A[二维码生成] --> B[建立 Timer 开启轮询 (3秒一次)]
    B --> C{API v2 返回 statusCode}
    C -- 1 --> D[绿码：支付成功，触发自动刷新]
    C -- 2 --> E[黄码：检测到机器重扫 (已被使用)]
    C -- 4 --> F[红码：异地非法截图盗刷]
    C -- 6 --> G[黑码：饭卡干瘪 余额不足]
```

## 5. UI 细节与刷新机制
提供动态属性 `autoRefreshHint`，在在线模式时，每隔 60 秒（或者根据远端 `refreshSecond` 下拉）静默销毁旧 QR 值换新。当 `CampusCodeView` （Vue生命周期 `onBeforeUnmount`）被销毁后，必须主动执行 `clearTimers()` 切断轮询器，否则轮询依然在背景疯狂吃耗电量。