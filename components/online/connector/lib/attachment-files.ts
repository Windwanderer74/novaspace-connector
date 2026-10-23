// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextcloudIdentity, fileMetadata, filePath, davFetch } from './nextcloud-read';
import { checkedFilePath, checkedEtag } from './files-organize';
export const IMAGE_LIMIT=10*1024*1024;
export async function readVerifiedImage(account:Awaited<ReturnType<typeof nextcloudIdentity>>,path:string,fileId:string,etag:string) {
  checkedFilePath(path);checkedEtag(etag);
  const before=await fileMetadata(account,path);
  if(!before||before.fileId!==fileId||before.etag!==etag||before.type!=='file'||!before.permissions.includes('G')||before.downloadDenied||before.size===null||before.size<1||before.size>IMAGE_LIMIT)throw new Error('Bildquelle, Größe, Version oder Downloadrecht nicht bestätigt.');
  const r=await davFetch(filePath(account.filesHome,path),{method:'GET',headers:{'If-Match':etag,'Accept-Encoding':'identity','Cache-Control':'no-cache'}});
  const contentEtag=r.headers.get('etag');
  if(r.status!==200||!contentEtag||contentEtag!==etag||Number(r.headers.get('content-length'))>IMAGE_LIMIT){await r.body?.cancel();throw new Error('Bedingter Bildabruf nicht bestätigt.');}
  const reader=r.body?.getReader();if(!reader)throw new Error('Leere Bildantwort.');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>IMAGE_LIMIT)throw new Error('Bild größer als10MiB.');chunks.push(x.value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
  const starts=(a:number[])=>a.every((v,i)=>bytes[i]===v),ascii=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));
  const mime=starts([137,80,78,71,13,10,26,10])?'image/png':starts([255,216,255])?'image/jpeg':['GIF87a','GIF89a'].includes(ascii(0,6))?'image/gif':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'?'image/webp':null;
  if(!mime||mime!==before.mimeType||r.headers.get('content-type')?.split(';')[0].trim()!==mime||size!==before.size)throw new Error('Bildinhalt, MIME-Typ oder Größe stimmen nicht überein.');
  const after=await fileMetadata(account,path);
  if(!after||after.fileId!==fileId||after.etag!==etag||after.size!==size||after.mimeType!==mime||after.downloadDenied||!after.permissions.includes('G'))throw new Error('Bild oder Zugriff während Abruf verändert.');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return {bytes,mimeType:mime,size,sha256:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')};
}
