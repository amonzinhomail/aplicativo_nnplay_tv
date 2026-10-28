<?php
// Banners ativos (público).
define('NN', 1);
require dirname(__DIR__) . '/inc/lib.php';

$active = array_values(array_filter(nn_banners(), function ($b) { return !empty($b['active']); }));
header('Cache-Control: public, max-age=30');
nn_json($active);
