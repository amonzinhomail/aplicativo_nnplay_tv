// Busca playlists, Shorts e transmissões agendadas pela YouTube Data API v3.
// Custo por atualização: ~25-45 unidades de cota (limite grátis: 10.000/dia).
// O Worker permite 50 subrequisições por execução, então o total de chamadas é mantido abaixo disso.
const clean = s => String(s || "").replace(/\s+/g, " ").trim();
export const norm = s => clean(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const maxres = id => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;

// "PT1M5S" -> 65
function seconds(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso || "");
  if (!m) return Infinity;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

export async function syncFromYouTube(cfg, env) {
  const base = env.YT_API_BASE || "https://www.googleapis.com/youtube/v3";
  const key = env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY não configurada.");
  const warnings = [];
  let calls = 0;

  async function api(path, params) {
    if (++calls > 48) throw new Error("Limite de chamadas por atualização atingido (reduza o número de playlists).");
    const u = new URL(`${base}/${path}`);
    for (const [k, v] of Object.entries({ ...params, key })) if (v !== undefined) u.searchParams.set(k, v);
    const r = await fetch(u);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`YouTube API ${r.status}: ${(j.error && j.error.message) || "erro"}`);
    return j;
  }

  // 1) canal
  const ch = await api("channels", { part: "contentDetails", forHandle: cfg.channel });
  const channel = ch.items && ch.items[0];
  if (!channel) throw new Error(`Canal não encontrado: ${cfg.channel}`);
  const channelId = channel.id, uploads = channel.contentDetails.relatedPlaylists.uploads;

  // 2) playlists do canal: título -> id
  const ids = new Map();
  let pageToken, pages = 0;
  do {
    const j = await api("playlists", { part: "snippet", channelId, maxResults: 50, pageToken });
    for (const p of j.items || []) ids.set(norm(p.snippet.title), p.id);
    pageToken = j.nextPageToken;
  } while (pageToken && ++pages < 3);

  async function listPlaylist(id, want) {
    const j = await api("playlistItems", { part: "snippet,contentDetails,status", playlistId: id, maxResults: Math.min(50, want + 10) });
    return (j.items || [])
      .filter(i => (!i.status || i.status.privacyStatus !== "private") && !/^(Private|Deleted) video$/i.test(i.snippet.title))
      .map(i => ({ id: i.contentDetails.videoId, title: clean(i.snippet.title) }));
  }

  // 3) playlists pedidas
  const plists = [];
  for (const want of cfg.playlists) {
    const id = ids.get(norm(want.title));
    if (!id) { warnings.push(`Playlist não encontrada no canal: ${want.title}`); continue; }
    plists.push({ title: want.title, items: await listPlaylist(id, cfg.maxPerPlaylist) });
  }

  // 4) Shorts: a playlist "UUSH..." do canal contém só os Shorts; se falhar, usa os envios curtos (<= 60 s)
  const uploadItems = await listPlaylist(uploads, 50);
  // Lê até 200 Shorts: os primeiros viram a seção "Vídeos curtos"; o conjunto todo identifica
  // playlists de Shorts (a duração não serve: Shorts chegam a 3 min e há vídeos horizontais de 30 s).
  let shortItems = [];
  const shortSet = new Set();
  try {
    let tok, n = 0;
    do {
      const j = await api("playlistItems", { part: "snippet,contentDetails", playlistId: "UUSH" + channelId.slice(2), maxResults: 50, pageToken: tok });
      for (const i of j.items || []) {
        shortSet.add(i.contentDetails.videoId);
        if (!/^(Private|Deleted) video$/i.test(i.snippet.title)) shortItems.push({ id: i.contentDetails.videoId, title: clean(i.snippet.title) });
      }
      tok = j.nextPageToken;
    } while (tok && ++n < 4);
  } catch (_) { /* tenta o plano B */ }
  shortItems = shortItems.slice(0, cfg.maxShorts + 10);

  // 5) detalhes (duração e agendamento) de todos os vídeos envolvidos, em lotes de 50
  const all = new Set([...plists.flatMap(p => p.items.map(i => i.id)), ...uploadItems.map(i => i.id), ...shortItems.map(i => i.id)]);
  const detail = new Map();
  const list = [...all];
  for (let i = 0; i < list.length; i += 50) {
    const j = await api("videos", {
      part: "snippet,contentDetails,liveStreamingDetails",
      id: list.slice(i, i + 50).join(","),
      fields: "items(id,snippet(liveBroadcastContent),contentDetails(duration),liveStreamingDetails(scheduledStartTime))",
    });
    for (const v of j.items || []) detail.set(v.id, {
      upcoming: v.snippet && v.snippet.liveBroadcastContent === "upcoming",
      secs: seconds(v.contentDetails && v.contentDetails.duration),
      start: v.liveStreamingDetails && v.liveStreamingDetails.scheduledStartTime,
    });
  }
  const upcoming = id => !!(detail.get(id) && detail.get(id).upcoming);
  const known = id => detail.has(id); // vídeos removidos/privados não vêm em videos.list

  if (!shortItems.length) {
    shortItems = uploadItems.filter(i => known(i.id) && !upcoming(i.id) && detail.get(i.id).secs <= 60).slice(0, cfg.maxShorts);
    if (shortItems.length) warnings.push("Shorts obtidos pelo plano B (envios de até 60 s).");
  }

  // 6) próximas transmissões (de qualquer playlist configurada ou dos envios recentes)
  const seen = new Set(), up = [];
  for (const it of [...uploadItems, ...plists.flatMap(p => p.items)]) {
    if (seen.has(it.id) || !upcoming(it.id)) continue;
    seen.add(it.id);
    up.push({ id: it.id, title: it.title, start: detail.get(it.id).start });
  }
  up.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const fmt = iso => {
    try { return new Date(iso).toLocaleString("pt-BR", { timeZone: cfg.brand.timeZone, dateStyle: "short", timeStyle: "short" }); } catch (_) { return ""; }
  };

  return {
    channelId,
    warnings,
    apiCalls: calls,
    // start (ISO) permite ao app esconder transmissões que já passaram quando o conteúdo está guardado há horas
    upcoming: up.slice(0, 12).map(u => ({ title: u.title, video: u.id, image: maxres(u.id), when: fmt(u.start), start: u.start })),
    shorts: shortItems.filter(i => !upcoming(i.id)).slice(0, cfg.maxShorts).map(i => ({ id: i.id, title: i.title })),
    playlists: plists.map(p => {
      const vids = p.items.filter(i => known(i.id) && !upcoming(i.id)).slice(0, cfg.maxPerPlaylist);
      const short = vids.length > 0 && vids.filter(i => shortSet.has(i.id)).length / vids.length >= 0.8;
      const o = { title: p.title, videos: vids.map(i => ({ id: i.id, title: i.title })) };
      if (short) o.short = true;
      return o;
    }),
  };
}
