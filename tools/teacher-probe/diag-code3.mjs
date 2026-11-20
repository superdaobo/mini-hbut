import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { probe } from "./probe-lib.mjs";
const KEY = Buffer.from("w687-9+3C_H&je_5","utf8");
function dec(b64){ try{ const d=crypto.createDecipheriv("sm4-ecb",KEY,null); d.setAutoPadding(true); return Buffer.concat([d.update(Buffer.from(b64,"base64")),d.final()]).toString("utf8"); }catch(e){ return "<fail:"+e.message+">"; } }
const SID="20000000"; const F=path.join(process.env.TEMP,`teacher_session_${SID}.json`);
const s=JSON.parse(fs.readFileSync(F,"utf8"));
console.log("domains:", Object.keys(s.domains).join(","));
console.log("extra_cookies domains:", Object.keys(s.one_code?.extra_cookies||{}).join(","));
console.log("code domain cookies:", Object.keys(s.domains["code.hbut.edu.cn"]||{}).join(",") || "(无)");
console.log("extra code cookies:", Object.keys((s.one_code?.extra_cookies||{})["code.hbut.edu.cn"]||{}).join(",") || "(无)");
const at=s.one_code.token.resultData.accessToken;
// POST 形态
const rp=await probe("https://code.hbut.edu.cn/server/user/info",{method:"POST",headers:{"Content-Type":"application/json",Authorization:at},body:"{}"});
let dp=""; try{const j=JSON.parse(rp.text); dp=typeof j.data==="string"?dec(j.data):rp.text;}catch{dp=rp.text;}
console.log("\nPOST user/info:", rp.status, dp.slice(0,400));
// 原始 message 字节
const r=await probe("https://code.hbut.edu.cn/server/user/info",{headers:{Authorization:at}});
const j=JSON.parse(r.text); const t=dec(j.data);
console.log("\nmessage codepoints:", JSON.stringify(t));
