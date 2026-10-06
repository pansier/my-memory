import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  existsSync,
} from "node:fs";
import { resolve, dirname, basename, extname } from "node:path";
import { createHash } from "node:crypto";
import { marked, Renderer, type Token, type Tokens } from "marked";
import {
  newNote,
  newFolder,
  newBlock,
  entitySchema,
  type Entity,
  type Block,
} from "../shared/model.ts";
import { cleanHtml } from "../server/store.ts";
const manifest = resolve(process.argv[2] ?? ""),
  destination = resolve(process.argv[3] ?? "data/imports/apple-notes-prepared");
if (!process.argv[2])
  throw new Error(
    "Gebruik: prepare-apple-notes.ts source-manifest.json output-directory",
  );
const sources = JSON.parse(readFileSync(manifest, "utf8")) as {
  sourceId: string;
  folder: string;
  path: string;
}[];
const uuid = (key: string) => {
  const b = createHash("sha256")
    .update("my-memory:apple-notes:" + key)
    .digest()
    .subarray(0, 16);
  b[6] = (b[6] & 15) | 80;
  b[8] = (b[8] & 63) | 128;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const importId = uuid("2026-10-06"),
  entities: Entity[] = [],
  files: {
    id: string;
    mime: string;
    name: string;
    path: string;
    bytes: number;
    sha256: string;
  }[] = [],
  warnings: string[] = [];
const folders = new Map<string, string>();
for (const source of sources)
  if (!folders.has(source.folder)) {
    const f = {
      ...newFolder(source.folder.normalize("NFC")),
      id: uuid("folder:" + source.folder),
    };
    folders.set(source.folder, f.id);
    entities.push(f);
  }
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
for (const source of sources) {
  if (!readFileSync(source.path, "utf8").trim()) {
    warnings.push(
      `“${basename(source.path, ".md")}” (${source.folder}) is vergrendeld en niet geïmporteerd.`,
    );
    continue;
  }
  const markdown = readFileSync(source.path, "utf8");
  let tokens = marked.lexer(markdown, { gfm: true, breaks: true });
  let title = basename(source.path, ".md");
  if (tokens[0]?.type === "heading") {
    const first = tokens[0] as Tokens.Heading;
    title = first.text.replace(/\*\*|__/g, "");
    if (first.depth === 1)
      tokens = tokens.slice(1) as ReturnType<typeof marked.lexer>;
  }
  const note = {
    ...newNote(title, true),
    id: uuid("note:" + source.sourceId),
    folderId: folders.get(source.folder)!,
    view: "document" as const,
    reusable: /^\s*[*+-]\s+\[[ xX]\]/m.test(markdown),
    source: { app: "apple-notes" as const, id: source.sourceId, importId },
  };
  entities.push(note);
  let position = 0;
  const add = (
    html: string,
    kind: Block["kind"] = "text",
    indent = 0,
    done = false,
    imageIds: string[] = [],
    attachments: NonNullable<Block["attachments"]> = [],
  ) => {
    const b = {
      ...newBlock(note.id, cleanHtml(html), kind),
      id: uuid(`block:${source.sourceId}:${++position}`),
      position: position * 1000,
      indent: Math.min(indent, 6),
      done,
      imageIds,
      ...(attachments.length ? { attachments } : {}),
    };
    entities.push(entitySchema.parse(b));
  };
  const attachment = (href: string) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(href);
    } catch {
      decoded = href;
    }
    const path = resolve(dirname(source.path), decoded);
    if (!path.startsWith(dirname(source.path) + "/") || !existsSync(path))
      throw new Error(`Bijlage ontbreekt bij ${note.id}`);
    const suffix = extname(path).toLowerCase(),
      mime = (
        {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
          ".gif": "image/gif",
          ".heic": "image/heic",
          ".pdf": "application/pdf",
        } as Record<string, string>
      )[suffix];
    if (!mime) throw new Error("Onbekend bijlagetype " + suffix);
    const data = readFileSync(path),
      sha256 = createHash("sha256").update(data).digest("hex"),
      id = uuid("file:" + sha256);
    if (!files.some((f) => f.id === id))
      files.push({
        id,
        mime,
        name: basename(path),
        path,
        bytes: data.length,
        sha256,
      });
    return { id, mime, name: basename(path), size: data.length };
  };
  const render = (ts: Token[]) => {
    const imageIds: string[] = [],
      attachments: NonNullable<Block["attachments"]> = [];
    const renderer = new Renderer();
    renderer.html = ({ text }) => escape(text); // Literal HTML/code examples are text, never executable markup.
    renderer.image = ({ href, text }) => {
      if (/^(https?:|data:)/i.test(href)) {
        warnings.push(
          `Externe afbeelding in “${title}” blijft een link; deze zat niet in de export.`,
        );
        return `<a href="${escape(href)}">${escape(text || "Afbeelding")}</a>`;
      }
      const a = attachment(href);
      if (a.mime === "application/pdf")
        attachments.push({ ...a, mime: "application/pdf" });
      else imageIds.push(a.id);
      return "";
    };
    const originalLink = renderer.link.bind(renderer);
    renderer.link = (token) => {
      if (
        !/^[a-z][a-z0-9+.-]*:/i.test(token.href) &&
        !token.href.startsWith("#") &&
        /\.pdf(?:$|\?)/i.test(token.href)
      ) {
        const a = attachment(token.href);
        attachments.push({ ...a, mime: "application/pdf" });
        return "";
      }
      return originalLink(token);
    };
    const html = marked.parser(ts as Parameters<typeof marked.parser>[0], {
      renderer,
      gfm: true,
      breaks: true,
    });
    return { html, imageIds, attachments };
  };
  const walk = (ts: Token[], indent = 0) => {
    for (const token of ts) {
      if (token.type === "space") continue;
      if (token.type === "list") {
        const list = token as Tokens.List;
        let ordinal = typeof list.start === "number" ? list.start : 1;
        for (const item of list.items) {
          // Marked does not classify a checkbox with no label as a task.
          // Apple exports these as ordinary empty checklist rows.
          const emptyCheck = /^\[([ xX])\]\s*$/.exec(item.text);
          if (emptyCheck) {
            item.task = true;
            item.checked = emptyCheck[1].toLowerCase() === "x";
            item.tokens = [];
          }
          const own = item.tokens.filter((t) => t.type !== "list");
          const r = render(own);
          let html = r.html,
            kind: Block["kind"] = item.task
              ? "task"
              : list.ordered
                ? "text"
                : "bullet";
          if (list.ordered && !item.task)
            html = `<ol start="${ordinal++}"><li>${html}</li></ol>`;
          add(html, kind, indent, !!item.checked, r.imageIds, r.attachments);
          walk(
            item.tokens.filter((t) => t.type === "list"),
            indent + 1,
          );
        }
      } else {
        const r = render([token]);
        add(r.html, "text", indent, false, r.imageIds, r.attachments);
      }
    }
  };
  walk(tokens);
  if (!markdown.trim())
    warnings.push(
      `“${title}” (${source.folder}) is leeg in de Apple-export; alleen de titel is beschikbaar.`,
    );
}
warnings.push("PASPOORT / ID (Privé) is vergrendeld en niet geïmporteerd.");
mkdirSync(destination, { recursive: true, mode: 0o700 });
const plan = {
  id: importId,
  label: "Apple Notities · 6 oktober 2026",
  source: "apple-notes",
  entities,
  warnings,
};
for (const [name, data] of [
  ["plan.json", plan],
  ["files.json", files],
] as const)
  writeFileSync(resolve(destination, name), JSON.stringify(data), {
    mode: 0o600,
  });
console.log(
  JSON.stringify({
    notes: entities.filter((e) => e.type === "note").length,
    folders: folders.size,
    blocks: entities.filter((e) => e.type === "block").length,
    reusable: entities.filter((e) => e.type === "note" && e.reusable).length,
    files: files.length,
    bytes: files.reduce((s, f) => s + f.bytes, 0),
    warnings: warnings.length,
  }),
);
