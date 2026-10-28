// Monta os arquivos do site que vão DENTRO do APK (a pasta "assets" do app).
// O site (index.html, style.css, app.js) vem da pasta acima: é a mesma base do site hospedado.
//   node build-web.js                 -> app/src/main/assets
//   YOUTUBE_API_KEY=... node build-web.js        (a chave entra no app-config.js do APK)
//   node build-web.js --out <pasta>   (para testar no navegador)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const argOut = process.argv.indexOf("--out");
const out = argOut > 0 ? path.resolve(process.argv[argOut + 1]) : path.join(here, "app", "src", "main", "assets");
const read = f => fs.readFileSync(f, "utf8");
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

// só apaga a pasta de saída se for claramente uma pasta gerada (evita apagar algo importante por engano)
if (fs.existsSync(out)) {
  if (!["assets"].includes(path.basename(out)) && !path.basename(out).startsWith("nn-")) throw new Error(`recuso apagar "${out}" (use uma pasta chamada assets ou nn-*)`);
  fs.rmSync(out, { recursive: true, force: true });
}
fs.mkdirSync(out, { recursive: true });

function swap(text, from, to, file) {
  const ok = from instanceof RegExp ? from.test(text) : text.includes(from);
  if (!ok) throw new Error(`build: trecho não encontrado em ${file}: ${from}`);
  return from instanceof RegExp ? text.replace(from, to) : text.split(from).join(to);
}

// index.html: scripts do modo cliente no lugar do data.js, hls.js local (sem depender de CDN)
let html = read(path.join(root, "index.html"));
html = swap(html, /<script src="https:\/\/cdn\.jsdelivr\.net[^>]*><\/script>/, '<script src="vendor/hls.min.js" defer></script>', "index.html");
html = swap(html, '<script src="data.js" defer></script>',
  '<script src="app-config.js" defer></script>\n<script src="client-sync.js" defer></script>\n<script src="boot.js" defer></script>', "index.html");
html = swap(html, '<script src="app.js" defer></script>\n', "", "index.html"); // o boot.js carrega o app.js quando o conteúdo está pronto
write(path.join(out, "index.html"), html);

// o site, sem alteração
for (const f of ["style.css", "app.js", "loading-logo.webp"]) fs.copyFileSync(path.join(root, f), path.join(out, f));
fs.cpSync(path.join(root, "cloudflare", "public", "seed"), path.join(out, "seed"), { recursive: true });

// a mesma lógica do YouTube do Worker/PHP, rodando no WebView
let yt = read(path.join(root, "cloudflare", "src", "youtube.js"));
yt = swap(yt, "export const norm", "const norm", "youtube.js");
yt = swap(yt, "export async function syncFromYouTube", "async function syncFromYouTube", "youtube.js");
write(path.join(out, "client-sync.js"), `// Gerado por build-web.js a partir de cloudflare/src/youtube.js\n(function () {\n${yt}\nwindow.NNSync = { syncFromYouTube: syncFromYouTube, norm: norm };\n})();\n`);

// arquivos do app
let cfg = read(path.join(here, "web", "app-config.js"));
if (process.env.YOUTUBE_API_KEY) cfg = swap(cfg, "__YOUTUBE_API_KEY__", process.env.YOUTUBE_API_KEY.replace(/[^\w-]/g, ""), "app-config.js");
write(path.join(out, "app-config.js"), cfg);
fs.copyFileSync(path.join(here, "web", "boot.js"), path.join(out, "boot.js"));
fs.copyFileSync(path.join(here, "web", "snapshot.json"), path.join(out, "snapshot.json"));
fs.mkdirSync(path.join(out, "vendor"), { recursive: true });
fs.copyFileSync(path.join(here, "web", "vendor", "hls.min.js"), path.join(out, "vendor", "hls.min.js"));

console.log("site do app montado em:", out, process.env.YOUTUBE_API_KEY ? "(COM chave do YouTube)" : "(sem chave: usa só o snapshot)");
