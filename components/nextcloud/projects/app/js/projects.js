/* SPDX-License-Identifier: AGPL-3.0-or-later */
(() => {
  'use strict';
  function links(value, origin, base = '') {
    if (!value || value.state !== 'complete' || value.verified !== true || ![value.boardId, value.stackId, value.fileId].every(n => Number.isSafeInteger(n) && n > 0)) throw Error('Projektanlage nicht bestätigt.');
    const board = new URL(value.boardUrl, origin), map = new URL(value.mindmapUrl, origin);
    for (const url of [board, map]) if (url.origin !== origin || url.username || url.password || url.search) throw Error('Projektziel nicht bestätigt.');
    if (board.pathname !== `${base}/index.php/apps/deck/` || board.hash !== `#/board/${value.boardId}`
      || map.pathname !== `${base}/index.php/f/${value.fileId}` || map.hash) throw Error('Projektzuordnung nicht bestätigt.');
    return { board: board.href, map: map.href };
  }
  function finish(value, origin, base, client, navigate) {
    const target = links(value, origin, base);
    client.complete();
    try { navigate(target.map); } catch { /* Confirmed opening links remain available. */ }
    return target;
  }
  function flow(fetcher, storage, key, api, makeId) {
    let running = null;
    const get = () => { const text = storage.getItem(key); return text ? JSON.parse(text) : null; };
    const keep = value => storage.setItem(key, JSON.stringify(value));
    const status = async () => {
      const saved = get(); if (!saved) return { state: 'not-started' };
      if (!/^[a-f0-9]{32}$/.test(saved.creationId)) throw Error('Gespeicherter Anlageversuch ungültig.');
      const response = await fetcher(`${api}/creations/${saved.creationId}`, { method: 'GET' });
      const value = await response.json();
      if (!response.ok) throw Error('Der gespeicherte Anlageversuch konnte nicht geprüft werden.');
      if (value.creationId !== saved.creationId) throw Error('Anlageversuch nicht eindeutig.');
      if (value.state === 'partial' && value.input) keep({ ...value.input, creationId: value.creationId });
      return value;
    };
    const submit = input => {
      if (running) return running;
      running = (async () => {
        const saved = get(), body = { ...input, creationId: saved?.creationId ?? makeId() };
        if (!/^[a-f0-9]{32}$/.test(body.creationId)) throw Error('Gespeicherter Anlageversuch ungültig.');
        // A durable nonce is recorded before the single POST. Failure here sends nothing.
        keep(body);
        try {
          const response = await fetcher(`${api}/projects`, { method: 'POST', body: JSON.stringify(body) });
          const value = await response.json();
          if (!response.ok) { const error = new Error(value.message || 'Projektanlage noch nicht bestätigt.'); error.code = value.code; throw error; }
          if (value.creationId !== body.creationId) throw Error('Anlageversuch nicht eindeutig.');
          return value;
        } catch (error) {
          // Read after an unclear write. A failed read never triggers another POST.
          try { const current = await status(); if (current.state === 'complete') return current; } catch { /* retain attempt */ }
          throw error;
        }
      })().finally(() => { running = null; });
      return running;
    };
    return { get, status, submit, complete: () => storage.removeItem(key) };
  }
  function projectTarget(base = '') { return `${base}/index.php/apps/novaspace_capsules/projects/overview`; }
  function route(path) { if (/\/apps\/novaspace_capsules\/projects\/overview\/?$/.test(path)) return 'project'; return /\/apps\/office\/files_mindmap-km\/?$/.test(path) ? 'mindmap' : /\/apps\/deck(?:\/|$)/.test(path) ? 'deck' : null; }
  function webroot(path) { return path.split(/\/(?:index\.php\/)?apps\//)[0].replace(/\/$/, ''); }
  function menuType(path, hash = '') {
    if (/\/apps\/office\/files_mindmap-km\/?$/.test(path)) return hash === '#projektkapsel' ? 'project' : 'mindmap';
    return /\/apps\/office\/text-(?:txt|md|markdown)\/?$/.test(path) ? 'text' : null;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { links, finish, flow, route, menuType, webroot, projectTarget }; return; }
  const uid = document.head.dataset.user, token = document.head.dataset.requesttoken;
  if (!uid || !token) return;
  const base = webroot(location.pathname), api = `${base}/index.php/apps/novaspace_capsules`;
  const fetcher = (url, options) => fetch(url, { ...options, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
    headers: { requesttoken: token, 'OCS-APIRequest': 'true', Accept: 'application/json', ...(options.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) } });
  if (route(location.pathname) === 'mindmap' && location.hash === '#projektkapsel') { location.replace(projectTarget(base)); return; }
  const client = flow(fetcher, sessionStorage, `novaspace-project-creation:${uid}`, api,
    () => [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join(''));
  let opener = null;
  function open(title = '') {
    if (document.getElementById('ns-project-dialog')) return;
    opener = document.activeElement;
    const dialog = document.createElement('dialog'); dialog.id = 'ns-project-dialog'; dialog.className = 'ns-project-dialog';
    const heading = document.createElement('h2'); heading.id = 'ns-project-heading'; heading.textContent = 'Projekt erstellen'; dialog.setAttribute('aria-labelledby', heading.id);
    const intro = document.createElement('p'); intro.textContent = 'Ein Projekt mit Deck-Board und Mindmap. Die vier Spalten sind Neu, Wartend, In Arbeit und Zu prüfen. Du kannst ohne erste Karte starten.';
    const form = document.createElement('form'); form.className = 'ns-project-form';
    const fields = {};
    const field = (name, caption, value, type = 'text') => {
      const wrap = document.createElement('label'), input = name === 'description' ? document.createElement('textarea') : document.createElement('input');
      wrap.textContent = caption; input.name = name; input.value = value; if (input.tagName === 'INPUT') input.type = type;
      if (name === 'title') { input.required = true; input.maxLength = 180; }
      if (name === 'description') { input.rows = 3; input.maxLength = 4000; }
      if (name === 'folder') input.required = true;
      wrap.append(input); form.append(wrap); fields[name] = input;
    };
    field('title', 'Projektname', title); field('description', 'Beschreibung (optional)', '');
    for (const [name, value] of [['folder', ''], ['folderMode', 'auto']]) {
      const hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.name = name; hidden.value = value; fields[name] = hidden; form.append(hidden);
    }
    const storage = document.createElement('fieldset'); storage.className = 'ns-project-storage';
    const legend = document.createElement('legend'); legend.textContent = 'Ablage der Mindmap';
    const chosen = document.createElement('p'); chosen.className = 'ns-project-folder-choice'; chosen.setAttribute('aria-live', 'polite');
    const choose = document.createElement('button'); choose.type = 'button'; choose.textContent = 'Anderen Ordner wählen';
    const automatic = document.createElement('button'); automatic.type = 'button'; automatic.textContent = 'Standardordner verwenden'; automatic.hidden = true;
    const picker = document.createElement('section'); picker.className = 'ns-project-folder-picker'; picker.hidden = true; picker.setAttribute('aria-label', 'Ordner auswählen');
    const pickerPath = document.createElement('p'), pickerMessage = document.createElement('p'); pickerMessage.setAttribute('role', 'status');
    const folderList = document.createElement('ul');
    const up = document.createElement('button'); up.type = 'button'; up.textContent = 'Übergeordneter Ordner';
    const select = document.createElement('button'); select.type = 'button'; select.textContent = 'Diesen Ordner verwenden';
    const cancelPick = document.createElement('button'); cancelPick.type = 'button'; cancelPick.textContent = 'Ordnerauswahl schließen';
    picker.append(pickerPath, up, folderList, pickerMessage, select, cancelPick);
    storage.append(legend, chosen, choose, automatic, picker); form.append(storage);
    const showChoice = () => {
      const auto = fields.folderMode.value === 'auto';
      chosen.textContent = auto ? `Automatisch · Eigene Dateien / Projekte / ${fields.title.value.trim() || 'Projektname'} / ${fields.title.value.trim() || 'Projektname'}.km` : `Gewählter Ordner: ${fields.folder.value || '/'}`;
      automatic.hidden = auto;
    };
    fields.title.addEventListener('input', showChoice); showChoice();
    field('color', 'Boardfarbe', '#ddcb55', 'color');
    const actions = document.createElement('div'); actions.className = 'ns-project-actions';
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Board und Mindmap erstellen'; submit.className = 'ns-project-primary';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Schließen';
    const result = document.createElement('div'); result.className = 'ns-project-result'; result.setAttribute('role', 'status'); result.setAttribute('aria-live', 'polite');
    let locked = false, pickerRevision = 0;
    const closePicker = () => { ++pickerRevision; picker.hidden = true; submit.disabled = locked; };
    const setLocked = value => {
      locked = value;
      for (const el of Object.values(fields)) el.disabled = locked;
      choose.disabled = locked; automatic.disabled = locked;
      if (locked) closePicker();
    };
    const fill = value => {
      fields.folderMode.value = value.folderMode ?? 'custom';
      for (const [name, el] of Object.entries(fields)) if (value[name] !== undefined) el.value = name === 'color' ? '#' + value[name].replace(/^#/, '') : value[name];
      showChoice();
    };
    const browse = async path => {
      if (locked) return;
      const revision = ++pickerRevision;
      picker.hidden = false; submit.disabled = true; select.disabled = true; up.disabled = true;
      folderList.replaceChildren(); pickerPath.textContent = path === '/' ? 'Eigene Dateien' : path; pickerMessage.textContent = 'Ordner werden geladen …';
      try {
        const response = await fetcher(`${api}/project-folders?path=${encodeURIComponent(path)}`, { method: 'GET' });
        const value = await response.json();
        if (revision !== pickerRevision || !dialog.isConnected) return;
        if (!response.ok || value.path !== path || !Array.isArray(value.folders) || typeof value.creatable !== 'boolean') throw Error('Ordner nicht verfügbar.');
        for (const folder of value.folders) {
          if (typeof folder.name !== 'string' || typeof folder.path !== 'string' || !folder.path.startsWith(path === '/' ? '/' : path + '/') || folder.path.slice(path === '/' ? 1 : path.length + 1).includes('/')) throw Error('Ordner nicht eindeutig.');
          const li = document.createElement('li'), button = document.createElement('button'); button.type = 'button'; button.textContent = folder.name;
          button.onclick = () => browse(folder.path); li.append(button); folderList.append(li);
        }
        up.disabled = !value.parent; up.onclick = () => { if (value.parent) browse(value.parent); };
        select.disabled = !value.creatable;
        select.onclick = () => { if (locked || select.disabled) return; fields.folder.value = value.path; fields.folderMode.value = 'custom'; showChoice(); closePicker(); choose.focus(); };
        pickerMessage.textContent = value.creatable ? (value.folders.length ? '' : 'Keine Unterordner vorhanden.') : 'In diesem Ordner kannst du keine Dateien anlegen.';
      } catch {
        if (revision === pickerRevision && dialog.isConnected) pickerMessage.textContent = 'Ordner konnten nicht geladen werden. Auswahl schließen und erneut versuchen.';
      }
    };
    choose.onclick = () => browse(fields.folderMode.value === 'custom' ? fields.folder.value || '/' : '/');
    automatic.onclick = () => { if (locked) return; fields.folderMode.value = 'auto'; fields.folder.value = ''; showChoice(); closePicker(); choose.focus(); };
    cancelPick.onclick = () => { closePicker(); choose.focus(); };
    const input = () => ({ ...Object.fromEntries(Object.entries(fields).map(([name, el]) => [name, name === 'color' ? el.value.slice(1) : name === 'description' ? el.value : el.value.trim()])), stackName: client.get()?.stackName ?? 'Neu', expectedAccount: uid });
    const success = value => {
      const target = links(value, location.origin, base); setLocked(true); submit.hidden = true;
      result.replaceChildren(document.createTextNode('Projekt erstellt. Die Mindmap wird geöffnet … '));
      for (const [href, caption] of [[target.board, 'Board öffnen'], [target.map, 'Mindmap öffnen']]) {
        const a = document.createElement('a'); a.href = href; a.textContent = caption; a.className = 'ns-project-open'; result.append(a);
      }
      finish(value, location.origin, base, client, href => location.assign(href));
    };
    close.onclick = () => { ++pickerRevision; dialog.close(); dialog.remove(); if (opener?.isConnected) opener.focus(); };
    dialog.addEventListener('cancel', event => { if (close.disabled) { event.preventDefault(); return; } dialog.remove(); if (opener?.isConnected) opener.focus(); });
    actions.append(submit, close); form.append(actions, result); dialog.append(heading, intro, form); document.body.append(dialog); dialog.showModal();
    form.onsubmit = async event => {
      event.preventDefault();
      if (!picker.hidden || close.disabled) return;
      submit.disabled = true; close.disabled = true; setLocked(true); result.textContent = 'Projekt wird erstellt …';
      try { success(await client.submit(input())); }
      catch (error) {
        result.textContent = `${error.message} Der Anlageversuch bleibt gespeichert.`;
        const messages = { PROJECT_DEFAULT_FOLDER_CONFLICT: 'Der Standardordner ist bereits durch eine Datei oder einen fremden Ordner belegt. Bitte einen anderen Ordner wählen.', PROJECT_FOLDER_LIMIT: 'Dieser Ordner enthält zu viele Unterordner.', PROJECT_MATRIX_INPUT: 'Neue Projekte starten mit der festen Vierer-Matrix.', PROJECT_FILE_EXISTS: 'In diesem Ordner gibt es bereits eine Mindmap mit diesem Namen.', PROJECT_BOARD_EXISTS: 'Ein eigenes Board mit diesem Namen ist bereits vorhanden.', PROJECT_FOLDER_ACCESS: 'Der Ablageordner ist nicht beschreibbar.', PROJECT_MAP_OUTCOME_UNKNOWN: 'Die Dateianlage muss anhand des vorhandenen Projekts geprüft werden.' };
        if (messages[error.code]) result.textContent = messages[error.code];
        try { const value = await client.status(); if (value.state === 'complete') { success(value); return; } fill(client.get()); setLocked(value.state !== 'not-found'); }
        catch { setLocked(true); }
        submit.textContent = 'Vorhandene Anlage fortsetzen'; submit.disabled = false;
      } finally { close.disabled = false; }
    };
    try {
      const saved = client.get();
      if (saved) {
        fill(saved); setLocked(true); submit.disabled = true; result.textContent = 'Vorhandener Anlageversuch wird geprüft …';
        client.status().then(value => {
          if (!dialog.isConnected) return;
          if (value.state === 'complete') { success(value); return; }
          fill(client.get()); setLocked(value.state !== 'not-found'); submit.disabled = false; submit.textContent = 'Vorhandene Anlage fortsetzen';
          result.textContent = 'Der vorhandene Anlageversuch wird mit derselben Kennung fortgesetzt.';
        }).catch(() => { result.textContent = 'Der vorhandene Anlageversuch konnte noch nicht geprüft werden. Bitte später erneut öffnen.'; });
      } else fields.title.focus();
    } catch { result.textContent = 'Der Anlageversuch kann in diesem Browser nicht sicher gespeichert werden.'; submit.disabled = true; }
  }
  function icon(plate = false) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', 'M3 5h17v20H3zM9 5v20M15 5v20M21 12h4v8h4M25 12h4M4 10h4m2 5h4m2-4h3M25 25v6m-3-3h6'); svg.append(path);
    for (const [cx,cy] of [[29,12],[29,20]]) {
      const c = document.createElementNS(svg.namespaceURI, 'circle'); c.setAttribute('cx',cx); c.setAttribute('cy',cy); c.setAttribute('r','1.7'); svg.append(c);
    }
    if (plate) {
      path.setAttribute('d', path.getAttribute('d').replace('M25 25v6m-3-3h6', ''));
      const group = document.createElementNS(svg.namespaceURI, 'g'); group.setAttribute('transform', 'translate(5 5) scale(.69)');
      group.setAttribute('stroke', '#fff'); group.append(...svg.childNodes);
      const rect = document.createElementNS(svg.namespaceURI, 'rect');
      for (const [key, value] of Object.entries({width:32,height:32,rx:3,fill:'#000',stroke:'none'})) rect.setAttribute(key,value);
      svg.append(rect, group);
    }
    return svg;
  }
  function decorateMenu() {
    // Core35 action rows and their teleported overflow, never arbitrary file links.
    for (const a of document.querySelectorAll('.app-menu-actions a[href], .app-menu-actions__submenu a[href]')) {
      const url = new URL(a.getAttribute('href'), location.href);
      if (url.origin !== location.origin) continue;
      const type = menuType(url.pathname, url.hash); if (type !== 'text' && type !== 'mindmap') continue;
      if (type === 'mindmap') {
        const label = a.querySelector('.app-item__label');
        if (label?.textContent.trim() === 'Neue Mindmap') label.textContent = 'Mindmap';
        if (a.title === 'Neue Mindmap') a.title = 'Mindmap';
      }
      const glyph = a.querySelector('.app-action-icon');
      if (!glyph || glyph.querySelector('.app-action-icon__indicator')) continue;
      const badge = document.createElement('span'); badge.className = 'app-action-icon__indicator ns-create-indicator'; badge.setAttribute('aria-hidden','true');
      const plus = document.createElementNS('http://www.w3.org/2000/svg','svg'); plus.setAttribute('viewBox','0 0 24 24');
      const path = document.createElementNS(plus.namespaceURI,'path'); path.setAttribute('d','M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z'); path.setAttribute('fill','currentColor'); plus.append(path); badge.append(plus); glyph.append(badge);
    }
  }
  const navigationScope = ':is(#app-navigation-vue, #app-navigation)';
  const contentScope = ':is(#app-content-vue, #app-content)';
  function navigationItem(source, id, label, plate = false) {
    const template = source.closest('li.app-navigation-entry-wrapper');
    if (!template) return null;
    const scoped = (tag, className, sample) => {
      const element = document.createElement(tag); element.className = className;
      for (const attr of sample?.attributes ?? []) if (attr.name.startsWith('data-v-')) element.setAttribute(attr.name, attr.value);
      return element;
    };
    const item = scoped('li', 'app-navigation-entry-wrapper', template); item.id = id;
    const row = scoped('div', 'app-navigation-entry', template.querySelector('.app-navigation-entry'));
    const link = scoped('a', 'app-navigation-entry-link', source);
    link.href = projectTarget(base); link.title = label;
    const image = scoped('div', 'app-navigation-entry-icon', source.querySelector('.app-navigation-entry-icon'));
    const graphic = scoped('span', 'icon-vue office-overview__nav-icon', source.querySelector('.icon-vue'));
    graphic.setAttribute('aria-hidden', 'true'); graphic.style.width = '20px'; graphic.style.height = '20px';
    const svg = icon(plate); svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); graphic.append(svg); image.append(graphic);
    const name = scoped('span', 'app-navigation-entry__name', source.querySelector('.app-navigation-entry__name')); name.textContent = label;
    link.append(image, name); row.append(link); item.append(row); return item;
  }
  function officeNavigation() {
    if (!/\/apps\/office(?:\/|$)/.test(location.pathname)) return;
    const nav = document.querySelector(navigationScope); if (!nav) return;
    const source = [...nav.querySelectorAll('a[href]')].find(a => {
      const url = new URL(a.getAttribute('href'), location.href);
      return url.origin === location.origin && route(url.pathname) === 'mindmap' && !url.hash;
    });
    if (source) {
      const label = source.querySelector('.app-navigation-entry__name');
      if (label?.textContent.trim() === 'Neue Mindmap') label.textContent = 'Mindmap';
      if (source.title === 'Neue Mindmap') source.title = 'Mindmap';
    }
    const list = nav.querySelector('.app-navigation__list');
    if (!source || !list || source.closest('li.app-navigation-entry-wrapper')?.parentElement !== list) return;
    const item = nav.querySelector('#ns-project-office-nav') ?? navigationItem(source, 'ns-project-office-nav', 'Projekt', true);
    if (item && list.lastElementChild !== item) list.append(item);
  }
  function deckNavigation() {
    const nav = document.querySelector(navigationScope); if (!nav) return;
    const form = nav.querySelector('.board-create');
    const entry = nav.querySelector('.icon-add')?.closest('li');
    const anchor = form?.parentElement ?? (entry?.parentElement?.tagName === 'SPAN' ? entry.parentElement : entry);
    const list = nav.querySelector('.app-navigation__list');
    const source = nav.querySelector('a.app-navigation-entry-link');
    if (!anchor || !list || !list.contains(anchor) || !source) return;
    let branch = anchor;
    while (branch.parentElement !== list) { branch = branch.parentElement; if (!branch) return; }
    const item = nav.querySelector('#ns-project-deck-entry') ?? navigationItem(source, 'ns-project-deck-entry', 'Projekt erstellen');
    if (item && branch.nextElementSibling !== item) branch.after(item);
  }
  function projectFilters() {
    const section = document.querySelector('#ns-project-office-page #ns-project-list');
    if (!section || section.dataset.nsFiltersBound) return;
    section.dataset.nsFiltersBound = 'true';
    const buttons = [...section.querySelectorAll('[data-project-filter]')];
    const rows = [...section.querySelectorAll('[data-project-kind]')];
    const empty = section.querySelector('#ns-project-list-empty');
    const apply = filter => {
      if (!['all', 'mine', 'shared'].includes(filter)) return;
      let visible = 0;
      for (const row of rows) { row.hidden = filter !== 'all' && row.dataset.projectKind !== filter; if (!row.hidden) visible++; }
      for (const button of buttons) { const selected = button.dataset.projectFilter === filter; button.setAttribute('aria-pressed', String(selected)); button.classList.toggle('is-active', selected); }
      section.dataset.projectFilter = filter;
      if (empty) {
        const messages = { all: 'Noch keine Projekte vorhanden.', mine: 'Noch keine eigenen Projekte.', shared: 'Noch keine mit dir geteilten Projekte.' };
        if (empty.textContent !== messages[filter]) empty.textContent = messages[filter];
        empty.hidden = visible !== 0;
      }
    };
    for (const button of buttons) button.addEventListener('click', () => apply(button.dataset.projectFilter));
    apply('mine');
  }
  function scan() {
    const kind = route(location.pathname); officeNavigation();
    if (kind === 'deck') deckNavigation();
    // Office reuses its template list on category changes. Never add our tile there.
    // Only our own page owns it; remove any legacy injected tile elsewhere.
    if (kind !== 'project') document.getElementById('ns-project-office-choice')?.remove();
    if (kind === 'project') {
      projectFilters();
      const action = document.querySelector('#ns-project-office-page #ns-project-office-choice button');
      if (action && !action.dataset.nsProjectBound) {
        action.dataset.nsProjectBound = 'true'; action.addEventListener('click', () => open());
      }
    }
    if (kind === 'mindmap') {
      for (const h of document.querySelectorAll(`${contentScope} h1, ${contentScope} h2, ${navigationScope} h2`)) {
        if (h.childElementCount) continue;
        if (h.textContent.trim() === 'Neue Mindmap') h.textContent = 'Mindmaps';
        if (h.textContent.trim() === 'Neueste Neue Mindmap') h.textContent = 'Neueste Mindmaps';
      }
      for (const input of document.querySelectorAll('input[placeholder="Suche Neue Mindmap"]')) input.placeholder = 'Mindmaps durchsuchen';
    }
    decorateMenu();

  }
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', scan); window.addEventListener('hashchange', scan); scan();
})();
