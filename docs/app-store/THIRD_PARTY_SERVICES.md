# Third-party services — Mini-HBUT 1.4.3

| Service | Purpose | When used | Notes |
|---------|---------|-----------|-------|
| Campus authentication / academic portals | User-owned account login & data | Non-demo login | Not Mini-HBUT owned |
| Chaoxing learning platform | Class materials / SSO | Non–App Store builds; blocked on App Store candidate | |
| OCR endpoint (HuggingFace Space default) | Captcha recognition | Non-demo portal login | HTTPS; HTTP fallback stripped on App Store clamp |
| Remote config (GitCode raw + proxies) | Announcements, endpoints | All builds (fetched) | Dangerous fields clamped when `VITE_APP_STORE_BUILD=1` |
| Cloud sync proxy | Settings/academic cache sync | User-enabled; forced off in App Store remote clamp | No passwords/cookies by design |
| Usage stats API | Product analytics | Disabled on App Store build & demo | |
| Tencent map APIs | Campus map tiles/POI | Map module | No live location on App Store candidate |
| jsDelivr / unpkg | Optional font/CDN assets | Settings | |
| GitHub | Source / releases | External | |
| Capacitor / Tauri / Transistorsoft background fetch | Runtime & background | Native shells | |

**Authorization status for trademarked campus services:** **BLOCKER — maintainer must confirm any required terms before store marketing claims.**
