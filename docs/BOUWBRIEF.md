# Bouwbrief

Bron: Todoist-project **My Memory**, overgenomen op 6 oktober 2026. De projectbeschrijving hieronder is ongewijzigd overgenomen.

## My Memory: bouwbrief voor ChatGPT/Codex
Dit project is de actuele, samengevoegde opzet van de brainstorm van 30 september 2026. De 20 genummerde taken bevatten de bouwvolgorde en concrete eisen en vervangen de oorspronkelijke losse ideeën.

## Werkwijze
Wanneer Alex vraagt dit project te bouwen: lees deze beschrijving én alle taakbeschrijvingen; begin bij 01 en werk lokaal in ChatGPT/Codex. Bouw eerst de basis en voeg functies stapsgewijs toe. Nog niet deployen; VPS-hosting is stap 20. Leg voortgang en technische keuzes vast. De lijst bevat geplande werkzaamheden, geen reeds gebouwde functies. Gebruik beschikbare Todoist-toegang; als die in de toekomstige omgeving ontbreekt, vraag toegang of een export.

## Definitieve keuzes
- Eén responsive webapp met headless backend, database, API en MCP. Geen native iOS/macOS-app of App Store-traject in versie 1.
- Notitiebladen integreren tekst, afbeeldingen, opsommingen en afvinkbare punten met optionele datum/tijd. Bij snelle invoer geen verplichte keuze tussen notitie en herinnering.
- Inbox standaard, optionele directe bestemming. Hashtags vormen gezamenlijke onderwerpen voor alle inhoud en zijn zichtbaar in navigatie.
- Beperkte editor: titel, subkop, hoofdtekst, vet/cursief, bullets/streepjes, checkboxen, inspringing en afbeeldingen. Afgevinkte tekst doorgestreept.
- Herbruikbaar: punten blijven staan en vinkjes kunnen worden gereset, zonder reisgeschiedenis. Eenmalig: afgerond uit actieve lijst, bewaard in doorzoekbaar archief. Opmaak is onafhankelijk van herbruikbaarheid.
- Volledige notities klonen met tekst, foto's, opmaak en lijstjes. Origineel blijft intact.
- Live fuzzy tekstzoeken vanaf drie karakters over notities, punten, hashtags en archief; geen afbeeldingszoekfunctie.
- Alle basisfuncties offline, incl. iPhone-toetsenbord. Lokale opslag en synchronisatie wanneer app actief en online; zichtbare syncstatus en behoud van gegevens bij conflicten.
- Webpush van VPS-planner naar iPhone/Mac bij bereik en toestemming, ook bij gesloten app. Geen offline meldingen in versie 1. AI niet nodig voor de planner.
- ChatGPT/MCP leest bestaande inhoud en opmaak voor gerichte toevoegingen. Expliciet kopje volgen; zonder kopje bestaande kopjes aanbieden en vragen. Kopjes mogen vetgedrukte tekst zijn.
- Eenvoudig strak zwart-wit hersenicoon ontwerpen. Alex maakt zelf de snelkoppelingen op iPhone-beginscherm en Mac-Dock.

## Scope en open details
Paklijsten zijn voorbeelden; My Memory ondersteunt ook brede, lange documentachtige notities. Een aparte app om paklijsten te combineren valt buiten dit project.
Niet vastgelegd: vinkjes/datums bij klonen en precieze onderwerpweergave (tabs of naast elkaar). Los deze kleine keuzes op bij de betreffende bouwstap; voeg geen extra scope toe.

## Bouwvolgorde
01. Lokaal project en ontwikkelomgeving opzetten
02. Gegevensmodel voor notities, punten en hashtags ontwerpen
03. Headless API en toegang beveiligen
04. Basisinterface, inbox en hashtags bouwen
05. Snelle invoer en bestemming toevoegen
06. Notitie-editor met beperkte opmaak bouwen
07. Afbeeldingen aan notities en punten toevoegen
08. Herbruikbare checklists en eenmalige taken integreren
09. Checklists resetten en hele notities klonen
10. Datum/tijd en eenvoudig herinneringenoverzicht bouwen
11. Archief en live fuzzy tekstzoeken bouwen
12. Volledige offline basisfuncties realiseren
13. Synchronisatie en zichtbare status bouwen
14. MCP-koppeling voor ChatGPT/Codex maken
15. Natuurlijke taal en gerichte AI-invoer ondersteunen
16. Projectideeën via AI ophalen en verwerken
17. Serverplanner en webpush voor iPhone/Mac bouwen
18. Eenvoudig zwart-wit hersenicoon ontwerpen
19. Kernflows lokaal en op iPhone/Mac controleren
20. VPS-hosting en productie-inrichting afronden
