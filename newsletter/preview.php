<?php
require __DIR__ . '/lib/bootstrap.php';
if (!authed()) { http_response_code(403); exit; }
try { $c=isset($_GET['empty'])?emptyDraft(preg_match('/^[a-f0-9]{32}$/',(string)($_GET['id']??''))?(string)$_GET['id']:''):campaign($db,(string)($_GET['id']??'')); $c['subject']=$c['subject']?:'Asunto del informe'; $c['body']=$c['body']?:'El mensaje de tu newsletter aparecerá acá.'; echo emailHtml($c,$cfg); }
catch (Throwable $e) { http_response_code(404); }
