// SPDX-License-Identifier: AGPL-3.0-or-later
import { planningJson, planningVersion } from './planning-json';
import { nextcloudIdentity } from './nextcloud-read';
import { getDeckRuntimeConfig } from './runtime-config';
import { readDeckStructure } from './deck-work';
import { readMindmap } from './mindmap';

const api='/index.php/apps/novaspace_capsules/api';
const proof={'X-NovaSpace-Project-Access':'files-read-write-v1'};
export const PROJECT_MATRIX=['Neu','Wartend','In Arbeit','Zu prüfen'] as const;
type Ref={creationId:string;expectedAccount:string};
type ProjectState=Record<string,any>&{state:'not-found'|'partial'|'complete';creationId:string;account:string};
type Input={title:string;description:string;folder:string;folderMode:'auto'|'custom';color:string;stackName:string};
const object=(value:any):Record<string,any>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Projektantwort ist kein eindeutiges Objekt.');return value;};
const id=(value:any)=>{if(!Number.isSafeInteger(value)||value<1)throw Error('Ungültige Projektkennung.');return value as number;};
function attempt(value:string){if(!/^[a-f0-9]{32}$/.test(value))throw Error('Feste Anlagekennung mit32Hexzeichen erforderlich.');return value;}
export function projectFolder(value:string){
 if(new TextEncoder().encode(value).length>2048||!value.startsWith('/')||/[\\\x00-\x1f\x7f]/.test(value)||value.includes('//')||value.split('/').some(part=>part==='.'||part==='..'))throw Error('Ungültiger eigener Projektordner.');
 return value.replace(/\/+$/,'')||'/';
}
function input(value:any):Input{
 const i=object(value);
 for(const name of [i.title,i.stackName])if(typeof name!=='string'||!name.trim()||name!==name.trim()||[...name].length>180||/[\/\\\x00-\x1f\x7f]/.test(name)||['.','..'].includes(name))throw Error('Ungültiger gespeicherter Projektname.');
 if(typeof i.description!=='string'||i.description.includes('\0')||new TextEncoder().encode(i.description).length>16000||!['auto','custom'].includes(i.folderMode)||typeof i.color!=='string'||!/^[A-F0-9]{6}$/.test(i.color)||typeof i.folder!=='string'||projectFolder(i.folder)!==i.folder)throw Error('Gespeicherte Projekteingaben sind nicht eindeutig.');
 return {title:i.title,description:i.description,folder:i.folder,folderMode:i.folderMode,color:i.color,stackName:i.stackName};
}
async function info(expectedAccount:string){
 const identity=await nextcloudIdentity();if(identity.uid!==expectedAccount)throw Error('Tatsächliches Nextcloud-Konto stimmt nicht. Keine Anlage als zugeordneter anderer Nutzer.');
 const {data}=await planningJson(api+'/project-creation','GET',undefined,proof);const d=object(data);
 if(d.projectCreationApiVersion!==1||d.account!==expectedAccount||JSON.stringify(d.matrix)!==JSON.stringify(PROJECT_MATRIX)||JSON.stringify(d.folderModes)!==JSON.stringify(['auto','custom'])||d.readOnly!==true)throw Error('Nativer Projektanlage-Einstieg0.2.12/Konto nicht bestätigt.');
 return identity;
}
function envelope(value:any,account:string){const d=object(value);if(d.projectCreationApiVersion!==1||d.account!==account)throw Error('Projekt-API oder Konto hat gewechselt.');return d;}
async function nativeStatus(a:Ref):Promise<ProjectState>{
 const {data}=await planningJson(api+'/creations/'+attempt(a.creationId),'GET',undefined,proof);const d=envelope(data,a.expectedAccount);
 if(d.creationId!==a.creationId||!['not-found','partial','complete'].includes(d.state))throw Error('Projektstatus gehört nicht eindeutig zum bekannten Versuch.');
 if(d.state==='partial'){
  if(!['board-created','map-creating','map-created'].includes(d.phase))throw Error('Unbekannte Anlagephase.');
  input(d.input);for(const key of ['boardId','fileId'])if(d[key]!==null&&d[key]!==undefined)id(d[key]);
 }
 return d as ProjectState;
}
function targets(d:Record<string,any>){
 const configured=getDeckRuntimeConfig()?.baseUrl??process.env.NEXTCLOUD_BASE_URL;if(!configured)throw Error('Nextcloud-Basis fehlt.');
 const base=new URL(configured),prefix=base.pathname.replace(/\/$/,'');
 const board=new URL(`${prefix}/index.php/apps/deck/#/board/${id(d.boardId)}`,base.origin).href;
 const map=new URL(`${prefix}/index.php/f/${id(d.fileId)}`,base.origin).href;
 if(d.boardUrl!==board||d.mindmapUrl!==map)throw Error('Bestätigte Projektlinks stimmen nicht mit Konto und Kennungen überein.');
 return {boardUrl:board,mindmapUrl:map};
}
const tuple=(d:Record<string,any>)=>[d.creationId,d.boardId,d.stackId,d.fileId,d.rootId,d.mindmapPath,d.framework,d.boardUrl,d.mindmapUrl];
async function completed(a:Ref,d:ProjectState){
 if(d.verified!==true||d.rootId!=='ns_project_'+a.creationId||typeof d.mindmapPath!=='string'||!d.mindmapPath.toLowerCase().endsWith('.km'))throw Error('Vollständiger Projektbeleg fehlt.');
 const path=projectFolder(d.mindmapPath),stackId=id(d.stackId),urls=targets(d);
 const structure=await readDeckStructure(id(d.boardId));
 if(structure.mode!=='board'||!('board'in structure)||!('stacks'in structure))throw Error('Projektboard nicht bestätigt.');
 const board=structure.board as any,owner=typeof board.owner==='string'?board.owner:board.owner?.uid??board.owner?.primaryKey;
 if(board.id!==d.boardId||owner!==a.expectedAccount||board.archived||board.deletedAt||board.permissions?.PERMISSION_READ!==true||board.permissions?.PERMISSION_EDIT!==true)throw Error('Eigentum oder native Projektrechte nicht bestätigt.');
 const framework=d.framework;
 if(framework?.frameworkVersion===1){
  if(!Array.isArray(framework.stacks)||framework.stacks.length!==4)throw Error('Projektmatrix nicht vollständig.');
  const seen=new Set<number>();
  framework.stacks.forEach((s:any,index:number)=>{id(s.id);if(seen.has(s.id)||s.title!==PROJECT_MATRIX[index]||s.order!==index||!structure.stacks.some((v:any)=>v.id===s.id&&v.boardId===d.boardId&&v.title===s.title&&v.order===s.order))throw Error('Projektspalten stimmen nicht mit dem Beleg überein.');seen.add(s.id);});
  if(framework.stacks[0].id!==stackId)throw Error('Anfangsspalte verändert.');
 }else if(!framework||Object.keys(framework).length||!structure.stacks.some((s:any)=>s.id===stackId))throw Error('Historischer Projektaufbau nicht bestätigt.');
 const map=await readMindmap(path),root=map.mindmap.root.data,p=root.nfProjectCapsule as any,t=root.nfDeckTarget as any;
 if(String(map.fileId)!==String(d.fileId)||!map.versionVerified||!map.permissions.includes('W')||root.id!==d.rootId||p?.version!==1||p.creationId!==a.creationId||p.boardId!==d.boardId||t?.version!==1||t.boardId!==d.boardId||t.stackId!==stackId)throw Error('Mindmap und Board sind nicht dieselbe bestätigte Projektpaarung.');
 if(framework?.frameworkVersion===1&&(p.frameworkVersion!==1||JSON.stringify(p.stacks)!==JSON.stringify(framework.stacks)))throw Error('Mindmap bestätigt die Projektmatrix nicht.');
 const again=await nativeStatus(a);if(again.state!=='complete'||JSON.stringify(tuple(again))!==JSON.stringify(tuple(d)))throw Error('Projektidentität während Rücklesung verändert.');
 await info(a.expectedAccount);
 return {...d,...urls,mindmapPath:path,verified:true,mindmapEtag:map.etag,boardVersion:structure.boardVersion,atomicAcrossResources:false};
}
async function status(a:Ref){const d=await nativeStatus(a),result=d.state==='complete'?await completed(a,d):d;return {...result,statusVersion:await planningVersion(d)};}
export async function readProjectStatus(a:Ref){attempt(a.creationId);await info(a.expectedAccount);return status(a);}
export async function listProjectFolders(a:{expectedAccount:string;path?:string}){
 const path=projectFolder(a.path??'/');await info(a.expectedAccount);
 const query=encodeURIComponent(path).replaceAll('.','%2E');
 const {data}=await planningJson(api+'/project-folders?path='+query,'GET',undefined,proof);const d=envelope(data,a.expectedAccount);
 const parent=path==='/'?null:path.slice(0,path.lastIndexOf('/'))||'/';
 if(d.path!==path||d.parent!==parent||typeof d.creatable!=='boolean'||!Array.isArray(d.folders)||d.folders.length>1000)throw Error('Projektordnerauswahl nicht vollständig.');
 const seen=new Set<string>();for(const v of d.folders){if(typeof v.name!=='string'||!v.name||typeof v.path!=='string'||projectFolder(v.path)!==v.path||v.path.slice(v.path.lastIndexOf('/')+1)!==v.name||v.path.slice(0,v.path.lastIndexOf('/'))!==(path==='/'?'':path)||seen.has(v.path))throw Error('Ordner gehört nicht eindeutig zur Auswahl.');seen.add(v.path);}
 await info(a.expectedAccount);return {account:a.expectedAccount,path,creatable:d.creatable,parent:d.parent,folders:d.folders,readOnly:true};
}
async function send(a:Ref,values:Input){
 let accepted:boolean|null=null,code:string|undefined;
 try{
  const response=await planningJson(api+'/projects','POST',{creationId:a.creationId,...values,expectedAccount:a.expectedAccount},proof,false,[409]);
  accepted=response.status===200?true:null;
  if(response.status===409&&typeof response.data?.code==='string'&&/^[A-Z][A-Z0-9_:.-]{0,100}$/.test(response.data.code))code=response.data.code;
 }catch{/* Always inspect exactly the known attempt; never repeat POST. */}
 try{const current=await status(a);return {...current,...(current.state==='not-found'?{state:'unknown',nativeState:'not-found',verified:false}:{}),writeAccepted:accepted,...(code?{nativeCode:code}:{}),note:current.state==='complete'?'Gespeichertes Projekt über dieselben Kennungen unabhängig rückgelesen.':'Anlage nicht vollständig bestätigt. Dieselbe Kennung behalten; nur Status lesen oder ausdrücklich mit frischer statusVersion wiederaufnehmen.'};}
 catch{return {state:'unknown',creationId:a.creationId,account:a.expectedAccount,verified:false,writeAccepted:accepted,note:'Ergebnis nicht bestätigt. Diesen bekannten Versuch nur lesen, keine automatische zweite Anlage oder neue Kennung.'};}
}
export async function createProject(a:Ref&{title:string;description?:string;folder?:string;color?:string}){
 attempt(a.creationId);
 const values=input({title:a.title.trim(),description:a.description??'',folder:a.folder===undefined?'/':projectFolder(a.folder),folderMode:a.folder===undefined?'auto':'custom',color:(a.color??'DDCB55').toUpperCase(),stackName:'Neu'});
 await info(a.expectedAccount);const before=await nativeStatus(a);
 if(before.state!=='not-found')throw Error('Anlagekennung existiert bereits. Bekannten Status lesen und ausdrücklich wiederaufnehmen; keine neue Anlage.');
 return send(a,values);
}
export async function resumeProject(a:Ref&{expectedStatusVersion:string}){
 attempt(a.creationId);await info(a.expectedAccount);const before=await nativeStatus(a);
 if(await planningVersion(before)!==a.expectedStatusVersion)throw Error('Anlagestatus ist veraltet. Neu lesen; kein POST.');
 if(before.state==='complete')return {...await completed(a,before),statusVersion:await planningVersion(before),writeAccepted:false};
 if(before.state!=='partial')throw Error('Kein gespeicherter Anlauf für diese Wiederaufnahme. Keine automatische Neuanlage.');
 return send(a,input(before.input));
}
