<?php
require __DIR__ . '/lib/bootstrap.php';
$email = strtolower(trim((string)($_GET['email'] ?? '')));
$valid = filter_var($email, FILTER_VALIDATE_EMAIL) && hash_equals(token($email, $cfg), (string)($_GET['token'] ?? ''));
if (!$valid) { http_response_code(400); exit('Enlace de baja inválido.'); }
$done = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Signed bearer token authenticates RFC 8058 requests; no session/CSRF required.
    $lock = fopen($cfg['data_dir'] . '/send.lock', 'c'); flock($lock, LOCK_EX);
    try { suppress($db, $email); $done = true; } finally { flock($lock, LOCK_UN); fclose($lock); }
}
?><!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Baja del newsletter</title><link rel="icon" type="image/png" href="../dashboard/media/favicon.png"><link rel="stylesheet" href="panel.css"></head><body><main class="login card"><img src="../assets/img/navbrand.png" width="210" alt="Proyección Consultores"><h1><?= $done ? 'Baja confirmada' : 'Dejar de recibir el newsletter' ?></h1><p><?= $done ? 'No volveremos a incluir este correo en los próximos envíos, aunque aparezca en un nuevo Excel.' : 'Confirmá para dejar de recibir los informes mensuales de Proyección Consultores.' ?></p><?php if (!$done): ?><form method="post"><button>Confirmar mi baja</button></form><?php endif ?></main></body></html>
