// Atualiza o data.js com os vídeos do canal do YouTube (sem dependências).
//   node tools/sync-youtube.js            -> atualiza o data.js
//   node tools/sync-youtube.js --dry-run  -> só mostra o que mudaria
// Mantém do data.js atual: brand, banners, live e capas (cover) que você trocou à mão.
// Também é usado pelo server.js quando a variável SYNC_HOURS está definida.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const { ROOT, DATA_JS: DATA_FILE } = require("../paths"); // em produção o data.js fica no disco persistente
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, "sync-config.json"), "utf8"));
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
  Cookie: "CONSENT=YES+1; SOCS=CAI",
};

const clean = s => String(s || "").replace(/\s+/g, " ").trim();
const norm = s => clean(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const maxres = id => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
const walk = (o, f) => { if (o && typeof o === "object") { f(o); for (const k in o) walk(o[k], f); } };

const sleep = ms => new Promise(r => setTimeout(r, ms));

// O YouTube responde de forma intermitente (limite de requisições, página sem dados): tenta de novo com espera.
async function pageData(url, tries = 4) {
  let err;
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(2000 * i);
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
      const m = (await r.text()).match(/ytInitialData\s*=\s*(\{.*?\});<\/script>/s);
      if (!m) throw new Error(`Formato inesperado do YouTube em ${url}`);
      return JSON.parse(m[1]);
    } catch (e) { err = e; }
  }
  throw err;
}

function collect(d) {
  const videos = [], shorts = [];
  walk(d, o => {
    const v = o.lockupViewModel;
    if (v && v.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") {
      const meta = v.metadata.lockupMetadataViewModel, rows = JSON.stringify(meta.metadata || "");
      videos.push({ id: v.contentId, title: clean(meta.title.content), upcoming: /Programado para|Estreia/.test(rows), when: (rows.match(/Programado para ([^"]+)/) || [])[1] });
    }
    const s = o.shortsLockupViewModel;
    const sid = s && s.onTap && s.onTap.innertubeCommand && s.onTap.innertubeCommand.reelWatchEndpoint && s.onTap.innertubeCommand.reelWatchEndpoint.videoId;
    if (sid) shorts.push({ id: sid, title: clean(s.overlayMetadata && s.overlayMetadata.primaryText && s.overlayMetadata.primaryText.content) });
  });
  return { videos, shorts };
}

function readCurrent() {
  const file = fs.existsSync(DATA_FILE) ? DATA_FILE : path.join(ROOT, "data.js");
  if (!fs.existsSync(file)) return {};
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), ctx, { timeout: 1000 });
  return ctx.window.TV_CONFIG || {};
}

async function sync({ dryRun = false, log = console.log } = {}) {
  const base = `https://www.youtube.com/${CONFIG.channel}`;
  const current = readCurrent();

  // 1) playlists do canal: título -> id
  const ids = new Map();
  walk(await pageData(`${base}/playlists`), o => {
    const v = o.lockupViewModel;
    if (v && v.contentType === "LOCKUP_CONTENT_TYPE_PLAYLIST") ids.set(norm(v.metadata.lockupMetadataViewModel.title.content), v.contentId);
  });
  if (!ids.size) throw new Error("Nenhuma playlist encontrada no canal.");

  // 2) shorts e próximas transmissões
  const shorts = collect(await pageData(`${base}/shorts`)).shorts.slice(0, CONFIG.maxShorts);
  const upcoming = collect(await pageData(`${base}/streams`)).videos.filter(v => v.upcoming).reverse();

  // 3) playlists pedidas (na ordem do arquivo de configuração)
  const oldByTitle = new Map((current.playlists || []).map(p => [norm(p.title), p]));
  const playlists = [];
  for (const title of CONFIG.playlists) {
    const id = ids.get(norm(title));
    if (!id) { log(`! playlist não encontrada no canal: ${title}`); continue; }
    await sleep(500); // pausa curta entre playlists: reduz a chance de bloqueio
    const c = collect(await pageData(`https://www.youtube.com/playlist?list=${id}`));
    const isShort = c.shorts.length > 0 && c.videos.length === 0;
    const vids = (isShort ? c.shorts : c.videos.filter(v => !v.upcoming)).slice(0, CONFIG.maxPerPlaylist).map(v => ({ id: v.id, title: v.title }));
    if (!vids.length) { log(`! playlist sem vídeos, mantida a anterior: ${title}`); if (oldByTitle.has(norm(title))) playlists.push(oldByTitle.get(norm(title))); continue; }
    const old = oldByTitle.get(norm(title));
    const customCover = old && old.cover && !/^https:\/\/i\.ytimg\.com\/vi\//.test(old.cover) ? old.cover : null; // capa trocada à mão
    const p = { title, cover: customCover || maxres(vids[0].id), videos: vids };
    if (old && old.noCover) { delete p.cover; p.noCover = true; } // playlist sem capa, por escolha sua
    if (isShort) p.short = true;
    playlists.push(p);
    log(`${title.padEnd(28)} ${vids.length} ${isShort ? "shorts" : "vídeos"}`);
  }
  if (!playlists.length || !shorts.length) throw new Error("Coleta incompleta; data.js não foi alterado.");

  const next = {
    brand: current.brand || { name: "Minha TV", logo: "", timeZone: "America/Sao_Paulo" },
    banners: current.banners || [],
    live: current.live || [],
    upcoming: upcoming.map(u => ({ title: u.title, video: u.id, image: maxres(u.id), when: u.when })),
    shorts: shorts.map(s => ({ id: s.id, title: s.title })),
    playlists,
  };
  log(`Próximas transmissões: ${next.upcoming.length} | Shorts: ${next.shorts.length} | Playlists: ${playlists.length}`);
  if (dryRun) { log("(dry-run: nada gravado)"); return next; }

  const header = `// Conteúdo importado de https://www.youtube.com/${CONFIG.channel} (atualizado em ${new Date().toLocaleString("pt-BR")}).\n` +
    `// Gerado por tools/sync-youtube.js. brand, banners, live e capas trocadas à mão são preservados.\n`;
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, DATA_FILE + ".bak");
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, header + "window.TV_CONFIG = " + JSON.stringify(next, null, 2) + ";\n");
  fs.renameSync(tmp, DATA_FILE);
  log("data.js atualizado (backup em data.js.bak).");
  return next;
}

module.exports = { sync };
if (require.main === module) sync({ dryRun: process.argv.includes("--dry-run") }).catch(e => { console.error("Falhou:", e.message); process.exit(1); });
