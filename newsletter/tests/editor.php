<?php
require __DIR__.'/../lib/core.php';
require __DIR__.'/../lib/editor.php';
$db=database(':memory:');
query($db,'INSERT INTO campaigns(id,subject,body,pdf,created,report,tested) VALUES (?,?,?,?,?,?,1)',['edit','Old','Body','old.pdf',time(),'{}']);
query($db,'INSERT INTO recipients VALUES (?,?,?)',['edit','old@example.invalid','pending']);
suppress($db,'baja@example.invalid');
$c=campaign($db,'edit'); $input=['version'=>draftVersion($c),'subject'=>'New','body'=>'Changed','contacts_mode'=>'text','emails'=>"UNO@example.invalid\nuno@example.invalid\nbaja@example.invalid"];
function check($ok,$label) { if(!$ok) throw new RuntimeException($label); echo "OK: $label\n"; }
saveDraft($db,[],$c,$input,[]);
$new=campaign($db,'edit'); $report=json_decode($new['report'],true);
check($new['tested']===0 && $new['subject']==='New','editing invalidates previous test');
check($report['duplicates']===1 && $report['suppressed']===1,'manual list deduplicates and preserves unsubscribes');
check(query($db,'SELECT state FROM recipients WHERE email=?',['baja@example.invalid'])->fetchColumn()==='suppressed','unsubscribe remains excluded');
try { saveDraft($db,[],$new,$input,[]); throw new LogicException('stale save allowed'); } catch(RuntimeException $e) { check(str_contains($e->getMessage(),'otra pestaña'),'stale editor rejected'); }
$input['version']=draftVersion($new); $input['emails']='bad@@mail';
try { saveDraft($db,[],$new,$input,[]); throw new LogicException('invalid email allowed'); } catch(RuntimeException $e) { check(str_contains($e->getMessage(),'línea 1'),'invalid manual email rejected'); }
check((int)$db->query('SELECT COUNT(*) FROM recipients')->fetchColumn()===2,'invalid changes leave contacts intact');
query($db,"UPDATE campaigns SET state='queued' WHERE id='edit'");
try { saveDraft($db,[],campaign($db,'edit'),$input,[]); throw new LogicException('queued edit allowed'); } catch(RuntimeException $e) { check(str_contains($e->getMessage(),'borradores'),'queued campaign cannot be edited'); }
echo "All editor tests passed. No email sent.\n";

$empty=emptyDraft('new-empty');
saveDraft($db,[],$empty,['version'=>draftVersion($empty),'subject'=>'Solo asunto','body'=>''],[]);
$partial=campaign($db,'new-empty');
check($partial['subject']==='Solo asunto' && $partial['body']==='' && $partial['pdf']==='','new draft saves partial content without files');
check(!draftReady($partial,['data_dir'=>'/tmp/nonexistent-newsletter-test']),'incomplete draft cannot be sent');
saveDraft($db,[],$partial,['version'=>draftVersion($partial),'subject'=>'Solo asunto','body'=>'','contacts_mode'=>'text','emails'=>'uno@example.invalid'],[]);
check((int)query($db,'SELECT COUNT(*) FROM recipients WHERE campaign=?',['new-empty'])->fetchColumn()===1,'contacts can be added before PDF and message');
