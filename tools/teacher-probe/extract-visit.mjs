import fs from "node:fs";
const h = fs.readFileSync("cx-visit.html","utf8");
const paths = [...h.matchAll(/["'`](\/mooc(?:2)?-ans\/[A-Za-z0-9_\/\-]+)/g)].map(m=>m[1]);
const uniq=[...new Set(paths)];
console.log("=== /mooc*-ans/ 路径 ("+uniq.length+") ===");
for(const p of uniq) console.log(" ",p);
// 课程链接
const cl = [...h.matchAll(/courseid[=:]"?(\d+)[^"']*?clazzid[=:]"?(\d+)/gi)].map(m=>m[0].slice(0,80));
console.log("\n=== 课程参数 ===");
for(const c of [...new Set(cl)].slice(0,8)) console.log(" ",c);
const ids=[...new Set([...h.matchAll(/courseid=(\d+)/g)].map(m=>m[1]))];
console.log("\ncourseid 列表:", ids.slice(0,10));
