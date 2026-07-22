# 运动场馆预约协议（逆向）

> 抓取日期：2026-07-22  
> 入口：`http://172.16.54.20:9000`（**校园网**）  
> 一码通 appCode：`noQYzEiZ7L`

## 登录

1. `GET https://code.hbut.edu.cn/server/third/open?redirectUrl=<urlencoded home>&accessToken=<一码通 accessToken>`
2. 落地 URL 带 `token=` 查询参数
3. `POST /reserve/index/authentication` body=SM2(token字符串)
4. 返回 `data.token` + `data.userInfo`，后续请求 Header：
   - `token: <场馆 token>`
   - `roleId: <userInfo.roleId>`（可选）

## 加解密（国密 SM2）

前端 `app.*.js` 硬编码：

- 加密公钥（C1C3C2 / cipherMode=1）：`0450EF25B15AFE...D4EACD`
- 解密私钥：`579C7865BE2AE337...508A75`
- 请求：明文 JSON 或字符串 → SM2 encrypt → 前缀 `04` → 作为 JSON 字符串 body
- 响应：`data` 字段密文 → 去 `04` → SM2 decrypt → `JSON.parse`

## 业务 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/reserve/stadium/listAll` | 场馆列表 |
| POST | `/reserve/place/detailByStadiumId` | `{stadiumId, selectDate, half}` 场地时段 |
| POST | `/reserve/place/reserve` | 下单 |
| POST | `/reserve/orderInfo/list` | 订单 |
| POST | `/reserve/orderInfo/callPay` | 拉起支付 |
| POST | `/reserve/orderInfo/pay` | `{orderId, price, password}` |
| POST | `/reserve/orderInfo/cancelPay` | 取消 |
| POST | `/reserve/reserveRecord/list` | 预约记录 |
| POST | `/reserve/place/getFollowUser` | 随行人员 |
| POST | `/reserve/globalConf/getByKey` | 公告文案 |

### reserve payload

```json
{
  "totalPrice": 0,
  "stadiumId": 1,
  "reserveDate": "2026-07-22",
  "detailList": [{
    "startDateTime": "...",
    "endDateTime": "...",
    "price": 1000,
    "half": 0,
    "placeName": "...",
    "placeId": 1,
    "list": ["dateStr1", "dateStr2"]
  }],
  "followUserList": []
}
```

金额单位为 **分**。

## Mini-HBUT 实现

- 后端：`src-tauri/src/modules/sports_venue.rs`
- 前端：`src/components/SportsVenueView.vue`（应用内列表/选时段/下单/支付，不外链）
