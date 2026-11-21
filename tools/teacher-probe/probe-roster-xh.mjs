import { probe } from "./probe-lib.mjs";
// 先拿一个真实学号
const base = await probe("https://jwxt.hbut.edu.cn/admin/xjgl/xsjbxx/xsxxcxListCustom?gridtype=jqgrid&page=1&rows=1", { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/xjgl/xsjbxx/xsxxcx" } });
const xh = (base.json?.results || [])[0]?.xh;
console.log("样本学号:", xh);
const tests = [
  ["query.xh||", `query.xh||=${xh}`],
  ["xh", `xh=${xh}`],
  ["query.xm||", `query.xm||=${encodeURIComponent("张")}`],
];
for (const [name, q] of tests) {
  const r = await probe(`https://jwxt.hbut.edu.cn/admin/xjgl/xsjbxx/xsxxcxListCustom?gridtype=jqgrid&page=1&rows=3&${q}`, { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/xjgl/xsjbxx/xsxxcx" } });
  console.log(`[${name}] total=${r.json?.total}`);
  await new Promise(x => setTimeout(x, 250));
}
