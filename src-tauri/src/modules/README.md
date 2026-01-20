# 📦 功能模块

各功能的具体实现模块。

## 📁 模块列表

### grades.rs - 成绩查询

查询学生成绩，支持按学期筛选。

```rust
pub async fn get_grades(client: &HttpClient, term: Option<String>) -> Result<Vec<Grade>, String>
```

返回数据：
- 课程名称
- 学分
- 成绩
- 绩点
- 课程性质

### schedule.rs - 课表查询

查询学生课表。

```rust
pub async fn get_schedule(client: &HttpClient, week: Option<i32>) -> Result<Schedule, String>
```

返回数据：
- 周次
- 课程安排（时间、地点、教师）

### classroom.rs - 空教室查询

查询指定时间段的空教室。

```rust
pub async fn get_classrooms(
    client: &HttpClient,
    building: String,
    date: String,
    section: i32
) -> Result<Vec<Classroom>, String>
```

### exam.rs - 考试安排

查询考试安排。

```rust
pub async fn get_exams(client: &HttpClient) -> Result<Vec<Exam>, String>
```

返回数据：
- 课程名称
- 考试时间
- 考试地点
- 座位号

### calendar.rs - 校历

获取当前学期校历信息。

```rust
pub async fn get_calendar(client: &HttpClient) -> Result<Calendar, String>
```

返回数据：
- 学期开始日期
- 当前周次
- 放假安排

### electricity.rs - 电费查询

查询宿舍电费余额。

```rust
pub async fn get_electricity(client: &HttpClient, dorm: String) -> Result<Electricity, String>
```

### ranking.rs - 排名查询

查询学生排名。

```rust
pub async fn get_ranking(client: &HttpClient) -> Result<Ranking, String>
```

返回数据：
- 班级排名
- 专业排名
- 年级排名

### training_plan.rs - 培养方案

获取专业培养方案。

```rust
pub async fn get_training_plan(client: &HttpClient) -> Result<TrainingPlan, String>
```

### student_info.rs - 学生信息

获取学生基本信息。

```rust
pub async fn get_student_info(client: &HttpClient) -> Result<StudentInfo, String>
```

## 🔧 开发说明

### 添加新模块

1. 创建新文件 `new_module.rs`
2. 在 `mod.rs` 中添加导出：
   ```rust
   pub mod new_module;
   ```
3. 在 `lib.rs` 中使用模块

### 通用模式

```rust
pub async fn get_data(client: &HttpClient) -> Result<DataType, String> {
    // 1. 发送请求
    let html = client.get("url").await?;
    
    // 2. 解析 HTML
    let document = Html::parse_document(&html);
    
    // 3. 提取数据
    let data = parse_data(&document)?;
    
    // 4. 返回结果
    Ok(data)
}
```

### 错误处理

使用 `Result<T, String>` 统一错误类型，方便前端处理。
