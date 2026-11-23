import { probe, mask } from "./probe-lib.mjs";
// 门户需要 e.hbut 域的 cookie
const r = await probe("https://e.hbut.edu.cn/getPageView", { headers: { Accept: "application/json", Referer: "https://e.hbut.edu.cn/" } });
console.log("getPageView status=", r.status, "json=", !!r.json);
if (r.json) {
  const j = r.json;
  console.log("errcode=", j.errcode, "errmsg=", String(j.errmsg || "").slice(0, 40));
  const layout = j.data?.cardLayout;
  console.log("cardLayout 数量:", Array.isArray(layout) ? layout.length : "非数组");
  if (Array.isArray(layout) && layout.length) {
    console.log("首卡键:", Object.keys(layout[0]).join(","));
    console.log("首卡样例:", mask(JSON.stringify(layout[0])).slice(0, 300));
  }
} else {
  console.log("HTML:", r.text.slice(0, 120).replace(/\s+/g, " "));
}
