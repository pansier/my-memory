import { z } from "zod";
import { entitySchema, id, now, type Entity } from "../shared/model.ts";
import { Store } from "./store.ts";
export const importSchema = z.object({
  id,
  label: z.string().min(1).max(200),
  source: z.literal("apple-notes"),
  entities: z.array(entitySchema).min(1).max(30000),
  warnings: z.array(z.string().max(500)).max(500).default([]),
});
type ImportInput = z.infer<typeof importSchema>;
type Record = {
  id: string;
  label: string;
  source: string;
  createdAt: string;
  undoneAt: string | null;
  entities: Entity[];
  warnings: string[];
};
export function importRecords(store: Store): Record[] {
  return store.db
    .prepare("SELECT data FROM imports")
    .all()
    .map((r) => JSON.parse(String(r.data)) as Record);
}
export function importSummary(r: Record) {
  return {
    id: r.id,
    label: r.label,
    source: r.source,
    createdAt: r.createdAt,
    undoneAt: r.undoneAt,
    notes: r.entities.filter((e) => e.type === "note").length,
    folders: r.entities.filter((e) => e.type === "folder").length,
    warnings: r.warnings,
  };
}
export function applyImport(store: Store, input: ImportInput) {
  const previous = importRecords(store).find((r) => r.id === input.id);
  if (previous) return { ...importSummary(previous), alreadyImported: true };
  const ids = new Set<string>();
  for (const e of input.entities) {
    if (ids.has(e.id) || store.get(e.id))
      throw new Error("Deze import bevat bestaande of dubbele items.");
    if (e.version !== 0 || e.deleted)
      throw new Error("Importeer alleen nieuwe items.");
    if (e.type === "block" && e.dueAt)
      throw new Error(
        "Import maakt geen automatische meldingen; plan ze na de import.",
      );
    ids.add(e.id);
  }
  // No cross-account/note/folder links or overwrites through an import.
  for (const e of input.entities) {
    if (e.type === "block" && (!e.noteId || !ids.has(e.noteId)))
      throw new Error("Importpunt mist zijn notitie.");
    if (e.type === "note" && e.folderId && !ids.has(e.folderId))
      throw new Error("Importmap ontbreekt.");
    if (e.type === "folder" && e.parentId && !ids.has(e.parentId))
      throw new Error("Bovenliggende importmap ontbreekt.");
  }
  store.db.exec("BEGIN IMMEDIATE");
  try {
    const entities = input.entities.map((e) => {
      const result = store.mutate({
        opId: crypto.randomUUID(),
        baseVersion: 0,
        entity: e,
      });
      if (result.status !== "ok") throw new Error("Importconflict.");
      return result.entity as Entity;
    });
    const record: Record = {
      ...input,
      entities,
      createdAt: now(),
      undoneAt: null,
    };
    store.db
      .prepare("INSERT INTO imports VALUES(?,?)")
      .run(record.id, JSON.stringify(record));
    store.db.exec("COMMIT");
    return importSummary(record);
  } catch (e) {
    store.db.exec("ROLLBACK");
    throw e;
  }
}
function undoPlan(store: Store, record: Record, includeChanged = false) {
  const original = new Map(record.entities.map((e) => [e.id, e]));
  const all = store.all().filter((e) => !e.deleted);
  const keep = new Set<string>();
  for (const n of record.entities.filter((e) => e.type === "note")) {
    const current = store.get(n.id);
    if (!current || current.deleted) continue;
    const blocks = all.filter((e) => e.type === "block" && e.noteId === n.id);
    // A new, independently created point always keeps its parent and the whole page.
    if (
      blocks.some((b) => !original.has(b.id)) ||
      (!includeChanged &&
        (current.version !== n.version ||
          record.entities.some(
            (b) =>
              b.type === "block" &&
              b.noteId === n.id &&
              store.get(b.id)?.version !== b.version,
          )))
    ) {
      keep.add(n.id);
      blocks.forEach((b) => keep.add(b.id));
      record.entities
        .filter((b) => b.type === "block" && b.noteId === n.id)
        .forEach((b) => keep.add(b.id));
    }
  }
  for (const f of record.entities.filter((e) => e.type === "folder")) {
    if (!includeChanged && store.get(f.id)?.version !== f.version)
      keep.add(f.id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of all) {
      if (
        (!original.has(e.id) || keep.has(e.id)) &&
        ((e.type === "note" && e.folderId) ||
          (e.type === "folder" && e.parentId))
      ) {
        const parent =
          e.type === "note"
            ? e.folderId
            : e.type === "folder"
              ? e.parentId
              : null;
        if (parent && original.has(parent) && !keep.has(parent)) {
          keep.add(parent);
          changed = true;
        }
      }
    }
  }
  const targets = record.entities
    .map((e) => store.get(e.id))
    .filter((e): e is Entity => !!e && !e.deleted && !keep.has(e.id));
  return {
    targets,
    preservedNotes: record.entities.filter(
      (e) => e.type === "note" && keep.has(e.id),
    ).length,
  };
}
export function previewUndo(store: Store, importId: string) {
  const record = importRecords(store).find((r) => r.id === importId);
  if (!record) throw new Error("Import niet gevonden.");
  const plan = undoPlan(store, record);
  return {
    ...importSummary(record),
    removableNotes: plan.targets.filter((e) => e.type === "note").length,
    preservedNotes: plan.preservedNotes,
  };
}
export function undoImport(
  store: Store,
  importId: string,
  includeChanged = false,
) {
  const record = importRecords(store).find((r) => r.id === importId);
  if (!record) throw new Error("Import niet gevonden.");
  if (record.undoneAt) return { ...importSummary(record), alreadyUndone: true };
  store.db.exec("BEGIN IMMEDIATE");
  try {
    const plan = undoPlan(store, record, includeChanged);
    // Tombstones prevent an offline device from bringing the import back.
    // Children first, then deepest folders last.
    const depth = (e: Entity): number => {
      if (e.type !== "folder") return 0;
      let d = 0,
        p = e.parentId;
      while (p) {
        d++;
        const f = store.get(p);
        p = f?.type === "folder" ? f.parentId : null;
      }
      return d;
    };
    plan.targets.sort(
      (a, b) =>
        (a.type === "block" ? 0 : a.type === "note" ? 1 : 2) -
          (b.type === "block" ? 0 : b.type === "note" ? 1 : 2) ||
        depth(b) - depth(a),
    );
    for (const e of plan.targets)
      store.mutate({
        opId: crypto.randomUUID(),
        baseVersion: e.version,
        entity: { ...e, deleted: true },
      });
    record.undoneAt = now();
    store.db
      .prepare("UPDATE imports SET data=? WHERE id=?")
      .run(JSON.stringify(record), record.id);
    store.db.exec("COMMIT");
    return { ...importSummary(record), preservedNotes: plan.preservedNotes };
  } catch (e) {
    store.db.exec("ROLLBACK");
    throw e;
  }
}
