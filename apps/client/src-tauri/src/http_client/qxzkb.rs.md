# `src-tauri/src/http_client/qxzkb.rs` 全校课表与基础数据抓取模块解析

## 1. 文件概览

`src-tauri/src/http_client/qxzkb.rs` (拼音简称 QXZKB : Quan Xiao Zong Ke Biao) 是本系统针对**“全校排课课表”**这种带有极大体量数据的公共接口所定制的抓取工具类。
区别于针对单一学生个体的选课或教务查询，它往往需要更严密的过滤。特别是这部分接口的返回字段，经常会携带有富文本 HTML 标签和各种丑陋的编码，因此该模块内嵌了高强度清洗净洗器（Sanitizer）。

### 1.1 核心职责
1. **递归净洗恶意返回**: 当老教务向前端吐 JSON 但属性值内包含 `&nbsp;`, `&amp;` 以及大量无用的内联 `<font>` 描述时，利用引用借用的递归函数全方位洗刷干净转回明文。
2. **多层查课预检钩子**: 实现包括且不限于 `fetch_qxzkb_jcinfo`（节次） 、`fetch_qxzkb_zyxx`（专业大类）、`fetch_qxzkb_kkjys`（教研室）这三重核心基础资料的探测，为真正的复杂跨域表单收集字典依赖。
3. **保持激活锁防丢**: 对于大型复合接口强绑定 `gridtype=jqgrid` 并带有假前端触发防止状态断连的隐层逻辑。

---

## 2. JSON 异物清理数据处理流

```mermaid
flowchart TD
    classDef main fill:#9b59b6,stroke:#8e44ad,stroke-width:2px,color:#fff;
    classDef regex fill:#e74c3c,stroke:#c0392b,stroke-width:2px,color:#fff;
    classDef json fill:#f1c40f,stroke:#f39c12,stroke-width:2px,color:#333;

    Data[老式教务返回附带 HTML 标签的 JSON]:::main
    
    Data --> Fetcher[fetch_* API 调用层]
    Fetcher --> Sanitize[sanitize_json_value 开始遍历匹配]
    
    Sanitize --> ValidType{判别 JSON 变量类型?}:::json
    
    ValidType -->|Object 类| O[迭代其 Keys, 向下深度递归]
    ValidType -->|Array 数组| A[迭代其中元素, 向下深度递归]
    ValidType -->|Value 值| Strip[进入 strip_html_tags 字符串处理]
    
    Strip --> TagKill[1. Regex 强行干掉 <[^>]+> 容器]:::regex
    Strip --> AsciiConvert[2. html_entity 转码: '&nbsp;' -> ' ']:::regex
    
    O & A & Strip --> Success[组装为纯净 Rust serde_json 原型并交付调用方]:::main
```

### 2.1 架构深度解读

#### a. 极其彻底的教务脏数据洗包机 (`sanitize_json_value`)
教务系统有个非常可怕的恶习，它吐出的所谓 JSON 列表的值其实是一大坨带有 HTML 背景色的字符串（这是极其违背前后端分离常理的）：
```rust
fn sanitize_json_value(value: &mut serde_json::Value, re: &Regex) {
    match value {
        serde_json::Value::String(s) => {
            if s.contains('<') || s.contains("&nbsp;") {
                *s = strip_html_tags(s, re);
            }
        }
        serde_json::Value::Array(arr) => { ... } // 递归
```
使用了 Rust 神奇且零成本提取可变引用 `&mut` 这个特性，只对原树进行修改不需要深度 `Clone` 费内存，逐个地把诸如 `张三<br/>` 洗净成 `张三`。这就免除了前端在渲染纯净表格时被 XSS 注入的安全性风险，大大降低前端业务的心智负担。

#### b. 唤醒登录守卫校验拦截 
所有的 `qxzkb` 请求都在请求完成后立马做一次鉴权脱落嗅探：
```rust
if text.contains("authserver/login") {
    return Err("会话已过期，请重新登录".into());
}
```
因为很多全校公共接口不会响应规范的 `HTTP 401 Unauthorized`，反而会响应 `HTTP 200` 附带一个 302 跨越到外层的登录拦截页面。这种暴力的包含判断第一时间将假成功阻挡在了上游端。

#### c. 先期建立缓存激活管道 (`fetch_qxzkb_list`)
```rust
// 先访问页面建立会话（避免登录超时）
let page_url = format!("{}/admin/jsd/qxzkb", base);
let _ = self.client.get(&page_url).send().await;
```
极其细腻的设计！在访问耗时巨大的全校课表载荷之前，代码首先发送一次针对该页面的静默请求探测以让服务端的 `Tomcat / Jboss` 的长轮询通道对齐，极大地降低大请求遇到网络熔断和连接阻断（Connection Reset by Peer）的情况。