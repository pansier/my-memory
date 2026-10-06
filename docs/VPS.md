# Later deployen vanuit GitHub

Deze configuratie staat klaar voor een Linux-VPS met Docker Compose. Het voorlopige productieadres is `https://memory.pansier.nl`. De nieuwe TransIP-VPS is `alexpansier-vps3`, met IPv4-adres `37.97.228.211`, gebruikersnaam `alexpansier`, Ubuntu 26.04 LTS, 1 core en 2 GB RAM. DNS en de daadwerkelijke app-installatie zijn nog niet bevestigd. De cloudomgeving kan geen publieke SSH-verbinding naar deze VPS maken; installatie kan vanaf Alex' Mac met de geselecteerde Mac-sleutel.

## Installatie vanaf de Mac

Stel eerst bij TransIP voor `pansier.nl` het A-record `memory` in op `37.97.228.211`. Gebruik een TTL van bijvoorbeeld 300 seconden. Controleer eventuele bestaande CNAME-/AAAA-records voor `memory`, zodat het subdomein alleen naar deze VPS wijst.

Log in vanuit Terminal op de Mac:

```sh
ssh alexpansier@37.97.228.211
```

Controleer bij de eerste verbinding de SSH-hostfingerprint via de VPS-console voordat je die accepteert. Als de Mac-sleutel niet standaard wordt gevonden, selecteer je de bijbehorende privésleutel met `ssh -i /pad/naar/je/mac-sleutel alexpansier@37.97.228.211`.

Het script `scripts/deploy-vps.sh` automatiseert de installatie op de VPS. Download het vanaf een gecontroleerde commit in deze repository en voer het met sudo uit met drie argumenten: `memory.pansier.nl`, `37.97.228.211` en de volledige commit-SHA. Het controleert vóór installatie of het verwachte IP-adres werkelijk op die server staat. Het installeert Docker/Compose, behoudt de geconfigureerde SSH-poorten in de firewall, opent 80/443, checkt de gekozen codeversie uit en maakt productiegeheimen op de VPS. Het hergebruikt bestaande geheimen bij opnieuw uitvoeren voor dezelfde commit; voor updates gebruik je de updateprocedure hieronder.

De nieuwe login wordt rechtstreeks bewaard in `/opt/my-memory/data/LOGIN.production.txt` (alleen root kan lezen). Bekijk die in je eigen SSH-terminal met `sudo cat /opt/my-memory/data/LOGIN.production.txt`. Geheimen verschijnen niet in de installatie-uitvoer of in Git. De ontwikkellogin uit de cloud wordt niet overgenomen.

Het script stelt de VPS-tijdzone in op Europe/Amsterdam, maakt direct een consistente SQLite-back-up en plant dagelijks een back-up om 03:17 Nederlandse tijd. Deze back-ups staan op dezelfde server; kopieer ze ook naar een andere locatie. DNS/HTTPS en echte apparaatcontroles blijven te controleren na uitvoering.

## Voorbereiding

1. Richt een VPS in met Docker en Compose. Maak bij TransIP voor `pansier.nl` een A-record met naam `memory` naar het IPv4-adres van de nieuwe VPS. Voeg alleen een AAAA-record toe als de VPS ook via IPv6 bereikbaar is. Dit geeft `memory.pansier.nl` een eigen bestemming; de bestaande website op `pansier.nl` behoudt zijn DNS-records. Open TCP 80/443 en eventueel UDP 443. Publiceer poort 3001 niet; alleen Caddy bereikt de API via het Compose-netwerk.
2. Clone `https://github.com/pansier/my-memory.git` en kies de gecontroleerde commit/tag. Kopieer `.env.example` naar `.env` met bestandsrechten `600`.
3. Maak met `npm run password` een scrypt-hash (Node 24 nodig), of voer het script uit in een Node 24-container. Kies minimaal 12 tekens. Stel APP_PASSWORD_HASH in; bewaar het plaintext wachtwoord veilig buiten Git.
4. Maak MCP_TOKEN van minimaal 32 willekeurige tekens. Stel `NODE_ENV=production`, `MEMORY_DOMAIN=memory.pansier.nl` en `APP_ORIGIN=https://memory.pansier.nl` in.
5. Maak VAPID-sleutels met `npm run vapid`. Stel VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY en `VAPID_SUBJECT=mailto:...` in. Deze sleutels blijven stabiel bij updates; commit geen .env.

## Bouwen en starten

```sh
docker compose config --quiet
docker compose build
docker compose up -d
```

Caddy vraagt automatisch een HTTPS-certificaat aan. De Node-server weigert productiestart zonder HTTPS-origin en een lang MCP-token. Gebruik deze productieomgeving nooit via rechtstreeks HTTP; de Secure-cookie vereist HTTPS.

Controleer `https://memory.pansier.nl/api/health`, log in, maak een testnotitie en heropen de app. Stel in ChatGPT/Codex de remote MCP-URL en bearer-toegang in. Lees eerst actuele inhoud en voer daarna een gerichte toevoeging uit. Controleer dat bronopmaak behouden blijft. Zie [API-MCP](API-MCP.md) voor het protocol en de beperking rond accountondersteuning voor bearer-auth.

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
