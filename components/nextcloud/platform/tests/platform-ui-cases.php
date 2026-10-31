<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
use OCA\NovaspacePlatform\Service\ConnectionStore as UiStore;
use OCA\NovaspacePlatform\Service\ConnectionPolicy as UiPolicy;
use OCA\NovaspacePlatform\Service\ConnectionFunctions as UiFunctions;
use OCA\NovaspacePlatform\Service\ConnectionLabels as Labels;
function uiIntent(): array {
 $cat=UiFunctions::catalogue();$apps=UiPolicy::defaults()['apps'];$areas=[];
 foreach($cat['areas'] as $a)if($a['extension'])$areas[$a['id']]='off';
 $names=array_column(array_filter($cat['tools'],fn($t)=>!$t['legacy']&&$t['name']!=='update_card'),'name');
 return [$apps,$cat['hash'],$names,$areas];
}
function uiSend($f,$c,$nonce,$revision=1,$params=[]){
 [$apps,$hash,$names,$areas]=uiIntent();
 return webController($f,$params)->saveAccessAsync($c['connectionId'],$revision,$nonce,'1',$apps,$hash,$names,$areas);
}
rt('Async save keeps native authenticated POST and CSRF checks',function($f){
 $m=new ReflectionMethod(OCA\NovaspacePlatform\Controller\ConnectionsController::class,'saveAccessAsync');
 check(array_map(fn($a)=>$a->getName(),$m->getAttributes())===['OCP\\AppFramework\\Http\\Attribute\\NoAdminRequired']);
 $routes=require __DIR__.'/../app/appinfo/routes.php';
 $r=array_values(array_filter($routes['routes'],fn($r)=>$r['name']==='connections#saveAccessAsync'));
 check(count($r)===1&&$r[0]['verb']==='POST');
 check(count(array_filter($routes['ocs'],fn($r)=>$r['name']==='github_bridge#execute'))===1);
});
rt('Async acknowledgement reads exact stored policy and revision without relabelling binding',function($f){
 $c=$f->store->approve('Owner',$f->client,UiStore::id(),'NOVAFORGE Cloud-Konnektor')['connection'];$nonce=UiStore::id();
 $r=uiSend($f,$c,$nonce);check($r->status===200&&$r->data['committed']&&$r->data['revision']===2);
 check($r->data['requestId']===$nonce&&$r->data['nextRequestId']!==$nonce&&$r->data['connectionId']===$c['connectionId']);
 check($r->data['accessPolicy']===$f->store->policy($c['connectionId'])&&!in_array('update_card',$r->data['accessPolicy']['functions']['allowedTools'],true));
 check($f->store->owned('Owner')[0]['label']==='NOVAFORGE Cloud-Konnektor'&&$r->headers['Cache-Control']==='no-store');
});
rt('Unknown commit reply retries the identical request exactly once',function($f){
 $c=$f->store->approve('Owner',$f->client,UiStore::id(),'Name')['connection'];$nonce=UiStore::id();$f->db->lostCommit=true;
 $r=uiSend($f,$c,$nonce);check($r->status===503&&!$r->data['committed']&&!str_contains(json_encode($r->data),'SECRET'));
 $r=uiSend($f,$c,$nonce);check($r->status===200&&$r->data['revision']===2&&count($f->store->history('Owner'))===2);
});
rt('Stale second tab cannot overwrite a saved choice',function($f){
 $c=$f->store->approve('Owner',$f->client,UiStore::id(),'Name')['connection'];uiSend($f,$c,UiStore::id());$before=$f->store->policy($c['connectionId']);
 $r=uiSend($f,$c,UiStore::id());check($r->status===409&&$r->data['outcome']==='conflict'&&$before===$f->store->policy($c['connectionId'])&&count($f->store->history('Owner'))===2);
});
rt('Foreign owner and app password cannot use async owner endpoint',function($f){
 $c=$f->store->approve('Owner',$f->client,UiStore::id(),'Name')['connection'];web($f,'Other');check(uiSend($f,$c,UiStore::id())->status===403);
 cloud($f);check(uiSend($f,$c,UiStore::id())->status===403);check(count($f->store->history('Owner'))===1);
});
rt('Owner override and journal errors return no false save receipt',function($f){
 $c=$f->store->approve('Owner',$f->client,UiStore::id(),'Name')['connection'];check(uiSend($f,$c,UiStore::id(),1,['ownerUid'=>'Other'])->status===503);
 $f->db->failEvent=true;$r=uiSend($f,$c,UiStore::id());check($r->status===503&&!$r->data['committed']&&!str_contains(json_encode($r->data),'SECRET'));
 check($f->store->owned('Owner')[0]['revision']===1&&!isset($f->store->policy($c['connectionId'])['functions']));
});
rt('Brand display preserves personal connection names and canonical tool identities',function($f){
 foreach(['NOVAFORGE Cloud-Konnektor','NovaSpace Connector','NovaSpace KI Connector']as$n)check(Labels::connection($n)==='NovaSpace KI Connector');
 check(Labels::connection('Mein Laptop')==='Mein Laptop');$cat=UiFunctions::catalogue();$before=serialize($cat);$ids=[];
 foreach($cat['areas']as$a)foreach(Labels::rows($cat,$a['id'])as$t){check(!preg_match('/Nextcloud|NovaForge|NovaSpace/iu',$t['displayTitle']));check(!preg_match('/\bkarte(?:n)?\b/u',$t['displayTitle']));$ids[]=$t['name'];}
 $expected=array_column(array_filter($cat['tools'],fn($t)=>!$t['legacy']),'name');sort($ids);sort($expected);check($ids===$expected&&serialize($cat)===$before);
});
rt('Clean labels sort by German title with stable tie order',function($f){
 $cat=['tools'=>[]];foreach(['Zebra','Öffnen','Apfel','Ändern','Datei 10','Datei 2']as$i=>$title)$cat['tools'][]=['name'=>'t'.$i,'title'=>$title,'app'=>'files','area'=>'files','legacy'=>false];
 check(array_column(Labels::rows($cat,'files'),'displayTitle')===['Ändern','Apfel','Datei 2','Datei 10','Öffnen','Zebra']);
});
rt('Rendered UI includes autosave fallback and current product name without changing forms',function($f){
 $f->store->approve('Owner',$f->client,UiStore::id(),'NOVAFORGE Cloud-Konnektor');$_=webController($f)->index()->params+['requesttoken'=>'test'];
 ob_start();include __DIR__.'/../app/templates/connections.php';$h=ob_get_clean();
 foreach(['NovaSpace KI Connector','data-autosave-url=','data-save-status','Ändern','Lesen / Prüfen','<noscript>','Änderungen speichern']as$s)check(str_contains($h,$s));
 if(getenv('NF_UI_RENDER')==='1')echo '\nNS_UI_RENDER:'.base64_encode($h).'\n';
 check(!str_contains($h,'NOVAFORGE Cloud-Konnektor')&&!str_contains($h,'>Änderung<')&&substr_count($h,'data-area-mode')===19);
});
