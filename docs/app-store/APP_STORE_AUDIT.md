# App Store audit — Mini-HBUT 1.4.3

| Risk | Level | Location | Mitigation | Residual | Blocker? |
|------|-------|----------|------------|----------|----------|
| No compliance flag | High | vite / workflows | `VITE_APP_STORE_BUILD` + `ios-testflight.yml` only | None if CI env sticks | No |
| High-risk modules exposed | High | Dashboard / Me / App | `app_store_policy` + gates | Unflagged builds still full | No |
| Remote modules / hot update / customJs | High | more_modules, hot_update, ui_settings | Policy + clamp + no-op | Code remains for other platforms | No |
| Remote config re-enable | High | remote_config.js | `applyAppStoreRemoteConfigClamp` after fetch | Must not remove fetch | No |
| Location permission | High | Info.plist, TowerGo, guide | Removed usage string; modules blocked; location service short-circuit | Android still has location | No |
| Password in localStorage | High | credential_storage.js | App Store path skips web backup | Non–App Store still may backup | No |
| Demo incomplete | Medium | test_account* | Banner, about, offline fixtures | Widget edge cases | No |
| Official branding | Medium | Me / Login / copy | Disclaimers, soft labels | Bundle id still hbut | No |
| Privacy URL | Medium | Store metadata | Documented URL | **Page may not be live** | **Yes if 404** |
| Xcode Archive | Medium | macOS | Checklist only on Windows host | Not executed here | **Yes for upload** |
| Third-party rights | Medium | Campus APIs | Disclosure | Legal confirmation pending | **Yes until confirmed** |

## Highest original risks

Remote executable modules, location for mobility, campus write/check-in/code, and full-feature TestFlight parity with unsigned release.

## Current residual risks

- Privacy policy page deployment
- Human Xcode Validate / TestFlight upload
- Contact email/phone for App Store Connect
- Trademark/authorization wording for campus data sources
