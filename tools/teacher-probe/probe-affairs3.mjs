import { probe, mask } from "./probe-lib.mjs";
const apis = [
  ["缓考", "/admin/kw/kwhkgl/hkmdcxjg?lx=&gridtype=jqgrid&page=1&rows=50"],
  ["剩余试卷", "/admin/jsd/sjgl/ajaxSysj?gridtype=jqgrid&page=1&rows=50"],
  ["评教", "/admin/pj/xspjxxcx/acustomList?gridtype=jqgrid&page=1&rows=50"],
  ["不及格", "/admin/xjgl/xftj/showBjgKcDetail?id=&gridtype=jqgrid&page=1&rows=50"],
];
for (const [name, p] of apis) {
  const r = await probe("https://jwxt.hbut.edu.cn" + p, { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/" } });
  const j = r.json;
  console.log(`[${r.status}] ${name}  json=${!!j} len=${r.text.length}`);
  if (j) {
    console.log(`   ret=${j.ret} total=${j.total} rows=${(j.results||[]).length}`);
    const f = (j.results||[])[0];
    if (f) console.log(`   字段: ${Object.keys(f).filter(k=>!k.startsWith("current")&&k!=="new").join(",")}`);
  } else {
    console.log(`   ${r.text.trim().slice(0, 100).replace(/\s+/g," ")}`);
  }
  await new Promise(x => setTimeout(x, 300));
}
