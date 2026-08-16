# 培养方案模块逻辑 (training_plan.rs)

## 1. 模块概述
`training_plan.rs` 对应 Python 后端的 `backend/modules/training_plan.py`。
主要负责学生培养方案的查询，包括：
1.  抓取查询页面的下拉筛选条件 (Select Options)。
2.  级联查询教研室 (JYS) 列表。
3.  查询具体的课程执行计划列表 (JQGrid)。

## 2. 核心结构
*   **TrainingPlanOptions**: 包含年级、学期、学院、课程性质等前端所需的筛选列表。
*   **SelectOption**: 标准的 `{value, label}` 结构，适配前端 UI 组件 (如 AntD Select)。

## 3. 逻辑流程

### 3.1 获取选项 (`fetch_options`)
1.  GET `/admin/xsd/studentpyfa` 获取 HTML 页面。
2.  使用 CSS选择器或正则提取 `<select name="xxx">` 中的 `<option>`。
3.  清洗数据 (去除 HTML 实体)。

### 3.2 级联查询 (`fetch_jys`)
1.  根据用户选择的“开课学院” (kkyx)，异步查询对应的“教研室” (kkjys)。
2.  API: `/admin/pygcgl/kckgl/queryJYSNoAuth`。

### 3.3 课程查询 (`fetch_courses`)
1.  POST `/admin/xsd/studentpyfa/ajaxList2`。
2.  参数包括众多过滤条件 (`kkyx`, `kkjys`, `grade` 等)。
3.  返回 JQGrid JSON，透传给前端。

## 4. 关键技术
*   `regex` / `html_escape`: 用于解析非标准的 HTML 选项片段。
*   `serde_json`: 处理动态的查询字段。
