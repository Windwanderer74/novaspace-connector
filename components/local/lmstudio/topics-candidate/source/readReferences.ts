// SPDX-License-Identifier: AGPL-3.0-or-later
import {randomBytes} from 'node:crypto';

type Json=Record<string,any>;
type Role='mindmap'|'source';
type Locator={role:'file';path:string;fileId:string;type:string};
type Snapshot={role:Role;path:string;fileId:string;etag:string;type:string};
type Binding=Locator|Snapshot;
const pairedTools=new Set(['mindmap_add_source_capsule','mindmap_link_file']);
const mapTools=new Set([...pairedTools,'mindmap_update_nodes','mindmap_link_card','mindmap_sync_card','mindmap_create_work_step']);
const pathReaders=new Set(['mindmap_read','files_stat','files_read_text']);
const listingTools=new Set(['files_search','files_list']);
const rawMap=new Set(['path','fileId','etag']);
const rawPair=new Set([...rawMap,'sourcePath','sourceFileId','sourceEtag']);
const strongEtag=/^"[^"\x00-\x20\x7f]+"$/;
const record=(value:unknown):value is Json=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const safePath=(path:unknown):path is string=>typeof path==='string'&&path.startsWith('/')&&!path.includes('//')&&!/[\\\x00-\x1f\x7f]/.test(path)&&!path.split('/').some(part=>part==='.'||part==='..');
const reference=(description:string)=>({type:'string',minLength:1,maxLength:100,description});
const withoutDefault=(value:Json)=>{const {default:_,...rest}=value;return rest;};

export function readReferenceModelSchema(name:string,schema:Json):Json {
  if(pathReaders.has(name))return {...schema,additionalProperties:false,
    properties:{...schema.properties,path:withoutDefault(schema.properties.path),fileRef:reference('Exakt fileRef eines ausgewählten Treffers aus files_search oder files_list in dieser Werkzeug-Sitzung. Statt path verwenden; keine Pfade abschreiben.')},
    required:(schema.required??[]).filter((key:string)=>key!=='path'),
    oneOf:[{required:['path'],not:{required:['fileRef']}},{required:['fileRef'],not:{required:['path']}}]};
  if(!mapTools.has(name))return schema;
  const paired=pairedTools.has(name),removed=paired?rawPair:rawMap;
  return {...schema,additionalProperties:false,
    properties:{...Object.fromEntries(Object.entries(schema.properties??{}).filter(([key])=>!removed.has(key))),
      mindmapRef:reference('Exakt mindmapRef aus frischem mindmap_read in dieser Werkzeug-Sitzung. Die gelesene Map ist das gewählte Ziel; kein Pfad, keine Datei-ID und kein ETag zusätzlich.'),
      ...(paired?{sourceRef:reference('Exakt sourceRef aus frischem files_stat der gewählten Quelle in dieser Werkzeug-Sitzung. Keine Pfad-/ID-/ETag-Felder zusätzlich.')}:{}),
    },required:[...(schema.required??[]).filter((key:string)=>!removed.has(key)),'mindmapRef',...(paired?['sourceRef']:[])]};
}

export function readReferenceDescription(name:string,description:string):string {
  if(listingTools.has(name))return description+' Jeder gültige Treffer erhält fileRef. Den gewünschten Treffer bewusst auswählen und seine Referenz für weitere Leser benutzen; den Originalpfad nicht umschreiben.';
  if(pathReaders.has(name))return description+' Vorhandene Dateien vorzugsweise über fileRef aus files_search/files_list auswählen, statt den Pfad abzuschreiben. Genau fileRef ODER path. Die Datei-ID wird nach dem Lesen gegen den ausgewählten Treffer geprüft. Für Änderungen liefert mindmap_read zusätzlich mindmapRef und files_stat zusätzlich sourceRef; nur in derselben Werkzeug-Sitzung gültig.';
  if(!mapTools.has(name))return description;
  return description+' In der Themenauswahl bestimmt ausschließlich mindmapRef aus frischem mindmap_read die Ziel-Mindmap; keine path/fileId/etag-Felder übergeben.'+
    (pairedTools.has(name)?' Die Quelle ausschließlich durch sourceRef aus frischem files_stat bestimmen; keine sourcePath/sourceFileId/sourceEtag-Felder.':'')+
    ' Originalpfade und Versionswerte stammen unverändert aus den gewählten Lesebelegen. Nach einem Schreibversuch neu lesen; keine Anlage automatisch wiederholen.';
}

export class ReadReferenceError extends Error {}
const issue=(message:string)=>{throw new ReadReferenceError(message);};
const readError=(message:string)=>({isError:true,structuredContent:{code:'file_selection_changed',message},content:[{type:'text',text:JSON.stringify({code:'file_selection_changed',message})}]});

/** Session-local selection and read snapshots, never permission grants. Paths
 * are never case-folded, guessed, refreshed on behalf of a write, or persisted.
 * File locators select identity, not a version; fresh read snapshots bind writes.
 */
export class ReadReferences {
  private readonly bindings=new Map<string,Binding>();
  constructor(private readonly expectedUser:string){}
  clear():void {this.bindings.clear();}
  private forget(role:Binding['role'],path:unknown):void {
    for(const [ref,binding] of this.bindings)if(binding.role===role&&binding.path===path)this.bindings.delete(ref);
  }
  private add(binding:Binding):string {
    const ref=(binding.role==='mindmap'?'map-':binding.role==='file'?'file-':'source-')+randomBytes(16).toString('hex');
    this.bindings.set(ref,binding);
    while(this.bindings.size>512)this.bindings.delete(this.bindings.keys().next().value!);
    return ref;
  }
  private locator(ref:unknown):Locator {
    const binding=typeof ref==='string'?this.bindings.get(ref):undefined;
    if(!binding||binding.role!=='file')return issue('Dateiauswahl nicht bestätigt. files_search oder files_list erneut lesen und fileRef des ausdrücklich gewählten Treffers übernehmen. Kein Pfad geraten und kein Schreibaufruf ausgeführt.');
    return binding;
  }
  observe(name:string,args:Json,result:Json,requested:Json=args):Json {
    const role:Role|null=name==='mindmap_read'?'mindmap':name==='files_stat'?'source':null;
    if(role)this.forget(role,args.path);
    if(result.isError){if(requested.fileRef!==undefined)this.bindings.delete(requested.fileRef);return result;}
    let data=result.structuredContent;
    if(!record(data)){
      try {data=JSON.parse(result.content?.find((c:Json)=>c.type==='text')?.text??'');}catch{data=null;}
    }
    if(!record(data))return requested.fileRef!==undefined?readError('Kein eindeutiger Identitätsnachweis im Leseergebnis. Erneut suchen und Auswahl prüfen.'):result;
    if(pathReaders.has(name)&&requested.fileRef!==undefined){
      let chosen:Locator;
      try {chosen=this.locator(requested.fileRef);}catch{return readError('Dateiauswahl inzwischen nicht mehr gültig. Erneut suchen und bewusst auswählen. Kein Inhalt aus diesem Leseversuch ausgegeben.');}
      if(data.account!==this.expectedUser||data.path!==chosen.path||data.fileId!==chosen.fileId||data.type!==chosen.type){
        this.forget('file',chosen.path);
        return readError('Identität des ausgewählten Treffers stimmt beim Lesen nicht mehr überein. Erneut suchen und Auswahl prüfen. Kein Inhalt aus diesem Leseversuch ausgegeben.');
      }
    }
    if(listingTools.has(name)){
      if(data.account!==this.expectedUser||!Array.isArray(data.entries))return result;
      const entries=data.entries.map((entry:unknown)=>{
        if(!record(entry)||!safePath(entry.path)||typeof entry.fileId!=='string'||!/^\d+$/.test(entry.fileId)||!['file','folder'].includes(entry.type))return entry;
        this.forget('file',entry.path);
        return {...entry,fileRef:this.add({role:'file',path:entry.path,fileId:entry.fileId,type:entry.type})};
      });
      return {...result,structuredContent:{...data,entries},content:[{type:'text',text:JSON.stringify({...data,entries})}]};
    }
    if(!role)return result;
    if(data.account!==this.expectedUser||data.path!==args.path||!safePath(data.path)||
      typeof data.fileId!=='string'||!/^\d+$/.test(data.fileId)||typeof data.etag!=='string'||!strongEtag.test(data.etag)||!['file','folder'].includes(data.type))return result;
    if(role==='mindmap'&&(data.versionVerified!==true||data.format!=='kityminder-json'||data.type!=='file'))return result;
    if(role==='source'&&data.exists!==true)return result;
    const field=role==='mindmap'?'mindmapRef':'sourceRef';
    const extra={[field]:this.add({role,path:data.path,fileId:data.fileId,etag:data.etag,type:data.type}),readReferenceNote:'Pfadgebundener Lesebeleg dieser Werkzeug-Sitzung. Kein Zugriffsrecht. Native Versionsprüfung bleibt erforderlich.'};
    return {...result,structuredContent:{...data,...extra},content:[...(result.content??[]),{type:'text',text:JSON.stringify({path:data.path,...extra})}]};
  }
  nativeArguments(name:string,args:Json):Json {
    if(pathReaders.has(name)&&args.fileRef!==undefined){
      if(args.path!==undefined)return issue('Genau fileRef oder path wählen, nicht beides.');
      const chosen=this.locator(args.fileRef);
      if(name!=='files_stat'&&chosen.type!=='file')return issue('Der ausgewählte Treffer ist keine Datei.');
      if(name==='mindmap_read'&&!/\.km$/i.test(chosen.path))return issue('Der ausgewählte Treffer ist keine .km-Mindmap.');
      const {fileRef,...rest}=args;return {...rest,path:chosen.path};
    }
    if(!mapTools.has(name))return args;
    const paired=pairedTools.has(name),map=this.bindings.get(args.mindmapRef),source=paired?this.bindings.get(args.sourceRef):undefined;
    const removed=paired?rawPair:rawMap;
    if(!map||map.role!=='mindmap'||Object.keys(args).some(key=>removed.has(key))||paired&&(!source||source.role!=='source'))
      return issue('Keine passenden aktuellen Lesereferenzen. Gewählte Mindmap mit mindmap_read und bei Quellenverknüpfungen die Quelle mit files_stat frisch lesen; mindmapRef/sourceRef unverändert übernehmen. Keine zusätzlichen Pfade/IDs/ETags. Kein Schreibaufruf ausgeführt.');
    if(paired&&source?.role==='source'){
      const kind=name==='mindmap_link_file'?'file':args.sourceKind??'file';
      if(source.type!==kind)return issue('Quellenart stimmt nicht mit dem gelesenen Objekt überein. Kein Schreibaufruf ausgeführt.');
      if(map.fileId===source.fileId)return issue('Mindmap und Quelle sind dieselbe Datei. Zwei getrennte Objekte wählen. Kein Schreibaufruf ausgeführt.');
    }
    const {mindmapRef,sourceRef,...native}=args;
    this.forget('mindmap',map.path);
    if(paired&&source?.role==='source'){
      this.forget('source',source.path);
      return {...native,path:map.path,fileId:map.fileId,etag:map.etag,sourcePath:source.path,sourceFileId:source.fileId,sourceEtag:source.etag};
    }
    return {...native,path:map.path,fileId:map.fileId,etag:map.etag};
  }
}
