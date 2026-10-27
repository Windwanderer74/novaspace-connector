// SPDX-License-Identifier: AGPL-3.0-or-later
import {McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {requireScope,scopeMetadata} from './access';
import {prepareContactTransfer,transferContact} from './contact-transfer';
const path=z.string().min(1).max(4096),account=z.string().min(1).max(255),version=z.string().regex(/^[a-f0-9]{64}$/),etag=z.string().regex(/^"[^"\x00-\x20\x7f]+"$/);
const ref={addressBookPath:path,contactPath:path,etag,expectedUid:z.string().min(1).max(255),expectedAccount:account,destinationAddressBookPath:path,destinationContactId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/),operation:z.enum(['copy','move'])};
export const CONTACT_TRANSFER_TOOLS=['contacts_prepare_transfer','contacts_transfer'] as const;
export function registerContactTransferTools(server:McpServer){
 const result=(r:object)=>({content:[{type:'text' as const,text:JSON.stringify(r)}],structuredContent:r as Record<string,unknown>});
 server.registerTool(CONTACT_TRANSFER_TOOLS[0],{...scopeMetadata('contacts:read'),title:'Kontaktübertragung vorbereiten',description:'Prüft eine native Kopie/Verschiebung eines bekannten Kontakts zwischen zwei gewählten Adressbüchern. Ziel muss ein eigenes reguläres Adressbuch sein; Verschieben verlangt auch eine eigene Quelle. Gleiche UID erhalten, vorhandene UID/Zielkennung sperren ready. Keine Änderung, Vorschau ist nicht atomar.',inputSchema:z.object(ref).strict(),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async(a,c)=>requireScope(c,'contacts:read')??result(await prepareContactTransfer(a)));
 server.registerTool(CONTACT_TRANSFER_TOOLS[1],{...scopeMetadata('contacts:write','contacts:read'),title:'Gewählten Kontakt kopieren oder verschieben',description:'Führt nach frischer Vorschau genau ein natives COPY/MOVE mit If-Match und Overwrite:F aus. UID/vCard erhalten und beide Seiten rückprüfen. acknowledgeTransfer und acknowledgeDestinationReaders bestätigen Umfang/Lesbarkeit; MOVE entfernt den Quellpfad. Keine automatische Wiederholung oder Bereinigung nach unknown. Favoritenmetadaten im Ziel gesondert prüfen.',inputSchema:z.object({...ref,expectedTransferVersion:version,acknowledgeTransfer:z.literal(true),acknowledgeDestinationReaders:z.literal(true)}).strict(),annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false}},async(a,c)=>requireScope(c,'contacts:write')??requireScope(c,'contacts:read')??result(await transferContact(a)));
}
