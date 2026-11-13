# 第三方接入示例（Epic #1243 · G5-03 / mini-hbut#1267）

> 面向：已审核、已登记在 `manifest/apps.json` 的第三方应用开发者。
> 契约：[`contracts/epic-1243-contracts.md`](./contracts/epic-1243-contracts.md) §6 / §7.3。
> 本文件里的域名、app_id、学号**全部是示例**（合成学号统一 `T9` 前缀）。

## 0. 你能拿到什么 / 拿不到什么

| 能拿到 | 拿不到 |
|---|---|
| 该学生**已授权**的数据类别（课表/成绩/考试/资料/排名） | 学校 Cookie、密码、宿主主令牌/刷新令牌 |
| 每条数据的「最后同步时间」 | 整个云备份、其它学生的数据、其它应用的数据 |
| 该学生的**真实学号**（默认身份，需在隐私说明中披露） | 设备私钥、内部调试字段 |

**目录 ≠ 授权**：`GET /api/app-catalog/v1/apps` 里 `status=active` 只表示「审核通过」，
不代表能读某个学生的数据 —— 数据放行由资源服务器逐次判定。

## 1. 先看应用目录（公开、无需令牌）

```bash
curl -s https://<ocr-host>/api/app-catalog/v1/apps
```

```json
{
  "manifest_version": 1,
  "apps": [
    {
      "client_id": "your-app-id",
      "label": "示例应用",
      "owner": "your-team",
      "status": "active",
      "data_domains": {"grades": ["read"], "schedule": ["read"]},
      "allowed_origins": ["https://your-app.example.com"],
      "privacy_url": "https://your-app.example.com/privacy",
      "review_version": 1
    }
  ]
}
```

`allowed_origins` 为空 = **不允许内嵌**（不是「不限制」）。

## 2. 拿一次性启动票据（宿主内嵌场景）

宿主（Mini-HBUT 客户端）在打开你的应用前调用：

```bash
curl -s -X POST https://<ocr-host>/api/app-launch/v1/code \
  -H "Authorization: Bearer <宿主身份令牌>" \
  -H 'content-type: application/json' \
  -d '{"app_id":"your-app-id","instance_nonce":"<每次打开随机值>"}'
```

```json
{"code":"<一次性 code>","expires_at":1760000060,"ttl_seconds":60,"exchange_url":"/api/app-launch/v1/exchange"}
```

**code 只有 60 秒、只能用一次**，且绑定 `app_id`。

## 3. 用 code 换身份断言（你的后端调用）

```bash
curl -s -X POST https://<ocr-host>/api/app-launch/v1/exchange \
  -H 'content-type: application/json' \
  -d '{"code":"<一次性 code>","app_id":"your-app-id"}'
```

```json
{"sid":"T9000001","app_id":"your-app-id","aud":"your-app-id","expires_in":600,"device_id":""}
```

失败码：`code_used`（不存在或已用，**不区分**）、`code_expired`、`app_mismatch`、`aud_mismatch`。
拿到 `sid` 后**由你自己的后端**建会话 —— 不要把它当长期令牌转发给浏览器。

## 4. 读分类数据

```bash
curl -s "https://<ocr-host>/api/app-data/v1/grades?semester=2026-2027-1" \
  -H "Authorization: Bearer <你的应用令牌>"
```

```json
{
  "data": {"items": [{"course_name": "高等数学", "credit": 4, "score": 92, "term": "2026-2027-1"}]},
  "meta": {"domain": "grades", "data_version": 29, "last_synced_at": "2026-11-13T08:53:20Z"}
}
```

**只显示 `meta.last_synced_at`**（最后成功云同步时间）。**没有**「数据已过期」这种状态：
30 天没同步也照样返回 200，只是时间戳是旧的（Epic 已废止按数据年龄的告警与强制刷新）。

无数据时：

```json
{"data": null, "meta": {"domain": "grades", "data_version": 0, "last_synced_at": "", "reason": "snapshot_missing"}}
```

## 5. 错误码对照

| HTTP | code | 含义 | 你该怎么做 |
|---|---|---|---|
| 401 | `identity_required` | 缺/坏令牌 | 重新获取应用令牌 |
| 403 | `app_not_approved` | 应用未登记/已停用 | 检查 manifest 状态 |
| 403 | `consent_required` | 学生未授权该类别 | 引导学生在 Mini-HBUT 里授权 |
| 403 | `consent_revoked` | 学生已撤销 | 停止读取，必要时重新申请 |
| 403 | `consent_policy_stale` | 策略版本变更 | 引导重新授权 |
| 200 | `snapshot_missing`（在 `meta.reason`） | 授权有效但云端无数据 | 显示「暂无同步数据」 |
| 429 | `rate_limited` | 超限 | 按 `Retry-After` 退避 |
| 503 | `service_unavailable` | 依赖不可用 | 稍后重试；**不要**改成本地伪造数据 |

## 6. 你必须遵守

1. **不得**自行请求学校教务（会暴露学生 Cookie，且绕过审核）。
2. **不得**把 `sid` 当长期凭据；它是身份断言，不是会话令牌。
3. **不得**缓存超过你自己的隐私政策允许的时长；学生撤销后必须停止使用。
4. 必须提供可访问的隐私说明（`privacy_url`），并在其中披露「会获得真实学号」。
