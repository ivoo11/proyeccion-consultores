<?php
declare(strict_types=1);
function database(string $path): PDO {
    $db = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON;');
    $db->exec("CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, subject TEXT NOT NULL, body TEXT NOT NULL, pdf TEXT NOT NULL, created INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'draft', report TEXT NOT NULL, tested INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS recipients (campaign TEXT NOT NULL REFERENCES campaigns(id), email TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY(campaign,email));
    CREATE TABLE IF NOT EXISTS suppressions (email TEXT PRIMARY KEY, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY, campaign TEXT NOT NULL, email TEXT NOT NULL, created INTEGER NOT NULL, state TEXT NOT NULL, test INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS attempts_time ON attempts(created);
    CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
    if ($path !== ':memory:') { chmod($path, 0600); }
    return $db;
}
function query(PDO $db, string $sql, array $args = []): PDOStatement { $s = $db->prepare($sql); $s->execute($args); return $s; }
function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function csrf(): void { if (!hash_equals($_SESSION['csrf'], (string)($_POST['csrf'] ?? ''))) { http_response_code(403); exit('Sesión vencida. Volvé a cargar la página.'); } }
function authed(): bool { return isset($_SESSION['login']) && time() - $_SESSION['login'] < 3600; }
function token(string $email, array $cfg): string { return hash_hmac('sha256', strtolower($email), $cfg['secret']); }
function unsubscribeUrl(string $email, array $cfg): string { return $cfg['base_url'] . '/unsubscribe.php?' . http_build_query(['email' => $email, 'token' => token($email, $cfg)]); }
function campaign(PDO $db, string $id): array { $c = query($db, "SELECT * FROM campaigns WHERE id=? AND state!='deleted'", [$id])->fetch(); if (!$c) { throw new RuntimeException('Campaña inexistente.'); } return $c; }
function emailHtml(array $c, array $cfg, string $email = ''): string {
    $site = preg_replace('~/newsletter/?$~', '', $cfg['base_url']);
    $pdf = $cfg['base_url'] . '/pdf.php?id=' . rawurlencode($c['id']);
    $bottom = $email ? '<a style="color:#62707a" href="' . h(unsubscribeUrl($email, $cfg)) . '">Dejar de recibir estos correos</a>' : 'En cada correo se incluirá el enlace personal para darse de baja.';
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . h($c['subject']) . '</title></head><body style="margin:0;background:#edf0f2;font-family:Arial,Helvetica,sans-serif;color:#242424"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="600" style="max-width:600px;width:100%;background:white" cellpadding="0" cellspacing="0"><tr><td style="background:#1a1a1a;padding:32px"><img src="' . h($site . '/assets/img/navbrand.png') . '" width="200" alt="Proyección Consultores"><p style="color:#62c8ed;letter-spacing:2px;font-size:12px;margin-bottom:0">INFORME MENSUAL</p></td></tr><tr><td style="padding:32px"><h1 data-preview-subject style="font-size:27px;line-height:1.25">' . h($c['subject']) . '</h1><div data-preview-body style="font-size:16px;line-height:1.75;overflow-wrap:anywhere">' . nl2br(h($c['body'])) . '</div><p style="margin-top:32px"><a href="' . h($pdf) . '" style="background:#008fc5;color:white;padding:16px 24px;display:inline-block;text-decoration:none;font-weight:bold;margin:0 12px 12px 0">Ver informe</a> <a href="' . h($pdf . '&download=1') . '" style="background:#ffffff;color:#0067a2;border:1px solid #008fc5;padding:15px 23px;display:inline-block;text-decoration:none;font-weight:bold;margin-bottom:12px">Descargar PDF</a></p><p style="font-size:13px;color:#68747c">Informe en formato PDF</p></td></tr><tr><td style="padding:24px 32px;border-top:1px solid #e5e8eb;font-size:12px;line-height:1.8;color:#62707a">Proyección Consultores · Datos, Estrategia, Acción<br>' . $bottom . '</td></tr></table></td></tr></table></body></html>';
}
function suppress(PDO $db, string $email): void {
    $db->beginTransaction();
    try {
        query($db, 'INSERT OR IGNORE INTO suppressions VALUES (?,?)', [$email, time()]);
        query($db, "UPDATE recipients SET state='suppressed' WHERE email=? AND state='pending'", [$email]);
        $db->commit();
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
}

function draftVersion(array $c): string {
    return hash('sha256', json_encode([$c['subject'], $c['body'], $c['pdf'], $c['report']]));
}

function emptyDraft(string $id): array {
    return ['id'=>$id,'subject'=>'','body'=>'','pdf'=>'','created'=>time(),'state'=>'draft','report'=>'{}','tested'=>0,'_new'=>true];
}
function draftReady(array $c, array $cfg): bool {
    return trim($c['subject'])!=='' && trim($c['body'])!=='' && $c['pdf']!=='' && is_file($cfg['data_dir'].'/pdf/'.$c['pdf']);
}
