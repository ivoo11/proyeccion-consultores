<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/sending.php';
query($db, "INSERT OR REPLACE INTO metadata VALUES ('worker_seen',?)", [(string)time()]);
try { echo 'Aceptados por SMTP: ' . processQueue($db, $cfg) . PHP_EOL; }
catch (Throwable $e) { fwrite(STDERR, $e->getMessage() . PHP_EOL); exit(1); }
