import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { Request, Response } from "express";
import { Store } from "./store.ts";
import {
  entitySchema,
  id,
  newBlock,
  newNote,
  newFolder,
  blocksOf,
  cloneNote,
  headings,
  insertUnderHeading,
  text,
  type Entity,
} from "../shared/model.ts";
import { parseDate } from "./dates.ts";
import {
  importSchema,
  importRecords,
  importSummary,
  previewReplacement,
  replaceImport,
  applyImport,
  previewUndo,
  undoImport,
} from "./imports.ts";
const output = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
});
export function makeMcp(store: Store) {
  const server = new McpServer({ name: "my-memory", version: "1.0.0" });
  server.registerTool(
    "list_imports",
    {
      description:
        "Read scoped import history without exporting private database contents.",
      inputSchema: {},
    },
    async () => output(importRecords(store).map(importSummary)),
  );
  server.registerTool(
    "import_notes",
    {
      description:
        "Atomically import a prepared batch of new notes and folders. Upload referenced attachments first. Never schedule inferred dates.",
      inputSchema: { plan: importSchema },
    },
    async ({ plan }) => output(applyImport(store, plan)),
  );
  server.registerTool(
    "preview_import_replacement",
    {
      description:
        "Preview replacement of one Apple Notes import; independently edited or deleted pages and all unrelated content are protected.",
      inputSchema: { previousImportId: id, plan: importSchema },
    },
    async ({ previousImportId, plan }) =>
      output(previewReplacement(store, previousImportId, plan)),
  );
  server.registerTool(
    "replace_import",
    {
      description:
        "Replace a reviewed Apple Notes import atomically using the saved source export. Preserves edited pages, folders, unrelated data and attachment IDs. Records an undo snapshot. Only use on explicit request.",
      inputSchema: { previousImportId: id, plan: importSchema },
    },
    async ({ previousImportId, plan }) =>
      output(replaceImport(store, previousImportId, plan)),
  );
  server.registerTool(
    "preview_import_undo",
    {
      description: "Preview undo protection for a specific import.",
      inputSchema: { importId: id },
    },
    async ({ importId }) => output(previewUndo(store, importId)),
  );
  server.registerTool(
    "undo_import",
    {
      description:
        "Undo one import only on request, preserving later edits. For a replacement, restores the prior pages.",
      inputSchema: { importId: id },
    },
    async ({ importId }) => output(undoImport(store, importId)),
  );
  server.registerTool(
    "read_project",
    {
      description:
        "Read all current notes, tasks, tags and archived tasks. Source content must be preserved. Do not mark ideas done unless explicitly asked or execution confirmed.",
      inputSchema: { tag: z.string().optional() },
    },
    async ({ tag }) => {
      const all = store.all().filter((e) => !e.deleted);
      const notes = all.filter(
        (e) => e.type === "note" && (!tag || e.tags.includes(tag)),
      );
      const ids = new Set(notes.map((n) => n.id));
      return output(
        tag
          ? all.filter(
              (e) =>
                ids.has(e.id) ||
                (e.type === "block" &&
                  (e.tags.includes(tag) ||
                    (!!e.noteId && ids.has(e.noteId)))) ||
                (e.type === "tag" && e.name === tag),
            )
          : all,
      );
    },
  );
  server.registerTool(
    "search",
    {
      description:
        "Find notes, tasks and hashtags, including completed items. Returns matching content and IDs.",
      inputSchema: { query: z.string().min(3) },
    },
    async ({ query }) => {
      const { default: Fuse } = await import("fuse.js");
      return output(
        new Fuse(
          store
            .all()
            .filter((e) => !e.deleted)
            .map((e) => ({
              ...e,
              search:
                e.type === "note"
                  ? e.title + " " + e.tags.join(" ")
                  : e.type === "block"
                    ? text(e.html) + " " + e.tags.join(" ")
                    : e.name,
            })),
          { keys: ["search"], threshold: 0.35 },
        )
          .search(query)
          .map((x) => x.item),
      );
    },
  );
  server.registerTool(
    "read_note",
    {
      description:
        "Read current note, all blocks, versions, formatting and available headings before targeted editing.",
      inputSchema: { noteId: id },
    },
    async ({ noteId }) =>
      output({
        note: store.get(noteId),
        blocks: blocksOf(store.all(), noteId),
        headings: headings(blocksOf(store.all(), noteId)),
      }),
  );
  server.registerTool(
    "create_note",
    {
      description:
        "Create a document or reusable checklist. Tags are optional.",
      inputSchema: {
        title: z.string().max(300),
        reusable: z.boolean().default(false),
        tags: z.array(z.string()).default([]),
        folderId: id.nullable().optional(),
      },
    },
    async ({ title, reusable, tags, folderId }) =>
      output(
        store.saveEntities([{ ...newNote(title, reusable), tags, folderId }]),
      ),
  );
  server.registerTool(
    "create_folder",
    {
      description:
        "Create a named folder; optional parentId creates a subfolder.",
      inputSchema: {
        name: z.string().min(1).max(100),
        parentId: id.nullable().default(null),
      },
    },
    async ({ name, parentId }) =>
      output(store.saveEntities([newFolder(name, parentId)])),
  );
  server.registerTool(
    "add_point",
    {
      description:
        "Add a task or text. Default destination is inbox. For a note, read it first and specify a heading; if missing or ambiguous, returns headings for clarification. Never guess a heading. dueAt must be an explicit ISO instant with offset.",
      inputSchema: {
        html: z.string(),
        noteId: id.optional(),
        heading: z.string().optional(),
        kind: z.enum(["task", "text", "bullet"]).default("task"),
        dueAt: z.string().datetime({ offset: true }).optional(),
      },
    },
    async ({ html, noteId, heading, kind, dueAt }) => {
      let edits: Entity[] = [];
      let block = {
        ...newBlock(noteId ?? null, html, kind),
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      };
      if (noteId) {
        const result = insertUnderHeading(
          blocksOf(store.all(), noteId),
          heading,
          block,
        );
        if (result.needsClarification) return output(result);
        block = result.block;
        edits = result.edits ?? [];
      }
      return output(store.saveEntities([...edits, block]));
    },
  );
  server.registerTool(
    "update_entity",
    {
      description:
        "Update one current entity using its current version. Supports editing, moving a point, tags, scheduling, completing or deleting. Never replace a whole note to add one point. Version conflicts return remote state.",
      inputSchema: { entity: entitySchema },
    },
    async ({ entity }) => output(store.saveEntities([entity as Entity])),
  );
  server.registerTool(
    "set_done",
    {
      description:
        "Complete or reopen a single task, only on explicit request or confirmed execution.",
      inputSchema: {
        blockId: id,
        version: z.number().int(),
        done: z.boolean(),
      },
    },
    async ({ blockId, version, done }) => {
      const b = store.get(blockId);
      if (!b || b.type !== "block" || b.kind !== "task")
        throw new Error("Task not found");
      return output(store.saveEntities([{ ...b, version, done }]));
    },
  );
  server.registerTool(
    "reset_checklist",
    {
      description:
        "Reset checkmarks only on request. Reads current blocks and preserves content, formatting and dates.",
      inputSchema: { noteId: id },
    },
    async ({ noteId }) =>
      output(
        store.saveEntities(
          blocksOf(store.all(), noteId)
            .filter((b) => b.kind === "task" && b.done)
            .map((b) => ({ ...b, done: false })),
        ),
      ),
  );
  server.registerTool(
    "clone_note",
    {
      description:
        "Clone a whole note, independently editable. Checkmarks are reset and scheduled dates removed to prevent duplicate reminders.",
      inputSchema: { noteId: id },
    },
    async ({ noteId }) => {
      const n = store.get(noteId);
      if (!n || n.type !== "note" || n.deleted)
        throw new Error("Note not found");
      return output(store.saveEntities(cloneNote(n, store.all())));
    },
  );
  server.registerTool(
    "parse_date",
    {
      description:
        "Interpret natural-language time in the supplied IANA timezone. Returns an ISO proposal for confirmation. Ask when ambiguous; do not schedule until requested.",
      inputSchema: {
        phrase: z.string(),
        timezone: z.string().default("Europe/Amsterdam"),
        reference: z.string().datetime({ offset: true }).optional(),
      },
    },
    async ({ phrase, timezone, reference }) => {
      const ref = reference ? new Date(reference) : new Date();
      return output({
        timezone,
        reference: ref.toISOString(),
        proposals: parseDate(phrase, timezone, ref),
        needsConfirmation: true,
      });
    },
  );
  return server;
}
export async function handleMcp(store: Store, req: Request, res: Response) {
  const server = makeMcp(store);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
