# Later deployen vanuit GitHub

Deze configuratie staat klaar voor een Linux-VPS met Docker Compose. Er is tijdens het bouwen geen VPS gedeployed. De concrete domeinnaam, VPS-toegang en productiegeheimen zijn nog niet ingevuld.

## Voorbereiding

1. Richt een VPS in met Docker en Compose. Stel DNS voor `memory.jouwdomein.nl` in op die VPS. Open TCP 80/443 en eventueel UDP 443. Publiceer poort 3001 niet; alleen Caddy bereikt de API via het Compose-netwerk.
2. Clone `https://github.com/pansier/my-memory.git` en kies de gecontroleerde commit/tag. Kopieer `.env.example` naar `.env` met bestandsrechten `600`.
3. Maak met `npm run password` een scrypt-hash (Node 24 nodig), of voer het script uit in een Node 24-container. Kies minimaal 12 tekens. Stel APP_PASSWORD_HASH in; bewaar het plaintext wachtwoord veilig buiten Git.
4. Maak MCP_TOKEN van minimaal 32 willekeurige tekens. Stel `NODE_ENV=production`, `MEMORY_DOMAIN=memory.jouwdomein.nl` en `APP_ORIGIN=https://memory.jouwdomein.nl` in.
5. Maak VAPID-sleutels met `npm run vapid`. Stel VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY en `VAPID_SUBJECT=mailto:...` in. Deze sleutels blijven stabiel bij updates; commit geen .env.

## Bouwen en starten

```sh
docker compose config --quiet
docker compose build
docker compose up -d
```

Caddy vraagt automatisch een HTTPS-certificaat aan. De Node-server weigert productiestart zonder HTTPS-origin en een lang MCP-token. Gebruik deze productieomgeving nooit via rechtstreeks HTTP; de Secure-cookie vereist HTTPS.

Controleer `https://memory.jouwdomein.nl/api/health`, log in, maak een testnotitie en heropen de app. Stel in ChatGPT/Codex de remote MCP-URL en bearer-toegang in. Lees eerst actuele inhoud en voer daarna een gerichte toevoeging uit. Controleer dat bronopmaak behouden blijft. Zie [API-MCP](API-MCP.md) voor het protocol en de beperking rond accountondersteuning voor bearer-auth.

Op iPhone/iOS 16.4+ vereist webpush een geïnstalleerde webapp op het beginscherm. Alex maakt die snelkoppeling en de Mac-Dock-snelkoppeling zelf. Schakel daarna meldingen in via instellingen en geef toestemming. Plan een herinnering, sluit de app en controleer ontvangst met internet; herplan/vink af en controleer dat de oude melding niet verschijnt. Doe dit op de echte iPhone en Mac. Browseremulatie bewijst deze ontvangst niet.

## Back-up en herstel

Alle privégegevens, inclusief afbeeldingen, sessies en plannerstatus, staan in het `memory_data`-volume. Maak een consistente online SQLite-back-up:

```sh
docker compose exec memory npm run backup
```

Dit schrijft naar `/data/backups`. Exporteer de back-up buiten de VPS, bijvoorbeeld:

```sh
docker compose cp memory:/data/backups ./backups
```

Bewaar versleutelde back-ups op een andere locatie. Maak dagelijks een back-up en vóór iedere update. Roteer volgens je bewaartermijn en controleer periodiek het herstel. Een browserexport is nuttig voor lokale wijzigingen, maar vervangt geen serverback-up.

Herstelprocedure:

1. Bewaar de huidige database als extra herstelkopie. Stop de memory-service zodat de database niet in gebruik is.
2. Kopieer de gewenste back-up als `/data/memory.sqlite` naar het volume. Gebruik tijdelijk een `docker compose run --no-deps --user root --entrypoint sh memory`-container om de bestanden in het volume te beheren.
3. Verwijder uitsluitend de bij die vervangen database horende oude `memory.sqlite-wal` en `memory.sqlite-shm`, nadat de service volledig is gestopt. Zet eigenaar op UID/GID 1000.
4. Start memory opnieuw. Controleer login, tekst, afbeeldingen, archief, MCP en planner. Herstel kan een oudere plannerstatus terugzetten; controleer geplande herinneringen en abonnementen vóór heractiveren.
5. Test op een apparaat waarvan lokale wijzigingen vooraf zijn geëxporteerd. De client heeft versies uit de nieuwere database; behandel eventuele conflicten bewust.

## Updates, stop en logs

```sh
docker compose exec memory npm run backup
git pull --ff-only
docker compose build
docker compose up -d
docker compose logs --tail=100 memory caddy
```

Alleen gecontroleerde commits uit GitHub uitrollen. Stop met `docker compose stop`, start met `docker compose start`. `docker compose down` bewaart named volumes; gebruik nooit `down -v` tenzij gegevens bewust worden verwijderd. Logt requestfouten en pushretries, geen wachtwoorden of tokens. Eén memory-replica: SQLite en de planner zijn hierop ingericht.

Automatiseer updates pas met back-up, geslaagde CI en een vastgelegd rollbackpad. Rollback: checkout van de vorige gecontroleerde commit en opnieuw bouwen; bij latere schemawijzigingen ook de compatibiliteit van de database controleren. Schema v1 wordt bij start aangemaakt en heeft een vastgelegde schemaversie.
