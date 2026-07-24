(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=7,t=0,n=100,r=0,i=Object.freeze([Object.freeze({name:`新生探索季`,targetCredits:8,targetInfluence:4,initialCoins:320,initialEnergy:82,initialStress:18,startingCards:[`library-pass`]}),Object.freeze({name:`社团创业季`,targetCredits:12,targetInfluence:8,initialCoins:360,initialEnergy:76,initialStress:24,startingCards:[`library-pass`,`club-network`]}),Object.freeze({name:`毕业冲刺季`,targetCredits:16,targetInfluence:12,initialCoins:420,initialEnergy:72,initialStress:30,startingCards:[`library-pass`,`energy-drink`]})]),a=Object.freeze([Object.freeze({id:`library-pass`,name:`图书馆通宵卡`,description:`本回合追加绩点，但消耗精力；下一次投骰更容易抵达关键据点。`,effects:{credits:2,energy:-12,stress:5},activeEffects:[Object.freeze({type:`diceBoost`,amount:1,turns:1,label:`通宵检索路线`})]}),Object.freeze({id:`energy-drink`,name:`运动补给包`,description:`恢复精力并降低压力。`,effects:{energy:20,stress:-10}}),Object.freeze({id:`club-network`,name:`社团人脉卡`,description:`用社团资源换取校园影响力。`,effects:{influence:2,coins:-20,stress:4}})]),o=Object.freeze([Object.freeze({id:`library`,name:`图书馆学习据点`,cost:120,costStep:60,maxLevel:3,influence:2,credits:1,description:`建设固定自习区，经过图书馆时额外获得影响力。`}),Object.freeze({id:`innovation-hub`,name:`创新创业据点`,cost:160,costStep:80,maxLevel:2,influence:3,credits:1,description:`扶持路演与竞赛团队，强化后期阶段目标。`}),Object.freeze({id:`stadium`,name:`操场补给据点`,cost:95,costStep:45,maxLevel:3,influence:1,energy:10,description:`设置训练补给点，减少长线经营的精力压力。`})]),s=Object.freeze([Object.freeze({id:`lab-roadshow`,title:`实验室路演`,description:`导师给了一个展示机会，你可以选择稳扎稳打或快速拉赞助。`,choices:Object.freeze([Object.freeze({id:`sponsor`,label:`拉赞助`,effects:{coins:90,stress:12,influence:2}}),Object.freeze({id:`polish`,label:`打磨项目`,effects:{coins:-30,credits:2,energy:-10}})])}),Object.freeze({id:`club-fair`,title:`社团招新`,description:`摊位人流很大，适合扩大影响力，也可能拖慢学习节奏。`,choices:Object.freeze([Object.freeze({id:`host`,label:`主持招新`,effects:{influence:3,stress:8,energy:-8}}),Object.freeze({id:`support`,label:`后勤支援`,effects:{coins:45,influence:1,energy:-4}})])}),Object.freeze({id:`final-week`,title:`期末周排期`,description:`课程、竞赛和答辩撞在一起，需要决定优先级。`,choices:Object.freeze([Object.freeze({id:`focus`,label:`集中复习`,effects:{credits:3,stress:14,energy:-14}}),Object.freeze({id:`balance`,label:`均衡安排`,effects:{credits:1,influence:2,stress:-4,coins:-25}})])})]),c=Object.freeze([Object.freeze({id:`gate`,name:`校门起点`,type:`start`,description:`从湖工校门出发，开始阶段经营。`}),Object.freeze({id:`south-lake-run`,name:`南湖晨跑`,type:`grant`,effects:Object.freeze({coins:35,influence:1,stress:-3}),description:`晨跑打卡带来状态和人气。`}),Object.freeze({id:`library`,name:`图书馆研修`,type:`study`,siteId:`library`,effects:Object.freeze({coins:-35,credits:2,energy:-5}),description:`刷题和查资料，稳步累积绩点。`}),Object.freeze({id:`canteen`,name:`西区食堂排队`,type:`fee`,effects:Object.freeze({coins:-12}),description:`排队耽误时间，花费一顿补给。`}),Object.freeze({id:`engineering`,name:`工程楼实训`,type:`study`,effects:Object.freeze({coins:-28,credits:1,influence:1,energy:-6,stress:3}),description:`完成实训报告，提升专业存在感。`}),Object.freeze({id:`club-roadshow`,name:`社团路演`,type:`event`,eventId:`club-fair`,description:`路演摊位触发选择事件。`}),Object.freeze({id:`lab`,name:`实验室耗材`,type:`fee`,effects:Object.freeze({coins:-48,credits:1,stress:6}),description:`补买耗材，项目继续推进。`}),Object.freeze({id:`cs-college`,name:`学院项目验收`,type:`grant`,effects:Object.freeze({coins:58,credits:1,influence:1}),description:`项目验收通过，学院奖励到账。`}),Object.freeze({id:`stadium`,name:`操场加训`,type:`rest`,siteId:`stadium`,effects:Object.freeze({energy:12,stress:-8,coins:-18}),description:`运动恢复状态，也需要补给。`}),Object.freeze({id:`dorm`,name:`宿舍夜谈`,type:`card`,cardId:`club-network`,effects:Object.freeze({stress:-4,influence:1}),description:`和同学交流，获得一张行动卡。`}),Object.freeze({id:`startup-base`,name:`创业基地`,type:`event`,siteId:`innovation-hub`,eventId:`lab-roadshow`,description:`创业基地触发项目事件。`}),Object.freeze({id:`south-lake-night`,name:`南湖夜读`,type:`study`,effects:Object.freeze({coins:-25,credits:2,energy:-10,stress:5}),description:`夜读效率高，但精力消耗明显。`}),Object.freeze({id:`scholarship`,name:`奖学金公示`,type:`grant`,effects:Object.freeze({coins:90,stress:-4}),description:`阶段性成果被认可，资金补给到账。`}),Object.freeze({id:`office`,name:`教务处排期`,type:`event`,eventId:`final-week`,description:`课程安排改变，需要做一次取舍。`}),Object.freeze({id:`bus-stop`,name:`校车站`,type:`card`,cardId:`energy-drink`,effects:Object.freeze({coins:20,energy:6}),description:`赶上校车，顺手补充物资。`}),Object.freeze({id:`defense`,name:`毕设答辩`,type:`study`,effects:Object.freeze({coins:-45,credits:3,influence:2,energy:-12,stress:10}),description:`答辩顺利，但压力陡增。`})]),l=new Map(a.map(e=>[e.id,e])),u=new Map(s.map(e=>[e.id,e])),ee=new Map(o.map(e=>[e.id,e])),d=(e,t,n)=>Math.max(t,Math.min(n,e)),f=(e,t)=>Number.isFinite(Number(e))?Number(e):t,p=(e,t)=>{let n=Number(e);return Number.isInteger(n)&&n>=0?n:t},m=e=>{let t=d(Number.isInteger(e)?e:r,0,i.length-1);return{index:t,stage:i[t]}},h=e=>({...e}),te=e=>({...e}),ne=e=>({...e,effects:{...e.effects||{}}}),g=e=>e?{...e,choices:Array.isArray(e.choices)?e.choices.map(ne):[]}:null,re=(e={})=>Object.fromEntries(Object.entries(e||{}).map(([e,t])=>[e,{...t}])),_=t=>t.slice(0,e),v=(e,t)=>({...e,log:_([t,...Array.isArray(e.log)?e.log:[]])}),y=e=>{let t=l.get(e);return t?{id:t.id,name:t.name,description:t.description}:null},b=(e={})=>{let t=[];for(let[n,r]of[[`coins`,`资金`],[`credits`,`绩点`],[`influence`,`影响力`],[`energy`,`精力`],[`stress`,`压力`]]){let i=Number(e[n]||0);i!==0&&t.push(`${r}${i>0?`+`:``}${i}`)}return t.join(`，`)},x=e=>d(Math.round(e),t,n),S=(e,t={})=>({...e,coins:Math.round(f(e.coins,0)+f(t.coins,0)),credits:Math.max(0,Math.round(f(e.credits,0)+f(t.credits,0))),influence:Math.max(0,Math.round(f(e.influence,0)+f(t.influence,0))),energy:x(f(e.energy,0)+f(t.energy,0)),stress:x(f(e.stress,0)+f(t.stress,0))}),ie=e=>{let t=Number(e);if(!Number.isInteger(t)||t<1||t>6)throw Error(`骰子点数必须是 1-6 的整数，当前为 ${e}`);return t},C=e=>{let t=e&&typeof e==`object`?e:{},{index:n,stage:a}=m(Number.isInteger(t.stageIndex)?t.stageIndex:r),o=Array.isArray(t.cards)?t.cards.map(te):a.startingCards.map(y).filter(Boolean),s=g(t.pendingEvent),l=t.status||`playing`;return{position:d(p(t.position,0),0,c.length-1),coins:Math.round(f(t.coins,a.initialCoins)),credits:Math.max(0,Math.round(f(t.credits,0))),influence:Math.max(0,Math.round(f(t.influence,0))),energy:x(f(t.energy,a.initialEnergy)),stress:x(f(t.stress,a.initialStress)),stageIndex:n,stageName:a.name,targetCredits:a.targetCredits,targetInfluence:a.targetInfluence,totalStages:i.length,turn:p(t.turn,0),dice:p(t.dice,0),baseDice:p(t.baseDice,0),status:l,phase:t.phase||(s?`choice`:l===`playing`?`roll`:`result`),passedStart:!!t.passedStart,pendingEvent:s,eventHistory:Array.isArray(t.eventHistory)?t.eventHistory.map(e=>({...e})):[],cards:o,activeEffects:Array.isArray(t.activeEffects)?t.activeEffects.map(h):[],investments:re(t.investments),log:Array.isArray(t.log)?_([...t.log]):[`第 ${n+1} 阶段：${a.name}，先达成 ${a.targetCredits} 绩点和 ${a.targetInfluence} 影响力。`]}},ae=(e,t)=>{let n=0,r=[];for(let t of e.activeEffects){if(t.type===`diceBoost`){n+=Number(t.amount||1),Number(t.turns||0)>1&&r.push({...t,turns:t.turns-1});continue}r.push({...t})}return{dice:d(t+n,1,6),activeEffects:r,boost:n}},oe=(e,t)=>{let n=t.siteId||t.id,r=e.investments[n];if(!r?.level)return e;let i={influence:r.level,energy:n===`stadium`?r.level*3:0};return v(S(e,i),`${r.name}提供据点加成：${b(i)}`)},se=(e,t)=>{let n=S(e,t.effects||{});n=oe(n,t);let r=b(t.effects);if(n=v(n,`${t.name}: ${t.description}${r?`（${r}）`:``}`),t.cardId){let e=y(t.cardId);e&&(n={...n,cards:[...n.cards,e]},n=v(n,`获得行动卡：${e.name}`))}if(t.eventId){let e=g(u.get(t.eventId));if(!e)return v(n,`${t.name}事件配置缺失，本回合继续前进。`);n={...n,pendingEvent:e,phase:`choice`},n=v(n,`触发事件：${e.title}`)}else n={...n,phase:`roll`};return n},w=(e={})=>C(e),T=e=>{let t=C(e);if(t.status!==`playing`||t.pendingEvent&&t.phase===`choice`)return t;let r=[];if(t.coins<0&&r.push(`资金`),t.energy<=0&&r.push(`精力`),t.stress>=n&&r.push(`压力`),r.length>0)return v({...t,status:`lost`,phase:`result`,pendingEvent:null},`${r.join(`、`)}失衡，校园经营挑战失败。`);if(t.credits<t.targetCredits||t.influence<t.targetInfluence)return t;if(t.stageIndex>=i.length-1)return v({...t,status:`won`,phase:`result`,pendingEvent:null},`三阶段目标全部完成，湖工大富翁挑战通关。`);let{index:a,stage:o}=m(t.stageIndex+1);return v({...t,stageIndex:a,stageName:o.name,targetCredits:o.targetCredits,targetInfluence:o.targetInfluence,energy:Math.max(t.energy,o.initialEnergy),stress:Math.min(t.stress,o.initialStress),phase:`roll`,pendingEvent:null},`进入第 ${a+1} 阶段：${o.name}`)},ce=(e,t)=>{let n=C(e),r=n.pendingEvent;if(!r)return v(n,`当前没有待处理事件。`);let i=r.choices.find(e=>e.id===t);return i?T(v(S({...n,pendingEvent:null,phase:`roll`,eventHistory:[...n.eventHistory,{eventId:r.id,choiceId:i.id}]},i.effects),`${r.title||`校园事件`}选择「${i.label}」：${b(i.effects)}`)):v(n,`无法处理该事件选择。`)},le=(e,t)=>{let n=C(e);if(n.pendingEvent&&n.phase===`choice`)return v(n,`请先处理当前校园事件，再使用行动卡。`);let r=n.cards.findIndex(e=>e.id===t);if(r<0)return v(n,`没有找到这张行动卡。`);let i=n.cards[r],a=l.get(t)||i,o=n.cards.filter((e,t)=>t!==r);return T(v(S({...n,cards:o,activeEffects:[...n.activeEffects,...(a.activeEffects||[]).map(h)]},a.effects),`使用行动卡：${a.name}（${b(a.effects)}）`))},ue=(e,t)=>{let n=C(e);if(n.pendingEvent&&n.phase===`choice`)return v(n,`请先处理当前校园事件，再进行据点投资。`);let r=ee.get(t);if(!r)return v(n,`无法投资未知校园据点。`);let i=n.investments[r.id]?.level||0;if(i>=r.maxLevel)return v(n,`${r.name}已达到最高等级，无法继续投资。`);let a=r.cost+i*r.costStep;if(n.coins<a)return v(n,`${r.name}需要 ${a} 资金，资金不足，无法投资。`);let o=i+1,s={coins:-a,influence:r.influence,credits:r.credits||0,energy:r.energy||0};return T(v(S({...n,investments:{...n.investments,[r.id]:{id:r.id,name:r.name,level:o,totalSpent:(n.investments[r.id]?.totalSpent||0)+a}},activeEffects:[...n.activeEffects,{type:`siteBonus`,siteId:r.id,level:o,label:r.name}]},s),`投资${r.name} Lv.${o}：${b(s)}`))},de=(e,t)=>{let n=C(e);if(n.status!==`playing`)return n;if(n.phase===`choice`&&n.pendingEvent)return v(n,`请先处理当前校园事件，再继续投骰。`);let r=ie(typeof t==`function`?t():t),i=ae(n,r),a=n.position+i.dice,o=a>=c.length,s=a%c.length,l=c[s],u=S({...n,position:s,dice:i.dice,baseDice:r,turn:n.turn+1,passedStart:o,activeEffects:i.activeEffects,phase:`roll`},{energy:-5,stress:5});return o&&(u=S(u,{coins:80,stress:-3}),u=v(u,`经过校门，获得阶段补给：资金+80，压力-3`)),i.boost>0&&(u=v(u,`行动卡生效：骰子+${i.boost}`)),u=se(u,l),T(u)},fe=(e={},t={})=>w(t),pe=(e={})=>{let t=Math.max(0,Math.round(Number(e.credits)||0)),n=Math.max(0,Math.round(Number(e.influence)||0)),r=Math.round(Number(e.coins)||0);return t*100+n*100+Math.max(0,r)},me=(e=Date.now())=>{let t=Math.abs(Math.floor(Number(e)||1))%2147483647;return t===0&&(t=1),()=>(t=t*48271%2147483647,t%6+1)},E=`hbut_monopoly`,he=`https://mini-hbut-testocr1.hf.space/api/game-rank`,ge=12e3,D=`hbut_monopoly_rank_context_v1`,_e=[1200,2600,5200],O=e=>String(e??``).trim(),ve=`排行榜请求超时，请稍后重试`,ye=(e,t=null)=>{try{return JSON.parse(e||``)}catch{return t}},k=e=>{let t=O(e);if(!t)return he;let n=(/^https?:\/\//i.test(t)?t:`https://${t}`).replace(/\/+$/,``);return/\/api\/game-rank$/i.test(n)?n:/\/api$/i.test(n)?`${n}/game-rank`:`${n}/api/game-rank`},be=async(e,t=ge)=>{let n=typeof AbortController==`function`?new AbortController:null,r=null;try{return n&&(r=window.setTimeout(()=>n.abort(),t)),await e(n?.signal)}finally{r&&window.clearTimeout(r)}},A=e=>{let t=`${O(e?.name)} ${O(e?.message||e)}`.toLowerCase();return t.includes(`abort`)||t.includes(`timeout`)||t.includes(`signal is aborted`)},xe=e=>A(e)?Error(ve):e instanceof Error?e:Error(O(e)||`排行榜请求失败`),Se=e=>new Promise(t=>window.setTimeout(t,Math.max(0,Number(e||0)))),Ce=e=>{let t=Number(e?.status||0);return t===429||t>=500&&t<=599?!0:A(e)||/network|fetch|failed|timeout/i.test(O(e?.message||e))},j=async(e,t={})=>{let n=null;try{n=await be(n=>fetch(e,{...t,signal:n,headers:{Accept:`application/json`,...t?.body?{"Content-Type":`application/json`}:{},...t?.headers||{}}}))}catch(e){throw xe(e)}let r=await n.text(),i=null;try{i=JSON.parse(r||`{}`)}catch{i=null}if(!n.ok){let e=Error(O(i?.error||i?.message||r)||`HTTP ${n.status}`);throw e.status=n.status,e}if(!i||typeof i!=`object`)throw Error(`排行榜服务返回了无效响应`);if(i.success===!1){let e=Error(O(i.error||i.message)||`排行榜服务返回失败`);throw e.status=Number(i.status||0),e}return i},we=async(e,t={},n={})=>{let r=Array.isArray(n.retryDelaysMs)?n.retryDelaysMs:_e,i=null;for(let n=0;n<=r.length;n+=1){n>0&&await Se(r[n-1]);try{return await j(e,t)}catch(e){if(i=e,n>=r.length||!Ce(e))throw e}}throw i||Error(`排行榜请求失败`)},Te=()=>{let e=ye(localStorage.getItem(D),null);return e&&typeof e==`object`?e:{}},M=(e,t,n)=>N(e?.[t],e?.[n]),Ee=e=>{let t=e&&typeof e==`object`?e:{};!O(t.studentId)&&!O(t.playerName)&&!O(t.className)&&!O(t.major)||localStorage.setItem(D,JSON.stringify({gameId:O(t.gameId||E),studentId:O(t.studentId),playerName:O(t.playerName),className:O(t.className),schoolName:O(t.schoolName||`湖北工业大学`),major:O(t.major),runtime:O(t.runtime),appVersion:O(t.appVersion),from:O(t.from),rankApiBase:O(t.rankApiBase||he)}))},N=(...e)=>{for(let t of e){let e=O(t);if(e)return e}return``},P=()=>{let e=new URLSearchParams(window.location.search||``),t=Te(),n={gameId:E,studentId:N(e.get(`student_id`),M(t,`studentId`,`student_id`)),playerName:N(e.get(`player_name`),M(t,`playerName`,`player_name`)),className:N(e.get(`class_name`),M(t,`className`,`class_name`)),schoolName:N(e.get(`school_name`),M(t,`schoolName`,`school_name`))||`湖北工业大学`,major:N(e.get(`major`),t.major),runtime:N(e.get(`runtime`),t.runtime)||`module-web`,appVersion:N(e.get(`app_version`),M(t,`appVersion`,`app_version`)),from:N(e.get(`from`),t.from),rankApiBase:k(N(e.get(`rank_api`),M(t,`rankApiBase`,`rank_api`)))};return Ee(n),n},De=e=>{let t=e&&typeof e==`object`?e:{};return!!O(t.studentId)&&!!k(t.rankApiBase)},F=async(e,t={},n={})=>{let r=e&&typeof e==`object`?e:P(),i={game_id:O(t.gameId||r.gameId||E),run_id:O(t.runId),student_id:O(r.studentId),player_name:O(t.playerName||r.playerName||r.studentId),class_name:O(t.className||r.className),school_name:O(t.schoolName||r.schoolName||`湖北工业大学`),major:O(t.major||r.major),score:Number(t.score||0)||0,max_level:Number(t.maxLevel||0)||0,duration_ms:Number(t.durationMs||0)||0,move_count:Number(t.moveCount||0)||0,ended_reason:O(t.endedReason||`finished`),client_version:O(t.clientVersion||r.appVersion),platform:O(t.platform||navigator.platform),runtime:O(t.runtime||r.runtime),payload:t.extra&&typeof t.extra==`object`?t.extra:{}};return we(`${k(r.rankApiBase)}/submit`,{method:`POST`,body:JSON.stringify(i)},n)},Oe=async(e,t={})=>{let n=e&&typeof e==`object`?e:P(),r=O(t.scope||`class`)||`class`,i=new URLSearchParams({game_id:O(t.gameId||n.gameId||E),scope:r,limit:String(Number(t.limit||20)||20)}),a=O(t.studentId||n.studentId),o=O(t.className||n.className),s=O(t.schoolName||n.schoolName);return a&&i.set(`student_id`,a),o&&i.set(`class_name`,o),s&&i.set(`school_name`,s),j(`${k(n.rankApiBase)}/leaderboard?${i.toString()}`)},I=()=>{let e=Math.random().toString(36).slice(2,10);return`run_${Date.now()}_${e}`},L=`hbut_monopoly`,ke=me(),R=w(),z=document.getElementById(`app`),B=P(),V=De(B),H=I(),U=Date.now(),W=null,G=``,K=``,q=B.className?`class`:`school`;function J(){let e=window.visualViewport?.height||window.innerHeight||document.documentElement.clientHeight;document.documentElement.style.setProperty(`--module-vh`,`${e*.01}px`),Y()}function Y(){typeof window>`u`||window.parent===window||requestAnimationFrame(()=>{let e=Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.body.scrollHeight,document.body.offsetHeight,window.visualViewport?.height||0);window.parent.postMessage({type:`mini-hbut:module-size`,moduleId:L,module_id:L,height:e},`*`)})}function Ae(e){let t=c[e],n=[`tile`,t.type];return e===R.position&&n.push(`current`),e===0&&n.push(`start`),R.investments?.[t.siteId||t.id]&&n.push(`invested`),n.join(` `)}function je(){return R.status===`won`?`三阶段通关`:R.status===`lost`?`经营失衡`:R.pendingEvent?`处理校园事件`:`规划下一回合`}function Me(){return R.status===`won`?`目标全部达成，湖工经营路线完成。`:R.status===`lost`?`资金、精力或压力已越界，需要重新规划。`:R.pendingEvent?R.pendingEvent.description:`目标：${R.targetCredits} 绩点 / ${R.targetInfluence} 影响力 · 综合分 ${pe(R)}`}function Ne(e,t){return t===`stress`?e>=80?`danger`:e>=60?`warn`:`ok`:e<=20?`danger`:e<=40?`warn`:`ok`}function Pe(e,t){return t<=0?0:Math.max(0,Math.min(100,Math.round(e/t*100)))}function X(e,t,n){return`
    <div class="goal-row">
      <span>${e}</span>
      <strong>${t}/${n}</strong>
      <i style="--value: ${Pe(t,n)}%"></i>
    </div>
  `}function Z(e,t,n){return`
    <div class="gauge ${Ne(t,n)}">
      <span>${e}</span>
      <strong>${t}</strong>
      <i style="--value: ${Math.max(0,Math.min(100,t))}%"></i>
    </div>
  `}function Fe(){return c.map((e,t)=>`
    <button class="${Ae(t)}" data-index="${t}" type="button" aria-label="${e.name}">
      <span class="tile-index">${t+1}</span>
      <span class="tile-name">${e.name}</span>
      <span class="tile-type">${e.type===`event`?`事件`:e.type===`study`?`学习`:e.type===`grant`?`补给`:e.type===`card`?`卡牌`:e.type===`rest`?`恢复`:e.type===`fee`?`支出`:`起点`}</span>
    </button>
  `).join(``)}function Ie(){return R.log.map(e=>`<li>${e}</li>`).join(``)}function Le(){if(!R.pendingEvent){let e=c[R.position];return`
      <div class="event-empty">
        <strong>${e.name}</strong>
        <span>${e.description}</span>
      </div>
    `}return`
    <div class="choice-list">
      <strong>${R.pendingEvent.title}</strong>
      ${R.pendingEvent.choices.map(e=>`
            <button class="choice-button" data-choice-id="${e.id}" type="button">
              <span>${e.label}</span>
              <small>${Re(e.effects)}</small>
            </button>
          `).join(``)}
    </div>
  `}function Re(e={}){return[[`coins`,`资金`],[`credits`,`绩点`],[`influence`,`影响力`],[`energy`,`精力`],[`stress`,`压力`]].map(([t,n])=>{let r=Number(e[t]||0);return r?`${n}${r>0?`+`:``}${r}`:``}).filter(Boolean).join(` / `)}function ze(){if(!R.cards.length)return`<span class="empty-note">暂无行动卡</span>`;let e=R.status!==`playing`||R.phase===`choice`;return R.cards.map(t=>`
        <button class="tool-button" data-card-id="${t.id}" type="button" ${e?`disabled`:``}>
          <span>${t.name}</span>
          <small>${t.description||`立即使用`}</small>
        </button>
      `).join(``)}function Be(){return o.map(e=>{let t=R.investments?.[e.id]?.level||0,n=e.cost+t*e.costStep,r=t>=e.maxLevel,i=R.status!==`playing`||R.phase===`choice`||R.coins<n||r;return`
      <button class="tool-button investment-button" data-site-id="${e.id}" type="button" ${i?`disabled`:``}>
        <span>${e.name} Lv.${t}/${e.maxLevel}</span>
        <small>${r?`已满级`:`${n} 资金 · +${e.influence} 影响力`}</small>
      </button>
    `}).join(``)}function Q(e){K=e||``;let t=document.getElementById(`submit-status`);if(t)switch(e){case`uploading`:t.textContent=`正在上传成绩...`,t.className=`submit-status uploading`,t.onclick=null;break;case`success`:t.textContent=`✓ 成绩已上传`,t.className=`submit-status success`,t.onclick=null,setTimeout(()=>{t.classList.contains(`success`)&&(t.textContent=``,t.className=`submit-status`,K=``)},3e3);break;case`failed`:t.textContent=`上传失败，点此重试`,t.className=`submit-status failed`,t.onclick=()=>{He()};break;default:t.textContent=``,t.className=`submit-status`,t.onclick=null}}async function Ve(e){if(!V)return;let t={runId:H,score:pe(R),maxLevel:(R.stageIndex||0)+1,durationMs:Math.max(0,Date.now()-U),moveCount:Number(R.turn||0),endedReason:e,extra:{credits:R.credits,influence:R.influence,coins:R.coins,energy:R.energy,stress:R.stress,stage:R.stageName,stageIndex:R.stageIndex}};W=t,Q(`uploading`);try{await F(B,t),W=null,Q(`success`)}catch(e){console.warn(`[hbut_monopoly] rank submit failed`,e),Q(`failed`)}}async function He(){if(!(!W||!V)){Q(`uploading`);try{await F(B,W),W=null,Q(`success`)}catch(e){console.warn(`[hbut_monopoly] rank retry failed`,e),Q(`failed`)}}}function Ue(){if(!V)return;let e=document.getElementById(`leaderboard-overlay`),t=document.getElementById(`leaderboard-button`),n=document.getElementById(`leaderboard-close`);t?.addEventListener(`click`,()=>{e&&(e.style.display=`flex`),We(q)}),n?.addEventListener(`click`,()=>{e&&(e.style.display=`none`)}),e?.addEventListener(`click`,t=>{t.target===e&&(e.style.display=`none`)}),document.querySelectorAll(`.tab-btn`).forEach(e=>{e.addEventListener(`click`,()=>{document.querySelectorAll(`.tab-btn`).forEach(e=>e.classList.remove(`active`)),e.classList.add(`active`),q=e.dataset.scope||`class`,We(q)})})}async function We(e){let t=document.getElementById(`leaderboard-content`);if(t){t.innerHTML=`<div class="leaderboard-loading">加载中...</div>`;try{let n=await Oe(B,{scope:e,limit:20}),r=n.leaderboard||n.data||[];if(!r.length){t.innerHTML=`<div class="leaderboard-empty">暂无数据</div>`;return}let i=e===`class_total`;t.innerHTML=`<div class="leaderboard-list">${r.map((e,t)=>`<div class="leaderboard-item"><span class="rank-badge">${e.rank||t+1}</span><span class="rank-name">${i?e.class_name||e.className||`未知班级`:e.player_name||e.playerName||e.student_id||`匿名`}</span><span class="rank-score">${i?e.total_score??e.totalScore??0:e.score??0}</span></div>`).join(``)}</div>`}catch(e){t.innerHTML=`<div class="leaderboard-error">加载失败: ${e?.message||`未知错误`}</div>`}}}function Ge(){(R.status===`won`||R.status===`lost`)&&R.status!==G&&(G=R.status,Ve(R.status===`won`?`won`:`lost`))}function $(){Ge(),Ke()}function Ke(){z.innerHTML=`
    <main class="app-shell">
      <section class="metric-strip" aria-label="当前资源">
        <div>
          <span>阶段</span>
          <strong>${R.stageIndex+1}/${i.length}</strong>
        </div>
        <div>
          <span>资金</span>
          <strong>${R.coins}</strong>
        </div>
        <div>
          <span>回合</span>
          <strong>${R.turn}</strong>
        </div>
        <div>
          <span>骰子</span>
          <strong>${R.dice||`-`}</strong>
        </div>
      </section>

      <section class="hero-panel">
        <div>
          <p class="kicker">湖工大富翁 · ${R.stageName}</p>
          <h1>${je()}</h1>
          <p class="status-detail">${Me()}</p>
        </div>
        <div class="goal-card" aria-label="阶段目标">
          ${X(`绩点`,R.credits,R.targetCredits)}
          ${X(`影响力`,R.influence,R.targetInfluence)}
        </div>
      </section>

      <section class="board-panel" aria-label="湖工校园棋盘">
        <div class="board-grid">
          ${Fe()}
        </div>
      </section>

      <section class="resource-panel" aria-label="精力与压力">
        ${Z(`精力`,R.energy,`energy`)}
        ${Z(`压力`,R.stress,`stress`)}
      </section>

      <section class="control-panel">
        <button id="roll-button" class="primary-action" type="button" ${R.status===`playing`&&R.phase===`roll`?``:`disabled`}>
          ${R.pendingEvent?`先处理事件`:`投骰前进`}
        </button>
        <button id="restart-button" class="secondary-action" type="button">重新开始</button>
        ${V?`<button id="leaderboard-button" class="secondary-action" type="button">排行榜</button>`:``}
      </section>

      <div id="submit-status" class="submit-status" aria-live="polite"></div>

      <section class="action-panel" aria-label="回合选择">
        <div class="panel-section event-section">
          ${Le()}
        </div>
        <div class="panel-section">
          <div class="section-heading">
            <strong>行动卡</strong>
            <span>${R.cards.length} 张</span>
          </div>
          <div class="tool-list">${ze()}</div>
        </div>
        <div class="panel-section">
          <div class="section-heading">
            <strong>据点投资</strong>
            <span>${Object.keys(R.investments||{}).length}/${o.length}</span>
          </div>
          <div class="tool-list">${Be()}</div>
        </div>
      </section>

      <section class="log-panel" aria-label="事件记录">
        <div class="section-heading">
          <strong>校园记录</strong>
          <span>${c[R.position].name}</span>
        </div>
        <ol>${Ie()}</ol>
      </section>
    </main>

    ${V?`
    <div class="leaderboard-overlay" id="leaderboard-overlay" style="display:none">
      <div class="leaderboard-modal">
        <div class="leaderboard-header">
          <h2>🏆 排行榜</h2>
          <button class="leaderboard-close" id="leaderboard-close" type="button">&times;</button>
        </div>
        <div class="leaderboard-tabs">
          <button class="tab-btn ${q===`class`?`active`:``}" data-scope="class" type="button">班级榜</button>
          <button class="tab-btn ${q===`school`?`active`:``}" data-scope="school" type="button">全校榜</button>
          <button class="tab-btn ${q===`class_total`?`active`:``}" data-scope="class_total" type="button">班级总分榜</button>
        </div>
        <div class="leaderboard-content" id="leaderboard-content">
          <div class="leaderboard-loading">加载中...</div>
        </div>
      </div>
    </div>`:``}
  `,document.getElementById(`roll-button`)?.addEventListener(`click`,()=>{R=de(R,ke()),$()}),document.getElementById(`restart-button`)?.addEventListener(`click`,()=>{R=fe(),H=I(),U=Date.now(),G=``,W=null,K=``,$()});for(let e of z.querySelectorAll(`[data-choice-id]`))e.addEventListener(`click`,()=>{R=ce(R,e.dataset.choiceId),$()});for(let e of z.querySelectorAll(`[data-card-id]`))e.addEventListener(`click`,()=>{R=le(R,e.dataset.cardId),$()});for(let e of z.querySelectorAll(`[data-site-id]`))e.addEventListener(`click`,()=>{R=ue(R,e.dataset.siteId),$()});Ue(),K&&Q(K),Y()}window.addEventListener(`resize`,J),window.addEventListener(`orientationchange`,J),window.visualViewport?.addEventListener(`resize`,J),`ResizeObserver`in window&&new ResizeObserver(Y).observe(document.documentElement),J(),Ke();