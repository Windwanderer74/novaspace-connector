// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDeckRuntimeConfig } from './runtime-config';
import { nextcloudIdentity, fileMetadata, readBody } from './nextcloud-read';
import { checkedFilePath, checkedEtag } from './files-organize';

type Obj = Record<string, any>;
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown) => typeof v === 'string' && /^[1-9]\d*$/.test(v) ? v : Number.isSafeInteger(v) && Number(v) > 0 ? String(v) : undefined;
function settings() {
  const r = getDeckRuntimeConfig(), base = r?.baseUrl ?? process.env.NEXTCLOUD_BASE_URL;
  const user = r?.login ?? process.env.NEXTCLOUD_LOGIN_NAME, password = r?.password ?? process.env.NEXTCLOUD_APP_PASSWORD;
  if (!base || !user || !password) throw new Error('Dateifreigaben-Zugang fehlt.');
  const u = new URL(base);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error('Ungültiger Freigabehost.');
  return { base: u.origin + u.pathname.replace(/\/$/, ''), origin: u.origin, user, password };
}
class ApiFailure extends Error { constructor(message: string, public definitive = false) { super(message); } }
async function api(method: 'GET' | 'POST' | 'PUT' | 'DELETE', shareId?: string, values: Record<string,string> = {}, missing = false) {
  if (shareId !== undefined && !id(shareId)) throw new Error('Eindeutige Freigabe-ID erforderlich.');
  const s = settings(), query = new URLSearchParams({ format: 'json', ...(method === 'GET' ? values : {}) });
  const url = s.base + '/ocs/v2.php/apps/files_sharing/api/v1/shares' + (shareId ? '/' + shareId : '') + '?' + query;
  const basic = btoa(Array.from(new TextEncoder().encode(s.user + ':' + s.password), b => String.fromCharCode(b)).join(''));
  const response = await fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { Authorization: 'Basic ' + basic, 'OCS-APIRequest': 'true', Accept: 'application/json', ...(method === 'POST' || method === 'PUT' ? {'Content-Type':'application/x-www-form-urlencoded'} : {}) },
    ...(method === 'POST' || method === 'PUT' ? {body:new URLSearchParams(values).toString()} : {}) });
  if (response.status === 404 && missing) { await response.body?.cancel(); return null; }
  if (response.status < 200 || response.status >= 300) { const status = response.status; await response.body?.cancel(); throw new ApiFailure('Dateifreigaben: HTTP ' + status + '.', status >= 400 && status < 500); }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) { await response.body?.cancel(); throw new ApiFailure('Dateifreigabe-Antwort nicht bestätigt.'); }
  let raw: unknown; try { raw = JSON.parse(await readBody(response, 512 * 1024)); } catch { throw new ApiFailure('Dateifreigabe-Antwort ungültig oder zu groß.'); }
  if (!object(raw) || !object(raw.ocs) || !object(raw.ocs.meta) || !('data' in raw.ocs)) throw new ApiFailure('Dateifreigabe-Antwort unvollständig.');
  const code = Number(raw.ocs.meta.statuscode);
  if (code === 404 && missing) return null;
  if (raw.ocs.meta.status !== 'ok' || ![100,200].includes(code)) throw new ApiFailure('Dateifreigabe-API meldet Status ' + code + '.', code >= 400 && code < 500);
  return raw.ocs.data;
}
async function fingerprint(data: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)));
  return Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2,'0')).join('');
}

/** Internal fixed-purpose Deck share. The public tool validates account, file,
 * card, scope ceiling and current audience before this single native POST. */
export async function createDeckFileShare(path: string, cardId: number) {
  checkedFilePath(path);
  if (!Number.isSafeInteger(cardId) || cardId < 1) throw new Error('Ungültige Deck-Karte.');
  return api('POST', undefined, { path, shareType:'12', shareWith:String(cardId), permissions:'1', sendMail:'false', publicUpload:'false' });
}
async function resource(path: string, expectedAccount?: string, fileId?: string, etag?: string) {
  checkedFilePath(path); if (etag !== undefined) checkedEtag(etag);
  const account = await nextcloudIdentity();
  if (expectedAccount !== undefined && account.uid !== expectedAccount) throw new Error('Verbundenes Konto weicht vom bestätigten Konto ab; kein Freigabeversuch.');
  const file = await fileMetadata(account,path);
  if (!file || !file.permissions.includes('G')) throw new Error('Gewählte Datei/Ordner nicht lesbar.');
  if (fileId !== undefined && (file.fileId !== fileId || file.etag !== etag)) throw new Error('Datei-ID oder Version geändert. Frisch lesen; keine Freigabe geändert.');
  return {account,file,path};
}
type Resource = Awaited<ReturnType<typeof resource>>;
function attributes(raw: Obj) {
  if (raw.attributes === null || raw.attributes === undefined || raw.attributes === '') return [];
  let a; try { a = typeof raw.attributes === 'string' ? JSON.parse(raw.attributes) : raw.attributes; } catch { throw new Error('Freigabeattribute ungültig.'); }
  if (!Array.isArray(a) || a.length > 50 || a.some(x=>!object(x))) throw new Error('Freigabeattribute ungültig.');
  return a;
}
async function share(raw: unknown, context: Resource) {
  if (!object(raw) || !id(raw.id) || id(raw.file_source) !== context.file.fileId || raw.path !== context.path
    || typeof raw.uid_owner !== 'string' || !Number.isInteger(raw.share_type) || !Number.isInteger(raw.permissions)
    || raw.permissions < 0 || raw.permissions > 31) throw new Error('Freigabe gehört nicht eindeutig zur gewählten Datei.');
  const attrs = attributes(raw), type = raw.share_type;
  const recipient = [0,1].includes(type) && typeof raw.share_with === 'string' ? raw.share_with : null;
  const expiration = typeof raw.expiration === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.expiration) ? raw.expiration.slice(0,10) : null;
  const downloadAllowed = ![true,1,'1'].includes(raw.hide_download) && !attrs.some(x=>x.scope==='permissions'&&x.key==='download'&&[false,0,'false','0'].includes(x.value??x.enabled));
  let url: string | null = null;
  if (type === 3 && typeof raw.url === 'string') { const u = new URL(raw.url); if (u.origin !== settings().origin || u.username || u.password || u.hash) throw new Error('Freigabelink verweist auf fremdes Ziel.'); url=u.href; }
  const data = { shareId:String(raw.id), fileId:context.file.fileId, path:context.path, owner:raw.uid_owner,
    recipientType:type===0?'user':type===1?'group':type===3?'link':'unsupported', recipientId:recipient,
    permissions:raw.permissions, expireDate:expiration, passwordProtected:type===3 && typeof raw.password==='string' && raw.password.length>0,
    downloadAllowed, label:typeof raw.label==='string'?raw.label:'', url,
    canEdit:raw.uid_owner===context.account.uid&&raw.can_edit===true&&[0,1,3].includes(type),
    canRevoke:raw.uid_owner===context.account.uid&&raw.can_delete===true&&[0,1,3].includes(type) };
  return {...data,version:await fingerprint({...data,attributes:attrs})};
}
async function list(context: Resource) {
  const data = await api('GET',undefined,{path:context.path,reshares:'false',subfiles:'false',shared_with_me:'false'});
  if (!Array.isArray(data) || data.length > 100) throw new Error('Mehr als100 Freigaben oder ungültige Liste; keine unvollständige Übersicht behaupten.');
  const result = []; const seen=new Set<string>();
  for(const raw of data) { const s=await share(raw,context); if(seen.has(s.shareId))throw new Error('Doppelte Freigabe-ID.');seen.add(s.shareId);if(s.owner===context.account.uid)result.push(s); }
  return result;
}
async function read(context:Resource, shareId:string, missing=false) {
  const raw=await api('GET',shareId,{},missing); return raw===null ? null : share(raw,context);
}
export async function listFileShares(path:string) { const c=await resource(path);return{account:c.account.uid,path,fileId:c.file.fileId,etag:c.file.etag,shares:await list(c),note:'Eigene ausgehende Freigaben genau dieses Pfads; keine Benutzer-/Gruppenauflistung. Freigabe-URLs sind Zugangsinformationen. Für Änderungen frisch lesen.'}; }
export async function readFileShare(path:string,shareId:string) { const c=await resource(path);return{account:c.account.uid,share:await read(c,shareId),atomicVersionCheck:false}; }
function permissions(value:number,type:string,fileType:string) {
  const allowed=fileType==='file'?(type==='link'?3:19):(type==='link'?15:31);
  if(!Number.isInteger(value)||value<1||!(value&1)||(value&~allowed)!==0)throw new Error('Rechtemaske passt nicht zu Datei und Freigabetyp. Lesen1, Bearbeiten2, Anlegen4, Löschen8, Weiterteilen16; nur ausdrücklich gewünschte Rechte.');
  return value;
}
function date(value:string) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value||value<=new Date().toISOString().slice(0,10))throw new Error('Ablaufdatum muss ein gültiger zukünftiger Kalendertag sein.');
  return value;
}
function password(value:string) {if(typeof value!=='string'||value.length<10||value.length>128||/[\x00-\x1f\x7f]/.test(value))throw new Error('Für einen Link ein gesondertes Freigabepasswort mit10–128Zeichen wählen; kein Kontopasswort.');return value;}
const unknown = (path:string,shareId?:string) => ({outcome:'unknown',path,...(shareId?{shareId}:{}),writeAccepted:null,verified:false,atomicVersionCheck:false,note:'Ergebnis unklar. Freigaben genau dieses Pfads frisch lesen; keine automatische Wiederholung, neue Freigabe oder Rücknahme.'});
export type CreateShareInput = {path:string;fileId:string;etag:string;expectedAccount:string;recipientType:'user'|'group'|'link';recipientId?:string;permissions:number;password?:string;expireDate?:string};
export async function createFileShare(input:CreateShareInput) {
  const c=await resource(input.path,input.expectedAccount,input.fileId,input.etag);
  if(!c.file.permissions.includes('R')||c.file.downloadDenied)throw new Error('Weiterteilen ist an dieser Quelle nicht freigegeben.');
  const type=input.recipientType, values:Record<string,string>={path:input.path,shareType:String(type==='user'?0:type==='group'?1:3),permissions:String(permissions(input.permissions,type,c.file.type)),sendMail:'false',publicUpload:'false'};
  if(type==='link') {if(input.recipientId!==undefined||input.password===undefined||input.expireDate===undefined)throw new Error('Ein geschützter Link benötigt Passwort und Ablaufdatum, keinen Empfänger.');values.password=password(input.password);values.expireDate=date(input.expireDate);}
  else {if(!input.recipientId||input.recipientId.length>255||/[\\/\x00-\x1f\x7f]/.test(input.recipientId)||input.password!==undefined)throw new Error('Exakte bestätigte Nutzer-/Gruppenkennung erforderlich; kein geratenes Ziel.');values.shareWith=input.recipientId;if(input.expireDate)values.expireDate=date(input.expireDate);}
  const before=await list(c);
  if(before.some(s=>s.recipientType===type&&(type==='link'||s.recipientId===input.recipientId)))throw new Error('Passende Freigabe existiert bereits. Vorhandene Freigabe lesen; nicht doppelt anlegen.');
  let raw;try{raw=await api('POST',undefined,values);}catch(e){if(e instanceof ApiFailure&&e.definitive)throw e;return unknown(input.path);}
  try {
    const created=await share(raw,c); if(before.some(s=>s.shareId===created.shareId))throw new Error('Keine neue Freigabe-ID.');
    const current=await read(c,created.shareId);
    const source=await fileMetadata(c.account,c.path);
    const verified=!!current&&source?.fileId===input.fileId&&source.etag===input.etag&&current.owner===c.account.uid&&current.recipientType===type&&current.recipientId===(type==='link'?null:input.recipientId)&&current.permissions===input.permissions&&(!input.expireDate||current.expireDate===input.expireDate)&&(type!=='link'||current.passwordProtected);
    return{account:c.account.uid,outcome:verified?'created':'unverified',writeAccepted:true,share:current,verified,atomicVersionCheck:false,passwordValueVerified:false,emailRequested:false,note:'Freigabe angelegt und zurückgelesen; keine E-Mail angefordert. Native App-Benachrichtigungen können entstehen. Passwortschutz nur als Einstellung geprüft, kein unabhängiger Passwort-Login. Kein atomarer Schutz gegen parallele Freigabeänderungen.'};
  }catch{return{...unknown(input.path),writeAccepted:true};}
}
export type ChangeShareInput={path:string;fileId:string;etag:string;expectedAccount:string;shareId:string;expectedVersion:string};
async function changeContext(input:ChangeShareInput,revoke=false) {
  if(!/^[a-f0-9]{64}$/.test(input.expectedVersion))throw new Error('Aktuelle Freigabeversion aus files_share_read erforderlich.');
  const c=await resource(input.path,input.expectedAccount,input.fileId,input.etag), s=await read(c,input.shareId);
  if(!s||s.version!==input.expectedVersion)throw new Error('Freigabe inzwischen geändert. Frisch lesen; kein Änderungsversuch.');
  if(!(revoke?s.canRevoke:s.canEdit))throw new Error('Nur eigene, nativ entsprechend berechtigte Nutzer-/Gruppen-/Linkfreigaben verwaltbar.');
  return{c,s};
}
export type UpdateShareInput=ChangeShareInput&{field:'permissions'|'expireDate'|'password'|'downloadAllowed';permissions?:number;expireDate?:string;password?:string;downloadAllowed?:boolean};
export async function updateFileShare(input:UpdateShareInput) {
  const {c,s}=await changeContext(input);
  const fields=['permissions','expireDate','password','downloadAllowed'] as const;
  if(fields.filter(k=>input[k]!==undefined).length!==1||input[input.field]===undefined)throw new Error('Genau einen gewählten Freigabewert ändern.');
  const values:Record<string,string>={};
  if(input.field==='permissions')values.permissions=String(permissions(input.permissions!,s.recipientType,c.file.type));
  if(input.field==='expireDate')values.expireDate=date(input.expireDate!);
  if(input.field==='password'){if(s.recipientType!=='link')throw new Error('Passwortänderung nur für Linkfreigaben.');values.password=password(input.password!);}
  if(input.field==='downloadAllowed') {if(typeof input.downloadAllowed!=='boolean')throw new Error('Downloadauswahl fehlt.');const raw=await api('GET',input.shareId);if((await share(raw,c)).version!==s.version)throw new Error('Freigabe parallel geändert.');const attrs=attributes(raw).filter(x=>!(x.scope==='permissions'&&x.key==='download'));attrs.push({scope:'permissions',key:'download',value:input.downloadAllowed});values.attributes=JSON.stringify(attrs);}
  try{await api('PUT',input.shareId,values);}catch(e){if(e instanceof ApiFailure&&e.definitive)throw e;return unknown(input.path,input.shareId);}
  try{const current=await read(c,input.shareId);const matches=current&&current.owner===s.owner&&current.recipientType===s.recipientType&&current.recipientId===s.recipientId&&(input.field==='password'?current.passwordProtected:current[input.field]===input[input.field]);return{account:c.account.uid,outcome:matches?'updated':'unverified',writeAccepted:true,share:current,verified:!!matches,atomicVersionCheck:false,passwordValueVerified:false,emailRequested:false,note:'Ein gewählter Freigabewert geändert und zurückgelesen. Versionsvergleich ist eine Vorprüfung, keine atomare Sperre; keine E-Mail angefordert. Bei unklarem Ergebnis neu lesen, nicht wiederholen.'};}catch{return{...unknown(input.path,input.shareId),writeAccepted:true};}
}
export async function revokeFileShare(input:ChangeShareInput) {
  const {c,s}=await changeContext(input,true);
  try{await api('DELETE',input.shareId);}catch(e){if(e instanceof ApiFailure&&e.definitive)throw e;return unknown(input.path,input.shareId);}
  try{const current=await read(c,input.shareId,true),remaining=await list(c),source=await fileMetadata(c.account,c.path);const verified=current===null&&!remaining.some(v=>v.shareId===s.shareId)&&source?.fileId===input.fileId;return{account:c.account.uid,outcome:verified?'revoked':'unverified',shareId:s.shareId,writeAccepted:true,verified,sourcePreserved:source?.fileId===input.fileId,atomicVersionCheck:false,note:'Nur diese eigene Freigabe aufgehoben; Datei/Ordner nicht gelöscht. Andere direkte oder geerbte Zugriffswege sind gesondert zu beurteilen.'};}catch{return{...unknown(input.path,input.shareId),writeAccepted:true};}
}
