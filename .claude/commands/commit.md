---
description: Änderungen ansehen, eine englische Commit-Nachricht (feat/fix-Format) schreiben, kurz zeigen und nach Bestätigung lokal committen — kein Push.
---

Committe die aktuellen Änderungen für den Besitzer. Er programmiert nicht und will die
Commit-Nachricht nicht selbst schreiben — das machst du. Nachricht immer auf **Englisch**,
im Format der bestehenden Historie. **Nicht pushen** (der Besitzer lädt selbst hoch).

## Ablauf

1. **Änderungen ansehen — nichts raten**
   - `git status --short` — welche Dateien haben sich geändert?
   - `git diff` und `git diff --staged` — den echten Inhalt der Änderungen lesen, damit die
     Nachricht beschreibt was *wirklich* geändert wurde.
   - `git log --oneline -8` — für den Ton/Stil der bisherigen Nachrichten.
   - **Wenn nichts geändert ist:** sag das kurz auf Deutsch und höre auf. Kein leerer Commit.

   **Kontext dieser Arbeitssitzung einbeziehen:** Nimm die neuesten Änderungen aus *dieser*
   Sitzung dazu — was wurde gebaut/gefixt, mit welchem Ziel, und was wurde nur angefangen oder
   ist noch offen? Diesen Kontext nutzt du, um das *Warum* genauer zu formulieren und um
   unfertige Teile zu vermerken (Schritt 3). **Der Diff bleibt die Wahrheit über das *Was*** —
   beschreibe im Commit nichts, was nicht wirklich in den Änderungen steckt.

2. **Sicherheitscheck**
   Prüfe die geänderten Dateien. Taucht etwas Sensibles auf, das nicht ins öffentliche Repo
   gehört (`.env`, echte Tokens/Passwörter/Zugangsdaten im Klartext, Dateien unter `backups/`,
   Kundendaten), dann **committe NICHT**. Warne den Besitzer auf Deutsch und schlage vor, es in
   `.gitignore` aufzunehmen. (`.env`, `backups/`, `.claude/`, `node_modules` sind schon geschützt.)

3. **Nachricht schreiben** — Englisch, Conventional-Commits-Format:
   - Erste Zeile: `type(scope): kurze zusammenfassung`
     - `type`: `feat` (neues Feature), `fix` (Fehlerbehebung), `chore` (Aufräumen/Konfig),
       `test` (Tests), `refactor` (Umbau ohne Verhaltensänderung), `docs` (Doku).
     - `scope`: betroffener Bereich, z.B. `auth`, `bookings`, `onboarding`, `phone`, `gdpr`.
   - Leerzeile, dann 1–4 kurze Punkte: **was** geändert wurde und **warum**. Am Stil der
     letzten Commits orientieren.
   - **Unfertiges vermerken:** Ist die committete Arbeit Teil von etwas Größerem, das in dieser
     Sitzung noch **nicht fertig** wurde, hänge nach den Punkten eine kurze Zeile an, die den
     Stand festhält — so wird die Historie zum Fortschritts-Protokoll. Beispiel:
     ```
     Note: part of the onboarding rework — still open: booking-form WhatsApp consent, EU-region move.
     ```
     Regel dabei: **niemals eine unfertige Änderung als fertig darstellen.** Wenn der committete
     Stand selbst bewusst unfertig/Zwischenstand ist, mach das klar (z.B. Präfix `wip:` statt
     `feat:`, oder eine `Note:`-Zeile), damit später niemand denkt, es sei abgeschlossen.
   - Immer abschließen mit:
     ```
     Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
     ```

4. **Kurz zeigen und bestätigen lassen**
   Zeig dem Besitzer in deiner Antwort die vorgeschlagene **erste Zeile** (und ggf. die Punkte)
   und erkläre in **einem deutschen Satz**, was committet wird. Gibt es eine `Note:`-Zeile zu
   Unfertigem, nenne den offenen Punkt auch kurz auf Deutsch, damit er weiß was noch aussteht.
   Dann **warte auf sein OK**. Erst nach Zustimmung committen. Will er etwas ändern, passe die
   Nachricht an und zeig sie erneut.

5. **Committen — nicht pushen**
   - Nach dem OK: `git add -A`, dann `git commit -F <tempdatei>` (Tempdatei oder Heredoc, damit
     mehrzeilige Nachrichten und Sonderzeichen sauber durchgehen — kein `git commit -m` mit
     eingebetteten Zeilenumbrüchen).
   - **Kein `git push`.** Sag am Ende auf Deutsch: lokal committet, geht mit einem späteren Push
     zu GitHub. Biete an, auf Wunsch zu pushen — aber tu es nicht von selbst.

## Regeln
- Nachricht immer auf Englisch, immer `type(scope): …`.
- Nur beschreiben, was der Diff wirklich zeigt — nichts erfinden.
- Niemals Hooks umgehen (`--no-verify`) oder Signierung abschalten.
- Niemals automatisch pushen.
