# 高级服务器 API SDK 层 (api.ts)

## 1. 模块定位与职责

`api.ts` 是针对特定**非校内接口（第三方云端/自建后端）**的高级网络请求 SDK。
相较于负责转发到 Rust Core (拦截 `/v2/login`) 的 `axios_adapter.js`，该模块直接使用 `fetch` 向部署在广域网服务器上的增值服务点进行直接通信。

它的主要职能包括：
1. **统一自建后端的基址管理。**
2. **连接远程深度学习模型提供的验证码 OCR 服务。**
3. **提供数据云端双向同步 (Backup & Restore) 的基础原语。**

## 2. 接口端点映射

代码直接定义了三个核心端点，用于标识请求的最终路由：
```typescript
// 自有 OCR 和云存储中台基址
export const SERVER_API_BASE = 'http://1.94.167.18:5080/api'

// HBU 统一认证跨域直连地址 (目前主要由 Rust 侧处理，此处作为标记)
export const CAS_BASE_URL = 'https://cas.hbut.edu.cn/cas'

// 强智教务系统内网地址
export const JWXT_BASE_URL = 'http://jwglxt.hbut.edu.cn'
```

## 3. 核心功能及交互设计

### 3.1 跨端验证码识别 (OCR 服务)
在教务系统和图书馆认证中均频繁涉及验证码。若未能通过本地 Tesseract/ONNX 库或者简单的去杂质手段破解验证码，应用将降级并回传给云端 AI 识别：
```mermaid
sequenceDiagram
    participant LoginView as 登录/爬虫逻辑
    participant API_TS as api.ts SDK
    participant PythonOCR as 远程 Python OCR (5080)
    
    LoginView->>API_TS: serverOcrRecognize("data:image/jpeg;base64,...")
    API_TS->>API_TS: 正则截断去头 (去除 data URI 头)
    API_TS->>PythonOCR: POST /ocr/recognize { image: base_64_only_str }
    PythonOCR-->>API_TS: { success: true, result: "abcd" }
    API_TS-->>LoginView: 返回文字 "abcd" 或 fallback 空字符串
```
这部分通过强耦合的硬编码服务端 IP (`1.94.167.18`) 保障了即使 Rust 端遇到极端验证码也可以通过网络请求交给云端重算。

### 3.2 离线存储的云端投递 (数据同步)
对于成绩查询客户端来说，经常需要清空 WebView 或者在不同设备登录。该功能允许将用户的课表等信息加密（一般在发送前或者 Rust 层处理加密）后以 `studentId` 的粒度存放在远程数据库进行异地容灾：

*   **`syncDataToServer(studentId, dataType, data)`**： 
    将 JSON 数据发送至 `/sync/upload`。包含隐式附带的时间戳 `timestamp: Date.now()` 和类型区分，具有良好的事务追溯性。如果在无网环境异常则抛出 warning 并返回 `false`。
    
*   **`fetchDataFromServer(studentId, dataType)`**： 
    利用 `/sync/download/{studentId}/{dataType}` 标准的 RESTful 路由从云端把备份好的特定数据组（如 'score'、'schedule'）拉取并返回 `result.data`。

## 4. 类型边界
作为 TS 文件，函数的输入输出均被强类型接管。`Promise<string>` 和 `Promise<boolean>` 的显式标定方便在 `await` 时配合错误处理（try/catch 被静默消费后返回空值或 false，以此保证静默失败体验，不阻塞主流程）。