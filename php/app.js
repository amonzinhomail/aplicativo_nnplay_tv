const C = window.TV_CONFIG, $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => /^(https?:\/\/|\/(?!\/))/i.test(u || "") ? u : ""; // só http(s) ou caminho do site (bloqueia javascript: e //host)
// Valor seguro para dentro de url('...') no CSS: sem aspas, parênteses, barras invertidas ou espaços.
const cssUrl = u => safeUrl(u).replace(/['"()\\\s]/g, c => encodeURIComponent(c));
const ytThumb = id => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/maxresdefault.jpg`;

document.title = C.brand.name;

// ---------- Tela de carregamento ----------
const splash = $("#splash");
const splashOpen = () => !!splash && !splash.dataset.done;
function hideSplash() {
  if (!splashOpen()) return;
  splash.dataset.done = "1";
  setTimeout(() => { splash.classList.add("out"); setTimeout(() => splash.remove(), 600); }, Math.max(0, 500 - performance.now())); // mínimo de 0,5 s: evita "piscar"
}
setTimeout(hideSplash, 10000); // segurança: nunca fica preso

// Hospedagem comum (sem processo próprio): quando o conteúdo está vencido, o servidor avisa em TV_CONFIG.stale
// e o navegador pede a atualização. O visitante não espera: ele já recebeu o conteúdo guardado.
if (C.stale && C.refreshUrl) fetch(C.refreshUrl, { method: "POST", keepalive: true }).catch(() => {});

// Miniaturas do YouTube sem versão maxres: cai para hqdefault.
// O YouTube devolve uma imagem cinza de 120px (sem erro) quando não há versão maxres.
const fallbackThumb = e => {
  const i = e.target;
  if (i.tagName !== "IMG" || !i.src.includes("/maxresdefault.jpg")) return;
  if (e.type === "error" || i.naturalWidth <= 120) i.src = i.src.replace("maxresdefault", "hqdefault");
};
document.addEventListener("error", fallbackThumb, true);
document.addEventListener("load", fallbackThumb, true);

// Relógio
const tick = () => $("#clock").textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: C.brand.timeZone });
tick();
setInterval(tick, 15000);

// ---------- Cards (só imagem, como no original) ----------
function card(it, { thumb } = {}) {
  const img = safeUrl(it.image) || (it.id ? ytThumb(it.id) : "");
  const attrs = it.id || it.video ? `data-video="${esc(it.id || it.video)}"` : safeUrl(it.link) ? `href="${esc(it.link)}"` : "";
  return `<div class="slide"><a class="card" data-focus tabindex="0" aria-label="${esc(it.title)}" ${attrs}>${img ? `<img loading="lazy" src="${esc(img)}" alt="${esc(it.title)}">` : ""}</a></div>`;
}
const row = (items, cls = "") => `<div class="row ${cls}">${items.map(card).join("")}</div>`;
const section = (el, title, html) => { el.innerHTML = `<h2>${esc(title)}</h2>${html}`; el.hidden = false; };

if (C.upcoming && C.upcoming.length) section($("#upcoming"), "Próximas transmissões", row(C.upcoming));
if (C.shorts && C.shorts.length) section($("#shorts"), "Vídeos curtos", row(C.shorts, "short"));
$("#playlists").innerHTML = (C.playlists || []).map(p => {
  const cover = safeUrl(p.cover) || (p.videos[0] ? ytThumb(p.videos[0].id) : "");
  const art = safeUrl(p.cover) && !/^https:\/\/i\.ytimg\.com\//.test(p.cover); // arte própria (não miniatura)
  return `
  <div class="pl">
    ${p.noCover ? "" : `<a class="cover${art ? " art" : ""}" data-focus tabindex="0">
      <div class="bg" style="background-image:url('${esc(cssUrl(cover))}')"></div>
      <img src="${esc(cover)}" alt="${esc(p.title)}">
    </a>`}
    <h2>${esc(p.title)}</h2>
    ${row(p.videos, p.short ? "short" : "")}
  </div>`;
}).join("");

// ---------- Banners de destaque (gerenciados em /admin) ----------
fetch("/api/banners.php").then(r => r.json()).catch(() => []).then(list => {
  list = (Array.isArray(list) ? list : []).filter(b => safeUrl(b.image));
  if (!list.length) list = (C.banners || []).filter(b => safeUrl(b.image));
  if (!list.length) return;
  const box = $("#banners");
  box.innerHTML = `<div class="hero-track">${list.map(b => {
    const link = safeUrl(b.link);
    return `<${link ? "a" : "div"} class="hero-slide" ${link ? `href="${esc(link)}"` : ""} data-focus tabindex="0" aria-label="${esc(b.title)}"><img src="${esc(b.image)}" alt="${esc(b.title)}"></${link ? "a" : "div"}>`;
  }).join("")}</div>`;
  box.hidden = false;
  const track = box.firstElementChild, slides = [...track.children];
  let cur = 0, timer;
  const go = i => {
    cur = i;
    slides.forEach((s, k) => s.classList.toggle("on", k === i));
    // Centraliza o slide ativo na largura da tela.
    const pad = parseFloat(getComputedStyle(box).paddingLeft) || 0, s = slides[i];
    track.style.transform = `translateX(${box.clientWidth / 2 - pad - (s.offsetLeft + s.offsetWidth / 2)}px)`;
  };
  // Passa sozinho a cada 3 s, mesmo com o foco nele (o foco acompanha o slide ativo).
  const play = () => {
    clearInterval(timer);
    if (slides.length < 2) return;
    timer = setInterval(() => {
      const next = (cur + 1) % slides.length;
      if (box.contains(document.activeElement)) slides[next].focus({ preventScroll: true }); // dispara go()
      else go(next);
    }, 3000);
  };
  slides.forEach((s, i) => s.addEventListener("focus", () => { go(i); play(); })); // D-pad: foco move o carrossel
  addEventListener("resize", () => go(cur));
  go(0); play();
}).catch(() => {}).then(() => initialFocus()).then(() => {
  // espera a 1ª imagem do carrossel (no máx. 3 s) para a página não "estourar" de uma vez
  const img = document.querySelector(".hero-slide img");
  return img && !img.complete ? new Promise(res => { img.addEventListener("load", res, { once: true }); img.addEventListener("error", res, { once: true }); setTimeout(res, 3000); }) : null;
}).then(hideSplash);

// ---------- Ao vivo ----------
const wave = `<svg width="32" height="32" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8.5 2a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-1 0v-11a.5.5 0 0 1 .5-.5m-2 2a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5m4 0a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5m-6 1.5A.5.5 0 0 1 5 6v4a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m8 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m-10 1A.5.5 0 0 1 3 7v2a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5m12 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5"/></svg>`;
$("#live").innerHTML = C.live.map((l, i) => `
  <a class="live-slide" data-focus tabindex="0" data-live="${i}" style="${safeUrl(l.poster) ? `background-image:url('${esc(cssUrl(l.poster))}')` : ""}">
    ${l.hls ? "<video muted playsinline></video>" : ""}
    <div class="live-info"><span class="badge"><i></i>Ao vivo</span>
    <div><div class="t">${wave}<span>Assista agora</span></div><p>${esc(l.title)}</p></div></div>
  </a>`).join("");

function attachHls(video, src) {
  if (window.Hls && Hls.isSupported()) {
    const h = new Hls({ lowLatencyMode: true });
    h.loadSource(src);
    h.attachMedia(video);
    h.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR) setTimeout(() => h.startLoad(), 2000);
      else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
      else h.destroy();
    });
    return h;
  }
  video.src = src; // Safari/iOS: HLS nativo
  return null;
}
document.querySelectorAll("[data-live] video").forEach((v, i) => { attachHls(v, C.live[i].hls); v.play().catch(() => {}); });
document.querySelectorAll("[data-live]").forEach(a =>
  a.addEventListener("click", e => { e.preventDefault(); openLive(+a.dataset.live); }));

// ---------- Telas sobrepostas + botão Voltar (histórico) ----------
// Cada tela sobreposta (busca, player) empilha um estado no histórico. Assim o Voltar do
// controle remoto, do WebView do Android (goBack) e do navegador fecham uma tela por vez.
const overlays = [], focusStack = [];
const playerOpen = () => !$("#player").hidden;
const searchOpen = () => !$("#searchPanel").hidden;
function pushOverlay(name) {
  overlays.push(name);
  focusStack.push(document.activeElement);
  history.pushState({ tv: name, depth: overlays.length }, ""); // depth = quantas telas estão abertas neste ponto
}
function restoreFocus() {
  const el = focusStack.pop();
  if (el && document.contains(el) && el.offsetParent) el.focus({ preventScroll: true });
  else initialFocus();
}
addEventListener("popstate", () => {
  // Fecha as telas até a profundidade do estado atual (1 passo no Voltar; todas no botão "Página principal").
  const depth = (history.state && history.state.depth) || 0;
  while (overlays.length > depth) {
    const top = overlays.pop();
    if (top === "player") hidePlayer();
    else if (top === "search") hideSearch();
    restoreFocus();
  }
});
function exitApp() {
  try { if (window.tizen) return tizen.application.getCurrentApplication().exit(); } catch (_) {}
  try { if (window.webOS && webOS.platformBack) return webOS.platformBack(); } catch (_) {}
  try { if (window.AndroidTV && AndroidTV.exit) return AndroidTV.exit(); } catch (_) {}
  if (window.TV_NATIVE) window.close();
}
function goBack() {
  if (overlays.length) history.back();
  else exitApp();
}
// Fecha todas as telas sobrepostas de uma vez e volta à página principal.
function goHome() {
  if (overlays.length) history.go(-overlays.length);
}

// ---------- Player (YouTube via API oficial + HLS), controlado por D-pad ----------
let P = null, playToken = 0, hudTimer = 0, tickTimer = 0;
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60); return m + ":" + String(s % 60).padStart(2, "0"); };
let ytReady;
const loadYT = () => ytReady || (ytReady = new Promise(res => {
  if (window.YT && YT.Player) return res();
  window.onYouTubeIframeAPIReady = res;
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
}));

// Mostra a barra de progresso e o botão "Página principal"; somem sozinhos após alguns segundos sem uso.
function showHud() {
  const el = $("#player");
  el.classList.add("hud");
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => { el.classList.remove("hud"); if (document.activeElement === $("#closePlayer")) document.activeElement.blur(); }, 4500);
  updateHud();
}
function updateHud() {
  if (!P) return;
  const d = P.dur(), live = !isFinite(d) || d <= 0;
  $("#pFill").style.width = live ? "100%" : Math.min(100, (P.time() / d) * 100) + "%";
  $("#pTime").textContent = live ? "AO VIVO" : fmt(P.time()) + " / " + fmt(d);
}
function flashIcon(playing) {
  const i = $("#pIcon");
  i.textContent = playing ? "▶" : "❚❚";
  i.classList.remove("on"); void i.offsetWidth; i.classList.add("on");
}
function openPlayerShell() {
  $("#player").hidden = false;
  $("#pLoad").textContent = "Carregando player...";
  $("#pLoad").hidden = false;
  pushOverlay("player");
  tickTimer = setInterval(updateHud, 500);
  showHud();
}
async function openVideo(id) {
  const token = ++playToken;
  openPlayerShell();
  const host = document.createElement("div");
  $("#ytHost").replaceChildren(host);
  await loadYT();
  if (token !== playToken) return;
  // Transmissão agendada/indisponível nunca começa: avisa em vez de ficar "carregando" para sempre.
  setTimeout(() => {
    if (token === playToken && !$("#pLoad").hidden) $("#pLoad").textContent = "Este vídeo ainda não começou ou está indisponível. Pressione Voltar.";
  }, 10000);
  const yt = new YT.Player(host, {
    videoId: id, width: "100%", height: "100%",
    playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, origin: location.origin },
    events: {
      onReady: e => e.target.playVideo(),
      onStateChange: e => {
        if (token !== playToken) return;
        if (e.data === 1) $("#pLoad").hidden = true;
        if (e.data === 0) goBack(); // terminou
      },
      onError: () => { if (token === playToken) { $("#pLoad").hidden = false; $("#pLoad").textContent = "Vídeo indisponível. Pressione Voltar."; } },
    },
  });
  // Os métodos do player só existem depois do onReady: antes disso as chamadas são ignoradas (sem erro no console).
  const ready = () => typeof yt.getPlayerState === "function";
  P = {
    // estado 1 = tocando, 3 = carregando (logo após pular): ambos contam como "tocando"
    toggle: () => { if (!ready()) return true; const s = yt.getPlayerState(), playing = s === 1 || s === 3; playing ? yt.pauseVideo() : yt.playVideo(); return !playing; },
    play: () => { if (ready()) yt.playVideo(); }, pause: () => { if (ready()) yt.pauseVideo(); },
    seek: d => { if (ready()) yt.seekTo(Math.max(0, yt.getCurrentTime() + d), true); },
    time: () => ready() ? yt.getCurrentTime() : 0, dur: () => ready() ? yt.getDuration() : 0,
    destroy: () => { try { yt.destroy(); } catch (_) {} },
  };
}
function openLive(i) {
  const l = C.live[i];
  if (!l.hls) return;
  ++playToken;
  openPlayerShell();
  const v = document.createElement("video");
  v.autoplay = true; v.playsInline = true;
  v.style.cssText = "width:100%;height:100%;background:#000";
  v.addEventListener("playing", () => { $("#pLoad").hidden = true; });
  $("#ytHost").replaceChildren(v);
  const h = attachHls(v, l.hls);
  v.play().catch(() => {});
  P = {
    toggle: () => { if (v.paused) { v.play(); return true; } v.pause(); return false; },
    play: () => v.play(), pause: () => v.pause(),
    seek: d => { if (isFinite(v.duration)) v.currentTime = Math.max(0, v.currentTime + d); },
    time: () => v.currentTime, dur: () => v.duration,
    destroy: () => { if (h) h.destroy(); v.removeAttribute("src"); v.load(); },
  };
}
function hidePlayer() {
  ++playToken;
  clearInterval(tickTimer); clearTimeout(hudTimer);
  if (P) { P.destroy(); P = null; }
  $("#player").hidden = true;
  $("#player").classList.remove("hud");
  $("#ytHost").replaceChildren();
}
$("#closePlayer").onclick = () => goHome();
$("#player").addEventListener("click", e => { if (!e.target.closest("#closePlayer") && P) flashIcon(P.toggle()); showHud(); });
$("#player").addEventListener("mousemove", () => showHud());
document.addEventListener("click", e => {
  const c = e.target.closest("[data-video]");
  if (c) { e.preventDefault(); openVideo(c.dataset.video); }
});

// ---------- Busca (teclado na tela de 4 linhas, modo números) ----------
const all = [...(C.shorts || []), ...(C.playlists || []).flatMap(p => p.videos)].filter((v, i, a) => a.findIndex(x => x.id === v.id) === i);
let q = "", nums = false;
const LET = [["A", "B", "C", "D", "E", "F", "G", "<"], ["H", "I", "J", "K", "L", "M", "N", "#"], ["O", "P", "Q", "R", "S", "T", "U", ""], ["V", "W", "X", "Y", "Z", "-", " ", ""]];
const NUM = [["1", "2", "3", "4", "5", "6", "7", "<"], ["8", "9", "0", ".", ",", "!", "?", "#"], ["@", "&", "(", ")", "'", '"', ":", ""], [";", "+", "-", "_", "/", "*", " ", ""]];
function renderKb() {
  $("#kb").innerHTML = (nums ? NUM : LET).map(r => `<div class="kb-row">${r.map(k => {
    if (k === "") return '<span class="gap"></span>';
    if (k === "<") return `<button class="fn" data-focus tabindex="0" data-k="<" aria-label="Apagar">⌫</button>`;
    if (k === "#") return `<button class="fn" data-focus tabindex="0" data-k="#" aria-label="Alternar">${nums ? "ABC" : "&amp;123"}</button>`;
    if (k === " ") return `<button data-focus tabindex="0" data-k=" " aria-label="Espaço">␣</button>`;
    return `<button data-focus tabindex="0" data-k="${esc(k)}">${esc(k)}</button>`;
  }).join("")}</div>`).join("");
}
renderKb();
function renderSearch() {
  $("#searchLabel").textContent = q || "Buscar...";
  const r = all.filter(v => v.title.toLowerCase().includes(q.trim().toLowerCase()));
  $("#results").innerHTML = q.trim() ? (r.length ? r.map(card).join("") : "<p>Nenhum resultado.</p>") : "";
}
function openSearch() {
  if (searchOpen()) return;
  pushOverlay("search");
  $("#searchPanel").hidden = false;
  $("#home").hidden = true;
  $("#kb button").focus({ preventScroll: true });
}
function hideSearch() {
  $("#searchPanel").hidden = true;
  $("#home").hidden = false;
  q = ""; renderSearch();
}
$("#searchBtn").onclick = () => searchOpen() ? goBack() : openSearch();
$("#kb").addEventListener("click", e => {
  const b = e.target.closest("[data-k]");
  if (!b) return;
  if (b.dataset.k === "#") { nums = !nums; renderKb(); $('#kb [data-k="#"]').focus(); return; }
  q = b.dataset.k === "<" ? q.slice(0, -1) : q + b.dataset.k;
  renderSearch();
});

// ---------- Controle remoto / D-pad ----------
// Mapeia teclas de Samsung (Tizen), LG (webOS), Android TV e teclado comum para ações.
const BY_KEY = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  Enter: "enter", Escape: "back", GoBack: "back", BrowserBack: "back", Backspace: "back",
  MediaPlayPause: "playpause", MediaPlay: "play", MediaPause: "pause", MediaStop: "stop",
  MediaFastForward: "ff", MediaRewind: "rw", MediaTrackNext: "ff", MediaTrackPrevious: "rw",
};
const BY_CODE = {
  37: "left", 38: "up", 39: "right", 40: "down",
  13: "enter", 23: "enter", 66: "enter",          // 23/66: DPAD_CENTER do Android
  27: "back", 8: "back", 4: "back", 166: "back",   // 4: KEYCODE_BACK
  10009: "back",                                    // Tizen (Samsung)
  461: "back",                                      // webOS (LG)
  415: "play", 19: "pause", 413: "stop",            // mídia (Samsung/LG)
  10252: "playpause", 179: "playpause", 85: "playpause",
  417: "ff", 412: "rw", 228: "ff", 227: "rw", 176: "ff", 177: "rw",
};
const keyAction = e => BY_KEY[e.key] || BY_CODE[e.keyCode] || (e.key === " " ? "playpause" : null);
try { // Tizen: teclas de mídia só chegam ao app se registradas
  if (window.tizen && tizen.tvinputdevice) tizen.tvinputdevice.registerKeyBatch(["MediaPlay", "MediaPause", "MediaPlayPause", "MediaStop", "MediaFastForward", "MediaRewind"]);
} catch (_) {}

const focusables = () => [...document.querySelectorAll("[data-focus]")].filter(el => el.offsetParent !== null);
let stickyX = null; // lembra a coluna ao navegar na vertical

function reveal(el) {
  const row = el.closest(".row");
  if (row) { // centraliza o item na linha (instantâneo, para a próxima tecla medir certo)
    const rr = row.getBoundingClientRect(), er = el.getBoundingClientRect();
    row.scrollTo({ left: row.scrollLeft + (er.left + er.width / 2) - (rr.left + rr.width / 2), behavior: "instant" });
  }
  const r = el.getBoundingClientRect();
  if (r.top < 96 || r.bottom > innerHeight - 40) {
    scrollTo({ top: Math.max(0, scrollY + r.top + r.height / 2 - innerHeight / 2), behavior: "instant" });
  }
}
function focusEl(el) { el.focus({ preventScroll: true }); reveal(el); }

function initialFocus() {
  const a = document.activeElement;
  if (a && a !== document.body && a.hasAttribute && a.hasAttribute("data-focus")) return;
  const first = document.querySelector(".hero-slide.on") || document.querySelector(".live-slide") || focusables()[0];
  if (first) first.focus({ preventScroll: true });
}

function move(dir) {
  const items = focusables(), cur = document.activeElement;
  if (!items.includes(cur)) { initialFocus(); return true; }
  const horiz = dir === "left" || dir === "right";
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  if (horiz) stickyX = null; else if (stickyX === null) stickyX = cx;
  const X = horiz ? cx : stickyX;
  let best = null, bs = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
    let prim, sec, overlap;
    if (dir === "right") { if (bx <= cx) continue; prim = Math.max(0, b.left - r.right); sec = Math.abs(by - cy); overlap = Math.min(r.bottom, b.bottom) > Math.max(r.top, b.top); }
    else if (dir === "left") { if (bx >= cx) continue; prim = Math.max(0, r.left - b.right); sec = Math.abs(by - cy); overlap = Math.min(r.bottom, b.bottom) > Math.max(r.top, b.top); }
    else if (dir === "down") { if (by <= cy) continue; prim = Math.max(0, b.top - r.bottom); sec = Math.abs(bx - X); overlap = Math.min(r.right, b.right) > Math.max(r.left, b.left); }
    else { if (by >= cy) continue; prim = Math.max(0, r.top - b.bottom); sec = Math.abs(bx - X); overlap = Math.min(r.right, b.right) > Math.max(r.left, b.left); }
    const s = prim + sec * (overlap ? 0.35 : 3);
    if (s < bs) { bs = s; best = el; }
  }
  if (best) focusEl(best);
  return true; // sempre consome a seta: evita rolar a página por conta própria
}

function playerKey(act) {
  const closeBtn = $("#closePlayer");
  switch (act) {
    case "back": case "stop": goBack(); return true;
    case "enter":
      if (document.activeElement === closeBtn) { goHome(); return true; }
      // fallthrough
    case "playpause": if (P) flashIcon(P.toggle()); showHud(); return true;
    case "play": if (P) { P.play(); flashIcon(true); } showHud(); return true;
    case "pause": if (P) { P.pause(); flashIcon(false); } showHud(); return true;
    case "left": case "rw": if (P) P.seek(-10); showHud(); return true;
    case "right": case "ff": if (P) P.seek(10); showHud(); return true;
    case "up": showHud(); closeBtn.focus(); return true;
    case "down": if (document.activeElement === closeBtn) closeBtn.blur(); showHud(); return true;
  }
  return false;
}

function dispatch(act) {
  if (playerOpen()) return playerKey(act);
  switch (act) {
    case "left": case "right": case "up": case "down": return move(act);
    case "enter": {
      const el = document.activeElement;
      if (el && el !== document.body && el.hasAttribute("data-focus")) { el.click(); return true; }
      initialFocus(); return true;
    }
    case "back": goBack(); return true;
  }
  return false;
}

document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (splashOpen() && keyAction(e)) return e.preventDefault(); // durante o carregamento o controle remoto é ignorado
  // Teclado físico na busca (útil em testes e controles com teclado).
  if (searchOpen() && !playerOpen()) {
    if (e.key === "Backspace" && q) { q = q.slice(0, -1); renderSearch(); return e.preventDefault(); }
    if (/^[a-z0-9 \-]$/i.test(e.key)) { q += e.key.toUpperCase(); renderSearch(); return e.preventDefault(); }
  }
  const act = keyAction(e);
  if (!act) return;
  if (act === "enter" && e.repeat) return e.preventDefault();
  if (dispatch(act)) e.preventDefault();
});
document.addEventListener("mousemove", () => { stickyX = null; });

// API para o aplicativo nativo (WebView) enviar teclas e o botão Voltar:
//   Android: webView.evaluateJavascript("TV.back()", null)  |  TV.key('up')
window.TV = { back: goBack, key: dispatch };
// O foco inicial é dado após carregar os banners (ver o .then do fetch de /api/banners).
