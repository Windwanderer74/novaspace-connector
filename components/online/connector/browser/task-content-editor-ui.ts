// SPDX-License-Identifier: AGPL-3.0-or-later
import { readSharedTask, editSharedTask, type SharedTaskSnapshot } from './task-content-client';
import type { BrowserCard, CardRef, Client } from './deck-mindmap-client';

export function taskContentEditor(doc:Document,client:Client,ref:CardRef,saved:(card:BrowserCard)=>Promise<void>|void) {
  const root=doc.createElement('section');root.className='nf-task-content-editor';root.setAttribute('aria-label','Gemeinsame Aufgabe');
  root.style.cssText='margin:16px 0;padding:16px;border:1px solid #aab8bd;border-radius:8px;background:var(--color-main-background,#fff);color:var(--color-main-text,#17232a);font:14px sans-serif';
  const heading=doc.createElement('h3');heading.textContent='Aufgabe';
  const hint=doc.createElement('p');hint.textContent='Name und Aufgabenbeschreibung gelten in Deck und Mindmap. Mindmap-Notizen bleiben dein eigener Planungsraum.';
  const form=doc.createElement('form');form.style.cssText='display:grid;gap:10px';
  const title=doc.createElement('input');title.maxLength=240;title.required=true;title.disabled=true;
  const description=doc.createElement('textarea');description.rows=5;description.maxLength=16000;description.disabled=true;
  const label=(text:string,field:HTMLElement)=>{const el=doc.createElement('label');el.textContent=text;el.style.cssText='display:grid;gap:4px';field.style.cssText='width:100%;box-sizing:border-box;font:inherit;padding:7px';el.append(field);return el;};
  const submit=doc.createElement('button');submit.type='submit';submit.textContent='Aufgabe speichern';submit.disabled=true;
  const feedback=doc.createElement('p');feedback.setAttribute('role','status');feedback.textContent='Aufgabe wird gelesen …';
  let expected:SharedTaskSnapshot|undefined,busy=false;
  form.append(label('Aufgabenname',title),label('Aufgabenbeschreibung',description),submit,feedback);root.append(heading,hint,form);
  readSharedTask(client,ref).then(value=>{expected=value;title.value=value.content.title;description.value=value.content.description;submit.disabled=false;title.disabled=false;description.disabled=false;feedback.textContent='';}).catch(e=>{feedback.textContent=e.message;feedback.setAttribute('role','alert');});
  form.onsubmit=async event=>{
    event.preventDefault();if(busy || !expected)return;busy=true;submit.disabled=true;title.disabled=true;description.disabled=true;
    try {expected=await editSharedTask(client,expected,{title:title.value,description:description.value});title.value=expected.content.title;description.value=expected.content.description;await saved(expected.card);feedback.textContent='Aufgabe in Deck und Mindmap gespeichert.';}
    catch(e){feedback.textContent=e instanceof Error?e.message:'Speichern nicht bestätigt.';feedback.setAttribute('role','alert');}
    finally{busy=false;submit.disabled=false;title.disabled=false;description.disabled=false;}
  };return root;
}
