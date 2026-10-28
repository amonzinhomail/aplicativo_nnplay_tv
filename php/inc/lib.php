<?php
// Funções compartilhadas: armazenamento, segurança, sessão, configuração e atualização do YouTube.
// Compatível com PHP 7.4 ou superior.
if (!defined('NN')) { http_response_code(404); exit; }

define('NN_ROOT', dirname(__DIR__));
define('NN_DATA', NN_ROOT . '/data');
define('NN_UPLOADS', NN_ROOT . '/uploads');

if (is_file(NN_ROOT . '/config.php')) require NN_ROOT . '/config.php';
foreach (['NN_ADMIN_PASSWORD' => '', 'NN_YOUTUBE_API_KEY' => '', 'NN_YT_API_BASE' => 'https://www.googleapis.com/youtube/v3'] as $k => $v) {
  if (!defined($k)) define($k, $v);
}
require __DIR__ . '/defaults.php';
require __DIR__ . '/youtube.php';

const NN_SESSION_SECONDS = 8 * 3600;
const NN_MAX_UPLOAD = 5 * 1024 * 1024;

// ---------- respostas ----------
function nn_sec_headers() {
  header('X-Content-Type-Options: nosniff');
  header('X-Frame-Options: SAMEORIGIN');
  header('Referrer-Policy: strict-origin-when-cross-origin');
}
function nn_json($data, $status = 200, $extra = []) {
  nn_sec_headers();
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  foreach ($extra as $h) header($h);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

// ---------- armazenamento em arquivos ----------
// Cada arquivo começa com uma linha PHP que encerra a execução: mesmo que o servidor ignore o .htaccess,
// abrir o arquivo no navegador não mostra nada (nem a senha, nem a chave de sessão).
const NN_GUARD = "<?php http_response_code(404); exit; ?>\n";
function nn_path($name) { return NN_DATA . '/' . preg_replace('/[^a-z0-9_-]/i', '', $name) . '.json.php'; }
function nn_ensure_dirs() {
  foreach ([NN_DATA, NN_UPLOADS] as $d) if (!is_dir($d)) @mkdir($d, 0755, true);
}
function nn_get($name, $default = null) {
  $f = nn_path($name);
  if (!is_file($f)) return $default;
  $raw = @file_get_contents($f);
  if ($raw === false) return $default;
  if (strpos($raw, NN_GUARD) === 0) $raw = substr($raw, strlen(NN_GUARD));
  $v = json_decode($raw, true);
  return $v === null && trim($raw) !== 'null' ? $default : $v;
}
function nn_put($name, $value) {
  nn_ensure_dirs();
  $f = nn_path($name);
  $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
  $lock = @fopen(NN_DATA . '/.lock', 'c');
  if ($lock) flock($lock, LOCK_EX);
  $ok = @file_put_contents($tmp, NN_GUARD . json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) !== false && @rename($tmp, $f);
  if (!$ok) @unlink($tmp);
  if ($lock) { flock($lock, LOCK_UN); fclose($lock); }
  if (!$ok) throw new RuntimeException('Não foi possível gravar em data/. Verifique as permissões da pasta.');
}
function nn_forget($name) { @unlink(nn_path($name)); }

// ---------- validação ----------
function nn_str($v, $max) { $s = is_scalar($v) ? (string)$v : ''; return function_exists('mb_substr') ? mb_substr($s, 0, $max, 'UTF-8') : substr($s, 0, $max); }
// só http(s) ou caminho do site: bloqueia javascript:, data: e //host
function nn_safe_url($v) { $s = trim(nn_str($v, 2000)); return $s === '' || preg_match('#^(https?://|/(?!/))#i', $s) ? $s : ''; }
function nn_https_url($v) { $s = trim(nn_str($v, 2000)); return preg_match('#^https://#i', $s) ? $s : ''; }
function nn_clamp($v, $lo, $hi, $d) { return is_numeric($v) ? max($lo, min($hi, (int)round((float)$v))) : $d; }
function nn_scrub($m) { return substr(preg_replace('/key=[^&\s"\']+/i', 'key=***', (string)$m), 0, 300); }
function nn_norm($s) { // minúsculas e sem acentos, para comparar títulos
  static $map = ['á'=>'a','à'=>'a','â'=>'a','ã'=>'a','ä'=>'a','é'=>'e','è'=>'e','ê'=>'e','ë'=>'e','í'=>'i','ì'=>'i','î'=>'i','ï'=>'i','ó'=>'o','ò'=>'o','ô'=>'o','õ'=>'o','ö'=>'o','ú'=>'u','ù'=>'u','û'=>'u','ü'=>'u','ç'=>'c','ñ'=>'n',
    'Á'=>'a','À'=>'a','Â'=>'a','Ã'=>'a','Ä'=>'a','É'=>'e','È'=>'e','Ê'=>'e','Ë'=>'e','Í'=>'i','Ì'=>'i','Î'=>'i','Ï'=>'i','Ó'=>'o','Ò'=>'o','Ô'=>'o','Õ'=>'o','Ö'=>'o','Ú'=>'u','Ù'=>'u','Û'=>'u','Ü'=>'u','Ç'=>'c','Ñ'=>'n'];
  return strtolower(trim(preg_replace('/\s+/u', ' ', strtr((string)$s, $map))));
}

function nn_clean_config($c) {
  $d = nn_default_config();
  $c = is_array($c) ? $c : [];
  $brand = isset($c['brand']) && is_array($c['brand']) ? $c['brand'] : [];
  $tz = nn_str(isset($brand['timeZone']) ? $brand['timeZone'] : '', 60);
  $live = [];
  foreach (array_slice(isset($c['live']) && is_array($c['live']) ? $c['live'] : [], 0, 5) as $l) {
    if (!is_array($l)) continue;
    $item = ['title' => trim(nn_str(isset($l['title']) ? $l['title'] : '', 80)), 'hls' => nn_https_url(isset($l['hls']) ? $l['hls'] : ''), 'poster' => nn_safe_url(isset($l['poster']) ? $l['poster'] : '')];
    if ($item['title'] !== '' || $item['hls'] !== '') $live[] = $item;
  }
  $pls = [];
  foreach (array_slice(isset($c['playlists']) && is_array($c['playlists']) ? $c['playlists'] : [], 0, 30) as $p) {
    if (!is_array($p)) continue;
    $t = trim(nn_str(isset($p['title']) ? $p['title'] : '', 120));
    if ($t === '') continue;
    $pls[] = ['title' => $t, 'cover' => nn_safe_url(isset($p['cover']) ? $p['cover'] : ''), 'noCover' => !empty($p['noCover'])];
  }
  $name = trim(nn_str(isset($brand['name']) ? $brand['name'] : '', 60));
  return [
    'brand' => ['name' => $name !== '' ? $name : $d['brand']['name'], 'logo' => nn_safe_url(isset($brand['logo']) ? $brand['logo'] : ''), 'timeZone' => ($tz !== '' && in_array($tz, timezone_identifiers_list(), true)) ? $tz : $d['brand']['timeZone']],
    'live' => $live,
    'channel' => trim(nn_str(isset($c['channel']) ? $c['channel'] : '', 60)) ?: $d['channel'],
    'maxShorts' => nn_clamp(isset($c['maxShorts']) ? $c['maxShorts'] : null, 0, 50, $d['maxShorts']),
    'maxPerPlaylist' => nn_clamp(isset($c['maxPerPlaylist']) ? $c['maxPerPlaylist'] : null, 1, 50, $d['maxPerPlaylist']),
    'refreshMinutes' => nn_clamp(isset($c['refreshMinutes']) ? $c['refreshMinutes'] : null, 5, 1440, $d['refreshMinutes']),
    'playlists' => $pls,
  ];
}
function nn_config() { return nn_clean_config(nn_get('config', nn_default_config())); }
function nn_banners() { $b = nn_get('banners', null); return is_array($b) ? $b : nn_default_banners(); } // [] salvo = sem banners
function nn_clean_banner($b) {
  $b = is_array($b) ? $b : [];
  return ['title' => nn_str(isset($b['title']) ? $b['title'] : '', 120), 'subtitle' => nn_str(isset($b['subtitle']) ? $b['subtitle'] : '', 240),
    'image' => nn_safe_url(isset($b['image']) ? $b['image'] : ''), 'link' => nn_safe_url(isset($b['link']) ? $b['link'] : ''), 'active' => !array_key_exists('active', $b) || $b['active'] !== false];
}

// ---------- sessão do /admin (cookie assinado com chave aleatória guardada em data/) ----------
function nn_b64u($bin) { return rtrim(strtr(base64_encode($bin), '+/', '-_'), '='); }
function nn_sign_key($create) {
  $k = nn_get('sk', null);
  if (!$k && $create) { $k = bin2hex(random_bytes(32)); nn_put('sk', $k); }
  return $k ? $k . ':' . hash('sha256', NN_ADMIN_PASSWORD) : null; // trocar a senha invalida as sessões
}
function nn_rotate_sessions() { nn_put('sk', bin2hex(random_bytes(32))); }
function nn_make_token() { $p = (string)(time() + NN_SESSION_SECONDS); return $p . '.' . nn_b64u(hash_hmac('sha256', 'sid:' . $p, nn_sign_key(true), true)); }
function nn_is_authed() {
  if (strlen(NN_ADMIN_PASSWORD) < 12 || empty($_COOKIE['sid']) || !preg_match('/^(\d+)\.([\w-]+)$/', $_COOKIE['sid'], $m)) return false;
  if ((int)$m[1] < time()) return false;
  $key = nn_sign_key(false);
  return $key ? hash_equals(nn_b64u(hash_hmac('sha256', 'sid:' . $m[1], $key, true)), $m[2]) : false;
}
function nn_is_https() { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https'); }
function nn_set_cookie($value, $ttl) {
  setcookie('sid', $value, ['expires' => $ttl > 0 ? time() + $ttl : time() - 3600, 'path' => '/', 'secure' => nn_is_https(), 'httponly' => true, 'samesite' => 'Strict']);
}

// ---------- conteúdo do YouTube (atualiza quando está vencido) ----------
function nn_needs_refresh($cfg, $content, $status) {
  if (NN_YOUTUBE_API_KEY === '') return false;
  if (!empty($status['lastAttempt']) && time() - $status['lastAttempt'] < 120) return false; // após falha/tentativa: espera 2 min
  return !$content || time() - (int)$content['updatedAt'] > $cfg['refreshMinutes'] * 60;
}
function nn_refresh_now() {
  @set_time_limit(120);
  nn_ensure_dirs();
  $lock = NN_DATA . '/refresh.lock';
  if (is_file($lock) && time() - filemtime($lock) < 120) return null; // já há uma atualização em andamento
  @touch($lock);
  $cfg = nn_config();
  $started = time();
  try {
    $content = nn_yt_sync($cfg);
    $content['updatedAt'] = time();
    nn_put('content', $content);
    nn_put('status', ['ok' => true, 'lastAttempt' => $started, 'updatedAt' => $content['updatedAt'], 'apiCalls' => $content['apiCalls'], 'warnings' => $content['warnings']]);
    return $content;
  } catch (Throwable $e) {
    nn_put('status', ['ok' => false, 'lastAttempt' => $started, 'lastError' => nn_scrub($e->getMessage())]);
    throw $e;
  } finally { @unlink($lock); }
}

// Monta o window.TV_CONFIG que o site lê (igual ao servidor Node e ao Worker).
function nn_build_tv($content, $cfg, $stale) {
  $byTitle = [];
  foreach ($cfg['playlists'] as $i => $p) $byTitle[nn_norm($p['title'])] = [$i, $p];
  $pls = [];
  foreach ($content && isset($content['playlists']) ? $content['playlists'] : [] as $p) {
    $k = nn_norm($p['title']);
    if (!isset($byTitle[$k])) continue;
    list($idx, $o) = $byTitle[$k];
    $r = ['title' => $p['title'], 'videos' => $p['videos']];
    if (!empty($o['noCover'])) $r['noCover'] = true; elseif ($o['cover'] !== '') $r['cover'] = $o['cover'];
    if (!empty($p['short'])) $r['short'] = true;
    $pls[$idx] = $r;
  }
  ksort($pls);
  $tv = ['brand' => $cfg['brand'], 'banners' => [], 'live' => $cfg['live'], 'upcoming' => $content ? $content['upcoming'] : [], 'shorts' => $content ? $content['shorts'] : [], 'playlists' => array_values($pls)];
  if ($stale) { $tv['stale'] = true; $tv['refreshUrl'] = '/api/refresh.php'; } // o navegador pede a atualização (não depende de cron)
  return $tv;
}
