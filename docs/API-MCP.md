# API en MCP

Alle routes gebruiken dezelfde SQLite-store. Lees-/wijzigtoegang is alleen voor de eigenaar. Browser: login met het ingestelde wachtwoord. Externe clients: `Authorization: Bearer <MCP_TOKEN>`. Bewaar tokens buiten Git.

## HTTP

- `GET /api/health`: bereikbaarheid, geen privégegevens.
- `POST /api/login`: `{ "password": "..." }`, sessiecookie, exact passende Origin.
- `GET /api/session`, `POST /api/logout`.
- `GET /api/entities`: alle entiteiten, inclusief archief en tombstones.
- `POST /api/sync`: `{ "mutations": [{ "opId": "UUID", "baseVersion": 0, "entity": { ... } }] }`. Lege array haalt alleen actuele serverinhoud op. Maximaal 100 operaties per batch. Antwoord: `{ results, entities }`. `results` bevat per operatie `status: ok` met de opgeslagen entiteit, of `status: conflict` met de serverversie. Gebruik per nieuw verzoek een nieuw operatie-ID; bij retry van dezelfde operatie exact hetzelfde ID en body.
- `PUT /api/images/:id`: binaire afbeelding; `Content-Type: image/png|image/jpeg|image/webp|image/gif`; maximaal 10 MB. Upload vóór het refereren vanuit een blok. Zelfde ID en bytes is een veilige retry.
- `GET /api/images/:id`: geauthenticeerde afbeelding.
- `GET /api/push/config`, `POST /api/push/subscribe`: VAPID-key en browserabonnement.

Nieuwe entiteiten krijgen `version: 0`, `deleted: false`, ISO `updatedAt` en een UUID. De server bepaalt de opgeslagen versie en updatedAt. Lees de huidige entiteit vóór aanpassen, stuur de volledige entiteit met `baseVersion` gelijk aan de gelezen versie. Verplaatsen wijzigt alleen het blokveld `noteId` en eventueel `position`. Afvinken wijzigt `done`; verwijderen zet `deleted`. Klonen/resetten gebruiken meerdere afzonderlijke entiteitsmutaties in dezelfde transactie. De schema's in `shared/model.ts` zijn de bron voor velden en validatie. HTML ondersteunt alleen p, br, strong/em/b/i; andere tags/attributen worden verwijderd.

## MCP aansluiten

URL: `https://memory.jouwdomein.nl/mcp`. Configureer een HTTP-MCP-client met een Authorization-header. Bijvoorbeeld in Codex-configuratie, nadat de VPS draait:

```toml
[mcp_servers.my_memory]
url = "https://memory.jouwdomein.nl/mcp"
bearer_token_env_var = "MY_MEMORY_MCP_TOKEN"
```

Stel die omgevingsvariabele lokaal in met het server-MCP-token. Voor ChatGPT verschilt het beschikbaar maken van geauthenticeerde remote MCP-connectors per account/client; deze implementatie levert een bearer-beveiligde MCP-server, geen OAuth-clientregistratie. De echte accountkoppeling wordt tijdens deployment gecontroleerd. Tijdens cloudontwikkeling kan een lokale MCP-client hetzelfde endpoint gebruiken.

Tools:

- `read_project(tag?)`: alle broninhoud voor ophalen, ordenen of samenvatten.
- `search(query)`: fuzzy zoeken vanaf drie tekens, inclusief archief.
- `read_note(noteId)`: notitie, blokken, versies, opmaak en kopjes.
- `create_note(title, reusable, tags)`.
- `add_point(html, noteId?, heading?, kind?, dueAt?)`: standaard inbox. Voor een notitie een uniek bestaand kopje kiezen; bij onduidelijkheid `needsClarification` plus de kopjes.
- `update_entity(entity)`: gerichte, versiegecontroleerde wijziging, verplaatsing of verwijdering.
- `set_done(blockId, version, done)`.
- `reset_checklist(noteId)`, `clone_note(noteId)`.
- `parse_date(phrase, timezone, reference?)`: tijdzonebewust datumvoorstel; pas plannen nadat dit is gevraagd.

AI-werkwijze: lees eerst actuele inhoud, stel bij ontbrekend/ambigu kopje een vraag, voeg vervolgens één blok toe. Bij conflicten opnieuw lezen. Behoud ideeën als bron; afvinken alleen bij bevestigde uitvoering of een expliciet verzoek. Geen extra bevestigingsdialoog in de webapp.
