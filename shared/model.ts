import { z } from "zod";
export const id = z.string().uuid();
const common = {
  id,
  version: z.number().int().min(0),
  updatedAt: z.string().datetime(),
  deleted: z.boolean(),
};
export const noteSchema = z.object({
  ...common,
  type: z.literal("note"),
  title: z.string().max(300),
  tags: z.array(z.string().min(1).max(60)).max(50),
  reusable: z.boolean(),
  view: z.enum(["document", "tasks"]),
  folderId: id.nullable().optional(),
  source: z
    .object({
      app: z.literal("apple-notes"),
      id: z.string().max(200),
      importId: id,
    })
    .optional(),
});
export const blockSchema = z.object({
  ...common,
  type: z.literal("block"),
  noteId: id.nullable(),
  kind: z.enum(["text", "heading", "subheading", "bullet", "task", "image"]),
  html: z.string().max(100000),
  indent: z.number().int().min(0).max(6),
  position: z.number().finite(),
  done: z.boolean(),
  reusable: z.boolean().nullable(),
  dueAt: z.string().datetime().nullable(),
  tags: z.array(z.string().min(1).max(60)).max(50),
  imageIds: z.array(id).max(20),
  attachments: z
    .array(
      z.object({
        id,
        name: z.string().max(300),
        mime: z.literal("application/pdf"),
        size: z.number().int().min(0),
      }),
    )
    .max(20)
    .optional(),
});
export const tagSchema = z.object({
  ...common,
  type: z.literal("tag"),
  name: z.string().min(1).max(60),
});
export const folderSchema = z.object({
  ...common,
  type: z.literal("folder"),
  name: z.string().min(1).max(100),
  parentId: id.nullable(),
  tags: z.array(z.string()).max(0),
});
export type Folder = z.infer<typeof folderSchema>;
export function newFolder(
  name: string,
  parentId: string | null = null,
): Folder {
  return { ...base(), type: "folder", name, parentId, tags: [] };
}
export const entitySchema = z.discriminatedUnion("type", [
  noteSchema,
  blockSchema,
  tagSchema,
  folderSchema,
]);
export type Note = z.infer<typeof noteSchema>;
export type Block = z.infer<typeof blockSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type Entity = z.infer<typeof entitySchema>;
export type Mutation = { opId: string; baseVersion: number; entity: Entity };
export const mutationSchema = z.object({
  opId: id,
  baseVersion: z.number().int().min(0),
  entity: entitySchema,
});
export const syncSchema = z.object({
  mutations: z.array(mutationSchema).max(100),
});
export const now = () => new Date().toISOString();
export const base = () => ({
  id: crypto.randomUUID(),
  version: 0,
  updatedAt: now(),
  deleted: false,
});
export function newNote(title = "Nieuwe notitie", reusable = false): Note {
  return {
    ...base(),
    type: "note",
    title,
    tags: [],
    reusable,
    view: reusable ? "document" : "tasks",
  };
}
export function newBlock(
  noteId: string | null = null,
  html = "",
  kind: Block["kind"] = "task",
): Block {
  return {
    ...base(),
    type: "block",
    noteId,
    html,
    kind,
    indent: 0,
    position: Date.now(),
    done: false,
    reusable: null,
    dueAt: null,
    tags: [],
    imageIds: [],
  };
}
export function text(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
export function reusable(block: Block, entities: Entity[]) {
  return (
    block.reusable ??
    !!entities.find(
      (e) => e.type === "note" && e.id === block.noteId && e.reusable,
    )
  );
}
export function archived(block: Block, entities: Entity[]) {
  return block.kind === "task" && block.done && !reusable(block, entities);
}
export function blocksOf(entities: Entity[], noteId: string | null) {
  return entities
    .filter(
      (e): e is Block =>
        e.type === "block" && !e.deleted && e.noteId === noteId,
    )
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}
export function cloneNote(note: Note, entities: Entity[]) {
  const copy = { ...note, ...base(), title: note.title + " (kopie)" };
  return [
    copy,
    ...blocksOf(entities, note.id).map((b) => ({
      ...b,
      ...base(),
      noteId: copy.id,
      done: false,
      dueAt: null,
    })),
  ] as Entity[];
}
export function headings(blocks: Block[]) {
  return blocks
    .filter(
      (b) =>
        b.kind === "heading" ||
        b.kind === "subheading" ||
        /^<h[1-6][ >]/.test(b.html) ||
        /^<p><strong>.*<\/strong><\/p>$/.test(b.html),
    )
    .map((b) => ({ id: b.id, title: text(b.html), indent: b.indent }));
}
export function insertUnderHeading(
  blocks: Block[],
  title: string | undefined,
  block: Block,
) {
  const hs = headings(blocks);
  const matches = hs.filter(
    (h) => h.title.toLocaleLowerCase() === title?.toLocaleLowerCase(),
  );
  if (matches.length !== 1)
    return {
      needsClarification: true as const,
      headings: hs,
      reason: title
        ? "Kopje ontbreekt of is niet uniek."
        : "Kies een bestaand kopje.",
    };
  const heading = matches[0];
  const index = blocks.findIndex((b) => b.id === heading.id);
  let end = index + 1;
  while (end < blocks.length && !hs.some((h) => h.id === blocks[end].id)) end++;
  const before = blocks[end - 1].position;
  const after = blocks[end]?.position;
  return {
    needsClarification: false as const,
    block: {
      ...block,
      indent: Math.min(6, heading.indent + 1),
      position: after === undefined ? before + 1000 : (before + after) / 2,
    },
  };
}

/** Move one point within its list, preserving all content and hidden points. */
export function repositionBlock(
  blocks: Block[],
  id: string,
  overId: string,
): Block[] {
  const ordered = [...blocks].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
  const from = ordered.findIndex((b) => b.id === id);
  const to = ordered.findIndex((b) => b.id === overId);
  if (
    from < 0 ||
    to < 0 ||
    from === to ||
    ordered[from].noteId !== ordered[to].noteId
  )
    return [];
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const before = ordered[to - 1]?.position;
  const after = ordered[to + 1]?.position;
  const position =
    before === undefined
      ? after! - 1000
      : after === undefined
        ? before + 1000
        : before + (after - before) / 2;
  if (
    Number.isFinite(position) &&
    (before === undefined || position > before) &&
    (after === undefined || position < after)
  )
    return [{ ...moved, position }];
  // Equal ranks or exhausted floating-point gaps need a stable renumbering.
  return ordered.map((block, index) => ({
    ...block,
    position: (index + 1) * 1000,
  }));
}
