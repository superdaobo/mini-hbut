# 18 · 教室课表数据源调研（goal-22 / T02）

> 实测时间：2026-11-21 11:20
> 账号：教师 20241130（罗可均）

## 结论

**教室课表有 JSON 接口**，与班级课表同族：

```
GET /admin/pkgl/pkglcroomkb/sdpkkbList
  ?xnxq=<学期>&id=<教室 encodeId>&xqdm=<校区>&zxzc=&zdzc=&zc=&zxxq=&zdxq=&zxjc=&zdjc=&xsqbkb=&xslx=&schoolCode=
→ 200，裸数组
```

与班级课表（`/admin/pkgl/kbcx/bjkb/sdpkkbList`）**字段几乎完全相同**，
只多出 `jsmc`（教室名）、`bjdm`（班级代码）、`jxbrs`（教学班人数）、`djs`、`cxrs` 等。

## 实测证据

### 1. 教室列表（拿 encodeId）

```
GET /admin/pkgl/pkglcroomkb/ajaxListCustom?gridtype=jqgrid&page=1&rows=40&xnxq=2026-2027-1
→ total=1741
```

字段：`jsbh, jsmc, jxldm, jxlmc, zdskrnrs, xqdm, xqmc, xnxq, jslx, encodeId`

样例：`{jsbh:"体育-002", jsmc:"篮球馆303", encodeId:"WGEyQ0F97D181C8B3AC0CB", jxlmc:"运动场所"}`

### 2. 教室课表

```
GET /admin/pkgl/pkglcroomkb/sdpkkbList?xnxq=2026-2027-1&id=WGEyQ0F97D181C8B3AC0CB&xqdm=1&…
→ 200，2 条
```

首条（节选）：

```json
{"id":"001","xnxq":"2026-2027-1","tid":"20211088",
 "jxbmc":"体育数据分析与应用【理论】5916","jxbbh":"202615916",
 "kcid":"21301014A",
 "kcmc":"<a href=\"javascript:void(0);\" onclick=\"openKckb('…')\">体育数据分析与应用</a>",
 "zc":"1-7","zcstr":"1,2,3,4,5,6,7",
 "croommc":"","jslxmc":"体育教室",
 "tmc":"<a …>…</a>","xingqi":…,"djc":…,"jsmc":"篮球馆303","jxlmc":"运动场所"}
```

## 空结果的判定

大部分教室返回 `[]`（如「生工楼1-110」），这是**正常的**——该教室本学期没有排课。

批量试 10 间教室后，第 1 间（篮球馆303）即有 2 条数据，说明接口本身可用，
不是参数问题。

## 与班级课表的差异

| 项 | 班级课表 | 教室课表 |
| --- | --- | --- |
| 路径 | `/admin/pkgl/kbcx/bjkb/sdpkkbList` | `/admin/pkgl/pkglcroomkb/sdpkkbList` |
| `id` 含义 | 班级 `encodeId` | 教室 `encodeId` |
| 末位参数 | `kcxz` | `schoolCode` |
| 额外字段 | — | `jsmc` / `bjdm` / `jxbrs` / `djs` / `cxrs` |

**因此解析逻辑可以完全复用**（`class_schedule::parse_class_schedule`），
只需新增一条路径常量与一个 `fetch_room_schedule_with`。

## HTML 字段

`kcmc` / `tmc` / `croommc` 都是 HTML 片段（带 `onclick` 回调）：

- `kcmc` → `<a onclick="openKckb('…')">体育数据分析与应用</a>`
- `tmc` → `<a onclick="openJskb('…')">…</a>`

这些回调是**跳转/写入口**，本实现只剥文本，不实现回调。

## 复现方式

```bash
cd tools/teacher-probe
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; $env:TEACHER_SID='20241130'
node probe-room-kb.mjs    # 抓页面 + 找接口
node probe-room-kb2.mjs   # 单教室实测
node probe-room-kb3.mjs   # 批量找有课教室
```
