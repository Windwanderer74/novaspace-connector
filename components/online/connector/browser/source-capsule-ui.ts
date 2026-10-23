// SPDX-License-Identifier: AGPL-3.0-or-later
import { registerFileAction, FileType } from '@nextcloud/files';
import { parseMindmap, type MindmapNode } from '../lib/mindmap-core';
import { createSourceCapsuleClient, type FileMeta } from './source-capsule-client';

(() => {
  if (!/\/apps\/files(?:\/|$)/.test(location.pathname)) return;
  const uid = document.head.dataset.user, token = document.head.dataset.requesttoken;
  if (!uid || !token) return;
  const client = createSourceCapsuleClient(uid, token);
  const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2"><path d="M7 12h6m0 0v-7h4m-4 7v7h4"/><circle cx="4" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/></g></svg>';
  registerFileAction({
    id: 'novaforge-source-capsule', displayName: () => 'In Mindmap aufnehmen', iconSvgInline: () => icon, order: 35,
    enabled: ({ nodes }) => nodes.length === 1 && [FileType.File, FileType.Folder].includes(nodes[0].type) && !!(nodes[0].permissions & 1),
    exec: async ({ nodes }) => {
      if (document.getElementById('nf-source-capsule-dialog')) return null;
      const selected = nodes[0], folderSource = selected.type === FileType.Folder;
      const sourcePath = folderSource ? selected.path.replace(/\/$/, '') || '/' : selected.path;
      const dialog = document.createElement('dialog'); dialog.id = 'nf-source-capsule-dialog'; dialog.setAttribute('aria-labelledby', 'nf-source-capsule-heading');
      dialog.style.cssText = 'position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;padding:24px;border:1px solid var(--color-border-dark,#819096);border-radius:12px;background:var(--color-main-background,#fff);color:var(--color-main-text,#17232a);font:15px/1.5 sans-serif';
      const heading = document.createElement('h2'); heading.id = 'nf-source-capsule-heading'; heading.textContent = `${folderSource ? 'Ordner' : 'Datei'} in Mindmap aufnehmen`;
      const intro = document.createElement('p'); intro.textContent = `Quelle: ${selected.basename}. Wähle die Mindmap für deine Grundkapsel.`;
      const form = document.createElement('form'); form.style.cssText = 'display:grid;gap:12px';
      const field = (name: string, el: HTMLInputElement | HTMLSelectElement) => { const l = document.createElement('label'); l.textContent = name; l.style.cssText = 'display:grid;gap:4px'; el.setAttribute('aria-label', name); el.style.cssText = 'width:100%;box-sizing:border-box;min-height:40px'; l.append(el); return l; };
      const folder = document.createElement('input'); folder.value = (folderSource ? sourcePath : selected.dirname) || '/'; folder.required = true;
      const maps = document.createElement('select'), parents = document.createElement('select'); maps.required = true; parents.required = true;
      const title = document.createElement('input'); title.value = (folderSource ? selected.basename : selected.basename.replace(/\.[^.]+$/, '') || selected.basename).replace(/_/g, ' '); title.maxLength = 240; title.required = true;
      const load = document.createElement('button'); load.type = 'button'; load.textContent = 'Mindmaps anzeigen';
      const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Grundkapsel aufnehmen und öffnen'; submit.disabled = true;
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Abbrechen'; cancel.onclick = () => dialog.remove();
      const feedback = document.createElement('p'); feedback.setAttribute('role', 'status'); feedback.style.margin = '0';
      form.append(field('Ordner der Mindmap', folder), load, field('Ziel-Mindmap', maps), field('Übergeordneter Knoten', parents), field('Name der Grundkapsel', title), submit, cancel, feedback); dialog.append(heading, intro, form);
      document.body.append(dialog); dialog.showModal();
      let source: FileMeta | undefined, base: Awaited<ReturnType<typeof client.map>> | undefined, sequence = 0, saving = false;
      const capsuleId = `capsule_${crypto.randomUUID().replaceAll('-', '')}`, documentNodeId = `${capsuleId}:source`;
      const option = (value: string, label: string) => { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; };
      const loadMap = async () => {
        const generation = ++sequence; submit.disabled = true; base = undefined; parents.replaceChildren(); feedback.textContent = 'Mindmap wird gelesen …';
        try { const read = await client.map(maps.value); if (generation !== sequence || !dialog.isConnected) return;
          const map = parseMindmap(read.text); const visit = (node: MindmapNode, depth: number) => { if (!node.data.nfDeckSync && !node.data.nfDeckChecklistOwner && !node.data.nfSource) parents.append(option(node.data.id, `${'· '.repeat(Math.min(depth, 3))}${node.data.text}`)); node.children?.forEach(n => visit(n, depth + 1)); }; visit(map.root, 0);
          base = read; submit.disabled = !source || !parents.options.length; feedback.textContent = folderSource ? 'Der Verweis öffnet den Ordner mit seinem aktuellen Inhalt. Ein vorhandener Verweis wird wiederverwendet.' : 'Der Verweis öffnet die Originaldatei. Ein vorhandener Verweis wird wiederverwendet.';
        } catch (e) { if (generation === sequence) feedback.textContent = e instanceof Error ? e.message : 'Mindmap konnte nicht gelesen werden.'; }
      };
      const loadMaps = async () => { const generation = ++sequence; submit.disabled = true; base = undefined; maps.replaceChildren(); parents.replaceChildren(); load.disabled = true; feedback.textContent = 'Mindmaps werden gesucht …';
        try { const entries = await client.listMaps(folder.value.trim().replace(/\/$/, '') || '/'); if (generation !== sequence || !dialog.isConnected) return;
          for (const entry of entries) if (folderSource || entry.fileId !== String(selected.id)) maps.append(option(entry.path, entry.path.split('/').pop()!));
          if (!maps.options.length) { feedback.textContent = 'Hier liegt keine passende bearbeitbare Mindmap. Trage den Ordner einer anderen bestehenden Mindmap ein.'; return; } await loadMap();
        } catch (e) { feedback.textContent = e instanceof Error ? e.message : 'Ordner konnte nicht gelesen werden.'; } finally { load.disabled = false; }
      };
      load.onclick = () => { if (!saving) void loadMaps(); }; maps.onchange = () => { if (!saving) void loadMap(); };
      folder.oninput = () => { ++sequence; base = undefined; submit.disabled = true; maps.replaceChildren(); parents.replaceChildren(); };
      form.onsubmit = async event => { event.preventDefault(); if (saving || !base || !source) return; saving = true; form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select').forEach(e => e.disabled = true); feedback.textContent = 'Grundkapsel wird gespeichert …';
        try { const result = await client.save(maps.value, base, { parentId: parents.value, capsuleId, documentNodeId, title: title.value, source: { path: sourcePath, fileId: source.fileId, etag: source.etag, kind: folderSource ? 'folder' : 'file' }, sourceUrl: `${location.origin}/index.php/f/${source.fileId}` });
          feedback.textContent = result.unchanged ? 'Der vorhandene Quellenzweig wird geöffnet.' : 'Grundkapsel und Quellenverweis sind gespeichert.';
          location.assign(`/index.php/apps/files/files/${result.fileId}?dir=${encodeURIComponent(maps.value.slice(0, maps.value.lastIndexOf('/')) || '/')}&editing=false&openfile=true`);
        } catch (e) { feedback.setAttribute('role', 'alert'); feedback.textContent = `${e instanceof Error ? e.message : 'Speichern nicht bestätigt.'} Schließe diesen Einstieg und prüfe den gespeicherten Stand.`; cancel.disabled = false; }
      };
      try { source = await client.stat(sourcePath); if (source.fileId !== String(selected.id) || source.directory !== folderSource || !source.permissions.includes('G') || source.downloadDenied) throw Error('Ausgewählte Quelle oder Leserecht nicht bestätigt.'); await loadMaps(); }
      catch (e) { feedback.textContent = e instanceof Error ? e.message : 'PDF konnte nicht geprüft werden.'; }
      return null;
    },
  });
})();
