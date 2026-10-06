import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.ts";
import {
  newBlock,
  newNote,
  cloneNote,
  archived,
  insertUnderHeading,
  blocksOf,
} from "../shared/model.ts";
import { hashPassword, verifyPassword } from "../server/auth.ts";
import { parseDate } from "../server/dates.ts";
import { tick } from "../server/planner.ts";
const mutation = (
  entity: ReturnType<typeof newNote> | ReturnType<typeof newBlock>,
  baseVersion = entity.version,
) => ({ opId: crypto.randomUUID(), entity, baseVersion });
test("idempotent sync, two-device conflict, malicious HTML and transaction rollback", () => {
  const s = new Store(":memory:");
  try {
    const n = newNote("Werk");
    const m = mutation(n);
    const first = s.sync([m]);
    assert.equal(first.results[0].status, "ok");
    assert.deepEqual(s.sync([m]), first);
    assert.equal(s.all().length, 1);
    const a = { ...s.get(n.id)!, title: "Apparaat A" };
    const b = { ...s.get(n.id)!, title: "Apparaat B" };
    assert.equal(s.sync([mutation(a as typeof n)]).results[0].status, "ok");
    const conflict = s.sync([mutation(b as typeof n)]).results[0];
    assert.equal(conflict.status, "conflict");
    assert.equal(s.get(n.id)?.version, 2);
    const point = newBlock(
      n.id,
      '<p onclick="evil()">Goed<script>evil()</script><img src=x onerror=evil()><strong>vet</strong></p>',
    );
    s.sync([mutation(point)]);
    assert.equal(
      (s.get(point.id) as typeof point).html,
      "<p>Goed<strong>vet</strong></p>",
    );
    assert.throws(
      () => s.sync([{ ...m, entity: { ...n, title: "ander" } }]),
      /Operation ID/,
    );
    const another = newNote("Niet opslaan");
    assert.throws(() =>
      s.sync([
        mutation(another),
        mutation(newBlock(crypto.randomUUID(), "Ongeldige bestemming")),
      ]),
    );
    assert.equal(s.get(another.id), undefined);
  } finally {
    s.close();
  }
});
test("one-time archive, reusable override, clone contains independent point IDs and no dates", () => {
  const n = newNote("Paklijst", true);
  const b = {
    ...newBlock(n.id, "<p>Medicijnen</p>"),
    done: true,
    dueAt: "2026-10-20T08:00:00.000Z",
  };
  assert.equal(archived(b, [n, b]), false);
  assert.equal(archived({ ...b, reusable: false }, [n, b]), true);
  const cloned = cloneNote(n, [n, b]);
  assert.notEqual(cloned[0].id, n.id);
  const cb = cloned[1];
  assert.equal(cb.type, "block");
  if (cb.type === "block") {
    assert.notEqual(cb.id, b.id);
    assert.equal(cb.done, false);
    assert.equal(cb.dueAt, null);
    assert.equal(cb.html, b.html);
    assert.equal(cb.noteId, cloned[0].id);
  }
  assert.equal(b.done, true);
});
test("targeted insert reads explicit and bold headings and asks on absent/ambiguous heading", () => {
  const n = newNote();
  const heading = {
    ...newBlock(n.id, "<p><strong>Medicijnen</strong></p>", "text"),
    position: 1000,
  };
  const existing = { ...newBlock(n.id, "<p>Vitaminen</p>"), position: 2000 };
  const second = {
    ...newBlock(n.id, "<p>Kleding</p>", "heading"),
    position: 3000,
  };
  const p = newBlock(n.id, "<p>Pleister</p>");
  const blocks = blocksOf([heading, existing, second], n.id);
  assert.equal(
    insertUnderHeading(blocks, undefined, p).needsClarification,
    true,
  );
  assert.equal(
    insertUnderHeading(blocks, "Niet bestaand", p).needsClarification,
    true,
  );
  const result = insertUnderHeading(blocks, "medicijnen", p);
  assert.equal(result.needsClarification, false);
  if (!result.needsClarification) {
    assert.equal(result.block.position, 2500);
    assert.equal(result.block.indent, 1);
  }
  assert.equal(
    insertUnderHeading(
      [...blocks, { ...heading, id: crypto.randomUUID() }],
      "Medicijnen",
      p,
    ).needsClarification,
    true,
  );
});
test("passwords are salted and wrong password rejected", () => {
  const hash = hashPassword("sterk-wachtwoord-123");
  assert.ok(verifyPassword("sterk-wachtwoord-123", hash));
  assert.ok(!verifyPassword("incorrect", hash));
  assert.notEqual(hash, hashPassword("sterk-wachtwoord-123"));
});
test("natural dates respect Amsterdam timezone and DST; ambiguous times rejected", () => {
  const a = parseDate(
    "morgen om 9:30",
    "Europe/Amsterdam",
    new Date("2026-10-06T20:00:00Z"),
  );
  assert.equal(a[0].dueAt, "2026-10-07T07:30:00Z");
  assert.equal(a[0].timeExplicit, true);
  const b = parseDate(
    "morgen om 9:00",
    "Europe/Amsterdam",
    new Date("2026-10-24T12:00:00Z"),
  );
  assert.equal(b[0].dueAt, "2026-10-25T08:00:00Z");
  assert.throws(() =>
    parseDate(
      "morgen om 2:30",
      "Europe/Amsterdam",
      new Date("2026-10-24T12:00:00Z"),
    ),
  );
});
test("planner sends once, cancels outdated schedules and retries with same deduplication key", async () => {
  const s = new Store(":memory:");
  try {
    const b = {
      ...newBlock(null, "<p>Een herinnering</p>"),
      dueAt: "2026-10-06T09:00:00.000Z",
    };
    s.saveEntities([b]);
    s.db
      .prepare("INSERT INTO subscriptions VALUES(?,?)")
      .run(
        "device",
        JSON.stringify({
          endpoint: "https://web.push.apple.com/test",
          keys: { auth: "a", p256dh: "b" },
        }),
      );
    let count = 0;
    const clock = Date.parse("2026-10-06T10:00:00Z");
    await tick(
      s,
      async (_sub, payload) => {
        count++;
        assert.equal(JSON.parse(payload).body, "Een herinnering");
      },
      clock,
    );
    await tick(
      s,
      async () => {
        count++;
      },
      clock,
    );
    assert.equal(count, 1);
    const changed = {
      ...(s.get(b.id) as typeof b),
      dueAt: "2026-10-06T09:30:00.000Z",
    };
    s.saveEntities([changed]);
    await tick(
      s,
      async () => {
        throw new Error("offline");
      },
      clock,
    );
    s.saveEntities([{ ...(s.get(b.id) as typeof b), done: true }]);
    await tick(
      s,
      async () => {
        count++;
      },
      clock + 1000000,
    );
    assert.equal(count, 1);
    assert.ok(
      s.db.prepare("SELECT key FROM deliveries WHERE state='cancelled'").get(),
    );
  } finally {
    s.close();
  }
});
test("deleted parent produces a recoverable conflict; moving a point preserves its identity", () => {
  const s = new Store(":memory:");
  try {
    const n = newNote("Bestemming");
    const b = newBlock(null, "<p>Zelfstandig punt</p>");
    s.saveEntities([n, b]);
    s.saveEntities([{ ...(s.get(b.id) as typeof b), noteId: n.id }]);
    assert.equal(s.all().filter((e) => e.type === "block").length, 1);
    s.saveEntities([{ ...(s.get(n.id) as typeof n), deleted: true }]);
    const result = s.saveEntities([
      { ...(s.get(b.id) as typeof b), html: "Lokale wijziging" },
    ]);
    assert.equal(result.results[0].status, "conflict");
  } finally {
    s.close();
  }
});
test("consistent SQLite backup restores notes, images and idempotent operations", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { backup } = await import("node:sqlite");
  const dir = mkdtempSync(join(tmpdir(), "memory-backup-"));
  let s: Store | undefined;
  try {
    s = new Store(join(dir, "memory.sqlite"));
    const image = crypto.randomUUID();
    const bytes = Buffer.from("image-bytes");
    s.putImage(image, "image/png", bytes);
    const n = newNote("Back-up bewijs");
    const b = { ...newBlock(n.id, "<p>Bewaard</p>"), imageIds: [image] };
    const m = mutation(n);
    s.sync([m, mutation(b)]);
    await backup(s.db, join(dir, "backup.sqlite"));
    s.close();
    s = new Store(join(dir, "backup.sqlite"));
    assert.equal(s.all().length, 2);
    assert.deepEqual(
      Buffer.from(
        s.db.prepare("SELECT data FROM images WHERE id=?").get(image)!
          .data as Uint8Array,
      ),
      bytes,
    );
    assert.equal(s.sync([m]).results[0].status, "ok");
    assert.equal(s.get(n.id)?.version, 1);
  } finally {
    s?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reordering preserves hidden points, content and schedules, and handles equal ranks", async () => {
  const { repositionBlock } = await import("../shared/model.ts");
  const note = newNote("Paklijst", true);
  const a = {
    ...newBlock(note.id, "<p><strong>Alpha</strong></p>"),
    position: 1000,
    indent: 2,
    done: true,
    dueAt: "2026-12-01T09:00:00Z",
  };
  const hidden = {
    ...newBlock(note.id, "<p>Archief</p>"),
    position: 2000,
    done: true,
    reusable: false,
  };
  const b = { ...newBlock(note.id, "<p>Beta</p>"), position: 3000 };
  const c = { ...newBlock(note.id, "<p>Gamma</p>"), position: 4000 };
  const blocks = [a, hidden, b, c];
  const changes = repositionBlock(blocks, a.id, c.id);
  assert.equal(changes.length, 1);
  assert.deepEqual({ ...changes[0], position: a.position }, a);
  const reordered = blocksOf(
    blocks.map((x) => changes.find((y) => x.id === y.id) ?? x),
    note.id,
  );
  assert.deepEqual(
    reordered.map((x) => x.id),
    [hidden.id, b.id, c.id, a.id],
  );
  const up = repositionBlock(reordered, a.id, hidden.id);
  assert.ok(up[0].position < hidden.position);
  assert.deepEqual(repositionBlock(blocks, a.id, a.id), []);
  assert.deepEqual(repositionBlock(blocks, a.id, "missing"), []);
  const tied = [a, b, c].map((x) => ({ ...x, position: 1000 }));
  const order = blocksOf(tied, note.id);
  const normalized = repositionBlock(order, order[0].id, order[1].id);
  assert.deepEqual(
    blocksOf(normalized, note.id).map((x) => x.id),
    [order[1].id, order[0].id, order[2].id],
  );
  assert.equal(new Set(normalized.map((x) => x.position)).size, 3);
});
