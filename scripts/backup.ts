import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
const source = process.env.DATABASE_PATH ?? "data/memory.sqlite";
const directory = process.env.BACKUP_DIR ?? join(dirname(source), "backups");
const destination = join(
  directory,
  "memory-" + new Date().toISOString().replaceAll(":", "-"),
);
mkdirSync(destination, { recursive: true, mode: 0o700 });
async function copy(source: string, path: string) {
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(db, path);
  } finally {
    db.close();
  }
}
await copy(source, join(destination, "memory.sqlite"));
const registry = join(dirname(source), "accounts.sqlite");
if (existsSync(registry)) {
  const path = join(destination, "accounts.sqlite");
  await copy(registry, path);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    for (const account of db
      .prepare("SELECT id FROM accounts WHERE id<>'owner'")
      .all()) {
      const id = String(account.id);
      if (!/^[0-9a-f-]{36}$/.test(id))
        throw new Error("Invalid account ID in backup.");
      const accountSource = join(dirname(source), "users", id, "memory.sqlite");
      if (existsSync(accountSource)) {
        const target = join(destination, "users", id);
        mkdirSync(target, { recursive: true, mode: 0o700 });
        await copy(accountSource, join(target, "memory.sqlite"));
      }
    }
  } finally {
    db.close();
  }
}
console.log(destination);
