import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, cleanHtml } from "../server/store.ts";
import {
  applyImport,
  undoImport,
  previewUndo,
  importRecords,
} from "../server/imports.ts";
import {
  newNote,
  newBlock,
  newFolder,
  archived,
  cloneNote,
  type Entity,
} from "../shared/model.ts";
test("import is atomic, idempotent, scoped; undo preserves independently added and edited notes", () => {
  const s = new Store(":memory:");
  const original = newNote("Todoist");
  s.saveEntities([original]);
  const f = newFolder("Fotoreis"),
    n = { ...newNote("Paklijst", true), folderId: f.id },
    b = { ...newBlock(n.id, "<p>Kamera</p>"), done: true };
  const n2 = { ...newNote("Document"), folderId: f.id },
    b2 = newBlock(n2.id, "<p>Tekst</p>", "text");
  const n3 = { ...newNote("Gewijzigd"), folderId: f.id },
    b3 = newBlock(n3.id, "<p>Brontekst</p>", "text");
  const input = {
    id: crypto.randomUUID(),
    label: "Apple Notities",
    source: "apple-notes" as const,
    entities: [f, n, n2, n3, b, b2, b3],
    warnings: [],
  };
  applyImport(s, input);
  assert.equal(importRecords(s).length, 1);
  applyImport(s, input);
  assert.equal(s.all().length, 8);
  assert.equal(archived(s.get(b.id) as typeof b, s.all()), false);
  assert.equal((cloneNote(n, s.all())[1] as typeof b).done, false);
  const added = newBlock(n.id, "<p>Zelf toegevoegd</p>", "text");
  s.saveEntities([added]);
  s.saveEntities([
    { ...(s.get(b3.id) as typeof b3), html: "<p>Nieuwe tekst</p>" },
  ]);
  const plan = previewUndo(s, input.id);
  assert.equal(plan.removableNotes, 1);
  assert.equal(plan.preservedNotes, 2);
  undoImport(s, input.id);
  assert.equal(s.get(n2.id)?.deleted, true);
  assert.equal(s.get(b2.id)?.deleted, true);
  assert.equal(s.get(n.id)?.deleted, false);
  assert.equal(s.get(n3.id)?.deleted, false);
  assert.equal(s.get(added.id)?.deleted, false);
  assert.equal(s.get(f.id)?.deleted, false);
  assert.equal(s.get(original.id)?.deleted, false);
  undoImport(s, input.id);
  assert.equal(importRecords(s).length, 1);
  s.close();
});
test("failed import changes nothing and rejects scheduled reminders", () => {
  const s = new Store(":memory:");
  const n = newNote("N"),
    b = { ...newBlock(n.id), imageIds: [crypto.randomUUID()] };
  const input = {
    id: crypto.randomUUID(),
    label: "Import",
    source: "apple-notes" as const,
    entities: [n, b],
    warnings: [],
  };
  assert.throws(() => applyImport(s, input));
  assert.equal(s.all().length, 0);
  assert.equal(importRecords(s).length, 0);
  assert.throws(() =>
    applyImport(s, {
      ...input,
      entities: [n, { ...b, imageIds: [], dueAt: new Date().toISOString() }],
    }),
  );
  assert.equal(s.all().length, 0);
  s.close();
});
test("folders validate parents and cycles; sanitizer preserves safe editable structure", () => {
  const s = new Store(":memory:");
  const a = newFolder("A"),
    b = newFolder("B", a.id);
  s.saveEntities([a, b]);
  assert.throws(() =>
    s.saveEntities([{ ...(s.get(a.id) as typeof a), parentId: b.id }]),
  );
  assert.throws(() =>
    s.saveEntities([{ ...(s.get(a.id) as typeof a), deleted: true }]),
  );
  const html = cleanHtml(
    '<table><tr><th colspan="2">Kop</th></tr><tr><td><p><u>A</u> <s>B</s> <a href="https://example.com" onclick="bad()">C</a></p></td></tr></table><pre><code>x</code></pre><script>bad()</script><a href="javascript:bad()">D</a><img src="https://tracker.test">',
  );
  assert.match(html, /<table>/);
  assert.match(html, /<u>A<\/u>/);
  assert.match(html, /<pre><code>x/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(html, /script|onclick|tracker|javascript/);
  s.close();
});

test("undo keeps moved imported points and later additions, including changes to deleted points", () => {
  const s = new Store(":memory:");
  const original = newNote("Mijn eigen notitie");
  s.saveEntities([original]);
  const n = newNote("Importblad"),
    b = newBlock(n.id, "<p>Punt</p>");
  const input = {
    id: crypto.randomUUID(),
    label: "Import",
    source: "apple-notes" as const,
    entities: [n, b],
    warnings: [],
  };
  applyImport(s, input);
  s.saveEntities([{ ...(s.get(b.id) as typeof b), noteId: original.id }]);
  assert.equal(previewUndo(s, input.id).preservedNotes, 1);
  undoImport(s, input.id);
  assert.equal(s.get(b.id)?.deleted, false);
  assert.equal((s.get(b.id) as typeof b).noteId, original.id);
  s.close();
});
test("undo of a previously deleted imported note still tombstones remaining children", () => {
  const s = new Store(":memory:");
  const n = newNote("Importblad"),
    b = newBlock(n.id);
  const input = {
    id: crypto.randomUUID(),
    label: "Import",
    source: "apple-notes" as const,
    entities: [n, b],
    warnings: [],
  };
  applyImport(s, input);
  s.saveEntities([{ ...(s.get(n.id) as typeof n), deleted: true }]);
  undoImport(s, input.id);
  assert.equal(s.get(b.id)?.deleted, true);
  s.close();
});

test("replacement is atomic and idempotent, protects edited pages and folders; undo restores prior content", async () => {
  const { replaceImport, previewReplacement } =
    await import("../server/imports.ts");
  const s = new Store(":memory:");
  const own = newNote("Todoist");
  s.saveEntities([own]);
  const oldId = crypto.randomUUID(),
    nextId = crypto.randomUUID();
  const f = newFolder("Fotografie");
  const make = (title: string) => ({
    ...newNote(title),
    folderId: f.id,
    source: {
      app: "apple-notes" as const,
      id: crypto.randomUUID(),
      importId: oldId,
    },
  });
  const n = make("BIO"),
    edited = make("Helgoland"),
    removed = make("Verwijderd");
  const a = newBlock(n.id, "<p>Eerste</p>", "text"),
    b = newBlock(n.id, "<p>Tweede</p>", "text"),
    c = newBlock(edited.id, "<p>Oud</p>", "text"),
    d = newBlock(removed.id, "Weg", "text");
  applyImport(s, {
    id: oldId,
    label: "Bron",
    source: "apple-notes",
    entities: [f, n, edited, removed, a, b, c, d],
    warnings: [],
  });
  s.saveEntities([
    { ...(s.get(c.id) as typeof c), html: "<p>Mijn eigen wijziging</p>" },
    { ...(s.get(f.id) as typeof f), name: "Mijn fotografie" },
    { ...(s.get(removed.id) as typeof removed), deleted: true },
  ]);
  const expectedOwn = s.get(own.id),
    expectedEdit = s.get(c.id),
    expectedFolder = s.get(f.id);
  const fresh = newBlock(n.id, "<p>Eerste</p><p>Tweede</p>", "text");
  const plan = {
    id: nextId,
    label: "Documenten",
    source: "apple-notes" as const,
    entities: [
      f,
      ...[n, edited, removed].map((n) => ({
        ...n,
        source: { ...n.source, importId: nextId },
        view: "document" as const,
      })),
      fresh,
      newBlock(edited.id, "Vervang niet", "text"),
      newBlock(removed.id, "Niet terugzetten", "text"),
    ],
    warnings: [],
  };
  assert.equal(previewReplacement(s, oldId, plan).replacedNotes, 1);
  assert.equal(previewReplacement(s, oldId, plan).preservedNotes, 2);
  const invalid = {
    ...plan,
    entities: plan.entities.map((e) =>
      e.id === fresh.id ? { ...fresh, imageIds: [crypto.randomUUID()] } : e,
    ),
  };
  assert.throws(() => replaceImport(s, oldId, invalid));
  assert.equal(s.get(a.id)?.deleted, false);
  assert.equal(s.get(n.id)?.version, 1);
  assert.equal(importRecords(s).length, 1);
  replaceImport(s, oldId, plan);
  replaceImport(s, oldId, plan);
  assert.equal(importRecords(s).length, 2);
  assert.equal(s.get(a.id)?.deleted, true);
  assert.equal(s.get(b.id)?.deleted, true);
  assert.equal(s.get(n.id)?.deleted, false);
  assert.equal((s.get(n.id) as typeof n).view, "document");
  assert.deepEqual(s.get(own.id), expectedOwn);
  assert.deepEqual(s.get(c.id), expectedEdit);
  assert.deepEqual(s.get(f.id), expectedFolder);
  assert.equal(s.get(removed.id)?.deleted, true);
  assert.throws(() => undoImport(s, oldId));
  undoImport(s, nextId);
  assert.equal(s.get(fresh.id)?.deleted, true);
  assert.equal(s.get(a.id)?.deleted, false);
  assert.equal((s.get(a.id) as typeof a).html, "<p>Eerste</p>");
  assert.equal(s.get(b.id)?.deleted, false);
  assert.deepEqual(s.get(c.id), expectedEdit);
  assert.deepEqual(s.get(own.id), expectedOwn);
  assert.equal(importRecords(s).find((r) => r.id === oldId)?.replacedBy, null);
  s.close();
});

test("replacement rechecks edits after preview, and its undo preserves later edits", async () => {
  const { replaceImport, previewReplacement } =
    await import("../server/imports.ts");
  const s = new Store(":memory:");
  const oldId = crypto.randomUUID(),
    nextId = crypto.randomUUID();
  const n = {
      ...newNote("BIO"),
      source: {
        app: "apple-notes" as const,
        id: crypto.randomUUID(),
        importId: oldId,
      },
    },
    n2 = {
      ...newNote("Tweede"),
      source: {
        app: "apple-notes" as const,
        id: crypto.randomUUID(),
        importId: oldId,
      },
    };
  const b = newBlock(n.id, "Bron", "text"),
    b2 = newBlock(n2.id, "Bron 2", "text");
  applyImport(s, {
    id: oldId,
    label: "Bron",
    source: "apple-notes",
    entities: [n, n2, b, b2],
    warnings: [],
  });
  const fresh = newBlock(n.id, "Nieuw", "text"),
    fresh2 = newBlock(n2.id, "Nieuw 2", "text");
  const plan = {
    id: nextId,
    label: "Nieuw",
    source: "apple-notes" as const,
    entities: [n, n2].map((n) => ({
      ...n,
      source: { ...n.source, importId: nextId },
    })) as Entity[],
    warnings: [],
  };
  plan.entities.push(fresh, fresh2);
  assert.equal(previewReplacement(s, oldId, plan).replacedNotes, 2);
  s.saveEntities([
    { ...(s.get(b.id) as typeof b), html: "Tijdens voorbereiding aangepast" },
  ]);
  replaceImport(s, oldId, plan);
  assert.equal(s.get(fresh.id), undefined);
  assert.equal(
    (s.get(b.id) as typeof b).html,
    "Tijdens voorbereiding aangepast",
  );
  s.saveEntities([
    { ...(s.get(fresh2.id) as typeof fresh2), html: "Na import aangepast" },
  ]);
  undoImport(s, nextId);
  assert.equal((s.get(fresh2.id) as typeof fresh2).html, "Na import aangepast");
  assert.equal(s.get(fresh2.id)?.deleted, false);
  assert.equal(s.get(b2.id)?.deleted, true);
  s.close();
});
