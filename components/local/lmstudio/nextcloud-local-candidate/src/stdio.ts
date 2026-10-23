// SPDX-License-Identifier: AGPL-3.0-or-later
import { pdfStatus } from '../lib/pdf-read';
import { readFileSync } from 'node:fs';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { validateConfig, configureCredentials, verifyIdentity, localServer, guardedFetch } from './local';

async function main() {
  const configPath = process.argv[2];
  if (!configPath) throw new Error('Pfad zur lokalen Konfiguration fehlt.');
  const config = validateConfig(JSON.parse(readFileSync(configPath,'utf8')));
  configureCredentials(config);
  globalThis.fetch = guardedFetch(globalThis.fetch,config.baseUrl);
  await verifyIdentity(config.expectedUser);
  if (process.argv.includes('--check')) {
    // Optional retired apps must not block the entire personal connector.
    const pdf = await pdfStatus();
    if (pdf.account !== config.expectedUser) throw new Error('PDF-Konto weicht ab.');
    process.stderr.write('OK: PDF-Brücke mit vorhandenem PHP-Leser und Test-PDF geprüft.\n');
    process.stderr.write('OK: lokaler Funktionskern und persönliche Nextcloud-Identität geprüft.\n');
    return;
  }
  serveStdio(() => localServer(config.scopes, config.groups), {onerror:() => process.stderr.write('MCP-Protokollfehler; Verbindung prüfen.\n')});
}
main().catch(() => {process.stderr.write('Start abgebrochen: Laufzeit, lokalen Zugang und erwartete Kontokennung prüfen. Keine Konfiguration geändert.\n');process.exitCode=2;});
