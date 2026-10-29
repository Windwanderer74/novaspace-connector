# Themenauswahl 0.1.19

Vorhandene Dateien bewusst aus files_search oder files_list auswählen und deren
fileRef an mindmap_read, files_stat oder files_read_text übergeben. Genau ein
Auswahlparameter ist erlaubt; die direkte Pfadangabe bleibt verfügbar.

Für Änderungen an gelesenen Mindmaps mindmapRef verwenden. Bei
mindmap_add_source_capsule und mindmap_link_file außerdem die sourceRef aus einer
frischen files_stat-Antwort verwenden. Keine zusätzlichen Pfad-/ID-/ETag-Felder
an die sechs gebundenen Mindmap-Schreibwerkzeuge übergeben. Alle übrigen Parameter
des jeweiligen Werkzeugs sind weiterhin erforderlich.

Referenzen gelten nur in derselben Werkzeug-Sitzung. Nach einem Schreibversuch
oder unklarem Ausgang den tatsächlichen Zustand lesen und Versionsbelege erneuern.
Keine Anlage blind wiederholen. Rechte und native Versionsprüfungen bleiben erhalten.

Diese öffentliche Fassung enthält bearbeitbare Quellen. Der historische Installer
ist standardmäßig gesperrt. Aufbau und Voraussetzungen: ../BUILD.md.
Testergebnis und Aussagegrenzen: ../../../../docs/updates/0.1.19.md.

Eigene Quellen: AGPL-3.0-or-later. Fremdsoftware behält ihre jeweiligen Lizenzen.
