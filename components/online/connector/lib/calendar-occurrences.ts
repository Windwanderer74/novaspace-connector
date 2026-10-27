// SPDX-License-Identifier: AGPL-3.0-or-later
import ICAL from 'ical.js';
import { nextcloudAccount, safeDavPath } from './nextcloud-read';
import { calendarPath, fullCalendarAccess, readCalendarSettingsAt } from './calendar-settings';
import { calendarWriteInternals as dav } from './calendar-write';
import { calendarObjectInternals as object } from './calendar-series';
import { calendarLocalTime, planningInstant } from './calendar-planning';
import { planningVersion } from './planning-json';
import { realDate } from './groupware-codec';

const key = (l: string) => l.split(/[;:]/, 1)[0].toUpperCase();
const value = (l: string) => l.slice(l.indexOf(':') + 1);
type Parsed = ReturnType<typeof object.structure>;
type Block = Parsed['events'][number];
type Checked = ReturnType<typeof object.editable>;
const clone = (c: ICAL.Component) => new ICAL.Component(structuredClone(c.toJSON()));
function unambiguous(instant: number, zone: string | undefined) {
  if (!zone || zone === 'UTC') return;
  const local = calendarLocalTime(instant, zone).slice(0, 19), offsets = new Set<number>();
  for (const hours of [-48, -24, 0, 24, 48]) {
    const raw = calendarLocalTime(instant + hours * 3600000, zone).slice(-6);
    offsets.add((raw[0] === '-' ? -1 : 1) * (Number(raw.slice(1, 3)) * 60 + Number(raw.slice(4))));
  }
  for (const offset of offsets) {
    const candidate = Date.parse(local + 'Z') - offset * 60000;
    if (candidate !== instant && calendarLocalTime(candidate, zone).slice(0, 19) === local) throw Error('Mehrdeutige lokale Uhrzeit am Zeitzonenwechsel; eindeutige Uhrzeit wählen.');
  }
}
function one(p: Parsed, b: Block, name: string, required = false) {
  const found = b.indices.filter(i => key(p.lines[i]) === name);
  if (found.length > 1 || required && found.length !== 1) throw Error(`Einzelvorkommen: ${name} ist nicht eindeutig.`);
  return found.length ? p.lines[found[0]] : null;
}
function isolated(p: Parsed, b: Block, override: boolean) {
  const lines: string[] = [];
  for (let i = 0; i < p.lines.length; i++) {
    if (p.events.some(other => other !== b && i >= other.start && i <= other.end)) continue;
    if (override && i === b.end) lines.push('RRULE:FREQ=DAILY;COUNT=1');
    if (override && b.indices.includes(i) && key(p.lines[i]) === 'RECURRENCE-ID') continue;
    lines.push(p.lines[i]);
  }
  return object.editable(object.structure(dav.serialize(lines)));
}
function typed(name: string, t: ICAL.Time, master: Checked) {
  const header = t.isDate ? `${name};VALUE=DATE` : master.tz ? `${name};TZID=${master.tz}` : name;
  return `${header}:${t.toICALString()}`;
}
function sequence(p: Parsed, b: Block) {
  const raw = one(p, b, 'SEQUENCE'); if (!raw) return 0;
  if (!/^\d{1,9}$/.test(value(raw))) throw Error('Ungültige Einzelvorkommen-Version.'); return Number(value(raw));
}
function series(data: string) {
  const p = object.structure(data);
  if (p.lines.some(l => !/^[A-Z0-9-]+$/.test(key(l)))) throw Error('Nicht standardmäßige oder gruppierte iCalendar-Eigenschaft; Original in der nativen App prüfen.');
  if (p.events.length < 1 || p.events.length > 51 || p.component.getAllSubcomponents().some(c => !['vevent', 'vtimezone'].includes(c.name))) throw Error('Ein Master und höchstens50 Einzelabweichungen erforderlich.');
  // No scheduling or attachment side effects are introduced by materializing a copy.
  if (p.lines.some((l, i) => ['METHOD', 'ATTENDEE', 'ORGANIZER', 'ATTACH'].includes(key(l)) || ['RDATE', 'EXRULE'].includes(key(l)) && !p.zones.some(z => i > z.start && i < z.end))) throw Error('Einladungen, Anhänge und komplexe Zusatzregeln bleiben in der nativen App.');
  const masters = p.events.filter(b => !one(p, b, 'RECURRENCE-ID'));
  if (masters.length !== 1) throw Error('Genau ein Serienmaster erforderlich.');
  const masterBlock = masters[0], master = isolated(p, masterBlock, false);
  unambiguous(master.start.toUnixTime() * 1000, master.tz); unambiguous(master.end.toUnixTime() * 1000, master.tz);
  if (String(master.c.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') throw Error('Abgesagte Serie nicht verändern.');
  sequence(p, masterBlock);
  const occurrences = object.boundedOccurrences(master.raw, master.start, true);
  const positions = new Map(occurrences.map(t => [t.toICALString(), t]));
  const overrides = new Map<string, Block>();
  for (const b of p.events.filter(b => b !== masterBlock)) {
    if (one(p, b, 'RRULE') || one(p, b, 'EXDATE')) throw Error('Einzelabweichung darf keine eigene Regel oder Ausschlüsse tragen.');
    const raw = one(p, b, 'RECURRENCE-ID', true)!, prop = ICAL.Property.fromString(raw), params = prop.toJSON()[1];
    const heads = raw.slice(0, raw.indexOf(':')).split(';').slice(1).map(s => s.split('=', 1)[0].toUpperCase());
    const id = value(raw);
    if (new Set(heads).size !== heads.length || heads.some(k => !['TZID', 'VALUE'].includes(k)) || Object.keys(params).some(k => k !== 'tzid') || prop.type !== (master.start.isDate ? 'date' : 'date-time') || prop.getParameter('tzid') !== master.tz || !positions.has(id) || master.exclusions.includes(id) || overrides.has(id)) throw Error('Einzelabweichung hat fremde, doppelte oder ausgeschlossene Originalkennung/Zeitzone; RANGE bleibt offen.');
    const checked = isolated(p, b, true);
    unambiguous(checked.start.toUnixTime() * 1000, checked.tz); unambiguous(checked.end.toUnixTime() * 1000, checked.tz);
    if (checked.uid !== master.uid || checked.start.isDate !== master.start.isDate || checked.tz !== master.tz || String(checked.c.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') throw Error('Einzelabweichung passt nicht zur Originalserie.');
    if (Math.abs(checked.start.toUnixTime() - master.start.toUnixTime()) > 5 * 366 * 86400) throw Error('Verschiebung außerhalb des fünfjährigen Prüfbereichs.');
    sequence(p, b); overrides.set(id, b);
  }
  return { p, masterBlock, master, occurrences, positions, overrides };
}
function normalComponent(s: ReturnType<typeof series>, original: ICAL.Time) {
  unambiguous(original.toUnixTime() * 1000, s.master.tz);
  const component = clone(s.master.c);
  for (const name of ['rrule', 'exdate', 'recurrence-id']) component.removeAllProperties(name);
  let end: ICAL.Time;
  if (original.isDate) { end = original.clone(); end.addDuration(s.master.end.subtractDate(s.master.start)); }
  else {
    // Match native Sabre EventIterator: DTEND gives an exact duration in seconds.
    const instant = original.toUnixTime() + s.master.end.toUnixTime() - s.master.start.toUnixTime();
    end = ICAL.Time.fromJSDate(new Date(instant * 1000), true).convertToZone(s.master.end.zone);
    if (end.toUnixTime() !== instant) throw Error('Mehrdeutiges natives Terminende am Zeitzonenwechsel.');
    unambiguous(instant * 1000, s.master.tz);
  }
  for (const [name, time] of [['DTSTART', original], ['DTEND', end], ['RECURRENCE-ID', original]] as const) {
    component.removeAllProperties(name.toLowerCase()); component.addProperty(ICAL.Property.fromString(typed(name, time, s.master)));
  }
  return component;
}
type Ref = { calendarPath: string; eventPath: string; originalStart: string };
async function snapshot(a: Ref) {
  const account = await nextcloudAccount(), calendar = calendarPath(account, a.calendarPath), path = safeDavPath(a.eventPath, calendar);
  if (!path.slice(calendar.length) || path.slice(calendar.length).includes('/')) throw Error('Genau ein unaufgelöstes Serienoriginal auswählen.');
  const settings = await readCalendarSettingsAt(account, calendar), event = await dav.readAt(calendar, path);
  if (!event.found) throw Error('Serienoriginal nicht gefunden.'); dav.strongEtag(event.etag);
  const s = series(event.calendarData), original = s.positions.get(a.originalStart);
  if (!original) throw Error('originalStart ist kein bestätigter Originalbeginn innerhalb500Vorkommen/fünfJahren.');
  const block = s.overrides.get(a.originalStart), component = block ? clone(s.p.component.getAllSubcomponents('vevent')[s.p.events.indexOf(block)]) : normalComponent(s, original);
  const reasons: string[] = [];
  if (s.master.exclusions.includes(a.originalStart)) reasons.push('Vorkommen ist mit EXDATE ausgeschlossen; keine stille Wiederherstellung.');
  if (!fullCalendarAccess(settings) || !settings.privileges.some(p => ['all', 'write', 'write-content'].includes(p)) || settings.resourceTypes.some(p => !['calendar', 'collection'].includes(p)) || /\/(?:contact_birthdays|app-generated[^/]*)\/$/.test(calendar)) reasons.push('Nur eigener regulärer VEVENT-Kalender mit nativen Lese-/Inhaltsschreibrechten.');
  const current = await nextcloudAccount();
  if (current.uid !== account.uid || current.principal !== account.principal || current.calendarHome !== account.calendarHome) throw Error('Konto während Vorkommenprüfung verändert.');
  const version = await planningVersion({ account: account.uid, principal: account.principal, calendarHome: account.calendarHome, settings: settings.version, path, etag: event.etag, data: event.calendarData, originalStart: a.originalStart });
  return { account, settings, calendar, path, event, s, original, block, component, reasons, version };
}
export async function readCalendarOccurrence(a: Ref) {
  const f = await snapshot(a), c = f.component;
  return { account: f.account.uid, calendarPath: f.calendar, eventPath: f.path, etag: f.event.etag, uid: f.s.master.uid, originalStart: a.originalStart, recurrenceIdProperty: typed('RECURRENCE-ID', f.original, f.s.master), occurrenceVersion: f.version, hasOverride: !!f.block, excluded: f.s.master.exclusions.includes(a.originalStart), overrideCount: f.s.overrides.size, checkedOccurrences: f.s.occurrences.length, supportedForUpdate: f.reasons.length === 0, reasons: f.reasons, allDay: f.s.master.start.isDate, timeZone: f.s.master.tz ?? (f.s.master.start.isDate ? null : 'UTC'), title: String(c.getFirstPropertyValue('summary') ?? ''), description: String(c.getFirstPropertyValue('description') ?? ''), location: String(c.getFirstPropertyValue('location') ?? ''), startProperty: c.getFirstProperty('dtstart')!.toICALString(), endProperty: c.getFirstProperty('dtend')!.toICALString(), note: 'Genau ein Originalvorkommen; ursprüngliche Serienkennung bleibt bei Verschiebung erhalten. Master und andere Ausnahmen unverändert. Keine Einladung oder Belegungs-/Konfliktfreiheitsprüfung. supportedForUpdate gilt nur für diese begrenzte Struktur und beobachtete Rechte.' };
}
type Guard = Ref & { etag: string; expectedAccount: string; expectedUid: string; expectedOccurrenceVersion: string; acknowledgeSingleOccurrence: true };
async function fresh(a: Guard) {
  if (a.acknowledgeSingleOccurrence !== true) throw Error('Genau ein Serienvorkommen ausdrücklich bestätigen.'); dav.strongEtag(a.etag);
  const f = await snapshot(a);
  if (f.account.uid !== a.expectedAccount || f.event.etag !== a.etag || f.s.master.uid !== a.expectedUid || f.version !== a.expectedOccurrenceVersion) throw Error('Konto, UID, ETag oder Vorkommenstand verändert. Neu lesen.');
  if (f.reasons.length) throw Error(f.reasons.join(' ')); return f;
}
function compose(f: Awaited<ReturnType<typeof snapshot>>, component: ICAL.Component | null) {
  const replacement = component ? object.structure(['BEGIN:VCALENDAR', 'VERSION:2.0', component.toString(), 'END:VCALENDAR'].join('\r\n')).lines.slice(2, -1) : [];
  const lines: string[] = [];
  for (let i = 0; i < f.s.p.lines.length; i++) {
    if (f.block && i === f.block.start) lines.push(...replacement);
    if (f.block && i >= f.block.start && i <= f.block.end) continue;
    if (!f.block && i === f.s.p.lines.length - 1) lines.push(...replacement);
    lines.push(f.s.p.lines[i]);
  }
  const body = dav.serialize(lines); series(body); return body;
}
async function commit(f: Awaited<ReturnType<typeof snapshot>>, body: string) {
  if ((await readCalendarSettingsAt(f.account, f.calendar)).version !== f.settings.version) throw Error('Kalender oder native Rechte inzwischen verändert.');
  return object.commit(f.account.uid, f.calendar, f.path, f.event.etag, body);
}
export type OccurrencePatch = { title?: string; description?: string; location?: string; start?: string; end?: string; startDate?: string; endDate?: string };
export async function updateCalendarOccurrence(a: Guard & OccurrencePatch) {
  const f = await fresh(a), c = clone(f.component), changes = ['title', 'description', 'location', 'start', 'end', 'startDate', 'endDate'].filter(k => (a as any)[k] !== undefined);
  if (!changes.length) throw Error('Keine Einzeländerung angegeben.');
  for (const [field, name, max] of [['title', 'summary', 500], ['description', 'description', 10000], ['location', 'location', 1000]] as const) if (a[field] !== undefined) {
    const v = a[field]!; if (typeof v !== 'string' || v.length > max || new TextDecoder().decode(new TextEncoder().encode(v)) !== v || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v) || field === 'title' && !v.trim()) throw Error('Ungültige Vorkommeneigenschaft.'); c.updatePropertyWithValue(name, v);
  }
  const timed = a.start !== undefined || a.end !== undefined, dated = a.startDate !== undefined || a.endDate !== undefined;
  if (timed || dated) {
    if (timed && dated || f.s.master.start.isDate !== dated) throw Error('Zeit-/Ganztagstyp der Serie nicht umwandeln.');
    let range: string[];
    if (dated) {
      if (!a.startDate || !a.endDate) throw Error('Beginn und exklusives Enddatum zusammen angeben.'); const start = realDate(a.startDate), end = realDate(a.endDate);
      if (end <= start || (Date.parse(a.endDate) - Date.parse(a.startDate)) / 86400000 > 31) throw Error('Ganztagsdauer1–31Tage erforderlich.'); range = [`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`];
    } else {
      if (!a.start || !a.end) throw Error('Neuen Beginn und neues Ende zusammen angeben.'); const start = planningInstant(a.start), end = planningInstant(a.end), tz = f.s.master.tz ?? 'UTC';
      if (end <= start || end - start > 31 * 86400000) throw Error('Dauer muss positiv und höchstens31Tage sein.');
      unambiguous(start, f.s.master.tz); unambiguous(end, f.s.master.tz);
      for (const input of [a.start, a.end]) if (calendarLocalTime(planningInstant(input), tz).replace('+00:00', 'Z') !== input.replace('+00:00', 'Z')) throw Error('Offset passt nicht zur unveränderten Serienzeitzone.');
      range = f.s.master.tz ? [`DTSTART;TZID=${tz}:${a.start.slice(0, 19).replace(/[-:]/g, '')}`, `DTEND;TZID=${tz}:${a.end.slice(0, 19).replace(/[-:]/g, '')}`] : [`DTSTART:${dav.stamp(new Date(start))}`, `DTEND:${dav.stamp(new Date(end))}`];
      // Reparse at the parent timezone to reject an unrepresentable second fold.
      for (const [index, name] of ['dtstart', 'dtend'].entries()) { c.removeAllProperties(name); c.addProperty(ICAL.Property.fromString(range[index])); }
      const trial = compose(f, c), checked = series(trial), b = checked.overrides.get(a.originalStart)!;
      const native = isolated(checked.p, b, true); if (native.start.toUnixTime() !== start / 1000 || native.end.toUnixTime() !== end / 1000) throw Error('Mehrdeutige lokale Verschiebung nicht darstellbar.');
    }
    for (const [index, name] of ['dtstart', 'dtend'].entries()) { c.removeAllProperties(name); c.addProperty(ICAL.Property.fromString(range[index])); }
  }
  if (object.canonical(c) === object.canonical(f.component)) return { outcome: 'unchanged', account: f.account.uid, eventPath: f.path, originalStart: a.originalStart, hasOverride: !!f.block, verified: true, etag: f.event.etag };
  if (!f.block && f.s.overrides.size >= 50) throw Error('Höchstens50 Einzelabweichungen bearbeiten.');
  const seq = Math.max(sequence(f.s.p, f.s.masterBlock), f.block ? sequence(f.s.p, f.block) : 0); if (seq >= 999999999) throw Error('Vorkommen-Version kann nicht weiter erhöht werden.');
  const now = dav.stamp(new Date()); for (const [name, raw] of [['SEQUENCE', String(seq + 1)], ['DTSTAMP', now], ['LAST-MODIFIED', now]]) { c.removeAllProperties(name.toLowerCase()); c.addProperty(ICAL.Property.fromString(`${name}:${raw}`)); }
  const result = await commit(f, compose(f, c)); return { ...result, originalStart: a.originalStart, singleOccurrenceOnly: true, note: result.note + ' Nur die Abweichung dieses ursprünglichen Vorkommens angelegt/ersetzt; Master und andere Ausnahmen erhalten.' };
}
export async function resetCalendarOccurrence(a: Guard & { acknowledgeReset: true }) {
  if (a.acknowledgeReset !== true) throw Error('Rücknahme genau dieser Einzelabweichung ausdrücklich bestätigen.'); const f = await fresh(a);
  if (!f.block) return { outcome: 'unchanged', account: f.account.uid, eventPath: f.path, originalStart: a.originalStart, hasOverride: false, verified: true, etag: f.event.etag };
  const result = await commit(f, compose(f, null)); return { ...result, originalStart: a.originalStart, singleOccurrenceOnly: true, note: result.note + ' Genau diese Einzelabweichung entfernt; Serienbasis gilt wieder. Keine EXDATE-Wiederherstellung und keine Papierkorblöschung.' };
}
export const calendarOccurrenceInternals={series,isolated,typed,unambiguous,normalComponent};
