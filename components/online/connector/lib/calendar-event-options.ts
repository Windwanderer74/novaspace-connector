// SPDX-License-Identifier: AGPL-3.0-or-later
import ICAL from 'ical.js';
import {calendarLocalTime,planningInstant} from './calendar-planning';
import {nextcloudAccount} from './nextcloud-read';
import {readCalendarSettingsAt} from './calendar-settings';

export async function namedEventRange(calendar:string,start:string,end:string,timeZone:string,original?:string){
 if(!/^[A-Za-z][A-Za-z0-9_+/-]{0,99}$/.test(timeZone))throw Error('Ausdrückliche IANA-Zeitzone erforderlich.');
 const instants=[planningInstant(start),planningInstant(end)];if(instants[1]<=instants[0])throw Error('Terminende muss nach Beginn liegen.');
 for(const [i,s]of [start,end].entries())if(calendarLocalTime(instants[i],timeZone).replace('+00:00','Z')!==s.replace('+00:00','Z'))throw Error('Offset passt nicht zur benannten Zeitzone; lokale Zeitlücke oder falscher Offset.');
 if(timeZone==='UTC')return {range:instants.map((n,i)=>`${i?'DTEND':'DTSTART'}:${new Date(n).toISOString().replace(/[-:]/g,'').replace('.000Z','Z')}`),zone:[] as string[]};
 const current=original?ICAL.Component.fromString(original).getAllSubcomponents('vtimezone').filter(z=>z.getFirstPropertyValue('tzid')===timeZone):[];
 const account=await nextcloudAccount(),settings=await readCalendarSettingsAt(account,calendar);
 const native=settings.timezone?ICAL.Component.fromString(settings.timezone).getAllSubcomponents('vtimezone').filter(z=>z.getFirstPropertyValue('tzid')===timeZone):[];
 const zones=current.length?current:native;if(zones.length!==1||zones[0].getAllProperties('tzid').length!==1||!zones[0].getAllSubcomponents().length)throw Error('Passende vollständige native VTIMEZONE erforderlich.');
 const tz=new ICAL.Timezone({component:zones[0],tzid:timeZone});
 for(const [i,s]of [start,end].entries()){const t=ICAL.Time.fromString(s.slice(0,19),undefined);t.zone=tz;if(t.toUnixTime()*1000!==instants[i])throw Error('Native Zeitzone und IANA-Offset widersprechen sich.');}
 return {range:[`DTSTART;TZID=${timeZone}:${start.slice(0,19).replace(/[-:]/g,'')}`,`DTEND;TZID=${timeZone}:${end.slice(0,19).replace(/[-:]/g,'')}`],zone:current.length?[]:zones[0].toString().split(/\r?\n/).filter(Boolean)};
}

export type AlarmEdit={index:number;minutesBefore:number|null;related?:'START'|'END'};
export type NewAlarm={minutesBefore:number;related?:'START'|'END'};
function trigger(minutes:number,related='START'){
 if(!Number.isInteger(minutes)||minutes<0||minutes>40320||!['START','END'].includes(related))throw Error('Lokale Erinnerung:0–40320Minuten vor START/END erforderlich.');
 return `TRIGGER;RELATED=${related}:-PT${minutes}M`;
}
export function changeEventAlarms(lines:string[],edits:AlarmEdit[]=[],add:NewAlarm[]=[]){
 if(edits.length>10||add.length>5||new Set(edits.map(e=>e.index)).size!==edits.length)throw Error('Höchstens10 eindeutige Alarmänderungen und5 Ergänzungen.');
 const starts=lines.flatMap((l,i)=>l.toUpperCase()==='BEGIN:VALARM'?[i]:[]),blocks=starts.map(first=>({first,last:lines.findIndex((l,i)=>i>first&&l.toUpperCase()==='END:VALARM')}));
 const eventStart=lines.findIndex(l=>l.toUpperCase()==='BEGIN:VEVENT'),eventEnd=lines.findIndex(l=>l.toUpperCase()==='END:VEVENT');
 if(blocks.length>10||blocks.some((b,i)=>b.first<eventStart||b.last<b.first||b.last>eventEnd||(i>0&&blocks[i-1].last>=b.first)))throw Error('Erinnerungsstruktur nicht eindeutig oder mehr als10 Alarme.');
 const replacements=new Map<number,{last:number;lines:string[]}>();
 for(const e of edits){if(!Number.isInteger(e.index)||!blocks[e.index])throw Error('Alarmindex aus frischem calendar_read_event erforderlich.');const b=blocks[e.index],raw=lines.slice(b.first,b.last+1),keys=raw.map(l=>l.split(/[;:]/,1)[0].toUpperCase());
  if(raw.filter(l=>/^ACTION:DISPLAY$/i.test(l)).length!==1||keys.filter(k=>k==='ACTION').length!==1||keys.filter(k=>k==='TRIGGER').length!==1||keys.some(k=>['ATTACH','ATTENDEE','REPEAT','DURATION'].includes(k))||raw.filter(l=>/^BEGIN:/i.test(l)).length!==1)throw Error('Nur ausgewählte einfache lokale DISPLAY-Erinnerung ändern.');
  const old=raw.find(l=>/^TRIGGER[;:]/i.test(l))!;if(!/^TRIGGER(?:;RELATED=(?:START|END))?:-?P(?:\d+W|(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?)$/i.test(old))throw Error('Komplexen/absoluten Alarm in nativer App bearbeiten.');
  const related=e.related??(/;RELATED=END:/i.test(old)?'END':'START');replacements.set(b.first,{last:b.last,lines:e.minutesBefore===null?[]:raw.map(l=>l===old?trigger(e.minutesBefore!,related):l)});
 }
 if(blocks.length-edits.filter(e=>e.minutesBefore===null).length+add.length>10)throw Error('Höchstens10 lokale Erinnerungen.');
 const result:string[]=[];for(let i=0;i<lines.length;i++){if(i===eventEnd)for(const a of add)result.push('BEGIN:VALARM','ACTION:DISPLAY',trigger(a.minutesBefore,a.related),'DESCRIPTION:Terminerinnerung','END:VALARM');const r=replacements.get(i);if(r){result.push(...r.lines);i=r.last;}else result.push(lines[i]);}return result;
}
