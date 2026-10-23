# Integration und Testinstallation

Dieses Dokument gehört zum App-Quellpaket vom 23. Oktober 2026. Es beschreibt den vorgesehenen Einbau und seine offenen Abnahmen. Das Paket ist noch kein freigegebenes Produktionsupdate. Insbesondere muss die in [SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json) dokumentierte Metadatenabweichung vor einem Update des bestehenden Betriebs geklärt werden.

## Voraussetzungen

- Eine getrennte Nextcloud-Testinstallation der Hauptversion **34**, entsprechend den erhaltenen App-Metadaten. Die vollständige Nextcloud-/PHP-/Datenbank-Versionsmatrix ist noch praktisch abzunehmen.
- Ein App-Verzeichnis `novaspace_platform` in einem dafür konfigurierten beschreibbaren Nextcloud-App-Pfad. Der Inhalt von `app/` gehört unmittelbar hinein; `appinfo/info.xml` muss direkt darunter liegen.
- Bei Online-Anbindung ein eigener bestätigter Gateway-Kontext und eine persönliche Verbindung. Das Paket enthält keine funktionsfähigen fremden Vertrauensdaten oder Zugangsdaten.
- Für GitHub-Funktionen die passende vorhandene `deckgithubsync`-App und ein persönlich dort eingerichteter GitHub-Zugang. Die verwendeten Dienstschnittstellen sind in [app/lib/Service/GithubBridgeService.php](app/lib/Service/GithubBridgeService.php) sichtbar. Eine allgemeine Kompatibilitätsfreigabe für beliebige Versionen wird nicht behauptet.
- Der enthaltene Inventory-Adapter ist optional und auf den vorhandenen Stand `inventory` 0.1.5.1 sowie zwei konkrete Quelldateihashes begrenzt. Ohne die passende App beziehungsweise ohne ausdrückliche Freigabe stehen diese Operationen nicht bereit.

Nextcloud, `deckgithubsync` und Inventory werden nicht mitgeliefert. Ihre jeweiligen Lizenzbedingungen bleiben bestehen.

## Vorhandenen Betrieb erhalten

Dieses Quellpaket soll die bisherige Installation zunächst dokumentieren und in einer getrennten Umgebung geprüft werden. Es enthält keine pauschale Überschreib- oder Reparaturroutine für eine vorhandene App. Ein bestehender Ordner gleicher Versionsnummer darf nicht allein aufgrund der Nummer als identisch behandelt werden.

Vor einem späteren Produktionsupdate sind der aktuelle App-Baum, `appinfo/info.xml`, die persönliche Vertrauenskonfiguration, Aktivierungszustand und Datenbankschema frisch zu vergleichen. Quell- und Datenbanksicherungen sowie der konkrete Wiederherstellungsweg gehören zu dieser gesonderten Abnahme.

## Vertrauenskonfiguration

`app/appinfo/trusted-gateway.json` und `trusted-gateway.example.json` enthalten absichtlich inaktive Werte. Ein leerer `publicKey` erlaubt keine signierten Online-Aufrufe. Das Kopieren des Pakets übernimmt dadurch keine bestehende Verbindung und aktiviert keine Hintergrundsynchronisation.

Für eine eigene geprüfte Anbindung müssen die folgenden Werte aus dem tatsächlich verwendeten Gateway übernommen werden:

| Feld | Bedeutung |
|---|---|
| `kid` | Genau die Schlüsselkennung des verwendeten Signaturschlüssels |
| `issuer` | Genau der vom Gateway verwendete Aussteller |
| `audienceBase` | Vollständige eigene Basis der Registry-OCS-Adresse; einschließlich eines eventuell vorhandenen Nextcloud-Unterpfads |
| `publicKey` | Öffentlicher RSA-Schlüssel dieses Gateways im PEM-Format |
| `label` | Verständliche Bezeichnung für die persönliche Einrichtung |

Die Beispieladresse lautet `https://nextcloud.example.invalid/ocs/v2.php/apps/novaspace_platform/api/v1/registry`. Die Zwecke `setup`, `status`, `inventory` und `github` werden vom Prüfer selbst ergänzt. Ein öffentlicher Schlüssel ist kein Passwort. Private Signaturschlüssel und persönliche App-Passwörter gehören nicht in dieses Repository.

Das App-Paket bringt keine Einrichtung eines Online-Gateways und keinen vollständigen Online-Connector mit. Dafür werden die entsprechenden Komponenten und ihre eigenen Konfigurationen benötigt.

## Geplanter Ablauf in einer frischen Testinstallation

1. Den Paketinhalt und die SHA-256-Nachweise prüfen; das App-Archiv zunächst außerhalb der Nextcloud-Installation entpacken.
2. Den App-Baum in den vorgesehenen Test-App-Pfad übernehmen. Es darf dort noch keine vorhandene App gleichen Namens und keine unerwarteten `ns_pf_*`-Tabellen geben.
3. Mit dem zur Testinstallation gehörenden PHP und dem dort üblichen technischen Konto `php occ app:enable novaspace_platform` ausführen. Dabei werden native Migrationen erwartet. Das erfolgreiche Kommando und die tatsächlich angelegten Tabellen müssen separat geprüft werden.
4. In einer persönlichen Websitzung die Seite „KI-Verbindungen“ öffnen. Ohne konfiguriertes Gateway kann noch keine signierte Online-Verbindung eingerichtet werden.
5. Erst mit einer bestätigten Test-Gateway-Konfiguration die persönliche Registrierung und begrenzte App-Freigabe prüfen. Der technische Aufrufer und der logische Eigentümer müssen dabei unterscheidbar bleiben.
6. Widerruf, ausgeschaltete Freigaben, falsche Identität, abgelaufene Signaturen und gleichzeitige Änderungen praktisch prüfen. GitHub-Schreibversuche gehören ausschließlich in ausdrücklich gewählte Testziele.

Die Migrationen legen die Registry-/Journal-, Inventory-Freigabe-/Journal- und App-Freigabetabellen an. Sie verweigern unerwartet bereits vorhandene Tabellen. Ein Testlauf ersetzt deshalb keinen geprüften Aktualisierungspfad für eine bestehende Installation.

## Abnahme und Rückweg

Die verbleibende praktische Prüfung umfasst mindestens Datenbankmigrationen auf der gewählten Datenbank, Nextcloud-Abhängigkeitsauflösung, UI-/HTTP- und CSRF-Verhalten, Widerruf sowie die optionalen externen App-Schnittstellen. Die Fixture-Prüfungen in diesem Repository belegen diese HTTP-/Datenbankabnahme nicht.

Ein Abschalten über Nextcloud widerruft nicht automatisch jeden bereits bestehenden externen Token. Vorhandene persönliche Verbindungen, externe Sync-Zuordnungen und deren Zeitpläne müssen entsprechend ihrem tatsächlichen Eigentümer und Betriebszustand getrennt behandelt werden. Daten und Journale werden nicht als Aufräummaßnahme gelöscht.
