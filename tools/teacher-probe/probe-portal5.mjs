import { probe } from "./probe-lib.mjs";
// 手动跟随 302 链（CAS 有 CASTGC 会自动换票）
let url = "https://e.hbut.edu.cn/login";
const hops = [];
for (let i = 0; i < 8; i++) {
  const r = await probe(url, { headers: { Referer: "https://e.hbut.edu.cn/" } });
  hops.push({ status: r.status, loc: (r.location || "").slice(0, 70) });
  if (r.status >= 300 && r.status < 400 && r.location) {
    url = new URL(r.location, url).toString();
    continue;
  }
  break;
}
console.log("跳转链:", JSON.stringify(hops, null, 1));
await new Promise(x => setTimeout(x, 500));
const r = await probe("https://e.hbut.edu.cn/getPageView?pageCode=&originalUrl=&lang=zh", { headers: { Accept: "application/json", Referer: "https://e.hbut.edu.cn/" } });
const raw = r.json?.data?.pageContext?.pageInfoEntity?.cardLayout;
console.log("最终 errcode=", r.json?.errcode, "data 键数=", r.json?.data ? Object.keys(r.json.data).length : 0, "cardLayout=", typeof raw);
