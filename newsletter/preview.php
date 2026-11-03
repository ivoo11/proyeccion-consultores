<?php
require __DIR__ . '/lib/bootstrap.php';
if (!authed()) { http_response_code(403); exit; }
try { echo emailHtml(campaign($db, (string)($_GET['id']??'')), $cfg); }
catch (Throwable $e) { http_response_code(404); }
