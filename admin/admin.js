const $ = s => document.querySelector(s);
let banners = [];

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
  clearTimeout(flash.t); flash.t = setTimeout(() => m.textContent = "", 3500);
}
const safeImg = u => /^(https?:\/\/|\/(?!\/))/i.test(u) ? u : "";
function showLogin() { $("#app").hidden = true; $("#login").hidden = false; $("#pw").focus(); }
async function showApp() {
  banners = await api("GET", "/api/admin/banners");
  $("#login").hidden = true; $("#app").hidden = false; render();
}

function render() {
  const list = $("#list");
  list.replaceChildren();
  if (!banners.length) { list.innerHTML = '<p class="empty">Nenhum banner ainda. Clique em "+ Novo banner".</p>'; return; }
  banners.forEach((b, i) => list.append(itemEl(b, i)));
}

function itemEl(b, i) {
  const el = document.createElement("div");
  el.className = "item" + (b.active ? "" : " off");
  el.innerHTML = `
    <div class="preview"></div>
    <div class="fields">
      <p class="hint">O banner mostra só a imagem (proporção 2,74:1, ex.: 3840×1400; envie já comprimida, de preferência WEBP ou JPG de até 5 MB). Coloque o texto dentro da própria arte. Título e subtítulo servem de descrição de acessibilidade.</p>
      <label>Título (descrição)<input type="text" data-k="title" maxlength="120"></label>
      <label>Subtítulo (opcional)<input type="text" data-k="subtitle" maxlength="240"></label>
      <label>Link ao clicar (opcional)<input type="url" data-k="link" placeholder="https://..."></label>
      <label>Imagem (URL ou envie um arquivo)<input type="text" data-k="image" placeholder="https://... ou /uploads/..."></label>
      <div class="row">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-file>
        <label class="check"><input type="checkbox" data-k="active"> Ativo</label>
      </div>
      <div class="row">
        <button data-up ${i === 0 ? "disabled" : ""} title="Mover para cima">↑</button>
        <button data-down ${i === banners.length - 1 ? "disabled" : ""} title="Mover para baixo">↓</button>
        <span class="grow"></span>
        <button class="primary" data-save>Salvar</button>
        <button class="danger" data-del>Excluir</button>
      </div>
    </div>`;
  const val = k => el.querySelector(`[data-k="${k}"]`);
  const prev = el.querySelector(".preview");
  const paint = () => {
    const u = safeImg(val("image").value.trim());
    prev.style.backgroundImage = u ? `url("${u.replace(/"/g, "%22")}")` : "";
    prev.textContent = u ? "" : "sem imagem";
  };
  val("title").value = b.title; val("subtitle").value = b.subtitle; val("link").value = b.link;
  val("image").value = b.image; val("active").checked = b.active; paint();
  val("image").addEventListener("input", paint);

  el.querySelector("[data-file]").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const { url } = await api("POST", "/api/admin/upload", undefined, f); val("image").value = url; paint(); flash("Imagem enviada. Clique em Salvar."); }
    catch (err) { flash(err.message, true); }
  });
  el.querySelector("[data-save]").onclick = async () => {
    try {
      const body = { title: val("title").value, subtitle: val("subtitle").value, link: val("link").value.trim(), image: val("image").value.trim(), active: val("active").checked };
      banners[i] = await api("PUT", "/api/admin/banners/" + b.id, body); render(); flash("Salvo.");
    } catch (err) { flash(err.message, true); }
  };
  el.querySelector("[data-del]").onclick = async () => {
    if (!confirm("Excluir este banner?")) return;
    try { await api("DELETE", "/api/admin/banners/" + b.id); banners.splice(i, 1); render(); flash("Excluído."); }
    catch (err) { flash(err.message, true); }
  };
  const move = async d => {
    const j = i + d; if (j < 0 || j >= banners.length) return;
    [banners[i], banners[j]] = [banners[j], banners[i]];
    try { await api("PUT", "/api/admin/banners/order", { ids: banners.map(x => x.id) }); render(); }
    catch (err) { flash(err.message, true); }
  };
  el.querySelector("[data-up]").onclick = () => move(-1);
  el.querySelector("[data-down]").onclick = () => move(1);
  return el;
}

$("#add").onclick = async () => {
  try { banners.push(await api("POST", "/api/admin/banners", { title: "Novo banner", active: false })); render(); scrollTo(0, document.body.scrollHeight); }
  catch (err) { flash(err.message, true); }
};
$("#loginForm").onsubmit = async e => {
  e.preventDefault(); $("#loginErr").textContent = "";
  try { await api("POST", "/api/admin/login", { password: $("#pw").value }); $("#pw").value = ""; await showApp(); }
  catch (err) { $("#loginErr").textContent = err.message; }
};
$("#logout").onclick = async () => { await api("POST", "/api/admin/logout").catch(() => {}); showLogin(); };

showApp().catch(showLogin);
