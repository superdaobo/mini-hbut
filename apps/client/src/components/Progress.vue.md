# 流水线执行进度指示仪 (Progress.vue)

## 1. 组件地位与作用

当涉及复杂业务请求（如一键查四六级、或者执行跨网段教务系统登录）时，长达数秒乃至十几秒的等待极易引起用户的焦虑与强退行为。
`Progress.vue` 是一款专门用于呈现多阶段状态树（Multi-Stage State Tree）的可视化占位组件，通过线性动画反馈有效安抚用户情绪。

## 2. 基于属性监听的状态触发

组件状态并没有直接暴露一个函数给外部调用前进，而是严格通过 `steps` 数组进行单向数据流监听器 `watch` 的判断：

```javascript
watch(() => props.steps, (newSteps) => {
  if (newSteps.every(s => s.status === 'done')) {
    allComplete.value = true
    setTimeout(() => emit('complete'), 2000)
  }
}, { deep: true })
```
这种设计让外部调用者只需要修改自己传入的数组状态（如修改 `status` 改为 `done/active`），即可驱动气泡时间线自动更新。一旦所有数组都判定为完毕，触发全局的 `complete` 后仰闭环。

## 3. CSS 微动画设计

进度器内的焦点切换使用了极致轻量级的 `@keyframes` 而不依赖外部 Lottie 或 SVG 动效库以降低开销：

```css
.timeline-item.active .timeline-marker {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
  50% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
}
```
通过呼吸灯阴影 (`pulse` 扩大的防重影扩散外圈) 构建当前活动阶段的警示感。