import fs from "node:fs";
import { probe } from "./probe-lib.mjs";
const pages = [
  ["班级课表", "/admin/pkgl/kbcx/bjkb?qx=1"],
  ["教室课表", "/admin/pkgl/pkglcroomkb"],
];
for (const [name, p] of pages) {
  const r = await probe("https://jwxt.hbut.edu.cn" + p, { headers: { Referer: "https://jwxt.hbut.edu.cn/admin/" } });
  fs.writeFileSync(`page-${name}.html`, r.text, "utf8");
  const urls = [...new Set([...r.text.matchAll(/url\s*:\s*['"]([^'"]{4,140})['"]/g)].map(m => m[1]))];
  console.log(`\n=== ${name} (${r.status}, ${r.text.length}B) ===`);
  urls.slice(0, 10).forEach(u => console.log("   ", u));
  await new Promise(x => setTimeout(x, 300));
}
