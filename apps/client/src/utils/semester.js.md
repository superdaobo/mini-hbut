# 学期时间轴解析器 (semester.js)

## 1. 模块定位与职责

在校园教务系统中，学期的表达格式非常特定，如“2023-2024-1”代表 23年~24年的第一学期。
为了能够在 UI 上智能排序学期、识别哪个学期最新、或者处理历史遗留缓存问题，`semester.js` 提供了一整套脱离业务请求的纯粹**文本解析与对象建模与排序**工具包。

## 2. 正则表达式与数据模型

核心正则表达式：`const SEMESTER_RE = /^(\d{4})-(\d{4})-([12])$/`

只要传入匹配该格式的字符串，都会经过 `parseSemester` 转化为结构体：
```javascript
// 入参: "2023-2024-2"
// 出参:
{
  text: '2023-2024-2',
  startYear: 2023,
  endYear: 2024,
  term: 2 // 1为上学期，2为下学期
}
```

## 3. 权重与排序系统

比较任何两个学期大小的任务，全权交给 `compareSemesterDesc` 与 `semesterIsNewer`：

```mermaid
graph TD
    A[传入 学期A, 学期B] --> B{解析成功?}
    B -- Yes --> C{比较 startYear}
    C -- A.startYear > B.startYear --> D[A 较大]
    C -- 相等 --> E{比较 term}
    E -- A.term > B.term --> D
    E -- B.term > A.term --> F[B 较大]
    
    B -- One Fail --> G[能被解析的那方更大]
    B -- All Fail --> H[降级使用 localeCompare(字典序)]
```

> **降级鲁棒性机制**
> 当遇到学校突变学期命名规则，或是脏数据导致正则不匹配时，它不会使系统崩溃，而是退化为字符串字典序 `String(b).localeCompare(String(a))` 排序。

## 4. 当前学期消歧义解析 (`resolveCurrentSemester`)

在大量学期乱序排布的列表中，哪一个是“当下的活跃学期”？
1. `list = normalizeSemesterList(semesterList)`：输入列表清洗去重。
2. **规则1**：如果后端接口明示了 `hintedCurrent` 并且确实存在于洗净后的名单中，拿它！
3. **规则2**：如果接口没给，检查缓存库 `localStorage.getItem('hbu_schedule_meta')` 中的最近活动痕迹，命中则拿缓存。
4. **规则3**：穷途末路，拿刚刚排序后的最大（也就是第一个）`list[0]` 做当前学期。