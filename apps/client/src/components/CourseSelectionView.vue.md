# 超级选课雷达系统 (CourseSelectionView.vue)

## 1. 模块定位与业务挑战

教务系统的选课通常分为公共选修课（公选）、专业选修课、辅修课等。在抢课高峰期，教务处往往长达数天的拥堵。
`CourseSelectionView.vue` 是一款被设计成**选课雷达与防抖轰炸机**兼备的终极武器界面。它利用多标签切换、实时容量计算与本地过滤引擎，将选课步骤压缩到一个页面以内，极大降低请求频次。

## 2. 清洗引擎：与烂数据的对抗

教务处经常将 JSON 或 HTML 数据混着吐出。为了提取出能够展示的干净文字，专门开发了一套高能解析器聚合：
```javascript
const stripHtml = (value) => {
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  return safeText(doc.body?.textContent || raw)
}
const compactTeachingClassName = (value) => {
  // 把恶心的 "2023-计算机网络(理论) 001班" 压缩剥离
  return stripHtml(value).replace(/([\-—_]?)(?:理论|实践|实验|混合)?\s*\d{3,}\s*$/u, '$1')
}
const looksLikeEncodedSchedule = (value) => {
  // 识别 1234,4432 这类教务系统特有的排课乱码
  return /^\d+(,\d+)+$/.test(text)
}
```

## 3. 面向抢课的特殊交互流

### 3.1 撞车检测系统 (`hasConflictHint`)
如果拉取过来的课包含了 `冲突状态|conflictingCourse` 等字样，直接使用红底提示，并且过滤掉不让选。

### 3.2 父子课程穿透（实验/理论结合课）
部分选修课拥有“子教学班（Child Class）”。例如选了理论课，同时要挑一个实验班时间。
在触发选课时会判断它是不是需要额外选择：
```javascript
const showChildClassDialog = ref(false)
const confirmActionType = ref('') // 'select' | 'withdraw' 
```
此时系统会弹出一个模态窗进行进一步参数提交，保证了一站式的选择能力，不跳转页面导致用户在高峰期返回时页面失联吃白屏。

## 4. 极致防御机制

选课属于高发报错重灾区（系统满载、被挤出）。
模块使用了极为强悍的正则剥离代码级报错信息（`looksLikeCodeLine`）：
```javascript
const looksLikeCodeLine = (line) => {
  if (/^(\/\/|\/\*|\*\/)/.test(lower)) return true
  if (/^(var|let|const|function|if|else|try)\b/.test(lower)) return true
  return false
}
```
当系统返回 `500` 甚至夹带了一长串 Tomcat 或 PHP 源码时，自动将其屏蔽（在 `normalizeDetailIntro` 中剔除），仅抽取出人类可读的部分，例如“选课人数已满”。

这样不仅起到了美观的作用，也隐藏了教务系统的技术栈栈痕以维护用户体验，是该模块中极为惊艳的设计。