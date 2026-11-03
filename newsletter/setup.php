<?php
declare(strict_types=1);
// Temporary, token-protected setup window; closes permanently when config exists.
ini_set('display_errors', '0');
require __DIR__ . '/lib/paths.php';
require __DIR__ . '/lib/setup-window.php';
$provided = (string)($_GET['token'] ?? '');
if (time() > NEWSLETTER_SETUP_EXPIRES || !hash_equals(NEWSLETTER_SETUP_TOKEN_HASH, hash('sha256', $provided))) { http_response_code(404); exit; }
$private = hostingerPrivateDirectory(__DIR__);
if (!$private || empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') { http_response_code(503); exit('La instalación requiere HTTPS y el alojamiento de Proyección.'); }
$configPath = $private . '/config.php';
if (is_file($configPath)) { http_response_code(404); exit; }
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'self'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
session_name('proyeccion_setup');
session_start(['cookie_secure'=>true,'cookie_httponly'=>true,'cookie_samesite'=>'Strict','use_strict_mode'=>true]);
$_SESSION['csrf'] ??= bin2hex(random_bytes(32));
require __DIR__ . '/vendor/autoload.php';
require __DIR__ . '/lib/core.php';
$missing = [];
foreach (['pdo_sqlite','fileinfo','mbstring','zip','xml','xmlreader','xmlwriter','dom','simplexml','gd','iconv','openssl'] as $extension) { if (!extension_loaded($extension)) $missing[]=$extension; }
$error = ''; $done = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($_SESSION['csrf'], (string)($_POST['csrf']??''))) { http_response_code(403); exit('Recargá el formulario e intentá de nuevo.'); }
    try {
        if ($missing) throw new RuntimeException('Faltan extensiones PHP: '.implode(', ',$missing));
        if (time() - (int)($_SESSION['last_attempt']??0) < 10) throw new RuntimeException('Esperá unos segundos antes de reintentar.');
        $_SESSION['last_attempt']=time();
        $password = (string)($_POST['admin_password']??'');
        if (strlen($password)<12 || strlen($password)>72 || $password !== (string)($_POST['admin_repeat']??'')) throw new RuntimeException('Usá una contraseña del panel de 12 a 72 caracteres y repetila igual.');
        $smtpPassword=(string)($_POST['smtp_password']??'');
        if ($smtpPassword==='') throw new RuntimeException('Ingresá la contraseña actual de hola@proyeccionconsultores.com.ar.');
        $smtp=new PHPMailer\PHPMailer\PHPMailer(true);
        $smtp->isSMTP();$smtp->Host='smtp.hostinger.com';$smtp->SMTPAuth=true;
        $smtp->Username='hola@proyeccionconsultores.com.ar';$smtp->Password=$smtpPassword;
        $smtp->SMTPSecure=PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;$smtp->Port=587;$smtp->Timeout=15;
        try { $smtp->smtpConnect(); $smtp->smtpClose(); } catch (Throwable $e) { throw new RuntimeException('Hostinger no aceptó la conexión SMTP. Revisá la contraseña de esa casilla. No se envió ningún correo.'); }
        umask(0077);
        if (!is_dir($private) && !mkdir($private,0700,true)) throw new RuntimeException('No se pudo crear el almacenamiento privado.');
        $root=realpath($_SERVER['DOCUMENT_ROOT']);$real=realpath($private);
        if (!$root || !$real || $root===$real || str_starts_with($real.'/', $root.'/')) throw new RuntimeException('El almacenamiento debe quedar fuera de la carpeta pública.');
        $lock=fopen($private.'/setup.lock','c');
        if (!$lock || !flock($lock,LOCK_EX)) throw new RuntimeException('No se pudo bloquear la configuración.');
        try {
            if (is_file($configPath)) throw new RuntimeException('El panel ya fue configurado.');
            if (!is_dir($private.'/pdf') && !mkdir($private.'/pdf',0700)) throw new RuntimeException('No se pudo crear la carpeta de informes.');
            $db=database($private.'/newsletter.sqlite');
            $cfg=require __DIR__.'/config.example.php';
            $cfg['data_dir']=$private;$cfg['admin_user']='admin';$cfg['admin_hash']=password_hash($password,PASSWORD_DEFAULT);
            $cfg['secret']=bin2hex(random_bytes(32));$cfg['smtp_pass']=$smtpPassword;$cfg['sending_enabled']=true;
            $content='<?php return '.var_export($cfg,true).';'.PHP_EOL;
            $temporary=tempnam($private,'config-');
            if ($temporary===false || file_put_contents($temporary,$content)!==strlen($content) || !chmod($temporary,0600) || !rename($temporary,$configPath)) throw new RuntimeException('No se pudo guardar la configuración.');
            $done=true; $_SESSION=[];session_destroy();
        } finally { flock($lock,LOCK_UN);fclose($lock); }
    } catch (Throwable $e) { $error = $e instanceof RuntimeException ? $e->getMessage() : 'No se pudo completar la instalación. Revisá la configuración del alojamiento.'; }
}
?><!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Activar newsletter · Proyección</title><link rel="stylesheet" href="panel.css"></head><body><main class="login card"><img src="../assets/img/navbrand.png" width="210" alt="Proyección Consultores">
<?php if($done): ?><p class="eyebrow">CONFIGURACIÓN GUARDADA</p><h1>Todo listo para tu primera prueba.</h1><p>La conexión con Hostinger fue verificada. Las credenciales y las bajas se guardan fuera de la carpeta pública.</p><p>No se envió ningún correo. Este formulario de instalación ya quedó desactivado.</p><a class="button" href="./">Ingresar al panel →</a><p class="muted">Usuario: admin · Usá la contraseña que acabás de elegir.</p>
<?php else: ?><p class="eyebrow">ACTIVACIÓN PRIVADA · UN SOLO USO</p><h1>Activar el newsletter</h1><p>Elegí la contraseña de acceso al panel y conectá el correo de Proyección.</p><?php if($error): ?><div class="alert error" role="alert"><?= h($error) ?></div><?php endif ?><?php if($missing): ?><div class="alert error">Faltan extensiones PHP: <?= h(implode(', ',$missing)) ?></div><?php else: ?><p class="muted">El alojamiento cumple los requisitos de PHP, Excel y almacenamiento.</p><?php endif ?>
<form method="post"><input type="hidden" name="csrf" value="<?= h($_SESSION['csrf']) ?>"><label>Usuario del panel<input value="admin" readonly autocomplete="username"></label><label>Elegí una contraseña para el panel<input type="password" name="admin_password" required minlength="12" maxlength="72" autocomplete="new-password"></label><label>Repetí la contraseña del panel<input type="password" name="admin_repeat" required minlength="12" maxlength="72" autocomplete="new-password"></label><label>Contraseña actual de hola@proyeccionconsultores.com.ar<input type="password" name="smtp_password" required autocomplete="off"></label><p class="muted">Se guardará de forma privada en tu alojamiento para enviar por SMTP. No se cambia la contraseña de tu correo.</p><button <?= $missing?'disabled':'' ?>>Guardar y activar el panel</button></form><p class="muted">Se verificará la conexión SMTP sin enviar mensajes. Los envíos a contactos requieren una prueba y tu confirmación dentro del panel.</p><?php endif ?></main></body></html>
