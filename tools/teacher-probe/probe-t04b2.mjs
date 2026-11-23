import { probe } from "./probe-lib.mjs";
const tries = [
  ["qryBjxx+xnxq", "/admin/pkgl/kbcx/bjkb/qryBjxx?gridtype=jqgrid&page=1&rows=5&xnxq=2026-2027-1"],
  ["qryBjxx+queryFields", "/admin/pkgl/kbcx/bjkb/qryBjxx?gridtype=jqgrid&page=1&rows=5&queryFields=bjmc,bjbh,bjid,xnxq"],
  ["getjsxx(教室)", "/admin/pkgl/pkrwgl/getjsxx?gridtype=jqgrid&page=1&rows=5"],
  ["pkglcroomkb页面AJAX", "/admin/pkgl/pkglcroomkb/ajaxListCustom?gridtype=jqgrid&page=1&rows=5"],
];
for (const [name, p] of tries) {
  const r = await probe("https://jwxt.hbut.edu.cn" + p, { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/pkgl/" } });
  const j = r.json;
  console.log(`[${r.status}] ${name}  json=${!!j} len=${r.text.length}`);
  if (j) { console.log(`   ret=${j.ret} total=${j.total}`); const f=(j.results||[])[0]; if(f) console.log(`   字段: ${Object.keys(f).filter(k=>!k.startsWith("current")&&k!=="new").slice(0,16).join(",")}`); }
  else console.log(`   HTML: ${r.text.trim().slice(0,70).replace(/\s+/g," ")}`);
  await new Promise(x => setTimeout(x, 280));
}
