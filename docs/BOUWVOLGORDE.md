# Bouwvolgorde

Bron: Todoist-project **My Memory**, overgenomen op 6 oktober 2026. Alle 20 stappen stonden open. Titels en beschrijvingen zijn ongewijzigd overgenomen; de links koppelen iedere stap aan GitHub en de oorspronkelijke Todoist-taak.

Lees ook de [bouwbrief](BOUWBRIEF.md). De app is nog niet gebouwd. Begin bij stap 01; hosting volgt bij stap 20.

## 01. Lokaal project en ontwikkelomgeving opzetten

Status bij overdracht: **open** · [GitHub-issue #1](https://github.com/pansier/my-memory/issues/1) · [Todoist](https://app.todoist.com/app/task/6hfvHPPgMJwRqfgQ)

Begin lokaal in ChatGPT/Codex, nog niet op een VPS. Maak één responsive React-webapp met een afzonderlijke headless backend en database. Leg startcommando's en configuratie vast. Kies praktische technische defaults en documenteer ze; API-first en offline gebruik zijn uitgangspunten.

## 02. Gegevensmodel voor notities, punten en hashtags ontwerpen

Status bij overdracht: **open** · [GitHub-issue #2](https://github.com/pansier/my-memory/issues/2) · [Todoist](https://app.todoist.com/app/task/6hfvHPJCpW2qQGXQ)

Modelleer opgemaakte notitiebladen, tekst/afbeeldingsblokken, afvinkbare punten met stabiele IDs, optionele datum/tijd en afgerond-status, hashtags en inbox. Een punt kan zelfstandig in de inbox bestaan en later in een notitie worden geplaatst. Hetzelfde punt in een notitie en herinneringenoverzicht is geen dubbele kopie. Herbruikbaarheid en opmaak zijn aparte eigenschappen; ondersteun afwijkend gedrag van een checklist/punt op een gemengd blad. Bewaar versies voor synchronisatie en afgeronde eenmalige punten voor archief.

## 03. Headless API en toegang beveiligen

Status bij overdracht: **open** · [GitHub-issue #3](https://github.com/pansier/my-memory/issues/3) · [Todoist](https://app.todoist.com/app/task/6hfvHPQQgjMJP85Q)

API voor lezen, maken, bewerken, verplaatsen en verwijderen van notities, punten en hashtags; afvinken, resetten, klonen, zoeken en synchroniseren. Beveilig webapp en later MCP met authenticatie/toegangscontrole. Maak herhaalde synchronisatieverzoeken veilig zonder dubbele items. Backend blijft onafhankelijk van interface.

## 04. Basisinterface, inbox en hashtags bouwen

Status bij overdracht: **open** · [GitHub-issue #4](https://github.com/pansier/my-memory/issues/4) · [Todoist](https://app.todoist.com/app/task/6hfcffJpjhVWh4qx)

Desktop: linkerkolom met inbox boven de hashtags en zoekbalk daar of bovenaan. Responsive bediening op iPhone. Hashtags organiseren zowel notities als herinneringen; bij een onderwerp beide overzichtelijk tonen, met tabs of naast elkaar als ontwerpoptie. Hashtags zijn optioneel. Ook zonder AI op iPhone en Mac kunnen typen, bekijken en bewerken.

## 05. Snelle invoer en bestemming toevoegen

Status bij overdracht: **open** · [GitHub-issue #5](https://github.com/pansier/my-memory/issues/5) · [Todoist](https://app.todoist.com/app/task/6hfvHPR4pc3gfvfQ)

Plusknop en toetsenbordinvoer: standaard direct in inbox opslaan, optioneel een bestaande notitie/onderwerp kiezen. Geen verplichte keuze notitie versus herinnering en geen extra bevestigingsdialoog. Ook later kunnen verplaatsen. Een concrete AI-opdracht mag inbox overslaan. Optioneel datum/tijd meteen meegeven.

## 06. Notitie-editor met beperkte opmaak bouwen

Status bij overdracht: **open** · [GitHub-issue #6](https://github.com/pansier/my-memory/issues/6) · [Todoist](https://app.todoist.com/app/task/6hfcffG9xcgH4chx)

Brede notities, ook langere documentachtige teksten; paklijsten zijn alleen voorbeelden. Compacte opmaakbalk: titel, subkop, hoofdtekst, vet, cursief; gewone bullets/streepjes en afvinklijstjes; inspringing en geneste onderdelen. Tekst selecteren om opmaak te wijzigen. Enter binnen een lijst vervolgt de lijst automatisch. Geen uitgebreide menu's of extra opmaakvereisten.

## 07. Afbeeldingen aan notities en punten toevoegen

Status bij overdracht: **open** · [GitHub-issue #7](https://github.com/pansier/my-memory/issues/7) · [Todoist](https://app.todoist.com/app/task/6hfvHPRGCfwhJj8Q)

Afbeeldingen binnen notities en bij afvinkbare/herinneringspunten. Op Mac slepen/plakken; op iPhone fotokiezer. Afbeeldingen lokaal bewaren voor offline gebruik en later uploaden. Ze hoeven niet doorzoekbaar of door AI visueel geanalyseerd te worden.

## 08. Herbruikbare checklists en eenmalige taken integreren

Status bij overdracht: **open** · [GitHub-issue #8](https://github.com/pansier/my-memory/issues/8) · [Todoist](https://app.todoist.com/app/task/6hfcffHMwCCrRgwx)

Bij notitie/lijst aanmaken herbruikbaar ja/nee kiezen. Herbruikbaar: afgevinkt blijft zichtbaar en tekst doorgestreept; uitvinken maakt actief. Eenmalig: afgerond verdwijnt uit actieve lijst, blijft doorzoekbaar in archief. Tekst, foto's, gewone opsommingen, checklists en gedateerde punten kunnen samen op een blad staan. Eenmalig standaard compacte takenweergave, herbruikbaar standaard notitieblad; opmaak en herbruikbaarheid onafhankelijk.

## 09. Checklists resetten en hele notities klonen

Status bij overdracht: **open** · [GitHub-issue #9](https://github.com/pansier/my-memory/issues/9) · [Todoist](https://app.todoist.com/app/task/6hfvHPWjGv2qV3gQ)

Notitie-optie 'Alle vinkjes uitzetten' wanneer afgevinkte checklistpunten aanwezig zijn. Reset heeft geen geschiedenis per reis nodig en gebeurt alleen op verzoek. Kloon de hele notitie met tekst, koppen, foto's, opmaak en checkliststructuur; kopie zelfstandig bewerkbaar, origineel intact. Nog te bepalen: vinkjes en datums meenemen bij klonen. Voorkom onbedoeld dubbele geplande meldingen; maak gekozen standaard zichtbaar.

## 10. Datum/tijd en eenvoudig herinneringenoverzicht bouwen

Status bij overdracht: **open** · [GitHub-issue #10](https://github.com/pansier/my-memory/issues/10) · [Todoist](https://app.todoist.com/app/task/6hfcffHqQ2hHMJ4x)

Optionele datum en tijd bij elk actiepunt, ook binnen notities. Eén eenvoudige openstaande herinneringenlijst met eerstvolgende geplande datum bovenaan; ook punten zonder datum bekijken. Geen uitgebreid weekdashboard nodig. Wijzigingen/afvinken werken bij hetzelfde item in alle weergaven door. Tijdzones en relatieve AI-datums correct verwerken.

## 11. Archief en live fuzzy tekstzoeken bouwen

Status bij overdracht: **open** · [GitHub-issue #11](https://github.com/pansier/my-memory/issues/11) · [Todoist](https://app.todoist.com/app/task/6hfvHPVxhhF3FgxQ)

Afgeronde eenmalige punten nooit verwijderen door afvinken; archief bewaren en doorzoeken met herkenbare afgerond-status. Eén zoekfunctie over hele notitietekst, herinneringsinhoud en hashtags, inclusief archief. Vanaf drie tekens live zoeken, verder typen verfijnt resultaten. Tolerant voor typefouten. Hashtag als resultaat aanklikken opent bijbehorende inhoud. Zoeken werkt ook offline over lokaal beschikbare gegevens.

## 12. Volledige offline basisfuncties realiseren

Status bij overdracht: **open** · [GitHub-issue #12](https://github.com/pansier/my-memory/issues/12) · [Todoist](https://app.todoist.com/app/task/6hfvHPXmX5ghmx6x)

Cache de webapp en bewaar gegevens/afbeeldingen lokaal. Offline notities en punten lezen, toevoegen, aanpassen/verwijderen; hashtags organiseren; zoeken; afbeeldingen toevoegen; afvinken/resetten/klonen en datums instellen. Maak duidelijk welke gegevens lokaal beschikbaar zijn; download vooraf voor offline gebruik. iPhone-toetsenbord werkt zonder AI. Online AI/MCP en pushontvangst vallen buiten offline garantie.

## 13. Synchronisatie en zichtbare status bouwen

Status bij overdracht: **open** · [GitHub-issue #13](https://github.com/pansier/my-memory/issues/13) · [Todoist](https://app.todoist.com/app/task/6hfvHPh7WX2V9vHQ)

Bewaar wijzigingen lokaal in een wachtrij en synchroniseer met backend zodra webapp actief is en verbinding heeft, ook bij heropenen. Geen belofte van achtergrondsync wanneer iOS-webapp gesloten is. Toon klein statusicoon: lokaal bewaard, synchroniseren, klaar of fout; doorwerken blijft mogelijk. Voorkom duplicaten en stil gegevensverlies bij wijzigingen op meerdere apparaten; conflicten zichtbaar en herstelbaar.

## 14. MCP-koppeling voor ChatGPT/Codex maken

Status bij overdracht: **open** · [GitHub-issue #14](https://github.com/pansier/my-memory/issues/14) · [Todoist](https://app.todoist.com/app/task/6hfcffR9RjG4Q2px)

Geauthenticeerde MCP-tools boven dezelfde API: notities/lijsten/punten/hashtags vinden, lezen, maken, gericht aanpassen, verplaatsen, afvinken, resetten en klonen. ChatGPT/Codex kan het project als geheel ophalen en ideeën verwerken. Verander actuele inhoud met versiecontrole; geen volledige notitie overschrijven bij één nieuw punt.

## 15. Natuurlijke taal en gerichte AI-invoer ondersteunen

Status bij overdracht: **open** · [GitHub-issue #15](https://github.com/pansier/my-memory/issues/15) · [Todoist](https://app.todoist.com/app/task/6hfcffM6jqrpMqVQ)

Spraak loopt voor versie 1 via ChatGPT naar MCP; geen aparte ingebouwde spraakengine vereist. Zonder bestemming naar inbox; genoemde bestemming direct gebruiken. Datum/tijd herkennen, op verzoek plannen. Bij 'voeg toe bij medicijnen' actuele notitie en opmaak lezen, bestaand kopje vinden en gericht toevoegen met passende inspringing. Kopjes mogen gewoon vetgedrukte tekst zijn, geen systeemcategorie. Zonder genoemd kopje bestaande kopjes lezen en gebruiker laten kiezen. Bij ontbrekend/ambigu kopje verduidelijken in plaats van gokken.

## 16. Projectideeën via AI ophalen en verwerken

Status bij overdracht: **open** · [GitHub-issue #16](https://github.com/pansier/my-memory/issues/16) · [Todoist](https://app.todoist.com/app/task/6hfcffPQFwC3QcrQ)

Via ChatGPT/MCP alle ideeën voor een onderwerp ophalen, samenvatten/ordenen en op verzoek verwerken in het betreffende project. Zowel handmatig als via AI werken blijft mogelijk. Behoud broninhoud; markeer alleen als afgerond wanneer uitvoering is bevestigd of gevraagd. Succes kort bevestigen via ChatGPT, zonder extra appdialoog.

## 17. Serverplanner en webpush voor iPhone/Mac bouwen

Status bij overdracht: **open** · [GitHub-issue #17](https://github.com/pansier/my-memory/issues/17) · [Todoist](https://app.todoist.com/app/task/6hfvHPfQgW6MMqXx)

Planner in backend verstuurt push op ingestelde datum/tijd. Ontvangst vereist internet, notificatietoestemming en geschikte webappinstallatie; app mag gesloten zijn. Herplannen/afvinken verwijdert oude geplande meldingen; retries zonder dubbele meldingen. Push is geen garantie van volledige gegevenssync. Geen native schilletje/App Store-traject en geen offline meldingen in versie 1. Planner lokaal ontwikkelen, productie activeren na hosting.

## 18. Eenvoudig zwart-wit hersenicoon ontwerpen

Status bij overdracht: **open** · [GitHub-issue #18](https://github.com/pansier/my-memory/issues/18) · [Todoist](https://app.todoist.com/app/task/6hfvHPgr22JFjh6Q)

Ontwerp een strak, eenvoudig grafisch hersensymbool in zwart-wit voor My Memory, herkenbaar op klein formaat. Voeg geschikte webapp-iconen aan de app toe. Alex voegt de app zelf aan het iPhone-beginscherm en Mac-Dock toe; die installatie hoeft niet uitgevoerd te worden.

## 19. Kernflows lokaal en op iPhone/Mac controleren

Status bij overdracht: **open** · [GitHub-issue #19](https://github.com/pansier/my-memory/issues/19) · [Todoist](https://app.todoist.com/app/task/6hfvHPjQmVcXvfGx)

Controleer editor/opmaak, gewone bullets versus checkboxen, archief/reset, klonen zonder wijziging origineel, hashtag/inboxrouting, zoeken incl. typefouten en archief, gerichte MCP-invoeging, tijdzones/planner. Test offline invoer, herstart, netwerkuitval, synchronisatie en conflicten tussen apparaten. Verifieer webapp lokaal vóór hosting; push end-to-end zodra HTTPS-hosting beschikbaar is.

## 20. VPS-hosting en productie-inrichting afronden

Status bij overdracht: **open** · [GitHub-issue #20](https://github.com/pansier/my-memory/issues/20) · [Todoist](https://app.todoist.com/app/task/6hfvHPmh5qwrP8Rx)

Pas na lokaal bouwen: webapp, API, database, afbeeldingen en planner hosten op VPS. Configureer HTTPS/domein, secrets, databaseback-ups en herstel, updates en foutlogging. Test productie-MCP, offline/sync en push op iPhone/Mac. Documenteer beheer en start/stop. Alex maakt zelf iPhone-beginscherm- en Mac-Dock-iconen aan; geen taak voor installatie daarvan.
