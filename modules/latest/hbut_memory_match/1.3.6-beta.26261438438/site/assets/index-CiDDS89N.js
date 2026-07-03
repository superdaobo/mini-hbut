(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))a(r);new MutationObserver(r=>{for(const s of r)if(s.type==="childList")for(const d of s.addedNodes)d.tagName==="LINK"&&d.rel==="modulepreload"&&a(d)}).observe(document,{childList:!0,subtree:!0});function n(r){const s={};return r.integrity&&(s.integrity=r.integrity),r.referrerPolicy&&(s.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?s.credentials="include":r.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function a(r){if(r.ep)return;r.ep=!0;const s=n(r);fetch(r.href,s)}})();const f=Object.freeze([Object.freeze({id:"south-lake",label:"南湖",hint:"湖畔晚风",category:"campus"}),Object.freeze({id:"library",label:"图书馆",hint:"书香自习",category:"study"}),Object.freeze({id:"engineering",label:"工程楼",hint:"齿轮与图纸",category:"study"}),Object.freeze({id:"canteen",label:"西区食堂",hint:"热干面补给",category:"life"}),Object.freeze({id:"sports",label:"运动场",hint:"晨跑打卡",category:"life"}),Object.freeze({id:"lab",label:"实验室",hint:"调试到深夜",category:"study"}),Object.freeze({id:"gate",label:"校门",hint:"启程返校",category:"campus"}),Object.freeze({id:"club",label:"社团招新",hint:"摊位与海报",category:"campus"})]),S=6,p=e=>({...e}),g=e=>({...e}),y=e=>({...e,cards:e.cards.map(p),pairs:e.pairs.map(g),selectedCardIds:[...e.selectedCardIds],pendingMismatch:e.pendingMismatch?[...e.pendingMismatch]:null,log:[...e.log]}),$=(e=1)=>{let t=Math.abs(Math.trunc(e))||1;return()=>(t=t*48271%2147483647,t/2147483647)},I=(e,t)=>{const n=$(t),a=e.map(p);for(let r=a.length-1;r>0;r-=1){const s=Math.floor(n()*(r+1)),d=a[r];a[r]=a[s],a[s]=d}return a},O=e=>e.flatMap(t=>[{id:`${t.id}-a`,pairId:t.id,label:t.label,hint:t.hint,category:t.category,revealed:!1,matched:!1},{id:`${t.id}-b`,pairId:t.id,label:t.label,hint:t.hint,category:t.category,revealed:!1,matched:!1}]);function b(e={}){const t=Array.isArray(e.pairs)?e.pairs:f,n=Math.max(2,Math.min(e.pairCount||S,t.length)),a=t.slice(0,n).map(g),r=O(a),s=e.shuffle===!1?r:I(r,e.seed||1);return{status:"playing",moves:0,matchedPairs:0,startedAt:Number.isFinite(e.startedAt)?e.startedAt:0,elapsedMs:Number.isFinite(e.elapsedMs)?e.elapsedMs:0,pairs:a,cards:s,selectedCardIds:[],pendingMismatch:null,log:["翻开两张湖工记忆牌，找出同一组校园记忆。"]}}function x(e,t={}){var a;const n=(a=e==null?void 0:e.pairs)!=null&&a.length?e.pairs:f;return b({pairs:n,pairCount:n.length,seed:t.seed||1,shuffle:t.shuffle})}function E(e){if(!e.pendingMismatch)return;const t=new Set(e.pendingMismatch);for(const n of e.cards)t.has(n.id)&&!n.matched&&(n.revealed=!1);e.pendingMismatch=null,e.selectedCardIds=[]}function L(e,t){t.revealed=!0,e.selectedCardIds.push(t.id)}function P(e){if(e.selectedCardIds.length<2)return;const t=e.selectedCardIds.map(r=>e.cards.find(s=>s.id===r)),[n,a]=t;!n||!a||(e.moves+=1,n.pairId===a.pairId?(n.matched=!0,a.matched=!0,e.matchedPairs+=1,e.log.unshift(`配对成功：${n.label}，${n.hint}`),e.selectedCardIds=[],e.pendingMismatch=null):(e.pendingMismatch=[n.id,a.id],e.log.unshift(`暂未匹配：${n.label} 和 ${a.label}`)),e.log=e.log.slice(0,5),e.matchedPairs>=e.pairs.length&&(e.status="won",e.log.unshift(`全部配对完成，共 ${e.moves} 步。`)))}function z(e,t){const n=y(e);if(n.status!=="playing")return n;E(n);const a=n.cards.find(r=>r.id===t);return!a||a.revealed||a.matched||(L(n,a),P(n)),n}function A(e,t){const n=y(e);return n.status==="playing"&&(n.elapsedMs+=Math.max(0,Number.isFinite(t)?t:0)),n}const m="hbut_memory_match",o=document.getElementById("app");let i=b({pairCount:6,seed:9}),l=performance.now();function c(){var t;const e=((t=window.visualViewport)==null?void 0:t.height)||window.innerHeight||document.documentElement.clientHeight;document.documentElement.style.setProperty("--module-vh",`${e*.01}px`),v()}function v(){typeof window>"u"||window.parent===window||requestAnimationFrame(()=>{var t;const e=Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.body.scrollHeight,document.body.offsetHeight,((t=window.visualViewport)==null?void 0:t.height)||0);window.parent.postMessage({type:"mini-hbut:module-size",moduleId:m,module_id:m,height:e},"*")})}function M(e){const t=Math.floor(e/1e3),n=Math.floor(t/60);return`${String(n).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`}function w(){return i.status==="won"?"全部配对完成":i.pendingMismatch?"记住位置，继续翻牌":i.selectedCardIds.length===1?"再翻一张试试":"翻开校园记忆"}function q(e){return e==="study"?"学习":e==="life"?"生活":"校园"}function H(e){const t=["memory-card",e.category];return(e.revealed||e.matched)&&t.push("revealed"),e.matched&&t.push("matched"),t.join(" ")}function j(){return i.cards.map(e=>`
        <button class="${H(e)}" type="button" data-card-id="${e.id}" aria-label="${e.label}">
          <span class="card-back">HBUT</span>
          <span class="card-front">
            <strong>${e.label}</strong>
            <small>${e.hint}</small>
            <em>${q(e.category)}</em>
          </span>
        </button>
      `).join("")}function F(){return i.log.map(e=>`<li>${e}</li>`).join("")}function u(){o.querySelector("[data-moves]").textContent=String(i.moves),o.querySelector("[data-pairs]").textContent=`${i.matchedPairs}/${i.pairs.length}`,o.querySelector("[data-time]").textContent=M(i.elapsedMs),o.querySelector("[data-status]").textContent=w(),o.querySelector("[data-board]").innerHTML=j(),o.querySelector("[data-log]").innerHTML=F(),o.querySelector("[data-remaining]").textContent=`${i.cards.length-i.matchedPairs*2} 张未配对`;for(const e of o.querySelectorAll("[data-card-id]"))e.addEventListener("click",()=>{i=z(i,e.dataset.cardId),u()});v()}function T(){var e;o.innerHTML=`
    <main class="memory-shell">
      <section class="metric-strip" aria-label="记忆牌状态">
        <div>
          <span>步数</span>
          <strong data-moves>0</strong>
        </div>
        <div>
          <span>配对</span>
          <strong data-pairs>0/${f.length}</strong>
        </div>
        <div>
          <span>用时</span>
          <strong data-time>00:00</strong>
        </div>
      </section>

      <section class="hero-panel">
        <div>
          <p class="kicker">湖工记忆牌</p>
          <h1 data-status>${w()}</h1>
        </div>
        <div class="count-card">
          <span>牌组</span>
          <strong data-remaining>${i.cards.length} 张</strong>
        </div>
      </section>

      <section class="board-panel" aria-label="湖工记忆牌牌桌">
        <div class="memory-grid" data-board></div>
      </section>

      <section class="control-panel">
        <button id="restart-button" class="primary-action" type="button">重新开始</button>
      </section>

      <section class="log-panel" aria-label="配对记录">
        <div class="log-heading">
          <strong>配对记录</strong>
          <span>${i.pairs.length} 组校园记忆</span>
        </div>
        <ol data-log></ol>
      </section>
    </main>
  `,(e=document.getElementById("restart-button"))==null||e.addEventListener("click",()=>{i=x(i,{seed:Date.now()%1e5}),l=performance.now(),u()}),u()}function C(e){const t=e-l;l=e;const n=Math.floor(i.elapsedMs/1e3);i=A(i,t),Math.floor(i.elapsedMs/1e3)!==n&&(o.querySelector("[data-time]").textContent=M(i.elapsedMs)),requestAnimationFrame(C)}window.addEventListener("resize",c);window.addEventListener("orientationchange",c);var h;(h=window.visualViewport)==null||h.addEventListener("resize",c);"ResizeObserver"in window&&new ResizeObserver(c).observe(document.documentElement);T();c();requestAnimationFrame(C);
