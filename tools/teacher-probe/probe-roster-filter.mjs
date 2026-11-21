import { probe } from "./probe-lib.mjs";
const bjmc = "12机自_机设2";
const bjbh = "wbj001-3";
const tests = [
  ["query.bjmc||", `query.bjmc||=${encodeURIComponent(bjmc)}`],
  ["query.bjbh||", `query.bjbh||=${encodeURIComponent(bjbh)}`],
  ["bjmc", `bjmc=${encodeURIComponent(bjmc)}`],
  ["bjdm", `bjdm=${encodeURIComponent(bjbh)}`],
  ["query.bjdm||(全)", `query.bjdm||=${encodeURIComponent(bjbh)}`],
  ["bjid+query", `bjid=${encodeURIComponent(bjbh)}&query.bjid||=${encodeURIComponent(bjbh)}`],
  ["无参(基线)", ""],
];
for (const [name, q] of tests) {
  const r = await probe(`https://jwxt.hbut.edu.cn/admin/xjgl/xsjbxx/xsxxcxListCustom?gridtype=jqgrid&page=1&rows=3&${q}`, { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/xjgl/xsjbxx/xsxxcx" } });
  const first = (r.json?.results || [])[0];
  console.log(`[${name}] total=${r.json?.total}  首条班级=${first?.bjmc ?? "-"}`);
  await new Promise(x => setTimeout(x, 250));
}
