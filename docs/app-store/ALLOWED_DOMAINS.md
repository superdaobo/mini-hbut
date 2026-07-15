# Allowed domains (App Store candidate)

Helper: `src/config/allowed_domains.ts`.

## HTTPS allowlist suffixes (default)

- `hbut.6661111.xyz`
- `github.com` / `githubusercontent.com`
- `gitcode.com`
- `jsdelivr.net` / `unpkg.com`
- `docs.qq.com` / `qq.com`
- `map.qq.com` / `apis.map.qq.com`

## Forbidden

- `http://` for sensitive/help links in compliance UX
- `javascript:`, `data:`, `file:`
- `localhost` / `127.0.0.1` for remote content (loopback bridge is not exposed as user browsing)

## In-app browsing (flag on)

School website embed, quick links collection, remote module WebView hosts are **disabled**. Help/privacy/project links open via system browser (`openExternal`).
