# 19 · 班级/教室课表 JSON 接口与踩坑（goal-22 / T08）

> 实测时间：2026-11-21
> 账号：教师 20241130（罗可均）

## 核心结论

**班级课表和教室课表都有 JSON 接口**，且与**学生课表是同一套字段**（只是路径前缀不同）。
因此可以完全在应用内用网格渲染，**不需要 WebView，也不需要外部浏览器**。

| 用途 | 接口 |
| --- | --- |
| 学生课表 | `GET /admin/xsd/pkgl/xskb/sdpkkbList?xhid=&…` |
| **班级课表** | `GET /admin/pkgl/kbcx/bjkb/sdpkkbList?xnxq=&id=<班级 encodeId>&xqdm=&…&kcxz=` |
| **教室课表** | `GET /admin/pkgl/pkglcroomkb/sdpkkbList?xnxq=&id=<教室 encodeId>&xqdm=&…&schoolCode=` |

三者都返回**裸数组**，字段：`kcmc` / `tmc` / `croommc` / `xingqi`(1-7) / `djc`(起始节次) /
`zcstr`(周次 "1,2,3") / `jxbbh` / `xf` / `zongxs` / `kcxz` / `jslxmc` / `jxlmc` / `kkxq`。

## 怎么找到的（可复现）

goal-21 时误判「班级课表只能给 HTML 页面 URL」，因为直接抓 `ckbjkb` 页面只看到
67KB 的服务端渲染 HTML。正确做法是**读页面源码里的 AJAX**：

```bash
# 1) 抓页面
GET /admin/pkgl/kbcx/bjkb/ckbjkb?id=<encodeId>&xnxq=&bjbh=&xqdm=
# 2) 在返回的 HTML 里找 `url: '...'`
#    → /admin/pkgl/kbcx/bjkb/sdpkkbList
```

教室课表同理，但多一层跳转：

```bash
# 1) 教室列表页只有列表接口 ajaxListCustom
GET /admin/pkgl/pkglcroomkb
# 2) 页面里的 ckcroomkb 函数跳到
GET /admin/pkgl/pkglcroomkb/ckcroomkb?id=&xnxq=&xqdm=
# 3) 这个页面内部才有
GET /admin/pkgl/pkglcroomkb/sdpkkbList
```

**教训**：看到「服务端渲染 HTML」不要直接判定「没有 JSON 接口」，
先去页面源码里搜 `url:` / `$.ajax`。

## 踩坑清单

### 1. 连堂是分开的多条记录

上游把**每一节**单独返回：

- 「概率论与数理统计」周一 → `djc=3` 和 `djc=4` 两条
- 「建筑构造-1」周一 → `djc=5,6,7,8` 四条，**而且每节还有两个教室**（`5B-707` / `5B-704`）

直接渲染会得到一堆单节小卡片。必须在后端按
`课程名 + 星期 + 周次 + 教学班号` 合并，取 `min(djc)` 为起点、`max-min+1` 为跨度。

实测：**46 条 → 16 条**。

### 2. 同节多教室不能盲目合并

「建筑构造-1」的 `5B-707` 和 `5B-704` 是**两个教学班**（`jxbbh` 不同，分班上课），
不该合并成一条。按 `jxbbh` 分组就能正确区分。

### 3. `tmc` / `croommc` / `kcmc` 都是 HTML 片段

```html
<a href="javascript:void(0);" onclick="openJskb('...')">蔡睿</a>
```

- 班级课表的 `kcmc` 是**纯文本**
- 教室课表的 `kcmc` 是**HTML**（`<a onclick="openKckb">课程名</a>`）

所以三个字段都要剥离 HTML。剥离时注意用 **`find('>')`（第一个开标签结束）**，
不能用 `rfind('>')` —— 后者会取到 `</a>` 的闭合尖括号，结果为空串。

### 4. 班级搜索参数：裸参数有效，`query.*` 无效

```text
bjmc=25建筑学2       → total=1    ✅ 有效
query.bjmc||=25建筑学2 → total=3315 ❌ 无效（返回全量）
```

### 5. 教室列表**完全不支持服务端搜索**

```text
jsmc=篮球馆303      → total=0     ❌ 被当精确匹配且不命中
query.jsmc||=篮球馆303 → total=1741 ❌ 无效
无参                → total=1741，首个就是篮球馆303
```

所以教室搜索**只能前端本地过滤**（匹配 `jsmc` / `jsbh`）。

### 6. 教室列表要透传 `encodeId`

`normalize_room` 最初只映射了 7 个展示字段，漏了 `encodeId`，
导致教室课表命令直接报「缺少教室参数 encodeId」。

### 7. 空数组是正常结果

大部分教室（如「生工楼1-110」）和老班级（12/13 级）返回 `[]`，
这是**该教室/班级本学期没排课**，不是接口错误。批量试 10 间教室后第 1 间就有数据。

## 数据结构（前端消费）

`ScheduleGrid` 的 `getCoursesForDay` 返回的课程对象契约（来自
`features/schedule/utils/course.ts` 的 `normalizeCustomCourse`）：

```ts
{
  id, name, teacher, room, room_code, building,
  weekday(1-7), period(1-11), djs(跨度), weeks[], weeks_text,
  credit, class_name, semester, source_id
}
```

班级/教室课表的映射：

```
courseName → name        teacherName → teacher
roomName → room          buildingName → building
startSection → period    spanSections → djs
weekText → weeks_text    credits → credit
```

映射实现在 `features/teacher/composables/useTeacherScheduleGrid.ts`。

## 复现命令

```bash
cd tools/teacher-probe
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; $env:TEACHER_SID='20241130'
node probe-bjkb-json3.mjs   # 班级课表（46 条）
node probe-room-kb3.mjs     # 教室课表（批量找有课教室）
```
