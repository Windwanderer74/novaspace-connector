// SPDX-License-Identifier: AGPL-3.0-or-later
import {checkedFilePath,checkedEtag} from './files-organize';
import {nextcloudIdentity,fileMetadata,filePath,davFetch} from './nextcloud-read';
export const PDF_CHUNK_BYTES=512*1024;
export async function readPdfOriginalChunk(path:string,fileId:string,etag:string,offset:number){
 checkedFilePath(path);checkedEtag(etag);
 if(!/\.pdf$/i.test(path)||!/^\d+$/.test(fileId)||!Number.isSafeInteger(offset)||offset<0||offset%PDF_CHUNK_BYTES!==0)throw new Error('Ungültige PDF-Abschnittsauswahl.');
 const account=await nextcloudIdentity();
 const before=await fileMetadata(account,path);
 if(!before||before.type!=='file'||before.fileId!==fileId||before.etag!==etag||!before.permissions.includes('G')||before.downloadDenied||!Number.isSafeInteger(before.size)||Number(before.size)<1||Number(before.size)>536870912||offset>=Number(before.size))throw new Error('PDF-Datei, Version, Größe oder Downloadrecht nicht bestätigt.');
 const size=Number(before.size),end=Math.min(size-1,offset+PDF_CHUNK_BYTES-1),length=end-offset+1;
 const r=await davFetch(filePath(account.filesHome,path),{method:'GET',headers:{'If-Match':etag,Range:`bytes=${offset}-${end}`,'Accept-Encoding':'identity','Cache-Control':'no-cache'}},35000);
 const whole=r.status===200&&offset===0&&size<=PDF_CHUNK_BYTES;
 const range=r.status===206&&r.headers.get('content-range')===`bytes ${offset}-${end}/${size}`;
 if((!whole&&!range)||r.headers.get('etag')!==etag||!['identity',''].includes(r.headers.get('content-encoding')??'')||!r.body){await r.body?.cancel();throw new Error('Bedingter Originalabschnitt nicht bestätigt.');}
 const contentLength=r.headers.get('content-length');
 if(contentLength!==null&&(!/^\d+$/.test(contentLength)||Number(contentLength)!==length)){await r.body.cancel();throw new Error('Abschnittslänge nicht bestätigt.');}
 const reader=r.body.getReader(),bytes=new Uint8Array(length);let received=0;
 try{while(true){const part=await reader.read();if(part.done)break;if(received+part.value.length>length)throw new Error('Originalabschnitt überschreitet seine Grenze.');bytes.set(part.value,received);received+=part.value.length;}}
 finally{await reader.cancel();reader.releaseLock();}
 if(received!==length)throw new Error('Originalabschnitt unvollständig.');
 if(offset===0&&String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new Error('Original enthält keine PDF-Kennung.');
 const after=await fileMetadata(account,path);
 if(!after||after.fileId!==fileId||after.etag!==etag||after.size!==size||after.type!=='file'||!after.permissions.includes('G')||after.downloadDenied)throw new Error('PDF-Quelle nach Abruf nicht unverändert bestätigt.');
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {source:{account:account.uid,path,fileId,etag,size},offset,length,chunkSize:PDF_CHUNK_BYTES,nextOffset:end+1<size?end+1:null,sha256,encoding:'base64',bytesBase64:btoa(binary),sourceVersionStillCurrent:true,note:'Geprüfter Originalabschnitt. Vollständige Datei erst nach lückenloser Zusammensetzung aller Abschnitte, Gesamthash und erneutem files_stat bestätigen. Keine OCR oder Dateiänderung.'};
}
