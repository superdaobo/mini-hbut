import { probe } from "./probe-lib.mjs";
// 模拟后端的恢复逻辑：先走 /login，再取 getPageView
const login = await probe("https://e.hbut.edu.cn/login", { headers: { Referer: "https://e.hbut.edu.cn/" } });
console.log("GET /login status=", login.status, "loc=", (login.location || "").slice(0, 60));
await new Promise(x => setTimeout(x, 400));
const r = await probe("https://e.hbut.edu.cn/getPageView?pageCode=&originalUrl=&lang=zh", { headers: { Accept: "application/json", Referer: "https://e.hbut.edu.cn/" } });
const j = r.json;
const raw = j?.data?.pageContext?.pageInfoEntity?.cardLayout;
console.log("恢复后 errcode=", j?.errcode, "data 键数=", j?.data ? Object.keys(j.data).length : 0, "cardLayout=", typeof raw);
if (typeof raw === "string") {
  const parsed = JSON.parse(raw);
  const cards = [];
  for (const row of parsed) for (const col of (row.columns || [])) for (const c of ((col.cards||{}).cards || [])) if (c.enabled !== false) cards.push(c);
  console.log("解析出卡片数:", cards.length);
  cards.slice(0, 8).forEach(c => console.log(`  ${c.cardId}  ${c.cardName}`));
}
