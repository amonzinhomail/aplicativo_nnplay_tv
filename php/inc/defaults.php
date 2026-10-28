<?php
if (!defined('NN')) { http_response_code(404); exit; }

// Valores iniciais. Depois da 1ª edição no /admin, vale o que está salvo em data/.
function nn_default_config() {
  return [
    'brand' => ['name' => 'NN Play', 'logo' => '', 'timeZone' => 'America/Sao_Paulo'],
    'live' => [['title' => 'Rádio NN', 'hls' => 'https://video06.logicahost.com.br/radionn/radionn/playlist.m3u8', 'poster' => '']],
    'channel' => '@NNPlayOficial',
    'maxShorts' => 30,
    'maxPerPlaylist' => 24,
    'refreshMinutes' => 10,
    // Ordem = ordem na tela. cover = arte própria acima da playlist; noCover = sem capa.
    'playlists' => [
      ['title' => 'Últimas Notícias', 'cover' => '', 'noCover' => true],
      ['title' => 'Comando 91', 'cover' => '/seed/cover-comando-91.webp', 'noCover' => false],
      ['title' => 'Futebol Show', 'cover' => '/seed/cover-futebol-show.webp', 'noCover' => false],
      ['title' => 'Cortes do Futebol Show', 'cover' => '', 'noCover' => true],
      ['title' => 'Jornada Esportiva', 'cover' => '', 'noCover' => true],
      ['title' => 'Campeonato Alagoano 2026', 'cover' => '', 'noCover' => true],
      ['title' => 'Copa Alagoas 2026', 'cover' => '', 'noCover' => true],
      ['title' => 'Melhores Momentos', 'cover' => '', 'noCover' => true],
      ['title' => 'Lances, gols e informações', 'cover' => '', 'noCover' => true],
      ['title' => 'O que rolou na NN', 'cover' => '', 'noCover' => true],
    ],
  ];
}

function nn_default_banners() {
  $t = ['NN Play - Dê o play no melhor', 'Futebol do NN Play', 'Jornalismo', 'Entretenimento', 'Jogo do dia'];
  $out = [];
  foreach ($t as $i => $title) {
    $out[] = ['id' => 'seed-' . ($i + 1), 'title' => $title, 'subtitle' => '', 'image' => '/seed/banner-' . ($i + 1) . '.webp', 'link' => '', 'active' => true];
  }
  return $out;
}
