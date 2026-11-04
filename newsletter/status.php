<?php
require __DIR__.'/lib/bootstrap.php';
if(!authed()) { http_response_code(403); exit; }
try {
    $c=campaign($db,(string)($_GET['id']??''));
    header('Content-Type: application/json');
    echo json_encode(['state'=>$c['state'],'counts'=>query($db,'SELECT state,COUNT(*) n FROM recipients WHERE campaign=? GROUP BY state ORDER BY state',[$c['id']])->fetchAll()]);
} catch(Throwable $e) { http_response_code(404); }
