# 学制蓝图追查矩阵 (TrainingPlanView.vue)

## 1. 业务逻辑背景

大学生的毕业判定不仅靠挂科与否，还靠“培养方案 (Training Plan)”中的选修、必修学分是否达标。
这个模块极其类似于全局开课，但它的检索目标被锁死在“学生所在年级/专业应需要学习的特定课树结构”。这让它需要承载更多的分类指标（比如这门课到底是“核心通识”还是“专业实践”）。

## 2. 魔法代码释义典 (Magic Word Decryption)

系统的培养方案往往只丢回生硬的数字代码（`kcxz: '11'`）。这是一个严重的视觉破坏，无法让学生明白。
组件内部挂载了一个极其详尽的回退字典：
```javascript
const COURSE_NATURE_FALLBACK_MAP = {
  '11': '通识教育必修课',
  '12': '通识教育选修课',
  '40': '专业核心课',
  '50': '基础实践',
  '98': '重修课',
  //... 各种校方定义
}
```
当远程解析引擎一旦失效，本地渲染仍可以通过这些生拼硬凑的词典准确无误地将卡片打上合法类别。

## 3. 滤网持久化与环境保留 (`hbu_training_options`)

用户在此进行一次搜索时，可能要选择“某某校区”、“某教研室”等极为繁冗的联合选项。此操作被严密存储到了浏览器的 LocalStorage：
```javascript
const loadLocalOptions = () => {
  const raw = localStorage.getItem('hbu_training_options')
  if (!raw) return
  // 直接合并用户上次查找到的复杂选项组
  defaults.value = cached.defaults
}
```

## 4. 级联数据瀑布提取

为了获取一门课，“教研室”(Jys) 下拉框的内容取决于 “开课学院”(Kkyx) 是否已经被激活。这是强从属的异步请求。

```mermaid
graph TD
    A[挂载期] --> B[并发 fetchOptions 获取院系与年级宏观下拉列表]
    B --> C{用户选中了其中某一个开课学院?}
    C -- Yes --> D[激发 fetchJys() 发送 POST 请求获取级联下属教研室]
    D --> E[解除教研室下拉框锁定状态]
    E --> F[组装大结构并利用 fetchCourses(page) 执行长效检索列表]
```
由于带有很强的查询频率，此处的接口使用了 `LONG_TTL` 防止给高危内网服务器发送 DDoS 式拉取。最大限度将缓存沉淀在本地完成离线展示。