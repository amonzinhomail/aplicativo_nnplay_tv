const $ = s => document.querySelector(s);
let banners = [], cfg = null;

async function api(method, url, body, raw) {
  const opt = { method, headers: {} };
  if (raw) { opt.headers["Content-Type"] = raw.type; opt.body = raw; }
  else if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  const r = await fetch(url, opt);
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.endsWith("/login")) { showLogin(); throw new Error("Sessão expirada."); }
  if (!r.ok) throw new Error(data.error || "Erro " + r.status);
  return data;
}
function flash(text, bad) {
  const m = $("#msg"); m.textContent = text; m.style.color = bad ? "#fca5a5" : "#86efac";
  clearTimeout(flash.t); flash.t = setTimeout(() => m.textContent = "", 4000);
}
const safeImg = u => /^(https?:\/\/|\/(?!\/))/i.test(u) ? u : "";
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
async function upload(file) { return (await api("POST", "/api/admin/upload", undefined, file)).url; }

function showLogin() { $("#app").hidden = true; $("#login").hidden = false; $("#pw").focus(); }
async function showApp() {
  [banners, cfg] = await Promise.all([api("GET", "/api/admin/banners"), api("GET", "/api/admin/config")]);
  $("#login").hidden = true; $("#app").hidden = false;
  renderBanners(); renderSettings();
}

// ---------- abas ----------
document.querySelectorAll(".tab").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t === b));
  for (const n of ["banners", "settings", "youtube"]) $("#tab-" + n).hidden = n !== b.dataset.tab;
  if (b.dataset.tab === "youtube") loadStatus();
});

// ---------- banners ----------
function renderBanners() {
  const list = $("#list");
  list.replaceChildren();
  if (!banners.length) { list.append(el("p", { className: "empty", textContent: 'Nenhum banner. Clique em "+ Novo banner".' })); return; }
  banners.forEach((b, i) => list.append(bannerEl(b, i)));
}
function bannerEl(b, i) {
  const item = el("div", { className: "item" + (b.active ? "" : " off") });
  const prev = el("div", { className: "preview" });
  const mk = (label, key, props = {}) => { const inp = el("input", { type: "text", ...props }); inp.dataset.k = key; return [el("label", {}, label, inp), inp]; };
  const [lTitle, iTitle] = mk("Título (descrição)", "title", { maxLength: 120 });
  const [lSub, iSub] = mk("Subtítulo (opcional)", "subtitle", { maxLength: 240 });
  const [lLink, iLink] = mk("Link ao clicar (opcional)", "link", { placeholder: "https://..." });
  const [lImg, iImg] = mk("Imagem (URL ou envie um arquivo)", "image", { placeholder: "https://... ou /uploads/..." });
  const file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" });
  const active = el("input", { type: "checkbox" });
  iTitle.value = b.title; iSub.value = b.subtitle; iLink.value = b.link; iImg.value = b.image; active.checked = b.active;
  const paint = () => { const u = safeImg(iImg.value.trim()); prev.style.backgroundImage = u ? `url("${u.replace(/"/g, "%22")}")` : ""; prev.textContent = u ? "" : "sem imagem"; };
  paint(); iImg.addEventListener("input", paint);
  file.onchange = async () => {
    if (!file.files[0]) return;
    try { iImg.value = await upload(file.files[0]); paint(); flash("Imagem enviada. Clique em Salvar."); } catch (e) { flash(e.message, true); }
  };
  const save = el("button", { className: "primary", textContent: "Salvar" });
  save.onclick = async () => {
    try {
      banners[i] = await api("PUT", "/api/admin/banners/" + b.id, { title: iTitle.value, subtitle: iSub.value, link: iLink.value.trim(), image: iImg.value.trim(), active: active.checked });
      renderBanners(); flash("Salvo.");
    } catch (e) { flash(e.message, true); }
  };
  const del = el("button", { className: "danger", textContent: "Excluir" });
  del.onclick = async () => {
    if (!confirm("Excluir este banner?")) return;
    try { await api("DELETE", "/api/admin/banners/" + b.id); banners.splice(i, 1); renderBanners(); flash("Excluído."); } catch (e) { flash(e.message, true); }
  };
  const move = async d => {
    const j = i + d; if (j < 0 || j >= banners.length) return;
    [banners[i], banners[j]] = [banners[j], banners[i]];
    try { await api("PUT", "/api/admin/banners/order", { ids: banners.map(x => x.id) }); renderBanners(); } catch (e) { flash(e.message, true); }
  };
  const up = el("button", { textContent: "↑", title: "Mover para cima", disabled: i === 0, onclick: () => move(-1) });
  const down = el("button", { textContent: "↓", title: "Mover para baixo", disabled: i === banners.length - 1, onclick: () => move(1) });
  item.append(prev, el("div", { className: "fields" },
    el("p", { className: "hint", textContent: "O banner mostra só a imagem (proporção 2,74:1, ex.: 3840×1400). Coloque o texto dentro da própria arte." }),
    lTitle, lSub, lLink, lImg,
    el("div", { className: "row" }, file, el("label", { className: "check" }, active, " Ativo")),
    el("div", { className: "row" }, up, down, el("span", { className: "grow" }), save, del)));
  return item;
}
$("#add").onclick = async () => {
  try { banners.push(await api("POST", "/api/admin/banners", { title: "Novo banner", active: false })); renderBanners(); scrollTo(0, document.body.scrollHeight); } catch (e) { flash(e.message, true); }
};

// ---------- configurações ----------
function renderSettings() {
  $("#brandName").value = cfg.brand.name; $("#brandTz").value = cfg.brand.timeZone;
  $("#channel").value = cfg.channel; $("#maxShorts").value = cfg.maxShorts; $("#maxPer").value = cfg.maxPerPlaylist; $("#refreshMin").value = cfg.refreshMinutes;
  renderLive(); renderPl();
}
function renderLive() {
  const box = $("#liveList"); box.replaceChildren();
  cfg.live.forEach((l, i) => {
    const t = el("input", { type: "text", value: l.title, maxLength: 80 }), h = el("input", { type: "text", value: l.hls, placeholder: "https://.../playlist.m3u8" }), p = el("input", { type: "text", value: l.poster, placeholder: "Imagem de capa (opcional)" });
    t.oninput = () => l.title = t.value; h.oninput = () => l.hls = h.value; p.oninput = () => l.poster = p.value;
    box.append(el("div", { className: "sub" }, el("label", {}, "Nome", t), el("label", {}, "URL do stream (https, .m3u8)", h), el("label", {}, "Capa", p),
      el("div", { className: "row" }, el("button", { className: "danger", textContent: "Remover", onclick: () => { cfg.live.splice(i, 1); renderLive(); } }))));
  });
}
$("#addLive").onclick = () => { if (cfg.live.length < 5) { cfg.live.push({ title: "", hls: "", poster: "" }); renderLive(); } };
function renderPl() {
  const box = $("#plList"); box.replaceChildren();
  cfg.playlists.forEach((p, i) => {
    const t = el("input", { type: "text", value: p.title, maxLength: 120 }), c = el("input", { type: "text", value: p.cover, placeholder: "URL da arte (opcional)" });
    const none = el("input", { type: "checkbox", checked: p.noCover }), f = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" });
    t.oninput = () => p.title = t.value; c.oninput = () => p.cover = c.value; none.onchange = () => p.noCover = none.checked;
    f.onchange = async () => { if (!f.files[0]) return; try { p.cover = c.value = await upload(f.files[0]); p.noCover = none.checked = false; flash("Arte enviada. Clique em Salvar configurações."); } catch (e) { flash(e.message, true); } };
    const mv = d => { const j = i + d; if (j < 0 || j >= cfg.playlists.length) return; [cfg.playlists[i], cfg.playlists[j]] = [cfg.playlists[j], cfg.playlists[i]]; renderPl(); };
    box.append(el("div", { className: "sub" }, el("label", {}, "Título da playlist", t), el("label", {}, "Capa (arte grande acima da playlist)", c),
      el("div", { className: "row" }, f, el("label", { className: "check" }, none, " Sem capa")),
      el("div", { className: "row" }, el("button", { textContent: "↑", disabled: i === 0, onclick: () => mv(-1) }), el("button", { textContent: "↓", disabled: i === cfg.playlists.length - 1, onclick: () => mv(1) }),
        el("span", { className: "grow" }), el("button", { className: "danger", textContent: "Remover", onclick: () => { cfg.playlists.splice(i, 1); renderPl(); } }))));
  });
}
$("#addPl").onclick = () => { if (cfg.playlists.length < 20) { cfg.playlists.push({ title: "", cover: "", noCover: true }); renderPl(); } };
$("#saveCfg").onclick = async () => {
  cfg.brand = { name: $("#brandName").value, logo: "", timeZone: $("#brandTz").value.trim() };
  cfg.channel = $("#channel").value.trim(); cfg.maxShorts = +$("#maxShorts").value; cfg.maxPerPlaylist = +$("#maxPer").value; cfg.refreshMinutes = +$("#refreshMin").value;
  try { cfg = await api("PUT", "/api/admin/config", cfg); renderSettings(); flash("Configurações salvas. Use a aba YouTube > Atualizar agora para aplicar as playlists."); } catch (e) { flash(e.message, true); }
};

// ---------- YouTube ----------
const when = t => t ? new Date(t).toLocaleString("pt-BR") : "nunca";
async function loadStatus() {
  try {
    const s = await api("GET", "/api/admin/status");
    const lines = [];
    if (!s.hasKey) lines.push("⚠ A chave YOUTUBE_API_KEY não está configurada no Cloudflare.");
    lines.push("Última atualização bem-sucedida: " + when(s.updatedAt));
    if (s.counts) lines.push(`Conteúdo guardado: ${s.counts.playlists} playlists, ${s.counts.shorts} Shorts, ${s.counts.upcoming} próximas transmissões.`);
    if (s.status && s.status.ok === false) lines.push("⚠ Última tentativa falhou: " + s.status.lastError);
    if (s.status && s.status.warnings && s.status.warnings.length) lines.push("Avisos: " + s.status.warnings.join(" | "));
    $("#ytInfo").textContent = lines.join("\n"); $("#ytInfo").style.whiteSpace = "pre-line";
  } catch (e) { $("#ytInfo").textContent = e.message; }
}
$("#refreshNow").onclick = async () => {
  const b = $("#refreshNow"); b.disabled = true; b.textContent = "Atualizando...";
  try { const r = await api("POST", "/api/admin/refresh"); flash(`Atualizado (${r.apiCalls} chamadas à API).`); } catch (e) { flash(e.message, true); }
  b.disabled = false; b.textContent = "Atualizar agora"; loadStatus();
};

$("#loginForm").onsubmit = async e => {
  e.preventDefault(); $("#loginErr").textContent = "";
  try { await api("POST", "/api/admin/login", { password: $("#pw").value }); $("#pw").value = ""; await showApp(); } catch (err) { $("#loginErr").textContent = err.message; }
};
$("#logout").onclick = async () => { await api("POST", "/api/admin/logout").catch(() => {}); showLogin(); };
showApp().catch(showLogin);
