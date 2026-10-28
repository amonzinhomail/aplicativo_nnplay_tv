<?php
// Entrega o window.TV_CONFIG (o que era o data.js). Só lê arquivos: é rápido e não bloqueia a página.
define('NN', 1);
require __DIR__ . '/inc/lib.php';

nn_sec_headers();
header('Content-Type: text/javascript; charset=utf-8');
header('Cache-Control: public, max-age=30');

$cfg = nn_config();
$content = nn_get('content', null);
$status = nn_get('status', []);

// 1ª visita de todas (ainda sem conteúdo): busca agora, uma única vez. Depois disso nunca espera o YouTube.
if (!$content && nn_needs_refresh($cfg, null, $status)) {
  try { $content = nn_refresh_now(); } catch (Throwable $e) { $content = null; }
  $status = nn_get('status', []);
}
$stale = $content && nn_needs_refresh($cfg, $content, $status);

echo 'window.TV_CONFIG = ' . json_encode(nn_build_tv($content, $cfg, $stale), JSON_HEX_TAG | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . ";\n";
