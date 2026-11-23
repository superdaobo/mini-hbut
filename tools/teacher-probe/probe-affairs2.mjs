import { probe } from "./probe-lib.mjs";
const pages = [
  ["缓考", "/admin/kw/kwhkgl/hkrwcx"],
  ["剩余试卷", "/admin/jsd/sjgl/sysjList"],
  ["评教", "/admin/pj/xspjxxcx"],
  ["不及格", "/admin/xjgl/xftj/getBjgKcxx"],
];
for (const [name, p] of pages) {
  const r = await probe("https://jwxt.hbut.edu.cn" + p, { headers: { Referer: "https://jwxt.hbut.edu.cn/admin/" } });
  const urls = [...new Set([...r.text.matchAll(/url\s*:\s*['"]([^'"]{4,140})['"]/g)].map(m => m[1]))];
  console.log(`\n=== ${name} ===`);
  urls.slice(0, 8).forEach(u => console.log("   ", u));
  if (!urls.length) console.log("    (无 url: 定义 → 纯服务端渲染)");
  await new Promise(x => setTimeout(x, 300));
}
