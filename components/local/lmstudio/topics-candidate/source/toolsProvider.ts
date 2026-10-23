// SPDX-License-Identifier: AGPL-3.0-or-later
import {type Tool, type ToolsProviderController} from '@lmstudio/sdk';
import {configSchematics} from './config';
import {MAIN_TOPICS,EXTENSIONS,selectedNames,type Selection} from './selection';
import {loadSourceSettings,connectLocalMcp,type LocalSession} from './localMcp';

type OpenSession=(selection:Selection,signal:AbortSignal)=>Promise<LocalSession>;
const openSession:OpenSession=(selection,signal)=>connectLocalMcp(loadSourceSettings(),selection,signal);

export async function provideSelectedTools(ctl: ToolsProviderController,open:OpenSession): Promise<Tool[]> {
  const config = ctl.getPluginConfig(configSchematics);
  const selection: Selection = {
    topics:[...MAIN_TOPICS,...EXTENSIONS].filter(t => config.get(t)),
    extraTools:config.get('extraTools'),excludedTools:config.get('excludedTools'),
  };
  // Validate user settings before opening the connector, even if all themes are off.
  const requested = selectedNames(selection);
  ctl.abortSignal.throwIfAborted();
  if (!requested.size) return [];
  let session: LocalSession | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ctl.abortSignal.removeEventListener('abort',dispose);
    session?.[Symbol.dispose]();
  };
  // The SDK aborts this signal on discardSession, including a normally completed
  // prediction. Keep the source alive for the whole session, not only tools/list.
  ctl.abortSignal.addEventListener('abort',dispose,{once:true});
  try {
    const opened = await open(selection,ctl.abortSignal);
    session = opened;
    if (disposed || ctl.abortSignal.aborted) {
      opened[Symbol.dispose]();
      ctl.abortSignal.throwIfAborted();
      throw new Error('Werkzeug-Sitzung beendet.');
    }
    return opened.tools;
  } catch {
    dispose();
    // Do not surface source-plugin exceptions, which may include local paths,
    // configuration details or authentication values.
    throw new Error('Themenauswahl nicht gestartet. Den bestätigten lokalen Anschluss nextcloud-pilot-next2 und dessen Kontozuordnung prüfen.');
  }
}
export async function toolsProvider(ctl:ToolsProviderController):Promise<Tool[]> {return provideSelectedTools(ctl,openSession);}
