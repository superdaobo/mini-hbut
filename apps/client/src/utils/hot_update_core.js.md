# 热更新打包状态与语义化分析微内核 (hot_update_core.js)

## 1. 模块定位与职责

相较于纯流转控制的 `hot_update.js`，`hot_update_core.js` 全面不依赖 `@tauri-apps/plugin-fs` 这种涉及文件读写的宏系统。它是一个**纯粹的逻辑计算库（Pure Functions）**。
主要作用是用来对比 Semantic Versioning (语义化版本号)、计算二进制文件的 SHA256 指纹。非常易于进行单元测试，它也是 `checker` 环节的终极看门狗。

## 2. 版本号解析与比较 (Version Parsing)

它实现了一个比系统内置稍微简化的多段版本号解析算法：
```javascript
const normalizeVersion = (input) =>
  String(input || '').trim().replace(/^v/i, '').split('-')[0];

const parseVersion = (input) =>
  normalizeVersion(input)
    .split('.')
    .map((item) => Number.parseInt(item, 10))
    //...
```

利用这个算法可以轻易辨别 `1.2.3` 对比 `1.3.0` 等状态。
并提供给 `isManifestCompatible` 使用，分别检查打包在 JS 包里的配置文件是否超越了当前宿主原生语言 (Native Rust / Swift) 所能提供的底层接口 `max_native_version` 等。借此防止在 JS 热更中强行调用一个本版本尚不存在的 Native IPC 造成 App 奔溃。

## 3. SHA256 Web-Crypto 签名验证

实现了 `sha256Hex`：
```javascript
export const sha256Hex = async (bytes) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  // ...转化为 16 进制字符串
}
```
并且提供了签名验证方法 `verifyHotBundleSignature`。虽然代码目前降级兼容了 `digest-equals` 的做法。但为以后添加真正的非对称密钥打下了 `scheme` 概念的伏笔。这种沙盒内的加密解密完全运用了原生的 SubtleCrypto 速度极快。

## 4. 状态机持久化工厂

抽象了针对 JSON 文件覆盖特性的 `mergeHotBundleState()`：
确保在记录热更阶段时 (`staged`, `rollback`, `failed_versions`) 不会将老的报错记录给覆盖，并且具备自我构建新 State (`createEmptyHotBundleState`) 的能力。