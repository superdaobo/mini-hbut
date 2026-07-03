(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))s(o);new MutationObserver(o=>{for(const l of o)if(l.type==="childList")for(const i of l.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&s(i)}).observe(document,{childList:!0,subtree:!0});function r(o){const l={};return o.integrity&&(l.integrity=o.integrity),o.referrerPolicy&&(l.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?l.credentials="include":o.crossOrigin==="anonymous"?l.credentials="omit":l.credentials="same-origin",l}function s(o){if(o.ep)return;o.ep=!0;const l=r(o);fetch(o.href,l)}})();const I=15,u=Object.freeze({black:"black",white:"white"}),X=Object.freeze({[u.black]:"黑子",[u.white]:"白子"}),ee=Object.freeze([[0,1],[1,0],[1,1],[1,-1]]),v=e=>X[e]||"",ne=()=>Array.from({length:I},()=>Array.from({length:I},()=>null)),$=(e={})=>({board:ne(),currentPlayer:u.black,status:"playing",winner:null,winLine:[],moves:[],lastMove:null,lastError:"",mode:e.mode||"local_two_player",sessionId:e.sessionId||"",players:e.players||null,localPlayer:e.localPlayer||null}),Y=(e,n,r)=>{var s;return((s=e==null?void 0:e[n])==null?void 0:s[r])??null},V=(e,n)=>Number.isInteger(e)&&Number.isInteger(n)&&e>=0&&e<I&&n>=0&&n<I,re=e=>e.map(n=>n.slice()),te=e=>e===u.black?u.white:u.black,oe=(e,n,r,s,o,l)=>{const i=[[n,r]];for(const a of[-1,1]){let c=n+o*a,f=r+l*a;for(;V(c,f)&&Y(e,c,f)===s;)i.push([c,f]),c+=o*a,f+=l*a}return i.sort(([a,c],[f,g])=>a===f?c-g:a-f)},se=(e,n,r,s)=>{for(const[o,l]of ee){const i=oe(e,n,r,s,o,l);if(i.length>=5)return i}return[]},A=(e,n,r,s={})=>{if(!e||e.status!=="playing")return{...e,lastError:"对局已结束，请重新开始"};if(s.player&&s.player!==e.currentPlayer)return{...e,lastError:"未轮到该玩家"};if(Number.isInteger(s.moveIndex)&&s.moveIndex!==e.moves.length)return{...e,lastError:s.moveIndex<e.moves.length?"落子顺序已过期":"落子顺序超前"};if(!V(n,r))return{...e,lastError:"落子位置超出棋盘"};if(Y(e.board,n,r))return{...e,lastError:"该位置已有棋子"};const o=e.currentPlayer,l=re(e.board);l[n][r]=o;const i={row:n,col:r,player:o},a=[...e.moves,i],c=se(l,n,r,o);return c.length>=5?{...e,board:l,status:"won",winner:o,winLine:c,moves:a,lastMove:i,lastError:""}:a.length>=I*I?{...e,board:l,status:"draw",winner:null,winLine:[],moves:a,lastMove:i,lastError:""}:{...e,board:l,currentPlayer:te(o),moves:a,lastMove:i,lastError:""}},G=(e={})=>$({mode:e.mode,sessionId:e.sessionId,players:e.players,localPlayer:e.localPlayer}),le="mini-hbut-gomoku",ie="https://esm.sh/trystero/nostr?bundle",ae="https://esm.sh/@trystero-p2p/torrent?bundle",ce=Object.freeze(["wss://relay.damus.io","wss://nos.lol","wss://relay.primal.net","wss://relay.snort.social","wss://nostr.wine","wss://relay.nostr.band"]),ue=Object.freeze(["wss://tracker.openwebtorrent.com","wss://tracker.webtorrent.dev"]),y=Object.freeze({nostr:"nostr",torrent:"torrent"}),_="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",w=e=>String(e||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,16),N=e=>{const n=w(e);return n.length<=4?n:n.replace(/(.{4})/g,"$1-").replace(/-$/,"")},de=(e=Math.random)=>{let n="";for(let r=0;r<8;r+=1)n+=_[Math.floor(e()*_.length)%_.length];return`HBUT-${n.slice(0,4)}-${n.slice(4)}`},k=(e,n,r=0)=>`${e||"peer"}:${n}:${r}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2,8)}`,P=(e,n)=>{if(!n)return e;const r=Array.isArray(e.appliedMessageIds)?e.appliedMessageIds:[];return r.includes(n)?e:{...e,appliedMessageIds:[...r,n].slice(-120)}},S=e=>e===y.torrent?y.torrent:y.nostr,H=e=>S(e)===y.nostr?y.torrent:"",pe=e=>S(e)===y.torrent?ue:ce,me=e=>S(e)===y.torrent?"tracker 后备":"Nostr relay",C=(e,n={})=>{var o;const r=w(e==null?void 0:e.sessionId),s=w(n.roomCode||((o=n.snapshot)==null?void 0:o.sessionId));return!!(r&&s&&r===s)},B=e=>({...e,lastError:"房间号不匹配"}),J=(e,n)=>{var r,s;return n?((r=e.players)==null?void 0:r[u.black])===n?u.black:((s=e.players)==null?void 0:s[u.white])===n?u.white:"":""},ye=(e,n)=>({[u.black]:e==="host"?n:"",[u.white]:e==="guest"?n:""}),U=({roomCode:e="",role:n="host",selfPeerId:r="",strategy:s=y.nostr}={})=>{const o=w(e),l=n==="guest"?u.white:u.black,i=S(s),a=me(i);return{...$({mode:"online_room",sessionId:o,players:ye(n,r),localPlayer:l}),role:n,localPeerId:r,hostPeerId:n==="host"?r:"",remotePeerId:"",onlineStrategy:i,onlineStatus:n==="host"?"waiting_peer":"connecting",appliedMessageIds:[],connectionMessage:n==="host"?`${a} 房间已创建，等待对手加入。`:`正在通过 ${a} 加入房间，等待房主同步棋盘。`}},fe=(e,n)=>{var r,s,o;return!n||n===e.localPeerId?e:e.role==="guest"?{...e,players:{...e.players,[u.black]:((r=e.players)==null?void 0:r[u.black])||n},hostPeerId:e.hostPeerId||n,remotePeerId:n,onlineStatus:"connected",connectionMessage:"已连接房主，等待同步棋盘。"}:(s=e.players)!=null&&s[u.white]&&e.players[u.white]!==n?{...e,connectionMessage:"已有白子对手，新的连接将作为旁观者等待。"}:{...e,players:{...e.players,[u.white]:((o=e.players)==null?void 0:o[u.white])||n},remotePeerId:n,onlineStatus:"connected",connectionMessage:"对手已加入，可以开始对局。"}},ge=(e,n)=>!n||n!==e.remotePeerId&&n!==e.hostPeerId?e:{...e,onlineStatus:"peer_left",connectionMessage:"对手已离开，可保留棋局或回到本地双人。"},he=e=>({...e,...e.onlineStrategy&&H(e.onlineStrategy)?{onlineStatus:"retrying",onlineStrategy:H(e.onlineStrategy),connectionMessage:"Nostr relay 连接超时，正在切换 tracker 后备。",lastError:""}:{onlineStatus:"failed",connectionMessage:"公共信令连接超时，可重试联机或切回本地双人。",lastError:""}}),Ie=(e,n,r,s="")=>({type:"move",messageId:s||k(r,"move",e.moves.length),roomCode:e.sessionId,row:n.row,col:n.col,player:n.player,moveIndex:e.moves.length,senderId:r}),we=(e,n,r,s=e.localPeerId)=>{var a;if(e.mode==="online_room"){if(e.onlineStatus!=="connected")return{accepted:!1,state:{...e,lastError:"等待对手连接"},message:null};if(((a=e.players)==null?void 0:a[e.localPlayer])!==s)return{accepted:!1,state:{...e,lastError:"当前房间席位已满"},message:null};if(e.currentPlayer!==e.localPlayer)return{accepted:!1,state:{...e,lastError:"等待对手落子"},message:null}}const o=A(e,n,r,{player:e.localPlayer||e.currentPlayer,moveIndex:e.moves.length});if(!(o.moves.length===e.moves.length+1&&!o.lastError))return{accepted:!1,state:o,message:null};const i=Ie(e,o.lastMove,s);return{accepted:!0,state:P(o,i.messageId),message:i}},be=(e,n={},r="")=>{var a;if(!C(e,n))return B(e);if(n.messageId&&((a=e.appliedMessageIds)!=null&&a.includes(n.messageId)))return{...e,lastError:""};const s=n.senderId||r,o=J(e,s);if(!o||o!==n.player)return{...e,lastError:"玩家身份不匹配"};const l=Number(n.moveIndex);if(Number.isInteger(l)&&l<e.moves.length){const c=e.moves[l];return(c==null?void 0:c.row)===Number(n.row)&&(c==null?void 0:c.col)===Number(n.col)&&(c==null?void 0:c.player)===n.player?P({...e,lastError:""},n.messageId):(c==null?void 0:c.player)!==n.player?{...e,lastError:"落子顺序已过期"}:{...e,lastError:"落子冲突，请等待房主同步"}}const i=A(e,Number(n.row),Number(n.col),{player:n.player,moveIndex:l});return i.lastError?i:P({...i,onlineStatus:"connected",connectionMessage:"对手已落子，轮到你了。"},n.messageId)},ve=e=>({board:e.board,currentPlayer:e.currentPlayer,status:e.status,winner:e.winner,winLine:e.winLine,moves:e.moves,lastMove:e.lastMove,players:e.players,sessionId:e.sessionId,hostPeerId:e.hostPeerId,remotePeerId:e.remotePeerId}),Pe=(e,n=e.localPeerId,r="")=>({type:"snapshot",messageId:k(n,"snapshot",e.moves.length),roomCode:e.sessionId,senderId:n,targetPeerId:r,snapshot:ve((()=>{var l;const s=((l=e.players)==null?void 0:l[u.white])||"",o=r&&(!s||s===r);return{...e,players:o?{...e.players,[u.white]:r}:e.players,remotePeerId:o?r:e.remotePeerId}})())}),Ee=(e,n={},r="")=>{var i;if(n.targetPeerId&&n.targetPeerId!==e.localPeerId)return e;if(!C(e,n))return B(e);const s=n.senderId||r;if(e.hostPeerId&&s&&e.hostPeerId!==s)return{...e,lastError:"只接受房主同步"};if(n.messageId&&((i=e.appliedMessageIds)!=null&&i.includes(n.messageId)))return e;const o=n.snapshot||{},l={...e,board:Array.isArray(o.board)?o.board.map(a=>a.slice()):e.board,currentPlayer:o.currentPlayer||e.currentPlayer,status:o.status||e.status,winner:o.winner||null,winLine:Array.isArray(o.winLine)?o.winLine:[],moves:Array.isArray(o.moves)?o.moves:[],lastMove:o.lastMove||null,players:o.players||e.players,sessionId:w(o.sessionId||n.roomCode||e.sessionId),hostPeerId:o.hostPeerId||s||e.hostPeerId,remotePeerId:s||e.remotePeerId,onlineStatus:"connected",connectionMessage:"棋盘已同步，可以继续对局。",lastError:""};return P(l,n.messageId)},Se=(e,n=e.localPeerId)=>({type:"restart",messageId:k(n,"restart",e.moves.length),roomCode:e.sessionId,senderId:n}),K=e=>({...G(e),role:e.role,localPeerId:e.localPeerId,hostPeerId:e.hostPeerId,remotePeerId:e.remotePeerId,onlineStatus:e.remotePeerId?"connected":e.onlineStatus,connectionMessage:"棋局已重开。",appliedMessageIds:Array.isArray(e.appliedMessageIds)?e.appliedMessageIds:[]}),Me=(e,n={},r="")=>{var o;if(!C(e,n))return B(e);if(n.messageId&&((o=e.appliedMessageIds)!=null&&o.includes(n.messageId)))return e;const s=n.senderId||r;return J(e,s)?P(K(e),n.messageId):{...e,lastError:"玩家身份不匹配"}},Le=(e,n=e.localPeerId)=>{const r=Se(e,n);return{state:P(K(e),r.messageId),message:r}},$e=()=>import(ie),Re=()=>import(ae),Oe=e=>S(e)===y.torrent?Re():$e(),Te=async({roomCode:e="",strategy:n=y.nostr,importTrystero:r,onEvent:s=()=>{}}={})=>{const o=w(e);if(!o)throw new Error("房间号不能为空");const l=S(n),i=await(r?r(l):Oe(l)),a=i.joinRoom({appId:le,relayConfig:{urls:pe(l)}},o),[c,f]=a.makeAction("gomoku");return f((g,T)=>{s({type:"message",message:g,peerId:T})}),a.onPeerJoin(g=>{s({type:"peer_join",peerId:g})}),a.onPeerLeave(g=>{s({type:"peer_leave",peerId:g})}),{roomCode:o,selfPeerId:i.selfId||"",strategy:l,send(g,T){return c(g,T)},close(){a.leave()}}},D="hbut_gomoku",_e=18e3,Ae="nostr";let t=$(),h=null,b="",E=!1,m="",M=0;const W=document.getElementById("app");function x(){typeof window>"u"||window.parent===window||requestAnimationFrame(()=>{var n;const e=Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.body.scrollHeight,document.body.offsetHeight,((n=window.visualViewport)==null?void 0:n.height)||0);window.parent.postMessage({type:"mini-hbut:module-size",moduleId:D,module_id:D,height:e},"*")})}function R(){var n;const e=((n=window.visualViewport)==null?void 0:n.height)||window.innerHeight||document.documentElement.clientHeight;document.documentElement.style.setProperty("--module-vh",`${e*.01}px`),x()}function q(e,n){return`${e}:${n}`}function Ne(){return new Set((t.winLine||[]).map(([e,n])=>q(e,n)))}function d(){return t.mode==="online_room"}function O(){var e;return d()?!!(t.localPlayer&&((e=t.players)==null?void 0:e[t.localPlayer])===t.localPeerId):!0}function ke(){return d()?t.status==="playing"&&t.onlineStatus==="connected"&&t.currentPlayer===t.localPlayer&&O():t.status==="playing"}function Ce(){return d()?t.role==="host"?"联机房主":"联机加入":"本地双人"}function Z(){return d()?E?"连接中":t.onlineStatus==="connected"?"已连接":t.onlineStatus==="waiting_peer"?"等待对手":t.onlineStatus==="retrying"?"切换线路":t.onlineStatus==="peer_left"?"对手离开":t.onlineStatus==="failed"?"连接失败":"连接中":"离线可玩"}function Be(){return t.status==="won"?`${v(t.winner)}五连成功`:t.status==="draw"?"棋盘已满，平局":d()&&t.onlineStatus!=="connected"?Z():d()&&!O()?"旁观席":d()&&t.currentPlayer!==t.localPlayer?"等待对手落子":`${v(t.currentPlayer)}落子`}function xe(){if(t.status==="won")return d()?"联机对局结束，可发起同步重开。":"本地双人对局结束，可重新开局再战。";if(t.status==="draw")return"没有形成五连，双方平分秋色。";if(m)return m;if(t.lastError)return t.lastError;if(d()&&t.connectionMessage)return t.connectionMessage;if(d()&&!O())return"本房间已有黑白双方，可返回本地双人或重新加入其他房间。";if(!t.moves.length)return"点击棋盘棋位落子，先连成五枚即获胜。";const e=t.lastMove;return`上手：${v(e.player)}落在 ${e.row+1} 行 ${e.col+1} 列。`}function ze(){var s,o;const e=Ne(),n=[],r=ke();for(let l=0;l<I;l+=1)for(let i=0;i<I;i+=1){const a=t.board[l][i],c=["board-cell"];a&&c.push(a),((s=t.lastMove)==null?void 0:s.row)===l&&((o=t.lastMove)==null?void 0:o.col)===i&&c.push("last"),e.has(q(l,i))&&c.push("win"),n.push(`
        <button
          class="${c.join(" ")}"
          data-row="${l}"
          data-col="${i}"
          type="button"
          aria-label="${l+1} 行 ${i+1} 列${a?`，${v(a)}`:"，空位"}"
          ${!r||a?"disabled":""}
        >
          <span></span>
        </button>
      `)}return n.join("")}function je(){return t.moves.length?t.moves.slice(-8).reverse().map((e,n)=>`<li><strong>${t.moves.length-n}</strong><span>${v(e.player)} · ${e.row+1} 行 ${e.col+1} 列</span></li>`).join(""):"<li>等待黑子先手。</li>"}function He(){const e=d()?N(t.sessionId):"",n=d()?O()?v(t.localPlayer):"旁观":"本地";return`
    <section class="online-panel" aria-label="联机对战">
      <div class="online-summary">
        <div>
          <span>联机</span>
          <strong>${Z()}</strong>
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
          value="${b}"
          aria-label="房间号"
        >
        <button id="create-room-button" class="room-button" type="button" ${E?"disabled":""}>创建</button>
        <button id="join-room-button" class="room-button" type="button" ${E?"disabled":""}>加入</button>
        <button id="local-mode-button" class="room-button muted" type="button">本地</button>
      </div>
    </section>
  `}function p(){W.innerHTML=`
    <main class="app-shell">
      ${He()}

      <section class="score-strip" aria-label="对局状态">
        <div>
          <span>模式</span>
          <strong>${Ce()}</strong>
        </div>
        <div>
          <span>手数</span>
          <strong>${t.moves.length}</strong>
        </div>
        <div>
          <span>黑子</span>
          <strong>${t.moves.filter(e=>e.player===u.black).length}</strong>
        </div>
        <div>
          <span>白子</span>
          <strong>${t.moves.filter(e=>e.player===u.white).length}</strong>
        </div>
      </section>

      <section class="status-panel" aria-live="polite">
        <div class="turn-mark ${t.status==="playing"?t.currentPlayer:t.winner||"draw"}"></div>
        <div>
          <p class="eyebrow">湖工五子棋</p>
          <h1>${Be()}</h1>
          <p>${xe()}</p>
        </div>
      </section>

      <section class="board-panel" aria-label="十五路五子棋棋盘">
        <div class="board-grid">
          ${ze()}
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
          <span>${t.status==="playing"?"对局中":"已结束"}</span>
        </div>
        <ol>${je()}</ol>
      </section>
    </main>
  `,Ue(),x()}function Ue(){var e,n,r,s,o;for(const l of W.querySelectorAll("[data-row][data-col]"))l.addEventListener("click",()=>{Fe(Number(l.dataset.row),Number(l.dataset.col))});(e=document.getElementById("restart-button"))==null||e.addEventListener("click",Ye),(n=document.getElementById("create-room-button"))==null||n.addEventListener("click",Ge),(r=document.getElementById("join-room-button"))==null||r.addEventListener("click",Je),(s=document.getElementById("local-mode-button"))==null||s.addEventListener("click",Ke),(o=document.getElementById("room-input"))==null||o.addEventListener("input",l=>{b=N(l.target.value),l.target.value=b})}async function z(e,n=t.remotePeerId){if(!(!h||!e))try{await h.send(e,n||void 0)}catch(r){m=`发送失败：${(r==null?void 0:r.message)||"网络不可用"}`,t={...t,onlineStatus:"failed",connectionMessage:m},p()}}function L(){M&&(window.clearTimeout(M),M=0)}function De(e=t.role,n=t.sessionId){L(),M=window.setTimeout(()=>{if(!d()||t.onlineStatus==="connected")return;const r=he(t);t=r,m=t.connectionMessage,p(),r.onlineStatus==="retrying"&&j(e,n,{strategy:r.onlineStrategy,statusMessage:r.connectionMessage})},_e)}function Fe(e,n){if(m="",d()){const r=we(t,e,n,t.localPeerId);t=r.state,p(),r.accepted&&z(r.message);return}t=A(t,e,n),p()}function Ye(){if(m="",d()){const e=Le(t,t.localPeerId);t=e.state,p(),z(e.message);return}t=G(),p()}async function Q(){if(L(),!!h){try{h.close()}catch{}h=null}}function Ve(e){return e==="torrent"?"tracker 后备":"Nostr relay"}async function j(e,n,r={}){const s=w(n);if(!s){m="请先输入房间号",p();return}const o=r.strategy||Ae;E=!0,m=r.statusMessage||"",p();try{await Q(),h=await Te({roomCode:s,strategy:o,onEvent:We}),t=U({roomCode:s,role:e,selfPeerId:h.selfPeerId,strategy:h.strategy||o}),r.statusMessage&&(t={...t,connectionMessage:r.statusMessage}),b=N(s),De(e,s)}catch(l){h=null,t={...U({roomCode:s,role:e,selfPeerId:"",strategy:o}),onlineStatus:"failed",connectionMessage:`${Ve(o)} 联机服务不可用：${(l==null?void 0:l.message)||"请稍后重试"}`,lastError:""},m=t.connectionMessage}finally{E=!1,p()}}function Ge(){const e=de();b=e,j("host",e)}function Je(){j("guest",b)}async function Ke(){await Q(),E=!1,m="",b="",t=$(),p()}function We(e){if(!e)return;if(m="",e.type==="peer_join"){L(),t=fe(t,e.peerId),p(),t.role==="host"&&z(Pe(t,t.localPeerId,e.peerId),e.peerId);return}if(e.type==="peer_leave"){t=ge(t,e.peerId),p();return}if(e.type!=="message")return;const n=e.message||{};let r=t;if(n.type==="move")r=be(t,n,e.peerId);else if(n.type==="snapshot")r=Ee(t,n,e.peerId);else if(n.type==="restart")r=Me(t,n,e.peerId);else return;t=r,t.onlineStatus==="connected"&&!t.lastError&&L(),p()}window.addEventListener("resize",R);window.addEventListener("orientationchange",R);var F;(F=window.visualViewport)==null||F.addEventListener("resize",R);"ResizeObserver"in window&&new ResizeObserver(x).observe(document.documentElement);R();p();
