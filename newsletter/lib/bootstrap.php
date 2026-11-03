<?php
declare(strict_types=1);
require_once __DIR__ . '/core.php';
require_once __DIR__ . '/paths.php';
$configPath = newsletterConfigPath();
if (!is_file($configPath)) {
    http_response_code(503);
    exit('Newsletter pendiente de configuración.');
}
if (!is_file(__DIR__ . '/../vendor/autoload.php')) { http_response_code(503); exit('Newsletter pendiente de instalar dependencias.'); }
require_once __DIR__ . '/../vendor/autoload.php';
date_default_timezone_set('America/Argentina/Buenos_Aires');
$cfg = require $configPath;
if (!is_array($cfg) || strlen($cfg['secret'] ?? '') < 32 || !($cfg['admin_hash'] ?? '') || !str_starts_with($cfg['base_url'] ?? '', 'https://')) {
    http_response_code(503); exit('Revisar la configuración privada del newsletter.');
}
$dir = $cfg['data_dir'];
if (!is_dir($dir) && !mkdir($dir, 0700, true)) { throw new RuntimeException('No se pudo crear almacenamiento privado.'); }
$real = realpath($dir);
$root = !empty($_SERVER['DOCUMENT_ROOT']) ? realpath($_SERVER['DOCUMENT_ROOT']) : realpath(__DIR__ . '/../..');
if ($root && ($real === $root || str_starts_with($real . '/', $root . '/'))) {
    throw new RuntimeException('data_dir debe estar fuera de la carpeta pública.');
}
if (!is_dir($dir . '/pdf')) { mkdir($dir . '/pdf', 0700, true); }
$db = database($dir . '/newsletter.sqlite');
if (PHP_SAPI !== 'cli') {
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store');
    header("Content-Security-Policy: default-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'none'");
    if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') {
        http_response_code(400); exit('El panel requiere HTTPS.');
    }
    session_name('proyeccion_newsletter');
    session_start(['cookie_secure' => true, 'cookie_httponly' => true, 'cookie_samesite' => 'Strict', 'use_strict_mode' => true]);
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}
