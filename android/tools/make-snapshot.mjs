// Gera android/web/snapshot.json: o conteúdo do YouTube de hoje, que vai dentro do APK.
// Assim o app abre na hora na primeira vez (sem tela vazia) e atualiza sozinho em seguida.
//   YOUTUBE_API_KEY=... node tools/make-snapshot.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncFromYouTube } from "../../cloudflare/src/youtube.js";
import { DEFAULT_CONFIG } from "../../cloudflare/src/defaults.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const key = process.env.YOUTUBE_API_KEY;
if (!key) { console.error("Defina YOUTUBE_API_KEY."); process.exit(1); }

// mesma lista de playlists do app (android/web/app-config.js)
const cfg = { ...DEFAULT_CONFIG };
const c = await syncFromYouTube(cfg, { YOUTUBE_API_KEY: key });
c.updatedAt = Date.now();
fs.writeFileSync(path.join(here, "..", "web", "snapshot.json"), JSON.stringify(c));
console.log(`snapshot: ${c.playlists.length} playlists, ${c.shorts.length} Shorts, ${c.upcoming.length} próximas | ${c.apiCalls} chamadas à API`);
