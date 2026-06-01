(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))o(s);new MutationObserver(s=>{for(const l of s)if(l.type==="childList")for(const i of l.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&o(i)}).observe(document,{childList:!0,subtree:!0});function t(s){const l={};return s.integrity&&(l.integrity=s.integrity),s.referrerPolicy&&(l.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?l.credentials="include":s.crossOrigin==="anonymous"?l.credentials="omit":l.credentials="same-origin",l}function o(s){if(s.ep)return;s.ep=!0;const l=t(s);fetch(s.href,l)}})();const I=15,c=Object.freeze({black:"black",white:"white"}),Z=Object.freeze({[c.black]:"黑子",[c.white]:"白子"}),Q=Object.freeze([[0,1],[1,0],[1,1],[1,-1]]),v=e=>Z[e]||"",X=()=>Array.from({length:I},()=>Array.from({length:I},()=>null)),$=(e={})=>({board:X(),currentPlayer:c.black,status:"playing",winner:null,winLine:[],moves:[],lastMove:null,lastError:"",mode:e.mode||"local_two_player",sessionId:e.sessionId||"",players:e.players||null,localPlayer:e.localPlayer||null}),D=(e,n,t)=>e?.[n]?.[t]??null,F=(e,n)=>Number.isInteger(e)&&Number.isInteger(n)&&e>=0&&e<I&&n>=0&&n<I,ee=e=>e.map(n=>n.slice()),ne=e=>e===c.black?c.white:c.black,re=(e,n,t,o,s,l)=>{const i=[[n,t]];for(const a of[-1,1]){let m=n+s*a,f=t+l*a;for(;F(m,f)&&D(e,m,f)===o;)i.push([m,f]),m+=s*a,f+=l*a}return i.sort(([a,m],[f,g])=>a===f?m-g:a-f)},te=(e,n,t,o)=>{for(const[s,l]of Q){const i=re(e,n,t,o,s,l);if(i.length>=5)return i}return[]},_=(e,n,t,o={})=>{if(!e||e.status!=="playing")return{...e,lastError:"对局已结束，请重新开始"};if(o.player&&o.player!==e.currentPlayer)return{...e,lastError:"未轮到该玩家"};if(Number.isInteger(o.moveIndex)&&o.moveIndex!==e.moves.length)return{...e,lastError:o.moveIndex<e.moves.length?"落子顺序已过期":"落子顺序超前"};if(!F(n,t))return{...e,lastError:"落子位置超出棋盘"};if(D(e.board,n,t))return{...e,lastError:"该位置已有棋子"};const s=e.currentPlayer,l=ee(e.board);l[n][t]=s;const i={row:n,col:t,player:s},a=[...e.moves,i],m=te(l,n,t,s);return m.length>=5?{...e,board:l,status:"won",winner:s,winLine:m,moves:a,lastMove:i,lastError:""}:a.length>=I*I?{...e,board:l,status:"draw",winner:null,winLine:[],moves:a,lastMove:i,lastError:""}:{...e,board:l,currentPlayer:ne(s),moves:a,lastMove:i,lastError:""}},Y=(e={})=>$({mode:e.mode,sessionId:e.sessionId,players:e.players,localPlayer:e.localPlayer}),oe="mini-hbut-gomoku",se="https://esm.sh/trystero/nostr?bundle",le="https://esm.sh/@trystero-p2p/torrent?bundle",ie=Object.freeze(["wss://relay.damus.io","wss://nos.lol","wss://relay.primal.net","wss://relay.snort.social","wss://nostr.wine","wss://relay.nostr.band"]),ae=Object.freeze(["wss://tracker.openwebtorrent.com","wss://tracker.webtorrent.dev"]),y=Object.freeze({nostr:"nostr",torrent:"torrent"}),T="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",b=e=>String(e||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,16),N=e=>{const n=b(e);return n.length<=4?n:n.replace(/(.{4})/g,"$1-").replace(/-$/,"")},ce=(e=Math.random)=>{let n="";for(let t=0;t<8;t+=1)n+=T[Math.floor(e()*T.length)%T.length];return`HBUT-${n.slice(0,4)}-${n.slice(4)}`},A=(e,n,t=0)=>`${e||"peer"}:${n}:${t}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2,8)}`,P=(e,n)=>{if(!n)return e;const t=Array.isArray(e.appliedMessageIds)?e.appliedMessageIds:[];return t.includes(n)?e:{...e,appliedMessageIds:[...t,n].slice(-120)}},M=e=>e===y.torrent?y.torrent:y.nostr,j=e=>M(e)===y.nostr?y.torrent:"",de=e=>M(e)===y.torrent?ae:ie,ue=e=>M(e)===y.torrent?"tracker 后备":"Nostr relay",k=(e,n={})=>{const t=b(e?.sessionId),o=b(n.roomCode||n.snapshot?.sessionId);return!t||!o||t===o},C=e=>({...e,lastError:"房间号不匹配"}),V=(e,n)=>n?e.players?.[c.black]===n?c.black:e.players?.[c.white]===n?c.white:"":"",pe=(e,n)=>({[c.black]:e==="host"?n:"",[c.white]:e==="guest"?n:""}),H=({roomCode:e="",role:n="host",selfPeerId:t="",strategy:o=y.nostr}={})=>{const s=b(e),l=n==="guest"?c.white:c.black,i=M(o),a=ue(i);return{...$({mode:"online_room",sessionId:s,players:pe(n,t),localPlayer:l}),role:n,localPeerId:t,hostPeerId:n==="host"?t:"",remotePeerId:"",onlineStrategy:i,onlineStatus:n==="host"?"waiting_peer":"connecting",appliedMessageIds:[],connectionMessage:n==="host"?`${a} 房间已创建，等待对手加入。`:`正在通过 ${a} 加入房间，等待房主同步棋盘。`}},me=(e,n)=>!n||n===e.localPeerId?e:e.role==="guest"?{...e,players:{...e.players,[c.black]:e.players?.[c.black]||n},hostPeerId:e.hostPeerId||n,remotePeerId:n,onlineStatus:"connected",connectionMessage:"已连接房主，等待同步棋盘。"}:e.players?.[c.white]&&e.players[c.white]!==n?{...e,connectionMessage:"已有白子对手，新的连接将作为旁观者等待。"}:{...e,players:{...e.players,[c.white]:e.players?.[c.white]||n},remotePeerId:n,onlineStatus:"connected",connectionMessage:"对手已加入，可以开始对局。"},ye=(e,n)=>!n||n!==e.remotePeerId&&n!==e.hostPeerId?e:{...e,onlineStatus:"peer_left",connectionMessage:"对手已离开，可保留棋局或回到本地双人。"},fe=e=>({...e,...e.onlineStrategy&&j(e.onlineStrategy)?{onlineStatus:"retrying",onlineStrategy:j(e.onlineStrategy),connectionMessage:"Nostr relay 连接超时，正在切换 tracker 后备。",lastError:""}:{onlineStatus:"failed",connectionMessage:"公共信令连接超时，可重试联机或切回本地双人。",lastError:""}}),ge=(e,n,t,o="")=>({type:"move",messageId:o||A(t,"move",e.moves.length),roomCode:e.sessionId,row:n.row,col:n.col,player:n.player,moveIndex:e.moves.length,senderId:t}),he=(e,n,t,o=e.localPeerId)=>{if(e.mode==="online_room"){if(e.onlineStatus!=="connected")return{accepted:!1,state:{...e,lastError:"等待对手连接"},message:null};if(e.players?.[e.localPlayer]!==o)return{accepted:!1,state:{...e,lastError:"当前房间席位已满"},message:null};if(e.currentPlayer!==e.localPlayer)return{accepted:!1,state:{...e,lastError:"等待对手落子"},message:null}}const s=_(e,n,t,{player:e.localPlayer||e.currentPlayer,moveIndex:e.moves.length});if(!(s.moves.length===e.moves.length+1&&!s.lastError))return{accepted:!1,state:s,message:null};const i=ge(e,s.lastMove,o);return{accepted:!0,state:P(s,i.messageId),message:i}},Ie=(e,n={},t="")=>{if(!k(e,n))return C(e);if(n.messageId&&e.appliedMessageIds?.includes(n.messageId))return{...e,lastError:""};const o=n.senderId||t,s=V(e,o);if(!s||s!==n.player)return{...e,lastError:"玩家身份不匹配"};const l=Number(n.moveIndex);if(Number.isInteger(l)&&l<e.moves.length){const a=e.moves[l];return a?.row===Number(n.row)&&a?.col===Number(n.col)&&a?.player===n.player?P({...e,lastError:""},n.messageId):a?.player!==n.player?{...e,lastError:"落子顺序已过期"}:{...e,lastError:"落子冲突，请等待房主同步"}}const i=_(e,Number(n.row),Number(n.col),{player:n.player,moveIndex:l});return i.lastError?i:P({...i,onlineStatus:"connected",connectionMessage:"对手已落子，轮到你了。"},n.messageId)},be=e=>({board:e.board,currentPlayer:e.currentPlayer,status:e.status,winner:e.winner,winLine:e.winLine,moves:e.moves,lastMove:e.lastMove,players:e.players,sessionId:e.sessionId,hostPeerId:e.hostPeerId,remotePeerId:e.remotePeerId}),we=(e,n=e.localPeerId,t="")=>({type:"snapshot",messageId:A(n,"snapshot",e.moves.length),roomCode:e.sessionId,senderId:n,targetPeerId:t,snapshot:be((()=>{const o=e.players?.[c.white]||"",s=t&&(!o||o===t);return{...e,players:s?{...e.players,[c.white]:t}:e.players,remotePeerId:s?t:e.remotePeerId}})())}),ve=(e,n={},t="")=>{if(n.targetPeerId&&n.targetPeerId!==e.localPeerId)return e;if(!k(e,n))return C(e);if(n.messageId&&e.appliedMessageIds?.includes(n.messageId))return e;const o=n.snapshot||{},s={...e,board:Array.isArray(o.board)?o.board.map(l=>l.slice()):e.board,currentPlayer:o.currentPlayer||e.currentPlayer,status:o.status||e.status,winner:o.winner||null,winLine:Array.isArray(o.winLine)?o.winLine:[],moves:Array.isArray(o.moves)?o.moves:[],lastMove:o.lastMove||null,players:o.players||e.players,sessionId:b(o.sessionId||n.roomCode||e.sessionId),hostPeerId:o.hostPeerId||n.senderId||t||e.hostPeerId,remotePeerId:n.senderId||t||e.remotePeerId,onlineStatus:"connected",connectionMessage:"棋盘已同步，可以继续对局。",lastError:""};return P(s,n.messageId)},Pe=(e,n=e.localPeerId)=>({type:"restart",messageId:A(n,"restart",e.moves.length),roomCode:e.sessionId,senderId:n}),G=e=>({...Y(e),role:e.role,localPeerId:e.localPeerId,hostPeerId:e.hostPeerId,remotePeerId:e.remotePeerId,onlineStatus:e.remotePeerId?"connected":e.onlineStatus,connectionMessage:"棋局已重开。",appliedMessageIds:Array.isArray(e.appliedMessageIds)?e.appliedMessageIds:[]}),Ee=(e,n={},t="")=>{if(!k(e,n))return C(e);if(n.messageId&&e.appliedMessageIds?.includes(n.messageId))return e;const o=n.senderId||t;return V(e,o)?P(G(e),n.messageId):{...e,lastError:"玩家身份不匹配"}},Me=(e,n=e.localPeerId)=>{const t=Pe(e,n);return{state:P(G(e),t.messageId),message:t}},Se=()=>import(se),Le=()=>import(le),$e=e=>M(e)===y.torrent?Le():Se(),Re=async({roomCode:e="",strategy:n=y.nostr,importTrystero:t,onEvent:o=()=>{}}={})=>{const s=b(e);if(!s)throw new Error("房间号不能为空");const l=M(n),i=await(t?t(l):$e(l)),a=i.joinRoom({appId:oe,relayConfig:{urls:de(l)}},s),[m,f]=a.makeAction("gomoku");return f((g,O)=>{o({type:"message",message:g,peerId:O})}),a.onPeerJoin(g=>{o({type:"peer_join",peerId:g})}),a.onPeerLeave(g=>{o({type:"peer_leave",peerId:g})}),{roomCode:s,selfPeerId:i.selfId||"",strategy:l,send(g,O){return m(g,O)},close(){a.leave()}}},U="hbut_gomoku",Oe=18e3,Te="nostr";let r=$(),h=null,w="",E=!1,u="",S=0;const J=document.getElementById("app");function x(){typeof window>"u"||window.parent===window||requestAnimationFrame(()=>{const e=Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.body.scrollHeight,document.body.offsetHeight,window.visualViewport?.height||0);window.parent.postMessage({type:"mini-hbut:module-size",moduleId:U,module_id:U,height:e},"*")})}function R(){const e=window.visualViewport?.height||window.innerHeight||document.documentElement.clientHeight;document.documentElement.style.setProperty("--module-vh",`${e*.01}px`),x()}function K(e,n){return`${e}:${n}`}function _e(){return new Set((r.winLine||[]).map(([e,n])=>K(e,n)))}function p(){return r.mode==="online_room"}function Ne(){return p()?r.status==="playing"&&r.onlineStatus==="connected"&&r.currentPlayer===r.localPlayer:r.status==="playing"}function Ae(){return p()?r.role==="host"?"联机房主":"联机加入":"本地双人"}function W(){return p()?E?"连接中":r.onlineStatus==="connected"?"已连接":r.onlineStatus==="waiting_peer"?"等待对手":r.onlineStatus==="retrying"?"切换线路":r.onlineStatus==="peer_left"?"对手离开":r.onlineStatus==="failed"?"连接失败":"连接中":"离线可玩"}function ke(){return r.status==="won"?`${v(r.winner)}五连成功`:r.status==="draw"?"棋盘已满，平局":p()&&r.onlineStatus!=="connected"?W():p()&&r.currentPlayer!==r.localPlayer?"等待对手落子":`${v(r.currentPlayer)}落子`}function Ce(){if(r.status==="won")return p()?"联机对局结束，可发起同步重开。":"本地双人对局结束，可重新开局再战。";if(r.status==="draw")return"没有形成五连，双方平分秋色。";if(u)return u;if(r.lastError)return r.lastError;if(p()&&r.connectionMessage)return r.connectionMessage;if(!r.moves.length)return"点击棋盘棋位落子，先连成五枚即获胜。";const e=r.lastMove;return`上手：${v(e.player)}落在 ${e.row+1} 行 ${e.col+1} 列。`}function xe(){const e=_e(),n=[],t=Ne();for(let o=0;o<I;o+=1)for(let s=0;s<I;s+=1){const l=r.board[o][s],i=["board-cell"];l&&i.push(l),r.lastMove?.row===o&&r.lastMove?.col===s&&i.push("last"),e.has(K(o,s))&&i.push("win"),n.push(`
        <button
          class="${i.join(" ")}"
          data-row="${o}"
          data-col="${s}"
          type="button"
          aria-label="${o+1} 行 ${s+1} 列${l?`，${v(l)}`:"，空位"}"
          ${!t||l?"disabled":""}
        >
          <span></span>
        </button>
      `)}return n.join("")}function ze(){return r.moves.length?r.moves.slice(-8).reverse().map((e,n)=>`<li><strong>${r.moves.length-n}</strong><span>${v(e.player)} · ${e.row+1} 行 ${e.col+1} 列</span></li>`).join(""):"<li>等待黑子先手。</li>"}function Be(){const e=p()?N(r.sessionId):"",n=p()?v(r.localPlayer)||"旁观":"本地";return`
    <section class="online-panel" aria-label="联机对战">
      <div class="online-summary">
        <div>
          <span>联机</span>
          <strong>${W()}</strong>
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
  `}function d(){J.innerHTML=`
    <main class="app-shell">
      ${Be()}

      <section class="score-strip" aria-label="对局状态">
        <div>
          <span>模式</span>
          <strong>${Ae()}</strong>
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
          <h1>${ke()}</h1>
          <p>${Ce()}</p>
        </div>
      </section>

      <section class="board-panel" aria-label="十五路五子棋棋盘">
        <div class="board-grid">
          ${xe()}
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
  `,je(),x()}function je(){for(const e of J.querySelectorAll("[data-row][data-col]"))e.addEventListener("click",()=>{Ue(Number(e.dataset.row),Number(e.dataset.col))});document.getElementById("restart-button")?.addEventListener("click",De),document.getElementById("create-room-button")?.addEventListener("click",Ye),document.getElementById("join-room-button")?.addEventListener("click",Ve),document.getElementById("local-mode-button")?.addEventListener("click",Ge),document.getElementById("room-input")?.addEventListener("input",e=>{w=N(e.target.value),e.target.value=w})}async function z(e,n=r.remotePeerId){if(!(!h||!e))try{await h.send(e,n||void 0)}catch(t){u=`发送失败：${t?.message||"网络不可用"}`,r={...r,onlineStatus:"failed",connectionMessage:u},d()}}function L(){S&&(window.clearTimeout(S),S=0)}function He(e=r.role,n=r.sessionId){L(),S=window.setTimeout(()=>{if(!p()||r.onlineStatus==="connected")return;const t=fe(r);r=t,u=r.connectionMessage,d(),t.onlineStatus==="retrying"&&B(e,n,{strategy:t.onlineStrategy,statusMessage:t.connectionMessage})},Oe)}function Ue(e,n){if(u="",p()){const t=he(r,e,n,r.localPeerId);r=t.state,d(),t.accepted&&z(t.message);return}r=_(r,e,n),d()}function De(){if(u="",p()){const e=Me(r,r.localPeerId);r=e.state,d(),z(e.message);return}r=Y(),d()}async function q(){if(L(),!!h){try{h.close()}catch{}h=null}}function Fe(e){return e==="torrent"?"tracker 后备":"Nostr relay"}async function B(e,n,t={}){const o=b(n);if(!o){u="请先输入房间号",d();return}const s=t.strategy||Te;E=!0,u=t.statusMessage||"",d();try{await q(),h=await Re({roomCode:o,strategy:s,onEvent:Je}),r=H({roomCode:o,role:e,selfPeerId:h.selfPeerId,strategy:h.strategy||s}),t.statusMessage&&(r={...r,connectionMessage:t.statusMessage}),w=N(o),He(e,o)}catch(l){h=null,r={...H({roomCode:o,role:e,selfPeerId:"",strategy:s}),onlineStatus:"failed",connectionMessage:`${Fe(s)} 联机服务不可用：${l?.message||"请稍后重试"}`,lastError:""},u=r.connectionMessage}finally{E=!1,d()}}function Ye(){const e=ce();w=e,B("host",e)}function Ve(){B("guest",w)}async function Ge(){await q(),E=!1,u="",w="",r=$(),d()}function Je(e){if(!e)return;if(u="",e.type==="peer_join"){L(),r=me(r,e.peerId),d(),r.role==="host"&&z(we(r,r.localPeerId,e.peerId),e.peerId);return}if(e.type==="peer_leave"){r=ye(r,e.peerId),d();return}if(e.type!=="message")return;L();const n=e.message||{};n.type==="move"?r=Ie(r,n,e.peerId):n.type==="snapshot"?r=ve(r,n,e.peerId):n.type==="restart"&&(r=Ee(r,n,e.peerId)),d()}window.addEventListener("resize",R);window.addEventListener("orientationchange",R);window.visualViewport?.addEventListener("resize",R);"ResizeObserver"in window&&new ResizeObserver(x).observe(document.documentElement);R();d();
