import fs from "node:fs";
import { probe, isLoginPage } from "./probe-lib.mjs";
const r = await probe("https://jwxt.hbut.edu.cn/admin/jsd/xskq");
console.log("status=", r.status, "len=", r.text.length, "login=", isLoginPage(r));
fs.writeFileSync("xskq.html", r.text, "utf8");
// 找表格结构
const tables = [...r.text.matchAll(/<table[^>]*>/g)].map(m=>m[0]);
console.log("table 标签数:", tables.length);
tables.slice(0,5).forEach((t,i)=>console.log(`  [${i}]`, t.slice(0,150)));
// 找疑似数据行
const trs = (r.text.match(/<tr[\s>]/g) || []).length;
console.log("tr 数:", trs);
// 找关键中文
for (const k of ["出勤","考勤","缺勤","旷课","班级","课程"]) {
  const i = r.text.indexOf(k);
  if (i >= 0) console.log(`\n[${k}]`, r.text.slice(Math.max(0,i-120), i+160).replace(/\s+/g," ").slice(0,260));
}
