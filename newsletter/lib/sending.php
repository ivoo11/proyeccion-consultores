<?php
declare(strict_types=1);
use PHPMailer\PHPMailer\PHPMailer;
function sendSmtp(array $c, string $email, array $cfg, bool $test): void {
    $mail = new PHPMailer(true);
    $mail->isSMTP(); $mail->Host = $cfg['smtp_host']; $mail->Port = (int)$cfg['smtp_port'];
    $mail->SMTPAuth = true; $mail->Username = $cfg['smtp_user']; $mail->Password = $cfg['smtp_pass'];
    $mail->SMTPSecure = $mail->Port === 465 ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Timeout = 20; $mail->CharSet = 'UTF-8';
    $mail->setFrom($cfg['from_email'], $cfg['from_name']); $mail->addAddress($email);
    $mail->isHTML(true); $mail->Subject = ($test ? '[PRUEBA] ' : '') . $c['subject'];
    $mail->Body = emailHtml($c, $cfg, $email);
    $mail->AltBody = $c['subject'] . "\n\n" . $c['body'] . "\n\nVer informe: " . $cfg['base_url'] . '/pdf.php?id=' . $c['id'] . "\n\nDarse de baja: " . unsubscribeUrl($email, $cfg);
    $mail->addCustomHeader('List-Unsubscribe', '<' . unsubscribeUrl($email, $cfg) . '>');
    $mail->addCustomHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');
    $mail->send();
}
function remaining(PDO $db, array $cfg): int {
    $used = (int)query($db, 'SELECT COUNT(*) FROM attempts WHERE created > ?', [time() - 86400])->fetchColumn();
    return max(0, min(100, (int)$cfg['daily_limit']) - $used);
}
// One local lock serializes all workers and test sends. Reserve durably BEFORE SMTP.
// An interrupted/failed SMTP transaction is ambiguous: never retry it automatically.
function processQueue(PDO $db, array $cfg, ?array $testCampaign = null, ?callable $transport = null): int {
    if (!$cfg['sending_enabled']) { throw new RuntimeException('Los envíos están desactivados en la configuración.'); }
    $lock = fopen($cfg['data_dir'] . '/send.lock', 'c');
    if (!flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); throw new RuntimeException('Hay otro envío en curso. Volvé a intentar en unos instantes.'); }
    $sent = 0;
    try {
        if ($testCampaign) {
            $testCampaign = campaign($db, $testCampaign['id']);
            if ($testCampaign['state'] !== 'draft') throw new RuntimeException('La prueba solo se puede enviar desde un borrador.');
        }
        query($db, "UPDATE recipients SET state='unknown' WHERE state='sending'");
        query($db, "UPDATE attempts SET state='unknown' WHERE state='sending'");
        $max = $testCampaign ? 1 : min(5, max(1, (int)$cfg['batch_size']));
        for ($i = 0; $i < $max; $i++) {
            if (remaining($db, $cfg) === 0) { if ($testCampaign) { throw new RuntimeException('Cupo agotado. Esperá a que se libere capacidad dentro de las próximas 24 horas.'); } break; }
            // Also cap bursts across all campaigns and tests to five reservations/minute.
            if ((int)query($db, 'SELECT COUNT(*) FROM attempts WHERE created > ?', [time()-60])->fetchColumn() >= 5) {
                if ($testCampaign) { throw new RuntimeException('Esperá un minuto antes de la próxima prueba.'); } break;
            }
            if ($testCampaign) {
                $c = $testCampaign; $email = $cfg['test_email'];
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { throw new RuntimeException('Configurá el correo de prueba.'); }
            } else {
                query($db, "UPDATE recipients SET state='suppressed' WHERE state='pending' AND email IN (SELECT email FROM suppressions)");
                $r = query($db, "SELECT r.* FROM recipients r JOIN campaigns c ON c.id=r.campaign WHERE c.state='queued' AND r.state='pending' ORDER BY c.created,r.email LIMIT 1")->fetch();
                if (!$r) break;
                $c = campaign($db, $r['campaign']); $email = $r['email'];
            }
            if (query($db, 'SELECT 1 FROM suppressions WHERE email=?', [$email])->fetchColumn()) {
                if ($testCampaign) { throw new RuntimeException('El correo de prueba está dado de baja. Configurá otro.'); } continue;
            }
            $db->beginTransaction();
            query($db, "INSERT INTO attempts(campaign,email,created,state,test) VALUES (?,?,?,'sending',?)", [$c['id'], $email, time(), $testCampaign ? 1 : 0]);
            $attempt = $db->lastInsertId();
            if (!$testCampaign) query($db, "UPDATE recipients SET state='sending' WHERE campaign=? AND email=?", [$c['id'], $email]);
            $db->commit();
            try {
                ($transport ?? 'sendSmtp')($c, $email, $cfg, (bool)$testCampaign);
            } catch (Throwable $e) {
                query($db, "UPDATE attempts SET state='unknown' WHERE id=?", [$attempt]);
                if (!$testCampaign) {
                    query($db, "UPDATE recipients SET state='unknown' WHERE campaign=? AND email=?", [$c['id'], $email]);
                    query($db, "UPDATE campaigns SET state='paused' WHERE id=?", [$c['id']]);
                }
                throw new RuntimeException('Hostinger no confirmó el envío. Se detuvo el lote; revisá la casilla y la configuración antes de continuar. El correo dudoso no se reenvía automáticamente.');
            }
            $db->beginTransaction();
            query($db, "UPDATE attempts SET state='accepted' WHERE id=?", [$attempt]);
            if (!$testCampaign) query($db, "UPDATE recipients SET state='accepted' WHERE campaign=? AND email=?", [$c['id'], $email]);
            else query($db, 'UPDATE campaigns SET tested=1 WHERE id=?', [$c['id']]);
            $db->commit(); $sent++;
        }
        query($db, "UPDATE campaigns SET state=CASE WHEN EXISTS(SELECT 1 FROM recipients WHERE campaign=campaigns.id AND state='unknown') THEN 'review' ELSE 'completed' END WHERE state='queued' AND NOT EXISTS(SELECT 1 FROM recipients WHERE campaign=campaigns.id AND state IN ('pending','sending'))");
        return $sent;
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}
