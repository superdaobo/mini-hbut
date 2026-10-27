## TL;DR

在 Rust 侧实现静音仓与研讨室的完整预约能力（查询 + 提交 + 取消），
接口契约已全部实测，是本次唯一**无技术缺口**的部分。

## 需求描述

静音仓与研讨室共用同一套 PC 版接口（`reservepc`），需要支持：
查看可预约时段、查看我的预约、提交预约、取消预约。

## 当前行为

Rust 侧不存在任何图书馆预约相关代码。前端无法获取静音仓/研讨室的任何数据。

## 期望行为

Rust 侧提供完整可用的静音仓/研讨室预约能力，前端只需调用命令即可完成全链路。

## 已知事实：接口契约（**已实测**，非推测）

Base：`https://reserve.chaoxing.com/data/apps/`
Method：**POST**，Content-Type：**`application/x-www-form-urlencoded; charset=UTF-8`**

### 1) 预约项详情

```
POST /data/apps/reserve/info
Body: reserveId=24727&reserveIdEnc=838c48dae07db28c&fidEnc=c7450f13f8a0e9ab
```

响应关键字段（实测）：

```json
{"data":{"reserveData":{
  "id":24727,"deptId":25285,
  "advanceDays":3,"advanceTime":"00:00",
  "durationLimitOpen":1,"durationLimitMin":241,
  "confirmDialog":1,"dialogTitle":"特别提醒",
  "dialogContent":"<p>静音仓要求使用人数为2-6人……</p>",
  "allowReserveSameTime":1,"allowReserveNowTime":0,
  "cancelLimit":-1.0,"cycleType":0
}}}
```

### 2) 可预约时段列表（核心）

```
POST /data/apps/reserve/item/list/time
Body: sw=&reserveId=24727&resvAppId=24727&startTime=&endTime=&reserveIdEnc=<enc>&fidEnc=<fidEnc>
```

响应：`{"data":{"reserveItemList":[{"advanceDays":14,"aprvId":0,"customFormConfig":"[...]",...}]}}`

> `customFormConfig` 是**动态表单定义**（JSON 字符串，含字段类型/校验/默认值/关联绑定），
> 说明提交预约需要按这份配置渲染并回填表单。

### 3) 辅助接口

```
POST /data/apps/reservepc/user/view/flag   Body: reserveId=<id>&fidEnc=<fidEnc>
   → {"data":{"showStyle":"0"},"success":true}
POST /data/apps/reservepc/open/team        Body: reserveId=<id>&fidEnc=<fidEnc>
   → {"data":{"openTeam":false},"success":true}
POST /data/apps/reservepc/team/list        Body: reserveId=<id>&fidEnc=<fidEnc>
POST /data/apps/seat/person/role           Body: fidEnc=<fidEnc>
   → {"data":{"roleListSelf":[{"alias":"<学号>","aliasName":"<学号>","roleId":3}]},"success":true}
GET  /data/apps/reserve/dialog?reserveId=<id>&fidEnc=<fidEnc>&dialogAgreeStatus=false
```

### 4) 提交接口（**契约待补**）

从 JS 静态提取到的调用形态（**未实际调用过**）：

```javascript
$.post('data/apps/reserve/multiple/submit', data)
// data 含：formUserId / aprvId / aprvStatusTypeId / fidEnc / cycleType:0 / ua:'pc' / ...
```

> ⚠️ 提交接口的**完整字段**（尤其 `customFormConfig` 与提交体的映射关系）尚未抓全。
> 需要在 08:00–21:30 时段内走一遍真实预约补齐。

### 资源清单（页面实测）

- **静音仓**：1–5 号，图书馆四楼，08:00–21:30，容纳 2–6 人
  （官方提示：要求 2–6 人使用，1 人使用需到图书馆 2 楼服务台咨询）
- **研讨室**：1–7 号，图书馆 4 楼 D 区，08:00–21:00，容纳 2–8 人（7 号为 6–30 人）

## 影响范围

涉及模块：Rust 侧图书馆预约模块与命令层（依赖 S1 建立的结构）

## 验收标准

- [ ] 可获取静音仓与研讨室的可预约时段
- [ ] 可获取并解析 `customFormConfig` 动态表单定义
- [ ] 可获取"我的预约"列表
- [ ] 可提交预约（依赖补全的提交契约）
- [ ] 可取消预约
- [ ] 提交失败时能区分"时段被占""超出限额""违约停用"等业务失败与网络失败
- [ ] `cargo check` 通过
- [ ] 关键流程有简体中文注释

## 待补齐（阻塞项）

- [ ] **`reserve/multiple/submit` 完整字段契约**：需在开放时段真实走一遍预约（提交动作需授权）

## 关联

- 父 Epic：图书馆预约三系统接入
- 依赖：S1（Rust 基础模块与超星凭证链路）
- 被依赖：S5（前端静音仓/研讨室 UI）
- 契约文档：`data/library-reserve-recon/01-api-contract.md`
