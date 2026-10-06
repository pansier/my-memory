import { openDB } from "idb";
import {
  type Entity,
  type Mutation,
  type Block,
  now,
} from "../../shared/model";
export type Conflict = { id: string; local: Entity; remote: Entity | null };
export type Snapshot = {
  entities: Entity[];
  pending: (Mutation & { dispatched?: boolean })[];
  conflicts: Conflict[];
  lastSync: string | null;
  authenticated: boolean;
};
const blank = (): Snapshot => ({
  entities: [],
  pending: [],
  conflicts: [],
  lastSync: null,
  authenticated: false,
});
const db = openDB("my-memory-v1", 1, {
  upgrade(db) {
    db.createObjectStore("state");
    db.createObjectStore("images");
  },
});
export let snapshot: Snapshot = blank();
let listeners = new Set<() => void>();
let syncing = false;
export let syncStatus = "Laden…";
const uploadedImages = new Set<string>();
const channel = new BroadcastChannel("memory");
channel.onmessage = () => {
  void read();
};
async function lock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (navigator.locks) return navigator.locks.request(name, fn);
  return fn();
}
async function read() {
  snapshot = (await (await db).get("state", "owner")) ?? blank();
  listeners.forEach((fn) => fn());
}
export async function init() {
  await read();
  if (snapshot.authenticated) void sync();
}
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
async function write(fn: (s: Snapshot) => void) {
  await lock("memory-write", async () => {
    const s: Snapshot = (await (await db).get("state", "owner")) ?? blank();
    fn(s);
    await (await db).put("state", s, "owner");
    snapshot = s;
    listeners.forEach((f) => f());
    channel.postMessage("changed");
  });
}
export async function setAuthenticated(value: boolean) {
  await write((s) => {
    s.authenticated = value;
  });
  if (value) void sync();
}
export async function change(entities: Entity[]) {
  await write((s) => {
    for (const entity of entities) {
      const current = s.entities.find((e) => e.id === entity.id);
      const updated = { ...entity, updatedAt: now() };
      s.entities = s.entities.filter((e) => e.id !== entity.id).concat(updated);
      const conflict = s.conflicts.find((c) => c.id === entity.id);
      if (conflict) {
        conflict.local = updated;
        continue;
      }
      const pending = s.pending.filter((p) => p.entity.id === entity.id);
      const last = pending.at(-1);
      if (last && !last.dispatched) {
        s.pending = s.pending.filter((p) => p.opId !== last.opId);
        s.pending.push({
          opId: crypto.randomUUID(),
          baseVersion: last.baseVersion,
          entity: updated,
        });
      } else
        s.pending.push({
          opId: crypto.randomUUID(),
          baseVersion: (current?.version ?? 0) + pending.length,
          entity: updated,
        });
    }
  });
  syncStatus = navigator.onLine ? "Lokaal bewaard" : "Offline · lokaal bewaard";
  listeners.forEach((f) => f());
  void sync();
}
export async function resolveConflict(
  id: string,
  choice: "local" | "remote" | "both",
) {
  await write((s) => {
    const c = s.conflicts.find((c) => c.id === id);
    if (!c) return;
    s.conflicts = s.conflicts.filter((c) => c.id !== id);
    if (choice === "remote") {
      s.entities = s.entities
        .filter((e) => e.id !== id)
        .concat(c.remote ? [c.remote] : []);
      return;
    }
    if (choice === "both") {
      s.entities = s.entities
        .filter((e) => e.id !== id)
        .concat(c.remote ? [c.remote] : []);
      const copy = {
        ...c.local,
        id: crypto.randomUUID(),
        version: 0,
        deleted: false,
      };
      if (
        copy.type === "block" &&
        copy.noteId &&
        s.entities.find((e) => e.id === copy.noteId)?.deleted
      )
        copy.noteId = null;
      if (copy.type === "note") {
        copy.title += " (lokale kopie)";
        const children = s.entities.filter(
          (e): e is Block =>
            e.type === "block" && e.noteId === id && !e.deleted,
        );
        for (const child of children) {
          const b = {
            ...child,
            id: crypto.randomUUID(),
            version: 0,
            noteId: copy.id,
            done: false,
            dueAt: null,
          };
          s.entities.push(b);
          s.pending.push({
            opId: crypto.randomUUID(),
            baseVersion: 0,
            entity: b,
          });
        }
      }
      s.entities.push(copy);
      s.pending.push({
        opId: crypto.randomUUID(),
        baseVersion: 0,
        entity: copy,
      });
      return;
    }
    if (c.remote?.deleted)
      throw new Error("Dit item is elders verwijderd. Bewaar een kopie.");
    const local = { ...c.local, version: c.remote?.version ?? 0 };
    s.entities = s.entities.filter((e) => e.id !== id).concat(local);
    s.pending.push({
      opId: crypto.randomUUID(),
      baseVersion: local.version,
      entity: local,
    });
  });
  void sync();
}
export async function imageBlob(id: string): Promise<Blob | undefined> {
  return (await db).get("images", id);
}
export async function addImage(file: File): Promise<string> {
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
      file.type,
    ) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("Kies een PNG, JPEG, WebP of GIF van maximaal 10 MB.");
  const id = crypto.randomUUID();
  await (await db).put("images", file, id);
  return id;
}
export async function offlineDownload() {
  await sync();
  for (const e of snapshot.entities)
    if (e.type === "block" && !e.deleted)
      for (const id of e.imageIds) await cacheImage(id);
  if (navigator.storage?.persist) await navigator.storage.persist();
}
export async function cacheImage(id: string) {
  const local = await imageBlob(id);
  if (local) return local;
  const res = await fetch("/api/images/" + id);
  if (!res.ok) throw new Error("Afbeelding kon niet worden gedownload.");
  const blob = await res.blob();
  await (await db).put("images", blob, id);
  window.dispatchEvent(new Event("memory-images"));
  return blob;
}
export async function sync() {
  if (syncing || !snapshot.authenticated) return;
  if (!navigator.onLine) {
    syncStatus = "Offline · lokaal bewaard";
    listeners.forEach((f) => f());
    return;
  }
  syncing = true;
  syncStatus = "Synchroniseren…";
  listeners.forEach((f) => f());
  try {
    await lock("memory-sync", async () => {
      await read();
      let iterations = 0;
      do {
        let sent: Mutation[] = [];
        // Freeze the batch under the same lock as local edits. A dispatched
        // operation can be retried, but its ID and contents can never change.
        await write((s) => {
          const first = new Map<string, Mutation>();
          for (const p of s.pending)
            if (
              !first.has(p.entity.id) &&
              !s.conflicts.some((c) => c.id === p.entity.id)
            )
              first.set(p.entity.id, p);
          let bytes = 0;
          sent = [...first.values()]
            .sort(
              (a, b) =>
                (a.entity.type === "note" ? (a.entity.deleted ? 2 : 0) : 1) -
                (b.entity.type === "note" ? (b.entity.deleted ? 2 : 0) : 1),
            )
            .slice(0, 100)
            .filter((m) => {
              const size = new TextEncoder().encode(JSON.stringify(m)).length;
              if (bytes + size > 1500000) return false;
              bytes += size;
              return true;
            });
          for (const m of sent) {
            const queued = s.pending.find((p) => p.opId === m.opId);
            if (queued) queued.dispatched = true;
          }
        });
        for (const m of sent)
          if (m.entity.type === "block")
            for (const id of m.entity.imageIds) {
              const blob = await imageBlob(id);
              if (blob && !uploadedImages.has(id)) {
                const res = await fetch("/api/images/" + id, {
                  method: "PUT",
                  body: blob,
                });
                if (!res.ok) throw new Error("Upload van afbeelding mislukt.");
                uploadedImages.add(id);
              }
            }
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mutations: sent.map(({ opId, baseVersion, entity }) => ({
              opId,
              baseVersion,
              entity,
            })),
          }),
        });
        if (res.status === 401) {
          syncStatus = "Log opnieuw in om te synchroniseren";
          throw new Error(
            "Je sessie is verlopen. Log opnieuw in; lokale wijzigingen blijven bewaard.",
          );
        }
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error ?? "Synchronisatie mislukt.");
        }
        const result = (await res.json()) as {
          entities: Entity[];
          results: (
            | { opId: string; status: "ok"; entity: Entity }
            | { opId: string; status: "conflict"; remote: Entity | null }
          )[];
        };
        await write((s) => {
          for (const r of result.results) {
            const pending = s.pending.find((p) => p.opId === r.opId);
            if (!pending) continue;
            const id = pending.entity.id;
            if (r.status === "conflict") {
              s.conflicts.push({
                id,
                local: s.entities.find((e) => e.id === id)!,
                remote: r.remote,
              });
              s.pending = s.pending.filter((p) => p.entity.id !== id);
            } else {
              s.pending = s.pending.filter((p) => p.opId !== r.opId);
              const local = s.entities.find((e) => e.id === id);
              if (local) local.version = r.entity.version;
            }
          }
          const protectedIds = new Set([
            ...s.pending.map((p) => p.entity.id),
            ...s.conflicts.map((c) => c.id),
          ]);
          for (const remote of result.entities)
            if (!protectedIds.has(remote.id))
              s.entities = s.entities
                .filter((e) => e.id !== remote.id)
                .concat(remote);
          s.lastSync = now();
        });
        if (!snapshot.pending.length) break;
      } while (++iterations < 100);
    });
    syncStatus = snapshot.conflicts.length
      ? "Wijzigingen vergelijken"
      : snapshot.pending.length
        ? "Lokaal bewaard"
        : "Gesynchroniseerd";
  } catch (e) {
    syncStatus =
      e instanceof TypeError
        ? "Verbinding ontbreekt · lokaal bewaard"
        : e instanceof Error
          ? e.message
          : "Synchronisatie mislukt";
  } finally {
    syncing = false;
    listeners.forEach((f) => f());
  }
}
export async function exportData() {
  const images: Record<string, string> = {};
  for (const e of snapshot.entities)
    if (e.type === "block")
      for (const id of e.imageIds) {
        const b = await imageBlob(id);
        if (b)
          images[id] = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(b);
          });
      }
  return JSON.stringify(
    { format: "my-memory-v1", exportedAt: now(), ...snapshot, images },
    null,
    2,
  );
}
export async function clearLocal() {
  await lock("memory-sync", async () => {
    await lock("memory-write", async () => {
      const d = await db;
      await d.clear("state");
      await d.clear("images");
    });
  });
  uploadedImages.clear();
  snapshot = blank();
  channel.postMessage("changed");
  listeners.forEach((f) => f());
}
window.addEventListener("online", () => {
  void sync();
});
window.addEventListener("offline", () => {
  syncStatus = "Offline · lokaal bewaard";
  listeners.forEach((f) => f());
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void sync();
});
setInterval(() => {
  if (
    !document.hidden &&
    (snapshot.pending.length ||
      !snapshot.lastSync ||
      Date.now() - Date.parse(snapshot.lastSync) >= 30000)
  )
    void sync();
}, 5000);
