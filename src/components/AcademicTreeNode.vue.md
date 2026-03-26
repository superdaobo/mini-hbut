# 学院派数据结构递归树组件 (AcademicTreeNode.vue)

## 1. 模块定位与职责

在许多复杂视图下（主要是教务系统培养方案展示中），虽然有了扁平化结构，但是在某些特定界面逻辑里依旧需要原汁原味地展现“学院-专业-年级-必修大类-次级选修”之间的树形套嵌关系。
`AcademicTreeNode.vue` 是一个被设计为**可以自己调用自己（递归）**的 Vue Component。它将树状层级可视化为一组可以通过 HTML5 原生 `<details>` 和 `<summary>` 动态折叠的面板集合。

## 2. 原生 HTML5 折叠控制器的利用

它规避了引入重型 UI 库（如 ElementPlus 的 Tree 组件）的开销，全盘依赖最原生且零时钟耗时的 `<details>` 节点：
```html
    <details>
      <summary>
        <div class="node-title">
          <span class="name">{{ node.nodeName || '-' }}</span>
        </div>
      </summary>
      <div class="node-body">
        <!-- 内部课程... -->
        <!-- 内部子节点... -->
      </div>
    </details>
```
利用 CSS 伪类 `summary::-webkit-details-marker { display: none; }` 去除原本难看的黑色三角箭头，改为前端自定义的高质感 UI，提升了渲染效率至极致。

## 3. Vue 递归组件技术深度探析

这是 Vue 里面一种非常高阶的处理模式。组件在其自身的 template 里写入了自己本身标签。
```javascript
// <script> 必须暴露 name 让自身可相互调用
export default { name: 'AcademicTreeNode' }
...
<div v-if="hasChildren" class="children">
   <AcademicTreeNode v-for="child in node.children" :key="child.nodeId" :node="child" />
</div>
```

### 3.1 拦截与判空边界条件
为了确保递归永远会结束并停止无限套娃挂死，计算属性（computed）扮演了防波堤：
```javascript
const hasChildren = computed(() => Array.isArray(props.node.children) && props.node.children.length > 0)
const hasCourses = computed(() => Array.isArray(props.node.kcList) && props.node.kcList.length > 0)
```
只有确信数组有效，才开放更深一层的 `<AcademicTreeNode />` 或渲染子课表。

## 4. 业务文字提炼组合 (`requirementText`)的技巧

对于学分、选课最低门槛这些关键约束的解析：如果只有 `yqzdxf` 就只显示一行；如果有四条线限制，必须拼出来。
它使用干净的数组 `Array.push()` 并使用 `' / '.join()`。比臃肿地在视图里写几十个 `v-if` 条件清晰一万倍：

```javascript
const requirementText = computed(() => {
  const parts = []
  if (props.node.yqzdxf) parts.push(`最低学分 ${props.node.yqzdxf}`)
  if (props.node.yqzgms) parts.push(`最高门数 ${props.node.yqzgms}`)
  return parts.join(' / ') // "最低学分 10 / 最高门数 2"
})
```

## 5. 组件级 CSS 局部作用域

该组件采用了 `<style scoped>` 以确保层层嵌套也不会样式污染。
其主要逻辑在于通过 `border-left: 2px solid #e5e7eb; padding-left: 12px;` 形塑一条侧边的“层级引线”，让多级排版的视觉关联一目了然，极其符合教学计划分支的阅读直觉。