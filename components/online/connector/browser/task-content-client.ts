// SPDX-License-Identifier: AGPL-3.0-or-later
import { cardMindmapBinding, deckProgressTitle, workflowItems, workflowLists } from '../lib/mindmap-workflow-core';
import { projectDeckChecklist, checklistProgress } from '../lib/mindmap-deck-core';
import { locateNode, parseMindmap, serializeMindmap, type Mindmap } from '../lib/mindmap-core';
import { mapTaskContent, reconcileTaskContent } from '../lib/shared-task-content';
import { currentCardRef, sameCard, type BrowserCard, type CardRef, type Client } from './deck-mindmap-client';

function projection(map:Mindmap,ref:CardRef,card:BrowserCard,path:string,fileId:string,explicit?:{title:string;description:string}) {
  const binding=cardMindmapBinding(card.description??'');
  if(!binding || binding.path!==path || binding.fileId!==fileId || card.id!==ref.cardId || card.stackId!==ref.stackId || card.deletedAt) throw Error('Aufgabenverbindung hat sich geändert.');
  const data=locateNode(map,binding.nodeId).node.data,state=data.nfDeckSync as any;
  if(state?.boardId!==ref.boardId || state.cardId!==ref.cardId || state.checklistId!==binding.checklistId) throw Error('Mindmap bestätigt die Aufgabenverbindung nicht.');
  const shared=reconcileTaskContent(map,binding.nodeId,card.title,card.description??'',explicit);
  const items=workflowItems(shared.description,binding),progress=checklistProgress(items);
  const out=projectDeckChecklist(shared.map,binding.nodeId,{boardId:ref.boardId,cardId:ref.cardId,checklistId:binding.checklistId},items,data.hyperlink as string,!!card.done,workflowLists(shared.description,binding));
  return {map:out.map,content:shared.content,title:deckProgressTitle(shared.content.title,progress.total,progress.completed),description:shared.description};
}
export async function readSharedTask(client:Client,ref:CardRef) {
  ref=await currentCardRef(client,ref);
  const card=await client.card(ref),binding=cardMindmapBinding(card.description??'');
  if(!binding) throw Error('Keine verbundene Aufgabe.');
  const snapshot=await client.map(binding.path);
  const planned=projection(parseMindmap(snapshot.text),ref,card,binding.path,snapshot.fileId);
  return {ref,card,binding,snapshot,content:planned.content};
}
export type SharedTaskSnapshot=Awaited<ReturnType<typeof readSharedTask>>;
export async function editSharedTask(client:Client,expected:SharedTaskSnapshot,input:{title:string;description:string}) {
  const {ref,binding}=expected,current=await client.card(ref),snapshot=await client.map(binding.path);
  if(!sameCard(expected.card,current) || snapshot.etag!==expected.snapshot.etag || snapshot.fileId!==expected.snapshot.fileId || snapshot.text!==expected.snapshot.text) throw Error('Aufgabe wurde inzwischen geändert. Bitte neu öffnen; deine Eingabe bleibt hier stehen.');
  const planned=projection(parseMindmap(snapshot.text),ref,current,binding.path,snapshot.fileId,input);
  if(!sameCard(current,await client.card(ref))) throw Error('Deckkarte wurde inzwischen geändert. Bitte neu öffnen.');
  let saved=false;
  try {
    const card=current.title===planned.title && (current.description??'')===planned.description ? current : await client.saveCard(ref,current,planned.title,planned.description);
    saved=true;
    if(!sameCard(card,await client.card(ref))) throw Error('Deckkarte wurde während des Abgleichs geändert.');
    const text=serializeMindmap(planned.map);
    if(text!==snapshot.text) await client.saveMap(binding.path,snapshot.etag,snapshot.fileId,text);
    return await readSharedTask(client,ref);
  } catch(error) {throw Error(`${saved?'Deck ist gespeichert; Mindmap-Abgleich offen. Bitte neu öffnen und prüfen. ':''}${error instanceof Error?error.message:'Speichern nicht bestätigt.'}`);}
}

/** Sync only task content changed by this user save. All projections validate before any card write. */
export async function syncMindmapTaskEdits(client:Client,path:string,fileId:string,previous:Mindmap,candidate:Mindmap) {
  let map=parseMindmap(serializeMindmap(candidate));
  const changes:{nodeId:string;boardId:number;cardId:number}[]=[];
  const visit=(node:any)=>{
    if(node.data.nfDeckSync) {
      let before;try{before=locateNode(previous,node.data.id).node;}catch{before=undefined;}
      if(before?.data.nfDeckSync && JSON.stringify(mapTaskContent(previous,node.data.id))!==JSON.stringify(mapTaskContent(candidate,node.data.id))) changes.push({nodeId:node.data.id,boardId:node.data.nfDeckSync.boardId,cardId:node.data.nfDeckSync.cardId});
    }
    for(const child of node.children??[])visit(child);
  };visit(candidate.root);
  if(changes.length>20) throw Error('Bitte höchstens 20 verbundene Aufgaben gleichzeitig bearbeiten.');
  const plans=[];
  for(const change of changes) {
    if(!client.locateCard)throw Error('Aktuelle Deckspalte kann nicht geprüft werden.');
    const ref=await client.locateCard(change.boardId,change.cardId),card=await client.card(ref);
    const binding=cardMindmapBinding(card.description??'');
    const state=locateNode(map,change.nodeId).node.data.nfDeckSync as any;
    if(!binding || JSON.stringify(workflowItems(card.description??'',binding))!==JSON.stringify(state.items)) throw Error('Bedingungen wurden in Deck geändert. Bitte Mindmap neu öffnen, bevor du den Aufgabennamen speicherst.');
    const planned=projection(map,ref,card,path,fileId);
    if(cardMindmapBinding(card.description??'')?.nodeId!==change.nodeId)throw Error('Deckkarte verweist auf eine andere Arbeitskapsel.');
    map=planned.map;plans.push({ref,card,planned});
  }
  // Check all source cards again before the first write; native Deck has no atomic card CAS.
  for(const plan of plans)if(!sameCard(plan.card,await client.card(plan.ref)))throw Error('Deckkarte wurde inzwischen geändert. Mindmap noch nicht gespeichert.');
  let written=0;
  try {
    for(const {ref,card,planned} of plans) {
      if(!sameCard(card,await client.card(ref)))throw Error('Deckkarte wurde inzwischen geändert.');
      if(card.title!==planned.title || (card.description??'')!==planned.description) {
        const updated=await client.saveCard(ref,card,planned.title,planned.description);written++;
        if(!sameCard(updated,await client.card(ref)))throw Error('Deckkarte nach Speichern erneut geändert.');
      }
    }
  }catch(error){throw Error(`${written?`${written} Deckkarte(n) gespeichert; Mindmap-Abgleich offen. `:''}${error instanceof Error?error.message:'Abgleich fehlgeschlagen.'}`);}
  return {map,written};
}
