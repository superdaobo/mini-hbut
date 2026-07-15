# Test report — App Store compliance 1.4.3

Environment: Windows implementer host; Node/npm vitest; no Xcode.

## Commands

```text
npm run test -- --run src/config/app_store_policy.spec.ts src/config/allowed_domains.spec.ts src/utils/remote_config_app_store.spec.ts
# Flagged build
set VITE_APP_STORE_BUILD=1
set MINI_HBUT_BUILD_PROFILE=release
npm run build
# Default build
remove VITE_APP_STORE_BUILD
npm run build
```

## Results (implementer run)

| Item | Result |
|------|--------|
| Policy + domains + remote clamp unit tests | **9/9 passed** (`app-store-policy-tests.log`) |
| Flagged frontend build ×2 | **passed** (`app-store-build-1.log`, `app-store-build-2.log`) |
| Default frontend build (no flag) | **passed** (`default-build.log`) |
| Workflow grep TestFlight-only flag | Only `ios-testflight.yml` contains `VITE_APP_STORE_BUILD` |
| package version | **1.4.3** |
| Xcode Archive | **Not run** (Windows) — see `xcode-unavailable.txt` |

## Remaining risks

Listed in APP_STORE_AUDIT.md BLOCKERs.
