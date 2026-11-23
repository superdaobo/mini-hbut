import fs from "node:fs";
import { probe } from "./probe-lib.mjs";
const r0 = await probe("https://mooc1.chaoxing.com/mooc-ans/visit/stucoursemiddle?courseid=258434894&clazzid=134848762&vc=1&cpi=446042523&ismooc2=1&v=2", { headers: { Referer: "https://mooc1.chaoxing.com/visit/interaction" } });
const loc = r0.location;
const r = await probe(loc, { headers: { Referer: "https://mooc1.chaoxing.com/visit/interaction" } });
fs.writeFileSync("cx-coursepage2.html", r.text, "utf8");
console.log("status=", r.status, "len=", r.text.length);
const paths = [...new Set([...r.text.matchAll(/["'`](\/(?:mooc|mooc2|work|exam|notice|ppt|statistic|knowledge|select|api)[A-Za-z0-9_\/\-\.]*)/g)].map(m=>m[1]))];
console.log("\n=== 接口路径 ("+paths.length+") ===");
for (const p of paths.slice(0,70)) console.log(" ", p);
for (const k of ["作业","考试","统计","签到","学生","讨论","成绩"]) {
  const i = r.text.indexOf(k);
  if (i>=0) console.log(`\n[${k}]`, r.text.slice(Math.max(0,i-100), i+200).replace(/\s+/g," ").slice(0,300));
}
