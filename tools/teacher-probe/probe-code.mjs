import { probe, mask } from "./probe-lib.mjs";
const r = await probe("https://code.hbut.edu.cn/");
console.log("=== code 首页 status=" + r.status + " len=" + r.text.length + " ===");
console.log(r.text);
const r2 = await probe("https://code.hbut.edu.cn/server/auth/getLoginUser");
console.log("\n=== getLoginUser ===", r2.status, mask(r2.text).slice(0,300));
const r3 = await probe("https://code.hbut.edu.cn/server/user/info", { headers: { Authorization: "" } });
console.log("\n=== user/info(无token) ===", r3.status, mask(r3.text).slice(0,300));
