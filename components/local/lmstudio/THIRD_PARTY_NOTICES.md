# Fremdsoftware

Die eigenen Nextcloud-Komponenten stehen unter AGPL-3.0-or-later. Übernommene Lizenztexte bleiben unverändert in den jeweiligen THIRD_PARTY_LICENSES-Verzeichnissen. SDK-/Bibliotheksquellen und generierte Bündel sind nicht Bestandteil dieses öffentlichen Quellarchivs; der gesperrte Aufbau bezieht sie separat.

| Bestandteil | Gesperrte Version | Eigene Upstream-Lizenz |
|---|---|---|
| LM Studio SDK | 1.5.0 | Apache-2.0 |
| LM Studio lms-isomorphic | 0.4.6 | Apache-2.0 |
| Model Context Protocol Server | 2.0.0 | MIT |
| Model Context Protocol Client | 2.3.1 | MIT |
| ical.js | 2.2.1 | MPL-2.0 |
| fast-xml-parser | 5.11.1 | MIT |
| zod | 4.2.1 / SDK-intern 3.25.76 | MIT |
| zod-to-json-schema | 3.25.2 | ISC |
| esbuild | Kern 0.28.0 / Themen 0.25.12 | MIT |

Die vollständigen Paketquellen, Integritätswerte, weiteren Abhängigkeiten und Hinweise stehen in [DEPENDENCIES.json](DEPENDENCIES.json). Die ursprünglichen Fremdhinweise aus dem erhaltenen ZIP sind zusätzlich erhalten. Upstream-Quellen: [LM Studio](https://github.com/lmstudio-ai/lmstudio.js), [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [ical.js](https://github.com/kewisch/ical.js). Die reine Nennung eines gesperrten Pakets beweist nicht seine Aufnahme in ein erzeugtes Bündel.

Der ältere Python-DPAPI-Startweg `nextcloud-mcp-connector` 0.1.13 ist eine externe historische Voraussetzung. Sein konkretes Quellpaket, seine vollständigen Abhängigkeiten und Lizenz sind noch nicht aus einem passenden Originalpaket verifiziert; sie werden nicht durch die Lizenz dieses Repositories ersetzt oder stillschweigend mitlizenziert. Siehe BUILD.md.
