# Feature scope — Mini-HBUT 1.4.3

Version remains **1.4.3**. Compliance applies only when `VITE_APP_STORE_BUILD=1` (iOS TestFlight workflow).

| Module / capability | iOS App Store (flag on) | Android | Desktop | Demo mode (flag on) |
|---------------------|-------------------------|---------|---------|---------------------|
| Home | Allowed | Allowed | Allowed | Local fixtures |
| Schedule | Allowed | Allowed | Allowed | Local fixtures |
| Grades | Allowed | Allowed | Allowed | Local fixtures |
| Exams | Allowed | Allowed | Allowed | Local fixtures |
| Classroom | Allowed | Allowed | Allowed | Local fixtures |
| Academic progress | Allowed | Allowed | Allowed | Local fixtures |
| Training plan | Allowed | Allowed | Allowed | Local fixtures |
| Calendar | Allowed | Allowed | Allowed | Local fixtures |
| Library | Allowed | Allowed | Allowed | Local fixtures |
| Campus map (POI) | Allowed (no live location) | Allowed | Allowed | Local fixtures |
| Notifications | Allowed | Allowed | Allowed | Local fixtures |
| Export center | Allowed | Allowed | Allowed | Local fixtures |
| Settings / About | Allowed | Allowed | Allowed | Same UI |
| Privacy & data | Allowed | Allowed | Allowed | Same UI |
| Sponsor / WeChat tip QR (Me) | **Hidden** for guest + demo; allowed only when real-logged-in | Allowed | Allowed | Hidden (demo path) |
| Today course widget | Allowed | Allowed | N/A | Demo snapshot |
| Course selection | **Blocked** | Allowed | Allowed | N/A (hidden) |
| Ranking | **Blocked** | Allowed | Allowed | N/A |
| School-wide schedule (qxzkb) | **Blocked** | Allowed | Allowed | N/A |
| School inbox | **Blocked** | Allowed | Allowed | N/A |
| Campus code | **Blocked** | Allowed | Allowed | N/A |
| Electricity | **Blocked** | Allowed | Allowed | N/A |
| Transactions | **Blocked** | Allowed | Allowed | N/A |
| Resource share (WebDAV) | **Blocked** | Allowed | Allowed | N/A |
| Chaoxing class | **Blocked** | Allowed | Allowed | N/A |
| Chaoxing check-in | **Blocked** | Allowed | Allowed | N/A |
| TowerGo / live mobility | **Blocked** | Allowed | Allowed | N/A |
| AI chat | **Blocked** | Allowed | Allowed | N/A |
| Forum / UGC | **Blocked** | Allowed | Allowed | N/A |
| Remote modules / games | **Blocked** | Allowed | Allowed | N/A |
| Hot update | **Blocked** | Allowed | Allowed | N/A |
| Custom JS | **Blocked** | Allowed | Allowed | N/A |
| School website embed | **Blocked** | Allowed | Allowed | N/A |
| Quick links browser | **Blocked** | Allowed | Allowed | N/A |
| Campus network auto-login | **Blocked** | Allowed | Allowed | N/A |
| Service stats | **Blocked** | Allowed | Allowed | N/A |
| Config admin tool | **Blocked** | Allowed | Allowed | N/A |
| Remote config fetch | **Still fetched** (safe fields) | Fetched | Fetched | Default clamped config |

**Demo vs normal (flag on):** identical feature tree; demo only swaps data source to local fixtures (`reviewer` / `Test2026`).
