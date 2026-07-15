# Release checklist — App Store 1.4.3 candidate

- [ ] Version strings still `1.4.3` (package.json, tauri.conf.json)
- [ ] `ios-testflight.yml` has `VITE_APP_STORE_BUILD: "1"`
- [ ] `dev-build.yml` / `release.yml` do **not** set compliance flag
- [ ] Default `npm run build` compliance flag off
- [ ] Policy unit tests green
- [ ] Flagged production frontend build green
- [ ] Unflagged production frontend build green
- [ ] Demo `reviewer` / `Test2026` documented
- [ ] Privacy policy URL returns 200 or temporary security doc accepted
- [ ] App Store Connect privacy nutrition labels filled from PRIVACY_DATA_MAP
- [ ] App Review notes pasted
- [ ] Screenshots match allowed feature set only
- [ ] Xcode Archive + Validate on macOS (see MACOS_XCODE_FINAL_CHECK.md)
- [ ] No marketing claim of official university app
