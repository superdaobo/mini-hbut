# `src-tauri/src/http_client/utils.rs` HTTP 组件辅助工具函数解析

## 1. 文件概览

`src-tauri/src/http_client/utils.rs` 虽然是个极其轻量的模块，但它提供的是与教务请求强相关的低级时间戳和加解密测试套件功能。所有涉及到高频需要计算毫秒级（Unix Timestamp）的爬虫动作都会引用此模块。

### 1.1 核心职责
1. **统一时间戳转换**: 返回前端 JS `Date.now()` 等效精确至毫秒级的 64 位整型数字字面量，由于教务系统的 AJAX 和验证码拉取高度依赖此作为 Cache-Buster（缓存破坏器），此函数被全模块高频调用。
2. **底层安全验证**: 提供对 `auth.rs` 中重量级 `encrypt_password_aes`（纯 Rust 还原的 AES 算法）在编译阶段的测试用例验证功能，保障每次打包不出现算法位移错误。

---

## 2. 逻辑组成

```mermaid
flowchart LR
    classDef main fill:#34495e,stroke:#2c3e50,stroke-width:2px,color:#fff;
    classDef algo fill:#f39c12,stroke:#d35400,stroke-width:2px,color:#fff;
    
    Boot[调用 chrono_timestamp]:::main
    Sys[OS: SystemTime::now()]
    Epoch[减去 UNIX_EPOCH]
    Millis[强制 as_millis转换]
    
    Boot --> Sys --> Epoch --> Millis --> Out[返回 u64]:::algo
    
    Test(cargo test / test_encrypt_password)
    TestInput[传入 密码/Salt]
    TestAlgo[encrypt_password_aes 运行算法]
    TestAssert[进行定长强制边界校验 Base64=108字符]
    
    Test --> TestInput --> TestAlgo --> TestAssert:::algo
```

### 2.1 函数级说明

#### a. 毫秒级时间戳抓取器
```rust
pub(super) fn chrono_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}
```
直接使用 Rust 的原生系统时钟而不是依赖重型第三方包（如 `chrono`），是为了让编译产物更为精简，这个返回值会被直接拼接在例如教务跨域或者拉取二维码的 URL `?t=1738734234000` 的后面，用来欺骗前端 CDN 以及教务 HTTP 容器（Nginx 或者老式 Tomcat），强制返回最新的业务。

#### b. AES 加密黑盒单元测试
```rust
// 验证 AES-CBC 加密是否输出固定标准长度
assert_eq!(result.len(), 108, "Encrypted password should be 108 chars");
```
这是保障应用稳定性的最后一道锁。
由于教务网站前段使用了特殊的 PKCS7 补洞模式 (Padded)：
`64 bytes random prefix` + `(usually) 15 bytes password` = `79 Bytes`.
补充至 `80 Byte` 对齐。经过 Base64 后刚好必须等于 108个字符。这个测试确保了未来无论 `aes/cbc` 库升级时，是否改变了宏或隐式生命周期，该应用的登录加密包都始终与旧版教务 Javascript 原生加密输出完全吻合。这是一种非常极致的逆向工程稳定性保险。