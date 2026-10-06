import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { Entity, Block, Note } from "../shared/model.ts";
test("Apple Markdown becomes editable mixed content, preserving headings, checkmarks, nesting, tables, links and attachments", () => {
  const root = mkdtempSync(join(tmpdir(), "apple-notes-test-"));
  try {
    mkdirSync(join(root, "Attachments"));
    writeFileSync(
      join(root, "Attachments", "photo.png"),
      Buffer.from("test-image"),
    );
    writeFileSync(join(root, "Attachments", "file.pdf"), "%PDF-1.4\n%%EOF");
    const path = join(root, "Lijst.md");
    writeFileSync(
      path,
      '# **Mijn blad**\n\n## Onderdeel\n\nEen **vette** en *cursieve* [link](https://example.com). Datum 1 juli 2027.\n\n- [x] Klaar\n  - [ ] Kind\n- Los punt\n- [ ]\n\n1. Eerste\n2. Tweede\n\n| A | B |\n|---|---|\n| C | D |\n\n![Foto](Attachments/photo.png)\n\n[Bijlage](Attachments/file.pdf)\n\n<NAAM>\n\n```\n<img src="private.example">\n```\n',
    );
    const manifest = join(root, "source.json"),
      out = join(root, "prepared");
    writeFileSync(
      manifest,
      JSON.stringify([
        { sourceId: crypto.randomUUID(), folder: "Fotoreis", path },
      ]),
    );
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/prepare-apple-notes.ts", manifest, out],
      { stdio: "pipe" },
    );
    const plan = JSON.parse(readFileSync(join(out, "plan.json"), "utf8"));
    const notes = plan.entities.filter(
        (e: Entity) => e.type === "note",
      ) as Note[],
      blocks = plan.entities.filter(
        (e: Entity) => e.type === "block",
      ) as Block[];
    assert.equal(notes[0].title, "Mijn blad");
    assert.equal(notes[0].reusable, true);
    assert.ok(notes[0].folderId);
    const done = blocks.find((b) => b.kind === "task" && b.done);
    assert.match(done!.html, /Klaar/);
    const nested = blocks.find((b) => b.kind === "task" && !b.done);
    assert.equal(nested?.indent, 1);
    assert.equal(blocks.filter((b) => b.kind === "task" && !b.html).length, 1);
    const html = blocks.map((b) => b.html).join("");
    assert.match(html, /<h2>Onderdeel/);
    assert.match(html, /<strong>vette/);
    assert.match(html, /<em>cursieve/);
    assert.match(html, /href="https:\/\/example.com"/);
    assert.match(html, /<table>/);
    assert.match(html, /<ol start="2">/);
    assert.match(html, /&lt;NAAM&gt;/);
    assert.match(html, /&lt;img/);
    assert.ok(blocks.every((b) => b.dueAt === null));
    assert.equal(blocks.flatMap((b) => b.imageIds).length, 1);
    assert.equal(blocks.flatMap((b) => b.attachments ?? []).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
