# Apple Notities in My Memory

Apple Notities blijft de oorspronkelijke bron. De import is een eenmalige kopie, zonder synchronisatie terug naar Apple. Een nieuwe voorbereiding kan dezelfde lokale export gebruiken; opnieuw uitlezen van Apple is niet nodig.

## Mappen en tekstpagina’s

- De zijbalk toont alle mappen, submappen en notities in een uitklapbare boom. Notities staan alfabetisch; er is geen selectie van twaalf recente notities meer. **Alle iCloud-notities** is een totaaloverzicht van de Apple-import, geen extra bronmap. De oorspronkelijke mapnamen blijven behouden.
- Maak zelf een map met **Mappen +**. Vanuit een map maakt dat een submap. Hernoem een map op de mappagina; verplaats een notitie via **Map** bovenaan het blad. Alleen lege mappen kunnen worden verwijderd.
- Nieuwe notities beginnen als **Tekstpagina met lijstjes**. Enter in gewone tekst maakt een volgende alinea in dezelfde editor. Kopjes, gewone en genummerde opsommingen, citaten en tabellen zijn native bewerkbare tekst. Gewone tekst krijgt geen checkbox of rijstreep. **Compacte lijst** blijft beschikbaar voor afzonderlijke punten.
- Klik in een alinea en kies H1, H2, vet, cursief, opsomming of andere opmaak. **Afvinklijst** zet alleen de gekozen alinea om in een zelfstandig herbruikbaar afvinkpunt; omliggende tekst blijft intact. Enter bij een afvinkpunt maakt een volgend punt. **Tekst toevoegen** gaat verder met gewone tekst.
- De inhoudsopgave herkent kopjes binnen doorlopende tekst. Een klik springt naar het juiste kopje; ook MCP herkent deze kopjes voor gerichte toevoegingen.
- Alle geïmporteerde afvinklijsten zijn op verzoek herbruikbaar. Vinkjes blijven zichtbaar. **Opnieuw gebruiken** reset de betreffende aaneengesloten afvinklijst; **Alle vinkjes uitzetten** reset alle afvinkpunten op het blad. **Klonen** maakt een zelfstandige kopie zonder vinkjes of datums. Eenmalige punten verdwijnen na afvinken naar het doorzoekbare archief.
- **Herinneringen** telt en toont alleen onafgevinkte taken met een expliciet geplande datum/tijd. Ongeplande checklistpunten blijven in hun notitie. Een datum die als tekst in de Apple-export staat wordt nooit automatisch een meldingsdatum.
- De bestaande werkbalk ondersteunt links, onderstrepen, doorhalen, genummerde lijsten, citaten, code en tabellen. Klik eerst in de tekst. In een tabel verschijnen knoppen voor rijen en kolommen. Afbeeldingen en PDF’s kunnen via de bestandsknop, plakken of slepen worden toegevoegd (maximaal 50 MB).
- Lange pagina’s tonen eerst 100 bewerkbare onderdelen. **Meer punten tonen** opent de rest. De tekst binnen een onderdeel blijft een doorlopend document.
- Foto’s behouden hun oorspronkelijke resolutie; HEIC wordt lossless naar PNG omgezet. Bij een nieuwe voorbereiding blijven bijlage-ID’s gelijk, zodat bestaande uploads hergebruikt worden. Broncodevoorbeelden zijn tekst/code en worden nooit uitgevoerd.

## Import vervangen en terugdraaien

Vervangen gebeurt atomair via MCP: de oude inhoud blijft beschikbaar totdat de nieuwe voorbereiding is gevalideerd. De server controleert binnen dezelfde transactie opnieuw welke bronnotities inmiddels zijn veranderd. Gewijzigde notities, zelfstandig toegevoegde punten en verwijderde bronnotities worden beschermd. Alle andere notities, Todoist-inhoud en mappen blijven onaangetast. De vervangen notities houden hun bestaande notitie-ID; hun oude punten krijgen verwijdertombstones. Bijlagen blijven beschikbaar.

Open Instellingen → **Imports** → **Import terugdraaien**. Bij de verbeterde vervangingsimport herstelt dit de vorige pagina’s; het verwijdert je oorspronkelijke gegevens niet. Later gewijzigde of aangevulde pagina’s blijven volledig bewaard. Het scherm toont vooraf de aantallen. De oorspronkelijke import is tijdens een actieve vervanging gemarkeerd als vervangen en kan dan niet afzonderlijk worden teruggedraaid.

De server bewaart versies en tombstones, zodat een offline apparaat de oude import niet ongemerkt terugzet. Een latere offline wijziging aan een vervangen punt levert een zichtbaar, herstelbaar conflict op. De importgeschiedenis, herstelinhoud en bijlagen zitten in de normale SQLite-backup. Voor iedere productie-import wordt eerst een backup op de VPS gemaakt.

## Herhaalbare voorbereiding en MCP

`node --import tsx scripts/prepare-apple-notes.ts <source-manifest.json> <output-directory>` maakt een leesbaar importplan en bijlagemanifest. Het bronmanifest koppelt iedere oorspronkelijke Apple-notitie-ID aan een map en een lokaal Markdown-bestand. Gelijke titels hebben afzonderlijke Apple-ID’s; gecombineerde exports kunnen deze titels overschrijven.

De voorbereiding bewaart aaneengesloten gewone tekst en native lijsten als rich text. Alleen echte checkboxes en bijlagen worden onafhankelijke onderdelen. Vergrendelde notities worden overgeslagen en als aandachtspunt gemeld. Datums blijven broninhoud.

MCP biedt `list_imports`, `import_notes`, `preview_import_replacement`, `replace_import`, `preview_import_undo` en `undo_import`. Vervangen verwacht een eigen import-ID en dezelfde bronnotitie-ID’s, behoudt bestaande mappen en weigert verwijzingen naar andere notities. De bulkactie is idempotent; hetzelfde ID met een ander plan wordt geweigerd. Nieuwe bijlagen moeten vóór de import via de private afbeeldingsroute zijn geüpload.

Privé-bronexports, plannen en bijlagen blijven onder de genegeerde map `data/imports/`, met beperkte lokale bestandsrechten. Zet deze niet op GitHub.
