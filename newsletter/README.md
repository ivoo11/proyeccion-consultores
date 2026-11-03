# Newsletter de Proyección Consultores

Módulo PHP 8.2+ integrado en `/newsletter/`, con SMTP de Hostinger y SQLite fuera de la carpeta pública. No cambia la portada, el formulario de contacto ni el dashboard de Render.

## Instalación en Hostinger

1. Confirmar PHP 8.2+ y extensiones `pdo_sqlite`, `fileinfo`, `mbstring`, `zip`, `xml`, `xmlreader`, `xmlwriter`, `dom`, `simplexml`, `gd`, `iconv`, `openssl`. Composer comprueba las dependencias restantes.
2. Publicar la carpeta `newsletter` desde GitHub. Incluye `vendor/` con las dependencias de producción resueltas en `composer.lock`, para que el despliegue Git de Hostinger no dependa de ejecutar Composer. Para actualizar bibliotecas, ejecutar `composer install --no-dev --prefer-dist --optimize-autoloader` y versionar los cambios en vendor y el lock. La carpeta vendor tiene acceso HTTP bloqueado; PHP puede cargar sus clases normalmente.
3. Crear una carpeta persistente FUERA de `public_html`, por ejemplo `/home/USUARIO/newsletter-private`, permisos 700. No incluirla en Git ni reemplazarla durante despliegues. Contendrá SQLite, PDFs y el bloqueo de envío.
4. En Hostinger se detecta automáticamente `newsletter-private/config.php` dentro de la carpeta del dominio y fuera de `public_html`, incluso cuando cada despliegue cambia el destino del enlace `public_html` a una nueva carpeta `.builds`. Guardar allí la configuración para conservarla entre despliegues. Para otros alojamientos: copiar `config.example.php` a `config.local.php`, completar la ruta privada, contraseña SMTP y hash de la contraseña del administrador. El archivo local está ignorado por Git y bloqueado por `.htaccess`; preferir almacenar la configuración fuera de `public_html` y dejar en el archivo local únicamente `<?php return require '/home/USUARIO/newsletter-private/config.php';`. Alternativamente usar la variable `NEWSLETTER_CONFIG` tanto en PHP web como en cron. Permisos 600; nunca compartir ni versionar contraseñas.
5. Generar el secreto con `php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'`. Para generar el hash sin dejar la contraseña en el historial: `read -s NEWSLETTER_ADMIN_PASSWORD` y luego `printf '%s' "$NEWSLETTER_ADMIN_PASSWORD" | php -r 'echo password_hash(stream_get_contents(STDIN), PASSWORD_DEFAULT), PHP_EOL;'`; finalmente `unset NEWSLETTER_ADMIN_PASSWORD`. Conservar el secreto: cambiarlo invalida los enlaces de baja anteriores.
6. El dominio y remitente ya están definidos: `https://proyeccionconsultores.com.ar/newsletter` y `hola@proyeccionconsultores.com.ar`. SMTP autenticado: `smtp.hostinger.com`, STARTTLS 587 (o TLS 465). La casilla de pruebas inicialmente es la misma del remitente; se puede cambiar en configuración.
7. En hPanel, crear un cron cada 5 minutos (`*/5 * * * *`) con el ejecutable PHP indicado por Hostinger y la ruta real de `newsletter/worker.php`, por ejemplo `/usr/bin/php /home/USUARIO/domains/proyeccionconsultores.com.ar/public_html/newsletter/worker.php`. No copiar rutas ilustrativas sin verificar. El worker solo admite CLI: no se puede disparar por URL. Verificar la ejecución y el indicador en el panel.
8. Verificar HTTPS, SPF/DKIM y la casilla SMTP. Activar `sending_enabled` y enviar una prueba desde un borrador a la casilla configurada. Revisar asunto, logo, enlace PDF, baja y recepción. Confirmar la campaña únicamente después de revisar la prueba. No se envió ningún correo real durante el desarrollo.

Si falta configuración o dependencias, responde 503 sin habilitar el panel. No hay usuario/contraseña por defecto de producción. `sending_enabled` es `false` en el ejemplo.

## Operación

- XLSX: primera hoja, hasta 20.000 contactos y 100 columnas; CSV separado por coma, punto y coma o tabulación, con o sin encabezado. Para detección inequívoca usar una sola columna llamada `Email`. XLSX/CSV hasta 5 MB, PDF hasta 15 MB. Configurar `upload_max_filesize` al menos 15M y `post_max_size` al menos 24M. Recomendada memoria PHP 256M.
- Se normalizan espacios y mayúsculas, validan direcciones y deduplican por campaña. No se guarda el Excel original. Las bajas persistentes se consultan al importar y de nuevo antes de enviar.
- El asunto y mensaje se pueden editar mientras sean borrador. Editar invalida la prueba anterior. El PDF y los destinatarios quedan fijados al crear la campaña; para reemplazarlos, crear otra.
- PDF almacenado en carpeta privada y servido por un enlace público con identificador aleatorio. Cualquiera que reciba el enlace puede abrirlo: no usarlo para informes confidenciales. El PDF no se adjunta al correo.
- Límite duro de 100 **intentos** por ventana móvil de 24 horas, compartido entre todas las campañas y pruebas. Configurable hacia abajo. Lotes de hasta 5, máximo 5 intentos por minuto. Los pendientes continúan con cron cuando se libera cupo; no requiere mantener el panel abierto.
- IMPORTANTE: el contador controla exclusivamente este módulo. El correo habitual de `hola@`, otros sistemas y el formulario existente pueden consumir el mismo cupo de Hostinger. Reducir `daily_limit` para reservar margen, o usar una casilla dedicada si el plan lo permite. No hay API de Hostinger conectada para medir esos otros envíos.
- Cada destinatario recibe un mensaje individual. `accepted` significa aceptado por SMTP, no entregado ni leído. Revisar rebotes y rechazos en el buzón; no hay sincronización automática de rebotes por IMAP/webhook.
- Los errores SMTP pausan la campaña. Una desconexión o caída después de reservar un envío queda `unknown`, sin reintento automático para evitar duplicados. El panel muestra las direcciones dudosas; revisar la casilla/proveedor. Continuar pendientes no reenvía las dudosas. Las campañas con estos casos terminan en revisión.
- La baja requiere confirmación mediante POST; abrir el enlace GET no da de baja (evita escáneres de enlaces). Compatible con POST `List-Unsubscribe=One-Click` y token HMAC. Persiste entre campañas y despliegues. No hay una función que reactive accidentalmente las bajas.
- Acceso por sesión HTTPS, contraseña con hash, limitación de intentos, CSRF, escape de HTML, archivos privados y bloqueo de procesos concurrentes. El bloqueo serializa envíos y bajas; una baja no puede cancelar un mensaje que ya está en trámite SMTP.
- Respaldar la carpeta privada completa (SQLite + PDFs + secreto/configuración), preferentemente con cron detenido. No borrar la base para actualizar el módulo: se perderían bajas, cupos y estado de envíos. Los registros guardan destinatario, campaña, hora y resultado; no registran credenciales ni conversación SMTP.

## Validación local

`composer install --no-interaction` y `php tests/run.php`.

Las pruebas usan SQLite temporal y transporte de correo simulado: importación real XLSX/CSV, deduplicación, columnas ambiguas, bajas, cuota de 24 horas, pruebas incluidas en la cuota, límite de ráfaga, reanudación sin duplicados, fallos ambiguos, recuperación tras interrupción, exclusión concurrente, HTML escapado y tokens de baja. No requieren credenciales ni envían mensajes reales.

También se verificaron por HTTP el inicio de sesión, CSRF, creación mediante subida CSV/PDF, vista previa privada, descarga PDF, rechazo de rutas inválidas, firma de baja inválida y bloqueo de confirmación sin prueba. Se revisó el panel en navegador local. La comprobación SMTP y cron en Hostinger sigue pendiente hasta configurar el servidor.
