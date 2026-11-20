import fs from "node:fs";
import { probe } from "./probe-lib.mjs";
const url = "https://mooc1.chaoxing.com/mooc-ans/visit/stucoursemiddle?courseid=258434894&clazzid=134848762&vc=1&cpi=446042523&ismooc2=1&v=2";
const r = await probe(url, { headers: { Referer: "https://mooc1.chaoxing.com/visit/interaction" } });
fs.writeFileSync("cx-coursepage.html", r.text, "utf8");
console.log("status=", r.status, "len=", r.text.length);
console.log("final loc=", (r.location||"").slice(0,150));
const paths = [...new Set([...r.text.matchAll(/["'`](\/(?:mooc|mooc2|work|exam|notice|ppt|statistic|phone|knowledge)[A-Za-z0-9_\/\-\.]*)/g)].map(m=>m[1]))];
console.log("\n=== 页面内接口路径 ("+paths.length+") ===");
for (const p of paths.slice(0,60)) console.log(" ", p);
// 教师功能关键词
for (const k of ["作业","考试","统计","签到","学生管理","讨论","成绩","题库"]) {
  const i = r.text.indexOf(k);
  if (i>=0) console.log(`\n[${k}]`, r.text.slice(Math.max(0,i-120), i+160).replace(/\s+/g," ").slice(0,280));
}
