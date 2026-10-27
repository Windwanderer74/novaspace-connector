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
  for(const field of ['taskDescription','syncTaskContent','expectedMapEtag'])assert.ok(workerSource.includes(field),`Built Worker misses shared task field ${field}.`);
  for(const name of ['deck_read_trash','deck_prepare_trash','deck_trash_item','deck_restore_item','contacts_prepare_context','contacts_read_book_shares','contacts_change_book_share','contacts_prepare_book_delete','contacts_delete_book','contacts_find_duplicates','contacts_prepare_merge','contacts_merge_selected','contacts_prepare_transfer','contacts_transfer','contacts_read_options','contacts_set_favorite','contacts_read_photo','contacts_set_photo','contacts_remove_photo','calendar_read_occurrence','calendar_update_occurrence','calendar_reset_occurrence','calendar_read_scheduling','calendar_read_invitation','calendar_respond_invitation','calendar_export_ics','calendar_prepare_ics_import','calendar_import_ics','contacts_read_addressbook_settings','contacts_create_addressbook','contacts_update_addressbook','contacts_export_vcf','contacts_prepare_vcf_import','contacts_import_vcf','tasks_read_list_settings','tasks_create_list','tasks_update_list','deck_read_board_shares','deck_create_board_share','deck_update_board_share','deck_revoke_board_share'])assert.ok(workerSource.includes(name),`Built Worker misses ${name}; rebuild from current source before packaging.`);
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
