# macOS / Xcode final check (manual)

This Windows implementer host **cannot** run Xcode Archive. Complete on a Mac:

1. Checkout branch with compliance changes.
2. Ensure secrets for signing available.
3. Run or trigger `.github/workflows/ios-testflight.yml` (sets `VITE_APP_STORE_BUILD=1`).
4. Local optional:
   ```bash
   export VITE_APP_STORE_BUILD=1
   export MINI_HBUT_BUILD_PROFILE=release
   npm run build
   # then existing Capacitor/Tauri iOS packaging steps used by the project
   ```
5. Xcode: **Archive** → **Validate App** → **Distribute** (TestFlight).
6. Confirm **Info.plist**: no location usage string for this candidate.
7. Confirm **Entitlements**, Widget extension, background task identifiers.
8. Confirm App Icon / Launch Screen.
9. Install TestFlight build: login `reviewer` / `Test2026` offline/airplane mode.
10. Smoke: grades, schedule, exams, map POI without location prompt.
11. Privacy Report in Xcode if available.

**Status on implementer host:** Xcode unavailable — do not claim Archive success.
