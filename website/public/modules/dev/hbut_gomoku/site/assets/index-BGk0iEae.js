(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))t(s);new MutationObserver(s=>{for(const l of s)if(l.type==="childList")for(const i of l.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&t(i)}).observe(document,{childList:!0,subtree:!0});function o(s){const l={};return s.integrity&&(l.integrity=s.integrity),s.referrerPolicy&&(l.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?l.credentials="include":s.crossOrigin==="anonymous"?l.credentials="omit":l.credentials="same-origin",l}function t(s){if(s.ep)return;s.ep=!0;const l=o(s);fetch(s.href,l)}})();const g=15,a=Object.freeze({black:"black",white:"white"}),F=Object.freeze({[a.black]:"黑子",[a.white]:"白子"}),Y=Object.freeze([[0,1],[1,0],[1,1],[1,-1]]),I=e=>F[e]||"",J=()=>Array.from({length:g},()=>Array.from({length:g},()=>null)),w=(e={})=>({board:J(),currentPlayer:a.black,status:"playing",winner:null,winLine:[],moves:[],lastMove:null,lastError:"",mode:e.mode||"local_two_player",sessionId:e.sessionId||"",players:e.players||null,localPlayer:e.localPlayer||null}),N=(e,n,o)=>e?.[n]?.[o]??null,C=(e,n)=>Number.isInteger(e)&&Number.isInteger(n)&&e>=0&&e<g&&n>=0&&n<g,q=e=>e.map(n=>n.slice()),G=e=>e===a.black?a.white:a.black,K=(e,n,o,t,s,l)=>{const i=[[n,o]];for(const d of[-1,1]){let c=n+s*d,f=o+l*d;for(;C(c,f)&&N(e,c,f)===t;)i.push([c,f]),c+=s*d,f+=l*d}return i.sort(([d,c],[f,V])=>d===f?c-V:d-f)},W=(e,n,o,t)=>{for(const[s,l]of Y){const i=K(e,n,o,t,s,l);if(i.length>=5)return i}return[]},S=(e,n,o,t={})=>{if(!e||e.status!=="playing")return{...e,lastError:"对局已结束，请重新开始"};if(t.player&&t.player!==e.currentPlayer)return{...e,lastError:"未轮到该玩家"};if(Number.isInteger(t.moveIndex)&&t.moveIndex!==e.moves.length)return{...e,lastError:t.moveIndex<e.moves.length?"落子顺序已过期":"落子顺序超前"};if(!C(n,o))return{...e,lastError:"落子位置超出棋盘"};if(N(e.board,n,o))return{...e,lastError:"该位置已有棋子"};const s=e.currentPlayer,l=q(e.board);l[n][o]=s;const i={row:n,col:o,player:s},d=[...e.moves,i],c=W(l,n,o,s);return c.length>=5?{...e,board:l,status:"won",winner:s,winLine:c,moves:d,lastMove:i,lastError:""}:d.length>=g*g?{...e,board:l,status:"draw",winner:null,winLine:[],moves:d,lastMove:i,lastError:""}:{...e,board:l,currentPlayer:G(s),moves:d,lastMove:i,lastError:""}},k=(e={})=>w({mode:e.mode,sessionId:e.sessionId,players:e.players,localPlayer:e.localPlayer}),Z="mini-hbut-gomoku",Q="https://esm.sh/trystero/nostr?bundle",X=Object.freeze(["wss://relay.damus.io","wss://nos.lol","wss://relay.primal.net","wss://relay.snort.social","wss://nostr.wine","wss://relay.nostr.band"]),L="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",b=e=>String(e||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,16),O=e=>{const n=b(e);return n.length<=4?n:n.replace(/(.{4})/g,"$1-").replace(/-$/,"")},ee=(e=Math.random)=>{let n="";for(let o=0;o<8;o+=1)n+=L[Math.floor(e()*L.length)%L.length];return`HBUT-${n.slice(0,4)}-${n.slice(4)}`},R=(e,n,o=0)=>`${e||"peer"}:${n}:${o}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2,8)}`,P=(e,n)=>{if(!n)return e;const o=Array.isArray(e.appliedMessageIds)?e.appliedMessageIds:[];return o.includes(n)?e:{...e,appliedMessageIds:[...o,n].slice(-120)}},x=(e,n)=>n?e.players?.[a.black]===n?a.black:e.players?.[a.white]===n?a.white:"":"",ne=(e,n)=>({[a.black]:e==="host"?n:"",[a.white]:e==="guest"?n:""}),re=({roomCode:e="",role:n="host",selfPeerId:o=""}={})=>{const t=b(e),s=n==="guest"?a.white:a.black;return{...w({mode:"online_room",sessionId:t,players:ne(n,o),localPlayer:s}),role:n,localPeerId:o,hostPeerId:n==="host"?o:"",remotePeerId:"",onlineStatus:n==="host"?"waiting_peer":"connecting",appliedMessageIds:[],connectionMessage:n==="host"?"房间已创建，等待对手加入。":"正在加入房间，等待房主同步棋盘。"}},oe=(e,n)=>!n||n===e.localPeerId?e:e.role==="guest"?{...e,players:{...e.players,[a.black]:e.players?.[a.black]||n},hostPeerId:e.hostPeerId||n,remotePeerId:n,onlineStatus:"connected",connectionMessage:"已连接房主，等待同步棋盘。"}:{...e,players:{...e.players,[a.white]:e.players?.[a.white]||n},remotePeerId:n,onlineStatus:"connected",connectionMessage:"对手已加入，可以开始对局。"},te=(e,n)=>!n||n!==e.remotePeerId&&n!==e.hostPeerId?e:{...e,onlineStatus:"peer_left",connectionMessage:"对手已离开，可保留棋局或回到本地双人。"},se=e=>({...e,onlineStatus:"failed",connectionMessage:"公共 relay 连接超时，可重试联机或切回本地双人。",lastError:""}),le=(e,n,o,t="")=>({type:"move",messageId:t||R(o,"move",e.moves.length),roomCode:e.sessionId,row:n.row,col:n.col,player:n.player,moveIndex:e.moves.length,senderId:o}),ie=(e,n,o,t=e.localPeerId)=>{if(e.mode==="online_room"){if(e.onlineStatus!=="connected")return{accepted:!1,state:{...e,lastError:"等待对手连接"},message:null};if(e.currentPlayer!==e.localPlayer)return{accepted:!1,state:{...e,lastError:"等待对手落子"},message:null}}const s=S(e,n,o,{player:e.localPlayer||e.currentPlayer,moveIndex:e.moves.length});if(!(s.moves.length===e.moves.length+1&&!s.lastError))return{accepted:!1,state:s,message:null};const i=le(e,s.lastMove,t);return{accepted:!0,state:P(s,i.messageId),message:i}},ae=(e,n={},o="")=>{if(n.messageId&&e.appliedMessageIds?.includes(n.messageId))return{...e,lastError:""};const t=n.senderId||o,s=x(e,t);if(!s||s!==n.player)return{...e,lastError:"玩家身份不匹配"};const l=S(e,Number(n.row),Number(n.col),{player:n.player,moveIndex:Number(n.moveIndex)});return l.lastError?l:P({...l,onlineStatus:"connected",connectionMessage:"对手已落子，轮到你了。"},n.messageId)},ce=e=>({board:e.board,currentPlayer:e.currentPlayer,status:e.status,winner:e.winner,winLine:e.winLine,moves:e.moves,lastMove:e.lastMove,players:e.players,sessionId:e.sessionId,hostPeerId:e.hostPeerId,remotePeerId:e.remotePeerId}),de=(e,n=e.localPeerId,o="")=>({type:"snapshot",messageId:R(n,"snapshot",e.moves.length),roomCode:e.sessionId,senderId:n,targetPeerId:o,snapshot:ce({...e,players:o&&e.players?.[a.white]!==o?{...e.players,[a.white]:o}:e.players,remotePeerId:o||e.remotePeerId})}),ue=(e,n={},o="")=>{if(n.messageId&&e.appliedMessageIds?.includes(n.messageId))return e;const t=n.snapshot||{},s={...e,board:Array.isArray(t.board)?t.board.map(l=>l.slice()):e.board,currentPlayer:t.currentPlayer||e.currentPlayer,status:t.status||e.status,winner:t.winner||null,winLine:Array.isArray(t.winLine)?t.winLine:[],moves:Array.isArray(t.moves)?t.moves:[],lastMove:t.lastMove||null,players:t.players||e.players,sessionId:b(t.sessionId||n.roomCode||e.sessionId),hostPeerId:t.hostPeerId||n.senderId||o||e.hostPeerId,remotePeerId:n.senderId||o||e.remotePeerId,onlineStatus:"connected",connectionMessage:"棋盘已同步，可以继续对局。",lastError:""};return P(s,n.messageId)},pe=(e,n=e.localPeerId)=>({type:"restart",messageId:R(n,"restart",e.moves.length),roomCode:e.sessionId,senderId:n}),B=e=>({...k(e),role:e.role,localPeerId:e.localPeerId,hostPeerId:e.hostPeerId,remotePeerId:e.remotePeerId,onlineStatus:e.remotePeerId?"connected":e.onlineStatus,connectionMessage:"棋局已重开。",appliedMessageIds:Array.isArray(e.appliedMessageIds)?e.appliedMessageIds:[]}),me=(e,n={},o="")=>{if(n.messageId&&e.appliedMessageIds?.includes(n.messageId))return e;const t=n.senderId||o;return x(e,t)?P(B(e),n.messageId):{...e,lastError:"玩家身份不匹配"}},fe=(e,n=e.localPeerId)=>{const o=pe(e,n);return{state:P(B(e),o.messageId),message:o}},ye=()=>import(Q),ge=async({roomCode:e="",importTrystero:n=ye,onEvent:o=()=>{}}={})=>{const t=b(e);if(!t)throw new Error("房间号不能为空");const s=await n(),l=s.joinRoom({appId:Z,relayUrls:X},t),[i,d]=l.makeAction("gomoku");return d((c,f)=>{o({type:"message",message:c,peerId:f})}),l.onPeerJoin(c=>{o({type:"peer_join",peerId:c})}),l.onPeerLeave(c=>{o({type:"peer_leave",peerId:c})}),{roomCode:t,selfPeerId:s.selfId||"",send(c,f){return i(c,f)},close(){l.leave()}}},T="hbut_gomoku",he=18e3;let r=w(),y=null,h="",v=!1,p="",M=0;const z=document.getElementById("app");function _(){typeof window>"u"||window.parent===window||requestAnimationFrame(()=>{const e=Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.body.scrollHeight,document.body.offsetHeight,window.visualViewport?.height||0);window.parent.postMessage({type:"mini-hbut:module-size",moduleId:T,module_id:T,height:e},"*")})}function $(){const e=window.visualViewport?.height||window.innerHeight||document.documentElement.clientHeight;document.documentElement.style.setProperty("--module-vh",`${e*.01}px`),_()}function H(e,n){return`${e}:${n}`}function Ie(){return new Set((r.winLine||[]).map(([e,n])=>H(e,n)))}function m(){return r.mode==="online_room"}function ve(){return m()?r.status==="playing"&&r.onlineStatus==="connected"&&r.currentPlayer===r.localPlayer:r.status==="playing"}function we(){return m()?r.role==="host"?"联机房主":"联机加入":"本地双人"}function j(){return m()?v?"连接中":r.onlineStatus==="connected"?"已连接":r.onlineStatus==="waiting_peer"?"等待对手":r.onlineStatus==="peer_left"?"对手离开":r.onlineStatus==="failed"?"连接失败":"连接中":"离线可玩"}function be(){return r.status==="won"?`${I(r.winner)}五连成功`:r.status==="draw"?"棋盘已满，平局":m()&&r.onlineStatus!=="connected"?j():m()&&r.currentPlayer!==r.localPlayer?"等待对手落子":`${I(r.currentPlayer)}落子`}function Pe(){if(r.status==="won")return m()?"联机对局结束，可发起同步重开。":"本地双人对局结束，可重新开局再战。";if(r.status==="draw")return"没有形成五连，双方平分秋色。";if(p)return p;if(r.lastError)return r.lastError;if(m()&&r.connectionMessage)return r.connectionMessage;if(!r.moves.length)return"点击棋盘棋位落子，先连成五枚即获胜。";const e=r.lastMove;return`上手：${I(e.player)}落在 ${e.row+1} 行 ${e.col+1} 列。`}function Me(){const e=Ie(),n=[],o=ve();for(let t=0;t<g;t+=1)for(let s=0;s<g;s+=1){const l=r.board[t][s],i=["board-cell"];l&&i.push(l),r.lastMove?.row===t&&r.lastMove?.col===s&&i.push("last"),e.has(H(t,s))&&i.push("win"),n.push(`
        <button
          class="${i.join(" ")}"
          data-row="${t}"
          data-col="${s}"
          type="button"
          aria-label="${t+1} 行 ${s+1} 列${l?`，${I(l)}`:"，空位"}"
          ${!o||l?"disabled":""}
        >
          <span></span>
        </button>
      `)}return n.join("")}function Ee(){return r.moves.length?r.moves.slice(-8).reverse().map((e,n)=>`<li><strong>${r.moves.length-n}</strong><span>${I(e.player)} · ${e.row+1} 行 ${e.col+1} 列</span></li>`).join(""):"<li>等待黑子先手。</li>"}function $e(){const e=m()?O(r.sessionId):"",n=m()?I(r.localPlayer)||"旁观":"本地";return`
    <section class="online-panel" aria-label="联机对战">
      <div class="online-summary">
        <div>
          <span>联机</span>
          <strong>${j()}</strong>
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
        <button id="create-room-button" class="room-button" type="button" ${v?"disabled":""}>创建</button>
        <button id="join-room-button" class="room-button" type="button" ${v?"disabled":""}>加入</button>
        <button id="local-mode-button" class="room-button muted" type="button">本地</button>
      </div>
    </section>
  `}function u(){z.innerHTML=`
    <main class="app-shell">
      ${$e()}

      <section class="score-strip" aria-label="对局状态">
        <div>
          <span>模式</span>
          <strong>${we()}</strong>
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
          <h1>${be()}</h1>
          <p>${Pe()}</p>
        </div>
      </section>

      <section class="board-panel" aria-label="十五路五子棋棋盘">
        <div class="board-grid">
          ${Me()}
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
        <ol>${Ee()}</ol>
      </section>
    </main>
  `,Le(),_()}function Le(){for(const e of z.querySelectorAll("[data-row][data-col]"))e.addEventListener("click",()=>{Oe(Number(e.dataset.row),Number(e.dataset.col))});document.getElementById("restart-button")?.addEventListener("click",Re),document.getElementById("create-room-button")?.addEventListener("click",_e),document.getElementById("join-room-button")?.addEventListener("click",Ae),document.getElementById("local-mode-button")?.addEventListener("click",Te),document.getElementById("room-input")?.addEventListener("input",e=>{h=O(e.target.value),e.target.value=h})}async function A(e,n=r.remotePeerId){if(!(!y||!e))try{await y.send(e,n||void 0)}catch(o){p=`发送失败：${o?.message||"网络不可用"}`,r={...r,onlineStatus:"failed",connectionMessage:p},u()}}function E(){M&&(window.clearTimeout(M),M=0)}function Se(){E(),M=window.setTimeout(()=>{!m()||r.onlineStatus==="connected"||(r=se(r),p=r.connectionMessage,u())},he)}function Oe(e,n){if(p="",m()){const o=ie(r,e,n,r.localPeerId);r=o.state,u(),o.accepted&&A(o.message);return}r=S(r,e,n),u()}function Re(){if(p="",m()){const e=fe(r,r.localPeerId);r=e.state,u(),A(e.message);return}r=k(),u()}async function D(){if(E(),!!y){try{y.close()}catch{}y=null}}async function U(e,n){const o=b(n);if(!o){p="请先输入房间号",u();return}v=!0,p="",u();try{await D(),y=await ge({roomCode:o,onEvent:Ne}),r=re({roomCode:o,role:e,selfPeerId:y.selfPeerId}),h=O(o),Se()}catch(t){y=null,p=`联机服务不可用：${t?.message||"请稍后重试"}`,r=w()}finally{v=!1,u()}}function _e(){const e=ee();h=e,U("host",e)}function Ae(){U("guest",h)}async function Te(){await D(),v=!1,p="",h="",r=w(),u()}function Ne(e){if(!e)return;if(p="",e.type==="peer_join"){E(),r=oe(r,e.peerId),u(),r.role==="host"&&A(de(r,r.localPeerId,e.peerId),e.peerId);return}if(e.type==="peer_leave"){r=te(r,e.peerId),u();return}if(e.type!=="message")return;E();const n=e.message||{};n.type==="move"?r=ae(r,n,e.peerId):n.type==="snapshot"?r=ue(r,n,e.peerId):n.type==="restart"&&(r=me(r,n,e.peerId)),u()}window.addEventListener("resize",$);window.addEventListener("orientationchange",$);window.visualViewport?.addEventListener("resize",$);"ResizeObserver"in window&&new ResizeObserver(_).observe(document.documentElement);$();u();
