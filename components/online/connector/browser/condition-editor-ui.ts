// SPDX-License-Identifier: AGPL-3.0-or-later
import { cardMindmapBinding, workflowLists, addConditionList, replaceConditionList } from '../lib/mindmap-workflow-core';
import { editDeckConditions, type BrowserCard, type CardRef, type Client } from './deck-mindmap-client';
import type { ChecklistItem } from '../lib/mindmap-deck-core';

export function conditionEditor(doc: Document, client: Client, ref: CardRef, initial: BrowserCard, saved: (card:BrowserCard)=>Promise<void>|void) {
  const root=doc.createElement('section');root.className='nf-condition-editor';root.setAttribute('aria-label','Bedingungslisten');
  root.style.cssText='margin:16px 0;padding:16px;border:1px solid #aab8bd;border-radius:8px;background:var(--color-main-background,#fff);color:var(--color-main-text,#17232a);font:14px sans-serif';
  let card=initial,busy=false;
  const feedback=doc.createElement('p');feedback.setAttribute('role','status');
  const button=(text:string, action:()=>void)=>{const b=doc.createElement('button');b.type='button';b.textContent=text;b.onclick=action;return b;};
  const input=(label:string,value='')=>{const l=doc.createElement('label'),i=doc.createElement('input');i.value=value;i.setAttribute('aria-label',label);l.textContent=label;l.style.cssText='display:grid;gap:4px;margin:8px 0';i.style.cssText='width:100%;box-sizing:border-box';l.append(i);return {l,i};};
  const commit=async (transform:(description:string)=>string,focus?:string)=>{
    if(busy)return;busy=true;root.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button').forEach(e=>e.disabled=true);
    try{const result=await editDeckConditions(client,ref,card.description??'',transform);if(!result.linked)throw Error('Verbindung fehlt.');card=result.card;await saved(card);render();feedback.textContent='Deck und Mindmap sind gespeichert.';if(focus)root.querySelector<HTMLInputElement>(`[data-next="${focus}"]`)?.focus();}
    catch(e){feedback.textContent=e instanceof Error?e.message:'Speichern fehlgeschlagen.';feedback.setAttribute('role','alert');}
    finally{busy=false;root.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button').forEach(e=>e.disabled=false);}
  };
  const render=()=>{
    root.replaceChildren();const h=doc.createElement('h3');h.textContent='Bedingungslisten';root.append(h);
    const binding=cardMindmapBinding(card.description??'');if(!binding)return;
    const lists=workflowLists(card.description??'',binding);
    if(!lists){const p=doc.createElement('p');p.textContent='Diese Karte verwendet bisher eine Arbeitscheckliste. Eine zusätzliche Bedingungsliste übernimmt die vorhandenen Punkte unverändert.';root.append(p);}
    for(const list of lists??[]){
      const group=doc.createElement('fieldset');group.style.cssText='padding:10px;margin:12px 0;border:1px solid #c3ccd0';
      const legend=doc.createElement('legend');legend.textContent=`${list.title} · ${list.items.filter(i=>i.done).length}/${list.items.length}`;group.append(legend);
      const name=input('Listenname',list.title);name.i.maxLength=120;name.i.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(name.i.value.trim())void commit(d=>replaceConditionList(d,binding,{...list,title:name.i.value.trim()},list.items));}};group.append(name.l);
      group.append(button('Listenname speichern',()=>{if(name.i.value.trim())void commit(d=>replaceConditionList(d,binding,{...list,title:name.i.value.trim()},list.items));}));
      list.items.forEach((item,index)=>{
        const row=doc.createElement('div');row.style.cssText='display:flex;gap:6px;align-items:center;margin:10px 0';
        const check=doc.createElement('input');check.type='checkbox';check.checked=item.done;check.setAttribute('aria-label',`Erfüllt: ${item.text}`);
        check.onchange=()=>void commit(d=>replaceConditionList(d,binding,list,list.items.map(i=>i.id===item.id?{...i,done:check.checked}:i)));
        const text=doc.createElement('input');text.value=item.text;text.setAttribute('aria-label',`Bedingung ${index+1} in ${list.title}`);text.style.cssText='min-width:0;flex:1';text.maxLength=9000;
        const rename=()=>{if(text.value.trim())void commit(d=>replaceConditionList(d,binding,list,list.items.map(i=>i.id===item.id?{...i,text:text.value.trim()}:i)));};text.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();rename();}};
        row.append(check,text,button('Text speichern',rename));
        if(index>0)row.append(button('Nach oben',()=>{const items=[...list.items];[items[index-1],items[index]]=[items[index],items[index-1]];void commit(d=>replaceConditionList(d,binding,list,items));}));group.append(row);
      });
      if(!list.items.length){const p=doc.createElement('p');p.textContent='Noch keine Bedingung festgelegt. Diese Liste ist nicht erfüllt.';group.append(p);}
      const next=input('Neue Bedingung');next.i.placeholder='Was muss erfüllt sein? Enter speichert.';next.i.dataset.next=list.id;next.i.maxLength=9000;
      const append=()=>{const text=next.i.value.trim();if(!text)return;const item:ChecklistItem={id:`task_${crypto.randomUUID().replaceAll('-','')}`,text,done:false};void commit(d=>replaceConditionList(d,binding,list,[...list.items,item]),list.id);};
      next.i.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();append();}};group.append(next.l,button('Bedingung speichern',append));root.append(group);
    }
    const add=input('Name der neuen Bedingungsliste');add.i.placeholder='Zum Beispiel Prüfung';add.i.maxLength=120;
    root.append(add.l,button('Bedingungsliste hinzufügen',()=>{const title=add.i.value.trim();if(!title){feedback.textContent='Bitte einen Listennamen eingeben.';add.i.focus();return;}const id=`list_${crypto.randomUUID().replaceAll('-','')}`;void commit(d=>addConditionList(d,binding,{id,title}),id);}),feedback);
  };render();return root;
}
