import { probe } from "./probe-lib.mjs";
const r = await probe("https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1", { headers: { Accept: "application/json, text/plain, */*", Referer: "https://mooc1.chaoxing.com/" } });
const j = r.json;
const ch = j.channelList;
console.log("顶层键:", Object.keys(j).join(","));
console.log("channel[0] 键:", Object.keys(ch[0]).join(","));
console.log("channel[0].content 键:", Object.keys(ch[0].content||{}).join(","));
const c = ch[0].content;
for (const k of Object.keys(c||{})) {
  const v = c[k];
  if (Array.isArray(v)) console.log(`  ${k}: array(${v.length})` + (v[0]?` item keys=${Object.keys(v[0]).join(",")}`:""));
  else if (v && typeof v === "object") console.log(`  ${k}: obj keys=${Object.keys(v).join(",")}`);
  else console.log(`  ${k}: ${String(v).slice(0,40)}`);
}
