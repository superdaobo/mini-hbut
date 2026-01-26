# 🦀 Rust 后端 (Tauri)

Mini-HBUT 的 Rust 后端部分，负责处理所有与教务系统的网络请求、数据解析和本地存储。

## 📁 目录结构

```
src-tauri/
├── src/                      # Rust 源码
│   ├── lib.rs                # Tauri 命令定义
│   ├── main.rs               # 主入口
│   ├── http_client.rs        # HTTP 客户端
│   ├── parser.rs             # HTML 解析器
│   ├── db.rs                 # SQLite 数据库
│   └── modules/              # 功能模块
├── icons/                    # 应用图标
├── gen/                      # 生成的代码 (Android/iOS)
├── Cargo.toml                # Rust 依赖配置
├── tauri.conf.json           # Tauri 配置
├── build.rs                  # 构建脚本
└── .taurignore               # 忽略文件
```

## 🔧 核心模块

### lib.rs - Tauri 命令

定义所有前端可调用的命令：

```rust
#[tauri::command]
async fn login(username: String, password: String) -> Result<String, String> {
    // 登录逻辑
}
```

### http_client.rs - HTTP 客户端

封装所有与教务系统的 HTTP 请求：

- Cookie 管理
- Session 保持
- 请求重试
- 学期/周次计算

### parser.rs - HTML 解析器

解析教务系统返回的 HTML 页面，提取所需数据。

### db.rs - 数据库

SQLite 本地数据库，用于缓存：

- 登录凭据
- 成绩数据
- 课表数据

## 📦 功能模块 (modules/)

| 模块 | 功能 | 对应前端页面 |
|------|------|-------------|
| `grades.rs` | 成绩查询 | GradeView |
| `schedule.rs` | 课表查询 | ScheduleView |
| `classroom.rs` | 空教室查询 | ClassroomView |
| `exam.rs` | 考试安排 | ExamView |
| `calendar.rs` | 校历信息 | CalendarView |
| `electricity.rs` | 电费查询 | ElectricityView |
| `ranking.rs` | 排名查询 | RankingView |
| `training_plan.rs` | 培养方案 | TrainingPlanView |
| `student_info.rs` | 学生信息 | StudentInfoView |
| `transaction.rs` | 交易记录 | TransactionHistory |

## 🔑 添加新功能

### 1. 创建模块文件

```rust
// src/modules/new_feature.rs
pub async fn get_data(client: &HttpClient) -> Result<Vec<Data>, String> {
    // 实现逻辑
}
```

### 2. 在 mod.rs 中导出

```rust
// src/modules/mod.rs
pub mod new_feature;
```

### 3. 在 lib.rs 中添加命令

```rust
#[tauri::command]
async fn get_new_feature(state: State<'_, AppState>) -> Result<Vec<Data>, String> {
    let client = state.client.lock().await;
    modules::new_feature::get_data(&client).await
}
```

### 4. 注册命令

```rust
.invoke_handler(tauri::generate_handler![
    // ... 其他命令
    get_new_feature,
])
```

## ⚙️ 配置文件

### tauri.conf.json

主要配置项：

```json
{
  "productName": "Mini-HBUT",
  "version": "1.0.0",
  "identifier": "com.minihbut.app",
  "app": {
    "windows": [...],
    "security": {...}
  },
  "bundle": {
    "android": {...},
    "windows": {...}
  }
}
```

### Cargo.toml

Rust 依赖：

- `tauri` - Tauri 框架
- `reqwest` - HTTP 客户端
- `scraper` - HTML 解析
- `rusqlite` - SQLite
- `serde` - 序列化
- `chrono` - 日期时间

## 🛡️ 安全说明

- 密码使用 RSA 加密传输
- 本地存储使用 SQLite 加密
- 敏感信息不上传云端
