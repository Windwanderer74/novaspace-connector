// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  GITHUB_READ_SCOPE, GITHUB_WRITE_SCOPE,
  DECK_SHARE_SCOPE, DECK_TRASH_SCOPE,
  TASKS_READ_SCOPE, TASKS_WRITE_SCOPE, CONTACTS_READ_SCOPE, CONTACTS_WRITE_SCOPE, CONTACTS_SHARE_SCOPE, CONTACTS_MANAGE_SCOPE,
  NOTES_READ_SCOPE,
  NOTES_WRITE_SCOPE,
  allowedUserEmail,
  CALENDAR_READ_SCOPE,
  CALENDAR_WRITE_SCOPE,
  CALENDAR_SCHEDULE_SCOPE,
  CALENDAR_ORGANIZE_SCOPE,
  CALENDAR_MANAGE_SCOPE, CALENDAR_SHARE_SCOPE,
  canonicalResource,
  createAuthorizationCode,
  FILES_READ_SCOPE,
  FILES_WRITE_SCOPE,
  FILES_SHARE_SCOPE,
  FILES_TRASH_SCOPE,
  FILES_ORGANIZE_SCOPE,
  FILES_PDF_SCOPE,
  FILES_DOWNLOAD_SCOPE,
  NEXTCLOUD_READ_SCOPE,
  TALK_READ_SCOPE,
  MAIL_READ_SCOPE,
  ANNOUNCEMENTS_READ_SCOPE,
  TABLES_READ_SCOPE,
  TABLES_WRITE_SCOPE,
  INVENTORY_READ_SCOPE,
  INVENTORY_WRITE_SCOPE,
  normalizeScope,
  oauthOrigin,
  validRedirectUri,
  verifyClientId,
} from "../../../lib/oauth";

export const runtime = "edge";

type AuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  resource: string;
  scope: string;
};

function html(value: string, status = 200) {
  return new Response(value, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function signedInEmail(request: Request) {
  return request.headers.get("oai-authenticated-user-email")?.toLocaleLowerCase("de") ?? null;
}

async function parseAuthorizationRequest(values: URLSearchParams): Promise<AuthorizationRequest> {
  const clientId = values.get("client_id") ?? "";
  const redirectUri = values.get("redirect_uri") ?? "";
  const state = values.get("state") ?? "";
  const codeChallenge = values.get("code_challenge") ?? "";
  const resource = values.get("resource") ?? "";
  if (values.get("response_type") !== "code") throw new Error("Unsupported response_type.");
  if (values.get("code_challenge_method") !== "S256" || !codeChallenge) throw new Error("PKCE S256 is required.");
  if (!validRedirectUri(redirectUri) || resource !== canonicalResource() || !state) throw new Error("Invalid redirect, resource, or state.");
  const client = await verifyClientId(clientId);
  if (!client.redirectUris.includes(redirectUri)) throw new Error("Redirect URI is not registered for this client.");
  return { clientId, redirectUri, state, codeChallenge, resource, scope: normalizeScope(values.get("scope")) };
}

function signInRedirect(request: Request) {
  const current = new URL(request.url);
  const returnTo = `${current.pathname}${current.search}`;
  return Response.redirect(new URL(`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`, current.origin), 302);
}

export async function GET(request: Request) {
  let input: AuthorizationRequest;
  try {
    input = await parseAuthorizationRequest(new URL(request.url).searchParams);
  } catch (error) {
    return html(`<h1>Ungültige OAuth-Anfrage</h1><p>${escapeHtml(error instanceof Error ? error.message : "Unbekannter Fehler")}</p>`, 400);
  }

  const email = signedInEmail(request);
  if (!email) return signInRedirect(request);
  if (email !== allowedUserEmail()) return html("<h1>Zugriff verweigert</h1><p>Dieses Konto ist für den NovaSpace Connector nicht freigegeben.</p>", 403);

  const scopeDescriptions: Record<string, string> = {
    "tasks:read": "Sichtbare native Aufgabenlisten und VTODO-Aufgaben lesen",
    "tasks:write": "Eigenständige Aufgaben anlegen, bearbeiten, erledigen und gezielt löschen; zusätzliche Aufgabenleserechte nötig",
    "contacts:read": "Sichtbare CardDAV-Adressbücher und Kontakte lesen",
    "contacts:share": "Zusatz: eigene Adressbücher ausdrücklich für lokale Nutzer/Gruppen zum Lesen/Bearbeiten freigeben oder Freigaben aufheben; betrifft bestehende/künftige Kontakte; native Benachrichtigungen möglich",
    "contacts:manage": "Zusatz: gesamtes eigenes Adressbuch nach Umfangsvorschau dauerhaft entfernen, einschließlich aller Kontakte und Freigaben; kein zugesagter Wiederherstellungsweg",
    "contacts:write": "Kontakte anlegen, versionsgebunden bearbeiten, ausgewählte Werte nach Vergleich zusammenführen und gezielt löschen; zusätzliche Kontaktleserechte nötig; Adressbuchfreigaben und vollständiges Entfernen brauchen eigene Zusatzrechte",
    "notes:read": "Native Notizen einschließlich Inhalt, Kategorie und Favorit lesen",
    "notes:write": "Native Notizen anlegen und versionsgebunden bearbeiten; keine Löschung; zusätzlich Notizleserechte nötig",
    "deck:read": "Deck-Boards, Listen und Karten lesen",
    "deck:write": "Deck-Karten anlegen, bearbeiten und verschieben",
    "calendar:schedule": "Eigene Antwort auf einen Einzeltermin oder ausdrücklich eine ganze gespeicherte Masterserie ohne Einzelabweichungen übermitteln; kann native Mitteilung/E-Mail an den vorhandenen Organisator auslösen. Zusätzlich Kalender-Schreib-/Leserecht erforderlich",
    "calendar:manage": "Ganzen eigenen Kalender nach Umfangsvorschau entfernen oder nativ wiederherstellen; vorhandene Inhalte und Zugriffe betroffen, bei deaktiviertem Papierkorb dauerhaft. Keine einzelnen Besprechungsabsagen. Zusätzlich Kalender-Schreib-/Leserecht erforderlich",
    "calendar:share": "Eigene Kalender für ausdrücklich gewählte lokale Nutzer/Gruppen zum Lesen/Bearbeiten freigeben oder direkte Freigaben aufheben; betrifft bestehende/künftige Termine, native Mitteilungen möglich. Zusätzlich Kalender-Schreib-/Leserecht erforderlich",
    "calendar:organize": "Eigene Einladungen an ausdrücklich gewählte Teilnehmer, Besprechungsänderungen und Absagen nach Vorschau übermitteln; vollständiger Termininhalt wird geteilt, Absage entfernt das Original. Zusätzlich Kalender-Schreib-/Leserecht erforderlich",
    "calendar:read": "Verbundenes Nextcloud-Konto, Kalender und Termine lesen",
    "calendar:write": "Einzelne Kalendertermine anlegen, bearbeiten und löschen (einschließlich Prüfen und Zurücklesen)",
    "files:write": "NovaSpace-Ordner und Textdateien anlegen, Dateien/Ordner ohne Überschreiben kopieren sowie Textdateien aktualisieren (einschließlich Prüfen und Zurücklesen; keine Löschung)",
    "files:read": "NovaSpace-Ordner, Dateinamen, unterstützte Textdateien und eigene Dateifreigaben lesen",
    "files:trash": "Eigene Dateien/Ordner im persönlichen Heimspeicher in den Papierkorb löschen und gezielt wiederherstellen; keine endgültige Papierkorblöschung",
    "deck:trash": "Zusatz: ausgewählte Karten oder ganze Listen in den nativen Deck-Papierkorb legen und gezielt wiederherstellen; native Bereinigungsgrenzen und historische Mindmapfolgen bestätigen; Deck-Leserecht erforderlich",
    "deck:share": "Boardfreigaben für ausdrücklich gewählte lokale Nutzer/Gruppen anlegen, ändern oder aufheben; kann Zugriff erweitern und Benachrichtigungen auslösen. Aufheben einer Nutzerfreigabe entfernt deren Kartenzuständigkeiten; zusätzlich Deck-Leserecht nötig",
    "files:share": "Dateifreigaben für ausdrücklich gewählte Nutzer/Gruppen oder geschützte Links anlegen, ändern und aufheben; kann weitere Zugriffe auf Inhalte ermöglichen; zusätzlich Dateileserechte nötig",
    "files:organize": "Dateien und Ordner umbenennen und verschieben, ohne vorhandene Ziele zu überschreiben; keine eigenständigen Löschaktionen",
    "files:pdfread": "PDF-Textschichten seitenweise lesen und die PDF-Brücke prüfen; keine OCR oder Dateiänderung",
    "files:download": "Dateien herunterladen und gewählte Originalbilder zur Sichtprüfung abrufen; kurzlebige Downloadlinks für genau die gewählte Datei und Version erzeugen",
    "tables:write": "Tabellen und Spalten anlegen, Tabellen-/Spaltentitel und Datensätze versionsgebunden bearbeiten sowie persönliche Tabellenfreigaben für Soul erstellen; geschütztes Dokumentregister und Pilotzelle mit eigenen Werkzeugen; einschließlich Rücklesen, keine Löschung",
    "github:read": "Persönlichen GitHub-Zugang in Nextcloud, eigene Repositories, README und bestehende Deck-Synchronisation lesen; Zugangsdaten bleiben auf Nextcloud",
    "github:write": "Nach ausdrücklichem Auftrag öffentliche Projekt-READMEs schreiben und bestehende Deck-GitHub-Abgleiche auslösen; öffentliche Repository-Anlage eingeschlossen. Keine Softwarelizenz oder Quellcodeveröffentlichung. Zusätzlich github:read erforderlich",
    "inventory:read": "Geräte und native Details im eigenen Inventory-Bestand des hinterlegten Nextcloud-Kontos lesen; keine kontenübergreifende Freigabe",
    "inventory:write": "Neue Inventory-Stammdatensätze nach ausdrücklicher Kontoprüfung anlegen und zurücklesen; zusätzlich inventory:read erforderlich. Keine Bearbeitung oder Löschung bestehender Geräte und keine Soul-Freigabe",
    "tables:read": "Sichtbare Nextcloud-Tabellen, Spalten und Datensätze lesen und begrenzte Datensatzseiten durchsuchen; keine Änderungen",
    "nextcloud:read": "Nextcloud-Konto, Serverversion und sichtbare Funktionen prüfen (keine Inhalte oder Änderungen)",
    "announcements:read": "Sichtbare Nextcloud-Bekanntmachungen und Herausgeberauskunft lesen; ohne Veröffentlichen, Kommentieren, Löschen oder Benachrichtigungsänderung",
    "mail:read": "Vorhandene Nextcloud-Mailkonten, Ordner und Nachrichten lesen; ohne Versand, Entwürfe oder Gelesen-Markierung. Nextcloud kann interne Caches und Ordnerzuordnungen aktualisieren.",
    "talk:read": "Bestehende Nextcloud-Talk-Räume und Nachrichten lesen, einschließlich Konto-/Funktionsprüfung; ohne Senden, Beitritt oder Gelesen-Markierung",
  };
  const requested = input.scope.split(/\s+/).filter(Boolean);
  const permissions = requested.map(scope => `<li>${escapeHtml(scopeDescriptions[scope] ?? scope)}</li>`).join("");
  // Older connector registrations still request Deck scopes only. Offer the
  // additional permissions explicitly; never add them without checked consent.
  const optionalScopes = [GITHUB_READ_SCOPE, GITHUB_WRITE_SCOPE, DECK_SHARE_SCOPE, DECK_TRASH_SCOPE, CALENDAR_SCHEDULE_SCOPE, CALENDAR_ORGANIZE_SCOPE, CALENDAR_MANAGE_SCOPE, CALENDAR_SHARE_SCOPE, TASKS_READ_SCOPE, TASKS_WRITE_SCOPE, CONTACTS_READ_SCOPE, CONTACTS_WRITE_SCOPE, CONTACTS_SHARE_SCOPE, CONTACTS_MANAGE_SCOPE, NOTES_READ_SCOPE, NOTES_WRITE_SCOPE, CALENDAR_READ_SCOPE, FILES_READ_SCOPE, CALENDAR_WRITE_SCOPE, FILES_WRITE_SCOPE, NEXTCLOUD_READ_SCOPE, TALK_READ_SCOPE, MAIL_READ_SCOPE, ANNOUNCEMENTS_READ_SCOPE, FILES_ORGANIZE_SCOPE, FILES_PDF_SCOPE, FILES_DOWNLOAD_SCOPE, FILES_SHARE_SCOPE, FILES_TRASH_SCOPE, TABLES_READ_SCOPE, TABLES_WRITE_SCOPE, INVENTORY_READ_SCOPE, INVENTORY_WRITE_SCOPE].filter(scope => !requested.includes(scope));

  const optionalPermissions = optionalScopes.length ? `<fieldset style="border:1px solid #475569;border-radius:10px;padding:16px;margin:20px 0"><legend>Zusätzliche Zugriffe auswählen</legend><p>Aktiviere die gewünschten Bereiche. Kalender-Schreibzugriff erlaubt auch das Löschen einzelner Termine in deinen freigegebenen Kalendern.</p>${optionalScopes.map(scope => `<label style="display:block;margin:16px 0"><input type="checkbox" name="additional_scope" value="${scope}"> ${escapeHtml(scopeDescriptions[scope])}</label>`).join("")}<p>Ohne Auswahl bleibt es bei den oben aufgeführten Rechten. Diese Zustimmung allein legt noch keine Termine, Ordner oder Dateien an.</p></fieldset>` : "";
  const hidden = [
    ["response_type", "code"], ["client_id", input.clientId], ["redirect_uri", input.redirectUri],
    ["state", input.state], ["code_challenge", input.codeChallenge], ["code_challenge_method", "S256"],
    ["resource", input.resource], ["scope", input.scope],
  ].map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`).join("");

  return html(`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>NovaSpace Connector verbinden</title><body style="font-family:system-ui;max-width:680px;margin:64px auto;padding:0 24px;background:#020617;color:#e2e8f0"><h1>NovaSpace Connector verbinden</h1><p>Dein KI-Programm erhält die folgenden Zugriffe über das hinterlegte NovaSpace-Konto. Dessen Freigaben begrenzen die erreichbaren Inhalte.</p><ul>${permissions}</ul><p>Angemeldetes Konto: <strong>${escapeHtml(email)}</strong></p><form method="post">${hidden}${optionalPermissions}<button type="submit" name="decision" value="approve" style="padding:12px 18px;border:0;border-radius:10px;background:#2563eb;color:white;font-weight:700">Zugriff erlauben</button> <button type="submit" name="decision" value="deny" style="padding:12px 18px;border:1px solid #475569;border-radius:10px;background:#0f172a;color:#e2e8f0">Abbrechen</button></form></body></html>`);
}

export async function POST(request: Request) {
  const email = signedInEmail(request);
  if (!email) return signInRedirect(request);
  if (email !== allowedUserEmail()) return html("<h1>Zugriff verweigert</h1>", 403);

  const form = await request.formData();
  const values = new URLSearchParams();
  for (const [key, value] of form.entries()) if (typeof value === "string") values.set(key, value);
  let input: AuthorizationRequest;
  try {
    input = await parseAuthorizationRequest(values);
  } catch (error) {
    return html(`<h1>Ungültige OAuth-Anfrage</h1><p>${escapeHtml(error instanceof Error ? error.message : "Unbekannter Fehler")}</p>`, 400);
  }

  const redirect = new URL(input.redirectUri);
  redirect.searchParams.set("state", input.state);
  redirect.searchParams.set("iss", oauthOrigin());
  if (values.get("decision") !== "approve") {
    redirect.searchParams.set("error", "access_denied");
    return Response.redirect(redirect, 303);
  }

  const additionalScopes = form.getAll("additional_scope");
  if (additionalScopes.some(scope => typeof scope !== "string" || ![GITHUB_READ_SCOPE, GITHUB_WRITE_SCOPE, DECK_SHARE_SCOPE, DECK_TRASH_SCOPE, CALENDAR_SCHEDULE_SCOPE, CALENDAR_ORGANIZE_SCOPE, CALENDAR_MANAGE_SCOPE, CALENDAR_SHARE_SCOPE, TASKS_READ_SCOPE, TASKS_WRITE_SCOPE, CONTACTS_READ_SCOPE, CONTACTS_WRITE_SCOPE, CONTACTS_SHARE_SCOPE, CONTACTS_MANAGE_SCOPE, NOTES_READ_SCOPE, NOTES_WRITE_SCOPE, CALENDAR_READ_SCOPE, FILES_READ_SCOPE, CALENDAR_WRITE_SCOPE, FILES_WRITE_SCOPE, NEXTCLOUD_READ_SCOPE, TALK_READ_SCOPE, MAIL_READ_SCOPE, ANNOUNCEMENTS_READ_SCOPE, FILES_ORGANIZE_SCOPE, FILES_PDF_SCOPE, FILES_DOWNLOAD_SCOPE, FILES_SHARE_SCOPE, FILES_TRASH_SCOPE, TABLES_READ_SCOPE, TABLES_WRITE_SCOPE, INVENTORY_READ_SCOPE, INVENTORY_WRITE_SCOPE].includes(scope))) {

    return html("<h1>Ungültige zusätzliche Berechtigung</h1>", 400);
  }
  const grantedScope = normalizeScope([input.scope, ...additionalScopes].join(" "));
  const code = await createAuthorizationCode({
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    resource: input.resource,
    scope: grantedScope,
    email,
  });
  redirect.searchParams.set("code", code);
  return Response.redirect(redirect, 303);
}
