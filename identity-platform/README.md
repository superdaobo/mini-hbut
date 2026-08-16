# Mini-HBUT Identity Platform

Mini-HBUT 的 OIDC / App Approval 身份平台源码，随主仓库进行版本管理；真实数据库连接、OIDC 私钥、服务令牌和 Vercel 本地 metadata 始终保持 Git 忽略。
当前生产部署仍采用 Vercel CLI/manual deployment，不要求仓库与 Vercel 建立 Git 自动部署关联。
详见 [docs/README.md](docs/README.md) 与 [docs/runbook.md](docs/runbook.md)。

```bash
pnpm install
pnpm check          # core/web 各自 typecheck + unit test + build
pnpm deploy:preview # Preview 部署（需先 vercel link）
pnpm deploy:prod    # 生产部署（交互确认，非 TTY 拒绝）
```
