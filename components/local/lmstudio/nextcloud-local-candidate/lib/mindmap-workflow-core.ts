// SPDX-License-Identifier: AGPL-3.0-or-later
import { mindmapPath } from './mindmap-core';
import { canonicalChecklistBoundary, parseDeckChecklist } from './mindmap-deck-core';

export type CardMindmapBinding = { version: 1; path: string; fileId: string; nodeId: string; checklistId: string };
function parseBinding(value: unknown): CardMindmapBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültige Mindmap-Zuordnung.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 5 || data.version !== 1 || typeof data.path !== 'string' || data.path.length < 2 || data.path.length > 2048 || typeof data.fileId !== 'string' || !/^\d+$/.test(data.fileId) || typeof data.nodeId !== 'string' || !data.nodeId.length || data.nodeId.length > 255 || typeof data.checklistId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(data.checklistId)) throw new Error('Ungültige Mindmap-Zuordnung.');
  return data as CardMindmapBinding;
}

/** Explicit opt-in, independent of the visible title symbol. */
export function cardMindmapBinding(description: string): CardMindmapBinding | null {
  description=canonicalWorkflowMetadata(description);
  const markers: string[] = []; let fence: { char: string; size: number } | null = null;
  for (const line of description.replace(/\r\n?/g, '\n').split('\n')) {
    const code = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) { if (code && code[1][0] === fence.char && code[1].length >= fence.size && !code[2].trim()) fence = null; continue; }
    if (code) { fence = { char: code[1][0], size: code[1].length }; continue; }
    if (line.trim().startsWith('<!-- nf-mindmap:')) {
      const match = /^<!-- nf-mindmap:(\{.*\}) -->$/.exec(line.trim());
      if (!match) throw new Error('Ungültige Mindmap-Zuordnung auf der Karte. Keine Änderung.');
      markers.push(match[1]);
    }
  }
  if (!markers.length) return null;
  if (markers.length !== 1) throw new Error('Mehrere Mindmap-Zuordnungen auf der Karte. Keine Änderung.');
  const binding = parseBinding(JSON.parse(markers[0]));
  mindmapPath(binding.path); return binding;
}

export function deckProgressTitle(title: string, total: number, completed: number) {
  if (!Number.isInteger(total) || !Number.isInteger(completed) || total < 0 || completed < 0 || completed > total) throw new Error('Ungültiger Aufgabenstand.');
  const ratio = total ? completed / total : 0;
  const symbol = total && completed === total ? '●' : ratio >= .75 ? '◕' : ratio >= .5 ? '◑' : ratio >= .25 ? '◔' : '○';
  const base = title.replace(/^[○◔◑◕●]\s+/u, '');
  const result = `${symbol} ${base}`;
  if (!base.trim() || result.length > 255) throw new Error('Kartentitel mit Fortschrittssymbol überschreitet die erlaubte Länge.');
  return result;
}

/** New plain checkbox lines get hidden IDs; existing uniquely matching rows keep theirs. */
export function normalizeWorkflowChecklist(description: string, checklistId: string, previous: string) {
  description = canonicalChecklistBoundary(description, checklistId);
  const previousItems = parseDeckChecklist(previous, checklistId);
  const byText = new Map<string, string[]>();
  for (const item of previousItems) byText.set(item.text, [...(byText.get(item.text) ?? []), item.id]);
  const used = new Set([...description.matchAll(/<!-- nf-task:([a-zA-Z0-9_-]{1,64}) -->/g)].map(m => m[1]));
  let active = false; let fence: { char: string; size: number } | null = null;
  const normalized = description.replace(/\r\n?/g, '\n').split('\n').map(line => {
    const code = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) { if (code && code[1][0] === fence.char && code[1].length >= fence.size && !code[2].trim()) fence = null; return line; }
    if (code) { if (active) throw new Error('Codeblock innerhalb der Arbeitscheckliste ist nicht zulässig.'); fence = { char: code[1][0], size: code[1].length }; return line; }
    if (line.trim() === `<!-- nf-checklist:${checklistId}:start -->`) { active = true; return line; }
    if (line.trim() === `<!-- nf-checklist:${checklistId}:end -->`) { active = false; return line; }
    if (!active || !line.trim() || /<!-- nf-task:/.test(line)) return line;
    const match = /^ {0,3}[-*+] \[([ xX])\] (.+?)\s*$/.exec(line);
    if (!match || match[2].includes('<!--')) return line;
    const available = (byText.get(match[2].trim()) ?? []).filter(id => !used.has(id));
    if (available.length > 1) throw new Error('Mehrdeutiger Aufgabenpunkt ohne Kennung. Keine Änderung.');
    const id = available[0] ?? `task_${crypto.randomUUID().replaceAll('-', '')}`; used.add(id);
    return `${line.trimEnd()} <!-- nf-task:${id} -->`;
  }).join('\n');
  parseDeckChecklist(normalized, checklistId); return normalized;
}

/** Rich editors can join adjacent metadata comments in one paragraph. */
export function canonicalWorkflowMetadata(description:string) {
  let fence:{char:string;size:number}|null=null;
  return description.replace(/\r\n?/g,'\n').split('\n').map(line=>{
    const code=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if(fence){if(code&&code[1][0]===fence.char&&code[1].length>=fence.size&&!code[2].trim())fence=null;return line;}
    if(code){fence={char:code[1][0],size:code[1].length};return line;}
    if(/^\s*<!-- nf-(?:mindmap|conditions):\{.*\} -->(?:\s+<!-- nf-(?:mindmap|conditions):\{.*\} -->)*\s*$/.test(line))return line.trim().replace(/ -->\s+<!-- nf-/g,' -->\n\n<!-- nf-');
    return line;
  }).join('\n');
}

export type ConditionListDefinition = { id: string; title: string };
const conditionMarker = (lists: ConditionListDefinition[]) => `<!-- nf-conditions:${JSON.stringify({ version: 1, lists })} -->`;
export function outsideMarkers(description: string, prefix: string) {
  const found: {raw:string; start:number; end:number}[] = []; let fence: {char:string; size:number}|null=null, offset=0;
  for (const line of description.split('\n')) {
    const code=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) { if(code && code[1][0]===fence.char && code[1].length>=fence.size && !code[2].trim()) fence=null; }
    else if(code) fence={char:code[1][0],size:code[1].length};
    else if(line.trim().startsWith(prefix)) { const raw=line.trim(); const start=offset+line.indexOf(raw); found.push({raw,start,end:start+raw.length}); }
    offset+=line.length+1;
  }
  return found;
}
export function conditionListDefinitions(description: string, binding: CardMindmapBinding): ConditionListDefinition[] | null {
  const found = outsideMarkers(canonicalWorkflowMetadata(description),'<!-- nf-conditions:').map(marker=>{
    const match=/^<!-- nf-conditions:(\{.*\}) -->$/.exec(marker.raw);
    if(!match) throw Error('Ungültige Bedingungslisten-Zuordnung.'); return match[1];
  });
  if (!found.length) return null;
  if (found.length !== 1) throw Error('Mehrere Bedingungslisten-Zuordnungen.');
  const data = JSON.parse(found[0]);
  if (!data || data.version !== 1 || Object.keys(data).length !== 2 || !Array.isArray(data.lists) || !data.lists.length || data.lists.length > 10) throw Error('Ungültiger Bedingungslistenbestand.');
  const ids = new Set<string>();
  for (const list of data.lists) {
    if (!list || Object.keys(list).length !== 2 || typeof list.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(list.id) || ids.has(list.id) || typeof list.title !== 'string' || !list.title.trim() || list.title.length > 120 || /[\r\n]|<!--/.test(list.title)) throw Error('Ungültige oder doppelte Bedingungsliste.');
    ids.add(list.id);
  }
  if (data.lists[0].id !== binding.checklistId) throw Error('Die erste Bedingungsliste bestätigt die Kartenbindung nicht.');
  return data.lists;
}
export function workflowLists(description: string, binding: CardMindmapBinding) {
  const definitions = conditionListDefinitions(description, binding);
  if (!definitions) return undefined;
  const ids = new Set<string>();
  return definitions.map(list => ({ ...list, items: parseDeckChecklist(description, list.id).map(item => {
    if (ids.has(item.id)) throw Error('Eine Bedingung besitzt mehrere Listenzuordnungen.');
    ids.add(item.id); return item;
  }) }));
}
export function workflowItems(description: string, binding: CardMindmapBinding) {
  const lists = workflowLists(description, binding);
  return lists ? lists.flatMap(list => list.items.map(item => ({ ...item, listId: list.id }))) : parseDeckChecklist(description, binding.checklistId);
}
export function normalizeCardWorkflow(description: string, binding: CardMindmapBinding, previous: string) {
  description=canonicalWorkflowMetadata(description);previous=canonicalWorkflowMetadata(previous);
  const definitions = conditionListDefinitions(description, binding);
  const oldDefinitions = conditionListDefinitions(previous, binding);
  if (oldDefinitions && !definitions) throw Error('Bedingungslisten-Zuordnung darf nicht entfernt werden.');
  if (!definitions) return normalizeWorkflowChecklist(description, binding.checklistId, previous);
  if (oldDefinitions?.some(list => !definitions.some(next => next.id === list.id))) throw Error('Bedingungslisten nicht stillschweigend entfernen.');
  for (const list of definitions) {
    let old = previous;
    if (list.id !== binding.checklistId && !oldDefinitions?.some(l => l.id === list.id)) old = `<!-- nf-checklist:${list.id}:start -->\n<!-- nf-checklist:${list.id}:end -->`;
    description = normalizeWorkflowChecklist(description, list.id, old);
  }
  workflowItems(description, binding); return description;
}
export function conditionSection(list: ConditionListDefinition, items: import('./mindmap-deck-core').ChecklistItem[]) {
  return `## ${list.title}\n\n<!-- nf-checklist:${list.id}:start -->\n${items.map(item => `- [${item.done ? 'x' : ' '}] ${item.text} <!-- nf-task:${item.id} -->`).join('\n')}\n<!-- nf-checklist:${list.id}:end -->`;
}
export function newConditionDescription(binding: CardMindmapBinding, items: import('./mindmap-deck-core').ChecklistItem[]) {
  const list = { id: binding.checklistId, title: 'Bedingungen' };
  const description = `<!-- nf-mindmap:${JSON.stringify(binding)} -->\n\n${conditionMarker([list])}\n\n${conditionSection(list, items)}`;
  workflowItems(description, binding); return description;
}
/** An explicit editor operation; preserve the card's unrelated prose and existing IDs. */
export function replaceConditionList(description: string, binding: CardMindmapBinding, list: ConditionListDefinition, items: import('./mindmap-deck-core').ChecklistItem[]) {
  description=canonicalWorkflowMetadata(description);
  const definitions = conditionListDefinitions(description, binding);
  if (!definitions) throw Error('Zuerst eine gebundene Bedingungsliste verwenden.');
  const previous = definitions.find(l => l.id === list.id);
  if (!previous) throw Error('Bedingungsliste nicht gefunden.');
  description = canonicalChecklistBoundary(description, list.id);
  const start = `<!-- nf-checklist:${list.id}:start -->`, end = `<!-- nf-checklist:${list.id}:end -->`;
  const starts=outsideMarkers(description,start), ends=outsideMarkers(description,end);
  if(starts.length!==1 || ends.length!==1 || ends[0].start<starts[0].end) throw Error('Bedingungsbereich nicht eindeutig.');
  const a=starts[0].start,b=ends[0].end;
  const rows = conditionSection(list, items).slice(conditionSection(list, items).indexOf(start));
  const prefix=description.slice(0,a), heading=`## ${previous.title}`;
  const pos=prefix.lastIndexOf(heading+'\n');
  const changedPrefix=pos>=0 && !prefix.slice(pos+heading.length).trim() ? prefix.slice(0,pos)+`## ${list.title}`+prefix.slice(pos+heading.length) : prefix;
  description=changedPrefix+rows+description.slice(b);
  const marker=outsideMarkers(description,'<!-- nf-conditions:')[0];
  const next=definitions.map(l=>l.id===list.id?{id:list.id,title:list.title}:l);
  description=description.slice(0,marker.start)+conditionMarker(next)+description.slice(marker.end);
  workflowItems(description, binding); return description;
}
export function addConditionList(description: string, binding: CardMindmapBinding, list: ConditionListDefinition) {
  description=canonicalWorkflowMetadata(description);
  let definitions = conditionListDefinitions(description, binding);
  if (!definitions) {
    // Explicit conversion keeps the existing leading checklist and every checkbox unchanged.
    definitions = [{ id: binding.checklistId, title: 'Bedingungen' }];
    parseDeckChecklist(description, binding.checklistId);
    description = conditionMarker(definitions) + '\n\n' + description;
  }
  if (definitions.some(l => l.id === list.id)) throw Error('Bedingungslistenkennung bereits vergeben.');
  const next = [...definitions, list];
  const marker=outsideMarkers(description,'<!-- nf-conditions:')[0];
  description=description.slice(0,marker.start)+conditionMarker(next)+description.slice(marker.end)+'\n\n'+conditionSection(list, []);
  workflowItems(description, binding); return description;
}
