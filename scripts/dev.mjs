import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
mkdirSync("data", { recursive: true });
const config = "data/dev-config.json";
if (!existsSync(config)) {
  const password = randomBytes(18).toString("base64url");
  const salt = randomBytes(16).toString("hex");
  writeFileSync(
    config,
    JSON.stringify({
      password,
      passwordHash: `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
      mcpToken: randomBytes(32).toString("hex"),
    }),
    { mode: 0o600 },
  );
}
const settings = JSON.parse(readFileSync(config));
writeFileSync(
  "data/LOGIN.txt",
  "Ontwikkelwachtwoord voor My Memory: " + settings.password + "\n",
  { mode: 0o600 },
);
const preview = process.argv.includes("--preview");
console.log(
  `My Memory lokaal: http://localhost:${preview ? 3001 : 5173}\nWachtwoord: opgeslagen in data/LOGIN.txt (niet in Git)`,
);
const env = {
  ...process.env,
  APP_PASSWORD_HASH: settings.passwordHash,
  MCP_TOKEN: settings.mcpToken,
  APP_ORIGIN:
    process.env.APP_ORIGIN ??
    (preview ? "http://localhost:3001" : "http://localhost:5173"),
};
const api = spawn(
  "node",
  ["--import", "tsx", ...(preview ? [] : ["--watch"]), "server/index.ts"],
  {
    stdio: "inherit",
    env,
  },
);
const web = preview
  ? null
  : spawn("node", ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0"], {
      stdio: "inherit",
      env,
    });
function stop() {
  api.kill();
  web?.kill();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
api.on("exit", () => {
  web?.kill();
});
web?.on("exit", () => {
  api.kill();
});
