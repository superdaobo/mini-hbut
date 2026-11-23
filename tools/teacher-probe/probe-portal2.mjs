import fs from "node:fs";
import { probe } from "./probe-lib.mjs";
const r = await probe("https://e.hbut.edu.cn/getPageView", { headers: { Accept: "application/json", Referer: "https://e.hbut.edu.cn/" } });
const j = r.json;
fs.writeFileSync("portal-pageview.json", JSON.stringify(j, null, 2), "utf8");
console.log("data 类型:", typeof j.data, "键数:", j.data ? Object.keys(j.data).length : 0);
if (j.data) console.log("data 键:", Object.keys(j.data).join(","));
const rd = j.data?.renderData;
console.log("\nrenderData 类型:", typeof rd, Array.isArray(rd) ? `数组(${rd.length})` : (rd ? `对象 键=${Object.keys(rd).slice(0,10).join(",")}` : "null"));
if (rd && !Array.isArray(rd)) {
  for (const k of Object.keys(rd).slice(0, 6)) {
    const v = rd[k];
    console.log(`  ${k}: ${Array.isArray(v) ? "数组(" + v.length + ")" : typeof v}`);
  }
}
