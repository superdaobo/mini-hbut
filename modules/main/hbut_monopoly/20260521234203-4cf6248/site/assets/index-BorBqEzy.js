(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))r(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const c of i.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&r(c)}).observe(document,{childList:!0,subtree:!0});function o(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function r(n){if(n.ep)return;n.ep=!0;const i=o(n);fetch(n.href,i)}})();const f=80,y=12,w=320,a=Object.freeze([Object.freeze({id:"gate",name:"校门起点",type:"start",description:"从湖工校门出发，开启一轮校园经营挑战。"}),Object.freeze({id:"south-lake-run",name:"南湖晨跑",type:"grant",coins:40,credits:1,description:"晨跑打卡获得学院奖励。"}),Object.freeze({id:"library",name:"图书馆研修",type:"study",coins:-40,credits:2,description:"花时间刷题，绩点稳步上涨。"}),Object.freeze({id:"canteen",name:"西区食堂",type:"fee",coins:-35,credits:0,description:"请小队吃饭，钱包变轻。"}),Object.freeze({id:"engineering",name:"工程楼实训",type:"study",coins:-30,credits:1,description:"完成实训报告，积累专业绩点。"}),Object.freeze({id:"club-roadshow",name:"社团路演",type:"event",coins:50,credits:0,description:"展示项目拉到赞助。"}),Object.freeze({id:"lab",name:"实验室耗材",type:"fee",coins:-55,credits:0,description:"补买实验耗材。"}),Object.freeze({id:"cs-college",name:"计算机学院项目",type:"grant",coins:60,credits:1,description:"项目验收通过，奖金到账。"}),Object.freeze({id:"stadium",name:"操场加训",type:"study",coins:-20,credits:1,description:"体测训练提升状态。"}),Object.freeze({id:"dorm",name:"宿舍维修",type:"fee",coins:-45,credits:0,description:"临时维修支出。"}),Object.freeze({id:"startup-base",name:"创业基地",type:"event",coins:-20,credits:2,description:"熬夜路演，换来创新学分。"}),Object.freeze({id:"south-lake-night",name:"南湖夜读",type:"study",coins:-25,credits:2,description:"夜读效率很高。"}),Object.freeze({id:"scholarship",name:"奖学金公示",type:"grant",coins:90,credits:0,description:"奖学金到账。"}),Object.freeze({id:"office",name:"教务处补卡",type:"fee",coins:-35,credits:0,description:"补办材料产生费用。"}),Object.freeze({id:"bus-stop",name:"校车站",type:"event",coins:25,credits:1,description:"赶上校车，省钱又准点。"}),Object.freeze({id:"defense",name:"毕设答辩",type:"study",coins:-50,credits:3,description:"答辩顺利，离胜利更近。"})]),O=t=>{const e=Number(t);if(!Number.isInteger(e)||e<1||e>6)throw new Error(`骰子点数必须是 1-6 的整数，当前为 ${t}`);return e},$=(t,e)=>{const o=t.coins+Number(e.coins||0),r=t.credits+Number(e.credits||0),n=e.coins?`，金币${e.coins>0?"+":""}${e.coins}`:"",i=e.credits?`，绩点+${e.credits}`:"";return{...t,coins:o,credits:r,log:[`${e.name}: ${e.description}${n}${i}`,...t.log].slice(0,5)}},z=t=>t.credits>=y?"won":t.coins<=0?"lost":"playing",u=()=>({position:0,coins:w,credits:0,turn:0,dice:0,status:"playing",passedStart:!1,log:["从校门出发，攒金币、修绩点，先拿到 12 绩点即获胜。"]}),j=(t,e)=>{const o=t&&typeof t=="object"?t:u();if(o.status!=="playing")return o;const r=O(e),n=o.position+r,i=n>=a.length,c=n%a.length,h=a[c],v={...o,position:c,dice:r,turn:o.turn+1,passedStart:i,coins:o.coins+(i?f:0),log:i?[`经过校门，获得奖学金补给 +${f} 金币`,...o.log].slice(0,5):o.log},m=$(v,h);return{...m,status:z(m)}},E=()=>u(),I=(t=Date.now())=>{let e=Math.abs(Math.floor(Number(t)||1))%2147483647;return e===0&&(e=1),()=>(e=e*48271%2147483647,e%6+1)},b="hbut_monopoly",L=I();let s=u();const N=document.getElementById("app");function d(){var e;const t=((e=window.visualViewport)==null?void 0:e.height)||window.innerHeight||document.documentElement.clientHeight;document.documentElement.style.setProperty("--module-vh",`${t*.01}px`),p()}function p(){typeof window>"u"||window.parent===window||requestAnimationFrame(()=>{var e;const t=Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.body.scrollHeight,document.body.offsetHeight,((e=window.visualViewport)==null?void 0:e.height)||0);window.parent.postMessage({type:"mini-hbut:module-size",moduleId:b,module_id:b,height:t},"*")})}function H(t){return t===s.position?"tile current":t===0?"tile start":`tile ${a[t].type}`}function S(){return s.status==="won"?"绩点达标，成功毕业":s.status==="lost"?"金币耗尽，挑战失败":"投骰前进，经营湖工生活"}function T(){return a.map((t,e)=>`
    <button class="${H(e)}" data-index="${e}" type="button" aria-label="${t.name}">
      <span class="tile-index">${e+1}</span>
      <span class="tile-name">${t.name}</span>
    </button>
  `).join("")}function M(){return s.log.map(t=>`<li>${t}</li>`).join("")}function l(){var t,e;N.innerHTML=`
    <main class="app-shell">
      <section class="status-bar" aria-label="当前资源">
        <div>
          <span class="metric-label">金币</span>
          <strong>${s.coins}</strong>
        </div>
        <div>
          <span class="metric-label">绩点</span>
          <strong>${s.credits}/${y}</strong>
        </div>
        <div>
          <span class="metric-label">回合</span>
          <strong>${s.turn}</strong>
        </div>
      </section>

      <section class="hero-panel">
        <div>
          <p class="kicker">湖工大富翁</p>
          <h1>${S()}</h1>
        </div>
        <div class="dice-card" aria-live="polite">
          <span class="dice-label">骰子</span>
          <strong>${s.dice||"-"}</strong>
        </div>
      </section>

      <section class="board-panel" aria-label="湖工校园棋盘">
        <div class="board-grid">
          ${T()}
        </div>
      </section>

      <section class="control-panel">
        <button id="roll-button" class="primary-action" type="button" ${s.status==="playing"?"":"disabled"}>
          投骰前进
        </button>
        <button id="restart-button" class="secondary-action" type="button">重新开始</button>
      </section>

      <section class="event-panel" aria-label="事件记录">
        <div class="event-heading">
          <strong>校园事件</strong>
          <span>${a[s.position].name}</span>
        </div>
        <ol>${M()}</ol>
      </section>
    </main>
  `,(t=document.getElementById("roll-button"))==null||t.addEventListener("click",()=>{s=j(s,L()),l()}),(e=document.getElementById("restart-button"))==null||e.addEventListener("click",()=>{s=E(),l()}),p()}window.addEventListener("resize",d);window.addEventListener("orientationchange",d);var g;(g=window.visualViewport)==null||g.addEventListener("resize",d);"ResizeObserver"in window&&new ResizeObserver(p).observe(document.documentElement);d();l();
