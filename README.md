# dsh-prompt-optimizer

DSH-Desktop-Plugin: optimiert den Composer-Entwurf per Knopfdruck über ein frei wählbares LLM.

- **Composer-Button** (Zauberstab-Icon, rechts im Composer): ersetzt den aktuellen Draft mit dem optimierten Prompt.
- **Settings-Seite** unter `Settings → Plugins → Prompt Optimizer`: Dropdown aller verfügbaren Modelle aus der DSH-Config, Auswahl wird persistiert.
- **Meta-Optimierungs-Prompt**: verbessert Klarheit, Struktur, Rollen-Zuweisung, Constraints und Ausgabeformat für das gewählte Zielmodell im DSH-Desktop-Kontext. Gibt nur den optimierten Prompt zurück.

## Installation

Voraussetzungen: DSH Desktop mit initialisiertem Profil, Git, Node.js 20+.

```powershell
git clone https://github.com/jahdaganj01ki-oss/dsh-prompt-optimizer.git
cd dsh-prompt-optimizer
node scripts/profile.mjs install
```

Danach **DSH Desktop vollständig neu starten** (Seiten-Reload genügt nicht, weil sich die Bundle-Komposition ändert).

Alternativ via Profil-CLI:

```powershell
dsh plugin install ./dsh-prompt-optimizer
```

## Konfiguration

1. `Settings → Plugins → Prompt Optimizer` öffnen.
2. Im Dropdown **Optimierungs-Modell** das gewünschte Modell wählen (Liste kommt live aus der DSH-Modellkonfiguration, keine Hardcoded-Namen).
3. Die Auswahl wird im Plugin-Storage persistiert und für alle Sessions verwendet.

## Benutzung

1. Entwurf in den Composer schreiben.
2. Zauberstab-Button rechts im Composer klicken.
3. Während der Optimierung zeigt der Button einen Loading-Spinner; danach steht der optimierte Prompt im Composer.
4. Bei leerem Draft erscheint ein Hinweis-Toast statt eines LLM-Calls; bei Fehlern zeigt ein Toast die Meldung.

## Architektur

| Datei | Rolle |
|---|---|
| `src/index.ts` | Host-Einstieg: Settings-Namespace + Befehl `promptOptimizer/optimize` (ruft `ctx.llm.stream` mit `AbortController`, Timeout 30 s) |
| `src/optimize.ts` | Meta-Prompt-Template + Stream-Text-Extraktion (host- und client-sicher) |
| `src/client.tsx` | Client-Einstieg: `conversation.input.right`-Button + `settings.section`-Panel |
| `src/icons.tsx` | SVG-Zauberstab-Icon (theme-aware via `currentColor`) |
| `src/settings.tsx` | (in `client.tsx` enthalten: `OptimizerSettings`) Modellauswahl über das Live-Modellverzeichnis |
| `cordis.patch.yml` | Bundle-Registrierung (`prompt-optimizer`-Row) |
| `scripts/build.mjs` | Client-Bundle via esbuild + `window.__ModuleLoader__`-Wrapper |
| `scripts/profile.mjs` | Backup-first Installer/Deinstaller fürs DSH-Profil |

Der Composer-Draft wird über den Provide-Channel gelesen (`useInput`) und geschrieben (`inputActions.setDraft`); das Modellverzeichnis kommt aus `modelDirectories.directoryFor(sessionId)`.

## Builds via GitHub Actions

Jeder Push auf `main` baut Typecheck + Host (`tsc`) + Client-Bundle (esbuild) und lädt die Plugin-Artefakte (`lib/`, `package.json`, `cordis.patch.yml`, Docs) als Artifact `dsh-prompt-optimizer` hoch.

## Datenschutz

Der Prompt wird nur an das vom Nutzer gewählte Modell gesendet. Kein Klartext-Logging (nur `console.debug`-Marker ohne Inhalt).
