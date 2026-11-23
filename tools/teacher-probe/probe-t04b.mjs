import { probe } from "./probe-lib.mjs";
const apis = [
  ["调停补-我的申请", "/admin/jsd/ttbgl/queryTtbxxList?listtype=js&xnxq=2026-2027-1&gridtype=jqgrid&page=1&rows=50"],
  ["调停补-可申请课程", "/admin/jsd/ttbgl/queryJsPkxx?gridtype=jqgrid&page=1&rows=50"],
  ["名册-学生列表", "/admin/xjgl/xsjbxx/xsxxcxListCustom?gridtype=jqgrid&page=1&rows=5&xnxq=2026-2027-1"],
  ["成绩-录入进度", "/admin/jsd/jsdcjlr/queryCjlrsz/1?gridtype=jqgrid&page=1&rows=50"],
  ["成绩-教学班", "/admin/jsd/jsdcjcx/jsdQueryJxbList?gridtype=jqgrid&page=1&rows=50"],
  ["班级列表", "/admin/pkgl/kbcx/bjkb/qryBjxx?gridtype=jqgrid&page=1&rows=5"],
];
for (const [name, p] of apis) {
  const r = await probe("https://jwxt.hbut.edu.cn" + p, { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/" } });
  const j = r.json;
  console.log(`[${r.status}] ${name}  json=${!!j} len=${r.text.length}`);
  if (j) {
    console.log(`   ret=${j.ret} total=${j.total} rows=${(j.results||[]).length}`);
    const f = (j.results||[])[0];
    if (f) console.log(`   字段: ${Object.keys(f).filter(k=>!k.startsWith("current")&&k!=="new").slice(0,22).join(",")}`);
  } else {
    console.log(`   HTML: ${r.text.trim().slice(0, 80).replace(/\s+/g," ")}`);
  }
  await new Promise(x => setTimeout(x, 280));
}
