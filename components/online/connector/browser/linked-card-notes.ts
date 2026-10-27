// SPDX-License-Identifier: AGPL-3.0-or-later
import { canonicalWorkflowMetadata, outsideMarkers, workflowLists, type CardMindmapBinding } from '../lib/mindmap-workflow-core';
import { canonicalChecklistBoundary } from '../lib/mindmap-deck-core';

/** Read-only view of prose outside our owned sections. Never used as a write payload. */
export function cardPlanningNotes(description:string,binding:CardMindmapBinding) {
  let text=canonicalWorkflowMetadata(description);
  const lists=workflowLists(text,binding) ?? [{id:binding.checklistId,title:'Checkliste'}];
  for(const list of lists)text=canonicalChecklistBoundary(text,list.id);
  const ranges:{start:number;end:number}[]=[];
  for(const prefix of ['<!-- nf-mindmap:','<!-- nf-conditions:'])ranges.push(...outsideMarkers(text,prefix));
  const add=(start:string,end:string,heading:string)=>{
    const begins=outsideMarkers(text,start),ends=outsideMarkers(text,end);
    if(!begins.length && !ends.length)return;
    if(begins.length!==1 || ends.length!==1 || begins[0].raw!==start || ends[0].raw!==end || begins[0].start>=ends[0].start)throw Error('Weitere Kartennotizen konnten nicht eindeutig getrennt werden.');
    let from=begins[0].start;
    const previous=text.slice(0,from),title=`## ${heading}\n\n`;
    if(previous.endsWith(title))from-=title.length;
    ranges.push({start:from,end:ends[0].end});
  };
  for(const list of lists)add(`<!-- nf-checklist:${list.id}:start -->`,`<!-- nf-checklist:${list.id}:end -->`,list.title);
  add('<!-- nf-task-content:start -->','<!-- nf-task-content:end -->','Aufgabenbeschreibung');
  const sorted=ranges.sort((a,b)=>b.start-a.start);
  for(let i=0;i<sorted.length;i++) {
    if(i && sorted[i].end>sorted[i-1].start)throw Error('Kartennotizen besitzen überlappende Projektbereiche.');
    text=text.slice(0,sorted[i].start)+text.slice(sorted[i].end);
  }
  return text.trim();
}

export function protectLinkedDescription(tab:Element) {
  const text=tab.querySelector<HTMLElement>('.description__text'),section=text?.parentElement;
  if(!text || !section || !section.querySelector(':scope > h5'))return;
  section.classList.add('nf-deck-managed-description');
  if(!section.hasAttribute('inert')){section.setAttribute('inert','');section.dataset.nfOwnInert='true';}
}
export function clearLinkedDescription(tab:Element) {
  for(const section of tab.querySelectorAll<HTMLElement>('.nf-deck-managed-description')) {
    section.classList.remove('nf-deck-managed-description');
    if(section.dataset.nfOwnInert==='true'){section.removeAttribute('inert');delete section.dataset.nfOwnInert;}
  }
}
export function planningNotesView(doc:Document,notes:string) {
  const section=doc.createElement('section');section.className='nf-card-planning-notes';section.setAttribute('aria-label','Weitere Kartennotizen');
  const heading=doc.createElement('h3');heading.textContent='Weitere Kartennotizen';
  const content=doc.createElement('div');content.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';content.textContent=notes;
  section.append(heading,content);return section;
}
