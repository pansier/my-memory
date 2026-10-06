import { z } from "zod";
import { entitySchema, id, now, type Entity } from "../shared/model.ts";
import { Store } from "./store.ts";
import { createHash } from "node:crypto";
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
  replacedBy?: string | null;
  replacement?: { previousId: string; before: Entity[]; fingerprint: string };
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
    replacedBy: r.replacedBy ?? null,
    replacement: !!r.replacement,
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
  if (record.replacedBy)
    throw new Error("Deze import is vervangen. Draai de nieuwe import terug.");
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
  if (record.replacedBy)
    throw new Error("Deze import is vervangen. Draai de nieuwe import terug.");
  if (record.undoneAt) return { ...importSummary(record), alreadyUndone: true };
  if (record.replacement) return undoReplacement(store, record);
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

function replacementPlan(store: Store, previousId: string, input: ImportInput) {
  const previous = importRecords(store).find((r) => r.id === previousId);
  if (!previous || previous.undoneAt || previous.replacedBy)
    throw new Error("Alleen een actieve import kan worden vervangen.");
  if (previous.id === input.id)
    throw new Error("De nieuwe import heeft een eigen ID nodig.");
  const originals = new Map(previous.entities.map((e) => [e.id, e]));
  const removable = new Set(undoPlan(store, previous).targets.map((e) => e.id));
  const preserved = previous.entities.filter(
    (e) => e.type === "note" && !removable.has(e.id),
  );
  const keepNotes = new Set(preserved.map((e) => e.id));
  const ids = new Set<string>();
  for (const e of input.entities) {
    if (ids.has(e.id) || e.deleted || e.version !== 0)
      throw new Error(
        "De vervangende import bevat dubbele of ongeldige items.",
      );
    ids.add(e.id);
    const original = originals.get(e.id);
    if (e.type === "note") {
      if (
        original?.type !== "note" ||
        e.source?.id !== original.source?.id ||
        e.source?.importId !== input.id
      )
        throw new Error(
          "Vervang alleen notities uit de oorspronkelijke import, met dezelfde bron-ID.",
        );
    } else if (e.type === "folder") {
      if (original?.type !== "folder")
        throw new Error("Behoud de oorspronkelijke importmappen.");
    } else if (e.type === "block") {
      if (
        !e.noteId ||
        !input.entities.some((n) => n.type === "note" && n.id === e.noteId)
      )
        throw new Error("Importpunt mist zijn notitie.");
      if (e.dueAt || store.get(e.id))
        throw new Error("Nieuwe importpunten moeten nieuw en ongepland zijn.");
    } else throw new Error("Onbekend importonderdeel.");
  }
  for (const e of input.entities) {
    if (e.type === "note" && e.folderId && !ids.has(e.folderId))
      throw new Error("Importmap ontbreekt.");
    if (e.type === "folder" && e.parentId && !ids.has(e.parentId))
      throw new Error("Bovenliggende importmap ontbreekt.");
  }
  const oldNotes = previous.entities.filter((e) => e.type === "note");
  if (oldNotes.some((n) => !ids.has(n.id)))
    throw new Error("Het vervangingsplan mist oorspronkelijke notities.");
  const incoming = input.entities.filter((e) =>
    e.type === "note"
      ? !keepNotes.has(e.id)
      : e.type === "block"
        ? !keepNotes.has(e.noteId!)
        : false,
  );
  const oldBlocks = previous.entities
    .filter((e) => e.type === "block" && removable.has(e.id))
    .map((e) => store.get(e.id))
    .filter((e): e is Entity => !!e && !e.deleted);
  return { previous, incoming, oldBlocks, preserved, originals };
}
export function previewReplacement(
  store: Store,
  previousId: string,
  input: ImportInput,
) {
  const p = replacementPlan(store, previousId, input);
  return {
    replacedNotes: p.incoming.filter((e) => e.type === "note").length,
    preservedNotes: p.preserved.length,
    preservedTitles: p.preserved
      .filter((e) => e.type === "note")
      .map((e) => e.title),
    blocks: p.incoming.filter((e) => e.type === "block").length,
  };
}
export function replaceImport(
  store: Store,
  previousId: string,
  input: ImportInput,
) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ previousId, input }))
    .digest("hex");
  const existing = importRecords(store).find((r) => r.id === input.id);
  if (existing) {
    if (existing.replacement?.fingerprint !== fingerprint)
      throw new Error("Import-ID is al gebruikt voor een ander plan.");
    return { ...importSummary(existing), alreadyImported: true };
  }
  store.db.exec("BEGIN IMMEDIATE");
  try {
    // Re-evaluate protection inside the transaction: edits since preview are kept.
    const p = replacementPlan(store, previousId, input);
    const before = [
      ...p.oldBlocks,
      ...p.incoming
        .filter((e) => e.type === "note")
        .map((e) => store.get(e.id)!),
    ];
    for (const e of p.oldBlocks) {
      const r = store.mutate({
        opId: crypto.randomUUID(),
        baseVersion: e.version,
        entity: { ...e, deleted: true },
      });
      if (r.status !== "ok") throw new Error("Importconflict.");
    }
    const entities = p.incoming.map((e) => {
      const version = store.get(e.id)?.version ?? 0;
      const r = store.mutate({
        opId: crypto.randomUUID(),
        baseVersion: version,
        entity: { ...e, version },
      });
      if (r.status !== "ok") throw new Error("Importconflict.");
      return r.entity as Entity;
    });
    const record: Record = {
      ...input,
      entities,
      createdAt: now(),
      undoneAt: null,
      replacement: { previousId, before, fingerprint },
    };
    store.db
      .prepare("INSERT INTO imports VALUES(?,?)")
      .run(record.id, JSON.stringify(record));
    p.previous.replacedBy = record.id;
    store.db
      .prepare("UPDATE imports SET data=? WHERE id=?")
      .run(JSON.stringify(p.previous), previousId);
    store.db.exec("COMMIT");
    return { ...importSummary(record), preservedNotes: p.preserved.length };
  } catch (e) {
    store.db.exec("ROLLBACK");
    throw e;
  }
}
function undoReplacement(store: Store, record: Record) {
  store.db.exec("BEGIN IMMEDIATE");
  try {
    const p = undoPlan(store, record);
    const targets = new Set(p.targets.map((e) => e.id));
    const notes = new Set(
      record.entities
        .filter((e) => e.type === "note" && targets.has(e.id))
        .map((e) => e.id),
    );
    for (const e of record.replacement!.before) {
      if (
        e.type === "block" &&
        e.noteId &&
        store.get(e.id)?.version !== e.version + 1
      )
        notes.delete(e.noteId);
    }
    // Remove only unchanged replacement pages. User edits preserve the whole page.
    for (const e of p.targets.filter(
      (e) => e.type === "block" && !!e.noteId && notes.has(e.noteId),
    ))
      store.mutate({
        opId: crypto.randomUUID(),
        baseVersion: e.version,
        entity: { ...e, deleted: true },
      });
    const before = record
      .replacement!.before.filter((e) =>
        e.type === "note"
          ? notes.has(e.id)
          : e.type === "block" && !!e.noteId && notes.has(e.noteId),
      )
      .sort(
        (a, b) => (a.type === "note" ? 0 : 1) - (b.type === "note" ? 0 : 1),
      );
    for (const e of before) {
      const current = store.get(e.id)!;
      const r = store.mutate(
        {
          opId: crypto.randomUUID(),
          baseVersion: current.version,
          entity: { ...e, version: current.version },
        },
        true,
      );
      if (r.status !== "ok") throw new Error("Herstelconflict.");
    }
    record.undoneAt = now();
    store.db
      .prepare("UPDATE imports SET data=? WHERE id=?")
      .run(JSON.stringify(record), record.id);
    // Rebase the old import onto restored versions, so its later undo remains scoped.
    const previous = importRecords(store).find(
      (r) => r.id === record.replacement!.previousId,
    )!;
    previous.replacedBy = null;
    previous.entities = previous.entities.map((e) => {
      const current = store.get(e.id);
      return (e.type === "note"
        ? notes.has(e.id)
        : e.type === "block" && !!e.noteId && notes.has(e.noteId)) && current
        ? current
        : e;
    });
    store.db
      .prepare("UPDATE imports SET data=? WHERE id=?")
      .run(JSON.stringify(previous), previous.id);
    store.db.exec("COMMIT");
    return {
      ...importSummary(record),
      preservedNotes:
        record.entities.filter((e) => e.type === "note").length - notes.size,
      restoredNotes: notes.size,
    };
  } catch (e) {
    store.db.exec("ROLLBACK");
    throw e;
  }
}
