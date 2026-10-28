// Valores iniciais. Depois da 1ª edição no /admin, o que vale é o que está salvo no KV.
export const DEFAULT_CONFIG = {
  brand: { name: "NN Play", logo: "", timeZone: "America/Sao_Paulo" },
  live: [{ title: "Rádio NN", hls: "https://video06.logicahost.com.br/radionn/radionn/playlist.m3u8", poster: "" }],
  channel: "@NNPlayOficial",
  maxShorts: 30,
  maxPerPlaylist: 24,
  refreshMinutes: 10,
  // Ordem = ordem na tela. cover = arte própria acima da playlist; noCover = sem capa.
  playlists: [
    { title: "Últimas Notícias", cover: "", noCover: true },
    { title: "Comando 91", cover: "/seed/cover-comando-91.webp", noCover: false },
    { title: "Futebol Show", cover: "/seed/cover-futebol-show.webp", noCover: false },
    { title: "Cortes do Futebol Show", cover: "", noCover: true },
    { title: "Jornada Esportiva", cover: "", noCover: true },
    { title: "Campeonato Alagoano 2026", cover: "", noCover: true },
    { title: "Copa Alagoas 2026", cover: "", noCover: true },
    { title: "Melhores Momentos", cover: "", noCover: true },
    { title: "Lances, gols e informações", cover: "", noCover: true },
    { title: "O que rolou na NN", cover: "", noCover: true },
  ],
};

export const DEFAULT_BANNERS = [
  { id: "seed-1", title: "NN Play - Dê o play no melhor", subtitle: "", image: "/seed/banner-1.webp", link: "", active: true },
  { id: "seed-2", title: "Futebol do NN Play", subtitle: "", image: "/seed/banner-2.webp", link: "", active: true },
  { id: "seed-3", title: "Jornalismo", subtitle: "", image: "/seed/banner-3.webp", link: "", active: true },
  { id: "seed-4", title: "Entretenimento", subtitle: "", image: "/seed/banner-4.webp", link: "", active: true },
  { id: "seed-5", title: "Jogo do dia", subtitle: "", image: "/seed/banner-5.webp", link: "", active: true },
];
