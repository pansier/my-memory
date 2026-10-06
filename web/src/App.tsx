import { useEffect, useState, useRef, type FormEvent } from "react";
import type { Editor } from "@tiptap/react";
import Fuse from "fuse.js";
import {
  Inbox,
  NotebookPen,
  Archive,
  Search,
  Plus,
  Hash,
  CalendarDays,
  ChevronRight,
  ArrowLeft,
  Settings,
  WifiOff,
  Check,
  Cloud,
  Menu,
  X,
  Copy,
  RotateCcw,
  ImagePlus,
  Bold,
  Italic,
  List,
  CheckSquare,
  IndentIncrease,
  IndentDecrease,
  Download,
  Bell,
  LogOut,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import {
  type Entity,
  type Note,
  type Block,
  type Tag,
  type Folder,
  newFolder,
  newNote,
  newBlock,
  blocksOf,
  archived,
  cloneNote,
  base,
  text,
} from "../../shared/model";
import { Imports } from "./Imports";
import * as store from "./store";
import { BlockRow, localDate } from "./BlockRow";
const nav = [
  { id: "inbox", title: "Inbox", icon: Inbox },
  { id: "notes", title: "Alle notities", icon: NotebookPen },
  { id: "reminders", title: "Herinneringen", icon: CalendarDays },
  { id: "archive", title: "Archief", icon: Archive },
];
function escape(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
export function App() {
  const [, render] = useState(0);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("inbox");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mobile, setMobile] = useState(false);
  const [settings, setSettings] = useState(false);
  const [login, setLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quick, setQuick] = useState("");
  const [destination, setDestination] = useState("");
  const [due, setDue] = useState("");
  const [newDialog, setNewDialog] = useState(false);
  const [title, setTitle] = useState("");
  const [isReusable, setReusable] = useState(false);
  const [focusId, setFocus] = useState("");
  const [rowLimit, setRowLimit] = useState(100);
  useEffect(() => setRowLimit(100), [view, selected, query]);
  const [active, setActive] = useState<{ editor: Editor; id: string } | null>(
    null,
  );
  const quickRef = useRef<HTMLInputElement>(null);
  const lastSelection = useRef<string | null>(null);
  useEffect(() => {
    const unsub = store.subscribe(() => render((v) => v + 1));
    void store
      .init()
      .then(() => setReady(true))
      .catch((e) => {
        setError(e.message);
        setReady(true);
      });
    return unsub;
  }, []);
  const s = store.snapshot;
  useEffect(() => {
    setSelected(null);
    setView("inbox");
    setQuery("");
    setQuick("");
    setDestination("");
    setDue("");
    setActive(null);
    setNewDialog(false);
    setTitle("");
    setSettings(false);
    setError("");
    setNotice("");
  }, [s.account?.id]);
  const entities = s.entities;
  const alive = entities.filter((e) => !e.deleted);
  const notes = alive
    .filter((e): e is Note => e.type === "note")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const folders = alive
    .filter((e): e is Folder => e.type === "folder")
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const folder = folders.find((f) => view === "folder:" + f.id);
  const folderPath = (f: Folder): string => {
    const parent = folders.find((p) => p.id === f.parentId);
    return parent ? folderPath(parent) + " / " + f.name : f.name;
  };
  const note = notes.find((n) => n.id === selected);
  const pointAlive = (b: Block) =>
    !b.deleted && (!b.noteId || notes.some((n) => n.id === b.noteId));
  const points = entities.filter(
    (e): e is Block => e.type === "block" && pointAlive(e),
  );
  const tags = [
    ...new Set([
      ...alive.filter((e): e is Tag => e.type === "tag").map((t) => t.name),
      ...alive.flatMap((e) => (e.type !== "tag" ? e.tags : [])),
    ]),
  ].sort();
  const go = (v: string, id: string | null = null) => {
    setView(v);
    setSelected(id);
    setDestination(id ?? "");
    setQuery("");
    setMobile(false);
    setActive(null);
  };
  useEffect(() => {
    if (selected !== lastSelection.current) {
      setActive(null);
      lastSelection.current = selected;
    }
  }, [selected]);
  useEffect(() => {
    if (ready) {
      const id = new URLSearchParams(location.search).get("item");
      const item = store.snapshot.entities.find((e) => e.id === id);
      if (item?.type === "block") {
        setView("reminders");
        setSelected(item.noteId);
        setFocus(item.id);
      }
    }
  }, [ready]);
  const report = (message: string) => {
    setError(message);
  };
  const save = (e: Entity[]) => {
    void store.change(e).catch((e) => report(e.message));
  };
  const notify = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 5000);
  };
  const counts = {
    inbox: points.filter((b) => !b.noteId && !archived(b, entities)).length,
    notes: notes.length,
    reminders: points.filter((b) => b.kind === "task" && !b.done).length,
    archive: points.filter((b) => archived(b, entities)).length,
  };
  let rows: Block[] = note
    ? blocksOf(entities, note.id).filter((b) => !archived(b, entities))
    : view === "inbox"
      ? points
          .filter((b) => !b.noteId && !archived(b, entities))
          .sort((a, b) => a.position - b.position)
      : view === "archive"
        ? points.filter((b) => archived(b, entities))
        : view.startsWith("tag:")
          ? points.filter(
              (b) =>
                !archived(b, entities) &&
                (b.tags.includes(view.slice(4)) ||
                  !!notes
                    .find((n) => n.id === b.noteId)
                    ?.tags.includes(view.slice(4))),
            )
          : points
              .filter((b) => b.kind === "task" && !b.done)
              .sort((a, b) =>
                (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"),
              );
  useEffect(() => {
    if (focusId) {
      const index = rows.findIndex((b) => b.id === focusId);
      if (index >= rowLimit) setRowLimit(index + 25);
    }
  }, [focusId, rows.length, rowLimit]);
  const searchResults =
    query.length >= 3
      ? new Fuse(
          alive.map((e) => ({
            ...e,
            search:
              e.type === "note"
                ? e.title +
                  " " +
                  e.tags.join(" ") +
                  " " +
                  folders
                    .filter((f) => f.id === e.folderId)
                    .map(folderPath)
                    .join(" ")
                : e.type === "block"
                  ? text(e.html) + " " + e.tags.join(" ")
                  : e.name,
          })),
          { keys: ["search"], threshold: 0.35, ignoreLocation: true },
        )
          .search(query)
          .filter((r) => r.item.type !== "block" || pointAlive(r.item))
      : [];
  const enter = (b: Block) => {
    const currentRows = blocksOf(store.snapshot.entities, b.noteId);
    const i = currentRows.findIndex((r) => r.id === b.id);
    const next = currentRows[i + 1];
    if (!text(b.html) && b.kind === "bullet") {
      save([{ ...b, kind: "text" }]);
      return;
    }
    const created = {
      ...newBlock(
        b.noteId,
        "",
        b.kind === "heading" || b.kind === "subheading" ? "text" : b.kind,
      ),
      indent: b.indent,
      position: next ? (b.position + next.position) / 2 : b.position + 1000,
    };
    save([created]);
    setFocus(created.id);
  };
  async function releaseNotifications() {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.pushManager) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await store.accountFetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  }
  async function doLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const differentAccount =
        s.account && username.trim().toLowerCase() !== s.account.username;
      if (differentAccount && (s.pending.length || s.conflicts.length))
        throw new Error(
          "Synchroniseer of exporteer eerst je lokale wijzigingen voordat je een ander account opent.",
        );
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { account } = await res.json();
      if (differentAccount) await releaseNotifications();
      await store.setAuthenticated(true, account);
      setPassword("");
      setLogin(false);
    } catch (e) {
      report((e as Error).message);
    }
  }
  async function quickAdd(event: FormEvent) {
    event.preventDefault();
    if (!quick.trim()) return;
    const b = {
      ...newBlock(destination || null, `<p>${escape(quick.trim())}</p>`),
      dueAt: due ? new Date(due).toISOString() : null,
    };
    try {
      await store.change([b]);
      setQuick("");
      setDue("");
      notify("Punt toegevoegd");
    } catch (e) {
      report((e as Error).message);
    }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    const n = newNote(title.trim() || "Nieuwe notitie", isReusable);
    if (folder) n.folderId = folder.id;
    if (view.startsWith("tag:")) n.tags = [view.slice(4)];
    const b = newBlock(n.id, "", "text");
    save([n, b]);
    setNewDialog(false);
    setTitle("");
    go("notes", n.id);
    setFocus(b.id);
  }
  async function attach(file: File) {
    try {
      const id = await store.addImage(file);
      const b =
        file.type === "application/pdf"
          ? {
              ...newBlock(note?.id ?? null, "", "text"),
              attachments: [
                {
                  id,
                  name: file.name,
                  mime: "application/pdf" as const,
                  size: file.size,
                },
              ],
            }
          : { ...newBlock(note?.id ?? null, "", "image"), imageIds: [id] };
      save([b]);
      notify("Afbeelding lokaal bewaard");
    } catch (e) {
      report((e as Error).message);
    }
  }
  function format(kind: Block["kind"]) {
    const b = entities.find((e) => e.id === active?.id);
    if (b?.type === "block") save([{ ...b, kind }]);
  }
  async function notifications() {
    try {
      if (!("Notification" in window) || !("PushManager" in window))
        throw new Error(
          "Webpush is niet beschikbaar in deze browser. Installeer de webapp op het iPhone-beginscherm.",
        );
      if (Notification.permission === "denied")
        throw new Error(
          "Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je iPhone of browser voor My Memory en probeer opnieuw.",
        );
      // Ask directly from the tap, before network waits can expire user activation.
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error("Sta meldingen toe om herinneringen te ontvangen.");
      const config = await store
        .accountFetch("/api/push/config")
        .then((r) => r.json());
      if (!config.publicKey)
        throw new Error(
          "De serverplanner wordt geactiveerd bij HTTPS-hosting.",
        );
      const registration = await navigator.serviceWorker.ready;
      const base64 = config.publicKey.replaceAll("-", "+").replaceAll("_", "/");
      const key = Uint8Array.from(
        atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)),
        (c) => c.charCodeAt(0),
      );
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const res = await store.accountFetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      notify("Meldingen ingeschakeld");
    } catch (e) {
      report((e as Error).message);
    }
  }
  async function download() {
    try {
      await store.offlineDownload();
      notify("Alle beschikbare gegevens en afbeeldingen zijn lokaal bewaard.");
    } catch (e) {
      report((e as Error).message);
    }
  }
  async function exportLocal() {
    try {
      const blob = new Blob([await store.exportData()], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my-memory-export.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      report((e as Error).message);
    }
  }
  async function logout() {
    if (s.pending.length || s.conflicts.length) {
      report(
        "Synchroniseer of exporteer eerst je lokale wijzigingen. Je kunt daarna de lokale opslag wissen via instellingen.",
      );
      return;
    }
    try {
      await releaseNotifications();
      const response = await store.accountFetch("/api/logout", {
        method: "POST",
      });
      if (!response.ok)
        throw new Error("Log opnieuw in bij dit account om uit te loggen.");
      await store.clearLocal();
      setUsername("");
      setPassword("");
      setLogin(false);
      setSettings(false);
    } catch (e) {
      report((e as Error).message);
    }
  }
  const expired =
    store.syncStatus.includes("Log opnieuw in") ||
    store.syncStatus.includes("sessie");
  if (!ready)
    return (
      <div className="loading">
        <img src="/brain.svg" alt="" />
        Je geheugen openen…
      </div>
    );
  if (!s.authenticated || login)
    return (
      <main className="login-page">
        <div className="login-card">
          <img src="/brain.svg" className="login-brain" alt="My Memory" />
          <span className="eyebrow">RUIMTE VOOR JE GEDACHTEN</span>
          <h1>
            My Memory<span>.</span>
          </h1>
          <p>
            Alles wat je wilt bewaren.
            <br />
            En niets dat je hoeft te onthouden.
          </p>
          <form onSubmit={doLogin}>
            <label>
              Gebruikersnaam
              <input
                autoFocus
                aria-label="Gebruikersnaam"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <label>
              Je wachtwoord
              <input
                aria-label="Wachtwoord"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="primary" type="submit">
              Open mijn geheugen <ArrowUpRight size={18} />
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {s.authenticated && (
            <button className="text-button" onClick={() => setLogin(false)}>
              Terug naar lokale gegevens
            </button>
          )}
          <small>Notities · Checklists · Herinneringen</small>
        </div>
        <div className="login-art" aria-hidden="true">
          <div className="paper paper-one">
            <span>een idee voor later</span>
            <div />
            <div />
            <div />
          </div>
          <div className="paper paper-two">
            <span>ruimte in je hoofd</span>
            <img src="/brain.svg" alt="" />
          </div>
          <span className="art-caption">Bewaar het hier. Laat het los.</span>
        </div>
      </main>
    );
  return (
    <div key={s.account?.id ?? "guest"} className="app">
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("inbox");
          }}
        >
          <img src="/brain.svg" alt="" />
          My Memory<span>.</span>
        </a>
        <p className="brand-subtitle">Een plek voor alles in je hoofd.</p>
        <div className="search-box">
          <Search size={16} />
          <input
            aria-label="Zoeken"
            placeholder="Zoek in je geheugen…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
          />
          <kbd>⌕</kbd>
        </div>
        <nav aria-label="Hoofdnavigatie">
          {nav.map((n) => (
            <button
              key={n.id}
              className={
                view === n.id && !note ? "nav-item selected" : "nav-item"
              }
              onClick={() => go(n.id)}
            >
              <n.icon size={18} />
              {n.title}
              <span className="count">
                {counts[n.id as keyof typeof counts]}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-content">
          <div className="sidebar-label">
            ONDERWERPEN
            <button
              className="icon-button"
              aria-label="Onderwerp toevoegen"
              onClick={() => {
                const name = prompt("Naam van hashtag");
                if (name?.trim())
                  save([
                    {
                      ...base(),
                      type: "tag",
                      name: name.trim().replace(/^#/, ""),
                    },
                  ]);
              }}
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="tag-nav">
            {tags.map((tag) => (
              <button
                key={tag}
                className={
                  view === "tag:" + tag ? "tag-item selected" : "tag-item"
                }
                onClick={() => go("tag:" + tag)}
              >
                <Hash size={16} />
                {tag}
                <ChevronRight size={13} />
              </button>
            ))}
            {!tags.length && (
              <span className="sidebar-hint">
                Geef je notities een hashtag.
              </span>
            )}
          </div>
          <div className="sidebar-label">
            MAPPEN
            <button
              className="icon-button"
              aria-label="Map toevoegen"
              onClick={() => {
                const name = prompt("Naam van nieuwe map")?.trim();
                if (name) save([newFolder(name, folder?.id ?? null)]);
              }}
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="folder-nav">
            {folders.map((f) => (
              <button
                key={f.id}
                className={
                  folder?.id === f.id ? "note-link selected" : "note-link"
                }
                onClick={() => go("folder:" + f.id)}
              >
                <NotebookPen size={14} />
                <span>{folderPath(f)}</span>
                <small>{notes.filter((n) => n.folderId === f.id).length}</small>
              </button>
            ))}
          </div>
          <div className="sidebar-label">
            JE NOTITIES
            <button
              className="icon-button"
              aria-label="Notitie toevoegen"
              onClick={() => setNewDialog(true)}
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="note-nav">
            {notes.slice(0, 12).map((n) => (
              <button
                key={n.id}
                className={
                  note?.id === n.id ? "note-link selected" : "note-link"
                }
                onClick={() => go("notes", n.id)}
              >
                <NotebookPen size={14} />
                <span>{n.title || "Zonder titel"}</span>
                {n.reusable && <RotateCcw size={12} />}
              </button>
            ))}
          </div>
        </div>
        <div className="sidebar-bottom">
          <button className="new-note" onClick={() => setNewDialog(true)}>
            <Plus size={17} /> Nieuwe notitie
          </button>
          <button className="account" onClick={() => setSettings(true)}>
            <span className="avatar">
              {(s.account?.username ?? "A").slice(0, 1).toUpperCase()}
            </span>
            <span>
              {s.account?.username ?? "Mijn geheugen"}
              <small>Persoonlijke werkruimte</small>
            </span>
            <Settings size={17} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Navigatie openen"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Mijn geheugen</span>
            <ChevronRight size={13} />
            <strong>
              {note?.title ??
                folder?.name ??
                (view.startsWith("tag:")
                  ? "#" + view.slice(4)
                  : nav.find((n) => n.id === view)?.title)}
            </strong>
          </div>
          <button
            className={`sync-button ${s.conflicts.length ? "sync-warning" : ""}`}
            onClick={() => (expired ? setLogin(true) : void store.sync())}
            title={
              s.lastSync
                ? "Laatst gesynchroniseerd: " +
                  new Date(s.lastSync).toLocaleString("nl-NL")
                : ""
            }
          >
            {!navigator.onLine ? (
              <WifiOff size={14} />
            ) : store.syncStatus === "Gesynchroniseerd" ? (
              <Check size={14} />
            ) : (
              <Cloud size={14} />
            )}
            <span>{store.syncStatus}</span>
          </button>
        </header>
        <div
          className="workspace"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => {
            if (e.dataTransfer.files.length) {
              e.preventDefault();
              for (const file of e.dataTransfer.files) void attach(file);
            }
          }}
        >
          {error && (
            <div className="alert" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Melding sluiten"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <Check size={15} />
              {notice}
            </div>
          )}
          {s.conflicts.map((c) => (
            <div className="conflict" key={c.id}>
              <strong>
                Twee wijzigingen van hetzelfde{" "}
                {c.local.type === "note" ? "notitieblad" : "punt"}
              </strong>
              <p>Beide versies zijn bewaard. Kies welke je wilt gebruiken.</p>
              <div className="conflict-versions">
                <div>
                  <small>Op dit apparaat</small>
                  <p>
                    {c.local.type === "note"
                      ? c.local.title
                      : c.local.type === "block"
                        ? text(c.local.html)
                        : c.local.name}
                  </p>
                </div>
                <div>
                  <small>Op de server</small>
                  <p>
                    {c.remote?.deleted
                      ? "Verwijderd"
                      : c.remote?.type === "note"
                        ? c.remote.title
                        : c.remote?.type === "block"
                          ? text(c.remote.html)
                          : c.remote?.type === "tag"
                            ? c.remote.name
                            : "Geen item"}
                  </p>
                </div>
              </div>
              <div className="button-row">
                {!c.remote?.deleted &&
                  !(
                    c.local.type === "block" &&
                    c.local.noteId &&
                    entities.find(
                      (e) =>
                        e.id === ("noteId" in c.local ? c.local.noteId : null),
                    )?.deleted
                  ) && (
                    <button
                      onClick={() => void store.resolveConflict(c.id, "local")}
                    >
                      Mijn wijziging gebruiken
                    </button>
                  )}
                <button
                  onClick={() => void store.resolveConflict(c.id, "remote")}
                >
                  Serverversie gebruiken
                </button>
                <button
                  onClick={() => void store.resolveConflict(c.id, "both")}
                >
                  Lokale kopie bewaren
                </button>
              </div>
            </div>
          ))}
          {query.length > 0 ? (
            <>
              <span className="eyebrow">JE GEHEUGEN DOORZOEKEN</span>
              <h1>
                Zoekresultaten<span>.</span>
              </h1>
              <p className="subtitle">
                {query.length < 3
                  ? "Typ minimaal drie tekens."
                  : `${searchResults.length} resultaten voor “${query}” · inclusief archief`}
              </p>
              <div className="search-results">
                {searchResults.map(({ item }) => (
                  <button
                    key={item.id}
                    className="search-result"
                    onClick={() => {
                      if (item.type === "note") go("notes", item.id);
                      else if (item.type === "tag") go("tag:" + item.name);
                      else if (item.type === "folder") go("folder:" + item.id);
                      else {
                        go(
                          archived(item, entities)
                            ? "archive"
                            : item.noteId
                              ? "notes"
                              : "inbox",
                          archived(item, entities) ? null : item.noteId,
                        );
                        setFocus(item.id);
                      }
                    }}
                  >
                    <span className="result-icon">
                      {item.type === "note" ? (
                        <NotebookPen size={18} />
                      ) : item.type === "tag" || item.type === "folder" ? (
                        <Hash size={18} />
                      ) : (
                        <CheckSquare size={18} />
                      )}
                    </span>
                    <span>
                      {item.type === "note"
                        ? item.title
                        : item.type === "tag" || item.type === "folder"
                          ? item.name
                          : text(item.html)}
                      <small>
                        {item.type === "block" && archived(item, entities)
                          ? "Afgerond · archief"
                          : item.type === "note"
                            ? "Notitie"
                            : item.type === "tag"
                              ? "Onderwerp"
                              : "Punt"}
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {note
                      ? "JOUW NOTITIEBLAD"
                      : view === "inbox"
                        ? "VANG JE GEDACHTEN"
                        : view === "notes"
                          ? "GROOT EN KLEIN, ALLES BIJ ELKAAR"
                          : view === "archive"
                            ? "AFGEROND EN BEWAARD"
                            : view.startsWith("tag:")
                              ? "EEN ONDERWERP, AL JE IDEEËN"
                              : "OP HET JUISTE MOMENT"}
                  </span>
                  {note ? (
                    <input
                      className="note-title"
                      aria-label="Notitietitel"
                      value={note.title}
                      onChange={(e) =>
                        save([{ ...note, title: e.target.value }])
                      }
                    />
                  ) : (
                    <h1>
                      {view.startsWith("tag:")
                        ? "#" + view.slice(4)
                        : (folder?.name ??
                          nav.find((n) => n.id === view)?.title)}
                      <span>.</span>
                    </h1>
                  )}
                  <p className="subtitle">
                    {note
                      ? note.reusable
                        ? "Een herbruikbaar blad. Vink af, reset en gebruik opnieuw."
                        : "Gedachten, beelden en actiepunten op één blad."
                      : view === "inbox"
                        ? "Zet het hier neer. Geef het later een plek."
                        : view === "notes"
                          ? "Een plek voor ideeën die je wilt vasthouden."
                          : view === "archive"
                            ? "Uit je hoofd, maar niet verdwenen."
                            : view.startsWith("tag:")
                              ? "Notities en punten met hetzelfde onderwerp."
                              : "Alles wat nog aandacht vraagt, op datum gesorteerd."}
                  </p>
                </div>
                {!note && (view === "notes" || !!folder) && (
                  <button
                    className="primary small"
                    onClick={() => setNewDialog(true)}
                  >
                    <Plus size={16} />
                    Nieuwe notitie
                  </button>
                )}
              </div>
              {folder && !note && (
                <div className="note-actions">
                  <button
                    onClick={() => {
                      const name = prompt(
                        "Nieuwe mapnaam",
                        folder.name,
                      )?.trim();
                      if (name) save([{ ...folder, name }]);
                    }}
                  >
                    Map hernoemen
                  </button>
                  <button
                    onClick={() => {
                      if (
                        notes.some((n) => n.folderId === folder.id) ||
                        folders.some((f) => f.parentId === folder.id)
                      ) {
                        report("Verplaats eerst de inhoud van deze map.");
                        return;
                      }
                      if (confirm("Deze lege map verwijderen?")) {
                        save([{ ...folder, deleted: true }]);
                        go("notes");
                      }
                    }}
                  >
                    Lege map verwijderen
                  </button>
                </div>
              )}
              {note && (
                <>
                  <div className="note-meta">
                    <label>
                      Map{" "}
                      <select
                        aria-label="Map van notitie"
                        value={note.folderId ?? ""}
                        onChange={(e) =>
                          save([{ ...note, folderId: e.target.value || null }])
                        }
                      >
                        <option value="">Zonder map</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {folderPath(f)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="tags-input">
                      <Hash size={15} />
                      <input
                        aria-label="Hashtags van notitie"
                        key={note.id}
                        defaultValue={note.tags.join(", ")}
                        onBlur={(e) =>
                          save([
                            {
                              ...note,
                              tags: e.target.value
                                .split(",")
                                .map((s) => s.trim().replace(/^#/, ""))
                                .filter(Boolean),
                            },
                          ])
                        }
                        placeholder="Hashtags toevoegen"
                      />
                    </label>
                    <label className="reusable-switch">
                      <input
                        type="checkbox"
                        checked={note.reusable}
                        onChange={(e) =>
                          save([{ ...note, reusable: e.target.checked }])
                        }
                      />
                      Herbruikbaar
                    </label>
                    <select
                      aria-label="Weergave van notitie"
                      value={note.view}
                      onChange={(e) =>
                        save([
                          { ...note, view: e.target.value as Note["view"] },
                        ])
                      }
                    >
                      <option value="document">Notitieblad</option>
                      <option value="tasks">Compacte lijst</option>
                    </select>
                  </div>
                  <div className="note-actions">
                    <button
                      onClick={() => {
                        save(cloneNote(note, entities));
                        notify(
                          "Kopie gemaakt · vinkjes uit, datums verwijderd",
                        );
                      }}
                      title="Inhoud en opmaak behouden; vinkjes uit en datums verwijderd"
                    >
                      <Copy size={15} />
                      Klonen
                    </button>
                    {blocksOf(entities, note.id).some(
                      (b) => b.kind === "task" && b.done,
                    ) && (
                      <button
                        onClick={() =>
                          save(
                            blocksOf(entities, note.id)
                              .filter((b) => b.kind === "task" && b.done)
                              .map((b) => ({ ...b, done: false })),
                          )
                        }
                      >
                        <RotateCcw size={15} />
                        Alle vinkjes uitzetten
                      </button>
                    )}
                    <button
                      className="danger"
                      onClick={() => {
                        if (
                          confirm(
                            "Deze notitie en bijbehorende punten verwijderen?",
                          )
                        ) {
                          save([{ ...note, deleted: true }]);
                          go("notes");
                        }
                      }}
                    >
                      Verwijderen
                    </button>
                  </div>
                </>
              )}
              {(view === "inbox" ||
                !!note ||
                view === "reminders" ||
                view.startsWith("tag:")) && (
                <form className="quick-add" onSubmit={quickAdd}>
                  <div className="quick-main">
                    <button
                      type="submit"
                      className="quick-plus"
                      aria-label="Punt toevoegen"
                    >
                      <Plus size={20} />
                    </button>
                    <input
                      ref={quickRef}
                      aria-label="Snelle invoer"
                      value={quick}
                      onChange={(e) => setQuick(e.target.value)}
                      placeholder="Wat wil je onthouden?"
                    />
                    <button
                      className="quick-send"
                      type="submit"
                      aria-label="Opslaan"
                    >
                      ↵
                    </button>
                  </div>
                  <div className="quick-details">
                    <select
                      aria-label="Bestemming voor snelle invoer"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                    >
                      <option value="">Inbox</option>
                      {notes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>
                    <label>
                      <CalendarDays size={13} />
                      <input
                        aria-label="Datum bij snelle invoer"
                        type="datetime-local"
                        value={due}
                        onChange={(e) => setDue(e.target.value)}
                      />
                    </label>
                    <span>Enter om te bewaren</span>
                  </div>
                </form>
              )}
              {(((view === "notes" || !!folder) && !note) ||
                (view.startsWith("tag:") && !note)) && (
                <div className="note-grid">
                  {notes
                    .filter((n) =>
                      folder
                        ? n.folderId === folder.id
                        : !view.startsWith("tag:") ||
                          n.tags.includes(view.slice(4)),
                    )
                    .map((n) => {
                      const bs = blocksOf(entities, n.id);
                      return (
                        <button
                          key={n.id}
                          className="note-card"
                          onClick={() => go("notes", n.id)}
                        >
                          <div className="card-top">
                            <NotebookPen size={19} />
                            {n.reusable ? (
                              <span className="mini-label">
                                <RotateCcw size={11} />
                                Herbruikbaar
                              </span>
                            ) : (
                              <ArrowUpRight size={16} />
                            )}
                          </div>
                          <h2>{n.title || "Zonder titel"}</h2>
                          <p>
                            {bs
                              .map((b) => text(b.html))
                              .filter(Boolean)
                              .join(" · ")
                              .slice(0, 130) ||
                              "Een leeg blad voor nieuwe gedachten."}
                          </p>
                          <div className="card-footer">
                            <span>
                              {folders.find((f) => f.id === n.folderId)?.name ||
                                n.tags.map((t) => "#" + t).join(" ") ||
                                "Zonder onderwerp"}
                            </span>
                            <small>
                              {
                                bs.filter((b) => b.kind === "task" && !b.done)
                                  .length
                              }{" "}
                              open punten
                            </small>
                          </div>
                        </button>
                      );
                    })}
                  {(view === "notes" || !!folder) && (
                    <button
                      className="note-card create-card"
                      onClick={() => setNewDialog(true)}
                    >
                      <Plus size={25} />
                      <span>Begin met een leeg blad</span>
                    </button>
                  )}
                </div>
              )}
              {((view !== "notes" && !folder) || !!note) && (
                <div
                  className={`document ${note?.view === "tasks" ? "compact" : ""}`}
                >
                  {rows.length > 0 && (
                    <div className="list-heading">
                      <span>
                        {note
                          ? "OP DIT BLAD"
                          : view === "inbox"
                            ? "NOG EEN PLEK TE GEVEN"
                            : view === "archive"
                              ? "AFGERONDE PUNTEN"
                              : "JE PUNTEN"}
                      </span>
                      <small>
                        {rows.length} {rows.length === 1 ? "punt" : "punten"}
                      </small>
                    </div>
                  )}
                  {note && (
                    <div className="formatbar">
                      <button
                        aria-label="Titelopmaak"
                        onClick={() => format("heading")}
                      >
                        H1
                      </button>
                      <button
                        aria-label="Subkopopmaak"
                        onClick={() => format("subheading")}
                      >
                        H2
                      </button>
                      <button
                        aria-label="Hoofdtekst"
                        onClick={() => format("text")}
                      >
                        Aa
                      </button>
                      <i />
                      <button
                        aria-label="Vet"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          active?.editor.chain().focus().toggleBold().run()
                        }
                      >
                        <Bold size={16} />
                      </button>
                      <button
                        aria-label="Cursief"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          active?.editor.chain().focus().toggleItalic().run()
                        }
                      >
                        <Italic size={16} />
                      </button>
                      <i />
                      <button
                        aria-label="Opsomming"
                        onClick={() => format("bullet")}
                      >
                        <List size={17} />
                      </button>
                      <button
                        aria-label="Afvinklijst"
                        onClick={() => format("task")}
                      >
                        <CheckSquare size={16} />
                      </button>
                      <button
                        aria-label="Inspringen"
                        onClick={() => {
                          const b = entities.find((e) => e.id === active?.id);
                          if (b?.type === "block")
                            save([{ ...b, indent: Math.min(6, b.indent + 1) }]);
                        }}
                      >
                        <IndentIncrease size={17} />
                      </button>
                      <button
                        aria-label="Inspringing verminderen"
                        onClick={() => {
                          const b = entities.find((e) => e.id === active?.id);
                          if (b?.type === "block")
                            save([{ ...b, indent: Math.max(0, b.indent - 1) }]);
                        }}
                      >
                        <IndentDecrease size={17} />
                      </button>
                      <i />
                      <button
                        aria-label="Onderstrepen"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          active?.editor.chain().focus().toggleUnderline().run()
                        }
                      >
                        U
                      </button>
                      <button
                        aria-label="Doorhalen"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          active?.editor.chain().focus().toggleStrike().run()
                        }
                      >
                        <s>S</s>
                      </button>
                      <button
                        aria-label="Link toevoegen"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          const href = prompt(
                            "Link (https://, mailto: of tel:)",
                          );
                          if (href && /^(https?:|mailto:|tel:)/i.test(href))
                            active?.editor
                              .chain()
                              .focus()
                              .extendMarkRange("link")
                              .setLink({ href })
                              .run();
                        }}
                      >
                        Link
                      </button>
                      {active?.editor.isActive("link") && (
                        <a
                          className="toolbar-link"
                          href={active.editor.getAttributes("link").href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Link openen ↗
                        </a>
                      )}
                      <button
                        aria-label="Genummerde lijst"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          active?.editor
                            .chain()
                            .focus()
                            .toggleOrderedList()
                            .run()
                        }
                      >
                        1.
                      </button>
                      <button
                        aria-label="Citaat"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          active?.editor
                            .chain()
                            .focus()
                            .toggleBlockquote()
                            .run()
                        }
                      >
                        “”
                      </button>
                      <button
                        aria-label="Codeblok"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          active?.editor.chain().focus().toggleCodeBlock().run()
                        }
                      >
                        &lt;/&gt;
                      </button>
                      <button
                        aria-label="Tabel toevoegen"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          active?.editor
                            .chain()
                            .focus()
                            .insertTable({
                              rows: 3,
                              cols: 3,
                              withHeaderRow: true,
                            })
                            .run()
                        }
                      >
                        Tabel
                      </button>
                      {active?.editor.isActive("table") && (
                        <>
                          <button
                            aria-label="Tabelrij toevoegen"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              active.editor.chain().focus().addRowAfter().run()
                            }
                          >
                            + rij
                          </button>
                          <button
                            aria-label="Tabelkolom toevoegen"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              active.editor
                                .chain()
                                .focus()
                                .addColumnAfter()
                                .run()
                            }
                          >
                            + kolom
                          </button>
                          <button
                            aria-label="Tabelrij verwijderen"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              active.editor.chain().focus().deleteRow().run()
                            }
                          >
                            − rij
                          </button>
                          <button
                            aria-label="Tabelkolom verwijderen"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              active.editor.chain().focus().deleteColumn().run()
                            }
                          >
                            − kolom
                          </button>
                        </>
                      )}
                      <i />
                      <label
                        className="toolbar-file"
                        title="Afbeelding of PDF toevoegen"
                      >
                        <ImagePlus size={17} />
                        <input
                          aria-label="Afbeelding aan notitie toevoegen"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void attach(f);
                          }}
                        />
                      </label>
                    </div>
                  )}
                  {rows.slice(0, rowLimit).map((b) => (
                    <div key={b.id} className="point-container">
                      {!note && b.noteId && (
                        <button
                          className="point-source"
                          onClick={() => go("notes", b.noteId)}
                        >
                          <NotebookPen size={12} />
                          {notes.find((n) => n.id === b.noteId)?.title}
                        </button>
                      )}
                      <BlockRow
                        block={b}
                        entities={entities}
                        notes={notes}
                        focus={focusId === b.id}
                        onFocus={(editor, b) => setActive({ editor, id: b.id })}
                        onEnter={enter}
                        onError={report}
                      />
                    </div>
                  ))}
                  {rows.length > rowLimit && (
                    <button
                      className="settings-action"
                      onClick={() => setRowLimit((v) => v + 100)}
                    >
                      Meer punten tonen ({rows.length - rowLimit})
                    </button>
                  )}
                  {!rows.length && (view !== "notes" || note) && (
                    <div className="empty">
                      <span className="empty-icon">
                        {view === "archive" ? (
                          <Archive size={25} />
                        ) : view === "reminders" ? (
                          <CalendarDays size={25} />
                        ) : (
                          <Inbox size={25} />
                        )}
                      </span>
                      <h2>
                        {view === "archive"
                          ? "Nog niets afgerond"
                          : view === "reminders"
                            ? "Alles op zijn tijd"
                            : note
                              ? "Een nieuw begin"
                              : "Een beetje ruimte in je hoofd"}
                      </h2>
                      <p>
                        {view === "archive"
                          ? "Afgevinkte eenmalige punten blijven hier bewaard."
                          : note
                            ? "Begin met schrijven of voeg een punt toe."
                            : "Voeg hierboven iets toe dat je wilt onthouden."}
                      </p>
                    </div>
                  )}
                  {note && (
                    <button
                      className="add-line"
                      onClick={() => {
                        const b = newBlock(note.id, "", "text");
                        save([b]);
                        setFocus(b.id);
                      }}
                    >
                      <Plus size={16} />
                      Een regel toevoegen
                    </button>
                  )}
                </div>
              )}
              {view.startsWith("tag:") && (
                <div className="tag-management">
                  <button
                    className="text-button"
                    onClick={() => {
                      const original = view.slice(4);
                      const name = prompt("Nieuwe naam voor hashtag", original)
                        ?.trim()
                        .replace(/^#/, "");
                      if (!name || name === original) return;
                      save(
                        alive
                          .filter((e) =>
                            e.type === "tag"
                              ? e.name === original
                              : e.tags.includes(original),
                          )
                          .map((e) =>
                            e.type === "tag"
                              ? { ...e, name }
                              : {
                                  ...e,
                                  tags: [
                                    ...new Set(
                                      e.tags.map((t) =>
                                        t === original ? name : t,
                                      ),
                                    ),
                                  ],
                                },
                          ),
                      );
                      go("tag:" + name);
                    }}
                  >
                    Onderwerp hernoemen
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => {
                      const original = view.slice(4);
                      if (
                        !confirm(
                          "Hashtag verwijderen? De inhoud blijft bewaard.",
                        )
                      )
                        return;
                      save(
                        alive
                          .filter((e) =>
                            e.type === "tag"
                              ? e.name === original
                              : e.tags.includes(original),
                          )
                          .map((e) =>
                            e.type === "tag"
                              ? { ...e, deleted: true }
                              : {
                                  ...e,
                                  tags: e.tags.filter((t) => t !== original),
                                },
                          ),
                      );
                      go("inbox");
                    }}
                  >
                    Onderwerp verwijderen
                  </button>
                </div>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <img src="/brain.svg" alt="" />
            <span>Hier bewaard. Uit je hoofd.</span>
            <small>
              {s.lastSync
                ? "Lokaal beschikbaar op dit apparaat"
                : "Wijzigingen worden lokaal bewaard"}
            </small>
          </footer>
        </div>
      </main>
      {newDialog && (
        <div className="modal-backdrop" onClick={() => setNewDialog(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-modal icon-button"
              aria-label="Sluiten"
              onClick={() => setNewDialog(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">EEN NIEUW BEGIN</span>
            <h2 id="new-title">Een plek voor je ideeën.</h2>
            <form onSubmit={create}>
              <label>
                Titel
                <input
                  autoFocus
                  aria-label="Titel van nieuwe notitie"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Waar wil je ruimte voor maken?"
                />
              </label>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={isReusable}
                  onChange={(e) => setReusable(e.target.checked)}
                />
                <span>
                  Herbruikbaar
                  <small>
                    Afgevinkte punten blijven staan. Handig voor terugkerende
                    lijsten.
                  </small>
                </span>
              </label>
              <button type="submit" className="primary">
                Notitie maken
                <Plus size={17} />
              </button>
            </form>
          </section>
        </div>
      )}
      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <section
            className="modal settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-modal icon-button"
              aria-label="Sluiten"
              onClick={() => setSettings(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">JOUW WERKRUIMTE</span>
            <h2 id="settings-title">Instellingen</h2>
            <p>
              {s.pending.length} lokale wijzigingen in de wachtrij ·{" "}
              {s.conflicts.length} verschillen
            </p>
            <Imports onError={report} onNotice={notify} />
            <button className="settings-action" onClick={() => void download()}>
              <Download size={18} />
              <span>
                Alles beschikbaar maken voor offline
                <small>
                  Download gegevens en afbeeldingen op dit apparaat.
                </small>
              </span>
            </button>
            <button
              className="settings-action"
              onClick={() => void exportLocal()}
            >
              <Archive size={18} />
              <span>
                Een kopie exporteren
                <small>Inclusief lokale wijzigingen en afbeeldingen.</small>
              </span>
            </button>
            <button
              className="settings-action"
              onClick={() => void notifications()}
            >
              <Bell size={18} />
              <span>
                Herinneringsmeldingen inschakelen
                <small>Tik om toestemming te geven voor meldingen.</small>
              </span>
            </button>
            <button
              className="settings-action"
              onClick={() => {
                setUsername(s.account?.username ?? "");
                setLogin(true);
                setSettings(false);
              }}
            >
              <RefreshCw size={18} />
              <span>
                Opnieuw inloggen
                <small>Lokale wijzigingen blijven bewaard.</small>
              </span>
            </button>
            <button className="settings-action" onClick={() => void logout()}>
              <LogOut size={18} />
              <span>
                Uitloggen
                <small>
                  Verwijdert gesynchroniseerde gegevens van dit apparaat.
                </small>
              </span>
            </button>
            <button
              className="danger text-button"
              onClick={() => {
                if (
                  confirm(
                    "Wis alle lokale gegevens op dit apparaat, inclusief niet-gesynchroniseerde wijzigingen? Exporteer ze eerst als je ze wilt bewaren.",
                  )
                )
                  void releaseNotifications()
                    .then(() =>
                      store.accountFetch("/api/logout", { method: "POST" }),
                    )
                    .finally(() => store.clearLocal())
                    .then(() => setSettings(false));
              }}
            >
              Lokale opslag wissen
            </button>
            <div className="settings-note">
              Offline gegevens blijven in deze browser bewaard. Gebruik een
              vertrouwd apparaat. Het archief bewaart afgeronde eenmalige
              punten; klonen zet vinkjes uit en verwijdert datums.
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
