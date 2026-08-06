---
description: Lagebericht zum Projekt — was ist offen, was blockiert, läuft die CI, was ist der nächste Schritt
---

Erstelle einen Lagebericht für Claude-Barber. Der Besitzer programmiert nicht — schreibe auf Deutsch, ohne unerklärtes Fachvokabular, und mach am Ende einen klaren Vorschlag statt einer Liste von Möglichkeiten.

## Daten erheben

Führe diese Befehle aus und lies die Ergebnisse. Erfinde nichts — wenn ein Befehl fehlschlägt, sag das im Bericht.

1. **Steht lokal etwas Unfertiges herum?**
   `git status --short` und `git log --oneline -1`
   Prüfe außerdem, ob der lokale Stand hinter GitHub liegt: `git fetch --quiet && git log --oneline HEAD..origin/main`

2. **Sind die letzten Prüfungen grün?**
   `gh run list --repo Jascha0/Claude-Barber --limit 5`
   Bei einem roten Lauf: Ursache holen mit `gh run view <ID> --log-failed | tail -40` und in einem Satz auf Deutsch erklären, was kaputt ist.

3. **Wie lange liegt das Projekt still?**
   Datum des letzten Commits mit heute vergleichen.

4. **Was ist als Nächstes dran?**
   - `gh issue list --repo Jascha0/Claude-Barber --label today --limit 20`
   - `gh issue list --repo Jascha0/Claude-Barber --label blocked --limit 20`
   - Zahl aller offenen: `gh issue list --repo Jascha0/Claude-Barber --state open --limit 200 | wc -l`

5. **Ist in der Zwischenzeit etwas passiert?**
   Issues und Kommentare der letzten 14 Tage:
   `gh issue list --repo Jascha0/Claude-Barber --state all --search "updated:>=$(date -d '14 days ago' +%Y-%m-%d)" --limit 20`

## Bericht schreiben

Halte dich an diese Reihenfolge und werde nicht länger als nötig:

**1. Ampel** — ein Satz: läuft alles grün, oder ist etwas kaputt?

**2. Baustelle** — liegt lokal unfertige Arbeit herum, oder ist alles sauber?

**3. Aufgaben, die kein Programmieren sind.** Trenne diese ausdrücklich von den anderen. Domains kaufen, Konsolen-Einstellungen, Zahlungspläne, Token in Meta registrieren — das kann nur der Besitzer selbst tun, und solche Aufgaben blockieren oft alles andere. Wenn hier etwas offen ist, gehört es nach oben.

**4. Blockiertes** — was hängt, und woran. Falls erkennbar: wer müsste es lösen.

**5. Ein Vorschlag.** Genau einer, nicht drei. Begründe ihn in einem Satz und sag dazu, ob du das übernehmen kannst oder ob es am Besitzer hängt. Wenn du es übernehmen kannst, nenne den ersten konkreten Schritt.

## Regeln

- Keine Zahlen erfinden. Was du nicht ermitteln konntest, benennst du als nicht ermittelbar.
- Nichts verändern: keine Commits, keine Pushes, keine Issues anlegen oder schließen, keine Dateien ändern. Dieser Ablauf ist reines Lesen und Berichten.
- Keine Server starten. Der Server löst Cronjobs aus, die Daten löschen und WhatsApp-Nachrichten senden (siehe CLAUDE.md).
- Wenn seit dem letzten Bericht nichts passiert ist, sag das offen statt Fortschritt zu konstruieren.
