<?php
declare(strict_types=1);
use PhpOffice\PhpSpreadsheet\Reader\Xlsx;
function importContacts(string $path, string $extension): array {
    $rows = [];
    if ($extension === 'csv') {
        $f = fopen($path, 'rb');
        $sample = fgets($f) ?: ''; rewind($f);
        $delimiter = ','; $best = 0;
        foreach ([',', ';', "\t"] as $d) { $n = count(str_getcsv($sample, $d, '"', '')); if ($n > $best) { $best = $n; $delimiter = $d; } }
        while (($row = fgetcsv($f, 0, $delimiter, '"', '')) !== false) { $rows[] = $row; if (count($rows) > 20001) { throw new RuntimeException('Máximo 20.000 contactos por archivo.'); } }
        fclose($f);
    } elseif ($extension === 'xlsx') {
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) { throw new RuntimeException('El XLSX no es válido.'); }
        $size = 0;
        if ($zip->numFiles > 2000) { $zip->close(); throw new RuntimeException('El Excel contiene demasiados archivos internos.'); }
        for ($i=0; $i < $zip->numFiles; $i++) { $size += $zip->statIndex($i)['size']; }
        $zip->close();
        if ($size > 40 * 1024 * 1024) { throw new RuntimeException('El Excel descomprimido supera 40 MB. Exportalo a CSV.'); }
        $reader = new Xlsx(); $reader->setReadDataOnly(true);
        $info = $reader->listWorksheetInfo($path);
        if (!$info || $info[0]['totalRows'] > 20001 || $info[0]['totalColumns'] > 100) { throw new RuntimeException('Usá la primera hoja con hasta 20.000 contactos y 100 columnas.'); }
        $reader->setLoadSheetsOnly($info[0]['worksheetName']);
        $book = $reader->load($path);
        $rows = $book->getSheet(0)->toArray(null, false, false, false);
        $book->disconnectWorksheets();
    } else { throw new RuntimeException('Elegí un archivo XLSX o CSV.'); }
    if (!$rows) { throw new RuntimeException('El archivo está vacío.'); }
    $scores = []; $headers = [];
    foreach ($rows[0] as $col => $v) { if (preg_match('/^(e[-_ ]?mail|correo( electr[oó]nico)?|mails?)$/iu', trim((string)$v, "\xEF\xBB\xBF \t\n\r"))) { $headers[] = $col; } }
    foreach ($rows as $row) { foreach ($row as $col => $value) { if (filter_var(trim((string)$value), FILTER_VALIDATE_EMAIL)) { $scores[$col] = ($scores[$col] ?? 0) + 1; } } }
    if (count($headers) > 1) { throw new RuntimeException('Hay varias columnas de correo. Dejá una sola para evitar enviar a contactos equivocados.'); }
    if ($headers) { $col = $headers[0]; array_shift($rows); }
    elseif (count($scores) === 1) { $col = array_key_first($scores); }
    else { throw new RuntimeException('No se puede identificar una única columna de correos. Nombrala Email.'); }
    $seen = []; $invalid = []; $duplicates = 0; $blank = 0;
    foreach ($rows as $i => $row) {
        $email = strtolower(trim((string)($row[$col] ?? ''), "\xEF\xBB\xBF \t\n\r"));
        if ($email === '') { $blank++; continue; }
        if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) { $invalid[] = ['row' => $i + ($headers ? 2 : 1), 'value' => mb_substr($email, 0, 120)]; continue; }
        if (isset($seen[$email])) { $duplicates++; continue; } $seen[$email] = true;
    }
    if (!$seen) { throw new RuntimeException('No se encontraron correos válidos.'); }
    return ['emails' => array_keys($seen), 'invalid' => $invalid, 'duplicates' => $duplicates, 'blank' => $blank];
}
