import fs from "node:fs";
import { syncFromYouTube } from "../src/youtube.js";
import { DEFAULT_CONFIG } from "../src/defaults.js";
const vars = Object.fromEntries(fs.readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").split(/\r?\n/).filter(Boolean).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const t0 = Date.now();
try {
  const c = await syncFromYouTube(DEFAULT_CONFIG, { YOUTUBE_API_KEY: vars.YOUTUBE_API_KEY });
  console.log("OK em", Date.now() - t0, "ms | chamadas à API:", c.apiCalls);
  console.log("avisos:", c.warnings);
  console.log("próximas:", c.upcoming.length, c.upcoming.map(u => u.when + " " + u.title.slice(0, 40)));
  console.log("shorts:", c.shorts.length, "|", c.shorts[0] && c.shorts[0].title.slice(0, 50));
  for (const p of c.playlists) console.log(p.title.padEnd(28), String(p.videos.length).padStart(3), p.short ? "SHORTS" : "", "|", p.videos[0] ? p.videos[0].title.slice(0, 45) : "");
  fs.writeFileSync(new URL("./real-content.json", import.meta.url), JSON.stringify(c));
} catch (e) { console.log("FALHOU:", String(e.message).replace(/key=[^&\s]+/g, "key=***")); }
