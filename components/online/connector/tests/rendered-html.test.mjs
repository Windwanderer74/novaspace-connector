// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from 'node:fs/promises';

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("serves the connector and its linked user guide", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  // Verify the actual deployment output, not just source-compiled unit fixtures.
  const workerSource=await readFile(workerUrl,'utf8');
  for(const name of ['calendar_export_ics','calendar_prepare_ics_import','calendar_import_ics','contacts_read_addressbook_settings','contacts_create_addressbook','contacts_update_addressbook','contacts_export_vcf','contacts_prepare_vcf_import','contacts_import_vcf','tasks_read_list_settings','tasks_create_list','tasks_update_list'])assert.ok(workerSource.includes(name),`Built Worker misses ${name}; rebuild from current source before packaging.`);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const home = await response.text();
  assert.doesNotMatch(home, developmentPreviewMeta);
  assert.match(home, /NovaSpace Connector/);
  assert.match(home, /href="\/anleitung"/);
  const guide = await worker.fetch(new Request("http://localhost/anleitung", {
    headers: { accept: "text/html" },
  }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, {
    waitUntil() {}, passThroughOnException() {},
  });
  assert.equal(guide.status, 200);
  const guideText = await guide.text();
  assert.match(guideText, /Fünf Beispiele für den Anfang/);
  assert.match(guideText, /Dateien finden und kopieren/);
  assert.match(guideText, /Dateifreigaben verwalten/);
  assert.match(guideText, /Papierkorb und Wiederherstellen/);
  assert.match(guideText, /ein vorhandenes Ziel wird nicht überschrieben/);
  assert.match(guideText, /ICS-Datei bis 128 KiB/);
  assert.match(guideText, /Zum Import eine einzelne ICS-Datei/);
  assert.match(guideText, /vCard-Datei bis 128 KiB/);
  assert.match(guideText, /eigene Adressbücher anlegen/);
  assert.match(guideText, /eigene Aufgabenliste anlegen/);
});
