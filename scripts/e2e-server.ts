import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Accounts, createAccountsApp } from "../server/accounts.ts";
import { hashPassword } from "../server/auth.ts";
const directory = mkdtempSync(join(tmpdir(), "memory-e2e-"));
const accounts = new Accounts(join(directory, "test.sqlite"), {
  username: "alex@pansier.nl",
  passwordHash: hashPassword("test-password-e2e"),
  mcpToken: "e2e-test-token",
});
accounts.add(
  "other@example.test",
  hashPassword("test-password-e2e"),
  "other-e2e-token",
);
const server = createAccountsApp(accounts, {
  loginLimit: 100,
  origin: "http://127.0.0.1:4173",
  mcpToken: "e2e-test-token",
  serveWeb: true,
}).listen(4173, "0.0.0.0");
function stop() {
  server.close(() => {
    accounts.close();
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
