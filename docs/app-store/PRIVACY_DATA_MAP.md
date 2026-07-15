# Privacy data map — Mini-HBUT 1.4.3

| Data field | Source | Leaves device? | Recipient | Stored? | Retention | Linked to student id? | User can disable | Deletion |
|------------|--------|----------------|-----------|---------|-----------|----------------------|------------------|----------|
| Username / student id | User input | To campus systems only when user logs in (non-demo) | Campus auth endpoints | localStorage username; session store | Until logout / clear | Yes | Logout / clear data | Clear local data |
| Campus password | User input | To campus auth only on login (non-demo) | Campus auth | Keyring when available; **App Store build: no localStorage password backup** | Until user clears remember | Yes | Disable remember / logout | Delete credential |
| Session cookies | Campus responses | No (device) | N/A | Native cookie jar / SQLite session | Session lifetime | Yes | Logout | Clear session |
| Grades / schedule / exams caches | Campus APIs or demo fixtures | Optional cloud sync if user enables (non–App Store remote may advertise; App Store clamp disables remote cloud_sync enable) | Optional Mini-HBUT cloud proxy | local cache | Cache TTL / clear | Yes | Clear cache; disable sync | Clear all local |
| Device id (cloud sync) | Generated | Only if cloud sync runs | Cloud sync proxy | localStorage | Until clear | Possibly | Disable sync | Clear keys |
| Usage events | Local tracker | **Blocked on App Store build & demo** | Usage stats API | Local pending queue | Until upload or clear | Possibly | Disable stats | Clear queues |
| OCR captcha images | Login captcha | Yes (OCR endpoint) when non-demo login needs captcha | Configured OCR HTTPS endpoint | Transient | Request only | No | N/A | N/A |
| Location | GPS | **Not requested on App Store candidate** | N/A | N/A | N/A | N/A | N/A | N/A |
| Demo credentials `reviewer` | Local fixture match | **No** | None | Memory/session flag only | Demo session | Fictional id | Exit demo | Logout |

App Store build: remote config still fetched; `cloud_sync.enabled` forced false in clamp; usage upload short-circuited.
