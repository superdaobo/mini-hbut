# Debug 桥接客户端与云控通信辅助 (debug_bridge_client.js)

## 1. 模块定位与职责

`debug_bridge_client.js` 用于在**浏览器开发环境**（或者桌面端向调试服务器传递 Payload 时）中向本地的 Debug 代理网关发起 HTTP 请求。
这是 `axios_adapter.js` 用来绕过 Tauri 限制和浏览器 CORS 进行桥架的核心执行层。主要对内网 Web 服务（默认 `127.0.0.1:4399`）暴露请求原语。

## 2. API 封装与设计

提供了统一的带有凭证鉴权的内部 Fetch:
```javascript
const withAuthHeaders = (token, extraHeaders = {}) => {
  const headers = { 'Content-Type': 'application/json' }
  // 附加 JWT 并兼容旧式 x-local-token
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
    headers['x-local-token'] = authToken
  }
}
```
并且提供了两种具体的业务动作触发器：
*   `debugCustomScheduleUpsert`：向桥架推送或者覆盖用户本地测试用的自定义课表数据（辅助开发者在浏览器界面看到不同课表布局）。
*   `debugCaptureCurrentPage`：向桥架报告进行后端界面的状态截屏捕获。