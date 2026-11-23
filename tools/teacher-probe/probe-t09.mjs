import { probe, mask } from "./probe-lib.mjs";
// 1. 学分宽表
const r1 = await probe("https://jwxt.hbut.edu.cn/admin/xjgl/xftj/getxftjlist?gridtype=jqgrid&page=1&rows=10&xnxq=2026-2027-1", { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/xjgl/xftj" } });
const j1 = r1.json;
console.log(`[学分] status=${r1.status} total=${j1?.total} rows=${(j1?.results||[]).length}`);
const row = (j1?.results||[])[0];
if (row) {
  const allKeys = Object.keys(row);
  const numKeys = allKeys.filter(k => /^\d+$/.test(k));
  console.log(`  总键数=${allKeys.length} 数字键=${numKeys.length}`);
  console.log(`  数字键: ${numKeys.join(",")}`);
  console.log(`  非数字键: ${allKeys.filter(k=>!/^\d+$/.test(k)).join(",")}`);
  console.log(`  前 6 个键值: ${numKeys.slice(0,6).map(k=>`${k}=${row[k]}`).join(" ")}`);
}
// 2. 调停补
const r2 = await probe("https://jwxt.hbut.edu.cn/admin/jsd/ttbgl/queryJsPkxx?gridtype=jqgrid&page=1&rows=10&xnxq=2026-2027-1", { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/jsd/ttbgl" } });
const j2 = r2.json;
console.log(`\n[可申请课程] status=${r2.status} total=${j2?.total}`);
const c = (j2?.results||[])[0];
if (c) {
  console.log(`  字段: ${Object.keys(c).filter(k=>!k.startsWith("current")&&k!=="new").join(",")}`);
  console.log(`  样例: ${mask(JSON.stringify(c)).slice(0,380)}`);
}
