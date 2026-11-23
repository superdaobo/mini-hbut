import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { probe } from "./probe-lib.mjs";
const KEY = Buffer.from("w687-9+3C_H&je_5","utf8");
function dec(b64){ try{ const d=crypto.createDecipheriv("sm4-ecb",KEY,null); d.setAutoPadding(true); return Buffer.concat([d.update(Buffer.from(b64,"base64")),d.final()]).toString("utf8"); }catch(e){ return "<fail:"+e.message+">"; } }
const SID="20000000";
const s=JSON.parse(fs.readFileSync(path.join(process.env.TEMP,`teacher_session_${SID}.json`),"utf8"));
const at=s.one_code?.token?.resultData?.accessToken;
console.log("token len=", at?at.length:"MISS");
const r=await probe("https://code.hbut.edu.cn/server/user/info",{headers:{Authorization:at}});
console.log("status=",r.status,"raw=",r.text.slice(0,120));
let j=null; try{j=JSON.parse(r.text);}catch{}
if(j&&typeof j.data==="string") console.log("DECRYPTED:", dec(j.data).slice(0,600));
// 再试一次 refreshToken 换新 token
const rt=s.one_code?.token?.resultData?.refreshToken;
if(rt){ const r2=await probe("https://code.hbut.edu.cn/server/auth/updateToken",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refreshToken:rt})}); console.log("\nupdateToken:",r2.status,r2.text.slice(0,300)); }
