// Configuração do app. Edite aqui e rode "node build-web.js" (ou compile pelo Android Studio) para valer no APK.
window.TV_APP = {
  // Chave da YouTube Data API v3. Em branco = o app usa só o conteúdo que veio dentro do APK (snapshot.json).
  // Dica: não escreva a chave aqui; passe pela variável de ambiente YOUTUBE_API_KEY ao rodar o build-web.js.
  youtubeApiKey: "__YOUTUBE_API_KEY__",

  channel: "@NNPlayOficial",
  maxShorts: 30,
  maxPerPlaylist: 24,

  // Idade máxima do conteúdo guardado no aparelho. Passou disso, o app busca de novo ao abrir.
  // Cada busca gasta ~24 unidades da cota (10.000/dia, dividida entre TODOS os aparelhos). Veja ANDROID.md.
  refreshMinutes: 360,

  // Banners: endereço de um arquivo JSON publicado em qualquer hospedagem (veja banners.sample.json).
  // Em branco = usa os banners que vieram dentro do APK.
  bannersUrl: "",

  brand: { name: "NN Play", timeZone: "America/Sao_Paulo" },
  live: [{ title: "Rádio NN", hls: "https://video06.logicahost.com.br/radionn/radionn/playlist.m3u8", poster: "" }],

  // Ordem = ordem na tela. cover = arte própria acima da playlist; noCover = sem capa.
  playlists: [
    { title: "Últimas Notícias", noCover: true },
    { title: "Comando 91", cover: "/seed/cover-comando-91.webp" },
    { title: "Futebol Show", cover: "/seed/cover-futebol-show.webp" },
    { title: "Cortes do Futebol Show", noCover: true },
    { title: "Jornada Esportiva", noCover: true },
    { title: "Campeonato Alagoano 2026", noCover: true },
    { title: "Copa Alagoas 2026", noCover: true },
    { title: "Melhores Momentos", noCover: true },
    { title: "Lances, gols e informações", noCover: true },
    { title: "O que rolou na NN", noCover: true },
  ],

  // Banners que vão dentro do APK (usados enquanto não houver bannersUrl ou se ele estiver fora do ar).
  defaultBanners: [
    { title: "NN Play - Dê o play no melhor", image: "/seed/banner-1.webp", link: "", active: true },
    { title: "Futebol do NN Play", image: "/seed/banner-2.webp", link: "", active: true },
    { title: "Jornalismo", image: "/seed/banner-3.webp", link: "", active: true },
    { title: "Entretenimento", image: "/seed/banner-4.webp", link: "", active: true },
    { title: "Jogo do dia", image: "/seed/banner-5.webp", link: "", active: true },
  ],
};
