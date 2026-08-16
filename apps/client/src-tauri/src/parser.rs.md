# `src-tauri/src/parser.rs` 实体转换与异构数据解析层

## 1. 文件概览

`src-tauri/src/parser.rs` 承担着前端与教务系统破烂不堪的数据接口之间的“遮羞布与翻译官”角色。
由于大学教务系统往往经历过至少一至两次供应商版本更迭（例如从青果系统迁移至正方系统再切到现在的综合体），同一项业务（比如提取学生姓名或查询过往三年成绩）在不同接口下的 JSON 完全是异构的。该模块利用强大的结构推导与多路复用回退机制，把丑陋的结构重新铸就成标准统一的 `UserInfo` 或 `Grade` Rust 模型反馈给前端调用。

### 1.1 核心职责与功能
1. **HTML 无序 DOM 拆解提取**: 将登录后页面中散乱分布、没有标准 API 吐出的学生个人资料强行反向正则剖析提取。
2. **成绩双版本路由解析 (`parse_grades`)**: 应对同系统因为历史遗留暴露的新旧两种截然不同返回结构的多态解压。

---

## 2. 泛型嗅探解析机制流水图

下面的 Mermaid 图以个人基本信息提取提取和成绩单两方面阐述 parser 工作的兼容回退防崩溃策略。

```mermaid
flowchart TD
    classDef input fill:#3498db,stroke:#2980b9,stroke-width:2px,color:#fff;
    classDef algo fill:#f39c12,stroke:#e67e22,stroke-width:2px,color:#fff;
    classDef re fill:#8e44ad,stroke:#9b59b6,stroke-width:2px,color:#fff;
    classDef output fill:#2ecc71,stroke:#27ae60,stroke-width:2px,color:#fff;

    StartInfo[(接收 HTML)]:::input --> Scraper[构建 DOM 文档节点对象]
    
    Scraper --> NewWay{尝试新版页面 DOM 规律 \n extract_field 过滤器}:::algo
    NewWay -->|未找到| OldForm{尝试旧版表单输入框 \n input id='xh'}:::algo
    OldForm -->|未找到| regexFall{使用裸正则表达式探测 \n r'学号[：:]（正则）'}:::re
    
    regexFall --> ResultInfo[映射为纯净的 UserInfo]:::output
    
    StartGrade[(接收 API 成绩 JSON)]:::input --> CheckV{探测数据骨架风格}:::algo
    
    CheckV -->|有 results / ret 节点| FlowV2[走新版教务 V2 逻辑]
    CheckV -->|仅有 items 节点无外包| FlowV1[走旧版教务 V1 逻辑]
    
    FlowV2 --> MapV2(提取 zhcj 即综合成绩, hdxf获取学分)
    FlowV1 --> MapV1(提取 cj 即成绩, xnmmc 等老拼音)
    
    MapV1 & MapV2 --> FormatGrade[调用 extract_number_field / value_to_string 进行全转字符串包裹防强转报错]
    
    FormatGrade --> Done[统一下发 Vec<Grade>]:::output
```

### 2.1 架构深度解读

#### a. 阶梯退坑式正则防卫 (`parse_user_info`)
教务系统在返回用户登录后台的首屏资料时，部分资料并不是 JSON 而是写死直接拼接进 HTML 返回的。
```rust
let extract_field = |label: &str| -> Option<String> {
    let pattern = format!(
        r#"(?s){}\s*[:：]?\s*</label>\s*</div>\s*<div class=\"item-content\">\s*(?:<label[^>]*>)?([^<★]+)"#,
        label_escaped
    );
     if let Ok(re) = regex::Regex::new(&pattern) { ... }
}
```
作者在这里用最凶狠的宽容正则吞噬各种因为空格/换行引发的错位。同时使用多级防脱退路：当上面的新型 `item-content` 匹配不来时，它自动退防寻找带有 `input` 的老古董页面结构，最后如果还获取不到名字直接用裸拼写模式强拆。这确保了只要网页带有用户的姓名和学期，不管藏在哪个魔改模版节点里，Rust 都能像吸尘器一样扒得一丝不挂。

#### b. 拼音黑话兼容字典 (`parse_grades`)
在历史的数据字典推导下，学校旧业务系统严重依赖开发者缩写黑话。例如提取成绩项，面对千奇百怪的 Key：
```rust
// 新版 API 格式: {"ret": 0, "msg": "ok", "results": [...]}
// 旧版 API 格式: {"items": [...]}

let final_score = if let Some(v) = item.get("zhcj") {
    value_to_string(v)   // V2版的 综合成绩拼音缩写
} else {
    extract_number_field(item, &["cj"])  // V1老的 裸成绩拼音缩写
};
```
Parser 层把这层泥沼彻底掩盖在了底层。利用短小精悍的探测条件将新老代码在同一个遍历内消化殆尽，给未来的 API 大整合提供了范本教材。这种多变接口融合处理非常具备工程生产应用参考意义。