import { probe } from "./probe-lib.mjs";
const tries = [
  ["qryBjxx?qx=1", "/admin/pkgl/kbcx/bjkb/qryBjxx?qx=1&showLastRxnf=&kyzt=&gridtype=jqgrid&page=1&rows=5"],
  ["getBjSelectUnion", "/admin/api/jcsj/bjxx/getBjSelectUnion?gridtype=jqgrid"],
  ["ckbjkb", "/admin/pkgl/kbcx/bjkb/ckbjkb?gridtype=jqgrid&page=1&rows=5"],
];
for (const [name, p] of tries) {
  const r = await probe("https://jwxt.hbut.edu.cn" + p, { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb?qx=1" } });
  const j = r.json;
  console.log(`[${r.status}] ${name}  json=${!!j} len=${r.text.length}`);
  if (j) {
    console.log(`   ret=${j.ret} total=${j.total} arr=${Array.isArray(j)}`);
    const f = (j.results || j)[0];
    if (f) console.log(`   字段: ${Object.keys(f).filter(k=>!k.startsWith("current")&&k!=="new").slice(0,18).join(",")}`);
  } else console.log(`   HTML ${r.text.trim().slice(0,60).replace(/\s+/g," ")}`);
  await new Promise(x => setTimeout(x, 280));
}
