(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))a(s);new MutationObserver(s=>{for(const i of s)if(i.type==="childList")for(const l of i.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&a(l)}).observe(document,{childList:!0,subtree:!0});function t(s){const i={};return s.integrity&&(i.integrity=s.integrity),s.referrerPolicy&&(i.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?i.credentials="include":s.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(s){if(s.ep)return;s.ep=!0;const i=t(s);fetch(s.href,i)}})();const M=Object.freeze([Object.freeze({id:"south-lake",label:"南湖",hint:"湖畔晚风",category:"campus"}),Object.freeze({id:"library",label:"图书馆",hint:"书香自习",category:"study"}),Object.freeze({id:"engineering",label:"工程楼",hint:"齿轮与图纸",category:"study"}),Object.freeze({id:"canteen",label:"西区食堂",hint:"热干面补给",category:"life"}),Object.freeze({id:"sports",label:"运动场",hint:"晨跑打卡",category:"life"}),Object.freeze({id:"lab",label:"实验室",hint:"调试到深夜",category:"study"}),Object.freeze({id:"gate",label:"校门",hint:"启程返校",category:"campus"}),Object.freeze({id:"club",label:"社团招新",hint:"摊位与海报",category:"campus"})]),d=Object.freeze([Object.freeze({name:"南湖热身",pairCount:3,timeLeftMs:42e3,previewMs:5200,matchScore:100,comboBonus:70,mismatchPenalty:24,hintMode:"full"}),Object.freeze({name:"图书馆夜读",pairCount:4,timeLeftMs:52e3,previewMs:4100,matchScore:120,comboBonus:82,mismatchPenalty:34,hintMode:"full"}),Object.freeze({name:"工程楼速记",pairCount:6,timeLeftMs:64e3,previewMs:3100,matchScore:145,comboBonus:96,mismatchPenalty:48,hintMode:"category"}),Object.freeze({name:"社团招新终局",pairCount:8,timeLeftMs:78e3,previewMs:2300,matchScore:170,comboBonus:112,mismatchPenalty:64,hintMode:"minimal"})]),k=0,y=6,O=e=>({...e}),f=e=>({...e}),E=e=>({...e,cards:e.cards.map(O),pairs:e.pairs.map(f),allPairs:e.allPairs.map(f),selectedCardIds:[...e.selectedCardIds],pendingMismatch:e.pendingMismatch?[...e.pendingMismatch]:null,log:[...e.log]}),N=(e,n,t)=>Math.max(n,Math.min(t,e)),c=(e,n)=>Number.isFinite(e)?e:n,_=e=>{const n=N(Number.isFinite(e)?Math.trunc(e):k,0,d.length-1);return{index:n,level:d[n]}},T=(e=1)=>{let n=Math.abs(Math.trunc(e))||1;return()=>(n=n*48271%2147483647,n/2147483647)},B=(e,n)=>{const t=T(n),a=e.map(O);for(let s=a.length-1;s>0;s-=1){const i=Math.floor(t()*(s+1)),l=a[s];a[s]=a[i],a[i]=l}return a},D=(e,n=!1)=>e.flatMap(t=>[{id:`${t.id}-a`,pairId:t.id,label:t.label,hint:t.hint,category:t.category,revealed:n,matched:!1},{id:`${t.id}-b`,pairId:t.id,label:t.label,hint:t.hint,category:t.category,revealed:n,matched:!1}]);function w(e={}){const n=Array.isArray(e.pairs)?e.pairs:M,{index:t,level:a}=_(e.levelIndex),s=Number.isFinite(e.pairCount)?Math.trunc(e.pairCount):a.pairCount,i=N(s,2,n.length),l=Math.max(0,c(e.timeLeftMs,a.timeLeftMs)),g=Math.max(0,c(e.previewLeftMs,a.previewMs)),x=e.status||(g>0?"preview":"playing"),F=x==="preview"&&g>0,L=n.slice(0,i).map(f),$=D(L,F),S=c(e.seed,t+1),C=e.shuffle!==!1,H=C?B($,S):$;return{status:x,levelIndex:t,levelNumber:t+1,levelName:a.name,totalLevels:d.length,hintMode:a.hintMode,timeLimitMs:l,timeLeftMs:l,previewLeftMs:g,moves:c(e.moves,0),matchedPairs:0,startedAt:Number.isFinite(e.startedAt)?e.startedAt:0,elapsedMs:Number.isFinite(e.elapsedMs)?e.elapsedMs:0,score:Math.max(0,c(e.score,0)),combo:Math.max(0,c(e.combo,0)),mistakes:Math.max(0,c(e.mistakes,0)),pairs:L,allPairs:n.map(f),cards:H,selectedCardIds:[],pendingMismatch:null,seed:S,shuffle:C,log:e.log?[...e.log].slice(0,y):[`第 ${t+1} 关：${a.name}，先记住牌面位置。`]}}function R(e,n={}){var a;const t=(a=e==null?void 0:e.allPairs)!=null&&a.length?e.allPairs:M;return w({pairs:t,levelIndex:Number.isFinite(n.levelIndex)?n.levelIndex:0,seed:n.seed||1,shuffle:n.shuffle})}function V(e){if(!e.pendingMismatch)return;const n=new Set(e.pendingMismatch);for(const t of e.cards)n.has(t.id)&&!t.matched&&(t.revealed=!1);e.pendingMismatch=null,e.selectedCardIds=[]}function U(e,n){n.revealed=!0,e.selectedCardIds.push(n.id)}function G(e){e.log=e.log.slice(0,y)}function u(e,n){e.log.unshift(n),G(e)}function X(e){const n=d[e.levelIndex],t=e.combo+1;return n.matchScore+n.comboBonus*t}function Y(e){const n=e.levelIndex+1,t=w({pairs:e.allPairs,levelIndex:n,score:e.score,seed:e.seed+101,shuffle:e.shuffle});return t.log=[`进入第 ${t.levelNumber} 关：${t.levelName}`,...e.log].slice(0,y),t}function K(e){if(e.selectedCardIds.length<2)return;const n=e.selectedCardIds.map(s=>e.cards.find(i=>i.id===s)),[t,a]=n;if(!(!t||!a)){if(e.moves+=1,t.pairId===a.pairId){t.matched=!0,a.matched=!0,e.matchedPairs+=1;const s=X(e);e.combo+=1,e.score+=s,u(e,`连击 ${e.combo}：${t.label} +${s}`),e.selectedCardIds=[],e.pendingMismatch=null}else e.pendingMismatch=[t.id,a.id],e.mistakes+=1,e.combo=0,e.score=Math.max(0,e.score-d[e.levelIndex].mismatchPenalty),u(e,`错配 ${e.mistakes} 次：${t.label} 和 ${a.label}`);if(e.matchedPairs>=e.pairs.length){if(e.levelIndex<d.length-1)return Y(e);e.status="won",e.score+=Math.ceil(e.timeLeftMs/1e3)*12,u(e,`全部通关，共 ${e.moves} 步，剩余时间已折算奖励。`)}return e}}function J(e,n){const t=E(e);if(t.status!=="playing")return t;V(t);const a=t.cards.find(s=>s.id===n);return!a||a.revealed||a.matched?t:(U(t,a),K(t)||t)}function Q(e,n){const t=E(e),a=Math.max(0,Number.isFinite(n)?n:0);if(t.status==="preview"){if(t.previewLeftMs=Math.max(0,t.previewLeftMs-a),t.previewLeftMs===0){for(const s of t.cards)s.matched||(s.revealed=!1);t.status="playing",u(t,`第 ${t.levelNumber} 关开始，倒计时 ${Math.ceil(t.timeLeftMs/1e3)} 秒。`)}return t}return t.status==="playing"&&(t.elapsedMs+=a,t.timeLeftMs=Math.max(0,t.timeLeftMs-a),t.timeLeftMs===0&&(t.status="lost",t.combo=0,t.selectedCardIds=[],t.pendingMismatch=null,u(t,`时间耗尽：停在第 ${t.levelNumber} 关。`))),t}const I="hbut_memory_match",o=document.getElementById("app");let r=w({levelIndex:0,seed:9}),v=performance.now();function m(){var n;const e=((n=window.visualViewport)==null?void 0:n.height)||window.innerHeight||document.documentElement.clientHeight;document.documentElement.style.setProperty("--module-vh",`${e*.01}px`),q()}function q(){typeof window>"u"||window.parent===window||requestAnimationFrame(()=>{var n;const e=Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.body.scrollHeight,document.body.offsetHeight,((n=window.visualViewport)==null?void 0:n.height)||0);window.parent.postMessage({type:"mini-hbut:module-size",moduleId:I,module_id:I,height:e},"*")})}function h(e){const n=Math.max(0,Math.ceil(e/1e3)),t=Math.floor(n/60);return`${String(t).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`}function z(){return r.status==="preview"?"记住牌面位置":r.status==="won"?"四关全部通关":r.status==="lost"?"时间耗尽":r.pendingMismatch?"记住位置，继续翻牌":r.selectedCardIds.length===1?"再翻一张试试":"翻开校园记忆"}function j(){return r.status==="preview"?`预览剩余 ${h(r.previewLeftMs)}`:r.status==="won"?`最终得分 ${r.score}`:r.status==="lost"?`停在第 ${r.levelNumber} 关，得分 ${r.score}`:`剩余 ${h(r.timeLeftMs)}，错配 ${r.mistakes} 次`}function b(e){return e==="study"?"学习":e==="life"?"生活":"校园"}function W(e){var t;const n=["memory-card",e.category];return(e.revealed||e.matched)&&n.push("revealed"),e.matched&&n.push("matched"),(t=r.pendingMismatch)!=null&&t.includes(e.id)&&n.push("mismatch"),n.join(" ")}function Z(e){return r.status==="preview"?e.hint:r.hintMode==="minimal"&&!e.matched?"线索隐藏":r.hintMode==="category"&&!e.matched?b(e.category):e.hint}function ee(){return r.cards.map(e=>`
        <button class="${W(e)}" type="button" data-card-id="${e.id}" aria-label="${e.label}" ${r.status!=="playing"?"disabled":""}>
          <span class="card-back">
            <strong>HBUT</strong>
            <small>${r.levelNumber}-${b(e.category)}</small>
          </span>
          <span class="card-front">
            <strong>${e.label}</strong>
            <small>${Z(e)}</small>
            <em>${b(e.category)}</em>
          </span>
        </button>
      `).join("")}function te(){return r.log.map(e=>`<li>${e}</li>`).join("")}function p(){o.querySelector("[data-level]").textContent=`${r.levelNumber}/${r.totalLevels}`,o.querySelector("[data-pairs]").textContent=`${r.matchedPairs}/${r.pairs.length}`,o.querySelector("[data-time]").textContent=r.status==="preview"?h(r.previewLeftMs):h(r.timeLeftMs),o.querySelector("[data-score]").textContent=String(r.score),o.querySelector("[data-combo]").textContent=`x${r.combo}`,o.querySelector("[data-mistakes]").textContent=String(r.mistakes),o.querySelector("[data-level-name]").textContent=r.levelName,o.querySelector("[data-detail]").textContent=j(),o.querySelector("[data-progress]").textContent=r.hintMode==="minimal"?"隐藏线索":`${r.pairs.length} 组校园记忆`,o.querySelector("[data-log-scope]").textContent=`${r.pairs.length} 组校园记忆`,o.querySelector("[data-status]").textContent=z(),o.querySelector("[data-board]").innerHTML=ee(),o.querySelector("[data-log]").innerHTML=te(),o.querySelector("[data-remaining]").textContent=`${r.cards.length-r.matchedPairs*2} 张未配对`,o.querySelector("[data-restart-label]").textContent=r.status==="lost"?"再挑战":"重新开始";for(const e of o.querySelectorAll("[data-card-id]"))e.addEventListener("click",()=>{r=J(r,e.dataset.cardId),p()});q()}function ne(){var e;o.innerHTML=`
    <main class="memory-shell">
      <section class="metric-strip" aria-label="记忆牌状态">
        <div>
          <span>关卡</span>
          <strong data-level>1/${d.length}</strong>
        </div>
        <div>
          <span>配对</span>
          <strong data-pairs>0/${M.length}</strong>
        </div>
        <div>
          <span>倒计时</span>
          <strong data-time>00:00</strong>
        </div>
        <div>
          <span>得分</span>
          <strong data-score>0</strong>
        </div>
      </section>

      <section class="hero-panel">
        <div>
          <p class="kicker">湖工记忆牌 · <span data-level-name>${r.levelName}</span></p>
          <h1 data-status>${z()}</h1>
          <p class="status-detail" data-detail>${j()}</p>
        </div>
        <div class="count-card">
          <span data-progress>${r.pairs.length} 组校园记忆</span>
          <strong data-remaining>${r.cards.length} 张</strong>
        </div>
      </section>

      <section class="board-panel" aria-label="湖工记忆牌牌桌">
        <div class="memory-grid" data-board></div>
      </section>

      <section class="control-panel">
        <div class="quick-stats" aria-label="当前表现">
          <span>连击 <strong data-combo>x0</strong></span>
          <span>错配 <strong data-mistakes>0</strong></span>
        </div>
        <button id="restart-button" class="primary-action" type="button"><span data-restart-label>重新开始</span></button>
      </section>

      <section class="log-panel" aria-label="配对记录">
        <div class="log-heading">
          <strong>配对记录</strong>
          <span data-log-scope>${r.pairs.length} 组校园记忆</span>
        </div>
        <ol data-log></ol>
      </section>
    </main>
  `,(e=document.getElementById("restart-button"))==null||e.addEventListener("click",()=>{r=R(r,{levelIndex:0,seed:Date.now()%1e5}),v=performance.now(),p()}),p()}function A(e){const n=e-v;v=e;const t=r.status,a=r.status==="preview"?Math.ceil(r.previewLeftMs/1e3):Math.ceil(r.timeLeftMs/1e3);r=Q(r,n);const s=r.status==="preview"?Math.ceil(r.previewLeftMs/1e3):Math.ceil(r.timeLeftMs/1e3);(r.status!==t||s!==a)&&p(),requestAnimationFrame(A)}window.addEventListener("resize",m);window.addEventListener("orientationchange",m);var P;(P=window.visualViewport)==null||P.addEventListener("resize",m);"ResizeObserver"in window&&new ResizeObserver(m).observe(document.documentElement);ne();m();requestAnimationFrame(A);
