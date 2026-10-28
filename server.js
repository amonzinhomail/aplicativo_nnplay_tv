// Servidor sem dependências: site estático + API de banners + /admin.
// Senha do admin: variável ADMIN_PASSWORD, ou gerada na 1ª execução em data/admin-password.txt.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { ROOT, external, DATA_DIR, DB_FILE, DATA_JS, UPLOAD_DIR } = require("./paths");
const PORT = +process.env.PORT || 5173;
const HOST = process.env.HOST || "0.0.0.0";
const PROD = process.env.NODE_ENV === "production";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";   // atrás de Caddy/Nginx: confia em X-Forwarded-*
const COOKIE_SECURE = process.env.COOKIE_SECURE === "1";
const MAX_UPLOAD = 5 * 1024 * 1024;
const IMG_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon" };
const PUBLIC_FILES = new Set(["/", "/index.html", "/style.css", "/app.js", "/data.js", "/loading-logo.webp", "/admin", "/admin/", "/admin/index.html", "/admin/admin.js", "/admin/admin.css"]);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) { // 1ª execução: banners iniciais do projeto (seed/), se existirem
  const seedDb = path.join(ROOT, "seed", "banners.json");
  if (external && fs.existsSync(seedDb)) fs.copyFileSync(seedDb, DB_FILE); else fs.writeFileSync(DB_FILE, "[]");
}
if (external) { // 1ª execução com disco externo: copia o conteúdo inicial do projeto para o volume
  if (!fs.existsSync(DATA_JS)) fs.copyFileSync(path.join(ROOT, "data.js"), DATA_JS);
  const seed = path.join(ROOT, "uploads");
  if (fs.existsSync(seed)) for (const f of fs.readdirSync(seed)) {
    const dst = path.join(UPLOAD_DIR, f);
    if (!fs.existsSync(dst)) fs.copyFileSync(path.join(seed, f), dst);
  }
}

// --- senha ---
let PASSWORD = process.env.ADMIN_PASSWORD;
if (PROD && (!PASSWORD || PASSWORD.length < 12)) {
  console.error("ERRO: em produção defina ADMIN_PASSWORD com pelo menos 12 caracteres.");
  process.exit(1);
}
const pwFile = path.join(DATA_DIR, "admin-password.txt");
if (!PASSWORD) {
  if (!fs.existsSync(pwFile)) fs.writeFileSync(pwFile, crypto.randomBytes(9).toString("base64url"));
  PASSWORD = fs.readFileSync(pwFile, "utf8").trim();
  console.log("Senha do admin salva em:", pwFile);
}
const safeEq = (a, b) => {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// --- sessões e limite de tentativas ---
const sessions = new Map(); // token -> expira
const attempts = new Map(); // ip -> {n, until}
const SESSION_MS = 8 * 3600 * 1000;
function session(req) {
  const m = /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie || "");
  const exp = m && sessions.get(m[1]);
  if (exp && exp > Date.now()) return m[1];
  if (m) sessions.delete(m[1]);
  return null;
}

// --- dados ---
const readDb = () => { try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch { return []; } };
const writeDb = list => { const t = DB_FILE + ".tmp"; fs.writeFileSync(t, JSON.stringify(list, null, 2)); fs.renameSync(t, DB_FILE); };
const str = (v, max) => String(v ?? "").slice(0, max);
const safeUrl = v => {
  const s = str(v, 2000).trim();
  return s === "" || /^(https?:\/\/|\/(?!\/))/i.test(s) ? s : ""; // só http(s) ou caminho do site: bloqueia javascript:, data:, //host
};
function clean(b) {
  return { title: str(b.title, 120), subtitle: str(b.subtitle, 240), image: safeUrl(b.image), link: safeUrl(b.link), active: b.active !== false };
}

// --- utilitários HTTP ---
const SEC_HEADERS = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN", "Referrer-Policy": "strict-origin-when-cross-origin" };
// IP real do visitante (para o limite de tentativas de login) e se a conexão é HTTPS.
const clientIp = req => (TRUST_PROXY && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress;
const isHttps = req => COOKIE_SECURE || (TRUST_PROXY && req.headers["x-forwarded-proto"] === "https");
const cookie = (req, value, maxAge) => `sid=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${isHttps(req) ? "; Secure" : ""}`;
const send = (res, code, body, headers = {}) => {
  const isObj = body && typeof body === "object" && !Buffer.isBuffer(body);
  res.writeHead(code, { ...SEC_HEADERS, ...(isObj ? { "Content-Type": "application/json" } : {}), ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
};
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("too_large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
const readJson = async (req, limit = 64 * 1024) => JSON.parse((await readBody(req, limit)).toString() || "{}");

function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "Não encontrado");
    send(res, 200, buf, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = decodeURIComponent(url.pathname);
  try {
    // API pública
    if (req.method === "GET" && p === "/api/banners") {
      return send(res, 200, readDb().filter(b => b.active), { "Cache-Control": "no-cache" });
    }

    // login / logout
    if (req.method === "POST" && p === "/api/admin/login") {
      const ip = clientIp(req), a = attempts.get(ip) || { n: 0, until: 0 };
      if (a.until > Date.now()) return send(res, 429, { error: "Muitas tentativas. Aguarde um minuto." });
      const { password } = await readJson(req);
      if (!safeEq(password, PASSWORD)) {
        a.n++; if (a.n >= 5) { a.n = 0; a.until = Date.now() + 60000; }
        attempts.set(ip, a);
        return send(res, 401, { error: "Senha incorreta." });
      }
      attempts.delete(ip);
      const sid = crypto.randomBytes(24).toString("base64url");
      sessions.set(sid, Date.now() + SESSION_MS);
      return send(res, 200, { ok: true }, { "Set-Cookie": cookie(req, sid, SESSION_MS / 1000) });
    }
    if (req.method === "POST" && p === "/api/admin/logout") {
      const s = session(req); if (s) sessions.delete(s);
      return send(res, 200, { ok: true }, { "Set-Cookie": cookie(req, "", 0) });
    }

    // API protegida
    if (p.startsWith("/api/admin/")) {
      if (!session(req)) return send(res, 401, { error: "Não autenticado." });
      // Proteção CSRF: só aceita requisições vindas do próprio site.
      if (req.method !== "GET" && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
        return send(res, 403, { error: "Origem não permitida." });

      if (req.method === "GET" && p === "/api/admin/banners") return send(res, 200, readDb());

      if (req.method === "POST" && p === "/api/admin/banners") {
        const list = readDb();
        const b = { id: crypto.randomUUID(), ...clean(await readJson(req)) };
        list.push(b); writeDb(list);
        return send(res, 201, b);
      }
      if (req.method === "PUT" && p === "/api/admin/banners/order") {
        const { ids } = await readJson(req);
        const list = readDb(), byId = new Map(list.map(b => [b.id, b]));
        const sorted = (Array.isArray(ids) ? ids : []).map(i => byId.get(i)).filter(Boolean);
        const rest = list.filter(b => !sorted.includes(b));
        writeDb([...sorted, ...rest]);
        return send(res, 200, { ok: true });
      }
      const m = /^\/api\/admin\/banners\/([\w-]+)$/.exec(p);
      if (m && req.method === "PUT") {
        const list = readDb(), i = list.findIndex(b => b.id === m[1]);
        if (i < 0) return send(res, 404, { error: "Banner não encontrado." });
        list[i] = { id: m[1], ...clean(await readJson(req)) }; writeDb(list);
        return send(res, 200, list[i]);
      }
      if (m && req.method === "DELETE") {
        const list = readDb(), b = list.find(x => x.id === m[1]);
        if (!b) return send(res, 404, { error: "Banner não encontrado." });
        const rest = list.filter(x => x.id !== m[1]);
        writeDb(rest);
        // só apaga o arquivo se nenhum outro banner nem o data.js (capas, logo) ainda usa a mesma imagem
        let dataJs = ""; try { dataJs = fs.readFileSync(DATA_JS, "utf8"); } catch {}
        const inUse = rest.some(x => x.image === b.image) || dataJs.includes(b.image);
        if (b.image && b.image.startsWith("/uploads/") && !inUse && /^[a-f0-9]{24}\.(png|jpg|webp|gif)$|^cover-[\w-]+\.webp$/.test(path.basename(b.image))) fs.unlink(path.join(UPLOAD_DIR, path.basename(b.image)), () => {});
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && p === "/api/admin/upload") {
        const ext = IMG_TYPES[(req.headers["content-type"] || "").split(";")[0]];
        if (!ext) return send(res, 415, { error: "Use PNG, JPG, WEBP ou GIF." });
        const buf = await readBody(req, MAX_UPLOAD);
        const ok = { png: buf.subarray(0, 4).toString("hex") === "89504e47", jpg: buf[0] === 0xff && buf[1] === 0xd8, gif: buf.subarray(0, 3).toString() === "GIF", webp: buf.subarray(8, 12).toString() === "WEBP" }[ext];
        if (!ok) return send(res, 415, { error: "Arquivo não é uma imagem válida." });
        const name = crypto.randomBytes(12).toString("hex") + "." + ext;
        fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
        return send(res, 201, { url: "/uploads/" + name });
      }
      return send(res, 404, { error: "Rota inexistente." });
    }

    // uploads (apenas arquivos gerados por nós)
    if (req.method === "GET" && p.startsWith("/uploads/")) {
      const f = path.join(UPLOAD_DIR, path.basename(p));
      return serveFile(res, f);
    }

    // estáticos permitidos
    if (req.method === "GET" || req.method === "HEAD") {
      if (p === "/healthz") return send(res, 200, "ok");
      if (p === "/admin") return send(res, 301, "", { Location: "/admin/" });
      if (p === "/data.js") return serveFile(res, DATA_JS); // fica no disco persistente em produção
      if (PUBLIC_FILES.has(p)) {
        const rel = p === "/" ? "index.html" : p === "/admin/" ? "admin/index.html" : p.slice(1);
        return serveFile(res, path.join(ROOT, rel));
      }
    }
    send(res, 404, "Não encontrado");
  } catch (e) {
    if (e.message === "too_large") return send(res, 413, { error: "Arquivo muito grande (máx. 5 MB)." });
    if (e instanceof SyntaxError) return send(res, 400, { error: "JSON inválido." });
    console.error(e);
    send(res, 500, { error: "Erro interno." });
  }
});

server.listen(PORT, HOST, () => console.log(`Site: http://localhost:${PORT}  |  Admin: http://localhost:${PORT}/admin/  |  dados: ${DATA_DIR}`));

// Atualização automática do data.js a partir do YouTube (ex.: SYNC_HOURS=6).
const syncHours = +process.env.SYNC_HOURS;
if (syncHours > 0) {
  const { sync } = require("./tools/sync-youtube");
  const run = () => sync({ log: m => console.log("[sync]", m) }).catch(e => console.error("[sync] falhou:", e.message));
  setTimeout(run, 30 * 1000); // uma vez logo após subir, para não começar com conteúdo antigo
  setInterval(run, syncHours * 3600 * 1000);
  console.log(`Sincronização com o YouTube a cada ${syncHours} h.`);
}
