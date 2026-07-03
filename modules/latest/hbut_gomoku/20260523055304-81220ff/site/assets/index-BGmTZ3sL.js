(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))t(s);new MutationObserver(s=>{for(const l of s)if(l.type==="childList")for(const i of l.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&t(i)}).observe(document,{childList:!0,subtree:!0});function o(s){const l={};return s.integrity&&(l.integrity=s.integrity),s.referrerPolicy&&(l.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?l.credentials="include":s.crossOrigin==="anonymous"?l.credentials="omit":l.credentials="same-origin",l}function t(s){if(s.ep)return;s.ep=!0;const l=o(s);fetch(s.href,l)}})();const I=15,c=Object.freeze({black:"black",white:"white"}),Q=Object.freeze({[c.black]:"黑子",[c.white]:"白子"}),X=Object.freeze([[0,1],[1,0],[1,1],[1,-1]]),v=e=>Q[e]||"",ee=()=>Array.from({length:I},()=>Array.from({length:I},()=>null)),$=(e={})=>({board:ee(),currentPlayer:c.black,status:"playing",winner:null,winLine:[],moves:[],lastMove:null,lastError:"",mode:e.mode||"local_two_player",sessionId:e.sessionId||"",players:e.players||null,localPlayer:e.localPlayer||null}),F=(e,n,o)=>e?.[n]?.[o]??null,Y=(e,n)=>Number.isInteger(e)&&Number.isInteger(n)&&e>=0&&e<I&&n>=0&&n<I,ne=e=>e.map(n=>n.slice()),re=e=>e===c.black?c.white:c.black,oe=(e,n,o,t,s,l)=>{const i=[[n,o]];for(const a of[-1,1]){let m=n+s*a,f=o+l*a;for(;Y(m,f)&&F(e,m,f)===t;)i.push([m,f]),m+=s*a,f+=l*a}return i.sort(([a,m],[f,g])=>a===f?m-g:a-f)},te=(e,n,o,t)=>{for(const[s,l]of X){const i=oe(e,n,o,t,s,l);if(i.length>=5)return i}return[]},A=(e,n,o,t={})=>{if(!e||e.status!=="playing")return{...e,lastError:"对局已结束，请重新开始"};if(t.player&&t.player!==e.currentPlayer)return{...e,lastError:"未轮到该玩家"};if(Number.isInteger(t.moveIndex)&&t.moveIndex!==e.moves.length)return{...e,lastError:t.moveIndex<e.moves.length?"落子顺序已过期":"落子顺序超前"};if(!Y(n,o))return{...e,lastError:"落子位置超出棋盘"};if(F(e.board,n,o))return{...e,lastError:"该位置已有棋子"};const s=e.currentPlayer,l=ne(e.board);l[n][o]=s;const i={row:n,col:o,player:s},a=[...e.moves,i],m=te(l,n,o,s);return m.length>=5?{...e,board:l,status:"won",winner:s,winLine:m,moves:a,lastMove:i,lastError:""}:a.length>=I*I?{...e,board:l,status:"draw",winner:null,winLine:[],moves:a,lastMove:i,lastError:""}:{...e,board:l,currentPlayer:re(s),moves:a,lastMove:i,lastError:""}},V=(e={})=>$({mode:e.mode,sessionId:e.sessionId,players:e.players,localPlayer:e.localPlayer}),se="mini-hbut-gomoku",le="https://esm.sh/trystero/nostr?bundle",ie="https://esm.sh/@trystero-p2p/torrent?bundle",ae=Object.freeze(["wss://relay.damus.io","wss://nos.lol","wss://relay.primal.net","wss://relay.snort.social","wss://nostr.wine","wss://relay.nostr.band"]),ce=Object.freeze(["wss://tracker.openwebtorrent.com","wss://tracker.webtorrent.dev"]),y=Object.freeze({nostr:"nostr",torrent:"torrent"}),_="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",b=e=>String(e||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,16),N=e=>{const n=b(e);return n.length<=4?n:n.replace(/(.{4})/g,"$1-").replace(/-$/,"")},ue=(e=Math.random)=>{let n="";for(let o=0;o<8;o+=1)n+=_[Math.floor(e()*_.length)%_.length];return`HBUT-${n.slice(0,4)}-${n.slice(4)}`},k=(e,n,o=0)=>`${e||"peer"}:${n}:${o}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2,8)}`,P=(e,n)=>{if(!n)return e;const o=Array.isArray(e.appliedMessageIds)?e.appliedMessageIds:[];return o.includes(n)?e:{...e,appliedMessageIds:[...o,n].slice(-120)}},M=e=>e===y.torrent?y.torrent:y.nostr,H=e=>M(e)===y.nostr?y.torrent:"",de=e=>M(e)===y.torrent?ce:ae,pe=e=>M(e)===y.torrent?"tracker 后备":"Nostr relay",C=(e,n={})=>{const o=b(e?.sessionId),t=b(n.roomCode||n.snapshot?.sessionId);return!!(o&&t&&o===t)},x=e=>({...e,lastError:"房间号不匹配"}),G=(e,n)=>n?e.players?.[c.black]===n?c.black:e.players?.[c.white]===n?c.white:"":"",me=(e,n)=>({[c.black]:e==="host"?n:"",[c.white]:e==="guest"?n:""}),U=({roomCode:e="",role:n="host",selfPeerId:o="",strategy:t=y.nostr}={})=>{const s=b(e),l=n==="guest"?c.white:c.black,i=M(t),a=pe(i);return{...$({mode:"online_room",sessionId:s,players:me(n,o),localPlayer:l}),role:n,localPeerId:o,hostPeerId:n==="host"?o:"",remotePeerId:"",onlineStrategy:i,onlineStatus:n==="host"?"waiting_peer":"connecting",appliedMessageIds:[],connectionMessage:n==="host"?`${a} 房间已创建，等待对手加入。`:`正在通过 ${a} 加入房间，等待房主同步棋盘。`}},ye=(e,n)=>!n||n===e.localPeerId?e:e.role==="guest"?{...e,players:{...e.players,[c.black]:e.players?.[c.black]||n},hostPeerId:e.hostPeerId||n,remotePeerId:n,onlineStatus:"connected",connectionMessage:"已连接房主，等待同步棋盘。"}:e.players?.[c.white]&&e.players[c.white]!==n?{...e,connectionMessage:"已有白子对手，新的连接将作为旁观者等待。"}:{...e,players:{...e.players,[c.white]:e.players?.[c.white]||n},remotePeerId:n,onlineStatus:"connected",connectionMessage:"对手已加入，可以开始对局。"},fe=(e,n)=>!n||n!==e.remotePeerId&&n!==e.hostPeerId?e:{...e,onlineStatus:"peer_left",connectionMessage:"对手已离开，可保留棋局或回到本地双人。"},ge=e=>({...e,...e.onlineStrategy&&H(e.onlineStrategy)?{onlineStatus:"retrying",onlineStrategy:H(e.onlineStrategy),connectionMessage:"Nostr relay 连接超时，正在切换 tracker 后备。",lastError:""}:{onlineStatus:"failed",connectionMessage:"公共信令连接超时，可重试联机或切回本地双人。",lastError:""}}),he=(e,n,o,t="")=>({type:"move",messageId:t||k(o,"move",e.moves.length),roomCode:e.sessionId,row:n.row,col:n.col,player:n.player,moveIndex:e.moves.length,senderId:o}),Ie=(e,n,o,t=e.localPeerId)=>{if(e.mode==="online_room"){if(e.onlineStatus!=="connected")return{accepted:!1,state:{...e,lastError:"等待对手连接"},message:null};if(e.players?.[e.localPlayer]!==t)return{accepted:!1,state:{...e,lastError:"当前房间席位已满"},message:null};if(e.currentPlayer!==e.localPlayer)return{accepted:!1,state:{...e,lastError:"等待对手落子"},message:null}}const s=A(e,n,o,{player:e.localPlayer||e.currentPlayer,moveIndex:e.moves.length});if(!(s.moves.length===e.moves.length+1&&!s.lastError))return{accepted:!1,state:s,message:null};const i=he(e,s.lastMove,t);return{accepted:!0,state:P(s,i.messageId),message:i}},be=(e,n={},o="")=>{if(!C(e,n))return x(e);if(n.messageId&&e.appliedMessageIds?.includes(n.messageId))return{...e,lastError:""};const t=n.senderId||o,s=G(e,t);if(!s||s!==n.player)return{...e,lastError:"玩家身份不匹配"};const l=Number(n.moveIndex);if(Number.isInteger(l)&&l<e.moves.length){const a=e.moves[l];return a?.row===Number(n.row)&&a?.col===Number(n.col)&&a?.player===n.player?P({...e,lastError:""},n.messageId):a?.player!==n.player?{...e,lastError:"落子顺序已过期"}:{...e,lastError:"落子冲突，请等待房主同步"}}const i=A(e,Number(n.row),Number(n.col),{player:n.player,moveIndex:l});return i.lastError?i:P({...i,onlineStatus:"connected",connectionMessage:"对手已落子，轮到你了。"},n.messageId)},we=e=>({board:e.board,currentPlayer:e.currentPlayer,status:e.status,winner:e.winner,winLine:e.winLine,moves:e.moves,lastMove:e.lastMove,players:e.players,sessionId:e.sessionId,hostPeerId:e.hostPeerId,remotePeerId:e.remotePeerId}),ve=(e,n=e.localPeerId,o="")=>({type:"snapshot",messageId:k(n,"snapshot",e.moves.length),roomCode:e.sessionId,senderId:n,targetPeerId:o,snapshot:we((()=>{const t=e.players?.[c.white]||"",s=o&&(!t||t===o);return{...e,players:s?{...e.players,[c.white]:o}:e.players,remotePeerId:s?o:e.remotePeerId}})())}),Pe=(e,n={},o="")=>{if(n.targetPeerId&&n.targetPeerId!==e.localPeerId)return e;if(!C(e,n))return x(e);if(n.messageId&&e.appliedMessageIds?.includes(n.messageId))return e;const t=n.snapshot||{},s={...e,board:Array.isArray(t.board)?t.board.map(l=>l.slice()):e.board,currentPlayer:t.currentPlayer||e.currentPlayer,status:t.status||e.status,winner:t.winner||null,winLine:Array.isArray(t.winLine)?t.winLine:[],moves:Array.isArray(t.moves)?t.moves:[],lastMove:t.lastMove||null,players:t.players||e.players,sessionId:b(t.sessionId||n.roomCode||e.sessionId),hostPeerId:t.hostPeerId||n.senderId||o||e.hostPeerId,remotePeerId:n.senderId||o||e.remotePeerId,onlineStatus:"connected",connectionMessage:"棋盘已同步，可以继续对局。",lastError:""};return P(s,n.messageId)},Ee=(e,n=e.localPeerId)=>({type:"restart",messageId:k(n,"restart",e.moves.length),roomCode:e.sessionId,senderId:n}),J=e=>({...V(e),role:e.role,localPeerId:e.localPeerId,hostPeerId:e.hostPeerId,remotePeerId:e.remotePeerId,onlineStatus:e.remotePeerId?"connected":e.onlineStatus,connectionMessage:"棋局已重开。",appliedMessageIds:Array.isArray(e.appliedMessageIds)?e.appliedMessageIds:[]}),Me=(e,n={},o="")=>{if(!C(e,n))return x(e);if(n.messageId&&e.appliedMessageIds?.includes(n.messageId))return e;const t=n.senderId||o;return G(e,t)?P(J(e),n.messageId):{...e,lastError:"玩家身份不匹配"}},Se=(e,n=e.localPeerId)=>{const o=Ee(e,n);return{state:P(J(e),o.messageId),message:o}},Le=()=>import(le),$e=()=>import(ie),Re=e=>M(e)===y.torrent?$e():Le(),Oe=async({roomCode:e="",strategy:n=y.nostr,importTrystero:o,onEvent:t=()=>{}}={})=>{const s=b(e);if(!s)throw new Error("房间号不能为空");const l=M(n),i=await(o?o(l):Re(l)),a=i.joinRoom({appId:se,relayConfig:{urls:de(l)}},s),[m,f]=a.makeAction("gomoku");return f((g,T)=>{t({type:"message",message:g,peerId:T})}),a.onPeerJoin(g=>{t({type:"peer_join",peerId:g})}),a.onPeerLeave(g=>{t({type:"peer_leave",peerId:g})}),{roomCode:s,selfPeerId:i.selfId||"",strategy:l,send(g,T){return m(g,T)},close(){a.leave()}}},D="hbut_gomoku",Te=18e3,_e="nostr";let r=$(),h=null,w="",E=!1,p="",S=0;const K=document.getElementById("app");function B(){typeof window>"u"||window.parent===window||requestAnimationFrame(()=>{const e=Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.body.scrollHeight,document.body.offsetHeight,window.visualViewport?.height||0);window.parent.postMessage({type:"mini-hbut:module-size",moduleId:D,module_id:D,height:e},"*")})}function R(){const e=window.visualViewport?.height||window.innerHeight||document.documentElement.clientHeight;document.documentElement.style.setProperty("--module-vh",`${e*.01}px`),B()}function W(e,n){return`${e}:${n}`}function Ae(){return new Set((r.winLine||[]).map(([e,n])=>W(e,n)))}function u(){return r.mode==="online_room"}function O(){return u()?!!(r.localPlayer&&r.players?.[r.localPlayer]===r.localPeerId):!0}function Ne(){return u()?r.status==="playing"&&r.onlineStatus==="connected"&&r.currentPlayer===r.localPlayer&&O():r.status==="playing"}function ke(){return u()?r.role==="host"?"联机房主":"联机加入":"本地双人"}function q(){return u()?E?"连接中":r.onlineStatus==="connected"?"已连接":r.onlineStatus==="waiting_peer"?"等待对手":r.onlineStatus==="retrying"?"切换线路":r.onlineStatus==="peer_left"?"对手离开":r.onlineStatus==="failed"?"连接失败":"连接中":"离线可玩"}function Ce(){return r.status==="won"?`${v(r.winner)}五连成功`:r.status==="draw"?"棋盘已满，平局":u()&&r.onlineStatus!=="connected"?q():u()&&!O()?"旁观席":u()&&r.currentPlayer!==r.localPlayer?"等待对手落子":`${v(r.currentPlayer)}落子`}function xe(){if(r.status==="won")return u()?"联机对局结束，可发起同步重开。":"本地双人对局结束，可重新开局再战。";if(r.status==="draw")return"没有形成五连，双方平分秋色。";if(p)return p;if(r.lastError)return r.lastError;if(u()&&r.connectionMessage)return r.connectionMessage;if(u()&&!O())return"本房间已有黑白双方，可返回本地双人或重新加入其他房间。";if(!r.moves.length)return"点击棋盘棋位落子，先连成五枚即获胜。";const e=r.lastMove;return`上手：${v(e.player)}落在 ${e.row+1} 行 ${e.col+1} 列。`}function Be(){const e=Ae(),n=[],o=Ne();for(let t=0;t<I;t+=1)for(let s=0;s<I;s+=1){const l=r.board[t][s],i=["board-cell"];l&&i.push(l),r.lastMove?.row===t&&r.lastMove?.col===s&&i.push("last"),e.has(W(t,s))&&i.push("win"),n.push(`
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
      `)}return n.join("")}function ze(){return r.moves.length?r.moves.slice(-8).reverse().map((e,n)=>`<li><strong>${r.moves.length-n}</strong><span>${v(e.player)} · ${e.row+1} 行 ${e.col+1} 列</span></li>`).join(""):"<li>等待黑子先手。</li>"}function je(){const e=u()?N(r.sessionId):"",n=u()?O()?v(r.localPlayer):"旁观":"本地";return`
    <section class="online-panel" aria-label="联机对战">
      <div class="online-summary">
        <div>
          <span>联机</span>
          <strong>${q()}</strong>
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
          value="${w}"
          aria-label="房间号"
        >
        <button id="create-room-button" class="room-button" type="button" ${E?"disabled":""}>创建</button>
        <button id="join-room-button" class="room-button" type="button" ${E?"disabled":""}>加入</button>
        <button id="local-mode-button" class="room-button muted" type="button">本地</button>
      </div>
    </section>
  `}function d(){K.innerHTML=`
    <main class="app-shell">
      ${je()}

      <section class="score-strip" aria-label="对局状态">
        <div>
          <span>模式</span>
          <strong>${ke()}</strong>
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
          <h1>${Ce()}</h1>
          <p>${xe()}</p>
        </div>
      </section>

      <section class="board-panel" aria-label="十五路五子棋棋盘">
        <div class="board-grid">
          ${Be()}
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
        <ol>${ze()}</ol>
      </section>
    </main>
  `,He(),B()}function He(){for(const e of K.querySelectorAll("[data-row][data-col]"))e.addEventListener("click",()=>{De(Number(e.dataset.row),Number(e.dataset.col))});document.getElementById("restart-button")?.addEventListener("click",Fe),document.getElementById("create-room-button")?.addEventListener("click",Ve),document.getElementById("join-room-button")?.addEventListener("click",Ge),document.getElementById("local-mode-button")?.addEventListener("click",Je),document.getElementById("room-input")?.addEventListener("input",e=>{w=N(e.target.value),e.target.value=w})}async function z(e,n=r.remotePeerId){if(!(!h||!e))try{await h.send(e,n||void 0)}catch(o){p=`发送失败：${o?.message||"网络不可用"}`,r={...r,onlineStatus:"failed",connectionMessage:p},d()}}function L(){S&&(window.clearTimeout(S),S=0)}function Ue(e=r.role,n=r.sessionId){L(),S=window.setTimeout(()=>{if(!u()||r.onlineStatus==="connected")return;const o=ge(r);r=o,p=r.connectionMessage,d(),o.onlineStatus==="retrying"&&j(e,n,{strategy:o.onlineStrategy,statusMessage:o.connectionMessage})},Te)}function De(e,n){if(p="",u()){const o=Ie(r,e,n,r.localPeerId);r=o.state,d(),o.accepted&&z(o.message);return}r=A(r,e,n),d()}function Fe(){if(p="",u()){const e=Se(r,r.localPeerId);r=e.state,d(),z(e.message);return}r=V(),d()}async function Z(){if(L(),!!h){try{h.close()}catch{}h=null}}function Ye(e){return e==="torrent"?"tracker 后备":"Nostr relay"}async function j(e,n,o={}){const t=b(n);if(!t){p="请先输入房间号",d();return}const s=o.strategy||_e;E=!0,p=o.statusMessage||"",d();try{await Z(),h=await Oe({roomCode:t,strategy:s,onEvent:Ke}),r=U({roomCode:t,role:e,selfPeerId:h.selfPeerId,strategy:h.strategy||s}),o.statusMessage&&(r={...r,connectionMessage:o.statusMessage}),w=N(t),Ue(e,t)}catch(l){h=null,r={...U({roomCode:t,role:e,selfPeerId:"",strategy:s}),onlineStatus:"failed",connectionMessage:`${Ye(s)} 联机服务不可用：${l?.message||"请稍后重试"}`,lastError:""},p=r.connectionMessage}finally{E=!1,d()}}function Ve(){const e=ue();w=e,j("host",e)}function Ge(){j("guest",w)}async function Je(){await Z(),E=!1,p="",w="",r=$(),d()}function Ke(e){if(!e)return;if(p="",e.type==="peer_join"){L(),r=ye(r,e.peerId),d(),r.role==="host"&&z(ve(r,r.localPeerId,e.peerId),e.peerId);return}if(e.type==="peer_leave"){r=fe(r,e.peerId),d();return}if(e.type!=="message")return;L();const n=e.message||{};n.type==="move"?r=be(r,n,e.peerId):n.type==="snapshot"?r=Pe(r,n,e.peerId):n.type==="restart"&&(r=Me(r,n,e.peerId)),d()}window.addEventListener("resize",R);window.addEventListener("orientationchange",R);window.visualViewport?.addEventListener("resize",R);"ResizeObserver"in window&&new ResizeObserver(B).observe(document.documentElement);R();d();
