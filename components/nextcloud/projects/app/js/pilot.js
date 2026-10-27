/* SPDX-License-Identifier: AGPL-3.0-or-later */
(() => {
  'use strict';
  function boardId(path, hash) {
    const match = /\/apps\/deck\/(?:board\/|#\/board\/)(\d+)(?:\/|$)/.exec(path + hash);
    const id = Number(match?.[1]); return Number.isSafeInteger(id) && id > 0 ? id : null;
  }
  const labels = new Map([
    ['Bedingungslisten', 'Ziellisten'], ['Bedingungen bearbeiten', 'Ziele bearbeiten'],
    ['Neue Bedingung', 'Neues Ziel'], ['Bedingung speichern', 'Ziel speichern'],
    ['Name der neuen Bedingungsliste', 'Name der neuen Zielliste'],
    ['Bedingungsliste hinzufügen', 'Zielliste hinzufügen'], ['Erste Bedingungsliste', 'Erste Zielliste'],
    ['Arbeitsschritt anlegen', 'Arbeitskapsel anlegen'], ['Name des Arbeitsschritts', 'Name der Arbeitskapsel'],
    ['Arbeitsschritt und Deckkarte anlegen', 'Arbeitskapsel und Deckkarte anlegen'],
    ['Was muss erfüllt sein? Eine Bedingung pro Zeile', 'Was möchtest du erreichen? Ein Ziel pro Zeile'],
    ['Was muss erfüllt sein? Enter speichert.', 'Was möchtest du erreichen? Enter speichert.'],
    ['Noch keine Bedingung festgelegt. Diese Liste ist nicht erfüllt.', 'Noch keine Ziele festgelegt. Diese Liste ist noch ungeplant.'],
    ['Bitte einen Namen und mindestens eine Bedingung eingeben.', 'Bitte einen Namen und mindestens ein Ziel eingeben.'],
  ]);
  function goalLabel(text) { return labels.get(text) ?? text; }
  function projectLink(value, id, origin) {
    if (!value || value.state !== 'connected' || value.boardId !== id || !Number.isSafeInteger(value.fileId) || value.fileId < 1
      || typeof value.mindmapName !== 'string' || typeof value.url !== 'string') throw Error('Projektzuordnung nicht bestätigt.');
    const url = new URL(value.url, origin);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash || url.pathname !== `/index.php/f/${value.fileId}`) throw Error('Mindmap-Ziel nicht bestätigt.');
    return url.href;
  }
  function fixedMatrix(value) {
    const matrix = value?.framework;
    return matrix?.frameworkVersion === 1 && Array.isArray(matrix.stacks) && matrix.stacks.length === 4
      && matrix.stacks.every((row, i) => row.title === ['Neu', 'Wartend', 'In Arbeit', 'Zu prüfen'][i]
        && row.order === i && Number.isSafeInteger(row.id) && row.id > 0)
      && new Set(matrix.stacks.map(row => row.id)).size === 4;
  }
  // Shared pure helpers make route and destination regressions testable without a login.
  if (typeof module !== 'undefined' && module.exports) { module.exports = { boardId, goalLabel, projectLink, fixedMatrix }; return; }
  if (!/\/apps\/(?:deck|files)(?:\/|$)/.test(location.pathname) || !document.head.dataset.user) return;
  const api = '/index.php/apps/novaspace_capsules';
  const observed = new WeakSet();
  function translate(doc) {
    for (const root of doc.querySelectorAll('.nf-condition-editor, #nf-workplan-controls, #nf-work-step-dialog')) {
      // Only control labels are translated. Goal text, list names and stored descriptions are untouched.
      for (const el of root.querySelectorAll('button,label,h2,h3,p,small')) {
        for (const node of el.childNodes) if (node.nodeType === 3) {
          const trimmed = node.textContent.trim(), replacement = goalLabel(trimmed);
          if (replacement !== trimmed) node.textContent = node.textContent.replace(trimmed, replacement);
        }
      }
      for (const el of root.querySelectorAll('input,textarea,[aria-label]')) {
        for (const attr of ['placeholder', 'aria-label']) {
          const old = el.getAttribute(attr); if (!old) continue;
          let next = goalLabel(old);
          if (attr === 'aria-label' && el.matches('input[type="checkbox"]')) next = next.replace(/^Erfüllt: /, 'Erreicht: ');
          if (next !== old) el.setAttribute(attr, next);
        }
      }
    }
  }
  function watchFrames() {
    for (const frame of document.querySelectorAll('iframe')) {
      const attach = () => {
        try {
          const url = new URL(frame.src, location.href);
          if (url.origin !== location.origin || !/\/apps\/files_mindmap\/$/.test(url.pathname)) return;
          const doc = frame.contentDocument; if (!doc || observed.has(doc)) return;
          observed.add(doc); new MutationObserver(() => translate(doc)).observe(doc, { childList: true, subtree: true }); translate(doc);
        } catch { /* unrelated frames */ }
      };
      if (!observed.has(frame)) { observed.add(frame); frame.addEventListener('load', attach); } attach();
    }
  }
  let current = null, generation = 0, data = null, loading = false;
  function paint() {
    // Presentation convention for explicitly marked new project boards only.
    // No event interception, permissions change or Deck API restrictions.
    const fixed = current !== null && fixedMatrix(data);
    document.body.classList.toggle('ns-project-framework', fixed);
    if (fixed) for (const header of document.querySelectorAll('.stack__header')) {
      const title = header.querySelector(':scope > h3.stack__title');
      if (!title) continue;
      let label = header.querySelector(':scope > .ns-project-stack-label');
      if (!label) { label = document.createElement('h3'); label.className = 'ns-project-stack-label'; title.after(label); }
      if (label.textContent !== title.textContent) label.textContent = title.textContent;
      // Older Deck has two header actions; Deck 1.19 keeps card-add at
      // the bottom. Recognize the list's menu toggle, never a card-add button.
      const actions = [...header.children].filter(el => el.matches('.action-item'));
      for (const action of actions) {
        const listMenu = action.querySelector('button.action-item__menutoggle .dots-horizontal-icon');
        action.classList.toggle('ns-project-list-actions', !!listMenu);
      }
    }
    const old = document.getElementById('ns-capsule-board-link');
    if (current === null || !data) { old?.remove(); return; }
    const title = document.querySelector('.controls .board-title'); if (!title) return;
    if (old?.parentElement === title && old.dataset.project === String(current)) return;
    old?.remove();
    const box = document.createElement('span'); box.id = 'ns-capsule-board-link'; box.dataset.project = String(current);
    const link = document.createElement('a'); link.className = 'ns-capsule-button';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('focusable', 'false');
    icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '1.7');
    const branches = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    branches.setAttribute('d', 'M7 12h6m0 0V5h3m-3 7h3m-3 0v7h3'); icon.append(branches);
    for (const [cx,cy,r] of [[4,12,3],[19,5,2.5],[19,12,2.5],[19,19,2.5]]) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(cx)); circle.setAttribute('cy', String(cy)); circle.setAttribute('r', String(r)); icon.append(circle);
    }
    const arrow = document.createElement('span'); arrow.className = 'ns-capsule-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
    link.append(icon, arrow); link.href = projectLink(data, current, location.origin);
    link.title = `Zur Projektmindmap: ${data.mindmapName}`;
    link.setAttribute('aria-label', `Zur Projektmindmap: ${data.mindmapName}`); box.append(link);
    const pending = Array.isArray(data.pendingCardIds) ? data.pendingCardIds.filter(id => Number.isSafeInteger(id) && id > 0) : [];
    if (pending.length) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'ns-capsule-pending';
      button.textContent = `Zuordnung offen (${pending.length})`;
      button.onclick = () => {
        const dialog = document.createElement('dialog'); dialog.className = 'ns-capsule-dialog';
        const h = document.createElement('h2'); h.textContent = 'Vorhandene Zuordnung prüfen'; dialog.append(h);
        const p = document.createElement('p'); p.textContent = 'Die vorhandenen Karten bleiben erhalten. Hier wird nur ihre Zuordnung geprüft und gegebenenfalls vervollständigt; keine zweite Karte angelegt.'; dialog.append(p);
        for (const cardId of pending) {
          const row = document.createElement('p'), retry = document.createElement('button'), result = document.createElement('span');
          retry.type = 'button'; retry.textContent = `Karte ${cardId} prüfen`; result.setAttribute('role', 'status');
          retry.onclick = async () => {
            retry.disabled = true;
            try {
              const response = await fetch(`${api}/boards/${current}/cards/${cardId}/resume`, { method: 'POST', credentials: 'same-origin', redirect: 'error', headers: { requesttoken: document.head.dataset.requesttoken, 'OCS-APIRequest': 'true' } });
              const out = await response.json();
              if (!response.ok) throw Error(`Zuordnung offen: ${typeof out.code === 'string' && /^[A-Z][A-Z0-9_:.-]{0,79}$/.test(out.code) ? out.code : 'NATIVE_RUNTIME_ERROR'}. Vorhandene Karte prüfen.`);
              result.textContent = out.state === 'linked' ? ' Zuordnung bestätigt.' : ' Bestehende andere Bindung erhalten.';
            } catch (e) { result.textContent = ` ${e.message}`; } // No automatic retry.
          };
          row.append(retry, result); dialog.append(row);
        }
        const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Schließen'; close.onclick = () => { dialog.close(); dialog.remove(); }; dialog.append(close);
        document.body.append(dialog); dialog.showModal();
      };
      box.append(button);
    }
    title.append(box);
  }
  function scan() {
    translate(document); watchFrames();
    const id = boardId(location.pathname, location.hash);
    if (id !== current) { current = id; generation++; data = null; loading = false; }
    paint(); if (current === null || data || loading) return;
    const ticket = generation; loading = true;
    fetch(`${api}/boards/${current}`, { credentials: 'same-origin', redirect: 'error', headers: { 'OCS-APIRequest': 'true' } })
      .then(async response => { if (!response.ok) return null; const value = await response.json(); projectLink(value, current, location.origin); return value; })
      .then(value => { if (ticket !== generation) return; data = value; paint(); })
      .catch(() => { /* A missing permission never turns into a guessed link. */ });
  }
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', scan); window.addEventListener('popstate', scan); scan();
})();
