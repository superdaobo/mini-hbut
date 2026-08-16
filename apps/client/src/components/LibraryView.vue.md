# 馆藏总仓与联机公共目录查询 (LibraryView.vue)

## 1. 模块级功能战略分析

学生的自习与深造离不开图书馆。但绝大部分学校购买的第三方 OPAC (Online Public Access Catalog) 图书系统有着繁琐的界面和落后的搜索逻辑。
`LibraryView.vue` 旨在接管、覆写并发起代理性质的搜索查询。它内置了极为强大的高级过滤引擎（出版社/学科分类）、多重图片源爬取能力以及预订状态识别指示器。

## 2. 强容错高可用封面抓取引擎

许多图书馆里的书，其接口给出的封面图片链接往往是失效的、缺少协议的 (`//`)、或者需要反向代理。
代码提供了多级降级回退技术 (`getDetailCover`)：
```javascript
const candidates = [
  book.duxiuImageUrl,
  book.cover,
  book.coverUrl,
  book.imgUrl, // ...
]
```
在此之上，如果学校后端彻底瘫痪无图：
```javascript
const buildBookcoversUrl = (isbn) => {
  const text = String(isbn || '').trim()
  if (!text) return ''
  return `https://www.bookcovers.cn/index.php?client=800512&isbn=${encodeURIComponent(text)}/cover`
}
```
**基于外部第三方公共 ISBN 图库接口**，在端侧合成并填充用户的视野空白区域机制，保障体验完整性。

## 3. Regex 语义级馆藏状态归类

返回的数据经常是难以解析的字符串，例如：“中环二楼自科借阅区（新书在架）”。
引擎部署了正则表达式精准抓包并渲染红绿黄三种颜色：
```javascript
const holdingStatusClass = (status) => { //...
  if (/在架|可借|available|on\s?shelf/i.test(text)) return 'holding-status-available'
  if (/借出|应还|loan|borrow/i.test(text)) return 'holding-status-borrowed'
  if (/预约|预订|reserve/i.test(text)) return 'holding-status-reserved'
}
```

## 4. 高维分面搜索与交互链路

```mermaid
graph TD
    A[用户输入关键字] --> B{设定高阶筛选 selectedFilters}
    B --> |如限定:机械工业出版社| C[提交检索请求]
    C --> D[返回 dictData(分面统计)与 Result]
    D --> E[解析 holding_items 判断馆藏数与在架数]
    E --> F[通过 ISBN 回填图书封面]
    F --> G[渲染至流式网格面板]
```
这个功能通过合并基础属性映射表 `filterMeta` (学科馆藏等)，打造了一个极为严密的文献探索体验。