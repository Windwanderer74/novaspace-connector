# Herkunft des älteren lokalen Startwegs

Stand: **23. Oktober 2026**. Ergänzung zum unveränderten [LM-Studio-Quellsnapshot](../components/local/lmstudio/README.md).

## Zugeordnete Python-Grundlage

Die historische Installationsdokumentation nennt das Projekt **street1983nk/nextcloud-mcp-connector**, Version **0.1.13**, und den tatsächlich verwendeten Commit **ef6c481db897e1409b9e83dc0602ccbb3f73cf6b**. Die Quellen wurden jetzt erneut genau an diesem Commit gelesen. Die frühere pauschale Aussage, auch die Herkunft und Lizenz dieses Python-Pakets seien ungeklärt, ist damit überholt.

| Nachweis | Ergebnis |
|---|---|
| [Paketmetadaten](https://github.com/street1983nk/nextcloud-mcp-connector/blob/ef6c481db897e1409b9e83dc0602ccbb3f73cf6b/pyproject.toml) | Paketname und Version 0.1.13 bestätigt; Python >=3.13 |
| [Lizenztext](https://github.com/street1983nk/nextcloud-mcp-connector/blob/ef6c481db897e1409b9e83dc0602ccbb3f73cf6b/LICENSE) | AGPL-3.0-or-later in den Metadaten; vollständiger AGPL-v3-Text vorhanden |
| [stdio-Einstieg](https://github.com/street1983nk/nextcloud-mcp-connector/blob/ef6c481db897e1409b9e83dc0602ccbb3f73cf6b/src/mcp_connector/entry_stdio.py) | nc-mcp verweist auf mcp_connector.entry_stdio:main |
| [Upstream-Lockfile](https://github.com/street1983nk/nextcloud-mcp-connector/blob/ef6c481db897e1409b9e83dc0602ccbb3f73cf6b/uv.lock) | 60 Einträge einschließlich Projekt, Entwicklungsabhängigkeiten und Plattformvarianten; kein Abbild der installierten Windows-Umgebung |

Die zurückgegebenen Git-Blob-Hashes aller vier Dateien wurden lokal aus dem vollständigen Inhalt nachgerechnet. Der [maschinelle Nachweis](LEGACY_STARTUP_SOURCE.json) enthält zusätzlich SHA-256-Hashes, deklarierte direkte Anforderungen und sämtliche Namen/Versionen des Upstream-Lockfiles.

Direkt deklariert sind mcp[cli]>=2.0,<3, cryptography>=50,<51, httpx>=0.28,<0.29, lxml>=6.1,<7, icalendar>=7.2,<8, vobject>=0.9.9,<1, pydantic>=2.12,<3 und tzdata>=2025.2. Die damalige Installation per Git-Commit und uv pip install beweist keine Installation exakt nach uv.lock. Ein historischer erfolgreicher Paketkonsistenztest ersetzt diese Inventur ebenfalls nicht.

## Persönliches Startskript als verbleibende Grenze

Das zusätzliche Windows-Skript start_nextcloud.py ist ein eigener lokaler Wrapper. Laut Installationsprotokoll entschlüsselt es den persönlichen Zugang mit Windows-DPAPI, prüft das Ziel und ruft den Python-Einstieg auf. Der veröffentlichte Adapter start_local.py verwendet diesen bestehenden Wrapper über einen geprüften Dateihash. Die erhaltenen lokalen Archive 1.7.0-local.1 und 1.21.0-local.1 verweisen ebenfalls auf die bestehende Python-Installation; sie enthalten das persönliche Skript nicht.

**Der exakte Wrapper-Quellcode, seine aktuelle Dateiversion und die tatsächlich installierten Python-Abhängigkeiten sind weiterhin nicht abgeglichen.** Der Quelltext der Python-Grundlage darf damit nicht mit dem fehlenden persönlichen Wrapper gleichgesetzt werden. Aus dieser Prüfung entsteht weder ein eigenständiger Erstinstaller noch eine neue Windows-/LM-Studio-/Modellabnahme.

Dieser Nachtrag enthält Herkunftsangaben und feste öffentliche Quellverweise. Python-Upstream-Code, persönliche Zugangskonfiguration und geschützte Zugangsdaten werden hier nicht gebündelt. Bei einer späteren Bündelung der Python-Laufzeit müssen die tatsächlich mitgelieferten Abhängigkeiten und Fremdhinweise gesondert aufgenommen werden.

Der veröffentlichte 200-Dateien-Snapshot und sein Manifest bleiben unverändert; dessen ursprüngliche Hinweise zur damals noch offenen Herkunft sind mit diesem datierten Nachtrag zu lesen. Nächster lokaler Schritt ist die gezielte Quellenaufnahme des Wrappers ohne Zugangsdaten, anschließend die Inventur und ein gesonderter Erstinstallationsweg.
