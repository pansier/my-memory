# Versie 1: technische keuzes

## Stack en mappen

Node 24, TypeScript, React 19/Vite, Express, ingebouwde SQLite, IndexedDB en een service worker. SQLite gebruikt WAL, transacties en een busy timeout. Deze versie is één persoonlijke werkruimte met één eigenaar. Eén API-proces en één planner gebruiken dezelfde database; meerdere API-replica's zijn nog niet ondersteund.

- `shared/model.ts`: gedeelde schema's en checklist-/kloonlogica.
- `server/`: authenticatie, database, HTTP-API, MCP en webpushplanner.
- `web/`: responsive interface, Tiptap-editor, lokaal bewaren en synchroniseren.
- `scripts/`: ontwikkeling, wachtwoordhash, VAPID, buildcache en back-up.
- `tests/`: API-/modeltests en browsertests.

## Model

Een notitie bevat titel, hashtags, standaardherbruikbaarheid en een afzonderlijke weergavekeuze. Een blok heeft een vaste UUID, optionele notitie-ID, soort, HTML met beperkte opmaak, positie, inspringing, afvinkstatus, optionele eigen herbruikbaarheid, UTC-datum/tijd, hashtags en afbeeldings-IDs. Een punt zonder notitie-ID staat in de inbox. Het herinneringenoverzicht toont hetzelfde blok, geen kopie. Eenmaal afgeronde eenmalige punten blijven opgeslagen en doorzoekbaar in het archief. Verwijderen gebruikt tombstones; verwijderde notities verbergen hun blokken en annuleren meldingen.

Hashtags mogen direct op notities en punten staan. Losse hashtag-entiteiten maken lege onderwerpen mogelijk. Hernoemen en verwijderen passen de referenties aan. Afbeeldingen hebben immutable UUIDs en MIME-type; de database bewaart de bytes, zodat back-ups volledig zijn. Upload accepteert PNG, JPEG, WebP en GIF tot 10 MB en controleert bestandskenmerken. SVG wordt niet als gebruikersafbeelding toegelaten.

Elke tekstregel gebruikt een Tiptap-editor voor vet/cursief en selectie. Regelsoort en inspringing zijn afzonderlijke blokvelden. Enter vervolgt een opsomming of checkboxregel; Shift+Enter maakt een regelafbreking. Tab/Shift+Tab wijzigen inspringing. Afbeeldingen kunnen bij elk blok staan.

## Offline en synchronisatie

Alle basisbewerkingen gaan eerst naar IndexedDB. Een bewerking wordt pas als bewaard weergegeven na een geslaagde lokale transactie. Een wachtrij bevat UUIDs voor operaties en verwachte serverversies. Nog niet verstuurde wijzigingen van hetzelfde item worden samengevoegd; een verstuurde operatie blijft onveranderlijk, ook als het antwoord verloren gaat. De server verwerkt batches in één SQLite-transactie; hetzelfde operatie-ID levert hetzelfde resultaat op. Verschillende apparaten wijzigen dezelfde versie niet ongemerkt: de verliezende wijziging wordt lokaal als conflict met beide versies bewaard.

Per entiteit verstuurt de client telkens de eerste wachtrijbewerking. Acknowledgements verwijderen alleen de werkelijk bevestigde operatie, ook als tijdens het verzoek verder is getypt. Browser Locks serialiseren schrijvers en synchronisatie tussen tabbladen; BroadcastChannel ververst andere tabbladen. Browser zonder Locks heeft beperkte garanties bij gelijktijdige tabbladen; gebruik daar één tabblad.

De service worker bewaart het volledige apppakket tijdens installatie. Afbeeldingen blijven afzonderlijk in IndexedDB. 'Alles beschikbaar maken voor offline' haalt alle actieve gegevens en afbeeldingen op en vraagt persistente opslag. Beschikbaarheid hangt af van succesvolle download en browseropslag; iOS kan opslag opruimen. Een export bevat ook lokale wijzigingen en afbeeldingen. Gebruik op een vertrouwd apparaat: lokale gegevens zijn niet met het appwachtwoord versleuteld. Uitloggen wist lokale gegevens nadat de wachtrij leeg is. Expliciet wissen blijft mogelijk na een waarschuwing.

Synchronisatie gebeurt bij openen, herstel van verbinding, terugkeer naar de app en iedere 30 seconden terwijl de app zichtbaar is. Geen belofte van iOS-achtergrondsynchronisatie bij gesloten app. API-responses en cookies worden niet in de service worker-cache gezet.

## Authenticatie en MCP

Het eigenaarwachtwoord staat alleen als scrypt-hash op de server. Login maakt een willekeurige sessie met een HttpOnly/SameSite-cookie, Secure in productie; de database bewaart alleen de tokenhash. Login heeft rate limiting. Mutaties via cookies vereisen een exact passende Origin. Voor productie zijn HTTPS-origin en een lang MCP-token verplicht.

MCP gebruikt het officiële SDK-protocol, stateless Streamable HTTP op `/mcp`. Een apart bearer-token is vereist. Lees-/zoektools geven versies en broninhoud terug. Toevoeging aan een notitie vraagt een uniek bestaand kopje; vetgedrukte regels tellen ook als kopje. Zonder kopje of bij ambiguïteit worden keuzes teruggegeven. Entiteiten wijzigen met versiecontrole; een nieuw punt overschrijft geen hele notitie. AI-samenvatting gebeurt in ChatGPT/Codex op basis van `read_project`; broninhoud blijft bewaard.

Natuurlijke datums ondersteunen Nederlands voor vandaag/morgen/overmorgen, weekdagen, volgende week en 'om HH:mm'. Chrono herkent het voorstel; Temporal rekent het met een IANA-tijdzone om naar een UTC-instant. Ambigue/niet-bestaande winter-/zomertijdstippen worden afgewezen. De tool geeft een voorstel voor bevestiging, geen automatische planning. Spraak loopt via ChatGPT/Codex; de app vereist geen AI voor typen of plannen.

## Planner en kleine keuzes

De planner loopt elke 15 seconden, zonder AI. Leveringen worden persistent per punt, geplande datum en apparaat bijgehouden. Wijziging/afvinken/verwijdering annuleert een oude levering. Verlopen abonnementen worden verwijderd, tijdelijke fouten krijgen begrensde retries. Een stabiel webpush-topic en notification-tag laten de pushdienst/browser dubbele retries vervangen. Een netwerkfout na ontvangst kan niet atomair met de externe provider worden bevestigd; absolute exactly-once ontvangst wordt niet beloofd.

Klonen bewaart tekst, foto's en opmaak met nieuwe entiteit-IDs. Vinkjes gaan uit; datums worden verwijderd. Dit voorkomt het onbedoeld verdubbelen van geplande meldingen. Deze keuze staat in de interface. Onderwerpen tonen notities en punten op één pagina. Opmaak en herbruikbaarheid blijven onafhankelijke keuzes.
