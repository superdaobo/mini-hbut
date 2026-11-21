import { probe, mask } from "./probe-lib.mjs";
const r = await probe("https://e.hbut.edu.cn/getPageView?pageCode=&originalUrl=&lang=zh", { headers: { Accept: "application/json", Referer: "https://e.hbut.edu.cn/" } });
const j = r.json;
console.log("status=", r.status, "errcode=", j?.errcode);
const dataKeys = j?.data ? Object.keys(j.data).length : 0;
console.log("data 键数:", dataKeys);
const raw = j?.data?.pageContext?.pageInfoEntity?.cardLayout;
console.log("cardLayout 类型:", typeof raw);
if (typeof raw === "string") {
  const parsed = JSON.parse(raw);
  const cards = [];
  for (const row of parsed) for (const col of (row.columns || [])) for (const c of ((col.cards||{}).cards || [])) if (c.enabled !== false) cards.push(c);
  console.log("解析出卡片数:", cards.length);
  cards.slice(0, 8).forEach(c => console.log(`  ${c.cardId}  ${c.cardName}  wid=${String(c.cardWid).slice(0,10)}`));
}
