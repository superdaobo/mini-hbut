# Cloud Sync Worker 部署说明

## 1. 准备

1. 安装 Wrangler：
```bash
npm i -g wrangler
```
2. 登录 Cloudflare：
```bash
wrangler login
```

## 2. 创建 KV

1. 创建生产 KV：
```bash
wrangler kv namespace create SYNC_KV
```
2. 创建预览 KV：
```bash
wrangler kv namespace create SYNC_KV --preview
```
3. 将返回的 `id` 与 `preview_id` 填入 `wrangler.toml.example`，另存为 `wrangler.toml`。

## 3. 配置密钥

设置鉴权令牌（推荐）：
```bash
wrangler secret put SYNC_API_TOKEN
```

如果不设置 `SYNC_API_TOKEN`，服务会允许匿名访问。

## 4. 部署

```bash
wrangler deploy
```

部署后你会得到 `https://<worker-name>.<subdomain>.workers.dev`。

## 5. 健康检查

```bash
curl "https://<worker-domain>/sync/ping"
```

若启用了 `SYNC_API_TOKEN`：
```bash
curl -H "Authorization: Bearer <token>" "https://<worker-domain>/sync/ping"
```

## 6. 速率限制说明

- `RATE_LIMIT_SECONDS` 建议不小于 `60`。
- Cloudflare KV 的 `expiration_ttl` 最小值是 `60`，否则会返回 `400`。
- 可按动作单独设置：
  - `RATE_LIMIT_UPLOAD_SECONDS`
  - `RATE_LIMIT_DOWNLOAD_SECONDS`
  - `RATE_LIMIT_PING_SECONDS`

## 7. remote_config（推荐：走 OCR 中转）

```json
{
  "cloud_sync": {
    "enabled": true,
    "mode": "proxy",
    "proxy_endpoint": "https://<ocr-service-domain>/api/cloud-sync",
    "secret_ref": "kv1-main",
    "timeout_ms": 12000,
    "cooldown_seconds": 180
  }
}
```

> 不建议在客户端或远程配置中下发 Worker Token。  
> Token 应只保存在中转服务（如 OCR 服务）Secrets 中。

## 8. 前端本地覆盖

应用设置 -> 后端：

1. 填写“云同步中转地址”（可覆盖远程）
2. 填写“云同步秘钥引用（secret_ref）”
3. 设置“课表云同步冷却（秒）”

登录后会自动执行：

1. 新设备首次登录：自动下载并应用设置 + 覆盖自定义课程
2. 每次登录：自动上传设置/自定义课程/成绩与绩点相关缓存
