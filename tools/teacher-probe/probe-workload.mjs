import { probe } from "./probe-lib.mjs";
const r = await probe("https://jwxt.hbut.edu.cn/twork/jsd/current-user-gzl", { headers: { Accept: "application/json", Referer: "https://jwxt.hbut.edu.cn/admin/" } });
console.log("status=", r.status, "json=", !!r.json);
const j = r.json;
if (j) {
  console.log("顶层键:", Object.keys(j).join(","));
  console.log("code=", j.code, "message=", String(j.message).slice(0, 60));
  console.log("data 类型:", j.data === null ? "null" : typeof j.data);
  if (j.data && typeof j.data === "object") {
    console.log("data 键:", Object.keys(j.data).join(","));
    console.log("data 样例:", JSON.stringify(j.data).slice(0, 500));
  }
} else {
  console.log("HTML:", r.text.slice(0, 150).replace(/\s+/g, " "));
}
