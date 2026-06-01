(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const t of document.querySelectorAll('link[rel="modulepreload"]'))i(t);new MutationObserver(t=>{for(const s of t)if(s.type==="childList")for(const l of s.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&i(l)}).observe(document,{childList:!0,subtree:!0});function o(t){const s={};return t.integrity&&(s.integrity=t.integrity),t.referrerPolicy&&(s.referrerPolicy=t.referrerPolicy),t.crossOrigin==="use-credentials"?s.credentials="include":t.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function i(t){if(t.ep)return;t.ep=!0;const s=o(t);fetch(t.href,s)}})();const d=15,u=Object.freeze({black:"black",white:"white"}),I=Object.freeze({[u.black]:"黑子",[u.white]:"白子"}),P=Object.freeze([[0,1],[1,0],[1,1],[1,-1]]),m=e=>I[e]||"",M=()=>Array.from({length:d},()=>Array.from({length:d},()=>null)),w=(e={})=>({board:M(),currentPlayer:u.black,status:"playing",winner:null,winLine:[],moves:[],lastMove:null,lastError:"",mode:e.mode||"local_two_player",sessionId:e.sessionId||"",players:e.players||null,localPlayer:e.localPlayer||null}),b=(e,n,o)=>e?.[n]?.[o]??null,E=(e,n)=>Number.isInteger(e)&&Number.isInteger(n)&&e>=0&&e<d&&n>=0&&n<d,O=e=>e.map(n=>n.slice()),N=e=>e===u.black?u.white:u.black,H=(e,n,o,i,t,s)=>{const l=[[n,o]];for(const a of[-1,1]){let c=n+t*a,p=o+s*a;for(;E(c,p)&&b(e,c,p)===i;)l.push([c,p]),c+=t*a,p+=s*a}return l.sort(([a,c],[p,L])=>a===p?c-L:a-p)},S=(e,n,o,i)=>{for(const[t,s]of P){const l=H(e,n,o,i,t,s);if(l.length>=5)return l}return[]},A=(e,n,o,i={})=>{if(!e||e.status!=="playing")return{...e,lastError:"对局已结束，请重新开始"};if(i.player&&i.player!==e.currentPlayer)return{...e,lastError:"未轮到该玩家"};if(Number.isInteger(i.moveIndex)&&i.moveIndex!==e.moves.length)return{...e,lastError:i.moveIndex<e.moves.length?"落子顺序已过期":"落子顺序超前"};if(!E(n,o))return{...e,lastError:"落子位置超出棋盘"};if(b(e.board,n,o))return{...e,lastError:"该位置已有棋子"};const t=e.currentPlayer,s=O(e.board);s[n][o]=t;const l={row:n,col:o,player:t},a=[...e.moves,l],c=S(s,n,o,t);return c.length>=5?{...e,board:s,status:"won",winner:t,winLine:c,moves:a,lastMove:l,lastError:""}:a.length>=d*d?{...e,board:s,status:"draw",winner:null,winLine:[],moves:a,lastMove:l,lastError:""}:{...e,board:s,currentPlayer:N(t),moves:a,lastMove:l,lastError:""}},x=(e={})=>w({mode:e.mode,sessionId:e.sessionId,players:e.players,localPlayer:e.localPlayer}),v="hbut_gomoku";let r=w();const h=document.getElementById("app");function y(){typeof window>"u"||window.parent===window||requestAnimationFrame(()=>{const e=Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.body.scrollHeight,document.body.offsetHeight,window.visualViewport?.height||0);window.parent.postMessage({type:"mini-hbut:module-size",moduleId:v,module_id:v,height:e},"*")})}function f(){const e=window.visualViewport?.height||window.innerHeight||document.documentElement.clientHeight;document.documentElement.style.setProperty("--module-vh",`${e*.01}px`),y()}function $(e,n){return`${e}:${n}`}function z(){return new Set((r.winLine||[]).map(([e,n])=>$(e,n)))}function k(){return r.status==="won"?`${m(r.winner)}五连成功`:r.status==="draw"?"棋盘已满，平局":`${m(r.currentPlayer)}落子`}function B(){if(r.status==="won")return"本地双人对局结束，可重新开局再战。";if(r.status==="draw")return"没有形成五连，双方平分秋色。";if(r.lastError)return r.lastError;if(!r.moves.length)return"点击棋盘棋位落子，先连成五枚即获胜。";const e=r.lastMove;return`上手：${m(e.player)}落在 ${e.row+1} 行 ${e.col+1} 列。`}function _(){const e=z(),n=[];for(let o=0;o<d;o+=1)for(let i=0;i<d;i+=1){const t=r.board[o][i],s=["board-cell"];t&&s.push(t),r.lastMove?.row===o&&r.lastMove?.col===i&&s.push("last"),e.has($(o,i))&&s.push("win"),n.push(`
        <button
          class="${s.join(" ")}"
          data-row="${o}"
          data-col="${i}"
          type="button"
          aria-label="${o+1} 行 ${i+1} 列${t?`，${m(t)}`:"，空位"}"
          ${r.status!=="playing"||t?"disabled":""}
        >
          <span></span>
        </button>
      `)}return n.join("")}function j(){return r.moves.length?r.moves.slice(-8).reverse().map((e,n)=>`<li><strong>${r.moves.length-n}</strong><span>${m(e.player)} · ${e.row+1} 行 ${e.col+1} 列</span></li>`).join(""):"<li>等待黑子先手。</li>"}function g(){h.innerHTML=`
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
          <strong>${r.moves.filter(e=>e.player===u.black).length}</strong>
        </div>
        <div>
          <span>白子</span>
          <strong>${r.moves.filter(e=>e.player===u.white).length}</strong>
        </div>
      </section>

      <section class="status-panel" aria-live="polite">
        <div class="turn-mark ${r.status==="playing"?r.currentPlayer:r.winner||"draw"}"></div>
        <div>
          <p class="eyebrow">湖工五子棋</p>
          <h1>${k()}</h1>
          <p>${B()}</p>
        </div>
      </section>

      <section class="board-panel" aria-label="十五路五子棋棋盘">
        <div class="board-grid">
          ${_()}
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
        <ol>${j()}</ol>
      </section>
    </main>
  `;for(const e of h.querySelectorAll("[data-row][data-col]"))e.addEventListener("click",()=>{r=A(r,Number(e.dataset.row),Number(e.dataset.col)),g()});document.getElementById("restart-button")?.addEventListener("click",()=>{r=x(),g()}),y()}window.addEventListener("resize",f);window.addEventListener("orientationchange",f);window.visualViewport?.addEventListener("resize",f);"ResizeObserver"in window&&new ResizeObserver(y).observe(document.documentElement);f();g();
