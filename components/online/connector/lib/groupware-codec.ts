// SPDX-License-Identifier: AGPL-3.0-or-later
export const xmlText = (s:string) => s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
export const escapeGroupwareText = (s:string) => s.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
export const unescapeGroupwareText = (s:string) => s.replace(/\\([nN,;\\])/g,(_,c:string)=>/n/i.test(c)?'\n':c);
export const utcGroupwareStamp = (d=new Date()) => d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
export function propertyValue(line:string) {
  let quoted=false;
  for(let i=0;i<line.length;i++) {
    if(line[i]==='"'&&line[i-1]!=='\\')quoted=!quoted;
    if(line[i]===':'&&!quoted)return line.slice(i+1);
  }
  throw new Error('Ungültige Inhaltszeile.');
}
export const propertyName=(line:string)=>line.split(/[;:]/,1)[0].split('.').at(-1)!.toUpperCase();
export function unfoldGroupware(data:string) {
  if(new TextEncoder().encode(data).length>256*1024||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(data))throw new Error('Objekt ist zu groß oder enthält ungültige Steuerzeichen.');
  const lines=data.replace(/\r\n[ \t]|\n[ \t]/g,'').split(/\r?\n/).filter(Boolean);
  if(lines.some(l=>l.includes('\r')))throw new Error('Ungültige Zeilenenden.');
  lines.forEach(propertyValue);return lines;
}
export function foldGroupware(lines:string[]) {
  return lines.map(line=>{
    if(/[\r\n]/.test(line))throw new Error('Unzulässiger Zeilenumbruch.');
    let out='',size=0;
    for(const ch of line){const n=new TextEncoder().encode(ch).length;if(size+n>75){out+='\r\n ';size=1;}out+=ch;size+=n;}
    return out;
  }).join('\r\n')+'\r\n';
}
export function singleComponent(data:string,component:'VTODO'|'VCARD') {
  const lines=unfoldGroupware(data),root=component==='VCARD'?'VCARD':'VCALENDAR',stack:string[]=[],indices:number[]=[];
  let count=0,end=-1;
  for(let i=0;i<lines.length;i++) {
    const name=propertyName(lines[i]),value=propertyValue(lines[i]).toUpperCase();
    if(name==='BEGIN') {
      if(!stack.length&&(value!==root||i!==0))throw new Error('Ungültiges Hauptobjekt.');
      if(value===component){if(component==='VTODO'&&stack.join()!=='VCALENDAR')throw new Error('Ungültige Aufgabenstruktur.');count++;}
      stack.push(value);
    }else if(name==='END') {
      if(stack.pop()!==value)throw new Error('Unvollständige Objektstruktur.');
      if(value===component)end=i;
      if(!stack.length&&i!==lines.length-1)throw new Error('Mehrere Hauptobjekte nicht unterstützt.');
    }else if(stack.join()===(component==='VCARD'?'VCARD':'VCALENDAR,VTODO'))indices.push(i);
  }
  if(stack.length||count!==1||end<0)throw new Error('Genau ein Einzelobjekt erforderlich; Serienobjekte separat behandeln.');
  return {lines,indices,end};
}
export function replaceProperties(parsed:ReturnType<typeof singleComponent>,changes:Map<string,string[]>) {
  const indices=new Set(parsed.indices),remaining=new Map(changes),out:string[]=[];
  for(let i=0;i<parsed.lines.length;i++) {
    if(i===parsed.end)for(const values of remaining.values())out.push(...values);
    const name=propertyName(parsed.lines[i]);
    if(indices.has(i)&&changes.has(name)) {
      if(remaining.has(name)){out.push(...remaining.get(name)!);remaining.delete(name);}
    }else out.push(parsed.lines[i]);
  }
  return foldGroupware(out);
}
export function realDate(input:string) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input)||input<'0001-01-01')throw new Error('Datum muss YYYY-MM-DD sein.');
  const d=new Date(input+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==input)throw new Error('Ungültiges Kalenderdatum.');
  return input.replace(/-/g,'');
}
