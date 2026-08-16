# `lib.rs` 深度解析文档

## 1. 定位与核心功能
如果抛开形式各异的 Web 页面与平台壳层，那么 `src-tauri/src/lib.rs` 是本次 `Mini-HBUT` 后端工程中**真正的上帝主类**（Application God Object）。由于 `main.rs` 中往往只是轻微转交生命线，`lib.rs` 内部则负责架构一切后端底层特权能力。

它的极强核心功能包含：
- **全局线程安全的上下文状态树创建 (AppState)**。
- 负责注册向前端 Web 层抛出的接口宏（Tauri Command Handler）。
- 定义核心网络客户端实例（单例化维护长效维持系统级的连接存活如 Cookie 持久化）。
- 作为整个大后端所有其它模块（如 `http_client.rs`, `modules::*`, `db.rs`）的中转加载库。

## 2. 逻辑原理与架构关联

### 2.1 高度重构的安全状态池 `AppState`
```rust
pub struct AppState {
    pub client: Arc<Mutex<HbutClient>>,
}
```
当工程架构拥有了高度复杂的异步状态要求（例如用户在使用时，会存在一个后台服务正在打码并尝试保持 Session 不掉线，而前台刚好请求拉取当前成绩），直接裸读写会导致数据竞争崩溃（Data Race Panic）。
`lib.rs` 使用了 Rust 并发处理的黄金圣杯：`Arc<Mutex<T>>`。这就保证了由 `HbutClient` 所维护着的爬虫网络句柄、CookieStore 都处于带并发安全加锁体系中，安全隔离了操作。

### 2.2 定义通信 DTO 契约 (Data Transfer Objects)
在此文件深处定义了大量的结构体并修饰 `#[derive(Serialize, Deserialize)]`：
例如：`UserInfo`, `LoginPageInfo`, `PortalQrInitResponse`。
所有的这些定义并非无端造出：它们的作用是成为前后端沟通的桥梁。前端发来的 JSON 数据在通过 IPC 的瞬间，Tauri 会利用 `serde` （反）序列化直接套入这个数据格式做类型的严苛效验，彻底阻断类似前端传入 `undefined` 引发的越界与溢出灾难。

### 2.3 底层环境污染对抗
```rust
const DEFAULT_PORTAL_SERVICE_URL: &str = "https://e.hbut.edu.cn/login#/";
const CHAOXING_LOGIN_PAGE_URL: &str = "...";
const CHAOXING_AES_KEY: &str = "u2oh6Vu^HWe4_AES";
```
文件内写死了大量的基础环境变量和解密秘钥，例如对超星平台的 AES-128-CBC 的秘钥声明机制。这使得这套跨域请求不受各种网络魔改影响，实现极硬连接穿透。

## 3. 代码级深度拆解：特殊加密算法与配置热加载

### 3.1 跨端配置单次加锁装载 (OnceLock)
```rust
static TEMP_UPLOAD_ENDPOINT: OnceLock<StdMutex<Option<String>>> = OnceLock::new();
```
`OnceLock` 是应对并发单次加载极其现代且健壮的控制句柄。它防止由于多个并行的应用启动子进程反复覆盖内存中的关键节点导致的数据污染，保证 `TEMP_UPLOAD_ENDPOINT` 等系统配置一经上锁不可肆意易主，为 `set_temp_upload_endpoint_config` 提供保护罩。

### 3.2 离线时效补偿补丁 (`attach_sync_time`)
```rust
fn attach_sync_time(payload: serde_json::Value, sync_time: &str, offline: bool) -> serde_json::Value {
   ...
}
```
这是个用于体验打磨的顶级补丁。当系统断网并且无法链接出教务服务器时，前端拿到的不能是一个生硬的 500 断网。
这里把 `db.rs` 里拉出的 `payload` 数据被强行织入了一个系统属性结构中 `"offline": true` 和一个时间戳 `"sync_time"`。这样，前端即便掉线也能正常展示上一次抓包获取到的排课表/成绩，只是在界面角落显示“缓存自 X 天前使用离线”。

## 4. 架构中的工程化挑战与应对
将太多的业务结构体（DTOs）甚至部分的杂项处理函数（像 `persist_electricity_tokens`）堆砌在 `lib.rs` 虽然目前可以运作良好，但在多团队协同推进千级功能后将会诱发该文件变得重度不可控。
优秀的维护者目前已在使用 `pub mod` 对 `http_client`, `parser`, `modules` 进行下放疏导分权，这是一道长长的防火墙体系。

## 5. 状态同步机理与路由通信管线图

此 Mermaid 用以详细分解 `lib.rs` 内核是如何充当整个操作控制盘的调度转子：

```mermaid
flowchart TB

    subgraph FrontEnd [前端世界 Webview / Vue]
        FE_CALL(Tauri Invoke 调出)
    end

    subgraph MACRO_ENTRY [lib.rs : 命令注册通道宏]
        ENTRY([#tauri::command<br/>各种函数截流点])
    end

    subgraph STATE_MACHINE [lib.rs 防护安全池]
        DIR(Arc|Mutex AppState|)
        CLIENT(HbutClient 网络核心连接)
        DIR ---|持锁与守卫| CLIENT
    end
    
    subgraph BUSINESS_MOD [具体功能基站]
        DB(db::save_xxx 缓存存储)
        MOD(modules::* 外延解析)
    end

    FE_CALL ==> |"跨层请求发出\n(如 截获电费令牌)"| ENTRY
    
    ENTRY -.-> |1. 获取锁| DIR
    DIR -.-> |2. 解锁暴露| CLIENT
    
    CLIENT <==> |3. 逻辑处理| MOD
    MOD -.-> |4. 归档调用| DB
    
    ENTRY -->|5. attach_sync_time <br/> JSON重塑| FE_CALL
    
    classDef mainBase fill:#2980b9,stroke:#000000,stroke-width:2px,color:#fff
    classDef libLayer fill:#8e44ad,stroke:#000000,stroke-width:2px,color:#fff
    classDef safeArea fill:#27ae60,stroke:#000,stroke-width:2px,color:#fff

    class MACRO_ENTRY libLayer
    class STATE_MACHINE safeArea
    class BUSINESS_MOD mainBase
```

*(End of document)*