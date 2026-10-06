import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Accounts } from "../server/accounts.ts";
import { hashPassword } from "../server/auth.ts";
const passwordHash = process.env.APP_PASSWORD_HASH;
if (!passwordHash)
  throw new Error(
    "APP_PASSWORD_HASH ontbreekt; voer dit commando in de app-container uit.",
  );
const databasePath = process.env.DATABASE_PATH ?? "data/memory.sqlite";
const accounts = new Accounts(databasePath, {
  username: process.env.APP_USERNAME ?? "alex@pansier.nl",
  passwordHash,
  mcpToken: process.env.MCP_TOKEN,
});
try {
  const [command, username] = process.argv.slice(2);
  if (command === "list") {
    for (const account of accounts.all()) console.log(account.username);
  } else if (command === "add" && username) {
    const password = randomBytes(24).toString("base64url");
    const mcpToken = randomBytes(32).toString("hex");
    const account = accounts.add(username, hashPassword(password), mcpToken);
    accounts.store(account);
    const directory = join(dirname(databasePath), "logins");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, account.id + ".txt");
    writeFileSync(
      path,
      `My Memory: ${process.env.APP_ORIGIN ?? "http://localhost:5173"}\nGebruikersnaam: ${account.username}\nWachtwoord: ${password}\nMCP-token: ${mcpToken}\n`,
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      `Account ${account.username} aangemaakt. Login staat in ${path}; deel uitsluitend de login van deze gebruiker.`,
    );
  } else
    throw new Error(
      'Gebruik npm run account -- list of npm run account -- add "gebruikersnaam".',
    );
} finally {
  accounts.close();
}
