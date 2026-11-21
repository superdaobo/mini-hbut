import { probe, mask } from "./probe-lib.mjs";
const apis = [
  ["我的申请", "/admin/activiti/myApply/qryMyApply?gridtype=jqgrid&page=1&rows=20"],
  ["我的经办", "/admin/activiti/myApply/qryOperationApply?gridtype=jqgrid&page=1&rows=20"],
  ["我的待办", "/admin/activiti/dbsy/listRunningProcessInstaces?gridtype=jqgrid&page=1&rows=20"],
];
for (const [name, p] of apis) {
  const r = await probe("https://jwxt.hbut.edu.cn" + p, { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/" } });
  const j = r.json;
  console.log(`[${r.status}] ${name} total=${j?.total}`);
  const row = (j?.results || [])[0];
  if (row) {
    const keys = Object.keys(row).filter(k => !k.startsWith("current") && k !== "new");
    console.log(`   字段(${keys.length}): ${keys.join(",")}`);
    console.log(`   样例: ${mask(JSON.stringify(row)).slice(0, 420)}`);
  }
  await new Promise(x => setTimeout(x, 300));
}
