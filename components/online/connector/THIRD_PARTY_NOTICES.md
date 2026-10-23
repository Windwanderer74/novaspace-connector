# Fremdsoftware und Lizenzhinweise

Die eigenen veröffentlichten Nextcloud-Dateien stehen unter AGPL-3.0-or-later. Fremdsoftware behält die nachstehend erfassten Bedingungen; ihre Texte und Copyright-Hinweise werden nicht durch die eigene Lizenz ersetzt.

Das Quellarchiv enthält keine `node_modules`, keine kompilierten Worker-/Browser-Bündel und keine von Dritten kopierten Bibliotheksquellen. Der Aufbau lädt die integritätsgebundenen Pakete aus dem Lockfile. Die hier mitgelieferten Lizenz-/Notice-Dateien stammen unverändert aus den installierten Paketen. Ein später weitergegebenes Binär-/Browser-Paket muss auch die Hinweise seiner tatsächlich enthaltenen weiteren Module erhalten; die gesamte Lockliste ist kein Beleg, dass jedes Paket ausgeliefert wird.

Die Browser-Paketierung wurde ausgeführt. Sie verwendet `@nextcloud/files` und mehrere weitere (A)GPL-Nextcloud-Bibliotheken. Vierzehn eigene Browser-/gemeinsame Quellen sind in demselben Baugraph enthalten. Die Veröffentlichung dieser eigenen zusammengehörigen Quellen unter AGPL ist die gewählte Projektzuordnung; daraus wird keine pauschale Aussage abgeleitet, dass jede API-Nutzung von Nextcloud rechtlich dieselbe Lizenz erzwingt. In der Online-Anwendung werden einige dieser eigenen Kerne ebenfalls verwendet. Eine separate proprietäre Ausgabe dieses gemeinsamen Codes wird hier nicht zugesagt.

`ical.js` 2.2.1 bleibt MPL-2.0; die unveränderte Bibliothek wird über das gesperrte Paket bezogen. Ihre Quelle ist im verlinkten Upstream-Repository verfügbar. DOMPurify bietet MPL-2.0 **oder** Apache-2.0 an; die Wahlmöglichkeit bleibt erhalten. Die Python-PDF-Hilfe setzt externe PDF-Werkzeuge voraus und bündelt diese nicht. Die historische PDF-Reparatur lädt smalot/pdfparser separat nach; siehe LEGACY_OPS.md.

| Paket | Version | Lizenz laut Paket | Erfasster Einsatz | Unveränderte Hinweise |
|---|---|---|---|---|
| @cloudflare/vite-plugin | 1.37.1 | MIT | direct build dependency | Siehe Paketquelle |
| @file-type/xml | 0.4.4 | MIT | observed browser build input | [LICENSE.txt](THIRD_PARTY_LICENSES/_file-type_xml/LICENSE.txt) |
| @modelcontextprotocol/server | 2.0.0 | MIT | direct dependency | [LICENSE](THIRD_PARTY_LICENSES/_modelcontextprotocol_server/LICENSE) |
| @nextcloud/auth | 2.6.0 | GPL-3.0-or-later | observed browser build input | [LICENSE](THIRD_PARTY_LICENSES/_nextcloud_auth/LICENSE) |
| @nextcloud/browser-storage | 0.5.0 | GPL-3.0-or-later | observed browser build input | [LICENSE](THIRD_PARTY_LICENSES/_nextcloud_browser-storage/LICENSE) |
| @nextcloud/capabilities | 1.2.1 | GPL-3.0-or-later | observed browser build input | [LICENSE](THIRD_PARTY_LICENSES/_nextcloud_capabilities/LICENSE) |
| @nextcloud/event-bus | 3.3.3 | GPL-3.0-or-later | observed browser build input | [vendor.LICENSE.txt](THIRD_PARTY_LICENSES/_nextcloud_event-bus/dist/vendor.LICENSE.txt) |
| semver | 7.8.5 | ISC | observed browser build input | [LICENSE](THIRD_PARTY_LICENSES/_nextcloud_event-bus_node_modules_semver/LICENSE) |
| @nextcloud/files | 4.1.0 | AGPL-3.0-or-later | direct dependency, observed browser build input | [LICENSE](THIRD_PARTY_LICENSES/_nextcloud_files/LICENSE) |
| @nextcloud/initial-state | 3.0.0 | GPL-3.0-or-later | observed browser build input | [LICENSE](THIRD_PARTY_LICENSES/_nextcloud_initial-state/LICENSE) |
| @nextcloud/l10n | 3.4.1 | GPL-3.0-or-later | observed browser build input | [LICENSE](THIRD_PARTY_LICENSES/_nextcloud_l10n/LICENSE) |
| @nextcloud/logger | 3.0.3 | GPL-3.0-or-later | observed browser build input | [LICENSE](THIRD_PARTY_LICENSES/_nextcloud_logger/LICENSE) |
| @nextcloud/paths | 3.1.0 | GPL-3.0-or-later | observed browser build input | [LICENSE](THIRD_PARTY_LICENSES/_nextcloud_paths/LICENSE) |
| @nextcloud/router | 3.2.0 | GPL-3.0-or-later | observed browser build input | [LICENSE](THIRD_PARTY_LICENSES/_nextcloud_router/LICENSE) |
| @tailwindcss/postcss | 4.2.1 | MIT | direct build dependency | [LICENSE](THIRD_PARTY_LICENSES/_tailwindcss_postcss/LICENSE) |
| @types/node | 22.19.19 | MIT | direct build dependency | [LICENSE](THIRD_PARTY_LICENSES/_types_node/LICENSE) |
| @types/react | 19.2.14 | MIT | direct build dependency | [LICENSE](THIRD_PARTY_LICENSES/_types_react/LICENSE) |
| @types/react-dom | 19.2.3 | MIT | direct build dependency | [LICENSE](THIRD_PARTY_LICENSES/_types_react-dom/LICENSE) |
| @vitejs/plugin-react | 6.0.2 | MIT | direct build dependency | [LICENSE](THIRD_PARTY_LICENSES/_vitejs_plugin-react/LICENSE) |
| @vitejs/plugin-rsc | 0.5.26 | MIT | direct build dependency | Siehe Paketquelle |
| dompurify | 3.4.16 | (MPL-2.0 OR Apache-2.0) | observed browser build input | [LICENSE](THIRD_PARTY_LICENSES/dompurify/LICENSE), [LICENSE-MPL](THIRD_PARTY_LICENSES/dompurify/LICENSE-MPL) |
| drizzle-kit | 0.31.10 | MIT | direct build dependency | Siehe Paketquelle |
| drizzle-orm | 0.45.2 | Apache-2.0 | direct dependency | Siehe Paketquelle |
| escape-html | 1.0.3 | MIT | observed browser build input | [LICENSE](THIRD_PARTY_LICENSES/escape-html/LICENSE) |
| eslint | 9.39.4 | MIT | direct build dependency | [LICENSE](THIRD_PARTY_LICENSES/eslint/LICENSE) |
| eslint-config-next | 16.2.6 | MIT | direct build dependency | Siehe Paketquelle |
| fast-xml-parser | 5.11.1 | MIT | direct dependency | [LICENSE](THIRD_PARTY_LICENSES/fast-xml-parser/LICENSE) |
| ical.js | 2.2.1 | MPL-2.0 | direct dependency | [LICENSE](THIRD_PARTY_LICENSES/ical.js/LICENSE) |
| is-svg | 6.1.0 | MIT | observed browser build input | [license](THIRD_PARTY_LICENSES/is-svg/license) |
| next | 16.2.6 | MIT | direct dependency | [license.md](THIRD_PARTY_LICENSES/next/license.md) |
| react | 19.2.6 | MIT | direct dependency | [LICENSE](THIRD_PARTY_LICENSES/react/LICENSE) |
| react-dom | 19.2.6 | MIT | direct dependency | [LICENSE](THIRD_PARTY_LICENSES/react-dom/LICENSE) |
| react-server-dom-webpack | 19.2.6 | MIT | direct build dependency | [LICENSE](THIRD_PARTY_LICENSES/react-server-dom-webpack/LICENSE) |
| sax | 1.6.1 | BlueOak-1.0.0 | observed browser build input | [LICENSE.md](THIRD_PARTY_LICENSES/sax/LICENSE.md) |
| tailwindcss | 4.2.1 | MIT | direct build dependency | [LICENSE](THIRD_PARTY_LICENSES/tailwindcss/LICENSE) |
| typescript | 5.9.3 | Apache-2.0 | direct build dependency | [LICENSE.txt](THIRD_PARTY_LICENSES/typescript/LICENSE.txt) |
| typescript-event-target | 1.1.2 | MIT | observed browser build input | [LICENSE](THIRD_PARTY_LICENSES/typescript-event-target/LICENSE) |
| vinext | 0.0.50 | MIT | direct build dependency | [LICENSE](THIRD_PARTY_LICENSES/vinext/LICENSE) |
| vite | 8.0.13 | MIT | direct build dependency | [LICENSE.md](THIRD_PARTY_LICENSES/vite/LICENSE.md) |
| wrangler | 4.92.0 | MIT OR Apache-2.0 | direct build dependency | Siehe Paketquelle |
| zod | 4.2.1 | MIT | direct dependency | [LICENSE](THIRD_PARTY_LICENSES/zod/LICENSE) |

Die vollständige, datei-/versionsgebundene Inventarliste mit Paketquellen und Integritätswerten steht in [DEPENDENCIES.json](DEPENDENCIES.json). Sie unterscheidet direkte Werkzeuge und tatsächlich beobachtete Browser-Baueingaben. Die genaue vom Worker nach Tree-Shaking verwendete Fremdmodulliste ist damit nicht vollständig nachgewiesen. `tools/dependency-report.py` erzeugt den Bericht nach `npm ci` und `npm run build:browser` erneut.
