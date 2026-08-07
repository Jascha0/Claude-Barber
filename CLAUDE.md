# Claude-Barber

Mehrmandantenfähige Buchungsplattform für Friseursalons (SaaS). Jeder Salon bekommt eine eigene Subdomain mit Buchungsseite; Kunden buchen online oder per WhatsApp, sagen selbst ab und bekommen automatisch Erinnerungen. Dazu ein Admin-Bereich pro Salon und ein Superadmin-Bereich für den Betreiber.

Läuft produktiv auf **Railway** mit **MySQL**. Zieldomain ist `barberbook.de` (Stand 2026-07-25 noch nicht gekauft, siehe Issues DOMAIN-1 bis DOMAIN-4).

> BITTE PRÜFEN (nur der Besitzer weiß das):
> - Gibt es schon einen zahlenden oder testenden Salon außer "Next Level Salon"?
> - Löst ein Push auf `main` automatisch ein Railway-Deployment aus? (im Repo nicht erkennbar)
> - Ist das Repo absichtlich öffentlich?

## Womit gearbeitet wird

Der Besitzer programmiert nicht. Daraus folgt:

- **Antworten auf Deutsch**, ohne unerklärtes Fachvokabular. Neue Begriffe beim ersten Auftauchen in einem Halbsatz erklären.
- **Vorhaben vor Ausführung beschreiben**, wenn mehr als eine Datei betroffen ist oder etwas nach außen wirkt.
- **Nicht "fertig" sagen, sondern zeigen.** Wenn etwas nicht geprüft werden konnte (kein MySQL, kein Key), das ausdrücklich sagen statt Funktionieren zu behaupten.
- **Keine ungefragten Erweiterungen**, keine neuen Abhängigkeiten ohne Rückfrage.

## Lokal starten

Voraussetzung: eine **MySQL-Datenbank** (lokal oder eine Wegwerf-Datenbank — nicht die Produktionsdatenbank, siehe Warnungen unten).

```
npm install
copy .env.example .env      # danach echte Werte eintragen
npm run dev                 # oder npm start
```

`initDb()` in `server/db.js` legt beim Start alle Tabellen selbst an, ergänzt fehlende Spalten und Indizes und befüllt einen Demo-Salon. **Es gibt keinen separaten Migrationsschritt.**

Läuft es? → `http://localhost:3000` (Salon-Seite), `/admin`, `/superadmin`

## Tests

```
npm test
```

**Wichtig: der Server muss dafür schon laufen.** Die Tests sprechen die API über HTTP an, sie starten den Server nicht selbst. Reihenfolge also: MySQL an → `npm run dev` in einem Fenster → `npm test` in einem zweiten.

Bei jedem Push und jedem Pull Request läuft `.github/workflows/test.yml` und macht genau das automatisch gegen eine frische MySQL-8-Instanz. Ein roter Lauf ist ein echtes Signal — nicht ignorieren.

Vorhandene Tests: `gdpr`, `phone`, `salon-api`, `superadmin-auth`, `tenant-isolation`, `webhook`.

## Vorsicht — das kann echten Schaden anrichten

- **Der Server löscht automatisch Kundendaten.** In `server/reminders.js` laufen drei Cronjobs, sobald der Server läuft: 18:00 Erinnerungen verschicken, 03:00 Aufräumen, **04:00 Datenaufbewahrung** — löscht `whatsapp_messages` älter als 90 Tage, `leads` älter als 12 Monate und anonymisiert Buchungen älter als 6 Monate. Wer den Server lokal gegen die Produktionsdatenbank startet, löscht dort echte Daten. Lokal immer eine eigene Datenbank verwenden.
- **Es werden echte WhatsApp-Nachrichten verschickt**, über die Meta Graph API (`server/messaging.js`, `server/routes/webhook.js`). Das geht an echte Kundennummern und kostet Geld. Nichts ausführen, was sendet, ohne vorher zu fragen.
- **`.env` enthält echte Zugangsdaten** (MySQL, Meta App Secret, Superadmin-Passwort, Anthropic-Key). Nie committen, nie in eine Ausgabe kopieren, nie in einen Chat. Nur mit Platzhaltern darüber reden.
- **`schema.sql` ist veraltet.** Es beschreibt den alten Ein-Salon-Stand (ohne `salon_id`, für Strato-MySQL). Das echte Schema steht in `server/db.js`. Nicht nach `schema.sql` arbeiten und es nicht als Wahrheit zitieren.
- **Das Repo ist öffentlich.** Alles, was hier landet, ist weltweit lesbar. `backups/` und `data/` sind aus gutem Grund in `.gitignore` — dort liegen Kundendaten.
- **`.claude/` ist absichtlich nicht im Git** (maschinenspezifisch). Diese `CLAUDE.md` liegt dagegen im Repo und gilt für alle.

## Aufbau

```
server/
  index.js          Express-Server: Helmet, CORS, Rate-Limits, Routen, startet initDb + Cronjobs
  db.js             MySQL-Pool und initDb() — erzeugt Schema, migriert, befüllt Demo-Salon
  ai.js             Nachrichten-Klassifizierung mit Claude Haiku, fällt ohne Key auf Stichwörter zurück
  messaging.js      Meta WhatsApp Cloud API (ausgehende Nachrichten, Token-Tausch)
  reminders.js      drei Cronjobs: Erinnerungen, Aufräumen, Datenaufbewahrung
  phone.js          Telefonnummern auf E.164 normalisieren
  sms.js            Twilio-SMS (Altlast, durch WhatsApp ersetzt)
  middleware/       tenant.js (Salon aus Subdomain bestimmen), validate.js
  routes/           salon, services, staff, slots, bookings, admin, cancel, superadmin, webhook
admin/              Admin-Bereich pro Salon (statisches HTML/CSS/JS)
superadmin/         Superadmin-Bereich für den Betreiber
landing/            Landingpage für die Wurzeldomain
cancel/             Selbst-Storno-Seite, Token steht in der URL
tests/              API-Tests, laufen gegen den bereits gestarteten Server
scripts/            Hilfsskripte (Token tauschen, Passwörter migrieren, KI-Klassifizierung testen)
ich-will-schauen-was-besser-ist/barber-demo/   die eigentliche Kundenseite (Vorlage)
```

Zwei Eigenheiten, über die man stolpert:

- Die Kundenseite liegt im Ordner `ich-will-schauen-was-besser-ist/barber-demo`. Der Name ist historisch. Umbenennen ginge nur zusammen mit dem Pfad in `server/index.js`.
- `CODEBASE_FOR_REVIEW.md` (162 KB) ist eine eingefrorene Momentaufnahme vom 3. Juli für eine externe Durchsicht. **Kein aktueller Stand** — immer die echten Dateien lesen, nie diese.

## Mandantentrennung

Der Salon wird aus der Subdomain bestimmt (`server/middleware/tenant.js`); die Wurzeldomain zeigt die Landingpage. Jede Abfrage muss nach `salon_id` filtern — die Trennung liegt in der Anwendung, nicht in der Datenbank. `tests/tenant-isolation.test.js` sichert das ab. Bei neuen Abfragen immer prüfen, ob `salon_id` gesetzt ist; ein Fehler hier zeigt einem Salon die Kunden eines anderen.

Zum Entwickeln kann `SALON_SLUG` in `.env` alle Anfragen auf einen Salon zwingen. **In Produktion darf die Variable nicht gesetzt sein.**

## Stand und offene Punkte

Letzter Code-Commit 2026-07-10, danach Pause. **17** offene Issues, in EPICs sortiert — die Nummern reichen bis 86, aber das Meiste ist erledigt.

Die mit `today` markierten Aufgaben sind derzeit **keine Programmieraufgaben**, sondern Einkäufe und Konsolenklicks: Railway auf Hobby-Plan, Domain `barberbook.de` kaufen, DNS-CNAME setzen, WhatsApp-Token in der Meta-Konsole registrieren (WA-4 ist als `blocked` markiert).

Der größte offene Entwicklungsblock ist EPIC 5 (Issues 80–86): eingehende WhatsApp-Nachrichten protokollieren, per KI einsortieren, an den Friseur weiterleiten, Postfach im Admin-Bereich. Die KI-Klassifizierung existiert (`server/ai.js`), ist aber laut Issue 86 in Produktion noch nicht aktiv.
