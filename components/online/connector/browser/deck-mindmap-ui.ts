// SPDX-License-Identifier: AGPL-3.0-or-later
import './mindmap-editor-ui';
import { createNextcloudBrowserClient } from './nextcloud-browser-client';
import { conditionEditor } from './condition-editor-ui';
import { cardMindmapBinding, workflowItems, workflowLists } from '../lib/mindmap-workflow-core';
import { checklistProgress, parseDeckChecklist } from '../lib/mindmap-deck-core';
import { savedCardRef, savedLinkedCardId, syncSavedDeckCard, type BrowserCard, type CardRef, type Client } from './deck-mindmap-client';

// Installed as an independent final JSLoader block. No credentials or external requests.
(() => {
  if (!/\/apps\/deck(?:\/|$)/.test(location.pathname) || document.getElementById('nf-mindmap-deck-ui')) return;
  const uid = document.head.dataset.user, requesttoken = document.head.dataset.requesttoken;
  if (!uid || !requesttoken) return;
  const { client, request, originalFetch, api } = createNextcloudBrowserClient(uid, requesttoken);
  const style = document.createElement('style'); style.id = 'nf-mindmap-deck-ui';
  style.textContent = '.card-upper h4:has(.nf-mindmap-pie),.app-sidebar-header__mainname:has(.nf-mindmap-pie){display:flex!important;align-items:flex-start;gap:9px}.nf-mindmap-pie{display:inline-block;flex:0 0 23px;width:23px;height:23px;box-sizing:border-box;border-radius:50%;border:2px solid #566469;margin:1px 0;background:conic-gradient(#248645 var(--nf-fill),#edf1f2 0)}.nf-mindmap-title{display:inline-block;min-width:0}.nf-mindmap-title::first-letter{font-size:0}.nf-mindmap-sync-status{position:fixed;bottom:20px;right:20px;max-width:360px;padding:12px 16px;border:1px solid var(--color-border-dark);border-radius:8px;background:var(--color-main-background);color:var(--color-main-text);z-index:10000}.nf-mindmap-pie[data-empty="true"]{background:#edf1f2}';
  document.head.append(style);
  const cards = new Map<number, { card: BrowserCard; progress: ReturnType<typeof checklistProgress> }>();
  const remember = (card: BrowserCard) => {
    try { const binding = cardMindmapBinding(card.description ?? ''); if (binding) cards.set(card.id, { card, progress: checklistProgress(workflowItems(card.description ?? '', binding)) }); } catch { /* invalid bindings don't decorate unrelated cards */ }
  };
  const paint = () => {
    for (const heading of document.querySelectorAll<HTMLHeadingElement>('.card-upper h4, [role="dialog"] .app-sidebar-header__mainname')) {
      let title = heading.querySelector<HTMLSpanElement>('span[contenteditable="false"], .nf-mindmap-dialog-title');
      const sidebar = heading.classList.contains('app-sidebar-header__mainname');
      if (!title && !sidebar) continue;
      const text = (title?.textContent ?? heading.textContent ?? '').trim();
      const base = (t: string) => t.trim().replace(/^[○◔◑◕●]\s+/u, '');
      const previous = cards.get(Number(heading.dataset.nfCardId));
      const matches = previous && base(previous.card.title) === base(text) ? [previous] : [...cards.values()].filter(r => r.card.title.trim() === text);
      if (matches.length !== 1) {
        heading.querySelector('.nf-mindmap-pie')?.remove();
        title?.classList.remove('nf-mindmap-title');
        delete heading.dataset.nfCardId;
        continue;
      }
      // The native sidebar uses plain heading text. Wrap only those text nodes;
      // preserve the stored title and leave editable fields to Deck.
      if (!title) {
        title = document.createElement('span'); title.className = 'nf-mindmap-dialog-title';
        for (const child of Array.from(heading.childNodes)) if (child.nodeType === Node.TEXT_NODE) title.append(child);
        heading.append(title);
      }
      const { progress } = matches[0];
      heading.dataset.nfCardId = String(matches[0].card.id);
      let pie = heading.querySelector<HTMLSpanElement>('.nf-mindmap-pie');
      if (!pie) { pie = document.createElement('span'); pie.className = 'nf-mindmap-pie'; pie.setAttribute('role', 'img'); heading.prepend(pie); }
      const label = `Mindmap verbunden: ${progress.completed} von ${progress.total} Arbeitspunkten erledigt${progress.total ? '' : '; noch keine Punkte festgelegt'}`;
      if (pie.getAttribute('aria-label') !== label) { pie.setAttribute('aria-label', label); pie.title = label; pie.style.setProperty('--nf-fill', `${progress.total ? progress.completed / progress.total * 100 : 0}%`); pie.dataset.empty = String(!progress.total); }
      title.classList.toggle('nf-mindmap-title', /^[○◔◑◕●]\s/.test((title.textContent ?? '').trim()));
    }
  };
  const panels=new WeakMap<Element,{id:number;description:string}>();
  const paintEditor=()=>{
    const dialog=document.querySelector('[role="dialog"]');if(!dialog)return;
    const heading=dialog.querySelector<HTMLElement>('.app-sidebar-header__mainname');const id=Number(heading?.dataset.nfCardId),record=cards.get(id);
    const tab=dialog.querySelector('[role="tabpanel"]');if(!record||!tab)return;
    const binding=cardMindmapBinding(record.card.description??'');
    if(binding && workflowLists(record.card.description??'',binding)) {
      // Deck's native editor holds a cached description. Keep it from replaying
      // that older snapshot after a dedicated condition edit.
      const native=tab.querySelector<HTMLElement>('[contenteditable="true"]');if(native){native.setAttribute('inert','');native.setAttribute('aria-readonly','true');}
      const tools=tab.querySelector<HTMLElement>('[aria-label="Editor-Aktionen"]');if(tools && !tools.hidden)tools.hidden=true;
    }
    const old=panels.get(tab);if(old?.id===id && old.description===(record.card.description??''))return;
    tab.querySelector('.nf-condition-editor')?.remove();panels.set(tab,{id,description:record.card.description??''});
    const panel=conditionEditor(document,client,{boardId:Number(board),stackId:record.card.stackId,cardId:id},record.card,card=>{panels.set(tab,{id,description:card.description??''});remember(card);paint();});
    tab.prepend(panel);
  };
  const status = (text: string, error = false) => {
    let el = document.querySelector<HTMLDivElement>('.nf-mindmap-sync-status');
    if (!el) { el = document.createElement('div'); el.className = 'nf-mindmap-sync-status'; document.body.append(el); }
    el.setAttribute('role', error ? 'alert' : 'status'); el.textContent = text;
    if (!el.querySelector('button')) { const dismiss = document.createElement('button'); dismiss.textContent = 'Schließen'; dismiss.onclick = () => el?.remove(); el.append(dismiss); }
  };
  let queue = Promise.resolve();
  const edited = (ref: CardRef) => {
    queue = queue.then(async () => {
      try { const result = await syncSavedDeckCard(client, ref); if (!result.linked) return; remember(result.card); paint(); status('Deck und Mindmap sind abgeglichen.'); }
      catch (error) { status(`Deck ist gespeichert. Mindmap-Abgleich offen: ${error instanceof Error ? error.message : 'Bitte prüfen.'}`, true); }
    });
  };
  // Observe successful native saves only; our own requests use originalFetch.
  const nativeRef = (url: string, method: string) => {
    const full = savedCardRef(url, method, location.origin); if (full) return full;
    const id = savedLinkedCardId(url, method, location.origin), known = id ? cards.get(id) : undefined;
    const boardId = Number(board);
    return known && boardId > 0 ? { boardId, stackId: known.card.stackId, cardId: id! } : null;
  };
  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    const observed = new URL(String(url), location.origin);
    if (observed.origin === location.origin && /\/apps\/deck\//.test(observed.pathname) && ['PUT', 'PATCH'].includes(method.toUpperCase())) this.addEventListener('load', () => { if (this.status >= 200 && this.status < 300) style.dataset.lastDeckSaveRoute = observed.pathname; }, { once: true });
    const ref = nativeRef(String(url), method);
    if (ref) this.addEventListener('load', () => { if (this.status >= 200 && this.status < 300) edited(ref); }, { once: true });
    return (nativeOpen as Function).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    const ref = nativeRef(input instanceof Request ? input.url : String(input), init?.method ?? (input instanceof Request ? input.method : 'GET'));
    if (ref && response.ok) edited(ref);
    return response;
  };
  let board = '';
  const mount = () => {
    const match = /\/apps\/deck\/(?:board\/|#\/board\/)(\d+)/.exec(location.pathname + location.hash);
    const current = match?.[1] ?? '';
    if (current !== board) { board = current; cards.clear(); if (current) request(`${api}/boards/${current}/stacks`).then(r => r.json()).then((stacks: { cards?: BrowserCard[] }[]) => { for (const stack of stacks) for (const card of stack.cards ?? []) remember(card); paint(); panels.delete(document.querySelector('[role="dialog"] [role="tabpanel"]')!);paintEditor(); }).catch(() => {}); }
    paint();paintEditor();
  };
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true, characterData: true });
  mount();
})();
