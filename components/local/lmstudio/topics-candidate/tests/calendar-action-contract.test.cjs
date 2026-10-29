// SPDX-License-Identifier: AGPL-3.0-or-later
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,writeFileSync,readFileSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const api=require('../plugin.cjs');
const root=mkdtempSync(join(tmpdir(),'nf-action-contract-'));
after(()=>rmSync(root,{recursive:true,force:true}));
let sequence=0;
const base={calendarPath:'/remote.php/dav/calendars/Soul/novaforge-pilot/',expectedAccount:'Soul',organizerAddress:'mailto:operator@example.invalid'};
const identifiers={eventPath:base.calendarPath+'sample-meeting-001.ics',etag:'"9e0f94fd13a615b140129a9a7b2c9999"',expectedUid:'sample-meeting-001@novaforge'};
const create={...base,action:'create',eventId:'sample-meeting-001',details:{title:'NovaSpace – Zustellprobe',start:'2026-10-30T12:00:00+01:00',end:'2026-10-30T12:05:00+01:00'},attendees:['mailto:invitee@example.invalid']};
const update={...base,...identifiers,action:'update',details:{title:'NovaSpace – Zustellprobe (aktualisiert)'}};
const cancel={...base,...identifiers,action:'cancel'};
async function connect(existing=false){
 const number=sequence++,config=join(root,number+'-local.json'),log=join(root,number+'-calls.jsonl');
 writeFileSync(config,JSON.stringify({baseUrl:'https://cloud.example.invalid',expectedUser:'Soul',scopes:['calendar:read'],groups:['calendar']}));
 const source={expectedUser:'Soul',parameters:{command:process.execPath,args:['--require',join(__dirname,'fixtures/calendar-meeting-fetch.cjs'),join(__dirname,'fixtures/nextcloud-local.cjs'),config],env:{NC_MCP_URL:'https://cloud.example.invalid',NC_MCP_USER:'Soul',NC_MCP_APP_PASSWORD:'fixture',NS_TEST_CALENDAR_LOG:log,NS_TEST_CALENDAR_EXISTING:existing?'1':'0'},stderr:'ignore'}};
 const abort=new AbortController();
 return {session:await api.connectLocalMcp(source,{topics:['calendarInvitations']},abort.signal),ctx:{signal:abort.signal,status(){},warn(){},callId:1},log};
}
const submission=args=>({...args,preparedAt:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),expectedProposalVersion:'a'.repeat(64),acknowledgeNativeScheduling:true});

test('Real SDK requires the action-specific identifiers on both prepare and submit',async()=>{
 const {session}=await connect();
 try{
  for(const name of ['calendar_prepare_meeting','calendar_submit_meeting']){
   const tool=session.tools.find(t=>t.name===name),wrap=args=>name==='calendar_submit_meeting'?submission(args):args;
   for(const [args,required] of [[create,['eventId','details','attendees']],[update,['eventPath','etag','expectedUid']],[cancel,['eventPath','etag','expectedUid']]]){
    assert.doesNotThrow(()=>tool.checkParameters(wrap(args)),name+'/'+args.action);
    for(const key of required){
     const missing={...args};delete missing[key];
     assert.throws(()=>tool.checkParameters(wrap(missing)),new RegExp(key),name+'/'+args.action+'/'+key);
     assert.throws(()=>tool.checkParameters(wrap({...args,[key]:null})),undefined,name+'/'+args.action+'/'+key+'/null');
    }
   }
   assert.throws(()=>tool.checkParameters(wrap({...update,eventId:create.eventId})));
   assert.throws(()=>tool.checkParameters(wrap({...cancel,details:{title:'must not change'}})));
   assert.throws(()=>tool.checkParameters(wrap({...cancel,attendees:create.attendees})));
   assert.throws(()=>tool.checkParameters(wrap({...create,details:{title:'incomplete',start:create.details.start}})));
   const noTitle={...create,details:{start:create.details.start,end:create.details.end}};
   assert.throws(()=>tool.checkParameters(wrap(noTitle)),/title/);
  }
 }finally{session[Symbol.dispose]();}
});

test('Exact one-layer escaped ETag passes SDK, becomes the native strong value and binds the real stdio preview',async()=>{
 const {session,ctx,log}=await connect(true);
 try{
  const tool=session.tools.find(t=>t.name==='calendar_prepare_meeting');
  const args={...update,etag:'\\'+identifiers.etag.slice(0,-1)+'\\"'};
  const before=structuredClone(args);
  assert.equal(args.etag.length,36);
  assert.doesNotThrow(()=>tool.checkParameters(args));
  const result=await tool.implementation(args,ctx);
  assert.equal(result.isError,undefined,JSON.stringify(result));
  assert.equal(result.structuredContent.ready,true);
  assert.equal(result.structuredContent.submission.etag,identifiers.etag);
  assert.equal(result.structuredContent.preview.title,update.details.title);
  assert.equal(result.structuredContent.preview.sequence,1);
  assert.deepEqual(args,before);
  for(const bad of ['unquoted','W/"weak"','"unterminated','"bad\nvalue"','\\\\"double\\\\"','\\"interior"quote\\"']){
   assert.throws(()=>tool.checkParameters({...update,etag:bad}),undefined,bad);
  }
  const stale={...update,etag:'"stale-version"'};
  assert.doesNotThrow(()=>tool.checkParameters(stale));
  const rejected=await tool.implementation(stale,ctx);
  assert.equal(rejected.isError,true);
  assert.match(JSON.stringify(rejected),/verändert|Besprechung/);
  const calls=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(calls.every(c=>!['PUT','POST','DELETE','PROPPATCH'].includes(c.method)));
 }finally{session[Symbol.dispose]();}
});

test('Native cancellation preview still works, without changing or sending anything',async()=>{
 const {session,ctx,log}=await connect(true);
 try{
  const tool=session.tools.find(t=>t.name==='calendar_prepare_meeting');
  tool.checkParameters(cancel);
  const result=await tool.implementation(cancel,ctx);
  assert.equal(result.isError,undefined,JSON.stringify(result));
  assert.equal(result.structuredContent.ready,true);
  assert.equal(result.structuredContent.action,'cancel');
  assert.equal(result.structuredContent.nativeSchedulingRequested,false);
  const calls=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(calls.every(c=>!['PUT','POST','DELETE','PROPPATCH'].includes(c.method)));
 }finally{session[Symbol.dispose]();}
});
