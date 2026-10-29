// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated DAV fixture used by the real personal-core child process.
const assert=require('node:assert/strict');
const {appendFileSync}=require('node:fs');
const home='/remote.php/dav/files/Soul';
const directory='/Fixture_MixedCase_Tests';
const basename='FIXTURE_REFERENCE';
const mapPath=directory+'/'+basename+'.km',sourcePath=directory+'/'+basename+'.txt';
const root='fixture_reference_root';
const sourceText='Referenzprüfung – ÄÖÜ äöü ß\nZeile 2 bleibt erhalten.\n';
const map={id:'70001',etag:'"fixture-map-v1"',text:JSON.stringify({root:{data:{id:root,text:'Referenzprüfung A01 Integration'},children:[]},template:'default',theme:'fresh-blue'})};
const source={id:'70002',etag:'"fixture-source-v1"',text:sourceText};
let sourceReads=0,writes=0;
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const row=(path,props)=>`<d:response><d:href>${esc(path)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
const multi=s=>new Response(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">${s}</d:multistatus>`,{status:207});
const properties=(node,folder=false)=>`<d:resourcetype>${folder?'<d:collection/>':''}</d:resourcetype><d:getetag>${esc(node.etag)}</d:getetag><d:getcontentlength>${Buffer.byteLength(node.text??'')}</d:getcontentlength><d:getcontenttype>text/plain</d:getcontenttype><oc:fileid>${node.id}</oc:fileid><oc:permissions>${folder?'RGDNVCK':'RGDNVW'}</oc:permissions><nc:hide-download>false</nc:hide-download>`;
const folder={id:'4645',etag:'"directory-v1"'},rootFolder={id:'1',etag:'"root-v1"'};
globalThis.fetch=async(url,o={})=>{
 const u=new URL(url),path=decodeURIComponent(u.pathname),method=o.method??'GET',headers=new Headers(o.headers);
 assert.equal(u.origin,'https://cloud.example.invalid');
 if(process.env.NS_TEST_REFERENCE_LOG)appendFileSync(process.env.NS_TEST_REFERENCE_LOG,JSON.stringify({method,path,ifMatch:headers.get('if-match')})+'\n');
 if(path==='/remote.php/dav/'&&method==='PROPFIND')return multi(row(path,'<d:current-user-principal><d:href>/remote.php/dav/principals/users/Soul/</d:href></d:current-user-principal>'));
 if(path==='/remote.php/dav/principals/users/Soul/'&&method==='PROPFIND')return multi(row(path,'<c:calendar-home-set><d:href>/remote.php/dav/calendars/Soul/</d:href></c:calendar-home-set>'));
 if(path==='/remote.php/dav/'&&method==='SEARCH')return multi(row(home+mapPath,properties(map))+row(home+sourcePath,properties(source)));
 if([home,home+'/',home+directory,home+directory+'/'].includes(path)&&method==='PROPFIND'){
  const isRoot=path===home||path===home+'/';
  let rows=row(path,properties(isRoot?rootFolder:folder,true));
  if(headers.get('depth')==='1')rows+=isRoot?row(home+directory+'/',properties(folder,true)):row(home+mapPath,properties(map))+row(home+sourcePath,properties(source));
  return multi(rows);
 }
 const node=path===home+mapPath?map:path===home+sourcePath?source:null;
 if(!node&&method==='PROPFIND')return new Response(null,{status:404});
 assert.ok(node,'Unexpected fixture route '+method+' '+path);
 if(method==='PROPFIND'){
  if(node===map&&process.env.NS_TEST_REFERENCE_FAULT==='replacement'){
   map.id='999';map.text=JSON.stringify({root:{data:{id:root,text:'replacement-secret-content'},children:[]}});
  }
  if(node===source){
   sourceReads++;
   if(process.env.NS_TEST_REFERENCE_FAULT==='stale-map')map.etag='"map-changed"';
   if(process.env.NS_TEST_REFERENCE_FAULT==='stale-source'&&sourceReads>1)source.etag='"source-changed"';
  }
  if(writes&&process.env.NS_TEST_REFERENCE_FAULT==='readback')return new Response(null,{status:403});
  return multi(row(path,properties(node)));
 }
 if(method==='GET'){
  assert.equal(headers.get('if-match'),node.etag);
  return new Response(node.text,{status:200,headers:{etag:node.etag}});
 }
 assert.equal(method,'PUT');assert.equal(node,map);writes++;
 assert.equal(headers.get('if-match'),map.etag);
 if(process.env.NS_TEST_REFERENCE_FAULT==='put-conflict')return new Response(null,{status:412});
 map.text=String(o.body);map.etag='"map-after-write"';
 return new Response(null,{status:204});
};
