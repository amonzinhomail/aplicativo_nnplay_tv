// Worker único: API de banners, /admin, imagens enviadas (KV), data.js dinâmico e atualização do YouTube.
// Arquivos estáticos (index.html, style.css, app.js, /admin/*, /seed/*) vêm de ./public via ASSETS.
import { DEFAULT_CONFIG, DEFAULT_BANNERS } from "./defaults.js";
import { syncFromYouTube, norm } from "./youtube.js";

const enc = new TextEncoder();
const SESSION_MS = 8 * 3600 * 1000;
const MAX_UPLOAD = 5 * 1024 * 1024;
const IMG_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const SEC = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN", "Referrer-Policy": "strict-origin-when-cross-origin" };

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...SEC, ...headers } });
const str = (v, max) => String(v ?? "").slice(0, max);
const safeUrl = v => { const s = str(v, 2000).trim(); return s === "" || /^(https?:\/\/|\/(?!\/))/i.test(s) ? s : ""; }; // só http(s) ou caminho do site: bloqueia javascript:, data:, //host
const httpsUrl = v => { const s = str(v, 2000).trim(); return /^https:\/\//i.test(s) ? s : ""; };
const scrub = m => String(m).replace(/key=[^&s"']+/gi, "key=***").slice(0, 300);
const clamp = (v, lo, hi, d) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const validTz = tz => { try { new Intl.DateTimeFormat("pt-BR", { timeZone: tz }); return true; } catch { return false; } };

// ---------- autenticação sem estado (cookie assinado; Workers não guardam memória entre requisições) ----------
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(secret, data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
async function safeEq(a, b) { // comparação em tempo constante (via hash)
  const h = async s => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(s))));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let d = 0; for (let i = 0; i < 32; i++) d |= x[i] ^ y[i];
  return d === 0;
}
// A assinatura usa uma chave ALEATÓRIA guardada no KV ("sk"), não derivada da senha: um cookie capturado não
// permite descobrir a senha offline. Trocar a senha ou clicar em "Sair" gira a chave e invalida todas as sessões.
const sha256hex = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(s))))].map(x => x.toString(16).padStart(2, "0")).join("");
async function signKey(env, create) {
  let k = await env.NN_KV.get("sk");
  if (!k && create) { k = hex(32); await env.NN_KV.put("sk", k); }
  return k ? `${k}:${await sha256hex(env.ADMIN_PASSWORD)}` : null;
}
const rotateSessions = env => env.NN_KV.put("sk", hex(32));
async function makeToken(env) { const p = String(Date.now() + SESSION_MS); return `${p}.${await hmac(await signKey(env, true), "sid:" + p)}`; }
async function isAuthed(env, req) {
  const m = /(?:^|;\s*)sid=([\w.-]+)/.exec(req.headers.get("Cookie") || "");
  if (!m || !env.ADMIN_PASSWORD) return false;
  const [p, sig] = m[1].split(".");
  if (!p || !sig || +p < Date.now()) return false;
  const key = await signKey(env, false);
  return key ? safeEq(sig, await hmac(key, "sid:" + p)) : false;
}
const cookie = (req, value, maxAge) => `sid=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;

// ---------- dados no KV ----------
function cleanConfig(c = {}) {
  const d = DEFAULT_CONFIG;
  const tz = str(c.brand && c.brand.timeZone, 60) || d.brand.timeZone;
  return {
    brand: { name: str(c.brand && c.brand.name, 60).trim() || d.brand.name, logo: safeUrl(c.brand && c.brand.logo), timeZone: validTz(tz) ? tz : d.brand.timeZone },
    live: (Array.isArray(c.live) ? c.live : []).slice(0, 5)
      .map(l => ({ title: str(l.title, 80).trim(), hls: httpsUrl(l.hls), poster: safeUrl(l.poster) })).filter(l => l.title || l.hls),
    channel: str(c.channel, 60).trim() || d.channel,
    maxShorts: clamp(c.maxShorts, 0, 50, d.maxShorts),
    maxPerPlaylist: clamp(c.maxPerPlaylist, 1, 50, d.maxPerPlaylist),
    refreshMinutes: clamp(c.refreshMinutes, 5, 1440, d.refreshMinutes),
    playlists: (Array.isArray(c.playlists) ? c.playlists : []).slice(0, 20)
      .map(p => ({ title: str(p.title, 120).trim(), cover: safeUrl(p.cover), noCover: !!p.noCover })).filter(p => p.title),
  };
}
const getConfig = async env => cleanConfig((await env.NN_KV.get("config", "json")) || DEFAULT_CONFIG);
const getBanners = async env => (await env.NN_KV.get("banners", "json")) ?? DEFAULT_BANNERS; // [] salvo = sem banners
const cleanBanner = b => ({ title: str(b.title, 120), subtitle: str(b.subtitle, 240), image: safeUrl(b.image), link: safeUrl(b.link), active: b.active !== false });

// Memória curta por instância do Worker: evita várias leituras do KV a cada visita.
const memo = new Map();
async function memoized(key, ttlMs, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  memo.set(key, { t: Date.now(), v });
  return v;
}
const forget = () => memo.clear();

// ---------- atualização do YouTube (ao entrar no site, com cache) ----------
let refreshing = null;
async function refreshNow(env) {
  if (refreshing) return refreshing;                       // evita duas atualizações ao mesmo tempo nesta instância
  refreshing = (async () => {
    const cfg = await getConfig(env);
    const started = Date.now();
    try {
      const content = await syncFromYouTube(cfg, env);
      content.updatedAt = Date.now();
      await env.NN_KV.put("content", JSON.stringify(content));
      await env.NN_KV.put("status", JSON.stringify({ ok: true, lastAttempt: started, updatedAt: content.updatedAt, apiCalls: content.apiCalls, warnings: content.warnings }));
      forget();
      return content;
    } catch (e) {
      await env.NN_KV.put("status", JSON.stringify({ ok: false, lastAttempt: started, lastError: scrub(e.message) }));
      throw e;
    } finally { refreshing = null; }
  })();
  return refreshing;
}
// A cada visita: se o conteúdo passou do prazo, atualiza em segundo plano (o visitante recebe o conteúdo guardado).
// Após uma falha, só tenta de novo depois de 2 min, para não gastar a cota do YouTube à toa.
async function maybeRefresh(env, ctx, cfg, content) {
  if (!env.YOUTUBE_API_KEY) return content;
  const status = (await env.NN_KV.get("status", "json")) || {};
  const now = Date.now();
  if (status.lastAttempt && now - status.lastAttempt < 2 * 60000) return content;
  if (content && now - content.updatedAt <= cfg.refreshMinutes * 60000) return content;
  if (!content) return refreshNow(env).catch(() => null);     // 1ª visita de todas: espera o conteúdo inicial
  ctx.waitUntil(refreshNow(env).catch(() => {}));
  return content;
}

// ---------- data.js (o front lê window.TV_CONFIG, igual ao servidor Node) ----------
async function buildDataJs(env, ctx) {
  const cfg = await getConfig(env);
  let content = await env.NN_KV.get("content", "json");
  content = await maybeRefresh(env, ctx, cfg, content);
  const byTitle = new Map(cfg.playlists.map(p => [norm(p.title), p]));
  const playlists = ((content && content.playlists) || []).filter(p => byTitle.has(norm(p.title))).map(p => {
    const o = byTitle.get(norm(p.title)), r = { title: p.title, videos: p.videos };
    if (o.noCover) r.noCover = true; else if (o.cover) r.cover = o.cover; // sem cover: o front usa a miniatura do 1º vídeo
    if (p.short) r.short = true;
    return r;
  });
  // respeita a ordem escolhida no /admin
  playlists.sort((a, b) => cfg.playlists.findIndex(x => norm(x.title) === norm(a.title)) - cfg.playlists.findIndex(x => norm(x.title) === norm(b.title)));
  const tv = { brand: cfg.brand, banners: [], live: cfg.live, upcoming: (content && content.upcoming) || [], shorts: (content && content.shorts) || [], playlists };
  return "window.TV_CONFIG = " + JSON.stringify(tv).replace(/</g, "\\u003c") + ";\n";
}

// ---------- rotas ----------
async function readJson(req, limit = 64 * 1024) {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > limit) throw Object.assign(new Error("too_large"), { code: 413 });
  try { return JSON.parse(new TextDecoder().decode(buf) || "{}"); } catch { throw Object.assign(new Error("bad_json"), { code: 400 }); }
}
const magicOk = (ext, b) => ({
  png: () => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: () => b[0] === 0xff && b[1] === 0xd8,
  gif: () => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  webp: () => String.fromCharCode(...b.slice(8, 12)) === "WEBP",
}[ext]());
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(x => x.toString(16).padStart(2, "0")).join("");

async function admin(req, env, ctx, path) {
  if (!(await isAuthed(env, req))) return json({ error: "Não autenticado." }, 401);
  const origin = req.headers.get("Origin");
  if (req.method !== "GET" && origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "Origem não permitida." }, 403);
  const kv = env.NN_KV;

  if (req.method === "GET" && path === "/banners") return json(await getBanners(env));
  if (req.method === "POST" && path === "/banners") {
    const list = await getBanners(env), b = { id: crypto.randomUUID(), ...cleanBanner(await readJson(req)) };
    list.push(b); await kv.put("banners", JSON.stringify(list)); forget();
    return json(b, 201);
  }
  if (req.method === "PUT" && path === "/banners/order") {
    const { ids } = await readJson(req), list = await getBanners(env), by = new Map(list.map(b => [b.id, b]));
    const sorted = (Array.isArray(ids) ? ids : []).map(i => by.get(i)).filter(Boolean);
    await kv.put("banners", JSON.stringify([...sorted, ...list.filter(b => !sorted.includes(b))])); forget();
    return json({ ok: true });
  }
  let m = /^\/banners\/([\w-]+)$/.exec(path);
  if (m && req.method === "PUT") {
    const list = await getBanners(env), i = list.findIndex(b => b.id === m[1]);
    if (i < 0) return json({ error: "Banner não encontrado." }, 404);
    list[i] = { id: m[1], ...cleanBanner(await readJson(req)) };
    await kv.put("banners", JSON.stringify(list)); forget();
    return json(list[i]);
  }
  if (m && req.method === "DELETE") {
    const list = await getBanners(env), b = list.find(x => x.id === m[1]);
    if (!b) return json({ error: "Banner não encontrado." }, 404);
    const rest = list.filter(x => x.id !== m[1]);
    await kv.put("banners", JSON.stringify(rest));
    const cfg = await getConfig(env);
    const stillUsed = [...rest.map(x => x.image), ...cfg.playlists.map(p => p.cover)].includes(b.image);
    if (b.image && b.image.startsWith("/uploads/") && !stillUsed) await kv.delete("img:" + b.image.slice(9));
    forget();
    return json({ ok: true });
  }
  if (req.method === "POST" && path === "/upload") {
    const ext = IMG_TYPES[(req.headers.get("Content-Type") || "").split(";")[0]];
    if (!ext) return json({ error: "Use PNG, JPG, WEBP ou GIF." }, 415);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX_UPLOAD) return json({ error: "Arquivo muito grande (máx. 5 MB)." }, 413);
    if (buf.byteLength < 12 || !magicOk(ext, new Uint8Array(buf))) return json({ error: "Arquivo não é uma imagem válida." }, 415);
    const name = `${hex(12)}.${ext}`;
    await kv.put("img:" + name, buf, { metadata: { type: Object.keys(IMG_TYPES).find(k => IMG_TYPES[k] === ext) } });
    return json({ url: "/uploads/" + name }, 201);
  }
  if (req.method === "GET" && path === "/config") return json(await getConfig(env));
  if (req.method === "PUT" && path === "/config") {
    const cfg = cleanConfig(await readJson(req, 128 * 1024));
    await kv.put("config", JSON.stringify(cfg)); forget();
    return json(cfg);
  }
  if (req.method === "GET" && path === "/status") {
    const [status, content] = await Promise.all([kv.get("status", "json"), kv.get("content", "json")]);
    return json({ hasKey: !!env.YOUTUBE_API_KEY, status: status || null, updatedAt: content ? content.updatedAt : null, counts: content ? { upcoming: content.upcoming.length, shorts: content.shorts.length, playlists: content.playlists.length } : null });
  }
  if (req.method === "POST" && path === "/refresh") {
    if (!env.YOUTUBE_API_KEY) return json({ error: "YOUTUBE_API_KEY não configurada no Cloudflare." }, 400);
    try {
      const c = await refreshNow(env);
      return json({ ok: true, updatedAt: c.updatedAt, apiCalls: c.apiCalls, warnings: c.warnings });
    } catch (e) { return json({ error: scrub(e.message) }, 502); }
  }
  return json({ error: "Rota inexistente." }, 404);
}

async function route(req, env, ctx) {
  const url = new URL(req.url), path = url.pathname;
  const get = req.method === "GET" || req.method === "HEAD"; // HEAD (monitores de disponibilidade) recebe o mesmo que GET

  if (get && path === "/api/banners")
    return json(await memoized("banners", 30000, async () => (await getBanners(env)).filter(b => b.active)), 200, { "Cache-Control": "public, max-age=30" });

  if (get && path === "/data.js") {
    const js = await memoized("data.js", 30000, () => buildDataJs(env, ctx));
    return new Response(js, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=30", ...SEC } });
  }

  if (get && path.startsWith("/uploads/")) {
    const name = path.slice(9);
    if (!/^[a-f0-9]{24}\.(png|jpg|webp|gif)$/.test(name)) return new Response("Não encontrado", { status: 404 });
    const { value, metadata } = await env.NN_KV.getWithMetadata("img:" + name, "arrayBuffer");
    if (!value) return new Response("Não encontrado", { status: 404 });
    return new Response(value, { headers: { "Content-Type": (metadata && metadata.type) || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable", ...SEC } });
  }

  if (path === "/api/admin/login" && req.method === "POST") {
    if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) return json({ error: "ADMIN_PASSWORD não configurada (mín. 12 caracteres)." }, 500);
    const ip = req.headers.get("CF-Connecting-IP") || "local", rlKey = "rl:" + ip;
    const tries = +(await env.NN_KV.get(rlKey)) || 0;
    if (tries >= 5) return json({ error: "Muitas tentativas. Aguarde um minuto." }, 429);
    const { password } = await readJson(req);
    if (!(await safeEq(password, env.ADMIN_PASSWORD))) {
      await env.NN_KV.put(rlKey, String(tries + 1), { expirationTtl: 60 });
      return json({ error: "Senha incorreta." }, 401);
    }
    await env.NN_KV.delete(rlKey);
    return json({ ok: true }, 200, { "Set-Cookie": cookie(req, await makeToken(env), SESSION_MS / 1000) });
  }
  if (path === "/api/admin/logout" && req.method === "POST") {
    if (await isAuthed(env, req)) await rotateSessions(env); // só quem está logado pode invalidar as sessões
    return json({ ok: true }, 200, { "Set-Cookie": cookie(req, "", 0) });
  }
  if (path.startsWith("/api/admin/")) {
    const res = await admin(req, env, ctx, path.slice("/api/admin".length));
    res.headers.set("Cache-Control", "no-store"); // dados do painel nunca ficam em cache
    return res;
  }

  if (path.startsWith("/api/")) return json({ error: "Rota inexistente." }, 404);
  return env.ASSETS.fetch(req); // qualquer outra coisa: arquivos estáticos
}

export default {
  async fetch(req, env, ctx) {
    try { return await route(req, env, ctx); }
    catch (e) {
      if (e.code === 413) return json({ error: "Conteúdo muito grande." }, 413);
      if (e.code === 400) return json({ error: "JSON inválido." }, 400);
      console.error(e);
      return json({ error: "Erro interno." }, 500);
    }
  },
  // Reforço agendado (a cada 6 h): atualiza mesmo sem visitas.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refreshNow(env).catch(e => console.error("[sync]", e.message)));
  },
};
