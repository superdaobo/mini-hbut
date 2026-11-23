# @mini-hbut/third-party-sdk-1243

Epic #1243 · G5-03（#1267）的**可运行示例 SDK**：第三方后端照抄即可接入，不用猜契约。

契约：[`docs/architecture/contracts/epic-1243-contracts.md`](../../../docs/architecture/contracts/epic-1243-contracts.md) §6 / §7.3
接入说明：[`docs/architecture/third-party-api-example-1243.md`](../../../docs/architecture/third-party-api-example-1243.md)

## 它做什么

```ts
import { exchangeLaunchCode, fetchDomain, formatLastSynced, describeError } from '@mini-hbut/third-party-sdk-1243'

// 1) 宿主给你一次性 code（60 秒、只能用一次、绑定 app_id）
const assertion = await exchangeLaunchCode({ baseUrl: 'https://ocr.example.com' }, {
  code: launchCode,
  appId: 'your-app-id'
})
// assertion.sid 是学生真实学号；它是**身份断言**，不是会话令牌

// 2) 用**你自己的应用令牌**读数据
const grades = await fetchDomain({ baseUrl: 'https://ocr.example.com' }, {
  token: yourAppToken,
  domain: 'grades',
  semester: '2026-2027-1'
})

// 3) 只展示「最后同步时间」
console.log(formatLastSynced(grades.meta.last_synced_at))
```

## 三条纪律（SDK 里写死，别绕过）

1. **不要把 `sid` 当长期令牌**：应用会话由你自己的后端建。
2. **不要自行请求学校教务**：会暴露学生 Cookie，且绕过审核。
3. **不要按数据年龄告警**：30 天前的数据也是有效数据，只展示 `last_synced_at`。

## 错误处理

所有失败都是 `ApiError`，带稳定机器码（与服务端契约一致）：

| code | 含义 | 你该怎么做 |
|---|---|---|
| `identity_required` | 令牌缺失/无效 | 重新获取应用令牌 |
| `app_not_approved` | 应用未登记/停用 | 检查 manifest |
| `consent_required` | 学生未授权该类别 | 引导授权 |
| `consent_revoked` | 学生已撤销 | **停止使用并删除缓存** |
| `consent_policy_stale` | 策略更新 | 引导重新确认 |
| `code_used` | 票据无效或已用（**不区分**） | 重新向宿主索取 |
| `code_expired` | 票据过期（60s） | 重新向宿主索取 |
| `app_mismatch` | 票据与应用不符 | 检查 app_id |
| `rate_limited` | 超限 | 按 `retryAfterSeconds` 退避 |
| `service_unavailable` | 依赖不可用 | 稍后重试；**不要**伪造本地数据 |

`describeError()` 给出面向用户的中文文案（示例用，可自己写）。

## 测试

```bash
cd apps/client
npx vitest run packages/third-party-sdk-1243    # → 15 passed
```

测试本身就是「接入自测」：code 兑换的三种失败、无快照不算异常、429 带 Retry-After、
撤销后必须删缓存、时间格式化不含任何过期判断。

## 不做什么

- **不是**官方发布包（`private`，仅供示例与自测）；
- 不含重试/缓存策略（那是你的产品决策）；
- 不含 UI。
