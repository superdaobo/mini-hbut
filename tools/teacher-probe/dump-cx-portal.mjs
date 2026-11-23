import fs from "node:fs";
import { probe } from "./probe-lib.mjs";
const r = await probe("https://hbutsie1.fanya.chaoxing.com/portal", { headers: { Referer: "https://hbutsie1.fanya.chaoxing.com/" } });
fs.writeFileSync("cx-portal.html", r.text, "utf8");
console.log("portal len=", r.text.length);
// 提取所有链接
const links = [...r.text.matchAll(/(?:href|src|url)\s*[=:]\s*["']([^"']{5,200})["']/g)].map(m=>m[1]);
const uniq = [...new Set(links)];
console.log("\n=== 含 course/clazz/work/exam/sign/stat 的链接 ===");
for (const l of uniq) if (/course|clazz|work|exam|sign|stat|teacher|student/i.test(l)) console.log(" ", l.slice(0,160));
console.log("\n=== 所有 /mooc|/mycourse|/visit 路径 ===");
for (const l of uniq) if (/^\/(mooc|mycourse|visit|space|portal)/.test(l)) console.log(" ", l.slice(0,160));
