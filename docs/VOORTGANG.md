# Versie 1: voortgang en verificatie

Gebouwd op 6 oktober 2026 in het huidige cloudproject. De oorspronkelijke bouwbrief en taakbeschrijvingen blijven de bron; onderstaande status beschrijft de implementatie. De app heeft één persoonlijke werkruimte. De code komt in `pansier/my-memory`; productiehosting volgt later.

| Stap | Resultaat | Bewijs / resterende controle |
| --- | --- | --- |
| 01 | React/Vite, Node-API, SQLite, start- en buildcommando's | Productiebuild en ontwikkelpreview |
| 02 | Versies, vaste IDs, notities, gemengde blokken, inbox, tags, afbeeldingen, archief | Model- en API-tests; verplaatsen behoudt punt-ID |
| 03 | Scrypt-login, sessies, CSRF, rate limiting, bearer-toegang, validatie | HTTP-tests voor login, Origin, sessierevocatie, tokens en HTML |
| 04 | Responsive sidebar, inbox, notities, hashtags en zoeken | Desktopbrowser en 390×844 mobiele viewport |
| 05 | Enter-invoer, standaard inbox, optionele bestemming en datum | Browserflow; verplaatsing en bestemming getest |
| 06 | Tiptap, vet/cursief, titel/subkop/tekst, bullets/checkboxen, inspringing | Selectie/opmaak, lijstvervolg en behoud na herladen getest |
| 07 | Slepen/plakken/fotokiezer; afbeeldingen per blok, lokaal bewaren/uploaden | Offline afbeelding, herstart en synchronisatie getest |
| 08 | Herbruikbaarheid per notitie met eigen blokoverride; eenmalig archief | Modeltest en browserflow |
| 09 | Reset; hele notitie klonen met nieuwe IDs | Offline clone/reset getest; datums weg en vinkjes uit; origineel blijft intact |
| 10 | UTC-datums, lokale invoer/weergave, gesorteerde herinneringen | Datum-invoer, planner en Amsterdam-wintertijd getest |
| 11 | Fuse-zoeken vanaf 3 tekens, inclusief afgeronde punten en hashtags | Fuzzy zoek-/archiefflow in browser |
| 12 | IndexedDB, complete appcache en lokaal beschikbare afbeeldingen | Offline lezen/invoeren/opmaak/reset/klonen/tags/herstart getest; downloaden/export in instellingen |
| 13 | Duurzame wachtrij, idempotente retries, zichtbare status, conflicten | Twee onafhankelijke browsercontexten; verloren serverantwoord; netwerkherstel |
| 14 | SDK-MCP boven dezelfde store, bearer-auth, gerichte wijzigingen | Echte SDK-initialisatie/tools via Streamable HTTP en in-memory protocol; publieke accountkoppeling na hosting |
| 15 | Kopjes lezen/vragen, gerichte toevoeging; datumvoorstellen met IANA-tijdzone | Expliciete/vetgedrukte/ambigue kopjes en wintertijd getest; spraak via ChatGPT/Codex |
| 16 | Alle projectideeën per hashtag ophalen met broninhoud | `read_project` getest; AI-ordening gebeurt in ChatGPT/Codex |
| 17 | Persistente planner, abonnementen, annuleren, retry, deduplicatietags | Plannerlogica getest met een vervangende pushsender; echte webpush pas met HTTPS en iPhone/Mac |
| 18 | Eigen zwart-wit hersenicoon, SVG en PNGs 180/192/512 plus maskable | Manifest en iconen in productiebuild |
| 19 | Automatische kernflows in echte Chromium-browser en API/MCP | Geen echte iPhone/macOS-Safari-hardware in deze omgeving; die controle blijft open |
| 20 | Docker Compose, HTTPS via Caddy, secrets, volume, consistente back-up, herstel-/updateprocedure | Docker-build en productiestartcontrole; daadwerkelijke VPS/DNS/HTTPS-uitrol blijft open op verzoek |

## Verificatie

- `npm run check`: TypeScriptcontrole en productiebuild; 11 model-/API-/MCP-/plannertests, alle geslaagd, geen skips.
- `npm run test:e2e`: 9 browserflows, alle geslaagd, geen skips. Chromium met desktopviewport en iPhone-formaat; dit emuleert het scherm, niet Safari/iOS of fysieke pushontvangst.
- Docker-build via lokale managed daemon met gemounte CA: geslaagd. De CA en credentials zitten niet in de image.
- `npm run test:container`: controle op productiestart, geauthenticeerde API, gegevens na containerherstart, HTML en consistente online back-up. Alle controles geslaagd; gebruikt uitsluitend een tijdelijk testvolume.
- `npm audit --omit=dev --audit-level=high`: 0 bekende kwetsbaarheden in runtime-afhankelijkheden.
- SQLite-back-up/herstel is ook afzonderlijk getest met notities, afbeeldingsbytes en opgeslagen operatie-IDs.

De planner gebruikt in de automatische tests een vervangende sender: er worden geen echte meldingen verstuurd. API-tests gebruiken echte HTTP en SQLite; MCP-tests gebruiken het echte SDK-protocol. Browsertests gebruiken de echte gebouwde app, IndexedDB, service worker, API en database. De test voor verloren antwoorden laat de echte server de operatie eerst verwerken en laat daarna alleen het antwoord wegvallen.

## Nog te doen bij deployment

Domein/VPS instellen, productiegeheimen invullen, HTTPS activeren, de MCP-server vanuit het echte ChatGPT/Codex-account verbinden en webpush op de echte iPhone/Mac met gesloten app controleren. Alex voegt de snelkoppelingen zelf toe. Stap 19/20 en de externe controles voor 14/17 zijn daarom niet volledig afgerond; GitHub-issues zijn niet automatisch gesloten.
