// Monta a pasta publicável da versão PHP: copia o site (fonte única na pasta acima) e o painel /admin
// (fonte única em ../cloudflare/public/admin), ajustando os caminhos para os arquivos PHP.
//   node build.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const read = f => fs.readFileSync(f, "utf8");
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

// substitui um trecho e falha se ele não existir (evita publicar algo quebrado em silêncio)
function swap(text, from, to, file) {
  if (!text.includes(from)) throw new Error(`build: trecho não encontrado em ${file}: ${from}`);
  return text.split(from).join(to);
}

// Site
write(path.join(here, "index.html"), swap(read(path.join(root, "index.html")), 'src="data.js"', 'src="data.php"', "index.html"));
write(path.join(here, "app.js"), swap(read(path.join(root, "app.js")), 'fetch("/api/banners")', 'fetch("/api/banners.php")', "app.js"));
for (const f of ["style.css", "loading-logo.webp"]) fs.copyFileSync(path.join(root, f), path.join(here, f));

// Imagens iniciais (banners e capas)
fs.cpSync(path.join(root, "cloudflare", "public", "seed"), path.join(here, "seed"), { recursive: true });

// Painel /admin: chamadas /api/admin/X viram /api/admin.php?r=X; PUT/DELETE viram POST + override.
const adminSrc = path.join(root, "cloudflare", "public", "admin");
for (const f of ["index.html", "admin.css", "admin.js"]) {
  let s = read(path.join(adminSrc, f));
  if (f === "admin.js") {
    s = swap(s, "/api/admin/", "/api/admin.php?r=", f);
    s = swap(s, '!url.endsWith("/login")', '!url.endsWith("r=login")', f); // a URL de login agora termina em "?r=login"
    s = swap(s, "const opt = { method, headers: {} };",
      'const opt = { method: method === "GET" ? "GET" : "POST", headers: method === "GET" || method === "POST" ? {} : { "X-HTTP-Method-Override": method } };', f);
  }
  write(path.join(here, "admin", f), s);
}
console.log("pasta php/ montada");
