// SPDX-License-Identifier: AGPL-3.0-or-later
import {type PluginContext} from '@lmstudio/sdk';
import {configSchematics} from './config';
import {toolsProvider} from './toolsProvider';
export {configSchematics,toolsProvider};
export {provideSelectedTools} from './toolsProvider';
export * from './localMcp';
export * from './calendarMeetingInput';
export * from './readReferences';
export * from './selection';
export async function main(context: PluginContext) {
  context.withConfigSchematics(configSchematics);
  context.withToolsProvider(toolsProvider);
}
