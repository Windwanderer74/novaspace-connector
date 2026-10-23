// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDeckRuntimeConfig } from './runtime-config';
import { nextcloudIdentity, readBody, fileMetadata } from './nextcloud-read';
import { checkedFilePath, checkedEtag } from './files-organize';
import { fingerprint } from './tables-read';
type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const version = '0.2.0';
const registerPath = '/ocs/v2.php/apps/novaforge_tables/api/v1/register';
const pilotPath = '/ocs/v2.php/apps/novaforge_tables/api/v1/pilot/tables/6/rows/41';
export const REGISTER_FIELDS = ['documentId','sourceInstance','sourceAccount','sourceFileId','sourcePath','sourceEtag','sha256','role','originDocumentId','aktenzeichen','vorgang','status','openQuestions','sizeBytes','pageCount','receivedAtUtc','verification'] as const;
export function cleanText(v: string) { return new TextEncoder().encode(v).length <= 2048 && !/[\r\n\0]/.test(v); }
async function request(method: 'GET'|'PUT'|'POST', path: string, body?: object): Promise<Obj> {
  if (!path.startsWith(registerPath) && ![pilotPath,pilotPath+'/version'].includes(path)) throw new Error('Ungültiger Schreibbrückenpfad.');
  const runtime = getDeckRuntimeConfig();
  const base = runtime?.baseUrl ?? process.env.NEXTCLOUD_BASE_URL;
  const login = runtime?.login ?? process.env.NEXTCLOUD_LOGIN_NAME;
  const password = runtime?.password ?? process.env.NEXTCLOUD_APP_PASSWORD;
  if (!base || !login || !password) throw new Error('Nextcloud-Zugang fehlt.');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Ungültige Nextcloud-Basisadresse.');
  const basic = btoa(Array.from(new TextEncoder().encode(`${login}:${password}`), b=>String.fromCharCode(b)).join(''));
  const unknown = () => ({account:'ChatGPT',status:'commit_unknown',committed:null,readbackVerified:false,error:'CLIENT_OUTCOME_UNCONFIRMED',note:'Keine automatische Wiederholung. Datensatz mit derselben Kennung gezielt frisch lesen.'});
  try {
    const r = await fetch(`${url.origin}${url.pathname.replace(/\/$/,'')}${path}?format=json`, { method, redirect:'manual', signal:AbortSignal.timeout(35000), headers:{Authorization:`Basic ${basic}`,'OCS-APIRequest':'true',Accept:'application/json','Content-Type':'application/json','Cache-Control':'no-cache'}, ...(body?{body:JSON.stringify(body)}:{}) });
    const envelope: unknown = JSON.parse(await readBody(r, 256*1024));
    if (!object(envelope) || !object(envelope.ocs) || !object(envelope.ocs.meta) || !object(envelope.ocs.data)) throw new Error('Brückenantwort ungültig.');
    const data = envelope.ocs.data;
    if (r.status !== 200 || envelope.ocs.meta.status !== 'ok' || ![100,200].includes(Number(envelope.ocs.meta.statuscode))) {
      if (method!=='GET' && data.committed===null && data.status==='commit_unknown') return unknown();
      if (method!=='GET' && data.committed===false && typeof data.error==='string' && /^(?:VERSION_CONFLICT|DOCUMENT_ID_CONFLICT|DUPLICATE_DOCUMENT_ID|INVALID_[A-Z_]+|IMMUTABLE_SOURCE_FIELD|REGISTER_[A-Z_]+|PILOT_[A-Z_]+|AUTH_REQUIRED|READ_DENIED|UPDATE_DENIED|LOCK_TIMEOUT|JSON_REQUIRED|UNKNOWN_PARAMETER|TABLES_SOURCE_CHANGED|NOT_OWN_REGISTER|ROW_TABLE_MISMATCH|AMBIGUOUS_CELL_STORAGE)$/.test(data.error)) return {status:'rejected',committed:false,readbackVerified:false,error:data.error,httpStatus:r.status};
      throw new Error(`Schreibbrücke: HTTP ${r.status}.`);
    }
    if (data.account!=='ChatGPT' || data.protocol!==1 || data.bridgeVersion!==(path.startsWith(registerPath)?version:'0.1.1') || (path.startsWith(registerPath)?data.registerOnly!==true:data.pilotOnly!==true)) throw new Error('Konto oder Brückenversion nicht bestätigt.');
    return data;
  } catch (e) { if(method!=='GET') return unknown(); throw e; }
}
function checkedRow(data: Obj, tableId?: number, rowId?: number): Obj {
  const row = data.row;
  if (!object(row) || !Number.isSafeInteger(row.id) || Number(row.id)<1 || !Number.isSafeInteger(row.tableId) || Number(row.tableId)<1 || (tableId!==undefined && row.tableId!==tableId) || (rowId!==undefined && row.id!==rowId) || !Array.isArray(row.data) || !hash(data.serverVersion)) throw new Error('Datensatz oder serverVersion nicht bestätigt.');
  const seen = new Set<number>();
  for (const c of row.data) { if(!object(c) || !Number.isSafeInteger(c.columnId) || Number(c.columnId)<1 || seen.has(Number(c.columnId)) || typeof c.value!=='string')throw new Error('Datensatzzellen nicht bestätigt.'); seen.add(Number(c.columnId)); }
  return data;
}
export async function pilotVersion() { await identity(); const d=checkedRow(await request('GET',pilotPath+'/version'),6,41); if(d.tableId!==6 || d.versionKind!=='server-locked-raw-state' || d.writeEnabled!==true)throw new Error('Pilot-Schreibvertrag nicht bestätigt.');return d; }
async function identity() { const account=await nextcloudIdentity();if(account.uid!=='ChatGPT')throw new Error('Schreibbrücke gehört zum Konto ChatGPT.');return account; }
async function verifyWrite(reply: Obj, read: ()=>Promise<Obj>, matches: (d: Obj)=>boolean): Promise<Obj> {
  if(reply.status==='rejected' || reply.committed===null)return reply;
  const accepted = ['committed','no_change','already_present','committed_changed_afterwards','committed_readback_failed'];
  if(!accepted.includes(String(reply.status)) || ![true,false].includes(reply.committed as boolean) || (reply.committed===false && !['no_change','already_present'].includes(String(reply.status))))return {status:'commit_unknown',committed:null,readbackVerified:false,error:'CLIENT_OUTCOME_UNCONFIRMED'};
  try {
    checkedRow(reply);
    const after=await read();
    const exact=hash(reply.serverVersion) && after.serverVersion===reply.serverVersion && await fingerprint(after.row)===await fingerprint(reply.row) && matches(after);
    return {...reply,readbackVerified:exact,clientReadbackVerified:exact,...(exact?{}:{status:reply.committed===true?'committed_changed_afterwards':'readback_unconfirmed',currentRow:after.row,currentServerVersion:after.serverVersion})};
  } catch { return {...reply,readbackVerified:false,clientReadbackVerified:false,status:reply.committed===true?'committed_readback_failed':'readback_unconfirmed'}; }
}
export async function pilotUpdate(expectedVersion: string, value: string) {
  await identity();
  const r=await request('PUT',pilotPath,{expectedVersion,data:[{columnId:26,value}]});
  if(object(r.row) && (r.row.id!==41 || r.row.tableId!==6))return {status:'commit_unknown',committed:null,readbackVerified:false,error:'CLIENT_ROW_IDENTITY_UNCONFIRMED'};
  return verifyWrite(r,pilotVersion,d=>(d.row as {data:{columnId:number;value:string}[]}).data.some(c=>c.columnId===26 && c.value===value));
}
export async function registerStatus() {
  await identity(); const d=await request('GET',registerPath+'/status');
  if(!Number.isSafeInteger(d.tableId) || Number(d.tableId)<1 || !object(d.columns) || d.title!=='NOVAFORGE Dokumentregister / 1' || typeof d.writeEnabled!=='boolean' || typeof d.hostSelftestPassed!=='boolean' || Object.keys(d.columns).sort().join()!==[...REGISTER_FIELDS].sort().join() || new Set(Object.values(d.columns)).size!==REGISTER_FIELDS.length || Object.values(d.columns).some(id=>!Number.isSafeInteger(id)||Number(id)<1))throw new Error('Registerstruktur nicht bestätigt.');
  return d;
}
function checkedRegisterRow(data: Obj, schema: Obj, rowId?: number) {
  checkedRow(data,Number(schema.tableId),rowId);
  if(!object(data.record) || !object(schema.columns) || Object.keys(data.record).sort().join()!==[...REGISTER_FIELDS].sort().join())throw new Error('Benannte Registerfelder nicht bestätigt.');
  const cells=(data.row as Obj).data as {columnId:number;value:string}[];
  for(const key of REGISTER_FIELDS) { const raw=cells.find(c=>c.columnId===(schema.columns as Obj)[key]);if((data.record as Obj)[key] !== (raw?.value ?? null))throw new Error('Registerfelder stimmen nicht mit den tatsächlichen Zellen überein.'); }
  return data;
}
export async function registerRead(rowId: number) { const s=await registerStatus();return checkedRegisterRow(await request('GET',`${registerPath}/rows/${rowId}/version`),s,rowId); }
export async function registerFind(documentId: string) {
  const s=await registerStatus(); const d=await request('GET',`${registerPath}/documents/${encodeURIComponent(documentId)}/version`);
  if(d.tableId!==s.tableId || d.documentId!==documentId || typeof d.found!=='boolean')throw new Error('Dokumentsuche nicht bestätigt.');
  return d.found?checkedRegisterRow(d,s):d;
}
export async function registerCreate(documentId: string, values: Record<string,string>) {
  checkedFilePath(values.sourcePath);checkedEtag(values.sourceEtag);
  const account=await identity();const source=await fileMetadata(account,values.sourcePath);
  if(!source || source.type!=='file' || source.fileId!==values.sourceFileId || source.etag!==values.sourceEtag || !source.permissions.includes('G') || source.downloadDenied || String(source.size)!==values.sizeBytes)throw new Error('Quelldatei, Version, Größe oder Leserecht nicht bestätigt.');
  const s=await registerStatus();if(s.writeEnabled!==true || s.hostSelftestPassed!==true)throw new Error('Registerinstallation und Hostabnahme noch nicht bestätigt.');const r=await request('POST',registerPath+'/records',{documentId,values});
  const out=await verifyWrite(r,async()=>{const d=await registerFind(documentId);if(d.found!==true)throw new Error('Datensatz nicht gefunden.');return d;},d=>{if(!object(d.record)||!object(d.row))return false;return d.row.tableId===s.tableId && Object.entries({...values,documentId}).every(([k,v])=>(d.record as Obj)[k]===v);});
  let sourceVersionStillCurrent:boolean|null=null;
  try { const after=await fileMetadata(account,values.sourcePath);sourceVersionStillCurrent=!!after && after.fileId===values.sourceFileId && after.etag===values.sourceEtag && after.size===source.size && after.permissions.includes('G') && !after.downloadDenied; }catch{}
  return {...out,documentId,sourceVersionStillCurrent,note:'SHA-256 muss zuvor aus den tatsächlich heruntergeladenen Originalbytes berechnet worden sein. Dieser Registeraufruf prüft Quelldatei-Metadaten, berechnet die Prüfsumme nicht selbst. Bei unklarem Commit nur documents_find_record mit derselben Dokumentkennung verwenden.'};
}
export async function registerUpdate(rowId: number, expectedVersion: string, values: Record<string,string>) {
  const s=await registerStatus();if(s.writeEnabled!==true || s.hostSelftestPassed!==true)throw new Error('Registerinstallation und Hostabnahme noch nicht bestätigt.'); const r=await request('PUT',`${registerPath}/rows/${rowId}`,{expectedVersion,values});
  if(object(r.row) && (r.row.id!==rowId || r.row.tableId!==s.tableId))return {status:'commit_unknown',committed:null,readbackVerified:false,error:'CLIENT_ROW_IDENTITY_UNCONFIRMED'};
  return verifyWrite(r,()=>registerRead(rowId),d=>{const row=d.row as Obj;const cells=row.data as {columnId:number;value:string}[];return Object.entries(values).every(([k,v])=>cells.some(c=>c.columnId===(s.columns as Obj)[k]&&c.value===v));});
}
