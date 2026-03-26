# `src-tauri/src/db.rs` API 缓存与持久化核心解析

## 1. 文件概览

`db.rs` 是 Rust 后端与本地 SQLite 数据库交互的核心桥梁模块，它是保障整个应用“离线可用性”（Offline Mode）和极速启动响应的基础。
所有的成绩、课程表、考试安排、网络电费缓存，乃至核心的加密用户凭证，都在这里通过 `rusqlite` 层层管理，确保数据的持久化安全和读取效能。

### 1.1 核心职责与功能
1. **SQLite 结构初始化**: 负责 `init_db` 创建核心的数据表，如用户独立绑定的 `grades` 成绩表、`user_sessions` 凭据表。
2. **离线缓存容器**: 创建并管理数量庞大的 `_cache` 关联表，根据公有（`public_cache`）与私有区分缓存维度。
3. **数据存取 API**: 提供给前端 IPC 调用的底层 Rust API：`save_cache` 和 `get_cache`，这些操作序列化 JSON 数据存入本地表。
4. **安全凭据守护**: 处理并加密保存 `password`、`cookies` 以及各种服务所需的 Token（如一码通、电费 Token）。

---

## 2. 数据库架构化视图

下面用图表展现应用是如何通过 `db.rs` 进行层级抽象和缓存区分的。

```mermaid
erDiagram
    classDef main fill:#3498db,stroke:#2980b9,stroke-width:2px,color:#fff;
    classDef private fill:#e67e22,stroke:#d35400,stroke-width:2px,color:#fff;
    classDef public fill:#2ecc71,stroke:#27ae60,stroke-width:2px,color:#fff;
    classDef config fill:#8e44ad,stroke:#2c3e50,stroke-width:2px,color:#fff;

    DB_Core[db.rs 离线存储]:::main
    
    DB_Core --> Users
    DB_Core --> Grades_Data
    DB_Core --> Private_Caches
    DB_Core --> Public_Caches

    Users[user_sessions 表]:::config
    Users : + student_id (PK)
    Users : + cookies
    Users : + encrypted_password
    Users : + *tokens (one_code/electricity)

    Grades_Data[grades 业务表]:::private
    Grades_Data : + id (PK)
    Grades_Data : + term
    Grades_Data : + course_name
    Grades_Data : + final_score

    Private_Caches[私有 _cache 族]:::private
    Private_Caches : grades_cache
    Private_Caches : schedule_cache
    Private_Caches : electricity_cache
    Private_Caches : student_id (PK)
    
    Public_Caches[公共 _cache 族]:::public
    Public_Caches : library_public_cache
    Public_Caches : semesters_public_cache
    Public_Caches : cache_key (PK)
```

### 2.1 结构解读

- **私密隔离性**: 设计上巧妙地将缓存分为“公有”和“私有”两种结构。公用缓存如学期配置 (`semesters_public_cache`) 等通过 `cache_key` 主键追踪；而私有缓存 (`schedule_cache`, `grades_cache`) 强制绑定 `student_id` 为主键，彻底隔离不同用户的缓存数据，在切换账户时保证不会越权串流。
- **自定义表扩展**: 专设 `custom_schedule_courses` 表，允许系统外加的自定义课程可以完整记录。并使用动态 JSON `weeks_json` 的形式处理变长上课周次数据。

---

## 3. 核心机制解析

### 3.1 路径解析与连接层设计

```rust
fn resolve_db_path<P: AsRef<Path>>(path: P) -> PathBuf {
    if let Ok(raw) = std::env::var("HBUT_DB_PATH") {
        let candidate = PathBuf::from(raw);
        if !candidate.as_os_str().is_empty() {
            return candidate;
        }
    }
    path.as_ref().to_path_buf()
}
```
通过 `resolve_db_path` 在打开数据库前拦截并替换路经。这个实用的后门允许在调试与 CI（持续集成）时，通过环境变量 `HBUT_DB_PATH` 修改数据库存储点，而不需要重新编译整个 Tauri 项目。若所在目录不存在，连接前的 `std::fs::create_dir_all(parent)` 会保障容错性。

### 3.2 半透明安全加密防御

```rust
// 保存用户会话 (包括密码，用于自动重登录)
// 简单 Base64 编码作为"加密" (仅防君子)
let encrypted_password = base64::engine::general_purpose::STANDARD.encode(password);
```

对于凭据 `user_sessions` 的防卫，目前该文件使用了一种相对简易的防护（Base64）。根据文件中的注释，生产环境中确实应更换为更高强度的混淆或依赖系统级别的安全钥匙环 (`Keytar`)。这种取舍很大程度是为了兼顾轻量与调试便利度。

### 3.3 无痛升级设计 (`ensure_user_session_columns`)

随着版本的迭代，开发者为用户状态增加了比如电费的 OAuth Refresh Tokens。为了避免新老用户的 SQLite 表结构对撞报错，开发者独立提取了 `ensure_user_session_columns` 并在每次初始化和访问凭证前“顺带”用 `ALTER TABLE` 热修补数据库：

```rust
fn ensure_user_session_columns(conn: &Connection) {
    let _ = conn.execute("ALTER TABLE user_sessions ADD COLUMN one_code_token TEXT", []);
    // 忽略错误：列已存在时会默认报错并被 let _ 忽略
}
```
利用强吃异常（`let _` 吞噬 SQLite 报错）达到无缝数据平滑迁移效果。

---

## 4. 交互层与序列化

对于大规模无定形的结构体（如复杂的混合返回数据），前端不可能为所有的数据匹配后端严格字段表。因此缓存存取使用 JSON 序列化绕开 ORM 模型：

- `pub fn save_cache`: 将任意传入的 `serde_json::Value` 转码序列化，加上当前的设备 `Local::now()` 的时间戳作为 `sync_time` 落库。这里用的是 `INSERT OR REPLACE` 原子操作来抵消了之前可能因为同样的主键（`student_id`）造成的覆盖冲突异常。
- `pub fn get_cache`: 向前端输出特定的元组 `Ok(Some((data, sync_time)))`，为前端提供缓存版本检验的数据保障。

这种架构把后端的复杂性剥离，将后端退化为一个极快速的键值持久容器（K-V Storage），是基于 Tauri 开发大流量离线单页应用（SPA）的标准范式。