import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import sanitize from "sanitize-html";
import {
  entitySchema,
  type Entity,
  type Mutation,
  type Block,
  now,
} from "../shared/model.ts";
export function cleanHtml(html: string) {
  return sanitize(html, {
    allowedTags: ["p", "br", "strong", "em", "b", "i"],
    allowedAttributes: {},
  });
}
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS entities(id TEXT PRIMARY KEY, type TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, request TEXT NOT NULL, result TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS images(id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS deliveries(key TEXT PRIMARY KEY, block_id TEXT NOT NULL, due TEXT NOT NULL, subscription_id TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  INSERT OR IGNORE INTO meta VALUES('schema_version','1');`);
  }
  all(): Entity[] {
    return this.db
      .prepare("SELECT data FROM entities")
      .all()
      .map((row) => JSON.parse(String(row.data)));
  }
  get(id: string): Entity | undefined {
    const r = this.db.prepare("SELECT data FROM entities WHERE id=?").get(id);
    return r ? JSON.parse(String(r.data)) : undefined;
  }
  mutate(m: Mutation) {
    const serialized = JSON.stringify(m);
    const old = this.db
      .prepare("SELECT request,result FROM operations WHERE id=?")
      .get(m.opId);
    if (old) {
      if (old.request !== serialized)
        throw new Error("Operation ID already used with different content");
      return JSON.parse(String(old.result));
    }
    const parsed = entitySchema.parse(m.entity);
    const remote = this.get(parsed.id);
    if ((remote?.version ?? 0) !== m.baseVersion)
      return {
        opId: m.opId,
        status: "conflict" as const,
        remote: remote ?? null,
      };
    if (remote && remote.type !== parsed.type)
      throw new Error("Entity type cannot change");
    if (remote?.deleted && !parsed.deleted)
      throw new Error("Deleted item cannot be restored; create a copy");
    if (parsed.type === "block" && parsed.noteId) {
      const note = this.get(parsed.noteId);
      if (!note || note.type !== "note") throw new Error("Note does not exist");
      if (note.deleted)
        return {
          opId: m.opId,
          status: "conflict" as const,
          remote: remote ?? null,
          parentDeleted: true,
        };
    }
    if (parsed.type === "block")
      for (const image of parsed.imageIds)
        if (!this.db.prepare("SELECT id FROM images WHERE id=?").get(image))
          throw new Error("Image not uploaded");
    const entity: Entity = {
      ...parsed,
      version: m.baseVersion + 1,
      updatedAt: now(),
      ...(parsed.type === "block" ? { html: cleanHtml(parsed.html) } : {}),
    };
    const result = { opId: m.opId, status: "ok" as const, entity };
    this.db
      .prepare(
        "INSERT INTO entities VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,data=excluded.data",
      )
      .run(entity.id, entity.type, entity.version, JSON.stringify(entity));
    this.db
      .prepare("INSERT INTO operations VALUES(?,?,?)")
      .run(m.opId, serialized, JSON.stringify(result));
    return result;
  }
  sync(mutations: Mutation[]) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const results = mutations.map((m) => this.mutate(m));
      const entities = this.all();
      this.db.exec("COMMIT");
      return { results, entities };
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  saveEntities(entities: Entity[]) {
    return this.sync(
      entities.map((e) => ({
        opId: crypto.randomUUID(),
        baseVersion: e.version,
        entity: e,
      })),
    );
  }
  putImage(id: string, mime: string, data: Buffer) {
    const existing = this.db
      .prepare("SELECT mime,data FROM images WHERE id=?")
      .get(id);
    if (existing) {
      if (
        existing.mime !== mime ||
        !Buffer.from(existing.data as Uint8Array).equals(data)
      )
        throw new Error("Image ID already used");
      return;
    }
    this.db.prepare("INSERT INTO images VALUES(?,?,?)").run(id, mime, data);
  }
  activeTasks(): Block[] {
    return this.all().filter(
      (e): e is Block =>
        e.type === "block" &&
        !e.deleted &&
        !e.done &&
        e.kind === "task" &&
        !!e.dueAt &&
        (!e.noteId || (!!this.get(e.noteId) && !this.get(e.noteId)?.deleted)),
    );
  }
  close() {
    this.db.close();
  }
}
