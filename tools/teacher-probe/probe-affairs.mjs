import { probe } from "./probe-lib.mjs";
const paths = [
  ["缓考 hkrwcx", "/admin/kw/kwhkgl/hkrwcx"],
  ["剩余试卷 sysjList", "/admin/jsd/sjgl/sysjList"],
  ["评教 xspjxxcx", "/admin/pj/xspjxxcx"],
  ["学分 getxftjlist", "/admin/xjgl/xftj/getxftjlist?gridtype=jqgrid&page=1&rows=50"],
  ["不及格 getBjgKcxx", "/admin/xjgl/xftj/getBjgKcxx?gridtype=jqgrid&page=1&rows=50"],
];
for (const [name, p] of paths) {
  const r = await probe("https://jwxt.hbut.edu.cn" + p, { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/" } });
  const isJson = !!r.json;
  const head = isJson ? JSON.stringify(r.json).slice(0, 200) : r.text.trim().slice(0, 120).replace(/\s+/g, " ");
  console.log(`[${r.status}] ${name}  json=${isJson} len=${r.text.length}`);
  console.log(`     ${head}`);
  await new Promise(x => setTimeout(x, 250));
}
