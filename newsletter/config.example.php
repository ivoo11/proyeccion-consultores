<?php
// Copiar fuera de public_html y configurar NEWSLETTER_CONFIG con su ruta,
// o guardar como newsletter/config.local.php (PHP, nunca se versiona).
return [
    'base_url' => 'https://proyeccionconsultores.com.ar/newsletter',
    'data_dir' => '/home/USUARIO/newsletter-private', // FUERA de public_html, persistente
    'admin_user' => 'admin',
    'admin_hash' => '', // password_hash: ver README
    'secret' => '', // 64 caracteres aleatorios; conservar para que las bajas sigan funcionando
    'smtp_host' => 'smtp.hostinger.com',
    'smtp_port' => 587,
    'smtp_user' => 'hola@proyeccionconsultores.com.ar',
    'smtp_pass' => '',
    'from_email' => 'hola@proyeccionconsultores.com.ar',
    'from_name' => 'Proyección Consultores',
    'test_email' => 'hola@proyeccionconsultores.com.ar', // destinatario fijo de las pruebas
    'daily_limit' => 100, // cupo global del módulo en una ventana móvil de 24 h
    'batch_size' => 5,
    'sending_enabled' => false, // activar una vez verificados SMTP, dominio y cron
];
