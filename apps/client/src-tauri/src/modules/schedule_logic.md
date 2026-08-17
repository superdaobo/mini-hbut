# 课表查询模块逻辑 (schedule.rs)

## 1. 模块概述
`schedule.rs` 负责处理课程表的查询和解析。
它对标 Python 后端的 `backend/modules/grades.py` (课表部分) 或 `schedule.py`。
核心功能是解析教务系统的课表 JSON 数据，并将其转换为前端易于渲染的结构（包含周次、节次、地点等）。

## 2. 核心结构
*   **ScheduleCourse**: 单节课程信息，包含：
    *   `weekday`: 星期 (1-7)
    *   `period`: 节次 (1-12)
    *   `weeks`: 上课周次列表 (如 `[1,2,3,4,5]`)
    *   `location`: 教室名称
*   **ScheduleModule**: 管理请求和学期状态（当前周次计算）。

## 3. 逻辑流程图

```mermaid
graph TD
    A[Public API: fetch_schedule] --> B{Valid Session?}
    B -- Yes --> C[POST /kbdy/getKbkclist]
    B -- No --> D[Return Error]
    C --> |kbdy=1, xnxq=CURRENT| E[School Server]
    E --> F[JSON Response]
    F --> G[Parse Raw Course Data]
    G --> H[parse_weeks_text (Create Vec<i32>)]
    G --> I[Map Section/Weekday]
    I --> J[Return Vec<ScheduleCourse>]
```

## 4. 关键算法
*   **周次解析 (`parse_weeks_text`)**:
    *   将 "1-16周" 解析为 `[1..16]`。
    *   将 "1-16周(单)" 解析为奇数周。
    *   将 "3,5,7周" 解析为离散列表。
*   **当前周次计算**:
    *   `current_week = (today - start_date) / 7 + 1`

## 5. API 依赖
*   URL: `https://jwxt.hbut.edu.cn/admin/kbcx/kbdy/getKbkclist`
*   参数: `kbdy: 1` (可能是课表打印/定义的缩写), `xnxq: 2024-2025-1`
