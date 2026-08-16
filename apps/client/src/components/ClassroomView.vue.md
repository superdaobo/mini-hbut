# 多维自发型自习室占坑雷达 (ClassroomView.vue)

## 1. 模块定位与职责

在期末周找一个带插座的自习室是全校所有大学生的究极难题。
`ClassroomView.vue` 就是专为此诞生的：动态拉取所有的教学楼 `buildings`、计算时区节数、下发过滤查询命令，并利用严苛的竞态防抖与缓存机制（TTL）返回真实无课的空教室阵列。

## 2. 并发污点与极限界生命周期防御

通常，用户在表单里不断滑动挑选（从周一滑到周二，又滑去选 12 节课），这时会连发大量 API。如果接口响应慢，周二的请求如果早于周一被服务器回应，界面上可能会把周一的“脏数据”渲染上去。

该组件在最顶层部署了**绝对单例锁（requestId 唯一防抖）**：
```javascript
let latestRequestId = 0 
const queryClassrooms = async () => {
  const requestId = ++latestRequestId
  const res = await axios(...)
  // 【致命保护】一旦自己手上的令牌不再是全球最新的说明已被废弃
  if (disposed || requestId !== latestRequestId) return 
  // 否则才能执行渲染
  classrooms.value = res.data
}
```
而 `disposed` 这个防白屏布尔值将在 `onBeforeUnmount` 被拉满 `true`。阻止那些在用户切换页面后才龟速到达的数据去篡改别的内存。

## 3. 校历节次预测智能脑 (`getCurrentClassPeriods`)

为了节省学生的点击成本。一打开这个页面时，App 会进行本地时间嗅探推演（Local Time Forward-Prediction）：

```mermaid
graph TD
    A[Date.now()] --> B[计算当前当天累积分钟数 e.g. 10:00 -> 600m]
    B --> C{循环 CLASS_SCHEDULE 数组}
    C -- 命中第一节 (480m-525m) --> D[返回剩余上午节次: 1~4节]
    C -- 命中第五节 (840m-885m) --> E[返回剩余下午节次: 5~8节]
    C -- 已经入夜 --> F[默认推夜晚: 9~11节]
```
直接使用 `const currentMinutes = now.getHours() * 60 + now.getMinutes()` 进行判断。通过毫秒级的开销为学生免去了多达 4-5 次点击表单的选择开销。这也是极具人文关怀的算法设计。

## 4. 联合缓存键生成 (`buildClassroomCacheKey`)

由于每次携带的 `building` 不同、`min_seats` 限制不同，不可能共用同一个 Axios Cache 控制接口。
因此，使用了自构建的微型哈希指纹：
`classroom:student_id:w{周次}:d{星期}:p{1,2,3节}:b{第一教学楼}:s{30}-{50}`。
一旦该指纹在十分钟内重复产生，直接从 `fetchWithCache` 命中内存而无需去教务服务器排队，做到了流量分流优化。