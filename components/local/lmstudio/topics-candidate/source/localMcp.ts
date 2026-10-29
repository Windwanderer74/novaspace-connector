// SPDX-License-Identifier: AGPL-3.0-or-later
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {rawFunctionTool,type Tool} from '@lmstudio/sdk';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport,type StdioServerParameters} from '@modelcontextprotocol/client/stdio';
import {selectTools,type Selection} from './selection';
import {calendarMeetingModelSchema,calendarMeetingNativeArguments} from './calendarMeetingInput';
import {ReadReferences,ReadReferenceError,readReferenceModelSchema,readReferenceDescription} from './readReferences';

export interface SourceSettings {parameters:StdioServerParameters;expectedUser:string}
export interface LocalSession {tools:Tool[];[Symbol.dispose]():void}

const json=(path:string)=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
export function loadSourceSettings(home=homedir(),platform=process.platform):SourceSettings {
  if(platform!=='win32')throw new Error('Dieser Pilot verwendet den bestätigten Windows-Startweg.');
  const config=json(join(home,'.lmstudio','mcp.json'));
  const entry=config?.mcpServers?.['nextcloud-pilot-next2'];
  if(!entry||typeof entry.command!=='string'||!Array.isArray(entry.args)||entry.args.some((a:unknown)=>typeof a!=='string'))throw new Error('Bestätigter MCP-Startweg fehlt.');
  const scripts=entry.args.filter((a:string)=>a.endsWith('start_local.py'));
  if(scripts.length!==1)throw new Error('Unerwarteter MCP-Startweg.');
  const root=dirname(resolve(scripts[0]));
  const receipt=json(join(root,'installation.json')),local=json(join(root,'local.json'));
  if(!['1.21.0-local.1','1.22.0-local.1','1.25.2-local.1','1.26.0-local.1','1.27.0-local.1','1.28.0-local.1','1.29.0-local.1','1.30.0-local.1','1.31.0-local.1','1.32.0-local.1','1.35.0-local.1','1.35.1-local.1','1.36.0-local.1'].includes(receipt.version)||JSON.stringify(receipt.installedEntry)!==JSON.stringify(entry)||
    !local.expectedUser||local.expectedUser!==receipt.expectedUser||local.baseUrl!=='https://cloud.example.invalid')throw new Error('MCP-Installation oder Kontozuordnung weicht ab.');
  const hashes=json(join(root,'SHA256SUMS.json'));
  for(const file of ['start_local.py','dist/nextcloud-local.cjs']){
    if(typeof hashes[file]!=='string'||createHash('sha256').update(readFileSync(join(root,file))).digest('hex')!==hashes[file])throw new Error('Vorhandener MCP-Programmstand wurde verändert.');
  }
  // Never pass LM Studio's plugin identity/passkey, API tokens or inherited
  // Nextcloud secrets into this child. Its existing launcher obtains DPAPI data.
  return {expectedUser:local.expectedUser,parameters:{command:entry.command,args:entry.args,
    cwd:root,env:{PYTHONUTF8:'1',NC_MCP_TALK_SEND:'false'},stderr:'ignore',maxBufferSize:16*1024*1024}};
}

export async function connectLocalMcp(source:SourceSettings,selection:Selection,signal:AbortSignal):Promise<LocalSession> {
  signal.throwIfAborted();
  const client=new Client({name:'novaforge-themenauswahl',version:'0.1.19'});
  const transport=new StdioClientTransport(source.parameters);
  const references=new ReadReferences(source.expectedUser);
  let closed=false;
  const close=()=>{
    if(closed)return;closed=true;references.clear();signal.removeEventListener('abort',close);
    void client.close().catch(()=>{});
  };
  signal.addEventListener('abort',close,{once:true});
  try {
    await client.connect(transport,{signal,timeout:45000});
    const listed=await client.listTools({}, {signal,timeout:45000});
    const selected=selectTools(listed.tools,selection);
    const account=await client.callTool({name:'nextcloud_account',arguments:{}},{signal,timeout:45000});
    let identity:any=account.structuredContent;
    if(!identity?.uid){
      const block=account.content.find(c=>c.type==='text');
      if(block?.type==='text')identity=JSON.parse(block.text);
    }
    if(account.isError||identity?.uid!==source.expectedUser)throw new Error('MCP-Kontoprüfung fehlgeschlagen.');
    signal.throwIfAborted();
    const tools=selected.map(definition=>rawFunctionTool({name:definition.name,description:readReferenceDescription(definition.name,definition.description??''),
      parametersJsonSchema:readReferenceModelSchema(definition.name,calendarMeetingModelSchema(definition.name,definition.inputSchema)),
      implementation:async(args,ctx)=>{
        if(closed)throw new Error('Lokale Werkzeug-Sitzung ist beendet.');
        ctx.signal.throwIfAborted();
        let nativeArgs;
        try {nativeArgs=references.nativeArguments(definition.name,calendarMeetingNativeArguments(definition.name,definition.inputSchema,args));}
        catch(error){
          if(!(error instanceof ReadReferenceError))throw error;
          const data={code:'read_reference_required',message:error.message};
          return {isError:true,structuredContent:data,content:[{type:'text' as const,text:JSON.stringify(data)}]};
        }
        try{
          const result=await client.callTool({name:definition.name,arguments:nativeArgs},{signal:ctx.signal,timeout:60000});
          return references.observe(definition.name,nativeArgs,result,args);
        }
        catch{throw new Error('Lokaler MCP-Aufruf nicht bestätigt. Bei Änderungen zuerst den tatsächlichen Objektstand prüfen.');}
      }}));
    return {tools,[Symbol.dispose]:close};
  }catch{
    close();await transport.close().catch(()=>{});
    throw new Error('Lokaler MCP-Zugang nicht gestartet. Bestätigten Startweg, eigene Kontokennung und Nextcloud-Erreichbarkeit prüfen.');
  }
}
