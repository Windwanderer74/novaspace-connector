// SPDX-License-Identifier: AGPL-3.0-or-later
/* NOVAFORGE Deck help for JSLoader 2.1.0 / Nextcloud 34.
 * Remove this script from JSLoader or disable JSLoader to roll back.
 * It reads no card data, sends no requests, and changes no Deck fields.
 */
(() => {
  'use strict';

  // Match every numeric board ID, including boards created in the future.
  const boardPath = /\/apps\/deck\/(?:board\/|#\/board\/)(\d+)(?:\/|#|$)/;
  if (!/\/apps\/deck(?:\/|$)/.test(location.pathname)) return;
  const tagGuide = 'https://docs.example.invalid/guide';
  const knownTutorialBoards = new Set(['5', '8', '9', '10', '14', '16', '18']);
  const columnGuides = {
    Neu: 'https://docs.example.invalid/guide',
    Wartend: 'https://docs.example.invalid/guide',
    'In Arbeit': 'https://docs.example.invalid/guide',
    'Zu prüfen': 'https://docs.example.invalid/guide',
  };
  const texts = {
    Neu: 'Hier starten neue Deckkarten, deren Bearbeitung noch nicht begonnen hat.',
    Wartend: 'Hier warten Deckkarten auf eine Antwort oder Vorarbeit, bevor es weitergeht.',
    'In Arbeit': 'Hier liegen Deckkarten, an denen gerade aktiv gearbeitet wird.',
    'Zu prüfen': 'Hier liegt das Ergebnis zur abschließenden Prüfung. Passt es, kann die Karte als erledigt markiert werden.',
    Tags: 'Schlagworte markieren Eilt, Zeitnah oder eine offene Einordnung. Ohne Schlagwort läuft die Karte normal.',
    Datum: 'Ein Datum hilft bei einer echten Frist oder geplanten Wiedervorlage.',
    Erledigt: 'Wenn das Ergebnis geprüft und abgeschlossen ist, markiere die Karte als erledigt.',
  };
  function helpLabel(topic) {
    if (['Neu', 'Wartend', 'In Arbeit', 'Zu prüfen'].includes(topic)) return 'Hilfe zur Spalte ' + topic;
    return topic === 'Tags' ? 'Hilfe zu Schlagworten' : 'Hilfe zu ' + topic;
  }

  const id = 'nf-deck-help-pilot';
  let activeButton = null;
  let panel = null;

  function onBoard() {
    return boardPath.test(location.pathname + location.hash);
  }

  function currentBoardId() {
    return (location.pathname + location.hash).match(boardPath)?.[1];
  }

  function closeHelp(restoreFocus = false) {
    if (!panel) return;
    panel.remove();
    panel = null;
    if (activeButton) {
      activeButton.setAttribute('aria-expanded', 'false');
      if (restoreFocus && activeButton.isConnected) activeButton.focus();
    }
    activeButton = null;
  }

  function openHelp(button, topic) {
    if (activeButton === button) {
      closeHelp(true);
      return;
    }
    closeHelp();
    const box = document.createElement('div');
    box.className = 'nf-deck-help-panel';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', helpLabel(topic));
    box.tabIndex = -1;

    const title = document.createElement('strong');
    title.textContent = ['Neu', 'Wartend', 'In Arbeit', 'Zu prüfen'].includes(topic) ? 'Spalte ' + topic : topic === 'Tags' ? 'Schlagworte' : topic;
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'nf-deck-help-close';
    dismiss.setAttribute('aria-label', 'Hilfe schließen');
    dismiss.textContent = '×';
    dismiss.addEventListener('click', () => closeHelp(true));
    const body = document.createElement('p');
    const knownBoard = knownTutorialBoards.has(currentBoardId());
    const tagGuideAvailable = topic === 'Tags' && knownBoard;
    const guideUrl = tagGuideAvailable ? tagGuide : knownBoard ? columnGuides[topic] : undefined;
    body.textContent = topic === 'Tags' && !tagGuideAvailable
      ? 'Schlagworte können je Board verschieden sein. Schau dir die Auswahl dieses Boards an.'
      : texts[topic];
    box.append(title, dismiss, body);
    if (guideUrl) {
      const more = document.createElement('a');
      more.href = guideUrl;
      more.target = '_blank';
      more.rel = 'noopener noreferrer';
      const guideTitle = topic === 'Tags' ? 'Schlagworte' : 'Spalte ' + topic;
      more.textContent = 'Zum Tutorial: ' + guideTitle + ' ↗';
      more.setAttribute('aria-label', 'Zum Tutorial: ' + guideTitle + ' (öffnet in neuem Tab)');
      box.append(more);
    }
    document.body.append(box);

    const rect = button.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    box.style.width = `${width}px`;
    box.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    const below = rect.bottom + 8;
    box.style.top = `${below + box.offsetHeight <= window.innerHeight - 12
      ? below : Math.max(12, rect.top - box.offsetHeight - 8)}px`;
    activeButton = button;
    panel = box;
    button.setAttribute('aria-expanded', 'true');
    dismiss.focus();
  }

  function addHelp(anchor, topic) {
    if (!anchor?.parentElement || !texts[topic]) return;
    const next = anchor.nextElementSibling;
    if (next?.classList.contains('nf-deck-help-trigger') && next.dataset.topic === topic) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nf-deck-help-trigger';
    button.dataset.topic = topic;
    button.textContent = '?';
    button.setAttribute('aria-label', helpLabel(topic));
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.title = helpLabel(topic);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openHelp(button, topic);
    });
    anchor.insertAdjacentElement('afterend', button);
  }

  function mount() {
    if (!onBoard()) {
      closeHelp();
      document.querySelectorAll('.nf-deck-help-trigger').forEach(el => el.remove());
      return;
    }
    for (const heading of document.querySelectorAll('main .stack__header h3.stack__title')) {
      const topic = heading.textContent.trim();
      if (texts[topic]) addHelp(heading, topic);
    }
    // Nextcloud's card dialog has no aria-label attribute in the live UI.
    // Locate it by a control unique to card details; other dialogs may be open.
    const card = document.querySelector('[role="dialog"] [data-test="tag-selector"]')?.closest('[role="dialog"]');
    if (!card) return;
    addHelp(card.querySelector('[data-test="tag-selector"]'), 'Tags');
    addHelp(card.querySelector('[data-cy-due-date-actions]'), 'Datum');
    addHelp(card.querySelector('button.completed-button'), 'Erledigt');
  }

  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    button.nf-deck-help-trigger {
      appearance: none !important; position: relative; isolation: isolate;
      flex: 0 0 36px; display: inline-grid !important; place-items: center;
      box-sizing: border-box; width: 36px !important; height: 36px !important;
      min-width: 36px !important; min-height: 36px !important;
      margin: 0 2px; padding: 0 !important; border: 0 !important;
      border-radius: 50% !important; background: transparent !important;
      color: #eaf6ff !important; font: 700 14px/1 sans-serif !important;
      text-shadow: 0 1px 1px #194260, 0 -1px 0 rgba(255,255,255,.55);
      cursor: pointer;
    }
    button.nf-deck-help-trigger::before {
      content: ''; position: absolute; z-index: -1;
      width: 20px; height: 20px; border: 1px solid #c5d3dc; border-radius: 50%;
      background: radial-gradient(circle at 36% 20%, #82bee1 0%, #267eb3 42%, #075886 78%, #003c63 100%);
      box-shadow: inset 0 1px 1px rgba(255,255,255,.85), inset 0 -2px 3px rgba(0,22,42,.5), 0 1px 2px rgba(0,0,0,.42);
    }
    button.nf-deck-help-trigger:hover::before { filter: brightness(1.13); }
    button.nf-deck-help-trigger:focus-visible { outline: 2px solid var(--color-primary-element, #0066cc) !important; outline-offset: 1px; }
    @media (pointer: coarse) {
      button.nf-deck-help-trigger { flex-basis: 40px; width: 40px !important; height: 40px !important; min-width: 40px !important; min-height: 40px !important; }
    }
    .nf-deck-help-panel {
      position: fixed; z-index: 100000; box-sizing: border-box;
      max-height: calc(100vh - 24px); overflow: auto;
      padding: 14px; border: 1px solid var(--color-border-dark, #777);
      border-radius: 8px; box-shadow: 0 5px 18px rgba(0,0,0,.22);
      background: var(--color-main-background, #fff);
      color: var(--color-main-text, #222); line-height: 1.45;
    }
    .nf-deck-help-panel strong { display: block; padding-right: 36px; }
    .nf-deck-help-panel p { margin: 8px 0; }
    .nf-deck-help-panel a { display: inline-block; text-decoration: underline; text-underline-offset: 2px; font-weight: 600; }
    .nf-deck-help-close {
      position: absolute; top: 5px; right: 5px; box-sizing: border-box;
      display: inline-grid !important; place-items: center;
      width: 32px !important; height: 32px !important;
      min-width: 32px !important; min-height: 32px !important;
      padding: 0 !important; border: 0 !important; border-radius: 50% !important;
      background: transparent !important; color: var(--color-main-text, #222) !important;
      font: 400 23px/1 sans-serif !important; cursor: pointer;
    }
    .nf-deck-help-close:hover { background: rgba(100,150,180,.14) !important; }
    .nf-deck-help-close:focus-visible, .nf-deck-help-panel a:focus-visible {
      outline: 2px solid var(--color-primary-element, #0066cc);
    }
  `;
  document.head.append(style);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel) {
      event.stopPropagation();
      closeHelp(true);
    }
  });
  document.addEventListener('pointerdown', event => {
    if (panel && !panel.contains(event.target) && !activeButton?.contains(event.target)) closeHelp();
  });
  window.addEventListener('scroll', () => closeHelp(), true);
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
  mount();
})();

/* NOVAFORGE Calendar month navigation / Nextcloud 34.
 * Scoped to the Calendar month view; removing this block rolls it back.
 * No data is read or sent, and event creation remains in Nextcloud.
 */
(() => {
  'use strict';
  if (!/\/apps\/calendar(?:\/|$)/.test(location.pathname)) return;
  const id = 'nf-calendar-month-ux';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = String.raw`
    main .fc-dayGridMonth-view .fc-daygrid-day-top {
      display: flex; flex-direction: row; padding: 3px 4px 0;
    }
    main .fc-dayGridMonth-view .fc-daygrid-day-top a[data-navlink] {
      box-sizing: border-box; display: flex; flex: 1 1 auto;
      align-items: center; justify-content: space-between; min-width: 0;
      min-height: 36px; padding: 5px 8px; border-radius: 7px;
      color: var(--color-main-text, #222);
      background: var(--color-background-hover, #f0f5f8);
      font-weight: 600; text-decoration: none; cursor: pointer;
    }
    main .fc-dayGridMonth-view .fc-daygrid-day-top a[data-navlink]::after {
      content: 'Tag ansehen ›'; margin-left: 3px;
      font-size: 11px; font-weight: 500; white-space: nowrap; opacity: .8;
    }
    main .fc-dayGridMonth-view .fc-day-today .fc-daygrid-day-top a[data-navlink] {
      color: var(--color-primary-element-text, #fff);
      background: var(--color-primary-element, #00679e);
    }
    main .fc-dayGridMonth-view .fc-daygrid-day-top a[data-navlink]:hover {
      box-shadow: inset 0 0 0 2px var(--color-primary-element, #00679e);
    }
    main .fc-dayGridMonth-view .fc-daygrid-day-top a[data-navlink]:focus-visible {
      outline: 2px solid var(--color-primary-element, #00679e);
      outline-offset: 2px;
    }
    main .fc-dayGridMonth-view .fc-daygrid-day-frame::after {
      content: '+ Termin'; position: absolute; right: 7px; bottom: 5px;
      pointer-events: none; z-index: 1; padding: 2px 5px;
      border-radius: 5px; background: var(--color-main-background, #fff);
      color: var(--color-text-maxcontrast, #555); font: 500 11px/1.3 sans-serif;
      opacity: .85;
    }
    @media (max-width: 850px) {
      main .fc-dayGridMonth-view .fc-daygrid-day-top { padding: 2px 2px 0; }
      main .fc-dayGridMonth-view .fc-daygrid-day-top a[data-navlink] {
        min-height: 44px; padding: 4px; justify-content: center;
      }
      main .fc-dayGridMonth-view .fc-daygrid-day-top a[data-navlink]::after { content: '›'; }
      main .fc-dayGridMonth-view .fc-daygrid-day-frame::after {
        right: 2px; bottom: 2px; padding: 1px 2px; font-size: 10px;
      }
    }
    @media (max-width: 580px) {
      main .fc-dayGridMonth-view .fc-daygrid-day-frame::after { content: '+ Termin'; }
    }
  `;
  document.head.append(style);
  const mount = () => {
    const view = document.querySelector('main .fc-dayGridMonth-view');
    if (!view) return;
    for (const cell of view.querySelectorAll('td.fc-daygrid-day[data-date]')) {
      const link = cell.querySelector('.fc-daygrid-day-top a[data-navlink]');
      const date = cell.dataset.date;
      if (!link || !date || link.dataset.nfCalendarDay === date) continue;
      const parts = date.split('-').map(Number);
      const label = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full' })
        .format(new Date(parts[0], parts[1] - 1, parts[2]));
      link.setAttribute('aria-label', 'Tagesansicht für ' + label + ' öffnen');
      link.title = 'Tagesansicht für ' + label + ' öffnen';
      link.dataset.nfCalendarDay = date;
    }
  };
  new MutationObserver(mount).observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
  mount();
})();