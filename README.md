# My Memory

Versie 1 van een persoonlijke webapp voor notities, checklists en herinneringen. React-interface, headless API, SQLite, offline opslag, synchronisatie en geauthenticeerde MCP-server. Gebouwd op de oorspronkelijke [bouwbrief](docs/BOUWBRIEF.md) en [20 bouwstappen](docs/BOUWVOLGORDE.md).

## Starten in de cloud of lokaal

Vereist: Node.js 24 en npm.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Het ontwikkelwachtwoord en MCP-token worden eenmalig lokaal aangemaakt in `data/dev-config.json`; deze map wordt nooit gecommit. Gebruik het wachtwoord uit dat bestand om in te loggen. De API draait op poort 3001. Bij een preview met een andere origin: `APP_ORIGIN=https://jouw-preview-adres npm run dev`.

Voor een preview van de gebouwde app met dezelfde ontwikkellogin: `npm run build` en daarna `npm run preview`. De login staat ook apart in `data/LOGIN.txt`.

Voor een gebouwde versie met eigen configuratie, ook voor offline browsen:

```sh
npm run build
cp .env.example .env
npm run password
# Zet de gegenereerde hash en een willekeurig MCP-token in .env.
npm start
```

Open `http://localhost:3001`. De service worker werkt in de productiebuild op localhost of HTTPS. Voor een andere poort pas je PORT en APP_ORIGIN samen aan.

## Gebruiken

- Typ een punt en druk Enter: standaard naar de inbox; kies eventueel een notitie of datum.
- Maak een notitie, schrijf tekst en selecteer opmaak. Enter vervolgt een opsomming/afvinkregel, Tab springt in. Sleep of plak afbeeldingen of gebruik de fotokiezer.
- Hashtags verbinden notities en punten. Zoek vanaf drie tekens, ook met typefouten en in het archief.
- Herbruikbare punten blijven zichtbaar na afvinken. Eenmalige punten gaan naar het archief. Klonen bewaart inhoud/opmaak, zet vinkjes uit en verwijdert geplande datums.
- Alle basisbewerkingen worden lokaal bewaard. In instellingen kun je alles downloaden voor offline gebruik en een volledige kopie exporteren. Conflicten tonen beide versies.
- AI/spraak gaat via ChatGPT/Codex en de [MCP-server](docs/API-MCP.md). Typen, zoeken en plannen werken zonder AI.

## Controleren

```sh
npm run check
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Voor een andere omgeving: `npx playwright install --with-deps chromium` en stel CHROMIUM_PATH in op de geïnstalleerde Chrome-binary. GitHub Actions voert de build, API-/modeltests en browsertests uit.

## Documentatie en deployment

- [Architectuur en technische keuzes](docs/ARCHITECTUUR.md)
- [HTTP-API en MCP aansluiten](docs/API-MCP.md)
- [VPS-deploy, back-up, herstel en beheer](docs/VPS.md)
- [Voortgang en bewijs per bouwstap](docs/VOORTGANG.md)

De code is geschikt om vanuit deze GitHub-repository naar een VPS te deployen. Docker Compose en Caddy zijn voorbereid. Het voorlopige productieadres is `https://memory.pansier.nl`; de VPS bij TransIP en DNS moeten nog worden ingesteld. Een daadwerkelijke VPS-deploy, publiek HTTPS-adres, pushontvangst op echte iPhone/Mac en de accountkoppeling in ChatGPT/Codex blijven deploymentcontroles.
