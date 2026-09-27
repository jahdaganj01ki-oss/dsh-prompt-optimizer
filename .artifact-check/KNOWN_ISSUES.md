# KNOWN_ISSUES

## 1. Keine offizielle Plugin-API-Doku gefunden (Stand: 2026-09-27)

Das Repo https://github.com/dataelement/dsh-desktop war zum Recherchezeitpunkt
nicht zugänglich/auswertbar. Stattdessen wurde die reale Plugin-Architektur aus
der installierten DSH-Desktop-App (`@deepseek-ai/*`-Pakete) und dem lokalen
Referenz-Plugin `dsh-provider-extension` rekonstruiert:

- Plugins sind **Cordis-Bundles** (`package.json → dsh.bundle.patch →
  cordis.patch.yml` mit `insert`-Row), kein `manifest.json`/`plugin.json`.
- UI-Beiträge laufen über **Client-Slots** (`ctx.slots.register`):
  Composer-Button auf `conversation.input.right` (Liste, Session-Scope),
  Settings-Seite auf `settings.section` (mit `id`, `order`, `label`).
- Der Client ist ein **esbuild-Browser-Bundle** im
  `window.__ModuleLoader__.load({id, factory})`-Format; DSH-Pakete + React
  sind externals.
- Draft-Zugriff über den Provide-Channel: `useInput` (lesen) +
  `inputActions.setDraft` (schreiben).
- Modellverzeichnis: `ctx.modelDirectories.directoryFor(sessionId)` (Store +
  `load()`), gespeist vom Host-Modellkatalog (`session/modelCatalog`).
- LLM-Aufruf host-seitig über `ctx.llm.stream` (Adapter-Registry); der Client
  ruft den Host-Befehl `promptOptimizer/optimize` per `connection.rpc.call`.

Falls die offizielle Doku abweichende Slot-Namen oder APIs definiert, müssen
die `ctx.slots.inject`-Ziele und Service-Namen in `src/client.tsx` angepasst
werden.

## 2. Host-Befehl `ctx.command` ist eine Annahme

`dsh-provider-extension` nutzt Host-seitig nur `connection.rpc`-Namespaces
fremder Plugins. Dass `ctx.command(name, handler)` existiert und der Client ihn
per `connection.rpc.call('/api', name, payload)` erreicht, ist aus den
untersuchten Bundles **nicht verifiziert** — ggf. muss der Optimizer-Hostcall
auf einen eigenen RPC-Namespace (eigener `connection`-Handler) umgestellt
werden.

## 3. `settingsScope`-Shape ist aus Client-Bundles abgeleitet

`settingsScope.bind({namespace}).get/.set` folgt dem in
`dsh-client-ui-conversation` beobachteten Muster (`settingsScope.bind(...)`
für Composer-Policies). Feld-Typisierung und Persistenz-Semantik des
`promptOptimizer/targetModel`-Felds müssen im Real-Client gegen die
Settings-Seite getestet werden.

## 4. Sandbox: esbuild nur als direktes Binary nutzbar

Im Entwicklungs-Workspace schlägt `child_process.spawn` aus Node mit EPERM
fehl; `scripts/build.mjs` und die GitHub-Action rufen
`node_modules/@esbuild/<plattform>/esbuild(.exe)` deshalb direkt auf.

## 5. Noch nicht end-to-end getestet

Meilensteine 1–5 sind implementiert (Typcheck grün, Bundle enthält beide Slots,
CI baut). Der Real-Client-Test (DSH Desktop starten → Button erscheint →
Optimierung ersetzt Draft) steht aus, sobald das Plugin im `web`-Profil
installiert ist.
