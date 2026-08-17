# 原生轮盘下拉同步器 (IOSSelect.vue)

## 1. 模块架构与挑战痛点

在构建跨平台混合应用 (Hybrid App) 时，Web 端的 `<select>` 在 iOS 上的 Safari/WKWebView 渲染机制完全不同，它在屏幕底部会弹出 iOS 标准的滚轮选择器（Wheel Picker）。然而普通的 Web UI 框架（比如 Element Plus / Vant）的模拟下拉菜单会在这些移动端原生层引发滚动冲突和焦点重叠（虚拟键盘无法收起等问题）。
`IOSSelect.vue` 采取的终极策略是**“借尸还魂”** —— 在 Web 层盖上一个透明的原生 `<select>`，但拦截、劫持它的所有数据变更，借此唤出 iOS 底层轮盘且依旧保持受控组件（Controlled Component）的响应规范。

## 2. 脏数据比较与深度同步引擎

移动端的 DOM 解析会随时打断 JavaScript。必须要有极其健壮的对比功能：
```javascript
const isSameOptionList = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].value !== b[i].value || a[i].label !== b[i].label || a[i].disabled !== b[i].disabled) return false
  }
  return true
}
```
通过遍历进行“脏比对”，确保不会在每一次底层触发 `onchange` 时去引发雪崩式的 Vue 重渲染。

## 3. DOM 变动超声波观测器（MutationObserver）

由于应用有大量的外部动态注入，`select` 里的 `<option>` 可能会被人为动态添加。该组件直接挂载了底层 API `MutationObserver` 监听原生实体的改变。

```mermaid
sequenceDiagram
    participant Option Element
    participant DOM MutationObserver
    participant IOSSelect Ref Cache
    participant Vue Parent
    
    Option Element->>Option Element: 节点文本或 value 被外部改变
    Option Element->>DOM MutationObserver: 抛出 nodes 改变信号
    DOM MutationObserver->>IOSSelect Ref Cache: refreshOptionsFromNative() 解析新列表
    IOSSelect Ref Cache->>IOSSelect Ref Cache: isSameOptionList? (False)
    IOSSelect Ref Cache->>Vue Parent: 驱动同步更新，确保视图显示正确 Label
```

## 4. 类型转换强制器 (`parseOutgoingValue`)

由于 DOM 中的 `<select>` 获取到的其子元素 `.value` 永远都是文本（String 类型），即便我们原先传入的可能是数字 `100`。
所以引入了修饰符判别逻辑：
```javascript
const parseOutgoingValue = (value) => {
  if (props.modelModifiers?.number) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return value
}
```
保证传回给父组件的数据依然维持强类型的纯洁性。