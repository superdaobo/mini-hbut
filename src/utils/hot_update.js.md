# 基于插件层的本地热更新编排网关 (hot_update.js)

## 1. 模块定位与职责

该文件是在 Tauri 环境中执行 **热更新（OTA / Hot Update）** 资源包下载与存储阶段的高级暴露层。
它完全依赖于 `@tauri-apps/plugin-fs` 来操作原生文件系统（创建隐藏的 Downloads & Bundles 目录，写入二进制 Zip、记录 State）。不承担哈希或签名的底层算法计算，只负责把控流程并将状态序列化落库。

## 2. 热更新包落地管线策略

定义了极其严谨的 `BaseDirectory.AppCache`（临时存续）和 `BaseDirectory.AppData`（持久生效）的数据分流策略。

```mermaid
sequenceDiagram
    participant App as 设置页/定时任务
    participant Updater as hot_update.js
    participant FS_Cache as FS (AppCache)
    participant FS_Data as FS (AppData)
    
    App->>Updater: checkHotBundleManifest()
    Updater-->>App: 检查与本机版本原生沙箱的兼容性 (Compatible: true)
    
    App->>Updater: downloadHotBundle()
    Updater->>FS_Cache: HTTP Fetch 远程 ZIP 直接刷入 AppCache 目录下
    FS_Cache-->>Updater: 返回字节大小与路径
    
    App->>Updater: verifyHotBundle()
    Updater->>Updater: 进行摘要 SHA256 甚至 PGP 签名等校验验证
    
    App->>Updater: stageHotBundle()
    Note over Updater,FS_Data: 只有被标记为 Stage 的才能用于下次开机引导
    Updater->>FS_Data: copyFile (从 Cache 拷贝到 Data 持久存储区)
    Updater->>FS_Data: writeTextFile state.json
    Updater-->>App: 完毕，等待 markHotBundleForNextLaunch 并在重启时生效
```

这种双层目录（下载校验区与驻留激活区）隔离了“下载一半断网”、“下载完毕但文件被篡改”等边角案导致开机白屏的严重事故。只有经历了 `Stage` 步骤的文件才算可信负载。