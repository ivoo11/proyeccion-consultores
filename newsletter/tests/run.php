<?php
declare(strict_types=1);
require __DIR__.'/../vendor/autoload.php';
require __DIR__.'/../lib/core.php';
require __DIR__.'/../lib/paths.php';
check(hostingerPrivateDirectory('/home/example/domains/proyeccionconsultores.com.ar/.builds/release-123/newsletter/lib') === '/home/example/domains/proyeccionconsultores.com.ar/newsletter-private', 'configuration persists across Hostinger releases');
check(hostingerPrivateDirectory('/home/example/domains/proyeccionconsultores.com.ar/public_html/newsletter/lib') === '/home/example/domains/proyeccionconsultores.com.ar/newsletter-private', 'stable directory for direct public_html deployment');
check(hostingerPrivateDirectory('/tmp/local/newsletter/lib') === null, 'local projects do not infer production paths');
require __DIR__.'/../lib/import.php';
require __DIR__.'/../lib/sending.php';
function check(bool $ok, string $label): void { if (!$ok) throw new RuntimeException('FAIL: '.$label); echo "OK: $label\n"; }
$tmp = sys_get_temp_dir().'/newsletter-test-'.bin2hex(random_bytes(6)); mkdir($tmp,0700);
$cfg=['data_dir'=>$tmp,'secret'=>str_repeat('a',64),'base_url'=>'https://example.org/newsletter','daily_limit'=>100,'batch_size'=>5,'sending_enabled'=>true,'test_email'=>'test@example.org'];
$db=database($tmp.'/test.sqlite');
file_put_contents($tmp.'/contacts.csv',"\xEF\xBB\xBFNombre;Email\nAna; ANA@example.org \nOtra;ana@example.org\nMal;bad@@x\nVacío;\nBaja;baja@example.org\n");
$r=importContacts($tmp.'/contacts.csv','csv');
check($r['emails']===['ana@example.org','baja@example.org'] && $r['duplicates']===1 && count($r['invalid'])===1 && $r['blank']===1,'CSV BOM, delimiter, normalization, invalid and duplicate detection');
$book=new PhpOffice\PhpSpreadsheet\Spreadsheet(); $book->getActiveSheet()->fromArray([['Email'],['Uno@example.org'],['uno@example.org'],['bad']]);
(new PhpOffice\PhpSpreadsheet\Writer\Xlsx($book))->save($tmp.'/contacts.xlsx');
$r=importContacts($tmp.'/contacts.xlsx','xlsx');
check($r['emails']===['uno@example.org'] && $r['duplicates']===1 && count($r['invalid'])===1,'Real XLSX import');
file_put_contents($tmp.'/ambiguous.csv',"Email,Correo\na@example.org,b@example.org\n");
try {importContacts($tmp.'/ambiguous.csv','csv'); check(false,'ambiguous columns rejected');} catch(RuntimeException $e){check(str_contains($e->getMessage(),'varias columnas'),'ambiguous columns rejected');}
function seed(PDO $db,string $id,int $count): array {
 query($db,"INSERT INTO campaigns(id,subject,body,pdf,created,report,state) VALUES (?,? ,?,'report.pdf',?,'{}','queued')",[$id,'Asunto <script>','Hola <img src=x onerror=alert(1)>',time()]);
 for($i=0;$i<$count;$i++) query($db,'INSERT INTO recipients(campaign,email) VALUES (?,?)',[$id,"user$i@example.org"]);
 return campaign($db,$id);
}
$c=seed($db,'a',105); $calls=[];
$fake=function($c,$e,$cfg,$t)use(&$calls){$calls[]=$e;};
suppress($db,'user0@example.org');
check(processQueue($db,$cfg,null,$fake)===5 && !in_array('user0@example.org',$calls),'batch of five excludes persistent unsubscribe');
check(processQueue($db,$cfg,null,$fake)===0,'burst cap shared across invocations');
query($db,'UPDATE attempts SET created=? WHERE created>?',[time()-120,time()-86400]);
query($db,"UPDATE campaigns SET state='draft' WHERE id='a'");
processQueue($db,$cfg,$c,$fake);
query($db,"UPDATE campaigns SET state='queued' WHERE id='a'");
check(remaining($db,$cfg)===94,'test email counts against global quota');
for($i=0;$i<94;$i++) query($db,"INSERT INTO attempts(campaign,email,created,state) VALUES ('x','x@example.org',?,'accepted')",[time()-120]);
check(processQueue($db,$cfg,null,$fake)===0 && remaining($db,$cfg)===0,'hard rolling 24h cap across campaigns and tests');
query($db,'UPDATE attempts SET created=?',[time()-86401]);
check(remaining($db,$cfg)===100,'capacity released after 24h');
$before=count($calls);processQueue($db,$cfg,null,$fake);
check(count(array_unique($calls))===count($calls),'accepted recipients never sent twice');
query($db,'UPDATE attempts SET created=? WHERE created>?',[time()-120,time()-86400]);
try{processQueue($db,$cfg,null,function(){throw new RuntimeException('timeout');});}catch(RuntimeException $e){}
check(campaign($db,'a')['state']==='paused' && (int)$db->query("SELECT COUNT(*) FROM recipients WHERE state='unknown'")->fetchColumn()===1,'ambiguous SMTP failure pauses campaign and quarantines recipient');
query($db,"UPDATE campaigns SET state='queued' WHERE id='a'");
$unknown=$db->query("SELECT email FROM recipients WHERE state='unknown'")->fetchColumn();
query($db,'UPDATE attempts SET created=? WHERE created>?',[time()-120,time()-86400]);processQueue($db,$cfg,null,$fake);
check(!in_array($unknown,$calls),'ambiguous recipient not retried');
query($db,"UPDATE recipients SET state='sending' WHERE campaign='a' AND email='user99@example.org'");
query($db,'UPDATE attempts SET created=? WHERE created>?',[time()-120,time()-86400]);processQueue($db,$cfg,null,$fake);
check(query($db,"SELECT state FROM recipients WHERE email='user99@example.org'")->fetchColumn()==='unknown','interrupted reservation quarantined after restart');
$html=emailHtml($c,$cfg,'a@example.org');
check(!str_contains($html,'<script>') && !str_contains($html,'<img src=x') && str_contains($html,'unsubscribe.php'),'email escapes content and includes unsubscribe');
check(hash_equals(token('a@example.org',$cfg),token('A@example.org',$cfg)) && token('b@example.org',$cfg)!==token('a@example.org',$cfg),'unsubscribe token bound to normalized email');
$db=null;$db=database($tmp.'/test.sqlite');check((bool)query($db,'SELECT 1 FROM suppressions WHERE email=?',['user0@example.org'])->fetchColumn(),'unsubscribe survives database reopen');
$lock=fopen($tmp.'/send.lock','c');flock($lock,LOCK_EX);
try{processQueue($db,$cfg,null,$fake);check(false,'concurrent workers excluded');}catch(RuntimeException $e){check(str_contains($e->getMessage(),'otro envío'),'concurrent workers excluded');}
flock($lock,LOCK_UN);fclose($lock);
$db=null;foreach(glob($tmp.'/*') as $f)unlink($f);rmdir($tmp);
echo "All tests passed. No real email sent.\n";
