# 智慧寝室电网查询板 (ElectricityView.vue)

## 1. 模块定位与目标

传统的一码通电费系统需要经历：“点选校区” -> “点选楼栋” -> “点选楼层” -> “寻找房号” -> 点击查询才能出来。这种五级跳跃简直反人类。
`ElectricityView.vue` 做了一个突破：将这四层网格架构压入了一套联动级联菜单。当用户选择后，**自动保存历史抉择，并在下次打开时实现“秒出账单”**。

## 2. 数据层级结构与响应式级联

由四层 `computed` 构建的安全选择链：
```javascript
const currentArea = computed(() => findByValue(dormData.value, selectedPath.value[0]))
// 只要没有第一级，就一定拿不到第二级，防止越级崩溃
const currentBuilding = computed(() => {
  if (!currentArea.value || !selectedPath.value[1]) return null
  return findByValue(currentArea.value.children, selectedPath.value[1])
})
// ... level, room 依此类推
```

而在每一次的 `handleSelect(level, value)` 中，做了一个截断抹除器：
当你在四级选完后，突然又去改第一组的“校区”，它会通过 `.slice(0, level)` 把后面选好的配置全砍了，保持数据整洁一致性。

## 3. 拦截 502/504 的自愈轮询器 (`maxRetry` && `retryDelayMs`)

这里应用了在爬虫中才能见到的冷启动防御策略。由于 Python 后端可能是基于 Serverless（比如抱抱脸 HuggingFace 或者轻量按需实例），长时间没人用就会睡死。第一脚踢过去可能回的是 502 Bad Gateway/504 Timeout。

代码里这么写：
```javascript
if ((e.response && (e.response.status === 502 || e.response.status === 504))) {
  if (retryCount < maxRetry.value) {
    errorMsg.value = `系统预热中，正在重试 (${retryCount + 1}/${maxRetry})...`
    setTimeout(() => { fetchBalance(retryCount + 1) }, retryDelayMs.value)
    return
  }
}
```
结合全局下发配置中的参数，进行带延时的自动递归复查。对于用户来说，只是一个长达几秒的“加载中”，并没有直接抛出红错，极大地保护了留存感。

## 4. `getStaleCache` 长生缓存读取

即便三次重试全部失败或者无网，如果该宿舍以前查出来过数据，它将不调用规范的 API Cache 命中流，而是自己手掏底层 LocalStorage 去挖掘。
`const cached = getStaleCache(cacheKey)` 能够扒出昨晚甚至三十天前的老数据进行陈旧展现（Stale while Revalidate 原理的最底部应用），防止白板。