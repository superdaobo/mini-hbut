import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { probe } from "./probe-lib.mjs";
const KEY = Buffer.from("w687-9+3C_H&je_5","utf8");
function dec(b64){ try{ const d=crypto.createDecipheriv("sm4-ecb",KEY,null); d.setAutoPadding(true); return Buffer.concat([d.update(Buffer.from(b64,"base64")),d.final()]).toString("utf8"); }catch(e){ return "<fail:"+e.message+">"; } }
const SID="20000000";
const s=JSON.parse(fs.readFileSync(path.join(process.env.TEMP,`teacher_session_${SID}.json`),"utf8"));
const rt=s.one_code.token.resultData.refreshToken;
const up=await probe("https://code.hbut.edu.cn/server/auth/updateToken",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refreshToken:rt})});
const j=JSON.parse(up.text); const at=j.resultData.accessToken;
s.one_code.token=j; fs.writeFileSync(path.join(process.env.TEMP,`teacher_session_${SID}.json`),JSON.stringify(s,null,2),"utf8");
console.log("new token len=",at.length);
for (const variant of [
  {name:"Authorization only", h:{Authorization:at}},
  {name:"双头 Authorization+token", h:{Authorization:at, token:at}},
  {name:"token only", h:{token:at}},
  {name:"Bearer", h:{Authorization:"Bearer "+at}},
]) {
  const r=await probe("https://code.hbut.edu.cn/server/user/info",{headers:variant.h});
  let d="";
  try{ const jj=JSON.parse(r.text); if(typeof jj.data==="string") d=dec(jj.data); else d=r.text; }catch{ d=r.text; }
  console.log("\n["+variant.name+"] status="+r.status+"\n  "+d.slice(0,450));
}
