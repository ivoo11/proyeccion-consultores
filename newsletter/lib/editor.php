<?php
declare(strict_types=1);
// Caller holds send.lock, shared by draft mutations and the mail worker.
function saveDraft(PDO $db, array $cfg, array $c, array $input, array $files): void {
    if ($c['state'] !== 'draft') throw new RuntimeException('Solo se pueden editar borradores.');
    if (!hash_equals(draftVersion($c), (string)($input['version']??''))) throw new RuntimeException('El borrador cambió en otra pestaña. Recargá la página antes de guardar.');
    $subject=trim((string)($input['subject']??'')); $body=trim((string)($input['body']??''));
    if (mb_strlen($subject)>160 || preg_match('/[\r\n]/',$subject) || mb_strlen($body)>12000) throw new RuntimeException('Revisá el asunto y el mensaje.');
    $result=null; $pdf=null; $filename=$c['pdf'];
    if (($files['contacts']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE) {
        $file=upload('contacts',5*1024*1024);
        $result=importContacts($file['tmp_name'],strtolower(pathinfo($file['name'],PATHINFO_EXTENSION)));
    } elseif (($input['contacts_mode']??'')==='text') {
        $text=(string)($input['emails']??'');
        if(strlen($text)>5200000) throw new RuntimeException('El listado admite hasta 20.000 contactos.');
        $rows=preg_split('/\r\n|\n|\r/',trim($text));
        if(count($rows)>20000) throw new RuntimeException('El listado admite hasta 20.000 contactos.');
        $seen=[]; $result=['emails'=>[], 'invalid'=>[], 'duplicates'=>0, 'blank'=>0];
        foreach($rows as $i=>$row) {
            $email=strtolower(trim($row));
            if($email==='') { $result['blank']++; continue; }
            if(strlen($email)>254 || !filter_var($email,FILTER_VALIDATE_EMAIL)) throw new RuntimeException('Revisá el mail de la línea '.($i+1).': '.$row);
            if(isset($seen[$email])) { $result['duplicates']++; continue; }
            $seen[$email]=true; $result['emails'][]=$email;
        }

    }
    if (($files['pdf']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE) {
        $pdf=upload('pdf',15*1024*1024);
        if(strtolower(pathinfo($pdf['name'],PATHINFO_EXTENSION))!=='pdf' || (new finfo(FILEINFO_MIME_TYPE))->file($pdf['tmp_name'])!=='application/pdf' || file_get_contents($pdf['tmp_name'],false,null,0,5)!=='%PDF-') throw new RuntimeException('El informe debe ser un PDF válido.');
        $filename=$c['id'].'-'.bin2hex(random_bytes(8)).'.pdf';
    }
    $db->beginTransaction();
    try {
        if (!empty($c['_new'])) query($db,'INSERT INTO campaigns(id,subject,body,pdf,created,report) VALUES (?,?,?,?,?,?)',[$c['id'],'','','',time(),'{}']);
        $report=$c['report'];
        if($result!==null) {
            query($db,'DELETE FROM recipients WHERE campaign=?',[$c['id']]);
            $result['suppressed']=0;
            foreach($result['emails'] as $email) {
                $suppressed=(bool)query($db,'SELECT 1 FROM suppressions WHERE email=?',[$email])->fetchColumn();
                if($suppressed) $result['suppressed']++;
                query($db,'INSERT INTO recipients VALUES (?,?,?)',[$c['id'],$email,$suppressed?'suppressed':'pending']);
            }
            $result['valid']=count($result['emails']); unset($result['emails']);
            $report=json_encode($result,JSON_THROW_ON_ERROR);
        }
        if($pdf) {
            if(!move_uploaded_file($pdf['tmp_name'],$cfg['data_dir'].'/pdf/'.$filename)) throw new RuntimeException('No se pudo guardar el PDF.');
            chmod($cfg['data_dir'].'/pdf/'.$filename,0600);
        }
        query($db,'UPDATE campaigns SET subject=?,body=?,pdf=?,report=?,tested=0 WHERE id=?',[$subject,$body,$filename,$report,$c['id']]);
        $db->commit();
    } catch(Throwable $e) {
        $db->rollBack();
        if($filename!==$c['pdf']) @unlink($cfg['data_dir'].'/pdf/'.$filename);
        throw $e;
    }
    if($c['pdf']!=='' && $filename!==$c['pdf']) @unlink($cfg['data_dir'].'/pdf/'.$c['pdf']);
}
