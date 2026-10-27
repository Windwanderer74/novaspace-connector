// SPDX-License-Identifier: AGPL-3.0-or-later
import { locateNode, parseMindmap, serializeMindmap, type Mindmap } from './mindmap-core';

export type TaskContent = { version: 1; title: string; description: string };
const start = '<!-- nf-task-content:start -->', end = '<!-- nf-task-content:end -->';
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
export function taskTitle(value: string) {
  const title = value.trim().replace(/^[○◔◑◕●]\s+/u, '');
  if (!title || title.length > 240 || /[\r\n\u0000-\u001f]/u.test(title)) throw Error('Aufgabenname muss 1 bis 240 Zeichen lang sein.');
  return title;
}
export function taskDescription(value: string) {
  if (value.length > 16000 || value.includes('<!-- nf-')) throw Error('Aufgabenbeschreibung ist zu lang oder enthält reservierte Projektmarkierungen.');
  return value;
}
/** Locate exactly one managed section outside fenced examples; retain all other bytes. */
function section(text: string) {
  let fence: { char: string; size: number } | undefined, offset = 0;
  const markers: { kind: string; from: number; to: number }[] = [];
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const code = /^ {0,3}(`{3,}|~{3,})(.*)/.exec(line.trimEnd());
    if (fence) { if (code && code[1][0] === fence.char && code[1].length >= fence.size && !code[2].trim()) fence = undefined; }
    else if (code) fence = { char: code[1][0], size: code[1].length };
    else for (const marker of [start, end]) {
      const at = line.indexOf(marker);
      if (at >= 0) {
        if (line.trim() !== marker) throw Error('Aufgabenbeschreibung besitzt eine uneindeutige Bereichsgrenze.');
        markers.push({ kind: marker, from: offset + at, to: offset + at + marker.length });
      }
    }
    offset += line.length;
  }
  if (!markers.length) return undefined;
  if (markers.length !== 2 || markers[0].kind !== start || markers[1].kind !== end) throw Error('Aufgabenbeschreibung ist nicht eindeutig abgeschlossen.');
  const [a,b] = markers;
  const raw = text.slice(a.to,b.from);
  if (!raw.startsWith('\n') || !raw.endsWith('\n')) throw Error('Aufgabenbeschreibung besitzt ungültige Grenzen.');
  return { from:a.to, to:b.from, description:taskDescription(raw.slice(1,-1)) };
}
export function readTaskDescription(text: string) { return section(text)?.description ?? ''; }
export function writeTaskDescription(text: string, description: string) {
  taskDescription(description); const found = section(text);
  if (found) return text.slice(0,found.from) + '\n' + description + '\n' + text.slice(found.to);
  if (!description) return text;
  return text + (text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n') + '## Aufgabenbeschreibung\n\n' + start + '\n' + description + '\n' + end;
}
export function mapTaskContent(map: Mindmap, nodeId: string): TaskContent {
  const data=locateNode(map,nodeId).node.data, state=data.nfDeckSync as any;
  if (!record(state) || state.version !== 1 || typeof state.baseText !== 'string') throw Error('Aufgabe besitzt keine bestätigte Deck-Zuordnung.');
  const suffix = state.total ? ` · ${state.completed}/${state.total} · ${state.percent} %` : undefined;
  let title=data.text;
  if (suffix && title.endsWith(suffix)) title=title.slice(0,-suffix.length);
  else if (!state.total) for (const tail of [' · keine Bedingungen',' · keine Punkte',' · noch keine Ziele']) if (title.endsWith(tail)) {title=title.slice(0,-tail.length);break;}
  const content=data.nfTaskContent;
  if (content !== undefined && (!record(content) || content.version !== 1 || typeof content.description !== 'string')) throw Error('Ungültige gemeinsame Aufgabenbeschreibung.');
  return {version:1,title:taskTitle(title),description:taskDescription(content?.description ?? '')};
}
function merge(field: string, base: string, map: string, card: string) {
  if (map !== base && card !== base && map !== card) throw Error(`${field} wurde in Deck und Mindmap unterschiedlich geändert. Bitte Änderungen prüfen.`);
  return map !== base ? map : card;
}
/** Three-way content reconciliation. Local planning notes and all foreign fields survive. */
export function reconcileTaskContent(source: Mindmap, nodeId: string, title: string, description: string, explicit?: {title:string;description:string}) {
  const map=parseMindmap(serializeMindmap(source)), data=locateNode(map,nodeId).node.data, state=data.nfDeckSync as any;
  const current=mapTaskContent(map,nodeId);
  const old=state.content;
  if (old !== undefined && (!record(old) || old.version !== 1 || typeof old.title !== 'string' || typeof old.description !== 'string')) throw Error('Ungültiger gemeinsamer Ausgangsstand.');
  const baseline:TaskContent=old ?? {version:1,title:state.baseText,description:''};
  const card={title:taskTitle(title),description:readTaskDescription(description)};
  const next:TaskContent={version:1,title:merge('Aufgabenname',baseline.title,current.title,card.title),description:merge('Aufgabenbeschreibung',baseline.description,current.description,card.description)};
  // An explicit form is allowed only after the current two-sided state merged.
  if (explicit) {next.title=taskTitle(explicit.title);next.description=taskDescription(explicit.description);}
  data.nfTaskContent={version:1,description:next.description};
  data.nfDeckSync={...state,baseText:next.title,content:next};
  return {map,content:next,description:writeTaskDescription(description,next.description)};
}
