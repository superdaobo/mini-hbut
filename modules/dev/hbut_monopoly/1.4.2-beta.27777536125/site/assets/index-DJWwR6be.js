(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))s(i);new MutationObserver(i=>{for(const c of i)if(c.type==="childList")for(const a of c.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&s(a)}).observe(document,{childList:!0,subtree:!0});function n(i){const c={};return i.integrity&&(c.integrity=i.integrity),i.referrerPolicy&&(c.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?c.credentials="include":i.crossOrigin==="anonymous"?c.credentials="omit":c.credentials="same-origin",c}function s(i){if(i.ep)return;i.ep=!0;const c=n(i);fetch(i.href,c)}})();const M=80,V=16,U=320,q=7,F=0,L=100,_=0,y=Object.freeze([Object.freeze({name:"新生探索季",targetCredits:8,targetInfluence:4,initialCoins:U,initialEnergy:82,initialStress:18,startingCards:["library-pass"]}),Object.freeze({name:"社团创业季",targetCredits:12,targetInfluence:8,initialCoins:360,initialEnergy:76,initialStress:24,startingCards:["library-pass","club-network"]}),Object.freeze({name:"毕业冲刺季",targetCredits:V,targetInfluence:12,initialCoins:420,initialEnergy:72,initialStress:30,startingCards:["library-pass","energy-drink"]})]),G=Object.freeze([Object.freeze({id:"library-pass",name:"图书馆通宵卡",description:"本回合追加绩点，但消耗精力；下一次投骰更容易抵达关键据点。",effects:{credits:2,energy:-12,stress:5},activeEffects:[Object.freeze({type:"diceBoost",amount:1,turns:1,label:"通宵检索路线"})]}),Object.freeze({id:"energy-drink",name:"运动补给包",description:"恢复精力并降低压力。",effects:{energy:20,stress:-10}}),Object.freeze({id:"club-network",name:"社团人脉卡",description:"用社团资源换取校园影响力。",effects:{influence:2,coins:-20,stress:4}})]),z=Object.freeze([Object.freeze({id:"library",name:"图书馆学习据点",cost:120,costStep:60,maxLevel:3,influence:2,credits:1,description:"建设固定自习区，经过图书馆时额外获得影响力。"}),Object.freeze({id:"innovation-hub",name:"创新创业据点",cost:160,costStep:80,maxLevel:2,influence:3,credits:1,description:"扶持路演与竞赛团队，强化后期阶段目标。"}),Object.freeze({id:"stadium",name:"操场补给据点",cost:95,costStep:45,maxLevel:3,influence:1,energy:10,description:"设置训练补给点，减少长线经营的精力压力。"})]),X=Object.freeze([Object.freeze({id:"lab-roadshow",title:"实验室路演",description:"导师给了一个展示机会，你可以选择稳扎稳打或快速拉赞助。",choices:Object.freeze([Object.freeze({id:"sponsor",label:"拉赞助",effects:{coins:90,stress:12,influence:2}}),Object.freeze({id:"polish",label:"打磨项目",effects:{coins:-30,credits:2,energy:-10}})])}),Object.freeze({id:"club-fair",title:"社团招新",description:"摊位人流很大，适合扩大影响力，也可能拖慢学习节奏。",choices:Object.freeze([Object.freeze({id:"host",label:"主持招新",effects:{influence:3,stress:8,energy:-8}}),Object.freeze({id:"support",label:"后勤支援",effects:{coins:45,influence:1,energy:-4}})])}),Object.freeze({id:"final-week",title:"期末周排期",description:"课程、竞赛和答辩撞在一起，需要决定优先级。",choices:Object.freeze([Object.freeze({id:"focus",label:"集中复习",effects:{credits:3,stress:14,energy:-14}}),Object.freeze({id:"balance",label:"均衡安排",effects:{credits:1,influence:2,stress:-4,coins:-25}})])})]),u=Object.freeze([Object.freeze({id:"gate",name:"校门起点",type:"start",description:"从湖工校门出发，开始阶段经营。"}),Object.freeze({id:"south-lake-run",name:"南湖晨跑",type:"grant",effects:Object.freeze({coins:35,influence:1,stress:-3}),description:"晨跑打卡带来状态和人气。"}),Object.freeze({id:"library",name:"图书馆研修",type:"study",siteId:"library",effects:Object.freeze({coins:-35,credits:2,energy:-5}),description:"刷题和查资料，稳步累积绩点。"}),Object.freeze({id:"canteen",name:"西区食堂排队",type:"fee",effects:Object.freeze({coins:-12}),description:"排队耽误时间，花费一顿补给。"}),Object.freeze({id:"engineering",name:"工程楼实训",type:"study",effects:Object.freeze({coins:-28,credits:1,influence:1,energy:-6,stress:3}),description:"完成实训报告，提升专业存在感。"}),Object.freeze({id:"club-roadshow",name:"社团路演",type:"event",eventId:"club-fair",description:"路演摊位触发选择事件。"}),Object.freeze({id:"lab",name:"实验室耗材",type:"fee",effects:Object.freeze({coins:-48,credits:1,stress:6}),description:"补买耗材，项目继续推进。"}),Object.freeze({id:"cs-college",name:"学院项目验收",type:"grant",effects:Object.freeze({coins:58,credits:1,influence:1}),description:"项目验收通过，学院奖励到账。"}),Object.freeze({id:"stadium",name:"操场加训",type:"rest",siteId:"stadium",effects:Object.freeze({energy:12,stress:-8,coins:-18}),description:"运动恢复状态，也需要补给。"}),Object.freeze({id:"dorm",name:"宿舍夜谈",type:"card",cardId:"club-network",effects:Object.freeze({stress:-4,influence:1}),description:"和同学交流，获得一张行动卡。"}),Object.freeze({id:"startup-base",name:"创业基地",type:"event",siteId:"innovation-hub",eventId:"lab-roadshow",description:"创业基地触发项目事件。"}),Object.freeze({id:"south-lake-night",name:"南湖夜读",type:"study",effects:Object.freeze({coins:-25,credits:2,energy:-10,stress:5}),description:"夜读效率高，但精力消耗明显。"}),Object.freeze({id:"scholarship",name:"奖学金公示",type:"grant",effects:Object.freeze({coins:90,stress:-4}),description:"阶段性成果被认可，资金补给到账。"}),Object.freeze({id:"office",name:"教务处排期",type:"event",eventId:"final-week",description:"课程安排改变，需要做一次取舍。"}),Object.freeze({id:"bus-stop",name:"校车站",type:"card",cardId:"energy-drink",effects:Object.freeze({coins:20,energy:6}),description:"赶上校车，顺手补充物资。"}),Object.freeze({id:"defense",name:"毕设答辩",type:"study",effects:Object.freeze({coins:-45,credits:3,influence:2,energy:-12,stress:10}),description:"答辩顺利，但压力陡增。"})]),T=new Map(G.map(t=>[t.id,t])),K=new Map(X.map(t=>[t.id,t])),W=new Map(z.map(t=>[t.id,t])),O=(t,e,n)=>Math.max(e,Math.min(n,t)),d=(t,e)=>Number.isFinite(Number(t))?Number(t):e,h=(t,e)=>{const n=Number(t);return Number.isInteger(n)&&n>=0?n:e},k=t=>{const e=O(Number.isInteger(t)?t:_,0,y.length-1);return{index:e,stage:y[e]}},D=t=>({...t}),Y=t=>({...t}),J=t=>({...t,effects:{...t.effects||{}}}),P=t=>t?{...t,choices:Array.isArray(t.choices)?t.choices.map(J):[]}:null,Q=(t={})=>Object.fromEntries(Object.entries(t||{}).map(([e,n])=>[e,{...n}])),H=t=>t.slice(0,q),o=(t,e)=>({...t,log:H([e,...Array.isArray(t.log)?t.log:[]])}),R=t=>{const e=T.get(t);return e?{id:e.id,name:e.name,description:e.description}:null},v=(t={})=>{const e=[],n=[["coins","资金"],["credits","绩点"],["influence","影响力"],["energy","精力"],["stress","压力"]];for(const[s,i]of n){const c=Number(t[s]||0);c!==0&&e.push(`${i}${c>0?"+":""}${c}`)}return e.join("，")},E=t=>O(Math.round(t),F,L),p=(t,e={})=>({...t,coins:Math.round(d(t.coins,0)+d(e.coins,0)),credits:Math.max(0,Math.round(d(t.credits,0)+d(e.credits,0))),influence:Math.max(0,Math.round(d(t.influence,0)+d(e.influence,0))),energy:E(d(t.energy,0)+d(e.energy,0)),stress:E(d(t.stress,0)+d(e.stress,0))}),Z=t=>{const e=Number(t);if(!Number.isInteger(e)||e<1||e>6)throw new Error(`骰子点数必须是 1-6 的整数，当前为 ${t}`);return e},b=t=>{const e=t&&typeof t=="object"?t:{},{index:n,stage:s}=k(Number.isInteger(e.stageIndex)?e.stageIndex:_),i=Array.isArray(e.cards)?e.cards.map(Y):s.startingCards.map(R).filter(Boolean),c=P(e.pendingEvent),a=e.status||"playing";return{position:O(h(e.position,0),0,u.length-1),coins:Math.round(d(e.coins,s.initialCoins)),credits:Math.max(0,Math.round(d(e.credits,0))),influence:Math.max(0,Math.round(d(e.influence,0))),energy:E(d(e.energy,s.initialEnergy)),stress:E(d(e.stress,s.initialStress)),stageIndex:n,stageName:s.name,targetCredits:s.targetCredits,targetInfluence:s.targetInfluence,totalStages:y.length,turn:h(e.turn,0),dice:h(e.dice,0),baseDice:h(e.baseDice,0),status:a,phase:e.phase||(c?"choice":a==="playing"?"roll":"result"),passedStart:!!e.passedStart,pendingEvent:c,eventHistory:Array.isArray(e.eventHistory)?e.eventHistory.map(f=>({...f})):[],cards:i,activeEffects:Array.isArray(e.activeEffects)?e.activeEffects.map(D):[],investments:Q(e.investments),log:Array.isArray(e.log)?H([...e.log]):[`第 ${n+1} 阶段：${s.name}，先达成 ${s.targetCredits} 绩点和 ${s.targetInfluence} 影响力。`]}},ee=(t,e)=>{let n=0;const s=[];for(const i of t.activeEffects){if(i.type==="diceBoost"){n+=Number(i.amount||1),Number(i.turns||0)>1&&s.push({...i,turns:i.turns-1});continue}s.push({...i})}return{dice:O(e+n,1,6),activeEffects:s,boost:n}},te=(t,e)=>{const n=e.siteId||e.id,s=t.investments[n];if(!(s!=null&&s.level))return t;const i={influence:s.level,energy:n==="stadium"?s.level*3:0},c=p(t,i);return o(c,`${s.name}提供据点加成：${v(i)}`)},ne=(t,e)=>{let n=p(t,e.effects||{});n=te(n,e);const s=v(e.effects);if(n=o(n,`${e.name}: ${e.description}${s?`（${s}）`:""}`),e.cardId){const i=R(e.cardId);i&&(n={...n,cards:[...n.cards,i]},n=o(n,`获得行动卡：${i.name}`))}if(e.eventId){const i=P(K.get(e.eventId));if(!i)return o(n,`${e.name}事件配置缺失，本回合继续前进。`);n={...n,pendingEvent:i,phase:"choice"},n=o(n,`触发事件：${i.title}`)}else n={...n,phase:"roll"};return n},B=(t={})=>b(t),j=t=>{let e=b(t);if(e.status!=="playing"||e.pendingEvent&&e.phase==="choice")return e;const n=[];if(e.coins<0&&n.push("资金"),e.energy<=0&&n.push("精力"),e.stress>=L&&n.push("压力"),n.length>0)return o({...e,status:"lost",phase:"result",pendingEvent:null},`${n.join("、")}失衡，校园经营挑战失败。`);if(e.credits<e.targetCredits||e.influence<e.targetInfluence)return e;if(e.stageIndex>=y.length-1)return o({...e,status:"won",phase:"result",pendingEvent:null},"三阶段目标全部完成，湖工大富翁挑战通关。");const{index:s,stage:i}=k(e.stageIndex+1);return o({...e,stageIndex:s,stageName:i.name,targetCredits:i.targetCredits,targetInfluence:i.targetInfluence,energy:Math.max(e.energy,i.initialEnergy),stress:Math.min(e.stress,i.initialStress),phase:"roll",pendingEvent:null},`进入第 ${s+1} 阶段：${i.name}`)},se=(t,e)=>{const n=b(t),s=n.pendingEvent;if(!s)return o(n,"当前没有待处理事件。");const i=s.choices.find(a=>a.id===e);if(!i)return o(n,"无法处理该事件选择。");const c=p({...n,pendingEvent:null,phase:"roll",eventHistory:[...n.eventHistory,{eventId:s.id,choiceId:i.id}]},i.effects);return j(o(c,`${s.title||"校园事件"}选择「${i.label}」：${v(i.effects)}`))},ie=(t,e)=>{const n=b(t);if(n.pendingEvent&&n.phase==="choice")return o(n,"请先处理当前校园事件，再使用行动卡。");const s=n.cards.findIndex(g=>g.id===e);if(s<0)return o(n,"没有找到这张行动卡。");const i=n.cards[s],c=T.get(e)||i,a=n.cards.filter((g,l)=>l!==s),f=p({...n,cards:a,activeEffects:[...n.activeEffects,...(c.activeEffects||[]).map(D)]},c.effects);return j(o(f,`使用行动卡：${c.name}（${v(c.effects)}）`))},re=(t,e)=>{var l,S;const n=b(t);if(n.pendingEvent&&n.phase==="choice")return o(n,"请先处理当前校园事件，再进行据点投资。");const s=W.get(e);if(!s)return o(n,"无法投资未知校园据点。");const i=((l=n.investments[s.id])==null?void 0:l.level)||0;if(i>=s.maxLevel)return o(n,`${s.name}已达到最高等级，无法继续投资。`);const c=s.cost+i*s.costStep;if(n.coins<c)return o(n,`${s.name}需要 ${c} 资金，资金不足，无法投资。`);const a=i+1,f={coins:-c,influence:s.influence,credits:s.credits||0,energy:s.energy||0},g=p({...n,investments:{...n.investments,[s.id]:{id:s.id,name:s.name,level:a,totalSpent:(((S=n.investments[s.id])==null?void 0:S.totalSpent)||0)+c}},activeEffects:[...n.activeEffects,{type:"siteBonus",siteId:s.id,level:a,label:s.name}]},f);return j(o(g,`投资${s.name} Lv.${a}：${v(f)}`))},ce=(t,e)=>{const n=b(t);if(n.status!=="playing")return n;if(n.phase==="choice"&&n.pendingEvent)return o(n,"请先处理当前校园事件，再继续投骰。");const s=Z(typeof e=="function"?e():e),i=ee(n,s),c=n.position+i.dice,a=c>=u.length,f=c%u.length,g=u[f];let l=p({...n,position:f,dice:i.dice,baseDice:s,turn:n.turn+1,passedStart:a,activeEffects:i.activeEffects,phase:"roll"},{energy:-5,stress:5});return a&&(l=p(l,{coins:M,stress:-3}),l=o(l,`经过校门，获得阶段补给：资金+${M}，压力-3`)),i.boost>0&&(l=o(l,`行动卡生效：骰子+${i.boost}`)),l=ne(l,g),j(l)},oe=(t={})=>B(t),ae=(t=Date.now())=>{let e=Math.abs(Math.floor(Number(t)||1))%2147483647;return e===0&&(e=1),()=>(e=e*48271%2147483647,e%6+1)},C="hbut_monopoly",de=ae();let r=B();const $=document.getElementById("app");function I(){var e;const t=((e=window.visualViewport)==null?void 0:e.height)||window.innerHeight||document.documentElement.clientHeight;document.documentElement.style.setProperty("--module-vh",`${t*.01}px`),w()}function w(){typeof window>"u"||window.parent===window||requestAnimationFrame(()=>{var e;const t=Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.body.scrollHeight,document.body.offsetHeight,((e=window.visualViewport)==null?void 0:e.height)||0);window.parent.postMessage({type:"mini-hbut:module-size",moduleId:C,module_id:C,height:t},"*")})}function le(t){var s;const e=u[t],n=["tile",e.type];return t===r.position&&n.push("current"),t===0&&n.push("start"),(s=r.investments)!=null&&s[e.siteId||e.id]&&n.push("invested"),n.join(" ")}function fe(){return r.status==="won"?"三阶段通关":r.status==="lost"?"经营失衡":r.pendingEvent?"处理校园事件":"规划下一回合"}function ue(){return r.status==="won"?"目标全部达成，湖工经营路线完成。":r.status==="lost"?"资金、精力或压力已越界，需要重新规划。":r.pendingEvent?r.pendingEvent.description:`目标：${r.targetCredits} 绩点 / ${r.targetInfluence} 影响力`}function pe(t,e){return e==="stress"?t>=80?"danger":t>=60?"warn":"ok":t<=20?"danger":t<=40?"warn":"ok"}function ge(t,e){return e<=0?0:Math.max(0,Math.min(100,Math.round(t/e*100)))}function x(t,e,n){const s=ge(e,n);return`
    <div class="goal-row">
      <span>${t}</span>
      <strong>${e}/${n}</strong>
      <i style="--value: ${s}%"></i>
    </div>
  `}function A(t,e,n){return`
    <div class="gauge ${pe(e,n)}">
      <span>${t}</span>
      <strong>${e}</strong>
      <i style="--value: ${Math.max(0,Math.min(100,e))}%"></i>
    </div>
  `}function me(){return u.map((t,e)=>`
    <button class="${le(e)}" data-index="${e}" type="button" aria-label="${t.name}">
      <span class="tile-index">${e+1}</span>
      <span class="tile-name">${t.name}</span>
      <span class="tile-type">${t.type==="event"?"事件":t.type==="study"?"学习":t.type==="grant"?"补给":t.type==="card"?"卡牌":t.type==="rest"?"恢复":t.type==="fee"?"支出":"起点"}</span>
    </button>
  `).join("")}function be(){return r.log.map(t=>`<li>${t}</li>`).join("")}function ye(){if(!r.pendingEvent){const t=u[r.position];return`
      <div class="event-empty">
        <strong>${t.name}</strong>
        <span>${t.description}</span>
      </div>
    `}return`
    <div class="choice-list">
      <strong>${r.pendingEvent.title}</strong>
      ${r.pendingEvent.choices.map(t=>`
            <button class="choice-button" data-choice-id="${t.id}" type="button">
              <span>${t.label}</span>
              <small>${ve(t.effects)}</small>
            </button>
          `).join("")}
    </div>
  `}function ve(t={}){return[["coins","资金"],["credits","绩点"],["influence","影响力"],["energy","精力"],["stress","压力"]].map(([n,s])=>{const i=Number(t[n]||0);return i?`${s}${i>0?"+":""}${i}`:""}).filter(Boolean).join(" / ")}function he(){if(!r.cards.length)return'<span class="empty-note">暂无行动卡</span>';const t=r.status!=="playing"||r.phase==="choice";return r.cards.map(e=>`
        <button class="tool-button" data-card-id="${e.id}" type="button" ${t?"disabled":""}>
          <span>${e.name}</span>
          <small>${e.description||"立即使用"}</small>
        </button>
      `).join("")}function $e(){return z.map(t=>{var c,a;const e=((a=(c=r.investments)==null?void 0:c[t.id])==null?void 0:a.level)||0,n=t.cost+e*t.costStep,s=e>=t.maxLevel,i=r.status!=="playing"||r.phase==="choice"||r.coins<n||s;return`
      <button class="tool-button investment-button" data-site-id="${t.id}" type="button" ${i?"disabled":""}>
        <span>${t.name} Lv.${e}/${t.maxLevel}</span>
        <small>${s?"已满级":`${n} 资金 · +${t.influence} 影响力`}</small>
      </button>
    `}).join("")}function m(){var t,e;$.innerHTML=`
    <main class="app-shell">
      <section class="metric-strip" aria-label="当前资源">
        <div>
          <span>阶段</span>
          <strong>${r.stageIndex+1}/${y.length}</strong>
        </div>
        <div>
          <span>资金</span>
          <strong>${r.coins}</strong>
        </div>
        <div>
          <span>回合</span>
          <strong>${r.turn}</strong>
        </div>
        <div>
          <span>骰子</span>
          <strong>${r.dice||"-"}</strong>
        </div>
      </section>

      <section class="hero-panel">
        <div>
          <p class="kicker">湖工大富翁 · ${r.stageName}</p>
          <h1>${fe()}</h1>
          <p class="status-detail">${ue()}</p>
        </div>
        <div class="goal-card" aria-label="阶段目标">
          ${x("绩点",r.credits,r.targetCredits)}
          ${x("影响力",r.influence,r.targetInfluence)}
        </div>
      </section>

      <section class="board-panel" aria-label="湖工校园棋盘">
        <div class="board-grid">
          ${me()}
        </div>
      </section>

      <section class="resource-panel" aria-label="精力与压力">
        ${A("精力",r.energy,"energy")}
        ${A("压力",r.stress,"stress")}
      </section>

      <section class="control-panel">
        <button id="roll-button" class="primary-action" type="button" ${r.status==="playing"&&r.phase==="roll"?"":"disabled"}>
          ${r.pendingEvent?"先处理事件":"投骰前进"}
        </button>
        <button id="restart-button" class="secondary-action" type="button">重新开始</button>
      </section>

      <section class="action-panel" aria-label="回合选择">
        <div class="panel-section event-section">
          ${ye()}
        </div>
        <div class="panel-section">
          <div class="section-heading">
            <strong>行动卡</strong>
            <span>${r.cards.length} 张</span>
          </div>
          <div class="tool-list">${he()}</div>
        </div>
        <div class="panel-section">
          <div class="section-heading">
            <strong>据点投资</strong>
            <span>${Object.keys(r.investments||{}).length}/${z.length}</span>
          </div>
          <div class="tool-list">${$e()}</div>
        </div>
      </section>

      <section class="log-panel" aria-label="事件记录">
        <div class="section-heading">
          <strong>校园记录</strong>
          <span>${u[r.position].name}</span>
        </div>
        <ol>${be()}</ol>
      </section>
    </main>
  `,(t=document.getElementById("roll-button"))==null||t.addEventListener("click",()=>{r=ce(r,de()),m()}),(e=document.getElementById("restart-button"))==null||e.addEventListener("click",()=>{r=oe(),m()});for(const n of $.querySelectorAll("[data-choice-id]"))n.addEventListener("click",()=>{r=se(r,n.dataset.choiceId),m()});for(const n of $.querySelectorAll("[data-card-id]"))n.addEventListener("click",()=>{r=ie(r,n.dataset.cardId),m()});for(const n of $.querySelectorAll("[data-site-id]"))n.addEventListener("click",()=>{r=re(r,n.dataset.siteId),m()});w()}window.addEventListener("resize",I);window.addEventListener("orientationchange",I);var N;(N=window.visualViewport)==null||N.addEventListener("resize",I);"ResizeObserver"in window&&new ResizeObserver(w).observe(document.documentElement);I();m();
