import { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import {
  MoreHorizontal,
  CalendarDays,
  X,
  ImagePlus,
  GripVertical,
  Check,
} from "lucide-react";
import {
  type Block,
  type Note,
  type Entity,
  reusable,
  text,
} from "../../shared/model";
import { change, cacheImage, imageBlob, addImage } from "./store";
export function localDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function MemoryImage({ id }: { id: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let active = true;
    let url = "";
    let loading = false;
    const load = async () => {
      if (loading || url) return;
      loading = true;
      try {
        const blob = (await imageBlob(id)) ?? (await cacheImage(id));
        if (active) {
          url = URL.createObjectURL(blob);
          setSrc(url);
        }
      } catch {
      } finally {
        loading = false;
      }
    };
    void load();
    window.addEventListener("online", load);
    window.addEventListener("memory-images", load);
    return () => {
      active = false;
      window.removeEventListener("online", load);
      window.removeEventListener("memory-images", load);
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return src ? (
    <img className="memory-image" src={src} alt="Afbeelding bij notitie" />
  ) : (
    <span className="image-unavailable">
      Afbeelding nog niet lokaal beschikbaar
    </span>
  );
}
export function MemoryAttachment({
  attachment,
}: {
  attachment: NonNullable<Block["attachments"]>[number];
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true,
      src = "";
    void (async () => {
      try {
        const blob =
          (await imageBlob(attachment.id)) ?? (await cacheImage(attachment.id));
        src = URL.createObjectURL(blob);
        if (active) setUrl(src);
        else URL.revokeObjectURL(src);
      } catch {}
    })();
    return () => {
      active = false;
      if (src) URL.revokeObjectURL(src);
    };
  }, [attachment.id]);
  return (
    <a
      className="attachment"
      href={url || undefined}
      download={attachment.name}
    >
      {attachment.name} · PDF {url ? "↓" : "(offline nog niet geladen)"}
    </a>
  );
}
export function BlockRow({
  block,
  notes,
  entities,
  focus,
  onFocus,
  onEnter,
  onError,
}: {
  block: Block;
  notes: Note[];
  entities: Entity[];
  focus?: boolean;
  onFocus: (editor: Editor, block: Block) => void;
  onEnter: (block: Block) => void;
  onError: (s: string) => void;
}) {
  const current = useRef({ block, onFocus, onEnter });
  current.current = { block, onFocus, onEnter };
  const [options, setOptions] = useState(false);
  const [draft, setDraft] = useState(block.html);
  const save = (patch: Partial<Block>) => {
    void change([{ ...current.current.block, ...patch }]).catch((e) =>
      onError(e.message),
    );
  };
  const attach = async (file: File) => {
    try {
      const id = await addImage(file);
      if (file.type === "application/pdf")
        save({
          attachments: [
            ...(current.current.block.attachments ?? []),
            { id, name: file.name, mime: "application/pdf", size: file.size },
          ],
        });
      else save({ imageIds: [...current.current.block.imageIds, id] });
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5, 6] },
          link: { openOnClick: false, autolink: false },
        }),
        TableKit,
        Placeholder.configure({
          placeholder:
            block.kind === "heading"
              ? "Kopje"
              : block.kind === "task"
                ? "Een punt om te onthouden…"
                : "Schrijf je gedachten op…",
        }),
      ],
      content: block.html,
      editorProps: {
        attributes: { "aria-label": "Inhoud van punt", role: "textbox" },
        handleKeyDown: (_view, event) => {
          if (
            editor?.isActive("table") ||
            editor?.isActive("codeBlock") ||
            editor?.isActive("listItem") ||
            editor?.isActive("blockquote")
          )
            return false;
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            current.current.onEnter({
              ...current.current.block,
              html: editor?.getHTML() ?? current.current.block.html,
            });
            return true;
          }
          if (event.key === "Tab") {
            event.preventDefault();
            save({
              indent: Math.max(
                0,
                Math.min(
                  6,
                  current.current.block.indent + (event.shiftKey ? -1 : 1),
                ),
              ),
            });
            return true;
          }
          return false;
        },
        handlePaste: (_view, event) => {
          const f = event.clipboardData?.files[0];
          if (f) {
            event.preventDefault();
            void attach(f);
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        setDraft(html);
        save({ html });
      },
      onFocus: ({ editor }) =>
        current.current.onFocus(editor, current.current.block),
    },
    [block.id],
  );
  useEffect(() => {
    if (editor && block.html !== draft && !editor.isFocused) {
      editor.commands.setContent(block.html, { emitUpdate: false });
      setDraft(block.html);
    }
  }, [block.html, editor, draft]);
  useEffect(() => {
    if (focus && editor) editor.commands.focus("end");
  }, [focus, editor]);
  const isReusable = reusable(block, entities);
  return (
    <div
      className={`block-row kind-${block.kind} ${block.done ? "is-done" : ""}`}
      style={{ marginLeft: block.indent * 20 }}
    >
      <span className="row-handle">
        <GripVertical size={14} />
      </span>
      {block.kind === "task" ? (
        <button
          className="checkbox"
          aria-label={block.done ? "Punt heropenen" : "Punt afvinken"}
          aria-pressed={block.done}
          onClick={() => save({ done: !block.done })}
        >
          {block.done && <Check size={13} />}
        </button>
      ) : block.kind === "bullet" ? (
        <span className="bullet">•</span>
      ) : (
        <span className="block-gutter" />
      )}
      <div className="block-body">
        <EditorContent editor={editor} />
        {(block.imageIds.length > 0 || !!block.attachments?.length) && (
          <div className="image-strip">
            {(block.attachments ?? []).map((a) => (
              <MemoryAttachment key={a.id} attachment={a} />
            ))}
            {block.imageIds.map((id) => (
              <MemoryImage key={id} id={id} />
            ))}
          </div>
        )}
        {block.dueAt && (
          <button
            className={`date-chip ${!block.done && Date.parse(block.dueAt) < Date.now() ? "overdue" : ""}`}
            onClick={() => setOptions(!options)}
          >
            <CalendarDays size={12} />
            {new Intl.DateTimeFormat("nl-NL", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(block.dueAt))}
          </button>
        )}
      </div>
      <button
        className="row-options icon-button"
        aria-label="Opties voor punt"
        onClick={() => setOptions(!options)}
      >
        <MoreHorizontal size={18} />
      </button>
      {options && (
        <div className="point-options">
          <div className="options-title">
            Dit punt
            <button
              className="icon-button"
              onClick={() => setOptions(false)}
              aria-label="Opties sluiten"
            >
              <X size={16} />
            </button>
          </div>
          <label>
            Weergave
            <select
              value={block.kind}
              onChange={(e) => save({ kind: e.target.value as Block["kind"] })}
            >
              <option value="text">Hoofdtekst</option>
              <option value="heading">Titel</option>
              <option value="subheading">Subkop</option>
              <option value="bullet">Opsomming</option>
              <option value="task">Afvinkpunt</option>
              <option value="image">Afbeelding</option>
            </select>
          </label>
          <label>
            Datum en tijd
            <input
              aria-label="Datum en tijd van punt"
              type="datetime-local"
              value={localDate(block.dueAt)}
              onChange={(e) =>
                save({
                  dueAt: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null,
                })
              }
            />
          </label>
          <label>
            Bestemming
            <select
              aria-label="Bestemming van punt"
              value={block.noteId ?? ""}
              onChange={(e) =>
                save({ noteId: e.target.value || null, position: Date.now() })
              }
            >
              <option value="">Inbox</option>
              {notes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Herbruikbaar
            <select
              value={
                block.reusable === null ? "inherit" : String(block.reusable)
              }
              onChange={(e) =>
                save({
                  reusable:
                    e.target.value === "inherit"
                      ? null
                      : e.target.value === "true",
                })
              }
            >
              <option value="inherit">
                Volg notitie ({isReusable ? "ja" : "nee"})
              </option>
              <option value="true">Ja, zichtbaar na afvinken</option>
              <option value="false">Nee, naar archief</option>
            </select>
          </label>
          <label>
            Hashtags
            <input
              defaultValue={block.tags.join(", ")}
              onBlur={(e) =>
                save({
                  tags: e.target.value
                    .split(",")
                    .map((s) => s.trim().replace(/^#/, ""))
                    .filter(Boolean),
                })
              }
              placeholder="werk, ideeën"
            />
          </label>
          <label className="file-button">
            <ImagePlus size={16} /> Afbeelding toevoegen
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void attach(f);
              }}
            />
          </label>
          {(block.imageIds.length > 0 || !!block.attachments?.length) && (
            <button
              className="text-button"
              onClick={() => save({ imageIds: [] })}
            >
              Afbeeldingen verwijderen
            </button>
          )}
          <button
            className="danger text-button"
            onClick={() => {
              save({ deleted: true });
              setOptions(false);
            }}
          >
            Punt verwijderen
          </button>
        </div>
      )}
    </div>
  );
}
