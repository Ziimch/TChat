import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, push, set, query, orderByChild, limitToLast, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

// TChat V5.1 — konfigurasi project Firebase kamu
const firebaseConfig = {
  apiKey: "AIzaSyAC5Hzg9DInPVYJcKTM3bPKXE-OjzpvIGI",
  authDomain: "tchat-v2-ab202.firebaseapp.com",
  databaseURL: "https://tchat-v2-ab202-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tchat-v2-ab202",
  storageBucket: "tchat-v2-ab202.firebasestorage.app",
  messagingSenderId: "417009845131",
  appId: "1:417009845131:web:04d20be9eb471652b1258e"
};

const MAX = 200;
const DAYS = 7;
const SHOW = 100;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const $ = s => document.querySelector(s);
const messages = $("#messages"), text = $("#text"), url = $("#url"), type = $("#type");
const send = $("#send"), count = $("#count"), status = $("#status");

function safeUrl(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch { return null; }
}

function time(ms) {
  return Number.isFinite(ms)
    ? new Date(ms).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : "baru saja";
}

function render(d) {
  const row = document.createElement("div"); row.className = "msg";
  const av = document.createElement("div"); av.className = "avatar"; av.textContent = "T";
  const wrap = document.createElement("div"); wrap.className = "wrap";
  const meta = document.createElement("div"); meta.className = "meta";
  meta.textContent = `${d.name || "Anonim"} · ${time(d.createdAt)}`;
  const b = document.createElement("div"); b.className = "bubble";

  if (d.type === "image" || d.type === "gift") {
    const u = safeUrl(d.url || "");
    if (!u) b.textContent = "URL media tidak valid.";
    else {
      const img = document.createElement("img");
      img.className = "media-img"; img.src = u;
      img.alt = d.type === "gift" ? "Gift" : "Gambar";
      img.loading = "lazy"; img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        b.replaceChildren();
        const a = document.createElement("a");
        a.className = "media-link"; a.href = u; a.target = "_blank";
        a.rel = "noopener noreferrer"; a.textContent = "Buka media";
        b.append(a);
      };
      b.append(img);
      if (d.text) {
        const cap = document.createElement("div"); cap.textContent = d.text;
        b.append(cap);
      }
    }
  } else b.textContent = d.text || "";

  wrap.append(meta, b); row.append(av, wrap); return row;
}

let listening = false;
function listen() {
  if (listening) return; // cegah listener terpasang dobel jika auth state berubah lagi
  listening = true;
  const q = query(ref(db, "messages"), orderByChild("createdAt"), limitToLast(SHOW));
  onValue(q, snap => {
    messages.replaceChildren();
    const rows = [];
    snap.forEach(child => rows.push(child.val()));
    if (!rows.length) {
      messages.innerHTML = '<div class="loading">Belum ada pesan 👋</div>';
      return;
    }
    rows.forEach(d => {
      // Jangan tampilkan pesan yang sudah melewati masa hidupnya.
      if (!d.expiresAt || d.expiresAt > Date.now()) messages.append(render(d));
    });
    messages.scrollTop = messages.scrollHeight;
    status.textContent = "Terhubung"; status.style.color = "#86efac";
  }, err => {
    console.error(err);
    status.textContent = "Database error";
    messages.innerHTML = '<div class="err">Gagal membaca chat. Periksa Rules dan konfigurasi Firebase.</div>';
  });
}

async function doSend() {
  if (!auth.currentUser) return alert("Masih menyambungkan ke server, coba lagi sesaat lagi.");
  const t = text.value.trim(), kind = type.value, u = url.value.trim();
  if (t.length > MAX) return alert("Maksimal 200 karakter.");
  if (kind === "text" && !t) return alert("Tulis pesan terlebih dahulu.");

  let media = "";
  if (kind !== "text") {
    media = safeUrl(u);
    if (!media) return alert("Masukkan URL http/https yang valid.");
  }

  send.disabled = true;
  try {
    const now = Date.now();
    const msgRef = push(ref(db, "messages"));
    await set(msgRef, {
      uid: auth.currentUser.uid,
      name: "Anonim",
      text: t.slice(0, MAX),
      type: kind,
      url: media,
      createdAt: now,
      expiresAt: now + DAYS * 86400000
    });
    text.value = ""; url.value = ""; count.textContent = "0"; resize();
  } catch (e) {
    console.error(e);
    alert("Gagal mengirim. Periksa koneksi, Anonymous Auth, dan Rules.");
  } finally { send.disabled = false; text.focus(); }
}

function resize() {
  text.style.height = "42px";
  text.style.height = Math.min(text.scrollHeight, 110) + "px";
}

text.addEventListener("input", () => {
  if (text.value.length > MAX) text.value = text.value.slice(0, MAX);
  count.textContent = text.value.length; resize();
});
type.addEventListener("change", () => { url.hidden = type.value === "text"; });
send.addEventListener("click", doSend);
text.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
});
$("#reload").onclick = () => location.reload();

send.disabled = true;
onAuthStateChanged(auth, user => {
  if (user) { listen(); send.disabled = false; }
});
signInAnonymously(auth).catch(e => {
  console.error(e); status.textContent = "Anonymous Auth gagal";
  messages.innerHTML = '<div class="err">Aktifkan Authentication → Sign-in method → Anonymous di Firebase.</div>';
});
