import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, push, set, onValue, remove, update } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const firebaseConfig={apiKey:"AIzaSyAC5Hzg9DInPVYJcKTM3bPKXE-OjzpvIGI",authDomain:"tchat-v2-ab202.firebaseapp.com",databaseURL:"https://tchat-v2-ab202-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"tchat-v2-ab202",storageBucket:"tchat-v2-ab202.firebasestorage.app",messagingSenderId:"417009845131",appId:"1:417009845131:web:04d20be9eb471652b1258e"};
const MAX=200,DAYS=7,SHOW=250,CLEAN_BATCH=30,SEND_COOLDOWN=1800;
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const $=s=>document.querySelector(s),messages=$("#messages"),text=$("#text"),url=$("#url"),type=$("#type"),send=$("#send"),count=$("#count"),status=$("#status"),search=$("#search");
let allRows=[],reactionMap={},listening=false,lastSent=0,cleanupRunning=false,replyTarget=null,unread=0,jumpDismissed=false,audioEnabled=localStorage.getItem("tchat-sound")!=="off";

function safeUrl(v){try{const u=new URL(v);return ["https:","http:"].includes(u.protocol)?u.href:null}catch{return null}}
function time(ms){const n=Number(ms);return Number.isFinite(n)&&n>0?new Date(n).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}):"baru saja"}
function dateLabel(ms){const n=Number(ms);if(!n)return "";return new Date(n).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"})}
function initials(n){return (n||"Anonim").trim().slice(0,1).toUpperCase()||"T"}
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove("show"),1800)}
function getName(){return (localStorage.getItem("tchat-name")||"Anonim").trim().slice(0,30)||"Anonim"}
function escapeRegExp(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
function playPing(){if(!audioEnabled)return;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=760;o.type="sine";g.gain.value=.035;o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.07)}catch{}}
function linkify(textValue){const frag=document.createDocumentFragment(),re=/(https?:\/\/[^\s<]+)/g;let last=0,m;while((m=re.exec(textValue))){if(m.index>last)frag.append(document.createTextNode(textValue.slice(last,m.index)));const u=safeUrl(m[0]);if(u){const a=document.createElement("a");a.href=u;a.target="_blank";a.rel="noopener noreferrer";a.textContent=m[0];a.className="text-link";frag.append(a)}else frag.append(document.createTextNode(m[0]));last=re.lastIndex}if(last<textValue.length)frag.append(document.createTextNode(textValue.slice(last)));return frag}

function replyTo(d,key){replyTarget={key,text:(d.text||d.type||"Pesan media").slice(0,90),name:d.name||"Anonim"};$("#replybar").hidden=false;$("#replyName").textContent=replyTarget.name;$("#replyText").textContent=replyTarget.text;text.focus();toast("Membalas pesan")}
function cancelReply(){replyTarget=null;$("#replybar").hidden=true}
function addReaction(key,emoji){if(!auth.currentUser)return;set(ref(db,`reactions/${key}/${auth.currentUser.uid}`),emoji).catch(()=>toast("Reaksi gagal disimpan"))}

function render(d,key){
  const row=document.createElement("article");row.className="msg";row.dataset.key=key;
  const av=document.createElement("div");av.className="avatar";av.textContent=initials(d.name);
  const wrap=document.createElement("div");wrap.className="wrap";
  const meta=document.createElement("div");meta.className="meta";meta.textContent=`${d.name||"Anonim"} · ${time(d.createdAt)}`;
  const b=document.createElement("div");b.className="bubble";
  if(d.replyTo){const q=document.createElement("div");q.className="reply-quote";q.textContent=`↩ ${d.replyTo.name||"Anonim"}: ${d.replyTo.text||"Pesan"}`;b.append(q)}
  if(d.type==="image"||d.type==="gift"){
    const u=safeUrl(d.url||"");
    if(!u)b.append(document.createTextNode("URL media tidak valid."));
    else{const img=document.createElement("img");img.className="media-img";img.src=u;img.alt=d.type==="gift"?"Gift":"Gambar";img.loading="lazy";img.referrerPolicy="no-referrer";img.onerror=()=>{b.replaceChildren();const a=document.createElement("a");a.className="media-link";a.href=u;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Buka media";b.append(a)};b.append(img);if(d.text){const cap=document.createElement("div");cap.className="caption";cap.append(linkify(d.text));b.append(cap)}}
  }else b.append(linkify(d.text||""));
  const reactions=document.createElement("div");reactions.className="reactions";const rx=reactionMap[key]||{};["👍","❤️","😂","🔥"].forEach(e=>{const n=Object.values(rx).filter(v=>v===e).length;if(n){const rb=document.createElement("button");rb.textContent=`${e} ${n}`;rb.className=rx[auth.currentUser?.uid]===e?"active":"";rb.onclick=()=>addReaction(key,e);reactions.append(rb)}});
  const add=document.createElement("button");add.textContent="＋";add.title="Reaksi";add.onclick=()=>{const e=prompt("Pilih reaksi: 👍 ❤️ 😂 🔥","👍");if(["👍","❤️","😂","🔥"].includes(e))addReaction(key,e)};reactions.append(add);if(reactions.children.length>0)b.append(reactions);
  const actions=document.createElement("div");actions.className="msg-actions";
  const reply=document.createElement("button");reply.textContent="↩ Balas";reply.onclick=()=>replyTo(d,key);actions.append(reply);
  const copy=document.createElement("button");copy.textContent="Salin";copy.onclick=async()=>{try{await navigator.clipboard.writeText(d.text||d.url||"");toast("Pesan disalin")}catch{toast("Tidak bisa menyalin")}};actions.append(copy);
  if(d.type!=="text"){const open=document.createElement("button");open.textContent="Buka";open.onclick=()=>{const u=safeUrl(d.url||"");if(u)window.open(u,"_blank","noopener,noreferrer")};actions.append(open)}
  wrap.append(meta,b,actions);row.append(av,wrap);return row
}

function renderRows(opts={}){
  const forceBottom=!!opts.forceBottom;const nearBottom=(messages.scrollHeight-messages.scrollTop-messages.clientHeight)<=90;const oldScrollTop=messages.scrollTop;
  const now=Date.now(),f=(search?.value||"").trim().toLowerCase();
  const rows=allRows.filter(x=>x&&x.d).filter(x=>!Number.isFinite(Number(x.d.expiresAt))||Number(x.d.expiresAt)>now).filter(x=>!f||`${x.d.name||""} ${x.d.text||""}`.toLowerCase().includes(f)).sort((a,b)=>Number(a.d.createdAt||0)-Number(b.d.createdAt||0)).slice(-SHOW);
  messages.replaceChildren();if(!rows.length){messages.innerHTML='<div class="loading">Belum ada pesan yang cocok 👋</div>';updateUnreadButton();return}
  const frag=document.createDocumentFragment();let prevDate="";rows.forEach(x=>{const dl=dateLabel(x.d.createdAt);if(dl!==prevDate){const sep=document.createElement("div");sep.className="date-sep";sep.textContent=dl;frag.append(sep);prevDate=dl}frag.append(render(x.d,x.key))});messages.append(frag);
  requestAnimationFrame(()=>{if(forceBottom||nearBottom){messages.scrollTop=messages.scrollHeight;unread=0}else messages.scrollTop=oldScrollTop;updateUnreadButton()});
}
function updateUnreadButton(){const wrap=$("#jumpWrap");const countEl=$("#unreadCount");if(countEl)countEl.textContent=unread;wrap.hidden=unread===0||jumpDismissed}
function jumpBottom(){messages.scrollTo({top:messages.scrollHeight,behavior:"smooth"});unread=0;jumpDismissed=false;updateUnreadButton()}
function dismissJump(){jumpDismissed=true;updateUnreadButton()}

async function cleanupExpired(rows){if(cleanupRunning||!auth.currentUser)return;cleanupRunning=true;try{const expired=rows.filter(x=>x?.d&&Number(x.d.expiresAt)>0&&Number(x.d.expiresAt)<=Date.now()).slice(0,CLEAN_BATCH);await Promise.allSettled(expired.map(x=>remove(ref(db,`messages/${x.key}`))))}finally{cleanupRunning=false}}
function listen(){if(listening)return;listening=true;onValue(ref(db,"messages"),snap=>{const rows=[];snap.forEach(child=>rows.push({key:child.key,d:child.val()}));const oldKeys=new Set(allRows.map(x=>x.key));const incoming=rows.filter(x=>!oldKeys.has(x.key));const wasNear=(messages.scrollHeight-messages.scrollTop-messages.clientHeight)<=90;allRows=rows;renderRows();if(incoming.length&&!wasNear&&document.visibilityState==="visible"){unread+=incoming.length;jumpDismissed=false;updateUnreadButton();playPing()}status.textContent=`● Terhubung · ${rows.length} pesan`;status.className="online";cleanupExpired(rows)},err=>{console.error(err);status.textContent="● Database error";status.className="offline";messages.innerHTML='<div class="err">Gagal membaca pesan. Pastikan Rules Realtime Database dan Anonymous Auth aktif.</div>'});onValue(ref(db,"reactions"),snap=>{const map={};snap.forEach(m=>{map[m.key]=m.val()||{}});reactionMap=map;renderRows()})}

async function doSend(){if(!auth.currentUser)return toast("Masih menyambungkan ke server…");const now=Date.now();if(now-lastSent<SEND_COOLDOWN)return toast("Tunggu sebentar sebelum mengirim lagi.");const t=text.value.trim(),kind=type.value,u=url.value.trim();if(t.length>MAX)return toast("Maksimal 200 karakter.");if(kind==="text"&&!t)return toast("Tulis pesan terlebih dahulu.");let media="";if(kind!=="text"){media=safeUrl(u);if(!media)return toast("Masukkan URL http/https yang valid.")}send.disabled=true;const msgRef=push(ref(db,"messages"));const payload={uid:auth.currentUser.uid,name:getName(),text:t.slice(0,MAX),type:kind,url:media,createdAt:now,expiresAt:now+DAYS*86400000};if(replyTarget)payload.replyTo={key:replyTarget.key,name:replyTarget.name,text:replyTarget.text};try{await set(msgRef,payload);const key=msgRef.key;if(!allRows.some(x=>x.key===key))allRows.push({key,d:payload});renderRows({forceBottom:true});lastSent=Date.now();text.value="";url.value="";count.textContent="0";cancelReply();resize();toast("Pesan terkirim ✓");setTimeout(()=>text.focus(),0)}catch(e){console.error(e);toast(e?.code?`Gagal mengirim: ${e.code}`:"Gagal mengirim. Periksa Auth dan Rules.")}finally{send.disabled=false}}

function resize(){text.style.height="42px";text.style.height=Math.min(text.scrollHeight,110)+"px"}
text.addEventListener("input",()=>{if(text.value.length>MAX)text.value=text.value.slice(0,MAX);count.textContent=text.value.length;count.classList.toggle("limit",text.value.length>=MAX);localStorage.setItem("tchat-draft",text.value);resize()});
type.addEventListener("change",()=>url.hidden=type.value==="text");send.addEventListener("click",doSend);text.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend()}});
$("#reload").onclick=()=>location.reload();$("#theme").onclick=()=>{document.body.classList.toggle("light");localStorage.setItem("tchat-theme",document.body.classList.contains("light")?"light":"dark")};$("#clearSearch").onclick=()=>{search.value="";renderRows();search.focus()};search.addEventListener("input",renderRows);$("#jumpBottom").onclick=jumpBottom;$("#closeJump").onclick=dismissJump;$("#cancelReply").onclick=cancelReply;
document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{text.value+=(text.value?" ":"")+b.dataset.e;text.dispatchEvent(new Event("input"));text.focus()});
$("#profile").onclick=()=>{const n=prompt("Nama yang ditampilkan (maks. 30 karakter):",getName());if(n!==null){const v=n.trim().slice(0,30)||"Anonim";localStorage.setItem("tchat-name",v);$("#profileName").textContent=v;toast(`Nama: ${v}`)}};
$("#sound").onclick=()=>{audioEnabled=!audioEnabled;localStorage.setItem("tchat-sound",audioEnabled?"on":"off");$("#sound").textContent=audioEnabled?"🔔":"🔕";toast(audioEnabled?"Notifikasi suara aktif":"Notifikasi suara mati")};
if(localStorage.getItem("tchat-theme")==="light")document.body.classList.add("light");if(localStorage.getItem("tchat-draft")){text.value=localStorage.getItem("tchat-draft");text.dispatchEvent(new Event("input"))}$("#profileName").textContent=getName();$("#sound").textContent=audioEnabled?"🔔":"🔕";
messages.addEventListener("scroll",()=>{const near=(messages.scrollHeight-messages.scrollTop-messages.clientHeight)<=90;if(near){unread=0;updateUnreadButton()}});
function syncViewport(){const vv=window.visualViewport;if(!vv)return;document.documentElement.style.setProperty("--visual-h",`${vv.height}px`);document.documentElement.style.setProperty("--visual-top",`${vv.offsetTop}px`);document.documentElement.style.setProperty("--keyboard-bottom",`${Math.max(0,window.innerHeight-vv.height-vv.offsetTop)}px`)}
if(window.visualViewport){syncViewport();visualViewport.addEventListener("resize",syncViewport);visualViewport.addEventListener("scroll",syncViewport)}
send.disabled=true;onAuthStateChanged(auth,user=>{if(user){listen();send.disabled=false}else send.disabled=true});signInAnonymously(auth).catch(e=>{console.error(e);status.textContent="● Auth gagal";status.className="offline";messages.innerHTML='<div class="err">Aktifkan Authentication → Sign-in method → Anonymous di Firebase.</div>'});
