// SPDX-License-Identifier: AGPL-3.0-or-later
// Read-only request preparation. Does not contact LM Studio or Nextcloud.
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {chatRequest,MAIN_TOPICS,EXTENSIONS}=require('./plugin.cjs');
const args=process.argv.slice(2);
let input='Antworte nur mit OK, ohne Werkzeugaufrufe.',model='qwen/qwen3-vl-4b';const topics=[];
for(let i=0;i<args.length;i++){
 if(args[i]==='--input')input=args[++i];
 else if(args[i]==='--model')model=args[++i];
 else if([...MAIN_TOPICS,...EXTENSIONS].includes(args[i]))topics.push(args[i]);
 else {console.error('Unbekanntes Argument. Themen: files deck mindmap calendar mail tables talk announcements inventory');process.exit(2);}
}
if(!input||!model){console.error('Modell oder Eingabe fehlt.');process.exit(2);}
const catalogue=JSON.parse(readFileSync(join(__dirname,'TOOL-MANIFEST.json'),'utf8'));
console.log(JSON.stringify(chatRequest({topics},input,model,catalogue.map(t=>t.name)),null,2));
