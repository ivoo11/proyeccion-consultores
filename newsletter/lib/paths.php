<?php
declare(strict_types=1);
/** Find the stable domain directory even when public_html points at .builds/<release>. */
function hostingerPrivateDirectory(string $source): ?string {
    $directory = $source;
    while ($directory !== dirname($directory)) {
        if (basename($directory) === 'proyeccionconsultores.com.ar' && basename(dirname($directory)) === 'domains') {
            return $directory . '/newsletter-private';
        }
        $directory = dirname($directory);
    }
    return null;
}
function newsletterConfigPath(): string {
    $environment = getenv('NEWSLETTER_CONFIG');
    if ($environment) return $environment;
    $stable = hostingerPrivateDirectory(__DIR__);
    if ($stable && is_file($stable . '/config.php')) return $stable . '/config.php';
    return __DIR__ . '/../config.local.php';
}
