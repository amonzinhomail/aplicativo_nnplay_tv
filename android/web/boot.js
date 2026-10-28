// Modo cliente: o próprio app decide o conteúdo e entrega ao site (que continua igual).
//  1) usa o conteúdo guardado no aparelho; se não houver, o snapshot que veio no APK (abre na hora);
//  2) se há chave e o conteúdo está vencido, busca no YouTube em segundo plano e guarda para a próxima abertura;
//  3) banners: arquivo remoto (com tempo máximo), senão o último guardado, senão os do APK.
(function () {
  var A = window.TV_APP || {};
  var LS = { content: "nn_content_v1", banners: "nn_banners_v1", fail: "nn_sync_fail_v1" };
  var HAS_KEY = !!A.youtubeApiKey && A.youtubeApiKey.indexOf("__") !== 0;
  var TTL = (A.refreshMinutes || 360) * 60000;

  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* armazenamento cheio: segue sem guardar */ } }
  function safeUrl(u) { return /^(https?:\/\/|\/(?!\/))/i.test(u || "") ? u : ""; }
  function timeout(ms) { return new Promise(function (res) { setTimeout(function () { res(null); }, ms); }); }

  function getJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  // ---- conteúdo (playlists, Shorts, próximas transmissões) ----
  async function currentContent() {
    var c = load(LS.content);
    if (c && c.content) return c;
    try { var snap = await getJson("snapshot.json"); return { t: 0, content: snap }; } // t=0: considerado vencido
    catch (e) { return { t: 0, content: { playlists: [], shorts: [], upcoming: [] } }; }
  }

  function syncConfig() {
    return { brand: { timeZone: (A.brand && A.brand.timeZone) || "America/Sao_Paulo" }, channel: A.channel, maxShorts: A.maxShorts, maxPerPlaylist: A.maxPerPlaylist, playlists: A.playlists || [] };
  }

  async function refreshInBackground(cache) {
    if (!HAS_KEY || !window.NNSync || navigator.onLine === false) return;
    if (cache.t && Date.now() - cache.t < TTL) return;               // ainda fresco
    var fail = load(LS.fail);
    if (fail && Date.now() - fail < 10 * 60000) return;              // falhou há pouco: espera 10 min
    try {
      var content = await window.NNSync.syncFromYouTube(syncConfig(), { YOUTUBE_API_KEY: A.youtubeApiKey });
      save(LS.content, { t: Date.now(), content: content });
      try { localStorage.removeItem(LS.fail); } catch (e) { /* ok */ }
      console.log("[app] conteúdo atualizado (" + content.apiCalls + " chamadas). Vale na próxima abertura.");
    } catch (e) { save(LS.fail, Date.now()); console.warn("[app] atualização falhou:", String(e.message || e).replace(/key=[^&\s]+/g, "key=***")); }
  }

  // ---- banners ----
  async function getBanners() {
    var list = null;
    if (A.bannersUrl) {
      try { list = await Promise.race([getJson(A.bannersUrl), timeout(2500)]); if (Array.isArray(list)) save(LS.banners, list); else list = null; } catch (e) { list = null; }
      if (!list) list = load(LS.banners);
    }
    if (!Array.isArray(list)) list = A.defaultBanners || [];
    return list.filter(function (b) { return b && b.active !== false && safeUrl(b.image); })
      .map(function (b) { return { title: String(b.title || ""), subtitle: String(b.subtitle || ""), image: safeUrl(b.image), link: safeUrl(b.link), active: true }; });
  }

  // ---- monta o window.TV_CONFIG que o site lê ----
  function build(content) {
    var norm = window.NNSync ? window.NNSync.norm : function (s) { return String(s).toLowerCase(); };
    var opts = {}, order = {};
    (A.playlists || []).forEach(function (p, i) { opts[norm(p.title)] = p; order[norm(p.title)] = i; });
    var pls = (content.playlists || []).filter(function (p) { return opts[norm(p.title)]; }).map(function (p) {
      var o = opts[norm(p.title)], r = { title: p.title, videos: p.videos };
      if (o.noCover) r.noCover = true; else if (o.cover) r.cover = o.cover;
      if (p.short) r.short = true;
      return r;
    }).sort(function (a, b) { return order[norm(a.title)] - order[norm(b.title)]; });
    // esconde transmissões que começaram há mais de 4 h (o conteúdo pode estar guardado há horas)
    var up = (content.upcoming || []).filter(function (u) { return !u.start || Date.parse(u.start) > Date.now() - 4 * 3600000; });
    return { brand: A.brand || { name: "NN Play" }, banners: [], live: A.live || [], upcoming: up, shorts: content.shorts || [], playlists: pls };
  }

  function loadScript(src) {
    var s = document.createElement("script"); s.src = src; document.body.appendChild(s);
  }

  (async function start() {
    try {
      var results = await Promise.all([currentContent(), getBanners()]);
      var cache = results[0], banners = results[1];
      window.TV_CONFIG = build(cache.content);
      // o site pede /api/banners: respondemos daqui (não há servidor)
      var realFetch = window.fetch.bind(window);
      window.fetch = function (u, o) {
        if (u === "/api/banners") return Promise.resolve(new Response(JSON.stringify(banners), { headers: { "Content-Type": "application/json" } }));
        return realFetch(u, o);
      };
      loadScript("app.js");
      setTimeout(function () { refreshInBackground(cache); }, 6000); // depois que a tela já apareceu
    } catch (e) {
      console.error("[app] falha ao iniciar:", e);
      var s = document.getElementById("splash");
      if (s) { s.style.animation = "none"; var p = document.createElement("p"); p.textContent = "Não foi possível iniciar. Feche e abra o app novamente."; p.style.cssText = "color:#9aa3b2;font-size:20px;margin:0"; s.appendChild(p); }
    }
  })();
})();
