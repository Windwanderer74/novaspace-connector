// SPDX-License-Identifier: AGPL-3.0-or-later
import {McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {requireScope,scopeMetadata} from './access';
import {readContactOptions,setContactFavorite,readContactPhoto,setContactPhoto,removeContactPhoto} from './contact-comfort';
const path=z.string().min(1).max(4096),etag=z.string().regex(/^"[^"\x00-\x20\x7f]+"$/),version=z.string().regex(/^[a-f0-9]{64}$/);
const ref={addressBookPath:path,contactPath:path},bound={...ref,etag,expectedAccount:z.string().min(1).max(255),expectedUid:z.string().min(1).max(1024)};
const read={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
export const CONTACT_COMFORT_TOOLS=['contacts_read_options','contacts_set_favorite','contacts_read_photo','contacts_set_photo','contacts_remove_photo'] as const;
export function registerContactComfortTools(server:McpServer){
 function add(name:string,title:string,description:string,schema:z.ZodObject<any>,scopes:string[],fn:(a:any)=>Promise<any>,write=false){
  server.registerTool(name,{...scopeMetadata(scopes[0],...scopes.slice(1)),title,description,inputSchema:schema,annotations:{...read,readOnlyHint:!write,idempotentHint:!write}},async(a,c)=>{
   for(const scope of scopes){const denied=requireScope(c,scope);if(denied)return denied;}
   const r=await fn(a),data=r.image?r.metadata:r;return {content:[...(r.image?[r.image]:[]),{type:'text' as const,text:JSON.stringify(data)}],structuredContent:data};
  });
 }
 add(CONTACT_COMFORT_TOOLS[0],'Kontaktoptionen lesen','Liest nativen kontobezogenen Favoriten, UID, ETag und Metadatenversion genau eines Kontakts. Keine Gruppenzuordnung verändern; Version ist keine atomare Metadatenbedingung.',z.object(ref).strict(),['contacts:read'],readContactOptions);
 add(CONTACT_COMFORT_TOOLS[1],'Kontaktfavorit setzen','Setzt ausschließlich die native Favoriteneigenschaft nach frischer Konto-/UID-/ETag-/Metadatenprüfung. Vollständige vCard erhalten und rückprüfen; keine atomare Metadatenbedingung, bei unknown denselben Kontakt lesen.',z.object({...bound,expectedMetadataVersion:version,favorite:z.boolean()}).strict(),['contacts:write','contacts:read'],setContactFavorite,true);
 add(CONTACT_COMFORT_TOOLS[2],'Kontaktbild lesen','Liest ein eingebettetes PNG/JPEG/GIF/WebP bis128KiB als sichtbaren Bildinhalt. Konto/UID/ETag binden. Externe Foto-URLs nicht aufrufen; kein automatisches Nachladen.',z.object(bound).strict(),['contacts:read'],readContactPhoto);
 add(CONTACT_COMFORT_TOOLS[3],'Kontaktbild aus Datei setzen','Bettet ein ausdrücklich gewähltes PNG/JPEG/GIF/WebP bis128KiB in genau eine vCard3/4 ein. Quell-Datei-ID/ETag/Downloadrecht und Kontaktkonto/UID/ETag prüfen. acknowledgeContactReaders bestätigt Lesbarkeit für aktuelle und spätere Kontaktleser. Andere Felder und Originaldatei erhalten; Ergebnis vollständig zurücklesen.',z.object({...bound,sourcePath:path,fileId:z.string().regex(/^[1-9]\d*$/),sourceEtag:etag,acknowledgeContactReaders:z.literal(true)}).strict(),['contacts:write','contacts:read','files:read','files:download'],setContactPhoto,true);
 add(CONTACT_COMFORT_TOOLS[4],'Kontaktbild entfernen','Entfernt ausschließlich das Bild eines ausdrücklich gewählten Kontakts nach Konto-/UID-/ETag-/Rechteprüfung. Andere Felder und ursprüngliche Bilddateien erhalten. Bei unklarem Ergebnis Kontakt lesen, nicht wiederholen.',z.object({...bound,acknowledgeRemove:z.literal(true)}).strict(),['contacts:write','contacts:read'],removeContactPhoto,true);
}
