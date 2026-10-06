import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";
import { Store } from "../server/store.ts";
import { hashPassword } from "../server/auth.ts";
const directory = mkdtempSync(join(tmpdir(), "memory-e2e-"));
const store = new Store(join(directory, "test.sqlite"));
const server = createApp(store, {
  passwordHash: hashPassword("test-password-e2e"),
  origin: "http://127.0.0.1:4173",
  mcpToken: "e2e-test-token",
  serveWeb: true,
}).listen(4173, "0.0.0.0");
function stop() {
  server.close(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
