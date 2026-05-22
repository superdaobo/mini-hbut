(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))t(s);new MutationObserver(s=>{for(const l of s)if(l.type==="childList")for(const i of l.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&t(i)}).observe(document,{childList:!0,subtree:!0});function o(s){const l={};return s.integrity&&(l.integrity=s.integrity),s.referrerPolicy&&(l.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?l.credentials="include":s.crossOrigin==="anonymous"?l.credentials="omit":l.credentials="same-origin",l}function t(s){if(s.ep)return;s.ep=!0;const l=o(s);fetch(s.href,l)}})();const g=15,a=Object.freeze({black:"black",white:"white"}),V=Object.freeze({[a.black]:"黑子",[a.white]:"白子"}),U=Object.freeze([[0,1],[1,0],[1,1],[1,-1]]),v=e=>V[e]||"",F=()=>Array.from({length:g},()=>Array.from({length:g},()=>null)),b=(e={})=>({board:F(),currentPlayer:a.black,status:"playing",winner:null,winLine:[],moves:[],lastMove:null,lastError:"",mode:e.mode||"local_two_player",sessionId:e.sessionId||"",players:e.players||null,localPlayer:e.localPlayer||null}),_=(e,n,o)=>e?.[n]?.[o]??null,x=(e,n)=>Number.isInteger(e)&&Number.isInteger(n)&&e>=0&&e<g&&n>=0&&n<g,J=e=>e.map(n=>n.slice()),Y=e=>e===a.black?a.white:a.black,q=(e,n,o,t,s,l)=>{const i=[[n,o]];for(const d of[-1,1]){let c=n+s*d,p=o+l*d;for(;x(c,p)&&_(e,c,p)===t;)i.push([c,p]),c+=s*d,p+=l*d}return i.sort(([d,c],[p,D])=>d===p?c-D:d-p)},G=(e,n,o,t)=>{for(const[s,l]of U){const i=q(e,n,o,t,s,l);if(i.length>=5)return i}return[]},$=(e,n,o,t={})=>{if(!e||e.status!=="playing")return{...e,lastError:"对局已结束，请重新开始"};if(t.player&&t.player!==e.currentPlayer)return{...e,lastError:"未轮到该玩家"};if(Number.isInteger(t.moveIndex)&&t.moveIndex!==e.moves.length)return{...e,lastError:t.moveIndex<e.moves.length?"落子顺序已过期":"落子顺序超前"};if(!x(n,o))return{...e,lastError:"落子位置超出棋盘"};if(_(e.board,n,o))return{...e,lastError:"该位置已有棋子"};const s=e.currentPlayer,l=J(e.board);l[n][o]=s;const i={row:n,col:o,player:s},d=[...e.moves,i],c=G(l,n,o,s);return c.length>=5?{...e,board:l,status:"won",winner:s,winLine:c,moves:d,lastMove:i,lastError:""}:d.length>=g*g?{...e,board:l,status:"draw",winner:null,winLine:[],moves:d,lastMove:i,lastError:""}:{...e,board:l,currentPlayer:Y(s),moves:d,lastMove:i,lastError:""}},k=(e={})=>b({mode:e.mode,sessionId:e.sessionId,players:e.players,localPlayer:e.localPlayer}),K="mini-hbut-gomoku",W="https://esm.sh/trystero/nostr?bundle",E="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",w=e=>String(e||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,16),L=e=>{const n=w(e);return n.length<=4?n:n.replace(/(.{4})/g,"$1-").replace(/-$/,"")},Z=(e=Math.random)=>{let n="";for(let o=0;o<8;o+=1)n+=E[Math.floor(e()*E.length)%E.length];return`HBUT-${n.slice(0,4)}-${n.slice(4)}`},S=(e,n,o=0)=>`${e||"peer"}:${n}:${o}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2,8)}`,P=(e,n)=>{if(!n)return e;const o=Array.isArray(e.appliedMessageIds)?e.appliedMessageIds:[];return o.includes(n)?e:{...e,appliedMessageIds:[...o,n].slice(-120)}},C=(e,n)=>n?e.players?.[a.black]===n?a.black:e.players?.[a.white]===n?a.white:"":"",Q=(e,n)=>({[a.black]:e==="host"?n:"",[a.white]:e==="guest"?n:""}),X=({roomCode:e="",role:n="host",selfPeerId:o=""}={})=>{const t=w(e),s=n==="guest"?a.white:a.black;return{...b({mode:"online_room",sessionId:t,players:Q(n,o),localPlayer:s}),role:n,localPeerId:o,hostPeerId:n==="host"?o:"",remotePeerId:"",onlineStatus:n==="host"?"waiting_peer":"connecting",appliedMessageIds:[],connectionMessage:n==="host"?"房间已创建，等待对手加入。":"正在加入房间，等待房主同步棋盘。"}},ee=(e,n)=>!n||n===e.localPeerId?e:e.role==="guest"?{...e,players:{...e.players,[a.black]:e.players?.[a.black]||n},hostPeerId:e.hostPeerId||n,remotePeerId:n,onlineStatus:"connected",connectionMessage:"已连接房主，等待同步棋盘。"}:{...e,players:{...e.players,[a.white]:e.players?.[a.white]||n},remotePeerId:n,onlineStatus:"connected",connectionMessage:"对手已加入，可以开始对局。"},ne=(e,n)=>!n||n!==e.remotePeerId&&n!==e.hostPeerId?e:{...e,onlineStatus:"peer_left",connectionMessage:"对手已离开，可保留棋局或回到本地双人。"},re=(e,n,o,t="")=>({type:"move",messageId:t||S(o,"move",e.moves.length),roomCode:e.sessionId,row:n.row,col:n.col,player:n.player,moveIndex:e.moves.length,senderId:o}),oe=(e,n,o,t=e.localPeerId)=>{if(e.mode==="online_room"){if(e.onlineStatus!=="connected")return{accepted:!1,state:{...e,lastError:"等待对手连接"},message:null};if(e.currentPlayer!==e.localPlayer)return{accepted:!1,state:{...e,lastError:"等待对手落子"},message:null}}const s=$(e,n,o,{player:e.localPlayer||e.currentPlayer,moveIndex:e.moves.length});if(!(s.moves.length===e.moves.length+1&&!s.lastError))return{accepted:!1,state:s,message:null};const i=re(e,s.lastMove,t);return{accepted:!0,state:P(s,i.messageId),message:i}},te=(e,n={},o="")=>{if(n.messageId&&e.appliedMessageIds?.includes(n.messageId))return{...e,lastError:""};const t=n.senderId||o,s=C(e,t);if(!s||s!==n.player)return{...e,lastError:"玩家身份不匹配"};const l=$(e,Number(n.row),Number(n.col),{player:n.player,moveIndex:Number(n.moveIndex)});return l.lastError?l:P({...l,onlineStatus:"connected",connectionMessage:"对手已落子，轮到你了。"},n.messageId)},se=e=>({board:e.board,currentPlayer:e.currentPlayer,status:e.status,winner:e.winner,winLine:e.winLine,moves:e.moves,lastMove:e.lastMove,players:e.players,sessionId:e.sessionId,hostPeerId:e.hostPeerId,remotePeerId:e.remotePeerId}),le=(e,n=e.localPeerId,o="")=>({type:"snapshot",messageId:S(n,"snapshot",e.moves.length),roomCode:e.sessionId,senderId:n,targetPeerId:o,snapshot:se({...e,players:o&&e.players?.[a.white]!==o?{...e.players,[a.white]:o}:e.players,remotePeerId:o||e.remotePeerId})}),ie=(e,n={},o="")=>{if(n.messageId&&e.appliedMessageIds?.includes(n.messageId))return e;const t=n.snapshot||{},s={...e,board:Array.isArray(t.board)?t.board.map(l=>l.slice()):e.board,currentPlayer:t.currentPlayer||e.currentPlayer,status:t.status||e.status,winner:t.winner||null,winLine:Array.isArray(t.winLine)?t.winLine:[],moves:Array.isArray(t.moves)?t.moves:[],lastMove:t.lastMove||null,players:t.players||e.players,sessionId:w(t.sessionId||n.roomCode||e.sessionId),hostPeerId:t.hostPeerId||n.senderId||o||e.hostPeerId,remotePeerId:n.senderId||o||e.remotePeerId,onlineStatus:"connected",connectionMessage:"棋盘已同步，可以继续对局。",lastError:""};return P(s,n.messageId)},ae=(e,n=e.localPeerId)=>({type:"restart",messageId:S(n,"restart",e.moves.length),roomCode:e.sessionId,senderId:n}),N=e=>({...k(e),role:e.role,localPeerId:e.localPeerId,hostPeerId:e.hostPeerId,remotePeerId:e.remotePeerId,onlineStatus:e.remotePeerId?"connected":e.onlineStatus,connectionMessage:"棋局已重开。",appliedMessageIds:Array.isArray(e.appliedMessageIds)?e.appliedMessageIds:[]}),ce=(e,n={},o="")=>{if(n.messageId&&e.appliedMessageIds?.includes(n.messageId))return e;const t=n.senderId||o;return C(e,t)?P(N(e),n.messageId):{...e,lastError:"玩家身份不匹配"}},de=(e,n=e.localPeerId)=>{const o=ae(e,n);return{state:P(N(e),o.messageId),message:o}},ue=()=>import(W),pe=async({roomCode:e="",importTrystero:n=ue,onEvent:o=()=>{}}={})=>{const t=w(e);if(!t)throw new Error("房间号不能为空");const s=await n(),l=s.joinRoom({appId:K},t),[i,d]=l.makeAction("gomoku");return d((c,p)=>{o({type:"message",message:c,peerId:p})}),l.onPeerJoin(c=>{o({type:"peer_join",peerId:c})}),l.onPeerLeave(c=>{o({type:"peer_leave",peerId:c})}),{roomCode:t,selfPeerId:s.selfId||"",send(c,p){return i(c,p)},close(){l.leave()}}},A="hbut_gomoku";let r=b(),y=null,h="",I=!1,m="";const B=document.getElementById("app");function R(){typeof window>"u"||window.parent===window||requestAnimationFrame(()=>{const e=Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.body.scrollHeight,document.body.offsetHeight,window.visualViewport?.height||0);window.parent.postMessage({type:"mini-hbut:module-size",moduleId:A,module_id:A,height:e},"*")})}function M(){const e=window.visualViewport?.height||window.innerHeight||document.documentElement.clientHeight;document.documentElement.style.setProperty("--module-vh",`${e*.01}px`),R()}function T(e,n){return`${e}:${n}`}function me(){return new Set((r.winLine||[]).map(([e,n])=>T(e,n)))}function f(){return r.mode==="online_room"}function fe(){return f()?r.status==="playing"&&r.onlineStatus==="connected"&&r.currentPlayer===r.localPlayer:r.status==="playing"}function ye(){return f()?r.role==="host"?"联机房主":"联机加入":"本地双人"}function H(){return f()?I?"连接中":r.onlineStatus==="connected"?"已连接":r.onlineStatus==="waiting_peer"?"等待对手":r.onlineStatus==="peer_left"?"对手离开":r.onlineStatus==="failed"?"连接失败":"连接中":"离线可玩"}function ge(){return r.status==="won"?`${v(r.winner)}五连成功`:r.status==="draw"?"棋盘已满，平局":f()&&r.onlineStatus!=="connected"?H():f()&&r.currentPlayer!==r.localPlayer?"等待对手落子":`${v(r.currentPlayer)}落子`}function he(){if(r.status==="won")return f()?"联机对局结束，可发起同步重开。":"本地双人对局结束，可重新开局再战。";if(r.status==="draw")return"没有形成五连，双方平分秋色。";if(m)return m;if(r.lastError)return r.lastError;if(f()&&r.connectionMessage)return r.connectionMessage;if(!r.moves.length)return"点击棋盘棋位落子，先连成五枚即获胜。";const e=r.lastMove;return`上手：${v(e.player)}落在 ${e.row+1} 行 ${e.col+1} 列。`}function ve(){const e=me(),n=[],o=fe();for(let t=0;t<g;t+=1)for(let s=0;s<g;s+=1){const l=r.board[t][s],i=["board-cell"];l&&i.push(l),r.lastMove?.row===t&&r.lastMove?.col===s&&i.push("last"),e.has(T(t,s))&&i.push("win"),n.push(`
        <button
          class="${i.join(" ")}"
          data-row="${t}"
          data-col="${s}"
          type="button"
          aria-label="${t+1} 行 ${s+1} 列${l?`，${v(l)}`:"，空位"}"
          ${!o||l?"disabled":""}
        >
          <span></span>
        </button>
      `)}return n.join("")}function Ie(){return r.moves.length?r.moves.slice(-8).reverse().map((e,n)=>`<li><strong>${r.moves.length-n}</strong><span>${v(e.player)} · ${e.row+1} 行 ${e.col+1} 列</span></li>`).join(""):"<li>等待黑子先手。</li>"}function be(){const e=f()?L(r.sessionId):"",n=f()?v(r.localPlayer)||"旁观":"本地";return`
    <section class="online-panel" aria-label="联机对战">
      <div class="online-summary">
        <div>
          <span>联机</span>
          <strong>${H()}</strong>
        </div>
        <div>
          <span>房间</span>
          <strong>${e||"未连接"}</strong>
        </div>
        <div>
          <span>席位</span>
          <strong>${n}</strong>
        </div>
      </div>
      <div class="room-controls">
        <input
          id="room-input"
          type="text"
          inputmode="latin"
          autocomplete="off"
          maxlength="16"
          placeholder="输入房间号"
          value="${h}"
          aria-label="房间号"
        >
        <button id="create-room-button" class="room-button" type="button" ${I?"disabled":""}>创建</button>
        <button id="join-room-button" class="room-button" type="button" ${I?"disabled":""}>加入</button>
        <button id="local-mode-button" class="room-button muted" type="button">本地</button>
      </div>
    </section>
  `}function u(){B.innerHTML=`
    <main class="app-shell">
      ${be()}

      <section class="score-strip" aria-label="对局状态">
        <div>
          <span>模式</span>
          <strong>${ye()}</strong>
        </div>
        <div>
          <span>手数</span>
          <strong>${r.moves.length}</strong>
        </div>
        <div>
          <span>黑子</span>
          <strong>${r.moves.filter(e=>e.player===a.black).length}</strong>
        </div>
        <div>
          <span>白子</span>
          <strong>${r.moves.filter(e=>e.player===a.white).length}</strong>
        </div>
      </section>

      <section class="status-panel" aria-live="polite">
        <div class="turn-mark ${r.status==="playing"?r.currentPlayer:r.winner||"draw"}"></div>
        <div>
          <p class="eyebrow">湖工五子棋</p>
          <h1>${ge()}</h1>
          <p>${he()}</p>
        </div>
      </section>

      <section class="board-panel" aria-label="十五路五子棋棋盘">
        <div class="board-grid">
          ${ve()}
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
        <ol>${Ie()}</ol>
      </section>
    </main>
  `,we(),R()}function we(){for(const e of B.querySelectorAll("[data-row][data-col]"))e.addEventListener("click",()=>{Pe(Number(e.dataset.row),Number(e.dataset.col))});document.getElementById("restart-button")?.addEventListener("click",Me),document.getElementById("create-room-button")?.addEventListener("click",Ee),document.getElementById("join-room-button")?.addEventListener("click",$e),document.getElementById("local-mode-button")?.addEventListener("click",Le),document.getElementById("room-input")?.addEventListener("input",e=>{h=L(e.target.value),e.target.value=h})}async function O(e,n=r.remotePeerId){if(!(!y||!e))try{await y.send(e,n||void 0)}catch(o){m=`发送失败：${o?.message||"网络不可用"}`,r={...r,onlineStatus:"failed",connectionMessage:m},u()}}function Pe(e,n){if(m="",f()){const o=oe(r,e,n,r.localPeerId);r=o.state,u(),o.accepted&&O(o.message);return}r=$(r,e,n),u()}function Me(){if(m="",f()){const e=de(r,r.localPeerId);r=e.state,u(),O(e.message);return}r=k(),u()}async function z(){if(y){try{y.close()}catch{}y=null}}async function j(e,n){const o=w(n);if(!o){m="请先输入房间号",u();return}I=!0,m="",u();try{await z(),y=await pe({roomCode:o,onEvent:Se}),r=X({roomCode:o,role:e,selfPeerId:y.selfPeerId}),h=L(o)}catch(t){y=null,m=`联机服务不可用：${t?.message||"请稍后重试"}`,r=b()}finally{I=!1,u()}}function Ee(){const e=Z();h=e,j("host",e)}function $e(){j("guest",h)}async function Le(){await z(),I=!1,m="",h="",r=b(),u()}function Se(e){if(!e)return;if(m="",e.type==="peer_join"){r=ee(r,e.peerId),u(),r.role==="host"&&O(le(r,r.localPeerId,e.peerId),e.peerId);return}if(e.type==="peer_leave"){r=ne(r,e.peerId),u();return}if(e.type!=="message")return;const n=e.message||{};n.type==="move"?r=te(r,n,e.peerId):n.type==="snapshot"?r=ie(r,n,e.peerId):n.type==="restart"&&(r=ce(r,n,e.peerId)),u()}window.addEventListener("resize",M);window.addEventListener("orientationchange",M);window.visualViewport?.addEventListener("resize",M);"ResizeObserver"in window&&new ResizeObserver(R).observe(document.documentElement);M();u();
