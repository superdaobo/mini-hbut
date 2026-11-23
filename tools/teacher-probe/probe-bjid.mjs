import { probe } from "./probe-lib.mjs";
// 1. 班级列表里到底有哪些 id 类字段
const r1 = await probe("https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb/qryBjxx?qx=1&showLastRxnf=&kyzt=&gridtype=jqgrid&page=1&rows=2&xnxq=2026-2027-1", { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb?qx=1" } });
const c = (r1.json?.results || [])[0];
if (c) {
  const idLike = Object.keys(c).filter(k => /^(id|bjid|bjbh|encodeId|bjdm)$/i.test(k));
  console.log("[班级] id 类字段:", idLike.map(k => `${k}=${String(c[k]).slice(0,40)}`).join(" | "));
}
// 2. 名册接口用 bjbh 还是 bjid？
const tests = [
  ["用 bjbh", `bjid=${encodeURIComponent(c?.bjbh || "")}`],
  ["用 id", `bjid=${encodeURIComponent(c?.id || "")}`],
  ["query.bjdm", `query.bjdm||=${encodeURIComponent(c?.bjbh || "")}`],
];
for (const [name, q] of tests) {
  const r = await probe(`https://jwxt.hbut.edu.cn/admin/xjgl/xsjbxx/xsxxcxListCustom?gridtype=jqgrid&page=1&rows=3&${q}`, { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/xjgl/xsjbxx/xsxxcx" } });
  console.log(`[名册 ${name}] total=${r.json?.total}`);
  await new Promise(x => setTimeout(x, 250));
}
// 3. 成绩录入的实际值
const r3 = await probe("https://jwxt.hbut.edu.cn/admin/jsd/jsdcjlr/queryCjlrsz/1?gridtype=jqgrid&page=1&rows=10&xnxq=2026-2027-1", { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/jsd/jsdcjlr/list1" } });
for (const row of (r3.json?.results || []).slice(0, 4)) {
  console.log(`[成绩] ${String(row.jxbbh).slice(0,24)} sdsycj=${row.sdsycj} sdbyscj=${row.sdbyscj} cjtjqrzt=${row.cjtjqrzt}`);
}
