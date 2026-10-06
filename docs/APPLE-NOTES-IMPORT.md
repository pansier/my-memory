# Apple Notities in My Memory

Apple Notities blijft de oorspronkelijke bron. De import is een eenmalige kopie, zonder synchronisatie terug naar Apple.

## Gewone, bewerkbare onderdelen

- Mappen staan in de zijbalk. Maak een map met **Mappen +**. Vanuit een map maakt dat een submap. Hernoem een map op de mappagina; verplaats een notitie via **Map** bovenaan het blad. Alleen lege mappen kunnen worden verwijderd.
- Alle geïmporteerde afvinklijsten zijn op verzoek herbruikbaar. Vinkjes blijven zichtbaar. **Alle vinkjes uitzetten** reset een lijst; **Klonen** maakt een zelfstandige kopie zonder vinkjes of datums. Zet **Herbruikbaar** uit voor eenmalige taken; een punt kan dit afzonderlijk overrulen.
- De werkbalk ondersteunt links, onderstrepen, doorhalen, genummerde lijsten, citaten, code en tabellen. Klik eerst in het betreffende punt. In een tabel verschijnen knoppen voor rijen en kolommen. Afbeeldingen en PDF's kunnen via de bestaande bestandsknop, plakken of slepen worden toegevoegd (maximaal 50 MB).
- Geïmporteerde datums blijven tekst. Er wordt geen meldingsdatum geraden; plannen gebeurt via de bestaande datum/tijd-invoer per punt.
- Grote bladen en overzichten tonen eerst 100 punten. **Meer punten tonen** opent de rest. Zo blijft de app ook op iPhone bruikbaar.
- Foto's worden op hun oorspronkelijke resolutie overgenomen. HEIC wordt lossless naar PNG omgezet. De originele bronexports blijven lokaal bewaard. Tabellen blijven tabellen; broncodevoorbeelden worden als tekst/code behandeld, nooit uitgevoerd.

## Import terugdraaien

Open je account/Instellingen → **Imports** → **Import terugdraaien**. De bevestiging toont hoeveel notities worden verwijderd en hoeveel gewijzigd zijn. Alleen items uit die import worden teruggedraaid; bestaande Todoist-items en andere notities blijven staan. Geïmporteerde notities die je daarna hebt gewijzigd of waaraan je een nieuw punt hebt toegevoegd blijven volledig bewaard, inclusief hun map. Dit voorkomt verlies van later werk. De oorspronkelijke Apple Notities blijven behouden.

De server bewaart verwijdertombstones, zodat een offline apparaat de teruggedraaide import niet opnieuw terugzet. De importgeschiedenis en bijlagen zitten in de normale SQLite-backup. Voor iedere productie-import wordt eerst een backup op de VPS gemaakt.

## Herhaalbare voorbereiding

`node --import tsx scripts/prepare-apple-notes.ts <source-manifest.json> <output-directory>` maakt een leesbaar importplan en bijlagemanifest. Het bronmanifest koppelt iedere oorspronkelijke Apple-notitie-ID aan een map en een lokaal Markdown-bestand. Exporteer gelijke titels afzonderlijk met hun Apple-ID als bestandsnaam: een gecombineerde Apple-export kan gelijke titels overschrijven.

`POST /api/imports` accepteert nieuwe mappen/notities/punten in ouder-voor-kindvolgorde. Upload eerst de bijlagen via de bestaande private `/api/images/:id`-route; PDF's gebruiken dezelfde accountgebonden opslag. Een batch is atomair en zijn UUID is idempotent. Bestaande items worden nooit overschreven. Vergrendelde notities worden overgeslagen en in de importgeschiedenis gemeld.

Privé-bronexports, plannen en bijlagen blijven onder de genegeerde map `data/imports/`, met beperkte lokale bestandsrechten. Zet deze niet op GitHub.
