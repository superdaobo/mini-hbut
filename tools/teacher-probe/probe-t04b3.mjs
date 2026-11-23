import { probe } from "./probe-lib.mjs";
const tries = [
  ["xsbjxx", "/admin/xjgl/xsjbxx/xsbjxx?gridtype=jqgrid&page=1&rows=5"],
  ["getbjxxList", "/admin/system/jcsj/bjxx/getbjxxList?gridtype=jqgrid&page=1&rows=5"],
  ["bjkb/ckbjkb", "/admin/pkgl/kbcx/bjkb/ckbjkb?gridtype=jqgrid&page=1&rows=5"],
];
for (const [name, p] of tries) {
  const r = await probe("https://jwxt.hbut.edu.cn" + p, { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/" } });
  const j = r.json;
  console.log(`[${r.status}] ${name}  json=${!!j} len=${r.text.length}`);
  if (j) { console.log(`   ret=${j.ret} total=${j.total} arr=${Array.isArray(j)}`); const f=(j.results||j)[0]; if(f) console.log(`   字段: ${Object.keys(f).filter(k=>!k.startsWith("current")&&k!=="new").slice(0,16).join(",")}`); }
  else console.log(`   HTML`);
  await new Promise(x => setTimeout(x, 280));
}
