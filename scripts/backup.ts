import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
const source = process.env.DATABASE_PATH ?? "data/memory.sqlite";
const directory = process.env.BACKUP_DIR ?? join(dirname(source), "backups");
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(source);
const path =
  directory +
  "/memory-" +
  new Date().toISOString().replaceAll(":", "-") +
  ".sqlite";
await backup(db, path);
db.close();
console.log(path);
