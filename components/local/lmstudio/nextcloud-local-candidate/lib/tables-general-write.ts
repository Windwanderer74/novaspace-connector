// SPDX-License-Identifier: AGPL-3.0-or-later
import {getDeckRuntimeConfig} from './runtime-config';
import {nextcloudIdentity,readBody} from './nextcloud-read';
import {fingerprint} from './tables-read';
type Obj=Record<string,unknown>;
const object=(x:unknown):x is Obj=>!!x && typeof x==='object' && !Array.isArray(x);
const root='/ocs/v2.php/apps/novaforge_tables/api/v1/general';
const hash=(x:unknown):x is string=>typeof x==='string' && /^[a-f0-9]{64}$/.test(x);
const unknown=(requestId?:string)=>({status:'commit_unknown',committed:null,readbackVerified:false,requestId,note:'Nicht automatisch wiederholen. tables_find_operation mit derselben requestId aufrufen und den aktuellen Datensatz lesen.'});
async function request(method:'GET'|'POST',path:string,body?:Obj):Promise<Obj>{
  if(!/^\/(?:status|tables\/[1-9]\d*\/structure|tables\/[1-9]\d*\/rows\/[1-9]\d*\/version|operations\/[a-f0-9-]{36}|write)$/.test(path))throw new Error('Ungültiger Tabellenbrückenpfad.');
  const account=await nextcloudIdentity();if(account.uid!=='ChatGPT')throw new Error('Tabellenbrücke gehört zum Konto ChatGPT.');
  const config=getDeckRuntimeConfig();const base=config?.baseUrl??process.env.NEXTCLOUD_BASE_URL,login=config?.login??process.env.NEXTCLOUD_LOGIN_NAME,password=config?.password??process.env.NEXTCLOUD_APP_PASSWORD;
  if(!base || !login || !password)throw new Error('Nextcloud-Zugang fehlt.');const url=new URL(base);
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash)throw new Error('Ungültige Nextcloud-Basisadresse.');
  const basic=btoa(Array.from(new TextEncoder().encode(`${login}:${password}`),b=>String.fromCharCode(b)).join(''));
  try{
    const r=await fetch(`${url.origin}${url.pathname.replace(/\/$/,'')}${root}${path}?format=json`,{method,redirect:'manual',signal:AbortSignal.timeout(35000),headers:{Authorization:`Basic ${basic}`,'OCS-APIRequest':'true',Accept:'application/json','Content-Type':'application/json','Cache-Control':'no-cache'},...(body?{body:JSON.stringify(body)}:{})});
    const e:unknown=JSON.parse(await readBody(r,256*1024));if(!object(e)||!object(e.ocs)||!object(e.ocs.meta)||!object(e.ocs.data))throw new Error('Tabellenbrückenantwort ungültig.');const d=e.ocs.data;
    if(r.status!==200 || e.ocs.meta.status!=='ok' || ![100,200].includes(Number(e.ocs.meta.statuscode))){
      if(method==='POST' && d.generalTables===true && d.committed===false && typeof d.error==='string' && /^[A-Z0-9_]{1,80}$/.test(d.error))return {status:'rejected',committed:false,readbackVerified:false,error:d.error,httpStatus:r.status,requestId:body?.requestId};
      throw new Error(`Tabellenbrücke: HTTP ${r.status}.`);
    }
    if(d.account!=='ChatGPT'||d.bridgeVersion!=='0.3.0'||d.protocol!==1||d.generalTables!==true)throw new Error('Konto oder Tabellenbrückenversion nicht bestätigt.');return d;
  }catch(e){if(method==='POST')return unknown(String(body?.requestId??''));throw e;}
}
function checkRead(d:Obj,tableId:number,rowId?:number):Obj{
  if(d.tableId!==tableId || !hash(d.serverVersion) || d.versionKind!=='server-locked-raw-state')throw new Error('Tabellenidentität oder Schreibversion nicht bestätigt.');
  if(rowId!==undefined){if(!object(d.row)||d.row.id!==rowId||d.row.tableId!==tableId||!Array.isArray(d.row.data))throw new Error('Datensatzidentität nicht bestätigt.');const seen=new Set();for(const c of d.row.data){if(!object(c)||!Number.isSafeInteger(c.columnId)||Number(c.columnId)<1||seen.has(c.columnId)||!Object.hasOwn(c,'value'))throw new Error('Datensatzzellen ungültig.');seen.add(c.columnId);}}
  else if(!object(d.table)||Number(d.table.id)!==tableId||!Array.isArray(d.columns))throw new Error('Tabellenstruktur nicht bestätigt.');return d;
}
export async function generalStatus(){const d=await request('GET','/status');if(typeof d.writeEnabled!=='boolean'||typeof d.hostSelftestPassed!=='boolean')throw new Error('Aktivierungsstatus unbestätigt.');return d;}
export async function generalRead(tableId:number,rowId?:number){return checkRead(await request('GET',rowId===undefined?`/tables/${tableId}/structure`:`/tables/${tableId}/rows/${rowId}/version`),tableId,rowId);}
export async function generalOperation(requestId:string){const d=await request('GET',`/operations/${requestId}`);if(d.requestId!==requestId||typeof d.found!=='boolean'||(d.found===true&&(!object(d.result)||d.result.requestId!==requestId||d.result.committed!==true)))throw new Error('Schreibvorgang nicht bestätigt.');return d;}
export async function generalWrite(action:string,requestId:string,payload:Obj){
  const status=await generalStatus();if(!status.writeEnabled || !status.hostSelftestPassed)throw new Error('Allgemeine Tabellenbrücke auf Nextcloud noch nicht installiert und abgenommen.');
  const d=await request('POST','/write',{action,requestId,payload});if(d.status==='rejected'||d.committed===null)return d;
  if(d.requestId!==requestId||d.action!==action||!['committed','committed_changed_afterwards','committed_readback_failed','already_committed'].includes(String(d.status))||![true,false].includes(d.committed as boolean)||(d.committed===false&&d.status!=='already_committed'))return unknown(requestId);
  try{
    const tableId=Number(d.tableId),rowId=object(d.row)?Number(d.row.id):undefined;
    if(!Number.isSafeInteger(tableId)||tableId<1||(action!=='create_table'&&tableId!==payload.tableId)||(action==='update_row'&&rowId!==payload.rowId))return unknown(requestId);
    checkRead(d,tableId,rowId);const after=await generalRead(tableId,rowId);
    const exact=after.serverVersion===d.serverVersion && await fingerprint(rowId===undefined?{table:after.table,columns:after.columns}:after.row)===await fingerprint(rowId===undefined?{table:d.table,columns:d.columns}:d.row);
    return {...d,clientReadbackVerified:exact,readbackVerified:exact,...(exact?{}:{status:'committed_changed_afterwards',current:after})};
  }catch{return {...d,readbackVerified:false,clientReadbackVerified:false,status:'committed_readback_failed'};}
}
