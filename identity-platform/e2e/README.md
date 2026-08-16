# Identity Platform E2E（#628 L3 / L5）

Playwright 浏览器 E2E：auth.* 接力页、Developer 门户、Admin 关键流、QR 跨设备双上下文。

## 目录

```text
e2e/
├─ playwright.config.ts        # mock 模式（默认）webServer 起 next dev
├─ tests/
│  ├─ fixtures.ts              # 进程内 mock 后端（AuthRequest/Developer/Admin 状态机）
│  ├─ auth-site.spec.ts        # L3：接力页状态机 + handoff 安全边界
│  ├─ developer.spec.ts        # L3：开发者门户关键流
│  ├─ admin.spec.ts            # L3：管理员审核/暂停关键流
│  └─ qr-cross-device.spec.ts  # L5：PC context + Phone context 双上下文
└─ demo-client/                # openid-client 协议消费者（Preview/Production smoke 用）
```

## 运行

前置：`identity-platform/` 已 `pnpm install`（web 的 next 依赖）。

```bash
cd identity-platform/e2e
npm install        # @playwright/test + openid-client（锁文件 package-lock.json）
npx playwright install chromium   # 首次下载浏览器

# mock 模式（默认，无需任何凭据/部署）
npm test

# 单文件 / 可视化
npx playwright test tests/auth-site.spec.ts
npm run test:headed
```

mock 模式说明：

- `webServer` 自动启动 `next dev -p 3100`（`IDENTITY_ENVIRONMENT=development`，localhost 放行）；
- 测试用 `page.route` 拦截 BFF API，内存后端模拟 Core 状态机；
- 双 context 测试共享同一内存后端，验证「手机批准 → PC 轮询收敛」。

## 真实服务模式（L6 Preview / L7 Production smoke）

```bash
# 1) 按 runbook 部署 Preview 或 Production（或本地起 core + web）
# 2) 指定真实地址并关闭 mock：
E2E_MOCK=0 E2E_BASE_URL=https://<preview-auth-domain> pnpm exec playwright test tests/auth-site.spec.ts --grep "WAITING_APP"
```

真实服务的协议级校验请用 demo-client（openid-client 消费者），它自动完成
discovery / state / nonce / PKCE / id_token iss·aud·alg·签名 / userinfo / revoke：

```bash
node demo-client/index.mjs \
  --issuer https://<issuer> \
  --client-id <client_id> [--client-secret <secret>] \
  --redirect-uri http://127.0.0.1:4567/cb \
  --scope "openid profile"
# bad state 消费者侧验证：
node demo-client/index.mjs ... --tamper-state 1   # 必须退出码 1（openid-client 拒绝）
```

## 与测试分层的关系（#628）

- L3（Web Browser E2E）：`tests/auth-site.spec.ts` / `developer.spec.ts` / `admin.spec.ts`；
- L5（Cross-device）：`tests/qr-cross-device.spec.ts`；
- L4（Tauri/Desktop）：主仓库 `apps/client/scripts/identity_deep_link_smoke.mjs`（Windows 深链 smoke）；
- L5（mobile scheme contract）：主仓库 `apps/client/scripts/check_mobile_scheme_contract.mjs`；
- L6/L7：runbook 的 Preview/Production 12 步 + 本目录 demo-client；
- 单元/集成层（L1/L2）：`core/tests/*`（205+ 用例）与 `web/tests/*`（283+ 用例）。
