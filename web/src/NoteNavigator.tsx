import { useState } from "react";
import {
  ChevronRight,
  Folder as FolderIcon,
  NotebookPen,
  Plus,
} from "lucide-react";
import type { Note, Folder } from "../../shared/model";

export function NoteNavigator({
  notes,
  folders,
  selected,
  folderId,
  go,
  addFolder,
  addNote,
}: {
  notes: Note[];
  folders: Folder[];
  selected?: string;
  folderId?: string;
  go: (view: string, id?: string | null) => void;
  addFolder: () => void;
  addNote: () => void;
}) {
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const alphabetical = (items: Note[]) =>
    [...items].sort((a, b) => a.title.localeCompare(b.title, "nl"));
  const noteLink = (n: Note) => (
    <button
      key={n.id}
      className={`note-link ${selected === n.id ? "selected" : ""}`}
      onClick={() => go(n.folderId ? "folder:" + n.folderId : "notes", n.id)}
    >
      <NotebookPen size={14} />
      <span>{n.title || "Zonder titel"}</span>
    </button>
  );
  const tree = (parentId: string | null): React.ReactNode =>
    folders
      .filter((f) => f.parentId === parentId)
      .map((f) => {
        const own = alphabetical(notes.filter((n) => n.folderId === f.id));
        const containsSelection = (id: string): boolean =>
          id === folderId ||
          notes.some((n) => n.id === selected && n.folderId === id) ||
          folders
            .filter((c) => c.parentId === id)
            .some((c) => containsSelection(c.id));
        const expanded = opened.has(f.id) || containsSelection(f.id);
        return (
          <div className="folder-branch" key={f.id}>
            <div className="folder-heading">
              <button
                className="folder-toggle icon-button"
                aria-label={`${expanded ? "Inklappen" : "Uitklappen"}: ${f.name}`}
                aria-expanded={expanded}
                onClick={() => {
                  const next = new Set(opened);
                  expanded ? next.delete(f.id) : next.add(f.id);
                  setOpened(next);
                  if (expanded && containsSelection(f.id)) go("notes");
                }}
              >
                <ChevronRight size={14} />
              </button>
              <button
                className={`note-link ${folderId === f.id && !selected ? "selected" : ""}`}
                onClick={() => {
                  setOpened(new Set([...opened, f.id]));
                  go("folder:" + f.id);
                }}
              >
                <FolderIcon size={14} />
                <span>{f.name}</span>
                <small>{own.length}</small>
              </button>
            </div>
            {expanded && (
              <div className="folder-children">
                {tree(f.id)}
                {own.map(noteLink)}
              </div>
            )}
          </div>
        );
      });
  const apple = notes.filter((n) => n.source?.app === "apple-notes");
  return (
    <>
      <div className="sidebar-label">
        MAPPEN
        <button
          className="icon-button"
          aria-label="Map toevoegen"
          onClick={addFolder}
        >
          <Plus size={15} />
        </button>
      </div>
      {apple.length > 0 && (
        <div className="icloud-nav">
          <span className="sidebar-hint">iCloud</span>
          <button className="note-link" onClick={() => go("icloud")}>
            <NotebookPen size={14} />
            <span>Alle iCloud-notities</span>
            <small>{apple.length}</small>
          </button>
        </div>
      )}
      <div className="folder-nav">{tree(null)}</div>
      <div className="sidebar-label">
        ZONDER MAP
        <button
          className="icon-button"
          aria-label="Notitie toevoegen"
          onClick={addNote}
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="note-nav">
        {alphabetical(notes.filter((n) => !n.folderId)).map(noteLink)}
      </div>
    </>
  );
}
