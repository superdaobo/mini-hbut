# 🦀 Rust 源代码

Mini-HBUT 后端的核心 Rust 代码。

## 📁 文件说明

### main.rs

应用主入口，初始化 Tauri 应用。

### lib.rs

**Tauri 命令定义** - 定义所有前端可以调用的命令。

主要命令：

| 命令 | 功能 |
|------|------|
| `login` | 用户登录 |
| `logout` | 退出登录 |
| `get_grades` | 获取成绩 |
| `get_grades_by_term` | 按学期获取成绩 |
| `get_schedule` | 获取课表 |
| `get_classrooms` | 获取空教室 |
| `get_exams` | 获取考试安排 |
| `get_calendar` | 获取校历 |
| `get_electricity` | 获取电费 |
| `get_ranking` | 获取排名 |
| `get_training_plan` | 获取培养方案 |
| `get_academic_progress` | 获取学业进度 |
| `get_student_info` | 获取学生信息 |
| `check_update` | 检查更新 |

### http_client.rs

**HTTP 客户端** - 处理所有网络请求。

功能：
- Cookie 管理和 Session 保持
- 自动重试和错误处理
- 学期/周次自动计算
- 请求超时控制

重要函数：
- `login()` - 登录教务系统
- `get_current_semester()` - 计算当前学期
- `calculate_current_week()` - 计算当前周次

### parser.rs

**HTML 解析器** - 解析教务系统返回的 HTML。

使用 `scraper` 库解析 HTML，提取结构化数据。

### db.rs

**SQLite 数据库** - 本地数据存储。

表结构：
- `credentials` - 登录凭据
- `grades` - 成绩缓存
- `schedule` - 课表缓存

## 📦 modules/

功能模块，每个文件对应一个功能：

| 文件 | 功能 |
|------|------|
| `mod.rs` | 模块导出 |
| `grades.rs` | 成绩查询 |
| `schedule.rs` | 课表查询 |
| `classroom.rs` | 空教室查询 |
| `exam.rs` | 考试安排 |
| `calendar.rs` | 校历 |
| `electricity.rs` | 电费查询 |
| `ranking.rs` | 排名查询 |
| `training_plan.rs` | 培养方案 |
| `student_info.rs` | 学生信息 |

## 🔧 开发指南

### 添加新的 Tauri 命令

```rust
// 1. 在 lib.rs 中定义命令
#[tauri::command]
async fn new_command(
    state: State<'_, AppState>,
    param: String
) -> Result<ReturnType, String> {
    // 实现逻辑
}

// 2. 注册命令
.invoke_handler(tauri::generate_handler![
    // ... 其他命令
    new_command,
])
```

### 错误处理

使用 `Result<T, String>` 返回结果，前端通过 try-catch 捕获错误。

### 调试

```bash
# 运行开发模式
npm run tauri dev

# 查看 Rust 日志
RUST_LOG=debug npm run tauri dev
```
