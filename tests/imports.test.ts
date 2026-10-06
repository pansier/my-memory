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
