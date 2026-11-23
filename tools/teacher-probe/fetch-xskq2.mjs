import fs from "node:fs";
import { probe, mask } from "./probe-lib.mjs";
const r = await probe("https://jwxt.hbut.edu.cn/admin/jsd/xskq/ajaxListJsJxrw?gridtype=jqgrid&page=1&rows=50&_search=false&xnxq=2026-2027-1", { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://jwxt.hbut.edu.cn/admin/jsd/xskq" } });
console.log("status=", r.status);
const j = r.json;
console.log("顶层键:", j ? Object.keys(j).join(",") : "(非 JSON)");
if (j) { console.log("ret=", j.ret, "total=", j.total, "rows=", (j.results||[]).length); }
fs.writeFileSync("xskq-list.json", JSON.stringify(j, null, 2), "utf8");
const first = (j?.results||[])[0];
if (first) { console.log("\n首条字段:", Object.keys(first).join(",")); console.log("\n首条(脱敏):", mask(JSON.stringify(first)).slice(0, 900)); }
