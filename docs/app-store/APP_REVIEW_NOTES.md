# App Review Notes — Mini-HBUT 1.4.3 (TestFlight / App Store)

## Demo account

- Username: `reviewer`
- Password: `Test2026`
- Display student id (fictional): `2026000001`

### Path

1. Launch the app.
2. Open **Me** (if not on login form).
3. Agree to disclaimer/privacy if prompted.
4. Sign in with `reviewer` / `Test2026`.
5. Banner indicates **Demo Mode** (fictional local data).
6. Browse Home modules: grades, schedule tab, exams, classroom, academic, training, calendar, library, campus map, notifications, export, settings, privacy & data.

Demo session does **not** call live campus login or business APIs.

## Non-official statement

Mini-HBUT is an independently developed and community-maintained open-source student utility. It is not developed, operated, sponsored, or endorsed by any university or educational institution.

Chinese:

Mini-HBUT 是独立开发、社区维护的开源学生工具，不由任何学校或教育机构开发、运营、赞助或背书。

## Bundle identifier note

`com.hbut.mini` / product name Mini-HBUT are **historical technical brand identifiers**, not a claim of institutional ownership.

## Location

This App Store candidate build does **not** request location permission. Live mobility / check-in location features are compiled out of the feature surface.

## Background tasks

Background fetch / processing identifiers support optional refresh of schedule/exam style notifications for features still present. Electricity and other blocked modules are not targeted on this build.

## Commerce

Free; no ads; no subscriptions; no IAP in this version.

On this App Store candidate build:

- The **Sponsor / WeChat tip QR** entry on **Me** is **not shown** when the user is signed out or signed in with the demo account (`reviewer`).
- Reviewers following the demo path above will not see in-app tip/sponsorship UI.
- There is no digital goods purchase flow and no App Store IAP in this version.

## Support & privacy

- Support / docs: https://hbut.6661111.xyz/docs
- Privacy policy URL (target): https://hbut.6661111.xyz/privacy  
  **BLOCKER if page not live at submission time** — use temporary security docs: https://hbut.6661111.xyz/docs/security-privacy
- Feedback form: https://docs.qq.com/sheet/DQkdvWHJxQ3RwWlB4?tab=BB08J2
- GitHub: https://github.com/superdaobo/mini-hbut
