(() => {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const pairs = object => Object.entries(object).sort(([a], [b]) => a.localeCompare(b));
  const key = value => JSON.stringify([value.enabled, pairs(value.apps), pairs(value.areas), value.catalogue, [...value.allowedTools].sort()]);
  const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
  function verifyReceipt(receipt, attempt, connectionId, visibleTools) {
    const p = receipt?.accessPolicy, f = p?.functions, wanted = attempt.selection;
    if (!p || !f || !p.apps || !f.areas || receipt.committed !== true
      || receipt.connectionId !== connectionId || receipt.requestId !== attempt.requestId
      || receipt.revision !== attempt.revision + 1 || !uuid(receipt.nextRequestId) || receipt.nextRequestId === attempt.requestId
      || p.version !== 2 || p.configured !== true || p.enabled !== (wanted.enabled === '1')
      || JSON.stringify(pairs(p.apps)) !== JSON.stringify(pairs(wanted.apps))
      || f.version !== 1 || f.catalogue !== wanted.catalogue || !Array.isArray(f.allowedTools)) return false;
    for (const [area, mode] of Object.entries(f.areas)) {
      if (mode !== (wanted.areas[area] ?? wanted.apps[area])) return false;
    }
    if (Object.keys(f.areas).length !== Object.keys(wanted.areas).length + Object.keys(wanted.apps).filter(a => a !== 'inventory').length) return false;
    const permitted = f.allowedTools.filter(n => visibleTools.includes(n)).sort();
    return JSON.stringify(permitted) === JSON.stringify([...wanted.allowedTools].sort());
  }
  function createSaveQueue(options) {
    const { read, send, confirm, onState, connectionId, visibleTools } = options;
    const schedule = options.schedule ?? setTimeout, cancel = options.cancel ?? clearTimeout;
    let revision = options.revision, requestId = options.requestId, saved = clone(read());
    let attempt = null, running = false, failed = null, stopped = false, timer = null;
    const dirty = () => attempt !== null || key(read()) !== key(saved);
    const clear = () => { if (timer !== null) { cancel(timer); timer = null; } };
    const state = (name, message = '') => onState(name, message);
    const later = () => { clear(); timer = schedule(() => { timer = null; void save(); }, options.delay ?? 500); state('pending'); };
    async function save(retry = false) {
      clear();
      if (running || stopped || (failed && !retry)) return;
      if (attempt === null) {
        if (key(read()) === key(saved)) { state('saved'); return; }
        attempt = { revision, requestId, selection: clone(read()) };
      }
      running = true; failed = null; state('saving');
      try {
        const receipt = await send(clone(attempt));
        if (!verifyReceipt(receipt, attempt, connectionId, visibleTools)) throw new Error('Speichern nicht bestätigt. Erneut versuchen.');
        confirm(receipt);
        saved = clone(attempt.selection); revision = receipt.revision; requestId = receipt.nextRequestId;
        attempt = null;
      } catch (error) {
        stopped = error?.outcome === 'conflict' || error?.outcome === 'denied';
        failed = error;
        state(stopped ? 'conflict' : 'error', error?.message || 'Speichern nicht bestätigt. Erneut versuchen.');
      } finally { running = false; }
      if (!failed) { if (dirty()) later(); else state('saved'); }
    }
    function changed() {
      if (stopped || failed) return;
      if (running) { state('saving'); return; }
      if (dirty()) later(); else { clear(); state('saved'); }
    }
    state('saved');
    return { changed, save: () => save(!!failed), dirty, running: () => running };
  }
  function readForm(form) {
    const data = new FormData(form), apps = {}, areas = {};
    for (const [name, value] of data) {
      const app = name.match(/^apps\[([a-zA-Z]+)\]$/), area = name.match(/^areas\[([a-zA-Z]+)\]$/);
      if (app) apps[app[1]] = value;
      if (area) areas[area[1]] = value;
    }
    return { enabled: data.get('enabled'), apps, areas, catalogue: data.get('catalogue'), allowedTools: data.getAll('allowedTools[]').sort() };
  }
  function encodeAttempt(attempt, requestToken) {
    const data = new URLSearchParams({ requesttoken: requestToken, revision: String(attempt.revision), requestId: attempt.requestId,
      enabled: attempt.selection.enabled, catalogue: attempt.selection.catalogue });
    for (const [name, value] of Object.entries(attempt.selection.apps)) data.append(`apps[${name}]`, value);
    for (const [name, value] of Object.entries(attempt.selection.areas)) data.append(`areas[${name}]`, value);
    for (const name of attempt.selection.allowedTools) data.append('allowedTools[]', name);
    return data;
  }
  async function sendAttempt(url, attempt, requestToken, fetcher = fetch) {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 20000);
    try {
      const response = await fetcher(url, { method: 'POST', credentials: 'same-origin', redirect: 'error', signal: abort.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: 'application/json', requesttoken: requestToken },
        body: encodeAttempt(attempt, requestToken) });
      let data;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok) {
        const error = new Error(typeof data?.message === 'string' ? data.message : 'Speichern nicht bestätigt. Sitzung oder Verbindung prüfen.');
        error.outcome = response.status === 409 ? 'conflict' : [401, 403, 404, 412].includes(response.status) ? 'denied' : 'unconfirmed';
        throw error;
      }
      return data;
    } catch (error) {
      if (error?.outcome) throw error;
      throw new Error('Keine bestätigte Antwort. Verbindung prüfen und erneut versuchen.');
    } finally { clearTimeout(timeout); }
  }
  function start() {
    const queues = [];
    for (const form of document.querySelectorAll('form.ns-access[data-autosave-url]')) {
      if (!form.dataset.autosaveUrl) continue;
      const button = form.querySelector('[data-save-button]'), label = form.querySelector('[data-save-status]');
      const bar = form.querySelector('[data-save-bar]'), reload = form.querySelector('[data-save-reload]');
      const queue = createSaveQueue({
        connectionId: form.dataset.connectionId,
        revision: Number(form.querySelector('input[name=revision]').value),
        requestId: form.querySelector('input[name=requestId]').value,
        visibleTools: [...form.querySelectorAll('input[name="allowedTools[]"]')].map(input => input.value),
        read: () => readForm(form),
        send: attempt => sendAttempt(form.dataset.autosaveUrl, attempt, form.querySelector('input[name=requesttoken]').value),
        confirm: receipt => {
          form.querySelector('input[name=revision]').value = receipt.revision;
          form.querySelector('input[name=requestId]').value = receipt.nextRequestId;
          const revokeRevision = form.closest('.ns-connection')?.querySelector('.ns-revoke input[name=revision]');
          if (revokeRevision) revokeRevision.value = receipt.revision;
          const connectionStatus = form.closest('.ns-connection')?.querySelector('[data-connection-status]');
          if (connectionStatus) connectionStatus.textContent = receipt.accessPolicy.enabled ? 'Verbindung eingeschaltet' : 'Hauptschalter ausgeschaltet';
          const off = [...form.querySelectorAll('[data-area-mode]')].filter(select => select.value === 'off')
            .map(select => form.querySelector(`label[for="${select.id}"]`)?.textContent.trim()).filter(Boolean);
          const disabledAreas = form.querySelector('[data-disabled-areas]');
          if (disabledAreas) disabledAreas.textContent = off.length ? off.join(', ') : 'keine zusätzlichen App-Sperren';
        },
        onState: (name, message) => {
          bar.dataset.state = name;
          label.textContent = name === 'saved' ? 'Gespeichert' : name === 'pending' || name === 'saving' ? 'Speichert …'
            : name === 'conflict' ? message : 'Nicht gespeichert – ' + message;
          button.hidden = name === 'saved' || name === 'conflict';
          button.disabled = name === 'saving';
          button.textContent = name === 'error' ? 'Erneut versuchen' : name === 'saving' ? 'Speichert …' : 'Jetzt speichern';
          reload.hidden = name !== 'conflict';
        },
      });
      queues.push(queue);
      form.addEventListener('change', () => queue.changed());
      form.addEventListener('submit', event => { event.preventDefault(); void queue.save(); });
    }
    if (queues.length) window.addEventListener('beforeunload', event => {
      if (queues.some(queue => queue.dirty())) { event.preventDefault(); event.returnValue = ''; }
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { createSaveQueue, verifyReceipt, encodeAttempt, sendAttempt };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})();
