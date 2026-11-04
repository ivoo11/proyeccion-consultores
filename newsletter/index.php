<?php
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/import.php';
require __DIR__ . '/lib/sending.php';
require __DIR__ . '/lib/editor.php';
$error = ''; $notice = $_SESSION['notice'] ?? ''; unset($_SESSION['notice']);
function upload(string $key, int $limit): array {
    $f = $_FILES[$key] ?? [];
    if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name']) || $f['size'] > $limit) { throw new RuntimeException('Revisá los archivos: contactos hasta 5 MB y PDF hasta 15 MB.'); }
    return $f;
}
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf();
    try {
        $action = (string)($_POST['action'] ?? '');
        if ($action === 'login') {
            $ip = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? '', $cfg['secret']);
            query($db, 'DELETE FROM login_attempts WHERE created<?', [time()-900]);
            if ((int)query($db, 'SELECT COUNT(*) FROM login_attempts WHERE ip=?', [$ip])->fetchColumn() >= 5 || (int)$db->query('SELECT COUNT(*) FROM login_attempts')->fetchColumn() >= 50) { throw new RuntimeException('Demasiados intentos. Esperá 15 minutos.'); }
            query($db, 'INSERT INTO login_attempts VALUES (?,?)', [$ip, time()]);
            $passwordOk = password_verify((string)($_POST['password'] ?? ''), $cfg['admin_hash']);
            if (!$passwordOk || !hash_equals($cfg['admin_user'], (string)($_POST['user'] ?? ''))) { throw new RuntimeException('Usuario o contraseña incorrectos.'); }
            session_regenerate_id(true); $_SESSION['login'] = time(); $_SESSION['csrf'] = bin2hex(random_bytes(32));
            query($db, 'DELETE FROM login_attempts WHERE ip=?', [$ip]);
            header('Location: ./'); exit;
        }
        if (!authed()) { throw new RuntimeException('Ingresá al panel para continuar.'); }
        $_SESSION['login'] = time();
        if ($action === 'logout') { $_SESSION = []; session_destroy(); header('Location: ./'); exit; }
        if ($action === 'create') {
            $subject = trim((string)($_POST['subject'] ?? '')); $body = trim((string)($_POST['body'] ?? ''));
            if (!$subject || mb_strlen($subject) > 160 || preg_match('/[\r\n]/', $subject) || !$body || mb_strlen($body) > 12000) { throw new RuntimeException('Completá el asunto (hasta 160 caracteres) y el cuerpo (hasta 12.000).'); }
            $contacts = upload('contacts', 5*1024*1024); $pdf = upload('pdf', 15*1024*1024);
            if (strtolower(pathinfo($pdf['name'], PATHINFO_EXTENSION)) !== 'pdf' || (new finfo(FILEINFO_MIME_TYPE))->file($pdf['tmp_name']) !== 'application/pdf' || file_get_contents($pdf['tmp_name'], false, null, 0, 5) !== '%PDF-') { throw new RuntimeException('El informe debe ser un PDF válido.'); }
            $result = importContacts($contacts['tmp_name'], strtolower(pathinfo($contacts['name'], PATHINFO_EXTENSION)));
            $id = bin2hex(random_bytes(16)); $filename = $id . '.pdf';
            $result['suppressed'] = 0;
            $db->beginTransaction();
            try {
                query($db, 'INSERT INTO campaigns(id,subject,body,pdf,created,report) VALUES (?,?,?,?,?,?)', [$id,$subject,$body,$filename,time(),'{}']);
                foreach ($result['emails'] as $email) {
                    $suppressed = (bool)query($db, 'SELECT 1 FROM suppressions WHERE email=?', [$email])->fetchColumn();
                    if ($suppressed) $result['suppressed']++;
                    query($db, 'INSERT INTO recipients VALUES (?,?,?)', [$id,$email,$suppressed ? 'suppressed' : 'pending']);
                }
                $result['valid'] = count($result['emails']); unset($result['emails']);
                query($db, 'UPDATE campaigns SET report=? WHERE id=?', [json_encode($result, JSON_THROW_ON_ERROR),$id]);
                if (!move_uploaded_file($pdf['tmp_name'], $cfg['data_dir'] . '/pdf/' . $filename)) { throw new RuntimeException('No se pudo guardar el PDF.'); }
                chmod($cfg['data_dir'] . '/pdf/' . $filename, 0600); $db->commit();
            } catch (Throwable $e) { $db->rollBack(); @unlink($cfg['data_dir'] . '/pdf/' . $filename); throw $e; }
            header('Location: ?id=' . $id); exit;
        }
        // Serialize edits and state transitions with SMTP so the tested content cannot race an edit.
        if ($action !== 'test') {
            $mutationLock = fopen($cfg['data_dir'] . '/send.lock', 'c');
            if (!flock($mutationLock, LOCK_EX | LOCK_NB)) throw new RuntimeException('Hay un envío en curso. Volvé a intentar en unos instantes.');
        }
        $c = campaign($db, (string)($_POST['id'] ?? ''));
        if ($action === 'edit') {
            saveDraft($db, $cfg, $c, $_POST, $_FILES);
            $_SESSION['notice']='Cambios guardados. Enviá una prueba para revisar esta versión.';
        } elseif ($action === 'test') {
            if ($c['state'] !== 'draft') throw new RuntimeException('La prueba se realiza antes de poner la campaña en cola.');
            if (!hash_equals(draftVersion($c), (string)($_POST['version'] ?? ''))) throw new RuntimeException('El borrador cambió en otra pestaña. Recargá la página.');
            processQueue($db, $cfg, $c); $_SESSION['notice'] = 'Prueba aceptada por Hostinger. Revisá la casilla ' . $cfg['test_email'] . ' antes de confirmar el envío.';
        } elseif ($action === 'queue') {
            if (!$cfg['sending_enabled'] || !$c['tested'] || $c['state'] !== 'draft' || !hash_equals(draftVersion($c), (string)($_POST['version'] ?? '')) || !(int)query($db, "SELECT COUNT(*) FROM recipients WHERE campaign=? AND state='pending'", [$c['id']])->fetchColumn()) throw new RuntimeException('Guardá los cambios y enviá una prueba antes de confirmar el envío.');
            query($db, "UPDATE campaigns SET state='queued' WHERE id=? AND state='draft'", [$c['id']]);
            $_SESSION['notice'] = 'Campaña en cola. Se procesará automáticamente con el cupo disponible.';
        } elseif ($action === 'pause') {
            query($db, "UPDATE campaigns SET state='paused' WHERE id=? AND state='queued'", [$c['id']]);
        } elseif ($action === 'resume') {
            query($db, "UPDATE campaigns SET state='queued' WHERE id=? AND state='paused'", [$c['id']]);
        }
        header('Location: ?id=' . $c['id']); exit;
    } catch (Throwable $e) { $error = $e instanceof RuntimeException ? $e->getMessage() : 'No se pudo completar la operación. Revisá la configuración y los archivos.'; }
}
$logged = authed();
if ($logged) $_SESSION['login'] = time();
$selected = null;
if ($logged && isset($_GET['id'])) { try { $selected = campaign($db, (string)$_GET['id']); } catch (Throwable $e) { $error = 'Campaña inexistente.'; } }
$labels = ['draft'=>'Borrador','queued'=>'En cola','paused'=>'Pausada','completed'=>'Completada','review'=>'Requiere revisión','pending'=>'Pendientes','accepted'=>'Aceptados por Hostinger','suppressed'=>'Dados de baja','unknown'=>'Sin confirmación','sending'=>'En proceso'];
function hidden(string $action, string $id = ''): void { echo '<input type="hidden" name="csrf" value="'.h($_SESSION['csrf']).'"><input type="hidden" name="action" value="'.h($action).'"><input type="hidden" name="id" value="'.h($id).'">'; }
?><!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Newsletter · Proyección Consultores</title><link rel="icon" type="image/png" href="../dashboard/media/favicon.png"><link rel="stylesheet" href="panel.css?v=20261104-1"><script src="panel.js?v=20261104-1" defer></script></head><body>
<header><a href="./"><img src="../assets/img/navbrand.png" width="190" alt="Proyección Consultores"></a><span>NEWSLETTER MENSUAL</span><?php if ($logged): ?><form method="post"><?php hidden('logout'); ?><button class="secondary">Salir</button></form><?php endif ?></header>
<main><?php if ($error): ?><div role="alert" class="alert error"><?= h($error) ?></div><?php endif ?><?php if ($notice): ?><div role="status" class="alert"><?= h($notice) ?></div><?php endif ?>
<?php if (!$logged): ?><section class="login card"><p class="eyebrow">ACCESO PRIVADO</p><h1>Informes que conectan.</h1><p class="muted">Ingresá para preparar y enviar el newsletter de Proyección.</p><form method="post"><?php hidden('login'); ?><label>Usuario<input name="user" autocomplete="username" required></label><label>Contraseña<input type="password" name="password" autocomplete="current-password" required></label><button>Ingresar al panel</button></form></section>
<?php else: ?><div class="heading"><div><h1>Newsletter mensual</h1></div><div class="heading-meta"><p class="quota"><strong><?= remaining($db,$cfg) ?></strong> envíos disponibles</p></div></div>
<?php $heartbeat = (int)query($db,"SELECT value FROM metadata WHERE key='worker_seen'")->fetchColumn(); if ($heartbeat < time()-900): ?><div class="alert warning">El proceso automático todavía no está activo o no se ejecutó en los últimos 15 minutos. Las campañas quedarán pendientes hasta configurar o revisar la tarea programada en Hostinger.</div><?php endif ?>
<?php if (!$selected): ?>
<section class="card compose">
  <h2>Nuevo informe</h2>
  <form method="post" enctype="multipart/form-data">
    <?php hidden('create'); ?>
    <div class="compose-fields">
      <div class="compose-message">
        <label>Asunto del correo<input name="subject" maxlength="160" required placeholder="Informe mensual · Noviembre 2026" value="<?= h((string)($_POST['subject']??'')) ?>"></label>
        <label>Mensaje introductorio<textarea name="body" rows="8" maxlength="12000" required placeholder="Compartimos las novedades y los principales datos de este mes…"><?= h((string)($_POST['body']??'')) ?></textarea></label>
      </div>
      <div class="compose-files">
        <label>Listado de contactos<input name="contacts" type="file" accept=".xlsx,.csv" required><small>XLSX o CSV · hasta 5 MB<br>Primera hoja · columna Email</small></label>
        <label>Informe mensual<input name="pdf" type="file" accept=".pdf" required><small>PDF · hasta 15 MB<br>Se comparte mediante un enlace</small></label>
      </div>
    </div>
    <div class="compose-actions"><button>Revisar contactos y vista previa</button></div>
  </form>
</section>
<?php else: $c=$selected; $report=json_decode($c['report'],true); $counts=[]; foreach(query($db,'SELECT state,COUNT(*) n FROM recipients WHERE campaign=? GROUP BY state',[$c['id']]) as $r) $counts[$r['state']]=$r['n']; ?>
<div class="grid campaign-editor" data-campaign="<?= h($c['id']) ?>" data-state="<?= h($c['state']) ?>" data-status="<?= h(json_encode(['state'=>$c['state'],'counts'=>query($db,'SELECT state,COUNT(*) n FROM recipients WHERE campaign=? GROUP BY state ORDER BY state',[$c['id']])->fetchAll()])) ?>"><section class="card">
<a class="button secondary back-button" href="./">Volver al inicio</a>
<?php if($c['state']==='draft'): ?>
<form method="post" enctype="multipart/form-data" id="draft-editor">
<?php hidden('edit',$c['id']); ?><input type="hidden" name="version" value="<?= h(draftVersion($c)) ?>">
<label>Asunto del correo<input name="subject" required maxlength="160" value="<?= h($error ? (string)($_POST['subject']??$c['subject']) : $c['subject']) ?>"></label>
<label>Mensaje introductorio<textarea name="body" required rows="5" maxlength="12000"><?= h($error ? (string)($_POST['body']??$c['body']) : $c['body']) ?></textarea></label>
<?php else: ?><h2><?= h($c['subject']) ?></h2><p class="muted"><?= h($labels[$c['state']]) ?></p><?php endif ?>
<div class="recipient-summary">
<div class="recipient-total"><strong><?= (int)($counts['pending']??0) ?></strong><span><?= $c['state']==='draft'?'mails listos para el envío':'mails pendientes' ?></span></div>
<div class="import-stats"><span><?= (int)($report['duplicates']??0) ?> duplicados</span><span><?= count($report['invalid']??[]) ?> inválidos</span><span><?= (int)($report['blank']??0) ?> celdas vacías</span><?php if(!empty($counts['suppressed'])): ?><span><?= (int)$counts['suppressed'] ?> dados de baja</span><?php endif ?></div>
<?php if($c['state']!=='draft'): ?><div class="import-stats"><?php foreach($counts as $state=>$n): if($state==='pending')continue; ?><span><?= (int)$n ?> <?= h($labels[$state]) ?></span><?php endforeach ?></div><?php endif ?>
<?php if($c['state']==='draft'): ?><button type="button" class="secondary compact" data-toggle="contacts-editor" aria-expanded="false">Editar contactos</button><?php endif ?>
</div>
<?php if($report['invalid']??[]): ?><details><summary>Ver correos inválidos</summary><ul><?php foreach(array_slice($report['invalid'],0,100) as $bad): ?><li>Fila <?= (int)$bad['row'] ?>: <?= h($bad['value']) ?></li><?php endforeach ?></ul></details><?php endif ?>
<?php if($c['state']==='draft'): ?>
<div id="contacts-editor" hidden class="edit-block">
<label>Reemplazar listado<input type="file" name="contacts" accept=".xlsx,.csv"><small>XLSX o CSV · hasta 5 MB</small></label>
<label>Editar mails<textarea name="emails" rows="7" maxlength="5200000" spellcheck="false"><?php $emails=query($db,'SELECT email FROM recipients WHERE campaign=? ORDER BY email',[$c['id']])->fetchAll(PDO::FETCH_COLUMN); echo h($error ? (string)($_POST['emails']??implode("\n",$emails)) : implode("\n",$emails)); ?></textarea><small>Un mail por línea. Podés agregar, corregir o quitar contactos.</small></label>
<input type="hidden" name="contacts_mode" value="<?= $error ? h((string)($_POST['contacts_mode']??'')) : '' ?>">
</div>
<?php endif ?>
<div class="pdf-tools"><span class="field-title">Informe mensual</span><div class="button-row"><a class="button secondary" href="pdf.php?id=<?= h($c['id']) ?>" target="_blank" rel="noopener">Ver PDF cargado</a><?php if($c['state']==='draft'): ?><button type="button" class="secondary" data-toggle="pdf-editor" aria-expanded="false">Cambiar PDF</button><?php endif ?></div>
<?php if($c['state']==='draft'): ?><div id="pdf-editor" hidden><label>Nuevo PDF<input type="file" name="pdf" accept=".pdf"><small>PDF · hasta 15 MB</small></label></div><?php endif ?></div>
<?php if($c['state']==='draft'): ?>
<div class="save-row"><button class="secondary" id="save-draft">Guardar cambios</button><span class="muted" id="save-status" role="status">Cambios guardados</span></div></form>
<div class="send-actions"><form method="post" class="send-form"><?php hidden('test',$c['id']); ?><input type="hidden" name="version" value="<?= h(draftVersion($c)) ?>"><button class="secondary" <?= !$cfg['sending_enabled']?'disabled':'' ?>>Enviar prueba a mi correo</button><small><?= h($cfg['test_email']) ?></small></form>
<form method="post" class="send-form"><?php hidden('queue',$c['id']); ?><input type="hidden" name="version" value="<?= h(draftVersion($c)) ?>"><button <?= !$c['tested'] || !$cfg['sending_enabled'] || empty($counts['pending'])?'disabled':'' ?>>Confirmar envío a <?= (int)($counts['pending']??0) ?> contactos</button><?php if(!$c['tested']): ?><small>Enviá una prueba para habilitar el envío.</small><?php endif ?></form></div>
<?php elseif(in_array($c['state'],['queued','paused'],true)): ?><form method="post"><?php hidden($c['state']==='queued'?'pause':'resume',$c['id']); ?><button class="secondary"><?= $c['state']==='queued'?'Pausar próximos envíos':'Continuar pendientes' ?></button></form><?php endif ?>
<?php if (!empty($counts['unknown'])): ?><div class="alert warning">Hay <?= (int)$counts['unknown'] ?> correos sin confirmación. Revisá su estado en Hostinger antes de continuar.</div><?php endif ?>
</section><section class="card preview"><h2>Vista previa del email</h2><iframe title="Vista previa del newsletter" sandbox src="preview.php?id=<?= h($c['id']) ?>"></iframe></section></div>
<?php endif ?>
<section class="card history"><h2>Campañas</h2><div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Asunto</th><th>Estado</th></tr></thead><tbody><?php foreach($db->query('SELECT * FROM campaigns ORDER BY created DESC LIMIT 50') as $c): ?><tr><td><?= date('d/m/Y',$c['created']) ?></td><td><a href="?id=<?= h($c['id']) ?>"><?= h($c['subject']) ?></a></td><td><?= h($labels[$c['state']]) ?></td></tr><?php endforeach ?></tbody></table></div></section><?php endif ?></main><footer>Proyección Consultores · Datos, Estrategia, Acción</footer></body></html>
