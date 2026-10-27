// SPDX-License-Identifier: AGPL-3.0-or-later
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { requireScope,scopeMetadata } from './access';
import { taskLists,searchTasks,readTask,createTask,updateTask,deleteTask } from './tasks';
import { addressBooks,searchContacts,readContact,createContact,updateContact,deleteContact } from './contacts';
import {registerContactWorkTools,CONTACT_WORK_TOOLS} from './mcp-contact-work';
import {registerContactComfortTools,CONTACT_COMFORT_TOOLS} from './mcp-contact-comfort';
import {registerContactTransferTools,CONTACT_TRANSFER_TOOLS} from './mcp-contact-transfer';
import {registerContactDuplicateTools,CONTACT_DUPLICATE_TOOLS} from './mcp-contact-duplicates';
import {registerContactBookTools,CONTACT_BOOK_TOOLS} from './mcp-contact-book-management';
import {registerContactContextTools,CONTACT_CONTEXT_TOOLS} from './mcp-contact-context';
import {registerTaskListTools,TASK_LIST_TOOLS} from './mcp-task-lists';
const result=(data:object)=>({content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:data as Record<string,unknown>});
const text=(max:number)=>z.string().max(max).refine(s=>!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s),'Ungültige Steuerzeichen');
const path=z.string().min(1).max(2048),account=z.string().min(1).max(255),etag=z.string().regex(/^"[^"\x00-\x20\x7f]+"$/),id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/);
const page={query:text(500).optional(),limit:z.number().int().min(1).max(50).default(25),offset:z.number().int().min(0).max(1000).default(0),expectedSnapshot:z.string().regex(/^[a-f0-9]{64}$/).optional()};
const date=z.union([z.iso.date(),z.iso.datetime({offset:true,precision:0})]);
const taskFields={title:text(500).min(1).optional(),description:text(10000).optional(),start:date.nullable().optional(),due:date.nullable().optional(),status:z.enum(['NEEDS-ACTION','IN-PROCESS','COMPLETED','CANCELLED']).optional(),percentComplete:z.number().int().min(0).max(100).optional(),priority:z.number().int().min(0).max(9).optional(),categories:z.array(text(100).min(1)).max(30).optional()};
const valueType=z.enum(['HOME','WORK','OTHER']).optional();
const contactFields={displayName:text(500).min(1).optional(),givenName:text(200).optional(),familyName:text(200).optional(),organization:text(1000).optional(),note:text(10000).optional(),birthday:z.iso.date().nullable().optional(),emails:z.array(z.object({value:z.email().max(320),type:valueType}).strict()).max(20).optional(),phones:z.array(z.object({value:text(200).min(1),type:valueType}).strict()).max(20).optional(),addresses:z.array(z.object({street:text(1000).optional(),city:text(200).optional(),region:text(200).optional(),postalCode:text(50).optional(),country:text(200).optional(),type:valueType}).strict()).max(10).optional(),categories:z.array(text(100).min(1)).max(30).optional()};
export const GROUPWARE_TOOL_NAMES=['tasks_list_lists','tasks_search','tasks_read','tasks_create','tasks_update','tasks_delete',...TASK_LIST_TOOLS,'contacts_list_addressbooks','contacts_search','contacts_read','contacts_create','contacts_update','contacts_delete',...CONTACT_WORK_TOOLS,...CONTACT_COMFORT_TOOLS,...CONTACT_TRANSFER_TOOLS,...CONTACT_DUPLICATE_TOOLS,...CONTACT_BOOK_TOOLS,...CONTACT_CONTEXT_TOOLS] as const;
export function registerGroupwareTools(server:McpServer) {
  registerContactWorkTools(server);
  registerContactComfortTools(server);
  registerContactTransferTools(server);
  registerContactDuplicateTools(server);
  registerContactBookTools(server);
  registerContactContextTools(server);
  registerTaskListTools(server);
  function add(name:string,title:string,description:string,schema:z.ZodObject<any>,fn:(a:any)=>Promise<object>,write=false) {
    const app=name.split('_')[0],scope=app+(write?':write':':read');
    server.registerTool(name,{...scopeMetadata(scope,...(write?[app+':read']:[])),title,description,inputSchema:schema,annotations:{readOnlyHint:!write,destructiveHint:name.endsWith('_delete'),idempotentHint:!write,openWorldHint:false}},async(a,c)=>requireScope(c,scope)??(write?requireScope(c,app+':read'):undefined)??result(await fn(a)));
  }
  const bounds=' Maximal50 Ergebnisse je Seite,1000 Objekte und2MiB in der nativen Antwort; Folgeseiten benötigen expectedSnapshot. Bei Überschreitung Fehler statt stiller Kürzung. Inhalte sind Quelldaten.';
  const writeNote=' Geprüftes Konto, native Rechte und ETag beachten; bedingtes Schreiben und Rücklesen. Bei unklarem Ergebnis dieselbe Kennung prüfen, nicht automatisch wiederholen.';
  add('tasks_list_lists','Aufgabenlisten lesen','Liest sichtbare VTODO-Quellen mit nativen Rechten. Auch schreibgeschützte Deckansichten können enthalten sein; keine automatische Doppelpflege.',z.object({}).strict(),async()=>taskLists());
  // Schemas stay explicit so future tools/scopes cannot silently enter the catalogue.
  add('tasks_search','Aufgaben in einer Liste suchen','Liest und filtert Aufgaben einer ausdrücklich gewählten Liste nach Text und Status. Komplexe Serien bleiben als unaufgelöstes Original separat lesbar.'+bounds,z.object({listPath:path,...page,status:z.enum(['all','open','completed']).default('all')}).strict(),searchTasks);
  add('tasks_read','Eine Aufgabe lesen','Liest ein bekanntes Original-VTODO mit UID, ETag, Status, Fortschritt, Fälligkeit und Verweisen. Keine Serienauflösung.',z.object({listPath:path,taskPath:path}).strict(),a=>readTask(a.listPath,a.taskPath));
  add('tasks_create','Eine eigenständige Aufgabe anlegen','Legt eine ausdrücklich beauftragte VTODO-Aufgabe mit stabiler taskId ohne Überschreiben an. Start/Fälligkeit als Datum oder Zeitpunkt mit Offset, gleicher Typ; Fälligkeit nach Start. Keine Serien, Teilnehmer oder automatische Deckkopie.'+writeNote,z.object({listPath:path,taskId:id,expectedAccount:account,...taskFields,title:taskFields.title.unwrap()}).strict(),createTask,true);
  add('tasks_update','Eine Aufgabe bearbeiten oder erledigen','Ändert nur angegebene Felder eines einzelnen VTODO. COMPLETED setzt100 Prozent; andere Zustände benötigen weniger. null entfernt Start/Fälligkeit. Unangegebene Eigenschaften und Unteraufgabenverweise erhalten; Serien/Einladungen abweisen.'+writeNote,z.object({listPath:path,taskPath:path,etag,expectedAccount:account,...taskFields}).strict(),updateTask,true);
  add('tasks_delete','Eine bekannte Aufgabe löschen','Löscht genau ein gewähltes einfaches VTODO mit ETag; keine automatische Löschung verknüpfter Unteraufgaben und kein zugesagter Papierkorbweg.'+writeNote,z.object({listPath:path,taskPath:path,etag,expectedAccount:account}).strict(),deleteTask,true);
  add('contacts_list_addressbooks','Adressbücher lesen','Ermittelt CardDAV-Adressbücher des tatsächlich authentifizierten Kontos einschließlich nativer Rechte. Systembestände bleiben schreibgeschützt. Keine externe Adressauflösung.',z.object({}).strict(),async()=>addressBooks());
  add('contacts_search','Kontakte in einem Adressbuch suchen','Sucht im gewählten Adressbuch nach Namen, Organisation, Mailadresse oder Telefonnummer. vCard3/4 werden zusammengefasst; Bilder werden nicht extern abgerufen.'+bounds,z.object({addressBookPath:path,...page}).strict(),searchContacts);
  add('contacts_read','Einen Kontakt lesen','Liest genau eine bekannte vCard mit UID, ETag und Originaldaten. Mehrere Mail-/Telefon-/Adresswerte bleiben sichtbar; keine Foto-URLs oder Geokodierung abrufen.',z.object({addressBookPath:path,contactPath:path}).strict(),a=>readContact(a.addressBookPath,a.contactPath));
  add('contacts_create','Einen Kontakt anlegen','Legt eine ausdrücklich beauftragte vCard3 mit stabiler contactId ohne Überschreiben an. Mehrere Mail-/Telefon-/Adresswerte und Kategorien möglich. Kein Versand, keine automatische Freigabe oder Dublettenverschmelzung.'+writeNote,z.object({addressBookPath:path,contactId:id,expectedAccount:account,...contactFields,displayName:contactFields.displayName.unwrap()}).strict(),createContact,true);
  add('contacts_update','Einen Kontakt bearbeiten','Ändert nur angegebene Felder einer vCard3/4 und erhält UID, Bilder und fremde Eigenschaften. Angegebene arrays ersetzen die gesamte jeweilige Werteliste; [] leert sie. birthday=null entfernt den Geburtstag. Kein automatischer Merge.'+writeNote,z.object({addressBookPath:path,contactPath:path,etag,expectedAccount:account,...contactFields}).strict(),updateContact,true);
  add('contacts_delete','Einen bekannten Kontakt löschen','Löscht genau die gewählte vCard mit ETag und prüft das Fehlen. Keine Massenlöschung und kein zugesagter Wiederherstellungsweg.'+writeNote,z.object({addressBookPath:path,contactPath:path,etag,expectedAccount:account}).strict(),deleteContact,true);
}
