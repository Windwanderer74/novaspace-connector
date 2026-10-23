// SPDX-License-Identifier: AGPL-3.0-or-later
import { davFetch, davDestination, nextcloudIdentity, fileMetadata, filePath, parseDav, readBody, safeDavPath } from './nextcloud-read';
import { checkedFilePath, checkedEtag } from './files-organize';
import { trashbinCapability } from './nextcloud-talk-read';

type Account = Awaited<ReturnType<typeof nextcloudIdentity>>;
const scalar = (v: any): string => typeof v === 'string' ? v : typeof v?.['#text'] === 'string' ? v['#text'] : '';
const own = (v: any, k: string) => v != null && Object.hasOwn(v, k);
const xmlProps = '<d:resourcetype/><d:getetag/><d:getcontentlength/><oc:fileid/><oc:permissions/><oc:owner-id/><nc:mount-type/><nc:is-mount-root/><nc:trashbin-filename/><nc:trashbin-original-location/><nc:trashbin-deletion-time/>';
const body = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:prop>${xmlProps}</d:prop></d:propfind>`;
const MAX_ROWS = 1000;
function trashHome(a: Account) { return a.filesHome.slice(0, a.filesHome.indexOf('/files/')) + '/trashbin/' + encodeURIComponent(a.uid) + '/'; }
function key(s: string) {
  if (!s || s.length > 1024 || s === '.' || s === '..' || /[\/\\\x00-\x1f\x7f]/.test(s)) throw new Error('Einzelne Papierkorbkennung aus files_trash_list erforderlich.');
  return s;
}
function canonical(href: string, root: string) {
  const base=root.replace(/\/$/,'');
  const p=safeDavPath(href,base);
  if(p!==base&&!p.startsWith(base+'/')) throw new Error('DAV-Verweis außerhalb des gewählten Bereichs.');
  return p.split('/').map(s => encodeURIComponent(decodeURIComponent(s))).join('/').replace(/\/$/,'');
}
async function rows(a: Account, target: string, depth: '0'|'1') {
  const response = await davFetch(target, { method: 'PROPFIND', headers: { Depth: depth, 'Content-Type':'application/xml; charset=utf-8' }, body });
  if (response.status === 404) { await response.body?.cancel(); return null; }
  if (response.status !== 207) { await response.body?.cancel(); throw new Error(`Papierkorb-/Dateimetadaten: HTTP ${response.status}.`); }
  const data = parseDav(await readBody(response, 2 * 1024 * 1024));
  if (data.length > MAX_ROWS + 1) throw new Error('Mehr als1000 Objekte; keine vollständige Vorprüfung möglich. Keine Änderung.');
  return data;
}
async function digest(value: object) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('');
}
async function entry(a: Account, href: string, props: any) {
  const root = trashHome(a) + 'trash/';
  const target = canonical(href, root);
  const rest = target.slice(root.length);
  if (!rest || rest.includes('/')) throw new Error('Papierkorbantwort außerhalb der gewählten obersten Ebene.');
  const trashId = key(decodeURIComponent(rest));
  const filename = scalar(props['trashbin-filename']); key(filename);
  const location = scalar(props['trashbin-original-location']);
  const originalPath = checkedFilePath(location.startsWith('/') ? location : '/' + location);
  if (originalPath.split('/').pop() !== filename) throw new Error('Papierkorbname und Originalpfad stimmen nicht überein.');
  const seconds = scalar(props['trashbin-deletion-time']);
  if (!/^\d+$/.test(seconds) || !Number.isSafeInteger(Number(seconds)) || Number(seconds) <= 0) throw new Error('Papierkorbobjekt ohne gültigen Löschzeitpunkt.');
  const bytes = scalar(props.getcontentlength);
  const data = { trashId, filename, originalPath, deletedAt: Number(seconds),
    type: own(props.resourcetype,'collection') ? 'folder' as const : 'file' as const,
    fileId: /^\d+$/.test(scalar(props.fileid)) ? scalar(props.fileid) : null,
    etag: scalar(props.getetag), size: /^\d+$/.test(bytes) && Number.isSafeInteger(Number(bytes)) ? Number(bytes) : null };
  return { ...data, version: await digest({ account: a.uid, ...data }) };
}
type TrashEntry = Awaited<ReturnType<typeof entry>>;
async function all(a: Account) {
  const root = trashHome(a) + 'trash/';
  const data = await rows(a, root, '1');
  if (!data) throw new Error('Persönlicher Papierkorb nicht erreichbar. Keine Änderung.');
  const seen = new Set<string>();
  const result: TrashEntry[] = [];
  for (const row of data) {
    if (canonical(row.href, root) === root.slice(0,-1)) continue;
    const e = await entry(a, row.href, row.props);
    if (seen.has(e.trashId)) throw new Error('Papierkorbkennung mehrfach geliefert.');
    seen.add(e.trashId); result.push(e);
  }
  return result.sort((a,b) => b.deletedAt-a.deletedAt || a.trashId.localeCompare(b.trashId));
}
async function one(a: Account, trashId: string) {
  const target = trashHome(a) + 'trash/' + encodeURIComponent(key(trashId));
  const data = await rows(a, target, '0');
  if (!data) return null;
  if (data.length !== 1 || canonical(data[0].href, trashHome(a)+'trash/') !== target) throw new Error('Papierkorbobjekt nicht eindeutig zugeordnet.');
  return entry(a,data[0].href,data[0].props);
}
async function account(expected?: string) {
  const a = await nextcloudIdentity();
  if (expected !== undefined && a.uid !== expected) throw new Error('Kontokennung weicht ab. Keine Änderung.');
  return a;
}
export async function listTrash(limit = 30, offset = 0) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > MAX_ROWS) throw new Error('Ungültige Papierkorb-Seitengrenze.');
  const a = await account(), entries = await all(a);
  return { account:a.uid, entries:entries.slice(offset,offset+limit), offset, hasMore:entries.length>offset+limit,
    note:'Oberste Ebene des eigenen Papierkorbs; höchstens1000 Objekte gelesen, maximal100 je Antwort. Keine Inhalte oder fremden Papierkörbe. Vor Wiederherstellung files_trash_read frisch lesen.' };
}
export async function readTrash(trashId: string) {
  key(trashId); const a = await account(), item = await one(a,trashId);
  return { account:a.uid, trashId, exists:item!==null, item };
}
// Only a positively identified owned home-storage object can reach DELETE.
// This deliberately excludes received shares, mount roots and external mounts.
async function homeSnapshot(a: Account, path: string, deep: boolean) {
  const result: object[] = []; let count = 0;
  async function visit(path: string, level: number) {
    if (level > 32 || ++count > 500) throw new Error('Ordner-Vorprüfung zu groß. Keine Löschung.');
    const target = filePath(a.filesHome,path);
    const data = await rows(a,target,deep?'1':'0');
    if (!data?.length) throw new Error('Datei für die Vorprüfung nicht lesbar.');
    let self = false;
    for (const row of data) {
      const href = canonical(row.href,a.filesHome);
      const current = canonical(target,a.filesHome);
      if (href !== current && (!deep || !href.startsWith(current+'/') || href.slice(current.length+1).includes('/'))) throw new Error('Dateibaumantwort außerhalb der gewählten Tiefe.');
      const p=row.props;
      if (scalar(p['owner-id'])!==a.uid || scalar(p['mount-type'])!=='home' || scalar(p['is-mount-root'])!=='false') throw new Error('Nur eigene Objekte im persönlichen Heimspeicher; keine Freigabe-/Mountwurzeln oder externen Speicher löschen.');
      const rowPath='/'+href.slice(a.filesHome.length).split('/').map(decodeURIComponent).join('/');
      if (href===current) self=true;
      if (!scalar(p.permissions).includes('D')) throw new Error('Natives Löschrecht fehlt.');
      result.push({path:rowPath,fileId:scalar(p.fileid),etag:scalar(p.getetag),type:own(p.resourcetype,'collection')?'folder':'file'});
      if (href!==current) {
        if (++count>500) throw new Error('Ordner-Vorprüfung zu groß. Keine Löschung.');
        if (own(p.resourcetype,'collection')) await visit(rowPath,level+1);
      }
    }
    if (!self) throw new Error('Dateibaumantwort ohne ausgewähltes Objekt.');
  }
  await visit(path,0); return result;
}
export {homeSnapshot as inspectOwnedHomeTrash};
async function directoryIds(a: Account, path: string) {
  const target=filePath(a.filesHome,path), base=canonical(target,a.filesHome);
  const data=await rows(a,target,'1');
  if(!data) throw new Error('Originalordner nicht lesbar.');
  const result=new Map<string,string>();
  for(const row of data) {
    const p=canonical(row.href,a.filesHome);
    if(p===base) continue;
    if(!p.startsWith(base+'/')||p.slice(base.length+1).includes('/')) throw new Error('Originalordnerantwort außerhalb der gewählten Tiefe.');
    const child='/'+p.slice(a.filesHome.length).split('/').map(decodeURIComponent).join('/'), id=scalar(row.props.fileid);
    if(result.has(child)||!/^\d+$/.test(id)) throw new Error('Originalordner ohne eindeutige Datei-IDs.');
    result.set(child,id);
  }
  return result;
}
async function mutation(target: string, method: 'DELETE'|'MOVE', headers: Record<string,string>) {
  let status: number|null = null;
  try {
    const r=await davFetch(target,{method,headers},45000); status=r.status; await r.body?.cancel();
    if (status===204 || method==='MOVE'&&status===201) return {writeAccepted:true,writeStatus:status};
    if (status===207 || status>=500) return {writeAccepted:null,writeStatus:status};
    throw new Error(`Dateiänderung abgewiesen: HTTP ${status}. Frisch lesen.`);
  } catch(e) {
    if(status!==null&&status!==207&&status<500) throw e;
    return {writeAccepted:null,writeStatus:status};
  }
}
type DeleteInput = {path:string,fileId:string,etag:string,expectedAccount:string,includeContents?:boolean};
export async function trashFile(input: DeleteInput) {
  checkedFilePath(input.path); checkedEtag(input.etag);
  if (!/^[1-9]\d*$/.test(input.fileId)) throw new Error('Gültige Datei-ID erforderlich.');
  const a=await account(input.expectedAccount), before=await fileMetadata(a,input.path);
  if (!before || before.fileId!==input.fileId || before.etag!==input.etag) throw new Error('Quelldatei oder Version geändert. Keine Löschung.');
  if (!before.permissions.includes('D')) throw new Error('Löschrecht fehlt.');
  if (before.type==='folder' && input.includeContents!==true) throw new Error('Ordner einschließlich Inhalt nur mit ausdrücklichem includeContents=true löschen.');
  if (!(await trashbinCapability())) throw new Error('Native Papierkorbfunktion nicht als aktiv bestätigt. Keine Löschung.');
  const tree=await homeSnapshot(a,input.path,before.type==='folder');
  const old=await all(a), oldIds=new Set(old.map(e=>e.trashId));
  const fresh=await fileMetadata(a,input.path);
  if (!fresh || fresh.fileId!==before.fileId || fresh.etag!==before.etag) throw new Error('Quelle während der Vorprüfung geändert. Keine Löschung.');
  const write=await mutation(filePath(a.filesHome,input.path),'DELETE',{'If-Match':input.etag});
  try {
    const source=await fileMetadata(a,input.path), after=await all(a);
    const candidates=after.filter(e=>!oldIds.has(e.trashId)&&e.originalPath===input.path&&e.type===before.type&&(before.type==='folder'||before.size!==null&&e.size===before.size));
    const trashItem=candidates.length===1?candidates[0]:null;
    const verified=write.writeAccepted===true&&source===null&&trashItem!==null;
    return {...write,account:a.uid,path:input.path,sourceFileId:before.fileId,sourceExists:source!==null,trashItem,verified,
      inspectedTreeEntries:tree.length,atomicTreeSnapshot:false,contentHashVerified:false,recursiveContentVerified:false,
      note:'Normales DAV DELETE mit If-Match; verified verlangt erfolgreiche Antwort, fehlenden Quellpfad und genau einen neuen passenden Papierkorbeintrag. Keine Aufbewahrungsgarantie; native Fristen/Quoten gelten. Keine dauerhafte Papierkorblöschung angeboten.',
      ...(!verified?{warning:'Löschversuch erfolgt; Papierkorbaufnahme nicht eindeutig bestätigt. Quelldatei und Papierkorb lesen, nicht automatisch wiederholen.'}:{})};
  } catch {
    return {...write,account:a.uid,path:input.path,sourceFileId:before.fileId,verified:false,warning:'Löschversuch erfolgt, Rückprüfung fehlgeschlagen. Quelle und Papierkorb lesen; nicht wiederholen.'};
  }
}
type RestoreInput={trashId:string,expectedVersion:string,expectedAccount:string,originalPath:string};
export async function restoreFile(input: RestoreInput) {
  key(input.trashId); checkedFilePath(input.originalPath);
  if (!/^[a-f0-9]{64}$/.test(input.expectedVersion)) throw new Error('Frische Papierkorbversion erforderlich.');
  const a=await account(input.expectedAccount), before=await one(a,input.trashId);
  if (!before || before.version!==input.expectedVersion || before.originalPath!==input.originalPath) throw new Error('Papierkorbobjekt oder Originalpfad geändert. Nicht wiederhergestellt.');
  const parentPath=input.originalPath.slice(0,input.originalPath.lastIndexOf('/'))||'/';
  const parent=await fileMetadata(a,parentPath);
  if (!parent || parent.type!=='folder' || !parent.permissions.includes(before.type==='folder'?'K':'C')) throw new Error('Originalordner fehlt oder ist nicht beschreibbar. Keine Wiederherstellung an Ersatzort.');
  const parentEntries=await directoryIds(a,parentPath);
  if (await fileMetadata(a,input.originalPath)) throw new Error('Originalpfad bereits belegt. Keine Wiederherstellung unter Ersatznamen.');
  const fresh=await one(a,input.trashId);
  if (!fresh || fresh.version!==before.version) throw new Error('Papierkorb während Vorprüfung geändert. Keine Wiederherstellung.');
  // Native restore picks its own target. Overwrite:F cannot atomically reserve
  // the original path; a concurrent conflict may create a native fallback name.
  const headers:Record<string,string>={Destination:davDestination(trashHome(a)+'restore/'+encodeURIComponent(input.trashId)),Overwrite:'F'};
  if (/^"[^"\x00-\x20\x7f]+"$/.test(before.etag)) headers['If-Match']=before.etag;
  const write=await mutation(trashHome(a)+'trash/'+encodeURIComponent(input.trashId),'MOVE',headers);
  try {
    const remaining=await one(a,input.trashId), target=await fileMetadata(a,input.originalPath);
    const parentAfter=await fileMetadata(a,parentPath), entriesAfter=await directoryIds(a,parentPath);
    const newEntries=[...entriesAfter].filter(([p,id])=>!parentEntries.has(p)||parentEntries.get(p)!==id);
    const targetBindingVerified=parentAfter?.fileId===parent.fileId&&newEntries.length===1&&newEntries[0][0]===input.originalPath&&newEntries[0][1]===target?.fileId;
    const verified=targetBindingVerified&&write.writeAccepted===true&&remaining===null&&target!==null&&target.type===before.type&&(before.type==='folder'||before.size!==null&&target.size===before.size);
    return {...write,account:a.uid,trashId:input.trashId,originalPath:input.originalPath,trashExists:remaining!==null,target,verified,
      targetBindingVerified,atomicOriginalPathReservation:false,fileIdPreservationVerified:false,contentHashVerified:false,recursiveContentVerified:false,
      note:'Native Wiederherstellung mit Rückprüfung von Papierkorb, Originalpfad/Typ/Dateigröße und genau einem neu beobachteten Zielobjekt im unveränderten Elternordner. Keine Inhaltsprüfsumme oder Zusage gleicher Datei-ID/Freigaben. Bei gleichzeitigem Zielkonflikt kann die Cloud einen Ersatznamen wählen; dann kein verified-Erfolg und keine automatische Bereinigung.',
      ...(!verified?{warning:'Wiederherstellungsversuch erfolgt; Originalpfad nicht eindeutig bestätigt. Papierkorb und ursprünglichen Elternordner lesen, nicht wiederholen.'}:{})};
  } catch {return {...write,account:a.uid,trashId:input.trashId,originalPath:input.originalPath,verified:false,warning:'Wiederherstellungsversuch erfolgt, Rückprüfung fehlgeschlagen. Papierkorb und Elternordner lesen; nicht wiederholen.'};}
}
