<?php
require __DIR__ . '/lib/bootstrap.php';
$id = (string)($_GET['id'] ?? '');
if (!preg_match('/^[a-f0-9]{32}$/', $id)) { http_response_code(404); exit; }
$c = query($db, "SELECT pdf FROM campaigns WHERE id=? AND state!='deleted'", [$id])->fetch();
if (!$c || !is_file($cfg['data_dir'] . '/pdf/' . $c['pdf'])) { http_response_code(404); exit; }
header('Content-Type: application/pdf');
$disposition = ($_GET['download'] ?? '') === '1' ? 'attachment' : 'inline';
header('Content-Disposition: ' . $disposition . '; filename="informe-proyeccion.pdf"');
header('Content-Length: ' . filesize($cfg['data_dir'] . '/pdf/' . $c['pdf']));
readfile($cfg['data_dir'] . '/pdf/' . $c['pdf']);
