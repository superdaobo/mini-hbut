# 时间格式化工具集 (time.js)

## 1. 模块定位与职责

提供纯前端界面的微级时间控制。相比引入沉重的 Moment.js 或 Day.js 来处理单纯的时间渲染要求，`time.js` 使用原生的 Date API 提供人类可读文本转化，主要用来显示“刚刚”、“几小时前”此类的相对时间偏移，降低打包产率体积。

## 2. 核心功能解析 (`formatRelativeTime`)

这是一种极简级的人类直觉时间降级显示方案（Relative Time Degradation）。

```javascript
  const diff = Date.now() - date.getTime();
  if (diff < 0) return date.toLocaleString();
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}小时前`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))}天前`;
  return date.toLocaleString();
```

### 阈值阶梯分析

1. **防御性兜底**：`if (!input)` 与 `Number.isNaN()`：拦截空值、undefined、脏字符串，防止 JS Crash；如果时间 `diff < 0` (属于未来时间戳问题，常发生于客户端时钟不准或服务器时钟漂移)，不予处理，直接转普通文本。
2. **零延时（一分钟内）**：归为 `“刚刚”`，掩盖秒级的强波动，提高用户刷新心目中的容忍感。
3. **短偏移（小时/日）**：取除以倍率余数，下转显示“XX小时/天前”。
4. **终极降级（七天以后）**：放弃短周期表述，直接暴露系统的完整日期如 `2024/02/10 12:30:10`，因为对于太古远的事情“35天前”对于认知是具有延迟换算成本的。

## 3. 应用场景
多用于云同步记录 (Sync Log)、热更新检查弹窗中显示“上次检查于”，或者调试日志系统的前端展现板。极简且精准。