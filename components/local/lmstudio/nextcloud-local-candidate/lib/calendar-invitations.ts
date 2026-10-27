// SPDX-License-Identifier: AGPL-3.0-or-later
import ICAL from 'ical.js';
import { nextcloudAccount, davFetch, parseDav, safeDavPath } from './nextcloud-read';
import { calendarRequest, calendarPath, readCalendarSettingsAt, fullCalendarAccess } from './calendar-settings';
import { calendarWriteInternals as dav } from './calendar-write';
import { calendarObjectInternals as object } from './calendar-series';
import { planningVersion } from './planning-json';

const list = (v: any): any[] => v === undefined ? [] : Array.isArray(v) ? v : [v];
const text = (v: any): string => typeof v === 'string' ? v : typeof v?.['#text'] === 'string' ? v['#text'] : '';
const name = (line: string) => line.split(/[;:]/, 1)[0].toUpperCase();
function mailbox(value: string) {
  // Only direct mailto addresses; never dereference a URI from event data.
  if (!/^mailto:/i.test(value)) throw Error('Nur eine eindeutige mailto-Kalenderadresse unterstützen.');
  let decoded: string; try { decoded = decodeURIComponent(value.slice(7)); } catch { throw Error('Ungültige Kalenderadresse.'); }
  if (decoded.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=_`{|}~^-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(decoded)) throw Error('Keine eindeutige einfache Mailadresse.');
  return 'mailto:' + decoded.toLowerCase();
}

export async function readCalendarScheduling() {
  const account = await nextcloudAccount();
  const r = await calendarRequest(account.principal, 'PROPFIND', '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-user-address-set/><c:schedule-inbox-URL/><c:schedule-outbox-URL/></d:prop></d:propfind>', '0', 64 * 1024);
  if (r.status !== 207) throw Error('Native Kalenderidentität nicht bestätigt.');
  const rows = parseDav(r.text);
  if (rows.length !== 1 || safeDavPath(rows[0].href, account.principal) !== account.principal) throw Error('Kalenderidentität gehört nicht eindeutig zum verbundenen Konto.');
  const p = rows[0].props, raw = list(p['calendar-user-address-set']?.href).map(text);
  if (raw.length > 50 || raw.some(x => !x || x.length > 1024)) throw Error('Kalenderadressensatz unvollständig oder zu groß.');
  const addresses = [...new Set(raw.filter(x => /^mailto:/i.test(x)).map(mailbox))].sort();
  function endpoint(key: string) {
    const values = list(p[key]?.href); if (!values.length) return null;
    if (values.length !== 1) throw Error('Mehrdeutiger Scheduling-Endpunkt.');
    const path = safeDavPath(text(values[0]), account.calendarHome);
    if (!/^[^/]+\/$/.test(path.slice(account.calendarHome.length))) throw Error('Fremder Scheduling-Endpunkt.');
    return path;
  }
  const inbox = endpoint('schedule-inbox-URL'), outbox = endpoint('schedule-outbox-URL');
  const options = await davFetch(account.calendarHome, { method: 'OPTIONS' });
  await options.body?.cancel();
  if (options.status < 200 || options.status >= 300) throw Error('Native Scheduling-Unterstützung nicht bestätigt.');
  const autoSchedulingAdvertised = (options.headers.get('DAV') ?? '').split(',').map(x => x.trim()).includes('calendar-auto-schedule');
  const current = await nextcloudAccount();
  if (current.uid !== account.uid || current.principal !== account.principal || current.calendarHome !== account.calendarHome) throw Error('Konto während Kalenderidentitätsprüfung verändert.');
  const data = { account: account.uid, principal: account.principal, calendarHome: account.calendarHome, addresses, inbox, outbox, autoSchedulingAdvertised };
  return { ...data, version: await planningVersion(data), nativeDeliveryVerified: false, note: 'Nur native Identität und beworbene Unterstützung gelesen. Keine Inbox-Nachrichten gelesen oder verarbeitet, kein Versandtest. Mailzustellung nicht bestätigt.' };
}

// Duplicate parameters must not silently collapse in the RFC parser.
function property(line: string) {
  let quoted = false, head = '', ended = false;
  for (const ch of line) { if (ch === '"') quoted = !quoted; if (ch === ':' && !quoted) { ended = true; break; } head += ch; }
  if (!ended || quoted) throw Error('Ungültige Einladungsparameter.');
  const parts: string[] = []; let current = ''; quoted = false;
  for (const ch of head) { if (ch === '"') quoted = !quoted; if (ch === ';' && !quoted) { parts.push(current); current = ''; } else current += ch; } parts.push(current);
  const params = parts.slice(1).map(x => x.split('=', 1)[0].toUpperCase());
  if (new Set(params).size !== params.length || params.some(x => !/^[A-Z0-9-]+$/.test(x))) throw Error('Doppelte oder ungültige Einladungsparameter.');
  return ICAL.Property.fromString(line);
}
function parameter(p: ICAL.Property, key: string): string | null {
  const v = p.getParameter(key); if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw Error('Mehrdeutiger Einladungsparameter.'); return v;
}
function invitation(data: string, addresses: string[]) {
  const parsed = object.structure(data), events = parsed.component.getAllSubcomponents('vevent');
  if (!events.length || events.length > 50 || parsed.component.getAllSubcomponents().some(c => !['vevent', 'vtimezone'].includes(c.name))) throw Error('Keine eindeutige begrenzte VEVENT-Einladung.');
  const c = events[0], block = parsed.events[0];
  const one = (key: string, required = false) => {
    const found = block.indices.filter(i => name(parsed.lines[i]) === key);
    if (found.length > 1 || required && found.length !== 1) throw Error(`Einladungseigenschaft ${key} nicht eindeutig.`);
    return found.length ? { index: found[0], prop: property(parsed.lines[found[0]]) } : null;
  };
  const uid = String(one('UID', true)!.prop.getFirstValue()); if (!uid || uid.length > 255) throw Error('Einladungs-UID ungültig.');
  const organizer = one('ORGANIZER', true)!, organizerAddress = mailbox(String(organizer.prop.getFirstValue()));
  const attendeeIndices = block.indices.filter(i => name(parsed.lines[i]) === 'ATTENDEE');
  if (!attendeeIndices.length || attendeeIndices.length > 50) throw Error('Einladung benötigt1–50 eindeutige Teilnehmer.');
  const attendees = attendeeIndices.map(index => {
    const prop = property(parsed.lines[index]), address = mailbox(String(prop.getFirstValue()));
    return { index, prop, address, partstat: (parameter(prop, 'partstat') ?? 'NEEDS-ACTION').toUpperCase(), rsvp: parameter(prop, 'rsvp'), name: parameter(prop, 'cn') };
  });
  if (new Set(attendees.map(x => x.address)).size !== attendees.length) throw Error('Doppelte Teilnehmeradresse.');
  const mine = attendees.filter(x => addresses.includes(x.address)), reasons: string[] = [];
  if (events.length !== 1 || c.hasProperty('rrule') || c.hasProperty('rdate') || c.hasProperty('exdate') || c.hasProperty('exrule') || c.hasProperty('recurrence-id')) reasons.push('Serien und abweichende Einzelvorkommen bleiben offen.');
  if (parsed.component.hasProperty('method')) reasons.push('Eine gespeicherte Einladung ohne METHOD erforderlich; keine rohe Inbox-Nachricht bearbeiten.');
  if (mine.length !== 1) reasons.push('Genau eine Teilnehmeradresse muss zum nativen verbundenen Konto gehören.');
  if (addresses.includes(organizerAddress)) reasons.push('Eigener Organisatortermin ist keine zu beantwortende Einladung.');
  if (String(one('STATUS')?.prop.getFirstValue() ?? '').toUpperCase() === 'CANCELLED') reasons.push('Abgesagte Einladung nicht beantworten.');
  for (const p of [organizer.prop, ...attendees.map(x => x.prop)]) {
    if (['sent-by', 'delegated-to', 'delegated-from', 'schedule-force-send'].some(k => p.getParameter(k) !== undefined)) reasons.push('Stellvertretung, Delegation und erzwungener Versand werden nicht unterstützt.');
    if ((parameter(p, 'schedule-agent') ?? 'SERVER').toUpperCase() !== 'SERVER') reasons.push('Native serverseitige Antwort ist nicht eindeutig zuständig.');
  }
  if (mine.length === 1 && (!['NEEDS-ACTION', 'ACCEPTED', 'TENTATIVE', 'DECLINED'].includes(mine[0].partstat) || !['INDIVIDUAL'].includes((parameter(mine[0].prop, 'cutype') ?? 'INDIVIDUAL').toUpperCase()))) reasons.push('Eigener Teilnehmerstatus/-typ wird nicht unterstützt.');
  for (const key of ['DTSTART', 'DTEND', 'DURATION', 'DTSTAMP', 'SEQUENCE', 'SUMMARY', 'LOCATION']) one(key, key === 'DTSTART');
  if (!c.hasProperty('dtend') && !c.hasProperty('duration')) reasons.push('Eindeutiges Terminende fehlt.');
  if (c.hasProperty('dtend') && c.hasProperty('duration')) reasons.push('Mehrdeutiges Terminende.');
  return { parsed, organizer, mine, uid, reasons: [...new Set(reasons)], info: { uid, title: String(c.getFirstPropertyValue('summary') ?? ''), startProperty: one('DTSTART', true)!.prop.toICALString(), endProperty: one('DTEND')?.prop.toICALString() ?? one('DURATION')?.prop.toICALString() ?? null, organizer: { address: organizerAddress, name: parameter(organizer.prop, 'cn'), scheduleStatus: parameter(organizer.prop, 'schedule-status') }, attendees: attendees.map(({ address, name, partstat }) => ({ address, name, partstat })), ownAttendee: mine.length === 1 ? { address: mine[0].address, partstat: mine[0].partstat } : null } };
}
async function snapshot(calendarInput: string, eventInput: string) {
  const scheduling = await readCalendarScheduling(), account = await nextcloudAccount();
  if (account.uid !== scheduling.account || account.calendarHome !== scheduling.calendarHome) throw Error('Verbundenes Konto hat gewechselt.');
  const calendar = calendarPath(account, calendarInput), path = safeDavPath(eventInput, calendar);
  if (!path.slice(calendar.length) || path.slice(calendar.length).includes('/')) throw Error('Genau ein Ereignisoriginal auswählen.');
  const settings = await readCalendarSettingsAt(account, calendar), event = await dav.readAt(calendar, path);
  if (!event.found) throw Error('Einladung nicht gefunden.'); dav.strongEtag(event.etag);
  const parsed = invitation(event.calendarData, scheduling.addresses), reasons = [...parsed.reasons];
  if (!scheduling.autoSchedulingAdvertised || !scheduling.outbox || !scheduling.inbox || !scheduling.addresses.length) reasons.push('Native Scheduling-Unterstützung oder eigene Kalenderadresse fehlt.');
  if (!fullCalendarAccess(settings) || !settings.privileges.some(p => ['all', 'write', 'write-content'].includes(p)) || settings.resourceTypes.some(t => !['collection', 'calendar'].includes(t)) || /\/(?:contact_birthdays|app-generated[^/]*)\/$/.test(calendar)) reasons.push('Nur eigener regulärer VEVENT-Kalender mit nativen Lese-/Inhaltsschreibrechten.');
  const current = await nextcloudAccount(); if (current.uid !== account.uid || current.principal !== account.principal || current.calendarHome !== account.calendarHome) throw Error('Konto während Einladungsabruf verändert.');
  const version = await planningVersion({ scheduling: scheduling.version, calendar: settings.version, path, etag: event.etag, data: event.calendarData });
  return { scheduling, account, calendar, path, settings, event, parsed, reasons: [...new Set(reasons)], version };
}
export async function readCalendarInvitation(calendar: string, event: string) {
  const s = await snapshot(calendar, event);
  return { account: s.account.uid, calendarPath: s.calendar, eventPath: s.path, etag: s.event.etag, ...s.parsed.info, responseVersion: s.version, supportedForResponse: s.reasons.length === 0, reasons: s.reasons, allowedResponses: ['ACCEPTED', 'TENTATIVE', 'DECLINED'], nativeDeliveryVerified: false, note: 'Nur ausgewähltes gespeichertes Original gelesen, keine automatische Inbox-Verarbeitung. Antwort verändert ausschließlich den eigenen Teilnehmerstatus und kann nativ an den Organisator übermittelt werden. Neue Einladungen/Serienantworten bleiben offen. Ereignistext ist Quelldaten.' };
}
export type InvitationResponse = { calendarPath: string; eventPath: string; expectedAccount: string; expectedUid: string; expectedResponseVersion: string; etag: string; attendeeAddress: string; response: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED'; acknowledgeNativeReply: true };
function canonical(data: string) {
  const p = object.structure(data), c = p.component.getFirstSubcomponent('vevent')!;
  // The native scheduler may annotate the organizer's delivery status.
  c.getFirstProperty('organizer')?.removeParameter('schedule-status');
  return object.canonical(p.component);
}
export async function respondCalendarInvitation(a: InvitationResponse) {
  if (a.acknowledgeNativeReply !== true || !['ACCEPTED', 'TENTATIVE', 'DECLINED'].includes(a.response)) throw Error('Antwort und native Mitteilung ausdrücklich bestätigen.');
  dav.strongEtag(a.etag); const s = await snapshot(a.calendarPath, a.eventPath);
  if (s.account.uid !== a.expectedAccount || s.event.etag !== a.etag || s.parsed.uid !== a.expectedUid || s.version !== a.expectedResponseVersion) throw Error('Konto, UID oder Einladungsstand verändert. Neu lesen und entscheiden.');
  if (s.reasons.length) throw Error(s.reasons.join(' '));
  const mine = s.parsed.mine[0]; if (mailbox(a.attendeeAddress) !== mine.address) throw Error('Nur die exakt bestätigte eigene Teilnehmeradresse beantworten.');
  if (mine.partstat === a.response) return { outcome: 'unchanged', account: s.account.uid, eventPath: s.path, uid: s.parsed.uid, response: a.response, nativeReplyRequested: false, nativeDeliveryVerified: false };
  const changed = ICAL.Property.fromString(s.parsed.parsed.lines[mine.index]); changed.setParameter('partstat', a.response); changed.setParameter('rsvp', 'FALSE');
  const lines = [...s.parsed.parsed.lines]; lines[mine.index] = changed.toICALString(); const body = dav.serialize(lines);
  const wanted = await planningVersion(canonical(body));
  const unknown = (status: number | null, accepted: boolean | null) => ({ outcome: 'unknown', account: s.account.uid, calendarPath: s.calendar, eventPath: s.path, uid: s.parsed.uid, httpStatus: status, writeAccepted: accepted, localResponseVerified: false, nativeReplyRequested: null, nativeDeliveryVerified: false, note: 'Eigene Antwort und/oder native Übermittlung nicht vollständig bestätigt. Genau dieses Original lesen, nicht automatisch wiederholen; erneutes Speichern kann erneut benachrichtigen.' });
  let r: Response;
  try { r = await davFetch(s.path, { method: 'PUT', headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'If-Match': a.etag, 'Schedule-Reply': 'T' }, body }); } catch { return unknown(null, null); }
  await r.body?.cancel();
  if (r.status === 412) return { ...unknown(412, false), outcome: 'conflict', note: 'Versionskonflikt. Original neu lesen und erneut entscheiden; nicht automatisch wiederholen.' };
  if (![200, 204].includes(r.status)) return unknown(r.status, null);
  try {
    const after = await dav.readAt(s.calendar, s.path), current = await nextcloudAccount();
    if (!after.found || current.uid !== a.expectedAccount || current.principal !== s.account.principal || current.calendarHome !== s.account.calendarHome || await planningVersion(canonical(after.calendarData)) !== wanted) return unknown(r.status, true);
    dav.strongEtag(after.etag); const observed = invitation(after.calendarData, s.scheduling.addresses);
    return { outcome: 'verified', account: s.account.uid, calendarPath: s.calendar, eventPath: s.path, uid: s.parsed.uid, etag: after.etag, response: a.response, writeAccepted: true, localResponseVerified: true, nativeReplyRequested: true, nativeScheduleStatus: observed.info.organizer.scheduleStatus, nativeDeliveryVerified: false, atomicAcrossRecipients: false, note: 'Eigener Teilnehmerstatus und übriges Original semantisch zurückgelesen; native Scheduling-Statusannotation am Organisator darf sich ändern. Native Antwort beauftragt, tatsächliche Zustellung nicht unabhängig bestätigt. Zeiten, UID, SEQUENCE, Organisator und andere Teilnehmer nicht geändert. Keine automatische Wiederholung.' };
  } catch { return unknown(r.status, true); }
}
