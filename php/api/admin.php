<?php
// API do /admin. Rota pela query: /api/admin.php?r=banners/ID
// PUT/DELETE chegam como POST + cabeçalho X-HTTP-Method-Override (alguns firewalls de hospedagem bloqueiam PUT/DELETE).
define('NN', 1);
require dirname(__DIR__) . '/inc/lib.php';

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST' && !empty($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
  $o = strtoupper($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
  if (in_array($o, ['PUT', 'DELETE'], true)) $method = $o;
}
$path = '/' . trim(isset($_GET['r']) ? (string)$_GET['r'] : '', '/');
header('Cache-Control: no-store');

function nn_body($limit = 131072) {
  $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
  if ($raw === false || strlen($raw) > $limit) nn_json(['error' => 'Conteúdo muito grande.'], 413);
  $j = json_decode($raw === '' ? '{}' : $raw, true);
  if (!is_array($j)) nn_json(['error' => 'JSON inválido.'], 400);
  return $j;
}
function nn_uuid() { $b = random_bytes(16); $b[6] = chr((ord($b[6]) & 0x0f) | 0x40); $b[8] = chr((ord($b[8]) & 0x3f) | 0x80); $h = bin2hex($b); return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20); }
function nn_image_in_use($url, $banners, $cfg) {
  foreach ($banners as $b) if (isset($b['image']) && $b['image'] === $url) return true;
  foreach ($cfg['playlists'] as $p) if ($p['cover'] === $url) return true;
  return $url !== '' && $cfg['brand']['logo'] === $url;
}

try {
  // ---------- login / logout ----------
  if ($path === '/login' && $method === 'POST') {
    if (strlen(NN_ADMIN_PASSWORD) < 12) nn_json(['error' => 'Defina NN_ADMIN_PASSWORD (mín. 12 caracteres) no arquivo config.php.'], 500);
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'local';
    $rl = nn_get('rl', []);
    foreach ($rl as $k => $e) if (!isset($e['until']) || $e['until'] < time()) unset($rl[$k]);
    $tries = isset($rl[$ip]) ? (int)$rl[$ip]['n'] : 0;
    if ($tries >= 5) nn_json(['error' => 'Muitas tentativas. Aguarde um minuto.'], 429);
    $b = nn_body(4096);
    if (!isset($b['password']) || !is_string($b['password']) || !hash_equals(hash('sha256', NN_ADMIN_PASSWORD), hash('sha256', $b['password']))) {
      $rl[$ip] = ['n' => $tries + 1, 'until' => time() + 60];
      nn_put('rl', $rl);
      nn_json(['error' => 'Senha incorreta.'], 401);
    }
    unset($rl[$ip]); nn_put('rl', $rl);
    nn_set_cookie(nn_make_token(), NN_SESSION_SECONDS);
    nn_json(['ok' => true]);
  }
  if ($path === '/logout' && $method === 'POST') {
    if (nn_is_authed()) nn_rotate_sessions(); // só quem está logado pode invalidar as sessões
    nn_set_cookie('', 0);
    nn_json(['ok' => true]);
  }

  // ---------- tudo abaixo exige login ----------
  if (!nn_is_authed()) nn_json(['error' => 'Não autenticado.'], 401);
  if ($method !== 'GET' && !empty($_SERVER['HTTP_ORIGIN']) && parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST) !== parse_url('//' . $_SERVER['HTTP_HOST'], PHP_URL_HOST)) nn_json(['error' => 'Origem não permitida.'], 403); // anti-CSRF

  // ---------- banners ----------
  if ($path === '/banners' && $method === 'GET') nn_json(nn_banners());
  if ($path === '/banners' && $method === 'POST') {
    $list = nn_banners();
    $b = ['id' => nn_uuid()] + nn_clean_banner(nn_body());
    $list[] = $b;
    nn_put('banners', array_values($list));
    nn_json($b, 201);
  }
  if ($path === '/banners/order' && $method === 'PUT') {
    $body = nn_body();
    $list = nn_banners(); $by = [];
    foreach ($list as $b) $by[$b['id']] = $b;
    $sorted = [];
    foreach (isset($body['ids']) && is_array($body['ids']) ? $body['ids'] : [] as $id) if (is_string($id) && isset($by[$id])) { $sorted[] = $by[$id]; unset($by[$id]); }
    nn_put('banners', array_merge($sorted, array_values($by)));
    nn_json(['ok' => true]);
  }
  if (preg_match('#^/banners/([\w-]+)$#', $path, $m)) {
    $id = $m[1];
    $list = nn_banners();
    $i = null;
    foreach ($list as $k => $b) if ($b['id'] === $id) { $i = $k; break; }
    if ($i === null) nn_json(['error' => 'Banner não encontrado.'], 404);
    if ($method === 'PUT') {
      $list[$i] = ['id' => $id] + nn_clean_banner(nn_body());
      nn_put('banners', array_values($list));
      nn_json($list[$i]);
    }
    if ($method === 'DELETE') {
      $gone = $list[$i];
      array_splice($list, $i, 1);
      nn_put('banners', array_values($list));
      $img = isset($gone['image']) ? $gone['image'] : '';
      if (strpos($img, '/uploads/') === 0 && !nn_image_in_use($img, $list, nn_config())) {
        $name = basename($img);
        if (preg_match('/^[a-f0-9]{24}\.(png|jpg|webp|gif)$/', $name)) @unlink(NN_UPLOADS . '/' . $name);
      }
      nn_json(['ok' => true]);
    }
  }

  // ---------- upload de imagem ----------
  if ($path === '/upload' && $method === 'POST') {
    $types = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    $ct = strtolower(trim(explode(';', isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '')[0]));
    if (!isset($types[$ct])) nn_json(['error' => 'Use PNG, JPG, WEBP ou GIF.'], 415);
    $ext = $types[$ct];
    $buf = file_get_contents('php://input', false, null, 0, NN_MAX_UPLOAD + 1);
    if ($buf === false || strlen($buf) > NN_MAX_UPLOAD) nn_json(['error' => 'Arquivo muito grande (máx. 5 MB).'], 413);
    $ok = strlen($buf) >= 12 && (
      ($ext === 'png' && substr($buf, 0, 4) === "\x89PNG") || ($ext === 'jpg' && substr($buf, 0, 2) === "\xFF\xD8") ||
      ($ext === 'gif' && substr($buf, 0, 3) === 'GIF') || ($ext === 'webp' && substr($buf, 8, 4) === 'WEBP'));
    if (!$ok) nn_json(['error' => 'Arquivo não é uma imagem válida.'], 415);
    nn_ensure_dirs();
    $name = bin2hex(random_bytes(12)) . '.' . $ext;
    if (@file_put_contents(NN_UPLOADS . '/' . $name, $buf) === false) nn_json(['error' => 'Não foi possível gravar em uploads/. Verifique as permissões da pasta.'], 500);
    nn_json(['url' => '/uploads/' . $name], 201);
  }

  // ---------- configurações e YouTube ----------
  if ($path === '/config' && $method === 'GET') nn_json(nn_config());
  if ($path === '/config' && $method === 'PUT') {
    $cfg = nn_clean_config(nn_body(131072));
    nn_put('config', $cfg);
    nn_json($cfg);
  }
  if ($path === '/status' && $method === 'GET') {
    $content = nn_get('content', null);
    nn_json(['hasKey' => NN_YOUTUBE_API_KEY !== '', 'status' => nn_get('status', null) ?: null, 'updatedAt' => $content ? $content['updatedAt'] * 1000 : null,
      'counts' => $content ? ['upcoming' => count($content['upcoming']), 'shorts' => count($content['shorts']), 'playlists' => count($content['playlists'])] : null]);
  }
  if ($path === '/refresh' && $method === 'POST') {
    if (NN_YOUTUBE_API_KEY === '') nn_json(['error' => 'NN_YOUTUBE_API_KEY não configurada em config.php.'], 400);
    try {
      $c = nn_refresh_now();
      if (!$c) nn_json(['error' => 'Já existe uma atualização em andamento. Aguarde alguns segundos.'], 409);
      nn_json(['ok' => true, 'updatedAt' => $c['updatedAt'] * 1000, 'apiCalls' => $c['apiCalls'], 'warnings' => $c['warnings']]);
    } catch (Throwable $e) { nn_json(['error' => nn_scrub($e->getMessage())], 502); }
  }

  nn_json(['error' => 'Rota inexistente.'], 404);
} catch (Throwable $e) {
  nn_json(['error' => nn_scrub($e->getMessage())], 500);
}
