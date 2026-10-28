<?php
// Busca playlists, Shorts e transmissões agendadas pela YouTube Data API v3 (~24 unidades de cota por atualização).
if (!defined('NN')) { http_response_code(404); exit; }

function nn_http_get($url) {
  if (function_exists('curl_init')) {
    $c = curl_init($url);
    curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_HTTPHEADER => ['Accept: application/json']]);
    $body = curl_exec($c);
    $code = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
    $err = curl_error($c);
    curl_close($c);
    if ($body === false) throw new RuntimeException('Falha de rede ao falar com o YouTube: ' . $err);
    return [$code, $body];
  }
  $ctx = stream_context_create(['http' => ['timeout' => 25, 'ignore_errors' => true, 'header' => "Accept: application/json\r\n"]]);
  $body = @file_get_contents($url, false, $ctx);
  if ($body === false) throw new RuntimeException('Falha de rede ao falar com o YouTube (ative a extensão curl no PHP).');
  $code = 0;
  if (!empty($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0], $m)) $code = (int)$m[1];
  return [$code, $body];
}

function nn_yt_clean($s) { return trim(preg_replace('/\s+/u', ' ', (string)$s)); }
function nn_yt_maxres($id) { return 'https://i.ytimg.com/vi/' . $id . '/maxresdefault.jpg'; }

function nn_yt_sync($cfg) {
  if (NN_YOUTUBE_API_KEY === '') throw new RuntimeException('NN_YOUTUBE_API_KEY não configurada em config.php.');
  $calls = 0;
  $warnings = [];
  $api = function ($path, $params) use (&$calls) {
    if (++$calls > 90) throw new RuntimeException('Limite de chamadas por atualização atingido.');
    $params['key'] = NN_YOUTUBE_API_KEY;
    foreach ($params as $k => $v) if ($v === null) unset($params[$k]);
    list($code, $body) = nn_http_get(NN_YT_API_BASE . '/' . $path . '?' . http_build_query($params));
    $j = json_decode($body, true);
    $j = is_array($j) ? $j : [];
    if ($code < 200 || $code >= 300) throw new RuntimeException('YouTube API ' . $code . ': ' . (isset($j['error']['message']) ? $j['error']['message'] : 'erro'));
    return $j;
  };

  // 1) canal
  $ch = $api('channels', ['part' => 'contentDetails', 'forHandle' => $cfg['channel']]);
  if (empty($ch['items'][0])) throw new RuntimeException('Canal não encontrado: ' . $cfg['channel']);
  $channelId = $ch['items'][0]['id'];
  $uploads = $ch['items'][0]['contentDetails']['relatedPlaylists']['uploads'];

  // 2) playlists do canal: título -> id
  $ids = [];
  $tok = null; $pages = 0;
  do {
    $j = $api('playlists', ['part' => 'snippet', 'channelId' => $channelId, 'maxResults' => 50, 'pageToken' => $tok]);
    foreach (isset($j['items']) ? $j['items'] : [] as $p) $ids[nn_norm($p['snippet']['title'])] = $p['id'];
    $tok = isset($j['nextPageToken']) ? $j['nextPageToken'] : null;
  } while ($tok && ++$pages < 3);

  $listPlaylist = function ($id, $want) use ($api) {
    $j = $api('playlistItems', ['part' => 'snippet,contentDetails,status', 'playlistId' => $id, 'maxResults' => min(50, $want + 10)]);
    $out = [];
    foreach (isset($j['items']) ? $j['items'] : [] as $i) {
      $priv = isset($i['status']['privacyStatus']) && $i['status']['privacyStatus'] === 'private';
      if ($priv || preg_match('/^(Private|Deleted) video$/i', $i['snippet']['title'])) continue;
      $out[] = ['id' => $i['contentDetails']['videoId'], 'title' => nn_yt_clean($i['snippet']['title'])];
    }
    return $out;
  };

  // 3) playlists pedidas
  $plists = [];
  foreach ($cfg['playlists'] as $want) {
    $k = nn_norm($want['title']);
    if (!isset($ids[$k])) { $warnings[] = 'Playlist não encontrada no canal: ' . $want['title']; continue; }
    $plists[] = ['title' => $want['title'], 'items' => $listPlaylist($ids[$k], $cfg['maxPerPlaylist'])];
  }

  // 4) Shorts: a playlist "UUSH..." do canal contém só os Shorts. Lê até 200: os primeiros viram "Vídeos curtos";
  //    o conjunto todo identifica playlists de Shorts (a duração não serve: Shorts chegam a 3 min).
  $uploadItems = $listPlaylist($uploads, 50);
  $shortItems = []; $shortSet = [];
  try {
    $tok = null; $n = 0;
    do {
      $j = $api('playlistItems', ['part' => 'snippet,contentDetails', 'playlistId' => 'UUSH' . substr($channelId, 2), 'maxResults' => 50, 'pageToken' => $tok]);
      foreach (isset($j['items']) ? $j['items'] : [] as $i) {
        $shortSet[$i['contentDetails']['videoId']] = true;
        if (!preg_match('/^(Private|Deleted) video$/i', $i['snippet']['title'])) $shortItems[] = ['id' => $i['contentDetails']['videoId'], 'title' => nn_yt_clean($i['snippet']['title'])];
      }
      $tok = isset($j['nextPageToken']) ? $j['nextPageToken'] : null;
    } while ($tok && ++$n < 4);
  } catch (Throwable $e) { /* plano B abaixo */ }
  $shortItems = array_slice($shortItems, 0, $cfg['maxShorts'] + 10);

  // 5) detalhes (duração e agendamento) em lotes de 50
  $all = [];
  foreach ($plists as $p) foreach ($p['items'] as $i) $all[$i['id']] = true;
  foreach ($uploadItems as $i) $all[$i['id']] = true;
  foreach ($shortItems as $i) $all[$i['id']] = true;
  $detail = [];
  foreach (array_chunk(array_keys($all), 50) as $chunk) {
    $j = $api('videos', ['part' => 'snippet,contentDetails,liveStreamingDetails', 'id' => implode(',', $chunk),
      'fields' => 'items(id,snippet(liveBroadcastContent),contentDetails(duration),liveStreamingDetails(scheduledStartTime))']);
    foreach (isset($j['items']) ? $j['items'] : [] as $v) {
      $detail[$v['id']] = [
        'upcoming' => isset($v['snippet']['liveBroadcastContent']) && $v['snippet']['liveBroadcastContent'] === 'upcoming',
        'secs' => nn_yt_seconds(isset($v['contentDetails']['duration']) ? $v['contentDetails']['duration'] : ''),
        'start' => isset($v['liveStreamingDetails']['scheduledStartTime']) ? $v['liveStreamingDetails']['scheduledStartTime'] : null,
      ];
    }
  }
  $upcoming = function ($id) use ($detail) { return isset($detail[$id]) && $detail[$id]['upcoming']; };
  $known = function ($id) use ($detail) { return isset($detail[$id]); }; // removidos/privados não vêm em videos.list

  if (!$shortItems) {
    foreach ($uploadItems as $i) if ($known($i['id']) && !$upcoming($i['id']) && $detail[$i['id']]['secs'] <= 60) $shortItems[] = $i;
    $shortItems = array_slice($shortItems, 0, $cfg['maxShorts']);
    if ($shortItems) $warnings[] = 'Shorts obtidos pelo plano B (envios de até 60 s).';
  }

  // 6) próximas transmissões (de qualquer playlist configurada ou dos envios recentes)
  $seen = []; $up = [];
  $pool = $uploadItems;
  foreach ($plists as $p) foreach ($p['items'] as $i) $pool[] = $i;
  foreach ($pool as $it) {
    if (isset($seen[$it['id']]) || !$upcoming($it['id'])) continue;
    $seen[$it['id']] = true;
    $up[] = ['id' => $it['id'], 'title' => $it['title'], 'start' => $detail[$it['id']]['start']];
  }
  usort($up, function ($a, $b) { return strcmp((string)$a['start'], (string)$b['start']); });
  $fmt = function ($iso) use ($cfg) {
    try { $d = new DateTime((string)$iso); $d->setTimezone(new DateTimeZone($cfg['brand']['timeZone'])); return $d->format('d/m/Y, H:i'); } catch (Throwable $e) { return ''; }
  };

  $shorts = [];
  foreach ($shortItems as $i) { if (!$upcoming($i['id'])) $shorts[] = ['id' => $i['id'], 'title' => $i['title']]; }
  $outPl = [];
  foreach ($plists as $p) {
    $vids = [];
    foreach ($p['items'] as $i) if ($known($i['id']) && !$upcoming($i['id'])) $vids[] = $i;
    $vids = array_slice($vids, 0, $cfg['maxPerPlaylist']);
    $inShort = 0;
    foreach ($vids as $i) if (isset($shortSet[$i['id']])) $inShort++;
    $o = ['title' => $p['title'], 'videos' => array_map(function ($i) { return ['id' => $i['id'], 'title' => $i['title']]; }, $vids)];
    if ($vids && $inShort / count($vids) >= 0.8) $o['short'] = true;
    $outPl[] = $o;
  }

  return [
    'channelId' => $channelId, 'warnings' => $warnings, 'apiCalls' => $calls,
    'upcoming' => array_map(function ($u) use ($fmt) { return ['title' => $u['title'], 'video' => $u['id'], 'image' => nn_yt_maxres($u['id']), 'when' => $fmt($u['start'])]; }, array_slice($up, 0, 12)),
    'shorts' => array_slice($shorts, 0, $cfg['maxShorts']),
    'playlists' => $outPl,
  ];
}

// "PT1M5S" -> 65
function nn_yt_seconds($iso) {
  if (!preg_match('/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/', (string)$iso, $m)) return PHP_INT_MAX;
  return ((int)(isset($m[1]) ? $m[1] : 0)) * 86400 + ((int)(isset($m[2]) ? $m[2] : 0)) * 3600 + ((int)(isset($m[3]) ? $m[3] : 0)) * 60 + ((int)(isset($m[4]) ? $m[4] : 0));
}
