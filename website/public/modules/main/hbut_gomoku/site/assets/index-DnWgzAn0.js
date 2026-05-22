(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const t of document.querySelectorAll('link[rel="modulepreload"]'))i(t);new MutationObserver(t=>{for(const s of t)if(s.type==="childList")for(const a of s.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&i(a)}).observe(document,{childList:!0,subtree:!0});function o(t){const s={};return t.integrity&&(s.integrity=t.integrity),t.referrerPolicy&&(s.referrerPolicy=t.referrerPolicy),t.crossOrigin==="use-credentials"?s.credentials="include":t.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function i(t){if(t.ep)return;t.ep=!0;const s=o(t);fetch(t.href,s)}})();const u=15,c=Object.freeze({black:"black",white:"white"}),M=Object.freeze({[c.black]:"黑子",[c.white]:"白子"}),O=Object.freeze([[0,1],[1,0],[1,1],[1,-1]]),f=e=>M[e]||"",P=()=>Array.from({length:u},()=>Array.from({length:u},()=>null)),b=()=>({board:P(),currentPlayer:c.black,status:"playing",winner:null,winLine:[],moves:[],lastMove:null,lastError:"",mode:"local_two_player"}),y=(e,n,o)=>e?.[n]?.[o]??null,$=(e,n)=>Number.isInteger(e)&&Number.isInteger(n)&&e>=0&&e<u&&n>=0&&n<u,I=e=>e.map(n=>n.slice()),H=e=>e===c.black?c.white:c.black,N=(e,n,o,i,t,s)=>{const a=[[n,o]];for(const l of[-1,1]){let p=n+t*l,d=o+s*l;for(;$(p,d)&&y(e,p,d)===i;)a.push([p,d]),p+=t*l,d+=s*l}return a.sort(([l,p],[d,L])=>l===d?p-L:l-d)},S=(e,n,o,i)=>{for(const[t,s]of O){const a=N(e,n,o,i,t,s);if(a.length>=5)return a.slice(0,5)}return[]},A=(e,n,o)=>{if(!e||e.status!=="playing")return{...e,lastError:"对局已结束，请重新开始"};if(!$(n,o))return{...e,lastError:"落子位置超出棋盘"};if(y(e.board,n,o))return{...e,lastError:"该位置已有棋子"};const i=e.currentPlayer,t=I(e.board);t[n][o]=i;const s={row:n,col:o,player:i},a=[...e.moves,s],l=S(t,n,o,i);return l.length>=5?{...e,board:t,status:"won",winner:i,winLine:l,moves:a,lastMove:s,lastError:""}:a.length>=u*u?{...e,board:t,status:"draw",winner:null,winLine:[],moves:a,lastMove:s,lastError:""}:{...e,board:t,currentPlayer:H(i),moves:a,lastMove:s,lastError:""}},z=()=>b(),h="hbut_gomoku";let r=b();const v=document.getElementById("app");function w(){typeof window>"u"||window.parent===window||requestAnimationFrame(()=>{const e=Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.body.scrollHeight,document.body.offsetHeight,window.visualViewport?.height||0);window.parent.postMessage({type:"mini-hbut:module-size",moduleId:h,module_id:h,height:e},"*")})}function m(){const e=window.visualViewport?.height||window.innerHeight||document.documentElement.clientHeight;document.documentElement.style.setProperty("--module-vh",`${e*.01}px`),w()}function E(e,n){return`${e}:${n}`}function k(){return new Set((r.winLine||[]).map(([e,n])=>E(e,n)))}function B(){return r.status==="won"?`${f(r.winner)}五连成功`:r.status==="draw"?"棋盘已满，平局":`${f(r.currentPlayer)}落子`}function _(){if(r.status==="won")return"本地双人对局结束，可重新开局再战。";if(r.status==="draw")return"没有形成五连，双方平分秋色。";if(r.lastError)return r.lastError;if(!r.moves.length)return"点击棋盘交叉点落子，先连成五枚即获胜。";const e=r.lastMove;return`上手：${f(e.player)}落在 ${e.row+1} 行 ${e.col+1} 列。`}function j(){const e=k(),n=[];for(let o=0;o<u;o+=1)for(let i=0;i<u;i+=1){const t=r.board[o][i],s=["board-cell"];t&&s.push(t),r.lastMove?.row===o&&r.lastMove?.col===i&&s.push("last"),e.has(E(o,i))&&s.push("win"),n.push(`
        <button
          class="${s.join(" ")}"
          data-row="${o}"
          data-col="${i}"
          type="button"
          aria-label="${o+1} 行 ${i+1} 列${t?`，${f(t)}`:"，空位"}"
          ${r.status!=="playing"||t?"disabled":""}
        >
          <span></span>
        </button>
      `)}return n.join("")}function D(){return r.moves.length?r.moves.slice(-8).reverse().map((e,n)=>`<li><strong>${r.moves.length-n}</strong><span>${f(e.player)} · ${e.row+1} 行 ${e.col+1} 列</span></li>`).join(""):"<li>等待黑子先手。</li>"}function g(){v.innerHTML=`
    <main class="app-shell">
      <section class="score-strip" aria-label="对局状态">
        <div>
          <span>模式</span>
          <strong>本地双人</strong>
        </div>
        <div>
          <span>手数</span>
          <strong>${r.moves.length}</strong>
        </div>
        <div>
          <span>黑子</span>
          <strong>${r.moves.filter(e=>e.player===c.black).length}</strong>
        </div>
        <div>
          <span>白子</span>
          <strong>${r.moves.filter(e=>e.player===c.white).length}</strong>
        </div>
      </section>

      <section class="status-panel" aria-live="polite">
        <div class="turn-mark ${r.status==="playing"?r.currentPlayer:r.winner||"draw"}"></div>
        <div>
          <p class="eyebrow">湖工五子棋</p>
          <h1>${B()}</h1>
          <p>${_()}</p>
        </div>
      </section>

      <section class="board-panel" aria-label="十五路五子棋棋盘">
        <div class="board-grid">
          ${j()}
        </div>
      </section>

      <section class="control-panel">
        <button id="restart-button" class="primary-action" type="button">重新开局</button>
        <div class="legend" aria-label="棋子说明">
          <span><i class="stone black"></i>黑子先手</span>
          <span><i class="stone white"></i>白子后手</span>
        </div>
      </section>

      <section class="history-panel" aria-label="最近落子">
        <div class="section-heading">
          <strong>最近落子</strong>
          <span>${r.status==="playing"?"对局中":"已结束"}</span>
        </div>
        <ol>${D()}</ol>
      </section>
    </main>
  `;for(const e of v.querySelectorAll("[data-row][data-col]"))e.addEventListener("click",()=>{r=A(r,Number(e.dataset.row),Number(e.dataset.col)),g()});document.getElementById("restart-button")?.addEventListener("click",()=>{r=z(),g()}),w()}window.addEventListener("resize",m);window.addEventListener("orientationchange",m);window.visualViewport?.addEventListener("resize",m);"ResizeObserver"in window&&new ResizeObserver(w).observe(document.documentElement);m();g();
