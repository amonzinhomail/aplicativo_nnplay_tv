// Copia o site (fonte única na pasta acima) para public/, de onde o Cloudflare serve os arquivos estáticos.
// O data.js NÃO é copiado: no Cloudflare ele é gerado pelo Worker a partir do KV.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const out = path.join(here, "public");
fs.mkdirSync(out, { recursive: true });
for (const f of ["index.html", "style.css", "app.js", "loading-logo.webp"]) {
  fs.copyFileSync(path.join(root, f), path.join(out, f));
  console.log("copiado", f);
}
