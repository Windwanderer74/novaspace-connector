// SPDX-License-Identifier: AGPL-3.0-or-later
import { locateNode, parseMindmap, serializeMindmap, type Mindmap } from '../lib/mindmap-core';
import { projectDeckChecklist, registerMindmapProgress } from '../lib/mindmap-deck-core';
import { conditionEditor } from './condition-editor-ui';
import { deckProgressTitle, newConditionDescription, workflowItems, workflowLists, type CardMindmapBinding } from '../lib/mindmap-workflow-core';
import { inheritWorkPies, mindmapNodeIds } from './mindmap-editor-core';
import { createNextcloudBrowserClient } from './nextcloud-browser-client';
import { createWorkStep, workStepIntent } from '../lib/work-step-core';
import { browserWorkStepClient } from './work-step-client';

(() => {
  if (!/\/apps\/files(?:\/|$)/.test(location.pathname)) return;
  const uid = document.head.dataset.user, token = document.head.dataset.requesttoken;
  if (!uid || !token) return;
  const { client, request, api } = createNextcloudBrowserClient(uid, token);
  const seen = new WeakSet<HTMLIFrameElement>();
  const attach = (frame: HTMLIFrameElement) => {
    try {
      const url = new URL(frame.src, location.href); if (url.origin !== location.origin || !/\/apps\/files_mindmap\/$/.test(url.pathname)) return;
      const file = new URL(url.searchParams.get('file') ?? '');
      const prefix = `/remote.php/dav/files/${encodeURIComponent(uid)}`;
      if (file.origin !== location.origin || !file.pathname.startsWith(prefix + '/')) return;
      const path = decodeURIComponent(file.pathname.slice(prefix.length));
      const win = frame.contentWindow as any, doc = frame.contentDocument;
      if (!doc || !win?.minder || doc.getElementById('nf-workplan-controls')) return;
      const minder = win.minder;
      const bar = doc.createElement('div'); bar.id = 'nf-workplan-controls'; bar.style.cssText = 'display:inline-flex;gap:8px;align-items:center;padding:4px 10px;background:#fff;color:#17232a;border:1px solid #bcc6cb;border-radius:5px;font:14px sans-serif';
      const edit=doc.createElement('button');edit.textContent='Bedingungen bearbeiten';
      const activate = doc.createElement('button'), create = doc.createElement('button'), work = doc.createElement('button'), feedback = doc.createElement('span');
      work.textContent = 'Arbeitsschritt anlegen';
      activate.textContent = 'Arbeitsplan aktivieren'; create.textContent = 'Deckkarte aus Knoten'; feedback.setAttribute('role','status');
      bar.style.flexWrap = 'wrap';
      bar.append(activate,work,create,edit,feedback); (doc.getElementById('save-div') ?? doc.body).append(bar);
      let known = mindmapNodeIds(parseMindmap(JSON.stringify(minder.exportJson()))), changing = false, queue = Promise.resolve(), base: Awaited<ReturnType<typeof client.map>> | undefined;
      const ready = client.map(path).then(value => { base = value; }).catch((e: Error) => { feedback.textContent = e.message; });
      const apply = (map: Mindmap) => {
        changing = true;
        const visit = (node: any) => { const data = locateNode(map,node.getData('id')).node.data; for (const key of ['nfDeckAutoNodes','nfDeckAggregate','progress']) if (data[key] !== undefined && JSON.stringify(node.getData(key)) !== JSON.stringify(data[key])) { node.setData(key,data[key]); node.render(); } };
        minder.getRoot().traverse(visit); known = mindmapNodeIds(map); changing = false;
      };
      minder.on('contentchange', () => { if (changing) return; try { const map = inheritWorkPies(parseMindmap(JSON.stringify(minder.exportJson())),known); apply(map); } catch (e: any) { feedback.textContent = e.message; } });
      activate.onclick = () => {
        try { let map = parseMindmap(JSON.stringify(minder.exportJson())); const selected = minder.getSelectedNode(); const ids = [map.root.data.id,selected?.getData('id')].filter((id,i,a): id is string => !!id && a.indexOf(id) === i).filter(id => { const d=locateNode(map,id).node.data; return !d.nfDeckSync && !d.nfDeckChecklistOwner; });
          map = registerMindmapProgress(map,ids); map.root.data.nfDeckAutoNodes = 1; apply(map); minder.fire('contentchange'); feedback.textContent = 'Aktiv. Neue Arbeitsknoten bekommen eine leere Torte.';
        } catch (e: any) { feedback.textContent = e.message; }
      };
      const persist = async (text: string) => {
        await ready; if (!base) throw Error('Mindmap konnte nicht versionsgeprüft gelesen werden.');
        const fresh = await client.map(path);
        if (fresh.fileId !== base.fileId) throw Error('Datei wurde ersetzt. Bitte neu öffnen.');
        if (fresh.text === text) { base = fresh; return; }
        if (fresh.etag !== base.etag) {
          // This installed editor normalizes an unsupported theme on first load.
          // Accept only that exact normalization, already reflected in the editor.
          const previous=parseMindmap(base.text),latest=parseMindmap(fresh.text),candidate=parseMindmap(text);
          const previousTheme=previous.theme,latestTheme=latest.theme;
          delete previous.theme;delete latest.theme;
          if (JSON.stringify(previous)!==JSON.stringify(latest) || candidate.theme!==latestTheme || previousTheme===latestTheme) throw Error('Mindmap wurde anderswo geändert. Bitte schließen und neu öffnen.');
        }
        await client.saveMap(path,fresh.etag,fresh.fileId,text); base = await client.map(path);
      };
      const owner = (window as any).OCA?.FilesMindMap;
      if (owner?.save) {
        const previous = owner.save;
        owner.save = function(text: string, success: Function, failure: Function) {
          if (!frame.isConnected || minder.getRoot().getData('nfDeckAutoNodes') !== 1) return previous.call(this,text,success,failure);
          queue = queue.then(async () => { try { await persist(text); feedback.textContent = 'Arbeitsplan gespeichert.'; success('Gespeichert'); } catch (e: any) { feedback.textContent=e.message; failure(e.message); } });
        };
      }
      work.onclick = async () => {
        const selectedId = minder.getSelectedNode()?.getData('id');
        if (!selectedId) { feedback.textContent = 'Bitte zuerst die Grundkapsel auswählen.'; return; }
        try {
          const current = parseMindmap(JSON.stringify(minder.exportJson())), selected = locateNode(current, selectedId).node, intent = workStepIntent(current, selectedId);
          if (!intent && (selected.data.nfDeckSync || selected.data.nfDeckChecklistOwner || selected.data.nfSource || selected.data.hyperlink)) throw Error('Bitte die Grundkapsel als Ausgangspunkt auswählen.');
          const nodeId = intent ? selectedId : `work_${crypto.randomUUID().replaceAll('-', '')}`, parentId = intent?.parentId ?? selectedId;
          const defaults = intent ?? current.root.data.nfDeckTarget as { boardId?: number; stackId?: number } | undefined;
          const dialog = doc.createElement('dialog'); dialog.id = 'nf-work-step-dialog'; dialog.style.cssText = 'position:fixed;inset:0;margin:auto;width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;box-sizing:border-box;padding:22px;border:1px solid #819096;border-radius:12px;color:#17232a;background:white;font:15px sans-serif';
          const heading = doc.createElement('h2'); heading.textContent = intent ? 'Arbeitsschritt wiederaufnehmen' : 'Arbeitsschritt anlegen';
          const context = doc.createElement('p'); context.textContent = intent ? 'Die vorhandene Zuordnung wird geprüft. Es wird keine zweite Karte angelegt.' : `Ausgangspunkt: ${selected.data.text}. Arbeitskapsel, Deckkarte und erste Bedingungsliste werden gemeinsam angelegt.`;
          const form = doc.createElement('form'); form.style.cssText = 'display:grid;gap:12px';
          const label = (text: string, input: HTMLElement) => { const l = doc.createElement('label'); l.textContent = text; l.style.cssText = 'display:grid;gap:5px'; input.style.cssText = 'width:100%;box-sizing:border-box;padding:9px;font:inherit'; l.append(input); return l; };
          const title = doc.createElement('input'); title.maxLength = 240; title.required = true; title.value = intent?.title ?? ''; title.readOnly = !!intent;
          const boards = doc.createElement('select'), stacks = doc.createElement('select'), tasks = doc.createElement('textarea'); tasks.rows = 3; tasks.required = true; tasks.placeholder = 'Was muss erfüllt sein? Eine Bedingung pro Zeile'; tasks.value = intent?.items.map(i => i.text).join('\n') ?? ''; tasks.readOnly = !!intent;
          const targetHint = doc.createElement('small'); targetHint.textContent = 'Dieses Karten-Ziel wird für weitere Arbeitsschritte in dieser Mindmap vorgemerkt.';
          const submit = doc.createElement('button'); submit.type = 'submit'; submit.textContent = intent ? 'Vorhandenen Arbeitsschritt prüfen' : 'Arbeitsschritt und Deckkarte anlegen'; submit.disabled = true;
          const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Abbrechen'; cancel.onclick = () => dialog.remove();
          const msg = doc.createElement('div'); msg.setAttribute('role', 'status');
          form.append(label('Name des Arbeitsschritts', title), label('Board', boards), label('Anfangsspalte', stacks), targetHint, label('Erste Bedingungsliste', tasks), submit, cancel, msg); dialog.append(heading, context, form); doc.body.append(dialog); dialog.showModal();
          const option = (id: number, name: string) => { const o = doc.createElement('option'); o.value = String(id); o.textContent = name; return o; };
          const loadStacks = async () => { submit.disabled = true; stacks.replaceChildren(); try { for (const s of await (await request(`${api}/boards/${boards.value}/stacks`)).json()) if (!s.deletedAt) stacks.append(option(s.id, s.title)); if (defaults?.boardId === Number(boards.value) && [...stacks.options].some(o => Number(o.value) === defaults.stackId)) stacks.value = String(defaults.stackId); if (intent && Number(stacks.value) !== intent.stackId) throw Error('Die gespeicherte Anfangsspalte fehlt. Bitte prüfen.'); stacks.disabled = !!intent; submit.disabled = !stacks.options.length; } catch (e: any) { msg.textContent = e.message; } };
          try { for (const b of await (await request(`${api}/boards`)).json()) if (!b.archived && !b.deletedAt && b.permissions?.PERMISSION_EDIT === true) boards.append(option(b.id, b.title)); if (defaults?.boardId && [...boards.options].some(o => Number(o.value) === defaults.boardId)) boards.value = String(defaults.boardId); if (!boards.options.length || (intent && Number(boards.value) !== intent.boardId)) throw Error('Das beschreibbare Board fehlt. Bitte prüfen.'); boards.disabled = !!intent; boards.onchange = () => void loadStacks(); await loadStacks(); } catch (e: any) { msg.textContent = e.message; }
          let attempted = false;
          form.onsubmit = async event => {
            event.preventDefault(); if (attempted) return; submit.disabled = true; cancel.disabled = true;
            try {
              const conditions = tasks.value.split('\n').map(t => t.trim()).filter(Boolean);
              if (!title.value.trim() || !conditions.length) throw Error('Bitte einen Namen und mindestens eine Bedingung eingeben.');
              await queue; await persist(serializeMindmap(parseMindmap(JSON.stringify(minder.exportJson()))));
              attempted = true; msg.textContent = 'Arbeitsschritt wird angelegt und geprüft …';
              const out = await createWorkStep(browserWorkStepClient(client, request, api, uid), { path, fileId: base!.fileId, etag: base!.etag, parentId, nodeId, title: title.value, boardId: Number(boards.value), stackId: Number(stacks.value), conditions }, location.origin);
              base = { text: out.text, etag: out.etag, fileId: out.fileId }; changing = true; await minder.importJson(out.map); known = mindmapNodeIds(out.map); changing = false;
              feedback.textContent = out.reused ? `Arbeitsschritt mit Karte ${out.card.id} wiederverwendet.` : `Arbeitsschritt und Karte ${out.card.id} angelegt.`; dialog.remove();
            } catch (e: any) {
              changing = false; msg.textContent = e.message; cancel.disabled = false;
              if (attempted) { try { base = await client.map(path); changing = true; const map = parseMindmap(base.text); await minder.importJson(map); known = mindmapNodeIds(map); changing = false; } catch { changing = false; feedback.textContent = 'Bitte die Mindmap neu öffnen und den gespeicherten Arbeitsschritt prüfen.'; } }
              else submit.disabled = false;
            }
          };
        } catch (e: any) { feedback.textContent = e.message; }
      };
      create.onclick = async () => {
        const selected = minder.getSelectedNode(), selectedId = selected?.getData('id');
        if (!selectedId) { feedback.textContent='Bitte zuerst einen Arbeitsknoten auswählen.'; return; }
        const source = parseMindmap(JSON.stringify(minder.exportJson())), node = locateNode(source,selectedId).node;
        if (node.data.nfDeckSync || node.data.hyperlink || node.data.nfDeckChecklistOwner || node.data.nfWorkStep) { feedback.textContent='Dieser Knoten ist schon verknüpft oder ein Checklistenpunkt. Reservierte Arbeitsschritte über Arbeitsschritt anlegen wiederaufnehmen.'; return; }
        const dialog = doc.createElement('dialog'); dialog.style.cssText='max-width:520px;width:85%;padding:22px;border:1px solid #819096;border-radius:8px;color:#17232a;background:white;font:15px sans-serif';
        const heading=doc.createElement('h2'); heading.textContent='Deckkarte aus Arbeitsknoten';
        const form=doc.createElement('form'); form.style.cssText='display:grid;gap:12px';
        const title=doc.createElement('input'); title.value=node.data.text; title.maxLength=240; title.required=true;
        const boards=doc.createElement('select'),stacks=doc.createElement('select'),tasks=doc.createElement('textarea'); tasks.rows=5; tasks.placeholder='Was muss erfüllt sein? Eine Bedingung pro Zeile';tasks.required=true;
        const label=(text:string,input:HTMLElement)=>{const l=doc.createElement('label');l.textContent=text;l.style.display='grid';l.append(input);return l;};
        const submit=doc.createElement('button');submit.textContent='Karte und Verbindung anlegen';submit.type='submit';submit.disabled=true;
        const cancel=doc.createElement('button');cancel.textContent='Abbrechen';cancel.type='button';cancel.onclick=()=>dialog.remove();
        const msg=doc.createElement('div');msg.setAttribute('role','status');
        form.append(label('Kartentitel',title),label('Board',boards),label('Spalte',stacks),label('Erste Bedingungsliste',tasks),submit,cancel,msg);dialog.append(heading,form);doc.body.append(dialog);dialog.showModal();
        const option=(value:number,text:string)=>{const o=doc.createElement('option');o.value=String(value);o.textContent=text;return o;};
        const loadStacks=async()=>{submit.disabled=true;stacks.replaceChildren();try{for(const s of await (await request(`${api}/boards/${boards.value}/stacks`)).json())stacks.append(option(s.id,s.title));submit.disabled=!stacks.options.length;}catch(e:any){msg.textContent=e.message;}};
        try { for(const b of await (await request(`${api}/boards`)).json())if(!b.archived&&!b.deletedAt)boards.append(option(b.id,b.title));boards.onchange=()=>void loadStacks();await loadStacks(); } catch(e:any){msg.textContent=e.message;}
        let createdId:number|null=null,creationAttempted=false;
        form.onsubmit=async event=>{
          event.preventDefault(); if(createdId) return; submit.disabled=true; cancel.disabled=true;
          try { const lines=tasks.value.split('\n').map(t=>t.trim()).filter(Boolean);if(!lines.length||lines.length>100||lines.some(t=>t.length>9000||t.includes('<!--')))throw Error('Bitte mindestens eine und höchstens 100 einfache Bedingungen eingeben.');
            await queue;const current=parseMindmap(JSON.stringify(minder.exportJson()));const currentNode=locateNode(current,selectedId).node;if(currentNode.data.hyperlink||currentNode.data.nfDeckSync)throw Error('Knoten wurde inzwischen verknüpft.');
            await persist(serializeMindmap(current)); const boardId=Number(boards.value),stackId=Number(stacks.value),checklistId='work';
            const items=lines.map(text=>({id:`task_${crypto.randomUUID().replaceAll('-','')}`,text,done:false}));
            const binding:CardMindmapBinding={version:1,path,fileId:base!.fileId,nodeId:selectedId,checklistId};
            const description=newConditionDescription(binding,items);
            creationAttempted=true;
            const result=await request(`${api}/boards/${boardId}/stacks/${stackId}/cards`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:deckProgressTitle(title.value,items.length,0),description,type:'plain',owner:uid,order:999})});const card=await result.json();if(!Number.isSafeInteger(card.id)||card.id<1)throw Error('Kartenanlage nicht eindeutig bestätigt. Nicht erneut anlegen.');createdId=card.id;
            let saved=await client.card({boardId,stackId,cardId:card.id});if(saved.description!==description)saved=await client.saveCard({boardId,stackId,cardId:card.id},saved,deckProgressTitle(title.value,items.length,0),description);
            const projected=projectDeckChecklist(current,selectedId,{boardId,cardId:card.id,checklistId},workflowItems(description,binding),`${location.origin}/index.php/apps/deck/card/${card.id}`,false,workflowLists(description,binding));
            await persist(serializeMindmap(projected.map));minder.importJson(projected.map);known=mindmapNodeIds(projected.map);feedback.textContent=`Karte ${card.id} angelegt und verbunden.`;dialog.remove();
          } catch(e:any){msg.textContent=createdId?`Karte ${createdId} wurde erstellt. Zuordnung offen: ${e.message} Bitte keine zweite Karte anlegen.`:creationAttempted?`Kartenanlage nicht bestätigt: ${e.message} Bitte das Board prüfen und keine zweite Karte anlegen.`:e.message;cancel.disabled=false;if(!creationAttempted)submit.disabled=false;}
        };
      };
      edit.onclick=async()=>{
        try{
          const selected=minder.getSelectedNode();if(!selected)throw Error('Bitte eine Arbeitskapsel auswählen.');
          await queue;const map=parseMindmap(JSON.stringify(minder.exportJson()));const data=locateNode(map,selected.getData('id')).node.data;
          const node=data.nfDeckChecklistOwner?locateNode(map,String(data.nfDeckChecklistOwner)).node:locateNode(map,selected.getData('id')).node;
          const state=node.data.nfDeckSync as any;if(!state)throw Error('Diese Kapsel hat noch keine Deckkarte.');
          await persist(serializeMindmap(map));
          const cardId=Number(state.cardId),boardId=Number(state.boardId);
          const stacks=await (await request(`${api}/boards/${boardId}/stacks`)).json();const stack=stacks.find((s:any)=>s.cards?.some((c:any)=>c.id===cardId));if(!stack)throw Error('Deckkarte nicht gefunden.');
          const ref={boardId,stackId:stack.id,cardId},card=await client.card(ref);
          const dialog=doc.createElement('dialog');dialog.style.cssText='max-width:760px;width:90%;max-height:85vh;overflow:auto;padding:20px;background:white;color:#17232a';
          const close=doc.createElement('button');close.textContent='Schließen';close.onclick=()=>dialog.remove();
          dialog.append(close,conditionEditor(doc,client,ref,card,async()=>{base=await client.map(path);const updated=parseMindmap(base.text);changing=true;await minder.importJson(updated);known=mindmapNodeIds(updated);changing=false;}));doc.body.append(dialog);dialog.showModal();
        }catch(e:any){feedback.textContent=e.message;}
      };
      if (minder.getRoot().getData('nfDeckAutoNodes')===1) activate.textContent='Arbeitsplan aktiv';
    } catch { /* unrelated iframes remain untouched */ }
  };
  const scan=()=>{for(const frame of document.querySelectorAll<HTMLIFrameElement>('iframe')) { if(!seen.has(frame)){seen.add(frame);frame.addEventListener('load',()=>{attach(frame);const d=frame.contentDocument;if(d)new MutationObserver(()=>attach(frame)).observe(d.body,{childList:true,subtree:true});});}attach(frame); }};
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true}); scan();
})();
