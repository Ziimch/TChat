import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, push, set, onValue, remove } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const firebaseConfig={apiKey:"AIzaSyAC5Hzg9DInPVYJcKTM3bPKXE-OjzpvIGI",authDomain:"tchat-v2-ab202.firebaseapp.com",databaseURL:"https://tchat-v2-ab202-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"tchat-v2-ab202",storageBucket:"tchat-v2-ab202.firebasestorage.app",messagingSenderId:"417009845131",appId:"1:417009845131:web:04d20be9eb471652b1258e"};
const MAX=200,DAYS=7,SHOW=200,CLEAN_BATCH=30,SEND_COOLDOWN=1800;
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const $=s=>document.querySelector(s),messages=$("#messages"),text=$("#text"),url=$("#url"),type=$("#type"),send=$("#send"),count=$("#count"),status=$("#status"),search=$("#search");
let allRows=[],listening=false,lastSent=0,cleanupRunning=false;

function safeUrl(v){try{const u=new URL(v);return ["https:","http:"].includes(u.protocol)?u.href:null}catch{return null}}
function time(ms){const n=Number(ms);return Number.isFinite(n)&&n>0?new Date(n).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}):"baru saja"}
function initials(n){return (n||"Anonim").trim().slice(0,1).toUpperCase()||"T"}
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove("show"),1800)}

function render(d,key){
  const row=document.createElement("article");row.className="msg";row.dataset.key=key;
  const av=document.createElement("div");av.className="avatar";av.textContent=initials(d.name);
  const wrap=document.createElement("div");wrap.className="wrap";
  const meta=document.createElement("div");meta.className="meta";meta.textContent=`${d.name||"Anonim"} · ${time(d.createdAt)}`;
  const b=document.createElement("div");b.className="bubble";
  if(d.type==="image"||d.type==="gift"){
    const u=safeUrl(d.url||"");
    if(!u)b.textContent="URL media tidak valid.";
    else{
      const img=document.createElement("img");img.className="media-img";img.src=u;img.alt=d.type==="gift"?"Gift":"Gambar";img.loading="lazy";img.referrerPolicy="no-referrer";
      img.onerror=()=>{b.replaceChildren();const a=document.createElement("a");a.className="media-link";a.href=u;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Buka media";b.append(a)};
      b.append(img);if(d.text){const cap=document.createElement("div");cap.className="caption";cap.textContent=d.text;b.append(cap)}
    }
  }else b.textContent=d.text||"";
  const actions=document.createElement("div");actions.className="msg-actions";
  const copy=document.createElement("button");copy.textContent="Salin";copy.onclick=async()=>{try{await navigator.clipboard.writeText(d.text||d.url||"");toast("Pesan disalin")}catch{toast("Tidak bisa menyalin")}};actions.append(copy);
  if(d.type!=="text"){const open=document.createElement("button");open.textContent="Buka";open.onclick=()=>{const u=safeUrl(d.url||"");if(u)window.open(u,"_blank","noopener,noreferrer")};actions.append(open)}
  wrap.append(meta,b,actions);row.append(av,wrap);return row
}

function renderRows(){
  const now=Date.now(),f=(search?.value||"").trim().toLowerCase();
  const rows=allRows
    .filter(x=>x&&x.d)
    .filter(x=>!Number.isFinite(Number(x.d.expiresAt))||Number(x.d.expiresAt)>now)
    .filter(x=>!f||`${x.d.name||""} ${x.d.text||""}`.toLowerCase().includes(f))
    .sort((a,b)=>Number(a.d.createdAt||0)-Number(b.d.createdAt||0))
    .slice(-SHOW);
  messages.replaceChildren();
  if(!rows.length){messages.innerHTML='<div class="loading">Belum ada pesan yang cocok 👋</div>';return}
  const frag=document.createDocumentFragment();rows.forEach(x=>frag.append(render(x.d,x.key)));messages.append(frag);
  messages.scrollTop=messages.scrollHeight;
}

async function cleanupExpired(rows){
  if(cleanupRunning||!auth.currentUser)return;cleanupRunning=true;
  try{
    const expired=rows.filter(x=>x?.d&&Number(x.d.expiresAt)>0&&Number(x.d.expiresAt)<=Date.now()).slice(0,CLEAN_BATCH);
    await Promise.allSettled(expired.map(x=>remove(ref(db,`messages/${x.key}`))));
  }finally{cleanupRunning=false}
}

function listen(){
  if(listening)return;listening=true;
  // Sengaja membaca node messages langsung. Ini menghindari masalah query/index
  // dan membuat TChat tetap kompatibel dengan pesan lama dari V4/V5.
  onValue(ref(db,"messages"),snap=>{
    const rows=[];snap.forEach(child=>rows.push({key:child.key,d:child.val()}));
    allRows=rows;
    renderRows();
    status.textContent=`● Terhubung · ${rows.length} pesan`;
    status.className="online";
    cleanupExpired(rows);
  },err=>{
    console.error("Realtime read error:",err);
    status.textContent="● Database error";status.className="offline";
    messages.innerHTML='<div class="err">Gagal membaca pesan. Pastikan Rules Realtime Database sudah dipasang dan Anonymous Auth aktif.</div>';
  });
}

async function doSend(){
  if(!auth.currentUser)return toast("Masih menyambungkan ke server…");
  const now=Date.now();
  if(now-lastSent<SEND_COOLDOWN)return toast("Tunggu sebentar sebelum mengirim lagi.");
  const t=text.value.trim(),kind=type.value,u=url.value.trim();
  if(t.length>MAX)return toast("Maksimal 200 karakter.");
  if(kind==="text"&&!t)return toast("Tulis pesan terlebih dahulu.");
  let media="";if(kind!=="text"){media=safeUrl(u);if(!media)return toast("Masukkan URL http/https yang valid.")}
  send.disabled=true;
  const msgRef=push(ref(db,"messages"));
  const payload={uid:auth.currentUser.uid,name:"Anonim",text:t.slice(0,MAX),type:kind,url:media,createdAt:now,expiresAt:now+DAYS*86400000};
  try{
    await set(msgRef,payload);
    // Optimistic update: pesan langsung muncul tanpa menunggu callback realtime.
    const key=msgRef.key;
    if(!allRows.some(x=>x.key===key))allRows.push({key,d:payload});
    renderRows();
    lastSent=Date.now();text.value="";url.value="";count.textContent="0";resize();
    toast("Pesan terkirim ✓");setTimeout(()=>text.focus(),0);
  }catch(e){console.error("Send error:",e);toast(e?.code?`Gagal mengirim: ${e.code}`:"Gagal mengirim. Periksa Auth dan Rules.")}
  finally{send.disabled=false}
}

function resize(){text.style.height="42px";text.style.height=Math.min(text.scrollHeight,110)+"px"}
text.addEventListener("input",()=>{if(text.value.length>MAX)text.value=text.value.slice(0,MAX);count.textContent=text.value.length;count.classList.toggle("limit",text.value.length>=MAX);resize()});
type.addEventListener("change",()=>url.hidden=type.value==="text");send.addEventListener("click",doSend);
text.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend()}});
$("#reload").onclick=()=>location.reload();
$("#theme").onclick=()=>{document.body.classList.toggle("light");localStorage.setItem("tchat-theme",document.body.classList.contains("light")?"light":"dark")};
$("#clearSearch").onclick=()=>{search.value="";renderRows();search.focus()};search.addEventListener("input",renderRows);
document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{text.value+=(text.value?" ":"")+b.dataset.e;text.dispatchEvent(new Event("input"));text.focus()});
if(localStorage.getItem("tchat-theme")==="light")document.body.classList.add("light");

function syncViewport(){const vv=window.visualViewport;if(!vv)return;document.documentElement.style.setProperty("--visual-h",`${vv.height}px`);document.documentElement.style.setProperty("--visual-top",`${vv.offsetTop}px`)}
if(window.visualViewport){syncViewport();visualViewport.addEventListener("resize",syncViewport);visualViewport.addEventListener("scroll",syncViewport)}

send.disabled=true;
onAuthStateChanged(auth,user=>{if(user){listen();send.disabled=false}else{send.disabled=true}});
signInAnonymously(auth).catch(e=>{console.error(e);status.textContent="● Auth gagal";status.className="offline";messages.innerHTML='<div class="err">Aktifkan Authentication → Sign-in method → Anonymous di Firebase.</div>'});
