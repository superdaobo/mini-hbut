# 全局开课监控表与过滤网关 (GlobalScheduleView.vue)

## 1. 模块定位与职责挑战

“全校排课表” (Global Schedule) 不同于“你的课表”。它查询出来的结果动辄达到上万条节点（包含了经管机电全部院系的开课数据）。
`GlobalScheduleView.vue` 为了解决**海量节点爆炸与复杂参数筛选**痛点，构建了一个携带多种过滤选项的高密度表单，并接管了深层次的数据剥离任务。

## 2. 状态映射与清洗工厂 (Wash Factory)

系统返回的 `kcsjdd` 或者嵌套对象结构极其庞杂，模块提供了一个庞大的字典以对抗脏数据：

```javascript
const stripHtml = (value) => {
// ...
  if (typeof window !== 'undefined' && window?.document) {
    const div = window.document.createElement('div')
    div.innerHTML = raw
    return div.textContent
  }
}
```
并且提供了最全的列字段中英隐射器：
```javascript
const FIELD_LABEL_MAP = {
  zongxs: '总学时', llxs: '理论学时',
  syxs: '实验学时', shijianxs: '实践学时',
  zdskrnrs: '最大容量', currentDepartmentId: '学院代码' //...
}
```

## 3. 巨量选项防抖绑定与计算逻辑

在筛选表里，如果要“全校搜索”，必须指定学年学期。且很多下拉框之间相互制约：
```javascript
const disableWeekRange = computed(() => filters.value.xsqbkb === '1')
```
如果用户勾选了“显示全部空表（全周）”，那么用于指定具体哪周的范围拨盘会直接变灰。这是非常细致入微的 Vue Reactive 响应式控制。

由于数据庞大，组件特设了分页系统：
```javascript
const pagination = ref({ page: 1, pageSize: 50 })
```
但因为后端没有给出标准游标翻页，许多操作可能在前端就地完成缓存，并且以防弹窗内文字过多，特设了 `DETAIL_SECTIONS` 把结果按四维度劈开（核心课程信息/教学安排信息/班级/系统标识）。这种高维渲染规划对于大型内控面板尤为珍贵。