import { probe } from "./probe-lib.mjs";
const r = await probe("https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1", { headers: { Accept: "application/json, text/plain, */*", Referer: "https://mooc1.chaoxing.com/" } });
const raw = r.text;
// 找所有 courseid 出现
const ids = [...raw.matchAll(/"courseid"\s*:\s*"?(\d+)/g)].map(m=>m[1]);
console.log("courseid 命中:", [...new Set(ids)].slice(0,10));
const ch = r.json.channelList[2];
console.log("\n=== channel[2] 完整 ===");
console.log(JSON.stringify(ch, null, 2).slice(0, 2500));
