// SPDX-License-Identifier: AGPL-3.0-or-later
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,writeFileSync,readFileSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const api=require('../plugin.cjs');
const root=mkdtempSync(join(tmpdir(),'nf-meeting-null-'));
after(()=>rmSync(root,{recursive:true,force:true}));
const reported=()=>({action:'create',attendees:['mailto:invitee@example.invalid'],calendarPath:'/remote.php/dav/calendars/Soul/novaforge-pilot/',details:{description:'Einmalige technische Zustellprobe für NovaSpace. Keine Teilnahme erforderlich.',end:'2026-10-30T12:05:00+01:00',location:null,start:'2026-10-30T12:00:00+01:00',startDate:null,endDate:null,timeZone:'Europe/Berlin',title:'NovaSpace – Zustellprobe'},eventId:'sample-meeting-001',expectedAccount:'Soul',organizerAddress:'mailto:operator@example.invalid'});
const schema={type:'object',required:['title','preparedAt'],additionalProperties:false,properties:{title:{type:'string'},preparedAt:{type:'string',format:'date-time'},optional:{type:'string',maxLength:5},explicitNullable:{type:['string','null']},details:{type:'object',additionalProperties:false,properties:{location:{type:'string'},startDate:{type:'string',format:'date'}}}}};
test('Only the two meeting schemas accommodate optional strings; native schema and explicit nullable semantics survive',()=>{
 const before=JSON.stringify(schema);
 for(const name of ['calendar_prepare_meeting','calendar_submit_meeting']){
  const adapted=api.calendarMeetingModelSchema(name,schema);
  assert.deepEqual(adapted.properties.optional.type,['string','null']);
  assert.equal(adapted.properties.optional.maxLength,5);
  assert.equal(adapted.properties.preparedAt.type,'string');
  assert.equal(adapted.properties.title.type,'string');
  assert.equal(adapted.additionalProperties,false);
 }
 assert.equal(JSON.stringify(schema),before);
 assert.equal(api.calendarMeetingModelSchema('calendar_update_event',schema),schema);
});
test('Omission preserves explicit empty text, required null, declared nullable null and unknown fields',()=>{
 const input={title:null,preparedAt:null,optional:null,explicitNullable:null,details:{location:'',startDate:null},unknown:null};
 const expected={title:null,preparedAt:null,explicitNullable:null,details:{location:''},unknown:null};
 const copy=structuredClone(input);
 assert.deepEqual(api.calendarMeetingNativeArguments('calendar_prepare_meeting',schema,input),expected);
 assert.deepEqual(input,copy);
 assert.equal(api.calendarMeetingNativeArguments('calendar_update_event',schema,input),input);
});

test('Exact reported arguments pass the real SDK and stdio core, producing a preview without writes',async()=>{
 const config=join(root,'local.json'),log=join(root,'calls.jsonl');
 writeFileSync(config,JSON.stringify({baseUrl:'https://cloud.example.invalid',expectedUser:'Soul',scopes:['calendar:read'],groups:['calendar']}));
 const source={expectedUser:'Soul',parameters:{command:process.execPath,args:['--require',join(__dirname,'fixtures/calendar-meeting-fetch.cjs'),join(__dirname,'fixtures/nextcloud-local.cjs'),config],env:{NC_MCP_URL:'https://cloud.example.invalid',NC_MCP_USER:'Soul',NC_MCP_APP_PASSWORD:'fixture',NS_TEST_CALENDAR_LOG:log},stderr:'ignore'}};
 const abort=new AbortController(),session=await api.connectLocalMcp(source,{topics:['calendarInvitations']},abort.signal);
 try{
  const prepare=session.tools.find(t=>t.name==='calendar_prepare_meeting');
  const submit=session.tools.find(t=>t.name==='calendar_submit_meeting');
  const args=reported(),unchanged=structuredClone(args),ctx={signal:abort.signal,status(){},warn(){},callId:1};
  assert.doesNotThrow(()=>prepare.checkParameters(args));
  for(const patch of [{expectedAccount:null},{details:{...args.details,location:42}},{details:{...args.details,startDate:'invalid'}},{unknown:null}])assert.throws(()=>prepare.checkParameters({...args,...patch}));
  const result=await prepare.implementation(args,ctx);
  assert.equal(result.isError,undefined,JSON.stringify(result));
  const p=result.structuredContent;
  assert.equal(p.ready,true);
  assert.equal(p.eventPath,args.calendarPath+args.eventId+'.ics');
  assert.equal(p.uid,args.eventId+'@novaforge');
  assert.equal(p.submission.details.timeZone,'Europe/Berlin');
  for(const key of ['location','startDate','endDate'])assert.ok(!Object.hasOwn(p.submission.details,key));
  assert.match(p.preparedAt,/Z$/);
  assert.match(p.proposalVersion,/^[a-f0-9]{64}$/);
  assert.equal(p.nativeSchedulingRequested,false);
  assert.deepEqual(args,unchanged);
  const confirmed={...p.submission,acknowledgeNativeScheduling:true};
  assert.doesNotThrow(()=>submit.checkParameters(confirmed));
  assert.throws(()=>submit.checkParameters({...confirmed,preparedAt:null}));
  const callCount=readFileSync(log,'utf8').trim().split('\n').length;
  const denied=await submit.implementation(confirmed,ctx);
  assert.equal(denied.isError,true);
  assert.match(JSON.stringify(denied),/calendar:organize/);
  const calls=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(calls.length,callCount);
  assert.ok(calls.length>0);
  assert.ok(calls.every(c=>!['PUT','POST','DELETE','PROPPATCH'].includes(c.method)));
 }finally{session[Symbol.dispose]();}
});
