<?php
// O navegador chama esta rota quando o conteúdo está vencido (pedido do data.php). O servidor decide se atualiza:
// no máximo 1 atualização a cada "refreshMinutes" (e espera 2 min após uma falha), não importa quantas visitas.
define('NN', 1);
require dirname(__DIR__) . '/inc/lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') nn_json(['error' => 'Use POST.'], 405);
if (!empty($_SERVER['HTTP_ORIGIN']) && parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST) !== parse_url('//' . $_SERVER['HTTP_HOST'], PHP_URL_HOST)) nn_json(['error' => 'Origem não permitida.'], 403);
ignore_user_abort(true);

$cfg = nn_config();
$content = nn_get('content', null);
if (!nn_needs_refresh($cfg, $content, nn_get('status', []))) nn_json(['ok' => true, 'refreshed' => false]);
try { $c = nn_refresh_now(); nn_json(['ok' => true, 'refreshed' => (bool)$c]); }
catch (Throwable $e) { nn_json(['ok' => false, 'refreshed' => false], 200); } // o erro fica no painel (aba YouTube)
